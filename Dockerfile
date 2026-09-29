# ---------- 运行阶段 ----------
FROM node:22-slim

WORKDIR /app

# 只装生产依赖
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV ADMIN_PASSWORD=treehole2026
ENV ADMIN_PATH=secret

# 数据目录挂载出来，避免容器重建后信件丢失
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server/index.js"]
