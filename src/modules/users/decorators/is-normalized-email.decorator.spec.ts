import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_EMAIL_LENGTH } from '../constants/users.constants';
import { IsNormalizedEmail } from './is-normalized-email.decorator';

class EmailTestDto {
  @IsNormalizedEmail()
  email: string;
}

function buildDto(email: unknown): EmailTestDto {
  return plainToInstance(EmailTestDto, { email });
}

describe('IsNormalizedEmail', () => {
  it('trims and lowercases the value before validation', () => {
    const dto = buildDto('  Alice@Example.TEST  ');
    expect(dto.email).toBe('alice@example.test');
  });

  it('accepts a valid, already-normalized email', async () => {
    expect(await validate(buildDto('alice@example.test'))).toHaveLength(0);
  });

  it('rejects a value that is not a valid email', async () => {
    const errors = await validate(buildDto('not-an-email'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an email longer than the maximum length', async () => {
    const tooLong = `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.test`;
    const errors = await validate(buildDto(tooLong));
    expect(errors.length).toBeGreaterThan(0);
  });
});
