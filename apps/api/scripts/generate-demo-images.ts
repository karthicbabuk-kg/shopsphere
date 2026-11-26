/**
 * Generates illustrated product images for the demo catalogue and uploads them to Cloudinary.
 *
 *   pnpm --filter @shopsphere/api demo:images            # render + upload missing images
 *   pnpm --filter @shopsphere/api demo:images -- --force # re-render everything
 *   pnpm --filter @shopsphere/api demo:images -- --preview <dir>  # local contact sheet only, no upload
 *
 * Output: src/database/demo-images.json (slug -> [{ url, publicId }]). The URLs are public CDN links.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { v2 as cloudinary } from 'cloudinary';
import { DEMO_PRODUCTS, DEMO_SELLERS } from '../src/database/demo-data.js';
import { renderSvg } from './demo-shapes.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(here, '../src/database/demo-images.json');
const args = process.argv.slice(2);
const force = args.includes('--force');
const previewIdx = args.indexOf('--preview');
const previewDir = previewIdx >= 0 ? args[previewIdx + 1] : undefined;

type ImageMap = Record<string, { url: string; publicId: string }[]>;

async function main() {
  const existing: ImageMap = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : {};
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });

  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    const cards = DEMO_PRODUCTS.flatMap((p) =>
      ([0, 1] as const).map((v) => `<figure style="margin:0"><img width="260" height="260" style="border-radius:12px;display:block" src="data:image/svg+xml;base64,${Buffer.from(renderSvg({ kind: p.kind, color: p.color, alt: p.alt, variant: v, label: p.name })).toString('base64')}"/><figcaption style="font:12px sans-serif;margin-top:4px">${p.slug} #${v + 1}</figcaption></figure>`),
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.setContent(`<body style="margin:16px;background:#fff;display:grid;grid-template-columns:repeat(5,260px);gap:12px">${cards.join('')}</body>`);
    await page.screenshot({ path: join(previewDir, 'sheet.png'), fullPage: true });
    await browser.close();
    console.warn(`Preview written to ${join(previewDir, 'sheet.png')}`);
    return;
  }

  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
  if (!cloud_name || !api_key || !api_secret) throw new Error('Cloudinary credentials are missing in .env');
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });

  const result: ImageMap = { ...existing };
  for (const p of DEMO_PRODUCTS) {
    if (!force && existing[p.slug]?.length === 2) continue;
    const folder = `shopsphere/sellers/${DEMO_SELLERS[p.seller].id}/products`;
    const uploaded: { url: string; publicId: string }[] = [];
    for (const v of [0, 1] as const) {
      await page.setContent(`<body style="margin:0">${renderSvg({ kind: p.kind, color: p.color, alt: p.alt, variant: v, label: p.name })}</body>`);
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 800, height: 800 } });
      const publicId = `${folder}/${p.slug}-${v + 1}`;
      const res = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ public_id: publicId, overwrite: true, resource_type: 'image', invalidate: true }, (err, r) => (err || !r ? reject(err) : resolve(r)))
          .end(png);
      });
      uploaded.push({ url: res.secure_url, publicId: res.public_id });
    }
    result[p.slug] = uploaded;
    writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
    console.warn(`uploaded ${p.slug}`);
  }
  await browser.close();
  console.warn(`Done: ${Object.keys(result).length} products with images -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
