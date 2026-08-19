import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { API_KEY_HEADER } from '../src/common/api-key.guard';
import { SCALE_ID_PREFIX, generateScaleData } from '../src/database/scale-seed';
import { insertSeedData } from '../src/database/seed';
import { createTestApp } from './create-app';
import { TEST_API_KEY } from './global-setup';

const API = '/api/v1';
const THRESHOLD = 100;

const PATIENTS = 20;
const READINGS_PER_PATIENT = 300;
const WINDOW_START = '2024-06-01T00:00:00Z';
// Exactly MAX_RANGE_DAYS after the start, so this also covers the widest allowed range.
const WINDOW_END = '2024-07-01T00:00:00Z';

// The generator is deterministic, so expectations are computed from the same rows the
// database was filled with instead of being copied in by hand.
const data = generateScaleData({
  patients: PATIENTS,
  readingsPerPatient: READINGS_PER_PATIENT,
  days: 30,
  startedAt: new Date(WINDOW_START),
});

const readingsFor = (patientId: string) =>
  data.heartRateReadings.filter((reading) => reading.patientId === patientId);

describe('Scale (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set(API_KEY_HEADER, TEST_API_KEY);

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await insertSeedData(dataSource, data);
  });

  afterAll(async () => {
    // Leaves the shared test database as the other spec expects to find it.
    await dataSource.query('DELETE FROM patients WHERE id LIKE $1', [`${SCALE_ID_PREFIX}%`]);
    await app.close();
  });

  it('loads the generated dataset', async () => {
    const rows = await dataSource.query<{ count: string }[]>(
      'SELECT COUNT(*) AS count FROM heart_rate_readings WHERE patient_id LIKE $1',
      [`${SCALE_ID_PREFIX}%`],
    );

    expect(Number(rows[0].count)).toBe(PATIENTS * READINGS_PER_PATIENT);
  });

  it('aggregates in SQL the same way an independent pass over the rows does', async () => {
    const patientId = `${SCALE_ID_PREFIX}7`;
    const rates = readingsFor(patientId).map((reading) => reading.heartRate);
    const expectedAverage = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;

    const response = await get(
      `${API}/patients/${patientId}/heart-rate/analytics?from=${WINDOW_START}&to=${WINDOW_END}`,
    ).expect(200);

    expect(response.body.data).toMatchObject({
      count: rates.length,
      min: Math.min(...rates),
      max: Math.max(...rates),
      average: Math.round(expectedAverage * 10) / 10,
    });
  });

  it('counts high events across every patient', async () => {
    const expected = data.heartRateReadings.filter(
      (reading) => reading.heartRate > THRESHOLD,
    ).length;

    const response = await get(
      `${API}/heart-rate/high-events?from=${WINDOW_START}&to=${WINDOW_END}&limit=1`,
    ).expect(200);

    expect(response.body.data.total).toBe(expected);
  });

  it('pages through a large result set without gaps, repeats or reordering', async () => {
    const patientId = `${SCALE_ID_PREFIX}3`;
    const expected = readingsFor(patientId).filter(
      (reading) => reading.heartRate > THRESHOLD,
    ).length;

    const limit = 100;
    const seen: { timestamp: string; heartRate: number }[] = [];

    for (let page = 1; ; page++) {
      const response = await get(
        `${API}/patients/${patientId}/heart-rate/high-events?limit=${limit}&page=${page}`,
      ).expect(200);

      const items = response.body.data.items as { timestamp: string; heartRate: number }[];
      expect(response.body.data.total).toBe(expected);
      seen.push(...items);

      if (items.length < limit) {
        break;
      }
    }

    expect(seen).toHaveLength(expected);
    expect(new Set(seen.map((item) => item.timestamp)).size).toBe(expected);
    expect(seen.every((item) => item.heartRate > THRESHOLD)).toBe(true);

    const timestamps = seen.map((item) => Date.parse(item.timestamp));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('keeps ordering stable when many patients share the same instant', async () => {
    const query = `${API}/heart-rate/high-events?from=${WINDOW_START}&to=${WINDOW_END}&limit=50`;

    const first = await get(query).expect(200);
    const second = await get(query).expect(200);

    expect(first.body.data.items).toEqual(second.body.data.items);
  });

  it('lists patients a page at a time', async () => {
    const response = await get(`${API}/patients?limit=10&page=2`).expect(200);

    expect(response.body.data.items).toHaveLength(10);
    expect(response.body.data.total).toBeGreaterThanOrEqual(PATIENTS);
  });
});
