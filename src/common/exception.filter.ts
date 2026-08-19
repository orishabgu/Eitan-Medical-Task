import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
  path: string;
}

// Postgres error codes that are caused by the client, not by us.
const CLIENT_ERROR_SQL_STATES: Record<string, { status: number; code: string }> = {
  '23505': { status: HttpStatus.CONFLICT, code: 'DUPLICATE_RESOURCE' },
  '23503': { status: HttpStatus.BAD_REQUEST, code: 'RELATED_RESOURCE_NOT_FOUND' },
  '23514': { status: HttpStatus.BAD_REQUEST, code: 'VALUE_OUT_OF_RANGE' },
  '22P02': { status: HttpStatus.BAD_REQUEST, code: 'INVALID_INPUT_SYNTAX' },
};

const UNAVAILABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '57P01']);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();

    const { status, code, message } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = {
      statusCode: status,
      code,
      message,
      requestId: String(request.id ?? ''),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return { status, code: this.codeFor(status), message };
    }

    if (exception instanceof QueryFailedError) {
      const sqlState = (exception as QueryFailedError & { code?: string }).code;
      const mapped = sqlState ? CLIENT_ERROR_SQL_STATES[sqlState] : undefined;
      if (mapped) {
        return { ...mapped, message: 'The request could not be processed' };
      }
      if (sqlState && UNAVAILABLE_ERROR_CODES.has(sqlState)) {
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'DATABASE_UNAVAILABLE',
          message: 'The service is temporarily unavailable',
        };
      }
    }

    if (this.isConnectionError(exception)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_UNAVAILABLE',
        message: 'The service is temporarily unavailable',
      };
    }

    // Never surface driver or stack details to the client.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  private isConnectionError(exception: unknown): boolean {
    const code = (exception as { code?: unknown })?.code;
    return typeof code === 'string' && UNAVAILABLE_ERROR_CODES.has(code);
  }

  private codeFor(status: number): string {
    return (
      {
        [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
        [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
        [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
        [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
        [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
        [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
      }[status] ?? 'ERROR'
    );
  }
}
