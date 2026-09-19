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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { IDEMPOTENCY_KEY_HEADER } from './constants/orders.constants';
import { IdempotencyKey } from './decorators/idempotency-key.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderResponseDto, OrdersResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

/** ORDER-01 (PR12) — checkout COD của chính customer đang đăng nhập (api-contract.md dòng 35). */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Checkout the current cart as a COD order' })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    description:
      'Client-generated UUID; replaying the same key+body returns the same order',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Order created',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Same Idempotency-Key + body replayed: same order returned',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid body, or missing/malformed Idempotency-Key',
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
    status: HttpStatus.CONFLICT,
    description:
      'Empty cart, a product/category no longer available, insufficient stock, or same key with a different body',
  })
  async checkout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @IdempotencyKey(new ParseUUIDPipe()) idempotencyKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderResponseDto> {
    const { order: orderResponse, isNew } = await this.ordersService.checkout(
      currentUser.id,
      dto,
      idempotencyKey,
    );
    res.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    res.location(`${req.path}/${orderResponse.order.id}`);
    return orderResponse;
  }

  /** ORDER-02 (PR13) — lịch sử đơn của chính customer đang đăng nhập. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List the current customer orders' })
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
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrdersResponseDto> {
    return this.ordersService.listForCustomer(currentUser.id, query);
  }

  /** ORDER-03 (PR13) — chi tiết + trạng thái đơn; đơn của user khác trả 404 (api-contract.md dòng 15). */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an order owned by the current customer' })
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
    description: 'Order not found or not owned by the current customer',
  })
  async getById(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getDetailForCustomer(currentUser.id, id);
  }

  /** ORDER-04 (PR13) — chỉ chủ đơn, chỉ khi còn PENDING; hoàn tồn đúng một lần (api-contract.md dòng 449). */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a PENDING order owned by the current customer',
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
    description: 'Order not found or not owned by the current customer',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Order is no longer PENDING',
  })
  async cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.cancel(currentUser.id, id);
  }
}
