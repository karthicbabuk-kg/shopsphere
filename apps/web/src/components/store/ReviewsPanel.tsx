import { useState } from 'react';
import Pagination from '@mui/material/Pagination';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Skeleton from '@mui/material/Skeleton';
import { Star } from 'lucide-react';
import { useReviews, type ProductDetail } from '../../features/storefront/storeApi';
import { formatDate } from '../../utils/format';
import { RatingChip } from './RatingChip';

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={14} className={i <= n ? 'fill-amber-500 text-amber-500' : 'text-line'} aria-hidden="true" />
      ))}
    </span>
  );
}

export function ReviewsPanel({ slug, summary }: { slug: string; summary: ProductDetail['reviewSummary'] }) {
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useReviews(slug, sort, page);
  const max = Math.max(1, ...summary.distribution.map((d) => d.count));

  if (summary.count === 0) {
    return <p className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-muted">No reviews yet. Buyers can review a product after their order is delivered.</p>;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <div className="rounded-lg border border-line bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-4xl font-medium">{summary.average.toFixed(1)}</span>
          <div><Stars n={Math.round(summary.average)} /><p className="text-sm text-muted">{summary.count} {summary.count === 1 ? 'review' : 'reviews'}</p></div>
        </div>
        <ul className="mt-4 space-y-2" aria-label="Rating breakdown">
          {summary.distribution.map((d) => (
            <li key={d.star} className="flex items-center gap-2 text-sm">
              <span className="w-8 font-mono text-xs">{d.star} ★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-zone"><span className="block h-full rounded-full bg-amber-500" style={{ width: `${(d.count / max) * 100}%` }} /></span>
              <span className="w-6 text-right font-mono text-xs text-muted">{d.count}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-4 flex justify-end">
          <TextField select size="small" label="Sort reviews" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} sx={{ minWidth: 180, bgcolor: 'white' }}>
            <MenuItem value="recent">Most recent</MenuItem>
            <MenuItem value="high">Highest rated</MenuItem>
            <MenuItem value="low">Lowest rated</MenuItem>
          </TextField>
        </div>
        {isLoading ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {data?.items.map((r) => (
              <li key={r.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <RatingChip value={r.rating} count={1} />
                  {r.title && <h3 className="text-base">{r.title}</h3>}
                </div>
                {r.body && <p className="mt-2 text-sm text-muted">{r.body}</p>}
                <p className="mt-2 text-xs text-faint">{r.author} · {formatDate(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
        {data && data.meta.totalPages > 1 && <div className="mt-4 flex justify-center"><Pagination count={data.meta.totalPages} page={page} color="primary" onChange={(_, p) => setPage(p)} /></div>}
      </div>
    </div>
  );
}
