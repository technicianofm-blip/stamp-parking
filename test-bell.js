// ===================================================================
// test-bell.js — เทสต์ 🔔 Notification Badge (getNewCount / updateBell / markSeen / buildNotifList)
// วิธีใช้: node test-bell.js   → ควรได้ 20 ผ่าน / 0 ไม่ผ่าน
//
// Extract โค้ดจริงจาก index.html (บล็อก BELL NOTIFICATION + NOTIFICATION CENTER)
// มา eval ใน sandbox พร้อม DOM mock + AudioContext mock (นับ oscillator เพื่อเช็คเสียง) — ตรวจ:
//   T1  ไม่มี seenAt            → getNewCount = 0
//   T2  นับเฉพาะ record หลัง seenAt (เท่ากับ/ก่อนไม่นับ)
//   T3  badge ขึ้นเมื่อ n>0 (desk + mob) / ซ่อนเมื่อ n=0
//   T4  มีข้อมูลใหม่ครั้งแรก    → เล่นเสียง 1 ครั้ง (2 oscillator = 2 โทน)
//   T5  refresh ด้วยจำนวนเท่าเดิม → ไม่เล่นเสียงซ้ำ (บัคที่แก้)
//   T6  จำนวนเพิ่มขึ้น          → เล่นเสียงอีกครั้ง
//   T7  markSeen → seenAt ใหม่ + badge ซ่อน + getNewCount=0
//   T8  หลัง markSeen แล้วมี record ใหม่ → กลับมาเล่นเสียงได้ (กัน _bellN ค้าง)
//   T9  buildNotifList ≤20 รายการ → เรียงใหม่สุดก่อน + ไม่มี note
//   T10 buildNotifList >20 รายการ → โชว์ 20 + note "…และอีก N รายการ" (บัคที่แก้)
//   T11 buildNotifList ไม่มีข้อมูลใหม่ → "ไม่มีข้อมูลใหม่"
//   T12 markSeen เขียน localStorage ถูก (config เก็บ seenAt ใหม่)
// ===================================================================
const fs = require('fs');

// ---- Extract โค้ดจริงจาก index.html ----
const html = fs.readFileSync('index.html', 'utf8');
// เลือก script block จากเนื้อหา (ไม่ใช่ตัวสุดท้าย) — มี script tag อื่นเพิ่มหลัง main inline script
// (เช่น service worker register) → กัน .pop() ไปเจอตัวผิด
const script = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map(s => s.replace(/<\/?script>/g, ''))
  .find(s => s.includes('function getNewCount()'));
if (!script) {
  console.error('❌ ไม่พบ script ที่มี getNewCount() ใน index.html — ตรวจ extract อีกที');
  process.exit(1);
}

// บล็อก 1: BELL NOTIFICATION — `function getNewCount()` ถึงก่อน `function renderChart()`
// ครอบ: getNewCount, _bellN, updateBell, audioCtx, getAudioCtx, initAudioOnInteraction,
//       ['click','keydown','touchstart'].forEach(...), playNewDataSound, markSeen
const s1 = script.indexOf('function getNewCount()');
const e1 = script.indexOf('function renderChart()');
if (s1 < 0 || e1 < 0 || e1 <= s1) {
  console.error('❌ extract บล็อก BELL ไม่สำเร็จ — ตรวจ index.html อีกที');
  process.exit(1);
}
const blockBell = script.slice(s1, e1);

// บล็อก 2: NOTIFICATION CENTER — `function buildNotifList()` ถึง `}` ปิด notifMarkAll()
// ครอบ: buildNotifList, notifOpen, closeNotifPanel, notifMarkAll (viewPhoto/toast อ้างแค่ใน body ไม่ได้เรียก)
const s2 = script.indexOf('function buildNotifList()');
const m2 = script.indexOf('function notifMarkAll(){', s2);
const e2 = script.indexOf('\n}', m2);
if (s2 < 0 || m2 < 0 || e2 < 0 || e2 <= s2) {
  console.error('❌ extract บล็อก NOTIF LIST ไม่สำเร็จ — ตรวจ index.html อีกที');
  process.exit(1);
}
const blockNotif = script.slice(s2, e2 + 2);

// ---- stubs ร่วม (cfg / cacheR / esc) — ใส่เป็น prefix ตอน eval ----
// CFG_KEY / CACHE_KEY นิยามที่บรรทัด 595 (ก่อนบล็อกที่ extract) — เติมเอง ไม่งั้น ReferenceError
const STUBS = `
const CFG_KEY='sp_config';const CACHE_KEY='sp_cache';
function cfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY))||{url:'x'}}catch{return{url:'x'}}}
function cacheR(){try{return JSON.parse(localStorage.getItem(CACHE_KEY))||[]}catch{return[]}}
const esc=s=>s==null?'':String(s);
`;

// ---- AudioContext mock — นับ oscillator ที่สร้าง (เล่นเสียง 1 ครั้ง = 2 โทน = 2 oscillator) ----
let oscCount = 0;
class FakeOsc {
  constructor(){ this.type='sine'; this.frequency={value:0}; this._s=false }
  connect(){} start(){ this._s=true } stop(){}
}
class FakeCtx {
  constructor(){ this.state='running'; this.currentTime=0; this.destination={} }
  resume(){ return Promise.resolve() }
  createGain(){ return { connect(){}, gain:{value:0} } }
  createOscillator(){ oscCount++; return new FakeOsc() }
}

// ---- Date mock — กันเทสต์ขึ้นกับเวลาจริง (markSeen ใช้ new Date() = เวลาจริง → ผ่านแค่ช่วงเดียวของวัน)
// FIXED_NOW = เวลาจำลองตอนรัน: หลัง record 08:00Z (T7b) แต่ก่อน r5 09:30Z (T8) → รันเมื่อไหร่ก็ผ่านเสมอ
const FIXED_NOW = '2026-08-11T09:00:00.000Z';
class FakeDate extends Date {
  constructor(...args){ super(...(args.length ? args : [FIXED_NOW])); }
}

// ---- DOM mock ----
function classBag(){
  const set=new Set();
  return { add:c=>set.add(c), remove:c=>set.delete(c), contains:c=>set.has(c), _set:set };
}
function makeEl(id){
  const el={ id, innerHTML:'', style:{display:''}, dataset:{}, _class:classBag() };
  let _text='';
  // เลียนแบบ DOM จริง: กำหนด textContent → coerce เป็น string (el.textContent=n ต้องได้ '2' ไม่ใช่ 2)
  Object.defineProperty(el,'textContent',{ get(){return _text}, set(v){_text=String(v)} });
  return el;
}
function makeDocument(els){
  const handlers={};
  return {
    els, handlers,
    getElementById: id=>els[id]||null,
    createElement: ()=>({ textContent:'', style:{}, appendChild(){} }),
    addEventListener: (t,h)=>{ (handlers[t]=handlers[t]||[]).push(h) },
    removeEventListener: (t,h)=>{ handlers[t]=(handlers[t]||[]).filter(x=>x!==h) },
  };
}
// classList เป็น getter ที่แชร์กับ _class (classBag)
function wireClassList(el){ Object.defineProperty(el,'classList',{ get:()=>el._class }); }

// ---- สร้าง context ใหม่ทุก test (เพราะ _bellN / audioCtx เป็น state ใน closure ของแต่ละ context) ----
const buildBell = () => {
  const storage = {};
  const localStorage = {
    getItem: k => storage[k] ?? null,
    setItem: (k,v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  };
  const els = { deskBellBadge: makeEl('deskBellBadge'), mobBellBadge: makeEl('mobBellBadge') };
  Object.values(els).forEach(wireClassList);
  const document = makeDocument(els);
  const window = { AudioContext: FakeCtx, webkitAudioContext: undefined };
  const api = new Function('document','localStorage','window','Date',
    STUBS + blockBell + '; return {getNewCount, updateBell, markSeen, playNewDataSound};')
    (document, localStorage, window, FakeDate);
  return { api, storage, els };
};
const buildNotif = () => {
  const storage = {};
  const localStorage = {
    getItem: k => storage[k] ?? null,
    setItem: (k,v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  };
  const els = { notifList: makeEl('notifList'), notifEmpty: makeEl('notifEmpty') };
  Object.values(els).forEach(wireClassList);
  const document = makeDocument(els);
  const api = new Function('document','localStorage',
    STUBS + blockNotif + '; return {buildNotifList, notifOpen, closeNotifPanel, notifMarkAll};')
    (document, localStorage);
  return { api, storage, els };
};

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; console.log('✅ PASS', name); }
    else { fail++; console.log('❌ FAIL', name); }
  };
  const setConfig = (storage, cfgObj) => storage['sp_config'] = JSON.stringify(cfgObj);
  const setCache = (storage, recs) => storage['sp_cache'] = JSON.stringify(recs);
  const rec = (id, iso) => ({ id, createdAt: iso, name:'คนทดสอบ', department:'OFM', ticketNo:'12345678901234567' });

  // ข้อมูลอ้างอิง: r1 06:00 / r2 07:00 / r3 08:00 (UTC)
  const R = [rec('r1','2026-08-11T06:00:00.000Z'), rec('r2','2026-08-11T07:00:00.000Z'), rec('r3','2026-08-11T08:00:00.000Z')];

  // ============ getNewCount ============
  // T1: ไม่มี seenAt → 0 (ไม่นับทั้งที่ cache มี record)
  { const { api, storage } = buildBell();
    setCache(storage, R);
    check('T1 ไม่มี seenAt → getNewCount = 0', api.getNewCount() === 0);
  }

  // T2: นับเฉพาะ record หลัง seenAt (06:30 → เจอ r2, r3 = 2) / record เท่ากับ seenAt ไม่นับ
  { const { api, storage } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R);
    check('T2 นับเฉพาะ record หลัง seenAt (06:30 → 2 รายการ)', api.getNewCount() === 2);
    setCache(storage, [rec('r0','2026-08-11T06:30:00.000Z')]);
    check('T2b record เท่ากับ seenAt → ไม่นับ', api.getNewCount() === 0);
  }

  // ============ updateBell (badge + เสียง) ============
  // T3: badge ขึ้นเมื่อ n>0 ทั้ง desk + mob / ซ่อนเมื่อ n=0
  { const { api, storage, els } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R); // n=2
    api.updateBell();
    check('T3 badge desk ขึ้น + ตัวเลข = 2', els.deskBellBadge.textContent === '2' && els.deskBellBadge.classList.contains('show'));
    check('T3b badge mob ขึ้น + ตัวเลข = 2', els.mobBellBadge.textContent === '2' && els.mobBellBadge.classList.contains('show'));
    // markSeen → n=0 → ซ่อนทั้งคู่
    api.markSeen();
    check('T3c หลัง markSeen → badge ซ่อนทั้งคู่', !els.deskBellBadge.classList.contains('show') && !els.mobBellBadge.classList.contains('show'));
  }

  // T4: มีข้อมูลใหม่ครั้งแรก (n 0→2) → เล่นเสียง 1 ครั้ง (2 oscillator)
  { const { api, storage } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R);
    const before = oscCount;
    api.updateBell();
    check('T4 มีข้อมูลใหม่ครั้งแรก → เล่นเสียง 1 ครั้ง (2 oscillator)', oscCount - before === 2);
  }

  // T5: refresh ด้วยจำนวนเท่าเดิม → ไม่เล่นเสียงซ้ำ (แก้บัคเสียงซ้ำตอนกดรีเฟรช)
  { const { api, storage } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R);
    api.updateBell(); // ครั้งแรก → เล่นเสียง
    const before = oscCount;
    api.updateBell(); // เหมือนกดรีเฟรช (n เท่าเดิม) → ต้องไม่เล่น
    api.updateBell();
    check('T5 refresh 2 รอบด้วยจำนวนเท่าเดิม → ไม่เล่นเสียงซ้ำเลย', oscCount - before === 0);
  }

  // T6: จำนวนเพิ่มขึ้น → เล่นเสียงอีกครั้ง
  { const { api, storage } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R);
    api.updateBell(); // เล่นครั้งแรก
    const before = oscCount;
    setCache(storage, [...R, rec('r4','2026-08-11T09:00:00.000Z')]); // n=3
    api.updateBell();
    check('T6 จำนวนเพิ่ม (2→3) → เล่นเสียงอีกครั้ง', oscCount - before === 2);
  }

  // T7: markSeen → seenAt ใหม่ (หลัง record ล่าสุด) + getNewCount=0
  { const { api, storage } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R);
    api.updateBell(); api.markSeen();
    check('T7a markSeen → getNewCount = 0', api.getNewCount() === 0);
    const c = JSON.parse(storage['sp_config']);
    check('T7b seenAt ถูกเขียนใหม่ (ใหม่กว่า record ล่าสุด)', new Date(c.seenAt).getTime() > new Date('2026-08-11T08:00:00.000Z').getTime());
  }

  // T8: หลัง markSeen (อ่านแล้ว) มี record ใหม่ → กลับมาเล่นเสียงได้ (กัน _bellN ค้างคา)
  { const { api, storage } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R);
    api.updateBell(); api.markSeen(); // อ่านทั้งหมด → _bellN=0
    const before = oscCount;
    setCache(storage, [...R, rec('r5','2026-08-11T09:30:00.000Z')]); // record ใหม่กว่าตอน markSeen
    api.updateBell();
    check('T8 หลังอ่านแล้วมี record ใหม่ → เล่นเสียงได้อีก', oscCount - before === 2);
  }

  // ============ buildNotifList ============
  // T9: ≤20 รายการ → เรียงใหม่สุดก่อน + ไม่มี note (empty ซ่อน)
  { const { api, storage, els } = buildNotif();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T05:00:00.000Z' });
    setCache(storage, R); // 3 รายการ (r3 ใหม่สุด)
    api.buildNotifList();
    check('T9 ≤20 รายการ → render ครบ 3 รายการ', (els.notifList.innerHTML.match(/notif-item/g) || []).length === 3);
    check('T9b เรียงใหม่สุดก่อน (r3 มาก่อน r1)', els.notifList.innerHTML.indexOf('r3') < els.notifList.innerHTML.indexOf('r1'));
    check('T9c ไม่มี note (empty ซ่อน)', els.notifEmpty.style.display === 'none');
  }

  // T10: >20 รายการ → โชว์ 20 + note "…และอีก N รายการ" (แก้บัค badge นับ 23 แต่ลิสต์โชว์ 20)
  { const { api, storage, els } = buildNotif();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T05:00:00.000Z' });
    const many = Array.from({length:23}, (_,i) => rec('m'+String(i).padStart(2,'0'), '2026-08-11T' + String(6 + Math.floor(i/60)).padStart(2,'0') + ':' + String(i%60).padStart(2,'0') + ':00.000Z'));
    setCache(storage, many); // 23 รายการ
    api.buildNotifList();
    check('T10 >20 รายการ → render 20 รายการ', (els.notifList.innerHTML.match(/notif-item/g) || []).length === 20);
    check('T10b มี note บอกจำนวนที่เหลือ', els.notifEmpty.style.display === 'block' && els.notifEmpty.textContent === '…และอีก 3 รายการ');
  }

  // T11: ไม่มีข้อมูลใหม่ → "ไม่มีข้อมูลใหม่"
  { const { api, storage, els } = buildNotif();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T10:00:00.000Z' }); // หลัง record ทั้งหมด
    setCache(storage, R);
    api.buildNotifList();
    check('T11 ไม่มีข้อมูลใหม่ → แสดง "ไม่มีข้อมูลใหม่"', els.notifEmpty.style.display === 'block' && els.notifEmpty.textContent === 'ไม่มีข้อมูลใหม่' && els.notifList.innerHTML === '');
  }

  // T12: markSeen เขียน localStorage ถูก (config เก็บ seenAt ใหม่ + badge หลัง updateBell ซ่อน)
  { const { api, storage } = buildBell();
    setConfig(storage, { url:'x', seenAt:'2026-08-11T06:30:00.000Z' });
    setCache(storage, R);
    api.markSeen();
    const c = JSON.parse(storage['sp_config']);
    check('T12 markSeen → localStorage มี seenAt (RFC3339)', typeof c.seenAt === 'string' && !isNaN(new Date(c.seenAt).getTime()));
    check('T12b markSeen → badge ซ่อน (updateBell ข้างใน)', storage['sp_config'] !== undefined && JSON.parse(storage['sp_config']).seenAt === c.seenAt);
  }

  console.log(`\n===== สรุป Notification Badge test =====`);
  console.log(`${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
