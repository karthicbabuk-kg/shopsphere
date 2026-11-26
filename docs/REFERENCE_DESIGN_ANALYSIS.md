# Reference Design Analysis – sasthasoft.com

## Method and limits
- Fetched live HTML for `/`, `/inventory-control-services`, `/inventory-management-consultant-chennai` (HTTP 200) and the two stylesheets `/assets/css/styles.css` (v1 tokens) and `/assets/css/theme.css` (v13 override, "Godown floor plan").
- **Limitation:** no browser/screenshot tooling was used. Desktop/tablet/mobile behaviour is inferred from CSS media queries (900/980/1000/760px), not from rendered screenshots. Animation details are limited to what is in CSS.
- `/services`, `/about`, `/contact`, `/portfolio` return 404 (single-page site).

## Brand and content strategy
- SasthaSoft (formerly Sastha Inventory Solutions), Chennai. Onsite inventory control + ERP software.
- Voice: short, declarative, outcome-first ("We engineer control.", "Inventory leakage is silent.", "Every item gets a home.").
- Story = process: Diagnose → Structure → Stabilize; Inbound → Storage → Control → Outbound; 3-step "How to start" with a price per step.
- Trust: stats (95% accuracy, 3–6 months, 10+ years), named clients, partner badges, founder photo, FAQ, transparent pricing.
- Section order (home): hero → before/after strip → problem → video → services → how to start → process → what changes → tools → existing software → roadmap → proof → clients → who we serve → referral → FAQ → contact → footer.

## Visual system (from CSS)
| Aspect | Final live theme (theme.css) | Earlier tokens (styles.css) |
|---|---|---|
| Background | `#FAFAFA` with 26px dot grid (`#9EA2A8` dots) | white + 30px blueprint grid |
| Ink / muted / faint | `#24262A` / `#55585E` / `#73767C` | `#0F172A` / `#475569` |
| Surfaces ("zone") | `#E3E5E8` borderless cards, dark zone `#3F4246` | white with 1.5px `#CBD5E1` border |
| Accent / pin | `#1F6FEB` blue | Navy `#0F2167`, blue `#1D3FBF`, saffron `#F59E0B` |
| Status | green `#16A34A`, red `#DC2626` | same |
| Typography | DM Sans (all text), DM Mono (eyebrows, labels) | Sora / Manrope / JetBrains Mono |
| Headings | 700, letter-spacing -0.035em, h2 `clamp(30px,4.2vw,48px)`, h1 up to 78px, line-height ~1.02–1.15 | |
| Body | 16–17px, line-height 1.6, lead 19px muted, max 60ch | |
| Layout | 1200px wrap, side padding `clamp(20px,5vw,48px)`, section padding `clamp(64px,9vw,104px)` | |
| Radius | buttons 14px, cards 24px, large panels 28–32px, pills 999px, inputs 12px | buttons 10px, cards 16px |
| Shadows | almost none; only on floating menus/phone mockup | |
| Buttons | solid, borderless, 700 weight; ghost variant outlined | primary saffron on dark nav |
| Header | sticky, 76px, brand left, 5 links, one CTA right, "Menu" toggle <980px | navy |
| Grids | 2/3/4 columns collapsing to 2 then 1 at 1000/760px; hero 0.85fr/1.15fr | |
| Eyebrows | DM Mono 12px, uppercase-ish, preceded by a blue "pin" dot | |
| Interaction | smooth scroll disabled under `prefers-reduced-motion`; `:focus-visible` outline; skip link | |

## What makes it work (principles to carry over)
1. **Single accent colour on a neutral canvas** – blue is reserved for actions/pins; everything else is grey.
2. **Mono "label" voice** for metadata (SKU, bin codes, step tags) – suits inventory UIs perfectly.
3. **Numbered, labelled process** over decoration; before/after data visuals (bin grids, stock tables) instead of stock imagery.
4. **Consistent big radii and borderless tonal cards**; rhythm from spacing, not shadows.
5. **Transparent pricing/evidence blocks** (stats, tables, badges).
6. **Accessibility basics**: skip link, focus ring, reduced motion, 16px+ text, mobile nav.

## Translation to ShopSphere (decisions)
- Palette: adopt the neutral canvas + single blue pin; add navy (`#0F2167`, from the reference's v1 brand) for admin/seller chrome and a restrained saffron CTA accent for the buyer portal.
- Fonts: DM Sans + DM Mono (same family as the reference, free on Google Fonts, self-hosted via Fontsource for performance).
- Seller/admin portals: dot-grid-free, white/zone cards, mono labels for SKU/ref numbers, data tables as the hero.
- Buyer portal: warmer and denser (marketplace conventions), but same radius scale, type, and tone.
- Do not copy copy, logos, imagery or layout of the site.
