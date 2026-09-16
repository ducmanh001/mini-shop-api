import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { AdminUsersController } from './admin-users.controller';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * `Order` chỉ đăng ký entity qua `TypeOrmModule.forFeature` để `UsersService.getAdminUserDetail`
 * đếm `orderCount` — không import `OrdersModule` (đã `→ users`, import ngược sẽ tạo circular
 * dependency). Đây là phụ thuộc entity-level, không phải module-level (CODING_STANDARD.md mục 10,
 * cùng pattern với `reviews → orders` dùng `EXISTS`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Order])],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
