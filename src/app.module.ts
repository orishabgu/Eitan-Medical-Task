import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/exception.filter';
import { MaxRangeDaysConstraint } from './common/max-range.validator';
import { TransformInterceptor } from './common/transform.interceptor';
import { AppConfig, configuration, envValidationSchema } from './config/configuration';
import { HealthModule } from './health/health.module';
import { HeartRateModule } from './heart-rate/heart-rate.module';
import { PatientsModule } from './patients/patients.module';
import { RequestTrackingModule } from './request-tracking/request-tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const env = config.get('nodeEnv', { infer: true });
        return {
          pinoHttp: {
            level: { production: 'info', test: 'silent' }[env] ?? 'debug',
            transport: env === 'development' ? { target: 'pino-pretty' } : undefined,
            // Patient records are PHI; only ids ever reach the logs, never names or ages.
            redact: ['req.headers.authorization'],
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => [
        config.get('rateLimit', { infer: true }),
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): TypeOrmModuleOptions => {
        const database = config.get('database', { infer: true });
        return {
          type: 'postgres',
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.database,
          autoLoadEntities: true,
          // Schema changes go through migrations only.
          synchronize: false,
        };
      },
    }),
    PatientsModule,
    HeartRateModule,
    RequestTrackingModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    MaxRangeDaysConstraint,
  ],
})
export class AppModule {}
