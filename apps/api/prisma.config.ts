import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: '../../prisma/migrations', seed: 'tsx ../../prisma/seed.ts' },
  // Migrations need a direct (non-pooled) connection; DIRECT_URL is used when set (Neon), otherwise DATABASE_URL.
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || '' },
});
