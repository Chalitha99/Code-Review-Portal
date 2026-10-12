import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = 'api/docs-json';

/**
 * Configures the OpenAPI documentation endpoints. Off unless `SWAGGER_ENABLED`
 * is `true` (the local `.env` turns it on), so a staging or production
 * deployment never publishes the API map by accident.
 */
export function setupSwagger(app: INestApplication, enabled: boolean): void {
  if (!enabled) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('SEBSA Code Review Portal API')
    .setDescription('REST API for managing the SEBSA code review workflow.')
    .setVersion('1.0')
    .addServer('/', 'This server')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    customSiteTitle: 'SEBSA API Documentation',
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      tryItOutEnabled: true,
    },
  });
}
