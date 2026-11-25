/* Admin → Mock Tests. Loaded AFTER admin-rentals.js. Students send a mock test request from exam.html; here the admin approves / rejects it,
   sends the WhatsApp message and edits the instructions, terms and WhatsApp texts. Uses the existing "Registrations" permission. */
var mkBookings = [], mkCfg = {}, mkTab = 'pending', mkFirst = true;
NAV.splice(NAV.findIndex(n => n.id === 'registrations') + 1, 0, { id: 'mock', icon: '📝', label: 'Mock Tests', perm: 'bookings' });

const MK_DEF = {
  enabled: true, duration: 60, openTime: '09:00', closeTime: '18:00', step: 30, buffer: 0, maxDays: 60,
  intro: 'Practise a one-to-one mock test at a time that suits you. Pick a date, choose a free timing and send your request. We will confirm it on WhatsApp.',
  instructions: 'Choose a date, then one of the free timings shown.\nYour request is only a request – it is confirmed when the admin approves it.\nAfter approval we will message you on WhatsApp.\nYou can see the approval on this page under “My Mock Test Requests”.',
  terms: 'Arrive (or log in) 15 minutes before your approved time.\nA mock test cannot be moved to another time on the same day.\nIf you cannot come, cancel your request or message us on WhatsApp early.\nThe admin may change or reject a request if the time is not free.',
  waApproved: 'Hello {name}, your mock test request is APPROVED ✅\n\n📅 Date: {date}\n⏰ Time: {time}\n🔖 Code: {code}\n\n{note}\n\n– MentoBeam | Yes For PTE',
  waExtras: 'Please arrive 15 minutes early and bring a headset.',
  waRejected: 'Hello {name}, sorry – we could not approve your mock test request for {date} at {time}.\n{reason}\nYou are welcome to send a new request for another time.\n\n– MentoBeam | Yes For PTE'
};
const mkC = () => Object.assign({}, MK_DEF, mkCfg);
const mkMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const mkT = n => pad(Math.floor(n / 60)) + ':' + pad(n % 60);
const mkFill = (tpl, v) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
const mkVars = (b, extra) => Object.assign({ name: b.name, date: fmtDate(b.date), time: fmtTime(b.time) + ' – ' + fmtTime(b.endTime), code: b.id, note: b.approvedNote || '', reason: '' }, extra || {});
const mkEnd = (start, dur) => mkT(Math.min(mkMin(start) + dur, 23 * 60 + 59));

/* what is already taken on a day: simulation exam slots + other APPROVED mock tests */
function mkBusyOf(date, exceptId) {
  const out = [];
  slots.filter(s => s.date === date).forEach(s => out.push({ s: mkMin(s.time), e: mkMin(s.endTime || addMinutes(s.time, 120)), label: 'Simulation exam ' + slotLabel(s) }));
  mkBookings.filter(b => b.status === 'approved' && b.date === date && b.id !== exceptId).forEach(b => out.push({ s: mkMin(b.time), e: mkMin(b.endTime), label: 'Mock test ' + fmtTime(b.time) + ' – ' + fmtTime(b.endTime) + ' (' + b.name + ')' }));
  return out;
}
function mkConflict(date, start, end, exceptId) {
  const buf = Number(mkC().buffer) || 0, a = mkMin(start), z = mkMin(end);
  const hit = mkBusyOf(date, exceptId).find(x => a < x.e + buf && z > x.s - buf);
  return hit ? hit.label : '';
}
/* public list of approved times of one day (no names) – students read this to see what is taken */
async function mkSyncBusy(date) {
  const items = mkBookings.filter(b => b.status === 'approved' && b.date === date).map(b => ({ id: b.id, start: b.time, end: b.endTime }));
  const ref = db.collection('mockBusy').doc(date);
  if (items.length) await ref.set({ date, items }); else await ref.delete();
}

/* ---------- live data ---------- */
const _mkSubscribe = window.subscribe;
window.subscribe = function () {
  _mkSubscribe();
  if (!can('bookings')) return;
  const bad = e => toast('Mock tests: ' + errMsg(e), 'err');
  unsubs.push(db.collection('settings').doc('mock').onSnapshot(s => { mkCfg = s.exists ? s.data() : {}; refresh(); }, bad));
  unsubs.push(db.collection('mockBookings').onSnapshot(s => {
    if (!mkFirst) s.docChanges().forEach(c => { if (c.type === 'added' && c.doc.data().status === 'pending') toast('📝 New mock test request from ' + c.doc.data().name, 'ok'); });
    mkFirst = false; mkBookings = s.docs.map(d => ({ id: d.id, ...d.data() })); refresh();
  }, bad));
};
const _mkStop = window.stopApp;
window.stopApp = function () { mkBookings = []; mkCfg = {}; mkFirst = true; _mkStop(); };

/* ---------- the page ---------- */
views.mock = {
  render() { this.paint(); },
  refresh() {
    const ae = document.activeElement; if (ae && view.contains(ae) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName)) return;
    this.paint();
  },
  paint() {
    if (current !== 'mock') return;
    const n = st => mkBookings.filter(b => st.includes(b.status)).length, pend = n(['pending']);
    const tabs = [['pending', 'Requests' + (pend ? ' (' + pend + ' new)' : '')], ['approved', 'Approved (' + n(['approved']) + ')'], ['closed', 'Rejected / cancelled'], ['settings', 'Instructions, terms & WhatsApp']];
    view.innerHTML = `<div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${mkTab === k ? 'on' : ''}" data-act="mkTab" data-t="${k}">${t}</button>`).join('')}</div><div id="mkBody"></div>`;
    $('#mkBody').innerHTML = mkTab === 'settings' ? mkSettingsHTML() : mkListHTML();
  }
};
function mkBadge(b) {
  return b.status === 'approved' ? '<span class="badge b-ok">Approved</span>' : b.status === 'pending' ? '<span class="badge b-warn">Waiting</span>'
    : b.status === 'rejected' ? '<span class="badge b-red">Rejected</span>' : '<span class="badge b-gray">Cancelled' + (b.cancelledBy === 'admin' ? ' by admin' : '') + '</span>';
}
function mkListHTML() {
  const f = mkTab === 'pending' ? ['pending'] : mkTab === 'approved' ? ['approved'] : ['rejected', 'cancelled'];
  const list = mkBookings.filter(b => f.includes(b.status)).sort((a, b) => mkTab === 'pending' ? (a.createdAt || 0) - (b.createdAt || 0) : (b.date + b.time).localeCompare(a.date + a.time));
  if (!list.length) return `<div class="card box"><div class="empty">${mkTab === 'pending' ? 'No new mock test requests.' : 'Nothing here yet.'}</div></div>`;
  return list.map(b => {
    const c = b.status === 'pending' ? mkConflict(b.date, b.time, b.endTime, b.id) : '';
    const acts = [];
    if (b.status === 'pending') acts.push(`<button class="btn btn-primary btn-sm" data-act="mkApprove" data-id="${b.id}">✔ Approve</button><button class="btn btn-danger btn-sm" data-act="mkReject" data-id="${b.id}">✖ Reject</button>`);
    if (b.status === 'approved') acts.push(`<button class="btn btn-primary btn-sm" data-act="mkWa" data-id="${b.id}">💬 WhatsApp</button><button class="btn btn-ghost btn-sm" data-act="mkCancel" data-id="${b.id}">Cancel</button>`);
    if (b.status === 'rejected') acts.push(`<button class="btn btn-ghost btn-sm" data-act="mkWa" data-id="${b.id}">💬 WhatsApp</button>`);
    acts.push(`<button class="btn btn-ghost btn-sm" data-act="mkDel" data-id="${b.id}">🗑</button>`);
    return `<div class="card box"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div><h3 style="margin:0">${esc(b.name)} ${mkBadge(b)}</h3>
        <div style="margin-top:6px"><b>📅 ${fmtDate(b.date)}</b> · ⏰ ${fmtTime(b.time)} – ${fmtTime(b.endTime)} <span class="muted">(${b.duration || ''} min)</span></div>
        <div class="muted" style="font-size:13px;margin-top:4px">📞 ${esc(b.phone)} · ✉️ ${esc(b.email)}<br>Requested ${b.createdAt ? new Date(b.createdAt).toLocaleString('en-GB') : ''} · Code <span style="font-family:monospace">${b.id}</span></div>
        ${b.notes ? `<div style="margin-top:6px;font-size:13.5px">💬 ${esc(b.notes)}</div>` : ''}
        ${b.approvedNote ? `<div class="help" style="margin-top:6px;white-space:pre-wrap">Note sent: ${esc(b.approvedNote)}</div>` : ''}
        ${b.rejectReason ? `<div class="help" style="margin-top:6px">Reason: ${esc(b.rejectReason)}</div>` : ''}
        ${c ? `<div class="notice" style="margin:8px 0 0">⚠️ This time now overlaps with: ${esc(c)}. Change the time when you approve.</div>` : ''}</div>
      <div class="acts" style="flex-wrap:wrap">${acts.join('')}</div></div></div>`;
  }).join('');
}
function mkSettingsHTML() {
  const c = mkC(), f = (id, label, val, type = 'text', ph = '') => `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}"/></div>`;
  const ta = (id, label, val, help, h = 90) => `<div class="field"><label>${label}</label><textarea id="${id}" style="min-height:${h}px">${esc(val)}</textarea>${help ? `<p class="help">${help}</p>` : ''}</div>`;
  return `<div class="card box"><h3>Mock test settings</h3>
    <div class="row2"><div class="field"><label>Students can book mock tests</label><select id="mkOn"><option value="1" ${c.enabled !== false ? 'selected' : ''}>Yes – button visible</option><option value="0" ${c.enabled === false ? 'selected' : ''}>No – hide the button</option></select></div>
      ${f('mkDur', 'Length of one mock test (minutes)', c.duration, 'number')}</div>
    <div class="row2">${f('mkOpen', 'Mock tests start from', c.openTime, 'time')}${f('mkClose', 'Mock tests must finish by', c.closeTime, 'time')}</div>
    <div class="row2">${f('mkStep', 'Timing every … minutes', c.step, 'number')}${f('mkBuf', 'Gap before / after other sessions (minutes)', c.buffer, 'number')}</div>
    ${f('mkMax', 'How many days ahead can students book', c.maxDays, 'number')}
    ${ta('mkIntro', 'Short introduction (top of the form)', c.intro, '', 60)}
    ${ta('mkIns', 'Instructions shown in the form (one per line)', c.instructions, 'Each line becomes one point.', 110)}
    ${ta('mkTerms', 'Terms shown in the form (one per line)', c.terms, 'Students must tick “I agree” before sending a request.', 110)}</div>
    <div class="card box"><h3>WhatsApp messages</h3>
    <p class="help" style="margin-bottom:10px">After you approve (or reject) a request, press the WhatsApp button – WhatsApp opens with this message ready to send. You can change the text before sending. You can use: <b>{name}</b> <b>{date}</b> <b>{time}</b> <b>{code}</b> <b>{note}</b> <b>{reason}</b></p>
    ${ta('mkWaA', 'Message when APPROVED', c.waApproved, '', 170)}
    ${ta('mkWaX', 'Extra lines for the approved message (goes into {note}; you can change it for each student when approving)', c.waExtras, 'e.g. venue / online link, what to bring, payment details…', 90)}
    ${ta('mkWaR', 'Message when REJECTED', c.waRejected, '', 130)}
    <button class="btn btn-primary" data-act="mkSave">💾 Save settings</button></div>`;
}
A.mkTab = d => { mkTab = d.t; views.mock.paint(); };
A.mkSave = (d, btn) => run(btn, async () => {
  const v = id => $('#' + id).value, num = (id, def, lo, hi) => { const n = Number(v(id)); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : def; };
  const data = {
    enabled: v('mkOn') === '1', duration: num('mkDur', 60, 15, 480), openTime: v('mkOpen') || '09:00', closeTime: v('mkClose') || '18:00',
    step: num('mkStep', 30, 5, 240), buffer: num('mkBuf', 0, 0, 240), maxDays: num('mkMax', 60, 1, 365),
    intro: v('mkIntro').trim(), instructions: v('mkIns').trim(), terms: v('mkTerms').trim(), waApproved: v('mkWaA').trim(), waExtras: v('mkWaX').trim(), waRejected: v('mkWaR').trim(), updatedAt: Date.now()
  };
  if (mkMin(data.closeTime) <= mkMin(data.openTime)) throw new Error('“Finish by” must be later than “start from”.');
  await db.collection('settings').doc('mock').set(data, { merge: true }); mkCfg = Object.assign({}, mkCfg, data); toast('Saved', 'ok');
});

/* ---------- approve / reject ---------- */
const mkGet = id => mkBookings.find(x => x.id === id);
function mkWaModal(b, kind, reason) {
  const c = mkC(), text = mkFill(kind === 'rejected' ? c.waRejected : c.waApproved, mkVars(b, { reason: reason != null ? reason : (b.rejectReason || '') }));
  const m = modal(`<h2 class="mh">${kind === 'rejected' ? 'Request rejected' : 'Approved ✓'}</h2><p class="msub">Send this message to <b>${esc(b.name)}</b> (${esc(b.phone)}) on WhatsApp. You can edit it first.</p>
    <div class="field"><textarea id="mkMsg" style="min-height:230px">${esc(text)}</textarea></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary" id="mkSend" target="_blank" rel="noopener" href="#">💬 Open WhatsApp</a><button class="btn btn-ghost" id="mkCopy">Copy message</button><button class="btn btn-ghost" id="mkClose">Close</button></div>
    ${kind === 'rejected' ? '' : '<p class="help" style="margin-top:10px">The student can also see this approval on the exam page under “My Mock Test Requests”.</p>'}`);
  const upd = () => { m.$('#mkSend').href = waLink(b.phone, m.$('#mkMsg').value); };
  m.$('#mkMsg').oninput = upd; upd();
  m.$('#mkCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(m.$('#mkMsg').value).then(() => toast('Copied', 'ok')); };
  m.$('#mkClose').onclick = m.close;
}
A.mkWa = d => { const b = mkGet(d.id); if (b) mkWaModal(b, b.status === 'rejected' ? 'rejected' : 'approved'); };
A.mkApprove = d => {
  const b = mkGet(d.id); if (!b) return; const c = mkC(), dur = b.duration || c.duration;
  const m = modal(`<h2 class="mh">Approve mock test</h2><p class="msub"><b>${esc(b.name)}</b> · ${fmtDate(b.date)} · requested ${fmtTime(b.time)} – ${fmtTime(b.endTime)}</p>
    <div class="field"><label>Start time (change it if needed)</label><input id="apT" type="time" value="${b.time}"/><p class="help" id="apInfo"></p></div>
    <div class="field"><label>Note for the student (shown on their page and added to the WhatsApp message)</label><textarea id="apNote" style="min-height:90px">${esc(c.waExtras)}</textarea></div>
    <div class="err" id="apErr"></div><button class="btn btn-primary btn-block" id="apOk">✔ Approve</button>`);
  const info = () => { const t = m.$('#apT').value; if (!t) { m.$('#apInfo').textContent = ''; return; } const e = mkEnd(t, dur), x = mkConflict(b.date, t, e, b.id); m.$('#apInfo').innerHTML = 'Ends ' + fmtTime(e) + (x ? ' · <b style="color:var(--red)">⚠ overlaps: ' + esc(x) + '</b>' : ' · ✓ free'); };
  m.$('#apT').oninput = info; info();
  m.$('#apOk').onclick = () => run(m.$('#apOk'), async () => {
    const t = m.$('#apT').value; if (!t) { m.$('#apErr').textContent = 'Pick a start time.'; return; }
    const e = mkEnd(t, dur), x = mkConflict(b.date, t, e, b.id); if (x) { m.$('#apErr').textContent = 'This time overlaps: ' + x; return; }
    const upd = { status: 'approved', time: t, endTime: e, approvedNote: m.$('#apNote').value.trim(), decidedAt: Date.now(), decidedBy: me.name || me.email };
    await db.collection('mockBookings').doc(b.id).update(upd);
    Object.assign(b, upd);                                                   // use the new values right away (the live update arrives a moment later)
    await mkSyncBusy(b.date); m.close(); toast('Approved', 'ok'); mkWaModal(b, 'approved');
  });
};
A.mkReject = d => {
  const b = mkGet(d.id); if (!b) return;
  const m = modal(`<h2 class="mh">Reject request</h2><p class="msub"><b>${esc(b.name)}</b> · ${fmtDate(b.date)} · ${fmtTime(b.time)} – ${fmtTime(b.endTime)}</p>
    <div class="field"><label>Reason (shown to the student and added to the WhatsApp message)</label><textarea id="rjR" style="min-height:80px" placeholder="e.g. That time is not available."></textarea></div>
    <button class="btn btn-danger btn-block" id="rjOk">✖ Reject</button>`);
  m.$('#rjOk').onclick = () => run(m.$('#rjOk'), async () => {
    const reason = m.$('#rjR').value.trim().slice(0, 300), upd = { status: 'rejected', rejectReason: reason, decidedAt: Date.now(), decidedBy: me.name || me.email };
    await db.collection('mockBookings').doc(b.id).update(upd); Object.assign(b, upd); m.close(); toast('Rejected', 'ok'); mkWaModal(b, 'rejected', reason);
  });
};
A.mkCancel = async d => {
  const b = mkGet(d.id); if (!b) return;
  if (!await confirmBox('Cancel the approved mock test of <b>' + esc(b.name) + '</b> on ' + fmtDate(b.date) + '? The time becomes free again.', { okText: 'Cancel it', danger: true, title: 'Cancel mock test?' })) return;
  run(null, async () => { await db.collection('mockBookings').doc(b.id).update({ status: 'cancelled', cancelledBy: 'admin', cancelledAt: Date.now() }); b.status = 'cancelled'; await mkSyncBusy(b.date); toast('Cancelled', 'ok'); });
};
A.mkDel = async d => {
  const b = mkGet(d.id); if (!b) return;
  if (!await confirmBox('Delete the request of <b>' + esc(b.name) + '</b>? This cannot be undone.', { okText: 'Delete', danger: true, title: 'Delete request?' })) return;
  run(null, async () => { const was = b.status === 'approved'; await db.collection('mockBookings').doc(b.id).delete(); mkBookings = mkBookings.filter(x => x.id !== b.id); if (was) await mkSyncBusy(b.date); toast('Deleted', 'ok'); views.mock.paint(); });
};
