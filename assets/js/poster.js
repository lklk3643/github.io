/* محرك رسم إعلان المناقشة: القيم الافتراضية، الأحجام، الرسومات (الشعار، المبنى، الزخارف) والتحجيم التلقائي */
(function () {
  'use strict';

  // ---------- النموذج الافتراضي ----------
  const DEFAULTS = {
    college: 'يسر كلية الشريعة',
    intro: 'الإعلان عن مناقشة رسالة علمية',
    degree: 'الماجستير في الفقه المقارن',
    by: 'من قبل طالب الدراسات العليا',
    titleLabel: 'بعنوان:',
    title: 'المسائل الفقهية التي خالف فيها الإمام محمد بن عبد الوهاب المذهب الحنبلي\n(جمعاً ودراسة)',
    presenterLabel: 'يقدمها:',
    student: 'عبد الله بن عادل السعدي',
    committeeLabel: 'لجنة المناقشة',
    colName: 'الاسم', colTitle: 'الصفة', colRole: 'الدور',
    committee: [
      { name: 'أ.د. عمر بن علي السديس', title: 'الأستاذ في قسم الفقه', role: 'مشرفاً ومقرراً' },
      { name: 'أ.د. فهد بن صالح الحمود', title: 'الأستاذ في قسم الفقه', role: 'مناقشاً' },
      { name: 'د. أحمد بن سليمان العودة', title: 'الأستاذ المساعد في قسم الفقه', role: 'مناقشاً' }
    ],
    day: 'الأحد',
    date: '1448/4/16 هـ',
    time: '8 صباحاً',
    place: 'قاعة ابن عثيمين',
    placeNote: '(والبث عبر الإنترنت)',
    link: 'https://www.youtube.com/@src.sds1',
    committeeLink: '',
    recordingLink: '',
    handle: '@QassimUniv',
    website: 'www.qu.edu.sa',
    dept: 'كلية الشريعة',
    uniAr: 'جامعة القصيم',
    uniEn: 'Qassim University',
    calligraphy: 'دعوة',
    theme: { primary: '#2b7574', dark: '#0f4a4d', light: '#d9eae9', accent: '#5e9998' },
    opt: { building: true, pattern: true, calligraphy: true, footer: true, qr: true, compactWide: false, titleSize: 32 },
    assets: { logo: '', building: '', bg: '' }
  };

  const THEMES = {
    'تركوازي (الأصلي)': { primary: '#2b7574', dark: '#0f4a4d', light: '#d9eae9', accent: '#5e9998' },
    'كحلي': { primary: '#2c4f86', dark: '#132c55', light: '#dde6f3', accent: '#5b77a6' },
    'أخضر': { primary: '#2f7a4c', dark: '#164a2c', light: '#dcefe2', accent: '#5f9a74' },
    'ذهبي': { primary: '#9a7a3a', dark: '#4e3c17', light: '#f2ead8', accent: '#b89a5c' },
    'عنابي': { primary: '#8a2e3b', dark: '#4d1420', light: '#f3dfe2', accent: '#a85b66' },
    'رمادي داكن': { primary: '#455a64', dark: '#1f2c33', light: '#e2e8eb', accent: '#728891' }
  };

  // ---------- الأحجام ----------
  const FORMATS = [
    { id: 'exact', name: 'مطابق للأصل 100%', w: 1045, h: 1505, layout: 'exact' },
    { id: 'a4', name: 'A4 قابل للتخصيص', w: 1080, h: 1527, layout: 'tall', building: 215, footer: 70 },
    { id: 'story', name: 'ستوري / حالات', w: 1080, h: 1920, layout: 'tall', building: 330, footer: 80 },
    { id: 'square', name: 'منشور مربع', w: 1080, h: 1080, layout: 'tall', building: 150, footer: 60 },
    { id: 'youtube', name: 'صورة يوتيوب المصغّرة', w: 1280, h: 720, layout: 'wide', building: 150, footer: 54, behind: true },
    { id: 'ytbanner', name: 'غلاف قناة يوتيوب', w: 2560, h: 1440, layout: 'banner', building: 300, footer: 100, behind: true, compact: true, safe: { w: 1546, h: 423 } },
    { id: 'x', name: 'منشور X / تويتر', w: 1600, h: 900, layout: 'wide', building: 180, footer: 64, behind: true }
  ];

  function customFormat(w, h) {
    w = Math.max(300, Math.min(5000, +w || 1080));
    h = Math.max(300, Math.min(5000, +h || 1080));
    const wide = w / h > 1.25;
    const base = Math.min(w, h);
    return { id: 'custom', name: `مخصص ${w}×${h}`, w, h, layout: wide ? 'wide' : 'tall',
      building: Math.round(base * (wide ? 0.2 : 0.16)), footer: Math.round(base * 0.065), behind: wide };
  }

  // ---------- أدوات ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = s => esc(s).replace(/\r?\n/g, '<br>');

  // ---------- الأيقونات ----------
  const ICON = {
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 5.5c3-1 6.5-1 10 1.2v13c-3.5-2.2-7-2.2-10-1.2z"/><path d="M22 5.5c-3-1-6.5-1-10 1.2v13c3.5-2.2 7-2.2 10-1.2z"/><path d="M4.5 9.5c2-.4 4-.2 5.5.6M4.5 12.5c2-.4 4-.2 5.5.6M19.5 9.5c-2-.4-4-.2-5.5.6M19.5 12.5c-2-.4-4-.2-5.5.6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4.2"/><path d="M3.8 21c.6-4.3 4-6.8 8.2-6.8s7.6 2.5 8.2 6.8z" stroke-linejoin="round"/></svg>',
    users: '<svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="7.5" r="3.8"/><path d="M8.8 21c.5-4 3.4-6.2 7.2-6.2s6.7 2.2 7.2 6.2z" stroke-linejoin="round"/><circle cx="7" cy="9" r="3"/><path d="M1.5 19.5c.4-3.2 2.6-5 5.5-5 1.1 0 2.1.3 3 .8"/><circle cx="25" cy="9" r="3"/><path d="M30.5 19.5c-.4-3.2-2.6-5-5.5-5-1.1 0-2.1.3-3 .8"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><g fill="currentColor" stroke="none"><rect x="6" y="12" width="2.6" height="2.2" rx=".4"/><rect x="10.7" y="12" width="2.6" height="2.2" rx=".4"/><rect x="15.4" y="12" width="2.6" height="2.2" rx=".4"/><rect x="6" y="16" width="2.6" height="2.2" rx=".4"/><rect x="10.7" y="16" width="2.6" height="2.2" rx=".4"/><rect x="15.4" y="16" width="2.6" height="2.2" rx=".4"/></g></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><path d="M12 6.5V12l3.6 2.4"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.8a7.6 7.6 0 0 0-7.6 7.6c0 5.6 7.6 12.8 7.6 12.8s7.6-7.2 7.6-12.8A7.6 7.6 0 0 0 12 1.8zm0 10.7a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2c-2.6-2.6-3.9-5.6-3.9-9.2S9.4 5.4 12 2.8zM4.5 7h15M4.5 17h15"/></svg>'
  };

  // الصور الافتراضية مأخوذة من التصميم الأصلي (يمكن استبدالها من تبويب المظهر)
  const DEFAULT_LOGO = 'assets/img/logo.png?v=202610161148';
  const DEFAULT_BUILDING = 'assets/img/building.jpg?v=202610161148';

  // ---------- الزخارف ----------
  function star8(cx, cy, r, color, sw) {
    const pts = rot => Array.from({ length: 4 }, (_, i) => {
      const a = rot + i * Math.PI / 2;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    return `<polygon points="${pts(Math.PI / 4)}" fill="none" stroke="${color}" stroke-width="${sw}"/>
            <polygon points="${pts(0)}" fill="none" stroke="${color}" stroke-width="${sw}"/>
            <circle cx="${cx}" cy="${cy}" r="${r * 0.38}" fill="${color}" opacity=".35"/>`;
  }

  function bgSVG(state, f) {
    const t = state.theme;
    const W = f.w, H = f.h;
    let s = `<svg class="qp-bg-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    if (state.opt.pattern) {
      s += `<defs><pattern id="qpPat" width="120" height="120" patternUnits="userSpaceOnUse">${star8(60, 60, 38, t.primary, 1.2)}
            <path d="M0 60 H22 M98 60 H120 M60 0 V22 M60 98 V120" stroke="${t.primary}" stroke-width="1.2"/></pattern>
            <linearGradient id="qpFadeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".45" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
            <mask id="qpFade"><rect width="${W}" height="${H}" fill="url(#qpFadeG)"/></mask></defs>
            <rect width="${W}" height="${H}" fill="url(#qpPat)" opacity=".07" mask="url(#qpFade)"/>`;
      // أوراق نخيل خفيفة على الجانبين
      const leaf = (x, y, dir, sc) => {
        let p = '';
        for (let i = 0; i < 9; i++) {
          const yy = y + i * 26 * sc;
          p += `<path d="M${x} ${yy} q${dir * 90 * sc} ${-30 * sc} ${dir * 170 * sc} ${10 * sc}" stroke="${t.primary}" stroke-width="${10 * sc}" fill="none" stroke-linecap="round"/>`;
        }
        return `<g opacity=".06">${p}<path d="M${x} ${y - 20} V${y + 240 * sc}" stroke="${t.primary}" stroke-width="${5 * sc}"/></g>`;
      };
      s += leaf(0, H * 0.48, 1, 1.1) + leaf(W, H * 0.52, -1, 1.1);
    }
    s += '</svg>';
    return s;
  }


  // ---------- النسخة المطابقة للتصميم الأصلي (1045×1505) ----------
  // الخلفية هي التصميم الأصلي نفسه بعد مسح النصوص المتغيرة، وتُكتب النصوص الجديدة بنفس المواضع والخط والألوان.
  const EXACT_BG = 'assets/img/template.jpg?v=202610161148';
  // cx: مركز النص، rx: الحافة اليمنى، y: منتصف النص، w: أقصى عرض، s: الحجم، dy: تصحيح رأسي
  const EXACT = {
    college: { cx: 524, y: 269.5, w: 430, s: 30.4, wt: 600, c: '#0d5a5e', dy: -3 },
    intro: { cx: 525, y: 333.5, w: 640, s: 28.3, wt: 500, c: '#0c4a63', dy: -1 },
    degree: { cx: 524.5, y: 399.5, w: 760, s: 46.2, wt: 700, c: '#0a4d54', dy: -4 },
    by: { cx: 525.5, y: 481, w: 420, s: 23.6, wt: 400, c: '#ffffff', dy: -1 },
    title: { cx: 524, top: 592, h: 106, w: 860, s: 26, wt: 500, c: '#0b3462', lh: 49.5, dy: -3.2 },
    label: { rx: 907, y: 758, w: 90, s: 25.4, wt: 400, c: '#0d5b5f', dy: -2 },
    student: { cx: 523, y: 760, w: 520, s: 25.5, wt: 400, c: '#0b2c5e', dy: -4.5 },
    cell: { s: 21.8, wt: 400, c: '#0b3658', dy: -1, padR: 28 },
    day: { rx: 872.5, y: 1174, w: 140, s: 20, wt: 500, c: '#0b2c5e', dy: 2.5 },
    date: { rx: 872, y: 1206.5, w: 160, s: 22, wt: 500, c: '#0b2c5e', dy: -0.5 },
    time: { rx: 545, y: 1190, w: 110, s: 22.4, wt: 400, c: '#0b2c5e', dy: 1 },
    place: { rx: 272, y: 1180, w: 170, s: 21.5, wt: 400, c: '#0b2c5e', dy: -0.5 },
    dept: { rx: 948, y: 1470.5, w: 300, s: 18.4, wt: 400, c: '#f1f7f7', dy: -4.5 },
    placeNote: { rx: 275, y: 1211.5, w: 175, s: 18.4, wt: 400, c: '#0b2c5e', dy: -1.5 }
  };
  const EXACT_ROWS = { top: 929, bottom: 1115, h: 57, gap: 7,
    cols: [{ x0: 655, x1: 959, k: 'name', bg: '#e5eff1', align: 'right' }, { x0: 307, x1: 649, k: 'title', bg: '#e6eff1' }, { x0: 89, x1: 300, k: 'role', bg: '#e1ecee' }] };

  function exItem(spec, text, key) {
    if (!text) return '';
    const H = Math.round(spec.s * 2);
    const pos = spec.rx != null ? `right:${1045 - spec.rx}px;justify-content:flex-start;` : `left:${spec.cx - spec.w / 2}px;justify-content:center;`;
    return `<div class="ex" data-ex="${key}" style="${pos}width:${spec.w}px;top:${spec.y - H / 2 + spec.dy}px;height:${H}px;font-size:${spec.s}px;font-weight:${spec.wt};color:${spec.c}">${esc(text)}</div>`;
  }

  // ---------- رمز QR مع أيقونة المنصة في المنتصف ----------
  const PLATFORMS = [
    { id: 'youtube', re: /youtu\.?be/i, name: 'يوتيوب', cta: 'شاهد البث على يوتيوب',
      icon: '<rect x="1" y="4.5" width="22" height="15" rx="4.6" fill="#FF0000"/><path d="M9.8 8.4v7.2l6.2-3.6z" fill="#fff"/>' },
    { id: 'zoom', re: /zoom\.(us|com)|\bzoom\b/i, name: 'زوم', cta: 'انضم عبر زوم',
      icon: '<rect width="24" height="24" rx="6" fill="#2D8CFF"/><path d="M4.6 8.6c0-.5.4-.9.9-.9h7.6c1.2 0 2.1.9 2.1 2.1v5.6c0 .5-.4.9-.9.9H6.7c-1.2 0-2.1-.9-2.1-2.1zM16.2 10.7l3.2-2.3c.3-.2.6 0 .6.3v6.6c0 .4-.3.5-.6.3l-3.2-2.3z" fill="#fff"/>' },
    { id: 'teams', re: /teams\.(microsoft|live)|\bteams\b/i, name: 'Teams', cta: 'انضم عبر Teams',
      icon: '<rect width="24" height="24" rx="5" fill="#5059C9"/><path d="M6 6.8h11.2v2.7h-4.2V18h-2.8V9.5H6z" fill="#fff"/>' },
    { id: 'webex', re: /webex/i, name: 'Webex', cta: 'انضم عبر Webex',
      icon: '<circle cx="12" cy="12" r="12" fill="#07C160"/><circle cx="12" cy="12" r="12" fill="#00A0D1" opacity=".55"/><path d="M4.6 8h2.2l1.7 6.1L10.6 8h2.1l2 6.1L16.4 8h2.2l-2.9 8.6h-2.1L11.6 11l-2 5.6H7.5z" fill="#fff"/>' },
    { id: 'blackboard', re: /blackboard|bbcollab|collaborate/i, name: 'بلاك بورد', cta: 'انضم عبر بلاك بورد',
      icon: '<rect width="24" height="24" rx="5" fill="#262626"/><text x="12" y="16.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11.5" fill="#fff">Bb</text>' },
    { id: 'meet', re: /meet\.google/i, name: 'Google Meet', cta: 'انضم عبر Google Meet',
      icon: '<rect width="24" height="24" rx="6" fill="#00897B"/><path d="M5 8.6c0-.6.5-1.1 1.1-1.1h7.4c.6 0 1.1.5 1.1 1.1v6.8c0 .6-.5 1.1-1.1 1.1H6.1c-.6 0-1.1-.5-1.1-1.1zM15.6 10.6l3.4-2.4v7.6l-3.4-2.4z" fill="#fff"/>' }
  ];
  const GENERIC = { id: 'link', name: 'رابط', cta: 'شاهد البث المباشر',
    icon: '<circle cx="12" cy="12" r="12" fill="#2b7574"/><path d="M10.6 13.4a3 3 0 0 0 4.2 0l2.4-2.4a3 3 0 0 0-4.2-4.2l-.9.9M13.4 10.6a3 3 0 0 0-4.2 0L6.8 13a3 3 0 0 0 4.2 4.2l.9-.9" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>' };
  const platformOf = link => PLATFORMS.find(p => p.re.test(String(link || ''))) || GENERIC;
  // عدد وحدات الرمز (كلما زاد صار أكثف) — للتنبيه على الروابط الطويلة
  // يختار أقل كثافة ممكنة (مربعات أكبر = يتحمّل ضغط الواتساب)، ومع التساوي أعلى تصحيح.
  // «www.» تُحذف من الرابط داخل الرمز فقط (نفس العنوان) لتقليل الكثافة.
  const qrText = link => String(link || '').trim().replace(/^(https?:\/\/)www\./i, '$1');
  function qrBuild(link) {
    let best = null;
    for (const lvl of ['H', 'Q', 'M']) {
      const q = window.qrcode(0, lvl); q.addData(qrText(link)); q.make();
      if (!best || q.getModuleCount() < best.getModuleCount()) best = q;
    }
    return best;
  }
  function qrModules(link) { try { return qrBuild(link).getModuleCount(); } catch (e) { return 0; } }

  function qrSvg(state) {
    if (!state.opt || !state.opt.qr || !state.link || !window.qrcode) return '';
    try {
      const q = qrBuild(state.link);
      const pf = platformOf(state.link);
      return `<div class="qr-wrap">${q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}<span class="qr-logo"><svg viewBox="0 0 24 24">${pf.icon}</svg></span></div>`;
    } catch (e) { return ''; }
  }

  function renderExact(el, state) {
    const E = EXACT;
    el.className = 'qp qp-exact';
    el.dataset.layout = 'exact';
    el.dataset.format = 'exact';
    el.style.cssText = `width:1045px;height:1505px;background:url("${EXACT_BG}") 0 0 / 100% 100% no-repeat;`;
    const t = E.title;
    let html = '';
    ['college', 'intro', 'degree', 'by'].forEach(k => { html += exItem(E[k], state[k], k); });
    html += `<div class="ex ex-title" data-ex="title" style="left:${t.cx - t.w / 2}px;width:${t.w}px;top:${t.top + t.dy}px;height:${t.h}px;font-size:${t.s}px;font-weight:${t.wt};color:${t.c};line-height:${t.lh}px">${lines(state.title)}</div>`;
    html += exItem(E.label, state.presenterLabel, 'label');
    html += exItem(E.student, state.student, 'student');
    // جدول اللجنة: 3 صفوف بنفس مقاسات الأصل، ويُضغط تلقائياً عند إضافة أعضاء
    const R = EXACT_ROWS;
    const members = (state.committee || []).filter(m => m && (m.name || m.title || m.role));
    const n = Math.max(1, members.length);
    let h = R.h, gap = R.gap;
    if (n > 3) { gap = 6; h = (R.bottom - R.top - gap * (n - 1)) / n; }
    const fs = E.cell.s * Math.max(0.74, Math.min(1, h / R.h + 0.22));
    members.forEach((m, i) => {
      const top = R.top + i * (h + gap);
      R.cols.forEach(col => {
        const right = col.align === 'right';
        html += `<div class="ex-cell" style="left:${col.x0}px;width:${col.x1 - col.x0 + 1}px;top:${top}px;height:${h}px;background:${col.bg}">
          <div class="ex" data-ex="cell" style="position:static;width:100%;height:100%;padding:0 ${right ? E.cell.padR : 8}px 0 8px;justify-content:${right ? 'flex-start' : 'center'};font-size:${fs}px;font-weight:${E.cell.wt};color:${E.cell.c};transform:translateY(${E.cell.dy}px)">${esc(m[col.k])}</div></div>`;
      });
    });
    ['day', 'date', 'time', 'place', 'placeNote', 'dept'].forEach(k => { html += exItem(E[k], state[k], k); });
    const qr = qrSvg(state);
    if (qr) html += `<div class="ex-qr">${qr}<span>${platformOf(state.link).cta}</span></div>`;
    el.innerHTML = html;
  }

  // يصغّر الخط لأي نص أطول من مكانه في النسخة المطابقة
  function fitExact(el) {
    el.querySelectorAll('.ex').forEach(d => {
      let s = parseFloat(d.style.fontSize);
      if (d.classList.contains('ex-title')) {
        const lh0 = parseFloat(d.style.lineHeight), s0 = s;
        while ((d.scrollHeight > d.clientHeight + 1 || d.scrollWidth > d.clientWidth + 1) && s > 12) {
          s -= 0.5; d.style.fontSize = s + 'px'; d.style.lineHeight = (lh0 * s / s0) + 'px';
        }
      } else {
        while (d.scrollWidth > d.clientWidth + 1 && s > 9) { s -= 0.5; d.style.fontSize = s + 'px'; }
      }
    });
    return 1;
  }

  // ---------- الرسم ----------
  function render(el, state, f) {
    if (f.layout === 'exact') return renderExact(el, state);
    const t = state.theme, o = state.opt;
    const wide = f.layout !== 'tall';
    const hideCommittee = f.compact || (wide && o.compactWide);
    el.className = 'qp';
    el.dataset.layout = f.layout;
    el.dataset.format = f.id;
    el.style.cssText = `width:${f.w}px;height:${f.h}px;--p:${t.primary};--d:${t.dark};--l:${t.light};--a:${t.accent};--title:${o.titleSize || 34}px;--footer:${f.footer}px;`;
    if (state.assets.bg) el.style.backgroundImage = `url("${state.assets.bg}")`;

    const reserve = o.footer ? f.footer : 0;
    const bHeight = o.building ? f.building : 0;
    const regionBottom = reserve + (f.behind ? 0 : bHeight);

    const logo = `<img class="qp-logo-img" src="${state.assets.logo || DEFAULT_LOGO}" alt="">`;

    const rows = (state.committee || []).filter(r => r && (r.name || r.title || r.role)).map(r =>
      `<tr><td class="qp-c-name">${esc(r.name)}</td><td>${esc(r.title)}</td><td>${esc(r.role)}</td></tr>`).join('');

    let qr = '';
    const qrBox = qrSvg(state);
    if (qrBox) {
      const pf = platformOf(state.link);
      qr = `<div class="qp-sep"></div><div class="qp-info-item qp-qr">${qrBox}<div class="qp-info-text"><b>امسح للبث</b><span>${pf.id === 'link' ? 'المباشر' : 'عبر ' + pf.name}</span></div></div>`;
    }

    const building = o.building ? `<img class="qp-building-img" src="${state.assets.building || DEFAULT_BUILDING}" alt="">` : '';

    el.innerHTML = `
      <div class="qp-bg">${bgSVG(state, f)}${o.calligraphy && state.calligraphy ? `<div class="qp-callig">${esc(state.calligraphy)}</div>` : ''}</div>
      ${o.building ? `<div class="qp-building ${f.behind ? 'is-behind' : ''}" style="bottom:${reserve}px;height:${bHeight}px">${building}</div>` : ''}
      <div class="qp-region" style="${f.safe
        ? `left:${(f.w - f.safe.w) / 2}px;right:auto;top:${(f.h - f.safe.h) / 2}px;width:${f.safe.w}px;height:${f.safe.h}px`
        : `bottom:${regionBottom}px`}">
        <div class="qp-inner ${hideCommittee ? 'no-committee' : ''}">
          <header class="qp-header">${logo}</header>
          <section class="qp-intro">
            ${state.college ? `<div class="qp-pill">${esc(state.college)}</div>` : ''}
            ${state.intro ? `<div class="qp-announce">${esc(state.intro)}</div>` : ''}
            ${state.degree ? `<h1 class="qp-degree">${esc(state.degree)}</h1>` : ''}
            ${state.by ? `<div class="qp-by"><span class="qp-line"></span><span class="qp-by-pill">${esc(state.by)}</span><span class="qp-line"></span></div>` : ''}
          </section>
          <section class="qp-card qp-title-card">
            <div class="qp-tab">${ICON.book}<span>${esc(state.titleLabel)}</span></div>
            <div class="qp-title">${lines(state.title)}</div>
          </section>
          <section class="qp-presenter">
            <div class="qp-presenter-label">${ICON.user}<span>${esc(state.presenterLabel)}</span></div>
            <div class="qp-presenter-name">${esc(state.student)}</div>
          </section>
          ${hideCommittee || !rows ? '' : `<section class="qp-card qp-committee">
            <div class="qp-tab qp-tab-center">${ICON.users}<span>${esc(state.committeeLabel)}</span></div>
            <table class="qp-table"><thead><tr><th class="qp-c-name">${esc(state.colName)}</th><th>${esc(state.colTitle)}</th><th>${esc(state.colRole)}</th></tr></thead>
            <tbody>${rows}</tbody></table>
          </section>`}
          <section class="qp-info">
            <div class="qp-info-item"><span class="qp-ic">${ICON.calendar}</span><div class="qp-info-text"><b>${esc(state.day)}</b><span>${esc(state.date)}</span></div></div>
            <div class="qp-sep"></div>
            <div class="qp-info-item"><span class="qp-ic">${ICON.clock}</span><div class="qp-info-text"><b>${esc(state.time)}</b></div></div>
            <div class="qp-sep"></div>
            <div class="qp-info-item"><span class="qp-ic">${ICON.pin}</span><div class="qp-info-text"><b>${esc(state.place)}</b>${state.placeNote ? `<span>${esc(state.placeNote)}</span>` : ''}</div></div>
            ${qr}
          </section>
        </div>
      </div>
      ${o.footer ? `<footer class="qp-footer" style="height:${f.footer}px">
        <div class="qp-f-item">${esc(state.dept)}</div>
        <div class="qp-f-item" dir="ltr">${ICON.globe}<span>${esc(state.website)}</span></div>
        <div class="qp-f-item" dir="ltr">${ICON.x}<span>${esc(state.handle)}</span></div>
      </footer>` : ''}
      ${f.safe ? `<div class="qp-safe" style="width:${f.safe.w}px;height:${f.safe.h}px" data-export-hide></div>` : ''}`;
  }

  // يملأ المساحة بالمحتوى: يصغّر عند الزحمة ويوزّع المسافات عند الفراغ
  function fit(el) {
    if (el.dataset.layout === 'exact') return fitExact(el);
    const region = el.querySelector('.qp-region');
    const inner = el.querySelector('.qp-inner');
    if (!region || !inner) return 1;
    const W = region.clientWidth, R = region.clientHeight;
    let s = 1;
    for (let i = 0; i < 6; i++) {
      inner.style.transform = 'none';
      inner.style.minHeight = '0';
      inner.style.width = (W / s) + 'px';
      const nat = inner.scrollHeight;
      const ns = Math.min(1, R / nat);
      if (Math.abs(ns - s) < 0.004) { s = Math.min(s, ns); break; }
      s = ns;
    }
    inner.style.width = (W / s) + 'px';
    if (inner.scrollHeight * s > R) s = R / inner.scrollHeight;
    inner.style.width = (W / s) + 'px';
    inner.style.minHeight = (R / s) + 'px';
    inner.style.transform = `scale(${s})`;
    return s;
  }

  window.QPoster = { DEFAULTS, THEMES, FORMATS, customFormat, render, fit, ICON, DEFAULT_LOGO, EXACT, EXACT_ROWS, platformOf, qrModules, EXACT_BG };
})();
