import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR, formatINRWhole } from '../../utils/format';

const BLUE = '#1F6FEB';
const AXIS = { fontSize: 11, fill: '#55585e' } as const;

const compact = (paise: number) => {
  const r = paise / 100;
  if (r >= 10_000_000) return `₹${(r / 10_000_000).toFixed(1)}Cr`;
  if (r >= 100_000) return `₹${(r / 100_000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(r >= 10_000 ? 0 : 1)}k`;
  return `₹${Math.round(r)}`;
};
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * Daily sales area chart. The chart itself is decorative to assistive tech; a visually hidden table
 * carries the same numbers, and a one-line summary is the accessible name.
 */
export function SalesChart({ data, height = 260 }: { data: { date: string; salesPaise: number; orders: number }[]; height?: number }) {
  const total = data.reduce((n, d) => n + d.salesPaise, 0);
  const best = data.reduce((a, b) => (b.salesPaise > a.salesPaise ? b : a), data[0] ?? { date: '', salesPaise: 0, orders: 0 });
  return (
    <figure className="m-0">
      <div role="img" aria-label={`Daily sales for the last ${data.length} days, ${formatINRWhole(total)} in total${total > 0 ? `, best day ${shortDate(best.date)} with ${formatINRWhole(best.salesPaise)}` : ''}`} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BLUE} stopOpacity={0.25} />
                <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e3e5e8" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={compact} tick={AXIS} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              formatter={(v) => [formatINR(Number(v)), 'Sales']}
              labelFormatter={(l) => shortDate(String(l))}
              contentStyle={{ borderRadius: 8, border: '1px solid #d5d9df', fontSize: 12 }}
            />
            <Area type="monotone" dataKey="salesPaise" stroke={BLUE} strokeWidth={2} fill="url(#salesFill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Daily sales</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Sales</th><th scope="col">Orders</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.date}><td>{shortDate(d.date)}</td><td>{formatINR(d.salesPaise)}</td><td>{d.orders}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export function OrdersBars({ data, height = 120 }: { data: { date: string; orders: number }[]; height?: number }) {
  return (
    <div aria-hidden="true" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={28} />
          <Tooltip formatter={(v) => [String(v), 'Orders']} labelFormatter={(l) => shortDate(String(l))} contentStyle={{ borderRadius: 8, border: '1px solid #d5d9df', fontSize: 12 }} />
          <Bar dataKey="orders" fill={BLUE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
