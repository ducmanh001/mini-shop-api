import { canonicalizeForHash } from './idempotency.util';

describe('canonicalizeForHash', () => {
  it('produces the same string regardless of key order', () => {
    const a = canonicalizeForHash({ phone: '123', recipientName: 'An' });
    const b = canonicalizeForHash({ recipientName: 'An', phone: '123' });

    expect(a).toBe(b);
  });

  it('produces a different string when a value differs', () => {
    const a = canonicalizeForHash({ recipientName: 'An' });
    const b = canonicalizeForHash({ recipientName: 'Binh' });

    expect(a).not.toBe(b);
  });

  it('sorts keys recursively inside nested objects', () => {
    const a = canonicalizeForHash({ outer: { b: 1, a: 2 } });
    const b = canonicalizeForHash({ outer: { a: 2, b: 1 } });

    expect(a).toBe(b);
  });

  it('preserves array order instead of sorting elements', () => {
    const result = canonicalizeForHash({ items: [2, 1] });

    expect(result).toBe('{"items":[2,1]}');
  });

  it('treats null and undefined-omitted fields as distinct from each other', () => {
    const withNull = canonicalizeForHash({ note: null });
    const withoutField = canonicalizeForHash({});

    expect(withNull).not.toBe(withoutField);
  });
});
