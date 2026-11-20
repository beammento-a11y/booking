/* Rental space page (hall.html / lab.html / lounge.html) – one shared script, driven by window.SPACE_ID */
const SID = window.SPACE_ID;
let R = null, S = null, sel = { pkg: null, hours: 2, units: 1, extras: {} }, gi = 0;
let myIds = JSON.parse(localStorage.getItem('mb_rent') || '[]'), myDocs = {};
const app = $('#app');
const STB = { pending: ['Pending confirmation', 'b-warn'], confirmed: ['Confirmed', 'b-ok'], cancelled: ['Cancelled', 'b-red'], completed: ['Completed', 'b-gray'] };
const stBadge = s => { const [t, c] = STB[s] || STB.pending; return `<span class="badge ${c}">${t}</span>`; };

async function init() {
  injectDeco();
  $('#navLogo').innerHTML = '<img src="nav-logo.png" alt="MentoBeam"/>'; $('#footLogo').innerHTML = '<img src="nav-logo.png" alt="MentoBeam"/>'; $('#yr').textContent = new Date().getFullYear();
  R = await loadRentals(); S = R.spaces.find(x => x.id === SID);
  if (!S) { app.innerHTML = '<div class="empty"><p>Space not found.</p></div>'; return; }
  document.title = S.name + ' – MentoBeam';
  const first = S.packages.find(p => p.mode !== 'quote') || S.packages[0]; sel.pkg = first && first.id;
  sel.hours = first && first.hours ? first.hours : (first && first.minHours) || 2; sel.units = 1;
  render(); loadMy();
}
function gallery() {
  const ph = S.photos || []; if (!ph.length) return `<div class="rn-gal"><div class="main" style="display:flex;align-items:center;justify-content:center;font-size:80px;background:linear-gradient(135deg,var(--navy),var(--blue))">${S.icon || ''}</div></div>`;
  return `<div class="rn-gal"><img class="main" id="gMain" src="${esc(ph[gi] || ph[0])}" alt=""/>${ph.length > 1 ? `<div class="th">${ph.map((p, i) => `<img src="${esc(p)}" data-i="${i}" class="${i === gi ? 'on' : ''}" alt=""/>`).join('')}</div>` : ''}</div>`;
}
function render() {
  const p = S.packages.find(x => x.id === sel.pkg);
  app.innerHTML = `<div class="rn-wrap">
  <a href="index.html" class="muted" style="display:inline-block;margin-top:18px;font-weight:700;text-decoration:none">← All services</a>
  <div class="rn-hero"><div><span class="badge ${S.available ? 'b-ok' : 'b-gray'}">${S.available ? 'Available for booking' : 'Not available right now'}</span>
    <h1 style="font-size:clamp(30px,5vw,44px);margin:10px 0 6px">${esc(S.name)}</h1><p style="color:var(--red);font-weight:700">${esc(S.tagline || '')}</p>
    <p style="margin-top:10px">${esc(S.desc || '')}</p>${S.idealFor ? `<p style="margin-top:10px"><b style="color:var(--red);font-size:12px;letter-spacing:.08em">IDEAL FOR</b><br>${esc(S.idealFor)}</p>` : ''}
    ${S.stats.length ? `<div class="rn-stats">${S.stats.map(x => `<div><b>${esc(x.v)}</b><span>${esc(x.l)}</span></div>`).join('')}</div>` : ''}
    <div class="rn-chips">${S.features.map(f => `<span class="rn-chip">${esc(f)}</span>`).join('')}</div></div>${gallery()}</div>

  <section class="rn-sec" id="pk"><h2>Packages & rates</h2>
    <div class="rn-opts">${S.packages.map(x => `<button type="button" class="rn-opt ${x.id === sel.pkg ? 'sel' : ''}" data-pk="${x.id}" ${S.available ? '' : 'style="cursor:default"'}>${x.badge ? `<span class="bd">${esc(x.badge)}</span>` : ''}<h4>${esc(x.name)}</h4><span class="pr">${esc(pkgPrice(x))}</span><small>${esc(x.unit || '')}</small><br><small>${esc(x.note || '')}</small></button>`).join('')}</div>
    ${S.extras.length ? `<h3 style="font-size:15px;margin-top:20px">Extras</h3><table class="rn-ex"><tbody>${S.extras.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(exLabel(x))}</td></tr>`).join('')}</tbody></table>` : ''}</section>

  <section class="rn-sec" id="book"><h2>Book ${esc(S.name)}</h2>
    ${S.available ? `<form class="rn-form" id="rf" novalidate>
      <div class="row2"><div class="field"><label>Date <span class="req">*</span></label><input type="date" id="fDate" min="${todayStr()}"/></div>
        <div class="field"><label>Start time <span class="req">*</span></label><select id="fStart">${timeOpts()}</select></div></div>
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
  if (S.available) { dyn(); est(); const f = $('#rf'); f.addEventListener('input', est); f.addEventListener('change', est); f.onsubmit = e => { e.preventDefault(); submit(); };
    $$('[data-ex]').forEach(c => c.onchange = () => { const q = $(`[data-exq="${c.dataset.ex}"]`); if (q) q.disabled = !c.checked; est(); });
    const pr = JSON.parse(localStorage.getItem('mb_profile') || '{}'); if (pr.name) $('#fName').value = pr.name; if (pr.email) $('#fEmail').value = pr.email; if (pr.phone) $('#fPhone').value = pr.phone; }
}
function paintPk() { $$('#pk .rn-opt').forEach(b => b.classList.toggle('sel', b.dataset.pk === sel.pkg)); }
function timeOpts() { let o = ''; for (let m = 8 * 60; m <= 20 * 60; m += 30) { const t = pad(Math.floor(m / 60)) + ':' + pad(m % 60); o += `<option value="${t}" ${t === '09:00' ? 'selected' : ''}>${fmtTime(t)}</option>`; } return o; }
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
  if (end && (st < '09:00' || end > '18:00')) warn += '<div class="help" style="color:#a86f00">Our normal hours are 9.00 am to 6.00 pm – other times are on request.</div>';
  box.innerHTML = `<b>Summary</b>${end ? `<div class="l"><span>Time</span><span>${fmtTime(st)} – ${fmtTime(end)}</span></div>` : ''}${e.lines.map(l => `<div class="l"><span>${esc(l[0])}</span><span>${l[1] == null ? 'On request' : rs(l[1])}</span></div>`).join('')}
    <div class="t l"><span>Estimated total</span><span>${e.lines.some(l => l[1] != null) ? rs(e.total) : '—'}${e.quote && e.total ? ' + on request items' : ''}</span></div>${warn}<div class="help">Final price is confirmed by Mentobeam.</div>`;
}
async function submit() {
  const err = $('#fErr'), v = vals(), e = calcEstimate(S, { pkg: sel.pkg, hours: v.hours, units: v.units, extras: v.ex });
  const date = $('#fDate').value, start = $('#fStart').value, name = $('#fName').value.trim(), email = $('#fEmail').value.trim(), phone = $('#fPhone').value.trim(), guests = +$('#fGuests').value || 0;
  err.textContent = '';
  if (!date || date < todayStr()) { err.textContent = 'Please choose a date (today or later).'; return; }
  if (v.p.mode !== 'quote' && v.hours <= 0) { err.textContent = 'Please enter the number of hours.'; return; }
  if (guests < 1 || (S.maxGuests && guests > S.maxGuests)) { err.textContent = 'Guests must be between 1 and ' + (S.maxGuests || 'the venue limit') + '.'; return; }
  if (name.length < 2) { err.textContent = 'Please enter your name.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email.'; return; }
  if (!/^[+\d][\d\s\-]{6,18}$/.test(phone)) { err.textContent = 'Please enter a valid phone number.'; return; }
  const exList = S.extras.filter(x => v.ex[x.id]).map(x => ({ id: x.id, name: x.name, qty: v.ex[x.id] }));
  const data = { spaceId: S.id, spaceName: S.name, packageId: v.p.id, packageName: v.p.name, date, startTime: start, endTime: v.hours ? addMinutes(start, v.hours * 60) : '', hours: v.hours, units: v.units, guests,
    layout: ($('#fLayout') || {}).value || '', extras: exList, extrasText: exList.map(x => x.name + (x.qty > 1 ? ' x' + x.qty : '')).join('; '),
    estimate: e.lines.some(l => l[1] != null) ? e.total : 0, quoteItems: !!e.quote, name, email, phone, notes: $('#fNotes').value.trim().slice(0, 600), status: 'pending', createdAt: Date.now() };
  const btn = $('#fBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Sending...';
  try {
    const ref = db.collection('rentBookings').doc(); await ref.set(data);
    localStorage.setItem('mb_profile', JSON.stringify({ name, email, phone }));
    if (R.site.sheetOn && R.site.sheetUrl) sheetSend(R.site.sheetUrl, { action: 'rent', rentIds: [ref.id], records: { [ref.id]: flat(data) } });
    myIds.push(ref.id); localStorage.setItem('mb_rent', JSON.stringify(myIds)); myDocs[ref.id] = { id: ref.id, ...data }; renderMy();
    const m = modal(`<div style="text-align:center"><div style="font-size:46px">✅</div><h2 class="mh" style="padding:0">Request sent!</h2><p class="msub">Thank you, ${esc(name.split(' ')[0])}. We will contact you to confirm and arrange the 50% advance.</p>
      <p><b>${esc(S.name)}</b> · ${esc(v.p.name)}<br>${fmtDate(date)}${data.endTime ? ' · ' + fmtTime(start) + ' – ' + fmtTime(data.endTime) : ''}</p><p class="help" style="margin:8px 0">Booking code: <span style="font-family:monospace">${ref.id}</span></p>
      <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="${waLink(R.rental.whatsapp, 'Hi, I just requested ' + S.name + ' on ' + date + '. Code: ' + ref.id)}">Message us on WhatsApp</a><button class="btn btn-blue btn-block" style="margin-top:8px" id="okd">Done</button></div>`);
    m.$('#okd').onclick = () => { m.close(); location.hash = '#my'; };
    $('#rf').reset(); dyn(); est();
  } catch (x) { err.textContent = 'Sorry, the request could not be sent. ' + errMsg(x); }
  btn.disabled = false; btn.textContent = 'Send booking request';
}
const flat = d => { const o = Object.assign({}, d); delete o.extras; return o; };
async function loadMy() {
  const miss = myIds.filter(id => !(id in myDocs));
  await Promise.all(miss.map(async id => { try { const s = await db.collection('rentBookings').doc(id).get(); myDocs[id] = s.exists ? { id, ...s.data() } : null; } catch (e) { myDocs[id] = undefined; } }));
  renderMy();
}
function renderMy() {
  const list = myIds.map(id => myDocs[id]).filter(b => b && b.spaceId === SID).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  $('#my').hidden = !list.length; if (!list.length) return;
  $('#myList').innerHTML = list.map(b => `<div><div><b>${fmtDate(b.date)}</b>${b.endTime ? ' · ' + fmtTime(b.startTime) + ' – ' + fmtTime(b.endTime) : ''}<br><span class="muted">${esc(b.packageName)}${b.estimate ? ' · ' + rs(b.estimate) : ''}</span><br><span style="font-family:monospace;font-size:11px;color:var(--muted)">${b.id}</span></div>
    <div style="text-align:right">${stBadge(b.status)}${(b.status === 'pending' || b.status === 'confirmed') && b.date >= todayStr() ? `<br><button class="btn btn-ghost btn-sm" style="margin-top:8px" data-c="${b.id}">Cancel</button>` : ''}</div></div>`).join('');
  $$('[data-c]').forEach(x => x.onclick = () => cancelMy(x.dataset.c));
}
async function cancelMy(id) {
  const ok = await confirmBox('Cancel 7 or more days ahead for a full refund of the advance. Later cancellations keep the advance.', { okText: 'Yes, cancel', danger: true, title: 'Cancel this booking?' }); if (!ok) return;
  try { await db.collection('rentBookings').doc(id).update({ status: 'cancelled', cancelledAt: Date.now() }); myDocs[id].status = 'cancelled'; renderMy(); toast('Booking cancelled', 'ok');
    if (R.site.sheetOn && R.site.sheetUrl) sheetSend(R.site.sheetUrl, { action: 'rent', rentIds: [id], records: { [id]: flat(myDocs[id]) } });
  } catch (e) { toast(errMsg(e), 'err'); }
}
init();
