/* ==========================================================================
   db.js — Local data model + persistence layer
   Simulated backend. Everything lives in LocalStorage under LS_KEY.
   NOTE: This is a frontend prototype. There is no real server, no real
   database, and no real encryption — all "network" actions below are
   simulated locally in the browser.
   ========================================================================== */
const LS_KEY = 'linkapp_db_v1';
const SESSION_KEY = 'linkapp_session_v1';

function uid(prefix){ return (prefix||'id') + '_' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
function nowISO(){ return new Date().toISOString(); }

function emptyDB(){
  return {
    users:[], connections:[], connectionRequests:[], follows:[],
    conversations:[], messages:[], communities:[], channels:[],
    statuses:[], posts:[], articles:[], companies:[], jobs:[],
    applications:[], notifications:[], events:[], savedItems:[],
    services:[], callHistory:[], blockedUsers:[], reports:[], drafts:[]
  };
}

let DB = loadDB();

function loadDB(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return emptyDB();
    const parsed = JSON.parse(raw);
    // merge in case new keys were added since last save
    return Object.assign(emptyDB(), parsed);
  }catch(e){
    console.error('DB load failed, resetting', e);
    return emptyDB();
  }
}

function saveDB(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(DB));
  }catch(e){
    console.error('DB save failed', e);
    toast('Storage error', 'Could not save your data. Storage may be full.', 'error');
  }
}

// ---------- Session ----------
function getSession(){
  try{
    return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || 'null');
  }catch(e){ return null; }
}
function setSession(userId, remember){
  const s = JSON.stringify({userId, at:nowISO()});
  if(remember){ localStorage.setItem(SESSION_KEY, s); sessionStorage.removeItem(SESSION_KEY); }
  else{ sessionStorage.setItem(SESSION_KEY, s); localStorage.removeItem(SESSION_KEY); }
}
function clearSession(){
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

let CURRENT_USER_ID = null;
function me(){ return DB.users.find(u=>u.id===CURRENT_USER_ID); }

// ---------- Generic lookups ----------
function userById(id){ return DB.users.find(u=>u.id===id); }
function companyById(id){ return DB.companies.find(c=>c.id===id); }
function jobById(id){ return DB.jobs.find(j=>j.id===id); }
function channelById(id){ return DB.channels.find(c=>c.id===id); }
function communityById(id){ return DB.communities.find(c=>c.id===id); }
function postById(id){ return DB.posts.find(p=>p.id===id); }
function articleById(id){ return DB.articles.find(a=>a.id===id); }
function convById(id){ return DB.conversations.find(c=>c.id===id); }
function eventById(id){ return DB.events.find(e=>e.id===id); }

// ---------- Connections ----------
function connectionStatus(userId, otherId){
  if(userId===otherId) return 'self';
  const conn = DB.connections.find(c=> (c.userA===userId&&c.userB===otherId) || (c.userA===otherId&&c.userB===userId));
  if(conn) return 'connected';
  const sent = DB.connectionRequests.find(r=>r.from===userId && r.to===otherId && r.status==='pending');
  if(sent) return 'pending_sent';
  const recv = DB.connectionRequests.find(r=>r.from===otherId && r.to===userId && r.status==='pending');
  if(recv) return 'pending_received';
  return 'none';
}
function connectionCount(userId){
  return DB.connections.filter(c=>c.userA===userId||c.userB===userId).length;
}
function connectionsOf(userId){
  return DB.connections.filter(c=>c.userA===userId||c.userB===userId)
    .map(c=> c.userA===userId ? c.userB : c.userA)
    .map(userById).filter(Boolean);
}
function mutualConnections(a,b){
  const ca = new Set(connectionsOf(a).map(u=>u.id));
  return connectionsOf(b).filter(u=>ca.has(u.id));
}
function sendConnectionRequest(from,to){
  if(connectionStatus(from,to)!=='none') return;
  DB.connectionRequests.push({id:uid('req'), from, to, status:'pending', at:nowISO()});
  addNotification(to, 'connection_request', `${userById(from).name} sent you a connection request`, from);
  saveDB();
}
function withdrawConnectionRequest(from,to){
  const r = DB.connectionRequests.find(r=>r.from===from&&r.to===to&&r.status==='pending');
  if(r) r.status='withdrawn';
  saveDB();
}
function acceptConnectionRequest(reqId){
  const r = DB.connectionRequests.find(x=>x.id===reqId);
  if(!r) return;
  r.status='accepted';
  DB.connections.push({id:uid('conn'), userA:r.from, userB:r.to, at:nowISO()});
  addNotification(r.from, 'connection_accepted', `${userById(r.to).name} accepted your connection request`, r.to);
  awardCoins(r.from, 'connectionAccepted');
  awardCoins(r.to, 'connectionAccepted');
  saveDB();
}
function declineConnectionRequest(reqId){
  const r = DB.connectionRequests.find(x=>x.id===reqId);
  if(r) r.status='declined';
  saveDB();
}
function removeConnection(a,b){
  DB.connections = DB.connections.filter(c=> !((c.userA===a&&c.userB===b)||(c.userA===b&&c.userB===a)));
  saveDB();
}

// ---------- Follow ----------
function isFollowing(followerId, type, id){
  return !!DB.follows.find(f=>f.follower===followerId && f.type===type && f.targetId===id);
}
function toggleFollow(followerId, type, id, name){
  const existing = DB.follows.find(f=>f.follower===followerId && f.type===type && f.targetId===id);
  if(existing){
    DB.follows = DB.follows.filter(f=>f!==existing);
  }else{
    DB.follows.push({id:uid('fol'), follower:followerId, type, targetId:id, at:nowISO()});
    if(type==='user') addNotification(id, 'new_follower', `${userById(followerId).name} started following you`, followerId);
  }
  saveDB();
  return !existing;
}
function followerCount(type,id){ return DB.follows.filter(f=>f.type===type&&f.targetId===id).length; }
function followingCount(userId){ return DB.follows.filter(f=>f.follower===userId).length; }

// ---------- Notifications ----------
function addNotification(userId, type, text, relatedId){
  DB.notifications.unshift({id:uid('notif'), userId, type, text, relatedId, read:false, at:nowISO()});
  saveDB();
}
function unreadNotifCount(userId){ return DB.notifications.filter(n=>n.userId===userId && !n.read).length; }
function markNotificationsRead(userId){
  DB.notifications.forEach(n=>{ if(n.userId===userId) n.read=true; });
  saveDB();
}

// ---------- Saved items ----------
function isSaved(userId, itemType, itemId){
  return !!DB.savedItems.find(s=>s.userId===userId && s.itemType===itemType && s.itemId===itemId);
}
function toggleSave(userId, itemType, itemId){
  const existing = DB.savedItems.find(s=>s.userId===userId && s.itemType===itemType && s.itemId===itemId);
  if(existing){ DB.savedItems = DB.savedItems.filter(s=>s!==existing); }
  else{ DB.savedItems.push({id:uid('save'), userId, itemType, itemId, at:nowISO()}); }
  saveDB();
  return !existing;
}

// ---------- Blocking ----------
function isBlocked(userId, otherId){
  return !!DB.blockedUsers.find(b=>b.userId===userId && b.blockedId===otherId);
}
function toggleBlock(userId, otherId){
  const existing = DB.blockedUsers.find(b=>b.userId===userId && b.blockedId===otherId);
  if(existing){ DB.blockedUsers = DB.blockedUsers.filter(b=>b!==existing); }
  else{
    DB.blockedUsers.push({id:uid('blk'), userId, blockedId:otherId, at:nowISO()});
    removeConnection(userId, otherId);
  }
  saveDB();
  return !existing;
}

// ---------- Conversations / messages ----------
function findOrCreateDM(a,b){
  let c = DB.conversations.find(c=>c.type==='dm' && c.participantIds.includes(a) && c.participantIds.includes(b));
  if(!c){
    c = {id:uid('conv'), type:'dm', participantIds:[a,b], pinned:[], archived:[], createdAt:nowISO(), disappearingHours:0, locked:false, lockPin:null};
    DB.conversations.push(c);
    saveDB();
  }
  return c;
}
function nonExpiredMessages(convId){
  const conv = convById(convId);
  const hours = conv?.disappearingHours || 0;
  const cutoff = hours>0 ? Date.now() - hours*3600*1000 : null;
  return DB.messages.filter(m=>m.conversationId===convId && (!cutoff || new Date(m.timestamp).getTime() > cutoff));
}
function conversationsFor(userId){
  return DB.conversations.filter(c=>c.participantIds.includes(userId))
    .sort((x,y)=> lastMessageTime(y.id) - lastMessageTime(x.id));
}
function lastMessageTime(convId){
  const msgs = nonExpiredMessages(convId).filter(m=>!m.deleted);
  if(!msgs.length) return 0;
  return new Date(msgs[msgs.length-1].timestamp).getTime();
}
function lastMessage(convId){
  const msgs = nonExpiredMessages(convId).filter(m=>!m.deleted);
  return msgs[msgs.length-1];
}
function unreadInConv(convId, userId){
  return nonExpiredMessages(convId).filter(m=>m.senderId!==userId && !m.readBy?.includes(userId) && !m.deleted).length;
}
function totalUnreadMessages(userId){
  return conversationsFor(userId).reduce((sum,c)=>sum+unreadInConv(c.id,userId),0);
}
function sendMessage(convId, senderId, text, opts={}){
  const msg = {
    id:uid('msg'), conversationId:convId, senderId, text, type:opts.type||'text',
    timestamp:nowISO(), reactions:{}, replyTo:opts.replyTo||null, starred:false, edited:false,
    deleted:false, pinned:false, readBy:[senderId],
    mediaKey:opts.mediaKey||null, contactId:opts.contactId||null, mediaUrl:opts.mediaUrl||null
  };
  DB.messages.push(msg);
  trackMessageSentForDailyBonus(senderId);
  saveDB();
  return msg;
}
function messagesFor(convId){ return nonExpiredMessages(convId).sort((a,b)=> new Date(a.timestamp)-new Date(b.timestamp)); }

function activeStatuses(){
  const now = Date.now();
  return DB.statuses.filter(s=> new Date(s.expiresAt).getTime() > now);
}

function hasApplied(userId, jobId){ return !!DB.applications.find(a=>a.userId===userId && a.jobId===jobId); }
function applyToJob(userId, jobId, form){
  const app = {id:uid('app'), userId, jobId, status:'Applied', appliedAt:nowISO(), notes:'', form};
  DB.applications.push(app);
  const job = jobById(jobId);
  addNotification(userId, 'application_update', `Application submitted for ${job.title}`, jobId);
  awardCoins(userId, 'applyToJob');
  saveDB();
  return app;
}
function updateApplicationStatus(appId, status){
  const a = DB.applications.find(x=>x.id===appId);
  if(!a) return;
  a.status = status;
  const job = jobById(a.jobId);
  addNotification(a.userId, 'application_update', `Your application for ${job.title} is now "${status}"`, a.jobId);
  saveDB();
}

// ---------- Privacy enforcement ----------
function checkPrivacy(targetUser, viewerId, key){
  if(!targetUser) return false;
  if(targetUser.id === viewerId) return true;
  const setting = targetUser.settings?.privacy?.[key] || 'Everyone';
  if(setting === 'Everyone') return true;
  if(setting === 'Only me') return false;
  if(setting === 'Connections') return connectionStatus(viewerId, targetUser.id) === 'connected';
  if(setting === 'Followers') return isFollowing(viewerId, 'user', targetUser.id) || connectionStatus(viewerId, targetUser.id) === 'connected';
  return true;
}

// ---------- IndexedDB (used for chat media / attachments) ----------
const IDB_NAME = 'linkapp_media_v1';
function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains('media')) req.result.createObjectStore('media'); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbSet(key, value){
  try{
    const db = await idbOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction('media','readwrite');
      tx.objectStore('media').put(value, key);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> reject(tx.error);
    });
  }catch(e){ console.error('idbSet failed', e); return false; }
}
async function idbGet(key){
  try{
    const db = await idbOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction('media','readonly');
      const req = tx.objectStore('media').get(key);
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }catch(e){ console.error('idbGet failed', e); return null; }
}
async function idbDelete(key){
  try{
    const db = await idbOpen();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction('media','readwrite');
      tx.objectStore('media').delete(key);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> reject(tx.error);
    });
  }catch(e){ return false; }
}

function resetDemoData(){
  localStorage.removeItem(LS_KEY);
  DB = emptyDB();
  seedDatabase();
  saveDB();
}
function exportData(){
  const blob = new Blob([JSON.stringify(DB,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'linkapp-data.json'; a.click();
  URL.revokeObjectURL(url);
}
function importData(jsonText){
  try{
    const parsed = JSON.parse(jsonText);
    if(typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid format');
    DB = Object.assign(emptyDB(), parsed);
    saveDB();
    return true;
  }catch(e){
    console.error('Import failed', e);
    return false;
  }
}

/* ==========================================================================
   LINKCOINS — reward points engine
   Not real currency, not blockchain — a simulated in-app rewards ledger
   stored per-user in LocalStorage. Different actions earn different amounts,
   most are daily-capped, and there's a hard daily ceiling so the balance
   can't be farmed by spamming one action.
   ========================================================================== */
const POINT_TABLE = {
  completeProfile:    {amount:40, oneTime:true,  label:'Completed your profile'},
  firstPost:          {amount:5,  oneTime:true,  label:'Published your first post'},
  createPost:         {amount:2,  dailyCap:3,    label:'Created a post'},
  addComment:         {amount:1,  dailyCap:8,    label:'Left a comment'},
  reactToPost:        {amount:1,  dailyCap:10,   label:'Reacted to a post'},
  saveItem:           {amount:1,  dailyCap:5,    label:'Saved a post, job, or article'},
  shareContent:       {amount:1,  dailyCap:5,    label:'Shared a post'},
  viewArticle:        {amount:1,  dailyCap:5,    label:'Read an article'},
  connectionAccepted: {amount:3,  dailyCap:6,    label:'Connection accepted'},
  publishArticle:     {amount:10, dailyCap:2,    label:'Published an article'},
  applyToJob:         {amount:5,  dailyCap:5,    label:'Applied to a job'},
  joinCommunity:      {amount:3,  dailyCap:3,    label:'Joined a community'},
  createEvent:        {amount:4,  dailyCap:3,    label:'Created an event'},
  joinEvent:          {amount:2,  dailyCap:5,    label:'Joined an event'},
  createCompany:      {amount:8,  dailyCap:2,    label:'Created a company page'},
  postJob:            {amount:3,  dailyCap:5,    label:'Posted a job'},
  enableTwoStep:      {amount:10, oneTime:true,  label:'Enabled two-step verification'},
  inviteFriend:       {amount:15, oneTime:true,  label:'Invited a friend'},
  dailyLogin:         {amount:1,  dailyCap:1,    label:'Opened LinkApp today'},
  dailyMessaging:     {amount:4,  dailyCap:1,    label:'Stayed active in your conversations today'},
  sessionActiveBonus: {amount:2,  dailyCap:1,    label:'Spent real time using LinkApp today'},
};
const DAILY_EARN_CEILING = 60; // hard cap across all repeatable actions combined
const DAILY_MESSAGE_THRESHOLD = 10; // messages sent to anyone, in a day, to trigger the messaging bonus
const SESSION_ACTIVE_MINUTES = 5; // minutes of real in-app time to trigger the session bonus
const ARTICLE_VIEW_DWELL_MS = 8000; // must stay on an article this long before it counts as "read"

function todayStr(){ return new Date().toISOString().slice(0,10); }

function ensureWalletDaily(wallet){
  const today = todayStr();
  if(wallet.dailyLog.date !== today){
    wallet.dailyLog = {date:today, earnedToday:0, actionCounts:{}, messagesSentToday:0, sessionSecondsToday:0};
  }
  if(wallet.dailyLog.messagesSentToday===undefined) wallet.dailyLog.messagesSentToday = 0;
  if(wallet.dailyLog.sessionSecondsToday===undefined) wallet.dailyLog.sessionSecondsToday = 0;
}

// Returns the transaction if points were awarded, or null if blocked by a cap.
function awardCoins(userId, actionKey, opts={}){
  const user = userById(userId);
  if(!user) return null;
  ensureUserSettingsDefaults(user);
  const wallet = user.settings.wallet;
  const rule = POINT_TABLE[actionKey];
  if(!rule) return null;
  ensureWalletDaily(wallet);

  if(rule.oneTime){
    if(wallet.oneTimeAwards.includes(actionKey)) return null;
  } else if(rule.dailyCap){
    const doneToday = wallet.dailyLog.actionCounts[actionKey] || 0;
    if(doneToday >= rule.dailyCap) return null;
  }
  if(!rule.oneTime && wallet.dailyLog.earnedToday >= DAILY_EARN_CEILING) return null;

  let amount = rule.amount;
  if(!rule.oneTime && wallet.dailyLog.earnedToday + amount > DAILY_EARN_CEILING){
    amount = DAILY_EARN_CEILING - wallet.dailyLog.earnedToday; // partial award to respect the ceiling
  }
  if(amount <= 0) return null;

  wallet.balance += amount;
  wallet.lifetimeEarned += amount;
  if(rule.oneTime) wallet.oneTimeAwards.push(actionKey);
  else{
    wallet.dailyLog.actionCounts[actionKey] = (wallet.dailyLog.actionCounts[actionKey]||0) + 1;
    wallet.dailyLog.earnedToday += amount;
  }
  const tx = {id:uid('tx'), type:'earn', actionKey, label:opts.label||rule.label, amount, timestamp:nowISO()};
  wallet.transactions.unshift(tx);
  saveDB();
  return tx;
}

// Generalized daily messaging bonus: counts messages sent to ANYONE, not one
// contact, so it can't be gamed by ping-ponging a single friend for reward.
function trackMessageSentForDailyBonus(userId){
  const user = userById(userId);
  if(!user) return;
  ensureUserSettingsDefaults(user);
  const wallet = user.settings.wallet;
  ensureWalletDaily(wallet);
  wallet.dailyLog.messagesSentToday += 1;
  if(wallet.dailyLog.messagesSentToday >= DAILY_MESSAGE_THRESHOLD){
    awardCoins(userId, 'dailyMessaging');
  }
}

// Tracks real in-app time (only while the tab is visible) and awards a small
// bonus once a session crosses a minimum "actually used the app" threshold.
// Called periodically (not every second) to avoid excessive storage writes.
function trackActiveTime(userId, incrementSeconds){
  const user = userById(userId);
  if(!user) return;
  ensureUserSettingsDefaults(user);
  const wallet = user.settings.wallet;
  ensureWalletDaily(wallet);
  wallet.dailyLog.sessionSecondsToday += incrementSeconds;
  if(wallet.dailyLog.sessionSecondsToday >= SESSION_ACTIVE_MINUTES*60){
    awardCoins(userId, 'sessionActiveBonus');
  } else {
    saveDB();
  }
}

function spendCoins(userId, amount, label, perkId){
  const user = userById(userId);
  if(!user) return false;
  ensureUserSettingsDefaults(user);
  const wallet = user.settings.wallet;
  if(wallet.balance < amount) return false;
  wallet.balance -= amount;
  const tx = {id:uid('tx'), type:'spend', label, amount:-amount, timestamp:nowISO()};
  wallet.transactions.unshift(tx);
  if(perkId) wallet.redeemedPerks.push({id:uid('perk'), perkId, at:nowISO()});
  saveDB();
  return true;
}

function checkDailyLoginBonus(userId){
  const user = userById(userId);
  if(!user) return;
  ensureUserSettingsDefaults(user);
  const wallet = user.settings.wallet;
  const today = todayStr();
  const streak = wallet.loginStreak;
  if(streak.lastLoginDate === today) return; // already credited today
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  streak.count = (streak.lastLoginDate === yesterday) ? streak.count + 1 : 1;
  streak.lastLoginDate = today;
  awardCoins(userId, 'dailyLogin');
  if(streak.count === 7) creditWalletDirect(userId, 20, '7-day login streak bonus');
  if(streak.count === 30) creditWalletDirect(userId, 50, '30-day login streak bonus');
  saveDB();
}
function creditWalletDirect(userId, amount, label){
  const user = userById(userId);
  const wallet = user.settings.wallet;
  wallet.balance += amount;
  wallet.lifetimeEarned += amount;
  wallet.transactions.unshift({id:uid('tx'), type:'earn', actionKey:'streakBonus', label, amount, timestamp:nowISO()});
}

// Cosmetic-only "LinkCoin Index" ticker — a bounded pseudo-random drift
// derived from the current time, purely for flavor. LinkCoins have no
// real-world monetary value and this number cannot be redeemed for cash.
function getLinkCoinIndex(){
  const base = 12.50;
  const t = Date.now() / 60000; // minutes
  const wave = Math.sin(t/7)*0.4 + Math.sin(t/13)*0.25 + Math.cos(t/3)*0.15;
  const prevWave = Math.sin((t-1)/7)*0.4 + Math.sin((t-1)/13)*0.25 + Math.cos((t-1)/3)*0.15;
  const rate = base + wave;
  const changePct = prevWave!==0 ? ((wave-prevWave)/Math.abs(base))*100 : 0;
  return {rate: rate.toFixed(2), changePct: changePct.toFixed(2), up: changePct>=0};
}

const REDEEMABLE_PERKS = [
  {id:'profile_boost', name:'Profile Boost (24h)', cost:100, icon:'bi-graph-up-arrow', desc:'Appear higher in "People you may know" for 24 hours.'},
  {id:'post_boost', name:'Post Boost (24h)', cost:150, icon:'bi-megaphone', desc:'Adds a highlighted "Boosted" tag to your next post.'},
  {id:'verified_flair', name:'Verified Flair (7 days)', cost:300, icon:'bi-patch-check', desc:'Temporary verification badge on your profile.'},
  {id:'gold_frame', name:'Gold Avatar Frame', cost:500, icon:'bi-award', desc:'A gold ring around your avatar across the app.'},
  {id:'featured_job', name:'Featured Job Listing', cost:250, icon:'bi-star', desc:'Pin one of your job posts to the top of the list for 24 hours.'},
  {id:'accent_unlock', name:'Alternate Accent Theme', cost:1000, icon:'bi-palette2', desc:'Unlock an emerald accent colour option in Appearance.'},
];
