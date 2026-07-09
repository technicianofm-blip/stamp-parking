# 🏢 Stamp Parking — ระบบบันทึกข้อมูลที่จอดรถ

เว็บแอปครบวงจร: **GitHub Pages (Frontend) + Google Apps Script (Backend) + Google Sheets (Database) + Cloudinary (รูปภาพ)**

## 📁 โครงสร้างไฟล์

```
📦 D:\claude code\
 ├── 📄 index.html            # 🌐 Frontend หลัก (รองรับ Desktop + Mobile)
 ├── 📄 gas-code.gs           # ⚙️ Google Apps Script (Backend API)
 └── 📄 README.md             # 📖 คู่มือนี้
```

## 🏗️ สถาปัตยกรรม

```
👤 ผู้ใช้ → index.html (GitHub Pages / Local)
                ↓ fetch() POST / GET
          🌐 Google Apps Script (Web App)
                ↓
          ┌───────┴───────┐
        📊 Google        📸 Google
        Sheets           Drive
        (ข้อมูล)         (รูปภาพ)
```

## 💡 วิธีตั้งค่า (แบบไม่ต้องแก้ไข GAS)

ตั้งแต่เวอร์ชันล่าสุด สามารถใส่ **Sheet ID** และ **Folder ID** ได้จากหน้า Setup
ในเว็บ โดยไม่ต้องแก้ไขโค้ด GAS ทุกครั้งที่เปลี่ยน:

1. เปิดหน้าเว็บ → ไปที่ **⚙️ ตั้งค่า**
2. ใส่ **Web App URL** (จำเป็น)
3. ใส่ **Google Sheet ID** (ไม่บังคับ — ถ้าไม่ใส่จะใช้ค่าที่ hardcode ใน gas-code.gs)
4. ใส่ **Google Drive Folder ID** (ไม่บังคับ — ถ้าไม่ใส่จะใช้ค่าที่ hardcode ใน gas-code.gs)
5. กด **💾 บันทึก** → **📡 ทดสอบ**

> 💡 **Tip:** ถ้าใส่ Sheet ID / Folder ID ในหน้าเว็บ จะ override ค่า hardcode ใน gas-code.gs
> ทำให้เปลี่ยน Sheet หรือ Folder ได้ทันที โดยไม่ต้อง deploy GAS ใหม่

---

# ⚙️ วิธีติดตั้ง (6 ขั้นตอน)

## 1️⃣ สร้าง Google Sheet
1. ไปที่ [sheets.google.com](https://sheets.google.com/create)
2. คัดลอก **Sheet ID** จาก URL:
   ```
   https://docs.google.com/spreadsheets/d/XXXXX/edit
                                                ↑ ID ตรงนี้
   ```

## 2️⃣ สร้าง Google Drive Folder สำหรับรูป
1. ไปที่ [drive.google.com](https://drive.google.com)
2. สร้างโฟลเดอร์ชื่อ `Stamp Parking Photos` (หรือชื่ออื่น)
3. เข้าไปในโฟลเดอร์ คัดลอก **Folder ID** จาก URL:
   ```
   https://drive.google.com/drive/folders/XXXXX
                                             ↑ ID ตรงนี้
   ```

## 3️⃣ Deploy Google Apps Script
1. ไปที่ [script.google.com/create](https://script.google.com/create)
2. เปิดไฟล์ **`gas-code.gs`** → Copy เนื้อหาทั้งหมด → วางใน Apps Script Editor
3. แก้ไข 2 ค่าที่บรรทัดบนสุด:
   ```javascript
   const SHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';        // ← ใส่ Sheet ID
   const FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE'; // ← ใส่ Folder ID
   ```
4. กด 💾 **บันทึก** (Ctrl+S)
5. **Deploy > New deployment**
   - **Type:** Web app
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
6. กด **Deploy** → อนุญาตสิทธิ์ (Authorize)
7. **คัดลอก Web App URL**:
   ```
   https://script.google.com/macros/s/XXXXX/exec
   ```

## 4️⃣ ตั้งค่า Cloudinary (สำหรับอัปโหลดรูป)
1. ไปที่ [cloudinary.com](https://cloudinary.com) → **Sign Up** (ฟรี)
2. Dashboard → **Copy Cloud name**
3. **Settings > Upload > Upload presets > Add preset**
   - **Signing Mode:** `Unsigned`
   - **Folder:** `stamp-parking`
   - บันทึก → **Copy Preset name**
4. เปิด `index.html` → หา 2 ค่านี้แล้วแก้:
   ```javascript
   const CLOUD_NAME = 'your-cloud-name'    // ← เปลี่ยน
   const UPLOAD_PRESET = 'stamp_parking'    // ← เปลี่ยน (ถ้าตั้งชื่ออื่น)
   ```

## 5️⃣ เปิด Frontend (2 วิธี)

| วิธี | คำอธิบาย |
|:--|:--|
| **Local** (ง่ายสุด) | เปิด `index.html` ใน Chrome/Edge โดยตรง |
| **GitHub Pages** (แนะนำ) | Push ไป GitHub Repo → Settings > Pages → เลือก branch main |

## 5️⃣ ตั้งค่าในหน้าเว็บ
1. เปิดหน้าเว็บ → ไปที่ **⚙️ ตั้งค่า**
2. วาง **Web App URL** → กด **💾 บันทึก**
3. *(ไม่บังคับ)* ใส่ **Google Sheet ID** และ **Google Drive Folder ID** → กดบันทึก
4. กด **📡 ทดสอบ** เพื่อตรวจสอบการเชื่อมต่อ
5. ถ้าขึ้น ✅ เชื่อมต่อสำเร็จ = พร้อมใช้งาน!

> ⚠️ ถ้าไม่ได้ใส่ Sheet ID / Folder ID ในหน้า Setup ระบบจะใช้ค่าที่ hardcode
> ใน `gas-code.gs` แทน

---

# 🎯 ฟังก์ชันการใช้งาน

## 📝 ฟอร์มบันทึกข้อมูล
- ชื่อ-นามสกุล, ชื่อเล่น, เบอร์ติดต่อ
- หน่วยงาน (OFM / PCS)
- ประเภทการลงเวลา (เข้างาน / ออกงาน)
- ยานพาหนะ (รถจักรยานยนต์ / รถยนต์)
- เลขบัตรจอดรถ 17 หลัก (Ticket No.)
- 📸 ถ่ายรูปจากกล้องหรือเลือกรูป

## 📊 Dashboard
- **สถิติสรุป:** จำนวนทั้งหมด, OFM, PCS, รถจักรยานยนต์, รถยนต์, วันนี้
- **ค้นหา/กรอง:** ตามชื่อ, หน่วยงาน, ยานพาหนะ, สถานะ
- **📍 กรองตามวันที่:** ตั้งค่าเริ่มต้นเป็นวันนี้ สามารถเลือกดูย้อนหลังได้
- **🔔 แจ้งเตือนข้อมูลใหม่:** กระดิ่งแสดงจำนวนรายการใหม่ตั้งแต่เข้าครั้งล่าสุด กดเพื่อ mark as seen
- **สถานะ:** ⏳ รออนุมัติ → ✅ อนุมัติ / ❌ ไม่อนุมัติ (เปลี่ยนได้ทันที)
- **📷 ดูรูปภาพ** ขนาดใหญ่
- **🗑 ลบรายการ** พร้อมยืนยัน
- **📥 ส่งออก CSV**

## ⚙️ ตั้งค่า
- **Web App URL:** กำหนด URL ของ Google Apps Script
- **🔗 Google Sheet ID:** ระบุ Spreadsheet ที่ต้องการใช้ (ไม่บังคับ)
- **📁 Google Drive Folder ID:** ระบุโฟลเดอร์สำหรับเก็บรูป (ไม่บังคับ)
- **📡 ทดสอบการเชื่อมต่อ:** ตรวจสอบว่า API ทำงานถูกต้อง

## ☁️ Cloudinary — รูปภาพ
- รูปถูกอัปโหลด **ตรงจาก Browser → Cloudinary API** ไม่ผ่าน GAS
- **ฟรี:** 25GB storage / 25GB bandwidth/เดือน
- ได้ CDN URL → เปิดใน Dashboard ได้เร็ว
- **วิธีตั้งค่า:** ดูหัวข้อ ⚙️ วิธีติดตั้ง

# 📖 คู่มือการใช้งาน

## 📝 วิธีบันทึกข้อมูล
1. ไปที่หน้า **📝 บันทึก**
2. กรอกข้อมูลให้ครบ:
   - **ชื่อ-นามสกุล** (จำเป็น)
   - **ชื่อเล่น** (ไม่บังคับ)
   - **เบอร์ติดต่อ** (10 หลัก)
   - **หน่วยงาน** → OFM / PCS
   - **ประเภทการลงเวลา** → เริ่มต้นเป็นเข้างาน
   - **ยานพาหนะ** → รถจักรยานยนต์ / รถยนต์
   - **เลขบัตรจอดรถ** → 17 หลัก (ตัวเลข+ตัวอักษร)
3. (ไม่บังคับ) 📸 **ถ่ายรูป** → กดที่ช่องว่างเพื่อเปิดกล้อง
4. กด **💾 บันทึก**

> 💡 ถ้ากรอกข้อมูลไม่ครบ จะมีข้อความแจ้ง字段ที่ขาด

## 📱 สร้าง Shortcut หน้า Home มือถือ

### Android (Chrome)
1. เปิด [stamp-parking](https://technicianofm-blip.github.io/stamp-parking/) ใน **Chrome**
2. กดปุ่ม ⋮ (สามจุด) มุมบนขวา
3. เลือก **Add to Home screen**
4. ตั้งชื่อ → กด **Add**
5. จะมีไอคอน Stamp Parking ขึ้นที่หน้าจอ

### iPhone / iPad (Safari)
1. เปิด [stamp-parking](https://technicianofm-blip.github.io/stamp-parking/) ใน **Safari**
2. กดปุ่ม ⬆️ (Share) ที่แถบล่าง
3. เลื่อนลง → เลือก **Add to Home Screen**
4. ตั้งชื่อ → กด **Add**
5. จะมีไอคอน Stamp Parking ขึ้นที่หน้าจอ

### ข้อดี
- เปิดเหมือน App จริงๆ ไม่ต้องเข้า Browser ก่อน
- ไม่มีแถบ URL → เนื้อที่เต็มจอ
- เร็วขึ้นเพราะ cache จาก service worker

## 📱 Responsive Design
- **Desktop (≥ 768px):** Sidebar Navigation + Full Table
- **Mobile (< 768px):** Bottom Tab Bar + Compact Table + Offline Bar
- สถานะการเชื่อมต่อแสดงตลอดเวลา

---

# 🔐 การจัดการข้อมูล

## ดูข้อมูลใน Google Sheet
- เปิด Sheet ที่สร้างไว้ → Sheet ชื่อ `Stamp Parking`
- 11 คอลัมน์: ID, ชื่อ-นามสกุล, ชื่อเล่น, เบอร์ติดต่อ, หน่วยงาน, ประเภทการลงเวลา, ยานพาหนะ, เลขบัตรจอดรถ, รูปภาพ (URL), วันที่บันทึก, **สถานะ**

## ดูรูปภาพใน Google Drive
- เปิด Drive → โฟลเดอร์ `Stamp Parking Photos`
- รูปทั้งหมดถูกเก็บที่นี่ พร้อมคำอธิบาย

---

# 📝 หมายเหตุ
- ต้องใช้ **Internet** ตลอดเวลาในการบันทึกและดึงข้อมูล
- **ไม่มี Internet:** จะแสดงข้อมูลจากแคชในเครื่อง (LocalStorage)
- GAS Limit: 50MB/response, 6 นาที/timeout — เพียงพอสำหรับการใช้งานทั่วไป
- **ฟรี 100%** (Google Sheets + Drive + Apps Script)
