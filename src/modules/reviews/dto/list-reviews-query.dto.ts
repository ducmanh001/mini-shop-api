import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** `GET /products/:id/reviews` — chỉ nhận `limit`, `offset` (api-contract.md dòng 58). */
export class ListReviewsQueryDto extends PaginationQueryDto {}
