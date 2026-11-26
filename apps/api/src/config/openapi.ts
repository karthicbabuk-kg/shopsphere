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
