/* المظهر (فاتح / داكن / تلقائي حسب الجهاز) — مشترك لكل الصفحات.
 *  - يُحمَّل في أول <head> حتى يُطبَّق الاختيار قبل ظهور الصفحة (بدون وميض أبيض).
 *  - الاختيار يُحفظ في localStorage بالمفتاح qu_theme: auto | dark | light.
 *  - «تلقائي» = لا توجد سمة data-theme، والألوان تتبع prefers-color-scheme في app.css.
 *  - الإعلان نفسه (#poster و.qp و.qs وكل ما يُصدَّر صورة) لا يتأثر: app.css يعيد له الألوان الفاتحة.
 */
(function () {
  'use strict';
  if (window.QTheme) return;
  var KEY = 'qu_theme', ORDER = ['auto', 'dark', 'light'];
  var INFO = {
    auto:  { ic: '🌓', t: 'تلقائي', tip: 'المظهر: تلقائي حسب إعداد الجهاز' },
    dark:  { ic: '🌙', t: 'داكن',   tip: 'المظهر: داكن' },
    light: { ic: '☀️', t: 'فاتح',   tip: 'المظهر: فاتح' }
  };
  var root = document.documentElement;

  function read() {
    try { var v = localStorage.getItem(KEY); return ORDER.indexOf(v) >= 0 ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  function apply(mode) {
    if (mode === 'dark' || mode === 'light') root.setAttribute('data-theme', mode);
    else root.removeAttribute('data-theme');
  }
  function paint(btn, mode) {
    var cur = INFO[mode], next = INFO[ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]];
    btn.firstChild.textContent = cur.ic;
    btn.lastChild.textContent = ' ' + cur.t;
    btn.title = cur.tip + ' — اضغط للتبديل إلى «' + next.t + '»';
    btn.setAttribute('aria-label', cur.tip + '. اضغط للتبديل إلى ' + next.t);
  }
  function refresh() {
    var m = read();
    apply(m);
    var list = document.querySelectorAll('.tb-theme');
    for (var i = 0; i < list.length; i++) paint(list[i], m);
  }
  function set(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) { /* تخزين غير متاح: يطبَّق على هذه الصفحة فقط */ }
    apply(mode);
    var list = document.querySelectorAll('.tb-theme');
    for (var i = 0; i < list.length; i++) paint(list[i], mode);
  }
  function cycle() {
    var m = root.getAttribute('data-theme') || 'auto';
    set(ORDER[(ORDER.indexOf(m) + 1) % ORDER.length]);
  }
  function mount() {
    if (document.querySelector('.tb-theme')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn sm tb-theme';
    var ic = document.createElement('span'); ic.setAttribute('aria-hidden', 'true');
    var tx = document.createElement('span'); tx.className = 'tb-theme-t';
    btn.appendChild(ic); btn.appendChild(tx);
    btn.addEventListener('click', function (e) { e.stopPropagation(); cycle(); });
    var top = document.querySelector('.topbar');
    if (top) top.insertBefore(btn, top.querySelector('.tb-menu') || top.querySelector('.tb-actions'));
    else { btn.classList.add('tb-theme-float'); document.body.appendChild(btn); }   // صفحة الدخول: بلا شريط علوي
    paint(btn, read());
  }

  apply(read());
  window.QTheme = { get: read, set: set, cycle: cycle, mount: mount };
  // تبديل المظهر من تبويب آخر ينعكس هنا
  window.addEventListener('storage', function (e) { if (e.key === KEY) refresh(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
