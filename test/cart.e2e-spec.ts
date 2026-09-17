import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { MAX_CART_LINES_PER_USER } from '../src/modules/cart/constants/cart.constants';
import { SALT_ROUNDS } from '../src/modules/users/constants/users.constants';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import {
  SEED_ALICE_EMAIL,
  SEED_BOB_EMAIL,
  SEED_PASSWORD,
} from './utils/seed-database';

interface CartItemBody {
  productId: string;
  productName: string;
  unitPriceVnd: string;
  quantity: number;
  stock: number;
  available: boolean;
  lineTotalVnd: string;
}

interface CartBody {
  cart: { items: CartItemBody[]; totalVnd: string };
}

/** CART-01..03 (PR11) end-to-end: RBAC, absolute set, idempotent delete, lock, ownership. */
describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: Repository<User>;

  beforeAll(async () => {
    app = await createTestApp();
    usersRepository = app.get(getRepositoryToken(User));
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

  /** Khách hàng thứ hai, tạo trực tiếp qua repository (cùng cách `seedDatabase()` tạo Alice/Bob). */
  async function createSecondCustomerToken(): Promise<string> {
    const suffix = uniqueSuffix();
    const email = `cart-customer-${suffix}@example.test`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    await usersRepository.save(
      usersRepository.create({
        email,
        username: `cart_customer_${suffix}`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      }),
    );
    return loginAs(email);
  }

  async function createCategoryAsAdmin(adminToken: string): Promise<{
    id: string;
  }> {
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
  ): Promise<{ id: string; stock: number; isActive: boolean }> {
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
    return (
      response.body as {
        product: { id: string; stock: number; isActive: boolean };
      }
    ).product;
  }

  describe('GET /cart', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/cart').expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('returns an empty cart for a customer who has not added anything', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body as CartBody).toEqual({
        cart: { items: [], totalVnd: '0' },
      });
    });

    it('keeps a line visible with available=false after its product is archived', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        priceVnd: '100000',
        stock: 5,
      });
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 2 })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as CartBody;
      expect(body.cart.items).toHaveLength(1);
      expect(body.cart.items[0].productId).toBe(product.id);
      expect(body.cart.items[0].available).toBe(false);
      expect(body.cart.totalVnd).toBe('200000');
    });

    it("does not leak another customer's cart", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const aliceToken = await loginAs(SEED_ALICE_EMAIL);
      const bobCustomerToken = await createSecondCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ quantity: 1 })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${bobCustomerToken}`)
        .expect(200);

      expect((response.body as CartBody).cart.items).toHaveLength(0);
    });
  });

  describe('PUT /cart/items/:productId', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${randomUUID()}`)
        .send({ quantity: 1 })
        .expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 1 })
        .expect(403);
    });

    it('rejects a malformed productId with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .put('/api/v1/cart/items/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1 })
        .expect(400);
    });

    it.each([0, 100])('rejects quantity=%i with 400', async (quantity) => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity })
        .expect(400);
    });

    it('returns 404 for an unknown product', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1 })
        .expect(404);
    });

    it('returns 404 when the product is inactive', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        isActive: false,
      });

      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1 })
        .expect(404);
    });

    it('returns 409 when the quantity exceeds current stock', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 3,
      });

      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 4 })
        .expect(409);
    });

    it('adds a new line and computes lineTotalVnd/totalVnd from the current price', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        priceVnd: '150000',
        stock: 10,
      });

      const response = await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 2 })
        .expect(200);

      const body = response.body as CartBody;
      expect(body.cart.items).toHaveLength(1);
      expect(body.cart.items[0]).toMatchObject({
        productId: product.id,
        quantity: 2,
        unitPriceVnd: '150000',
        lineTotalVnd: '300000',
        available: true,
      });
      expect(body.cart.totalVnd).toBe('300000');
    });

    it('is an absolute set: a second PUT replaces the quantity instead of adding to it', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 10,
      });
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 2 })
        .expect(200);

      const response = await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 })
        .expect(200);

      const body = response.body as CartBody;
      expect(body.cart.items).toHaveLength(1);
      expect(body.cart.items[0].quantity).toBe(5);
    });

    it('rejects a 21st distinct product with 409, while updating an existing line still succeeds', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const products: { id: string }[] = [];
      for (let i = 0; i < MAX_CART_LINES_PER_USER; i += 1) {
        const product = await createProductAsAdmin(adminToken, category.id);
        products.push(product);
        await request(app.getHttpServer())
          .put(`/api/v1/cart/items/${product.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ quantity: 1 })
          .expect(200);
      }
      const overflowProduct = await createProductAsAdmin(
        adminToken,
        category.id,
      );

      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${overflowProduct.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1 })
        .expect(409);

      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${products[0].id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 3 })
        .expect(200);
    });

    it('serializes two concurrent PUTs on different products for the same customer without losing either', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const productA = await createProductAsAdmin(adminToken, category.id);
      const productB = await createProductAsAdmin(adminToken, category.id);

      await Promise.all([
        request(app.getHttpServer())
          .put(`/api/v1/cart/items/${productA.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ quantity: 2 })
          .expect(200),
        request(app.getHttpServer())
          .put(`/api/v1/cart/items/${productB.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ quantity: 3 })
          .expect(200),
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const items = (response.body as CartBody).cart.items;
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.productId === productA.id)?.quantity).toBe(2);
      expect(items.find((i) => i.productId === productB.id)?.quantity).toBe(3);
    });

    it('serializes two concurrent PUTs on the same product into exactly one line, not a duplicate or a lost write', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 20,
      });

      const results = await Promise.all([
        request(app.getHttpServer())
          .put(`/api/v1/cart/items/${product.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ quantity: 5 }),
        request(app.getHttpServer())
          .put(`/api/v1/cart/items/${product.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ quantity: 7 }),
      ]);
      expect(results.every((r) => r.status === 200)).toBe(true);

      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const items = (response.body as CartBody).cart.items;
      expect(items).toHaveLength(1);
      expect([5, 7]).toContain(items[0].quantity);
    });
  });

  describe('DELETE /cart/items/:productId', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${randomUUID()}`)
        .expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('rejects a malformed productId with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .delete('/api/v1/cart/items/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('is idempotent: 204 whether or not the line exists', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);
      const missingProductId = randomUUID();

      await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${missingProductId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${missingProductId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('removes only the requested line', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const kept = await createProductAsAdmin(adminToken, category.id);
      const removed = await createProductAsAdmin(adminToken, category.id);
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${kept.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1 })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${removed.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1 })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${removed.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const ids = (response.body as CartBody).cart.items.map(
        (i) => i.productId,
      );
      expect(ids).toEqual([kept.id]);
    });

    it("does not affect another customer's identical product line", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const aliceToken = await loginAs(SEED_ALICE_EMAIL);
      const secondCustomerToken = await createSecondCustomerToken();
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ quantity: 1 })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .send({ quantity: 2 })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .expect(200);
      const body = response.body as CartBody;
      expect(body.cart.items).toHaveLength(1);
      expect(body.cart.items[0].quantity).toBe(2);
    });
  });
});
