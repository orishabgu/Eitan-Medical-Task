import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  API_KEY: Joi.string().min(8).required(),
  HIGH_HEART_RATE_THRESHOLD: Joi.number().integer().min(1).max(299).default(100),
  CORS_ORIGINS: Joi.string().default('*'),
  RATE_LIMIT_TTL_MS: Joi.number().integer().min(1).default(60_000),
  RATE_LIMIT_REQUESTS: Joi.number().integer().min(1).default(120),
});

export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  apiKey: process.env.API_KEY as string,
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((origin) => origin.trim()),
  highHeartRateThreshold: Number(process.env.HIGH_HEART_RATE_THRESHOLD ?? 100),
  rateLimit: {
    ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
    limit: Number(process.env.RATE_LIMIT_REQUESTS ?? 120),
  },
  database: {
    host: process.env.DATABASE_HOST as string,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER as string,
    password: process.env.DATABASE_PASSWORD as string,
    database: process.env.DATABASE_NAME as string,
  },
});

export type AppConfig = ReturnType<typeof configuration>;
