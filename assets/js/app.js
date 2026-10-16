/* واجهة المحرر: الحقول، المعاينة، الإكسل/جوجل شيت، التحميل، القوالب، الموظفين */
(function () {
  'use strict';
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
    if (out.v !== 2) { out.opt.qr = false; out.v = 2; } // رمز QR يظهر فقط عند تفعيل المربع
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
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'toast'; }, 3500);
  }
  const overlay = {
    show(txt) { $('#overlayText').textContent = txt; $('#overlayBar').style.width = '0'; $('#overlay').classList.add('open'); },
    progress(p, txt) { $('#overlayBar').style.width = Math.round(p * 100) + '%'; if (txt) $('#overlayText').textContent = txt; },
    hide() { $('#overlay').classList.remove('open'); }
  };
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  $('#who').textContent = `مرحباً، ${session.name || session.u}`;
  $('#brandLogo').insertAdjacentHTML('afterbegin', `<img src="${DEFAULT_LOGO}" alt="" class="brand-logo">`);
  if (session.role === 'admin') $('#btnUsers').hidden = false;
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
    $$('[data-c]').forEach(el => { el.value = state.theme[el.dataset.c]; });
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
  $$('[data-c]').forEach(el => el.addEventListener('input', () => { state.theme[el.dataset.c] = el.value; changed(); }));

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
        <input type="text" data-m="title" placeholder="الصفة" value="${esc(m.title)}">
        <input type="text" data-m="role" placeholder="الدور" value="${esc(m.role)}">
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
  $$('[data-pf]').forEach(b => b.onclick = () => {
    currentFmt = getFormat(b.dataset.pf);
    $('#customBox').hidden = b.dataset.pf !== 'custom';
    $$('[data-pf]').forEach(x => x.classList.toggle('active', x === b));
    changed(true);
  });
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
  let defaultFmts = ['exact', 'youtube'];
  try { const saved = JSON.parse(localStorage.getItem(userKey('fmts'))); if (Array.isArray(saved) && saved.length) defaultFmts = saved; } catch (e) { /* افتراضي */ }
  $('#exportFormats').innerHTML = FORMATS.map(f => `<label class="fmt"><input type="checkbox" value="${f.id}" ${defaultFmts.includes(f.id) ? 'checked' : ''}>
      <span>${f.name}<small>${f.w}×${f.h}</small></span></label>`).join('') +
    `<label class="fmt"><input type="checkbox" value="custom"><span>المقاس المخصص<small>من شريط المعاينة</small></span></label>`;
  $('#exportFormats').addEventListener('change', () => {
    try { localStorage.setItem(userKey('fmts'), JSON.stringify($$('#exportFormats input:checked').map(i => i.value))); } catch (e) { /* اختياري */ }
  });
  const selectedFormats = () => $$('#exportFormats input:checked').map(i => getFormat(i.value));

  const exportEl = $('#exportPoster');
  let fontCSS = null;
  async function getFontCSS() {
    if (fontCSS == null) {
      try { fontCSS = await htmlToImage.getFontEmbedCSS(posterEl); } catch (e) { fontCSS = ''; }
    }
    return fontCSS;
  }

  async function capture(s, f, scale) {
    render(exportEl, s, f);
    await settle(exportEl);
    fit(exportEl);
    await nextFrame();
    const ratio = f.w * scale > 6000 ? 1 : scale;
    return htmlToImage.toCanvas(exportEl, {
      width: f.w, height: f.h, pixelRatio: ratio, fontEmbedCSS: await getFontCSS(),
      backgroundColor: '#ffffff', filter: n => !(n.classList && n.classList.contains('qp-safe'))
    });
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
    put(item) { return this.tx('readwrite', st => st.put(item)); },
    get(id) { return this.tx('readonly', st => st.get(id)); },
    del(id) { return this.tx('readwrite', st => st.delete(id)); },
    list() { return this.tx('readonly', st => st.index('user').getAll(session.u.toLowerCase())); }
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
      if (s === state) setEditing(id, item.title);
      if (window.QSuggest) QSuggest.refreshHistory();
      if (!quiet) toast(existing ? 'تم تحديث التصميم في السجل ✓' : 'تم الحفظ في السجل ✓');
      return id;
    } catch (e) { console.error(e); toast('تعذّر الحفظ في السجل', true); return null; }
  }

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
    if (!confirm(`حذف ${histSel.size} تصميم من السجل نهائياً؟`)) return;
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
  $('#btnNew').onclick = () => {
    if (!confirm('بدء تصميم جديد من النموذج الافتراضي؟ (التصاميم المحفوظة في السجل لا تتأثر)')) return;
    state = normalize(); setEditing(null); activeRow = -1; $$('#sheet tbody tr.active').forEach(t => t.classList.remove('active')); fillForm(); changed();
  };

  // ---------- الإكسل وجوجل شيت ----------
  const FIELD_MAP = {
    'الكلية': 'college', 'سطر الافتتاح': 'college', 'college': 'college',
    'نص الإعلان': 'intro', 'الإعلان': 'intro', 'intro': 'intro',
    'الدرجة': 'degree', 'التخصص': 'degree', 'الدرجة والتخصص': 'degree', 'degree': 'degree',
    'من قبل': 'by', 'by': 'by',
    'العنوان': 'title', 'عنوان الرسالة': 'title', 'title': 'title',
    'الطالب': 'student', 'اسم الطالب': 'student', 'الطالبة': 'student', 'المقدم': 'student', 'student': 'student', 'name': 'student',
    'الجنس': 'gender', 'gender': 'gender',
    'اليوم': 'day', 'day': 'day', 'التاريخ': 'date', 'date': 'date', 'الوقت': 'time', 'time': 'time',
    'المكان': 'place', 'القاعة': 'place', 'place': 'place', 'ملاحظة المكان': 'placeNote', 'ملاحظة': 'placeNote', 'note': 'placeNote',
    'رابط البث': 'link', 'الرابط': 'link', 'link': 'link',
    'رابط اللجنة': 'committeeLink', 'رابط الزوم': 'committeeLink', 'رابط المناقش الخارجي': 'committeeLink', 'رابط خاص باللجنة': 'committeeLink',
    'رابط التسجيل': 'recordingLink', 'التسجيل': 'recordingLink'
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
  const GCOLS = ['الدرجة', 'الجنس', 'الطالب', 'العنوان', 'اليوم', 'التاريخ', 'الوقت', 'المكان', 'ملاحظة المكان', 'رابط البث', 'رابط اللجنة', 'رابط التسجيل'];
  const GFIELD = { 'الدرجة': 'degree', 'الجنس': 'gender', 'الطالب': 'student', 'العنوان': 'title',
    'اليوم': 'day', 'التاريخ': 'date', 'الوقت': 'time', 'المكان': 'place', 'ملاحظة المكان': 'placeNote', 'رابط البث': 'link',
    'رابط اللجنة': 'committeeLink', 'رابط التسجيل': 'recordingLink' };
  const GMEM = 5;
  const PICK_COL = { 'اليوم': 'day', 'التاريخ': 'date', 'الوقت': 'time' };
  for (let i = 1; i <= GMEM; i++) GCOLS.push(`عضو${i} الاسم`, `عضو${i} الصفة`, `عضو${i} الدور`);
  const emptyRow = () => GCOLS.map(() => '');
  let grid = [];
  try { grid = JSON.parse(localStorage.getItem(userKey('grid'))) || []; } catch (e) { grid = []; }
  // ترحيل جداول محفوظة بالشكل القديم (كان أول عمودين: الكلية، نص الإعلان)
  // ترحيل الجداول المحفوظة بإصدارات سابقة
  if (grid.length && +(localStorage.getItem(userKey('gridv')) || 0) < 3) {
    if (grid[0].length === 27) grid = grid.map(r => r.slice(2)); // كان فيه الكلية ونص الإعلان
    if (grid[0] && grid[0].length === 25) grid = grid.map(r => [...r.slice(0, 10), '', '', ...r.slice(10)]); // إضافة رابط اللجنة ورابط التسجيل
  }
  try { localStorage.setItem(userKey('gridv'), '3'); } catch (e) { /* اختياري */ }
  const gridSel = new Set();
  const isEmptyRow = r => r.every(v => !String(v || '').trim());
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
  function syncRows() { updateGridInfo(); }
  function updateGridInfo() {
    const total = grid.filter(r => !isEmptyRow(r)).length, sel = gridItems(true).length;
    $('#gridCount').textContent = `(${total} إعلان)`;
    $('#gSelCount').textContent = sel ? `محدد: ${sel}` : '';
  }
  function setRows(list) {
    grid = list.map(o => dataToGrid(parseRow(o))).filter(r => !isEmptyRow(r));
    gridSel.clear();
    grid.forEach((_, i) => gridSel.add(i));
    try { localStorage.setItem(userKey('grid'), JSON.stringify(grid)); } catch (e) { /* مساحة */ }
    renderGrid();
    $('#dataSheet').scrollIntoView({ behavior: 'smooth' });
    toast(grid.length ? `تم استيراد ${grid.length} إعلان إلى الجدول ✓` : 'لم يتم العثور على أعمدة مطابقة – استخدم الملف النموذجي', !grid.length);
  }

  function renderGrid() {
    if (!grid.length) grid = Array.from({ length: 5 }, emptyRow);
    computeConflicts();
    const cls = c => /العنوان/.test(c) ? 'w-title' : /رابط/.test(c) ? 'w-link' : /الجنس|اليوم|الوقت|الدور/.test(c) ? 'w-sm' : '';
    $('#sheet').innerHTML = `<thead><tr><th class="n">#</th><th class="act">عرض / نسخ</th>${GCOLS.map(c => `<th class="${/^عضو/.test(c) ? 'mem' : ''}">${c}</th>`).join('')}</tr></thead>
      <tbody>${grid.map((r, i) => `<tr data-r="${i}" class="${gridSel.has(i) ? 'sel' : ''} ${i === activeRow ? 'active' : ''} ${missingOf(r).length ? 'incomplete' : ''} ${conflicts.has(i) ? 'conflict' : ''}"><td class="n"><label><input type="checkbox" data-gsel ${gridSel.has(i) ? 'checked' : ''}>${i + 1}</label>${warnHtml(r)}${conflictHtml(i)}</td><td class="act"><button data-view title="عرض في التصميم">👁</button><button data-dup title="تكرار السطر (نفس اللجنة لطالب آخر)">⧉</button><button data-msg="invite" class="msg-b" title="نسخ رسالة الدعوة">دعوة</button><button data-wa="invite" class="wa-i" title="إرسال الدعوة بالواتساب">💬</button><button data-msg="record" class="msg-b ${r[GCOLS.indexOf('رابط التسجيل')] ? 'has' : ''}" title="نسخ رسالة التسجيل">تسجيل</button><button data-wa="record" class="wa-i" title="إرسال التسجيل بالواتساب">💬</button></td>${
        GCOLS.map((c, j) => `<td><input type="text" class="${cls(c)}" data-c="${j}" value="${esc(r[j] || '')}"${PICK_COL[c] ? ` inputmode="none" data-pick="${PICK_COL[c]}"` : ''}${c === 'رابط البث' ? ' dir="ltr" placeholder="يوتيوب (افتراضي)"' : c === 'رابط اللجنة' ? ' dir="ltr" placeholder="زوم (اختياري)"' : c === 'رابط التسجيل' ? ' dir="ltr" placeholder="بعد المناقشة"' : ''}></td>`).join('')}</tr>`).join('')}</tbody>`;
    updateGridInfo();
    const b = $('#gConflicts'); if (b) { b.hidden = !conflicts.size; b.textContent = `🔴 ${conflicts.size} سطر فيه تعارض`; }
    formConflictCheck();
  }
  let activeRow = -1, rowSnap = null;
  const gridOfState = () => dataToGrid({ ...state, gender: /طالبة/.test(state.by || '') ? 'أنثى' : 'ذكر' });
  // الحقول الأساسية لكل إعلان؛ السطر الناقص يظهر عليه ⚠️
  const REQUIRED = ['الطالب', 'الدرجة', 'العنوان', 'التاريخ', 'الوقت', 'المكان', 'عضو1 الاسم'];
  function missingOf(r) { return isEmptyRow(r) ? [] : REQUIRED.filter(c => !String(r[GCOLS.indexOf(c)] || '').trim()); }
  function warnHtml(r) { const m = missingOf(r); return m.length ? ` <span class="warn" title="ناقص: ${esc(m.join('، '))}">⚠️</span>` : ''; }
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
  const REMOTE = v => /عن\s*بعد|اونلاين|أونلاين|zoom|زوم|تيمز/i.test(v || '');
  const CI = name => GCOLS.indexOf(name);
  function slotOf(r) {
    if (!r || isEmptyRow(r)) return null;
    const date = dateKey(r[CI('التاريخ')]); if (!date) return null;
    const timeRaw = r[CI('الوقت')], place = r[CI('المكان')];
    const members = [];
    for (let k = 1; k <= GMEM; k++) { const n = nrm(r[CI(`عضو${k} الاسم`)]); if (n) members.push([n, r[CI(`عضو${k} الاسم`)]]); }
    const link = String(r[CI('رابط البث')] || '').trim() || DEFAULTS.link; // الفاضي = قناة اليوتيوب الافتراضية
    return { date, t: timeMin(timeRaw), timeRaw: nrm(timeRaw), place: REMOTE(place) ? '' : nrm(place), placeRaw: place, student: r[CI('الطالب')], members,
      linkKey: link.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, ''), platform: QPoster.platformOf(link).name,
      zoomKey: String(r[CI('رابط اللجنة')] || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, '') };
  }
  function clash(a, b) {
    if (!a || !b || a.date !== b.date) return null;
    const near = (a.t != null && b.t != null) ? Math.abs(a.t - b.t) < 120 : (a.timeRaw && a.timeRaw === b.timeRaw);
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
    const slots = grid.map(slotOf);
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
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
    return ` <span class="conf" title="${esc(conflictText(i, list).join('\n'))}">🔴</span>`;
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
    if (b) { b.hidden = !rowsWith; b.textContent = `🔴 ${rowsWith} سطر فيه تعارض`; }
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
      if (i === activeRow) return;
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
      const copy = grid[r].slice();
      ['الطالب', 'العنوان', 'الجنس'].forEach(c => { copy[GCOLS.indexOf(c)] = ''; });
      grid.splice(r + 1, 0, copy);
      const shifted = [...gridSel].map(i => i > r ? i + 1 : i); gridSel.clear(); shifted.forEach(i => gridSel.add(i));
      if (activeRow > r) activeRow++;
      renderGrid(); gridChanged();
      const st = cellAt(r + 1, GCOLS.indexOf('الطالب')); if (st) st.focus();
      return toast('تم تكرار السطر — اكتب اسم الطالب والعنوان الجديد');
    }
    if (!e.target.closest('[data-view]')) return;
    const r = +e.target.closest('tr').dataset.r;
    if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
    const data = parseRow(gridToObj(grid[r]));
    state = applyRow(state, data); activeRow = r;
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
    updRowWarn(r);
    refreshConflictsSoon(r);
    gridChanged();
  });
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
    let data = parseTSV(text);
    const r0 = +inp.closest('tr').dataset.r;
    let map = null; // إذا كان أول سطر عناوين، نرتّب الأعمدة حسب أسمائها
    const norm = v => normKey(v).replace(/عضو\s*(\d+)/, 'عضو$1');
    const hdr = data[0].map(h => GCOLS.findIndex(c => norm(c) === norm(h) || NMAP[norm(h)] && NMAP[norm(h)] === GFIELD[c]));
    if (hdr.filter(i => i >= 0).length >= 2) { map = hdr; data = data.slice(1); }
    const c0 = map ? 0 : +inp.dataset.c;
    data.forEach((vals, k) => {
      const r = r0 + k;
      while (grid.length <= r) grid.push(emptyRow());
      vals.forEach((v, j) => {
        const col = map ? map[j] : c0 + j;
        if (col >= 0 && col < GCOLS.length) grid[r][col] = v;
      });
    });
    renderGrid(); gridChanged();
    toast(`تم لصق ${data.length} سطر ✓`);
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
  $('#gAdd').onclick = () => { grid.push(emptyRow()); renderGrid(); gridChanged(); };
  $('#gAdd5').onclick = () => { for (let i = 0; i < 5; i++) grid.push(emptyRow()); renderGrid(); gridChanged(); };
  $('#gFromDesign').onclick = () => {
    const firstEmpty = grid.findIndex(isEmptyRow);
    const row = dataToGrid({ ...state, gender: /طالبة/.test(state.by) ? 'أنثى' : 'ذكر' });
    if (firstEmpty >= 0) grid[firstEmpty] = row; else grid.push(row);
    renderGrid(); gridChanged(); toast('تمت إضافة التصميم الحالي كصف ✓');
  };
  $('#gDel').onclick = () => {
    if (!gridSel.size) return toast('حدد الصفوف من المربعات بجانب الأرقام', true);
    if (!confirm(`حذف ${gridSel.size} سطر؟`)) return;
    grid = grid.filter((_, i) => !gridSel.has(i)); gridSel.clear(); activeRow = -1; renderGrid(); gridChanged();
  };
  $('#gClear').onclick = () => {
    if (!confirm('مسح كل بيانات الجدول؟')) return;
    grid = []; gridSel.clear(); activeRow = -1; renderGrid(); gridChanged();
  };
  $('#gExport').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet([GCOLS, ...grid.filter(r => !isEmptyRow(r))]);
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
  $('#gSelAll').onclick = () => { grid.forEach((r, i) => { if (!isEmptyRow(r)) gridSel.add(i); }); renderGrid(); };
  $('#gSelNone').onclick = () => { gridSel.clear(); renderGrid(); };
  const selectedGridStates = () => gridItems(true).map(r => ({ label: r.data.student || `سطر ${r.n}`, state: applyRow(state, r.data) }));
  $('#gDl').onclick = () => $('#exRows').click();
  $('#gPrint').onclick = () => {
    const items = selectedGridStates();
    if (!items.length) return toast('حدد الأسطر من المربعات بجانب الأرقام', true);
    printStates(items.map(x => x.state));
  };
  $('#gExportCsv').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet([GCOLS, ...grid.filter(r => !isEmptyRow(r))]);
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
    let m = text.match(/(\d{1,2}(?::\d{2})?)\s*(صباحاً|صباحا|ص|ظهراً|ظهرا|مساءً|مساء|م)(?![؀-ۿ])/);
    if (m) { const suf = /^ص/.test(m[2]) ? 'صباحاً' : /^ظ/.test(m[2]) ? 'ظهراً' : 'مساءً'; return `${m[1]} ${suf}`; }
    m = text.match(/الساع[ةه]\s*(\d{1,2})(:\d{2})?/);
    if (m) { const h = +m[1]; return `${m[1]}${m[2] || ''} ${h >= 6 && h <= 11 ? 'صباحاً' : h === 12 ? 'ظهراً' : 'مساءً'}`; }
    return '';
  }
  function parseBookingCell(raw, colHour) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!/مناقش/.test(text)) return null;
    const remote = /عن\s*بعد/.test(text);
    const time = timeIn(text) || (colHour ? hourText(colHour) : '');
    const parts = text.replace(/^مناقش(ة|ات)\s*/, '').split(/\s+[-–—]\s*|\s*[-–—]\s+/).map(x => x.trim()).filter(Boolean);
    let degree = '', student = '';
    for (const part of parts) {
      const clean = part.replace(/عن\s*بعد.*$/, '').replace(/(الساع[ةه]\s*)?\d{1,2}(:\d{2})?\s*(صباحاً|صباحا|ص|ظهراً|ظهرا|مساءً|مساء|م)?(?![؀-ۿ]).*$/, '').trim();
      const dm = clean.match(/^(?:ال)?(ماجستير|دكتوراه|دكتوراة)\s*(.*)$/);
      if (dm && !degree) {
        const level = /ماجستير/.test(dm[1]) ? 'الماجستير' : 'الدكتوراه';
        const spec = fixSpelling(dm[2]).replace(/^في\s+/, '');
        degree = spec ? `${level} في ${spec}` : level;
      } else if (clean && !student && !/^عن\s*بعد/.test(clean)) student = clean;
    }
    if (!degree) return null; // خانة بدون درجة (مثل «مناقشات الدراسات العليا») ليست إعلاناً
    return { degree, student, gender: student ? guessGender(student) : '', time,
      place: remote ? 'عن بعد' : 'قاعة ابن عثيمين', placeNote: remote ? '(عبر الإنترنت)' : '(والبث عبر الإنترنت)' };
  }
  function findBooking(aoa) {
    for (let r = 0; r < Math.min(aoa.length, 15); r++) {
      const row = aoa[r].map(v => String(v || '').trim());
      const hours = row.map((v, i) => { const m = v.match(/^س\s*(\d{1,2})$/); return m ? [i, +m[1]] : null; }).filter(Boolean);
      const dayCol = row.findIndex(v => v === 'يوم' || v === 'اليوم');
      const hijriCol = row.findIndex(v => /هجري/.test(v));
      if (hours.length >= 2 && hijriCol >= 0) return { headerRow: r, hours, dayCol, hijriCol, noteCol: row.findIndex(v => /ملاحظ/.test(v)) };
    }
    return null;
  }
  function parseBooking(aoa, info) {
    const out = [];
    for (let r = info.headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const hj = String(row[info.hijriCol] || '').trim().match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (!hj) continue;
      const [y, m, d] = [+hj[1], +hj[2], +hj[3]];
      const note = info.noteCol >= 0 ? String(row[info.noteCol] || '').trim() : '';
      info.hours.forEach(([col, h]) => {
        const data = parseBookingCell(row[col], h);
        if (!data) return;
        out.push({ ...data, day: info.dayCol >= 0 ? String(row[info.dayCol] || '').trim() : '', date: `${y}/${m}/${d} هـ`,
          _y: y, _m: m, _d: d, _note: note, _postponed: /تأجيل|التأجيل/.test(note) && !/انتهت/.test(note) });
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
  function importWorkbook(wb) {
    for (const name of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
      const info = findBooking(aoa);
      if (info) { bookingItems = parseBooking(aoa, info); return openBookingDialog(name); }
    }
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
    const rowsNew = sel.map(it => dataToGrid(it));
    if ($('#bkMode').value === 'replace') { grid = []; gridSel.clear(); activeRow = -1; }
    grid = grid.filter(r => !isEmptyRow(r));
    const start = grid.length; grid.push(...rowsNew); rowsNew.forEach((_, k) => gridSel.add(start + k));
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
  const TEMPLATE_URL = 'assets/templates/template.xlsx?v=202610160136';
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
  const openModal = id => $(id).classList.add('open');
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
      <td><span class="tag">${u.role === 'admin' ? 'مدير' : 'موظف'}</span></td>
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
  $('#pSave').onclick = async () => {
    if ($('#pNew').value !== $('#pNew2').value) return toast('كلمتا المرور غير متطابقتين', true);
    try {
      await QAuth.changePassword(session.u, $('#pOld').value, $('#pNew').value);
      $('#mPass').classList.remove('open'); $('#weakBanner').hidden = true;
      toast(session.role === 'admin' ? 'تم التغيير ✓ — صدّر users.json من «الموظفون» لتطبيقه على كل الأجهزة' : 'تم تغيير كلمة المرور ✓');
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
      place: ['قاعة ابن عثيمين'], placeNote: ['(والبث عبر الإنترنت)'],
      mTitle: ['الأستاذ في قسم الفقه', 'الأستاذ المشارك في قسم الفقه', 'الأستاذ المساعد في قسم الفقه',
        'الأستاذ في قسم أصول الفقه', 'الأستاذ المشارك في قسم أصول الفقه', 'الأستاذ المساعد في قسم أصول الفقه'],
      mRole: ['مشرفاً ومقرراً', 'مشرفاً', 'مشرفاً مشاركاً', 'مناقشاً', 'مناقشاً خارجياً', 'مشرفةً ومقررةً', 'مناقِشةً'],
      mName: [],
      link: [DEFAULTS.link]
    };
    const FORM_KEYS = { degree: 'degree', day: 'day', time: 'time', place: 'place', placeNote: 'placeNote', link: 'link' };
    const EMO = { youtube: '▶️', zoom: '🎥', teams: '👥', webex: '🌐', blackboard: '🎓', meet: '📹', link: '🔗' };
    const platform = v => { const p = QPoster.platformOf(v); return `${EMO[p.id]} ${p.name}${v === DEFAULTS.link ? ' (الافتراضي)' : ''}`; };
    const M_KEYS = { name: 'mName', title: 'mTitle', role: 'mRole' };
    const COL_KEY = c => /الاسم$/.test(c) ? 'mName' : /الصفة$/.test(c) ? 'mTitle' : /الدور$/.test(c) ? 'mRole'
      : { 'الدرجة': 'degree', 'اليوم': 'day', 'الوقت': 'time', 'الجنس': 'gender', 'المكان': 'place', 'ملاحظة المكان': 'placeNote', 'رابط البث': 'link' }[c] || null;
    const norm = v => String(v || '').replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
    let histStates = [];
    let dirty = true, counts = {}, nameTitle = {};
    const learnKey = userKey('learn');
    const readLearn = () => { try { return JSON.parse(localStorage.getItem(learnKey)) || {}; } catch (e) { return {}; } };

    function add(key, v, w = 1) {
      v = String(v || '').trim(); if (!v || v.length > 200) return;
      (counts[key] = counts[key] || new Map()).set(v, (counts[key].get(v) || 0) + w);
    }
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
      Object.entries(readLearn()).forEach(([k, arr]) => (arr || []).forEach(v => add(k, v)));
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
      const nq = norm(q);
      const out = [];
      m.forEach((n, v) => {
        const nv = norm(v);
        if (nq && nv === nq) return;
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
    function hide() { box.hidden = true; target = null; items = []; idx = -1; }
    function show(el) {
      const key = keyOf(el); if (!key) return hide();
      items = matches(key, el.value);
      if (!items.length) return hide();
      target = el; idx = -1;
      const q = norm(el.value);
      box.innerHTML = `<div class="sugg-h">${key === 'mName' ? 'أسماء سابقة' : key === 'link' ? 'روابط البث' : 'اقتراحات'}</div>` + items.map((v, i) => {
        const t = key === 'mName' && nameTitle[v] ? [...nameTitle[v].entries()].sort((a, b) => b[1] - a[1])[0][0] : key === 'link' ? platform(v) : '';
        return key === 'link'
          ? `<div class="sugg-i" data-i="${i}"><span>${esc(t)}</span><small dir="ltr">${esc(v)}</small></div>`
          : `<div class="sugg-i" data-i="${i}"><span>${esc(v)}</span>${t ? `<small>${esc(t)}</small>` : ''}</div>`;
      }).join('');
      const r = el.getBoundingClientRect();
      const w = Math.max(r.width, 240);
      box.style.width = w + 'px';
      box.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
      box.hidden = false;
      const below = innerHeight - r.bottom, h = box.offsetHeight;
      box.style.top = (below < h + 10 && r.top > h + 10 ? r.top - h - 4 : r.bottom + 4) + 'px';
      if (!q && document.activeElement !== el) hide();
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
      learn(key, v); hide();
    }
    box.addEventListener('mousedown', e => e.preventDefault());
    box.addEventListener('click', e => { const it = e.target.closest('.sugg-i'); if (it) pick(+it.dataset.i); });
    document.addEventListener('focusin', e => { if (keyOf(e.target)) show(e.target); });
    document.addEventListener('input', e => { if (keyOf(e.target) && e.isTrusted) show(e.target); });
    document.addEventListener('focusout', e => {
      const k = keyOf(e.target); if (k) learn(k, e.target.value);
      setTimeout(() => { if (document.activeElement !== target) hide(); }, 120);
    });
    document.addEventListener('keydown', e => {
      if (box.hidden || e.target !== target) return;
      const all = box.querySelectorAll('.sugg-i');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        all.forEach((n, i) => n.classList.toggle('on', i === idx));
      } else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); e.stopPropagation(); pick(idx); }
      else if (e.key === 'Escape') hide();
    }, true);
    window.addEventListener('scroll', () => { if (target) show(target); }, true);
    window.addEventListener('resize', hide);
    refreshHistory();
    return { refreshHistory, markDirty: () => { dirty = true; } };
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
  if (!localStorage.getItem(userKey('helpSeen'))) {
    setTimeout(() => openModal('#mHelp'), 800);
    try { localStorage.setItem(userKey('helpSeen'), '1'); } catch (e) { /* اختياري */ }
  }


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
  function msgVars(s) {
    const female = /طالبة/.test(s.by || '') || /أنثى|انثى/.test(s.gender || '');
    const deg = String(s.degree || '').trim().replace(/^ال(ماجستير|دكتوراه)/, '$1');
    return {
      'نوع_الرسالة': deg ? `رسالة ${deg}` : 'رسالة علمية', 'للباحث': female ? 'للباحثة' : 'للباحث', 'الطالب': String(s.student || '').trim(),
      'العنوان': String(s.title || '').replace(/\s*\n\s*/g, ' – ').trim(), 'اليوم': String(s.day || '').trim(), 'التاريخ': hijriText(s.date),
      'الميلادي': hijriToGreg(s.date), 'الوقت': String(s.time || '').trim(), 'المكان': String(s.place || '').trim(),
      'رابط_البث': String(s.link || '').trim() || DEFAULTS.link, 'رابط_اللجنة': String(s.committeeLink || '').trim(), 'رابط_التسجيل': String(s.recordingLink || '').trim()
    };
  }
  function fillTpl(tpl, v) {
    // [[ ... ]] جزء اختياري: يُحذف إذا كان فيه متغير فاضي
    let out = tpl.replace(/\[\[([\s\S]*?)\]\]/g, (m, inner) => (inner.match(/\{([^}]+)\}/g) || []).every(k => v[k.slice(1, -1)]) ? inner : '');
    out = out.replace(/\{([^}]+)\}/g, (m, k) => v[k] != null ? v[k] : m);
    out = out.replace(/الموافق\s*\./g, '.').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
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
  $('#sheet').addEventListener('click', e => {
    const b = e.target.closest('[data-msg]'); if (!b) return;
    const r = +b.closest('tr').dataset.r;
    if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
    const st = applyRow(state, parseRow(gridToObj(grid[r])));
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
  const canShareFiles = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.jpg', { type: 'image/jpeg' })] })); } catch (e) { return false; } };
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
    try {
      if (readyBlob) SEND.blob = readyBlob;
      else { const cv = await capture(s, FORMATS[0], 2); SEND.blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.93)); } // الصورة الأصلية الكاملة
      SEND.file = new File([SEND.blob], `${safeName(s.student || 'اعلان')}.jpg`, { type: 'image/jpeg' });
      if (img._url) URL.revokeObjectURL(img._url);
      img._url = URL.createObjectURL(SEND.blob); img.src = img._url;
      $('#sendImgNote').textContent = 'الصورة الأصلية الكاملة — جاهزة ✓';
    } catch (e) { $('#sendImgNote').textContent = 'تعذّر تجهيز الصورة'; }
  }
  $$('[data-send]').forEach(b => b.onclick = () => sendSetKind(b.dataset.send));
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
    try { const cv = await capture(s, FORMATS[0], 2); blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.93)); }
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
  $('#waInvite').onclick = () => sendDirect(state, 'invite', true);
  $('#waRecord').onclick = () => sendDirect(state, 'record', true);
  $('#sheet').addEventListener('click', e => {
    const b = e.target.closest('[data-wa]'); if (!b) return;
    const r = +b.closest('tr').dataset.r;
    if (isEmptyRow(grid[r])) return toast('هذا السطر فاضي', true);
    sendDirect(applyRow(state, parseRow(gridToObj(grid[r]))), b.dataset.wa || 'invite', false);
  });

  // ---------- مزامنة: تعديل سطر الجدول المفتوح من النموذج + تحديث تصميم السجل تلقائياً ----------
  // ينقل للسطر فقط الحقول التي غيّرها المستخدم في النموذج منذ فتح السطر
  function syncActiveRow() {
    if (activeRow < 0 || !grid[activeRow] || !rowSnap) return;
    const fresh = gridOfState();
    const row = grid[activeRow]; let changedAny = false;
    GCOLS.forEach((c, j) => {
      if ((fresh[j] || '') === (rowSnap[j] || '')) return; // لم يتغيّر في النموذج
      if ((row[j] || '') !== (fresh[j] || '')) {
        row[j] = fresh[j]; changedAny = true;
        const inp = cellAt(activeRow, j); if (inp && document.activeElement !== inp) inp.value = fresh[j];
      }
    });
    rowSnap = fresh;
    if (changedAny) { updRowWarn(activeRow); refreshConflictsSoon(activeRow); gridChanged(); }
  }
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
    pk.style.top = (innerHeight - r.bottom < h + 10 && r.top > h + 10 ? r.top - h - 6 : r.bottom + 6) + 'px';
  }
  const pkFoot = '<div class="pk-foot"><button class="pk" data-pk-type>⌨️ كتابة</button><button class="pk" data-pk-clear>مسح</button><button class="pk" data-pk-close>إغلاق</button></div>';
  function pkOpen(el) {
    pkTarget = el; const kind = el.dataset.pick, cur = el.value.trim();
    if (kind === 'day') {
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
    const b = e.target.closest('button'); if (!b || !pkTarget) return;
    if (b.dataset.v) { pkSet(pkTarget, b.dataset.v); pkClose(); }
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
