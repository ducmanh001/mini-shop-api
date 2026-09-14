import { UserRole } from '../enums/user-role.enum';
import type { UserStatus } from '../../modules/users/enums/user-status.enum';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  status: UserStatus.ACTIVE;
  tokenId: string;
  tokenVersion: number;
}
