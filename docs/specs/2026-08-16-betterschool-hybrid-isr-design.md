# BetterSchool 混合 ISR 发布设计

## 背景

全量预渲染 11,034 个 school、4,799 个 suburb 和 2,029 个 catchment 页面时，Next.js 能完成 17,869 个页面的构建，但 Vercel 在部署约 10 万个输出文件时失败。失败发生在 `Deploying outputs`，不是页面编译、类型检查或数据生成阶段。

## 目标

- 保留全部可索引 school、suburb 和 catchment URL、canonical、metadata、结构化数据及 sitemap。
- 避免每次部署同时生成全部长尾页面。
- 让有效长尾 URL 第一次访问时生成静态结果，之后从 Vercel CDN / ISR 缓存提供。
- 让无效 state/slug 继续返回 404。
- 在 Vercel Hobby 层完成 Preview 验证后才推送生产。

## 方案

### 构建时页面

首页、`/schools`、`robots.txt` 和 `sitemap.xml` 继续在构建时生成。三个动态 SEO 路由的 `generateStaticParams()` 都返回空数组，因此不在 build 中枚举长尾页面。

本轮不武断选择一批“热门学校”预热，因为项目目前没有可靠访问数据。将来有真实流量数据后，可以让 `generateStaticParams()` 返回一个小型热门子集，不改变其余架构。

### 首次访问与缓存

school、suburb 和 catchment 路由统一设置：

- `dynamicParams = true`：允许访问 build 时没有列出的合法 URL。
- `generateStaticParams() = []`：Next.js 在首次请求时静态生成该 URL。
- `revalidate = false`：缓存结果不按时间重复生成；canonical 数据变更通过新部署自然刷新。

有效 URL 首次请求返回完整 HTML 并写入 ISR 缓存；后续请求命中缓存。无效 URL 仍由现有数据查找和 `notFound()` 返回 404。

### SEO

`sitemap.xml` 仍列出全部 17,863 个 canonical URL。搜索引擎抓取长尾 URL 时收到完整的服务器端 HTML、metadata 和 JSON-LD，而不是客户端占位页，因此索引能力不因改用运行时首次生成而降低。唯一变化是第一次访问可能有一次冷生成延迟。

### 更新策略

canonical 学校数据随代码部署，不需要新增 revalidation API。每个 Vercel deployment 使用独立 ISR 缓存，新数据发布时部署新版本即可。避免定时 revalidation 能减少 Hobby 层不必要的函数执行和 ISR 写入。

## 验证

- 测试先证明三个动态路由当前仍生成参数或拒绝未知参数，再修改为统一 ISR 策略。
- 全部 Vitest、变更文件 ESLint、TypeScript 和 `git diff --check` 通过。
- production build 成功，并确认输出页面数、产物体积和文件数大幅下降。
- 本地 `next start` 对代表性的 school、suburb、单 zone catchment、多 zone catchment 路由返回 200；无效 URL 返回 404。
- 对同一路由连续请求，使用 `x-nextjs-cache` 或 Vercel cache header 验证首次 MISS、随后 HIT。
- Vercel Preview 必须达到 `READY`，并通过代表路由、`robots.txt` 和 `sitemap.xml` 抽查。
- Preview 成功后 fast-forward 到 `main`、push `origin/main`，最后确认生产 URL 和 SEO 端点返回 200。

## 非目标

- 不新增 CMS、数据库或 revalidation 管理 API。
- 不修改 slug 稳定性、canonical、robots 或 sitemap 范围。
- 不升级 Vercel 套餐。
- 不提交主工作区现有的 Playwright 文件、截图或旧计划。
