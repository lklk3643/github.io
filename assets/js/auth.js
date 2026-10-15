/* نظام دخول الموظفين (يعمل بالكامل داخل المتصفح – مناسب لـ GitHub Pages)
 * - المستخدمون الأساسيون يُقرأون من users.json (إن وُجد) ثم تُدمج معهم تعديلات المدير المحفوظة محلياً.
 * - كلمات المرور تُحفظ مشفّرة SHA-256 (مع اسم المستخدم كملح) ولا تُحفظ نصاً صريحاً.
 */
(function () {
  'use strict';

  // ---------- SHA-256 (بدون الاعتماد على crypto.subtle حتى يعمل من file://) ----------
  const K = new Uint32Array(64), H0 = new Uint32Array(8);
  (function initConsts() {
    const primes = [];
    for (let n = 2; primes.length < 64; n++) {
      if (primes.every(p => n % p)) primes.push(n);
    }
    for (let i = 0; i < 64; i++) K[i] = ((Math.cbrt(primes[i]) % 1) * 4294967296) >>> 0;
    for (let i = 0; i < 8; i++) H0[i] = ((Math.sqrt(primes[i]) % 1) * 4294967296) >>> 0;
  })();

  function sha256(str) {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 4, (len * 8) >>> 0);
    dv.setUint32(total - 8, Math.floor((len * 8) / 4294967296));
    const h = Uint32Array.from(H0);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < total; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
  }

  const hashPassword = (username, password) => sha256(String(username).trim().toLowerCase() + ':' + password);

  // ---------- المستخدمون ----------
  const LOCAL_KEY = 'qu_users_local';
  const SESSION_KEY = 'qu_session';
  // المستخدم الافتراضي: admin / admin123  (غيّر كلمة المرور بعد أول دخول)
  const BUILTIN = [{ u: 'admin', name: 'مدير النظام', role: 'admin', h: hashPassword('admin', 'admin123') }];

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { users: [], deleted: [] }; }
    catch (e) { return { users: [], deleted: [] }; }
  }
  function writeLocal(data) { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); }

  async function loadFileUsers() {
    try {
      const r = await fetch('users.json', { cache: 'no-store' });
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list) && list.length) return list;
      }
    } catch (e) { /* يعمل بدون الملف */ }
    return BUILTIN;
  }

  async function getUsers() {
    const base = await loadFileUsers();
    const local = readLocal();
    const map = new Map();
    base.forEach(u => map.set(u.u.toLowerCase(), { ...u, source: 'file' }));
    local.users.forEach(u => map.set(u.u.toLowerCase(), { ...u, source: 'local' }));
    (local.deleted || []).forEach(n => map.delete(n.toLowerCase()));
    return [...map.values()];
  }

  async function saveUser(user) {
    const local = readLocal();
    const key = user.u.toLowerCase();
    local.users = local.users.filter(x => x.u.toLowerCase() !== key);
    local.users.push({ u: user.u, name: user.name, role: user.role, h: user.h });
    local.deleted = (local.deleted || []).filter(n => n.toLowerCase() !== key);
    writeLocal(local);
  }

  async function addOrUpdateUser({ u, name, role, password }) {
    u = String(u || '').trim();
    if (!/^[A-Za-z0-9_.\-]{3,32}$/.test(u)) throw new Error('اسم المستخدم يجب أن يكون 3-32 حرفاً إنجليزياً أو أرقاماً');
    const users = await getUsers();
    const existing = users.find(x => x.u.toLowerCase() === u.toLowerCase());
    if (!existing && !password) throw new Error('أدخل كلمة مرور للمستخدم الجديد');
    if (password && password.length < 6) throw new Error('كلمة المرور يجب ألا تقل عن 6 خانات');
    await saveUser({
      u: existing ? existing.u : u,
      name: name || (existing && existing.name) || u,
      role: role || (existing && existing.role) || 'employee',
      h: password ? hashPassword(u, password) : existing.h
    });
  }

  async function deleteUser(u) {
    const users = await getUsers();
    const admins = users.filter(x => x.role === 'admin');
    const target = users.find(x => x.u.toLowerCase() === u.toLowerCase());
    if (target && target.role === 'admin' && admins.length <= 1) throw new Error('لا يمكن حذف آخر مدير في النظام');
    const local = readLocal();
    local.users = local.users.filter(x => x.u.toLowerCase() !== u.toLowerCase());
    local.deleted = [...new Set([...(local.deleted || []), u.toLowerCase()])];
    writeLocal(local);
  }

  async function login(u, password, remember) {
    const users = await getUsers();
    const user = users.find(x => x.u.toLowerCase() === String(u).trim().toLowerCase());
    if (!user || user.h !== hashPassword(user.u, password)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    const session = { u: user.u, name: user.name, role: user.role, t: Date.now(),
      weak: user.u === 'admin' && password === 'admin123' };
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function current() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY));
    } catch (e) { return null; }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (window.QAuthNoSession) location.reload(); else location.href = 'index.html';
  }

  function requireLogin() {
    const s = current();
    if (!s) {
      if (window.QAuthNoSession) window.QAuthNoSession(); else location.replace('index.html');
      return null;
    }
    return s;
  }

  async function changePassword(u, oldPass, newPass) {
    const users = await getUsers();
    const user = users.find(x => x.u.toLowerCase() === u.toLowerCase());
    if (!user || user.h !== hashPassword(user.u, oldPass)) throw new Error('كلمة المرور الحالية غير صحيحة');
    if (!newPass || newPass.length < 6) throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 6 خانات');
    await saveUser({ ...user, h: hashPassword(user.u, newPass) });
    const s = current();
    if (s) {
      s.weak = false;
      const store = sessionStorage.getItem(SESSION_KEY) ? sessionStorage : localStorage;
      store.setItem(SESSION_KEY, JSON.stringify(s));
    }
  }

  async function exportUsersJson() {
    const users = await getUsers();
    return JSON.stringify(users.map(({ u, name, role, h }) => ({ u, name, role, h })), null, 2);
  }

  async function importUsers(list) {
    if (!Array.isArray(list)) throw new Error('ملف غير صالح');
    for (const x of list) {
      if (x && x.u && x.h) await saveUser({ u: x.u, name: x.name || x.u, role: x.role === 'admin' ? 'admin' : 'employee', h: x.h });
    }
  }

  window.QAuth = { sha256, hashPassword, getUsers, addOrUpdateUser, deleteUser, login, logout, current,
    requireLogin, changePassword, exportUsersJson, importUsers };
})();
