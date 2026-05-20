import {
  readWorksheetRows,
  writeJson,
  toStringOrNull,
  toPostcode,
  toIntegerOrNull,
  toNumberOrNull,
  sourceMeta,
} from './acara-common.mjs';

const SOURCE_FILE = 'School Profile 2025.xlsx';
const generatedAt = new Date().toISOString();

const records = readWorksheetRows(SOURCE_FILE, 'SchoolProfile 2025').map((row) => ({
  acara_sml_id: toIntegerOrNull(row['ACARA SML ID']),
  location_age_id: toIntegerOrNull(row['Location AGE ID']),
  school_age_id: toIntegerOrNull(row['School AGE ID']),
  school_name: toStringOrNull(row['School Name']),
  suburb: toStringOrNull(row.Suburb),
  state: toStringOrNull(row.State),
  postcode: toPostcode(row.Postcode),
  sector: toStringOrNull(row['School Sector']),
  school_type: toStringOrNull(row['School Type']),
  campus_type: toStringOrNull(row['Campus Type']),
  rolled_reporting_description: toStringOrNull(row['Rolled Reporting Description']),
  school_url: toStringOrNull(row['School URL']),
  governing_body: toStringOrNull(row['Governing Body']),
  governing_body_url: toStringOrNull(row['Governing Body URL']),
  year_range: toStringOrNull(row['Year Range']),
  geolocation: toStringOrNull(row.Geolocation),
  icsea: toIntegerOrNull(row.ICSEA),
  icsea_percentile: toIntegerOrNull(row['ICSEA Percentile']),
  sea_quarters: {
    bottom_percent: toNumberOrNull(row['Bottom SEA Quarter (%)']),
    lower_middle_percent: toNumberOrNull(row['Lower Middle SEA Quarter (%)']),
    upper_middle_percent: toNumberOrNull(row['Upper Middle SEA Quarter (%)']),
    top_percent: toNumberOrNull(row['Top SEA Quarter (%)']),
  },
  staff: {
    teaching: toNumberOrNull(row['Teaching Staff']),
    teaching_fte: toNumberOrNull(row['Full Time Equivalent Teaching Staff']),
    non_teaching: toNumberOrNull(row['Non-Teaching Staff']),
    non_teaching_fte: toNumberOrNull(row['Full Time Equivalent Non-Teaching Staff']),
  },
  enrolments: {
    total: toNumberOrNull(row['Total Enrolments']),
    girls: toNumberOrNull(row['Girls Enrolments']),
    boys: toNumberOrNull(row['Boys Enrolments']),
    fte: toNumberOrNull(row['Full Time Equivalent Enrolments']),
    indigenous_percent: toNumberOrNull(row['Indigenous Enrolments (%)']),
    lbote_yes_percent: toNumberOrNull(row['Language Background Other Than English - Yes (%)']),
    lbote_no_percent: toNumberOrNull(row['Language Background Other Than English - No (%)']),
    lbote_not_stated_percent: toNumberOrNull(row['Language Background Other Than English - Not Stated (%)']),
  },
  source: sourceMeta(SOURCE_FILE, generatedAt),
}));

const outputPath = writeJson('school-profile-2025.json', {
  source: sourceMeta(SOURCE_FILE, generatedAt),
  record_count: records.length,
  records,
});

console.log(JSON.stringify({ outputPath, records: records.length }, null, 2));
