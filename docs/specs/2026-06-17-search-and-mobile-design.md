# 搜索 + 移动端适配 — 设计文档

- **日期**: 2026-06-17
- **范围**: 给 betterschool.au 加学校搜索 + 让站点在手机上可用
- **状态**: 设计已通过,待写实现计划

## 1. 背景与现状

betterschool.au 是一张覆盖全澳的学校地图:

- **数据**: 11,034 所学校(ACARA 2025 官方数据),8 个州/领地。静态文件 `public/data/schools.canonical.json`(原始 12.7MB,brotli 后 ~1.2MB),客户端 `fetch` 后全量载入内存。
- **技术栈**: Next.js 16 + React 19 + Leaflet/OpenStreetMap。
- **结构**: 几乎所有 UI 都堆在单个客户端组件 `app/schools/page.tsx`(558 行)里——顶部筛选条、左侧列表面板、右侧详情面板、图例。
- **渲染优化**: 地图只渲染当前视口内的标记(`BoundsTracker` 在 `moveend` 时算出可见学校),列表也绑定在视口内。

### 当前的两个核心缺口

1. **没有搜索**。要找一所具体学校,只能拖地图 + 在视口列表里翻。对「找学校」产品这是硬伤。
2. **移动端是坏的**。桌面布局直接搬到窄屏:筛选胶囊横向溢出被裁切,左侧列表面板盖住几乎整个地图,详情面板还会再叠一层。

## 2. 目标与非目标

### 目标
1. **搜索**:按校名 / 区名 / 邮编搜索,纯本地数据,**零外部依赖、零成本**。
2. **移动端**:用底部抽屉(bottom sheet)布局让站点在手机上好用。

### 非目标(本次不做,留作后续)
- 付费地理编码(Mapbox/Nominatim 等)——明确排除。
- SEO / 每校独立页面 / 服务端渲染。
- 地图标记聚合(clustering)。
- 学校对比功能。
- 图例的移动端重新设计(本次仅收起)。

## 3. 已锁定的决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 搜索数据源 | 纯本地 `schools.canonical.json` | 区名本就是数据字段,搜「Parramatta」即搜该区学校,免费覆盖「地名搜索」需求;付费 API 的麻烦大于收益 |
| 移动端布局 | 底部抽屉(方案 A) | 最像 Google Maps / 房产 App,地图与列表能同时看到 |
| 代码组织 | 拆分巨型 page 组件 | 558 行的文件再塞搜索+移动端会到 800+ 行且桌面/移动逻辑缠绕;动到的过大文件应顺手改善 |

## 4. 架构

### 4.1 组件拆分

把 `app/schools/page.tsx` 从「装一切的巨型组件」拆成职责单一的小块:

| 单元 | 职责 | 接口要点 | 依赖 |
|---|---|---|---|
| `app/schools/page.tsx` | **状态容器**:数据 fetch、筛选/搜索/选中状态、定位协调、桌面/移动布局切换 | — | 下列所有组件 |
| `components/SearchBox.tsx` | 搜索输入框 + 结果下拉 | props: `allSchools`, `dictionary`; emit `onPickSchool(school)`, `onPickPlace(schools[])` | `lib/searchSchools` |
| `components/FilterBar.tsx` | 5 组筛选胶囊;移动端横向滑动 | props: `filters`, `onChange`, `dictionary` | — |
| `components/SchoolList.tsx` | 列表卡片 + 排序选择 + 区域统计 + 数据说明 | props: `schools`, `selectedSchool`, `sortBy`, callbacks, `dictionary` | `utils/schoolFilters` |
| `components/SchoolDetail.tsx` | 学校详情面板(从 page 抽出) | props: `school`, `onClose`, `dictionary` | `lib/i18n` |
| `components/BottomSheet.tsx` | **移动端专用**:承载 List / Detail 的可吸附抽屉 | props: `snap`('peek'\|'expanded'), `onSnapChange`, `children` | — |
| `components/SchoolMap.tsx` | 现有地图,**新增**「飞到某区所有学校」的 `fitBounds` 能力 | 新增 prop:`fitToSchools?: School[]` | leaflet |
| `lib/searchSchools.ts` | **纯函数**:`query + allSchools → 排序后的匹配结果` | `searchSchools(query, schools): SearchResult[]` | 无(可单测) |
| `lib/useMediaQuery.ts` | 响应式断点 hook | `useMediaQuery('(max-width: 768px)'): boolean` | 无 |

### 4.2 数据流

```
page.tsx (状态容器)
  ├─ fetch schools.canonical.json → allSchools
  ├─ filterSchools(allSchools, filters) → filteredSchools ──→ SchoolMap(标记)
  ├─ SchoolMap.onBoundsChange → visibleSchools ──→ SchoolList / BottomSheet
  ├─ SearchBox(allSchools)
  │     ├─ onPickSchool → setSelectedSchool + 地图 flyTo
  │     └─ onPickPlace  → SchoolMap fitToSchools + 清空选中
  └─ useMediaQuery(max-width:768px) ? 移动布局(地图 + 顶部搜索 + FilterBar 横滑 + BottomSheet)
                                    : 桌面布局(现有浮层面板)
```

桌面与移动**共用同一批子组件**(SearchBox / FilterBar / SchoolList / SchoolDetail),只是容器与摆放方式不同。

## 5. 搜索设计

### 5.1 匹配逻辑(`lib/searchSchools.ts`)

输入 `query`(归一化:trim + 小写)与 `allSchools`,输出排序后的结果数组。

- **纯数字 query** → 按 `postcode` 前缀匹配,聚合成「地区」结果(邮编 + 学校数)。
- **非数字 query** → 同时匹配:
  - `school_name` 包含 query → 「学校」结果
  - `suburb` 包含 query → 聚合成「地区」结果(区名 + 州 + 学校数)
- **排序**(校名):开头匹配 > 词首匹配(空格后单词开头)> 任意位置包含;同档内有 legacy_score 的优先、再按校名字母序。
- **结果上限**:学校组 + 地区组合计约 8 条。
- **防抖**:组件内 ~150ms(11K 条 substring 实际很快,防抖主要防下拉抖动)。

结果项类型:
```ts
type SearchResult =
  | { type: 'school'; school: School }
  | { type: 'place'; label: string; state: string; schools: School[] };
```

### 5.2 结果下拉 UI(`SearchBox`)

两组分区展示:**学校**(🏫,带 legacy 分或 "profile" 标)、**地区**(📍,带「N 所学校」)。匹配片段高亮。同名区带州区分,如「Richmond, VIC」「Richmond, NSW」。

### 5.3 点击行为

- 点**学校** → `onPickSchool`:`setSelectedSchool` + 地图 `flyTo` 该校。即便它被当前筛选排除也照常飞过去并显示——选中的标记在 [SchoolMap.tsx:344](../../../components/SchoolMap.tsx) 本就独立渲染。
- 点**地区/邮编** → `onPickPlace`:地图 `fitBounds` 框住该组所有学校、清空选中;视口绑定的列表/抽屉随之显示这一片。

### 5.4 与筛选、位置的关系

- 搜索**无视筛选**:永远能找到任何学校;筛选只决定地图上显示哪些标记。
- 搜索框位置:**移动端**钉在顶部通栏;**桌面端**放进现有顶部控制条最左侧。

## 6. 移动端设计

### 6.1 断点

`useMediaQuery('(max-width: 768px)')` 决定渲染**移动布局**还是**桌面布局**(沿用现有浮层面板)。其余样式尽量交给 Tailwind 的 `md:` 断点。

### 6.2 底部抽屉(`BottomSheet`)

- **两个吸附点**:`peek`(~120px,露出搜索 + 筛选 + 第一张卡)与 `expanded`(~75vh,整列表可滚,顶部留一条地图)。
- **点把手 / 头部即切换**,带 CSS `height` 过渡。自由拖拽手势列为**后续增强**,首版不做(降复杂度、先上线)。

### 6.3 其余移动端行为

- **筛选**:5 组胶囊变为搜索框下方一条**横向滑动**行(`overflow-x-auto`、不换行)。
- **详情**:点某校 → 详情作为**盖在地图上的抽屉**弹出,带 `‹返回 / ✕` 回到列表;复用 `SchoolDetail`,换移动端样式。
- **图例**:移动端先收起(优先级低)。
- **搜索框**:始终钉在最顶层,盖在抽屉/详情之上。

## 7. 顺手修掉的 bug

列表与地图标记现在用 `校名 + 邮编` 作为 React `key`([SchoolMap.tsx:335](../../../components/SchoolMap.tsx)),同名同邮编(如同址的小学+中学校区)会撞 key、可能渲染错标记。数据里有现成的 `id` 字段,本次一并改用 `school.id` 作为 key。

## 8. i18n

给 `messages/en.json` 与 `messages/zh.json` 各加搜索相关 key(占位符、分组标题「学校」/「地区」、无结果、「{count} 所学校」、返回等)。沿用现有 `formatMessage` 插值。

## 9. 测试

- **单元测试**:`lib/searchSchools.ts` 是纯逻辑,适合 TDD。项目当前**无测试框架**,本次引入轻量 **vitest** 仅覆盖该搜索模块。用例:
  - 校名开头匹配排在包含匹配之前
  - 纯数字按邮编匹配
  - 区名匹配聚合为单个 place 结果且带正确学校数
  - 同名区按州拆成多个 place 结果
  - 空 query 返回空;结果数不超过上限
- **手动 / 浏览器 QA**:移动端抽屉三态切换、桌面搜索下拉、点击飞行行为,用 `browse` 工具截图验证。

## 10. 边界情况

- **非澳洲 IP** 定位会把地图落在没有学校的海外位置——本次不专门处理,但搜索可缓解(用户可搜索跳回澳洲)。
- **同名区跨州**(如 Richmond 在 VIC/NSW/QLD 都有)→ place 结果带州、分别成项。
- **选中的学校被筛选排除** → 仍渲染选中标记并显示详情(现有逻辑已支持)。
- **空 query / 无结果** → 下拉显示「无匹配结果」提示,不报错。

## 11. 后续(明确不在本次)

聚合标记(clustering)、每校独立页面 + SEO、学校对比、图例移动端重设计。
