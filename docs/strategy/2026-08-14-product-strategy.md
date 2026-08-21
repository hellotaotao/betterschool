# BetterSchool.au 产品方向与竞品分析

- **日期**: 2026-08-14
- **状态**: 战略讨论稿，尚未拆成 spec
- **一句话结论**: 数据纪律是真资产；地图论点尚未兑现（没有学区）；定位要从「地图优先」收窄到**「住址优先」**。

---

## 1. 现状盘点

### 1.1 技术现状（注意：CLAUDE.md / AGENTS.md 已过时）

两份文件仍描述 Mapbox GL + SQLite + `/api/locations`，实际已是：

| 项 | 文档所述 | 实际 |
|---|---|---|
| 地图 | Mapbox GL JS | **Leaflet + react-leaflet 5** |
| 数据 | SQLite `db/locations.sqlite` | **静态 `public/data/schools.canonical.json`** |
| 框架 | Next.js 14 | **Next.js 16 + React 19** |
| API | `/api/locations` | 无运行时 API，纯静态 fetch |

`db/database.js` / `db/locations.sqlite` 是死代码。**这两份文档需要重写**，否则每次 agent 介入都会基于错误前提。

### 1.2 真正的资产：数据纪律

`schools.metadata.json` + `docs/specs/2026-06-17-school-data-enrichment-design.md` 建立的规范，是竞品都没有的：

- 官方(ACARA) / 推断 / 未采集**三态分离**，每个推断字段带 `*_source`
- 「`Unknown` 优于错标」写成贯穿准则
- `religion_source` 分桶诚实披露 1,414 个判不出的（占 Independent 的 68%）
- NAPLAN 明确**不入库**、仅由 `acara_sml_id` 构造 My School 深链（ToS 合规）
- `fees` schema：精确优先、档位兜底、**任何已知费用必带 `source_url` + `fee_year`**
- 构建期 validate 脚本 + vitest 纯逻辑单测

底座：**11,034 所全国学校**，ACARA 2025 官方 School Profile / Location / Enrolments。

### 1.3 核心矛盾：不被信任的指标，占据了视觉主信号

```
legacy_score 覆盖: 911 / 11034 = 8.3%
  NSW 523 · VIC 175 · SA 133 · TAS 50 · ACT 27 · QLD 3 · WA 0 · NT 0
```

metadata 已将其定性为「方法不透明、非官方、待替换」，但它同时决定了：

- `utils/schoolFilters.ts::getMarkerRadius` — 地图圆点**大小**
- `utils/schoolFilters.ts::getMarkerColor` — 地图圆点**颜色**
- `components/SchoolDetail.tsx:42` — 详情页顶部**大数字**
- `app/schools/page.tsx` — 排序选项 `sortBy: 'score'`

**后果**：WA 1,277 所学校全灰、QLD 2,020 所里 2,017 灰。珀斯/布里斯班用户看到的结论是「我这里没有好学校」，而这只是数据未覆盖。**地图当前在传播一个假事实**，且与项目自身的诚实性准则直接冲突。

### 1.4 另外两个硬伤

- **15MB 客户端 JSON**：`app/schools/page.tsx:55` 一次性 fetch `schools.canonical.json`。移动端 4G 不可用。
- **零 SEO 面**：全站仅 `/schools` 一个客户端渲染路由，`/` 只做 redirect。搜索引擎中不存在。对一个单人项目，这是最大的增长约束。

---

## 2. 竞品格局（2026-08 核实）

| 站点 | 定位 | 优势 | 弱点 / 可攻击面 |
|---|---|---|---|
| **My School** (ACARA) | 官方 NAPLAN / ICSEA / 财务 | 唯一权威，不可撼动 | 反排名反比较；按校名查；无地图能力 |
| **Better Education** | 各州会考排行榜、10年趋势、5校对比、邮编半径搜索 | 历史纵深最深；老域名 SEO 强 | UI 停在 2010；广告重；只讲成绩 |
| **SchoolRank AU** | **学区查询（6州 4,202 zones）+ 4校对比 + 综合评分 + SEO 指南页** | **已占据「地图+学区」位置** | 综合分把 wellbeing / 课外活动 / 性价比揉成一个数，方法不透明 |
| **Good Schools Guide** | 9,396 校目录、档案、学费、Year 12 | 出版物品牌；学校付费入驻 | 目录逻辑而非决策工具 |
| **findmyschool.vic / EdMap QLD / NSW School Finder** | 官方学区地图 | 权威准确 | **一州一个、互不相通；只给边界不给质量** |
| **Domain / realestate.com.au** | 房源页学区标注 | 流量碾压 | 从房子出发，无法反向查询 |
| **compareprivateschools.com.au** | 352 所私校 ICSEA + 公开学费 | 学费数据集中 | 覆盖窄，仅私校 |

### 关键结论

**「把数据放到地图上」已不构成差异化** —— SchoolRank 已经在做学区 + 地图 + 对比 + 性价比。需要比「地图优先」更锋利的定位。

---

## 3. 定位：从「地图优先」到「住址优先」

所有竞品都是 **学校优先**：先有学校，再看它在哪。

BetterSchool 应做 **住址优先**：先有一个「住的位置」，再看它能给你什么。

| | 竞品回答的问题 | BetterSchool 应回答的问题 |
|---|---|---|
| 提问方式 | 「Camberwell Grammar 怎么样？」 | 「我住这个地址 / 打算搬到这一片，孩子未来 12 年的选项是什么、花多少钱、通勤多久？」 |
| 地图角色 | 展示层 | **输入层**——地图上的点是「家」，不是「学校」 |
| 现状 | 已被充分回答 | **无人回答** |

这个定位直接来自两个真实家长场景：

1. **就地决策**：一百公里外的学校再好也无关——需要的是「以我家为圆心」的完整选项集
2. **搬家决策**：本地没有好学校 → 先调研目标区的学校 → 再决定搬到哪条街。**这个反向查询全市场空白。**

---

## 4. 功能路线

### P0 — 拆掉矛盾 + 兑现地图论点

**P0.1 legacy_score 撤出视觉主信号**

- marker 颜色 = `sector`（Government / Catholic / Independent），大小统一或按 `total_enrolments`
- ICSEA percentile 作为**可选图层**，UI 明确标注「生源社会经济指标，非学业成绩」（enrichment spec §6.1 已要求「ICSEA 正名」，尚未落地）
- `legacy_score` 降级为详情页一行带警示的参考值，或按 metadata 既定方向直接移除
- 移除 `sortBy: 'score'` 默认排序

**P0.2 接入学区边界（最高优先级）**

已核实数据可得性：

| 州 | 来源 | 许可 / 形式 | 学校数 |
|---|---|---|---|
| **NSW** | data.nsw.gov.au `nsw-education-school-intake-zones` | **CC-BY**，shapefile ZIP 直接下载，夜间更新 | 3,432 |
| **VIC** | DataVic `victorian-government-school-zones-{2022..2027}` | 逐年空间数据集，小学 + 中学**分年级** | 2,859 |
| **QLD** | data.qld.gov.au + ArcGIS REST `Society/SchoolsAndSchoolCatchments` | 小学 / 初中 / 高中分层 | 2,020 |

三州合计 **8,311 / 11,034 = 75%** 学校覆盖。WA / SA / TAS / ACT / NT 后补。

> 注意：学区仅适用于公立学校；天主教/独立学校按自有标准招生（堂区、兄弟姐妹、入学考试）。UI 必须区分这两类逻辑，不能混为一谈。
> 注意：NSW 学区**不沿 suburb 边界**，同一条路两侧可能分属不同学区。必须按**地址**判定，不能按 suburb 近似。

沿用现有数据纪律：`data/catchment/<state>/raw → processed`，配 `parse-* / build-* / validate-*`，产物写入 `schools.metadata.json`，标注 `data_year` + `source_url`。

**P0.3 地址反查**

输入地址 → geocode → point-in-polygon → 输出：
- 「你这个地址对口的公立小学 X、公立中学 Y」（含学区边界高亮）
- 半径 / 等时圈内所有私校与教会校（含入学标准）

这是所有下游功能的地基。

### P1 — SEO 落地页（单人项目唯一的增长路径）

用已有的 11,034 条结构化数据静态生成：

- `/school/[state]/[slug]` — 单校页
- `/suburb/[state]/[slug]` — 「Chatswood 有哪些学校」
- `/catchment/[school-slug]` — **「XX 小学学区范围内」** ← 竞品覆盖薄弱，且正是买房家长在搜的词

配 schema.org `School` 结构化数据。

### P2 — 性能

15MB 客户端 JSON → 按 bbox 的 API 或预切瓦片。当前移动端体验不可用。

### P3 — 差异化功能（P0–P2 完成后）

- **通勤等时圈**：不是直线半径，是「早高峰 20 分钟可达」。半径是假约束，等时圈是真约束。
- **性价比图层**：学费 × 结果。公立免费 vs 私立 $40k/年。`fees` schema 已设计完成（enrichment spec §7），缺数据采集。
- **搬家模式（反向查询）**：给定通勤 + 预算约束 → 热力图显示「哪些区的学校组合最优」。**全市场空白，且是「为读书搬家」场景的正面回答。**
- **时间线视角**：7 岁孩子的真实问题不是「现在读哪」，而是「这个地址 5 年后 Year 7 去哪、要不要考精英/私校、何时开始准备」。竞品全是静态快照。
- **Year 12 成绩**：enrichment spec §6.2 已设计（NSW NESA / VIC VCAA / QLD QCAA，各州口径独立不合成）。

---

## 5. 两条战略判断

### 5.1 不要打排行榜

Better Education 有十年历史数据，SchoolRank 有综合分品牌——正面打不赢，也不该打。项目自身的 enrichment spec 已明确「不做对外公开的排名榜 / league table」。

**把 SchoolRank 的综合分当成攻击面**：他们把 wellbeing、课外活动、性价比揉成一个不可核验的数；BetterSchool 每个字段标来源、判不准就写 `Unknown`。在一个全是黑箱评分的市场里，**透明本身就是定位**——而这恰好是现有数据纪律的自然延伸，不需要额外投入。

### 5.2 中文家长是被低估的楔子

- `messages/zh.json` 已存在，i18n 基础设施已就位
- 悉尼 / 墨尔本的华人、印度、韩国家长：择校意图最强、预算最高、最愿意为学区搬家
- 现有站点全英文 + 广告密集，中文长尾（「悉尼学区房」「墨尔本小学排名」「XX 中学学区」）几乎无人认真做
- 创始人本身属于该人群，有第一手场景理解

**单人项目赢在一个窄人群里，比在全澳市场排第五更有价值。**

---

## 6. 建议的下一步

1. 重写 `CLAUDE.md` / `AGENTS.md`（当前描述与代码不符，会污染所有 agent 上下文）
2. P0.1 撤下 legacy_score 视觉主信号 —— 小改动，立即消除假事实
3. NSW 学区 spec → plan → 实现（CC-BY 最干净，先验证整条链路）
4. VIC / QLD 学区跟上
5. 地址反查 + SEO 落地页

---

## 附：数据来源

- [ACARA Data Access Program](https://www.acara.edu.au/contact-us/acara-data-access)
- [NSW School intake zones — Data.NSW (CC-BY)](https://www.data.nsw.gov.au/data/dataset/nsw-education-school-intake-zones-catchment-areas-for-nsw-government-schools)
- [Victorian Government School Zones — DataVic](https://discover.data.vic.gov.au/dataset/victorian-government-school-zones-2026)
- [Queensland state schools geographic information — data.qld.gov.au](https://www.data.qld.gov.au/dataset/queensland-state-schools-geographic-information)
- [QLD EdMap](https://www.qgso.qld.gov.au/maps/edmap/)
- [Better Education](https://bettereducation.com.au/SchoolRanking.aspx)
- [SchoolRank AU](https://schoolrank.com.au/)
- [Good Schools Guide](https://www.goodschools.com.au/compare-schools)
- [My School](https://myschool.edu.au/)
