# Toonflow 项目经验总结

## 1. 项目概览

Toonflow 是一个 AI 驱动的短视频/漫画制作平台，核心流程：
**小说文本 → 大纲生成 → 脚本生成 → 分镜生成 → 图片/视频生成**

- **后端**: Node.js + Express.js v5 + TypeScript
- **桌面端**: Electron v40
- **数据库**: SQLite3 (better-sqlite3 + Knex.js)
- **AI 集成**: Vercel AI SDK (@ai-sdk/*)
- **部署**: Docker + Nginx

---

## 2. 使用 new-api 作为 AI 模型网关

### 2.1 兼容性结论

Toonflow **完全兼容** new-api（OpenAI 兼容接口），通过 `manufacturer: "other"` 通道接入。

### 2.2 配置方式

在设置中添加模型时：

```json
{
  "type": "text",
  "manufacturer": "other",
  "model": "claude-sonnet-4-5-20250929",
  "baseUrl": "https://你的new-api地址/v1",
  "apiKey": "sk-你的new-api令牌"
}
```

**关键字段说明：**
- `manufacturer` 必须设为 `"other"` — 走 OpenAI 兼容通道，不校验模型名
- `baseUrl` 指向 new-api 地址，通常以 `/v1` 结尾
- `model` 填 new-api 中配置的模型名，任意名称均可透传

### 2.3 解决 "No object generated: could not parse the response" 错误

**问题根因：**
`"other"` 通道原本配置为 `responseFormat: "schema"`，使用 OpenAI 的 `response_format: { type: "json_schema" }` 结构化输出功能。Claude 等模型通过 OpenAI 兼容接口转发时，不完全支持该特性，导致 Vercel AI SDK 无法解析响应。

**修复方案：**
修改 `src/utils/ai/text/modelList.ts` 中 `"other"` 的配置：

```typescript
// 修改前
{
  manufacturer: "other",
  model: "gpt-4.1",
  responseFormat: "schema",   // 依赖 OpenAI structured output
  ...
}

// 修改后
{
  manufacturer: "other",
  model: "gpt-4.1",
  responseFormat: "object",   // 通过 prompt 引导输出 JSON，兼容性更好
  ...
}
```

**两种 responseFormat 的区别：**
- `"schema"`: 使用 `Output.object({ schema })` 要求模型通过 OpenAI json_schema 规范返回结构化 JSON，兼容性差
- `"object"`: 在 system prompt 中附加 JSON Schema 要求，模型返回文本后用正则提取 JSON，兼容性好

### 2.4 "不支持的模型或厂商" 错误

**问题根因：**
当 `manufacturer` 不是 `"other"` 时，代码按 `model` 名字精确匹配 modelList：

```typescript
// src/utils/ai/text/index.ts
if (manufacturer == "other") {
  owned = modelList.find((m) => m.manufacturer === manufacturer);  // 按厂商匹配
} else {
  owned = modelList.find((m) => m.model === model);  // 按模型名精确匹配
}
```

所以用 `manufacturer: "openai"` + `model: "claude-sonnet-4-6"` 会失败，因为 modelList 里没有这个模型名。

**结论：通过 new-api 使用任意模型，manufacturer 必须设为 `"other"`。**

### 2.5 三种 AI 能力的 "other" 通道

| AI 类型 | 实现文件 | 方式 |
|---------|---------|------|
| 文本生成 | `src/utils/ai/text/index.ts` | `createOpenAI` + 自定义 baseURL |
| 图片生成 | `src/utils/ai/image/owned/other.ts` | `@ai-sdk/openai-compatible` |
| 视频生成 | `src/utils/ai/video/owned/other.ts` | axios + 双 URL（请求URL|查询URL） |

### 2.6 测试接口

- `POST /other/testAI` — 测试文本模型（含 tool calling）
- `POST /other/testImage` — 测试图片模型
- `POST /other/testVideo` — 测试视频模型

---

## 3. Git 仓库管理（Fork 项目）

### 3.1 修改 origin 到 fork 仓库

```bash
git remote set-url origin git@github.com:ming200825/Toonflow-app.git
```

### 3.2 添加上游仓库（同步原仓库更新）

```bash
git remote add upstream https://github.com/HBAI-Ltd/Toonflow-app.git
```

### 3.3 同步上游更新

```bash
git fetch upstream
git merge upstream/master
```

### 3.4 最终 remote 配置

```
origin    git@github.com:ming200825/Toonflow-app.git   (push 自己的 fork)
upstream  https://github.com/HBAI-Ltd/Toonflow-app.git (fetch 原仓库)
```

---

## 4. Docker 部署

### 4.1 代码修改后重新部署

Dockerfile 从 Git 仓库拉取源码编译，不需要修改 Dockerfile，只需：

```bash
git push                              # 推送代码到仓库
yarn docker:build && yarn docker:up   # 重新构建并启动
```

### 4.2 Docker 架构

- 容器内 nginx (80端口) — 服务前端静态文件
- 容器内 Node.js (60000端口) — 后端 API + WebSocket

---

## 5. Nginx 反向代理配置（容器外）

### 5.1 关键问题

Toonflow 后端 60000 端口同时承载 **HTTP** 和 **WebSocket** 两种协议：
- HTTP: Express.js REST API
- WebSocket: 通过 `express-ws` 挂载，使用 HTTP Upgrade 机制

前端配置 `baseURL: "https://toon.vipcode.cc/api"`，HTTP 请求带 `/api` 前缀，
但 **WebSocket 连接路径不带 `/api` 前缀**（如 `wss://toon.vipcode.cc/outline/agentsOutline`）。

### 5.2 WebSocket 端点清单

项目中有 2 个 WebSocket 路由：
- `/outline/agentsOutline` — 大纲智能体对话
- `/storyboard/chatStoryboard` — 分镜智能体对话

### 5.3 完整 Nginx 配置（前端在容器外）

```nginx
server {
    listen 80;
    # listen 443 ssl;
    server_name toon.vipcode.cc;
    root /var/opt/Toonflow-app/dist;
    index index.html index.htm;

    # --- SSL 证书配置（按需启用）---
    # ssl_certificate      /path/to/fullchain.pem;
    # ssl_certificate_key  /path/to/privkey.pem;
    # ssl_protocols TLSv1.2 TLSv1.3;

    # index.html 不缓存（SPA 入口）
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        expires -1;
    }

    # 前端静态资源（SPA 路由）
    location / {
        try_files $uri $uri/ /index.html;
        if ($request_filename ~* .*\.(js|css|png|jpg|jpeg|gif|ico)$ ) {
            expires 30d;
            add_header Cache-Control "public, no-transform";
        }
    }

    # WebSocket - 大纲智能体（路径不带 /api）
    location /outline/agentsOutline {
        proxy_pass http://127.0.0.1:60000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # WebSocket - 分镜对话（路径不带 /api）
    location /storyboard/chatStoryboard {
        proxy_pass http://127.0.0.1:60000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 后端 API（去掉 /api 前缀转发到 60000）
    location /api/ {
        proxy_pass http://127.0.0.1:60000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 安全配置
    location ~ ^/(\.user\.ini|\.htaccess|\.git|\.env|\.svn) {
        return 404;
    }

    access_log /var/log/nginx/toon.vipcode.cc.log;
    error_log /var/log/nginx/toon.vipcode.cc.error.log;
}
```

### 5.4 Nginx WebSocket 代理核心三行

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

这三行让 nginx 支持 HTTP → WebSocket 的 Upgrade 握手。

### 5.5 proxy_pass 尾部斜杠区别

- `proxy_pass http://127.0.0.1:60000/;` — 有尾部 `/`，nginx 会去掉 location 匹配的前缀再转发（`/api/foo` → `/foo`）
- `proxy_pass http://127.0.0.1:60000;` — 无尾部 `/`，保留完整路径原样转发（`/outline/agentsOutline` → `/outline/agentsOutline`）

---

## 6. 项目架构要点速查

### 6.1 文件路由系统

路由文件自动发现：`src/routes/**/*.ts` → URL 路径
例如：`routes/novel/addNovel.ts` → `POST /novel/addNovel`

### 6.2 AI 模型配置存储

数据库表 `t_config`，字段：type, model, apiKey, baseUrl, manufacturer

### 6.3 认证机制

JWT Token，从 `Authorization` header 或 `?token=` query 参数获取
白名单路径：`/other/login`

### 6.4 数据库

SQLite3，17 张表，使用 Knex.js 查询构建器
类型定义自动生成：`src/types/database.d.ts`
