/**
 * Demo catalogue. Everything here is fictional: brands, models and prices are invented for the demonstration.
 * Product images are generated illustrations (see scripts/demo-images) rather than photographs.
 */

export type Kind =
  | 'laptop' | 'headphones' | 'earbuds' | 'camera' | 'smartwatch' | 'phone' | 'powerbank' | 'charger'
  | 'mixer' | 'kettle' | 'airfryer' | 'vacuum'
  | 'tshirt' | 'hoodie' | 'kurta' | 'jacket' | 'sneaker'
  | 'chair' | 'sofa' | 'shelf' | 'desk'
  | 'serum' | 'cream' | 'grooming' | 'sunscreen'
  | 'dumbbell' | 'yogamat' | 'football' | 'bottle'
  | 'backpack' | 'watch' | 'wallet' | 'sunglasses';

export interface DemoVariant {
  label: string;
  options?: Record<string, string>;
  stock: number;
  reorder?: number;
  /** Rupees; falls back to the product price. */
  price?: number;
}

export interface DemoProduct {
  slug: string;
  name: string;
  brand: string;
  /** Category slug as seeded, e.g. `electronics-laptops` or `accessories`. */
  category: string;
  kind: Kind;
  color: string;
  alt: string;
  mrp: number;
  price: number;
  seller: 'technest' | 'urbankart';
  description: string;
  attrs: [string, string][];
  variants: DemoVariant[];
  /** Controls ordering on "best sellers" and popularity sort. */
  sold: number;
}

/** Fixed ids so Cloudinary folders (shopsphere/sellers/<id>/products) are stable across environments. */
export const DEMO_SELLERS = {
  technest: {
    id: '5e1ec7a1-0001-4a5d-9c11-000000000001',
    userId: '5e1ec7a1-0001-4a5d-9c11-0000000000a1',
    email: 'seller.technest@shopsphere.demo',
    name: 'Arjun Mehta',
    phone: '9840012345',
    businessName: 'TechNest Retail Pvt Ltd',
    storeName: 'TechNest Electronics',
    slug: 'technest-electronics',
    description: 'Authorised-style electronics, mobiles and home appliances with fast dispatch from Bengaluru.',
    gstin: '29ABCDE1234F1Z5',
    city: 'Bengaluru',
    state: 'Karnataka',
    status: 'APPROVED' as const,
  },
  urbankart: {
    id: '5e1ec7a1-0002-4a5d-9c11-000000000002',
    userId: '5e1ec7a1-0002-4a5d-9c11-0000000000a2',
    email: 'seller.urbankart@shopsphere.demo',
    name: 'Meera Krishnan',
    phone: '9841098765',
    businessName: 'UrbanKart Lifestyle LLP',
    storeName: 'UrbanKart Lifestyle',
    slug: 'urbankart-lifestyle',
    description: 'Fashion, furniture, beauty, sports and accessories curated from independent Indian labels.',
    gstin: '33FGHIJ5678K1Z2',
    city: 'Chennai',
    state: 'Tamil Nadu',
    status: 'APPROVED' as const,
  },
  pending: {
    id: '5e1ec7a1-0003-4a5d-9c11-000000000003',
    userId: '5e1ec7a1-0003-4a5d-9c11-0000000000a3',
    email: 'seller.pending@shopsphere.demo',
    name: 'Rohit Sharma',
    phone: '9812345678',
    businessName: 'Craftsy Homes',
    storeName: 'Craftsy Homes',
    slug: 'craftsy-homes',
    description: 'Handmade home decor from Jaipur artisans.',
    gstin: null,
    city: 'Jaipur',
    state: 'Rajasthan',
    status: 'PENDING' as const,
  },
};

export const DEMO_BUYERS = [
  { email: 'buyer.priya@shopsphere.demo', name: 'Priya Nair', phone: '9876501234', city: 'Kochi', state: 'Kerala', pincode: '682016', line1: '14, Marine Drive Apartments' },
  { email: 'buyer.rahul@shopsphere.demo', name: 'Rahul Verma', phone: '9876502345', city: 'Pune', state: 'Maharashtra', pincode: '411045', line1: '22, Baner Road' },
  { email: 'buyer.ananya@shopsphere.demo', name: 'Ananya Iyer', phone: '9876503456', city: 'Chennai', state: 'Tamil Nadu', pincode: '600041', line1: '7, Besant Nagar 2nd Avenue' },
  { email: 'buyer.vikram@shopsphere.demo', name: 'Vikram Singh', phone: '9876504567', city: 'Delhi', state: 'Delhi', pincode: '110017', line1: '31, Saket Block C' },
  { email: 'buyer.sneha@shopsphere.demo', name: 'Sneha Reddy', phone: '9876505678', city: 'Hyderabad', state: 'Telangana', pincode: '500081', line1: '5, Madhapur Main Road' },
];

/** Shared, documented demo password for buyer and seller demo accounts (the admin password stays in .env). */
export const DEMO_PASSWORD = 'ShopDemo2026';

const sz = (stock: number[]): DemoVariant[] =>
  ['S', 'M', 'L', 'XL'].map((s, i) => ({ label: s, options: { Size: s }, stock: stock[i] ?? 10 }));
const shoe = (stock: number[]): DemoVariant[] =>
  ['UK 7', 'UK 8', 'UK 9', 'UK 10'].map((s, i) => ({ label: s, options: { Size: s }, stock: stock[i] ?? 10 }));

export const DEMO_PRODUCTS: DemoProduct[] = [
  // ───────── TechNest: Electronics ─────────
  { slug: 'aurora-bookair-14-laptop', name: 'Aurora BookAir 14 Thin & Light Laptop', brand: 'aurora', category: 'electronics-laptops', kind: 'laptop', color: '#8E9AAF', alt: '#2B2D42', mrp: 74990, price: 62990, seller: 'technest', sold: 640,
    description: 'A 14-inch ultraportable with a bright 2.2K display, all-day battery and a fast NVMe SSD. Built for students and professionals who carry their work everywhere.',
    attrs: [['Display', '14-inch 2.2K IPS, 300 nits'], ['Processor', '12th Gen 10-core'], ['Battery', 'Up to 14 hours'], ['Weight', '1.25 kg'], ['Warranty', '1 year onsite']],
    variants: [{ label: '8GB / 256GB', options: { RAM: '8GB', SSD: '256GB' }, stock: 24 }, { label: '16GB / 512GB', options: { RAM: '16GB', SSD: '512GB' }, stock: 12, price: 71990 }] },
  { slug: 'novatech-slim-15-laptop', name: 'NovaTech Slim 15 Everyday Laptop', brand: 'novatech', category: 'electronics-laptops', kind: 'laptop', color: '#3D5A80', alt: '#98C1D9', mrp: 54990, price: 44990, seller: 'technest', sold: 410,
    description: 'A dependable 15.6-inch laptop with a full-HD anti-glare screen, backlit keyboard and a numeric keypad for spreadsheets and everyday work.',
    attrs: [['Display', '15.6-inch FHD anti-glare'], ['Storage', '512GB SSD'], ['Memory', '8GB DDR4'], ['Battery', 'Up to 9 hours'], ['Warranty', '1 year']],
    variants: [{ label: '8GB / 512GB', options: { RAM: '8GB', SSD: '512GB' }, stock: 30 }] },
  { slug: 'pulse-immerse-anc-headphones', name: 'Pulse Immerse Wireless ANC Headphones', brand: 'pulse-audio', category: 'electronics-headphones', kind: 'headphones', color: '#1B1B2F', alt: '#E94560', mrp: 9999, price: 6499, seller: 'technest', sold: 880,
    description: 'Over-ear headphones with hybrid active noise cancellation, 40mm drivers and 35 hours of battery. Fold-flat design with a hard travel case.',
    attrs: [['Type', 'Over-ear, wireless'], ['Noise cancellation', 'Hybrid ANC'], ['Battery', '35 hours'], ['Connectivity', 'Bluetooth 5.3'], ['Warranty', '1 year']],
    variants: [{ label: 'Midnight Black', options: { Colour: 'Black' }, stock: 60 }, { label: 'Ember Red', options: { Colour: 'Red' }, stock: 3, reorder: 5 }, { label: 'Frost Silver', options: { Colour: 'Silver' }, stock: 35 }] },
  { slug: 'pulse-bud-pro-earbuds', name: 'Pulse Bud Pro True Wireless Earbuds', brand: 'pulse-audio', category: 'electronics-headphones', kind: 'earbuds', color: '#F5F5F5', alt: '#16213E', mrp: 3499, price: 1799, seller: 'technest', sold: 1500,
    description: 'Compact earbuds with punchy 12mm drivers, environmental noise cancellation for calls and a pocketable charging case with 28 hours of total playback.',
    attrs: [['Type', 'In-ear, true wireless'], ['Battery', '28 hours with case'], ['Water resistance', 'IPX5'], ['Connectivity', 'Bluetooth 5.2']],
    variants: [{ label: 'Pearl White', options: { Colour: 'White' }, stock: 90 }, { label: 'Carbon Black', options: { Colour: 'Black' }, stock: 75 }] },
  { slug: 'zenith-action-cam-4k', name: 'Zenith Action Cam 4K Waterproof', brand: 'zenith', category: 'electronics-cameras', kind: 'camera', color: '#222831', alt: '#FFB703', mrp: 12999, price: 9499, seller: 'technest', sold: 230,
    description: 'Shoot stabilised 4K video at 60fps. Waterproof to 10 metres without a case, with a front screen for vlogging and a mounting kit included.',
    attrs: [['Video', '4K at 60fps'], ['Stabilisation', 'Electronic, 3-axis'], ['Waterproof', '10 m'], ['In the box', 'Mounts, 2 batteries']],
    variants: [{ label: 'Standard kit', stock: 18 }] },
  { slug: 'zenith-mirrorless-camera-kit', name: 'Zenith M50 Mirrorless Camera with 18-55mm Lens', brand: 'zenith', category: 'electronics-cameras', kind: 'camera', color: '#2D3142', alt: '#BFC0C0', mrp: 54999, price: 49999, seller: 'technest', sold: 95,
    description: 'A 24MP mirrorless camera with fast autofocus, a tilting touchscreen and 4K video. Ships with a versatile 18-55mm kit lens.',
    attrs: [['Sensor', '24.2MP APS-C'], ['Video', '4K 30fps'], ['Screen', '3-inch tilting touch'], ['Lens', '18-55mm kit']],
    variants: [{ label: 'Body + 18-55mm', stock: 8, reorder: 3 }] },
  { slug: 'kairo-fit-smart-watch', name: 'Kairo Fit AMOLED Smart Watch with GPS', brand: 'kairo', category: 'electronics-smart-watches', kind: 'smartwatch', color: '#1D3557', alt: '#E63946', mrp: 6999, price: 3299, seller: 'technest', sold: 1200,
    description: 'A 1.43-inch AMOLED smartwatch with built-in GPS, heart-rate and SpO2 tracking, 100+ sports modes and up to 10 days of battery.',
    attrs: [['Display', '1.43-inch AMOLED'], ['GPS', 'Built-in'], ['Battery', 'Up to 10 days'], ['Water resistance', '5 ATM']],
    variants: [{ label: 'Navy', options: { Colour: 'Navy' }, stock: 55 }, { label: 'Coral', options: { Colour: 'Coral' }, stock: 40 }, { label: 'Graphite', options: { Colour: 'Graphite' }, stock: 0, reorder: 5 }] },
  { slug: 'kairo-pulse-band-2', name: 'Kairo Pulse Band 2 Fitness Tracker', brand: 'kairo', category: 'electronics-smart-watches', kind: 'smartwatch', color: '#0B132B', alt: '#5BC0BE', mrp: 2999, price: 1499, seller: 'technest', sold: 760,
    description: 'A slim fitness band with sleep tracking, step counting and call notifications. Two-week battery in a 12g body.',
    attrs: [['Display', '1.1-inch AMOLED'], ['Battery', '14 days'], ['Weight', '12 g']],
    variants: [{ label: 'Black', stock: 70 }, { label: 'Teal', stock: 48 }] },

  // ───────── TechNest: Mobiles ─────────
  { slug: 'novatech-n7-5g-smartphone', name: 'NovaTech N7 5G Smartphone', brand: 'novatech', category: 'mobiles-smartphones', kind: 'phone', color: '#3A86FF', alt: '#8338EC', mrp: 24999, price: 21999, seller: 'technest', sold: 1850,
    description: 'A 6.7-inch 120Hz AMOLED 5G phone with a 50MP camera, 5000mAh battery and 67W fast charging. Clean software with three years of updates.',
    attrs: [['Display', '6.7-inch 120Hz AMOLED'], ['Camera', '50MP + 8MP ultrawide'], ['Battery', '5000mAh, 67W'], ['Network', '5G dual SIM']],
    variants: [{ label: '8GB / 128GB · Ocean Blue', options: { Memory: '8GB/128GB', Colour: 'Blue' }, stock: 85 }, { label: '8GB / 256GB · Violet', options: { Memory: '8GB/256GB', Colour: 'Violet' }, stock: 40, price: 23999 }] },
  { slug: 'aurora-a3-smartphone', name: 'Aurora A3 Smartphone 6GB/128GB', brand: 'aurora', category: 'mobiles-smartphones', kind: 'phone', color: '#2EC4B6', alt: '#011627', mrp: 16999, price: 13999, seller: 'technest', sold: 2100,
    description: 'A value-packed 6.5-inch phone with a 90Hz display, 50MP camera and a two-day battery. Splash resistant with a fingerprint sensor.',
    attrs: [['Display', '6.5-inch 90Hz LCD'], ['Camera', '50MP dual'], ['Battery', '5000mAh'], ['Warranty', '1 year']],
    variants: [{ label: 'Mint', options: { Colour: 'Mint' }, stock: 120 }, { label: 'Midnight', options: { Colour: 'Midnight' }, stock: 95 }] },
  { slug: 'veloce-flagship-x-pro', name: 'Veloce X Pro Flagship Smartphone', brand: 'veloce', category: 'mobiles-smartphones', kind: 'phone', color: '#14213D', alt: '#FCA311', mrp: 79999, price: 72999, seller: 'technest', sold: 310,
    description: 'A premium 6.8-inch LTPO display, triple-lens periscope camera system and 100W wired plus 50W wireless charging in a titanium frame.',
    attrs: [['Display', '6.8-inch LTPO 120Hz'], ['Camera', '200MP + 50MP + 12MP'], ['Charging', '100W wired / 50W wireless'], ['Build', 'Titanium frame']],
    variants: [{ label: '12GB / 256GB', options: { Memory: '12GB/256GB' }, stock: 14 }, { label: '12GB / 512GB', options: { Memory: '12GB/512GB' }, stock: 9, price: 79999 }] },
  { slug: 'veloce-power-bank-20000', name: 'Veloce 20000mAh Fast-Charge Power Bank', brand: 'veloce', category: 'mobiles-mobile-accessories', kind: 'powerbank', color: '#264653', alt: '#E9C46A', mrp: 2499, price: 1299, seller: 'technest', sold: 1700,
    description: 'Charge two devices at once with 22.5W output. Carry-on friendly with a digital battery display and a braided USB-C cable included.',
    attrs: [['Capacity', '20000mAh'], ['Output', '22.5W'], ['Ports', '2x USB-A, 1x USB-C'], ['Warranty', '6 months']],
    variants: [{ label: 'Black', stock: 150 }] },
  { slug: 'zenith-65w-gan-charger', name: 'Zenith 65W GaN Fast Charger (3 Ports)', brand: 'zenith', category: 'mobiles-mobile-accessories', kind: 'charger', color: '#E5E5E5', alt: '#14213D', mrp: 1999, price: 999, seller: 'technest', sold: 940,
    description: 'A palm-sized GaN charger that powers a laptop, phone and earbuds together. Intelligent power sharing with over-heat protection.',
    attrs: [['Output', '65W total'], ['Ports', '2x USB-C, 1x USB-A'], ['Technology', 'GaN III']],
    variants: [{ label: 'White', stock: 110 }] },

  // ───────── TechNest: Home appliances ─────────
  { slug: 'hearth-mixer-grinder-750w', name: 'Hearth & Co 750W Mixer Grinder with 3 Jars', brand: 'hearth-co', category: 'home-appliances-kitchen-appliances', kind: 'mixer', color: '#C0392B', alt: '#2C3E50', mrp: 4495, price: 2799, seller: 'technest', sold: 1320,
    description: 'A powerful 750W motor with three stainless-steel jars for wet, dry and chutney grinding. Overload protection and a 2-year motor warranty.',
    attrs: [['Power', '750 W'], ['Jars', '3 stainless steel'], ['Speeds', '3 + pulse'], ['Warranty', '2 years on motor']],
    variants: [{ label: 'Red', stock: 45 }, { label: 'Charcoal', stock: 38 }] },
  { slug: 'brewmate-electric-kettle-1-5l', name: 'Brewmate 1.5L Stainless Steel Electric Kettle', brand: 'brewmate', category: 'home-appliances-kitchen-appliances', kind: 'kettle', color: '#B8B8B8', alt: '#1F2937', mrp: 1799, price: 899, seller: 'technest', sold: 2400,
    description: 'Boils water in under four minutes. Auto shut-off, boil-dry protection and a concealed heating element for easy cleaning.',
    attrs: [['Capacity', '1.5 L'], ['Power', '1500 W'], ['Body', 'Food-grade stainless steel']],
    variants: [{ label: 'Silver', stock: 130 }] },
  { slug: 'hearth-air-fryer-4-2l', name: 'Hearth & Co 4.2L Digital Air Fryer', brand: 'hearth-co', category: 'home-appliances-kitchen-appliances', kind: 'airfryer', color: '#1F2937', alt: '#F59E0B', mrp: 7999, price: 4999, seller: 'technest', sold: 870,
    description: 'Cook crispy food with up to 90% less oil. Eight one-touch presets, a digital display and a dishwasher-safe non-stick basket.',
    attrs: [['Capacity', '4.2 L'], ['Presets', '8'], ['Temperature', '80-200 °C'], ['Power', '1500 W']],
    variants: [{ label: 'Black', stock: 36 }] },
  { slug: 'brewmate-cordless-vacuum', name: 'Brewmate Cordless Stick Vacuum Cleaner', brand: 'brewmate', category: 'home-appliances-cleaning-appliances', kind: 'vacuum', color: '#7C3AED', alt: '#111827', mrp: 9999, price: 6999, seller: 'technest', sold: 280,
    description: 'Lightweight cordless cleaning with 25kPa suction, a washable HEPA filter and up to 45 minutes of runtime. Converts to a handheld.',
    attrs: [['Suction', '25 kPa'], ['Runtime', 'Up to 45 min'], ['Filter', 'Washable HEPA'], ['Weight', '1.4 kg']],
    variants: [{ label: 'Purple', stock: 20 }] },

  // ───────── UrbanKart: Fashion ─────────
  { slug: 'urbanedge-cotton-crew-tshirt', name: 'UrbanEdge Men\'s Pure Cotton Crew-Neck T-Shirt', brand: 'urbanedge', category: 'fashion-men', kind: 'tshirt', color: '#2A9D8F', alt: '#264653', mrp: 999, price: 499, seller: 'urbankart', sold: 3200,
    description: 'A 180 GSM combed-cotton tee with a relaxed fit, reinforced neck and pre-shrunk fabric. Machine washable and colour-fast.',
    attrs: [['Fabric', '100% combed cotton, 180 GSM'], ['Fit', 'Regular'], ['Care', 'Machine wash cold']],
    variants: sz([40, 60, 55, 25]) },
  { slug: 'urbanedge-slim-fit-hoodie', name: 'UrbanEdge Slim Fit Fleece Hoodie', brand: 'urbanedge', category: 'fashion-men', kind: 'hoodie', color: '#6D597A', alt: '#355070', mrp: 2499, price: 1299, seller: 'urbankart', sold: 980,
    description: 'A soft brushed-fleece hoodie with a double-layer hood, kangaroo pocket and ribbed cuffs. Warm without the bulk.',
    attrs: [['Fabric', 'Cotton-poly fleece, 320 GSM'], ['Fit', 'Slim'], ['Care', 'Machine wash cold']],
    variants: sz([18, 30, 28, 12]) },
  { slug: 'threadly-floral-kurta-set', name: 'Threadly Women\'s Floral Print Kurta with Palazzo', brand: 'threadly', category: 'fashion-women', kind: 'kurta', color: '#E76F51', alt: '#F4A261', mrp: 2999, price: 1499, seller: 'urbankart', sold: 1450,
    description: 'A breezy cotton kurta set with a hand-block-inspired floral print and matching palazzo trousers. Side pockets and a relaxed A-line cut.',
    attrs: [['Fabric', 'Cotton'], ['Set', 'Kurta + palazzo'], ['Sleeve', 'Three-quarter'], ['Care', 'Hand wash separately']],
    variants: sz([22, 35, 30, 14]) },
  { slug: 'threadly-denim-jacket', name: 'Threadly Women\'s Classic Denim Jacket', brand: 'threadly', category: 'fashion-women', kind: 'jacket', color: '#4F6D8F', alt: '#1D3557', mrp: 3499, price: 1999, seller: 'urbankart', sold: 520,
    description: 'A timeless mid-wash denim jacket in stretch cotton, with button front, chest pockets and a slightly cropped fit.',
    attrs: [['Fabric', 'Stretch denim'], ['Fit', 'Cropped regular'], ['Care', 'Machine wash cold']],
    variants: sz([10, 16, 14, 6]) },
  { slug: 'stride-airlite-running-shoes', name: 'Stride AirLite Running Shoes', brand: 'stride', category: 'fashion-footwear', kind: 'sneaker', color: '#EF476F', alt: '#073B4C', mrp: 4999, price: 2999, seller: 'urbankart', sold: 1750,
    description: 'Lightweight mesh runners with a responsive foam midsole and a grippy rubber outsole. Breathable and cushioned for daily miles.',
    attrs: [['Upper', 'Engineered mesh'], ['Sole', 'EVA midsole, rubber outsole'], ['Use', 'Running, gym']],
    variants: shoe([20, 35, 30, 4]) },
  { slug: 'stride-classic-sneakers', name: 'Stride Classic Low-Top Sneakers', brand: 'stride', category: 'fashion-footwear', kind: 'sneaker', color: '#F1FAEE', alt: '#1D3557', mrp: 3499, price: 1899, seller: 'urbankart', sold: 1280,
    description: 'Clean everyday sneakers in vegan leather with a cushioned insole and vulcanised sole. Easy to pair with anything.',
    attrs: [['Upper', 'Vegan leather'], ['Sole', 'Vulcanised rubber'], ['Closure', 'Lace-up']],
    variants: shoe([25, 40, 33, 18]) },

  // ───────── UrbanKart: Furniture ─────────
  { slug: 'oakline-ergomesh-office-chair', name: 'Oakline ErgoMesh High-Back Office Chair', brand: 'oakline', category: 'furniture-office', kind: 'chair', color: '#374151', alt: '#9CA3AF', mrp: 12999, price: 7499, seller: 'urbankart', sold: 430,
    description: 'Breathable mesh back, adjustable lumbar support, 3D armrests and a tilt-lock mechanism. Rated for 8-hour workdays up to 120 kg.',
    attrs: [['Back', 'Breathable mesh'], ['Adjustments', 'Height, tilt, lumbar, armrest'], ['Max load', '120 kg'], ['Warranty', '3 years']],
    variants: [{ label: 'Black', stock: 22 }, { label: 'Grey', stock: 15 }] },
  { slug: 'dwell-3-seater-fabric-sofa', name: 'Dwell 3-Seater Fabric Sofa', brand: 'dwell', category: 'furniture-living-room', kind: 'sofa', color: '#6B8F71', alt: '#B08968', mrp: 34999, price: 22999, seller: 'urbankart', sold: 120,
    description: 'A deep-seated three-seater with high-resilience foam, solid sheesham-wood legs and removable, washable cushion covers.',
    attrs: [['Seating', '3 persons'], ['Frame', 'Engineered wood'], ['Legs', 'Solid sheesham'], ['Dimensions', '210 x 86 x 82 cm']],
    variants: [{ label: 'Sage Green', stock: 7, reorder: 3 }, { label: 'Warm Tan', stock: 5, reorder: 3 }] },
  { slug: 'oakline-5-shelf-bookcase', name: 'Oakline 5-Shelf Engineered Wood Bookcase', brand: 'oakline', category: 'furniture-living-room', kind: 'shelf', color: '#A98467', alt: '#6C584C', mrp: 8999, price: 5499, seller: 'urbankart', sold: 260,
    description: 'A sturdy five-tier bookcase with anti-tip fittings and a scratch-resistant laminate finish. Easy tool-based assembly.',
    attrs: [['Material', 'Engineered wood, laminate'], ['Shelves', '5'], ['Dimensions', '180 x 60 x 30 cm']],
    variants: [{ label: 'Walnut', stock: 20 }, { label: 'Wenge', stock: 17 }] },
  { slug: 'dwell-compact-study-desk', name: 'Dwell Compact Study Desk with Drawer', brand: 'dwell', category: 'furniture-office', kind: 'desk', color: '#D4A373', alt: '#5F6F52', mrp: 6999, price: 4299, seller: 'urbankart', sold: 340,
    description: 'A space-saving desk with a wide work surface, a lockable drawer and a cable-management hole. Holds a monitor and laptop comfortably.',
    attrs: [['Material', 'Engineered wood'], ['Top', '120 x 60 cm'], ['Storage', '1 lockable drawer']],
    variants: [{ label: 'Oak', stock: 26 }] },

  // ───────── UrbanKart: Beauty ─────────
  { slug: 'glowlab-vitamin-c-serum', name: 'Glowlab 10% Vitamin C Face Serum 30ml', brand: 'glowlab', category: 'beauty-skincare', kind: 'serum', color: '#F59E0B', alt: '#FDE68A', mrp: 999, price: 599, seller: 'urbankart', sold: 2800,
    description: 'A brightening serum with 10% stabilised Vitamin C and hyaluronic acid for glowing, even-toned skin. Fragrance free and dermatologically tested.',
    attrs: [['Volume', '30 ml'], ['Key ingredients', 'Vitamin C, hyaluronic acid'], ['Skin type', 'All skin types']],
    variants: [{ label: '30 ml', stock: 200 }] },
  { slug: 'pure-roots-aloe-moisturiser', name: 'Pure Roots Aloe Vera Gel Moisturiser 200ml', brand: 'pure-roots', category: 'beauty-skincare', kind: 'cream', color: '#52B788', alt: '#D8F3DC', mrp: 499, price: 349, seller: 'urbankart', sold: 1900,
    description: 'A lightweight, non-sticky gel moisturiser with 98% aloe vera for face and body. Soothes and hydrates all day.',
    attrs: [['Volume', '200 ml'], ['Key ingredient', '98% aloe vera'], ['Use', 'Face and body']],
    variants: [{ label: '200 ml', stock: 180 }] },
  { slug: 'soleil-spf-50-sunscreen', name: 'Soleil Invisible Sunscreen SPF 50 PA++++', brand: 'soleil', category: 'beauty-skincare', kind: 'sunscreen', color: '#FFD166', alt: '#06D6A0', mrp: 799, price: 479, seller: 'urbankart', sold: 1600,
    description: 'A matte-finish sunscreen with broad-spectrum SPF 50 PA++++ and no white cast. Water resistant for up to 80 minutes.',
    attrs: [['SPF', '50 PA++++'], ['Volume', '60 g'], ['Finish', 'Matte, no white cast']],
    variants: [{ label: '60 g', stock: 140 }] },
  { slug: 'soleil-beard-grooming-kit', name: 'Soleil Beard & Grooming Kit for Men', brand: 'soleil', category: 'beauty-grooming', kind: 'grooming', color: '#6C757D', alt: '#212529', mrp: 1499, price: 899, seller: 'urbankart', sold: 640,
    description: 'Everything for a sharp beard: oil, balm, wooden comb and a boar-bristle brush in a gift-ready box.',
    attrs: [['Contents', 'Oil, balm, comb, brush'], ['Oil', '30 ml'], ['Balm', '50 g']],
    variants: [{ label: 'Gift box', stock: 60 }] },

  // ───────── UrbanKart: Sports ─────────
  { slug: 'peak-active-adjustable-dumbbell-set', name: 'Peak Active 20 kg Adjustable Dumbbell Set', brand: 'peak-active', category: 'sports-fitness', kind: 'dumbbell', color: '#495057', alt: '#E63946', mrp: 5999, price: 3999, seller: 'urbankart', sold: 520,
    description: 'A pair of adjustable dumbbells from 2 to 10 kg each with secure spin-lock collars and a non-slip handle. Replaces a whole rack.',
    attrs: [['Total weight', '20 kg (2 x 10 kg max)'], ['Handle', 'Knurled, non-slip'], ['Collar', 'Spin-lock']],
    variants: [{ label: '20 kg set', stock: 28 }] },
  { slug: 'peak-active-yoga-mat-6mm', name: 'Peak Active 6mm Anti-Slip Yoga Mat', brand: 'peak-active', category: 'sports-fitness', kind: 'yogamat', color: '#7209B7', alt: '#3A0CA3', mrp: 1299, price: 599, seller: 'urbankart', sold: 2200,
    description: 'A 6mm cushioned mat with a textured anti-slip surface and an alignment guide. Comes with a carry strap.',
    attrs: [['Thickness', '6 mm'], ['Size', '183 x 61 cm'], ['Material', 'Eco TPE']],
    variants: [{ label: 'Purple', stock: 95 }, { label: 'Teal', stock: 80 }] },
  { slug: 'nomad-gear-trail-football', name: 'Nomad Gear Match Football Size 5', brand: 'nomad-gear', category: 'sports-outdoor', kind: 'football', color: '#FFFFFF', alt: '#212529', mrp: 1499, price: 899, seller: 'urbankart', sold: 730,
    description: 'A machine-stitched size-5 football with a durable PU cover and butyl bladder for consistent flight and air retention.',
    attrs: [['Size', '5'], ['Cover', 'PU'], ['Bladder', 'Butyl']],
    variants: [{ label: 'Size 5', stock: 75 }] },
  { slug: 'nomad-gear-steel-bottle-1l', name: 'Nomad Gear 1L Insulated Steel Bottle', brand: 'nomad-gear', category: 'sports-outdoor', kind: 'bottle', color: '#0077B6', alt: '#90E0EF', mrp: 799, price: 449, seller: 'urbankart', sold: 1900,
    description: 'Double-wall vacuum insulation keeps drinks cold for 24 hours or hot for 12. Leak-proof lid and a powder-coated finish.',
    attrs: [['Capacity', '1 L'], ['Insulation', '24 h cold / 12 h hot'], ['Body', '304 stainless steel']],
    variants: [{ label: 'Ocean Blue', stock: 110 }, { label: 'Matte Black', stock: 90 }] },

  // ───────── UrbanKart: Accessories ─────────
  { slug: 'nomad-gear-30l-backpack', name: 'Nomad Gear 30L Laptop Backpack', brand: 'nomad-gear', category: 'accessories-bags', kind: 'backpack', color: '#264653', alt: '#E76F51', mrp: 2999, price: 1499, seller: 'urbankart', sold: 1550,
    description: 'A water-resistant 30L backpack with a padded 15.6-inch laptop sleeve, USB charging port and anti-theft back pocket.',
    attrs: [['Capacity', '30 L'], ['Laptop sleeve', 'Up to 15.6-inch'], ['Material', 'Water-resistant polyester']],
    variants: [{ label: 'Slate', stock: 70 }, { label: 'Rust', stock: 44 }] },
  { slug: 'tickwell-chronograph-watch', name: 'Tickwell Men\'s Chronograph Wrist Watch', brand: 'tickwell', category: 'accessories-watches', kind: 'watch', color: '#B08D57', alt: '#1B1B1B', mrp: 5999, price: 2999, seller: 'urbankart', sold: 480,
    description: 'A stainless-steel chronograph with a sapphire-style scratch-resistant glass, 3 sub-dials and 50 m water resistance.',
    attrs: [['Movement', 'Quartz chronograph'], ['Case', '42 mm stainless steel'], ['Water resistance', '50 m']],
    variants: [{ label: 'Gold / Black', stock: 25 }, { label: 'Steel / Blue', stock: 21 }] },
  { slug: 'tickwell-leather-bifold-wallet', name: 'Tickwell Genuine Leather Bifold Wallet', brand: 'tickwell', category: 'accessories-bags', kind: 'wallet', color: '#7F5539', alt: '#1B1B1B', mrp: 1299, price: 699, seller: 'urbankart', sold: 1100,
    description: 'Full-grain leather bifold with RFID blocking, 6 card slots, a coin pocket and two note compartments.',
    attrs: [['Material', 'Genuine leather'], ['Card slots', '6'], ['RFID', 'Blocking']],
    variants: [{ label: 'Tan', stock: 52 }, { label: 'Black', stock: 60 }] },
  { slug: 'soleil-polarised-sunglasses', name: 'Soleil Polarised Aviator Sunglasses', brand: 'soleil', category: 'accessories', kind: 'sunglasses', color: '#D4AF37', alt: '#2B2D42', mrp: 1999, price: 899, seller: 'urbankart', sold: 890,
    description: 'Lightweight metal-frame aviators with polarised UV400 lenses and spring hinges for all-day comfort. Includes a hard case.',
    attrs: [['Lens', 'Polarised, UV400'], ['Frame', 'Metal alloy'], ['In the box', 'Hard case, cloth']],
    variants: [{ label: 'Gold / Green', stock: 48 }, { label: 'Black / Grey', stock: 52 }] },
];

export const REVIEW_TEXTS: { rating: number; title: string; body: string }[] = [
  { rating: 5, title: 'Worth every rupee', body: 'Excellent quality and it arrived two days early. Exactly as described and the packaging was solid.' },
  { rating: 5, title: 'Better than expected', body: 'Used it for a couple of weeks now and I am very happy. Great value compared to similar products.' },
  { rating: 4, title: 'Very good overall', body: 'Does the job really well. Minor niggles with the instructions but nothing that spoils the experience.' },
  { rating: 4, title: 'Solid purchase', body: 'Good build and finish. Delivery was quick and the seller answered my question promptly.' },
  { rating: 5, title: 'Highly recommended', body: 'Looks premium, feels sturdy and works perfectly. Bought a second one as a gift.' },
  { rating: 3, title: 'Decent for the price', body: 'It is fine for everyday use. Not outstanding, but you get what you pay for.' },
  { rating: 4, title: 'Happy with it', body: 'Matches the photos and works as advertised. Would buy from this seller again.' },
  { rating: 2, title: 'Average experience', body: 'Works, but the finish is not as good as I hoped. Customer support was helpful though.' },
];
