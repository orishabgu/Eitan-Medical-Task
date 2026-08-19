import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { useContainer } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { API_KEY_HEADER } from '../src/common/api-key.guard';
import { TEST_API_KEY } from './global-setup';

const API = '/api/v1';

describe('Patient heart-rate API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set(API_KEY_HEADER, TEST_API_KEY);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    // Listening for real, so concurrent requests share one server instead of racing to
    // open ephemeral listeners.
    await app.listen(0);

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE patient_request_counters');
  });

  describe('authentication', () => {
    it('rejects a request with no API key', async () => {
      const response = await request(app.getHttpServer()).get(`${API}/patients`);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects a request with the wrong API key', async () => {
      await request(app.getHttpServer())
        .get(`${API}/patients`)
        .set(API_KEY_HEADER, 'wrong')
        .expect(401);
    });

    it('leaves health checks open', async () => {
      await request(app.getHttpServer()).get(`${API}/health/live`).expect(200);
    });
  });

  describe('GET /heart-rate/high-events', () => {
    it('returns only readings above 100 bpm, newest first', async () => {
      const response = await get(`${API}/heart-rate/high-events`).expect(200);

      expect(response.body.data.total).toBe(2);
      expect(response.body.data.items).toEqual([
        expect.objectContaining({ patientId: '2', heartRate: 105 }),
        expect.objectContaining({ patientId: '1', heartRate: 101 }),
      ]);
    });

    it('includes the timestamp of each event', async () => {
      const response = await get(`${API}/heart-rate/high-events`).expect(200);

      expect(response.body.data.items[1].timestamp).toBe('2024-03-01T10:30:00.000Z');
    });

    it('excludes a reading that sits exactly on the threshold', async () => {
      const response = await get(`${API}/heart-rate/high-events?threshold=105`).expect(200);

      expect(response.body.data.items).toHaveLength(0);
    });

    it('includes a reading one bpm above the threshold', async () => {
      const response = await get(`${API}/heart-rate/high-events?threshold=104`).expect(200);

      expect(response.body.data.items).toHaveLength(1);
    });

    it('narrows results by time range', async () => {
      const response = await get(
        `${API}/heart-rate/high-events?from=2024-03-02T00:00:00Z&to=2024-03-02T23:59:59Z`,
      ).expect(200);

      expect(response.body.data.items).toEqual([
        expect.objectContaining({ patientId: '2', heartRate: 105 }),
      ]);
    });

    it('scopes to a single patient', async () => {
      const response = await get(`${API}/patients/1/heart-rate/high-events`).expect(200);

      expect(response.body.data.items).toEqual([
        expect.objectContaining({ patientId: '1', heartRate: 101 }),
      ]);
    });

    it('returns an empty page with the real total when paging past the end', async () => {
      const response = await get(`${API}/heart-rate/high-events?page=999`).expect(200);

      expect(response.body.data).toMatchObject({ items: [], total: 2, page: 999 });
    });

    it('404s for an unknown patient', async () => {
      await get(`${API}/patients/does-not-exist/heart-rate/high-events`).expect(404);
    });

    it.each([
      ['a non-numeric threshold', 'threshold=abc'],
      ['a threshold above the valid range', 'threshold=500'],
      ['a page below one', 'page=0'],
      ['a limit above the cap', 'limit=101'],
      ['an unknown query parameter', 'nonsense=1'],
    ])('400s for %s', async (_label, query) => {
      await get(`${API}/heart-rate/high-events?${query}`).expect(400);
    });
  });

  describe('GET /patients/:id/heart-rate/analytics', () => {
    it('computes average, min and max over the full history', async () => {
      const response = await get(`${API}/patients/1/heart-rate/analytics`).expect(200);

      expect(response.body.data).toMatchObject({
        patientId: '1',
        count: 3,
        average: 94.3,
        min: 85,
        max: 101,
      });
    });

    it('restricts the aggregate to the requested range', async () => {
      const response = await get(
        `${API}/patients/1/heart-rate/analytics?from=2024-03-01T09:00:00Z&to=2024-03-01T12:00:00Z`,
      ).expect(200);

      expect(response.body.data).toMatchObject({ count: 1, average: 101, min: 101, max: 101 });
    });

    it('treats both range bounds as inclusive', async () => {
      const response = await get(
        `${API}/patients/1/heart-rate/analytics?from=2024-03-01T08:00:00Z&to=2024-03-01T13:45:00Z`,
      ).expect(200);

      expect(response.body.data.count).toBe(3);
    });

    it('gives the same answer for an offset timestamp as for its UTC equivalent', async () => {
      const utc = await get(
        `${API}/patients/1/heart-rate/analytics?from=2024-03-01T10:00:00Z`,
      ).expect(200);
      const offset = await get(
        `${API}/patients/1/heart-rate/analytics?from=2024-03-01T13:00:00%2B03:00`,
      ).expect(200);

      expect(offset.body.data.count).toBe(utc.body.data.count);
    });

    it('returns nulls rather than a 404 when the range holds no readings', async () => {
      const response = await get(
        `${API}/patients/1/heart-rate/analytics?from=2030-01-01T00:00:00Z`,
      ).expect(200);

      expect(response.body.data).toMatchObject({
        count: 0,
        average: null,
        min: null,
        max: null,
      });
    });

    it('404s for an unknown patient', async () => {
      const response = await get(`${API}/patients/missing/heart-rate/analytics`).expect(404);

      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('400s when the range ends before it starts', async () => {
      const response = await get(
        `${API}/patients/1/heart-rate/analytics?from=2024-03-02T00:00:00Z&to=2024-03-01T00:00:00Z`,
      ).expect(400);

      expect(JSON.stringify(response.body.message)).toContain('at or after');
    });

    it('400s for a timestamp that is not ISO-8601', async () => {
      await get(`${API}/patients/1/heart-rate/analytics?from=not-a-date`).expect(400);
    });

    it('400s for a range wider than the allowed window', async () => {
      const response = await get(
        `${API}/patients/1/heart-rate/analytics?from=2024-01-01T00:00:00Z&to=2025-01-01T00:00:00Z`,
      ).expect(400);

      expect(JSON.stringify(response.body.message)).toContain('30 days');
    });
  });

  describe('request tracking', () => {
    // The counter is written after the response is sent, so poll briefly rather than
    // slowing every read down with an awaited write.
    const countFor = async (patientId: string, expected: number): Promise<number> => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const response = await get(`${API}/patients/${patientId}/request-stats`);
        if (response.body.data.requestCount === expected) {
          return expected;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const final = await get(`${API}/patients/${patientId}/request-stats`);
      return final.body.data.requestCount;
    };

    it('counts each successful patient read', async () => {
      await get(`${API}/patients/1`).expect(200);
      await get(`${API}/patients/1`).expect(200);
      await get(`${API}/patients/1`).expect(200);

      expect(await countFor('1', 3)).toBe(3);
    });

    it('counts analytics and high-event reads for the patient too', async () => {
      await get(`${API}/patients/2/heart-rate/analytics`).expect(200);
      await get(`${API}/patients/2/heart-rate/high-events`).expect(200);

      expect(await countFor('2', 2)).toBe(2);
    });

    it('reports zero for a patient that has never been requested', async () => {
      const response = await get(`${API}/patients/1/request-stats`).expect(200);

      expect(response.body.data).toMatchObject({ requestCount: 0, lastRequested: null });
    });

    it('does not count a request for an unknown patient', async () => {
      await get(`${API}/patients/missing`).expect(404);

      const response = await get(`${API}/request-stats`).expect(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('does not count reading the counter itself', async () => {
      await get(`${API}/patients/1`).expect(200);
      await countFor('1', 1);

      await get(`${API}/patients/1/request-stats`).expect(200);
      await get(`${API}/patients/1/request-stats`).expect(200);

      expect(await countFor('1', 1)).toBe(1);
    });

    it('loses no increments under concurrent reads', async () => {
      const concurrency = 25;
      await Promise.all(
        Array.from({ length: concurrency }, () => get(`${API}/patients/1`).expect(200)),
      );

      expect(await countFor('1', concurrency)).toBe(concurrency);
    });

    it('404s for stats on an unknown patient', async () => {
      await get(`${API}/patients/missing/request-stats`).expect(404);
    });

    it('lists all counters, most requested first', async () => {
      await get(`${API}/patients/2`).expect(200);
      await get(`${API}/patients/2`).expect(200);
      await get(`${API}/patients/1`).expect(200);
      await countFor('2', 2);
      await countFor('1', 1);

      const response = await get(`${API}/request-stats`).expect(200);

      expect(response.body.data.map((row: { patientId: string }) => row.patientId)).toEqual([
        '2',
        '1',
      ]);
    });
  });

  describe('errors and envelope', () => {
    it('wraps successful responses with request metadata', async () => {
      const response = await get(`${API}/patients`).expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.meta).toHaveProperty('timestamp');
    });

    it('404s an unknown route in the same error shape', async () => {
      const response = await get(`${API}/nope`).expect(404);

      expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(response.body).toHaveProperty('path');
    });

    it('400s a blank patient id', async () => {
      await get(`${API}/patients/%20%20`).expect(400);
    });

    it('400s a patient id beyond the allowed length', async () => {
      await get(`${API}/patients/${'x'.repeat(65)}`).expect(400);
    });
  });

  describe('health', () => {
    it('reports the database as reachable', async () => {
      const response = await request(app.getHttpServer()).get(`${API}/health/ready`).expect(200);

      expect(response.body.data.status).toBe('ok');
    });
  });
});
