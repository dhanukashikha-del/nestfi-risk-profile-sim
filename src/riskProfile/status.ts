// Risk profile status and the entry gate for investment flows.
//
// This is the one place the rest of the app asks "does this person have a
// risk profile, and what is their level?". Learn and invest, Goals and
// Build your own portfolio all call the same gate before they open.
//
// Plug-in points for the production app:
//   1. getRiskProfileStatus()  -> backs GET /api/risk-profile/status
//   2. checkInvestmentEntry()  -> call at the start of every investment flow
// The phone never decides; it reads these two answers and routes.

import { IRiskProfileStore } from './db';
import { getLevels } from './engine';

export type RiskProfileStatus =
  | 'not_started'   // no draft, no confirmed profile
  | 'in_progress'   // draft answers saved, not confirmed
  | 'confirmed'     // confirmed profile, review not yet due
  | 'review_due';   // confirmed profile older than the review period

export type InvestmentFlow = 'learn_and_invest' | 'goals' | 'build_your_own';
export const INVESTMENT_FLOWS: readonly InvestmentFlow[] = ['learn_and_invest', 'goals', 'build_your_own'];

export const TOTAL_QUESTIONS = 14;
export const REVIEW_PERIOD_MONTHS = 12;

export interface RiskProfileStatusResult {
  investorId: string;
  status: RiskProfileStatus;
  hasConfirmedProfile: boolean;
  answeredCount: number;            // draft progress, 0 when no draft
  totalQuestions: number;
  riskProfileLevel: number | null;  // the ceiling; null until confirmed
  label: string | null;             // from the level table
  confirmedOn: string | null;       // YYYY-MM-DD
  reviewDueOn: string | null;       // YYYY-MM-DD
  emailStatus: 'sent' | 'failed' | 'not_sent' | null;
  profileVersion: number | null;
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function getRiskProfileStatus(
  store: IRiskProfileStore,
  investorId: string,
  now: Date = new Date(),
): RiskProfileStatusResult {
  const inv = store.getInvestor(investorId);
  if (!inv) throw new Error(`Unknown investor ${investorId}`);

  const profile = store.latestProfile(investorId);
  const answeredCount = [...inv.draft_answers.keys()].filter(c => c !== 'STRESS').length;

  if (!profile) {
    return {
      investorId,
      status: answeredCount > 0 ? 'in_progress' : 'not_started',
      hasConfirmedProfile: false,
      answeredCount,
      totalQuestions: TOTAL_QUESTIONS,
      riskProfileLevel: null,
      label: null,
      confirmedOn: null,
      reviewDueOn: null,
      emailStatus: null,
      profileVersion: null,
    };
  }

  const reviewDue = addMonths(profile.assessed_on, REVIEW_PERIOD_MONTHS);
  const level = profile.earned_level;
  const row = getLevels().find(l => l.level === level);
  const email = store.findEmailLog(investorId, profile.profile_version);

  return {
    investorId,
    status: now >= reviewDue ? 'review_due' : 'confirmed',
    hasConfirmedProfile: true,
    answeredCount,
    totalQuestions: TOTAL_QUESTIONS,
    riskProfileLevel: level,
    label: row ? row.riskometer_band : null,
    confirmedOn: profile.assessed_on.slice(0, 10),
    reviewDueOn: reviewDue.toISOString().slice(0, 10),
    emailStatus: email ? email.status : 'not_sent',
    profileVersion: profile.profile_version,
  };
}

export interface InvestmentEntryResult {
  flow: InvestmentFlow;
  allowed: boolean;
  // When not allowed, the app opens the Set up investing sheet on this row
  // and returns to `returnTo` after the profile is confirmed.
  gate: null | { row: 'risk_profile'; resumeAt: number; returnTo: InvestmentFlow };
  riskProfileLevel: number | null;
}

export function checkInvestmentEntry(
  store: IRiskProfileStore,
  investorId: string,
  flow: InvestmentFlow,
  now: Date = new Date(),
): InvestmentEntryResult {
  if (!INVESTMENT_FLOWS.includes(flow)) throw new Error(`Unknown investment flow ${flow}`);
  const inv = store.getInvestor(investorId);
  if (!inv) throw new Error(`Unknown investor ${investorId}`);
  if (inv.is_minor) {
    // Children never take the risk profile; their flows route to Request parent.
    return { flow, allowed: false, gate: null, riskProfileLevel: null };
  }

  const s = getRiskProfileStatus(store, investorId, now);
  if (s.hasConfirmedProfile) {
    // A review that is due does not block entry in this release; it is
    // handled by the yearly re-profile flow in the next doc.
    return { flow, allowed: true, gate: null, riskProfileLevel: s.riskProfileLevel };
  }
  return {
    flow,
    allowed: false,
    gate: { row: 'risk_profile', resumeAt: s.answeredCount + 1, returnTo: flow },
    riskProfileLevel: null,
  };
}
