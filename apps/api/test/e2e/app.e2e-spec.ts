import 'reflect-metadata';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../../src/app.module.ts';
import { PrismaService } from '../../src/prisma/prisma.service.js';

interface HealthResponse {
  status: string;
  timestamp: string;
  environment: string;
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: () => Promise.resolve(), $disconnect: () => Promise.resolve() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns ok, a timestamp, and the injected ConfigService value', async () => {
    const response = await request(app.getHttpServer() as Server).get('/api/health');
    const body = response.body as HealthResponse;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    // Proves constructor injection actually ran: if `emitDecoratorMetadata`
    // were stripped, Nest could not have resolved ConfigService here at all
    // and this request would never have reached a response.
    expect(body.environment).toBe('test');
  });

  it('keeps domain endpoints behind the global JWT guard', async () => {
    await request(app.getHttpServer() as Server).get('/api/users').expect(401);
  });
});
