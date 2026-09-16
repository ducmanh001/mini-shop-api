import { QueryFailedError } from 'typeorm';

const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

/** `getViolatedConstraint()` cho error này dùng chung bản ở `postgres-unique-violation.util.ts`. */
export function isForeignKeyViolation(
  error: unknown,
): error is QueryFailedError {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string })?.code ===
      POSTGRES_FOREIGN_KEY_VIOLATION
  );
}
