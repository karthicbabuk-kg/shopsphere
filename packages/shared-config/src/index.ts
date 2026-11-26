export const API_PREFIX = '/api/v1';

/** Money is always integer paise. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
export const formatINR = (paise: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);

export const tokens = {
  color: {
    navy900: '#0B1A52',
    navy700: '#0F2167',
    blue600: '#1F6FEB',
    blue700: '#1A5CC4',
    blue50: '#EAF2FE',
    saffron500: '#F59E0B',
    saffron700: '#B45309',
    ink: '#24262A',
    muted: '#55585E',
    faint: '#73767C',
    canvas: '#FAFAFA',
    surface: '#FFFFFF',
    zone: '#E3E5E8',
    line: '#D5D9DF',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24 },
} as const;
