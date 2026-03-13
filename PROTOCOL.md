# PROTOCOL

## 任务模型（v2 方向）

推荐任务字段：
- `id`
- `source_node`
- `source_agent`
- `target_node`
- `target_agent`
- `type`
- `title`
- `content`
- `priority`
- `complexity`
- `conversation_id`
- `metadata`
- `status`
- `claimed_by`
- `claimed_at`
- `accepted_at`
- `started_at`
- `finished_at`
- `result_summary`
- `result`
- `error`

---

## 状态机

```text
queued -> claimed -> accepted -> running -> handoff -> done
queued -> claimed -> accepted -> running -> failed
queued -> blocked | stopped | timeout
```

---

## API 约定

### 创建任务
`POST /tasks`

### 查询任务
`GET /tasks`
`GET /tasks/:id`

### 签收任务
`POST /tasks/:id/claim`

### 更新状态
`POST /tasks/:id/status`

### 回写结果
`POST /tasks/:id/result`

---

## 兼容策略

v2 方向升级中，允许兼容旧字段：
- `source`
- `target`
- `content`
- `conversationId`

但新实现应优先使用：
- `source_node`
- `source_agent`
- `target_node`
- `target_agent`
- `conversation_id`

---

## 结果回传建议

结果回传至少包含：
- `status`
- `result_summary`
- `result`
- `error`
- `finished_at`
- `remote_agent`
- `remote_session_key`（如适用）
