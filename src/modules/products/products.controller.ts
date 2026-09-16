import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import {
  ProductResponseDto,
  ProductsResponseDto,
} from './dto/product-response.dto';
import { ProductsService } from './products.service';

/** PROD-01/02 (PR09) — danh sách/chi tiết sản phẩm công khai, kèm search/filter/featured. */
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List/search visible products' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid query (range, format)',
  })
  async listProducts(
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductsResponseDto> {
    return this.productsService.listPublicProducts(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a visible product by id' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid id' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found or not visible',
  })
  async getProduct(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    return this.productsService.getPublicProductDetail(id);
  }
}
