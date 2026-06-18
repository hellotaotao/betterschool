"use client";

import { School } from '@/types/school';
import { getReligionLabel, getSchoolTypeLabel, getSectorLabel, Messages } from '@/lib/i18n';
import { hasLegacyScore } from '@/utils/schoolFilters';

interface SchoolDetailProps {
  school: School;
  dictionary: Messages;
  onClose: () => void;
  variant?: 'panel' | 'sheet';
}

export default function SchoolDetail({ school, dictionary, onClose, variant = 'panel' }: SchoolDetailProps) {
  const wrapClass = variant === 'panel'
    ? 'absolute top-14 right-3 bottom-3 z-10 w-56 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl flex flex-col overflow-hidden'
    : 'flex flex-col h-full overflow-hidden bg-white';

  return (
    <div className={wrapClass}>
      <div className="px-3 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-indigo-600">{dictionary.details.title}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-base leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex justify-between items-start gap-2 mb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900 leading-tight">
              {school.school_name}
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {school.suburb}, {school.state} {school.postcode}
            </p>
          </div>
          <div className="shrink-0 bg-indigo-600 text-white text-center rounded-lg px-2 py-1">
            <div className="text-lg font-black leading-none">{hasLegacyScore(school) ? school.legacy_score : '—'}</div>
            <div className="text-[8px] font-normal">{hasLegacyScore(school) ? dictionary.details.legacyScore : dictionary.details.profileOnly}</div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-2.5 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">{dictionary.details.legacyScore}</span>
            <span className="font-bold text-gray-800">{hasLegacyScore(school) ? school.legacy_score : '—'}</span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex justify-between">
            <span className="text-gray-500">{dictionary.details.datasetRank}</span>
            <span className="font-bold text-gray-800">{hasLegacyScore(school) ? `#${school.legacy_rank}` : '—'}</span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex justify-between items-center">
            <span className="text-gray-500">{dictionary.details.sector}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                school.sector === 'Government'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              }`}
            >
              {getSectorLabel(school.sector, dictionary)}
            </span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex justify-between items-center">
            <span className="text-gray-500">{dictionary.details.religiousAffiliation}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                school.is_religious === true
                  ? 'bg-purple-100 text-purple-700'
                  : school.is_religious === false
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-gray-50 text-gray-400'
              }`}
            >
              {getReligionLabel(school.religious_affiliation, dictionary)}
            </span>
          </div>
          {school.school_type && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.schoolType}</span>
                <span className="font-medium text-gray-800">
                  {getSchoolTypeLabel(school.school_type, dictionary)}
                </span>
              </div>
            </>
          )}
          {school.campus_type && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">{dictionary.details.campusType}</span>
                <span className="font-medium text-gray-800 text-right">{school.campus_type}</span>
              </div>
            </>
          )}
          {school.year_range && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.yearRange}</span>
                <span className="font-medium text-gray-800">{school.year_range}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.icsea) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500" title={dictionary.details.icseaHint}>{dictionary.details.icsea}</span>
                <span className="font-medium text-gray-800">{school.icsea}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.icsea_percentile) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.icseaPercentile}</span>
                <span className="font-medium text-gray-800">{school.icsea_percentile}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.total_enrolments) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.enrolments}</span>
                <span className="font-medium text-gray-800">{school.total_enrolments}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.girls) && Number.isFinite(school.boys) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.girlsBoys}</span>
                <span className="font-medium text-gray-800">{school.girls} / {school.boys}</span>
              </div>
            </>
          )}
          {Number.isFinite(school.lbote_yes_percent) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.lbote}</span>
                <span className="font-medium text-gray-800">{school.lbote_yes_percent}%</span>
              </div>
            </>
          )}
          {Number.isFinite(school.indigenous_percent) && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.indigenous}</span>
                <span className="font-medium text-gray-800">{school.indigenous_percent}%</span>
              </div>
            </>
          )}
          <div className="border-t border-gray-100" />
          <div className="flex justify-between">
            <span className="text-gray-500">{dictionary.details.postcode}</span>
            <span className="font-medium text-gray-800">{school.postcode}</span>
          </div>
          {school.governing_body && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">{dictionary.details.governingBody}</span>
                <span className="font-medium text-gray-800 text-right">{school.governing_body}</span>
              </div>
            </>
          )}
          {school.school_url && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.website}</span>
                <a className="font-medium text-indigo-600 hover:underline" href={school.school_url} target="_blank" rel="noreferrer">Open</a>
              </div>
            </>
          )}
          {school.fees && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between items-center">
                <span className="text-gray-500">{dictionary.details.fees}</span>
                <span className="font-medium text-gray-800 text-right">
                  {school.fees.band === 'free'
                    ? dictionary.details.feeFree
                    : Number.isFinite(school.fees.annual_aud_min)
                      ? `A$${school.fees.annual_aud_min}${Number.isFinite(school.fees.annual_aud_max) && school.fees.annual_aud_max !== school.fees.annual_aud_min ? `–${school.fees.annual_aud_max}` : ''}`
                      : dictionary.details.feeUnknown}
                </span>
              </div>
            </>
          )}
          {school.myschool_url && (
            <>
              <div className="border-t border-gray-100" />
              <div className="flex justify-between">
                <span className="text-gray-500">{dictionary.details.naplan}</span>
                <a className="font-medium text-indigo-600 hover:underline" href={school.myschool_url} target="_blank" rel="noreferrer">{dictionary.details.viewOnMySchool}</a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
