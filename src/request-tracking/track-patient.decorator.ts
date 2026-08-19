import { SetMetadata } from '@nestjs/common';

export const TRACK_PATIENT_PARAM_KEY = 'trackPatientParam';

/**
 * Marks a handler as a patient-data read. The interceptor increments that patient's
 * counter, so tracking stays declarative instead of matching on URL strings.
 */
export const TrackPatientRequest = (paramName = 'id') =>
  SetMetadata(TRACK_PATIENT_PARAM_KEY, paramName);
