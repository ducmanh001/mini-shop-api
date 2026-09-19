export const MIN_PRODUCT_PRICE_VND = 1;
export const MAX_PRODUCT_PRICE_VND = 1_000_000_000;
/** `minPrice`/`maxPrice` filter cho phép 0 (không âm) — khác cận giá của chính product (>=1). */
export const MIN_PRODUCT_PRICE_FILTER_VND = 0;

export const PRODUCT_NAME_MAX_LENGTH = 200;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;
export const PRODUCT_SKU_MAX_LENGTH = 64;
export const PRODUCT_SEARCH_KEYWORD_MAX_LENGTH = 100;
export const MIN_PRODUCT_STOCK = 0;
export const MAX_PRODUCT_STOCK = 2_147_483_647;

/** Dùng cho `@Controller()` và để build lại đúng path đó khi ghép canonical URL (share-links). */
export const PRODUCTS_ROUTE_PATH = 'products';

/** `GET /products/:id/share-links` — api-contract.md dòng 492, không nhận base URL từ client. */
export const FACEBOOK_SHARE_BASE_URL =
  'https://www.facebook.com/sharer/sharer.php';
export const X_SHARE_BASE_URL = 'https://twitter.com/intent/tweet';
