import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';

// Shared by main.ts and the e2e suite so tests exercise the same routing and validation
// rules the service actually runs with.
export function configureApp(app: INestApplication): void {
  // Lets custom validator constraints inject providers such as ConfigService.
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
}
