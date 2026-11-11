import { describe, expect, it } from 'vitest';
import { experimentGroup, linkEvent, pageKind } from './analyticsEvents';

describe('pageKind', () => {
  it('names each page family in either language', () => {
    expect(pageKind('/schools')).toBe('map');
    expect(pageKind('/school/vic/box-hill-high-school-box-hill')).toBe('school');
    expect(pageKind('/zh/school/vic/box-hill-high-school-box-hill')).toBe('school');
    expect(pageKind('/suburb/vic')).toBe('state');
    expect(pageKind('/zh/suburb/vic/box-hill')).toBe('suburb');
    expect(pageKind('/catchment/nsw/x')).toBe('catchment');
    expect(pageKind('/ranking/vic/vce')).toBe('ranking');
    expect(pageKind('/zh/browse')).toBe('browse');
    expect(pageKind('/zhuhai')).toBe('other');
    expect(pageKind('/')).toBe('other');
  });
});

describe('linkEvent', () => {
  it('records a reading page sending the reader to the map', () => {
    expect(linkEvent('/school/vic/a', '/schools')).toEqual({ name: 'map_open', data: { from: 'school', to: 'map' } });
  });

  it('records the map sending the reader to a profile or zone page', () => {
    expect(linkEvent('/schools', '/zh/catchment/vic/a')).toEqual({ name: 'profile_open', data: { from: 'map', to: 'catchment' } });
  });

  it('ignores ordinary navigation between reading pages', () => {
    expect(linkEvent('/school/vic/a', '/suburb/vic/b')).toBeNull();
    expect(linkEvent('/schools', '/schools')).toBeNull();
  });
});

describe('experimentGroup', () => {
  it('reads the group from the flag values', () => {
    expect(experimentGroup('{"theme":"harbour"}', 'theme')).toBe('harbour');
  });

  it('is null outside the experiment or for anything malformed', () => {
    expect(experimentGroup(null, 'theme')).toBeNull();
    expect(experimentGroup('{"other":"x"}', 'theme')).toBeNull();
    expect(experimentGroup('{"theme":3}', 'theme')).toBeNull();
    expect(experimentGroup('not json', 'theme')).toBeNull();
  });
});
