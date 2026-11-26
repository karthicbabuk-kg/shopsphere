import { useState } from 'react';
import Pagination from '@mui/material/Pagination';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Skeleton from '@mui/material/Skeleton';
import { Star } from 'lucide-react';
import Button from '@mui/material/Button';
import { useMyReview, useSaveReview } from '../../features/orders/ordersApi';
import { useReviews, type ProductDetail } from '../../features/storefront/storeApi';
import { useAuth } from '../../store/auth';
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

/** Shown only to buyers whose order containing this product was delivered; one editable review each. */
function ReviewForm({ productId, slug }: { productId: string; slug: string }) {
  const user = useAuth((s) => s.user);
  const { data } = useMyReview(productId, user?.role === 'BUYER');
  const save = useSaveReview(productId, slug);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data?.eligible) return null;
  const mine = data.review;

  const start = () => { setRating(mine?.rating ?? 0); setTitle(mine?.title ?? ''); setBody(mine?.body ?? ''); setErr(null); setOpen(true); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return setErr('Choose a star rating');
    setErr(null);
    save.mutate({ rating, title: title.trim() || undefined, body: body.trim() || undefined }, { onSuccess: () => setOpen(false) });
  };

  if (!open) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <p className="text-sm">{mine ? <>You rated this <strong>{mine.rating}/5</strong>. Thanks for sharing.</> : 'You bought this product. Share what you think.'}</p>
        <Button variant={mine ? 'outlined' : 'contained'} size="small" onClick={start}>{mine ? 'Edit your review' : 'Write a review'}</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="mb-6 rounded-lg border border-line bg-white p-5" aria-label="Write a review">
      <fieldset onMouseLeave={() => setHover(0)}>
        <legend className="mb-1 text-sm font-bold">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} className="p-0.5">
              <Star size={28} className={n <= (hover || rating) ? 'fill-amber-500 text-amber-500' : 'text-line'} aria-hidden="true" />
            </button>
          ))}
        </div>
        {err && <p role="alert" className="mt-1 text-sm text-danger">{err}</p>}
      </fieldset>
      <TextField fullWidth size="small" label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} sx={{ mt: 2 }} />
      <TextField fullWidth multiline minRows={3} label="Your review (optional)" value={body} onChange={(e) => setBody(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} sx={{ mt: 2 }} />
      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="contained" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Submit review'}</Button>
        <Button color="inherit" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
      </div>
    </form>
  );
}

export function ReviewsPanel({ productId, slug, summary }: { productId: string; slug: string; summary: ProductDetail['reviewSummary'] }) {
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useReviews(slug, sort, page);
  const max = Math.max(1, ...summary.distribution.map((d) => d.count));

  if (summary.count === 0) {
    return (
      <div>
        <ReviewForm productId={productId} slug={slug} />
        <p className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-muted">No reviews yet. Buyers can review a product after their order is delivered.</p>
      </div>
    );
  }

  return (
    <div>
    <ReviewForm productId={productId} slug={slug} />
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
    </div>
  );
}
