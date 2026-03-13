# TESTING.md

# 第三轮测试办法（真实 agent 接线验证）

目标：验证 bridge 是否能完成以下闭环：

1. 创建任务
2. 远端 worker 拉取并 claim
3. worker 调本地 OpenClaw agent 执行
4. 更新状态并回写结果
5. 主端查询到最终结果

---

## 一、准备

### 1. 服务端 .env
```bash
BRIDGE_PORT=8787
BRIDGE_TOKEN=your-secret-token
BRIDGE_NODE_ID=openclaw-node-b
```

### 2. 启动服务端
```bash
source .env
node server-sqlite.js
```

### 3. 启动 worker
先用真实模式：
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_MODE=openclaw-cli \
BRIDGE_FALLBACK_TO_MOCK=false \
OPENCLAW_RUN_TIMEOUT_MS=30000 \
node worker-openclaw.js
```

如果真实模式不通，可启用自动降级：
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_MODE=openclaw-cli \
BRIDGE_FALLBACK_TO_MOCK=true \
OPENCLAW_RUN_TIMEOUT_MS=30000 \
node worker-openclaw.js
```

如果只想纯验证桥接：
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_MODE=mock \
node worker-openclaw.js
```

---

## 二、创建测试任务

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
    "conversation_id":"test-conv-001"
  }'
```

记下返回的 `task.id`。

---

## 三、观察 worker 日志

成功路径应看到类似：
```text
[worker] claiming task_xxx
[worker] done task_xxx
```

---

## 四、查询任务结果

```bash
curl http://127.0.0.1:${BRIDGE_PORT}/tasks/task_xxx \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### 成功标准
结果里至少应有：
- `status: done`
- `claimedBy`
- `acceptedAt`
- `startedAt`
- `finishedAt`
- `resultSummary`
- `result`
- `executionMode`

如果失败，应有：
- `status: failed`
- `error`
- `artifactPath`（若有）

---

## 五、验证真实模式是否真的调用了 OpenClaw

查看 worker 生成的结果文件：
```bash
cat data/worker-results/task_xxx.json
```

### 如果是真实模式
里面应看到：
- `executionMode: openclaw-cli`
- `stdout`
- `stderr`
- `args`

### 如果自动降级了
结果里应看到：
- `executionMode: mock`
- `fallbackFrom: openclaw-cli`
- `fallbackReason`

### 如果是纯 mock
则是：
- `executionMode: mock`
- 没有 fallback 原因

---

## 六、排错

### 1. 任务一直 queued
说明 worker 没拉到任务，检查：
- `BRIDGE_NODE_ID`
- `BRIDGE_TARGET_AGENT`
- 任务中的 `target_node` / `target_agent`

### 2. 任务 claimed 但 failed
说明 worker 接到了，但本地执行没通。优先检查：
- `openclaw` CLI 是否可执行
- `openclaw run --agent main "..."` 是否本机能跑
- `OPENCLAW_RUN_TIMEOUT_MS` 是否太短

### 3. 真实模式不稳定
可以：
- 先启用 `BRIDGE_FALLBACK_TO_MOCK=true`
- 继续验证桥接链路
- 同时单独排查本机 OpenClaw runtime 问题

---

## 七、建议测试顺序

1. 先用 `mock` 模式验证桥接链路
2. 再用 `openclaw-cli` 模式验证真实执行
3. 如真实执行不稳，再启用自动降级
4. 再测试不同 `target_agent`
5. 最后测试失败路径和超时路径
