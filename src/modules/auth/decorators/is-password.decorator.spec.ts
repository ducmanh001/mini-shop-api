import { validate } from 'class-validator';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from '../constants/auth.constants';
import { IsPassword } from './is-password.decorator';

class PasswordTestDto {
  @IsPassword()
  password: string;
}

async function validatePassword(password: string) {
  const dto = new PasswordTestDto();
  dto.password = password;
  return validate(dto);
}

describe('IsPassword', () => {
  it('accepts a password within the allowed length', async () => {
    expect(await validatePassword('ValidPass123')).toHaveLength(0);
  });

  it('rejects a password shorter than the minimum length', async () => {
    const errors = await validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a password longer than the max byte length', async () => {
    const errors = await validatePassword('a'.repeat(MAX_PASSWORD_BYTES + 1));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects based on UTF-8 byte length, not character count, for multi-byte input', async () => {
    // 3 bytes/char in UTF-8; 25 chars = 75 bytes > MAX_PASSWORD_BYTES even though 25 < 72.
    const errors = await validatePassword('本'.repeat(25));
    expect(errors.length).toBeGreaterThan(0);
  });
});
