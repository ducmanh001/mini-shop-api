/** Tổng hợp rating theo TOÀN BỘ review của product (không phải chỉ trang hiện tại). */
export interface ReviewRatingAggregate {
  reviewsCount: number;
  /** Chuỗi một chữ số thập phân (vd `"4.5"`), `null` nếu product chưa có review. */
  averageRating: string | null;
}
