/**
 * 塞几条演示数据，方便预览广场 / 后台的效果。
 * 全是假数据，后台一键就能删掉。
 *   node scripts/seed-demo.js
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || 'treehole2026';

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
  await req('/api/admin/login', { method: 'POST', body: { password: PW } });
  if (!cookie) return console.error('登录失败，检查 ADMIN_PASSWORD');

  const demo = [
    {
      content: '今天下班在地铁上，突然就哭了。也不知道为什么，就是觉得好累。\n\n其实也没发生什么大事，就是那种……攒了很久的疲惫，一下子全涌上来了。',
      mood: '🌧️', nickname: '', wantPublic: true,
      replies: [
        { content: '我懂这种感觉，不是因为某一件事，是所有小事叠在一起。抱抱你 🫂', nickname: '路过的鱼' },
        { content: '到站了记得买点好吃的，今天你辛苦了。', nickname: '' },
      ],
      owner: '累的时候不用找原因，先让自己停下来休息一下。你已经在很努力地撑着了。',
    },
    {
      content: '考研倒计时 47 天，昨天模考砸了，现在坐在图书馆一个字都看不进去。\n\n有点想放弃了，但又不甘心。',
      mood: '🔥', nickname: '阿七', wantPublic: true,
      replies: [
        { content: '47 天还很长，一次模考说明不了什么。我去年也是这时候崩的，最后也上岸了，加油 💪', nickname: '上岸的猫' },
      ],
      owner: '',
    },
    {
      content: '喜欢一个人三年了，今天终于决定不说了。就这样吧，祝他好。',
      mood: '🌸', nickname: '', wantPublic: true,
      replies: [],
      owner: '',
    },
    {
      content: '这件事我不想让别人看到，只是想找个地方说出来。\n\n我其实很害怕让别人失望。',
      mood: '🌙', nickname: '', wantPublic: false, replies: [], owner: '',
    },
  ];

  for (const d of demo) {
    const r = await req('/api/letters', {
      method: 'POST',
      body: { content: d.content, mood: d.mood, nickname: d.nickname, wantPublic: d.wantPublic },
    });
    const id = r.data.id;
    // 只有写信人同意公开的才上架
    if (d.wantPublic) {
      await req(`/api/admin/letters/${id}/status`, { method: 'POST', body: { status: 'approved' } });
    }
    for (const rp of d.replies) {
      await req(`/api/letters/${id}/replies`, { method: 'POST', body: rp });
    }
    if (d.owner) {
      await req(`/api/admin/letters/${id}/reply`, { method: 'POST', body: { content: d.owner } });
    }
    console.log('已插入：', id, d.mood, d.wantPublic ? '公开' : '私密');
  }

  console.log('\n演示数据已就绪，去 /square.html 和后台看看效果吧~');
  console.log('不想要了就在后台点「删除」，或者删掉 data/treehole.db 重来。');
})();
