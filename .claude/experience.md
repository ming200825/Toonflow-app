# Toonflow 项目经验总结

## 1. 项目概览

Toonflow 是一个 AI 驱动的短视频/漫画制作平台，核心流程：
**小说文本 → 大纲生成 → 脚本生成 → 分镜生成 → 图片/视频生成**

- **后端**: Node.js + Express.js v5 + TypeScript
- **桌面端**: Electron v40
- **数据库**: SQLite3 (better-sqlite3 + Knex.js)
- **AI 集成**: Vercel AI SDK (@ai-sdk/*)
- **部署**: Docker + Nginx
- **项目性质**: 当前为单用户项目（userId 全部硬编码为 1，无注册功能，密码明文存储）

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
| 视频生成 | `src/utils/ai/video/owned/other.ts` | axios + new-api `/v1/videos` 接口 |

### 2.6 测试接口

- `POST /other/testAI` — 测试文本模型（含 tool calling）
- `POST /other/testImage` — 测试图片模型
- `POST /other/testVideo` — 测试视频模型

---

## 3. new-api 视频接口对接（重要）

### 3.1 正确的接口端点

new-api 视频接口是 `/v1/videos`（不是 `/v1/video/generations`）：

| 操作 | 端点 | 方法 |
|------|------|------|
| 提交任务 | `/v1/videos` | POST |
| 查询状态 | `/v1/videos/{task_id}` | GET |
| 下载视频 | `/v1/videos/{task_id}/content` | GET |

### 3.2 状态值

| 状态 | 含义 |
|------|------|
| `pending` | 等待中 |
| `processing` | 处理中 |
| `completed` | 已完成 |
| `failed` | 失败 |

### 3.3 请求体格式

```json
POST /v1/videos
{
  "model": "veo-3.0-generate-001",
  "prompt": "视频描述文本",
  "duration": 4,
  "image": "首帧图片URL或Base64（可选）",
  "metadata": {
    "durationSeconds": 4,
    "aspectRatio": "16:9",
    "personGeneration": "allow_all",
    "image_tail": "尾帧图片URL或Base64（Kling 首尾帧模式）"
  }
}
```

### 3.4 各模型视频时长控制方式

- **Gemini Veo**: 通过 `metadata.durationSeconds` 传入（支持 4、6、8 秒）
- **Kling**: 通过顶层 `duration` 字段传入
- **通用**: 同时传 `duration` 和 `metadata.durationSeconds` 确保兼容

### 3.5 首尾帧/图生视频传参

- **首帧**: `image` 字段（顶层）
- **尾帧**: `metadata.image_tail`（通过 metadata 传入）
- 只传 `image` = 单图模式（图生视频）
- 两个都传 = 首尾帧模式
- **注意**: Gemini Veo 在 new-api 当前实现中不支持图片输入（adaptor 未实现），Kling 支持

### 3.6 视频下载需要认证

`/v1/videos/{task_id}/content` 返回二进制流，**需要带 Authorization header**。
因此 `other.ts` 内部自行完成下载写文件，返回 null 让 `index.ts` 跳过重复下载。

### 3.7 video/index.ts 中 "other" 的特殊处理

```typescript
// other 厂商跳过 modelList 校验，允许任意模型名透传
if (manufacturer !== "other") {
  const owned = modelList.find((m) => m.model === model);
  if (!owned) throw new Error("不支持的模型");
}

// other 厂商内部已完成下载，直接返回 savePath
if (manufacturer === "other" && videoUrl === null) {
  return input.savePath;
}
```

### 3.8 "contents is required" 错误排查

如果 new-api 返回 `contents is required`：
- 错误来源：`relay/helper/valid_request.go:314` 的 `GetAndValidateGeminiRequest`
- 原因：请求被路由到了 Gemini chat handler 而不是 video task handler
- 排查：确认 new-api 渠道中模型名（如 `veo-3.1-generate-preview`）已添加到 Gemini 渠道的模型列表中
- 验证：用 curl 直接测试 `POST /v1/videos` 确认是 new-api 端问题还是 Toonflow 问题

---

## 4. 静态文件访问 "未提供token" 错误

### 4.1 问题根因

OSS 写文件目录（`data/uploads/`）与 Express 静态文件目录（`uploads/`）不一致：
- `src/utils/oss.ts:35` — 文件保存到 `data/uploads/`
- `src/app.ts:33` — 静态文件从 `uploads/` 查找

文件找不到 → 请求穿透到 JWT 中间件 → 报"未提供 token"

### 4.2 修复

修改 `src/app.ts` 中非 Electron 模式的 rootDir：

```typescript
// 修改前
rootDir = path.join(process.cwd(), "uploads");

// 修改后
rootDir = path.join(process.cwd(), "data", "uploads");
```

---

## 5. Git 仓库管理（Fork 项目）

### 5.1 修改 origin 到 fork 仓库

```bash
git remote set-url origin git@github.com:ming200825/Toonflow-app.git
```

### 5.2 添加上游仓库（同步原仓库更新）

```bash
git remote add upstream https://github.com/HBAI-Ltd/Toonflow-app.git
```

### 5.3 同步上游更新

```bash
git fetch upstream
git merge upstream/master
```

### 5.4 最终 remote 配置

```
origin    git@github.com:ming200825/Toonflow-app.git   (push 自己的 fork)
upstream  https://github.com/HBAI-Ltd/Toonflow-app.git (fetch 原仓库)
```

---

## 6. Docker 部署

### 6.1 Dockerfile heredoc 问题

**问题**：Dockerfile 中 `RUN cat > file <<'EOF'` 写配置文件，在 Windows 环境构建时 heredoc 可能带入 `\r` 换行符，导致 supervisord 报 `Error: .ini file does not include supervisord section`。

**修复**：将配置文件独立为 `docker/supervisord.conf` 和 `docker/nginx.conf`，用 `COPY` 替代 heredoc。

### 6.2 代码修改后重新部署

当前 docker-compose 通过 volume 挂载 `build/` 目录，不需要重建镜像：

```bash
# 本地编译（跳过 Electron 下载）
set ELECTRON_SKIP_BINARY_DOWNLOAD=1 && yarn build

# 服务器上重启容器
docker-compose restart toonflow
```

如果需要完整重建：
```bash
git push
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 6.3 docker-compose.yml volume 挂载

```yaml
volumes:
  - ../logs:/var/log
  - ../data:/app/data          # 数据库 + uploads
  - ../env:/app/env            # 环境变量
  - ../build:/app/build        # 编译产物（方便热更新）
  - ../scripts/web:/usr/share/nginx/html  # 前端静态文件
```

### 6.4 Docker 架构

- 容器内 nginx (80端口, 映射到 8011) — 服务前端静态文件
- 容器内 Node.js (60000端口) — 后端 API + WebSocket
- 容器内 supervisor — 管理 nginx 和 pm2 进程

---

## 7. Nginx 反向代理配置（容器外）

### 7.1 关键问题

Toonflow 后端 60000 端口同时承载 **HTTP** 和 **WebSocket** 两种协议：
- HTTP: Express.js REST API
- WebSocket: 通过 `express-ws` 挂载，使用 HTTP Upgrade 机制

前端配置 `baseURL: "https://toon.vipcode.cc/api"`，HTTP 请求带 `/api` 前缀，
但 **WebSocket 连接路径不带 `/api` 前缀**（如 `wss://toon.vipcode.cc/outline/agentsOutline`）。

### 7.2 WebSocket 端点清单

项目中有 2 个 WebSocket 路由：
- `/outline/agentsOutline` — 大纲智能体对话
- `/storyboard/chatStoryboard` — 分镜智能体对话

### 7.3 完整 Nginx 配置（前端在容器外）

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

### 7.4 Nginx WebSocket 代理核心三行

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### 7.5 proxy_pass 尾部斜杠区别

- `proxy_pass http://127.0.0.1:60000/;` — 有尾部 `/`，去掉 location 前缀再转发（`/api/foo` → `/foo`）
- `proxy_pass http://127.0.0.1:60000;` — 无尾部 `/`，保留完整路径原样转发

---

## 8. 项目架构要点速查

### 8.1 文件路由系统

路由文件自动发现：`src/routes/**/*.ts` → URL 路径
例如：`routes/novel/addNovel.ts` → `POST /novel/addNovel`

### 8.2 AI 模型配置存储

数据库表 `t_config`，字段：type, model, apiKey, baseUrl, manufacturer

### 8.3 认证机制

JWT Token，从 `Authorization` header 或 `?token=` query 参数获取
白名单路径：`/other/login`
默认账号：admin / admin123

### 8.4 数据库

SQLite3，17 张表，使用 Knex.js 查询构建器
类型定义自动生成：`src/types/database.d.ts`
数据库文件位置：`data/` 目录下

### 8.5 OSSURL 环境变量

`env/.env.prod` 中的 `OSSURL` 用于生成文件的访问 URL。
部署时需确保 OSSURL 与实际可访问的地址一致（如 `https://toon.vipcode.cc/api/`）。

---

## 9. 本次代码修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/utils/ai/text/modelList.ts` | `"other"` 的 responseFormat 从 `"schema"` 改为 `"object"` |
| `src/app.ts` | 静态文件目录从 `uploads/` 改为 `data/uploads/`（与 OSS 一致） |
| `src/utils/ai/video/index.ts` | other 厂商跳过 modelList 校验；other 内部下载后返回 savePath |
| `src/utils/ai/video/owned/other.ts` | 完全重写，适配 new-api `/v1/videos` 接口格式 |
| `docker/Dockerfile` | heredoc 改为 COPY 独立配置文件 |
| `docker/supervisord.conf` | 新增独立 supervisord 配置文件 |
| `docker/nginx.conf` | 新增独立 nginx 站点配置文件 |

---

## 10. new-api 项目备忘（e:\P\Go\new-api）

### 10.1 概述

new-api 是基于 Go + Gin 的 AI 模型网关，对外暴露 OpenAI 兼容接口，支持 30+ 上游提供商。

### 10.2 Gemini Veo 视频 adaptor

- 位置：`relay/channel/task/gemini/adaptor.go`
- 支持模型：`veo-3.0-generate-001`、`veo-3.1-generate-preview`、`veo-3.1-fast-generate-preview`
- 请求格式：`predictLongRunning` 接口，发送 `instances` + `parameters`
- **当前限制**：`GeminiVideoRequest` 只有 `Prompt` 字段，不支持图片输入（首尾帧）
- **待改进**：Gemini Veo 官方 API 支持 `referenceImages` 传图片，但 new-api 的 adaptor 未实现

### 10.3 Kling 视频 adaptor

- 位置：`relay/channel/task/kling/adaptor.go`
- 首帧：`image` 字段
- 尾帧：`metadata.image_tail`
- 时长：`duration` 字段（秒数字符串）

### 10.4 视频请求数据流

```
客户端 POST /v1/videos
  → middleware.TokenAuth()
  → middleware.Distribute() (识别 RelayModeVideoSubmit)
  → controller.RelayTask()
  → relay.RelayTaskSubmit()
  → 选择对应 adaptor (gemini/kling/...)
  → adaptor.BuildRequestBody() (转换为上游格式)
  → 上游 API
  → adaptor.DoResponse() (解析响应)
  → 返回 task_id
```
