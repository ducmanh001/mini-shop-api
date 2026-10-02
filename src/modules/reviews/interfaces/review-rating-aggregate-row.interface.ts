/** Dòng raw của aggregate query — `COUNT(...)` trả `bigint` nên pg gửi về dạng chuỗi. */
export interface ReviewRatingAggregateRow {
  reviewsCount: string;
  averageRating: string | null;
}
