export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'ShopSphere API',
    version: '0.1.0',
    description: 'Multi-vendor e-commerce demo API',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: {
          '200': { description: 'API and database are up' },
          '503': { description: 'Database unreachable' },
        },
      },
    },
  },
};
