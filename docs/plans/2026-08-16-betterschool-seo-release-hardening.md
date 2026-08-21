# BetterSchool SEO Release Hardening Implementation Plan

**Goal:** 修正 BetterSchool SEO 页面的 catchment 与学校网址正确性问题，并在推送生产前通过 Vercel Preview 验证完整静态产物。

**Architecture:** 保留现有 Next.js App Router 与完整预渲染策略。把 URL 校验和 zone 数据整理下沉为纯/可测试 helper，页面只渲染已经验证的数据；发布门禁由本地测试、build、smoke、独立审查和 Vercel Preview 组成。

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, ESLint, Vercel CLI

---

### Task 1: 过滤无效学校官网 URL

**Files:**
- Create: `lib/schoolUrl.ts`
- Create: `lib/schoolUrl.test.ts`
- Modify: `app/school/[state]/[slug]/page.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { safeSchoolWebsiteUrl } from './schoolUrl';

describe('safeSchoolWebsiteUrl', () => {
  it('accepts absolute http and https school URLs with a hostname', () => {
    expect(safeSchoolWebsiteUrl('https://school.example.edu.au/path')).toBe('https://school.example.edu.au/path');
    expect(safeSchoolWebsiteUrl('http://school.example.edu.au')).toBe('http://school.example.edu.au/');
  });

  it('rejects incomplete and unsafe URLs', () => {
    expect(safeSchoolWebsiteUrl('http://')).toBeUndefined();
    expect(safeSchoolWebsiteUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeSchoolWebsiteUrl('')).toBeUndefined();
    expect(safeSchoolWebsiteUrl(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- lib/schoolUrl.test.ts`

Expected: FAIL because `./schoolUrl` does not exist.

- [ ] **Step 3: Implement the minimal URL helper**

```ts
export function safeSchoolWebsiteUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
```

In the school page, calculate `const schoolWebsiteUrl = safeSchoolWebsiteUrl(school.school_url)` once and use only that value for JSON-LD `sameAs` and the external school link.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test -- lib/schoolUrl.test.ts && npm test`

Expected: URL tests pass and the complete suite has zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/schoolUrl.ts lib/schoolUrl.test.ts 'app/school/[state]/[slug]/page.tsx'
git commit -m "fix: filter invalid school website URLs"
```

### Task 2: 分别计算每个 zone，并取消隐式 40 条截断

**Files:**
- Create: `lib/schoolsData.test.ts`
- Modify: `lib/schoolsData.ts`
- Modify: `app/catchment/[state]/[slug]/page.tsx`

- [ ] **Step 1: Write failing full-data tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  getCatchmentZoneSections,
  getSchoolBySlug,
  getSchoolSlug,
  getSchoolsDataset,
  getSchoolsInZone,
  readCatchmentFeature,
} from './schoolsData';

describe('catchment SEO data', () => {
  it('builds one section for every zone attached to a multi-zone school', () => {
    const school = getSchoolsDataset().schools.find(entry => entry.id === 'acara-41184-46425-6425');
    expect(school).toBeDefined();
    const slug = getSchoolSlug(school!);
    expect(getSchoolBySlug('nsw', slug)).toBe(school);

    const sections = getCatchmentZoneSections(school!);
    expect(sections.map(section => section.catchment.kind)).toEqual(['primary', 'secondary']);
    expect(sections.every(section => section.feature.properties.kind === section.catchment.kind)).toBe(true);
  });

  it('returns the complete sorted school list unless a limit is explicit', () => {
    const feature = readCatchmentFeature({ location_age_id: 56110, kind: 'secondary' });
    expect(feature).not.toBeNull();
    const all = getSchoolsInZone(feature!);
    expect(all).toHaveLength(44);
    expect(all.map(entry => entry.school.school_name)).toEqual(
      [...all.map(entry => entry.school.school_name)].sort((a, b) => a.localeCompare(b)),
    );
    expect(getSchoolsInZone(feature!, 10)).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- lib/schoolsData.test.ts`

Expected: FAIL because `getCatchmentZoneSections` does not exist and the current default list length is 40.

- [ ] **Step 3: Implement per-zone data and post-sort limiting**

Add a `CatchmentZoneSection` interface and `getCatchmentZoneSections(school)` that maps every catchment to its matching geometry, full `inside` list, and `suburbs`, filtering only missing geometry. Change `getSchoolsInZone(feature, limit?: number)` to collect all matches, sort them, then return `sorted.slice(0, limit)` only when a finite limit is explicitly provided.

- [ ] **Step 4: Render one labelled section per zone**

Replace the page-level `zones[0]` calculation with `getCatchmentZoneSections(school)`. Render a separate section for each result, with heading `Other schools inside the {kind} zone`; keep the existing explanatory copy and suburb sample inside its matching section.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- lib/schoolsData.test.ts && npm test`

Expected: full-data tests and complete suite pass with zero failures.

- [ ] **Step 6: Commit Task 2**

```bash
git add lib/schoolsData.ts lib/schoolsData.test.ts 'app/catchment/[state]/[slug]/page.tsx'
git commit -m "fix: render complete per-zone catchment data"
```

### Task 3: 发布验证与推送

**Files:**
- Modify only if review finds a blocker in Task 1 or 2.

- [ ] **Step 1: Run local gates**

Run:

```bash
npm test
npx eslint 'app/catchment/[state]/[slug]/page.tsx' 'app/school/[state]/[slug]/page.tsx' lib/schoolsData.ts lib/schoolsData.test.ts lib/schoolUrl.ts lib/schoolUrl.test.ts
CI=1 NEXT_TELEMETRY_DISABLED=1 npm run build
git diff --check 482bd6d..HEAD
```

Expected: tests, changed-file lint, build and diff check exit 0. Repository-wide lint remains separately blocked only by the nine pre-existing CommonJS script errors.

- [ ] **Step 2: Run local route smoke**

Start `npm start -- -p 3217`, then require HTTP 200 from `/schools`, `/robots.txt`, `/sitemap.xml`, a representative school page, suburb page, single-zone catchment page, and multi-zone catchment page. Stop the server after the checks.

- [ ] **Step 3: Request independent release review**

Review `482bd6d..HEAD` for spec compliance first, then code quality. Fix and re-review any blocker or important issue. Do not start a second hardening loop after one clean review round.

- [ ] **Step 4: Deploy Vercel Preview**

Run `vercel deploy` from the worktree without `--prod`. Require a successful deployment URL, then smoke the same representative routes on that URL. If Vercel rejects the build/artifact, stop and return to the on-demand-generation design choice; do not push production.

- [ ] **Step 5: Integrate and push production**

Verify remote `main` still points to `e9c92f3`. Fast-forward the primary worktree `main` to the reviewed branch, then run `git push origin main`. Monitor Vercel production until `robots.txt`, `sitemap.xml`, and representative dynamic routes return 200.
