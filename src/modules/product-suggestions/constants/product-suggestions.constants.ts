import { ProductSuggestionStatus } from '../enums/product-suggestion-status.enum';

export const MIN_SUGGESTION_NAME_LENGTH = 2;
export const MAX_SUGGESTION_NAME_LENGTH = 200;

/** `CreateSuggestionRequest.description` — api-contract.md dòng 499, non-blank khi có. */
export const MIN_SUGGESTION_DESCRIPTION_LENGTH = 1;
export const MAX_SUGGESTION_DESCRIPTION_LENGTH = 2000;

/** `CreateSuggestionRequest.categoryName` — api-contract.md dòng 500, non-blank khi có. */
export const MIN_SUGGESTION_CATEGORY_NAME_LENGTH = 1;
export const MAX_SUGGESTION_CATEGORY_NAME_LENGTH = 100;

/** `ReviewSuggestionRequest.reason` — bắt buộc khi REJECTED, api-contract.md dòng 505. */
export const MAX_SUGGESTION_REVIEW_REASON_LENGTH = 500;

/** `GET /admin/product-suggestions` keyword filter — api-requirements.csv dòng 55. */
export const SUGGESTION_SEARCH_KEYWORD_MAX_LENGTH = 100;

/** Target status admin được phép gửi trong `ReviewSuggestionRequest` — chỉ review đúng một lần từ PENDING. */
export const ADMIN_SUGGESTION_REVIEW_TARGETS = [
  ProductSuggestionStatus.APPROVED,
  ProductSuggestionStatus.REJECTED,
] as const;
