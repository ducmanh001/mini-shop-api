import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { MAX_REVIEW_COMMENT_LENGTH } from '../src/modules/reviews/constants/reviews.constants';
import { SALT_ROUNDS } from '../src/modules/users/constants/users.constants';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import {
  SEED_ALICE_EMAIL,
  SEED_BOB_EMAIL,
  SEED_PASSWORD,
} from './utils/seed-database';

interface ReviewFields {
  id: string;
  productId: string;
  rating: number;
  comment: string;
  author: { id: string; username: string };
  createdAt: string;
  updatedAt: string;
}

interface ReviewBody {
  review: ReviewFields;
}

interface ReviewsBody {
  reviews: ReviewFields[];
  reviewsCount: number;
  averageRating: string | null;
}

/**
 * REVIEW-01..04 (PR10) end-to-end: verified purchase (đơn COMPLETED), unique user/product kể cả
 * khi đua, ownership trong query, aggregate theo toàn bộ review, response không lộ email.
 */
describe('Reviews (e2e)', () => {
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

  async function createCustomerToken(): Promise<string> {
    const suffix = uniqueSuffix();
    const email = `reviews-customer-${suffix}@example.test`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    await usersRepository.save(
      usersRepository.create({
        email,
        username: `reviews_customer_${suffix}`,
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
    categoryId?: string,
  ): Promise<{ id: string }> {
    const resolvedCategoryId =
      categoryId ?? (await createCategoryAsAdmin(adminToken)).id;
    const suffix = uniqueSuffix();
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId: resolvedCategoryId,
        name: `Product ${suffix}`,
        description: 'Fixture description',
        sku: `SKU-${suffix.toUpperCase()}`,
        priceVnd: '150000',
        stock: 50,
        isActive: true,
        isFeatured: false,
      })
      .expect(201);
    return (response.body as { product: { id: string } }).product;
  }

  /** Đặt đơn 1 dòng và trả orderId; đơn ở trạng thái PENDING cho tới khi admin đổi status. */
  async function placeOrder(
    customerToken: string,
    productId: string,
  ): Promise<string> {
    await request(app.getHttpServer())
      .put(`/api/v1/cart/items/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quantity: 1 })
      .expect(200);
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Nguyen An',
        phone: '+84901234567',
        address: '123 Sample Street, Hanoi',
      })
      .expect(201);
    return (response.body as { order: { id: string } }).order.id;
  }

  async function setOrderStatus(
    adminToken: string,
    orderId: string,
    status: 'CONFIRMED' | 'COMPLETED',
  ): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status })
      .expect(200);
  }

  async function purchaseAndComplete(
    adminToken: string,
    customerToken: string,
    productId: string,
  ): Promise<void> {
    const orderId = await placeOrder(customerToken, productId);
    await setOrderStatus(adminToken, orderId, 'CONFIRMED');
    await setOrderStatus(adminToken, orderId, 'COMPLETED');
  }

  function postReview(
    token: string,
    productId: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function createReview(
    token: string,
    productId: string,
    body: Record<string, unknown> = { rating: 5, comment: 'Sản phẩm tốt.' },
  ): Promise<ReviewFields> {
    const response = await postReview(token, productId, body).expect(201);
    return (response.body as ReviewBody).review;
  }

  /** Product đã bán xong cho `customerToken` (đơn COMPLETED) — điều kiện tối thiểu để được review. */
  async function setupPurchasedProduct(
    adminToken: string,
    customerToken: string,
  ): Promise<{ id: string }> {
    const product = await createProductAsAdmin(adminToken);
    await purchaseAndComplete(adminToken, customerToken, product.id);
    return product;
  }

  describe('GET /products/:id/reviews', () => {
    it('rejects a malformed product id with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products/not-a-uuid/reviews')
        .expect(400);
    });

    it('returns 404 for an unknown product', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${randomUUID()}/reviews`)
        .expect(404);
    });

    it('returns 404 when the product is not visible (archived)', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const product = await createProductAsAdmin(adminToken);
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(404);
    });

    it.each([
      ['limit=0', 'limit=0'],
      ['limit=51', 'limit=51'],
      ['offset=-1', 'offset=-1'],
    ])('rejects invalid pagination (%s) with 400', async (_label, query) => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const product = await createProductAsAdmin(adminToken);

      await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews?${query}`)
        .expect(400);
    });

    it('is public and returns an empty list with null average when there are no reviews', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const product = await createProductAsAdmin(adminToken);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(200);

      expect(response.body as ReviewsBody).toEqual({
        reviews: [],
        reviewsCount: 0,
        averageRating: null,
      });
    });

    it('lists newest first, keeps count/average over ALL reviews when paginated, and never leaks email', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const firstToken = await loginAs(SEED_ALICE_EMAIL);
      const secondToken = await createCustomerToken();
      const product = await createProductAsAdmin(adminToken);
      await purchaseAndComplete(adminToken, firstToken, product.id);
      await purchaseAndComplete(adminToken, secondToken, product.id);
      const older = await createReview(firstToken, product.id, {
        rating: 5,
        comment: 'Đến trước.',
      });
      const newer = await createReview(secondToken, product.id, {
        rating: 4,
        comment: 'Đến sau.',
      });

      const fullPage = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(200);
      const firstPage = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews?limit=1&offset=0`)
        .expect(200);
      const secondPage = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews?limit=1&offset=1`)
        .expect(200);

      const fullBody = fullPage.body as ReviewsBody;
      expect(fullBody.reviews.map((r) => r.id)).toEqual([newer.id, older.id]);
      expect(fullBody.reviewsCount).toBe(2);
      expect(fullBody.averageRating).toBe('4.5');
      expect(fullBody.reviews[1].author.username).toBe('seed_alice');
      expect(JSON.stringify(fullPage.body)).not.toContain('@example.test');

      const firstBody = firstPage.body as ReviewsBody;
      expect(firstBody.reviews.map((r) => r.id)).toEqual([newer.id]);
      expect(firstBody.reviewsCount).toBe(2);
      expect(firstBody.averageRating).toBe('4.5');
      expect((secondPage.body as ReviewsBody).reviews.map((r) => r.id)).toEqual(
        [older.id],
      );
    });

    it("does not mix in another product's reviews", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const reviewed = await setupPurchasedProduct(adminToken, token);
      const untouched = await createProductAsAdmin(adminToken);
      await createReview(token, reviewed.id);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${untouched.id}/reviews`)
        .expect(200);

      expect((response.body as ReviewsBody).reviewsCount).toBe(0);
    });
  });

  describe('POST /products/:id/reviews', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/products/${randomUUID()}/reviews`)
        .send({ rating: 5, comment: 'x' })
        .expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await postReview(adminToken, randomUUID(), {
        rating: 5,
        comment: 'x',
      }).expect(403);
    });

    it('rejects a malformed product id with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await postReview(token, 'not-a-uuid', {
        rating: 5,
        comment: 'x',
      }).expect(400);
    });

    it.each([
      ['rating below range', { rating: 0, comment: 'ok' }],
      ['rating above range', { rating: 6, comment: 'ok' }],
      ['non-integer rating', { rating: 4.5, comment: 'ok' }],
      ['string rating', { rating: '5', comment: 'ok' }],
      ['missing rating', { comment: 'ok' }],
      ['missing comment', { rating: 5 }],
      ['blank comment', { rating: 5, comment: '   ' }],
      [
        'comment over the max length',
        { rating: 5, comment: 'a'.repeat(MAX_REVIEW_COMMENT_LENGTH + 1) },
      ],
      ['unknown field', { rating: 5, comment: 'ok', userId: randomUUID() }],
    ])('rejects %s with 400', async (_label, body) => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await postReview(token, randomUUID(), body).expect(400);
    });

    it('returns 404 for an unknown product', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await postReview(token, randomUUID(), {
        rating: 5,
        comment: 'ok',
      }).expect(404);
    });

    it('returns 404 when the product is no longer visible, even for a past buyer', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await postReview(token, product.id, {
        rating: 5,
        comment: 'ok',
      }).expect(404);
    });

    it('returns 409 when the customer never ordered the product', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await createProductAsAdmin(adminToken);

      await postReview(token, product.id, {
        rating: 5,
        comment: 'ok',
      }).expect(409);
    });

    it('returns 409 while the order is PENDING or CONFIRMED, and 201 once it is COMPLETED', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await createProductAsAdmin(adminToken);
      const orderId = await placeOrder(token, product.id);

      await postReview(token, product.id, {
        rating: 5,
        comment: 'ok',
      }).expect(409);

      await setOrderStatus(adminToken, orderId, 'CONFIRMED');
      await postReview(token, product.id, {
        rating: 5,
        comment: 'ok',
      }).expect(409);

      await setOrderStatus(adminToken, orderId, 'COMPLETED');
      await postReview(token, product.id, {
        rating: 5,
        comment: 'ok',
      }).expect(201);
    });

    it('returns 409 when the only COMPLETED order contains a different product', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      await setupPurchasedProduct(adminToken, token);
      const otherProduct = await createProductAsAdmin(adminToken);

      await postReview(token, otherProduct.id, {
        rating: 5,
        comment: 'ok',
      }).expect(409);
    });

    it("does not let another customer review on someone else's purchase", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const buyerToken = await loginAs(SEED_ALICE_EMAIL);
      const strangerToken = await createCustomerToken();
      const product = await setupPurchasedProduct(adminToken, buyerToken);

      await postReview(strangerToken, product.id, {
        rating: 5,
        comment: 'ok',
      }).expect(409);
    });

    it('creates the review with the caller as author, a trimmed comment, and no email in the response', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);

      const response = await postReview(token, product.id, {
        rating: 4,
        comment: '  Dùng ổn.  ',
      }).expect(201);

      const { review } = response.body as ReviewBody;
      expect(review).toMatchObject({
        productId: product.id,
        rating: 4,
        comment: 'Dùng ổn.',
        author: { username: 'seed_alice' },
      });
      expect(review.createdAt).toBeTruthy();
      expect(review.updatedAt).toBeTruthy();
      expect(JSON.stringify(response.body)).not.toContain('@example.test');
    });

    it('returns 409 for a second review of the same product by the same customer', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);
      await createReview(token, product.id);

      await postReview(token, product.id, {
        rating: 1,
        comment: 'Đổi ý.',
      }).expect(409);
    });

    it('lets exactly one of two concurrent reviews through (unique user+product)', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);

      const results = await Promise.all([
        postReview(token, product.id, { rating: 5, comment: 'Lần một.' }),
        postReview(token, product.id, { rating: 3, comment: 'Lần hai.' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const list = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(200);
      expect((list.body as ReviewsBody).reviewsCount).toBe(1);
    });
  });

  describe('PATCH /reviews/:id', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/reviews/${randomUUID()}`)
        .send({ rating: 3 })
        .expect(401);
    });

    it('rejects an ADMIN token with 403 (admin cannot edit on behalf of a customer)', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/reviews/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rating: 3 })
        .expect(403);
    });

    it('rejects a malformed review id with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch('/api/v1/reviews/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 3 })
        .expect(400);
    });

    it.each([
      ['empty body', {}],
      ['null rating', { rating: null }],
      ['rating out of range', { rating: 9 }],
      ['blank comment', { comment: '  ' }],
      ['null comment', { comment: null }],
      ['unknown field', { rating: 3, productId: randomUUID() }],
    ])('rejects %s with 400', async (_label, body) => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/reviews/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400);
    });

    it('returns 404 for an unknown review', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/reviews/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 3 })
        .expect(404);
    });

    it('updates only the provided field and keeps the rest', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);
      const created = await createReview(token, product.id, {
        rating: 5,
        comment: 'Bản đầu.',
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/reviews/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ comment: 'Cập nhật sau một tuần.' })
        .expect(200);

      const { review } = response.body as ReviewBody;
      expect(review).toMatchObject({
        id: created.id,
        rating: 5,
        comment: 'Cập nhật sau một tuần.',
        author: { username: 'seed_alice' },
      });
      expect(new Date(review.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(review.createdAt).getTime(),
      );
    });

    it('updates rating and comment together, reflected in the product average', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);
      const created = await createReview(token, product.id, {
        rating: 5,
        comment: 'Bản đầu.',
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/reviews/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 2, comment: 'Tệ hơn dự kiến.' })
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(200);
      const body = list.body as ReviewsBody;
      expect(body.reviews[0]).toMatchObject({
        rating: 2,
        comment: 'Tệ hơn dự kiến.',
      });
      expect(body.averageRating).toBe('2.0');
    });

    it("returns 404 for another customer's review and leaves it untouched", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const ownerToken = await loginAs(SEED_ALICE_EMAIL);
      const strangerToken = await createCustomerToken();
      const product = await setupPurchasedProduct(adminToken, ownerToken);
      const created = await createReview(ownerToken, product.id, {
        rating: 5,
        comment: 'Của chủ sở hữu.',
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/reviews/${created.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ rating: 1, comment: 'Bị sửa trái phép.' })
        .expect(404);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(200);
      expect((list.body as ReviewsBody).reviews[0]).toMatchObject({
        rating: 5,
        comment: 'Của chủ sở hữu.',
      });
    });
  });

  describe('DELETE /reviews/:id', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/reviews/${randomUUID()}`)
        .expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .delete(`/api/v1/reviews/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('rejects a malformed review id with 400', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .delete('/api/v1/reviews/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('returns 404 for an unknown review', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .delete(`/api/v1/reviews/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it("returns 404 for another customer's review and keeps it", async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const ownerToken = await loginAs(SEED_ALICE_EMAIL);
      const strangerToken = await createCustomerToken();
      const product = await setupPurchasedProduct(adminToken, ownerToken);
      const created = await createReview(ownerToken, product.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/reviews/${created.id}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(200);
      expect((list.body as ReviewsBody).reviewsCount).toBe(1);
    });

    it('deletes the owner review, drops it from count/average, and allows reviewing again', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);
      const created = await createReview(token, product.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/reviews/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/reviews`)
        .expect(200);
      expect(list.body as ReviewsBody).toEqual({
        reviews: [],
        reviewsCount: 0,
        averageRating: null,
      });
      await postReview(token, product.id, {
        rating: 3,
        comment: 'Đánh giá lại.',
      }).expect(201);
    });

    it('returns 404 on a repeated delete', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await loginAs(SEED_ALICE_EMAIL);
      const product = await setupPurchasedProduct(adminToken, token);
      const created = await createReview(token, product.id);
      await request(app.getHttpServer())
        .delete(`/api/v1/reviews/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/api/v1/reviews/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
