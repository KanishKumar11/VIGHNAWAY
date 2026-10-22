import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ApiError, ErrorCode } from '@vighnaway/contracts';
import { ERROR_STATUS } from '@vighnaway/contracts';
import type { NextFunction, Request, Response } from 'express';

/** An error with a contract error code. Everything the API returns uses the same envelope. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, ERROR_STATUS[code]);
  }
}

const STATUS_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'NOT_ON_ROAD',
  429: 'RATE_LIMITED',
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'The request is not valid',
  UNAUTHORIZED: 'Operator token missing or wrong',
  FORBIDDEN: 'Your account cannot do this',
  NOT_FOUND: 'Not found',
  CONFLICT: 'This incident is already closed',
  PAYLOAD_TOO_LARGE: 'Request body is larger than 16 kB',
  NOT_ON_ROAD: 'Not on a known road',
  RATE_LIMITED: 'Too many requests. Wait a minute and try again',
  INTERNAL: 'Something went wrong on the server',
};

export function envelope(code: ErrorCode, message?: string, details?: unknown): ApiError {
  const error: ApiError['error'] = { code, message: message ?? DEFAULT_MESSAGE[code] };
  if (details !== undefined) error.details = details;
  return { error };
}

export function toEnvelope(err: unknown): { status: number; body: ApiError } {
  if (err instanceof ApiException) {
    return { status: err.getStatus(), body: envelope(err.code, err.message, err.details) };
  }
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const code = STATUS_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED');
    // Nest's own messages ("Cannot GET /x", throttler) are plain and safe; never echo internals.
    const message = status >= 500 ? undefined : code === 'RATE_LIMITED' ? undefined : err.message;
    return { status, body: envelope(code, message) };
  }
  return { status: 500, body: envelope('INTERNAL') };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = toEnvelope(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    if (res.headersSent) return;
    res.status(status).json(body);
  }
}

/**
 * Express error middleware placed right after the JSON body parser, so malformed or oversized
 * bodies get the contract envelope too (they fail before Nest's router and filters run).
 */
export function bodyParserErrorHandler(
  err: { type?: string; status?: number; statusCode?: number } | undefined,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!err) return next();
  const status = err.status ?? err.statusCode ?? 500;
  if (err.type === 'entity.too.large' || status === 413) {
    res.status(413).json(envelope('PAYLOAD_TOO_LARGE'));
    return;
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json(envelope('VALIDATION_FAILED', 'Body is not valid JSON'));
    return;
  }
  if (status >= 400 && status < 500) {
    res.status(status === 415 ? 400 : status).json(envelope(STATUS_CODE[status] ?? 'VALIDATION_FAILED'));
    return;
  }
  next(err);
}
