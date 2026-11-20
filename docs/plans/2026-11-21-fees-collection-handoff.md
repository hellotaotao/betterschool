# 私校学费采集：交接说明（可直接作为 prompt 交给另一个 AI）

> 用法：把本文整篇作为任务说明交给接手的 AI，再加一句具体指令，例如“按本文做西澳（WA），做完提交”。
> 设计依据见 `docs/specs/2026-11-12-school-fees-design.md`，其中“结果”一节有各州已做过的记录。

---

## 0. 你的任务

你在 betterschool.au 仓库里工作（Next.js 静态站，数据都是预先生成的 JSON）。任务是给澳洲非政府学校（天主教和独立学校）收集**学费**：

1. 抓学校官网；
2. 人工（也就是你）读出学费数字；
3. 写进台账 `data/fees/processed/fees.json`；
4. 跑校验；
5. 提交。

一次做完一个州：该州每一所学校都要有一个结论，有学费就记学费，没有就写明原因。

进度：

| 州 | 私校记录 | 有答案 |
|---|---|---|
| NSW | 1,207 | 894（74%） |
| VIC | 1,001 | 521（52%） |
| QLD | 691 | 382（55%） |
| WA | 420 | 87（21%，只试做过中学和一贯制学校，小学和特殊学校还没开始） |
| SA | 257 | 0 |
| TAS | 96 | 0 |
| ACT | 55 | 0 |
| NT | 67 | 0 |

“有答案”包括：拿到学费、学校声明免学费，以及沿用主校学费的分校区。

## 1. 硬性规则（比完成度更重要）

1. **宁可空着，不填错的。** 不确定的数字不写。每个数字都必须能在本地保存的原文里找到；校验脚本会逐个金额核对，找不到就报错。
2. **不推算。** 例如：
   - 每学期 $1,450、一年四个学期，不能写成全年 $5,800，因为原文里没有 5,800 这个数；用 `per_term` 字段记。
   - 学费加杂费的合计，原文没写就不写 total。
3. **年份必须明确。**
   - 用学校页面或文件标题写明的年份（2026、2027）。
   - 只公布了 2025 年或更早的，不当作当前学费，记 `not_found`，note 写“只公布了 20xx 年”。
   - 页面确实没写年份时，fee_year 填 null，会自动加 year_note。
4. **只要本地学生的学费。** 海外学生学费（international、CRICOS、FFPOS）不要；只有海外生学费的学校记 `not_found`。
5. **不要绕过网站防护。** 不用伪装浏览器指纹的库（curl_cffi 之类），不过验证码，不登录。网站拦爬虫时，可以在普通浏览器里打开页面阅读。
6. **代码和注释用英文。** 跟用户沟通用中文。
7. **Git 规则：**
   - 直接在 main 上提交并推送。
   - 只 `git add` 自己改的具体文件，禁止 `git add -A` 或 `git add .`。
   - 提交前用 `git diff --cached --stat` 核对暂存区。
   - `data/fees/raw/` 不进 git，是本地证据目录。

## 2. 台账结构

`data/fees/processed/fees.json` 的结构是 `{ schools: { <acara_sml_id>: entry } }`。每所尝试过的学校一条，没有这条记录表示从没尝试过。

**状态（`scripts/fees-common.mjs` 里的 STATUSES）**

| 状态 | 含义 |
|---|---|
| `found` | 有学费，写在 `fees` 里 |
| `fee_free` | 学校原话声明不收学费；`free.statement` 引原句，`free.source_url` 给出处 |
| `campus` | 分校区，沿用 `parent_acara_sml_id` 主校的学费；爬虫自动判定，不用管 |
| `fetched` | 抓到了页面但还没读；每个州结束时不应剩下这个状态 |
| `not_found` | 抓了，没找到学费；note 写原因 |
| `not_extracted` | 学费存在但读不出，比如只有交互计算器、只有在线翻页阅读器；note 写原因 |
| `not_published` | 网站说学费需向学校索取 |
| `blocked` | 网站拒绝爬虫 |
| `unreachable` | 网站打不开 |
| `no_website` | 没有网址 |

**fees 字段**

```json
{
  "fee_year": 2027,
  "basis": "one-child family, annual tuition; total adds capital and P&F levies",
  "by_year": [{ "years": "P-6", "tuition": 2360, "total": 4301 }, { "years": "7-12", "tuition": 9395 }],
  "other_compulsory": "Camps extra; device levy $440 (Years 4-6)",
  "source": "school_website",
  "source_url": "https://...",
  "read_via": "(optional) e.g. model read of an image-only document; amounts cross-checked against local OCR",
  "ocr_unconfirmed": [10380],
  "discount": "(optional, ≥20 chars) time-limited discount note"
}
```

- `years` 用 `P`、`K`、`1`、`7-10`、`11-12` 这样的写法。
- `source` 只能是三个值之一：
  - `school_website`：学校官网；
  - `diocese_schedule`：教区统一表；
  - `scs_endpoint`：悉尼天主教教区的接口。
- 金额可以带分（5831.50），按原文原样写，不要四舍五入。

## 3. 每个州的流程

在仓库根目录执行。

```bash
# 1) Add a scope for the state in SCOPES (scripts/fees-common.mjs), e.g.
#    'wa-all': school => school.state === 'WA' && school.sector !== 'Government',
# 2) Crawl: up to 16 pages per school, reads sitemaps, follows fee links first, converts PDF/docx to text
npm run fees:fetch -- --scope wa-all --concurrency 5
#    Re-crawl specific schools: node scripts/fetch-fees.mjs --ids 1,2,3 --force --concurrency 2
# 3) Status overview
node scripts/fees-tools/gap-report.mjs WA
# 4) Print excerpts from every school still in status "fetched" (evidence cards)
npm run fees:cards -- --status fetched --limit 400 --chars 1100 > /tmp/cards.txt
# 5) Read them and write a readings script (see section 6); its output goes to a readings JSON file
# 6) Merge (one or more files)
npm run fees:merge -- /tmp/read0.json /tmp/read1.json
# 7) Validate (must end with "fees ledger OK")
npm run fees:validate
npm test
```

**操作要点**

- 证据片段（cards）里，写着 `no fee figures` 的学校是原文里一个金额都没有，跳过不读，最后统一记 `not_found`。其余的每 25 所一批读。片段只截了一段原文，信息不全时用第 5 节的 grep-raw 查原文。
- 每批读完就合并、校验一次，别攒到最后。
- 抓取结束后，还是 `fetched` 的学校按页数记 `not_found`，note 用这三种统一说法：
  - `Only the home page could be fetched.`（只抓到首页）
  - `Fee pages were reached but show no figures.`（有学费页但没数字）
  - `No fee page among the pages fetched.`（没找到学费页）
- 并发高了会被学校主机回 429。重抓时用 `--concurrency 2`，被限流的过一会儿再试。
- 爬虫在抓一所学校之前会**清空**它的 `data/fees/raw/<id>/`。爬虫运行期间不要往同一所学校的目录里存证据，也不要同时合并台账，因为爬虫每 10 所会写一次台账。

## 4. 怎么读数（判断规则）

**读哪个价**

- 天主教小学多按家庭收费（family fee），按孩子数量分档。记“一孩家庭”的价格：
  - basis 写 `one-child family, annual tuition (sibling rates are lower)`；
  - 按家庭收的写 `charged per family, not per child`。
- 学校列出了“一个孩子的全年合计（含杂费）”，就同时记 tuition 和 total，并在 basis 里说明 total 包含哪些项。
- 只有一个全包价、分不出学费的（例如墨尔本 Mercy College 2027 年 $7,160，包含学费、营地、杂费和笔记本电脑），只记 total，不记 tuition，basis 说明包含什么。
- 学校的表里既有全包价、又另列一项费用时，全包价记 tuition，加上那项费用后的合计记 total。例如罗克汉普顿教区：all-inclusive education fee 记 tuition，加上每生的 building levy 后的合计记 total。
- 学校只给每学期金额：用 `per_term` 和 `terms`。原文写了一年几个学期才填 `terms`；有的学校一年按 3 次收费。

**年份和年级**

- 同一所学校同时有 2026 和 2027 年的表，取 2027 年。
- 按年级分档就分行；几个年级金额相同就合并成一行，例如 `P-2`。
- Steiner 学校的 `Class 1` 等于 Year 1，在 basis 里注明。
- 一所学校的表覆盖多个校区：主记录用主校区的数字，分校区自动沿用。

**杂费和其他字段**

- 杂费不进 tuition，在 `other_compulsory` 用一句话概括，例如 “Capital levy $660 per family; IT levy $330 per student; camps extra”。
- 自愿捐款（building fund donation、library fund、parish contribution）不算进任何金额。
- 早缴、兄弟姐妹等折扣一般不记。只有带期限的特价同时有全价时，才用 `discount` 字段写说明。

**不算学费的**：报名费、注册费、押金、校车费、学前班（ELC/Kindy/OSHC）费用，都不算学费。

**免学费**：只有学校原话说明 no tuition fees / free 时，才记 `fee_free`。特殊学校（为残障学生办的学校）和为辍学青少年办的学校，查一遍网站即可，查不到就记 `not_found`，不必深挖。

## 5. 证据：每个金额都要能追溯

- 爬虫抓到的页面会自动成为证据。
- 爬虫漏掉的文件用 `node scripts/fees-tools/save-page.mjs <id> <url> "label"` 手动存一份，支持 PDF、docx、HTML。
- Google Drive 文件：把 `drive.google.com/file/d/<ID>/view` 改成 `https://drive.google.com/uc?export=download&id=<ID>` 再存。
- **图片或没有文字层的 PDF**（下面的渲染工具只能在 macOS 上编译；其他系统可用 poppler 的 pdftoppm 代替）：
  1. `swiftc -O scripts/fees-tools/pdf-to-png.swift -o /tmp/pdf-to-png`
  2. `/tmp/pdf-to-png in.pdf /tmp/p 1.4` 渲染成图片，你看图读数。
  3. 再用 `/tmp/pdf-to-png in.pdf /tmp/hi 3` 渲染一份高清图，跑 `sh scripts/fees-tools/save-ocr.sh <id> <url> /tmp/hi-1.png` 把 OCR 文字存进证据（这一步要装 tesseract）。
  4. reading 里加 `read_via`。OCR 认错的数字（常见的是丢掉开头的 1）列进 `ocr_unconfirmed`，表示已对图人工复核。
- **网站拦爬虫：** 在浏览器里打开，把学费段落原文逐字复制到文件，再运行 `node scripts/fees-tools/save-browser-text.mjs <id> <url> file.txt`，reading 里写 `read_via: 'fee table read in a browser; the site blocks the crawler'`。不要凭记忆重打数字。
- 证据日志里，OCR 的网址后缀是 `#ocr`，浏览器读的是 `#browser`。原因是同一网址只计一次，不加后缀会被去重掉。
- 查某所学校原文里的年份、表头：`node scripts/fees-tools/grep-raw.mjs <id> "2027|Tuition" 400`

## 6. 读数脚本的写法

用 `scripts/fees-tools/readings.mjs` 写读数脚本。脚本放临时目录，不进仓库；import 时写仓库里这个文件的绝对路径，并且在仓库根目录运行脚本，因为它要读 `public/data/schools.canonical.json`。

```js
import { f, perTerm, nf, nx, np, FAMILY, ONE_CHILD, save } from '/abs/path/to/repo/scripts/fees-tools/readings.mjs';
save('/tmp/read0.json', {
  47672: f(2027, ONE_CHILD + '; total adds levies', [['*', 2360, 4301]], 'https://.../2027 Fees.pdf', 'Camps extra'),
  47939: perTerm(2026, 'first child, tuition per term', 1470, 'https://...pdf'),
  47661: nf('The only fee schedule published is for 2025.'),
});
```

- `'*'` 会自动换成学校在 ACARA 的年级范围。
- 教区统一表要把 `source` 改成 `diocese_schedule`：给 `f()` 的第 6 个参数 extra 传 `{ source: 'diocese_schedule' }`。
- 用 `f()` 时：第 1 个参数是 fee_year，第 2 个是 basis，第 3 个是行（`[years, tuition, total]`，用 null 跳过某一项），第 4 个是 source_url，第 5 个是 other_compulsory，第 6 个是 extra。

## 7. 已经摸清的捷径（先查这些，能省很多工夫）

**天主教教区有统一学费或集中公布**

| 教区 | 做法 |
|---|---|
| 悉尼（NSW） | `fetch-fees-scs.mjs` 调接口取数 |
| 帕拉马塔模板（NSW） | `fetch-fees-cspd.mjs` 解析 `/enrolment/school-fees` |
| Maitland-Newcastle（NSW） | 教区统一学费：K-6 $1,768，7-10 $2,353，11-12 $3,488（2026） |
| Sandhurst（VIC） | 学费计算器读同一个公开 Excel：`ceosand.catholic.edu.au/feecalculator/fee-estimator-V_*.xlsx`，Fee model 表里有每校数据 |
| Rockhampton（QLD） | 教区网站每校页面挂着 `<school>_-_2026_schedule_of_fees.pdf`，格式统一 |
| 汤斯维尔（QLD） | 学费由教区统一定（Ignatius Park College 和 St Patrick's College 除外）。一个孩子的全年学费：2026 年小学 $1,952、中学 $2,928；2027 年小学 $2,060（2027 年中学价还没见到）。杂费各校不同 |
| 凯恩斯（QLD） | 学费由教区统一定。一个孩子的全年小学学费：2026 年 $1,828，2027 年 $1,902；第二个孩子起按比例减。部分乡村学校另有折扣（如 Good Counsel 2026 年 $1,645）。中学价还没整理 |

**各校自定、只能逐校读的**：墨尔本、Ballarat、Sale、布里斯班、图文巴等教区。墨尔本教区只统一了低收入家庭的优惠价（2026 年一孩家庭 $810，凭优惠卡申请），那不是学费。

用教区统一价补那些自己没公布学费的学校之前，先问用户；用户在 Maitland-Newcastle 一例上同意过。

**常见网站平台**：
- Digistorm 的 PDF 在 `media.digistormhosting.com.au`；
- 布里斯班天主教学校的 PDF 在 `/ArticleDocuments/<n>/....pdf.aspx`；
- Schoolzine 的在 `*.schoolzineplus.com/_file/media/...`；
- 汤斯维尔学校的在 `os-data-2.s3-ap-southeast-2.amazonaws.com/...`。

## 8. 踩过的坑

- **ACARA 登记的网址可能是别州同名学校的**，例如昆州 47652、47686 登记的都是新州网站。看到页面地址、电话区号、州名对不上，不要采用，记 `not_found` 并写明原因。
- **学费表的年份看页面标题**，不要看文件上传路径。`/uploads/2023/11/Fee_Schedule_2026.pdf` 是 2026 年的表。
- **学费表可能被截断。** 证据片段只截取了一段，第一个孩子那一行或某些年级可能不在片段里，用 grep-raw 查原文。
- **数字被拆碎或贴着符号**：PDF 会把数字拆开（`$7, 470`、`1,952$`、`$99 6`），校验能识别，照原值写。
- **SharePoint、OneDrive、Issuu、Flipsnack 阅读器**里的学费表存不下原文，记 `not_extracted`。
- **只有交互计算器的**，先看页面加载了什么数据文件（Sandhurst 就是一个 xlsx）。找不到数据文件再记 `not_extracted`。
- **概念不要混**：墨尔本教区“concessional fee”（低收入优惠价）、“Family Fee Assistance”（学费资助），都不是学费。

## 9. 交付和汇报

每做完一批就提交，提交说明用英文。署名行按用户或你所在工具的规定加；没有规定就不加。

一个州做完后：
1. 在 `docs/specs/2026-11-12-school-fees-design.md` 的“结果”一节加一个小节：总数、有答案的数量、来源构成、各教区规律、没拿到的主要原因。
2. 用中文向用户汇报，写清楚数字是拿什么和什么比的，不要用自己起的代号。

## 10. 待办（按优先级）

1. **西澳（WA）、南澳（SA）、塔州（TAS）、首都领地（ACT）、北领地（NT）**：按第 3 节完整做一遍。每个州开始前，先在 `scripts/fees-common.mjs` 的 SCOPES 里给这个州加一条抓取范围，例如 `'wa-all'`。
2. **昆州：对第一轮没拿到学费的学校，重新抓取或在浏览器里补读：**
   - 39 所学费页上没数字（多半是图片或嵌入文档）；
   - 60 所早期记为 not_extracted；
   - 21 所打不开或被拦截；
   - 汤斯维尔、凯恩斯教区的学校是否按教区统一价补，先问用户。
3. **维州：对剩下没拿到学费的学校继续补读：**
   - SEDA College 按体育项目收费，38 个分校区跟着空着；可以考虑记一个区间，先问用户；
   - 9 所因证书问题打不开，用浏览器读。
4. 每年 10–12 月学校陆续公布下一年学费，可以按状态表重抓，合并时会把旧年份自动移到 `fees_history`。
