// ===================================================================
//  FORM
// ===================================================================
function resetForm(p){
  const form=document.getElementById(p+'Form')
  if(form)form.reset()
  clrPhoto(p);_photoData[p]=null
  document.querySelectorAll(`#${p}Form .err-msg`).forEach(e=>e.classList.remove('show'))
  document.querySelectorAll(`#${p}Form .form-control, #${p}Form .dropzone`).forEach(e=>e.classList.remove('err'))
  // ค่าเริ่มต้น = เข้างาน
  const tt=document.getElementById(p+'TimeType')
  if(tt&&!tt.value)tt.value='เข้างาน'
}
function eShow(id){const el=document.getElementById(id);if(el)el.classList.add('show')}
function eHide(id){const el=document.getElementById(id);if(el)el.classList.remove('show')}
function fieldErr(fieldId){
  const el=document.getElementById(fieldId)
  if(el){el.classList.add('err');const msg=document.getElementById(fieldId+'Err');if(msg)msg.classList.add('show')}
}

// สถานะฟอร์มที่ค้างอยู่ตอนเจอซ้ำ — ไว้กด "จำเป็นต้องบันทึก" แล้วส่งต่อ
let _dupResume=null
async function saveRec(e,force){
  e&&e.preventDefault()
  const p=isDesktop()?'desk':'mob'
  await healUrl(); // ตรวจสอบ/สลับ URL หาก URL เก่าพัง
  // Clear errors
  document.querySelectorAll(`#${p}Form .err-msg`).forEach(el=>el.classList.remove('show'))
  document.querySelectorAll(`#${p}Form .form-control`).forEach(el=>el.classList.remove('err'))

  const n=document.getElementById(p+'Name').value.trim()
  const nn=document.getElementById(p+'Nickname').value.trim()
  const ph=document.getElementById(p+'Phone').value.trim()
  const d=document.getElementById(p+'Dept').value
  const t=document.getElementById(p+'TimeType').value
  const v=document.getElementById(p+'Vehicle').value
  const tk=document.getElementById(p+'Ticket').value.trim()
  const photo=_photoData[p]||null

  let ok=true
  if(!n){fieldErr(p+'Name');ok=false}
  if(ph&&ph.length!==10){fieldErr(p+'Phone');ok=false}
  if(!d){fieldErr(p+'Dept');ok=false}
  if(!t){fieldErr(p+'TimeType');ok=false}
  if(!v){fieldErr(p+'Vehicle');ok=false}
  if(!tk||tk.length!==17){fieldErr(p+'Ticket');ok=false}

  // ✅ ตรวจสอบรูปภาพ - บังคับถ่ายรูป (ชี้ error ที่ช่องรูป ไม่ใช่ช่องเลขบัตร)
  if(!photo){
    const dz=document.getElementById(p+'Dropzone');if(dz)dz.classList.add('err')
    eShow(p+'PhotoErr')
    toast('⚠️ กรุณาถ่ายรูปหรือเลือกรูปภาพ','e');ok=false
  }

  if(!ok) return
  if(!gasUrl()) return toast('⚠️ ยังไม่ได้ตั้งค่า API','e')

  // 🔁 ตรวจซ้ำฝั่ง client (best-effort จาก cache) ก่อนอัปโหลดรูป — เจอแล้วขึ้น modal รอตัดสินใจ (ยกเว้นกำลัง force)
  if(!force){
    const dupC=cacheR().find(x=>x.ticketNo===tk&&bkkDay(x.createdAt)===bkkDay(new Date().toISOString()))
    if(dupC){_dupResume={p,n,nn,ph,d,t,v,tk,photo};showDuplicate(dupC);return}
  }
  await submitRecord({p,n,nn,ph,d,t,v,tk,photo,force:!!force})
}

// 🔁 บันทึกข้อมูลจริง (upload รูป + POST) — แยกจาก saveRec เพื่อให้ modal "จำเป็นต้องบันทึก" เรียกซ้ำได้
async function submitRecord(st){
  const p=st.p
  const btn=document.getElementById(p+'SubmitBtn');btn.disabled=true;btn.innerHTML='<span class="spin"></span> กำลังบันทึก...'

  // ☁️ อัปโหลดรูปไป Cloudinary ก่อนส่งข้อมูล (ไม่ต้องผ่าน GAS) — ข้ามถ้ามี photoUrl อยู่แล้ว (กรณี force หลังเจอซ้ำ backend)
  let photoUrl=st.photoUrl||''
  if(st.photo && !photoUrl){
    btn.innerHTML='<span class="spin"></span> กำลังอัปโหลดรูป...'
    photoUrl=await uploadToCloudinary(st.photo)
    if(!photoUrl) toast('⚠️ อัปโหลดรูปไม่สำเร็จ จะบันทึกเฉพาะข้อมูล','i')
  }

  try{
    const r=await post({name:st.n,nickname:st.nn,phone:st.ph,department:st.d,timeType:st.t,vehicleType:st.v,ticketNo:st.tk,photoUrl,forceDuplicate:st.force||false})
    // 🔁 เจอข้อมูลซ้ำฝั่ง backend → เก็บสถานะไว้ แล้วแสดง modal (กด "จำเป็นต้องบันทึก" จะส่งต่อแบบ force)
    if(r.duplicate && r.existing){_dupResume={...st,photoUrl};showDuplicate(r.existing);return}
    if(r.success){
      if(r.forced) toast('✅ '+r.message+' (ข้ามข้อมูลซ้ำ)','s')
      else if(photoUrl) toast('✅ '+r.message+' 📸','s')
      else toast('✅ '+r.message,'s')
      saveFormHistory(st.n,st.nn,st.ph);resetForm(p);_photoData[p]=null
      // อัปเดต cache ท้องถิ่นจาก response POST (ไม่ต้อง refresh -> getAll ที่ต้อง auth)
      if(r.id){
        const c=cacheR()
        c.unshift({id:r.id,name:st.n,nickname:st.nn,phone:st.ph,department:st.d,timeType:st.t,vehicleType:st.v,ticketNo:st.tk,photo:r.photoUrl||'',createdAt:new Date().toISOString(),status:'รออนุมัติ',discount:''})
        setCache(c)
      }
      updBadge();render()
      // ข้อมูลที่ผู้ใช้บันทึกเอง ไม่ควรแจ้งเตือนตัวเอง → กัน badge ขึ้น + เสียงเตือนหลังกดบันทึก (markSeen → updateBell ข้างใน)
      markSeen()
    }
    else toast('❌ '+(r.error||'บันทึกไม่สำเร็จ'),'e')
  }catch{toast('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์','e')}
  finally{btn.disabled=false;btn.innerHTML='💾 '+(p==='desk'?'บันทึกข้อมูล':'บันทึก')}
}

// 🔁 กด "จำเป็นต้องบันทึก" ใน modal ข้อมูลซ้ำ → ส่งต่อฟอร์มแบบ force (ข้ามเช็คซ้ำ)
function forceSaveDuplicate(){
  closeModal('dupModal')
  const st=_dupResume;_dupResume=null
  if(st) submitRecord({...st,force:true})
}

// ===================================================================
//  AUTO-COMPLETE HISTORY
// ===================================================================
const HIST_MAX=10
function getHist(){try{return JSON.parse(localStorage.getItem(HIST_KEY))||{name:[],nickname:[],phone:[]}}catch{return{name:[],nickname:[],phone:[]}}}
function addHist(field,val){
  if(!val)return
  const h=getHist()
  h[field]=[val,...h[field].filter(x=>x!==val)].slice(0,HIST_MAX)
  localStorage.setItem(HIST_KEY,JSON.stringify(h))
}
function saveFormHistory(n,nn,ph){
  addHist('name',n);addHist('nickname',nn);addHist('phone',ph)
  initDatalists() // refresh suggestions
}
function initDatalists(){
  const h=getHist()
  ;['desk','mob'].forEach(p=>{
    ['Name','Nickname','Phone'].forEach(f=>{
      const el=document.getElementById(p+f+'List')
      if(el)el.innerHTML=h[f.toLowerCase()].map(v=>`<option value="${v.replace(/"/g,'&quot;')}">`).join('')
    })
  })
}
