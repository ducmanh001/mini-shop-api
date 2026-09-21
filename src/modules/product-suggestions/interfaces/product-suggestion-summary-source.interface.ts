import { ProductSuggestion } from '../entities/product-suggestion.entity';

/** Cột đủ dùng để dựng `ProductSuggestionSummaryFields` trong `ProductSuggestionsResponse` — bỏ `description`. */
export type ProductSuggestionSummarySource = Pick<
  ProductSuggestion,
  | 'id'
  | 'customerId'
  | 'name'
  | 'categoryName'
  | 'status'
  | 'reviewedBy'
  | 'reviewReason'
  | 'reviewedAt'
  | 'createdAt'
  | 'updatedAt'
>;
