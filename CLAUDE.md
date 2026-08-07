# Stamp Parking — ระบบบันทึกข้อมูลที่จอดรถ

เว็บแอปบันทึกการจอดรถ: **GitHub Pages (Frontend) + Google Apps Script (Backend) + Google Sheets (Database) + Cloudinary (รูปภาพ)**

## สถาปัตยกรรม

- **Frontend:** `index.html` (HTML + inline script ท้าย `<body>`) + `style.css` (CSS แยกไฟล์) — รองรับ desktop + mobile โฮสต์บน GitHub Pages
  → `https://technicianofm-blip.github.io/stamp-parking/`
- **Backend:** `gas-code.gs` → GAS Web App (deploy ผ่าน `clasp`), runtime V8, access `ANYONE`
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
| `toast-enhancements.js` | Enhanced toast UI — โหลด **ท้าย `</body>` หลัง inline script** เพื่อ override `window.toast` |
| `.clasp.json` | ตั้งค่า clasp (scriptId — อย่าแก้ rootDir ไปจากเดิม) |
| `appsscript.json` | GAS config (V8, ANYONE, executeAs USER_DEPLOYING) |

## คำสั่งที่ใช้บ่อย

```bash
# ✅ ทดสอบ auth (spawn server เองที่ port 3005) — ควรได้ 22/22
node test-auth.js

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
node --check <file>
```

## 🔐 ระบบ Auth (สำคัญมาก)

- หลัง migration ล่าสุด: **PIN → Username/Password + HMAC token**
- ✅ **production รัน backend ใหม่แล้ว** (deployment `AKfycbwEK_...` @ **version 64**, access = Anyone)
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
8. **clasp gotchas (เจอจริงทุกครั้งที่ deploy):** `clasp push` มักตอบ "Skipping push" แม้แก้ไฟล์แล้ว → ใช้ `clasp push --force`; `clasp redeploy <id> -V @HEAD` fails ("Read-only deployments may not be modified") → ต้อง `clasp version "desc"` ก่อน แล้ว redeploy ด้วยเลข version จริง; **หลัง redeploy ทุกครั้ง deployment กลับไปเป็น private** → ต้องตั้ง Who has access = Anyone ใหม่
9. **CacheService จำกัด 100KB/key:** ถ้า payload ข้อมูลเกิน 100KB (หลายร้อย record) `cache.put` จะ throw ("Argument too large: value") → ต้อง wrap try/catch ข้าม cache แต่อย่ายอมให้ throw จน API ล่ม (เคยเจอที่ getAll ~409 records)

## แนวปฏิบัติ

- commit ตรงไปที่ `main` (ไม่มี branching workflow) — แบบเดียวกับประวัติทั้งหมด
- conventional commits (`feat:` / `fix:` / `docs:` / `chore:`) + ลงท้ายด้วย `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- ข้อความ/ความเห็นในโค้ดและ UI เป็นภาษาไทย — เขียนตามสไตล์เดิม
- เมื่อเปลี่ยนขั้นตอนติดตั้ง/ตั้งค่า → อัปเดต `README.md`
