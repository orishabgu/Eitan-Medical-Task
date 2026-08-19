import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestTrackingService } from './request-tracking.service';

@ApiTags('request-tracking')
@Controller('request-stats')
export class RequestTrackingController {
  constructor(private readonly tracking: RequestTrackingService) {}

  @Get()
  @ApiOperation({ summary: 'Request counts for all patients, most requested first' })
  findAll() {
    return this.tracking.findAll();
  }
}
