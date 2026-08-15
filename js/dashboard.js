// ===================================================================
//  DASHBOARD
// ===================================================================
async function refresh(){
  if(!gasUrl())return
  await healUrl(); // สลับไป URL ที่ถูกต้องหาก URL เก่าพัง
  showLoad('กำลังโหลดข้อมูล...');setConn(false)
  try{
    const r=await get('getAll')
    if(r.success){setCache(r.data);setConn(true);updateSyncTime()}
    else if(r.error==='no_url'){toast('⚠️ ยังไม่ได้ตั้งค่า API','e')}
    else if(r.error==='AUTH_REQUIRED'){
      // GAS returns a login page instead of JSON → Web App deployment
      // needs "Who has access: Anyone" (not "Anyone with Google account").
      setConn(false);
      toast('⚠️ GAS ต้องการสิทธิ์: ตั้งค่า Deploy → Who has access: Anyone','e');
    }
    else if(r.error && r.error.indexOf('Unauthorized')!==-1){
      // 401 จาก getAll = ยังไม่ได้ล็อกอิน / token หมดอายุ — ไม่ใช่ปัญหาการเชื่อมต่อ
      // (get() จะล้าง token + เด้งล็อกอินเองแล้ว) เซิร์ฟเวอร์ยังต่อได้จึงไม่แสดง offline-bar
      setConn(true);
    }
    else{
      // Check if it's a CORS/Network error
      const isNetworkError = r.error && (r.error.includes('Failed to fetch') || r.error.includes('NetworkError'));
      if (isNetworkError) {
        setConn(false);
        toast('⚠️ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ (CORS/Network) - ใช้แคช','e');
      } else {
        setConn(false);
        toast('❌ โหลดล้มเหลว: '+(r.error||'Unknown error')+' ใช้แคช','e');
      }
    }
  }catch(e){
    const isNetworkError = e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'));
    setConn(false);
    if (isNetworkError) {
      toast('⚠️ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ (CORS/Network) - ใช้แคช','e');
    } else {
      toast('❌ Error: '+e.message+' ใช้แคช','e');
    }
    console.error('[refresh] catch:', e)
  }
  hideLoad();render();updBadge();updateBell()
}
function updateSyncTime(){
  const t='🔄 '+new Date().toLocaleString('th-TH')
  const d=document.getElementById('deskSync');if(d)d.textContent=t
  const m=document.getElementById('mobSync');if(m)m.textContent=t
}
function updBadge(){
  const n=cacheR().filter(x=>x.status==='รออนุมัติ').length
  const b1=document.getElementById('deskBadge');if(b1){b1.textContent=n;b1.style.display=n>0?'':'none'}
  const b2=document.getElementById('mobBadge');if(b2){b2.textContent=n;b2.style.display=n>0?'':'none'}
}

// ===================================================================
//  DASHBOARD ANALYTICS — กราฟย้อนหลัง 7 วัน (แท่ง OFM / PCS)
//  วาดด้วย canvas เอง (ไม่พึ่ง library) — scale ตาม devicePixelRatio
// ===================================================================
function renderChart(){
  const cv=document.getElementById((isDesktop()?'desk':'mob')+'Chart')
  if(!cv||!cv.clientWidth)return // การ์ดพับอยู่ (display:none) → ข้าม วาดตอนขยายอีกที
  const w=cv.clientWidth
  if(!w)return
  const r=cacheR()
  const days=[]
  const today=new Date();today.setHours(0,0,0,0)
  const thaiDay=['อา','จ','อ','พ','พฤ','ศ','ส']
  for(let i=6;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i)
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
    days.push({key,date:d,ofm:0,pcs:0})
  }
  const byDay={};days.forEach(d=>byDay[d.key]=d)
  r.forEach(x=>{
    const d=new Date(x.createdAt)
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
    const b=byDay[key]
    if(!b)return
    if(x.department==='OFM')b.ofm++
    else if(x.department==='PCS')b.pcs++
  })
  const h=180
  const dpr=window.devicePixelRatio||1
  cv.width=w*dpr;cv.height=h*dpr;cv.style.height=h+'px'
  const ctx=cv.getContext('2d')
  ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.clearRect(0,0,w,h)
  const padL=30,padR=6,padT=12,padB=24
  const cw=w-padL-padR,ch=h-padT-padB
  const max=Math.max(1,...days.map(d=>Math.max(d.ofm,d.pcs)))
  // grid + y labels
  ctx.font='10px sans-serif';ctx.textAlign='right';ctx.textBaseline='middle'
  for(let i=0;i<=4;i++){
    const y=padT+ch-(ch*i/4)
    ctx.strokeStyle='rgba(148,163,184,.25)';ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(w-padR,y);ctx.stroke()
    ctx.fillStyle='#94a3b8';ctx.fillText(String(Math.round(max*i/4)),padL-4,y)
  }
  // bars + x labels (วันที่ + ชื่อวันไทย)
  const groupW=cw/days.length,barW=Math.max(6,Math.min(14,groupW*.26)),gap=3
  days.forEach((d,i)=>{
    const cx=padL+groupW*i+groupW/2
    const hOfm=d.ofm?Math.max(2,ch*d.ofm/max):0
    const hPcs=d.pcs?Math.max(2,ch*d.pcs/max):0
    if(hOfm){ctx.fillStyle='#3b82f6';ctx.fillRect(cx-barW-gap,padT+ch-hOfm,barW,hOfm)}
    if(hPcs){ctx.fillStyle='#d946ef';ctx.fillRect(cx+gap,padT+ch-hPcs,barW,hPcs)}
    ctx.fillStyle='#94a3b8';ctx.textAlign='center';ctx.textBaseline='alphabetic'
    ctx.fillText(thaiDay[d.date.getDay()],cx,padT+ch+13)
    ctx.fillText(String(d.date.getDate()),cx,padT+ch+23)
  })
  if(days.every(d=>!d.ofm&&!d.pcs)){
    ctx.fillStyle='#94a3b8';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText('📭 ยังไม่มีข้อมูลใน 7 วันที่ผ่านมา',w/2,padT+ch/2)
  }
}
// วาดกราฟใหม่เมื่อย่อ/ขยายหน้าต่าง (หน้าจอเปลี่ยนความกว้าง)
window.addEventListener('resize',()=>{ if(getToken()) setTimeout(renderChart,100) })

// ===================================================================
//  PERFORMANCE — debounce ค้นหา + pagination (PAGE_SIZE แถว/หน้า)
// ===================================================================
let page=1;const PAGE_SIZE=50;let totalPages=1
function onSearch(){ // ค้นหา: debounce 250ms แล้วกลับหน้าว่างแรก
  clearTimeout(onSearch._t)
  onSearch._t=setTimeout(()=>{page=1;render()},250)
}
function filterChange(){ // เปลี่ยน filter → กลับหน้าว่างแรก
  page=1;render()
}
function setPage(p){
  page=Math.min(Math.max(1,p),totalPages)
  render()
}
function renderPager(){
  ;['desk','mob'].forEach(pr=>{
    const info=document.getElementById(pr+'PageInfo')
    if(!info)return
    info.textContent='หน้า '+page+'/'+totalPages
    const prev=document.getElementById(pr+'Prev');if(prev)prev.disabled=page<=1
    const next=document.getElementById(pr+'Next');if(next)next.disabled=page>=totalPages
  })
}

// ===================================================================
//  DATE RANGE DEFAULT — ค่าเริ่มต้นตัวกรองช่วงวันที่ = วันนี้
//  (ผู้ใช้สามารถล้าง/เลือกช่วงอื่นได้เองภายหลัง)
// ===================================================================
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
// วันที่แบบ Asia/Bangkok (UTC+7 คงที่ ไม่มี DST) → 'yyyy-MM-dd' — เช็คข้อมูลซ้ำให้ตรงกับ backend
function bkkDay(iso){const t=new Date(iso).getTime();if(isNaN(t))return '';return new Date(t+7*3600*1000).toISOString().slice(0,10)}
function initDateDefaults(){
  const t=todayStr()
  ;['desk','mob'].forEach(p=>{
    const f=document.getElementById(p+'FDateFrom'),to=document.getElementById(p+'FDateTo')
    if(f)f.value=t
    if(to)to.value=t
  })
}

// ===================================================================
//  HEATMAP — การใช้งานรายสัปดาห์ (วันในสัปดาห์ × ช่วง 2 ชม. สีตามจำนวน)
// ===================================================================
function renderHeatmap(){
  const id=(isDesktop()?'desk':'mob')+'Heatmap'
  const el=document.getElementById(id)
  if(!el)return
  const days=['อา','จ','อ','พ','พฤ','ศ','ส']
  const dayNames=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']
  const grid=[]
  for(let d=0;d<7;d++)grid.push(new Array(12).fill(0))
  cacheR().forEach(x=>{
    const dt=new Date(x.createdAt)
    grid[dt.getDay()][Math.floor(dt.getHours()/2)]++
  })
  if(!cacheR().length){el.innerHTML='<div class="heat-empty">📭 ยังไม่มีข้อมูล</div>';return}
  const max=Math.max(1,...grid.flat())
  let html='<span></span>'+[0,2,4,6,8,10,12,14,16,18,20,22].map(h=>`<span class="heat-hour">${h}</span>`).join('')
  days.forEach((day,di)=>{
    html+='<span class="heat-day">'+day+'</span>'
    for(let h=0;h<12;h++){
      const c=grid[di][h],inten=c?c/max:0
      const bg=c?'rgba(59,130,246,'+(0.15+0.75*inten).toFixed(2)+')':'rgba(148,163,184,.08)'
      const fg=inten>.5?'#fff':'var(--g600)'
      html+=`<span class="heat-cell" style="background:${bg};color:${fg}" title="${dayNames[di]} ${String(h*2).padStart(2,'0')}:00–${String(h*2+2).padStart(2,'0')}:00 · ${c} รายการ">${c||''}</span>`
    }
  })
  el.innerHTML=html
}

// ===================================================================
//  COLLAPSIBLE CARDS — กดหัวการ์ดพับ/ขยายเนื้อหา (กราฟ/heatmap)
//  เปิดเมื่อพับอยู่ → วาดกราฟใหม่ เพราะตอน display:none ความกว้าง = 0
// ===================================================================
function toggleCard(el){
  const card=el.closest('.card')
  if(!card)return
  const collapsed=card.classList.toggle('collapsed')
  const chev=el.querySelector('.collapse-chev')
  if(chev)chev.textContent=collapsed?'▸':'▾'
  el.setAttribute('aria-expanded',collapsed?'false':'true')
  if(!collapsed)setTimeout(()=>{renderChart();renderHeatmap()},50)
}

// ===================================================================
//  TABLE RENDER — filter/search/pagination/stats รวมในฟังก์ชันเดียว
//  (ย้ายมาจากบล็อก "ACCESSIBILITY" เดิมที่ mislabel — จริงๆ เป็นโค้ด
//  render ตาราง dashboard ไม่เกี่ยวกับ accessibility)
// ===================================================================
function render(){
  const isD=isDesktop()
  const prefix=isD?'desk':'mob'
  let r=cacheR()
  const s=document.getElementById(prefix+'Search')
  const fd=document.getElementById(prefix+'FDept')
  const fv=document.getElementById(prefix+'FVehicle')
  const fs=document.getElementById(prefix+'FStatus')
  const fdateFrom=document.getElementById(prefix+'FDateFrom')
  const fdateTo=document.getElementById(prefix+'FDateTo')
  const fphoto=document.getElementById(prefix+'FPhoto')

  const search=s?s.value.toLowerCase().trim():''
  const deptFilter=fd?fd.value:''
  const vehicleFilter=fv?fv.value:''
  const statusFilter=fs?fs.value:''
  const dateFrom=fdateFrom?fdateFrom.value:''
  const dateTo=fdateTo?fdateTo.value:''
  const photoFilter=fphoto?fphoto.value:''

  if(search) r=r.filter(x=>x.name.toLowerCase().includes(search)||(x.nickname&&x.nickname.toLowerCase().includes(search))||(x.phone&&x.phone.includes(search))||x.ticketNo.toLowerCase().includes(search))
  if(deptFilter) r=r.filter(x=>x.department===deptFilter)
  if(vehicleFilter) r=r.filter(x=>x.vehicleType===vehicleFilter)
  if(statusFilter) r=r.filter(x=>x.status===statusFilter)
  if(photoFilter==='has') r=r.filter(x=>!!x.photo)
  if(photoFilter==='none') r=r.filter(x=>!x.photo)
  if(dateFrom) r=r.filter(x=>{const d=new Date(x.createdAt);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')>=dateFrom})
  if(dateTo) r=r.filter(x=>{const d=new Date(x.createdAt);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')<=dateTo})

  // Stats
  const a=cacheR()
  const setStat=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val}
  setStat(prefix+'StTotal',a.length)
  setStat(prefix+'StOfm',a.filter(x=>x.department==='OFM').length)
  setStat(prefix+'StPcs',a.filter(x=>x.department==='PCS').length)
  setStat(prefix+'StBike',a.filter(x=>x.vehicleType==='รถจักรยานยนต์').length)
  setStat(prefix+'StCar',a.filter(x=>x.vehicleType==='รถยนต์').length)
  setStat(prefix+'StToday',a.filter(x=>{const d=new Date(x.createdAt),n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate()}).length)
  renderChart()
  renderHeatmap()

  // Table — แสดงทีละหน้า (pagination: PAGE_SIZE แถว/หน้า)
  const tbody=document.getElementById(prefix+'Tbody')
  if(!tbody)return
  totalPages=Math.max(1,Math.ceil(r.length/PAGE_SIZE))
  if(page>totalPages)page=totalPages
  renderPager()
  if(!r.length){tbody.innerHTML='<tr class="empty"><td colspan="10">📭 ไม่พบข้อมูล</td></tr>';return}
  const startIdx=(page-1)*PAGE_SIZE
  r=r.slice(startIdx,startIdx+PAGE_SIZE)

  if(isD){
    // Desktop table — full columns
    tbody.innerHTML=r.map((x,i)=>{
      const d=new Date(x.createdAt)
      const ds=d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'})
      const ts=d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})
      return `<tr>
        <td>${startIdx+i+1}</td>
        <td><strong>${esc(x.name)}</strong></td>
        <td><span class="badge ${x.department==='OFM'?'badge-ofm':'badge-pcs'}">${esc(x.department)}</span></td>
        <td><span class="badge ${x.timeType==='เข้างาน'?'badge-in':'badge-out'}">${esc(x.timeType)}</span></td>
        <td><span class="badge ${x.vehicleType==='รถจักรยานยนต์'?'badge-bike':'badge-car'}">${esc(x.vehicleType)}</span></td>
        <td style="font-family:monospace;font-size:12px;cursor:pointer" class="ticket-copy" onclick="copyTicket(this.dataset.tk)" data-tk="${esc(x.ticketNo)}" title="คลิกเพื่อคัดลอก">${esc(x.ticketNo)}</td>
        <td>
          <select class="discount-select" data-id="${esc(x.id)}" onchange="updateDiscount(this)">
            <option value="" ${!x.discount?'selected':''}>—</option>
            <option value="5" ${x.discount==='5'?'selected':''}>5 ชม.</option>
            <option value="9" ${x.discount==='9'?'selected':''}>9 ชม.</option>
            <option value="12" ${x.discount==='12'?'selected':''}>12 ชม.</option>
            <option value="Free All" ${x.discount==='Free All'?'selected':''}>🏆 Free All</option>
          </select>
        </td>
        <td>
          <select class="status-select" data-id="${esc(x.id)}" onchange="updateStatus(this)">
            <option value="รออนุมัติ" ${x.status==='รออนุมัติ'?'selected':''}>⏳ รออนุมัติ</option>
            <option value="อนุมัติ" ${x.status==='อนุมัติ'?'selected':''}>✅ อนุมัติ</option>
            <option value="ไม่อนุมัติ" ${x.status==='ไม่อนุมัติ'?'selected':''}>❌ ไม่อนุมัติ</option>
          </select>
        </td>
        <td>${x.photo?`<button class="btn btn-o btn-sm" onclick="viewPhoto('${esc(x.id)}')" aria-label="ดูรูปภาพ" title="ดูรูปภาพ">📷</button>`:'—'}</td>
        <td style="font-size:11px;white-space:nowrap">${ds}<br><span style="color:var(--g400)">${ts}</span></td>
        <td><button class="btn btn-d btn-sm" onclick="promptDel('${esc(x.id)}')" aria-label="ลบรายการ" title="ลบ">🗑</button></td>
      </tr>`
    }).join('')
  } else {
    // Mobile table — compact columns
    tbody.innerHTML=r.map((x,i)=>{
      return `<tr>
        <td>${startIdx+i+1}</td>
        <td>${esc(x.name)}</td>
        <td><span class="badge ${x.timeType==='เข้างาน'?'badge-in':'badge-out'}">${esc(x.timeType)}</span></td>
        <td style="font-family:monospace;font-size:11px;cursor:pointer" class="ticket-copy" onclick="copyTicket(this.dataset.tk)" data-tk="${esc(x.ticketNo)}" title="คลิกเพื่อคัดลอก">${esc(x.ticketNo)}</td>
        <td>
          <select class="discount-select" data-id="${esc(x.id)}" onchange="updateDiscount(this)" style="width:65px;font-size:11px;padding:3px">
            <option value="" ${!x.discount?'selected':''}>—</option>
            <option value="5" ${x.discount==='5'?'selected':''}>5</option>
            <option value="9" ${x.discount==='9'?'selected':''}>9</option>
            <option value="12" ${x.discount==='12'?'selected':''}>12</option>
            <option value="Free All" ${x.discount==='Free All'?'selected':''}>🏆</option>
          </select>
        </td>
        <td>
          <select class="status-select" data-id="${esc(x.id)}" onchange="updateStatus(this)" style="width:80px">
            <option value="รออนุมัติ" ${x.status==='รออนุมัติ'?'selected':''}>⏳</option>
            <option value="อนุมัติ" ${x.status==='อนุมัติ'?'selected':''}>✅</option>
            <option value="ไม่อนุมัติ" ${x.status==='ไม่อนุมัติ'?'selected':''}>❌</option>
          </select>
        </td>
        <td style="white-space:nowrap">
          ${x.photo?`<button class="btn btn-o btn-sm" onclick="viewPhoto('${esc(x.id)}')" aria-label="ดูรูปภาพ" style="padding:3px 6px;font-size:10px">📷</button>`:''}
          <button class="btn btn-d btn-sm" onclick="promptDel('${esc(x.id)}')" aria-label="ลบรายการ" style="padding:3px 6px;font-size:10px">🗑</button>
        </td>
      </tr>`
    }).join('')
  }
}

// ===================================================================
//  STATUS
// ===================================================================
async function updateStatus(el){
  const id=el.dataset.id;const st=el.value
  console.log('[updateStatus] id:', id, 'status:', st)
  try{
    const r=await get('updateStatus&id='+id+'&status='+encodeURIComponent(st))
    console.log('[updateStatus] response:', r)
    if(r.success){
      const c=cacheR().map(x=>x.id===id?{...x,status:st}:x)
      setCache(c);render();updBadge()
      toast('✅ อัปเดตสถานะเรียบร้อย','s')
    }else toast('❌ '+(r.error||'อัปเดตไม่สำเร็จ'),'e')
  }catch(e){
    console.error('[updateStatus] catch:', e)
    toast('❌ Error: '+e.message,'e')
  }
}
async function updateDiscount(el){
  const id=el.dataset.id;const disc=el.value
  console.log('[updateDiscount] id:', id, 'discount:', disc)
  try{
    const r=await get('updateDiscount&id='+id+'&discount='+encodeURIComponent(disc))
    console.log('[updateDiscount] response:', r)
    if(r.success){
      const c=cacheR().map(x=>x.id===id?{...x,discount:disc}:x)
      setCache(c);render();updBadge()
      toast('✅ อัปเดตส่วนลดเรียบร้อย','s')
    }else toast('❌ '+(r.error||'อัปเดตไม่สำเร็จ'),'e')
  }catch(e){
    console.error('[updateDiscount] catch:', e)
    toast('❌ Error: '+e.message,'e')
  }
}

// ===================================================================
//  DELETE — closeModal() ไม่ได้ย้ายมาด้วย (ยังอยู่ inline รอย้ายไป
//  ui-shell.js คู่กับ openModal ใน Phase 4 — promptDel/doDelete เรียกใช้
//  ผ่าน global scope ได้ปกติ)
// ===================================================================
let delId=null
function promptDel(id){delId=id;openModal('confirmModal')}
async function doDelete(){
  if(!delId)return
  const btn=document.getElementById('confirmBtn');btn.disabled=true;btn.innerHTML='กำลังลบ...'
  console.log('[doDelete] id:', delId)
  try{
    const r=await get('delete&id='+delId)
    console.log('[doDelete] response:', r)
    if(r.success){toast('🗑 ลบเรียบร้อย','i');await refresh()}
    else toast('❌ '+(r.error||'ลบไม่สำเร็จ'),'e')
  }catch(e){
    console.error('[doDelete] catch:', e)
    toast('❌ Error: '+e.message,'e')
  }
  finally{btn.disabled=false;btn.innerHTML='🗑 ลบ'}
  closeModal('confirmModal')
}

// ===================================================================
//  PHOTO MODAL
// ===================================================================
function viewPhoto(id){
  const r=cacheR().find(x=>x.id===id)
  if(!r||!r.photo)return
  document.getElementById('modalImg').src=r.photo
  openModal('photoModal')
}

// ===================================================================
//  CSV
// ===================================================================
function copyTicket(t){
  const ok=()=>toast('✅ คัดลอก '+t,'s')
  const err=()=>toast('⚠️ ไม่สามารถคัดลอก','e')
  // 1) Clipboard API (async) — มีเฉพาะ secure context (https) + เบราว์เซอร์ใหม่
  //    มือถือรุ่นเก่า/WebView ไม่มี navigator.clipboard → เรียกตรงๆ จะ throw (จับไม่ทันด้วย .catch)
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(ok).catch(()=>legacyCopyText(t)?ok():err())
  }else{
    // 2) ทางสำรอง (sync, ทำงานใน user gesture) — ครอบ iOS Safari <13.4 / Android WebView
    legacyCopyText(t)?ok():err()
  }
}
function legacyCopyText(t){
  // textarea ชั่วคราวลอยนอกจอ + select → execCommand('copy')
  // (ห้าม display:none ไม่งั้น iOS เลือกข้อความไม่ได้; API deprecate แล้วแต่ยังใช้ได้ทุกมือถือ)
  const ta=document.createElement('textarea')
  ta.value=t
  ta.setAttribute('readonly','')
  ta.style.cssText='position:fixed;top:0;left:0;width:2px;height:2px;opacity:0;pointer-events:none'
  document.body.appendChild(ta)
  ta.focus();ta.select();ta.setSelectionRange(0,ta.value.length) // iOS ต้องเลือกช่วงให้ชัดเจน
  let ok=false
  try{ok=document.execCommand('copy')}catch(e){}
  ta.remove()
  return ok
}
function exportCSV(){
  const r=cacheR()
  if(!r.length)return toast('📭 ไม่มีข้อมูล','e')
  const h='ชื่อ-นามสกุล,ชื่อเล่น,เบอร์ติดต่อ,หน่วยงาน,การลงเวลา,ยานพาหนะ,เลขบัตรจอดรถ,ส่วนลด,สถานะ,วันที่'
  const rows=r.map(x=>{
    const d=new Date(x.createdAt).toLocaleString('th-TH')
    // csvField: escape " ภายใน + กัน formula injection (ฟิลด์ขึ้นต้น = + - @ → ใส่ ' นำหน้า)
    return [x.name,x.nickname,x.phone,x.department,x.timeType,x.vehicleType,x.ticketNo,x.discount,x.status,d].map(csvField).join(',')
  })
  const csv='﻿'+[h,...rows].join('\n')
  const b=new Blob([csv],{type:'text/csv;charset=utf-8'})
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`stamp-parking-${new Date().toISOString().slice(0,10)}.csv`
  a.click();URL.revokeObjectURL(a.href)
  toast('📥 ดาวน์โหลด CSV','s')
}
