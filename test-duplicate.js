// ===================================================================
// test-duplicate.js — ทดสอบ feature ตรวจเลขบัตรจอดรถซ้ำ (วันเดียวกัน)
//   A) unit test bkkDay (วันแบบ Asia/Bangkok) — จุดเสี่ยงเรื่องวันข้ามเขตเวลา
//   B) E2E ผ่าน mock server: login → create → duplicate → status/discount → delete
// วิธีใช้: node test-duplicate.js   (มันจะ spawn server เองที่ port 3005)
// ===================================================================
const { spawn } = require('child_process');

// --- A) unit test bkkDay (คัดลอก logic จาก index.js เพื่อทดสอบตรงๆ) ---
function bkkDay(iso) {
  const ms = new Date(iso).getTime() + 7 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
let unitOk = 0, unitBad = 0;
function u(name, got, want) {
  const ok = got === want;
  ok ? unitOk++ : unitBad++;
  console.log((ok ? '✅ ' : '❌ ') + 'unit: ' + name + ' → ' + got + (ok ? '' : ' (want ' + want + ')'));
}
// 2026-08-09T16:30Z = 23:30 วันที่ 9 ในไทย
u('23:30 ไทย ยังเป็นวันที่ 9', bkkDay('2026-08-09T16:30:00.000Z'), '2026-08-09');
// 2026-08-09T17:30Z = 00:30 วันที่ 10 ในไทย (ข้ามวัน!)
u('00:30 ไทย ข้ามเป็นวันที่ 10', bkkDay('2026-08-09T17:30:00.000Z'), '2026-08-10');
// เที่ยงวันปกติ
u('เที่ยง ไทย วันที่ 9', bkkDay('2026-08-09T05:00:00.000Z'), '2026-08-09');
// ข้อมูลเก่า (วันที่ 3) — ต้องไม่โดนบล็อก เพราะคนละวัน
u('ข้อมูลเก่า วันที่ 3', bkkDay('2026-08-03T10:00:00.000Z'), '2026-08-03');

// --- B) E2E mock ---
const BASE = 'http://localhost:3005/api';
let results = [];
function record(name, ok, detail) { results.push({ name, ok }); console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '   → ' + detail : '')); }
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
  console.log('\n===== A) unit bkkDay =====');
  console.log('unit: ' + unitOk + ' ผ่าน / ' + unitBad + ' ไม่ผ่าน');

  const child = spawn(process.execPath, ['index.js'], { cwd: process.cwd() });
  let serverOut = '';
  child.stdout.on('data', d => { serverOut += d.toString(); });
  child.stderr.on('data', d => { serverOut += d.toString(); });
  child.on('exit', code => { serverOut += '\n[server exited ' + code + ']'; });
  for (let i = 0; i < 50; i++) { if (serverOut.includes('Server running')) break; await sleep(200); }

  try {
    console.log('\n===== B) E2E mock =====');
    // login
    let r = await apiPost({ action: 'login', username: 'admin', password: 'admin123' });
    const token = r.json.token;
    record('V1 login → token', r.json.success === true && !!token, '');

    // getAll
    r = await apiGet('getAll', token);
    record('V2 getAll → array', r.json.success === true && Array.isArray(r.json.data), 'count=' + (r.json.data || []).length);

    // create ใหม่
    const ticket = '11223344556677889';
    r = await apiPost({ name: 'บุคลากร หนึ่ง', ticketNo: ticket, department: 'OFM', timeType: 'เข้างาน', vehicleType: 'รถจักรยานยนต์', photoUrl: 'https://x/img.jpg' });
    record('V3 create ใหม่ → สำเร็จ', r.json.success === true && r.status === 200, 'id=' + (r.json.id || ''));
    const newId = r.json.id;

    // duplicate — บัตรเดิมวันเดียวกัน → ต้องบล็อก 409
    r = await apiPost({ name: 'บุคลากร หนึ่ง', ticketNo: ticket, department: 'OFM', timeType: 'เข้างาน', vehicleType: 'รถจักรยานยนต์' });
    record('V4 ticket ซ้ำ → 409 + duplicate + existing', r.status === 409 && r.json.success === false && r.json.duplicate === true && !!r.json.existing && r.json.existing.id === newId, 'status=' + r.status + ' existingId=' + (r.json.existing ? r.json.existing.id : 'none'));

    // updateStatus
    r = await apiGet('updateStatus', token, { id: newId, status: 'อนุมัติ' });
    record('V5 updateStatus → สำเร็จ', r.json.success === true, '');
    r = await apiGet('getAll', token);
    const upd = (r.json.data || []).find(x => x.id === newId);
    record('V6 getAll → สถานะเปลี่ยน', !!upd && upd.status === 'อนุมัติ', 'status=' + (upd ? upd.status : 'none'));

    // updateDiscount
    r = await apiGet('updateDiscount', token, { id: newId, discount: '9' });
    record('V7 updateDiscount → สำเร็จ', r.json.success === true, '');
    r = await apiGet('getAll', token);
    const upd2 = (r.json.data || []).find(x => x.id === newId);
    record('V8 getAll → discount=9', !!upd2 && upd2.discount === '9', 'discount=' + (upd2 ? upd2.discount : 'none'));

    // delete
    r = await apiGet('delete', token, { id: newId });
    record('V9 delete → สำเร็จ', r.json.success === true, '');
    r = await apiGet('getAll', token);
    record('V10 getAll → ลบแล้ว (ไม่พบ id)', !(r.json.data || []).some(x => x.id === newId), 'count=' + (r.json.data || []).length);

    // create ไร้ token (สาธารณะ) ยังทำงาน
    r = await apiPost({ name: 'คนผ่านทาง', ticketNo: '99887766554433221' });
    record('V11 create สาธารณะ (ไม่ล็อกอิน) → สำเร็จ', r.json.success === true, 'id=' + (r.json.id || ''));
  } catch (e) {
    record('TEST RUNNER ERROR', false, e.message);
  } finally {
    child.kill();
  }

  const failed = results.filter(x => !x.ok);
  const unitFailed = unitBad > 0;
  console.log('\n===== สรุป =====');
  console.log('unit bkkDay: ' + unitOk + '/' + (unitOk + unitBad) + ' ผ่าน');
  console.log('E2E mock: ' + (results.length - failed.length) + '/' + results.length + ' ผ่าน');
  if (failed.length) console.log('ล้มเหลว: ' + failed.map(f => f.name).join(' | '));
  // ⚠️ เรียก process.exit(1) เฉพาะตอน fail เท่านั้น — ตอนสำเร็จปล่อยให้ process จบเอง
  //    (call process.exit(0) พร้อมกับ child.kill() ที่ยัง pending บน Windows
  //     → libuv throw "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)")
  if (failed.length || unitFailed) process.exit(1);
}

main();
