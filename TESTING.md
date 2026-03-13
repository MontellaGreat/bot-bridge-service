# TESTING.md

# 第六轮测试办法（heartbeat / roster / timeout watcher）

目标：验证 bridge 是否已经具备：
1. worker heartbeat 上报
2. worker roster 查询
3. task timeout watcher / 超时回收
4. 与此前能力匹配 / retry / mock fallback 能协同工作

---

## 一、准备

### 服务端 .env
```bash
BRIDGE_PORT=8787
BRIDGE_TOKEN=bridge-secret
BRIDGE_WORKER_TOKEN=worker-secret
BRIDGE_DEFAULT_TASK_TIMEOUT_SEC=600
```

### worker 启动示例
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_WORKER_TOKEN=worker-secret \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_CAPABILITIES=research,writing,vision,engineering,testing,multimedia \
BRIDGE_WORKER_MODE=openclaw-cli \
BRIDGE_FALLBACK_TO_MOCK=true \
BRIDGE_HEARTBEAT_INTERVAL_MS=15000 \
OPENCLAW_RUN_TIMEOUT_MS=30000 \
node worker-openclaw.js
```

---

## 二、heartbeat / roster 测试

### 查询所有 worker
```bash
curl http://127.0.0.1:${BRIDGE_PORT}/workers \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### 预期
至少能看到：
- `workerId`
- `nodeId`
- `targetAgent`
- `capabilities`
- `mode`
- `status`
- `lastHeartbeatAt`

---

## 三、降级闭环测试

发一个允许 fallback 的任务：
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
    "title":"第六轮降级测试",
    "content":"请返回一句：第六轮降级测试已收到。",
    "requiredCapabilities":["writing"],
    "maxRetries":1,
    "timeoutSec":120,
    "metadata":{"allowMockFallback":true}
  }'
```

### 预期
- worker heartbeat 先显示 `idle`
- 接单后显示 `busy`
- 完成后回到 `idle`

---

## 四、timeout watcher 测试

发一个超短超时任务：
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
    "title":"超时回收测试",
    "content":"这是一个用于超时回收测试的任务。",
    "requiredCapabilities":["writing"],
    "maxRetries":1,
    "timeoutSec":1
  }'
```

等待超时后，手动执行：
```bash
curl -X POST http://127.0.0.1:${BRIDGE_PORT}/maintenance/reap-timeouts \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### 预期
- 若任务仍活跃且已超时：
  - 有 retry 配额则 `requeued`
  - 超过配额则 `dead_letter`

---

## 五、结果检查

查询单个任务：
```bash
curl http://127.0.0.1:${BRIDGE_PORT}/tasks/task_xxx \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

重点看：
- `timeoutSec`
- `timedOutAt`
- `retryCount`
- `deadLetterReason`
- `claimedBy`
- `status`

---

## 六、结论标准

第六轮验证成功，至少意味着：
- worker heartbeat 生效
- `/workers` roster 可查询
- timeout watcher 能识别并回收卡死任务
- 与 fallback / retry 机制可协同工作
