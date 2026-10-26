# ABS 郊区边界接入 suburb 与 catchment 页 — 设计文档

- **日期**: 2026-10-27
- **范围**: 接入 ABS ASGS 第 4 版 Suburbs and Localities（SAL 2026）边界，让 catchment 页回答「这个学区覆盖哪些郊区」，让 suburb 页回答「这个郊区归哪些学区」
- **状态**: 设计中
- **前置**: 各州学区接入（NSW / SA / VIC / QLD / TAS / ACT 已实现）；[混合 ISR](2026-08-16-betterschool-hybrid-isr-design.md)
- **数据实测日期**: 2026-10-27。下文数字均为实测；§4.2 的学区×郊区覆盖数字是网格抽样估计，构建时用精确多边形求交替换

## 1. 为什么做

2026-10-27 从 Search Console 抽了两份 1,000 条样本，按页面类型对比 sitemap 占比：

| 类型 | 占 sitemap（42,107） | 占「已编入索引」样本 |
|---|---|---|
| school | 52% | 74% |
| catchment | 24% | 16% |
| suburb | 23% | 9% |

「已发现 - 尚未编入索引」样本在各类型间分布均匀，说明是排队；但真正进了索引的，suburb 和 catchment 明显偏少。看页面本身就知道原因：

- **suburb 页**：4,800 个郊区里有 2,716 个（57%）只有一所学校。Abbotsford（NSW）页面正文 228 个词，内容就是那所学校的卡片加一串附近郊区的名字，和学校页高度重复。
- **catchment 页**：Pittwater High School 的 catchment 页正文 356 个词，同一所学校的 school 页有 1,070 个。家长搜学区时真正想知道的是「这个学区覆盖哪几个区」，页面目前只有「区内有哪些学校」，再加上从这些学校地址反推出来的几个郊区名（`insideSuburbs`），而且页面自己也承认这只是样本、不是全部。

这两个问题是同一件事的两面：我们有学区边界，却没有郊区边界，所以说不出「学区 × 郊区」的关系。而这恰好是产品「从地址出发」的核心问题：我住在（或要搬去）某个区，能上哪所学校。

## 2. 目标与非目标

### 目标

1. 接入 SAL 2026 边界，走 `data/abs/raw → processed` 和 `fetch / parse / build / validate` 的标准流水线（数据准则 3）。
2. 把每个 suburb 页的郊区（ACARA 的 `state + suburb`）确定性地连到一个 SAL，连不上的明确记为未匹配。
3. 对每个学区几何变体（`zone_id` / `geometry_url`）和每个 SAL 做精确多边形求交，算出双向面积占比。
4. catchment 页新增「覆盖的郊区」一节，替换 `insideSuburbs`。
5. suburb 页新增「覆盖本区的学区」一节和「附近学校」一节；后者不需要新数据源，WA 和 NT 也能用上。

### 非目标

- **不把「郊区在学区内」写成「住在这个郊区就能上这所学校」**。边界经常从街道中间穿过，部分覆盖就是部分覆盖。页面一律引导到各州官方的地址查询工具（`lib/catchmentStates.ts` 里已有）。
- **不发布 SAL 几何**。SAL 只在构建时参与计算，不进 `public/data/`，地图上也不画郊区边界。
- **本次不为没有学校的郊区新建页面**，见 §8 开放问题。
- **不改 suburb 页的 URL 和郊区命名**。页面的郊区依然是 ACARA 地址里的 suburb，SAL 只是附加在上面的数据。

## 3. 数据源（实测）

| 项 | 值 |
|---|---|
| 数据集 | ABS ASGS Edition 4（2026 年 7 月至 2031 年 6 月），Non ABS Structures → Suburbs and Localities |
| 发布日期 | 2026-10-14 |
| 文件 | [`SAL_2026_AUST_SHP_GDA2020.zip`](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/access-and-downloads/digital-boundary-files/SAL_2026_AUST_SHP_GDA2020.zip)，99.82 MB，只有 Shapefile 格式 |
| 坐标系 | GDA2020 地理坐标（经纬度） |
| 要素数 | 15,358 |
| 许可 | CC BY 4.0，署名 Commonwealth of Australia (ABS) |

字段只用到这几个：

```text
SAL_CODE26   5 位代码：第 1 位是州，后 4 位按州内字母序编号（与第 3 版不对应）
SAL_NAME26   名称；跨州重名时带限定后缀，如 "Carramar (NSW)"
STE_CODE26   州代码 1-9（9 = Other Territories）
AREASQKM26   面积，km²
```

各州要素数：NSW 4,554，VIC 2,949，QLD 3,236，SA 1,698，WA 1,700，TAS 776，NT 303，ACT 137，OT 5。

需要记住的三点：

- **SAL 是近似**。它是 ABS 用 Mesh Block 拼出来的州政府官方郊区边界，不是边界本身。页面文案要说「ABS 郊区边界」，不能说「官方郊区边界」。
- **第 4 版的代码和第 3 版不对应**。直接用第 4 版，不做版本换算；这套边界在 2031 年前不会变。
- **名称后缀**。名称末尾的 `(...)` 用于区分重名，匹配前要去掉，再靠州和坐标来区分（§4.1）。

## 4. 两个 join

### 4.1 suburb 页 → SAL

suburb 页的郊区来自 ACARA 学校地址，不一定是官方郊区名。比如 "Auburn South"、"Dubbo West" 是学校的命名习惯，SAL 里没有这两个区。

**规则**（按顺序执行）：

1. 名称规范化：小写，去掉 `'`、`’`、`.`，其余非字母数字字符折叠成单个空格；SAL 名称先去掉末尾的 `(...)`。
2. 在同一个州里按规范化后的名称找候选。
3. 只有一个候选时：如果该郊区至少有一所学校的坐标落在 SAL 内，或者离 SAL 边界不超过 **2 km**，就接受。
4. 有多个候选时：只有恰好一个候选包含该郊区某所学校的坐标，才接受它。
5. 其余情况一律不匹配，写进 `data/abs/processed/unmatched.json`，并注明原因。**不用「学校坐标落在哪个 SAL」去顶替名称匹配**：Auburn South 那所学校的坐标落在 Auburn，但这个页面讲的不是 Auburn（数据准则 1）。

**实测**（4,800 个郊区）：

| 情况 | 数量 | 处理 |
|---|---|---|
| 唯一候选，且有学校坐标在 SAL 内 | 4,559 | 接受 |
| 唯一候选，学校离边界 0.5 km 以内 | 52 | 接受（坐标精度问题） |
| 唯一候选，0.5-2 km | 8 | 接受 |
| 唯一候选，超过 2 km | 11 | 不匹配（如 Dynnyrne TAS 25.9 km、Eva Valley NT 229 km，像是 ACARA 坐标本身有误） |
| 多个候选，靠坐标唯一确定 | 49 | 接受 |
| 多个候选，无法确定 | 4 | 不匹配 |
| 没有同名 SAL | 117 | 不匹配 |
| **合计接受** | **4,668（97.25%）** | |

唯一候选的 4,559 个里，有 323 个郊区只有部分学校落在 SAL 内。这不影响匹配：名称决定这个页面讲的是哪个区，坐标只用来防止同名不同地。

### 4.2 学区 × SAL

**计算方法**：每个学区几何变体都和与它 bbox 相交的 SAL 做精确多边形求交。先用 `proj4`（已是依赖）投影到 GDA2020 Australian Albers（EPSG:9473，等积投影），再计算面积。求交库新增 `polygon-clipping`（MIT），只在构建脚本里用。几何不做简化（数据准则 6）。

每一对（学区，SAL）记录两个占比：

- `zone_share` = 交集面积 / 学区面积
- `sal_share` = 交集面积 / SAL 面积

**列出规则**：`zone_share ≥ 1%` 或 `sal_share ≥ 10%` 才列出。后一个条件是为了让落在大片乡村学区里的小镇也能列出来：一个 2 km² 的小镇在 2,000 km² 的学区里只占 0.1%，但它可能整个都在学区内。两条都不满足的，按沿边界的碎片处理，丢弃。

**覆盖标签**：按 `sal_share` 分三档，≥95% 为「全部」，50-95% 为「大部分」，<50% 为「部分」。页面同时显示百分比数字，标签只是为了方便阅读。

**抽样估计**（每个学区约 900 个网格点，共 6,386 个非 future 变体）：

| 每个学区覆盖的 SAL 数 | p10 | 中位数 | p90 | 最大 |
|---|---|---|---|---|
| 不设阈值 | 3 | 7 | 22 | 78 |
| `zone_share ≥ 1%` | 2 | 6 | 17 | 41 |
| `zone_share ≥ 5%` | 2 | 4 | 7 | 11 |

不设阈值和 1% 阈值之间差得不多，说明边界碎片不是主要问题。精确构建后要用实际数据复核 1% 和 10% 这两个阈值。

**各州 SAL 被学区覆盖的情况**：NSW 4,542 / 4,554，VIC 2,942 / 2,949，QLD 3,123 / 3,236，TAS 764 / 776，ACT 133 / 137，SA 485 / 1,698，WA 0 / 1,700，NT 0 / 303。SA 只有 124 所学校公布学区，WA 和 NT 没有接入学区数据，这些空缺在页面上要分别说明（§6.2）。

`future` 变体（NSW 的下一招生年度学区）同样计算，页面上标注生效年份，与现有 zone 区块的写法一致。

## 5. 产物与流水线

```text
abs.gov.au SAL_2026_AUST_SHP_GDA2020.zip
  └─ scripts/fetch-abs-sal.mjs      → data/abs/raw/
  └─ scripts/parse-abs-sal.mjs      → data/abs/processed/sal-2026.json（code、name、state、area、geometry；不进 public/）
  └─ scripts/build-abs-sal.mjs
       读：sal-2026.json、ACARA location 层、public/data/catchment/<st>/index.json 及其几何文件
       → data/abs/processed/sal-layer.json
            suburbs:  { "<STATE>|<suburb>": { sal_code, sal_name, method, distance_km? } }
            overlaps: { "<geometry_url>": [{ sal_code, sal_name, zone_share, sal_share }] }
       → data/abs/processed/unmatched.json
  └─ scripts/validate-abs-sal.mjs
  └─ scripts/build-canonical-schools.mjs 合并：
       每个 catchment 条目加 suburbs: [...]（按 zone_share 降序）
       → public/data/suburbs.canonical.json（每个 suburb 页的 SAL 匹配，以及覆盖它的学区列表，按 sal_share 降序）
       → schools.metadata.json 写入覆盖计数：已匹配 / 未匹配郊区数、有 overlap 的学区数
```

和 catchment 流水线一样，这一步读的是 ACARA location 层和已发布的学区几何，**不读** `schools.canonical.json`，所以不会形成循环依赖。

`suburbs.canonical.json` 只供服务端读取（`lib/schoolsData.ts`），客户端投影里没有它，`/data/` 也已经在 robots.txt 里屏蔽。

**validate 检查项**：

- 郊区匹配率 ≥ 97%；`unmatched.json` 里每条都有原因。
- 每个非 WA、非 NT 的学区变体至少列出一个 SAL。
- 每个学区的 `zone_share` 之和在 0.95-1.01 之间。下限留出了学区伸出海岸线、落在 SAL 之外的余量。
- WA 和 NT 不出现任何 overlap。
- 所有占比都在 0-1 之间；同一个 SAL 不会在同一个学区里出现两次。

纯逻辑（名称规范化、匹配决策、覆盖标签、阈值筛选、面积计算）放进 `lib/` 并写 vitest 测试；Albers 面积用一个已知面积的正方形做测试。

## 6. 页面改动

### 6.1 catchment 页

在 zone 区块之后新增「这个学区覆盖的郊区」：

- 一张表：郊区名、覆盖标签加 `sal_share`、占学区的比例（`zone_share`）。按 `zone_share` 降序排列。
- 郊区如果有 suburb 页（4,668 个已匹配的郊区之一），名字链到那一页。这是 catchment → suburb 方向的新内链，目前只有 suburb → catchment 一个方向。
- VIC 和 QLD 一所学校有多个年级变体时，每个变体单独一张表，标题沿用 `insideHeadingKind` 的写法。
- 一句说明：郊区边界是 ABS 的近似，学区边界可能从街道中间穿过，部分覆盖意味着同一个郊区里有的地址在学区内、有的不在；然后链到官方地址查询工具。
- 删除 `insideSuburbs` 和 `insideSuburbsCaveat`。它们是从学校地址反推的，新表完全替代了它们。
- `metaTitle` 和 `metaDescription` 加入郊区数量和前三个郊区名，例如「Pittwater High School catchment: Mona Vale, Newport, Bayview and 3 more suburbs」。具体格式在实现时对照 Search Console 的展示再定。

### 6.2 suburb 页

在 zones 区块里新增「哪些学区覆盖 {suburb}」：

- 按学段分组（小学 / 中学，VIC 按年级），每行是学校名（链到它的 catchment 页）、覆盖标签加 `sal_share`。
- 区内学校本身的学区（现有的 `zonesPresent` 列表）合进这张表，不再单列。
- 郊区没有匹配到 SAL 时，这一节保持现有内容，不显示新表。
- 「没有数据」和「没有学区」继续分开表达（数据准则 7）：
  - WA、NT：沿用 `zonesOtherState`。
  - SA：覆盖表只列 SA 公布了的学区。如果一个也没有，**不能**说这个郊区不在任何学区内，因为 SA 只公布了 124 所学校的学区。
  - TAS：高中入学看六年级时就读的小学，不按地址。这里只列小学和 district school 的学区，并加一句说明。
  - Catholic 和 Independent 学校不出现在学区表里。

新增「附近学校」一节：

- 不在本郊区、但离本郊区最近的学校，按小学和中学分别列，每类各取最近的 N 所（暂定 5 所），附直线距离，链到 school 页。这就是现有 `getNearestSchools` 的逻辑，以本郊区学校坐标的中心点为原点。
- 不依赖 SAL，所以 WA、NT 和那 132 个未匹配的郊区同样能用。
- 现有的「附近郊区」一节保留。

### 6.3 文案

所有新字符串同时写进 `messages/en.json` 和 `messages/zh.json`，单数和复数按 `a2ef69e` 的写法处理。英文说 "covers part of" / "covers all of"，中文说「覆盖全部 / 大部分 / 部分」。全站不出现 "guaranteed"、「保证入学」这类表述。

## 7. 规模与验收

- catchment 页：中位数新增 6 行郊区，90% 的页面不超过 17 行。
- suburb 页：只有一所学校的 2,716 页里，属于已接入学区的州的，都会新增一张覆盖表；所有 suburb 页都会新增「附近学校」。
- 验收方法：上线 4 周后，用同样的方法再从 Search Console 抽样，看「已编入索引」里 suburb 和 catchment 的占比有没有接近它们在 sitemap 里的占比（23% / 24%）。
- 抽查：作者对 SA 的 10 个郊区和学区做人工核对，沿用 SA 学区接入时的做法。

## 8. 开放问题

1. **没有学校的郊区要不要建页**。15,358 个 SAL 里只有 4,668 个对应现有的 suburb 页。「我要搬去 X，能上哪些学校」正是产品要回答的问题，而这些郊区在 §4.2 里已经有了学区覆盖数据。但新建页面会新增约 21,000 个 URL（约 10,700 个 SAL × 两种语言），而 Google 目前还有 25,531 个已发现的 URL 没有处理。建议等这个积压降下来，再单独立项。
2. **相邻学区**。「我家在学区边界上，另一边是哪个学区」可以用学区和学区之间求交得到，算法和 §4.2 一样。这次先不做。
3. **postcode 页**。SAL 和邮编不是一一对应的，这次不做。
