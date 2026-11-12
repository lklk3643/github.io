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
  const ROLES = ['متحدث', 'مدير الجلسة', 'معقّب', 'ضيف شرف', 'مقدّم'];
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
  let size = 'post';

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
  const blank = () => ({ id: newId(), title: '', subtitle: '', organizer: 'كلية الشريعة', date: '', start: '', end: '', place: 'قاعة ابن عثيمين', place_note: '(والبث عبر الإنترنت)', link: '', status: 'confirmed', notes: '', participants: [] });
  const clean = (s) => ({ id: String(s.id), title: String(s.title || '').trim(), subtitle: String(s.subtitle || '').trim(), organizer: String(s.organizer || '').trim(),
    date: String(s.date || ''), start: String(s.start || ''), end: String(s.end || ''), place: String(s.place || '').trim(), place_note: String(s.place_note || '').trim(),
    link: String(s.link || '').trim(), status: ['confirmed', 'postponed', 'cancelled'].includes(s.status) ? s.status : 'confirmed', notes: String(s.notes || '').trim(),
    participants: (s.participants || []).map(p => ({ name: String(p.name || '').trim(), title: String(p.title || '').trim(), role: String(p.role || '').trim(),
      topic: String(p.topic || '').trim(), start: String(p.start || ''), end: String(p.end || '') })).filter(p => p.name), updated: s.updated || '' });

  function merged() {
    const map = new Map(published.seminars.map(s => [s.id, s]));
    Object.values(local.items).forEach(s => map.set(s.id, s));
    local.deleted.forEach(id => map.delete(id));
    return Array.from(map.values()).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
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

  // ---------- القائمة ----------
  function renderList() {
    const q = $('#search').value.trim();
    const ol = $('#list'); ol.textContent = '';
    const today = todayIso();
    const all = merged().filter(s => !q || s.title.includes(q) || s.participants.some(p => p.name.includes(q)));
    for (const s of all) {
      const li = el('li'); if (current && current.id === s.id) li.classList.add('active');
      const t = el('div', 't', s.title || '(بلا عنوان)');
      if (local.items[s.id]) t.appendChild(el('span', 'tag draft', 'غير منشورة'));
      if (s.status !== 'confirmed') t.appendChild(el('span', 'tag ' + s.status, STATUS_AR[s.status]));
      else if (s.date && s.date < today) t.appendChild(el('span', 'tag past', 'منتهية'));
      li.appendChild(t);
      li.appendChild(el('div', 'd', [weekday(s.date), hijri(s.date), t12(s.start)].filter(Boolean).join(' · ') + (s.participants.length ? ` · ${s.participants.length} مشاركين` : '')));
      li.onclick = () => openSem(s);
      ol.appendChild(li);
    }
    $('#listEmpty').hidden = all.length > 0;
  }

  // ---------- النموذج ----------
  function partRow(p = {}) {
    const row = el('div', 'prow'); row.setAttribute('role', 'row');
    const inp = (k, ph, type = 'text') => { const i = el('input'); i.type = type; i.dataset.p = k; i.value = p[k] || ''; if (ph) i.placeholder = ph; i.setAttribute('aria-label', ph || k); return i; };
    row.appendChild(inp('name', 'الاسم'));
    row.appendChild(inp('title', 'مثال: أ.د. / أستاذ الفقه'));
    const sel = el('select'); sel.dataset.p = 'role'; sel.setAttribute('aria-label', 'الدور');
    ROLES.forEach(r => { const o = el('option', null, r); o.value = r; sel.appendChild(o); });
    if (p.role && !ROLES.includes(p.role)) { const o = el('option', null, p.role); o.value = p.role; sel.appendChild(o); }
    sel.value = p.role || 'متحدث'; row.appendChild(sel);
    row.appendChild(inp('topic', 'المحور'));
    row.appendChild(inp('start', 'من', 'time'));
    row.appendChild(inp('end', 'إلى', 'time'));
    const rm = el('button', 'rm', '✕'); rm.type = 'button'; rm.title = 'حذف المشارك'; rm.setAttribute('aria-label', 'حذف المشارك');
    rm.onclick = () => { row.remove(); readForm(); };
    row.appendChild(rm);
    row.addEventListener('input', readForm);
    return row;
  }

  function openSem(s) {
    current = clean(s);
    $$('[data-k]').forEach(i => { i.value = current[i.dataset.k] || ''; });
    const parts = $('#parts'); parts.textContent = '';
    current.participants.forEach(p => parts.appendChild(partRow(p)));
    $('#formErr').textContent = '';
    $('#btnDelete').hidden = !merged().some(x => x.id === current.id);
    updateHijri(); renderList(); renderPoster();
  }

  function readForm() {
    if (!current) return;
    $$('[data-k]').forEach(i => { current[i.dataset.k] = i.value; });
    current.participants = $$('#parts .prow').map(r => Object.fromEntries($$('[data-p]', r).map(i => [i.dataset.p, i.value])));
    updateHijri(); renderPoster();
  }
  function updateHijri() { const d = $('#f_date').value; $('#hijri').textContent = d ? `${weekday(d)} — ${hijri(d)}` : ''; }

  function save() {
    readForm();
    const s = clean(current);
    const missing = [!s.title && 'العنوان', !s.date && 'التاريخ', !s.start && 'وقت البداية'].filter(Boolean);
    if (missing.length) { $('#formErr').textContent = 'أكمل: ' + missing.join('، '); return; }
    if (s.end && s.end <= s.start && !confirm('وقت النهاية قبل البداية — هل تمتد الندوة لبعد منتصف الليل؟')) return;
    s.updated = new Date().toISOString();
    local.items[s.id] = s; local.deleted = local.deleted.filter(x => x !== s.id); saveLocal();
    current = s; $('#formErr').textContent = ''; $('#btnDelete').hidden = false;
    renderList(); renderPub();
    toast(token() ? 'حُفظت ✓ — اضغط «نشر الندوات» لتظهر للجميع ولشاشة OBS' : 'حُفظت على هذا الجهاز ✓');
  }

  function del() {
    if (!current || !confirm(`حذف ندوة «${current.title || 'بلا عنوان'}»؟ تُحذف من الجميع بعد النشر.`)) return;
    delete local.items[current.id];
    if (published.seminars.some(x => x.id === current.id) && !local.deleted.includes(current.id)) local.deleted.push(current.id);
    saveLocal(); openSem(blank()); renderPub(); toast('حُذفت — اضغط «نشر الندوات» لتطبيق الحذف على الجميع');
  }

  // ---------- الإعلان ----------
  function renderPoster() {
    const s = clean(current || blank());
    const P = $('#poster'); P.textContent = ''; P.dataset.size = size;
    P.appendChild(el('div', 'qs-callig', 'ندوة'));
    const inner = el('div', 'qs-inner');
    const logo = el('img', 'qs-logo'); logo.src = LOGO; logo.alt = ''; inner.appendChild(logo);
    inner.appendChild(el('div', 'qs-pill', `تُقيم ${s.organizer || 'كلية الشريعة'}`));
    inner.appendChild(el('p', 'qs-kicker', 'ندوة علمية بعنوان'));
    inner.appendChild(el('h1', 'qs-title', s.title || 'عنوان الندوة'));
    if (s.subtitle) inner.appendChild(el('p', 'qs-sub', s.subtitle));
    if (STATUS_AR[s.status]) inner.appendChild(el('div', 'qs-status ' + s.status, STATUS_AR[s.status]));
    if (s.participants.length) {
      const box = el('div', 'qs-people');
      box.appendChild(el('h3', null, 'المشاركون'));
      const max = size === 'story' ? 8 : 5;
      s.participants.slice(0, max).forEach(p => {
        const r = el('div', 'qs-person');
        r.appendChild(el('div', 'n', p.name));
        const tm = [t12(p.start), t12(p.end)].filter(Boolean).join(' – ');
        r.appendChild(el('div', 'tm', tm || p.role));
        const sub = [p.title, tm ? p.role : ''].filter(Boolean).join(' — ');
        if (sub) r.appendChild(el('div', 'r', sub));
        if (p.topic) r.appendChild(el('div', 'tp', p.topic));
        box.appendChild(r);
      });
      if (s.participants.length > max) box.appendChild(el('div', 'qs-person', `و${s.participants.length - max} مشاركين آخرين`));
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
  function fitStage() {
    const st = $('#stage'), P = $('#poster');
    const H = size === 'story' ? 1920 : 1350;
    const scale = Math.min(1, (st.clientWidth - 20) / 1080);
    P.style.transform = `scale(${scale})`;
    st.style.height = Math.ceil(H * scale + 20) + 'px';
  }

  async function downloadPng() {
    const P = $('#poster'); const H = size === 'story' ? 1920 : 1350;
    try {
      const url = await htmlToImage.toPng(P, { width: 1080, height: H, pixelRatio: 1, style: { transform: 'none' }, cacheBust: true });
      const a = document.createElement('a'); a.href = url;
      a.download = `اعلان-ندوة-${(current && current.date) || 'جديدة'}-${size}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast('تعذر إنشاء الصورة', true); }
  }
  function copyText() {
    const s = clean(current || blank());
    const lines = [`تُقيم ${s.organizer || 'كلية الشريعة'} ندوة علمية بعنوان:`, `«${s.title}»`];
    if (s.subtitle) lines.push(s.subtitle);
    if (s.participants.length) { lines.push('', 'المشاركون:'); s.participants.forEach(p => lines.push(`• ${p.name}${p.topic ? ' — ' + p.topic : ''}${p.start ? ' (' + t12(p.start) + ')' : ''}`)); }
    lines.push('', `📅 ${weekday(s.date)} ${hijri(s.date)} الموافق ${gdate(s.date)}`, `⏰ ${[t12(s.start), t12(s.end)].filter(Boolean).join(' – ')}`, `📍 ${[s.place, s.place_note].filter(Boolean).join(' ')}`);
    if (s.link) lines.push(`🔗 ${s.link}`);
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast('نُسخ نص النشر ✓'), () => toast('تعذر النسخ', true));
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
  $('#btnNew').onclick = () => { openSem(blank()); $('#f_title').focus(); };
  $('#btnSave').onclick = save;
  $('#btnDelete').onclick = del;
  $('#btnPublish').onclick = publish;
  $('#addPart').onclick = () => { const r = partRow({}); $('#parts').appendChild(r); r.querySelector('input').focus(); readForm(); };
  $('#search').addEventListener('input', renderList);
  $$('[data-k]').forEach(i => i.addEventListener('input', readForm));
  $$('[data-size]').forEach(b => b.onclick = () => { $$('[data-size]').forEach(x => x.classList.toggle('active', x === b)); size = b.dataset.size; renderPoster(); });
  $('#btnPng').onclick = downloadPng;
  $('#btnCopyText').onclick = copyText;
  window.addEventListener('resize', fitStage);
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  window.addEventListener('beforeunload', e => { if (pendingCount() && token()) { e.preventDefault(); e.returnValue = ''; } });

  openSem(blank());
  refreshPublished();
})();
