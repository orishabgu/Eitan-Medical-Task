import { ApiProperty } from '@nestjs/swagger';

export class PatientRequestStatsDto {
  @ApiProperty({ example: '1' })
  patientId!: string;

  @ApiProperty({ description: 'Successful reads of this patient', example: 3 })
  requestCount!: number;

  @ApiProperty({ nullable: true, example: '2024-03-01T10:30:00.000Z' })
  lastRequested!: Date | null;
}
