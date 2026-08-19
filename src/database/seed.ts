import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { HeartRateReading } from '../heart-rate/heart-rate-reading.entity';
import { Patient } from '../patients/patient.entity';
import dataSource from './data-source';

export interface SeedData {
  patients: { id: string; name: string; age: number; gender: string }[];
  heartRateReadings: { patientId: string; timestamp: string; heartRate: number }[];
}

const SEED_FILE = process.env.SEED_FILE ?? join(process.cwd(), 'data', 'patients.json');

// Postgres allows at most 65535 parameters per statement, and a reading costs three, so
// large seeds have to go in batches rather than one insert.
const ROWS_PER_INSERT = 5_000;

function chunk<T>(rows: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

export async function insertSeedData(source: DataSource, data: SeedData): Promise<void> {
  await source.transaction(async (manager) => {
    for (const batch of chunk(data.patients, ROWS_PER_INSERT)) {
      await manager.createQueryBuilder().insert().into(Patient).values(batch).orIgnore().execute();
    }

    for (const batch of chunk(data.heartRateReadings, ROWS_PER_INSERT)) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(HeartRateReading)
        .values(
          batch.map((reading) => ({
            patientId: reading.patientId,
            timestamp: new Date(reading.timestamp),
            heartRate: reading.heartRate,
          })),
        )
        .orIgnore()
        .execute();
    }
  });
}

export async function seed(source: DataSource, seedFilePath = SEED_FILE): Promise<void> {
  const data = JSON.parse(readFileSync(seedFilePath, 'utf-8')) as SeedData;
  await insertSeedData(source, data);
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await seed(dataSource);
    console.log(`Seeded from ${SEED_FILE}`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  });
}
