# ShopSphere Design System

Light-first. Derived from `REFERENCE_DESIGN_ANALYSIS.md`. Implemented as CSS variables + Tailwind theme; MUI themed to match (single source: `packages/shared-config/tokens.ts`).

## Brand
Name: **ShopSphere**. Logo: wordmark in DM Sans 700 with a circular "sphere" mark (blue ring + dot pin, echoing the reference's pin motif). Original artwork only.

## Colour
| Token | Hex | Use |
|---|---|---|
| `navy-900` | `#0B1A52` | admin/seller sidebar, footer |
| `navy-700` | `#0F2167` | primary brand, headings on dark |
| `blue-600` | `#1A5CC4` | primary action, links, pins, focus |
| `blue-700` | `#164A9E` | hover/pressed |
| `blue-50` | `#EAF2FE` | selected rows, info tint |
| `saffron-500` | `#F59E0B` | buyer CTA (Buy now), offers, ratings |
| `saffron-700` | `#B45309` | text on amber tint |
| `ink` | `#24262A` | body text |
| `muted` | `#55585E` | secondary text (AA on white) |
| `faint` | `#666A70` | captions and hints (4.5:1 or better on white and tinted surfaces) |
| `canvas` | `#FAFAFA` | page background |
| `surface` | `#FFFFFF` | cards, tables |
| `zone` | `#E3E5E8` | tonal panels, inputs, chips |
| `line` | `#D5D9DF` | 1px borders |
| `success` `#15803D` / `warning` `#B45309` / `danger` `#DC2626` / `info` `#1A5CC4` | status, each with a 50-tint for badges |

Contrast: all text pairs ≥ 4.5:1 (checked in Phase 10). Colour never carries meaning alone (badges include text/icon).

## Typography
- Sans: **DM Sans** 400/500/700. Mono: **DM Mono** 400/500 for SKU, order numbers, amounts in tables, eyebrows.
- Scale (px / line-height): Display 56/1.05 · H1 40/1.1 · H2 30/1.15 · H3 22/1.25 · H4 18/1.3 · Body 16/1.6 · Small 14/1.5 · Caption 12/1.4. Fluid via `clamp()` for Display–H2.
- Heading letter-spacing -0.03em; body 0. Max line length 65ch. Numbers use tabular-nums.
- Currency formatting: `Intl.NumberFormat('en-IN')`, values stored as integer paise.

## Spacing, grid, radius, elevation
- Spacing (4px base): 4, 8, 12, 16, 24, 32, 48, 64, 96. Section padding `clamp(48px,7vw,96px)` (storefront), 24–32px inside dashboards.
- Container 1280px storefront, fluid dashboard with 240px sidebar (72px collapsed). 12-column grid, 24px gutter (16px mobile).
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Mobile-first.
- Radius: 8 (chips, small), 12 (inputs, buttons), 16 (cards), 24 (feature panels), 999 (pills/avatars).
- Elevation: `e0` none (default; use borders), `e1` `0 1px 2px rgba(15,23,42,.06)`, `e2` `0 8px 24px rgba(15,23,42,.10)` (menus, drawers), `e3` `0 24px 64px rgba(15,23,42,.18)` (modals).

## Components
Each has default/hover/focus/active/disabled/loading states and is built once in `apps/web/src/components`.
- **Button**: primary (blue), accent (saffron, buyer CTAs), secondary (zone), ghost, danger; sizes 36/44/52px (min 44px touch on mobile); loading spinner keeps width.
- **Input/Select/Textarea/Checkbox/Radio/Switch**: 44px, 12px radius, zone fill → white + blue ring on focus, helper + error text below, RHF + Zod wired.
- **Product card**: 1:1 image (object-fit cover, lazy), wishlist toggle, name (2-line clamp), store name, price (mono) + MRP struck + discount badge, rating chip, stock badge.
- **Data table**: sticky header, 48px rows, mono numeric columns right-aligned, row hover blue-50, sortable headers, bulk bar, pagination, empty/loading/error rows; collapses to stacked cards <768px.
- **Stat card**: label (mono caption), value, delta, sparkline.
- **Charts** (Recharts): single blue primary series, navy/saffron secondary; direct labels, no 3D, accessible table fallback.
- **Badges**: order/stock/approval status with icon + text.
- **Modal** (centered, e3, focus-trap), **Drawer** (right, 420px, e2; bottom sheet on mobile), **Toast** (bottom-right, 4s, `aria-live`), **Tabs**, **Stepper** (checkout, order tracking), **Breadcrumbs**, **Pagination**, **Skeleton** (shimmer, static under reduced motion), **Empty state** (inline SVG illustration + one action), **Error state** (retry), **Avatar**, **Tooltip**.
- Icons: Lucide, 20px default, 1.75 stroke.

## Motion
Durations 120ms (hover), 200ms (drawers/modals), 280ms (page). Easing `cubic-bezier(.2,.8,.2,1)`. Framer Motion for route fades, drawer/modal, list reorders only. `prefers-reduced-motion` → opacity-only or none.

## Portal personalities
| | Buyer | Seller | Admin |
|---|---|---|---|
| Chrome | white header, navy category bar | navy sidebar + white top bar | navy-900 sidebar + white top bar |
| Density | comfortable | compact | compact |
| Accent | saffron CTAs | blue | blue |
| Hero element | imagery | tables + KPIs | KPIs + approvals queue |

## Tech notes
Tailwind for layout/spacing/utility; MUI for complex widgets (DataGrid-lite alternatives avoided; Dialog, Autocomplete, DatePicker, Menu) themed via `createTheme` from the same tokens. Preflight conflicts resolved with MUI `StyledEngineProvider injectFirst`. Fonts self-hosted (Fontsource) with `font-display: swap`.

**Contrast revision (Phase 10).** An automated axe scan showed the original blue, green, amber and grey text colours fell below WCAG AA (4.5:1) on white or tinted backgrounds. The tokens above are the corrected values; the logo, illustrations and chart strokes keep the brighter brand blue because graphics only need 3:1.

## Motion and smoothness (added after the Ubuntu-style smoothness request)
The look is unchanged; the feel is tuned. One easing curve (`--ease-out`, `cubic-bezier(0.2, 0.8, 0.2, 1)`) and short durations are used everywhere.

| Where | Behaviour | Source |
|---|---|---|
| Page change | 0.22 s fade and 6 px rise; never on the very first load (it would only delay first paint) | `RouteFade`, `.route-fade` in `index.css` |
| Scroll | New page starts at the top, Back restores the earlier position; pagination scrolls to the top of the results | React Router `ScrollRestoration` (pages must not call `window.scrollTo` on mount) |
| Links | The page behind a link starts downloading when you point at, focus or touch it; product cards also start loading the product data | `preloadForPath` in `app/router.tsx`, `ProductCard` |
| Buttons | 120 ms press feedback (scale 0.97) with MUI's colour and shadow transitions kept | `index.css` |
| Header counters | Cart and wishlist numbers bump when they change | `.badge-bump` |
| Hero slides | 0.28 s fade-in | `.slide-in` |

Rules: animate only `opacity` and `transform` (no layout shifts), keep durations under 0.35 s, and switch every animation off under `prefers-reduced-motion: reduce` (the global rule in `index.css` plus per-class rules; tested in `e2e/motion.spec.ts`).
