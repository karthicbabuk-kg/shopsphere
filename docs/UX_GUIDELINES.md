# ShopSphere UX Guidelines and Wireframe Plans

## Principles
- **Heuristics**: visible system status (skeletons, toasts, order timeline), match real-world terms (INR, GST, pincode), error prevention (disabled impossible actions, stock checks), recognition over recall, consistent patterns.
- **Hick's law**: ≤7 primary nav items; filters collapse into groups; checkout one decision per step.
- **Fitts's law**: primary CTA large and in thumb reach; sticky add-to-cart bar on mobile.
- **Progressive disclosure**: advanced filters, product specs, variant tables behind expanders/tabs.
- **Gestalt**: proximity-grouped cards, consistent alignment, tonal zones.
- **Accessibility**: WCAG 2.2 AA, semantic landmarks, skip link, visible focus, keyboard-operable drawers/menus, labelled inputs, `aria-live` toasts, reduced-motion, 44px targets, alt text for images.
- **Feedback**: every action → inline state change or toast; destructive actions → confirm modal with consequence text; no `alert()`.
- **Forms**: validate on blur + submit, errors in text under field, preserve input on failure.
- **Responsive**: mobile-first; tables become cards; sidebars become drawers; filters become bottom sheets.

## Buyer portal wireframes
**Header**: logo · search (autosuggest: products, categories, SKU) · account menu · wishlist · cart (count badge). Navy category bar below (8 categories + mega-menu on hover/tap).

**Home**: hero carousel (3 slides, pause control) → category tiles (8) → Trending → Best sellers → Offers strip (coupon cards) → New arrivals → Recommended → seller spotlight → trust row (delivery, returns, secure demo payments) → newsletter (demo) → footer (4 columns).

**Catalogue `/search`, `/c/:slug`**: left filter rail (category, brand, price slider, rating, availability) · top bar (result count, sort, grid density) · 4-col grid (2 on mobile) · pagination · active-filter chips · empty state.

**Product `/p/:slug`**: gallery (thumbs + zoom) | title, store link, rating, price block, variant chips, qty, delivery estimate by pincode, [Add to cart][Buy now], wishlist · tabs: Description, Specifications, Reviews · seller card · related products. Mobile: sticky bottom CTA.

**Cart**: line items (image, seller group header, qty stepper, remove, stock warnings) | summary (subtotal, discount, delivery, tax, total, coupon, [Checkout]).

**Checkout** (stepper): Address → Delivery → Payment (UPI demo, card demo, COD) → Review/Confirm. Order confirmation page with order number and per-seller shipments. Clear "Demo payment – no money is charged" notice.

**Account**: sidebar (Profile, Addresses, Orders, Wishlist, Reviews, Returns). Order detail: timeline tracker per seller order, invoice, cancel/return actions.

## Seller portal wireframes
**Shell**: navy sidebar (Dashboard, Products, Inventory, Orders, Returns, Reports, Store settings) · top bar (store switcher, notifications, user).

- **Onboarding**: multi-step form (business, store, contact, documents upload) → status page (Pending / Rejected with reason / Approved).
- **Dashboard**: KPI row (revenue, orders, pending, completed, products, low stock) · sales chart (7/30/90d) · recent orders table · top products · inventory overview (healthy/low/out donut + list).
- **Products**: table (image, name, SKU, category, price, stock, status, approval) with filters; create/edit full-page form (basics, media dropzone with reorder, pricing, variants matrix, specs key/values, inventory opening stock, submit for approval).
- **Inventory**: table by SKU/variant (available, reserved, sold, reorder level, location, status) · row actions: inward, outward, adjust, reconcile · drawer with movement history (immutable ledger) · alert banners.
- **Orders**: tabs by status; order drawer with items, buyer ship-to, actions Accept → Pack → Ship (carrier, tracking no.) → Deliver; cancel; invoice PDF/print.
- **Returns**: queue, approve/reject, receive & restock.
- **Reports**: daily/monthly sales, product performance, valuation, commission and net earnings, CSV export.

## Admin portal wireframes
**Shell**: navy-900 sidebar (Overview, Sellers, Products, Categories & Brands, Orders, Payments & Refunds, Coupons, Reports, Settings, Audit log).
- **Overview**: KPI grid (buyers, sellers, active, pending approvals, products, pending products, orders, GMV, commission) · sales trend · top categories · top sellers · approval queue widget.
- **Sellers**: table + status filter; detail page (profile, documents viewer, performance, history) with Approve/Reject (reason)/Suspend/Reactivate.
- **Products**: moderation queue with side-by-side preview and Approve/Reject/Suspend.
- **Orders**: all orders → parent/seller sub-orders, payment status, refunds.
- **Settings**: commission %, minimum order, delivery fee, tax, low-stock default, coupons CRUD.
- **Reports**: revenue, commission, seller performance, buyer stats, inventory summary; CSV export.

## Global states
Loading skeletons matching final layout; empty states with illustration + action; error state with retry; 404 and 403 pages; offline/cold-start banner ("Server waking up…" for Render free tier).
