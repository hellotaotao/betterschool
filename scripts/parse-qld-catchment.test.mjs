import { describe, expect, it } from 'vitest';
import { parseCatchmentKml, parseSiteKml } from './parse-qld-catchment.mjs';

const description = (name, code) => `<![CDATA[
  <table>
    <tr><td>Centre_name</td><td>${name}</td></tr>
    <tr><td>Centre_code</td><td>${code}</td></tr>
  </table>
]]>`;

describe('parseSiteKml', () => {
  it('reads the official centre identity and rounds a KML point', () => {
    const kml = `<kml><Document><Placemark>
      <name><![CDATA[Camp Hill SIPS]]></name>
      <description>${description('Camp Hill SIPS', '1854')}</description>
      <Point><coordinates>153.07623456789,-27.49387654321,0</coordinates></Point>
    </Placemark></Document></kml>`;

    expect(parseSiteKml(kml)).toEqual([{
      source_name: 'Camp Hill SIPS',
      source_school_code: '1854',
      longitude: 153.076235,
      latitude: -27.493877,
    }]);
  });
});

describe('parseCatchmentKml', () => {
  it('preserves multipart polygons and holes without dropping vertices', () => {
    const polygon = (offset, hole = '') => `<Polygon>
      <outerBoundaryIs><LinearRing><coordinates>
        ${153 + offset},-27,0 ${154 + offset},-27,0 ${154 + offset},-26,0 ${153 + offset},-27,0
      </coordinates></LinearRing></outerBoundaryIs>
      ${hole}
    </Polygon>`;
    const hole = `<innerBoundaryIs><LinearRing><coordinates>
      153.1,-26.9,0 153.2,-26.9,0 153.2,-26.8,0 153.1,-26.9,0
    </coordinates></LinearRing></innerBoundaryIs>`;
    const kml = `<kml><Document><Placemark>
      <name>Example &amp; District SS</name>
      <description>${description('Example &amp; District SS', '0042')}</description>
      <MultiGeometry>${polygon(0, hole)}${polygon(2)}</MultiGeometry>
    </Placemark></Document></kml>`;

    const [record] = parseCatchmentKml(kml, {
      key: 'primary', kind: 'primary', catch_type: 'PRIMARY', year_levels: ['P', '1', '2', '3', '4', '5', '6'],
    });
    expect(record.source_name).toBe('Example & District SS');
    expect(record.source_school_code).toBe('0042');
    expect(record.geometry.type).toBe('MultiPolygon');
    expect(record.geometry.coordinates).toHaveLength(2);
    expect(record.geometry.coordinates[0]).toHaveLength(2);
    expect(record.vertices).toBe(12);
  });

  it('rejects malformed source identity and unclosed rings', () => {
    expect(() => parseCatchmentKml('<kml><Placemark><name>Unknown</name></Placemark></kml>', {
      key: 'primary', kind: 'primary', catch_type: 'PRIMARY', year_levels: ['P'],
    })).toThrow(/identity|code|description/i);

    const kml = `<kml><Placemark><name>Example SS</name>
      <description>${description('Example SS', '0042')}</description>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        153,-27,0 154,-27,0 154,-26,0 153.1,-27,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></kml>`;
    expect(() => parseCatchmentKml(kml, {
      key: 'primary', kind: 'primary', catch_type: 'PRIMARY', year_levels: ['P'],
    })).toThrow(/closed/i);
  });
});
