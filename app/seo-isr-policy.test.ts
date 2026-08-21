import { describe, expect, it } from 'vitest';
import * as enCatchment from './catchment/[state]/[slug]/page';
import * as enSchool from './school/[state]/[slug]/page';
import * as enSuburb from './suburb/[state]/[slug]/page';
import * as zhCatchment from './zh/catchment/[state]/[slug]/page';
import * as zhSchool from './zh/school/[state]/[slug]/page';
import * as zhSuburb from './zh/suburb/[state]/[slug]/page';
import * as enStateIndex from './suburb/[state]/page';
import * as zhStateIndex from './zh/suburb/[state]/page';

describe('SEO route ISR policy', () => {
  it.each([
    ['school (en)', enSchool],
    ['school (zh)', zhSchool],
    ['suburb (en)', enSuburb],
    ['suburb (zh)', zhSuburb],
    ['catchment (en)', enCatchment],
    ['catchment (zh)', zhCatchment],
  ])('%s pages are generated on demand and cached for the deployment', (_name, page) => {
    expect(page.dynamicParams).toBe(true);
    expect(page.revalidate).toBe(false);
    expect(page.generateStaticParams()).toEqual([]);
  });

  // The indexes are the front door, so they are prerendered in both locales —
  // a crawler or a reader must never wait on a cold render to find anything.
  it.each([
    ['state index (en)', enStateIndex],
    ['state index (zh)', zhStateIndex],
  ])('%s is prerendered for every state', (_name, page) => {
    expect(page.dynamicParams).toBe(false);
    expect(page.generateStaticParams().length).toBe(8);
  });
});
