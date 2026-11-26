// Integration tests run against the dedicated shopsphere_test database.
try {
  process.loadEnvFile('../../.env');
} catch {
  /* env injected by CI */
}
process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Never talk to the real Cloudinary account from tests, whatever is in .env.
process.env.CLOUDINARY_CLOUD_NAME = 'testcloud';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
