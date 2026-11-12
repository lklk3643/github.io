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
  const SESSION_NAMES = ['الجلسة الأولى', 'الجلسة الثانية', 'الجلسة الثالثة', 'الجلسة الرابعة'];
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
  function loadLocal() { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (v && v.items) return { items: v.items, deleted: v.deleted || [] }; } catch (e) { /* تالف */ } return { items: {}, deleted: [] }; }
  function saveLocal() { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); }
  const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hijri = (iso) => { if (!iso) return ''; try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')).replace(/[‎‏]/g, '').replace(/\s*هـ$/, '') + ' هـ'; } catch (e) { return ''; } };
  const weekday = (iso) => iso ? new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')) : '';
  const gdate = (iso) => iso ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')) : '';
  function t12(hm) { if (!/^\d{1,2}:\d{2}$/.test(hm || '')) return ''; let [h, m] = hm.split(':').map(Number); const s = h < 12 ? 'صباحاً' : (h < 15 && h >= 12 ? 'ظهراً' : 'مساءً'); h = h % 12 || 12; return (m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`) + ' ' + s; }
  const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  const blank = () => ({ id: newId(), title: '', subtitle: '', organizer: 'كلية الشريعة', date: '', start: '', end: '', place: 'قاعة ابن عثيمين', place_note: '(والبث عبر الإنترنت)', link: '', status: 'confirmed', notes: '', participants: [],
    series: '', department: '', public_note: '', poster_header: 'simple', programme_layout: 'cells' });
  const clean = (s) => ({ id: String(s.id), title: String(s.title || '').trim(), subtitle: String(s.subtitle || '').trim(), organizer: String(s.organizer || '').trim(),
    date: String(s.date || ''), start: String(s.start || ''), end: String(s.end || ''), place: String(s.place || '').trim(), place_note: String(s.place_note || '').trim(),
    link: String(s.link || '').trim(), status: ['confirmed', 'postponed', 'cancelled'].includes(s.status) ? s.status : 'confirmed', notes: String(s.notes || '').trim(),
    series: String(s.series || '').trim(), department: String(s.department || '').trim(), public_note: String(s.public_note || '').trim(),
    poster_header: s.poster_header === 'official' ? 'official' : 'simple', programme_layout: s.programme_layout === 'table' ? 'table' : 'cells',
    participants: (s.participants || []).map(p => {
      const kind = KINDS[p.kind] ? p.kind : 'paper';
      const o = { kind, name: String(p.name || '').trim(), title: String(p.title || '').trim(), role: String(p.role || KINDS[kind].role || '').trim(),
        topic: String(p.topic || '').trim(), start: String(p.start || ''), end: String(p.end || '') };
      if (p.specialty) o.specialty = String(p.specialty).trim();
      if (kind === 'session') { o.moderator = String(p.moderator || '').trim(); o.moderator_title = String(p.moderator_title || '').trim(); }
      return o;
    }).filter(p => p.name || p.topic || p.moderator), updated: s.updated || '' });

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

  async function fetchPublished() {
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

  async function publish() {
    if (!pendingCount()) return toast('لا توجد تعديلات جديدة للنشر');
    if (!token()) {
      if (session.role === 'admin') { openSetup(); return toast('أعدّ النشر مرة واحدة على هذا الجهاز', true); }
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
    if (n) { s.className = 'pending'; s.textContent = `تعديلات غير منشورة على هذا الجهاز: ${n}`; }
    else { s.className = 'ok'; s.textContent = 'كل الندوات منشورة ✓'; }
    $('#btnPublish').disabled = !n;
  }

  // ---------- جدول بيانات الندوات (مثل جدول المناقشات: كل سطر = ندوة، يُعدَّل مباشرة وينحفظ تلقائياً) ----------
  const YT = 'https://www.youtube.com/@src.sds1';
  const GCOLS = [   // [المفتاح, العنوان, نوع الخانة, صنف العرض]
    ['date', 'التاريخ', 'date', 'w-sm'], ['start', 'من', 'time', 'w-sm'], ['end', 'إلى', 'time', 'w-sm'],
    ['title', 'عنوان الندوة', 'text', 'w-title'], ['series', 'النوع', 'text', ''], ['department', 'القسم', 'text', ''],
    ['place', 'المكان', 'text', ''], ['status', 'الحالة', 'status', 'w-sm'], ['link', 'رابط البث', 'url', 'w-link']];
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
  function renderGrid() {
    const q = $('#search').value.trim();
    const all = merged();
    rowsView = all.filter(s => !q || s.title.includes(q) || s.participants.some(p => (p.name || '').includes(q)));
    const T = $('#sheet'); T.textContent = '';
    const thead = el('thead'), hr = el('tr');
    hr.appendChild(el('th', 'n', '#')); hr.appendChild(el('th', 'act', 'عرض / نسخ'));
    GCOLS.forEach(c => hr.appendChild(el('th', null, c[1]))); hr.appendChild(el('th', null, 'المتحدثون'));
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
      ab('⧉', 'تكرار السطر لندوة مشابهة', () => duplicate(s));
      ab('💬', 'إرسال بالواتساب', async () => { openSem(s); openSend(); }, 'wa-i');
      tr.appendChild(act);
      GCOLS.forEach(([k, , type, cls]) => {
        const td = el('td'); let inp;
        if (type === 'status') { inp = el('select'); [['confirmed', 'مؤكدة'], ['postponed', 'مؤجلة'], ['cancelled', 'ملغاة']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; inp.appendChild(o); }); }
        else { inp = el('input'); inp.type = type === 'url' ? 'url' : type; if (type === 'url') { inp.dir = 'ltr'; inp.placeholder = 'بدون رابط'; } }
        if (cls) inp.className = cls;
        if (type === 'text') inp.type = 'text';
        inp.value = s[k] || (k === 'status' ? 'confirmed' : '');
        inp.addEventListener('change', () => {
          const item = clean(local.items[s.id] || s); item[k] = inp.value; item.updated = new Date().toISOString();
          local.items[item.id] = item; local.deleted = local.deleted.filter(x => x !== item.id); saveLocal();
          if (current && current.id === item.id) openSem(item, true); else renderGrid();
          renderPub(); flagSaved();
        });
        td.appendChild(inp); tr.appendChild(td);
      });
      const sp = speakersOf(s);
      tr.appendChild(el('td', null, sp.length ? `${sp.length} — ${sp.slice(0, 2).map(p => p.name).join('، ')}${sp.length > 2 ? '…' : ''}` : '—'));
      tb.appendChild(tr);
    });
    if (!rowsView.length) { const tr = el('tr'); const td = el('td', null, q ? 'لا نتائج للبحث' : 'لا توجد ندوات بعد. اضغط «➕ ندوة».'); td.colSpan = GCOLS.length + 3; tr.appendChild(td); tb.appendChild(tr); }
    T.appendChild(tb);
    $('#gridCount').textContent = `(${all.length})`;
    const b = $('#gConflicts'); b.hidden = !nConf; b.textContent = `🔴 ${nConf} سطر فيه تعارض`;
    updSel();
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
    const li = el('li', 'pitem k-' + kind); li.dataset.kind = kind;
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
    li.addEventListener('input', () => readForm(true));
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
    current.participants = $$('#parts .pitem').map(r => ({ kind: r.dataset.kind, role: KINDS[r.dataset.kind].role,
      ...Object.fromEntries($$('[data-p]', r).map(i => [i.dataset.p, i.value])) }));
    updateHijri(); renderPoster();
    if (save) autosave();
  }
  function updateHijri() { const d = $('#f_date').value; $('#hijri').textContent = d ? `${weekday(d)} — ${hijri(d)} — ${gdate(d)}` : ''; }
  let saveT = 0;
  function autosave() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const s = clean(current);
      const empty = !s.title && !s.subtitle && !s.date && !s.start && !s.participants.length && !s.notes;
      if (empty && !local.items[s.id] && !published.seminars.some(x => x.id === s.id)) return;   // ندوة جديدة فاضية: لا تُحفظ
      s.updated = new Date().toISOString();
      local.items[s.id] = s; local.deleted = local.deleted.filter(x => x !== s.id); saveLocal();
      current = s;
      $('#btnDelete').hidden = false; $('#btnDup').hidden = false;
      $('#editingLabel').textContent = `تعدّل: ${s.title || 'ندوة بلا عنوان'}`;
      renderGrid(); renderPub(); flagSaved(); formConflict();
    }, 350);
  }
  function flagSaved() { $('#savedFlag').classList.add('show'); $('#savedFlag').textContent = token() ? '✓ محفوظة على هذا الجهاز — «نشر الندوات» لتظهر للجميع' : '✓ محفوظة على هذا الجهاز'; }
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
    saveLocal(); openSem(blank()); renderPub(); toast('حُذفت — اضغط «نشر الندوات» لتطبيق الحذف على الجميع');
  }
  function delSelected() {
    if (!gridSel.size) return toast('حدد الأسطر أولاً من مربعات الجدول', true);
    if (!confirm(`حذف ${gridSel.size} ندوة؟ تُحذف من الجميع بعد النشر.`)) return;
    gridSel.forEach(id => { delete local.items[id]; if (published.seminars.some(x => x.id === id) && !local.deleted.includes(id)) local.deleted.push(id); });
    if (current && gridSel.has(current.id)) current = blank();
    gridSel.clear(); saveLocal(); openSem(current || blank()); renderPub(); toast('حُذفت — اضغط «نشر الندوات» لتطبيق الحذف على الجميع');
  }
  // ---------- الإعلان ----------
  function renderPoster() {
    const s = clean(current || blank());
    const P = $('#poster'); P.textContent = ''; P.dataset.size = size;
    if (size === 'programme') { renderProgramme(P, s); fitStage(); return; }
    P.appendChild(el('div', 'qs-callig', 'ندوة'));
    const inner = el('div', 'qs-inner');
    const logo = el('img', 'qs-logo'); logo.src = LOGO; logo.alt = ''; inner.appendChild(logo);
    inner.appendChild(el('div', 'qs-pill', `تُقيم ${s.organizer || 'كلية الشريعة'}`));
    inner.appendChild(el('p', 'qs-kicker', 'ندوة علمية بعنوان'));
    inner.appendChild(el('h1', 'qs-title', s.title || 'عنوان الندوة'));
    if (s.subtitle) inner.appendChild(el('p', 'qs-sub', s.subtitle));
    if (STATUS_AR[s.status]) inner.appendChild(el('div', 'qs-status ' + s.status, STATUS_AR[s.status]));
    const speakers = s.participants.filter(isSpeaker);
    if (speakers.length) {
      const box = el('div', 'qs-people');
      box.appendChild(el('h3', null, 'المشاركون'));
      const max = size === 'story' ? 8 : 5;
      speakers.slice(0, max).forEach(p => {
        const r = el('div', 'qs-person');
        r.appendChild(el('div', 'n', p.name));
        const tm = [t12(p.start), t12(p.end)].filter(Boolean).join(' – ');
        r.appendChild(el('div', 'tm', tm || p.role));
        const sub = [p.title, tm ? p.role : ''].filter(Boolean).join(' — ');
        if (sub) r.appendChild(el('div', 'r', sub));
        if (p.topic) r.appendChild(el('div', 'tp', p.topic));
        box.appendChild(r);
      });
      if (speakers.length > max) box.appendChild(el('div', 'qs-person', `و${speakers.length - max} متحدثين آخرين`));
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
        const q = window.qrcode(0, 'M'); q.addData(s.link); q.make();
        const box = el('div', 'qs-qr');
        box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });   // SVG من مكتبة QR (الرابط مُرمّز كمربعات، لا كنص HTML)
        box.appendChild(el('div', null, 'شاهد البث'));
        foot.appendChild(box);
      } catch (e) { /* رابط طويل جداً */ }
    }
    P.appendChild(foot);
    fitContent(inner, size === 'story' ? 1920 : 1350);
    fitStage();
  }
  // ---------- إعلان برنامج الندوة (الطول يزيد مع عدد البنود) ----------
  const ICON = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  };
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
        const q = window.qrcode(0, 'M'); q.addData(s.link); q.make();
        const box = el('div', 'qp2-qr');
        box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });   // SVG من مكتبة QR
        box.appendChild(el('div', null, 'البث المباشر عبر مسح رمز QR'));
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
        row.appendChild(el('div', 'qc qc-time', timeRange(p)));
      } else if (p.kind === 'opening') {
        row.appendChild(el('div', 'qc qc-grad', p.topic || 'الافتتاح'));
        const c = el('div', 'qc qc-person'); if (p.name) c.appendChild(person(p.name, p.title)); row.appendChild(c);
        row.appendChild(el('div', 'qc qc-time', timeRange(p)));
      } else if (p.kind === 'discussion') {
        row.appendChild(el('div', 'qc qc-wide', p.topic || 'المداخلات والتعقيبات'));
        row.appendChild(el('div', 'qc qc-time', timeRange(p)));
      } else { // break / closing
        row.appendChild(el('div', 'qc qc-grad qc-wide', p.topic || KINDS[p.kind].topic));
        row.appendChild(el('div', 'qc qc-grad qc-time', timeRange(p)));
      }
      band.appendChild(row);
    }
  }

  function renderTable(band, items) {
    let table = null, n = 0;
    const newTable = () => {
      table = el('table', 'qt');
      const tr = el('tr'); ['م', 'عنوان الورقة البحثية', 'الأستاذ الملقي', 'التخصص', 'الوقت'].forEach(h => tr.appendChild(el('th', null, h)));
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
        row.appendChild(el('div', 'qc qc-time' + (p.kind === 'discussion' ? '' : ' qc-grad'), timeRange(p)));
        band.appendChild(row); continue;
      }
      if (!table) newTable();
      const tr = el('tr', 'k-' + p.kind);
      if (p.kind === 'paper') {
        n++; const num = el('td', 'qt-n'); num.appendChild(el('span', null, n)); tr.appendChild(num);
        tr.appendChild(el('td', 'qt-topic', p.topic));
        const c = el('td'); c.appendChild(person(p.name, p.title)); tr.appendChild(c);
        tr.appendChild(el('td', 'qt-spec', p.specialty || ''));
      } else {
        const td = el('td', 'qt-span'); td.colSpan = 4;
        td.textContent = [p.topic || KINDS[p.kind].topic, p.kind === 'opening' && p.name ? '— ' + p.name : ''].filter(Boolean).join(' ');
        tr.appendChild(td);
      }
      tr.appendChild(el('td', 'qt-time', timeRange(p)));
      table.querySelector('tbody').appendChild(tr);
    }
  }

  // يصغّر المحتوى ليتسع فوق التذييل مهما زاد عدد المشاركين (مثل تصميم المناقشات)
  function fitContent(inner, H) {
    inner.style.transform = ''; inner.style.width = ''; inner.style.bottom = 'auto';
    const avail = H - 190, natural = inner.scrollHeight;
    if (natural > avail) {
      const k = Math.max(0.55, avail / natural);
      inner.style.width = (1080 / k) + 'px';
      inner.style.transformOrigin = 'top left';
      inner.style.transform = `scale(${k})`;
    }
  }
  const posterH = () => size === 'programme' ? Math.ceil($('#poster').scrollHeight) : (size === 'story' ? 1920 : 1350);
  function fitStage() {
    const st = $('#stage'), P = $('#poster');
    const H = posterH();
    const scale = Math.min(1, (st.clientWidth - 20) / 1080);
    P.style.transform = `scale(${scale})`;
    st.style.height = Math.ceil(H * scale + 20) + 'px';
  }

  // ---------- التحميل والمشاركة (مثل صفحة المناقشات) ----------
  const exScale = () => +($('#exScale').value || 2);
  async function renderBlob(scale) {
    const P = $('#poster'), H = posterH();
    const canvas = await htmlToImage.toCanvas(P, { width: 1080, height: H, pixelRatio: scale || exScale(), style: { transform: 'none' }, cacheBust: true });
    return { canvas, H };
  }
  const safe = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  const fileBase = (s) => { s = s || current || {}; return `${size === 'programme' ? 'برنامج' : 'اعلان'}-${safe(s.title) || 'ندوة'}-${s.date || 'جديدة'}`; };
  function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));
  // ملف واحد بالنوع المختار (PNG / JPG / PDF)
  async function fileOf(type) {
    const { canvas, H } = await renderBlob();
    if (type === 'pdf') {
      const w = 1080 * 0.75, h = H * 0.75;          // بكسل CSS → نقاط PDF
      const doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: 'portrait', compress: true });
      doc.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, w, h, undefined, 'FAST');
      return { blob: doc.output('blob'), ext: 'pdf' };
    }
    return type === 'jpg' ? { blob: await toBlob(canvas, 'image/jpeg', 0.92), ext: 'jpg' } : { blob: await toBlob(canvas, 'image/png'), ext: 'png' };
  }
  function busy(on, text, frac) { const o = $('#overlay'); o.classList.toggle('open', !!on); if (text) $('#overlayText').textContent = text; $('#overlayBar').style.width = Math.round((frac || 0) * 100) + '%'; }
  async function downloadCurrent() {
    try { busy(true, 'جارٍ تجهيز الملف...'); const f = await fileOf($('#exType').value); saveBlob(f.blob, fileBase() + '.' + f.ext); }
    catch (e) { toast('تعذر إنشاء الملف', true); } finally { busy(false); }
  }
  async function downloadSelected() {
    const ids = merged().filter(s => gridSel.has(s.id)).map(s => s.id);
    if (!ids.length) return toast('حدد الندوات من مربعات الجدول أولاً', true);
    const keep = current, type = $('#exType').value, zip = new JSZip(), all = merged();
    try {
      for (let i = 0; i < ids.length; i++) {
        busy(true, `جارٍ تجهيز ${i + 1} من ${ids.length}...`, i / ids.length);
        current = clean(all.find(s => s.id === ids[i])); renderPoster();
        await new Promise(r => setTimeout(r, 60));
        const f = await fileOf(type); zip.file(`${String(i + 1).padStart(2, '0')}-${fileBase(current)}.${f.ext}`, f.blob);
      }
      busy(true, 'جارٍ ضغط الملفات...', 1);
      saveBlob(await zip.generateAsync({ type: 'blob' }), `اعلانات-الندوات-${todayIso()}.zip`);
    } catch (e) { toast('تعذر تجهيز الملفات', true); }
    finally { current = keep; renderPoster(); busy(false); }
  }
  async function printCurrent() {
    const w = window.open('', '_blank'); if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة', true);
    try {
      const { canvas } = await renderBlob(2);
      const doc = w.document; doc.title = fileBase();
      const img = doc.createElement('img'); img.src = canvas.toDataURL('image/png'); img.style.cssText = 'width:100%;display:block';
      doc.body.style.margin = '0'; doc.body.appendChild(img);
      img.onload = () => { w.focus(); w.print(); };
    } catch (e) { w.close(); toast('تعذر تجهيز الطباعة', true); }
  }
  async function shareImage() {
    try {
      const { canvas } = await renderBlob(2);
      const file = new File([await toBlob(canvas, 'image/jpeg', 0.92)], fileBase() + '.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      saveBlob(file, file.name); toast('المشاركة غير مدعومة في هذا المتصفح — حُمّلت الصورة');
    } catch (e) { if (e.name !== 'AbortError') toast('تعذرت المشاركة', true); }
  }
  async function copyImage() {
    try { const { canvas } = await renderBlob(2); await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toBlob(canvas, 'image/png') })]); toast('نُسخت الصورة ✓ — الصقها في المحادثة (Ctrl+V)'); }
    catch (e) { toast('المتصفح منع نسخ الصورة — استعمل «تحميل»', true); }
  }
  async function zoom() {
    try { busy(true, 'جارٍ التجهيز...'); const { canvas } = await renderBlob(1); $('#zoomImg').src = canvas.toDataURL('image/png'); $('#mZoom').classList.add('open'); }
    catch (e) { toast('تعذر العرض', true); } finally { busy(false); }
  }

  // نص الإعلان (رسالة الدعوة للواتساب / نص النشر)
  function shareText() {
    const s = clean(current || blank());
    const lines = [`تقيم ${s.organizer || 'كلية الشريعة'}${s.department ? ' ممثلة ب' + s.department : ''} ${s.series || 'ندوة'} بعنوان:`, s.title ? (/[«»""]/.test(s.title) ? s.title : `«${s.title}»`) : '«عنوان الندوة»'];
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
  function copyText(t) { navigator.clipboard.writeText(t).then(() => toast('نُسخت الرسالة ✓'), () => toast('تعذر النسخ', true)); }
  function openCaption() {
    const tags = '\n\n#جامعة_القصيم #كلية_الشريعة';
    const fill = () => { $('#captionText').value = shareText() + ($('#capTags').checked ? tags : ''); links(); };
    const links = () => { const t = $('#captionText').value; $('#capWa').href = 'https://wa.me/?text=' + encodeURIComponent(t); $('#capX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t); };
    $('#capTags').onchange = fill; $('#captionText').oninput = links; $('#capCopy').onclick = () => copyText($('#captionText').value);
    fill(); $('#mCaption').classList.add('open');
  }
  // واتساب: الصورة الأصلية + الرسالة (الجوال: مشاركة مباشرة، الكمبيوتر: واتساب ويب + نسخ الصورة)
  let sendFile = null;
  async function openSend() {
    $('#sendText').value = shareText(); $('#sendImg').removeAttribute('src'); $('#sendImgNote').hidden = false; $('#sendHint').textContent = '';
    $('#mSend').classList.add('open');
    try {
      const { canvas } = await renderBlob(2);
      sendFile = new File([await toBlob(canvas, 'image/jpeg', 0.92)], fileBase() + '.jpg', { type: 'image/jpeg' });
      $('#sendImg').src = URL.createObjectURL(sendFile); $('#sendImgNote').hidden = true;
    } catch (e) { $('#sendImgNote').textContent = 'تعذر تجهيز الصورة'; }
  }
  $('#sendShare').onclick = async () => {
    const text = $('#sendText').value;
    if (sendFile && navigator.canShare && navigator.canShare({ files: [sendFile] })) { try { await navigator.share({ files: [sendFile], text }); } catch (e) { /* أُلغي */ } return; }
    $('#sendHint').textContent = 'هذا المتصفح ما يدعم إرسال الصورة مباشرة — استعمل «واتساب ويب» تحت.';
  };
  $('#sendWeb').onclick = async () => {
    const w = window.open('about:blank', '_blank');
    let copied = false;
    try { if (sendFile) { const bmp = await createImageBitmap(sendFile); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toBlob(c, 'image/png') })]); copied = true; } } catch (e) { copied = false; }
    const url = 'https://web.whatsapp.com/send?text=' + encodeURIComponent($('#sendText').value);
    if (w) w.location.href = url; else location.href = url;
    $('#sendHint').textContent = copied ? '✓ الصورة منسوخة — اختر المحادثة والصقها (Ctrl+V) ثم أرسل.' : 'أرفق الصورة من «تحميل الصورة».';
  };
  $('#sendCopy').onclick = () => copyText($('#sendText').value);
  $('#sendDl').onclick = () => { if (sendFile) saveBlob(sendFile, sendFile.name); };

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
  if (session.role === 'admin') $('#btnSetup').hidden = false;
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
  $$('[data-size]').forEach(b => b.onclick = () => { $$('[data-size]').forEach(x => x.classList.toggle('active', x === b)); size = b.dataset.size; renderPoster(); });
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
  $('#btnWa').onclick = openSend;
  $('#waInvite').onclick = openSend;
  $('#copyInvite').onclick = () => copyText(shareText());
  // الجدول
  $('#search').addEventListener('input', renderGrid);
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

  openSem(blank());
  refreshPublished();
})();
