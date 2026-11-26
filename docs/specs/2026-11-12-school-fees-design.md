# 私校学费数据层 — 设计与采数规范

- **日期**: 2026-11-12（2026-11-21 合并采集与防漏录操作规范）
- **范围**: 澳洲非政府学校（天主教与独立学校）；已完成新州、维州、昆州全州首轮抓取及西澳部分中学；试点 31 所另有招生和考试信息
- **状态**: 结构化无损 schema、校验与巡检工具已上线，学校页已完整展示

## 1. 为什么做

学校页要回答家长最关心的三件事：能不能进、多少钱、成绩如何。公立学校的“能不能进”靠学区边界已经能答；私校的“多少钱”是空白，`schools.canonical.json` 里 3,794 所私校一条学费都没有。2026-11-10 的 Search Console 分析显示，入学考试和学费相关的搜索落在私校学校页上，排名 35–55，点击为 0。

## 2. 数据放在哪

| 文件 | 进 git | 内容 |
|---|---|---|
| `data/fees/processed/fees.json` | 是 | 状态表兼数据表，结构为 `{ schools: { <acara_sml_id>: entry } }`，每所尝试过的学校一条 |
| `data/fees/raw/<acara_sml_id>/` | 否 | 抓回来的网页和 PDF 文本，供提取和核对 |
| `data/fees/raw/_scs/`、`_cspd/` | 否 | 两个教区统一来源的原始响应 |

**历年学费只存数字和链接，不存原文。** 新学年的学费读进来时，上一年的数字连同当时的 `source_url` 移进 `fees_history`（记下被替换的日期）。学校撤掉或覆盖了旧的学费表，旧链接就失效，我们不替学校保存历年文档。`data/fees/raw/` 只用来核对当期数字，每次重抓都会被覆盖。

用 git 里的 JSON，不用数据库：项目运行时就没有数据库，学费只在构建时用，放在 git 里每次更新都能看到哪些学校的状态变了。

**表里没有的学校 = 还没尝试过。** 这和“尝试过但拿不到”是两件事，所以每次尝试不论结果都要留一条记录。

## 3. 状态

| 状态 | 含义 | 以后能补吗 |
|---|---|---|
| `found` | 从学校或其教育系统公布的来源读到了结构化金额（写在 `fees`） | 每年重抓 |
| `described` | 学校公布了收费规则或金额，但无法整理成标准分年级年费表（如只给每学期价且未写学期数、按体育项目收费、家庭组合价表、收入分档等）；`fees_description` 记核实后的文字说明与来源链接，校验会核对其中所有带 `$` 的金额 | 每年重抓 |
| `fetched` | 页面已抓回，还没读数（中间状态；一个州结束时不应剩下此状态） | 读数 |
| `fee_free` | 学校原话说不收学费；`free.statement` 照抄这句话，`free.source_url` 是出处，校验时必须能在原文里找到 | 每年重抓 |
| `not_published` | 网站写明学费需另行索取，或只列出申请费 | 基本不能 |
| `not_found` | 抓到的页面里没有学费；`note` 写原因 | 换入口再试 |
| `not_extracted` | 页面明确存在学费但技术上确实读不出（如仅在 Flipsnack/Issuu/OneDrive 翻页阅读器里、或无数据源的交互计算器）；能读出收费规则的优先记 `described` | 用浏览器渲染或 OCR |
| `blocked` | 网站拒绝程序访问（403） | 浏览器正常读取 |
| `unreachable` | 网站连不上；`crawl.home_error` 记录原因 | 多半是 ACARA 里的网址过期，补网址 |
| `no_website` | ACARA 没有网址，人工也没查到 | 再查 |
| `campus` | 分校区：ACARA 单列成一条（`campus_type` 为 School Sub-Campus），但没有自己的网址和在校人数；`parent_acara_sml_id` 是 ACARA 的 `rolled_school_id`，网址和学费都是主校的 | 随主校 |

“免费”是一个答案，不是缺数据：学校页对 `fee_free` 显示“不收学费”，并附原话和来源链接，和“学校没公布”“我们还没查到”分开。只有学校自己的话才算，社区目录里的“Service Fees: No”之类不算。特殊学校（为残障学生办的学校）和为辍学青少年办的学校，查一遍网站即可，查不到就记 `not_found`，不必深挖。

ACARA 漏登网址或登记的网址已经过期、由人查到的，记 `website_source: "lookup"`，并在 `website_note` 写明怎么核实的（例如首页标题写着校名）；抓取脚本优先用它，即使 ACARA 有网址。Wilcannia-Forbes 教区 18 所学校的网站已搬到 `<镇名>.wf.catholic.edu.au`，旧地址只会跳到教区的建站页，就是这样补上的。学校页遇到 `campus` 时显示主校的学费，并注明“本校区隶属某校”。

## 4. 数据结构与录数规则

规则延续数据原则第 1 条和第 6 条：**宁可空着，也不能写错；不推算；不能凭空制造精度；源头保真、不因强行压平成单个数字而丢失收费规则**。

### 结构示例

**`fees` 字段（`status: "found"`）**

```json
{
  "fee_year": 2027,
  "billing_unit": "per_student",
  "basis": "one-child family, annual tuition; total adds capital and P&F levies",
  "by_year": [
    { "years": "P-6", "tuition": 2360, "total": 4301, "child_2": 3250 },
    { "years": "7-12", "tuition": 9395 }
  ],
  "sibling_amounts_basis": "per_child",
  "components": [
    { "name": "Tuition Fee", "unit": "per_student", "by_year": [{ "years": "P-6", "amount": 2360 }] },
    { "name": "Building Levy", "unit": "per_family", "amount": 945 }
  ],
  "other_compulsory": "Camps extra; device levy $440 (Years 4-6)",
  "sibling": "2nd child 20% off tuition; 3rd child 40% off",
  "one_off": [{ "item": "Application fee", "aud": 150 }],
  "concession": "Health Care Card / CSEF fee relief available",
  "boarding": "Full boarding $28,500 per year",
  "notes": "Working bee levy $200 refunded on attendance",
  "source": "school_website",
  "source_url": "https://...",
  "read_via": "(optional) e.g. model read of an image-only document; amounts cross-checked against local OCR",
  "ocr_unconfirmed": [10380],
  "discount": "(optional, ≥20 chars) time-limited discount note"
}
```

**`fees_description` 字段（`status: "described"`）**

```json
{
  "fee_year": 2026,
  "pricing_model": "by_program",
  "summary": "Fees vary by sport program; published schedule lists ... ($...)",
  "source": "school_website",
  "source_url": "https://..."
}
```

### 硬性与口径规则

- **照抄，不推算，不加总。** 每个数字都必须能在本地原文里找到。只给每学期 `$1,450`、一年 4 学期时用 `per_term` 和 `terms` 记，不自己乘出 `5800`；只有学校自己公布了合计时才填 `total`（**严禁把全包价或含杂费价填入 `tuition`**），`basis` 说明这个数包含什么。
- **必缴分项拆开记（`components`）。** 只要学校明确列出了建筑费、资本费、资源费、学生费、IT/设备费等固定金额，就用 `components` 逐项记明 `name`、`unit`（`per_student` 或 `per_family`）、`period`（`annual` / `per_term` / `per_semester`）及 `amount` 或 `by_year`；无法按单一金额分项的（如区间或“camps extra”）再用 `other_compulsory` 补充。
- **区分计费对象（`billing_unit`）。** 按学生收费记 `per_student`；按家庭收费（维州、昆州等天主教小学常见的 family fee）必须显式记 `billing_unit: "per_family"`，`basis` 同时写明 `charged per family, not per child`，页面和顶部统计卡片均按家庭口径标注，不和按学生收费混为一谈。
- **保留多孩档位与折扣规则。** 原文列出了第 2、3、4+ 孩具体金额的（例如悉尼天主教、帕拉马塔教区），直接记进 `by_year[].child_2`、`child_3`、`child_4`（第 4 孩全免时允许 `0`），并在 `sibling_amounts_basis` 必填 `per_child`（每生）或 `family_total`（家庭总计）；只公布折扣比例或规则的，在 `sibling` 字段原样记录。
- **保留条件性费用与特殊模式（`notes` 为必查兜底）。** 一次性报名/录取确认费记入 `one_off`；低收入 / Health Care Card / CSEF 优惠政策记入 `concession`；寄宿费记入 `boarding`。每读完一所学校，**必须**再核对一遍原文并确认：“除了以上固定分类外，原文里还有没有其他会影响家庭实际支出或付款方式的条款？”凡是塞不进固定字段的有用信息——例如义工退费（working bee levy refund）、年初一次性付清/早缴折扣、教会成员/教区内外或课程/国籍分档（如 IB、双语学校）、强制营地或指定设备支出、家庭总学费封顶、一年按 3 期或非标准频次扣款等——**一律简明写入 `notes`，不得略过**。
- **无法套表的规则记 `described`。** 能从原文核实收费方式但塞不进标准分年级年费表（如按体育项目收费、只给每学期价且未写学期数、收入分档、家庭组合价表或只有计算器）的学校，记为 `status: "described"`，填写 `fee_year`、`pricing_model`（`per_term_unspecified` / `by_program` / `income_tiered` / `family_combination` / `estimator_only` / `custom`）、核实过的 `summary`（至少 20 字）及 `source` / `source_url`。
- **年份必须有原文依据。** `fee_year` 取页面或文件标题上的年份（不要看文件上传路径里的年份）。只公布了 2025 年或更早年份的，不当作当前学费，记 `not_found`（note 写明只公布了哪一年）；有当期金额但页面未写年份时，`fee_year` 记 `null` 并填 `year_note` 注明查看日期。
- **只要本地生、按原文格式。** 海外生（international / CRICOS / FFPOS）费用不收，只有海外生学费的记 `not_found`；分档收费（如 Lycée Condorcet）记澳洲居民档并在 `basis` 写明。金额带分（`5831.50`）照原样记，不要四舍五入。自愿捐款（building fund donation、library fund、parish contribution）不算进任何金额；校车、学前班（ELC/Kindy/OSHC）不算作在读年费。
- **年份与年级写法。** 已有 2027 年表时优先取 2027 年；`years` 用 `P`、`K`、`1`、`7-10`、`11-12` 等写法，Steiner 的 `Class 1` 等于 Year 1 并在 `basis` 注明；多校区共用一份表时主记录用主校数字，分校区自动沿用。
- **限时折扣。** 有全价对照的带期限优惠（如帕拉马塔教区 Lawson、Springwood 两校），金额照记全价，折扣说明写入 `fees.discount`（一句英文，至少 20 字符）。
- **`source` 取值**：仅限 `school_website`、`scs_endpoint`（悉尼天主教教区）、`diocese_schedule`（教区统一页或文件）。
- **校验与防漏录**：`validate-fees.mjs` 追溯 `by_year`（含 `child_2..4`，允许第 4 孩为 `0`）、`components`、`one_off` 中的每一个金额，以及 `fees_description.summary` 里所有带 `$` 的金额；`audit-omissions.mjs`（`npm run fees:audit`）对照本地原文巡检疑似漏记的杂费、多孩档位、家庭计费口径、`tuition`/`total` 混用、低收入优惠和寄宿费。
- **换年与更正**（`applyReading`，`scripts/fees-common.mjs`）：年份不同的新读数把旧的移进 `fees_history`；同一年重读视为更正，直接替换；新读数没有金额（学校撤了学费表，或改记为 `described`）时，旧金额移进历史，不丢弃。

## 5. 采集、证据与脚本

### 常用命令与分州流程

```bash
# 1) 在 scripts/fees-common.mjs 的 SCOPES 中确认有目标州范围（如 'wa-all'）
# 2) 抓取官网（每校最多 16 页，180 天内抓过的跳过；重抓用 --ids ... --force --concurrency 2）
npm run fees:fetch -- --scope wa-all --concurrency 5
npm run fees:fetch:scs                           # 悉尼天主教教区（支持 --from-cache）
node scripts/fetch-fees-cspd.mjs                 # 帕拉马塔模板教区（支持 --from-cache）
# 3) 查看本州进展与待处理清单
node scripts/fees-tools/gap-report.mjs WA
# 4) 打印待读学校的证据片段（附带杂费/多孩/优惠/寄宿等提醒）
npm run fees:cards -- --status fetched --limit 400 --chars 1100 > /tmp/cards.txt
# 5) 写读数脚本（见下方 readings.mjs 示例）并合并
npm run fees:merge -- /tmp/read0.json /tmp/read1.json
# 6) 校验、防漏录巡检与测试
npm run fees:validate
npm run fees:audit -- --state WA
npm test
```

**操作要点与规范**
- 证据卡片里 `no fee figures` 的学校跳过，统一记 `not_found`。其余每 25 所一批边读边合并校验，别攒到最后。信息被截断时用 `node scripts/fees-tools/grep-raw.mjs <id> "2027|Tuition" 400` 查完整原文。
- 抓取结束后仍为 `fetched` 的学校按页数记 `not_found`，统一使用三种说明：`Only the home page could be fetched.`、`Fee pages were reached but show no figures.`、`No fee page among the pages fetched.`。
- 并发过高易触发 429，重抓用 `--concurrency 2`；爬虫开始抓某校前会清空 `data/fees/raw/<id>/`，运行期间勿向该目录写证据或并行 `fees:merge`。
- 代码与注释用英文，跟用户沟通用中文；提交前逐个 `git add` 自己修改的文件（禁用 `git add -A` / `git add .`），用 `git diff --cached --stat` 核对暂存区，确保 `data/fees/raw/` 不进 git。

### 读数脚本写法（`scripts/fees-tools/readings.mjs`）

临时读数脚本放在 `/tmp`，在仓库根目录执行（需读取 `public/data/schools.canonical.json`）：

```js
import { comp, described, f, perTerm, nf, nx, np, FAMILY, ONE_CHILD, save } from '/abs/path/to/repo/scripts/fees-tools/readings.mjs';
save('/tmp/read0.json', {
  47672: f(
    2027,
    ONE_CHILD + '; total adds levies',
    [['*', 2360, 4301, 3250]],
    'https://.../2027 Fees.pdf',
    'Camps extra',
    {
      billing_unit: 'per_student',
      components: [
        comp('Tuition Fee', 'per_student', [['*', 2360]]),
        comp('Building Levy', 'per_family', 945),
      ],
      sibling: '2nd child 20% off tuition',
      concession: 'Health Care Card discount available',
      notes: 'Working bee levy $150 refunded upon volunteering',
    },
  ),
  47939: perTerm(2026, 'first child, tuition per term', 1470, 'https://...pdf'),
  47999: described(2026, 'by_program', 'Sports program fees range from $5,200 to $9,800 per year depending on code.', 'https://...pdf'),
  47661: nf('The only fee schedule published is for 2025.'),
});
```

- `'*'` 自动替换为该校 ACARA 年级范围（`by_year` 与 `components[].by_year` 均支持）；`f()` 行数组支持 `[years, tuition, total, child_2?, child_3?, child_4?]`；教区统一表在 `extra` 中传 `{ source: 'diocese_schedule' }`。

### 特殊来源与证据保存

- **悉尼天主教教区**：`<代码>.syd.catholic.edu.au` 从 `/wp-content/plugins/scs-school-fees/json.show-one.php?schoolCode=<代码>` 取数，保留 1–4 孩全年合计（含第 4 孩 `$0`）及多孩说明；年份取自学校官网学费页。`--from-cache` 可从 `_scs/` 直接重解析，不覆盖 `checked`。
- **帕拉马塔教区**：解析 `/enrolment/school-fees` 两种排版（`Year 7 1st Child ...` 与 `Fee components Child 1 ...`），保留 4 孩合计与 `components`，自动忽略紧随其后的优惠块并在 `--from-cache` 重解析时保留已有的 `discount`。
- **漏抓文件 / Google Drive**：用 `node scripts/fees-tools/save-page.mjs <id> <url> "label"` 手动保存 PDF/docx/HTML；Drive 链接改写成 `https://drive.google.com/uc?export=download&id=<ID>`（Wollongong 等教区常用）。
- **纯图片 PDF**：用 `swiftc -O scripts/fees-tools/pdf-to-png.swift -o /tmp/pdf-to-png`（其他系统用 `pdftoppm`）渲染后由模型直接读图；另用高清渲染跑 `sh scripts/fees-tools/save-ocr.sh <id> <url> /tmp/hi-1.png` 存 OCR 对照文本（日志网址自动加 `#ocr` 防去重）；OCR 认错的数字逐个列进 `fees.ocr_unconfirmed`，并在 `read_via` 说明。
- **拦爬虫网站（403 / 脚本渲染）**：不用指纹伪装库绕过防护、不登录、不过验证码；在普通浏览器打开页面，将原文保存后执行 `node scripts/fees-tools/save-browser-text.mjs <id> <url> file.txt`（网址带 `#browser`），并填写 `read_via`。
- **已摸清的其他教区与爬虫规则**：
  - **换域名与站点地图**：跳转后域名自动纳入本站（如 `tsc.nsw.edu.au` → `scots.college`）；`www.` 报 5xx 时试裸域名；读取最多 6 个子地图（间隔 0.5 秒）以抓墨尔本天主教小学隐藏学费页；支持 SheetJS 解 `.docx`。
  - **Sandhurst（VIC）**：教区计算器统一读 `ceosand.catholic.edu.au/feecalculator/fee-estimator-V_*.xlsx` 的 Fee model 表（全为 0 的行不当作免费）。
  - **集中/统一学费的教区**：Maitland-Newcastle（NSW：2026 年 K–6 `$1,768`、7–10 `$2,353`、11–12 `$3,488`，除 Windale/Gloucester 等另有免学费声明者及特殊学校外）；Rockhampton（QLD：每校统一 PDF）；Townsville / Cairns（QLD：教区统一定学费、杂费各校自定，补缺前需先请示用户）。各校自定、只能逐校读的包括墨尔本、Ballarat、Sale、布里斯班、图文巴等教区（墨尔本的 `$810` 低收入优惠价和 Family Fee Assistance 都不是学费）。
  - **常见主机路径**：Digistorm（`media.digistormhosting.com.au`）、布里斯班天主教（`/ArticleDocuments/<n>/....pdf.aspx`）、Schoolzine（`*.schoolzineplus.com/_file/media/...`）、汤斯维尔（`os-data-2.s3-ap-southeast-2.amazonaws.com/...`）。
- **常见踩坑**：核对州名/电话区号防止 ACARA 误登记别州同名学校网址（如昆州 47652、47686）；年份看标题不看上传路径；PDF 拆碎的数字（`$7, 470`）校验可识别，照原值写；SharePoint/OneDrive/Issuu/Flipsnack 在线阅读器存不下原文记 `not_extracted`。

## 6. 结果

### 新州全部私校（2026-11-15）

新州按“整州做完再做下一个州”处理：1,207 条私校记录（含小学和特殊学校）全部查过，700 条有学费（之前 483），507 条查过没拿到，没查过的 0 条。

| 类型 | 记录 | 有学费 | 查过没拿到 |
|---|---|---|---|
| 小学 | 596 | 348 | 248 |
| 中学和一贯制 | 537 | 337 | 200 |
| 特殊学校 | 74 | 15 | 59 |

“有学费”含沿用主校学费的分校区；“查过没拿到”含主校没有学费的分校区（新州 218 个分校区，多数是 Aspect 等特殊学校的卫星点）。

各天主教教区的处理：

- **Broken Bay**：每所小学一封 “2026 Schedule of Fees” 信，第一个孩子的 Education Fee。表格常在信的后半部分，8 所是图片 PDF。
- **Wollongong**：每所学校在 Drive 上放一份 “School Fee Information for Families”，记第一个孩子的学费，小学建筑费和学校自定的资源费写进 `other_compulsory`。
- **Lismore**：学校官网统一模板 “The schedule of fees and levies for 2027”，K–6 年费一行，家庭建筑费另列。
- **Bathurst**：统一的 “Fee Schedule <年份>”，按年级给全年合计；只有 2024、2025 年表的学校记为没找到。教区页面只给“每天 4–6 元”的估算，并说具体金额要问学校，只链接到这个页面的学校记为 `not_published`。
- **Maitland-Newcastle**：教区公布全区统一的教区学费（2026 年 K–6 $1,768、7–10 年级 $2,353、11–12 年级 $3,488），学校资源费各校自定，家庭建筑费按家庭收。凡是在教区学校名单里（`mn.catholic.edu.au/school-sitemap.xml`）的学校都记这个统一价（`diocese_schedule`），`basis` 写明不含资源费和建筑费，并注明依据：学校官网的学费链接直接指向教区学费页，或者学校在教区名单里。自己公布了学费的教区中学（St Clare's、Hamilton、San Clemente）金额正好就是这个统一价。学校自己另有说法的以学校为准：Windale 写明学费和建筑费都是 $0，记 `fee_free`；Gloucester 也免学费，按学校自己的页面记录。St Dominic's Centre 是特殊学校，不套用。
- **Canberra-Goulburn、Wagga Wagga、Armidale、Wilcannia-Forbes**：没有统一来源，逐校读；只给每学期金额、没写学期数的过去记为读不出来，后续复核按新规范改记 `described`。

另外补回了几所之前漏读的学校：圣公会学校（Anglican Schools Corporation）的学费表用空格分千位（“$ 7 460”），证据卡片原来不认，例如 Wollondilly、Orange Anglican、Mamre；Sydney Grammar 的 7–12 年级学费（2026 年 $52,410）原先也没读出。

### 特殊学校和青少年学校的核实（2026-11-15）

新州 63 所特殊学校、灵活学习学校和青少年再教育学校逐校核实：

- **学校原话说免费的 12 所**，记 `fee_free`：Youth Off The Streets 的 5 所（FAQ：“There are no fees to attend any Youth Off The Streets school.”）、WAYS Secondary、Blacktown Youth College、Giant Steps、St Laurence Flexible、Novo、Odyssey College，以及 St Canice's Katoomba（帕拉马塔教区的减免计划，2026–2027 年学费、杂费、建筑费全免）。
- **其实收费、读出了学费的 11 所**：Aspect 的 8 所学校共用一份全机构收费表（小学 $7,467、中学 $8,148，一次付清的年费；文件名写 2027，正文没写年份），连带 60 多个卫星校区显示主校学费；St Peter's Heart、The John Berne School、Hunter Trade College（学费表是网页截图，模型读图、OCR 核对）。
- **其余约 40 所**网站上既没有学费也没有免费的说法，照旧记为没找到。

核实后新州有答案的记录从 700 条升到 787 条（622 所有学费、12 所免费、153 个分校区随主校），没答案的 420 条里 65 个是主校也没答案的分校区。

### 补抓（2026-11-19）

在上一轮核实的基础上，把能补的几类新州学校做完，有答案的记录从 787 条升到 852 条：

| 原因 | 处理 | 补回 |
|---|---|---|
| 学校换了域名，爬虫丢掉新首页上的链接 | 修爬虫后重抓 25 所，加上 15 所曾连不上的 | 20 所读出学费（Roseville、Frensham Junior、Pacific Hills、Oxford Falls 等） |
| Wilcannia-Forbes 教区网址过期 | 改用新网址重抓 18 所 | 8 所；其余只公布旧年份、只给每学期金额或页面没有数字 |
| Armidale 教区网站拒绝程序访问 | 浏览器读 24 所统一模板的 `/enrolment-information/` | 23 所有 2026 年学费，Warialda 写明免学费 |
| 其他拒绝程序访问的私校 | 浏览器读 | Irfan、Lutheran Wagga 读出；Wenona 写明需向招生处索取（`not_published`） |
| 原文有金额但没对上年级、或页面靠脚本渲染 | 人工读、浏览器读 | 9 所（Arndell、Scots Albury、Malek Fahd、Korowal、St Edward's 等） |

Korowal 只公布按季度（Quarterly）分期的金额，记为 `per_term` × 4。Toongabbie 只公布了 2026 年 Kindergarten 的学费，其他年级要用学校的计算器，只记这一行。

之后按教区统一学费补上纽卡斯尔教区 41 所学校，Windale 记为免学费，新州有答案的记录升到 894 条。两所学校在 ACARA 登记的网址有误，已按教区名单改正：San Clemente 原来登记的是 Medowie 另一所学校的网站，Catherine McAuley 原来登记的是维州的网址。

全澳 3,794 条私校记录里：1,026 所拿到了学费，13 所学校声明免费，251 个分校区显示主校的学费或免费，其余查过但没拿到的和 1,569 条没查的不变。

### 维州全部私校（2026-11-20）

维州 1,001 条私校记录全部查过。四个天主教教区（墨尔本、Sandhurst、Ballarat、Sale）都没有统一学费：教区只统一定了低收入家庭的优惠价（例如墨尔本 2026 年一孩家庭 $810），学费各校自定，所以逐校读。这一轮抓了 623 所，523 所抓到页面，305 所页面上有数字，逐所人工读。

| 类型 | 记录 | 有答案 |
|---|---|---|
| 天主教小学 | 401 | 143 |
| 天主教中学和一贯制 | 156 | 96 |
| 独立学校（一贯制、中学、小学） | 413 | 187 |
| 特殊学校 | 31 | 2 |

“有答案”含沿用主校学费的分校区（102 个）。没拿到的主要是：页面上没有学费页（约 190 所）、主校没答案的分校区（157 个）、只有学费计算器（约 25 所，多为 Sandhurst 教区）、只公布了旧年份、学费表是 Word 文档或图片。142 所记为按家庭收费。

### 维州补抓（2026-11-20）

在上一轮基础上补了四类：用加了站点地图和 Word 支持的爬虫重抓 272 所（没找到学费页、只抓到首页、打不开或被拦）；Sandhurst 教区的计算器表补 33 所；图片和渲染后才能读的学费表 20 来所；拦爬虫的大校（Scotch、Wesley、Brighton Grammar、St Leonard's 等）在浏览器里读。拿到学费的学校从 326 所到 399 所，加上沿用主校学费的分校区，有答案的从 428 条到 521 条。

剩下的大多是网站上确实没有学费：约 155 所的学费页找不到（多是墨尔本天主教小学，学费只在通讯或入学资料里），25 所左右只放了墨尔本教区的优惠价或政策。另有 9 所证书过期等原因打不开，Firbank、Kingswood、Lighthouse 的学费表只在 Flipsnack、Issuu、OneDrive 阅读器里，没存下原文，记为 `not_extracted`。

### 昆州全部私校（2026-11-21）

昆州 691 条私校记录（天主教 335、独立 356）全部查过：重抓 364 所，有答案的 382 条（拿到学费 345 所，沿用主校的分校区 37 个）。

- **罗克汉普顿教区**：教区网站给每所学校挂了一份 2026 年学费表，格式统一（全包学费加每生建筑费），39 所直接从教区表读，来源记 `diocese_schedule`。
- **汤斯维尔、凯恩斯教区**：学费由教区统一定（汤斯维尔 2026 年小学一孩 $1,952、中学 $2,928，2027 年小学 $2,060；凯恩斯 2026 年 $1,828、2027 年 $1,902，第二个孩子起按比例减），杂费各校自定。这一轮只记了学校自己公布的学费表。
- **布里斯班、图文巴教区**：学费按家庭人数分档，各校自定。记录取"一孩家庭"的学费；学校列了含杂费的一孩合计的，一并记为 total。
- ACARA 给 47652 和 47686 登记的网址是新州同名学校的，抓到的学费不是这两所的，记为没找到。

没拿到的主要是：网站没有学费页或学费页上没有数字（约 107 所）、早先记为"没提取"的 60 所、只公布了旧年份或只有海外生学费的学校，以及打不开或被拦截的 21 所。

### 昆州补抓（2026-11-26）

在上一轮基础上按无损 schema 集中补抓昆州未出数私校，**691 条私校记录里有答案的从 382 条（55.3%）升至 563 条（81.5%，+181 条）**，其中拿到学费（`found`）447 所（+102）、文字说明规则（`described`）8 所（+8）、声明免学费（`fee_free`）14 所（+14）、沿用主校的分校区（`campus`）94 个（+57，另有 28 个主校未公布的卫星校区）。全州私校**在校生人数覆盖率从 67.0% 升至 94.9%（308,316 / 324,789）**；**800 人以上大校从 101 / 151（66.9%）升至 147 / 151（97.4%）**，其余 4 所均已在浏览器逐校核实官网确未公开发布现行学费表（Mt St Michael's、Ignatius Park、Trinity Lutheran 下载区为空、Brisbane Christian 表单含 reCAPTCHA）。

| 批次 | 处理对象与方法 | 主要结果 |
|---|---|---|
| Batch 1（21 所） | `not_found` 中已带 2026/2027 学费 PDF 链接的学校；图片 PDF 渲染并加 OCR | 20 所读出学费、1 所 `described`（Ipswich Adventist）；全部可追溯（`86b8a14`） |
| Batch 2a（35 所） | `not_extracted`（有文本或可重抓）；浏览器取回 Genesis、Ipswich Girls' 等新表，补齐多孩与分项 | 29 所 `found`、5 所 `described`（仅给每学期金额且未写学期数）、Ryan Catholic 转 Batch 5（`aaa279d`） |
| Batch 2b（25 所） | `not_extracted` 重抓后用浏览器打开动态网关/Issuu/SharePoint（St Peters 两校区、TSS、St Aidan's、Glennie、TAS Cairns 等） | 20 所读出学费、5 所核实未公开或仅留 2025 版（`not_published`，`4714498`） |
| Batch 3（22 所） | 此前 `blocked`（Downlands、Mueller、ATC、Arcadia、Ohana 等）、失联改域名（Citipointe、Marymount Primary、Lighthouse、Carlisle）及 800+ 大校（Iona、Coomera Anglican、ACC Moreton、Groves、AIIC、WMAC、St Luke's、Hillcrest、JPC、Jubilee） | 16 所 `found`、1 所 `described`、2 所 `fee_free`（Arcadia、Ohana 免学费仅收 $260/学期杂费）、3 所核实未公开或将于 2026 年底关校（St Mary of the Cross Windsor）（`549e753`） |
| Batch 4（31 所） | 多校区特殊教育/弹性学校网与 12 所 EREA 弹性学校（替换失效的 `youthplus.edu.au` 为 `*.flexi.edu.au`） | 11 所确认免学费记 `fee_free`（BUSY School、Mastery Schools、Carinity 四校、Indie Logan、Jabiru、Holy Spirit College、Inala Flexi、Noosa Flexi — 含 BUSY 与 Mastery 的连带分校区）、Arethusa（$1,200/年资源费 `found`）、Horizons（按周收费 `described`），其余 18 所无收费或免学费公开表述（含 Y Schools 4 校、Alta-1 改名 Aviva、其余 10 所 Flexi 等）（`a6d1f82`） |
| Batch 5（18 所） | 汤斯维尔与凯恩斯教区经逐校审计后回补 | 凯恩斯 2027 教区表（`diocese_schedule`）按乡村 9 折/标准两档补回 7 所；剔除另有减免或免学费政策的 6 所乡村小校改从各校官网直采（Waiben `Access for All` 免学费 `fee_free`、Babinda/Dimbulah/Ravenshoe/South Johnstone/Silkwood 各自低额封顶）；汤斯维尔升级 Cloncurry 2026、补入 Bowen 2026，按教区统一价补入 Ryan（2,019 人）与 Hughenden，并**明确排除**无收费页的 Palm Island（`e305bc9`） |

全州现存 48 所 `source: 'diocese_schedule'` 记录（Rockhampton 39 所、Cairns 7 所、Townsville 2 所），所有 `fetched` 临时状态均已清零，校验（`npm run fees:validate`：14,525 个金额可追溯至原文、37 个经人眼复核图片、28 条 `fee_free` 原文匹配、0 条无原文可查）与 293 项测试全部通过。

### 中学试点记录（2026-11-14）

ACARA 把分校区单列成记录（多数不是独立招生的学校，例如 MLC 的音乐中心、Ravenswood 的寄宿楼），下表把它们并入主校后计数：

| 范围 | ACARA 记录 | 独立学校 | 拿到学费 | 天主教 | 独立学校（sector） |
|---|---|---|---|---|---|
| 悉尼带中学的私校 | 295 | 238 | 171（72%） | 66 / 69 | 105 / 169 |
| 新州其他地区 | 242 | 185 | 105（57%） | 33 / 56 | 72 / 129 |
| 墨尔本带中学的私校 | 378 | 197 | 111（56%） | 42 / 62 | 69 / 135 |
| 昆士兰带中学的私校 | 394 | 298 | 158（53%） | 71 / 105 | 87 / 193 |
| 西澳带中学的私校 | 246 | 166 | 75（45%） | 22 / 43 | 53 / 123 |

当时全澳 3,794 条私校记录里：781 所拿到了学费，140 个分校区显示主校的学费，799 条查过但没拿到（其中 331 个是主校没有学费的分校区），2,074 条还没查。

**按家庭第几个孩子分档的学费表**各州都很常见，一律读“第一个孩子”那一档，后面孩子的折扣写进 `basis`。只有表里根本没有单人一行的（例如只列“一个小学生加一个中学生”这类家庭组合）才记为读不出来。

**2026-11-14 复查“读不出来”的学校：**证据卡片的兜底规则原先只认 `$1,770` 这种带千位逗号的金额，`$1770.00` 或只在表头写一次 `$` 的表都被显示成“没有金额”，272 所里有 179 所其实已经抓到了能读的文字。修好卡片后补读了 95 所；另有 10 所的学费 PDF 是纯图片，用 OCR 转成文字存进原文目录，其中 4 所读出了学费，每个数都对照过渲染出来的页面图（`fees.read_via` 记明）。用浏览器渲染脚本加载的学费页没有多出任何金额，这条路不再试。仍读不出来的学校，状态表的 `fee_pages` 字段存着学费页链接，方便人工核对。

没拿到的主要原因：学费在图片 PDF 或脚本渲染的表格里读不出来；页面上没有学费；网站拒绝程序访问；ACARA 里的网址已失效。墨尔本天主教教区（MACS）没有可以批量导入的统一来源；Wollongong 教区页面上的“预估年费”没写年份，且低于其学校自己公布的 2026 年数字，不采用（各校自己的 Drive 文件见上一节）。

最初“ACARA 没有网址”的 60 所里，57 所是分校区，按 `rolled_school_id` 归到主校；Leppington Anglican College（lac.nsw.edu.au）和 Marsden Park Anglican College（mpac.nsw.edu.au）按域名找到并核对了首页标题；Oasis College Surry Hills 查不到。

## 7. 进度、维护与待办

### 各州当前进度（2026-11-26）

| 州 | 私校记录 | 有答案 | 说明 |
|---|---|---|---|
| NSW | 1,207 | 894（74%） | 全州首轮完成；SCS（140 所）与 CSPD（80 所）已按无损 schema 回补 |
| VIC | 1,001 | 521（52%） | 全州首轮完成 |
| QLD | 691 | 563（81.5%） | 补抓完成（447 所 `found`、8 所 `described`、14 所 `fee_free`、94 个主校有答案的分校区）；在校生覆盖 94.9%，≥800 人大校 147 / 151（97.4%）；Townsville（2 所）与 Cairns（7 所）经逐校审计后回补 `diocese_schedule` |
| WA | 420 | 87（21%） | 只试做过中学和一贯制学校，小学和特殊学校还没开始 |
| SA | 257 | 0 | 未开始 |
| TAS | 96 | 0 | 未开始 |
| ACT | 55 | 0 | 未开始 |
| NT | 67 | 0 | 未开始 |

“有答案”包括：拿到学费（`found`）、文字说明收费规则（`described`）、声明免学费（`fee_free`），以及沿用主校学费的分校区。每个州做完后，在本文件第 6 节加一个小节并用中文汇报（写清比较口径，不自创代号）。

### 维护与待办（按优先级）

1. **完成其余 5 个空白州（WA、SA、TAS、ACT、NT）**：按第 5 节流程完整做一遍（先在 `SCOPES` 中补全对应州范围），首次录入即一步到位按无损 schema 记好分项、计费对象和 `described`。
2. **维州未读项补录与已有记录分项回补**：
   - 维州：9 所因证书打不开用浏览器读取；SEDA College 及其 38 个分校区改记 `described`。
   - 已有学校：按年例行重抓时顺带补齐早期录数未拆出的 `components` 分项、寄宿费与低收入优惠；其中 `fees:audit --state QLD` 仍提示 56 所早先录入学校存在杂费关键词尚未拆出分项、17 所有寄宿费关键词未录 `boarding`，可在年度更新时处理。
3. **年度重抓与杂费分项回补**：学校一般在 9–12 月公布下一年学费，每年 11 月至次年 1 月按 `fee_year` 重抓：`fees:fetch` 用 `--stale-days` 控制范围，SCS/CSPD 教区脚本整体重跑，旧年份自动退入 `fees_history`。同时结合 `npm run fees:audit` 顺带补齐已采学校漏录的杂费分项（避免仅因关键词命中而低效全量返工）。
4. **招生和考试信息**：目前只有试点 31 所，结构见 `fees.json` 里的 `admissions` 字段。
