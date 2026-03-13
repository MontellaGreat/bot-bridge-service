# OpenClaw Agent Bridge

跨服务器 OpenClaw 的轻量级 agent-to-agent 任务桥接服务。

## 新定位

这个项目不再只面向“bot 与 bot 之间的消息桥接”。

它现在的目标是：
- 不同服务器上的 OpenClaw 之间可以互相投递任务
- 本机主 Agent 可以把任务下发给远端 OpenClaw 的某个 agent
- 远端成功签收、执行并回传结果
- 形成跨服务器的主从协作链路

一句话：
> 这是一个 **OpenClaw-to-OpenClaw agent task bus**。

---

## 当前阶段

当前仓库正在从 v1 的 bot-bridge 形态升级到 v2 方向的 agent bridge。

这第三轮升级主要完成：
- 增加真实 OpenClaw 调用入口的 worker 版本
- 在 worker 中支持 `mock` / `openclaw-cli` 两种执行模式
- 补充完整测试办法，验证 bridge 闭环与真实 agent 执行

---

## 核心能力

### 服务端
- `POST /tasks` 创建任务
- `GET /tasks` 查询任务列表
- `GET /tasks/:id` 查询单任务
- `POST /tasks/:id/claim` 任务签收 / 认领
- `POST /tasks/:id/status` 更新任务状态
- `POST /tasks/:id/result` 回写执行结果
- `GET /health` 健康检查
- Bearer Token 鉴权
- SQLite 持久化

### Worker（第三轮）
- 轮询属于本节点/本 agent 的 `queued` 任务
- claim 任务
- 更新 `accepted` / `running`
- 执行本地 worker 逻辑：
  - `mock`
  - `openclaw-cli`
- 回写 `done` / `failed`

### 目标中的任务状态
- `queued`
- `claimed`
- `accepted`
- `running`
- `handoff`
- `done`
- `failed`
- `blocked`
- `stopped`
- `timeout`

---

## 最小运行方式

### 1. 启动服务端
```bash
source .env
node server-sqlite.js
```

### 2. 启动 worker（真实模式）
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_MODE=openclaw-cli \
OPENCLAW_RUN_TIMEOUT_MS=30000 \
node worker-openclaw.js
```

### 3. 启动 worker（mock 模式）
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_MODE=mock \
node worker-openclaw.js
```

### 4. 创建任务
```bash
curl -X POST http://127.0.0.1:${BRIDGE_PORT}/tasks \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "source_node":"openclaw-node-a",
    "source_agent":"main",
    "target_node":"openclaw-node-b",
    "target_agent":"main",
    "type":"delegated_work",
    "title":"桥接测试",
    "content":"请返回一句：远端 OpenClaw agent 已收到并执行任务。",
    "priority":"normal",
    "complexity":"L2",
    "conversation_id":"conv-001"
  }'
```

---

## 文档
- `ARCHITECTURE.md`
- `PROTOCOL.md`
- `WORKER_PLAN.md`
- `TESTING.md`

---

## 当前限制

第三轮已经接入真实 OpenClaw CLI 入口，但仍属于最小实现：
- 真实执行依赖本机 `openclaw` CLI 能正常工作
- 当前先通过 `openclaw-cli` 模式调用
- 还未接入更细的 session 管理、节点鉴权和重试策略

---

## 推荐下一步

这轮之后，建议继续实现：
1. 更稳定的本地 OpenClaw agent 调用方式
2. 节点/worker 级鉴权
3. 任务超时与重试策略
4. agent 能力声明与路由限制
