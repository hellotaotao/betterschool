# 学校数据补全(宗教 / 学术 / 学费)— 设计文档

- **日期**: 2026-06-17
- **范围**: 在现有 11,034 所学校的 ACARA 底座上,分三阶段补充「宗教教派」「学术成绩」「学费」三类数据
- **状态**: 设计已通过,待写实现计划

## 1. 背景与现状

betterschool.au 现有数据底座已经很扎实:

- **底座**: 11,034 所学校,来自官方 **ACARA Data Access Program 2025**(School Profile / Location / Enrolments by Grade)。Schema 见 `types/school.ts`。
- **已有字段**: `sector`(Government 7128 / Catholic 1822 / Independent 2084)、`icsea` / `icsea_percentile` / `sea_quarters`、招生数与人口结构(`total_enrolments` / `girls` / `boys` / `indigenous_percent` / `lbote_*`)、师资、`governing_body` / `governing_body_url` / `school_url`。
- **不透明的遗留指标**: `legacy_score` / `legacy_rank` 仅覆盖 911 校、方法不透明,已被明确标注为**非官方**(`legacy_metric_status`)。项目近期方向就是用官方数据替换它。

`schools.metadata.json` 里已自陈两个缺口:`"naplan": "Not collected in this phase"`、`"fees": "Not collected in this phase"`。本设计填补这两块,并把 `sector` 升级为更细的宗教教派维度。

### 三个待补缺口
1. **宗教 / 教派**:`sector` 里 Catholic 天然是宗教,但 2,084 所 Independent 把"圣公会/信义宗/伊斯兰/基督教/世俗"全混在一起。
2. **学术成绩**:目前只有 ICSEA(社会教育优势,是*输入*不是*成绩*);没有任何真实成绩维度。
3. **学费**:完全缺失。

## 2. 目标与非目标

### 目标
1. **P1 宗教教派**:基于**已有字段**(`sector` + `governing_body` + 校名)给学校打教派标签,高置信即标、判不准即 `Unknown`。
2. **P2 学术**:把 `icsea` 在文案层正确表述;接入各州**公开**的 Year 12 成绩(先 NSW/VIC/QLD);NAPLAN 仅以深链跳转 My School,**不入库**。
3. **P3 学费**:以**档位/区间**(非精确金额)补充学费;Government 直接标免费、Catholic 走教区收费表、Independent 逐校官网分批。

### 非目标(本次明确不做)
- **不入库 NAPLAN 分数、不爬 My School**——其 ToS 限制批量抓取与排行榜,且与"官方可信"方向相悖。
- **不做对外公开的排名榜 / league table**(对 NAPLAN 有合规风险)。
- **不再依赖不透明的商业排名站**(如遗留 score/rank 的来源)——那是在往回走。
- **不为"精确"而编造或估算金额**——能从官方/学校公开页拿到精确年费就存精确,拿不到才退档位;两者都不猜。
- **不强行让各州 Year 12 口径可比**——各州考试制度不同(HSC / VCE / QCE…),分别如实呈现,不合成一个"全国可比分数"。

## 3. 贯穿数据准则(适用于全部三阶段)

> **`Unknown` 优于错标。** `Unknown` 是诚实的零成本状态;一个错误的推断值会变成"以后一直被当真的假真理",并向下游传播。——本项目对任何推断字段一律遵循此准则。

- **provenance 纪律**(沿用现有 ACARA 模式):每个新字段都带 `source` + `data_year`;新来源走 `data/<source>/raw → processed`,配 `parse-* / build-* / validate-*` 脚本;构建产物更新 `schools.metadata.json`。
- **推断 ≠ 官方**:数据分三态——官方(ACARA/考试局)、推断(校名/教区映射)、未采集(`Unknown` / 缺省)。UI 必须能区分,且每个推断字段带 `*_source` 标明依据。
- **分阶段独立交付**:P1 / P2 / P3 各自走 spec → plan → 实现循环;本文是总纲,后续每阶段可再细化。

## 4. 已锁定的决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 推进方式 | 按可行性分阶段全做(P1→P2→P3) | 三类数据可行性差距大;先低风险见效,再啃高价值/高成本 |
| NAPLAN | **不入库**,仅由 `acara_sml_id` 构造 My School 深链 | ToS/法律限制抓取与排行榜;契合替换 legacy 的信任方向 |
| 宗教粒度 | **教派级**(Catholic/Anglican/Lutheran/Islamic/…)+ 二元 `is_religious` rollup | 数据支持、对家长更有用;二元值可由教派派生 |
| 校名启发式 | **保守**:仅当校名出现"明确点名信仰本身"的词才判定;模糊词一律 `Unknown`;**绝不从校名反推 Secular** | 错标=持久假真理;`Unknown` 无损失 |
| `Secular` 判定 | 仅 `sector=Government`(依法非宗教)+ 手工确认 | 公立非宗教是高置信事实;独立校的世俗性缺正面证据时留 `Unknown` |
| Year 12 范围 | 先 **NSW / VIC / QLD**,其余后补 | 三州学生量最大、公开成绩数据最全 |
| 学费表示 | **精确金额优先,拿不到才用档位**;任一已知费用**必带来源**(`fee_source`+`source_url`)+ `fee_year` | 有具体数字就给具体数字(更有用);档位只是兜底;来源保证可核验、防过时 |

## 5. Phase 1 — 宗教 / 教派分类(马上能做,低风险)

### 5.1 数据来源
**全部已在手**,本阶段不抓任何外部数据:`sector`、`governing_body`、`school_name`。

### 5.2 判定级联(命中即止,判不准落 `Unknown`)
1. **`sector` 直判**
   - `Catholic` → `religious_affiliation='Catholic'`, `is_religious=true`, `religion_source='sector'`(1,822 校,确定)
   - `Government` → `religious_affiliation='Secular'`, `is_religious=false`, `religion_source='sector'`(7,128 校,公立依法非宗教)
2. **`governing_body` 查表**(仅对 Independent;见 5.3)——命中**宗教**办学机构 → 对应教派, `religion_source='governing_body'`
3. **校名保守启发式**(见 5.4)——命中明确信仰词 → 对应教派, `religion_source='name_explicit'`
4. **手工覆盖表**(见 5.6)——优先级最高,可覆盖以上任意判定, `religion_source='manual'`
5. **以上都不中** → `religious_affiliation='Unknown'`, `is_religious=null`

> 注意:`sector=Government` 在第 1 步即给出高置信 `Secular`;但 Independent 的"世俗"不在此推断——独立校除非有正面证据(governing_body / 手工),否则留 `Unknown`,不标 Secular。

### 5.3 `governing_body → 教派` 对照表(初版,可扩充)
仅**宗教性**办学机构进表;**世俗 peak body**(`Independent Schools NSW/QLD/VIC/…`、`Association of Independent Schools of …`)**不进表**——它们只说明独立校身份、不代表无宗教,命中后**继续往下走**(到校名启发式),而非判为世俗。

| governing_body(含子串匹配) | 教派 |
|---|---|
| `EREA` / `Edmund Rice` / `Mercy Education` / `Catholic Education *` | Catholic |
| `AngliSchools` / `Anglican Schools *` | Anglican |
| `Lutheran Education *` | Lutheran |
| `Adventist Schools Australia` | Adventist |
| `Christian Schools Australia` / `Christian Community Ministries` / `Australian Association of Christian Schools` / `Christian Education National` / `NT Christian Schools` | Christian(泛基督教) |
| (后续补:Uniting / Presbyterian / Islamic / Jewish Board / Greek(Coptic) Orthodox 等) | … |

### 5.4 校名保守启发式
**白名单(出现即判,大小写/词边界匹配)**——这些词明确点名信仰本身:
`Islamic` / `Catholic` / `Anglican` / `Lutheran` / `Adventist` / `Baptist` / `Presbyterian` / `Uniting Church` / `Greek Orthodox` / `Coptic Orthodox` / `Jewish` / `Hebrew` / `Torah` / `Yeshiva` / 明确的 `Christian College/School`。

**黑名单(一律 `Unknown`,绝不判定)**——历史相关但今天不可靠:
`St` / `Saint`(可能天主教/圣公会/甚至世俗)、`Grammar`(历史常为圣公会,如今很多世俗)、单独的 `College` / `Academy` / `Grammar`。

### 5.5 新增字段(`types/school.ts`)
```ts
religious_affiliation?: string;  // 'Catholic'|'Anglican'|'Lutheran'|'Islamic'|'Jewish'|'Christian'|'Adventist'|'Baptist'|'Uniting'|'Presbyterian'|'Orthodox'|'Secular'|'Unknown'
is_religious?: boolean | null;   // true | false | null(=Unknown)
religion_source?: 'sector' | 'governing_body' | 'name_explicit' | 'manual';
```

### 5.6 手工覆盖表
`data/religion/manual-overrides.json`:`{ acara_sml_id, religious_affiliation, is_religious, note }`。用于少数知名但启发式判错/判不出的学校(优先级最高)。初版可空,按需补。

### 5.7 脚本与产物
- `scripts/classify-religious-affiliation.mjs`:读 canonical(或 ACARA profile)→ 执行 5.2 级联 → 输出 `data/religion/processed/religious-affiliation.json`。
- `scripts/build-canonical-schools.mjs`:合并该层进 canonical(与 legacy 层并列的一个"宗教层")。
- 校验:计入 `validate-canonical-schools.mjs`(枚举值合法、`is_religious` 与 `religious_affiliation` 一致)。

### 5.8 覆盖率诚实披露
构建后在 `schools.metadata.json` 写明:各教派计数、`Secular` 计数、**`Unknown` 计数**及占比,并按 `religion_source` 分桶。不掩盖判不出的部分。

## 6. Phase 2 — 学术(ICSEA 正名 + Year 12 公开成绩;NAPLAN 仅深链)

### 6.1 ICSEA 正名(无新数据,文案/UI 层)
`icsea` 已在数据里,但它是**社会教育优势指数(输入)**,不是学业成绩。UI 与 i18n 文案需明确标注,避免被当成"学校好坏分"。

### 6.2 Year 12 成绩(分州 ingest,各州口径独立)
| 州 | 来源(公开) | 典型可得指标 |
|---|---|---|
| NSW | NESA(Distinguished Achievers / Top Achievers 榜) | Band 6 数、Distinguished Achiever 数 |
| VIC | VCAA / 公开发布 | median study score、study score 40+ 占比 |
| QLD | QCAA | ATAR 分布(如 ATAR ≥ 90 占比、median) |
| (WA/SA/TAS/ACT/NT) | SCSA / SACE / … | 后补 |

各州指标**不强行统一**,按州装入州特有字段并标注 `source` + `data_year`。ATAR 在 NSW 官方不逐校发布——只取该州**官方公开**的口径,不用媒体/商业估算值填充。

### 6.3 NAPLAN(仅深链,不入库)
由 `acara_sml_id` 构造 `myschool_url` 深链到该校 My School 页面(URL 格式实现时需核实,可能需 ID 映射)。详情页提供"在 My School 查看 NAPLAN"的外链,本库不存任何 NAPLAN 分数。

### 6.4 新增字段
```ts
myschool_url?: string;
year12?: {
  state: string;
  data_year: number;
  source: string;        // 'NESA' | 'VCAA' | 'QCAA' | ...
  source_url?: string;
  metrics: Record<string, number | string>;  // 州特有,如 { band6_count } / { median_study_score, pct_40_plus } / { pct_atar_90_plus }
};
```
(历史多年可后续升级为数组;首版只存最新一年。)

### 6.5 风险 / 口径
- 跨州不可比:UI 须按州分别呈现,标清"这是 X 州 Y 年口径"。
- 公开数据多为 PDF/HTML 榜单,解析较脏:每州一个 parser,产物入 `data/year12/processed/`。
- 匹配回 canonical 用 `school_name + suburb + state`(复用现有匹配思路),不确定的不强行匹配。

## 7. Phase 3 — 学费(精确金额优先,档位兜底;先验证可行性)

### 7.1 三类来源
- **Government**:实际免费(仅自愿捐款)→ 直接标 `band='free'`,无需抓取。
- **Catholic**:多为**教区(diocese)统一收费表**——映射 `school → diocese → 收费表`,几十个教区而非逐校,性价比高(需核实各教区是否公开统一表)。
- **Independent**:无中央源,几乎都在各校官网 → 逐校抓取(脆弱),**先做头部学校**,其余 `Unknown`。

### 7.2 精确优先,档位兜底
- **能拿到精确金额就存精确**:多数独立校官网/教区收费表会按**年级**列年费,故精确表示用 `annual_aud_min/max`(跨年级的最低~最高,单一值则两者相等),`fee_precision='exact'`。
- **拿不到精确才用档位**:`band`: `free | low | medium | high | premium | unknown`(阈值实现时定),`fee_precision='band'`。
- 有精确金额时,`band` 由金额派生(供统一筛选/展示),但 UI 应优先显示精确数字。
- **任何已知费用都必须带来源**:`fee_source` + `source_url`(Government 免费可只标 `fee_source='government_free'`)。

### 7.3 新增字段
```ts
fees?: {
  fee_precision: 'exact' | 'band';   // 有精确金额=exact,否则=band
  annual_aud_min?: number | null;    // 精确:跨年级最低年费(AUD)
  annual_aud_max?: number | null;    // 精确:跨年级最高年费(AUD)
  band: 'free' | 'low' | 'medium' | 'high' | 'premium' | 'unknown';  // exact 时由金额派生
  fee_year?: number;
  fee_source: 'government_free' | 'diocese_schedule' | 'school_website' | 'manual';
  source_url?: string;               // 非 government_free 时必填(可核验)
};
```

### 7.4 风险
- Independent 逐校抓取脆弱且易过时 → 精确金额带 `fee_year`,过时则降级为 `band` 或 `unknown`;来源 URL 保证可回溯核验。
- 聚合站若用,需先确认其 ToS/许可,避免再次引入不透明来源。
- 覆盖不全是常态:Gov+Catholic 可覆盖约 8,950 校,Independent 分批,缺的诚实标 `unknown`。

## 8. 数据模型变更汇总(`types/school.ts`)
P1:`religious_affiliation` / `is_religious` / `religion_source`
P2:`myschool_url` / `year12`
P3:`fees`
全部为可选字段;缺省即"未采集",不破坏现有消费方。

## 9. 验证与测试
- **纯逻辑单测(vitest)**:5.2 判定级联(各分支命中、模糊词落 `Unknown`、Government→Secular)、5.3/5.4 表与启发式、学费档位映射。
- **构建校验**:扩展 `validate-canonical-schools.mjs`——新枚举值合法、`is_religious` 与 `religious_affiliation` 一致、`year12.state` 与 `state` 一致。
- **覆盖率报告**:每次构建在 metadata 打印各新字段的 known/unknown 计数,作为回归基线。

## 10. 边界情况
- **多校区/合并校**:沿用现有 `id`(基于 ACARA IDs)做主键,避免错配。
- **governing_body 命中世俗 peak body**:不判世俗,继续走校名启发式,再不中则 `Unknown`。
- **同名跨州学校**:Year12/学费匹配带 `state`,避免串校。
- **数据过时**:学费/Year12 带 `*_year`;超期由构建或 UI 降级显示为陈旧/`unknown`。

## 11. 后续(明确不在本次或需另议)
- NAPLAN 官方数据申请(若日后走合规批量路线)。
- Year 12 扩展到 WA/SA/TAS/ACT/NT 与多年历史。
- Independent 学费的规模化采集(众包/商业数据许可)。
- 基于新维度的筛选与对比 UI(本文只管数据获取,不含前端交互设计)。
