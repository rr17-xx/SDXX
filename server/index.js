/**
 * 树洞信箱 - 服务端入口
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./db');

/* ---------------- 环境变量（不引入 dotenv，自己简单解析） ---------------- */
(function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const key = m[1];
    const val = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'treehole2026';
const ADMIN_PATH = process.env.ADMIN_PATH || 'secret';
const IS_PROD = process.env.NODE_ENV === 'production';

const LIMITS = { content: 2000, reply: 1000, nickname: 24 };
const MOODS = ['🌱', '☁️', '🌧️', '🌸', '🌙', '🍀', '🐾', '💛', '🫧', '🔥'];

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

/* ---------------- 工具 ---------------- */
const uid = () => crypto.randomBytes(9).toString('base64url');
const nowISO = () => new Date().toISOString();

// 取件码：去掉易混淆的 0/O/1/I
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function pickupCode() {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `XD-${s}`;
}

function clean(str, max) {
  return String(str == null ? '' : str).replace(/\r\n/g, '\n').trim().slice(0, max);
}

/* ---------------- 口令哈希 ---------------- */
function hashSecret(plain, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(plain), s, 32).toString('hex');
  return `${s}:${h}`;
}
function verifySecret(plain, stored) {
  const [s, h] = String(stored || '').split(':');
  if (!s || !h) return false;
  const calc = crypto.scryptSync(String(plain), s, 32).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(h));
  } catch {
    return false;
  }
}
// 安全问题答案：去掉空格、统一小写，避免「想不起来当初大小写怎么写的」
const normAnswer = (a) => String(a || '').replace(/\s+/g, '').toLowerCase();

/* ---------------- 站主鉴权 ---------------- */
const COOKIE = 'th_admin';
const MIN_PW = 8;

async function getSetting(k) {
  const r = await db.get(`SELECT value FROM settings WHERE key = ?`, [k]);
  return r ? r.value : null;
}
async function setSetting(k, v) {
  await db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [k, v]
  );
}

/** 已设置过自定义密码则返回其哈希，否则回落到环境变量里的初始密码 */
async function storedPwHash() {
  return await getSetting('admin_password_hash');
}
async function verifyPassword(pw) {
  const h = await storedPwHash();
  if (!h) {
    // 还没设置过：用环境变量里的初始密码
    const a = Buffer.from(String(pw));
    const b = Buffer.from(String(ADMIN_PASSWORD));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return verifySecret(pw, h);
}
async function hasSetup() {
  return (await getSetting('setup_done')) === '1';
}

// token 用「当前密码哈希」签名：改密码后旧的登录态自动失效
async function makeToken() {
  const exp = String(Date.now() + 7 * 24 * 3600 * 1000);
  const secret = (await storedPwHash()) || ADMIN_PASSWORD;
  const sig = crypto.createHmac('sha256', secret).update(exp).digest('hex');
  return `${exp}.${sig}`;
}
async function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const exp = token.slice(0, i);
  const sig = token.slice(i + 1);
  const secret = (await storedPwHash()) || ADMIN_PASSWORD;
  const want = crypto.createHmac('sha256', secret).update(exp).digest('hex');
  if (sig.length !== want.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
  } catch {
    return false;
  }
  return Number(exp) > Date.now();
}

// 注意：不能写成 async 中间件，Express 4 捕获不到它的异常
function requireAdmin(req, res, next) {
  verifyToken(req.cookies[COOKIE])
    .then((okv) => {
      if (okv) return next();
      res.status(401).json({ error: '登录已失效，请重新登录' });
    })
    .catch(next);
}

async function setAuthCookie(res) {
  res.cookie(COOKIE, await makeToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

/* ---------------- 简易限流 ---------------- */
const buckets = new Map();
function limit(key, max, windowMs) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const t = Date.now();
    const b = buckets.get(id);
    if (!b || t > b.reset) {
      buckets.set(id, { count: 1, reset: t + windowMs });
      return next();
    }
    if (b.count >= max) {
      return res.status(429).json({ error: '手速太快啦，歇一会儿再来~' });
    }
    b.count++;
    next();
  };
}
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of buckets) if (t > v.reset) buckets.delete(k);
}, 10 * 60 * 1000);

const api = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ================================================================
 *  公开接口
 * ================================================================ */

/** 投信 */
app.post(
  '/api/letters',
  limit('letter', 10, 10 * 60 * 1000),
  api(async (req, res) => {
    const content = clean(req.body.content, LIMITS.content);
    if (!content) return res.status(400).json({ error: '信纸是空的哦，写点什么吧~' });

    let mood = clean(req.body.mood, 8) || '🌱';
    if (!MOODS.includes(mood)) mood = '🌱';
    const nickname = clean(req.body.nickname, LIMITS.nickname);
    const wantPublic = req.body.wantPublic === true ? 1 : 0;

    const id = uid();
    const code = pickupCode();
    const authorKey = crypto.randomBytes(24).toString('base64url');

    await db.run(
      `INSERT INTO letters (id, content, mood, nickname, want_public, status, author_key, pickup_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        content,
        mood,
        nickname,
        wantPublic,
        wantPublic ? 'pending' : 'private',
        authorKey,
        code,
        nowISO(),
      ]
    );

    res.json({ id, pickupCode: code, authorKey });
  })
);

/** 我的信箱：按取件码或本机身份查看，并标记站主回复已读 */
app.get(
  '/api/letters/mine',
  api(async (req, res) => {
    const code = clean(req.query.code, 24).toUpperCase();
    const key = clean(req.query.key, 64);

    let rows = [];
    if (code) {
      const one = await db.get(`SELECT * FROM letters WHERE pickup_code = ?`, [code]);
      rows = one ? [one] : [];
    } else if (key) {
      rows = await db.all(
        `SELECT * FROM letters WHERE author_key = ? ORDER BY created_at DESC`,
        [key]
      );
    } else {
      return res.status(400).json({ error: '缺少取件码' });
    }

    const stamp = nowISO();
    for (const r of rows) {
      if (!r.read_at) await db.run(`UPDATE letters SET read_at = ? WHERE id = ?`, [stamp, r.id]);
    }

    res.json({
      letters: rows.map((r) => ({
        id: r.id,
        content: r.content,
        mood: r.mood,
        nickname: r.nickname,
        status: r.status,
        wantPublic: !!r.want_public,
        pickupCode: r.pickup_code,
        ownerReply: r.owner_reply || '',
        ownerRepliedAt: r.owner_replied_at || null,
        createdAt: r.created_at,
      })),
    });
  })
);

/**
 * 只查「有多少封新回信」，**不会**把信标成已读。
 * （/api/letters/mine 一调用就标已读，所以不能用它来做未读提醒）
 */
app.post(
  '/api/letters/mine/unread',
  limit('unread', 60, 10 * 60 * 1000),
  api(async (req, res) => {
    const raw = Array.isArray(req.body.keys) ? req.body.keys : [];
    const keys = raw
      .map((k) => clean(String(k == null ? '' : k), 64))
      .filter(Boolean)
      .slice(0, 20);
    if (!keys.length) return res.json({ unread: 0 });

    const ph = keys.map(() => '?').join(',');
    const row = await db.get(
      `SELECT COUNT(*) AS c FROM letters
        WHERE author_key IN (${ph})
          AND owner_reply <> ''
          AND (read_at IS NULL OR owner_replied_at > read_at)`,
      keys
    );
    res.json({ unread: Number(row && row.c) || 0 });
  })
);

/** 写信人改公开意愿 */
app.post(
  '/api/letters/mine/visibility',
  limit('vis', 30, 10 * 60 * 1000),
  api(async (req, res) => {
    const code = clean(req.body.code, 24).toUpperCase();
    const key = clean(req.body.key, 64);
    const id = clean(req.body.id, 32);
    const wantPublic = req.body.wantPublic === true;

    // 必须凭取件码或本机身份操作：公开信的 id 会出现在广场，不能只凭 id 授权
    let row = null;
    if (code) {
      row = await db.get(`SELECT * FROM letters WHERE pickup_code = ?`, [code]);
    } else if (id && key) {
      row = await db.get(`SELECT * FROM letters WHERE id = ?`, [id]);
    } else {
      return res.status(400).json({ error: '缺少取件码' });
    }
    if (!row) return res.status(404).json({ error: '找不到这封信' });
    if (id && row.id !== id) return res.status(403).json({ error: '取件码与信件不匹配' });
    if (key && row.author_key !== key) return res.status(403).json({ error: '无权操作' });

    const status = wantPublic ? 'pending' : 'private';
    await db.run(`UPDATE letters SET want_public = ?, status = ? WHERE id = ?`, [
      wantPublic ? 1 : 0,
      status,
      row.id,
    ]);
    res.json({ ok: true, status });
  })
);

/** 广场：已通过审核的公开信 */
app.get(
  '/api/square',
  api(async (req, res) => {
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limitN = Math.min(50, Number(req.query.limit) || 20);
    const rows = await db.all(
      `SELECT l.id, l.content, l.mood, l.nickname, l.created_at,
              (SELECT COUNT(*) FROM replies r WHERE r.letter_id = l.id AND r.hidden = 0) AS reply_count
       FROM letters l
       WHERE l.status = 'approved'
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [limitN, offset]
    );
    const total = await db.get(`SELECT COUNT(*) AS c FROM letters WHERE status = 'approved'`);
    res.json({
      total: total ? Number(total.c) : 0,
      letters: rows.map((r) => ({
        id: r.id,
        content: r.content,
        mood: r.mood,
        nickname: r.nickname,
        createdAt: r.created_at,
        replyCount: Number(r.reply_count),
      })),
    });
  })
);

/** 公开信详情 + 公开回复 */
app.get(
  '/api/letters/:id',
  api(async (req, res) => {
    const id = clean(req.params.id, 32);
    const l = await db.get(`SELECT * FROM letters WHERE id = ? AND status = 'approved'`, [id]);
    if (!l) return res.status(404).json({ error: '这封信还没有公开哦' });

    const replies = await db.all(
      `SELECT id, content, nickname, is_owner, created_at FROM replies
       WHERE letter_id = ? AND hidden = 0 ORDER BY created_at ASC`,
      [id]
    );
    res.json({
      letter: {
        id: l.id,
        content: l.content,
        mood: l.mood,
        nickname: l.nickname,
        createdAt: l.created_at,
      },
      replies: replies.map((r) => ({
        id: r.id,
        content: r.content,
        nickname: r.nickname,
        isOwner: !!r.is_owner,
        createdAt: r.created_at,
      })),
    });
  })
);

/** 广场回复 */
app.post(
  '/api/letters/:id/replies',
  limit('reply', 20, 10 * 60 * 1000),
  api(async (req, res) => {
    const id = clean(req.params.id, 32);
    const content = clean(req.body.content, LIMITS.reply);
    if (!content) return res.status(400).json({ error: '回复不能为空' });

    const l = await db.get(`SELECT id FROM letters WHERE id = ? AND status = 'approved'`, [id]);
    if (!l) return res.status(404).json({ error: '这封信不能回复' });

    const rid = uid();
    await db.run(
      `INSERT INTO replies (id, letter_id, content, nickname, is_owner, hidden, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
      [rid, id, content, clean(req.body.nickname, LIMITS.nickname), nowISO()]
    );
    res.json({ ok: true, id: rid });
  })
);

/* ================================================================
 *  站主后台
 * ================================================================ */

app.post(
  '/api/admin/login',
  limit('login', 10, 10 * 60 * 1000),
  api(async (req, res) => {
    const pw = String(req.body.password || '');
    if (!(await verifyPassword(pw))) return res.status(401).json({ error: '密码不对哦' });
    await setAuthCookie(res);
    res.json({ ok: true, needSetup: !(await hasSetup()) });
  })
);

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

/** 登录态 / 是否需要首次设置 */
app.get(
  '/api/admin/me',
  api(async (req, res) => {
    const okv = await verifyToken(req.cookies[COOKIE]);
    res.json({ ok: okv, needSetup: okv ? !(await hasSetup()) : false });
  })
);

/** 安全问题（忘记密码时用，只返回问题不返回答案） */
app.get(
  '/api/admin/security-question',
  limit('q', 20, 10 * 60 * 1000),
  api(async (req, res) => {
    const q = await getSetting('security_question');
    res.json({ question: q || '', hasQuestion: !!q });
  })
);

/** 忘了密码：答对安全问题就能重置 */
app.post(
  '/api/admin/recover',
  limit('recover', 5, 10 * 60 * 1000),
  api(async (req, res) => {
    const stored = await getSetting('security_answer_hash');
    const q = await getSetting('security_question');
    if (!stored || !q) {
      return res.status(400).json({ error: '还没有设置安全问题，无法找回' });
    }
    if (!verifySecret(normAnswer(req.body.answer), stored)) {
      return res.status(401).json({ error: '答案不对，再想想~' });
    }
    const np = String(req.body.newPassword || '');
    if (np.length < MIN_PW) {
      return res.status(400).json({ error: `新密码至少 ${MIN_PW} 位` });
    }
    await setSetting('admin_password_hash', hashSecret(np));
    await setSetting('setup_done', '1');
    res.json({ ok: true });
  })
);

/** 首次设置：改掉初始密码 + 设安全问题 */
app.post(
  '/api/admin/setup',
  requireAdmin,
  api(async (req, res) => {
    const np = String(req.body.newPassword || '');
    const question = clean(req.body.question, 60);
    const answer = normAnswer(req.body.answer);
    if (np.length < MIN_PW) return res.status(400).json({ error: `密码至少 ${MIN_PW} 位` });
    if (!question) return res.status(400).json({ error: '请填写安全问题' });
    if (!answer) return res.status(400).json({ error: '请填写安全问题的答案' });

    await setSetting('admin_password_hash', hashSecret(np));
    await setSetting('security_question', question);
    await setSetting('security_answer_hash', hashSecret(answer));
    await setSetting('setup_done', '1');
    await setAuthCookie(res); // 签名密钥变了，重新签发
    res.json({ ok: true });
  })
);

/** 修改密码 */
app.post(
  '/api/admin/password',
  requireAdmin,
  api(async (req, res) => {
    const oldPw = String(req.body.oldPassword || '');
    const np = String(req.body.newPassword || '');
    if (!(await verifyPassword(oldPw))) return res.status(401).json({ error: '当前密码不对' });
    if (np.length < MIN_PW) return res.status(400).json({ error: `新密码至少 ${MIN_PW} 位` });
    await setSetting('admin_password_hash', hashSecret(np));
    await setSetting('setup_done', '1');
    await setAuthCookie(res);
    res.json({ ok: true });
  })
);

/** 修改安全问题 */
app.post(
  '/api/admin/question',
  requireAdmin,
  api(async (req, res) => {
    const pw = String(req.body.password || '');
    const question = clean(req.body.question, 60);
    const answer = normAnswer(req.body.answer);
    if (!(await verifyPassword(pw))) return res.status(401).json({ error: '密码不对，无法修改' });
    if (!question) return res.status(400).json({ error: '请填写安全问题' });
    if (!answer) return res.status(400).json({ error: '请填写答案' });
    await setSetting('security_question', question);
    await setSetting('security_answer_hash', hashSecret(answer));
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/overview',
  requireAdmin,
  api(async (req, res) => {
    const stat = async (sql, p = []) => {
      const r = await db.get(sql, p);
      return r ? Number(r.c) : 0;
    };
    res.json({
      total: await stat(`SELECT COUNT(*) AS c FROM letters`),
      pending: await stat(`SELECT COUNT(*) AS c FROM letters WHERE status = 'pending'`),
      approved: await stat(`SELECT COUNT(*) AS c FROM letters WHERE status = 'approved'`),
      private: await stat(`SELECT COUNT(*) AS c FROM letters WHERE status = 'private'`),
      replied: await stat(`SELECT COUNT(*) AS c FROM letters WHERE owner_reply <> ''`),
    });
  })
);

app.get(
  '/api/admin/letters',
  requireAdmin,
  api(async (req, res) => {
    const status = clean(req.query.status, 16);
    let sql = `SELECT * FROM letters`;
    const params = [];
    if (status && status !== 'all') {
      sql += ` WHERE status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const rows = await db.all(sql, params);
    res.json({
      letters: rows.map((r) => ({
        id: r.id,
        content: r.content,
        mood: r.mood,
        nickname: r.nickname,
        status: r.status,
        wantPublic: !!r.want_public,
        pickupCode: r.pickup_code,
        ownerReply: r.owner_reply || '',
        ownerRepliedAt: r.owner_replied_at || null,
        createdAt: r.created_at,
      })),
    });
  })
);

/** 站主回复：privateOnly=false 且信件已公开时，会额外生成一条公开回复 */
app.post(
  '/api/admin/letters/:id/reply',
  requireAdmin,
  api(async (req, res) => {
    const id = clean(req.params.id, 32);
    const content = clean(req.body.content, LIMITS.reply);
    if (!content) return res.status(400).json({ error: '回复不能为空' });

    const l = await db.get(`SELECT * FROM letters WHERE id = ?`, [id]);
    if (!l) return res.status(404).json({ error: '找不到这封信' });

    await db.run(`UPDATE letters SET owner_reply = ?, owner_replied_at = ? WHERE id = ?`, [
      content,
      nowISO(),
      id,
    ]);

    if (req.body.alsoPublic === true && l.status === 'approved') {
      await db.run(
        `INSERT INTO replies (id, letter_id, content, nickname, is_owner, hidden, created_at)
         VALUES (?, ?, ?, '树洞主人', 1, 0, ?)`,
        [uid(), id, content, nowISO()]
      );
    }
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/letters/:id/status',
  requireAdmin,
  api(async (req, res) => {
    const id = clean(req.params.id, 32);
    const status = clean(req.body.status, 16);
    if (!['private', 'pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '状态不合法' });
    }
    // 写信人没有同意公开的信，站主也不能强行上架
    if (status === 'approved') {
      const l = await db.get(`SELECT want_public FROM letters WHERE id = ?`, [id]);
      if (!l) return res.status(404).json({ error: '找不到这封信' });
      if (!l.want_public) {
        return res.status(400).json({ error: '写信人选择不公开，不能上架到广场' });
      }
    }
    await db.run(`UPDATE letters SET status = ? WHERE id = ?`, [status, id]);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/letters/:id',
  requireAdmin,
  api(async (req, res) => {
    const id = clean(req.params.id, 32);
    await db.run(`DELETE FROM replies WHERE letter_id = ?`, [id]);
    await db.run(`DELETE FROM letters WHERE id = ?`, [id]);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/replies/:id',
  requireAdmin,
  api(async (req, res) => {
    await db.run(`UPDATE replies SET hidden = 1 WHERE id = ?`, [clean(req.params.id, 32)]);
    res.json({ ok: true });
  })
);

/* ================================================================
 *  页面
 * ================================================================ */
// 主人入口：不知道私密路径的人点进来，只会看到一个输入框，不会暴露后台是否存在。
// 必须放在 express.static 之前 —— 否则 /admin 会被 extensions:['html'] 匹配到 public/admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'owner.html'));
});

const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { extensions: ['html'], maxAge: IS_PROD ? '1h' : 0 }));

// 校验输入的私密路径。不泄露 ADMIN_PATH 本身，猜错只回一句模糊提示
app.post(
  '/api/admin/check-path',
  limit('path', 15, 10 * 60 * 1000),
  api(async (req, res) => {
    const p = String(req.body.path || '').trim();
    if (!p || p !== ADMIN_PATH) {
      return res.status(404).json({ error: '这片林子里没有这个树洞哦' });
    }
    res.json({ ok: true, path: `/admin/${ADMIN_PATH}` });
  })
);

// 站主后台只有这个私密路径能进
app.get(`/admin/${ADMIN_PATH}`, (req, res) => {
  res.sendFile(path.join(pub, 'admin.html'));
});

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: '服务器开小差了' });
});

/* ---------------- 启动 ---------------- */
async function init() {
  await db.init();
}

module.exports = { app, init };

// 直接 node server/index.js 时启动监听；被 Serverless 引入时不启动
if (require.main === module) {
  init().then(() => {
    app.listen(PORT, () => {
      console.log(`\n  🌳 树洞信箱已运行  ->  http://localhost:${PORT}`);
      console.log(`  🔑 站主后台        ->  http://localhost:${PORT}/admin/${ADMIN_PATH}\n`);
    });
  });
}
