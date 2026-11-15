/* «📅 مشاركة صور الإعلانات لهذا الأسبوع» — مشترك بين صفحة المناقشات وصفحة الندوات (كل صفحة بإعلاناتها هي فقط).
   الأسبوع من الأحد إلى الخميس (الجمعة والسبت: الأسبوع الجاي)، وثلاث خيارات:
   ⬇️ تنزيل (كل إعلان صورة) · 💬 واتساب (كلها مرة وحدة من الجوال) · 📋 نسخ الصور (كلها، للصق في المدونة أو واتساب ويب)
   QWeek({ button, noun, list(start,end) → [{title, sub, line, t, order}], blob(item) → Promise<Blob png>, name(item), heading, ui }) */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hfmt = d => new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long' }).format(d);
  const sleep = t => new Promise(r => setTimeout(r, t));
  // العدد بالعربي الصحيح: مناقشة واحدة، مناقشتان، 3–10 مناقشات، 11+ مناقشة
  const FORMS = { 'مناقشة': ['مناقشة واحدة', 'مناقشتان', 'مناقشات'], 'ندوة': ['ندوة واحدة', 'ندوتان', 'ندوات'] };
  let NOUN = 'مناقشة';
  const count = n => { const f = FORMS[NOUN] || [NOUN, NOUN, NOUN]; return n === 1 ? f[0] : n === 2 ? f[1] : n <= 10 ? `${n} ${f[2]}` : `${n} ${NOUN}`; };
  function thisWeek() {
    const t = new Date(), d = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
    const wd = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - wd + (wd >= 5 ? 7 : 0)); return d;
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // صورة مناسبة للصق في المدونة: JPEG بعرض 1280 (حجم معقول، وواضحة)
  async function webImg(blob) {
    const bm = await createImageBitmap(blob), W = Math.min(1280, bm.width), H = Math.round(bm.height * W / bm.width);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(bm, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.9);
  }

  // «📋 إرسال … الأسبوعية للتدقيق»: رسالة واتساب بمناقشات/ندوات الأسبوع القادم (الأحد ← الخميس)، تنفتح جاهزة وما تنرسل تلقائياً.
  // QReview({ button, plural: 'مناقشات', ui: { toast }, list(start, end) → [{ t, order, lines: [سطر1, سطر2, سطر3] }] })
  const plain = s => String(s || '').replace(/(^|[\s-])(الأحد|الإثنين|الأربعاء)(?=$|\s)/g, (m, a, d) => a + d.replace(/[أإ]/, 'ا'));   // أسماء الأيام بس: «الاحد، الاربعاء» مثل الرسالة المعتادة
  window.QReview = function (cfg) {
    const toast = (cfg.ui && cfg.ui.toast) || (m => alert(m));
    function nextWeek() {   // الأحد الجاي بعد اليوم (الجمعة والسبت: بكرة/بعده؛ الأحد: الأسبوع اللي بعده)
      const t = new Date(), d = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
      d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7)); return d;
    }
    function build() {
      const start = nextWeek(), end = new Date(start); end.setUTCDate(end.getUTCDate() + 4);
      const list = cfg.list(start, end).sort((x, y) => x.t - y.t || x.order - y.order);
      return { start, end, list, text: list.length ? ['السلام عليكم', '', `لتدقيق ${cfg.plural} الاسبوع القادم`, '',
        list.map(x => x.lines.map(plain).join('\n')).join('\n\n'), '', 'اي ملاحظه تكون ع الخاص'].join('\n') : '' };
    }
    if (cfg.button) cfg.button.onclick = () => {
      const r = build();
      if (!r.list.length) return toast(`ما فيه ${cfg.plural} مسجلة في الأسبوع القادم (من الأحد ${hfmt(r.start)} إلى الخميس ${hfmt(r.end)})`, true);
      const mobile = matchMedia('(pointer: coarse)').matches;
      const url = (mobile ? 'https://wa.me/?text=' : 'https://web.whatsapp.com/send?text=') + encodeURIComponent(r.text);
      const w = window.open(url, '_blank', 'noopener');      // يفتح واتساب والرسالة جاهزة — الإرسال بيدك
      if (!w && mobile) location.href = url;
      try { navigator.clipboard.writeText(r.text); } catch (e) { /* اختياري */ }
      toast(`📋 جهزت رسالة التدقيق (${r.list.length}) — اختر المحادثة واضغط إرسال. ونسختها لك لو احتجت تلصقها`);
    };
    return { build };
  };

  window.QWeek = function (cfg) {
    const ui = cfg.ui || {}; NOUN = cfg.noun || NOUN;
    const toast = ui.toast || ((m) => alert(m)), show = ui.busy || (() => {}), hide = ui.done || (() => {});
    const m = document.createElement('div'); m.className = 'modal'; m.id = 'mWeek';
    m.innerHTML = `<div class="box" style="width:min(760px,100%)">
      <h2>📅 مشاركة صور الإعلانات لهذا الأسبوع <span class="hint wk-count" style="white-space:nowrap"></span> <button class="btn sm" data-close>✕</button></h2>
      <div class="hbar" style="align-items:center"><button class="btn sm" data-wknav="-1">▶ السابق</button>
        <b class="wk-range" style="flex:1;text-align:center"></b><button class="btn sm" data-wknav="1">الجاي ◀</button></div>
      <div class="week-acts">
        <button class="week-act" data-wkact="dl"><b>⬇️ تنزيل</b><small>كل إعلان صورة لحاله</small></button>
        <button class="week-act wa" data-wkact="wa"><b>💬 واتساب</b><small>للجروب أو القناة مرة وحدة</small></button>
        <button class="week-act" data-wkact="copy"><b>📋 نسخ الصور</b><small>كلها مرة وحدة — الصقها في المدونة</small></button>
      </div>
      <p class="hint wk-blog-tip" style="margin:6px 0 0">📌 المدونة: الصق في العرض العادي «عرض الإنشاء» (Compose)، مو «عرض HTML» — إذا كنت في HTML غيّرها من زر القلم ✏️ في شريط الأدوات.</p>
      <div class="hbar"><button class="btn sm" data-wkall>☑️ تحديد / إلغاء الكل</button><span class="hint">${esc(cfg.heading || '')}</span></div>
      <div class="trash-list wk-list"></div></div>`;
    document.body.appendChild(m);
    const $ = s => m.querySelector(s);
    let start = null, items = [];
    const end = () => { const e = new Date(start); e.setUTCDate(e.getUTCDate() + 4); return e; };
    const text = () => `${cfg.noun === 'ندوة' ? 'ندوات' : 'إعلانات مناقشات الرسائل العلمية'} — كلية الشريعة\nمن الأحد ${hfmt(start)} إلى الخميس ${hfmt(end())}`;
    async function render() {
      $('.wk-range').textContent = `من الأحد ${hfmt(start)} إلى الخميس ${hfmt(end())}`;
      $('.wk-list').innerHTML = '<p class="hint">جارٍ التحميل...</p>';
      const s0 = start, list = (await cfg.list(start, end())).sort((a, b) => a.t - b.t || a.order - b.order);
      if (s0 !== start) return;
      items = list.map(x => ({ ...x, _blob: null }));
      $('.wk-list').innerHTML = items.length ? items.map((x, k) => `<div class="trash-it week-it"><input type="checkbox" checked data-wk="${k}">
        <span><b>${esc(x.title)}</b>${x.sub ? ' — ' + esc(x.sub) : ''}<br><small class="hint">${esc(x.line || '')}</small></span>
        <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-wkcopy="${k}">📋 نسخ</button><button class="btn sm" data-wkdl="${k}">⬇️</button></span></div>`).join('')
        : `<p class="hint">ما فيه ${cfg.noun === 'ندوة' ? 'ندوات' : 'مناقشات'} مسجلة في هذا الأسبوع.</p>`;
      $('.wk-count').textContent = items.length ? `(${count(items.length)})` : '';
    }
    const blobOf = async x => (x._blob = x._blob || await cfg.blob(x));
    const selected = () => items.filter((x, k) => { const c = m.querySelector(`[data-wk="${k}"]`); return c && c.checked; });
    async function blobs(list) {
      const out = [];
      for (let n = 0; n < list.length; n++) { show(`جارٍ تجهيز ${n + 1} من ${list.length}: ${list[n].title}`); out.push({ x: list[n], blob: await blobOf(list[n]) }); }
      return out;
    }
    function open() { start = thisWeek(); render(); m.classList.add('open'); }
    if (cfg.button) cfg.button.onclick = open;
    m.addEventListener('click', async e => {
      if (e.target === m || e.target.closest('[data-close]')) { m.classList.remove('open'); return; }
      const nav = e.target.closest('[data-wknav]');
      if (nav) { const d = new Date(start); d.setUTCDate(d.getUTCDate() + (+nav.dataset.wknav) * 7); start = d; render(); return; }
      if (e.target.closest('[data-wkall]')) { const cs = [...m.querySelectorAll('[data-wk]')], on = cs.some(c => !c.checked); cs.forEach(c => { c.checked = on; }); return; }
      const cp = e.target.closest('[data-wkcopy]'), dl = e.target.closest('[data-wkdl]');
      if (cp || dl) {
        const x = items[+(cp ? cp.dataset.wkcopy : dl.dataset.wkdl)];
        try {
          if (cp) {
            if (!navigator.clipboard || !window.ClipboardItem) return toast('النسخ غير مدعوم في هذا المتصفح — استخدم ⬇️', true);
            show('جارٍ نسخ الإعلان...');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf(x) })]);
            toast('📋 انسخ ✓ — الصقه (Ctrl+V)');
          } else { show('جارٍ تجهيز الإعلان...'); saveBlob(await blobOf(x), cfg.name(x)); }
        } catch (err) { toast('تعذّر — جرّب ⬇️ التحميل', true); } finally { hide(); }
        return;
      }
      const act = e.target.closest('[data-wkact]'); if (!act) return;
      const list = selected(); if (!list.length) return toast('حدد إعلان واحد على الأقل', true);
      try {
        if (act.dataset.wkact === 'copy') {
          // كل الصور مرة وحدة: HTML فيه الصور ورا بعض (المدونة تلصقها كلها). الكتابة للحافظة تبدأ فوراً (يشترطها المتصفح) والصور تتجهز داخلها
          if (!navigator.clipboard || !window.ClipboardItem) return toast('النسخ غير مدعوم في هذا المتصفح — استخدم ⬇️ تنزيل', true);
          const html = (async () => {
            const fs = await blobs(list), parts = [];
            for (const f of fs) parts.push(`<p style="text-align:center"><img src="${await webImg(f.blob)}" alt="${esc(f.x.title)}" style="max-width:100%;height:auto"></p>`);
            return new Blob([`<div dir="rtl">${parts.join('\n')}</div>`], { type: 'text/html' });
          })();
          await navigator.clipboard.write([new ClipboardItem({ 'text/html': html })]);   // صور بس، بدون نص
          hide(); toast(`📋 انسخت ${list.length} صور ✓ — افتح المدونة على «عرض الإنشاء» (مو HTML) والصقها: تنلصق كلها ورا بعض`);
        } else if (act.dataset.wkact === 'dl') {
          const fs = await blobs(list); hide();
          for (const f of fs) { saveBlob(f.blob, cfg.name(f.x)); await sleep(450); }
          toast(`⬇️ نزلت ${fs.length} صورة`);
        } else if (act.dataset.wkact === 'wa') {
          const fs = (await blobs(list)).map(f => new File([f.blob], cfg.name(f.x), { type: 'image/png' })); hide();
          if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: fs })) {
            try { await navigator.share({ files: fs }); }   // صور بس، بدون نص
            catch (err) { if (err.name === 'NotAllowedError') toast('الصور جاهزة ✓ — اضغط «💬 واتساب» مرة ثانية'); else if (err.name !== 'AbortError') toast('تعذّر فتح المشاركة', true); }
          } else {
            for (const f of fs) { saveBlob(f, f.name); await sleep(450); }
            toast('في الكمبيوتر: نزلت الصور — اسحبها لمحادثة الجروب في واتساب ويب');
          }
        }
      } catch (err) { toast('تعذّر التجهيز: ' + (err.message || ''), true); } finally { hide(); }
    });
    return { open };
  };
})();
