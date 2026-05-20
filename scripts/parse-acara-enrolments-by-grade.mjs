import {
  readWorksheetRows,
  writeJson,
  toStringOrNull,
  toPostcode,
  toIntegerOrNull,
  toNumberOrNull,
  toBooleanOffered,
  sourceMeta,
} from './acara-common.mjs';

const SOURCE_FILE = 'Enrolments by Grade 2025.xlsx';
const generatedAt = new Date().toISOString();

const gradeColumns = [
  ['two_years_before_year_1', 'Two years before Year 1'],
  ['one_year_before_year_1', 'One year before Year 1'],
  ['year_1', 'Year 1'],
  ['year_2', 'Year 2'],
  ['year_3', 'Year 3'],
  ['year_4', 'Year 4'],
  ['year_5', 'Year 5'],
  ['year_6', 'Year 6'],
  ['year_7', 'Year 7'],
  ['year_8', 'Year 8'],
  ['year_9', 'Year 9'],
  ['year_10', 'Year 10'],
  ['year_11', 'Year 11'],
  ['year_12', 'Year 12'],
  ['primary_ungraded', 'Primary Ungraded'],
  ['secondary_ungraded', 'Secondary Ungraded'],
];

function gradeEnrolments(row) {
  return Object.fromEntries(gradeColumns.map(([key, label]) => [key, {
    offered: toBooleanOffered(row[`${label} Offered`]),
    enrolments: toNumberOrNull(row[`${label} Enrolments`]),
  }]));
}

const records = readWorksheetRows(SOURCE_FILE, 'EnrolmentsByGrade 2025').map((row) => ({
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
  enrolments_by_grade: gradeEnrolments(row),
  total_enrolments: toNumberOrNull(row['Total Enrolments']),
  source: sourceMeta(SOURCE_FILE, generatedAt),
}));

const outputPath = writeJson('enrolments-by-grade-2025.json', {
  source: sourceMeta(SOURCE_FILE, generatedAt),
  grade_keys: gradeColumns.map(([key]) => key),
  record_count: records.length,
  records,
});

console.log(JSON.stringify({ outputPath, records: records.length }, null, 2));
