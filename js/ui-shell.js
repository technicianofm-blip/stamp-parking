// ===================================================================
//  ACCESSIBILITY — focus trap modal + auto label + openModal (โฟกัส)
// ===================================================================
let _lastFocus=null
// 🔁 แสดง modal ข้อมูลซ้ำ — ข้อมูลเดิมที่ลงไว้ก่อนหน้า (ไม่ใช้ innerHTML กัน XSS)
function showDuplicate(ex){
  const fmt=d=>{const t=new Date(d);return isNaN(t)?'—':t.toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v}
  set('dupName',ex.name||'—');set('dupDept',ex.department||'—')
  set('dupTimeType',ex.timeType||'—');set('dupVehicle',ex.vehicleType||'—')
  set('dupCreated',fmt(ex.createdAt));set('dupStatus',ex.status||'—')
  const wrap=document.getElementById('dupPhotoWrap'),img=document.getElementById('dupPhoto')
  if(ex.photo&&img){img.src=ex.photo;if(wrap)wrap.style.display='block'}else if(wrap){wrap.style.display='none'}
  openModal('dupModal')
}
function openModal(id){
  const m=document.getElementById(id)
  if(!m)return
  _lastFocus=document.activeElement
  m.classList.add('show')
  setTimeout(()=>{
    const el=m.querySelector('.modal-close,button,input,select,textarea')
    if(el&&typeof el.focus==='function')el.focus()
  },50)
}
// Tab ใน modal → วนอยู่ใน modal; Esc → ปิด modal (แยกกรณี login/scan)
document.addEventListener('keydown',e=>{
  const m=document.querySelector('.modal.show')
  if(!m)return
  if(e.key==='Escape'){
    const id=m.id
    if(id==='loginModal')closeLoginModal()
    else if(id==='scanModal')closeScan()
    else closeModal(id)
    return
  }
  if(e.key!=='Tab')return
  const f=m.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
  if(!f.length)return
  const first=f[0],last=f[f.length-1]
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  else if(!m.contains(document.activeElement)){e.preventDefault();first.focus()}
})
// เชื่อม label ใน .form-group กับ input ให้ screen reader รู้ชื่อช่อง
;['desk','mob'].forEach(p=>{
  document.querySelectorAll('#'+p+'Form .form-group').forEach(g=>{
    const l=g.querySelector('label'),inp=g.querySelector('.form-control,select,textarea')
    if(l&&inp&&!inp.getAttribute('aria-label'))inp.setAttribute('aria-label',l.textContent.replace('*','').trim())
  })
})

// ===================================================================
//  DELETE — closeModal() ย้ายมาจากบล็อก DELETE เดิม (คู่กับ openModal
//  ข้างบน — ทั้งคู่เป็นกลไก modal เดียวกัน)
// ===================================================================
function closeModal(id){document.getElementById(id).classList.remove('show');delId=null;if(_lastFocus&&_lastFocus.focus)_lastFocus.focus()}

// ===================================================================
//  NAVIGATION
// ===================================================================
function go(page, _authed){
  // Protected pages that require authentication
  const protectedPages = ['dash', 'setup'];
  // เด้งล็อกอินเฉพาะตอนยังไม่ล็อกอิน (token หมดอายุ/ยังไม่เข้า)
  // (_authed=true ใช้ตอน login พาไปหน้าเป้าหมายหลังล็อกอินสำเร็จ)
  if (protectedPages.includes(page) && !_authed && !getToken()) {
    showLoginModal(page);  // Pass target page
    return;
  }

  const isD=isDesktop()
  const prefix=isD?'desk':'mob'
  const layoutCls=isD?'desktop':'mobile'

  // Hide all pages in current layout
  document.querySelectorAll(`.${layoutCls}-layout .page`).forEach(el=>el.classList.remove('active'))
  // Show target page
  const target=document.getElementById(prefix+'-page-'+page)
  if(target)target.classList.add('active')

  // Update nav
  if(isD){
    document.querySelectorAll('.sidebar-item').forEach(el=>el.classList.remove('active'))
    const active=document.querySelector(`.sidebar-item[data-page="${page}"]`)
    if(active)active.classList.add('active')
  } else {
    document.querySelectorAll('.bottom-item').forEach(el=>el.classList.remove('active'))
    const active=document.querySelector(`.bottom-item[data-page="${page}"]`)
    if(active)active.classList.add('active')
  }

  if(page==='dash') refresh()
  if(page==='setup') renderUserMgmt()
}

// ===================================================================
//  MODAL CLOSE
// ===================================================================
document.querySelectorAll('.modal').forEach(el=>{
  el.addEventListener('click',function(e){if(e.target===this){this.classList.remove('show');delId=null}}
)})
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){document.querySelectorAll('.modal').forEach(m=>m.classList.remove('show'));delId=null}
})

// ===================================================================
//  MOBILE KEYBOARD — เลื่อนช่องกรอกให้พ้นแป้นพิมพ์ตอน focus (มือถือ)
//  แป้นพิมพ์บนมือถือกินพื้นที่จอ → เลื่อน input ที่ focus ขึ้นกลางจอให้เห็นชัด
//  (รอ 350ms ให้แป้นพิมพ์เลื่อนขึ้นเสร็จก่อน แล้วค่อย scroll ไปหา field)
// ===================================================================
if (window.matchMedia('(max-width:767px)').matches && 'scrollIntoView' in document.documentElement) {
  document.querySelectorAll('.form-control').forEach(el => {
    el.addEventListener('focus', () => {
      setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (e) {} }, 350);
    });
  });
}

// ===================================================================
//  THEME SYSTEM — Dark / Light (toggle ที่ sidebar + mobile header)
// ===================================================================
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t)
  try{localStorage.setItem('sp_theme',t)}catch(e){}
  document.querySelectorAll('.th-icon').forEach(el=>el.textContent=t==='dark'?'☀️':'🌙')
  document.querySelectorAll('.th-label').forEach(el=>el.textContent=t==='dark'?'โหมดสว่าง':'โหมดมืด')
}
function toggleTheme(){
  const cur=(document.documentElement.getAttribute('data-theme')||'light')==='dark'?'light':'dark'
  applyTheme(cur)
}
