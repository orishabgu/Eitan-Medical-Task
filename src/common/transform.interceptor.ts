import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, map } from 'rxjs';

export interface ResponseEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ResponseEnvelope<T>> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();

    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          requestId: String(request.id ?? ''),
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}
