/* تنقل مشترك لصفحتي المناقشات والندوات، واضح على كل الأجهزة:
 *  - شريط تبديل كبير تحت الشريط العلوي: «المناقشات | الندوات» (يظهر دائماً).
 *  - في الجوال: زر «☰ القائمة» يفتح أدوات الصفحة بأسمائها كاملة بدل أيقونات متلاصقة.
 * لا يغيّر أي وظيفة: نفس الأزرار تنتقل بين العرضين بالـ CSS فقط.
 */
(function () {
  'use strict';
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
  const fixTop = () => document.documentElement.style.setProperty('--tb-h', top.offsetHeight + 'px');
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
