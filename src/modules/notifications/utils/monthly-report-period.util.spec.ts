import { getPreviousMonthBangkokRange } from './monthly-report-period.util';

describe('getPreviousMonthBangkokRange', () => {
  it('returns the previous month for a reference date early in the current Bangkok month', () => {
    // 2026-09-30T17:10:00Z = 2026-10-01T00:10:00+07:00 (cron tick for the October run)
    const referenceDate = new Date('2026-09-30T17:10:00.000Z');

    const range = getPreviousMonthBangkokRange(referenceDate);

    expect(range.reportPeriod).toBe('2026-09-01');
    expect(range.from.toISOString()).toBe('2026-08-31T17:00:00.000Z'); // 2026-09-01T00:00+07
    expect(range.to.toISOString()).toBe('2026-09-30T17:00:00.000Z'); // 2026-10-01T00:00+07
  });

  it('rolls the year over when the current Bangkok month is January', () => {
    // 2025-12-31T17:10:00Z = 2026-01-01T00:10:00+07:00
    const referenceDate = new Date('2025-12-31T17:10:00.000Z');

    const range = getPreviousMonthBangkokRange(referenceDate);

    expect(range.reportPeriod).toBe('2025-12-01');
    expect(range.from.toISOString()).toBe('2025-11-30T17:00:00.000Z'); // 2025-12-01T00:00+07
    expect(range.to.toISOString()).toBe('2025-12-31T17:00:00.000Z'); // 2026-01-01T00:00+07
  });

  it('follows the Bangkok-local calendar date, not the UTC calendar date', () => {
    // 2026-05-31T18:00:00Z is already 2026-06-01T01:00:00+07:00 in Bangkok — the 1st of June
    // locally even though UTC still shows 31 May.
    const referenceDate = new Date('2026-05-31T18:00:00.000Z');

    const range = getPreviousMonthBangkokRange(referenceDate);

    expect(range.reportPeriod).toBe('2026-05-01');
  });

  it('produces a half-open range spanning exactly the previous calendar month length', () => {
    // September has 30 days
    const referenceDate = new Date('2026-09-30T17:10:00.000Z');

    const range = getPreviousMonthBangkokRange(referenceDate);

    expect(range.to.getTime() - range.from.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });
});
