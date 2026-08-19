import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/query.dto';
import { RequestTrackingService } from './request-tracking.service';

@ApiTags('request-tracking')
@Controller('request-stats')
export class RequestTrackingController {
  constructor(private readonly tracking: RequestTrackingService) {}

  @Get()
  @ApiOperation({ summary: 'Request counts, most requested first' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.tracking.findAll(query.page, query.limit);
  }
}
