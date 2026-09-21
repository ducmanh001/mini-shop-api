import { Product } from '../../products/entities/product.entity';

/** Cột đủ dùng để khoá + định giá 1 dòng checkout, không tải nguyên `Product` (database.md mục 6). */
export type LockedProductForCheckout = Pick<
  Product,
  'id' | 'categoryId' | 'name' | 'sku' | 'priceVnd' | 'stock' | 'isActive'
>;
