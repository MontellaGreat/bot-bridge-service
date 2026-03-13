# TESTING.md

# 第四轮测试办法（鉴权 / 重试 / 能力匹配验证）

目标：验证 bridge 是否已经具备：
1. worker 独立 token
2. 能力声明过滤
3. retry / dead-letter 基础能力
4. 真实执行与 mock 降级闭环

---

## 一、准备

### 1. 服务端 .env
```bash
BRIDGE_PORT=8787
BRIDGE_TOKEN=bridge-secret
BRIDGE_WORKER_TOKEN=worker-secret
BRIDGE_NODE_ID=openclaw-node-b
```

### 2. worker 启动示例
```bash
source .env
BRIDGE_URL=http://127.0.0.1:${BRIDGE_PORT} \
BRIDGE_WORKER_TOKEN=worker-secret \
BRIDGE_NODE_ID=openclaw-node-b \
BRIDGE_TARGET_AGENT=main \
BRIDGE_WORKER_CAPABILITIES=research,writing,vision,engineering,testing,multimedia \
BRIDGE_WORKER_MODE=openclaw-cli \
BRIDGE_FALLBACK_TO_MOCK=true \
OPENCLAW_RUN_TIMEOUT_MS=30000 \
node worker-openclaw.js
```

---

## 二、能力匹配测试

### 发一个只需要 `research` 的任务
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
    "title":"研究测试",
    "content":"请执行一个研究测试任务",
    "requiredCapabilities":["research"],
    "maxRetries":1
  }'
```

### 预期
如果 worker 声明了 `research`，则会接单。

---

## 三、能力不匹配测试

### 发一个需要 `video-editing-pro` 的任务
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
    "title":"能力过滤测试",
    "content":"请执行一个高阶视频编辑任务",
    "requiredCapabilities":["video-editing-pro"]
  }'
```

### 预期
worker 不应处理该任务，任务保持 `queued`。

---

## 四、retry / dead-letter 测试

### 发一个会失败的任务，并限制 `maxRetries=1`
让 worker 在真实模式下尝试执行一个必然失败的任务。

### 预期
- 第一次失败 -> retry -> 回到 `queued`
- 第二次再失败 -> `dead_letter`

---

## 五、结果检查

查询任务：
```bash
curl http://127.0.0.1:${BRIDGE_PORT}/tasks/task_xxx \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

重点看：
- `retryCount`
- `maxRetries`
- `deadLetterReason`
- `requiredCapabilities`
- `claimedBy`
- `executionMode`
- `fallbackReason`

---

## 六、结论标准

第四轮验证成功，至少意味着：
- worker token 生效
- 能力过滤生效
- retry/dead-letter 生效
- 真实执行失败时可明确降级或明确失败
