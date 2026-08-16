import { describe, expect, it } from 'vitest';
import { safeSchoolWebsiteUrl } from './schoolUrl';

describe('safeSchoolWebsiteUrl', () => {
  it('accepts absolute http and https school URLs with a hostname', () => {
    expect(safeSchoolWebsiteUrl('https://school.example.edu.au/path')).toBe('https://school.example.edu.au/path');
    expect(safeSchoolWebsiteUrl('http://school.example.edu.au')).toBe('http://school.example.edu.au/');
  });

  it('rejects incomplete and unsafe URLs', () => {
    expect(safeSchoolWebsiteUrl('http://')).toBeUndefined();
    expect(safeSchoolWebsiteUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeSchoolWebsiteUrl('')).toBeUndefined();
    expect(safeSchoolWebsiteUrl(undefined)).toBeUndefined();
  });

  it('rejects URLs with a username', () => {
    expect(safeSchoolWebsiteUrl('http://koroitps@education.vic.gov.au')).toBeUndefined();
  });

  it('rejects URLs with a password', () => {
    expect(safeSchoolWebsiteUrl('https://:secret@school.example.edu.au')).toBeUndefined();
  });
});
