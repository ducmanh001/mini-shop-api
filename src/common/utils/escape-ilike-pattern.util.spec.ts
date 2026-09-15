import { escapeIlikePattern } from './escape-ilike-pattern.util';

describe('escapeIlikePattern', () => {
  it('escapes % so it is matched literally instead of as a wildcard', () => {
    expect(escapeIlikePattern('50%off')).toBe('50\\%off');
  });

  it('escapes _ so it is matched literally instead of as a single-char wildcard', () => {
    expect(escapeIlikePattern('user_name')).toBe('user\\_name');
  });

  it('escapes a literal backslash first so it does not double-escape the following char', () => {
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b');
  });

  it('leaves plain text untouched', () => {
    expect(escapeIlikePattern('alice')).toBe('alice');
  });
});
