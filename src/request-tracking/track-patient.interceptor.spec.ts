import { CallHandler, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, firstValueFrom, lastValueFrom } from 'rxjs';
import { RequestTrackingService } from './request-tracking.service';
import { TRACK_PATIENT_PARAM_KEY } from './track-patient.decorator';
import { TrackPatientInterceptor } from './track-patient.interceptor';

const contextWithParams = (params: Record<string, string>) =>
  ({
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
  }) as unknown as ExecutionContext;

// The increment is intentionally not awaited, so let the microtask queue drain.
const flushPendingWork = () => new Promise((resolve) => setImmediate(resolve));

describe('TrackPatientInterceptor', () => {
  let interceptor: TrackPatientInterceptor;
  let reflector: Reflector;
  let increment: jest.Mock;

  beforeEach(() => {
    reflector = new Reflector();
    increment = jest.fn().mockResolvedValue(undefined);
    interceptor = new TrackPatientInterceptor(reflector, {
      increment,
    } as unknown as RequestTrackingService);
  });

  const markTracked = (paramName = 'id') =>
    jest.spyOn(reflector, 'get').mockReturnValue(paramName);

  it('increments exactly once for a successful tracked request', async () => {
    markTracked();
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    await firstValueFrom(interceptor.intercept(contextWithParams({ id: '1' }), next));
    await flushPendingWork();

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith('1');
  });

  it('does not increment when the handler throws', async () => {
    markTracked();
    const next: CallHandler = { handle: () => throwError(() => new NotFoundException()) };

    await expect(
      lastValueFrom(interceptor.intercept(contextWithParams({ id: '1' }), next)),
    ).rejects.toThrow(NotFoundException);
    await flushPendingWork();

    expect(increment).not.toHaveBeenCalled();
  });

  it('ignores handlers that are not marked for tracking', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const next: CallHandler = { handle: () => of({}) };

    await firstValueFrom(interceptor.intercept(contextWithParams({ id: '1' }), next));
    await flushPendingWork();

    expect(increment).not.toHaveBeenCalled();
  });

  it('ignores requests with no patient id in the route', async () => {
    markTracked();
    const next: CallHandler = { handle: () => of({}) };

    await firstValueFrom(interceptor.intercept(contextWithParams({}), next));
    await flushPendingWork();

    expect(increment).not.toHaveBeenCalled();
  });

  it('reads the parameter name the decorator specified', async () => {
    markTracked('patientId');
    const next: CallHandler = { handle: () => of({}) };

    await firstValueFrom(interceptor.intercept(contextWithParams({ patientId: '7' }), next));
    await flushPendingWork();

    expect(increment).toHaveBeenCalledWith('7');
  });

  it('never fails the response when the counter write fails', async () => {
    markTracked();
    increment.mockRejectedValue(new Error('database is down'));
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    const result = await firstValueFrom(
      interceptor.intercept(contextWithParams({ id: '1' }), next),
    );
    await flushPendingWork();

    expect(result).toEqual({ id: '1' });
  });

  it('looks the parameter name up on the handler, not the request URL', async () => {
    const get = markTracked();
    const next: CallHandler = { handle: () => of({}) };

    await firstValueFrom(interceptor.intercept(contextWithParams({ id: '1' }), next));

    expect(get).toHaveBeenCalledWith(TRACK_PATIENT_PARAM_KEY, expect.anything());
  });
});
