// ===================================================================
//  ประกาศแบนเนอร์ (Announcement) — ฝังในโค้ด ไม่เกี่ยวกับ Backend
//  📌 เปลี่ยนข้อความที่ ANNOUNCE_TEXT (แก้ที่เดียว ใช้ทั้ง desktop + mobile)
//  ตั้ง ANNOUNCE_TEXT='' = ปิดการแสดง (ไม่ต้องลบโค้ด)
//  ปิดด้วยวิธีไหนก็ไม่จดจำ — refresh/โหลดหน้าใหม่ → แบนเนอร์กลับมาทุกครั้ง
// ===================================================================
const ANNOUNCE_TEXT = `📢 ประกาศ : แจ้งเพื่อทราบ มีการเปลี่ยนแปลง Web App

ผู้ที่ต้องการแสตมป์บัตรจอดรถ (ทั้งรถจักรยานยนต์และรถยนต์)
กรุณากรอกข้อมูลผ่าน Form ให้ครบถ้วน

รอบเวลาการแสตมป์บัตรจอดรถ เวลา 14.00 น.(เท่านั้น)

โดยสามารถแสตมป์ได้ สูงสุด 12 ชั่วโมง/วัน
(เฉพาะทีมงานที่ปฏิบัติงานเป็นควงกะเท่านั้น)

หมายเหตุ
กรุณากรอกข้อมูลให้เรียบร้อยก่อนถึงรอบเวลาที่กำหนด
หากไม่กรอกข้อมูลภายในเวลาที่กำหนด จะถือว่าไม่ปฏิบัติตามระเบียบ`;
// ข้อความที่จะไฮไลท์สีแดง — ต้องตรงกับข้อความใน ANNOUNCE_TEXT เป๊ะ (ถ้าไม่เจอจะไม่ไฮไลท์ ไม่พัง)
const ANNOUNCE_RED = 'รอบเวลาการแสตมป์บัตรจอดรถ เวลา 14.00 น.(เท่านั้น)';
function initAnnounce(){
  if(!ANNOUNCE_TEXT) return;
  if(document.querySelector('.announce-banner')) return; // กันแทรกซ้ำ
  // banner เป็น overlay ลอยกลางจอ → แนบ document.body (ไม่ต้องย้าย form/พึ่ง card)
  const formPage=document.getElementById('desk-page-form')||document.getElementById('mob-page-form');
  const form=formPage&&formPage.querySelector('form');
  if(!form) return;
  const b=document.createElement('div');
  b.className='announce-banner';
  b.setAttribute('role','status');
  const c=document.createElement('span');
  c.className='announce-text';
  // ข้อความทั้งก้อน + แยกส่วน ANNOUNCE_RED ใส่ span สีแดง
  // ใช้ textContent / createTextNode (ไม่ใช้ innerHTML) → ปลอดภัยแม้เปลี่ยนข้อความ
  const redIdx=ANNOUNCE_TEXT.indexOf(ANNOUNCE_RED);
  if(redIdx>=0){
    if(redIdx>0) c.appendChild(document.createTextNode(ANNOUNCE_TEXT.slice(0,redIdx)));
    const h=document.createElement('span');
    h.className='announce-highlight';
    h.textContent=ANNOUNCE_RED;
    c.appendChild(h);
    const after=ANNOUNCE_TEXT.slice(redIdx+ANNOUNCE_RED.length);
    if(after) c.appendChild(document.createTextNode(after));
  }else{
    c.textContent=ANNOUNCE_TEXT; // ANNOUNCE_RED ไม่ตรงกับข้อความ → โชว์เต็ม ไม่ไฮไลท์
  }
  const x=document.createElement('button');
  x.className='announce-close';x.type='button';x.setAttribute('aria-label','ปิดประกาศ');x.textContent='✕';
  // ฉากหลังหรี่ (ลดแสงข้างหลัง ~50% — แบนเนอร์อยู่ z 1000 → สว่างเต็ม 100%)
  // pointer-events:auto (CSS) → กดพื้นที่ว่างข้างนอก → ปิดแบนเนอร์
  const back=document.createElement('div');
  back.className='announce-backdrop';
  back.setAttribute('aria-hidden','true');
  b.appendChild(c);b.appendChild(x);
  document.body.appendChild(back);
  document.body.appendChild(b);
  // ——— ปิด/แสดงผล ———
  // ค้างไว้จนกว่าผู้ใช้จะปิดเอง — ปิดด้วยวิธีไหนก็แค่ปิดครั้งนี้ (ไม่จดจำ)
  // ✕ / Esc / กดพื้นที่ว่างข้างนอก (ฉากหลังหรี่) = ปิดเหมือนกันหมด
  // refresh/โหลดหน้าใหม่ → แบนเนอร์กลับมาทุกครั้ง
  // ⚠️ ไม่ auto-hide — เกรงผู้ใช้จะอ่านข้อความไม่ทัน
  const onKey=e=>{ if(e.key==='Escape') dismiss(); };
  const dismiss=()=>{
    document.removeEventListener('keydown',onKey);
    b.remove();back.remove();
  };
  x.onclick=dismiss;
  back.onclick=dismiss; // กดพื้นที่ว่าง (ฉากหลังหรี่) → ปิดครั้งนี้
  document.addEventListener('keydown',onKey);
}
