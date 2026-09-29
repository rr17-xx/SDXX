/**
 * 全链路冒烟测试：
 * 写信 -> 取件码查信 -> 站主登录 -> 私密回信 -> 写信人看到回信
 *      -> 申请公开 -> 站主审核 -> 广场可见 -> 游客公开回复
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || 'treehole2026';
const ADMIN_PATH = process.env.ADMIN_PATH || 'secret';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

let cookie = '';
async function req(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + path, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of sc) if (c.startsWith('th_admin=')) cookie = c.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

(async () => {
  console.log('\n🌳 树洞信箱冒烟测试 ->', BASE, '\n');

  // 1. 静态页面
  for (const p of ['/index.html', '/mine.html', '/square.html', `/admin/${ADMIN_PATH}`]) {
    const r = await fetch(BASE + p);
    ok(`页面可访问 ${p}`, r.status === 200, `status=${r.status}`);
  }
  const missing = await fetch(BASE + '/admin/secret-wrong-path');
  ok('错误后台路径返回 404', missing.status === 404, `status=${missing.status}`);

  // 2. 匿名写信（私密）
  const a = await req('/api/letters', {
    method: 'POST',
    body: { content: '今天真的好累，想把心事交给树洞。', mood: '🌧️', nickname: '', wantPublic: false },
  });
  ok('写信成功', a.status === 200 && !!a.data.pickupCode, JSON.stringify(a.data));
  const { pickupCode, authorKey, id } = a.data || {};
  ok('返回取件码格式 XD-XXXXXX', /^XD-[A-Z2-9]{6}$/.test(pickupCode || ''), pickupCode);

  // 3. 空内容拦截
  const empty = await req('/api/letters', { method: 'POST', body: { content: '   ' } });
  ok('空信件被拦截', empty.status === 400);

  // 4. 私密信不应出现在广场
  const sq0 = await req('/api/square');
  ok('私密信未出现在广场', !sq0.data.letters.some((l) => l.id === id));

  // 5. 站主未登录不能看
  const noAuth = await req('/api/admin/letters');
  ok('未登录访问后台被拒', noAuth.status === 401);

  // 6. 站主登录
  const badLogin = await req('/api/admin/login', { method: 'POST', body: { password: 'wrong' } });
  ok('错误密码被拒', badLogin.status === 401);
  const login = await req('/api/admin/login', { method: 'POST', body: { password: PW } });
  ok('正确密码登录成功', login.status === 200 && !!cookie);

  // 7. 后台能看到所有信
  const all = await req('/api/admin/letters');
  ok('后台列出全部信件', all.data.letters.length >= 1 && all.data.letters.some((l) => l.id === id));

  // 8. 站主私密回信
  const rep = await req(`/api/admin/letters/${id}/reply`, {
    method: 'POST', body: { content: '辛苦啦，先好好睡一觉。明天会好一点。' },
  });
  ok('站主回信成功', rep.status === 200);

  // 9. 写信人凭取件码看到回信
  const mine = await req(`/api/letters/mine?code=${pickupCode}`);
  const letter = mine.data.letters[0];
  ok('取件码能查到信', !!letter && letter.id === id);
  ok('写信人能看到站主回信', letter.ownerReply.includes('好好睡一觉'));

  // 10. 陌生人拿不到别人的回信（换一个取件码）
  const other = await req('/api/letters/mine?code=XD-ZZZZZZ');
  ok('错误取件码查不到信', other.data.letters.length === 0);

  // 10.5 写信人没同意公开时，站主也不能强行上架
  const force = await req(`/api/admin/letters/${id}/status`, {
    method: 'POST', body: { status: 'approved' },
  });
  ok('站主不能强行上架私密信', force.status === 400, `status=${force.status}`);

  // 11. 申请公开
  const vis = await req('/api/letters/mine/visibility', {
    method: 'POST', body: { code: pickupCode, wantPublic: true },
  });
  ok('申请公开后进入待审核', vis.data.status === 'pending');

  // 12. 仅凭 id 不能改状态（越权防护）
  const hack = await req('/api/letters/mine/visibility', {
    method: 'POST', body: { id, wantPublic: false },
  });
  ok('仅凭 id 改状态被拒', hack.status === 400 || hack.status === 403, `status=${hack.status}`);

  // 13. 站主审核通过
  const appr = await req(`/api/admin/letters/${id}/status`, {
    method: 'POST', body: { status: 'approved' },
  });
  ok('审核通过', appr.status === 200);

  // 14. 广场可见
  const sq = await req('/api/square');
  ok('审核后出现在广场', sq.data.letters.some((l) => l.id === id));

  // 15. 游客公开回复（不带 cookie）
  const saved = cookie; cookie = '';
  const pr = await req(`/api/letters/${id}/replies`, {
    method: 'POST', body: { content: '抱抱你，我也是这样过来的。', nickname: '路过的路人' },
  });
  ok('游客可回复公开信', pr.status === 200);
  cookie = saved;

  // 16. 公开回复里不应泄露站主私密回信
  const detail = await req(`/api/letters/${id}`);
  const allText = JSON.stringify(detail.data);
  ok('广场详情不含站主私密回信', !allText.includes('好好睡一觉'));
  ok('广场详情含游客回复', allText.includes('抱抱你'));

  // 17. 站主同时公开回复
  const pub2 = await req(`/api/admin/letters/${id}/reply`, {
    method: 'POST', body: { content: '这条也要公开给大家看。', alsoPublic: true },
  });
  const d2 = await req(`/api/letters/${id}`);
  ok('站主公开回复出现在广场', JSON.stringify(d2.data).includes('这条也要公开'));

  // 18. 概览统计
  const ov = await req('/api/admin/overview');
  ok('概览统计正常', ov.data.total >= 1 && ov.data.approved >= 1, JSON.stringify(ov.data));

  // 19. 清理
  const del = await req(`/api/admin/letters/${id}`, { method: 'DELETE' });
  ok('删除信件', del.status === 200);
  const after = await req('/api/square');
  ok('删除后消失', !after.data.letters.some((l) => l.id === id));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });
