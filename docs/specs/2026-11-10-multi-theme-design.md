# SEO 页面多主题 — 设计文档

- **日期**: 2026-11-10
- **范围**: `/browse`、`/suburb/*`、`/school/*`、`/catchment/*`、`/ranking/*` 及其 `/zh` 版本；第三期起包括地图应用（`/schools`）。
- **状态**: 第一至三期已完成（第二期计划见 `docs/plans/2026-11-10-map-first-layouts.md`）
- **设计稿**: https://claude.ai/artifact/5SsDLAWo78mMK3vCHvzQvu（画布第五至七行是定稿，第一行和第三行是另外两套主题的来源）

## 1. 为什么做

2026-11-10 比较了几套视觉方向，选定「地图优先的明亮产品风」（下称 **bright**）作为默认。另外两套也要保留：

- **atlas**（Civic Atlas）：衬线标题、墨蓝、细线分隔，像一份排版讲究的刊物。
- **harbour**（Civic Atlas × 港湾蓝）：atlas 的版式，首屏和部分板块铺港湾蓝色块。

保留的用途是 A/B 测试（例如中文页分流一部分给 harbour，比较点击率和停留时间），数据支持的话再考虑给读者一个「阅读风格」开关。品牌对外先只用 bright 一张脸。

## 2. 三套主题差在哪

| | bright | atlas | harbour |
|---|---|---|---|
| 页面底色 | 天空蓝 `#EEF4FF` | 白 | 白 |
| 板块分组 | 白卡片，圆角 24，轻阴影 | 顶部一条细线，无底色 | 同 atlas |
| 首屏 | 白卡片 | 白底 | 港湾蓝整块，白字 |
| 品牌色 | 钴蓝 `#1F5EEA` | 墨蓝 `#14213D` | 港湾蓝 `#183A8C` |
| 点缀色 | 太阳黄 `#FFD34D` | 无（用墨蓝） | 无（用港湾蓝） |
| 标题字体 | Bricolage Grotesque | Newsreader | Newsreader |
| 正文字体 | DM Sans | IBM Plex Sans | IBM Plex Sans |
| 中文 | 系统黑体 | 标题系统宋体，正文系统黑体 | 同 atlas |
| 小标签 | 正常大小写，13px 600 | 全大写加字距，12px 600 | 同 atlas |
| 按钮 | 胶囊形 | 圆角 6 | 圆角 6 |

三套共用的硬规则：代表办学性质的绿、紫、橙（`SECTOR_COLORS`）不随主题变；学区边界用品牌色，不借用这三种色相；正文不小于 15px，说明文字不小于 13px；所有文字对比度 ≥ 4.5:1。

## 3. 怎么实现

### 3.1 主题由 `<html data-theme>` 决定

- 服务端输出 `<html data-theme="bright">`，没有 JavaScript 时就是 bright。
- `<head>` 里一段内联脚本在首次绘制前改写 `data-theme`。顺序：URL 的 `?theme=` → `localStorage` 里记住的选择 → 默认。`?theme=` 同时写进 `localStorage`，所以带参数打开一次，之后浏览都保持该主题。
- 不读 cookie。页面是静态生成 / ISR，服务端读 cookie 会让所有页面变成动态渲染。做法与常见的暗色模式切换相同。
- 解析逻辑放在 `lib/theme.ts`，纯函数，有单元测试；内联脚本由同一份常量生成，主题列表只有一处定义。

### 3.2 颜色和字体是 CSS 变量

`app/globals.css` 为每个主题定义一组 `--bs-*` 变量，再用 Tailwind 4 的 `@theme inline` 映射成工具类：`text-ink`、`text-muted`、`text-link`、`bg-canvas`、`bg-surface`、`bg-soft`、`border-line`、`bg-brand`、`text-on-brand`、`bg-accent` 等，以及 `font-display`、`font-body`。

组件只用这些语义类。写死的 `text-gray-500`、`text-indigo-700` 全部替换掉；办学性质徽章（`sectorBadgeClass`）例外，它与地图共用且不随主题变。

### 3.3 结构差异用少量组件类

颜色之外的差异（卡片还是细线、首屏是否铺色、标签是否全大写）由 `@layer components` 里的几个类承担，各主题分别定义：

- `bs-section`：一个内容板块。bright 是白卡片，atlas / harbour 是顶部细线。
- `bs-hero`：页面顶部的标题区。harbour 铺品牌色并全出血（用 `box-shadow` + `clip-path` 从容器内延伸到视口两侧，不改 DOM 结构）。
- `bs-h1`、`bs-h2`、`bs-label`、`bs-figure`（关键数字）、`bs-btn`、`bs-btn-quiet`、`bs-note`。

HTML 对三套主题完全一样，搜索引擎看到的内容不随主题变。

### 3.4 字体按需加载

`next/font` 加载四个字体并暴露为 CSS 变量。bright 的两个字体 `preload: true`；atlas / harbour 的 `preload: false`，浏览器只有在当前主题真的用到时才下载。中文不加载网络字体，用系统字体栈（黑体：PingFang SC、Microsoft YaHei、Noto Sans CJK SC；宋体：Songti SC、Noto Serif CJK SC、SimSun），避免几 MB 的中文字体。

### 3.5 SVG 图形跟主题走

学校页的邻里示意图和各类条形图改用 CSS 变量着色（`style={{ stroke: 'var(--bs-zone)' }}`），学区边界、环线、数据条随主题变色；学校圆点仍用 `SECTOR_COLORS`。

## 4. 分期

1. **第一期（本文档）**：主题基础设施、语义类、所有 SEO 页面换成语义类、三套主题都能用 `?theme=` 预览。版式基本保持现在的结构。
2. **第二期**：按定稿重排版式——学校页、suburb 页、学区页的地图分栏首屏（静态 SVG，基于真实学区几何），排名页的前三名卡片，Browse 页首屏。
3. **第三期**：地图应用换装。只换颜色、字体和圆角，功能和布局不变；地图本身的编码（办学性质三色、小学/中学学区线颜色、选中圈）不随主题变。定稿里的结构改动（详情卡片浮在地图上、筛选改下拉）没有做。
4. **第四期**：A/B 分流与统计。

## 5. 不做的事

- 不做读者可见的主题切换开关（等 A/B 数据）。
- 不做暗色模式。第三期删掉了 `globals.css` 里原来只影响地图应用的 `prefers-color-scheme: dark` 变量，全站一直是浅色。
