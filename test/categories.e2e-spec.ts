import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { Product } from '../src/modules/products/entities/product.entity';
import { createTestApp } from './utils/create-test-app';
import {
  SEED_ALICE_EMAIL,
  SEED_BOB_EMAIL,
  SEED_PASSWORD,
} from './utils/seed-database';

/** CAT-01..05 (PR09) end-to-end: public visibility, RBAC, CRUD, xóa rỗng. */
describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let productsRepository: Repository<Product>;

  beforeAll(async () => {
    app = await createTestApp();
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

  function uniqueCategoryDto() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
    return { name: `Category ${suffix}`, slug: `category-${suffix}` };
  }

  async function createCategoryAsAdmin(
    adminToken: string,
    overrides: Partial<{ name: string; slug: string; isActive: boolean }> = {},
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...uniqueCategoryDto(), ...overrides })
      .expect(201);
    return (response.body as { category: { id: string; slug: string } })
      .category;
  }

  describe('GET /categories (public)', () => {
    it('rejects an invalid limit with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/categories')
        .query({ limit: 0 })
        .expect(400);
    });

    it('only returns active categories', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const active = await createCategoryAsAdmin(adminToken, {
        isActive: true,
      });
      const inactive = await createCategoryAsAdmin(adminToken, {
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .expect(200);

      const body = response.body as { categories: { id: string }[] };
      const ids = body.categories.map((category) => category.id);
      expect(ids).toContain(active.id);
      expect(ids).not.toContain(inactive.id);
    });
  });

  describe('GET /admin/categories', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/categories')
        .expect(401);
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('returns inactive categories too for an ADMIN', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const inactive = await createCategoryAsAdmin(adminToken, {
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = response.body as { categories: { id: string }[] };
      expect(body.categories.map((category) => category.id)).toContain(
        inactive.id,
      );
    });

    it('finds a Vietnamese-accented name via an unaccented q', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
      const category = await createCategoryAsAdmin(adminToken, {
        name: `Điện thoại ${suffix}`,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ q: `dien thoai ${suffix}` })
        .expect(200);

      const body = response.body as {
        categories: { id: string }[];
        categoriesCount: number;
      };
      expect(body.categoriesCount).toBe(1);
      expect(body.categories[0].id).toBe(category.id);
    });
  });

  describe('POST /admin/categories', () => {
    it('creates a category as an ADMIN', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const dto = uniqueCategoryDto();

      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dto)
        .expect(201);

      const body = response.body as { category: { slug: string } };
      expect(body.category.slug).toBe(dto.slug);
    });

    it('rejects a duplicate slug with 409', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);

      await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Another name', slug: category.slug })
        .expect(409);
    });

    it('rejects an uppercase slug with 400', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sách', slug: 'Not-Valid-Slug' })
        .expect(400);
    });
  });

  describe('PATCH /admin/categories/:id', () => {
    it('rejects an empty body with 400', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('updates the category and returns 404 for an unknown id', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);
      expect(
        (response.body as { category: { isActive: boolean } }).category
          .isActive,
      ).toBe(false);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(404);
    });
  });

  describe('DELETE /admin/categories/:id', () => {
    it('deletes an empty category with 204', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('returns 404 for an unknown id', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('rejects deleting a category that still has a product (even archived) with 409', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      // Products admin API chưa tồn tại tới khi commit products module — insert thẳng qua
      // repository để dựng fixture cho đúng rule "category có product (kể cả archived) -> 409".
      const product = productsRepository.create({
        categoryId: category.id,
        name: 'Fixture product',
        description: '',
        sku: `FIXTURE-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        priceVnd: '10000',
        stock: 1,
        isActive: false,
      });
      await productsRepository.save(product);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/categories/${category.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });
});
