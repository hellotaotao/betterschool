# NSW 公立学校学区（intake zone）接入 — 设计文档

- **日期**: 2026-08-15
- **范围**: 把 NSW 政府学校的学区边界接入 canonical 数据与地图；打通「地址 → 对口学校」反查
- **状态**: 设计待评审；**数据可行性已实测验证**（见 §3）
- **后续**: VIC / QLD 各自单独 spec（数据形态不同，不强行统一 ingest）

## 1. 背景

项目定位是**住址优先**（见 [产品战略](../../strategy/2026-08-14-product-strategy.md)）：用户从「我住哪 / 我要搬到哪」出发，而不是从一所学校出发。

这个定位目前**没有兑现**——地图上只有学校点位，没有学区边界。而学区恰恰是：

- 公立学校**唯一具有法律效力**的择校约束（NSW 公校对学区内学生有保障学位）
- 最地图原生的数据（是多边形，不是表格里的一行）
- 买房/租房家长真正在搜的东西

本阶段只做 NSW：数据许可最干净（CC-BY）、更新最勤（每晚）、且能与现有 canonical 主键做**确定性 ID join**（已实测）。

## 2. 目标与非目标

### 目标
1. 把 NSW 小学 / 中学 / 未来学区多边形接入构建流水线，产出可按需加载的静态资源。
2. 地图上能显示**某一所学校**的学区边界。
3. **地址 → 对口公立小学 + 对口公立中学**的反查（point-in-polygon）。
4. 如实呈现 NSW 教育部的免责声明与数据时效（见 §8）。

### 非目标
- **不做全州 2,189 个多边形同屏渲染**——既无用又打死浏览器；一次只显示相关的那几个。
- **不为非政府学校编造"学区"**——天主教/独立学校按堂区、兄弟姐妹、入学考试招生，没有地理学区。UI 必须把这两种逻辑分开表达，不能让用户以为私校也有学区。
- **不自建 geocoder**——地址→坐标本阶段用现成服务或让用户在地图上点选，不进本库。
- **不做 VIC / QLD**——各州数据形态不同（VIC 按年级分层、QLD 走 ArcGIS REST），各自单独 spec。
- **不承诺边界的法律准确性**——我们是二手呈现方，官方工具才是权威（见 §8）。

## 3. 数据源与可行性（已实测，2026-08-15）

### 3.1 学区边界

| 项 | 值 |
|---|---|
| 来源 | [Data.NSW — School intake zones (catchment areas)](https://data.nsw.gov.au/data/dataset/nsw-education-school-intake-zones-catchment-areas-for-nsw-government-schools) |
| 下载 | `catchments.zip`，8.4 MB，**已验证可直接 curl**（无需 key） |
| 许可 | **Creative Commons Attribution (CC-BY)** — CKAN API 确认 |
| 更新 | dataset `metadata_modified` 2026-08-03；shapefile 内文件时间戳 2026-08-02 |
| 投影 | **EPSG:4283 (GDA94 地理坐标)** — 与 Leaflet 的 WGS84 在澳洲相差约 1.8 m，**可直接当 WGS84 用**，不需重投影 |
| 附带 | `catchment_sf_info.json` → `{"current_enrolment_year": 2026}` |

三个图层（shapefile）：

| 图层 | 多边形数 | `CATCH_TYPE` 取值 |
|---|---|---|
| `catchments_primary` | 1,657 | PRIMARY 1581 / CENTRAL_PRIMARY 62 / INFANTS 14 |
| `catchments_secondary` | 443 | HIGH_COED 351 / CENTRAL_HIGH 62 / HIGH_GIRLS 17 / HIGH_BOYS 13 |
| `catchments_future` | 89 | PRIMARY / HIGH_*（尚未开办或即将启用的学区） |

属性字段（三层一致）：

```
USE_ID(C8)       NSW 教育部 School_code —— join 键
CATCH_TYPE(C20)  见上表
USE_DESC(C50)    学校简称，如 "Grafton PS" / "Billabong HS"
ADD_DATE(C20)    yyyymmdd
KINDERGART, YEAR1 … YEAR12   该学区适用的年级
                 · primary/secondary 层：'Y' / 'N'
                 · future 层：生效年份数字（如 2027），0 表示不适用
PRIORITY(C1|C20) 多为空
```

> **`INFANTS`（K-2）与 `CENTRAL_*`（K-12 中心学校）必须单独处理**：不能笼统当"小学/中学"。年级标志位才是真相，`CATCH_TYPE` 只是分类标签。

### 3.2 School_code → ACARA 的桥接

学区文件里只有 NSW 的 `School_code`，而 canonical 主键是 ACARA ID。桥梁是 NSW 的另一个 CC-BY 数据集：

| 项 | 值 |
|---|---|
| 来源 | [Data.NSW — NSW public schools master dataset](https://data.nsw.gov.au/data/dataset/nsw-education-nsw-public-schools-master-dataset) |
| 下载 | `master_dataset.csv`，46 列，CC-BY |
| 关键列 | `School_code`（= 学区的 `USE_ID`）、**`AgeID`** |

**实测发现**：`master_dataset.AgeID` 对应 canonical 的 **`location_age_id`**（不是 `school_age_id`，也不是 `acara_sml_id`）。

```
NSW canonical 政府学校 2,223 所
AgeID → location_age_id  命中 2,201 / 2,210 = 99.6%
AgeID → school_age_id    命中 0
AgeID → acara_sml_id     命中 4（巧合）
```

### 3.3 端到端 join 实测结果

链路：`USE_ID` → `master_dataset.School_code` → `AgeID` → `canonical.location_age_id`

| 图层 | 总数 | 成功 join | 比例 | 未命中原因 |
|---|---|---|---|---|
| primary | 1,657 | 1,655 | **99.9%** | Ben Lomond PS（无 School_code）、Lord Howe ICS（不在 ACARA） |
| secondary | 443 | 436 | **98.4%** | Murrumbidgee RHS、MSC Carol Ave、Lord Howe ICS |
| future | 89 | 77 | 86.5% | Googong HS (Provisional)、Gables PS 等**尚未开办**的学校，不在 ACARA 2025 —— 符合预期 |

**结论：全程确定性 ID join，不需要任何名称模糊匹配。** 这与项目"`Unknown` 优于错标"的准则天然契合——join 不上的就是 join 不上，如实记为 unmatched，不猜。

### 3.4 顺带发现（不在本次范围，但值得记）

`master_dataset.csv` 还含 **`Selective_school`** 与 **`Opportunity_class`** 两列。这正是 NSW 家长在孩子读小学阶段最关心的两件事（OC 班 Year 5 入学、精英中学 Year 7 入学）。**建议后续单独 spec**，不塞进本次。

## 4. 数据模型

### 4.1 `types/school.ts` 新增

```ts
export type CatchmentKind = 'primary' | 'secondary' | 'future';

export interface SchoolCatchment {
  /** 该校学区几何的静态资源路径（按需 fetch，不进 canonical 主文件） */
  geometry_url: string;
  kind: CatchmentKind;
  /** 官方 CATCH_TYPE 原值，如 PRIMARY / CENTRAL_HIGH / INFANTS */
  catch_type: string;
  /** 该学区适用的年级，来自 KINDERGART..YEAR12 标志位 */
  year_levels: string[];
  /** future 层：该学区生效年份 */
  effective_year?: number;
  /** NSW 教育部 School_code（来源可回溯） */
  nsw_school_code: string;
  data_year: number;      // 来自 catchment_sf_info.json 的 current_enrolment_year
  source: 'data.nsw.gov.au';
  source_url: string;
  /** 边界最后变更日期（ADD_DATE） */
  boundary_updated?: string;
}

// School 上新增（可选，缺省即"该校无学区数据"）
catchments?: SchoolCatchment[];   // 一所学校可同时有小学与中学学区（Central School）
```

> 一所学校可以有多条：Central School 同时出现在 primary 与 secondary 层。用数组，不用单值。

### 4.2 产物布局

```
data/catchment/nsw/raw/            catchments.zip, master_dataset.csv（gitignore）
data/catchment/nsw/processed/
  catchment-index.json             School_code → {acara ids, 属性, 简化后几何的 bbox}
  unmatched.json                   join 不上的记录 + 原因（诚实披露）
public/data/catchment/nsw/
  <acara_sml_id>-<kind>.json       每校一个 GeoJSON Feature（按需加载）
  grid-index.json                  反查用的粗网格索引（见 §6）
```

## 5. 处理流水线

沿用现有 `parse-* / build-* / validate-*` 三段式：

1. **`scripts/fetch-nsw-catchment.mjs`** — 下载 zip + master CSV 到 `raw/`，记录下载时间与 ETag。
2. **`scripts/parse-nsw-catchment.mjs`** — shapefile → GeoJSON。
   - 无 GDAL 依赖：用 `shapefile`（mbostock）npm 包，**仅 devDependency，不进客户端 bundle**。
   - 坐标已是 GDA94 经纬度，直接输出，不重投影。
   - 年级标志位 `KINDERGART..YEAR12` → `year_levels: string[]`。
3. **`scripts/build-nsw-catchment.mjs`** — 执行 §3.3 的 join，切分每校 GeoJSON，生成 grid 索引。
   - **几何简化**：三层合计约 **719k 顶点**，原始 GeoJSON 约 30MB+。用保拓扑的简化（`topojson-simplify` 或预跑 mapshaper）压到可接受体积。**简化容差必须记录进 metadata**——被简化过的边界不能宣称是精确法律边界（见 §8）。
4. **`scripts/validate-nsw-catchment.mjs`** — 见 §9。
5. `build-canonical-schools.mjs` 把 catchment 层并入 canonical（与 religion / legacy 层并列）。

`package.json` 增：`nsw:catchment:fetch` / `:parse` / `:build` / `:validate`。

## 6. 服务与反查策略

现状是纯静态 + `/data/*` 长缓存（`next.config.js` 已配 `max-age=86400`）。**保持静态**，不引入运行时 API：

- **显示单校学区**：用户选中学校 → fetch `public/data/catchment/nsw/<id>-<kind>.json` → Leaflet `GeoJSON` 图层。一次一个多边形，体积可忽略。
- **地址反查（point → 学区）**：
  1. 构建期生成 `grid-index.json`：把 NSW 切成粗网格，每格记录 bbox 与之相交的候选学区 ID（通常个位数）。
  2. 运行时：坐标 → 网格格子 → 取回少量候选多边形 → 客户端跑 point-in-polygon（射线法，纯函数，可单测）。
  3. 分别对 primary / secondary 各跑一次，得到「对口小学 + 对口中学」。
- **地址 → 坐标**：本阶段不自建。先支持「在地图上点选一个位置」，geocoder 作为后续增量（届时评估 ToS 与配额）。

> 注意：**简化后的几何用于渲染，反查也用它**——因此边界附近的点可能判错。UI 在结果里必须提示「靠近边界请以官方 School Finder 为准」，并给出官方链接。

## 7. UI 行为（概要，细节另出 spec）

- 选中一所 **NSW 政府学校** → 详情页出现「查看学区范围」→ 地图叠加该校学区多边形。
- 学校无学区数据（非政府、非 NSW、或 join 未命中）→ **不显示该入口**，而不是显示空图层。
- 非政府学校详情页：明确说明**私校/教会校不按地理学区招生**，避免误解。
- 反查结果面板：对口小学、对口中学、各自适用年级、数据年份、官方链接、免责声明。

## 8. 必须如实呈现的声明

NSW 教育部在数据集说明中明确写道（转述）：学区信息会因学校开办/关闭、人口结构变化等原因变动；**若将学区数据用作房产买卖或租赁的参考依据，教育部不承担任何责任**。

我们的核心使用场景恰恰就是买房租房，因此：

- UI 上任何学区呈现处，必须带**数据年份**（`current_enrolment_year`，当前为 2026）与官方来源链接。
- 必须注明我们的几何经过简化，**边界附近以官方 School Finder 为准**。
- CC-BY 要求署名：在数据说明页标注 NSW Department of Education 与许可。
- 不得暗示我们的边界具有法律效力。

这不是法务防御姿态，而是项目既有准则的延续——**呈现来源与不确定性，而不是伪装确定性**。

## 9. 校验

**纯逻辑单测（vitest）**
- 年级标志位 → `year_levels` 映射（含 INFANTS 只有 K-2、CENTRAL 跨 K-12、future 层数字年份）
- point-in-polygon：内部点、外部点、**边界点**、带洞多边形、跨反子午线（NSW 不涉及但守住）
- grid 索引：每个学区的所有顶点所在格子都必须包含该学区 ID

**构建期校验**
- join 命中率不得低于基线（primary ≥ 99%，secondary ≥ 98%）——低于即构建失败，防止上游改字段悄悄劣化
- 每个 `geometry_url` 指向的文件必须存在
- 所有几何必须是合法闭合多边形，坐标落在 NSW bbox 内
- 简化后面积相对原始的偏差超过阈值即告警
- `unmatched.json` 必须随构建产出，计数写进 `schools.metadata.json`

**覆盖率诚实披露**：metadata 写明各层多边形数、成功 join 数、unmatched 数与原因分桶、简化容差、`current_enrolment_year`。

## 10. 风险

| 风险 | 应对 |
|---|---|
| 上游字段/URL 变更 | fetch 与 parse 分离；构建期校验命中率基线；失败即红，不静默降级 |
| 边界变动导致数据过时 | 每条 catchment 带 `data_year` + `boundary_updated`；UI 展示；定期重跑 |
| 简化导致边界附近误判 | 记录容差；UI 明示；边界附近引导至官方工具 |
| 用户误以为私校有学区 | 非政府学校显式说明招生逻辑不同；不显示学区入口 |
| 几何体积拖慢首屏 | 学区**不进** canonical 主文件，永远按需加载 |
| `location_age_id` 语义在 ACARA 侧变化 | 校验脚本盯住命中率；`unmatched.json` 是回归基线 |

## 11. 后续

- VIC（DataVic，按年级分层）、QLD（ArcGIS REST）各自 spec
- `Selective_school` / `Opportunity_class`（§3.4）——NSW 家长的高价值维度
- geocoder 接入（地址直接搜索）
- 学区 SEO 落地页 `/catchment/[school-slug]`（战略文档 P1）
