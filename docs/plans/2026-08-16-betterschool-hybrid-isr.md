# BetterSchool Hybrid ISR Implementation Plan

**Goal:** Replace full build-time enumeration of BetterSchool's three long-tail SEO route families with first-request static generation and deployment-lifetime caching, then prove the result on Vercel before pushing `main`.

**Architecture:** Keep the home, schools explorer, robots, and sitemap build-time routes unchanged. The school, suburb, and catchment page modules each return no build-time params, accept valid runtime params, and cache the generated static result indefinitely until a new deployment. Existing lookup and `notFound()` behavior remains responsible for invalid URLs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Vercel ISR, Vercel CLI.

---

### Task 1: Enforce a single on-demand ISR policy for all long-tail SEO routes

**Files:**
- Create: `app/seo-isr-policy.test.ts`
- Modify: `app/school/[state]/[slug]/page.tsx`
- Modify: `app/suburb/[state]/[slug]/page.tsx`
- Modify: `app/catchment/[state]/[slug]/page.tsx`

- [ ] **Step 1: Write the failing policy test**

Create `app/seo-isr-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as SchoolRoute from './school/[state]/[slug]/page';
import * as SuburbRoute from './suburb/[state]/[slug]/page';
import * as CatchmentRoute from './catchment/[state]/[slug]/page';

interface SeoRouteModule {
  dynamicParams: boolean;
  generateStaticParams: () => unknown[];
  revalidate?: boolean;
}

describe('SEO route ISR policy', () => {
  it.each([
    ['school', SchoolRoute],
    ['suburb', SuburbRoute],
    ['catchment', CatchmentRoute],
  ])('%s pages generate on first request and remain cached', (_name, routeModule) => {
    const route = routeModule as SeoRouteModule;
    expect(route.dynamicParams).toBe(true);
    expect(route.revalidate).toBe(false);
    expect(route.generateStaticParams()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run app/seo-isr-policy.test.ts
```

Expected: FAIL because the page modules do not yet export the shared `revalidate = false` policy, school returns all params by default, and suburb/catchment use `dynamicParams = false` with full parameter lists.

- [ ] **Step 3: Apply the minimal route changes**

In each of the three page modules, use the same route policy:

```ts
export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams(): RouteParams[] {
  return [];
}
```

For the school page, remove `PRERENDER_ALL_SCHOOLS`, its environment-switch comment, and imports used only by the old enumeration (`getSchoolsDataset` remains if the page body uses it; remove only truly unused imports). For suburb and catchment, remove imports used only by their old `generateStaticParams()` implementations.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run app/seo-isr-policy.test.ts
```

Expected: 3 policy cases PASS.

- [ ] **Step 5: Run implementation validation**

Run:

```bash
npm test
npx eslint app/seo-isr-policy.test.ts 'app/school/[state]/[slug]/page.tsx' 'app/suburb/[state]/[slug]/page.tsx' 'app/catchment/[state]/[slug]/page.tsx'
npx tsc --noEmit
git diff --check
```

Expected: all tests pass, changed-file ESLint has zero errors, TypeScript exits 0, and `git diff --check` is clean.

- [ ] **Step 6: Commit the implementation**

```bash
git add app/seo-isr-policy.test.ts \
  'app/school/[state]/[slug]/page.tsx' \
  'app/suburb/[state]/[slug]/page.tsx' \
  'app/catchment/[state]/[slug]/page.tsx'
git commit -m "fix: generate SEO pages on demand"
```

### Task 2: Prove local build size, routing, and ISR behavior

**Files:**
- No source changes expected.

- [ ] **Step 1: Create a fresh production build**

Run:

```bash
npm run build
```

Expected: build exits 0; the route table keeps school/suburb/catchment as static-generation-capable dynamic routes without enumerating 17,862 long-tail pages.

- [ ] **Step 2: Measure the artifact**

Run:

```bash
du -sh .next
find .next -type f | wc -l
```

Expected: both size and file count are materially below the previous approximately 1.8 GB and 101,000-file artifact.

- [ ] **Step 3: Start the production server with cache diagnostics**

Run:

```bash
NEXT_PRIVATE_DEBUG_CACHE=1 npm start
```

Expected: server starts on localhost without runtime errors.

- [ ] **Step 4: Smoke valid and invalid routes**

Request these paths and record status plus cache headers:

```text
/schools
/robots.txt
/sitemap.xml
/school/act/north-ainslie-primary-school-ainslie
/suburb/act/ainslie
/catchment/nsw/abbotsford-public-school-abbotsford
/catchment/nsw/alexandria-park-community-school-alexandria
/school/act/not-a-real-school
```

Expected: all representative valid paths return 200; the bogus school returns 404; the multi-zone page includes primary and secondary sections.

- [ ] **Step 5: Verify runtime caching**

Request the same valid dynamic URL twice and inspect `x-nextjs-cache` plus server cache logs.

Expected: the first request generates the page and a subsequent request is served from the generated cache. If local headers do not expose HIT/MISS, use the debug cache log as evidence and repeat the header check on Vercel Preview.

### Task 3: Validate Preview, integrate, push, and verify production

**Files:**
- No source changes expected unless Preview exposes a reproducible bug; any bug fix starts a new RED/GREEN loop.

- [ ] **Step 1: Deploy a protected Vercel Preview**

Run:

```bash
vercel deploy --yes --project betterschool --archive=tgz --logs
```

Expected: deployment reaches `READY` substantially faster and no longer fails while deploying tens of thousands of output files.

- [ ] **Step 2: Smoke Preview routes**

Use `vercel curl` or an authenticated request against the Preview for the same valid and invalid route set from Task 2.

Expected: valid paths return 200, invalid path returns 404, `robots.txt` and `sitemap.xml` return 200, and a repeated dynamic request shows cache behavior consistent with ISR.

- [ ] **Step 3: Run the final local verification gate**

Run:

```bash
npm test
npx eslint app/seo-isr-policy.test.ts 'app/school/[state]/[slug]/page.tsx' 'app/suburb/[state]/[slug]/page.tsx' 'app/catchment/[state]/[slug]/page.tsx'
npx tsc --noEmit
git diff --check 482bd6d..HEAD
git status --short --branch
```

Expected: all checks pass and the release worktree is clean.

- [ ] **Step 4: Confirm the remote base has not moved**

Run:

```bash
git ls-remote origin refs/heads/main
```

Expected: `origin/main` is still `e9c92f3c2afacc4c6efcdd17f4a2145782005f15` unless a deliberate new remote commit is reviewed first.

- [ ] **Step 5: Fast-forward local main and push**

From `/Users/tao/code/OpenClaw-Code/BetterSchool.au`:

```bash
git merge --ff-only agent/betterschool-release-hardening
git push origin main
```

Expected: main advances without touching the existing untracked Playwright artifacts, screenshots, or old plan file; push succeeds without force.

- [ ] **Step 6: Verify production**

Poll `https://www.betterschool.au` until the new Vercel deployment is ready, then verify `/schools`, `/robots.txt`, `/sitemap.xml`, and representative school/suburb/catchment URLs return 200. Repeat one dynamic URL and inspect Vercel cache headers.

Expected: production is healthy, SEO discovery endpoints no longer return 404, and `origin/main` equals the release head.
