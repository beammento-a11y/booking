/* Admin → Mock Tests. Loaded AFTER admin-rentals.js. The admin adds mock test TIME SLOTS (with seats, like the exam), students request a slot from exam.html,
   and here the admin approves / rejects, sends the WhatsApp message and edits the instructions, terms and WhatsApp texts. Uses the "Registrations" permission. */
var mkBookings = [], mkSlots = [], mkCfg = {}, mkTab = 'pending', mkFirst = true, mkLastDate = '', mkAvail = {}, mkAvailReady = false, mkBkReady = false;
NAV.splice(NAV.findIndex(n => n.id === 'registrations') + 1, 0, { id: 'mock', icon: '📝', label: 'Mock Tests', perm: 'bookings' });

const MK_DEF = {
  enabled: true, maxDays: 60, freeOn: true, openTime: '09:00', closeTime: '18:00', duration: 60, price: 0,
  intro: 'Practise a one-to-one mock test at a time that suits you. Pick a date, choose a time slot and send your request. We will confirm it on WhatsApp.',
  instructions: 'Choose a date, then one of the time slots shown.\nYour request is only a request – it is confirmed when the admin approves it.\nAfter approval we will message you on WhatsApp.\nYou can see the approval on this page under “My Mock Test Requests”.',
  terms: 'Arrive (or log in) 15 minutes before your approved time.\nA mock test cannot be moved to another time on the same day.\nIf you cannot come, cancel your request or message us on WhatsApp early.\nThe admin may reject a request if needed.',
  waApproved: 'Hello {name}, your mock test request is APPROVED ✅\n\n📅 Date: {date}\n⏰ Time: {time}\n🔖 Code: {code}\n\n{note}\n\n– MentoBeam | Yes For PTE',
  waExtras: 'Please arrive 15 minutes early and bring a headset.',
  waRejected: 'Hello {name}, sorry – we could not approve your mock test request for {date} at {time}.\n{reason}\nYou are welcome to send a new request for another time.\n\n– MentoBeam | Yes For PTE'
};
const mkC = () => Object.assign({}, MK_DEF, mkCfg);
const mkMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
const mkFill = (tpl, v) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
const mkVars = (b, extra) => Object.assign({ name: b.name, date: fmtDate(b.date), time: fmtTime(b.time) + ' – ' + fmtTime(b.endTime), code: b.id, note: b.approvedNote || '', reason: '' }, extra || {});
const mkGet = id => mkBookings.find(x => x.id === id);
const mkSlotOf = id => mkSlots.find(x => x.id === id);
const mkActive = s => mkBookings.filter(b => b.slotId === s.id && ['pending', 'approved'].includes(b.status));

/* change a booking's status and (if it held a seat) give the seat back – in ONE transaction, so the seat count never drifts */
async function mkSetStatus(b, upd, release) {
  await db.runTransaction(async tx => {
    const bref = db.collection('mockBookings').doc(b.id), sref = b.slotId ? db.collection('mockSlots').doc(b.slotId) : null;
    const ss = (release && sref) ? await tx.get(sref) : null;
    tx.update(bref, upd);
    if (ss && ss.exists) tx.update(sref, { booked: Math.max(0, (ss.data().booked || 0) - 1) });
  });
  Object.assign(b, upd);
}

/* ---------- live data ---------- */
const _mkSubscribe = window.subscribe;
window.subscribe = function () {
  _mkSubscribe();
  if (!can('bookings')) return;
  const bad = e => toast('Mock tests: ' + errMsg(e), 'err');
  unsubs.push(db.collection('settings').doc('mock').onSnapshot(s => { mkCfg = s.exists ? s.data() : {}; refresh(); }, bad));
  unsubs.push(db.collection('mockSlots').onSnapshot(s => { mkSlots = s.docs.map(d => ({ id: d.id, ...d.data() })); refresh(); }, bad));
  unsubs.push(db.collection('mockBookings').onSnapshot(s => {
    if (!mkFirst) s.docChanges().forEach(c => { if (c.type === 'added' && c.doc.data().status === 'pending') toast('📝 New mock test request from ' + c.doc.data().name, 'ok'); });
    mkFirst = false; mkBookings = s.docs.map(d => ({ id: d.id, ...d.data() })); mkBkReady = true; refresh(); mkSyncAvail();
  }, bad));
  /* public copy of the APPROVED mock test times (no names / codes) – students use it to hide taken times on dates without time slots */
  unsubs.push(db.collection('mockAvail').onSnapshot(s => { mkAvail = {}; s.docs.forEach(d => { mkAvail[d.id] = d.data().iv || {}; }); mkAvailReady = true; mkSyncAvail(); }, () => { /* not allowed / offline */ }));
};
/* keeps mockAvail equal to the approved mock tests (from today on). Runs after every change, so approving / cancelling / rejecting / deleting always updates it. */
function mkSyncAvail() {
  if (!mkAvailReady || !mkBkReady || !can('bookings')) return;
  const today = todayStr(), want = {};
  mkBookings.forEach(b => { if (b.status === 'approved' && b.date >= today && b.time && b.endTime) { const w = want[b.date] = want[b.date] || {}, k = b.time.replace(':', '') + '-' + b.endTime.replace(':', ''); w[k] = (w[k] || 0) + 1; } });
  new Set([...Object.keys(want), ...Object.keys(mkAvail).filter(d => d >= today)]).forEach(d => {
    const have = mkAvail[d] || {}, w = want[d] || {}, hk = Object.keys(have).filter(k => have[k] > 0);
    if (hk.length === Object.keys(w).length && Object.keys(w).every(k => have[k] === w[k])) return;
    db.collection('mockAvail').doc(d).set({ iv: w }).catch(() => { /* ignore – tried again after the next change */ });
  });
}
const _mkStop = window.stopApp;
window.stopApp = function () { mkBookings = []; mkSlots = []; mkCfg = {}; mkFirst = true; mkAvail = {}; mkAvailReady = false; mkBkReady = false; _mkStop(); };

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
    const tabs = [['pending', 'Requests' + (pend ? ' (' + pend + ' new)' : '')], ['approved', 'Approved (' + n(['approved']) + ')'], ['closed', 'Rejected / cancelled'], ['slots', 'Time slots & seats'], ['settings', 'Instructions, terms & WhatsApp']];
    view.innerHTML = `<div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${mkTab === k ? 'on' : ''}" data-act="mkTab" data-t="${k}">${t}</button>`).join('')}</div><div id="mkBody"></div>`;
    $('#mkBody').innerHTML = mkTab === 'settings' ? mkSettingsHTML() : mkTab === 'slots' ? mkSlotsHTML() : mkListHTML();
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
    const acts = [];
    if (b.status === 'pending') acts.push(`<button class="btn btn-primary btn-sm" data-act="mkApprove" data-id="${b.id}">✔ Approve</button><button class="btn btn-danger btn-sm" data-act="mkReject" data-id="${b.id}">✖ Reject</button>`);
    if (b.status === 'approved') acts.push(`<button class="btn btn-primary btn-sm" data-act="mkWa" data-id="${b.id}">💬 WhatsApp</button><button class="btn btn-ghost btn-sm" data-act="mkCancel" data-id="${b.id}">Cancel</button>`);
    if (b.status === 'rejected') acts.push(`<button class="btn btn-ghost btn-sm" data-act="mkWa" data-id="${b.id}">💬 WhatsApp</button>`);
    acts.push(`<button class="btn btn-ghost btn-sm" data-act="mkDel" data-id="${b.id}">🗑</button>`);
    return `<div class="card box"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div><h3 style="margin:0">${esc(b.name)} ${mkBadge(b)}${b.status === 'approved' ? ' ' + attBadge(b.attended) : ''}</h3>
        <div style="margin-top:6px"><b>📅 ${fmtDate(b.date)}</b> · ⏰ ${fmtTime(b.time)} – ${fmtTime(b.endTime)}</div>
        <div class="muted" style="font-size:13px;margin-top:4px">📞 ${esc(b.phone)} · ✉️ ${esc(b.email)}<br>Requested ${b.createdAt ? new Date(b.createdAt).toLocaleString('en-GB') : ''} · Code <span style="font-family:monospace">${b.id}</span></div>
        ${b.notes ? `<div style="margin-top:6px;font-size:13.5px">💬 ${esc(b.notes)}</div>` : ''}
        ${b.approvedNote ? `<div class="help" style="margin-top:6px;white-space:pre-wrap">Note sent: ${esc(b.approvedNote)}</div>` : ''}
        ${b.rejectReason ? `<div class="help" style="margin-top:6px">Reason: ${esc(b.rejectReason)}</div>` : ''}
        ${b.status === 'approved' ? `<div class="att-btns" style="margin-top:8px"><button class="ab p ${b.attended === true ? 'on' : ''}" data-act="mkAtt" data-id="${b.id}" data-val="p">Present</button><button class="ab a ${b.attended === false ? 'on' : ''}" data-act="mkAtt" data-id="${b.id}" data-val="a">Absent</button></div>` : ''}</div>
      <div class="acts" style="flex-wrap:wrap">${acts.join('')}</div></div></div>`;
  }).join('');
}

/* ---------- time slots & seats ---------- */
function mkSlotsHTML() {
  const today = todayStr(), up = mkSlots.filter(s => s.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), past = mkSlots.length - up.length;
  const byDate = {}; up.forEach(s => (byDate[s.date] = byDate[s.date] || []).push(s));
  return `<div class="card box"><h3>Add a mock test time slot</h3>
    <p class="help" style="margin-bottom:10px"><b>Time slots are optional.</b> On a date that has slots, students can only pick those slots. On a date with NO slots, students see the available times of the system (set in “Instructions, terms &amp; WhatsApp”), without the times of approved mock tests and simulation exams. Add as many slots as you need for a date (press “Add slot” again for the next one). Seats are optional too – leave empty for unlimited seats. A seat is held as soon as a student sends a request and is given back if the request is rejected or cancelled.</p>
    <div class="fr"><div class="field"><label>Date</label><input id="msDate" type="date" min="${today}" value="${esc(mkLastDate)}"/></div>
      <div class="field"><label>Start time</label><input id="msStart" type="time"/></div>
      <div class="field"><label>End time</label><input id="msEnd" type="time"/></div>
      <div class="field"><label>Seats (optional)</label><input id="msCap" type="number" min="1" placeholder="No limit"/></div>
      <button class="btn btn-primary" data-act="mkSlotAdd">＋ Add slot</button></div></div>
    ${up.length ? Object.keys(byDate).sort().map(d => `<div class="card box"><h3 style="margin:0 0 10px">📅 ${fmtDate(d)}</h3><div class="tw"><table><thead><tr><th>Time</th><th>Seats</th><th>Requests</th><th></th></tr></thead><tbody>${byDate[d].map(s => {
      const act = mkActive(s), pend = act.filter(b => b.status === 'pending').length, apr = act.length - pend, cap = s.capacity == null ? 'No limit' : (s.booked || 0) + ' / ' + s.capacity;
      return `<tr><td><b>${fmtTime(s.time)} – ${fmtTime(s.endTime)}</b></td><td>${cap}${s.capacity != null && (s.booked || 0) >= s.capacity ? ' <span class="badge b-red">Full</span>' : ''}</td><td>${pend ? `<span class="badge b-warn">${pend} waiting</span> ` : ''}${apr ? `<span class="badge b-ok">${apr} approved</span>` : ''}${!pend && !apr ? '<span class="muted">—</span>' : ''}</td>
        <td><div class="acts"><button class="btn btn-ghost btn-sm" data-act="mkSlotEdit" data-id="${s.id}">Edit</button><button class="btn btn-danger btn-sm" data-act="mkSlotDel" data-id="${s.id}">Delete</button></div></td></tr>`;
    }).join('')}</tbody></table></div></div>`).join('') : `<div class="card box"><div class="empty">No upcoming mock test slots. ${mkC().freeOn === false ? 'Add one above – students can only request a mock test in the slots you add.' : 'That is fine – slots are optional. Students will see the available times of the system on every date.'}</div></div>`}
    ${past ? `<p class="muted" style="font-size:12.5px">${past} past slot(s) are hidden.</p>` : ''}`;
}
A.mkSlotAdd = (d, btn) => run(btn, async () => {
  const date = $('#msDate').value, t = $('#msStart').value, e = $('#msEnd').value, capRaw = $('#msCap').value.trim();
  if (!date) throw new Error('Choose a date.'); if (!t || !e) throw new Error('Enter the start and end time.'); if (mkMin(e) <= mkMin(t)) throw new Error('End time must be after the start time.');
  const cap = capRaw === '' ? null : Math.round(Number(capRaw)); if (cap !== null && !(cap >= 1)) throw new Error('Seats must be 1 or more (or leave it empty).');
  if (mkSlots.some(s => s.date === date && s.time === t && s.endTime === e)) throw new Error('This slot already exists.');
  await db.collection('mockSlots').add({ date, time: t, endTime: e, capacity: cap, booked: 0, createdAt: Date.now() });
  mkLastDate = date;
  const clash = slots.find(s => s.date === date && mkMin(t) < mkMin(s.endTime || addMinutes(s.time, 120)) && mkMin(e) > mkMin(s.time));
  toast('Slot added' + (clash ? ' – note: it overlaps a simulation exam slot (' + slotLabel(clash) + ')' : ''), clash ? '' : 'ok');
  $('#msStart').value = ''; $('#msEnd').value = '';
});
A.mkSlotEdit = d => {
  const s = mkSlotOf(d.id); if (!s) return; const locked = mkActive(s).length > 0;
  const m = modal(`<h2 class="mh">Edit slot</h2><p class="msub">${fmtDate(s.date)} · ${fmtTime(s.time)} – ${fmtTime(s.endTime)}</p>
    <div class="row2"><div class="field"><label>Start time</label><input id="seS" type="time" value="${s.time}" ${locked ? 'disabled' : ''}/></div><div class="field"><label>End time</label><input id="seE" type="time" value="${s.endTime}" ${locked ? 'disabled' : ''}/></div></div>
    <div class="field"><label>Seats (empty = no limit)</label><input id="seC" type="number" min="1" value="${s.capacity == null ? '' : s.capacity}"/></div>
    ${locked ? '<p class="help">The time cannot be changed because students already have requests on this slot. You can still change the seats.</p>' : ''}
    <div class="err" id="seErr"></div><button class="btn btn-primary btn-block" id="seGo">Save</button>`);
  m.$('#seGo').onclick = () => run(m.$('#seGo'), async () => {
    const t = m.$('#seS').value, e = m.$('#seE').value, raw = m.$('#seC').value.trim(), er = m.$('#seErr'); er.textContent = '';
    if (!t || !e || mkMin(e) <= mkMin(t)) { er.textContent = 'End time must be after the start time.'; return; }
    const cap = raw === '' ? null : Math.round(Number(raw)); if (cap !== null && !(cap >= 1)) { er.textContent = 'Seats must be 1 or more.'; return; }
    if (cap !== null && cap < (s.booked || 0)) { er.textContent = (s.booked || 0) + ' seat(s) are already taken – seats cannot be less than that.'; return; }
    await db.collection('mockSlots').doc(s.id).update({ time: t, endTime: e, capacity: cap }); m.close(); toast('Saved', 'ok');
  });
};
A.mkSlotDel = async d => {
  const s = mkSlotOf(d.id); if (!s) return;
  if (mkActive(s).length) { toast('This slot has requests. Reject or cancel them first, then delete the slot.', 'err'); return; }
  if (!await confirmBox('Delete the slot ' + fmtDate(s.date) + ' · ' + fmtTime(s.time) + ' – ' + fmtTime(s.endTime) + '?', { okText: 'Delete', danger: true, title: 'Delete slot?' })) return;
  run(null, async () => { await db.collection('mockSlots').doc(s.id).delete(); toast('Deleted', 'ok'); });
};

/* ---------- settings ---------- */
function mkSettingsHTML() {
  const c = mkC(), f = (id, label, val, type = 'text') => `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}"/></div>`;
  const ta = (id, label, val, help, h = 90) => `<div class="field"><label>${label}</label><textarea id="${id}" style="min-height:${h}px">${esc(val)}</textarea>${help ? `<p class="help">${help}</p>` : ''}</div>`;
  return `<div class="card box"><h3>Mock test settings</h3>
    <div class="row2"><div class="field"><label>Students can book mock tests</label><select id="mkOn"><option value="1" ${c.enabled !== false ? 'selected' : ''}>Yes – button visible</option><option value="0" ${c.enabled === false ? 'selected' : ''}>No – hide the button</option></select></div>
      ${f('mkMax', 'How many days ahead can students book', c.maxDays, 'number')}</div>
    <div class="row2"><div class="field"><label>Dates WITHOUT time slots</label><select id="mkFree"><option value="1" ${c.freeOn !== false ? 'selected' : ''}>Show the available times (system)</option><option value="0" ${c.freeOn === false ? 'selected' : ''}>Students can only use the time slots I add</option></select></div>
      ${f('mkDur', 'Mock test length in minutes (for available times)', c.duration, 'number')}</div>
    <div class="row2">${f('mkPrice', 'Price (Rs)', c.price || 0, 'number')}<div class="field"><label></label><p class="help" style="margin-top:28px">Charged per request. Saved on the request when a student sends it, and counted as income once the student is marked <b>Present</b> (under Approved).</p></div></div>
    <div class="row2">${f('mkOpen', 'Available times start from', c.openTime, 'time')}${f('mkClose', 'Last mock test must finish by', c.closeTime, 'time')}</div>
    <p class="help" style="margin:-4px 0 12px">Used only for dates where you did NOT add time slots. Times of approved mock tests and simulation exams are never shown.</p>
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
  const v = id => $('#' + id).value, n = Number(v('mkMax'));
  const dn = Math.round(Number(v('mkDur'))), op = v('mkOpen') || '09:00', cl = v('mkClose') || '18:00', pr = Math.round(Number(v('mkPrice')));
  if (mkMin(cl) <= mkMin(op)) throw new Error('“Last mock test must finish by” must be later than the start time.');
  const data = { enabled: v('mkOn') === '1', maxDays: Number.isFinite(n) && n >= 1 && n <= 365 ? Math.round(n) : 60,
    freeOn: v('mkFree') === '1', openTime: op, closeTime: cl, duration: dn >= 15 && dn <= 480 ? dn : 60, price: Number.isFinite(pr) && pr >= 0 ? pr : 0,
    intro: v('mkIntro').trim(), instructions: v('mkIns').trim(), terms: v('mkTerms').trim(), waApproved: v('mkWaA').trim(), waExtras: v('mkWaX').trim(), waRejected: v('mkWaR').trim(), updatedAt: Date.now() };
  await db.collection('settings').doc('mock').set(data, { merge: true }); mkCfg = Object.assign({}, mkCfg, data); toast('Saved', 'ok');
});

/* ---------- approve / reject ---------- */
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
/* attendance – the mock test fee (Income report) is only counted once a student is marked Present here */
A.mkAtt = d => {
  const b = mkGet(d.id); if (!b) return;
  const want = d.val === 'p' ? true : false;
  const nv = b.attended === want ? null : want;
  db.collection('mockBookings').doc(b.id).update({ attended: nv, attendedAt: nv === true ? Date.now() : null }).then(() => { Object.assign(b, { attended: nv }); views.mock.paint(); }).catch(e => toast(errMsg(e), 'err'));
};
A.mkApprove = d => {
  const b = mkGet(d.id); if (!b) return; const c = mkC();
  const m = modal(`<h2 class="mh">Approve mock test</h2><p class="msub"><b>${esc(b.name)}</b> · ${fmtDate(b.date)} · ${fmtTime(b.time)} – ${fmtTime(b.endTime)}</p>
    <div class="field"><label>Note for the student (shown on their page and added to the WhatsApp message)</label><textarea id="apNote" style="min-height:90px">${esc(c.waExtras)}</textarea></div>
    <button class="btn btn-primary btn-block" id="apOk">✔ Approve</button>`);
  m.$('#apOk').onclick = () => run(m.$('#apOk'), async () => {
    const clash = !b.slotId && mkBookings.find(x => x.id !== b.id && x.status === 'approved' && x.date === b.date && mkMin(b.time) < mkMin(x.endTime) && mkMin(b.endTime) > mkMin(x.time));
    if (clash && !await confirmBox('This time overlaps the approved mock test of <b>' + esc(clash.name) + '</b> (' + fmtTime(clash.time) + ' – ' + fmtTime(clash.endTime) + '). Approve anyway?', { okText: 'Approve anyway', title: 'Time already booked' })) return;
    await mkSetStatus(b, { status: 'approved', approvedNote: m.$('#apNote').value.trim(), decidedAt: Date.now(), decidedBy: me.name || me.email }, false);
    m.close(); toast('Approved', 'ok'); mkWaModal(b, 'approved');
  });
};
A.mkReject = d => {
  const b = mkGet(d.id); if (!b) return;
  const m = modal(`<h2 class="mh">Reject request</h2><p class="msub"><b>${esc(b.name)}</b> · ${fmtDate(b.date)} · ${fmtTime(b.time)} – ${fmtTime(b.endTime)}</p>
    <div class="field"><label>Reason (shown to the student and added to the WhatsApp message)</label><textarea id="rjR" style="min-height:80px" placeholder="e.g. That slot is not available."></textarea></div>
    <p class="help">The seat is given back to the slot.</p><button class="btn btn-danger btn-block" id="rjOk">✖ Reject</button>`);
  m.$('#rjOk').onclick = () => run(m.$('#rjOk'), async () => {
    const reason = m.$('#rjR').value.trim().slice(0, 300);
    await mkSetStatus(b, { status: 'rejected', rejectReason: reason, decidedAt: Date.now(), decidedBy: me.name || me.email }, true);
    m.close(); toast('Rejected', 'ok'); mkWaModal(b, 'rejected', reason);
  });
};
A.mkCancel = async d => {
  const b = mkGet(d.id); if (!b) return;
  if (!await confirmBox('Cancel the approved mock test of <b>' + esc(b.name) + '</b> on ' + fmtDate(b.date) + '? The seat becomes free again.', { okText: 'Cancel it', danger: true, title: 'Cancel mock test?' })) return;
  run(null, async () => { await mkSetStatus(b, { status: 'cancelled', cancelledBy: 'admin', cancelledAt: Date.now() }, true); toast('Cancelled', 'ok'); });
};
A.mkDel = async d => {
  const b = mkGet(d.id); if (!b) return;
  if (!await confirmBox('Delete the request of <b>' + esc(b.name) + '</b>? This cannot be undone.' + (['pending', 'approved'].includes(b.status) ? ' The seat is given back.' : ''), { okText: 'Delete', danger: true, title: 'Delete request?' })) return;
  run(null, async () => {
    const hold = ['pending', 'approved'].includes(b.status) && b.slotId;
    await db.runTransaction(async tx => {
      const bref = db.collection('mockBookings').doc(b.id), sref = hold ? db.collection('mockSlots').doc(b.slotId) : null, ss = sref ? await tx.get(sref) : null;
      tx.delete(bref); if (ss && ss.exists) tx.update(sref, { booked: Math.max(0, (ss.data().booked || 0) - 1) });
    });
    mkBookings = mkBookings.filter(x => x.id !== b.id); toast('Deleted', 'ok'); views.mock.paint();
  });
};
