import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CategoriesResponseDto } from './dto/category-response.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';

/** CAT-01 (PR09) — danh mục đang hoạt động, public, không cần đăng nhập. */
@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List active categories' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid query' })
  async listCategories(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoriesResponseDto> {
    return this.categoriesService.listPublicCategories(query);
  }
}
