/* Rental space page (hall.html / lab.html / lounge.html) – one shared script, driven by window.SPACE_ID */
const SID = window.SPACE_ID;
let R = null, S = null, sel = { pkg: null, hours: 2, units: 1, extras: {} }, gi = 0;
let av = { date: '', keys: [] };   // blocks already taken for the chosen date (this space only)
let myIds = JSON.parse(localStorage.getItem('mb_rent') || '[]'), myDocs = {};
const app = $('#app');
const STB = { pending: ['Pending confirmation', 'b-warn'], confirmed: ['Confirmed', 'b-ok'], cancelled: ['Cancelled', 'b-red'], completed: ['Completed', 'b-gray'] };
const stBadge = s => { const [t, c] = STB[s] || STB.pending; return `<span class="badge ${c}">${t}</span>`; };

async function init() {
  injectDeco();
  $('#navLogo').innerHTML = '<img src="nav-logo-light.png" alt="MentoBeam"/>'; $('#footLogo').innerHTML = '<img src="nav-logo-light.png" alt="MentoBeam"/>'; $('#yr').textContent = new Date().getFullYear();
  R = await loadRentals(); S = R.spaces.find(x => x.id === SID);
  if (!S) { app.innerHTML = '<div class="empty"><p>Space not found.</p></div>'; return; }
  document.title = S.name + ' – MentoBeam';
  const first = S.packages.find(p => p.mode !== 'quote') || S.packages[0]; sel.pkg = first && first.id;
  sel.hours = first && first.hours ? first.hours : (first && first.minHours) || 2; sel.units = 1;
  render(); loadMy();
}
function gallery() {
  const ph = S.photos || []; if (!ph.length) return `<div class="rn-gal"><div class="main" style="display:flex;align-items:center;justify-content:center;font-size:80px;background:linear-gradient(135deg,#1a2338,#0b0f18)">${S.icon || ''}</div></div>`;
  return `<div class="rn-gal"><img class="main" id="gMain" src="${esc(ph[gi] || ph[0])}" alt=""/>${ph.length > 1 ? `<div class="th">${ph.map((p, i) => `<img src="${esc(p)}" data-i="${i}" class="${i === gi ? 'on' : ''}" alt=""/>`).join('')}</div>` : ''}</div>`;
}
function hero() {
  const w = S.name.split(' '), last = w.pop();
  $('#hTitle').innerHTML = (w.length ? esc(w.join(' ')) + ' ' : '') + '<span>' + esc(last) + '</span>';
  $('#hSub').textContent = S.tagline || '';
  $('#hBadge').innerHTML = S.available ? '<span class="badge b-ok">Available for booking</span>' : '<span class="badge b-gray">Not available right now</span>';
  $('#hCta').innerHTML = (S.available ? '<a class="btn btn-primary btn-lg" href="#book">Book now</a>' : '') + '<a class="btn btn-ghost btn-lg" href="#pk">View packages</a>';
  $('#hChips').innerHTML = (S.features || []).slice(0, 4).map(f => `<span>${esc(f)}</span>`).join('');
  const ph = S.photos && S.photos[0]; if (ph && String(ph).startsWith('data:')) document.body.style.setProperty('--hero', 'url("' + ph + '")');   // photo uploaded by admin
}
function render() {
  hero();
  const p = S.packages.find(x => x.id === sel.pkg);
  app.innerHTML = `<div class="rn-wrap">
  <a href="index.html" class="muted" style="display:inline-block;margin-top:18px;font-weight:700;text-decoration:none">← All services</a>
  <div class="rn-hero"><div>
    <p>${esc(S.desc || '')}</p>${S.idealFor ? `<p style="margin-top:10px"><b style="color:var(--red);font-size:12px;letter-spacing:.08em">IDEAL FOR</b><br>${esc(S.idealFor)}</p>` : ''}
    ${S.stats.length ? `<div class="rn-stats">${S.stats.map(x => `<div><b>${esc(x.v)}</b><span>${esc(x.l)}</span></div>`).join('')}</div>` : ''}
    <div class="rn-chips">${S.features.map(f => `<span class="rn-chip">${esc(f)}</span>`).join('')}</div></div>${gallery()}</div>

  <section class="rn-sec" id="pk"><h2>Packages & rates</h2>
    <div class="rn-opts">${S.packages.map(x => `<button type="button" class="rn-opt ${x.id === sel.pkg ? 'sel' : ''}" data-pk="${x.id}" ${S.available ? '' : 'style="cursor:default"'}>${x.badge ? `<span class="bd">${esc(x.badge)}</span>` : ''}<h4>${esc(x.name)}</h4><span class="pr">${esc(pkgPrice(x))}</span><small>${esc(x.unit || '')}</small><br><small>${esc(x.note || '')}</small></button>`).join('')}</div>
    ${S.extras.length ? `<h3 style="font-size:15px;margin-top:20px">Extras</h3><table class="rn-ex"><tbody>${S.extras.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(exLabel(x))}</td></tr>`).join('')}</tbody></table>` : ''}</section>

  <section class="rn-sec" id="book"><h2>Book ${esc(S.name)}</h2>
    ${S.available ? `<form class="rn-form" id="rf" novalidate>
      <div class="row2"><div class="field"><label>Date <span class="req">*</span></label><input type="date" id="fDate" min="${todayStr()}"/></div>
        <div class="field"><label>Start time <span class="req">*</span></label><select id="fStart">${timeOpts()}</select></div></div>
      <div id="avail"></div>
      <div id="dyn"></div>
      <div class="row2"><div class="field"><label>Number of guests <span class="req">*</span></label><input type="number" id="fGuests" min="1" ${S.maxGuests ? `max="${S.maxGuests}"` : ''} value="10"/></div>
        ${S.layouts && S.layouts.length ? `<div class="field"><label>Layout</label><select id="fLayout">${S.layouts.map(l => `<option>${esc(l)}</option>`).join('')}</select></div>` : '<div></div>'}</div>
      ${S.extras.length ? `<div class="field"><label>Extras</label>${S.extras.map(x => `<div class="rn-xrow"><label><input type="checkbox" data-ex="${x.id}"/> ${esc(x.name)} <span class="muted">· ${esc(exLabel(x))}</span></label>${x.per === 'hour' || x.per === 'unit_hour' ? `<input type="number" min="1" max="${x.max || 99}" value="1" data-exq="${x.id}" title="${esc(x.qtyLabel || 'Qty')}" disabled/>` : ''}</div>`).join('')}</div>` : ''}
      <div class="field"><label>Notes (optional)</label><textarea id="fNotes" placeholder="Purpose of the session, special requests, preferred days for monthly classes…"></textarea></div>
      <div class="row2"><div class="field"><label>Full name <span class="req">*</span></label><input id="fName" autocomplete="name"/></div><div class="field"><label>Phone <span class="req">*</span></label><input id="fPhone" type="tel" autocomplete="tel" placeholder="07X XXX XXXX"/></div></div>
      <div class="field"><label>Email <span class="req">*</span></label><input id="fEmail" type="email" autocomplete="email"/></div>
      <div class="rn-est" id="est"></div><div class="err" id="fErr"></div>
      <button class="btn btn-primary btn-block btn-lg" id="fBtn" type="submit">Send booking request</button>
      <p class="help" style="margin-top:8px">We confirm your date after reviewing the request. A 50% advance locks in the booking.</p></form>`
      : `<div class="rn-closed">Bookings for this space are closed right now. Contact us on WhatsApp <b>${esc(R.rental.whatsapp || '')}</b> and we will help you.</div>`}
  </section>
  <section class="rn-sec" id="my" hidden><h2>My ${esc(S.name)} bookings</h2><div class="rn-my" id="myList"></div></section>
  <section class="rn-sec"><div class="rn-terms"><h2>Booking terms</h2><ul>${(R.rental.terms || []).map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ul></div>
    <div class="rn-contact"><div><small style="opacity:.7;letter-spacing:.1em">WHATSAPP</small><br><b>${esc(R.rental.whatsapp || '')}</b><div style="font-size:13px;margin-top:4px">${esc(R.rental.email || '')}</div></div><div style="text-align:right;font-size:14px"><b style="font-size:15px;color:#ff8a98">${esc(R.rental.address || '')}</b><div style="opacity:.85">${esc(R.rental.hours || '')}</div></div></div></section></div>`;
  $$('#pk .rn-opt').forEach(b => b.onclick = () => { if (!S.available) return; keep(); sel.pkg = b.dataset.pk; const q = S.packages.find(x => x.id === sel.pkg); sel.hours = q.hours || q.minHours || 2; sel.units = 1; paintPk(); dyn(); est(); });
  $$('.rn-gal .th img').forEach(i => i.onclick = () => { gi = +i.dataset.i; $('#gMain').src = S.photos[gi]; $$('.rn-gal .th img').forEach((x, k) => x.classList.toggle('on', k === gi)); });
  if (S.available) { dyn(); est(); $('#fDate').addEventListener('change', refreshAvail); const f = $('#rf'); f.addEventListener('input', est); f.addEventListener('change', est); f.onsubmit = e => { e.preventDefault(); submit(); };
    $$('[data-ex]').forEach(c => c.onchange = () => { const q = $(`[data-exq="${c.dataset.ex}"]`); if (q) q.disabled = !c.checked; est(); });
    const pr = JSON.parse(localStorage.getItem('mb_profile') || '{}'); if (pr.name) $('#fName').value = pr.name; if (pr.email) $('#fEmail').value = pr.email; if (pr.phone) $('#fPhone').value = pr.phone; }
}
function paintPk() { $$('#pk .rn-opt').forEach(b => b.classList.toggle('sel', b.dataset.pk === sel.pkg)); }
function timeOpts(taken, cur) {   // start times: from the centre's open time to 30 min before closing (admin setting); booked start times are disabled
  const ch = centreHours(R.rental), tk = taken || [], lo = toMin(ch.open), hi = ch.set ? toMin(ch.close) - 30 : 20 * 60, list = [];
  for (let m = lo; m <= hi; m += 30) list.push(minStr(m));
  let pick = list.includes(cur) && !tk.includes(blockKey(toMin(cur))) ? cur : (list.includes('09:00') && !tk.includes('0900') ? '09:00' : (list.find(t => !tk.includes(blockKey(toMin(t)))) || list[0]));
  return list.map(t => { const bk = tk.includes(blockKey(toMin(t))); return `<option value="${t}" ${t === pick ? 'selected' : ''} ${bk ? 'disabled' : ''}>${fmtTime(t)}${bk ? ' – booked' : ''}</option>`; }).join('');
}
const clash = (date, st, end) => !!(date && st && end && av.date === date && blocksOf(st, end).some(k => av.keys.includes(k)));
const hoursText = ch => fmtTime(ch.open) + ' – ' + fmtTime(ch.close);
const outOfHours = (ch, st, end) => ch.set && (toMin(st) < toMin(ch.open) || (end ? toMin(end) > toMin(ch.close) : toMin(st) >= toMin(ch.close)));
/* reads the taken hours of the chosen date and updates the availability panel + start times */
async function refreshAvail() {
  const d = $('#fDate'); if (!d) return; const date = d.value;
  if (!date) { av = { date: '', keys: [] }; paintAvail(); est(); return; }
  const keys = await loadAvail(SID, date); if ($('#fDate').value !== date) return;
  av = { date, keys }; paintAvail(); est();
}
function paintAvail() {
  const box = $('#avail'), st = $('#fStart'); if (!box || !st) return;
  st.innerHTML = timeOpts(av.date ? av.keys : [], st.value);
  if (!av.date) { box.innerHTML = ''; return; }
  const ch = centreHours(R.rental), lo = toMin(ch.open), hi = toMin(ch.close), rows = { booked: [], free: [] };
  for (let m = lo; m < hi; m += 30) { const k = av.keys.includes(blockKey(m)) ? 'booked' : 'free', r = rows[k], last = r[r.length - 1]; if (last && last[1] === m) last[1] = m + 30; else r.push([m, m + 30]); }
  const chip = (r, c) => `<span class="badge ${c}" style="margin:2px 6px 2px 0">${fmtTime(minStr(r[0]))} – ${fmtTime(minStr(r[1]))}</span>`;
  box.innerHTML = `<div class="help" style="margin:-4px 0 12px"><b>${esc(S.name)} on ${fmtDate(av.date)}</b> (${hoursText(ch)})<br>`
    + (rows.free.length ? 'Available: ' + rows.free.map(r => chip(r, 'b-ok')).join('') : '<span style="color:var(--red);font-weight:700">Fully booked for this day – please choose another date.</span>')
    + (rows.booked.length ? '<br>Already booked: ' + rows.booked.map(r => chip(r, 'b-red')).join('') : '') + '</div>';
}
function keep() { const h = $('#fHours'), u = $('#fUnits'); if (h) sel.hours = +h.value || sel.hours; if (u) sel.units = +u.value || 1; }
function dyn() {
  const p = S.packages.find(x => x.id === sel.pkg), box = $('#dyn'); if (!box || !p) return;
  let h = '';
  if (p.mode === 'hourly' || p.mode === 'unit_hour') h += `<div class="row2"><div class="field"><label>Number of hours <span class="req">*</span></label><input type="number" id="fHours" min="${p.minHours || 1}" max="12" value="${Math.max(sel.hours, p.minHours || 1)}"/></div>`
    + (p.mode === 'unit_hour' ? `<div class="field"><label>${esc(p.unitLabel || 'Units')} <span class="req">*</span></label><input type="number" id="fUnits" min="1" max="${p.maxUnits || 99}" value="${sel.units}"/></div>` : '<div></div>') + '</div>';
  else if (p.mode === 'fixed') h += `<p class="help" style="margin:-4px 0 12px">This package is for <b>${p.hours || ''} hours</b>${p.hours ? ' – ends at the time shown below.' : '.'}</p>`;
  else h += `<p class="help" style="margin:-4px 0 12px">Rate is agreed with us. Use the notes box to tell us what you need.</p>`;
  box.innerHTML = h;
}
function vals() {
  const p = S.packages.find(x => x.id === sel.pkg); keep();
  const ex = {}; $$('[data-ex]').forEach(c => { if (c.checked) { const q = $(`[data-exq="${c.dataset.ex}"]`); ex[c.dataset.ex] = q ? Math.max(1, +q.value || 1) : 1; } });
  const hours = p.mode === 'fixed' ? (p.hours || 0) : (p.mode === 'quote' ? 0 : Math.max(+sel.hours || 0, p.minHours || 1));
  return { p, ex, hours, units: p.mode === 'unit_hour' ? Math.max(1, +sel.units || 1) : 1 };
}
function est() {
  const box = $('#est'); if (!box) return; const v = vals(); const e = calcEstimate(S, { pkg: sel.pkg, hours: v.hours, units: v.units, extras: v.ex });
  const date = $('#fDate').value, st = $('#fStart').value, end = v.hours ? addMinutes(st, v.hours * 60) : '';
  let warn = ''; if (date) { const dow = parseD(date).getDay(); if (dow === 0 || dow === 6) warn += '<div class="help" style="color:#a86f00">Weekend bookings are on request, subject to availability.</div>'; }
  const ch = centreHours(R.rental);
  if (!ch.set && end && (st < '09:00' || end > '18:00')) warn += '<div class="help" style="color:#a86f00">Our normal hours are 9.00 am to 6.00 pm – other times are on request.</div>';
  if (outOfHours(ch, st, end)) warn += '<div class="help" style="color:var(--red);font-weight:700">Bookings are only accepted between ' + hoursText(ch) + '. Please choose a time inside our opening hours.</div>';
  if (clash(date, st, end)) warn += '<div class="help" style="color:var(--red);font-weight:700">Already Booked by Another Person – part of this time is taken. Please see the available times above.</div>';
  box.innerHTML = `<b>Summary</b>${end ? `<div class="l"><span>Time</span><span>${fmtTime(st)} – ${fmtTime(end)}</span></div>` : ''}${e.lines.map(l => `<div class="l"><span>${esc(l[0])}</span><span>${l[1] == null ? 'On request' : rs(l[1])}</span></div>`).join('')}
    <div class="t l"><span>Estimated total</span><span>${e.lines.some(l => l[1] != null) ? rs(e.total) : '—'}${e.quote && e.total ? ' + on request items' : ''}</span></div>${warn}<div class="help">Final price is confirmed by Mentobeam.</div>`;
}
function collect() {
  const err = $('#fErr'), v = vals(), e = calcEstimate(S, { pkg: sel.pkg, hours: v.hours, units: v.units, extras: v.ex });
  const date = $('#fDate').value, start = $('#fStart').value, name = $('#fName').value.trim(), email = $('#fEmail').value.trim(), phone = $('#fPhone').value.trim(), guests = +$('#fGuests').value || 0;
  err.textContent = '';
  if (!date || date < todayStr()) { err.textContent = 'Please choose a date (today or later).'; return null; }
  if (v.p.mode !== 'quote' && v.hours <= 0) { err.textContent = 'Please enter the number of hours.'; return null; }
  const ch = centreHours(R.rental), endT = v.hours ? addMinutes(start, v.hours * 60) : '';
  if (outOfHours(ch, start, endT)) { err.textContent = 'Bookings are only accepted between ' + hoursText(ch) + '. Please choose a time inside our opening hours.'; return null; }
  if (clash(date, start, endT)) { err.textContent = 'Already Booked by Another Person'; return null; }
  if (guests < 1 || (S.maxGuests && guests > S.maxGuests)) { err.textContent = 'Guests must be between 1 and ' + (S.maxGuests || 'the venue limit') + '.'; return null; }
  if (name.length < 2) { err.textContent = 'Please enter your name.'; return null; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email.'; return null; }
  if (!/^[+\d][\d\s\-]{6,18}$/.test(phone)) { err.textContent = 'Please enter a valid phone number.'; return null; }
  const exList = S.extras.filter(x => v.ex[x.id]).map(x => ({ id: x.id, name: x.name, qty: v.ex[x.id] }));
  const est2 = e.lines.some(l => l[1] != null) ? e.total : 0, pct = advPct();
  return { spaceId: S.id, spaceName: S.name, packageId: v.p.id, packageName: v.p.name, date, startTime: start, endTime: v.hours ? addMinutes(start, v.hours * 60) : '', hours: v.hours, units: v.units, guests,
    layout: ($('#fLayout') || {}).value || '', extras: exList, extrasText: exList.map(x => x.name + (x.qty > 1 ? ' x' + x.qty : '')).join('; '),
    estimate: est2, quoteItems: !!e.quote, advanceDue: advanceOf(est2, pct), advancePct: pct, paidClaim: false,
    name, email, phone, notes: $('#fNotes').value.trim().slice(0, 600), status: 'pending', createdAt: Date.now(), blocks: endT ? blocksOf(start, endT) : [] };
}
const advPct = () => Number(R.rental.advancePct) || 50;
const refundDays = () => (R.rental.refundDays === '' || R.rental.refundDays == null) ? 7 : Number(R.rental.refundDays);
const bankReady = () => !!(R.rental.bankAccNo && R.rental.bankAccName);
const waNote = id => waLink(R.rental.whatsapp, 'Hi, regarding my ' + S.name + ' booking. Code: ' + id);

/* step 1: validated form -> payment step (the booking is only placed after the advance is paid) */
async function submit() {
  await refreshAvail();   // always check the latest taken hours first, so nobody pays for a slot that was just taken
  const data = collect(); if (!data) return;
  if (data.advanceDue <= 0) {   // price is "on request" – nothing to pay yet
    if (!await confirmBox('The price for this booking is agreed with us first, so there is no advance to pay right now. We will contact you with the price and payment details.', { okText: 'Send request', title: 'Send booking request?' })) return;
    return place(data, null, null);
  }
  if (!bankReady()) { modal(`<div class="rn-closed" style="margin:0">Online payment details are not available yet. Please contact us on WhatsApp <b>${esc(R.rental.whatsapp || '')}</b> to place this booking.</div><a class="btn btn-primary btn-block" style="margin-top:12px" target="_blank" rel="noopener" href="${waLink(R.rental.whatsapp, 'Hi, I would like to book ' + S.name + ' on ' + data.date)}">Message us on WhatsApp</a>`); return; }
  payStep(data);
}
function payStep(data) {
  const r = R.rental; let slip = null;
  const row = (l, v, cp) => `<div class="rn-bk"><span>${l}</span><b>${esc(v)}</b>${cp ? `<button type="button" class="btn btn-ghost btn-sm" data-cp="${esc(v)}">Copy</button>` : ''}</div>`;
  const m = modal(`<div class="rn-pay"><h2 class="mh" style="padding:0">Pay the advance to place your booking</h2><p class="msub">Your booking is placed after you pay the ${data.advancePct}% advance by bank transfer and tell us below.</p>
    <div class="rn-paybox"><div><b>${esc(S.name)}</b> · ${esc(data.packageName)}<br>${fmtDate(data.date)}${data.endTime ? ' · ' + fmtTime(data.startTime) + ' – ' + fmtTime(data.endTime) : ''}<br><span class="muted">Estimated total ${rs(data.estimate)}${data.quoteItems ? ' + on-request items' : ''}</span></div>
      <div class="rn-adv"><span>Advance to pay (${data.advancePct}%)</span><b>${rs(data.advanceDue)}</b><span>Balance ${rs(Math.max(0, data.estimate - data.advanceDue))} – pay on or before your booking date</span></div></div>
    <h3 style="font-size:15px;margin:14px 0 6px">Bank transfer details</h3>
    ${row('Bank', r.bankName)}${r.bankBranch ? row('Branch', r.bankBranch) : ''}${row('Account name', r.bankAccName)}${row('Account number', r.bankAccNo, true)}${row('Reference', data.name + ' – ' + data.phone)}
    ${r.payNote ? `<p class="help" style="margin-top:6px">${esc(r.payNote)}</p>` : ''}
    <h3 style="font-size:15px;margin:16px 0 6px">Upload your payment slip</h3>
    <input type="file" id="slipF" accept="image/*,application/pdf"/><div id="slipPrev" class="help"></div>
    <p class="help">Photo / screenshot (JPG, PNG) or a small PDF. You can also attach it later from “My bookings”, but we cannot confirm the booking until we receive it.</p>
    <div class="err" id="payErr"></div>
    <button class="btn btn-primary btn-block btn-lg" id="payBtn" type="button">I made the advance payment</button><button class="btn btn-ghost btn-block" id="payBack" type="button" style="margin-top:8px">Back</button></div>`);
  m.$('#payBack').onclick = () => m.close();
  m.el.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.cp); toast('Copied', 'ok'); } catch (e) { /* ignore */ } });
  m.$('#slipF').onchange = async e => {
    const f = e.target.files[0], pr = m.$('#slipPrev'), er = m.$('#payErr'); er.textContent = ''; slip = null; pr.textContent = ''; if (!f) return;
    try { slip = await slipToData(f); pr.innerHTML = '✅ ' + esc(slip.name) + ' (' + Math.round(slip.size / 1024) + ' KB)' + (slip.type.startsWith('image') ? `<br><img src="${slip.data}" alt="" style="max-height:120px;border-radius:10px;margin-top:6px"/>` : ''); }
    catch (x) { er.textContent = errMsg(x); e.target.value = ''; }
  };
  m.$('#payBtn').onclick = async () => {
    if (!slip && !await confirmBox('You have not attached the payment slip. You can attach it later from “My bookings”, but we cannot confirm your booking until we receive it. Place the booking now?', { okText: 'Place booking', title: 'No slip attached' })) return;
    const b = m.$('#payBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Placing booking...';
    const ok = await place(data, slip, m); if (!ok) { b.disabled = false; b.textContent = 'I made the advance payment'; }
  };
}
/* step 2: write the booking (+ slip) in ONE atomic batch */
async function place(data, slip, pm) {
  const err = pm ? pm.$('#payErr') : $('#fErr'), ref = db.collection('rentBookings').doc();
  if (slip) { data.paidClaim = true; data.slipAt = Date.now(); data.slipName = String(slip.name || 'slip').slice(0, 100); }
  try {
    const b = db.batch(); b.set(ref, data);
    if (slip) b.set(db.collection('rentSlips').doc(ref.id), { data: slip.data, type: slip.type, name: data.slipName, size: slip.size || 0, at: Date.now(), kind: 'advance' });
    lockOps(b, data.spaceId, data.date, data.blocks, ref.id, false);   // reserves the hours in the same atomic write - fails if someone else already has any of them
    await b.commit();
  } catch (x) {
    if (data.blocks.length) { const taken = await loadAvail(data.spaceId, data.date); if (data.blocks.some(k => taken.includes(k))) { av = { date: data.date, keys: taken }; paintAvail(); est(); err.textContent = 'Already Booked by Another Person' + (pm ? ' – please press Back and choose a different time.' : ''); return false; } }
    err.textContent = 'Sorry, the booking could not be placed. ' + errMsg(x); return false; }
  localStorage.setItem('mb_profile', JSON.stringify({ name: data.name, email: data.email, phone: data.phone }));
  if (R.site.sheetOn && R.site.sheetUrl) sheetSend(R.site.sheetUrl, { action: 'rent', rentIds: [ref.id], records: { [ref.id]: flat(data) } });
  myIds.push(ref.id); localStorage.setItem('mb_rent', JSON.stringify(myIds)); myDocs[ref.id] = { id: ref.id, ...data }; renderMy();
  if (pm) pm.close();
  const m = modal(`<div style="text-align:center"><div style="font-size:46px">✅</div><h2 class="mh" style="padding:0">Booking request placed!</h2>
    <p class="msub">Thank you, ${esc(data.name.split(' ')[0])}. ${data.advanceDue > 0 ? (slip ? 'We received your payment slip and will verify it and confirm your booking.' : 'Please attach your payment slip from “My bookings” so we can verify your payment and confirm.') : 'We will contact you with the price and payment details.'}</p>
    <p><b>${esc(S.name)}</b> · ${esc(data.packageName)}<br>${fmtDate(data.date)}${data.endTime ? ' · ' + fmtTime(data.startTime) + ' – ' + fmtTime(data.endTime) : ''}</p><p class="help" style="margin:8px 0">Booking code: <span style="font-family:monospace">${ref.id}</span></p>
    <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="${waNote(ref.id)}">Message us on WhatsApp</a><button class="btn btn-blue btn-block" style="margin-top:8px" id="okd">Done</button></div>`);
  m.$('#okd').onclick = () => { m.close(); location.hash = '#my'; };
  const f = $('#rf'); if (f) { f.reset(); dyn(); av = { date: '', keys: [] }; paintAvail(); est(); }
  return true;
}
const flat = d => { const o = Object.assign({}, d); delete o.extras; delete o.blocks; return o; };
async function loadMy() {
  const miss = myIds.filter(id => !(id in myDocs));
  await Promise.all(miss.map(async id => { try { const s = await db.collection('rentBookings').doc(id).get(); myDocs[id] = s.exists ? { id, ...s.data() } : null; } catch (e) { myDocs[id] = undefined; } }));
  renderMy();
}
function payLine(b) {
  const pi = payInfo(b); let h = '';
  if (pi.total > 0 && b.status !== 'cancelled') {
    h += `<div class="rn-pl">Total <b>${rs(pi.total)}</b> · Advance ${rs(pi.advance)} ${pi.advPaid ? '<span class="badge b-ok">✓ paid</span>' : (b.slipAt ? '<span class="badge b-blue">slip received</span>' : (pi.advance > 0 ? '<span class="badge b-warn">slip not attached</span>' : ''))}</div>`;
    if (pi.advPaid || pi.advance === 0) h += `<div class="rn-pl">Balance <b>${rs(pi.balance)}</b> ${pi.balPaid ? '<span class="badge b-ok">✓ paid – transaction closed</span>' : (b.balanceSlipAt ? '<span class="badge b-blue">slip received – being verified</span>' : '<span class="badge b-warn">due on or before ' + fmtDate(b.date) + '</span>')}</div>`;
    if (!pi.advPaid && pi.advance > 0 && !b.slipAt) h += `<div class="rn-remind">⚠ Please attach your bank slip so we can verify your advance payment and confirm your booking. <button class="btn btn-primary btn-sm" data-sl="${b.id}">Attach advance slip</button></div>`;
    if ((pi.advPaid || pi.advance === 0) && !pi.balPaid && pi.balance > 0 && !b.balanceSlipAt && b.status === 'confirmed') h += `<div class="rn-remind">Pay the balance <b>${rs(pi.balance)}</b> by bank transfer on or before your booking date, then attach the slip. <button class="btn btn-primary btn-sm" data-bal="${b.id}">Pay balance / attach slip</button></div>`;
  }
  if (b.refundStatus === 'requested') h += `<div class="rn-pl"><span class="badge b-warn">Refund requested</span> ${rs(b.refundAmount || 0)} – to be paid within ${R.rental.refundHours || 48} hours. We will message you on WhatsApp.</div>`;
  if (b.refundStatus === 'paid') h += `<div class="rn-pl"><span class="badge b-ok">✓ Refund paid</span> ${rs(b.refundPaidAmount != null ? b.refundPaidAmount : (b.refundAmount || 0))} – please check your bank account.</div>`;
  if (b.refundStatus === 'rejected') h += `<div class="rn-pl"><span class="badge b-red">Refund not approved</span> ${esc(b.refundRejectReason || '')}</div>`;
  return h;
}
const adminPaid = b => b.advanceVerified || b.paidClaim;
function renderMy() {
  const list = myIds.map(id => myDocs[id]).filter(b => b && b.spaceId === SID).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  $('#my').hidden = !list.length; if (!list.length) return;
  $('#myList').innerHTML = list.map(b => {
    const can = (b.status === 'pending' || b.status === 'confirmed') && b.date >= todayStr() && !b.closed, refundable = can && adminPaid(b) && refundBase(b) > 0 && refundWithin(b, refundDays());
    const askRefund = b.status === 'cancelled' && b.cancelledBy === 'admin' && !b.refundStatus && adminPaid(b) && refundBase(b) > 0;
    return `<div><div><b>${fmtDate(b.date)}</b>${b.endTime ? ' · ' + fmtTime(b.startTime) + ' – ' + fmtTime(b.endTime) : ''}<br><span class="muted">${esc(b.packageName)}</span><br><span style="font-family:monospace;font-size:11px;color:var(--muted)">${b.id}</span>${payLine(b)}</div>
    <div style="text-align:right">${stBadge(b.status)}${can ? `<br><button class="btn btn-ghost btn-sm" style="margin-top:8px" data-c="${b.id}">${refundable ? 'Cancel and request refund' : 'Cancel booking'}</button>` : ''}${askRefund ? `<br><button class="btn btn-primary btn-sm" style="margin-top:8px" data-rf="${b.id}">Request to refund</button>` : ''}</div></div>`; }).join('');
  $$('[data-c]').forEach(x => x.onclick = () => cancelMy(x.dataset.c));
  $$('[data-sl]').forEach(x => x.onclick = () => attachSlip(x.dataset.sl, 'advance'));
  $$('[data-bal]').forEach(x => x.onclick = () => balanceStep(x.dataset.bal));
  $$('[data-rf]').forEach(x => x.onclick = () => refundForm(myDocs[x.dataset.rf], false));
}
/* attach a payment slip later: kind 'advance' (slip id = booking id) or 'balance' (slip id = booking id + _bal) */
function attachSlip(id, kind, file) {
  const run1 = async f => {
    try { toast('Uploading slip…'); const sl = await slipToData(f), name = String(sl.name).slice(0, 100), at = Date.now(), b = db.batch(), bal = kind === 'balance';
      b.set(db.collection('rentSlips').doc(bal ? id + '_bal' : id), { data: sl.data, type: sl.type, name, size: sl.size || 0, at, kind: bal ? 'balance' : 'advance' });
      b.update(db.collection('rentBookings').doc(id), bal ? { balanceSlipAt: at, balanceSlipName: name } : { slipAt: at, slipName: name, paidClaim: true }); await b.commit();
      Object.assign(myDocs[id], bal ? { balanceSlipAt: at, balanceSlipName: name } : { slipAt: at, slipName: name, paidClaim: true }); renderMy(); toast('Slip attached – thank you!', 'ok');
      if (R.site.sheetOn && R.site.sheetUrl) sheetSend(R.site.sheetUrl, { action: 'rent', rentIds: [id], records: { [id]: flat(myDocs[id]) } });
      return true;
    } catch (e) { toast(errMsg(e), 'err'); return false; } };
  if (file) return run1(file);
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.onchange = () => { if (inp.files[0]) run1(inp.files[0]); }; inp.click();
}
/* balance payment: bank details + slip, on or before the booking date */
function balanceStep(id) {
  const b = myDocs[id], pi = payInfo(b), r = R.rental; let slip = null;
  const row = (l, v, cp) => `<div class="rn-bk"><span>${l}</span><b>${esc(v)}</b>${cp ? `<button type="button" class="btn btn-ghost btn-sm" data-cp="${esc(v)}">Copy</button>` : ''}</div>`;
  const m = modal(`<h2 class="mh" style="padding:0">Pay the balance</h2><p class="msub">Pay the remaining balance by bank transfer on or before <b>${fmtDate(b.date)}</b>, then attach the slip.</p>
    <div class="rn-paybox"><div><b>${esc(b.spaceName)}</b> · ${esc(b.packageName)}<br><span class="muted">Total ${rs(pi.total)} · Advance paid ${rs(pi.advance)}</span></div><div class="rn-adv"><span>Balance to pay</span><b>${rs(pi.balance)}</b></div></div>
    <h3 style="font-size:15px;margin:14px 0 6px">Bank transfer details</h3>${r.bankAccNo ? row('Bank', r.bankName) + (r.bankBranch ? row('Branch', r.bankBranch) : '') + row('Account name', r.bankAccName) + row('Account number', r.bankAccNo, true) + row('Reference', b.name + ' – ' + b.phone) : '<p class="help">Please contact us on WhatsApp for the bank details.</p>'}
    <h3 style="font-size:15px;margin:16px 0 6px">Upload the balance slip</h3><input type="file" id="bslipF" accept="image/*,application/pdf"/><div id="bslipPrev" class="help"></div><div class="err" id="bErr"></div>
    <button class="btn btn-primary btn-block btn-lg" id="bGo" type="button">I paid the balance</button><button class="btn btn-ghost btn-block" id="bBack" type="button" style="margin-top:8px">Back</button>`);
  m.$('#bBack').onclick = () => m.close();
  m.el.querySelectorAll('[data-cp]').forEach(x => x.onclick = () => { try { navigator.clipboard.writeText(x.dataset.cp); toast('Copied', 'ok'); } catch (e) { /* ignore */ } });
  m.$('#bslipF').onchange = async e => { const f = e.target.files[0]; slip = null; m.$('#bErr').textContent = ''; if (!f) return; try { slip = f; await slipToData(f); m.$('#bslipPrev').textContent = '✅ ' + f.name; } catch (x) { slip = null; m.$('#bErr').textContent = errMsg(x); e.target.value = ''; } };
  m.$('#bGo').onclick = async () => { if (!slip) { m.$('#bErr').textContent = 'Please attach the balance slip.'; return; } const bt = m.$('#bGo'); bt.disabled = true; bt.innerHTML = '<span class="spin"></span> Sending...'; const ok = await attachSlip(id, 'balance', slip); if (ok) m.close(); else { bt.disabled = false; bt.textContent = 'I paid the balance'; } };
}
async function cancelMy(id) {
  const b = myDocs[id]; if (!b) return;
  const paid = adminPaid(b) && refundBase(b) > 0, refundable = paid && refundWithin(b, refundDays());
  if (refundable) return refundForm(b, true);
  const ok = await confirmBox(paid ? 'This booking is outside the refund period (refunds are only available if the booking was confirmed within ' + refundDays() + ' day(s) of being made and is cancelled within ' + refundDays() + ' day(s) of us confirming it), so the advance is not refundable. Cancel anyway?' : 'Cancel this booking?', { okText: 'Yes, cancel', danger: true, title: 'Cancel this booking?' }); if (!ok) return;
  try { const up = { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'customer' }, bt = db.batch(); bt.update(db.collection('rentBookings').doc(id), up); lockOps(bt, b.spaceId, b.date, b.blocks, id, true); await bt.commit(); Object.assign(b, up); renderMy(); refreshAvail(); toast('Booking cancelled', 'ok');
    if (R.site.sheetOn && R.site.sheetUrl) sheetSend(R.site.sheetUrl, { action: 'rent', rentIds: [id], records: { [id]: flat(b) } });
  } catch (e) { toast(errMsg(e), 'err'); }
}
/* "Request to refund" form. cancelNow = cancel the booking in the same step (customer cancelling); false = booking was already cancelled by the organiser */
function refundForm(b, cancelNow) {
  const hrs = R.rental.refundHours || 48, amt = refundBase(b);
  const m = modal(`<h2 class="mh" style="padding:0">Request to refund</h2><p class="msub">${cancelNow ? 'Your booking will be cancelled and your ' : 'Your '}advance of <b>${rs(amt)}</b> will be refunded to the bank account below. <b>The refund is paid within ${hrs} hours</b> and we will confirm it on your WhatsApp.</p>
    <div class="field"><label>Bank <span class="req">*</span></label><select id="rfBank"><option value="">Select your bank</option>${LK_BANKS.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Account name <span class="req">*</span></label><input id="rfName" value="${esc(b.name)}"/></div>
    <div class="field"><label>Account number <span class="req">*</span></label><input id="rfNo" inputmode="numeric" placeholder="e.g. 1234567890"/></div>
    <div class="field"><label>WhatsApp number <span class="req">*</span></label><input id="rfWa" type="tel" value="${esc(b.phone)}" placeholder="07X XXX XXXX"/></div>
    <div class="field"><label>Note (optional)</label><textarea id="rfNote" placeholder="Reason for cancelling, or anything we should know"></textarea></div>
    <div class="err" id="rfErr"></div><button class="btn btn-primary btn-block btn-lg" id="rfGo">${cancelNow ? 'Cancel booking & request refund' : 'Send refund request'}</button><button class="btn btn-ghost btn-block" id="rfBack" style="margin-top:8px">${cancelNow ? 'Keep my booking' : 'Close'}</button>`);
  m.$('#rfBack').onclick = () => m.close();
  m.$('#rfGo').onclick = async () => {
    const bank = m.$('#rfBank').value, nm = m.$('#rfName').value.trim(), no = m.$('#rfNo').value.replace(/[\s-]/g, ''), wa = waDigits(m.$('#rfWa').value), er = m.$('#rfErr'); er.textContent = '';
    if (!bank) { er.textContent = 'Please select your bank.'; return; } if (nm.length < 2) { er.textContent = 'Please enter the account name.'; return; }
    if (!/^\d{6,20}$/.test(no)) { er.textContent = 'Please enter a valid account number (digits only).'; return; } if (!/^\d{9,15}$/.test(wa)) { er.textContent = 'Please enter a valid WhatsApp number.'; return; }
    const up = { refundStatus: 'requested', refundBank: bank, refundAccName: nm.slice(0, 100), refundAccNo: no, refundWhatsapp: wa, refundNote: m.$('#rfNote').value.trim().slice(0, 300), refundAmount: amt, refundRequestedAt: Date.now() };
    if (cancelNow) Object.assign(up, { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: 'customer' });
    const btn = m.$('#rfGo'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sending...';
    try { const bt = db.batch(); bt.update(db.collection('rentBookings').doc(b.id), up); if (cancelNow) lockOps(bt, b.spaceId, b.date, b.blocks, b.id, true); await bt.commit(); Object.assign(b, up); m.close(); renderMy(); refreshAvail();
      const m2 = modal(`<div style="text-align:center"><div style="font-size:46px">✅</div><h2 class="mh" style="padding:0">Refund requested</h2><p class="msub">${cancelNow ? 'Your booking is cancelled. ' : ''}Your refund of <b>${rs(amt)}</b> will be paid within <b>${hrs} hours</b>. We will send a confirmation to your WhatsApp (${esc(wa)}) once it is done.</p><button class="btn btn-blue btn-block" id="okr">OK</button></div>`); m2.$('#okr').onclick = m2.close;
      if (R.site.sheetOn && R.site.sheetUrl) sheetSend(R.site.sheetUrl, { action: 'rent', rentIds: [b.id], records: { [b.id]: flat(b) } });
    } catch (e) { er.textContent = errMsg(e); btn.disabled = false; btn.textContent = cancelNow ? 'Cancel booking & request refund' : 'Send refund request'; }
  };
}
init();