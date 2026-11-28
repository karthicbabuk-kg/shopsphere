import { Router } from 'express';
import { prisma } from '../../database/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  let db = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'down';
  }
  res.status(db === 'up' ? 200 : 503).json({
    success: db === 'up',
    data: { status: db === 'up' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) },
  });
});

/**
 * Liveness only: answers without touching the database. An uptime pinger can call this to keep a
 * free Render instance awake without waking the (separately suspending) Neon database.
 */
healthRouter.get('/ping', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { status: 'alive', uptime: Math.round(process.uptime()) } });
});
