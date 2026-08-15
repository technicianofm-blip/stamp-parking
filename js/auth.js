// ===================================================================
//  AUTHENTICATION - Username/Password + HMAC Token (หมดอายุ 8 ชม.)
// ===================================================================
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const TOKEN_KEY = 'sp_auth_token';
const TOKEN_EXPIRY_KEY = 'sp_auth_expiry';
const TOKEN_USER_KEY = 'sp_auth_user';

// legacy keys จากระบบ PIN เก่า — ลบให้สะอาดเวลาเข้า/ล็อกอิน
function removeLegacyPinKeys() {
  localStorage.removeItem('sp_admin_pin');
  localStorage.removeItem('sp_admin_pin_expiry');
}

function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (token && expiry && Date.now() < parseInt(expiry)) {
    return token;
  }
  clearToken();
  return null;
}

function setToken(token, expiresInMs, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + (expiresInMs || TOKEN_TTL_MS)));
  localStorage.setItem(TOKEN_USER_KEY, JSON.stringify({
    username: (user && user.username) || '',
    displayName: (user && user.displayName) || (user && user.username) || '',
    role: (user && user.role) || 'admin'
  }));
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(TOKEN_USER_KEY);
}

function getMe() {
  try { return JSON.parse(localStorage.getItem(TOKEN_USER_KEY)) || null; } catch (e) { return null; }
}

function isAuthenticated() {
  return !!getToken();
}

function requireAuth() {
  if (getToken()) return getToken();
  showLoginModal();
  return null;
}

function showLoginModal(targetPage) {
  removeLegacyPinKeys();
  const existing = document.getElementById('loginModal');
  if (existing) existing.remove();

  // เก็บหน้าที่ผู้ใช้พยายามเข้า (target page)
  sessionStorage.setItem('authReturnPage', targetPage || '');

  const modal = document.createElement('div');
  modal.className = 'modal show';
  modal.id = 'loginModal';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:360px">
      <div class="modal-hd"><h3>🔐 เข้าสู่ระบบ</h3><button class="modal-close" onclick="closeLoginModal()">&times;</button></div>
      <div class="modal-bd">
        <p style="color:var(--g600);margin-bottom:16px;text-align:center">กรุณาเข้าสู่ระบบเพื่อเข้าถึงหน้านี้</p>

        <div class="form-group">
          <label class="form-label">ชื่อผู้ใช้</label>
          <input type="text" class="form-control" id="loginInput" placeholder="username" autocomplete="username" onkeydown="if(event.key==='Enter')document.getElementById('passwordInput')?.focus()">
        </div>
        <div class="form-group">
          <label class="form-label">รหัสผ่าน</label>
          <input type="password" class="form-control" id="passwordInput" placeholder="รหัสผ่าน" autocomplete="current-password" onkeydown="if(event.key==='Enter')login()">
        </div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
          <button class="btn btn-o" onclick="closeLoginModal()">ยกเลิก</button>
          <button class="btn btn-p" onclick="login()">เข้าสู่ระบบ</button>
        </div>
        <p style="font-size:11px;color:var(--g400);text-align:center;margin-top:8px">เซสชันหมดอายุใน 8 ชั่วโมง</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('loginInput')?.focus(), 100);
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.remove();
  // Don't auto-redirect - let user decide
}

// POST login — ผ่าน post() พร้อม flag ปิด auth-prompt (login ต้องไม่เด้ง modal ซ้ำ)
function apiLogin(username, password) {
  return post({ action: 'login', username: username, password: password }, { skipAuthPrompt: true });
}

async function login() {
  const username = document.getElementById('loginInput')?.value.trim() || '';
  const password = document.getElementById('passwordInput')?.value || '';
  if (!username || !password) {
    toast('⚠️ กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'e');
    return;
  }

  const btn = document.querySelector('#loginModal .btn-p');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> กำลังตรวจสอบ...'; }

  try {
    await healUrl(); // ตรวจสอบ/สลับ URL หาก URL เก่าพัง
    const r = await apiLogin(username, password);

    if (r.success) {
      setToken(r.token, r.expiresIn || TOKEN_TTL_MS, r);
      closeLoginModal();
      toast('✅ เข้าสู่ระบบสำเร็จ', 's');
      setConn(true);
      renderUserMgmt();

      // Redirect กลับหน้าที่พยายามเข้า (page name เช่น 'dash' หรือ 'setup')
      const returnPage = sessionStorage.getItem('authReturnPage');
      if (returnPage) {
        go(returnPage, true);  // พาไปหน้าเป้าหมายโดยไม่เด้งล็อกอินซ้ำ
      } else {
        refresh();
      }
    } else {
      toast('❌ ' + (r.error || 'เข้าสู่ระบบไม่สำเร็จ'), 'e');
    }
  } catch (e) {
    console.error('[login]', e);
    toast('❌ ไม่สามารถตรวจสอบได้: ' + e.message, 'e');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'เข้าสู่ระบบ'; }
  }
}

function logout() {
  clearToken();
  renderUserMgmt();
  toast('🚪 ออกจากระบบแล้ว', 's');
  go('form');
  refresh();
}

// ===================================================================
//  USER MANAGEMENT (Settings — แสดงเฉพาะเมื่อล็อกอิน)
// ===================================================================
function renderUserMgmt() {
  const show = !!getToken();
  ['desk', 'mob'].forEach(p => {
    const card = document.getElementById(p + 'UserMgmt');
    if (card) card.style.display = show ? '' : 'none';
  });
  if (show) loadUserList();
}

async function loadUserList() {
  const me = getMe();
  const r = await get('listUsers');
  const users = (r.success && Array.isArray(r.data)) ? r.data : [];
  ['desk', 'mob'].forEach(p => {
    const box = document.getElementById(p + 'UserList');
    if (!box) return;
    box.innerHTML = '';
    if (!users.length) { box.textContent = '(ยังไม่มีผู้ใช้)'; return; }
    users.forEach(u => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.06);flex-wrap:wrap';
      const isSelf = me && u.username === me.username;
      const name = document.createElement('span');
      name.style.flex = '1';
      name.textContent = (u.displayName || u.username) + ' (' + u.username + ')' + (u.active ? '' : ' 🔇 ปิดใช้งาน');
      name.style.color = u.active ? 'inherit' : 'var(--g400)';
      row.appendChild(name);

      const act = document.createElement('button');
      act.className = 'btn btn-o btn-sm';
      act.style.cssText = 'padding:3px 8px;font-size:11px';
      act.textContent = u.active ? '🔇 ปิด' : '▶ เปิด';
      act.onclick = async () => {
        await get('setUserActive&username=' + encodeURIComponent(u.username) + '&active=' + (!u.active));
        toast('✅ อัปเดตแล้ว', 's');
        loadUserList();
        setConn(getToken()); // refresh sidebar status
      };
      row.appendChild(act);

      // รีเซ็ตรหัสผ่านของคนอื่น (ตัวเองเปลี่ยนผ่านฟอร์มข้างล่าง)
      if (!isSelf) {
        const rs = document.createElement('button');
        rs.className = 'btn btn-o btn-sm';
        rs.style.cssText = 'padding:3px 8px;font-size:11px';
        rs.textContent = '🔑 รีเซ็ต';
        rs.onclick = async () => {
          const np = window.prompt('รหัสผ่านใหม่สำหรับ ' + u.username + ' (อย่างน้อย 6 ตัว):');
          if (!np || np.length < 6) { toast('⚠️ รหัสต้องอย่างน้อย 6 ตัว', 'e'); return; }
          await post({ action: 'resetUserPassword', username: u.username, password: np });
          toast('✅ รีเซ็ตรหัสผ่านแล้ว', 's');
        };
        row.appendChild(rs);
      }
      box.appendChild(row);
    });
  });
}

async function addUserAction(p) {
  const uname = document.getElementById(p + 'NewUser').value.trim();
  const dname = document.getElementById(p + 'NewName').value.trim();
  const pw = document.getElementById(p + 'NewPass').value || '';
  if (!uname || !pw) { toast('⚠️ กรอกชื่อผู้ใช้และรหัสผ่าน', 'e'); return; }
  if (pw.length < 6) { toast('⚠️ รหัสผ่านต้องอย่างน้อย 6 ตัว', 'e'); return; }
  const r = await post({ action: 'addUser', username: uname, password: pw, displayName: dname });
  if (r.success) {
    toast('✅ ' + (r.message || 'เพิ่มผู้ใช้แล้ว'), 's');
    document.getElementById(p + 'NewUser').value = '';
    document.getElementById(p + 'NewName').value = '';
    document.getElementById(p + 'NewPass').value = '';
    loadUserList();
  } else {
    toast('❌ ' + (r.error || 'เพิ่มไม่ได้'), 'e');
  }
}

async function changeMyPasswordAction(p) {
  const oldPw = document.getElementById(p + 'OldPass').value || '';
  const newPw = document.getElementById(p + 'NewPass2').value || '';
  if (!oldPw || !newPw) { toast('⚠️ กรอกรหัสผ่านเดิมและรหัสใหม่', 'e'); return; }
  if (newPw.length < 6) { toast('⚠️ รหัสใหม่ต้องอย่างน้อย 6 ตัว', 'e'); return; }
  const r = await post({ action: 'changeMyPassword', oldPassword: oldPw, newPassword: newPw });
  if (r.success) {
    toast('✅ เปลี่ยนรหัสผ่านแล้ว', 's');
    document.getElementById(p + 'OldPass').value = '';
    document.getElementById(p + 'NewPass2').value = '';
  } else {
    toast('❌ ' + (r.error || 'เปลี่ยนไม่ได้'), 'e');
  }
}

// ===================================================================
//  CONNECTION STATUS — setConn() ย้ายจากบล็อก CONNECTION เดิม (ผูกกับ auth
//  status/แถบล็อกอินโดยตรง — testConn() ยังอยู่ url-setup.js)
// ===================================================================
function setConn(on){
  // Desktop sidebar
  const dot=document.getElementById('deskConnDot');const txt=document.getElementById('deskConnText')
  if(dot)dot.className='dot '+(on?'on':'off')
  if(txt)txt.textContent=on?'ออนไลน์':'ออฟไลน์'

  // Mobile header dot
  const mdot=document.getElementById('mobConnDot')
  if(mdot)mdot.className='conn-dot '+(on?'on':'off')

  // Mobile offline bar
  const bar=document.getElementById('mobOffline')
  if(bar){if(!on)bar.classList.add('show');else bar.classList.remove('show')}

  // Auth status visibility + แสดงชื่อผู้ใช้ที่ล็อกอิน (desktop sidebar + แถบมือถือ)
  const authStatus = document.getElementById('deskAuthStatus');
  const mobAuth = document.getElementById('mobAuthStatus');
  if (authStatus || mobAuth) {
    const authed = getToken();
    const me = getMe();
    const name = me && me.displayName ? '🔒 ' + me.displayName : '🔒 เข้าสู่ระบบแล้ว';
    if (authStatus) {
      authStatus.style.display = authed ? 'flex' : 'none';
      const label = document.getElementById('deskAuthLabel');
      if (label) label.textContent = name;
    }
    if (mobAuth) {
      mobAuth.style.display = authed ? 'flex' : 'none';
      const label = document.getElementById('mobAuthLabel');
      if (label) label.textContent = name;
    }
  }
}
