/* Admin → Rentals module. Loaded AFTER the main admin script (adds a new "Rentals" page, permission, sync + storage hooks). */
var rentBookings = [], rentSpaces = [], rentalCfg = {}, rentFirst = true, rentHealed = false;
var rentTab = 'spaces', rbF = { space: '', status: '', month: '' }, ed = null;
PERMS.rentals = 'Rentals (spaces, rates, bookings)'; ALLPERMS.rentals = true;
NAV.splice(NAV.findIndex(n => n.id === 'content'), 0, { id: 'rentals', icon: '🏛️', label: 'Rentals', perm: 'rentals' });

const rMerged = () => DEF_SPACES.map(d => mergeSpace(d, rentSpaces.find(x => x.id === d.id)));
const rDoc = id => rentSpaces.find(x => x.id === id);
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('x' + Date.now().toString(36));
const lines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
// price is NEVER trusted from the customer's browser: the admin panel recalculates it from the current rates
function rSys(b) {
  const sp = rMerged().find(x => x.id === b.spaceId); if (!sp || !sp.packages.some(p => p.id === b.packageId)) return null;
  const ex = {}; (b.extras || []).forEach(x => { ex[x.id] = Number(x.qty) || 1; });
  const e = calcEstimate(sp, { pkg: b.packageId, hours: b.hours, units: b.units, extras: ex });
  return e.lines.some(l => l[1] != null) ? e.total : 0;
}
const flatRent = b => { const o = Object.assign({}, b); delete o.id; delete o.extras; return o; };

/* ---------- live data hooks ---------- */
const _subscribe = window.subscribe;
window.subscribe = function () {
  _subscribe();
  if (!can('rentals')) return;
  const bad = e => toast('Rentals data error: ' + errMsg(e), 'err');
  unsubs.push(db.collection('spaces').onSnapshot(s => { rentSpaces = s.docs.map(d => ({ id: d.id, ...d.data() })); refresh(); }, bad));
  unsubs.push(db.collection('settings').doc('rental').onSnapshot(s => { rentalCfg = s.exists ? s.data() : {}; refresh(); }, bad));
  unsubs.push(db.collection('rentBookings').onSnapshot(s => {
    if (!rentFirst) s.docChanges().forEach(c => { if (c.type === 'added' && !c.doc.metadata.hasPendingWrites) toast('🏛️ New rental request: ' + c.doc.data().spaceName + ' – ' + c.doc.data().name, 'ok'); });
    rentFirst = false; rentBookings = s.docs.map(d => ({ id: d.id, ...d.data() })); refresh();
  }, bad));
  setTimeout(sheetHealRent, 6000);
};
const _stopApp = window.stopApp;
window.stopApp = function () { rentBookings = []; rentSpaces = []; rentFirst = true; rentHealed = false; ed = null; _stopApp(); };

/* ---------- Google Sheet sync (one spreadsheet, separate tab per space) ---------- */
function sheetRent(ids) {
  if (!sheetCfg.on || !sheetCfg.url || !ids.length) return;
  sheetTok().then(token => {
    const records = {}, gone = [];
    ids.forEach(id => { const b = rentBookings.find(x => x.id === id); if (b) records[id] = flatRent(b); else gone.push(id); });
    sheetSend(sheetCfg.url, { action: 'rent', rentIds: ids, token, records, gone });
  });
}
function sheetRentSpaces(note) {
  if (!sheetCfg.on || !sheetCfg.url) return;
  sheetTok().then(token => sheetSend(sheetCfg.url, { action: 'rentSpaces', token, note: note || '', by: (me && (me.name || me.email)) || '', ids: DEF_SPACES.map(s => s.id) }));
}
async function sheetHealRent() {
  if (rentHealed || !sheetCfg.on || !sheetCfg.url) return; rentHealed = true;
  try {
    const r = await sheetCall(sheetCfg.url, { action: 'rentIndex' }); if (!r || !r.ok) return;
    const have = new Set(r.codes), miss = rentBookings.filter(b => !have.has(b.id)).map(b => b.id);
    for (let i = 0; i < miss.length; i += 40) { const c = miss.slice(i, i + 40); await sheetCall(sheetCfg.url, { action: 'rent', rentIds: c, token: await sheetTok(), records: Object.fromEntries(c.map(id => [id, flatRent(rentBookings.find(x => x.id === id))])) }); }
    if (miss.length) toast('Google Sheet updated – ' + miss.length + ' rental booking(s) added', 'ok');
    if (!r.spaces) sheetRentSpaces('Initial rates snapshot');
  } catch (e) { /* silent */ }
}
const _sheetSyncAll = window.sheetSyncAll;
window.sheetSyncAll = async function (onMsg, only) {
  const n = await _sheetSyncAll(onMsg, only);
  if (only || !can('rentals')) return n;
  for (let i = 0; i < rentBookings.length; i += 40) {
    const c = rentBookings.slice(i, i + 40); if (onMsg) onMsg('Syncing rentals… ' + Math.min(i + 40, rentBookings.length) + ' / ' + rentBookings.length);
    const r = await sheetCall(sheetCfg.url, { action: 'rent', rentIds: c.map(b => b.id), token: await sheetTok(), records: Object.fromEntries(c.map(b => [b.id, flatRent(b)])) });
    if (!r || !r.ok) throw sheetFail(r);
  }
  const r2 = await sheetCall(sheetCfg.url, { action: 'rentSpaces', token: await sheetTok(), ids: DEF_SPACES.map(s => s.id), note: 'Full sync', by: me.name || me.email });
  if (!r2 || !r2.ok) throw sheetFail(r2);
  return n + rentBookings.length;
};

/* ---------- the page ---------- */
views.rentals = {
  render() { this.paint(); },
  refresh() {
    const ae = document.activeElement; if (ae && view.contains(ae) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName)) return;   // don't wipe what is being typed
    this.paint();
  },
  paint() {
    if (current !== 'rentals') return;
    const pend = rentBookings.filter(b => b.status === 'pending').length;
    const tabs = [['spaces', 'Spaces & rates'], ['bookings', 'Bookings' + (pend ? ' (' + pend + ' new)' : '')], ['terms', 'Terms & contact']];
    view.innerHTML = `<div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${rentTab === k ? 'on' : ''}" data-act="rentTab" data-t="${k}">${t}</button>`).join('')}</div><div id="rBody"></div>`;
    $('#rBody').innerHTML = rentTab === 'spaces' ? rSpacesHTML() : rentTab === 'bookings' ? rBookingsHTML() : rTermsHTML();
  }
};
function rSpacesHTML() {
  const miss = DEF_SPACES.filter(d => !rDoc(d.id)).length;
  return (miss ? `<div class="notice" style="margin-bottom:12px">${miss} space(s) are still using the built-in brochure data. <button class="btn btn-blue btn-sm" data-act="rentSeed">Save them to the database</button></div>` : '') + `<p class="muted" style="margin-bottom:12px">Turn a space on or off for booking. When off, visitors can still open the card to see the packages, but they cannot book.</p>` + rMerged().map(s => {
    const has = !!rDoc(s.id);
    return `<div class="card box"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
      <div><h3 style="margin:0">${s.icon || ''} ${esc(s.name)} ${s.available ? '<span class="badge b-ok">Available</span>' : '<span class="badge b-gray">Disabled</span>'}</h3><div class="muted" style="font-size:13px;margin-top:2px">${esc(s.tagline || '')}${has ? '' : ' · <b>using default data</b>'}</div></div>
      <div class="acts"><button class="btn ${s.available ? 'btn-danger' : 'btn-primary'} btn-sm" data-act="rentToggle" data-id="${s.id}">${s.available ? 'Disable booking' : 'Enable booking'}</button>
      <button class="btn btn-blue btn-sm" data-act="rentEdit" data-id="${s.id}">✎ Edit details & rates</button><a class="btn btn-ghost btn-sm" href="${s.id}.html" target="_blank">Open page ↗</a></div></div>
      <div class="tw" style="margin-top:12px"><table><thead><tr><th>Package</th><th>Rate</th><th>Note</th></tr></thead><tbody>${s.packages.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(pkgPrice(p))} <span class="muted">${esc(p.unit || '')}</span></td><td>${esc(p.note || '')}</td></tr>`).join('')}
      ${s.extras.map(x => `<tr><td>＋ ${esc(x.name)}</td><td>${esc(exLabel(x))}</td><td class="muted">extra</td></tr>`).join('')}</tbody></table></div></div>`;
  }).join('');
}
function rMonths() { return [...new Set(rentBookings.map(b => (b.date || '').slice(0, 7)).filter(Boolean))].sort().reverse(); }
function rOverlap(b) {
  if (b.status === 'cancelled' || !b.endTime) return false;
  return rentBookings.some(o => o.id !== b.id && o.spaceId === b.spaceId && o.date === b.date && o.status !== 'cancelled' && o.endTime && b.startTime < o.endTime && o.startTime < b.endTime);
}
function rBookingsHTML() {
  let l = rentBookings.slice(); if (rbF.space) l = l.filter(b => b.spaceId === rbF.space); if (rbF.status) l = l.filter(b => b.status === rbF.status); if (rbF.month) l = l.filter(b => (b.date || '').startsWith(rbF.month));
  l.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
  const sel = (k, opts, v) => `<select data-chg="rentFilter" data-k="${k}" style="max-width:190px"><option value="">${k === 'space' ? 'All spaces' : k === 'status' ? 'All statuses' : 'All months'}</option>${opts.map(([a, b]) => `<option value="${a}" ${v === a ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  return `<div class="card box"><div class="fr" style="gap:10px;flex-wrap:wrap;margin-bottom:12px">${sel('space', DEF_SPACES.map(s => [s.id, s.name]), rbF.space)}${sel('status', ['pending', 'confirmed', 'completed', 'cancelled'].map(x => [x, x]), rbF.status)}${sel('month', rMonths().map(m => [m, monthLabel(m)]), rbF.month)}<span class="muted">${l.length} booking(s)</span></div>
    ${l.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Space / package</th><th>Customer</th><th>Details</th><th>Estimate</th><th>Status</th><th></th></tr></thead><tbody>${l.map(b => `<tr>
      <td><b>${fmtDate(b.date, true)}</b><br><span class="muted">${b.endTime ? fmtTime(b.startTime) + ' – ' + fmtTime(b.endTime) : fmtTime(b.startTime)}</span>${rOverlap(b) ? '<br><span class="badge b-red">⚠ overlaps another booking</span>' : ''}</td>
      <td><b>${esc(b.spaceName)}</b><br><span class="muted">${esc(b.packageName)}${b.hours ? ' · ' + b.hours + ' h' : ''}${b.units > 1 ? ' · ' + b.units + ' stations' : ''}</span></td>
      <td><b>${esc(b.name)}</b><br>${esc(b.phone)}<br><span class="muted">${esc(b.email)}</span></td>
      <td style="font-size:12.5px">${b.guests || ''} guests${b.layout ? ' · ' + esc(b.layout) : ''}${b.extrasText ? '<br>＋ ' + esc(b.extrasText) : ''}${b.notes ? '<br><i>“' + esc(b.notes) + '”</i>' : ''}</td>
      <td>${(() => { const sy = rSys(b); return sy === null ? '<span class="badge b-red">⚠ package not found</span>' : (sy ? '<b>' + rs(sy) + '</b>' : '—') + (b.estimate !== sy && b.estimate ? '<br><span class="badge b-red" title="The price sent from the customer\'s browser differs from the system price">⚠ customer sent ' + rs(b.estimate) + '</span>' : '') + (b.quoteItems ? '<br><span class="muted">+ on request</span>' : ''); })()}</td>
      <td><select data-chg="rentStatus" data-id="${b.id}" style="min-width:120px">${['pending', 'confirmed', 'completed', 'cancelled'].map(x => `<option ${b.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td><button class="btn btn-danger btn-sm" data-act="rentDel" data-id="${b.id}" title="Delete">🗑</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>No rental bookings yet.</p></div>'}
    <p class="help" style="margin-top:10px">Status changes and new requests are saved to the Google Sheet automatically (one tab per space). Deleting a booking here never deletes it from the sheet.</p></div>`;
}
function rTermsHTML() {
  const r = Object.assign({}, DEF_RENTAL, rentalCfg), f = (id, lab, v, ta) => `<div class="field"><label>${lab}</label>${ta ? `<textarea id="${id}" style="min-height:${ta}px">${esc(v)}</textarea>` : `<input id="${id}" value="${esc(v)}"/>`}</div>`;
  return `<div class="card box"><h3>Terms shown under the cards</h3><p class="help" style="margin-bottom:10px">These appear on the main page (under the cards) and on every rental page. One line per item.</p>
    ${f('rtTerms', 'Booking terms (one per line)', (r.terms && r.terms.length ? r.terms : DEF_TERMS).join('\n'), 150)}${f('rtIncl', 'Included with every booking (one per line)', (r.included || []).join('\n'), 110)}${f('rtIntro', 'Intro line (main page)', r.intro || '')}
    <div class="row2">${f('rtWa', 'WhatsApp number', r.whatsapp || '')}${f('rtMail', 'Email', r.email || '')}</div><div class="row2">${f('rtWeb', 'Website', r.web || '')}${f('rtHours', 'Opening hours', r.hours || '')}</div>${f('rtAddr', 'Address', r.address || '')}
    <button class="btn btn-primary" data-act="rentSaveTerms">💾 Save</button></div>`;
}

/* ---------- editor ---------- */
function edPaint() {
  const s = ed.sp, m = ed.m;
  const pk = s.packages.map((p, i) => `<div class="card" style="padding:10px;margin-bottom:8px;background:var(--soft)" data-pk="${i}"><div class="row2"><div class="field"><label>Name</label><input data-f="name" value="${esc(p.name)}"/></div>
      <div class="field"><label>Type</label><select data-f="mode">${[['hourly', 'Per hour (× hours)'], ['fixed', 'Fixed price'], ['unit_hour', 'Per unit per hour'], ['quote', 'On request / negotiable']].map(([v, t]) => `<option value="${v}" ${p.mode === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="row2"><div class="field"><label>Price (Rs)</label><input type="number" data-f="price" value="${p.price ?? ''}"/></div><div class="field"><label>Price text (if on request)</label><input data-f="priceText" value="${esc(p.priceText || '')}" placeholder="Negotiable"/></div></div>
      <div class="row2"><div class="field"><label>Unit text</label><input data-f="unit" value="${esc(p.unit || '')}" placeholder="per hour / 4 hours"/></div><div class="field"><label>Hours (fixed) / min hours</label><input type="number" data-f="hrs" value="${(p.mode === 'fixed' ? p.hours : p.minHours) ?? ''}"/></div></div>
      <div class="row2"><div class="field"><label>Note</label><input data-f="note" value="${esc(p.note || '')}"/></div><div class="field"><label>Badge (e.g. BEST VALUE)</label><input data-f="badge" value="${esc(p.badge || '')}"/></div></div>
      <button class="btn btn-danger btn-sm" data-act="edDelPk" data-i="${i}">Remove package</button></div>`).join('');
  const ex = s.extras.map((x, i) => `<div class="card" style="padding:10px;margin-bottom:8px;background:var(--soft)" data-ex="${i}"><div class="row2"><div class="field"><label>Name</label><input data-f="name" value="${esc(x.name)}"/></div>
      <div class="field"><label>Charged as</label><select data-f="per">${[['flat', 'One-time price'], ['hour', 'Per extra hour'], ['unit_hour', 'Per unit per hour'], ['request', 'On request']].map(([v, t]) => `<option value="${v}" ${x.per === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="row2"><div class="field"><label>Price (Rs)</label><input type="number" data-f="price" value="${x.price ?? ''}"/></div><div class="field"><label>Label (e.g. per hour)</label><input data-f="label" value="${esc(x.label || '')}"/></div></div>
      <button class="btn btn-danger btn-sm" data-act="edDelEx" data-i="${i}">Remove extra</button></div>`).join('');
  m.$('#edBody').innerHTML = `<div class="row2"><div class="field"><label>Name</label><input id="eName" value="${esc(s.name)}"/></div><div class="field"><label>Icon (emoji)</label><input id="eIcon" value="${esc(s.icon || '')}"/></div></div>
    <div class="field"><label>Tagline</label><input id="eTag" value="${esc(s.tagline || '')}"/></div><div class="field"><label>Description</label><textarea id="eDesc">${esc(s.desc || '')}</textarea></div>
    <div class="field"><label>Ideal for</label><input id="eIdeal" value="${esc(s.idealFor || '')}"/></div>
    <div class="row2"><div class="field"><label>Features (one per line)</label><textarea id="eFeat" style="min-height:110px">${esc(s.features.join('\n'))}</textarea></div>
      <div class="field"><label>Highlight numbers (one per line: 50 | seats with tables)</label><textarea id="eStats" style="min-height:110px">${esc(s.stats.map(x => x.v + ' | ' + x.l).join('\n'))}</textarea></div></div>
    <div class="row2"><div class="field"><label>Layouts (one per line, optional)</label><textarea id="eLay" style="min-height:70px">${esc((s.layouts || []).join('\n'))}</textarea></div><div class="field"><label>Max guests / stations</label><input type="number" id="eMax" value="${s.maxGuests || ''}"/></div></div>
    <h3 style="margin:14px 0 8px">Packages & rates</h3>${pk}<button class="btn btn-ghost btn-sm" data-act="edAddPk">＋ Add package</button>
    <h3 style="margin:18px 0 8px">Extras</h3>${ex}<button class="btn btn-ghost btn-sm" data-act="edAddEx">＋ Add extra</button>
    <h3 style="margin:18px 0 6px">Photos <span class="muted" style="font-size:13px">(${ed.photos.length}/3 – leave empty to use the brochure photos)</span></h3>
    <input type="file" id="ePhoto" accept="image/*" multiple style="display:none"/><button class="btn btn-blue btn-sm" data-act="edPhoto">📁 Upload photos</button>
    <div class="gthumbs">${ed.photos.map((p, i) => `<div class="gt"><img src="${p}" alt=""/><div><button class="btn btn-danger btn-sm" data-act="edDelPhoto" data-i="${i}">✕</button></div></div>`).join('')}</div>
    <div class="err" id="eErr"></div><button class="btn btn-primary btn-block" data-act="edSave" style="margin-top:12px">💾 Save ${esc(s.name)}</button>`;
  const pi = m.$('#ePhoto'); if (pi) pi.onchange = async e => {
    const arr = Array.from(e.target.files).filter(f => f.type.startsWith('image/')); edRead();
    if (ed.photos.length + arr.length > 3) { toast('Maximum 3 photos per space', 'err'); return; }
    toast('Compressing…'); for (const f of arr) ed.photos.push(await compressToDataUrl(f, 900)); edPaint();
  };
}
function edRead() {   // copy what is typed in the editor back into ed.sp
  const m = ed.m, s = ed.sp, v = id => (m.$('#' + id) || {}).value || '';
  if (!m.$('#eName')) return;
  s.name = v('eName').trim() || s.name; s.icon = v('eIcon'); s.tagline = v('eTag'); s.desc = v('eDesc'); s.idealFor = v('eIdeal'); s.features = lines(v('eFeat'));
  s.stats = lines(v('eStats')).map(l => { const [a, ...b] = l.split('|'); return { v: (a || '').trim(), l: b.join('|').trim() }; }).filter(x => x.v || x.l);
  s.layouts = lines(v('eLay')); s.maxGuests = Number(v('eMax')) || 0;
  s.packages = $$('[data-pk]', m.el).map((el, i) => { const g = f => (el.querySelector(`[data-f="${f}"]`) || {}).value || '', old = s.packages[i] || {}, mode = g('mode'), n = g('name').trim();
    const p = { id: old.id || slug(n), name: n, mode, unit: g('unit').trim(), note: g('note').trim() }; if (g('badge').trim()) p.badge = g('badge').trim();
    if (mode === 'quote') p.priceText = g('priceText').trim() || 'On request'; else p.price = Number(g('price')) || 0;
    const h = Number(g('hrs')) || 0; if (mode === 'fixed' && h) p.hours = h; if ((mode === 'hourly' || mode === 'unit_hour') && h) p.minHours = h;
    if (mode === 'unit_hour') { p.maxUnits = old.maxUnits || s.maxGuests || 8; p.unitLabel = old.unitLabel || 'Units'; } return p; });
  s.extras = $$('[data-ex]', m.el).map((el, i) => { const g = f => (el.querySelector(`[data-f="${f}"]`) || {}).value || '', old = s.extras[i] || {}, per = g('per'), n = g('name').trim();
    const x = { id: old.id || slug(n), name: n, per, label: g('label').trim() }; if (per !== 'request') x.price = Number(g('price')) || 0;
    if (per === 'hour') { x.qtyLabel = 'Extra hours'; x.max = 12; } if (per === 'unit_hour') { x.qtyLabel = old.qtyLabel || 'Units'; x.max = old.max || s.maxGuests || 8; } return x; });
}
A.rentTab = d => { rentTab = d.t; views.rentals.paint(); };
C.rentFilter = el => { rbF[el.dataset.k] = el.value; views.rentals.paint(); };
A.rentToggle = d => run(null, async () => {
  const s = rMerged().find(x => x.id === d.id), on = !s.available, o = JSON.parse(JSON.stringify(s)); o.available = on; o.updatedAt = Date.now();
  if (!(rDoc(d.id) && rDoc(d.id).photos && rDoc(d.id).photos.length)) delete o.photos;
  await db.collection('spaces').doc(d.id).set(o, { merge: true }); toast(s.name + (on ? ' is now available for booking' : ' is disabled'), 'ok'); sheetRentSpaces(s.name + ': booking ' + (on ? 'ENABLED' : 'DISABLED'));
});
A.rentEdit = d => {
  const s = JSON.parse(JSON.stringify(rMerged().find(x => x.id === d.id))), dd = rDoc(d.id);
  ed = { id: d.id, sp: s, photos: (dd && dd.photos) ? dd.photos.slice() : [], m: null };
  ed.m = modal(`<h2 class="mh">Edit ${esc(s.name)}</h2><p class="msub">Everything visitors see on the card and on the booking page.</p><div id="edBody"></div>`, { wide: true, onClose: () => { ed = null; } }); edPaint();
};
A.edAddPk = () => { edRead(); ed.sp.packages.push({ id: 'p' + Date.now().toString(36), name: 'New package', mode: 'fixed', price: 0, unit: '', note: '' }); edPaint(); };
A.edDelPk = d => { edRead(); ed.sp.packages.splice(+d.i, 1); edPaint(); };
A.edAddEx = () => { edRead(); ed.sp.extras.push({ id: 'x' + Date.now().toString(36), name: 'New extra', per: 'flat', price: 0, label: '' }); edPaint(); };
A.edDelEx = d => { edRead(); ed.sp.extras.splice(+d.i, 1); edPaint(); };
A.edPhoto = () => ed.m.$('#ePhoto').click();
A.edDelPhoto = d => { edRead(); ed.photos.splice(+d.i, 1); edPaint(); };
A.edSave = (d, btn) => run(btn, async () => {
  edRead(); const s = ed.sp, err = ed.m.$('#eErr'); err.textContent = '';
  if (!s.packages.length || s.packages.some(p => !p.name)) { err.textContent = 'Every package needs a name (add at least one package).'; return; }
  if (s.extras.some(x => !x.name)) { err.textContent = 'Every extra needs a name.'; return; }
  const o = Object.assign({}, s, { photos: ed.photos, updatedAt: Date.now() }); if (!ed.photos.length) delete o.photos;
  try { await db.collection('spaces').doc(ed.id).set(o); } catch (e) { err.textContent = /too large|size/i.test(e.message) ? 'Photos are too big – remove one and try again.' : errMsg(e); return; }
  const nm = s.name; ed.m.close(); toast(nm + ' saved', 'ok'); sheetRentSpaces(nm + ': details / rates updated');
});
A.rentSaveTerms = (d, btn) => run(btn, async () => {
  const v = id => $('#' + id).value;
  await db.collection('settings').doc('rental').set({ terms: lines(v('rtTerms')), included: lines(v('rtIncl')), intro: v('rtIntro').trim(), whatsapp: v('rtWa').trim(), email: v('rtMail').trim(), web: v('rtWeb').trim(), hours: v('rtHours').trim(), address: v('rtAddr').trim(), updatedAt: Date.now() }, { merge: true });
  toast('Saved', 'ok'); sheetRentSpaces('Terms & contact updated');
});
C.rentStatus = el => run(null, async () => { const bk = rentBookings.find(x => x.id === el.dataset.id), sy = bk ? rSys(bk) : null, up = { status: el.value, statusAt: Date.now() };
  if (sy !== null && bk && bk.estimate !== sy) { up.estimateCustomer = bk.estimate || 0; up.estimate = sy; }   // keep the system price, remember what the browser sent
  await db.collection('rentBookings').doc(el.dataset.id).update(up); toast('Status: ' + el.value, 'ok'); sheetRent([el.dataset.id]); });
A.rentDel = async d => {
  const b = rentBookings.find(x => x.id === d.id); if (!b) return;
  if (!await confirmBox('Delete the booking of <b>' + esc(b.name) + '</b>? (It stays in the Google Sheet, marked Cancelled.)', { okText: 'Delete', danger: true, title: 'Delete booking?' })) return;
  run(null, async () => { await db.collection('rentBookings').doc(d.id).delete(); toast('Deleted', 'ok'); sheetRent([d.id]); });
};
A.rentSeed = (d, btn) => run(btn, async () => {
  for (const sp of rMerged()) { if (rDoc(sp.id)) continue; const o = JSON.parse(JSON.stringify(sp)); delete o.photos; o.updatedAt = Date.now(); await db.collection('spaces').doc(sp.id).set(o); }
  toast('Saved', 'ok'); sheetRentSpaces('Initial rates saved from the brochure');
});
