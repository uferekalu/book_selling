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
  /** Itemised reasons, e.g. the publish checklist (BooksService.publish). */
  problems?: string[];
}

const INTERNAL_SERVER_ERROR_CODE: number = HttpStatus.INTERNAL_SERVER_ERROR;
const SERVICE_UNAVAILABLE_CODE: number = HttpStatus.SERVICE_UNAVAILABLE;

function extractCode(response: string | object): string | undefined {
  if (typeof response === 'string') return undefined;
  const { code } = response as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

function extractProblems(response: string | object): string[] | undefined {
  if (typeof response === 'string') return undefined;
  const { problems } = response as { problems?: unknown };
  return Array.isArray(problems) && problems.every((p) => typeof p === 'string')
    ? problems
    : undefined;
}

function extractMessage(response: string | object): string | string[] {
  if (typeof response === 'string') return response;
  const body = response as { message?: string | string[] };
  return body.message ?? 'Unexpected error';
}

/**
 * Gives every error response the same shape. 5xx errors are logged with a stack trace and their
 * message is replaced by a generic one — internal details (driver errors, provider payloads)
 * never reach the client — except a deliberate 503 (`ServiceUnavailableException`), whose message
 * is written for the customer ("We couldn't reach Paystack…"). 4xx errors are expected client
 * mistakes and are not logged.
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

    // 5xx details stay private, except a deliberate 503: its message is written for the customer
    // ("We couldn't reach Paystack. Please try again or choose another payment method.", BS-23).
    const message =
      isHttpException &&
      (status < INTERNAL_SERVER_ERROR_CODE ||
        status === SERVICE_UNAVAILABLE_CODE)
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
    const problems =
      isHttpException && status < INTERNAL_SERVER_ERROR_CODE
        ? extractProblems(exception.getResponse())
        : undefined;
    if (problems) body.problems = problems;
    response.status(status).json(body);
  }
}
