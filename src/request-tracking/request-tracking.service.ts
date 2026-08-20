import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedDto } from '../common/dto/query.dto';
import { PatientRequestStatsDto } from './dto/patient-request-stats.dto';
import { PatientRequestCounter } from './patient-request-counter.entity';

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

  async findByPatient(patientId: string): Promise<PatientRequestStatsDto> {
    const counter = await this.counters.findOne({ where: { patientId } });
    return counter ? this.toStats(counter) : { patientId, requestCount: 0, lastRequested: null };
  }

  // Paginated: there is one counter row per requested patient, so an unbounded list grows
  // with the patient population. patientId breaks ties so paging is deterministic.
  async findAll(page: number, limit: number): Promise<PaginatedDto<PatientRequestStatsDto>> {
    const [counters, total] = await this.counters.findAndCount({
      order: { requestCount: 'DESC', patientId: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items: counters.map((counter) => this.toStats(counter)), total, page, limit };
  }

  private toStats(counter: PatientRequestCounter): PatientRequestStatsDto {
    return {
      patientId: counter.patientId,
      // Postgres BIGINT arrives as a string to avoid silent precision loss.
      requestCount: Number(counter.requestCount),
      lastRequested: counter.lastRequested,
    };
  }
}
