import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme, themeBootScript } from './theme';

describe('resolveTheme', () => {
  it('prefers the query parameter over the stored choice', () => {
    expect(resolveTheme({ query: 'atlas', stored: 'harbour' })).toBe('atlas');
  });

  it('falls back to the stored choice, then the default', () => {
    expect(resolveTheme({ query: null, stored: 'harbour' })).toBe('harbour');
    expect(resolveTheme({})).toBe(DEFAULT_THEME);
  });

  it('ignores values that are not themes', () => {
    expect(resolveTheme({ query: 'dark', stored: '<script>' })).toBe(DEFAULT_THEME);
    expect(isTheme('Bright')).toBe(false);
  });
});

describe('themeBootScript', () => {
  it('carries every theme name so the list has one source', () => {
    const script = themeBootScript();
    for (const theme of THEMES) expect(script).toContain(`"${theme}"`);
  });

  it('applies the query theme and remembers it, in a simulated browser', () => {
    const attributes: Record<string, string> = {};
    const storage = new Map<string, string>();
    const run = new Function('location', 'localStorage', 'document', 'URLSearchParams', themeBootScript());
    run(
      { search: '?theme=harbour' },
      { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
      { documentElement: { setAttribute: (k: string, v: string) => { attributes[k] = v; } } },
      URLSearchParams,
    );
    expect(attributes['data-theme']).toBe('harbour');
    expect(storage.get('bs-theme')).toBe('harbour');
  });

  it('survives storage that throws', () => {
    const attributes: Record<string, string> = {};
    const run = new Function('location', 'localStorage', 'document', 'URLSearchParams', themeBootScript());
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => run(
      { search: '?theme=atlas' },
      throwing,
      { documentElement: { setAttribute: (k: string, v: string) => { attributes[k] = v; } } },
      URLSearchParams,
    )).not.toThrow();
    expect(attributes['data-theme']).toBe('atlas');
  });
});
