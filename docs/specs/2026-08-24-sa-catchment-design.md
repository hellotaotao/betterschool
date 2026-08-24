# 南澳（SA）公立学校学区接入 — 设计文档

- **日期**: 2026-08-24
- **范围**: 把 SA 政府学校的 school zone 边界接入 canonical 数据与地图；catchment 层从「NSW 专用」改造为「多州」
- **状态**: 已实现（2026-08-24，主体提交 `160dcfb`）
- **前置**: [NSW 学区接入](2026-08-15-nsw-catchment-design.md)（已实现），本文只写与之**不同**的部分
- **数据实测日期**: 2026-08-24，下文所有数字均为实测，非估计

## 1. 为什么先做 SA

按数据质量排，SA 排不进前三——VIC 已经发布到 2027 招生年度、QLD 有 2026 年数据加可查询的 ArcGIS 服务，SA 最新只到 2025 招生年度，且只覆盖 130 所学校。先做 SA 的理由不是数据，是**可核实性**：项目作者住在南澳，能对着真实地址逐条验证边界对不对。学区数据一旦错了就是"永久性的假事实"（数据准则 1），而 SA 是目前唯一能做人工闭环校验的州。

第二个理由是架构：**SA 是第一个没有确定性 ID 桥梁的州**。NSW 那条 `USE_ID → School_code → AgeID → location_age_id` 的链路是运气好，不是通例。SA 逼我们回答"没有 ID 桥梁时怎么办"，这个答案 VIC / QLD / TAS 大概率都要用。与其在数据更复杂的 VIC 上第一次面对它，不如在 130 个多边形、作者能亲自核对的 SA 上定型。

## 2. 目标与非目标

### 目标
1. SA 的 130 个 zone 多边形接入流水线，与 NSW 走同一套产物结构。
2. catchment 层多州化：索引、几何路径、canonical 合并、UI 文案都不再假设只有 NSW。
3. 建立并验证 `org_num → 教育站点 → ACARA` 的双重印证 join：名称规范化后精确相等，且两个官方点位相距不超过 1.5 km。
4. 把 SA 特有的三种「没有学区」状态在 UI 上分开表达（§6）。

### 非目标
- **不为未划区学校生成任何边界**。SA 官方对未划区学校的 catchment 定义是「路网距离上最近的未划区学校」，教育部不发布这个边界。我们不用直线距离、不用 Voronoi、不用路网自算——那是发明精度（数据准则 6）。
- **不从 zone 类型反推年级**。SA 不发布逐年级标志位（§4.3）。
- **不改 NSW 的公开几何文件和 index 格式**；canonical 内部字段从 `nsw_school_code` 统一改名为 `source_school_code`。
- **不做 VIC / QLD**，尽管 VIC 数据更好。本次只把多州的路铺出来。

## 3. 数据源（实测）

三个数据集，Department for Education 发布，都是 CC-BY：

| 项 | 小学 | 中学 |
|---|---|---|
| 数据集 | [school-zones-for-south-australian-govt-primary-schools](https://data.sa.gov.au/data/dataset/school-zones-for-south-australian-govt-primary-schools) | [school-zones-for-south-australian-govt-high-schools](https://data.sa.gov.au/data/dataset/school-zones-for-south-australian-govt-high-schools) |
| 最新文件 | `PrimarySchoolZones2025EY.zip` 207 KB | `HighSchoolZones2025EY.zip` 280 KB |
| 多边形数 | **84**（PRIM 78 / PRSEC 6） | **46**（SEC 34 / PRSEC 12） |
| 投影 | GDA94 地理坐标（与 NSW 同，直接当 WGS84 用） | 同左 |
| 许可 | CC-BY，署名 Department for Education | 同左 |

第三个数据集是 [South Australian Government Education Sites](https://data.sa.gov.au/data/dataset/south-australian-government-education-site)。它提供 `org_num`、站点名称和教育部坐标，是 zone 与 ACARA 之间缺失的 ID 桥梁。2026-08-24 实测共 1,259 个站点；构建使用 GDA94 GeoJSON，与学区 shapefile 的坐标系一致。

属性字段只有四个有用的：

```
org_num   教育部 site number（整数）
school    学校全名，如 "Westbourne Park Primary School"
type      PRIM / SEC / PRSEC
Shape_*   面积周长，忽略
```

**zone 文件本身没有能直接接到 ACARA 的 ID，没有逐年级标志位，也没有边界变更日期。** `org_num` 先确定性连接到教育站点，再由站点名称与位置共同确认 ACARA 学校。

### 3.1 三个必须记住的坑

**坑一：字段名大小写会变。** 2023EY 文件里是 `SCHOOL` / `ORG_NUM`，2025EY 变成了 `school` / `org_num`。用大写读 2025 文件不会报错，会静默返回 130 条属性全空的记录。**解析器一律大小写无关取字段**，并在解析后断言关键字段非空。

**坑二：发布滞后一年。** 最新公开文件是 2025 招生年度，2024-09 上传；写作时是 2026-08，2026EY 未发布。数据本身在维护——2023EY 与 2025EY 相比，84 个小学 zone 改了 9 个、46 个中学 zone 改了 22 个，是真实边界变更不是重导出噪声。所以不是数据死了，是发布节奏慢。处理方式：`data_year: 2025` 照实写、UI 照实显示、validate 在 `data_year < 当前年` 时打印告警但不 fail（上游滞后不是我们的构建错误，但必须可见）。

**坑三：几何精度是 2000 年代初数字化的。** Location SA 元数据原文写明精度为「早期数字化成果」，且「完整覆盖阿德莱德都会区」而非全州。边界本身就粗，我们照样不做简化（与 NSW §5.1 同理），但 UI 的免责声明要说清楚边界近似性来自源头。

### 3.2 找过但没有更好来源

- Location SA MapViewer 上的图层可能比 data.sa.gov.au 新，但 `location.sa.gov.au/arcgis` 与 `/server` 两个常规 ArcGIS REST 入口都是 404，没有公开可查的服务端点。
- education.sa.gov.au 的 "find a school zone" 工具页面里没有可提取的服务 URL。
- data.gov.au 上是 data.sa.gov.au 的联邦副本，不比源头新。

结论：data.sa.gov.au 的 2025EY 文件就是目前能拿到的最新公开边界。

## 4. join 方案：双重印证

### 4.1 问题

SA 的 `org_num` 是教育部内部站点号，ACARA 侧没有对应字段。NSW 的 `USE_ID → School_code → AgeID → location_age_id` 确定性链路在 SA 不存在，但 Government Education Sites 数据集给出了同一个 `org_num` 对应的官方站点名称和坐标。

### 4.2 方案

实际链路：

```text
zone.org_num
  → Government Education Sites.org_num      精确 ID，130/130
  → site_name + latitude/longitude
  → ACARA SA Government school              名称相等且距离 ≤ 1.5 km
  → location_age_id
```

最后一步要求两个信号同时成立，任何一个不成立就进入 `unmatched.json`：

**信号 A — 名称规范化后精确相等。** 规范化只做大小写、标点和空格折叠：

```
小写 → 非字母数字折叠为单空格 → 去首尾空格
```

**没有编辑距离，没有阈值，没有"最佳猜测"。** 规范化后不等就是不等。

**信号 B — 教育站点与 ACARA 学校的官方坐标相距不超过 1.5 km。** 名称负责选择学校，距离负责证明选中的学校确实是同一个物理站点。不能先取最近学校再核对名称：Blackwood High School 的教育站点离 Blackwood Primary School 只有 232 m，单用最近距离会把高中学区挂到小学。

构建后的 validator 再做第三个、独立于 join 的检查：每条 zone 必须包含它所挂学校的 ACARA 坐标。该检查不是 join 条件，避免用产生匹配的同一证据验证自己。

### 4.3 为什么这不是"模糊匹配"

名称不是相似度打分，而是硬门槛；距离也不是在多个候选之间打分，而是硬上限。恰好一个 ACARA 学校同时满足两者才接受。零个或多个候选都失败关闭，不做猜测。

### 4.4 实测结果

| 检查 | 结果 |
|---|---|
| `org_num → education site` 精确命中 | **130 / 130** |
| 名称 + 1.5 km 双重印证 | **130 / 130** |
| 站点到 ACARA 距离 | 中位数 **0 m**，p90 **103 m**，最大 **522 m** |
| 构建后学校坐标落在自己 zone 内 | **130 / 130** |
| 对应到的不同校址（`location_age_id`） | **124** |

130 → 124 是因为 6 所 R-12 学校在小学层和中学层各有一个多边形（与 NSW 的 Central School 同构，数据模型的数组天然容纳）。另有 6 所 PRSEC 学校只在中学层有多边形——它们只划定了中学部的 zone。

**这是硬门槛不是打分。** 命中率跌破 130/130 即构建失败：上游改了名字或挪了坐标，应该红着停下让人来看，不该悄悄少几个学区。

## 5. 数据模型改动（多州化）

### 5.1 `types/school.ts`

```ts
export interface SchoolCatchment {
  geometry_url: string;
  kind: CatchmentKind;
  /** 源数据的分类原值：NSW 是 CATCH_TYPE，SA 是 type（PRIM/SEC/PRSEC）。 */
  catch_type: string;
  /**
   * 该学区适用的年级。NSW 从逐年级标志位读取；SA 固定为空数组，
   * 表示来源没有按 zone 发布年级，UI 不显示这一行。
   */
  year_levels: string[];
  effective_year?: number;
  /** 源系统的学校编号，可回溯：NSW 是 School_code，SA 是 org_num。 */
  source_school_code: string;
  data_year: number;
  source: string;
  source_url: string;
  boundary_updated?: string;
}
```

`SchoolCatchment` 不另存 `state`：canonical 记录已经属于一所带 `state` 的学校，`geometry_url` 也含州目录。独立 index 合并时，client/server loader 根据读到的目录给 index entry 标记小写州 slug，避免修改已经发布的 NSW index 格式。

`nsw_school_code` → `source_school_code` 是破坏性重命名，但字段只在构建脚本和 canonical 产物里出现，UI 不读它。旧名不保留兼容别名。

### 5.2 `year_levels` 为什么在 SA 保持空数组

SA 只发布 `type`（PRIM/SEC/PRSEC），不发布逐年级标志位。从 type 反推年级是**推断而非事实**，而且会错：SA 在 2022 年把 7 年级从小学移到了中学，任何硬编码的 `PRIM → R-6` 映射用在更早的年度上都是错的，而这份数据集本身就横跨 2018–2025 多个年度。

所以 SA 的 catchment 记录携带 `year_levels: []`，UI 只显示 zone 类型，不显示空的年级行。最初尝试省略字段，但这会让共享 consumer 读取 `undefined.length`；最终契约用“字段存在但来源未发布任何逐 zone 年级值”表达这一状态，validator 要求它必须存在且为空。

想显示年级时，用学校自己的 ACARA `year_range`——那是官方字段，但要说清楚它描述的是**学校**开设的年级，不是**学区**适用的年级。

### 5.3 产物布局

与 NSW 完全对称，只换目录名：

```
data/catchment/sa/raw/              两个 zip 与解压产物（gitignore）
data/catchment/sa/processed/
  fetch-manifest.json               下载时间、ETag、data_year
  catchment-layer.json              location_age_id → 学区摘要，供 canonical 合并
  unmatched.json                    双重印证未通过的记录 + 原因
public/data/catchment/sa/
  <location_age_id>-<kind>.json     130 个 GeoJSON Feature
  index.json                        bbox 查询索引
```

单文件体积实测：中位数 5.3 KB、p90 16 KB、最大 40 KB，130 个合计 0.97 MB。与 NSW 同一量级，**同样不做几何简化**，只取整到 6 位小数。

## 6. UI：三种「没有学区」必须分开说

这是 SA 最容易做错的地方。SA 只有 130 / 521 所公立学校划了 zone（24.9%），剩下约 390 所**不是数据缺失**，是制度上就不划区。数据准则 7 要求 UI 说清楚是哪一种：

| 情况 | 数量 | UI 文案 |
|---|---|---|
| 有 zone | 124 校 | 显示边界、类型、data_year、免责声明、官方链接 |
| SA 公立、无 zone | ~390 校 | 「南澳只有部分学校划定 zone（都会区多数高中和一部分小学）。未划区学校按 catchment 就近入学——官方定义是路网距离上最近的未划区学校，教育部**不发布**这个边界。请用官方工具按地址查询。」+ 官方链接 |
| 非政府学校 | 262 校 | 沿用现有 `catchment.nonGovernment` 文案 |
| 其他州 | — | 现有 `nswOnly` 文案改为按实际覆盖的州列出 |

反查面板同理：SA 境内点击到未划区区域，不能只说「没找到」，要说明该位置很可能属于某个未划区学校的 catchment，而这个边界不公开。

当 point-in-polygon 没有结果时，结果本身无法提供州别。client 因此把每州 index 的所有 bbox 合成一个粗范围；点击点只落入一个已收集州的范围时，用该州解释空结果，落入零个或多个范围时保持 Unknown 并只列出当前覆盖州。这只决定文案和官方链接，不生成或推断学区边界。

官方查询工具按州分流：NSW 用 School Finder，SA 用 [find a school zone or preschool catchment area](https://www.education.sa.gov.au/parents-and-families/enrol-school-or-preschool/find-a-school-zone-or-preschool-catchment-area)。现在 `SCHOOL_FINDER_URL` 硬编码在三个组件里，改成按州取。

## 7. 流水线

沿用 `fetch / parse / build / validate` 四段式，新增：

```
scripts/sa-catchment-common.mjs     URL、目录、许可、SA bbox
scripts/fetch-sa-catchment.mjs      下载两个 zip 并解压
scripts/parse-sa-catchment.mjs      shapefile → 规范化记录，字段大小写无关
scripts/build-sa-catchment.mjs      双重印证 join，切分几何，产出索引
scripts/validate-sa-catchment.mjs   见 §8
```

`package.json` 增 `sa:catchment:fetch` / `:parse` / `:build` / `:validate`。

`build-canonical-schools.mjs` 遍历所有已构建州的 processed layer 并合并；某个州没构建过就跳过（一个只跑了 NSW 构建的 checkout 是正常状态）。

依赖方向与 NSW 一致：catchment build 读 **ACARA location 层**，不读 canonical，避免成环。

## 8. 校验

**单测（vitest）**
- 名称规范化：大小写、标点；断言拼写不同不会被模糊匹配
- 大小写无关字段读取：同一份记录分别用 2023 风格（大写）与 2025 风格（小写）字段名读，结果必须一致
- 多州空结果州别：只命中一个州的整体 index 范围才返回州别，范围重叠时保持 Unknown
- SA/NSW/未覆盖州/非政府学校的空学区语义分别测试
- 几何面积计算含洞扣除，供人工核验清单使用

**构建期硬门槛（不达标即 fail）**
- 双重印证 join 命中率 **130/130**，任何一条掉队即构建失败
- index 文件和 canonical 的每个 `geometry_url` 都必须指向存在的文件
- 所有几何必须是合法闭合多边形，bbox 落在 SA 范围内（`128.9,-38.2 → 141.1,-25.9`）
- 每个 zone 的每一个顶点都落在它自己的索引 bbox 内
- 130 个 zone 全部包含其学校的 ACARA 坐标
- SA canonical catchment 的 `year_levels` 必须存在且为空，`source_school_code` 必须存在

**构建期告警（不 fail）**
- `data_year` 早于当前年份 → 打印上游滞后告警
- SA 公立学校的学区覆盖率写进 `schools.metadata.json`，含**未划区学校数**——这个数字本身就是要如实披露的事实，不是缺陷

**人工核验（本州特有）**
validate 输出一份**按 suburb 排序的 130 条 zone 清单**（学校名、kind、catch_type、org_num、由完整 GeoJSON 计算的 km² 面积）。作者住在南澳，能对着熟悉的地址逐条核对——这是选择先做 SA 的主要理由。

## 9. 声明

- 每处学区呈现都带 `data_year`（2025）与来源链接，并说明**当前是 2026 年、上游最新只到 2025 招生年度**。
- CC-BY 署名：Department for Education (South Australia)。
- 边界精度来自源头的早期数字化，靠近边界处以官方工具为准。
- 不得暗示我们的边界有法律效力；SA 官方工具是权威。

## 10. 风险

| 风险 | 应对 |
|---|---|
| 上游字段大小写再变 | 大小写无关读取 + 解析后断言关键字段非空；单测覆盖两种风格 |
| 上游长期不更新（卡在 2025EY） | `data_year` 照实写并在 UI 显示；validate 打印滞后告警 |
| 用户以为未划区 = 不能上学 | §6 的三态文案，未划区明确解释就近入学制度 |
| 双重印证在别的州失效 | SA 无重名是实测事实，不是通用假设。VIC/QLD 接入时必须**重新实测重名情况**，不能直接照搬本方案 |
| 重命名 `nsw_school_code` 漏改 | 字段只在构建脚本与 canonical 产物出现，`tsc` 能兜住；不留兼容别名 |

## 11. 后续

- VIC（2026 与 2027 两个年度已发布，覆盖率远高于 SA）
- QLD（2026 年 KML + ArcGIS REST）
- TAS（theLIST ArcGIS，149 个 intake area，仅小学/district）
- geocoder：地址直接搜索，SA 场景下比 NSW 更需要（未划区学校要靠地址查官方工具）
