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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CategoriesService } from './categories.service';
import { AdminListCategoriesQueryDto } from './dto/admin-list-categories-query.dto';
import {
  CategoriesResponseDto,
  CategoryResponseDto,
} from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { PatchCategoryDto } from './dto/patch-category.dto';

/** CAT-02..05 (PR09) — CRUD danh mục, chỉ ADMIN (api-requirements.csv). */
@ApiTags('admin-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List categories, including inactive (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  async listCategories(
    @Query() query: AdminListCategoriesQueryDto,
  ): Promise<CategoriesResponseDto> {
    return this.categoriesService.listAdminCategories(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a category (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Slug already taken',
  })
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.createCategory(dto, currentUser.id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a category (admin)' })
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
    description: 'Category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Slug already taken',
  })
  async patchCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchCategoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.patchCategory(id, dto, currentUser.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an empty category (admin)' })
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
    description: 'Category still has products (including archived)',
  })
  async deleteCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<void> {
    return this.categoriesService.deleteCategory(id, currentUser.id);
  }
}
