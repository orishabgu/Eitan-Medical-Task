import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientRequestCounter } from './patient-request-counter.entity';

export interface PatientRequestStats {
  patientId: string;
  requestCount: number;
  lastRequested: Date | null;
}

@Injectable()
export class RequestTrackingService {
  constructor(
    @InjectRepository(PatientRequestCounter)
    private readonly counters: Repository<PatientRequestCounter>,
  ) {}

  // A single atomic upsert rather than read-modify-write, so concurrent requests for the
  // same patient cannot lose increments. TypeORM's orUpdate() can only assign EXCLUDED
  // values, which cannot express `count + 1`, hence the parameterized statement.
  async increment(patientId: string): Promise<void> {
    await this.counters.query(
      `INSERT INTO patient_request_counters (patient_id, request_count, last_requested)
       VALUES ($1, 1, now())
       ON CONFLICT (patient_id) DO UPDATE
         SET request_count = patient_request_counters.request_count + 1,
             last_requested = now()`,
      [patientId],
    );
  }

  async findByPatient(patientId: string): Promise<PatientRequestStats> {
    const counter = await this.counters.findOne({ where: { patientId } });
    return counter ? this.toStats(counter) : { patientId, requestCount: 0, lastRequested: null };
  }

  async findAll(): Promise<PatientRequestStats[]> {
    const counters = await this.counters.find({ order: { requestCount: 'DESC' } });
    return counters.map((counter) => this.toStats(counter));
  }

  private toStats(counter: PatientRequestCounter): PatientRequestStats {
    return {
      patientId: counter.patientId,
      // Postgres BIGINT arrives as a string to avoid silent precision loss.
      requestCount: Number(counter.requestCount),
      lastRequested: counter.lastRequested,
    };
  }
}
