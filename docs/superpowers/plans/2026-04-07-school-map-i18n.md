# School Map I18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight browser-language i18n to the school map UI with English as the default locale.

**Architecture:** Keep the current `/schools` page as a client component, move UI strings into locale JSON resources, and detect the preferred browser language after mount. Use a small helper module for locale selection, string formatting, and repeated label translation.

**Tech Stack:** Next.js App Router, React, TypeScript, JSON locale resources

---

### Task 1: Add locale resources and helper functions

**Files:**
- Create: `messages/en.json`
- Create: `messages/zh.json`
- Create: `lib/i18n.ts`

- [ ] **Step 1: Add English and Chinese message catalogs**

```json
{
  "loadingMap": "Loading map..."
}
```

```json
{
  "loadingMap": "加载地图中..."
}
```

- [ ] **Step 2: Add locale helper functions**

```ts
export type Locale = 'en' | 'zh';

export function detectBrowserLocale(languages: readonly string[] = []): Locale {
  return languages.some((language) => language.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
}
```

- [ ] **Step 3: Verify helper shape with TypeScript-aware build**

Run: `npm run build`  
Expected: build reaches application compilation without type errors from `lib/i18n.ts`

### Task 2: Connect the schools page to translated UI copy

**Files:**
- Modify: `app/schools/page.tsx`

- [ ] **Step 1: Add locale state with English default**

```ts
const [locale, setLocale] = useState<Locale>('en');
const dictionary = useMemo(() => getMessages(locale), [locale]);
```

- [ ] **Step 2: Detect browser language after mount**

```ts
useEffect(() => {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  setLocale(detectBrowserLocale(languages.filter(Boolean)));
}, []);
```

- [ ] **Step 3: Replace hard-coded page strings with dictionary values**

```tsx
<option value="rank">{dictionary.sidebar.sortByRank}</option>
<option value="score">{dictionary.sidebar.sortByScore}</option>
```

- [ ] **Step 4: Verify the page compiles**

Run: `npm run build`  
Expected: build succeeds with translated UI lookups wired through the page

### Task 3: Remove non-English code comments and verify repository rules

**Files:**
- Modify: `components/SchoolMap.tsx`
- Modify: `utils/schoolFilters.ts`

- [ ] **Step 1: Replace or remove non-English comments**

```ts
// Recompute visible schools after geolocation is ready.
```

- [ ] **Step 2: Scan code files for Han characters**

Run: `rg -n "[\\p{Han}]" app components utils lib --glob '!**/*.json'`  
Expected: no matches

- [ ] **Step 3: Run lint-equivalent validation**

Run: `npx eslint app/schools/page.tsx components/SchoolMap.tsx utils/schoolFilters.ts lib/i18n.ts`  
Expected: no ESLint errors
