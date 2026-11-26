import { createRequire } from 'node:module';

/** Deletes images uploaded by E2E sellers so the Cloudinary free quota is not consumed by test runs. */
async function deleteCloudinaryAssets(
  client: import('pg').Client,
  sellerIds: string,
  require: NodeJS.Require,
) {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) return;
  const { v2: cloudinary } = require('cloudinary') as typeof import('cloudinary');
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  const { rows } = await client.query<{ publicId: string }>(
    `SELECT "publicId" FROM product_images WHERE "publicId" IS NOT NULL AND "productId" IN (SELECT id FROM products WHERE "sellerId" IN (${sellerIds}))`,
  );
  if (rows.length) await cloudinary.api.delete_resources(rows.map((r) => r.publicId));
}

/** Removes data created by E2E runs so dev data stays clean. */
export default async function globalTeardown() {
  const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sellerIds = `SELECT s.id FROM sellers s JOIN users u ON u.id = s."userId" WHERE u.email LIKE '%@e2e.local'`;
  try {
    await deleteCloudinaryAssets(client, sellerIds, require);
    await client.query('BEGIN');
    // The stock ledger is append-only by trigger; teardown is the one place that bypasses it.
    await client.query('ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_immutable');
    await client.query(`DELETE FROM stock_movements WHERE "sellerId" IN (${sellerIds})`);
    await client.query('ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_immutable');
    await client.query(`DELETE FROM inventories WHERE "warehouseId" IN (SELECT id FROM warehouses WHERE "sellerId" IN (${sellerIds}))`);
    await client.query(`DELETE FROM products WHERE "sellerId" IN (${sellerIds})`);
    await client.query(`DELETE FROM warehouses WHERE "sellerId" IN (${sellerIds})`);
    await client.query(`DELETE FROM notifications WHERE "userId" IN (SELECT id FROM users WHERE email LIKE '%@e2e.local')`);
    await client.query(`DELETE FROM users WHERE email LIKE '%@e2e.local'`);
    await client.query(`DELETE FROM categories WHERE name LIKE 'E2E Cat %'`);
    await client.query(`DELETE FROM brands WHERE name LIKE 'E2E Brand %'`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}
