/* واجهة المحرر: الحقول، المعاينة، الإكسل/جوجل شيت، التحميل، القوالب، الموظفين */
(function () {
  'use strict';
  // تحديث تلقائي: إذا نُشرت نسخة أحدث من المفتوحة يُعاد تحميل الصفحة (يتجاوز ذاكرة المتصفح المؤقتة)
  const APP_V = '?v=202610170020'.slice(3);
  let lastVCheck = 0;
  function checkVersion() {
    if (location.protocol === 'file:' || Date.now() - lastVCheck < 60000) return;
    lastVCheck = Date.now();
    fetch('version.txt?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(v => {
      v = (v || '').trim(); if (!/^\d{8,}$/.test(v) || v <= APP_V) return;
      try { if (sessionStorage.getItem('qu_reloaded') === v) return; sessionStorage.setItem('qu_reloaded', v); } catch (e) { /* اختياري */ }
      location.replace(location.pathname.replace(/[^/]*$/, '') + 'app.html?u=' + v + location.hash);
    }).catch(() => {});
  }
  checkVersion();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
  const session = QAuth.requireLogin();
  if (!session) return;

  const { DEFAULTS, THEMES, FORMATS, customFormat, render, fit, DEFAULT_LOGO } = QPoster;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const userKey = k => `qu_${k}_${session.u.toLowerCase()}`;

  // ---------- الحالة ----------
  function normalize(s) {
    const d = clone(DEFAULTS);
    s = s || {};
    const out = { ...d, ...s };
    out.theme = { ...d.theme, ...(s.theme || {}) };
    out.opt = { ...d.opt, ...(s.opt || {}) };
    out.assets = { ...d.assets, ...(s.assets || {}) };
    out.committee = Array.isArray(s.committee) ? s.committee : d.committee;
    if (!out.link) out.link = d.link;
    if (/الإعلام والا?إ?تصال المؤسسي/.test(out.dept || '')) out.dept = d.dept; // الافتراضي الجديد: كلية الشريعة
    if ((out.v || 0) < 3) { out.opt.qr = true; out.v = 3; } // رمز QR مفعّل افتراضياً (برابط اليوتيوب)
    return out;
  }
  let state;
  try { state = normalize(JSON.parse(localStorage.getItem(userKey('draft')))); } catch (e) { state = normalize(); }

  let saveTimer;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(userKey('draft'), JSON.stringify(state));
        const f = document.getElementById('savedFlag');
        if (f) { f.textContent = '✓ محفوظ تلقائياً'; f.classList.add('show'); clearTimeout(f._t); f._t = setTimeout(() => f.classList.remove('show'), 1800); }
      }
      catch (e) { toast('مساحة التخزين ممتلئة – الصور كبيرة جداً، احذف بعض القوالب أو الصور', true); }
    }, 400);
  }

  // ---------- عام ----------
  function toast(msg, err, act) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    if (act) { const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = act.label; b.onclick = () => { act.fn(); t.className = 'toast'; }; t.appendChild(b); }
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'toast'; }, Math.min(9000, Math.max(3500, String(msg).length * 55)));
  }
  const overlay = {
    show(txt) { $('#overlayText').textContent = txt; $('#overlayBar').style.width = '0'; $('#overlay').classList.add('open'); },
    progress(p, txt) { $('#overlayBar').style.width = Math.round(p * 100) + '%'; if (txt) $('#overlayText').textContent = txt; },
    hide() { $('#overlay').classList.remove('open'); }
  };
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  $('#who').textContent = `مرحباً، ${session.name || session.u}`;
  $('#brandLogo').insertAdjacentHTML('afterbegin', `<img src="${DEFAULT_LOGO}" alt="" class="brand-logo">`);
  // إدارة الحسابات للمدير العام وحده؛ الصلاحية تُقرأ من السحابة (قد تتغير بعد الدخول)
  if (session.role === 'super') { $('#btnUsers').hidden = false; $('#btnBackups').hidden = false; }
  if (window.QCloud && QCloud.site && session.token) fetch('/api/me', { headers: { authorization: 'Bearer ' + session.token } })
    .then(r => r.ok ? r.json() : null).then(j => { if (j && j.role) { session.role = j.role; $('#btnUsers').hidden = j.role !== 'super'; $('#btnBackups').hidden = j.role !== 'super'; } }).catch(() => {});
  if (session.weak) $('#weakBanner').hidden = false;
  $('#btnLogout').onclick = () => QAuth.logout();
  // التنقل السفلي (جوال / آيباد عمودي)
  const GO = { side: '.side', preview: '#previewPanel', export: '#exportPanel', dataSheet: '#dataSheet' };
  $$('.mnav [data-go]').forEach(b => b.onclick = () => { const t = $(GO[b.dataset.go]); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  // ---------- التبويبات ----------
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === b.dataset.tab));
  });

  // ---------- ربط الحقول ----------
  function fillForm() {
    $$('[data-k]').forEach(el => { el.value = state[el.dataset.k] ?? ''; });
    $$('[data-o]').forEach(el => {
      if (el.type === 'checkbox') el.checked = !!state.opt[el.dataset.o];
      else el.value = state.opt[el.dataset.o];
    });
    $('#titleSizeVal').textContent = state.opt.titleSize + 'px';
    $('#linkRow').hidden = !state.opt.qr;
    updLinkWarn();
    // ألوان التصميم فقط — خانات الجدول تستخدم data-c بعد (رقم العمود)، فلازم التحديد بنوع الخانة وإلا تنكتب «undefined» في الجدول
    $$('input[type=color][data-c]').forEach(el => { el.value = state.theme[el.dataset.c]; });
    $$('[data-gender]').forEach(b => b.classList.toggle('active', (b.dataset.gender === 'f') === /طالبة/.test(state.by)));
    renderMembers();
    renderUploads();
  }
  function updLinkWarn() { const w = $('#linkWarn'); if (w) w.hidden = !(state.opt.qr && QPoster.qrModules(state.link) > 45); }
  $$('[data-k]').forEach(el => el.addEventListener('input', () => { state[el.dataset.k] = el.value; if (el.dataset.k === 'link') updLinkWarn(); changed(); }));
  $$('[data-o]').forEach(el => el.addEventListener('input', () => {
    state.opt[el.dataset.o] = el.type === 'checkbox' ? el.checked : +el.value;
    if (el.dataset.o === 'qr') {
      if (el.checked && !state.link) { state.link = DEFAULTS.link; fillForm(); }
      $('#linkRow').hidden = !el.checked;
      if (el.checked) setTimeout(() => $('[data-k=link]').select(), 0);
    }
    $('#titleSizeVal').textContent = state.opt.titleSize + 'px';
    changed();
  }));
  $$('input[type=color][data-c]').forEach(el => el.addEventListener('input', () => { state.theme[el.dataset.c] = el.value; changed(); }));

  const GENDER = {
    m: { by: 'من قبل طالب الدراسات العليا', presenterLabel: 'يقدمها:' },
    f: { by: 'من قبل طالبة الدراسات العليا', presenterLabel: 'تقدمها:' }
  };
  $$('[data-gender]').forEach(b => b.onclick = () => { Object.assign(state, GENDER[b.dataset.gender]); fillForm(); changed(); });

  // الثيمات
  $('#themes').innerHTML = Object.keys(THEMES).map(n => `<button class="chip" data-theme="${esc(n)}">${esc(n)}</button>`).join('');
  $$('[data-theme]').forEach(b => b.onclick = () => { state.theme = { ...THEMES[b.dataset.theme] }; fillForm(); changed(); });

  // التاريخ الهجري التلقائي
  $('#gDate').addEventListener('change', e => {
    if (!e.target.value) return;
    const d = new Date(e.target.value + 'T12:00:00');
    try {
      state.day = new Intl.DateTimeFormat('ar-SA', { weekday: 'long' }).format(d);
      const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
      const g = t => (parts.find(p => p.type === t) || {}).value;
      state.date = `${parseInt(g('year'), 10)}/${g('month')}/${g('day')} هـ`;
      fillForm(); changed();
    } catch (err) { toast('المتصفح لا يدعم التحويل للتقويم الهجري، اكتب التاريخ يدوياً', true); }
  });

  // ---------- أعضاء اللجنة ----------
  function renderMembers() {
    $('#members').innerHTML = state.committee.map((m, i) => `
      <div class="member" data-i="${i}">
        <div class="head">العضو ${i + 1}
          <span class="tools">
            <button class="btn sm" data-act="up" title="أعلى">▲</button>
            <button class="btn sm" data-act="down" title="أسفل">▼</button>
            <button class="btn sm danger" data-act="del" title="حذف">✕</button>
          </span></div>
        <input type="text" data-m="name" placeholder="الاسم" value="${esc(m.name)}">
        <input type="text" data-m="title" placeholder="الصفة (اضغط للاختيار)" value="${esc(m.title)}" inputmode="none" data-pick="list:mTitle">
        <input type="text" data-m="role" placeholder="الدور (اضغط للاختيار)" value="${esc(m.role)}" inputmode="none" data-pick="list:mRole">
      </div>`).join('');
  }
  $('#members').addEventListener('input', e => {
    const m = e.target.closest('.member');
    if (m && e.target.dataset.m) { state.committee[+m.dataset.i][e.target.dataset.m] = e.target.value; changed(); }
  });
  $('#members').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = +b.closest('.member').dataset.i, c = state.committee;
    if (b.dataset.act === 'del') c.splice(i, 1);
    if (b.dataset.act === 'up' && i > 0) [c[i - 1], c[i]] = [c[i], c[i - 1]];
    if (b.dataset.act === 'down' && i < c.length - 1) [c[i + 1], c[i]] = [c[i], c[i + 1]];
    renderMembers(); changed();
  });
  $('#addMember').onclick = () => { state.committee.push({ name: '', title: '', role: 'مناقشاً' }); renderMembers(); changed(); };

  // ---------- رفع الصور ----------
  function readImage(file, maxSide) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        if (file.type === 'image/svg+xml') return resolve(fr.result);
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(file.type === 'image/png' || file.type === 'image/webp' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function renderUploads() {
    $$('.upload').forEach(u => {
      const v = state.assets[u.dataset.asset];
      $('.thumb', u).style.backgroundImage = v ? `url("${v}")` : 'none';
    });
  }
  $$('.upload').forEach(u => {
    $('input[type=file]', u).addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        state.assets[u.dataset.asset] = await readImage(f, u.dataset.asset === 'logo' ? 900 : 2200);
        renderUploads(); changed();
      } catch (err) { toast('تعذّر قراءة الصورة', true); }
      e.target.value = '';
    });
    $('[data-clear]', u).onclick = () => { state.assets[u.dataset.asset] = ''; renderUploads(); changed(); };
  });

  $('#resetAll').onclick = () => {
    if (!confirm('سيتم استرجاع النموذج الافتراضي وفقدان التعديلات غير المحفوظة. متابعة؟')) return;
    state = normalize(); fillForm(); changed();
  };

  // ---------- المعاينة ----------
  const posterEl = $('#poster');
  let currentFmt = FORMATS[0];
  $('#previewFormats').innerHTML = FORMATS.map(f => `<button class="chip" data-pf="${f.id}">${f.name}</button>`).join('') +
    `<button class="chip" data-pf="custom">مقاس مخصص</button>`;
  function getFormat(id) { return id === 'custom' ? customFormat($('#cw').value, $('#ch').value) : FORMATS.find(f => f.id === id); }
  // اختيار واحد للمقاس في الصفحة كلها: اللي يظهر في «المعاينة» = اللي ينزل بالتحميل = اللي ينرسل بالمشاركة والواتساب
  function pickPreview(id, syncExport) {
    const b = $(`[data-pf="${id}"]`); if (!b) return;
    currentFmt = getFormat(id);
    $('#customBox').hidden = id !== 'custom';
    $$('[data-pf]').forEach(x => x.classList.toggle('active', x === b));
    if (syncExport && $('#exportFormats')) {           // من «المعاينة»: يصير هو المقاس المحدد للتحميل (تقدر تضيف غيره)
      $$('#exportFormats input').forEach(i => { i.checked = i.value === id; });
      try { localStorage.setItem(userKey('fmts'), JSON.stringify([id])); } catch (e) { /* اختياري */ }
    }
    changed(true);
  }
  $$('[data-pf]').forEach(b => b.onclick = () => pickPreview(b.dataset.pf, true));
  $('[data-pf="exact"]').classList.add('active');
  ['#cw', '#ch'].forEach(s => $(s).addEventListener('input', () => { if (currentFmt.id === 'custom') { currentFmt = getFormat('custom'); changed(true); } }));

  async function settle(el) {
    await Promise.all($$('img', el).map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  }

  let renderTimer;
  function changed(noSave) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(drawPreview, 60);
    if (!noSave) { saveDraft(); if (window.QUndo) QUndo.record(); clearTimeout(changed._s); changed._s = setTimeout(() => { try { autoSync(); } catch (e) { /* قبل التهيئة */ } }, 400); }
    clearTimeout(changed._c); changed._c = setTimeout(() => { try { formConflictCheck(); } catch (e) { /* قبل التهيئة */ } }, 300);
  }
  async function drawPreview() {
    const f = currentFmt;
    render(posterEl, state, f);
    await settle(posterEl);
    fit(posterEl);
    layoutPreview();
  }
  function layoutPreview() {
    const f = currentFmt, stage = $('#stage'), sc = $('#scaler');
    const avail = stage.clientWidth - 40;
    const maxH = Math.max(420, window.innerHeight - 190);
    const k = Math.min(1, avail / f.w, maxH / f.h);
    sc.style.width = f.w + 'px'; sc.style.height = f.h + 'px';
    sc.style.transform = `scale(${k})`;
    sc.style.marginBottom = `${f.h * k - f.h}px`;
    sc.style.marginInline = `${(f.w * k - f.w) / 2}px`;
    $('#sizeBadge').textContent = `${f.name} — ${f.w} × ${f.h} بكسل (المعاينة ${Math.round(k * 100)}%)` +
      (f.safe ? ' — المربع الأحمر هو المنطقة الآمنة الظاهرة على كل الأجهزة' : '') +
      (f.layout === 'exact' ? ' — نسخة طبق الأصل من التصميم الرسمي (الألوان والصور ثابتة؛ لتغييرها استخدم المقاسات الأخرى)' : '');
  }
  window.addEventListener('resize', () => layoutPreview());

  // ---------- التحميل ----------
  let defaultFmts = ['exact'];   // مقاس واحد افتراضياً: ملف واحد ينزل (الموظف يزيد لو يبي)
  // الافتراضي دايماً «الإعلان الرسمي» عند كل فتح (ما يتذكر مقاس المرة الماضية)
  $('#exportFormats').innerHTML = FORMATS.map(f => `<label class="fmt"><input type="checkbox" value="${f.id}" ${defaultFmts.includes(f.id) ? 'checked' : ''}>
      <span>${f.name}<small>${f.w}×${f.h}</small></span></label>`).join('') +
    `<label class="fmt"><input type="checkbox" value="custom"><span>المقاس المخصص<small>من شريط المعاينة</small></span></label>`;
  $('#exportFormats').addEventListener('change', e => {
    try { localStorage.setItem(userKey('fmts'), JSON.stringify($$('#exportFormats input:checked').map(i => i.value))); } catch (err) { /* اختياري */ }
    // حددت مقاساً للتحميل: المعاينة تتحول له، فالمشاركة والنسخ والواتساب تطلع بنفس المقاس
    const t = e.target; if (t && t.checked) pickPreview(t.value, false);
    else { const first = $('#exportFormats input:checked'); if (first) pickPreview(first.value, false); }
  });
  // الواتساب: «دعوة» = صورة الحالة (ستوري)، «تسجيل» = صورة اليوتيوب — ثابت مهما كان المقاس المختار فوق
  const sendFmt = kind => getFormat(kind === 'record' ? 'youtube' : 'story');
  const selectedFormats = () => $$('#exportFormats input:checked').map(i => getFormat(i.value));

  const exportEl = $('#exportPoster');
  let fontCSS = null;
  async function getFontCSS() {
    if (fontCSS == null) {
      try { fontCSS = await htmlToImage.getFontEmbedCSS(posterEl); } catch (e) { fontCSS = ''; }
    }
    return fontCSS;
  }

  // متصفحات آبل (سفاري، وكل متصفحات الآيفون/الآيباد) قد ترسم الصورة قبل تحميل الصور الداخلية
  const IS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || (/Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(navigator.userAgent));
  const imgCacheBg = {};
  const loadImg = src => imgCacheBg[src] || (imgCacheBg[src] = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }));
  async function capture(s, f, scale) {
    render(exportEl, s, f);
    await settle(exportEl);
    fit(exportEl);
    await nextFrame();
    const ratio = f.w * scale > 6000 ? 1 : scale;
    const exact = f.layout === 'exact';
    let bg = null;
    if (exact) {
      // الخلفية الأصلية نرسمها بأنفسنا تحت طبقة النصوص (حتى لا تختفي في سفاري)
      try { bg = await loadImg(QPoster.EXACT_BG); exportEl.style.background = 'transparent'; } catch (e) { bg = null; }
    }
    const opts = {
      width: f.w, height: f.h, pixelRatio: ratio, fontEmbedCSS: await getFontCSS(),
      backgroundColor: bg ? undefined : '#ffffff', filter: n => !(n.classList && n.classList.contains('qp-safe'))
    };
    if (IS_WEBKIT) { try { await htmlToImage.toCanvas(exportEl, opts); await nextFrame(); } catch (e) { /* تسخين فقط */ } }
    const layer = await htmlToImage.toCanvas(exportEl, opts);
    if (!bg) return layer;
    const out = document.createElement('canvas'); out.width = layer.width; out.height = layer.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(bg, 0, 0, out.width, out.height);
    ctx.drawImage(layer, 0, 0);
    return out;
  }

  const canvasBlob = (c, type) => new Promise(r => c.toBlob(r, type === 'jpg' ? 'image/jpeg' : 'image/png', 0.93));
  const safeName = s => String(s || 'اعلان').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60) || 'اعلان';

  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function pdfPageSize(f) { return f.id === 'a4' ? [595.28, 841.89] : [f.w * 0.75, f.h * 0.75]; }
  function addPdfPage(doc, canvas, f, first) {
    const [w, h] = pdfPageSize(f);
    const o = w > h ? 'landscape' : 'portrait';
    if (!first) doc.addPage([w, h], o);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, w, h, undefined, 'FAST');
  }
  function newPdf(f) {
    const [w, h] = pdfPageSize(f);
    return new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  }

  // يصدّر مجموعة تصاميم × مقاسات؛ يعيد ملفات {name, blob}
  async function produce(items, fmts, type, scale) {
    const files = [];
    const total = items.length * fmts.length;
    let done = 0;
    const all = type === 'pdf' && items.length > 1 ? { doc: null } : null;
    for (const it of items) {
      let doc = null;
      for (const f of fmts) {
        overlay.progress(done / total, `جارٍ تجهيز ${done + 1} من ${total}: ${it.label} — ${f.name}`);
        const canvas = await capture(it.state, f, scale);
        if (type === 'pdf') {
          if (!doc) { doc = newPdf(f); addPdfPage(doc, canvas, f, true); } else addPdfPage(doc, canvas, f, false);
          if (all) { if (!all.doc) { all.doc = newPdf(f); addPdfPage(all.doc, canvas, f, true); } else addPdfPage(all.doc, canvas, f, false); }
        } else {
          files.push({ name: `${safeName(it.label)}/${f.id}-${f.w}x${f.h}.${type}`, blob: await canvasBlob(canvas, type) });
        }
        done++;
      }
      if (doc) files.push({ name: `${safeName(it.label)}.pdf`, blob: doc.output('blob') });
    }
    if (all && all.doc) files.push({ name: 'جميع-الإعلانات.pdf', blob: all.doc.output('blob') });
    overlay.progress(1);
    return files;
  }

  async function deliver(files, zipName) {
    // ملفات قليلة (مثل الصورة الأصلية + صورة اليوتيوب) تنزل منفصلة، والكثيرة في ZIP
    if (files.length <= 3) {
      for (const f of files) { saveBlob(f.blob, f.name.replace(/\//g, '-')); await new Promise(r => setTimeout(r, 450)); }
      return;
    }
    const zip = new JSZip();
    files.forEach(f => zip.file(f.name, f.blob));
    saveBlob(await zip.generateAsync({ type: 'blob' }), zipName);
  }

  async function runExport(items, zipName, { history = true } = {}) {
    const fmts = selectedFormats();
    if (!fmts.length) return toast('اختر مقاساً واحداً على الأقل', true);
    if (!items.length) return toast('لا توجد تصاميم للتحميل', true);
    const type = $('#exType').value, scale = +$('#exScale').value;
    overlay.show('جارٍ التجهيز...');
    try {
      const files = await produce(items, fmts, type, scale);
      await deliver(files, zipName);
      toast(`تم تجهيز ${files.length} ملف ✓`);
      if (history) {
        for (const it of items) await saveToHistory({ s: it.state === state ? state : it.state, quiet: true });
        toast(`تم تجهيز ${files.length} ملف ✓ — وحُفظ في السجل`);
      }
    } catch (e) {
      console.error(e);
      toast('حدث خطأ أثناء التحميل: ' + (e.message || e), true);
    } finally { overlay.hide(); }
  }

  $('#exCurrent').onclick = () => runExport([{ label: state.student || 'اعلان', state }], `${safeName(state.student)}.zip`);
  $('#exRows').onclick = () => {
    const items = selectedGridStates();
    if (!items.length) { $('#dataSheet').scrollIntoView({ behavior: 'smooth' }); return toast('حدد الأسطر من جدول البيانات (المربعات بجانب الأرقام)', true); }
    computeConflicts();
    const clashing = gridItems(true).filter(r => conflicts.has(r.i));
    if (clashing.length && !confirm(`🔴 فيه ${clashing.length} إعلان عليه تعارض، مثل السطر ${clashing[0].n}:\n${conflictText(clashing[0].i, conflicts.get(clashing[0].i))[0]}\n\nتكمل التحميل؟`)) return;
    const bad = gridItems(true).filter(r => missingOf(grid[r.i]).length);
    if (bad.length && !confirm(`فيه ${bad.length} إعلان ناقص (عليه ⚠️) مثل السطر ${bad[0].n}: ${missingOf(grid[bad[0].i]).join('، ')}.\nالخانات الناقصة تاخذ قيمتها من التصميم الحالي. تكمل التحميل؟`)) return;
    runExport(items, 'اعلانات-المناقشات.zip');
  };

  async function printState(s) { return printStates([s]); }
  // يطبع تصميماً أو عدة تصاميم (صفحة لكل تصميم)
  async function printStates(list) {
    overlay.show('جارٍ تجهيز الطباعة...');
    try {
      const imgs = [];
      for (let i = 0; i < list.length; i++) {
        overlay.progress(i / list.length, `جارٍ تجهيز ${i + 1} من ${list.length} للطباعة`);
        imgs.push((await capture(list[i], FORMATS[0], 2)).toDataURL('image/jpeg', .93));
      }
      const fr = document.createElement('iframe');
      fr.style.cssText = 'position:fixed;width:0;height:0;border:0';
      document.body.appendChild(fr);
      fr.contentDocument.write(`<html><head><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;height:100vh;object-fit:contain;display:block;page-break-after:always}img:last-child{page-break-after:auto}</style></head><body>${imgs.map(u => `<img src="${u}">`).join('')}</body></html>`);
      fr.contentDocument.close();
      fr.contentWindow.onafterprint = () => fr.remove();
      setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 400);
      return true;
    } catch (e) { toast('تعذّرت الطباعة', true); return false; } finally { overlay.hide(); }
  }
  $('#printBtn').onclick = async () => { if (await printState(state)) saveToHistory({ quiet: true }); };

  // ---------- سجل التصاميم (محفوظ في IndexedDB لكل موظف) ----------
  const HDB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('qu_history', 1);
        r.onupgradeneeded = () => { const st = r.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true }); st.createIndex('user', 'user'); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async tx(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction('items', mode), st = t.objectStore('items');
        const out = fn(st);
        t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
        t.onerror = () => rej(t.error);
      });
    },
    // على موقع Netlify: السجل في السحابة لكل حساب (نفس السجل من أي جهاز)؛ غير ذلك: هذا المتصفح
    cloud() { return !!(window.QCloud && window.QCloud.on); },
    put(item) { return this.cloud() ? QCloud.hist.put(item) : this.tx('readwrite', st => st.put(item)); },
    async get(id) { if (!this.cloud()) return this.tx('readonly', st => st.get(id)); return (await QCloud.hist.list()).find(x => String(x.id) === String(id)); },
    del(id) { return this.cloud() ? QCloud.hist.del(id) : this.tx('readwrite', st => st.delete(id)); },
    list() { return this.cloud() ? QCloud.hist.list() : this.tx('readonly', st => st.index('user').getAll(session.u.toLowerCase())); }
  };
  let editingId = null;
  const histSel = new Set();
  let histShown = [];
  try { editingId = JSON.parse(localStorage.getItem(userKey('editing'))) || null; } catch (e) { editingId = null; }
  const setEditing = (id, title) => {
    editingId = id;
    try { localStorage.setItem(userKey('editing'), JSON.stringify(id)); } catch (e) { /* اختياري */ }
    $('#editingLabel').textContent = id ? `تعدّل الآن: ${title || ''}` : 'تصميم جديد (غير محفوظ في السجل بعد)';
  };
  const titleOf = s => s.student || s.degree || 'تصميم بدون اسم';

  async function thumbOf(s) {
    const c = await capture(s, FORMATS[0], 0.3);
    return c.toDataURL('image/jpeg', 0.8);
  }

  // يحفظ التصميم في السجل: يحدّث النسخة التي تعدّلها، أو ينشئ نسخة جديدة
  async function saveToHistory({ asNew = false, s = state, quiet = false } = {}) {
    try {
      const now = Date.now();
      const existing = !asNew && s === state && editingId ? await HDB.get(editingId) : null;
      const item = existing || { user: session.u.toLowerCase(), createdAt: now, by: session.name || session.u };
      Object.assign(item, { title: titleOf(s), updatedAt: now, state: clone(s), thumb: await thumbOf(s),
        versions: (existing ? existing.versions || 1 : 0) + 1 });
      const id = await HDB.put(item);
      if (window.QDetails) QDetails.record(s);   // العنوان واللجنة لشاشة OBS (details.js)
      if (s === state) setEditing(id, item.title);
      if (window.QSuggest) QSuggest.refreshHistory();
      if (!quiet) toast(existing ? 'تم تحديث التصميم في السجل ✓' : 'تم الحفظ في السجل ✓');
      return id;
    } catch (e) { console.error(e); toast('تعذّر الحفظ في السجل', true); return null; }
  }

  // أول تشغيل بوجود رمز النشر: تفاصيل كل التصاميم الموجودة في السجل لشاشة OBS
  setTimeout(async () => { try { if (window.QDetails) QDetails.backfill(await HDB.list()); } catch (e) {} }, 4000);
  async function renderHistory() {
    const q = $('#histSearch').value.trim();
    let list = (await HDB.list()).sort((a, b) => b.updatedAt - a.updatedAt);
    if (q) list = list.filter(it => JSON.stringify([it.title, it.state.title, it.state.degree, it.state.date]).includes(q));
    $('#histCount').textContent = `(${list.length})`;
    histShown = list;
    const ids = new Set(list.map(it => it.id));
    [...histSel].forEach(id => { if (!ids.has(id)) histSel.delete(id); });
    updateHistSel();
    $('#histGrid').innerHTML = list.length ? list.map(it => `
      <div class="hcard ${it.id === editingId ? 'current' : ''} ${histSel.has(it.id) ? 'sel' : ''}" data-id="${it.id}">
        <label class="hcheck" title="تحديد"><input type="checkbox" data-sel ${histSel.has(it.id) ? 'checked' : ''}></label>
        <img src="${it.thumb}" alt="" data-act="edit">
        <div class="hmeta"><b title="${esc(it.title)}">${esc(it.title)}</b>
          <span>${esc(it.state.degree || '')}</span>
          <span>${new Date(it.updatedAt).toLocaleString('ar-SA')}${it.versions > 1 ? ` • عُدّل ${it.versions - 1} مرة` : ''}</span></div>
        <div class="hact">
          <button class="btn sm primary" data-act="edit">✏️ تعديل</button>
          <button class="btn sm" data-act="copy">📄 نسخة جديدة</button>
          <button class="btn sm" data-act="print">🖨️ طباعة</button>
          <button class="btn sm" data-act="dl">⬇️ تحميل</button>
          <button class="btn sm danger" data-act="del">🗑️</button>
        </div>
      </div>`).join('') : '<p class="hint">لا توجد تصاميم في السجل بعد. كل تصميم تحمّله أو تطبعه يُحفظ هنا تلقائياً، ويمكنك الحفظ يدوياً بزر «حفظ في السجل».</p>';
  }

  $('#btnHistory').onclick = () => { renderHistory(); openModal('#mHistory'); };
  $('#histSearch').addEventListener('input', renderHistory);
  function updateHistSel() {
    const n = histSel.size;
    $('#histSelCount').textContent = n ? `محدد: ${n}` : 'لم يتم تحديد شيء';
    ['#histDl', '#histPrint', '#histDel'].forEach(x => { $(x).disabled = !n; });
  }
  const selectedItems = async () => (await HDB.list()).filter(it => histSel.has(it.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  $('#histAll').onclick = () => { histShown.forEach(it => histSel.add(it.id)); renderHistory(); };
  $('#histNone').onclick = () => { histSel.clear(); renderHistory(); };
  $('#histDl').onclick = async () => {
    const items = (await selectedItems()).map(it => ({ label: it.title, state: normalize(it.state) }));
    $('#mHistory').classList.remove('open');
    runExport(items, 'اعلانات-المناقشات.zip', { history: false });
  };
  $('#histPrint').onclick = async () => {
    const list = (await selectedItems()).map(it => normalize(it.state));
    $('#mHistory').classList.remove('open'); printStates(list);
  };
  $('#histDel').onclick = async () => {
    if (!confirm(`حذف ${QN.design(histSel.size)} من السجل نهائياً؟`)) return;
    for (const id of histSel) { await HDB.del(id); if (id === editingId) setEditing(null); }
    histSel.clear(); renderHistory();
  };
  // نسخة احتياطية للسجل (لنقله لجهاز آخر أو حفظه)
  $('#histBackup').onclick = async () => {
    const list = await HDB.list();
    if (!list.length) return toast('السجل فارغ', true);
    saveBlob(new Blob([JSON.stringify({ type: 'qu-history', v: 1, items: list.map(({ id, user, ...r }) => r) })], { type: 'application/json' }),
      `سجل-التصاميم-${new Date().toISOString().slice(0, 10)}.json`);
  };
  $('#histRestore').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.type !== 'qu-history' || !Array.isArray(data.items)) throw new Error();
      for (const it of data.items) await HDB.put({ ...it, user: session.u.toLowerCase() });
      renderHistory(); toast(`تمت استعادة ${data.items.length} تصميم ✓`);
    } catch (err) { toast('ملف النسخة الاحتياطية غير صالح', true); }
    e.target.value = '';
  });
  $('#histGrid').addEventListener('change', e => {
    if (!e.target.matches('[data-sel]')) return;
    const card = e.target.closest('.hcard'), id = +card.dataset.id;
    if (e.target.checked) histSel.add(id); else histSel.delete(id);
    card.classList.toggle('sel', e.target.checked); updateHistSel();
  });
  $('#histGrid').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = +b.closest('.hcard').dataset.id, it = await HDB.get(id);
    if (!it) return;
    const act = b.dataset.act;
    if (act === 'edit') {
      state = normalize(it.state); setEditing(id, it.title); activeRow = -1; $$('#sheet tbody tr.active').forEach(t => t.classList.remove('active')); fillForm(); changed();
      $('#mHistory').classList.remove('open'); toast('فُتح التصميم للتعديل — التعديلات تُحفظ على نفس النسخة');
    } else if (act === 'copy') {
      state = normalize(it.state); setEditing(null); activeRow = -1; $$('#sheet tbody tr.active').forEach(t => t.classList.remove('active')); fillForm(); changed();
      await saveToHistory({ asNew: true, quiet: true });
      $('#mHistory').classList.remove('open'); toast('تم إنشاء نسخة جديدة — عدّل عليها كما تريد والأصل محفوظ');
    } else if (act === 'print') {
      $('#mHistory').classList.remove('open'); printState(normalize(it.state));
    } else if (act === 'dl') {
      $('#mHistory').classList.remove('open');
      runExport([{ label: it.title, state: normalize(it.state) }], `${safeName(it.title)}.zip`, { history: false });
    } else if (act === 'del' && confirm(`حذف «${it.title}» من السجل؟`)) {
      await HDB.del(id); if (id === editingId) setEditing(null); renderHistory();
    }
  });
  $('#btnSaveHist').onclick = () => saveToHistory();
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveToHistory(); }
  });
  $('#btnSaveCopy').onclick = () => saveToHistory({ asNew: true });
  // «➕ مناقشة جديدة» من النموذج: خانات المناقشة فاضية (لا بيانات نموذجية)، ومربوطة بسطر الإضافة في الجدول المشترك —
  // أول ما يكتب اسم الطالب تنضاف للجدول وتوصل للبث، والنصوص الثابتة (الكلية، القاعة، الرابط) تبقى
  $('#btnNew').onclick = () => {
    state = normalize();
    Object.assign(state, { degree: '', title: '', student: '', day: '', date: '', time: '', committeeLink: '', recordingLink: '',
      committee: [{ name: '', title: '', role: 'مشرفاً ومقرراً' }, { name: '', title: '', role: 'مناقشاً' }, { name: '', title: '', role: 'مناقشاً' }] });
    setEditing(null); ensureBlankTop(); activeRow = 0; rowSnap = gridOfState();
    renderGrid(); fillForm(); changed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const f = $('[data-k="student"]'); if (f) setTimeout(() => f.focus(), 400);
    toast('✏️ مناقشة جديدة: عبّ البيانات، وتنضاف للجدول وتوصل للبث تلقائياً');
  };

  // ---------- الإكسل وجوجل شيت ----------
  const FIELD_MAP = {
    'الكلية': 'college', 'سطر الافتتاح': 'college', 'college': 'college',
    'نص الإعلان': 'intro', 'الإعلان': 'intro', 'intro': 'intro',
    'الدرجة': 'degree', 'التخصص': 'degree', 'الدرجة والتخصص': 'degree', 'degree': 'degree',
    'من قبل': 'by', 'by': 'by',
    'العنوان': 'title', 'عنوان الرسالة': 'title', 'title': 'title',
    'الطالب': 'student', 'اسم الطالب': 'student', 'الطالبة': 'student', 'المقدم': 'student', 'student': 'student', 'name': 'student',
    'الدولة': 'country', 'الجنسية': 'country', 'دولة الطالب': 'country', 'country': 'country',
    'الجنس': 'gender', 'gender': 'gender',
    'اليوم': 'day', 'day': 'day', 'التاريخ': 'date', 'date': 'date', 'الوقت': 'time', 'time': 'time',
    'المكان': 'place', 'القاعة': 'place', 'place': 'place', 'ملاحظة المكان': 'placeNote', 'ملاحظة': 'placeNote', 'note': 'placeNote',
    'رابط البث': 'link', 'الرابط': 'link', 'link': 'link',
    'رابط اللجنة': 'committeeLink', 'رابط الزوم': 'committeeLink', 'رابط المناقش الخارجي': 'committeeLink', 'رابط خاص باللجنة': 'committeeLink',
    'رابط التسجيل': 'recordingLink', 'التسجيل': 'recordingLink',
    'الملاحظات': 'notes', 'ملاحظات': 'notes', 'notes': 'notes',
    'منسق الحجز': 'coordinator', 'اسم منسق الحجز': 'coordinator', 'المنسق': 'coordinator', 'coordinator': 'coordinator',
    'الكاتب': 'writer', 'كتبه': 'writer', 'writer': 'writer'
  };
  const normKey = k => String(k).replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[إأآ]/g, 'ا');
  const NMAP = Object.fromEntries(Object.entries(FIELD_MAP).map(([k, v]) => [normKey(k), v]));

  function parseRow(obj) {
    const data = {}, members = {};
    for (const [rawK, rawV] of Object.entries(obj)) {
      const v = String(rawV ?? '').trim();
      const k = normKey(rawK);
      const m = k.match(/^(?:عضو|member|m)\s*(\d+)\s*(.*)$/);
      if (m) {
        const idx = +m[1], part = m[2].trim();
        const key = /صفه|صفة|title|رتبه|رتبة/.test(part) ? 'title' : /دور|role/.test(part) ? 'role' : 'name';
        (members[idx] = members[idx] || {})[key] = v;
        continue;
      }
      if (NMAP[k]) data[NMAP[k]] = v;
    }
    const list = Object.keys(members).sort((a, b) => a - b).map(i => ({ name: '', title: '', role: '', ...members[i] }))
      .filter(x => x.name || x.title || x.role);
    if (list.length) data.committee = list;
    return data;
  }

  function applyRow(base, data) {
    const s = clone(base);
    for (const [k, v] of Object.entries(data)) {
      if (k === 'gender') {
        const female = /انث|أنث|طالبه|طالبة|^f|female|بنت/i.test(v);
        if (v) Object.assign(s, GENDER[female ? 'f' : 'm']);
      } else if (k === 'committee') s.committee = clone(v);
      else if (v !== '') s[k] = k === 'title' ? v.replace(/\s*\|\s*/g, '\n') : v;
    }
    return s;
  }

  // ---------- جدول البيانات (صف = إعلان) ----------
  // الكلية ونص الإعلان ثابتان في التصميم، فلا يحتاجان أعمدة
  const GCOLS = ['الدرجة', 'الجنس', 'الطالب', 'العنوان', 'اليوم', 'التاريخ', 'الوقت', 'المكان', 'ملاحظة المكان', 'رابط البث', 'رابط اللجنة', 'رابط التسجيل', 'الملاحظات', 'منسق الحجز', 'الكاتب'];
  const GFIELD = { 'الدرجة': 'degree', 'الجنس': 'gender', 'الطالب': 'student', 'العنوان': 'title',
    'اليوم': 'day', 'التاريخ': 'date', 'الوقت': 'time', 'المكان': 'place', 'ملاحظة المكان': 'placeNote', 'رابط البث': 'link',
    'رابط اللجنة': 'committeeLink', 'رابط التسجيل': 'recordingLink', 'الملاحظات': 'notes', 'منسق الحجز': 'coordinator', 'الكاتب': 'writer', 'الدولة': 'country' };
  const GMEM = 5;
  const PICK_COL = { 'اليوم': 'day', 'التاريخ': 'date', 'الوقت': 'time', 'الجنس': 'list:gender', 'الدرجة': 'list:degree',
    'المكان': 'list:place', 'ملاحظة المكان': 'list:placeNote', 'الملاحظات': 'list:notes', 'منسق الحجز': 'list:coord' };
  const pickOf = c => PICK_COL[c] || (/الصفة$/.test(c) ? 'list:mTitle' : /الدور$/.test(c) ? 'list:mRole' : '');
  for (let i = 1; i <= GMEM; i++) GCOLS.push(`عضو${i} الاسم`, `عضو${i} الصفة`, `عضو${i} الدور`);
  GCOLS.push('الدولة');   // دولة الطالب (اختياري): مخزّنة آخر عمود، وتنعرض في الجدول بعد «الطالب» مباشرة
  const DORD = (() => { const o = GCOLS.map((_, j) => j).filter(j => GCOLS[j] !== 'الدولة'); o.splice(o.indexOf(GCOLS.indexOf('الطالب')) + 1, 0, GCOLS.indexOf('الدولة')); return o; })();
  const emptyRow = () => GCOLS.map(() => '');
  let grid = [];
  try { grid = JSON.parse(localStorage.getItem(userKey('grid'))) || []; } catch (e) { grid = []; }
  // ترحيل جداول محفوظة بالشكل القديم (كان أول عمودين: الكلية، نص الإعلان)
  // ترحيل الجداول المحفوظة بإصدارات سابقة
  if (grid.length && +(localStorage.getItem(userKey('gridv')) || 0) < 3) {
    if (grid[0].length === 27) grid = grid.map(r => r.slice(2)); // كان فيه الكلية ونص الإعلان
    if (grid[0] && grid[0].length === 25) grid = grid.map(r => [...r.slice(0, 10), '', '', ...r.slice(10)]); // إضافة رابط اللجنة ورابط التسجيل
  }
  if (grid.length && +(localStorage.getItem(userKey('gridv')) || 0) < 4) // إضافة عمودي الملاحظات ومنسق الحجز
    grid = grid.map(r => r.length === 27 ? [...r.slice(0, 12), '', '', ...r.slice(12)] : r);
  if (grid.length && +(localStorage.getItem(userKey('gridv')) || 0) < 5) // إضافة عمود الكاتب بعد منسق الحجز
    grid = grid.map(r => r.length === 29 ? [...r.slice(0, 14), '', ...r.slice(14)] : r);
  try { localStorage.setItem(userKey('gridv'), '5'); } catch (e) { /* اختياري */ }
  const gridSel = new Set();
  // عمود «الكاتب» يتعبّى تلقائياً باسم المستخدم اللي كتب أو عدّل السطر (لا يُحسب في كون السطر فاضياً)
  const WCOL = GCOLS.indexOf('الكاتب');
  const isEmptyRow = r => r.every((v, i) => i === WCOL || !String(v || '').trim());
  const stamp = r => { if (r) r[WCOL] = isEmptyRow(r) ? '' : session.u; };
  const gridToObj = r => Object.fromEntries(GCOLS.map((c, i) => [c, r[i] || '']));
  function dataToGrid(d) {
    const r = emptyRow();
    GCOLS.forEach((c, i) => { const f = GFIELD[c]; if (f && d[f] != null) r[i] = String(d[f]).replace(/\r?\n/g, ' | '); });
    (d.committee || []).slice(0, GMEM).forEach((m, k) => {
      const base = GCOLS.indexOf(`عضو${k + 1} الاسم`);
      r[base] = m.name || ''; r[base + 1] = m.title || ''; r[base + 2] = m.role || '';
    });
    return r;
  }
  let gridSaveT;
  function gridChanged() {
    clearTimeout(gridSaveT);
    gridSaveT = setTimeout(() => {
      try { localStorage.setItem(userKey('grid'), JSON.stringify(grid)); } catch (e) { /* مساحة */ }
      syncRows();
      if (window.QSuggest) QSuggest.markDirty();
    }, 250);
  }
  // الإعلانات (الأسطر غير الفاضية) من الجدول؛ onlySel = المحددة فقط
  function gridItems(onlySel) {
    return grid.map((g, i) => (isEmptyRow(g) || (onlySel && !gridSel.has(i))) ? null : ({ n: i + 1, i, data: parseRow(gridToObj(g)) })).filter(Boolean);
  }
  function syncRows() {
    updateGridInfo();
    if (window.QCloud && QCloud.on) QCloud.rows(grid.filter(r => !isEmptyRow(r)).map(gridToObj));   // تظهر في OBS تلقائياً
  }
  function updateGridInfo() {
    const total = grid.filter(r => !isEmptyRow(r)).length, sel = gridItems(true).length;
    $('#gridCount').textContent = `(${total} إعلان)`;
    $('#gSelCount').textContent = sel ? `محدد: ${sel}` : '';
    const d = $('#gDel'); if (d) { d.disabled = !sel; const n = $('#gDelN'); if (n) n.textContent = sel ? ` (${sel})` : ''; }
  }
  // الاستيراد من ملف يضيف للجدول المشترك ولا يمسح شي (كان يستبدل الجدول كله عند الجميع بدون تأكيد)
  function setRows(list) {
    const rows = list.map(o => parseRow(o)).filter(d => !isWeekendRow(d)).map(d => dataToGrid(d)).filter(r => !isEmptyRow(r));
    if (!rows.length) return toast('لم يتم العثور على أعمدة مطابقة – استخدم الملف النموذجي', true);
    const key = r => String(r[CI('الطالب')] || '').trim() + '|' + String(r[CI('التاريخ')] || '').replace(/[^0-9]/g, '');
    const have = new Set(grid.filter(r => !isEmptyRow(r)).map(key));
    const add = rows.filter(r => !have.has(key(r))), dup = rows.length - add.length;
    if (!add.length) return toast(`كل الأسطر اللي في الملف موجودة في الجدول أصلاً (${QN.row(rows.length)}) — ما تغيّر شي`);
    if (!confirm(`بنضيف ${QN.row(add.length)} من الملف للجدول${dup ? ` (و${QN.row(dup)} موجودة أصلاً ما تتكرر)` : ''}.\nما ينحذف ولا يتغير أي شي موجود. نكمل؟`)) return;
    gridSnap('استيراد ملف');
    add.forEach(r => { if (!r[WCOL]) stamp(r); });
    const addSet = new Set(add);
    grid = sortRows(grid.filter(r => !isEmptyRow(r)).concat(add));
    gridSel.clear();
    grid.forEach((r, i) => { if (addSet.has(r)) gridSel.add(i); });
    try { localStorage.setItem(userKey('grid'), JSON.stringify(grid)); } catch (e) { /* مساحة */ }
    syncRows();
    renderGrid();
    $('#dataSheet').scrollIntoView({ behavior: 'smooth' });
    toast(`✓ أُضيف ${QN.row(add.length)} للجدول${dup ? ` — و${QN.row(dup)} موجودة أصلاً` : ''}`);
  }

  // ---------- فواصل الأسابيع (إجازة أسبوعية: الجمعة والسبت) ----------
  const WK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const wkCache = new Map();
  const weeksOn = () => { try { return localStorage.getItem(userKey('weeks')) !== '0'; } catch (e) { return true; } };
  function weekOf(r) { // رقم الأسبوع (يبدأ الأحد) من التاريخ الهجري
    const d = String(r[CI('التاريخ')] || '').trim(); if (!d) return null;
    if (!wkCache.has(d)) {
      const g = hijriToGreg(d); let w = null;
      if (g) { const [y, m, dd] = g.split('/').map(Number); w = Math.floor((Date.UTC(y, m - 1, dd) / 864e5 - 3) / 7); }
      wkCache.set(d, w);
    }
    return wkCache.get(d);
  }
  function hijriOfDay(n) { // n = أيام منذ 1970/1/1
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(n * 864e5 + 432e5));
    const g = t => parseInt((parts.find(p => p.type === t) || {}).value, 10);
    return `${g('year')}/${g('month')}/${g('day')} هـ`;
  }
  // الفاصل المطلوب قبل السطر i (أو null)
  function weekBreak(i) {
    if (!weeksOn() || !i) return null;
    const w = weekOf(grid[i]); if (w == null) return null;
    let j = i - 1; while (j >= 0 && weekOf(grid[j]) == null) j--;
    if (j < 0) return null;
    const pw = weekOf(grid[j]); if (pw == null || w === pw) return null;
    const lo = Math.min(w, pw), hi = Math.max(w, pw);       // الجدول من الأحدث للأقدم: الإجازة بعد الأسبوع الأقدم
    const fri = lo * 7 + 3 + 5, sat = fri + 1;
    return { fri: hijriOfDay(fri), sat: hijriOfDay(sat), gap: hi - lo - 1 };
  }
  const weekRows = b => [['الجمعة', b.fri], ['السبت', b.sat]].map(([d, h]) => { const r = emptyRow(); r[CI('اليوم')] = d; r[CI('التاريخ')] = h; r[CI('الملاحظات')] = 'إجازة أسبوعية'; return r; });
  const isWeekendRow = o => /[اأإ]جاز/.test(o.notes || '') && !o.student && !o.title && !o.degree;
  // تصدير الجدول: مع أسطر «إجازة أسبوعية» إذا كانت الفواصل مفعّلة
  function exportAoa() {
    const out = [GCOLS];
    grid.forEach((r, i) => { if (isEmptyRow(r)) return; const b = weekBreak(i); if (b) out.push(...weekRows(b)); out.push(r); });
    return out;
  }

  // أول الجدول دايماً سطر فاضي جاهز: الموظف يكتب مناقشة جديدة فيه على طول بدون أي زر
  function ensureBlankTop() {
    if (grid.length && isEmptyRow(grid[0])) return false;
    grid.unshift(emptyRow());
    try { if (activeRow >= 0) activeRow++; const s = [...gridSel]; gridSel.clear(); s.forEach(i => gridSel.add(i + 1)); } catch (e) { /* قبل التهيئة */ }
    return true;
  }
  // المناقشات المنتهية مخفية افتراضياً: الجدول خفيف (بدل آلاف الخانات) ويعرض اللي يهم الموظف — زر «عرض المنتهية» يظهرها
  let pastOn = false;   // المنتهية مخفية دايماً عند فتح الصفحة (أريح للعين)؛ «📜 عرض المنتهية» يظهرها لين تسكّر الصفحة
  const pastShown = () => pastOn;
  // المنتهية تُعرض بدفعات (الأحدث أولاً) والبحث يشمل الكل — حتى لا يرسم الجدول آلاف الخانات مرة وحدة
  const PAST_STEP = 50, FIND_MAX = 120;
  const FIND_COLS = GCOLS.map((c, j) => /^(الطالب|العنوان|الدرجة|عضو\d+ الاسم)$/.test(c) ? j : -1).filter(j => j >= 0);   // البحث: الطالب والعنوان والدرجة وأسماء اللجنة
  let pastLimit = PAST_STEP, pastVis = new Set(), findQ = '', findHits = null;
  const fnorm = v => String(v || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, '');
  function planRows() {
    pastVis = new Set(); findHits = null;
    const q = fnorm(findQ);
    if (q) {
      findHits = new Set();
      for (let i = 0; i < grid.length && findHits.size < FIND_MAX; i++) if (!isEmptyRow(grid[i]) && fnorm(FIND_COLS.map(j => grid[i][j] || '').join(' ')).includes(q)) findHits.add(i);
      return;
    }
    if (!pastShown()) return;
    grid.map((r, i) => [isPast(r) ? gridDateKey(r) : -1, i]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .slice(0, pastLimit).forEach(x => pastVis.add(x[1]));
  }
  const hideRow = (r, i) => {
    if (i === 0 && isEmptyRow(r)) return false;                              // سطر الإضافة الجاهز
    if (gridSel.has(i) || i === activeRow) return false;
    if (findHits) return !findHits.has(i);
    return isPast(r) && !pastVis.has(i);
  };
  function pastBtn() {
    const b = $('#gShowPast'), more = $('#gMorePast'), info = $('#gFindInfo'); if (!b) return;
    const n = grid.filter(r => isPast(r)).length;
    b.hidden = !n || !!findHits; b.textContent = pastShown() ? `🙈 إخفاء المنتهية` : `📜 عرض المنتهية (${n})`;
    if (more) { const left = n - pastVis.size; more.hidden = !pastShown() || !!findHits || left <= 0; more.textContent = `⬇️ عرض أقدم (باقي ${left} — أو انزل لآخر الجدول)`; }
    if (info) info.textContent = findHits ? (findHits.size ? `النتائج: ${findHits.size}${findHits.size >= FIND_MAX ? ' (أول النتائج — دقّق البحث)' : ''}` : 'ما فيه نتائج — جرّب جزء من الاسم') : '';
  }
  // عرض كل عمود على قد أطول نص فيه (الاسم والدرجة والصفة ما تنقص) — بحد أدنى وأعلى، والعنوان والروابط بعرضها الثابت
  function fitColumns() {
    const T = $('#sheet'); if (!T) return;
    const first = T.querySelector('tbody input[type=text]'); if (!first) return;
    const cs = getComputedStyle(first), ctx = (fitColumns.c = fitColumns.c || document.createElement('canvas').getContext('2d'));
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 10, rules = [];
    GCOLS.forEach((c, j) => {
      if (/العنوان|رابط|الكاتب/.test(c)) return;
      let w = 0; T.querySelectorAll(`tbody input[data-c="${j}"]`).forEach(i => { const v = i.value || i.placeholder || ''; if (v) w = Math.max(w, ctx.measureText(v).width); });
      const px = Math.min(420, Math.max(/الجنس|اليوم|الوقت|الدور/.test(c) ? 90 : 120, Math.ceil(w + pad)));
      rules.push(`#sheet input[data-c="${j}"]{width:${px}px}`);
    });
    let st = document.getElementById('fitCols'); if (!st) { st = document.createElement('style'); st.id = 'fitCols'; document.head.appendChild(st); }
    st.textContent = rules.join('\n');
  }
  function renderGrid() {
    ensureBlankTop(); planRows();
    computeConflicts();
    const cls = c => /العنوان/.test(c) ? 'w-title' : /رابط/.test(c) ? 'w-link' : c === 'الكاتب' ? 'w-sm w-auto' : /الجنس|اليوم|الوقت|الدور/.test(c) ? 'w-sm' : '';
    $('#sheet').innerHTML = `<thead><tr><th class="n">#</th><th class="act">عرض / نسخ</th>${DORD.map(j => GCOLS[j]).map(c => `<th class="${/^عضو/.test(c) ? 'mem' : ''}">${c}</th>`).join('')}</tr></thead>
      <tbody>${grid.map((r, i) => hideRow(r, i) ? '' : `${(b => b ? `<tr class="wk-sep"><td colspan="${GCOLS.length + 2}"><span>🌙 إجازة أسبوعية</span> الجمعة ${b.fri} · السبت ${b.sat}${b.gap ? ` <small>(بعدها ${b.gap === 1 ? 'أسبوع' : QN.week(b.gap)} بدون مناقشات)</small>` : ''}</td></tr>` : '')(weekBreak(i))}<tr data-r="${i}" class="${gridSel.has(i) ? 'sel' : ''} ${i === activeRow ? 'active' : ''} ${missingOf(r).length ? 'incomplete' : ''} ${isPast(r) ? 'past' : ''} ${conflicts.has(i) ? 'conflict' : ''}"><td class="n"><label><input type="checkbox" data-gsel ${gridSel.has(i) ? 'checked' : ''}>${i + 1}</label>${warnHtml(r)}${conflictHtml(i)}</td><td class="act"><button data-view title="عرض في التصميم">👁</button><button data-dl title="تحميل صورة الإعلان (بالمقاس المحدد في «التحميل»)">⬇️</button><button data-dup title="تكرار السطر (نفس اللجنة لطالب آخر)">⧉</button><button data-log title="سجل التعديلات: مين أضافها ومين عدّلها ومتى">🕘</button><button data-msg="invite" class="msg-b" title="نسخ رسالة الدعوة (الإرسال من 💬 اللي جنبه)">دعوة</button><button data-wa="invite" class="wa-i" title="إرسال الدعوة بالواتساب">💬</button><button data-msg="record" class="msg-b ${r[GCOLS.indexOf('رابط التسجيل')] ? 'has' : ''}" title="نسخ رسالة التسجيل (الإرسال من 💬 اللي جنبه)">تسجيل</button><button data-wa="record" class="wa-i" title="إرسال التسجيل بالواتساب">💬</button></td>${
        DORD.map(j => [GCOLS[j], j]).map(([c, j]) => `<td><input type="text" class="${cls(c)}" data-c="${j}" value="${esc(r[j] || '')}"${pickOf(c) ? ` inputmode="none" data-pick="${pickOf(c)}"` : ''}${c === 'الدولة' ? ' list="qCountries" placeholder="الدولة (اختياري)"' : ''}${c === 'الكاتب' ? ' readonly tabindex="-1" title="يتعبّى تلقائياً باسم المستخدم اللي كتب السطر أو عدّله آخر مرة"' : ''}${c === 'رابط البث' ? ' dir="ltr" placeholder="يوتيوب (افتراضي)"' : c === 'رابط اللجنة' ? ' dir="ltr" placeholder="زوم (اختياري)"' : c === 'رابط التسجيل' ? ' dir="ltr" placeholder="بعد المناقشة"' : ''}></td>`).join('')}</tr>`).join('')}</tbody>`;
    updateGridInfo(); pastBtn(); try { if (presence.length) paintPresence(); } catch (e) { /* قبل التهيئة */ }
    fitColumns();
    // الجوال: أول ما ينفتح الجدول يتحرك أفقياً لين تبان خانة «الطالب» في سطر الإضافة (بدل ما تكون برّا الشاشة)
    if (!renderGrid._sx && matchMedia('(max-width: 760px)').matches) {
      const w = $('.gridwrap'), c = $(`#sheet tr[data-r="0"] input[data-c="${CI('الطالب')}"]`);
      if (w && c) { renderGrid._sx = true; let n = 0; const go = () => { const a = w.getBoundingClientRect(), b = c.getBoundingClientRect();
        if (!a.width || !b.width) { if (n++ < 10) setTimeout(go, 400); return; }       // الصفحة ما انرسمت بعد: نعيد المحاولة
        w.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2); }; setTimeout(go, 300); }
    }
    { const nr = $('#sheet tr[data-r="0"]'), si = nr && nr.querySelector(`input[data-c="${GCOLS.indexOf('الطالب')}"]`);
      if (nr && isEmptyRow(grid[0])) { nr.classList.add('newrow'); if (si) { si.placeholder = '✏️ اكتب هنا للمناقشة الجديدة'; si.title = 'اكتب اسم الطالب هنا لإضافة مناقشة جديدة'; } } }
    const b = $('#gConflicts'); if (b) { b.hidden = !conflicts.size; b.textContent = `🔴 ${QN.row(conflicts.size)} ${conflicts.size === 1 ? 'فيه' : 'فيها'} تعارض`; }
    formConflictCheck();
  }
  let activeRow = -1, rowSnap = null;
  const gridOfState = () => dataToGrid({ ...state, gender: /طالبة/.test(state.by || '') ? 'أنثى' : 'ذكر' });
  // الحقول الأساسية لكل إعلان؛ السطر الناقص يظهر عليه ⚠️
  const REQUIRED = ['الطالب', 'الدرجة', 'العنوان', 'التاريخ', 'الوقت', 'المكان', 'عضو1 الاسم'];
  // المناقشات التي مضى تاريخها لا تحتاج تنبيهات (لا نقص ولا تعارض)
  const TODAY_H = todayHijri();
  function isPast(r) {
    const m = toLatin(r[CI('التاريخ')] || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return !!m && TODAY_H > 0 && +m[1] * 10000 + +m[2] * 100 + +m[3] < TODAY_H;
  }
  // خيار «تنبيهات المنتهية»: إذا كان مفعّلاً تظهر «ناقص» و«تعارض» على المناقشات المنتهية أيضاً
  const showPast = () => { try { return localStorage.getItem(userKey('pastwarn2')) !== '0'; } catch (e) { return true; } }; // مفعّل افتراضياً
  const quiet = r => isPast(r) && !showPast();
  function missingOf(r) { return isEmptyRow(r) || quiet(r) ? [] : REQUIRED.filter(c => !String(r[GCOLS.indexOf(c)] || '').trim()); }
  // اليوم المكتوب ما يوافق التاريخ الهجري (مثل «الأحد» و1448/6/4 سبت)
  function dayMismatch(r) {
    const d = r[CI('اليوم')], h = r[CI('التاريخ')]; if (!d || !h || quiet(r)) return '';
    const g = hijriToGreg(h); if (!g) return '';
    const [y, m, dd] = g.split('/').map(Number), real = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
    return nrm(d).replace(/^ال/, '') === nrm(real).replace(/^ال/, '') ? '' : real;
  }
  function warnHtml(r) {
    const real = dayMismatch(r), dw = real ? ` <button class="chip warn" data-why="${esc(`اليوم مكتوب «${r[CI('اليوم')]}» لكن تاريخ ${r[CI('التاريخ')]} يوافق يوم ${real}`)}">اليوم؟</button>` : '';
    return warnHtml0(r) + dw;
  }
  function warnHtml0(r) { const m = missingOf(r); return m.length ? ` <button class="chip warn" data-why="${esc('ناقص لتصميم الإعلان: ' + m.join('، '))}">ناقص</button>` : ''; }
  function updRowWarn(i) {
    const tr = $(`#sheet tr[data-r="${i}"]`); if (!tr) return;
    const td = tr.querySelector('td.n'); const w = td.querySelector('.warn'); if (w) w.remove();
    td.insertAdjacentHTML('beforeend', warnHtml(grid[i]));
    tr.classList.toggle('incomplete', missingOf(grid[i]).length > 0);
  }

  // ---------- كشف التعارضات (نفس اليوم والوقت والقاعة، أو نفس العضو) ----------
  const toLatin = v => String(v || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const nrm = v => toLatin(v).replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
  function dateKey(v) { const m = toLatin(v).match(/(\d{3,4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? `${+m[1]}-${+m[2]}-${+m[3]}` : nrm(v); }
  function timeMin(v) {
    const t = toLatin(v); const m = t.match(/(\d{1,2})(?::(\d{2}))?/); if (!m) return null;
    let h = +m[1]; const mi = +(m[2] || 0);
    if (/مساء|(^|\s)م($|\s)/.test(t) && h < 12) h += 12;
    else if (/ظهر/.test(t) && h >= 1 && h <= 5) h += 12;
    else if (!/صباح|(^|\s)ص($|\s)/.test(t) && h >= 1 && h <= 5) h += 12; // بدون تحديد: 1-5 بعد الظهر
    return h * 60 + mi;
  }
  const REMOTE = v => /عن\s*بعد|اونلاين|أونلاين|افتراضي|بلاك\s*بورد|blackboard|zoom|زوم|تيمز/i.test(v || '');
  const CI = name => GCOLS.indexOf(name);
  function slotOf(r) {
    if (!r || isEmptyRow(r)) return null;
    const date = dateKey(r[CI('التاريخ')]); if (!date) return null;
    const timeRaw = r[CI('الوقت')], place = r[CI('المكان')];
    const members = [];
    for (let k = 1; k <= GMEM; k++) { const n = nrm(r[CI(`عضو${k} الاسم`)]); if (n) members.push([n, r[CI(`عضو${k} الاسم`)]]); }
    // الفاضي = قناة اليوتيوب الافتراضية، إلا المناقشة عن بعد: لها اجتماعها الخاص (زوم/بلاك بورد) فلا تتعارض مع غيرها
    const link = String(r[CI('رابط البث')] || '').trim() || (REMOTE(place) ? '' : DEFAULTS.link);
    return { date, t: timeMin(timeRaw), timeRaw: nrm(timeRaw), place: REMOTE(place) ? '' : nrm(place), placeRaw: place, student: r[CI('الطالب')], members,
      linkKey: link.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, ''), platform: QPoster.platformOf(link).name,
      zoomKey: String(r[CI('رابط اللجنة')] || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, '') };
  }
  function clash(a, b) {
    if (!a || !b || a.date !== b.date) return null;
    // تعارض فقط إذا كان الفرق أقل من ساعة (9 و10 مثلاً ما يتعارضان)
    const near = (a.t != null && b.t != null) ? Math.abs(a.t - b.t) < 60 : (a.timeRaw && a.timeRaw === b.timeRaw);
    if (!near) return null;
    const exact = (a.t != null && b.t != null) ? a.t === b.t : true;
    const out = [];
    if (a.place && a.place === b.place) out.push({ kind: 'hall', exact });
    // البث: يتعارض فقط إذا كان نفس الرابط (مثل قناة اليوتيوب نفسها). منصتان مختلفتان = لا تعارض
    if (a.linkKey && a.linkKey === b.linkKey) out.push({ kind: 'stream', exact, platform: a.platform });
    if (a.zoomKey && a.zoomKey === b.zoomKey) out.push({ kind: 'zoom', exact });
    const bm = new Map(b.members);
    a.members.forEach(([n, raw]) => { if (bm.has(n)) out.push({ kind: 'member', exact, name: raw }); });
    return out.length ? out : null;
  }
  let conflicts = new Map(); // رقم السطر → [{other, kind, exact, name}]
  function computeConflicts() {
    conflicts = new Map();
    const slots = grid.map(r => quiet(r) ? null : slotOf(r));
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      if (!slots[i] || !slots[j]) continue;
      const c = clash(slots[i], slots[j]); if (!c) continue;
      c.forEach(x => {
        (conflicts.get(i) || conflicts.set(i, []).get(i)).push({ ...x, other: j });
        (conflicts.get(j) || conflicts.set(j, []).get(j)).push({ ...x, other: i });
      });
    }
    return conflicts;
  }
  function conflictText(i, list) {
    return list.map(x => {
      const o = grid[x.other] || [], who = o[CI('الطالب')] || 'بدون اسم';
      const when = x.exact ? 'نفس اليوم والوقت' : 'نفس اليوم بوقت متقارب';
      if (x.kind === 'hall') return `تعارض مع السطر ${x.other + 1} «${who}»: ${when} في ${o[CI('المكان')] || 'نفس القاعة'} (${o[CI('الوقت')] || ''})`;
      if (x.kind === 'zoom') return `رابط اللجنة مشغول: السطر ${x.other + 1} «${who}» يستخدم نفس رابط الزوم — ${when}`;
      if (x.kind === 'stream') return `رابط البث مشغول: السطر ${x.other + 1} «${who}» يبث على نفس رابط ${x.platform} — ${when} (${o[CI('الوقت')] || ''})`;
      return `${x.name} في لجنتين: السطر ${x.other + 1} «${who}» — ${when}`;
    });
  }
  function conflictHtml(i) {
    const list = conflicts.get(i); if (!list) return '';
    return ` <button class="chip conf" data-why="${esc(conflictText(i, list).join('\n'))}">تعارض</button>`;
  }
  function refreshConflicts() {
    computeConflicts();
    $$('#sheet tbody tr').forEach(tr => {
      const i = +tr.dataset.r, td = tr.querySelector('td.n'); if (!td) return;
      const old = td.querySelector('.conf'); if (old) old.remove();
      td.insertAdjacentHTML('beforeend', conflictHtml(i));
      tr.classList.toggle('conflict', conflicts.has(i));
    });
    const rowsWith = conflicts.size;
    const b = $('#gConflicts');
    if (b) { b.hidden = !rowsWith; b.textContent = `🔴 ${QN.row(rowsWith)} ${rowsWith === 1 ? 'فيه' : 'فيها'} تعارض`; }
    formConflictCheck();
  }
  let confT;
  function refreshConflictsSoon(editedRow) {
    clearTimeout(confT);
    confT = setTimeout(() => {
      const before = new Set((conflicts.get(editedRow) || []).map(x => x.other + x.kind));
      refreshConflicts();
      const now = conflicts.get(editedRow) || [];
      const fresh = now.filter(x => !before.has(x.other + x.kind));
      if (editedRow != null && fresh.length) toast('⚠️ ' + conflictText(editedRow, fresh)[0], true);
    }, 350);
  }
  // فحص التصميم الحالي (النموذج) مقابل الجدول
  function formConflictCheck() {
    const box = $('#formConflict'); if (!box) return;
    const me = slotOf(dataToGrid({ ...state, gender: '', link: state.opt && state.opt.qr ? state.link : '' }));
    const hits = [];
    grid.forEach((r, i) => {
      if (i === activeRow || quiet(r)) return;
      const c = clash(me, slotOf(r)); if (!c) return;
      const who = r[CI('الطالب')] || 'بدون اسم';
      if (nrm(who) === nrm(state.student)) return; // نفس الإعلان
      c.forEach(x => hits.push(x.kind === 'hall' ? `السطر ${i + 1} «${who}» في نفس ${x.exact ? 'اليوم والوقت' : 'اليوم بوقت متقارب'} بـ${r[CI('المكان')]}`
        : x.kind === 'stream' ? `السطر ${i + 1} «${who}» يبث على نفس رابط ${x.platform} بنفس الوقت`
        : x.kind === 'zoom' ? `السطر ${i + 1} «${who}» يستخدم نفس رابط اللجنة بنفس الوقت`
        : `${x.name} مسجّل في لجنة السطر ${i + 1} «${who}» بنفس الوقت`));
    });
    box.hidden = !hits.length;
    box.innerHTML = hits.length ? '⚠️ <b>تعارض في جدول البيانات:</b><br>' + hits.slice(0, 4).map(esc).join('<br>') : '';
  }
  const cellAt = (r, c) => $(`#sheet tr[data-r="${r}"] input[data-c="${c}"]`);

  // تحليل نص منسوخ من Excel/Sheets (مفصول بـ Tab ويدعم الخلايا بين علامات تنصيص)
  function parseTSV(t) {
    const out = [[]]; let cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { out[out.length - 1].push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; out[out.length - 1].push(cell); cell = ''; out.push([]); }
      else cell += ch;
    }
    out[out.length - 1].push(cell);
    while (out.length && out[out.length - 1].every(v => v === '')) out.pop();
    return out.map(r => r.map(v => v.replace(/\r?\n/g, ' | ').trim()));
  }

  $('#btnSheet').onclick = () => $('#dataSheet').scrollIntoView({ behavior: 'smooth' });
  $('#sheet').addEventListener('click', e => {
    const dup = e.target.closest('[data-dup]');
    if (dup) {
      const r = +dup.closest('tr').dataset.r;
      if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
      gridSnap('تكرار سطر'); const copy = grid[r].slice();
      ['الطالب', 'العنوان', 'الجنس'].forEach(c => { copy[GCOLS.indexOf(c)] = ''; }); stamp(copy);
      grid.splice(r + 1, 0, copy);
      const shifted = [...gridSel].map(i => i > r ? i + 1 : i); gridSel.clear(); shifted.forEach(i => gridSel.add(i));
      if (activeRow > r) activeRow++;
      renderGrid(); gridChanged();
      const st = cellAt(r + 1, GCOLS.indexOf('الطالب')); if (st) st.focus();
      return toast('تم تكرار السطر — اكتب اسم الطالب والعنوان الجديد');
    }
    // ⬇️ تحميل صورة إعلان السطر مباشرة — بالمقاس والنوع المحددين في قسم «التحميل» (الافتراضي الإعلان الرسمي PNG)
    const dlb = e.target.closest('[data-dl]');
    if (dlb) {
      const r = +dlb.closest('tr').dataset.r;
      if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
      const st = rowMsgState(r);
      return runExport([{ label: st.student || 'اعلان', state: st }], `${safeName(st.student || 'اعلان')}.zip`, { history: false });
    }
    if (!e.target.closest('[data-view]')) return;
    const r = +e.target.closest('tr').dataset.r;
    if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
    const data = parseRow(gridToObj(grid[r]));
    // عرض سطر = تصميم مستقل مرتبط بالسطر: نفك الارتباط بنسخة السجل اللي كانت مفتوحة حتى ما ينكتب السطر الجديد فوقها
    if (editingId && histAutoT) { clearTimeout(histAutoT); saveToHistory({ quiet: true }); }   // تعديل لسا ما انحفظ في التصميم المفتوح: نحفظه قبل نفك الارتباط
    clearTimeout(histAutoT); setEditing(null);
    const clean0 = { ...state, country: '', degree: '', title: '', student: '', day: '', date: '', time: '', place: DEFAULTS.place, placeNote: DEFAULTS.placeNote, link: DEFAULTS.link,
      committeeLink: '', recordingLink: '', notes: '', committee: [] };
    state = applyRow(clean0, data); activeRow = r;
    $('#editingLabel').textContent = `يعرض سطر الجدول: ${data.student || 'السطر ' + (r + 1)}`;
    rowSnap = gridOfState();
    $$('#sheet tbody tr').forEach(tr => tr.classList.toggle('active', +tr.dataset.r === r));
    fillForm(); changed();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`يعرض الآن: ${data.student || 'السطر ' + (r + 1)}`);
  });
  $('#sheet').addEventListener('input', e => {
    const inp = e.target; if (!inp.dataset.c) return;
    const r = +inp.closest('tr').dataset.r;
    grid[r][+inp.dataset.c] = inp.value;
    stamp(grid[r]); const wc = cellAt(r, WCOL); if (wc) wc.value = grid[r][WCOL];
    updRowWarn(r);
    refreshConflictsSoon(r);
    gridChanged();
  });
  // كتابة اسم الطالب في الجدول تعبّي الجنس تلقائياً (إذا كان فاضياً)
  $('#sheet').addEventListener('focusout', e => {
    const inp = e.target; if (!inp.dataset || +inp.dataset.c !== GCOLS.indexOf('الطالب') || !inp.value.trim()) return;
    const g = inp.closest('tr').querySelector(`input[data-c="${GCOLS.indexOf('الجنس')}"]`);
    if (g && !g.value.trim()) { g.value = guessGender(inp.value); g.dispatchEvent(new Event('input', { bubbles: true })); }
    const co = inp.closest('tr').querySelector(`input[data-c="${GCOLS.indexOf('منسق الحجز')}"]`), me = QSuggest.last('coord');
    if (co && !co.value.trim() && me) { co.value = me; co.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  $('#sheet').addEventListener('click', e => { // شرح علامة «ناقص» أو «تعارض» عند الضغط
    const c = e.target.closest('[data-why]'); if (!c) return;
    e.preventDefault(); e.stopPropagation(); toast(c.dataset.why, c.classList.contains('conf'));
  }, true);
  $('#sheet').addEventListener('change', e => {
    if (!e.target.matches('[data-gsel]')) return;
    const tr = e.target.closest('tr'), r = +tr.dataset.r;
    if (e.target.checked) gridSel.add(r); else gridSel.delete(r);
    tr.classList.toggle('sel', e.target.checked);
    updateGridInfo();
  });
  $('#sheet').addEventListener('paste', e => {
    const inp = e.target; if (!inp.dataset || inp.dataset.c == null) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return; // لصق قيمة واحدة: يتصرف طبيعياً
    e.preventDefault();
    gridSnap('لصق'); cellSnapPending = false;
    let data = parseTSV(text);
    const r0 = +inp.closest('tr').dataset.r;
    let map = null; // إذا كان أول سطر عناوين، نرتّب الأعمدة حسب أسمائها
    const norm = v => normKey(v).replace(/عضو\s*(\d+)/, 'عضو$1');
    const hdr = data[0].map(h => GCOLS.findIndex(c => norm(c) === norm(h) || NMAP[norm(h)] && NMAP[norm(h)] === GFIELD[c]));
    if (hdr.filter(i => i >= 0).length >= 2) { map = hdr; data = data.slice(1); }
    const c0 = map ? 0 : +inp.dataset.c;
    // أسطر «إجازة أسبوعية» من ملف مصدَّر لا تُلصق
    const noteCol = map ? map.indexOf(CI('الملاحظات')) : CI('الملاحظات') - c0, stuCol = map ? map.indexOf(CI('الطالب')) : CI('الطالب') - c0;
    data = data.filter(v => !(/[اأإ]جاز/.test(v[noteCol] || '') && !String(v[stuCol] || '').trim()));
    if (!data.length) return toast('ما فيه أسطر مناقشات في المنسوخ');
    // لصق عدة أسطر فوق مناقشات موجودة: ما نكتب فوقها — تنضاف كأسطر جديدة أول الجدول
    let start = r0, asNew = false;
    if (data.length > 1 && data.some((_, k) => grid[r0 + k] && !isEmptyRow(grid[r0 + k]))) {
      grid = grid.filter(r => !isEmptyRow(r));                     // سطر الإضافة الفاضي يرجع لحاله بعد اللصق
      for (let k = 0; k < data.length; k++) grid.unshift(emptyRow());
      start = 0; asNew = true; gridSel.clear(); activeRow = -1;     // الأرقام تحركت: لا نحذف/نعدّل سطراً غلط
    }
    data.forEach((vals, k) => {
      const r = start + k;
      while (grid.length <= r) grid.push(emptyRow());
      vals.forEach((v, j) => {
        const col = map ? map[j] : c0 + j;
        if (col >= 0 && col < GCOLS.length && col !== WCOL) grid[r][col] = v;
      });
      stamp(grid[r]);
    });
    renderGrid(); gridChanged(); autoSort();
    toast(asNew ? `✓ أُضيفت أسطر جديدة أول الجدول (${data.length}) — وما انكتب فوق المناقشات الموجودة` : `تم لصق ${QN.row(data.length)} ✓`);
  });
  $('#sheet').addEventListener('keydown', e => {
    const inp = e.target; if (inp.dataset.c == null) return;
    const r = +inp.closest('tr').dataset.r, c = +inp.dataset.c;
    let to = null;
    if (e.key === 'Enter' || e.key === 'ArrowDown') to = r + 1;
    else if (e.key === 'ArrowUp') to = r - 1;
    if (to == null) return;
    e.preventDefault();
    if (to < 0) return;
    if (to >= grid.length) { grid.push(emptyRow()); renderGrid(); }
    const nx = cellAt(to, c); if (nx) { nx.focus(); nx.select(); }
  });
  function addOnTop() {
    if (!ensureBlankTop() && !$('#sheet tr.newrow')) grid.unshift(emptyRow());
    gridSel.clear(); activeRow = -1; renderGrid();
    const w = $('.gridwrap'); if (w) w.scrollTo({ top: 0, behavior: 'smooth' });
    const tr = $('#sheet tr[data-r="0"]'), inp = tr && tr.querySelector(`input[data-c="${CI('الطالب')}"]`);
    if (tr) { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1600); }
    if (inp) setTimeout(() => inp.focus(), 350);
    toast('➕ سطر جديد في أول الجدول — اكتب اسم الطالب، ثم بقية الخانات. ينحفظ تلقائياً');
  }
  $('#gAdd').onclick = addOnTop;
  { const b = $('#gNew'); if (b) b.onclick = addOnTop; }
  // «💾 حفظ»: تأكيد — الحفظ التلقائي شغال دايماً، والزر يرسل الحين ويقول للموظف إنها وصلت
  { const b = $('#gSave'); if (b) b.onclick = async () => {
    const a = document.activeElement; if (a && a.blur && a.closest && a.closest('#sheet')) a.blur();   // يكمّل أي خانة مفتوحة
    clearTimeout(gridSaveT);
    try { localStorage.setItem(userKey('grid'), JSON.stringify(grid)); } catch (e) { /* مساحة */ }
    syncRows();
    if (!(window.QCloud && QCloud.on)) return toast('✓ انحفظ على هذا الجهاز');
    b.disabled = true; const old = b.textContent; b.textContent = '⏳ جارٍ الحفظ...';
    const ok = await QCloud.flush();
    b.disabled = false; b.textContent = old;
    toast(ok ? '✓ انحفظ ووصل للبث — يشوفه زملاؤك وOBS' : 'ما قدرت أوصل للخادم الحين — محفوظ على جهازك وبيوصل تلقائياً أول ما يرجع الاتصال', !ok);
  }; }
  $('#gAdd5').onclick = () => { gridSel.clear(); activeRow = -1; for (let i = 0; i < 5; i++) grid.unshift(emptyRow()); renderGrid(); gridChanged(); const w = $('.gridwrap'); if (w) w.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#gFromDesign').onclick = () => {
    gridSnap('إضافة التصميم الحالي');
    const firstEmpty = grid.findIndex(isEmptyRow);
    const row = dataToGrid({ ...state, gender: /طالبة/.test(state.by) ? 'أنثى' : 'ذكر' }); stamp(row);
    if (firstEmpty >= 0) grid[firstEmpty] = row; else grid.push(row);
    renderGrid(); gridChanged(); autoSort(row); toast('تمت إضافة التصميم الحالي كصف ✓');
  };
  // مفتاح الترتيب: التاريخ الهجري ثم الوقت (الأسطر بلا تاريخ في الآخر)
  function gridDateKey(r) {
    const m = toLatin(r[CI('التاريخ')] || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    const t = timeMin(r[CI('الوقت')] || '');
    return (m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 99999999) * 10000 + (t == null ? 9999 : t);
  }
  // الترتيب: افتراضياً الأحدث فوق والأقدم تحت، وزر «ترتيب بالتاريخ» يقلبه (يُحفظ لكل مستخدم). الأسطر بلا تاريخ دايماً فوق (جديدة تنكتب)
  const NODATE = 99999999 * 10000;
  let sortAscG = false; try { sortAscG = localStorage.getItem(userKey('sortdir')) === 'asc'; } catch (e) { /* اختياري */ }
  const cmpKey = (a, b) => (b >= NODATE) - (a >= NODATE) || (sortAscG ? a - b : b - a);   // بلا تاريخ = مناقشة تنكتب الحين: فوق
  const sortLabel = () => {
    const b = $('#gSort'); if (b) { b.textContent = sortAscG ? '↑ الأقدم فوق' : '↓ الأحدث فوق'; b.title = 'اضغط لقلب الترتيب: ' + (sortAscG ? 'الأحدث فوق' : 'الأقدم فوق'); }
    // زرّا القفز بالتاريخ: «البداية» = أول سجل (الأقدم)، «النهاية» = آخر سجل (الأحدث) — مكانهما يتبع الترتيب
    const top = $('#gTop span'), bot = $('#gBottom span');
    if (top && bot) { top.textContent = sortAscG ? 'البداية' : 'النهاية'; bot.textContent = sortAscG ? 'النهاية' : 'البداية';
      $('#gTop').title = sortAscG ? 'أول سجل (الأقدم)' : 'آخر سجل (الأحدث)'; $('#gBottom').title = sortAscG ? 'آخر سجل (الأحدث)' : 'أول سجل (الأقدم)'; }
  };
  sortLabel();
  const sortRows = rows => rows.filter(r => !isEmptyRow(r)).map((r, i) => [gridDateKey(r), i, r]).sort((a, b) => cmpKey(a[0], b[0]) || a[1] - b[1]).map(x => x[2]);
  { const s = sortRows(grid); if (s.some((r, i) => r !== grid[i])) { grid = s; if ($('#sheet').tBodies.length) renderGrid(); } }
  { const wk = $('#gWeeks'); wk.checked = weeksOn();
    wk.onchange = () => { try { localStorage.setItem(userKey('weeks'), wk.checked ? '1' : '0'); } catch (e) { /* اختياري */ } renderGrid();
      toast(wk.checked ? '🌙 تظهر الإجازة الأسبوعية بين الأسابيع (وفي الملف المصدَّر)' : 'أُخفيت فواصل الأسابيع — الصفوف ورا بعض'); }; }
  // ترتيب تلقائي بالتاريخ ثم الوقت (الأسطر الفاضية تبقى في الآخر)، مع الحفاظ على التحديد والسطر المفتوح
  function autoSort(focusRow) {
    const order = grid.map((r, i) => [isEmptyRow(r) ? 0 : 1, gridDateKey(r), i, r])   // الفاضية فوق (سطر الإضافة)
      .sort((a, b) => a[0] - b[0] || cmpKey(a[1], b[1]) || a[2] - b[2]);
    if (order.every((x, i) => x[2] === i)) return false;
    gridSnap('ترتيب تلقائي');
    const map = new Map(order.map((x, ni) => [x[2], ni]));
    grid = order.map(x => x[3]);
    const sel = [...gridSel].map(i => map.get(i)); gridSel.clear(); sel.forEach(i => gridSel.add(i));
    if (activeRow >= 0) activeRow = map.get(activeRow);
    renderGrid(); gridChanged();
    const ni = focusRow ? grid.indexOf(focusRow) : -1, tr = ni >= 0 && $(`#sheet tr[data-r="${ni}"]`);
    if (tr) { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1600); }
    return true;
  }
  let sortPending = null; // السطر اللي تغيّر تاريخه/وقته — يُرتّب لما تطلع منه
  const SORT_COLS = new Set([CI('التاريخ'), CI('الوقت')]);
  $('#sheet').addEventListener('input', e => {
    const c = e.target.dataset && e.target.dataset.c; if (c == null || !SORT_COLS.has(+c)) return;
    sortPending = grid[+e.target.closest('tr').dataset.r];
  });
  /* سطر الإضافة (الأول) ما يصير مناقشة إلا إذا فيه اسم الطالب أو العنوان أو التاريخ.
     لمسة غلط (وقت، مكان، اسم دكتور في خانة عضو…) ثم الخروج من السطر = يرجع فاضي بدل ما ينحفظ سطر ناقص
     يوصل للزملاء والبث (من هنا جات أسطر مثل «خال» و«خالد»). */
  const KEYCOLS = [CI('الطالب'), CI('العنوان'), CI('التاريخ')];
  const stillPicking = () => { const a = document.activeElement;
    return !!(a && a.closest && a.closest('#picker, .sugg, .qp-list, .modal.open')) || !$('#picker').hidden || !!$('.modal.open'); };
  function dropPartialNew(row) {
    if (activeRow === 0) return false;                                      // «➕ مناقشة جديدة» من النموذج: النموذج يعبّي السطر خانة خانة
    if (!row || row !== grid[0] || isEmptyRow(row) || KEYCOLS.some(j => String(row[j] || '').trim())) return false;
    grid[0] = emptyRow(); if (sortPending === row) sortPending = null;
    renderGrid(); gridChanged();
    toast('ما انحفظ السطر الجديد: ابدأ باسم الطالب أو العنوان أو التاريخ، وبعدها كمّل باقي الخانات', true);
    return true;
  }
  // بعد الاختيار من منتقي ما يصير «خروج» من الخانة، فنراقب أول لمسة برّا السطر (والمنتقي والقوائم)
  document.addEventListener('pointerdown', e => {
    const row = grid[0]; if (!row || isEmptyRow(row)) return;
    const t = e.target; if (t.closest && t.closest('#sheet tr[data-r="0"], #picker, .sugg, .qp-list, .modal')) return;
    setTimeout(() => { if (grid[0] === row && !stillPicking()) { const a = document.activeElement; if (!(a && a.closest && a.closest('#sheet tr[data-r="0"]'))) dropPartialNew(row); } }, 350);
  }, true);
  $('#sheet').addEventListener('focusout', e => {
    if (!sortPending) return;
    const tr = e.target.closest && e.target.closest('tr'), to = e.relatedTarget;
    if (to && (to.closest('tr') === tr || to.closest('#picker'))) return; // ما زال في نفس السطر
    setTimeout(() => {
      const a = document.activeElement, row = sortPending;
      if (!row || (a && a.closest && a.closest('tr') && grid[+a.closest('tr').dataset.r] === row)) return;
      if (row === grid[0] && stillPicking()) return;                           // يختار من المنتقي: نفس السطر
      if (dropPartialNew(row)) return;
      sortPending = null; autoSort(row);
    }, 250);
  });
  $('#sheet').addEventListener('focusout', e => {
    const tr = e.target.closest && e.target.closest('tr'); if (!tr || tr.dataset.r !== '0') return;
    setTimeout(() => {
      if (sortPending || isEmptyRow(grid[0])) return;                       // الترتيب بالتاريخ يتكفّل بإعادة الرسم
      const a = document.activeElement, atr = a && a.closest && a.closest('#sheet tr[data-r]');
      if (atr && atr.dataset.r === '0') return;                              // ما زال في نفس السطر
      if (stillPicking()) return;                                            // يختار من منتقي أو قائمة أسماء
      if (dropPartialNew(grid[0])) return;
      const r = atr ? +atr.dataset.r : -1, c = a && a.dataset ? a.dataset.c : null;
      renderGrid();
      if (r >= 0 && c != null) { const n = $(`#sheet tr[data-r="${r + 1}"] input[data-c="${c}"]`); if (n) n.focus(); }
    }, 320);
  });
  // أزرار القفز لبداية/نهاية الجدول
  function jumpGrid(end) {
    const w = $('.gridwrap'), rows = $$('#sheet tbody tr[data-r]');
    const tr = end ? [...rows].reverse().find(t => !isEmptyRow(grid[+t.dataset.r])) || rows[rows.length - 1] : rows[0];
    const r = $('#dataSheet').getBoundingClientRect();
    if (r.top > innerHeight * 0.6 || r.bottom < 120) $('#dataSheet').scrollIntoView({ behavior: 'smooth', block: 'start' });
    w.scrollTo({ top: end ? w.scrollHeight : 0, left: 0, behavior: 'smooth' });
    if (end) { let k = 0; const again = () => { if (++k > 6) return; if (w.scrollTop + w.clientHeight < w.scrollHeight - 4) w.scrollTo({ top: w.scrollHeight, left: 0 }); setTimeout(again, 500); }; setTimeout(again, 700); }
    if (tr) { tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1600); }
  }
  $('#gTop').onclick = () => jumpGrid(false); $('#gBottom').onclick = () => jumpGrid(true);
  if ('IntersectionObserver' in window) // تظهر الأزرار فقط والجدول على الشاشة
    new IntersectionObserver(es => es.forEach(x => $('.grid-jump').classList.toggle('on', x.isIntersecting))).observe($('.gridwrap'));
  else $('.grid-jump').classList.add('on');
  { const pw = $('#gPastWarn'); pw.checked = showPast();
    pw.onchange = () => { try { localStorage.setItem(userKey('pastwarn2'), pw.checked ? '1' : '0'); } catch (e) { /* اختياري */ } renderGrid();
      const w = $$('#sheet .chip.warn').length, c = conflicts.size;
      toast(pw.checked ? `تظهر التنبيهات على كل المناقشات: ${w} ناقص، ${c} تعارض` : 'التنبيهات على المناقشات الجاية بس'); }; }
  // الجدول مشترك بين الحسابات: تعديل من زميل (أو نتيجة دمج الحفظ) يُعرض فورًا
  addEventListener('qcloud:grid', e => {
    let g; try { g = JSON.parse(e.detail.value); } catch (err) { return; }
    if (!Array.isArray(g)) return;
    const lead = []; for (const r of grid) { if (isEmptyRow(r)) lead.push(r); else break; }   // سطر جديد فاضي أضافه الموظف للتو: يبقى فوق
    // تعديلات الزميل تنطبق على نسخ «↶ تراجع» كمان، حتى التراجع يرجّع تعديلي أنا بس وما يحذف شغل زميلي
    const J = r => JSON.stringify(r), prev = grid.filter(r => !isEmptyRow(r)), next = g.filter(r => Array.isArray(r) && !isEmptyRow(r));
    const cnt = a => { const m = new Map(); a.forEach(r => { const k = J(r); m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const cp = cnt(prev), cn = cnt(next), addR = [], delR = new Map();
    cn.forEach((n, k) => { for (let i = 0; i < n - (cp.get(k) || 0); i++) addR.push(JSON.parse(k)); });
    cp.forEach((n, k) => { const d = n - (cn.get(k) || 0); if (d > 0) delR.set(k, d); });
    if (addR.length || delR.size) [gUndoS, gRedoS].forEach(st => st.forEach(it => {
      const left = new Map(delR), out = [];
      for (const r of JSON.parse(it.g)) { const k = J(r), d = left.get(k) || 0; if (d > 0) { left.set(k, d - 1); continue; } out.push(r); }
      it.g = J(out.concat(addR));
    }));
    // السطر المفتوح في التصميم يبقى مرتبط (نلقاه بالطالب + التاريخ بعد التحديث)
    const openKey = activeRow >= 0 && grid[activeRow] ? J([grid[activeRow][CI('الطالب')], grid[activeRow][CI('التاريخ')]]) : null;
    grid = lead.concat(sortRows(g.filter(Array.isArray))); gridSel.clear();
    activeRow = openKey ? grid.findIndex(r => J([r[CI('الطالب')], r[CI('التاريخ')]]) === openKey) : -1;
    renderGrid(); updateGridInfo();
    if (activeRow >= 0) $$('#sheet tbody tr').forEach(tr => tr.classList.toggle('active', +tr.dataset.r === activeRow));
    const by = e.detail.by; if (by && String(by).toLowerCase() !== String(session.u).toLowerCase()) toast(`🔄 تحدّث الجدول — آخر تعديل: ${by}`);
  });
  $('#gSort').onclick = () => {
    gridSnap('ترتيب بالتاريخ');
    sortAscG = !sortAscG; try { localStorage.setItem(userKey('sortdir'), sortAscG ? 'asc' : 'desc'); } catch (e) { /* اختياري */ }
    sortLabel();
    grid = sortRows(grid); gridSel.clear(); activeRow = -1; renderGrid(); gridChanged();
    toast(sortAscG ? 'الترتيب: الأقدم فوق والأحدث تحت ✓' : 'الترتيب: الأحدث فوق والأقدم تحت ✓');
  };
  // بيانات الكلية المشتركة (جدول حجز القاعة): تُضاف للجدول مرة لكل إصدار بدون تكرار ثم يُرتّب
  (async function loadShared() {
    try {
      const res = await fetch('assets/data/defenses.json?v=202610170020', { cache: 'no-cache' }); if (!res.ok) return;
      const data = await res.json(), seenKey = userKey('sharedv');
      if (!data || !data.v || localStorage.getItem(seenKey) === data.v) return;
      const demo = new Set(SAMPLES.map(x => JSON.stringify(dataToGrid(x)))); // الأمثلة غير المعدّلة تُستبدل بالبيانات الحقيقية
      grid = grid.filter(r => !demo.has(JSON.stringify(r)));
      const key = r => nrm(r[CI('الطالب')]) + '|' + toLatin(r[CI('التاريخ')] || '').replace(/\D+/g, '-');
      const have = new Map(); grid.forEach(r => { if (!isEmptyRow(r)) have.set(key(r), r); });
      const add = [], fresh = data.rows.map(o => GCOLS.map(c => o[c] || ''));
      let filled = 0;
      const gone = (window.QCloud && QCloud.gone) || new Set();   // حذفها الموظفون من الجدول المشترك: لا ترجع
      const skey = r => String(r[CI('الطالب')] || '').trim().replace(/\s+/g, ' ') + '|' + ((toLatin(r[CI('التاريخ')] || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/) || []).slice(1).map(Number).join('/'));
      fresh.forEach(r => { if (gone.has(skey(r))) return; // سطر موجود: تُعبّأ خاناته الفاضية فقط (مثل الملاحظات ومنسق الحجز) بدون المساس بتعديلات الموظف
        const old = have.get(key(r)); if (!old) { add.push(r); return; }
        let f = false; r.forEach((v, j) => { if (v && !String(old[j] || '').trim()) { old[j] = v; f = true; } }); if (f) filled++;
      });
      // تصحيحات من مراجعة جدول الحجز: تتغيّر الخانة فقط إذا كانت ما زالت بالقيمة القديمة (ما عدّلها الموظف)
      let fixed = 0, removed = 0;
      (data.fixes || []).forEach(f => {
        const r = have.get(key(GCOLS.map(c => c === 'الطالب' ? f['الطالب'] : c === 'التاريخ' ? f['التاريخ'] : '')));
        if (!r) return; let ch = false;
        Object.entries(f['غيّر'] || {}).forEach(([c, [was, now]]) => { const j = CI(c); if (j >= 0 && (r[j] || '') === was) { r[j] = now; ch = true; } });
        if (ch) fixed++;
      });
      (data.remove || []).forEach(f => { // مناقشة مؤجلة: تُحذف إذا ما أضاف لها الموظف عنوان أو لجنة
        const r = have.get(key(GCOLS.map(c => c === 'الطالب' ? f['الطالب'] : c === 'التاريخ' ? f['التاريخ'] : '')));
        if (r && !r[CI('العنوان')] && !r[CI('عضو1 الاسم')]) { grid = grid.filter(x => x !== r); removed++; }
      });
      filled += fixed + removed;
      localStorage.setItem(seenKey, data.v);
      if (!add.length && !filled) { renderGrid(); gridChanged(); return; }
      grid = sortRows([...grid, ...add]); gridSel.clear(); activeRow = -1; renderGrid(); gridChanged();
      toast(add.length ? `📅 أُضيفت ${add.length} مناقشة من جدول حجز القاعة${filled ? ` وحُدّثت ${filled}` : ''} — مرتبة بالتاريخ` : `📅 حُدّثت ${filled} مناقشة من جدول حجز القاعة`);
    } catch (e) { /* بدون اتصال أو نسخة الملف الواحد */ }
  })();
  // ---------- تراجع / إعادة للجدول + سلة المحذوفات ----------
  const gUndoS = [], gRedoS = [];
  let cellSnapPending = false, lastArea = '';
  function updGridUndo() {
    $('#gUndo').disabled = !gUndoS.length; $('#gRedo').disabled = !gRedoS.length;
    $('#gUndo').title = gUndoS.length ? `تراجع: ${gUndoS[gUndoS.length - 1].label} (Ctrl+Z)` : 'تراجع عن آخر تغيير في الجدول (Ctrl+Z)';
  }
  function gridSnap(label) { // يُستدعى قبل أي تغيير في الجدول
    gUndoS.push({ g: JSON.stringify(grid), label }); if (gUndoS.length > 40) gUndoS.shift();
    gRedoS.length = 0; updGridUndo();
  }
  function gridRestore(from, to, verb) {
    if (!from.length) return;
    const it = from.pop(); to.push({ g: JSON.stringify(grid), label: it.label });
    grid = JSON.parse(it.g); gridSel.clear(); activeRow = -1; renderGrid(); gridChanged(); updGridUndo();
    { const have = new Set(grid.map(r => JSON.stringify(r))), t = readTrash(), k = t.filter(x => !have.has(JSON.stringify(x.r))); if (k.length !== t.length) writeTrash(k); }   // رجع للجدول = مو محذوف
    toast(`${verb}: ${it.label}`);
  }
  const gridUndo = () => gridRestore(gUndoS, gRedoS, '↶ تم التراجع'), gridRedo = () => gridRestore(gRedoS, gUndoS, '↷ تمت الإعادة');
  $('#gUndo').onclick = gridUndo; $('#gRedo').onclick = gridRedo;
  $('#sheet').addEventListener('focusin', e => { if (e.target.dataset && e.target.dataset.c != null) cellSnapPending = true; });
  $('#sheet').addEventListener('input', e => { if (cellSnapPending && e.target.dataset && e.target.dataset.c != null) { cellSnapPending = false; gridSnap('تعديل خانة'); } }, true);
  document.addEventListener('pointerdown', e => { lastArea = e.target.closest && e.target.closest('#dataSheet') ? 'grid' : 'other'; }, true);
  document.addEventListener('keydown', e => { // Ctrl+Z داخل الجدول = تراجع الجدول (وخارجه يبقى تراجع التصميم)
    if (!(e.ctrlKey || e.metaKey) || lastArea !== 'grid') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); gridUndo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); gridRedo(); }
  }, true);

  // سلة المحذوفات: محفوظة على الجهاز (تبقى بعد إغلاق الصفحة)، آخر 3000 سطر ولمدة 90 يوماً
  const TRASH_KEY = userKey('trash');
  function readTrash() { try { return JSON.parse(localStorage.getItem(TRASH_KEY)) || []; } catch (e) { return []; } }
  function writeTrash(t) {
    t = t.filter(x => Date.now() - x.at < 90 * 864e5).slice(-3000);
    for (;;) { try { localStorage.setItem(TRASH_KEY, JSON.stringify(t)); break; } catch (e) { if (t.length < 50) break; t = t.slice(Math.floor(t.length / 4)); } }
    $('#gTrashN').textContent = t.length ? `(${t.length})` : '';
  }
  function toTrash(rows, why) {
    rows = rows.filter(r => !isEmptyRow(r)); if (!rows.length) return 0;
    const at = Date.now(); writeTrash([...readTrash(), ...rows.map(r => ({ r: r.slice(), at, why, by: session.u }))]); return rows.length;
  }
  writeTrash(readTrash());
  const ago = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'الآن' : m < 60 ? `قبل ${QN.min(m)}` : m < 1440 ? `قبل ${QN.hour(Math.round(m / 60))}` : new Date(t).toLocaleDateString('ar-SA-u-ca-islamic-umalqura'); };
  function renderTrash() {
    const t = readTrash(), q = nrm($('#trashSearch').value);
    const list = t.map((x, i) => ({ x, i })).reverse().filter(({ x }) => !q || nrm(x.r.join(' ')).includes(q));
    $('#trashCount').textContent = `(${t.length})`;
    $('#trashList').innerHTML = list.length ? list.map(({ x, i }) => `<label class="trash-it"><input type="checkbox" data-t="${i}">
      <span><b>${esc(x.r[CI('الطالب')] || 'بدون اسم')}</b> — ${esc(x.r[CI('الدرجة')] || '')}<br><small>${esc(x.r[CI('التاريخ')] || '')} ${esc(x.r[CI('الوقت')] || '')}</small></span>
      <small class="hint">${esc(x.why)} · ${ago(x.at)}</small></label>`).join('') : '<p class="hint">ما فيه أسطر محذوفة.</p>';
  }
  const trashSel = () => $$('#trashList input:checked').map(i => +i.dataset.t);
  $('#gTrash').onclick = () => { $('#trashSearch').value = ''; renderTrash(); loadSharedTrash(); openModal('#mTrash'); };
  // محذوفات الكل (من الخادم، آخر 30 يوم): أي موظف يرجّع ما حذفه زميله بالغلط
  const capi = (path, opt) => fetch('/api/' + path, { ...(opt || {}), headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.token } }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j; });
  let sharedTrash = [];
  async function loadSharedTrash() {
    const box = $('#trashShared'); if (!box) return;
    if (!(window.QCloud && QCloud.on)) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="hint">جارٍ التحميل...</p>';
    try { sharedTrash = (await capi('trash')).items.filter(x => x.row); } catch (e) { box.innerHTML = '<p class="hint">تعذر الاتصال الحين.</p>'; return; }
    box.innerHTML = sharedTrash.length ? sharedTrash.map((x, i) => `<div class="trash-it"><span><b>${esc(x.st || 'بدون اسم')}</b> — ${esc(x.d || '')}<br><small class="hint">حذفها ${esc(x.by || '')} · ${ago(Date.parse(x.at))}</small></span>
      <button class="btn sm primary" data-strestore="${i}">↩️ رجّعها</button></div>`).join('') : '<p class="hint">ما فيه مناقشات محذوفة خلال آخر 30 يوم ✓</p>';
  }
  $('#mTrash').addEventListener('click', e => {
    const b = e.target.closest('[data-strestore]'); if (!b) return;
    const x = sharedTrash[+b.dataset.strestore]; if (!x) return;
    gridSnap('استرجاع ' + (x.st || 'سطر'));
    const row = GCOLS.map((_, j) => x.row[j] || ''); grid.push(row); renderGrid(); gridChanged(); autoSort(row);
    b.closest('.trash-it').remove(); toast(`↩️ رجعت «${x.st}» للجدول — ووصلت للبث`);
  });
  // «✏️ فلان يعدّل هنا»: المناقشة اللي فيها المؤشر تُبلَّغ للزملاء، ومناقشاتهم تظهر عليها علامة باسمهم
  const pkey = r => String(r[CI('الطالب')] || '').trim().replace(/\s+/g, ' ') + '|' + ((toLatin(r[CI('التاريخ')] || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/) || []).slice(1).map(Number).join('/'));
  let presence = [];
  function paintPresence() {
    $$('#sheet .pres').forEach(x => x.remove());
    if (!presence.length) return;
    $$('#sheet tbody tr[data-r]').forEach(tr => {
      const r = grid[+tr.dataset.r]; if (!r || isEmptyRow(r)) return;
      const who = presence.filter(p => p.k === pkey(r)).map(p => String(p.name || '').split(' ')[0]);
      if (who.length) tr.querySelector('td.n').insertAdjacentHTML('beforeend', ` <span class="chip pres" title="يعدّل هذي المناقشة الحين">✏️ ${esc(who.join('، '))}</span>`);
    });
  }
  addEventListener('qcloud:presence', e => { presence = e.detail || []; paintPresence(); });
  $('#sheet').addEventListener('focusin', e => { const tr = e.target.closest && e.target.closest('tr[data-r]'); if (!tr || !window.QCloud) return; const r = grid[+tr.dataset.r]; QCloud.editing = r && !isEmptyRow(r) ? pkey(r) : ''; });
  $('#sheet').addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (window.QCloud && !(a && a.closest && a.closest('#sheet'))) QCloud.editing = ''; }, 1500));
  // جولة تعريفية أول مرة (لكل حساب مرة وحدة، وتنفتح من «الدليل» بعدين)
  function tour(force) {
    const k = userKey('tour1'); try { if (!force && localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { return; }
    const m = document.createElement('div'); m.className = 'modal open'; m.id = 'mTour';
    m.innerHTML = `<div class="box" style="width:min(560px,100%)"><h2>👋 أهلاً — ثلاث خطوات بس <button class="btn sm" data-close>✕</button></h2>
      <ol class="tour-steps">
        <li><b>➕ أضف مناقشة:</b> اكتب في <b>السطر الأخضر أول الجدول</b>، أو اضغط «➕ مناقشة جديدة».</li>
        <li><b>👨‍🏫 اللجنة:</b> اكتب جزء من اسم الدكتور (مثل «عبدالله») واختر من القائمة — الصفة تتعبّى لحالها.</li>
        <li><b>💾 احفظ وحمّل:</b> كل شي ينحفظ تلقائياً ويوصل للبث، و«💾 حفظ» للتأكيد. الإعلان من «التحميل».</li>
      </ol>
      <p class="hint">غلطت؟ «↶ تراجع» يرجّع آخر تعديل، و«🗑️ المحذوفات» ترجّع أي مناقشة انحذفت.</p>
      <div style="text-align:center;margin-top:12px"><button class="btn primary" data-close style="font-size:16px;padding:10px 28px">فهمت، نبدأ ✓</button></div></div>`;
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
    document.body.appendChild(m);
  }
  setTimeout(() => tour(false), 1200);
  window.QTour = () => tour(true);
  // سجل تعديلات مناقشة
  async function openRowLog(r) {
    const st = String(grid[r][CI('الطالب')] || '').trim();
    $('#rowLogTitle').textContent = st; $('#rowLogList').innerHTML = '<p class="hint">جارٍ التحميل...</p>'; openModal('#mRowLog');
    if (!(window.QCloud && QCloud.on)) { $('#rowLogList').innerHTML = '<p class="hint">السجل يحتاج اتصال بالموقع.</p>'; return; }
    try {
      const { entries } = await capi('audit?st=' + encodeURIComponent(st));
      const verb = { add: '➕ أضافها', del: '🗑️ حذفها', edit: '✏️ عدّل', restore: '🛡️ استرجع نسخة' };
      $('#rowLogList').innerHTML = entries.length ? entries.map(e => `<div class="trash-it"><span><b>${esc(e.by || '')}</b> ${verb[e.t] || e.t}${e.t === 'edit' ? ':' : ''}
        ${e.t === 'edit' ? Object.entries(e.ch || {}).map(([c, [o, n]]) => `<br><small>${esc(c)}: <s>${esc(o || 'فاضي')}</s> ← <b>${esc(n || 'فاضي')}</b></small>`).join('') : ''}</span>
        <small class="hint">${new Date(e.at).toLocaleString('ar-SA-u-ca-islamic-umalqura', { dateStyle: 'medium', timeStyle: 'short' })}</small></div>`).join('')
        : '<p class="hint">ما فيه تعديلات مسجلة لهذي المناقشة (السجل بدأ 14 نوفمبر 2026).</p>';
    } catch (e) { $('#rowLogList').innerHTML = '<p class="hint">تعذر الاتصال الحين.</p>'; }
  }
  $('#sheet').addEventListener('click', e => { const b = e.target.closest('[data-log]'); if (!b) return; const r = +b.closest('tr').dataset.r; if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true); openRowLog(r); });
  // النسخ الاحتياطية (المدير العام)
  async function renderBackups() {
    const box = $('#backupList'); box.innerHTML = '<p class="hint">جارٍ التحميل...</p>';
    try {
      const { backups } = await capi('backups');
      box.innerHTML = backups.length ? backups.map(b => `<div class="trash-it"><span><b>${b.kind === 'day' ? '📅 نسخة يومية' : '🛡️ ' + esc(b.note || 'نسخة قبل عملية')}</b><br>
        <small class="hint">${new Date(b.at).toLocaleString('ar-SA-u-ca-islamic-umalqura', { dateStyle: 'medium', timeStyle: 'short' })} · ${QN.def(b.rows)} · ${QN.sem(b.seminars)}${b.by ? ' · ' + esc(b.by) : ''}</small></span>
        <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-bkdl="${esc(b.key)}">⬇️ تنزيل</button><button class="btn sm danger" data-bkrestore="${esc(b.key)}">↩️ استرجاع</button></span></div>`).join('')
        : '<p class="hint">أول نسخة تنحفظ تلقائياً مع أول تعديل اليوم.</p>';
    } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
  }
  { const b = $('#btnBackups'); if (b) b.onclick = () => { renderBackups(); openModal('#mBackups'); }; }
  $('#mBackups').addEventListener('click', async e => {
    const dl = e.target.closest('[data-bkdl]'), rs = e.target.closest('[data-bkrestore]');
    if (dl) {
      try { const x = await capi('backups/get?key=' + encodeURIComponent(dl.dataset.bkdl));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(x, null, 1)], { type: 'application/json' }));
        a.download = 'نسخة-احتياطية-' + String(x.at || '').slice(0, 16).replace(/[:T]/g, '-') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch (err) { toast(err.message, true); }
    }
    if (rs) {
      const w = prompt('الاسترجاع يرجّع كل المناقشات والندوات لوضع هذي النسخة عند كل الموظفين.\n(الوضع الحالي ينحفظ قبلها كنسخة، فتقدر ترجع له)\nللتأكيد اكتب كلمة: استرجاع');
      if ((w || '').trim() !== 'استرجاع') return toast('ما صار استرجاع');
      try { const r = await capi('backups/restore', { method: 'POST', body: JSON.stringify({ key: rs.dataset.bkrestore }) });
        toast(`✓ رجعت النسخة: ${QN.def(r.rows)} و${QN.sem(r.seminars)} — تتحدث الصفحة الحين`); setTimeout(() => location.reload(), 1800);
      } catch (err) { toast(err.message, true); }
    }
  });
  $('#trashSearch').addEventListener('input', renderTrash);
  $('#trashAll').onclick = () => { const all = $$('#trashList input'); const on = all.some(i => !i.checked); all.forEach(i => { i.checked = on; }); };
  $('#trashRestore').onclick = () => {
    const sel = new Set(trashSel()); if (!sel.size) return toast('حدد الأسطر اللي تبي ترجعها', true);
    const t = readTrash(), back = t.filter((_, i) => sel.has(i)).map(x => x.r);
    gridSnap(`استرجاع ${QN.row(back.length)}`);
    const have = new Set(grid.map(r => JSON.stringify(r))); // بدون تكرار: لا مع الجدول ولا بين الأسطر المسترجعة
    const add = back.filter(r => { const k = JSON.stringify(r); if (have.has(k)) return false; have.add(k); return true; });
    grid = sortRows([...grid, ...add]);
    writeTrash(t.filter((_, i) => !sel.has(i)));
    gridSel.clear(); activeRow = -1; renderGrid(); gridChanged(); renderTrash();
    toast(`↩️ رجع ${QN.row(add.length)} للجدول بمكانه بالترتيب${back.length > add.length ? ` (${back.length - add.length} مكررة ما انضافت)` : ''}`);
  };
  $('#trashPurge').onclick = () => {
    const sel = new Set(trashSel()); if (!sel.size) return toast('حدد الأسطر أولاً', true);
    if (!confirm(`حذف ${QN.row(sel.size)} نهائياً؟ ما يمكن ترجيعها بعدها.`)) return;
    writeTrash(readTrash().filter((_, i) => !sel.has(i))); renderTrash();
  };

  $('#gDel').onclick = () => {
    if (!gridSel.size) return toast('حدد الصفوف من المربعات بجانب الأرقام', true);
    if (!confirm(`تبي تحذف المحدد؟ (${QN.row(gridSel.size)}) — تقدر ترجعها من «المحذوفات» أو «تراجع»`)) return;
    gridSnap(`حذف ${QN.row(gridSel.size)}`);
    const n = toTrash(grid.filter((_, i) => gridSel.has(i)), 'حذف');
    grid = grid.filter((_, i) => !gridSel.has(i)); gridSel.clear(); activeRow = -1; renderGrid(); gridChanged();
    toast(`🗑️ حُذف ${QN.row(n)} — محفوظة في «المحذوفات»`, false, { label: '↶ تراجع', fn: gridUndo });
  };
  $('#gClear').onclick = () => {
    if (session.role !== 'super') return toast('«مسح الكل» للمدير العام فقط — لحذف مناقشة حدّدها واضغط «حذف المحدد»', true);
    const w = prompt('هذا يمسح كل المناقشات عند كل الموظفين.\nللتأكيد اكتب كلمة: مسح');
    if ((w || '').trim() !== 'مسح') return toast('ما انمسح شي');
    gridSnap('مسح الكل');
    const n = toTrash(grid, 'مسح الكل');
    grid = []; gridSel.clear(); activeRow = -1; renderGrid(); gridChanged();
    toast(`🧹 انمسح الجدول (${QN.row(n)} محفوظة في «المحذوفات»)`, false, { label: '↶ تراجع', fn: gridUndo });
  };
  $('#gExport').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet(exportAoa());
    ws['!cols'] = GCOLS.map(h => ({ wch: /العنوان/.test(h) ? 60 : 22 })); ws['!views'] = [{ RTL: true }];
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'المناقشات');
    XLSX.writeFile(wb, 'بيانات-المناقشات.xlsx');
  };

  $('#gConflicts').onclick = () => {
    const first = [...conflicts.keys()].sort((a, b) => a - b)[0]; if (first == null) return;
    const tr = $(`#sheet tr[data-r="${first}"]`); if (tr) { tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1600); }
    toast('🔴 ' + conflictText(first, conflicts.get(first))[0], true);
  };
  $('#gSelAll').onclick = () => { grid.forEach((r, i) => { if (!isEmptyRow(r) && !hideRow(r, i)) gridSel.add(i); }); renderGrid(); };
  { const b = $('#gShowPast'); if (b) b.onclick = () => {
    pastOn = !pastOn;
    pastLimit = PAST_STEP; renderGrid();
  }; }
  function morePast() {
    const w = $('.gridwrap'), top = w ? w.scrollTop : 0;
    pastLimit += PAST_STEP; renderGrid();
    if (w) w.scrollTop = top;                                   // يكمل من مكانه
  }
  { const m = $('#gMorePast'); if (m) m.onclick = morePast; }
  // تمرير الجدول لآخره ينزّل الدفعة اللي بعدها لحالها (بدل ما يرسم كل المناقشات مرة وحدة)
  { const w = $('.gridwrap'); let busy = false;
    if (w) w.addEventListener('scroll', () => {
      if (busy || findHits || !pastShown()) return;
      const left = grid.filter(r => isPast(r)).length - pastVis.size; if (left <= 0) return;
      if (w.scrollTop + w.clientHeight < w.scrollHeight - 160) return;
      busy = true; requestAnimationFrame(() => { morePast(); setTimeout(() => { busy = false; }, 250); });
    }, { passive: true }); }
  { const f = $('#gFind'); let ft; if (f) f.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => { findQ = f.value.trim(); renderGrid(); }, 250); }); }
  $('#gSelNone').onclick = () => { gridSel.clear(); renderGrid(); };
  const selectedGridStates = () => gridItems(true).map(r => ({ label: r.data.student || `سطر ${r.n}`, state: applyRow(state, r.data) }));
  $('#gDl').onclick = () => $('#exRows').click();
  $('#gPrint').onclick = () => {
    const items = selectedGridStates();
    if (!items.length) return toast('حدد الأسطر من المربعات بجانب الأرقام', true);
    printStates(items.map(x => x.state));
  };
  $('#gExportCsv').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet(exportAoa());
    saveBlob(new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' }), 'بيانات-المناقشات.csv');
  };

  // ---------- قراءة «جدول حجز القاعة» كما هو (يوم / تاريخ هجري / س8..س2) ----------
  const FEMALE = new Set(['مها', 'هند', 'غدير', 'عهود', 'آمال', 'امال', 'منال', 'ثريا', 'نوف', 'ريم', 'رهف', 'شهد', 'مرام', 'جواهر', 'دلال', 'وجدان', 'ابتسام', 'أريج', 'اريج',
    'سعاد', 'هيا', 'أمل', 'امل', 'إيمان', 'ايمان', 'نور', 'مريم', 'زينب', 'عبير', 'أثير', 'اثير', 'رغد', 'سحر', 'حنان', 'نوال', 'إلهام', 'الهام', 'وعد', 'بدور', 'أفنان', 'افنان',
    'العنود', 'الجوهرة', 'البندري', 'الهنوف', 'شوق', 'ميعاد', 'وداد', 'رحاب', 'إشراق', 'اشراق', 'تغريد', 'أروى', 'اروى', 'أسيل', 'اسيل', 'جود', 'لين', 'ديم', 'غيداء',
    'سهام', 'أنفال', 'انفال', 'جيهان', 'بشاير', 'بشائر', 'بتول', 'نهال', 'روان', 'رزان', 'هلا', 'ابتسام', 'أبتسام', 'مآثر', 'وئام', 'ريهام', 'مشاعل', 'بنان', 'ثمار', 'بيان',
    'أشواق', 'اشواق', 'أماني', 'اماني', 'تهاني', 'أغاريد', 'سلمى', 'لمى', 'ندى', 'حلا', 'جنى', 'سماح', 'إسراء', 'اسراء', 'آلاء', 'الاء', 'نجود', 'هتون', 'وسن', 'رنا', 'لانا',
    'سارا', 'ديما', 'دعاء', 'عائشة', 'خلود', 'أنوار', 'انوار', 'إخلاص', 'اخلاص', 'تسنيم', 'سوزان', 'ميار', 'رهام', 'سجى', 'أسماء', 'لجين', 'ابرار', 'أبرار', 'عفاف', 'نجلاء']);
  const MALE_EXC = new Set(['طه', 'عبيده', 'معاويه', 'أسامه', 'اسامه', 'حذيفه', 'طلحه', 'حمزة', 'حمزه', 'أسامة', 'اسامة', 'طلحة', 'عبيدة', 'معاوية', 'عروة', 'قتادة', 'عطية', 'خليفة', 'حذيفة', 'عكرمة', 'علاء', 'زكرياء', 'بهاء', 'ضياء', 'مصطفى', 'موسى', 'عيسى', 'يحيى', 'مرتضى', 'هدى الله']);
  function guessGender(name) {
    const first = String(name || '').trim().split(/\s+/)[0] || '';
    if (!first || MALE_EXC.has(first)) return 'ذكر';
    if (/^عبد/.test(first)) return 'ذكر';
    if (FEMALE.has(first) || /(ة|اء|ه)$/.test(first) || (/ى$/.test(first) && !/^(مصطفى|موسى|عيسى|يحيى|مرتضى|مجتبى)$/.test(first))) return 'أنثى';
    return 'ذكر';
  }
  function fixSpelling(t) {
    return String(t || '').replace(/\s+/g, ' ').trim()
      .replace(/(^|\s)(ال)?فق[ةه](?=\s|$)/g, (m, sp, al) => `${sp}${al || 'ال'}فقه`)
      .replace(/(^|\s)(ال)?قر[اأآ]ن/g, (m, sp) => `${sp}القرآن`)
      .replace(/وعلوم[ةه](?=\s|$)/g, 'وعلومه').replace(/و\s+علومها/g, 'وعلومها')
      .replace(/(^|\s)اصول/g, '$1أصول').replace(/أصول (?!ال)فقه/g, 'أصول الفقه')
      .replace(/(^|\s)(ال)?سن[ةه](?=\s|$)/g, (m, sp) => `${sp}السنة`)
      .replace(/(^|\s)(ال)?عقيد[ةه](?=\s|$)/g, (m, sp) => `${sp}العقيدة`);
  }
  const hourText = h => h >= 6 && h <= 11 ? `${h} صباحاً` : (h === 12 || h === 1 || h === 2) ? `${h} ظهراً` : `${h} مساءً`;
  function timeIn(text) {
    text = toLatin(text).replace(/(\d{1,2})\.(\d{2})(?!\d)/g, '$1:$2'); // 4.30 م → 4:30 م
    let m = text.match(/(\d{1,2}(?::\d{2})?)\s*(صباحاً|صباحا|ص|ظهراً|ظهرا|مساءً|مساء|م)(?![؀-ۿ])/);
    if (m) { const suf = /^ص/.test(m[2]) ? 'صباحاً' : /^ظ/.test(m[2]) || /^12\b/.test(m[1]) ? 'ظهراً' : 'مساءً'; return `${m[1]} ${suf}`; }
    m = text.match(/الساع[ةه]\s*(\d{1,2})(:\d{2})?/);
    if (m) { const h = +m[1]; return `${m[1]}${m[2] || ''} ${h >= 6 && h <= 11 ? 'صباحاً' : h === 12 ? 'ظهراً' : 'مساءً'}`; }
    m = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?!\d)/); // وقت بدون ص/م: 9:30 → صباحاً، 4:30 → مساءً
    if (m) { const h = +m[1]; return `${m[1]}:${m[2]} ${h >= 6 && h <= 11 ? 'صباحاً' : h === 12 ? 'ظهراً' : 'مساءً'}`; }
    return '';
  }
  // o: { remoteCol: عمود «المناقشة (1)» أو «عن بعد»، usesHall: الورقة تكتب «حضوري» صراحة }
  function parseBookingCell(raw, colHour, o = {}) {
    let text = toLatin(String(raw || '')).replace(/\s+/g, ' ').trim();
    if (!/(ماجستير|دكتوراه|دكتوراة)/.test(text) || /^(محجوز|لقاء)/.test(text)) return null; // حجوزات غير المناقشات
    if (!/^مناقش/.test(text)) text = 'مناقشة ' + text; // «ماجستير فقة - ...» بدون كلمة مناقشة
    text = text.replace(/(ماجستير|دكتوراه|دكتوراة)(?=[^\s])/g, '$1 ') // «ماجستيرأصول» → «ماجستير أصول»
      .replace(/(^|\s)س\s*(?=\d)/g, '$1') // «س 10 ص» → «10 ص»
      .replace(/([^\s\-–—])\s+((?:ال)?(?:ماجستير|دكتوراه|دكتوراة)(?:\s|$))/, '$1 - $2'); // «مناقشة الاسم ماجستير ...» بدون شرطة
    const own = timeIn(text), hall = /حضور/.test(text);
    // عن بعد: مكتوب صراحة أو في عمود المناقشات عن بعد. وفي الأوراق القديمة (بدون «حضوري») الوقت المكتوب داخل الخانة يعني عن بعد
    const remote = !hall && (/عن\s*بعد/.test(text) || !!o.remoteCol || (!o.usesHall && !!own));
    const time = own || (colHour ? hourText(colHour) : '');
    const parts = text.replace(/^مناقش(ة|ات)\s*/, '').split(/\s+[-–—]\s*|\s*[-–—]\s+/).map(x => x.trim()).filter(Boolean);
    let degree = '', student = '';
    for (const part of parts) {
      const clean = part.replace(/عن\s*بعد.*$/, '').replace(/\s*حضور\S*.*$/, '').replace(/(الساع[ةه]\s*)?\d{1,2}(:\d{2})?\s*(صباحاً|صباحا|ص|ظهراً|ظهرا|مساءً|مساء|م)?(?![؀-ۿ]).*$/, '').trim();
      const dm = clean.match(/^(?:ال)?(ماجستير|دكتوراه|دكتوراة)\s*(.*)$/);
      if (dm && !degree) {
        const level = /ماجستير/.test(dm[1]) ? 'الماجستير' : 'الدكتوراه';
        const spec = fixSpelling(dm[2]).replace(/^في\s+/, '')
          .replace(/^القرآن$/, 'القرآن وعلومه').replace(/^السنة$/, 'السنة وعلومها'); // اسم القسم كاملاً
        degree = spec ? `${level} في ${spec}` : level;
      } else if (clean && !student && !/^عن\s*بعد/.test(clean)) student = clean;
    }
    if (!degree) return null; // خانة بدون درجة (مثل «مناقشات الدراسات العليا») ليست إعلاناً
    return { degree, student, gender: student ? guessGender(student) : '', time,
      place: remote ? 'عن بعد' : 'قاعة ابن عثيمين', placeNote: remote ? '(عبر الإنترنت)' : '(والبث عبر الإنترنت)' };
  }
  // سطر عناوين جدول الحجز (يوم / تاريخ هجري / س8..س2 ...) — قد يتكرر داخل الورقة بأعمدة مختلفة
  function bookingHeader(rowRaw, r) {
    const row = (rowRaw || []).map(v => String(v || '').trim());
    const hours = row.map((v, i) => { const m = v.match(/^س\s*(\d{1,2})$/); return m ? [i, +m[1]]
      : /^المناقش[ةه]\s*\(?\d|^عن\s*بعد$|^مسائي$/.test(v) ? [i, null, !/مسائي/.test(v)] : null; }).filter(Boolean); // أعمدة إضافية: عن بعد / مسائي
    const dayCol = row.findIndex(v => v === 'يوم' || v === 'اليوم');
    const hijriCol = row.findIndex(v => /هجري/.test(v));
    if (hours.filter(h => h[1]).length >= 2 && hijriCol >= 0) return { headerRow: r, hours, dayCol, hijriCol, noteCol: row.findIndex(v => /ملاحظ/.test(v)), coordCol: row.findIndex(v => /منسق/.test(v)) };
    return null;
  }
  function findBooking(aoa) {
    for (let r = 0; r < Math.min(aoa.length, 15); r++) { const h = bookingHeader(aoa[r], r); if (h) return h; }
    return null;
  }
  function parseBooking(aoa, info) {
    const out = [], usesHall = aoa.some(r => (r || []).some(v => /حضور/.test(String(v || ''))));
    for (let r = info.headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const again = bookingHeader(row, r); if (again) { info = again; continue; } // عناوين جديدة في منتصف الورقة
      const hj = String(row[info.hijriCol] || '').trim().match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (!hj) continue;
      const [y, m, d] = [+hj[1], +hj[2], +hj[3]];
      const note = info.noteCol >= 0 ? String(row[info.noteCol] || '').trim() : '';
      const coord = info.coordCol >= 0 ? String(row[info.coordCol] || '').trim() : '';
      let k = 0; // ترتيب المناقشة في اليوم (لملاحظة مثل «تم تأجيل المناقشة الأولى والثانية انتهت»)
      const nth = ['الاولي', 'الثانيه', 'الثالثه', 'الرابعه'], nn = nrm(note);
      info.hours.forEach(([col, h, remoteCol]) => {
        const data = parseBookingCell(row[col], h, { remoteCol, usesHall });
        if (!data) return;
        const which = nth[k++];
        const postponed = /تاجيل|التاجيل/.test(nn) && (new RegExp(`تاجيل المناقشه ${which}`).test(nn) || (!/انتهت/.test(nn) && !/المناقشه (الاولي|الثانيه)/.test(nn)));
        out.push({ ...data, notes: postponed ? 'تم التأجيل' : (/تاجيل/.test(nn) && /انتهت/.test(nn) ? 'انتهت المناقشة' : note), coordinator: coord,
          day: info.dayCol >= 0 ? String(row[info.dayCol] || '').trim() : '', date: `${y}/${m}/${d} هـ`,
          _y: y, _m: m, _d: d, _note: note, _postponed: postponed });
      });
    }
    return out;
  }
  function todayHijri() {
    try {
      const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date());
      const g = t => parseInt((parts.find(p => p.type === t) || {}).value, 10);
      return g('year') * 10000 + g('month') * 100 + g('day');
    } catch (e) { return 0; }
  }
  const HMONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
  let bookingItems = [];
  function importWorkbook(wb) { // كل أوراق الحجز في الملف (مثل ورقة لكل سنة) تُقرأ معاً
    const names = [];
    bookingItems = [];
    for (const name of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
      const info = findBooking(aoa);
      if (info) { bookingItems.push(...parseBooking(aoa, info)); names.push(name); }
    }
    if (names.length) return openBookingDialog(names.join('، '));
    setRows(sheetToRows(wb));
  }
  function openBookingDialog(sheetName) {
    const items = bookingItems, today = todayHijri();
    const months = new Map();
    items.forEach(it => { const k = it._y * 100 + it._m; months.set(k, (months.get(k) || 0) + 1); });
    const upcoming = items.filter(it => it._y * 10000 + it._m * 100 + it._d >= today).length;
    const postponed = items.filter(it => it._postponed).length;
    $('#bkSummary').innerHTML = `ورقة «${esc(sheetName)}»: <b>${items.length}</b> مناقشة` +
      ` — القادمة: <b>${upcoming}</b>` + (postponed ? ` — المؤجلة: <b>${postponed}</b>` : '');
    $('#bkMonths').innerHTML = [...months.entries()].sort((a, b) => b[0] - a[0]).map(([k, n]) =>
      `<label class="check bk-m"><input type="checkbox" value="${k}" ${k * 100 + 31 >= today ? 'checked' : ''}> ${HMONTHS[(k % 100) - 1] || k % 100} ${Math.floor(k / 100)} هـ <span class="hint">(${n})</span></label>`).join('');
    $('#bkMode').value = grid.some(r => !isEmptyRow(r)) ? 'append' : 'replace';
    updBkCount(); openModal('#mBooking');
  }
  function bkSelected() {
    const ms = new Set($$('#bkMonths input:checked').map(i => +i.value));
    const skip = $('#bkSkipPost').checked;
    return bookingItems.filter(it => ms.has(it._y * 100 + it._m) && !(skip && it._postponed));
  }
  function updBkCount() { $('#bkGo').textContent = `📥 استيراد ${bkSelected().length} مناقشة إلى الجدول`; }
  $('#bkMonths').addEventListener('change', updBkCount);
  $('#bkSkipPost').addEventListener('change', updBkCount);
  $('#bkAll').onclick = () => { $$('#bkMonths input').forEach(i => { i.checked = true; }); updBkCount(); };
  $('#bkNone').onclick = () => { $$('#bkMonths input').forEach(i => { i.checked = false; }); updBkCount(); };
  $('#bkUpcoming').onclick = () => { const t = todayHijri(); $$('#bkMonths input').forEach(i => { i.checked = +i.value * 100 + 31 >= t; }); updBkCount(); };
  $('#bkGo').onclick = () => {
    const sel = bkSelected().sort((a, b) => (a._y * 10000 + a._m * 100 + a._d) - (b._y * 10000 + b._m * 100 + b._d));
    if (!sel.length) return toast('اختر شهراً واحداً على الأقل', true);
    const rowsNew = sel.map(it => dataToGrid(it)); rowsNew.forEach(stamp);
    gridSnap(`استيراد ${sel.length} مناقشة`);
    if ($('#bkMode').value === 'replace') { toTrash(grid, 'استبدال بالاستيراد'); grid = []; gridSel.clear(); activeRow = -1; }
    grid = grid.filter(r => !isEmptyRow(r));
    grid.push(...rowsNew); grid = sortRows(grid); rowsNew.forEach(r => gridSel.add(grid.indexOf(r)));
    renderGrid(); gridChanged();
    $('#mBooking').classList.remove('open');
    $('#dataSheet').scrollIntoView({ behavior: 'smooth' });
    toast(`تم استيراد ${sel.length} مناقشة ✓ — كمّل العنوان واللجنة (عليها ⚠️) والاقتراحات تساعدك`);
  };

  function sheetToRows(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  }
  $('#xlsFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      // ملفات CSV تُقرأ كنص UTF-8 حتى لا تتشوّه الحروف العربية
      if (/\.(csv|tsv|txt)$/i.test(f.name)) importWorkbook(XLSX.read((await f.text()).replace(/^\ufeff/, ''), { type: 'string' }));
      else importWorkbook(XLSX.read(await f.arrayBuffer(), { type: 'array' }));
    } catch (err) { console.error(err); toast('تعذّر قراءة الملف', true); }
    e.target.value = '';
  });

  function sheetCsvUrl(url) {
    const id = (url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
    if (!id) return null;
    const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? '&gid=' + gid : ''}`;
  }
  async function loadSheet() {
    const url = $('#sheetUrl').value.trim();
    const csvUrl = sheetCsvUrl(url);
    if (!csvUrl) return toast('رابط Google Sheets غير صحيح', true);
    overlay.show('جارٍ الاتصال بـ Google Sheets...');
    try {
      const r = await fetch(csvUrl, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const text = await r.text();
      if (/^\s*<!DOCTYPE|<html/i.test(text)) throw new Error('private');
      importWorkbook(XLSX.read(text, { type: 'string' }));
      localStorage.setItem(userKey('sheet'), url);
      $('#refreshSheet').hidden = false;
    } catch (e) {
      toast('تعذّر قراءة الشيت – تأكد أنه مشارَك «أي شخص لديه الرابط»', true);
    } finally { overlay.hide(); }
  }
  $('#loadSheet').onclick = loadSheet;
  $('#linkDefault').onclick = () => { state.link = DEFAULTS.link; fillForm(); changed(); };
  $('#refreshSheet').onclick = loadSheet;
  const savedSheet = localStorage.getItem(userKey('sheet'));
  if (savedSheet) { $('#sheetUrl').value = savedSheet; $('#refreshSheet').hidden = false; }

  // نموذج التعبئة الجاهز (منسّق، بقوائم اختيار وورقة شرح)
  const TEMPLATE_URL = 'assets/templates/template.xlsx?v=202610170020';
  // نموذج Google Sheets: يفتح نسخة جديدة منه في حسابك (أنشئ نسختك ثم عبّئها)
  const GSHEET_TEMPLATE = 'https://docs.google.com/spreadsheets/d/1UeSeDlmeC8X-bhU-4uUWxqbu2aTQFDURwSryk6Z49to/copy';
  $('#gsCopy').href = GSHEET_TEMPLATE;
  $('#gsTemplate').onclick = () => openModal('#mGs');
  $('#gsDlXlsx').onclick = () => $('#dlTemplate').click();
  $('#dlTemplate').onclick = () => {
    const a = document.createElement('a');
    a.href = TEMPLATE_URL; a.download = 'نموذج-تعبئة-اعلانات-المناقشات.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    toast('تم تنزيل نموذج التعبئة — عبّئه ثم استورده من «📄 من ملف Excel / CSV»');
  };

  // ---------- النوافذ ----------
  const openModal = id => { // أي نافذة تُغلق المنتقي والاقتراحات المفتوحة
    pkClose();
    document.querySelectorAll('.sugg').forEach(x => { x.hidden = true; });
    $(id).classList.add('open');
  };
  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('open');
  }));

  // القوالب
  const getDesigns = () => { try { return JSON.parse(localStorage.getItem(userKey('designs'))) || []; } catch (e) { return []; } };
  const setDesigns = list => {
    try { localStorage.setItem(userKey('designs'), JSON.stringify(list)); return true; }
    catch (e) { toast('مساحة التخزين ممتلئة – احذف بعض القوالب', true); return false; }
  };
  function renderDesigns() {
    const list = getDesigns();
    $('#designList').innerHTML = list.length ? list.map((d, i) => `<tr><td><b>${esc(d.name)}</b><div class="hint">${new Date(d.at).toLocaleString('ar-SA')}</div></td>
      <td style="text-align:left;white-space:nowrap"><button class="btn sm" data-load="${i}">فتح</button> <button class="btn sm danger" data-del="${i}">حذف</button></td></tr>`).join('')
      : '<tr><td class="hint">لا توجد قوالب محفوظة بعد.</td></tr>';
  }
  $('#btnDesigns').onclick = () => { renderDesigns(); openModal('#mDesigns'); };
  $('#saveDesign').onclick = () => {
    const name = $('#designName').value.trim() || state.student || 'قالب';
    const list = getDesigns().filter(d => d.name !== name);
    list.unshift({ name, at: Date.now(), state: clone(state) });
    if (setDesigns(list)) { $('#designName').value = ''; renderDesigns(); toast('تم الحفظ ✓'); }
  };
  $('#designList').addEventListener('click', e => {
    const list = getDesigns();
    if (e.target.dataset.load) { state = normalize(list[+e.target.dataset.load].state); fillForm(); changed(); $('#mDesigns').classList.remove('open'); toast('تم فتح القالب'); }
    if (e.target.dataset.del && confirm('حذف القالب؟')) { list.splice(+e.target.dataset.del, 1); setDesigns(list); renderDesigns(); }
  });
  $('#exportDesign').onclick = () => saveBlob(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), `تصميم-${safeName(state.student)}.json`);
  $('#importDesign').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { state = normalize(JSON.parse(await f.text())); fillForm(); changed(); toast('تم الاستيراد ✓'); }
    catch (err) { toast('ملف غير صالح', true); }
    e.target.value = '';
  });

  // الموظفون
  async function renderUsers() {
    const users = await QAuth.getUsers();
    $('#userList').innerHTML = users.map(u => `<tr><td dir="ltr" style="text-align:right">${esc(u.u)}</td><td>${esc(u.name)}</td>
      <td><span class="tag">${u.role === 'super' ? 'مدير عام' : u.role === 'admin' ? 'مدير' : 'موظف'}</span></td>
      <td style="text-align:left;white-space:nowrap"><button class="btn sm" data-edit="${esc(u.u)}">تعديل</button>
      ${u.u.toLowerCase() === session.u.toLowerCase() ? '' : `<button class="btn sm danger" data-rm="${esc(u.u)}">حذف</button>`}</td></tr>`).join('');
  }
  $('#btnUsers').onclick = () => { renderUsers(); openModal('#mUsers'); };
  $('#nuSave').onclick = async () => {
    try {
      await QAuth.addOrUpdateUser({ u: $('#nuUser').value, name: $('#nuName').value.trim(), role: $('#nuRole').value, password: $('#nuPass').value });
      ['#nuUser', '#nuName', '#nuPass'].forEach(s => { $(s).value = ''; });
      renderUsers(); toast('تم حفظ المستخدم ✓');
    } catch (e) { toast(e.message, true); }
  };
  $('#userList').addEventListener('click', async e => {
    const ed = e.target.dataset.edit, rm = e.target.dataset.rm;
    if (ed) {
      const u = (await QAuth.getUsers()).find(x => x.u === ed);
      $('#nuUser').value = u.u; $('#nuName').value = u.name; $('#nuRole').value = u.role; $('#nuPass').value = '';
      $('#nuPass').focus();
    }
    if (rm && confirm(`حذف المستخدم ${rm}؟`)) {
      try { await QAuth.deleteUser(rm); renderUsers(); } catch (err) { toast(err.message, true); }
    }
  });
  $('#exportUsers').onclick = async () => saveBlob(new Blob([await QAuth.exportUsersJson()], { type: 'application/json' }), 'users.json');
  $('#importUsers').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await QAuth.importUsers(JSON.parse(await f.text())); renderUsers(); toast('تم الاستيراد ✓'); }
    catch (err) { toast(err.message || 'ملف غير صالح', true); }
    e.target.value = '';
  });

  // كلمة المرور
  $('#btnPass').onclick = () => { ['#pOld', '#pNew', '#pNew2'].forEach(s => { $(s).value = ''; }); openModal('#mPass'); };
  // جاي من صفحة الندوات (الموظفون/النسخ الاحتياطية/كلمة المرور): تنفتح النافذة مباشرة
  { const m = /#open=(users|backups|pass)/.exec(location.hash); if (m) setTimeout(() => { const b = $({ users: '#btnUsers', backups: '#btnBackups', pass: '#btnPass' }[m[1]]); if (b && !b.hidden) b.click(); history.replaceState(null, '', location.pathname + location.search); }, 900); }
  $('#pSave').onclick = async () => {
    if ($('#pNew').value !== $('#pNew2').value) return toast('كلمتا المرور غير متطابقتين', true);
    try {
      await QAuth.changePassword(session.u, $('#pOld').value, $('#pNew').value);
      $('#mPass').classList.remove('open'); $('#weakBanner').hidden = true;
      toast(session.role !== 'employee' && !(window.QCloud && QCloud.site) ? 'تم التغيير ✓ — صدّر users.json من «الموظفون» لتطبيقه على كل الأجهزة' : 'تم تغيير كلمة المرور ✓');
    } catch (e) { toast(e.message, true); }
  };

  // ---------- أمثلة جاهزة (2 دكتوراه + 2 ماجستير) ----------
  const SAMPLES = [
    { degree: 'الدكتوراه في الفقه', gender: 'ذكر', student: 'سلطان بن فهد الحربي',
      title: 'أحكام التقنيات الطبية الحديثة في العبادات\n(دراسة فقهية مقارنة)', day: 'الاثنين', date: '1448/5/8 هـ', time: '9 صباحاً',
      place: 'قاعة ابن عثيمين', placeNote: '(والبث عبر الإنترنت)', link: DEFAULTS.link,
      committee: [
        { name: 'أ.د. عمر بن علي السديس', title: 'الأستاذ في قسم الفقه', role: 'مشرفاً ومقرراً' },
        { name: 'أ.د. فهد بن صالح الحمود', title: 'الأستاذ في قسم الفقه', role: 'مناقشاً' },
        { name: 'د. خالد بن محمد الرشيد', title: 'الأستاذ المشارك في قسم الفقه', role: 'مناقشاً' },
        { name: 'أ.د. عبد الله بن ناصر الخضير', title: 'الأستاذ في كلية الشريعة بجامعة الإمام', role: 'مناقشاً خارجياً' }] },
    { degree: 'الدكتوراه في أصول الفقه', gender: 'أنثى', student: 'نورة بنت عبد الرحمن العتيبي',
      title: 'القواعد الأصولية المتعلقة بدلالات الألفاظ عند ابن القيم\n(جمعاً ودراسة)', day: 'الثلاثاء', date: '1448/5/16 هـ', time: '10 صباحاً',
      place: 'القاعة الكبرى بمبنى الطالبات', placeNote: '(والبث عبر الإنترنت)', link: DEFAULTS.link,
      committee: [
        { name: 'أ.د. سليمان بن عبد العزيز العودة', title: 'الأستاذ في قسم أصول الفقه', role: 'مشرفاً ومقرراً' },
        { name: 'د. منيرة بنت سعد القحطاني', title: 'الأستاذ المشارك في قسم أصول الفقه', role: 'مناقِشةً' },
        { name: 'أ.د. عمر بن علي السديس', title: 'الأستاذ في قسم الفقه', role: 'مناقشاً' }] },
    { degree: 'الماجستير في الفقه المقارن', gender: 'ذكر', student: 'عبد الله بن عادل السعدي',
      title: DEFAULTS.title, day: 'الأحد', date: '1448/4/16 هـ', time: '8 صباحاً',
      place: 'قاعة ابن عثيمين', placeNote: '(والبث عبر الإنترنت)', link: DEFAULTS.link,
      committee: clone(DEFAULTS.committee) },
    { degree: 'الماجستير في أصول الفقه', gender: 'أنثى', student: 'ريم بنت خالد الدوسري',
      title: 'تخصيص العام بالمصلحة\n(دراسة أصولية تطبيقية)', day: 'الأربعاء', date: '1448/5/24 هـ', time: '11 صباحاً',
      place: 'القاعة الكبرى بمبنى الطالبات', placeNote: '(والبث عبر الإنترنت)', link: DEFAULTS.link,
      committee: [
        { name: 'د. منيرة بنت سعد القحطاني', title: 'الأستاذ المشارك في قسم أصول الفقه', role: 'مشرفةً ومقررةً' },
        { name: 'د. خالد بن محمد الرشيد', title: 'الأستاذ المشارك في قسم الفقه', role: 'مناقشاً' },
        { name: 'د. أحمد بن سليمان العودة', title: 'الأستاذ المساعد في قسم الفقه', role: 'مناقشاً' }] }
  ];
  function addSamples() {
    const rowsToAdd = SAMPLES.map(dataToGrid);
    const firstEmpty = grid.findIndex(isEmptyRow);
    if (firstEmpty >= 0) grid = grid.filter(r => !isEmptyRow(r));
    const start = grid.length;
    grid.push(...rowsToAdd);
    rowsToAdd.forEach((_, k) => gridSel.add(start + k));
    renderGrid(); gridChanged();
  }
  $('#gSamples').onclick = () => { addSamples(); toast('تمت إضافة 4 أمثلة (دكتوراه وماجستير) ✓'); };
  if (!localStorage.getItem(userKey('samples')) && !grid.some(r => !isEmptyRow(r))) {
    addSamples();
    try { localStorage.setItem(userKey('samples'), '1'); } catch (e) { /* اختياري */ }
  }

  // ---------- الاقتراحات الذكية أثناء الكتابة ----------
  // تتعلّم من: الجدول، سجل التصاميم، القوالب المحفوظة، والقيم المكتوبة سابقاً
  window.QSuggest = (function () {
    const SEEDS = {
      degree: ['الماجستير', 'الدكتوراه'].flatMap(d => ['الفقه', 'الفقه المقارن', 'أصول الفقه', 'العقيدة', 'السنة وعلومها', 'القرآن وعلومه'].map(x => `${d} في ${x}`)),
      day: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
      time: ['8 صباحاً', '9 صباحاً', '10 صباحاً', '11 صباحاً', '12 ظهراً', '1 ظهراً', '7 مساءً', '8 مساءً'],
      gender: ['ذكر', 'أنثى'],
      place: ['قاعة ابن عثيمين', 'القاعة الكبرى بمبنى الطالبات', 'عن بعد'], placeNote: ['(والبث عبر الإنترنت)', '(عبر الإنترنت)'],
      mTitle: ['الأستاذ في قسم الفقه', 'الأستاذ المشارك في قسم الفقه', 'الأستاذ المساعد في قسم الفقه',
        'الأستاذ في قسم أصول الفقه', 'الأستاذ المشارك في قسم أصول الفقه', 'الأستاذ المساعد في قسم أصول الفقه'],
      mRole: ['مشرفاً ومقرراً', 'مشرفاً', 'مشرفاً مشاركاً', 'مناقشاً', 'مناقشاً خارجياً', 'مشرفةً ومقررةً', 'مناقِشةً'],
      mName: [],
      link: [DEFAULTS.link],
      notes: ['انتهت المناقشة', 'تم التأجيل'], coord: [],
      // أجزاء تُركّب منها الدرجة والصفة؛ أي قسم/تخصص جديد يُكتب مرة يصير متاحاً في القوائم
      level: ['الماجستير', 'الدكتوراه'],
      spec: ['الفقه', 'الفقه المقارن', 'أصول الفقه', 'العقيدة', 'السنة وعلومها', 'القرآن وعلومه'],
      rank: ['الأستاذ', 'الأستاذ المشارك', 'الأستاذ المساعد', 'الأستاذة', 'الأستاذة المشاركة', 'الأستاذة المساعدة'],
      dept: ['الفقه', 'أصول الفقه', 'العقيدة والمذاهب المعاصرة', 'السنة وعلومها', 'القرآن وعلومه'],
      where: []
    };
    const FORM_KEYS = { degree: 'degree', day: 'day', time: 'time', place: 'place', placeNote: 'placeNote', link: 'link', notes: 'notes', coordinator: 'coord' };
    const EMO = { youtube: '▶️', zoom: '🎥', teams: '👥', webex: '🌐', blackboard: '🎓', meet: '📹', link: '🔗' };
    const platform = v => { const p = QPoster.platformOf(v); return `${EMO[p.id]} ${p.name}${v === DEFAULTS.link ? ' (الافتراضي)' : ''}`; };
    const M_KEYS = { name: 'mName', title: 'mTitle', role: 'mRole' };
    const COL_KEY = c => /الاسم$/.test(c) ? 'mName' : /الصفة$/.test(c) ? 'mTitle' : /الدور$/.test(c) ? 'mRole'
      : { 'الدرجة': 'degree', 'اليوم': 'day', 'الوقت': 'time', 'الجنس': 'gender', 'المكان': 'place', 'ملاحظة المكان': 'placeNote', 'رابط البث': 'link', 'الملاحظات': 'notes', 'منسق الحجز': 'coord' }[c] || null;
    const norm = v => String(v || '').replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
    let histStates = [];
    let dirty = true, counts = {}, nameTitle = {};
    const learnKey = userKey('learn');
    const readLearn = () => { try { return JSON.parse(localStorage.getItem(learnKey)) || {}; } catch (e) { return {}; } };

    function add(key, v, w = 1) {
      v = String(v || '').replace(/\s+/g, ' ').trim(); if (!v || v.length > 200) return;
      (counts[key] = counts[key] || new Map()).set(v, (counts[key].get(v) || 0) + w);
      const d = split(key, v);
      if (d) Object.entries(d).forEach(([k, x]) => { if (x) (counts[k] = counts[k] || new Map()).set(x, (counts[k].get(x) || 0) + w); });
    }
    // تفكيك «الدكتوراه في أصول الفقه» و«الأستاذ المشارك في قسم الفقه بجامعة الملك سعود» إلى أجزائها
    function split(key, v) {
      if (key === 'degree') { const m = v.match(/^(\S+(?:\s+\S+)?)\s+في\s+(.+)$/); return m ? { level: m[1], spec: m[2] } : null; }
      if (key === 'mTitle') {
        const m = v.match(/^(.+?)\s+(?:في\s+|ب)قسم\s+(.+?)(?:\s+((?:ب|في\s+)(?:جامعة|كلية)\s+.+))?$/);
        return m ? { rank: m[1], dept: m[2], where: m[3] || '' } : null;
      }
      return null;
    }
    const hiddenOf = () => new Set(readLearn().__hidden || []);
    function addState(s) {
      if (!s) return;
      Object.entries(FORM_KEYS).forEach(([f, k]) => add(k, s[f]));
      (s.committee || []).forEach(m => {
        add('mName', m.name); add('mTitle', m.title); add('mRole', m.role);
        if (m.name && m.title) { const t = (nameTitle[m.name] = nameTitle[m.name] || new Map()); t.set(m.title, (t.get(m.title) || 0) + 1); }
      });
    }
    function rebuild() {
      counts = {}; nameTitle = {};
      Object.entries(SEEDS).forEach(([k, arr]) => arr.forEach(v => add(k, v, 0.5)));
      add('link', DEFAULTS.link, 1000); // رابط القناة دائماً أول اقتراح
      grid.forEach(r => { if (!isEmptyRow(r)) addState(applyRow({ committee: [] }, parseRow(gridToObj(r)))); });
      histStates.forEach(addState);
      try { getDesigns().forEach(d => addState(d.state)); } catch (e) { /* لا قوالب */ }
      addState(state);
      Object.entries(readLearn()).forEach(([k, arr]) => { if (k !== '__hidden') (arr || []).forEach(v => add(k, v)); });
      dirty = false;
    }
    async function refreshHistory() {
      try { histStates = (await HDB.list()).map(it => it.state); } catch (e) { histStates = []; }
      dirty = true;
    }
    function learn(key, v) {
      v = String(v || '').trim(); if (!key || !v) return;
      const L = readLearn(); const arr = (L[key] = L[key] || []);
      if (!arr.includes(v)) { arr.unshift(v); L[key] = arr.slice(0, 300); try { localStorage.setItem(learnKey, JSON.stringify(L)); } catch (e) { /* مساحة */ } }
      dirty = true;
    }
    function keyOf(el) {
      if (!el || el.tagName !== 'INPUT' || el.type === 'checkbox') return null;
      if (el.dataset.pick && el.getAttribute('inputmode') === 'none') return null; // يتولاه المنتقي
      if (el.dataset.k && FORM_KEYS[el.dataset.k]) return FORM_KEYS[el.dataset.k];
      if (el.dataset.m && M_KEYS[el.dataset.m]) return M_KEYS[el.dataset.m];
      if (el.dataset.c != null && el.closest('#sheet')) return COL_KEY(GCOLS[+el.dataset.c]);
      return null;
    }
    function matches(key, q) {
      if (dirty) rebuild();
      const m = counts[key]; if (!m) return [];
      const nq = norm(q), hid = hiddenOf();
      const out = [];
      m.forEach((n, v) => {
        const nv = norm(v);
        if ((nq && nv === nq) || hid.has(key + '|' + v)) return;
        let score = 0;
        if (!nq) score = 1;
        else if (nv.startsWith(nq)) score = 4;
        else if (nv.split(' ').some(w => w.startsWith(nq) || w.replace(/^ال/, '').startsWith(nq))) score = 3;
        else if (nv.includes(nq)) score = 2;
        else if (nq.split(' ').length > 1 && nq.split(' ').every(p => nv.includes(p))) score = 1;
        if (score) out.push({ v, score, n });
      });
      return out.sort((a, b) => b.score - a.score || b.n - a.n || a.v.localeCompare(b.v, 'ar')).slice(0, 8).map(x => x.v);
    }

    const box = document.createElement('div');
    box.className = 'sugg'; box.hidden = true; document.body.appendChild(box);
    let target = null, items = [], idx = -1;
    // (كانت اسمها hide وتتغطى بدالة «إخفاء قيمة» بنفس الاسم تحت، فالقائمة ما تتسكر أبداً)
    function closeList() { box.hidden = true; target = null; items = []; idx = -1; }
    function show(el) {
      const key = keyOf(el); if (!key || document.activeElement !== el) return closeList();
      items = matches(key, el.value);
      // أسماء أعضاء هيئة التدريس في الشريعة (assets/js/people.js) بعد الأسماء السابقة، مع الرتبة والقسم كصفة
      if (key === 'mName' && window.QPeople && el.value.trim().length >= 2) {
        const seen = new Set(items.map(v => QPeople.key(v)));
        for (const p of QPeople.find(el.value)) {
          if (items.length >= 8) break;
          const k = QPeople.key(p.name); if (seen.has(k)) continue; seen.add(k);
          items.push(p.name); if (!nameTitle[p.name]) nameTitle[p.name] = new Map([[p.title, 1]]);
        }
      }
      if (!items.length) return closeList();
      target = el; idx = -1;
      const q = norm(el.value);
      box.innerHTML = `<div class="sugg-h">${key === 'mName' ? 'أسماء الدكاترة — اختر أو كمّل الكتابة' : key === 'link' ? 'روابط البث' : 'اقتراحات'}</div>` + items.map((v, i) => {
        const t = key === 'mName' && nameTitle[v] ? [...nameTitle[v].entries()].sort((a, b) => b[1] - a[1])[0][0] : key === 'link' ? platform(v) : '';
        return key === 'link'
          ? `<div class="sugg-i" data-i="${i}"><span>${esc(t)}</span><small dir="ltr">${esc(v)}</small></div>`
          : `<div class="sugg-i" data-i="${i}"><span>${esc(v)}</span>${t ? `<small>${esc(t)}</small>` : ''}</div>`;
      }).join('');
      const r = el.getBoundingClientRect();
      const w = Math.max(r.width, 240);
      box.style.width = w + 'px';
      box.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
      const topLimit = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-h')) || 0) + 8;
      const botLimit = innerHeight - ((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mnav-h')) || 0) + 8);
      if (r.bottom < topLimit || r.top > botLimit) return closeList();
      box.style.maxHeight = ''; box.hidden = false;
      const h = box.offsetHeight, below = botLimit - r.bottom - 4, above = r.top - topLimit - 4;
      if (below >= Math.min(h, 200) || below >= above) { box.style.top = (r.bottom + 4) + 'px'; box.style.maxHeight = Math.max(120, below) + 'px'; }
      else { const hh = Math.min(h, above); box.style.top = (r.top - hh - 4) + 'px'; box.style.maxHeight = hh + 'px'; }
    }
    function pick(i) {
      const el = target, v = items[i]; if (!el || v == null) return;
      const key = keyOf(el);
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
      // اختيار اسم عضو يعبّي صفته تلقائياً إن كانت فاضية
      if (key === 'mName' && nameTitle[v]) {
        const best = [...nameTitle[v].entries()].sort((a, b) => b[1] - a[1])[0][0];
        let t = null;
        if (el.dataset.m) t = el.closest('.member').querySelector('[data-m=title]');
        else if (el.dataset.c != null) t = el.closest('tr').querySelector(`input[data-c="${+el.dataset.c + 1}"]`);
        if (t && !t.value.trim()) { t.value = best; t.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      learn(key, v); closeList();
    }
    box.addEventListener('mousedown', e => e.preventDefault());
    box.addEventListener('click', e => { const it = e.target.closest('.sugg-i'); if (it) pick(+it.dataset.i); });
    document.addEventListener('focusin', e => { if (keyOf(e.target)) show(e.target); });
    document.addEventListener('input', e => { if (keyOf(e.target) && e.isTrusted) show(e.target); });
    document.addEventListener('focusout', e => {
      const k = keyOf(e.target); if (k) learn(k, e.target.value);
      setTimeout(() => { if (document.activeElement !== target) closeList(); }, 120);
    });
    document.addEventListener('keydown', e => {
      if (box.hidden || e.target !== target) return;
      const all = box.querySelectorAll('.sugg-i');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        all.forEach((n, i) => n.classList.toggle('on', i === idx));
      } else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); e.stopPropagation(); pick(idx); }
      else if (e.key === 'Escape') closeList();
    }, true);
    window.addEventListener('scroll', () => { if (target) show(target); }, true);
    window.addEventListener('resize', closeList);
    // ضغطة برّا الخانة والقائمة = تتسكر (حتى لو المؤشر باقي)
    document.addEventListener('pointerdown', e => { if (!box.hidden && e.target !== target && !box.contains(e.target)) closeList(); }, true);
    refreshHistory();
    if (window.QPeople) QPeople.load();
    function top(key, n = 80) {
      if (dirty) rebuild();
      const m = counts[key]; if (!m) return [];
      const hid = hiddenOf();
      return [...m.entries()].filter(x => !hid.has(key + '|' + x[0]))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')).slice(0, n).map(x => x[0]);
    }
    // إخفاء قيمة من القائمة (خطأ إملائي مثلاً) أو إرجاعها
    function hide(key, v, off = true) {
      const L = readLearn(); const h = new Set(L.__hidden || []);
      if (off) { h.add(key + '|' + v); if (L[key]) L[key] = L[key].filter(x => x !== v); } else h.delete(key + '|' + v);
      L.__hidden = [...h]; try { localStorage.setItem(learnKey, JSON.stringify(L)); } catch (e) { /* مساحة */ }
      dirty = true;
    }
    // ألقاب سبق استخدامها لعضو معيّن (الأكثر أولاً)
    const titlesOf = name => nameTitle[String(name || '').trim()] ? [...nameTitle[String(name || '').trim()].entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]) : [];
    function learnPick(key, v) { // اختيار من القائمة: يُحفظ ويُعاد إظهاره لو كان مخفياً
      v = String(v || '').replace(/\s+/g, ' ').trim(); if (!v) return;
      if (hiddenOf().has(key + '|' + v)) hide(key, v, false);
      learn(key, v);
    }
    // آخر قيمة اختارها هذا الموظف (مثل اسم منسق الحجز) لتعبئتها تلقائياً
    const last = key => { const h = hiddenOf(); return (readLearn()[key] || []).find(v => !h.has(key + '|' + v)) || ''; };
    return { refreshHistory, markDirty: () => { dirty = true; }, top, hide, learn: learnPick, split, titlesOf, last };
  })();

  // ---------- تراجع / إعادة ----------
  window.QUndo = (function () {
    const undoS = [], redoS = [];
    let last = JSON.stringify(state), t = null;
    const upd = () => { $('#btnUndo').disabled = !undoS.length; $('#btnRedo').disabled = !redoS.length; };
    function commit() {
      clearTimeout(t); t = null;
      const cur = JSON.stringify(state);
      if (cur === last) return;
      undoS.push(last); if (undoS.length > 60) undoS.shift();
      redoS.length = 0; last = cur; upd();
    }
    function record() { clearTimeout(t); t = setTimeout(commit, 450); }
    function apply(snap) { state = normalize(JSON.parse(snap)); last = snap; fillForm(); changed(true); saveDraft(); upd(); }
    function undo() { if (t) commit(); if (!undoS.length) return; redoS.push(JSON.stringify(state)); apply(undoS.pop()); toast('↶ تم التراجع'); }
    function redo() { if (!redoS.length) return; undoS.push(JSON.stringify(state)); apply(redoS.pop()); toast('↷ تمت الإعادة'); }
    $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      const k = e.key.toLowerCase();
      if (inField) return; // داخل الخانة: التراجع الطبيعي للنص
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    });
    return { record, undo, redo };
  })();

  // ---------- صورة التصميم الحالي: مشاركة / نسخ / عرض كامل ----------
  let imgCache = { key: '', blob: null };
  const imgKey = scale => JSON.stringify(state) + currentFmt.id + currentFmt.w + 'x' + currentFmt.h + '@' + scale;
  async function currentBlob(scale = 2) {
    const key = imgKey(scale);
    if (imgCache.key === key) return imgCache.blob;
    const blob = await canvasBlob(await capture(state, currentFmt, scale), 'png');
    imgCache = { key, blob };
    return blob;
  }
  $('#shareBtn').onclick = async () => {
    const name = `${safeName(state.student)}.png`;
    const ready = imgCache.key === imgKey(2);
    let blob;
    if (!ready) {
      overlay.show('جارٍ تجهيز الصورة...');
      try { blob = await currentBlob(2); } catch (e) { overlay.hide(); return toast('تعذّر تجهيز الصورة', true); }
      overlay.hide();
    } else blob = imgCache.blob;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'إعلان مناقشة رسالة علمية' }); saveToHistory({ quiet: true }); }
      catch (e) { if (e.name === 'NotAllowedError') toast('الصورة جاهزة ✓ — اضغط «مشاركة الصورة» مرة ثانية'); }
    } else {
      saveBlob(blob, name);
      toast('المشاركة المباشرة غير مدعومة في هذا المتصفح — تم تنزيل الصورة');
    }
  };
  $('#copyImgBtn').onclick = async () => {
    if (!navigator.clipboard || !window.ClipboardItem) return toast('نسخ الصور غير مدعوم في هذا المتصفح — استخدم التحميل', true);
    overlay.show('جارٍ نسخ الصورة...');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentBlob(2) })]);
      toast('تم نسخ الصورة ✓ الصقها في واتساب أو X أو الإيميل (Ctrl+V)');
    } catch (e) { toast('تعذّر نسخ الصورة — استخدم «تحميل» أو «مشاركة»', true); }
    finally { overlay.hide(); }
  };
  async function openZoom() {
    overlay.show('جارٍ تجهيز العرض...');
    try {
      const blob = await currentBlob(2);
      const img = $('#zoomImg');
      if (img._url) URL.revokeObjectURL(img._url);
      img._url = URL.createObjectURL(blob); img.src = img._url; img.classList.remove('full');
      openModal('#mZoom');
    } catch (e) { toast('تعذّر العرض', true); } finally { overlay.hide(); }
  }
  $('#zoomBtn').onclick = openZoom;
  $('#stage').addEventListener('click', openZoom);
  $('#zoomImg').onclick = e => { e.stopPropagation(); e.target.classList.toggle('full'); };
  $('#mZoom .zoombox').addEventListener('click', e => { if (e.target.classList.contains('zoombox')) $('#mZoom').classList.remove('open'); });

  // ---------- نص جاهز للنشر ----------
  function buildCaption(s, tags) {
    const one = v => String(v || '').replace(/\s*\n\s*/g, ' ').trim();
    const mem = (s.committee || []).filter(m => m && m.name).map(m => `• ${m.name}${m.role ? ' — ' + m.role : ''}`).join('\n');
    const lines = [
      `📢 ${one(s.college)}`, one(s.intro), `🎓 ${one(s.degree)}`, `👤 ${one(s.by)}: ${one(s.student)}`, '',
      `📖 ${one(s.titleLabel)} ${one(s.title)}`, '',
      mem ? `👥 ${one(s.committeeLabel)}:\n${mem}` : '', '',
      `🗓 ${one(s.day)} ${one(s.date)}`, `⏰ ${one(s.time)}`, `📍 ${[one(s.place), one(s.placeNote)].filter(Boolean).join(' ')}`,
      s.opt && s.opt.qr && s.link ? `🔗 رابط البث: ${s.link}` : '',
      tags ? '\n#جامعة_القصيم #كلية_الشريعة #مناقشة_علمية' : ''
    ];
    return lines.filter((x, i, a) => !(x === '' && (a[i - 1] === '' || i === 0))).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function updCapLinks() {
    const t = encodeURIComponent($('#captionText').value);
    $('#capWa').href = `https://wa.me/?text=${t}`;
    $('#capX').href = `https://twitter.com/intent/tweet?text=${t}`;
  }
  $('#captionBtn').onclick = () => { $('#captionText').value = buildCaption(state, $('#capTags').checked); updCapLinks(); openModal('#mCaption'); };
  $('#capTags').onchange = () => { $('#captionText').value = buildCaption(state, $('#capTags').checked); updCapLinks(); };
  $('#captionText').addEventListener('input', updCapLinks);
  $('#capCopy').onclick = async () => {
    const ta = $('#captionText');
    try { await navigator.clipboard.writeText(ta.value); }
    catch (e) { ta.select(); document.execCommand('copy'); }
    toast('تم نسخ النص ✓');
  };

  // ---------- دليل الاستخدام ----------
  $('#btnHelp').onclick = () => openModal('#mHelp');
  // أول دخول: تطلع «الجولة السريعة» بس (نافذتين فوق بعض تربك)، والدليل من زره وفيه زر يعيد الجولة
  try { localStorage.setItem(userKey('helpSeen'), '1'); } catch (e) { /* اختياري */ }
  { const t = $('#btnTourAgain'); if (t) t.onclick = () => { $('#mHelp').classList.remove('open'); if (window.QTour) QTour(); }; }


  // ---------- رسائل واتساب: الدعوة والتسجيل ----------
  const DEFAULT_TPL = {
    invite: 'مناقشة {نوع_الرسالة}، {للباحث}: {الطالب}، بعنوان: {العنوان}، يوم {اليوم} {التاريخ} الموافق {الميلادي}.\nالساعة {الوقت}\nمكان المناقشة: {المكان}\nرابط المناقشة:\n{رابط_البث}\n[[\nرابط خاص باللجنة\n{رابط_اللجنة}\n]]\n#الدراسات_العليا\n#جامعة_القصيم\n#مناقشة_علمية',
    record: 'السلام عليكم ورحمة الله\nمرفق لكم تسجيل مناقشة {نوع_الرسالة}، {للباحث}: {الطالب}، بعنوان: {العنوان}، يوم {اليوم} {التاريخ}\n\n{رابط_التسجيل}\n\nولكم خالص الشكر'
  };
  const getTpl = () => { try { return { ...DEFAULT_TPL, ...(JSON.parse(localStorage.getItem(userKey('msgTpl'))) || {}) }; } catch (e) { return { ...DEFAULT_TPL }; } };
  function hijriToGreg(date) {
    const m = toLatin(date).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (!m) return '';
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    try {
      const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
      const key = x => { const p = fmt.formatToParts(x); const g = t => parseInt(p.find(q => q.type === t).value, 10); return [g('year'), g('month'), g('day')]; };
      const approx = Date.UTC(622, 6, 16, 12) + ((y - 1) * 354.36707 + (mo - 1) * 29.530589 + (d - 1)) * 864e5;
      for (let i = 0; i <= 60; i++) for (const sg of [1, -1]) {
        const t = new Date(approx + sg * i * 864e5); const [a, b, c] = key(t);
        if (a === y && b === mo && c === d) return `${t.getUTCFullYear()}/${t.getUTCMonth() + 1}/${t.getUTCDate()}`;
      }
    } catch (e) { /* المتصفح لا يدعم */ }
    return '';
  }
  function hijriText(date) { const m = toLatin(date).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? `${+m[3]}_ ${+m[2]}_ ${m[1]}هـ` : String(date || '').trim(); }
  function dayFromDate(date) {
    const g = hijriToGreg(date); if (!g) return '';
    const [y, m, d] = String(g).split('/').map(Number); if (!y || !m || !d) return '';
    return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }
  function msgVars(s) {
    const female = /طالبة/.test(s.by || '') || /أنثى|انثى/.test(s.gender || '');
    const deg = String(s.degree || '').trim().replace(/^ال(ماجستير|دكتوراه)/, '$1');
    return {
      'نوع_الرسالة': deg ? `رسالة ${deg}` : 'رسالة علمية', 'للباحث': female ? 'للباحثة' : 'للباحث', 'الطالب': String(s.student || '').trim(),
      'العنوان': String(s.title || '').replace(/\s*\n\s*/g, ' – ').trim(), 'اليوم': String(s.day || '').trim() || dayFromDate(s.date), 'التاريخ': hijriText(s.date),
      'الميلادي': hijriToGreg(s.date), 'الوقت': String(s.time || '').trim(), 'المكان': String(s.place || '').trim(),
      'رابط_البث': String(s.link || '').trim() || DEFAULTS.link, 'رابط_اللجنة': String(s.committeeLink || '').trim(), 'رابط_التسجيل': recLinks(s.recordingLink)
    };
  }
  // تسجيل من عدة أجزاء (روابط مفصولة بـ | ) → «الجزء 1: ...» كل جزء في سطر
  // صورة التسجيل: الباركود يفتح رابط التسجيل (أول جزء) والعبارة «امسح لمشاهدة التسجيل» بدل «امسح للبث»
  function recState(s) { const u = String(s.recordingLink || '').split(/\s*\|\s*|\s+(?=https?:)/).map(x => x.trim()).find(x => /^https?:/i.test(x));
    return u ? { ...s, link: u, rec: true, opt: { ...(s.opt || {}), qr: true } } : s; }
  function recLinks(v) {
    const urls = String(v || '').split(/\s*\|\s*|\s+(?=https?:)/).map(x => x.trim()).filter(Boolean);
    return urls.length > 1 ? urls.map((u, i) => `الجزء ${i + 1}:\n${u}`).join('\n\n') : (urls[0] || '');
  }
  function fillTpl(tpl, v) {
    // [[ ... ]] جزء اختياري: يُحذف إذا كان فيه متغير فاضي
    let out = tpl.replace(/\[\[([\s\S]*?)\]\]/g, (m, inner) => (inner.match(/\{([^}]+)\}/g) || []).every(k => v[k.slice(1, -1)]) ? inner : '');
    out = out.replace(/\{([^}]+)\}/g, (m, k) => v[k] != null ? v[k] : m);
    out = out.replace(/،\s*بعنوان:\s*(?=،|\n|$)/g, '') // بدون عنوان: تُحذف «بعنوان:» الفاضية
      .replace(/الموافق\s*\./g, '.').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
    return out.trim();
  }
  const buildMsg = (kind, s) => fillTpl(getTpl()[kind], msgVars(s));
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px'; document.body.appendChild(ta);
      ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (er) { ok = false; } ta.remove(); return ok;
    }
  }
  async function copyMsg(kind, s, onMissing) {
    if (kind === 'record' && !String(s.recordingLink || '').trim()) { toast('أضف «رابط التسجيل» أولاً (بعد انتهاء المناقشة)', true); if (onMissing) onMissing(); return; }
    const text = buildMsg(kind, s);
    if (await copyText(text)) toast(kind === 'invite' ? '✓ تم نسخ رسالة الدعوة — الصقها في واتساب' : '✓ تم نسخ رسالة التسجيل — الصقها في واتساب');
    else { $('#msgPreview').value = text; openModal('#mMsg'); toast('انسخ الرسالة من النافذة', true); }
  }
  $('#copyInvite').onclick = () => copyMsg('invite', state);
  $('#copyRecord').onclick = () => copyMsg('record', state, () => $('[data-k=recordingLink]').focus());
  // رسائل سطر من الجدول: بيانات السطر فقط (لا تُستعار العنوان أو اللجنة من التصميم المفتوح)
  // ---------- «📅 مشاركة صور الأسبوع» (assets/js/week.js): مناقشات هذا القسم فقط، بالإعلان الرسمي ----------
  if (window.QWeek) QWeek({
    button: $('#gWeek'), noun: 'مناقشة', heading: 'كل مناقشة بالإعلان الرسمي',
    ui: { toast, busy: m => overlay.show(m), done: () => overlay.hide() },
    list: (start, end) => {
      const out = [];
      grid.forEach((r, i) => {
        if (isEmptyRow(r) || !r[CI('الطالب')]) return;
        if (/تأجيل|تاجيل|مؤجل|ملغ|إلغاء/.test(String(r[CI('الملاحظات')] || ''))) return;   // المؤجلة والملغاة ما تنشر
        const g = hijriToGreg(r[CI('التاريخ')]); if (!g) return;
        const [y, m, d] = g.split('/').map(Number), t = Date.UTC(y, m - 1, d);
        if (t >= start.getTime() && t <= end.getTime()) out.push({ i, t, order: gridDateKey(r), title: r[CI('الطالب')], sub: r[CI('الدرجة')] || '',
          line: `${r[CI('اليوم')] || ''} ${r[CI('التاريخ')] || ''} · ${r[CI('الوقت')] || ''}` });
      });
      return out;
    },
    blob: async x => { const cv = await capture(rowMsgState(x.i), getFormat('exact'), 2); return new Promise(r => cv.toBlob(r, 'image/png')); },
    name: x => `${safeName(x.title || 'اعلان')}.png`,
  });
  const rowMsgState = r => applyRow({ ...state, country: '', degree: '', student: '', title: '', day: '', date: '', time: '', place: DEFAULTS.place, placeNote: DEFAULTS.placeNote,
    link: DEFAULTS.link, committee: [], committeeLink: '', recordingLink: '' }, parseRow(gridToObj(grid[r])));
  // ---------- «📋 إرسال المناقشات الأسبوعية للتدقيق» (assets/js/week.js) ----------
  // «ماجستير - قرآن / سلمان التويجري - الاحد / 6/5 س 9:30 ص حضوري» من بيانات الجدول نفسها
  const reviewDegree = v => {
    const s = String(v || '').trim(), stage = /دكتوراه/.test(s) ? 'دكتوراه' : /ماجستير/.test(s) ? 'ماجستير' : s.split(/\s+/)[0] || '';
    const sp = (s.split(/\s+في\s+/)[1] || '').split(/\s+و/)[0].split(/\s+/).map(w => w.replace(/^ال(?=..)/, '')).join(' ');
    return sp ? `${stage} - ${sp}` : stage;
  };
  const reviewName = v => { const w = String(v || '').trim().split(/\s+/).filter(x => !/^(بن|بنت|ابن)$/.test(x)); return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : (w[0] || ''); };
  const reviewTime = v => String(v || '').trim().replace(/\s*(صباحاً|صباحا|ص)\.?$/, ' ص').replace(/\s*(مساءً|مساءا|مساء|ظهراً|ظهرا|عصراً|عصرا|م)\.?$/, ' م');
  if (window.QReview) QReview({
    button: $('#gReview'), plural: 'مناقشات', ui: { toast },
    list: (start, end) => {
      const out = [];
      grid.forEach(r => {
        if (isEmptyRow(r) || !r[CI('الطالب')]) return;
        if (/تأجيل|تاجيل|مؤجل|ملغ|إلغاء/.test(String(r[CI('الملاحظات')] || ''))) return;
        const g = hijriToGreg(r[CI('التاريخ')]); if (!g) return;
        const [y, m, d] = g.split('/').map(Number), t = Date.UTC(y, m - 1, d);
        if (t < start.getTime() || t > end.getTime()) return;
        const hm = toLatin(r[CI('التاريخ')]).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
        const day = String(r[CI('اليوم')] || '').trim() || dayFromDate(r[CI('التاريخ')]);
        const mode = REMOTE(r[CI('المكان')]) ? 'عن بعد' : 'حضوري';
        out.push({ t, order: gridDateKey(r), lines: [reviewDegree(r[CI('الدرجة')]), `${reviewName(r[CI('الطالب')])} - ${day}`,
          `${hm ? `${+hm[2]}/${+hm[3]}` : ''} س ${reviewTime(r[CI('الوقت')])} ${mode}`.replace(/\s+/g, ' ').trim()] });
      });
      return out;
    },
  });
  $('#sheet').addEventListener('click', e => {
    const b = e.target.closest('[data-msg]'); if (!b) return;
    const r = +b.closest('tr').dataset.r;
    if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
    const st = rowMsgState(r);
    copyMsg(b.dataset.msg, st, () => { const c = cellAt(r, GCOLS.indexOf('رابط التسجيل')); if (c) c.focus(); });
  });
  // تعديل نص الرسائل
  $('#editMsgTpl').onclick = () => { const t = getTpl(); $('#tplInvite').value = t.invite; $('#tplRecord').value = t.record; updTplPreview(); openModal('#mTpl'); };
  function updTplPreview() {
    const v = msgVars(state);
    $('#tplPrevInvite').textContent = fillTpl($('#tplInvite').value, v);
    $('#tplPrevRecord').textContent = fillTpl($('#tplRecord').value, { ...v, 'رابط_التسجيل': v['رابط_التسجيل'] || 'https://youtube.com/live/...' });
  }
  ['#tplInvite', '#tplRecord'].forEach(x => $(x).addEventListener('input', updTplPreview));
  $('#tplSave').onclick = () => {
    try { localStorage.setItem(userKey('msgTpl'), JSON.stringify({ invite: $('#tplInvite').value, record: $('#tplRecord').value })); } catch (e) { /* مساحة */ }
    $('#mTpl').classList.remove('open'); toast('تم حفظ نص الرسائل ✓');
  };
  $('#tplReset').onclick = () => { $('#tplInvite').value = DEFAULT_TPL.invite; $('#tplRecord').value = DEFAULT_TPL.record; updTplPreview(); };


  // ---------- إرسال بالواتساب: الصورة الأصلية الكاملة + نص الرسالة ----------
  const SEND = { s: null, kind: 'invite', blob: null, file: null };
  // المشاركة المباشرة للجوال واللوحي فقط؛ الكمبيوتر يفتح واتساب ويب (ويندوز يفتح نافذة مشاركة النظام وتلخبط)
  const canShareFiles = () => { try { return matchMedia('(pointer: coarse)').matches && !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.jpg', { type: 'image/jpeg' })] })); } catch (e) { return false; } };
  function sendSetKind(kind) {
    SEND.kind = kind;
    $$('[data-send]').forEach(b => b.classList.toggle('active', b.dataset.send === kind));
    const missing = kind === 'record' && !String(SEND.s.recordingLink || '').trim();
    $('#sendWarn').hidden = !missing;
    $('#sendWarn').textContent = missing ? '⚠️ ما فيه رابط تسجيل. أضفه في خانة «رابط التسجيل» (أو في عمود السطر بالجدول) ثم ارجع هنا.' : '';
    $('#sendText').value = missing ? '' : buildMsg(kind, SEND.s);
  }
  async function openSend(s, kind, readyBlob) {
    SEND.s = s; SEND.blob = null; SEND.file = null;
    sendSetKind(kind || (String(s.recordingLink || '').trim() ? 'record' : 'invite'));
    const img = $('#sendImg'); img.removeAttribute('src'); $('#sendImgNote').textContent = 'جارٍ تجهيز الصورة...';
    const mobile = canShareFiles();
    $('#sendShare').hidden = !mobile; $('#sendWeb').hidden = mobile;
    $('#sendHint').textContent = mobile
      ? 'اضغط «إرسال للواتساب» واختر واتساب ثم المحادثة. إذا ما ظهر النص مع الصورة، الصقه (منسوخ تلقائياً).'
      : 'في الكمبيوتر: يفتح واتساب ويب بالرسالة، والصورة تنسخ تلقائياً — الصقها في المحادثة (Ctrl+V).';
    openModal('#mSend');
    await sendBuildImg(readyBlob);
  }
  let sendTok = 0;
  async function sendBuildImg(readyBlob) {
    const s = SEND.s, kind = SEND.kind, tok = ++sendTok, img = $('#sendImg');
    SEND.blob = null; SEND.file = null; img.removeAttribute('src');
    $('#sendImgNote').textContent = kind === 'record' ? 'جارٍ تجهيز صورة اليوتيوب...' : 'جارٍ تجهيز صورة الحالة...';
    try {
      let blob = readyBlob;
      if (!blob) { const cv = await capture(kind === 'record' ? recState(s) : s, sendFmt(kind), 2); blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.93)); }
      if (tok !== sendTok) return;                                  // تغيّر نوع الرسالة أثناء التجهيز
      SEND.blob = blob; SEND.file = new File([blob], `${safeName(s.student || 'اعلان')}${kind === 'record' ? '-يوتيوب' : ''}.jpg`, { type: 'image/jpeg' });
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
    copyText(text); // احتياط: بعض نسخ واتساب تتجاهل النص المرفق مع الصورة
    try {
      await navigator.share({ files: [SEND.file], text });
      saveToHistory({ quiet: true });
      $('#mSend').classList.remove('open');
    } catch (e) { if (e.name !== 'AbortError') toast('تعذّر فتح المشاركة — جرّب مرة ثانية أو حمّل الصورة', true); }
  };
  $('#sendWeb').onclick = async () => {
    if (!sendReady()) return;
    const text = $('#sendText').value;
    const w = window.open('about:blank', '_blank'); // نفتح النافذة فوراً حتى لا يمنعها المتصفح
    let copied = false;
    try { await navigator.clipboard.write([new ClipboardItem({ [SEND.blob.type]: SEND.blob })]); copied = true; }
    catch (e) {
      try { const png = await new Promise(r => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(r, 'image/png'); }; im.src = $('#sendImg').src; });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); copied = true; } catch (er) { copied = false; }
    }
    const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    if (w) w.location.href = url; else location.href = url;
    toast(copied ? '✓ الصورة منسوخة — اختر المحادثة والصقها (Ctrl+V) ثم أرسل' : 'افتح المحادثة وأرفق الصورة من «تحميل الصورة»', !copied);
    saveToHistory({ quiet: true });
  };
  $('#sendCopy').onclick = async () => { if (await copyText($('#sendText').value)) toast('✓ تم نسخ الرسالة'); };
  $('#sendDl').onclick = () => { if (SEND.blob) saveBlob(SEND.blob, SEND.file.name); };
  // إرسال مباشر: في الجوال/الآيباد يفتح المشاركة فوراً، وإذا طلب الجهاز ضغطة إضافية تظهر نافذة جاهزة
  async function sendDirect(s, kind, isCurrent) {
    if (kind === 'record' && !String(s.recordingLink || '').trim()) return toast('أضف «رابط التسجيل» أولاً (بعد انتهاء المناقشة)', true);
    if (!canShareFiles()) return openSend(s, kind); // الكمبيوتر: نافذة واتساب ويب
    const text = buildMsg(kind, s);
    overlay.show('جارٍ تجهيز الصورة للواتساب...');
    let blob;
    try { const cv = await capture(s, sendFmt(kind), 2); blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.93)); }
    catch (e) { overlay.hide(); return toast('تعذّر تجهيز الصورة', true); }
    overlay.hide();
    const file = new File([blob], `${safeName(s.student || 'اعلان')}.jpg`, { type: 'image/jpeg' });
    copyText(text);
    try {
      await navigator.share({ files: [file], text });
      if (isCurrent) saveToHistory({ quiet: true });
    } catch (e) {
      if (e.name === 'AbortError') return;
      await openSend(s, kind, blob); // الجهاز يحتاج ضغطة جديدة: النافذة جاهزة بزر «إرسال»
      toast('جاهز ✓ — اضغط «إرسال للواتساب»');
    }
  }
  // «تسجيل»: أول شي تنزل صورة التسجيل على الجهاز، بعدها واتساب كما هو (sendDirect بدون أي تغيير)
  async function saveRecordImage(s) {
    if (!String(s.recordingLink || '').trim()) return;          // بدون رابط تسجيل: sendDirect نفسه ينبّه
    overlay.show('جارٍ تحميل صورة التسجيل على الجهاز...');
    try { const cv = await capture(s, sendFmt('record'), 2); const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.93)); saveBlob(blob, `${safeName(s.student || 'اعلان')}-تسجيل.jpg`); }
    catch (e) { /* تعذّر التحميل: نكمل للواتساب عادي */ } finally { overlay.hide(); }
  }
  $('#waInvite').onclick = () => sendDirect(state, 'invite', true);
  $('#waRecord').onclick = async () => { await saveRecordImage(state); sendDirect(state, 'record', true); };
  $('#sheet').addEventListener('click', e => {
    const b = e.target.closest('[data-wa]'); if (!b) return;
    const r = +b.closest('tr').dataset.r;
    if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
    const kind = b.dataset.wa || 'invite', st = rowMsgState(r);
    if (kind === 'record') return saveRecordImage(st).then(() => sendDirect(st, 'record', false));
    sendDirect(st, kind, false);
  });

  // ---------- مزامنة: تعديل سطر الجدول المفتوح من النموذج + تحديث تصميم السجل تلقائياً ----------
  // ينقل للسطر فقط الحقول التي غيّرها المستخدم في النموذج منذ فتح السطر
  function syncActiveRow() {
    if (activeRow < 0 || !grid[activeRow] || !rowSnap) return;
    const fresh = gridOfState(), prevSnap = rowSnap;
    const row = grid[activeRow]; let changedAny = false;
    // سطر جديد فاضي: أول ما ينكتب اسم الطالب ينتقل كل ما في النموذج (ومنه القاعة والرابط الافتراضيان — يحتاجها البث)
    const snap = isEmptyRow(row) && (fresh[CI('الطالب')] || '').trim() ? emptyRow() : rowSnap;
    GCOLS.forEach((c, j) => {
      if ((fresh[j] || '') === (snap[j] || '')) return; // لم يتغيّر في النموذج
      if ((row[j] || '') !== (fresh[j] || '')) {
        row[j] = fresh[j]; changedAny = true;
        const inp = cellAt(activeRow, j); if (inp && document.activeElement !== inp) inp.value = fresh[j];
      }
    });
    rowSnap = fresh;
    if (changedAny) { stamp(row); const wc = cellAt(activeRow, WCOL); if (wc) wc.value = row[WCOL]; updRowWarn(activeRow); refreshConflictsSoon(activeRow); gridChanged(); }
    if (changedAny && [...SORT_COLS].some(j => (fresh[j] || '') !== (prevSnap[j] || ''))) { clearTimeout(formSortT); formSortT = setTimeout(() => autoSort(row), 1200); }
  }
  let formSortT;
  let histAutoT;
  function autoSync() {
    syncActiveRow();
    if (editingId) { clearTimeout(histAutoT); histAutoT = setTimeout(() => saveToHistory({ quiet: true }), 2500); }
    const f = $('#syncFlag');
    if (f) f.textContent = activeRow >= 0 ? `🔗 مرتبط بالسطر ${activeRow + 1} في الجدول — التعديل ينحفظ فيه تلقائياً` : '';
  }

  // ---------- منتقي اليوم / التاريخ / الوقت (بدل الكتابة) ----------
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function gregToHijri(d) {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
    const g = t => parseInt((parts.find(p => p.type === t) || {}).value, 10);
    return { text: `${g('year')}/${g('month')}/${g('day')} هـ`, day: DAYS[d.getDay()] };
  }
  const pk = $('#picker'); let pkTarget = null;
  function pkSibling(el, kind) {
    if (el.dataset.k) return $(`[data-k=${kind}]`);
    const tr = el.closest('tr'); if (!tr) return null;
    const c = GCOLS.indexOf(kind === 'day' ? 'اليوم' : kind === 'date' ? 'التاريخ' : 'الوقت');
    return tr.querySelector(`input[data-c="${c}"]`);
  }
  function pkSet(el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
  function pkClose() { pk.hidden = true; pkTarget = null; }
  function pkPlace(el) {
    const r = el.getBoundingClientRect(); pk.hidden = false;
    const w = pk.offsetWidth, h = pk.offsetHeight;
    pk.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    const cssPx = n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
    const topL = cssPx('--sticky-h') + 6, botL = innerHeight - cssPx('--mnav-h') - 6;   // تحت الشريط اللاصق وفوق شريط الجوال
    pk.style.top = (botL - r.bottom < h + 10 && r.top - topL > h + 10 ? r.top - h - 6 : Math.max(topL, r.bottom + 6)) + 'px';
  }
  // الحقل المجاور في نفس السطر/العضو: 'الطالب' أو 'الاسم' / 'الصفة' لنفس العضو
  function pkRel(el, what) {
    if (what === 'الطالب') {
      if (el.dataset.k) return $('[data-k=student]');
      const tr = el.closest('tr'); return tr && tr.querySelector(`input[data-c="${GCOLS.indexOf('الطالب')}"]`);
    }
    if (el.dataset.m) { const m = el.closest('.member'); return m && m.querySelector(`[data-m=${what === 'الاسم' ? 'name' : 'title'}]`); }
    const c = GCOLS[+el.dataset.c] || '', mm = c.match(/^(عضو\d+) /); if (!mm) return null;
    return el.closest('tr').querySelector(`input[data-c="${GCOLS.indexOf(`${mm[1]} ${what}`)}"]`);
  }
  // تركيب الدرجة (المرحلة + التخصص) أو الصفة (الرتبة + القسم + الجهة) من أجزاء متعلَّمة
  const PK_PARTS = { degree: [['level', 'المرحلة'], ['spec', 'التخصص']], mTitle: [['rank', 'الرتبة'], ['dept', 'القسم'], ['where', 'الجهة (للمناقش من خارج الجامعة)']] };
  function pkBuilder(key, cur) {
    const init = QSuggest.split(key, cur) || {};
    return `<div class="pk-pane pk-build" data-pane="build" data-key="${key}" hidden>${PK_PARTS[key].map(([p, lbl]) => {
      const vals = QSuggest.top(p, 40), sel = init[p] || (p === 'where' ? '' : vals[0] || '');
      const chips = (p === 'where' ? [''] : []).concat(vals.includes(sel) || !sel ? vals : [sel, ...vals]);
      return `<div class="pk-row" data-part="${p}"><span class="lbl">${lbl}</span>${chips.map(v => `<button class="pk ${v === sel ? 'on' : ''}" data-bv="${esc(v)}">${v ? esc(v) : 'من جامعة القصيم'}</button>`).join('')}
        <input class="pk-bnew" placeholder="${p === 'where' ? 'جامعة أخرى... مثل: جامعة الملك سعود' : `${lbl} جديد...`}"></div>`;
    }).join('')}<div class="pk-prev" id="pkBPrev"></div><button class="btn primary pk-apply" data-bapply>✓ اعتماد</button></div>`;
  }
  function pkBuildVal() {
    const box = pk.querySelector('.pk-build'); if (!box) return '';
    const v = p => { const row = box.querySelector(`[data-part=${p}]`); const t = row.querySelector('.pk-bnew').value.trim(); return t || (row.querySelector('[data-bv].on') || { dataset: {} }).dataset.bv || ''; };
    if (box.dataset.key === 'degree') return v('level') && v('spec') ? `${v('level')} في ${v('spec')}` : '';
    let w = v('where'); if (w && !/^(ب|في\s)/.test(w)) w = 'ب' + w;
    return v('rank') && v('dept') ? `${v('rank')} في قسم ${v('dept').replace(/^قسم\s+/, '')}${w ? ' ' + w : ''}` : '';
  }
  function pkBuildUpd() { const o = $('#pkBPrev'); if (o) { const v = pkBuildVal(); o.textContent = v ? `النتيجة: ${v}` : 'اختر من كل سطر'; } }
  function pkTab(t) {
    pk.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    pk.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
    if (pkTarget) pkPlace(pkTarget);
  }
  pk.addEventListener('input', e => {
    if (!e.target.matches('.pk-bnew')) return;
    e.target.closest('.pk-row').querySelectorAll('[data-bv]').forEach(b => b.classList.toggle('on', false));
    pkBuildUpd();
  });
  const pkFoot = '<div class="pk-foot"><button class="pk" data-pk-type>⌨️ كتابة</button><button class="pk" data-pk-clear>مسح</button><button class="pk" data-pk-close>إغلاق</button></div>';
  function pkOpen(el) {
    document.querySelectorAll('.sugg').forEach(x => { x.hidden = true; });
    pkTarget = el; const kind = el.dataset.pick, cur = el.value.trim();
    if (kind && kind.startsWith('list:')) {
      const key = kind.slice(5);
      const LABEL = { gender: 'الجنس', degree: 'الدرجة', place: 'المكان', placeNote: 'ملاحظة المكان', mTitle: 'الصفة', mRole: 'الدور', notes: 'الملاحظة', coord: 'منسق الحجز' };
      let items = key === 'gender' ? ['ذكر', 'أنثى'] : QSuggest.top(key), mine = [], tip = 'الأكثر استخداماً أولاً';
      if (key === 'gender') {
        const st = pkRel(el, 'الطالب'); const g = st && st.value.trim() ? guessGender(st.value) : '';
        if (g) { items = [g, ...items.filter(x => x !== g)]; tip = `المقترح من الاسم: ${g}`; }
      } else if (key === 'mTitle') {
        mine = QSuggest.titlesOf((pkRel(el, 'الاسم') || {}).value);
        items = [...mine, ...items.filter(x => !mine.includes(x))];
      } else if (key === 'mRole') { // صيغة المؤنث أولاً إذا كانت الصفة لأستاذة
        const t = (pkRel(el, 'الصفة') || {}).value || '', fem = /^(ال)?(أستاذة|دكتورة)/.test(t.trim());
        const isF = v => /(ةً|ة)(\s|$)/.test(v);
        items = [...items.filter(v => isF(v) === fem), ...items.filter(v => isF(v) !== fem)];
      }
      const build = key === 'degree' || key === 'mTitle';
      const btn = v => `<button class="pk-li ${v === cur ? 'on' : ''}" data-v="${esc(v)}"><span>${esc(v)}</span>${mine.includes(v) ? '<em>سبق له</em>' : ''}${key === 'gender' ? '' : '<i class="pk-x" data-x title="إخفاء من القائمة">✕</i>'}</button>`;
      pk.innerHTML = `<h4>اختر ${LABEL[key] || ''} <span class="hint">${tip}</span></h4>
        ${build ? '<div class="pk-tabs"><button class="pk on" data-tab="list">📋 من القائمة</button><button class="pk" data-tab="build">🧩 تركيب جديد</button></div>' : ''}
        <div class="pk-pane" data-pane="list">
        ${key === 'gender' ? '' : '<input type="search" class="pk-search" placeholder="ابحث أو اكتب قيمة جديدة..." enterkeyhint="done">'}
        <div class="pk-list ${key === 'gender' ? 'pk-two' : ''}"><button class="pk-li pk-new" data-new hidden></button>${items.map(btn).join('')}</div>
        </div>${build ? pkBuilder(key, cur) : ''}${pkFoot}`;
      const sr = pk.querySelector('.pk-search'), nb = pk.querySelector('[data-new]');
      if (sr) {
        sr.addEventListener('input', () => {
          const q = nrm(sr.value), raw = sr.value.trim(); let exact = false;
          pk.querySelectorAll('.pk-li[data-v]').forEach(b => { const n = nrm(b.dataset.v); b.hidden = q && !n.includes(q); if (q && n === q) exact = true; });
          nb.hidden = !raw || exact; nb.dataset.nv = raw; nb.innerHTML = `➕ استخدام «${esc(raw)}» <small>ويُضاف للقائمة</small>`;
        });
        sr.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return; e.preventDefault();
          const first = [...pk.querySelectorAll('.pk-li[data-v]')].find(b => !b.hidden);
          if (!nb.hidden) nb.click(); else if (first && sr.value.trim()) first.click();
        });
        if (matchMedia('(pointer: fine)').matches) setTimeout(() => sr.focus(), 30);
      }
      if (build && !items.length) pkTab('build');
      if (build) pkBuildUpd();
    } else if (kind === 'day') {
      pk.innerHTML = `<h4>اختر اليوم</h4><div class="pk-row">${DAYS.map(d => `<button class="pk ${d === cur ? 'on' : ''}" data-v="${d}">${d}</button>`).join('')}</div>${pkFoot}`;
    } else if (kind === 'time') {
      const m = toLatin(cur).match(/:(\d{2})/); const mins = m ? m[1] : '00';
      const hb = (hs, suf) => hs.map(h => `<button class="pk" data-h="${h}" data-s="${suf}">${h}</button>`).join('');
      pk.innerHTML = `<h4>اختر الوقت</h4>
        <div class="pk-row"><span class="lbl">الدقائق</span>${['00', '15', '30', '45'].map(x => `<button class="pk ${x === mins ? 'on' : ''}" data-min="${x}"><bdi dir="ltr">:${x}</bdi></button>`).join('')}</div>
        <div class="pk-row"><span class="lbl">صباحاً</span>${hb([7, 8, 9, 10, 11], 'صباحاً')}</div>
        <div class="pk-row"><span class="lbl">ظهراً</span>${hb([12, 1, 2, 3], 'ظهراً')}</div>
        <div class="pk-row"><span class="lbl">مساءً</span>${hb([4, 5, 6, 7, 8, 9], 'مساءً')}</div>${pkFoot}`;
    } else {
      let iso = '';
      const g = hijriToGreg(cur); if (g) { const [y, mo, d] = g.split('/'); iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
      pk.innerHTML = `<h4>اختر التاريخ <span class="hint">(يعبّي الهجري واليوم)</span></h4>
        <input type="date" id="pkDate" value="${iso}">
        <div class="pk-prev" id="pkPrev">${cur ? esc(cur) + (g ? ' = ' + g : '') : ''}</div>
        <div class="pk-row"><button class="pk" data-qd="0">اليوم</button><button class="pk" data-qd="1">بكرة</button><button class="pk" data-qd="7">بعد أسبوع</button></div>${pkFoot}`;
      const di = $('#pkDate');
      const apply = d => {
        const h = gregToHijri(d); pkSet(pkTarget, h.text);
        const dayEl = pkSibling(pkTarget, 'day'); if (dayEl) pkSet(dayEl, h.day);
        $('#pkPrev').textContent = `${h.day} ${h.text} = ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ✓`;
      };
      di.addEventListener('change', () => { if (di.value) { apply(new Date(di.value + 'T12:00:00')); setTimeout(pkClose, 700); } });
      pk.querySelectorAll('[data-qd]').forEach(b => b.onclick = () => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() + +b.dataset.qd); apply(d); setTimeout(pkClose, 600); });
    }
    pkPlace(el);
  }
  pk.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
  pk.addEventListener('click', e => {
    if (!pkTarget) return;
    const lk = (pkTarget.dataset.pick || '').startsWith('list:') ? pkTarget.dataset.pick.slice(5) : '';
    const x = e.target.closest('[data-x]');
    if (x) { // إخفاء قيمة من القائمة مع إمكانية التراجع
      const it = x.closest('[data-v]'), v = it.dataset.v; QSuggest.hide(lk, v); it.remove();
      toast(`أُخفيت «${v}» من القائمة`, false, { label: 'تراجع', fn: () => QSuggest.hide(lk, v, false) });
      return;
    }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { pkTab(b.dataset.tab); return; }
    if (b.dataset.bv != null) {
      const row = b.closest('.pk-row'); row.querySelectorAll('[data-bv]').forEach(x => x.classList.toggle('on', x === b));
      row.querySelector('.pk-bnew').value = ''; pkBuildUpd(); return;
    }
    if (b.hasAttribute('data-bapply')) {
      const v = pkBuildVal(); if (!v) { toast('اختر من كل سطر أولاً', true); return; }
      pkSet(pkTarget, v); QSuggest.learn(lk, v); pkClose(); toast(`✓ ${v} — صارت في القائمة`); return;
    }
    if (b.hasAttribute('data-new')) { const v = b.dataset.nv; pkSet(pkTarget, v); QSuggest.learn(lk, v); pkClose(); toast(`✓ أُضيفت «${v}» للقائمة`); return; }
    if (b.dataset.v) { pkSet(pkTarget, b.dataset.v); if (lk) QSuggest.learn(lk, b.dataset.v); pkClose(); }
    else if (b.dataset.min) { pk.querySelectorAll('[data-min]').forEach(x => x.classList.toggle('on', x === b)); }
    else if (b.dataset.h) {
      const min = (pk.querySelector('[data-min].on') || {}).dataset; const mm = min && min.min !== '00' ? ':' + min.min : '';
      pkSet(pkTarget, `${b.dataset.h}${mm} ${b.dataset.s}`); pkClose();
    }
    else if (b.hasAttribute('data-pk-clear')) { pkSet(pkTarget, ''); pkClose(); }
    else if (b.hasAttribute('data-pk-close')) pkClose();
    else if (b.hasAttribute('data-pk-type')) { const el = pkTarget; pkClose(); el._pkSwitch = true; el.setAttribute('inputmode', 'text'); el.blur(); setTimeout(() => { el.focus(); el._pkSwitch = false; }, 60); }
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('input[data-pick]');
    if (el && el.getAttribute('inputmode') === 'none') { pkOpen(el); return; }
    if (!pk.hidden && !e.target.closest('#picker')) pkClose();
  });
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!pk.hidden && el !== pkTarget && !pk.contains(el) && !(el.matches && el.matches('input[data-pick]'))) pkClose();
    if (el.matches && el.matches('input[data-pick]') && el.getAttribute('inputmode') === 'none' && pkTarget !== el) pkOpen(el);
  });
  document.addEventListener('focusout', e => { // بعد الكتابة اليدوية يرجع للمنتقي
    const el = e.target; if (el._pkSwitch) return;
    if (el.matches && el.matches('input[data-pick]') && el.getAttribute('inputmode') === 'text') setTimeout(() => { if (document.activeElement !== el) el.setAttribute('inputmode', 'none'); }, 200);
  });
  window.addEventListener('scroll', () => { if (pkTarget) pkPlace(pkTarget); }, true);
  // ---------- البدء ----------
  fillForm();
  drawPreview();
  renderGrid();
  HDB.get(editingId || -1).then(it => setEditing(it ? it.id : null, it && it.title)).catch(() => setEditing(null));
  if (document.fonts) document.fonts.ready.then(() => drawPreview());
})();
