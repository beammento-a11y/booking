/* Admin → Error log. System errors from the public pages and the admin panel are saved in Firestore "errorLogs"
   (visitors can only WRITE a log line, only admins with the "Error log" permission can READ / delete it). */
var errLogs = [], errFirst = true, errFilter = 'all';
PERMS.errors = 'Error log'; ALLPERMS.errors = true;
NAV.splice(NAV.findIndex(n => n.id === 'sheet'), 0, { id: 'errors', icon: '🐞', label: 'Error log', perm: 'errors' });

const _subscribe2 = window.subscribe;
window.subscribe = function () {
  _subscribe2();
  if (!can('errors')) return;
  unsubs.push(db.collection('errorLogs').orderBy('at', 'desc').limit(200).onSnapshot(s => {
    if (!errFirst) s.docChanges().forEach(c => {
      if (c.type !== 'added' || c.doc.metadata.hasPendingWrites) return;
      const d = c.doc.data(); toast('🐞 New system error on ' + (d.page || 'site'), 'err');
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('MentoBeam – new error', { body: (d.page || '') + ': ' + String(d.msg || '').slice(0, 100) }); } catch (e) { /* ignore */ }
    });
    errFirst = false; errLogs = s.docs.map(d => ({ id: d.id, ...d.data() })); errBadge(); refresh();
  }, () => { }));
  setTimeout(errPrune, 8000);
};
const _stopApp2 = window.stopApp;
window.stopApp = function () { errLogs = []; errFirst = true; _stopApp2(); };

function errBadge() {
  const a = $('#nav a[data-nav=errors]'); if (!a) return;
  const n = errLogs.filter(x => !x.read).length; let b = a.querySelector('.badge');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'badge b-red'; b.style.marginLeft = '6px'; a.appendChild(b); }
  b.textContent = n;
}
// keep the database small: logs older than 30 days are removed automatically
async function errPrune() {
  try {
    const s = await db.collection('errorLogs').where('at', '<', Date.now() - 30 * 864e5).limit(300).get();
    if (!s.empty) await commitOps(s.docs.map(d => ({ t: 'del', ref: d.ref })));
  } catch (e) { /* ignore */ }
}
const eWhen = t => new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
views.errors = {
  render() { this.paint(); },
  refresh() { const ae = document.activeElement; if (ae && view.contains(ae) && ae.tagName === 'SELECT') return; this.paint(); },
  paint() {
    if (current !== 'errors') return;
    const l = errLogs.filter(x => errFilter === 'all' || (errFilter === 'unread' ? !x.read : x.page === errFilter));
    const pages = [...new Set(errLogs.map(x => x.page).filter(Boolean))];
    view.innerHTML = `<div class="card box"><div class="fr" style="gap:10px;flex-wrap:wrap;margin-bottom:6px">
      <select data-chg="errFilter" style="max-width:200px"><option value="all">All errors</option><option value="unread" ${errFilter === 'unread' ? 'selected' : ''}>Unread</option>${pages.map(p => `<option value="${esc(p)}" ${errFilter === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" data-act="errAlerts">🔔 Enable desktop alerts</button><button class="btn btn-ghost btn-sm" data-act="errReadAll">Mark all read</button><button class="btn btn-danger btn-sm" data-act="errClear">Delete all</button>
      <span class="muted">${errLogs.length} logged · auto-deleted after 30 days</span></div>
      <p class="help" style="margin-bottom:12px">Visitors never see technical errors – they only see “Something went wrong”. The details are saved here for admins only.</p>
      ${l.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Page</th><th>Error</th><th></th></tr></thead><tbody>${l.map(x => `<tr style="${x.read ? 'opacity:.6' : ''}">
        <td style="white-space:nowrap">${eWhen(x.at)}</td><td><span class="badge b-gray">${esc(x.page || '')}</span><br><small class="muted">${esc(x.where || '')}</small></td>
        <td><b>${esc(x.code || '')}</b> ${esc(x.msg || '')}<details><summary class="muted" style="cursor:pointer;font-size:12px">details</summary><pre style="white-space:pre-wrap;font-size:11.5px;max-width:560px;overflow:auto">${esc(x.stack || '')}\n${esc(x.ua || '')}</pre></details></td>
        <td><div class="acts">${x.read ? '' : `<button class="btn btn-ghost btn-sm" data-act="errRead" data-id="${x.id}">✓</button>`}<button class="btn btn-danger btn-sm" data-act="errDel" data-id="${x.id}">🗑</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><div class="ei">🎉</div><p>No errors.</p></div>'}</div>`;
  }
};
C.errFilter = el => { errFilter = el.value; views.errors.paint(); };
A.errRead = d => run(null, () => db.collection('errorLogs').doc(d.id).update({ read: true }));
A.errDel = d => run(null, () => db.collection('errorLogs').doc(d.id).delete());
A.errReadAll = () => run(null, () => commitOps(errLogs.filter(x => !x.read).map(x => ({ t: 'upd', ref: db.collection('errorLogs').doc(x.id), data: { read: true } }))));
A.errAlerts = () => { if (!('Notification' in window)) { toast('This browser has no notifications', 'err'); return; } Notification.requestPermission().then(p => toast(p === 'granted' ? 'Desktop alerts on (while this tab is open)' : 'Alerts blocked', p === 'granted' ? 'ok' : 'err')); };
A.errClear = async () => { if (!errLogs.length) return; if (!await confirmBox('Delete all ' + errLogs.length + ' logged errors?', { okText: 'Delete all', danger: true })) return; run(null, () => commitOps(errLogs.map(x => ({ t: 'del', ref: db.collection('errorLogs').doc(x.id) })))); };
