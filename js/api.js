// ===================================================================
//  API
// ===================================================================
async function get(action) {
  const u=gasUrl()
  if(!u) return {success:false,error:'no_url',data:[]}
  const c=cfg()

  let url = u + '?action=' + action;
  if(c.sheetId) url += '&sheetId=' + encodeURIComponent(c.sheetId)

  // token ผ่าน query param (GET ไม่มี body — GAS ไม่รองรับ header preflight)
  const token = getToken();
  if (token) url += '&token=' + encodeURIComponent(token);

  console.log('[API] GET:', action, '| Token:', token ? '***' : 'none', '| URL:', url.split('token=')[0])
  try{
    const r=await fetch(url,{method:'GET',redirect:'follow'})
    const text=await r.text()
    console.log('[API] Response status:', r.status, '| text:', text.slice(0,200))

    // Detect GAS login redirect: GAS returns an HTML page (login screen)
    // instead of JSON when the Web App deployment requires authentication.
    if (text.trim().startsWith('<')) {
      console.error('[API] GAS returned HTML (login page) instead of JSON — deployment likely requires auth');
      return {success:false,error:'AUTH_REQUIRED',data:[]}
    }

    const data=JSON.parse(text)
    console.log('[API] Parsed:', data)

    // Check if GAS returned an error (even with 200 status)
    if (!data.success && data.error) {
      // ✅ token หาย/หมดอายุ → ล้าง session แล้วเด้งล็อกอิน (เฉพาะตอนมี token)
      // คืน error เดิม ('Unauthorized...') เพื่อให้ refresh() จัดการเงียบๆ ตาม branch เดิม
      if (/\b(unauthorized|invalid or missing token|token)\b/i.test(data.error)) {
        if (getToken()) { clearToken(); showLoginModal(); }
        return {success: false, error: data.error, data: data.data || []};
      }
      return {success: false, error: data.error, data: data.data || []};
    }
    return data
  }catch(e){
    console.error('[API] Error:', e)
    // Check for CORS/Network errors
    const errorMsg = e.message || '';
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
      return {success: false, error: 'CORS/Network Error: Failed to fetch', data: []};
    }
    return {success:false,error:errorMsg,data:[]}
  }
}
async function post(data, opts){
  const u=gasUrl();if(!u) return {success:false,error:'no_url'}
  const c=cfg()
  const body={...data}
  if(c.sheetId) body.sheetId=c.sheetId
  // token ส่งใน body (POST text/plain ไม่มี preflight — กันหลุด URL)
  const token = getToken();
  if (token) body.token = token;
  let url = u;
  console.log('[API] POST', url, '| Token:', token ? '***' : 'none')
  return new Promise(r=>{
    const x=new XMLHttpRequest()
    x.open('POST',url)
    x.setRequestHeader('Content-Type','text/plain')
    x.onload=()=>{
      try{
        const res=JSON.parse(x.responseText)
        console.log('[API] POST Response:', res)
        // ✅ token หาย/หมดอายุ → ล้าง session แล้วเด้งล็อกอิน (เฉพาะตอนมี token & ไม่ได้ขอ skip)
        if (!res.success && res.error && /\b(unauthorized|invalid or missing token|expired|token)\b/i.test(res.error) && !(opts && opts.skipAuthPrompt)) {
          if (getToken()) { clearToken(); showLoginModal(); }
        }
        r(res)
      }catch{
        console.error('[API] POST Invalid response:', x.responseText)
        const t=(x.responseText||'').trim()
        r({success:false,error:t.startsWith('<')
          ? 'GAS ตอบกลับเป็นหน้า HTML ไม่ใช่ JSON — ตรวจ Deploy → Who has access ต้องเป็น Anyone (ไม่ใช่ Anyone with Google account) หรือ Web App URL ผิด/deployment เก่าถูกลบ ตรวจใน ⚙️ ตั้งค่า'
          : 'Invalid response'})
      }
    }
    x.onerror=()=>{
      console.error('[API] POST Network error')
      r({success:false,error:'Network error'})
    }
    x.send(JSON.stringify(body))
  })
}

// ===================================================================
//  CACHE
// ===================================================================
function cacheR(){try{return JSON.parse(localStorage.getItem(CACHE_KEY))||[]}catch{return[]}}
function setCache(r){localStorage.setItem(CACHE_KEY,JSON.stringify(r))}
