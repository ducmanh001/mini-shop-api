import * as Joi from 'joi';
import { NOTIFICATION_SECRET_KEY_LENGTH_BYTES } from '../common/utils/notification-secret-cipher.util';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  API_PREFIX: Joi.string().default('api/v1'),
  PUBLIC_WEB_URL: Joi.string().uri().required(),
  APP_TIMEZONE: Joi.string().default('Asia/Bangkok'),
  UPLOAD_DIR: Joi.string().default('storage/uploads'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().required(),
  // Bỏ trống cho Redis local (docker-compose, không cần auth). Managed Redis (Railway...) bắt buộc.
  REDIS_PASSWORD: Joi.string().optional(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.number().integer().positive().default(86400),

  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().port().required(),
  MAIL_FROM: Joi.string().email().required(),
  // Bỏ trống cho Mailpit (local/CI, không cần auth). SMTP thật (Mailtrap/Brevo/...) bắt buộc cả hai.
  MAIL_USER: Joi.string().optional(),
  MAIL_PASSWORD: Joi.string().optional(),
  MAIL_SECURE: Joi.boolean().default(false),
  // Có giá trị thì dùng Mailtrap Sending API (HTTP) thay SMTP — cần khi PaaS chặn outbound SMTP
  // (Railway, xác nhận thật lúc deploy PR19). Không set thì giữ nguyên đường SMTP phía trên.
  MAIL_API_TOKEN: Joi.string().optional(),

  // Deliberately separate key from JWT_SECRET — see notification-secret-cipher.util.ts.
  NOTIFICATION_SECRET_KEY: Joi.string()
    .custom((value: string, helpers) => {
      if (
        Buffer.from(value, 'base64').length !==
        NOTIFICATION_SECRET_KEY_LENGTH_BYTES
      ) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required(),
}).and('MAIL_USER', 'MAIL_PASSWORD');
