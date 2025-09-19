# 合并版：保留你的原始前端 + 新增登录/每日十题/排行/联机覆盖层

- `frontend/`：
  - `index.original.html`：你的原始页面
  - `index.html`：**已自动注入** `<script src="./integrate.js">` 的版本（无需改动原 DOM 结构）
  - `integrate.js`：覆盖层脚本，提供 登录/每日十题/排行榜/联机(新) UI
  - `assets/`：保留

- `worker/`：Cloudflare Workers 后端（D1+KV+Durable Objects）
  - 填写 `worker/wrangler.toml` 的 D1/KV ID，然后：
    ```bash
    cd worker
    npm i
    npm run d1:push
    npm run dev
    npm run deploy
    ```

- 前端部署：把 `frontend/` 目录发到任何静态托管（或直接由 Worker 返回），默认会调用同域的 `/api/*` 与 `/ws`。

> 你原本的多人逻辑也可继续使用；这里联机(新) 会走我们在 `worker` 中的 24 点房间骨架。
