/** Một dòng order_item đã tính giá/tổng từ product đã khoá, trước khi insert (database.md mục 6). */
export interface CheckoutOrderItem {
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  unitPriceVnd: string;
  quantity: number;
  lineTotalVnd: string;
}
