// ===================================================================
//  CONFIG
// ===================================================================
const CFG_KEY='sp_config';const CACHE_KEY='sp_cache';const HIST_KEY='sp_history';
// 🔧 ใส่ GAS URL ตรงนี้ — จะใช้เป็นค่าเริ่มต้นทุกเครื่อง ไม่ต้องตั้งซ้ำ
const GAS_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbwEK_PhSzpOIqMP8w2gPLDqRRGCE5bwF4M5aBaAdm5NbI96m3jw70ekKJxnygdXnL-5Ug/exec'
// URL ของ GAS deployment เก่าที่ถูกยกเลิก/ตายแล้ว (ตรวจแล้วว่า HTTP 404 — 2026-08-11)
// — ถ้าผู้ใช้ยังจำไว้ใน localStorage ให้สลับเป็น default ทันทีโดยไม่ต้อง probe
// ⚠️ เวลา deploy เปลี่ยน GAS_URL_DEFAULT ใหม่ ให้ย้าย URL เดิมที่ตายแล้วมาใส่ลิสต์นี้
const DEAD_GAS_URLS = [
  'https://script.google.com/macros/s/AKfycbwRr997ntoBpI93DQkinNSyL8BHWCNwceuusPP7OnLMOTqiMKXQhB2V8rdtgV9wnObAIw/exec',
  'https://script.google.com/macros/s/AKfycbwgx355bMSszx-tcXQqLGRBdrkwmiTeK_yyjUUSClXAkgwYAFR-wzXez9jEYXKIoReVkQ/exec',
  'https://script.google.com/macros/s/AKfycbwy_2GGRdGIQHgTmO-1-coPTfapSSMyFw5P7VfW2ztW1EMc6f-D0kowRPfLdR5kukGZGA/exec',
  'https://script.google.com/macros/s/AKfycbx4J2qPdNOzE_bmfny9-tHWYv9wxS38ksnCXAk2jhI4mRtDjm-gOnn8dhw14dnkxPTB/exec',
  'https://script.google.com/macros/s/AKfycbxiqPxfi9IW4IRsumEUkStm0H6eds0n-glO0UZ1a3Qu9deO1o1Y7CXxyuy-Q5up0AhVPA/exec',
  'https://script.google.com/macros/s/AKfycbyVljBq2AMV5OdW2SS5jV0C-XZpXJjvVishHL2ouAQcrgNzGSbcE79KcB7_oqg7TlkA/exec',
  'https://script.google.com/macros/s/AKfycbysMdsSXm_q6xnWnqYHTtSBV6dKj34T2lNW4ujz2c0vvWdWoFqKM6wT8RJvuKLSxKXJNQ/exec',
  'https://script.google.com/macros/s/AKfycbzBedCkLdCb7dv0QgxOPjqJ4QjcKENQ3jH8OVudEXEiHsbq1BVAu-RG38K5Ffm32GsPmw/exec',
];
function cfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY))||{url:GAS_URL_DEFAULT}}catch{return{url:GAS_URL_DEFAULT}}}
// Self-heal: ถ้า URL ที่บันทึกใน localStorage พัง ให้ใช้ GAS_URL_DEFAULT แทนชั่วคราว
let _urlOverride=null;
function gasUrl(){return _urlOverride||cfg().url}

// ตรวจสอบว่า URL ที่บันทึกไว้ใช้ได้หรือไม่ ถ้าไม่ได้ให้สลับไป GAS_URL_DEFAULT
// (แก้ปัญหาเครื่องเก่าที่จำ URL รุ่นเก่าไว้ใน localStorage แล้วเชื่อมต่อไม่ได้)
let _urlHealTried=false;
async function healUrl(){
  if(_urlHealTried) return;
  _urlHealTried=true;
  // ทดสอบ Local (localhost/127.0.0.1) → ข้าม self-heal เพื่อไม่ไปแตะ GAS ตัวจริง
  if(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(cfg().url)) return;
  // URL เก่าที่รู้ว่าตายแล้ว (จาก DEAD_GAS_URLS) → heal ทันทีแบบไม่ต้อง probe
  // (กรณีหน้า HTML เก่าจากแคชฝัง URL ตายไว้แล้ว localStorage ก็จำตัวเก่า — เท่ากับ GAS_URL_DEFAULT เก่าทั้งคู่
  //  ตรวจตรงนี้ก่อนเช็คเท่ากัน default เพราะไม่เช่นนั้น early-return ตัวล่างจะข้าม heal ไป)
  if(DEAD_GAS_URLS.includes(cfg().url)){
    _urlOverride=GAS_URL_DEFAULT;
    const c=cfg();c.url=GAS_URL_DEFAULT;localStorage.setItem(CFG_KEY,JSON.stringify(c));
    syncSetupInputs();updateSetupUI();
    toast('🔄 อัปเดต Web App URL เป็นค่าล่าสุดเรียบร้อย','i');
    return;
  }
  if(cfg().url===GAS_URL_DEFAULT) return; // ใช้ดีฟอลต์ล่าสุดอยู่แล้ว
  const saved=await get('getAll');
  if(saved.success) return; // URL เดิมยังใช้ได้
  // ✅ 401 Unauthorized / token หมดอายุ = เซิร์ฟเวอร์ตอบกลับแล้ว (URL ยังใช้ได้)
  //    แค่ยังไม่ได้ล็อกอิน — ไม่ใช่ URL พัง → ข้าม heal (กันเสีย 2 request เปล่าทุกครั้งก่อนล็อกอิน)
  if (saved.error && /\b(unauthorized|invalid or missing token|token)\b/i.test(saved.error)) return;
  // ลองดีฟอลต์ — ถ้ายังตอบกลับ (สำเร็จหรือ 401) ให้ใช้ GAS_URL_DEFAULT และบันทึกถาวร
  _urlOverride=GAS_URL_DEFAULT;
  const fb=await get('getAll');
  // 401/token error จาก default = ยังตอบกลับอยู่ (แค่ยังไม่ล็อกอิน) → default ยังใช้ได้ → heal
  // (แก้บัค anonymous: ผู้ใช้ไม่ล็อกอิน probe default คืน 401 เสมอ → เดิม fb.success=false
  //  สรุปผิดว่า default ตาย → ไม่ heal → POST ไป URL ตาย → "❌ Network error")
  if(fb.success || (fb.error && /\b(unauthorized|invalid or missing token|token)\b/i.test(fb.error))){
    const c=cfg();c.url=GAS_URL_DEFAULT;localStorage.setItem(CFG_KEY,JSON.stringify(c));
    syncSetupInputs();updateSetupUI();
    toast('🔄 อัปเดต Web App URL เป็นค่าล่าสุดเรียบร้อย','i');
  }else{
    _urlOverride=null; // default ตายจริงด้วย → คืนค่าเดิม (ปล่อยให้แจ้ง error ตามปกติ)
  }
}

// Determine active layout
function isDesktop(){return window.innerWidth>=768}

function domId(prefix,id){
  // Map shared IDs to the right prefix based on current layout
  if(isDesktop()) return 'desk'+id.charAt(0).toUpperCase()+id.slice(1)
  return 'mob'+id.charAt(0).toUpperCase()+id.slice(1)
}
function q(id){return document.getElementById(id)}
