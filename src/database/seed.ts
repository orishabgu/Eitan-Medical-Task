import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { HeartRateReading } from '../heart-rate/heart-rate-reading.entity';
import { Patient } from '../patients/patient.entity';
import dataSource from './data-source';

interface SeedFile {
  patients: { id: string; name: string; age: number; gender: string }[];
  heartRateReadings: { patientId: string; timestamp: string; heartRate: number }[];
}

const SEED_FILE = process.env.SEED_FILE ?? join(process.cwd(), 'data', 'patients.json');

export async function seed(source: DataSource, seedFilePath = SEED_FILE): Promise<void> {
  const { patients, heartRateReadings } = JSON.parse(
    readFileSync(seedFilePath, 'utf-8'),
  ) as SeedFile;

  await source.transaction(async (manager) => {
    await manager.createQueryBuilder().insert().into(Patient).values(patients).orIgnore().execute();

    await manager
      .createQueryBuilder()
      .insert()
      .into(HeartRateReading)
      .values(
        heartRateReadings.map((reading) => ({
          patientId: reading.patientId,
          timestamp: new Date(reading.timestamp),
          heartRate: reading.heartRate,
        })),
      )
      .orIgnore()
      .execute();
  });
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
