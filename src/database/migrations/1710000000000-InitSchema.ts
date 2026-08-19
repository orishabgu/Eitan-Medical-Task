import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1710000000000 implements MigrationInterface {
  name = 'InitSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      CREATE TABLE patients (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        age         INT CHECK (age >= 0 AND age < 150),
        gender      TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE heart_rate_readings (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        "timestamp" TIMESTAMPTZ NOT NULL,
        heart_rate  INT NOT NULL CHECK (heart_rate > 0 AND heart_rate < 300),
        CONSTRAINT uq_reading_patient_timestamp UNIQUE (patient_id, "timestamp")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_hrr_patient_time
        ON heart_rate_readings (patient_id, "timestamp" DESC)
    `);

    // Partial index: only high readings are indexed, keeping the high-events query cheap
    // and the index small. Usable only when the predicate matches the default threshold;
    // a custom ?threshold= falls back to idx_hrr_patient_time. See DESIGN.md.
    await queryRunner.query(`
      CREATE INDEX idx_hrr_high
        ON heart_rate_readings ("timestamp" DESC, patient_id)
        WHERE heart_rate > 100
    `);

    await queryRunner.query(`
      CREATE TABLE patient_request_counters (
        patient_id     TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
        request_count  BIGINT NOT NULL DEFAULT 0,
        last_requested TIMESTAMPTZ
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS patient_request_counters`);
    await queryRunner.query(`DROP TABLE IF EXISTS heart_rate_readings`);
    await queryRunner.query(`DROP TABLE IF EXISTS patients`);
  }
}
