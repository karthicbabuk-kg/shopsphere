import { useCallback, useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { cdn, cdnSet } from '../../utils/cdn';

/**
 * Thumbnails + main image. Pointer users get a hover zoom; everyone can open a full-size lightbox
 * (click, Enter or tap) that supports arrow keys and Escape.
 */
export function ImageGallery({ images, name }: { images: { url: string }[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const count = images.length;
  const current = images[index];

  const go = useCallback((d: number) => setIndex((i) => (i + d + count) % count), [count]);
  useEffect(() => setIndex(0), [images]);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, go]);

  if (!current) {
    return <div className="grid aspect-square place-items-center rounded-lg bg-zone text-sm text-muted">No image available</div>;
  }

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto sm:max-h-[520px] sm:flex-col sm:overflow-y-auto" aria-label="Product images">
          {images.map((img, i) => (
            <li key={img.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                onMouseEnter={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${count}`}
                aria-current={i === index}
                className={`block h-16 w-16 overflow-hidden rounded-md border-2 bg-zone sm:h-[72px] sm:w-[72px] ${i === index ? 'border-blue-600' : 'border-transparent hover:border-line'}`}
              >
                <img src={cdn(img.url, 144)} alt="" width={72} height={72} loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          aria-label={`Open ${name} image ${index + 1} full size`}
          onClick={() => setLightbox(true)}
          onPointerMove={(e) => {
            if (e.pointerType === 'touch') return;
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onPointerLeave={() => setZoom(null)}
          className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg border border-line bg-zone"
        >
          <img
            src={cdn(current.url, 800)}
            srcSet={cdnSet(current.url, 560)}
            sizes="(min-width: 1024px) 520px, 90vw"
            alt={`${name} – image ${index + 1}`}
            width={800}
            height={800}
            fetchPriority="high"
            className="h-full w-full object-cover transition-transform duration-150 ease-out"
            style={zoom ? { transform: 'scale(2.2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          />
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs text-muted opacity-0 shadow-e1 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIn size={14} aria-hidden="true" /> Click to enlarge
          </span>
        </button>
      </div>

      <Dialog open={lightbox} onClose={() => setLightbox(false)} maxWidth="md" fullWidth aria-label={`${name} images`}>
        <div className="relative bg-white p-2 sm:p-4">
          <button type="button" onClick={() => setLightbox(false)} aria-label="Close image viewer" className="absolute top-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white shadow-e2"><X size={20} /></button>
          <img src={cdn(current.url, 1200)} alt={`${name} – image ${index + 1} of ${count}`} className="mx-auto max-h-[78vh] w-auto rounded-md object-contain" />
          {count > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute top-1/2 left-3 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow-e2"><ChevronLeft size={22} /></button>
              <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute top-1/2 right-3 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white shadow-e2"><ChevronRight size={22} /></button>
              <p className="mt-2 text-center font-mono text-xs text-muted">{index + 1} / {count}</p>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
