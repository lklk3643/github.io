/* اقتراح أسماء أعضاء هيئة التدريس أثناء الكتابة (المناقشات والندوات).
   تكتب «عبد الله خالد» أو «عبدالله» أو جزءًا من الاسم ← تظهر قائمة بالأسماء مع الرتبة والقسم.
   الاختيار يكتب الاسم مع اللقب (أ.د. / د.)، ويعبّي خانة الصفة المجاورة إن كانت فاضية.
   المصدر: /api/people (للمسجلين فقط) + الأسماء المكتوبة سابقًا في الصفحة (QPeople.addExtra).
   كل صفحة تحدد خاناتها: QPeople.bind(input => ({ title: <خانة الصفة أو null> }) | null) */
(function () {
  'use strict';
  const RANK = { 'أستاذ': 'الأستاذ', 'أستاذ مشارك': 'الأستاذ المشارك', 'أستاذ مساعد': 'الأستاذ المساعد', 'محاضر': 'المحاضر', 'مدرس': 'المدرس', 'معيد': 'المعيد' };
  const PREFIX = { 'أستاذ': 'أ.د. ', 'أستاذ مشارك': 'د. ', 'أستاذ مساعد': 'د. ' };
  const STOP = new Set(['بن', 'بنت', 'ابن', 'د', 'اد', 'ا', 'الدكتور', 'الدكتوره', 'دكتور', 'الشيخ', 'الاستاذ', 'الاستاذه']);
  let people = [], extra = [], resolver = null, loaded = false;

  // تطبيع للبحث: بلا تشكيل، الألف والتاء المربوطة والياء موحّدة، «عبد الله» = «عبدالله»
  const norm = s => String(s || '').normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[.،,()\-_/]/g, ' ').trim();
  function tokens(s) {
    const raw = norm(s).split(/\s+/).filter(Boolean), out = [];
    for (let i = 0; i < raw.length; i++) {
      let t = raw[i];
      if ((t === 'عبد' || t === 'ابو') && raw[i + 1]) t += raw[++i];   // عبد الله → عبدالله
      if (!STOP.has(t)) out.push(t);
    }
    return out;
  }
  const titleOf = p => p.title != null ? p.title : (p.t ? (RANK[p.t] || p.t) : 'عضو هيئة التدريس') + (p.d ? ' في ' + p.d : '');
  const nameOf = p => p.full || ((PREFIX[p.t] || '') + p.n);

  function index(list, kind) {
    return list.map(p => ({ ...p, kind, toks: tokens(p.n || p.full) }));
  }
  function search(q) {
    const qt = tokens(q); if (!qt.length || norm(q).length < 2) return [];
    const res = [], seen = new Set();
    for (const p of extra.concat(people)) {
      const key = norm(nameOf(p)).replace(/\s/g, ''); if (seen.has(key)) continue;
      let score = 0, ok = true;
      for (let k = 0; k < qt.length; k++) {
        const at = p.toks.findIndex(t => t.startsWith(qt[k]));
        if (at < 0) { ok = false; break; }
        score += at + (k === 0 && at === 0 ? -5 : 0);
      }
      if (!ok) continue;
      seen.add(key); res.push([score + (p.kind === 'extra' ? -1 : 0), p]);
    }
    return res.sort((a, b) => a[0] - b[0] || nameOf(a[1]).length - nameOf(b[1]).length).slice(0, 8).map(x => x[1]);
  }

  async function load() {
    if (loaded) return; loaded = true;
    try { const c = sessionStorage.getItem('qu_people'); if (c) { people = index(JSON.parse(c), 'staff'); return; } } catch (e) { /* اختياري */ }
    try {
      const s = window.QAuth && QAuth.current && QAuth.current();
      if (!s || !s.token) return;
      const r = await fetch('/api/people', { headers: { authorization: 'Bearer ' + s.token } });
      if (!r.ok) return;
      const j = await r.json();
      people = index(j.people || [], 'staff');
      try { sessionStorage.setItem('qu_people', JSON.stringify(j.people || [])); } catch (e) { /* اختياري */ }
    } catch (e) { loaded = false; }
  }

  // ---------- القائمة
  const box = document.createElement('div');
  box.className = 'qp-list'; box.setAttribute('role', 'listbox'); box.hidden = true;
  let cur = null, items = [], act = -1;
  // المكان: تحت الخانة إن وسعت، وإلا فوقها — ولا تدخل تحت الشريط العلوي الثابت أو شريط الجوال السفلي
  const cssPx = n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
  function place() {
    const r = cur.getBoundingClientRect();
    const topLimit = cssPx('--sticky-h') + 8, botLimit = innerHeight - cssPx('--mnav-h') - 8;
    if (r.bottom < topLimit || r.top > botLimit) return hide();         // الخانة طلعت من الشاشة
    box.style.maxHeight = ''; const h = Math.min(box.scrollHeight + 2, 320);
    const below = botLimit - r.bottom - 2, above = r.top - topLimit - 2;
    if (below >= Math.min(h, 200) || below >= above) { box.style.top = (r.bottom + window.scrollY + 2) + 'px'; box.style.maxHeight = Math.max(120, Math.min(320, below)) + 'px'; }
    else { const hh = Math.min(h, above); box.style.top = (r.top + window.scrollY - hh - 2) + 'px'; box.style.maxHeight = hh + 'px'; }
    box.style.width = Math.max(r.width, 300) + 'px';
    box.style.left = Math.max(8, Math.min(r.right - Math.max(r.width, 300), window.innerWidth - Math.max(r.width, 300) - 8)) + window.scrollX + 'px';
  }
  function show(input, list) {
    cur = input; items = list; act = -1;
    if (!list.length) return hide();
    box.innerHTML = '';
    list.forEach((p, i) => {
      const o = document.createElement('div'); o.className = 'qp-it'; o.setAttribute('role', 'option'); o.dataset.i = i;
      const b = document.createElement('b'); b.textContent = nameOf(p);
      const sm = document.createElement('small'); sm.textContent = titleOf(p) || (p.kind === 'extra' ? 'مكتوب سابقًا' : '');
      o.append(b, sm); box.appendChild(o);
    });
    if (!box.isConnected) document.body.appendChild(box);
    box.hidden = false; place();
  }
  function hide() { box.hidden = true; items = []; act = -1; }
  function mark(i) { act = i; [...box.children].forEach((c, k) => c.classList.toggle('on', k === i)); if (box.children[i]) box.children[i].scrollIntoView({ block: 'nearest' }); }
  const fire = el => el.dispatchEvent(new Event('input', { bubbles: true }));
  function choose(i) {
    const p = items[i], input = cur; if (!p || !input) return;
    const pair = resolver && resolver(input);
    input.value = nameOf(p); fire(input);
    const t = pair && pair.title, tv = titleOf(p);
    if (t && tv && (!t.value.trim() || t.dataset.qpAuto === t.value)) { t.value = tv; t.dataset.qpAuto = tv; fire(t); }
    hide(); input.focus();
  }

  document.addEventListener('input', e => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !resolver || !resolver(el)) return;
    if (!e.isTrusted) return;
    load().then(() => { if (document.activeElement === el) show(el, search(el.value)); });
  });
  document.addEventListener('keydown', e => {
    if (box.hidden || e.target !== cur) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { mark(Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1)))); }
    else if (e.key === 'Enter' && act >= 0) { choose(act); }
    else if (e.key === 'Escape') { hide(); }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  box.addEventListener('mousedown', e => { const o = e.target.closest('.qp-it'); if (!o) return; e.preventDefault(); choose(+o.dataset.i); });
  // صفحة الندوات تعيد رسم البرنامج وأنت تكتب (الخانة تُستبدل بنسخة جديدة فيها نفس الكلام): القائمة تنتقل معها بدل ما تتسكر
  document.addEventListener('focusout', e => { if (e.target !== cur) return; const was = cur;
    setTimeout(() => { if (cur !== was || box.hidden) return; const a = document.activeElement;
      if (a && a !== was && a instanceof HTMLInputElement && resolver && resolver(a) && a.value === was.value) { cur = a; place(); return; }
      hide(); }, 120); });
  // لمسة برّا الخانة والقائمة تسكّرها (الآيباد ما يشيل التركيز من الخانة إذا لمست مكان فاضي)
  document.addEventListener('pointerdown', e => { if (!box.hidden && e.target !== cur && !box.contains(e.target)) hide(); }, true);
  window.addEventListener('resize', () => { if (!box.hidden) place(); });
  document.addEventListener('scroll', () => { if (!box.hidden && cur) place(); }, true);

  const css = document.createElement('style');
  css.textContent = `.qp-list{position:absolute;z-index:9999;background:var(--qp-bg,#fff);color:var(--qp-text,#123);border:1px solid var(--qp-line,#b9cfcd);border-radius:10px;box-shadow:0 8px 24px rgba(0,40,60,.18);max-height:320px;overflow:auto;direction:rtl;padding:4px}
.qp-it{padding:8px 10px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.qp-it b{font-size:14px;color:var(--qp-text,#123)}.qp-it small{font-size:12.5px;color:var(--qp-small,#4d6362)}
.qp-it:hover,.qp-it.on{background:var(--qp-hover,#e3eef7)}`;
  document.head.appendChild(css);

  window.QPeople = {
    bind(fn) { resolver = fn; load(); },   // صفحة بلا قائمة اقتراحات خاصة (الندوات)
    // أسماء مكتوبة سابقًا في الصفحة: [{name, title}] — تظهر قبل غيرها وتُكتب كما هي
    addExtra(list) {
      const m = new Map();
      (list || []).forEach(x => { const n = String(x.name || '').trim(); if (n.length > 3 && !m.has(norm(n))) m.set(norm(n), { full: n, title: String(x.title || '').trim() }); });
      extra = index([...m.values()], 'extra');
    },
    search, norm, load,
    // للقوائم الموجودة في الصفحة: [{name, title}] من أعضاء هيئة التدريس فقط
    find: q => search(q).filter(p => p.kind === 'staff').map(p => ({ name: nameOf(p), title: titleOf(p) })),
    key: s => tokens(s).join(''),
  };
})();
