# FINAL_ACCEPTANCE_CHECKLIST.md

# 正式收尾验收清单

## 项目
- `bot-bridge-service`
- 关联适配：`openclaw-control-center`

## 一、Bridge 主链路
- [x] 任务可创建
- [x] 任务可被远端 worker claim
- [x] 状态流转完整：`queued -> claimed -> accepted -> running -> done`
- [x] 结果可回写
- [x] 可验证 mock / openclaw-cli 两种执行模式

## 二、Worker 机制
- [x] worker 可正常轮询任务
- [x] worker 支持 heartbeat
- [x] 对旧 bridge 无 `/workers/heartbeat` 的情况已做兼容降级
- [x] worker roster 可见
- [x] `/workers` 和 `/workers/:id` 可查询

## 三、超时 / 重试 / 死信
- [x] `timeoutSec` 已落地
- [x] `timedOutAt` 已落地
- [x] `/maintenance/reap-timeouts` 可用
- [x] 超时任务可重新入队
- [x] 超过重试上限后进入 `dead_letter`

## 四、systemd 托管
- [x] bridge 已具备 systemd 托管能力
- [x] worker 已具备 systemd 托管能力
- [x] control-center 已补充 systemd unit 与启动脚本
- [x] control-center 已验证可作为 systemd 服务启动并监听 4310

## 五、Control API
- [x] `/control/overview`
- [x] `/control/staff`
- [x] `/control/tasks/board`
- [x] `/control/tasks/recent`
- [x] `/control/errors/recent`
- [x] `/control/settings/wiring`
- [x] `/control/settings/risk-summary`
- [x] `/control/nodes`
- [x] `/control/nodes/:nodeId`

## 六、Control Center 适配
- [x] `openclaw-control-center` 已加入 bridge adapter
- [x] 已新增 `/api/bridge/*` 代理层
- [x] Overview 页面已接入远端 Bridge 总览
- [x] Staff 页面已接入远端员工信号
- [x] Tasks 页面已接入远端任务证据
- [x] Settings 页面已接入接线状态 / 风险摘要 / 节点信息
- [x] 远端员工显示已对齐到员工总览卡片渲染链

## 七、对外访问
- [x] control-center 已验证监听 `0.0.0.0:4310`
- [x] 公网地址已形成：`http://8.208.117.47:4310`
- [x] bridge 已接入正式远端地址：`http://180.76.180.94:8787`

## 八、文档与归档
- [x] README 已更新
- [x] TESTING.md 已更新
- [x] OPERATIONS.md 已补充
- [x] control-center API 设计文档已补充
- [x] field map / wiring map / examples 已补充
- [x] control-center 来源与适应性修改说明已补充
- [x] control-center patch 已归档

## 九、剩余边界（已知但不阻塞验收）
- [ ] `openclaw-control-center` 上游仓库未直接 push（权限不足）
- [ ] `BRIDGE_CONTROL_TOKEN` 仍未独立配置，当前与 `BRIDGE_TOKEN` 共用
- [ ] 若后续进入正式运营，仍建议补一次控制台长期稳定性回归

## 验收结论
当前可判定：

> **bridge 主链路、worker 机制、control 接口、control-center 适配与页面点亮均已完成，项目进入正式收尾状态。**
