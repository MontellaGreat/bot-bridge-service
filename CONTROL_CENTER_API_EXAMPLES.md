# CONTROL_CENTER_API_EXAMPLES.md

# openclaw-control-center 联调返回样例

> 以下为 bridge `/control/*` 接口的推荐返回样例，供前端联调、mock 和页面接入使用。

---

## 1. `GET /control/overview`

```json
{
  "ok": true,
  "status": "attention",
  "summary": {
    "onlineWorkers": 2,
    "busyWorkers": 1,
    "idleWorkers": 1,
    "queuedTasks": 1,
    "runningTasks": 1,
    "deadLetterTasks": 0,
    "recentFailures": 0
  },
  "risks": [
    {
      "level": "warn",
      "code": "control_uses_bridge_token",
      "message": "Control API currently reuses BRIDGE_TOKEN."
    }
  ],
  "attention": [
    {
      "type": "task",
      "message": "1 task(s) currently running."
    },
    {
      "type": "queue",
      "message": "1 task(s) waiting in queue."
    }
  ],
  "staff": [
    {
      "workerId": "openclaw-node-b-worker",
      "nodeId": "openclaw-node-b",
      "targetAgent": "main",
      "status": "busy",
      "currentTaskId": "task_abc123",
      "nextStateHint": "working"
    },
    {
      "workerId": "openclaw-node-c-worker",
      "nodeId": "openclaw-node-c",
      "targetAgent": "main",
      "status": "idle",
      "currentTaskId": null,
      "nextStateHint": "waiting"
    }
  ],
  "updatedAt": "2026-03-14T12:00:00.000Z"
}
```

---

## 2. `GET /control/staff`

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
      "status": "busy",
      "online": true,
      "health": "online",
      "currentTaskId": "task_abc123",
      "capabilities": ["research", "writing", "testing"],
      "metadata": {
        "pollIntervalMs": 5000,
        "heartbeatIntervalMs": 15000
      },
      "lastHeartbeatAt": "2026-03-14T12:00:00.000Z",
      "lastTaskId": "task_abc123",
      "lastTaskStatus": "running",
      "lastResultSummary": null,
      "lastError": null,
      "updatedAt": "2026-03-14T12:00:00.000Z",
      "nextStateHint": "working"
    },
    {
      "workerId": "openclaw-node-c-worker",
      "nodeId": "openclaw-node-c",
      "targetAgent": "main",
      "displayName": "openclaw-node-c / main",
      "mode": "mock",
      "status": "idle",
      "online": true,
      "health": "online",
      "currentTaskId": null,
      "capabilities": [],
      "metadata": {},
      "lastHeartbeatAt": "2026-03-14T11:59:50.000Z",
      "lastTaskId": "task_xyz789",
      "lastTaskStatus": "done",
      "lastResultSummary": "Mock worker accepted task for agent main",
      "lastError": null,
      "updatedAt": "2026-03-14T11:59:50.000Z",
      "nextStateHint": "waiting"
    }
  ]
}
```

---

## 3. `GET /control/tasks/board`

```json
{
  "active": [
    {
      "id": "task_abc123",
      "title": "第十三轮联调任务",
      "status": "running",
      "sourceNode": "openclaw-node-a",
      "sourceAgent": "main",
      "targetNode": "openclaw-node-b",
      "targetAgent": "main",
      "claimedBy": "openclaw-node-b-worker",
      "claimedAt": "2026-03-14T11:58:00.000Z",
      "acceptedAt": "2026-03-14T11:58:01.000Z",
      "startedAt": "2026-03-14T11:58:02.000Z",
      "timeoutSec": 300,
      "retryCount": 0,
      "deadLetterReason": null,
      "resultSummary": null,
      "error": null,
      "executionMode": "openclaw-cli",
      "artifactPath": null,
      "remoteSessionKey": null,
      "fallbackReason": null
    }
  ],
  "stalled": [],
  "recent": [
    {
      "id": "task_xyz789",
      "title": "最近成功任务",
      "status": "done",
      "resultSummary": "OpenClaw CLI executed task for agent main",
      "error": null,
      "executionMode": "openclaw-cli"
    },
    {
      "id": "task_dead001",
      "title": "超时任务",
      "status": "dead_letter",
      "resultSummary": "task timed out and moved to dead letter",
      "error": "task_timeout after 1s",
      "deadLetterReason": "task_timeout"
    }
  ],
  "deadLetters": [
    {
      "id": "task_dead001",
      "title": "超时任务",
      "status": "dead_letter",
      "deadLetterReason": "task_timeout",
      "error": "task_timeout after 1s"
    }
  ],
  "updatedAt": "2026-03-14T12:00:00.000Z"
}
```

---

## 4. `GET /control/tasks/recent`

```json
{
  "count": 2,
  "tasks": [
    {
      "id": "task_xyz789",
      "title": "最近成功任务",
      "status": "done",
      "resultSummary": "OpenClaw CLI executed task for agent main",
      "error": null,
      "executionMode": "openclaw-cli",
      "finishedAt": "2026-03-14T11:57:00.000Z"
    },
    {
      "id": "task_dead001",
      "title": "超时任务",
      "status": "dead_letter",
      "resultSummary": "task timed out and moved to dead letter",
      "error": "task_timeout after 1s",
      "deadLetterReason": "task_timeout",
      "finishedAt": "2026-03-14T11:56:00.000Z"
    }
  ]
}
```

---

## 5. `GET /control/errors/recent`

```json
{
  "count": 1,
  "errors": [
    {
      "taskId": "task_dead001",
      "targetNode": "openclaw-node-b",
      "targetAgent": "main",
      "status": "dead_letter",
      "error": "task_timeout after 1s",
      "deadLetterReason": "task_timeout",
      "claimedBy": "openclaw-node-b-worker",
      "updatedAt": "2026-03-14T11:56:00.000Z"
    }
  ]
}
```

---

## 6. `GET /control/settings/wiring`

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

## 7. `GET /control/settings/risk-summary`

```json
{
  "ok": true,
  "status": "attention",
  "count": 3,
  "risks": [
    {
      "level": "warn",
      "code": "control_uses_bridge_token",
      "title": "控制面与主桥接共用 token",
      "message": "当前 /control/* 沿用 BRIDGE_TOKEN，建议单独配置 BRIDGE_CONTROL_TOKEN。",
      "impact": "控制面鉴权隔离不足。",
      "suggestion": "新增并启用 BRIDGE_CONTROL_TOKEN。"
    },
    {
      "level": "warn",
      "code": "dead_letter_present",
      "title": "存在 dead-letter 任务",
      "message": "当前共有 1 条 dead-letter 任务。",
      "impact": "说明部分任务已经失败并退出主流程。",
      "suggestion": "查看 /control/errors/recent 与 /control/tasks/board 排查原因。"
    },
    {
      "level": "info",
      "code": "only_mock_workers",
      "title": "当前仅检测到 mock worker",
      "message": "所有 worker 当前都在 mock 模式下运行。",
      "impact": "控制中心可看到链路，但真实 CLI 执行证据不足。",
      "suggestion": "若需要真实执行观测，请启用 openclaw-cli 模式 worker。"
    }
  ],
  "updatedAt": "2026-03-14T12:00:00.000Z"
}
```

---

## 8. `GET /control/nodes`

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
      "lastHeartbeatAt": "2026-03-14T12:00:00.000Z",
      "lastTaskAt": "2026-03-14T11:57:00.000Z"
    },
    {
      "nodeId": "openclaw-node-b",
      "label": "openclaw-node-b",
      "online": true,
      "health": "online",
      "workerCount": 1,
      "activeTaskCount": 1,
      "agents": ["main"],
      "modes": ["mock"],
      "lastHeartbeatAt": "2026-03-14T12:00:00.000Z",
      "lastTaskAt": "2026-03-14T11:58:02.000Z"
    }
  ]
}
```

---

## 9. `GET /control/nodes/:nodeId`

```json
{
  "nodeId": "openclaw-node-b",
  "label": "openclaw-node-b",
  "online": true,
  "health": "online",
  "workerCount": 1,
  "activeTaskCount": 1,
  "agents": ["main"],
  "modes": ["mock"],
  "lastHeartbeatAt": "2026-03-14T12:00:00.000Z",
  "lastTaskAt": "2026-03-14T11:58:02.000Z",
  "workers": [
    {
      "workerId": "openclaw-node-b-worker",
      "nodeId": "openclaw-node-b",
      "targetAgent": "main",
      "displayName": "openclaw-node-b / main",
      "mode": "mock",
      "status": "busy",
      "online": true,
      "health": "online",
      "currentTaskId": "task_abc123",
      "lastTaskId": "task_abc123",
      "lastTaskStatus": "running"
    }
  ],
  "recentTasks": [
    {
      "id": "task_abc123",
      "title": "节点详情联调任务",
      "status": "running"
    }
  ],
  "recentErrors": []
}
```

---

## 一句话总结

如果 control-center 需要快速联调：
- 页面逻辑按 `CONTROL_CENTER_FIELD_MAP.md`
- mock 数据直接用这份 `CONTROL_CENTER_API_EXAMPLES.md`

就能先把页面接起来。
