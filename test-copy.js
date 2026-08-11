// ===================================================================
// test-copy.js — เทสต์ copyTicket()/legacyCopyText() (คัดลอกเลขบัตร Ticket)
// วิธีใช้: node test-copy.js   → ควรได้ 13 ผ่าน / 0 ไม่ผ่าน
//
// copyTicket: ลอง navigator.clipboard (async) ก่อน → ล้ม/ไม่มี API → fallback
// legacyCopyText (sync, user gesture): textarea ชั่วคราว + execCommand('copy')
//   — ครอบมือถือรุ่นเก่า (iOS Safari <13.4 / Android WebView / ไม่ใช่ https)
//   — บัคเดิม: copyTicket เรียก navigator.clipboard.writeText ตรงๆ → ถ้าไม่มี API
//     throw แบบ synchronous (จับไม่ทันด้วย .catch) → แตะแล้วเงียบ
// ===================================================================
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
// เลือก script block จากเนื้อหา (ไม่ใช่ตัวสุดท้าย) — มี script tag อื่นเพิ่มหลัง main inline script
const script = (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map(s => s.replace(/<\/?script>/g, ''))
  .find(s => s.includes('function copyTicket('));
if (!script) {
  console.error('❌ ไม่พบ script ที่มี copyTicket() ใน index.html — ตรวจ extract อีกที');
  process.exit(1);
}
const s0 = script.indexOf('function copyTicket(');
const e0 = script.indexOf('function exportCSV', s0);
if (s0 < 0 || e0 < 0 || e0 <= s0) {
  console.error('❌ extract บล็อก copyTicket ไม่สำเร็จ — ตรวจ index.html อีกที');
  process.exit(1);
}
const block = script.slice(s0, e0); // copyTicket + legacyCopyText

// ---- Sandbox ----
let calls = [];
const toast = (...a) => calls.push(a);
let clipMode = 'ok';  // 'ok' = clipboard สำเร็จ | 'reject' = ปฏิเสธ | 'none' = ไม่มี API
let execOk = true;    // ผลของ execCommand('copy')
let execCalls = 0;
let lastTa = null;    // จับ textarea ตัวที่ legacyCopyText สร้าง (เช็คค่า/attr)
const navigator = {
  get clipboard() {
    if (clipMode === 'none') return undefined;
    return { writeText: (t) => clipMode === 'ok' ? Promise.resolve() : Promise.reject(new Error('NotAllowedError')) };
  }
};
const makeTa = () => ({
  value: '', attrs: {}, style: {}, parentNode: null,
  setAttribute(k, v) { this.attrs[k] = v; },
  focus() { this.focused = true; },
  select() { this.selected = true; },
  setSelectionRange(a, b) { this.sel = [a, b]; },
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(c => c !== this);
      this.parentNode = null;
    }
  }
});
const body = {
  children: [],
  appendChild(ch) { ch.parentNode = this; this.children.push(ch); return ch; },
  removeChild(ch) { ch.parentNode = null; this.children = this.children.filter(c => c !== ch); return ch; }
};
const document = {
  body,
  createElement: (tag) => { calls.push(['createElement', tag]); lastTa = makeTa(); return lastTa; },
  execCommand: (cmd) => { execCalls++; return execOk; }
};
const build = () => new Function('navigator', 'document', 'toast', block + '; return {copyTicket, legacyCopyText};')
  (navigator, document, toast);
const flush = () => new Promise(r => setTimeout(r, 0));

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; console.log('✅ PASS', name); }
    else { fail++; console.log('❌ FAIL', name); }
  };

  // T1: clipboard API มี + สำเร็จ → toast ✅ (ไม่ fallback execCommand)
  { clipMode='ok'; execCalls=0; execOk=true; calls=[];
    const api = build();
    api.copyTicket('TK-123');
    await flush();
    check('T1 clipboard สำเร็จ → toast ✅', calls.some(c => c[0]==='✅ คัดลอก TK-123' && c[1]==='s'));
    check('T1b ไม่ fallback execCommand', execCalls === 0);
  }

  // T2: clipboard reject → fallback execCommand สำเร็จ → toast ✅
  { clipMode='reject'; execCalls=0; execOk=true; calls=[];
    const api = build();
    api.copyTicket('TK-456');
    await flush();
    check('T2 clipboard reject → fallback execCommand (1 ครั้ง)', execCalls === 1);
    check('T2b fallback สำเร็จ → toast ✅', calls.some(c => c[0]==='✅ คัดลอก TK-456' && c[1]==='s'));
  }

  // T3: ไม่มี navigator.clipboard (มือถือเก่า) → legacy ตรงๆ (sync) — บัคเดิมตรงนี้
  { clipMode='none'; execCalls=0; execOk=true; calls=[]; lastTa=null;
    const api = build();
    api.copyTicket('TK-789');
    check('T3 ไม่มี clipboard API → fallback execCommand (1 ครั้ง)', execCalls === 1);
    check('T3b → toast ✅ (เดิมเงียบเพราะ throw)', calls.some(c => c[0]==='✅ คัดลอก TK-789' && c[1]==='s'));
    check('T3c textarea ถูกสร้าง + ลบทิ้งหลังคัดลอก (ไม่รั่ว DOM)', !!lastTa && body.children.length===0);
    check('T3d textarea ค่า=ticket + readonly + select ช่วง (iOS)', !!lastTa && lastTa.value==='TK-789' && lastTa.attrs['readonly']==='' && lastTa.selected===true && lastTa.sel && lastTa.sel[0]===0 && lastTa.sel[1]===6);
  }

  // T4: clipboard reject + legacy ล้ม → toast ⚠️
  { clipMode='reject'; execCalls=0; execOk=false; calls=[];
    const api = build();
    api.copyTicket('TK-X');
    await flush();
    check('T4 clipboard reject + legacy ล้ม → toast ⚠️', calls.some(c => c[0]==='⚠️ ไม่สามารถคัดลอก' && c[1]==='e'));
  }

  // T5: ไม่มี clipboard + legacy ล้ม → toast ⚠️ (sync)
  { clipMode='none'; execCalls=0; execOk=false; calls=[];
    const api = build();
    api.copyTicket('TK-Y');
    check('T5 ไม่มี clipboard + legacy ล้ม → toast ⚠️', calls.some(c => c[0]==='⚠️ ไม่สามารถคัดลอก' && c[1]==='e'));
  }

  // T6: execCommand throw (บาง browser) → ไม่ throw, คืน false → toast ⚠️
  { clipMode='none'; execCalls=0; calls=[];
    const doc = { ...document, execCommand: () => { execCalls++; throw new Error('boom'); } };
    const api = new Function('navigator', 'document', 'toast', block + '; return {copyTicket, legacyCopyText};')
      (navigator, doc, toast);
    api.copyTicket('TK-Z');
    check('T6 execCommand throw → ไม่ throw + toast ⚠️', calls.some(c => c[0]==='⚠️ ไม่สามารถคัดลอก' && c[1]==='e'));
  }

  // T7: render — ทั้ง desktop และ mobile ticket td ต้องมี copy wiring (กันลืมอีกฝั่ง)
  { const renderBlock = (script.match(/function render\(\)\{[\s\S]*?^}/m) || [''])[0];
    check('T7 render: มี copyTicket(data-tk) ครบ 2 จุด (desktop+mobile)',
      (renderBlock.match(/onclick="copyTicket\(this\.dataset\.tk\)"/g)||[]).length===2);
    check('T7b render: มี data-tk esc(ticketNo) ครบ 2 จุด (XSS-safe)',
      (renderBlock.match(/data-tk="\$\{esc\(x\.ticketNo\)\}"/g)||[]).length===2);
  }

  console.log(`\n===== สรุป copyTicket logic test =====`);
  console.log(`${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
