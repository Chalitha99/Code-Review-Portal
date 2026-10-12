import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiException, ERROR_HTTP_STATUS } from '../api-error.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function responseHarness() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json })) as unknown as Response['status'];
  const response = { status } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('HttpExceptionFilter', () => {
  it.each(Object.entries(ERROR_HTTP_STATUS))(
    'returns %s with its specified HTTP status',
    (code, expectedStatus) => {
      const { host, json, status } = responseHarness();

      new HttpExceptionFilter().catch(
        new ApiException(code as keyof typeof ERROR_HTTP_STATUS, 'Safe message'),
        host,
      );

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        statusCode: expectedStatus,
        code,
        message: 'Safe message',
        details: [],
        timestamp: expect.any(String),
      });
      const payload = json.mock.calls[0]?.[0] as { timestamp: string };
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    },
  );

  it.each([
    [new BadRequestException('Invalid input'), 400, 'VALIDATION_FAILED'],
    [new UnauthorizedException(), 401, 'AUTH_REQUIRED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new NotFoundException(), 404, 'NOT_FOUND'],
    [new ConflictException({ code: 'ALREADY_PICKED', message: 'Taken' }), 409, 'ALREADY_PICKED'],
  ])('maps built-in HTTP exceptions', (exception, expectedStatus, code) => {
    const { host, json, status } = responseHarness();

    new HttpExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: expectedStatus, code }),
    );
  });

  it('returns validation messages as safe details', () => {
    const { host, json } = responseHarness();

    new HttpExceptionFilter().catch(
      new BadRequestException(['email must be an email', 'name should not be empty']),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: 'email must be an email',
        details: ['email must be an email', 'name should not be empty'],
      }),
    );
  });

  it('does not expose unexpected error messages or stacks', () => {
    const { host, json, status } = responseHarness();

    new HttpExceptionFilter().catch(
      new Error('Prisma query failed with database credentials'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred',
        details: [],
      }),
    );
    expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toContain('Prisma');
  });

  it.each([
    ['entity.too.large', 413, 'PAYLOAD_TOO_LARGE'],
    ['entity.parse.failed', 400, 'VALIDATION_FAILED'],
    ['encoding.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('maps the body-parser error %s to %i %s instead of a 500', (type, expectedStatus, code) => {
    const { host, json, status } = responseHarness();
    const error = Object.assign(new Error('raw parser detail'), { type, status: expectedStatus });

    new HttpExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: expectedStatus, code }),
    );
    expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toContain('raw parser detail');
  });

  it('gives a plain 422 a business-rule code rather than a state-conflict one', () => {
    const { host, json } = responseHarness();
    new HttpExceptionFilter().catch(new UnprocessableEntityException('Nope'), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RULE_VIOLATION' }));
  });
});
