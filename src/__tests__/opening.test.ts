import { checkOpening } from '../riskProfile/opening';

const base = { riskProfileLevel: 8, learnLevel: 6, highestOpenLevel: 0, daysSinceLastOpened: 0, daysSinceLastCheck: 0, monthsSinceProfile: 0 };

describe('checkOpening', () => {
  test('first level opens at the lower of risk profile level and Learn, no wait', () => {
    expect(checkOpening(base).highestOpenLevel).toBe(6);
    expect(checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 9 }).highestOpenLevel).toBe(5);
  });
  test('default start level is 1: Level 3 opens with risk profile level 5 and Learn at 3', () => {
    expect(checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 3 }).highestOpenLevel).toBe(3);
  });
  test('nothing opens when either number is below a configured start level', () => {
    expect(checkOpening({ ...base, learnLevel: 3, startLevel: 5 }).highestOpenLevel).toBe(0);
    expect(checkOpening({ ...base, riskProfileLevel: 3, learnLevel: 9, startLevel: 5 }).highestOpenLevel).toBe(0);
    expect(checkOpening({ ...base, riskProfileLevel: 3, startLevel: 5 }).waitsFor).toContain('risk profile level');
    expect(checkOpening({ ...base, learnLevel: 0 }).highestOpenLevel).toBe(0);
  });
  test('a finished level opens at once, with no wait between levels', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, daysSinceLastOpened: 1, daysSinceLastCheck: 5 });
    expect(r.opened).toBe(true);
    expect(r.highestOpenLevel).toBe(7);
  });
  test('several finished levels open together, up to the risk profile level', () => {
    expect(checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 8, daysSinceLastOpened: 2 }).highestOpenLevel).toBe(8);
    expect(checkOpening({ ...base, highestOpenLevel: 3, learnLevel: 12, daysSinceLastOpened: 0 }).highestOpenLevel).toBe(8);
  });
  test('worked example: risk profile 5, Level 3 on 20 Oct, Level 4 on 25 Oct opens that day', () => {
    const first = checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 3 });
    expect(first.highestOpenLevel).toBe(3);
    const next = checkOpening({ ...base, riskProfileLevel: 5, learnLevel: 4, highestOpenLevel: 3, daysSinceLastOpened: 5, daysSinceLastCheck: 5 });
    expect(next.highestOpenLevel).toBe(4);
  });
  test('waits for the monthly check after 30 days without one', () => {
    expect(checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, daysSinceLastOpened: 1, daysSinceLastCheck: 30 }).waitsFor).toEqual(['monthly check']);
  });
  test('never opens above the risk profile level', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 8, learnLevel: 9, daysSinceLastOpened: 60 });
    expect(r.opened).toBe(false);
    expect(r.waitsFor).toContain('risk profile level');
  });
  test('yearly review due stops new levels; orders stop at 13 months', () => {
    const due = checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, daysSinceLastOpened: 60, monthsSinceProfile: 12 });
    expect(due.waitsFor).toContain('yearly review');
    expect(due.ordersAllowed).toBe(true);
    expect(checkOpening({ ...base, highestOpenLevel: 6, monthsSinceProfile: 13 }).ordersAllowed).toBe(false);
  });
  test('market fall hold and the 90 day wait hold the next level', () => {
    const r = checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 7, daysSinceLastOpened: 60, marketFallHold: true, coolingOffDaysLeft: 10 });
    expect(r.waitsFor).toEqual(['market fall hold', '90 day wait']);
    expect(r.daysUntilWaitEnds).toBe(10);
  });
  test('nothing waiting when nothing is finished above the highest open level', () => {
    expect(checkOpening({ ...base, highestOpenLevel: 6, learnLevel: 6, daysSinceLastOpened: 5 }).waitsFor).toEqual([]);
  });
  test('a falling risk profile level closes levels above it to new orders', () => {
    const r = checkOpening({ ...base, riskProfileLevel: 6, highestOpenLevel: 8, learnLevel: 9, daysSinceLastOpened: 60 });
    expect(r.closedToNewOrders).toBe(true);
    expect(r.highestOpenLevel).toBe(6);
  });
});
