/* Mentor Hall rentals – default data (taken from the Rate Card & Brochure) + shared helpers.
   Everything here can be edited later in Admin → Rentals (the database then overrides these defaults). */
const DEF_TERMS = [
  'A 50% advance confirms your date. The balance is paid on or before the day.',
  'Cancel 7 or more days ahead for a full refund of the advance. Later cancellations keep the advance.',
  'Hourly bookings are for a minimum of 2 hours. Extra time is Rs 5,000 per hour.',
  'Weekend bookings are on request, subject to availability.'
];
const DEF_RENTAL = {
  intro: 'Your venue for seminars, workshops, training and classes in Navinna, Maharagama.',
  whatsapp: '071 303 8448', email: 'info@mentobeam.com', web: 'mentobeam.com',
  address: '274/1/1, High Level Road, Navinna, Maharagama', hours: 'Weekdays 9.00 am to 6.00 pm · Weekends on request',
  included: ['Air conditioning', 'Smart board', 'Fibre WiFi', 'Layout set up for you', 'Washrooms', 'Drinking water', 'Lounge access'],
  terms: DEF_TERMS,
  // advance payment / refund (editable in Admin -> Rentals -> Terms & contact)
  advancePct: 50, refundDays: 7, refundHours: 48,
  bankName: '', bankBranch: '', bankAccName: '', bankAccNo: '', payNote: ''
};
/* package modes: hourly = price × hours (min hours) | fixed = one price | unit_hour = price × units × hours | quote = on request
   extra "per": flat | hour | unit_hour | request */
const DEF_SPACES = [
  { id: 'hall', order: 1, icon: '🏛️', name: 'Mentor Hall', available: true,
    tagline: 'Flexible training floor for impactful sessions.',
    idealFor: 'Seminars, workshops, corporate training, tuition and exam classes, student events',
    desc: 'A real learning space at Mentobeam Skills & Innovation Center. Smart board, air conditioning and fibre WiFi are included in every booking, and the layout is set up before you arrive.',
    stats: [{ v: '50', l: 'seats with tables' }, { v: '100', l: 'seats theatre style' }, { v: '4', l: 'layouts to choose from' }],
    features: ['Smart board', 'Fully air conditioned', 'Fibre WiFi', 'Movable tables', 'Classroom, cluster, U shape, theatre', 'Set up before you arrive'],
    layouts: ['Classroom', 'Cluster', 'U shape', 'Theatre'], maxGuests: 100,
    packages: [
      { id: 'hourly', name: 'Hourly', mode: 'hourly', price: 4500, unit: 'per hour', minHours: 2, note: 'Minimum 2 hours' },
      { id: 'half', name: 'Half day', mode: 'fixed', price: 15000, unit: '4 hours', hours: 4, note: 'Workshops and seminars' },
      { id: 'full', name: 'Full day', mode: 'fixed', price: 27500, unit: '8 hours', hours: 8, note: 'Training days and events', badge: 'BEST VALUE' },
      { id: 'monthly', name: 'Monthly classes', mode: 'quote', priceText: 'Negotiable', unit: 'regular slot', note: 'Tuition and weekly classes' }
    ],
    extras: [
      { id: 'lab', name: 'Computer lab', per: 'unit_hour', price: 1000, label: 'per station per hour', qtyLabel: 'Stations', max: 8 },
      { id: 'reg', name: 'Registration desk', per: 'flat', price: 5000, label: '' },
      { id: 'xhour', name: 'Extra hour', per: 'hour', price: 5000, label: 'per hour', qtyLabel: 'Extra hours', max: 12 },
      { id: 'print', name: 'Printing', per: 'request', label: 'On request' },
      { id: 'refresh', name: 'Refreshments and full event organising', per: 'request', label: 'On request' }
    ] },
  { id: 'lab', order: 2, icon: '💻', name: 'Computer Lab', available: true,
    tagline: 'Hands on lab for digital skills.',
    idealFor: 'Software and coding classes, digital skills training, computer based exam practice',
    desc: 'Eight private workstations with 24 inch monitors and headsets with microphones, fully air conditioned.',
    stats: [{ v: '8', l: 'private workstations' }, { v: '24"', l: 'monitors' }],
    features: ['8 private workstations', '24 inch monitors', 'Headsets with microphones', 'Fully air conditioned'],
    layouts: [], maxGuests: 8,
    packages: [{ id: 'station', name: 'Workstation hire', mode: 'unit_hour', price: 1000, unit: 'per station per hour', minHours: 1, maxUnits: 8, unitLabel: 'Stations', note: 'Choose how many stations and for how many hours' }],
    extras: [
      { id: 'reg', name: 'Registration desk', per: 'flat', price: 5000, label: '' },
      { id: 'print', name: 'Printing', per: 'request', label: 'On request' },
      { id: 'refresh', name: 'Refreshments and full event organising', per: 'request', label: 'On request' }
    ] },
  { id: 'lounge', order: 3, icon: '☕', name: 'Lounge and Pantry', available: true,
    tagline: 'Open space for breaks and networking.',
    idealFor: 'Tea breaks, guest registration, networking and quiet waiting',
    desc: 'An open lounge with a pantry counter. Lounge access is included with every Mentor Hall booking.',
    stats: [], features: ['Open lounge seating', 'Pantry counter', 'Guest registration area'], layouts: [], maxGuests: 40,
    packages: [
      { id: 'incl', name: 'With a Mentor Hall booking', mode: 'quote', priceText: 'Included', unit: 'lounge access', note: 'Lounge access is included with every Mentor Hall booking' },
      { id: 'own', name: 'Lounge on its own', mode: 'quote', priceText: 'On request', unit: '', note: 'Tell us your date, time and headcount' }
    ],
    extras: [
      { id: 'refresh', name: 'Refreshment packages', per: 'request', label: 'On request' },
      { id: 'reg', name: 'Registration desk', per: 'flat', price: 5000, label: '' }
    ] }
];
const DEF_IMGS = { hall: ['img/hall-1.jpg', 'img/hall-2.jpg', 'img/hall-3.jpg'], lab: ['img/lab-1.jpg'], lounge: ['img/lounge-1.jpg', 'img/lounge-2.jpg'] };

const rs = n => 'Rs ' + Number(n).toLocaleString('en-US');
const pkgPrice = p => p.mode === 'quote' ? (p.priceText || 'On request') : rs(p.price);
const exLabel = x => x.per === 'request' ? (x.label || 'On request') : rs(x.price) + (x.label ? ' ' + x.label : '');
function fromPrice(sp) {
  const p = (sp.packages || []).find(x => x.mode !== 'quote' && x.price != null);
  return p ? 'From ' + rs(p.price) + (p.mode === 'fixed' ? '' : ' ' + (p.unit || '')) : ((sp.packages || [])[0] ? (sp.packages[0].priceText || 'On request') : 'On request');
}
function mergeSpace(def, doc) {
  const sp = Object.assign({}, def, doc || {});
  sp.photos = (doc && doc.photos && doc.photos.length) ? doc.photos : (DEF_IMGS[sp.id] || []);
  sp.packages = sp.packages || []; sp.extras = sp.extras || []; sp.features = sp.features || []; sp.stats = sp.stats || [];
  return sp;
}
/* loads spaces + shared rental settings. If Firestore can't be read, spaces are shown but NOT bookable. */
async function loadRentals() {
  const out = { spaces: DEF_SPACES.map(d => mergeSpace(d, null)), rental: Object.assign({}, DEF_RENTAL), site: {}, ok: false };
  if (!CONFIGURED) { out.spaces.forEach(s => s.available = false); return out; }
  try {
    const [sp, rt, st] = await Promise.all([db.collection('spaces').get(), db.collection('settings').doc('rental').get(), db.collection('settings').doc('site').get().catch(() => null)]);
    const docs = {}; sp.forEach(d => docs[d.id] = d.data());
    out.spaces = DEF_SPACES.map(d => mergeSpace(d, docs[d.id])).sort((a, b) => (a.order || 9) - (b.order || 9));
    if (rt.exists) { const r = rt.data(); out.rental = Object.assign({}, DEF_RENTAL, r); if (!(r.terms && r.terms.length)) out.rental.terms = DEF_TERMS; }
    if (st && st.exists) out.site = st.data();
    out.ok = true;
  } catch (e) { out.spaces.forEach(s => s.available = false); out.error = e; }
  return out;
}
/* price estimate. sel = { pkg, hours, units, extras: {id: qty} } */
function calcEstimate(sp, sel) {
  const lines = []; let total = 0, quote = false;
  const p = sp.packages.find(x => x.id === sel.pkg); if (!p) return { total: 0, lines, quote: true };
  const h = Math.max(Number(sel.hours) || 0, 0), u = Math.max(Number(sel.units) || 1, 1);
  if (p.mode === 'hourly') { const hh = Math.max(h, p.minHours || 1); total += p.price * hh; lines.push([p.name + ' · ' + hh + ' h × ' + rs(p.price), p.price * hh]); }
  else if (p.mode === 'fixed') { total += p.price; lines.push([p.name + (p.unit ? ' (' + p.unit + ')' : ''), p.price]); }
  else if (p.mode === 'unit_hour') { const hh = Math.max(h, p.minHours || 1); total += p.price * u * hh; lines.push([p.name + ' · ' + u + ' station(s) × ' + hh + ' h', p.price * u * hh]); }
  else { quote = true; lines.push([p.name, null]); }
  sp.extras.forEach(x => {
    const q = Number((sel.extras || {})[x.id] || 0); if (!q) return;
    if (x.per === 'request') { quote = true; lines.push([x.name + ' (on request)', null]); }
    else if (x.per === 'flat') { total += x.price; lines.push([x.name, x.price]); }
    else if (x.per === 'hour') { total += x.price * q; lines.push([x.name + ' · ' + q + ' h', x.price * q]); }
    else if (x.per === 'unit_hour') { const hh = Math.max(h, 1); total += x.price * q * hh; lines.push([x.name + ' · ' + q + ' × ' + hh + ' h', x.price * q * hh]); }
  });
  return { total, lines, quote };
}
function waLink(num, text) { const n = String(num || '').replace(/\D/g, '').replace(/^0/, '94'); return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : ''); }

/* ---------- advance payment, slips, refunds ---------- */
const LK_BANKS = ['Bank of Ceylon', "People's Bank", 'Commercial Bank', 'Hatton National Bank (HNB)', 'Sampath Bank', 'Seylan Bank', 'Nations Trust Bank (NTB)', 'DFCC Bank', 'NDB Bank', 'Pan Asia Bank', 'Union Bank', 'Amana Bank', 'Cargills Bank', 'National Savings Bank (NSB)', 'Regional Development Bank', 'Other'];
const advanceOf = (total, pct) => total > 0 ? Math.ceil(total * (pct || 50) / 100 / 100) * 100 : 0;      // rounded up to the next Rs 100
const daysUntil = d => Math.round((parseD(d).getTime() - new Date(new Date().toDateString()).getTime()) / 864e5);
const SLIP_MAX_PDF = 650 * 1024;
const fileToDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
function imgToJpeg(file, maxPx, q) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { try { const k = Math.min(1, maxPx / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); } catch (e) { rej(e); } };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not open that image.')); }; im.src = url;
  });
}
/* returns {data,type,name,size} – an image (compressed JPG) or a small PDF, always < ~900 KB so it fits one database record */
async function slipToData(file) {
  if (file.type === 'application/pdf') {
    if (file.size > SLIP_MAX_PDF) throw new Error('That PDF is too large (max 650 KB). Please upload a photo or screenshot of the slip instead.');
    return { data: await fileToDataUrl(file), type: 'application/pdf', name: file.name, size: file.size };
  }
  if (!/^image\//.test(file.type)) throw new Error('Please upload a photo (JPG/PNG) or a PDF of the slip.');
  let data; try { data = await imgToJpeg(file, 1400, .75); if (data.length > 800000) data = await imgToJpeg(file, 1000, .6); }
  catch (e) { if (file.size <= SLIP_MAX_PDF) data = await fileToDataUrl(file); else throw new Error('Could not process that image. Please try another photo.'); }
  if (data.length > 900000) throw new Error('That image is too large. Please upload a smaller photo.');
  return { data, type: data.startsWith('data:image/jpeg') ? 'image/jpeg' : file.type, name: file.name.replace(/\.[^.]+$/, '') + '.jpg', size: Math.round(data.length * 3 / 4) };
}
