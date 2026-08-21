import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import zh from '@/messages/zh.json';
import { formatMessage, getMessages, detectBrowserLocale, resolveInitialLocale } from './i18n';

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Placeholders a template expects, e.g. {count}. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
}

function leaves(bundle: unknown, prefix = ''): [string, string][] {
  if (typeof bundle === 'string') return [[prefix, bundle]];
  if (typeof bundle !== 'object' || bundle === null) return [];
  return Object.entries(bundle).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message bundles', () => {
  // Documented invariant in CLAUDE.md; it had no test until the Chinese pages
  // doubled the number of strings that can quietly go missing.
  it('define exactly the same keys in both locales', () => {
    const enKeys = flatten(en).sort();
    const zhKeys = flatten(zh).sort();

    expect(zhKeys.filter(key => !enKeys.includes(key))).toEqual([]);
    expect(enKeys.filter(key => !zhKeys.includes(key))).toEqual([]);
  });

  it('never leaves a string empty', () => {
    for (const [key, value] of leaves(en)) expect(value.trim(), `en ${key}`).not.toBe('');
    for (const [key, value] of leaves(zh)) expect(value.trim(), `zh ${key}`).not.toBe('');
  });

  // A translation that drops {count} renders a sentence with a hole in it, and
  // one that invents {total} renders the literal braces.
  it('uses the same placeholders in both locales', () => {
    const zhByKey = new Map(leaves(zh));
    for (const [key, template] of leaves(en)) {
      expect(placeholders(zhByKey.get(key) ?? ''), key).toEqual(placeholders(template));
    }
  });
});

describe('formatMessage', () => {
  it('substitutes every placeholder', () => {
    expect(formatMessage('{a} and {b}', { a: '1', b: '2' })).toBe('1 and 2');
  });

  it('leaves unknown placeholders alone rather than printing undefined', () => {
    expect(formatMessage('{a} and {b}', { a: '1' })).toBe('1 and {b}');
  });
});

describe('detectBrowserLocale', () => {
  it.each([
    [['zh-CN', 'en'], 'zh'],
    [['zh-Hans-AU'], 'zh'],
    [['en-AU'], 'en'],
    [[], 'en'],
  ])('%j -> %s', (languages, expected) => {
    expect(detectBrowserLocale(languages)).toBe(expected);
  });
});

describe('getMessages', () => {
  it('returns the requested locale bundle', () => {
    expect(getMessages('zh').seo.shell.otherLanguage).toBe('English');
    expect(getMessages('en').seo.shell.otherLanguage).toBe('中文');
  });
});

describe('resolveInitialLocale', () => {
  it('lets an explicit ?lang= win over everything', () => {
    expect(resolveInitialLocale({ query: 'en', stored: 'zh', languages: ['zh-CN'] })).toBe('en');
    expect(resolveInitialLocale({ query: 'zh', stored: 'en', languages: ['en-AU'] })).toBe('zh');
  });

  it('remembers a stored choice over the browser guess', () => {
    expect(resolveInitialLocale({ stored: 'en', languages: ['zh-CN'] })).toBe('en');
    expect(resolveInitialLocale({ stored: 'zh', languages: ['en-AU'] })).toBe('zh');
  });

  it('falls back to the browser when nothing was chosen', () => {
    expect(resolveInitialLocale({ languages: ['zh-Hans-AU'] })).toBe('zh');
    expect(resolveInitialLocale({ languages: ['en-AU'] })).toBe('en');
  });

  it('ignores junk in the query or in storage', () => {
    expect(resolveInitialLocale({ query: 'fr', stored: 'de', languages: ['zh-CN'] })).toBe('zh');
    expect(resolveInitialLocale({ query: null, stored: null, languages: [] })).toBe('en');
  });
});
