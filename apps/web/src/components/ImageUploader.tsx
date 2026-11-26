import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import type { ImageRef } from '@shopsphere/shared-validation';
import { thumb, uploadProductImages } from '../features/catalog/catalogApi';
import { toast } from '../store/toast';

const MAX = 8;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Uploads to the API (which stores on Cloudinary) and manages order; first image is the cover. */
export function ImageUploader({
  value,
  onChange,
  error,
}: {
  value: ImageRef[];
  onChange: (next: ImageRef[]) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function add(files: FileList | File[]) {
    const list = Array.from(files).slice(0, MAX - value.length);
    if (list.length === 0) return;
    const tooBig = list.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) return toast.error(`"${tooBig.name}" is larger than 5 MB`);
    setBusy(true);
    try {
      onChange([...value, ...(await uploadProductImages(list))]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {value.map((img, i) => (
          <li key={img.publicId} className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="relative aspect-square bg-zone">
              <img src={thumb(img.url, 400)} alt={`Product image ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute top-2 left-2 rounded-full bg-navy-700 px-2 py-0.5 font-mono text-[10px] tracking-wider text-white uppercase">
                  Cover
                </span>
              )}
            </div>
            <div className="flex items-center justify-between px-1 py-1">
              <span>
                <IconButton size="small" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowLeft size={16} />
                </IconButton>
                <IconButton size="small" aria-label="Move later" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  <ArrowRight size={16} />
                </IconButton>
              </span>
              <IconButton size="small" color="error" aria-label={`Remove image ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          </li>
        ))}
        {value.length < MAX && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void add(e.dataTransfer.files);
              }}
              className={`flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-muted transition-colors ${
                dragging ? 'border-blue-600 bg-blue-50' : 'border-line bg-white hover:border-blue-600'
              }`}
            >
              {busy ? <CircularProgress size={22} /> : <ImagePlus size={24} />}
              <span>{busy ? 'Uploading…' : 'Add images'}</span>
              <span className="text-xs text-faint">JPG, PNG, WebP · 5 MB</span>
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => e.target.files && void add(e.target.files)}
      />
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
