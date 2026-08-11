// ===================================================================
// sw.js — Service Worker: บังคับ app ที่ติดตั้งหน้า Home (PWA) โหลด HTML เวอร์ชันใหม่
//
// ปัญหาที่แก้: เครื่องที่ติดตั้ง/บุ๊กมาร์กแล้วไม่มีกลไกบังคับอัปเดต → ค้าง HTML เก่า
//             (ฝัง GAS_URL_DEFAULT เก่า + ไม่มี healUrl) → "❌ Network error" ตลอด
// กลยุทธ์:
//   - SHELL_CACHE มี version stamp (เดียวกับ ?v= ใน index.html) → เปลี่ยนทุก deploy
//   - install  → skipWaiting(): ขึ้นควบคุมทันที (ไม่ต้องปิด-เปิด 2 รอบ)
//   - activate → ลบ cache เก่า sp-shell-* ทั้งหมด + clients.claim()
//   - fetch    → จัดการเฉพาะ navigation request (GET + mode=navigate):
//                network-first — ขอเน็ตก่อน → สำเร็จเก็บ shell ใหม่ / offline → ใช้ cache ล่าสุด
//                ขออื่น (GAS cross-origin, รูป Cloudinary, asset) → ปล่อยผ่าน ไม่แตะ
// ⚠️ ต้องอัปเดต SHELL_CACHE ตัวเลขให้ตรงกับ ?v= ทุกครั้งที่ deploy (ดู CLAUDE.md gotcha #1)
// ===================================================================
const SHELL_CACHE = 'sp-shell-v20260811';

self.addEventListener('install', (e) => {
  self.skipWaiting(); // ขึ้นควบคุมทันที
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('sp-shell-') && k !== SHELL_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // เฉพาะการโหลดหน้าเท่านั้น — ขออื่น (GAS/รูป/asset) ปล่อยผ่านให้ browser/HTTP cache จัดการ
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || Response.error()))
  );
});
