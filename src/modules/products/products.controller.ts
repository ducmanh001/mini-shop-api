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
import { PRODUCTS_ROUTE_PATH } from './constants/products.constants';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import {
  ProductResponseDto,
  ProductsResponseDto,
} from './dto/product-response.dto';
import { ShareLinksResponseDto } from './dto/share-links-response.dto';
import { ProductsService } from './products.service';

/** PROD-01/02 (PR09) — danh sách/chi tiết sản phẩm công khai, kèm search/filter/featured. */
@ApiTags('products')
@Controller(PRODUCTS_ROUTE_PATH)
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

  @Get(':id/share-links')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get canonical/social share links for a product' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid id' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found or not visible',
  })
  async getShareLinks(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShareLinksResponseDto> {
    return this.productsService.getShareLinks(id);
  }
}
