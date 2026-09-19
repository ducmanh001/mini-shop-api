import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { SALT_ROUNDS } from '../src/modules/users/constants/users.constants';
import { User } from '../src/modules/users/entities/user.entity';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { createTestApp } from './utils/create-test-app';
import { SEED_BOB_EMAIL, SEED_PASSWORD } from './utils/seed-database';

interface SuggestionBody {
  suggestion: {
    id: string;
    customerId: string;
    name: string;
    status: string;
    reviewReason: string | null;
  };
}

interface SuggestionsListBody {
  suggestions: { id: string; customerId: string; status: string }[];
  suggestionsCount: number;
}

interface SuggestionDetailBody {
  suggestion: {
    id: string;
    customer: { id: string; username: string };
    status: string;
  };
}

/** SUGGEST-01..05 (PR14) end-to-end: ownership, RBAC, duplicate-pending 409, review state machine. */
describe('Product suggestions (e2e)', () => {
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
    const email = `suggestions-customer-${suffix}@example.test`;
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    await usersRepository.save(
      usersRepository.create({
        email,
        username: `sugg_customer_${suffix}`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      }),
    );
    return loginAs(email);
  }

  function createSuggestion(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/product-suggestions')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function reviewSuggestion(
    adminToken: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/product-suggestions/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  describe('POST /product-suggestions (SUGGEST-01)', () => {
    it('creates a suggestion with status PENDING', async () => {
      const token = await createCustomerToken();

      const response = await createSuggestion(token, {
        name: `Bàn phím cơ ${uniqueSuffix()}`,
        description: 'Bàn phím cơ switch đỏ',
        categoryName: 'Phụ kiện',
      }).expect(201);

      expect((response.body as SuggestionBody).suggestion.status).toBe(
        'PENDING',
      );
    });

    it('rejects an unknown field like a client-sent status with 400', async () => {
      const token = await createCustomerToken();

      await createSuggestion(token, {
        name: `Bàn phím cơ ${uniqueSuffix()}`,
        status: 'APPROVED',
      }).expect(400);
    });

    it('rejects a name shorter than 2 characters with 400', async () => {
      const token = await createCustomerToken();

      await createSuggestion(token, { name: 'A' }).expect(400);
    });

    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/product-suggestions')
        .send({ name: 'Bàn phím cơ' })
        .expect(401);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await createSuggestion(adminToken, { name: 'Bàn phím cơ' }).expect(403);
    });

    it('returns 409 when the same customer already has a PENDING suggestion with the same name', async () => {
      const token = await createCustomerToken();
      const name = `Ghế công thái học ${uniqueSuffix()}`;
      await createSuggestion(token, { name }).expect(201);

      await createSuggestion(token, { name }).expect(409);
    });
  });

  describe('GET /product-suggestions (SUGGEST-02)', () => {
    it('only returns suggestions owned by the current customer', async () => {
      const tokenA = await createCustomerToken();
      const tokenB = await createCustomerToken();
      const created = await createSuggestion(tokenA, {
        name: `Loa bluetooth ${uniqueSuffix()}`,
      }).expect(201);
      const suggestionId = (created.body as SuggestionBody).suggestion.id;

      const mine = await request(app.getHttpServer())
        .get('/api/v1/product-suggestions')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const others = await request(app.getHttpServer())
        .get('/api/v1/product-suggestions')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const mineBody = mine.body as SuggestionsListBody;
      expect(mineBody.suggestions.map((s) => s.id)).toContain(suggestionId);
      expect(
        (others.body as SuggestionsListBody).suggestions.map((s) => s.id),
      ).not.toContain(suggestionId);
    });

    it('rejects an ADMIN token with 403', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .get('/api/v1/product-suggestions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  describe('GET /admin/product-suggestions (SUGGEST-03)', () => {
    it('rejects a CUSTOMER token with 403', async () => {
      const token = await createCustomerToken();

      await request(app.getHttpServer())
        .get('/api/v1/admin/product-suggestions')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('filters by status, userId, and keyword', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const suffix = uniqueSuffix();
      const created = await createSuggestion(token, {
        name: `Ổ cứng SSD ${suffix}`,
      }).expect(201);
      const suggestionId = (created.body as SuggestionBody).suggestion.id;
      const customerId = (created.body as SuggestionBody).suggestion.customerId;

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/product-suggestions')
        .query({ status: 'PENDING', userId: customerId, keyword: suffix })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const listBody = response.body as SuggestionsListBody;
      expect(listBody.suggestions.map((s) => s.id)).toContain(suggestionId);
      expect(listBody.suggestions.every((s) => s.status === 'PENDING')).toBe(
        true,
      );
    });
  });

  describe('GET /admin/product-suggestions/:id (SUGGEST-04)', () => {
    it('returns 404 for an unknown id', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .get(`/api/v1/admin/product-suggestions/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const token = await createCustomerToken();
      const created = await createSuggestion(token, {
        name: `Chuột không dây ${uniqueSuffix()}`,
      }).expect(201);

      await request(app.getHttpServer())
        .get(
          `/api/v1/admin/product-suggestions/${(created.body as SuggestionBody).suggestion.id}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('returns only customer id/username, never email/password/token', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const token = await createCustomerToken();
      const created = await createSuggestion(token, {
        name: `Bàn phím Bluetooth ${uniqueSuffix()}`,
      }).expect(201);
      const suggestionId = (created.body as SuggestionBody).suggestion.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/product-suggestions/${suggestionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const detail = (response.body as SuggestionDetailBody).suggestion;
      expect(detail.customer.id).toBeDefined();
      expect(detail.customer.username).toBeDefined();
      expect(JSON.stringify(response.body)).not.toMatch(
        /email|password|token/i,
      );
    });
  });

  describe('PATCH /admin/product-suggestions/:id/status (SUGGEST-05)', () => {
    async function setupPendingSuggestion(): Promise<string> {
      const token = await createCustomerToken();
      const created = await createSuggestion(token, {
        name: `Tai nghe chống ồn ${uniqueSuffix()}`,
      }).expect(201);
      return (created.body as SuggestionBody).suggestion.id;
    }

    it('approves a PENDING suggestion without auto-creating a product', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const suggestionId = await setupPendingSuggestion();

      const response = await reviewSuggestion(adminToken, suggestionId, {
        status: 'APPROVED',
      }).expect(200);

      expect((response.body as SuggestionBody).suggestion.status).toBe(
        'APPROVED',
      );
    });

    it('rejects with 400 when REJECTED is sent without a reason', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const suggestionId = await setupPendingSuggestion();

      await reviewSuggestion(adminToken, suggestionId, {
        status: 'REJECTED',
      }).expect(400);
    });

    it('rejects a PENDING suggestion and records the reason', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const suggestionId = await setupPendingSuggestion();

      const response = await reviewSuggestion(adminToken, suggestionId, {
        status: 'REJECTED',
        reason: 'Already sold in-store',
      }).expect(200);

      const body = response.body as SuggestionBody;
      expect(body.suggestion.status).toBe('REJECTED');
      expect(body.suggestion.reviewReason).toBe('Already sold in-store');
    });

    it('returns 409 when reviewing a suggestion that is no longer PENDING', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const suggestionId = await setupPendingSuggestion();
      await reviewSuggestion(adminToken, suggestionId, {
        status: 'APPROVED',
      }).expect(200);

      await reviewSuggestion(adminToken, suggestionId, {
        status: 'APPROVED',
      }).expect(409);
    });

    it('returns 404 for an unknown id', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await reviewSuggestion(adminToken, randomUUID(), {
        status: 'APPROVED',
      }).expect(404);
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const token = await createCustomerToken();
      const suggestionId = await setupPendingSuggestion();

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/product-suggestions/${suggestionId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'APPROVED' })
        .expect(403);
    });

    it('lets exactly one of two concurrent reviews win (CODING_STANDARD.md mục 22)', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const suggestionId = await setupPendingSuggestion();

      const [first, second] = await Promise.all([
        reviewSuggestion(adminToken, suggestionId, { status: 'APPROVED' }),
        reviewSuggestion(adminToken, suggestionId, {
          status: 'REJECTED',
          reason: 'Duplicate of another suggestion',
        }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });
});
