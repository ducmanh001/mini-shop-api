import { AuthToken } from '../entities/auth-token.entity';

export interface CreateAuthTokenResult {
  authToken: AuthToken;
  rawToken: string;
}
