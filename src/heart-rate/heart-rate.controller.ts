import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TimeRangeQueryDto } from '../common/dto/query.dto';
import { PatientIdParamDto } from '../patients/dto/patient-id.dto';
import { TrackPatientRequest } from '../request-tracking/track-patient.decorator';
import { TrackPatientInterceptor } from '../request-tracking/track-patient.interceptor';
import { HighEventsQueryDto } from './dto/heart-rate-query.dto';
import { HeartRateAnalyticsDto } from './dto/heart-rate-response.dto';
import { HeartRateService } from './heart-rate.service';

@ApiTags('heart-rate')
@Controller()
@UseInterceptors(TrackPatientInterceptor)
export class HeartRateController {
  constructor(private readonly heartRate: HeartRateService) {}

  @Get('heart-rate/high-events')
  @ApiOperation({ summary: 'High heart-rate events across all patients' })
  findAllHighEvents(@Query() query: HighEventsQueryDto) {
    return this.heartRate.findHighEvents(query);
  }

  @Get('patients/:id/heart-rate/high-events')
  @TrackPatientRequest()
  @ApiOperation({ summary: 'High heart-rate events for one patient' })
  @ApiNotFoundResponse({ description: 'Patient does not exist' })
  findPatientHighEvents(@Param() params: PatientIdParamDto, @Query() query: HighEventsQueryDto) {
    return this.heartRate.findHighEvents(query, params.id);
  }

  @Get('patients/:id/heart-rate/analytics')
  @TrackPatientRequest()
  @ApiOperation({ summary: 'Average, min and max heart rate over a time range' })
  @ApiOkResponse({ type: HeartRateAnalyticsDto })
  @ApiNotFoundResponse({ description: 'Patient does not exist' })
  getAnalytics(@Param() params: PatientIdParamDto, @Query() query: TimeRangeQueryDto) {
    return this.heartRate.getAnalytics(params.id, query);
  }
}
