// ===================================================================
//  SCAN TICKET — Barcode/QR using BarcodeDetector API
// ===================================================================
let scanStream=null,scanTimer=null,scanPrefix='',scanZX=null
async function scanTicket(p){
  scanPrefix=p
  // Try BarcodeDetector API first (Chrome native)
  if(window.BarcodeDetector)return scanWithBarcodeDetector(p)
  // Fallback: load @zxing/library from CDN
  if(!scanZX){
    document.getElementById('scanStatus').textContent='⏳ กำลังโหลดตัวอ่านบาร์โค้ด...'
    document.getElementById('scanModal').classList.add('show')
    try{
      await loadScript('https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js')
      scanZX=window.ZXing
    }catch(e){document.getElementById('scanModal').classList.remove('show');return toast('⚠️ โหลดตัวอ่านบาร์โค้ดไม่สำเร็จ','e')}
  }
  scanWithZXing(p)
}
function loadScript(url){
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=reject
    document.head.appendChild(s)
  })
}
async function scanWithBarcodeDetector(p){
  try{
    scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:720}})
    const video=document.getElementById('scanVideo');video.srcObject=scanStream
    document.getElementById('scanModal').classList.add('show')
    document.getElementById('scanStatus').textContent='📷 กำลังมองหาบาร์โค้ด...'
    const detector=new BarcodeDetector({formats:['qr_code','ean_13','ean_8','code_128','code_39','codabar','code_93','itf','datamatrix','pdf417','aztec','upc_a','upc_e']})
    scanTimer=setInterval(async()=>{
      if(video.readyState<2)return
      try{
        const codes=await detector.detect(video)
        if(codes.length>0){
          closeScan();await fillTicket(p,codes[0].rawValue)
        }
      }catch(e){}
    },400)
  }catch(e){toast('⚠️ ไม่สามารถเปิดกล้อง','e');closeScan()}
}
async function scanWithZXing(p){
  try{
    scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:720,height:540}})
    const video=document.getElementById('scanVideo');video.srcObject=scanStream;await video.play()
    document.getElementById('scanStatus').textContent='📷 กำลังมองหาบาร์โค้ด...'
    const reader=new scanZX.BrowserMultiFormatReader()
    reader.decodeFromVideoDevice(null,video,async (result,err)=>{
      if(result){
        reader.reset();closeScan();await fillTicket(p,result.getText())
      }
    })
    scanTimer=setTimeout(()=>{reader.reset();closeScan();toast('⏱️ ไม่พบบาร์โค้ด ลองใหม่','e')},30000)
  }catch(e){toast('⚠️ ไม่สามารถเปิดกล้อง','e');closeScan()}
}
function parseTicketCode(raw){
  if(!raw)return ''
  // มองหา เลขบัตร / เลขที่ / Card No. / Ticket No. แล้วเอาตัวเลข 17 หลักถัดไป
  const labels=['เลขบัตร','เลขที่','card no','ticket no','ticket','card','ใบเสร็จ','invoice','no']
  for(const label of labels){
    const rx=new RegExp(label+'[\\s:\\-]*\\n?[\\s\\r]*([\\d]{17})','i')
    const m=raw.match(rx)
    if(m) return m[1]
  }
  // หาเลข 17 หลักจากข้อความทั้งหมด (แม้ไม่มี label)
  const fb=raw.replace(/[\r\n]+/g,' ').match(/\b(\d{17})\b/)
  if(fb) return fb[1]
  // ถ้าไม่มีเลข 17 หลัก → คืนค่าที่ทำความสะอาดแล้ว
  return raw.replace(/[^0-9a-zA-Z]/g,'').toUpperCase()
}
async function fillTicket(p,raw){
  let code=''
  if(raw.startsWith('http')){
    toast('⏳ กำลังดึงข้อมูลจากเว็บ...','i')
    const r2=await get('fetchUrl&url='+encodeURIComponent(raw))
    if(r2.success&&r2.ticket) code=r2.ticket
    if(!code){
      window.open(raw,'_blank')
      return toast('⚠️ ไม่พบเลขบัตร — เปิดหน้าเว็บให้ดูแล้วพิมพ์เอง','e')
    }
  }else{
    code=parseTicketCode(raw)
  }
  if(!code)return toast('⚠️ ไม่พบเลขบัตร','e')
  const inp=document.getElementById(p+'Ticket')
  if(inp){inp.value=code;inp.dispatchEvent(new Event('input',{bubbles:true}))}
  toast('✅ สแกนสำเร็จ','s')
}
function closeScan(){
  clearInterval(scanTimer);clearTimeout(scanTimer);scanTimer=null
  if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null}
  const m=document.getElementById('scanModal');if(m)m.classList.remove('show')
}
