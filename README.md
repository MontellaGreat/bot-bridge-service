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

这第一轮升级主要完成：
- 任务模型升级
- 状态机升级
- 协议文档补全
- SQLite schema 扩展
- API 从“消息回写”升级到“签收 / 状态 / 结果”闭环

后续会继续补：
- 远端 OpenClaw worker
- 节点鉴权增强
- 结果回调 / 轮询策略
- 更完整的 agent-to-agent 协作协议

---

## 核心能力

### 已有
- `POST /tasks` 创建任务
- `GET /tasks` 查询任务列表
- `GET /tasks/:id` 查询单任务
- `POST /tasks/:id/claim` 任务签收 / 认领
- `POST /tasks/:id/status` 更新任务状态
- `POST /tasks/:id/result` 回写执行结果
- `GET /health` 健康检查
- Bearer Token 鉴权
- SQLite 持久化

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

## 典型场景

### 场景 1：跨服务器调研委派
- A 服务器上的墨影判断任务复杂
- 创建一个发往 B 服务器 `tanzhen` 的任务
- B 服务器 worker 签收并执行
- B 回写结果
- A 的墨影再做最终裁决

### 场景 2：跨服务器代码执行
- 主 Agent 判断需要远端环境的 `tieshou`
- 通过 bridge 下发任务
- 远端签收、执行、回写结果与状态
- 本机主 Agent 汇总并决定是否放行

---

## 目录
```bash
.
├── README.md
├── ARCHITECTURE.md
├── PROTOCOL.md
├── .env.example
├── package.json
├── server.js
├── server-sqlite.js
├── start-bot-bridge.sh
├── check-bot-bridge.sh
├── check-health.sh
├── monitor-bot-bridge.sh
├── rotate-bridge-log.sh
└── systemd/
    └── bot-bridge.service.example
```

---

## 推荐下一步

这轮之后，建议继续实现：
1. 远端 worker（接 OpenClaw 本地 agent）
2. 更细粒度节点鉴权
3. 回调与轮询优化
4. 节点注册 / agent 能力声明
