// ===================================================================
//  INIT
// ===================================================================
if(!cfg().seenAt){const c=cfg();c.seenAt=new Date().toISOString();localStorage.setItem(CFG_KEY,JSON.stringify(c))}
// Debug helper - type in console: clearAllData()
window.clearAllData = () => {
  localStorage.clear();
  toast('🧹 ล้าง localStorage ทั้งหมดแล้ว - โหลดหน้าใหม่','s');
  setTimeout(() => location.reload(), 1000);
}
// ตั้งค่าเริ่มต้นฟอร์ม
resetForm('desk');resetForm('mob');initDatalists()
// ประกาศแบนเนอร์ (ข้อความจาก ANNOUNCE_TEXT — ฝังในโค้ด)
initAnnounce()
// filter วันที่ (จาก/ถึง) ค่าเริ่มต้น = วันนี้ (โชว์ข้อมูลวันนี้) — ผู้ใช้เปลี่ยน/ล้างได้เอง
initDateDefaults()
// โหลดข้อมูล Dashboard เฉพาะเมื่อมี token (ล็อกอินแล้ว) เท่านั้น
// ผู้ใช้ทั่วไปที่แค่บันทึกข้อมูลไม่ต้องเรียก getAll (ที่ต้อง auth) → เลี่ยง 401 ที่ทำให้เด้ง "เชื่อมต่อไม่ได้"
if(gasUrl() && getToken())refresh()
if(getToken())renderUserMgmt()
removeLegacyPinKeys()

// init: <head> กัน FOUC ไปแล้ว — ที่นี่อัปเดต label ปุ่มให้ตรงกับธีมปัจจุบัน
// (applyTheme() นิยามใน js/ui-shell.js — เรียกตัวสุดท้ายหลังทุกอย่างพร้อม)
applyTheme(document.documentElement.getAttribute('data-theme')||'light')
