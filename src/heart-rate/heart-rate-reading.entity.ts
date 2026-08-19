import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Patient } from '../patients/patient.entity';

// Indexes and constraints live in the migrations, which are the single source of truth
// for schema. `synchronize` is never enabled.
@Entity('heart_rate_readings')
export class HeartRateReading {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'patient_id', type: 'text' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient?: Patient;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ name: 'heart_rate', type: 'int' })
  heartRate!: number;
}
