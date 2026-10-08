"use client";

import { formatMessage, type Locale, type Messages } from '@/lib/i18n';
import type { ZoneOverlayKind } from '@/lib/catchmentLookup';
import type { ZonesInView } from '@/lib/catchmentClient';

/**
 * Manual language switch.
 *
 * The app guesses from navigator.languages, and that guess is often wrong for
 * this audience — plenty of Chinese-speaking parents in Australia run an
 * English browser, and vice versa. The choice is remembered, so it only has to
 * be made once.
 */
export function LanguageToggle({ locale, onChange }: { locale: Locale; onChange: (next: Locale) => void }) {
  return (
    <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-full px-1 py-1 shadow-md shrink-0">
      {(['en', 'zh'] as const).map(option => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={locale === option}
          lang={option === 'zh' ? 'zh-Hans' : 'en'}
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
            locale === option ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {option === 'en' ? 'EN' : '中文'}
        </button>
      ))}
    </div>
  );
}

/** What the browse overlay is currently doing, in one line. */
export function zoneOverlayStatus(
  state: ZonesInView | null,
  dictionary: Messages,
): string | null {
  if (!state) return null;
  if (state.tooMany) return formatMessage(dictionary.zoneBrowse.tooMany, { count: state.total });
  if (state.total === 0) return dictionary.zoneBrowse.none;
  return formatMessage(dictionary.zoneBrowse.showing, { count: state.total });
}

/**
 * Browse control for zone boundaries across the whole viewport.
 *
 * Secondary choices are year-specific when the source publishes that fact.
 * A separate unspecified option keeps SA honest rather than inventing years.
 */
export function ZoneOverlayControl({
  value,
  onChange,
  dictionary,
}: {
  value: ZoneOverlayKind;
  onChange: (next: ZoneOverlayKind) => void;
  dictionary: Messages;
}) {
  const options: [ZoneOverlayKind, string][] = [
    ['off', dictionary.zoneBrowse.off],
    ['primary', dictionary.zoneBrowse.primary],
    ['secondary-unspecified', dictionary.zoneBrowse.secondary],
    ...([7, 8, 9, 10, 11, 12] as const).map((year): [ZoneOverlayKind, string] => [
      `year-${year}`,
      formatMessage(dictionary.zoneBrowse.year, { year }),
    ]),
  ];

  return (
    <div className="flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-sm px-2 py-1 shadow-md shrink-0">
      <span className="text-[10px] text-gray-500 whitespace-nowrap">{dictionary.zoneBrowse.label}</span>
      {options.map(([option, label]) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors ${
            value === option ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Toolbar toggle that arms map-click catchment lookup. */
export function LookupButton({
  active,
  dictionary,
  onClick,
}: {
  active: boolean;
  dictionary: Messages;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-md whitespace-nowrap transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white/90 backdrop-blur-sm text-gray-700 hover:bg-gray-100'
      }`}
    >
      {active ? dictionary.lookup.cancel : `◎ ${dictionary.lookup.button}`}
    </button>
  );
}
