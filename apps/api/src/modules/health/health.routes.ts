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
