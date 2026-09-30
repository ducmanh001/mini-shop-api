import type { ThrottlerStorage } from '@nestjs/throttler';

/**
 * `@nestjs/throttler` không export kiểu này ở entry chính. Suy ra từ `increment()` thay vì import
 * `@nestjs/throttler/dist/...` — đường dẫn nội bộ có thể đổi giữa các bản minor.
 */
export type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;
