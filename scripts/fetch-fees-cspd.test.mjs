import { describe, expect, it } from 'vitest';
import { parseTemplate } from './fetch-fees-cspd.mjs';
import { parseScsEntry } from './fetch-fees-scs.mjs';

describe('parseTemplate (CSPD)', () => {
  it('parses layout 1 with all 4 child totals and coalesces uniform vs per-year components', () => {
    const flat = [
      'Fees Payable at Sample College for 2026',
      'Year 10|Year 10 1st Child 2nd Child 3rd Child 4th+ Child|Activity Fee|$33|$33|$33|$33|Diocesan Building Levy\u00a0(one per family)|$945|Diocesan Tuition Fee|$2,808|$2,106|$1,404|Resource Fee|$2,217|$2,217|$2,217|$2,217|Total|$6,003|$4,356|$3,654|$2,250',
      'Year 11|Year 11 1st Child 2nd Child 3rd Child 4th+ Child|Activity Fee|$33|$33|$33|$33|Diocesan Building Levy\u00a0(one per family)|$945|Diocesan Tuition Fee|$3,579|$2,685|$1,791|Resource Fee|$2,217|$2,217|$2,217|$2,217|Total|$6,774|$4,935|$4,041|$2,250',
      'Year 12|Year 12 1st Child 2nd Child 3rd Child 4th+ Child|Activity Fee|$33|$33|$33|$33|Diocesan Building Levy\u00a0(one per family)|$945|Diocesan Tuition Fee|$3,579|$2,685|$1,791|Resource Fee|$2,217|$2,217|$2,217|$2,217|Total|$6,774|$4,935|$4,041|$2,250',
      'Flexible Payment Options',
    ].join('|');

    const parsed = parseTemplate(flat);
    expect(parsed).not.toBeNull();
    expect(parsed.fee_year).toBe(2026);
    expect(parsed.billing_unit).toBe('per_student');
    expect(parsed.sibling_amounts_basis).toBe('per_child');
    expect(parsed.by_year).toEqual([
      { years: '10', tuition: 2808, total: 6003, child_2: 4356, child_3: 3654, child_4: 2250 },
      { years: '11', tuition: 3579, total: 6774, child_2: 4935, child_3: 4041, child_4: 2250 },
      { years: '12', tuition: 3579, total: 6774, child_2: 4935, child_3: 4041, child_4: 2250 },
    ]);
    expect(parsed.components).toEqual([
      { name: 'Activity Fee', unit: 'per_student', amount: 33 },
      { name: 'Diocesan Building Levy', unit: 'per_family', amount: 945 },
      {
        name: 'Diocesan Tuition Fee',
        unit: 'per_student',
        by_year: [
          { years: '10', amount: 2808 },
          { years: '11-12', amount: 3579 },
        ],
      },
      { name: 'Resource Fee', unit: 'per_student', amount: 2217 },
    ]);
  });

  it('parses layout 2 full-rate block and ignores the following discounted block', () => {
    const flat = [
      'Fees Payable at Our Lady of the Nativity Primary School for 2026',
      'Kindergarten|Fee components Child\u00a01 Child\u00a02 Child\u00a03 Child\u00a04+|Diocesan Building Levy (one per family)|$945|Diocesan Tuition Fee|$1,410|$1,059|$705|Resource Fee|$600|$600|$600|$600|Total|$2,955|$1,659|$1,305|$600',
      'Fee components Child\u00a01 Child\u00a02 Child\u00a03 Child\u00a04+|Diocesan Building Levy (one per family)|Fees payable after discount offer is applied*|$472.50|Diocesan Tuition Fee|Fees payable after discount offer is applied*|$705|$354|Resource Fee|$600|$600|$600|$600|Total|$1,777.50|$954|$600|$600',
      'Year 1|Fee components Child\u00a01 Child\u00a02 Child\u00a03 Child\u00a04+|Diocesan Building Levy (one per family)|$945|Diocesan Tuition Fee|$1,824|$1,368|$912|Resource Fee|$600|$600|$600|$600|Total|$3,369|$1,968|$1,512|$600',
      'Fee components Child\u00a01 Child\u00a02 Child\u00a03 Child\u00a04+|Diocesan Building Levy (one per family)|Fees payable after discount offer is applied*|$472.50|Diocesan Tuition Fee|Fees payable after discount offer is applied*|$912|$456|Resource Fee|$600|$600|$600|$600|Total|$1,984.50|$1,056|$600|$600',
      'End',
    ].join('|');

    const parsed = parseTemplate(flat);
    expect(parsed).not.toBeNull();
    expect(parsed.by_year).toEqual([
      { years: 'K', tuition: 1410, total: 2955, child_2: 1659, child_3: 1305, child_4: 600 },
      { years: '1', tuition: 1824, total: 3369, child_2: 1968, child_3: 1512, child_4: 600 },
    ]);
    expect(parsed.components).toContainEqual({
      name: 'Diocesan Building Levy',
      unit: 'per_family',
      amount: 945,
    });
    expect(JSON.stringify(parsed)).not.toContain('472.5');
    expect(JSON.stringify(parsed)).not.toContain('1777.5');
  });
});

describe('parseScsEntry (SCS)', () => {
  it('keeps all 4 child totals including $0 for 4th child', () => {
    const parsed = parseScsEntry({
      year: 2027,
      feePage: 'https://stjrosebery.syd.catholic.edu.au/enrolment/school-fees-and-assistance',
      data: {
        buildingLevy: 5087,
        fees: [
          { scholasticYear: 'Year K', firstChild: 5087, secondChild: 3451, thirdChild: 2905, fourthChild: 1484 },
          { scholasticYear: 'Year 5', firstChild: 2531, secondChild: 2278, thirdChild: 1645, fourthChild: 0 },
        ],
      },
    });
    expect(parsed).toMatchObject({
      fee_year: 2027,
      billing_unit: 'per_student',
      sibling_amounts_basis: 'per_child',
      source: 'scs_endpoint',
      by_year: [
        { years: 'K', total: 5087, child_2: 3451, child_3: 2905, child_4: 1484 },
        { years: '5', total: 2531, child_2: 2278, child_3: 1645, child_4: 0 },
      ],
    });
    expect(parsed.components).toBeUndefined();
  });

  it('returns null when fee year or fee page is missing', () => {
    expect(parseScsEntry({
      year: null,
      feePage: 'https://example.syd.catholic.edu.au/fees',
      data: { fees: [{ scholasticYear: 'Year K', firstChild: 3000 }] },
    })).toBeNull();
    expect(parseScsEntry({
      year: 2027,
      feePage: null,
      data: { fees: [{ scholasticYear: 'Year K', firstChild: 3000 }] },
    })).toBeNull();
  });
});
