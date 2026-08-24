import { describe, expect, it } from 'vitest';
import { projectCoordinates, readZoneAttributes } from './parse-tas-catchment.mjs';

describe('readZoneAttributes', () => {
  it('reads the truncated shapefile field names without inventing year levels', () => {
    expect(readZoneAttributes({
      SCHOOL_NAM: 'Cygnet Primary School',
      SCHOOL_SEC: 'Primary',
      SCHOOL_NUM: '057',
      ASSOCIATE_: 'Huonville High School',
    })).toEqual({
      source_name: 'Cygnet Primary School',
      source_sector: 'Primary',
      source_school_code: '057',
      associate_feeder: 'Huonville High School',
    });
  });

  it('rejects blank school identity fields', () => {
    expect(() => readZoneAttributes({ SCHOOL_NAM: '', SCHOOL_SEC: 'Primary' }))
      .toThrow(/school name or sector/i);
  });
});

describe('projectCoordinates', () => {
  it('projects EPSG:28355 coordinates to WGS84', () => {
    const [lng, lat] = projectCoordinates([525000, 5240000]);
    expect(lng).toBeCloseTo(147.3, 0);
    expect(lat).toBeCloseTo(-43, 0);
  });
});
