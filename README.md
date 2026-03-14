# OpenClaw Agent Bridge

跨服务器 OpenClaw 的轻量级 agent-to-agent 任务桥接服务。

## 新定位

这个项目不再只面向“bot 与 bot 之间的消息桥接”。

它现在的目标是：
- 不同服务器上的 OpenClaw 之间可以互相投递任务
- 本机主 Agent 可以把任务下发给远端 OpenClaw 的某个 agent
- 远端成功签收、执行并回传结果
- 形成跨服务器的主从协作链路

一句话：
> 这是一个 **OpenClaw-to-OpenClaw agent task bus**。

---

## 当前阶段结论（第十二轮收尾）

截至 2026-03-14，项目已完成以下验证：
- Bridge 主链路闭环成功
- 管理接口 `/workers` 与 `/maintenance/reap-timeouts` 可用
- worker roster / heartbeat 生效
- Bridge 与 Worker 均已纳入 systemd 托管
- timeout watcher / retry / dead-letter 生效
- **真实 `openclaw-cli` 执行模式已打通，不再仅依赖 mock fallback**

当前可将项目状态标记为：

> **Cross-Server OpenClaw Agent Bridge Verified**
>
> 包含：真实 CLI 执行、systemd 托管、worker roster、超时回收、重试与死信。

---

## 核心能力

### 服务端
- `POST /tasks` 创建任务
- `GET /tasks` 查询任务列表
- `GET /tasks/:id` 查询单任务
- `POST /tasks/:id/claim` 任务签收 / 认领
- `POST /tasks/:id/status` 更新任务状态
- `POST /tasks/:id/result` 回写执行结果
- `POST /tasks/:id/retry` 重试或进入 dead-letter
- `POST /workers/heartbeat` worker 心跳上报
- `GET /workers` 查询 worker roster
- `GET /workers/:id` 查询单个 worker
- `POST /maintenance/reap-timeouts` 手动触发超时回收
- `GET /health` 健康检查
- Bridge Token / Worker Token 鉴权
- SQLite 持久化

### Worker
- 轮询属于本节点 / 本 agent 的 `queued` 任务
- 按能力声明过滤可处理任务
- claim 任务
- 更新 `accepted` / `running`
- 执行本地 worker 逻辑：
  - `mock`
  - `openclaw-cli`
- 支持失败后按重试次数自动 retry 或进入 dead-letter
- 支持心跳上报与 roster 注册
- 支持对老 bridge 的 heartbeat 404 兼容降级

---

## 真实 CLI 执行说明

已验证可用的命令形态为：

```bash
openclaw agent --agent main --message "test"
```

worker 当前优先使用：

```bash
openclaw agent --agent <target> --message <prompt>
```

这意味着：
- 第十一轮前曾存在 CLI 子命令选择错误
- 当前已修正为优先走真实可用命令
- 真实 `openclaw-cli` 模式已完成 bridge 闭环验证

---

## systemd 托管

当前建议采用双服务托管：

- `bot-bridge.service`：bridge 服务端
- `bot-bridge-worker.service`：worker 进程

仓库内已提供：
- `systemd/bot-bridge-worker.service.example`
- `start-bot-bridge-worker.sh`

建议部署后执行：

```bash
systemctl daemon-reload
systemctl enable --now bot-bridge.service
systemctl enable --now bot-bridge-worker.service
```

---

## 运维验活

### 1. 健康检查
```bash
curl http://127.0.0.1:8787/health
```

### 2. worker roster
```bash
curl http://127.0.0.1:8787/workers \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}"
```

### 3. 超时回收
```bash
curl -X POST http://127.0.0.1:8787/maintenance/reap-timeouts \
  -H "Authorization: Bearer ${BRIDGE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### 4. systemd 状态
```bash
systemctl status bot-bridge.service --no-pager
systemctl status bot-bridge-worker.service --no-pager
```

---

## 当前已知边界

虽然主链路已验证通过，但仍建议持续关注：
- 多节点并发抢单下的竞争行为
- 更细粒度的权限模型
- 更丰富的 worker 能力路由
- 自动化运维巡检与告警
- 真实业务任务的长时间执行稳定性

---

## 结论

这个仓库现在已经不只是“概念验证”。

它已经具备：
- 跨服务器任务投递
- worker 注册与心跳
- systemd 托管
- 真实 OpenClaw agent 执行
- timeout / retry / dead-letter

可以进入下一阶段：
> **稳定性增强、自动化运维与多节点扩展**
