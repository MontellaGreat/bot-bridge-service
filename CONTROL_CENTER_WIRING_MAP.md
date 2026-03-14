# CONTROL_CENTER_WIRING_MAP.md

# openclaw-control-center 接线映射表（Bridge 第十三轮）

## 目标

说明 `TianyiDataScience/openclaw-control-center` 的各页面/卡片，
在接入 `bot-bridge-service` 时应调用哪些 `/control/*` 接口。

这份文档的目的不是描述 bridge 内部实现，
而是给 control-center 前端 / 接线层一个直接可用的映射表。

---

## 一、总原则

### 1. bridge 只提供“远端执行观测数据”
bridge 当前适合提供：
- 远端 worker / agent 观测状态
- 任务链路状态
- 活跃 / 最近 / 死信 / 错误任务
- 接线状态
- 风险摘要
- 节点维度状态（扩展）

### 2. bridge 不直接提供以下数据
这些仍应由 control-center 自己已有的数据源负责：
- token 用量 / 成本 / 订阅窗口
- 记忆源文件内容
- 文档工作台源文件
- provider 账单快照
- OpenClaw 内核私有 runtime 细节

因此接线时要明确区分：
- **Bridge 数据源**
- **Control Center 本地 / 上游 OpenClaw 数据源**

---

## 二、页面映射

## 1. 总览（Overview）

### 建议主接口
- `GET /control/overview`

### 可补充接口
- `GET /control/errors/recent`
- `GET /control/settings/risk-summary`

### 推荐映射

#### 卡片：系统整体状态
来源：
- `/control/overview`

字段：
- `status`
- `summary.onlineWorkers`
- `summary.busyWorkers`
- `summary.idleWorkers`
- `summary.queuedTasks`
- `summary.runningTasks`
- `summary.deadLetterTasks`
- `summary.recentFailures`

#### 卡片：待处理事项 / 注意力
来源：
- `/control/overview`

字段：
- `attention[]`

#### 卡片：关键风险
来源：
- `/control/settings/risk-summary`

字段：
- `risks[]`

#### 卡片：谁在忙
来源：
- `/control/overview`
- 或 `/control/staff`

字段：
- `staff[]`

---

## 2. 用量（Usage）

### bridge 当前不直接提供真实 usage / cost
因此这个页面：
- 应继续优先使用 control-center 自己的 usage / subscription 数据源
- bridge 只能提供辅助信号，不应伪装成成本数据

### 可选辅助信号
- `/control/overview`
- `/control/tasks/board`

可显示：
- 当前 running 数量
- 当前 queued 数量
- dead-letter 数量
- recent failure 数量

### UI 表达建议
把 bridge 提供的这部分标记为：
- `Execution pressure`
- `Task backlog`
- `Bridge runtime health`

不要命名成：
- token 使用量
- 订阅消耗
- provider 成本

---

## 3. 员工（Staff）

### 建议主接口
- `GET /control/staff`

### 推荐映射

#### 员工列表
来源：
- `/control/staff`

字段：
- `staff[].workerId`
- `staff[].nodeId`
- `staff[].targetAgent`
- `staff[].displayName`
- `staff[].mode`
- `staff[].status`
- `staff[].online`
- `staff[].health`
- `staff[].nextStateHint`
- `staff[].currentTaskId`
- `staff[].lastHeartbeatAt`
- `staff[].lastTaskId`
- `staff[].lastTaskStatus`
- `staff[].lastResultSummary`
- `staff[].lastError`

### 页面翻译建议
- `working` → 正在工作
- `waiting` → 待命
- `next-up` → 下一项待接
- `offline` → 离线
- `stale` → 状态陈旧

### 推荐 UI 逻辑
- `health=offline`：直接红色
- `health=stale`：黄色
- `nextStateHint=working`：显示“忙碌中”
- `lastError != null`：给员工行加异常标记

---

## 4. 任务（Tasks）

### 建议主接口
- `GET /control/tasks/board`

### 子接口
- `GET /control/tasks/active`
- `GET /control/tasks/recent`
- `GET /control/errors/recent`

### 推荐映射

#### 当前任务 / 活跃任务
来源：
- `/control/tasks/board.active`
- 或 `/control/tasks/active`

#### 卡住任务
来源：
- `/control/tasks/board.stalled`

#### 最近完成 / 最近失败
来源：
- `/control/tasks/board.recent`
- 或 `/control/tasks/recent`

#### dead-letter 面板
来源：
- `/control/tasks/board.deadLetters`

#### 异常任务流
来源：
- `/control/errors/recent`

### 推荐字段
- `status`
- `claimedBy`
- `claimedAt`
- `acceptedAt`
- `startedAt`
- `finishedAt`
- `timeoutSec`
- `retryCount`
- `deadLetterReason`
- `resultSummary`
- `error`
- `executionMode`
- `artifactPath`
- `remoteSessionKey`
- `fallbackReason`

### 推荐 UI 逻辑
- `status=dead_letter`：高风险
- `error != null`：异常标签
- `executionMode=mock`：标记“降级执行”
- `fallbackReason != null`：显示 fallback 说明

---

## 5. 设置（Settings）

## 5.1 接线状态
### 建议主接口
- `GET /control/settings/wiring`

#### 推荐卡片
- Bridge 是否接通
- control token 是否配置
- worker heartbeat 是否接通
- worker roster 是否接通
- 真实 CLI 执行是否接通
- dead-letter watcher 是否接通
- usageData 是否由 bridge 提供（通常不是）
- memoryDocs 是否由 bridge 提供（通常不是）

---

## 5.2 风险摘要
### 建议主接口
- `GET /control/settings/risk-summary`

#### 推荐卡片
- token 复用风险
- 离线 worker 风险
- stale worker 风险
- dead-letter 累积风险
- 最近错误任务风险
- 全 mock 模式提示

字段：
- `risks[].level`
- `risks[].title`
- `risks[].message`
- `risks[].impact`
- `risks[].suggestion`

---

## 6. 节点视图（可选扩展）

如果 control-center 后续想补“多服务器 / 多节点”视图，可接：
- `GET /control/nodes`
- `GET /control/nodes/:nodeId`

当前不是第一优先级，但很适合后续：
- 运维模式
- 多节点巡检
- 节点详情页

---

## 三、推荐接线优先级

### 第一优先级（现在就接）
1. `/control/overview`
2. `/control/staff`
3. `/control/tasks/board`
4. `/control/settings/wiring`
5. `/control/settings/risk-summary`

### 第二优先级
6. `/control/tasks/recent`
7. `/control/errors/recent`

### 第三优先级（扩展）
8. `/control/nodes`
9. `/control/nodes/:nodeId`

---

## 四、前端接线注意事项

### 1. 不要把 bridge 数据伪装成 usage / subscription
bridge 不负责 token 成本。

### 2. bridge 的“员工”本质是 worker 代理状态
不是 OpenClaw 内核 agent 的完整私有运行态。

### 3. bridge 的“任务证据”是真实可落地的
尤其这些字段非常适合 UI 展示：
- `resultSummary`
- `error`
- `deadLetterReason`
- `executionMode`
- `fallbackReason`
- `artifactPath`

### 4. 设置页要明确“哪些数据来自 bridge，哪些不来自 bridge”
这样不会误导用户。

---

## 五、一句话总结

如果按当前 bridge 第十三轮能力来接 `openclaw-control-center`，
最实用的接线方式是：

- **总览** ← `/control/overview`
- **员工** ← `/control/staff`
- **任务** ← `/control/tasks/board`
- **设置/接线** ← `/control/settings/wiring`
- **设置/风险** ← `/control/settings/risk-summary`

这就是当前最稳的第一版接线方案。
