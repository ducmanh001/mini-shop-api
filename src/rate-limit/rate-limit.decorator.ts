import { applyDecorators, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { RateLimitGuard } from './rate-limit.guard';

/** Gắn rate limit cho một route và khai luôn `429` trong Swagger (CODING_STANDARD.md mục 19). */
export function RateLimited(): MethodDecorator {
  return applyDecorators(
    UseGuards(RateLimitGuard),
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      description: 'Too many requests, see the Retry-After header',
    }),
  );
}
