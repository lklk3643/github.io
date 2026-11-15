/* صفحة الندوات: قاعدة بيانات الندوات + إعلان مخصص لكل ندوة.
 *
 * التخزين:
 *  - المنشور: assets/data/seminars.json في المستودع نفسه (يقرؤه كل الموظفين وشاشة OBS).
 *  - غير المنشور: تعديلات هذا الجهاز في localStorage حتى يُضغط «نشر».
 * النشر: عبر واجهة GitHub برمز وصول محفوظ على هذا الجهاز فقط (إعداد مرة واحدة من المدير).
 * كل النصوص تُدرج بـ textContent؛ لا يُنفَّذ أي شيء قادم من البيانات.
 */
(function () {
  'use strict';
  const session = QAuth.requireLogin();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LOCAL_KEY = 'qu_seminars_local';
  const TOKEN_KEY = 'qu_gh_token';
  const BRANCH_KEY = 'qu_gh_branch';
  const DATA_PATH = 'assets/data/seminars.json';
  const LOGO = 'assets/img/logo.png?v=202610170020';
  const BUILDING = 'assets/img/building.jpg?v=202610170020';
  // بنود البرنامج (participants[].kind) — الصيغة ثابتة وتقرؤها لوحة OBS
  const KINDS = {
    opening:    { label: 'افتتاح', topic: 'افتتاح الملتقى', role: 'مقدّم', fields: ['topic', 'name', 'title', 'start', 'end'] },
    session:    { label: 'جلسة', name: 'الجلسة الأولى', role: 'مدير الجلسة', fields: ['name', 'moderator', 'moderator_title'] },
    paper:      { label: 'ورقة / متحدث', role: 'متحدث', fields: ['topic', 'name', 'title', 'specialty', 'start', 'end'] },
    discussion: { label: 'مداخلات', topic: 'المداخلات والتعقيبات', role: '', fields: ['topic', 'start', 'end'] },
    break:      { label: 'استراحة', topic: 'استراحة', role: '', fields: ['topic', 'start', 'end'] },
    closing:    { label: 'ختام', topic: 'ختام الملتقى والتوصيات', role: '', fields: ['topic', 'start', 'end'] },
  };
  const FIELD_LABEL = { topic: 'العنوان / البند', name: 'الاسم', title: 'الصفة (مثال: الأستاذ المشارك في قسم الفقه)', specialty: 'التخصص',
    start: 'من', end: 'إلى', moderator: 'يديرها', moderator_title: 'صفة مدير الجلسة' };
  const SESSION_NAMES = ['الجلسة الأولى', 'الجلسة الثانية', 'الجلسة الثالثة', 'الجلسة الرابعة', 'الجلسة الخامسة', 'الجلسة السادسة'];
  const newPid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const isSpeaker = (p) => (!p.kind || p.kind === 'paper' || p.kind === 'opening') && p.name;
  const STATUS_AR = { confirmed: '', postponed: 'مؤجلة', cancelled: 'ملغاة' };

  // المستودع: من رابط GitHub Pages (owner.github.io/repo/)، وإلا القيم المعروفة
  const REPO = (() => {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    const seg = location.pathname.split('/').filter(Boolean)[0];
    return m ? { owner: m[1], repo: seg && !/\.html$/.test(seg) ? seg : m[1] + '.github.io' } : { owner: 'lklk3643', repo: 'github.io' };
  })();

  let published = { v: '', seminars: [] };   // آخر نسخة منشورة معروفة
  let local = loadLocal();                     // {items:{id:sem}, deleted:[id]}
  let current = null;                          // الندوة المفتوحة في النموذج
  let size = 'programme';
  let sortAsc = false;                         // ترتيب الجدول: الأحدث أولاً (أو الأقدم)

  // ---------- أدوات ----------
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'toast'; }, Math.min(9000, Math.max(3500, String(msg).length * 55)));
  }
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; }
  function loadLocal() { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (v && v.items) return { items: v.items, deleted: v.deleted || [], base: v.base || {} }; } catch (e) { /* تالف */ } return { items: {}, deleted: [], base: {} }; }
  // base: نسخة كل ندوة لما بدأ الموظف يعدّلها — الخادم يدمج حقل بحقل معها حتى ما تنكتب تعديلات الزملاء
  function saveLocal() {
    local.base = local.base || {};
    for (const id of Object.keys(local.items)) if (!(id in local.base)) local.base[id] = published.seminars.find(x => x.id === id) || null;
    for (const id of Object.keys(local.base)) if (!(id in local.items)) delete local.base[id];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
  }
  const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hijri = (iso) => { if (!iso) return ''; try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')).replace(/[‎‏]/g, '').replace(/\s*هـ$/, '') + ' هـ'; } catch (e) { return ''; } };
  const weekday = (iso) => iso ? new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')) : '';
  const gdate = (iso) => iso ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')) : '';
  function t12(hm) { if (!/^\d{1,2}:\d{2}$/.test(hm || '')) return ''; let [h, m] = hm.split(':').map(Number); const s = h < 12 ? 'صباحاً' : (h < 15 && h >= 12 ? 'ظهراً' : 'مساءً'); h = h % 12 || 12; return (m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`) + ' ' + s; }
  const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  const blank = () => ({ id: newId(), title: '', subtitle: '', organizer: 'كلية الشريعة', date: '', start: '', end: '', place: 'قاعة ابن عثيمين', place_note: '(والبث عبر الإنترنت)', link: '', recording_link: '', status: 'confirmed', notes: '', participants: [],
    series: '', department: '', public_note: '', poster_header: 'simple', programme_layout: 'cells' });
  const clean = (s) => ({ id: String(s.id), title: String(s.title || '').trim(), subtitle: String(s.subtitle || '').trim(), organizer: String(s.organizer || '').trim(),
    date: String(s.date || ''), start: String(s.start || ''), end: String(s.end || ''), place: String(s.place || '').trim(), place_note: String(s.place_note || '').trim(),
    link: String(s.link || '').trim(), recording_link: String(s.recording_link || '').trim(), status: ['confirmed', 'postponed', 'cancelled'].includes(s.status) ? s.status : 'confirmed', notes: String(s.notes || '').trim(),
    series: String(s.series || '').trim(), department: String(s.department || '').trim(), public_note: String(s.public_note || '').trim(),
    poster_header: s.poster_header === 'official' ? 'official' : 'simple', programme_layout: s.programme_layout === 'table' ? 'table' : 'cells',
    participants: (s.participants || []).map(p => {
      const kind = KINDS[p.kind] ? p.kind : 'paper';
      if (!p.pid) p.pid = newPid();   // رقم ثابت للبند (يُحفظ مع البند؛ الدمج على الخادم بند ببند)
      const o = { pid: String(p.pid), kind, name: String(p.name || '').trim(), title: String(p.title || '').trim(), role: String(p.role || KINDS[kind].role || '').trim(),
        topic: String(p.topic || '').trim(), start: String(p.start || ''), end: String(p.end || '') };
      if (p.tauto) o.tauto = 1;
      if (p.draft && !o.name && !o.topic && !String(p.moderator || '').trim()) o.draft = 1;
      if (p.specialty) o.specialty = String(p.specialty).trim();
      if (kind === 'session') { o.moderator = String(p.moderator || '').trim(); o.moderator_title = String(p.moderator_title || '').trim(); }
      return o;
    }).filter(p => p.name || p.topic || p.moderator || p.draft), updated: s.updated || '' });

  function merged() {
    const map = new Map(published.seminars.map(s => [s.id, s]));
    Object.values(local.items).forEach(s => map.set(s.id, s));
    local.deleted.forEach(id => map.delete(id));
    const arr = Array.from(map.values()).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    return sortAsc ? arr.reverse() : arr;
  }
  const pendingCount = () => Object.keys(local.items).length + local.deleted.length;

  // ---------- المنشور ----------
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const branch = () => localStorage.getItem(BRANCH_KEY) || 'gh-pages';
  const api = (p) => `https://api.github.com/repos/${REPO.owner}/${encodeURIComponent(REPO.repo)}/${p}`;
  const b64 = { enc: (s) => { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); },
                dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0))) };

  const CLOUD = () => !!(window.QCloud && QCloud.on);      // موقع Netlify: الحفظ = النشر للبث فوراً
  async function fetchPublished() {
    if (CLOUD()) {
      const r = await fetch('/api/feed/seminars.json?all=1&t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('read ' + r.status);
      return { data: await r.json(), sha: undefined };
    }
    // مع رمز: أحدث نسخة مباشرة من GitHub؛ بدونه: الملف المنشور (قد يتأخر دقائق بسبب التخزين المؤقت)
    if (token()) {
      try {
        const r = await fetch(api(`contents/${DATA_PATH}?ref=${encodeURIComponent(branch())}`), { headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' }, cache: 'no-store' });
        if (r.status === 404) return { data: { v: '', seminars: [] }, sha: null };
        if (r.ok) { const j = await r.json(); return { data: JSON.parse(b64.dec(j.content)), sha: j.sha }; }
      } catch (e) { /* نجرب الملف المنشور */ }
    }
    const r = await fetch(DATA_PATH + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.status === 404) return { data: { v: '', seminars: [] }, sha: null };
    if (!r.ok) throw new Error('read ' + r.status);
    return { data: await r.json(), sha: undefined };
  }

  async function refreshPublished() {
    try {
      const { data } = await fetchPublished();
      published = { v: data.v || '', seminars: (data.seminars || []).map(clean) };
    } catch (e) { toast('تعذر قراءة الندوات المنشورة؛ تُعرض نسخة هذا الجهاز', true); }
    renderList(); renderPub();
  }

  let pubBusy = false;
  let pubAgain = false;
  async function publishCloud(quiet) {
    if (pubBusy) { pubAgain = true; return; }
    if (!pendingCount()) return;
    pubBusy = true;
    try {
      const sent = JSON.stringify(local);
      const out = await QCloud.seminars(Object.values(local.items).map(clean), local.deleted, local.base || {});
      published = { v: out.v, seminars: (out.seminars || []).map(clean) };
      if (JSON.stringify(local) === sent) local = { items: {}, deleted: [], base: {} };   // لو كتب أثناء الإرسال تبقى تعديلاته الجديدة
      saveLocal();
      safeRender(); renderPub();
      if (!quiet) toast('✓ وصلت للبث — تظهر في OBS خلال دقائق');
    } catch (e) { renderPub(); toast('تعذر الاتصال الآن — محفوظة على هذا الجهاز وتُرسل تلقائياً عند عودة الاتصال', true); setTimeout(() => publishCloud(true), 15000); }
    finally { pubBusy = false; if (pubAgain) { pubAgain = false; setTimeout(() => publishCloud(true), 300); } }
  }
  async function publish() {
    if (CLOUD()) return publishCloud(false);
    if (!pendingCount()) return toast('لا توجد تعديلات جديدة للنشر');
    if (!token()) {
      if (session.role === 'admin' || session.role === 'super') { openSetup(); return toast('أعدّ النشر مرة واحدة على هذا الجهاز', true); }
      return toast('النشر غير مُعدّ على هذا الجهاز. اطلب من المدير إعداده.', true);
    }
    const btn = $('#btnPublish'); btn.disabled = true; btn.textContent = '…جارٍ النشر';
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, sha } = await fetchPublished();
        const map = new Map((data.seminars || []).map(s => [s.id, clean(s)]));
        Object.values(local.items).forEach(s => map.set(s.id, clean(s)));
        local.deleted.forEach(id => map.delete(id));
        const out = { v: new Date().toISOString(), source: 'صفحة الندوات', seminars: Array.from(map.values()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)) };
        const body = { message: `الندوات: نشر ${pendingCount()} تعديل (${session.u})`, content: b64.enc(JSON.stringify(out, null, 1) + '\n'), branch: branch() };
        if (sha) body.sha = sha;
        const r = await fetch(api(`contents/${DATA_PATH}`), { method: 'PUT', headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.status === 409 || r.status === 422) continue;          // تغيّر الملف أثناء النشر: نعيد الدمج مرة
        if (r.status === 401 || r.status === 403) throw new Error('auth');
        if (!r.ok) throw new Error('http ' + r.status);
        published = { v: out.v, seminars: out.seminars };
        local = { items: {}, deleted: [] }; saveLocal();
        renderList(); renderPub();
        return toast('تم النشر ✓ ستظهر الندوات لكل الأجهزة ولشاشة OBS خلال دقائق');
      }
      throw new Error('conflict');
    } catch (e) {
      toast(e.message === 'auth' ? 'رمز الوصول غير صالح أو منتهي — حدّثه من «إعداد النشر»' : 'تعذر النشر الآن؛ تعديلاتك محفوظة على هذا الجهاز، حاول لاحقًا', true);
    } finally { btn.disabled = false; btn.textContent = '🌐 نشر الندوات'; }
  }

  function renderPub() {
    const n = pendingCount(), s = $('#pubState');
    s.textContent = ''; s.className = '';
    if (CLOUD()) {
      if (n) { s.className = 'pending'; s.textContent = `جارٍ الإرسال للبث… (${n})`; }
      else { s.className = 'ok'; s.textContent = '✓ كل الندوات وصلت للبث (تُحفظ وتصل تلقائياً)'; }
    } else if (n) { s.className = 'pending'; s.textContent = `تعديلات غير منشورة على هذا الجهاز: ${n}`; }
    else { s.className = 'ok'; s.textContent = 'كل الندوات منشورة ✓'; }
    $('#btnPublish').disabled = !n;
  }

  // ---------- جدول بيانات الندوات (مثل جدول المناقشات: كل سطر = ندوة، يُعدَّل مباشرة وينحفظ تلقائياً) ----------
  const YT = 'https://www.youtube.com/@src.sds1';
  const GCOLS = [   // [المفتاح, العنوان, نوع الخانة, صنف العرض]
    ['date', 'التاريخ', 'date', 'w-sm'], ['start', 'من', 'time', 'w-sm'], ['end', 'إلى', 'time', 'w-sm'],
    ['title', 'عنوان الندوة', 'text', 'w-title'], ['series', 'النوع', 'text', ''], ['department', 'القسم', 'text', ''],
    ['place', 'المكان', 'text', ''], ['status', 'الحالة', 'status', 'w-sm'], ['link', 'رابط البث', 'url', 'w-link'], ['recording_link', 'رابط التسجيل', 'url', 'w-link']];
  const gridSel = new Set();
  let rowsView = [];
  const speakersOf = (s) => s.participants.filter(isSpeaker);
  function missingOf(s) {
    if (s.date && s.date < todayIso()) return [];
    return [!s.title && 'العنوان', !s.date && 'التاريخ', !s.start && 'وقت البداية', !speakersOf(s).length && 'المتحدثون'].filter(Boolean);
  }
  const tmin = (hm) => /^\d{1,2}:\d{2}$/.test(hm || '') ? (+hm.split(':')[0]) * 60 + (+hm.split(':')[1]) : null;
  // النهاية: بدونها ساعة؛ وإن كانت قبل البداية فالندوة تمتد لبعد منتصف الليل
  const endMin = (end, start) => { const e = tmin(end); return e == null ? start + 60 : (e <= start ? e + 1440 : e); };
  const remote = (p) => /عن\s*بعد|زوم|تيمز|zoom/i.test(p || '');
  function conflictsOf(s, all) {
    if (!s.date || s.status === 'cancelled' || remote(s.place) || !s.place) return [];
    const a1 = tmin(s.start); if (a1 == null) return [];
    const a2 = endMin(s.end, a1);
    return all.filter(o => o.id !== s.id && o.date === s.date && o.status !== 'cancelled' && o.place && o.place.trim() === s.place.trim() && (() => {
      const b1 = tmin(o.start); if (b1 == null) return false; const b2 = endMin(o.end, b1); return a1 < b2 && b1 < a2; })());
  }
  function renderList() { renderGrid(); }
  // إعادة رسم آمنة: إذا الموظف يكتب داخل الجدول نأجلها لين يطلع منه (حتى ما تضيع الكتابة ولا قائمة الأسماء)
  let gridDirty = false;
  function safeRender() { const a = document.activeElement, T = $('#sheet'); if (a && T && T.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { gridDirty = true; return; } renderGrid(); }
  // بعد ما يطلع من الخانة بشوي (ضغطة زر في نفس اللحظة ما تضيع لأن الجدول ما ينرسم تحت إصبعه)
  let dirtyT = 0;
  $('#sheet').addEventListener('focusout', () => { if (!gridDirty) return; clearTimeout(dirtyT); dirtyT = setTimeout(() => { const a = document.activeElement; if (gridDirty && !(a && $('#sheet').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) { gridDirty = false; renderGrid(); } }, 900); });
  function renderGrid() {
    gridDirty = false;
    const keep = focusKey();
    const q = $('#search').value.trim();
    const all = merged();
    rowsView = all.filter(s => !q || s.title.includes(q) || s.participants.some(p => (p.name || '').includes(q)));
    const T = $('#sheet'); T.textContent = '';
    const thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', 'n', '#')); hr.appendChild(el('th', 'act', 'عرض / نسخ'));
    GCOLS.forEach(c => hr.appendChild(el('th', null, c[1]))); hr.appendChild(el('th', 'th-prog', 'البرنامج'));
    thead.appendChild(hr); T.appendChild(thead);
    const tb = el('tbody'); let nConf = 0;
    rowsView.forEach((s, i) => {
      const miss = missingOf(s), conf = conflictsOf(s, all);
      if (conf.length) nConf++;
      const tr = el('tr'); tr.dataset.id = s.id;
      if (gridSel.has(s.id)) tr.classList.add('sel');
      if (current && current.id === s.id) tr.classList.add('active');
      if (miss.length) tr.classList.add('incomplete');
      if (conf.length) tr.classList.add('conflict');
      if (s.date && s.date < todayIso()) tr.classList.add('past');
      const n = el('td', 'n'); const lb = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = gridSel.has(s.id);
      cb.onchange = () => { cb.checked ? gridSel.add(s.id) : gridSel.delete(s.id); tr.classList.toggle('sel', cb.checked); updSel(); };
      lb.appendChild(cb); lb.appendChild(document.createTextNode(i + 1)); n.appendChild(lb);
      if (local.items[s.id]) n.appendChild(el('span', 'chip', 'غير منشورة'));
      if (miss.length) { const w = el('button', 'chip warn', 'ناقص'); w.type = 'button'; w.onclick = () => toast('ناقص للإعلان: ' + miss.join('، ') + ' (تنبيه فقط)'); n.appendChild(w); }
      if (conf.length) { const w = el('button', 'chip conf', 'تعارض'); w.type = 'button'; w.onclick = () => toast('بنفس القاعة والوقت مع: ' + conf.map(o => o.title || 'ندوة بلا عنوان').join('، '), true); n.appendChild(w); }
      tr.appendChild(n);
      const act = el('td', 'act');
      const ab = (txt, title, fn, cls) => { const b = el('button', cls || null, txt); b.type = 'button'; b.title = title; b.onclick = fn; act.appendChild(b); };
      ab('👁', 'عرض في التصميم', () => { openSem(s); $('#previewPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      ab('⬇️', 'تحميل صورة الإعلان (بالمقاس المحدد في «التحميل»)', () => runExport([{ label: s.title || 'ندوة', s: clean(s) }], `${safe(s.title) || 'ندوة'}.zip`));
      ab('⧉', 'تكرار السطر لندوة مشابهة', () => duplicate(s));
      // رسائل السطر: بيانات السطر نفسه (مثل جدول المناقشات): دعوة 💬 تسجيل 💬
      ab('دعوة', 'نسخ رسالة الدعوة', () => copyMsg('invite', s), 'msg-b');
      ab('💬', 'إرسال الدعوة بالواتساب', () => sendDirect(s, 'invite'), 'wa-i');
      ab('تسجيل', 'نسخ رسالة التسجيل', () => copyMsg('record', s), 'msg-b' + (hasRec(s) ? ' has' : ''));
      ab('💬', 'إرسال التسجيل بالواتساب', async () => { await saveRecordImage(s); sendDirect(s, 'record'); }, 'wa-i');
      tr.appendChild(act);
      GCOLS.forEach(([k, , type, cls]) => {
        const td = el('td'); let inp;
        if (type === 'status') { inp = el('select'); [['confirmed', 'مؤكدة'], ['postponed', 'مؤجلة'], ['cancelled', 'ملغاة']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; inp.appendChild(o); }); }
        else { inp = el('input'); inp.type = type === 'url' ? 'url' : type; if (type === 'url') { inp.dir = 'ltr'; inp.placeholder = 'بدون رابط'; } }
        if (cls) inp.className = cls;
        inp.dataset.k = k;
        if (type === 'text') inp.type = 'text';
        inp.value = s[k] || (k === 'status' ? 'confirmed' : '');
        inp.addEventListener('change', () => {
          const item = clean(local.items[s.id] || s); item[k] = inp.value; item.updated = new Date().toISOString();
          local.items[item.id] = item; local.deleted = local.deleted.filter(x => x !== item.id); saveLocal();
          if (current && current.id === item.id) openSem(item, true); else renderGrid();
          renderPub(); flagSaved();
          if (CLOUD()) publishCloud(true);
        });
        td.appendChild(inp); tr.appendChild(td);
      });
      const nItems = s.participants.filter(p => !p.draft).length, open = openProg.has(s.id);
      const pt = el('td', 'td-prog'), pb = el('button', 'prog-btn' + (open ? ' open' : '') + (nItems ? '' : ' empty'), nItems ? `البرنامج (${nItems}) ${open ? '▴' : '▾'}` : `＋ البرنامج ${open ? '▴' : '▾'}`);
      pb.type = 'button'; pb.title = 'افتح جدول البرنامج تحت هذا السطر: الجلسات والأوراق والملقين والأوقات';
      pb.onclick = () => { open ? openProg.delete(s.id) : openProg.add(s.id); renderGrid(); };
      pt.appendChild(pb); tr.appendChild(pt);
      tb.appendChild(tr);
      if (open) tb.appendChild(progRow(s));
    });
    if (!rowsView.length) { const tr = el('tr'); const td = el('td', null, q ? 'لا نتائج للبحث' : 'لا توجد ندوات بعد. اضغط «➕ ندوة».'); td.colSpan = GCOLS.length + 3; tr.appendChild(td); tb.appendChild(tr); }
    T.appendChild(tb);
    fitProg();
    restoreFocus(keep);
    $('#gridCount').textContent = `(${all.length})`;
    const b = $('#gConflicts'); b.hidden = !nConf; b.textContent = `🔴 ${QN.row(nConf)} ${nConf === 1 ? 'فيه' : 'فيها'} تعارض`;
    updSel();
  }

  // البرنامج بعرض الجزء الظاهر من الجدول (الجدول الكبير يتمرر أفقياً، والبرنامج يبقى كامل قدامك)
  function fitProg() { const w = $('.gridwrap'); if (w) $('#sheet').style.setProperty('--progw', Math.max(300, w.clientWidth - 28) + 'px'); }
  addEventListener('resize', fitProg);
  // ================= جدول البرنامج تحت سطر الندوة (مثل جدول المناقشات: تكتب في الخانات مباشرة) =================
  const openProg = new Set();
  const DUR = () => ({ opening: 5, paper: Math.max(5, +(localStorage.getItem('qu_paper_dur') || 15)), discussion: 15, break: 10, closing: 0, session: 0 });
  const hm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const filled = p => !!(p.name || p.topic || p.moderator);
  // الإكمال التلقائي: أسماء الجلسات بالترتيب، عناوين البنود الثابتة، وتسلسل الأوقات (كل بند يبدأ عند نهاية اللي قبله)
  function autofill(sem) {
    const D = DUR(); let sess = 0, prev = null;
    for (const p of sem.participants) {
      if (p.kind === 'session') { if (!p.name || SESSION_NAMES.includes(p.name) || /^الجلسة \d+$/.test(p.name)) p.name = SESSION_NAMES[sess] || `الجلسة ${sess + 1}`; sess++; p.start = ''; p.end = ''; delete p.tauto; continue; }
      if (!p.topic && KINDS[p.kind].topic) p.topic = KINDS[p.kind].topic;
      if (!p.start || p.tauto) {
        const st = prev != null ? prev : tmin(sem.start);
        if (st != null) { p.start = hm(st); p.end = D[p.kind] ? hm(st + D[p.kind]) : ''; p.tauto = 1; }
      } else if ((!p.end || p.eauto) && D[p.kind]) p.end = hm(tmin(p.start) + D[p.kind]);
      delete p.eauto;
      const a = tmin(p.start), b = tmin(p.end);
      if (a != null) prev = b != null ? (b < a ? b + 1440 : b) : a + (D[p.kind] || 0);
    }
    const timed = sem.participants.filter(p => p.kind !== 'session' && tmin(p.start) != null);
    if (timed.length) { sem.start = timed[0].start; const L = timed[timed.length - 1]; sem.end = L.end || L.start; }
    return sem;
  }
  let progPubT = 0;
  // حفظ برنامج ندوة: محلياً فوراً، والإرسال بعد توقف الكتابة شوي؛ النموذج الجانبي يتحدث بدون إعادة رسم الجدول
  function commitProg(id, parts, rerender) {
    const base = local.items[id] || merged().find(x => x.id === id); if (!base) return;
    const item = clean(base); item.participants = parts.map(p => ({ ...p })); autofill(item);
    const fresh = clean(item); fresh.updated = new Date().toISOString();
    local.items[id] = fresh; local.deleted = local.deleted.filter(x => x !== id); saveLocal();
    if (current && current.id === id) {
      current = clean(fresh);
      ['start', 'end'].forEach(k => { const i = $(`[data-k="${k}"]`); if (i && document.activeElement !== i) i.value = current[k] || ''; });
      const box = $('#parts'); box.textContent = ''; current.participants.forEach(q => box.appendChild(partRow(q))); renderPoster();
    }
    if (rerender) renderGrid(); else { const b = $(`#sheet tr[data-id="${id}"] .prog-btn`); if (b) { const n = fresh.participants.filter(p => !p.draft).length; b.textContent = `البرنامج (${n}) ▴`; } }
    renderPub(); flagSaved();
    clearTimeout(progPubT); if (CLOUD()) progPubT = setTimeout(() => publishCloud(true), 700);
  }
  const progData = id => clean(local.items[id] || merged().find(x => x.id === id) || { id, participants: [] }).participants;
  // يقرأ البنود من خانات الجدول (بنفس ترتيبها)
  function readProg(box) {
    const old = new Map(progData(box.dataset.sem).map(p => [p.pid, p]));
    return $$('tr.pi', box).map(tr => {
      const o = { ...(old.get(tr.dataset.pid) || {}), pid: tr.dataset.pid, kind: tr.querySelector('[data-p="kind"]').value };
      $$('[data-p]', tr).forEach(i => { if (i.dataset.p !== 'kind') o[i.dataset.p] = i.value.trim(); });
      const st = tr.querySelector('[data-p="start"]'), en = tr.querySelector('[data-p="end"]');
      if (st) { if (st.classList.contains('auto')) o.tauto = 1; else if (o.start) delete o.tauto; }
      if (en && en.classList.contains('auto')) o.eauto = 1;   // النهاية محسوبة: تتبع البداية لو تغيّرت
      if (filled(o)) delete o.draft;
      return o;
    });
  }
  const KIND_OPTS = [['paper', 'ورقة'], ['session', 'جلسة'], ['opening', 'افتتاح'], ['discussion', 'مداخلات'], ['break', 'استراحة'], ['closing', 'ختام']];
  function kindSelect(v) { const sel = el('select'); sel.dataset.p = 'kind'; KIND_OPTS.forEach(([k, t]) => { const o = el('option', null, t); o.value = k; sel.appendChild(o); }); sel.value = v; return sel; }
  function cellInput(p, f, ph, type) { const i = el('input'); i.type = type || 'text'; i.dataset.p = f; i.value = p[f] || ''; if (ph) i.placeholder = ph; return i; }
  function progRow(s) {
    const tr = el('tr', 'prog-row'); tr.dataset.prog = s.id;
    const td = el('td'); td.colSpan = GCOLS.length + 3; td.appendChild(progEditor(s)); tr.appendChild(td); return tr;
  }
  function progEditor(s) {
    const box = el('div', 'prog'); box.dataset.sem = s.id;
    const parts = progData(s.id);
    const t = el('table', 'ptab'), th = el('tr');
    ['من', 'إلى', 'النوع', 'العنوان / البند', 'الملقي / مدير الجلسة', 'الصفة', ''].forEach(h => th.appendChild(el('th', null, h)));
    const thead = el('thead'); thead.appendChild(th); t.appendChild(thead);
    const tb = el('tbody'); let paperNo = 0;
    const row = (p, draft) => {
      const r = el('tr', 'pi k-' + p.kind + (draft ? ' pdraft' : '') + (p.draft ? ' pempty' : '')); r.dataset.pid = p.pid; r.dataset.kind = p.kind;
      const c = (node, cls) => { const d = el('td', cls || null); if (node) d.appendChild(node); r.appendChild(d); return d; };
      if (p.kind === 'session') { c(null, 'pt-time').textContent = '—'; c(null, 'pt-time'); }
      else { const a = cellInput(p, 'start', '', 'time'), b = cellInput(p, 'end', '', 'time'); if (p.tauto) { a.classList.add('auto'); b.classList.add('auto'); a.title = b.title = 'وقت محسوب تلقائياً — غيّره إذا تبي'; } c(a, 'pt-time'); c(b, 'pt-time'); }
      const ks = kindSelect(p.kind); c(ks, 'pt-kind');
      if (p.kind === 'paper' && !draft) { paperNo++; ks.title = 'ورقة ' + paperNo; }
      if (p.kind === 'session') { c(cellInput(p, 'name', 'اسم الجلسة'), 'pt-topic'); c(cellInput(p, 'moderator', 'مدير الجلسة: اكتب الاسم'), 'pt-name'); c(cellInput(p, 'moderator_title', 'صفته (تتعبّى تلقائياً)'), 'pt-title'); }
      else {
        c(cellInput(p, 'topic', p.kind === 'paper' ? (draft ? 'بند جديد: اكتب عنوان الورقة هنا' : 'عنوان الورقة') : KINDS[p.kind].topic), 'pt-topic');
        if (p.kind === 'paper' || p.kind === 'opening') { c(cellInput(p, 'name', 'اكتب الاسم'), 'pt-name'); c(cellInput(p, 'title', 'الصفة (تتعبّى تلقائياً)'), 'pt-title'); }
        else { c(null, 'pt-name').textContent = '—'; c(null, 'pt-title'); }
      }
      const tools = c(null, 'pt-tools');
      if (!draft) [['↑', 'لفوق', 'up'], ['↓', 'لتحت', 'down'], ['✕', 'حذف البند', 'del']].forEach(([x, ttl, act]) => { const b = el('button', 'pt', x); b.type = 'button'; b.title = ttl; b.setAttribute('aria-label', ttl); b.dataset.act = act; tools.appendChild(b); });
      return r;
    };
    parts.forEach(p => tb.appendChild(row(p, false)));
    tb.appendChild(row({ pid: newPid(), kind: 'paper' }, true));          // سطر فاضي آخر الجدول للإضافة (مثل السطر الفاضي في المناقشات)
    t.appendChild(tb); box.appendChild(t);
    const bar = el('div', 'prog-bar');
    const btn = (txt, title, fn, cls) => { const b = el('button', 'btn sm' + (cls ? ' ' + cls : ''), txt); b.type = 'button'; b.title = title; b.onclick = fn; bar.appendChild(b); return b; };
    const add = (kind) => { const ps = readProg(box); ps.push({ pid: newPid(), kind, draft: 1 }); commitProg(s.id, ps, true); focusPid(s.id, ps[ps.length - 1].pid); };
    btn('＋ ورقة', 'إضافة ورقة في آخر البرنامج', () => add('paper'));
    btn('＋ جلسة', 'إضافة جلسة (يتسمّى «الجلسة الأولى/الثانية…» تلقائياً)', () => add('session'));
    btn('＋ مداخلات', 'إضافة المداخلات والتعقيبات', () => add('discussion'));
    btn('＋ استراحة', 'إضافة استراحة', () => add('break'));
    const tpl = el('select', 'prog-tpl'); [['', '📐 قالب جاهز…'], ['simple', 'ندوة بسيطة (افتتاح، 3 أوراق، مداخلات، ختام)'], ['two', 'ملتقى بجلستين (مثل «النص القرآني»)']].forEach(([v, x]) => { const o = el('option', null, x); o.value = v; tpl.appendChild(o); });
    tpl.onchange = () => { const v = tpl.value; tpl.value = ''; if (v) applyTemplate(s.id, v); }; bar.appendChild(tpl);
    btn('📋 الصق برنامج', 'الصق البرنامج من Word أو Excel أو واتساب، وراجعه قبل الاعتماد', () => openPaste(box, s.id));
    btn('⟲ أعد حساب الأوقات', 'كل بند يبدأ عند نهاية اللي قبله، من وقت بداية الندوة', () => { const ps = readProg(box); ps.forEach((p, i) => { if (i > 0 || !p.start) p.tauto = 1; }); commitProg(s.id, ps, true); toast('⟲ انحسبت الأوقات من جديد'); });
    const dur = el('label', 'prog-dur'); dur.appendChild(document.createTextNode('مدة الورقة '));
    const di = el('input'); di.type = 'number'; di.min = '5'; di.max = '90'; di.step = '5'; di.value = DUR().paper; di.onchange = () => { localStorage.setItem('qu_paper_dur', di.value); }; dur.appendChild(di); dur.appendChild(document.createTextNode(' د')); bar.appendChild(dur);
    box.appendChild(bar);
    if (!parts.filter(p => !p.draft).length) box.appendChild(el('p', 'hint prog-hint', 'البرنامج فاضي: اختر «📐 قالب جاهز» يبني لك الهيكل كامل، أو اكتب في السطر الأخير، أو «📋 الصق برنامج». الأوقات تنحسب لحالها من وقت بداية الندوة.'));
    return box;
  }
  function applyTemplate(id, v) {
    const cur = progData(id).filter(p => !p.draft);
    if (cur.length && !confirm(`البرنامج فيه ${QN.row(cur.length)}. نبدّلها بالقالب؟`)) return;
    const P = (kind) => ({ pid: newPid(), kind, tauto: 1, ...(kind === 'paper' ? { draft: 1 } : {}) });
    const papers = n => Array.from({ length: n }, () => P('paper'));
    const list = v === 'simple' ? [P('opening'), ...papers(3), P('discussion'), P('closing')]
      : [P('opening'), P('session'), ...papers(3), P('discussion'), P('break'), P('session'), ...papers(3), P('discussion'), P('closing')];
    commitProg(id, list, true); toast('📐 انبنى الهيكل — اكتب الأسماء وعناوين الأوراق، والأوقات تنحسب لحالها');
  }
  function focusPid(id, pid, field) {
    setTimeout(() => { const r = $(`#sheet tr[data-prog="${id}"] tr.pi[data-pid="${pid}"]`); const i = r && (r.querySelector(`[data-p="${field || 'topic'}"]`) || r.querySelector('input')); if (i) i.focus(); }, 30);
  }
  // مكان الكتابة قبل/بعد إعادة رسم الجدول (حتى الحفظ ما يضيّع اللي يكتبه الموظف)
  function focusKey() {
    const a = document.activeElement, T = $('#sheet'); if (!a || !T || !T.contains(a)) return null;
    const pi = a.closest('tr.pi'), main = a.closest('tr[data-id]'), prog = a.closest('tr[data-prog]');
    return { id: (prog && prog.dataset.prog) || (main && main.dataset.id), pid: pi && pi.dataset.pid, draft: !!(pi && pi.classList.contains('pdraft')), p: a.dataset.p, k: a.dataset.k, sel: (() => { try { return a.selectionStart; } catch (e) { return null; } })() };
  }
  function restoreFocus(k) {
    if (!k || !k.id) return;
    let i = null;
    if (k.k) i = $(`#sheet tr[data-id="${k.id}"] [data-k="${k.k}"]`);
    else if (k.p) { const box = $(`#sheet tr[data-prog="${k.id}"]`); if (box) { const r = k.draft ? box.querySelector('tr.pdraft') : box.querySelector(`tr.pi[data-pid="${k.pid}"]`); i = r && r.querySelector(`[data-p="${k.p}"]`); } }
    if (!i) return; i.focus(); try { if (k.sel != null) i.setSelectionRange(k.sel, k.sel); } catch (e) { /* خانة وقت */ }
  }
  // أحداث جدول البرنامج
  let progTypeT = 0;
  $('#sheet').addEventListener('click', e => {
    const b = e.target.closest('.prog button[data-act]'); if (!b) return;
    const box = b.closest('.prog'), tr = b.closest('tr.pi'), ps = readProg(box), i = ps.findIndex(p => p.pid === tr.dataset.pid);
    if (b.dataset.act === 'del') { if (filled(ps[i]) && !confirm('نحذف هذا البند؟')) return; ps.splice(i, 1); }
    if (b.dataset.act === 'up' && i > 0) { [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]]; ps[i].tauto = ps[i - 1].tauto = 1; }
    if (b.dataset.act === 'down' && i < ps.length - 1) { [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]]; ps[i].tauto = ps[i + 1].tauto = 1; }
    commitProg(box.dataset.sem, ps, true);
  });
  $('#sheet').addEventListener('input', e => {
    const i = e.target, box = i.closest && i.closest('.prog'); if (!box || !i.dataset.p || i.dataset.p === 'kind' || i.closest('.prog-paste')) return;
    const tr = i.closest('tr.pi'); if (!tr) return;
    if (/^(start|end)$/.test(i.dataset.p)) { i.classList.remove('auto'); const ps = readProg(box); clearTimeout(progTypeT); progTypeT = setTimeout(() => commitProg(box.dataset.sem, ps, false), 500); return; }
    if (tr.classList.contains('pdraft')) {          // أول حرف في السطر الأخير: يصير بند حقيقي، وينضاف سطر فاضي جديد تحته
      const ps = readProg(box); ps[ps.length - 1].tauto = 1; tr.classList.remove('pdraft'); commitProg(box.dataset.sem, ps, true); return;
    }
    clearTimeout(progTypeT); progTypeT = setTimeout(() => commitProg(box.dataset.sem, readProg(box), false), 500);
  });
  $('#sheet').addEventListener('change', e => {
    const i = e.target, box = i.closest && i.closest('.prog'); if (!box || !i.dataset.p || i.closest('.prog-paste')) return;
    const tr = i.closest('tr.pi'); if (!tr) return;
    clearTimeout(progTypeT);
    const ps = readProg(box);
    if (i.dataset.p === 'kind' && tr.classList.contains('pdraft')) { const p = ps[ps.length - 1]; p.draft = 1; p.tauto = 1; }   // نوع جديد للسطر الأخير
    commitProg(box.dataset.sem, ps, false);           // بعد ما يخلص الخانة: ينحفظ فوراً، والأوقات وأسماء الجلسات تنعرض بعد لحظة
    softRender();                                     // (مو فوراً: لو ضغط زر بنفس اللحظة ما تضيع ضغطته)
  });
  let softT = 0, lastKey = 0;
  document.addEventListener('keydown', () => { lastKey = Date.now(); }, true);
  function softRender() { clearTimeout(softT); softT = setTimeout(() => { if (Date.now() - lastKey < 400) return softRender(); renderGrid(); }, 350); }
  $('#sheet').addEventListener('keydown', e => {
    const i = e.target; if (e.key !== 'Enter' || !i.closest || !i.closest('.prog') || i.tagName !== 'INPUT' || i.closest('.prog-paste')) return;
    const td = i.closest('td'), tr = i.closest('tr.pi'), col = [...tr.children].indexOf(td), next = tr.nextElementSibling;
    if (next) { e.preventDefault(); const n = next.children[col] && next.children[col].querySelector('input,select'); if (n) n.focus(); }
  });

  // ---------- 📋 لصق برنامج (Word/Excel/واتساب) مع معاينة قبل الاعتماد ----------
  const latin = v => String(v || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const HON = /^(أ\.?\s?د\.?|ا\.?\s?د\.?|د\s?\.|الدكتور|الدكتورة|الشيخ|فضيلة|معالي|سعادة|أ\.)\s*/;
  function parseProgram(text) {
    const out = [];
    const lines = latin(text).split(/\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let line of lines) {
      let start = '';
      const tm = line.match(/(\d{1,2})\s*[:.:]\s*(\d{2})\s*(ص|صباحا|صباحاً|م|مساء|مساءً|ظهرا|ظهراً|عصرا|عصراً)?/);
      if (tm) { let h = +tm[1]; const pm = /^(م|مساء|ظهر|عصر)/.test(tm[3] || ''), am = /^ص/.test(tm[3] || ''); if (pm && h < 12) h += 12; if (am && h === 12) h = 0; if (!tm[3] && h < 7) h += 12; start = String(h).padStart(2, '0') + ':' + tm[2]; line = line.replace(tm[0], ' ').replace(/^[\s\-–—|:،.]+|[\s\-–—|:،]+$/g, '').trim(); }
      const segs = line.split(/\t|\s[-–—|]\s|\s?[|]\s?/).map(x => x.trim()).filter(Boolean);
      if (/الجلسة|جلسة/.test(line)) {
        const nm = (line.match(/(الجلسة\s+\S+)/) || [])[1] || '';
        const mod = (line.match(/(?:يديرها|إدارة|ادارة|رئيس الجلسة|رئيسها)\s*:?\s*(.+)$/) || [])[1] || '';
        out.push({ pid: newPid(), kind: 'session', name: nm, moderator: mod.trim() }); continue;
      }
      const kind = /افتتاح/.test(line) ? 'opening' : /استراحة/.test(line) ? 'break' : /مداخلات|تعقيبات|نقاش/.test(line) ? 'discussion' : /ختام|توصيات/.test(line) ? 'closing' : 'paper';
      if (!segs.length && start && out.length) continue;
      const nameSeg = segs.find(x => HON.test(x)), titleSeg = segs.find(x => /^(الأستاذ|أستاذ|عميد|وكيل|رئيس قسم|المحاضر)/.test(x));
      if (!nameSeg && titleSeg && segs.length === 1 && out.length) { const prev = out[out.length - 1]; if (prev.kind === 'session') prev.moderator_title = titleSeg; else prev.title = titleSeg; continue; }
      const rest = segs.filter(x => x !== nameSeg && x !== titleSeg);
      const o = { pid: newPid(), kind, start, topic: rest.sort((a, b) => b.length - a.length)[0] || '', name: nameSeg || '', title: titleSeg || '' };
      if (o.name && !o.title && window.QPeople) { const f = QPeople.find(o.name.replace(HON, ''))[0]; if (f && QPeople.key(f.name) === QPeople.key(o.name)) o.title = f.title; }
      if (kind !== 'paper' && !o.topic) o.topic = KINDS[kind].topic;
      out.push(o);
    }
    return out;
  }
  function openPaste(box, id) {
    let pane = box.querySelector('.prog-paste'); if (pane) { pane.remove(); return; }
    pane = el('div', 'prog-paste');
    pane.appendChild(el('p', 'hint', 'الصق البرنامج هنا (من Word أو Excel أو رسالة واتساب) — كل بند في سطر. بعدين اضغط «حلّل» وراجع النتيجة قبل الاعتماد.'));
    const ta = el('textarea'); ta.rows = 8; ta.placeholder = '10:15 افتتاح الملتقى - أ.د. خالد أبا الخيل\nالجلسة الأولى - إدارة: أ.د. عبدالعزيز المزيني\n10:20 الاستدلال بالقرآن مفهومه وأنواعه - د. محمد أبا الخيل'; pane.appendChild(ta);
    const prev = el('div', 'prog-prev'), acts = el('div', 'prog-bar');
    const mk = (txt, fn, cls) => { const b = el('button', 'btn sm' + (cls ? ' ' + cls : ''), txt); b.type = 'button'; b.onclick = fn; acts.appendChild(b); return b; };
    let parsed = [];
    const KL = Object.fromEntries(KIND_OPTS);
    mk('🔍 حلّل', () => {
      parsed = parseProgram(ta.value);
      prev.textContent = '';
      if (!parsed.length) { prev.appendChild(el('p', 'hint', 'ما لقيت بنود — تأكد إن كل بند في سطر')); return; }
      const t = el('table', 'ptab prev'); parsed.forEach(p => { const r = el('tr'); [t12(p.start) || '—', KL[p.kind], p.kind === 'session' ? p.name : p.topic, p.kind === 'session' ? (p.moderator || '') : p.name, p.kind === 'session' ? (p.moderator_title || '') : p.title].forEach(x => r.appendChild(el('td', null, x || ''))); t.appendChild(r); });
      prev.appendChild(el('p', 'hint', `لقيت ${QN.row(parsed.length)} — راجعها، وأي غلط تقدر تعدّله في الجدول بعد الاعتماد:`)); prev.appendChild(t);
    }, 'primary');
    mk('✓ اعتمد (بدل البرنامج الحالي)', () => { if (!parsed.length) return toast('اضغط «حلّل» أول', true); parsed.forEach((p, i) => { if (!p.start && i) p.tauto = 1; }); commitProg(id, parsed, true); toast(`✓ انضاف ${QN.row(parsed.length)} للبرنامج`); });
    mk('＋ أضفها لآخر البرنامج', () => { if (!parsed.length) return toast('اضغط «حلّل» أول', true); const ps = progData(id).filter(p => !p.draft).concat(parsed.map(p => ({ ...p, tauto: p.start ? undefined : 1 }))); commitProg(id, ps, true); toast(`✓ انضاف ${QN.row(parsed.length)} لآخر البرنامج`); });
    mk('إلغاء', () => pane.remove());
    pane.appendChild(acts); pane.appendChild(prev); box.appendChild(pane); ta.focus();
  }

  function updSel() {
    [...gridSel].forEach(id => { if (!merged().some(s => s.id === id)) gridSel.delete(id); });
    $('#gSelCount').textContent = gridSel.size ? `المحدد: ${gridSel.size}` : '';
  }
  function duplicate(s) {
    const c = clean(s); c.id = newId(); c.updated = new Date().toISOString();
    local.items[c.id] = c; saveLocal(); openSem(c); renderPub(); toast('تمت إضافة نسخة جديدة — عدّل التاريخ والعنوان');
  }

  // ---------- النموذج ----------
  function partRow(p = {}) {
    const kind = KINDS[p.kind] ? p.kind : 'paper', K = KINDS[kind];
    const li = el('li', 'pitem k-' + kind); li.dataset.kind = kind; li.dataset.pid = p.pid || newPid();
    if (p.tauto) li.dataset.tauto = '1'; if (p.draft) li.dataset.draft = '1';
    const head = el('div', 'phead2');
    head.appendChild(el('span', 'pk', K.label));
    const tools = el('span', 'ptools');
    const mk = (txt, title, fn) => { const b = el('button', 'pt', txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.onclick = fn; tools.appendChild(b); };
    mk('↑', 'نقل لأعلى', () => { if (li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); readForm(true); });
    mk('↓', 'نقل لأسفل', () => { if (li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); readForm(true); });
    mk('✕', 'حذف البند', () => { li.remove(); readForm(true); });
    head.appendChild(tools); li.appendChild(head);
    const grid = el('div', 'pgrid');
    for (const f of K.fields) {
      const w = el('label', 'pf pf-' + f);
      w.appendChild(el('span', null, kind === 'session' && f === 'name' ? 'اسم الجلسة' : kind === 'paper' && f === 'topic' ? 'عنوان الورقة' : FIELD_LABEL[f]));
      const i = el('input'); i.type = (f === 'start' || f === 'end') ? 'time' : 'text'; i.dataset.p = f;
      i.value = p[f] != null && p[f] !== '' ? p[f] : (K[f] || '');
      if (kind === 'session' && f === 'name') i.setAttribute('list', 'sessNames');
      w.appendChild(i); grid.appendChild(w);
    }
    li.appendChild(grid);
    li.addEventListener('input', e => { if (e.target && /^(start|end)$/.test(e.target.dataset.p || '')) delete li.dataset.tauto; readForm(true); });
    return li;
  }

  // keepGrid: فتح من تعديل الجدول (لا نعيد رسم النموذج إن كان هو نفسه)
  function openSem(s, fromGrid) {
    current = clean(s);
    $$('[data-k]').forEach(i => { i.value = current[i.dataset.k] || (i.dataset.k === 'status' ? 'confirmed' : ''); });
    $('#qrOn').checked = !!current.link; $('#linkRow').hidden = !current.link;
    syncSeriesChips();
    if (!fromGrid || !$('#parts').children.length) {
      const parts = $('#parts'); parts.textContent = '';
      current.participants.forEach(p => parts.appendChild(partRow(p)));
    }
    const known = merged().some(x => x.id === current.id);
    $('#btnDelete').hidden = !known; $('#btnDup').hidden = !known;
    $('#editingLabel').textContent = known ? `تعدّل: ${current.title || 'ندوة بلا عنوان'}` : 'ندوة جديدة';
    $('#savedFlag').textContent = '';
    updateHijri(); renderGrid(); renderPoster(); formConflict();
  }

  // يقرأ النموذج؛ save=true عند تعديل المستخدم: ينحفظ تلقائياً على هذا الجهاز (لا خانة إجبارية)
  function readForm(save) {
    if (!current) return;
    $$('[data-k]').forEach(i => { current[i.dataset.k] = i.value; });
    current.participants = $$('#parts .pitem').map(r => ({ pid: r.dataset.pid, kind: r.dataset.kind, role: KINDS[r.dataset.kind].role,
      ...(r.dataset.tauto ? { tauto: 1 } : {}), ...(r.dataset.draft ? { draft: 1 } : {}),
      ...Object.fromEntries($$('[data-p]', r).map(i => [i.dataset.p, i.value])) }));
    updateHijri(); renderPoster();
    if (save) autosave();
  }
  function updateHijri() { const d = $('#f_date').value; $('#hijri').textContent = d ? `${weekday(d)} — ${hijri(d)} — ${gdate(d)}` : ''; }
  let saveT = 0;
  function autosave() {
    clearTimeout(saveT);
    saveT = setTimeout(saveNow, 350);
  }
  function saveNow() {
    clearTimeout(saveT);
    {
      const s = clean(current);
      const empty = !s.title && !s.subtitle && !s.date && !s.start && !s.participants.length && !s.notes;
      if (empty && !local.items[s.id] && !published.seminars.some(x => x.id === s.id)) return;   // ندوة جديدة فاضية: لا تُحفظ
      s.updated = new Date().toISOString();
      local.items[s.id] = s; local.deleted = local.deleted.filter(x => x !== s.id); saveLocal();
      current = s;
      $('#btnDelete').hidden = false; $('#btnDup').hidden = false;
      $('#editingLabel').textContent = `تعدّل: ${s.title || 'ندوة بلا عنوان'}`;
      renderGrid(); renderPub(); flagSaved(); formConflict();
      if (CLOUD()) publishCloud(true);
    }
  }
  // «💾 حفظ»: تأكيد — الحفظ التلقائي شغال دايماً، والزر يرسل الحين ويقول للموظف إنها وصلت
  { const b = $('#btnSave'); if (b) b.onclick = async () => {
    readForm(false);
    // الزر فوق الجدول: إذا خانات الندوة فاضية ما ننشئ ندوة فاضية — نرسل تعديلات الجدول ونأكد (مثل المناقشات)
    { const s = clean(current); if (s.title || s.subtitle || s.date || s.participants.length) saveNow(); }
    if (!CLOUD()) return toast('✓ انحفظت على هذا الجهاز');
    b.disabled = true; const old = b.textContent; b.textContent = '⏳ جارٍ الحفظ...';
    for (let i = 0; i < 20 && pubBusy; i++) await new Promise(r => setTimeout(r, 300));
    await publishCloud(true);
    b.disabled = false; b.textContent = old;
    toast(!pendingCount() ? '✓ انحفظت ووصلت للبث — يشوفها زملاؤك وOBS' : 'ما قدرت أوصل للخادم الحين — محفوظة على جهازك وبتوصل تلقائياً', !!pendingCount());
  }; }
  function flagSaved() { $('#savedFlag').classList.add('show'); $('#savedFlag').textContent = CLOUD() ? '✓ محفوظة وتصل للبث تلقائياً' : token() ? '✓ محفوظة على هذا الجهاز — «نشر الندوات» لتظهر للجميع' : '✓ محفوظة على هذا الجهاز'; }
  function formConflict() {
    const box = $('#formConflict'); const c = current ? conflictsOf(clean(current), merged()) : [];
    box.hidden = !c.length; box.textContent = c.length ? '🔴 تعارض: بنفس القاعة والوقت مع «' + c.map(o => o.title || 'ندوة بلا عنوان').join('»، «') + '»' : '';
  }
  function syncSeriesChips() { const v = ($('#f_series').value || '').trim(); $$('#seriesChips .chip').forEach(b => b.classList.toggle('active', !!v && v === b.dataset.series)); }

  function save() { readForm(); autosave(); }

  function del() {
    if (!current || !confirm(`حذف ندوة «${current.title || 'بلا عنوان'}»؟ تُحذف من الجميع بعد النشر.`)) return;
    delete local.items[current.id];
    if (published.seminars.some(x => x.id === current.id) && !local.deleted.includes(current.id)) local.deleted.push(current.id);
    gridSel.delete(current.id);
    saveLocal(); openSem(blank()); renderPub();
    if (CLOUD()) { publishCloud(true); toast('حُذفت — وتختفي من البث تلقائياً'); } else toast('حُذفت — اضغط «نشر الندوات» لتطبيق الحذف على الجميع');
  }
  function delSelected() {
    if (!gridSel.size) return toast('حدد الأسطر أولاً من مربعات الجدول', true);
    if (!confirm(`حذف ${QN.sem(gridSel.size)}؟ تنحذف من عند الجميع ومن البث.`)) return;
    gridSel.forEach(id => { delete local.items[id]; if (published.seminars.some(x => x.id === id) && !local.deleted.includes(id)) local.deleted.push(id); });
    if (current && gridSel.has(current.id)) current = blank();
    gridSel.clear(); saveLocal(); openSem(current || blank()); renderPub();
    if (CLOUD()) { publishCloud(true); toast('حُذفت — وتختفي من البث تلقائياً'); } else toast('حُذفت — اضغط «نشر الندوات» لتطبيق الحذف على الجميع');
  }
  // ---------- الإعلان ----------
  // المقاسات: نفس قائمة صفحة المناقشات (poster.js FORMATS) + «برنامج الندوة» الذي يطول مع البنود.
  // tall = التصميم الطولي، wide = تصميم عرضي يُرسم على 1600×900 ثم يُكبّر/يُصغّر (كلها 16:9)،
  // banner = غلاف القناة: المحتوى داخل المنطقة الآمنة 1546×423 الظاهرة في كل الأجهزة.
  const SFMTS = [
    { id: 'programme', name: 'برنامج الندوة', w: 1080, h: 0 },
    { id: 'post', name: 'منشور', w: 1080, h: 1350, layout: 'tall', max: 5 },
    { id: 'story', name: 'ستوري / حالات', w: 1080, h: 1920, layout: 'tall', max: 8 },
    { id: 'a4', name: 'ورقة A4', w: 1080, h: 1527, layout: 'tall', max: 6 },
    { id: 'square', name: 'منشور مربع', w: 1080, h: 1080, layout: 'tall', max: 3 },
    { id: 'youtube', name: 'صورة يوتيوب المصغّرة', w: 1280, h: 720, layout: 'wide', max: 4 },
    { id: 'x', name: 'منشور X', w: 1600, h: 900, layout: 'wide', max: 4 },
    { id: 'ytbanner', name: 'غلاف قناة يوتيوب', w: 2560, h: 1440, layout: 'banner', max: 4, safe: { w: 1546, h: 423 } },
  ];
  const fmtOf = (id) => SFMTS.find(f => f.id === id) || SFMTS[0];
  // ⁦…⁩ يعزل الأبعاد حتى لا تنقلب «1080×1350» داخل النص العربي
  const dims = (w, h) => `⁦${w}×${h}⁩`;
  const fmtLabel = (f) => f.h ? `${f.name} ${dims(f.w, f.h)}` : f.name;

  function renderPoster() {
    renderInto($('#poster'), clean(current || blank()), fmtOf(size));
    fitStage();
  }
  // يرسم الإعلان بالمقاس f في العنصر P (المعاينة أو عنصر التصدير المخفي)
  function renderInto(P, s, f) {
    s = { ...s, participants: (s.participants || []).filter(p => !(p.draft && !p.name && !p.topic && !p.moderator)) };
    P.textContent = ''; P.className = 'qs'; P.dataset.size = f.id; P.dataset.layout = f.layout || 'programme';
    P.style.width = f.w + 'px'; P.style.height = f.h ? f.h + 'px' : '';
    delete P.dataset.overflow;
    if (f.id === 'programme') return renderProgramme(P, s);
    if (f.layout === 'tall') {
      // يقل عدد المتحدثين المعروضين إذا ما وسعهم المقاس حتى بعد التصغير
      for (let max = f.max; max >= 1; max--) { if (renderTall(P, s, f, max)) return; }
      P.dataset.overflow = '1';
      return;
    }
    return renderWide(P, s, f);
  }

  function renderTall(P, s, f, max) {
    P.textContent = '';
    P.appendChild(el('div', 'qs-callig', 'ندوة'));
    const inner = el('div', 'qs-inner');
    const logo = el('img', 'qs-logo'); logo.src = LOGO; logo.alt = ''; inner.appendChild(logo);
    inner.appendChild(el('div', 'qs-pill', `تُقيم ${s.organizer || 'كلية الشريعة'}`));
    inner.appendChild(el('p', 'qs-kicker', `${s.series || 'ندوة'} بعنوان`));
    inner.appendChild(el('h1', 'qs-title', s.title ? quoted(s.title) : 'عنوان الندوة'));
    if (s.subtitle) inner.appendChild(el('p', 'qs-sub', s.subtitle));
    if (STATUS_AR[s.status]) inner.appendChild(el('div', 'qs-status ' + s.status, STATUS_AR[s.status]));
    const speakers = s.participants.filter(isSpeaker);
    if (speakers.length) {
      const box = el('div', 'qs-people');
      box.appendChild(el('h3', null, 'المشاركون'));
      speakers.slice(0, max).forEach(p => {
        const r = el('div', 'qs-person');
        r.appendChild(el('div', 'n', p.name));
        const tm = [t12(p.start), t12(p.end)].filter(Boolean).join(' – ');
        if (tm) r.appendChild(el('div', 'tm', tm));
        const sub = [p.title, tm ? p.role : ''].filter(Boolean).join(' — ');
        if (sub) r.appendChild(el('div', 'r', sub));
        if (p.topic) r.appendChild(el('div', 'tp', p.topic));
        box.appendChild(r);
      });
      if (speakers.length > max) box.appendChild(el('div', 'qs-person qw-more', `و${QPlural(speakers.length - max, 'متحدث آخر', 'متحدثان آخران', 'متحدثين آخرين', 'متحدثاً آخر')}`));
      inner.appendChild(box);
    }
    const facts = el('div', 'qs-facts');
    const fact = (label, big, small) => { const d = el('div'); d.appendChild(el('b', null, label)); d.appendChild(el('span', null, big || '—')); if (small) d.appendChild(el('small', null, small)); facts.appendChild(d); };
    fact('اليوم', weekday(s.date), [hijri(s.date), gdate(s.date)].filter(Boolean).join(' — '));
    fact('الوقت', [t12(s.start), t12(s.end)].filter(Boolean).join(' – '));
    fact('المكان', s.place, s.place_note);
    inner.appendChild(facts);
    P.appendChild(inner);
    const b = el('div', 'qs-building'); const bi = el('img'); bi.src = BUILDING; bi.alt = ''; b.appendChild(bi); P.appendChild(b);
    const foot = el('div', 'qs-foot');
    foot.appendChild(el('div', 'qs-org', 'كلية الشريعة'));
    if (s.link && /^https?:\/\//i.test(s.link) && window.qrcode) {
      try {
        
        const box = el('div', 'qs-qr');
        box.innerHTML = qrInner(s.link);
        box.appendChild(el('div', null, s._rec ? 'شاهد التسجيل' : 'شاهد البث'));
        foot.appendChild(box);
      } catch (e) { /* رابط طويل جداً */ }
    }
    P.appendChild(foot);
    return fitContent(inner, f.h);
  }

  // ---------- المقاسات العريضة: يوتيوب المصغّرة و X (16:9) وغلاف القناة ----------
  // الباركود نفسه اللي في المناقشات (poster.js): أقل كثافة مع أعلى تصحيح، وأيقونة المنصة (يوتيوب…) في الوسط
  const QR_ICONS = [
    [/youtu\.?be/i, '<rect x="1" y="4.5" width="22" height="15" rx="4.6" fill="#FF0000"/><path d="M9.8 8.4v7.2l6.2-3.6z" fill="#fff"/>'],
    [/zoom\.(us|com)|\bzoom\b/i, '<rect width="24" height="24" rx="6" fill="#2D8CFF"/><path d="M4.6 8.6c0-.5.4-.9.9-.9h7.6c1.2 0 2.1.9 2.1 2.1v5.6c0 .5-.4.9-.9.9H6.7c-1.2 0-2.1-.9-2.1-2.1zM16.2 10.7l3.2-2.3c.3-.2.6 0 .6.3v6.6c0 .4-.3.5-.6.3l-3.2-2.3z" fill="#fff"/>'],
    [/teams\.(microsoft|live)|\bteams\b/i, '<rect width="24" height="24" rx="5" fill="#5059C9"/><path d="M6 6.8h11.2v2.7h-4.2V18h-2.8V9.5H6z" fill="#fff"/>'],
  ];
  const QR_GENERIC = '<circle cx="12" cy="12" r="12" fill="#2b7574"/><path d="M10.6 13.4a3 3 0 0 0 4.2 0l2.4-2.4a3 3 0 0 0-4.2-4.2l-.9.9M13.4 10.6a3 3 0 0 0-4.2 0L6.8 13a3 3 0 0 0 4.2 4.2l.9-.9" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
  function qrInner(link) {
    const txt = String(link || '').trim().replace(/^(https?:\/\/)www\./i, '$1');
    let best = null;
    for (const lvl of ['H', 'Q', 'M']) { const q = window.qrcode(0, lvl); q.addData(txt); q.make(); if (!best || q.getModuleCount() < best.getModuleCount()) best = q; }
    const icon = (QR_ICONS.find(([re]) => re.test(txt)) || [null, QR_GENERIC])[1];
    return `<div class="qr-wrap">${best.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}<span class="qr-logo"><svg viewBox="0 0 24 24">${icon}</svg></span></div>`;
  }
  function qrBox(link, cls, caption) {
    if (!link || !/^https?:\/\//i.test(link) || !window.qrcode) return null;
    try {
      
      const box = el('div', cls);
      box.innerHTML = qrInner(link);
      box.appendChild(el('div', null, caption));
      return box;
    } catch (e) { return null; }   // رابط طويل جداً
  }
  const quoted = (t) => t ? (/[«»"]/.test(t) ? t : `«${t}»`) : '«عنوان الندوة»';
  function speakerCard(speakers, n) {
    const box = el('div', 'qs-people');
    box.appendChild(el('h3', null, 'المتحدثون'));
    speakers.slice(0, n).forEach(p => {
      const r = el('div', 'qs-person'); r.appendChild(el('div', 'n', p.name));
      if (p.title) r.appendChild(el('div', 'r', p.title));
      box.appendChild(r);
    });
    if (speakers.length > n) box.appendChild(el('div', 'qs-person qw-more', `و${QPlural(speakers.length - n, 'متحدث آخر', 'متحدثان آخران', 'متحدثين آخرين', 'متحدثاً آخر')}`));
    return box;
  }
  // يصغّر خط العنوان حتى يتسع العمود، ثم يقلل المتحدثين؛ ويعلّم الإعلان إذا بقي شيء لا يتسع
  function shrinkTitle(col, title, from, to) {
    for (let fs = from; col.scrollHeight > col.clientHeight + 1 && fs > to; fs -= 2) title.style.fontSize = (fs - 2) + 'px';
  }

  function renderWide(P, s, f) {
    const banner = f.layout === 'banner';
    const speakers = s.participants.filter(isSpeaker);
    P.classList.add(banner ? 'qb' : 'qw');
    P.appendChild(el('div', 'qs-callig', 'ندوة'));
    if (banner) P.appendChild(el('div', 'qb-band'));
    const b = el('div', 'qs-building'); const bi = el('img'); bi.src = BUILDING; bi.alt = ''; b.appendChild(bi);
    const stage = el('div', banner ? 'qb-stage' : 'qw-stage');
    if (banner) {
      P.appendChild(b);
      Object.assign(stage.style, { left: (f.w - f.safe.w) / 2 + 'px', top: (f.h - f.safe.h) / 2 + 'px', width: f.safe.w + 'px', height: f.safe.h + 'px' });
    } else {
      stage.appendChild(b);
      stage.style.transform = `scale(${f.w / 1600})`;
    }
    P.appendChild(stage);

    // العنوان: الشعار + الجهة + النوع + عنوان الندوة
    const main = el('div', banner ? 'qb-main' : 'qw-main');
    const head = el('div', 'qw-head');
    const logo = el('img', 'qw-logo'); logo.src = LOGO; logo.alt = ''; head.appendChild(logo);
    head.appendChild(el('div', 'qs-pill', `تُقيم ${s.organizer || 'كلية الشريعة'}`));
    if (banner) stage.appendChild(head); else main.appendChild(head);
    main.appendChild(el('p', 'qs-kicker', `${s.series || 'ندوة'} بعنوان`));
    const title = el('h1', 'qw-title', quoted(s.title)); main.appendChild(title);
    if (s.subtitle) main.appendChild(el('p', 'qs-sub qw-sub', s.subtitle));
    if (STATUS_AR[s.status]) main.appendChild(el('div', 'qs-status qw-status ' + s.status, STATUS_AR[s.status]));
    let names = null;
    if (banner && speakers.length) { names = el('p', 'qb-names'); main.appendChild(names); }
    stage.appendChild(main);

    // الموعد والمكان
    const facts = el('div', banner ? 'qb-facts' : 'qs-facts qw-facts');
    const fact = (icon, label, big, small) => {
      const d = el('div'); let t = d;
      if (banner) { const ic = el('span', 'qp2-ic'); ic.innerHTML = ICON[icon]; d.appendChild(ic); t = el('div'); d.appendChild(t); }
      else t.appendChild(el('b', null, label));
      t.appendChild(el('span', null, big || '—')); if (small) t.appendChild(el('small', null, small));
      facts.appendChild(d);
    };
    fact('cal', 'اليوم', s.date ? `${weekday(s.date)} ${hijri(s.date)}` : '', s.date ? gdate(s.date) : '');
    fact('clock', 'الوقت', [t12(s.start), t12(s.end)].filter(Boolean).join(' – '));
    fact('pin', 'المكان', s.place, s.place_note);
    const qr = qrBox(s.link, banner ? 'qb-qr' : 'qs-qr qw-qr', s._rec ? 'شاهد التسجيل' : 'شاهد البث');
    if (banner) { stage.appendChild(facts); if (qr) stage.appendChild(qr); }

    // المتحدثون: عمود جانبي في 16:9، وسطر «بمشاركة» في الغلاف
    let side = null;
    if (!banner) {
      if (speakers.length) { side = el('div', 'qw-side'); stage.appendChild(side); } else stage.classList.add('solo');
      const bottom = el('div', 'qw-bottom'); bottom.appendChild(facts); if (qr) bottom.appendChild(qr); stage.appendChild(bottom);
    }

    // الملاءمة: المقاسات ثابتة، فالعنوان يصغر والمتحدثون يقلّون بدل ما يطلع النص برّا الصورة
    const setNames = (n) => { names.textContent = 'بمشاركة: ' + speakers.slice(0, n).map(p => p.name).join('، ') + (speakers.length > n ? ' وآخرين' : ''); };
    if (names) setNames(Math.min(3, speakers.length));   // الغلاف: أهم المتحدثين قبل تصغير العنوان كثير
    shrinkTitle(main, title, banner ? 50 : 60, banner ? 36 : 34);
    if (side) {
      for (let n = Math.min(f.max, speakers.length); n >= 1; n--) {
        side.textContent = ''; side.appendChild(speakerCard(speakers, n));
        if (side.scrollHeight <= side.clientHeight + 1) break;
      }
    }
    if (names) {
      for (let n = Math.min(3, speakers.length); n >= 1; n--) {
        setNames(n);
        if (main.scrollHeight <= main.clientHeight + 1) break;
      }
      if (main.scrollHeight > main.clientHeight + 1) { names.remove(); shrinkTitle(main, title, parseFloat(title.style.fontSize) || 50, 30); }
    }
    if (main.scrollHeight > main.clientHeight + 1 || (side && side.scrollHeight > side.clientHeight + 1)) P.dataset.overflow = '1';
    if (banner) P.appendChild(el('div', 'qs-safe'));   // إطار المنطقة الآمنة: في المعاينة فقط
  }
  // ---------- إعلان برنامج الندوة (الطول يزيد مع عدد البنود) ----------
  const ICON = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };
  function timeCell(p, cls, tag) {
    const d = el(tag || 'div', cls), a = t12s(p.start).replace(/^0/, ''), b = t12s(p.end).replace(/^0/, '');
    if (!a && !b) d.classList.add('none');
    const box = el('span', 'tm'); [a, b].filter(Boolean).forEach(t => { const x = el('bdi', null, t); x.dir = 'rtl'; box.appendChild(x); });
    d.appendChild(box); return d;
  }
  const timeRange = (p) => { const a = t12s(p.start), b = t12s(p.end); return a && b ? `${a} - ${b}` : (a || b); };
  function t12s(hm) { if (!/^\d{1,2}:\d{2}$/.test(hm || '')) return ''; let [h, m] = hm.split(':').map(Number); const suf = h < 12 ? 'ص' : 'م'; h = h % 12 || 12; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suf}`; }
  function hijriLong(iso) { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')).replace(/[\u200e\u200f]/g, '').replace(/\s*هـ$/, '') + 'هـ'; } catch (e) { return ''; } }
  function gLong(iso) { try { return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')).replace(/[\u200e\u200f]/g, '') + 'م'; } catch (e) { return ''; } }
  function person(name, title) { const d = el('div', 'pp'); d.appendChild(el('b', null, name)); if (title) d.appendChild(el('small', null, title)); return d; }

  function renderProgramme(P, s) {
    P.classList.add('qp2');
    const pat = el('div', 'qp2-pattern'); P.appendChild(pat);
    // الترويسة
    const head = el('header', 'qp2-head ' + s.poster_header);
    if (s.poster_header === 'official') {
      const blk = el('div', 'qp2-official');
      ['المملكة العربية السعودية', 'وزارة التعليم - جامعة القصيم', 'كلية الشريعة', s.department].filter(Boolean).forEach(t => blk.appendChild(el('div', null, t)));
      head.appendChild(blk);
    }
    const logo = el('img', 'qp2-logo'); logo.src = LOGO; logo.alt = ''; head.appendChild(logo);
    if (s.poster_header !== 'official') head.appendChild(el('div', 'qp2-college', 'كلية الشريعة'));
    P.appendChild(head);
    // المقدمة
    const intro = el('section', 'qp2-intro');
    intro.appendChild(el('p', 'qp2-lead', `تقيم ${s.organizer || 'كلية الشريعة'}${s.department ? ' ممثلة ب' + s.department : ''}`));
    intro.appendChild(el('p', 'qp2-lead', `${s.series || 'ندوة'} بعنوان:`));
    intro.appendChild(el('h1', 'qp2-title', s.title ? (/[«»"]/.test(s.title) ? s.title : `«${s.title}»`) : '«عنوان الندوة»'));   // لا أقواس مكررة إن كتبها الموظف
    if (s.subtitle) intro.appendChild(el('p', 'qp2-sub', s.subtitle));
    if (STATUS_AR[s.status]) intro.appendChild(el('div', 'qs-status ' + s.status, STATUS_AR[s.status]));
    intro.appendChild(el('div', 'qp2-rule'));
    P.appendChild(intro);
    // البرنامج
    const band = el('section', 'qp2-band');
    if (s.programme_layout === 'table') renderTable(band, s.participants); else renderCells(band, s.participants);
    if (!s.participants.length) band.appendChild(el('p', 'qp2-empty', 'أضف بنود البرنامج من النموذج'));
    P.appendChild(band);
    // التذييل
    const foot = el('section', 'qp2-foot');
    const info = el('div', 'qp2-info');
    const line = (icon, a, b) => { const r = el('div', 'qp2-line'); const ic = el('span', 'qp2-ic'); ic.innerHTML = ICON[icon]; r.appendChild(ic); const t = el('div'); t.appendChild(el('b', null, a)); if (b) t.appendChild(el('span', null, b)); r.appendChild(t); info.appendChild(r); };
    if (s.date) line('cal', `يوم ${weekday(s.date)}، ${hijriLong(s.date)}`, `الموافق ${gLong(s.date)}`);
    line('pin', s.place || 'المكان', [s.place_note, 'كلية الشريعة'].filter(Boolean).join(' / '));
    if (s.public_note) info.appendChild(el('p', 'qp2-note', s.public_note));
    foot.appendChild(info);
    if (s.link && /^https?:\/\//i.test(s.link) && window.qrcode) {
      try {
        
        const box = el('div', 'qp2-qr');
        box.innerHTML = qrInner(s.link);
        box.appendChild(el('div', null, s._rec ? 'شاهد التسجيل عبر مسح رمز QR' : 'البث المباشر عبر مسح رمز QR'));
        foot.appendChild(box);
      } catch (e) { /* رابط طويل جداً */ }
    }
    P.appendChild(foot);
    const bottom = el('div', 'qp2-bottom'); const bi = el('img'); bi.src = BUILDING; bi.alt = ''; bottom.appendChild(bi); P.appendChild(bottom);
  }

  function renderCells(band, items) {
    for (const p of items) {
      const row = el('div', 'qc-row k-' + p.kind);
      if (p.kind === 'session') {
        row.classList.add('qc-session');
        row.appendChild(el('div', 'qc-sname', p.name || 'الجلسة'));
        if (p.moderator) { const m = el('div', 'qc-mod'); m.appendChild(el('b', null, 'إدارة: ' + p.moderator)); if (p.moderator_title) m.appendChild(el('small', null, p.moderator_title)); row.appendChild(m); }
      } else if (p.kind === 'paper') {
        row.appendChild(el('div', 'qc qc-topic', p.topic || '—'));
        const c = el('div', 'qc qc-person'); c.appendChild(person(p.name, p.title)); row.appendChild(c);
        row.appendChild(timeCell(p, 'qc qc-time'));
      } else if (p.kind === 'opening') {
        row.appendChild(el('div', 'qc qc-grad', p.topic || 'الافتتاح'));
        const c = el('div', 'qc qc-person'); if (p.name) c.appendChild(person(p.name, p.title)); row.appendChild(c);
        row.appendChild(timeCell(p, 'qc qc-time'));
      } else if (p.kind === 'discussion') {
        row.appendChild(el('div', 'qc qc-wide', p.topic || 'المداخلات والتعقيبات'));
        row.appendChild(timeCell(p, 'qc qc-time'));
      } else { // break / closing
        row.appendChild(el('div', 'qc qc-grad qc-wide', p.topic || KINDS[p.kind].topic));
        row.appendChild(timeCell(p, 'qc qc-grad qc-time'));
      }
      band.appendChild(row);
    }
  }

  function renderTable(band, items) {
    let table = null, n = 0;
    const hasSpec = items.some(p => p.kind === 'paper' && p.specialty);
    const newTable = () => {
      table = el('table', 'qt' + (hasSpec ? '' : ' nospec'));
      const tr = el('tr'); ['م', 'عنوان الورقة البحثية', 'الأستاذ الملقي', hasSpec ? 'التخصص' : null, 'الوقت'].filter(Boolean).forEach(h => tr.appendChild(el('th', null, h)));
      const th = el('thead'); th.appendChild(tr); table.appendChild(th); table.appendChild(el('tbody'));
      band.appendChild(table); n = 0;
    };
    for (const p of items) {
      if (p.kind === 'session') {
        const cap = el('p', 'qt-cap'); cap.appendChild(el('b', null, (p.name || 'الجلسة') + ': '));
        cap.appendChild(document.createTextNode(p.moderator ? 'ويديرها ' + p.moderator : ''));
        if (p.moderator_title) cap.appendChild(el('small', null, ' — ' + p.moderator_title));
        band.appendChild(cap); table = null; continue;
      }
      if (!table && p.kind !== 'paper') {          // افتتاح/استراحة/ختام خارج الجداول: شريط مستقل
        const row = el('div', 'qc-row qt-bar');
        row.appendChild(el('div', 'qc qc-grad qc-wide', [p.topic || KINDS[p.kind].topic, p.kind === 'opening' && p.name ? '— ' + p.name : ''].filter(Boolean).join(' ')));
        row.appendChild(timeCell(p, 'qc qc-time' + (p.kind === 'discussion' ? '' : ' qc-grad')));
        band.appendChild(row); continue;
      }
      if (!table) newTable();
      const tr = el('tr', 'k-' + p.kind);
      if (p.kind === 'paper') {
        n++; const num = el('td', 'qt-n'); num.appendChild(el('span', null, n)); tr.appendChild(num);
        tr.appendChild(el('td', 'qt-topic', p.topic));
        const c = el('td'); c.appendChild(person(p.name, p.title)); tr.appendChild(c);
        if (hasSpec) tr.appendChild(el('td', 'qt-spec', p.specialty || ''));
      } else {
        const td = el('td', 'qt-span'); td.colSpan = hasSpec ? 4 : 3;
        td.textContent = [p.topic || KINDS[p.kind].topic, p.kind === 'opening' && p.name ? '— ' + p.name : ''].filter(Boolean).join(' ');
        tr.appendChild(td);
      }
      tr.appendChild(timeCell(p, 'qt-time', 'td'));
      table.querySelector('tbody').appendChild(tr);
    }
  }

  // يصغّر المحتوى ليتسع فوق التذييل مهما زاد عدد المشاركين (مثل تصميم المناقشات)
  // يعيد false إذا ما اتسع المحتوى حتى بأصغر تصغير مسموح (فيقلّل المتصل عدد المتحدثين)
  function fitContent(inner, H) {
    inner.style.transform = ''; inner.style.width = ''; inner.style.bottom = 'auto';
    const avail = H - 190;
    let natural = inner.scrollHeight;
    if (natural > avail) {
      // التصغير يوسّع السطر فيقصر المحتوى؛ نكرر القياس مرتين حتى يستقر
      let k = 1;
      for (let i = 0; i < 3 && natural * k > avail; i++) {
        k = Math.max(0.55, Math.min(k, avail / natural));
        inner.style.width = (1080 / k) + 'px';
        inner.style.transformOrigin = 'top left';
        inner.style.transform = `scale(${k})`;
        natural = inner.scrollHeight;
      }
      return natural * k <= avail + 1;
    }
    return true;
  }
  const posterH = () => fmtOf(size).h || Math.ceil($('#poster').scrollHeight);
  function fitStage() {
    const st = $('#stage'), P = $('#poster'), f = fmtOf(size);
    const H = posterH();
    const scale = Math.min(1, (st.clientWidth - 20) / f.w);
    P.style.transform = `scale(${scale})`;
    st.style.height = Math.ceil(H * scale + 20) + 'px';
    $('#sizeBadge').textContent = `${f.name} — ${dims(f.w, f.h ? f.h : H)} بكسل` + (f.h ? '' : ' (الطول حسب عدد البنود)') +
      (f.safe ? ' — الإطار الأحمر هو المنطقة الآمنة الظاهرة على كل الأجهزة (لا يظهر في الصورة)' : '');
  }

  // ---------- التحميل والمشاركة (مثل صفحة المناقشات: مربعات مقاسات، وأكثر من 3 ملفات تنزل في ملف مضغوط) ----------
  const FMTS_KEY = 'qu_sem_fmts';
  const defaultFmts = ['programme'];   // الافتراضي دايماً التصميم الأصلي (برنامج الندوة) — مثل «الإعلان الرسمي» في المناقشات
  {
    const box = $('#exportFormats');
    SFMTS.forEach(f => {
      const lb = el('label', 'fmt'); const cb = el('input'); cb.type = 'checkbox'; cb.value = f.id; cb.checked = defaultFmts.includes(f.id);
      const sp = el('span', null, f.name); sp.appendChild(el('small', null, f.h ? `${f.w}×${f.h}` : 'الطول حسب المحتوى'));
      lb.appendChild(cb); lb.appendChild(sp); box.appendChild(lb);
    });
    box.addEventListener('change', e => {
      try { localStorage.setItem(FMTS_KEY, JSON.stringify($$('#exportFormats input:checked').map(i => i.value))); } catch (err) { /* اختياري */ }
      // حددت مقاساً للتحميل: المعاينة تتحول له (فالمشاركة والنسخ تطلع بنفس المقاس)
      const t = e.target; if (t && t.checked) pickSize(t.value, false);
      else { const first = $('#exportFormats input:checked'); if (first) pickSize(first.value, false); }
    });
    const pf = $('#previewFormats'); pf.textContent = '';
    SFMTS.forEach(f => { const b = el('button', 'chip' + (f.id === size ? ' active' : ''), fmtLabel(f)); b.type = 'button'; b.dataset.size = f.id; pf.appendChild(b); });
  }
  const selectedFormats = () => $$('#exportFormats input:checked').map(i => fmtOf(i.value));

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  async function settle(node) {
    await Promise.all($$('img', node).map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  }
  // يرسم الندوة s بالمقاس f في عنصر مخفي ويصوّره (المعاينة ما تتغير)
  async function capture(s, f, scale) {
    const E = $('#exportPoster');
    renderInto(E, s, f); await settle(E);
    renderInto(E, s, f); await settle(E);    // مرة ثانية بعد تحميل الخطوط: القياس يعتمد على عرض النص الفعلي
    await nextFrame();
    const H = f.h || Math.ceil(E.scrollHeight);
    const ratio = f.w * scale > 6000 ? 1 : scale;
    const canvas = await htmlToImage.toCanvas(E, { width: f.w, height: H, pixelRatio: ratio, cacheBust: true, backgroundColor: '#ffffff',
      filter: n => !(n.classList && n.classList.contains('qs-safe')) });
    return { canvas, H };
  }
  const exScale = () => +($('#exScale').value || 2);
  const safe = (t) => String(t || '').replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  const fileBase = (s, f) => { s = s || current || {}; f = f || fmtOf(size); return `${f.id === 'programme' ? 'برنامج' : 'اعلان'}-${safe(s.title) || 'ندوة'}-${s.date || 'جديدة'}`; };
  function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));
  function busy(on, text, frac) { const o = $('#overlay'); o.classList.toggle('open', !!on); if (text) $('#overlayText').textContent = text; $('#overlayBar').style.width = Math.round((frac || 0) * 100) + '%'; }

  // PDF: صفحة لكل مقاس (A4 بمقاس الورق الحقيقي)
  const pdfPageSize = (f, H) => f.id === 'a4' ? [595.28, 841.89] : [f.w * 0.75, H * 0.75];
  function addPdfPage(doc, canvas, f, H) {
    const [w, h] = pdfPageSize(f, H), o = w > h ? 'landscape' : 'portrait';
    if (!doc) doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: o, compress: true });
    else doc.addPage([w, h], o);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, w, h, undefined, 'FAST');
    return doc;
  }
  // ندوات × مقاسات → ملفات {name, blob}
  async function produce(items, fmts, type, scale) {
    const files = [], total = items.length * fmts.length;
    let done = 0, all = null;
    for (const it of items) {
      let doc = null;
      for (const f of fmts) {
        busy(true, `جارٍ تجهيز ${done + 1} من ${total}: ${it.label} — ${f.name}`, done / total);
        const { canvas, H } = await capture(it.s, f, scale);
        if (type === 'pdf') {
          doc = addPdfPage(doc, canvas, f, H);
          if (items.length > 1) all = addPdfPage(all, canvas, f, H);
        } else {
          const blob = await toBlob(canvas, type === 'jpg' ? 'image/jpeg' : 'image/png', 0.93);
          files.push({ name: `${safe(it.label)}/${safe(f.name)}-${f.w}x${H}.${type}`, blob });
        }
        done++;
      }
      if (doc) files.push({ name: `${fileBase(it.s, fmts[0])}.pdf`, blob: doc.output('blob') });
    }
    if (all) files.push({ name: 'جميع-الإعلانات.pdf', blob: all.output('blob') });
    busy(true, null, 1);
    return files;
  }
  async function deliver(files, zipName) {
    // ملفات قليلة تنزل منفصلة، والكثيرة في ملف مضغوط (مثل المناقشات)
    if (files.length <= 3) {
      for (const f of files) { saveBlob(f.blob, f.name.replace(/\//g, '-')); await new Promise(r => setTimeout(r, 450)); }
      return;
    }
    const zip = new JSZip();
    files.forEach(f => zip.file(f.name, f.blob));
    saveBlob(await zip.generateAsync({ type: 'blob' }), zipName);
  }
  async function runExport(items, zipName) {
    const fmts = selectedFormats();
    if (!fmts.length) { $('#exportFormats').scrollIntoView({ behavior: 'smooth', block: 'center' }); return toast('اختر مقاساً واحداً على الأقل', true); }
    if (!items.length) return toast('لا توجد تصاميم للتحميل', true);
    busy(true, 'جارٍ التجهيز...');
    try {
      const files = await produce(items, fmts, $('#exType').value, exScale());
      await deliver(files, zipName);
      toast(`تم تجهيز ${files.length} ملف ✓`);
    } catch (e) { console.error(e); toast('حدث خطأ أثناء التحميل: ' + (e.message || e), true); }
    finally { busy(false); }
  }
  function downloadCurrent() {
    const s = clean(current || blank());
    runExport([{ label: s.title || 'ندوة', s }], `${safe(s.title) || 'ندوة'}.zip`);
  }
  function downloadSelected() {
    const items = merged().filter(s => gridSel.has(s.id)).map(s => ({ label: `${s.date || 'بدون-تاريخ'}-${s.title || 'ندوة'}`, s: clean(s) }));
    if (!items.length) { $('#dataSheet').scrollIntoView({ behavior: 'smooth' }); return toast('حدد الندوات من مربعات الجدول أولاً', true); }
    runExport(items, `اعلانات-الندوات-${todayIso()}.zip`);
  }
  // الطباعة والمشاركة والنسخ والعرض: بالمقاس المعروض في «المعاينة»
  const captureShown = (scale) => capture(clean(current || blank()), fmtOf(size), scale);
  async function printCurrent() {
    const w = window.open('', '_blank'); if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة', true);
    try {
      const { canvas } = await captureShown(2);
      const doc = w.document; doc.title = fileBase();
      const img = doc.createElement('img'); img.src = canvas.toDataURL('image/png'); img.style.cssText = 'width:100%;display:block';
      doc.body.style.margin = '0'; doc.body.appendChild(img);
      img.onload = () => { w.focus(); w.print(); };
    } catch (e) { w.close(); toast('تعذر تجهيز الطباعة', true); }
  }
  async function shareImage() {
    try {
      const { canvas } = await captureShown(2);
      const file = new File([await toBlob(canvas, 'image/jpeg', 0.92)], fileBase() + '.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      saveBlob(file, file.name); toast('المشاركة غير مدعومة في هذا المتصفح — حُمّلت الصورة');
    } catch (e) { if (e.name !== 'AbortError') toast('تعذرت المشاركة', true); }
  }
  async function copyImage() {
    try { const { canvas } = await captureShown(2); await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toBlob(canvas, 'image/png') })]); toast('نُسخت الصورة ✓ — الصقها في المحادثة (Ctrl+V)'); }
    catch (e) { toast('المتصفح منع نسخ الصورة — استعمل «تحميل»', true); }
  }
  async function zoom() {
    try { busy(true, 'جارٍ التجهيز...'); const { canvas } = await captureShown(1); $('#zoomImg').src = canvas.toDataURL('image/png'); $('#mZoom').classList.add('open'); }
    catch (e) { toast('تعذر العرض', true); } finally { busy(false); }
  }

  // ---------- رسائل واتساب: الدعوة والتسجيل (مثل المناقشات) ----------
  // رسالة الدعوة = نص الإعلان؛ رسالة التسجيل بنفس صيغة المناقشات
  function shareText(src) {
    const s = clean(src || current || blank());
    const lines = [`تقيم ${s.organizer || 'كلية الشريعة'}${s.department ? ' ممثلة ب' + s.department : ''} ${s.series || 'ندوة'} بعنوان:`, quoted(s.title)];
    if (s.subtitle) lines.push(s.subtitle);
    if (STATUS_AR[s.status]) lines.push(`(${STATUS_AR[s.status]})`);
    const sp = speakersOf(s);
    if (sp.length) { lines.push('', 'المتحدثون:'); sp.forEach(p => lines.push(`• ${p.name}${p.topic ? ' — ' + p.topic : ''}${p.start ? ' (' + t12(p.start) + ')' : ''}`)); }
    lines.push('');
    if (s.date) lines.push(`📅 ${weekday(s.date)} ${hijri(s.date)} الموافق ${gdate(s.date)}`);
    const tm = [t12(s.start), t12(s.end)].filter(Boolean).join(' – '); if (tm) lines.push(`⏰ ${tm}`);
    const pl = [s.place, s.place_note].filter(Boolean).join(' '); if (pl) lines.push(`📍 ${pl}`);
    if (s.link) lines.push(`🔗 البث المباشر: ${s.link}`);
    if (s.public_note) lines.push(s.public_note);
    return lines.join('\n');
  }
  // تسجيل من عدة أجزاء (روابط مفصولة بـ | ) → «الجزء 1: ...» كل جزء في سطر
  function recLinks(v) {
    const urls = String(v || '').split(/\s*\|\s*|\s+(?=https?:)/).map(x => x.trim()).filter(Boolean);
    return urls.length > 1 ? urls.map((u, i) => `الجزء ${i + 1}:\n${u}`).join('\n\n') : (urls[0] || '');
  }
  function recordText(src) {
    const s = clean(src || current || blank());
    const when = s.date ? `، يوم ${weekday(s.date)} ${hijri(s.date)}` : '';
    return `السلام عليكم ورحمة الله\nمرفق لكم تسجيل ${s.series || 'ندوة'}: ${quoted(s.title)}${when}\n\n${recLinks(s.recording_link)}\n\nولكم خالص الشكر`;
  }
  const buildMsg = (kind, s) => kind === 'record' ? recordText(s) : shareText(s);
  // صورة التسجيل: الباركود يفتح رابط التسجيل (أول جزء) والعبارة «شاهد التسجيل»
  function recState(s) { const u = String(s.recording_link || '').split(/\s*\|\s*|\s+(?=https?:)/).map(x => x.trim()).find(x => /^https?:/i.test(x));
    return u ? { ...s, link: u, _rec: true } : s; }
  const hasRec = (s) => !!String((s && s.recording_link) || '').trim();
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px'; document.body.appendChild(ta);
      ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (er) { ok = false; } ta.remove(); return ok;
    }
  }
  async function copyMsg(kind, s) {
    if (kind === 'record' && !hasRec(s)) return toast('أضف «رابط التسجيل» أولاً (بعد انتهاء الندوة)', true);
    if (await copyText(buildMsg(kind, s))) toast(kind === 'invite' ? '✓ تم نسخ رسالة الدعوة — الصقها في واتساب' : '✓ تم نسخ رسالة التسجيل — الصقها في واتساب');
    else toast('تعذر النسخ — استعمل زر «💬 واتساب» وانسخ الرسالة من النافذة', true);
  }
  function openCaption() {
    const tags = '\n\n#جامعة_القصيم #كلية_الشريعة';
    const fill = () => { $('#captionText').value = shareText() + ($('#capTags').checked ? tags : ''); links(); };
    const links = () => { const t = $('#captionText').value; $('#capWa').href = 'https://wa.me/?text=' + encodeURIComponent(t); $('#capX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t); };
    $('#capTags').onchange = fill; $('#captionText').oninput = links; $('#capCopy').onclick = () => copyText($('#captionText').value).then(ok => toast(ok ? '✓ تم نسخ النص' : 'تعذر النسخ', !ok));
    fill(); $('#mCaption').classList.add('open');
  }

  // ---------- إرسال بالواتساب: صورة برنامج الندوة كاملة + نص الرسالة ----------
  // الجوال/الآيباد: مشاركة مباشرة. الكمبيوتر: واتساب ويب + نسخ الصورة. (نفس سلوك المناقشات)
  const SEND = { s: null, kind: 'invite', blob: null, file: null };
  const SEND_FMT = SFMTS[0];   // مثل المناقشات: تُرسل الصورة الأساسية الكاملة (برنامج الندوة)
  const canShareFiles = () => { try { return matchMedia('(pointer: coarse)').matches && !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.jpg', { type: 'image/jpeg' })] })); } catch (e) { return false; } };
  // «دعوة» = صورة الحالة (ستوري)، «تسجيل» = صورة اليوتيوب — ثابت مهما كان المقاس المختار
  const sendFmt = kind => SFMTS.find(f => f.id === (kind === 'record' ? 'youtube' : 'story')) || SEND_FMT;
  async function sendImage(s, kind) { const { canvas } = await capture(kind === 'record' ? recState(s) : s, sendFmt(kind), 2); return toBlob(canvas, 'image/jpeg', 0.93); }
  function sendSetKind(kind) {
    SEND.kind = kind;
    $$('[data-send]').forEach(b => b.classList.toggle('active', b.dataset.send === kind));
    const missing = kind === 'record' && !hasRec(SEND.s);
    $('#sendWarn').hidden = !missing;
    $('#sendWarn').textContent = missing ? '⚠️ ما فيه رابط تسجيل. أضفه في خانة «رابط التسجيل» (أو في عمود السطر بالجدول) ثم ارجع هنا.' : '';
    $('#sendText').value = missing ? '' : buildMsg(kind, SEND.s);
  }
  async function openSend(s, kind, readyBlob) {
    SEND.s = clean(s); SEND.blob = null; SEND.file = null;
    sendSetKind(kind || (hasRec(SEND.s) ? 'record' : 'invite'));
    const img = $('#sendImg'); img.removeAttribute('src'); $('#sendImgNote').textContent = 'جارٍ تجهيز الصورة...';
    const mobile = canShareFiles();
    $('#sendShare').hidden = !mobile; $('#sendWeb').hidden = mobile;
    $('#sendHint').textContent = mobile
      ? 'اضغط «إرسال للواتساب» واختر واتساب ثم المحادثة. إذا ما ظهر النص مع الصورة، الصقه (منسوخ تلقائياً).'
      : 'في الكمبيوتر: يفتح واتساب ويب بالرسالة، والصورة تنسخ تلقائياً — الصقها في المحادثة (Ctrl+V).';
    $('#mSend').classList.add('open');
    await sendBuildImg(readyBlob);
  }
  let sendTok = 0;
  async function sendBuildImg(readyBlob) {
    const s = SEND.s, kind = SEND.kind, tok = ++sendTok, img = $('#sendImg');
    SEND.blob = null; SEND.file = null; img.removeAttribute('src');
    $('#sendImgNote').textContent = kind === 'record' ? 'جارٍ تجهيز صورة اليوتيوب...' : 'جارٍ تجهيز صورة الحالة...';
    try {
      const blob = readyBlob || await sendImage(s, kind);
      if (tok !== sendTok) return;
      SEND.blob = blob; SEND.file = new File([blob], `${fileBase(s, sendFmt(kind))}.jpg`, { type: 'image/jpeg' });
      if (img._url) URL.revokeObjectURL(img._url);
      img._url = URL.createObjectURL(blob); img.src = img._url;
      $('#sendImgNote').textContent = kind === 'record' ? 'صورة اليوتيوب (للتسجيل) — جاهزة ✓' : 'صورة الحالة (للدعوة) — جاهزة ✓';
    } catch (e) { if (tok === sendTok) $('#sendImgNote').textContent = 'تعذّر تجهيز الصورة'; }
  }
  $$('[data-send]').forEach(b => b.onclick = () => { const was = SEND.kind; sendSetKind(b.dataset.send); if (SEND.kind !== was && SEND.s) sendBuildImg(); });
  const sendReady = () => {
    if (!$('#sendText').value.trim()) { toast(SEND.kind === 'record' ? 'أضف رابط التسجيل أولاً' : 'الرسالة فاضية', true); return false; }
    if (!SEND.file) { toast('لحظة... الصورة تتجهز', true); return false; }
    return true;
  };
  $('#sendShare').onclick = async () => {
    if (!sendReady()) return;
    const text = $('#sendText').value;
    copyText(text);   // احتياط: بعض نسخ واتساب تتجاهل النص المرفق مع الصورة
    try { await navigator.share({ files: [SEND.file], text }); $('#mSend').classList.remove('open'); }
    catch (e) { if (e.name !== 'AbortError') toast('تعذّر فتح المشاركة — جرّب مرة ثانية أو حمّل الصورة', true); }
  };
  $('#sendWeb').onclick = async () => {
    if (!sendReady()) return;
    const text = $('#sendText').value;
    const w = window.open('about:blank', '_blank');   // نفتح النافذة فوراً حتى لا يمنعها المتصفح
    let copied = false;
    try { await navigator.clipboard.write([new ClipboardItem({ [SEND.blob.type]: SEND.blob })]); copied = true; }
    catch (e) {
      try {
        const png = await new Promise(r => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(r, 'image/png'); }; im.src = $('#sendImg').src; });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); copied = true;
      } catch (er) { copied = false; }
    }
    const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    if (w) w.location.href = url; else location.href = url;
    toast(copied ? '✓ الصورة منسوخة — اختر المحادثة والصقها (Ctrl+V) ثم أرسل' : 'افتح المحادثة وأرفق الصورة من «تحميل الصورة»', !copied);
  };
  $('#sendCopy').onclick = async () => { if (await copyText($('#sendText').value)) toast('✓ تم نسخ الرسالة'); };
  $('#sendDl').onclick = () => { if (SEND.blob) saveBlob(SEND.blob, SEND.file.name); };
  // إرسال مباشر: في الجوال/الآيباد يفتح المشاركة فوراً، وإذا طلب الجهاز ضغطة إضافية تظهر نافذة جاهزة
  // «تسجيل»: أول شي تنزل صورة التسجيل على الجهاز، بعدها واتساب كما هو (sendDirect بدون أي تغيير)
  async function saveRecordImage(src) {
    const s = clean(src || blank()); if (!hasRec(s)) return;      // بدون رابط تسجيل: sendDirect نفسه ينبّه
    busy(true, 'جارٍ تحميل صورة التسجيل على الجهاز...');
    try { const blob = await sendImage(s, 'record'); saveBlob(blob, `${fileBase(s, sendFmt('record'))}-تسجيل.jpg`); }
    catch (e) { /* تعذّر التحميل: نكمل للواتساب عادي */ } finally { busy(false); }
  }
  async function sendDirect(src, kind) {
    const s = clean(src || blank());
    if (kind === 'record' && !hasRec(s)) return toast('أضف «رابط التسجيل» أولاً (بعد انتهاء الندوة)', true);
    if (!canShareFiles()) return openSend(s, kind);   // الكمبيوتر: نافذة واتساب ويب
    const text = buildMsg(kind, s);
    busy(true, 'جارٍ تجهيز الصورة للواتساب...');
    let blob;
    try { blob = await sendImage(s, kind); } catch (e) { busy(false); return toast('تعذّر تجهيز الصورة', true); }
    busy(false);
    const file = new File([blob], `${fileBase(s, sendFmt(kind))}.jpg`, { type: 'image/jpeg' });
    copyText(text);
    try { await navigator.share({ files: [file], text }); }
    catch (e) {
      if (e.name === 'AbortError') return;
      await openSend(s, kind, blob);   // الجهاز يحتاج ضغطة جديدة: النافذة جاهزة بزر «إرسال»
      toast('جاهز ✓ — اضغط «إرسال للواتساب»');
    }
  }

  // جدول ← Excel / CSV
  function sheetRows() {
    return merged().map(s => ({ 'التاريخ': s.date, 'اليوم': weekday(s.date), 'الهجري': hijri(s.date), 'من': s.start, 'إلى': s.end, 'العنوان': s.title, 'العنوان الفرعي': s.subtitle,
      'النوع': s.series, 'القسم': s.department, 'الجهة': s.organizer, 'المكان': s.place, 'ملاحظة المكان': s.place_note, 'الحالة': STATUS_AR[s.status] || 'مؤكدة',
      'رابط البث': s.link, 'المتحدثون': speakersOf(s).map(p => p.name).join('، '), 'منشورة': local.items[s.id] ? 'لا' : 'نعم' }));
  }
  function exportSheet(csv) {
    const rows = sheetRows(); if (!rows.length) return toast('الجدول فاضي', true);
    const ws = XLSX.utils.json_to_sheet(rows); ws['!rtl'] = true;
    if (csv) { saveBlob(new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' }), `الندوات-${todayIso()}.csv`); return; }
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, 'الندوات');
    XLSX.writeFile(wb, `الندوات-${todayIso()}.xlsx`);
  }
  // ---------- إعداد النشر ----------
  function openSetup() { $('#repoName').textContent = `${REPO.owner}/${REPO.repo}`; $('#tok').value = token(); $('#branch').value = branch(); $('#setupErr').textContent = ''; $('#mSetup').classList.add('open'); }
  $('#saveTok').onclick = async () => {
    const t = $('#tok').value.trim(), br = $('#branch').value.trim() || 'gh-pages';
    $('#setupErr').textContent = '…جارٍ الاختبار';
    try {
      const r = await fetch(api(`branches/${encodeURIComponent(br)}`), { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } });
      if (r.status === 401) throw new Error('الرمز غير صالح');
      if (r.status === 404) throw new Error('الفرع غير موجود أو الرمز لا يصل لهذا المستودع');
      if (!r.ok) throw new Error('تعذر الاتصال بـ GitHub (' + r.status + ')');
      localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(BRANCH_KEY, br);
      $('#mSetup').classList.remove('open'); toast('أُعدّ النشر على هذا الجهاز ✓'); refreshPublished();
    } catch (e) { $('#setupErr').textContent = e.message; }
  };
  $('#clearTok').onclick = () => { localStorage.removeItem(TOKEN_KEY); $('#tok').value = ''; toast('حُذف الرمز من هذا الجهاز'); };
  $$('[data-close]').forEach(b => b.onclick = () => b.closest('.modal').classList.remove('open'));

  // ---------- ربط ----------
  $('#who').textContent = `مرحباً، ${session.name || session.u}`;
  if ((session.role === 'admin' || session.role === 'super') && !CLOUD()) $('#btnSetup').hidden = false;      // على Netlify لا حاجة لإعداد النشر
  if (CLOUD()) $('#btnPublish').hidden = true;                                    // الحفظ = النشر
  $('#btnSetup').onclick = openSetup;
  $('#btnLogout').onclick = () => QAuth.logout();
  $('#btnHelp').onclick = () => $('#mHelp').classList.add('open');
  $('#btnSheet').onclick = () => $('#dataSheet').scrollIntoView({ behavior: 'smooth', block: 'start' });
  // التبويبات
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === b.dataset.tab));
  });
  const newSem = () => { openSem(blank()); $$('.tabs button')[0].click(); $('#f_title').focus(); };
  $('#btnNew').onclick = newSem;
  $('#gAdd').onclick = () => { newSem(); $('.side').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('#btnDup').onclick = () => current && duplicate(current);
  $('#btnDelete').onclick = del;
  $('#btnPublish').onclick = publish;
  $$('[data-add]').forEach(b => b.onclick = () => {
    const kind = b.dataset.add, p = { kind };
    if (kind === 'session') p.name = SESSION_NAMES[Math.min($$('#parts .k-session').length, SESSION_NAMES.length - 1)];
    const r = partRow(p); $('#parts').appendChild(r); r.scrollIntoView({ block: 'nearest' }); (r.querySelector('input') || r).focus(); readForm(true);
  });
  { const dl = el('datalist'); dl.id = 'sessNames'; SESSION_NAMES.forEach(n => { const o = el('option'); o.value = n; dl.appendChild(o); }); document.body.appendChild(dl); }
  $$('[data-k]').forEach(i => i.addEventListener('input', () => { if (i.dataset.k === 'series') syncSeriesChips(); readForm(true); }));
  $$('#seriesChips .chip').forEach(b => b.onclick = () => { $('#f_series').value = b.dataset.series; syncSeriesChips(); readForm(true); });
  // رابط البث / QR
  $('#qrOn').onchange = () => {
    $('#linkRow').hidden = !$('#qrOn').checked;
    if ($('#qrOn').checked && !$('#f_link').value) $('#f_link').value = YT;
    if (!$('#qrOn').checked) $('#f_link').value = '';
    readForm(true);
  };
  $('#linkDefault').onclick = () => { $('#f_link').value = YT; readForm(true); };
  // المعاينة
  // من «المعاينة»: يصير هو المقاس المحدد للتحميل (تقدر تضيف غيره من قسم التحميل)
  function pickSize(id, syncExport) {
    const b = $(`#previewFormats [data-size="${id}"]`); if (!b) return;
    $$('#previewFormats [data-size]').forEach(x => x.classList.toggle('active', x === b)); size = id;
    if (syncExport) { $$('#exportFormats input').forEach(i => { i.checked = i.value === id; }); try { localStorage.setItem(FMTS_KEY, JSON.stringify([id])); } catch (e) { /* اختياري */ } }
    renderPoster();
  }
  $$('#previewFormats [data-size]').forEach(b => b.onclick = () => pickSize(b.dataset.size, true));
  $('#stage').onclick = zoom;
  // التحميل والمشاركة
  $('#exCurrent').onclick = downloadCurrent;
  $('#exRows').onclick = downloadSelected;
  $('#gDl').onclick = downloadSelected;
  $('#printBtn').onclick = printCurrent;
  $('#shareBtn').onclick = shareImage;
  $('#copyImgBtn').onclick = copyImage;
  $('#captionBtn').onclick = openCaption;
  $('#zoomBtn').onclick = zoom;
  $('#btnWa').onclick = () => sendDirect(current, 'invite');
  $('#waInvite').onclick = () => sendDirect(current, 'invite');
  $('#waRecord').onclick = async () => { await saveRecordImage(current); sendDirect(current, 'record'); };
  $('#copyInvite').onclick = () => copyMsg('invite', current);
  $('#copyRecord').onclick = () => { copyMsg('record', current); if (!hasRec(current)) $('#f_rec').focus(); };
  // الجدول
  $('#search').addEventListener('input', renderGrid);
  // المتصفح أحياناً يحفظ اسم الدخول ويكتبه في خانة البحث فيختفي الجدول: تُفرَّغ إذا لم يكتب فيها المستخدم
  setTimeout(() => { const s = $('#search'); if (s && s.value && document.activeElement !== s) { s.value = ''; renderGrid(); } }, 800);
  $('#gSort').onclick = () => { sortAsc = !sortAsc; renderGrid(); toast(sortAsc ? 'الترتيب: الأقدم أولاً' : 'الترتيب: الأحدث أولاً'); };
  $('#gDel').onclick = delSelected;
  $('#gSelAll').onclick = () => { rowsView.forEach(s => gridSel.add(s.id)); renderGrid(); };
  $('#gSelNone').onclick = () => { gridSel.clear(); renderGrid(); };
  $('#gExport').onclick = () => exportSheet(false);
  $('#gExportCsv').onclick = () => exportSheet(true);
  $('#gConflicts').onclick = () => { const r = $('#sheet tr.conflict'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  // تنقل الجوال
  $$('.mnav [data-go]').forEach(b => b.onclick = () => { const t = b.dataset.go === 'side' ? $('.side') : $('#' + b.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  window.addEventListener('resize', fitStage);
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  window.addEventListener('beforeunload', e => { if (pendingCount() && token()) { e.preventDefault(); e.returnValue = ''; } });

  // اقتراح أسماء أعضاء هيئة التدريس (assets/js/people.js): الاسم ← الصفة، ومدير الجلسة ← صفته
  if (window.QPeople) {
    QPeople.bind(inp => {
      const pr = inp.closest && inp.closest('.prog tr.pi');
      if (pr) {
        if (inp.dataset.p === 'name' && pr.dataset.kind !== 'session') return { title: pr.querySelector('[data-p="title"]') };
        if (inp.dataset.p === 'moderator') return { title: pr.querySelector('[data-p="moderator_title"]') };
        return null;
      }
      const li = inp.closest && inp.closest('li.pitem'); if (!li) return null;
      if (inp.dataset.p === 'name' && li.dataset.kind !== 'session') return { title: li.querySelector('[data-p="title"]') };
      if (inp.dataset.p === 'moderator') return { title: li.querySelector('[data-p="moderator_title"]') };
      return null;
    });
  }
  openSem(blank());
  // تحديث مباشر: ندوات الزملاء تظهر بدون إعادة تحميل (كل 20 ثانية، وما يقاطع الكتابة)
  if (CLOUD()) setInterval(async () => {
    if (document.hidden || pubBusy || pendingCount()) return;
    const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    const before = JSON.stringify(published.seminars);
    try { const { data } = await fetchPublished(); published = { v: data.v || '', seminars: (data.seminars || []).map(clean) }; } catch (e) { return; }
    if (JSON.stringify(published.seminars) === before) return;
    const fresh = current && published.seminars.find(x => x.id === current.id);
    if (current && !fresh && merged().every(x => x.id !== current.id) && (current.title || current.date)) { renderList(); renderPub(); return; }
    if (fresh) openSem(fresh, false); else { renderList(); renderPub(); }
  }, 20000);
  // أول ما تفتح الصفحة: أقرب ندوة جاية (أو آخر ندوة) بدل إعلان فاضي — مثل المناقشات اللي تفتح على تصميم مليان
  refreshPublished().then(() => {
    const c = clean(current || blank()); if (c.title || c.date || c.participants.length) return;   // الموظف بدأ يكتب: لا نغيّر عليه
    const all = merged().filter(x => x.date && x.status !== 'cancelled'); if (!all.length) return;
    const t = todayIso(), key = x => x.date + ' ' + (x.start || '');
    const up = all.filter(x => x.date >= t).sort((a, b) => key(a).localeCompare(key(b)));
    openSem(up[0] || all.sort((a, b) => key(b).localeCompare(key(a)))[0]);
  });
  // «📅 مشاركة صور الأسبوع» (assets/js/week.js): ندوات هذا القسم فقط، ببرنامج الندوة (تصميمها الأصلي)
  if (window.QWeek) QWeek({
    button: $('#btnWeek'), noun: 'ندوة', heading: 'كل ندوة ببرنامجها (التصميم الأصلي)',
    ui: { toast, busy: m => busy(true, m), done: () => busy(false) },
    list: (start, end) => {
      const iso = d => d.toISOString().slice(0, 10), a = iso(start), b = iso(end);
      return merged().filter(x => x && x.date && x.date >= a && x.date <= b && x.status !== 'cancelled' && x.status !== 'postponed').map(x => {
        const [y, m, d] = x.date.split('-').map(Number), t = Date.UTC(y, m - 1, d), h = String(x.start || '00:00').split(':').map(Number);
        return { id: x.id, t, order: (h[0] || 0) * 100 + (h[1] || 0), title: x.title || 'ندوة', sub: x.organizer || '',
          line: `${hijri(x.date)} · ${x.start || ''}${x.end ? '–' + x.end : ''}` };
      });
    },
    blob: async x => { const s = merged().find(y => y.id === x.id); const { canvas } = await capture(clean(s), fmtOf('programme'), 2); return toBlob(canvas, 'image/png'); },
    name: x => { const t = String(x.title || 'ندوة').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80); return `${/^ندوة/.test(t) ? '' : 'ندوة-'}${t}.png`; },
  });
  // «📋 إرسال الندوات الأسبوعية للتدقيق»: نفس رسالة المناقشات، للندوات (كل قسم لحاله)
  if (window.QReview) QReview({
    button: $('#btnReview'), plural: 'ندوات', ui: { toast },
    list: (start, end) => {
      const iso = d => d.toISOString().slice(0, 10), a = iso(start), b = iso(end);
      const hmd = d => { try { const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(d + 'T12:00:00Z'));
        return `${+p.find(x => x.type === 'month').value}/${+p.find(x => x.type === 'day').value}`; } catch (e) { return ''; } };
      const tm = hm => { const s = t12(hm); return s.replace(/\s*صباحاً$/, ' ص').replace(/\s*(مساءً|ظهراً)$/, ' م'); };
      return merged().filter(x => x && x.date && x.date >= a && x.date <= b && x.status !== 'cancelled' && x.status !== 'postponed').map(x => {
        const [y, m, d] = x.date.split('-').map(Number), h = String(x.start || '00:00').split(':').map(Number);
        const remote = /عن\s*بعد|اونلاين|أونلاين|افتراضي|بلاك\s*بورد|blackboard|zoom|زوم|تيمز/i.test(x.place || '');
        return { t: Date.UTC(y, m - 1, d), order: (h[0] || 0) * 100 + (h[1] || 0),
          lines: [[x.series || 'ندوة', x.department].filter(Boolean).join(' - '), `${x.title || 'ندوة'} - ${weekday(x.date)}`,
            `${hmd(x.date)} س ${tm(x.start)} ${remote ? 'عن بعد' : 'حضوري'}`.replace(/\s+/g, ' ').trim()] };
      });
    },
  });
})();
