// ===================================================================
//  URL SETUP
// ===================================================================
// กัน URL ผิดชนิดที่วางกันบ่อย (เช่น ก็อป URL หน้า Script Editor แทน URL
// ของ deployment) — localhost/127.0.0.1 (mock server ทดสอบในเครื่อง) ผ่านเสมอ
function isLikelyValidGasUrl(url){
  if(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$|\?)/i.test(url)) return true
  if(!/^https:\/\//i.test(url)) return false
  if(/^https:\/\/script\.google\.com\//i.test(url)){
    // URL deployment จริงต้องลงท้าย /exec หรือ /dev — /edit หรือ /home/... = URL หน้า Editor
    return /\/(exec|dev)(\/)?(\?.*)?$/i.test(url)
  }
  return true
}
function saveUrl(){
  const p=isDesktop()?'desk':'mob'
  const c=cfg()
  const url=document.getElementById(p+'GasUrl').value.trim()
  if(!url) return toast('⚠️ กรุณาใส่ URL','e')
  if(!isLikelyValidGasUrl(url)) return toast('⚠️ URL นี้ไม่ใช่ Web App URL ที่ถูกต้อง — ต้องได้จาก Deploy → New deployment และลงท้ายด้วย /exec (ไม่ใช่ URL หน้า Editor)','e')
  c.url=url
  c.sheetId=document.getElementById(p+'SheetId').value.trim()
  c.folderId=document.getElementById(p+'FolderId').value.trim()
  localStorage.setItem(CFG_KEY,JSON.stringify(c))
  syncSetupInputs();updateSetupUI()
  toast('✅ บันทึกแล้ว','s')
  setConn(true)
  refresh()
}
function saveSheetId(){
  const p=isDesktop()?'desk':'mob'
  const c=cfg()
  c.sheetId=document.getElementById(p+'SheetId').value.trim()
  localStorage.setItem(CFG_KEY,JSON.stringify(c))
  syncSetupInputs()
  toast('✅ บันทึก Sheet ID แล้ว','s')
}
function saveFolderId(){
  const p=isDesktop()?'desk':'mob'
  const c=cfg()
  c.folderId=document.getElementById(p+'FolderId').value.trim()
  localStorage.setItem(CFG_KEY,JSON.stringify(c))
  syncSetupInputs()
  toast('✅ บันทึก Folder ID แล้ว','s')
}
function syncSetupInputs(){
  const c=cfg()
  const m=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||''}
  m('deskGasUrl',c.url);m('mobGasUrl',c.url)
  m('deskSheetId',c.sheetId);m('mobSheetId',c.sheetId)
  m('deskFolderId',c.folderId);m('mobFolderId',c.folderId)
}

// Force sync default URL on load if no saved config
if(!localStorage.getItem(CFG_KEY)){
  const c = cfg()
  const m=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||''}
  m('deskGasUrl',c.url);m('mobGasUrl',c.url)
}
function resetToDefault(){
  localStorage.removeItem(CFG_KEY)
  // Don't clear token - keep user logged in
  syncSetupInputs()
  updateSetupUI()
  toast('🔄 รีเซ็ต Web App URL แล้ว (ยังล็อกอินอยู่)','s')
  refresh()
}
function updateSetupUI(){
  const ok=!!cfg().url
  ;['deskSetupBanner','mobSetupBanner'].forEach(id=>{
    const el=document.getElementById(id)
    if(el){if(ok)el.classList.remove('show');else el.classList.add('show')}
  })
}
syncSetupInputs();updateSetupUI()

// ===================================================================
//  CONNECTION TEST — testConn() ย้ายจากบล็อก CONNECTION เดิม (ผูกกับ
//  URL/Sheet/Folder ID input โดยตรง — setConn() อยู่ auth.js)
// ===================================================================
async function testConn(){
  const p=isDesktop()?'desk':'mob'
  const c=cfg()
  const url=document.getElementById(p+'GasUrl').value.trim()
  if(!url)return toast('⚠️ กรุณาใส่ URL ก่อน','e')
  if(!isLikelyValidGasUrl(url)) return toast('⚠️ URL นี้ไม่ใช่ Web App URL ที่ถูกต้อง — ต้องได้จาก Deploy → New deployment และลงท้ายด้วย /exec (ไม่ใช่ URL หน้า Editor)','e')
  c.url=url
  c.sheetId=document.getElementById(p+'SheetId').value.trim()
  c.folderId=document.getElementById(p+'FolderId').value.trim()
  localStorage.setItem(CFG_KEY,JSON.stringify(c))
  syncSetupInputs()
  showLoad('กำลังทดสอบ...')
  setConn(false)
  try{
    const r=await get('getAll')
    console.log('[testConn] response:', r)
    if(r.success){
      setCache(r.data);setConn(true)
      toast('✅ เชื่อมต่อสำเร็จ! พบ '+r.data.length+' รายการ','s')
      render();updBadge();updateSyncTime();updateBell();updateSetupUI()
      const tb=document.getElementById(p+'TestBtn')
      if(tb){tb.className='btn btn-s btn-sm';tb.innerHTML='✅ เชื่อมต่อแล้ว';setTimeout(()=>{tb.className='btn btn-o btn-sm';tb.innerHTML='📡 ทดสอบ'},3000)}
    }else toast('❌ '+(r.error||'เชื่อมต่อล้มเหลว'),'e')
  }catch(e){
    console.error('[testConn] catch:', e)
    toast('❌ Error: '+e.message,'e')
  }
  hideLoad()
}
