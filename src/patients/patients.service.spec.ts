import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Patient } from './patient.entity';
import { PatientsService } from './patients.service';

const patient = (id: string): Patient =>
  Object.assign(new Patient(), {
    id,
    name: `Patient ${id}`,
    age: 34,
    gender: 'female',
    createdAt: new Date('2024-03-01T00:00:00Z'),
  });

describe('PatientsService', () => {
  let service: PatientsService;
  let repository: {
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    exists: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findAndCount: jest.fn().mockResolvedValue([[patient('1')], 1]),
      findOne: jest.fn().mockResolvedValue(patient('1')),
      exists: jest.fn().mockResolvedValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PatientsService, { provide: getRepositoryToken(Patient), useValue: repository }],
    }).compile();

    service = moduleRef.get(PatientsService);
  });

  it('returns only the whitelisted response fields, not the stored row', async () => {
    // A column added to the entity must not appear in the API response by accident.
    repository.findOne.mockResolvedValue(
      Object.assign(patient('1'), { internalNote: 'not for clients' }),
    );

    const result = await service.findOne('1');

    expect(Object.keys(result).sort()).toEqual(['age', 'createdAt', 'gender', 'id', 'name']);
  });

  it('404s for an unknown patient', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('translates page and limit into skip and take', async () => {
    const result = await service.findAll(3, 10);

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(result).toMatchObject({ total: 1, page: 3, limit: 10 });
  });

  it('checks existence without loading the row', async () => {
    await service.assertExists('1');

    expect(repository.exists).toHaveBeenCalled();
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('404s when asserting an unknown patient exists', async () => {
    repository.exists.mockResolvedValue(false);

    await expect(service.assertExists('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
