const ok = (description: string) => ({ description });
const json = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object', required, properties } } },
});
const str = { type: 'string' };

const sessionResponses = {
  '200': ok('Returns { accessToken, user }; sets httpOnly refresh cookie `ss_rt`'),
  '401': ok('Invalid credentials or session'),
  '422': ok('Validation error'),
};

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'ShopSphere API',
    version: '0.1.0',
    description:
      'Multi-vendor e-commerce demo API. All responses use `{ success, data | error }`. Authenticate with `Authorization: Bearer <accessToken>`.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: { '200': ok('API and database are up'), '503': ok('Database unreachable') },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a buyer',
        requestBody: json({ name: str, email: str, password: str, phone: str }, ['name', 'email', 'password']),
        responses: { ...sessionResponses, '201': ok('Created'), '409': ok('Email already registered') },
      },
    },
    '/auth/register-seller': {
      post: {
        tags: ['Auth'],
        summary: 'Apply as a seller (status PENDING until an admin approves)',
        requestBody: json(
          { name: str, email: str, password: str, phone: str, businessName: str, storeName: str, storeDescription: str, gstin: str },
          ['name', 'email', 'password', 'phone', 'businessName', 'storeName'],
        ),
        responses: { '201': ok('Created'), '409': ok('Email already registered'), '422': ok('Validation error') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in (5 failed attempts lock the account for 15 minutes)',
        requestBody: json({ email: str, password: str }),
        responses: { ...sessionResponses, '423': ok('Account temporarily locked') },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh cookie and get a new access token',
        responses: { '200': ok('New session'), '401': ok('Missing, expired or reused token') },
      },
    },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Revoke the current session', responses: { '200': ok('Logged out') } } },
    '/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke every session of the current user',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('Logged out everywhere') },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('{ user }'), '401': ok('Unauthenticated') },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Password reset simulation (demo mode returns the token instead of emailing it)',
        requestBody: json({ email: str }),
        responses: { '200': ok('Always succeeds to avoid revealing which emails exist') },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password using a single-use reset token',
        requestBody: json({ token: str, password: str }),
        responses: { '200': ok('Password updated; all sessions revoked'), '400': ok('Invalid or expired token') },
      },
    },
    '/sellers/me': {
      get: {
        tags: ['Sellers'],
        summary: 'Own seller profile (SELLER role)',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('{ seller }'), '403': ok('Not a seller') },
      },
      patch: {
        tags: ['Sellers'],
        summary: 'Update own store profile',
        security: [{ bearerAuth: [] }],
        requestBody: json(
          { name: str, description: str, contactEmail: str, contactPhone: str, city: str, state: str, businessName: str },
          [],
        ),
        responses: { '200': ok('{ seller }'), '422': ok('Validation error') },
      },
    },
    '/admin/overview': {
      get: {
        tags: ['Admin'],
        summary: 'Platform KPIs (buyers, sellers by status, products, orders, GMV, commission)',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('Overview'), '403': ok('Not an admin') },
      },
    },
    '/admin/sellers': {
      get: {
        tags: ['Admin'],
        summary: 'List sellers (status, q, page, pageSize)',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('{ items, statusCounts } + meta') },
      },
    },
    '/admin/sellers/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Seller detail with documents and audit history',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': ok('{ seller }'), '404': ok('Not found') },
      },
    },
    '/admin/sellers/{id}/{action}': {
      post: {
        tags: ['Admin'],
        summary: 'approve | reject | suspend | reactivate (reject/suspend need { reason }); invalid transitions return 409',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'action', in: 'path', required: true, schema: { type: 'string', enum: ['approve', 'reject', 'suspend', 'reactivate'] } },
        ],
        responses: { '200': ok('Updated seller'), '409': ok('Invalid status transition'), '422': ok('Reason missing') },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Own notifications with unread count',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('{ items, unread } + meta') },
      },
    },
    '/notifications/{id}/read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark one notification read (own only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': ok('Marked'), '404': ok('Not found') },
      },
    },
    '/notifications/read-all': {
      post: { tags: ['Notifications'], summary: 'Mark all own notifications read', security: [{ bearerAuth: [] }], responses: { '200': ok('Marked') } },
    },
    '/categories': { get: { tags: ['Catalogue'], summary: 'Active category tree (two levels)', responses: { '200': ok('{ categories }') } } },
    '/brands': { get: { tags: ['Catalogue'], summary: 'Active brands', responses: { '200': ok('{ brands }') } } },
    '/seller/products': {
      get: {
        tags: ['Seller products'],
        summary: 'Own products (q, status, approval, page, pageSize)',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('{ items } + meta') },
      },
      post: {
        tags: ['Seller products'],
        summary: 'Create a product with variants and opening stock (status DRAFT or ACTIVE=submit for review)',
        security: [{ bearerAuth: [] }],
        responses: { '201': ok('{ product }'), '403': ok('Store not approved (submit only)'), '409': ok('SKU already in use'), '422': ok('Validation error') },
      },
    },
    '/seller/products/{id}': {
      get: { tags: ['Seller products'], summary: 'Own product detail', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': ok('{ product }'), '404': ok('Not found or not yours') } },
      put: { tags: ['Seller products'], summary: 'Full update (stock quantities of existing variants are not changed here)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': ok('{ product }'), '403': ok('Suspended or store not approved'), '409': ok('SKU clash or reserved stock') } },
      delete: { tags: ['Seller products'], summary: 'Archive (soft); idempotent', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': ok('{ product }') } },
    },
    '/uploads/product-images': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload up to 8 images (multipart field "files", JPEG/PNG/WebP, 5 MB each) to Cloudinary',
        security: [{ bearerAuth: [] }],
        responses: { '201': ok('{ images: [{ url, publicId }] }'), '400': ok('Invalid file'), '503': ok('Cloudinary not configured') },
      },
    },
    '/sellers/me/logo': { post: { tags: ['Sellers'], summary: 'Upload store logo (multipart "file")', security: [{ bearerAuth: [] }], responses: { '200': ok('{ seller }') } } },
    '/sellers/me/documents': { post: { tags: ['Sellers'], summary: 'Upload a demo verification document (multipart "file" + "type")', security: [{ bearerAuth: [] }], responses: { '201': ok('{ seller }') } } },
    '/admin/products': { get: { tags: ['Admin'], summary: 'Submitted products (approval, q, sellerId, page)', security: [{ bearerAuth: [] }], responses: { '200': ok('{ items, approvalCounts } + meta') } } },
    '/admin/products/{id}/{action}': {
      post: {
        tags: ['Admin'],
        summary: 'approve | reject | suspend | reinstate (reject/suspend need { reason })',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'action', in: 'path', required: true, schema: { type: 'string', enum: ['approve', 'reject', 'suspend', 'reinstate'] } },
        ],
        responses: { '200': ok('{ product }'), '409': ok('Invalid transition') },
      },
    },
    '/admin/categories': { get: { tags: ['Admin'], summary: 'All categories incl. inactive, with usage counts', security: [{ bearerAuth: [] }], responses: { '200': ok('{ categories }') } }, post: { tags: ['Admin'], summary: 'Create category', security: [{ bearerAuth: [] }], responses: { '201': ok('{ category }'), '409': ok('Duplicate') } } },
    '/admin/brands': { get: { tags: ['Admin'], summary: 'All brands incl. inactive', security: [{ bearerAuth: [] }], responses: { '200': ok('{ brands }') } }, post: { tags: ['Admin'], summary: 'Create brand', security: [{ bearerAuth: [] }], responses: { '201': ok('{ brand }'), '409': ok('Duplicate') } } },
    '/seller/inventory': {
      get: { tags: ['Inventory'], summary: 'Stock levels per SKU (q, status IN_STOCK|LOW|OUT, page)', security: [{ bearerAuth: [] }], responses: { '200': ok('{ items } + meta') } },
    },
    '/seller/inventory/summary': {
      get: { tags: ['Inventory'], summary: 'Totals, valuation and alert lists (out of stock, reorder required, discrepancies)', security: [{ bearerAuth: [] }], responses: { '200': ok('Summary') } },
    },
    '/seller/inventory/{id}/{operation}': {
      post: {
        tags: ['Inventory'],
        summary: 'inward | outward | adjust | count. Atomic; outward/adjust require a reason; 409 when stock is insufficient',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'operation', in: 'path', required: true, schema: { type: 'string', enum: ['inward', 'outward', 'adjust', 'count'] } },
        ],
        responses: { '201': ok('{ previousQty, newQty, referenceNo } or { adjustment }'), '404': ok('Not found or not yours'), '409': ok('Insufficient stock / open count exists'), '422': ok('Validation error') },
      },
    },
    '/seller/stock-movements': {
      get: { tags: ['Inventory'], summary: 'Immutable stock ledger (type, inventoryId, from, to, page)', security: [{ bearerAuth: [] }], responses: { '200': ok('{ items } + meta') } },
    },
    '/seller/stock-adjustments': {
      get: { tags: ['Inventory'], summary: 'Physical counts (status OPEN|APPLIED|DISMISSED)', security: [{ bearerAuth: [] }], responses: { '200': ok('{ items } + meta') } },
    },
    '/seller/stock-adjustments/{id}/{action}': {
      post: {
        tags: ['Inventory'],
        summary: 'apply (reconcile the counted difference) | dismiss',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'action', in: 'path', required: true, schema: { type: 'string', enum: ['apply', 'dismiss'] } },
        ],
        responses: { '200': ok('Applied / dismissed'), '409': ok('Already resolved or no longer fits') },
      },
    },
    '/seller/warehouses': {
      get: { tags: ['Inventory'], summary: 'Own warehouses', security: [{ bearerAuth: [] }], responses: { '200': ok('{ warehouses }') } },
      post: { tags: ['Inventory'], summary: 'Add a warehouse', security: [{ bearerAuth: [] }], responses: { '201': ok('{ warehouse }'), '409': ok('Duplicate name') } },
    },
    '/admin/ping': {
      get: {
        tags: ['Admin'],
        summary: 'Admin role check',
        security: [{ bearerAuth: [] }],
        responses: { '200': ok('Admin access confirmed'), '403': ok('Not an admin') },
      },
    },
  },
};
