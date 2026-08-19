import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { configureApp } from '../src/app-setup';
import { AppModule } from '../src/app.module';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app);
  // Listening for real, so concurrent requests share one server instead of racing to open
  // ephemeral listeners.
  await app.listen(0);

  return app;
}
