// ===================================================================
// test-production.js — ทดสอบ auth ผ่าน GAS Web App production
// (deployment ใหม่ AKfycbwEK_...) — pattern แบบ browser fetch
// วิธีใช้: node test-production.js [password]
// ===================================================================
// วิธีใช้: node test-production.js [password] [gasUrl]
const BASE = process.argv[3] || 'https://script.google.com/macros/s/AKfycbwEK_PhSzpOIqMP8w2gPLDqRRGCE5bwF4M5aBaAdm5NbI96m3jw70ekKJxnygdXnL-5Ug/exec';
const SHEET = '1HT9pHVxZ53OCdnFI6tFT_YQTFJZsP9eR6I2lH-gmNMo';
const USER = 'admin';
const PASS = process.argv[2] || '';
if (!PASS) { console.error('ต้องระบุ password: node test-production.js <password> [gasUrl]'); process.exit(1); }

async function gasFetch(url, opts) {
  // GAS Web App: /exec → 302 → GET script.googleusercontent.com (browser-style)
  // user_content_key เป็น single-use → เจอ 404/HTML ซ้ำ ต้อง retry ทั้ง request
  const maxTries = 3;
  let last;
  for (let i = 0; i < maxTries; i++) {
    let r = await fetch(url, { ...opts, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (loc) r = await fetch(loc, { redirect: 'manual' });
    }
    const text = await r.text().catch(() => '');
    last = { status: r.status, text: text };
    if (text.trim().startsWith('{')) break; // JSON ได้แล้ว (status อะไรก็ตาม)
    console.log('  [try ' + (i + 1) + '] status ' + r.status + ' len ' + text.length + ' — retry');
  }
  return last;
}

async function main() {
  // 1) login
  console.log('— LOGIN —');
  let res = await gasFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'login', username: USER, password: PASS })
  });
  let j = {};
  try { j = JSON.parse(res.text); } catch (e) { console.error('login non-JSON:', res.text.slice(0, 200)); process.exit(1); }
  console.log('status:', res.status, '| success:', j.success, '| role:', j.role, '| expiresIn:', j.expiresIn);
  if (!j.success || !j.token) { console.error('LOGIN FAILED:', JSON.stringify(j)); process.exit(1); }
  const token = j.token;
  console.log('TOKEN:', token.slice(0, 30) + '…');

  // 2) getAll ด้วย token (ส่ง sheetId เหมือน frontend)
  console.log('— getAll (with token) —');
  res = await gasFetch(BASE + '?action=getAll&token=' + encodeURIComponent(token) + '&sheetId=' + SHEET, { method: 'GET' });
  j = JSON.parse(res.text);
  console.log('status:', res.status, '| success:', j.success, '| records:', (j.data || []).length, '| error:', j.error || '');

  // 3) getAll ไม่มี token → ควร 401
  console.log('— getAll (no token) —');
  res = await gasFetch(BASE + '?action=getAll&sheetId=' + SHEET, { method: 'GET' });
  j = JSON.parse(res.text);
  console.log('status:', res.status, '| success:', j.success, '| error:', j.error);

  // 4) listUsers ด้วย token
  console.log('— listUsers —');
  res = await gasFetch(BASE + '?action=listUsers&token=' + encodeURIComponent(token), { method: 'GET' });
  j = JSON.parse(res.text);
  console.log('status:', res.status, '| success:', j.success, '| users:', (j.data || []).map(u => u.username).join(', '));

  // 5) updateDiscount id ปลอม — ตรวจว่า getSheet/ensureStatusColumn ปกติไหม
  //    (อ่าน sheet เดียวกันกับ getAllRecords แต่ไม่เข้า data-loop)
  console.log('— updateDiscount (fake id, non-destructive probe) —');
  res = await gasFetch(BASE + '?action=updateDiscount&id=__probe_none__&discount=0&token=' + encodeURIComponent(token) + '&sheetId=' + SHEET, { method: 'GET' });
  j = JSON.parse(res.text);
  console.log('status:', res.status, '| success:', j.success, '| error:', j.error || '(Record not found = getSheet/ensureStatusColumn OK)');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
