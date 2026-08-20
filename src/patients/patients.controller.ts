import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/query.dto';
import { RequestTrackingService } from '../request-tracking/request-tracking.service';
import { TrackPatientRequest } from '../request-tracking/track-patient.decorator';
import { TrackPatientInterceptor } from '../request-tracking/track-patient.interceptor';
import { PatientIdParamDto } from './dto/patient-id.dto';
import { PatientResponseDto } from './dto/patient-response.dto';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@Controller('patients')
@UseInterceptors(TrackPatientInterceptor)
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly tracking: RequestTrackingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List patients' })
  @ApiOkResponse({ type: PatientResponseDto, isArray: true })
  findAll(@Query() query: PaginationQueryDto) {
    return this.patients.findAll(query.page, query.limit);
  }

  @Get(':id')
  @TrackPatientRequest()
  @ApiOperation({ summary: 'Get a patient by id' })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiNotFoundResponse({ description: 'Patient does not exist' })
  findOne(@Param() params: PatientIdParamDto) {
    return this.patients.findOne(params.id);
  }

  // Deliberately not decorated with @TrackPatientRequest: reading a counter must not
  // change it.
  @Get(':id/request-stats')
  @ApiOperation({ summary: 'How many times this patient has been requested' })
  @ApiNotFoundResponse({ description: 'Patient does not exist' })
  async getRequestStats(@Param() params: PatientIdParamDto) {
    await this.patients.assertExists(params.id);
    return this.tracking.findByPatient(params.id);
  }
}
