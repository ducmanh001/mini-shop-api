import { ProductSuggestion } from '../entities/product-suggestion.entity';

/** Cột đủ dùng để dựng `ProductSuggestionFields` — response của create/review (api-contract.md dòng 497/503). */
export type ProductSuggestionFullSource = Pick<
  ProductSuggestion,
  | 'id'
  | 'customerId'
  | 'name'
  | 'description'
  | 'categoryName'
  | 'status'
  | 'reviewedBy'
  | 'reviewReason'
  | 'reviewedAt'
  | 'createdAt'
  | 'updatedAt'
>;
