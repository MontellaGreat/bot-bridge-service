# 第二到第五阶段执行状态

## 第二阶段：页面深化
已完成：
- 员工页远端员工信号改为复用员工总览卡片渲染链
- 远端员工显示统一头像、名字、状态、正在处理什么、最近产出
- 任务页远端任务证据增加更完整的 active/recent/dead-letter 展示
- 设置页新增远端 bridge 节点信息，补充 wiring/risk 之外的节点维度状态
- 总览页新增远端 bridge 节点概览卡

## 第三阶段：控制台改动归档与复用准备
已完成：
- 将 control-center 的本地适配修改导出为 patch
- 在本仓库中归档 patch 以供 fork / PR / 再应用
- 保留来源说明与改动边界说明

## 第四阶段：数据契约与接线资料固化
已完成：
- CONTROL_CENTER_API_PLAN.md
- CONTROL_CENTER_WIRING_MAP.md
- CONTROL_CENTER_FIELD_MAP.md
- CONTROL_CENTER_API_EXAMPLES.md
- CONTROL_CENTER_INTEGRATION_NOTE.md
- docs/control-center-patches/*.patch

## 第五阶段：远端执行观测增强
已完成：
- 远端 worker / staff / task / risk / wiring / nodes 观测接口全部落地
- control-center 已能通过 /api/bridge/* 读取远端 bridge 数据
- Overview / Staff / Tasks / Settings 页面已接入远端 bridge 观测模块

## 当前剩余事项
- openclaw-control-center 上游仓库推送权限不足，改动仅存在本地与 bot-bridge-service 归档中
- control-center systemd 部署已具备脚本和 unit，但仍需在目标环境继续保持发布验证
