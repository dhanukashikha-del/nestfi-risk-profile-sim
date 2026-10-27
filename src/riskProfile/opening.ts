// Which levels are open to invest, as set out in the spec
// "NESTfi Risk Profile in Learn and Invest Specs" (27 Oct 2026, rulings on the Risk Profiler Manual).
//
// Three numbers:
//   riskProfileLevel  what suits the person today, from the risk profile (shown to the person)
//   learnLevel        highest level with that level and every level below it finished
//   highestOpenLevel  the highest level the person can invest in today, with or without a warning.
//                     It never goes down.
//
// Rules:
//   Before any money is invested, every finished level up to the risk profile level opens at once.
//   Once money is invested, it moves up one level at a time, 30 days after it last moved to a
//   new level (first order or move up). Adding money at the same level never restarts the 30 days.
//   The monthly check is asked every month and holds nothing back.
//   From 13 months without the yearly review, no new level opens and money cannot move up.
//   Orders on open levels always continue.
//   If the risk profile level falls below an open level, that level stays open; investing there
//   needs a warning and the person's consent. No level above the risk profile level opens new.

export const START_LEVEL_ADULT = 1;          // configuration, adults and children: Level 1 unless changed
export const MOVE_UP_WAIT_DAYS = 30;         // configuration: days after money last moved before it moves up again
export const REVIEW_ASKED_MONTHS = 12;       // configuration: yearly review is asked
export const MOVE_UP_STOPS_MONTHS = 13;      // configuration: no new level opens, money cannot move up

export type WaitsFor =
  | 'risk profile level'
  | 'learn'
  | '30 days'
  | 'yearly review'
  | 'market fall hold'
  | '90 day wait';

export interface OpeningInput {
  riskProfileLevel: number;
  learnLevel: number;
  highestOpenLevel: number;        // 0 = nothing open yet
  heldLevel?: number;              // level the Learn and invest money sits at, 0 or missing = nothing invested
  daysSinceMoneyMoved?: number;    // days since money last moved to a new level; ignored when nothing is invested
  monthsSinceProfile: number;
  marketFallHold?: boolean;        // only once daily recording exists
  coolingOffDaysLeft?: number;     // 90 day wait after a sale or pause in a shallow fall
  startLevel?: number;
  // Kept so older callers still compile. Never gates anything.
  daysSinceLastOpened?: number;
  daysSinceLastCheck?: number;
}

export interface OpeningResult {
  highestOpenLevel: number;
  opened: boolean;                 // a level opened in this check
  consentAbove: number | null;     // open levels above this need the warning and consent; null when none
  moveUpTo: number | null;         // the level money can move up to today, null when it cannot
  nextLevel: number | null;        // the next level that is not yet available to the person's money
  waitsFor: WaitsFor[];            // empty when nothing finished is waiting
  daysUntilMoveUp: number | null;  // days left of the 30 days, or of a 90 day wait
  reviewAsked: boolean;            // 12 months reached, the yearly review is asked
  ordersAllowed: boolean;          // orders on open levels always continue
}

export function checkOpening(i: OpeningInput): OpeningResult {
  const start = i.startLevel ?? START_LEVEL_ADULT;
  const held = i.heldLevel ?? 0;
  const current = i.highestOpenLevel;
  const reviewAsked = i.monthsSinceProfile >= REVIEW_ASKED_MONTHS;

  const holds: WaitsFor[] = [];
  if (i.monthsSinceProfile >= MOVE_UP_STOPS_MONTHS) holds.push('yearly review');
  if (i.marketFallHold) holds.push('market fall hold');
  if ((i.coolingOffDaysLeft ?? 0) > 0) holds.push('90 day wait');
  const coolingDays = (i.coolingOffDaysLeft ?? 0) > 0 ? i.coolingOffDaysLeft! : null;

  const consentAbove = current > i.riskProfileLevel ? i.riskProfileLevel : null;
  const base = { consentAbove, reviewAsked, ordersAllowed: true };

  // Nothing invested yet: every finished level up to the risk profile level opens at once.
  if (held === 0) {
    const target = Math.min(i.riskProfileLevel, i.learnLevel, 15);
    const waits: WaitsFor[] = [...holds];
    if (i.riskProfileLevel < start) waits.unshift('risk profile level');
    if (i.learnLevel < start) waits.unshift('learn');
    if (target >= start && target > current && holds.length === 0) {
      return { ...base, highestOpenLevel: target, opened: true, moveUpTo: null,
        nextLevel: target < 15 ? target + 1 : null,
        waitsFor: i.learnLevel > target ? ['risk profile level'] : [],
        daysUntilMoveUp: null };
    }
    const nextLevel = current < 15 ? Math.max(current + 1, start) : null;
    const finishedAbove = i.learnLevel > current;
    if (finishedAbove && nextLevel != null && nextLevel > i.riskProfileLevel && !waits.includes('risk profile level')) {
      waits.unshift('risk profile level');
    }
    return { ...base, highestOpenLevel: current, opened: false, moveUpTo: null, nextLevel,
      waitsFor: current === 0 || finishedAbove ? waits : [], daysUntilMoveUp: coolingDays };
  }

  // Money invested: it moves up one level at a time, 30 days after it last moved.
  const next = held + 1;
  if (next > 15) {
    return { ...base, highestOpenLevel: current, opened: false, moveUpTo: null, nextLevel: null,
      waitsFor: [], daysUntilMoveUp: null };
  }
  const waits: WaitsFor[] = [];
  if (next > i.riskProfileLevel) waits.push('risk profile level');
  if (i.learnLevel < next) waits.push('learn');
  const days = i.daysSinceMoneyMoved ?? 0;
  if (days < MOVE_UP_WAIT_DAYS) waits.push('30 days');
  waits.push(...holds);

  if (waits.length === 0) {
    const highest = Math.max(current, next);
    return { ...base, highestOpenLevel: highest, opened: highest > current, moveUpTo: next,
      nextLevel: next < 15 ? next + 1 : null, waitsFor: [], daysUntilMoveUp: null };
  }
  const daysUntil = waits.includes('30 days') ? MOVE_UP_WAIT_DAYS - days : coolingDays;
  return { ...base, highestOpenLevel: current, opened: false, moveUpTo: null, nextLevel: next,
    waitsFor: i.learnLevel >= next || waits.includes('risk profile level') && i.learnLevel > held ? waits : [],
    daysUntilMoveUp: daysUntil };
}
