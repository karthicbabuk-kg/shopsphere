import { cdn, cdnSet } from './cdn';
import { formatINR, formatINRWhole, timeAgo } from './format';

describe('formatINR', () => {
  it('shows whole rupees without decimals and keeps paise when present', () => {
    expect(formatINR(649900)).toBe('₹6,499');
    expect(formatINR(649950)).toBe('₹6,499.50');
    expect(formatINR(0)).toBe('₹0');
  });

  it('uses Indian digit grouping', () => {
    expect(formatINR(127479700)).toBe('₹12,74,797');
    expect(formatINRWhole(127479750)).toBe('₹12,74,798');
  });
});

describe('cdn', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/v1/shopsphere/a/b.png';

  it('adds responsive transformations to Cloudinary URLs', () => {
    expect(cdn(url, 400)).toBe('https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_400,q_auto,f_auto/v1/shopsphere/a/b.png');
    expect(cdnSet(url, 200)).toContain(' 1x, ');
    expect(cdnSet(url, 200)).toContain('w_400');
  });

  it('leaves other URLs and empty values untouched', () => {
    expect(cdn('https://example.com/x.png', 400)).toBe('https://example.com/x.png');
    expect(cdnSet('https://example.com/x.png', 400)).toBeUndefined();
    expect(cdn(null, 400)).toBeUndefined();
  });
});

describe('timeAgo', () => {
  it('describes recent times in plain words', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min ago');
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('3 h ago');
    expect(timeAgo(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2 d ago');
  });
});
