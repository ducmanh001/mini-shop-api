import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AdminListSuggestionsQueryDto } from './dto/admin-list-suggestions-query.dto';
import { ProductSuggestionDetailResponseDto } from './dto/product-suggestion-detail-response.dto';
import {
  ProductSuggestionResponseDto,
  ProductSuggestionsResponseDto,
} from './dto/product-suggestion-response.dto';
import { ReviewSuggestionDto } from './dto/review-suggestion.dto';
import { ProductSuggestionsService } from './product-suggestions.service';

/** SUGGEST-03/04/05 (PR14) — admin list/detail/approve/reject; reject bắt buộc reason. */
@ApiTags('admin-product-suggestions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/product-suggestions')
export class AdminProductSuggestionsController {
  constructor(
    private readonly productSuggestionsService: ProductSuggestionsService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List product suggestions (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  async list(
    @Query() query: AdminListSuggestionsQueryDto,
  ): Promise<ProductSuggestionsResponseDto> {
    return this.productSuggestionsService.listForAdmin(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a product suggestion by id (admin)' })
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
    description: 'Suggestion not found',
  })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductSuggestionDetailResponseDto> {
    return this.productSuggestionsService.getDetailForAdmin(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a PENDING suggestion (admin)' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed (e.g. missing reason for REJECTED)',
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
    description: 'Suggestion not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Suggestion is no longer PENDING',
  })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewSuggestionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ProductSuggestionResponseDto> {
    return this.productSuggestionsService.reviewByAdmin(
      id,
      currentUser.id,
      dto,
    );
  }
}
