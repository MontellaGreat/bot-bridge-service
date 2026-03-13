# WORKER_PLAN

## 目标
为远端服务器补一个 OpenClaw worker，使其能：
- 拉取指向本节点/本 agent 的任务
- claim 任务
- 调本地 OpenClaw agent 执行
- 更新状态
- 回写结果

---

## 最小 worker 循环

```text
poll tasks(target_node=self, target_agent=xxx, status=queued)
  -> claim task
  -> status=accepted
  -> invoke local OpenClaw agent
  -> status=running
  -> collect result
  -> result=status done/failed
```

---

## worker 必要输入
- bridge URL
- bridge token
- node id
- local target agent mapping
- polling interval

---

## 第一版不急着做的事
- 自动回调
- 多 token / 多节点认证策略
- 完整重试策略
- 任务取消广播

先把最小闭环打通最重要。
