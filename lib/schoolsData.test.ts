import { describe, expect, it } from 'vitest';
import * as schoolsData from './schoolsData';

describe('getCatchmentZoneSections', () => {
  it('keeps Alexandria Park Community School primary and secondary zones separate', () => {
    const school = schoolsData.getSchoolsDataset().schools.find(
      candidate => candidate.id === 'acara-41184-46425-6425',
    );
    expect(school).toBeDefined();
    if (!school) throw new Error('Alexandria Park Community School fixture is missing');

    const sections = schoolsData.getCatchmentZoneSections(school);

    expect(sections.map(section => section.catchment.kind)).toEqual(['primary', 'secondary']);
    expect(sections.map(section => section.feature.properties.kind)).toEqual(['primary', 'secondary']);
    expect(sections.every(section => section.catchment.kind === section.feature.properties.kind)).toBe(true);
  });
});

describe('getSchoolsInZone', () => {
  it('returns all 44 schools in the 56110 secondary zone unless a limit is explicit', () => {
    const feature = schoolsData.readCatchmentFeature({ location_age_id: 56110, kind: 'secondary' });
    expect(feature).not.toBeNull();
    if (!feature) throw new Error('56110 secondary catchment fixture is missing');

    const allSchools = schoolsData.getSchoolsInZone(feature);
    const names = allSchools.map(entry => entry.school.school_name);

    expect(allSchools).toHaveLength(44);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const limited = schoolsData.getSchoolsInZone(feature, 10);
    expect(limited).toHaveLength(10);
    expect(limited.map(entry => entry.school.school_name)).toEqual(names.slice(0, 10));
  });
});
