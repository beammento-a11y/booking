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
      <br>${within ? '<span class="badge b-ok">inside refund period</span>' : '<span class="badge b-red">LATE – outside refund period</span>'}</div></div>
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
    const sum = t => ent.filter(e => e.type === t).reduce((a, e) => a + e.amt, 0), adv = sum('Advance'), bal = sum('Balance'), ref = -sum('Refund'), net = adv + bal - ref;
    const conf = rentBookings.filter(b => b.status === 'confirmed' && !b.closed), toCollect = conf.reduce((a, b) => a + payInfo(b).balance, 0);
    const advAwait = rentBookings.filter(b => b.status === 'pending' && b.slipAt).reduce((a, b) => a + (b.advanceDue || 0), 0), owed = fRefunds().filter(b => b.refundStatus === 'requested').reduce((a, b) => a + (b.refundAmount || 0), 0);
    const spaces = {}; ent.forEach(e => { const k = e.b.spaceName || e.b.spaceId; const o = spaces[k] = spaces[k] || { ids: new Set(), got: 0, ref: 0 }; o.ids.add(e.b.id); if (e.amt > 0) o.got += e.amt; else o.ref -= e.amt; });
    // last 12 months net (always)
    const mm = []; for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); mm.push([k, all.filter(e => fDay(e.t).startsWith(k)).reduce((a, e) => a + e.amt, 0)]); }
    const mx = Math.max(1, ...mm.map(x => Math.abs(x[1])));
    view.innerHTML = `<div class="card box"><div class="fr" style="gap:10px;flex-wrap:wrap;align-items:center"><b>Period</b><select data-chg="incPer" style="max-width:220px"><option value="all" ${incPeriod === 'all' ? 'selected' : ''}>All time</option>${years.map(y => `<option value="${y}" ${incPeriod === y ? 'selected' : ''}>Year ${y}</option>`).join('')}${months.map(m => `<option value="${m}" ${incPeriod === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" data-act="incCsv">⬇ Download CSV</button><button class="btn btn-ghost btn-sm" data-act="incPrint">🖨 Print / PDF</button><span class="muted">cash basis – money counted on the day it was verified / refunded</span></div></div>
    <div class="stats"><div class="card stat"><i>💰</i><div><b>${rs(adv)}</b><span>Advances received</span></div></div><div class="card stat"><i>🧾</i><div><b>${rs(bal)}</b><span>Balances received</span></div></div><div class="card stat"><i>💸</i><div><b>${rs(ref)}</b><span>Refunds paid</span></div></div><div class="card stat" style="background:linear-gradient(135deg,rgba(47,210,122,.12),transparent)"><i>📈</i><div><b>${rs(net)}</b><span>NET INCOME</span></div></div></div>
    <div class="stats"><div class="card stat"><i>⏳</i><div><b>${rs(toCollect)}</b><span>Balances still to collect (${conf.length} confirmed)</span></div></div><div class="card stat"><i>📎</i><div><b>${rs(advAwait)}</b><span>Advances awaiting verification</span></div></div><div class="card stat"><i>↩️</i><div><b>${rs(owed)}</b><span>Refunds waiting to be paid</span></div></div></div>
    <div class="card box"><h3>Last 12 months – net income</h3><div style="display:flex;gap:6px;align-items:flex-end;height:130px">${mm.map(([k, v]) => `<div style="flex:1;text-align:center;font-size:10px" title="${monthLabel(k)}: ${rs(v)}"><div style="height:${Math.round(Math.abs(v) / mx * 100)}px;background:${v < 0 ? 'var(--red)' : 'var(--blue2)'};border-radius:6px 6px 0 0;min-height:2px"></div>${k.slice(5)}</div>`).join('')}</div></div>
    <div class="card box"><h3>By space</h3>${Object.keys(spaces).length ? `<div class="tw"><table><thead><tr><th>Space</th><th>Bookings</th><th>Received</th><th>Refunds</th><th>Net</th></tr></thead><tbody>${Object.entries(spaces).map(([k, o]) => `<tr><td><b>${esc(k)}</b></td><td>${o.ids.size}</td><td>${rs(o.got)}</td><td>${rs(o.ref)}</td><td><b>${rs(o.got - o.ref)}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No income in this period.</p>'}</div>
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
A.incPrint = () => {
  const ent = incCur(), g = t => ent.filter(e => e.type === t).reduce((a, e) => a + e.amt, 0), w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print', 'err'); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Income ${esc(incPeriod)}</title><style>body{font:14px Arial;padding:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#eee}h1{margin:0 0 6px}</style>
    <h1>Mentobeam – Rental income (${incPeriod === 'all' ? 'All time' : esc(incPeriod)})</h1><p>Advances ${rs(g('Advance'))} · Balances ${rs(g('Balance'))} · Refunds ${rs(-g('Refund'))} · <b>Net ${rs(g('Advance') + g('Balance') + g('Refund'))}</b></p>
    <table><tr><th>Date</th><th>Type</th><th>Customer</th><th>Space</th><th>Booking date</th><th>Amount</th></tr>${ent.map(e => `<tr><td>${fDay(e.t)}</td><td>${e.type}</td><td>${esc(e.b.name)}</td><td>${esc(e.b.spaceName)}</td><td>${esc(e.b.date)}</td><td style="text-align:right">${e.amt < 0 ? '−' : ''}${rs(Math.abs(e.amt))}</td></tr>`).join('')}</table>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
};
