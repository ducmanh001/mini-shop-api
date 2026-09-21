import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { EmailNotification } from '../src/modules/notifications/entities/email-notification.entity';
import { EmailNotificationEventType } from '../src/modules/notifications/enums/email-notification-event-type.enum';
import { Product } from '../src/modules/products/entities/product.entity';
import { SALT_ROUNDS } from '../src/modules/users/constants/users.constants';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import { SEED_BOB_EMAIL, SEED_PASSWORD } from './utils/seed-database';

interface OrderBody {
  order: {
    id: string;
    userId: string;
    status: string;
    totalVnd: string;
    history: {
      fromStatus: string | null;
      toStatus: string;
      reason: string | null;
    }[];
  };
}

interface OrdersListBody {
  orders: { id: string; userId: string; status: string }[];
  ordersCount: number;
}

/**
 * ORDER-02..07 (PR13) end-to-end: customer history/detail/cancel, admin list/detail/state machine,
 * race between customer cancel and admin confirm/reject (CODING_STANDARD.md mục 22).
 */
describe('Order lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let productsRepository: Repository<Product>;
  let usersRepository: Repository<User>;
  let notificationsRepository: Repository<EmailNotification>;

  beforeAll(async () => {
    app = await createTestApp();
    productsRepository = app.get(getRepositoryToken(Product));
    usersRepository = app.get(getRepositoryToken(User));
    notificationsRepository = app.get(getRepositoryToken(EmailNotification));
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: SEED_PASSWORD })
      .expect(200);
    return (response.body as { user: { token: string } }).user.token;
  }

  function uniqueSuffix(): string {
    return randomUUID().replace(/-/g, '').slice(0, 10);
  }

  async function createCustomerToken(): Promise<string> {
    const suffix = uniqueSuffix();
    const email = `order-lifecycle-${suffix}@example.test`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    await usersRepository.save(
      usersRepository.create({
        email,
        username: `order_lifecycle_${suffix}`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      }),
    );
    return loginAs(email);
  }

  async function createCategoryAsAdmin(
    adminToken: string,
  ): Promise<{ id: string }> {
    const suffix = uniqueSuffix();
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Category ${suffix}`,
        slug: `category-${suffix}`,
        isActive: true,
      })
      .expect(201);
    return (response.body as { category: { id: string } }).category;
  }

  async function createProductAsAdmin(
    adminToken: string,
    categoryId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; stock: number }> {
    const suffix = uniqueSuffix();
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        name: `Product ${suffix}`,
        description: 'Fixture description',
        sku: `SKU-${suffix.toUpperCase()}`,
        priceVnd: '150000',
        stock: 10,
        isActive: true,
        isFeatured: false,
        ...overrides,
      })
      .expect(201);
    return (response.body as { product: { id: string; stock: number } })
      .product;
  }

  async function addToCart(
    token: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await request(app.getHttpServer())
      .put(`/api/v1/cart/items/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity })
      .expect(200);
  }

  async function checkout(token: string): Promise<OrderBody> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Nguyen An',
        phone: '+84901234567',
        address: '123 Sample Street, Hanoi',
      })
      .expect(201);
    return response.body as OrderBody;
  }

  function cancelRequest(token: string, orderId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
  }

  function adminStatusRequest(
    adminToken: string,
    orderId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  /** Tạo 1 order PENDING mới cho 1 customer mới với 1 product mới; trả kèm đủ dữ liệu để assert. */
  async function setupPendingOrder(
    adminToken: string,
    options: { stock?: number; quantity?: number } = {},
  ): Promise<{
    customerToken: string;
    orderId: string;
    productId: string;
    quantity: number;
    stock: number;
  }> {
    const stock = options.stock ?? 5;
    const quantity = options.quantity ?? 2;
    const customerToken = await createCustomerToken();
    const category = await createCategoryAsAdmin(adminToken);
    const product = await createProductAsAdmin(adminToken, category.id, {
      stock,
    });
    await addToCart(customerToken, product.id, quantity);
    const { order } = await checkout(customerToken);
    return {
      customerToken,
      orderId: order.id,
      productId: product.id,
      quantity,
      stock,
    };
  }

  describe('GET /orders (ORDER-02)', () => {
    it('only returns orders owned by the current customer', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId } = await setupPendingOrder(adminToken);
      const otherToken = await createCustomerToken();

      const mine = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      const others = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      const mineBody = mine.body as OrdersListBody;
      expect(mineBody.orders.map((o) => o.id)).toContain(orderId);
      expect((others.body as OrdersListBody).orders).toHaveLength(0);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  describe('GET /orders/:id (ORDER-03)', () => {
    it("returns 404 for another customer's order", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId } = await setupPendingOrder(adminToken);
      const otherToken = await createCustomerToken();

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('returns the full order with items and history for its owner', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId } = await setupPendingOrder(adminToken);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const body = response.body as OrderBody;
      expect(body.order.id).toBe(orderId);
      expect(body.order.history).toEqual([
        expect.objectContaining({ fromStatus: null, toStatus: 'PENDING' }),
      ]);
    });
  });

  describe('POST /orders/:id/cancel (ORDER-04)', () => {
    it('cancels a PENDING order, restores stock exactly once, and appends history', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId, productId, stock } =
        await setupPendingOrder(adminToken);

      const response = await cancelRequest(customerToken, orderId).expect(200);

      const body = response.body as OrderBody;
      expect(body.order.status).toBe('CANCELLED');
      expect(body.order.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fromStatus: 'PENDING',
            toStatus: 'CANCELLED',
          }),
        ]),
      );
      const product = await productsRepository.findOne({
        where: { id: productId },
      });
      expect(product?.stock).toBe(stock);

      const notifications = await notificationsRepository.find({
        where: { orderId },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].eventType).toBe(
        EmailNotificationEventType.ORDER_PLACED,
      );
    });

    it('returns 409 when cancelling an order that is no longer PENDING', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId } = await setupPendingOrder(adminToken);
      await cancelRequest(customerToken, orderId).expect(200);

      await cancelRequest(customerToken, orderId).expect(409);
    });

    it("returns 404 when cancelling another customer's order", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId } = await setupPendingOrder(adminToken);
      const otherToken = await createCustomerToken();

      await cancelRequest(otherToken, orderId).expect(404);
    });
  });

  describe('GET /admin/orders + /admin/orders/:id (ORDER-05/06)', () => {
    it('rejects a CUSTOMER token with 403 on both routes', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId } = await setupPendingOrder(adminToken);

      await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/admin/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('filters the admin list by userId and status', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId } = await setupPendingOrder(adminToken);
      const meResponse = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      const userId = (meResponse.body as { user: { id: string } }).user.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/orders?userId=${userId}&status=PENDING`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as OrdersListBody;
      expect(body.orders.map((o) => o.id)).toContain(orderId);
      expect(body.orders.every((o) => o.userId === userId)).toBe(true);
    });

    it('returns any order by id regardless of owner', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId } = await setupPendingOrder(adminToken);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((response.body as OrderBody).order.id).toBe(orderId);
    });
  });

  describe('PATCH /admin/orders/:id/status (ORDER-07)', () => {
    it('confirms a PENDING order without touching stock further and sends ORDER_CONFIRMED', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId, productId, stock, quantity } =
        await setupPendingOrder(adminToken);

      const response = await adminStatusRequest(adminToken, orderId, {
        status: 'CONFIRMED',
      }).expect(200);

      expect((response.body as OrderBody).order.status).toBe('CONFIRMED');
      const product = await productsRepository.findOne({
        where: { id: productId },
      });
      expect(product?.stock).toBe(stock - quantity);
      const notification = await notificationsRepository.findOne({
        where: {
          orderId,
          eventType: EmailNotificationEventType.ORDER_CONFIRMED,
        },
      });
      expect(notification).not.toBeNull();
    });

    it('rejects with 400 when REJECTED is sent without a reason', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId } = await setupPendingOrder(adminToken);

      await adminStatusRequest(adminToken, orderId, {
        status: 'REJECTED',
      }).expect(400);
    });

    it('rejects with 400 when a reason is sent for CONFIRMED', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId } = await setupPendingOrder(adminToken);

      await adminStatusRequest(adminToken, orderId, {
        status: 'CONFIRMED',
        reason: 'not allowed here',
      }).expect(400);
    });

    it('rejects a PENDING order, restores stock exactly once, and sends ORDER_REJECTED', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId, productId, stock } = await setupPendingOrder(adminToken);

      const response = await adminStatusRequest(adminToken, orderId, {
        status: 'REJECTED',
        reason: 'Out of stock upstream',
      }).expect(200);

      const body = response.body as OrderBody;
      expect(body.order.status).toBe('REJECTED');
      expect(body.order.history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            toStatus: 'REJECTED',
            reason: 'Out of stock upstream',
          }),
        ]),
      );
      const product = await productsRepository.findOne({
        where: { id: productId },
      });
      expect(product?.stock).toBe(stock);
      const notification = await notificationsRepository.findOne({
        where: {
          orderId,
          eventType: EmailNotificationEventType.ORDER_REJECTED,
        },
      });
      expect(notification).not.toBeNull();
    });

    it('completes only a CONFIRMED order (PENDING -> COMPLETED is 409)', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { orderId } = await setupPendingOrder(adminToken);

      await adminStatusRequest(adminToken, orderId, {
        status: 'COMPLETED',
      }).expect(409);

      await adminStatusRequest(adminToken, orderId, {
        status: 'CONFIRMED',
      }).expect(200);
      const response = await adminStatusRequest(adminToken, orderId, {
        status: 'COMPLETED',
      }).expect(200);
      expect((response.body as OrderBody).order.status).toBe('COMPLETED');
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId } = await setupPendingOrder(adminToken);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'CONFIRMED' })
        .expect(403);
    });
  });

  describe('race: customer cancel vs admin confirm (CODING_STANDARD.md mục 22)', () => {
    it('lets exactly one transition win and restores stock at most once', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const { customerToken, orderId, productId, quantity, stock } =
        await setupPendingOrder(adminToken, { stock: 5, quantity: 2 });

      const [cancelResult, confirmResult] = await Promise.all([
        cancelRequest(customerToken, orderId),
        adminStatusRequest(adminToken, orderId, { status: 'CONFIRMED' }),
      ]);

      const statuses = [cancelResult.status, confirmResult.status].sort();
      expect(statuses).toEqual([200, 409]);

      const product = await productsRepository.findOne({
        where: { id: productId },
      });
      const cancelWon = cancelResult.status === 200;
      expect(product?.stock).toBe(cancelWon ? stock : stock - quantity);
    });
  });
});
