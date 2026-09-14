/* ==========================================================================
   ui.js — shared UI helpers (toasts, formatting, small widgets)
   ========================================================================== */
function escapeHtml(str){
  if(str==null) return '';
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function linkify(text){
  let safe = escapeHtml(text);
  safe = safe.replace(/#(\w+)/g, '<span class="tag" data-hashtag="$1">#$1</span>');
  safe = safe.replace(/@(\w[\w.]*)/g, '<span class="mention" data-mention="$1">@$1</span>');
  return safe;
}

function timeAgo(iso){
  const diff = (Date.now() - new Date(iso).getTime())/1000;
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff/60)+'m';
  if(diff < 86400) return Math.floor(diff/3600)+'h';
  if(diff < 86400*7) return Math.floor(diff/86400)+'d';
  return new Date(iso).toLocaleDateString(undefined,{month:'short', day:'numeric'});
}
function formatDate(iso){ return new Date(iso).toLocaleDateString(undefined,{month:'short', day:'numeric', year:'numeric'}); }
function formatDateTime(iso){ return new Date(iso).toLocaleString(undefined,{month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}); }

const REACTIONS = {like:'👍', love:'❤️', celebrate:'🎉', support:'🤝', insightful:'💡', funny:'😄'};

function toast(title, body, kind){
  const id = uid('toast');
  const iconMap = {success:'bi-check-circle-fill text-success', error:'bi-exclamation-circle-fill text-danger', info:'bi-info-circle-fill text-accent'};
  const icon = iconMap[kind] || iconMap.info;
  const el = document.createElement('div');
  el.className = 'toast'; el.id = id; el.setAttribute('role','status');
  el.innerHTML = `
    <div class="toast-header">
      <i class="bi ${icon} me-2"></i>
      <strong class="me-auto">${escapeHtml(title)}</strong>
      <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
    </div>
    ${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}
  `;
  document.getElementById('toastContainer').appendChild(el);
  const t = new bootstrap.Toast(el, {delay:3200});
  t.show();
  el.addEventListener('hidden.bs.toast', ()=>el.remove());
}

function initials(name){
  if(!name) return '?';
  return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
}

function confirmDialog(title, message, onConfirm, confirmLabel){
  const id = 'confirmModal';
  let existing = document.getElementById(id);
  if(existing) existing.remove();
  const el = document.createElement('div');
  el.className='modal fade'; el.id=id; el.tabIndex=-1;
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">${escapeHtml(title)}</h5><button class="btn-close" aria-label="Close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><p class="mb-0">${escapeHtml(message)}</p></div>
        <div class="modal-footer">
          <button class="btn btn-outline-brand" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-brand" id="confirmActionBtn">${escapeHtml(confirmLabel||'Confirm')}</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalsRoot').appendChild(el);
  const m = new bootstrap.Modal(el);
  el.querySelector('#confirmActionBtn').addEventListener('click', ()=>{ onConfirm(); m.hide(); });
  el.addEventListener('hidden.bs.modal', ()=>el.remove());
  m.show();
}

function emptyState(icon, title, sub, actionHtml){
  return `<div class="empty-state"><div class="empty-badge"><i class="bi ${icon}"></i></div><h6>${escapeHtml(title)}</h6><p class="mb-2">${escapeHtml(sub||'')}</p>${actionHtml||''}</div>`;
}

function skeletonCards(n, height){
  let html = '';
  for(let i=0;i<(n||3);i++) html += `<div class="skeleton" style="height:${height||90}px; margin-bottom:12px;"></div>`;
  return html;
}

// simple debounce
function debounce(fn, ms){
  let t; return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), ms); };
}

function openModalHtml(html, size){
  const id = uid('modal');
  const el = document.createElement('div');
  el.className='modal fade'; el.id=id; el.tabIndex=-1; el.setAttribute('role','dialog'); el.setAttribute('aria-label','Dialog');
  el.innerHTML = `<div class="modal-dialog modal-dialog-centered ${size||''}"><div class="modal-content">${html}</div></div>`;
  document.getElementById('modalsRoot').appendChild(el);
  const m = new bootstrap.Modal(el);
  el.addEventListener('hidden.bs.modal', ()=>el.remove());
  m.show();
  return {el, modal:m};
}
