// ===================================================================
//  UTILITY
// ===================================================================
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}
// CSV field: ล้อม " + เอา " ภายในออกเป็น "" + กัน formula injection (= + - @ ขึ้นต้น → ใส่ ' นำหน้า)
function csvField(s){
  let v=s==null?'':String(s)
  if(/^[=+\-@\t\r]/.test(v)) v="'"+v
  return '"'+v.replace(/"/g,'""')+'"'
}
function toast(msg,t='s'){
  const c=document.getElementById('toasts');const el=document.createElement('div')
  el.className='toast '+t;el.textContent=msg;c.appendChild(el)
  setTimeout(()=>{el.style.animation='so .25s ease forwards';setTimeout(()=>el.remove(),250)},2800)
}
function showLoad(t){
  const el=document.getElementById('loadingText');if(el)el.textContent=t||'กำลังโหลด...'
  const ov=document.getElementById('loadingOverlay');if(ov)ov.classList.add('show')
}
function hideLoad(){
  const ov=document.getElementById('loadingOverlay');if(ov)ov.classList.remove('show')
}
