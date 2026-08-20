import { ApiProperty } from '@nestjs/swagger';

export class LivenessDto {
  @ApiProperty({ example: 'ok' })
  status!: string;
}

export class ReadinessDto {
  @ApiProperty({ example: 'ok', description: "'ok' or 'error'" })
  status!: string;

  @ApiProperty({ example: { database: { status: 'up' } }, description: 'Healthy indicators' })
  info!: Record<string, { status: string }>;

  @ApiProperty({ example: {}, description: 'Failing indicators' })
  error!: Record<string, { status: string }>;

  @ApiProperty({ example: { database: { status: 'up' } }, description: 'All indicators' })
  details!: Record<string, { status: string }>;
}
