import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { ApiEnvelopeResponse } from '../common/dto/api-response.dto';
import { LivenessDto, ReadinessDto } from './dto/health-status.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe: the process is running' })
  @ApiEnvelopeResponse(LivenessDto)
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  // Above @HealthCheck on purpose: decorators apply bottom-up, and terminus declares its own
  // 200 schema which does not know about the response envelope.
  @ApiEnvelopeResponse(ReadinessDto)
  @ApiServiceUnavailableResponse({ description: 'A dependency is unreachable' })
  @ApiOperation({ summary: 'Readiness probe: dependencies are reachable' })
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.pingCheck('database', { timeout: 3000 })]);
  }
}
