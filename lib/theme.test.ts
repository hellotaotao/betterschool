import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  EXPERIMENT_STORAGE_KEY,
  THEMES,
  THEME_EXPERIMENT,
  THEME_STORAGE_KEY,
  isTheme,
  resolveTheme,
  themeBootScript,
} from './theme';

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

interface Run {
  theme: string | undefined;
  storage: Map<string, string>;
  flags: Record<string, string> | null;
}

/** Runs the boot script against a fake browser and reports what it did. */
function boot({
  search = '',
  stored = {},
  random = 0,
  storageThrows = false,
}: { search?: string; stored?: Record<string, string>; random?: number; storageThrows?: boolean }): Run {
  const attributes: Record<string, string> = {};
  const storage = new Map(Object.entries(stored));
  const appended: { type: string; attributes: Record<string, string>; textContent: string }[] = [];
  const localStorage = storageThrows
    ? { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } }
    : {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    };
  const document = {
    documentElement: { setAttribute: (key: string, value: string) => { attributes[key] = value; } },
    createElement: () => {
      const element = { type: '', attributes: {} as Record<string, string>, textContent: '', setAttribute(key: string, value: string) { this.attributes[key] = value; } };
      return element;
    },
    head: { appendChild: (element: (typeof appended)[number]) => { appended.push(element); } },
  };
  const fakeMath = Object.create(Math, { random: { value: () => random } });
  const run = new Function('location', 'localStorage', 'document', 'URLSearchParams', 'Math', themeBootScript());
  run({ search }, localStorage, document, URLSearchParams, fakeMath);
  const flagScript = appended.find(element => 'data-flag-values' in element.attributes);
  return {
    theme: attributes['data-theme'],
    storage,
    flags: flagScript ? JSON.parse(flagScript.textContent) : null,
  };
}

describe('themeBootScript', () => {
  it('carries every theme name so the list has one source', () => {
    const script = themeBootScript();
    for (const theme of THEMES) expect(script).toContain(`"${theme}"`);
  });

  it('applies and remembers a query theme, and takes the visitor out of the experiment', () => {
    const run = boot({ search: '?theme=harbour', stored: { [EXPERIMENT_STORAGE_KEY]: `${THEME_EXPERIMENT?.id}:atlas` } });
    expect(run.theme).toBe('harbour');
    expect(run.storage.get(THEME_STORAGE_KEY)).toBe('harbour');
    expect(run.storage.has(EXPERIMENT_STORAGE_KEY)).toBe(false);
    expect(run.flags).toBeNull();
  });

  it('keeps a remembered manual choice outside the experiment', () => {
    const run = boot({ stored: { [THEME_STORAGE_KEY]: 'atlas' } });
    expect(run.theme).toBe('atlas');
    expect(run.flags).toBeNull();
  });

  it('survives storage that throws, leaving the default and no experiment', () => {
    const run = boot({ search: '?theme=atlas', storageThrows: true });
    expect(run.theme).toBe('atlas');
    const plain = boot({ storageThrows: true });
    expect(plain.theme).toBeUndefined();
    expect(plain.flags).toBeNull();
  });
});

describe.runIf(THEME_EXPERIMENT)('theme experiment', () => {
  const experiment = THEME_EXPERIMENT!;

  it('draws a new visitor by the weights, remembers it and reports it as a flag', () => {
    const total = THEMES.reduce((sum, theme) => sum + experiment.weights[theme], 0);
    let start = 0;
    for (const theme of THEMES) {
      // A draw just inside each theme's share lands on that theme.
      const random = (start + experiment.weights[theme] / 2) / total;
      start += experiment.weights[theme];
      const run = boot({ random });
      expect(run.theme).toBe(theme);
      expect(run.storage.get(EXPERIMENT_STORAGE_KEY)).toBe(`${experiment.id}:${theme}`);
      expect(run.flags).toEqual({ [experiment.flag]: theme });
    }
  });

  it('keeps an earlier draw from the same experiment', () => {
    const run = boot({ stored: { [EXPERIMENT_STORAGE_KEY]: `${experiment.id}:harbour` }, random: 0 });
    expect(run.theme).toBe('harbour');
    expect(run.flags).toEqual({ [experiment.flag]: 'harbour' });
  });

  it('draws again when the stored draw belongs to an older experiment', () => {
    const run = boot({ stored: { [EXPERIMENT_STORAGE_KEY]: 'an-older-test:harbour' }, random: 0 });
    expect(run.theme).toBe(THEMES[0]);
    expect(run.storage.get(EXPERIMENT_STORAGE_KEY)).toBe(`${experiment.id}:${THEMES[0]}`);
  });
});
