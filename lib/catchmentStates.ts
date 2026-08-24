import { CATCHMENT_STATES } from './catchmentLookup';

/**
 * What each state publishes, and where its authoritative checker lives.
 *
 * Every state's zones come with the same warning — a boundary can run through
 * the middle of a street — but the tool that settles it is the state
 * department's own, so linking a South Australian reader at the NSW School
 * Finder would be worse than not linking at all.
 *
 * `complete` records whether the state's published layer represents its zoned
 * government system. NSW
 * publishes a zone for 2,029 of 2,223 government schools, so a NSW school
 * without one has genuinely had none published. South Australia publishes 124
 * of 521, and the published data gives no rule for which — so "no zone here"
 * carries much less information there, and the page has to say so rather than
 * letting a reader infer the school is unzoned. Victoria publishes its
 * designated-neighbourhood zones comprehensively, although specialist,
 * selective and alternative settings need not have an ordinary local zone.
 */
export interface CatchmentStateInfo {
  /** ACARA state code. */
  state: string;
  /** The department's own address checker. */
  finderUrl: string;
  /** Whether the state zones essentially all of its government schools. */
  complete: boolean;
}

const STATE_INFO: Record<string, CatchmentStateInfo> = {
  NSW: {
    state: 'NSW',
    finderUrl: 'https://education.nsw.gov.au/school-finder',
    complete: true,
  },
  SA: {
    state: 'SA',
    finderUrl: 'https://www.education.sa.gov.au/parents-and-families/enrol-school-or-preschool/find-a-school-zone-or-preschool-catchment-area',
    complete: false,
  },
  VIC: {
    state: 'VIC',
    finderUrl: 'https://www.findmyschool.vic.gov.au/',
    complete: true,
  },
};

/** Null for a state whose zones we have not collected. */
export function catchmentStateInfo(state: string): CatchmentStateInfo | null {
  return STATE_INFO[state.toUpperCase()] ?? null;
}

/** ACARA codes of the states with a published zone layer, in CATCHMENT_STATES order. */
export function catchmentStateCodes(): string[] {
  return CATCHMENT_STATES.map(slug => slug.toUpperCase());
}

export type CatchmentAbsenceKind =
  | 'non-government'
  | 'not-published'
  | 'partial-state'
  | 'not-collected';

/** The meaning of an absent catchment for one school. */
export function catchmentAbsenceKind(state: string, sector: string): CatchmentAbsenceKind {
  if (sector !== 'Government') return 'non-government';
  const info = catchmentStateInfo(state);
  if (!info) return 'not-collected';
  return info.complete ? 'not-published' : 'partial-state';
}
