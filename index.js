// ===================================================================
// SIMPLE NODE.JS SERVER FOR STAMP PARKING - FOR TESTING LOGIN/TOKEN
// Mirrors gas-code.gs: username+password → HMAC token (8h) + audit log
// ===================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// In-memory data storage (simulating Google Sheets)
let records = [
  {
    id: 'test123',
    name: 'สมชาย ใจดี',
    nickname: 'ชาย',
    phone: '0812345678',
    department: 'OFM',
    timeType: 'เข้างาน',
    vehicleType: 'รถจักรยานยนต์',
    ticketNo: 'ABCD1234EFGH5678',
    photo: 'https://example.com/photo1.jpg',
    createdAt: new Date('2026-08-03T10:00:00Z').toISOString(),
    status: 'รออนุมัติ',
    discount: ''
  },
  {
    id: 'test456',
    name: 'ณัฐชา จอมแก่น',
    nickname: 'นัท',
    phone: '0987654321',
    department: 'PCS',
    timeType: 'เข้างาน',
    vehicleType: 'รถยนต์',
    ticketNo: 'XYZ9876ABC5432DEF',
    photo: 'https://example.com/photo2.jpg',
    createdAt: new Date('2026-08-02T14:30:00Z').toISOString(),
    status: 'อนุมัติ',
    discount: '5'
  }
];

// ===================================================================
// 🔐 AUTH — TEST ONLY (mirror gas-code.gs)
// ===================================================================
const SECRET = 'test-secret-for-local-dev-only';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const AUTH_MAX_FAILS = 5;
const AUTH_LOCK_WINDOW_MS = 15 * 60 * 1000;

// In-memory users — เก็บ plaintext เพื่อ debug ง่าย (test only)
// ล็อกอินทดสอบ: admin / admin123
const users = {
  admin: { username: 'admin', password: 'admin123', displayName: 'ผู้ดูแลระบบ', active: true }
};
const auditLog = [];
const loginFails = {}; // username-lower -> {count, blockedUntil}

function findUser(username) {
  const uname = String(username || '').toLowerCase();
  for (const k of Object.keys(users)) {
    if (users[k].username.toLowerCase() === uname) return users[k];
  }
  return null;
}

// --- Token (HMAC-SHA256, payload = username|expiryMs)
function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function issueToken(username) {
  const payload = b64u(Buffer.from(username + '|' + (Date.now() + TOKEN_TTL_MS), 'utf8'));
  const sig = b64u(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return payload + '.' + sig;
}
function verifyToken(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const dot = token.indexOf('.');
  const payload = token.substring(0, dot);
  const sig = token.substring(dot + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest();
  let provided;
  try { provided = b64uDecode(sig); } catch (e) { return null; }
  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;
  const payloadStr = b64uDecode(payload).toString('utf8');
  const pipe = payloadStr.lastIndexOf('|');
  if (pipe === -1) return null;
  const username = payloadStr.substring(0, pipe);
  const expiry = parseInt(payloadStr.substring(pipe + 1), 10);
  if (!username || isNaN(expiry) || Date.now() > expiry) return null;
  return { username: username };
}
function getToken(query, body) {
  return (query && query.token) || (body && body.token) || '';
}
function requireAdmin(query, body) {
  const info = verifyToken(getToken(query, body));
  if (!info) return null;
  const u = findUser(info.username);
  if (!u || u.active !== true) return null;
  return { username: u.username, displayName: u.displayName };
}

// --- Audit
function appendAudit(username, action, details) {
  const entry = { timestamp: new Date().toISOString(), username: username || '', action: action || '', details: details || '' };
  auditLog.push(entry);
  console.log('[AUDIT]', JSON.stringify(entry));
}

// --- Login
function handleLogin(body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return { success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };

  const key = username.toLowerCase();
  const now = Date.now();
  const f = loginFails[key];
  if (f && f.blockedUntil && now < f.blockedUntil) {
    return { success: false, error: 'พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอสักครู่' };
  }

  const user = findUser(username);
  const ok = !!user && user.password === password; // test only: plaintext compare
  if (!ok) {
    const count = (f ? f.count : 0) + 1;
    loginFails[key] = { count: count, blockedUntil: count >= AUTH_MAX_FAILS ? now + AUTH_LOCK_WINDOW_MS : null };
    appendAudit(username, 'login_failed', '');
    return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }
  delete loginFails[key];
  if (user.active !== true) return { success: false, error: 'บัญชีนี้ถูกปิดใช้งาน' };

  const token = issueToken(user.username);
  appendAudit(user.username, 'login', '');
  return { success: true, token: token, username: user.username, displayName: user.displayName, role: 'admin', expiresIn: TOKEN_TTL_MS };
}

// --- User management
function handleAddUser(body) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const displayName = String(body.displayName || '').trim() || username;
  if (!username || !password) return { success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
  if (password.length < 6) return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  if (findUser(username)) return { success: false, error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
  users[username] = { username: username, password: password, displayName: displayName, active: true };
  appendAudit(body.__actor || '?', 'addUser', JSON.stringify({ username: username, displayName: displayName }));
  return { success: true, message: 'เพิ่มผู้ใช้เรียบร้อย' };
}
function handleResetPassword(body) {
  const target = String(body.username || '').trim();
  const newPassword = String(body.password || '');
  if (!target || !newPassword) return { success: false, error: 'กรุณาระบุผู้ใช้และรหัสผ่านใหม่' };
  if (newPassword.length < 6) return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  const u = findUser(target);
  if (!u) return { success: false, error: 'ไม่พบผู้ใช้' };
  u.password = newPassword;
  appendAudit(body.__actor || '?', 'resetPassword', JSON.stringify({ username: target }));
  return { success: true, message: 'รีเซ็ตรหัสผ่านเรียบร้อย' };
}
function handleChangeMyPassword(body, authed) {
  const oldPw = String(body.oldPassword || '');
  const newPw = String(body.newPassword || '');
  if (!oldPw || !newPw) return { success: false, error: 'กรุณากรอกรหัสผ่านเดิมและรหัสใหม่' };
  if (newPw.length < 6) return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  const u = findUser(authed.username);
  if (!u || u.password !== oldPw) return { success: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' };
  u.password = newPw;
  appendAudit(authed.username, 'changeMyPassword', JSON.stringify({ username: authed.username }));
  return { success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อย' };
}
function handleSetUserActive(username, active, actor) {
  const u = findUser(username);
  if (!u) return { success: false, error: 'ไม่พบผู้ใช้' };
  u.active = active === true;
  appendAudit(actor || '?', u.active ? 'enableUser' : 'disableUser', JSON.stringify({ username: u.username }));
  return { success: true, message: 'อัปเดตสถานะผู้ใช้เรียบร้อย' };
}
function listUsers() {
  return Object.keys(users).map(function (k) {
    const u = users[k];
    return { username: u.username, displayName: u.displayName, role: 'admin', active: u.active };
  });
}

// ===================================================================
// Server
// ===================================================================
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  // Handle OPTIONS requests for CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Routes:
  //  - ขึ้นต้น /api หรือ /api/ (path เดิม)
  //  - หรือ method POST (login / create record / admin ops) — ทุก POST เป็น API
  //  - หรือมี ?action= ใน query (GET จากหน้าเว็บที่ผูก action ตรง URL)
  // ทุกกรณี กลับ JSON ให้หน้าเว็บใช้งานได้แม้ URL เป็นแค่ http://localhost:3005
  const isApi = pathname === '/api' || pathname.startsWith('/api/') || method === 'POST' || !!query.action;
  if (isApi) {
    handleApiRequest(req, res, pathname, method, query);
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // If file doesn't exist, serve index.html (for client-side routing)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'index.html');
  }

  // Read and serve file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('404 - File not found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html' :
    ext === '.css' ? 'text/css' :
    ext === '.js' ? 'application/javascript' : 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, data, status) {
  res.writeHead(status || 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function unauth(res) {
  sendJson(res, { success: false, error: 'Unauthorized: Invalid or missing token' }, 401);
}

async function handleApiRequest(req, res, pathname, method, query) {
  let action = query.action || '';
  let body = {};
  if (method === 'POST') {
    body = await readBody(req);
    action = action || body.action || '';
  }
  console.log(`[API] ${method} ${pathname} - action: ${action}`);

  // POST: login (public)
  if (action === 'login') {
    sendJson(res, handleLogin(body));
    return;
  }

  // POST: user management (admin-only)
  const ADMIN_POST = ['addUser', 'resetUserPassword', 'changeMyPassword'];
  if (ADMIN_POST.indexOf(action) !== -1) {
    const authed = requireAdmin(query, body);
    if (!authed) { unauth(res); return; }
    body.__actor = authed.username;
    if (action === 'addUser') sendJson(res, handleAddUser(body));
    else if (action === 'resetUserPassword') sendJson(res, handleResetPassword(body));
    else if (action === 'changeMyPassword') sendJson(res, handleChangeMyPassword(body, authed));
    return;
  }

  // POST: create record (public, no action) — mirror GAS doPost
  if (method === 'POST' && !action) {
    handleCreateRecord(res, body);
    return;
  }

  // GET: protected actions (token required)
  const PROTECTED = ['getAll', 'delete', 'updateStatus', 'updateDiscount', 'fetchUrl', 'listUsers', 'setUserActive'];
  if (PROTECTED.indexOf(action) !== -1) {
    const authed = requireAdmin(query, body);
    if (!authed) { unauth(res); return; }
    switch (action) {
      case 'getAll': handleGetAll(res, query, authed); break;
      case 'delete': handleDelete(res, query, authed); break;
      case 'updateStatus': handleUpdateStatus(res, query, authed); break;
      case 'updateDiscount': handleUpdateDiscount(res, query, authed); break;
      case 'fetchUrl': handleFetchUrl(res, query, authed); break;
      case 'listUsers': sendJson(res, { success: true, data: listUsers() }); break;
      case 'setUserActive': handleSetUserActiveRoute(res, query, authed); break;
    }
    return;
  }

  sendJson(res, { success: false, error: 'Unknown action' }, 400);
}

// วันที่แบบ Asia/Bangkok (UTC+7 คงที่ ไม่มี DST) → 'yyyy-MM-dd' — mirror gas-code.gs findDuplicateToday
function bkkDay(iso) {
  const ms = new Date(iso).getTime() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function handleCreateRecord(res, body) {
  const name = String(body.name || '').trim();
  const ticketNo = String(body.ticketNo || '').trim();
  if (!name) { sendJson(res, { success: false, error: 'กรุณากรอกชื่อ-นามสกุล' }, 400); return; }
  if (!ticketNo || ticketNo.length !== 17) { sendJson(res, { success: false, error: 'เลขบัตรจอดรถต้องมี 17 หลัก' }, 400); return; }

  // 🔁 ตรวจข้อมูลซ้ำ — เลขบัตรซ้ำกันในวันเดียวกัน → บล็อก (mirror gas-code.gs)
  const todayStr = bkkDay(new Date().toISOString());
  const existing = records.find(r => r.ticketNo === ticketNo && bkkDay(r.createdAt) === todayStr);
  if (existing) {
    console.log(`[API] DUPLICATE blocked: ticket=${ticketNo} existingId=${existing.id}`);
    sendJson(res, {
      success: false,
      duplicate: true,
      error: '⚠️ เลขบัตรนี้ถูกบันทึกไปแล้วในวันนี้ ไม่สามารถบันทึกซ้ำได้',
      existing: {
        id: existing.id, name: existing.name, department: existing.department,
        timeType: existing.timeType, vehicleType: existing.vehicleType,
        photo: existing.photo || '', createdAt: existing.createdAt, status: existing.status
      }
    }, 409);
    return;
  }

  const rec = {
    id: 'rec_' + Date.now().toString(36),
    name: name,
    nickname: String(body.nickname || '').trim(),
    phone: String(body.phone || '').trim(),
    department: String(body.department || '').trim(),
    timeType: String(body.timeType || '').trim(),
    vehicleType: String(body.vehicleType || '').trim(),
    ticketNo: ticketNo,
    photo: String(body.photoUrl || '').trim(),
    createdAt: new Date().toISOString(),
    status: 'รออนุมัติ',
    discount: String(body.discount || '').trim()
  };
  records.push(rec);
  console.log('[API] Created record: ' + rec.id + ' (' + name + ')');
  sendJson(res, { success: true, id: rec.id, photoUrl: rec.photo, message: '✅ บันทึกข้อมูลสำเร็จ' });
}

function handleGetAll(res, query, authed) {
  console.log(`[API] getAll by ${authed.username}`);
  let filteredRecords = [...records];
  if (query.sheetId) console.log(`[API] Sheet ID filter: ${query.sheetId}`);
  filteredRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  sendJson(res, { success: true, data: filteredRecords });
}

function handleDelete(res, query, authed) {
  const id = query.id;
  if (!id) { sendJson(res, { success: false, error: 'Missing id' }, 400); return; }
  const index = records.findIndex(r => r.id === id);
  if (index === -1) { sendJson(res, { success: false, error: 'Record not found' }, 404); return; }
  const deleted = records.splice(index, 1)[0];
  console.log(`[API] Deleted record: ${deleted.name} (id: ${id}) by ${authed.username}`);
  appendAudit(authed.username, 'delete', JSON.stringify({ id: id }));
  sendJson(res, { success: true, deleted: true });
}

function handleUpdateStatus(res, query, authed) {
  const id = query.id;
  const status = query.status;
  if (!id || !status) { sendJson(res, { success: false, error: 'Missing id or status' }, 400); return; }
  const index = records.findIndex(r => r.id === id);
  if (index === -1) { sendJson(res, { success: false, error: 'Record not found' }, 404); return; }
  records[index].status = status;
  console.log(`[API] Updated status for record ${id} to: ${status} by ${authed.username}`);
  appendAudit(authed.username, 'updateStatus', JSON.stringify({ id: id, status: status }));
  sendJson(res, { success: true });
}

function handleUpdateDiscount(res, query, authed) {
  const id = query.id;
  const discount = query.discount;
  if (!id) { sendJson(res, { success: false, error: 'Missing id' }, 400); return; }
  const index = records.findIndex(r => r.id === id);
  if (index === -1) { sendJson(res, { success: false, error: 'Record not found' }, 404); return; }
  records[index].discount = discount;
  console.log(`[API] Updated discount for record ${id} to: ${discount} by ${authed.username}`);
  appendAudit(authed.username, 'updateDiscount', JSON.stringify({ id: id, discount: discount }));
  sendJson(res, { success: true });
}

function handleFetchUrl(res, query, authed) {
  const url = query.url;
  if (!url) { sendJson(res, { success: false, error: 'Missing url' }, 400); return; }
  console.log(`[API] Fetching URL: ${url} by ${authed.username}`);
  appendAudit(authed.username, 'fetchUrl', JSON.stringify({ url: url }));
  const fakeTicket = Math.random().toString(36).substr(2, 17).toUpperCase();
  sendJson(res, { success: true, ticket: fakeTicket });
}

function handleSetUserActiveRoute(res, query, authed) {
  const username = String(query.username || '').trim();
  const active = String(query.active || '').toLowerCase() === 'true';
  if (!username) { sendJson(res, { success: false, error: 'Missing username' }, 400); return; }
  sendJson(res, handleSetUserActive(username, active, authed.username));
}

server.listen(3005, () => {
  console.log('Server running on port 3005');
  console.log('Test login: admin / admin123');
});
