import { checkOpening } from '../riskProfile/opening';

const base = { riskProfileLevel: 8, learnLevel: 6, highestOpenLevel: 0, monthsSinceProfile: 0 };

describe('checkOpening, nothing invested yet', () => {
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
  test('several finished levels open together, up to the risk profile level', () => {
    expect(checkOpening({ ...base, highestOpenLevel: 3, learnLevel: 12 }).highestOpenLevel).toBe(8);
  });
  test('the monthly check holds nothing back', () => {
    expect(checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, daysSinceLastCheck: 90 }).highestOpenLevel).toBe(7);
  });
});

describe('checkOpening, money invested', () => {
  test('invested at Level 3, Level 4 finished the same day: waits 30 days', () => {
    const r = checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 4, highestOpenLevel: 3, heldLevel: 3, daysSinceMoneyMoved: 0 });
    expect(r.highestOpenLevel).toBe(3);
    expect(r.waitsFor).toEqual(['30 days']);
    expect(r.daysUntilMoveUp).toBe(30);
  });
  test('after 30 days money can move up one level', () => {
    const r = checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 5, highestOpenLevel: 3, heldLevel: 3, daysSinceMoneyMoved: 30 });
    expect(r.moveUpTo).toBe(4);
    expect(r.highestOpenLevel).toBe(4);
  });
  test('one level at a time even with Learn far ahead', () => {
    expect(checkOpening({ ...base, learnLevel: 8, highestOpenLevel: 6, heldLevel: 6, daysSinceMoneyMoved: 90 }).moveUpTo).toBe(7);
  });
  test('levels already open stay open; moving up still waits', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 7, heldLevel: 5, learnLevel: 7, daysSinceMoneyMoved: 3 });
    expect(r.highestOpenLevel).toBe(7);
    expect(r.moveUpTo).toBeNull();
  });
  test('never moves above the risk profile level', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 8, heldLevel: 8, learnLevel: 9, daysSinceMoneyMoved: 60 });
    expect(r.moveUpTo).toBeNull();
    expect(r.waitsFor).toContain('risk profile level');
  });
  test('from 13 months money cannot move up; orders continue', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 6, heldLevel: 6, learnLevel: 7, daysSinceMoneyMoved: 60, monthsSinceProfile: 13 });
    expect(r.waitsFor).toContain('yearly review');
    expect(r.ordersAllowed).toBe(true);
    const asked = checkOpening({ ...base, highestOpenLevel: 6, heldLevel: 6, learnLevel: 7, daysSinceMoneyMoved: 60, monthsSinceProfile: 12 });
    expect(asked.reviewAsked).toBe(true);
    expect(asked.moveUpTo).toBe(7);
  });
  test('market fall hold and the 90 day wait hold moving up', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 6, heldLevel: 6, learnLevel: 7, daysSinceMoneyMoved: 60, marketFallHold: true, coolingOffDaysLeft: 10 });
    expect(r.waitsFor).toEqual(['market fall hold', '90 day wait']);
    expect(r.daysUntilMoveUp).toBe(10);
  });
});

describe('checkOpening, risk profile level falls', () => {
  test('open levels stay open; levels above need the warning and consent', () => {
    const r = checkOpening({ ...base, riskProfileLevel: 6, highestOpenLevel: 8, heldLevel: 8, learnLevel: 9, daysSinceMoneyMoved: 60 });
    expect(r.highestOpenLevel).toBe(8);
    expect(r.consentAbove).toBe(6);
    expect(r.moveUpTo).toBeNull();
  });
});
