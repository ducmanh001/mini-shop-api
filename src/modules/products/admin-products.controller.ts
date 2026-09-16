import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AdminListProductsQueryDto } from './dto/admin-list-products-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { PatchProductDto } from './dto/patch-product.dto';
import {
  ProductResponseDto,
  ProductsResponseDto,
} from './dto/product-response.dto';
import { createProductImageUploadInterceptor } from './interceptors/product-image-upload.interceptor';
import { ProductsService } from './products.service';

/** PROD-03..06, FILE-02/03 (PR09) — CRUD sản phẩm + ảnh, chỉ ADMIN (api-requirements.csv). */
@ApiTags('admin-products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List products, including inactive (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  async listProducts(
    @Query() query: AdminListProductsQueryDto,
  ): Promise<ProductsResponseDto> {
    return this.productsService.listAdminProducts(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a product (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate SKU, or the category is inactive',
  })
  async createProduct(
    @Body() dto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.createProduct(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a product, including absolute stock (admin)',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Empty body or validation failed',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product or category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate SKU, or the category is inactive',
  })
  async patchProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.patchProduct(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a product (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async archiveProduct(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productsService.archiveProduct(id);
  }

  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(createProductImageUploadInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace a product image (admin)' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Missing or malformed file field',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  @ApiResponse({
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: 'File larger than 2 MiB',
  })
  @ApiResponse({
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    description: 'Not a genuine JPEG/PNG/WebP image',
  })
  async replaceProductImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProductResponseDto> {
    return this.productsService.replaceProductImage(id, file);
  }

  @Delete(':id/image')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a product image, if any (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async deleteProductImage(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.productsService.deleteProductImage(id);
  }
}
