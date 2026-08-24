import { describe, expect, it } from 'vitest';
import * as parser from './parse-sa-catchment.mjs';

describe('readZoneAttributes', () => {
  it('reads 2023 uppercase and 2025 lowercase attributes identically', () => {
    expect(parser.readZoneAttributes).toBeTypeOf('function');
    if (typeof parser.readZoneAttributes !== 'function') return;

    const lower = parser.readZoneAttributes({ org_num: 475, school: 'Westbourne Park Primary School', type: 'PRIM' });
    const upper = parser.readZoneAttributes({ ORG_NUM: 475, SCHOOL: 'Westbourne Park Primary School', TYPE: 'PRIM' });
    expect(upper).toEqual(lower);
  });

  it('rejects a record whose key attributes are blank', () => {
    expect(parser.readZoneAttributes).toBeTypeOf('function');
    if (typeof parser.readZoneAttributes !== 'function') return;

    expect(() => parser.readZoneAttributes({ ORG_NUM: '', SCHOOL: '', TYPE: 'PRIM' }))
      .toThrow(/org_num or school name/i);
  });
});
