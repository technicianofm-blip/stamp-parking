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
clasp push                        # อัปโหลด gas-code.gs ขึ้น Apps Script
clasp deployments                 # ดู deploymentId / version ที่ใช้งาน
clasp redeploy <deploymentId> ... # อัปเดต deployment เดิม (ใช้ URL เดิม)
clasp run initScriptProperties    # ครั้งแรก: สร้าง AUTH_SECRET + Users/AuditLog + admin

# 🔍 Syntax check (ตรวจ JS ที่อยู่ข้างในไฟล์ที่ไม่ใช่ .js เช่น gas-code.gs)
node --check <file>
```

## 🔐 ระบบ Auth (สำคัญมาก)

- หลัง migration ล่าสุด: **PIN → Username/Password + HMAC token**
- ⚠️ **ตอนนี้ production ยังรัน backend PIN เก่าอยู่** — `gas-code.gs` ใหม่ commit แล้วแต่**ยังไม่ deploy**
  → frontend ใหม่จะล็อกอินไม่ได้บน production จนกว่าจะ deploy backend (งานหน้าบ้านใช้ทดสอบผ่าน mock server ได้)
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

## แนวปฏิบัติ

- commit ตรงไปที่ `main` (ไม่มี branching workflow) — แบบเดียวกับประวัติทั้งหมด
- conventional commits (`feat:` / `fix:` / `docs:` / `chore:`) + ลงท้ายด้วย `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- ข้อความ/ความเห็นในโค้ดและ UI เป็นภาษาไทย — เขียนตามสไตล์เดิม
- เมื่อเปลี่ยนขั้นตอนติดตั้ง/ตั้งค่า → อัปเดต `README.md` (ตอนนี้ auth section ตรงกับระบบ username/password แล้ว)
