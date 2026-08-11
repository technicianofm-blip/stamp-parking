// ===================================================================
// test-moblogout.js — เทสต์ setConn() อัปเดตสถานะล็อกอิน + ปุ่มออกจากระบบ
// วิธีใช้: node test-moblogout.js   → ควรได้ 11 ผ่าน / 0 ไม่ผ่าน
//
// ปัญหาที่แก้: ปุ่ม 🚪 ออกจากระบบ อยู่แค่ใน sidebar (desktop layout) —
//   มือถือไม่มีปุ่มเลย (mobile layout มีแค่ logo + จุดเชื่อมต่อ + ปุ่มธีม)
//   → เพิ่มแถบ .mob-auth ใต้ header (ชื่อผู้ใช้ + ปุ่มออกจากระบบ)
//   แล้วให้ setConn() อัปเดตทั้ง desk + mob พร้อมกัน
//
// ดึง setConn() จริงจาก index.html (จับวงเล็บปีกกาที่สมดุล) มา eval
// ใน sandbox พร้อม document mock (getElementById คืน element ตาม id)
// + inject getToken()/getMe() — ตรวจว่า:
//   T1 ล็อกอิน (มี token + ชื่อ) → desk+mob โชว์ flex + label ชื่อผู้ใช้
//   T2 ไม่ล็อกอิน             → desk+mob ซ่อน (none) แม้ connection on
//   T3 ล็อกอิน + connection off → แถบ auth ยังโชว์ (auth แยกจาก connection)
//   T4 getMe ไม่มีชื่อ → label ข้อความเริ่มต้น
//   T5 จุดเชื่อมต่อ desktop/mobile + offline bar ยังทำงาน (regression)
// ===================================================================
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const script = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map(s => s.replace(/<\/?script>/g, ''))
  .find(s => s.includes('function setConn('));
if (!script) {
  console.error('❌ ไม่พบ setConn() ใน index.html — ตรวจ extract อีกที');
  process.exit(1);
}

// จับบล็อก function setConn(on){ ... } — นับปีกกาให้สมดุล
const s0 = script.indexOf('function setConn(');
const open = script.indexOf('{', s0);
let depth = 0;
let e0 = open;
for (let i = open; i < script.length; i++) {
  if (script[i] === '{') depth++;
  else if (script[i] === '}') { depth--; if (depth === 0) { e0 = i + 1; break; } }
}
const block = script.slice(s0, e0);

// ---- Sandbox ----
function makeEl() {
  return {
    style: {}, className: '', textContent: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } }
  };
}
const els = {};
const document = { getElementById: (id) => { if (!els[id]) els[id] = makeEl(); return els[id]; } };

const build = (getToken, getMe) =>
  new Function('document', 'getToken', 'getMe', block + '; return setConn;')(document, getToken, getMe);

// ---- Tests ----
let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log('✅ PASS', name); }
  else { fail++; console.log('❌ FAIL', name); }
};
const fresh = () => { Object.keys(els).forEach(k => { els[k] = makeEl(); }); };

// T1: ล็อกอินแล้ว (token + displayName) → แถบทั้งสองโชว์ + label ชื่อผู้ใช้
fresh();
const setConn1 = build(() => 'token123', () => ({ displayName: 'Admin OFM' }));
setConn1(true);
check('T1 ล็อกอิน → deskAuthStatus โชว์ flex', els['deskAuthStatus'].style.display === 'flex');
check('T1b ล็อกอิน → mobAuthStatus โชว์ flex (เดิมหายไปมือถือ — บัคที่แก้)', els['mobAuthStatus'].style.display === 'flex');
check('T1c label แสดงชื่อผู้ใช้ (desk)', els['deskAuthLabel'].textContent === '🔒 Admin OFM');
check('T1d label แสดงชื่อผู้ใช้ (mob)', els['mobAuthLabel'].textContent === '🔒 Admin OFM');

// T2: ไม่ได้ล็อกอิน → แถบทั้งสองซ่อน แม้ connection on
fresh();
const setConn2 = build(() => null, () => null);
setConn2(true);
check('T2 ไม่ล็อกอิน → desk ซ่อน', els['deskAuthStatus'].style.display === 'none');
check('T2b ไม่ล็อกอิน → mob ซ่อน', els['mobAuthStatus'].style.display === 'none');

// T3: ล็อกอินแต่ connection off → แถบ auth ยังโชว์ (auth แยกจาก connection)
fresh();
const setConn3 = build(() => 'tok', () => ({ displayName: 'A' }));
setConn3(false);
check('T3 ล็อกอิน + connection off → mob ยังโชว์', els['mobAuthStatus'].style.display === 'flex');

// T4: getMe ไม่มีชื่อ → label ข้อความเริ่มต้น
fresh();
const setConn4 = build(() => 'tok', () => null);
setConn4(true);
check('T4 getMe null → label ข้อความเริ่มต้น', els['mobAuthLabel'].textContent === '🔒 เข้าสู่ระบบแล้ว');

// T5: จุดเชื่อมต่อ + offline bar ยังทำงาน (regression กันไปแตะของเดิม)
fresh();
const setConn5 = build(() => 'tok', () => null);
setConn5(true);
check('T5 on → จุด desktop/mobile = on', els['deskConnDot'].className === 'dot on' && els['mobConnDot'].className === 'conn-dot on');
check('T5b on → offline bar ไม่มี class show', !els['mobOffline'].classList._s.has('show'));
setConn5(false);
check('T5c off → จุด = off + offline bar แสดง', els['deskConnDot'].className === 'dot off' && els['mobConnDot'].className === 'conn-dot off' && els['mobOffline'].classList._s.has('show'));

console.log(`\n===== สรุป setConn auth-status test =====`);
console.log(`${pass} ผ่าน / ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
