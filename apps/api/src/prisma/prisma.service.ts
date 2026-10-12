import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Interactive transactions make many round trips; the 5 s Prisma default is too tight for Neon.
  constructor(config: ConfigService) {
    super({
      transactionOptions: config.getOrThrow<{ timeout: number; maxWait: number }>(
        'database.transactionOptions',
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
