# 在线24点（登录 / 每日十题 / 排行 / 联机）

基于 **Cloudflare Workers + D1 + KV + Durable Objects** 的最小可用实现：

- 用户名+密码登录/注册（Session Cookie，Durable Object 存储）
- 练习模式（可看解答，占位）
- 积分模式：每日十题（完成一轮统一结算，按 PAR 非线性加分）
- 排行榜：总分榜、日榜
- 多人联机：房间 + WebSocket + 简化 Elo 结算（示例）

## 快速开始

1. 安装 wrangler：`npm i -D wrangler typescript`
2. 初始化 D1/KV，填好 `wrangler.toml` 里的 ID
3. 推送表结构：`npm run d1:push`
4. 开发：`npm run dev`
5. 部署：`npm run deploy`

前端在 `frontend/index.html`，可直接放到同一个域名下（推荐把 HTML 也交给 Worker 返回，或用 Cloudflare Pages 静态托管）。

> 每日十题的生成目前用 **固定种子+简化 PAR** 的示例逻辑。你可以把已有“难度评估 + par 计算”替换 `generateDailySet` 即可。
