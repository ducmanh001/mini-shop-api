import { ProductSuggestion } from '../entities/product-suggestion.entity';

/**
 * Cột đủ dùng để dựng `ProductSuggestionDetailResponse` (admin). Chỉ join `customer.id`/`username` —
 * không lộ email/password/token (api-requirements.csv dòng 56).
 */
export type ProductSuggestionDetailSource = Pick<
  ProductSuggestion,
  | 'id'
  | 'name'
  | 'description'
  | 'categoryName'
  | 'status'
  | 'reviewedBy'
  | 'reviewReason'
  | 'reviewedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  customer: { id: string; username: string };
};
