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
    if (out.v !== 2) { out.opt.qr = false; out.v = 2; } // رمز QR يظهر فقط عند تفعيل المربع
    return out;
  }
  let state;
  try { state = normalize(JSON.parse(localStorage.getItem(userKey('draft')))); } catch (e) { state = normalize(); }

  let saveTimer;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(userKey('draft'), JSON.stringify(state)); }
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
    $$('[data-c]').forEach(el => { el.value = state.theme[el.dataset.c]; });
    $$('[data-gender]').forEach(b => b.classList.toggle('active', (b.dataset.gender === 'f') === /طالبة/.test(state.by)));
    renderMembers();
    renderUploads();
  }
  $$('[data-k]').forEach(el => el.addEventListener('input', () => { state[el.dataset.k] = el.value; changed(); }));
  $$('[data-o]').forEach(el => el.addEventListener('input', () => {
    state.opt[el.dataset.o] = el.type === 'checkbox' ? el.checked : +el.value;
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
        <input type="text" data-m="role" placeholder="الدور" value="${esc(m.role)}" list="roles">
      </div>`).join('') + `<datalist id="roles"><option value="مشرفاً ومقرراً"><option value="مشرفاً"><option value="مشرفاً مشاركاً"><option value="مناقشاً"><option value="مناقشاً خارجياً"><option value="مناقشةً"></datalist>`;
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
    if (!noSave) saveDraft();
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
  $('#exportFormats').innerHTML = FORMATS.map(f => `<label class="fmt"><input type="checkbox" value="${f.id}" ${f.id === 'exact' ? 'checked' : ''}>
      <span>${f.name}<small>${f.w}×${f.h}</small></span></label>`).join('') +
    `<label class="fmt"><input type="checkbox" value="custom"><span>المقاس المخصص<small>من شريط المعاينة</small></span></label>`;
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
    if (files.length === 1) return saveBlob(files[0].blob, files[0].name.replace('/', '-'));
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
    const items = rows.filter(r => r.sel).map(r => ({ label: r.data.student || `صف ${r.n}`, state: applyRow(state, r.data) }));
    if (!items.length) return toast('حمّل ملف إكسل/شيت وحدد الصفوف أولاً (تبويب إكسل / شيت)', true);
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
      state = normalize(it.state); setEditing(id, it.title); fillForm(); changed();
      $('#mHistory').classList.remove('open'); toast('فُتح التصميم للتعديل — التعديلات تُحفظ على نفس النسخة');
    } else if (act === 'copy') {
      state = normalize(it.state); setEditing(null); fillForm(); changed();
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
    state = normalize(); setEditing(null); fillForm(); changed();
  };

  // ---------- الإكسل وجوجل شيت ----------
  let rows = [];
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
    'رابط البث': 'link', 'الرابط': 'link', 'link': 'link'
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
  const GCOLS = ['الكلية', 'نص الإعلان', 'الدرجة', 'الجنس', 'الطالب', 'العنوان', 'اليوم', 'التاريخ', 'الوقت', 'المكان', 'ملاحظة المكان', 'رابط البث'];
  const GFIELD = { 'الكلية': 'college', 'نص الإعلان': 'intro', 'الدرجة': 'degree', 'الجنس': 'gender', 'الطالب': 'student', 'العنوان': 'title',
    'اليوم': 'day', 'التاريخ': 'date', 'الوقت': 'time', 'المكان': 'place', 'ملاحظة المكان': 'placeNote', 'رابط البث': 'link' };
  const GMEM = 5;
  for (let i = 1; i <= GMEM; i++) GCOLS.push(`عضو${i} الاسم`, `عضو${i} الصفة`, `عضو${i} الدور`);
  const emptyRow = () => GCOLS.map(() => '');
  let grid = [];
  try { grid = JSON.parse(localStorage.getItem(userKey('grid'))) || []; } catch (e) { grid = []; }
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
    }, 250);
  }
  function syncRows() {
    const prev = new Map(rows.map(r => [r.n, r.sel]));
    rows = grid.map((g, i) => isEmptyRow(g) ? null : ({ n: i + 1, data: parseRow(gridToObj(g)), sel: prev.has(i + 1) ? prev.get(i + 1) : true }))
      .filter(Boolean);
    renderRows();
  }
  function setRows(list) {
    grid = list.map(o => dataToGrid(parseRow(o))).filter(r => !isEmptyRow(r));
    gridSel.clear(); rows = [];
    try { localStorage.setItem(userKey('grid'), JSON.stringify(grid)); } catch (e) { /* مساحة */ }
    syncRows();
    if ($('#mGrid').classList.contains('open')) renderGrid();
    toast(rows.length ? `تم تحميل ${rows.length} صف ✓ (تقدر تعدّلها من «جدول البيانات»)` : 'لم يتم العثور على أعمدة مطابقة – استخدم الملف النموذجي', !rows.length);
  }

  function renderGrid() {
    if (!grid.length) grid = Array.from({ length: 5 }, emptyRow);
    const cls = c => /العنوان/.test(c) ? 'w-title' : /رابط/.test(c) ? 'w-link' : /الجنس|اليوم|الوقت|الدور/.test(c) ? 'w-sm' : '';
    $('#sheet').innerHTML = `<thead><tr><th class="n">#</th>${GCOLS.map(c => `<th class="${/^عضو/.test(c) ? 'mem' : ''}">${c}</th>`).join('')}</tr></thead>
      <tbody>${grid.map((r, i) => `<tr data-r="${i}" class="${gridSel.has(i) ? 'sel' : ''}"><td class="n"><label><input type="checkbox" data-gsel ${gridSel.has(i) ? 'checked' : ''}>${i + 1}</label></td>${
        GCOLS.map((c, j) => `<td><input type="text" class="${cls(c)}" data-c="${j}" value="${esc(r[j] || '')}"${/رابط/.test(c) ? ' dir="ltr"' : ''}></td>`).join('')}</tr>`).join('')}</tbody>`;
    $('#gridCount').textContent = `(${grid.filter(r => !isEmptyRow(r)).length} إعلان)`;
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

  $('#openGrid').onclick = () => { renderGrid(); openModal('#mGrid'); };
  $('#sheet').addEventListener('input', e => {
    const inp = e.target; if (!inp.dataset.c) return;
    const r = +inp.closest('tr').dataset.r;
    grid[r][+inp.dataset.c] = inp.value;
    $('#gridCount').textContent = `(${grid.filter(x => !isEmptyRow(x)).length} إعلان)`;
    gridChanged();
  });
  $('#sheet').addEventListener('change', e => {
    if (!e.target.matches('[data-gsel]')) return;
    const tr = e.target.closest('tr'), r = +tr.dataset.r;
    if (e.target.checked) gridSel.add(r); else gridSel.delete(r);
    tr.classList.toggle('sel', e.target.checked);
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
    grid = grid.filter((_, i) => !gridSel.has(i)); gridSel.clear(); rows = []; renderGrid(); gridChanged();
  };
  $('#gClear').onclick = () => {
    if (!confirm('مسح كل بيانات الجدول؟')) return;
    grid = []; gridSel.clear(); rows = []; renderGrid(); gridChanged();
  };
  $('#gExport').onclick = () => {
    const ws = XLSX.utils.aoa_to_sheet([GCOLS, ...grid.filter(r => !isEmptyRow(r))]);
    ws['!cols'] = GCOLS.map(h => ({ wch: /العنوان/.test(h) ? 60 : 22 })); ws['!views'] = [{ RTL: true }];
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'المناقشات');
    XLSX.writeFile(wb, 'بيانات-المناقشات.xlsx');
  };

  function renderRows() {
    $('#rowCount').textContent = rows.length ? `(${rows.length})` : '';
    $('#rows').innerHTML = rows.length ? rows.map((r, i) => `
      <div class="r" data-i="${i}"><input type="checkbox" ${r.sel ? 'checked' : ''}>
        <div class="t"><b>${r.n}. ${esc(r.data.student || 'بدون اسم')}</b><span>${esc((r.data.title || '').replace(/\n/g, ' '))}</span><span>${esc([r.data.day, r.data.date, r.data.time].filter(Boolean).join(' • '))}</span></div>
      </div>`).join('') : '<div class="hint" style="padding:12px">لا توجد بيانات بعد.</div>';
  }
  $('#rows').addEventListener('click', e => {
    const r = e.target.closest('.r'); if (!r) return;
    const row = rows[+r.dataset.i];
    if (e.target.type === 'checkbox') { row.sel = e.target.checked; return; }
    state = applyRow(state, row.data);
    $$('#rows .r').forEach(x => x.classList.toggle('active', x === r));
    fillForm(); changed();
    toast(`تم تحميل بيانات: ${row.data.student || 'الصف ' + row.n}`);
  });
  $('#selAll').onclick = () => { rows.forEach(r => { r.sel = true; }); renderRows(); };
  $('#selNone').onclick = () => { rows.forEach(r => { r.sel = false; }); renderRows(); };
  $('#clearRows').onclick = () => {
    if (!confirm('مسح كل الصفوف وبيانات الجدول؟')) return;
    rows = []; grid = []; gridSel.clear(); gridChanged(); renderRows();
  };

  function sheetToRows(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  }
  $('#xlsFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      setRows(sheetToRows(XLSX.read(buf, { type: 'array' })));
    } catch (err) { toast('تعذّر قراءة الملف', true); }
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
      setRows(sheetToRows(XLSX.read(text, { type: 'string' })));
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

  $('#dlTemplate').onclick = () => {
    const d = DEFAULTS;
    const r1 = dataToGrid({ ...d, gender: 'ذكر' });
    const r2 = dataToGrid({ college: 'يسر كلية الشريعة', intro: d.intro, degree: 'الدكتوراه في أصول الفقه', gender: 'أنثى', student: 'نورة بنت محمد العتيبي',
      title: 'عنوان الرسالة هنا\n(دراسة تطبيقية)', day: 'الثلاثاء', date: '1448/5/2 هـ', time: '10 صباحاً', place: 'القاعة الكبرى', placeNote: '(والبث عبر الإنترنت)', link: d.link,
      committee: [{ name: 'أ.د. ...', title: 'الأستاذ في قسم أصول الفقه', role: 'مشرفاً ومقرراً' }, { name: 'د. ...', title: 'الأستاذ المشارك', role: 'مناقشاً' }] });
    const ws = XLSX.utils.aoa_to_sheet([GCOLS, r1, r2]);
    ws['!cols'] = GCOLS.map(h => ({ wch: /العنوان/.test(h) ? 60 : 22 }));
    ws['!views'] = [{ RTL: true }];
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'المناقشات');
    XLSX.writeFile(wb, 'نموذج-اعلانات-المناقشات.xlsx');
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

  // ---------- البدء ----------
  fillForm();
  drawPreview();
  if (grid.some(r => !isEmptyRow(r))) syncRows();
  HDB.get(editingId || -1).then(it => setEditing(it ? it.id : null, it && it.title)).catch(() => setEditing(null));
  if (document.fonts) document.fonts.ready.then(() => drawPreview());
})();
