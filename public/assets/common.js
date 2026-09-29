/* ========== 公共脚本 ========== */

/* --- 本机身份：写信后把 authorKey / 取件码存在浏览器里 --- */
const Store = {
  K: 'treehole.keys',
  C: 'treehole.codes',
  _read(k) {
    try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
  },
  _write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v.slice(-50))); } catch {}
  },
  addKey(key) {
    const a = Store._read(Store.K);
    if (key && !a.includes(key)) { a.push(key); Store._write(Store.K, a); }
  },
  keys() { return Store._read(Store.K); },
  addCode(code) {
    const a = Store._read(Store.C);
    if (code && !a.includes(code)) { a.unshift(code); Store._write(Store.C, a); }
  },
  codes() { return Store._read(Store.C); },
};

/* --- 提示条 --- */
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

/* --- 请求 --- */
async function api(url, options = {}) {
  const opt = { headers: {}, credentials: 'same-origin', ...options };
  if (opt.body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(opt.body);
  }
  const res = await fetch(url, opt);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
  return data;
}

/* --- 时间 --- */
function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString('zh-CN');
}

/* --- 安全创建元素（避免 XSS） --- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* --- 背景叶子 --- */
function renderLeaves() {
  const box = document.createElement('div');
  box.className = 'leaves';
  const set = ['🍃', '🌿', '🍂', '🌸', '✨', '🍁'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.className = 'leaf';
    s.textContent = set[i % set.length];
    s.style.left = `${Math.random() * 96}%`;
    s.style.animationDuration = `${12 + Math.random() * 14}s`;
    s.style.animationDelay = `${-Math.random() * 20}s`;
    s.style.fontSize = `${16 + Math.random() * 16}px`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
}

/* --- 顶栏 --- */
const LOGO = `<svg class="logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="lgTrunk" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9a6a46"/><stop offset="0.35" stop-color="#c58f60"/><stop offset="1" stop-color="#85583a"/>
    </linearGradient>
    <radialGradient id="lgHollow" cx="0.5" cy="0.78" r="0.75">
      <stop offset="0" stop-color="#ffe3ad"/><stop offset="0.45" stop-color="#c08a52"/><stop offset="1" stop-color="#402b1d"/>
    </radialGradient>
    <linearGradient id="lgLeaf" x1="0.1" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#b6e8cd"/><stop offset="1" stop-color="#6ec19c"/>
    </linearGradient>
  </defs>
  <ellipse cx="32" cy="58" rx="19" ry="4" fill="#e3cdb2"/>
  <path d="M27 30 C25 40 24 50 24 55 C24 57.2 26.4 58.4 32 58.4 C37.6 58.4 40 57.2 40 55 C40 50 39 40 37 30 Z" fill="url(#lgTrunk)"/>
  <g class="tree-canopy">
    <circle cx="32" cy="19" r="13" fill="#4fa585"/>
    <circle cx="20" cy="27" r="9.5" fill="#4fa585"/>
    <circle cx="44" cy="27" r="9.5" fill="#4fa585"/>
    <circle cx="32" cy="17" r="11" fill="url(#lgLeaf)"/>
    <circle cx="22" cy="25" r="7.5" fill="url(#lgLeaf)"/>
    <circle cx="42" cy="25" r="7.5" fill="url(#lgLeaf)"/>
    <ellipse cx="27" cy="12" rx="6" ry="3.2" fill="#fff" opacity="0.25"/>
  </g>
  <ellipse cx="32" cy="43" rx="9" ry="8" fill="url(#lgHollow)"/>
  <ellipse cx="32" cy="43" rx="9" ry="8" fill="none" stroke="#7a5334" stroke-width="2"/>
  <circle cx="29" cy="41" r="1.6" fill="#fffdf6"/><circle cx="35" cy="41" r="1.6" fill="#fffdf6"/>
  <path d="M29 46.5 q3 2.4 6 0" stroke="#ffd6c4" stroke-width="1.4" fill="none" stroke-linecap="round"/>
</svg>`;

function renderTop(active) {
  const top = document.createElement('div');
  top.className = 'top';
  top.innerHTML = `
    <a class="brand" href="/index.html">
      ${LOGO}
      <span><b>树洞信箱</b><small>把不想说出口的话，交给树洞</small></span>
    </a>
    <nav class="links">
      <a href="/index.html" data-nav="home">✍️ 写信</a>
      <a href="/square.html" data-nav="square">🌳 广场</a>
      <a href="/mine.html" data-nav="mine">📬 我的信箱</a>
    </nav>`;
  document.querySelector('.wrap').prepend(top);
  if (active) {
    const a = top.querySelector(`[data-nav="${active}"]`);
    if (a) a.classList.add('on');
  }

  // 主人自己进过后台后，导航栏才出现「主人空间」入口（没登录过的人看不到）
  addOwnerLink(top.querySelector('nav.links'));
  // 有未读回信时，给「我的信箱」挂个红点，写信人才知道该回来看看
  markUnread(top.querySelector('nav.links'));
}

async function markUnread(nav) {
  if (!nav) return;
  const link = nav.querySelector('[data-nav="mine"]');
  if (!link) return;
  let keys = [];
  try { keys = Store.keys(); } catch { return; }
  if (!keys.length) return;
  try {
    const r = await fetch('/api/letters/mine/unread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
      credentials: 'same-origin',
    });
    const d = await r.json().catch(() => ({}));
    if (!d || !d.unread) return;
    const dot = document.createElement('span');
    dot.className = 'unread-dot';
    dot.textContent = d.unread > 99 ? '99+' : String(d.unread);
    dot.title = '你有新的回信';
    link.classList.add('has-unread');
    link.appendChild(dot);
  } catch {}
}

async function addOwnerLink(nav) {
  if (!nav) return;
  let savedPath = '';
  try { savedPath = localStorage.getItem('treehole.adminPath') || ''; } catch { return; }
  if (!savedPath) return;
  try {
    const r = await fetch('/api/admin/me', { credentials: 'same-origin' });
    const d = await r.json();
    if (!d || !d.ok) return;
    const a = document.createElement('a');
    a.href = savedPath;
    a.textContent = '🌳 主人空间';
    nav.appendChild(a);
  } catch {}
}

function foot(skipOwnerEntry) {
  const f = el('footer', 'foot', '树洞会认真听 · 所有信件默认匿名');
  // 页脚角落一枚很淡的树：主人认得它，路过的人基本不会注意
  if (!skipOwnerEntry) {
    const a = el('a', null, '🌳');
    a.href = '/admin';
    a.title = '树洞主人入口';
    a.setAttribute('aria-label', '树洞主人入口');
    a.style.cssText =
      'margin-left:8px;opacity:.25;text-decoration:none;transition:opacity .25s;filter:grayscale(.3)';
    a.onmouseenter = () => { a.style.opacity = '.9'; a.style.filter = 'none'; };
    a.onmouseleave = () => { a.style.opacity = '.25'; a.style.filter = 'grayscale(.3)'; };
    f.appendChild(a);
  }
  document.querySelector('.wrap').appendChild(f);
}

document.addEventListener('DOMContentLoaded', renderLeaves);
