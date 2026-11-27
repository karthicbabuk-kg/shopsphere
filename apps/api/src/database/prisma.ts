import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Connection settings tuned for a serverless Postgres (Neon) behind a small free API instance:
 *  - few connections (the provider also pools),
 *  - idle connections are dropped before the provider drops them,
 *  - a generous connect timeout, because a suspended database needs a moment to wake up,
 *  - a pool error handler: a connection closed by the server while idle must not crash the process.
 */
const adapter = new PrismaPg(
  {
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
  },
  { onPoolError: (err) => logger.warn({ err: err.message }, 'Database pool error (connection will be replaced)') },
);
export const prisma = new PrismaClient({ adapter });
