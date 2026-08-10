// ===================================================================
// test-announce.js — เทสต์ initAnnounce() (ประกาศแบนเนอร์) ด้วย DOM mock
// วิธีใช้: node test-announce.js   → ควรได้ 11 ผ่าน / 0 ไม่ผ่าน
//
// banner เป็น overlay ลอยกลางจอ → แนบ document.body (ไม่อยู่ใน .card แล้ว)
// mock จำลอง: page > .card > form + document.body + document.querySelector
// ตรวจว่า: banner อยู่ใน body (ไม่ย้าย form หลุดการ์ด) + แสดงครั้งเดียว
//          + ปุ่มปิด/ซ่อน + ANNOUNCE_TEXT ว่าง + โครงสร้าง HTML เปลี่ยนไม่ throw
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

// run(): สร้าง context + document.mock (มี body + querySelector) แล้วคืน API + body
const run = (pages, storage) => {
  const body = makeEl('body');
  const document = {
    body,
    getElementById: id => pages[id] ?? null,
    createElement: tag => makeEl(tag),
    // querySelector ใช้ใน initAnnounce เพื่อกันแทรกซ้ำ (.announce-banner)
    querySelector: sel => sel === '.announce-banner'
      ? (body.children.find(c => c.className === 'announce-banner') || null) : null,
  };
  const localStorage = {
    getItem: k => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; }
  };
  const api = new Function('document', 'localStorage', snippet + '; return {initAnnounce, ANNOUNCE_TEXT};')
    (document, localStorage);
  return { ...api, body };
};

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; console.log('✅ PASS', name); }
    else { fail++; console.log('❌ FAIL', name); }
  };
  const cardOf = (pages, id) => pages[id].children[0]; // .card
  const bannerOf = body => body.children.find(c => c.className === 'announce-banner');
  const bannerCount = body => body.children.filter(c => c.className === 'announce-banner').length;

  // T1: banner แนบ document.body (ไม่ฝังในการ์ด) — form ยังอยู่ใน .card ทั้ง 2 หน้า
  { const pages = buildDom(); const storage = {};
    const { body, initAnnounce } = run(pages, storage); initAnnounce();
    const b = bannerOf(body);
    check('T1 banner อยู่ที่ document.body (overlay ลอยกลางจอ)', b != null && body.children.includes(b));
    check('T1b มีแค่ 1 banner (ไม่ซ้ำ 2 หน้า)', bannerCount(body) === 1);
    check('T1c desk: form.parentNode ยังเป็น .card (ไม่ถูกย้าย)', cardOf(pages, 'desk-page-form')._form.parentNode === cardOf(pages, 'desk-page-form'));
    check('T1d mob: form.parentNode ยังเป็น .card', cardOf(pages, 'mob-page-form')._form.parentNode === cardOf(pages, 'mob-page-form'));
  }

  // T2: เนื้อหา banner ถูกต้อง (role=status, ข้อความ = ANNOUNCE_TEXT, มีปุ่มปิด)
  { const pages = buildDom(); const storage = {};
    const api = run(pages, storage); api.initAnnounce();
    const b = bannerOf(api.body);
    const textEl = b.children.find(c => c.className === 'announce-text');
    const closeBtn = b.children.find(c => c.className === 'announce-close');
    check('T2 banner: role=status + ข้อความถูก + มีปุ่มปิด', b.getAttribute('role') === 'status'
      && textEl && textEl.textContent === api.ANNOUNCE_TEXT && closeBtn && closeBtn.textContent === '✕');
  }

  // T3: กดปิด → บันทึก localStorage + banner ถูกลบ (remove จาก body)
  { const pages = buildDom(); const storage = {};
    const api = run(pages, storage); api.initAnnounce();
    const b = bannerOf(api.body);
    const closeBtn = b.children.find(c => c.className === 'announce-close');
    closeBtn.onclick();
    check('T3 ปิดแล้ว: sp_announce_dismissed=1 + banner ถูก remove', storage['sp_announce_dismissed'] === '1' && b.parentNode === null);
  }

  // T4: ปิดแล้วโหลดหน้าใหม่ → ไม่สร้าง banner อีก
  { const pages = buildDom(); const storage = { sp_announce_dismissed: '1' };
    const api = run(pages, storage); api.initAnnounce();
    check('T4 dismissed แล้ว → body ไม่มี banner', bannerCount(api.body) === 0);
  }

  // T5: ANNOUNCE_TEXT ว่าง → ข้ามทั้งหมด (ไม่สร้าง banner)
  { const pages = buildDom(); const storage = {};
    const emptySnippet = snippet.replace(/const ANNOUNCE_TEXT = '.*?'/, "const ANNOUNCE_TEXT = ''");
    const body = makeEl('body');
    const document = { body, getElementById: id => pages[id] ?? null, createElement: tag => makeEl(tag), querySelector: () => null };
    const r = new Function('document', 'localStorage', emptySnippet + '; return {initAnnounce};')
      (document, { getItem: k => null, setItem: () => {}, removeItem: () => {} });
    r.initAnnounce();
    check('T5 ANNOUNCE_TEXT=ว่าง → body ไม่มี banner', bannerCount(body) === 0);
  }

  // T6: page หรือ form หาย (โครงสร้าง HTML เปลี่ยน) → ไม่ throw
  { const api = run({}, {});
    try { api.initAnnounce(); check('T6 หา page ไม่เจอ → ไม่ throw', true); }
    catch (e) { console.log('   ⚠️ T6 error:', e && e.message); check('T6 หา page ไม่เจอ → ไม่ throw', false); }
    const partial = buildDom(); delete partial['mob-page-form']._form; // mob ไม่มี form แล้ว
    try { run(partial, {}).initAnnounce(); check('T6b form หายในหน้าเดียว → หน้าเดียวยังทำงาน', true); }
    catch (e) { console.log('   ⚠️ T6b error:', e && e.message); check('T6b form หายในหน้าเดียว → หน้าเดียวยังทำงาน', false); }
  }

  // T7: เรียก initAnnounce ซ้ำ → ยังมีแค่ 1 banner (guard document.querySelector)
  { const pages = buildDom(); const storage = {};
    const api = run(pages, storage); api.initAnnounce(); api.initAnnounce(); api.initAnnounce();
    check('T7 เรียกซ้ำ 3 รอบ → body มีแค่ 1 banner', bannerCount(api.body) === 1);
  }

  console.log(`\n===== สรุป initAnnounce DOM test =====`);
  console.log(`${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
