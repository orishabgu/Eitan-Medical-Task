import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientRequestCounter } from './patient-request-counter.entity';
import { RequestTrackingController } from './request-tracking.controller';
import { RequestTrackingService } from './request-tracking.service';
import { TrackPatientInterceptor } from './track-patient.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([PatientRequestCounter])],
  controllers: [RequestTrackingController],
  providers: [RequestTrackingService, TrackPatientInterceptor],
  exports: [RequestTrackingService, TrackPatientInterceptor],
})
export class RequestTrackingModule {}
