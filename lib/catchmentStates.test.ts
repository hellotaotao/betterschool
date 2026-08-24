import { describe, expect, it } from 'vitest';
import { catchmentStateCodes, catchmentStateInfo } from './catchmentStates';
import * as catchmentStates from './catchmentStates';
import { CATCHMENT_STATES } from './catchmentLookup';

describe('catchmentStateInfo', () => {
  it('knows the states with a published layer', () => {
    expect(catchmentStateInfo('NSW')).not.toBeNull();
    expect(catchmentStateInfo('SA')).not.toBeNull();
    expect(catchmentStateInfo('VIC')).not.toBeNull();
  });

  it('returns null for a state whose zones are not collected', () => {
    expect(catchmentStateInfo('QLD')).toBeNull();
  });

  it('accepts either case, because callers pass ACARA codes and URL slugs', () => {
    expect(catchmentStateInfo('nsw')?.state).toBe('NSW');
    expect(catchmentStateInfo('sa')?.state).toBe('SA');
    expect(catchmentStateInfo('vic')?.state).toBe('VIC');
  });

  /**
   * The distinction the pages hang their copy on. NSW zones 2,029 of 2,223
   * government schools, so silence there means "none published for this
   * school". SA zones 124 of 521 and does not publish the rule, so the same
   * silence says almost nothing — and a page that phrased it the NSW way would
   * invite a reader to conclude the school is unzoned.
   */
  it('separates a state that zones its whole system from one that zones part', () => {
    expect(catchmentStateInfo('NSW')?.complete).toBe(true);
    expect(catchmentStateInfo('SA')?.complete).toBe(false);
    expect(catchmentStateInfo('VIC')?.complete).toBe(true);
  });

  it('sends each state at its own department, never another state\'s', () => {
    expect(catchmentStateInfo('NSW')?.finderUrl).toContain('education.nsw.gov.au');
    expect(catchmentStateInfo('SA')?.finderUrl).toBe(
      'https://www.education.sa.gov.au/parents-and-families/enrol-school-or-preschool/find-a-school-zone-or-preschool-catchment-area',
    );
    expect(catchmentStateInfo('VIC')?.finderUrl).toBe('https://www.findmyschool.vic.gov.au/');
  });
});

describe('catchmentStateCodes', () => {
  it('covers exactly the states the loaders fetch', () => {
    expect(catchmentStateCodes()).toEqual(CATCHMENT_STATES.map(slug => slug.toUpperCase()));
  });

  // A state in CATCHMENT_STATES without an entry here would render a zone with
  // no address checker and no way to say what an absent zone means.
  it('has an info entry for every state the loaders fetch', () => {
    for (const slug of CATCHMENT_STATES) {
      expect(catchmentStateInfo(slug), `no CatchmentStateInfo for ${slug}`).not.toBeNull();
    }
  });
});

describe('catchmentAbsenceKind', () => {
  it('keeps partial coverage distinct from none published and not collected', () => {
    const absenceKind = (catchmentStates as Record<string, unknown>).catchmentAbsenceKind;
    expect(absenceKind).toBeTypeOf('function');
    if (typeof absenceKind !== 'function') return;

    expect(absenceKind('SA', 'Government')).toBe('partial-state');
    expect(absenceKind('NSW', 'Government')).toBe('not-published');
    expect(absenceKind('VIC', 'Government')).toBe('not-published');
    expect(absenceKind('QLD', 'Government')).toBe('not-collected');
    expect(absenceKind('SA', 'Catholic')).toBe('non-government');
  });
});
