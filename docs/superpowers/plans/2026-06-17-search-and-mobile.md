# 搜索 + 移动端适配 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 betterschool.au 加纯本地学校搜索(校名/区名/邮编),并用底部抽屉布局让站点在手机上可用。

**Architecture:** 把 558 行的 `app/schools/page.tsx` 拆成职责单一的组件(SearchBox / FilterBar / SchoolList / SchoolDetail / BottomSheet),搜索逻辑抽到纯函数 `lib/searchSchools.ts`(vitest 单测),用 `useMediaQuery` 在桌面浮层布局与移动抽屉布局之间切换。每个任务保持 app 可运行。

**Tech Stack:** Next.js 16, React 19, TypeScript, Leaflet/react-leaflet, Tailwind v4, vitest(新增)。

**Spec:** `docs/superpowers/specs/2026-06-17-search-and-mobile-design.md`

**分支:** `feature/search-and-mobile`(已创建)

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `vitest.config.ts` | 创建 | vitest 配置 + `@` 别名 |
| `package.json` | 修改 | 加 `test` 脚本 + vitest devDep |
| `lib/searchSchools.ts` | 创建 | 纯搜索函数 |
| `lib/searchSchools.test.ts` | 创建 | 搜索单测 |
| `lib/useMediaQuery.ts` | 创建 | 响应式断点 hook |
| `messages/en.json` `messages/zh.json` | 修改 | 搜索/移动端文案 |
| `components/SchoolDetail.tsx` | 创建 | 详情面板(从 page 抽出) |
| `components/SchoolList.tsx` | 创建 | 列表(从 page 抽出) |
| `components/FilterBar.tsx` | 创建 | 筛选胶囊(从 page 抽出) |
| `components/SearchBox.tsx` | 创建 | 搜索框 + 下拉 |
| `components/BottomSheet.tsx` | 创建 | 移动端抽屉 |
| `components/SchoolMap.tsx` | 修改 | 加 `fitToSchools` + 修 marker key |
| `app/schools/page.tsx` | 修改 | 状态容器 + 桌面/移动布局切换 |

---

## Task 1: 接入 vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `lib/sanity.test.ts`(临时,验证通过后删)

- [ ] **Step 1: 安装 vitest**

Run: `npm install -D vitest`
Expected: `package.json` 的 devDependencies 出现 `vitest`。

- [ ] **Step 2: 写 vitest 配置**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: { environment: 'node' },
});
```

- [ ] **Step 3: 加 test 脚本**

Modify `package.json` 的 `scripts`,加入:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 写一个临时 sanity 测试**

Create `lib/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 跑测试确认 runner 工作**

Run: `npm test`
Expected: PASS,1 passed。

- [ ] **Step 6: 删掉 sanity 测试并提交**

```bash
rm lib/sanity.test.ts
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest test runner"
```

---

## Task 2: `lib/searchSchools.ts`(TDD)

**Files:**
- Create: `lib/searchSchools.ts`
- Test: `lib/searchSchools.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `lib/searchSchools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { School } from '@/types/school';
import { searchSchools } from './searchSchools';

function make(partial: Partial<School>): School {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    acara_sml_id: 1,
    school_name: partial.school_name ?? 'Test School',
    suburb: partial.suburb ?? 'Testville',
    state: partial.state ?? 'SA',
    postcode: partial.postcode ?? '5000',
    sector: partial.sector ?? 'Government',
    lat: -34.9, lng: 138.6,
    legacy_metric_status: partial.legacy_metric_status ?? 'unavailable',
    ...partial,
  } as School;
}

const fixture: School[] = [
  make({ id: 'a', school_name: 'Glenunga International High School', suburb: 'Glenunga', state: 'SA', postcode: '5064', legacy_metric_status: 'available', legacy_score: 95 }),
  make({ id: 'b', school_name: 'Mount Glen Primary School', suburb: 'Glen Osmond', state: 'SA', postcode: '5064' }),
  make({ id: 'c', school_name: 'Adelaide High School', suburb: 'Adelaide', state: 'SA', postcode: '5000' }),
  make({ id: 'd', school_name: 'Richmond Primary School', suburb: 'Richmond', state: 'SA', postcode: '5033' }),
  make({ id: 'e', school_name: 'Richmond West Primary', suburb: 'Richmond', state: 'VIC', postcode: '3121' }),
];

describe('searchSchools', () => {
  it('returns [] for queries shorter than 2 chars', () => {
    expect(searchSchools('g', fixture)).toEqual([]);
    expect(searchSchools('', fixture)).toEqual([]);
  });

  it('ranks name startsWith above mid-word includes', () => {
    const r = searchSchools('glen', fixture);
    const schools = r.filter(x => x.type === 'school');
    expect(schools[0]).toMatchObject({ type: 'school', school: { id: 'a' } });
    // 'Mount Glen...' (includes) comes after 'Glenunga...' (startsWith)
    expect(schools.map(s => s.type === 'school' && s.school.id)).toContain('b');
    expect(schools.findIndex(s => s.type === 'school' && s.school.id === 'a'))
      .toBeLessThan(schools.findIndex(s => s.type === 'school' && s.school.id === 'b'));
  });

  it('matches postcode by prefix as a place result', () => {
    const r = searchSchools('5064', fixture);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'place', label: '5064', state: 'SA' });
    expect(r[0].type === 'place' && r[0].schools).toHaveLength(2);
  });

  it('groups suburb matches into one place per suburb+state', () => {
    const r = searchSchools('richmond', fixture);
    const places = r.filter(x => x.type === 'place');
    const labels = places.map(p => p.type === 'place' && p.label);
    expect(labels).toContain('Richmond, SA');
    expect(labels).toContain('Richmond, VIC');
  });

  it('caps total results at 8', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      make({ id: `m${i}`, school_name: `Zebra School ${i}` }));
    expect(searchSchools('zebra', many).length).toBeLessThanOrEqual(8);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL,`searchSchools` 未定义 / 模块找不到。

- [ ] **Step 3: 实现 searchSchools**

Create `lib/searchSchools.ts`:

```ts
import type { School } from '@/types/school';

export type SearchResult =
  | { type: 'school'; school: School }
  | { type: 'place'; label: string; state: string; postcode?: string; schools: School[] };

const MAX_RESULTS = 8;

export function searchSchools(rawQuery: string, schools: School[]): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return [];

  if (/^\d+$/.test(query)) {
    const byPostcode = new Map<string, School[]>();
    for (const s of schools) {
      if (s.postcode && s.postcode.startsWith(query)) {
        const arr = byPostcode.get(s.postcode) ?? [];
        arr.push(s);
        byPostcode.set(s.postcode, arr);
      }
    }
    return [...byPostcode.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, MAX_RESULTS)
      .map(([postcode, group]) => ({
        type: 'place' as const,
        label: postcode,
        state: group[0].state,
        postcode,
        schools: group,
      }));
  }

  // School name matches, ranked: 0 startsWith, 1 word-boundary, 2 includes.
  const nameMatches: { school: School; rank: number }[] = [];
  for (const s of schools) {
    const name = s.school_name.toLowerCase();
    const idx = name.indexOf(query);
    if (idx === -1) continue;
    const rank = idx === 0 ? 0 : name[idx - 1] === ' ' ? 1 : 2;
    nameMatches.push({ school: s, rank });
  }
  nameMatches.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const aScored = a.school.legacy_metric_status === 'available' ? 0 : 1;
    const bScored = b.school.legacy_metric_status === 'available' ? 0 : 1;
    if (aScored !== bScored) return aScored - bScored;
    return a.school.school_name.localeCompare(b.school.school_name);
  });

  // Suburb matches grouped by suburb+state.
  const bySuburb = new Map<string, School[]>();
  for (const s of schools) {
    if (s.suburb && s.suburb.toLowerCase().includes(query)) {
      const key = `${s.suburb}|${s.state}`;
      const arr = bySuburb.get(key) ?? [];
      arr.push(s);
      bySuburb.set(key, arr);
    }
  }
  const placeResults: SearchResult[] = [...bySuburb.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, group]) => {
      const [suburb, state] = key.split('|');
      return { type: 'place', label: `${suburb}, ${state}`, state, schools: group };
    });

  const schoolResults: SearchResult[] = nameMatches.map(m => ({ type: 'school', school: m.school }));

  // Schools first, then fill remaining slots with places.
  return [...schoolResults, ...placeResults].slice(0, MAX_RESULTS);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: PASS,所有用例通过。

- [ ] **Step 5: 提交**

```bash
git add lib/searchSchools.ts lib/searchSchools.test.ts
git commit -m "feat: add local school search (name/suburb/postcode)"
```

---

## Task 3: i18n 文案

**Files:**
- Modify: `messages/en.json`, `messages/zh.json`

- [ ] **Step 1: 加英文文案**

在 `messages/en.json` 顶层对象内加入(放在 `filters` 之前即可):

```json
"search": {
  "placeholder": "Search school / suburb / postcode",
  "schoolsGroup": "Schools",
  "placesGroup": "Suburbs & postcodes",
  "placeCount": "{count} schools",
  "noResults": "No matches"
},
```

- [ ] **Step 2: 加中文文案**

在 `messages/zh.json` 同一位置加入:

```json
"search": {
  "placeholder": "搜索学校 / 区 / 邮编",
  "schoolsGroup": "学校",
  "placesGroup": "地区与邮编",
  "placeCount": "{count} 所学校",
  "noResults": "无匹配结果"
},
```

- [ ] **Step 3: 验证类型与构建**

Run: `npm run lint && npx tsc --noEmit`
Expected: 无错误(`Messages` 类型由 `en.json` 推导,两文件结构需一致)。

- [ ] **Step 4: 提交**

```bash
git add messages/en.json messages/zh.json
git commit -m "feat: add i18n strings for search and mobile"
```

---

## Task 4: `lib/useMediaQuery.ts`

**Files:**
- Create: `lib/useMediaQuery.ts`

- [ ] **Step 1: 实现 hook**

Create `lib/useMediaQuery.ts`:

```ts
import { useState, useEffect } from 'react';

/** SSR-safe media query hook. Returns false until mounted, then tracks matches. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
```

- [ ] **Step 2: 验证构建**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add lib/useMediaQuery.ts
git commit -m "feat: add useMediaQuery hook"
```

---

## Task 5: 抽出 `SchoolDetail` 组件

**Files:**
- Create: `components/SchoolDetail.tsx`
- Modify: `app/schools/page.tsx`(替换 line 372-532 的详情面板 JSX)

- [ ] **Step 1: 创建 SchoolDetail**

Create `components/SchoolDetail.tsx`。组件接收选中学校并渲染详情。把 `app/schools/page.tsx` 第 372-532 行 `{selectedSchool && (...)}` 内层那块详情 JSX 整体搬进来,外层容器 `className` 改为由 prop `variant` 决定(桌面浮层 vs 移动抽屉内容):

```tsx
"use client";

import { School } from '@/types/school';
import { getSchoolTypeLabel, getSectorLabel, Messages } from '@/lib/i18n';
import { hasLegacyScore } from '@/utils/schoolFilters';

interface SchoolDetailProps {
  school: School;
  dictionary: Messages;
  onClose: () => void;
  variant?: 'panel' | 'sheet';
}

export default function SchoolDetail({ school, dictionary, onClose, variant = 'panel' }: SchoolDetailProps) {
  const wrapClass = variant === 'panel'
    ? 'absolute top-14 right-3 bottom-3 z-10 w-56 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden'
    : 'flex flex-col h-full overflow-hidden bg-white';

  return (
    <div className={wrapClass}>
      {/* === 把原 page.tsx 373-531 行的 header + 详情内容整体移到此处, ===
          === 把 selectedSchool 改名为 school,handleMapClick 改为 onClose === */}
    </div>
  );
}
```

> 实现要点:原 JSX 用 `selectedSchool.xxx`,在此组件改为 `school.xxx`;关闭按钮 `onClick={handleMapClick}` 改为 `onClick={onClose}`;`dictionary` 由 prop 传入。逻辑/字段一字不改。

- [ ] **Step 2: 在 page 里改用组件**

Modify `app/schools/page.tsx`:把第 372-532 行整段 `{selectedSchool && (<div ...>...</div>)}` 替换为:

```tsx
{selectedSchool && (
  <SchoolDetail
    school={selectedSchool}
    dictionary={dictionary}
    onClose={handleMapClick}
  />
)}
```

并在文件顶部加 `import SchoolDetail from '../../components/SchoolDetail';`。删除 page 中现在已无用的 `getSchoolTypeLabel`/`getSectorLabel` import(若 SchoolList 抽出后也不再用)。

- [ ] **Step 3: 验证构建 + 桌面无回归**

Run: `npm run build`
Expected: 构建成功。

Run(浏览器 QA):
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
npm run dev &  # 或已运行的 dev server
$B goto http://localhost:3000/schools
$B js "var el=Array.from(document.querySelectorAll('div.cursor-pointer'))[10]; el && el.click(); 'clicked'"
$B screenshot /tmp/detail-check.png
```
Expected: 右侧详情面板正常显示(与改动前一致)。

- [ ] **Step 4: 提交**

```bash
git add components/SchoolDetail.tsx app/schools/page.tsx
git commit -m "refactor: extract SchoolDetail component"
```

---

## Task 6: 抽出 `SchoolList` 组件

**Files:**
- Create: `components/SchoolList.tsx`
- Modify: `app/schools/page.tsx`(替换 line 274-369 列表面板内容)

- [ ] **Step 1: 创建 SchoolList**

Create `components/SchoolList.tsx`,props 接口如下,内容搬自 page 第 274-369 行(列表头部 + 统计 + 数据说明 + 卡片列表):

```tsx
"use client";

import { RefObject } from 'react';
import { School } from '@/types/school';
import { getSectorLabel, formatMessage, Messages } from '@/lib/i18n';
import { hasLegacyScore } from '@/utils/schoolFilters';

interface AreaSummary {
  scored: number; government: number; catholic: number; independent: number; averageIcsea: number | null;
}

interface SchoolListProps {
  schools: School[];
  selectedSchool: School | null;
  sortBy: 'name' | 'score' | 'icsea' | 'enrolments';
  onSortChange: (v: 'name' | 'score' | 'icsea' | 'enrolments') => void;
  onSchoolClick: (s: School) => void;
  areaSummary: AreaSummary;
  areaLabel: string;
  loading: boolean;
  geoReady: boolean;
  dictionary: Messages;
  selectedCardRef: RefObject<HTMLDivElement | null>;
}

export default function SchoolList(props: SchoolListProps) {
  const { schools, selectedSchool, sortBy, onSortChange, onSchoolClick,
          areaSummary, areaLabel, loading, geoReady, dictionary, selectedCardRef } = props;
  return (
    <div className="w-full h-full bg-white/95 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* === 把 page 276-367 行的「头部 select + 统计 grid + 数据说明 + 列表」搬来 ===
          === displayedSchools 改名为 props.schools;selectedSchool 用 props === */}
    </div>
  );
}
```

> 实现要点:原 `displayedSchools` 改用 `props.schools`(排序已在 page 完成后传入);卡片 `key` 用 `school.id`;`schoolId(school)` 内联为 `school.id`;其余 JSX/类名照搬。

- [ ] **Step 2: 在 page 桌面布局里改用组件**

Modify `app/schools/page.tsx`:把第 274-369 行 `{leftPanelOpen && (<div className="w-full bg-white/95...">...</div>)}` 的**内部内容**替换为 `<SchoolList .../>`(保留外层折叠容器与折叠按钮),传入对应 props(`schools={displayedSchools}` 等)。顶部加 `import SchoolList from '../../components/SchoolList';`。

- [ ] **Step 3: 验证构建 + QA**

Run: `npm run build`
Expected: 成功。浏览器确认左侧列表与排序、统计、卡片选中行为不变。

- [ ] **Step 4: 提交**

```bash
git add components/SchoolList.tsx app/schools/page.tsx
git commit -m "refactor: extract SchoolList component, use school.id as key"
```

---

## Task 7: 抽出 `FilterBar` 组件

**Files:**
- Create: `components/FilterBar.tsx`
- Modify: `app/schools/page.tsx`(替换 line 180-259 顶部筛选条)

- [ ] **Step 1: 创建 FilterBar**

Create `components/FilterBar.tsx`。把 page 第 39-73 行的五组 options 计算与第 180-259 行的渲染搬进组件;props:

```tsx
"use client";

import { Messages } from '@/lib/i18n';
import { FilterState } from '@/utils/schoolFilters';

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  dictionary: Messages;
  variant?: 'wrap' | 'scroll';
}

export default function FilterBar({ filters, onChange, dictionary, variant = 'wrap' }: FilterBarProps) {
  // === 把 page 39-73 行的 legacyMetricOptions/sectorOptions/icseaOptions/
  //     enrolmentOptions/typeOptions 五组 useMemo 搬到这里(可不用 useMemo,直接常量数组) ===
  const containerClass = variant === 'scroll'
    ? 'flex gap-2 overflow-x-auto no-scrollbar pb-1'   // 移动端:单行横滑
    : 'flex gap-2 flex-wrap';                          // 桌面:换行
  return (
    <div className={containerClass}>
      {/* === 把 page 182-257 行的五个胶囊 group 搬来,setFilters(f=>...) 改为 onChange({...filters, ...}) === */}
    </div>
  );
}
```

> `variant='scroll'` 用到 `no-scrollbar`:在 `app/globals.css` 加一个工具类:
> ```css
> @layer utilities { .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { scrollbar-width: none; } }
> ```

- [ ] **Step 2: 在 page 里改用组件**

Modify `app/schools/page.tsx`:第 180-259 行顶部筛选条容器内层替换为 `<FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} />`。删掉 page 中已搬走的五组 options useMemo(39-73 行)。顶部加 import。

- [ ] **Step 3: 验证构建 + QA + 测试**

Run: `npm run build && npm test`
Expected: 成功。浏览器确认五组筛选行为不变。

- [ ] **Step 4: 提交**

```bash
git add components/FilterBar.tsx app/schools/page.tsx app/globals.css
git commit -m "refactor: extract FilterBar component with scroll variant"
```

---

## Task 8: `SearchBox` 组件 + 桌面接线

**Files:**
- Create: `components/SearchBox.tsx`
- Modify: `app/schools/page.tsx`

- [ ] **Step 1: 创建 SearchBox**

Create `components/SearchBox.tsx`:

```tsx
"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import { School } from '@/types/school';
import { formatMessage, Messages } from '@/lib/i18n';
import { hasLegacyScore } from '@/utils/schoolFilters';
import { searchSchools } from '@/lib/searchSchools';

interface SearchBoxProps {
  allSchools: School[];
  dictionary: Messages;
  onPickSchool: (s: School) => void;
  onPickPlace: (schools: School[]) => void;
}

export default function SearchBox({ allSchools, dictionary, onPickSchool, onPickPlace }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(
    () => (debounced.trim().length >= 2 ? searchSchools(debounced, allSchools) : []),
    [debounced, allSchools]
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const schoolResults = results.filter(r => r.type === 'school');
  const placeResults = results.filter(r => r.type === 'place');

  function pickSchool(s: School) { setQuery(s.school_name); setOpen(false); onPickSchool(s); }
  function pickPlace(schools: School[], label: string) { setQuery(label); setOpen(false); onPickPlace(schools); }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md">
        <span className="text-gray-400 text-sm">🔍</span>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={dictionary.search.placeholder}
          className="flex-1 text-sm bg-transparent focus:outline-none text-gray-800"
        />
        {query && (
          <button onClick={() => { setQuery(''); setDebounced(''); }} className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
        )}
      </div>

      {open && debounced.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-80 overflow-y-auto z-50">
          {results.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400">{dictionary.search.noResults}</div>
          )}
          {schoolResults.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-bold">{dictionary.search.schoolsGroup}</div>
          )}
          {schoolResults.map(r => r.type === 'school' && (
            <button key={r.school.id} onClick={() => pickSchool(r.school)}
              className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 border-t border-gray-50">
              <span className="w-5 h-5 rounded bg-green-100 flex items-center justify-center text-[10px] shrink-0">🏫</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-gray-800 truncate">{r.school.school_name}</span>
                <span className="block text-[10px] text-gray-400 truncate">{r.school.suburb}, {r.school.state}</span>
              </span>
              {hasLegacyScore(r.school)
                ? <span className="text-[10px] font-bold text-white bg-indigo-600 rounded-full px-2 py-0.5 shrink-0">{r.school.legacy_score}</span>
                : <span className="text-[10px] text-gray-400 shrink-0">profile</span>}
            </button>
          ))}
          {placeResults.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-bold">{dictionary.search.placesGroup}</div>
          )}
          {placeResults.map((r, i) => r.type === 'place' && (
            <button key={`p${i}`} onClick={() => pickPlace(r.schools, r.label)}
              className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-indigo-50 border-t border-gray-50">
              <span className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center text-[10px] shrink-0">📍</span>
              <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{r.label}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{formatMessage(dictionary.search.placeCount, { count: r.schools.length })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: page 加搜索状态与处理器**

Modify `app/schools/page.tsx`,在组件内加:

```tsx
const [placeFocus, setPlaceFocus] = useState<School[] | null>(null);

const handlePickSchool = useCallback((s: School) => {
  setPlaceFocus(null);
  setSelectedSchool(s);
}, []);

const handlePickPlace = useCallback((schools: School[]) => {
  setSelectedSchool(null);
  setPlaceFocus(schools);
}, []);
```

(`flyToSchool` 已会因 `selectedSchool` 改变而飞过去;`placeFocus` 在 Task 9 接到地图 `fitToSchools`。)

- [ ] **Step 3: 桌面布局放入 SearchBox**

在第 180-259 行顶部控制区,把 SearchBox 作为筛选条左侧第一项渲染(桌面)。例如在 `pointer-events-auto` 容器内、FilterBar 之前插入:

```tsx
<div className="pointer-events-auto w-64">
  <SearchBox allSchools={allSchools} dictionary={dictionary}
    onPickSchool={handlePickSchool} onPickPlace={handlePickPlace} />
</div>
```

顶部加 `import SearchBox from '../../components/SearchBox';`。

- [ ] **Step 4: 验证 + QA**

Run: `npm run build && npm test`
Expected: 成功。浏览器:输入「glen」出现分组下拉,点学校地图飞过去并打开详情。

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto http://localhost:3000/schools
$B js "var i=document.querySelector('input'); i.value='glen'; i.dispatchEvent(new Event('input',{bubbles:true})); 'typed'"
$B screenshot /tmp/search-check.png
```

- [ ] **Step 5: 提交**

```bash
git add components/SearchBox.tsx app/schools/page.tsx
git commit -m "feat: add SearchBox with grouped results (desktop)"
```

---

## Task 9: 地图 `fitToSchools` + 修 marker key

**Files:**
- Modify: `components/SchoolMap.tsx`
- Modify: `app/schools/page.tsx`

- [ ] **Step 1: 加 FitToSchools 子组件 + prop**

Modify `components/SchoolMap.tsx`:在其它 tracker 子组件旁加:

```tsx
function FitToSchools({ schools }: { schools: School[] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!schools || schools.length === 0) return;
    const pts = schools.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng] as [number, number]);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }, [schools]);
  return null;
}
```

在 `SchoolMapProps` 接口加 `fitToSchools?: School[] | null;`,在 `export default function SchoolMap({...})` 解构里加 `fitToSchools`,并在 `<MapContainer>` 内渲染 `<FitToSchools schools={fitToSchools ?? null} />`。

- [ ] **Step 2: 修 marker key 用 id**

Modify `components/SchoolMap.tsx`:
- 第 330 行 filter 比较 `` `${s.school_name}-${s.postcode}` !== `${selectedSchool.school_name}-${selectedSchool.postcode}` `` 改为 `s.id !== selectedSchool.id`。
- 第 335 行 `key={`${school.school_name}-${school.postcode}`}` 改为 `key={school.id}`。

- [ ] **Step 3: page 把 placeFocus 接到地图**

Modify `app/schools/page.tsx`:给 `<SchoolMap .../>` 传 `fitToSchools={placeFocus}`。

- [ ] **Step 4: 验证 + QA**

Run: `npm run build`
Expected: 成功。浏览器:搜一个区(如「Glenelg」)点 place 结果,地图缩放框住该区学校。

- [ ] **Step 5: 提交**

```bash
git add components/SchoolMap.tsx app/schools/page.tsx
git commit -m "feat: fit map to place search results; fix marker key to school.id"
```

---

## Task 10: `BottomSheet` 组件

**Files:**
- Create: `components/BottomSheet.tsx`

- [ ] **Step 1: 实现 BottomSheet**

Create `components/BottomSheet.tsx`:

```tsx
"use client";

import { ReactNode } from 'react';

export type SheetSnap = 'peek' | 'expanded';

interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  children: ReactNode;
}

export default function BottomSheet({ snap, onSnapChange, children }: BottomSheetProps) {
  const height = snap === 'expanded' ? '75vh' : '128px';
  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.18)] flex flex-col transition-[height] duration-300 ease-out"
      style={{ height }}
    >
      <button
        onClick={() => onSnapChange(snap === 'peek' ? 'expanded' : 'peek')}
        className="shrink-0 py-2 flex items-center justify-center cursor-pointer"
        aria-label="toggle sheet"
      >
        <span className="w-9 h-1 rounded-full bg-gray-300" />
      </button>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add components/BottomSheet.tsx
git commit -m "feat: add BottomSheet component"
```

---

## Task 11: page.tsx 响应式整合(桌面/移动布局切换)

**Files:**
- Modify: `app/schools/page.tsx`

- [ ] **Step 1: 引入断点与抽屉状态**

在 `app/schools/page.tsx` 顶部加 import:

```tsx
import { useMediaQuery } from '@/lib/useMediaQuery';
import BottomSheet, { SheetSnap } from '../../components/BottomSheet';
```

组件内加:

```tsx
const isMobile = useMediaQuery('(max-width: 768px)');
const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');

// 选中学校时,移动端把抽屉升起以显示详情。
useEffect(() => {
  if (isMobile && selectedSchool) setSheetSnap('expanded');
}, [isMobile, selectedSchool]);
```

- [ ] **Step 2: 用 isMobile 分支渲染**

把 `return (...)` 内的布局改为:地图层不变;其上根据 `isMobile` 切换控制层。桌面分支 = 现有顶部筛选条(含 SearchBox)+ 左侧 SchoolList 折叠面板 + 右侧 SchoolDetail。移动分支结构:

```tsx
{isMobile ? (
  <>
    {/* 顶部:搜索 + 横滑筛选 */}
    <div className="absolute top-2 left-2 right-2 z-30 space-y-2 pointer-events-none">
      <div className="pointer-events-auto">
        <SearchBox allSchools={allSchools} dictionary={dictionary}
          onPickSchool={handlePickSchool} onPickPlace={handlePickPlace} />
      </div>
      <div className="pointer-events-auto bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow">
        <FilterBar filters={filters} onChange={setFilters} dictionary={dictionary} variant="scroll" />
      </div>
    </div>

    {/* 底部抽屉:详情优先,否则列表 */}
    <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
      {selectedSchool ? (
        <SchoolDetail school={selectedSchool} dictionary={dictionary}
          onClose={handleMapClick} variant="sheet" />
      ) : (
        <SchoolList
          schools={displayedSchools} selectedSchool={selectedSchool}
          sortBy={sortBy} onSortChange={setSortBy} onSchoolClick={handleSchoolClick}
          areaSummary={areaSummary} areaLabel={areaLabel} loading={loading}
          geoReady={geoReady} dictionary={dictionary} selectedCardRef={selectedCardRef} />
      )}
    </BottomSheet>
  </>
) : (
  <>
    {/* === 现有桌面布局:顶部筛选条 + 左侧列表面板 + 右侧详情 === */}
  </>
)}
```

> 桌面分支即把 Task 5-9 已改好的现有 JSX(顶部控制区、左侧折叠 SchoolList、右侧 SchoolDetail)整体包进 `: ( ... )`。图例 [page 534-555 行] 仅在桌面分支渲染(移动端先收起)。

- [ ] **Step 3: 验证构建 + 测试 + lint**

Run: `npm run build && npm test && npm run lint`
Expected: 全部成功。

- [ ] **Step 4: 提交**

```bash
git add app/schools/page.tsx
git commit -m "feat: responsive desktop/mobile layout with bottom sheet"
```

---

## Task 12: 端到端浏览器 QA

**Files:** 无(仅验证)

- [ ] **Step 1: 桌面 QA**

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B viewport 1440x900
$B goto http://localhost:3000/schools
$B wait --networkidle
$B js "var i=document.querySelector('input'); i.value='melbourne'; i.dispatchEvent(new Event('input',{bubbles:true})); 'typed'"
$B screenshot /tmp/qa-desktop-search.png
```
确认:下拉分组结果、点学校飞行+详情、点 place 框选区域、五组筛选、列表排序均正常。用 Read 看截图。

- [ ] **Step 2: 移动 QA**

```bash
$B viewport 390x844
$B goto http://localhost:3000/schools
$B wait --networkidle
$B screenshot /tmp/qa-mobile-peek.png
$B js "document.querySelector('[aria-label=\"toggle sheet\"]').click(); 'toggled'"
$B screenshot /tmp/qa-mobile-expanded.png
```
确认:搜索框顶部通栏、筛选条横滑不裁切、抽屉 peek/expanded 切换、点学校出详情、返回回列表。用 Read 看截图。

- [ ] **Step 3: 控制台无错误**

```bash
$B console --errors
```
Expected: 无 error。

- [ ] **Step 4: 收尾提交(若 QA 中有微调)**

```bash
git add -A
git commit -m "test: e2e QA pass for search and mobile" || echo "no changes"
```

---

## 自查覆盖

- Spec §5 搜索 → Task 2(逻辑)+ Task 8(UI)+ Task 9(place→地图)
- Spec §6 移动端 → Task 4(断点)+ Task 7(筛选横滑)+ Task 10(抽屉)+ Task 11(整合)
- Spec §4 架构拆分 → Task 5/6/7(抽组件)+ Task 11(容器)
- Spec §7 marker key bug → Task 9 Step 2
- Spec §8 i18n → Task 3
- Spec §9 测试 → Task 1(vitest)+ Task 2(单测)+ Task 12(QA)
