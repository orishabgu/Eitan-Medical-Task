import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { HeartRateReading } from '../heart-rate/heart-rate-reading.entity';
import { Patient } from '../patients/patient.entity';
import { PatientRequestCounter } from '../request-tracking/patient-request-counter.entity';

loadEnv();

export const dataSourceOptions = {
  type: 'postgres' as const,
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'eitan_medical',
  entities: [Patient, HeartRateReading, PatientRequestCounter],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
