import type { MapSchool } from '@/types/school';
import type { Messages } from '@/lib/i18n';

/** Fee text for a school: the exact figure or range when published, else free/unknown. */
export function feeLabel(school: MapSchool, dictionary: Messages): string | null {
  const fees = school.fees;
  if (!fees) return null;
  if (fees.band === 'free') return dictionary.details.feeFree;
  if (!Number.isFinite(fees.annual_aud_min)) return dictionary.details.feeUnknown;
  const hasRange = Number.isFinite(fees.annual_aud_max) && fees.annual_aud_max !== fees.annual_aud_min;
  return `A$${fees.annual_aud_min}${hasRange ? `–${fees.annual_aud_max}` : ''}`;
}
