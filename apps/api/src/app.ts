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
import { authRouter } from './modules/auth/auth.routes.js';
import { sellersRouter } from './modules/sellers/sellers.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { categoriesRouter } from './modules/categories/categories.routes.js';
import { brandsRouter } from './modules/brands/brands.routes.js';
import { sellerProductsRouter } from './modules/products/seller-products.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { productsRouter, storefrontRouter } from './modules/storefront/storefront.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { couponsRouter } from './modules/coupons/coupons.routes.js';
import { wishlistRouter } from './modules/wishlist/wishlist.routes.js';
import { addressesRouter } from './modules/addresses/addresses.routes.js';
import { checkoutRouter, ordersRouter, sellerOrdersRouter } from './modules/orders/orders.routes.js';
import { reviewsRouter } from './modules/reviews/reviews.routes.js';
import {
  inventoryRouter,
  stockAdjustmentsRouter,
  stockMovementsRouter,
  warehousesRouter,
} from './modules/inventory/inventory.routes.js';

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
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/sellers`, sellersRouter);
  app.use(`${API_PREFIX}/admin`, adminRouter);
  app.use(`${API_PREFIX}/notifications`, notificationsRouter);
  app.use(`${API_PREFIX}/categories`, categoriesRouter);
  app.use(`${API_PREFIX}/brands`, brandsRouter);
  app.use(`${API_PREFIX}/seller/products`, sellerProductsRouter);
  app.use(`${API_PREFIX}/uploads`, uploadsRouter);
  app.use(`${API_PREFIX}/products`, productsRouter);
  app.use(`${API_PREFIX}/storefront`, storefrontRouter);
  app.use(`${API_PREFIX}/coupons`, couponsRouter);
  app.use(`${API_PREFIX}/cart`, cartRouter);
  app.use(`${API_PREFIX}/wishlist`, wishlistRouter);
  app.use(`${API_PREFIX}/addresses`, addressesRouter);
  app.use(`${API_PREFIX}/checkout`, checkoutRouter);
  app.use(`${API_PREFIX}/orders`, ordersRouter);
  app.use(`${API_PREFIX}/reviews`, reviewsRouter);
  app.use(`${API_PREFIX}/seller/orders`, sellerOrdersRouter);
  app.use(`${API_PREFIX}/seller/inventory`, inventoryRouter);
  app.use(`${API_PREFIX}/seller/stock-movements`, stockMovementsRouter);
  app.use(`${API_PREFIX}/seller/stock-adjustments`, stockAdjustmentsRouter);
  app.use(`${API_PREFIX}/seller/warehouses`, warehousesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
