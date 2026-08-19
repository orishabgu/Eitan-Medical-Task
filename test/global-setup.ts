import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/database/data-source';
import { seed } from '../src/database/seed';

loadEnv();

export const TEST_DATABASE = process.env.TEST_DATABASE_NAME ?? 'eitan_medical_test';

async function createDatabaseIfMissing(): Promise<void> {
  const admin = new Client({
    host: dataSourceOptions.host,
    port: dataSourceOptions.port,
    user: dataSourceOptions.username,
    password: dataSourceOptions.password,
    database: 'postgres',
  });

  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DATABASE,
    ]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    }
  } finally {
    await admin.end();
  }
}

export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_NAME = TEST_DATABASE;
  process.env.HIGH_HEART_RATE_THRESHOLD = '100';
  process.env.NODE_ENV = 'test';
  // The suite deliberately fires bursts of requests from one address; rate limiting is
  // covered by its own case rather than by throttling every other test.
  process.env.RATE_LIMIT_REQUESTS = '100000';

  await createDatabaseIfMissing();

  const dataSource = new DataSource({ ...dataSourceOptions, database: TEST_DATABASE });
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    await dataSource.query('TRUNCATE patients, heart_rate_readings, patient_request_counters');
    await seed(dataSource);
  } finally {
    await dataSource.destroy();
  }
}
