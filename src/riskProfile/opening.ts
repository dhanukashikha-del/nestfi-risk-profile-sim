// Which levels are open to invest, as set out in the spec
// "NESTfi Risk Profile in Learn and Invest Specs" (27 Oct 2026): the Risk Profiler Manual,
// sections 8 to 11, with the rulings recorded in the spec's table of differences.
//
// Three numbers:
//   riskProfileLevel  what suits the person today (shown to the person)
//   learnLevel        highest level with that level and every level below it finished
//   highestOpenLevel  the highest level the person may invest in. It never goes down.
//
// Rules:
//   Before the person invests at their highest open level, a finished level up to the risk
//   profile level opens the day it is finished.
//   Once they have invested there, new levels wait 30 days from that first investment. When the
//   30 days end, every finished level up to the risk profile level opens together.
//   The monthly check holds nothing back. Answers unconfirmed for 13 months (no monthly check and
//   no review) hold back new levels until confirmed. Orders on open levels always continue.
//   If the risk profile level falls below an open level, that level stays open; investing there
//   needs the warning and consent. No new level opens while that is so.

export const START_LEVEL_ADULT = 1;          // configuration, adults and children: Level 1 unless changed
export const WAIT_AFTER_INVESTMENT_DAYS = 30; // configuration
export const REVIEW_ASKED_MONTHS = 12;       // configuration: yearly review is asked
export const STALE_ANSWERS_MONTHS = 13;      // configuration: unconfirmed answers hold back new levels

export type WaitsFor =
  | 'risk profile level'
  | 'learn'
  | '30 days'
  | 'confirm answers'
  | 'market fall hold'
  | '90 day wait';

export interface OpeningInput {
  riskProfileLevel: number;
  learnLevel: number;
  highestOpenLevel: number;            // 0 = nothing open yet
  daysSinceFirstInvestAtHighest?: number | null; // null or missing = not invested at the highest open level
  monthsSinceConfirmed: number;        // since the last monthly check, review or risk profile confirm
  monthsSinceProfile?: number;         // since the last full risk profile, for the review prompt
  marketFallHold?: boolean;            // only once daily recording exists
  coolingOffDaysLeft?: number;         // 90 day wait after a sale or pause in a shallow fall
  startLevel?: number;
}

export interface OpeningResult {
  highestOpenLevel: number;
  opened: boolean;                     // levels opened in this check
  nextLevel: number | null;            // the first level above the highest open level
  consentAbove: number | null;         // open levels above this need the warning and consent
  waitsFor: WaitsFor[];                // empty when nothing finished is waiting
  daysUntilOpens: number | null;       // days left of the 30 days, or of a 90 day wait
  reviewAsked: boolean;
  ordersAllowed: boolean;              // orders on open levels always continue
}

export function checkOpening(i: OpeningInput): OpeningResult {
  const start = i.startLevel ?? START_LEVEL_ADULT;
  const current = i.highestOpenLevel;
  const reviewAsked = (i.monthsSinceProfile ?? 0) >= REVIEW_ASKED_MONTHS;
  const consentAbove = current > i.riskProfileLevel ? i.riskProfileLevel : null;
  const base = { consentAbove, reviewAsked, ordersAllowed: true };

  const target = Math.min(i.riskProfileLevel, i.learnLevel, 15);
  const finishedAbove = i.learnLevel > current;

  const waits: WaitsFor[] = [];
  if (i.riskProfileLevel < Math.max(start, current + 1)) waits.push('risk profile level');
  if (i.learnLevel < Math.max(start, current + 1)) waits.push('learn');
  const invested = i.daysSinceFirstInvestAtHighest != null && current > 0;
  const days = i.daysSinceFirstInvestAtHighest ?? 0;
  if (invested && days < WAIT_AFTER_INVESTMENT_DAYS) waits.push('30 days');
  if (i.monthsSinceConfirmed >= STALE_ANSWERS_MONTHS) waits.push('confirm answers');
  if (i.marketFallHold) waits.push('market fall hold');
  if ((i.coolingOffDaysLeft ?? 0) > 0) waits.push('90 day wait');

  const blockers = waits.filter(w => w !== 'risk profile level' && w !== 'learn');
  if (target >= start && target > current && blockers.length === 0) {
    return { ...base, highestOpenLevel: target, opened: true, nextLevel: target < 15 ? target + 1 : null,
      waitsFor: i.learnLevel > target ? ['risk profile level'] : [], daysUntilOpens: null };
  }

  let daysUntil: number | null = null;
  if (waits.includes('30 days')) daysUntil = WAIT_AFTER_INVESTMENT_DAYS - days;
  else if ((i.coolingOffDaysLeft ?? 0) > 0) daysUntil = i.coolingOffDaysLeft!;
  return { ...base, highestOpenLevel: current, opened: false, nextLevel: current < 15 ? Math.max(current + 1, start) : null,
    waitsFor: current === 0 || finishedAbove ? waits : [], daysUntilOpens: daysUntil };
}
