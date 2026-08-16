import { describe, expect, it } from 'vitest';
import * as catchmentPage from './catchment/[state]/[slug]/page';
import * as schoolPage from './school/[state]/[slug]/page';
import * as suburbPage from './suburb/[state]/[slug]/page';

describe('SEO route ISR policy', () => {
  it.each([
    ['school', schoolPage],
    ['suburb', suburbPage],
    ['catchment', catchmentPage],
  ])('%s pages are generated on demand and cached for the deployment', (_name, page) => {
    expect(page.dynamicParams).toBe(true);
    expect(page.revalidate).toBe(false);
    expect(page.generateStaticParams()).toEqual([]);
  });
});
