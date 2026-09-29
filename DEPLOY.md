# 上线速查表

## 一、怎么"在线浏览"

| 方式 | 谁能看到 | 怎么做 |
| --- | --- | --- |
| 本地 | 只有这台电脑 | `npm start` → http://localhost:3000 |
| 局域网 | 同一 WiFi 下的手机/电脑 | 访问 `http://<你电脑的内网IP>:3000`（见下） |
| 公网 | 任何人， anywhere | 必须部署（见第二部分） |

**局域网地址**：Windows 上跑 `ipconfig`，找「IPv4 地址」，例如 `10.193.138.159`，
手机浏览器开 `http://10.193.138.159:3000` 即可。

打不开就是 Windows 防火墙拦了。**用管理员身份**打开 PowerShell 跑一次：

```powershell
New-NetFirewallRule -DisplayName "TreeHole 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

> 局域网只能临时给身边人看效果。电脑一关机、WiFi 一换就失效。真要长期在线，看下面。

---

## 二、部署要上传哪些文件

### ✅ 必须传（22 个）

```
package.json            ← 依赖清单，平台靠它装包
package-lock.json       ← 锁定版本，必须一起传
server/index.js         ← 全部后端 API
server/db.js            ← 数据层（SQLite / Postgres 双适配）
public/index.html       ← 首页·写信
public/mine.html        ← 我的信箱·看回信
public/square.html      ← 广场
public/letter.html      ← 公开信详情
public/admin.html       ← 主人空间
public/assets/style.css ← 样式与配色
public/assets/common.js ← 公共脚本与导航
render.yaml             ← Render 蓝图
Dockerfile              ← 服务器自建用
.dockerignore
.gitignore
.env.example            ← 变量说明（不含真实密码）
vercel.json             ← Vercel 用，可删
api/index.js            ← Vercel 用，可删
README.md
scripts/smoke-test.js
scripts/test-password.js
scripts/seed-demo.js    ← 演示数据脚本，可删
```

### ❌ 绝对不能传

```
node_modules/   几百 MB，平台会自己 npm install
data/           本地数据库，含你测试时写的信和改过的密码
.env            真实密码（.gitignore 已排除，但别手动加进去）
```

> `.gitignore` 已经写好这两条，用 git 推就自动忽略了。
> 如果你是用 GitHub 网页手动拖拽上传，**千万别勾 `node_modules` 和 `data`**。

---

## 三、最容易踩的坑：数据库

代码默认用 SQLite 写 `data/treehole.db`。但 **Render / Railway / Vercel 容器一重启磁盘就重置，信件会全部消失**。

所以上线前先拿一个免费 Postgres：

1. [neon.tech](https://neon.tech) 注册 → 新建 Project → 复制连接串
   （形如 `postgresql://user:xxx@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`）
2. 部署时填进环境变量 `DATABASE_URL`
3. 代码自动切到 Postgres，**一行都不用改**

（Supabase、Railway Postgres 同理，都是给一个 `DATABASE_URL`。）

---

## 四、三个环境变量

| 变量 | 填什么 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 你的初始密码 | 首次登录后会强制改掉 |
| `ADMIN_PATH` | 如 `kitty7788` | 后台地址变成 `/admin/kitty7788`，别用默认的 `secret` |
| `DATABASE_URL` | Postgres 连接串 | 不填会丢数据 |

---

## 五、Render 三步上线（最省事）

1. GitHub 建个空仓库，把上面 22 个文件推上去
   ```bash
   git remote add origin https://github.com/<用户名>/treehole.git
   git push -u origin main
   ```
2. [render.com](https://render.com) → **New → Blueprint** → 选这个仓库（自动读 `render.yaml`）
3. 手动填那三个环境变量 → Deploy

拿到 `https://xxx.onrender.com`，就在线了。

> 免费版 15 分钟无人访问会休眠，首次打开要等约 30 秒。
> 介意的话用 UptimeRobot 每 10 分钟 ping 一次 `/index.html` 保活。

---

## 六、上线后第一件事

1. 打开 `https://你的域名/admin` —— 输入你设的 `ADMIN_PATH` 口令 → 进登录页
   （也可以直接开 `https://你的域名/admin/<ADMIN_PATH>`，或点任何页面页脚右侧那枚小树 🌳）
2. 用初始密码登录，**立刻完成首次设置**：换成你自己的密码 + 设安全问题
3. 后台地址别分享出去 —— 它是唯一的入口保护
