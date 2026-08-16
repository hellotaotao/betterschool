import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getCatchmentZoneSections, getSchoolSlug, getSchoolsWithCatchments } from '@/lib/schoolsData';
import { stateSlug } from '@/lib/slug';
import CatchmentPage from './page';

describe('CatchmentPage', () => {
  it('explains a published zone that contains no other geocoded schools', async () => {
    const school = getSchoolsWithCatchments().find(candidate => (
      getCatchmentZoneSections(candidate).some(section => section.inside.length === 0)
    ));
    expect(school).toBeDefined();
    if (!school) throw new Error('Empty catchment zone fixture is missing');

    const markup = renderToStaticMarkup(await CatchmentPage({
      params: Promise.resolve({ state: stateSlug(school.state), slug: getSchoolSlug(school) }),
    }));

    expect(markup).toContain('No other geocoded schools were found inside this published boundary.');
    expect(markup).not.toContain('<ul class="mt-3 grid gap-2 sm:grid-cols-2"></ul>');
  });
});
