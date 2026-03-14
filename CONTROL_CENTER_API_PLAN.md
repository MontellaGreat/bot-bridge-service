# CONTROL_CENTER_API_PLAN.md

# 第十三轮设计文档：Bridge 状态 API for TianyiDataScience/openclaw-control-center

## 目标

在当前 `bot-bridge-service` 项目中新增一组 **面向 `openclaw-control-center` 的状态接口**，
让控制面板可以读取远端 bridge / worker / task 的观测状态，并把这些状态映射到它自己的页面：

- 总览
- 用量（本轮仅提供 bridge 侧可见基础信号，不伪造费用数据）
- 员工
- 任务
- 文档 / 记忆（本轮不由 bridge 提供）
- 设置

一句话：

> 让 bridge 成为 `openclaw-control-center` 的“远端执行观测后端”。

---

## 一、先纠偏：本轮参照的控制面板到底是谁

本轮确认的目标项目是：
- `https://github.com/TianyiDataScience/openclaw-control-center`

它**不是** OpenClaw 自带的 Gateway Control UI / Dashboard。

这很重要，因为两者的页面模型不同：

### OpenClaw 自带 Control UI 更偏：
- gateway / channels / sessions / nodes / config / logs

### 这个 `openclaw-control-center` 更偏：
- 总览
- 用量
- 员工
- 任务
- 文档
- 记忆
- 设置

而且它强调：
- 面向非技术用户
- 安全优先、默认只读
- 不直接暴露原始 payload
- 更关注“谁在工作、谁卡住了、哪些任务有证据、哪些数据没接好”

因此 bridge API 设计必须按**这个控制面板的页面语义**来做。

---

## 二、调研结论：这个 control-center 现在想看什么

根据该项目 README，可明确反推出这些页面诉求：

## 1. 总览（Overview）
要回答一句话：
> OpenClaw 现在整体正常吗？

需要数据：
- 系统状态
- 待处理事项
- 关键风险
- 运行异常
- 停滞执行
- 谁在忙
- 哪些地方需要优先关注

## 2. 用量（Usage）
bridge 本轮不能伪造真实 token / 花费 / 订阅数据，但可以补充：
- bridge 任务吞吐
- 活跃任务压力
- 死信数量
- 失败数
- 当前“上下文压力”的替代提示（如 running task count）

本轮只提供 bridge 可见部分，control-center 应将其标记为“部分接线”。

## 3. 员工（Staff）
这里最关键，和 bridge 高度契合。

需要数据：
- 谁真的在工作
- 谁只是排队待命
- 谁卡住了
- 谁离线了
- 最近产出
- 最近心跳
- 当前任务
- 最近错误

在 bridge 语义里，对应就是：

> **员工 = worker 代理的远端 agent 观测状态**

## 4. 任务（Tasks）
需要数据：
- 当前任务
- 卡住任务
- 运行证据
- 审批 / 执行链
- 最近完成 / 最近失败 / dead-letter
- retry / timeout / fallback

这与 bridge `tasks` 表高度吻合。

## 5. 设置（Settings）
需要数据：
- 接线状态
- 安全风险摘要
- 更新状态
- 哪些数据已接好
- 哪些数据源缺失但属正常降级

bridge 本轮至少能提供：
- control token 是否启用
- worker token 是否启用
- 是否已有活跃 worker
- 是否已有心跳
- 是否已有真实 CLI 执行证据
- 是否存在 dead-letter / failed 任务
- 是否配置了 control token

---

## 三、核心定义：bridge 里“远端 agent 状态”怎么定义

当前项目能直接观察到的是：

1. worker 心跳
2. worker 当前状态
3. worker 当前任务 / 最近任务
4. 最近任务结果 / 错误 / fallback / dead-letter

因此统一定义：

> **远端 agent 状态 = bridge 侧观察到的 worker 代理状态 + 最近任务状态 + 心跳状态 + 最近执行证据**

这套定义非常适合 `openclaw-control-center` 的：
- 员工页
- 总览页
- 任务页
- 设置页中的接线状态

---

## 四、建议接口：按 control-center 页面来设计

## A. 总览页接口

### `GET /control/overview`

用途：
- 给“总览”页直接使用
- 比 `/control/summary` 更偏业务态势，而不是原始计数

建议返回：

```json
{
  "ok": true,
  "status": "healthy",
  "summary": {
    "onlineWorkers": 2,
    "busyWorkers": 1,
    "idleWorkers": 1,
    "queuedTasks": 0,
    "runningTasks": 1,
    "deadLetterTasks": 0,
    "recentFailures": 0
  },
  "risks": [
    {
      "level": "info",
      "code": "control_token_enabled",
      "message": "Control API token is enabled."
    }
  ],
  "attention": [
    {
      "type": "task",
      "message": "1 task is currently running."
    }
  ],
  "staff": [
    {
      "workerId": "openclaw-node-b-worker",
      "nodeId": "openclaw-node-b",
      "targetAgent": "main",
      "status": "running",
      "currentTaskId": "task_xxx"
    }
  ],
  "updatedAt": "2026-03-14T12:00:00Z"
}
```

---

## B. 员工页接口

### `GET /control/staff`

用途：
- 对应 control-center 的“员工”页

建议返回：

```json
{
  "count": 2,
  "staff": [
    {
      "workerId": "openclaw-node-b-worker",
      "nodeId": "openclaw-node-b",
      "targetAgent": "main",
      "displayName": "openclaw-node-b / main",
      "mode": "openclaw-cli",
      "online": true,
      "health": "online",
      "status": "idle",
      "currentTaskId": null,
      "nextStateHint": "waiting",
      "capabilities": ["research", "writing"],
      "lastHeartbeatAt": "2026-03-14T12:00:00Z",
      "lastTaskId": "task_xxx",
      "lastTaskStatus": "done",
      "lastResultSummary": "OpenClaw CLI executed task for agent main",
      "lastError": null
    }
  ]
}
```

### 字段说明
- `status`: worker 当前上报状态
- `nextStateHint`: 给 UI 更人话的映射，例如：
  - `running` → `working`
  - `idle` + 无 queued 任务 → `waiting`
  - `idle` + 有匹配 queued 任务 → `next-up`
  - `offline` → `offline`

---

## C. 任务页接口

### `GET /control/tasks/board`

用途：
- 给“任务”页直接使用
- 把 active / stalled / recent / dead-letter 打包在一起

建议返回：

```json
{
  "active": [],
  "stalled": [],
  "recent": [],
  "deadLetters": [],
  "updatedAt": "2026-03-14T12:00:00Z"
}
```

### `GET /control/tasks/active`

用途：
- 保留给轻量活跃任务看板

### `GET /control/tasks/recent?limit=20`

用途：
- 最近完成 / 失败任务

---

## D. 设置页：接线状态

### `GET /control/settings/wiring`

用途：
- 对应 control-center 的“接线状态”卡片

建议返回：

```json
{
  "ok": true,
  "wiring": {
    "bridgeHealth": "connected",
    "controlToken": "configured",
    "workerHeartbeat": "connected",
    "workerRoster": "connected",
    "realCliExecution": "connected",
    "deadLetterWatcher": "connected",
    "usageData": "not_provided_by_bridge",
    "memoryDocs": "not_provided_by_bridge"
  },
  "notes": [
    "This bridge provides execution and worker observability only.",
    "Usage / subscription / memory / docs remain upstream control-center data sources."
  ]
}
```

---

## E. 设置页：风险摘要

### `GET /control/settings/risk-summary`

用途：
- 对应 control-center 的“安全风险摘要” / 风险提示

建议输出：
- 是否仍使用 bridge 主 token 作为 control token
- 是否存在离线 worker
- 是否存在 dead-letter 累积
- 是否最近有 failed 任务
- 是否所有 worker 都是 mock 模式（若是，则提示“真实执行证据不足”）

---

## F. 最近错误接口

### `GET /control/errors/recent?limit=20`

用途：
- 让总览和任务页都能拿“最近异常”

建议返回：
- taskId
- targetNode
- targetAgent
- status
- error
- deadLetterReason
- updatedAt
- claimedBy

---

## 五、保留并重命名现有第一批接口的语义

前面已经做出的接口，不废弃，但重新解释：

### 已有接口 1：`GET /control/summary`
现在应视为：
- **底层总览统计接口**
- 给 `/control/overview` 作为数据源之一

### 已有接口 2：`GET /control/agents`
现在应视为：
- **员工页底层数据接口**
- 后续可作为 `/control/staff` 的原始实现基础

### 已有接口 3：`GET /control/tasks/active`
现在应视为：
- **任务页活跃任务子接口**
- 后续由 `/control/tasks/board` 聚合调用或复用逻辑

也就是说，前面做的不是白做，而是：
> **要把它们从“OpenClaw 原生控制 UI 风格”重新包装成“control-center 页面风格”。**

---

## 六、数据映射规则

## 员工页状态映射

建议：

### `working`
满足：
- worker.status = `busy`，或
- currentTaskId 非空，或
- 最近任务 status = `running`

### `waiting`
满足：
- worker.status = `idle`
- 当前无任务
- worker 在线

### `next-up`
满足：
- worker.status = `idle`
- 但存在匹配它 node/agent 的 queued task

### `offline`
满足：
- 心跳过期

### `stalled`
满足：
- currentTaskId 非空
- 且任务 running / accepted 超时过久

---

## 七、bridge 当前不能提供的内容

为了避免误导 control-center，文档必须明确：

bridge 当前**不能直接提供**：
- OpenClaw token / cost / subscription 真正消费数据
- 记忆文件内容
- 文档工作台源文件
- approval mutation 细节
- provider 账单快照

因此 control-center 若显示这些页：
- 应走自己已有数据源
- 或把 bridge 标记为“部分接线，不提供该数据”

---

## 八、建议实施顺序（修正版）

### Phase 1：页面对齐
优先新增：
1. `GET /control/overview`
2. `GET /control/staff`
3. `GET /control/tasks/board`
4. `GET /control/settings/wiring`

### Phase 2：诊断增强
5. `GET /control/tasks/recent`
6. `GET /control/errors/recent`
7. `GET /control/settings/risk-summary`

### Phase 3：节点补充（如果 control-center 后续要）
8. `GET /control/nodes`
9. `GET /control/nodes/:nodeId`

注意：
对这个项目而言，**nodes 不是第一优先级**，
因为它的页面语言更偏“员工 / 任务 / 总览 / 设置”，不是纯 infra 面板。

---

## 九、验收标准

第十三轮按 control-center 语义完成，至少满足：

- `总览` 页能看到远端 bridge 的整体状态
- `员工` 页能区分谁在工作、谁待命、谁离线、谁卡住
- `任务` 页能看到活跃任务、最近任务和运行证据
- `设置` 页能看到接线状态和风险摘要
- 不伪造 bridge 无法掌握的数据
- 接口字段是 UI 友好的，不强迫前端自己还原业务语义

---

## 十、最终结论

第十三轮不该再按“通用 nodes/agents/task API”来理解，
而应该明确成：

> **为 TianyiDataScience/openclaw-control-center 提供远端执行观测 API。**

也就是：
- 总览接口
- 员工接口
- 任务接口
- 设置接线接口
- 风险摘要接口

这才和目标控制面板真正对齐。
