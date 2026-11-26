import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { ArrowDown, ArrowUp, ImageOff, MoreVertical, TriangleAlert } from 'lucide-react';
import { STOCK_MOVEMENT_TYPES, STOCK_STATUSES, type StockMovementKind, type StockStatus } from '@shopsphere/shared-validation';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { thumb } from '../../features/catalog/catalogApi';
import { StockDialog, type DialogMode } from '../../features/inventory/StockDialog';
import {
  useAdjustments,
  useInventory,
  useInventorySummary,
  useMovements,
  useResolveAdjustment,
  type InventoryRow,
} from '../../features/inventory/inventoryApi';
import { formatDate, formatDateTime, formatINRWhole } from '../../utils/format';

type TabKey = 'stock' | 'ledger' | 'counts';

const STATUS_LABEL: Record<StockStatus, string> = { IN_STOCK: 'In stock', LOW: 'Reorder', OUT: 'Out of stock' };
const STATUS_TONE = { IN_STOCK: 'success', LOW: 'warning', OUT: 'danger' } as const;

const TYPE_LABEL: Record<StockMovementKind, string> = {
  OPENING: 'Opening stock',
  INWARD: 'Stock in',
  OUTWARD: 'Stock out',
  ADJUSTMENT: 'Adjustment',
  RESERVE: 'Reserved',
  RELEASE: 'Released',
  SALE: 'Sold',
  RETURN_RESTOCK: 'Return restocked',
  RECONCILIATION: 'Reconciled',
};
const TYPE_TONE: Record<StockMovementKind, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  OPENING: 'info',
  INWARD: 'success',
  OUTWARD: 'warning',
  ADJUSTMENT: 'neutral',
  RESERVE: 'info',
  RELEASE: 'neutral',
  SALE: 'success',
  RETURN_RESTOCK: 'info',
  RECONCILIATION: 'warning',
};

function useDebounced(value: string, onCommit: (v: string) => void, current: string) {
  useEffect(() => {
    const t = setTimeout(() => value !== current && onCommit(value), 300);
    return () => clearTimeout(t);
  }, [value, current, onCommit]);
}

function PageControls({ count, page, onChange }: { count: number; page: number; onChange: (p: number) => void }) {
  if (count <= 1) return null;
  return (
    <div className="mt-4 flex justify-end">
      <Pagination count={count} page={page} color="primary" onChange={(_, p) => onChange(p)} />
    </div>
  );
}

function SignedQty({ n }: { n: number }) {
  if (n === 0) return <span className="font-mono text-faint">±0</span>;
  const up = n > 0;
  return (
    <span className={`inline-flex items-center gap-1 font-mono tabular-nums ${up ? 'text-success' : 'text-danger'}`}>
      {up ? <ArrowUp size={14} aria-label="Increase" /> : <ArrowDown size={14} aria-label="Decrease" />}
      {up ? '+' : '−'}
      {Math.abs(n)}
    </span>
  );
}

// ───────────────────────── Stock tab ─────────────────────────

function StockTab({ onAction }: { onAction: (mode: DialogMode, row: InventoryRow) => void }) {
  const [params, setParams] = useSearchParams();
  const status = STOCK_STATUSES.find((s) => s === params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qParam = params.get('q') ?? '';
  const [search, setSearch] = useState(qParam);
  const [menu, setMenu] = useState<{ el: HTMLElement; row: InventoryRow } | null>(null);

  useDebounced(search, (v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set('q', v); else n.delete('q'); n.delete('page'); return n; }), qParam);
  const { data, isLoading, isError, isFetching } = useInventory({ q: qParam || undefined, status, page });

  const setStatus = (s: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (s) n.set('status', s);
      else n.delete('status');
      n.delete('page');
      return n;
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextField type="search" size="small" label="Search by product or SKU" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: { xs: '100%', sm: 320 }, bgcolor: 'white' }} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by stock status">
          {[{ v: '', l: 'All' }, ...STOCK_STATUSES.map((s) => ({ v: s, l: STATUS_LABEL[s] }))].map((f) => (
            <Chip key={f.v} label={f.l} clickable color={(status ?? '') === f.v ? 'primary' : 'default'} variant={(status ?? '') === f.v ? 'filled' : 'outlined'} onClick={() => setStatus(f.v)} />
          ))}
        </div>
      </div>

      {isError ? (
        <Alert severity="error">Could not load inventory.</Alert>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={320} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={qParam || status ? 'No SKUs match' : 'No inventory yet'}
          message={qParam || status ? 'Try a different filter.' : 'Inventory appears here once you add products with SKUs.'}
          action={!qParam && !status ? <Button component={Link} to="/seller/products/new" variant="contained">Add a product</Button> : undefined}
        />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Product / SKU</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 text-right font-medium">Available</th>
                  <th className="px-5 py-3 text-right font-medium">Reserved</th>
                  <th className="px-5 py-3 text-right font-medium">Sold</th>
                  <th className="px-5 py-3 text-right font-medium">Reorder at</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.items.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-zone">
                          {r.image ? <img src={thumb(r.image, 88)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageOff size={16} className="text-faint" aria-label="No image" />}
                        </span>
                        <span>
                          <Link to={`/seller/products/${r.productId}`} className="block max-w-[260px] truncate font-medium text-blue-600">{r.productName}</Link>
                          <span className="block font-mono text-xs text-muted">{r.sku}{r.label !== 'Default' ? ` · ${r.label}` : ''}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-5 text-muted">
                      {r.warehouse.name}
                      {r.warehouse.location && <span className="block text-xs">{r.warehouse.location}</span>}
                    </td>
                    <td className="px-5 text-right font-mono text-base font-medium tabular-nums">{r.available}</td>
                    <td className="px-5 text-right font-mono tabular-nums text-muted">{r.reserved}</td>
                    <td className="px-5 text-right font-mono tabular-nums text-muted">{r.sold}</td>
                    <td className="px-5 text-right font-mono tabular-nums text-muted">{r.reorderLevel}</td>
                    <td className="px-5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
                        {r.openCount && <StatusBadge status="Count open" tone="info" />}
                      </div>
                    </td>
                    <td className="px-5 text-right whitespace-nowrap">
                      <Button size="small" variant="outlined" onClick={() => onAction('in', r)}>Stock in</Button>
                      <IconButton aria-label={`More actions for ${r.sku}`} onClick={(e) => setMenu({ el: e.currentTarget, row: r })}>
                        <MoreVertical size={18} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <PageControls count={data.meta.totalPages} page={page} onChange={(p) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('page', String(p)); return n; })} />
          )}
        </div>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {([
          ['out', 'Stock out'],
          ['adjust', 'Manual adjustment'],
          ['count', 'Record physical count'],
          ['settings', 'Reorder level & location'],
        ] as const).map(([mode, label]) => (
          <MenuItem key={mode} onClick={() => { const row = menu!.row; setMenu(null); onAction(mode, row); }}>{label}</MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            const row = menu!.row;
            setMenu(null);
            setParams({ tab: 'ledger', inventoryId: row.id, sku: row.sku });
          }}
        >
          View history
        </MenuItem>
      </Menu>
    </>
  );
}

// ───────────────────────── Ledger tab ─────────────────────────

function LedgerTab() {
  const [params, setParams] = useSearchParams();
  const type = STOCK_MOVEMENT_TYPES.find((t) => t === params.get('type'));
  const inventoryId = params.get('inventoryId') ?? undefined;
  const sku = params.get('sku');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isLoading, isError, isFetching } = useMovements({ type, inventoryId, page });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TextField select size="small" label="Movement type" value={type ?? ''} onChange={(e) => setParams((p) => { const n = new URLSearchParams(p); if (e.target.value) n.set('type', e.target.value); else n.delete('type'); n.delete('page'); return n; })} sx={{ minWidth: 200, bgcolor: 'white' }}>
          <MenuItem value="">All types</MenuItem>
          {STOCK_MOVEMENT_TYPES.map((t) => <MenuItem key={t} value={t}>{TYPE_LABEL[t]}</MenuItem>)}
        </TextField>
        {inventoryId && (
          <Chip label={`SKU ${sku ?? ''}`} onDelete={() => setParams((p) => { const n = new URLSearchParams(p); n.delete('inventoryId'); n.delete('sku'); n.delete('page'); return n; })} />
        )}
        <span className="ml-auto text-sm text-muted">Entries are permanent and cannot be edited or deleted.</span>
      </div>

      {isError ? (
        <Alert severity="error">Could not load the stock ledger.</Alert>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={320} />
      ) : data && data.items.length === 0 ? (
        <EmptyState title="No movements yet" message="Every stock change is recorded here with who did it and why." />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Product / SKU</th>
                  <th className="px-5 py-3 text-right font-medium">Change</th>
                  <th className="px-5 py-3 text-right font-medium">Before → after</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.items.map((m) => (
                  <tr key={m.id} className="align-top hover:bg-blue-50">
                    <td className="px-5 py-3 font-mono text-xs whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</td>
                    <td className="px-5 py-3"><StatusBadge status={TYPE_LABEL[m.type]} tone={TYPE_TONE[m.type]} /></td>
                    <td className="px-5 py-3">
                      <span className="block max-w-[220px] truncate">{m.productName}</span>
                      <span className="font-mono text-xs text-muted">{m.sku}</span>
                    </td>
                    <td className="px-5 py-3 text-right"><SignedQty n={m.changeQty} /></td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-muted">{m.previousQty} → <span className="text-ink">{m.newQty}</span></td>
                    <td className="max-w-[240px] px-5 py-3 text-muted">{m.reason ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted">{m.referenceNo ?? '—'}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{m.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <PageControls count={data.meta.totalPages} page={page} onChange={(p) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('page', String(p)); return n; })} />}
        </div>
      )}
    </>
  );
}

// ───────────────────────── Counts tab ─────────────────────────

function CountsTab() {
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAdjustments(openOnly ? 'OPEN' : undefined, page);
  const resolve = useResolveAdjustment();

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter counts">
        <Chip label="Needs review" clickable color={openOnly ? 'primary' : 'default'} variant={openOnly ? 'filled' : 'outlined'} onClick={() => { setOpenOnly(true); setPage(1); }} />
        <Chip label="All counts" clickable color={!openOnly ? 'primary' : 'default'} variant={!openOnly ? 'filled' : 'outlined'} onClick={() => { setOpenOnly(false); setPage(1); }} />
      </div>
      {isError ? (
        <Alert severity="error">Could not load stock counts.</Alert>
      ) : isLoading ? (
        <Skeleton variant="rounded" height={240} />
      ) : data && data.items.length === 0 ? (
        <EmptyState title={openOnly ? 'No discrepancies' : 'No counts recorded'} message="Record a physical count from the Stock tab. Differences from the system appear here for you to apply or dismiss." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-canvas font-mono text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Product / SKU</th>
                  <th className="px-5 py-3 text-right font-medium">System said</th>
                  <th className="px-5 py-3 text-right font-medium">Counted</th>
                  <th className="px-5 py-3 text-right font-medium">Difference</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Counted on</th>
                  <th className="px-5 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.items.map((a) => (
                  <tr key={a.id} className="hover:bg-blue-50">
                    <td className="px-5 py-3">
                      <span className="block max-w-[240px] truncate font-medium">{a.productName}</span>
                      <span className="font-mono text-xs text-muted">{a.sku}</span>
                      {a.reason && <span className="block text-xs text-muted">“{a.reason}”</span>}
                    </td>
                    <td className="px-5 text-right font-mono tabular-nums">{a.expectedQty}</td>
                    <td className="px-5 text-right font-mono tabular-nums">{a.countedQty}</td>
                    <td className="px-5 text-right"><SignedQty n={a.difference} /></td>
                    <td className="px-5">
                      <StatusBadge status={a.status === 'OPEN' ? 'Needs review' : a.status === 'APPLIED' ? 'Applied' : 'Dismissed'} tone={a.status === 'OPEN' ? 'warning' : a.status === 'APPLIED' ? 'success' : 'neutral'} />
                    </td>
                    <td className="px-5 font-mono text-xs text-muted">{formatDate(a.createdAt)}</td>
                    <td className="px-5 text-right whitespace-nowrap">
                      {a.status === 'OPEN' && (
                        <>
                          <Button size="small" variant="contained" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: a.id, action: 'apply' })}>Apply correction</Button>{' '}
                          <Button size="small" color="inherit" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: a.id, action: 'dismiss' })}>Dismiss</Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <PageControls count={data.meta.totalPages} page={page} onChange={setPage} />}
        </>
      )}
    </>
  );
}

// ───────────────────────── Page ─────────────────────────

export function SellerInventoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['stock', 'ledger', 'counts'] as const).find((t) => t === params.get('tab')) ?? 'stock';
  const { data: s, isLoading } = useInventorySummary();
  const [dialog, setDialog] = useState<{ mode: DialogMode; row: InventoryRow } | null>(null);

  const goStock = (status: StockStatus) => setParams({ tab: 'stock', status });

  return (
    <>
      <PageHeader title="Inventory" subtitle="Live stock levels, movements and counts for every SKU." />

      {isLoading || !s ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} variant="rounded" height={116} />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="SKUs" value={s.skuCount} />
            <StatCard label="Units available" value={s.unitsAvailable} hint={`${s.unitsReserved} reserved · ${s.unitsSold} sold`} />
            <StatCard label="Reorder needed" value={s.lowStockCount} accent={s.lowStockCount > 0} hint={s.lowStockCount ? 'At or below reorder level' : 'All healthy'} />
            <StatCard label="Out of stock" value={s.outOfStockCount} accent={s.outOfStockCount > 0} hint={s.outOfStockCount ? 'Not purchasable' : 'None'} />
            <StatCard label="Stock value" value={formatINRWhole(s.valuationPaise)} hint="At selling price" />
          </div>

          {(s.outOfStockCount > 0 || s.lowStockCount > 0 || s.openDiscrepancies > 0) && (
            <div className="mt-4 space-y-2" aria-label="Inventory alerts">
              {s.outOfStockCount > 0 && (
                <Alert severity="error" icon={<TriangleAlert size={18} />} action={<Button color="inherit" size="small" onClick={() => goStock('OUT')}>View</Button>}>
                  <strong>{s.outOfStockCount} SKU{s.outOfStockCount > 1 ? 's are' : ' is'} out of stock:</strong>{' '}
                  {s.alerts.outOfStock.slice(0, 3).map((a) => a.sku).join(', ')}{s.outOfStockCount > 3 ? '…' : ''}
                </Alert>
              )}
              {s.lowStockCount > 0 && (
                <Alert severity="warning" icon={<TriangleAlert size={18} />} action={<Button color="inherit" size="small" onClick={() => goStock('LOW')}>View</Button>}>
                  <strong>Reorder required for {s.lowStockCount} SKU{s.lowStockCount > 1 ? 's' : ''}:</strong>{' '}
                  {s.alerts.reorderRequired.slice(0, 3).map((a) => `${a.sku} (${a.available})`).join(', ')}{s.lowStockCount > 3 ? '…' : ''}
                </Alert>
              )}
              {s.openDiscrepancies > 0 && (
                <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => setParams({ tab: 'counts' })}>Review</Button>}>
                  <strong>{s.openDiscrepancies} inventory discrepanc{s.openDiscrepancies > 1 ? 'ies' : 'y'}</strong> found in physical counts and waiting for your review.
                </Alert>
              )}
            </div>
          )}
        </>
      )}

      <Tabs value={tab} onChange={(_, v: TabKey) => setParams({ tab: v })} sx={{ borderBottom: 1, borderColor: 'divider', my: 3 }} aria-label="Inventory sections">
        <Tab value="stock" label="Stock levels" />
        <Tab value="ledger" label="Movement ledger" />
        <Tab value="counts" label={`Counts${s?.openDiscrepancies ? ` (${s.openDiscrepancies})` : ''}`} />
      </Tabs>

      {tab === 'stock' && <StockTab onAction={(mode, row) => setDialog({ mode, row })} />}
      {tab === 'ledger' && <LedgerTab />}
      {tab === 'counts' && <CountsTab />}

      <StockDialog mode={dialog?.mode ?? null} row={dialog?.row ?? null} onClose={() => setDialog(null)} />
    </>
  );
}
