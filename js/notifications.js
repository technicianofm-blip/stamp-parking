// ===================================================================
//  BELL NOTIFICATION
// ===================================================================
function getNewCount(){
  const c=cfg()
  const seenAt=c.seenAt
  if(!seenAt) return 0
  const t=new Date(seenAt).getTime()
  return cacheR().filter(r=>new Date(r.createdAt).getTime()>t).length
}
let _bellN=0 // จำนวนข้อมูลใหม่รอบล่าสุด — กันเสียงแจ้งเตือนซ้ำ (กดรีเฟรช/สลับหน้า)
function updateBell(){
  const n=getNewCount()
  ;['deskBellBadge','mobBellBadge'].forEach(id=>{
    const el=document.getElementById(id)
    if(!el) return
    if(n>0){el.textContent=n;el.classList.add('show')}
    else el.classList.remove('show')
  })
  if(n>0 && n>_bellN) playNewDataSound(n) // 🔊 เล่นเสียงเฉพาะตอนมีข้อมูลใหม่เพิ่มขึ้น (ไม่เล่นซ้ำทุก refresh)
  _bellN=n
}
// AudioContext singleton - created lazily on first user interaction
let audioCtx = null;
let audioCtxInitialized = false;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Initialize AudioContext on first user interaction
function initAudioOnInteraction() {
  if (!audioCtxInitialized) {
    getAudioCtx();
    audioCtxInitialized = true;
  }
  // Resume if suspended (autoplay policy)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  document.removeEventListener('click', initAudioOnInteraction);
  document.removeEventListener('keydown', initAudioOnInteraction);
  document.removeEventListener('touchstart', initAudioOnInteraction);
}
['click', 'keydown', 'touchstart'].forEach(evt =>
  document.addEventListener(evt, initAudioOnInteraction, { once: true, passive: true })
);

function playNewDataSound(count){
  try{
    const ctx = getAudioCtx();
    // Ensure context is running (autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const g=ctx.createGain();g.connect(ctx.destination);g.gain.value=.15
    // Two-tone notification chime
    const o1=ctx.createOscillator();o1.type='sine';o1.frequency.value=880
    o1.connect(g);o1.start();o1.stop(ctx.currentTime+.15)
    const o2=ctx.createOscillator();o2.type='sine';o2.frequency.value=1320
    o2.connect(g);o2.start(ctx.currentTime+.18);o2.stop(ctx.currentTime+.35)
  }catch(e){/* audio not supported */}
}
function markSeen(){
  const c=cfg()
  c.seenAt=new Date().toISOString()
  localStorage.setItem(CFG_KEY,JSON.stringify(c))
  updateBell()
}

// ===================================================================
//  NOTIFICATION CENTER — กด bell เปิดรายการข้อมูลใหม่ (หลัง seenAt)
// ===================================================================
function toggleNotifPanel(){
  const p=document.getElementById('notifPanel')
  if(p.classList.contains('show')){closeNotifPanel();return}
  buildNotifList();p.classList.add('show')
}
function buildNotifList(){
  const c=cfg();const t=new Date(c.seenAt||0).getTime()
  const all=cacheR().filter(r=>new Date(r.createdAt).getTime()>t)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
  const list=all.slice(0,20)
  const el=document.getElementById('notifList')
  const empty=document.getElementById('notifEmpty')
  if(!list.length){el.innerHTML='';empty.style.display='block';empty.textContent='ไม่มีข้อมูลใหม่';return}
  empty.style.display='none'
  el.innerHTML=list.map(x=>{
    const d=new Date(x.createdAt)
    const tstr=d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})
    return `<button class="notif-item" onclick="notifOpen('${esc(x.id)}')" title="ดูรายละเอียด">
      <span class="badge ${x.department==='OFM'?'badge-ofm':'badge-pcs'}">${esc(x.department)}</span>
      <span class="notif-name">${esc(x.name)}</span>
      <span class="notif-meta">${tstr} · ${esc(x.ticketNo)}${x.photo?' · 📷':''}</span>
    </button>`
  }).join('')
  // มีข้อมูลใหม่เกิน 20 → บอกจำนวนที่เหลือ (กันตัวเลข badge มากกว่าจำนวนที่เห็นในลิสต์)
  if(all.length>list.length){empty.style.display='block';empty.textContent='…และอีก '+(all.length-list.length)+' รายการ'}
}
function notifOpen(id){
  const r=cacheR().find(x=>x.id===id)
  if(r&&r.photo)viewPhoto(id)
  else if(r)toast('🎫 '+r.name+' · '+r.ticketNo+' · '+r.department,'i')
  closeNotifPanel()
}
function closeNotifPanel(){
  const p=document.getElementById('notifPanel')
  if(!p.classList.contains('show'))return
  p.classList.remove('show')
  markSeen() // อ่านแล้วเมื่อปิด panel
}
function notifMarkAll(){
  markSeen();closeNotifPanel()
}
