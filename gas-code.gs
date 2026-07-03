/**
 * Stamp Parking — Google Apps Script (Backend)
 *
 * วิธีการติดตั้ง:
 * 1. ไปที่ https://script.google.com/create
 * 2. วางโค้ดนี้ทั้งหมด
 * 3. เปลี่ยน SHEET_ID และ FOLDER_ID ตามของตัวเอง (ดูวิธีใน README)
 * 4. บันทึก → Deploy > New deployment > Web app
 * 5. ตั้ง Execute as: "Me", Who has access: "Anyone"
 * 6. คัดลอก Web App URL ไปใส่ใน frontend (stamp-parking.html)
 */

// ============================================================
// 🔧 ตั้งค่าที่นี่ (แก้ไขให้ตรงกับของคุณ)
// ============================================================
const SHEET_ID = '1HT9pHVxZ53OCdnFI6tFT_YQTFJZsP9eR6I2lH-gmNMo';          // ID จาก URL Google Sheet
const FOLDER_ID = '1-Du1btmVyUSGVWq15RftJ_-6PqICxAfK';   // ID โฟลเดอร์สำหรับเก็บรูป

// Column indices (0-based) — ทำให้อ่านโค้ดง่ายขึ้น
const COL = { id:0, name:1, nickname:2, phone:3, dept:4, timeType:5, vehicle:6, ticketNo:7, photo:8, createdAt:9, status:10, discount:11 };

// ============================================================
// DO GET — ดึงข้อมูล / ลบข้อมูล
// ============================================================
function doGet(e) {
  try {
    const action = e?.parameter?.action || 'getAll';
    const sheetId = (e?.parameter?.sheetId || '').trim();
    const folderId = (e?.parameter?.folderId || '').trim();

    console.log('[doGet] action=' + action + ' sheetId=' + sheetId);

    if (action === 'getAll') {
      return jsonResponse(getAllRecords(sheetId));
    }

    if (action === 'delete') {
      const id = e?.parameter?.id;
      if (!id) return jsonResponse({ success: false, error: 'Missing id' }, 400);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        console.log('[delete] lock acquired, id=' + id);

        const sheet = getSheet(sheetId);
        const data = sheet.getDataRange().getValues();
        let changed = false;
        for (let i = data.length - 1; i >= 0; i--) {
          if (String(data[i][COL.id]) === String(id)) {
            sheet.deleteRow(i + 1);
            changed = true;
            break;
          }
        }

        clearRecordCache(sheetId);
        console.log('[delete] id=' + id + ' result=' + changed);
        return jsonResponse({ success: changed, deleted: changed });
      } catch (err) {
        console.error('[delete] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'updateStatus') {
      const id = e?.parameter?.id;
      const status = e?.parameter?.status;
      if (!id || !status) return jsonResponse({ success: false, error: 'Missing id or status' }, 400);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        console.log('[updateStatus] lock acquired, id=' + id + ' → ' + status);

        const sheet = getSheet(sheetId);
        ensureStatusColumn(sheet);
        const data = sheet.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][COL.id]) === String(id)) {
            sheet.getRange(i + 1, COL.status + 1).setValue(status);
            found = true;
            break;
          }
        }

        clearRecordCache(sheetId);
        console.log('[updateStatus] id=' + id + ' found=' + found);
        if (found) return jsonResponse({ success: true });
        return jsonResponse({ success: false, error: 'Record not found' }, 404);
      } catch (err) {
        console.error('[updateStatus] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'updateDiscount') {
      const id = e?.parameter?.id;
      const discount = e?.parameter?.discount || '';
      if (!id) return jsonResponse({ success: false, error: 'Missing id' }, 400);

      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        console.log('[updateDiscount] id=' + id + ' → "' + discount + '"');

        const sheet = getSheet(sheetId);
        ensureStatusColumn(sheet);
        const data = sheet.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][COL.id]) === String(id)) {
            sheet.getRange(i + 1, COL.discount + 1).setValue(discount);
            found = true;
            break;
          }
        }

        clearRecordCache(sheetId);
        console.log('[updateDiscount] id=' + id + ' found=' + found);
        if (found) return jsonResponse({ success: true });
        return jsonResponse({ success: false, error: 'Record not found' }, 404);
      } catch (err) {
        console.error('[updateDiscount] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'fetchUrl') {
      const url = e?.parameter?.url || '';
      if (!url) return jsonResponse({ success: false, error: 'Missing url' }, 400);
      console.log('[fetchUrl] fetching: ' + url);
      try {
        const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, timeout: 10 });
        const html = r.getContentText();
        const found = html.match(/\b(\d{17})\b/);
        return jsonResponse({ success: true, ticket: found ? found[1] : '', htmlLength: html.length });
      } catch (err) {
        console.error('[fetchUrl] error: ' + err.toString());
        return jsonResponse({ success: false, error: err.toString() }, 500);
      }
    }

    return jsonResponse({ success: false, error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[doGet] error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() }, 500);
  }
}

// ============================================================
// DO POST — เพิ่มข้อมูล (พร้อมรูป)
// ============================================================
function doPost(e) {
  console.log('[doPost] CALLED | paramKeys=' + Object.keys(e?.parameter||{}).join(',') + ' | postData=' + (e?.postData ? 'yes:'+typeof e.postData.contents : 'no'));
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    let data;
    if (e?.parameter?.data) {
      // form-urlencoded (URLSearchParams) — วิธีที่ GAS redirect ทำงานได้ดีที่สุด
      try { data = JSON.parse(e.parameter.data); }
      catch { return jsonResponse({ success: false, error: 'Invalid JSON in data field' }, 400); }
    } else if (e?.postData?.contents) {
      // text/plain fallback
      try { data = JSON.parse(e.postData.contents); }
      catch { data = e?.parameter || {}; }
    } else if (e?.parameter) {
      data = e.parameter;
    } else {
      return jsonResponse({ success: false, error: 'No data received' }, 400);
    }

    // ตรวจสอบข้อมูลที่จำเป็น
    console.log('[doPost] data keys: ' + Object.keys(data).join(',') + ' | photo len: ' + ((data.photo||'').length) + ' | sheetId: ' + (data.sheetId||''));
    const name = String(data.name || '').trim();
    const ticketNo = String(data.ticketNo || '').trim();
    const department = String(data.department || '').trim();
    const timeType = String(data.timeType || '').trim();
    const vehicleType = String(data.vehicleType || '').trim();
    const sheetId = String(data.sheetId || '').trim();
    const folderId = String(data.folderId || '').trim();

    if (!name) return jsonResponse({ success: false, error: 'กรุณากรอกชื่อ-นามสกุล' }, 400);
    if (!ticketNo || ticketNo.length !== 17) return jsonResponse({ success: false, error: 'เลขบัตรจอดรถต้องมี 17 หลัก' }, 400);

    const id = generateId();
    const createdAt = new Date(); // เป็น Date object → Sheet เก็บเป็นตัวเลข serial
    // ☁️ รับ photoUrl จาก Cloudinary โดยตรง (frontend upload ไม่ผ่าน GAS)
    const photoUrl = String(data.photoUrl || '').trim();
    console.log('[doPost] photoUrl=' + (photoUrl ? 'yes[' + photoUrl.length + ']' : 'no'));

    // บันทึกลง Google Sheet
    const sheet = getSheet(sheetId);
    sheet.appendRow([
      id,
      name,
      String(data.nickname || '').trim(),
      String(data.phone || '').trim(),
      department,
      timeType,
      vehicleType,
      ticketNo,
      photoUrl,
      createdAt,
      'รออนุมัติ',
      String(data.discount || '').trim()
    ]);

    clearRecordCache(sheetId);
    console.log('[doPost] created: ' + id + ' (' + name + ') photo=' + (photoUrl ? 'yes' : 'no'));
    return jsonResponse({ success: true, id, photoUrl, message: '✅ บันทึกข้อมูลสำเร็จ' });
  } catch (err) {
    console.error('[doPost] error: ' + err.toString());
    return jsonResponse({ success: false, error: err.toString() }, 500);
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 📸 อัปโหลดรูปไป Google Drive
// ============================================================
function uploadPhotoToDrive(base64Data, recordId, name, folderId) {
  console.log('[upload] 🔥 ENTERED uploadPhotoToDrive base64Type=' + typeof base64Data + ' recordId=' + recordId);
  try {
    // Guard — ถ้า base64Data ไม่ใช่ string ให้ log แล้ว skip
    if (typeof base64Data !== 'string' || !base64Data) {
      console.error('[upload] SKIP: invalid base64Data type=' + typeof base64Data + ' len=' + (base64Data||'').length);
      return '';
    }

    // แยก mime type และ base64 data (รองรับ data URL และ raw base64)
    let mimeType = 'image/jpeg';
    let rawData = base64Data;

    if (base64Data.includes(',')) {
      const parts = base64Data.split(',');
      const header = parts[0] || '';
      if (header.includes('png')) mimeType = 'image/png';
      else if (header.includes('gif')) mimeType = 'image/gif';
      else if (header.includes('webp')) mimeType = 'image/webp';
      rawData = parts[1] || '';
    }

    console.log('[upload] mime=' + mimeType + ' rawData_len=' + rawData.length);

    const decoded = Utilities.base64Decode(rawData);
    console.log('[upload] decoded bytes=' + decoded.length);

    const blob = Utilities.newBlob(decoded, mimeType, `stamp-${recordId}-${name}.jpg`);

    // หาโฟลเดอร์ — ใช้ folderId จาก request ก่อน, fallback เป็นค่า hardcode
    let folder;
    const fid = (folderId && folderId !== '') ? folderId : FOLDER_ID;
    console.log('[upload] using folderId=' + fid);
    if (fid && fid !== 'YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE') {
      folder = DriveApp.getFolderById(fid);
    } else {
      // ถ้าไม่ได้ตั้งค่าโฟลเดอร์ ให้สร้างใน Drive root
      folder = DriveApp.createFolder('Stamp Parking Photos');
    }

    const file = folder.createFile(blob);
    file.setDescription(`Stamp Parking — ${name} (${recordId})`);
    // เปิดสิทธิ์ให้ Anyone with link อ่านได้ (จำเป็นสำหรับแสดงรูปในหน้าเว็บ)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const url = `https://drive.google.com/uc?export=view&id=${file.getId()}`;
    console.log('[upload] success url=' + url);
    return url;
  } catch (err) {
    console.error('[upload] FAILED: ' + err.toString() + ' | stack: ' + err.stack);
    return ''; // ถ้าอัปโหลดรูปไม่สำเร็จ ให้บันทึกข้อมูลส่วนอื่นต่อไป
  }
}

// ============================================================
// 📊 ดึงข้อมูลทั้งหมด
// ============================================================
function getAllRecords(sheetId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = getCacheKey(sheetId);
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('[getAll] cache HIT');
    return { success: true, data: JSON.parse(cached) };
  }
  console.log('[getAll] cache MISS — reading Sheet');

  const sheet = getSheet(sheetId);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    console.log('[getAll] empty sheet');
    return { success: true, data: [] };
  }

  // ถ้า sheet เก่ายังไม่มีคอลัมน์ status → เพิ่ม header
  ensureStatusColumn(sheet);

  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[COL.id]) continue; // ข้ามแถวว่าง
    records.push({
      id: String(row[COL.id] || ''),
      name: String(row[COL.name] || ''),
      nickname: String(row[COL.nickname] || ''),
      phone: String(row[COL.phone] || ''),
      department: String(row[COL.dept] || ''),
      timeType: String(row[COL.timeType] || ''),
      vehicleType: String(row[COL.vehicle] || ''),
      ticketNo: String(row[COL.ticketNo] || ''),
      photo: String(row[COL.photo] || ''),
      createdAt: row[COL.createdAt] instanceof Date ? Utilities.formatDate(row[COL.createdAt], 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss'Z'") : String(row[COL.createdAt] || ''),
      status: String(row[COL.status] || 'รออนุมัติ'),
      discount: String(row[COL.discount] || '')
    });
  }

  // เรียงลำดับล่าสุดก่อน
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  cache.put(cacheKey, JSON.stringify(records), 600);
  console.log('[getAll] cached ' + records.length + ' records');
  return { success: true, data: records };
}

// ============================================================
// 🛠 Utility Functions
// ============================================================

function getSheet(sheetId) {
  const id = (sheetId && sheetId !== '') ? sheetId : SHEET_ID;
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName('Stamp Parking');
  if (!sheet) {
    sheet = ss.insertSheet('Stamp Parking');
    sheet.appendRow([
      'ID', 'ชื่อ-นามสกุล', 'ชื่อเล่น', 'เบอร์ติดต่อ',
      'หน่วยงาน', 'ประเภทการลงเวลา', 'ยานพาหนะ',
      'เลขบัตรจอดรถ', 'รูปภาพ (URL)', 'วันที่บันทึก', 'สถานะ', 'ส่วนลด'
    ]);
    sheet.setFrozenRows(1);
    // จัดความกว้างคอลัมน์
    sheet.setColumnWidths(1, 12, 180);
    // ฟอร์แมตคอลัมน์ Ticket No. (คอลัมน์ H = 8) เป็นข้อความ ป้องกันเลข 0 ต้นหาย
    sheet.getRange('H:H').setNumberFormat('@');
  }
  // ป้องกันเลข 0 ต้นหายในคอลัมน์ Ticket No.
  sheet.getRange('H:H').setNumberFormat('@');
  // ฟอร์แมตวันที่ (คอลัมน์ I) เป็นไทย
  sheet.getRange('I:I').setNumberFormat('dd"/"mm"/"yyyy" "HH":"MM');
  return sheet;
}

// ถ้า sheet เก่าที่ยังไม่มีคอลัมน์ "สถานะ" หรือ "ส่วนลด" ให้เพิ่มให้
function ensureStatusColumn(sheet) {
  const h = sheet.getRange(1, COL.status + 1).getValue();
  if (!h || h === '') {
    sheet.getRange(1, COL.status + 1).setValue('สถานะ');
  }
  const d = sheet.getRange(1, COL.discount + 1).getValue();
  if (!d || d === '') {
    sheet.getRange(1, COL.discount + 1).setValue('ส่วนลด');
  }
}

// ============================================================
// Cache helpers
// ============================================================
function getCacheKey(sheetId) {
  return 'recs_' + (sheetId || SHEET_ID);
}
function clearRecordCache(sheetId) {
  CacheService.getScriptCache().remove(getCacheKey(sheetId));
  console.log('[cache] cleared for sheet');
}

// ============================================================
// ID generator
// ============================================================
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result + Date.now().toString(36);
}

function jsonResponse(data, status = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
