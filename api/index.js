/**
 * Vercel Serverless 适配入口（可选方案）
 * 注意：Vercel 文件系统只读，必须配置 DATABASE_URL（Postgres），否则数据会丢失。
 */
const { app, init } = require('../server/index');

const ready = init();

module.exports = async (req, res) => {
  await ready;
  return app(req, res);
};
