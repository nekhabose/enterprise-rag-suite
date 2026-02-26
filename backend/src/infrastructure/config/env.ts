import dotenv from 'dotenv';

dotenv.config();

export const env = {
  AI_SERVICE_URL:
    process.env.AI_SERVICE_URL?.trim() ||
    `http://${process.env.AI_SERVICE_HOST?.trim() || 'localhost'}:${process.env.AI_SERVICE_PORT?.trim() || '8000'}`,
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION_32_CHARS_MIN',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '8h',
  REFRESH_EXPIRY: process.env.REFRESH_EXPIRY || '7d',
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || 'refreshToken',
  PORT: Number(process.env.PORT || 3001),
  NODE_ENV: process.env.NODE_ENV || 'development',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001',
};
