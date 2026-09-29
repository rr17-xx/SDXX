/**
 * 未读提醒专项测试（跑在临时库 + 独立端口，绝不碰正式数据）
 *   node scripts/test-unread.js
 * 需要先用临时库起服务：
 *   SQLITE_PATH=<tmp> ADMIN_PASSWORD=<pw> PORT=3311 node server/index.js
 */
const BASE = process.env.BASE || 'http://localhost:3311';
const PW = process.env.ADMIN_PASSWORD || 'test-pw-9999';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

let cookie = '';
async function req(p, o = {}) {
  const h = {};
  if (o.body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h['Cookie'] = cookie;
  const r = await fetch(BASE + p, {
    ...o,
    headers: h,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  for (const x of sc) if (x.startsWith('th_admin=')) cookie = x.split(';')[0];
  let d = null;
  try { d = await r.json(); } catch {}
  return { status: r.status, data: d };
}
const unread = async (keys) => req('/api/letters/mine/unread', { method: 'POST', body: { keys } });

(async () => {
  console.log('\n=== 未读提醒测试（临时库）===\n');

  // 1. 访客写信
  const w = await req('/api/letters', {
    method: 'POST',
    body: { content: '未读提醒测试', mood: '🌱', nickname: '', wantPublic: false },
  });
  ok('访客写信成功', w.status === 200 && !!w.data.authorKey);
  const key = w.data.authorKey;
  const id = w.data.id;

  // 2. 主人还没回 -> 0
  ok('未回信时未读为 0', (await unread([key])).data.unread === 0);

  // 3. 登录并回信
  const lg = await req('/api/admin/login', { method: 'POST', body: { password: PW } });
  ok('站主登录', lg.status === 200, JSON.stringify(lg.data));
  const rep = await req(`/api/admin/letters/${id}/reply`, {
    method: 'POST',
    body: { content: '这是给测试者的回信' },
  });
  ok('站主回信成功', rep.status === 200, JSON.stringify(rep.data));

  // 4. 未读变 1
  ok('回信后未读变为 1', (await unread([key])).data.unread === 1);

  // 5. 连续查询不改变状态（关键：这个接口只能读）
  const a = (await unread([key])).data.unread;
  const b = (await unread([key])).data.unread;
  const c = (await unread([key])).data.unread;
  ok('连查 3 次仍为 1（不会误标已读）', a === 1 && b === 1 && c === 1, `${a},${b},${c}`);

  // 6. 访客打开我的信箱 -> 标已读
  await req('/api/letters/mine?key=' + encodeURIComponent(key));
  ok('看过信箱后未读归零', (await unread([key])).data.unread === 0);

  // 7. 主人补充回信 -> 重新变未读
  await req(`/api/admin/letters/${id}/reply`, { method: 'POST', body: { content: '我又补充了一句' } });
  ok('主人更新回信后重新未读', (await unread([key])).data.unread === 1);

  // 8. 别人的 key 看不到未读
  ok('别人的 key 查不到未读', (await unread(['someone-else-key'])).data.unread === 0);

  // 9. 空数组
  ok('空 keys 返回 0', (await unread([])).data.unread === 0);

  // 10. 多个 key 混合
  ok('混合 key 只数自己的', (await unread(['someone-else-key', key])).data.unread === 1);

  // 11. 未登录时接口仍可用（这是访客接口）
  const saved = cookie; cookie = '';
  const anon = await unread([key]);
  ok('未登录也能查未读（访客接口）', anon.status === 200 && anon.data.unread === 1);
  cookie = saved;

  // 12. 不能通过此接口泄露别人的信内容
  ok('返回值只含数量，不含内容', typeof anon.data.unread === 'number' && !anon.data.letters);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
})();
