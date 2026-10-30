import { checkOpening } from '../riskProfile/opening';

const base = { riskProfileLevel: 8, learnLevel: 6, highestOpenLevel: 0, monthsSinceConfirmed: 0 };

describe('checkOpening, not invested at the highest open level', () => {
  test('first level opens at the lower of risk profile level and Learn, no wait', () => {
    expect(checkOpening(base).highestOpenLevel).toBe(6);
    expect(checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 9 }).highestOpenLevel).toBe(5);
  });
  test('nothing opens when either number is below a configured start level', () => {
    expect(checkOpening({ ...base, learnLevel: 3, startLevel: 5 }).highestOpenLevel).toBe(0);
    expect(checkOpening({ ...base, riskProfileLevel: 3, startLevel: 5 }).waitsFor).toContain('risk profile level');
    expect(checkOpening({ ...base, learnLevel: 0 }).highestOpenLevel).toBe(0);
  });
  test('worked example: risk profile 5, Level 3 on 20 Oct, Level 4 on 25 Oct opens that day', () => {
    expect(checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 3 }).highestOpenLevel).toBe(3);
    expect(checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 4, highestOpenLevel: 3 }).highestOpenLevel).toBe(4);
  });
  test('the monthly check holds nothing back', () => {
    expect(checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, monthsSinceConfirmed: 2 }).highestOpenLevel).toBe(7);
  });
});

describe('checkOpening, invested at the highest open level', () => {
  test('invested at Level 3, Level 4 finished the same day: waits 30 days', () => {
    const r = checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 4, highestOpenLevel: 3, daysSinceFirstInvestAtHighest: 0 });
    expect(r.highestOpenLevel).toBe(3);
    expect(r.waitsFor).toEqual(['30 days']);
    expect(r.daysUntilOpens).toBe(30);
  });
  test('her example: invested at Level 3 on 20 Oct, Levels 4 and 5 finished; on 19 Nov both open', () => {
    const r = checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 5, highestOpenLevel: 3, daysSinceFirstInvestAtHighest: 30 });
    expect(r.highestOpenLevel).toBe(5);
    expect(r.opened).toBe(true);
  });
  test('never opens above the risk profile level', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 8, learnLevel: 9, daysSinceFirstInvestAtHighest: 60 });
    expect(r.opened).toBe(false);
    expect(r.waitsFor).toContain('risk profile level');
  });
  test('answers unconfirmed for 13 months hold back new levels; orders continue', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, daysSinceFirstInvestAtHighest: 60, monthsSinceConfirmed: 13 });
    expect(r.waitsFor).toContain('confirm answers');
    expect(r.ordersAllowed).toBe(true);
    const asked = checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, monthsSinceConfirmed: 1, monthsSinceProfile: 12 });
    expect(asked.reviewAsked).toBe(true);
    expect(asked.highestOpenLevel).toBe(7);
  });
  test('market fall hold and the 90 day wait hold new levels', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, daysSinceFirstInvestAtHighest: 60, marketFallHold: true, coolingOffDaysLeft: 10 });
    expect(r.waitsFor).toEqual(['market fall hold', '90 day wait']);
    expect(r.daysUntilOpens).toBe(10);
  });
});

describe('checkOpening, risk profile level falls', () => {
  test('open levels stay open; levels above need the warning and consent; nothing new opens', () => {
    const r = checkOpening({ ...base, riskProfileLevel: 6, highestOpenLevel: 8, learnLevel: 9, daysSinceFirstInvestAtHighest: 60 });
    expect(r.highestOpenLevel).toBe(8);
    expect(r.consentAbove).toBe(6);
    expect(r.opened).toBe(false);
  });
});
