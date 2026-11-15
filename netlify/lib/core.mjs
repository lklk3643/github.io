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
import { DEMO_FLAG, demoRows, demoGrid, demoSeminars, GCOLS } from './demo.mjs';
import { PEOPLE } from './people.mjs';

const DAY = 864e5;
const SESSION_DAYS = 30;
const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
// الحسابات الأولى (أسماء وأسماء مستخدمين فقط؛ لا كلمات مرور هنا — الأولى = اسم المستخدم وتُخزَّن مُجزّأة)
const STAFF = [
  ['brady', 'عبدالكريم ناصر ابراهيم البرادى', 'super'],
  ['b.alwanyan', 'باسم ابراهيم بن محمد الونيان', 'admin'],
  ['abd.allahim', 'عبد العزيز إبراهيم علي اللاحم', 'admin'],
  ['m.albishri', 'محمد عاتق فرج البشري', 'admin'],
  ['a.abdou', 'علي عبدالفتاح محمد عبده', 'admin'],
  ['ssshaiea', 'صالح سليمان محمد الشايع', 'admin'],
  ['ma.hrby', 'محمد عايد الحميدي الحربي', 'admin'],
  ['an.alwasel', 'أنس خالد إبراهيم الواصل', 'super'],
  ['samtrody', 'سليمان عبدالله سليمان المطرودى', 'admin'],
  ['h.alnasser', 'حسين بن علي بن محمد النصير', 'admin']
].map(([u, name, role]) => ({ u, name, role }));
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
// الصلاحيات: super = مدير عام (كل شيء + إدارة الحسابات)، admin = مدير (كل شيء إلا الحسابات)، employee = موظف.
// كل حساب يرى جدوله وإعداداته فقط (state/<u>)؛ قائمة الحسابات للمدير العام وحده.
const normRole = r => (r === 'super' || r === 'admin') ? r : 'employee';
const STAFF_FLAG = 'staff-seeded-2026-11-13';
async function users(store, origin) {
  let list = await getJSON(store, 'users'), dirty = false;
  if (!Array.isArray(list) || !list.length) {
    const file = await staticFile(origin, '/users.json');
    list = Array.isArray(file) && file.length ? file : [{ u: 'admin', name: 'مدير النظام', role: 'admin', h: hashPassword('admin', 'admin123') }];
    list = list.filter(x => x && x.u && x.h).map(({ u, name, role, h }) => ({ u, name: name || u, role: normRole(role), h }));
    dirty = true;
  }
  // قبل وجود «مدير عام»: حساب admin (أو أول مدير) يصير مديرًا عامًا
  if (!list.some(x => x.role === 'super')) {
    const a = list.find(x => lower(x.u) === 'admin') || list.find(x => x.role === 'admin');
    if (a) { a.role = 'super'; dirty = true; }
  }
  // حسابات الموظفين مرة واحدة: كلمة المرور الأولى = اسم المستخدم (يغيّرها صاحبها من «كلمة المرور» إن شاء)
  // كل حساب يُضاف مرة واحدة فقط (إن حذفه المدير العام لا يرجع). العلامة القديمة بلا قائمة = التسعة الأوائل أُضيفوا
  const flag = await getJSON(store, STAFF_FLAG);
  const seeded = flag ? (flag.seeded || STAFF.slice(0, 9).map(s => s.u)) : [];
  const todo = STAFF.filter(s => !seeded.includes(s.u));
  if (todo.length) {
    for (const s of todo) if (!list.some(x => lower(x.u) === lower(s.u))) { list.push({ u: s.u, name: s.name, role: s.role, h: hashPassword(s.u, s.u) }); dirty = true; }
    await setJSON(store, STAFF_FLAG, { at: new Date().toISOString(), seeded: [...seeded, ...todo.map(s => s.u)] });
  }
  if (dirty) await setJSON(store, 'users', list);
  return list;
}
const roleNow = (list, u) => { const x = list.find(y => lower(y.u) === lower(u)); return x ? x.role : null; };

async function auth(store, req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const s = await getJSON(store, 'sess/' + m[1]);
  if (!s || s.exp < Date.now()) return null;
  return { ...s, token: m[1] };
}

// ---------- ملفات OBS ----------
const ascii = (s) => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const normDate = (s) => { const m = ascii(s).match(/(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/); return m ? `${+m[1]}/${+m[2]}/${+m[3]}` : ''; };   // يقبل 1448/6/5 و 1448-6-5 و 1448.6.5
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
  const gone = new Set(((await getJSON(store, 'state/_shared')) || {}).gone || []);
  const map = new Map((base.rows || []).map(r => [keyOf(r['الطالب'], r['التاريخ']), { ...r }]).filter(([k]) => !gone.has(k)));
  for (const r of await allRows(store)) {
    const k = keyOf(r['الطالب'], r['التاريخ']); if (!r['الطالب'] || !normDate(r['التاريخ'])) continue;
    const m = { ...(map.get(k) || {}) }; ROW_FIELDS.forEach(f => { m[f] = r[f] || ''; });   // الجدول هو المرجع: الخانة اللي فرّغها الموظف تنفرغ في البث
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
  const gone = new Set(((await getJSON(store, 'state/_shared')) || {}).gone || []);
  const details = Object.fromEntries(Object.entries(base.details || {}).filter(([k]) => !gone.has(k)));
  for (const r of await allRows(store)) { const d = detailsFromRow(r); if (d) details[d.key] = { ...(details[d.key] || {}), ...d }; }
  const { blobs } = await store.list({ prefix: 'details/' });
  for (const b of blobs) { const d = await getJSON(store, b.key); if (d && d.key && !gone.has(d.key)) details[d.key] = { ...(details[d.key] || {}), ...d }; }
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

// بيانات تجريبية كاملة تُضاف مرة واحدة (انظر demo.mjs)
async function ensureDemo(store, origin) {
  if (await getJSON(store, DEMO_FLAG)) return;
  await seminarsDoc(store, origin);                         // نقل الندوات القديمة أولاً حتى لا يتجاوزها
  for (const s of demoSeminars()) await setJSON(store, semKey(s.id), { ...s, by: 'admin' });
  await setJSON(store, 'rows/admin/demo', demoRows());
  const st = await getJSON(store, 'state/admin', {});
  let grid = []; try { grid = JSON.parse(st.qu_grid_admin || '[]'); } catch (e) { grid = []; }
  if (!Array.isArray(grid)) grid = [];
  const has = new Set(grid.map(r => Array.isArray(r) ? String(r[2] || '').trim() : ''));
  grid = grid.filter(r => Array.isArray(r) && r.some(v => String(v || '').trim()));
  for (const r of demoGrid()) if (!has.has(r[2])) grid.push(r);
  st.qu_grid_admin = JSON.stringify(grid); st.qu_gridv_admin = '5';
  await setJSON(store, 'state/admin', st);
  await setJSON(store, DEMO_FLAG, { at: new Date().toISOString() });
}

// ---------- الطلب ----------
// ---------- جدول المناقشات المشترك ----------
// جدول واحد لكل الحسابات (state/_shared): كل واحد يضيف ويعدّل ويحذف، والتعديلات تُدمج بدل أن يمسح أحدها الآخر.
// في المتصفح يبقى المفتاح باسم الحساب (qu_grid_<u>)، والخادم يحوّله للجدول المشترك.
const SHARED_KEY = /^qu_(gridv|grid|sharedv)_/;
const sharedName = k => { const m = String(k).match(SHARED_KEY); return m ? m[1] : null; };
const WCOL = GCOLS.indexOf('الكاتب');
const emptyRow = r => !Array.isArray(r) || r.every((v, i) => i === WCOL || !String(v || '').trim());
const rowKey = r => { const st = String(r[GCOLS.indexOf('الطالب')] || '').trim(), d = normDate(r[GCOLS.indexOf('التاريخ')]); return st && d ? keyOf(st, d) : ''; };
const parseGrid = s => { try { const g = JSON.parse(s || '[]'); return Array.isArray(g) ? g.filter(Array.isArray) : []; } catch (e) { return []; } };

// أول مرة: الجدول المشترك = كل أسطر جداول الحسابات (بلا تكرار)، وتُحذف نسخ OBS القديمة لكل حساب/جهاز
async function sharedDoc(store) {
  let doc = await getJSON(store, 'state/_shared');
  if (doc) return doc;
  const seen = new Set(), grid = []; let sharedv = '';
  const { blobs } = await store.list({ prefix: 'state/' });
  for (const b of blobs) {
    if (b.key === 'state/_shared') continue;
    const st = await getJSON(store, b.key, {});
    for (const [k, v] of Object.entries(st || {})) {
      const n = sharedName(k);
      if (n === 'grid') for (const r of parseGrid(v)) { const j = JSON.stringify(r); if (!emptyRow(r) && !seen.has(j)) { seen.add(j); grid.push(r); } }
      if (n === 'sharedv' && String(v) > sharedv) sharedv = String(v);
    }
  }
  doc = { ver: 1, grid: JSON.stringify(grid), gridv: '5', sharedv };
  await setJSON(store, 'state/_shared', doc);
  await writeSharedRows(store, grid);
  const old = await store.list({ prefix: 'rows/' });
  for (const b of old.blobs) if (!b.key.startsWith('rows/_shared/')) await store.delete(b.key);
  return doc;
}
// ملف OBS: من الجدول المشترك نفسه (لا من نسخة كل جهاز، حتى لا يرجع سطر محذوف)
async function writeSharedRows(store, grid) {
  await setJSON(store, 'rows/_shared/grid', grid.filter(r => !emptyRow(r)).map(r => Object.fromEntries(GCOLS.map((c, i) => [c, r[i] || '']))));
}
// دمج ثلاثي بالأسطر: ما حذفه/عدّله صاحب الحفظ منذ آخر نسخة رآها يُطبَّق على أحدث نسخة، وما أضافه غيره يبقى
function mergeGrid(base, mine, theirs) {
  // ما عدّل أحد غيره منذ آخر نسخة رآها: جدوله هو الجديد كما هو (بترتيبه وسطر الإضافة الفاضي أوله)
  if (JSON.stringify(theirs.filter(r => !emptyRow(r))) === JSON.stringify(base.filter(r => !emptyRow(r)))) return mine;
  const count = a => { const m = new Map(); for (const r of a) { const k = JSON.stringify(r); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const nb = count(base.filter(r => !emptyRow(r))), nm = count(mine.filter(r => !emptyRow(r)));
  const drop = new Map(); for (const [k, n] of nb) { const d = n - (nm.get(k) || 0); if (d > 0) drop.set(k, d); }
  const out = [];
  for (const r of theirs) { if (emptyRow(r)) continue; const k = JSON.stringify(r), d = drop.get(k) || 0; if (d > 0) { drop.set(k, d - 1); continue; } out.push(r); }
  const have = count(out);
  const added = [];
  for (const [k, n] of nm) { const add = n - (nb.get(k) || 0) - Math.max(0, (have.get(k) || 0) - (nb.get(k) || 0)); for (let i = 0; i < add; i++) added.push(JSON.parse(k)); }
  // نفس المناقشة (الطالب + التاريخ) عدّلها اثنان بنفس اللحظة: يبقى سطر واحد — تعديل صاحب هذا الحفظ (الأحدث)
  // نفس السطر عدّله اثنان: دمج خانة بخانة — الخانة اللي غيّرها صاحب هذا الحفظ تؤخذ منه، والباقي من نسخة زميله
  { const baseBy = new Map(base.filter(r => !emptyRow(r)).map(r => [rowKey(r), r]).filter(([k]) => k));
    const theirsBy = new Map(out.filter(r => !nb.has(JSON.stringify(r))).map(r => [rowKey(r), r]).filter(([k]) => k));
    for (let i = 0; i < added.length; i++) {
      const k = rowKey(added[i]), b = baseBy.get(k), t = theirsBy.get(k);
      if (!k || !b || !t) continue;
      added[i] = added[i].map((v, j) => (String(v ?? '') !== String(b[j] ?? '') ? v : (t[j] ?? '')));
    } }
  const mineKeys = new Set(added.map(rowKey).filter(Boolean));
  const out2 = out.filter(r => { const k = rowKey(r); return !k || !mineKeys.has(k) || nb.has(JSON.stringify(r)); });
  const lead = []; for (const r of mine) { if (emptyRow(r)) lead.push(r); else break; }
  return lead.concat(out2, added, mine.slice(lead.length).filter(emptyRow));   // صفوف المحرّر الفارغة تبقى عنده (سطر الإضافة أول الجدول)
}

// تنظيف قبل الاستخدام الرسمي (مرة واحدة): يحذف المناقشات والندوات التجريبية، مع نسخة كاملة منها في trash/
const CLEAN_FLAG = 'cleanup-official-2026-11-14';
const TEST_STUDENTS = new Set(['عبدالرحمن بن سليمان الحربي', 'نورة بنت عبدالله القحطاني', 'محمد بن إبراهيم الرشيدي', 'ريم بنت خالد العنزي']);
const isTestRow = r => { const st = String(r[GCOLS.indexOf('الطالب')] || '').trim(); return TEST_STUDENTS.has(st) || /^اختبار/.test(st); };
async function cleanupOnce(store, origin) {
  if (await getJSON(store, CLEAN_FLAG)) return;
  const sh = await sharedDoc(store), g = parseGrid(sh.grid);
  const removed = g.filter(r => !emptyRow(r) && isTestRow(r)), keep = g.filter(r => !isTestRow(r));
  // صفوف ملف الحجز الثابت التجريبية («اختبار مناقشات») حتى لو ما كانت في الجدول
  const base = (await staticFile(origin, '/assets/data/defenses.json')) || { rows: [] };
  const gone = new Set(sh.gone || []);
  removed.forEach(r => { const k = rowKey(r); if (k) gone.add(k); });
  (base.rows || []).filter(r => TEST_STUDENTS.has(String(r['الطالب'] || '').trim()) || /^اختبار/.test(String(r['الطالب'] || '').trim()))
    .forEach(r => gone.add(keyOf(r['الطالب'], r['التاريخ'])));
  const sems = [];
  const { blobs } = await store.list({ prefix: 'sem/' });
  for (const b of blobs) { const x = await getJSON(store, b.key); if (x && /^(test|demo)-/.test(String(x.id || ''))) { sems.push(x); await store.delete(b.key); } }
  await setJSON(store, 'trash/' + CLEAN_FLAG, { at: new Date().toISOString(), rows: removed, seminars: sems, goneAdded: [...gone].filter(k => !(sh.gone || []).includes(k)) });
  if (removed.length || gone.size !== (sh.gone || []).length) {
    sh.grid = JSON.stringify(keep); sh.gone = [...gone].slice(-3000); sh.ver = (sh.ver || 0) + 1; sh.by = 'تنظيف التجارب'; sh.at = Date.now();
    await setJSON(store, 'state/_shared', sh); await writeSharedRows(store, keep);
  }
  await setJSON(store, CLEAN_FLAG, { at: new Date().toISOString(), rows: removed.length, seminars: sems.length });
}

// ---------- الحماية: نسخ احتياطية + سجل التعديلات + محذوفات مشتركة ----------
// backup/day/<YYYY-MM-DD>  أول حفظ في اليوم (قبل التغيير) — آخر 30 يوم
// backup/op/<ms>           قبل أي حذف كبير (5 أسطر فأكثر) أو استرجاع — آخر 30 عملية
// audit                    آخر 3000 تعديل: {at, by, t: add|del|edit|restore, k, st, d, row?, ch?}
const KEEP_BACKUPS = 30, AUDIT_MAX = 3000, TRASH_DAYS = 30;
const riyadhDay = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
async function allSeminars(store) {
  const { blobs } = await store.list({ prefix: 'sem/' }); const out = [];
  for (const b of blobs) { const x = await getJSON(store, b.key); if (x && x.id) out.push(x); }
  return out;
}
async function backupNow(store, kind, by, sh, note) {
  const key = kind === 'day' ? 'backup/day/' + riyadhDay() : 'backup/op/' + Date.now();
  if (kind === 'day' && (await getJSON(store, 'backup-last-day')) === riyadhDay()) return null;   // علامة صغيرة بدل قراءة النسخة كاملة كل حفظ
  const g = parseGrid(sh.grid);
  await setJSON(store, key, { key, kind, at: new Date().toISOString(), by: by || '', note: note || '', rows: g.filter(r => !emptyRow(r)).length,
    grid: sh.grid || '[]', gone: sh.gone || [], seminars: await allSeminars(store) });
  const { blobs } = await store.list({ prefix: 'backup/' + kind + '/' });
  const keys = blobs.map(b => b.key).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_BACKUPS))) await store.delete(k);
  if (kind === 'day') await setJSON(store, 'backup-last-day', riyadhDay());
  return key;
}
const COL_ST = GCOLS.indexOf('الطالب'), COL_D = GCOLS.indexOf('التاريخ');
const cellsOf = r => Object.fromEntries(GCOLS.map((c, i) => [c, String(r[i] || '')]).filter(([c, v]) => v && c !== 'الكاتب'));
// الفرق بين جدولين: إضافة / حذف / تعديل (تغيّر التاريخ أو الاسم = تعديل إذا تطابق الطرف الآخر)
function diffGrids(oldG, newG) {
  const idx = g => { const m = new Map(); g.forEach(r => { if (emptyRow(r)) return; const k = rowKey(r) || ('?' + String(r[COL_ST] || '').trim()); if (k !== '?') m.set(k, r); }); return m; };
  const A = idx(oldG), B = idx(newG), out = [];
  const dels = [...A].filter(([k]) => !B.has(k)), adds = [...B].filter(([k]) => !A.has(k));
  const pair = (r1, r2) => { const ch = {}; GCOLS.forEach((c, i) => { if (c !== 'الكاتب' && String(r1[i] || '') !== String(r2[i] || '')) ch[c] = [String(r1[i] || ''), String(r2[i] || '')]; }); return ch; };
  for (const [k, r] of B) if (A.has(k)) { const ch = pair(A.get(k), r); if (Object.keys(ch).length) out.push({ t: 'edit', k, st: String(r[COL_ST] || '').trim(), d: String(r[COL_D] || ''), ch }); }
  const usedDel = new Set();
  for (const [k, r] of adds) {
    const st = String(r[COL_ST] || '').trim();
    const m = dels.find(([dk, dr]) => !usedDel.has(dk) && (String(dr[COL_ST] || '').trim() === st || (String(dr[COL_D] || '') && String(dr[COL_D]) === String(r[COL_D] || '') && pair(dr, r) && Object.keys(pair(dr, r)).length <= 2)));
    if (m) { usedDel.add(m[0]); out.push({ t: 'edit', k, st, d: String(r[COL_D] || ''), ch: pair(m[1], r) }); }
    else out.push({ t: 'add', k, st, d: String(r[COL_D] || '') });             // السطر كامل يُحفظ للمحذوف فقط (للاسترجاع)
  }
  for (const [k, r] of dels) if (!usedDel.has(k)) out.push({ t: 'del', k, st: String(r[COL_ST] || '').trim(), d: String(r[COL_D] || ''), row: r });
  return out;
}
async function auditAdd(store, by, entries) {
  if (!entries.length) return;
  const log = await getJSON(store, 'audit', []), now = Date.now();
  for (const e of entries) {
    const last = log[log.length - 1];
    // كتابة متتالية لنفس المناقشة من نفس الشخص خلال دقيقتين = تعديل واحد
    if (e.t === 'edit' && last && last.t === 'edit' && last.by === by && last.k === e.k && now - last.ms < 120000) {
      for (const [c, [o, n]] of Object.entries(e.ch)) last.ch[c] = [last.ch[c] ? last.ch[c][0] : o, n];
      for (const c of Object.keys(last.ch)) if (last.ch[c][0] === last.ch[c][1]) delete last.ch[c];
      last.ms = now; last.at = new Date(now).toISOString(); continue;
    }
    log.push({ ...e, by, ms: now, at: new Date(now).toISOString() });
  }
  await setJSON(store, 'audit', log.slice(-AUDIT_MAX));
}

// مرة وحدة (2026-11-15): حذف تجارب «مشاركة صور الإعلانات» بعد ما تأكد المستخدم إنها تشتغل —
// 5 مناقشات «مناقشة تجربة N» في «قاعة التجربة» و5 ندوات trial-sem-N. نسخة منها في trash/<UNTRIAL_FLAG>، ومفاتيحها في gone حتى ما ترجع.
// (الندوات الحقيقية الثلاث اللي رجعت معها تبقى.)
const UNTRIAL_FLAG = 'trial-week-removed-2026-11-15';
const isTrialRow = r => /^مناقشة تجربة \d+$/.test(String(r[GCOLS.indexOf('الطالب')] || '').trim()) && String(r[GCOLS.indexOf('المكان')] || '').trim() === 'قاعة التجربة';
async function removeTrialsOnce(store) {
  if (await getJSON(store, UNTRIAL_FLAG)) return;
  const sh = await sharedDoc(store), g = parseGrid(sh.grid);
  const removed = g.filter(isTrialRow), keep = g.filter(r => !isTrialRow(r));
  const sems = [];
  for (let k = 1; k <= 5; k++) { const key = semKey(`trial-sem-${k}`), x = await getJSON(store, key); if (x) { sems.push(x); await store.delete(key); } }
  await setJSON(store, 'trash/' + UNTRIAL_FLAG, { at: new Date().toISOString(), rows: removed, seminars: sems });
  if (removed.length) {
    const gone = new Set(sh.gone || []); removed.forEach(r => { const k = rowKey(r); if (k) gone.add(k); });
    sh.grid = JSON.stringify(keep); sh.gone = [...gone].slice(-3000); sh.ver = (sh.ver || 0) + 1; sh.by = 'حذف تجارب المشاركة'; sh.at = Date.now();
    await setJSON(store, 'state/_shared', sh); await writeSharedRows(store, keep);
  }
  await setJSON(store, UNTRIAL_FLAG, { at: new Date().toISOString(), rows: removed.length, seminars: sems.length });
}

// مرة وحدة (2026-11-15): تعبئة التجارب ببيانات كاملة (روابط البث والتسجيل واللجنة، 3–4 أعضاء، طالب/طالبة، منسق، ملاحظات؛
// والندوات: افتتاح وجلسة بمديرها و3 أوراق ومداخلات وختام، وروابط البث والتسجيل) حتى تُجرَّب الدعوات والباركودات كلها.
// المكان يبقى «قاعة التجربة» (لا تظهر في بث القاعة)، والحذف لاحقاً بـ removeTrialsOnce.
const FILL_FLAG = 'trial-week-filled-2026-11-15';
const T_LIVE = 'https://www.youtube.com/@src.sds1', T_REC = 'https://www.youtube.com/@src.sds1/videos', T_ZOOM = 'https://zoom.us/j/1234567890';
async function fillTrialsOnce(store) {
  if (await getJSON(store, FILL_FLAG)) return;
  const C = n => GCOLS.indexOf(n);
  const people = [['د. عبدالله بن محمد التجريبي', 'الأستاذ في قسم الفقه'], ['د. صالح بن أحمد التجريبي', 'الأستاذ المشارك في قسم أصول الفقه'],
    ['د. خالد بن سعد التجريبي', 'الأستاذ المساعد في قسم الفقه'], ['أ.د. محمد بن علي التجريبي', 'الأستاذ في جامعة الإمام محمد بن سعود الإسلامية']];
  const titles = ['أحكام المعاملات المالية المعاصرة في ضوء القواعد الفقهية | دراسة تأصيلية تطبيقية', 'القواعد الأصولية عند ابن تيمية وأثرها في الفروع الفقهية | جمعاً ودراسة',
    'أحكام النوازل الطبية في الفقه الإسلامي | دراسة مقارنة', 'الاستدلال بالمصلحة المرسلة عند الأصوليين | دراسة نظرية تطبيقية', 'فقه الأسرة في المذاهب الأربعة | دراسة مقارنة بالأنظمة السعودية'];
  const sh = await sharedDoc(store), g = parseGrid(sh.grid); let n = 0;
  for (const r of g) {
    const m = /^مناقشة تجربة (\d+)$/.exec(String(r[C('الطالب')] || '').trim());
    if (!m || String(r[C('المكان')] || '').trim() !== 'قاعة التجربة') continue;
    const k = +m[1] - 1; n++;
    r[C('الجنس')] = k % 2 ? 'أنثى' : 'ذكر'; r[C('العنوان')] = titles[k % 5];
    r[C('ملاحظة المكان')] = '(والبث عبر الإنترنت)'; r[C('رابط البث')] = T_LIVE; r[C('رابط اللجنة')] = T_ZOOM; r[C('رابط التسجيل')] = T_REC;
    r[C('الملاحظات')] = 'تجربة لاختبار الدعوات والباركود — تُحذف'; r[C('منسق الحجز')] = 'منسق تجريبي';
    const roles = ['مشرفاً ومقرراً', 'مناقشاً', 'مناقشاً', 'مناقشاً'], cnt = k === 4 ? 4 : 3;
    for (let i = 1; i <= 5; i++) { const b = C(`عضو${i} الاسم`); r[b] = i <= cnt ? people[i - 1][0] : ''; r[b + 1] = i <= cnt ? people[i - 1][1] : ''; r[b + 2] = i <= cnt ? roles[i - 1] : ''; }
  }
  if (n) { sh.grid = JSON.stringify(g); sh.ver = (sh.ver || 0) + 1; sh.by = 'تعبئة التجارب'; sh.at = Date.now(); await setJSON(store, 'state/_shared', sh); await writeSharedRows(store, g); }
  const semTitles = ['المستجدات الفقهية في المعاملات المصرفية', 'مقاصد الشريعة وأثرها في الفتوى المعاصرة', 'القضاء الشرعي بين الأصالة والتجديد', 'التراث الأصولي وقراءاته المعاصرة', 'الأسرة المسلمة وتحديات العصر'];
  let ns = 0;
  for (let k = 0; k < 5; k++) {
    const key = semKey(`trial-sem-${k + 1}`), x = await getJSON(store, key); if (!x) continue; ns++;
    Object.assign(x, { title: `ندوة تجربة ${k + 1}: ${semTitles[k]}`, subtitle: 'ندوة علمية (تجربة — تُحذف)', series: k % 2 ? 'ملتقى' : 'ندوة', department: 'قسم الفقه',
      place_note: '(والبث عبر الإنترنت)', link: T_LIVE, recording_link: T_REC, public_note: 'الدعوة عامة للجميع', notes: 'تجربة — تُحذف', start: '09:00', end: '12:00',
      participants: [
        { kind: 'opening', topic: 'افتتاح الندوة', name: people[0][0], title: 'عميد كلية الشريعة', start: '09:00', end: '09:15' },
        { kind: 'session', name: 'الجلسة الأولى', moderator: people[3][0], moderator_title: people[3][1] },
        { kind: 'paper', topic: 'الورقة الأولى: التأصيل الشرعي', name: people[1][0], title: people[1][1], start: '09:15', end: '09:45' },
        { kind: 'paper', topic: 'الورقة الثانية: التطبيقات المعاصرة', name: people[2][0], title: people[2][1], start: '09:45', end: '10:15' },
        { kind: 'paper', topic: 'الورقة الثالثة: الرؤية المستقبلية', name: 'د. نورة بنت عبدالرحمن التجريبية', title: 'الأستاذ المشارك في قسم الفقه', start: '10:15', end: '10:45' },
        { kind: 'discussion', topic: 'المداخلات والتعقيبات', start: '10:45', end: '11:30' },
        { kind: 'closing', topic: 'الختام والتوصيات', start: '11:30', end: '12:00' }],
      updated: new Date().toISOString() });
    await setJSON(store, key, x);
  }
  await setJSON(store, FILL_FLAG, { at: new Date().toISOString(), rows: n, seminars: ns });
}

// مرة وحدة (2026-11-15، الطلب الثاني): بيانات تجربة كاملة للأسبوع القادم (الأحد 22 ← الخميس 26 نوفمبر = 1448/6/12–16)
// لتجربة «📋 إرسال … الأسبوعية للتدقيق» و«مشاركة صور الإعلانات» والدعوات والباركود. ما تظهر في بث القاعة (المكان ما فيه «عثيمين»).
// تُعرف: الطالب يبدأ بـ «تجربة » والملاحظات فيها TRIAL2_TAG، والندوات trial2-sem-N. الحذف بـ removeTrials2Once (ما يشتغل لين يطلبه المستخدم).
const TRIAL2_FLAG = 'trial2-review-2026-11-15', TRIAL2_TAG = 'تجربة — تُحذف';
const T2_LIVE = 'https://www.youtube.com/@src.sds1', T2_REC = 'https://www.youtube.com/@src.sds1/videos', T2_ZOOM = 'https://zoom.us/j/1234567890';
async function addTrials2Once(store) {
  if (await getJSON(store, TRIAL2_FLAG)) return;
  const C = n => GCOLS.indexOf(n);
  const P = [['د. عبدالله بن محمد التجريبي', 'الأستاذ في قسم القرآن وعلومه'], ['د. صالح بن أحمد التجريبي', 'الأستاذ المشارك في قسم القرآن وعلومه'],
    ['د. خالد بن سعد التجريبي', 'الأستاذ المساعد في قسم العقيدة'], ['أ.د. محمد بن علي التجريبي', 'الأستاذ في جامعة الإمام محمد بن سعود الإسلامية']];
  // [الطالب، الجنس، الدرجة، اليوم، التاريخ، الوقت، المكان، العنوان، عدد الأعضاء]
  const D = [
    ['تجربة سلمان بن عبدالعزيز التويجري', 'ذكر', 'الماجستير في القرآن وعلومه', 'الأحد', '1448/6/12 هـ', '9:30 صباحاً', 'قاعة التجربة', 'جهود المفسرين في توجيه القراءات | دراسة تحليلية', 3],
    ['تجربة فهد بن ناصر الحربي', 'ذكر', 'الدكتوراه في الفقه', 'الاثنين', '1448/6/13 هـ', '10 صباحاً', 'قاعة التجربة', 'أحكام العقود الإلكترونية في الفقه الإسلامي | دراسة مقارنة', 4],
    ['تجربة بداح بن محمد المطيري', 'ذكر', 'الماجستير في القرآن وعلومه', 'الثلاثاء', '1448/6/14 هـ', '9 صباحاً', 'قاعة التجربة', 'المناسبات بين السور في جزء عمّ | جمعاً ودراسة', 3],
    ['تجربة سمير بن علي زعراوي', 'ذكر', 'الماجستير في العقيدة والمذاهب المعاصرة', 'الأربعاء', '1448/6/15 هـ', '12:30 ظهراً', 'عن بعد', 'مسائل الإيمان عند المتكلمين | دراسة نقدية', 3],
    ['تجربة نورة بنت عبدالرحمن السالم', 'أنثى', 'الدكتوراه في أصول الفقه', 'الخميس', '1448/6/16 هـ', '8:30 صباحاً', 'قاعة التجربة', 'القواعد الأصولية وأثرها في النوازل المعاصرة | دراسة تطبيقية', 3],
  ];
  const rows = D.map(([st, g, deg, day, date, time, place, title, cnt]) => { const r = GCOLS.map(() => '');
    r[C('الدرجة')] = deg; r[C('الجنس')] = g; r[C('الطالب')] = st; r[C('العنوان')] = title; r[C('اليوم')] = day; r[C('التاريخ')] = date; r[C('الوقت')] = time;
    r[C('المكان')] = place; r[C('ملاحظة المكان')] = place === 'عن بعد' ? '(عبر زوم)' : '(والبث عبر الإنترنت)';
    r[C('رابط البث')] = place === 'عن بعد' ? T2_ZOOM : T2_LIVE; r[C('رابط اللجنة')] = T2_ZOOM; r[C('رابط التسجيل')] = T2_REC;
    r[C('الملاحظات')] = TRIAL2_TAG; r[C('منسق الحجز')] = 'منسق تجريبي'; r[C('الكاتب')] = 'admin';
    const roles = ['مشرفاً ومقرراً', 'مناقشاً', 'مناقشاً', 'مناقشاً'];
    for (let i = 1; i <= cnt; i++) { const b = C(`عضو${i} الاسم`); r[b] = P[i - 1][0]; r[b + 1] = P[i - 1][1]; r[b + 2] = roles[i - 1]; }
    return r; });
  const sh = await sharedDoc(store), g = parseGrid(sh.grid);
  const have = new Set(g.map(r => String(r[C('الطالب')] || '')));
  const add = rows.filter(r => !have.has(r[C('الطالب')]));
  if (add.length) {
    const ng = g.concat(add); sh.grid = JSON.stringify(ng); sh.ver = (sh.ver || 0) + 1; sh.by = 'بيانات تجربة'; sh.at = Date.now();
    const keys = new Set(add.map(rowKey)); sh.gone = (sh.gone || []).filter(k => !keys.has(k));
    await setJSON(store, 'state/_shared', sh); await writeSharedRows(store, ng);
  }
  const S = [['trial2-sem-1', 'تجربة: المستجدات الفقهية في المعاملات المصرفية', 'ندوة', 'قسم الفقه', '2026-11-23', '10:00', '12:00', 'قاعة التجربة'],
             ['trial2-sem-2', 'تجربة: مقاصد الشريعة وأثرها في الفتوى المعاصرة', 'ملتقى', 'قسم أصول الفقه', '2026-11-25', '09:00', '12:00', 'قاعة التجربة'],
             ['trial2-sem-3', 'تجربة: القضاء الشرعي بين الأصالة والتجديد', 'ندوة', 'قسم الأنظمة', '2026-11-26', '18:00', '20:00', 'عن بعد']];
  for (const [id, title, series, dept, date, start, end, place] of S) {
    if (await getJSON(store, semKey(id))) continue;
    await setJSON(store, semKey(id), { id, title, subtitle: '', organizer: 'كلية الشريعة', department: dept, series, date, start, end, place,
      place_note: place === 'عن بعد' ? '(عبر زوم)' : '(والبث عبر الإنترنت)', link: place === 'عن بعد' ? T2_ZOOM : T2_LIVE, recording_link: T2_REC,
      status: 'confirmed', notes: TRIAL2_TAG, public_note: 'الدعوة عامة للجميع', poster_header: 'simple', programme_layout: 'cells',
      participants: [
        { kind: 'opening', topic: 'افتتاح الندوة', name: P[0][0], title: 'عميد كلية الشريعة', start, end: '' },
        { kind: 'session', name: 'الجلسة الأولى', moderator: P[3][0], moderator_title: P[3][1] },
        { kind: 'paper', topic: 'الورقة الأولى: التأصيل الشرعي', name: P[1][0], title: P[1][1], start: '', end: '' },
        { kind: 'paper', topic: 'الورقة الثانية: التطبيقات المعاصرة', name: P[2][0], title: P[2][1], start: '', end: '' },
        { kind: 'discussion', topic: 'المداخلات والتعقيبات', start: '', end: '' }],
      by: 'admin', updated: new Date().toISOString() });
  }
  await setJSON(store, TRIAL2_FLAG, { at: new Date().toISOString(), rows: add.length });
}
// حذف بيانات التجربة الثانية — يُفعَّل لما يقول المستخدم «احذفها»
const UNTRIAL2_FLAG = 'trial2-removed';
const isTrial2Row = r => /^تجربة /.test(String(r[GCOLS.indexOf('الطالب')] || '').trim()) && String(r[GCOLS.indexOf('الملاحظات')] || '').includes(TRIAL2_TAG);
async function removeTrials2Once(store) {
  if (await getJSON(store, UNTRIAL2_FLAG)) return;
  const sh = await sharedDoc(store), g = parseGrid(sh.grid);
  const removed = g.filter(isTrial2Row), keep = g.filter(r => !isTrial2Row(r)), sems = [];
  for (let k = 1; k <= 3; k++) { const key = semKey(`trial2-sem-${k}`), x = await getJSON(store, key); if (x) { sems.push(x); await store.delete(key); } }
  await setJSON(store, 'trash/' + UNTRIAL2_FLAG, { at: new Date().toISOString(), rows: removed, seminars: sems });
  if (removed.length) {
    const gone = new Set(sh.gone || []); removed.forEach(r => { const k = rowKey(r); if (k) gone.add(k); });
    sh.grid = JSON.stringify(keep); sh.gone = [...gone].slice(-3000); sh.ver = (sh.ver || 0) + 1; sh.by = 'حذف بيانات التجربة'; sh.at = Date.now();
    await setJSON(store, 'state/_shared', sh); await writeSharedRows(store, keep);
  }
  await setJSON(store, UNTRIAL2_FLAG, { at: new Date().toISOString(), rows: removed.length, seminars: sems.length });
}

export async function handle(req, store) {
  const url = new URL(req.url);
  const origin = url.origin;
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...PUBLIC, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': '*' } });
  const body = async () => { try { return await req.json(); } catch (e) { return {}; } };
  await ensureDemo(store, origin);
  await cleanupOnce(store, origin);
  await removeTrialsOnce(store);   // 2026-11-15: المستخدم أكد إن المشاركة اشتغلت — تنحذف التجارب (مرة وحدة، مع نسخة في trash/)
  await addTrials2Once(store);
  // await removeTrials2Once(store);   // يُفعَّل لما يقول المستخدم «احذفها»

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
    return json({ token, session: { u: user.u, name: user.name, role: user.role, t: Date.now(), weak: (lower(user.u) === 'admin' && p === 'admin123') || p === user.u } });
  }

  const me = await auth(store, req);
  if (!me) return err('سجّل الدخول من جديد', 401);
  const U = lower(me.u);

  if (method === 'POST' && path === 'logout') { await store.delete('sess/' + me.token); return json({ ok: true }); }
  if (method === 'GET' && path === 'me') return json({ u: me.u, name: me.name, role: roleNow(await users(store, origin), me.u) || me.role });
  // أعضاء هيئة التدريس لاقتراح الأسماء أثناء الكتابة (للمسجلين فقط؛ اسم ورتبة وقسم بلا بريد ولا جوال)
  if (method === 'GET' && path === 'people') return json({ people: PEOPLE });

  // سجل التعديلات: لمناقشة (?st=اسم الطالب) أو آخر التعديلات — لكل من سجّل دخوله
  if (method === 'GET' && path === 'audit') {
    const st = String(new URL(req.url).searchParams.get('st') || '').trim().replace(/\s+/g, ' ');
    const log = await getJSON(store, 'audit', []);
    const list = st ? log.filter(e => String(e.st || '').replace(/\s+/g, ' ') === st) : log;
    return json({ entries: list.slice(-300).reverse().map(({ row, sem, ...e }) => e) });
  }
  // المحذوفات المشتركة: ما حذفه أي موظف خلال 30 يوم ولم يرجع للجدول
  if (method === 'GET' && path === 'trash') {
    const sh = await sharedDoc(store), now = new Set(parseGrid(sh.grid).map(r => rowKey(r)).filter(Boolean));
    const nowSem = new Set((await allSeminars(store)).map(x => 'sem:' + x.id));
    const log = await getJSON(store, 'audit', []), since = Date.now() - TRASH_DAYS * DAY, seen = new Set();
    const items = log.filter(e => e.t === 'del' && e.ms >= since).reverse()
      .filter(e => !seen.has(e.k) && seen.add(e.k) && !(e.row ? now.has(e.k) : nowSem.has(e.k)))
      .map(e => ({ at: e.at, by: e.by, k: e.k, st: e.st, d: e.d, row: e.row || null, sem: e.sem || null }));
    return json({ items });
  }
  // النسخ الاحتياطية: المدير العام فقط
  if (path === 'backups' || path === 'backups/restore' || path === 'backups/get') {
    if (roleNow(await users(store, origin), me.u) !== 'super') return err('النسخ الاحتياطية للمدير العام فقط', 403);
    if (method === 'GET' && path === 'backups') {
      const out = [];
      for (const kind of ['day', 'op']) { const { blobs } = await store.list({ prefix: 'backup/' + kind + '/' }); for (const b of blobs) { const x = await getJSON(store, b.key); if (x) out.push({ key: x.key, kind: x.kind, at: x.at, by: x.by, note: x.note, rows: x.rows, seminars: (x.seminars || []).length }); } }
      out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return json({ backups: out });
    }
    if (method === 'GET' && path === 'backups/get') {
      const key = String(new URL(req.url).searchParams.get('key') || '');
      if (!key.startsWith('backup/')) return err('نسخة غير صحيحة', 400);
      const x = await getJSON(store, key); return x ? json(x) : err('ما لقيت النسخة', 404);
    }
    if (method === 'POST' && path === 'backups/restore') {
      const { key } = await body();
      if (!String(key || '').startsWith('backup/')) return err('نسخة غير صحيحة', 400);
      const x = await getJSON(store, key); if (!x) return err('ما لقيت النسخة', 404);
      const sh = await sharedDoc(store), byName = me.name || me.u;
      await backupNow(store, 'op', byName, sh, 'قبل الاسترجاع (نسخة الوضع الحالي)');
      const g = parseGrid(x.grid);
      sh.grid = JSON.stringify(g); sh.gone = x.gone || []; sh.ver = (sh.ver || 0) + 1; sh.by = byName + ' (استرجاع نسخة)'; sh.at = Date.now();
      await setJSON(store, 'state/_shared', sh); await writeSharedRows(store, g);
      if (Array.isArray(x.seminars)) {
        const { blobs } = await store.list({ prefix: 'sem/' }); for (const b of blobs) await store.delete(b.key);
        for (const sm of x.seminars) if (sm && sm.id) await setJSON(store, semKey(sm.id), sm);
      }
      await auditAdd(store, byName, [{ t: 'restore', k: key, st: 'استرجاع نسخة ' + (x.at || ''), d: '' }]);
      return json({ ok: true, rows: g.filter(r => !emptyRow(r)).length, seminars: (x.seminars || []).length });
    }
  }

  // --- بيانات الحساب (مفاتيح المتصفح)
  if (path === 'state') {
    const sh = await sharedDoc(store);
    const mapShared = () => Object.fromEntries(['grid', 'gridv', 'sharedv'].filter(n => sh[n] != null && sh[n] !== '').map(n => [`qu_${n}_${U}`, sh[n]]));
    if (method === 'GET') {
      const own = await getJSON(store, 'state/' + U, {});
      for (const k of Object.keys(own)) if (sharedName(k)) delete own[k];
      return json({ data: { ...own, ...mapShared() }, sharedVer: sh.ver, gone: sh.gone || [] });
    }
    if (method === 'POST') {
      const { set = {}, del = [], base = {} } = await body();
      const cur = await getJSON(store, 'state/' + U, {});
      let shChanged = false, merged = null;
      for (const [k, v] of Object.entries(set)) {
        if (typeof k !== 'string' || !k.startsWith('qu_') || typeof v !== 'string') continue;
        const n = sharedName(k);
        if (!n) { cur[k] = v; continue; }
        if (n === 'grid') {
          // بلا نسخة أساس (صفحة قديمة): الحفظ يحل محل الجدول كما كان
          const g = typeof base[k] === 'string' ? mergeGrid(parseGrid(base[k]), parseGrid(v), parseGrid(sh.grid)) : parseGrid(v);
          const s = JSON.stringify(g);
          if (s !== sh.grid) {
            const oldG = parseGrid(sh.grid), changes = diffGrids(oldG, g), byName = me.name || me.u;
            await backupNow(store, 'day', byName, sh);                                       // أول حفظ اليوم: نسخة قبل التغيير
            const removedN = changes.filter(c => c.t === 'del').length;
            if (removedN >= 5) await backupNow(store, 'op', byName, sh, `قبل حذف ${removedN} مناقشة`);
            await auditAdd(store, byName, changes);
            // مناقشة حُذفت أو تغيّر تاريخها: مفتاحها القديم يُسجَّل حتى لا يرجّعه ملف الحجز الثابت في البث
            const now = new Set(g.map(rowKey).filter(Boolean));
            const gone = new Set((sh.gone || []).filter(k => !now.has(k)));
            for (const r of parseGrid(sh.grid)) { const k = rowKey(r); if (k && !now.has(k)) gone.add(k); }
            sh.gone = [...gone].slice(-3000);
            sh.grid = s; shChanged = true; await writeSharedRows(store, g);
          }
          if (s !== v) merged = s;
        } else if (sh[n] !== v) { sh[n] = v; shChanged = true; }
      }
      (Array.isArray(del) ? del : []).forEach(k => { if (!sharedName(k)) delete cur[k]; });
      for (const k of Object.keys(cur)) if (sharedName(k)) delete cur[k];
      await setJSON(store, 'state/' + U, cur);
      if (shChanged) { sh.ver = (sh.ver || 0) + 1; sh.by = me.name || me.u; sh.at = Date.now(); await setJSON(store, 'state/_shared', sh); }
      return json({ ok: true, sharedVer: sh.ver, ...(merged != null ? { merged: { ['qu_grid_' + U]: merged } } : {}) });
    }
  }
  // تحديث الجدول المشترك في الصفحات المفتوحة: يرجع الجدول فقط إذا تغيّر بعد النسخة التي عند الصفحة
  if (path === 'shared' && method === 'GET') {
    const q = new URL(req.url).searchParams, sh = await sharedDoc(store), since = +q.get('since') || 0;
    // «فلان يعدّل هذي المناقشة الحين»: كل صفحة تبلّغ عن المناقشة اللي فيها المؤشر، وتستلم مناقشات زملائها (آخر دقيقة)
    const editing = String(q.get('editing') || '').slice(0, 200), pres = await getJSON(store, 'presence', {}), now = Date.now(), mine = pres[U];
    if (editing !== ((mine && mine.k) || '') || (editing && now - ((mine && mine.at) || 0) > 40000)) {
      if (editing) pres[U] = { k: editing, name: me.name || me.u, at: now }; else delete pres[U];
      for (const [u, v] of Object.entries(pres)) if (now - v.at > 120000) delete pres[u];
      await setJSON(store, 'presence', pres);
    }
    const others = Object.entries(pres).filter(([u, v]) => u !== U && now - v.at < 60000).map(([, v]) => ({ k: v.k, name: v.name }));
    return json(sh.ver === since ? { ver: sh.ver, others } : { ver: sh.ver, key: 'qu_grid_' + U, grid: sh.grid, by: sh.by || '', others });
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
    // الجدول صار مشتركًا: ملف OBS يُكتب من الجدول المشترك عند حفظه (state)، فلا تُحفظ نسخة لكل جهاز
    await sharedDoc(store);
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
    const { upsert = [], remove = [], base = {} } = await body();
    await seminarsDoc(store, origin);                         // يضمن نقل البيانات القديمة أول مرة
    await backupNow(store, 'day', me.name || me.u, await sharedDoc(store));
    const semLog = [];
    for (const id of Array.isArray(remove) ? remove : []) { const old = await getJSON(store, semKey(id)); if (old) semLog.push({ t: 'del', k: 'sem:' + id, st: old.title || 'ندوة', d: old.date || '', sem: old }); }
    for (const s of Array.isArray(upsert) ? upsert : []) if (s && s.id && !(await getJSON(store, semKey(s.id)))) semLog.push({ t: 'add', k: 'sem:' + s.id, st: s.title || 'ندوة', d: s.date || '' });
    await auditAdd(store, me.name || me.u, semLog);
    const SKIP = new Set(['by', 'updated']), same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
    for (const s of Array.isArray(upsert) ? upsert : []) {
      if (!s || !s.id) continue;
      const cur = await getJSON(store, semKey(s.id)), b = base && Object.prototype.hasOwnProperty.call(base, s.id) ? base[s.id] : undefined;
      if (!cur && b) continue;                                   // كانت موجودة لما فتحها، وحذفها زميل بعدها: لا ترجع
      let out = { ...s };
      if (cur && b) {                                            // الحقل اللي غيّره هذا الموظف منه، والباقي من أحدث نسخة (تعديلات الزملاء)
        out = { ...cur };
        for (const k of new Set([...Object.keys(s), ...Object.keys(b)])) if (!SKIP.has(k) && !same(s[k], b[k])) out[k] = s[k];
        out.updated = s.updated || cur.updated;
      }
      await setJSON(store, semKey(s.id), { ...out, id: String(s.id), by: me.u });
    }
    for (const id of Array.isArray(remove) ? remove : []) await store.delete(semKey(id));
    return json(await seminarsDoc(store, origin));
  }

  // --- الموظفون وكلمة المرور
  if (path === 'password' && method === 'POST') {
    const { old, nw } = await body();
    const list = await users(store, origin);
    const user = list.find(x => lower(x.u) === U);
    if (!user || user.h !== hashPassword(user.u, String(old || ''))) return err('كلمة المرور الحالية غير صحيحة', 403);
    if (!nw) return err('اكتب كلمة المرور الجديدة');   // أي كلمة مرور، بلا شروط طول
    user.h = hashPassword(user.u, String(nw));
    await setJSON(store, 'users', list);
    return json({ ok: true });
  }
  if (path === 'users') {
    const list = await users(store, origin);
    if (roleNow(list, me.u) !== 'super') return err('للمدير العام فقط', 403);
    if (method === 'GET') return json({ users: list.map(({ u, name, role }) => ({ u, name, role })) });
    if (method === 'POST') {
      const { u, name, role, password } = await body();
      if (!/^[A-Za-z0-9_.\-]{3,32}$/.test(String(u || ''))) return err('اسم المستخدم يجب أن يكون 3-32 حرفاً إنجليزياً أو أرقاماً');
      const ex = list.find(x => lower(x.u) === lower(u));
      if (!ex && !password) return err('أدخل كلمة مرور للمستخدم الجديد');
      const rec = { u: ex ? ex.u : String(u), name: name || (ex && ex.name) || String(u), role: normRole(role || (ex && ex.role)),
        h: password ? hashPassword(ex ? ex.u : u, String(password)) : ex.h };
      const out = list.filter(x => lower(x.u) !== lower(u)); out.push(rec);
      await setJSON(store, 'users', out);
      return json({ ok: true });
    }
  }
  { const m = path.match(/^users\/([A-Za-z0-9_.\-]{1,32})$/);
    if (m && method === 'DELETE') {
      const list = await users(store, origin);
      if (roleNow(list, me.u) !== 'super') return err('للمدير العام فقط', 403);
      const target = list.find(x => lower(x.u) === lower(m[1]));
      if (target && target.role === 'super' && list.filter(x => x.role === 'super').length <= 1) return err('لا يمكن حذف آخر مدير عام في النظام');
      await setJSON(store, 'users', list.filter(x => lower(x.u) !== lower(m[1])));
      return json({ ok: true });
    } }

  return err('غير موجود', 404);
}
