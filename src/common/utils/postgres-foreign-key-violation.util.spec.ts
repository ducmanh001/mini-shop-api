import { QueryFailedError } from 'typeorm';
import { getViolatedConstraint } from './postgres-unique-violation.util';
import { isForeignKeyViolation } from './postgres-foreign-key-violation.util';

function queryError(code: string, constraint?: string): QueryFailedError {
  return new QueryFailedError(
    'DELETE FROM categories ...',
    [],
    Object.assign(new Error('database error'), { code, constraint }),
  );
}

describe('PostgreSQL foreign key violation helpers', () => {
  it('recognizes SQLSTATE 23503 and exposes its constraint', () => {
    const error = queryError('23503', 'products_category_id_fkey');

    expect(isForeignKeyViolation(error)).toBe(true);
    expect(getViolatedConstraint(error)).toBe('products_category_id_fkey');
  });

  it('rejects other database and application errors', () => {
    expect(isForeignKeyViolation(queryError('23505'))).toBe(false);
    expect(isForeignKeyViolation(new Error('not a database error'))).toBe(
      false,
    );
  });
});
