import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  ORDER_EXPORT_FILENAME,
  XLSX_CONTENT_TYPE,
} from './constants/orders.constants';
import { AdminListOrdersQueryDto } from './dto/admin-list-orders-query.dto';
import { ExportOrdersQueryDto } from './dto/export-orders-query.dto';
import { OrderResponseDto, OrdersResponseDto } from './dto/order-response.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

/** ORDER-05/06/07 (PR13) — list/detail/state machine cho ADMIN (api-requirements.csv). */
@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List orders (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  async list(
    @Query() query: AdminListOrdersQueryDto,
  ): Promise<OrdersResponseDto> {
    return this.ordersService.listForAdmin(query);
  }

  /** Đặt trước `:id` — cố định, không phải ORDER-0x có sẵn, chỉ để đường route tĩnh khớp trước dynamic. */
  @Get('export')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', XLSX_CONTENT_TYPE)
  @Header(
    'Content-Disposition',
    `attachment; filename="${ORDER_EXPORT_FILENAME}"`,
  )
  @ApiOperation({ summary: 'Export orders as an Excel (.xlsx) file (admin)' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  async export(
    @Query() query: ExportOrdersQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<StreamableFile> {
    return this.ordersService.exportForAdmin(currentUser.id, query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get any order by id (admin)' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Authenticated but not an ADMIN',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Order not found' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getDetailForAdmin(id);
  }

  /** PENDING→CONFIRMED/REJECTED, CONFIRMED→COMPLETED; reject bắt buộc `reason` (api-contract.md dòng 442-452). */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move an order to the next status (admin)' })
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
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Order not found' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Order cannot move from its current status to the requested one',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<OrderResponseDto> {
    return this.ordersService.updateStatusByAdmin(id, currentUser.id, dto);
  }
}
