/**
 * Dùng chung cho mọi list endpoint (api-contract.md — "Phân trang: limit=20 mặc định... áp dụng
 * mọi list trong CSV"), không phải riêng module nào — đặt ở `common/` theo CODING_STANDARD.md mục 10.
 */
export const DEFAULT_PAGE_LIMIT = 20;
export const MIN_PAGE_LIMIT = 1;
export const MAX_PAGE_LIMIT = 50;

export const DEFAULT_PAGE_OFFSET = 0;
export const MIN_PAGE_OFFSET = 0;
