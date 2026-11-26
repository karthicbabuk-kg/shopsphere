import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { cleanupDomain, makeSeller } from './helpers.js';

const app = createApp();
const DOMAIN = '@uploadtest.local';

afterAll(async () => {
  await cleanupDomain(DOMAIN);
  await prisma.$disconnect();
});

describe('uploads without Cloudinary credentials (real service, no mock)', () => {
  it('fails honestly with 503 instead of pretending to upload', async () => {
    const s = await makeSeller(app, DOMAIN);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const res = await request(app)
      .post('/api/v1/uploads/product-images')
      .set(s.auth)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('UPLOADS_NOT_CONFIGURED');
  });
});
