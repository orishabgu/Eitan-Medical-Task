import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PatientsService } from '../patients/patients.service';
import { HeartRateReading } from './heart-rate-reading.entity';
import { HeartRateService } from './heart-rate.service';

const createQueryBuilder = () => ({
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(0),
  getRawMany: jest.fn().mockResolvedValue([]),
  getRawOne: jest.fn().mockResolvedValue(undefined),
});

describe('HeartRateService', () => {
  let service: HeartRateService;
  let qb: ReturnType<typeof createQueryBuilder>;
  let assertExists: jest.Mock;

  beforeEach(async () => {
    qb = createQueryBuilder();
    assertExists = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        HeartRateService,
        {
          provide: getRepositoryToken(HeartRateReading),
          useValue: { createQueryBuilder: () => qb },
        },
        { provide: PatientsService, useValue: { assertExists } },
        { provide: ConfigService, useValue: { get: () => 100 } },
      ],
    }).compile();

    service = moduleRef.get(HeartRateService);
  });

  describe('getAnalytics', () => {
    it('parses the numeric string Postgres returns for AVG and rounds to one decimal', async () => {
      qb.getRawOne.mockResolvedValue({
        count: '3',
        average: '94.33333333333333',
        min: '85',
        max: '101',
      });

      const result = await service.getAnalytics('1', {});

      expect(result).toMatchObject({ count: 3, average: 94.3, min: 85, max: 101 });
    });

    it('returns nulls with a zero count when the range holds no readings', async () => {
      qb.getRawOne.mockResolvedValue({ count: '0', average: null, min: null, max: null });

      const result = await service.getAnalytics('1', {});

      expect(result).toMatchObject({ count: 0, average: null, min: null, max: null });
    });

    it('reports the same value for average, min and max when there is one reading', async () => {
      qb.getRawOne.mockResolvedValue({ count: '1', average: '85', min: '85', max: '85' });

      const result = await service.getAnalytics('1', {});

      expect(result.average).toBe(85);
      expect(result.min).toBe(85);
      expect(result.max).toBe(85);
    });

    it('rejects an unknown patient before running any query', async () => {
      assertExists.mockRejectedValue(new NotFoundException());

      await expect(service.getAnalytics('missing', {})).rejects.toThrow(NotFoundException);
      expect(qb.getRawOne).not.toHaveBeenCalled();
    });

    it('applies both range bounds inclusively', async () => {
      const from = new Date('2024-03-01T00:00:00Z');
      const to = new Date('2024-03-02T00:00:00Z');

      await service.getAnalytics('1', { from, to });

      expect(qb.andWhere).toHaveBeenCalledWith('reading.timestamp >= :from', { from });
      expect(qb.andWhere).toHaveBeenCalledWith('reading.timestamp <= :to', { to });
    });

    it('leaves the range open when no bounds are given', async () => {
      await service.getAnalytics('1', {});

      expect(qb.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('findHighEvents', () => {
    it('compares strictly, so a reading at exactly the threshold is not an event', async () => {
      await service.findHighEvents({ page: 1, limit: 20 });

      expect(qb.where).toHaveBeenCalledWith('reading.heart_rate > :threshold', { threshold: 100 });
    });

    it('falls back to the configured threshold when none is supplied', async () => {
      await service.findHighEvents({ page: 1, limit: 20 });

      expect(qb.where).toHaveBeenCalledWith(expect.any(String), { threshold: 100 });
    });

    it('honours an explicit threshold override', async () => {
      await service.findHighEvents({ page: 1, limit: 20, threshold: 120 });

      expect(qb.where).toHaveBeenCalledWith(expect.any(String), { threshold: 120 });
    });

    it('scopes to a patient and verifies the patient exists first', async () => {
      await service.findHighEvents({ page: 1, limit: 20 }, '1');

      expect(assertExists).toHaveBeenCalledWith('1');
      expect(qb.andWhere).toHaveBeenCalledWith('reading.patient_id = :patientId', {
        patientId: '1',
      });
    });

    it('translates page and limit into offset and limit', async () => {
      await service.findHighEvents({ page: 3, limit: 10 });

      expect(qb.offset).toHaveBeenCalledWith(20);
      expect(qb.limit).toHaveBeenCalledWith(10);
    });

    it('returns an empty page with the real total when paging past the end', async () => {
      qb.getCount.mockResolvedValue(2);
      qb.getRawMany.mockResolvedValue([]);

      const result = await service.findHighEvents({ page: 999, limit: 20 });

      expect(result).toEqual({ items: [], total: 2, page: 999, limit: 20 });
    });
  });
});
