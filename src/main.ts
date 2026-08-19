import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { configureApp } from './app-setup';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppConfig, true>);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: config.get('corsOrigins', { infer: true }) });
  app.enableShutdownHooks();

  configureApp(app);

  const swagger = new DocumentBuilder()
    .setTitle('Patient Heart-Rate Service')
    .setDescription('High heart-rate events, per-patient analytics and request tracking.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(config.get('port', { infer: true }), '0.0.0.0');
}

void bootstrap();
