import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedDto } from '../common/dto/query.dto';
import { PatientResponseDto } from './dto/patient-response.dto';
import { Patient } from './patient.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patients: Repository<Patient>,
  ) {}

  async findAll(page: number, limit: number): Promise<PaginatedDto<PatientResponseDto>> {
    const [items, total] = await this.patients.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: items.map((item) => PatientResponseDto.from(item)), total, page, limit };
  }

  async findOne(id: string): Promise<PatientResponseDto> {
    const patient = await this.patients.findOne({ where: { id } });
    if (!patient) {
      throw new NotFoundException(`Patient ${id} not found`);
    }
    return PatientResponseDto.from(patient);
  }

  // Callers that only need the existence check avoid loading the row's PHI.
  async assertExists(id: string): Promise<void> {
    const exists = await this.patients.exists({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`Patient ${id} not found`);
    }
  }
}
