import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupSwagger, SWAGGER_JSON_PATH, SWAGGER_PATH } from '../../src/swagger.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: () => Promise.resolve(), $disconnect: () => Promise.resolve() })
      .compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app, true);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it(`/${SWAGGER_PATH} (GET) serves Swagger UI`, () => {
    return request(app.getHttpServer())
      .get(`/${SWAGGER_PATH}`)
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it(`/${SWAGGER_JSON_PATH} (GET) describes the unauthenticated API`, async () => {
    const response = await request(app.getHttpServer())
      .get(`/${SWAGGER_JSON_PATH}`)
      .expect(200)
      .expect('Content-Type', /json/);

    const document = response.body as OpenAPIObject;
    expect(document.info.title).toBe('SEBSA Code Review Portal API');
    expect(document.components?.securitySchemes).toBeUndefined();
    expect(document.paths['/']?.get).toMatchObject({
      tags: ['Application'],
      responses: {
        200: {
          content: {
            'text/plain': {
              schema: { type: 'string', example: 'Hello World!' },
            },
          },
        },
        500: {
          description: 'An unexpected server error occurred.',
        },
      },
    });
    expect(document.paths['/users']).toHaveProperty('post');
    expect(document.paths['/roles']).toHaveProperty('post');
    expect(document.paths['/user-roles']).toHaveProperty('post');
    expect(document.paths['/users/{userId}/roles']).toHaveProperty('post');
    expect(document.paths['/customers']).toHaveProperty('post');
    expect(document.paths['/task-types']).toHaveProperty('get');
    expect(document.paths['/developer-checklist']).toHaveProperty('get');
    expect(document.paths['/review-tasks']).toHaveProperty('get');
    expect(document.paths['/review-tasks']).toHaveProperty('post');
  });

  afterEach(async () => {
    await app.close();
  });
});
