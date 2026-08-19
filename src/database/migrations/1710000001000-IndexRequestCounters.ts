import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexRequestCounters1710000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Matches the "most requested first" ordering, including the patient_id tiebreak, so
    // that listing does not sort the whole table once there is a counter per patient.
    await queryRunner.query(`
      CREATE INDEX idx_prc_most_requested
        ON patient_request_counters (request_count DESC, patient_id ASC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_prc_most_requested`);
  }
}
