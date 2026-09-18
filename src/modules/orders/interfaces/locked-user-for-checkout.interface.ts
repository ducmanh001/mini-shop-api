import { User } from '../../users/entities/user.entity';

/** Cột đủ dùng sau khi khoá row `users` lúc checkout — email để tạo `email_notifications`. */
export type LockedUserForCheckout = Pick<User, 'id' | 'email'>;
