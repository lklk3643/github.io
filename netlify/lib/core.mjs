/* خادم مصمم الإعلانات على Netlify: دخول الموظفين، حفظ بيانات كل حساب في السحابة، وملفات حيّة لشاشة OBS.
 *
 * التخزين (Netlify Blobs، مخزن "qu"):
 *   users                 قائمة الموظفين [{u,name,role,h}] — h = sha256(اسم المستخدم بحروف صغيرة + ':' + كلمة المرور)
 *   sess/<token>          جلسة دخول {u,name,role,exp}
 *   state/<u>             مفاتيح المتصفح الخاصة بالحساب {key: value} (الجدول، القوالب، الإعدادات...)
 *   hist/<u>/<id>         عنصر من سجل التصاميم
 *   rows/<u>              أسطر جدول المناقشات للحساب (لشاشة OBS)
 *   details/<key>         عنوان الرسالة واللجنة من تصميم محفوظ (مفتاحه: الطالب|التاريخ الهجري)
 *   seminars              {v, seminars:[...]} الندوات (نفس صيغة assets/data/seminars.json)
 *
 * ملفات OBS (عامة للقراءة فقط، بلا كلمة مرور): /api/feed/defenses.json  /api/feed/defense-details.json  /api/feed/seminars.json
 * لا يُرجَع أي «h» لكلمات المرور للمتصفح أبداً.
 */
import { createHash, randomBytes } from 'node:crypto';

const DAY = 864e5;
const SESSION_DAYS = 30;
const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
export const hashPassword = (u, p) => sha(String(u).trim().toLowerCase() + ':' + p);
const lower = (u) => String(u || '').trim().toLowerCase();

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const PUBLIC = { 'access-control-allow-origin': '*' };     // ملفات OBS تُقرأ من file:// داخل OBS
const err = (msg, status = 400) => json({ error: msg }, status);

// ---------- أدوات التخزين ----------
async function getJSON(store, key, def = null) {
  const v = await store.get(key, { type: 'json' }).catch(() => null);
  return v == null ? def : v;
}
const setJSON = (store, key, v) => store.setJSON(key, v);

async function staticFile(origin, path) {
  try { const r = await fetch(new URL(path, origin), { cache: 'no-store' }); return r.ok ? await r.json() : null; }
  catch (e) { return null; }
}

// الموظفون: أول مرة تُنسخ من users.json في الموقع، بعدها تُدار من السحابة وحدها
async function users(store, origin) {
  let list = await getJSON(store, 'users');
  if (!Array.isArray(list) || !list.length) {
    const file = await staticFile(origin, '/users.json');
    list = Array.isArray(file) && file.length ? file : [{ u: 'admin', name: 'مدير النظام', role: 'admin', h: hashPassword('admin', 'admin123') }];
    list = list.filter(x => x && x.u && x.h).map(({ u, name, role, h }) => ({ u, name: name || u, role: role === 'admin' ? 'admin' : 'employee', h }));
    await setJSON(store, 'users', list);
  }
  return list;
}

async function auth(store, req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const s = await getJSON(store, 'sess/' + m[1]);
  if (!s || s.exp < Date.now()) return null;
  return { ...s, token: m[1] };
}

// ---------- ملفات OBS ----------
const ascii = (s) => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const normDate = (s) => { const m = ascii(s).match(/(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/); return m ? `${+m[1]}/${+m[2]}/${+m[3]}` : ''; };
const keyOf = (st, d) => String(st || '').trim().replace(/\s+/g, ' ') + '|' + normDate(d);
const ROW_FIELDS = ['الدرجة', 'الجنس', 'الطالب', 'العنوان', 'اليوم', 'التاريخ', 'الوقت', 'المكان', 'ملاحظة المكان', 'رابط البث',
  'رابط اللجنة', 'رابط التسجيل', 'الملاحظات', 'منسق الحجز', 'الكاتب'];

async function allRows(store) {
  const out = [];
  const { blobs } = await store.list({ prefix: 'rows/' });
  for (const b of blobs) { const r = await getJSON(store, b.key, []); if (Array.isArray(r)) out.push(...r); }
  return out;
}

// جدول حجز القاعة (الملف الثابت) + ما كتبه الموظفون في جداولهم (الأحدث يكمّل الناقص ولا يمسح الموجود)
async function feedDefenses(store, origin) {
  const base = (await staticFile(origin, '/assets/data/defenses.json')) || { v: '', rows: [], fixes: [], remove: [] };
  const map = new Map((base.rows || []).map(r => [keyOf(r['الطالب'], r['التاريخ']), { ...r }]));
  for (const r of await allRows(store)) {
    const k = keyOf(r['الطالب'], r['التاريخ']); if (!r['الطالب'] || !normDate(r['التاريخ'])) continue;
    const cur = map.get(k) || {};
    const m = { ...cur }; ROW_FIELDS.forEach(f => { if (String(r[f] || '').trim()) m[f] = r[f]; });
    map.set(k, m);
  }
  return { ...base, v: new Date().toISOString(), rows: [...map.values()] };
}

function detailsFromRow(r) {
  const committee = [];
  for (let i = 1; i <= 8; i++) {
    const name = String(r[`عضو${i} الاسم`] || '').trim();
    if (name) committee.push({ name, title: String(r[`عضو${i} الصفة`] || '').trim(), role: String(r[`عضو${i} الدور`] || '').trim() });
  }
  const title = String(r['العنوان'] || '').replace(/\s*\|\s*/g, ' ').trim();
  if (!r['الطالب'] || !normDate(r['التاريخ']) || (!title && !committee.length)) return null;
  return { key: keyOf(r['الطالب'], r['التاريخ']), student: String(r['الطالب']).trim(), date: normDate(r['التاريخ']), title, committee };
}

async function feedDetails(store, origin) {
  const base = (await staticFile(origin, '/assets/data/defense-details.json')) || { v: '', details: {} };
  const details = { ...(base.details || {}) };
  for (const r of await allRows(store)) { const d = detailsFromRow(r); if (d) details[d.key] = { ...(details[d.key] || {}), ...d }; }
  const { blobs } = await store.list({ prefix: 'details/' });
  for (const b of blobs) { const d = await getJSON(store, b.key); if (d && d.key) details[d.key] = { ...(details[d.key] || {}), ...d }; }
  return { v: new Date().toISOString(), details };
}

// كل ندوة في مدخل مستقل (sem/<id>): حفظ جهازين معاً لا يمسح أحدهما الآخر
const semKey = (id) => 'sem/' + String(id).replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 80);
async function seminarsDoc(store, origin) {
  if (!(await getJSON(store, 'sem-seeded'))) {             // أول مرة: من آخر نسخة مجمّعة إن وُجدت، وإلا ملف الموقع
    const old = (await getJSON(store, 'seminars')) || (await staticFile(origin, '/assets/data/seminars.json')) || { seminars: [] };
    for (const s of old.seminars || []) if (s && s.id) await setJSON(store, semKey(s.id), s);
    await setJSON(store, 'sem-seeded', { at: new Date().toISOString() });
  }
  const { blobs } = await store.list({ prefix: 'sem/' });
  const seminars = [];
  for (const b of blobs) { const s = await getJSON(store, b.key); if (s && s.id) seminars.push(s); }
  seminars.sort((a, b) => ((a.date || '') + (a.start || '')).localeCompare((b.date || '') + (b.start || '')));
  return { v: new Date().toISOString(), source: 'صفحة الندوات', seminars };
}

// ---------- الطلب ----------
export async function handle(req, store) {
  const url = new URL(req.url);
  const origin = url.origin;
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...PUBLIC, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': '*' } });
  const body = async () => { try { return await req.json(); } catch (e) { return {}; } };

  // --- عام: ملفات OBS
  if (method === 'GET' && path === 'feed/defenses.json') return json(await feedDefenses(store, origin), 200, PUBLIC);
  if (method === 'GET' && path === 'feed/defense-details.json') return json(await feedDetails(store, origin), 200, PUBLIC);
  if (method === 'GET' && path === 'feed/seminars.json') return json(await seminarsDoc(store, origin), 200, PUBLIC);
  if (method === 'GET' && path === 'ping') return json({ ok: true });

  // --- الدخول
  if (method === 'POST' && path === 'login') {
    const { u, p } = await body();
    const list = await users(store, origin);
    const user = list.find(x => lower(x.u) === lower(u));
    if (!user || user.h !== hashPassword(user.u, String(p || ''))) return err('اسم المستخدم أو كلمة المرور غير صحيحة', 401);
    const token = randomBytes(24).toString('base64url');
    const s = { u: user.u, name: user.name, role: user.role, exp: Date.now() + SESSION_DAYS * DAY };
    await setJSON(store, 'sess/' + token, s);
    return json({ token, session: { u: user.u, name: user.name, role: user.role, t: Date.now(), weak: lower(user.u) === 'admin' && p === 'admin123' } });
  }

  const me = await auth(store, req);
  if (!me) return err('سجّل الدخول من جديد', 401);
  const U = lower(me.u);

  if (method === 'POST' && path === 'logout') { await store.delete('sess/' + me.token); return json({ ok: true }); }
  if (method === 'GET' && path === 'me') return json({ u: me.u, name: me.name, role: me.role });

  // --- بيانات الحساب (مفاتيح المتصفح)
  if (path === 'state') {
    if (method === 'GET') return json({ data: await getJSON(store, 'state/' + U, {}) });
    if (method === 'POST') {
      const { set = {}, del = [] } = await body();
      const cur = await getJSON(store, 'state/' + U, {});
      Object.entries(set).forEach(([k, v]) => { if (typeof k === 'string' && k.startsWith('qu_') && typeof v === 'string') cur[k] = v; });
      (Array.isArray(del) ? del : []).forEach(k => { delete cur[k]; });
      await setJSON(store, 'state/' + U, cur);
      return json({ ok: true });
    }
  }

  // --- سجل التصاميم
  if (path === 'hist' && method === 'GET') {
    const { blobs } = await store.list({ prefix: `hist/${U}/` });
    const items = [];
    for (const b of blobs) { const it = await getJSON(store, b.key); if (it) items.push(it); }
    return json({ items });
  }
  if (path === 'hist' && method === 'POST') {
    const { item } = await body();
    if (!item || typeof item !== 'object') return err('عنصر غير صالح');
    const id = Number.isFinite(+item.id) && +item.id > 0 ? +item.id : Date.now() * 100 + Math.floor(Math.random() * 100);
    await setJSON(store, `hist/${U}/${id}`, { ...item, id, user: U });
    return json({ id });
  }
  { const m = path.match(/^hist\/(\d+)$/);
    if (m && method === 'DELETE') { await store.delete(`hist/${U}/${m[1]}`); return json({ ok: true }); } }

  // --- أسطر جدول المناقشات وتفاصيل التصاميم (لشاشة OBS)
  if (path === 'rows' && method === 'POST') {
    const { rows, dev } = await body();
    if (!Array.isArray(rows)) return err('أسطر غير صالحة');
    // لكل جهاز نسخته (حتى لو دخل اثنان بنفس الحساب معاً)، وملف OBS يجمع كل النسخ فلا يضيع سطر
    const D = String(dev || 'main').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'main';
    await setJSON(store, `rows/${U}/${D}`, rows.slice(0, 5000));
    return json({ ok: true, n: rows.length });
  }
  if (path === 'details' && method === 'POST') {
    const { entries } = await body();
    for (const e of Object.values(entries || {})) {
      if (e && e.key && e.student) await setJSON(store, 'details/' + sha(e.key).slice(0, 32), { ...e, by: me.u, updated: new Date().toISOString() });
    }
    return json({ ok: true });
  }

  // --- الندوات: الحفظ = النشر (تظهر في OBS مباشرة)
  if (path === 'seminars' && method === 'POST') {
    const { upsert = [], remove = [] } = await body();
    await seminarsDoc(store, origin);                         // يضمن نقل البيانات القديمة أول مرة
    for (const s of Array.isArray(upsert) ? upsert : []) if (s && s.id) await setJSON(store, semKey(s.id), { ...s, id: String(s.id), by: me.u });
    for (const id of Array.isArray(remove) ? remove : []) await store.delete(semKey(id));
    return json(await seminarsDoc(store, origin));
  }

  // --- الموظفون وكلمة المرور
  if (path === 'password' && method === 'POST') {
    const { old, nw } = await body();
    const list = await users(store, origin);
    const user = list.find(x => lower(x.u) === U);
    if (!user || user.h !== hashPassword(user.u, String(old || ''))) return err('كلمة المرور الحالية غير صحيحة', 403);
    if (!nw || String(nw).length < 6) return err('كلمة المرور الجديدة يجب ألا تقل عن 6 خانات');
    user.h = hashPassword(user.u, String(nw));
    await setJSON(store, 'users', list);
    return json({ ok: true });
  }
  if (path === 'users') {
    if (me.role !== 'admin') return err('للمدير فقط', 403);
    const list = await users(store, origin);
    if (method === 'GET') return json({ users: list.map(({ u, name, role }) => ({ u, name, role })) });
    if (method === 'POST') {
      const { u, name, role, password } = await body();
      if (!/^[A-Za-z0-9_.\-]{3,32}$/.test(String(u || ''))) return err('اسم المستخدم يجب أن يكون 3-32 حرفاً إنجليزياً أو أرقاماً');
      const ex = list.find(x => lower(x.u) === lower(u));
      if (!ex && !password) return err('أدخل كلمة مرور للمستخدم الجديد');
      if (password && String(password).length < 6) return err('كلمة المرور يجب ألا تقل عن 6 خانات');
      const rec = { u: ex ? ex.u : String(u), name: name || (ex && ex.name) || String(u), role: (role || (ex && ex.role)) === 'admin' ? 'admin' : 'employee',
        h: password ? hashPassword(ex ? ex.u : u, String(password)) : ex.h };
      const out = list.filter(x => lower(x.u) !== lower(u)); out.push(rec);
      await setJSON(store, 'users', out);
      return json({ ok: true });
    }
  }
  { const m = path.match(/^users\/([A-Za-z0-9_.\-]{1,32})$/);
    if (m && method === 'DELETE') {
      if (me.role !== 'admin') return err('للمدير فقط', 403);
      const list = await users(store, origin);
      const target = list.find(x => lower(x.u) === lower(m[1]));
      if (target && target.role === 'admin' && list.filter(x => x.role === 'admin').length <= 1) return err('لا يمكن حذف آخر مدير في النظام');
      await setJSON(store, 'users', list.filter(x => lower(x.u) !== lower(m[1])));
      return json({ ok: true });
    } }

  return err('غير موجود', 404);
}
