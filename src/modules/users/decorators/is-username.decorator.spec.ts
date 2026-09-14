import { validate } from 'class-validator';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../constants/users.constants';
import { IsUsername } from './is-username.decorator';

class UsernameTestDto {
  @IsUsername()
  username: string;
}

async function validateUsername(username: string) {
  const dto = new UsernameTestDto();
  dto.username = username;
  return validate(dto);
}

describe('IsUsername', () => {
  it('accepts a lowercase alphanumeric username with underscores', async () => {
    expect(await validateUsername('valid_user_1')).toHaveLength(0);
  });

  it('rejects a username shorter than the minimum length', async () => {
    const errors = await validateUsername('a'.repeat(USERNAME_MIN_LENGTH - 1));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a username longer than the maximum length', async () => {
    const errors = await validateUsername('a'.repeat(USERNAME_MAX_LENGTH + 1));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects uppercase letters and other disallowed characters', async () => {
    expect((await validateUsername('Invalid-User')).length).toBeGreaterThan(0);
    expect((await validateUsername('has space')).length).toBeGreaterThan(0);
  });
});
