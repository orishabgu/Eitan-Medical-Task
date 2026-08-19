import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { RequestTrackingService } from './request-tracking.service';
import { TRACK_PATIENT_PARAM_KEY } from './track-patient.decorator';

@Injectable()
export class TrackPatientInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TrackPatientInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tracking: RequestTrackingService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const paramName = this.reflector.get<string | undefined>(
      TRACK_PATIENT_PARAM_KEY,
      context.getHandler(),
    );
    if (!paramName) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const patientId = request.params?.[paramName];
    if (typeof patientId !== 'string' || patientId.length === 0) {
      return next.handle();
    }

    // `next` only: a 404 or a validation failure must not inflate the counter.
    return next.handle().pipe(
      tap({
        next: () => {
          // Deliberately not awaited: tracking is telemetry and must never delay or
          // fail a clinical read.
          void this.tracking.increment(patientId).catch((error: unknown) => {
            this.logger.error(`Failed to track request for patient ${patientId}`, error);
          });
        },
      }),
    );
  }
}
