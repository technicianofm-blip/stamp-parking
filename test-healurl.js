// ===================================================================
// test-healurl.js — เทสต์ logic healUrl() (self-heal URL ของ GAS backend)
// วิธีใช้: node test-healurl.js   → ควรได้ 20 ผ่าน / 0 ไม่ผ่าน
//
// ดึงโค้ดจริงจาก index.html (บล็อก constants + cfg + gasUrl + healUrl)
// มา eval ใน sandbox แล้วจำลอง localStorage/fetch — ตรวจว่า:
//   T1 URL ตาย (ใน DEAD_GAS_URLS) → heal แบบ no-probe ทันที (0 request)
//   T2 URL = GAS_URL_DEFAULT     → fast-path 0 request (ไม่ช้า)
//   T3 URL unknown ที่ใช้ได้      → probe 1 ครั้ง แล้วคงเดิม
//   T4 localhost                 → ข้ามทั้งหมด
//   T5 URL ที่ probe แล้วล้ม      → ลอง default → heal + เขียน localStorage
//   T6 URL คืน 401/token error   → ข้าม heal (ถือว่า URL ยังใช้ได้)
//   T7 URL ตาย + default คืน 401 (ผู้ใช้ไม่ล็อกอิน) → ยังต้อง heal
//      (บัคเก่า: fb.success=false → สรุปผิดว่า default ตาย → ไม่ heal → POST ไป URL ตาย)
// ===================================================================
const fs = require('fs');

// ---- Extract โค้ดจริงจาก index.html ----
// บล็อก: `const GAS_URL_DEFAULT...` ถึง `}` ปิด healUrl() (คอลัมน์ 0)
// ครอบ: GAS_URL_DEFAULT, DEAD_GAS_URLS, cfg(), _urlOverride, gasUrl(),
//       _urlHealTried, healUrl() — ไม่ติด DOM อื่น
const html = fs.readFileSync('index.html', 'utf8');
// เลือก script block จากเนื้อหา (ไม่ใช่ตัวสุดท้าย) — มี script tag อื่นเพิ่มหลัง main inline script
// (เช่น service worker register) → กัน .pop() ไปเจอตัวผิด
const script = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map(s => s.replace(/<\/?script>/g, ''))
  .find(s => s.includes('GAS_URL_DEFAULT') && s.includes('healUrl'));
if (!script) {
  console.error('❌ ไม่พบ script ที่มี GAS_URL_DEFAULT/healUrl ใน index.html — ตรวจ extract อีกที');
  process.exit(1);
}
// CFG_KEY นิยามที่บรรทัด 595 (ก่อน GAS_URL_DEFAULT) — cfg() ใน healUrl ใช้มัน
// แต่อยู่นอกช่วง extract → ต้องเติมเอง ไม่งั้น ReferenceError → cfg() ตก catch → คืน default เสมอ (เทสต์ผิดทั้งก้อน)
const snippet = "const CFG_KEY = 'sp_config';\n" + script.match(/const GAS_URL_DEFAULT = '.*?'[\s\S]*?^}/m)[0];
if (!snippet.includes('healUrl')) {
  console.error('❌ ไม่พบ healUrl() ใน index.html — ตรวจ regex extract อีกที');
  process.exit(1);
}

// ---- Sandbox environment ----
let storage = {};
const localStorage = {
  getItem: k => storage[k] ?? null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: k => { delete storage[k]; }
};
let calls = []; // เก็บประวัติ call ของฟังก์ชัน stub เพื่อ assert
const toast = (...a) => calls.push(['toast', ...a]);
const syncSetupInputs = () => calls.push(['syncSetupInputs']);
const updateSetupUI = () => calls.push(['updateSetupUI']);
const get = async (action) => { calls.push(['get', action]); return {success: true, data: []}; };

// สร้าง context ใหม่ทุก test (เพราะ _urlHealTried เป็น state ใน closure ของแต่ละ context)
const build = () => {
  const ctx = new Function(
    'localStorage', 'toast', 'syncSetupInputs', 'updateSetupUI', 'get',
    snippet + '; return {healUrl, cfg, gasUrl, GAS_URL_DEFAULT, DEAD_GAS_URLS};'
  );
  return ctx(localStorage, toast, syncSetupInputs, updateSetupUI, get);
};

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; console.log('✅ PASS', name); }
    else { fail++; console.log('❌ FAIL', name); }
  };

  // T1: URL ตาย (ใน DEAD_GAS_URLS) → heal no-probe ทันที
  { const api = build();
    storage['sp_config'] = JSON.stringify({url: api.DEAD_GAS_URLS[0]});
    calls = [];
    await api.healUrl();
    check('T1 URL ตายในลิสต์ → ไม่เรียก get() เลย (no-probe)', !calls.some(c => c[0] === 'get'));
    check('T1b heal แล้ว cfg().url เปลี่ยนเป็น default', api.cfg().url === api.GAS_URL_DEFAULT);
    check('T1c gasUrl() คืน default', api.gasUrl() === api.GAS_URL_DEFAULT);
    check('T1d localStorage ถูกเขียน URL ใหม่', JSON.parse(storage['sp_config']).url === api.GAS_URL_DEFAULT);
    check('T1e มี toast + syncSetupInputs + updateSetupUI', calls.some(c => c[0] === 'toast') && calls.some(c => c[0] === 'syncSetupInputs') && calls.some(c => c[0] === 'updateSetupUI'));
  }

  // T2: URL = default ปัจจุบัน → fast-path 0 request (ไม่ช้าขึ้น)
  { const api = build();
    storage['sp_config'] = JSON.stringify({url: api.GAS_URL_DEFAULT});
    calls = [];
    await api.healUrl();
    check('T2 URL=default → ไม่เรียก get() (fast-path 0 request)', !calls.some(c => c[0] === 'get'));
    check('T2b ไม่มี toast (ไม่ต้อง heal)', !calls.some(c => c[0] === 'toast'));
  }

  // T3: URL ไม่รู้จักแต่ใช้ได้ → probe 1 ครั้ง แล้วคงเดิม
  { const api = build();
    storage['sp_config'] = JSON.stringify({url: 'https://script.google.com/macros/s/UNKNOWN_WORKS/exec'});
    calls = [];
    await api.healUrl();
    check('T3 URL unknown ที่ใช้ได้ → เรียก get() probe 1 ครั้ง', calls.filter(c => c[0] === 'get').length === 1);
    check('T3b ไม่เปลี่ยน URL', api.cfg().url === 'https://script.google.com/macros/s/UNKNOWN_WORKS/exec');
  }

  // T4: localhost → ข้ามทั้งหมด (ไม่ไปแตะ GAS ตัวจริง)
  { const api = build();
    storage['sp_config'] = JSON.stringify({url: 'http://localhost:3005/api/'});
    calls = [];
    await api.healUrl();
    check('T4 localhost → ไม่เรียก get() และไม่เปลี่ยน URL', !calls.some(c => c[0] === 'get') && api.cfg().url === 'http://localhost:3005/api/');
  }

  // T5: URL ที่ probe แล้วล้ม (ไม่อยู่ในลิสต์) → ลอง default → ได้ → heal + เขียน localStorage
  { const getReal = async (action) => {
      calls.push(['get', action]);
      if (calls.filter(c => c[0] === 'get').length === 1) return {success: false, error: 'Could not fetch url: Http failure'};
      return {success: true, data: []};
    };
    const ctx = new Function('localStorage', 'toast', 'syncSetupInputs', 'updateSetupUI', 'get',
      snippet + '; return {healUrl, cfg, gasUrl, GAS_URL_DEFAULT};');
    const api = ctx(localStorage, toast, syncSetupInputs, updateSetupUI, getReal);
    storage['sp_config'] = JSON.stringify({url: 'https://script.google.com/macros/s/BROKEN_UNKNOWN/exec'});
    calls = [];
    await api.healUrl();
    check('T5 URL broken → probe 2 ครั้ง (เดิม+default)', calls.filter(c => c[0] === 'get').length === 2);
    check('T5b heal สำเร็จ → cfg เปลี่ยนเป็น default', api.cfg().url === api.GAS_URL_DEFAULT);
    check('T5c localStorage ถูกเขียนใหม่', JSON.parse(storage['sp_config']).url === api.GAS_URL_DEFAULT);
  }

  // T6: URL คืน 401/token error → ข้าม heal (ถือว่า URL ยังใช้ได้ — กันเสีย request เปล่า)
  { const getReal = async () => { calls.push(['get']); return {success: false, error: 'Invalid or missing token'}; };
    const ctx = new Function('localStorage', 'toast', 'syncSetupInputs', 'updateSetupUI', 'get',
      snippet + '; return {healUrl, cfg, gasUrl, GAS_URL_DEFAULT};');
    const api = ctx(localStorage, toast, syncSetupInputs, updateSetupUI, getReal);
    storage['sp_config'] = JSON.stringify({url: 'https://script.google.com/macros/s/VALID_BUT_401/exec'});
    calls = [];
    await api.healUrl();
    check('T6 401/token error → probe 1 ครั้ง แล้วข้าม (ไม่ลอง default)', calls.filter(c => c[0] === 'get').length === 1);
    check('T6b URL ไม่เปลี่ยน', api.cfg().url === 'https://script.google.com/macros/s/VALID_BUT_401/exec');
  }

  // T7: URL ตาย (unknown) + default probe คืน 401 (จำลองผู้ใช้ไม่ล็อกอิน) → ยังต้อง heal
  //     เดิม: fb.success=false → สรุปผิดว่า "default ก็ตาย" → ไม่ heal → POST ไป URL ตาย → Network error
  { const getReal = async (action) => {
      calls.push(['get', action]);
      if (calls.filter(c => c[0] === 'get').length === 1) return {success: false, error: 'Could not fetch url: Http failure'};
      return {success: false, error: 'Unauthorized: Invalid or missing token'};
    };
    const ctx = new Function('localStorage', 'toast', 'syncSetupInputs', 'updateSetupUI', 'get',
      snippet + '; return {healUrl, cfg, gasUrl, GAS_URL_DEFAULT};');
    const api = ctx(localStorage, toast, syncSetupInputs, updateSetupUI, getReal);
    storage['sp_config'] = JSON.stringify({url: 'https://script.google.com/macros/s/DEAD_ANON/exec'});
    calls = [];
    await api.healUrl();
    check('T7 URL ตาย + default probe 401 (anonymous) → เรียก get 2 ครั้ง (เดิม+default)', calls.filter(c => c[0] === 'get').length === 2);
    check('T7b heal สำเร็จ → cfg เปลี่ยนเป็น default (แม้ default คืน 401 = ยังใช้ได้)', api.cfg().url === api.GAS_URL_DEFAULT);
    check('T7c localStorage ถูกเขียน URL ใหม่', JSON.parse(storage['sp_config']).url === api.GAS_URL_DEFAULT);
    check('T7d gasUrl() คืน default (POST ครั้งถัดไปไปที่ default ไม่ใช่ URL ตาย)', api.gasUrl() === api.GAS_URL_DEFAULT);
    check('T7e มี toast แจ้งอัปเดต', calls.some(c => c[0] === 'toast'));
  }

  console.log(`\n===== สรุป healUrl logic test =====`);
  console.log(`${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
