import { createRequire } from 'node:module';

/** Removes accounts created by E2E runs (`@e2e.local`) so dev data stays clean. */
export default async function globalTeardown() {
  const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const where = `SELECT u.id FROM users u WHERE u.email LIKE '%@e2e.local'`;
    await client.query(`DELETE FROM warehouses WHERE "sellerId" IN (SELECT id FROM sellers WHERE "userId" IN (${where}))`);
    await client.query(`DELETE FROM users WHERE email LIKE '%@e2e.local'`);
  } finally {
    await client.end();
  }
}
