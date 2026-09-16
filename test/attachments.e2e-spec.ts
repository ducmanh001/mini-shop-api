import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { Attachment } from '../src/modules/attachments/entities/attachment.entity';
import { Category } from '../src/modules/categories/entities/category.entity';
import { Product } from '../src/modules/products/entities/product.entity';
import { createTestApp } from './utils/create-test-app';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngBuffer(): Buffer {
  return Buffer.concat([PNG_HEADER, Buffer.from('fixture-bytes')]);
}

/**
 * FILE-01 (PR09) end-to-end. Upload/replace ảnh (FILE-02/03) chưa tồn tại tới khi commit products
 * module — dựng fixture trực tiếp qua repository + ghi file thật vào `UPLOAD_DIR` để test đúng
 * hành vi visibility của `GET /attachments/:id` một cách độc lập.
 */
describe('Attachments (e2e)', () => {
  let app: INestApplication<App>;
  let categoriesRepository: Repository<Category>;
  let productsRepository: Repository<Product>;
  let attachmentsRepository: Repository<Attachment>;
  let uploadDir: string;

  beforeAll(async () => {
    app = await createTestApp();
    categoriesRepository = app.get(getRepositoryToken(Category));
    productsRepository = app.get(getRepositoryToken(Product));
    attachmentsRepository = app.get(getRepositoryToken(Attachment));
    uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR!);
    fs.mkdirSync(uploadDir, { recursive: true });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function seedVisibleProductWithImage(
    overrides: Partial<{
      productIsActive: boolean;
      categoryIsActive: boolean;
    }> = {},
  ) {
    const category = await categoriesRepository.save(
      categoriesRepository.create({
        name: `Category ${randomUUID()}`,
        slug: `category-${randomUUID()}`,
        isActive: overrides.categoryIsActive ?? true,
      }),
    );
    const storageKey = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(uploadDir, storageKey), pngBuffer());
    const attachment = await attachmentsRepository.save(
      attachmentsRepository.create({
        storageKey,
        mimeType: 'image/png',
        sizeBytes: pngBuffer().length,
      }),
    );
    const product = await productsRepository.save(
      productsRepository.create({
        categoryId: category.id,
        imageId: attachment.id,
        name: 'Fixture product',
        description: '',
        sku: `FIXTURE-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        priceVnd: '10000',
        stock: 1,
        isActive: overrides.productIsActive ?? true,
      }),
    );
    return { category, attachment, product };
  }

  describe('GET /attachments/:id', () => {
    it('rejects a malformed id with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/attachments/not-a-uuid')
        .expect(400);
    });

    it('returns 404 for an unknown attachment', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/attachments/${randomUUID()}`)
        .expect(404);
    });

    it('streams the image bytes for the current image of a visible product', async () => {
      const { attachment } = await seedVisibleProductWithImage();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/attachments/${attachment.id}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(Buffer.compare(response.body as Buffer, pngBuffer())).toBe(0);
    });

    it('returns 404 when the owning product is inactive', async () => {
      const { attachment } = await seedVisibleProductWithImage({
        productIsActive: false,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/attachments/${attachment.id}`)
        .expect(404);
    });

    it('returns 404 when the owning category is inactive', async () => {
      const { attachment } = await seedVisibleProductWithImage({
        categoryIsActive: false,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/attachments/${attachment.id}`)
        .expect(404);
    });
  });
});
