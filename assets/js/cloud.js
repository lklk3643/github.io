/* السحابة (موقع Netlify فقط): بيانات الحساب نفسها من أي جهاز.
 *  - عند فتح الصفحة: تُجلب مفاتيح الحساب من الخادم وتُكتب في المتصفح قبل أن يقرأها التطبيق.
 *  - أي حفظ لمفتاح من مفاتيح الحساب (qu_..._<المستخدم>) يُرسل للخادم تلقائياً بعد لحظات، وعند إغلاق الصفحة.
 *  - على GitHub Pages أو من ملف محلي لا يعمل شيء هنا (الموقع يعمل كما كان).
 * يُحمَّل بعد auth.js وقبل app.js / seminars.js.
 */
(function () {
  'use strict';
  const read = () => { try { return JSON.parse(sessionStorage.getItem('qu_session') || localStorage.getItem('qu_session')); } catch (e) { return null; } };
  const ON_CLOUD = /\.netlify\.app$/i.test(location.hostname) || localStorage.getItem('qu_cloud_dev') === '1' || !!document.querySelector('meta[name="qu-cloud"]');
  const S = read();
  const api = (p, opt = {}) => fetch('/api/' + p, { ...opt, headers: { 'content-type': 'application/json', ...(S && S.token ? { authorization: 'Bearer ' + S.token } : {}), ...(opt.headers || {}) } });
  const QCloud = window.QCloud = { site: ON_CLOUD, on: false, api, session: S };
  if (!ON_CLOUD) return;

  const isLogin = /(^|\/)(index\.html)?$/.test(location.pathname);
  if (!S || !S.token) {                       // جلسة قديمة (قبل السحابة) أو بلا دخول: يرجع لصفحة الدخول
    if (S && !S.token) { sessionStorage.removeItem('qu_session'); localStorage.removeItem('qu_session'); }
    if (!isLogin) location.replace('index.html');
    return;
  }
  QCloud.on = true;
  const U = String(S.u || '').toLowerCase();
  const mine = (k) => typeof k === 'string' && k.startsWith('qu_') && k.endsWith('_' + U) && !/^qu_(session|gh_|details_)/.test(k);

  // 1) جلب بيانات الحساب قبل أن تبدأ الصفحة (طلب متزامن عن قصد: التطبيق يقرأ التخزين فور تحميله)
  const native = { set: Storage.prototype.setItem, remove: Storage.prototype.removeItem };
  try {
    const x = new XMLHttpRequest();
    x.open('GET', '/api/state', false); x.setRequestHeader('authorization', 'Bearer ' + S.token); x.send();
    if (x.status === 401) { sessionStorage.removeItem('qu_session'); localStorage.removeItem('qu_session'); location.replace('index.html'); return; }
    if (x.status === 200) {
      const data = (JSON.parse(x.responseText) || {}).data || {};
      // مفاتيح الحساب في هذا المتصفح غير الموجودة في السحابة (بيانات جهاز قديم قبل النقل): تُرفع مرة
      const first = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (mine(k) && !(k in data)) first.push(k); }
      Object.entries(data).forEach(([k, v]) => { if (mine(k)) native.set.call(localStorage, k, v); });
      if (first.length) setTimeout(() => first.forEach(k => queue(k)), 0);
      QCloud.loaded = true;
    }
  } catch (e) { QCloud.offline = true; }

  // 2) كل تغيير في مفاتيح الحساب يُرسل تلقائياً
  const pendSet = {}, pendDel = new Set(); let t = 0;
  function queue(k, removed) {
    if (removed) { pendDel.add(k); delete pendSet[k]; }
    else { const v = localStorage.getItem(k); if (v == null) return; pendSet[k] = v; pendDel.delete(k); }
    clearTimeout(t); t = setTimeout(flush, 700);
  }
  function flush(keepalive) {
    clearTimeout(t);
    const set = { ...pendSet }, del = [...pendDel];
    if (!Object.keys(set).length && !del.length) return Promise.resolve();
    Object.keys(set).forEach(k => delete pendSet[k]); pendDel.clear();
    return api('state', { method: 'POST', body: JSON.stringify({ set, del }), keepalive: !!keepalive })
      .then(r => { if (!r.ok) throw new Error(r.status); mark(true); })
      .catch(() => { Object.assign(pendSet, set); del.forEach(k => pendDel.add(k)); mark(false); t = setTimeout(flush, 5000); });
  }
  Storage.prototype.setItem = function (k, v) { native.set.call(this, k, v); if (this === localStorage && mine(k)) queue(k); };
  Storage.prototype.removeItem = function (k) { native.remove.call(this, k); if (this === localStorage && mine(k)) queue(k, true); };
  addEventListener('pagehide', () => flush(true));
  QCloud.flush = flush;

  // شارة صغيرة: هل وصلت آخر التعديلات للسحابة؟
  function mark(ok) {
    let b = document.getElementById('cloudBadge');
    if (!b) { b = document.createElement('div'); b.id = 'cloudBadge'; b.className = 'cloud-badge'; b.setAttribute('role', 'status'); (document.body || document.documentElement).appendChild(b); }
    b.className = 'cloud-badge ' + (ok ? 'ok' : 'warn');
    b.textContent = ok ? '☁️ محفوظ في السحابة' : '⚠️ بدون اتصال — يُحفظ عند عودة الاتصال';
    clearTimeout(b._h); if (ok) b._h = setTimeout(() => b.classList.add('fade'), 2500);
  }

  // 3) خدمات للصفحات
  QCloud.hist = {
    list: () => api('hist').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => j.items || []),
    put: (item) => api('hist', { method: 'POST', body: JSON.stringify({ item }) }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => j.id),
    del: (id) => api('hist/' + encodeURIComponent(id), { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(r.status); })
  };
  let rowsT = 0;
  QCloud.rows = (rows) => { clearTimeout(rowsT); rowsT = setTimeout(() => api('rows', { method: 'POST', body: JSON.stringify({ rows }) }).then(r => mark(r.ok)).catch(() => mark(false)), 900); };
  QCloud.details = (entries) => api('details', { method: 'POST', body: JSON.stringify({ entries }) }).then(r => r.ok);
  QCloud.seminars = (upsert, remove) => api('seminars', { method: 'POST', body: JSON.stringify({ upsert, remove }) }).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
})();
