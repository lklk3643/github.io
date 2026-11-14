// العدد مع المعدود بالعربي الصحيح: سطر واحد، سطران، 3–10 أسطر، 11+ سطراً
window.QPlural = function (n, one, two, few, many) { n = +n || 0; return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`; };
window.QN = {
  row: n => QPlural(n, 'سطر واحد', 'سطران', 'أسطر', 'سطراً'),
  sem: n => QPlural(n, 'ندوة واحدة', 'ندوتان', 'ندوات', 'ندوة'),
  def: n => QPlural(n, 'مناقشة واحدة', 'مناقشتان', 'مناقشات', 'مناقشة'),
  design: n => QPlural(n, 'تصميم واحد', 'تصميمان', 'تصاميم', 'تصميماً'),
  week: n => QPlural(n, 'أسبوع واحد', 'أسبوعان', 'أسابيع', 'أسبوعاً'),
  min: n => QPlural(n, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'),
  hour: n => QPlural(n, 'ساعة', 'ساعتين', 'ساعات', 'ساعة'),
};
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
  // جدول المناقشات مشترك بين كل الحسابات: base = آخر نسخة من الخادم بُني عليها جدول هذه الصفحة (للدمج)، ver = رقمها
  const GRID = 'qu_grid_' + U; let base = null, ver = 0;
  let deferred = null;
  const applyGrid = (value, by) => { deferred = null; native.set.call(localStorage, GRID, value); base = value; dispatchEvent(new CustomEvent('qcloud:grid', { detail: { value, by } })); };
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
      if (typeof data[GRID] === 'string') base = data[GRID];
      ver = +(JSON.parse(x.responseText) || {}).sharedVer || 0;
      QCloud.gone = new Set((JSON.parse(x.responseText) || {}).gone || []);   // مناقشات محذوفة: ملف الحجز الثابت ما يرجّعها
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
    saving();
  }
  function saving() { const b = document.getElementById('cloudBadge'); if (b) { clearTimeout(b._h); b.className = 'cloud-badge ok'; b.textContent = '⏳ جارٍ الحفظ...'; } }
  const typing = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('#sheet') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)); };
  addEventListener('focusout', () => setTimeout(() => {
    if (deferred == null || typing() || GRID in pendSet) return;
    const g = deferred; deferred = null; applyGrid(g, '');
  }, 300));
  function flush(keepalive) {
    clearTimeout(t);
    const set = { ...pendSet }, del = [...pendDel];
    if (!Object.keys(set).length && !del.length) return Promise.resolve(true);
    Object.keys(set).forEach(k => delete pendSet[k]); pendDel.clear();
    const sentGrid = GRID in set ? set[GRID] : null;
    if (sentGrid != null) deferred = null;                       // أرسلنا جدولاً أحدث: أي نسخة مؤجلة صارت قديمة
    return api('state', { method: 'POST', body: JSON.stringify({ set, del, base: sentGrid != null && base != null ? { [GRID]: base } : {} }), keepalive: !!keepalive })
      .then(r => { if (!r.ok) throw new Error(r.status); mark(true); return r.json().catch(() => ({})); })
      .then(j => {
        if (!j || sentGrid == null) return;
        if (j.sharedVer) ver = j.sharedVer;
        const merged = j.merged && j.merged[GRID];
        // تعديلات أحدث تنتظر الإرسال: أساسها ما أُرسل للتو (تُدمج في الحفظ التالي)؛ وإلا تُعرض النسخة المدموجة
        if (GRID in pendSet || merged == null) { base = sentGrid; return; }
        // الموظف يكتب في الجدول الحين: لا نعيد رسمه تحت يده (يضيع حرف ويطلع المؤشر) — نطبّقه أول ما يطلع من الجدول
        if (typing()) { base = sentGrid; deferred = merged; return; }
        applyGrid(merged, '');
      })
      .then(() => true)                                             // وصل للخادم (زر «حفظ» يعتمد عليها)
      .catch(() => { Object.assign(pendSet, set); del.forEach(k => pendDel.add(k)); mark(false); t = setTimeout(flush, 5000); return false; });
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
  // معرّف هذا الجهاز (لا يُرسل للسحابة كمفتاح حساب): كل جهاز يرسل أسطره منفصلة، وملف OBS يجمعها كلها
  let DEV = ''; try { DEV = localStorage.getItem('qu_device') || ''; if (!DEV) { DEV = Math.random().toString(36).slice(2, 12); native.set.call(localStorage, 'qu_device', DEV); } } catch (e) { DEV = 'main'; }
  QCloud.rows = (rows) => { clearTimeout(rowsT); rowsT = setTimeout(() => api('rows', { method: 'POST', body: JSON.stringify({ rows, dev: DEV }) }).then(r => mark(r.ok)).catch(() => mark(false)), 900); };

  // رجوع للصفحة بعد غياب: إن عدّل غيره (بنفس الحساب أو من جهاز آخر) تُجلب تعديلاته قبل أن يكمل
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); flush(true); return; }
    if (!hiddenAt || Date.now() - hiddenAt < 20000 || Object.keys(pendSet).length || pendDel.size) return;
    try {
      const r = await api('state'); if (!r.ok) return;
      const data = ((await r.json()) || {}).data || {};
      const changed = Object.entries(data).some(([k, v]) => mine(k) && localStorage.getItem(k) !== v);
      if (changed && !document.querySelector('.modal.open') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) location.reload();
    } catch (e) { /* بدون اتصال */ }
  });
  // كل 20 ثانية: إن عدّل أحد الزملاء الجدول، يظهر التعديل هنا (ما لم تكن تكتب في خانة الآن)
  setInterval(async () => {
    if (document.hidden) return;
    if (GRID in pendSet) return;
    try {
      const r = await api('shared?since=' + ver + '&editing=' + encodeURIComponent(QCloud.editing || '')); if (!r.ok) return;
      const j = await r.json();
      if (j && Array.isArray(j.others)) dispatchEvent(new CustomEvent('qcloud:presence', { detail: j.others }));
      if (!j || typeof j.grid !== 'string') { if (j && j.ver) ver = j.ver; return; }
      const a = document.activeElement;
      if (a && a.closest && a.closest('#sheet') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;   // يعيد المحاولة بعد قليل
      ver = j.ver;
      if (j.grid !== localStorage.getItem(GRID)) applyGrid(j.grid, j.by); else base = j.grid;
    } catch (e) { /* بدون اتصال */ }
  }, 15000);
  QCloud.details = (entries) => api('details', { method: 'POST', body: JSON.stringify({ entries }) }).then(r => r.ok);
  QCloud.seminars = (upsert, remove) => api('seminars', { method: 'POST', body: JSON.stringify({ upsert, remove }) }).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
})();
