import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PaginatedDto } from '../common/dto/query.dto';
import { PatientsService } from '../patients/patients.service';
import { HighEventsQueryDto } from './dto/heart-rate-query.dto';
import { HeartRateAnalyticsDto, HighHeartRateEventDto } from './dto/heart-rate-response.dto';
import { HeartRateReading } from './heart-rate-reading.entity';

interface TimeRange {
  from?: Date;
  to?: Date;
}

interface RawAggregate {
  count: string;
  average: string | null;
  min: string | null;
  max: string | null;
}

@Injectable()
export class HeartRateService {
  constructor(
    @InjectRepository(HeartRateReading)
    private readonly readings: Repository<HeartRateReading>,
    private readonly patients: PatientsService,
    private readonly config: ConfigService,
  ) {}

  async findHighEvents(
    query: HighEventsQueryDto,
    patientId?: string,
  ): Promise<PaginatedDto<HighHeartRateEventDto>> {
    if (patientId) {
      await this.patients.assertExists(patientId);
    }

    const threshold = query.threshold ?? this.config.get<number>('highHeartRateThreshold')!;

    const matching = this.readings
      .createQueryBuilder('reading')
      // Strictly greater: a reading of exactly the threshold is not a tachycardia event.
      .where('reading.heart_rate > :threshold', { threshold });

    if (patientId) {
      matching.andWhere('reading.patient_id = :patientId', { patientId });
    }
    this.applyTimeRange(matching, query);

    // Counted without joining patients. patient_id is a NOT NULL foreign key, so the join
    // cannot change the count, and joining every matching row to count it is the single
    // most expensive thing this query does once the table is large.
    const total = await matching.clone().getCount();

    // id breaks ties so pagination stays deterministic across pages.
    const items = await matching
      .clone()
      .innerJoin('reading.patient', 'patient')
      .select([
        'reading.patientId AS "patientId"',
        'patient.name AS "patientName"',
        'reading.timestamp AS "timestamp"',
        'reading.heartRate AS "heartRate"',
      ])
      .orderBy('reading.timestamp', 'DESC')
      .addOrderBy('reading.id', 'ASC')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<HighHeartRateEventDto>();

    return { items, total, page: query.page, limit: query.limit };
  }

  // Aggregated in Postgres: one round trip, constant memory, no rows shipped to Node.
  async getAnalytics(patientId: string, range: TimeRange): Promise<HeartRateAnalyticsDto> {
    await this.patients.assertExists(patientId);

    const qb = this.readings
      .createQueryBuilder('reading')
      .select('COUNT(*)', 'count')
      .addSelect('AVG(reading.heart_rate)', 'average')
      .addSelect('MIN(reading.heart_rate)', 'min')
      .addSelect('MAX(reading.heart_rate)', 'max')
      .where('reading.patient_id = :patientId', { patientId });

    this.applyTimeRange(qb, range);

    const raw = await qb.getRawOne<RawAggregate>();

    return {
      patientId,
      count: Number(raw?.count ?? 0),
      // An empty range is a valid answer, not a missing resource: nulls, not a 404.
      average: this.round(raw?.average),
      min: this.toNumber(raw?.min),
      max: this.toNumber(raw?.max),
      from: range.from ?? null,
      to: range.to ?? null,
    };
  }

  private applyTimeRange(qb: SelectQueryBuilder<HeartRateReading>, range: TimeRange): void {
    if (range.from) {
      qb.andWhere('reading.timestamp >= :from', { from: range.from });
    }
    if (range.to) {
      qb.andWhere('reading.timestamp <= :to', { to: range.to });
    }
  }

  // Postgres returns AVG as a numeric string to preserve precision.
  private round(value: string | null | undefined): number | null {
    const parsed = this.toNumber(value);
    return parsed === null ? null : Math.round(parsed * 10) / 10;
  }

  private toNumber(value: string | null | undefined): number | null {
    return value === null || value === undefined ? null : Number(value);
  }
}
