/* Admin → Rentals module. Loaded AFTER the main admin script (adds a new "Rentals" page, permission, sync + storage hooks). */
var rentBookings = [], rentSpaces = [], rentalCfg = {}, rentFirst = true, rentHealed = false;
var rentTab = 'spaces', rbF = { space: '', status: '', month: '', q: '' }, ed = null;
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
/* ---------- advance payment slips + refunds ---------- */
const rSiteBase = () => location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
const rMask = n => '****' + String(n || '').slice(-4);
function rRefundWithin(b) {   // was the booking confirmed in time, and cancelled within the refund window after the admin confirmed it?
  const days = (rentalCfg.refundDays === '' || rentalCfg.refundDays == null) ? 7 : Number(rentalCfg.refundDays);
  return refundWithin(b, days, b.cancelledAt || Date.now());
}
// the browser type of a slip is forced from an allow-list (never trusted from the file) so a fake slip can never run as a web page
const rSlipBlob = async sl => { const raw = await (await fetch(sl.data)).blob(); return new Blob([raw], { type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(sl.type) ? sl.type : 'application/octet-stream' }); };
async function rDownloadSlip(b, sl, tag) {
  const blob = await rSlipBlob(sl), ext = sl.type === 'application/pdf' ? 'pdf' : (sl.type === 'image/png' ? 'png' : 'jpg');
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'slip_' + (tag || 'advance') + '_' + String(b.name || 'customer').replace(/[^a-z0-9]+/gi, '_').slice(0, 30) + '_' + b.date + '_' + String(b.id).slice(0, 6) + '.' + ext;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const rSlipId = (b, kind) => kind === 'balance' ? b.id + '_bal' : b.id;
// download the slip to this device, THEN delete it from the database (frees the space). Nothing is deleted if the download fails.
async function rTakeSlip(b, kind) {
  const ref = db.collection('rentSlips').doc(rSlipId(b, kind)), snap = await ref.get(); if (!snap.exists) return false;
  await rDownloadSlip(b, snap.data(), kind === 'balance' ? 'balance' : 'advance'); await new Promise(r => setTimeout(r, 800)); await ref.delete(); return true;
}
const rWaTo = (b, text) => waLink(b.phone, text);
/* proof of how a booking was cancelled: with or without a payment slip on file. Saved at cancellation time (customer: checked by the database rules); older bookings fall back to the slip flags. */
const rHadSlip = b => b.cancelSlip != null ? !!b.cancelSlip : !!(b.paidClaim || b.advanceVerified || b.slipAt);
function rCancelProof(b) {
  if (b.status !== 'cancelled') return '';
  const by = b.cancelledBy === 'admin' ? 'organiser' : (b.cancelledBy === 'customer' ? 'customer' : 'unknown'), owes = Number(b.advanceDue) > 0, had = rHadSlip(b);
  const badge = !owes ? '<span class="badge b-gray">No advance was due</span>' : (had ? '<span class="badge b-ok">Cancelled WITH slip</span>' : '<span class="badge b-red">Cancelled WITHOUT slip</span>');
  return `<div style="font-size:12px;margin-top:6px;line-height:1.5">${badge}<br><span class="muted">by ${by}${b.cancelledAt ? ' · ' + fWhen(b.cancelledAt) : ''}</span>${owes && !had && b.cancelAck ? '<br><span class="muted">Customer accepted the no-slip / no-refund warning</span>' : ''}${b.cancelSlip == null ? '<br><span class="muted">(older booking – worked out from the slip records)</span>' : ''}</div>`;
}
function rPayCell(b) {
  const pi = payInfo(b), sy = rSys(b); let h = '';
  const adv = pi.advPaid ? '<span class="badge b-ok">✓ received</span>' : (b.slipAt ? '<span class="badge b-blue">slip received</span>' : (pi.advance > 0 ? '<span class="badge b-warn">awaiting</span>' : ''));
  const bal = pi.balPaid ? '<span class="badge b-ok">✓ paid</span>' : (b.balanceSlipAt ? '<span class="badge b-blue">slip received</span>' : (pi.advPaid ? '<span class="badge b-warn">due</span>' : '<span class="muted">—</span>'));
  h += `<div class="paybox" style="font-size:12.5px;line-height:1.55"><div>Total <b>${rs(pi.total)}</b>${sy != null && !b.totalFinal && sy !== pi.total ? ` <span class="badge b-red" title="Recalculated from the current rates">⚠ system ${rs(sy)}</span>` : ''}</div>
    <div>Advance <b>${rs(pi.advance)}</b> ${adv}${(() => { const e = sy ? advanceOf(sy, b.advancePct || 50) : null; return e != null && !b.advanceVerified && e !== b.advanceDue && b.advanceDue > 0 ? ` <span class="badge b-red" title="Advance recalculated from the current rates">⚠ should be ${rs(e)}</span>` : ''; })()}</div>
    <div>Balance <b>${rs(pi.balance)}</b> ${bal}</div><div class="muted">Received ${rs(pi.received)} · To collect ${rs(pi.due)}</div></div>`;
  const acts = [];
  if (b.status === 'pending') {
    if (b.advanceDue > 0 && !b.slipAt) acts.push(`<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${rWaTo(b, 'Hi ' + b.name + ', this is Mentobeam. To verify your advance payment (' + rs(b.advanceDue) + ') for ' + b.spaceName + ' on ' + fmtDate(b.date) + ', please attach your bank transfer slip: open ' + rSiteBase() + b.spaceId + '.html > My bookings > Attach advance slip. Booking code: ' + b.id)}">🔔 Remind to attach slip</a>`);
    else { if (b.slipAt) acts.push(`<button class="btn btn-ghost btn-sm" data-act="rentSlip" data-id="${b.id}">👁 View advance slip</button>`); acts.push(`<button class="btn btn-primary btn-sm" data-act="rentConfirm" data-id="${b.id}">✔ Confirm booking</button>`); }
  } else if (b.status === 'confirmed' && !b.closed) {
    if (b.balanceSlipAt) acts.push(`<button class="btn btn-ghost btn-sm" data-act="rentSlip" data-id="${b.id}" data-kind="balance">👁 View balance slip</button>`);
    if (pi.balance > 0) { acts.push(`<button class="btn btn-primary btn-sm" data-act="rentBalance" data-id="${b.id}">✔ ${b.balanceSlipAt ? 'Verify balance & close' : 'Mark balance paid'}</button>`);
      if (!b.balanceSlipAt) acts.push(`<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${rWaTo(b, 'Hi ' + b.name + ', this is Mentobeam. Reminder: the balance of ' + rs(pi.balance) + ' for ' + b.spaceName + ' on ' + fmtDate(b.date) + ' is due on or before the booking date. Please pay and attach the slip: ' + rSiteBase() + b.spaceId + '.html > My bookings > Pay balance. Booking code: ' + b.id)}">🔔 Remind balance</a>`); }
  }
  if (b.closed) acts.push('<span class="badge b-ok">✓ Paid in full – transaction closed</span>');
  if (b.refundStatus === 'requested') acts.push('<span class="badge b-warn">💸 Refund requested – see Refunds page</span>');
  else if (b.refundStatus === 'paid') acts.push('<span class="badge b-ok">✓ Refund paid</span>');
  else if (b.refundStatus === 'rejected') acts.push('<span class="badge b-red">Refund rejected</span>');
  if (b.status === 'cancelled' && b.slipAt && !b.advanceVerified && !b.slipDeleted) acts.push(`<button class="btn btn-ghost btn-sm" data-act="rentSlip" data-id="${b.id}">👁 View slip</button>`);
  return h + (acts.length ? `<div class="acts" style="margin-top:6px;flex-wrap:wrap">${acts.join('')}</div>` : '');
}
const flatRent = b => { const o = Object.assign({}, b); delete o.id; delete o.extras; return o; };

/* ---------- live data hooks ---------- */
const _subscribe = window.subscribe;
window.subscribe = function () {
  _subscribe();
  if (!(can('rentals') || can('refunds') || can('income'))) return;
  const bad = e => toast('Rentals data error: ' + errMsg(e), 'err');
  unsubs.push(db.collection('spaces').onSnapshot(s => { rentSpaces = s.docs.map(d => ({ id: d.id, ...d.data() })); refresh(); }, bad));
  unsubs.push(db.collection('settings').doc('rental').onSnapshot(s => { rentalCfg = s.exists ? s.data() : {}; refresh(); }, bad));
  unsubs.push(db.collection('rentBookings').onSnapshot(s => {
    if (!rentFirst) s.docChanges().forEach(c => {
      if (c.doc.metadata.hasPendingWrites) return; const d = c.doc.data();
      if (c.type === 'added') toast('🏛️ New rental booking: ' + d.spaceName + ' – ' + d.name + (d.slipAt ? ' (slip attached)' : ''), 'ok');
      else if (c.type === 'modified') { const o = rentBookings.find(x => x.id === c.doc.id);
        if (o && o.refundStatus !== 'requested' && d.refundStatus === 'requested') toast('💸 Refund requested: ' + d.name + ' – ' + rs(d.refundAmount || 0), 'err');
        else if (o && !o.slipAt && d.slipAt) toast('📎 Advance slip attached: ' + d.name, 'ok');
        else if (o && !o.balanceSlipAt && d.balanceSlipAt) toast('📎 Balance slip attached: ' + d.name, 'ok'); }
    });
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
/* the bookings the admin sees: OLD bookings first, newest last (by the time the booking was made) */
const rbList = () => {
  let l = rentBookings.slice(); if (rbF.space) l = l.filter(b => b.spaceId === rbF.space); if (rbF.status) l = l.filter(b => b.status === rbF.status); if (rbF.month) l = l.filter(b => (b.date || '').startsWith(rbF.month));
  const q = (rbF.q || '').trim().toLowerCase();
  if (q) { const dq = q.replace(/[\s-]/g, ''); l = l.filter(b => [b.name, b.phone, b.email, b.id, b.spaceName, b.packageName, b.status, b.date, b.notes, b.extrasText, b.refundStatus ? 'refund ' + b.refundStatus : '',
    b.status === 'cancelled' ? (rHadSlip(b) ? 'cancelled with slip' : 'cancelled without slip') : ''].some(v => String(v || '').toLowerCase().includes(q)) || (dq && String(b.phone || '').replace(/[\s-]/g, '').includes(dq))); }
  return l.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.date + a.startTime).localeCompare(b.date + b.startTime));
};
function rBookingRows(l) {
  return l.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Space / package</th><th>Customer</th><th>Details</th><th>Estimate</th><th>Payment</th><th>Status</th><th></th></tr></thead><tbody>${l.map(b => `<tr>
      <td><b>${fmtDate(b.date, true)}</b><br><span class="muted">${b.endTime ? fmtTime(b.startTime) + ' – ' + fmtTime(b.endTime) : fmtTime(b.startTime)}</span>${b.createdAt ? '<br><span class="muted" style="font-size:11.5px">Booked ' + fWhen(b.createdAt) + '</span>' : ''}${rOverlap(b) ? '<br><span class="badge b-red">⚠ overlaps another booking</span>' : ''}</td>
      <td><b>${esc(b.spaceName)}</b><br><span class="muted">${esc(b.packageName)}${b.hours ? ' · ' + b.hours + ' h' : ''}${b.units > 1 ? ' · ' + b.units + ' stations' : ''}</span></td>
      <td><b>${esc(b.name)}</b><br>${esc(b.phone)}<br><span class="muted">${esc(b.email)}</span><br><span style="font-family:monospace;font-size:11px" class="muted">${esc(b.id)}</span></td>
      <td style="font-size:12.5px">${b.guests || ''} guests${b.layout ? ' · ' + esc(b.layout) : ''}${b.extrasText ? '<br>＋ ' + esc(b.extrasText) : ''}${b.notes ? '<br><i>“' + esc(b.notes) + '”</i>' : ''}</td>
      <td>${(() => { const sy = rSys(b); return sy === null ? '<span class="badge b-red">⚠ package not found</span>' : (sy ? '<b>' + rs(sy) + '</b>' : '—') + (b.estimate !== sy && b.estimate ? '<br><span class="badge b-red" title="The price sent from the customer\'s browser differs from the system price">⚠ customer sent ' + rs(b.estimate) + '</span>' : '') + (b.quoteItems ? '<br><span class="muted">+ on request</span>' : ''); })()}</td>
      <td style="min-width:190px">${rPayCell(b)}</td>
      <td><select data-chg="rentStatus" data-id="${b.id}" style="min-width:120px">${['pending', 'confirmed', 'completed', 'cancelled'].map(x => `<option ${b.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select>${rCancelProof(b)}</td>
      <td><button class="btn btn-danger btn-sm" data-act="rentDel" data-id="${b.id}" title="Delete">🗑</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>No rental bookings found.</p></div>';
}
function rBookingsHTML() {
  const l = rbList();
  const sel = (k, opts, v) => `<select data-chg="rentFilter" data-k="${k}" style="max-width:190px"><option value="">${k === 'space' ? 'All spaces' : k === 'status' ? 'All statuses' : 'All months'}</option>${opts.map(([a, b]) => `<option value="${a}" ${v === a ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  return `<div class="card box"><div class="fr" style="gap:10px;flex-wrap:wrap;margin-bottom:12px"><input id="rbQ" data-inp="rbQ" type="search" placeholder="🔍 Search name, phone, email, booking code, space…" value="${esc(rbF.q || '')}" style="min-width:260px;flex:1;max-width:380px"/>${sel('space', DEF_SPACES.map(s => [s.id, s.name]), rbF.space)}${sel('status', ['pending', 'confirmed', 'completed', 'cancelled'].map(x => [x, x]), rbF.status)}${sel('month', rMonths().map(m => [m, monthLabel(m)]), rbF.month)}<span class="muted" id="rbCount">${l.length} booking(s) · oldest first</span></div>
    <div id="rbRows">${rBookingRows(l)}</div>
    <p class="help" style="margin-top:10px">Status changes and new requests are saved to the Google Sheet automatically (one tab per space). Deleting a booking here never deletes it from the sheet.</p></div>`;
}
function rTermsHTML() {
  const r = Object.assign({}, DEF_RENTAL, rentalCfg), f = (id, lab, v, ta) => `<div class="field"><label>${lab}</label>${ta ? `<textarea id="${id}" style="min-height:${ta}px">${esc(v)}</textarea>` : `<input id="${id}" value="${esc(v)}"/>`}</div>`;
  return `<div class="card box"><h3>Terms shown under the cards</h3><p class="help" style="margin-bottom:10px">These appear on the main page (under the cards) and on every rental page. One line per item.</p>
    ${f('rtTerms', 'Booking terms (one per line)', (r.terms && r.terms.length ? r.terms : DEF_TERMS).join('\n'), 150)}${f('rtIncl', 'Included with every booking (one per line)', (r.included || []).join('\n'), 110)}${f('rtIntro', 'Intro line (main page)', r.intro || '')}
    <div class="row2">${f('rtWa', 'WhatsApp number', r.whatsapp || '')}${f('rtMail', 'Email', r.email || '')}</div><div class="row2">${f('rtWeb', 'Website', r.web || '')}${f('rtHours', 'Opening hours', r.hours || '')}</div>${f('rtAddr', 'Address', r.address || '')}
    <h3 style="margin-top:18px">Centre open &amp; close times</h3><p class="help" style="margin-bottom:10px">Customers can only book inside these times, and each space can be booked hour by hour (booked hours are blocked for other customers, free hours stay open). Leave both empty for no limit. Use 30-minute steps (e.g. 08:00 – 17:00).</p>
    <div class="row2"><div class="field"><label>Open time</label><input id="rtOpen" type="time" step="1800" value="${esc(r.openTime || '')}"/></div><div class="field"><label>Close time</label><input id="rtClose" type="time" step="1800" value="${esc(r.closeTime || '')}"/></div></div>
    <button class="btn btn-ghost btn-sm" data-act="rentSyncLocks" style="margin-bottom:6px">🔄 Sync hour availability from existing bookings</button><p class="help" style="margin-bottom:10px">Run once after updating, so bookings made earlier also block their hours. Safe to run again any time.</p>
    <h3 style="margin-top:18px">Advance payment & refunds</h3><p class="help" style="margin-bottom:10px">Customers see the bank details after pressing “Book”; the booking is placed only after they pay the advance and press “I made the advance payment”.</p>
    <div class="row2">${f('rtBank', 'Bank name', r.bankName || '')}${f('rtBranch', 'Branch', r.bankBranch || '')}</div><div class="row2">${f('rtAccName', 'Account name', r.bankAccName || '')}${f('rtAccNo', 'Account number', r.bankAccNo || '')}</div>
    ${f('rtPayNote', 'Payment note (optional)', r.payNote || '')}<div class="row2">${f('rtAdv', 'Advance %', r.advancePct != null ? r.advancePct : 50)}${f('rtRefDays', 'Refund period (days): booking must be confirmed, and then cancelled, within this many days', r.refundDays != null && r.refundDays !== '' ? r.refundDays : 7)}</div>${f('rtRefHrs', 'Refund paid within (hours) – shown to customers', r.refundHours != null ? r.refundHours : 48)}
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
I.rbQ = el => { rbF.q = el.value; const l = rbList(), r = $('#rbRows'), c = $('#rbCount'); if (r) r.innerHTML = rBookingRows(l); if (c) c.textContent = l.length + ' booking(s) · oldest first'; };
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
  const v = id => $('#' + id).value, oT = v('rtOpen').trim(), cT = v('rtClose').trim();
  if (!!oT !== !!cT) throw new Error('Please set both the open time and the close time (or leave both empty).');
  if (oT && (toMin(cT) <= toMin(oT) || toMin(oT) % 30 || toMin(cT) % 30)) throw new Error('Close time must be after the open time, and both must be on the hour or half hour.');
  await db.collection('settings').doc('rental').set({ openTime: oT, closeTime: cT, terms: lines(v('rtTerms')), included: lines(v('rtIncl')), intro: v('rtIntro').trim(), whatsapp: v('rtWa').trim(), email: v('rtMail').trim(), web: v('rtWeb').trim(), hours: v('rtHours').trim(), address: v('rtAddr').trim(),
    bankName: v('rtBank').trim(), bankBranch: v('rtBranch').trim(), bankAccName: v('rtAccName').trim(), bankAccNo: v('rtAccNo').trim(), payNote: v('rtPayNote').trim(),
    advancePct: Math.min(100, Math.max(1, Number(v('rtAdv')) || 50)), refundDays: Math.max(0, Number(v('rtRefDays')) || 0), refundHours: Math.max(1, Number(v('rtRefHrs')) || 48), updatedAt: Date.now() }, { merge: true });
  toast('Saved', 'ok'); sheetRentSpaces('Terms & contact updated');
});
async function rSetStatus(id, status, extra) {
  const bk = rentBookings.find(x => x.id === id), sy = bk ? rSys(bk) : null, up = Object.assign({ status, statusAt: Date.now() }, extra || {});
  if (status === 'confirmed' && bk && !bk.confirmedAt) up.confirmedAt = up.statusAt;   // refund window starts here and is fixed even if the status later changes
  if (sy !== null && bk && bk.estimate !== sy && up.totalFinal == null) { up.estimateCustomer = bk.estimate || 0; up.estimate = sy; }   // keep the system price, remember what the browser sent
  const ks = (bk && bk.blocks) || [], wasOff = !!bk && bk.status === 'cancelled', goOff = status === 'cancelled';
  if (ks.length && wasOff !== goOff) {   // a cancelled booking frees its hours; bringing it back takes them again (unless someone else booked them meanwhile)
    if (!goOff) { const taken = await loadAvail(bk.spaceId, bk.date); if (ks.some(k => taken.includes(k))) throw new Error('Already Booked by Another Person – these hours were booked after this booking was cancelled, so it cannot be restored.'); }
    const bt = db.batch(); bt.update(db.collection('rentBookings').doc(id), up); lockOps(bt, bk.spaceId, bk.date, ks, id, goOff); await bt.commit();
  } else await db.collection('rentBookings').doc(id).update(up);
  sheetRent([id]);
}
C.rentStatus = el => {
  const b = rentBookings.find(x => x.id === el.dataset.id), v = el.value;
  if (v === 'confirmed' && b && !b.advanceVerified && b.status === 'pending') { views.rentals.paint(); return A.rentConfirm({ id: b.id }); }   // confirming always goes through the slip check
  if (v === 'completed' && b && !b.closed) { views.rentals.paint(); return A.rentBalance({ id: b.id }); }                                       // completing = collecting the balance
  run(null, async () => { await rSetStatus(el.dataset.id, v, v === 'cancelled' ? { cancelledBy: 'admin', cancelledAt: Date.now(), cancelSlip: !!(b && (b.paidClaim || b.advanceVerified)) } : null); toast('Status: ' + v, 'ok'); });
};
const rNum = v => Math.max(0, Math.round(Number(v) || 0));
A.rentConfirm = d => {
  const b = rentBookings.find(x => x.id === d.id); if (!b) return;
  const needs = b.advanceDue > 0 && !b.advanceVerified;
  if (needs && !b.slipAt) { toast('No payment slip yet – use “Remind to attach slip”', 'err'); return; }
  const pi = payInfo(b), sy = rSys(b), t0 = pi.total || sy || 0;
  const m = modal(`<h2 class="mh">Confirm booking</h2><p class="msub">${esc(b.name)} · ${esc(b.spaceName)} · ${fmtDate(b.date)}</p>
    <div class="row2"><div class="field"><label>Final total (Rs)</label><input id="cfTotal" type="number" min="0" value="${t0}"/></div><div class="field"><label>Advance received (Rs)</label><input id="cfAdv" type="number" min="0" value="${b.advanceDue || 0}"/></div></div>
    <div class="notice" id="cfBal"></div>${needs ? '<p class="help" style="margin-top:8px">The payment slip will be <b>downloaded to this device</b> and then <b>deleted from the database</b> to free space.</p>' : ''}
    <div class="err" id="cfErr"></div><button class="btn btn-primary btn-block" id="cfGo" style="margin-top:10px">✔ Confirm booking</button>`);
  const calc = () => { const t = rNum(m.$('#cfTotal').value), a = rNum(m.$('#cfAdv').value); m.$('#cfBal').innerHTML = 'Balance to collect on the day: <b>' + rs(Math.max(0, t - a)) + '</b>'; }; calc();
  m.$('#cfTotal').oninput = m.$('#cfAdv').oninput = calc;
  m.$('#cfGo').onclick = () => {
    const t = rNum(m.$('#cfTotal').value), a = rNum(m.$('#cfAdv').value), er = m.$('#cfErr'); er.textContent = '';
    if (t <= 0) { er.textContent = 'Enter the final total.'; return; } if (a > t) { er.textContent = 'Advance cannot be more than the total.'; return; }
    m.close(); run(null, async () => {
      const now = Date.now(), extra = { totalFinal: t, advanceVerified: true, advanceReceived: a, advanceReceivedAt: now };
      if (needs) { await rTakeSlip(b, 'advance'); extra.slipDeleted = true; }
      if (t - a <= 0) Object.assign(extra, { closed: true, closedAt: now, balanceVerified: true, balanceReceived: 0, balanceReceivedAt: now });
      await rSetStatus(b.id, 'confirmed', extra); toast('Booking confirmed' + (needs ? ' – slip downloaded & removed from the database' : ''), 'ok');
    });
  };
};
A.rentBalance = d => {
  const b = rentBookings.find(x => x.id === d.id); if (!b) return; const pi = payInfo(b);
  if (!pi.advPaid && pi.advance > 0) { toast('Confirm the advance first', 'err'); return; }
  const m = modal(`<h2 class="mh">${b.balanceSlipAt ? 'Verify balance & close' : 'Mark balance paid'}</h2><p class="msub">${esc(b.name)} · ${esc(b.spaceName)} · ${fmtDate(b.date)} · Total ${rs(pi.total)}</p>
    <div class="field"><label>Balance received (Rs)</label><input id="blAmt" type="number" min="0" value="${pi.balance}"/></div>
    ${b.balanceSlipAt ? '<p class="help">The balance slip will be <b>downloaded to this device</b> and then <b>deleted from the database</b>.</p>' : '<p class="help">No slip attached – use this for cash / paid at the venue.</p>'}
    <div class="err" id="blErr"></div><button class="btn btn-primary btn-block" id="blGo">✔ Balance paid – close transaction</button>`);
  m.$('#blGo').onclick = () => {
    const n = rNum(m.$('#blAmt').value); if (n <= 0 && pi.balance > 0) { m.$('#blErr').textContent = 'Enter the amount received.'; return; } m.close();
    run(null, async () => {
      const now = Date.now(), extra = { balanceVerified: true, balanceReceived: n, balanceReceivedAt: now, closed: true, closedAt: now };
      if (b.balanceSlipAt) { await rTakeSlip(b, 'balance'); extra.balanceSlipDeleted = true; } else extra.balanceManual = true;
      await rSetStatus(b.id, 'completed', extra); toast('Balance recorded – transaction closed', 'ok');
    });
  };
};
A.rentSlip = d => run(null, async () => {
  const b = rentBookings.find(x => x.id === d.id), kind = d.kind === 'balance' ? 'balance' : 'advance', snap = await db.collection('rentSlips').doc(rSlipId({ id: d.id }, kind)).get();
  if (!snap.exists) { toast('Slip not found (already removed)', 'err'); return; }
  const sl = snap.data(), url = URL.createObjectURL(await rSlipBlob(sl)), pi = b ? payInfo(b) : { advance: 0, balance: 0 };
  const m = modal(`<h2 class="mh">${kind === 'balance' ? 'Balance' : 'Advance'} payment slip</h2><p class="msub">${esc(b ? b.name : '')} · ${kind === 'balance' ? 'balance ' + rs(pi.balance) : 'advance ' + rs(b ? b.advanceDue : 0)} · ${esc(sl.name || '')}</p>
    ${sl.type === 'application/pdf' ? `<object data="${url}" type="application/pdf" style="width:100%;height:60vh;border-radius:10px;background:#fff"><p class="help">Your browser cannot preview PDFs here – use “Download only”.</p></object>` : `<img src="${url}" alt="slip" style="max-width:100%;max-height:62vh;display:block;margin:auto;border-radius:10px"/>`}
    <p class="help" style="margin-top:10px">Use ${kind === 'balance' ? '“Verify balance &amp; close”' : '“Confirm booking”'} to approve – the slip is then downloaded and removed from the database automatically.</p><button class="btn btn-ghost btn-block" id="slDl">⬇ Download only (keep in database)</button>`, { wide: true, onClose: () => URL.revokeObjectURL(url) });
  m.$('#slDl').onclick = () => rDownloadSlip(b || { name: 'customer', date: '', id: d.id }, sl, kind);
});
A.rentDel = async d => {
  const b = rentBookings.find(x => x.id === d.id); if (!b) return;
  if (!await confirmBox('Delete the booking of <b>' + esc(b.name) + '</b>? (It stays in the Google Sheet, marked Cancelled.)', { okText: 'Delete', danger: true, title: 'Delete booking?' })) return;
  run(null, async () => { if (b.status !== 'cancelled' && (b.blocks || []).length) { const bt = db.batch(); lockOps(bt, b.spaceId, b.date, b.blocks, b.id, true); await bt.commit(); }
    await db.collection('rentSlips').doc(d.id).delete(); await db.collection('rentSlips').doc(d.id + '_bal').delete(); await db.collection('rentBookings').doc(d.id).delete(); toast('Deleted', 'ok'); sheetRent([d.id]); });
};
/* rebuilds the hour availability of all upcoming days from the bookings (also covers bookings made before this feature existed) */
A.rentSyncLocks = (d, btn) => run(btn, async () => {
  const today = todayStr(), groups = {}, ops = [];
  rentBookings.forEach(b => {
    if (b.status === 'cancelled' || !b.endTime || !b.date || b.date < today) return;
    const ks = blocksOf(b.startTime, b.endTime), id = availId(b.spaceId, b.date); if (!ks.length) return;
    const g = groups[id] || (groups[id] = {}); ks.forEach(k => { g[k] = true; });
    if (JSON.stringify(b.blocks || []) !== JSON.stringify(ks)) ops.push({ t: 'upd', ref: db.collection('rentBookings').doc(b.id), data: { blocks: ks } });
  });
  const old = await db.collection('rentLocks').get();
  old.forEach(x => { if (!groups[x.id] && x.id.slice(-10) >= today && Object.keys(x.data().blocks || {}).length) groups[x.id] = {}; });   // stale locks of cancelled / deleted bookings
  Object.keys(groups).forEach(id => { ops.push({ t: 'set', ref: db.collection('rentLocks').doc(id), data: { blocks: groups[id], last: '' } }); ops.push({ t: 'set', ref: db.collection('rentAvail').doc(id), data: { blocks: groups[id] } }); });
  await commitOps(ops); toast('Hour availability updated (' + Object.keys(groups).length + ' day/space records)', 'ok');
});
A.rentSeed = (d, btn) => run(btn, async () => {
  for (const sp of rMerged()) { if (rDoc(sp.id)) continue; const o = JSON.parse(JSON.stringify(sp)); delete o.photos; o.updatedAt = Date.now(); await db.collection('spaces').doc(sp.id).set(o); }
  toast('Saved', 'ok'); sheetRentSpaces('Initial rates saved from the brochure');
});
