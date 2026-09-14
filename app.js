/* ==========================================================================
   app.js — router + shell wiring + page renderers
   ========================================================================== */
const ROUTES = ['home','network','messages','jobs','companies','articles','wallet','communities','channels','events','notifications','services','saved','profile','settings','search'];
const expandedComments = new Set();
let activeWalletTab = 'wallet';
let pendingSettingsSection = null;

function initAppShellEvents(){
  // Theme
  document.getElementById('themeToggleBtn').onclick = ()=>{
    const html = document.documentElement;
    const cur = html.getAttribute('data-theme');
    const next = cur==='dark' ? 'light':'dark';
    html.setAttribute('data-theme', next);
    if(me()){ me().settings.theme = next; saveDB(); }
    document.getElementById('themeToggleBtn').innerHTML = next==='dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
  };
  if(me()?.settings?.theme==='dark'){
    document.documentElement.setAttribute('data-theme','dark');
    document.getElementById('themeToggleBtn').innerHTML = '<i class="bi bi-sun"></i>';
  }

  // Brand -> home
  // Generic delegated handler for any element using data-route (topbar icons, brand, etc.)
  document.querySelectorAll('[data-route]').forEach(el=>{
    el.addEventListener('click', ()=> location.hash = el.dataset.route);
  });
  document.getElementById('topbarWalletChip')?.addEventListener('click', ()=> location.hash = '#/wallet');

  // Logout / switch account
  document.getElementById('logoutBtn').onclick = (e)=>{ e.preventDefault(); logOut(); };
  document.getElementById('switchAccountBtn').onclick = (e)=>{ e.preventDefault(); logOut(); showAuthPane('demo'); };

  // Global search
  const searchInput = document.getElementById('globalSearchInput');
  const suggBox = document.getElementById('searchSuggestions');
  searchInput.addEventListener('input', debounce(()=>{
    const q = searchInput.value.trim();
    if(!q){ suggBox.classList.add('d-none'); return; }
    renderSearchSuggestions(q, suggBox);
  }, 200));
  searchInput.addEventListener('focus', ()=>{ if(searchInput.value.trim()) suggBox.classList.remove('d-none'); });
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.topbar-search')) suggBox.classList.add('d-none');
  });
  searchInput.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && searchInput.value.trim()){
      location.hash = '#/search?q=' + encodeURIComponent(searchInput.value.trim());
      suggBox.classList.add('d-none');
    }
  });
  document.getElementById('mobileSearchBtn').onclick = openMobileSearchOverlay;

  // Sidebar create button
  document.getElementById('sidebarPostBtn').onclick = ()=> openCreatePostModal();

  // FAB
  const fab = document.getElementById('fabBtn'), fabMenu = document.getElementById('fabMenu');
  fab.onclick = ()=> fabMenu.classList.toggle('d-none');
  fabMenu.querySelectorAll('[data-fab]').forEach(btn=>{
    btn.onclick = ()=>{
      fabMenu.classList.add('d-none');
      const kind = btn.dataset.fab;
      if(kind==='post') openCreatePostModal();
      else if(kind==='status') openCreateStatusModal();
      else if(kind==='group') openCreateGroupModal();
      else if(kind==='job') openCreateJobModal();
      else if(kind==='event') openCreateEventModal();
      else if(kind==='article') openCreateArticleModal();
    };
  });
  document.addEventListener('click',(e)=>{
    if(!e.target.closest('#fabMenu') && !e.target.closest('#fabBtn')) fabMenu.classList.add('d-none');
  });

  window.addEventListener('hashchange', router);
}

function refreshBadges(){
  if(!me()) return;
  ensureUserSettingsDefaults(me());
  const notif = unreadNotifCount(me().id);
  const msg = totalUnreadMessages(me().id);
  const reqCount = DB.connectionRequests.filter(r=>r.to===me().id && r.status==='pending').length;
  toggleBadge('notifBadge', notif>0);
  toggleBadge('msgBadge', msg>0);
  toggleBadge('navNotifBadge', notif>0, notif);
  toggleBadge('navMsgBadge', msg>0, msg);
  toggleBadge('navNetworkBadge', reqCount>0, reqCount);
  toggleBadge('bottomMsgBadge', msg>0);
  const balanceEl = document.getElementById('topbarWalletBalance');
  if(balanceEl) balanceEl.textContent = me().settings.wallet.balance.toLocaleString();
}
function toggleBadge(id, show, count){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.toggle('d-none', !show);
  if(count!=null) el.textContent = count>9?'9+':count;
}

function setActiveNav(routeName){
  document.querySelectorAll('[data-nav]').forEach(el=>{
    const isActive = el.dataset.nav===routeName;
    el.classList.toggle('active', isActive);
    if(isActive) el.setAttribute('aria-current','page');
    else el.removeAttribute('aria-current');
  });
}

// ---------------- ROUTER ----------------
function router(){
  if(!me()) return;
  const hash = location.hash.replace('#/','') || 'home';
  const [pathPart, queryPart] = hash.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const base = segments[0] || 'home';
  const param = segments[1];
  const query = new URLSearchParams(queryPart||'');
  const main = document.getElementById('mainContent');
  const rail = document.getElementById('rightRail');
  setActiveNav(base);
  refreshBadges();
  if(base!=='messages') setFabVisible(true);

  const renderers = {
    home: ()=>{ main.innerHTML = renderHomeFeed(); rail.innerHTML = renderRightRailHome(); wireFeedEvents(main); },
    network: ()=>{ main.innerHTML = renderNetworkPage(); rail.innerHTML = renderRightRailGeneric(); wireNetworkEvents(main); },
    messages: ()=>{ rail.innerHTML=''; renderMessagesPage(main, param); },
    jobs: ()=>{
      if(param==='applications'){ main.innerHTML = renderApplicationsPage(); wireApplicationsEvents(main); }
      else if(param==='manage'){ main.innerHTML = renderManageJobsPage(); wireManageJobsEvents(main); }
      else if(param){ main.innerHTML = renderJobDetail(param); wireJobDetailEvents(main, param); }
      else { main.innerHTML = renderJobsPage(); wireJobsEvents(main); }
      rail.innerHTML = renderRightRailGeneric();
    },
    companies: ()=>{
      if(param){ main.innerHTML = renderCompanyDetail(param); wireCompanyDetailEvents(main, param); }
      else { main.innerHTML = renderCompaniesPage(); wireFollowButtons(main); main.querySelector('#createCompanyBtn')?.addEventListener('click', openCreateCompanyModal); }
      rail.innerHTML = renderRightRailGeneric();
    },
    articles: ()=>{
      if(param){ main.innerHTML = renderArticleDetail(param); wireArticleDetailEvents(main, param); }
      else { main.innerHTML = renderArticlesPage(); wireArticlesPageEvents(main); }
      rail.innerHTML = renderRightRailGeneric();
    },
    wallet: ()=>{
      main.innerHTML = renderWalletPage(activeWalletTab);
      wireWalletEvents(main);
      rail.innerHTML = renderRightRailGeneric();
    },
    communities: ()=>{
      if(param){ main.innerHTML = renderCommunityDetail(param); wireCommunityDetailEvents(main, param); }
      else { main.innerHTML = renderCommunitiesPage(); wireCommunitiesEvents(main); }
      rail.innerHTML = renderRightRailGeneric();
    },
    channels: ()=>{
      if(param){ main.innerHTML = renderChannelDetail(param); wireChannelDetailEvents(main, param); }
      else { main.innerHTML = renderChannelsPage(); wireChannelsEvents(main); }
      rail.innerHTML = renderRightRailGeneric();
    },
    events: ()=>{ main.innerHTML = renderEventsPage(); rail.innerHTML = renderRightRailGeneric(); wireEventsEvents(main); },
    notifications: ()=>{ main.innerHTML = renderNotificationsPage(); rail.innerHTML = renderRightRailGeneric(); wireNotificationsEvents(main); markNotificationsRead(me().id); refreshBadges(); },
    services: ()=>{ main.innerHTML = renderServicesPage(); rail.innerHTML = renderRightRailGeneric(); wireServicesEvents(main); },
    saved: ()=>{ main.innerHTML = renderSavedPage(); rail.innerHTML = renderRightRailGeneric(); wireFeedEvents(main); },
    profile: ()=>{ const uidP = param || me().id; main.innerHTML = renderProfilePage(uidP); rail.innerHTML = renderRightRailGeneric(); wireProfileEvents(main, uidP); },
    settings: ()=>{ main.innerHTML = renderSettingsPage(); rail.innerHTML=''; wireSettingsEvents(main); },
    search: ()=>{ main.innerHTML = renderSearchPage(query.get('q')||''); rail.innerHTML=''; wireFeedEvents(main); wireFollowButtons(main); },
  };
  (renderers[base] || renderers.home)();
  window.scrollTo({top:0});
}

// ---------------- SHARED SNIPPETS ----------------
function userChip(u, sub){
  return `<div class="rail-item"><img src="${u.avatar}" alt=""><div><div class="rail-name">${escapeHtml(u.name)}</div><div class="rail-sub">${escapeHtml(sub||u.headline||'')}</div></div></div>`;
}

function renderRightRailHome(){
  const myId = me().id;
  const suggestions = DB.users.filter(u=>u.id!==myId && connectionStatus(myId,u.id)==='none' && !isBlocked(myId,u.id)).slice(0,4);
  const jobs = DB.jobs.slice(0,3);
  const events = DB.events.filter(e=>new Date(e.date)>=new Date(Date.now()-86400000)).slice(0,2);
  return `
    <div class="card-panel">
      <h6>People you may know</h6>
      ${suggestions.map(u=>`
        <div class="d-flex align-items-center justify-content-between mb-2">
          <div class="d-flex align-items-center gap-2" style="cursor:pointer" data-goto-profile="${u.id}">
            <img src="${u.avatar}" style="width:38px;height:38px;border-radius:50%;object-fit:cover">
            <div><div class="fw-bold small">${escapeHtml(u.name)}</div><div class="text-muted-2" style="font-size:.74rem">${escapeHtml(u.headline)}</div></div>
          </div>
          <button class="btn btn-outline-brand btn-sm-pill" data-connect-btn="${u.id}">${connectLabel(myId,u.id)}</button>
        </div>`).join('') || `<p class="small text-muted-2 mb-0">You're all caught up on suggestions.</p>`}
    </div>
    <div class="card-panel">
      <h6>Jobs for you</h6>
      ${jobs.map(j=>{ const c = companyById(j.companyId); return `
        <div class="mb-2 pb-2" style="border-bottom:1px solid var(--border-color); cursor:pointer" data-goto-job="${j.id}">
          <div class="fw-bold small">${escapeHtml(j.title)}</div>
          <div class="text-muted-2" style="font-size:.76rem">${escapeHtml(c.name)} · ${escapeHtml(j.location)}</div>
        </div>`;}).join('')}
      <a href="#/jobs" class="small">See all jobs →</a>
    </div>
    <div class="card-panel">
      <h6>Upcoming events</h6>
      ${events.length? events.map(e=>`
        <div class="mb-2" data-goto="#/events">
          <div class="fw-bold small">${escapeHtml(e.name)}</div>
          <div class="text-muted-2" style="font-size:.76rem">${formatDate(e.date)} · ${escapeHtml(e.location)}</div>
        </div>`).join('') : `<p class="small text-muted-2 mb-0">No upcoming events yet.</p>`}
    </div>
  `;
}
function renderRightRailGeneric(){
  const myId = me().id;
  const trending = ['#technology','#design','#business','#engineering','#marketing'];
  const suggestions = DB.users.filter(u=>u.id!==myId && connectionStatus(myId,u.id)==='none').slice(0,3);
  return `
    <div class="card-panel">
      <h6>Trending topics</h6>
      ${trending.map(t=>`<div class="mb-2"><a href="#" class="fw-bold small" data-goto-hashtag="${t.slice(1)}">${t}</a></div>`).join('')}
    </div>
    <div class="card-panel">
      <h6>Suggested for you</h6>
      ${suggestions.map(u=>userChip(u)).join('') || `<p class="small text-muted-2 mb-0">Nothing new right now.</p>`}
    </div>
  `;
}
function pluralize(count, noun){ return `${count} ${noun}${count===1?'':'s'}`; }

function openMobileSearchOverlay(){
  const overlay = document.createElement('div');
  overlay.className = 'mobile-search-overlay';
  overlay.innerHTML = `
    <div class="msov-header">
      <button class="topbar-icon-btn" id="closeMobileSearch"><i class="bi bi-arrow-left"></i></button>
      <input type="text" id="mobileSearchInput" placeholder="Search people, posts, jobs, companies…" autocomplete="off">
    </div>
    <div class="msov-results" id="mobileSearchResults"><div class="p-4 text-center text-muted-2 small">Start typing to search LinkApp.</div></div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#mobileSearchInput');
  const results = overlay.querySelector('#mobileSearchResults');
  input.focus();
  overlay.querySelector('#closeMobileSearch').addEventListener('click', ()=> overlay.remove());
  input.addEventListener('input', debounce(()=>{
    const q = input.value.trim();
    if(!q){ results.innerHTML = `<div class="p-4 text-center text-muted-2 small">Start typing to search LinkApp.</div>`; return; }
    renderSearchSuggestions(q, results);
    results.classList.remove('d-none');
    results.querySelectorAll('[data-search-all]').forEach(el=>{
      el.addEventListener('click', ()=>{ overlay.remove(); location.hash = '#/search?q='+encodeURIComponent(q); });
    });
  }, 200));
  input.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && input.value.trim()){ overlay.remove(); location.hash = '#/search?q='+encodeURIComponent(input.value.trim()); }
  });
  overlay.querySelectorAll('[data-goto-profile],[data-goto-job],[data-goto-company]').forEach(()=>{});
  overlay.addEventListener('click', (e)=>{
    if(e.target.closest('[data-goto-profile],[data-goto-job],[data-goto-company]')) overlay.remove();
  });
}

function connectLabel(myId, otherId){
  const st = connectionStatus(myId, otherId);
  return {none:'Connect', pending_sent:'Pending', pending_received:'Respond', connected:'Connected', self:'You'}[st];
}

// generic delegated click handler for common data-attrs across pages
function wireCommonNav(container){
  container.querySelectorAll('[data-goto-profile]').forEach(el=>el.addEventListener('click',(e)=>{ e.stopPropagation(); location.hash='#/profile/'+el.dataset.gotoProfile; }));
  container.querySelectorAll('[data-goto-job]').forEach(el=>el.addEventListener('click',(e)=>{ e.stopPropagation(); location.hash='#/jobs/'+el.dataset.gotoJob; }));
  container.querySelectorAll('[data-goto-company]').forEach(el=>el.addEventListener('click',(e)=>{ e.stopPropagation(); location.hash='#/companies/'+el.dataset.gotoCompany; }));
  container.querySelectorAll('[data-goto-article]').forEach(el=>el.addEventListener('click',(e)=>{ e.stopPropagation(); location.hash='#/articles/'+el.dataset.gotoArticle; }));
  container.querySelectorAll('[data-goto-hashtag]').forEach(el=>el.addEventListener('click',(e)=>{ e.preventDefault(); e.stopPropagation(); location.hash='#/search?q='+encodeURIComponent('#'+el.dataset.gotoHashtag); }));
  container.querySelectorAll('[data-goto]').forEach(el=>el.addEventListener('click',(e)=>{ e.stopPropagation(); location.hash = el.dataset.goto; }));
}

// ==========================================================================
// FEED / POSTS
// ==========================================================================
function authorOf(post){
  return post.authorType==='company' ? companyById(post.authorId) : userById(post.authorId);
}
function authorName(post){ const a = authorOf(post); return a ? (a.name) : 'Unknown'; }
function authorAvatar(post){ const a = authorOf(post); return a ? (a.avatar||a.logo) : ''; }
function authorSub(post){
  if(post.authorType==='company'){ const c = authorOf(post); return c ? c.industry : ''; }
  const u = authorOf(post); return u ? u.headline : '';
}

function renderStatusStrip(){
  const myId = me().id;
  const others = DB.users.filter(u=>u.id!==myId);
  const usersWithStatus = [me(), ...others].filter(u=>activeStatuses().some(s=>s.userId===u.id));
  return `
    <div class="card-panel">
      <div class="status-strip">
        <div class="status-item" data-my-status="1">
          <div class="status-ring viewed"><img src="${me().avatar}" alt=""></div>
          <div class="status-name">Your status</div>
        </div>
        ${usersWithStatus.filter(u=>u.id!==myId).map(u=>`
          <div class="status-item" data-view-status="${u.id}">
            <div class="status-ring"><img src="${u.avatar}" alt=""></div>
            <div class="status-name">${escapeHtml(u.name.split(' ')[0])}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderComposerBox(){
  return `
    <div class="card-panel">
      <div class="composer-box">
        <img src="${me().avatar}" alt="">
        <div class="composer-trigger" id="composerTrigger">What's on your mind, ${escapeHtml(me().name.split(' ')[0])}?</div>
      </div>
      <div class="composer-tools">
        <button data-fab="image"><i class="bi bi-image text-success"></i>Photo</button>
        <button data-fab="poll"><i class="bi bi-bar-chart text-accent"></i>Poll</button>
        <button data-fab="article"><i class="bi bi-file-text text-warning"></i>Article</button>
        <button data-fab="event"><i class="bi bi-calendar-event" style="color:var(--accent-warm)"></i>Event</button>
      </div>
    </div>
  `;
}

function renderHomeFeed(){
  const myId = me().id;
  const myConnIds = new Set(connectionsOf(myId).map(u=>u.id));
  const followedCompanyIds = new Set(DB.follows.filter(f=>f.follower===myId&&f.type==='company').map(f=>f.targetId));
  const blockedIds = new Set(DB.blockedUsers.filter(b=>b.userId===myId).map(b=>b.blockedId));
  const posts = DB.posts.filter(p=>{
    if(p.authorType==='company') return true;
    if(blockedIds.has(p.authorId)) return false;
    return true;
  }).sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));

  return `
    ${renderStatusStrip()}
    ${renderComposerBox()}
    <div id="feedList" class="d-flex flex-column gap-3">
      ${posts.length ? posts.map(p=>renderPostCard(p)).join('') : emptyState('bi-card-text','No posts yet','Follow people and companies to see their updates here.')}
    </div>
  `;
}

function renderPostCard(post){
  const a = authorOf(post);
  if(!a) return '';
  const avatar = post.authorType==='company' ? a.logo : a.avatar;
  const myId = me().id;
  const myReaction = post.reactions[myId];
  const reactionCounts = {};
  Object.values(post.reactions).forEach(r=> reactionCounts[r]=(reactionCounts[r]||0)+1);
  const totalReactions = Object.values(post.reactions).length;
  const topReactions = Object.entries(reactionCounts).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k])=>REACTIONS[k]).join('');
  const saved = isSaved(myId,'post',post.id);
  const gotoAttr = post.authorType==='company' ? `data-goto-company="${a.id}"` : `data-goto-profile="${a.id}"`;

  let pollHtml = '';
  if(post.poll){
    const totalVotes = post.poll.options.reduce((s,o)=>s+o.votes,0) || 0;
    const voted = post.votedBy.includes(myId);
    pollHtml = `<div class="poll-block mb-2" data-poll-post="${post.id}">
      <div class="fw-bold small mb-2">${escapeHtml(post.poll.question)}</div>
      ${post.poll.options.map((o,i)=>{
        const pct = totalVotes ? Math.round(o.votes/totalVotes*100) : 0;
        return voted ? `
          <div class="poll-option"><div class="fill" style="width:${pct}%"></div><div class="content"><span>${escapeHtml(o.text)}</span><span>${pct}%</span></div></div>
        ` : `<div class="poll-option" data-vote-option="${i}"><div class="content"><span>${escapeHtml(o.text)}</span></div></div>`;
      }).join('')}
      <div class="text-muted-2" style="font-size:.72rem">${totalVotes} vote${totalVotes!==1?'s':''}</div>
    </div>`;
  }

  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <img src="${avatar}" alt="${escapeHtml(a.name)}" ${gotoAttr} style="cursor:pointer">
        <div class="flex-grow-1">
          <div class="post-author" ${gotoAttr}>${escapeHtml(a.name)} ${a.verified?'<i class="bi bi-patch-check-fill text-accent" style="font-size:.8rem"></i>':''}</div>
          <div class="post-meta">${escapeHtml(authorSub(post))}</div>
          <div class="post-meta">${timeAgo(post.timestamp)} · <i class="bi bi-globe-americas"></i> ${escapeHtml(post.privacy)}</div>
        </div>
        <div class="dropdown">
          <button class="topbar-icon-btn" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="#" data-save-post="${post.id}">${saved?'Remove from saved':'Save post'}</a></li>
            <li><a class="dropdown-item" href="#" data-copy-link="${post.id}">Copy link</a></li>
            ${post.authorId===myId?`<li><a class="dropdown-item text-danger" href="#" data-delete-post="${post.id}">Delete post</a></li>`:`<li><a class="dropdown-item" href="#" data-hide-post="${post.id}">Hide post</a></li><li><a class="dropdown-item text-danger" href="#" data-report-post="${post.id}">Report post</a></li>`}
          </ul>
        </div>
      </div>
      <div class="post-text">${linkify(post.text)}</div>
      ${pollHtml}
      ${post.media ? `<div class="post-media"><img src="${post.media}" alt="" loading="lazy"></div>` : ''}
      <div class="post-stats">
        <span>${topReactions} ${totalReactions>0?totalReactions+' reaction'+(totalReactions!==1?'s':''):''}</span>
        <span>${post.comments.length} comment${post.comments.length!==1?'s':''} · ${post.shares} share${post.shares!==1?'s':''}</span>
      </div>
      <div class="post-actions position-relative">
        <button class="${myReaction?'liked':''}" data-react-btn="${post.id}" data-hold="1">
          <i class="bi ${myReaction?'bi-hand-thumbs-up-fill':'bi-hand-thumbs-up'}"></i> ${myReaction ? myReaction[0].toUpperCase()+myReaction.slice(1) : 'Like'}
        </button>
        <button data-toggle-comments="${post.id}"><i class="bi bi-chat"></i> Comment</button>
        <button data-share-post="${post.id}"><i class="bi bi-share"></i> Share</button>
        <button class="${saved?'saved':''}" data-save-post="${post.id}"><i class="bi ${saved?'bi-bookmark-fill':'bi-bookmark'}"></i> Save</button>
      </div>
      <div class="comment-section ${expandedComments.has(post.id)?'':'d-none'}" id="comments-${post.id}">
        ${renderComments(post)}
        <div class="d-flex gap-2 mt-2">
          <img src="${me().avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">
          <input type="text" class="form-control form-control-sm" placeholder="Write a comment…" data-comment-input="${post.id}" style="border-radius:999px">
        </div>
      </div>
    </div>
  `;
}

function findCommentNode(post, path){
  let list = post.comments;
  let node = null;
  for(const id of path){
    node = list.find(c=>c.id===id);
    if(!node) return null;
    list = node.replies = node.replies || [];
  }
  return node;
}

function renderCommentNode(postId, node, path, depth){
  const u = userById(node.authorId);
  if(!u) return '';
  const pathStr = path.join(',');
  const likes = node.likes || [];
  const replies = node.replies || [];
  const indent = depth>0 ? `style="margin-left:${Math.min(depth,4)*1.6}rem"` : '';
  return `
    <div class="comment-item mt-2" ${indent}>
      <img src="${u.avatar}" alt="${escapeHtml(u.name)}">
      <div class="flex-grow-1">
        <div class="comment-bubble">
          <div class="c-author">${escapeHtml(u.name)}</div>
          <div class="c-text">${linkify(node.text)}</div>
        </div>
        <div class="d-flex gap-3 mt-1" style="font-size:.72rem">
          <span class="text-muted-2">${timeAgo(node.timestamp)}</span>
          <a href="#" class="${likes.includes(me().id)?'text-accent fw-bold':'text-muted-2'}" data-like-comment="${postId}|${pathStr}">Like ${likes.length?`(${likes.length})`:''}</a>
          <a href="#" class="text-muted-2" data-reply-comment="${postId}|${pathStr}">Reply</a>
        </div>
        ${replies.map(r=>renderCommentNode(postId, r, [...path, r.id], depth+1)).join('')}
      </div>
    </div>`;
}

function renderComments(post, limit){
  const comments = limit ? post.comments.slice(0,limit) : post.comments;
  return comments.map(c=>renderCommentNode(post.id, c, [c.id], 0)).join('') || `<p class="small text-muted-2">No comments yet — be the first to comment.</p>`;
}


function wireFeedEvents(container){
  wireCommonNav(container);
  wireFollowButtons(container);

  container.querySelectorAll('[data-goto-profile], [data-goto-company]').forEach(el=>{}); // handled by wireCommonNav

  const trigger = container.querySelector('#composerTrigger');
  if(trigger) trigger.addEventListener('click', ()=>openCreatePostModal());
  container.querySelectorAll('[data-fab]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const kind = btn.dataset.fab;
      if(kind==='image') openCreatePostModal('image');
      else if(kind==='poll') openCreatePostModal('poll');
      else if(kind==='article') openCreateArticleModal();
      else if(kind==='event') openCreateEventModal();
    });
  });

  container.querySelectorAll('[data-my-status]').forEach(el=>el.addEventListener('click', ()=>openCreateStatusModal()));
  container.querySelectorAll('[data-view-status]').forEach(el=>el.addEventListener('click', ()=>openStatusViewer(el.dataset.viewStatus)));

  container.querySelectorAll('[data-connect-btn]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); handleConnectClick(btn.dataset.connectBtn, btn); });
  });

  container.querySelectorAll('[data-react-btn]').forEach(btn=>{
    let pressTimer;
    const postId = btn.dataset.reactBtn;
    const showBar = ()=>{
      document.querySelectorAll('.reaction-bar').forEach(b=>b.remove());
      const bar = document.createElement('div');
      bar.className='reaction-bar';
      bar.innerHTML = Object.entries(REACTIONS).map(([k,e])=>`<button data-pick-reaction="${k}">${e}</button>`).join('');
      document.body.appendChild(bar);
      const rect = btn.getBoundingClientRect();
      bar.style.top = (rect.top + window.scrollY - 46)+'px';
      bar.style.left = (rect.left + window.scrollX)+'px';
      bar.querySelectorAll('[data-pick-reaction]').forEach(b=>{
        b.addEventListener('click', ()=>{ setReaction(postId, b.dataset.pickReaction); bar.remove(); });
      });
      setTimeout(()=>{
        document.addEventListener('click', function closeBar(ev){
          if(!bar.contains(ev.target)){ bar.remove(); document.removeEventListener('click', closeBar); }
        });
      },0);
    };
    btn.addEventListener('mousedown', ()=>{ pressTimer = setTimeout(showBar, 380); });
    btn.addEventListener('touchstart', ()=>{ pressTimer = setTimeout(showBar, 380); });
    ['mouseup','mouseleave','touchend'].forEach(ev=>btn.addEventListener(ev, ()=>clearTimeout(pressTimer)));
    btn.addEventListener('click', ()=>{
      const post = postById(postId);
      if(post.reactions[me().id]) setReaction(postId, null);
      else setReaction(postId, 'like');
    });
  });

  container.querySelectorAll('[data-toggle-comments]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const postId = btn.dataset.toggleComments;
      const el = document.getElementById('comments-'+postId);
      el.classList.toggle('d-none');
      if(el.classList.contains('d-none')) expandedComments.delete(postId);
      else expandedComments.add(postId);
    });
  });
  container.querySelectorAll('[data-comment-input]').forEach(inp=>{
    inp.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' && inp.value.trim()){
        addComment(inp.dataset.commentInput, inp.value.trim());
        inp.value='';
      }
    });
  });
  container.querySelectorAll('[data-like-comment]').forEach(a=>{
    a.addEventListener('click',(e)=>{
      e.preventDefault();
      const [postId, pathStr] = a.dataset.likeComment.split('|');
      toggleCommentLike(postId, pathStr.split(','));
    });
  });
  container.querySelectorAll('[data-reply-comment]').forEach(a=>{
    a.addEventListener('click',(e)=>{
      e.preventDefault();
      const [postId, pathStr] = a.dataset.replyComment.split('|');
      const text = prompt('Write a reply:');
      if(text && text.trim()) addReply(postId, pathStr.split(','), text.trim());
    });
  });
  container.querySelectorAll('[data-save-post]').forEach(a=>{
    a.addEventListener('click',(e)=>{
      e.preventDefault();
      const nowSaved = toggleSave(me().id,'post',a.dataset.savePost);
      if(nowSaved) awardCoins(me().id, 'saveItem');
      toast(nowSaved?'Saved':'Removed from saved', nowSaved?'Post added to your saved items.':'', 'success'); router();
    });
  });
  container.querySelectorAll('[data-share-post]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const post = postById(btn.dataset.sharePost);
      post.shares++;
      awardCoins(me().id, 'shareContent');
      saveDB(); toast('Shared', 'Post shared to your network.', 'success'); router();
    });
  });
  container.querySelectorAll('[data-copy-link]').forEach(a=>{
    a.addEventListener('click',(e)=>{ e.preventDefault(); toast('Link copied', 'Post link copied to clipboard.', 'success'); });
  });
  container.querySelectorAll('[data-delete-post]').forEach(a=>{
    a.addEventListener('click',(e)=>{
      e.preventDefault();
      confirmDialog('Delete post?', 'This action cannot be undone.', ()=>{
        DB.posts = DB.posts.filter(p=>p.id!==a.dataset.deletePost); saveDB(); toast('Post deleted','','success'); router();
      }, 'Delete');
    });
  });
  container.querySelectorAll('[data-hide-post]').forEach(a=>{
    a.addEventListener('click',(e)=>{ e.preventDefault(); toast('Post hidden', 'You will see fewer posts like this.', 'success'); a.closest('.post-card').remove(); });
  });
  container.querySelectorAll('[data-report-post]').forEach(a=>{
    a.addEventListener('click',(e)=>{
      e.preventDefault();
      DB.reports.push({id:uid('rep'), reporterId:me().id, itemType:'post', itemId:a.dataset.reportPost, at:nowISO()});
      saveDB(); toast('Reported', 'Thanks — our team will review this post.', 'success');
    });
  });
  container.querySelectorAll('[data-vote-option]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const postId = el.closest('[data-poll-post]').dataset.pollPost;
      votePoll(postId, parseInt(el.dataset.voteOption));
    });
  });
}

function setReaction(postId, reaction){
  const post = postById(postId);
  const hadReactionBefore = !!post.reactions[me().id];
  if(reaction) post.reactions[me().id] = reaction;
  else delete post.reactions[me().id];
  if(reaction && post.authorId!==me().id && post.authorType!=='company'){
    addNotification(post.authorId, 'post_reaction', `${me().name} reacted to your post`, postId);
  }
  if(reaction && !hadReactionBefore) awardCoins(me().id, 'reactToPost');
  saveDB(); router();
}
function addComment(postId, text){
  const post = postById(postId);
  post.comments.push({id:uid('cm'), authorId:me().id, text, timestamp:nowISO(), likes:[], replies:[]});
  if(post.authorId!==me().id && post.authorType!=='company'){
    addNotification(post.authorId, 'post_comment', `${me().name} commented on your post`, postId);
  }
  awardCoins(me().id, 'addComment');
  saveDB(); router();
}
function addReply(postId, path, text){
  const post = postById(postId);
  const node = findCommentNode(post, path);
  if(!node) return;
  node.replies = node.replies || [];
  node.replies.push({id:uid('cm'), authorId:me().id, text, timestamp:nowISO(), likes:[], replies:[]});
  if(node.authorId!==me().id) addNotification(node.authorId, 'post_comment', `${me().name} replied to your comment`, postId);
  saveDB(); router();
}
function toggleCommentLike(postId, path){
  const post = postById(postId);
  const node = findCommentNode(post, path);
  if(!node) return;
  node.likes = node.likes || [];
  if(node.likes.includes(me().id)) node.likes = node.likes.filter(id=>id!==me().id);
  else node.likes.push(me().id);
  saveDB(); router();
}
function votePoll(postId, optionIndex){
  const post = postById(postId);
  if(post.votedBy.includes(me().id)) return;
  post.poll.options[optionIndex].votes++;
  post.votedBy.push(me().id);
  saveDB(); router();
}

function messageUser(otherId){
  const other = userById(otherId);
  const myId = me().id;
  if(!checkPrivacy(other, myId, 'whoCanMessage')){
    toast('Messages restricted', `${other.name} limits who can message them.`, 'error');
    return;
  }
  if(isBlocked(otherId, myId) || isBlocked(myId, otherId)){
    toast('Unavailable', 'You cannot message this user.', 'error');
    return;
  }
  const c = findOrCreateDM(myId, otherId);
  location.hash = '#/messages/'+c.id;
}

function handleConnectClick(otherId, btn){
  const myId = me().id;
  const st = connectionStatus(myId, otherId);
  if(st==='none'){
    const other = userById(otherId);
    if(!checkPrivacy(other, myId, 'whoCanConnect')){
      toast('Requests restricted', `${other.name} limits who can send connection requests.`, 'error');
      return;
    }
    sendConnectionRequest(myId, otherId); toast('Request sent', `Connection request sent to ${other.name}.`, 'success');
  }
  else if(st==='pending_sent'){ withdrawConnectionRequest(myId, otherId); toast('Request withdrawn','','info'); }
  else if(st==='pending_received'){ location.hash = '#/network'; return; }
  else if(st==='connected'){ confirmDialog('Remove connection?', `Remove ${userById(otherId).name} from your connections?`, ()=>{ removeConnection(myId, otherId); toast('Connection removed','','info'); router(); }, 'Remove'); return; }
  router();
}

function wireFollowButtons(container){
  container.querySelectorAll('[data-follow-btn]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const [type, id] = btn.dataset.followBtn.split('|');
      if(type==='user'){
        const target = userById(id);
        if(!isFollowing(me().id,'user',id) && !checkPrivacy(target, me().id, 'whoCanFollow')){
          toast('Follow restricted', `${target.name} limits who can follow them.`, 'error');
          return;
        }
      }
      const nowFollowing = toggleFollow(me().id, type, id);
      toast(nowFollowing?'Following':'Unfollowed', '', 'success');
      router();
    });
  });
}

// ==========================================================================
// CREATE POST / STATUS / ARTICLE / EVENT / GROUP / JOB MODALS
// ==========================================================================
function openCreatePostModal(startMode){
  let mode = startMode || 'text';
  let pollOptions = ['',''];
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Create post</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="d-flex align-items-center gap-2 mb-2">
        <img src="${me().avatar}" style="width:38px;height:38px;border-radius:50%;object-fit:cover">
        <div>
          <div class="fw-bold small">${escapeHtml(me().name)}</div>
          <select class="form-select form-select-sm" id="postPrivacy" style="width:auto">
            <option>Everyone</option><option>Connections</option><option>Followers</option><option>Only me</option>
          </select>
        </div>
      </div>
      <textarea class="form-control" id="postText" rows="4" placeholder="Share an update, insight, or achievement… Use #hashtags and @mentions"></textarea>
      <div id="postImageWrap" class="${mode==='image'?'':'d-none'} mt-2">
        <input type="file" accept="image/*" class="form-control form-control-sm" id="postImageInput">
        <img id="postImagePreview" class="img-fluid rounded mt-2 d-none" style="max-height:220px">
      </div>
      <div id="postPollWrap" class="${mode==='poll'?'':'d-none'} mt-2">
        <input type="text" class="form-control form-control-sm mb-2" id="pollQuestion" placeholder="Ask a question…">
        <div id="pollOptionsWrap"></div>
        <button class="btn btn-sm btn-outline-brand mt-1" id="addPollOptionBtn"><i class="bi bi-plus"></i> Add option</button>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-sm btn-outline-brand" data-set-mode="text"><i class="bi bi-card-text"></i> Text</button>
        <button class="btn btn-sm btn-outline-brand" data-set-mode="image"><i class="bi bi-image"></i> Photo</button>
        <button class="btn btn-sm btn-outline-brand" data-set-mode="poll"><i class="bi bi-bar-chart"></i> Poll</button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-brand" id="saveDraftBtn">Save draft</button>
      <button class="btn btn-brand" id="publishPostBtn">Publish</button>
    </div>
  `, 'modal-lg');

  let uploadedImage = null;
  function renderPollOptions(){
    el.querySelector('#pollOptionsWrap').innerHTML = pollOptions.map((v,i)=>`
      <input type="text" class="form-control form-control-sm mb-2" data-poll-opt="${i}" value="${escapeHtml(v)}" placeholder="Option ${i+1}">
    `).join('');
    el.querySelectorAll('[data-poll-opt]').forEach(inp=>{
      inp.addEventListener('input', ()=> pollOptions[inp.dataset.pollOpt]=inp.value);
    });
  }
  renderPollOptions();
  el.querySelector('#addPollOptionBtn').addEventListener('click', ()=>{ if(pollOptions.length<5){ pollOptions.push(''); renderPollOptions(); } });
  el.querySelectorAll('[data-set-mode]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      mode = btn.dataset.setMode;
      el.querySelector('#postImageWrap').classList.toggle('d-none', mode!=='image');
      el.querySelector('#postPollWrap').classList.toggle('d-none', mode!=='poll');
    });
  });
  el.querySelector('#postImageInput')?.addEventListener('change', (e)=>{
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{ uploadedImage = reader.result; const img = el.querySelector('#postImagePreview'); img.src = uploadedImage; img.classList.remove('d-none'); };
    reader.readAsDataURL(file);
  });
  el.querySelector('#saveDraftBtn').addEventListener('click', ()=>{
    DB.drafts.push({id:uid('draft'), authorId:me().id, text:el.querySelector('#postText').value, at:nowISO()});
    saveDB(); toast('Draft saved','','success'); modal.hide();
  });
  el.querySelector('#publishPostBtn').addEventListener('click', ()=>{
    const text = el.querySelector('#postText').value.trim();
    if(!text && mode!=='image'){ toast('Add some text', 'Write something before publishing.', 'error'); return; }
    const post = {
      id:uid('post'), authorId:me().id, authorType:'user', text, media: mode==='image'?(uploadedImage||coverFor('userpost'+Date.now())):null,
      type:mode, privacy: el.querySelector('#postPrivacy').value, timestamp:nowISO(), reactions:{}, comments:[], shares:0,
      poll: mode==='poll' ? {question: el.querySelector('#pollQuestion').value.trim()||'Untitled poll', options: pollOptions.filter(o=>o.trim()).map(o=>({text:o,votes:0})), closesAt:null} : null,
      votedBy:[]
    };
    if(mode==='poll' && post.poll.options.length<2){ toast('Add options', 'A poll needs at least two options.', 'error'); return; }
    const isFirstPostEver = !DB.posts.some(p=>p.authorId===me().id && p.authorType!=='company');
    DB.posts.unshift(post);
    const tx = isFirstPostEver ? awardCoins(me().id, 'firstPost') : awardCoins(me().id, 'createPost');
    saveDB(); toast('Post published', tx?`+${tx.amount} LinkCoins earned!`:'Your post is now live.', 'success'); modal.hide(); router();
  });
}

function openCreateArticleModal(){
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Write an article</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <input type="text" class="form-control mb-2" id="artTitle" placeholder="Article title" maxlength="120">
      <input type="text" class="form-control mb-2" id="artTags" placeholder="Tags, comma separated (e.g. Technology, Career)">
      <textarea class="form-control" id="artContent" rows="8" placeholder="Write your article…"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-brand" id="artDraftBtn">Save draft</button>
      <button class="btn btn-brand" id="artPublishBtn">Publish article</button>
    </div>
  `, 'modal-lg');
  function collect(){
    return {
      title: el.querySelector('#artTitle').value.trim(),
      tags: el.querySelector('#artTags').value.split(',').map(t=>t.trim()).filter(Boolean),
      content: el.querySelector('#artContent').value.trim(),
    };
  }
  el.querySelector('#artDraftBtn').addEventListener('click', ()=>{
    const d = collect();
    DB.drafts.push({id:uid('draft'), authorId:me().id, ...d, at:nowISO(), kind:'article'});
    saveDB(); toast('Draft saved','','success'); modal.hide();
  });
  el.querySelector('#artPublishBtn').addEventListener('click', ()=>{
    const d = collect();
    if(!d.title || !d.content){ toast('Missing info', 'Add a title and some content.', 'error'); return; }
    const newArticle = {id:uid('art'), authorId:me().id, title:d.title, cover:coverFor(d.title+Date.now()), content:d.content, tags:d.tags, timestamp:nowISO(), likes:[], comments:[], saves:[]};
    DB.articles.unshift(newArticle);
    const tx = awardCoins(me().id, 'publishArticle');
    saveDB(); toast('Article published', tx?`+${tx.amount} LinkCoins earned!`:'', 'success'); modal.hide(); location.hash='#/articles/'+newArticle.id;
  });
}

function openCreateStatusModal(){
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Create status</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="btn-group w-100 mb-3">
        <button class="btn btn-outline-brand active" data-status-type="text">Text</button>
        <button class="btn btn-outline-brand" data-status-type="image">Photo</button>
      </div>
      <textarea class="form-control mb-2" id="statusText" rows="3" placeholder="What's happening?"></textarea>
      <input type="file" accept="image/*" class="form-control form-control-sm d-none" id="statusImageInput">
      <img id="statusImagePreview" class="img-fluid rounded mt-2 d-none" style="max-height:200px">
      <input type="text" class="form-control form-control-sm mt-2" id="statusCaption" placeholder="Add a caption (optional)">
      <select class="form-select form-select-sm mt-2" id="statusPrivacy">
        <option>Everyone</option><option>Contacts</option><option>Selected contacts</option>
      </select>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="postStatusBtn">Share to status</button></div>
  `);
  let type='text', img=null;
  el.querySelectorAll('[data-status-type]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      el.querySelectorAll('[data-status-type]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); type = btn.dataset.statusType;
      el.querySelector('#statusImageInput').classList.toggle('d-none', type!=='image');
    });
  });
  el.querySelector('#statusImageInput').addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{ img=r.result; const p = el.querySelector('#statusImagePreview'); p.src=img; p.classList.remove('d-none'); };
    r.readAsDataURL(f);
  });
  el.querySelector('#postStatusBtn').addEventListener('click', ()=>{
    const text = el.querySelector('#statusText').value.trim();
    DB.statuses.push({
      id:uid('st'), userId:me().id, type, content: type==='image' ? (img||coverFor('mystatus'+Date.now())) : null,
      caption: type==='image' ? el.querySelector('#statusCaption').value.trim() : text,
      timestamp:nowISO(), expiresAt:new Date(Date.now()+24*3600*1000).toISOString(), viewers:[], reactions:{},
      privacy: el.querySelector('#statusPrivacy').value
    });
    saveDB(); toast('Status shared', 'Visible to your network for 24 hours.', 'success'); modal.hide(); router();
  });
}

function openStatusViewer(userId){
  const statuses = activeStatuses().filter(s=>s.userId===userId);
  if(!statuses.length) return;
  const u = userById(userId);
  let idx = 0;
  function render(){
    const s = statuses[idx];
    if(!s.viewers.includes(me().id)) s.viewers.push(me().id), saveDB();
    body.innerHTML = `
      <div class="d-flex align-items-center gap-2 mb-2">
        <img src="${u.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">
        <div><div class="fw-bold small text-white">${escapeHtml(u.name)}</div><div class="text-white-50" style="font-size:.72rem">${timeAgo(s.timestamp)}</div></div>
      </div>
      <div style="min-height:280px; display:flex; align-items:center; justify-content:center; background:#11151c; border-radius:12px; padding:1rem;">
        ${s.type==='image' ? `<img src="${s.content}" style="max-width:100%; max-height:340px; border-radius:8px">` : `<div class="text-white fs-4 text-center px-3">${escapeHtml(s.caption||'')}</div>`}
      </div>
      ${s.type==='image' && s.caption ? `<div class="text-white text-center mt-2">${escapeHtml(s.caption)}</div>`:''}
      <div class="d-flex justify-content-center gap-2 mt-3">
        ${Object.entries(REACTIONS).map(([k,e])=>`<button class="btn btn-sm" data-status-react="${k}" style="font-size:1.1rem">${e}</button>`).join('')}
      </div>
    `;
    body.querySelectorAll('[data-status-react]').forEach(b=>{
      b.addEventListener('click', ()=>{ s.reactions[me().id]=b.dataset.statusReact; saveDB(); toast('Reacted','','success'); });
    });
  }
  const {el, modal} = openModalHtml(`
    <div class="modal-header border-0"><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
    <div class="modal-body" id="statusViewerBody" style="background:#1a1f29"></div>
    <div class="modal-footer border-0 justify-content-between">
      <button class="btn btn-sm btn-outline-light" id="statusPrevBtn"><i class="bi bi-chevron-left"></i> Prev</button>
      <button class="btn btn-sm btn-outline-light" id="statusNextBtn">Next <i class="bi bi-chevron-right"></i></button>
    </div>
  `);
  el.querySelector('.modal-content').style.background = '#1a1f29';
  const body = el.querySelector('#statusViewerBody');
  render();
  el.querySelector('#statusPrevBtn').addEventListener('click', ()=>{ idx = Math.max(0, idx-1); render(); });
  el.querySelector('#statusNextBtn').addEventListener('click', ()=>{ if(idx<statuses.length-1){ idx++; render(); } else modal.hide(); });
}

function openCreateEventModal(){
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Create event</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <input type="text" class="form-control mb-2" id="evName" placeholder="Event name">
      <div class="row g-2 mb-2">
        <div class="col-6"><input type="date" class="form-control" id="evDate"></div>
        <div class="col-6"><input type="time" class="form-control" id="evTime"></div>
      </div>
      <input type="text" class="form-control mb-2" id="evLocation" placeholder="Location or link">
      <textarea class="form-control" id="evDesc" rows="3" placeholder="What's this event about?"></textarea>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="createEventBtn">Create event</button></div>
  `);
  el.querySelector('#createEventBtn').addEventListener('click', ()=>{
    const name = el.querySelector('#evName').value.trim();
    const date = el.querySelector('#evDate').value;
    if(!name || !date){ toast('Missing info', 'Add a name and date.', 'error'); return; }
    DB.events.push({
      id:uid('ev'), name, date, time: el.querySelector('#evTime').value || '00:00',
      location: el.querySelector('#evLocation').value.trim(), desc: el.querySelector('#evDesc').value.trim(),
      organizerId: me().id, attendees:[me().id]
    });
    awardCoins(me().id, 'createEvent');
    saveDB(); toast('Event created','','success'); modal.hide(); location.hash='#/events';
  });
}

function openCreateGroupModal(){
  const contacts = connectionsOf(me().id);
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Create group</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <input type="text" class="form-control mb-2" id="grpName" placeholder="Group name">
      <textarea class="form-control mb-3" id="grpDesc" rows="2" placeholder="Group description"></textarea>
      <p class="small fw-bold mb-1">Add members from your connections</p>
      <div style="max-height:220px; overflow-y:auto" id="grpMemberList">
        ${contacts.length ? contacts.map(u=>`
          <div class="form-check mb-1">
            <input class="form-check-input" type="checkbox" value="${u.id}" id="gm_${u.id}">
            <label class="form-check-label small" for="gm_${u.id}">${escapeHtml(u.name)}</label>
          </div>`).join('') : `<p class="small text-muted-2">Connect with people first to add them to a group.</p>`}
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="createGroupBtn">Create group</button></div>
  `);
  el.querySelector('#createGroupBtn').addEventListener('click', ()=>{
    const name = el.querySelector('#grpName').value.trim();
    if(!name){ toast('Add a name', '', 'error'); return; }
    const members = Array.from(el.querySelectorAll('#grpMemberList input:checked')).map(i=>i.value);
    const conv = {
      id:uid('conv'), type:'group', name, image:coverFor(name+Date.now()), description: el.querySelector('#grpDesc').value.trim(),
      participantIds:[me().id, ...members], adminIds:[me().id], pinned:[], archived:[], createdAt:nowISO(),
      disappearingHours:0, locked:false, lockPin:null
    };
    DB.conversations.push(conv); saveDB();
    toast('Group created', '', 'success'); modal.hide(); location.hash = '#/messages/'+conv.id;
  });
}

function openCreateJobModal(){
  const myCompanies = DB.companies.filter(c=>c.adminIds.includes(me().id));
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Post a job</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      ${myCompanies.length ? `
      <select class="form-select mb-2" id="jobCompanySelect">${myCompanies.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>
      ` : `<p class="small text-muted-2">You need to manage a company page to post jobs. We'll post this under your name as a recruiter instead.</p>`}
      <input type="text" class="form-control mb-2" id="jobTitleInput" placeholder="Job title">
      <div class="row g-2 mb-2">
        <div class="col-6"><input type="text" class="form-control" id="jobLocationInput" placeholder="Location"></div>
        <div class="col-6"><select class="form-select" id="jobWorkTypeInput"><option>Remote</option><option>Hybrid</option><option>On-site</option></select></div>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-6"><select class="form-select" id="jobTypeInput"><option>Full-time</option><option>Part-time</option><option>Internship</option><option>Contract</option></select></div>
        <div class="col-6"><select class="form-select" id="jobLevelInput"><option>Entry level</option><option>Mid level</option><option>Senior level</option></select></div>
      </div>
      <input type="text" class="form-control mb-2" id="jobSalaryInput" placeholder="Salary range (optional)">
      <textarea class="form-control" id="jobDescInput" rows="3" placeholder="Job description"></textarea>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="postJobBtn">Post job</button></div>
  `, 'modal-lg');
  el.querySelector('#postJobBtn').addEventListener('click', ()=>{
    const title = el.querySelector('#jobTitleInput').value.trim();
    if(!title){ toast('Add a title', '', 'error'); return; }
    const companyId = myCompanies.length ? el.querySelector('#jobCompanySelect').value : (myCompanies[0]?.id || DB.companies[0].id);
    DB.jobs.unshift({
      id:uid('job'), companyId, title, location: el.querySelector('#jobLocationInput').value.trim(),
      workType: el.querySelector('#jobWorkTypeInput').value, salary: el.querySelector('#jobSalaryInput').value.trim()||'Not disclosed',
      experience: el.querySelector('#jobLevelInput').value, postedAt:nowISO(), type: el.querySelector('#jobTypeInput').value,
      desc: el.querySelector('#jobDescInput').value.trim(), responsibilities:[], requirements:[], skills:[], benefits:[], postedBy: me().id
    });
    awardCoins(me().id, 'postJob');
    saveDB(); toast('Job posted','','success'); modal.hide(); location.hash='#/jobs';
  });
}

// ==========================================================================
// NETWORK PAGE
// ==========================================================================
function renderNetworkPage(){
  const myId = me().id;
  const received = DB.connectionRequests.filter(r=>r.to===myId && r.status==='pending');
  const sent = DB.connectionRequests.filter(r=>r.from===myId && r.status==='pending');
  const connections = connectionsOf(myId);
  const suggestions = DB.users.filter(u=>u.id!==myId && connectionStatus(myId,u.id)==='none').slice(0,8);

  return `
    <div class="page-header mb-1"><h4 class="page-title">Your network</h4></div>
    ${received.length ? `
      <div class="card-panel">
        <h6>Invitations (${received.length})</h6>
        <div class="grid-cards">
          ${received.map(r=>{ const u = userById(r.from); const mutual = mutualConnections(myId,u.id).length;
            return `<div class="entity-card">
              <div class="d-flex gap-2 align-items-center" data-goto-profile="${u.id}" style="cursor:pointer">
                <img src="${u.avatar}" class="entity-avatar-lg" loading="lazy">
                <div><div class="fw-bold">${escapeHtml(u.name)}</div><div class="text-muted-2 small">${escapeHtml(u.headline)}</div>
                ${mutual?`<div class="text-muted-2" style="font-size:.72rem">${mutual} mutual connection${mutual!==1?'s':''}</div>`:''}</div>
              </div>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-brand btn-sm flex-grow-1" data-accept-req="${r.id}">Accept</button>
                <button class="btn btn-outline-brand btn-sm flex-grow-1" data-decline-req="${r.id}">Decline</button>
              </div>
            </div>`;}).join('')}
        </div>
      </div>` : ''}
    <div class="card-panel">
      <h6>People you may know</h6>
      <div class="grid-cards">
        ${suggestions.map(u=>`
          <div class="entity-card">
            <div class="d-flex gap-2 align-items-center" data-goto-profile="${u.id}" style="cursor:pointer">
              <img src="${u.avatar}" class="entity-avatar-lg" loading="lazy"><div><div class="fw-bold">${escapeHtml(u.name)}</div><div class="text-muted-2 small">${escapeHtml(u.headline)}</div></div>
            </div>
            <button class="btn btn-outline-brand btn-sm" data-connect-btn="${u.id}">Connect</button>
          </div>`).join('') || emptyState('bi-people','No suggestions right now','Check back soon.')}
      </div>
    </div>
    <div class="card-panel">
      <h6>Sent invitations (${sent.length})</h6>
      ${sent.length ? sent.map(r=>{ const u=userById(r.to); return `
        <div class="entity-card-row mb-2">
          <img src="${u.avatar}" class="entity-avatar-lg" style="width:44px;height:44px" loading="lazy">
          <div class="flex-grow-1"><div class="fw-bold small">${escapeHtml(u.name)}</div><div class="text-muted-2" style="font-size:.76rem">${escapeHtml(u.headline)}</div></div>
          <button class="btn btn-outline-brand btn-sm" data-withdraw-req="${r.from}|${r.to}">Withdraw</button>
        </div>`;}).join('') : `<p class="small text-muted-2 mb-0">No pending sent invitations.</p>`}
    </div>
    <div class="card-panel">
      <h6>Your connections (${connections.length})</h6>
      ${connections.length ? `<div class="grid-cards">${connections.map(u=>`
        <div class="entity-card">
          <div class="d-flex gap-2 align-items-center" data-goto-profile="${u.id}" style="cursor:pointer">
            <img src="${u.avatar}" class="entity-avatar-lg" loading="lazy"><div><div class="fw-bold">${escapeHtml(u.name)}</div><div class="text-muted-2 small">${escapeHtml(u.headline)}</div></div>
          </div>
          <div class="d-flex gap-2"><button class="btn btn-outline-brand btn-sm flex-grow-1" data-msg-user="${u.id}">Message</button></div>
        </div>`).join('')}</div>` : emptyState('bi-person-check','No connections yet','Start connecting with people you know.')}
    </div>
  `;
}
function wireNetworkEvents(container){
  wireCommonNav(container);
  container.querySelectorAll('[data-connect-btn]').forEach(btn=>btn.addEventListener('click',()=>{ sendConnectionRequest(me().id, btn.dataset.connectBtn); toast('Request sent','','success'); router(); }));
  container.querySelectorAll('[data-accept-req]').forEach(btn=>btn.addEventListener('click',()=>{ acceptConnectionRequest(btn.dataset.acceptReq); toast('Connected!','','success'); router(); }));
  container.querySelectorAll('[data-decline-req]').forEach(btn=>btn.addEventListener('click',()=>{ declineConnectionRequest(btn.dataset.declineReq); router(); }));
  container.querySelectorAll('[data-withdraw-req]').forEach(btn=>btn.addEventListener('click',()=>{ const [f,t]=btn.dataset.withdrawReq.split('|'); withdrawConnectionRequest(f,t); router(); }));
  container.querySelectorAll('[data-msg-user]').forEach(btn=>btn.addEventListener('click',()=>{ messageUser(btn.dataset.msgUser); }));
}

// ==========================================================================
// MESSAGING
// ==========================================================================
let activeConvId = null;
let replyingTo = null;
const unlockedConvIds = new Set();
let activeChatFolder = null;

function setFabVisible(visible){
  const fab = document.getElementById('fabBtn');
  const menu = document.getElementById('fabMenu');
  if(!fab) return;
  fab.style.display = visible ? '' : 'none';
  if(!visible) menu.classList.add('d-none');
}

function renderMessagesPage(main, convId){
  activeConvId = convId || activeConvId;
  setFabVisible(!activeConvId);
  ensureUserSettingsDefaults(me());
  const folders = me().settings.chatFolders;
  const convs = conversationsFor(me().id).filter(c=> !activeChatFolder || c.folderId===activeChatFolder);
  const activeConv = activeConvId ? convById(activeConvId) : null;
  const isLockedAndClosed = activeConv && activeConv.locked && !unlockedConvIds.has(activeConv.id);
  main.innerHTML = `
    <div class="chat-wrap ${activeConvId?'show-thread':''}" id="chatWrap">
      <div class="chat-list-col">
        <div class="chat-list-search">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="mb-0">Messages</h5>
            <button class="btn btn-sm btn-outline-brand" id="newGroupBtn" aria-label="Create group"><i class="bi bi-people-fill"></i></button>
          </div>
          <input type="text" class="form-control form-control-sm mb-2" id="chatSearchInput" placeholder="Search conversations…">
          ${folders.length ? `<div class="chat-folder-tabs">
            <button class="${!activeChatFolder?'active':''}" data-chat-folder="">All</button>
            ${folders.map(f=>`<button class="${activeChatFolder===f.id?'active':''}" data-chat-folder="${f.id}">${escapeHtml(f.name)}</button>`).join('')}
          </div>` : ''}
        </div>
        <div class="chat-list-items" id="chatListItems">
          ${convs.length ? convs.map(c=>renderChatListItem(c)).join('') : emptyState('bi-chat-dots', activeChatFolder?'No chats in this folder':'No conversations yet', activeChatFolder?'Add a conversation to this folder from its menu.':'Message a connection to get started.')}
        </div>
      </div>
      <div class="chat-main-col" id="chatMainCol">
        ${!activeConvId ? `<div class="chat-empty"><i class="bi bi-chat-square-text" style="font-size:3rem"></i><p>Select a conversation to start chatting</p></div>`
          : isLockedAndClosed ? renderChatLockScreen(activeConv) : renderChatThread(activeConvId)}
      </div>
    </div>
  `;
  wireMessagesEvents(main);
}

function renderChatLockScreen(conv){
  const {name, image} = conversationDisplay(conv, me().id);
  return `
    <div class="chat-header">
      <button class="btn btn-sm d-md-none" id="backToListBtn" aria-label="Back to conversations"><i class="bi bi-arrow-left"></i></button>
      <img src="${image}" alt="${escapeHtml(name)}">
      <div><div class="ch-name">${escapeHtml(name)}</div><div class="ch-status"><i class="bi bi-lock-fill"></i> Locked</div></div>
    </div>
    <div class="chat-empty">
      <i class="bi bi-lock-fill" style="font-size:2.4rem"></i>
      <p>This chat is locked. Enter the PIN to view it.</p>
      <div style="max-width:220px; margin:0 auto;">
        <input type="password" inputmode="numeric" maxlength="4" class="form-control text-center mb-2" id="chatUnlockPinInput" placeholder="4-digit PIN" aria-label="Chat PIN">
        <div class="invalid-feedback d-block d-none" id="chatUnlockError">Incorrect PIN.</div>
        <button class="btn btn-brand w-100" id="chatUnlockBtn">Unlock</button>
      </div>
    </div>
  `;
}

function conversationDisplay(c, myId){
  if(c.type==='group') return {name:c.name, image:c.image};
  const otherId = c.participantIds.find(id=>id!==myId);
  const u = userById(otherId);
  return {name:u?u.name:'Unknown', image:u?u.avatar:'', otherId};
}
function renderChatListItem(c){
  const {name, image} = conversationDisplay(c, me().id);
  const lm = lastMessage(c.id);
  const unread = unreadInConv(c.id, me().id);
  const isLocked = c.locked && !unlockedConvIds.has(c.id);
  return `
    <div class="chat-list-item ${c.id===activeConvId?'active':''}" data-open-conv="${c.id}">
      <div class="position-relative"><img src="${image}" alt="${escapeHtml(name)}">${c.type==='dm' && !isLocked?'<span class=\"online-dot\"></span>':''}</div>
      <div class="flex-grow-1 min-width-0">
        <div class="clv-top"><span class="clv-name">${escapeHtml(name)} ${c.locked?'<i class="bi bi-lock-fill text-muted-2" style="font-size:.7rem"></i>':''}</span><span class="clv-time">${lm && !isLocked?timeAgo(lm.timestamp):''}</span></div>
        <div class="d-flex justify-content-between align-items-center">
          <span class="clv-preview">${isLocked ? 'Locked chat' : (lm ? (lm.senderId===me().id?'You: ':'')+escapeHtml(lm.text||'📎 Attachment') : 'Say hello 👋')}</span>
          ${unread && !isLocked?`<span class="badge-count">${unread}</span>`:''}
        </div>
      </div>
    </div>`;
}

function renderChatThread(convId){
  const c = convById(convId);
  if(!c) return `<div class="chat-empty"><p>Conversation not found</p></div>`;
  const {name, image, otherId} = conversationDisplay(c, me().id);
  const msgs = messagesFor(convId);
  msgs.forEach(m=>{ if(!m.readBy.includes(me().id)) m.readBy.push(me().id); });
  saveDB();
  const pinned = msgs.filter(m=>m.pinned && !m.deleted);
  const disappearingLabel = {0:'Off', 24:'24 hours', 168:'7 days', 2160:'90 days'}[c.disappearingHours||0];
  return `
    <div class="chat-header">
      <button class="btn btn-sm d-md-none" id="backToListBtn" aria-label="Back to conversations"><i class="bi bi-arrow-left"></i></button>
      <img src="${image}" alt="${escapeHtml(name)}" ${otherId?`data-goto-profile="${otherId}"`:''} style="cursor:pointer">
      <div>
        <div class="ch-name" ${otherId?`data-goto-profile="${otherId}"`:''} style="cursor:pointer">${escapeHtml(name)} ${c.locked?'<i class="bi bi-lock-fill" style="font-size:.7rem"></i>':''}</div>
        <div class="ch-status">${c.type==='group' ? `${pluralize(c.participantIds.length,'member')}` : 'Online'}${c.disappearingHours?` · <i class="bi bi-hourglass-split"></i> Disappearing: ${disappearingLabel}`:''}</div>
      </div>
      <div class="chat-header-actions">
        ${otherId?`<button class="topbar-icon-btn" data-call="${otherId}|audio" title="Audio call" aria-label="Start audio call"><i class="bi bi-telephone"></i></button>
        <button class="topbar-icon-btn" data-call="${otherId}|video" title="Video call" aria-label="Start video call"><i class="bi bi-camera-video"></i></button>`:''}
        <div class="dropdown">
          <button class="topbar-icon-btn" data-bs-toggle="dropdown" aria-label="More options"><i class="bi bi-three-dots-vertical"></i></button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="#" data-view-starred="${c.id}">Starred messages</a></li>
            ${me().settings.chatFolders.length ? `
            <li><h6 class="dropdown-header">Add to folder</h6></li>
            <li><a class="dropdown-item ${!c.folderId?'fw-bold':''}" href="#" data-set-folder="${c.id}|">None</a></li>
            ${me().settings.chatFolders.map(f=>`<li><a class="dropdown-item ${c.folderId===f.id?'fw-bold':''}" href="#" data-set-folder="${c.id}|${f.id}">${escapeHtml(f.name)}</a></li>`).join('')}
            ` : ''}
            <li><h6 class="dropdown-header">Disappearing messages</h6></li>
            <li><a class="dropdown-item ${!c.disappearingHours?'fw-bold':''}" href="#" data-set-disappearing="${c.id}|0">Off</a></li>
            <li><a class="dropdown-item ${c.disappearingHours===24?'fw-bold':''}" href="#" data-set-disappearing="${c.id}|24">24 hours</a></li>
            <li><a class="dropdown-item ${c.disappearingHours===168?'fw-bold':''}" href="#" data-set-disappearing="${c.id}|168">7 days</a></li>
            <li><a class="dropdown-item ${c.disappearingHours===2160?'fw-bold':''}" href="#" data-set-disappearing="${c.id}|2160">90 days</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#" data-toggle-lock="${c.id}">${c.locked?'Remove chat lock':'Lock chat'}</a></li>
            ${c.type==='group'?`<li><a class="dropdown-item" href="#" data-view-group-info="${c.id}">Group info</a></li><li><a class="dropdown-item text-danger" href="#" data-leave-group="${c.id}">Leave group</a></li>`:
            `<li><a class="dropdown-item" href="#" data-block-user="${otherId}">Block user</a></li><li><a class="dropdown-item text-danger" href="#" data-report-user="${otherId}">Report user</a></li>`}
          </ul>
        </div>
      </div>
    </div>
    ${pinned.length ? `<div class="d-flex align-items-center gap-2 px-3 py-2" style="background:var(--surface-sunken); border-bottom:1px solid var(--border-color); font-size:.8rem;">
      <i class="bi bi-pin-angle-fill text-accent"></i>
      <span class="flex-grow-1 text-truncate">${escapeHtml(pinned[pinned.length-1].text||'')}</span>
      <span class="text-muted-2">${pinned.length>1?`+${pinned.length-1} more`:''}</span>
    </div>` : ''}
    <div class="chat-messages" id="chatMessages">
      ${msgs.length ? msgs.map(m=>renderMessageBubble(m,c)).join('') : `<div class="chat-empty"><p>No messages yet — say hello 👋</p></div>`}
    </div>
    <div id="replyPreviewWrap"></div>
    <div class="chat-composer">
      <button id="emojiBtn" aria-label="Insert emoji"><i class="bi bi-emoji-smile"></i></button>
      <div class="dropdown">
        <button id="attachBtn" data-bs-toggle="dropdown" aria-label="Attach"><i class="bi bi-paperclip"></i></button>
        <ul class="dropdown-menu">
          <li><a class="dropdown-item" href="#" id="attachPhotoBtn"><i class="bi bi-image me-2"></i>Photo</a></li>
          <li><a class="dropdown-item" href="#" id="attachDocBtn"><i class="bi bi-file-earmark me-2"></i>Document</a></li>
          <li><a class="dropdown-item" href="#" id="attachLocationBtn"><i class="bi bi-geo-alt me-2"></i>Location</a></li>
          <li><a class="dropdown-item" href="#" id="attachContactBtn"><i class="bi bi-person-vcard me-2"></i>Contact</a></li>
          <li><a class="dropdown-item" href="#" id="attachGifBtn"><i class="bi bi-filetype-gif me-2"></i>GIF</a></li>
        </ul>
      </div>
      <button id="stickerBtn" aria-label="Send sticker"><i class="bi bi-emoji-laughing"></i></button>
      <input type="text" id="messageInput" placeholder="Type a message…" autocomplete="off" aria-label="Message text">
      <button id="voiceMsgBtn" aria-label="Record voice message"><i class="bi bi-mic"></i></button>
      <button class="send-btn" id="sendMsgBtn" aria-label="Send message"><i class="bi bi-send-fill"></i></button>
    </div>
  `;
}

function renderMessageBubble(m, conv){
  const mine = m.senderId===me().id;
  const sender = userById(m.senderId);
  const replySrc = m.replyTo ? DB.messages.find(x=>x.id===m.replyTo) : null;
  const reactionEntries = Object.values(m.reactions||{});
  return `
    <div class="msg-row ${mine?'mine':''}" data-msg-id="${m.id}">
      <div class="msg-bubble" data-msg-bubble="${m.id}">
        ${conv.type==='group' && !mine ? `<div class="fw-bold" style="font-size:.72rem; opacity:.8">${escapeHtml(sender?.name||'')}</div>`:''}
        ${replySrc ? `<div class="msg-reply-preview">${escapeHtml((replySrc.text||'').slice(0,60))}</div>`:''}
        ${m.deleted ? `<em class="text-muted-2">Message deleted</em>` : renderMessageContent(m)}
        <span class="msg-time">${m.edited?'edited · ':''}${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        ${reactionEntries.length ? `<span class="msg-reactions">${reactionEntries.map(r=>REACTIONS[r]).join('')}</span>` : ''}
      </div>
    </div>`;
}

function renderMessageContent(m){
  if(m.type==='location'){
    return `<div class="msg-location"><i class="bi bi-geo-alt-fill text-accent"></i> <span>${escapeHtml(m.text)}</span>
      <div class="msg-location-map"><i class="bi bi-pin-map"></i> Simulated location share</div></div>`;
  }
  if(m.type==='contact'){
    const contact = userById(m.contactId);
    return `<div class="msg-contact-card" ${contact?`data-goto-profile="${contact.id}"`:''} style="cursor:pointer">
      <img src="${contact?.avatar||''}" alt=""><div><div class="fw-bold" style="font-size:.85rem">${escapeHtml(m.text)}</div><div class="text-muted-2" style="font-size:.72rem">Contact card</div></div>
    </div>`;
  }
  if(m.type==='sticker'){
    return `<div style="font-size:2.4rem; line-height:1">${m.text}</div>`;
  }
  if(m.type==='gif'){
    return `<div class="msg-gif"><img src="${m.mediaUrl}" alt="GIF" style="max-width:180px; border-radius:8px;"><span class="badge bg-secondary" style="position:absolute; margin-top:-22px; margin-left:6px; font-size:.6rem;">GIF</span></div>`;
  }
  if(m.type==='image'){
    return `<div>${m.mediaKey ? `<img data-media-key="${m.mediaKey}" class="msg-image-lazy" alt="${escapeHtml(m.text)}" style="max-width:220px;border-radius:8px;display:block;margin-bottom:.25rem;">` : ''}<span class="small">${escapeHtml(m.text)}</span></div>`;
  }
  if(m.type==='document'){
    return `<div class="d-flex align-items-center gap-2"><i class="bi bi-file-earmark-text fs-4"></i><span class="small">${escapeHtml(m.text)}</span></div>`;
  }
  if(m.type==='voice'){
    return `<div class="d-flex align-items-center gap-2"><i class="bi bi-play-circle-fill fs-5"></i><span class="small">${escapeHtml(m.text)}</span></div>`;
  }
  return linkify(m.text);
}

function wireMessagesEvents(main){
  wireCommonNav(main);
  main.querySelectorAll('[data-open-conv]').forEach(el=>el.addEventListener('click',()=> location.hash = '#/messages/'+el.dataset.openConv));
  main.querySelectorAll('[data-chat-folder]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      activeChatFolder = btn.dataset.chatFolder || null;
      renderMessagesPage(main, activeConvId);
    });
  });
  main.querySelector('#chatSearchInput')?.addEventListener('input', debounce((e)=>{
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#chatListItems .chat-list-item').forEach(item=>{
      item.style.display = item.querySelector('.clv-name').textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  },150));
  main.querySelector('#newGroupBtn')?.addEventListener('click', openCreateGroupModal);
  main.querySelector('#backToListBtn')?.addEventListener('click', ()=>{ document.getElementById('chatWrap').classList.remove('show-thread'); });

  main.querySelector('#chatUnlockBtn')?.addEventListener('click', ()=>{
    const conv = convById(activeConvId);
    const entered = main.querySelector('#chatUnlockPinInput').value.trim();
    if(entered && entered === conv.lockPin){
      unlockedConvIds.add(conv.id);
      renderMessagesPage(document.getElementById('mainContent'), activeConvId);
    }else{
      main.querySelector('#chatUnlockError').classList.remove('d-none');
    }
  });
  main.querySelector('#chatUnlockPinInput')?.addEventListener('keydown', (e)=>{
    if(e.key==='Enter') main.querySelector('#chatUnlockBtn')?.click();
  });

  main.querySelectorAll('[data-set-disappearing]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const [convId, hours] = a.dataset.setDisappearing.split('|');
      const conv = convById(convId);
      conv.disappearingHours = parseInt(hours);
      saveDB();
      toast(conv.disappearingHours ? 'Disappearing messages enabled' : 'Disappearing messages turned off', '', 'success');
      renderMessagesPage(document.getElementById('mainContent'), activeConvId);
    });
  });
  main.querySelectorAll('[data-set-folder]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const [convId, folderId] = a.dataset.setFolder.split('|');
      const conv = convById(convId);
      if(folderId) conv.folderId = folderId; else delete conv.folderId;
      saveDB();
      toast(folderId ? 'Added to folder' : 'Removed from folder', '', 'success');
      renderMessagesPage(document.getElementById('mainContent'), activeConvId);
    });
  });
  main.querySelectorAll('[data-toggle-lock]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const conv = convById(a.dataset.toggleLock);
      if(conv.locked){
        confirmDialog('Remove chat lock?', 'This chat will no longer require a PIN to open.', ()=>{
          conv.locked = false; conv.lockPin = null; unlockedConvIds.add(conv.id); saveDB();
          toast('Chat lock removed','','success');
          renderMessagesPage(document.getElementById('mainContent'), activeConvId);
        }, 'Remove lock');
      }else{
        openSetChatLockPinModal((pin)=>{
          conv.locked = true; conv.lockPin = pin; unlockedConvIds.add(conv.id); saveDB();
          toast('Chat locked', 'This chat now requires a PIN to open.', 'success');
          renderMessagesPage(document.getElementById('mainContent'), activeConvId);
        });
      }
    });
  });

  const msgInput = main.querySelector('#messageInput');
  const sendBtn = main.querySelector('#sendMsgBtn');
  function doSend(){
    if(!msgInput || !msgInput.value.trim()) return;
    if(msgInput.dataset.editingId){
      const m = DB.messages.find(x=>x.id===msgInput.dataset.editingId);
      if(m){ m.text = msgInput.value.trim(); m.edited = true; saveDB(); toast('Message updated','','success'); }
      delete msgInput.dataset.editingId;
      msgInput.value='';
      renderMessagesPage(document.getElementById('mainContent'), activeConvId);
      scrollChatBottom();
      return;
    }
    const c = convById(activeConvId);
    const msg = sendMessage(activeConvId, me().id, msgInput.value.trim(), {replyTo: replyingTo});
    if(c.type==='dm'){
      const otherId = c.participantIds.find(id=>id!==me().id);
      addNotification(otherId, 'message', `${me().name} sent you a message`, activeConvId);
    }
    replyingTo = null;
    msgInput.value='';
    renderMessagesPage(document.getElementById('mainContent'), activeConvId);
    scrollChatBottom();
  }
  sendBtn?.addEventListener('click', doSend);
  msgInput?.addEventListener('keydown', e=>{ if(e.key==='Enter') doSend(); });
  main.querySelector('#voiceMsgBtn')?.addEventListener('click', openVoiceMessageRecorder);
  main.querySelector('#emojiBtn')?.addEventListener('click', ()=>{
    const emojis = ['😀','😂','❤️','👍','🎉','🙌','🔥','😊','🤔','👏'];
    const bar = document.createElement('div');
    bar.className='reaction-bar';
    bar.innerHTML = emojis.map(e=>`<button data-emoji="${e}">${e}</button>`).join('');
    document.body.appendChild(bar);
    const rect = main.querySelector('#emojiBtn').getBoundingClientRect();
    bar.style.top=(rect.top+window.scrollY-46)+'px'; bar.style.left=(rect.left+window.scrollX)+'px';
    bar.querySelectorAll('[data-emoji]').forEach(b=>b.addEventListener('click',()=>{ msgInput.value += b.dataset.emoji; bar.remove(); msgInput.focus(); }));
    setTimeout(()=>document.addEventListener('click', function cl(ev){ if(!bar.contains(ev.target)){bar.remove(); document.removeEventListener('click',cl);} }),0);
  });
  main.querySelector('#attachPhotoBtn')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange = async ()=>{
      const f = inp.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = async ()=>{
        const mediaKey = uid('media');
        await idbSet(mediaKey, r.result);
        sendMessage(activeConvId, me().id, f.name, {type:'image', mediaKey});
        toast('Photo sent', f.name, 'success');
        renderMessagesPage(document.getElementById('mainContent'), activeConvId);
      };
      r.readAsDataURL(f);
    };
    inp.click();
  });
  main.querySelector('#attachDocBtn')?.addEventListener('click', (e)=>{
    e.preventDefault();
    const inp = document.createElement('input'); inp.type='file'; inp.accept='.pdf,.doc,.docx,.txt,application/pdf';
    inp.onchange = ()=>{
      const f = inp.files[0]; if(!f) return;
      sendMessage(activeConvId, me().id, f.name, {type:'document'});
      toast('Document sent', f.name, 'success');
      renderMessagesPage(document.getElementById('mainContent'), activeConvId);
    };
    inp.click();
  });
  main.querySelector('#attachLocationBtn')?.addEventListener('click', (e)=>{
    e.preventDefault();
    const lat = (Math.random()*0.6+6.4).toFixed(4), lng = (Math.random()*0.6+3.1).toFixed(4);
    sendMessage(activeConvId, me().id, `Shared location · ${lat}, ${lng}`, {type:'location'});
    toast('Location shared', 'Simulated — no real GPS data is used.', 'success');
    renderMessagesPage(document.getElementById('mainContent'), activeConvId);
  });
  main.querySelector('#attachContactBtn')?.addEventListener('click', (e)=>{
    e.preventDefault();
    const contacts = connectionsOf(me().id);
    if(!contacts.length){ toast('No contacts yet', 'Connect with people to share their contact card.', 'info'); return; }
    const {el, modal} = openModalHtml(`
      <div class="modal-header"><h5 class="modal-title">Share a contact</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body" style="max-height:320px; overflow-y:auto">
        ${contacts.map(u=>`<div class="entity-card-row mb-2" data-pick-contact="${u.id}" style="cursor:pointer">
          <img src="${u.avatar}" class="entity-avatar-lg" style="width:38px;height:38px">
          <div class="flex-grow-1 fw-bold small">${escapeHtml(u.name)}</div>
        </div>`).join('')}
      </div>
    `);
    el.querySelectorAll('[data-pick-contact]').forEach(row=>{
      row.addEventListener('click', ()=>{
        const contact = userById(row.dataset.pickContact);
        sendMessage(activeConvId, me().id, contact.name, {type:'contact', contactId:contact.id});
        modal.hide(); toast('Contact shared','','success');
        renderMessagesPage(document.getElementById('mainContent'), activeConvId);
      });
    });
  });
  main.querySelector('#attachGifBtn')?.addEventListener('click', (e)=>{
    e.preventDefault();
    const gifs = [coverFor('gif1'+Date.now()), coverFor('gif2'+Date.now()), coverFor('gif3'+Date.now()), coverFor('gif4'+Date.now())];
    const {el, modal} = openModalHtml(`
      <div class="modal-header"><h5 class="modal-title">Send a GIF</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body"><p class="small text-muted-2">Simulated GIF picker — these are placeholder images, not a real GIF library.</p>
        <div class="row g-2">${gifs.map((g,i)=>`<div class="col-6"><img src="${g}" data-pick-gif="${i}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;cursor:pointer" loading="lazy"></div>`).join('')}</div>
      </div>
    `);
    el.querySelectorAll('[data-pick-gif]').forEach(img=>{
      img.addEventListener('click', ()=>{
        sendMessage(activeConvId, me().id, 'GIF', {type:'gif', mediaUrl: img.src});
        modal.hide(); toast('GIF sent','','success');
        renderMessagesPage(document.getElementById('mainContent'), activeConvId);
      });
    });
  });
  main.querySelector('#stickerBtn')?.addEventListener('click', ()=>{
    const stickers = ['😂','🎉','🔥','👏','🙌','💯','🤝','😍','🥳','😎','👍','❤️'];
    const bar = document.createElement('div');
    bar.className='reaction-bar';
    bar.style.flexWrap='wrap'; bar.style.maxWidth='220px';
    bar.innerHTML = stickers.map(s=>`<button data-pick-sticker="${s}" style="font-size:1.5rem">${s}</button>`).join('');
    document.body.appendChild(bar);
    const rect = main.querySelector('#stickerBtn').getBoundingClientRect();
    bar.style.top=(rect.top+window.scrollY-90)+'px'; bar.style.left=(rect.left+window.scrollX)+'px';
    bar.querySelectorAll('[data-pick-sticker]').forEach(b=>b.addEventListener('click',()=>{
      sendMessage(activeConvId, me().id, b.dataset.pickSticker, {type:'sticker'});
      bar.remove();
      renderMessagesPage(document.getElementById('mainContent'), activeConvId);
    }));
    setTimeout(()=>document.addEventListener('click', function cl(ev){ if(!bar.contains(ev.target)){bar.remove(); document.removeEventListener('click',cl);} }),0);
  });

  main.querySelectorAll('[data-call]').forEach(btn=>btn.addEventListener('click', ()=>{
    const [uid_, kind] = btn.dataset.call.split('|');
    startCall(uid_, kind);
  }));
  main.querySelectorAll('[data-block-user]').forEach(a=>a.addEventListener('click',(e)=>{
    e.preventDefault();
    confirmDialog('Block this user?', 'They will no longer be able to message you or see your posts.', ()=>{
      toggleBlock(me().id, a.dataset.blockUser); toast('User blocked','','success'); location.hash='#/messages';
    }, 'Block');
  }));
  main.querySelectorAll('[data-report-user]').forEach(a=>a.addEventListener('click',(e)=>{
    e.preventDefault();
    DB.reports.push({id:uid('rep'), reporterId:me().id, itemType:'user', itemId:a.dataset.reportUser, at:nowISO()});
    saveDB(); toast('Reported','Thanks for letting us know.','success');
  }));
  main.querySelectorAll('[data-leave-group]').forEach(a=>a.addEventListener('click',(e)=>{
    e.preventDefault();
    confirmDialog('Leave group?', 'You will stop receiving messages from this group.', ()=>{
      const c = convById(a.dataset.leaveGroup);
      c.participantIds = c.participantIds.filter(id=>id!==me().id);
      saveDB(); toast('Left group','','info'); location.hash='#/messages';
    }, 'Leave');
  }));
  main.querySelectorAll('[data-view-group-info]').forEach(a=>a.addEventListener('click',(e)=>{ e.preventDefault(); openGroupInfoModal(a.dataset.viewGroupInfo); }));
  main.querySelectorAll('[data-view-starred]').forEach(a=>a.addEventListener('click',(e)=>{ e.preventDefault(); openStarredMessagesModal(a.dataset.viewStarred); }));

  // long-press to react / reply on message bubbles
  main.querySelectorAll('[data-msg-bubble]').forEach(bubble=>{
    let timer;
    const msgId = bubble.dataset.msgBubble;
    const openMenu = ()=>{
      document.querySelectorAll('.reaction-bar').forEach(b=>b.remove());
      const m = DB.messages.find(x=>x.id===msgId);
      const bar = document.createElement('div');
      bar.className='reaction-bar';
      bar.innerHTML = Object.entries(REACTIONS).slice(0,4).map(([k,e])=>`<button data-msg-react="${k}">${e}</button>`).join('')
        + `<button data-msg-reply="1" title="Reply"><i class="bi bi-reply"></i></button>`
        + `<button data-msg-star="1" title="${m.starred?'Unstar':'Star'}"><i class="bi ${m.starred?'bi-star-fill':'bi-star'}"></i></button>`
        + `<button data-msg-pin="1" title="${m.pinned?'Unpin':'Pin'}"><i class="bi ${m.pinned?'bi-pin-fill':'bi-pin'}"></i></button>`
        + (m.senderId===me().id ? `<button data-msg-edit="1" title="Edit"><i class="bi bi-pencil"></i></button>` : '')
        + `<button data-msg-delete="1" title="Delete"><i class="bi bi-trash"></i></button>`;
      document.body.appendChild(bar);
      const rect = bubble.getBoundingClientRect();
      bar.style.top=(rect.top+window.scrollY-46)+'px'; bar.style.left=(rect.left+window.scrollX)+'px';
      bar.querySelectorAll('[data-msg-react]').forEach(b=>b.addEventListener('click',()=>{
        m.reactions = m.reactions||{}; m.reactions[me().id]=b.dataset.msgReact; saveDB(); bar.remove(); renderMessagesPage(document.getElementById('mainContent'), activeConvId);
      }));
      bar.querySelector('[data-msg-reply]').addEventListener('click',()=>{ replyingTo = msgId; bar.remove(); showReplyPreview(); });
      bar.querySelector('[data-msg-star]').addEventListener('click',()=>{
        m.starred = !m.starred; saveDB(); bar.remove(); toast(m.starred?'Message starred':'Removed from starred','','success');
      });
      bar.querySelector('[data-msg-pin]').addEventListener('click',()=>{
        m.pinned = !m.pinned; saveDB(); bar.remove(); toast(m.pinned?'Message pinned':'Message unpinned','','success');
        renderMessagesPage(document.getElementById('mainContent'), activeConvId);
      });
      bar.querySelector('[data-msg-edit]')?.addEventListener('click',()=>{
        bar.remove();
        const input = document.getElementById('messageInput');
        input.value = m.text;
        input.dataset.editingId = m.id;
        input.focus();
        toast('Editing message', 'Update the text and press send.', 'info');
      });
      bar.querySelector('[data-msg-delete]').addEventListener('click',()=>{
        if(m.senderId===me().id){ m.deleted=true; m.text=''; saveDB(); renderMessagesPage(document.getElementById('mainContent'), activeConvId); } else toast('Cannot delete',"You can only delete your own messages.",'error');
        bar.remove();
      });
      setTimeout(()=>document.addEventListener('click', function cl(ev){ if(!bar.contains(ev.target)){bar.remove(); document.removeEventListener('click',cl);} }),0);
    };
    bubble.addEventListener('mousedown', ()=>{ timer=setTimeout(openMenu,380); });
    bubble.addEventListener('touchstart', ()=>{ timer=setTimeout(openMenu,380); });
    ['mouseup','mouseleave','touchend'].forEach(ev=>bubble.addEventListener(ev,()=>clearTimeout(timer)));
  });

  scrollChatBottom();
  loadLazyMediaImages(main);
}
function showReplyPreview(){
  const wrap = document.getElementById('replyPreviewWrap');
  if(!wrap) return;
  if(!replyingTo){ wrap.innerHTML=''; return; }
  const m = DB.messages.find(x=>x.id===replyingTo);
  wrap.innerHTML = `<div class="d-flex justify-content-between align-items-center px-3 py-1" style="background:var(--surface-sunken); font-size:.8rem;">
    <span>Replying to: ${escapeHtml((m.text||'').slice(0,50))}</span>
    <button class="btn btn-sm btn-link p-0" id="cancelReplyBtn">✕</button>
  </div>`;
  document.getElementById('cancelReplyBtn').addEventListener('click', ()=>{ replyingTo=null; showReplyPreview(); });
}
function loadLazyMediaImages(container){
  (container||document).querySelectorAll('.msg-image-lazy[data-media-key]').forEach(async (img)=>{
    const key = img.dataset.mediaKey;
    if(!key) return;
    try{
      const data = await idbGet(key);
      if(data) img.src = data;
      img.removeAttribute('data-media-key');
    }catch(e){ /* attachment unavailable */ }
  });
}
function scrollChatBottom(){
  const box = document.getElementById('chatMessages');
  if(box) box.scrollTop = box.scrollHeight;
}

function openSetChatLockPinModal(onConfirm){
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Lock this chat</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="small text-muted-2">Set a 4-digit PIN. You'll need it to reopen this chat (simulated locally — not real device security).</p>
      <input type="password" inputmode="numeric" maxlength="4" class="form-control text-center mb-2" id="setPinInput1" placeholder="Enter PIN">
      <input type="password" inputmode="numeric" maxlength="4" class="form-control text-center" id="setPinInput2" placeholder="Confirm PIN">
      <div class="invalid-feedback d-block d-none" id="setPinError">PINs must match and be 4 digits.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="confirmSetPinBtn">Lock chat</button></div>
  `);
  el.querySelector('#confirmSetPinBtn').addEventListener('click', ()=>{
    const p1 = el.querySelector('#setPinInput1').value.trim();
    const p2 = el.querySelector('#setPinInput2').value.trim();
    if(!/^\d{4}$/.test(p1) || p1 !== p2){
      el.querySelector('#setPinError').classList.remove('d-none');
      return;
    }
    modal.hide();
    onConfirm(p1);
  });
}

function openVoiceMessageRecorder(){
  const {el, modal} = openModalHtml(`
    <div class="modal-body text-center py-4">
      <p class="small text-muted-2 mb-3">Simulated voice message — no audio is actually recorded in this prototype.</p>
      <div class="mb-3"><span class="recording-dot"></span><span id="recTimer">00:00</span></div>
      <div class="waveform justify-content-center mb-4" id="waveformEl"></div>
      <div class="d-flex justify-content-center gap-3">
        <button class="btn btn-outline-brand rounded-circle" style="width:52px;height:52px" id="cancelRecBtn"><i class="bi bi-x-lg"></i></button>
        <button class="btn btn-brand rounded-circle" style="width:52px;height:52px" id="sendRecBtn"><i class="bi bi-check-lg"></i></button>
      </div>
    </div>
  `);
  const wf = el.querySelector('#waveformEl');
  for(let i=0;i<24;i++){ const s=document.createElement('span'); s.style.height=(6+Math.random()*18)+'px'; s.style.animationDelay=(i*0.05)+'s'; wf.appendChild(s); }
  let secs=0;
  const timer = setInterval(()=>{ secs++; const m=String(Math.floor(secs/60)).padStart(2,'0'), s=String(secs%60).padStart(2,'0'); el.querySelector('#recTimer').textContent=`${m}:${s}`; },1000);
  el.addEventListener('hidden.bs.modal', ()=>clearInterval(timer));
  el.querySelector('#cancelRecBtn').addEventListener('click', ()=>modal.hide());
  el.querySelector('#sendRecBtn').addEventListener('click', ()=>{
    sendMessage(activeConvId, me().id, `🎤 Voice message (${el.querySelector('#recTimer').textContent})`, {type:'voice'});
    modal.hide(); toast('Voice message sent','','success');
    renderMessagesPage(document.getElementById('mainContent'), activeConvId);
  });
}

function openGroupInfoModal(convId){
  const myId = me().id;
  const { el: modalEl, modal: modalInstance } = openModalHtml(`<div class="modal-body text-center py-4"><div class="spinner-border text-primary"></div></div>`);
  function render(){
    const c = convById(convId);
    if(!c || !c.participantIds.includes(myId)){ modalInstance.hide(); return; }
    const isAdmin = c.adminIds.includes(myId);
    const members = c.participantIds.map(userById).filter(Boolean);
    const nonMembers = connectionsOf(myId).filter(u=>!c.participantIds.includes(u.id));

    modalEl.querySelector('.modal-content').innerHTML = `
      <div class="modal-header"><h5 class="modal-title">Group info</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <div class="text-center mb-3">
          <img src="${c.image}" style="width:80px;height:80px;border-radius:16px;object-fit:cover">
          ${isAdmin ? `<div class="mt-2"><input type="file" accept="image/*" class="form-control form-control-sm" id="grpImageInput"></div>` : ''}
          ${isAdmin ? `
            <input type="text" class="form-control form-control-sm text-center mt-2" id="grpNameEdit" value="${escapeHtml(c.name)}">
            <textarea class="form-control form-control-sm text-center mt-2" id="grpDescEdit" rows="2">${escapeHtml(c.description||'')}</textarea>
            <button class="btn btn-sm btn-outline-brand mt-2" id="grpSaveInfoBtn">Save group info</button>
          ` : `<h5 class="mt-2">${escapeHtml(c.name)}</h5><p class="text-muted-2 small">${escapeHtml(c.description||'')}</p>`}
        </div>
        <p class="fw-bold small">Members (${members.length})</p>
        <div style="max-height:220px; overflow-y:auto">
        ${members.map(u=>`<div class="d-flex align-items-center gap-2 mb-2">
          <img src="${u.avatar}" style="width:34px;height:34px;border-radius:50%;object-fit:cover">
          <div class="flex-grow-1 small">${escapeHtml(u.name)} ${c.adminIds.includes(u.id)?'<span class="badge bg-secondary" style="font-size:.6rem">Admin</span>':''}</div>
          ${isAdmin && u.id!==myId ? `
            <div class="dropdown">
              <button class="btn btn-sm btn-outline-brand" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#" data-toggle-admin="${u.id}">${c.adminIds.includes(u.id)?'Demote from admin':'Promote to admin'}</a></li>
                <li><a class="dropdown-item text-danger" href="#" data-remove-member="${u.id}">Remove from group</a></li>
              </ul>
            </div>` : ''}
        </div>`).join('')}
        </div>
        ${isAdmin ? `
          <hr class="hairline">
          <p class="fw-bold small">Add members</p>
          <div style="max-height:160px; overflow-y:auto">
          ${nonMembers.length ? nonMembers.map(u=>`
            <div class="d-flex align-items-center gap-2 mb-2">
              <img src="${u.avatar}" style="width:30px;height:30px;border-radius:50%;object-fit:cover">
              <div class="flex-grow-1 small">${escapeHtml(u.name)}</div>
              <button class="btn btn-sm btn-outline-brand" data-add-member="${u.id}">Add</button>
            </div>`).join('') : `<p class="small text-muted-2">No more connections to add.</p>`}
          </div>
        ` : ''}
      </div>
      <div class="modal-footer justify-content-between">
        <button class="btn btn-outline-brand text-danger" id="grpLeaveBtn">Leave group</button>
        ${isAdmin ? `<button class="btn btn-outline-brand text-danger" id="grpDeleteBtn">Delete group</button>` : ''}
      </div>
    `;

    modalEl.querySelector('#grpImageInput')?.addEventListener('change', (e)=>{
      const f = e.target.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{ c.image = r.result; saveDB(); render(); toast('Group photo updated','','success'); };
      r.readAsDataURL(f);
    });
    modalEl.querySelector('#grpSaveInfoBtn')?.addEventListener('click', ()=>{
      const name = modalEl.querySelector('#grpNameEdit').value.trim();
      if(!name){ toast('Group name required','','error'); return; }
      c.name = name; c.description = modalEl.querySelector('#grpDescEdit').value.trim();
      saveDB(); toast('Group info updated','','success'); render();
      renderMessagesPage(document.getElementById('mainContent'), activeConvId);
    });
    modalEl.querySelectorAll('[data-toggle-admin]').forEach(a=>a.addEventListener('click',(e)=>{
      e.preventDefault();
      const uid_ = a.dataset.toggleAdmin;
      if(c.adminIds.includes(uid_)) c.adminIds = c.adminIds.filter(id=>id!==uid_);
      else c.adminIds.push(uid_);
      saveDB(); render();
    }));
    modalEl.querySelectorAll('[data-remove-member]').forEach(a=>a.addEventListener('click',(e)=>{
      e.preventDefault();
      const uid_ = a.dataset.removeMember;
      confirmDialog('Remove member?', `Remove ${userById(uid_).name} from the group?`, ()=>{
        c.participantIds = c.participantIds.filter(id=>id!==uid_);
        c.adminIds = c.adminIds.filter(id=>id!==uid_);
        saveDB(); toast('Member removed','','success'); render();
      }, 'Remove');
    }));
    modalEl.querySelectorAll('[data-add-member]').forEach(btn=>btn.addEventListener('click', ()=>{
      c.participantIds.push(btn.dataset.addMember);
      saveDB(); toast('Member added','','success'); render();
    }));
    modalEl.querySelector('#grpLeaveBtn')?.addEventListener('click', ()=>{
      confirmDialog('Leave group?', 'You will stop receiving messages from this group.', ()=>{
        c.participantIds = c.participantIds.filter(id=>id!==myId);
        c.adminIds = c.adminIds.filter(id=>id!==myId);
        saveDB(); toast('Left group','','info'); modalInstance.hide(); location.hash='#/messages';
      }, 'Leave');
    });
    modalEl.querySelector('#grpDeleteBtn')?.addEventListener('click', ()=>{
      confirmDialog('Delete this group?', 'This deletes the group and its messages for everyone. This cannot be undone.', ()=>{
        DB.conversations = DB.conversations.filter(x=>x.id!==c.id);
        DB.messages = DB.messages.filter(m=>m.conversationId!==c.id);
        saveDB(); toast('Group deleted','','success'); modalInstance.hide(); location.hash='#/messages';
      }, 'Delete');
    });
  }
  render();
}
function openStarredMessagesModal(convId){
  const starred = messagesFor(convId).filter(m=>m.starred && !m.deleted);
  const {el} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Starred messages</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      ${starred.length ? starred.map(m=>{
        const sender = userById(m.senderId);
        return `<div class="d-flex gap-2 mb-3">
          <img src="${sender?.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">
          <div><div class="fw-bold small">${escapeHtml(sender?.name||'')}</div><div class="small">${linkify(m.text)}</div><div class="text-muted-2" style="font-size:.7rem">${formatDateTime(m.timestamp)}</div></div>
        </div>`;
      }).join('') : emptyState('bi-star','No starred messages','Long-press a message and tap the star to save it here.')}
    </div>
  `, 'modal-lg');
}

// ==========================================================================
// CALLS (simulated)
// ==========================================================================
function startCall(otherId, kind){
  const u = userById(otherId);
  const overlay = document.createElement('div');
  overlay.className = 'call-overlay';
  overlay.id = 'callOverlay';
  let seconds = 0; let status='Calling…'; let muted=false, speaker=false, camOn=true;
  function render(){
    if(kind==='video'){
      overlay.innerHTML = `
        <div class="video-call-main">
          <img src="${u.cover}" style="width:100%;height:100%;object-fit:cover;opacity:.5">
        </div>
        <div class="video-call-self">${camOn?`<img src="${me().avatar}" style="width:100%;height:100%;object-fit:cover">`:`<img src="${me().avatar}">`}</div>
        <div style="position:absolute; top:30px; text-align:center; width:100%;">
          <div class="call-name">${escapeHtml(u.name)}</div>
          <div class="call-status">${status}</div>
        </div>
        <div style="position:absolute; bottom:30px; width:100%; display:flex; justify-content:center;">
          <div class="call-controls">
            <button class="${muted?'active-toggle':''}" id="muteBtn"><i class="bi ${muted?'bi-mic-mute-fill':'bi-mic-fill'}"></i></button>
            <button class="${!camOn?'active-toggle':''}" id="camBtn"><i class="bi ${camOn?'bi-camera-video-fill':'bi-camera-video-off-fill'}"></i></button>
            <button id="addParticipantBtn"><i class="bi bi-person-plus"></i></button>
            <button class="end-call" id="endCallBtn"><i class="bi bi-telephone-x-fill"></i></button>
          </div>
        </div>`;
    }else{
      overlay.innerHTML = `
        <img src="${u.avatar}" class="call-avatar">
        <div class="call-name">${escapeHtml(u.name)}</div>
        <div class="call-status">${status}</div>
        <div class="call-controls">
          <button class="${muted?'active-toggle':''}" id="muteBtn"><i class="bi ${muted?'bi-mic-mute-fill':'bi-mic-fill'}"></i></button>
          <button class="${speaker?'active-toggle':''}" id="speakerBtn"><i class="bi bi-volume-up-fill"></i></button>
          <button id="addParticipantBtn"><i class="bi bi-person-plus"></i></button>
          <button class="end-call" id="endCallBtn"><i class="bi bi-telephone-x-fill"></i></button>
        </div>`;
    }
    overlay.querySelector('#muteBtn').addEventListener('click', ()=>{ muted=!muted; render(); });
    overlay.querySelector('#speakerBtn')?.addEventListener('click', ()=>{ speaker=!speaker; render(); });
    overlay.querySelector('#camBtn')?.addEventListener('click', ()=>{ camOn=!camOn; render(); });
    overlay.querySelector('#addParticipantBtn').addEventListener('click', ()=>toast('Add participant', 'Simulated — invite sent.', 'info'));
    overlay.querySelector('#endCallBtn').addEventListener('click', endCall);
  }
  function endCall(){
    clearInterval(interval);
    DB.callHistory.unshift({id:uid('call'), participantId:otherId, type:kind, duration:seconds, timestamp:nowISO(), missed:seconds===0});
    saveDB();
    overlay.remove();
    toast('Call ended', `Duration: ${Math.floor(seconds/60)}m ${seconds%60}s`, 'info');
  }
  render();
  document.body.appendChild(overlay);
  setTimeout(()=>{ status='Connected'; render(); }, 1800);
  const interval = setInterval(()=>{
    seconds++;
    if(status==='Connected'){ const m=String(Math.floor(seconds/60)).padStart(2,'0'), s=String(seconds%60).padStart(2,'0'); status=`${m}:${s}`; render(); }
  },1000);
}

// ==========================================================================
// JOBS
// ==========================================================================
function renderJobCard(job){
  const c = companyById(job.companyId);
  const saved = isSaved(me().id, 'job', job.id);
  return `
    <div class="job-card" data-goto-job="${job.id}" style="cursor:pointer">
      <div class="d-flex gap-2">
        <img src="${c.logo}" class="entity-logo-sq" loading="lazy">
        <div class="flex-grow-1">
          <div class="job-title">${escapeHtml(job.title)}</div>
          <div class="text-muted-2 small">${escapeHtml(c.name)} · ${escapeHtml(job.location)}</div>
        </div>
        <button class="btn btn-sm ${saved?'text-accent':'text-muted-2'}" style="border:none;background:none" data-save-job="${job.id}"><i class="bi ${saved?'bi-bookmark-fill':'bi-bookmark'}"></i></button>
      </div>
      <div class="job-meta"><span>${escapeHtml(job.workType)}</span><span>${escapeHtml(job.type)}</span><span>${escapeHtml(job.experience)}</span></div>
      <div class="d-flex justify-content-between align-items-center">
        <span class="fw-bold small">${escapeHtml(job.salary)}</span>
        <span class="text-muted-2" style="font-size:.74rem">Posted ${timeAgo(job.postedAt)}</span>
      </div>
    </div>`;
}

function renderJobsPage(){
  const jobs = DB.jobs.slice().sort((a,b)=>new Date(b.postedAt)-new Date(a.postedAt));
  const isRecruiter = DB.companies.some(c=>c.adminIds.includes(me().id)) || DB.jobs.some(j=>j.postedBy===me().id);
  return `
    <div class="page-header"><h4 class="page-title">Jobs</h4>
      <div class="d-flex gap-2">
        ${isRecruiter ? `<a href="#/jobs/manage" class="btn btn-brand btn-sm"><i class="bi bi-person-workspace"></i> Manage jobs</a>` : ''}
        <a href="#/jobs/applications" class="btn btn-outline-brand btn-sm">My applications</a>
      </div>
    </div>
    <div class="card-panel">
      <div class="row g-2">
        <div class="col-md-4"><input type="text" class="form-control" id="jobSearchTitle" placeholder="Job title or skill"></div>
        <div class="col-md-3"><input type="text" class="form-control" id="jobSearchLocation" placeholder="Location"></div>
        <div class="col-md-3">
          <select class="form-select" id="jobFilterType"><option value="">Any type</option><option>Full-time</option><option>Part-time</option><option>Internship</option><option>Contract</option></select>
        </div>
        <div class="col-md-2"><button class="btn btn-outline-brand w-100" id="clearJobFilters">Clear</button></div>
      </div>
      <div class="row g-2 mt-1">
        <div class="col-md-4">
          <select class="form-select" id="jobFilterWork"><option value="">Any work type</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select>
        </div>
        <div class="col-md-4">
          <select class="form-select" id="jobFilterLevel"><option value="">Any level</option><option>Entry level</option><option>Mid level</option><option>Senior level</option></select>
        </div>
      </div>
    </div>
    <div class="grid-cards" id="jobsGrid">${jobs.map(renderJobCard).join('') || emptyState('bi-briefcase','No jobs found','Try adjusting your filters.')}</div>
  `;
}
function wireJobsEvents(main){
  wireCommonNav(main);
  function applyFilters(){
    const title = main.querySelector('#jobSearchTitle').value.toLowerCase();
    const loc = main.querySelector('#jobSearchLocation').value.toLowerCase();
    const type = main.querySelector('#jobFilterType').value;
    const work = main.querySelector('#jobFilterWork').value;
    const level = main.querySelector('#jobFilterLevel').value;
    const filtered = DB.jobs.filter(j=>{
      const c = companyById(j.companyId);
      const matchesTitle = !title || j.title.toLowerCase().includes(title) || (j.skills||[]).some(s=>s.toLowerCase().includes(title)) || c.name.toLowerCase().includes(title);
      const matchesLoc = !loc || j.location.toLowerCase().includes(loc);
      const matchesType = !type || j.type===type;
      const matchesWork = !work || j.workType===work;
      const matchesLevel = !level || j.experience===level;
      return matchesTitle && matchesLoc && matchesType && matchesWork && matchesLevel;
    });
    document.getElementById('jobsGrid').innerHTML = filtered.map(renderJobCard).join('') || emptyState('bi-briefcase','No jobs match your filters','Try clearing some filters.');
    wireCommonNav(document.getElementById('jobsGrid'));
    wireSaveJobButtons(document.getElementById('jobsGrid'));
  }
  ['jobSearchTitle','jobSearchLocation','jobFilterType','jobFilterWork','jobFilterLevel'].forEach(id=>{
    main.querySelector('#'+id).addEventListener('input', debounce(applyFilters,150));
    main.querySelector('#'+id).addEventListener('change', applyFilters);
  });
  main.querySelector('#clearJobFilters').addEventListener('click', ()=>{
    ['jobSearchTitle','jobSearchLocation'].forEach(id=>main.querySelector('#'+id).value='');
    ['jobFilterType','jobFilterWork','jobFilterLevel'].forEach(id=>main.querySelector('#'+id).value='');
    applyFilters();
  });
  wireSaveJobButtons(main);
}
function wireSaveJobButtons(container){
  container.querySelectorAll('[data-save-job]').forEach(btn=>{
    btn.addEventListener('click',(e)=>{
      e.stopPropagation();
      const nowSaved = toggleSave(me().id,'job',btn.dataset.saveJob);
      if(nowSaved) awardCoins(me().id, 'saveItem');
      toast(nowSaved?'Job saved':'Removed from saved','','success');
      btn.innerHTML = `<i class="bi ${nowSaved?'bi-bookmark-fill':'bi-bookmark'}"></i>`;
      btn.classList.toggle('text-accent', nowSaved);
    });
  });
}

function renderJobDetail(jobId){
  const job = jobById(jobId);
  if(!job) return emptyState('bi-exclamation-triangle','Job not found','');
  const c = companyById(job.companyId);
  const applied = hasApplied(me().id, jobId);
  const saved = isSaved(me().id,'job',jobId);
  const related = DB.jobs.filter(j=>j.id!==jobId && j.companyId===job.companyId).slice(0,3);
  return `
    <div class="card-panel">
      <div class="d-flex gap-3">
        <img src="${c.logo}" class="entity-logo-sq" style="width:64px;height:64px">
        <div class="flex-grow-1">
          <h4 class="mb-0">${escapeHtml(job.title)}</h4>
          <div class="text-muted-2" data-goto-company="${c.id}" style="cursor:pointer">${escapeHtml(c.name)} · ${escapeHtml(job.location)}</div>
          <div class="job-meta mt-1"><span>${escapeHtml(job.workType)}</span><span>${escapeHtml(job.type)}</span><span>${escapeHtml(job.experience)}</span><span>${escapeHtml(job.salary)}</span></div>
        </div>
      </div>
      <div class="d-flex gap-2 mt-3">
        ${applied ? `<button class="btn btn-outline-brand" disabled><i class="bi bi-check-circle"></i> Applied</button>` : `<button class="btn btn-brand" id="applyBtn">Apply now</button>`}
        <button class="btn btn-outline-brand" id="saveJobBtn"><i class="bi ${saved?'bi-bookmark-fill':'bi-bookmark'}"></i> ${saved?'Saved':'Save'}</button>
        <button class="btn btn-outline-brand" id="shareJobBtn"><i class="bi bi-share"></i> Share</button>
        <button class="btn btn-outline-brand" id="msgCompanyBtn"><i class="bi bi-chat"></i> Message company</button>
      </div>
    </div>
    <div class="card-panel">
      <h6>About this role</h6>
      <p style="white-space:pre-wrap">${escapeHtml(job.desc)}</p>
      ${job.responsibilities.length?`<h6 class="mt-3">Responsibilities</h6><ul>${job.responsibilities.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`:''}
      ${job.requirements.length?`<h6 class="mt-3">Requirements</h6><ul>${job.requirements.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`:''}
      ${job.skills.length?`<h6 class="mt-3">Skills</h6>${job.skills.map(s=>`<span class="skill-chip">${escapeHtml(s)}</span>`).join('')}`:''}
      ${job.benefits.length?`<h6 class="mt-3">Benefits</h6>${job.benefits.map(s=>`<span class="skill-chip">${escapeHtml(s)}</span>`).join('')}`:''}
    </div>
    <div class="card-panel">
      <h6>About ${escapeHtml(c.name)}</h6>
      <p class="small text-muted-2">${escapeHtml(c.desc)}</p>
      <div class="d-flex gap-3 small text-muted-2"><span>${escapeHtml(c.industry)}</span><span>${escapeHtml(c.employees)} employees</span></div>
    </div>
    ${related.length?`<div class="card-panel"><h6>More jobs at ${escapeHtml(c.name)}</h6>${related.map(renderJobCard).join('')}</div>`:''}
  `;
}
function wireJobDetailEvents(main, jobId){
  wireCommonNav(main);
  main.querySelector('#applyBtn')?.addEventListener('click', ()=>openJobApplicationModal(jobId));
  main.querySelector('#saveJobBtn')?.addEventListener('click', ()=>{ toggleSave(me().id,'job',jobId); router(); });
  main.querySelector('#shareJobBtn')?.addEventListener('click', ()=>toast('Link copied','Job link copied to clipboard.','success'));
  main.querySelector('#msgCompanyBtn')?.addEventListener('click', ()=>{
    const job = jobById(jobId); const c = companyById(job.companyId);
    const recruiter = c.adminIds[0] || DB.users.find(u=>u.company===c.name)?.id;
    if(recruiter){ messageUser(recruiter); }
    else toast('No contact available', 'This company has no listed recruiter yet.', 'info');
  });
}

function openJobApplicationModal(jobId){
  const job = jobById(jobId);
  const u = me();
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Apply — ${escapeHtml(job.title)}</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-2">
        <div class="col-6"><label class="form-label small">Full name</label><input class="form-control" id="appName" value="${escapeHtml(u.name)}"></div>
        <div class="col-6"><label class="form-label small">Email</label><input class="form-control" id="appEmail" value="${escapeHtml(u.email)}"></div>
        <div class="col-6"><label class="form-label small">Phone</label><input class="form-control" id="appPhone" value="${escapeHtml(u.phone||'')}"></div>
        <div class="col-6"><label class="form-label small">Portfolio / website</label><input class="form-control" id="appPortfolio" value="${escapeHtml(u.website||'')}"></div>
        <div class="col-12"><label class="form-label small">Resume file (simulated)</label><input type="file" class="form-control" id="appResume"></div>
        <div class="col-12"><label class="form-label small">Cover letter</label><textarea class="form-control" id="appCoverLetter" rows="3" placeholder="Why are you a great fit?"></textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-brand" data-bs-dismiss="modal">Cancel</button>
      <button class="btn btn-brand" id="submitAppBtn">Submit application</button>
    </div>
  `, 'modal-lg');
  el.querySelector('#submitAppBtn').addEventListener('click', ()=>{
    const form = {
      name: el.querySelector('#appName').value, email: el.querySelector('#appEmail').value, phone: el.querySelector('#appPhone').value,
      portfolio: el.querySelector('#appPortfolio').value, resume: el.querySelector('#appResume').value ? el.querySelector('#appResume').value.split('\\').pop() : 'Not attached',
      coverLetter: el.querySelector('#appCoverLetter').value, skills:u.skills, education:u.education, experience:u.experience
    };
    if(!form.name || !form.email){ toast('Missing info','Name and email are required.','error'); return; }
    applyToJob(me().id, jobId, form);
    modal.hide(); toast('Application submitted', `Applied to ${job.title}`, 'success'); router();
  });
}

function renderApplicationsPage(){
  const apps = DB.applications.filter(a=>a.userId===me().id).sort((a,b)=>new Date(b.appliedAt)-new Date(a.appliedAt));
  const statusColor = {Applied:'secondary','Under review':'warning',Interview:'accent',Shortlisted:'accent',Rejected:'danger',Accepted:'success'};
  return `
    <div class="page-header"><h4 class="page-title">My applications</h4><a href="#/jobs" class="btn btn-outline-brand btn-sm">Browse jobs</a></div>
    ${apps.length ? apps.map(a=>{
      const job = jobById(a.jobId); const c = companyById(job.companyId);
      return `<div class="entity-card-row mb-2" data-goto-job="${job.id}" style="cursor:pointer">
        <img src="${c.logo}" class="entity-logo-sq" loading="lazy">
        <div class="flex-grow-1">
          <div class="fw-bold">${escapeHtml(job.title)}</div>
          <div class="text-muted-2 small">${escapeHtml(c.name)} · Applied ${formatDate(a.appliedAt)}</div>
        </div>
        <span class="badge text-bg-light border" style="color:var(--text-color)">${escapeHtml(a.status)}</span>
      </div>`;
    }).join('') : emptyState('bi-send','No applications yet','Jobs you apply to will show up here.', `<a href="#/jobs" class="btn btn-brand btn-sm">Find jobs</a>`)}
  `;
}
function wireApplicationsEvents(main){ wireCommonNav(main); }

// ==========================================================================
// RECRUITER / MANAGE JOBS DASHBOARD
// ==========================================================================
const APP_STATUSES = ['Applied','Under review','Interview','Shortlisted','Rejected','Accepted'];
function renderManageJobsPage(){
  const myId = me().id;
  const myCompanyIds = DB.companies.filter(c=>c.adminIds.includes(myId)).map(c=>c.id);
  const myJobs = DB.jobs.filter(j=>myCompanyIds.includes(j.companyId) || j.postedBy===myId).sort((a,b)=>new Date(b.postedAt)-new Date(a.postedAt));
  return `
    <div class="page-header"><h4 class="page-title">Manage jobs</h4><button class="btn btn-brand btn-sm" id="postNewJobBtn"><i class="bi bi-plus-lg"></i> Post a job</button></div>
    <div class="card-panel">
      <input type="text" class="form-control" id="candidateSearchInput" placeholder="Search candidates by name or skill…">
      <div id="candidateSearchResults" class="mt-2"></div>
    </div>
    ${myJobs.length ? myJobs.map(j=>{
      const c = companyById(j.companyId);
      const apps = DB.applications.filter(a=>a.jobId===j.id);
      return `<div class="card-panel">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div class="d-flex gap-2">
            <img src="${c.logo}" class="entity-logo-sq" loading="lazy">
            <div><div class="fw-bold">${escapeHtml(j.title)}</div><div class="text-muted-2 small">${escapeHtml(c.name)} · Posted ${timeAgo(j.postedAt)}</div></div>
          </div>
          <span class="badge text-bg-light border" style="color:var(--text-color)">${pluralize(apps.length,'applicant')}</span>
        </div>
        ${apps.length ? `<div class="mt-3">${apps.map(a=>{
          const u = userById(a.userId);
          const savedCandidate = isSaved(myId,'candidate',u.id);
          return `<div class="entity-card-row mb-2">
            <img src="${u.avatar}" class="entity-avatar-lg" style="width:44px;height:44px;cursor:pointer" data-goto-profile="${u.id}">
            <div class="flex-grow-1">
              <div class="fw-bold small" data-goto-profile="${u.id}" style="cursor:pointer">${escapeHtml(u.name)}</div>
              <div class="text-muted-2" style="font-size:.76rem">Applied ${formatDate(a.appliedAt)} · ${escapeHtml(a.form?.email||u.email)}</div>
            </div>
            <select class="form-select form-select-sm" style="width:auto" data-update-app-status="${a.id}">
              ${APP_STATUSES.map(s=>`<option ${a.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-outline-brand" data-msg-candidate="${u.id}" title="Message"><i class="bi bi-chat"></i></button>
            <button class="btn btn-sm ${savedCandidate?'text-accent':'btn-outline-brand'}" data-save-candidate="${u.id}" title="Save candidate"><i class="bi ${savedCandidate?'bi-bookmark-fill':'bi-bookmark'}"></i></button>
          </div>`;
        }).join('')}</div>` : `<p class="small text-muted-2 mt-2 mb-0">No applicants yet.</p>`}
      </div>`;
    }).join('') : emptyState('bi-person-workspace','No jobs to manage','Post a job or become a company admin to manage applicants.')}
  `;
}
function wireManageJobsEvents(main){
  wireCommonNav(main);
  main.querySelector('#postNewJobBtn')?.addEventListener('click', openCreateJobModal);
  main.querySelectorAll('[data-update-app-status]').forEach(sel=>{
    sel.addEventListener('change', ()=>{ updateApplicationStatus(sel.dataset.updateAppStatus, sel.value); toast('Status updated','','success'); });
  });
  main.querySelectorAll('[data-msg-candidate]').forEach(btn=>btn.addEventListener('click', ()=> messageUser(btn.dataset.msgCandidate)));
  main.querySelectorAll('[data-save-candidate]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ const now = toggleSave(me().id,'candidate',btn.dataset.saveCandidate); toast(now?'Candidate saved':'Removed from saved','','success'); router(); });
  });
  const searchInput = main.querySelector('#candidateSearchInput');
  const resultsBox = main.querySelector('#candidateSearchResults');
  searchInput?.addEventListener('input', debounce(()=>{
    const q = searchInput.value.trim().toLowerCase();
    if(!q){ resultsBox.innerHTML=''; return; }
    const matches = DB.users.filter(u=>u.name.toLowerCase().includes(q) || (u.skills||[]).some(s=>s.toLowerCase().includes(q))).slice(0,6);
    resultsBox.innerHTML = matches.length ? matches.map(u=>`
      <div class="entity-card-row mb-2">
        <img src="${u.avatar}" class="entity-avatar-lg" style="width:40px;height:40px;cursor:pointer" data-goto-profile="${u.id}">
        <div class="flex-grow-1"><div class="fw-bold small" data-goto-profile="${u.id}" style="cursor:pointer">${escapeHtml(u.name)}</div><div class="text-muted-2" style="font-size:.76rem">${escapeHtml(u.headline)}</div></div>
        <button class="btn btn-sm btn-outline-brand" data-msg-candidate="${u.id}">Message</button>
      </div>`).join('') : `<p class="small text-muted-2">No candidates match "${escapeHtml(q)}".</p>`;
    wireCommonNav(resultsBox);
    resultsBox.querySelectorAll('[data-msg-candidate]').forEach(btn=>btn.addEventListener('click', ()=> messageUser(btn.dataset.msgCandidate)));
  }, 200));
}

// ==========================================================================
// COMPANIES
// ==========================================================================
function renderCompanyCard(c){
  const following = isFollowing(me().id, 'company', c.id);
  return `
    <div class="entity-card">
      <div class="d-flex gap-2 align-items-center" data-goto-company="${c.id}" style="cursor:pointer">
        <img src="${c.logo}" class="entity-logo-sq" loading="lazy">
        <div><div class="fw-bold">${escapeHtml(c.name)}</div><div class="text-muted-2 small">${escapeHtml(c.industry)}</div></div>
      </div>
      <div class="text-muted-2" style="font-size:.8rem">${pluralize(followerCount('company',c.id),'follower')}</div>
      <button class="btn btn-sm ${following?'btn-outline-brand':'btn-brand'}" data-follow-btn="company|${c.id}">${following?'Following':'Follow'}</button>
    </div>`;
}
// ==========================================================================
// ARTICLES
// ==========================================================================
function estimateReadTime(text){
  const words = (text||'').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
function renderArticleCard(article){
  const author = userById(article.authorId);
  if(!author) return '';
  const myId = me().id;
  const liked = (article.likes||[]).includes(myId);
  const saved = isSaved(myId, 'article', article.id);
  return `
    <div class="article-card" data-goto-article="${article.id}">
      <div class="article-card-media" style="background-image:url('${article.cover}')"></div>
      <div class="article-card-body">
        <div class="article-card-tags">${(article.tags||[]).slice(0,3).map(t=>`<span class="skill-chip">${escapeHtml(t)}</span>`).join('')}</div>
        <h5 class="article-card-title">${escapeHtml(article.title)}</h5>
        <p class="article-card-snippet">${escapeHtml(article.content.slice(0,140))}${article.content.length>140?'…':''}</p>
        <div class="article-card-meta">
          <img src="${author.avatar}" alt="${escapeHtml(author.name)}" data-goto-profile="${author.id}">
          <div class="flex-grow-1">
            <div class="fw-bold" style="font-size:.82rem" data-goto-profile="${author.id}">${escapeHtml(author.name)}</div>
            <div class="text-muted-2" style="font-size:.74rem">${timeAgo(article.timestamp)} · ${estimateReadTime(article.content)} min read</div>
          </div>
        </div>
        <div class="article-card-actions">
          <button class="${liked?'liked':''}" data-like-article="${article.id}"><i class="bi ${liked?'bi-hand-thumbs-up-fill':'bi-hand-thumbs-up'}"></i> ${(article.likes||[]).length}</button>
          <button data-goto-article="${article.id}"><i class="bi bi-chat"></i> ${(article.comments||[]).length}</button>
          <button class="${saved?'saved':''}" data-save-article-card="${article.id}"><i class="bi ${saved?'bi-bookmark-fill':'bi-bookmark'}"></i></button>
        </div>
      </div>
    </div>`;
}
function renderArticlesPage(){
  const articles = DB.articles.slice().sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));
  const allTags = [...new Set(articles.flatMap(a=>a.tags||[]))];
  return `
    <div class="page-header"><h4 class="page-title">Articles</h4><button class="btn btn-brand btn-sm" id="writeArticleBtn"><i class="bi bi-pencil-square"></i> Write article</button></div>
    ${allTags.length ? `<div class="card-panel py-2"><div class="d-flex flex-wrap gap-2 align-items-center">
      <span class="text-muted-2 small fw-bold me-1">Filter:</span>
      <span class="interest-chip selected" data-filter-tag="">All</span>
      ${allTags.map(t=>`<span class="interest-chip" data-filter-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}
    </div></div>` : ''}
    <div class="article-grid" id="articlesGrid">
      ${articles.length ? articles.map(renderArticleCard).join('') : emptyState('bi-file-earmark-text','No articles yet','Be the first to publish a long-form article.', `<button class="btn btn-brand btn-sm" id="writeArticleBtnEmpty">Write article</button>`)}
    </div>
  `;
}
function wireArticlesPageEvents(main){
  wireCommonNav(main);
  main.querySelector('#writeArticleBtn')?.addEventListener('click', openCreateArticleModal);
  main.querySelector('#writeArticleBtnEmpty')?.addEventListener('click', openCreateArticleModal);
  main.querySelectorAll('[data-like-article]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleArticleLike(btn.dataset.likeArticle); });
  });
  main.querySelectorAll('[data-save-article-card]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const now = toggleSave(me().id, 'article', btn.dataset.saveArticleCard);
      toast(now?'Article saved':'Removed from saved','','success');
      router();
    });
  });
  main.querySelectorAll('[data-filter-tag]').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      main.querySelectorAll('[data-filter-tag]').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
      const tag = chip.dataset.filterTag;
      const grid = main.querySelector('#articlesGrid');
      const articles = DB.articles.slice().sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp))
        .filter(a=> !tag || (a.tags||[]).includes(tag));
      grid.innerHTML = articles.length ? articles.map(renderArticleCard).join('') : emptyState('bi-file-earmark-text','No articles with this tag','Try a different filter.');
      wireArticlesPageEvents(main);
    });
  });
}

function renderArticleDetail(articleId){
  const article = articleById(articleId);
  if(!article) return emptyState('bi-file-earmark-text','Article not found','');
  const author = userById(article.authorId);
  const myId = me().id;
  const liked = (article.likes||[]).includes(myId);
  const saved = isSaved(myId, 'article', article.id);
  const isOwner = article.authorId===myId;
  const related = DB.articles.filter(a=>a.id!==article.id && (a.tags||[]).some(t=>(article.tags||[]).includes(t))).slice(0,3);
  return `
    <a href="#/articles" class="d-inline-flex align-items-center gap-1 text-muted-2 small mb-1"><i class="bi bi-arrow-left"></i> All articles</a>
    <div class="article-detail-card">
      <img src="${article.cover}" class="article-hero" alt="">
      <div class="article-detail-body">
        <div class="mb-2">${(article.tags||[]).map(t=>`<span class="skill-chip">${escapeHtml(t)}</span>`).join('')}</div>
        <h1 class="article-detail-title">${escapeHtml(article.title)}</h1>
        <div class="d-flex align-items-center gap-2 justify-content-between flex-wrap">
          <div class="d-flex align-items-center gap-2">
            <img src="${author.avatar}" alt="${escapeHtml(author.name)}" data-goto-profile="${author.id}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;cursor:pointer">
            <div>
              <div class="fw-bold" data-goto-profile="${author.id}" style="cursor:pointer">${escapeHtml(author.name)}</div>
              <div class="text-muted-2 small">${formatDate(article.timestamp)} · ${estimateReadTime(article.content)} min read</div>
            </div>
          </div>
          ${isOwner ? `<button class="btn btn-outline-brand btn-sm text-danger" id="deleteArticleBtn"><i class="bi bi-trash"></i> Delete</button>` : ''}
        </div>
        <hr class="hairline">
        <div class="article-detail-content">${escapeHtml(article.content).split('\n').map(p=>`<p>${p}</p>`).join('')}</div>
        <div class="post-actions mt-3" style="border-top:1px solid var(--border-color); padding-top:.5rem;">
          <button class="${liked?'liked':''}" id="likeArticleDetailBtn"><i class="bi ${liked?'bi-hand-thumbs-up-fill':'bi-hand-thumbs-up'}"></i> ${(article.likes||[]).length} Like${(article.likes||[]).length!==1?'s':''}</button>
          <button class="${saved?'saved':''}" id="saveArticleDetailBtn"><i class="bi ${saved?'bi-bookmark-fill':'bi-bookmark'}"></i> Save</button>
          <button id="shareArticleDetailBtn"><i class="bi bi-share"></i> Share</button>
        </div>
      </div>
    </div>
    <div class="card-panel mt-3">
      <h6>Comments (${(article.comments||[]).length})</h6>
      <div id="articleComments">
        ${(article.comments||[]).map(c=>{
          const cu = userById(c.authorId); if(!cu) return '';
          return `<div class="comment-item mt-2">
            <img src="${cu.avatar}" alt="${escapeHtml(cu.name)}">
            <div class="comment-bubble"><div class="c-author">${escapeHtml(cu.name)}</div><div class="c-text">${linkify(c.text)}</div></div>
          </div>`;
        }).join('') || `<p class="small text-muted-2 mb-0">No comments yet — be the first to comment.</p>`}
      </div>
      <div class="d-flex gap-2 mt-3">
        <img src="${me().avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">
        <input type="text" class="form-control form-control-sm" id="articleCommentInput" placeholder="Write a comment…" style="border-radius:999px">
      </div>
    </div>
    ${related.length ? `<div class="card-panel mt-3"><h6>Related articles</h6><div class="article-grid">${related.map(renderArticleCard).join('')}</div></div>` : ''}
  `;
}
function toggleArticleLike(articleId){
  const article = articleById(articleId);
  const myId = me().id;
  article.likes = article.likes||[];
  if(article.likes.includes(myId)) article.likes = article.likes.filter(id=>id!==myId);
  else{
    article.likes.push(myId);
    if(article.authorId!==myId) addNotification(article.authorId, 'post_reaction', `${me().name} liked your article`, article.id);
  }
  saveDB(); router();
}
function addArticleComment(articleId, text){
  const article = articleById(articleId);
  article.comments = article.comments||[];
  article.comments.push({id:uid('cm'), authorId:me().id, text, timestamp:nowISO()});
  if(article.authorId!==me().id) addNotification(article.authorId, 'post_comment', `${me().name} commented on your article`, article.id);
  saveDB(); router();
}
let articleDwellTimer = null;
function wireArticleDetailEvents(main, articleId){
  wireCommonNav(main);
  main.querySelector('#likeArticleDetailBtn')?.addEventListener('click', ()=> toggleArticleLike(articleId));
  main.querySelector('#saveArticleDetailBtn')?.addEventListener('click', ()=>{
    const now = toggleSave(me().id, 'article', articleId);
    if(now) awardCoins(me().id, 'saveItem');
    toast(now?'Article saved':'Removed from saved','','success'); router();
  });
  main.querySelector('#shareArticleDetailBtn')?.addEventListener('click', ()=>{
    awardCoins(me().id, 'shareContent');
    toast('Link copied', 'Article link copied to clipboard.', 'success');
  });
  main.querySelector('#deleteArticleBtn')?.addEventListener('click', ()=>{
    confirmDialog('Delete article?', 'This action cannot be undone.', ()=>{
      DB.articles = DB.articles.filter(a=>a.id!==articleId); saveDB(); toast('Article deleted','','success'); location.hash='#/articles';
    }, 'Delete');
  });
  main.querySelector('#articleCommentInput')?.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && e.target.value.trim()){ addArticleComment(articleId, e.target.value.trim()); e.target.value=''; }
  });
  main.querySelectorAll('[data-like-article]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleArticleLike(btn.dataset.likeArticle); });
  });
  main.querySelectorAll('[data-save-article-card]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const now = toggleSave(me().id,'article',btn.dataset.saveArticleCard);
      if(now) awardCoins(me().id, 'saveItem');
      router();
    });
  });

  // Reward genuine reading, not rapid click-throughs: only counts after the
  // reader has actually stayed on the article for a little while.
  clearTimeout(articleDwellTimer);
  const article = articleById(articleId);
  if(article && article.authorId !== me().id){
    articleDwellTimer = setTimeout(()=>{
      if(location.hash === '#/articles/'+articleId){
        awardCoins(me().id, 'viewArticle');
      }
    }, ARTICLE_VIEW_DWELL_MS);
  }
}

function renderCompaniesPage(){
  return `
    <div class="page-header"><h4 class="page-title">Companies</h4><button class="btn btn-brand btn-sm" id="createCompanyBtn"><i class="bi bi-plus-lg"></i> Create company page</button></div>
    <div class="grid-cards">${DB.companies.map(renderCompanyCard).join('')}</div>
  `;
}
function openCreateCompanyModal(){
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Create a company page</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="text-center mb-3"><img id="coLogoPreview" src="${coverFor('newco'+Date.now())}" style="width:64px;height:64px;border-radius:12px;object-fit:cover"><br>
        <input type="file" accept="image/*" class="form-control form-control-sm mt-2" id="coLogoInput"></div>
      <input type="text" class="form-control mb-2" id="coName" placeholder="Company name">
      <input type="text" class="form-control mb-2" id="coIndustry" placeholder="Industry">
      <div class="row g-2 mb-2">
        <div class="col-6"><input type="text" class="form-control" id="coLocation" placeholder="Location"></div>
        <div class="col-6"><select class="form-select" id="coEmployees"><option>1-10</option><option>11-50</option><option>51-200</option><option>201-500</option><option>500+</option></select></div>
      </div>
      <input type="text" class="form-control mb-2" id="coWebsite" placeholder="Website (optional)">
      <textarea class="form-control" id="coDesc" rows="3" placeholder="What does this company do?"></textarea>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="createCoBtn">Create company page</button></div>
  `, 'modal-lg');
  let logo = null;
  el.querySelector('#coLogoInput').addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{ logo=r.result; el.querySelector('#coLogoPreview').src = logo; };
    r.readAsDataURL(f);
  });
  el.querySelector('#createCoBtn').addEventListener('click', ()=>{
    const name = el.querySelector('#coName').value.trim();
    if(!name){ toast('Add a company name','','error'); return; }
    const company = {
      id:uid('co'), name, logo: logo || avatarFor(name+Date.now()), cover: coverFor(name+'cv'+Date.now()),
      industry: el.querySelector('#coIndustry').value.trim()||'Not specified', desc: el.querySelector('#coDesc').value.trim(),
      website: el.querySelector('#coWebsite').value.trim(), location: el.querySelector('#coLocation').value.trim(),
      employees: el.querySelector('#coEmployees').value, adminIds:[me().id], createdAt:nowISO()
    };
    DB.companies.push(company);
    awardCoins(me().id, 'createCompany');
    saveDB(); modal.hide();
    toast('Company page created', 'You can now post jobs and updates as this company.', 'success');
    location.hash = '#/companies/'+company.id;
  });
}
function renderCompanyDetail(companyId){
  const c = companyById(companyId);
  if(!c) return emptyState('bi-building','Company not found','');
  const following = isFollowing(me().id,'company',c.id);
  const posts = DB.posts.filter(p=>p.authorType==='company' && p.authorId===c.id);
  const jobs = DB.jobs.filter(j=>j.companyId===c.id);
  const employees = DB.users.filter(u=>u.company===c.name);
  return `
    <div class="profile-header-card">
      <div class="profile-cover" style="background-image:url('${c.cover}')"></div>
      <div class="profile-info">
        <img src="${c.logo}" class="profile-avatar" style="border-radius:16px">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div class="profile-name">${escapeHtml(c.name)}</div>
            <div class="profile-headline">${escapeHtml(c.industry)} · ${escapeHtml(c.location)}</div>
            <div class="profile-meta"><span>${pluralize(followerCount('company',c.id),'follower')}</span><span>${escapeHtml(c.employees)} employees</span></div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn ${following?'btn-outline-brand':'btn-brand'}" data-follow-btn="company|${c.id}">${following?'Following':'Follow'}</button>
            <button class="btn btn-outline-brand" id="msgCompanyDetailBtn"><i class="bi bi-chat"></i> Message</button>
          </div>
        </div>
      </div>
      <div class="profile-tabs">
        <div class="profile-tab active" data-ctab="about">About</div>
        <div class="profile-tab" data-ctab="posts">Posts</div>
        <div class="profile-tab" data-ctab="jobs">Jobs (${jobs.length})</div>
        <div class="profile-tab" data-ctab="people">People</div>
      </div>
    </div>
    <div id="companyTabContent" class="mt-3"></div>
  `;
}
function wireCompanyDetailEvents(main, companyId){
  wireCommonNav(main); wireFollowButtons(main);
  const c = companyById(companyId);
  const jobs = DB.jobs.filter(j=>j.companyId===c.id);
  const posts = DB.posts.filter(p=>p.authorType==='company' && p.authorId===c.id);
  const employees = DB.users.filter(u=>u.company===c.name);
  function showTab(tab){
    const box = main.querySelector('#companyTabContent');
    if(tab==='about'){
      box.innerHTML = `<div class="card-panel"><h6>About</h6><p>${escapeHtml(c.desc)}</p>
        <div class="row small text-muted-2 mt-2">
          <div class="col-md-6"><i class="bi bi-globe me-1"></i>${escapeHtml(c.website)}</div>
          <div class="col-md-6"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(c.location)}</div>
          <div class="col-md-6"><i class="bi bi-people me-1"></i>${escapeHtml(c.employees)} employees</div>
          <div class="col-md-6"><i class="bi bi-tags me-1"></i>${escapeHtml(c.industry)}</div>
        </div></div>`;
    }else if(tab==='posts'){
      box.innerHTML = `<div class="d-flex flex-column gap-3">${posts.map(renderPostCard).join('') || emptyState('bi-card-text','No posts yet','')}</div>`;
      wireFeedEvents(box);
    }else if(tab==='jobs'){
      box.innerHTML = `<div class="grid-cards">${jobs.map(renderJobCard).join('') || emptyState('bi-briefcase','No open roles','Check back later.')}</div>`;
      wireCommonNav(box); wireSaveJobButtons(box);
    }else if(tab==='people'){
      box.innerHTML = `<div class="grid-cards">${employees.map(u=>`
        <div class="entity-card"><div class="d-flex gap-2 align-items-center" data-goto-profile="${u.id}" style="cursor:pointer">
          <img src="${u.avatar}" class="entity-avatar-lg" loading="lazy"><div><div class="fw-bold">${escapeHtml(u.name)}</div><div class="text-muted-2 small">${escapeHtml(u.title)}</div></div>
        </div></div>`).join('') || emptyState('bi-people','No listed employees','')}</div>`;
      wireCommonNav(box);
    }
  }
  main.querySelectorAll('[data-ctab]').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      main.querySelectorAll('[data-ctab]').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active'); showTab(tab.dataset.ctab);
    });
  });
  showTab('about');
  main.querySelector('#msgCompanyDetailBtn')?.addEventListener('click', ()=>{
    const recruiter = c.adminIds[0] || employees[0]?.id;
    if(recruiter){ messageUser(recruiter); }
    else toast('No contact available','','info');
  });
}

// ==========================================================================
// COMMUNITIES
// ==========================================================================
function renderCommunitiesPage(){
  const myId = me().id;
  return `
    <div class="page-header"><h4 class="page-title">Communities</h4><button class="btn btn-brand btn-sm" id="createCommunityBtn"><i class="bi bi-plus-lg"></i> Create community</button></div>
    <div class="grid-cards">
      ${DB.communities.map(c=>{
        const joined = c.members.includes(myId);
        return `<div class="entity-card">
          <div data-goto-community="${c.id}" style="cursor:pointer">
            <img src="${c.cover}" style="width:100%;height:100px;object-fit:cover;border-radius:10px" class="mb-2">
            <div class="fw-bold">${escapeHtml(c.name)}</div>
            <div class="text-muted-2 small">${pluralize(c.members.length,'member')}</div>
          </div>
          <button class="btn btn-sm ${joined?'btn-outline-brand':'btn-brand'}" data-join-community="${c.id}">${joined?'Joined':'Join'}</button>
        </div>`;
      }).join('') || emptyState('bi-diagram-3','No communities yet','')}
    </div>
  `;
}
function wireCommunitiesEvents(main){
  main.querySelectorAll('[data-goto-community]').forEach(el=>el.addEventListener('click',()=> location.hash='#/communities/'+el.dataset.gotoCommunity));
  main.querySelectorAll('[data-join-community]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const comm = communityById(btn.dataset.joinCommunity);
      const myId = me().id;
      if(comm.members.includes(myId)) comm.members = comm.members.filter(id=>id!==myId);
      else{ comm.members.push(myId); awardCoins(myId, 'joinCommunity'); }
      saveDB(); router();
    });
  });
  main.querySelector('#createCommunityBtn')?.addEventListener('click', ()=>{
    const {el, modal} = openModalHtml(`
      <div class="modal-header"><h5 class="modal-title">Create community</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <input type="text" class="form-control mb-2" id="commName" placeholder="Community name">
        <textarea class="form-control" id="commDesc" rows="3" placeholder="What is this community about?"></textarea>
      </div>
      <div class="modal-footer"><button class="btn btn-brand w-100" id="createCommBtn">Create</button></div>
    `);
    el.querySelector('#createCommBtn').addEventListener('click', ()=>{
      const name = el.querySelector('#commName').value.trim();
      if(!name){ toast('Add a name','','error'); return; }
      const comm = {id:uid('comm'), name, desc: el.querySelector('#commDesc').value.trim(), cover:coverFor(name+Date.now()), members:[me().id], admins:[me().id], linkedGroupIds:[], createdAt:nowISO()};
      DB.communities.push(comm); saveDB(); modal.hide(); toast('Community created','','success'); location.hash='#/communities/'+comm.id;
    });
  });
}
function renderCommunityDetail(id){
  const c = communityById(id);
  if(!c) return emptyState('bi-diagram-3','Community not found','');
  const joined = c.members.includes(me().id);
  const members = c.members.map(userById).filter(Boolean);
  const linkedGroups = (c.linkedGroupIds||[]).map(convById).filter(Boolean);
  return `
    <div class="card-panel">
      <img src="${c.cover}" style="width:100%;height:150px;object-fit:cover;border-radius:12px" class="mb-2">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div><h4 class="mb-0">${escapeHtml(c.name)}</h4><p class="text-muted-2 mb-0">${pluralize(c.members.length,'member')}</p></div>
        <button class="btn ${joined?'btn-outline-brand':'btn-brand'}" data-join-community="${c.id}">${joined?'Leave community':'Join community'}</button>
      </div>
      <p class="mt-2">${escapeHtml(c.desc)}</p>
    </div>
    ${linkedGroups.length?`<div class="card-panel"><h6>Linked groups</h6>${linkedGroups.map(g=>`<div class="entity-card-row mb-2" data-open-conv-link="${g.id}" style="cursor:pointer"><img src="${g.image}" class="entity-logo-sq"><div class="flex-grow-1 fw-bold">${escapeHtml(g.name)}</div></div>`).join('')}</div>`:''}
    <div class="card-panel">
      <h6>Members</h6>
      <div class="grid-cards">${members.map(u=>`<div class="entity-card-row" data-goto-profile="${u.id}" style="cursor:pointer"><img src="${u.avatar}" class="entity-avatar-lg" style="width:44px;height:44px" loading="lazy"><div class="fw-bold small">${escapeHtml(u.name)} ${c.admins.includes(u.id)?'<span class="badge bg-secondary" style="font-size:.6rem">Admin</span>':''}</div></div>`).join('')}</div>
    </div>
  `;
}
function wireCommunityDetailEvents(main, id){
  wireCommonNav(main);
  main.querySelectorAll('[data-join-community]').forEach(btn=>btn.addEventListener('click', ()=>{
    const comm = communityById(id); const myId = me().id;
    if(comm.members.includes(myId)) comm.members = comm.members.filter(m=>m!==myId); else comm.members.push(myId);
    saveDB(); router();
  }));
  main.querySelectorAll('[data-open-conv-link]').forEach(el=>el.addEventListener('click',()=> location.hash='#/messages/'+el.dataset.openConvLink));
}

// ==========================================================================
// CHANNELS
// ==========================================================================
function renderChannelsPage(){
  const myId = me().id;
  return `
    <div class="page-header"><h4 class="page-title">Channels</h4><button class="btn btn-brand btn-sm" id="createChannelBtn"><i class="bi bi-plus-lg"></i> Create channel</button></div>
    <div class="grid-cards">
      ${DB.channels.map(ch=>{
        const following = ch.followers.includes(myId);
        return `<div class="entity-card">
          <div class="d-flex gap-2 align-items-center" data-goto-channel="${ch.id}" style="cursor:pointer">
            <img src="${ch.image}" class="entity-logo-sq"><div><div class="fw-bold">${escapeHtml(ch.name)}</div><div class="text-muted-2 small">${pluralize(ch.followers.length,'follower')}</div></div>
          </div>
          <p class="small text-muted-2 mb-1">${escapeHtml(ch.desc)}</p>
          <button class="btn btn-sm ${following?'btn-outline-brand':'btn-brand'}" data-follow-channel="${ch.id}">${following?'Following':'Follow'}</button>
        </div>`;
      }).join('') || emptyState('bi-broadcast','No channels yet','')}
    </div>
  `;
}
function wireChannelsEvents(main){
  main.querySelectorAll('[data-goto-channel]').forEach(el=>el.addEventListener('click',()=> location.hash='#/channels/'+el.dataset.gotoChannel));
  main.querySelectorAll('[data-follow-channel]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ch = channelById(btn.dataset.followChannel); const myId = me().id;
      if(ch.followers.includes(myId)) ch.followers = ch.followers.filter(id=>id!==myId); else ch.followers.push(myId);
      saveDB(); router();
    });
  });
  main.querySelector('#createChannelBtn')?.addEventListener('click', ()=>{
    const {el, modal} = openModalHtml(`
      <div class="modal-header"><h5 class="modal-title">Create channel</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <input type="text" class="form-control mb-2" id="chanName" placeholder="Channel name">
        <textarea class="form-control" id="chanDesc" rows="3" placeholder="What will you publish here?"></textarea>
      </div>
      <div class="modal-footer"><button class="btn btn-brand w-100" id="createChanBtn">Create channel</button></div>
    `);
    el.querySelector('#createChanBtn').addEventListener('click', ()=>{
      const name = el.querySelector('#chanName').value.trim();
      if(!name){ toast('Add a name','','error'); return; }
      const ch = {id:uid('chan'), name, desc: el.querySelector('#chanDesc').value.trim(), image:coverFor(name+Date.now()), ownerId:me().id, followers:[me().id], posts:[]};
      DB.channels.push(ch); saveDB(); modal.hide(); toast('Channel created','','success'); location.hash='#/channels/'+ch.id;
    });
  });
}
function renderChannelDetail(id){
  const ch = channelById(id);
  if(!ch) return emptyState('bi-broadcast','Channel not found','');
  const following = ch.followers.includes(me().id);
  const isOwner = ch.ownerId===me().id;
  return `
    <div class="card-panel">
      <div class="d-flex gap-3">
        <img src="${ch.image}" class="entity-logo-sq" style="width:64px;height:64px">
        <div class="flex-grow-1">
          <h4 class="mb-0">${escapeHtml(ch.name)}</h4>
          <p class="text-muted-2 mb-1">${pluralize(ch.followers.length,'follower')}</p>
          <p class="mb-0 small">${escapeHtml(ch.desc)}</p>
        </div>
        <button class="btn ${following?'btn-outline-brand':'btn-brand'}" data-follow-channel="${ch.id}">${following?'Following':'Follow'}</button>
      </div>
    </div>
    ${isOwner ? `<div class="card-panel"><div class="d-flex gap-2"><input type="text" class="form-control" id="channelPostInput" placeholder="Publish an update…"><button class="btn btn-brand" id="channelPostBtn">Publish</button></div></div>` : ''}
    <div class="d-flex flex-column gap-2">
      ${ch.posts.slice().reverse().map(p=>{
        const myReaction = p.reactions[me().id];
        return `<div class="post-card">
          <div class="post-header"><img src="${ch.image}" alt=""><div><div class="post-author">${escapeHtml(ch.name)}</div><div class="post-meta">${timeAgo(p.timestamp)}</div></div></div>
          <div class="post-text">${linkify(p.text)}</div>
          <div class="post-actions"><button class="${myReaction?'liked':''}" data-react-channel-post="${ch.id}|${p.id}"><i class="bi bi-hand-thumbs-up${myReaction?'-fill':''}"></i> Like</button></div>
        </div>`;
      }).join('') || emptyState('bi-broadcast','No updates yet','')}
    </div>
  `;
}
function wireChannelDetailEvents(main, id){
  main.querySelectorAll('[data-follow-channel]').forEach(btn=>btn.addEventListener('click', ()=>{
    const ch = channelById(id); const myId = me().id;
    if(ch.followers.includes(myId)) ch.followers = ch.followers.filter(f=>f!==myId); else ch.followers.push(myId);
    saveDB(); router();
  }));
  main.querySelector('#channelPostBtn')?.addEventListener('click', ()=>{
    const input = main.querySelector('#channelPostInput');
    if(!input.value.trim()) return;
    const ch = channelById(id);
    ch.posts.push({id:uid('cp'), text: input.value.trim(), timestamp:nowISO(), reactions:{}});
    saveDB(); toast('Published','','success'); router();
  });
  main.querySelectorAll('[data-react-channel-post]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const [chId, postId] = btn.dataset.reactChannelPost.split('|');
      const ch = channelById(chId); const p = ch.posts.find(x=>x.id===postId);
      if(p.reactions[me().id]) delete p.reactions[me().id]; else p.reactions[me().id]='like';
      saveDB(); router();
    });
  });
}

// ==========================================================================
// EVENTS
// ==========================================================================
function renderEventsPage(){
  const myId = me().id;
  const upcoming = DB.events.filter(e=>new Date(e.date)>=new Date(Date.now()-86400000)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const past = DB.events.filter(e=>new Date(e.date)<new Date(Date.now()-86400000));
  function card(e){
    const organizer = userById(e.organizerId);
    const going = e.attendees.includes(myId);
    return `<div class="entity-card">
      <div class="fw-bold">${escapeHtml(e.name)}</div>
      <div class="text-muted-2 small"><i class="bi bi-calendar-event me-1"></i>${formatDate(e.date)} · ${escapeHtml(e.time)}</div>
      <div class="text-muted-2 small"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(e.location)}</div>
      <p class="small mb-1">${escapeHtml(e.desc)}</p>
      <div class="d-flex justify-content-between align-items-center">
        <span class="text-muted-2" style="font-size:.75rem">Organized by ${organizer?escapeHtml(organizer.name):'Unknown'} · ${e.attendees.length} attending</span>
      </div>
      <div class="d-flex gap-2 mt-1">
        <button class="btn btn-sm ${going?'btn-outline-brand':'btn-brand'} flex-grow-1" data-toggle-attend="${e.id}">${going?'Leave event':'Join event'}</button>
        <button class="btn btn-sm btn-outline-brand" data-save-event="${e.id}"><i class="bi ${isSaved(myId,'event',e.id)?'bi-bookmark-fill':'bi-bookmark'}"></i></button>
      </div>
    </div>`;
  }
  return `
    <div class="page-header"><h4 class="page-title">Events</h4><button class="btn btn-brand btn-sm" id="createEventBtnPage"><i class="bi bi-plus-lg"></i> Create event</button></div>
    <div class="card-panel"><h6>Upcoming</h6></div>
    <div class="grid-cards">${upcoming.map(card).join('') || emptyState('bi-calendar-event','No upcoming events','Create one to get started.')}</div>
    ${past.length?`<div class="card-panel mt-2"><h6>Past events</h6></div><div class="grid-cards">${past.map(card).join('')}</div>`:''}
  `;
}
function wireEventsEvents(main){
  main.querySelector('#createEventBtnPage')?.addEventListener('click', openCreateEventModal);
  main.querySelectorAll('[data-toggle-attend]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const e = eventById(btn.dataset.toggleAttend); const myId = me().id;
      if(e.attendees.includes(myId)) e.attendees = e.attendees.filter(id=>id!==myId);
      else{ e.attendees.push(myId); awardCoins(myId, 'joinEvent'); }
      saveDB(); router();
    });
  });
  main.querySelectorAll('[data-save-event]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ toggleSave(me().id,'event',btn.dataset.saveEvent); router(); });
  });
}

// ==========================================================================
// NOTIFICATIONS
// ==========================================================================
const NOTIF_ICONS = {
  connection_request:'bi-person-plus', connection_accepted:'bi-person-check', new_follower:'bi-person-heart',
  post_reaction:'bi-hand-thumbs-up', post_comment:'bi-chat', message:'bi-chat-dots', job_recommendation:'bi-briefcase',
  application_update:'bi-file-earmark-check', event:'bi-calendar-event'
};
function renderNotificationsPage(){
  const notifs = DB.notifications.filter(n=>n.userId===me().id).sort((a,b)=>new Date(b.at)-new Date(a.at));
  function group(list, label){
    if(!list.length) return '';
    return `<div class="notif-group-label">${label}</div>` + list.map(n=>`
      <div class="notif-item ${n.read?'':'unread'}" data-open-notif="${n.id}">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--surface-sunken);display:flex;align-items:center;justify-content:center"><i class="bi ${NOTIF_ICONS[n.type]||'bi-bell'}"></i></div>
        <div class="flex-grow-1"><div class="ni-text">${escapeHtml(n.text)}</div><div class="ni-time">${timeAgo(n.at)}</div></div>
      </div>`).join('');
  }
  const today = notifs.filter(n=> (Date.now()-new Date(n.at).getTime()) < 86400000);
  const yesterday = notifs.filter(n=>{ const d=Date.now()-new Date(n.at).getTime(); return d>=86400000 && d<172800000; });
  const earlier = notifs.filter(n=> (Date.now()-new Date(n.at).getTime()) >= 172800000);
  return `
    <div class="page-header"><h4 class="page-title">Notifications</h4></div>
    <div class="card-panel">
      ${notifs.length ? (group(today,'Today')+group(yesterday,'Yesterday')+group(earlier,'Earlier')) : emptyState('bi-bell','No notifications yet','We will let you know when something happens.')}
    </div>
  `;
}
function wireNotificationsEvents(main){
  main.querySelectorAll('[data-open-notif]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const n = DB.notifications.find(x=>x.id===el.dataset.openNotif);
      n.read = true; saveDB();
      if(n.type==='connection_request' || n.type==='connection_accepted' || n.type==='new_follower') location.hash='#/network';
      else if(n.type==='message') location.hash='#/messages/'+n.relatedId;
      else if(n.type==='job_recommendation' || n.type==='application_update') location.hash='#/jobs/'+n.relatedId;
      else if(n.type==='post_reaction' || n.type==='post_comment') location.hash='#/home';
      refreshBadges();
    });
  });
}

// ==========================================================================
// SERVICES
// ==========================================================================
function renderServicesPage(){
  return `
    <div class="page-header"><h4 class="page-title">Professional services</h4><button class="btn btn-brand btn-sm" id="addServiceBtn"><i class="bi bi-plus-lg"></i> Offer a service</button></div>
    <div class="grid-cards">
      ${DB.services.map(s=>{ const u = userById(s.userId); return `
        <div class="entity-card">
          <div class="d-flex gap-2 align-items-center" data-goto-profile="${u.id}" style="cursor:pointer"><img src="${u.avatar}" class="entity-avatar-lg" style="width:44px;height:44px" loading="lazy"><div class="fw-bold small">${escapeHtml(u.name)}</div></div>
          <div class="fw-bold">${escapeHtml(s.title)}</div>
          <p class="small text-muted-2 mb-1">${escapeHtml(s.desc)}</p>
          <div>${s.skills.map(sk=>`<span class="skill-chip">${escapeHtml(sk)}</span>`).join('')}</div>
          <button class="btn btn-outline-brand btn-sm" data-msg-user="${u.id}">Message</button>
        </div>`;
      }).join('') || emptyState('bi-tools','No services listed yet','')}
    </div>
  `;
}
function wireServicesEvents(main){
  wireCommonNav(main);
  main.querySelectorAll('[data-msg-user]').forEach(btn=>btn.addEventListener('click', ()=>{ messageUser(btn.dataset.msgUser); }));
  main.querySelector('#addServiceBtn')?.addEventListener('click', ()=>{
    const {el, modal} = openModalHtml(`
      <div class="modal-header"><h5 class="modal-title">Offer a service</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">
        <input type="text" class="form-control mb-2" id="svcTitle" placeholder="Service title">
        <textarea class="form-control mb-2" id="svcDesc" rows="3" placeholder="Describe what you offer"></textarea>
        <input type="text" class="form-control" id="svcSkills" placeholder="Skills, comma separated">
      </div>
      <div class="modal-footer"><button class="btn btn-brand w-100" id="createSvcBtn">Publish service</button></div>
    `);
    el.querySelector('#createSvcBtn').addEventListener('click', ()=>{
      const title = el.querySelector('#svcTitle').value.trim();
      if(!title){ toast('Add a title','','error'); return; }
      DB.services.push({id:uid('svc'), userId:me().id, title, desc: el.querySelector('#svcDesc').value.trim(), skills: el.querySelector('#svcSkills').value.split(',').map(s=>s.trim()).filter(Boolean)});
      saveDB(); modal.hide(); toast('Service published','','success'); router();
    });
  });
}

// ==========================================================================
// SAVED ITEMS
// ==========================================================================
function renderSavedPage(){
  const saved = DB.savedItems.filter(s=>s.userId===me().id);
  const posts = saved.filter(s=>s.itemType==='post').map(s=>postById(s.itemId)).filter(Boolean);
  const jobs = saved.filter(s=>s.itemType==='job').map(s=>jobById(s.itemId)).filter(Boolean);
  const events = saved.filter(s=>s.itemType==='event').map(s=>eventById(s.itemId)).filter(Boolean);
  const articles = saved.filter(s=>s.itemType==='article').map(s=>DB.articles.find(a=>a.id===s.itemId)).filter(Boolean);
  return `
    <div class="page-header"><h4 class="page-title">Saved items</h4></div>
    ${jobs.length?`<div class="card-panel"><h6>Saved jobs</h6><div class="grid-cards">${jobs.map(renderJobCard).join('')}</div></div>`:''}
    ${events.length?`<div class="card-panel"><h6>Saved events</h6>${events.map(e=>`<div class="entity-card-row mb-2"><div class="flex-grow-1"><div class="fw-bold small">${escapeHtml(e.name)}</div><div class="text-muted-2" style="font-size:.75rem">${formatDate(e.date)}</div></div></div>`).join('')}</div>`:''}
    ${articles.length?`<div class="card-panel"><h6>Saved articles</h6>${articles.map(a=>`<div class="entity-card-row mb-2" data-goto-article="${a.id}" style="cursor:pointer"><img src="${a.cover}" class="entity-logo-sq"><div class="fw-bold small flex-grow-1">${escapeHtml(a.title)}</div></div>`).join('')}</div>`:''}
    ${posts.length?`<div><h6 class="ms-1">Saved posts</h6><div class="d-flex flex-column gap-3">${posts.map(renderPostCard).join('')}</div></div>`:''}
    ${!saved.length ? emptyState('bi-bookmark','Nothing saved yet','Save posts, jobs, and more to find them here later.') : ''}
  `;
}

// ==========================================================================
// PROFILE
// ==========================================================================
function renderProfilePage(userId){
  const u = userById(userId);
  if(!u) return emptyState('bi-person','User not found','');
  const myId = me().id;
  const isMe = userId===myId;

  if(!isMe && !checkPrivacy(u, myId, 'profileVisibility')){
    return `
      <div class="profile-header-card">
        <div class="profile-cover" style="background-image:url('${u.cover}')"></div>
        <div class="profile-info text-center py-4">
          <img src="${u.avatar}" class="profile-avatar" alt="${escapeHtml(u.name)}">
          <div class="profile-name">${escapeHtml(u.name)}</div>
          <div class="empty-state"><i class="bi bi-lock"></i><h6>This profile is private</h6><p>${escapeHtml(u.name)} limits who can view their full profile.</p></div>
        </div>
      </div>`;
  }

  const st = connectionStatus(myId, userId);
  const connCount = connectionCount(userId);
  const followers = followerCount('user', userId);
  const following_ = followingCount(userId);
  const posts = DB.posts.filter(p=>p.authorType!=='company' && p.authorId===userId);
  const articles = DB.articles.filter(a=>a.authorId===userId);
  const blocked = isBlocked(myId, userId);

  return `
    <div class="profile-header-card">
      <div class="profile-cover" style="background-image:url('${u.cover}')"></div>
      <div class="profile-info">
        <img src="${u.avatar}" class="profile-avatar" alt="${escapeHtml(u.name)}">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div class="profile-name">${escapeHtml(u.name)} ${u.verified?'<i class="bi bi-patch-check-fill text-accent" style="font-size:1rem"></i>':''}</div>
            <div class="profile-headline">${escapeHtml(u.headline||'No headline yet')}</div>
            <div class="profile-meta">
              ${u.location?`<span><i class="bi bi-geo-alt"></i> ${escapeHtml(u.location)}</span>`:''}
              ${u.company?`<span><i class="bi bi-building"></i> ${escapeHtml(u.company)}</span>`:''}
            </div>
            <div class="profile-stats">
              <span><b>${connCount}</b> ${connCount===1?'connection':'connections'}</span>
              <span><b>${followers}</b> ${followers===1?'follower':'followers'}</span>
              <span><b>${following_}</b> following</span>
            </div>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            ${isMe ? `<button class="btn btn-brand" id="editProfileBtn"><i class="bi bi-pencil"></i> Edit profile</button>` : `
              <button class="btn ${st==='connected'?'btn-outline-brand':'btn-brand'}" data-connect-btn="${u.id}">${connectLabel(myId,u.id)}</button>
              <button class="btn btn-outline-brand" data-follow-btn="user|${u.id}">${isFollowing(myId,'user',u.id)?'Following':'Follow'}</button>
              <button class="btn btn-outline-brand" data-msg-user="${u.id}"><i class="bi bi-chat"></i> Message</button>
              <div class="dropdown"><button class="btn btn-outline-brand" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></button>
                <ul class="dropdown-menu dropdown-menu-end">
                  <li><a class="dropdown-item" href="#" data-block-profile="${u.id}">${blocked?'Unblock':'Block'} user</a></li>
                  <li><a class="dropdown-item text-danger" href="#" data-report-profile="${u.id}">Report</a></li>
                </ul>
              </div>`}
          </div>
        </div>
      </div>
      <div class="profile-tabs">
        <div class="profile-tab active" data-ptab="about">About</div>
        <div class="profile-tab" data-ptab="posts">Posts (${posts.length})</div>
        <div class="profile-tab" data-ptab="articles">Articles (${articles.length})</div>
        <div class="profile-tab" data-ptab="experience">Experience</div>
        <div class="profile-tab" data-ptab="activity">Activity</div>
      </div>
    </div>
    <div id="profileTabContent" class="mt-3"></div>
  `;
}
function wireProfileEvents(main, userId){
  wireCommonNav(main);
  const u = userById(userId);
  main.querySelectorAll('[data-connect-btn]').forEach(btn=>btn.addEventListener('click', ()=>{ handleConnectClick(userId, btn); }));
  wireFollowButtons(main);
  main.querySelectorAll('[data-msg-user]').forEach(btn=>btn.addEventListener('click', ()=>{ messageUser(userId); }));
  main.querySelector('#editProfileBtn')?.addEventListener('click', openEditProfileModal);
  main.querySelectorAll('[data-block-profile]').forEach(a=>a.addEventListener('click',(e)=>{
    e.preventDefault();
    const nowBlocked = toggleBlock(me().id, userId);
    toast(nowBlocked?'User blocked':'User unblocked','','success'); router();
  }));
  main.querySelectorAll('[data-report-profile]').forEach(a=>a.addEventListener('click',(e)=>{
    e.preventDefault();
    DB.reports.push({id:uid('rep'), reporterId:me().id, itemType:'user', itemId:userId, at:nowISO()});
    saveDB(); toast('Reported','','success');
  }));

  function showTab(tab){
    const box = main.querySelector('#profileTabContent');
    if(!box) return;
    if(tab==='about'){
      const showContact = checkPrivacy(u, me().id, 'contactInfoVisibility');
      box.innerHTML = `<div class="card-panel">
        <h6>About</h6><p>${escapeHtml(u.bio || 'No bio yet.')}</p>
        ${showContact ? `<h6 class="mt-3">Contact info</h6>
          <div class="small text-muted-2">
            ${u.email?`<div><i class="bi bi-envelope me-1"></i> ${escapeHtml(u.email)}</div>`:''}
            ${u.phone?`<div><i class="bi bi-telephone me-1"></i> ${escapeHtml(u.phone)}</div>`:''}
            ${u.website?`<div><i class="bi bi-globe me-1"></i> ${escapeHtml(u.website)}</div>`:''}
            ${!u.email && !u.phone && !u.website ? '<div>No contact info added yet.</div>' : ''}
          </div>` : `<h6 class="mt-3">Contact info</h6><p class="small text-muted-2"><i class="bi bi-lock me-1"></i>${escapeHtml(u.name)} has limited who can see their contact info.</p>`}
        <h6 class="mt-3">Skills</h6>${u.skills.length?u.skills.map(s=>`<span class="skill-chip">${escapeHtml(s)}</span>`).join(''):'<p class="small text-muted-2">No skills added yet.</p>'}
        <h6 class="mt-3">Interests</h6>${u.interests.length?u.interests.map(s=>`<span class="interest-chip">${escapeHtml(s)}</span>`).join(''):'<p class="small text-muted-2">No interests selected.</p>'}
        <h6 class="mt-3">Education</h6>${(u.education||[]).map(ed=>`<div class="timeline-block"><div class="ti-icon"><i class="bi bi-mortarboard"></i></div><div><div class="fw-bold small">${escapeHtml(ed.school)}</div><div class="text-muted-2 small">${escapeHtml(ed.degree)} · ${escapeHtml(ed.year)}</div></div></div>`).join('') || '<p class="small text-muted-2">No education listed.</p>'}
      </div>`;
    }else if(tab==='posts'){
      const posts = DB.posts.filter(p=>p.authorType!=='company' && p.authorId===userId);
      box.innerHTML = `<div class="d-flex flex-column gap-3">${posts.map(renderPostCard).join('') || emptyState('bi-card-text','No posts yet','')}</div>`;
      wireFeedEvents(box);
    }else if(tab==='articles'){
      const articles = DB.articles.filter(a=>a.authorId===userId);
      box.innerHTML = articles.length ? `<div class="article-grid">${articles.map(renderArticleCard).join('')}</div>` : emptyState('bi-file-earmark-text','No articles yet','');
      wireArticlesPageEvents(box);
    }else if(tab==='experience'){
      box.innerHTML = `<div class="card-panel">
        <h6>Experience</h6>
        ${(u.experience||[]).map(ex=>`<div class="timeline-block"><div class="ti-icon"><i class="bi bi-briefcase"></i></div><div><div class="fw-bold small">${escapeHtml(ex.role)}</div><div class="text-muted-2 small">${escapeHtml(ex.org)} · ${escapeHtml(ex.period)}</div><p class="small mt-1">${escapeHtml(ex.desc||'')}</p></div></div>`).join('') || '<p class="small text-muted-2">No experience listed.</p>'}
      </div>`;
    }else if(tab==='activity'){
      if(!checkPrivacy(u, me().id, 'activityVisibility')){
        box.innerHTML = emptyState('bi-lock', 'Activity is private', `${u.name} limits who can view their activity.`);
        return;
      }
      const reacted = DB.posts.filter(p=>p.reactions[userId]).length;
      const commented = DB.posts.filter(p=>p.comments.some(c=>c.authorId===userId)).length;
      box.innerHTML = `<div class="card-panel">
        <div class="row text-center g-3">
          <div class="col-4"><div class="fw-bold fs-4">${DB.posts.filter(p=>p.authorId===userId&&p.authorType!=='company').length}</div><div class="small text-muted-2">Posts</div></div>
          <div class="col-4"><div class="fw-bold fs-4">${reacted}</div><div class="small text-muted-2">Reactions given</div></div>
          <div class="col-4"><div class="fw-bold fs-4">${commented}</div><div class="small text-muted-2">Comments</div></div>
        </div>
      </div>`;
    }
  }
  main.querySelectorAll('[data-ptab]').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      main.querySelectorAll('[data-ptab]').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active'); showTab(tab.dataset.ptab);
    });
  });
  showTab('about');
}

function openTwoStepSetupModal(onConfirm, onCancel){
  const realCode = String(Math.floor(100000 + Math.random()*900000));
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Set up two-step verification</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="small text-muted-2">This is a simulated flow — no real SMS or email is sent. Your code for this demo is shown below.</p>
      <div class="alert alert-secondary text-center fw-bold" style="letter-spacing:.3em; font-size:1.3rem;">${realCode}</div>
      <label class="form-label small">Enter the code to confirm</label>
      <input type="text" class="form-control" id="twoStepCodeInput" maxlength="6" placeholder="6-digit code">
      <div class="invalid-feedback d-block d-none" id="twoStepError">That code doesn't match. Try again.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="confirmTwoStepBtn">Confirm and enable</button></div>
  `);
  let confirmed = false;
  el.querySelector('#confirmTwoStepBtn').addEventListener('click', ()=>{
    const entered = el.querySelector('#twoStepCodeInput').value.trim();
    if(entered !== realCode){
      el.querySelector('#twoStepError').classList.remove('d-none');
      return;
    }
    confirmed = true;
    modal.hide();
    onConfirm();
  });
  el.addEventListener('hidden.bs.modal', ()=>{ if(!confirmed) onCancel?.(); });
}

function applyHighContrastMode(enabled){
  document.documentElement.classList.toggle('high-contrast', !!enabled);
}
function applyReduceMotion(enabled){
  document.documentElement.classList.toggle('reduce-motion', !!enabled);
}

function openEditProfileModal(){
  const u = me();
  const {el, modal} = openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Edit profile</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="text-center mb-3"><img src="${u.avatar}" id="editAvatarPreview" style="width:80px;height:80px;border-radius:50%;object-fit:cover"><br>
        <input type="file" accept="image/*" class="form-control form-control-sm mt-2" id="editAvatarInput"></div>
      <div class="row g-2">
        <div class="col-md-6"><label class="form-label small">Full name</label><input class="form-control" id="editName" value="${escapeHtml(u.name)}"></div>
        <div class="col-md-6"><label class="form-label small">Headline</label><input class="form-control" id="editHeadline" value="${escapeHtml(u.headline||'')}"></div>
        <div class="col-md-6"><label class="form-label small">Company</label><input class="form-control" id="editCompany" value="${escapeHtml(u.company||'')}"></div>
        <div class="col-md-6"><label class="form-label small">Location</label><input class="form-control" id="editLocation" value="${escapeHtml(u.location||'')}"></div>
        <div class="col-md-6"><label class="form-label small">Phone</label><input class="form-control" id="editPhone" value="${escapeHtml(u.phone||'')}"></div>
        <div class="col-md-6"><label class="form-label small">Website</label><input class="form-control" id="editWebsite" value="${escapeHtml(u.website||'')}"></div>
        <div class="col-12"><label class="form-label small">Bio</label><textarea class="form-control" id="editBio" rows="2">${escapeHtml(u.bio||'')}</textarea></div>
        <div class="col-12"><label class="form-label small">Skills (comma separated)</label><input class="form-control" id="editSkills" value="${escapeHtml((u.skills||[]).join(', '))}"></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-brand w-100" id="saveProfileBtn">Save changes</button></div>
  `, 'modal-lg');
  el.querySelector('#editAvatarInput').addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader(); r.onload = ()=>{ el.querySelector('#editAvatarPreview').src = r.result; el.dataset.newAvatar = r.result; };
    r.readAsDataURL(f);
  });
  el.querySelector('#saveProfileBtn').addEventListener('click', ()=>{
    u.name = el.querySelector('#editName').value.trim() || u.name;
    u.headline = el.querySelector('#editHeadline').value.trim();
    u.title = u.headline;
    u.company = el.querySelector('#editCompany').value.trim();
    u.location = el.querySelector('#editLocation').value.trim();
    u.phone = el.querySelector('#editPhone').value.trim();
    u.website = el.querySelector('#editWebsite').value.trim();
    u.bio = el.querySelector('#editBio').value.trim();
    u.skills = el.querySelector('#editSkills').value.split(',').map(s=>s.trim()).filter(Boolean);
    if(el.dataset.newAvatar) u.avatar = el.dataset.newAvatar;
    let earnedTx = null;
    if(u.headline && u.bio && u.location && u.skills.length>0){
      earnedTx = awardCoins(u.id, 'completeProfile');
    }
    saveDB();
    document.getElementById('topbarAvatar').src = u.avatar;
    modal.hide(); toast('Profile updated', earnedTx?`+${earnedTx.amount} LinkCoins for completing your profile!`:'Your changes are visible everywhere your profile appears.', 'success'); router();
  });
}

// ==========================================================================
// SETTINGS
// ==========================================================================
const SETTINGS_SECTIONS = [
  {id:'Account', icon:'bi-person', desc:'Name, email, edit profile'},
  {id:'Wallet & Rewards', icon:'bi-wallet2', desc:'LinkCoins balance, earn, redeem'},
  {id:'Privacy', icon:'bi-shield-lock', desc:'Who can see you and contact you'},
  {id:'Security', icon:'bi-lock', desc:'Password, two-step, sessions'},
  {id:'Notifications', icon:'bi-bell', desc:'Choose what you get notified about'},
  {id:'Messaging', icon:'bi-chat-dots', desc:'Read receipts, last seen, typing'},
  {id:'Chat Folders', icon:'bi-folder2', desc:'Organize your conversations'},
  {id:'Status', icon:'bi-circle', desc:'Who can see your status updates'},
  {id:'Appearance', icon:'bi-palette', desc:'Light or dark theme'},
  {id:'Storage & Data', icon:'bi-hdd', desc:'Usage, export, import, reset'},
  {id:'Accessibility', icon:'bi-universal-access', desc:'High contrast and more'},
  {id:'Power Saving', icon:'bi-battery-charging', desc:'Reduce animation and motion'},
  {id:'Language', icon:'bi-translate', desc:'App display language'},
  {id:'Blocked users', icon:'bi-slash-circle', desc:'Manage blocked accounts'},
  {id:'Help & Support', icon:'bi-question-circle', desc:'FAQs, contact us, policies'},
  {id:'About', icon:'bi-info-circle', desc:'Version and app information'},
];
function renderSettingsPage(){
  return `
    <div class="page-header"><h4 class="page-title">Settings</h4></div>
    <div class="settings-layout" id="settingsLayout">
      <div class="settings-nav" id="settingsNav">
        ${SETTINGS_SECTIONS.map((s,i)=>`
          <button data-settings-tab="${s.id}" class="${i===0?'active':''}">
            <span class="settings-nav-icon"><i class="bi ${s.icon}"></i></span>
            <span class="settings-nav-text">
              <span class="settings-nav-label">${s.id}</span>
              <span class="settings-nav-desc">${s.desc}</span>
            </span>
            <i class="bi bi-chevron-right settings-nav-chevron"></i>
          </button>`).join('')}
      </div>
      <div class="flex-grow-1" id="settingsContent">
        <button class="settings-back-btn" id="settingsBackBtn"><i class="bi bi-chevron-left"></i> Settings</button>
        <div id="settingsContentInner"></div>
      </div>
    </div>
  `;
}
function wireSettingsEvents(main){
  const layout = main.querySelector('#settingsLayout');
  const content = main.querySelector('#settingsContentInner');
  function renderSection(section){
    main.querySelectorAll('[data-settings-tab]').forEach(b=>b.classList.toggle('active', b.dataset.settingsTab===section));
    content.innerHTML = settingsSectionHtml(section);
    wireSettingsSection(section, content);
  }
  main.querySelectorAll('[data-settings-tab]').forEach(btn=>btn.addEventListener('click', ()=>{
    renderSection(btn.dataset.settingsTab);
    layout.classList.add('settings-drilled');
    content.scrollIntoView({behavior:'smooth', block:'start'});
  }));
  main.querySelector('#settingsBackBtn')?.addEventListener('click', ()=> layout.classList.remove('settings-drilled'));

  if(pendingSettingsSection){
    const target = pendingSettingsSection;
    pendingSettingsSection = null;
    renderSection(target);
    layout.classList.add('settings-drilled');
  } else {
    renderSection('Account');
  }
}
function deepMergeDefaults(target, defaults){
  Object.keys(defaults).forEach(key=>{
    if(target[key]===undefined){ target[key] = defaults[key]; }
    else if(typeof defaults[key]==='object' && defaults[key]!==null && !Array.isArray(defaults[key]) && typeof target[key]==='object'){
      deepMergeDefaults(target[key], defaults[key]);
    }
  });
  return target;
}
function ensureUserSettingsDefaults(u){
  u.settings = u.settings || {};
  deepMergeDefaults(u.settings, defaultSettings());
}
function settingsSectionHtml(section){
  const u = me(); ensureUserSettingsDefaults(u); const s = u.settings;
  if(section==='Account'){
    return `<div class="card-panel">
      <h6>Account information</h6>
      <div class="settings-row"><span>Name</span><span class="text-muted-2">${escapeHtml(u.name)}</span></div>
      <div class="settings-row"><span>Username</span><span class="text-muted-2">@${escapeHtml(u.username)}</span></div>
      <div class="settings-row"><span>Email</span><span class="text-muted-2">${escapeHtml(u.email)}</span></div>
      <div class="settings-row"><span>Edit your public profile</span><button class="btn btn-sm btn-outline-brand" id="settingsEditProfileBtn">Edit profile</button></div>
      <div class="settings-row"><span class="text-danger">Delete account</span><button class="btn btn-sm btn-outline-brand text-danger" id="deleteAccountBtn">Delete</button></div>
    </div>`;
  }
  if(section==='Privacy'){
    return `<div class="card-panel">
      <h6>Profile visibility</h6>
      ${privacySelectRow('Who can view your profile','profileVisibility',s.privacy.profileVisibility)}
      ${privacySelectRow('Who can message you','whoCanMessage',s.privacy.whoCanMessage)}
      ${privacySelectRow('Who can send connection requests','whoCanConnect',s.privacy.whoCanConnect)}
      ${privacySelectRow('Who can follow you','whoCanFollow',s.privacy.whoCanFollow)}
      ${privacySelectRow('Who can view your activity','activityVisibility',s.privacy.activityVisibility)}
      ${privacySelectRow('Who can view your contact info','contactInfoVisibility',s.privacy.contactInfoVisibility)}
    </div>`;
  }
  if(section==='Security'){
    return `<div class="card-panel">
      <h6>Security (simulated)</h6>
      <p class="small text-muted-2">This is a frontend prototype — these controls do not connect to a real authentication backend.</p>
      <div class="settings-row"><span>Password</span><button class="btn btn-sm btn-outline-brand" id="changePwBtn">Change password</button></div>
      <div class="settings-row"><span>Two-step verification</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="twoStepToggle" ${s.security.twoStep?'checked':''}></div></div>
      <div class="settings-row" style="align-items:flex-start; flex-direction:column; gap:.5rem;">
        <span class="fw-bold">Active sessions / devices</span>
        <div class="device-row">
          <i class="bi bi-laptop"></i>
          <div class="flex-grow-1">
            <div class="fw-bold small">This device</div>
            <div class="text-muted-2" style="font-size:.76rem">Chrome on Web · Active now</div>
          </div>
          <span class="badge text-bg-light border" style="color:var(--text-color)">This device</span>
        </div>
      </div>
      <div class="settings-row"><span>Log out of all other sessions</span><button class="btn btn-sm btn-outline-brand" id="logoutAllBtn">Log out everywhere</button></div>
    </div>`;
  }
  if(section==='Notifications'){
    const n = s.notifications;
    return `<div class="card-panel"><h6>Notify me about</h6>
      ${Object.keys(n).map(k=>`<div class="settings-row"><span>${escapeHtml(k[0].toUpperCase()+k.slice(1))}</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-notif-toggle="${k}" ${n[k]?'checked':''}></div></div>`).join('')}
    </div>`;
  }
  if(section==='Messaging'){
    const c = s.chat;
    const myConvs = conversationsFor(u.id);
    const disappearingCount = myConvs.filter(cv=>cv.disappearingHours>0).length;
    const lockedCount = myConvs.filter(cv=>cv.locked).length;
    return `<div class="card-panel"><h6>Chat privacy</h6>
      <div class="settings-row"><span>Read receipts</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-chat-toggle="readReceipts" ${c.readReceipts?'checked':''}></div></div>
      <div class="settings-row"><span>Last seen</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-chat-toggle="lastSeen" ${c.lastSeen?'checked':''}></div></div>
      <div class="settings-row"><span>Online status</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-chat-toggle="onlineStatus" ${c.onlineStatus?'checked':''}></div></div>
      <div class="settings-row"><span>Typing indicator</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-chat-toggle="typingIndicator" ${c.typingIndicator?'checked':''}></div></div>
      <div class="settings-row"><span>Disappearing messages</span><span class="text-muted-2 small">${disappearingCount ? `Enabled in ${pluralize(disappearingCount,'chat')}` : 'Off everywhere'}</span></div>
      <div class="settings-row"><span>Chat lock</span><span class="text-muted-2 small">${lockedCount ? `${pluralize(lockedCount,'chat')} locked` : 'Not set up'}</span></div>
      <p class="small text-muted-2 mb-0 mt-1">Set disappearing messages or lock a chat from that conversation's <i class="bi bi-three-dots-vertical"></i> menu in Messages.</p>
    </div>`;
  }
  if(section==='Status'){
    return `<div class="card-panel"><h6>Status privacy</h6>
      <select class="form-select" id="statusPrivacySelect">
        ${['Everyone','Contacts','Selected contacts','Hide from selected users'].map(o=>`<option ${s.statusPrivacy===o?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>`;
  }
  if(section==='Appearance'){
    const theme = document.documentElement.getAttribute('data-theme');
    return `<div class="card-panel"><h6>Theme</h6>
      <div class="btn-group w-100">
        <button class="btn btn-outline-brand ${theme==='light'?'active':''}" data-theme-pick="light">Light</button>
        <button class="btn btn-outline-brand ${theme==='dark'?'active':''}" data-theme-pick="dark">Dark</button>
      </div>
    </div>`;
  }
  if(section==='Storage & Data'){
    return `<div class="card-panel"><h6>Storage & data</h6>
      <div class="settings-row"><span>Local data size</span><span class="text-muted-2">${(JSON.stringify(DB).length/1024).toFixed(1)} KB</span></div>
      <div class="settings-row"><span>Messages</span><span class="text-muted-2">${pluralize(DB.messages.length,'item')}</span></div>
      <div class="settings-row"><span>Posts & articles</span><span class="text-muted-2">${pluralize(DB.posts.length + DB.articles.length,'item')}</span></div>
      <div class="settings-row"><span>Saved items</span><span class="text-muted-2">${pluralize(DB.savedItems.filter(i=>i.userId===u.id).length,'item')}</span></div>
      <div class="settings-row"><span>Clear local cache (keeps account)</span><button class="btn btn-sm btn-outline-brand" id="clearCacheBtn">Clear cache</button></div>
      <div class="settings-row"><span>Export your data as JSON</span><button class="btn btn-sm btn-outline-brand" id="exportDataBtn">Export</button></div>
      <div class="settings-row"><span>Import demo data</span><input type="file" accept="application/json" class="form-control form-control-sm" style="width:auto" id="importDataInput"></div>
      <div class="settings-row"><span class="text-danger">Reset demo data</span><button class="btn btn-sm btn-outline-brand text-danger" id="resetDemoBtn">Reset</button></div>
      <hr class="hairline">
      <h6><i class="bi bi-shield-check me-1"></i>Demo admin panel</h6>
      <p class="small text-muted-2">Frontend-only simulation tools — not connected to any real backend.</p>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-outline-brand" id="seedNotifBtn"><i class="bi bi-bell"></i> Add test notification</button>
        <button class="btn btn-sm btn-outline-brand" id="seedConnReqBtn"><i class="bi bi-person-plus"></i> Simulate connection request</button>
        <button class="btn btn-sm btn-outline-brand" id="seedRandomPostBtn"><i class="bi bi-card-text"></i> Seed a random post</button>
      </div>
    </div>`;
  }
  if(section==='Accessibility'){
    return `<div class="card-panel"><h6>Accessibility</h6>
      <p class="small text-muted-2">LinkApp aims for keyboard navigability, visible focus states, sufficient contrast, and alt text on images throughout the interface. Reduced-motion is respected where supported by your browser/OS settings.</p>
      <div class="settings-row"><span>High contrast mode</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="highContrastToggle" ${s.accessibility.highContrast?'checked':''}></div></div>
    </div>`;
  }
  if(section==='Wallet & Rewards'){
    ensureUserSettingsDefaults(u);
    const wallet = u.settings.wallet;
    return `<div class="card-panel">
      <h6>Your LinkCoins</h6>
      <div class="settings-row"><span>Current balance</span><span class="fw-bold"><i class="bi bi-coin text-warning me-1"></i>${wallet.balance.toLocaleString()}</span></div>
      <div class="settings-row"><span>Lifetime earned</span><span class="text-muted-2">${wallet.lifetimeEarned.toLocaleString()}</span></div>
      <div class="settings-row"><span>Perks redeemed</span><span class="text-muted-2">${wallet.redeemedPerks.length}</span></div>
      <button class="btn btn-brand w-100 mt-2" id="openWalletPageBtn"><i class="bi bi-wallet2 me-1"></i> Open full wallet</button>
    </div>
    <div class="card-panel">
      <button class="wallet-reveal-toggle" id="revealEarningRulesBtn" aria-expanded="false">
        <span><i class="bi bi-question-circle me-2"></i>Curious how earning works?</span>
        <i class="bi bi-chevron-down" id="revealEarningRulesChevron"></i>
      </button>
      <div class="wallet-reveal-content d-none" id="earningRulesContent">
        <p class="small text-muted-2 mt-3">
          LinkCoins aren't handed out for one big checklist — they build up gradually from real activity, and most actions are capped per day so the reward reflects genuine use rather than repetition.
          Up to <strong>${DAILY_EARN_CEILING} LinkCoins</strong> can be earned from repeatable actions in a single day. Here's the exact breakdown, for the curious:
        </p>
        <div class="wallet-earn-list">
          ${Object.entries(POINT_TABLE).map(([key,rule])=>{
            const doneToday = wallet.dailyLog.date===todayStr() ? (wallet.dailyLog.actionCounts[key]||0) : 0;
            const isOneTimeDone = rule.oneTime && wallet.oneTimeAwards.includes(key);
            return `<div class="wallet-earn-row ${isOneTimeDone?'done':''}">
              <span class="settings-nav-icon"><i class="bi ${earnIconFor(key)}"></i></span>
              <span class="settings-nav-text">
                <span class="settings-nav-label">${escapeHtml(rule.label)}</span>
                <span class="settings-nav-desc">${isOneTimeDone ? 'Already earned' : rule.oneTime ? 'One-time reward' : (rule.dailyCap ? `Up to ${rule.dailyCap}/day · ${doneToday}/${rule.dailyCap} today` : 'Awarded each time')}</span>
              </span>
              <span class="wallet-earn-amount">+${rule.amount}</span>
            </div>`;
          }).join('')}
        </div>
        <p class="small text-muted-2 mt-2 mb-0">Messages sent to anyone (not just one person) count toward a daily "stayed active in your conversations" bonus, and spending real time in the app counts toward a separate daily bonus too.</p>
      </div>
    </div>`;
  }
  if(section==='Blocked users'){
    const blocked = DB.blockedUsers.filter(b=>b.userId===me().id).map(b=>userById(b.blockedId)).filter(Boolean);
    return `<div class="card-panel"><h6>Blocked users</h6>
      ${blocked.length ? blocked.map(u=>`
        <div class="entity-card-row mb-2"><img src="${u.avatar}" class="entity-avatar-lg" style="width:40px;height:40px"><div class="flex-grow-1 fw-bold small">${escapeHtml(u.name)}</div><button class="btn btn-sm btn-outline-brand" data-unblock="${u.id}">Unblock</button></div>
      `).join('') : `<p class="small text-muted-2 mb-0">You haven't blocked anyone.</p>`}
    </div>`;
  }
  if(section==='Chat Folders'){
    const folders = s.chatFolders;
    return `<div class="card-panel">
      <h6>Chat folders</h6>
      <p class="small text-muted-2">Group your conversations into folders. Folders appear as tabs at the top of Messages.</p>
      <div class="d-flex gap-2 mb-3">
        <input type="text" class="form-control form-control-sm" id="newFolderInput" placeholder="Folder name, e.g. Work">
        <button class="btn btn-sm btn-brand" id="addFolderBtn">Add</button>
      </div>
      ${folders.length ? folders.map(f=>`
        <div class="settings-row"><span><i class="bi bi-folder2 me-2"></i>${escapeHtml(f.name)}</span>
          <button class="btn btn-sm btn-outline-brand text-danger" data-delete-folder="${f.id}"><i class="bi bi-trash"></i></button>
        </div>`).join('') : `<p class="small text-muted-2 mb-0">No folders yet — create one above.</p>`}
    </div>`;
  }
  if(section==='Power Saving'){
    return `<div class="card-panel"><h6>Power saving</h6>
      <div class="settings-row"><span>Reduce animations & motion</span><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="reduceMotionToggle" ${s.accessibility.reduceMotion?'checked':''}></div></div>
      <p class="small text-muted-2 mb-0">Turns off hover transitions, card lift effects, and image zoom animations across the app — useful on lower-powered devices or if motion bothers you.</p>
    </div>`;
  }
  if(section==='Language'){
    const langs = ['English','French','Spanish','Portuguese','Arabic','Yoruba','Hausa','Igbo'];
    return `<div class="card-panel"><h6>App language</h6>
      <p class="small text-muted-2">Only English is fully supported in this build. Other languages are listed to show how the setting will work once translations are added.</p>
      ${langs.map(l=>`
        <div class="settings-row"><span>${l}</span>
          ${l==='English' ? `<span class="badge bg-primary">${s.language===l?'Selected':''}</span>` : `<span class="text-muted-2 small">Coming soon</span>`}
        </div>`).join('')}
    </div>`;
  }
  if(section==='Help & Support'){
    const faqs = [
      {q:'Is LinkApp a real social network?', a:'No — this is a frontend prototype. All data lives in your browser\'s local storage and nothing is sent to a server.'},
      {q:'What are LinkCoins?', a:'LinkCoins are simulated in-app reward points earned by using the app. They have no real-world monetary value and cannot be exchanged for cash.'},
      {q:'Why did my demo data disappear?', a:'Clearing your browser data, using a private/incognito window, or resetting demo data in Storage & Data will remove your local data.'},
      {q:'Can I use this on my phone?', a:'Yes — the layout adapts to phones and tablets automatically.'},
    ];
    return `<div class="card-panel">
      <h6>Frequently asked questions</h6>
      <div class="accordion" id="faqAccordion">
        ${faqs.map((f,i)=>`
          <div class="accordion-item">
            <h2 class="accordion-header"><button class="accordion-button ${i>0?'collapsed':''}" type="button" data-bs-toggle="collapse" data-bs-target="#faq${i}">${escapeHtml(f.q)}</button></h2>
            <div id="faq${i}" class="accordion-collapse collapse ${i===0?'show':''}" data-bs-parent="#faqAccordion">
              <div class="accordion-body small text-muted-2">${escapeHtml(f.a)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card-panel">
      <h6>Contact us</h6>
      <textarea class="form-control mb-2" id="supportMessageInput" rows="3" placeholder="Describe your question or issue…"></textarea>
      <button class="btn btn-brand btn-sm" id="sendSupportMsgBtn">Send message</button>
    </div>`;
  }
  if(section==='About'){
    return `<div class="card-panel"><h6>About LinkApp</h6>
      <p class="small">LinkApp is a frontend prototype that combines messaging and professional networking in one product.</p>
      <p class="small text-muted-2">This build runs entirely in your browser using LocalStorage. There is no real backend: no real server-side authentication, no real database, no real end-to-end encryption, no real phone or video calling, and no real push notifications or email delivery. All of that is simulated for demonstration purposes.</p>
      <p class="small text-muted-2 mb-0">Version 1.0 · Demo build</p>
    </div>`;
  }
  return '';
}
function privacySelectRow(label,key,val){
  return `<div class="settings-row"><span>${label}</span>
    <select class="form-select form-select-sm" style="width:auto" data-privacy-select="${key}">
      ${['Everyone','Connections','Followers','Only me'].map(o=>`<option ${val===o?'selected':''}>${o}</option>`).join('')}
    </select></div>`;
}
function wireSettingsSection(section, content){
  const u = me();
  content.querySelector('#settingsEditProfileBtn')?.addEventListener('click', openEditProfileModal);
  content.querySelector('#deleteAccountBtn')?.addEventListener('click', ()=>{
    confirmDialog('Delete your account?', 'This removes your account from this demo permanently.', ()=>{
      DB.users = DB.users.filter(x=>x.id!==u.id); saveDB(); logOut(); toast('Account deleted','','info');
    }, 'Delete account');
  });
  content.querySelector('#twoStepToggle')?.addEventListener('change', (e)=>{
    const checkbox = e.target;
    if(checkbox.checked){
      checkbox.checked = false; // don't commit until verified
      openTwoStepSetupModal(()=>{
        u.settings.security.twoStep = true;
        const tx = awardCoins(u.id, 'enableTwoStep');
        saveDB();
        checkbox.checked = true;
        toast('Two-step verification enabled', tx?`+${tx.amount} LinkCoins earned!`:'Your account now requires a verification code at login (simulated).', 'success');
      }, ()=>{ checkbox.checked = false; });
    }else{
      checkbox.checked = true; // hold visual state until confirmed
      confirmDialog('Turn off two-step verification?', 'Your account will only require a password to log in.', ()=>{
        u.settings.security.twoStep = false; saveDB();
        checkbox.checked = false;
        toast('Two-step verification disabled','','info');
      }, 'Turn off');
    }
  });
  content.querySelector('#highContrastToggle')?.addEventListener('change', (e)=>{
    u.settings.accessibility.highContrast = e.target.checked;
    saveDB();
    applyHighContrastMode(e.target.checked);
    toast(e.target.checked?'High contrast enabled':'High contrast disabled', '', 'success');
  });
  content.querySelector('#reduceMotionToggle')?.addEventListener('change', (e)=>{
    u.settings.accessibility.reduceMotion = e.target.checked;
    saveDB();
    applyReduceMotion(e.target.checked);
    toast(e.target.checked?'Reduced motion enabled':'Reduced motion disabled', '', 'success');
  });
  content.querySelector('#openWalletPageBtn')?.addEventListener('click', ()=> location.hash = '#/wallet');
  content.querySelector('#revealEarningRulesBtn')?.addEventListener('click', (e)=>{
    const btn = e.currentTarget;
    const body = content.querySelector('#earningRulesContent');
    const icon = content.querySelector('#revealEarningRulesChevron');
    const nowHidden = body.classList.toggle('d-none');
    const nowOpen = !nowHidden;
    btn.setAttribute('aria-expanded', String(nowOpen));
    icon.classList.toggle('bi-chevron-down', !nowOpen);
    icon.classList.toggle('bi-chevron-up', nowOpen);
  });
  content.querySelector('#addFolderBtn')?.addEventListener('click', ()=>{
    const input = content.querySelector('#newFolderInput');
    const name = input.value.trim();
    if(!name){ toast('Enter a folder name','','error'); return; }
    u.settings.chatFolders.push({id:uid('folder'), name});
    saveDB(); toast('Folder created','','success');
    content.innerHTML = settingsSectionHtml(section); wireSettingsSection(section, content);
  });
  content.querySelectorAll('[data-delete-folder]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      confirmDialog('Delete folder?', 'Conversations in this folder will move back to All.', ()=>{
        u.settings.chatFolders = u.settings.chatFolders.filter(f=>f.id!==btn.dataset.deleteFolder);
        DB.conversations.forEach(c=>{ if(c.folderId===btn.dataset.deleteFolder) delete c.folderId; });
        saveDB(); toast('Folder deleted','','success');
        content.innerHTML = settingsSectionHtml(section); wireSettingsSection(section, content);
      }, 'Delete');
    });
  });
  content.querySelector('#sendSupportMsgBtn')?.addEventListener('click', ()=>{
    const msg = content.querySelector('#supportMessageInput').value.trim();
    if(!msg){ toast('Write a message first','','error'); return; }
    content.querySelector('#supportMessageInput').value='';
    toast('Message sent', 'Simulated — our (fictional) support team will get back to you.', 'success');
  });
  content.querySelectorAll('[data-privacy-select]').forEach(sel=>{
    sel.addEventListener('change', ()=>{ u.settings.privacy[sel.dataset.privacySelect]=sel.value; saveDB(); toast('Settings updated','','success'); });
  });
  content.querySelectorAll('[data-notif-toggle]').forEach(chk=>{
    chk.addEventListener('change', ()=>{ u.settings.notifications[chk.dataset.notifToggle]=chk.checked; saveDB(); toast('Settings updated','','success'); });
  });
  content.querySelectorAll('[data-chat-toggle]').forEach(chk=>{
    chk.addEventListener('change', ()=>{ u.settings.chat[chk.dataset.chatToggle]=chk.checked; saveDB(); toast('Settings updated','','success'); });
  });
  content.querySelector('#statusPrivacySelect')?.addEventListener('change', (e)=>{ u.settings.statusPrivacy=e.target.value; saveDB(); toast('Settings updated','','success'); });
  content.querySelectorAll('[data-theme-pick]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.documentElement.setAttribute('data-theme', btn.dataset.themePick);
      u.settings.theme = btn.dataset.themePick; saveDB();
      document.getElementById('themeToggleBtn').innerHTML = btn.dataset.themePick==='dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
      wireSettingsEvents(document.getElementById('mainContent'));
    });
  });
  content.querySelector('#changePwBtn')?.addEventListener('click', ()=>{
    const {el, modal} = openModalHtml(`
      <div class="modal-header"><h5 class="modal-title">Change password</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body"><input type="password" class="form-control mb-2" id="newPw1" placeholder="New password" minlength="4"><input type="password" class="form-control" id="newPw2" placeholder="Confirm new password"></div>
      <div class="modal-footer"><button class="btn btn-brand w-100" id="savePwBtn">Update password</button></div>
    `);
    el.querySelector('#savePwBtn').addEventListener('click', ()=>{
      const p1 = el.querySelector('#newPw1').value, p2 = el.querySelector('#newPw2').value;
      if(p1.length<4 || p1!==p2){ toast('Passwords do not match', 'Minimum 4 characters and both fields must match.', 'error'); return; }
      u.password = p1; saveDB(); modal.hide(); toast('Password updated','','success');
    });
  });
  content.querySelector('#logoutAllBtn')?.addEventListener('click', ()=>{ toast('Logged out everywhere','Simulated — this session remains active.','info'); });
  content.querySelector('#clearCacheBtn')?.addEventListener('click', ()=>{ toast('Cache cleared','Simulated cache cleared.','success'); });
  content.querySelector('#exportDataBtn')?.addEventListener('click', exportData);
  content.querySelector('#importDataInput')?.addEventListener('change', (e)=>{
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      if(importData(r.result)){ toast('Data imported','Reloading app…','success'); setTimeout(()=>location.reload(), 900); }
      else toast('Import failed','The file is not valid LinkApp data.','error');
    };
    r.readAsText(f);
  });
  content.querySelector('#resetDemoBtn')?.addEventListener('click', ()=>{
    confirmDialog('Reset demo data?', 'This restores the original sample data and logs you out.', ()=>{
      resetDemoData(); toast('Demo data reset','','success'); setTimeout(()=>{ logOut(); }, 600);
    }, 'Reset');
  });
  content.querySelector('#seedNotifBtn')?.addEventListener('click', ()=>{ addNotification(u.id,'message','This is a sample notification.', null); toast('Notification added','','success'); refreshBadges(); });
  content.querySelector('#seedConnReqBtn')?.addEventListener('click', ()=>{
    const other = DB.users.find(x=>x.id!==u.id && connectionStatus(u.id,x.id)==='none');
    if(other){ sendConnectionRequest(other.id, u.id); toast('Simulated request added', `${other.name} "sent" you a request.`, 'success'); refreshBadges(); }
  });
  content.querySelector('#seedRandomPostBtn')?.addEventListener('click', ()=>{
    const others = DB.users.filter(x=>x.id!==u.id);
    const author = others[Math.floor(Math.random()*others.length)] || u;
    const samples = [
      'Just shipped a small but satisfying refactor today. Feels good to clean up old code.',
      'Reminder: consistency beats intensity. Small daily progress adds up fast.',
      'Looking for recommendations on good project management tools for a small team — what do you use?',
      'Coffee, code, repeat ☕️ What does your morning routine look like?',
    ];
    DB.posts.unshift({
      id:uid('post'), authorId:author.id, authorType:'user', text: samples[Math.floor(Math.random()*samples.length)],
      media:null, type:'text', privacy:'Everyone', timestamp:nowISO(), reactions:{}, comments:[], shares:0, poll:null, votedBy:[]
    });
    saveDB(); toast('Sample post added', 'Check your home feed.', 'success');
  });
  content.querySelectorAll('[data-unblock]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      toggleBlock(u.id, btn.dataset.unblock); toast('User unblocked','','success');
      content.innerHTML = settingsSectionHtml(section); wireSettingsSection(section, content);
    });
  });
}

// ==========================================================================
// SEARCH
// ==========================================================================
function searchAll(q){
  const query = q.trim().toLowerCase().replace(/^#/,'');
  if(!query) return {users:[],posts:[],jobs:[],companies:[],communities:[],channels:[],articles:[],events:[]};
  const match = (s)=> (s||'').toLowerCase().includes(query);
  return {
    users: DB.users.filter(u=>match(u.name)||match(u.username)||match(u.headline)||(u.skills||[]).some(match)),
    posts: DB.posts.filter(p=>match(p.text)),
    jobs: DB.jobs.filter(j=>match(j.title)||(j.skills||[]).some(match)),
    companies: DB.companies.filter(c=>match(c.name)||match(c.industry)),
    communities: DB.communities.filter(c=>match(c.name)),
    channels: DB.channels.filter(c=>match(c.name)),
    articles: DB.articles.filter(a=>match(a.title)),
    events: DB.events.filter(e=>match(e.name)),
  };
}
function renderSearchSuggestions(q, box){
  const r = searchAll(q);
  const sections = [
    ['People', r.users.slice(0,4), u=>`<div class="sugg-item" data-goto-profile="${u.id}"><img src="${u.avatar}"><div><div class="fw-bold small">${escapeHtml(u.name)}</div><div class="text-muted-2" style="font-size:.72rem">${escapeHtml(u.headline)}</div></div></div>`],
    ['Jobs', r.jobs.slice(0,3), j=>`<div class="sugg-item" data-goto-job="${j.id}"><i class="bi bi-briefcase"></i><div><div class="fw-bold small">${escapeHtml(j.title)}</div><div class="text-muted-2" style="font-size:.72rem">${escapeHtml(companyById(j.companyId).name)}</div></div></div>`],
    ['Companies', r.companies.slice(0,3), c=>`<div class="sugg-item" data-goto-company="${c.id}"><img src="${c.logo}"><div class="fw-bold small">${escapeHtml(c.name)}</div></div>`],
  ];
  let html = sections.filter(([,items])=>items.length).map(([label,items,tpl])=>`<div class="sugg-cat">${label}</div>${items.map(tpl).join('')}`).join('');
  html += `<div class="sugg-item fw-bold text-accent" data-search-all="${escapeHtml(q)}">See all results for "${escapeHtml(q)}"</div>`;
  box.innerHTML = html || `<div class="p-3 small text-muted-2">No quick matches.</div>`;
  box.classList.remove('d-none');
  wireCommonNav(box);
  box.querySelector('[data-search-all]')?.addEventListener('click', ()=>{ location.hash = '#/search?q='+encodeURIComponent(q); box.classList.add('d-none'); });
}
function renderSearchPage(q){
  const r = searchAll(q);
  const totalCount = Object.values(r).reduce((s,arr)=>s+arr.length,0);
  return `
    <div class="page-header"><h4 class="page-title">Search results for "${escapeHtml(q)}"</h4></div>
    ${totalCount===0 ? emptyState('bi-search','No results found','Try a different search term.') : ''}
    ${r.users.length?`<div class="card-panel"><h6>People</h6><div class="grid-cards">${r.users.map(u=>`
      <div class="entity-card"><div class="d-flex gap-2 align-items-center" data-goto-profile="${u.id}" style="cursor:pointer"><img src="${u.avatar}" class="entity-avatar-lg" loading="lazy"><div><div class="fw-bold">${escapeHtml(u.name)}</div><div class="text-muted-2 small">${escapeHtml(u.headline)}</div></div></div>
      <button class="btn btn-outline-brand btn-sm" data-connect-btn="${u.id}">${connectLabel(me().id,u.id)}</button></div>`).join('')}</div></div>`:''}
    ${r.jobs.length?`<div class="card-panel"><h6>Jobs</h6><div class="grid-cards">${r.jobs.map(renderJobCard).join('')}</div></div>`:''}
    ${r.companies.length?`<div class="card-panel"><h6>Companies</h6><div class="grid-cards">${r.companies.map(renderCompanyCard).join('')}</div></div>`:''}
    ${r.communities.length?`<div class="card-panel"><h6>Communities</h6>${r.communities.map(c=>`<div class="entity-card-row mb-2" data-goto="#/communities/${c.id}" style="cursor:pointer"><img src="${c.cover}" class="entity-logo-sq"><div class="fw-bold small">${escapeHtml(c.name)}</div></div>`).join('')}</div>`:''}
    ${r.channels.length?`<div class="card-panel"><h6>Channels</h6>${r.channels.map(c=>`<div class="entity-card-row mb-2" data-goto="#/channels/${c.id}" style="cursor:pointer"><img src="${c.image}" class="entity-logo-sq"><div class="fw-bold small">${escapeHtml(c.name)}</div></div>`).join('')}</div>`:''}
    ${r.articles.length?`<div class="card-panel"><h6>Articles</h6>${r.articles.map(a=>`<div class="entity-card-row mb-2"><div class="fw-bold small">${escapeHtml(a.title)}</div></div>`).join('')}</div>`:''}
    ${r.events.length?`<div class="card-panel"><h6>Events</h6>${r.events.map(e=>`<div class="entity-card-row mb-2" data-goto="#/events" style="cursor:pointer"><div class="fw-bold small">${escapeHtml(e.name)}</div></div>`).join('')}</div>`:''}
    ${r.posts.length?`<div><h6 class="ms-1">Posts</h6><div class="d-flex flex-column gap-3">${r.posts.map(renderPostCard).join('')}</div></div>`:''}
  `;
}

// ==========================================================================
// BOOT
// ==========================================================================
document.addEventListener('DOMContentLoaded', ()=>{
  if(!DB.users.length) seedDatabase();
  boot();
});

// ==========================================================================
// WALLET / LINKCOINS
// ==========================================================================
function renderWalletPage(tab){
  const u = me();
  ensureUserSettingsDefaults(u);
  const wallet = u.settings.wallet;
  return `
    <div class="wallet-page">
      <div class="wallet-hero">
        <div class="wallet-hero-top">
          <span class="text-muted-2 small">Balance</span>
          <button class="topbar-icon-btn" id="walletHistoryShortcut" title="Transaction history" aria-label="Transaction history"><i class="bi bi-clock-history"></i></button>
        </div>
        <div class="wallet-balance"><i class="bi bi-coin"></i> ${wallet.balance.toLocaleString()} <span class="wallet-balance-unit">LinkCoins</span></div>
        <div class="wallet-index-ticker" id="walletIndexTicker"></div>
        <div class="wallet-quick-actions">
          <button data-wallet-quick="earn"><i class="bi bi-lightning-charge"></i><span>Earn</span></button>
          <button data-wallet-quick="redeem"><i class="bi bi-gift"></i><span>Redeem</span></button>
          <button data-wallet-quick="history"><i class="bi bi-receipt"></i><span>History</span></button>
          <button data-wallet-quick="invite"><i class="bi bi-person-plus"></i><span>Invite</span></button>
        </div>
      </div>
      <div class="wallet-tabbar">
        <button class="${tab==='wallet'?'active':''}" data-wallet-tab="wallet">Wallet</button>
        <button class="${tab==='earn'?'active':''}" data-wallet-tab="earn">Earn</button>
        <button class="${tab==='redeem'?'active':''}" data-wallet-tab="redeem">Redeem</button>
      </div>
      <div id="walletTabContent"></div>
    </div>
  `;
}

function renderWalletTabContent(tab){
  const u = me();
  const wallet = u.settings.wallet;
  if(tab==='earn'){
    const categories = [
      {icon:'bi-card-text', label:'Posting & writing'},
      {icon:'bi-chat-dots', label:'Commenting & messaging'},
      {icon:'bi-briefcase', label:'Applying to jobs'},
      {icon:'bi-book', label:'Reading articles'},
      {icon:'bi-people', label:'Connecting with people'},
      {icon:'bi-calendar-event', label:'Joining communities & events'},
    ];
    return `
      <div class="card-panel wallet-earn-vague">
        <div class="wallet-earn-vague-icon"><i class="bi bi-stars"></i></div>
        <h6 class="text-center" style="padding-left:0;">Keep being active</h6>
        <p class="small text-muted-2 text-center mb-3">
          LinkCoins grow the more you genuinely use LinkApp — there's no fixed checklist to farm.
          Just keep posting, commenting, messaging people, applying to jobs, and reading what others share,
          and your balance will reflect it over time.
        </p>
        <div class="wallet-earn-categories">
          ${categories.map(c=>`<div class="wallet-earn-cat-chip"><i class="bi ${c.icon}"></i><span>${c.label}</span></div>`).join('')}
        </div>
        <p class="small text-muted-2 text-center mt-3 mb-0">
          Curious exactly how it works? There's a detailed breakdown tucked away in
          <a href="#/settings" data-goto-settings-wallet="1">Settings → Wallet &amp; Rewards</a> if you ever want to look.
        </p>
      </div>
    `;
  }
  if(tab==='redeem'){
    return `
      <div class="card-panel">
        <h6>Spend your LinkCoins</h6>
        <p class="small text-muted-2 mb-3">Redeemed perks are simulated for this demo — no real payment is involved.</p>
        <div class="wallet-redeem-grid">
          ${REDEEMABLE_PERKS.map(p=>{
            const affordable = wallet.balance >= p.cost;
            return `<div class="wallet-perk-card">
              <div class="wallet-perk-icon"><i class="bi ${p.icon}"></i></div>
              <div class="fw-bold small">${escapeHtml(p.name)}</div>
              <div class="text-muted-2" style="font-size:.76rem; flex:1;">${escapeHtml(p.desc)}</div>
              <button class="btn btn-sm ${affordable?'btn-brand':'btn-outline-brand'}" data-redeem-perk="${p.id}" ${affordable?'':'disabled'}>
                <i class="bi bi-coin"></i> ${p.cost.toLocaleString()}
              </button>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }
  // default: wallet tab — transaction history
  const txs = wallet.transactions.slice(0,30);
  return `
    <div class="card-panel">
      <h6>Recent activity</h6>
      ${txs.length ? txs.map(tx=>`
        <div class="wallet-tx-row">
          <span class="wallet-tx-icon ${tx.type}"><i class="bi ${tx.type==='earn'?'bi-plus-lg':'bi-dash-lg'}"></i></span>
          <div class="flex-grow-1">
            <div class="fw-bold small">${escapeHtml(tx.label)}</div>
            <div class="text-muted-2" style="font-size:.72rem">${formatDateTime(tx.timestamp)}</div>
          </div>
          <span class="wallet-tx-amount ${tx.type}">${tx.amount>0?'+':''}${tx.amount}</span>
        </div>
      `).join('') : emptyState('bi-receipt','No activity yet','Start posting, connecting, and applying to jobs to earn your first LinkCoins.')}
    </div>
  `;
}

function earnIconFor(key){
  const icons = {
    completeProfile:'bi-person-check', firstPost:'bi-card-text', createPost:'bi-card-text',
    addComment:'bi-chat', reactToPost:'bi-hand-thumbs-up', connectionAccepted:'bi-person-plus',
    publishArticle:'bi-file-earmark-text', applyToJob:'bi-briefcase', joinCommunity:'bi-diagram-3',
    createEvent:'bi-calendar-plus', joinEvent:'bi-calendar-check', createCompany:'bi-building',
    postJob:'bi-briefcase-fill', enableTwoStep:'bi-shield-lock', inviteFriend:'bi-envelope-heart',
    dailyLogin:'bi-calendar2-check',
  };
  return icons[key] || 'bi-coin';
}

function wireWalletEvents(main){
  function showTab(tab){
    activeWalletTab = tab;
    main.querySelectorAll('[data-wallet-tab]').forEach(b=>b.classList.toggle('active', b.dataset.walletTab===tab));
    main.querySelector('#walletTabContent').innerHTML = renderWalletTabContent(tab);
    wireWalletTabContent(main);
  }
  main.querySelectorAll('[data-wallet-tab]').forEach(btn=>btn.addEventListener('click', ()=>showTab(btn.dataset.walletTab)));
  main.querySelectorAll('[data-wallet-quick]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const action = btn.dataset.walletQuick;
      if(action==='history'){ showTab('wallet'); }
      else if(action==='earn'){ showTab('earn'); }
      else if(action==='redeem'){ showTab('redeem'); }
      else if(action==='invite'){ simulateInviteFriend(); }
    });
  });
  main.querySelector('#walletHistoryShortcut')?.addEventListener('click', ()=>showTab('wallet'));
  showTab(activeWalletTab);
  renderWalletTicker(main);
  const tickerInterval = setInterval(()=>{
    if(!document.body.contains(main)) { clearInterval(tickerInterval); return; }
    renderWalletTicker(main);
  }, 8000);
}

function renderWalletTicker(main){
  const el = main.querySelector('#walletIndexTicker');
  if(!el) return;
  const idx = getLinkCoinIndex();
  el.innerHTML = `<span class="text-muted-2">LinkCoin Index (for fun only):</span> ₦${idx.rate} <span class="${idx.up?'text-success':'text-danger'}"><i class="bi ${idx.up?'bi-caret-up-fill':'bi-caret-down-fill'}"></i> ${Math.abs(idx.changePct)}%</span>`;
}

function wireWalletTabContent(main){
  main.querySelectorAll('[data-redeem-perk]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const perk = REDEEMABLE_PERKS.find(p=>p.id===btn.dataset.redeemPerk);
      confirmDialog(`Redeem "${perk.name}"?`, `This will spend ${perk.cost} LinkCoins.`, ()=>{
        const ok = spendCoins(me().id, perk.cost, `Redeemed: ${perk.name}`, perk.id);
        if(ok){ toast('Redeemed!', perk.name, 'success'); applyPerkEffect(perk.id); router(); }
        else toast('Not enough LinkCoins', '', 'error');
      }, 'Redeem');
    });
  });
  main.querySelectorAll('[data-goto-settings-wallet]').forEach(link=>{
    link.addEventListener('click', (e)=>{
      e.preventDefault();
      pendingSettingsSection = 'Wallet & Rewards';
      location.hash = '#/settings';
    });
  });
}

function applyPerkEffect(perkId){
  const u = me();
  u.perks = u.perks || {};
  const now = Date.now();
  if(perkId==='profile_boost') u.perks.profileBoostUntil = now + 24*3600*1000;
  if(perkId==='post_boost') u.perks.nextPostBoost = true;
  if(perkId==='verified_flair') u.perks.verifiedFlairUntil = now + 7*24*3600*1000;
  if(perkId==='gold_frame') u.perks.goldFrame = true;
  if(perkId==='featured_job') u.perks.featureNextJobUntil = now + 24*3600*1000;
  if(perkId==='accent_unlock') u.perks.accentUnlocked = true;
  saveDB();
}

function simulateInviteFriend(){
  openModalHtml(`
    <div class="modal-header"><h5 class="modal-title">Invite a friend</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="small text-muted-2">This is a simulated invite flow — no real message is sent. In a live product this link would be unique to your account.</p>
      <div class="input-group">
        <input type="text" class="form-control" value="https://linkapp.example.com/join?ref=${me().username}" readonly>
        <button class="btn btn-outline-brand" id="copyInviteLinkBtn">Copy</button>
      </div>
    </div>
  `);
  setTimeout(()=>{
    document.getElementById('copyInviteLinkBtn')?.addEventListener('click', ()=>{
      const tx = awardCoins(me().id, 'inviteFriend');
      if(tx) toast('Link copied', `+${tx.amount} LinkCoins for inviting a friend!`, 'success');
      else toast('Link copied', 'You already claimed this one-time reward.', 'info');
      router();
    });
  }, 50);
}
