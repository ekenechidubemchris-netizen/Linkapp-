/* ==========================================================================
   auth.js — simulated authentication (LocalStorage/SessionStorage only).
   No real server-side authentication is performed. Passwords are stored
   in plain text in browser storage for demo purposes only.
   ========================================================================== */

function showSplash(){
  document.getElementById('splashScreen').classList.remove('d-none');
  document.getElementById('authScreen').classList.add('d-none');
  document.getElementById('appShell').classList.add('d-none');
}
function showAuthPane(pane){
  document.getElementById('splashScreen').classList.add('d-none');
  document.getElementById('authScreen').classList.remove('d-none');
  document.getElementById('appShell').classList.add('d-none');
  ['login','signup','demo'].forEach(p=>{
    document.getElementById(p+'Pane').classList.toggle('d-none', p!==pane);
  });
  if(pane==='demo') renderDemoAccounts();
}

function renderDemoAccounts(){
  const list = document.getElementById('demoAccountList');
  list.innerHTML = DB.users.slice(0,6).map(u=>`
    <div class="demo-account-item" data-login-as="${u.id}">
      <img src="${u.avatar}" alt="">
      <div>
        <div class="name">${escapeHtml(u.name)}</div>
        <div class="headline">${escapeHtml(u.headline)}</div>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('[data-login-as]').forEach(el=>{
    el.addEventListener('click', ()=>{
      logInUser(el.dataset.loginAs, true);
    });
  });
}

function logInUser(userId, remember){
  CURRENT_USER_ID = userId;
  setSession(userId, remember);
  enterApp();
  toast('Welcome back', `Logged in as ${userById(userId).name}`, 'success');
}

function enterApp(){
  document.getElementById('splashScreen').classList.add('d-none');
  document.getElementById('authScreen').classList.add('d-none');
  document.getElementById('appShell').classList.remove('d-none');
  document.getElementById('topbarAvatar').src = me().avatar;
  ensureUserSettingsDefaults(me());
  applyHighContrastMode(me().settings.accessibility.highContrast);
  applyReduceMotion(me().settings.accessibility.reduceMotion);
  checkDailyLoginBonus(me().id);
  startSessionActivityTracking();
  initAppShellEvents();
  refreshBadges();
  if(!location.hash || location.hash==='#/'){ location.hash = '#/home'; }
  showInitialLoadSkeleton();
  setTimeout(router, 260);
}

let sessionActivityInterval = null;
function startSessionActivityTracking(){
  clearInterval(sessionActivityInterval);
  const CHECK_SECONDS = 30;
  sessionActivityInterval = setInterval(()=>{
    if(document.visibilityState === 'visible' && me()){
      trackActiveTime(me().id, CHECK_SECONDS);
      refreshBadges();
    }
  }, CHECK_SECONDS*1000);
}

function showInitialLoadSkeleton(){
  const main = document.getElementById('mainContent');
  const rail = document.getElementById('rightRail');
  if(main) main.innerHTML = `
    <div class="card-panel">${skeletonCards(1, 70)}</div>
    <div class="card-panel">${skeletonCards(1, 50)}</div>
    <div class="card-panel">${skeletonCards(1, 220)}</div>
    <div class="card-panel">${skeletonCards(1, 220)}</div>
  `;
  if(rail) rail.innerHTML = `<div class="card-panel">${skeletonCards(3, 44)}</div>`;
}

function logOut(){
  clearInterval(sessionActivityInterval);
  clearSession();
  CURRENT_USER_ID = null;
  location.hash = '';
  showSplash();
}

function wireAuthScreens(){
  document.getElementById('btnGoLogin').onclick = ()=>showAuthPane('login');
  document.getElementById('btnGoSignup').onclick = ()=>showAuthPane('signup');
  document.getElementById('btnDemoAccounts').onclick = ()=>showAuthPane('demo');
  document.getElementById('toSignup').onclick = (e)=>{e.preventDefault(); showAuthPane('signup');};
  document.getElementById('toLogin').onclick = (e)=>{e.preventDefault(); showAuthPane('login');};
  document.getElementById('toDemoFromLogin').onclick = (e)=>{e.preventDefault(); showAuthPane('demo');};
  document.getElementById('toLoginFromDemo').onclick = (e)=>{e.preventDefault(); showAuthPane('login');};
  document.getElementById('forgotPasswordLink').onclick = (e)=>{
    e.preventDefault();
    openModalHtml(`
      <div class="modal-header"><h5 class="modal-title">Reset password</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <p class="small text-muted-2">This is a simulated flow — no real email is sent. Enter your account email to preview it.</p>
        <input type="email" class="form-control" placeholder="you@example.com" id="resetEmailInput">
      </div>
      <div class="modal-footer"><button class="btn btn-brand w-100" id="resetSendBtn">Send reset link</button></div>
    `);
    setTimeout(()=>{
      document.getElementById('resetSendBtn').onclick = ()=>{
        toast('Reset link sent', 'Check your inbox for a simulated password reset link.', 'success');
        bootstrap.Modal.getInstance(document.querySelector('.modal.show'))?.hide();
      };
    },50);
  };

  document.getElementById('loginForm').addEventListener('submit', function(e){
    e.preventDefault();
    const idVal = document.getElementById('loginId').value.trim().toLowerCase();
    const pw = document.getElementById('loginPassword').value;
    if(!this.checkValidity()){ this.classList.add('was-validated'); return; }
    const user = DB.users.find(u=>u.email.toLowerCase()===idVal || u.username.toLowerCase()===idVal);
    if(!user || user.password !== pw){
      toast('Login failed', 'We could not find a matching account and password.', 'error');
      return;
    }
    logInUser(user.id, document.getElementById('rememberMe').checked);
  });

  document.getElementById('signupForm').addEventListener('submit', function(e){
    e.preventDefault();
    if(!this.checkValidity()){ this.classList.add('was-validated'); return; }
    const name = document.getElementById('signupName').value.trim();
    const username = document.getElementById('signupUsername').value.trim().toLowerCase();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    if(DB.users.find(u=>u.username.toLowerCase()===username)){
      toast('Username taken', 'Please choose a different username.', 'error'); return;
    }
    if(DB.users.find(u=>u.email.toLowerCase()===email)){
      toast('Email in use', 'An account with this email already exists.', 'error'); return;
    }
    const newUser = {
      id:uid('user'), name, username, email, password, avatar:avatarFor(username), cover:coverFor(username+'cv'),
      bio:'', location:'', phone:'', website:'', headline:'', company:'', title:'',
      education:[], skills:[], interests:[], verified:false, experience:[],
      createdAt:nowISO(), settings:defaultSettings()
    };
    DB.users.push(newUser);
    saveDB();
    CURRENT_USER_ID = newUser.id;
    setSession(newUser.id, true);
    toast('Account created', 'Welcome to LinkApp!', 'success');
    startOnboarding();
  });
}

// ---------------- Onboarding ----------------
const INTEREST_OPTIONS = ['Technology','Engineering','Business','Design','Marketing','Finance','Education','Healthcare','Entertainment','Sports','Entrepreneurship'];
let selectedInterests = [];

function startOnboarding(){
  document.getElementById('splashScreen').classList.add('d-none');
  document.getElementById('authScreen').classList.add('d-none');
  document.getElementById('appShell').classList.add('d-none');
  document.getElementById('onboardStep1').classList.remove('d-none');
  document.getElementById('onboardStep2').classList.add('d-none');
  document.getElementById('obBack').classList.add('d-none');
  document.getElementById('obNext').classList.remove('d-none');
  document.getElementById('obFinish').classList.add('d-none');
  selectedInterests = [];
  const wrap = document.getElementById('obInterests');
  wrap.innerHTML = INTEREST_OPTIONS.map(i=>`<span class="interest-chip" data-interest="${i}">${i}</span>`).join('');
  wrap.querySelectorAll('.interest-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const val = chip.dataset.interest;
      if(selectedInterests.includes(val)){ selectedInterests = selectedInterests.filter(v=>v!==val); chip.classList.remove('selected'); }
      else{ selectedInterests.push(val); chip.classList.add('selected'); }
    });
  });
  const modal = new bootstrap.Modal(document.getElementById('onboardingModal'));
  modal.show();
}

function wireOnboarding(){
  document.getElementById('obNext').onclick = ()=>{
    document.getElementById('onboardStep1').classList.add('d-none');
    document.getElementById('onboardStep2').classList.remove('d-none');
    document.getElementById('obBack').classList.remove('d-none');
    document.getElementById('obNext').classList.add('d-none');
    document.getElementById('obFinish').classList.remove('d-none');
  };
  document.getElementById('obBack').onclick = ()=>{
    document.getElementById('onboardStep1').classList.remove('d-none');
    document.getElementById('onboardStep2').classList.add('d-none');
    document.getElementById('obBack').classList.add('d-none');
    document.getElementById('obNext').classList.remove('d-none');
    document.getElementById('obFinish').classList.add('d-none');
  };
  document.getElementById('obFinish').onclick = ()=>{
    const u = me();
    u.headline = document.getElementById('obHeadline').value.trim() || u.headline;
    u.company = document.getElementById('obCompany').value.trim() || u.company;
    u.location = document.getElementById('obLocation').value.trim() || u.location;
    u.phone = document.getElementById('obPhone').value.trim() || u.phone;
    u.bio = document.getElementById('obBio').value.trim() || u.bio;
    u.title = u.headline;
    u.interests = selectedInterests;
    awardCoins(u.id, 'completeProfile');
    saveDB();
    bootstrap.Modal.getInstance(document.getElementById('onboardingModal')).hide();
    enterApp();
    toast('Profile set up', 'Your profile is ready to go.', 'success');
  };
}

function boot(){
  wireAuthScreens();
  wireOnboarding();
  const session = getSession();
  if(session && userById(session.userId)){
    CURRENT_USER_ID = session.userId;
    enterApp();
  }else{
    showSplash();
  }
}
