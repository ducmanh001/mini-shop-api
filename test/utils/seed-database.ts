import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { SALT_ROUNDS } from '../../src/modules/users/constants/users.constants';
import { User } from '../../src/modules/users/entities/user.entity';
import { UserStatus } from '../../src/modules/users/enums/user-status.enum';

/**
 * 2 user cố định — dùng chung cho e2e cần một tài khoản ACTIVE có sẵn (login, ownership...).
 * `seed_bob` (ADMIN) chưa có test nào dùng ở PR06 — chuẩn bị sẵn cho PR08 (admin routes) cần một
 * tài khoản ADMIN ACTIVE để test RBAC, tránh mỗi e2e admin phải tự tạo user ADMIN riêng.
 */
export const SEED_PASSWORD = 'Seed@12345';
export const SEED_ALICE_EMAIL = 'seed_alice@example.test';
export const SEED_BOB_EMAIL = 'seed_bob@example.test';

export async function seedDatabase(dataSource: DataSource): Promise<void> {
  const usersRepository = dataSource.getRepository(User);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  await usersRepository.save([
    usersRepository.create({
      email: SEED_ALICE_EMAIL,
      username: 'seed_alice',
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    }),
    usersRepository.create({
      email: SEED_BOB_EMAIL,
      username: 'seed_bob',
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    }),
  ]);
}
