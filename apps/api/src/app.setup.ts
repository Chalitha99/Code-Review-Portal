import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.ts';
import { registerBodyParsers } from './common/http/body-parsers.ts';
import { securityHeaders } from './common/http/security-headers.ts';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.ts';

/**
 * Everything the HTTP pipeline needs besides the module graph, shared by
 * `main.ts` and the e2e suites so tests exercise exactly what production runs.
 * The app must be created with `{ bodyParser: false }`.
 *
 * `setGlobalPrefix('api')` is the frontend integration contract: the web app's
 * `API_BASE = '/api'` (apps/web/src/lib/apiClient.ts) is hardcoded, and Vite
 * proxies `/api` here in development. In production a reverse proxy serves
 * the web build and this API on one origin.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  // Behind a TLS-terminating proxy, this makes `request.ip` the real client
  // (per-IP rate limits, session logs) and `request.secure` reflect HTTPS.
  app.set('trust proxy', config.getOrThrow<number | string | false>('trustProxy'));
  app.disable('x-powered-by');
  app.use(securityHeaders(config.getOrThrow<string>('nodeEnv') === 'production'));

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  registerBodyParsers(app);
  app.enableCors({
    origin: config.getOrThrow<string[]>('frontendOrigins'),
    credentials: true,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
