import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientsModule } from '../patients/patients.module';
import { RequestTrackingModule } from '../request-tracking/request-tracking.module';
import { HeartRateReading } from './heart-rate-reading.entity';
import { HeartRateController } from './heart-rate.controller';
import { HeartRateService } from './heart-rate.service';

@Module({
  imports: [TypeOrmModule.forFeature([HeartRateReading]), PatientsModule, RequestTrackingModule],
  controllers: [HeartRateController],
  providers: [HeartRateService],
})
export class HeartRateModule {}
