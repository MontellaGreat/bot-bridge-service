# TESTING.md

# OpenClaw Agent Bridge 测试与验收手册

目标：统一 bridge / worker 的验证方式，覆盖：
1. health / 鉴权
2. worker heartbeat / roster
3. 任务闭环
4. 真实 `openclaw-cli` 执行
5. timeout watcher / retry / dead-letter
6. systemd 托管验活

---

## 一、准备

### 服务端 .env
```bash
BRIDGE_PORT=8787
BRIDGE_TOKEN=bridge-secret
BRIDGE_WORKER_TOKEN=worker-secret
BRIDGE_DEFAULT_TASK_TIMEOUT_SEC=600
```

### Worker 启动示例（真实 CLI）
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_WORKER_TOKEN=worker-secret \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_CAPABILITIES=research,writing,vision,engineering,testing,multimedia \
BRIDGE_WORKER_MODE=openclaw-cli \
BRIDGE_FALLBACK_TO_MOCK=false \
BRIDGE_HEARTBEAT_INTERVAL_MS=15000 \
OPENCLAW_RUN_TIMEOUT_MS=30000 \
node worker-openclaw.js
```

### Worker 启动示例（mock）
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_MODE=mock \
node worker-openclaw.js
```

---

## 二、health / 鉴权测试

### health
```bash
curl http://127.0.0.1:${BRIDGE_PORT}/health
```

### workers（需 token）
```bash
curl http://127.0.0.1:${BRIDGE_PORT}/workers \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### reap-timeouts（需 token）
```bash
curl -X POST http://127.0.0.1:${BRIDGE_PORT}/maintenance/reap-timeouts \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 预期
- `/health` 返回 `ok: true`
- `/workers` 返回 200
- `/maintenance/reap-timeouts` 返回 200

---

## 三、heartbeat / roster 测试

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

心跳时间应持续刷新。

---

## 四、任务闭环测试

发一个标准任务：
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
    "title":"闭环测试",
    "content":"请返回一句：任务已收到。",
    "maxRetries":0,
    "timeoutSec":120
  }'
```

查询任务：
```bash
curl http://127.0.0.1:${BRIDGE_PORT}/tasks/task_xxx \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### 预期
状态完整流转：
```text
queued -> claimed -> accepted -> running -> done
```

---

## 五、真实 OpenClaw CLI 模式测试

### 先做 CLI 直连自测
```bash
openclaw agent --agent main --message "test"
```

### 预期
- 返回码 0
- stdout 有正常输出
- stderr 为空或无致命错误

### 再做 bridge 真实任务测试
worker 使用：
- `BRIDGE_WORKER_MODE=openclaw-cli`
- `BRIDGE_FALLBACK_TO_MOCK=false`

然后下发任务，确认：
- 不是 mock 执行
- `resultSummary` 显示 `OpenClaw CLI executed task for agent ...`

---

## 六、timeout watcher 测试

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
    "maxRetries":1,
    "timeoutSec":1
  }'
```

等待超时后执行：
```bash
curl -X POST http://127.0.0.1:${BRIDGE_PORT}/maintenance/reap-timeouts \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 预期
- 第一次超时：`requeued`
- 超过配额后：`dead_letter`

重点看：
- `timeoutSec`
- `timedOutAt`
- `retryCount`
- `deadLetterReason`
- `status`
- `finishedAt`
- `error`

---

## 七、systemd 托管验活

```bash
systemctl status bot-bridge.service --no-pager
systemctl status bot-bridge-worker.service --no-pager
systemctl is-enabled bot-bridge.service
systemctl is-enabled bot-bridge-worker.service
```

### 预期
- 两个服务均为 `active (running)`
- 两个服务均已 `enabled`

---

## 八、结论标准

若以下全部满足，则可判定项目通过验收：
- bridge health 正常
- `/workers` roster 可查询
- heartbeat 持续刷新
- 任务可完整闭环
- 真实 `openclaw-cli` 模式成功
- timeout watcher 可回收超时任务
- retry / dead-letter 生效
- Bridge / Worker 已 systemd 托管并开机自启
