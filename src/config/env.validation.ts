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

  // Số proxy tin cậy đứng trước app (Railway/nginx = 1). Để 0 khi chạy thẳng: `req.ip` là IP socket
  // thật và client không giả được `X-Forwarded-For`. Đặt sai (0 sau proxy) làm mọi client dùng chung
  // một IP nên rate limit theo IP thành giới hạn toàn hệ thống.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.number().integer().positive().default(86400),

  // Rate limit endpoint auth công khai (register/verify-email/login/forgot-password/reset-password):
  // theo IP và theo email trong body. Mặc định là giá trị an toàn cho production.
  THROTTLE_AUTH_IP_LIMIT: Joi.number().integer().positive().default(20),
  THROTTLE_AUTH_IP_TTL_SECONDS: Joi.number().integer().positive().default(60),
  THROTTLE_AUTH_ACCOUNT_LIMIT: Joi.number().integer().positive().default(10),
  THROTTLE_AUTH_ACCOUNT_TTL_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(900),

  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().port().required(),
  MAIL_FROM: Joi.string().email().required(),

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
});
