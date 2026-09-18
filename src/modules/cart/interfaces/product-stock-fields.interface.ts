import { Product } from '../../products/entities/product.entity';

/** Chỉ đủ field để kiểm visibility + tồn kho khi set dòng giỏ hàng, không phải toàn bộ entity. */
export type ProductStockFields = Pick<Product, 'id' | 'stock'>;
