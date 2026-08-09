# Stamp Parking — ระบบบันทึกข้อมูลที่จอดรถ

เว็บแอปบันทึกการจอดรถ: **GitHub Pages (Frontend) + Google Apps Script (Backend) + Google Sheets (Database) + Cloudinary (รูปภาพ)**

## สถาปัตยกรรม

- **Frontend:** `index.html` (HTML + inline script ท้าย `<body>`) + `style.css` (CSS แยกไฟล์) — รองรับ desktop + mobile โฮสต์บน GitHub Pages
  → `https://technicianofm-blip.github.io/stamp-parking/`
- **Backend:** `gas-code.gs` → GAS Web App (deploy ผ่าน `clasp`), runtime V8, access `ANYONE_ANONYMOUS` (ใครก็ได้ ไม่ต้องมี Google account — ตั้งใน `appsscript.json` → `webapp.access`)
- **ฐานข้อมูล:** Google Sheets — sheet หลัก `Stamp Parking` + sheets `Users` / `AuditLog` (สร้างอัตโนมัติ)
- **รูปภาพ:** อัปโหลดตรงจาก browser → Cloudinary (**ไม่ผ่าน GAS**)
- **Auth:** username+password → HMAC token หมดอายุ 8 ชม. (ไม่ใช่ PIN อีกต่อไป)

## ไฟล์สำคัญ

| ไฟล์ | บทบาท |
|---|---|
| `index.html` | Frontend — HTML + inline script ก้อนเดียวท้าย `<body>` (CSS เชื่อมด้วย `<link>` เข้า style.css) |
| `style.css` | ไฟล์ CSS หลัก — design tokens (`--p/--s/--d/--w/--g*`) + component styles ทั้งหมด |
| `gas-code.gs` | GAS backend — auth, CRUD ข้อมูล, user management, audit log |
| `index.js` | Mock server (Node, port **3005**) จำลอง GAS สำหรับทดสอบ auth ในเครื่อง |
| `test-auth.js` | Test suite ระบบ auth (22 cases) — เป็น **ground truth** ของ contract |
| `test-production.js` | Smoke test production ผ่าน GAS Web App URL จริง — ตรวจ login / getAll / 401 (รัน: `node test-production.js <password> [gasUrl]`) |
| `test-duplicate.js` | Test feature ตรวจเลขบัตรซ้ำวันเดียวกัน — unit `bkkDay` (รวม guard invalid date) + E2E mock (รัน: `node test-duplicate.js` ควรได้ 5/5 + 13/13) |
| `toast-enhancements.js` | Enhanced toast UI — โหลด **ท้าย `</body>` หลัง inline script** เพื่อ override `window.toast` |
| `.clasp.json` | ตั้งค่า clasp (scriptId — อย่าแก้ rootDir ไปจากเดิม) |
| `appsscript.json` | GAS config (V8, ANYONE, executeAs USER_DEPLOYING) |

## คำสั่งที่ใช้บ่อย

```bash
# ✅ ทดสอบ auth (spawn server เองที่ port 3005) — ควรได้ 22/22
node test-auth.js

# 🔁 ทดสอบ feature ตรวจเลขบัตรซ้ำวันเดียวกัน (unit bkkDay + E2E mock) — ควรได้ 5/5 + 13/13
node test-duplicate.js

# 🧪 รัน mock server ทดสอบหน้าเว็บ (เปิด http://localhost:3005)
node index.js

# 🚀 Deploy GAS
clasp push --force                          # ⚠️ ต้อง --force (ไม่งั้น "Skipping push") — อัปโหลด gas-code.gs ขึ้น Apps Script
clasp deployments                           # ดู deploymentId / version ที่ใช้งาน
clasp version "desc"                        # สร้าง version ก่อน redeploy (redeploy ด้วย @HEAD ไม่ได้)
clasp redeploy <deploymentId> -V <version> -d "desc"   # อัปเดต deployment เดิม (ใช้ URL เดิม)
clasp run initScriptProperties              # ครั้งแรก: สร้าง AUTH_SECRET + Users/AuditLog + admin

# 🧪 ตรวจ production ว่าทำงาน (login + getAll + 401)
node test-production.js <password> [gasUrl]

# 🔍 Syntax check (ตรวจ JS ที่อยู่ข้างในไฟล์ที่ไม่ใช่ .js เช่น gas-code.gs)
# ⚠️ Node ≥ 22 (โดยเฉพาะ v26) ไม่โหลดนามสกุล .gs → throw ERR_UNKNOWN_FILE_EXTENSION
#    ต้องก๊อปเป็น .js ชั่วคราวก่อนเช็ค (CommonJS) แล้วลบทิ้ง:
cp gas-code.gs __check_tmp.js && node --check __check_tmp.js && rm -f __check_tmp.js
node --check index.js
```

## 🔐 ระบบ Auth (สำคัญมาก)

- หลัง migration ล่าสุด: **PIN → Username/Password + HMAC token**
- ✅ **production รัน backend ใหม่แล้ว** (deployment `AKfycbwEK_...` @ **version 67**, access = `ANYONE_ANONYMOUS`)
  → ยืนยันผ่าน `node test-production.js <password>`: login / getAll (409 records) / no-token → 401 ทำงานปกติ
- **Token:** `base64url(username|expiryMs)` + HMAC-SHA256 signature, เซ็นด้วย `AUTH_SECRET` (Script Properties)
  → **ห้ามลบ `AUTH_SECRET`** ถ้าหาย token ทั้งหมดใช้ไม่ได้
- **Frontend ส่ง token:** GET → query `?token=` / POST → body `body.token`
  (หลีกเลี่ยง CORS preflight — ห้ามเปลี่ยนกลับไปใช้ header)
- **Lockout:** ผิด 5 ครั้ง → ล็อก 15 นาที (CacheService)
- **รหัสผ่าน:** salt + SHA-256 iterated 1000 รอบ (Apps Script ไม่มี PBKDF2)
- ⚠️ **`initScriptProperties` ต้องไม่คืน `initialPassword` ใน HTTP response** — เคยเป็นช่องโหว่
  (มี Web App URL แล้วขโมยรหัส admin ตอน Users ว่าง) → ดูผ่าน `clasp run` / execution log เท่านั้น
- Legacy keys `sp_admin_pin` / `sp_admin_pin_expiry` ถูกลบอัตโนมัติตอนโหลดหน้าเว็บ

## ⚠️ Gotchas / กติกาที่ห้ามละเมิด

1. **`GAS_URL_DEFAULT`** ใน `index.html` (~บรรทัด 505) ต้องอัปเดตให้ตรง deployment ใหม่**ทุกครั้ง**ที่ deploy GAS
2. **`healUrl()`** ถือว่า 401 Unauthorized = URL ยังใช้ได้ (แค่ยังไม่ล็อกอิน) — อย่าแก้กลับให้ heal บน 401
3. `recovery-codes.txt` = 2FA recovery codes — **gitignored แล้ว ห้าม commit** (เช่นเดียวกับ `node.pid`/`server.log`)
4. เพิ่ม/แก้ฟีเจอร์ auth ต้องทำให้ **3 ที่สอดคล้องกัน**: `gas-code.gs` (จริง) ↔ `index.js` (mock) ↔ `index.html` (frontend)
5. แก้ behavior auth → ต้องอัปเดต `test-auth.js` ด้วย และต้องรันให้ผ่าน
6. CSS อยู่ที่ `style.css` (แยกจาก index.html แล้ว) — index.html เหลือแค่ HTML + inline JS → **เพิ่ม/แก้ style ต้องไปที่ `style.css`** (ยกเว้น `style=""` แบบ inline บน element ที่อยู่กับ HTML)
7. `appsscript.json` เปิด `executionApi.access: ANYONE` — ถ้าเกี่ยวข้องกับความปลอดภัย ควรพิจารณาจำกัด
8. **clasp gotchas (เจอจริงทุกครั้งที่ deploy):** `clasp push` มักตอบ "Skipping push" แม้แก้ไฟล์แล้ว → ใช้ `clasp push --force`; `clasp redeploy <id> -V @HEAD` fails ("Read-only deployments may not be modified") → ต้อง `clasp version "desc"` ก่อน แล้ว redeploy ด้วยเลข version จริง
   - ⚠️ **Access ของ Web App ถูกยึดจาก `appsscript.json` → `webapp.access` ตอน redeploy** (ไม่ใช่ค่าเดิมที่ตั้งไว้ใน UI): หลัง redeploy ทุกครั้ง access จะกลับไปตาม manifest — **`ANYONE` = ต้องมี Google account (anonymous → 302 ไป ServiceLogin)**, `ANYONE_ANONYMOUS` = ใครก็ได้ไม่ต้องล็อกอิน (ที่ public form ต้องใช้ตัวนี้) → ถ้า redeploy แล้ว public form เข้าไม่ได้ ให้เช็ค manifest ก่อน
   - ⚠️ **Apps Script API v1 ตั้ง access ผ่าน API ไม่ได้** (ยืนยันจาก discovery doc แล้ว: `DeploymentConfig` มีแค่ scriptId/versionNumber/manifestFileName/description, `WebAppEntryPoint` ไม่มีฟิลด์ access) → การแก้ access ทำได้ 2 ทาง: (ก) แก้ manifest + push + version + redeploy (รวดเร็ว, ค่าตาม manifest) หรือ (ข) `clasp open` → Deploy → Manage deployments → pencil ที่ deployment → Who has access
9. **CacheService จำกัด 100KB/key:** ถ้า payload ข้อมูลเกิน 100KB (หลายร้อย record) `cache.put` จะ throw ("Argument too large: value") → ต้อง wrap try/catch ข้าม cache แต่อย่ายอมให้ throw จน API ล่ม (เคยเจอที่ getAll ~409 records)
10. **เลขบัตรจอดรถซ้ำในวันเดียวกันถูกบล็อก:** `doPost` ตรวจ `findDuplicateToday()` (นับวันตาม Asia/Bangkok) ก่อน appendRow → คืน `{duplicate:true, existing}`. ถ้าจำเป็นจริงๆ ผู้ใช้กด "จำเป็นต้องบันทึก" ใน modal `dupModal` → frontend ส่ง `forceDuplicate=true` → ข้ามบล็อก + เขียน `AuditLog` (action `forceDuplicateSave`, actor `public`). ถ้าแก้ ให้ sync 3 ที่: `gas-code.gs` ↔ `index.js` (mirror ด้วย `bkkDay()`) ↔ `index.html` (saveRec→submitRecord, state `_dupResume`) และรัน `node test-duplicate.js` ให้ผ่าน. **`bkkDay()` ต้อง guard invalid date → คืน `''` (ห้าม throw RangeError)** — มี unit test ครอบแล้ว
11. **GAS ตั้ง HTTP status code ไม่ได้ (คืน 200 เสมอ):** `ContentService.TextOutput` กำหนด status ไม่ได้ → `jsonResponse(data, 401/404/409)` บน production เป็น **HTTP 200 จริง** มีแค่ body JSON `{success:false,...}` (mock `index.js` ส่ง status จริงเพื่อเทสต์ แต่ production ต่าง) → **frontend ต้องเช็ค body เท่านั้น (`r.success` / `r.duplicate` / `r.error`) — ห้ามเช็ค `r.status`** ไม่งั้นผ่าน mock แต่พัง production (เช่น duplicate ที่ GAS คืน 200 + body, ไม่ใช่ 409)
12. **Stored XSS ผ่านฟอร์มสาธารณะ:** field ที่ผู้ใช้กรอกเอง (ชื่อ/แผนก/เวลาฯลฯ) เข้า database แล้ว render กลับในหน้า admin → **ห้ามแทรก raw ลง innerHTML เด็ดขาด** ต้อง `esc()` ทุกจุด. ⚠️ `esc()` ไม่ escape single quote → **ห้ามใช้ `onclick="fn('${esc(x)}')"`** (ตัวเลขบัตร 17 หลักแทรก quote ได้) — ใช้ `onclick="fn(this.dataset.tk)" data-tk="${esc(x.ticketNo)}"` แทน. CSV export ก็ต้องกัน formula injection ด้วย (`=`,`+`,`-`,`@` นำหน้า → ขึ้น `'`) — มี helper `csvField()` แล้ว. ถ้าจะแก้ เพิ่มฟีเจอร์ render → ไล่เช็คทุกจุดที่แทรก user data ลง HTML

## แนวปฏิบัติ

- commit ตรงไปที่ `main` (ไม่มี branching workflow) — แบบเดียวกับประวัติทั้งหมด
- conventional commits (`feat:` / `fix:` / `docs:` / `chore:`) + ลงท้ายด้วย `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- ข้อความ/ความเห็นในโค้ดและ UI เป็นภาษาไทย — เขียนตามสไตล์เดิม
- เมื่อเปลี่ยนขั้นตอนติดตั้ง/ตั้งค่า → อัปเดต `README.md`
