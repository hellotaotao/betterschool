import { describe, it, expect } from 'vitest';
import { classifyReligion, deriveIsReligious } from './religion-classify.mjs';

describe('classifyReligion — sector (high confidence)', () => {
  it('Catholic sector → Catholic / true / sector', () => {
    expect(classifyReligion({ sector: 'Catholic', schoolName: 'Anywhere College' }))
      .toEqual({ religious_affiliation: 'Catholic', is_religious: true, religion_source: 'sector' });
  });

  it('Government sector → Secular / false / sector (even with a saint name)', () => {
    expect(classifyReligion({ sector: 'Government', schoolName: "St Mary's Public School" }))
      .toEqual({ religious_affiliation: 'Secular', is_religious: false, religion_source: 'sector' });
  });
});

describe('classifyReligion — governing body (Independent sector)', () => {
  it('Lutheran Education body → Lutheran / governing_body', () => {
    expect(classifyReligion({ sector: 'Independent', governingBody: 'Lutheran Education SA, NT & WA', schoolName: 'Grace College' }))
      .toEqual({ religious_affiliation: 'Lutheran', is_religious: true, religion_source: 'governing_body' });
  });

  it('AngliSchools body → Anglican', () => {
    expect(classifyReligion({ sector: 'Independent', governingBody: 'AngliSchools', schoolName: 'Some College' }).religious_affiliation).toBe('Anglican');
  });

  it('EREA body → Catholic (Edmund Rice)', () => {
    expect(classifyReligion({ sector: 'Independent', governingBody: 'EREA NSW Colleges', schoolName: 'Waverley College' }).religious_affiliation).toBe('Catholic');
  });

  it('Catholic Schools NSW body but Independent sector → Catholic', () => {
    expect(classifyReligion({ sector: 'Independent', governingBody: 'Catholic Schools NSW', schoolName: 'Generic College' }).religious_affiliation).toBe('Catholic');
  });

  it('governing body wins over a non-matching name', () => {
    expect(classifyReligion({ sector: 'Independent', governingBody: 'Adventist Schools Australia', schoolName: 'Hilltop Academy' }))
      .toEqual({ religious_affiliation: 'Adventist', is_religious: true, religion_source: 'governing_body' });
  });

  it('secular peak body carries no religious signal → falls through to Unknown', () => {
    expect(classifyReligion({ sector: 'Independent', governingBody: 'Independent Schools NSW', schoolName: 'Sydney Grammar School' }))
      .toEqual({ religious_affiliation: 'Unknown', is_religious: null });
  });
});

describe('classifyReligion — conservative name heuristic', () => {
  it('explicit "Islamic" → Islamic / name_explicit', () => {
    expect(classifyReligion({ sector: 'Independent', schoolName: 'Al-Faisal Islamic College' }))
      .toEqual({ religious_affiliation: 'Islamic', is_religious: true, religion_source: 'name_explicit' });
  });

  it('explicit "Christian" → Christian / name_explicit', () => {
    expect(classifyReligion({ sector: 'Independent', schoolName: 'Maranatha Christian School' }).religion_source).toBe('name_explicit');
  });

  it('ambiguous "Grammar" is NOT classified → Unknown', () => {
    expect(classifyReligion({ sector: 'Independent', schoolName: 'Newcastle Grammar School' }))
      .toEqual({ religious_affiliation: 'Unknown', is_religious: null });
  });

  it('ambiguous "St"/"Saint" alone → Unknown', () => {
    expect(classifyReligion({ sector: 'Independent', schoolName: "St Andrew's School" }))
      .toEqual({ religious_affiliation: 'Unknown', is_religious: null });
  });

  it('pedagogy name (Montessori) is never inferred Secular → Unknown', () => {
    expect(classifyReligion({ sector: 'Independent', schoolName: 'Castle Hill Montessori School' }))
      .toEqual({ religious_affiliation: 'Unknown', is_religious: null });
  });
});

describe('deriveIsReligious', () => {
  it('Secular → false, Unknown/undefined → null, denomination → true', () => {
    expect(deriveIsReligious('Secular')).toBe(false);
    expect(deriveIsReligious('Unknown')).toBe(null);
    expect(deriveIsReligious(undefined)).toBe(null);
    expect(deriveIsReligious('Catholic')).toBe(true);
  });
});
