import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiPaginatedEnvelopeResponse,
  ErrorResponseDto,
} from '../common/dto/api-response.dto';
import { TimeRangeQueryDto } from '../common/dto/query.dto';
import { PatientIdParamDto } from '../patients/dto/patient-id.dto';
import { TrackPatientRequest } from '../request-tracking/track-patient.decorator';
import { TrackPatientInterceptor } from '../request-tracking/track-patient.interceptor';
import { HighEventsQueryDto } from './dto/heart-rate-query.dto';
import { HeartRateAnalyticsDto, HighHeartRateEventDto } from './dto/heart-rate-response.dto';
import { HeartRateService } from './heart-rate.service';

@ApiTags('heart-rate')
@Controller()
@UseInterceptors(TrackPatientInterceptor)
export class HeartRateController {
  constructor(private readonly heartRate: HeartRateService) {}

  @Get('heart-rate/high-events')
  @ApiOperation({ summary: 'High heart-rate events across all patients' })
  @ApiPaginatedEnvelopeResponse(HighHeartRateEventDto)
  findAllHighEvents(@Query() query: HighEventsQueryDto) {
    return this.heartRate.findHighEvents(query);
  }

  @Get('patients/:id/heart-rate/high-events')
  @TrackPatientRequest()
  @ApiOperation({ summary: 'High heart-rate events for one patient' })
  @ApiPaginatedEnvelopeResponse(HighHeartRateEventDto)
  @ApiNotFoundResponse({ description: 'Patient does not exist', type: ErrorResponseDto })
  findPatientHighEvents(@Param() params: PatientIdParamDto, @Query() query: HighEventsQueryDto) {
    return this.heartRate.findHighEvents(query, params.id);
  }

  @Get('patients/:id/heart-rate/analytics')
  @TrackPatientRequest()
  @ApiOperation({ summary: 'Average, min and max heart rate over a time range' })
  @ApiEnvelopeResponse(HeartRateAnalyticsDto)
  @ApiNotFoundResponse({ description: 'Patient does not exist', type: ErrorResponseDto })
  getAnalytics(@Param() params: PatientIdParamDto, @Query() query: TimeRangeQueryDto) {
    return this.heartRate.getAnalytics(params.id, query);
  }
}
