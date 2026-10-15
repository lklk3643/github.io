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
    link: '',
    handle: '@QassimUniv',
    website: 'www.qu.edu.sa',
    dept: 'الإعلام والاتصال المؤسسي',
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
    { id: 'a4', name: 'بوستر A4 (عمودي)', w: 1080, h: 1527, layout: 'tall', building: 215, footer: 70 },
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
  const DEFAULT_LOGO = 'assets/img/logo.png';
  const DEFAULT_BUILDING = 'assets/img/building.jpg';

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

  // ---------- الرسم ----------
  function render(el, state, f) {
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
    if (o.qr && state.link && window.qrcode) {
      try {
        const q = window.qrcode(0, 'M'); q.addData(state.link); q.make();
        qr = `<div class="qp-sep"></div><div class="qp-info-item qp-qr">${q.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}<div class="qp-info-text"><b>امسح للبث</b><span>المباشر</span></div></div>`;
      } catch (e) { qr = ''; }
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

  window.QPoster = { DEFAULTS, THEMES, FORMATS, customFormat, render, fit, ICON, DEFAULT_LOGO };
})();
