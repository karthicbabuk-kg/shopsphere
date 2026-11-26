import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/security.js';

/**
 * Idempotent seed. Phase 3 seeds only the administrator; catalogue/demo data arrives later.
 * The admin password comes from the environment, never from source code.
 */
async function main() {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding');
  }

  const admin = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      name: 'Platform Admin',
      role: 'ADMIN',
    },
  });
  console.warn(`Seeded admin: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
