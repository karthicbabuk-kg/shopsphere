export const API_PREFIX = '/api/v1';

/**
 * Database-free liveness endpoint. One definition shared by the API (where it is mounted), the edge
 * proxy and the browser (which wake a sleeping free-tier API through it), so they can never disagree.
 */
export const PING_PATH = `${API_PREFIX}/ping`;

/** Money is always integer paise. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
/** ₹1,299 for whole rupees, ₹1,299.50 when paise are present. */
export const formatINR = (paise: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);

export const tokens = {
  color: {
    navy900: '#0B1A52',
    navy700: '#0F2167',
    blue600: '#1A5CC4',
    blue700: '#164A9E',
    blue50: '#EAF2FE',
    saffron500: '#F59E0B',
    saffron700: '#B45309',
    ink: '#24262A',
    muted: '#55585E',
    faint: '#666A70',
    canvas: '#FAFAFA',
    surface: '#FFFFFF',
    zone: '#E3E5E8',
    line: '#D5D9DF',
    success: '#15803D',
    warning: '#B45309',
    danger: '#DC2626',
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24 },
} as const;
