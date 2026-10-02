import { PRODUCTS_ROUTE_PATH } from '../../products/constants/products.constants';

export const MIN_REVIEW_RATING = 1;
export const MAX_REVIEW_RATING = 5;
export const MAX_REVIEW_COMMENT_LENGTH = 2000;

/** Số chữ số thập phân của `averageRating` — làm tròn trong SQL để không dính sai số float của JS. */
export const AVERAGE_RATING_DECIMALS = 1;

export const REVIEWS_ROUTE_PATH = 'reviews';
/** `GET|POST /products/:id/reviews` — REVIEW-01/02 (api-requirements.csv). */
export const PRODUCT_REVIEWS_ROUTE_PATH = `${PRODUCTS_ROUTE_PATH}/:id/${REVIEWS_ROUTE_PATH}`;
