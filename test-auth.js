// ===================================================================
// test-auth.js — ทดสอบระบบ Auth แบบ Local กับ test server (index.js)
// วิธีใช้: node test-auth.js   (มันจะ spawn server เองที่ port 3005)
// ===================================================================
const { spawn } = require('child_process');

const BASE = 'http://localhost:3005/api';
let results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '   → ' + detail : ''));
}
async function apiGet(action, token, extra) {
  const qs = new URLSearchParams({ action });
  if (token) qs.set('token', token);
  if (extra) for (const k of Object.keys(extra)) qs.set(k, extra[k]);
  const r = await fetch(BASE + '/?' + qs.toString());
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
async function apiPost(body) {
  const r = await fetch(BASE + '/', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function main() {
  // spawn test server
  const child = spawn(process.execPath, ['index.js'], { cwd: process.cwd() });
  let serverOut = '';
  child.stdout.on('data', d => { serverOut += d.toString(); });
  child.stderr.on('data', d => { serverOut += d.toString(); });
  child.on('exit', code => { serverOut += '\n[server exited ' + code + ']'; });
  for (let i = 0; i < 50; i++) { if (serverOut.includes('Server running')) break; await sleep(200); }
  console.log('— server boot:', serverOut.split('\n').filter(Boolean).slice(-2).join(' | '));

  try {
    // --- Login สำเร็จ + เอา token
    let r = await apiPost({ action: 'login', username: 'admin', password: 'admin123' });
    const token = r.json.token;
    record('T1 login admin/admin123 → token', r.json.success === true && !!token, 'token=' + (token ? token.slice(0, 18) + '…' : 'none'));

    // --- getAll: มี/ไม่มี/ผิด token
    r = await apiGet('getAll', token);
    record('T2 getAll + token → 2 records', r.json.success === true && Array.isArray(r.json.data) && r.json.data.length === 2, 'records=' + ((r.json.data || []).length));
    r = await apiGet('getAll', 'bad.token.value');
    record('T3 getAll + token ผิด → 401', r.status === 401 && r.json.success === false, 'status=' + r.status + ' err=' + r.json.error);
    r = await apiGet('getAll');
    record('T4 getAll ไม่มี token → 401', r.status === 401, 'status=' + r.status);

    // --- fetchUrl (bug fix: เดิมไม่เช็ค auth)
    r = await apiGet('fetchUrl', token, { url: 'https://example.com/ticket.html' });
    record('T5 fetchUrl + token → ticket', r.json.success === true && !!r.json.ticket, 'ticket=' + (r.json.ticket || ''));
    r = await apiGet('fetchUrl');
    record('T6 fetchUrl ไม่มี token → 401', r.status === 401, 'status=' + r.status);

    // --- listUsers
    r = await apiGet('listUsers', token);
    const hasAdmin = (r.json.data || []).some(u => u.username === 'admin');
    record('T7 listUsers + token → มี admin', r.json.success === true && hasAdmin, 'users=' + (r.json.data || []).map(u => u.username).join(','));

    // --- addUser + ห้ามซ้ำ
    r = await apiPost({ action: 'addUser', username: 'op2', password: 'secret1', displayName: 'ผู้ช่วย', token: token });
    record('T8 addUser op2 → สำเร็จ', r.json.success === true, 'msg=' + r.json.message);
    r = await apiPost({ action: 'addUser', username: 'op2', password: 'secret1', displayName: 'x', token: token });
    record('T9 addUser op2 ซ้ำ → error', r.json.success === false && /มีอยู่แล้ว/.test(r.json.error || ''), 'err=' + r.json.error);

    // --- delete test456 + audit log
    r = await apiGet('delete', token, { id: 'test456' });
    record('T10 delete test456 + token', r.json.success === true, 'deleted=' + r.json.deleted);
    await sleep(300);
    const hasDeleteAudit = /"action":"delete"/.test(serverOut);
    record('T11 AuditLog มีรายการ delete', hasDeleteAudit, '');
    r = await apiGet('getAll', token);
    record('T12 getAll หลัง delete → 1 record', (r.json.data || []).length === 1, 'records=' + ((r.json.data || []).length));

    // --- create record (public)
    r = await apiPost({ name: 'ทดสอบ ทดสอบ', ticketNo: '11122233344455566' });
    record('T13 create record (public POST)', r.json.success === true, 'id=' + (r.json.id || ''));
    r = await apiGet('getAll', token);
    record('T14 getAll → 2 records', (r.json.data || []).length === 2, 'records=' + ((r.json.data || []).length));

    // --- login ผิดรหัสผ่าน
    r = await apiPost({ action: 'login', username: 'admin', password: 'wrongpw' });
    record('T15 login ผิดรหัส → error', r.json.success === false && /ไม่ถูกต้อง/.test(r.json.error || ''), 'err=' + r.json.error);

    // --- lockout (ใช้ username 'ghost' ที่ไม่มี — กันบล็อก admin)
    let lockMsgs = [];
    for (let i = 0; i < 5; i++) {
      r = await apiPost({ action: 'login', username: 'ghost', password: 'x' });
      lockMsgs.push(r.json.error || '');
    }
    r = await apiPost({ action: 'login', username: 'ghost', password: 'x' }); // ครั้งที่ 6
    const locked = /หลายครั้ง/.test(r.json.error || '');
    record('T16 lockout หลังผิด 5 ครั้ง', locked && lockMsgs.every(m => /ไม่ถูกต้อง/.test(m)), 'err6=' + r.json.error);

    // --- changeMyPassword
    r = await apiPost({ action: 'changeMyPassword', oldPassword: 'wrong', newPassword: 'admin999', token: token });
    record('T17 changeMyPassword รหัสเดิมผิด → error', r.json.success === false, 'err=' + r.json.error);
    r = await apiPost({ action: 'changeMyPassword', oldPassword: 'admin123', newPassword: 'admin999', token: token });
    record('T18 changeMyPassword ถูกต้อง → สำเร็จ', r.json.success === true, 'msg=' + r.json.message);

    // --- ล็อกอินด้วยรหัสใหม่
    r = await apiPost({ action: 'login', username: 'admin', password: 'admin123' });
    record('T19 login รหัสเก่า → ผิด', r.json.success === false, '');
    r = await apiPost({ action: 'login', username: 'admin', password: 'admin999' });
    record('T20 login รหัสใหม่ → สำเร็จ', r.json.success === true, '');

    // --- setUserActive ปิด op2 → op2 ล็อกอินไม่ได้
    r = await apiGet('setUserActive', token, { username: 'op2', active: 'false' });
    record('T21 ปิดผู้ใช้ op2', r.json.success === true, 'msg=' + r.json.message);
    r = await apiPost({ action: 'login', username: 'op2', password: 'secret1' });
    record('T22 op2 (ปิดแล้ว) ล็อกอิน → บัญชีถูกปิด', /ปิดใช้งาน/.test(r.json.error || ''), 'err=' + r.json.error);

  } catch (e) {
    record('TEST RUNNER ERROR', false, e.message);
  } finally {
    child.kill();
  }

  const failed = results.filter(x => !x.ok);
  console.log('\n====================');
  console.log('สรุป: ' + (results.length - failed.length) + '/' + results.length + ' ผ่าน');
  if (failed.length) {
    console.log('ล้มเหลว: ' + failed.map(f => f.name).join(' | '));
    process.exit(1);
  }
}

main();
