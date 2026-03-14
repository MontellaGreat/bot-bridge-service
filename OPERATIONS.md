# OPERATIONS.md

# OpenClaw Agent Bridge 运维手册

## 1. 服务清单

- bridge 服务：`bot-bridge.service`
- worker 服务：`bot-bridge-worker.service`

---

## 2. 常用命令

### 查看状态
```bash
systemctl status bot-bridge.service --no-pager
systemctl status bot-bridge-worker.service --no-pager
```

### 重启服务
```bash
systemctl restart bot-bridge.service
systemctl restart bot-bridge-worker.service
```

### 开机自启
```bash
systemctl enable bot-bridge.service
systemctl enable bot-bridge-worker.service
```

### 查看日志
```bash
journalctl -u bot-bridge.service -n 100 --no-pager
journalctl -u bot-bridge-worker.service -n 100 --no-pager
```

---

## 3. 验活命令

### health
```bash
curl http://127.0.0.1:8787/health
```

### workers
```bash
source .env
curl http://127.0.0.1:8787/workers \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### reap-timeouts
```bash
source .env
curl -X POST http://127.0.0.1:8787/maintenance/reap-timeouts \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## 4. 常见问题排查

### 问题 1：`/workers` 返回 401
原因：
- 当前 shell 没有加载 `BRIDGE_TOKEN`
- token 填错

处理：
```bash
source .env
curl http://127.0.0.1:8787/workers \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### 问题 2：`/workers` 返回空数组
原因：
- worker 没启动
- worker 连错 bridge
- heartbeat 没上报成功

处理：
```bash
systemctl status bot-bridge-worker.service --no-pager
journalctl -u bot-bridge-worker.service -n 100 --no-pager
```

### 问题 3：worker 心跳有，但不接任务
原因：
- `targetNode` / `targetAgent` 不匹配
- 能力过滤不匹配
- worker 实际在看别的 bridge

处理：
检查：
- `BRIDGE_NODE_ID`
- `BRIDGE_TARGET_AGENT`
- `BRIDGE_WORKER_CAPABILITIES`
- 任务中的 `targetNode` / `targetAgent` / `requiredCapabilities`

### 问题 4：真实 CLI 执行失败
原因：
- OpenClaw CLI 命令不可用
- gateway/runtime 阻塞
- worker 使用了错误 CLI 形态

处理：
先直测：
```bash
openclaw agent --agent main --message "test"
```

若失败，记录：
- 返回码
- stdout
- stderr
- worker 日志

### 问题 5：任务卡住不结束
处理：
执行超时回收：
```bash
source .env
curl -X POST http://127.0.0.1:8787/maintenance/reap-timeouts \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## 5. 推荐巡检项

每天至少看：
- bridge 是否 running
- worker 是否 running
- `/health` 是否正常
- `/workers` 是否仍能看到 worker
- `lastHeartbeatAt` 是否持续刷新
- 最近是否出现 dead-letter 激增

---

## 6. 当前结论

当前 bridge 体系已经进入可运维状态：
- 服务可托管
- 可验活
- 可排障
- 可进行超时回收
- 可观察 worker roster 与 heartbeat
