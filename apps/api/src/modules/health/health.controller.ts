import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator.js';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  environment: string;
}

/**
 * `GET /api/health` - the global prefix set in `main.ts` puts this route at
 * `/api/health`, not `/health`.
 *
 * Depends on `ConfigService` deliberately: a health check with no injected
 * provider would never prove constructor-parameter DI actually works, which
 * is exactly the thing `erasableSyntaxOnly`/`verbatimModuleSyntax` being on
 * everywhere else in the workspace threatens (see tsconfig.app.json and
 * eslint.config.js's apps/api override).
 */
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: this.config.getOrThrow<string>('nodeEnv'),
    };
  }
}
