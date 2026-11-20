/* MentoBeam – shared helpers (used by index.html and admin.html) */

/* ============ 1) PASTE YOUR FIREBASE CONFIG HERE ============ */
const firebaseConfig = {
  apiKey: "AIzaSyCMPHVQTKeg4FlwncfZuiXR5QodB3BF_WA",
  authDomain: "exambooking-65ec4.firebaseapp.com",
  projectId: "exambooking-65ec4",
  storageBucket: "exambooking-65ec4.firebasestorage.app",
  messagingSenderId: "1036011128771",
  appId: "1:1036011128771:web:8152d3eb0dfe8997901f76",
  measurementId: "G-9FXYFS6M33"
};

/* ============================================================ */

/* Optional: Firebase App Check (reCAPTCHA v3) – paste the site key here AFTER registering the app in Firebase Console -> App Check. */
const APPCHECK_SITE_KEY = '';

const CONFIGURED = !String(firebaseConfig.apiKey).startsWith('PASTE');
let db = null, auth = null;
if (CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
  if (APPCHECK_SITE_KEY && firebase.appCheck) { try { firebase.appCheck().activate(APPCHECK_SITE_KEY, true); } catch (e) { /* ignore */ } }
  db = firebase.firestore();
  if (firebase.auth) auth = firebase.auth();
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');

/* ---------- dates & times ---------- */
function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayStr() { return dstr(new Date()); }
function parseD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDate(s, short) {
  return parseD(s).toLocaleDateString('en-GB', short
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + pad(m) + ' ' + ap;
}
function addMinutes(t, mins) {
  const [h, m] = t.split(':').map(Number);
  const tot = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return pad(Math.floor(tot / 60)) + ':' + pad(tot % 60);
}
function ts(date, time) { return new Date(date + 'T' + time + ':00').getTime(); }
function slotStart(s) { return ts(s.date, s.time); }
function slotEnd(s) { return ts(s.date, s.endTime || addMinutes(s.time, 120)); }
function slotLabel(s) { return fmtTime(s.time) + (s.endTime ? ' – ' + fmtTime(s.endTime) : ''); }
function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }

/* ---------- seats / status ---------- */
function seatInfo(s) {
  if (s.capacity == null) return { unlimited: true, full: false, left: null, text: 'Open seats' };
  const left = Math.max(0, s.capacity - (s.booked || 0));
  return { unlimited: false, full: left === 0, left, text: left === 0 ? 'Full' : left + ' of ' + s.capacity + ' seats left' };
}
function slotStatus(s, d, now = Date.now()) {
  if (d && d.closed) return 'closed';
  if (now >= slotStart(s)) return 'started';
  if (seatInfo(s).full) return 'full';
  return 'open';
}
function dateStatus(d, sl, now = Date.now()) {
  if (!sl.length) return 'empty';
  if (now > Math.max(...sl.map(slotEnd))) return 'completed';
  if (d.closed) return 'closed';
  if (sl.some(s => slotStatus(s, d, now) === 'open')) return d.date === todayStr() ? 'today' : 'open';
  const upcoming = sl.filter(s => now < slotStart(s));
  return upcoming.length ? 'full' : 'closed';
}
const STATUS = {
  open: ['Open', 'b-ok'], today: ['Today', 'b-blue'], full: ['Fully booked', 'b-warn'],
  closed: ['Closed', 'b-red'], completed: ['Completed', 'b-gray'], empty: ['No slots yet', 'b-gray']
};
function statusBadge(k) { const [t, c] = STATUS[k] || STATUS.empty; return `<span class="badge ${c}">${t}</span>`; }

/* ---------- Google Sheet sync (Apps Script web app) ----------
   The site only sends booking / exam-date IDs. The Apps Script reads the real
   records from Firestore and writes them to the sheet. Nothing is ever deleted
   from the sheet by the website. */
function sheetCall(url, payload, ms = 90000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: ctl.signal })
    .then(r => r.json()).finally(() => clearTimeout(t));
}
function sheetQueueRetry(url, payload) {
  try {
    const q = JSON.parse(localStorage.getItem('mb_sheet_q') || '[]');
    q.push({ url, payload }); localStorage.setItem('mb_sheet_q', JSON.stringify(q.slice(-100)));
  } catch (e) { /* ignore */ }
}
function sheetSend(url, payload) {            // fire-and-forget; retried later if the network fails
  if (!url) return;
  fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
    .catch(() => sheetQueueRetry(url, payload));
}
function sheetRetry() {
  let q = []; try { q = JSON.parse(localStorage.getItem('mb_sheet_q') || '[]'); } catch (e) { /* ignore */ }
  if (!q.length) return;
  localStorage.removeItem('mb_sheet_q');
  q.forEach(x => sheetSend(x.url, x.payload));
}
window.addEventListener('online', sheetRetry);

/* ---------- UI helpers ---------- */
function toast(msg, type = '') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3200);
}
function modal(html, opts = {}) {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="mdl${opts.wide ? ' wide' : ''}"><button class="mdl-x" aria-label="Close">✕</button><div class="mdl-body">${html}</div></div>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const api = {
    el: ov, body: ov.querySelector('.mdl-body'),
    $: s => ov.querySelector(s),
    close() { ov.remove(); if (!document.querySelector('.ov')) document.body.style.overflow = ''; if (opts.onClose) opts.onClose(); }
  };
  ov.querySelector('.mdl-x').onclick = api.close;
  ov.addEventListener('mousedown', e => { if (e.target === ov) api.close(); });
  return api;
}
function confirmBox(msg, { okText = 'Confirm', danger = false, title = 'Are you sure?' } = {}) {
  return new Promise(res => {
    const m = modal(`<h2 class="mh">${esc(title)}</h2><p class="msub" style="margin-top:8px">${msg}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
      <button class="btn btn-ghost" id="cbNo">Cancel</button>
      <button class="btn ${danger ? 'btn-primary' : 'btn-blue'}" id="cbYes">${esc(okText)}</button></div>`, { onClose: () => res(false) });
    m.$('#cbNo').onclick = () => { m.close(); };
    m.$('#cbYes').onclick = () => { res(true); m.el.remove(); if (!document.querySelector('.ov')) document.body.style.overflow = ''; };
  });
}
/* ---------- error handling: visitors never see technical errors ----------
   System errors (Firebase / network / code bugs) are saved to Firestore "errorLogs" – readable by admins only
   (Admin -> Error log). Visitors only get a short friendly sentence. Our own plain messages
   (e.g. "This slot just became full") are still shown because they are meant for the user. */
const _errSeen = new Set(); let _errCount = 0;
function logError(e, where) {
  try {
    if (!CONFIGURED || !db) return;
    const msg = String((e && e.message) || e || '').slice(0, 300), code = String((e && e.code) || '').slice(0, 60);
    const k = where + '|' + code + '|' + msg; if (_errSeen.has(k) || _errCount >= 10) return;   // de-duplicate + flood guard
    _errSeen.add(k); _errCount++;
    db.collection('errorLogs').add({ msg, code, where: String(where || '').slice(0, 40), page: (location.pathname.split('/').pop() || 'index').slice(0, 60),
      stack: String((e && e.stack) || '').slice(0, 1200), ua: (navigator.userAgent || '').slice(0, 160), at: Date.now(), read: false }).catch(() => { });
  } catch (x) { /* never throw from the logger */ }
}
window.addEventListener('error', ev => logError(ev.error || ev.message, 'window'));
window.addEventListener('unhandledrejection', ev => logError(ev.reason, 'promise'));
function errMsg(e) {
  if (!e) return 'Something went wrong. Please try again.';
  const system = !!e.code || e.constructor !== Error;      // Firebase / network / programming errors
  if (!system) return e.message;                           // our own user-facing messages
  logError(e, 'ui');
  if (e.code === 'permission-denied') return 'This action is not allowed right now.';
  return 'Something went wrong. Please try again in a moment.';
}
async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(o => {
      if (o.t === 'del') b.delete(o.ref);
      else if (o.t === 'upd') b.update(o.ref, o.data);
      else b.set(o.ref, o.data);
    });
    await b.commit();
  }
}
async function sha256(str) {
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return 'x' + (h >>> 0).toString(16);
}
function showConfigWarning() {
  const d = document.createElement('div');
  d.className = 'cfg-warn';
  d.innerHTML = '⚠️';
  document.body.prepend(d);
}
function logoHTML(size) { return `<span class="mb-logo" style="font-size:${size || 24}px">MENT<span class="o">O</span>BEAM</span>`; }

/* ---------- background decoration (triangles + swooshes from the brand image) ---------- */
function injectDeco() {
  if ($('.bg-deco')) return;
  const d = document.createElement('div');
  d.className = 'bg-deco';
  d.setAttribute('aria-hidden', 'true');
  d.innerHTML = `
  <svg class="dl" viewBox="0 0 300 500" preserveAspectRatio="xMinYMin slice"><defs>
    <linearGradient id="gL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9435a"/><stop offset="1" stop-color="#5b7fd6"/></linearGradient>
    <pattern id="pL" width="26" height="26" patternUnits="userSpaceOnUse"><polygon points="13,5 20,18 6,18" fill="url(#gL)"/></pattern>
    <linearGradient id="fL" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="mL"><rect width="300" height="500" fill="url(#fL)"/></mask></defs>
    <rect width="300" height="500" fill="url(#pL)" mask="url(#mL)"/></svg>
  <svg class="dr" viewBox="0 0 400 500" preserveAspectRatio="xMaxYMax slice"><defs>
    <linearGradient id="gR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5bc8f5"/><stop offset="1" stop-color="#e0233c"/></linearGradient>
    <pattern id="pR" width="26" height="26" patternUnits="userSpaceOnUse"><polygon points="13,5 20,18 6,18" fill="url(#gR)"/></pattern>
    <linearGradient id="fR" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="mR"><rect width="400" height="500" fill="url(#fR)"/></mask></defs>
    <rect width="400" height="500" fill="url(#pR)" mask="url(#mR)"/></svg>
  <svg class="sw-tr" viewBox="0 0 420 300" preserveAspectRatio="xMaxYMin meet">
    <path d="M420 0 L420 250 C380 130 290 40 170 0Z" fill="#1a56b0"/>
    <path d="M420 0 L420 190 C380 100 320 40 240 0Z" fill="#0b3d91"/>
    <path d="M420 0 L420 120 C400 60 360 20 320 0Z" fill="#06182f"/></svg>
  <svg class="sw-bl" viewBox="0 0 600 420" preserveAspectRatio="xMinYMax meet">
    <path d="M60 100 C220 250 400 360 600 420 L520 420 C340 350 180 250 60 100Z" fill="#c0001a" opacity=".9"/>
    <path d="M0 60 C120 200 260 330 420 420 L0 420Z" fill="#0b3d91"/>
    <path d="M0 120 C100 230 190 340 290 420 L0 420Z" fill="#06182f"/>
    <path d="M0 260 C90 330 180 380 260 420 L0 420Z" fill="#c0001a"/></svg>
  <svg class="sw-br" viewBox="0 0 800 260" preserveAspectRatio="xMaxYMax meet">
    <path d="M800 40 C600 200 300 240 0 260 L800 260Z" fill="#eceff3"/>
    <path d="M800 120 C620 230 330 250 120 260 L800 260Z" fill="#c0001a"/></svg>`;
  document.body.prepend(d);
}
