/* تفاصيل المناقشات لشاشة OBS: عنوان الرسالة وأسماء اللجنة من تصاميم الإعلانات.
 * جدول حجز القاعة (assets/data/defenses.json) لا يحمل العنوان ولا اللجنة؛ هذه تُكتب عند تصميم الإعلان وتبقى في سجل
 * التصاميم على جهاز المصمم. هنا تُنشر في assets/data/defense-details.json فيقرؤها OBS مباشرة بلا كلمة مرور.
 * - كل تصميم يُحفظ في السجل يُسجَّل هنا (مفتاحه: اسم الطالب + التاريخ الهجري، كما في OBS).
 * - النشر برمز الوصول نفسه الذي يستخدمه «نشر الندوات» (qu_gh_token)؛ الجهاز بلا رمز يحفظ التفاصيل محليًا حتى يتوفر.
 * - أول مرة يتوفر فيها الرمز تُنشر تفاصيل كل التصاميم الموجودة في سجل هذا الجهاز. */
(function () {
  const PATH = 'assets/data/defense-details.json';
  const PENDING = 'qu_details_pending', BACKFILL = 'qu_details_backfilled';
  const token = () => localStorage.getItem('qu_gh_token') || '';
  const branch = () => localStorage.getItem('qu_gh_branch') || 'gh-pages';
  const REPO = (() => {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i), seg = location.pathname.split('/').filter(Boolean)[0];
    return m ? { owner: m[1], repo: seg && !/\.html$/.test(seg) ? seg : m[1] + '.github.io' } : { owner: 'lklk3643', repo: 'github.io' };
  })();
  const api = p => `https://api.github.com/repos/${REPO.owner}/${encodeURIComponent(REPO.repo)}/${p}`;
  const b64 = { enc: s => { const b = new TextEncoder().encode(s); let x = ''; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); },
                dec: s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0))) };
  const ascii = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const normDate = s => { const m = ascii(s).match(/(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/); return m ? `${+m[1]}/${+m[2]}/${+m[3]}` : ''; };
  const keyOf = (st, d) => String(st || '').trim().replace(/\s+/g, ' ') + '|' + normDate(d);
  const read = () => { try { return JSON.parse(localStorage.getItem(PENDING) || '{}'); } catch (e) { return {}; } };

  function entryOf(s) {
    if (!s || !s.student || !normDate(s.date)) return null;
    const committee = (s.committee || []).filter(m => m && String(m.name || '').trim())
      .map(m => ({ name: String(m.name).trim(), title: String(m.title || '').trim(), role: String(m.role || '').trim() }));
    const title = String(s.title || '').replace(/\s*\n\s*/g, ' ').trim();
    if (!title && !committee.length) return null;
    return { key: keyOf(s.student, s.date), student: String(s.student).trim(), date: normDate(s.date), title, committee, updated: new Date().toISOString() };
  }
  async function publish() {
    const p = read(); if (!token() || !Object.keys(p).length) return false;
    const H = { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' };
    for (let attempt = 0; attempt < 2; attempt++) {
      let doc = { v: '', details: {} }, sha;
      const g = await fetch(api(`contents/${PATH}?ref=${encodeURIComponent(branch())}`), { headers: H, cache: 'no-store' });
      if (g.ok) { const j = await g.json(); sha = j.sha; try { doc = JSON.parse(b64.dec(j.content)); } catch (e) {} }
      else if (g.status !== 404) return false;
      doc.details = { ...(doc.details || {}), ...p }; doc.v = new Date().toISOString();
      const r = await fetch(api(`contents/${PATH}`), { method: 'PUT', headers: H, body: JSON.stringify({
        message: `تفاصيل المناقشات لشاشة OBS (${Object.keys(p).length})`, branch: branch(), ...(sha ? { sha } : {}),
        content: b64.enc(JSON.stringify(doc, null, 1) + '\n') }) });
      if (r.ok) { localStorage.removeItem(PENDING); return true; }
      if (r.status !== 409 && r.status !== 422) return false;   // تعارض: أعد القراءة والدمج مرة واحدة
    }
    return false;
  }
  /* يُستدعى بعد كل حفظ في سجل التصاميم */
  function record(state) {
    const e = entryOf(state); if (!e) return;
    const p = read(); p[e.key] = e; localStorage.setItem(PENDING, JSON.stringify(p));
    publish().catch(() => {});
  }
  /* أول مرة يتوفر فيها الرمز: كل تصاميم السجل على هذا الجهاز */
  async function backfill(list) {
    if (!token() || localStorage.getItem(BACKFILL)) return;
    const p = read(); (list || []).forEach(it => { const e = entryOf(it && it.state); if (e) p[e.key] = e; });
    localStorage.setItem(PENDING, JSON.stringify(p));
    if (await publish().catch(() => false)) localStorage.setItem(BACKFILL, '1');
  }
  window.QDetails = { record, publish, backfill, keyOf };
})();
