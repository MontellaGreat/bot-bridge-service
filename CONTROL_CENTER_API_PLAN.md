# CONTROL_CENTER_API_PLAN.md

# 第十三轮设计文档：Bridge 状态 API for OpenClaw Control Center

## 目标

在当前 `bot-bridge-service` 项目中新增一组 **控制中心友好型状态接口**，让 `openclaw-control-center` 能读取远端 bridge / node / worker / agent / task 的状态，并用于展示远端执行面板。

一句话：

> 让 bridge 从“派单总线”升级为“可观测的远端 agent 状态后端”。

---

## 一、调研结论：OpenClaw Control Center 目前能看什么

本次调研基于：
- `/opt/openclaw/docs/zh-CN/web/control-ui.md`
- `/opt/openclaw/docs/zh-CN/web/dashboard.md`
- `/opt/openclaw/ui/src/ui/controllers/*.ts`
- `/opt/openclaw/ui/src/ui/views/*.ts`

### Control Center / 控制 UI 当前已有能力

当前控制 UI（Gateway 提供的浏览器管理界面）至少覆盖这些视图：

1. **Overview / Status / Health**
   - 网关状态
   - 健康检查
   - 快速概览

2. **Instances**
   - 在线实例列表
   - presence / system-presence

3. **Sessions**
   - 会话列表
   - 会话状态
   - 会话级调试信息

4. **Agents**
   - agent 列表
   - agent identity
   - files / tools / skills / channels / cron 等面板

5. **Nodes**
   - 节点列表
   - 节点能力

6. **Cron / Skills / Logs / Approvals / Config / Models / Update**
   - 各类运维和管理数据

### 对第十三轮的启发

Control Center 是一个**管理界面**，它天然偏好：
- 总览页数据（summary）
- 列表页数据（nodes / agents / sessions）
- 详情页数据（单节点 / 单 worker / 单任务）
- 最近活动 / 最近错误 / 活跃任务
- 健康与在线状态

因此 bridge 新接口不能只吐原始表数据，而应该提供：
- **总览聚合**
- **节点聚合**
- **agent / worker 聚合**
- **活跃任务聚合**
- **最近异常 / 最近任务聚合**

---

## 二、核心定义：当前项目里“远端 agent 状态”到底指什么

在当前 bridge 架构中，bridge 直接掌握的不是 OpenClaw 内核 agent runtime 的完整内部状态，
而是以下三类外部可观测状态：

1. **worker 心跳状态**
2. **worker 当前任务状态**
3. **该 worker 最近执行结果 / 最近错误 / 最近活动**

因此本轮设计统一定义：

> **远端 agent 状态 = bridge 侧观察到的 worker 代理状态 + 最近任务执行状态 + 心跳在线状态**

这个定义足够真实、可落地、且与当前 Control Center 的展示习惯兼容。

---

## 三、设计原则

### 1. 不破坏现有底层协议
保留现有接口：
- `/health`
- `/workers`
- `/workers/:id`
- `/tasks`
- `/tasks/:id`
- `/maintenance/reap-timeouts`

这些继续面向 bridge 原生能力。

### 2. 新增控制中心聚合层
Control Center 不直接拼表，而是读取：
- `/control/summary`
- `/control/nodes`
- `/control/nodes/:nodeId`
- `/control/agents`
- `/control/agents/:workerId`
- `/control/tasks/active`
- `/control/tasks/recent`
- `/control/errors/recent`

### 3. 接口字段偏“面板可展示”
字段命名应尽量稳定、可读、面向 UI，不要逼前端自己推导。

### 4. 单独控制面鉴权
建议新增：
- `BRIDGE_CONTROL_TOKEN`

如果未配置，则可退回使用 `BRIDGE_TOKEN`。

---

## 四、Control Center 最关心的展示维度

结合当前 Control Center 的 UI 结构，建议 bridge 状态 API 至少提供这些维度：

### A. Summary 卡片需要
- 总节点数
- 总 worker 数
- 在线 worker 数
- 活跃任务数
- queued 数
- running 数
- dead-letter 数
- 最近更新时间

### B. Nodes 列表需要
- nodeId
- label
- online / stale / offline
- workerCount
- activeTaskCount
- lastHeartbeatAt
- agents[]
- version（如可提供）
- runtimeMode 汇总（mock / openclaw-cli）

### C. Agents / Workers 列表需要
- workerId
- nodeId
- targetAgent
- mode
- status
- currentTaskId
- lastHeartbeatAt
- online 状态
- capabilities
- lastResultSummary
- lastError
- recentTaskStatus

### D. Tasks 面板需要
- 活跃任务列表
- 最近任务列表
- 当前状态
- claimedBy
- timeoutSec
- retryCount
- deadLetterReason
- executionMode
- fallbackReason

### E. Debug / Detail 视图需要
- 最近错误
- 最近结果摘要
- artifactPath
- remoteSessionKey
- 最近完成时间

---

## 五、建议新增接口清单

## 1. 总览接口

### `GET /control/summary`

用途：
- Control Center 首页 / 远端 bridge 看板

建议返回：

```json
{
  "ok": true,
  "bridge": {
    "service": "openclaw-agent-bridge",
    "nodeId": "openclaw-node-a",
    "label": "Main OpenClaw Node",
    "version": "2.0.0-alpha.1"
  },
  "counts": {
    "nodes": 2,
    "workers": 2,
    "onlineWorkers": 2,
    "staleWorkers": 0,
    "offlineWorkers": 0,
    "queuedTasks": 1,
    "claimedTasks": 0,
    "acceptedTasks": 0,
    "runningTasks": 1,
    "activeTasks": 2,
    "deadLetterTasks": 0
  },
  "lastUpdatedAt": "2026-03-14T10:42:00Z"
}
```

---

## 2. 节点列表

### `GET /control/nodes`

用途：
- Control Center 远端节点列表

建议返回：

```json
{
  "count": 2,
  "nodes": [
    {
      "nodeId": "openclaw-node-a",
      "label": "Main OpenClaw Node",
      "online": true,
      "health": "online",
      "workerCount": 1,
      "activeTaskCount": 0,
      "agents": ["main"],
      "modes": ["openclaw-cli"],
      "lastHeartbeatAt": "2026-03-14T10:40:00Z",
      "lastTaskAt": "2026-03-14T10:39:12Z"
    }
  ]
}
```

---

## 3. 单节点详情

### `GET /control/nodes/:nodeId`

用途：
- 点击节点后的详情面板

建议返回：

```json
{
  "nodeId": "openclaw-node-a",
  "label": "Main OpenClaw Node",
  "online": true,
  "health": "online",
  "workers": [
    {
      "workerId": "openclaw-node-a-worker",
      "targetAgent": "main",
      "mode": "openclaw-cli",
      "status": "idle",
      "currentTaskId": null,
      "lastHeartbeatAt": "2026-03-14T10:40:00Z"
    }
  ],
  "recentTasks": [],
  "recentErrors": []
}
```

---

## 4. agent / worker 列表

### `GET /control/agents`

用途：
- Control Center 的远端 agent 状态面板

建议返回：

```json
{
  "count": 2,
  "agents": [
    {
      "workerId": "openclaw-node-b-worker",
      "nodeId": "openclaw-node-b",
      "targetAgent": "main",
      "displayName": "openclaw-node-b / main",
      "mode": "openclaw-cli",
      "status": "idle",
      "online": true,
      "health": "online",
      "currentTaskId": null,
      "capabilities": ["research", "writing"],
      "lastHeartbeatAt": "2026-03-14T10:41:00Z",
      "lastTaskId": "task_xxx",
      "lastTaskStatus": "done",
      "lastResultSummary": "OpenClaw CLI executed task for agent main",
      "lastError": null
    }
  ]
}
```

---

## 5. 单 agent / worker 状态

### `GET /control/agents/:workerId`

用途：
- agent 详情页 / 侧边抽屉

建议返回：
- 基础 worker 信息
- 当前任务
- 最近任务列表
- 最近错误
- 最近结果摘要

---

## 6. 活跃任务面板

### `GET /control/tasks/active`

用途：
- 当前运行 / 待接 / 已接受任务

建议返回：

```json
{
  "count": 2,
  "tasks": [
    {
      "id": "task_xxx",
      "title": "Bridge 联调任务",
      "status": "running",
      "sourceNode": "openclaw-node-a",
      "sourceAgent": "main",
      "targetNode": "openclaw-node-b",
      "targetAgent": "main",
      "claimedBy": "openclaw-node-b-worker",
      "claimedAt": "2026-03-14T10:20:00Z",
      "acceptedAt": "2026-03-14T10:20:01Z",
      "startedAt": "2026-03-14T10:20:02Z",
      "timeoutSec": 300,
      "retryCount": 0,
      "executionMode": "openclaw-cli"
    }
  ]
}
```

---

## 7. 最近任务历史

### `GET /control/tasks/recent?limit=20`

用途：
- 最近完成 / 失败 / 死信任务列表

建议支持过滤：
- `status`
- `nodeId`
- `targetAgent`
- `limit`

---

## 8. 最近错误列表

### `GET /control/errors/recent?limit=20`

用途：
- 控制中心错误面板 / 告警列表

数据来源建议：
- `tasks.error IS NOT NULL`
- `tasks.status IN ('failed', 'dead_letter')`
- worker 最近失败摘要（如后续补字段）

建议返回：
- taskId
- nodeId
- workerId（如可推导）
- targetAgent
- status
- error
- deadLetterReason
- updatedAt

---

## 六、在线状态判定规则

建议统一规则：

### online
- `now - lastHeartbeatAt <= 45s`

### stale
- `45s < now - lastHeartbeatAt <= 120s`

### offline
- `now - lastHeartbeatAt > 120s`

建议字段：
- `online: boolean`
- `health: "online" | "stale" | "offline"`

这样 Control Center 可以直接映射状态颜色。

---

## 七、建议补充的数据字段

为了让第十三轮设计不只停在聚合层，建议顺手为后续版本预留这些字段：

### workers 维度可补
- `node_label`
- `agent_label`
- `version`
- `last_error`
- `last_result_summary`
- `last_task_id`
- `last_task_status`
- `last_task_finished_at`

### tasks 维度建议结构化输出
当前很多字段已经在 result payload 里，但建议聚合接口中直接结构化吐出：
- `executionMode`
- `artifactPath`
- `remoteSessionKey`
- `fallbackReason`

---

## 八、鉴权设计

建议新增环境变量：

```bash
BRIDGE_CONTROL_TOKEN=replace-me
```

规则：
- 若配置了 `BRIDGE_CONTROL_TOKEN`，则 `/control/*` 必须使用它
- 若未配置，则回退到 `BRIDGE_TOKEN`

这样可以实现：
- control-center 只读接入
- 不直接暴露完整 bridge 管理 token

---

## 九、第十三轮分阶段实施建议

### Phase 1：最小可用（优先）
先实现 3 个接口：
1. `GET /control/summary`
2. `GET /control/agents`
3. `GET /control/tasks/active`

这三个接口足够让 control-center 先做：
- 远端总体状态卡片
- 远端 agent 列表
- 当前活跃任务面板

### Phase 2：节点视图
4. `GET /control/nodes`
5. `GET /control/nodes/:nodeId`

### Phase 3：历史 / 诊断
6. `GET /control/tasks/recent`
7. `GET /control/agents/:workerId`
8. `GET /control/errors/recent`

---

## 十、验收标准

第十三轮完成，至少满足：

- control-center 能调用一个 summary 接口拿到远端总览
- 能看到远端 worker / agent 在线状态
- 能看到活跃任务
- 能区分 online / stale / offline
- 能看最近错误和最近执行结果
- 鉴权独立、可控

---

## 十一、最终建议

当前项目里不要急着声称“拿到了 OpenClaw agent 内核态”。

更准确、更好落地的说法是：

> 第十三轮新增的是 **bridge-observed remote agent status API**。
>
> 也就是：通过 bridge 观察到的远端 agent / worker / task 运行状态接口。

这套定义足够支撑 control-center 接入，而且和当前项目架构完全匹配。
