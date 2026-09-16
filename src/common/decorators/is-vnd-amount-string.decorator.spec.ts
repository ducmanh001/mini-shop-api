import { validate } from 'class-validator';
import { IsVndAmountString } from './is-vnd-amount-string.decorator';

class VndAmountTestDto {
  @IsVndAmountString(1, 1_000_000_000)
  priceVnd: string;
}

async function validateAmount(value: unknown) {
  const dto = new VndAmountTestDto();
  dto.priceVnd = value as string;
  return validate(dto);
}

describe('IsVndAmountString', () => {
  it('accepts a digit-only string within bounds', async () => {
    expect(await validateAmount('150000')).toHaveLength(0);
  });

  it('accepts the exact min and max bounds', async () => {
    expect(await validateAmount('1')).toHaveLength(0);
    expect(await validateAmount('1000000000')).toHaveLength(0);
  });

  it('rejects a value below the minimum', async () => {
    const errors = await validateAmount('0');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a value above the maximum', async () => {
    const errors = await validateAmount('1000000001');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-digit strings (decimals, signs, letters)', async () => {
    expect((await validateAmount('150000.5')).length).toBeGreaterThan(0);
    expect((await validateAmount('-1')).length).toBeGreaterThan(0);
    expect((await validateAmount('abc')).length).toBeGreaterThan(0);
    expect((await validateAmount('')).length).toBeGreaterThan(0);
  });

  it('rejects non-string values without throwing', async () => {
    expect((await validateAmount(150000)).length).toBeGreaterThan(0);
    expect((await validateAmount(null)).length).toBeGreaterThan(0);
  });
});
