# CONTROL_CENTER_FIELD_MAP.md

# openclaw-control-center 字段对照表（Bridge 接口版）

## 目标

给 control-center 前端接入时使用：
- 页面 / 卡片 需要哪些字段
- 对应应该从哪个 bridge 接口读取
- 字段语义是什么
- UI 上该如何展示

---

## 一、总览（Overview）

### 接口
- `GET /control/overview`
- 辅助：`GET /control/settings/risk-summary`

### 字段对照

| 页面元素 | 接口字段 | 含义 | 建议展示 |
|---|---|---|---|
| 系统状态 | `status` | `healthy` / `attention` | 顶部健康状态条 |
| 在线员工数 | `summary.onlineWorkers` | 在线 worker 数 | 统计卡片 |
| 忙碌员工数 | `summary.busyWorkers` | 正在工作的 worker 数 | 统计卡片 |
| 待命员工数 | `summary.idleWorkers` | 等待 / next-up worker 数 | 统计卡片 |
| 排队任务数 | `summary.queuedTasks` | 当前 queued 数 | 统计卡片 |
| 运行任务数 | `summary.runningTasks` | 当前 running 数 | 统计卡片 |
| 死信任务数 | `summary.deadLetterTasks` | 当前 dead-letter 数 | 风险卡片 |
| 最近失败数 | `summary.recentFailures` | 最近异常任务数 | 风险卡片 |
| 待关注项 | `attention[]` | 当前需要用户注意的摘要 | 待办/提示区 |
| 员工快照 | `staff[]` | 精简 staff 列表 | 首页小面板 |
| 风险摘要 | `risks[]` | 风险 / 建议 | 警报面板 |

---

## 二、员工（Staff）

### 接口
- `GET /control/staff`

### 字段对照

| 页面元素 | 接口字段 | 含义 | 建议展示 |
|---|---|---|---|
| 员工 ID | `staff[].workerId` | worker 唯一标识 | 隐藏字段 / 调试 |
| 节点名 | `staff[].nodeId` | 所属节点 | 副标题 |
| Agent 名 | `staff[].targetAgent` | 目标 agent | 副标题 |
| 显示名 | `staff[].displayName` | `node / agent` | 主标题 |
| 执行模式 | `staff[].mode` | `mock` / `openclaw-cli` | badge |
| 当前状态 | `staff[].status` | worker 原始状态 | 次级状态 |
| 在线布尔 | `staff[].online` | 是否在线 | 状态点 |
| 健康状态 | `staff[].health` | `online/stale/offline` | 颜色态 |
| 人话状态 | `staff[].nextStateHint` | `working/waiting/next-up/...` | 主状态标签 |
| 当前任务 | `staff[].currentTaskId` | 当前任务 ID | 行内信息 |
| 能力列表 | `staff[].capabilities` | worker 能力声明 | tooltip / 标签 |
| 最近心跳 | `staff[].lastHeartbeatAt` | 最近心跳时间 | 次级信息 |
| 最近任务 ID | `staff[].lastTaskId` | 最近任务 | 链接/详情 |
| 最近任务状态 | `staff[].lastTaskStatus` | 最近任务结果 | badge |
| 最近结果摘要 | `staff[].lastResultSummary` | 最近产出摘要 | 产出文案 |
| 最近错误 | `staff[].lastError` | 最近异常 | 错误提示 |

### 前端状态映射建议

| `nextStateHint` | 中文展示 |
|---|---|
| `working` | 正在工作 |
| `waiting` | 待命 |
| `next-up` | 下一项待接 |
| `offline` | 离线 |
| `stale` | 状态陈旧 |

---

## 三、任务（Tasks）

### 主接口
- `GET /control/tasks/board`

### 子接口
- `GET /control/tasks/active`
- `GET /control/tasks/recent`
- `GET /control/errors/recent`

### 任务通用字段对照

| 页面元素 | 接口字段 | 含义 | 建议展示 |
|---|---|---|---|
| 任务 ID | `id` | 唯一 ID | 行主键 |
| 标题 | `title` | 任务标题 | 主标题 |
| 状态 | `status` | queued/claimed/... | 状态 badge |
| 来源节点 | `sourceNode` | 发起方 | 副标题 |
| 来源 agent | `sourceAgent` | 发起 agent | 副标题 |
| 目标节点 | `targetNode` | 执行节点 | 副标题 |
| 目标 agent | `targetAgent` | 执行 agent | 副标题 |
| 签收人 | `claimedBy` | 谁认领了 | 执行链 |
| 签收时间 | `claimedAt` | 何时认领 | 时间线 |
| accepted 时间 | `acceptedAt` | 接受时间 | 时间线 |
| started 时间 | `startedAt` | 开始时间 | 时间线 |
| finished 时间 | `finishedAt` | 完成时间 | 时间线 |
| 超时秒数 | `timeoutSec` | 超时配置 | tooltip |
| 重试次数 | `retryCount` | 当前重试计数 | badge |
| 死信原因 | `deadLetterReason` | 死信原因 | 风险标签 |
| 结果摘要 | `resultSummary` | 执行结果摘要 | 主结果文案 |
| 错误 | `error` | 异常信息 | 错误文案 |
| 执行模式 | `executionMode` | mock / openclaw-cli | badge |
| 产物路径 | `artifactPath` | 结果文件路径 | 调试链接 |
| 会话键 | `remoteSessionKey` | 远端会话标识 | 调试信息 |
| 降级原因 | `fallbackReason` | fallback 原因 | 降级标签 |

### `/control/tasks/board` 字段映射

| 页面模块 | 接口字段 |
|---|---|
| 当前任务 | `active[]` |
| 卡住任务 | `stalled[]` |
| 最近完成/失败 | `recent[]` |
| dead-letter 区 | `deadLetters[]` |
| 更新时间 | `updatedAt` |

### `/control/errors/recent` 字段映射

| 页面模块 | 接口字段 |
|---|---|
| 异常任务流 | `errors[]` |
| 任务 ID | `errors[].taskId` |
| 错误文案 | `errors[].error` |
| 死信原因 | `errors[].deadLetterReason` |
| 时间 | `errors[].updatedAt` |

---

## 四、设置（Settings）

## 4.1 接线状态
### 接口
- `GET /control/settings/wiring`

| 页面元素 | 接口字段 | 含义 |
|---|---|---|
| Bridge 接通状态 | `wiring.bridgeHealth` | bridge 是否接通 |
| 控制 token | `wiring.controlToken` | control token 是否配置 |
| worker 心跳 | `wiring.workerHeartbeat` | heartbeat 是否可见 |
| worker roster | `wiring.workerRoster` | roster 是否可见 |
| 真实 CLI 执行 | `wiring.realCliExecution` | 是否观测到 openclaw-cli worker |
| 死信监控 | `wiring.deadLetterWatcher` | 超时/死信能力是否已接通 |
| usage 数据 | `wiring.usageData` | 是否由 bridge 提供 |
| memory/docs 数据 | `wiring.memoryDocs` | 是否由 bridge 提供 |
| 说明文本 | `notes[]` | 解释 bridge 数据边界 |

## 4.2 风险摘要
### 接口
- `GET /control/settings/risk-summary`

| 页面元素 | 接口字段 | 含义 |
|---|---|---|
| 风险总状态 | `status` | `healthy/attention` |
| 风险数量 | `count` | 风险总数 |
| 风险列表 | `risks[]` | 风险明细 |
| 等级 | `risks[].level` | `warn/info` |
| 标题 | `risks[].title` | 卡片标题 |
| 说明 | `risks[].message` | 人话说明 |
| 影响 | `risks[].impact` | 会造成什么问题 |
| 建议 | `risks[].suggestion` | 下一步建议 |

---

## 五、节点（Nodes，可选扩展）

### 接口
- `GET /control/nodes`
- `GET /control/nodes/:nodeId`

### `/control/nodes` 字段对照

| 页面元素 | 接口字段 |
|---|---|
| 节点 ID | `nodes[].nodeId` |
| 节点名称 | `nodes[].label` |
| 在线状态 | `nodes[].online` |
| 健康状态 | `nodes[].health` |
| worker 数 | `nodes[].workerCount` |
| 活跃任务数 | `nodes[].activeTaskCount` |
| agent 列表 | `nodes[].agents` |
| mode 列表 | `nodes[].modes` |
| 最近心跳 | `nodes[].lastHeartbeatAt` |
| 最近任务时间 | `nodes[].lastTaskAt` |

### `/control/nodes/:nodeId` 字段对照

| 页面元素 | 接口字段 |
|---|---|
| 节点基础信息 | 顶层节点字段 |
| 节点 workers | `workers[]` |
| 最近任务 | `recentTasks[]` |
| 最近错误 | `recentErrors[]` |

---

## 六、推荐前端接入顺序

### Phase 1
- 总览：`/control/overview`
- 员工：`/control/staff`
- 任务：`/control/tasks/board`
- 设置：`/control/settings/wiring`
- 设置：`/control/settings/risk-summary`

### Phase 2
- 任务历史：`/control/tasks/recent`
- 错误流：`/control/errors/recent`

### Phase 3
- 节点页：`/control/nodes`
- 节点详情：`/control/nodes/:nodeId`

---

## 七、一句话总结

bridge 第十三轮 / 第十四轮提供的不是“原始数据库接口”，
而是一套已经对齐 `openclaw-control-center` 页面语义的观测接口。

前端优先接：
- `overview`
- `staff`
- `tasks/board`
- `settings/wiring`
- `settings/risk-summary`

这样最快能把控制面板真正点亮。
