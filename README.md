# 🌳 树洞信箱

一个卡通可爱的匿名树洞：任何人可以匿名投信，树洞主人（你）能看到全部内容并私密回信 —— **回信只有写信人自己看得到**；写信人可以选择把信公开到广场，经你审核后大家都能看到并回复。

---

## 功能

| 角色 | 能做什么 |
| --- | --- |
| 任何人 | 匿名写信（无需注册）、选心情表情、可选署名、选择是否公开 |
| 写信人 | 凭「取件码」随时找回自己的信，查看**仅自己可见**的站主回信；可随时申请公开 / 收回；**主人一回信，导航栏「📬 我的信箱」会挂红点提醒** |
| 站主（你） | 私密路径登录后台；看全部信件、写私密回信、审核上广场、下架、删除、公开回复 |
| 游客 | 浏览广场公开信、匿名回复 |

**隐私边界**（已写进冒烟测试，防止改代码时回归）：
- 站主的私密回信**永远不会**出现在广场接口返回里
- 隐私信件不会出现在广场
- **写信人没勾选公开的信，站主也强行上架不了**（接口直接返回 400）
- 公开信的 `id` 虽暴露在广场，但**仅凭 id 无法**修改公开状态 —— 必须持有取件码或本机身份

---

## 本地运行

```bash
npm install
cp .env.example .env      # 改掉 ADMIN_PASSWORD 和 ADMIN_PATH
npm start
```

打开 http://localhost:3000 ，后台在 http://localhost:3000/admin/secret

跑一遍全链路自检：

```bash
node scripts/smoke-test.js        # 29 项：写信 / 回信 / 审核 / 权限
node scripts/test-password.js     # 27 项：密码与安全问题（跑在临时库上，不碰你的数据）
```

---

## 目录结构

```
server/index.js      全部 API + 静态托管（单文件，好改）
server/db.js         数据层：SQLite / Postgres 双适配
public/*.html        5 个页面，零构建步骤
public/assets/       样式与公共脚本（树洞插画是内联 SVG，带摇曳/萤火虫动效）
scripts/smoke-test.js 冒烟测试
api/index.js         Vercel Serverless 适配（可选）
render.yaml          Render 蓝图
Dockerfile           容器化
```

---

## 上线（你选 GitHub，那就从 GitHub 出发）

> ⚠️ **关键点：先决定数据库。**
> 默认 SQLite 把数据写在 `data/treehole.db`。Render / Railway / Vercel 这类平台的容器重启后磁盘会重置，**信件会全部消失**。
> 所以正式上线请务必配一个免费 Postgres，把连接串填进 `DATABASE_URL`，代码会自动切换过去，无需改任何代码。

### 0. 免费 Postgres（3 分钟，推荐 Neon）

1. 去 [neon.tech](https://neon.tech) 注册，新建一个 Project
2. 复制连接串，长得像：
   `postgresql://user:xxxx@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`
3. 先留着，下一步要填

（Supabase / Railway Postgres 也完全一样，都是给个 `DATABASE_URL`。）

### 1. 推到 GitHub

```bash
git init
git add .
git commit -m "树洞信箱 v1"
git remote add origin https://github.com/<你的用户名>/treehole-mailbox.git
git push -u origin main
```

`.gitignore` 已经排除了 `data/` 和 `.env`，不会把数据库和密钥传上去。

### 2A. 部署到 Render（推荐，免费额度够用）

1. [render.com](https://render.com) → **New → Blueprint**，选中你刚推的仓库（会自动读 `render.yaml`）
2. 环境变量里手动填三项（Blueprint 里标了 `sync: false`，不会自动带）：
   - `ADMIN_PASSWORD` = 你的后台密码
   - `ADMIN_PATH` = 一串只有你知道的字符，例如 `kitty7788`
   - `DATABASE_URL` = 第 0 步的连接串
3. Deploy，拿到 `https://xxx.onrender.com`

> 免费版 15 分钟无访问会休眠，首次打开要等 30 秒左右。介意的话加一个 UptimeRobot 每 10 分钟 ping 一下 `/index.html`。

### 2B. 部署到 Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Settings → Variables 里加上面三个环境变量
3. Settings → Networking → Generate Domain

### 2C. 部署到自己的服务器（Docker）

```bash
docker build -t treehole .
docker run -d --name treehole \
  -p 3000:3000 \
  -e ADMIN_PASSWORD=你的密码 \
  -e ADMIN_PATH=kitty7788 \
  -e DATABASE_URL=你的连接串 \
  -v /srv/treehole-data:/app/data \
  --restart always \
  treehole
```

挂了 `-v` 卷之后，即使用 SQLite 也不会丢数据。

### 2D. 部署到 Vercel（可选）

```bash
npm i -g vercel
vercel --prod
```

在 Vercel 控制台设置 `ADMIN_PASSWORD` / `ADMIN_PATH` / `DATABASE_URL`。
**Vercel 文件系统只读，不填 `DATABASE_URL` 会丢数据。**

---

## 三个空间，别搞混

| 空间 | 地址 | 谁能进 | 能看到什么 |
| --- | --- | --- | --- |
| 写信 | `/index.html` | 任何人 | 写自己的信，拿取件码 |
| 我的信箱 | `/mine.html` | 凭取件码 | 自己的信 + **只给自己看的**站主回信 |
| 广场 | `/square.html` | 任何人 | 审核通过的公开信 + 公开回复 |
| **主人空间** | `/admin/<ADMIN_PATH>` | 只有你（密码） | **所有人的信，含私密信**；写私密回信、审核、下架 |

`ADMIN_PATH` 默认 `secret`，所以本地是 http://localhost:3000/admin/secret 。
这个地址**故意不在导航栏上**（挂上去等于谁都能点进去）。

### 主人怎么进后台（三选一，换设备也能用）

1. **页脚那枚小树** 🌳 —— 每个页面页脚右侧有一枚很淡的树，鼠标移上去才变清晰，点它进 `/admin`
2. **直接访问 `/admin`** —— 会让你输入「树洞口令」，口令就是 `ADMIN_PATH` 的值
3. 记住完整地址 `/admin/<ADMIN_PATH>` 直接打开

输错口令只会得到一句「这片林子里没有这个树洞哦」，不会泄露口令本身，也有 15 次/10 分钟的限流。

进去登录一次后，导航栏会自动多出「🌳 主人空间」入口，但这个链接**只有已登录的浏览器才渲染** ——
换个设备、换个人打开是看不见的。

## 密码与安全问题（自助管理）

- **第一次登录**，系统会强制你换掉初始密码，并要求设一个安全问题（例如「我养的第一只猫叫什么？」）。
  设完之后，环境变量 `ADMIN_PASSWORD` 就**不再生效**了，密码存在数据库里。
- 之后可以随时在后台右上角 **⚙️ 账号设置** 里改密码、改安全问题（都需要输入当前密码）。
- **忘了密码**：登录页点「🤔 忘记密码？」→ 回答安全问题 → 直接设新密码。
  比对答案时会忽略大小写和空格，不用纠结当初大小写怎么敲的。
- 改密码后，其他设备上的登录状态会立即失效（登录凭证是用密码哈希签名的）。

密码用 `scrypt` 加盐存储，安全问题答案也只存哈希 —— 数据库泄露也看不到明文。

> ⚠️ 安全问题答案无法查看，只能重置。请选一个你绝不会忘、别人又猜不到的。真忘了就只能直接改数据库了。

---

## 上线后必做

1. 用初始密码登录 `https://你的域名/admin/<ADMIN_PATH>`，**立刻完成首次设置**（改密码 + 设安全问题）
2. **不要把这个后台地址分享出去**，它是唯一的入口保护（页面已加 `noindex`）
3. 密码建议 12 位以上
4. 定期备份：Postgres 用平台自带的备份，SQLite 直接拷 `data/treehole.db`

---

## 可调的小参数

| 位置 | 说明 |
| --- | --- |
| `server/index.js` `LIMITS` | 信件 2000 字 / 回复 1000 字 / 署名 24 字 |
| `server/index.js` `MOODS` | 写信时可选的心情表情 |
| `server/index.js` `limit(...)` | 限流：写信 10 次/10 分钟、回复 20 次/10 分钟、登录 10 次/10 分钟 |
| `public/assets/style.css` `:root` | 全部配色变量 |
| `server/index.js` `pickupCode()` | 取件码前缀 `XD-` 与字符集 |

---

## 技术栈

Node.js 18+ · Express 4 · SQLite(better-sqlite3) / Postgres(pg) · 原生 HTML/CSS/JS（无构建步骤，改完刷新即生效）
