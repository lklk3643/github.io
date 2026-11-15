/* تنقل مشترك لصفحتي المناقشات والندوات، واضح على كل الأجهزة:
 *  - شريط تبديل كبير تحت الشريط العلوي: «المناقشات | الندوات» (يظهر دائماً).
 *  - في الجوال: زر «☰ القائمة» يفتح أدوات الصفحة بأسمائها كاملة بدل أيقونات متلاصقة.
 * لا يغيّر أي وظيفة: نفس الأزرار تنتقل بين العرضين بالـ CSS فقط.
 */
(function () {
  'use strict';
  // زر المظهر (فاتح/داكن/تلقائي): theme.js يُفضَّل تحميله في أول <head>؛ وإن لم يُحمَّل هناك نحمّله من هنا
  if (!window.QTheme) {
    const s = document.createElement('script');
    s.src = 'assets/js/theme.js?v=202611142301';
    document.head.appendChild(s);
  }
  const top = document.querySelector('.topbar');
  if (!top) return;
  const here = /seminars\.html/.test(location.pathname) ? 'sem' : 'def';

  // 1) شريط التبديل بين القسمين
  const sec = document.createElement('nav');
  sec.className = 'sec-nav'; sec.setAttribute('aria-label', 'الأقسام');
  [['def', 'app.html', '📢', 'المناقشات'], ['sem', 'seminars.html', '🎤', 'الندوات']].forEach(([k, href, ic, label]) => {
    const a = document.createElement('a');
    a.href = href; a.className = 'sec-btn' + (k === here ? ' active' : '');
    if (k === here) a.setAttribute('aria-current', 'page');
    const i = document.createElement('span'); i.textContent = ic; i.setAttribute('aria-hidden', 'true');
    a.appendChild(i); a.appendChild(document.createTextNode(' ' + label));
    sec.appendChild(a);
  });
  top.insertAdjacentElement('afterend', sec);
  // شريط الأقسام يلتصق تحت الشريط العلوي مهما كان ارتفاعه (يتغير بين الجوال والآيباد والكمبيوتر)
  // --sticky-h = الشريط العلوي + شريط الأقسام: كل تمرير لقسم (أزرار الجوال السفلية) يوقف تحتهم مو تحتهم مخفي
  const fixTop = () => { const R = document.documentElement.style; R.setProperty('--tb-h', top.offsetHeight + 'px'); R.setProperty('--sticky-h', (top.offsetHeight + sec.offsetHeight) + 'px'); };
  fixTop(); addEventListener('resize', fixTop);
  if (window.ResizeObserver) new ResizeObserver(fixTop).observe(top);

  // 2) زر القائمة للجوال
  const actions = top.querySelector('.tb-actions');
  if (!actions) return;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn sm tb-menu'; btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'القائمة'); btn.textContent = '☰ القائمة';
  top.insertBefore(btn, actions);
  const close = () => { top.classList.remove('menu-open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !top.classList.contains('menu-open');
    top.classList.toggle('menu-open', open); btn.setAttribute('aria-expanded', String(open));
  });
  actions.addEventListener('click', (e) => { if (e.target.closest('.btn')) close(); });   // اختيار أداة يقفل القائمة
  document.addEventListener('click', (e) => { if (!top.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();

// طول شريط الأزرار السفلي في الجوال (مع مساحة شريط الإيماءات) → متغير CSS --mnav-h، حتى ما يغطي آخر الصفحة
(function () {
  function fit() {
    const m = document.querySelector('.mnav');
    const h = m && getComputedStyle(m).display !== 'none' ? Math.ceil(m.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--mnav-h', h + 'px');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fit); else fit();
  addEventListener('load', fit); addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 300));
})();

// تحديث الموقع للصفحات المفتوحة: إذا نزلت نسخة جديدة والصفحة مفتوحة من قبل، تتحدث لحالها لما ترجع لها
// (أو بعد دقيقة بدون لمس)، بشرط ما يكون أحد يكتب أو فيه نافذة مفتوحة. التعديلات ما تضيع: الحفظ يصير قبل المغادرة.
(function () {
  const sig = html => (String(html).match(/assets\/(?:js|css)\/[\w-]+\.(?:js|css)\?v=\d+/g) || []).sort().join('|');
  // تُقرأ ملفات الصفحة وقت الفحص (nav.js يتحمّل في نص الصفحة، فقبل اكتمالها تكون القائمة ناقصة)
  const mineNow = () => sig([...document.querySelectorAll('script[src],link[rel=stylesheet][href]')].map(e => e.getAttribute('src') || e.getAttribute('href')).join(' '));
  let fresh = false, lastTouch = Date.now(), bar = null;
  ['pointerdown', 'keydown', 'input'].forEach(ev => addEventListener(ev, () => { lastTouch = Date.now(); }, true));
  const busy = () => { const a = document.activeElement; return (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || document.querySelector('.modal.open'); };
  let target = '';
  function tryReload() {
    if (!fresh || busy()) return;
    // مرة وحدة لكل نسخة: لو المتصفح رجّع نسخة قديمة بعد التحديث ما ندخل في تحديث ورا تحديث — يبقى الشريط
    try { if (sessionStorage.getItem('qu_reloaded_for') === target) return; sessionStorage.setItem('qu_reloaded_for', target); } catch (e) { return; }
    try { if (window.QCloud && QCloud.flush) QCloud.flush(true); } catch (e) { /* اختياري */ }
    setTimeout(() => location.reload(), 400);
  }
  function showBar() {
    if (bar) return;
    bar = document.createElement('button'); bar.type = 'button'; bar.className = 'update-bar';
    bar.textContent = '🔄 فيه تحديث جديد للموقع — اضغط هنا للتحديث';
    bar.onclick = () => { try { if (window.QCloud && QCloud.flush) QCloud.flush(true); } catch (e) { /* اختياري */ } setTimeout(() => location.reload(), 300); };
    document.body.appendChild(bar);
  }
  async function check(back) {
    if (document.readyState !== 'complete') return;
    if (fresh) return tryReload();
    try {
      const r = await fetch(location.pathname + '?_=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return;
      const theirs = sig(await r.text());
      const mine = mineNow();
      if (theirs && mine && theirs !== mine) { fresh = true; target = theirs; showBar(); if (back || document.hidden || Date.now() - lastTouch > 60000) tryReload(); }
    } catch (e) { /* بدون اتصال */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(true); });   // رجعت للصفحة (الجوال خصوصاً)
  addEventListener('focus', () => check(true));
  addEventListener('pageshow', e => { if (e.persisted) check(true); });   // رجوع من ذاكرة المتصفح بالجوال
  setInterval(check, 120000);
  setInterval(() => { if (fresh && Date.now() - lastTouch > 60000) tryReload(); }, 15000);
})();

// «⚙️ أدوات متقدمة» مطوية دايماً عند فتح الصفحة (المناقشات والندوات) — الواجهة أبسط، واللي يحتاجها يفتحها
(function () {
  const fold = () => document.querySelectorAll('details.ds-adv').forEach(d => { d.open = false; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fold); else fold();
  addEventListener('pageshow', fold);
})();
