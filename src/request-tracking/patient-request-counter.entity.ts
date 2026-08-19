import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('patient_request_counters')
export class PatientRequestCounter {
  @PrimaryColumn({ name: 'patient_id', type: 'text' })
  patientId!: string;

  @Column({ name: 'request_count', type: 'bigint', default: 0 })
  requestCount!: string;

  @Column({ name: 'last_requested', type: 'timestamptz', nullable: true })
  lastRequested!: Date | null;
}
