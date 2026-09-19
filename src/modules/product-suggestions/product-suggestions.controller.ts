import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { ListSuggestionsQueryDto } from './dto/list-suggestions-query.dto';
import {
  ProductSuggestionResponseDto,
  ProductSuggestionsResponseDto,
} from './dto/product-suggestion-response.dto';
import { ProductSuggestionsService } from './product-suggestions.service';

/** SUGGEST-01/02 (PR14) — customer tạo và xem suggestion của chính mình. */
@ApiTags('product-suggestions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('product-suggestions')
export class ProductSuggestionsController {
  constructor(
    private readonly productSuggestionsService: ProductSuggestionsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a product suggestion' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Suggestion created with status PENDING',
    type: ProductSuggestionResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid body' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not a CUSTOMER',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Same customer already has a PENDING suggestion with this name',
  })
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateSuggestionDto,
  ): Promise<ProductSuggestionResponseDto> {
    return this.productSuggestionsService.create(currentUser.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List the current customer's own suggestions" })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not a CUSTOMER',
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListSuggestionsQueryDto,
  ): Promise<ProductSuggestionsResponseDto> {
    return this.productSuggestionsService.listForCustomer(
      currentUser.id,
      query,
    );
  }
}
