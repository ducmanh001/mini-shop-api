import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { PRODUCT_REVIEWS_ROUTE_PATH } from './constants/reviews.constants';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import {
  ReviewResponseDto,
  ReviewsResponseDto,
} from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

/** REVIEW-01/02 (PR10) — list công khai và tạo review trên một product. */
@ApiTags('reviews')
@Controller(PRODUCT_REVIEWS_ROUTE_PATH)
export class ProductReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List reviews of a visible product' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Page of reviews plus count/average over all reviews',
    type: ReviewsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid id or pagination query',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found or not visible',
  })
  async listProductReviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<ReviewsResponseDto> {
    return this.reviewsService.listProductReviews(id, query);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Review a product the customer has purchased' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Review created',
    type: ReviewResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid id, rating or comment',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not a CUSTOMER',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found or not visible',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Customer has no COMPLETED order containing this product, or already reviewed it',
  })
  async createReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.createReview(currentUser.id, id, dto);
  }
}
