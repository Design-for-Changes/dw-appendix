import { buildPaperEducationExample } from './paperEducationExample.js';

describe('就学奨励費：需要額の下限による学用品のみの条件付き検算', () => {
  test('前年給与200万＋100万は全需要額を仮定せずI区分が確定', () => {
    const e = buildPaperEducationExample();
    expect(e).toMatchObject({ firstClassYen: 119570, secondClassYen: 48900, monthlyNeedFloorYen: 168470,
      annualFirstThresholdFloorYen: 3032460, annualSalarySumYen: 3000000, guaranteedSupportClass: '第1区分',
      actualMonthlyNeedYen: null, actualAnnualThresholdYen: null });
    expect(e.rows[0]).toEqual({ supportClass: '第1区分', householdExpenseYen: 11640, householdAidYen: 11640, householdNetExpenseYen: 0 });
  });
  test('対象2人で支給額と学用品の費用のみ2倍。世帯人数と需要額の下限は同じ', () => {
    const e = buildPaperEducationExample({ recipientCount: 2 });
    expect(e.monthlyNeedFloorYen).toBe(168470);
    expect(e.rows.map(r => r.householdAidYen)).toEqual([23280, 11640, 0]);
    expect(e.rows.map(r => r.householdNetExpenseYen)).toEqual([0, 11640, 23280]);
  });
  test('下限と一致してもII区分に移ったとはいえない', () => {
    const run = headSalaryYen => buildPaperEducationExample({ headSalaryYen, spouseSalaryYen: 0 });
    expect(run(3032459).firstClassGuaranteed).toBe(true);
    expect(run(3032460).guaranteedSupportClass).toBeNull();
    expect(run(9000000).guaranteedSupportClass).toBeNull();
  });
  test('単価を対象実費にすり替えない：実費8,000円と20,000円', () => {
    expect(buildPaperEducationExample({ expensePerChildYen: 8000 }).rows.map(r => r.householdAidYen)).toEqual([8000, 4000, 0]);
    expect(buildPaperEducationExample({ expensePerChildYen: 20000 }).rows.map(r => r.householdAidYen)).toEqual([11640, 5820, 0]);
  });
  test.each([{ recipientCount: 3 }, { spouseSalaryYen: -1 }, { expensePerChildYen: NaN }])('適用範囲外を拒否 %p', (input) => {
    expect(() => buildPaperEducationExample(input)).toThrow(RangeError);
  });
});
