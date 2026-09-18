/**
 * Giới hạn số lượng của MỘT dòng sản phẩm — dùng chung cho `cart_items.quantity` và
 * `order_items.quantity` vì order_items là snapshot của đúng dòng cart tại thời điểm checkout,
 * cùng một bất biến nghiệp vụ (mục 4 database.md), không phải trùng số ngẫu nhiên. `orders` module
 * đã có dependency `→ cart` sẵn (CODING_STANDARD mục 10) nên import thẳng từ đây, không định nghĩa
 * lại (mục 15).
 */
export const MAX_LINE_ITEM_QUANTITY = 99;
/** Cùng lý do dùng chung với `MAX_LINE_ITEM_QUANTITY` — cận dưới của cùng 1 bất biến. */
export const MIN_LINE_ITEM_QUANTITY = 1;
/** Rule ở tầng service (mục 4 database.md) — DB không CHECK được "tối đa N dòng/user". */
export const MAX_CART_LINES_PER_USER = 20;
