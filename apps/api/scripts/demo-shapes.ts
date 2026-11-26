import type { Kind } from '../src/database/demo-data.js';

// ── colour helpers ──
const hex = (h: string) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
};
const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};
const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
const darken = (c: string, t: number) => mix(c, '#000000', t);

interface Ctx {
  c: string; // main colour
  a: string; // accent
}

let uid = 0;
/** Vertical linear gradient def; returns [defMarkup, url]. */
function grad(c1: string, c2: string, dir: 'v' | 'h' = 'v'): [string, string] {
  const id = `g${uid++}`;
  const [x2, y2] = dir === 'v' ? [0, 1] : [1, 0];
  return [
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`,
    `url(#${id})`,
  ];
}
const shade = (c: string) => grad(lighten(c, 0.18), darken(c, 0.12));

type Drawer = (x: Ctx) => string;

const DRAW: Record<Kind, Drawer> = {
  laptop: ({ c, a }) => {
    const [d1, body] = shade(c);
    const [d2, screen] = grad(lighten(a, 0.35), darken(a, 0.25));
    return `<defs>${d1}${d2}</defs>
      <rect x="200" y="250" width="400" height="260" rx="20" fill="#14171c"/>
      <rect x="214" y="264" width="372" height="232" rx="8" fill="${screen}"/>
      <rect x="240" y="292" width="150" height="14" rx="7" fill="#fff" opacity=".55"/>
      <rect x="240" y="320" width="230" height="10" rx="5" fill="#fff" opacity=".3"/>
      <rect x="240" y="342" width="190" height="10" rx="5" fill="#fff" opacity=".3"/>
      <circle cx="520" cy="420" r="46" fill="#fff" opacity=".18"/>
      <path d="M140 520 H660 L690 556 Q692 566 680 566 H120 Q108 566 110 556 Z" fill="${body}"/>
      <rect x="350" y="522" width="100" height="10" rx="5" fill="${darken(c, 0.25)}"/>`;
  },
  headphones: ({ c, a }) => {
    const [d1, cup] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M232 470 V400 C232 290 308 232 400 232 C492 232 568 290 568 400 V470" fill="none" stroke="${darken(c, 0.15)}" stroke-width="30" stroke-linecap="round"/>
      <path d="M232 470 V400 C232 290 308 232 400 232 C492 232 568 290 568 400 V470" fill="none" stroke="${lighten(c, 0.2)}" stroke-width="10" stroke-linecap="round" opacity=".5"/>
      <rect x="180" y="400" width="112" height="190" rx="48" fill="${cup}"/>
      <rect x="508" y="400" width="112" height="190" rx="48" fill="${cup}"/>
      <rect x="196" y="424" width="44" height="142" rx="22" fill="${a}"/>
      <rect x="560" y="424" width="44" height="142" rx="22" fill="${a}"/>`;
  },
  earbuds: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="250" y="360" width="300" height="220" rx="70" fill="${body}"/>
      <path d="M250 450 H550" stroke="${darken(c, 0.2)}" stroke-width="5"/>
      <circle cx="400" cy="450" r="14" fill="${a}"/>
      <g transform="rotate(-18 330 300)"><rect x="300" y="190" width="56" height="170" rx="28" fill="${body}"/><circle cx="328" cy="215" r="34" fill="${body}"/><circle cx="328" cy="215" r="14" fill="${a}"/></g>
      <g transform="rotate(18 470 300)"><rect x="444" y="190" width="56" height="170" rx="28" fill="${body}"/><circle cx="472" cy="215" r="34" fill="${body}"/><circle cx="472" cy="215" r="14" fill="${a}"/></g>`;
  },
  camera: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="170" y="300" width="460" height="290" rx="46" fill="${body}"/>
      <rect x="250" y="262" width="140" height="56" rx="16" fill="${darken(c, 0.2)}"/>
      <circle cx="500" cy="285" r="22" fill="${a}"/>
      <circle cx="400" cy="450" r="112" fill="#0f1217"/>
      <circle cx="400" cy="450" r="88" fill="#1c2430"/>
      <circle cx="400" cy="450" r="58" fill="#0b2a4a"/>
      <circle cx="378" cy="428" r="20" fill="#fff" opacity=".35"/>
      <rect x="208" y="338" width="64" height="26" rx="10" fill="${a}"/>`;
  },
  smartwatch: ({ c, a }) => {
    const [d1, strap] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="320" y="170" width="160" height="150" rx="30" fill="${strap}"/>
      <rect x="320" y="480" width="160" height="150" rx="30" fill="${strap}"/>
      <rect x="270" y="290" width="260" height="230" rx="64" fill="#15181d"/>
      <rect x="284" y="304" width="232" height="202" rx="52" fill="#05080c"/>
      <circle cx="400" cy="405" r="70" fill="none" stroke="${a}" stroke-width="14" stroke-linecap="round" stroke-dasharray="330 440"/>
      <circle cx="400" cy="405" r="44" fill="none" stroke="#fff" stroke-width="8" opacity=".35"/>
      <rect x="524" y="372" width="14" height="58" rx="7" fill="#2a2f38"/>`;
  },
  phone: ({ c, a }) => {
    const [d1, body] = shade(c);
    const [d2, wall] = grad(lighten(a, 0.2), darken(c, 0.3));
    return `<defs>${d1}${d2}</defs>
      <rect x="268" y="150" width="264" height="500" rx="48" fill="${body}"/>
      <rect x="280" y="162" width="240" height="476" rx="38" fill="#0a0c10"/>
      <rect x="288" y="170" width="224" height="460" rx="32" fill="${wall}"/>
      <circle cx="450" cy="300" r="70" fill="#fff" opacity=".18"/>
      <circle cx="360" cy="470" r="90" fill="#fff" opacity=".1"/>
      <rect x="372" y="184" width="56" height="16" rx="8" fill="#0a0c10"/>
      <rect x="338" y="590" width="124" height="6" rx="3" fill="#fff" opacity=".6"/>`;
  },
  powerbank: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="280" y="190" width="240" height="420" rx="36" fill="${body}"/>
      <rect x="304" y="214" width="192" height="90" rx="16" fill="#0e1318"/>
      <rect x="320" y="236" width="40" height="46" rx="6" fill="${a}"/><rect x="368" y="236" width="40" height="46" rx="6" fill="${a}"/><rect x="416" y="236" width="40" height="46" rx="6" fill="${a}" opacity=".35"/>
      <rect x="330" y="560" width="50" height="16" rx="5" fill="#0e1318"/><rect x="420" y="560" width="50" height="16" rx="5" fill="#0e1318"/>
      <circle cx="400" cy="440" r="34" fill="${a}" opacity=".9"/>`;
  },
  charger: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="330" y="170" width="18" height="70" rx="4" fill="#8a8f98"/><rect x="452" y="170" width="18" height="70" rx="4" fill="#8a8f98"/>
      <rect x="260" y="240" width="280" height="300" rx="42" fill="${body}"/>
      <rect x="300" y="470" width="80" height="26" rx="13" fill="${darken(c, 0.5)}"/><rect x="400" y="470" width="80" height="26" rx="13" fill="${darken(c, 0.5)}"/>
      <rect x="300" y="420" width="80" height="26" rx="13" fill="${a}"/>
      <circle cx="450" cy="320" r="30" fill="${a}" opacity=".85"/>`;
  },
  mixer: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M270 580 L290 400 H510 L530 580 Q530 600 510 600 H290 Q270 600 270 580 Z" fill="${body}"/>
      <circle cx="400" cy="500" r="36" fill="#0f1217"/><circle cx="400" cy="500" r="12" fill="${a}"/>
      <path d="M310 400 L330 220 H470 L490 400 Z" fill="#cfe3ef" opacity=".75"/>
      <path d="M310 400 L330 220 H470 L490 400 Z" fill="none" stroke="${darken(c, 0.2)}" stroke-width="6"/>
      <rect x="318" y="196" width="164" height="30" rx="12" fill="${a}"/>
      <rect x="380" y="170" width="40" height="30" rx="10" fill="${darken(a, 0.2)}"/>
      <path d="M492 260 q60 10 50 90 q-4 24 -40 30" fill="none" stroke="${darken(c, 0.25)}" stroke-width="16" stroke-linecap="round"/>`;
  },
  kettle: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <ellipse cx="400" cy="610" rx="180" ry="26" fill="#14171c"/>
      <path d="M250 600 L276 330 Q290 250 400 250 Q510 250 524 330 L550 600 Z" fill="${body}"/>
      <path d="M520 330 Q620 300 640 250 L600 232 Q580 276 516 290 Z" fill="${body}"/>
      <path d="M270 360 Q190 380 210 500 Q220 540 276 540" fill="none" stroke="#14171c" stroke-width="26" stroke-linecap="round"/>
      <rect x="360" y="222" width="80" height="34" rx="14" fill="#14171c"/>
      <rect x="296" y="420" width="12" height="130" rx="6" fill="#fff" opacity=".4"/>
      <circle cx="400" cy="560" r="10" fill="${a}"/>`;
  },
  airfryer: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="230" y="190" width="340" height="420" rx="86" fill="${body}"/>
      <rect x="270" y="226" width="260" height="70" rx="24" fill="#0b0e12"/>
      <circle cx="320" cy="261" r="8" fill="${a}"/><rect x="346" y="254" width="120" height="14" rx="7" fill="${a}" opacity=".8"/>
      <rect x="270" y="336" width="260" height="220" rx="40" fill="${darken(c, 0.18)}"/>
      <rect x="320" y="470" width="160" height="22" rx="11" fill="#0b0e12"/>
      <rect x="260" y="596" width="280" height="22" rx="11" fill="#0b0e12" opacity=".5"/>`;
  },
  vacuum: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="388" y="150" width="30" height="330" rx="12" fill="#2a2f38"/>
      <path d="M418 150 H520 Q560 150 560 190 V220 H520 V190 H418 Z" fill="#2a2f38"/>
      <rect x="330" y="230" width="150" height="190" rx="40" fill="${body}"/>
      <circle cx="405" cy="300" r="26" fill="${a}"/>
      <rect x="348" y="360" width="114" height="40" rx="14" fill="${darken(c, 0.3)}"/>
      <path d="M300 590 L330 480 H490 L520 590 Q522 606 504 606 H316 Q298 606 300 590 Z" fill="${darken(c, 0.15)}"/>
      <rect x="330" y="560" width="160" height="12" rx="6" fill="${a}"/>`;
  },
  tshirt: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M300 190 L190 260 L240 350 L290 320 V610 H510 V320 L560 350 L610 260 L500 190 Q470 240 400 240 Q330 240 300 190 Z" fill="${body}"/>
      <path d="M300 190 Q330 240 400 240 Q470 240 500 190 Q470 270 400 270 Q330 270 300 190 Z" fill="${darken(c, 0.25)}"/>
      <rect x="348" y="380" width="104" height="104" rx="14" fill="${a}" opacity=".9"/>
      <path d="M290 320 V610" stroke="#000" stroke-opacity=".08" stroke-width="3"/>`;
  },
  hoodie: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M300 200 L170 270 L210 560 L290 560 V610 H510 V560 H590 L630 270 L500 200 Q470 140 400 140 Q330 140 300 200 Z" fill="${body}"/>
      <path d="M320 200 Q400 330 480 200 Q470 160 400 160 Q330 160 320 200 Z" fill="${darken(c, 0.35)}"/>
      <path d="M350 440 H450 L476 560 H324 Z" fill="${darken(c, 0.12)}"/>
      <rect x="378" y="260" width="8" height="90" rx="4" fill="${a}"/><rect x="414" y="260" width="8" height="90" rx="4" fill="${a}"/>
      <rect x="290" y="560" width="220" height="40" fill="${darken(c, 0.2)}"/>`;
  },
  kurta: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M300 180 L200 250 L230 360 L290 330 L270 640 H530 L510 330 L570 360 L600 250 L500 180 Q470 230 400 230 Q330 230 300 180 Z" fill="${body}"/>
      <path d="M340 190 Q400 290 460 190 Q430 250 400 250 Q370 250 340 190 Z" fill="${darken(c, 0.3)}"/>
      ${Array.from({ length: 12 }, (_, i) => `<circle cx="${320 + (i % 4) * 54}" cy="${380 + Math.floor(i / 4) * 80}" r="${i % 2 ? 9 : 14}" fill="${a}" opacity=".85"/>`).join('')}
      <rect x="270" y="610" width="260" height="22" fill="${a}"/>`;
  },
  jacket: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M300 190 L170 260 L200 540 H280 V610 H520 V540 H600 L630 260 L500 190 L400 250 Z" fill="${body}"/>
      <path d="M300 190 L400 330 L500 190 L400 250 Z" fill="${darken(c, 0.25)}"/>
      <path d="M400 330 V610" stroke="${darken(c, 0.3)}" stroke-width="6"/>
      <rect x="318" y="400" width="70" height="64" rx="8" fill="none" stroke="${darken(c, 0.3)}" stroke-width="5"/><rect x="412" y="400" width="70" height="64" rx="8" fill="none" stroke="${darken(c, 0.3)}" stroke-width="5"/>
      <circle cx="400" cy="350" r="7" fill="${a}"/><circle cx="400" cy="410" r="7" fill="${a}"/><circle cx="400" cy="470" r="7" fill="${a}"/>`;
  },
  sneaker: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M150 500 Q150 360 250 330 L330 300 Q370 380 450 380 L560 400 Q650 420 660 500 V540 H150 Z" fill="${body}"/>
      <path d="M150 530 H665 Q670 580 620 590 H190 Q145 585 150 530 Z" fill="#f4f4f4"/>
      <path d="M150 560 H668" stroke="${a}" stroke-width="10"/>
      <path d="M330 300 Q360 260 400 270 L450 380" fill="none" stroke="${darken(c, 0.3)}" stroke-width="10"/>
      ${[0, 1, 2].map((i) => `<rect x="${360 + i * 36}" y="${312 + i * 24}" width="50" height="10" rx="5" fill="#fff" transform="rotate(24 ${385 + i * 36} ${317 + i * 24})"/>`).join('')}
      <path d="M470 440 Q560 430 640 470" fill="none" stroke="${a}" stroke-width="14" stroke-linecap="round"/>`;
  },
  chair: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="290" y="150" width="220" height="280" rx="60" fill="${body}"/>
      <rect x="312" y="174" width="176" height="232" rx="40" fill="${darken(c, 0.35)}"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M322 ${200 + i * 34} H478" stroke="${a}" stroke-width="3" opacity=".45"/>`).join('')}
      <rect x="250" y="446" width="300" height="60" rx="26" fill="${body}"/>
      <rect x="380" y="506" width="40" height="80" rx="10" fill="#4b5563"/>
      <path d="M260 630 L400 590 L540 630" fill="none" stroke="#4b5563" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="260" cy="636" r="16" fill="#1f2937"/><circle cx="540" cy="636" r="16" fill="#1f2937"/><circle cx="400" cy="596" r="14" fill="#1f2937"/>
      <rect x="226" y="360" width="26" height="100" rx="12" fill="#1f2937"/><rect x="548" y="360" width="26" height="100" rx="12" fill="#1f2937"/>`;
  },
  sofa: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="170" y="290" width="460" height="180" rx="50" fill="${darken(c, 0.12)}"/>
      <rect x="130" y="380" width="90" height="190" rx="36" fill="${body}"/><rect x="580" y="380" width="90" height="190" rx="36" fill="${body}"/>
      <rect x="210" y="400" width="190" height="130" rx="26" fill="${body}"/><rect x="400" y="400" width="190" height="130" rx="26" fill="${body}"/>
      <rect x="210" y="530" width="380" height="40" rx="14" fill="${darken(c, 0.2)}"/>
      <rect x="170" y="570" width="18" height="50" rx="6" fill="${a}"/><rect x="612" y="570" width="18" height="50" rx="6" fill="${a}"/>
      <rect x="250" y="320" width="80" height="70" rx="16" fill="${a}" opacity=".85" transform="rotate(-10 290 355)"/>`;
  },
  shelf: ({ c, a }) => {
    const [d1, body] = shade(c);
    const books = (x: number, y: number) =>
      [0, 1, 2, 3].map((i) => `<rect x="${x + i * 28}" y="${y - 54 - (i % 2) * 10}" width="22" height="${54 + (i % 2) * 10}" rx="3" fill="${i % 2 ? a : darken(c, 0.3)}"/>`).join('');
    return `<defs>${d1}</defs>
      <rect x="260" y="130" width="280" height="500" rx="10" fill="${body}"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="276" y="${146 + i * 96}" width="248" height="82" fill="${darken(c, 0.35)}"/>`).join('')}
      ${books(296, 228)}${books(404, 324)}<circle cx="320" cy="470" r="22" fill="${a}"/>${books(300, 612 - 96 * 0 - 30)}
      <rect x="360" y="152" width="120" height="50" rx="6" fill="${a}" opacity=".7"/>`;
  },
  desk: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="150" y="300" width="500" height="36" rx="12" fill="${body}"/>
      <rect x="180" y="336" width="30" height="270" rx="8" fill="${darken(c, 0.25)}"/><rect x="590" y="336" width="30" height="270" rx="8" fill="${darken(c, 0.25)}"/>
      <rect x="430" y="336" width="160" height="110" rx="10" fill="${darken(c, 0.12)}"/>
      <rect x="486" y="384" width="48" height="12" rx="6" fill="${a}"/>
      <rect x="250" y="196" width="150" height="104" rx="8" fill="#14171c"/><rect x="258" y="204" width="134" height="88" rx="4" fill="${lighten(a, 0.4)}"/>
      <rect x="312" y="300" width="26" height="0" fill="none"/>`;
  },
  serum: ({ c, a }) => {
    const [d1, glass] = grad(lighten(c, 0.1), darken(c, 0.2));
    return `<defs>${d1}</defs>
      <rect x="320" y="270" width="160" height="330" rx="34" fill="${glass}"/>
      <rect x="342" y="330" width="116" height="170" rx="14" fill="#fff" opacity=".92"/>
      <rect x="360" y="356" width="80" height="12" rx="6" fill="${darken(c, 0.2)}"/><rect x="360" y="380" width="56" height="8" rx="4" fill="${darken(c, 0.2)}" opacity=".5"/>
      <circle cx="400" cy="450" r="22" fill="${a}"/>
      <rect x="372" y="170" width="56" height="100" rx="12" fill="#14171c"/>
      <ellipse cx="400" cy="170" rx="42" ry="26" fill="${darken(a, 0.35)}"/>
      <rect x="338" y="288" width="12" height="290" rx="6" fill="#fff" opacity=".35"/>`;
  },
  cream: ({ c, a }) => {
    const [d1, jar] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="240" y="380" width="320" height="220" rx="40" fill="${jar}"/>
      <rect x="226" y="320" width="348" height="84" rx="26" fill="${a}"/>
      <rect x="226" y="320" width="348" height="26" rx="13" fill="#fff" opacity=".25"/>
      <rect x="290" y="440" width="220" height="110" rx="16" fill="#fff" opacity=".92"/>
      <circle cx="350" cy="495" r="26" fill="${lighten(c, 0.3)}"/><rect x="392" y="474" width="92" height="12" rx="6" fill="${darken(c, 0.2)}"/><rect x="392" y="498" width="64" height="8" rx="4" fill="${darken(c, 0.2)}" opacity=".5"/>`;
  },
  sunscreen: ({ c, a }) => {
    const [d1, tube] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M300 250 H500 L520 580 Q522 610 490 610 H310 Q278 610 280 580 Z" fill="${tube}"/>
      <rect x="320" y="150" width="160" height="104" rx="24" fill="${a}"/><rect x="336" y="130" width="128" height="30" rx="10" fill="${darken(a, 0.25)}"/>
      <circle cx="400" cy="400" r="66" fill="#fff" opacity=".95"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="396" y="318" width="8" height="26" rx="4" fill="${a}" transform="rotate(${i * 45} 400 400)"/>`).join('')}
      <circle cx="400" cy="400" r="26" fill="${a}"/>
      <rect x="318" y="500" width="164" height="14" rx="7" fill="#fff" opacity=".7"/>`;
  },
  grooming: ({ c, a }) => {
    const [d1, box] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="200" y="420" width="400" height="190" rx="22" fill="${box}"/>
      <rect x="200" y="420" width="400" height="44" rx="22" fill="${darken(c, 0.25)}"/>
      <rect x="250" y="250" width="90" height="190" rx="22" fill="${a}"/><rect x="272" y="208" width="46" height="50" rx="10" fill="#14171c"/>
      <rect x="360" y="290" width="110" height="150" rx="22" fill="${lighten(c, 0.3)}"/><rect x="360" y="270" width="110" height="30" rx="12" fill="#14171c"/>
      <rect x="500" y="210" width="26" height="230" rx="12" fill="#8b5e34"/>
      ${Array.from({ length: 7 }, (_, i) => `<rect x="${492 + i * 7}" y="${196}" width="4" height="26" fill="#14171c"/>`).join('')}`;
  },
  dumbbell: ({ c, a }) => {
    const [d1, plate] = shade(c);
    return `<defs>${d1}</defs>
      <g transform="rotate(-18 400 420)">
      <rect x="260" y="404" width="280" height="32" rx="12" fill="#c7ccd4"/>
      <rect x="320" y="396" width="160" height="48" rx="10" fill="#14171c" opacity=".85"/>
      <rect x="196" y="340" width="64" height="160" rx="14" fill="${plate}"/><rect x="146" y="368" width="52" height="104" rx="12" fill="${plate}"/>
      <rect x="540" y="340" width="64" height="160" rx="14" fill="${plate}"/><rect x="602" y="368" width="52" height="104" rx="12" fill="${plate}"/>
      <rect x="208" y="352" width="10" height="136" rx="5" fill="${a}"/><rect x="582" y="352" width="10" height="136" rx="5" fill="${a}"/>
      </g>`;
  },
  yogamat: ({ c, a }) => {
    const [d1, mat] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M200 560 H600 L650 620 H150 Z" fill="${darken(c, 0.2)}" opacity=".5"/>
      <rect x="210" y="250" width="380" height="330" rx="20" fill="${mat}"/>
      ${Array.from({ length: 9 }, (_, i) => `<path d="M230 ${280 + i * 34} H570" stroke="#fff" stroke-opacity=".14" stroke-width="3"/>`).join('')}
      <ellipse cx="400" cy="250" rx="190" ry="40" fill="${lighten(c, 0.2)}"/>
      <ellipse cx="400" cy="250" rx="150" ry="28" fill="none" stroke="${darken(c, 0.25)}" stroke-width="6"/><ellipse cx="400" cy="250" rx="90" ry="16" fill="none" stroke="${darken(c, 0.25)}" stroke-width="6"/>
      <rect x="360" y="470" width="80" height="14" rx="7" fill="${a}"/>`;
  },
  football: ({ c, a }) => {
    const pent = (cx: number, cy: number, r: number, rot = 0) =>
      `<polygon fill="${a}" points="${Array.from({ length: 5 }, (_, i) => {
        const ang = ((rot + i * 72 - 90) * Math.PI) / 180;
        return `${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`;
      }).join(' ')}"/>`;
    return `<defs><radialGradient id="fb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${darken(c, 0.2)}"/></radialGradient></defs>
      <circle cx="400" cy="400" r="200" fill="url(#fb)"/><circle cx="400" cy="400" r="200" fill="none" stroke="${a}" stroke-width="5"/>
      ${pent(400, 400, 64)}${pent(400, 250, 40, 36)}${pent(530, 340, 40, 0)}${pent(520, 470, 40, 72)}${pent(280, 470, 40, -72)}${pent(270, 340, 40, 0)}
      <path d="M400 464 V540 M340 380 L290 350 M460 380 L510 350" stroke="${a}" stroke-width="6"/>`;
  },
  bottle: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="340" y="140" width="120" height="70" rx="20" fill="#14171c"/>
      <rect x="360" y="210" width="80" height="46" fill="${darken(c, 0.3)}"/>
      <path d="M330 260 Q330 240 360 250 H440 Q470 240 470 260 V590 Q470 616 444 616 H356 Q330 616 330 590 Z" fill="${body}"/>
      <rect x="350" y="300" width="14" height="270" rx="7" fill="#fff" opacity=".35"/>
      <rect x="380" y="400" width="70" height="70" rx="12" fill="${a}" opacity=".9"/>
      <path d="M392 440 l14 -22 l14 22 l14 -16" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  },
  backpack: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <path d="M340 190 Q340 140 400 140 Q460 140 460 190" fill="none" stroke="${darken(c, 0.3)}" stroke-width="18" stroke-linecap="round"/>
      <rect x="250" y="190" width="300" height="420" rx="100" fill="${body}"/>
      <rect x="290" y="420" width="220" height="150" rx="40" fill="${darken(c, 0.15)}"/>
      <rect x="330" y="470" width="140" height="14" rx="7" fill="${a}"/>
      <rect x="318" y="232" width="164" height="130" rx="40" fill="${darken(c, 0.2)}"/>
      <path d="M340 300 H460" stroke="${a}" stroke-width="10" stroke-linecap="round"/>
      <rect x="226" y="330" width="34" height="170" rx="16" fill="${darken(c, 0.35)}"/><rect x="540" y="330" width="34" height="170" rx="16" fill="${darken(c, 0.35)}"/>`;
  },
  watch: ({ c, a }) => {
    const [d1, strap] = shade(a);
    return `<defs>${d1}</defs>
      <rect x="350" y="150" width="100" height="170" rx="22" fill="${strap}"/><rect x="350" y="480" width="100" height="170" rx="22" fill="${strap}"/>
      <circle cx="400" cy="400" r="130" fill="${c}"/><circle cx="400" cy="400" r="112" fill="#f8f5ee"/>
      ${Array.from({ length: 12 }, (_, i) => `<rect x="397" y="300" width="6" height="${i % 3 ? 14 : 24}" rx="3" fill="#2a2a2a" transform="rotate(${i * 30} 400 400)"/>`).join('')}
      <circle cx="400" cy="350" r="22" fill="none" stroke="#2a2a2a" stroke-width="3"/><circle cx="355" cy="410" r="20" fill="none" stroke="#2a2a2a" stroke-width="3"/><circle cx="445" cy="410" r="20" fill="none" stroke="#2a2a2a" stroke-width="3"/>
      <path d="M400 400 L400 330" stroke="#1b1b1b" stroke-width="7" stroke-linecap="round"/><path d="M400 400 L456 430" stroke="#1b1b1b" stroke-width="7" stroke-linecap="round"/><circle cx="400" cy="400" r="9" fill="${c}"/>
      <rect x="524" y="388" width="18" height="26" rx="6" fill="${c}"/>`;
  },
  wallet: ({ c, a }) => {
    const [d1, body] = shade(c);
    return `<defs>${d1}</defs>
      <rect x="240" y="310" width="140" height="100" rx="12" fill="${a}" transform="rotate(-8 310 360)"/>
      <rect x="170" y="340" width="460" height="290" rx="36" fill="${body}"/>
      <path d="M170 440 H630" stroke="${darken(c, 0.3)}" stroke-width="4" stroke-dasharray="14 10"/>
      <path d="M400 340 V630" stroke="${darken(c, 0.25)}" stroke-width="6"/>
      <rect x="540" y="450" width="90" height="80" rx="20" fill="${darken(c, 0.18)}"/><circle cx="580" cy="490" r="12" fill="${a}"/>
      <rect x="196" y="364" width="404" height="238" rx="24" fill="none" stroke="${lighten(c, 0.3)}" stroke-width="3" stroke-dasharray="10 8" opacity=".7"/>`;
  },
  sunglasses: ({ c, a }) => {
    const [d1, lens] = grad(lighten(a, 0.1), '#0e1116');
    return `<defs>${d1}</defs>
      <path d="M160 360 Q120 360 120 330" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/><path d="M640 360 Q680 360 680 330" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
      <path d="M170 350 H330 Q350 350 350 372 Q340 500 250 505 Q170 505 160 400 Z" fill="${lens}" stroke="${c}" stroke-width="12" stroke-linejoin="round"/>
      <path d="M630 350 H470 Q450 350 450 372 Q460 500 550 505 Q630 505 640 400 Z" fill="${lens}" stroke="${c}" stroke-width="12" stroke-linejoin="round"/>
      <path d="M350 372 Q400 330 450 372" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
      <path d="M210 395 Q250 380 290 395" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".3"/><path d="M510 395 Q550 380 590 395" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".3"/>`;
  },
};

export interface RenderOpts {
  kind: Kind;
  color: string;
  alt: string;
  /** 0 = hero, 1 = alternate colourway and composition. */
  variant: 0 | 1;
  label: string;
}

/** A square 800x800 flat illustration with a soft tinted studio background. */
export function renderSvg({ kind, color, alt, variant, label }: RenderOpts): string {
  uid = variant * 100;
  const main = variant === 0 ? color : alt;
  const accent = variant === 0 ? alt : color;
  // Near-white products would vanish against a light backdrop, so lift contrast with a darker tint.
  const lum = hex(main).reduce((s, v) => s + v, 0) / 3;
  const bgA = lum > 215 ? lighten(accent, 0.7) : lighten(main, 0.9);
  const bgB = lum > 215 ? lighten(accent, 0.5) : lighten(main, 0.76);
  const tilt = variant === 0 ? 0 : -6;
  const scale = variant === 0 ? 1 : 0.94;
  const drawn = DRAW[kind]({ c: main, a: accent });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}">
  <defs><radialGradient id="bg${variant}" cx="${variant === 0 ? '.5' : '.3'}" cy="${variant === 0 ? '.35' : '.25'}" r=".95"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></radialGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>
  <rect width="800" height="800" fill="url(#bg${variant})"/>
  ${variant === 1 ? `<circle cx="400" cy="400" r="290" fill="#fff" opacity=".35"/><circle cx="400" cy="400" r="210" fill="#fff" opacity=".3"/>` : `<ellipse cx="400" cy="400" rx="330" ry="330" fill="#fff" opacity=".28"/>`}
  <ellipse cx="400" cy="648" rx="${variant === 0 ? 230 : 200}" ry="26" fill="#0f172a" opacity=".2" filter="url(#soft)"/>
  <g transform="translate(400 420) scale(${scale}) rotate(${tilt}) translate(-400 -420)">${drawn}</g>
</svg>`;
}
