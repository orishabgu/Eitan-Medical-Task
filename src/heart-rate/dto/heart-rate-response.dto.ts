import { ApiProperty } from '@nestjs/swagger';

export class HighHeartRateEventDto {
  @ApiProperty({ example: '1' })
  patientId!: string;

  @ApiProperty({ example: 'Alice Johnson' })
  patientName!: string;

  @ApiProperty({ example: '2024-03-01T10:30:00.000Z' })
  timestamp!: Date;

  @ApiProperty({ example: 101 })
  heartRate!: number;
}

export class HeartRateAnalyticsDto {
  @ApiProperty({ example: '1' })
  patientId!: string;

  @ApiProperty({ description: 'Readings in the range', example: 3 })
  count!: number;

  @ApiProperty({ nullable: true, example: 94.3, description: 'Null when the range is empty' })
  average!: number | null;

  @ApiProperty({ nullable: true, example: 85 })
  min!: number | null;

  @ApiProperty({ nullable: true, example: 101 })
  max!: number | null;

  @ApiProperty({ nullable: true, example: '2024-03-01T00:00:00.000Z' })
  from!: Date | null;

  @ApiProperty({ nullable: true, example: '2024-03-01T23:59:59.000Z' })
  to!: Date | null;
}
