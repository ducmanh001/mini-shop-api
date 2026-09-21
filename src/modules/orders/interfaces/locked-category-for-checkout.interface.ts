import { Category } from '../../categories/entities/category.entity';

/** Cột đủ dùng để khoá + kiểm visibility category lúc checkout (database.md mục 6). */
export type LockedCategoryForCheckout = Pick<Category, 'id' | 'isActive'>;
