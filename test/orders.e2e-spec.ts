import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { Product } from '../src/modules/products/entities/product.entity';
import { SALT_ROUNDS } from '../src/modules/users/constants/users.constants';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import {
  SEED_ALICE_EMAIL,
  SEED_BOB_EMAIL,
  SEED_PASSWORD,
} from './utils/seed-database';

interface OrderBody {
  order: {
    id: string;
    userId: string;
    status: string;
    totalVnd: string;
    recipientName: string;
    phone: string;
    address: string;
    customerNote: string | null;
    items: { productId: string; quantity: number; lineTotalVnd: string }[];
    history: { fromStatus: string | null; toStatus: string }[];
  };
}

/** ORDER-01 (PR12) end-to-end: transaction, stock lock, idempotency — api-contract.md dòng 35+438. */
describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: Repository<User>;
  let productsRepository: Repository<Product>;

  beforeAll(async () => {
    app = await createTestApp();
    usersRepository = app.get(getRepositoryToken(User));
    productsRepository = app.get(getRepositoryToken(Product));
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
    const email = `orders-customer-${suffix}@example.test`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    await usersRepository.save(
      usersRepository.create({
        email,
        username: `orders_customer_${suffix}`,
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

  function checkoutRequest(
    token: string,
    idempotencyKey: string,
    body: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        recipientName: 'Nguyen An',
        phone: '+84901234567',
        address: '123 Sample Street, Hanoi',
        ...body,
      });
  }

  describe('validation and RBAC', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Idempotency-Key', randomUUID())
        .send({ recipientName: 'A', phone: '+84901234567', address: 'addr' })
        .expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      await checkoutRequest(adminToken, randomUUID()).expect(403);
    });

    it('rejects a missing Idempotency-Key with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientName: 'A', phone: '+84901234567', address: 'addr' })
        .expect(400);
    });

    it('rejects a malformed (non-UUID) Idempotency-Key with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);
      await checkoutRequest(token, 'not-a-uuid').expect(400);
    });

    it('rejects a body missing recipientName with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);
      await checkoutRequest(token, randomUUID(), {
        recipientName: undefined,
      }).expect(400);
    });

    it('rejects a body with a forbidden field (totalVnd) with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);
      await checkoutRequest(token, randomUUID(), { totalVnd: '1' }).expect(400);
    });

    it('rejects an invalid phone format with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);
      await checkoutRequest(token, randomUUID(), {
        phone: 'abc-not-a-phone',
      }).expect(400);
    });

    it('returns 409 when the cart is empty', async () => {
      const token = await createCustomerToken();
      await checkoutRequest(token, randomUUID()).expect(409);
    });
  });

  describe('successful checkout', () => {
    it('creates a PENDING order, decrements stock, clears the cart, and sets Location', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 5,
      });
      await addToCart(token, product.id, 2);

      const response = await checkoutRequest(token, randomUUID()).expect(201);

      const body = response.body as OrderBody;
      expect(response.headers.location).toBe(`/api/v1/orders/${body.order.id}`);
      expect(body.order.status).toBe('PENDING');
      expect(body.order.totalVnd).toBe('300000');
      expect(body.order.items).toEqual([
        expect.objectContaining({
          productId: product.id,
          quantity: 2,
          lineTotalVnd: '300000',
        }),
      ]);
      expect(body.order.history).toEqual([
        expect.objectContaining({ fromStatus: null, toStatus: 'PENDING' }),
      ]);

      const updatedProduct = await productsRepository.findOne({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock).toBe(3);

      const cartResponse = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (cartResponse.body as { cart: { items: unknown[] } }).cart.items,
      ).toHaveLength(0);
    });

    it('decrements stock for every distinct product in a multi-line order', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const productA = await createProductAsAdmin(adminToken, category.id, {
        stock: 5,
        priceVnd: '100000',
      });
      const productB = await createProductAsAdmin(adminToken, category.id, {
        stock: 3,
        priceVnd: '200000',
      });
      await addToCart(token, productA.id, 2);
      await addToCart(token, productB.id, 3);

      const response = await checkoutRequest(token, randomUUID()).expect(201);

      const body = response.body as OrderBody;
      expect(body.order.totalVnd).toBe('800000');
      expect(body.order.items).toHaveLength(2);
      expect(body.order.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            productId: productA.id,
            quantity: 2,
            lineTotalVnd: '200000',
          }),
          expect.objectContaining({
            productId: productB.id,
            quantity: 3,
            lineTotalVnd: '600000',
          }),
        ]),
      );

      const updatedA = await productsRepository.findOne({
        where: { id: productA.id },
      });
      const updatedB = await productsRepository.findOne({
        where: { id: productB.id },
      });
      expect(updatedA?.stock).toBe(3);
      expect(updatedB?.stock).toBe(0);
    });

    it('rejects with 409 when a cart product was archived after being added to the cart', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);
      await addToCart(token, product.id, 1);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await checkoutRequest(token, randomUUID()).expect(409);

      const cartResponse = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (cartResponse.body as { cart: { items: unknown[] } }).cart.items,
      ).toHaveLength(1);
    });
  });

  describe('idempotency replay', () => {
    it('returns the same order with 200 when the same key + body is replayed after the cart was cleared', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 5,
      });
      await addToCart(token, product.id, 1);
      const idempotencyKey = randomUUID();

      const first = await checkoutRequest(token, idempotencyKey).expect(201);
      const second = await checkoutRequest(token, idempotencyKey).expect(200);

      expect((second.body as OrderBody).order.id).toBe(
        (first.body as OrderBody).order.id,
      );
      const updatedProduct = await productsRepository.findOne({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock).toBe(4);
    });

    it('returns 409 when the same key is replayed with a different body', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 5,
      });
      await addToCart(token, product.id, 1);
      const idempotencyKey = randomUUID();

      await checkoutRequest(token, idempotencyKey).expect(201);
      await checkoutRequest(token, idempotencyKey, {
        recipientName: 'Someone Else',
      }).expect(409);

      const updatedProduct = await productsRepository.findOne({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock).toBe(4);
    });

    it('resolves two concurrent requests with the same key+body into exactly one order (201 and 200)', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 5,
      });
      await addToCart(token, product.id, 2);
      const idempotencyKey = randomUUID();

      const [first, second] = await Promise.all([
        checkoutRequest(token, idempotencyKey),
        checkoutRequest(token, idempotencyKey),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 201]);
      const firstBody = first.body as OrderBody;
      const secondBody = second.body as OrderBody;
      expect(firstBody.order.id).toBe(secondBody.order.id);

      const updatedProduct = await productsRepository.findOne({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock).toBe(3);
    });
  });

  describe('concurrent stock=1 race between two customers', () => {
    it('lets exactly one customer succeed and leaves final stock at 0', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 1,
      });
      const tokenA = await createCustomerToken();
      const tokenB = await createCustomerToken();
      await addToCart(tokenA, product.id, 1);
      await addToCart(tokenB, product.id, 1);

      const [resultA, resultB] = await Promise.all([
        checkoutRequest(tokenA, randomUUID()),
        checkoutRequest(tokenB, randomUUID()),
      ]);

      const statuses = [resultA.status, resultB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const updatedProduct = await productsRepository.findOne({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock).toBe(0);
    });
  });
});
