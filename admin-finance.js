/* Admin → Refunds (separate page) and Income (reports). Loaded after admin-rentals.js; uses the same live rentBookings list. */
var refTab = 'requested', incPeriod = '';
PERMS.refunds = 'Refunds (cancelled bookings)'; ALLPERMS.refunds = true;
PERMS.income = 'Income report'; ALLPERMS.income = true;
{ const i = NAV.findIndex(n => n.id === 'content');
  NAV.splice(i, 0, { id: 'refunds', icon: '💸', label: 'Refunds', perm: 'refunds' }, { id: 'income', icon: '📈', label: 'Income', perm: 'income' }); }

const fWhen = t => t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fDay = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
const fRefunds = () => rentBookings.filter(b => b.refundStatus);
const _refresh = window.refresh;
window.refresh = function () { _refresh.apply(this, arguments); finBadge(); };
function finBadge() {
  const a = $('#nav a[data-nav=refunds]'); if (!a) return; const n = fRefunds().filter(b => b.refundStatus === 'requested').length; let bd = a.querySelector('.badge');
  if (!n) { if (bd) bd.remove(); return; } if (!bd) { bd = document.createElement('span'); bd.className = 'badge b-red'; bd.style.marginLeft = '6px'; a.appendChild(bd); } bd.textContent = n;
}

/* ===================== REFUNDS ===================== */
const fRefMsg = (b, kind) => {
  const amt = rs(b.refundPaidAmount != null ? b.refundPaidAmount : (b.refundAmount || 0)), base = 'Hi ' + b.name + ', ';
  if (kind === 'paid') return base + 'your refund of ' + amt + ' for your ' + b.spaceName + ' booking on ' + fmtDate(b.date) + ' has been transferred to your ' + b.refundBank + ' account (' + rMask(b.refundAccNo) + '). Please check your account and reply to confirm. Thank you – Mentobeam.';
  if (kind === 'reject') return base + 'we are sorry, your refund request for the ' + b.spaceName + ' booking on ' + fmtDate(b.date) + ' could not be approved. ' + (b.refundRejectReason || '') + ' Please contact us for details – Mentobeam.';
  return base + 'we received your refund request of ' + amt + ' for the ' + b.spaceName + ' booking on ' + fmtDate(b.date) + '. It will be transferred to your ' + b.refundBank + ' account (' + rMask(b.refundAccNo) + ') within ' + ((rentalCfg && rentalCfg.refundHours) || 48) + ' hours. – Mentobeam';
};
views.refunds = {
  render() { this.paint(); },
  refresh() { const ae = document.activeElement; if (ae && view.contains(ae) && ['INPUT', 'TEXTAREA'].includes(ae.tagName)) return; this.paint(); },
  paint() {
    if (current !== 'refunds') return;
    const all = fRefunds(), by = s => all.filter(b => b.refundStatus === s), owed = by('requested').reduce((a, b) => a + (b.refundAmount || 0), 0);
    const list = (refTab === 'all' ? all : by(refTab)).sort((a, b) => (b.refundRequestedAt || 0) - (a.refundRequestedAt || 0));
    const tabs = [['requested', 'Requested (' + by('requested').length + ')'], ['paid', 'Paid (' + by('paid').length + ')'], ['rejected', 'Rejected (' + by('rejected').length + ')'], ['all', 'All']];
    view.innerHTML = `<div class="stats"><div class="card stat"><i>💸</i><div><b>${rs(owed)}</b><span>Refunds waiting to be paid</span></div></div><div class="card stat"><i>✅</i><div><b>${rs(by('paid').reduce((a, b) => a + (b.refundPaidAmount || 0), 0))}</b><span>Refunded so far</span></div></div></div>
      <div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${refTab === k ? 'on' : ''}" data-act="refTab" data-t="${k}">${t}</button>`).join('')}</div>
      ${list.length ? list.map(refCard).join('') : '<div class="card box"><div class="empty"><div class="ei">🎉</div><p>No refund requests here.</p></div></div>'}`;
  }
};
function refCard(b) {
  const pi = payInfo(b), within = rRefundWithin(b), st = b.refundStatus;
  const bank = (l, v, cp) => `<div class="drow"><span>${l}</span><b>${esc(v)}</b>${cp ? ` <button class="btn btn-ghost btn-sm" data-act="refCopy" data-v="${esc(v)}">Copy</button>` : ''}</div>`;
  return `<div class="card box" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <div><h3 style="margin:0">${esc(b.name)} <span class="badge ${st === 'paid' ? 'b-ok' : st === 'rejected' ? 'b-red' : 'b-warn'}">${st === 'paid' ? '✓ refunded' : st === 'rejected' ? 'rejected' : 'refund requested'}</span></h3>
      <div class="muted" style="font-size:13px;margin-top:3px">${esc(b.spaceName)} · ${esc(b.packageName)} · ${fmtDate(b.date)}${b.endTime ? ' · ' + fmtTime(b.startTime) + ' – ' + fmtTime(b.endTime) : ''}<br>Cancelled by <b>${b.cancelledBy === 'admin' ? 'organiser' : 'customer'}</b> on ${fWhen(b.cancelledAt)} · requested ${fWhen(b.refundRequestedAt)}
      <br>${within ? '<span class="badge b-ok">inside refund period</span>' : '<span class="badge b-red">LATE – outside refund period</span>'}</div>${rCancelProof(b)}</div>
    <div style="text-align:right"><div class="muted" style="font-size:12px">Refund amount</div><b style="font-size:26px;color:var(--red)">${rs(st === 'paid' && b.refundPaidAmount != null ? b.refundPaidAmount : (b.refundAmount || 0))}</b><div class="muted" style="font-size:12px">Total ${rs(pi.total)} · advance ${rs(pi.advance)} ${pi.advPaid ? '(verified)' : '(not verified)'}</div></div></div>
    <div class="grid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:12px">
      <div><b>Pay to this bank account</b>${bank('Bank', b.refundBank)}${bank('Account name', b.refundAccName)}${bank('Account number', b.refundAccNo, true)}${bank('Amount', String(b.refundAmount || 0), true)}</div>
      <div><b>Customer</b>${bank('WhatsApp', '+' + (b.refundWhatsapp || waDigits(b.phone)))}${bank('Phone', b.phone)}${bank('Email', b.email)}${b.refundNote ? `<div class="drow"><span>Note</span><i>“${esc(b.refundNote)}”</i></div>` : ''}${b.refundRejectReason ? `<div class="drow"><span>Reason</span><b>${esc(b.refundRejectReason)}</b></div>` : ''}
        ${st === 'paid' ? `<div class="drow"><span>Refunded</span><b>${fWhen(b.refundPaidAt)}${b.refundRef ? ' · ref ' + esc(b.refundRef) : ''}</b></div>` : ''}${b.refundMsgSentAt ? `<div class="drow"><span>WhatsApp sent</span><b>${fWhen(b.refundMsgSentAt)}</b></div>` : ''}</div></div>
    <div class="acts" style="margin-top:12px;flex-wrap:wrap">
      ${st === 'requested' ? `<button class="btn btn-ghost btn-sm" data-act="refWa" data-id="${b.id}" data-k="ack">💬 WhatsApp: request received</button><button class="btn btn-primary btn-sm" data-act="refPaid" data-id="${b.id}">✔ Refund paid – confirm</button><button class="btn btn-danger btn-sm" data-act="refReject" data-id="${b.id}">✖ Reject</button>` : ''}
      ${st === 'paid' ? `<button class="btn btn-ghost btn-sm" data-act="refWa" data-id="${b.id}" data-k="paid">💬 Send WhatsApp confirmation again</button>` : ''}
      ${st !== 'requested' && b.slipAt && !b.slipDeleted && !b.advanceVerified ? `<button class="btn btn-ghost btn-sm" data-act="rentSlip" data-id="${b.id}">👁 View advance slip</button>` : ''}
      ${st === 'requested' && b.slipAt && !b.slipDeleted && !b.advanceVerified ? `<button class="btn btn-ghost btn-sm" data-act="rentSlip" data-id="${b.id}">👁 View advance slip</button>` : ''}</div></div>`;
}
A.refTab = d => { refTab = d.t; views.refunds.paint(); };
A.refCopy = d => { try { navigator.clipboard.writeText(d.v); toast('Copied', 'ok'); } catch (e) { /* ignore */ } };
A.refWa = d => {   // opens the direct WhatsApp message and records that it was sent
  const b = rentBookings.find(x => x.id === d.id); if (!b) return;
  window.open(waLink(b.refundWhatsapp || b.phone, fRefMsg(b, d.k)), '_blank', 'noopener');
  run(null, async () => { await db.collection('rentBookings').doc(b.id).update({ refundMsgSentAt: Date.now() }); });
};
A.refPaid = d => {
  const b = rentBookings.find(x => x.id === d.id); if (!b) return;
  const m = modal(`<h2 class="mh">Confirm refund made</h2><p class="msub">Only confirm after you transferred the money to <b>${esc(b.refundBank)}</b> · ${esc(b.refundAccName)} · <b>${esc(b.refundAccNo)}</b>.</p>
    <div class="row2"><div class="field"><label>Amount refunded (Rs)</label><input id="rfAmt" type="number" min="0" value="${b.refundAmount || 0}"/></div><div class="field"><label>Bank reference (optional)</label><input id="rfRef" placeholder="Transaction / reference no."/></div></div>
    <p class="help">After confirming, the WhatsApp confirmation message for the customer opens (${esc(waDigits(b.refundWhatsapp || b.phone))}).${b.slipAt && !b.slipDeleted && !b.advanceVerified ? ' The unverified advance slip is downloaded and deleted from the database.' : ''}</p>
    <div class="err" id="rfErr"></div><button class="btn btn-primary btn-block" id="rfGo">✔ Refund made</button>`);
  m.$('#rfGo').onclick = () => {
    const n = Math.round(Number(m.$('#rfAmt').value) || 0); if (n <= 0) { m.$('#rfErr').textContent = 'Enter the amount refunded.'; return; }
    const ref = m.$('#rfRef').value.trim().slice(0, 60); m.close();
    run(null, async () => {
      const extra = { refundStatus: 'paid', refundPaidAmount: n, refundPaidAt: Date.now(), refundRef: ref };
      if (b.slipAt && !b.slipDeleted && !b.advanceVerified) { await rTakeSlip(b, 'advance'); extra.slipDeleted = true; }
      await db.collection('rentBookings').doc(b.id).update(extra); sheetRent([b.id]); toast('Refund recorded', 'ok');
      const b2 = Object.assign({}, b, extra), m2 = modal(`<div style="text-align:center"><div style="font-size:46px">✅</div><h2 class="mh" style="padding:0">Refund confirmed</h2><p class="msub">Send the direct WhatsApp message to ${esc(b.name)}.</p>
        <a class="btn btn-primary btn-block btn-lg" id="waGo" target="_blank" rel="noopener" href="${waLink(b.refundWhatsapp || b.phone, fRefMsg(b2, 'paid'))}">💬 Send WhatsApp message</a></div>`);
      m2.$('#waGo').onclick = () => { db.collection('rentBookings').doc(b.id).update({ refundMsgSentAt: Date.now() }).catch(() => { }); };
    });
  };
};
A.refReject = d => {
  const b = rentBookings.find(x => x.id === d.id); if (!b) return;
  const m = modal(`<h2 class="mh">Reject refund</h2><p class="msub">${esc(b.name)} · ${rs(b.refundAmount || 0)}${rRefundWithin(b) ? '' : ' · <b>outside the refund period</b>'}</p><div class="field"><label>Reason (sent to the customer)</label><textarea id="rjR" placeholder="e.g. Cancelled inside the no-refund period"></textarea></div><div class="err" id="rjE"></div><button class="btn btn-danger btn-block" id="rjGo">Reject refund</button>`);
  m.$('#rjGo').onclick = () => { const r = m.$('#rjR').value.trim().slice(0, 200); if (!r) { m.$('#rjE').textContent = 'Please give a reason.'; return; } m.close();
    run(null, async () => { await db.collection('rentBookings').doc(b.id).update({ refundStatus: 'rejected', refundRejectReason: r, refundPaidAt: Date.now() }); sheetRent([b.id]); toast('Refund rejected', 'ok');
      const m2 = modal(`<div style="text-align:center"><h2 class="mh" style="padding:0">Refund rejected</h2><p class="msub">Let the customer know on WhatsApp.</p><a class="btn btn-primary btn-block btn-lg" target="_blank" rel="noopener" href="${waLink(b.refundWhatsapp || b.phone, fRefMsg(Object.assign({}, b, { refundRejectReason: r }), 'reject'))}">💬 Send WhatsApp message</a></div>`); }); };
};

/* ===================== INCOME ===================== */
function incEntries() {
  const e = [];
  rentBookings.forEach(b => {
    if (b.advanceVerified && b.advanceReceived > 0 && b.advanceReceivedAt) e.push({ t: b.advanceReceivedAt, type: 'Advance', amt: b.advanceReceived, b });
    if (b.balanceVerified && b.balanceReceived > 0 && b.balanceReceivedAt) e.push({ t: b.balanceReceivedAt, type: 'Balance', amt: b.balanceReceived, b });
    if (b.refundStatus === 'paid' && b.refundPaidAmount > 0 && b.refundPaidAt) e.push({ t: b.refundPaidAt, type: 'Refund', amt: -b.refundPaidAmount, b });
  });
  // PTE Simulation Exam fee – counted once the student is marked Present (that's when the fee is normally collected).
  // Uses the price saved on the booking itself; if that is missing/0 (an older booking, made before a price was set) it
  // falls back to the price currently configured in Website Content, so marking a student Present always counts the fee.
  const examPriceNow = Number((typeof siteData !== 'undefined' && siteData && siteData.examPrice) || 0);
  (typeof bookings !== 'undefined' ? bookings : []).forEach(b => {
    const price = b.price > 0 ? b.price : examPriceNow;
    if (b.attended === true && price > 0 && b.attendedAt) e.push({ t: b.attendedAt, type: 'Exam', amt: price, b: { id: b.id, name: b.name, phone: b.phone, spaceName: 'PTE Simulation Exam', packageName: b.examTitle || 'PTE Simulation Exam', date: b.date } });
  });
  // Mock test fee – counted once the student is marked Present (same rule as the simulation exam), with the same fallback
  // to the price currently configured in Mock Tests → Instructions, terms & WhatsApp.
  const mockPriceNow = Number((typeof mkCfg !== 'undefined' && mkCfg && mkCfg.price) || 0);
  (typeof mkBookings !== 'undefined' ? mkBookings : []).forEach(b => {
    const price = b.price > 0 ? b.price : mockPriceNow;
    if (b.attended === true && price > 0 && b.attendedAt) e.push({ t: b.attendedAt, type: 'Mock Test', amt: price, b: { id: b.id, name: b.name, phone: b.phone, spaceName: 'Mock Test', packageName: 'Mock Test', date: b.date } });
  });
  return e.sort((a, b) => b.t - a.t);
}
const incIn = (e, per) => !per || fDay(e.t).startsWith(per);
views.income = {
  render() { this.paint(); }, refresh() { const ae = document.activeElement; if (ae && view.contains(ae) && ae.tagName === 'SELECT') return; this.paint(); },
  paint() {
    if (current !== 'income') return;
    const all = incEntries(), now = fDay(Date.now()), months = [...new Set([now.slice(0, 7), ...all.map(e => fDay(e.t).slice(0, 7))])].sort().reverse(), years = [...new Set(months.map(m => m.slice(0, 4)))];
    if (incPeriod === '') incPeriod = now.slice(0, 7);
    const per = incPeriod === 'all' ? '' : incPeriod, ent = all.filter(e => incIn(e, per));
    const sum = t => ent.filter(e => e.type === t).reduce((a, e) => a + e.amt, 0), adv = sum('Advance'), bal = sum('Balance'), ref = -sum('Refund'), exam = sum('Exam'), mock = sum('Mock Test'), net = adv + bal + exam + mock - ref;
    const conf = rentBookings.filter(b => b.status === 'confirmed' && !b.closed), toCollect = conf.reduce((a, b) => a + payInfo(b).balance, 0);
    const advAwait = rentBookings.filter(b => b.status === 'pending' && b.slipAt).reduce((a, b) => a + (b.advanceDue || 0), 0), owed = fRefunds().filter(b => b.refundStatus === 'requested').reduce((a, b) => a + (b.refundAmount || 0), 0);
    const spaces = {}; ent.forEach(e => { const k = e.b.spaceName || e.b.spaceId; const o = spaces[k] = spaces[k] || { ids: new Set(), got: 0, ref: 0 }; o.ids.add(e.b.id); if (e.amt > 0) o.got += e.amt; else o.ref -= e.amt; });
    // last 12 months net (always)
    const mm = []; for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); mm.push([k, all.filter(e => fDay(e.t).startsWith(k)).reduce((a, e) => a + e.amt, 0)]); }
    const mx = Math.max(1, ...mm.map(x => Math.abs(x[1])));
    view.innerHTML = `<div class="card box"><div class="fr" style="gap:10px;flex-wrap:wrap;align-items:center"><b>Period</b><select data-chg="incPer" style="max-width:220px"><option value="all" ${incPeriod === 'all' ? 'selected' : ''}>All time</option>${years.map(y => `<option value="${y}" ${incPeriod === y ? 'selected' : ''}>Year ${y}</option>`).join('')}${months.map(m => `<option value="${m}" ${incPeriod === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" data-act="incCsv">⬇ Download CSV</button><button class="btn btn-primary btn-sm" data-act="incPdf">⬇ Full system report (PDF)</button><span class="muted">cash basis – money counted on the day it was verified / refunded</span></div></div>
    <div class="stats"><div class="card stat"><i>💰</i><div><b>${rs(adv)}</b><span>Advances received</span></div></div><div class="card stat"><i>🧾</i><div><b>${rs(bal)}</b><span>Balances received</span></div></div><div class="card stat"><i>📝</i><div><b>${rs(exam)}</b><span>Exam fees received</span></div></div><div class="card stat"><i>📝</i><div><b>${rs(mock)}</b><span>Mock test fees received</span></div></div><div class="card stat"><i>💸</i><div><b>${rs(ref)}</b><span>Refunds paid</span></div></div><div class="card stat" style="background:linear-gradient(135deg,rgba(47,210,122,.12),transparent)"><i>📈</i><div><b>${rs(net)}</b><span>NET INCOME</span></div></div></div>
    <div class="stats"><div class="card stat"><i>⏳</i><div><b>${rs(toCollect)}</b><span>Balances still to collect (${conf.length} confirmed)</span></div></div><div class="card stat"><i>📎</i><div><b>${rs(advAwait)}</b><span>Advances awaiting verification</span></div></div><div class="card stat"><i>↩️</i><div><b>${rs(owed)}</b><span>Refunds waiting to be paid</span></div></div></div>
    <div class="card box"><h3>Last 12 months – net income</h3><div style="display:flex;gap:6px;align-items:flex-end;height:130px">${mm.map(([k, v]) => `<div style="flex:1;text-align:center;font-size:10px" title="${monthLabel(k)}: ${rs(v)}"><div style="height:${Math.round(Math.abs(v) / mx * 100)}px;background:${v < 0 ? 'var(--red)' : 'var(--blue2)'};border-radius:6px 6px 0 0;min-height:2px"></div>${k.slice(5)}</div>`).join('')}</div></div>
    <div class="card box"><h3>By space / exam type</h3>${Object.keys(spaces).length ? `<div class="tw"><table><thead><tr><th>Space / type</th><th>Bookings</th><th>Received</th><th>Refunds</th><th>Net</th></tr></thead><tbody>${Object.entries(spaces).map(([k, o]) => `<tr><td><b>${esc(k)}</b></td><td>${o.ids.size}</td><td>${rs(o.got)}</td><td>${rs(o.ref)}</td><td><b>${rs(o.got - o.ref)}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No income in this period.</p>'}</div>
    <div class="card box"><h3>Transactions (${ent.length})</h3>${ent.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>Customer</th><th>Space / booking date</th><th style="text-align:right">Amount</th></tr></thead><tbody>${ent.map(e => `<tr><td>${fWhen(e.t)}</td><td><span class="badge ${e.type === 'Refund' ? 'b-red' : e.type === 'Advance' ? 'b-blue' : 'b-ok'}">${e.type}</span></td><td>${esc(e.b.name)}<br><span class="muted">${esc(e.b.phone)}</span></td><td>${esc(e.b.spaceName)} · ${fmtDate(e.b.date)}</td><td style="text-align:right;font-weight:700;color:${e.amt < 0 ? 'var(--red)' : 'inherit'}">${e.amt < 0 ? '−' : ''}${rs(Math.abs(e.amt))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No transactions in this period.</p>'}</div>`;
  }
};
C.incPer = el => { incPeriod = el.value; views.income.paint(); };
const incCur = () => { const per = incPeriod === 'all' ? '' : incPeriod; return incEntries().filter(e => incIn(e, per)); };
A.incCsv = () => {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', rows = [['Date', 'Type', 'Customer', 'Phone', 'Space', 'Package', 'Booking date', 'Amount (Rs)', 'Booking code']];
  incCur().forEach(e => rows.push([fDay(e.t), e.type, e.b.name, e.b.phone, e.b.spaceName, e.b.packageName, e.b.date, e.amt, e.b.id]));
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'income_' + (incPeriod || 'all') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
/* FULL SYSTEM REPORT = a formatted, downloadable PDF (logo, summary, by space, all bookings oldest first with payment + cancellation proof, cancellations with / without slip, refunds, transactions) */
const pdfT = v => String(v == null ? '' : v).replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, '?');   // the built-in PDF font only has Latin characters
const pdfLogo = async () => { try { const bl = await (await fetch('nav-logo.png')).blob(), d = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(bl); }); return d; } catch (e) { return null; } };
A.incPdf = async (d, btn) => {
  if (!window.jspdf || !window.jspdf.jsPDF) { toast('PDF library did not load (check internet)', 'err'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing PDF…'; }
  try {
    const logo = await pdfLogo(), ent = incCur(), g = t => ent.filter(e => e.type === t).reduce((a, e) => a + e.amt, 0), per = incPeriod === 'all' ? '' : incPeriod;
    const perLabel = !per ? 'All time' : (per.length === 4 ? 'Year ' + per : monthLabel(per));
    const bks = rentBookings.filter(b => !per || (b.date || '').startsWith(per)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const can = bks.filter(b => b.status === 'cancelled'), rfs = bks.filter(b => b.refundStatus), cnt = st => bks.filter(b => b.status === st).length;
    const owes = b => Number(b.advanceDue) > 0, canW = can.filter(b => owes(b) && rHadSlip(b)).length, canN = can.filter(b => owes(b) && !rHadSlip(b)).length;
    const sp = {}; bks.forEach(b => { const k = b.spaceName || b.spaceId, o = sp[k] = sp[k] || { n: 0, c: 0, x: 0, got: 0, ref: 0 }; o.n++; if (b.status === 'cancelled') o.x++; else if (b.status === 'completed') o.c++; });
    ent.forEach(e => { const o = sp[e.b.spaceName || e.b.spaceId]; if (o) { if (e.amt > 0) o.got += e.amt; else o.ref -= e.amt; } });
    const who = b => b.cancelledBy === 'admin' ? 'Organiser' : 'Customer', when = t => t ? fWhen(t) : '';
    const proof = b => !owes(b) ? 'No advance due' : (rHadSlip(b) ? 'WITH slip' : 'WITHOUT slip' + (b.cancelAck ? ' (warning accepted)' : ''));
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
    const NAVY = [6, 24, 47], RED = [192, 0, 26], BLUE = [11, 61, 145], GREY = [90, 107, 130];
    const who2 = pdfT((me && (me.name || me.email)) || 'admin'), stamp = fWhen(Date.now());
    const header = () => {
      doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, 64, 'F');
      if (logo) { try { doc.addImage(logo, 'PNG', M, 14, 150, 26.3); } catch (e) { logo = null; } }
      if (!logo) { doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...NAVY); doc.text('MENTOBEAM', M, 36); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); doc.text('Full System Report', W - M, 28, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY); doc.text('Rentals + Exam/Mock income  |  ' + pdfT(perLabel) + '  |  Generated ' + stamp + ' by ' + who2, W - M, 43, { align: 'right' });
      doc.setFillColor(...RED); doc.rect(0, 56, W, 4, 'F');
    };
    const card = (x, y, w, label, val, col) => { doc.setDrawColor(215, 222, 232); doc.setFillColor(247, 249, 252); doc.roundedRect(x, y, w, 46, 5, 5, 'FD'); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...(col || NAVY)); doc.text(pdfT(val), x + 10, y + 22); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY); doc.text(pdfT(label), x + 10, y + 36); };
    header(); let y = 84;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); doc.text('1. Summary', M, y); y += 10;
    const cw = (W - 2 * M - 7 * 8) / 8;
    [['Bookings', bks.length], ['Pending', cnt('pending')], ['Confirmed', cnt('confirmed')], ['Completed', cnt('completed')], ['Cancelled', can.length], ['Cancelled with slip', canW], ['Cancelled w/o slip', canN, RED], ['Refund requests', rfs.length]].forEach((c, k) => card(M + k * (cw + 8), y, cw, c[0], c[1], c[2]));
    y += 56; const cw2 = (W - 2 * M - 5 * 8) / 6;
    [['Advances received', rs(g('Advance'))], ['Balances received', rs(g('Balance'))], ['Exam fees', rs(g('Exam'))], ['Mock test fees', rs(g('Mock Test'))], ['Refunds paid', rs(Math.abs(g('Refund')))], ['NET INCOME', rs(g('Advance') + g('Balance') + g('Exam') + g('Mock Test') + g('Refund')), [18, 161, 80]]].forEach((c, k) => card(M + k * (cw2 + 8), y, cw2, c[0], c[1], c[2]));
    y += 62;
    const common = { margin: { top: 76, left: M, right: M, bottom: 34 }, theme: 'grid', styles: { fontSize: 8, cellPadding: 3.5, lineColor: [215, 222, 232], textColor: [30, 40, 55], overflow: 'linebreak' }, headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 249, 252] }, didDrawPage: header, rowPageBreak: 'avoid' };
    const section = (title, head, body, extra) => {
      if (y > H - 110) { doc.addPage(); y = 84; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); doc.text(title, M, y);
      doc.autoTable(Object.assign({}, common, { startY: y + 8, head: [head], body: body.length ? body : [[{ content: 'Nothing in this period.', colSpan: head.length, styles: { halign: 'center', textColor: GREY } }]] }, extra || {}));
      y = doc.lastAutoTable.finalY + 22;
    };
    const redCell = col => ({ didParseCell: h => { if (h.section === 'body' && h.column.index === col && /WITHOUT/.test(String(h.cell.raw))) { h.cell.styles.textColor = RED; h.cell.styles.fontStyle = 'bold'; } } });
    const R = { halign: 'right' };
    section('2. By space', ['Space', 'Bookings', 'Completed', 'Cancelled', 'Received', 'Refunds', 'Net'], Object.entries(sp).map(([k, o]) => [pdfT(k), o.n, o.c, o.x, rs(o.got), rs(o.ref), rs(o.got - o.ref)]), { columnStyles: { 4: R, 5: R, 6: Object.assign({ fontStyle: 'bold' }, R) } });
    section('3. All bookings (oldest first)', ['#', 'Booked on', 'Code', 'Customer', 'Space / package', 'Booking date & time', 'Total', 'Advance', 'Balance', 'Status', 'Cancellation proof'],
      bks.map((b, n) => { const pi = payInfo(b); return [n + 1, when(b.createdAt), b.id, pdfT(b.name) + '\n' + pdfT(b.phone), pdfT(b.spaceName) + '\n' + pdfT(b.packageName), pdfT(b.date) + (b.endTime ? '\n' + b.startTime + ' - ' + b.endTime : ''), rs(pi.total), rs(pi.advance) + (pi.advPaid ? ' (received)' : (b.slipAt ? ' (slip attached)' : (owes(b) ? ' (no slip)' : ''))), rs(pi.balance) + (pi.balPaid ? ' (paid)' : ''), b.status, b.status === 'cancelled' ? proof(b) + '\nby ' + who(b) + (b.cancelledAt ? '\n' + when(b.cancelledAt) : '') : '']; }),
      Object.assign({ styles: Object.assign({}, common.styles, { fontSize: 7 }), columnStyles: { 0: { cellWidth: 20 }, 2: { cellWidth: 62, font: 'courier', fontSize: 6 } } }, redCell(10)));
    section('4. Cancellations - with / without payment slip', ['Customer', 'Space', 'Booking date', 'Advance due', 'Slip', 'Cancelled by', 'Cancelled on', 'Refund'],
      can.map(b => [pdfT(b.name) + '\n' + pdfT(b.phone), pdfT(b.spaceName), pdfT(b.date), rs(b.advanceDue || 0), proof(b), who(b), when(b.cancelledAt), b.refundStatus ? b.refundStatus + ' - ' + rs(b.refundPaidAmount != null ? b.refundPaidAmount : (b.refundAmount || 0)) : 'none']), redCell(4));
    section('5. Refunds', ['Customer', 'Space / booking date', 'Status', 'Requested', 'Amount', 'Paid / decided', 'Bank reference / reason'],
      rfs.map(b => [pdfT(b.name), pdfT(b.spaceName) + '\n' + pdfT(b.date), b.refundStatus, when(b.refundRequestedAt), rs(b.refundStatus === 'paid' && b.refundPaidAmount != null ? b.refundPaidAmount : (b.refundAmount || 0)), when(b.refundPaidAt), pdfT(b.refundRef || b.refundRejectReason || '')]), { columnStyles: { 4: R } });
    section('6. Transactions (cash basis)', ['Date', 'Type', 'Customer', 'Space', 'Booking date', 'Amount'],
      ent.slice().reverse().map(e => [fDay(e.t), e.type, pdfT(e.b.name), pdfT(e.b.spaceName), pdfT(e.b.date), (e.amt < 0 ? '-' : '') + rs(Math.abs(e.amt))]), { columnStyles: { 5: R } });
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setDrawColor(215, 222, 232); doc.line(M, H - 26, W - M, H - 26); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY); doc.text('Mentobeam Skills & Innovation Center - Full System Report - ' + pdfT(perLabel) + ' - Confidential', M, H - 14); doc.text('Page ' + p + ' / ' + n, W - M, H - 14, { align: 'right' }); }
    doc.save('Mentobeam-full-system-report-' + (per || 'all-time') + '.pdf'); toast('Report downloaded', 'ok');
  } catch (e) { toast('Could not create the PDF: ' + errMsg(e), 'err'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '⬇ Full system report (PDF)'; } }
};
