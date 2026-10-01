import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ErrorBody {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
  /** Stable machine-readable reason, when the thrower gave one (e.g. 'two_factor_required'). */
  code?: string;
}

const INTERNAL_SERVER_ERROR_CODE: number = HttpStatus.INTERNAL_SERVER_ERROR;

function extractCode(response: string | object): string | undefined {
  if (typeof response === 'string') return undefined;
  const { code } = response as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

function extractMessage(response: string | object): string | string[] {
  if (typeof response === 'string') return response;
  const body = response as { message?: string | string[] };
  return body.message ?? 'Unexpected error';
}

/**
 * Gives every error response the same shape. 5xx errors are logged with a stack trace and their
 * message is replaced by a generic one — internal details (driver errors, provider payloads)
 * never reach the client. 4xx errors are expected client mistakes and are not logged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status: number = isHttpException
      ? exception.getStatus()
      : INTERNAL_SERVER_ERROR_CODE;

    if (status >= INTERNAL_SERVER_ERROR_CODE) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    const message =
      isHttpException && status < INTERNAL_SERVER_ERROR_CODE
        ? extractMessage(exception.getResponse())
        : 'Internal server error';

    const body: ErrorBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    };
    const code =
      isHttpException && status < INTERNAL_SERVER_ERROR_CODE
        ? extractCode(exception.getResponse())
        : undefined;
    if (code) body.code = code;
    response.status(status).json(body);
  }
}
