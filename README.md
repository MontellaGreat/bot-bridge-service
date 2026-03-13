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

这第二轮升级主要完成：
- 增加最小 OpenClaw worker 骨架
- 打通 poll -> claim -> status -> result 的完整闭环
- 为后续接真实 OpenClaw agent 执行预留入口

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

### Worker（第二轮新增）
- 轮询属于本节点/本 agent 的 `queued` 任务
- claim 任务
- 更新 `accepted` / `running`
- 执行本地 worker 逻辑（当前为 mock 闭环）
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

### 2. 启动 worker
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=tanzhen \
node worker-openclaw.js
```

### 3. 创建任务
```bash
curl -X POST http://127.0.0.1:${BRIDGE_PORT}/tasks \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "source_node":"openclaw-node-a",
    "source_agent":"main",
    "target_node":"openclaw-node-b",
    "target_agent":"tanzhen",
    "type":"delegated_work",
    "title":"调研远端协作方案",
    "content":"请分析并给出推荐路径",
    "priority":"normal",
    "complexity":"L3",
    "conversation_id":"conv-001",
    "metadata":{"timeout_seconds":600}
  }'
```

---

## 目录
```bash
.
├── README.md
├── ARCHITECTURE.md
├── PROTOCOL.md
├── WORKER_PLAN.md
├── .env.example
├── package.json
├── server.js
├── server-sqlite.js
├── worker-openclaw.js
├── start-bot-bridge.sh
├── check-bot-bridge.sh
├── check-health.sh
├── monitor-bot-bridge.sh
├── rotate-bridge-log.sh
└── systemd/
    └── bot-bridge.service.example
```

---

## 当前限制

第二轮的 worker 还是最小骨架：
- 已经打通 bridge 闭环
- 但本地执行部分还是 mock 形式
- 下一轮再接真实 OpenClaw agent 调用

---

## 推荐下一步

这轮之后，建议继续实现：
1. 把 `worker-openclaw.js` 接到真实 OpenClaw agent 调用
2. 增加节点/worker 级鉴权
3. 增加任务超时与重试策略
4. 增加 agent 能力声明与路由限制
