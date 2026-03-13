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

这第四轮升级主要完成：
- 增加 worker 级独立 token
- 增加重试 / dead-letter 基础字段与接口
- 增加 agent 能力声明与能力匹配过滤
- 强化本地 OpenClaw CLI 适配器（支持多种命令形态尝试）

---

## 核心能力

### 服务端
- `POST /tasks` 创建任务
- `GET /tasks` 查询任务列表
- `GET /tasks/:id` 查询单任务
- `POST /tasks/:id/claim` 任务签收 / 认领
- `POST /tasks/:id/status` 更新任务状态
- `POST /tasks/:id/result` 回写执行结果
- `POST /tasks/:id/retry` 重试或进入 dead-letter
- `GET /health` 健康检查
- Bridge Token / Worker Token 鉴权
- SQLite 持久化

### Worker（第四轮）
- 轮询属于本节点/本 agent 的 `queued` 任务
- 按能力声明过滤可处理任务
- claim 任务
- 更新 `accepted` / `running`
- 执行本地 worker 逻辑：
  - `mock`
  - `openclaw-cli`
- 可选自动降级：`openclaw-cli -> mock`
- 支持失败后按重试次数自动 retry 或进入 dead-letter

---

## 新增能力

### 1. Worker 级鉴权
- `BRIDGE_TOKEN`：主桥接 token
- `BRIDGE_WORKER_TOKEN`：worker 专用 token

### 2. 重试 / 死信
任务新增：
- `retry_count`
- `max_retries`
- `dead_letter_reason`

### 3. 能力声明
worker 可通过：
- `BRIDGE_WORKER_CAPABILITIES`
声明自己能处理的任务类型。

任务可通过：
- `requiredCapabilities`
声明所需能力。

worker 只会拉取自己能力可覆盖的任务。

---

## 当前限制

第四轮已经把 bridge 从“能跑”推进到“更稳”，但仍不是最终版：
- 真实执行仍依赖本机 OpenClaw CLI 稳定性
- 能力匹配还是轻量实现
- 重试策略还是基础版
- 还未实现节点注册中心与更细粒度的权限模型
