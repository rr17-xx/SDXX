/**
 * 密码 / 安全问题专项测试
 * 跑在独立的临时数据库上（SQLITE_PATH），不会动你正在预览的那份数据。
 *   node scripts/test-password.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), `treehole-test-${Date.now()}.db`);
const PORT = 3311;
const BASE = `http://localhost:${PORT}`;
const INITIAL_PW = 'initial-pw-1234';

process.env.SQLITE_PATH = TMP;
process.env.PORT = String(PORT);
process.env.ADMIN_PASSWORD = INITIAL_PW;

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
    ...o, headers: h,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  for (const c of sc) if (c.startsWith('th_admin=')) cookie = c.split(';')[0];
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, data: d };
}

(async () => {
  const { app, init } = require('../server/index.js');
  await init();
  const server = app.listen(PORT);
  console.log('\n🔑 密码 / 安全问题测试（临时库）\n');

  // 1. 用初始密码登录，应提示需要首次设置
  let r = await req('/api/admin/login', { method: 'POST', body: { password: INITIAL_PW } });
  ok('初始密码可登录', r.status === 200);
  ok('首次登录提示需要设置', r.data.needSetup === true);

  const me = await req('/api/admin/me');
  ok('登录态有效', me.data.ok === true && me.data.needSetup === true);

  r = await req('/api/admin/security-question');
  ok('未设置时无安全问题', r.data.hasQuestion === false);

  // 2. 首次设置
  r = await req('/api/admin/setup', {
    method: 'POST',
    body: { newPassword: 'short', question: '猫叫什么', answer: '咪咪' },
  });
  ok('密码太短被拒', r.status === 400);

  r = await req('/api/admin/setup', {
    method: 'POST',
    body: { newPassword: 'my-new-password', question: '', answer: '咪咪' },
  });
  ok('空安全问题被拒', r.status === 400);

  r = await req('/api/admin/setup', {
    method: 'POST',
    body: { newPassword: 'my-new-password', question: '我养的第一只猫叫什么？', answer: ' 咪 咪 ' },
  });
  ok('首次设置成功', r.status === 200);

  const q1 = await req('/api/admin/security-question');
  ok('安全问题已保存', q1.data.hasQuestion === true && q1.data.question.includes('猫'));

  me_check: {
    const m = await req('/api/admin/me');
    ok('设置后不再提示首次设置', m.data.needSetup === false);
  }

  // 3. 旧密码失效
  cookie = '';
  r = await req('/api/admin/login', { method: 'POST', body: { password: INITIAL_PW } });
  ok('初始密码已失效', r.status === 401);
  r = await req('/api/admin/login', { method: 'POST', body: { password: 'my-new-password' } });
  ok('新密码可登录', r.status === 200 && r.data.needSetup === false);

  // 4. 修改密码
  r = await req('/api/admin/password', {
    method: 'POST', body: { oldPassword: 'wrong-old', newPassword: 'another-pw-99' },
  });
  ok('旧密码错时不能改密码', r.status === 401);

  r = await req('/api/admin/password', {
    method: 'POST', body: { oldPassword: 'my-new-password', newPassword: 'another-pw-99' },
  });
  ok('修改密码成功', r.status === 200);

  cookie = '';
  r = await req('/api/admin/login', { method: 'POST', body: { password: 'my-new-password' } });
  ok('旧密码登录后失效', r.status === 401);
  r = await req('/api/admin/login', { method: 'POST', body: { password: 'another-pw-99' } });
  ok('改后新密码可登录', r.status === 200);

  // 5. 忘记密码 -> 安全问题找回
  cookie = '';
  r = await req('/api/admin/recover', { method: 'POST', body: { answer: '旺财', newPassword: 'recovered-pw' } });
  ok('答案错误时不能重置', r.status === 401);

  r = await req('/api/admin/recover', { method: 'POST', body: { answer: '咪咪', newPassword: '123' } });
  ok('重置密码太短被拒', r.status === 400);

  r = await req('/api/admin/recover', { method: 'POST', body: { answer: ' 咪 咪 ', newPassword: 'recovered-pw' } });
  ok('答案忽略空格大小写后可重置', r.status === 200);

  cookie = '';
  r = await req('/api/admin/login', { method: 'POST', body: { password: 'another-pw-99' } });
  ok('重置后旧密码失效', r.status === 401);
  r = await req('/api/admin/login', { method: 'POST', body: { password: 'recovered-pw' } });
  ok('重置后新密码可登录', r.status === 200);

  // 6. 修改安全问题
  r = await req('/api/admin/question', {
    method: 'POST', body: { password: 'wrong', question: '小学同桌叫什么？', answer: '小明' },
  });
  ok('密码错时不能改安全问题', r.status === 401);

  r = await req('/api/admin/question', {
    method: 'POST', body: { password: 'recovered-pw', question: '小学同桌叫什么？', answer: '小明' },
  });
  ok('修改安全问题成功', r.status === 200);

  cookie = '';
  r = await req('/api/admin/recover', { method: 'POST', body: { answer: '咪咪', newPassword: 'nope-pw-1' } });
  ok('旧答案已失效', r.status === 401);
  r = await req('/api/admin/recover', { method: 'POST', body: { answer: '小明', newPassword: 'final-pw-2026' } });
  ok('新答案可找回', r.status === 200);
  cookie = '';
  r = await req('/api/admin/login', { method: 'POST', body: { password: 'final-pw-2026' } });
  ok('找回后可用新密码登录', r.status === 200);

  // 7. 未登录不能调用这些接口
  cookie = '';
  r = await req('/api/admin/setup', { method: 'POST', body: { newPassword: 'x12345678', question: 'q', answer: 'a' } });
  ok('未登录不能首次设置', r.status === 401);
  r = await req('/api/admin/password', { method: 'POST', body: { oldPassword: 'final-pw-2026', newPassword: 'x12345678' } });
  ok('未登录不能改密码', r.status === 401);

  server.close();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TMP + ext); } catch {}
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });
