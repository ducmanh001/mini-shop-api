import { Category } from '../../categories/entities/category.entity';

/** Chỉ đủ field để hiển thị category lồng trong `ProductResponse`, không phải toàn bộ entity. */
export type CategoryDisplayFields = Pick<Category, 'id' | 'name' | 'isActive'>;
