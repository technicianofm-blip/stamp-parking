/**
 * Stamp Parking — Google Apps Script (Backend)
 *
 * วิธีการติดตั้ง:
 * 1. ไปที่ https://script.google.com/create
 * 2. วางโค้ดนี้ทั้งหมด
 * 3. ตั้งค่า Script Properties:
 *    - SHEET_ID: Google Sheet ID
 *    - FOLDER_ID: Google Drive Folder ID
 *    - AUTH_SECRET: (สร้างให้อัตโนมัติ) secret ใช้เซ็น token
 * 4. บันทึก → Deploy > New deployment > Web app
 * 5. ตั้ง Execute as: "Me", Who has access: "Anyone"
 * 6. คัดลอก Web App URL ไปใส่ใน frontend (index.html)
 *
 * 🔐 Authentication: username+password → HMAC token (หมดอายุ 8 ชม.) + Audit Log
 *    - หลัง deploy ครั้งแรก ให้รัน (ผ่าน clasp run):
 *        initScriptProperties
 *      เพื่อสร้าง AUTH_SECRET, tab Users/AuditLog ใน Sheet และ seed admin คนแรก
 *      (รหัสผ่านเริ่มต้นแสดงใน console.log / clasp run output — ไม่ส่งกลับใน HTTP response
 *       เพื่อกันคนภายนอกที่มี Web App URL เรียก initScriptProperties แล้วขโมยรหัสผ่านตอน Users ว่าง)
 *    - ล็อกอินครั้งแรกด้วย username=admin + รหัสที่ได้ แล้วเปลี่ยนในหน้า Settings
 */

// ============================================================
// 🔧 Configuration — ใช้ Script Properties แทน Hardcode
// ============================================================
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    sheetId: props.getProperty('SHEET_ID') || '1HT9pHVxZ53OCdnFI6tFT_YQTFJZsP9eR6I2lH-gmNMo',
    folderId: props.getProperty('FOLDER_ID') || '1-Du1btmVyUSGVWq15RftJ_-6PqICxAfK'
  };
}

function setConfig(key, value) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(key, value);
}

// Global fallbacks — ใช้เมื่อ request ไม่ได้ส่ง sheetId/folderId มา
// (อ่านจาก Script Properties ก่อน, ถ้าไม่มีใช้ค่า default)
const SHEET_ID = getConfig().sheetId;
const FOLDER_ID = getConfig().folderId;

// ============================================================
// 🛠 Utility: Set Script Properties (call via clasp run)
// ============================================================
function initScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  const updates = {
    'SHEET_ID': '1HT9pHVxZ53OCdnFI6tFT_YQTFJZsP9eR6I2lH-gmNMo',
    'FOLDER_ID': '1-Du1btmVyUSGVWq15RftJ_-6PqICxAfK'
  };

  // AUTH_SECRET — สร้างถ้ายังไม่เคยมี (ครั้งเดียว แล้วเก็บถาวร)
  let authSecretStatus = 'exists';
  if (!props.getProperty('AUTH_SECRET')) {
    props.setProperty('AUTH_SECRET', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
    authSecretStatus = 'created';
  }

  Object.entries(updates).forEach(([key, value]) => {
    props.setProperty(key, value);
    console.log('[init] Set ' + key + ' = ' + value);
  });

  // สร้าง tab Users / AuditLog ใน Sheet หลักถ้ายังไม่มี
  getUsersSheet();
  getAuditSheet();

  // Seed admin คนแรก — เฉพาะตอนยังไม่มี user ใน table
  let initialPassword = null;
  const users = getUsersSheet().getDataRange().getValues();
  if (users.length <= 1) {
    initialPassword = generateInitialPassword();
    getUsersSheet().appendRow(['admin', hashPassword(initialPassword), 'ผู้ดูแลระบบ', 'admin', true]);
    // ⚠️ แสดงเฉพาะใน log (clasp run / execution log) — ห้ามคืนกลับใน HTTP response
    console.log('[init] 🆕 Seeded default admin — initialPassword = ' + initialPassword);
  }

  console.log('[init] authSecret=' + authSecretStatus + ' | initialPassword=' + (initialPassword ? 'GENERATED' : 'none'));
  return {
    success: true,
    message: 'Script Properties initialized',
    props: updates,
    authSecret: authSecretStatus,
    initialAdminCreated: !!initialPassword
  };
}

// Column indices (0-based) — ทำให้อ่านโค้ดง่ายขึ้น
const COL = { id:0, name:1, nickname:2, phone:3, dept:4, timeType:5, vehicle:6, ticketNo:7, photo:8, createdAt:9, status:10, discount:11 };

// ============================================================
// 🔐 Authentication — Username/Password + HMAC Token
// ───────────────────────────────────────────────────────────
// AUTH_SECRET เก็บใน Script Properties (สร้างอัตโนมัติถ้ายังไม่มี)
// Token = base64url(payload).base64url(HMAC-SHA256(payload, secret))
//   payload = username|expiryMs   (หมดอายุ 8 ชม.)
// การล็อกอิน = POST body เท่านั้น (ห้าม password ไป query string)
// token ส่งผ่าน header X-Auth-Token → query ?token= → POST body
// ───────────────────────────────────────────────────────────
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const AUTH_HASH_ITERATIONS = 1000;
const AUTH_MAX_FAILS = 5;
const AUTH_LOCK_WINDOW_MS = 15 * 60 * 1000;

// --- Password hashing (Apps Script ไม่มี PBKDF2 → salt + iterated SHA-256)
function _sha256Hex(input) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function _sha256Iter(salt, password, iterations) {
  let digest = salt + ':' + password;
  for (let i = 0; i < iterations; i++) digest = _sha256Hex(digest);
  return digest;
}
function hashPassword(password, salt) {
  const s = salt || Utilities.getUuid(); // per-user random salt
  return s + '$' + AUTH_HASH_ITERATIONS + '$' + _sha256Iter(s, password, AUTH_HASH_ITERATIONS);
}
function verifyPassword(password, stored) {
  if (!stored || stored.indexOf('$') === -1) return false;
  const parts = stored.split('$');
  const salt = parts[0];
  const iterations = parseInt(parts[1], 10) || AUTH_HASH_ITERATIONS;
  const expected = parts[2];
  return _sha256Iter(salt, password, iterations) === expected;
}
function generateInitialPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// --- HMAC token helpers
function getSecret() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('AUTH_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', s);
  }
  return s;
}
function issueToken(username, ttlMs) {
  const payloadBytes = Utilities.newBlob(username + '|' + (Date.now() + (ttlMs || TOKEN_TTL_MS))).getBytes();
  const payload = Utilities.base64EncodeWebSafe(payloadBytes);
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, getSecret()));
  return payload + '.' + sig;
}
function verifyToken(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const dot = token.indexOf('.');
  const payload = token.substring(0, dot);
  const sig = token.substring(dot + 1);
  const expected = Utilities.computeHmacSha256Signature(payload, getSecret());
  let provided;
  try { provided = Utilities.base64DecodeWebSafe(sig); } catch (e) { return null; }
  if (!expected || !provided || expected.length !== provided.length) return null;
  for (let i = 0; i < expected.length; i++) if (expected[i] !== provided[i]) return null;
  let payloadStr;
  try { payloadStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString(); } catch (e) { return null; }
  const pipe = payloadStr.lastIndexOf('|');
  if (pipe === -1) return null;
  const username = payloadStr.substring(0, pipe);
  const expiry = parseInt(payloadStr.substring(pipe + 1), 10);
  if (!username || isNaN(expiry) || Date.now() > expiry) return null;
  return { username: username };
}
function extractToken(e) {
  if (e && e.headers) {
    const t = e.headers['X-Auth-Token'] || e.headers['x-auth-token'] || '';
    if (t) return t;
  }
  if (e && e.parameter && e.parameter.token) return e.parameter.token;
  if (e && e.postData && e.postData.contents) {
    try { const b = JSON.parse(e.postData.contents); if (b.token) return b.token; } catch (err) {}
  }
  return '';
}
function verifyAuth(e) {
  return verifyToken(extractToken(e));
}
function requireAdmin(e) {
  const info = verifyAuth(e);
  if (!info) return null;
  const user = findUser(info.username);
  if (!user || user.active !== true) return null;
  return { username: user.username, displayName: user.displayName, role: user.role };
}

// --- User / Audit sheets (เก็บใน Spreadsheet หลักเดียวกันกับข้อมูล)
const USER_COL = { username: 0, passwordHash: 1, displayName: 2, role: 3, active: 4 };
const AUDIT_COL = { timestamp: 0, username: 1, action: 2, details: 3 };

function openScriptSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}
function getUsersSheet() {
  const ss = openScriptSpreadsheet();
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['username', 'passwordHash', 'displayName', 'role', 'active']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function getAuditSheet() {
  const ss = openScriptSpreadsheet();
  let sheet = ss.getSheetByName('AuditLog');
  if (!sheet) {
    sheet = ss.insertSheet('AuditLog');
    sheet.appendRow(['timestamp', 'username', 'action', 'details']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function findUser(username) {
  if (!username) return null;
  const data = getUsersSheet().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][USER_COL.username]).toLowerCase() === String(username).toLowerCase()) {
      return {
        username: String(data[i][USER_COL.username]),
        passwordHash: String(data[i][USER_COL.passwordHash] || ''),
        displayName: String(data[i][USER_COL.displayName] || data[i][USER_COL.username]),
        role: String(data[i][USER_COL.role] || 'admin'),
        active: data[i][USER_COL.active] === true
      };
    }
  }
  return null;
}
function listUsers() {
  const data = getUsersSheet().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][USER_COL.username]) continue;
    out.push({
      username: String(data[i][USER_COL.username]),
      displayName: String(data[i][USER_COL.displayName] || data[i][USER_COL.username]),
      role: String(data[i][USER_COL.role] || 'admin'),
      active: data[i][USER_COL.active] === true
    });
  }
  return out;
}
function appendAudit(username, action, details) {
  try {
    getAuditSheet().appendRow([new Date(), String(username || ''), String(action || ''), String(details || '')]);
  } catch (err) {
    console.error('[audit] error: ' + err.toString());
  }
}

// --- Login (public, POST body เท่านั้น) + lockout
function handleLogin(data) {
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  if (!username || !password) return { success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };

  const cache = CacheService.getScriptCache();
  const base = 'login_fail_' + username.toLowerCase();
  const blockedUntil = cache.get(base + '_block');
  if (blockedUntil && Date.now() < parseInt(blockedUntil, 10)) {
    return { success: false, error: 'พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอสักครู่' };
  }

  const user = findUser(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    let fails = parseInt(cache.get(base) || '0', 10) + 1;
    cache.put(base, String(fails), 900);
    if (fails >= AUTH_MAX_FAILS) cache.put(base + '_block', String(Date.now() + AUTH_LOCK_WINDOW_MS), 900);
    appendAudit(username, 'login_failed', '');
    return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }

  cache.remove(base);
  cache.remove(base + '_block');
  if (user.active !== true) return { success: false, error: 'บัญชีนี้ถูกปิดใช้งาน' };

  const token = issueToken(user.username);
  appendAudit(user.username, 'login', '');
  return { success: true, token: token, username: user.username, displayName: user.displayName, role: user.role, expiresIn: TOKEN_TTL_MS };
}

// --- User management (ต้องผ่าน requireAdmin แล้ว; actor = username ตัวที่ลงมือ)
function handleAddUser(data) {
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  const displayName = String(data.displayName || '').trim() || username;
  if (!username || !password) return { success: false, error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
  if (password.length < 6) return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  if (findUser(username)) return { success: false, error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
  getUsersSheet().appendRow([username, hashPassword(password), displayName, 'admin', true]);
  appendAudit(data.__actor || '?', 'addUser', JSON.stringify({ username: username, displayName: displayName }));
  return { success: true, message: 'เพิ่มผู้ใช้เรียบร้อย' };
}
function handleResetPassword(data) {
  const target = String(data.username || '').trim();
  const newPassword = String(data.password || '');
  const actor = data.__actor || '?';
  if (!target || !newPassword) return { success: false, error: 'กรุณาระบุผู้ใช้และรหัสผ่านใหม่' };
  if (newPassword.length < 6) return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  const sheet = getUsersSheet();
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][USER_COL.username]).toLowerCase() === target.toLowerCase()) {
      sheet.getRange(i + 1, USER_COL.passwordHash + 1).setValue(hashPassword(newPassword));
      appendAudit(actor, 'resetPassword', JSON.stringify({ username: target }));
      return { success: true, message: 'รีเซ็ตรหัสผ่านเรียบร้อย' };
    }
  }
  return { success: false, error: 'ไม่พบผู้ใช้' };
}
function handleChangeMyPassword(data) {
  const username = data.__actor || '';
  const oldPw = String(data.oldPassword || '');
  const newPw = String(data.newPassword || '');
  if (!oldPw || !newPw) return { success: false, error: 'กรุณากรอกรหัสผ่านเดิมและรหัสใหม่' };
  if (newPw.length < 6) return { success: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
  const user = findUser(username);
  if (!user || !verifyPassword(oldPw, user.passwordHash)) return { success: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' };
  const sheet = getUsersSheet();
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][USER_COL.username]).toLowerCase() === username.toLowerCase()) {
      sheet.getRange(i + 1, USER_COL.passwordHash + 1).setValue(hashPassword(newPw));
      appendAudit(username, 'changeMyPassword', JSON.stringify({ username: username }));
      return { success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อย' };
    }
  }
  return { success: false, error: 'ไม่พบผู้ใช้' };
}
function handleSetUserActive(username, active, actor) {
  const sheet = getUsersSheet();
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][USER_COL.username]).toLowerCase() === String(username).toLowerCase()) {
      sheet.getRange(i + 1, USER_COL.active + 1).setValue(active === true);
      appendAudit(actor || '?', active ? 'enableUser' : 'disableUser', JSON.stringify({ username: String(vals[i][USER_COL.username]) }));
      return { success: true, message: active ? 'เปิดใช้งานผู้ใช้เรียบร้อย' : 'ปิดใช้งานผู้ใช้เรียบร้อย' };
    }
  }
  return { success: false, error: 'ไม่พบผู้ใช้' };
}

// Actions that require auth (READ/WRITE protected actions)
const PROTECTED_ACTIONS = ['getAll', 'delete', 'updateStatus', 'updateDiscount', 'fetchUrl', 'listUsers', 'setUserActive'];

// Helper to check if action needs auth
function needsAuth(action) {
  return PROTECTED_ACTIONS.indexOf(action) !== -1;
}

// ============================================================
// DO GET — ดึงข้อมูล / ลบข้อมูล
// ============================================================
function doGet(e) {
  try {
    const action = e?.parameter?.action || 'getAll';
    const sheetId = (e?.parameter?.sheetId || '').trim();
    const folderId = (e?.parameter?.folderId || '').trim();

    console.log('[doGet] action=' + action + ' sheetId=' + sheetId);

    // Special action: initScriptProperties (no auth required)
    if (action === 'initScriptProperties') {
      return jsonResponse(initScriptProperties());
    }

    // Check authentication for protected actions
    let authed = null;
    if (needsAuth(action)) {
      authed = requireAdmin(e);
      if (!authed) {
        return jsonResponse({ success: false, error: 'Unauthorized: Invalid or missing token' }, 401);
      }
    }

    if (action === 'getAll') {
      return jsonResponse(getAllRecords(sheetId));
    }

    if (action === 'delete') {
      const id = e?.parameter?.id;
      if (!id) return jsonResponse({ success: false, error: 'Missing id' }, 400);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        console.log('[delete] lock acquired, id=' + id);

        const sheet = getSheet(sheetId);
        const data = sheet.getDataRange().getValues();
        let changed = false;
        for (let i = data.length - 1; i >= 0; i--) {
          if (String(data[i][COL.id]) === String(id)) {
            sheet.deleteRow(i + 1);
            changed = true;
            break;
          }
        }

        clearRecordCache(sheetId);
        console.log('[delete] id=' + id + ' result=' + changed);
        if (changed) appendAudit(authed.username, 'delete', JSON.stringify({ id: id }));
        return jsonResponse({ success: changed, deleted: changed });
      } catch (err) {
        console.error('[delete] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'updateStatus') {
      const id = e?.parameter?.id;
      const status = e?.parameter?.status;
      if (!id || !status) return jsonResponse({ success: false, error: 'Missing id or status' }, 400);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        console.log('[updateStatus] lock acquired, id=' + id + ' → ' + status);

        const sheet = getSheet(sheetId);
        ensureStatusColumn(sheet);
        const data = sheet.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][COL.id]) === String(id)) {
            sheet.getRange(i + 1, COL.status + 1).setValue(status);
            found = true;
            break;
          }
        }

        clearRecordCache(sheetId);
        console.log('[updateStatus] id=' + id + ' found=' + found);
        if (found) {
          appendAudit(authed.username, 'updateStatus', JSON.stringify({ id: id, status: status }));
          return jsonResponse({ success: true });
        }
        return jsonResponse({ success: false, error: 'Record not found' }, 404);
      } catch (err) {
        console.error('[updateStatus] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'updateDiscount') {
      const id = e?.parameter?.id;
      const discount = e?.parameter?.discount || '';
      if (!id) return jsonResponse({ success: false, error: 'Missing id' }, 400);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        console.log('[updateDiscount] id=' + id + ' → "' + discount + '"');

        const sheet = getSheet(sheetId);
        ensureStatusColumn(sheet);
        const data = sheet.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][COL.id]) === String(id)) {
            sheet.getRange(i + 1, COL.discount + 1).setValue(discount);
            found = true;
            break;
          }
        }

        clearRecordCache(sheetId);
        console.log('[updateDiscount] id=' + id + ' found=' + found);
        if (found) {
          appendAudit(authed.username, 'updateDiscount', JSON.stringify({ id: id, discount: discount }));
          return jsonResponse({ success: true });
        }
        return jsonResponse({ success: false, error: 'Record not found' }, 404);
      } catch (err) {
        console.error('[updateDiscount] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'fetchUrl') {
      const url = e?.parameter?.url || '';
      if (!url) return jsonResponse({ success: false, error: 'Missing url' }, 400);
      console.log('[fetchUrl] fetching: ' + url);
      try {
        const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, timeout: 10 });
        const html = r.getContentText();
        const found = html.match(/\b(\d{17})\b/);
        appendAudit(authed.username, 'fetchUrl', JSON.stringify({ url: url }));
        return jsonResponse({ success: true, ticket: found ? found[1] : '', htmlLength: html.length });
      } catch (err) {
        console.error('[fetchUrl] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      }
    }

    if (action === 'listUsers') {
      return jsonResponse({ success: true, data: listUsers() });
    }

    if (action === 'setUserActive') {
      const username = String(e?.parameter?.username || '').trim();
      const active = String(e?.parameter?.active || '').toLowerCase() === 'true';
      if (!username) return jsonResponse({ success: false, error: 'Missing username' }, 400);
      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        return jsonResponse(handleSetUserActive(username, active, authed.username));
      } catch (err) {
        console.error('[setUserActive] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      } finally {
        lock.releaseLock();
      }
    }

    return jsonResponse({ success: false, error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[doGet] error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() }, 500);
  }
}

// ============================================================
// DO POST — dispatch: login / manage users (authed) / create record (public)
//   - data.action = 'login'            → public login
//   - data.action = addUser/resetUserPassword/changeMyPassword → requireAdmin
//   - ไม่มี action                      → public create record (แบบฟอร์ม)
// ============================================================
function doPost(e) {
  console.log('[doPost] CALLED | paramKeys=' + Object.keys(e?.parameter||{}).join(',') + ' | postData=' + (e?.postData ? 'yes:'+typeof e.postData.contents : 'no'));
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    let data;
    if (e?.parameter?.data) {
      // form-urlencoded (URLSearchParams) — วิธีที่ GAS redirect ทำงานได้ดีที่สุด
      try { data = JSON.parse(e.parameter.data); }
      catch { return jsonResponse({ success: false, error: 'Invalid JSON in data field' }, 400); }
    } else if (e?.postData?.contents) {
      // text/plain fallback
      try { data = JSON.parse(e.postData.contents); }
      catch { data = e?.parameter || {}; }
    } else if (e?.parameter) {
      data = e.parameter;
    } else {
      return jsonResponse({ success: false, error: 'No data received' }, 400);
    }

    // 🔐 API dispatch: login / user management (POST body เท่านั้น — ห้าม password ไป query string)
    const action = String(data.action || '').trim();
    if (action === 'login') {
      return jsonResponse(handleLogin(data));
    }
    const ADMIN_POST_ACTIONS = ['addUser', 'resetUserPassword', 'changeMyPassword'];
    if (ADMIN_POST_ACTIONS.indexOf(action) !== -1) {
      const authed = requireAdmin(e);
      if (!authed) return jsonResponse({ success: false, error: 'Unauthorized: Invalid or missing token' }, 401);
      data.__actor = authed.username;
      if (action === 'addUser') return jsonResponse(handleAddUser(data));
      if (action === 'resetUserPassword') return jsonResponse(handleResetPassword(data));
      if (action === 'changeMyPassword') return jsonResponse(handleChangeMyPassword(data));
    }

    // ตรวจสอบข้อมูลที่จำเป็น
    console.log('[doPost] data keys: ' + Object.keys(data).join(',') + ' | photo len: ' + ((data.photo||'').length) + ' | sheetId: ' + (data.sheetId||''));
    const name = String(data.name || '').trim();
    const ticketNo = String(data.ticketNo || '').trim();
    const department = String(data.department || '').trim();
    const timeType = String(data.timeType || '').trim();
    const vehicleType = String(data.vehicleType || '').trim();
    const sheetId = String(data.sheetId || '').trim();
    const folderId = String(data.folderId || '').trim();

    if (!name) return jsonResponse({ success: false, error: 'กรุณากรอกชื่อ-นามสกุล' }, 400);
    if (!ticketNo || ticketNo.length !== 17) return jsonResponse({ success: false, error: 'เลขบัตรจอดรถต้องมี 17 หลัก' }, 400);

    const id = generateId();
    const createdAt = new Date(); // เป็น Date object → Sheet เก็บเป็นตัวเลข serial
    // ☁️ รับ photoUrl จาก Cloudinary โดยตรง (frontend upload ไม่ผ่าน GAS)
    const photoUrl = String(data.photoUrl || '').trim();
    console.log('[doPost] photoUrl=' + (photoUrl ? 'yes[' + photoUrl.length + ']' : 'no'));

    // บันทึกลง Google Sheet
    const sheet = getSheet(sheetId);

    // 🔁 ตรวจข้อมูลซ้ำ — เลขบัตร 17 หลักซ้ำกันในวันเดียวกัน → บล็อกการบันทึก
    //    (ยกเว้น frontend ส่ง forceDuplicate=true = "จำเป็นต้องบันทึก" → อนุญาต + เขียน AuditLog)
    const existing = findDuplicateToday(sheet, ticketNo);
    const forceDup = String(data.forceDuplicate).toLowerCase() === 'true';
    if (existing && !forceDup) {
      console.log('[doPost] DUPLICATE blocked: ticket=' + ticketNo + ' existingId=' + existing.id);
      return jsonResponse({
        success: false,
        duplicate: true,
        error: '⚠️ เลขบัตรนี้ถูกบันทึกไปแล้วในวันนี้ ไม่สามารถบันทึกซ้ำได้',
        existing: existing
      }, 409);
    }

    const rowData = [
      id, name,
      String(data.nickname || '').trim(),
      String(data.phone || '').trim(),
      department, timeType, vehicleType,
      ticketNo,
      photoUrl, createdAt,
      'รออนุมัติ',
      String(data.discount || '').trim()
    ];
    sheet.appendRow(rowData);
    // ฟอร์แมตและเขียน Ticket No. เป็นสูตรข้อความ (กันเลข 0 ต้นหาย 100%)
    const tr = sheet.getLastRow();
    const tc = sheet.getRange(tr, COL.ticketNo + 1);
    tc.setNumberFormat('@');
    tc.setFormula('="' + ticketNo.replace(/"/g,'""') + '"');

    clearRecordCache(sheetId);
    console.log('[doPost] created: ' + id + ' (' + name + ') photo=' + (photoUrl ? 'yes' : 'no'));
    // 📝 เขียน AuditLog เมื่อมีการบังคับบันทึกข้อมูลซ้ำ (จำเป็นต้องบันทึก) — ไว้ตรวจสอบภายหลัง
    if (existing && forceDup) {
      appendAudit('public', 'forceDuplicateSave', JSON.stringify({ ticketNo: ticketNo, recordId: id, existingId: existing.id }));
      console.log('[doPost] FORCE duplicate saved: ticket=' + ticketNo + ' existingId=' + existing.id + ' newId=' + id);
    }
    return jsonResponse({ success: true, id, photoUrl, forced: !!(existing && forceDup), message: '✅ บันทึกข้อมูลสำเร็จ' });
  } catch (err) {
    console.error('[doPost] error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() }, 500);
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 📸 อัปโหลดรูปไป Google Drive
// ============================================================
function uploadPhotoToDrive(base64Data, recordId, name, folderId) {
  console.log('[upload] 🔥 ENTERED uploadPhotoToDrive base64Type=' + typeof base64Data + ' recordId=' + recordId);
  try {
    // Guard — ถ้า base64Data ไม่ใช่ string ให้ log แล้ว skip
    if (typeof base64Data !== 'string' || !base64Data) {
      console.error('[upload] SKIP: invalid base64Data type=' + typeof base64Data + ' len=' + (base64Data||'').length);
      return '';
    }

    // แยก mime type และ base64 data (รองรับ data URL และ raw base64)
    let mimeType = 'image/jpeg';
    let rawData = base64Data;

    if (base64Data.includes(',')) {
      const parts = base64Data.split(',');
      const header = parts[0] || '';
      if (header.includes('png')) mimeType = 'image/png';
      else if (header.includes('gif')) mimeType = 'image/gif';
      else if (header.includes('webp')) mimeType = 'image/webp';
      rawData = parts[1] || '';
    }

    console.log('[upload] mime=' + mimeType + ' rawData_len=' + rawData.length);

    const decoded = Utilities.base64Decode(rawData);
    console.log('[upload] decoded bytes=' + decoded.length);

    const blob = Utilities.newBlob(decoded, mimeType, `stamp-${recordId}-${name}.jpg`);

    // หาโฟลเดอร์ — ใช้ folderId จาก request ก่อน, fallback เป็นค่า hardcode
    let folder;
    const fid = (folderId && folderId !== '') ? folderId : FOLDER_ID;
    console.log('[upload] using folderId=' + fid);
    if (fid && fid !== 'YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE') {
      folder = DriveApp.getFolderById(fid);
    } else {
      // ถ้าไม่ได้ตั้งค่าโฟลเดอร์ ให้สร้างใน Drive root
      folder = DriveApp.createFolder('Stamp Parking Photos');
    }

    const file = folder.createFile(blob);
    file.setDescription(`Stamp Parking — ${name} (${recordId})`);
    // เปิดสิทธิ์ให้ Anyone with link อ่านได้ (จำเป็นสำหรับแสดงรูปในหน้าเว็บ)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const url = `https://drive.google.com/uc?export=view&id=${file.getId()}`;
    console.log('[upload] success url=' + url);
    return url;
  } catch (err) {
    console.error('[upload] FAILED: ' + err.toString() + ' | stack: ' + err.stack);
    return ''; // ถ้าอัปโหลดรูปไม่สำเร็จ ให้บันทึกข้อมูลส่วนอื่นต่อไป
  }
}

// ============================================================
// 📊 ดึงข้อมูลทั้งหมด
// ============================================================
function getAllRecords(sheetId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = getCacheKey(sheetId);
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('[getAll] cache HIT');
    return { success: true, data: JSON.parse(cached) };
  }
  console.log('[getAll] cache MISS — reading Sheet');

  const sheet = getSheet(sheetId);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    console.log('[getAll] empty sheet');
    return { success: true, data: [] };
  }

  // ถ้า sheet เก่ายังไม่มีคอลัมน์ status → เพิ่ม header
  ensureStatusColumn(sheet);

  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[COL.id]) continue; // ข้ามแถวว่าง
    records.push({
      id: String(row[COL.id] || ''),
      name: String(row[COL.name] || ''),
      nickname: String(row[COL.nickname] || ''),
      phone: String(row[COL.phone] || ''),
      department: String(row[COL.dept] || ''),
      timeType: String(row[COL.timeType] || ''),
      vehicleType: String(row[COL.vehicle] || ''),
      ticketNo: String(row[COL.ticketNo] || ''),
      photo: String(row[COL.photo] || ''),
      createdAt: row[COL.createdAt] instanceof Date ? row[COL.createdAt].toISOString() : String(row[COL.createdAt] || ''),
      status: String(row[COL.status] || 'รออนุมัติ'),
      discount: String(row[COL.discount] || '')
    });
  }

  // เรียงลำดับล่าสุดก่อน
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // CacheService จำกัดค่า 100KB ต่อ key — ถ้าข้อมูลเยอะ (หลายร้อย record) จน cache ไม่ไหว
  // ให้ข้ามไป ไม่ throw (ยังคืน data ตามปกติ แค่ไม่ cache)
  try {
    cache.put(cacheKey, JSON.stringify(records), 600);
    console.log('[getAll] cached ' + records.length + ' records');
  } catch (e) {
    console.warn('[getAll] cache.put skipped (payload เกินขีดจำกัด?): ' + e.toString());
  }
  return { success: true, data: records };
}

// ============================================================
// 🛠 Utility Functions
// ============================================================

function getSheet(sheetId) {
  const id = (sheetId && sheetId !== '') ? sheetId : SHEET_ID;
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName('Stamp Parking');
  if (!sheet) {
    sheet = ss.insertSheet('Stamp Parking');
    sheet.appendRow([
      'ID', 'ชื่อ-นามสกุล', 'ชื่อเล่น', 'เบอร์ติดต่อ',
      'หน่วยงาน', 'ประเภทการลงเวลา', 'ยานพาหนะ',
      'เลขบัตรจอดรถ', 'รูปภาพ (URL)', 'วันที่บันทึก', 'สถานะ', 'ส่วนลด'
    ]);
    sheet.setFrozenRows(1);
    // จัดความกว้างคอลัมน์
    sheet.setColumnWidths(1, 12, 180);
    // ฟอร์แมตคอลัมน์ Ticket No. (คอลัมน์ H = 8) เป็นข้อความ ป้องกันเลข 0 ต้นหาย
    sheet.getRange('H:H').setNumberFormat('@');
  }
  // ป้องกันเลข 0 ต้นหายในคอลัมน์ Ticket No.
  sheet.getRange('H:H').setNumberFormat('@');
  // ฟอร์แมตวันที่ (คอลัมน์ I) เป็นไทย
  sheet.getRange('I:I').setNumberFormat('dd"/"mm"/"yyyy" "HH":"MM');
  return sheet;
}

// ถ้า sheet เก่าที่ยังไม่มีคอลัมน์ "สถานะ" หรือ "ส่วนลด" ให้เพิ่มให้
function ensureStatusColumn(sheet) {
  const h = sheet.getRange(1, COL.status + 1).getValue();
  if (!h || h === '') {
    sheet.getRange(1, COL.status + 1).setValue('สถานะ');
  }
  const d = sheet.getRange(1, COL.discount + 1).getValue();
  if (!d || d === '') {
    sheet.getRange(1, COL.discount + 1).setValue('ส่วนลด');
  }
}

// ============================================================
// 🔁 ตรวจข้อมูลซ้ำ — เลขบัตรจอดรถ 17 หลักซ้ำกันในวันเดียวกัน (Asia/Bangkok)
//    ใช้ใน doPost ก่อน appendRow เพื่อบล็อกการลงข้อมูลซ้ำ
// ============================================================
function findDuplicateToday(sheet, ticketNo) {
  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[COL.id]) continue;
    if (String(row[COL.ticketNo] || '') !== ticketNo) continue;
    const ts = row[COL.createdAt];
    let day = '';
    if (ts instanceof Date) day = Utilities.formatDate(ts, 'Asia/Bangkok', 'yyyy-MM-dd');
    else if (ts) day = String(ts).substring(0, 10);
    if (day === today) {
      return {
        id: String(row[COL.id] || ''),
        name: String(row[COL.name] || ''),
        department: String(row[COL.dept] || ''),
        timeType: String(row[COL.timeType] || ''),
        vehicleType: String(row[COL.vehicle] || ''),
        photo: String(row[COL.photo] || ''),
        createdAt: ts instanceof Date ? ts.toISOString() : String(ts || ''),
        status: String(row[COL.status] || 'รออนุมัติ')
      };
    }
  }
  return null;
}

// ============================================================
// Cache helpers
// ============================================================
function getCacheKey(sheetId) {
  return 'recs_' + (sheetId || SHEET_ID);
}
function clearRecordCache(sheetId) {
  CacheService.getScriptCache().remove(getCacheKey(sheetId));
  console.log('[cache] cleared for sheet');
}

// ============================================================
// ID generator
// ============================================================
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result + Date.now().toString(36);
}

function jsonResponse(data, status = 200) {
  // NOTE: ContentService.TextOutput ไม่มีเมธอด addHeader() และ GAS ไม่อนุญาต
  // ให้ตั้งค่า CORS header เอง — แต่ Web App ที่ deploy แบบ "Anyone" จะส่ง
  // Access-Control-Allow-Origin: * ให้อัตโนมัติอยู่แล้ว จึงไม่ต้องทำอะไรเพิ่ม
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
