// Which levels are open to invest, as set out in the spec
// "NESTfi Risk Profile in Learn and Invest Specs" (27 Oct 2026).
//
// Three numbers:
//   riskProfileLevel  the ceiling, from the risk profile (shown to the person)
//   learnLevel        highest level with that level and every level below it finished
//   highestOpenLevel  the highest level the person can invest in today (never shown as a number)
//
// The first level opens with no wait, at the lower of the two. After that one level
// opens at a time, when every condition below is true at the same moment.

export const START_LEVEL_ADULT = 1;          // configuration, adults and children: Level 1 unless changed
export const WAIT_DAYS = 30;                 // configuration: days at a level before the next opens
export const CHECK_VALID_DAYS = 30;          // configuration: a monthly check counts for this long
export const REVIEW_DUE_MONTHS = 12;         // configuration: yearly review due, no new level opens
export const ORDERS_STOP_MONTHS = 13;        // configuration: no order can be placed

export type WaitsFor =
  | 'risk profile level'
  | 'learn'
  | 'wait'
  | 'monthly check'
  | 'yearly review'
  | 'market fall hold'
  | '90 day wait';

export interface OpeningInput {
  riskProfileLevel: number;
  learnLevel: number;
  highestOpenLevel: number;        // 0 = nothing open yet
  daysSinceLastOpened: number;     // ignored while nothing is open
  daysSinceLastCheck: number;      // the risk profile confirm counts as a check
  monthsSinceProfile: number;
  marketFallHold?: boolean;        // only once daily recording exists
  coolingOffDaysLeft?: number;     // 90 day wait after a sale or pause in a shallow fall
  startLevel?: number;
}

export interface OpeningResult {
  highestOpenLevel: number;
  opened: boolean;                 // a level opened in this check
  closedToNewOrders: boolean;      // the risk profile level fell below the highest open level
  nextLevel: number | null;
  waitsFor: WaitsFor[];            // empty when nothing finished is waiting
  daysUntilWaitEnds: number | null;
  ordersAllowed: boolean;
}

export function checkOpening(i: OpeningInput): OpeningResult {
  const start = i.startLevel ?? START_LEVEL_ADULT;
  const ordersAllowed = i.monthsSinceProfile < ORDERS_STOP_MONTHS;
  let current = i.highestOpenLevel;
  let closed = false;

  // A falling risk profile level closes levels above it to new orders. Nothing is sold.
  if (current > i.riskProfileLevel) {
    current = i.riskProfileLevel >= start ? i.riskProfileLevel : 0;
    closed = true;
  }

  // Nothing open yet: the first level opens with no wait.
  if (current === 0) {
    const waits: WaitsFor[] = [];
    if (i.riskProfileLevel < start) waits.push('risk profile level');
    if (i.learnLevel < start) waits.push('learn');
    if (waits.length > 0 || closed) {
      return { highestOpenLevel: 0, opened: false, closedToNewOrders: closed, nextLevel: start,
        waitsFor: waits, daysUntilWaitEnds: null, ordersAllowed };
    }
    return { highestOpenLevel: Math.min(i.riskProfileLevel, i.learnLevel), opened: true,
      closedToNewOrders: false, nextLevel: null, waitsFor: [], daysUntilWaitEnds: null, ordersAllowed };
  }

  const next = current + 1;
  if (next > 15) {
    return { highestOpenLevel: current, opened: false, closedToNewOrders: closed, nextLevel: null,
      waitsFor: [], daysUntilWaitEnds: null, ordersAllowed };
  }

  // Nothing finished above the highest open level: nothing is waiting.
  const somethingFinishedAbove = i.learnLevel > current;
  const waits: WaitsFor[] = [];
  if (next > i.riskProfileLevel) waits.push('risk profile level');
  if (i.learnLevel < next) waits.push('learn');
  if (i.daysSinceLastOpened < WAIT_DAYS) waits.push('wait');
  if (i.daysSinceLastCheck >= CHECK_VALID_DAYS) waits.push('monthly check');
  if (i.monthsSinceProfile >= REVIEW_DUE_MONTHS) waits.push('yearly review');
  if (i.marketFallHold) waits.push('market fall hold');
  if ((i.coolingOffDaysLeft ?? 0) > 0) waits.push('90 day wait');

  if (waits.length === 0) {
    return { highestOpenLevel: next, opened: true, closedToNewOrders: closed, nextLevel: null,
      waitsFor: [], daysUntilWaitEnds: null, ordersAllowed };
  }
  return {
    highestOpenLevel: current,
    opened: false,
    closedToNewOrders: closed,
    nextLevel: next,
    waitsFor: somethingFinishedAbove ? waits : [],
    daysUntilWaitEnds: waits.includes('wait') ? WAIT_DAYS - i.daysSinceLastOpened : null,
    ordersAllowed,
  };
}
