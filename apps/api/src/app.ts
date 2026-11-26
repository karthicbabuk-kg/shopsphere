import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'node:crypto';
import { API_PREFIX } from '@shopsphere/shared-config';
import { env } from './config/env.js';
import { openapi } from './config/openapi.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }),
  );

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.use(`${API_PREFIX}/health`, healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
