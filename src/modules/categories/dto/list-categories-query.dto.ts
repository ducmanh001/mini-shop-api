import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** `GET /categories` — public, luôn lọc active, không nhận filter nào khác (api-contract.md mục 58). */
export class ListCategoriesQueryDto extends PaginationQueryDto {}
