import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
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
import { CartService } from './cart.service';
import { CartResponseDto } from './dto/cart-response.dto';
import { SetCartItemDto } from './dto/set-cart-item.dto';

/** CART-01..03 (PR11) — giỏ hàng của chính customer đang đăng nhập (api-requirements.csv). */
@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the current customer's cart" })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not a CUSTOMER',
  })
  async getCart(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<CartResponseDto> {
    return this.cartService.getCart(currentUser.id);
  }

  @Put('items/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the quantity of a product in the cart' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid productId or quantity',
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
    description: 'Quantity exceeds stock, or cart already has 20 products',
  })
  async setCartItem(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetCartItemDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<CartResponseDto> {
    return this.cartService.setCartItem(
      currentUser.id,
      productId,
      dto.quantity,
    );
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a product from the cart' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid productId',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not a CUSTOMER',
  })
  async removeCartItem(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<void> {
    return this.cartService.removeCartItem(currentUser.id, productId);
  }
}
