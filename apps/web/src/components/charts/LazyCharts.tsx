import { lazy, Suspense } from 'react';
import Skeleton from '@mui/material/Skeleton';

// The charting library is large, so it is fetched only when a chart is actually shown.
const Sales = lazy(() => import('./Charts').then((m) => ({ default: m.SalesChart })));
const Orders = lazy(() => import('./Charts').then((m) => ({ default: m.OrdersBars })));

type Point = { date: string; salesPaise: number; orders: number };

export const SalesChart = ({ data, height = 260 }: { data: Point[]; height?: number }) => (
  <Suspense fallback={<Skeleton variant="rounded" height={height} />}>
    <Sales data={data} height={height} />
  </Suspense>
);

export const OrdersBars = ({ data, height = 120 }: { data: Point[]; height?: number }) => (
  <Suspense fallback={<Skeleton variant="rounded" height={height} />}>
    <Orders data={data} height={height} />
  </Suspense>
);
