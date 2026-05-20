import {
  readWorksheetRows,
  writeJson,
  toStringOrNull,
  toPostcode,
  toIntegerOrNull,
  toNumberOrNull,
  sourceMeta,
} from './acara-common.mjs';

const SOURCE_FILE = 'School Location 2025.xlsx';
const generatedAt = new Date().toISOString();

const records = readWorksheetRows(SOURCE_FILE, 'SchoolLocations 2025').map((row) => ({
  acara_sml_id: toIntegerOrNull(row['ACARA SML ID']),
  location_age_id: toIntegerOrNull(row['Location AGE ID']),
  school_age_id: toIntegerOrNull(row['School AGE ID']),
  rolled_school_id: toIntegerOrNull(row['Rolled School ID']),
  school_name: toStringOrNull(row['School Name']),
  suburb: toStringOrNull(row.Suburb),
  state: toStringOrNull(row.State),
  postcode: toPostcode(row.Postcode),
  sector: toStringOrNull(row['School Sector']),
  school_type: toStringOrNull(row['School Type']),
  special_school: toIntegerOrNull(row['Special school']),
  campus_type: toStringOrNull(row['Campus Type']),
  latitude: toNumberOrNull(row.Latitude),
  longitude: toNumberOrNull(row.Longitude),
  geography: {
    abs_remoteness_area: toIntegerOrNull(row['ABS Remoteness Area']),
    abs_remoteness_area_name: toStringOrNull(row['ABS Remoteness Area Name']),
    meshblock: toIntegerOrNull(row.Meshblock),
    statistical_area_1: toIntegerOrNull(row['Statistical Area 1']),
    statistical_area_2: toIntegerOrNull(row['Statistical Area 2']),
    statistical_area_2_name: toStringOrNull(row['Statistical Area 2 Name']),
    statistical_area_3: toIntegerOrNull(row['Statistical Area 3']),
    statistical_area_3_name: toStringOrNull(row['Statistical Area 3 Name']),
    statistical_area_4: toIntegerOrNull(row['Statistical Area 4']),
    statistical_area_4_name: toStringOrNull(row['Statistical Area 4 Name']),
    local_government_area: toIntegerOrNull(row['Local Government Area']),
    local_government_area_name: toStringOrNull(row['Local Government Area Name']),
    state_electoral_division: toIntegerOrNull(row['State Electoral Division']),
    state_electoral_division_name: toStringOrNull(row['State Electoral Division Name']),
    commonwealth_electoral_division: toIntegerOrNull(row['Commonwealth Electoral Division']),
    commonwealth_electoral_division_name: toStringOrNull(row['Commonwealth Electoral Division Name']),
  },
  source: sourceMeta(SOURCE_FILE, generatedAt),
}));

const outputPath = writeJson('school-location-2025.json', {
  source: sourceMeta(SOURCE_FILE, generatedAt),
  record_count: records.length,
  records,
});

console.log(JSON.stringify({ outputPath, records: records.length }, null, 2));
