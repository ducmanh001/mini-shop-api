import { ApiProperty } from '@nestjs/swagger';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderHistorySource } from '../interfaces/order-history-source.interface';
import { OrderItemSource } from '../interfaces/order-item-source.interface';

/** `items` trong `OrderResponse` — snapshot bất biến, không có SKU (api-contract.md dòng 348). */
export class OrderItemFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  unitPriceVnd: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  lineTotalVnd: string;

  static fromEntity(item: OrderItemSource): OrderItemFields {
    const fields = new OrderItemFields();
    fields.id = item.id;
    fields.productId = item.productId;
    fields.productName = item.productNameSnapshot;
    fields.unitPriceVnd = item.unitPriceVnd;
    fields.quantity = item.quantity;
    fields.lineTotalVnd = item.lineTotalVnd;
    return fields;
  }
}

/** `history` trong `OrderResponse` — chỉ append, tăng dần theo `createdAt, id` (api-contract.md dòng 358). */
export class OrderHistoryFields {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  fromStatus: OrderStatus | null;

  @ApiProperty({ enum: OrderStatus })
  toStatus: OrderStatus;

  @ApiProperty()
  changedByUserId: string | null;

  @ApiProperty({ nullable: true })
  reason: string | null;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(entry: OrderHistorySource): OrderHistoryFields {
    const fields = new OrderHistoryFields();
    fields.id = entry.id;
    fields.fromStatus = entry.fromStatus;
    fields.toStatus = entry.toStatus;
    fields.changedByUserId = entry.actorUserId;
    fields.reason = entry.reason;
    fields.createdAt = entry.createdAt;
    return fields;
  }
}

class OrderFields {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty()
  paymentMethod: string;

  @ApiProperty()
  recipientName: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  address: string;

  @ApiProperty({ nullable: true })
  customerNote: string | null;

  @ApiProperty()
  totalVnd: string;

  @ApiProperty({ type: [OrderItemFields] })
  items: OrderItemFields[];

  @ApiProperty({ type: [OrderHistoryFields] })
  history: OrderHistoryFields[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** `OrderResponse` — dùng chung cho tạo đơn (PR12) và detail/cancel/admin transition (PR13). */
export class OrderResponseDto {
  @ApiProperty({ type: OrderFields })
  order: OrderFields;

  static fromEntity(
    order: Order,
    items: OrderItemSource[],
    history: OrderHistorySource[],
  ): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.order = {
      id: order.id,
      userId: order.userId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      recipientName: order.recipientName,
      phone: order.phone,
      address: order.addressSnapshot,
      customerNote: order.customerNote,
      totalVnd: order.totalVnd,
      items: items.map((item) => OrderItemFields.fromEntity(item)),
      history: history.map((entry) => OrderHistoryFields.fromEntity(entry)),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
    return dto;
  }
}
