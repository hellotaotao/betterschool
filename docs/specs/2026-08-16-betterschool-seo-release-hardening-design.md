# BetterSchool SEO 发布加固设计

## 目标

在不改变现有 SEO 路由架构的前提下，修正发布审查确认的数据正确性问题，并用 Vercel Preview 验证约 17,869 个预渲染页面的真实部署可行性。只有 Preview 成功、自动化验证通过后，才把变更推送到 `main`。

## 范围

- 多 catchment 学校必须按每一个 zone 分别计算并展示“区域内其他学校”，不能拿第一个 zone 的结果代表全部 zone。
- zone 内学校列表必须先完整计算、稳定排序，再按调用方明确传入的上限截断；页面默认展示完整列表。
- 学校官网只接受可解析且包含 hostname 的 `http:` / `https:` URL；`http://`、空值及其他 scheme 不进入链接或 JSON-LD。
- 保留现有 school/suburb/catchment 静态生成策略和 sitemap 范围。本轮不重新设计 slug、canonical 或 robots 策略。
- 用 Vercel Preview 验证当前完整预渲染产物；若 Preview 因体积或文件数失败，停止发布并回到按需生成方案的设计决策，不直接推生产。

## 实现边界

- URL 清洗放进独立纯函数，页面只消费清洗后的结果。
- zone 页面数据整理放进 `lib/schoolsData.ts` 的可测试 helper；页面不再手工选择 `zones[0]`。
- 测试使用真实 canonical school/catchment 数据验证 122 个多 zone 学校中的代表样本，以及当前含 44 所其他学校的大 zone，防止以后重新引入静默截断。
- 不提交现有主目录里的 `.playwright-mcp/`、截图或旧计划文档。

## 验收

- 新测试先在旧实现上失败，再在修复后通过。
- 全部 Vitest 测试通过；本次变更文件 lint 通过；production build 成功。
- 本地 smoke 的 schools、school、suburb、catchment、robots、sitemap 返回 200。
- Vercel Preview 部署成功并能访问上述代表路由。
- 独立代码审查无 blocker/important issue 后，快进本地主目录 `main` 并 push `origin/main`。
