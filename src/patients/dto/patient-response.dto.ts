import { ApiProperty } from '@nestjs/swagger';
import { Patient } from '../patient.entity';

// An explicit whitelist, so adding a column to the entity cannot leak it through the API.
export class PatientResponseDto {
  @ApiProperty({ example: '1' })
  id!: string;

  @ApiProperty({ example: 'Alice Johnson' })
  name!: string;

  @ApiProperty({ nullable: true, example: 34 })
  age!: number | null;

  @ApiProperty({ nullable: true, example: 'female' })
  gender!: string | null;

  @ApiProperty({ example: '2024-03-01T00:00:00.000Z' })
  createdAt!: Date;

  static from(patient: Patient): PatientResponseDto {
    return {
      id: patient.id,
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      createdAt: patient.createdAt,
    };
  }
}
