// ===================================================================
//  PHOTO — Cloudinary upload
// ===================================================================
// ไปที่ cloudinary.com → สมัคร → Dashboard → หา Cloud name
// Settings > Upload > Upload presets > Add > Signing Mode: Unsigned
const CLOUD_NAME = 'ruhoptxw'
const UPLOAD_PRESET = 'stamp_parking'

async function uploadToCloudinary(base64) {
  const fd = new FormData()
  fd.append('file', base64)
  fd.append('upload_preset', UPLOAD_PRESET)
  try {
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd })
    const d = await r.json()
    console.log('[cloudinary] uploaded:', d.secure_url)
    return d.secure_url || null
  } catch (e) {
    console.error('[cloudinary] upload failed:', e)
    return null
  }
}

let _photoData={}
function onPhoto(e,p){
  const f=e.target.files[0];if(!f)return
  compressFile(f).then(c=>{
    if(!c){toast('⚠️ ไม่สามารถอ่านรูปได้','e');return}
    showPhoto(c,p);_photoData[p]=c
  })
}
function compressFile(file,mw=500,q=.5){
  return new Promise(r=>{
    const url=URL.createObjectURL(file)
    const i=new Image()
    i.onload=()=>{
      let w=i.width,h=i.height
      if(w>mw){h*=mw/w;w=mw}
      const c=document.createElement('canvas');c.width=w;c.height=h
      c.getContext('2d').drawImage(i,0,0,w,h)
      URL.revokeObjectURL(url)
      // Convert to compressed base64
      r(c.toDataURL('image/jpeg',q))
    }
    i.onerror=()=>{URL.revokeObjectURL(url);r(null)}
    i.src=url
  })
}
function showPhoto(d,p){
  const preview=document.getElementById(p+'Preview')
  const ph=document.getElementById(p+'Ph')
  const dz=document.getElementById(p+'Dropzone')
  const act=document.getElementById(p+'PhotoAct')
  if(preview){preview.src=d;preview.style.display='block'}
  if(ph)ph.style.display='none'
  if(dz){dz.classList.add('has-photo');dz.classList.remove('err')}
  if(act)act.style.display='flex'
}
function clrPhoto(p){
  const preview=document.getElementById(p+'Preview')
  const ph=document.getElementById(p+'Ph')
  const dz=document.getElementById(p+'Dropzone')
  const act=document.getElementById(p+'PhotoAct')
  const inp=document.getElementById(p+'PhotoInput')
  if(preview){preview.src='';preview.style.display='none'}
  if(ph)ph.style.display='block'
  if(dz){dz.classList.remove('has-photo');dz.classList.remove('err')}
  if(act)act.style.display='none'
  if(inp)inp.value=''
  _photoData[p]=null
}
