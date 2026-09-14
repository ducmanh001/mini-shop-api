import { validate } from 'class-validator';
import {
  AUTH_TOKEN_MAX_LENGTH,
  AUTH_TOKEN_MIN_LENGTH,
} from '../constants/auth.constants';
import { IsAuthToken } from './is-auth-token.decorator';

class TokenTestDto {
  @IsAuthToken()
  token: string;
}

async function validateToken(token: string) {
  const dto = new TokenTestDto();
  dto.token = token;
  return validate(dto);
}

describe('IsAuthToken', () => {
  it('accepts a token within the allowed length', async () => {
    expect(await validateToken('a'.repeat(64))).toHaveLength(0);
  });

  it('rejects a token shorter than the minimum length', async () => {
    const errors = await validateToken('a'.repeat(AUTH_TOKEN_MIN_LENGTH - 1));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a token longer than the maximum length', async () => {
    const errors = await validateToken('a'.repeat(AUTH_TOKEN_MAX_LENGTH + 1));
    expect(errors.length).toBeGreaterThan(0);
  });
});
