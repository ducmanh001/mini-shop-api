import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';
import {
  SEED_ALICE_EMAIL,
  SEED_BOB_EMAIL,
  SEED_PASSWORD,
} from './utils/seed-database';

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fixture-png-body'),
]);
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from('fixture-jpeg-body'),
]);

interface ProductBody {
  product: {
    id: string;
    name: string;
    stock: number;
    priceVnd: string;
    isActive: boolean;
    isFeatured: boolean;
    category: { id: string; isActive: boolean };
    image: { id: string; url: string } | null;
  };
}

/** PROD-01..06, FILE-02/03 (PR09) end-to-end: public visibility/search, RBAC, CRUD, ảnh. */
describe('Products (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
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

  async function createCategoryAsAdmin(
    adminToken: string,
    overrides: Partial<{ isActive: boolean }> = {},
  ): Promise<{ id: string }> {
    const suffix = uniqueSuffix();
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Category ${suffix}`,
        slug: `category-${suffix}`,
        isActive: overrides.isActive ?? true,
      })
      .expect(201);
    return (response.body as { category: { id: string } }).category;
  }

  async function createProductAsAdmin(
    adminToken: string,
    categoryId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<ProductBody['product']> {
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
    return (response.body as ProductBody).product;
  }

  describe('GET /products (public)', () => {
    it('rejects an invalid minPrice format with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ minPrice: 'abc' })
        .expect(400);
    });

    it('hides products that are inactive or whose category is inactive', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const activeCategory = await createCategoryAsAdmin(adminToken);
      const categoryToDeactivate = await createCategoryAsAdmin(adminToken);
      const visible = await createProductAsAdmin(adminToken, activeCategory.id);
      const inactiveProduct = await createProductAsAdmin(
        adminToken,
        activeCategory.id,
        { isActive: false },
      );
      // Category phải active lúc tạo product (409 nếu không) — deactivate SAU khi đã có product
      // bên dưới để mô phỏng đúng rule "ẩn category làm product bên dưới không public" (mục 54).
      const underDeactivatedCategory = await createProductAsAdmin(
        adminToken,
        categoryToDeactivate.id,
      );
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/categories/${categoryToDeactivate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200);

      const ids = (
        response.body as { products: { id: string }[] }
      ).products.map((p) => p.id);
      expect(ids).toContain(visible.id);
      expect(ids).not.toContain(inactiveProduct.id);
      expect(ids).not.toContain(underDeactivatedCategory.id);
    });

    it('filters by categoryId, q, price range, and featured strictly', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const suffix = uniqueSuffix();
      const target = await createProductAsAdmin(adminToken, category.id, {
        name: `Findable ${suffix}`,
        priceVnd: '250000',
        isFeatured: true,
      });
      await createProductAsAdmin(adminToken, category.id, {
        priceVnd: '900000',
        isFeatured: false,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({
          categoryId: category.id,
          q: `Findable ${suffix}`,
          minPrice: '200000',
          maxPrice: '300000',
          featured: 'true',
        })
        .expect(200);

      const body = response.body as {
        products: { id: string }[];
        productsCount: number;
      };
      expect(body.productsCount).toBe(1);
      expect(body.products[0].id).toBe(target.id);
    });

    it('finds Vietnamese text via an unaccented q and ranks name matches before description-only matches', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const suffix = uniqueSuffix();
      const nameMatch = await createProductAsAdmin(adminToken, category.id, {
        name: `Chuột không dây ${suffix}`,
      });
      const descriptionMatch = await createProductAsAdmin(
        adminToken,
        category.id,
        {
          name: `Bàn phím cơ ${suffix}`,
          description: `Đi kèm Chuột không dây ${suffix}`,
        },
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ q: `chuot khong day ${suffix}` })
        .expect(200);

      const body = response.body as {
        products: { id: string }[];
        productsCount: number;
      };
      expect(body.productsCount).toBe(2);
      expect(body.products.map((p) => p.id)).toEqual([
        nameMatch.id,
        descriptionMatch.id,
      ]);
    });
  });

  describe('GET /products/:id (public)', () => {
    it('rejects a malformed id with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products/not-a-uuid')
        .expect(400);
    });

    it('returns 404 for an unknown or invisible product', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${randomUUID()}`)
        .expect(404);
    });

    it('returns the product detail with a null image by default', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}`)
        .expect(200);

      const body = response.body as ProductBody;
      expect(body.product.id).toBe(product.id);
      expect(body.product.image).toBeNull();
    });
  });

  describe('GET /products/:id/share-links', () => {
    it('rejects a malformed id with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products/not-a-uuid/share-links')
        .expect(400);
    });

    it('returns 404 for an unknown or invisible product', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${randomUUID()}/share-links`)
        .expect(404);
    });

    it('returns the canonical URL and Facebook/X share links, no auth required', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        name: 'Sổ tay & bút',
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}/share-links`)
        .expect(200);

      const body = response.body as {
        canonicalUrl: string;
        facebookUrl: string;
        xUrl: string;
      };
      expect(body.canonicalUrl).toBe(
        `http://localhost:3002/products/${product.id}`,
      );
      expect(body.facebookUrl).toBe(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(body.canonicalUrl)}`,
      );
      expect(body.xUrl).toBe(
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(body.canonicalUrl)}&text=${encodeURIComponent('Sổ tay & bút')}`,
      );
    });
  });

  describe('GET /admin/products', () => {
    it('rejects a request without a token with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/products')
        .expect(401);
    });

    it('rejects a CUSTOMER token with 403', async () => {
      const token = await loginAs(SEED_ALICE_EMAIL);

      await request(app.getHttpServer())
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('sees inactive products for an ADMIN', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const inactive = await createProductAsAdmin(adminToken, category.id, {
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ isActive: 'false' })
        .expect(200);

      const ids = (
        response.body as { products: { id: string }[] }
      ).products.map((p) => p.id);
      expect(ids).toContain(inactive.id);
    });
  });

  describe('POST /admin/products', () => {
    it('creates a product when the category is active', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);

      const product = await createProductAsAdmin(adminToken, category.id);

      expect(product.category.id).toBe(category.id);
    });

    it('returns 404 when the category does not exist', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: randomUUID(),
          name: 'Orphan product',
          sku: `SKU-${uniqueSuffix()}`,
          priceVnd: '10000',
          stock: 1,
        })
        .expect(404);
    });

    it('returns 409 when the category is inactive', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const inactiveCategory = await createCategoryAsAdmin(adminToken, {
        isActive: false,
      });

      await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: inactiveCategory.id,
          name: 'Under inactive category',
          sku: `SKU-${uniqueSuffix()}`,
          priceVnd: '10000',
          stock: 1,
        })
        .expect(409);
    });

    it('returns 409 for a duplicate SKU', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const suffix = uniqueSuffix();
      const sku = `SKU-${suffix.toUpperCase()}`;
      await createProductAsAdmin(adminToken, category.id, { sku });

      await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: category.id,
          name: 'Another product',
          description: '',
          sku,
          priceVnd: '150000',
          stock: 5,
        })
        .expect(409);
    });

    it('rejects a blank name with 400', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);

      await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: category.id,
          name: '   ',
          sku: `SKU-${uniqueSuffix()}`,
          priceVnd: '150000',
          stock: 5,
        })
        .expect(400);
    });
  });

  describe('PATCH /admin/products/:id', () => {
    it('rejects an empty body with 400', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('treats stock as an absolute value, not a delta', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 10,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 3 })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 7 })
        .expect(200);

      expect((response.body as ProductBody).product.stock).toBe(7);
    });

    it('applies two concurrent patches on different fields without losing either', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id, {
        stock: 10,
        isFeatured: false,
      });

      await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/admin/products/${product.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ stock: 42 })
          .expect(200),
        request(app.getHttpServer())
          .patch(`/api/v1/admin/products/${product.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ isFeatured: true })
          .expect(200),
      ]);

      const detail = await request(app.getHttpServer())
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ q: product.name })
        .expect(200);
      const found = (detail.body as { products: ProductBody['product'][] })
        .products[0];
      expect(found.stock).toBe(42);
      expect(found.isFeatured).toBe(true);
    });

    it('returns 404 for an unknown product', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 1 })
        .expect(404);
    });
  });

  describe('DELETE /admin/products/:id (archive)', () => {
    it('archives the product: hidden publicly, still visible to admin', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}`)
        .expect(404);

      const adminList = await request(app.getHttpServer())
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ isActive: 'false' })
        .expect(200);
      const ids = (
        adminList.body as { products: { id: string }[] }
      ).products.map((p) => p.id);
      expect(ids).toContain(product.id);
    });

    it('returns 404 for an unknown product', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('POST /admin/products/:id/image', () => {
    it('rejects a request without a file with 400', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('rejects a declared MIME type outside the allow-list with 415', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'evil.html',
          contentType: 'text/html',
        })
        .expect(415);
    });

    it('rejects a spoofed file whose bytes do not match the declared MIME with 415', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('<html>not a png</html>'), {
          filename: 'fake.png',
          contentType: 'image/png',
        })
        .expect(415);
    });

    it('rejects a file larger than 2 MiB with 413', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);
      const oversized = Buffer.concat([
        PNG_BYTES,
        Buffer.alloc(2 * 1024 * 1024 + 1),
      ]);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', oversized, {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(413);
    });

    it('uploads, serves, and then replaces the image (old one stops being public)', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      const firstUpload = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', PNG_BYTES, {
          filename: 'first.png',
          contentType: 'image/png',
        })
        .expect(200);
      const firstImage = (firstUpload.body as ProductBody).product.image;
      expect(firstImage).not.toBeNull();

      const firstImageResponse = await request(app.getHttpServer())
        .get(firstImage!.url)
        .expect(200);
      expect(Buffer.compare(firstImageResponse.body as Buffer, PNG_BYTES)).toBe(
        0,
      );

      const secondUpload = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', JPEG_BYTES, {
          filename: 'second.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200);
      const secondImage = (secondUpload.body as ProductBody).product.image;
      expect(secondImage!.id).not.toBe(firstImage!.id);

      await request(app.getHttpServer()).get(firstImage!.url).expect(404);
      const secondImageResponse = await request(app.getHttpServer())
        .get(secondImage!.url)
        .expect(200);
      expect(
        Buffer.compare(secondImageResponse.body as Buffer, JPEG_BYTES),
      ).toBe(0);
    });

    it('returns 404 for an unknown product', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${randomUUID()}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', PNG_BYTES, {
          filename: 'a.png',
          contentType: 'image/png',
        })
        .expect(404);
    });
  });

  describe('DELETE /admin/products/:id/image', () => {
    it('is a no-op (204) when the product has no image', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('removes the image so it is no longer publicly reachable', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);
      const category = await createCategoryAsAdmin(adminToken);
      const product = await createProductAsAdmin(adminToken, category.id);
      const upload = await request(app.getHttpServer())
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', PNG_BYTES, {
          filename: 'first.png',
          contentType: 'image/png',
        })
        .expect(200);
      const image = (upload.body as ProductBody).product.image!;

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer()).get(image.url).expect(404);
    });

    it('returns 404 for an unknown product', async () => {
      const adminToken = await loginAs(SEED_BOB_EMAIL);

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/products/${randomUUID()}/image`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
