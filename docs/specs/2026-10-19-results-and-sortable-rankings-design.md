# 中学成绩数据 + 可排序排名表 — 设计文档

- **日期**: 2026-10-19
- **范围**: (1) 接入 VIC VCE 学校级成绩，(2) 把只按 ICSEA 排的排名页改成多列可排序、可自定义权重的排名表，(3) NSW HSC 作为第二阶段
- **状态**: 草案，待拍板（见 §9）

## 1. 背景

现有排名页（`/ranking/<state>/<type>[-<sector>]`，72 页 × 中英文）只按 ICSEA 排。ICSEA 描述生源背景，不是教学成绩，家长要的"好学校排名"它回答不了。

学业成绩方面：

- **小学**：能覆盖全部学校的只有 NAPLAN。My School 的 NAPLAN 页面在 Cloudflare Turnstile 人机验证之后，不做自动采集；ACARA 数据访问申请判断批不下来；竞争对手的派生评分不照搬。小学阶段本次不做学业排名。
- **中学**：各州考试局按学校公开发布 Year 12 成绩，不经过 My School。这是本设计的主体。

## 2. 目标与非目标

### 目标

1. VIC：接入 VCAA《Senior Secondary Completion and Achievement Information》（SSCAI），2022–2025 四年，按 `acara_sml_id` 挂到学校上。
2. 排名页改为一张多列表：每列一个有来源的指标，点击任意列排序；另有权重面板，家长自己配比生成综合排序。
3. VIC 新增"VCE 成绩排名"页，覆盖所有有 VCE 成绩的学校，不按 ACARA 学校类型切分。
4. 学校页比较区和"What stands out"接入 VCE 指标。

### 非目标

- NAPLAN（原因见 §1）。
- 任何竞争对手的评分或榜单数据。
- 跨州可比的"全国成绩分"：VCE、HSC、QCE 制度不同，各州各自排名，不合成。
- 全市排名：数据里没有城市边界（沿用现有结论）。
- 地图上的成绩展示：本次只做 SEO 页面。

## 3. 数据源

### 3.1 VIC — VCAA SSCAI（第一阶段）

- **地址**: vcaa.vic.edu.au → Senior secondary completion and achievement information，每年 12 月发布 xlsx（2025 版 161KB，607 行）。
- **覆盖**: 公立、天主教、独立学校，以及 TAFE 和成人教育机构（后者要排除，见 §4.2）。
- **关键字段**（列号以 2025 版为准）:

| 列 | 字段 | 存为 |
|---|---|---|
| 0 / 2 | School / Locality | 匹配用 |
| 1 | Small School（`*`） | `small_school: boolean` |
| 10 | 至少修一门 Units 3–4 的学生数 | `vce_students` |
| 14 | 申请 VTAC 的 VCE 学生比例 | `vtac_application_pct` |
| 15 | 满意完成 VCE 的比例 | `vce_completion_pct` |
| 20 | **Median VCE study score** | `median_study_score` |
| 21 | **40 分以上学科分占比** | `pct_study_scores_40_plus` |

- **缺失值**: `-`（无此项）与 `I/D`（人数不足 4，数据不足）都存为 `null`，并保留原始标记在 `*_status`，界面区分"未开设"和"人数太少未公布"。不存 0。
- **可用性实测**: 2025 版 607 行中 555 行有中位学科分。
- **条款（已知风险，不阻挡）**: 文件标注 © VCAA；VCAA 版权页把商业用途和公开网站发布列为需许可。这里使用的是成绩事实而非照搬文件，页面按 VCAA 要求的格式署名。记入 `schools.metadata.json` 的 provenance。

### 3.2 NSW — HSC Distinguished Achievers（第二阶段，开工前先核实两件事）

- **来源**: NESA 的 Distinguished Achievers 名单（取得最高等级 Band 6 的学生），提供按学生或学校搜索，未见可下载文件。
- **指标**: 各校上榜人次 ÷ 该校 Year 12 人数（分母取 ACARA 的 Year 12 在校人数，页面标明是计算值）。只存学校级计数，**不存学生姓名**。
- **开工前必须核实**:
  1. **NSW Education Act 1990 s18A 的现行文本**。2009 年版把"按成绩（含 HSC）公开排名或比较特定学校"定为刑事罪，个人最高 50 个罚款单位；同年另有废止议案，是否通过未查清。悉尼先驱晨报每年都在发布 HSC 学校排名，说明可能有例外或已修订，但不能靠推断。
  2. **名单的获取方式**：搜索界面是否有人机验证，有则不做（同 NAPLAN 的处理）。
- **NSW 精英中学录取分**: 教育部 2021 年后疑似不再公布，第三方的数字都是估计值。不纳入。

### 3.3 QLD — QCAA（第三阶段，仅调研）

QCAA 有学校级 Year 12 结果，口径待查。

## 4. 数据层

### 4.1 管线（沿用项目惯例）

```
data/vcaa/raw/<year>-sscai.xlsx            # 2022–2025，原样保存
  └─ scripts/parse-vcaa-sscai.mjs          → data/vcaa/processed/sscai-<year>.json
  └─ scripts/match-vcaa-acara.mjs          → data/vcaa/processed/matches.json
                                             data/vcaa/processed/unmatched.json
  └─ scripts/validate-vcaa.mjs             # 匹配率下限、数值范围、年份连续
       └─ scripts/build-canonical-schools.mjs 合并为 school.year12 层
```

`npm run vcaa:fetch / vcaa:parse / vcaa:match / vcaa:validate`，在 `canonical:build` 之前跑，和学区层一样。

### 4.2 匹配到 ACARA

VCAA 没有 ACARA 编号，只有校名和所在地。按 2025 版实测：

| 方法 | 行数 |
|---|---|
| 规范化校名 + 所在地完全一致 | 411 |
| 校名唯一、所在地不同（多为校区地址差异） | 34 |
| 对不上 | 162 |

对不上的主要两类：

1. **VCAA 缩写**: `Internatl`、`Comm`、`Schl`、`Sec`、`Coll` 等。用一张显式的展开表处理，每条可审计，不做模糊匹配。
2. **非学校提供方**: TAFE、成人教育中心（`Bendigo TAFE`、`Box Hill Institute`）。用显式排除表，写进 `unmatched.json` 并注明原因。

规则沿用学区匹配：只接受唯一匹配；同名多校区必须所在地也对上；对不上就留在 `unmatched.json`，不猜。`validate-vcaa.mjs` 设匹配率下限，以 ACARA 中 VIC 年级范围到 Year 12 的 572 所学校为分母。

### 4.3 字段（`types/school.ts`）

```ts
interface Year12Results {
  system: 'VCE';                 // 第二阶段加 'HSC'
  year: number;                  // 成绩年份
  median_study_score: number | null;
  pct_study_scores_40_plus: number | null;
  vce_students: number | null;
  vce_completion_pct: number | null;
  vtac_application_pct: number | null;
  small_school: boolean;
  source_url: string;
}
// School.year12?: Year12Results[]   // 按年份，最新在前
```

只进 canonical；排名表要在客户端排序，所以需要的几列另外出一份按页的小 JSON（见 §5.3），**不进** `schools.client.json`。

`schools.metadata.json` 写覆盖率：有成绩、`I/D`、未开设、未匹配各多少所。

## 5. 可排序排名表

### 5.1 列

| 列 | 来源 | 排序方向 |
|---|---|---|
| VCE 中位学科分 | VCAA | 高 → 低 |
| 40 分以上占比 | VCAA | 高 → 低 |
| ICSEA | ACARA | 高 → 低 |
| 在校人数 | ACARA | 大 → 小 |
| 师生比 | ACARA（计算） | 低 → 高 |

每列表头注明来源和年份；缺值显示"无数据"，排序时排在最后。学费暂不做列：非公立学校的学费还没采集，一列几乎全空，排序没有意义。

### 5.2 综合排序（自定义权重）

- 家长给每列设权重（0–100，滑块）。每列先换算成**本页学校里的百分位**，再按权重加权平均，这样单位不同的指标才能相加。
- 只在"所选列都有数据"的学校之间计算，并显示参与学校数（"共 512 所学校参与综合排序，另 43 所缺少所选指标"）。
- 提供两三个预设，例如"只看成绩""成绩 + 生源背景"，不提供站方推荐的单一分数。
- 排序列和权重写进 URL 查询参数，可以分享和收藏。

纯函数放 `lib/rankingTable.ts`（百分位换算、加权、缺值处理、并列名次），配 vitest。

### 5.3 渲染与 SEO

- 服务端按默认列渲染完整表格（这是搜索引擎看到的内容），客户端组件接管排序和权重。
- 数据：每个排名页的行数据由服务端直接传给客户端组件（VIC 有 VCE 的学校约 560 所，每行约 10 个数字，几十 KB），不另外请求。
- 默认排序：VCE 排名页按中位学科分；没有成绩数据的州和类型，仍按 ICSEA。
- 页面标题对着搜索词写，例如"Best VCE schools in Victoria 2025: ranked by median study score"和"维州 VCE 成绩排名 2025"。

### 5.4 路由

- 新增 `/ranking/vic/vce`（及 `/zh/...`），收录所有有 VCE 成绩的学校，不按类型切分；按办学类别切分的子页（`vce-government` 等）照现有模式生成。
- 现有 72 个 ICSEA 排名页保留，地址不变，改用新表格组件。
- `/ranking/sitemap.xml` 和 `lib/sitemap.test.ts` 相应更新。

## 6. 学校页

- 比较区（`ComparisonSection`）增加"VCE 中位学科分"和"40 分以上占比"两行，比较组改为"周边有 VCE 成绩的学校"。
- 新增"Year 12 成绩"小节：近四年的中位学科分和 40 分以上占比、VCE 学生数、小规模学校标记，并链到 VCE 排名页。
- `schoolHighlights` 可加一条规则：中位学科分处于全州前 10%。

## 7. 内链

本设计落地时一并补上内链审计里与排名有关的缺口：`/browse` 链各州排名，suburb 页的对比表给每校标"全州第 N"并链到排名页，学校页的"Year 12 成绩"链 VCE 排名页。

## 8. 测试与校验

- 纯函数（缩写展开、匹配、缺值解析、百分位与加权、并列名次）：vitest。
- `validate-vcaa.mjs`：匹配率下限；中位学科分在 0–50；占比在 0–100；`I/D` 与 `-` 从不变成 0；四年都有数据。
- `types/school.test.ts` 继续保证 `School` 与数据文件一致。

## 9. 待拍板

1. **VCE 排名页默认按什么排**：中位学科分（建议，最接近"成绩排名"）还是 40 分以上占比。
2. **小规模学校**（VCE 学生 20 人以下，VCAA 标 `*`）：默认排除、可勾选纳入（建议，少数学生会让中位数大起大落），还是默认纳入。
3. **用最新一年还是四年平均**：建议默认最新一年、另提供四年平均列；四年平均更稳，但会掩盖近年的变化。
4. **NSW HSC**：第二阶段开工前先核实 s18A 现行文本和名单获取方式，同意吗？
