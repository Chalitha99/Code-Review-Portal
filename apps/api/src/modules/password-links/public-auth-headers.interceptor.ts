import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { ApiException } from '../../common/api-error.js';

/**
 * Transport rules for the public password endpoints (docs/18-security.md):
 *
 *  - `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, so neither a
 *    cache nor a referrer header ever holds a token or the answer about it.
 *  - An `Origin` check. These POSTs carry no cookies, so CSRF does not apply,
 *    but a browser always sends `Origin` on a cross-site POST and only the web
 *    app's own origin may call them. Non-browser clients send no Origin and are
 *    rate-limited like everyone else.
 */
@Injectable()
export class PublicAuthHeadersInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');

    const origin = request.get('origin');
    const allowed = this.config.getOrThrow<string[]>('frontendOrigins');
    if (origin !== undefined && !allowed.includes(origin)) {
      throw new ApiException('ORIGIN_REJECTED', 'This request is not allowed from this origin.');
    }
    return next.handle();
  }
}
