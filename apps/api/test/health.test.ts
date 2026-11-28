import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  it('reports the API and database as up', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok', db: 'up' } });
  });

  it('has a liveness ping that never needs the database', async () => {
    const res = await request(createApp()).get('/api/v1/health/ping');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'alive' } });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toMatch(/db/);
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await request(createApp()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });
});
