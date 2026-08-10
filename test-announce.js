// ===================================================================
// test-announce.js — เทสต์ initAnnounce() (ประกาศแบนเนอร์) ด้วย DOM mock
// วิธีใช้: node test-announce.js   → ควรได้ 7 ผ่าน / 0 ไม่ผ่าน
//
// จำลองโครงสร้างจริง: <div id="desk-page-form"> > .card > form#deskForm
//                   <div id="mob-page-form">  > .card > form#mobForm
// ตรวจว่า banner ถูกแทรกใน .card ก่อน form (ไม่ย้าย form หลุดจากการ์ด —
// ซึ่งเป็นบัคที่ทำให้ "แบนเนอร์ไม่แสดงข้อมูล") + ปุ่มปิดทำงาน
// ===================================================================
const fs = require('fs');

// ---- Extract โค้ดจริงจาก index.html ----
// บล็อก: `const ANNOUNCE_TEXT...` ถึง `}` ปิด initAnnounce() (คอลัมน์ 0)
// ครอบ: ANNOUNCE_TEXT, ANNOUNCE_KEY, initAnnounce() — อ้างอิงแค่
//       localStorage/document → mock ได้ครบ ไม่ติด DOM ภายนอก
const html = fs.readFileSync('index.html', 'utf8');
const snippet = html.match(/const ANNOUNCE_TEXT = '.*?'[\s\S]*?^}/m)[0];
if (!snippet.includes('initAnnounce')) {
  console.error('❌ ไม่พบ initAnnounce() ใน index.html — ตรวจ regex extract อีกที');
  process.exit(1);
}

// ---- DOM mock (พอเพียงกับที่ initAnnounce ใช้) ----
function makeEl(tag) {
  return {
    tag, className: '', type: '', textContent: '', attrs: {}, children: [], parentNode: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] ?? null; },
    appendChild(ch) { ch.parentNode = this; this.children.push(ch); return ch; },
    insertBefore(n, ref) {
      if (n.parentNode) n.parentNode.children = n.parentNode.children.filter(c => c !== n);
      n.parentNode = this;
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(n); else this.children.splice(i, 0, n);
      return n;
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter(c => c !== this);
        this.parentNode = null;
      }
    },
    querySelector(sel) { return sel === 'form' ? this._form : null; }
  };
}

// สร้าง DOM ตามโครงสร้างจริง (page > .card > form) — ใหม่ทุก test
const buildDom = () => {
  const pages = {};
  ['desk-page-form', 'mob-page-form'].forEach(id => {
    const page = makeEl('div');
    const card = makeEl('div'); card.className = 'card'; page.appendChild(card);
    const form = makeEl('form'); form._name = id === 'desk-page-form' ? 'deskForm' : 'mobForm';
    card.appendChild(form);
    page._form = form; // page.querySelector('form') เจอ form ที่ซ้อนใน card
    card._form = form; // เทสต์อ่าน card._form ตรงๆ
    pages[id] = page;
  });
  return pages;
};

const run = (pages, storage) => {
  const document = { getElementById: id => pages[id] ?? null, createElement: tag => makeEl(tag) };
  const localStorage = {
    getItem: k => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  };
  return new Function('document', 'localStorage', snippet + '; return {initAnnounce, ANNOUNCE_TEXT};')
    (document, localStorage);
};

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; console.log('✅ PASS', name); }
    else { fail++; console.log('❌ FAIL', name); }
  };
  const cardOf = (pages, id) => pages[id].children[0]; // .card
  const bannerOf = card => card.children.find(c => c.className === 'announce-banner');

  // T1: banner ถูกแทรกใน .card ก่อน form — form ยังอยู่ในการ์ด (บัคเดิมพังตรงนี้)
  { const pages = buildDom(); const storage = {};
    const api = run(pages, storage); api.initAnnounce();
    for (const id of ['desk-page-form', 'mob-page-form']) {
      const card = cardOf(pages, id); const form = card._form;
      const b = bannerOf(card);
      check(`T1 ${id}: banner อยู่ใน .card ก่อน form`, b != null && card.children[0] === b && card.children[1] === form);
      check(`T1b ${id}: form.parentNode ยังเป็น .card (ไม่ถูกย้าย)`, form.parentNode === card);
    }
  }

  // T2: เนื้อหา banner ถูกต้อง (role=status, ข้อความ = ANNOUNCE_TEXT)
  { const pages = buildDom(); const storage = {};
    const api = run(pages, storage); api.initAnnounce();
    const card = cardOf(pages, 'desk-page-form'); const b = bannerOf(card);
    const textEl = b.children.find(c => c.className === 'announce-text');
    const closeBtn = b.children.find(c => c.className === 'announce-close');
    check('T2 banner: role=status + ข้อความถูก + มีปุ่มปิด', b.getAttribute('role') === 'status'
      && textEl && textEl.textContent === api.ANNOUNCE_TEXT && closeBtn && closeBtn.textContent === '✕');
  }

  // T3: กดปิด → บันทึก localStorage + banner ถูกลบ
  { const pages = buildDom(); const storage = {};
    const api = run(pages, storage); api.initAnnounce();
    const b = bannerOf(cardOf(pages, 'desk-page-form'));
    const closeBtn = b.children.find(c => c.className === 'announce-close');
    closeBtn.onclick();
    check('T3 ปิดแล้ว: sp_announce_dismissed=1 + banner ถูก remove', storage['sp_announce_dismissed'] === '1' && b.parentNode === null);
  }

  // T4: ปิดแล้วโหลดหน้าใหม่ → ไม่แทรกซ้ำ
  { const pages = buildDom(); const storage = { sp_announce_dismissed: '1' };
    const api = run(pages, storage); api.initAnnounce();
    check('T4 dismissed แล้ว → ไม่แทรก banner (children เหลือแค่ form)', cardOf(pages, 'desk-page-form').children.length === 1 && cardOf(pages, 'mob-page-form').children.length === 1);
  }

  // T5: ANNOUNCE_TEXT ว่าง → ข้ามทั้งหมด (ไม่แทรก banner)
  { const pages = buildDom(); const storage = {};
    const emptySnippet = snippet.replace(/const ANNOUNCE_TEXT = '.*?'/, "const ANNOUNCE_TEXT = ''");
    const r = new Function('document', 'localStorage', emptySnippet + '; return {initAnnounce};')
      ({ getElementById: id => pages[id], createElement: () => makeEl('div') }, storage);
    r.initAnnounce();
    check('T5 ANNOUNCE_TEXT=ว่าง → children เหลือแค่ form (ไม่มี banner)',
      cardOf(pages, 'desk-page-form').children.length === 1 && cardOf(pages, 'mob-page-form').children.length === 1);
  }

  // T6: page หรือ form หาย (โครงสร้าง HTML เปลี่ยน) → ไม่ throw
  { const storage = {};
    const api = run({}, storage);
    try { api.initAnnounce(); check('T6 หา page ไม่เจอ → ไม่ throw', true); }
    catch (e) { check('T6 หา page ไม่เจอ → ไม่ throw', false); }
    const partial = buildDom(); delete partial['mob-page-form']._form;
    try { run(partial, {}); check('T6b form หายในหน้าเดียว → หน้าเดียวยังทำงาน', true); }
    catch (e) { console.log('   ⚠️ T6b error:', e && e.message); check('T6b form หายในหน้าเดียว → หน้าเดียวยังทำงาน', false); }
  }

  console.log(`\n===== สรุป initAnnounce DOM test =====`);
  console.log(`${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
