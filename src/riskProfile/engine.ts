import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// ---------------------------------------------------------------- types

export interface LevelAnchor {
  level: number;
  sd_annual_pct: number;
  worst_fall_rs_per_lakh: number;
  worst_year_terminal_rs: number;
  cvar95_monthly_rs: number;
  loss_months_pct: number;
  riskometer_score: number;
  riskometer_band: string;
  new_asset_at_level: string;
  growth_share_pct: number;
  worst_fall_pct: number;
  worst_fall_pct_cummax: number;
}

interface QBankRow {
  factor: string;
  code: string;
  option_id: string;
  question: string;
  option: string;
  points: number;
  note: string;
}

export interface AbilityResult {
  score: number;
  band: 'Low' | 'Moderate' | 'High';
  absorbable_loss_pct: number;
  band_cap: number;
  ceiling_level: number;
}

export interface ToleranceResult {
  traits: { T1: number; T2: number; T3: number; T4: number; T5: number; T6: number };
  total: number;
  band: 'Low' | 'Moderate' | 'High';
  tolerable_loss_pct: number;
  trait_level: number;
  anchor_level: number | null;
  binding_input: 'rupee anchor' | 'trait score';
  level: number;
}

export interface NeedInput {
  stated: boolean;
  level: number | null;
  status: string;
  reason?: string;
}

export interface ComposureGateResult {
  bonus: number;
  status: 'untested' | 'strong' | 'good' | 'steady' | 'weak';
  frozen: boolean;
  note: string;
}

export interface ReconcileResult {
  qualified_level: number;
  earned_level: number;
  advice_level: number;
  light: 'Green' | 'Yellow' | 'Red';
  binding_constraint: 'ability' | 'tolerance' | 'literacy';
  composure: ComposureGateResult;
  move_note: string;
  tolerance_level_after_composure: number;
  notes: string[];
}

export interface ProgressionResult {
  can_move_up: boolean;
  next_level: number;
  reasons: string[];
}

// ---------------------------------------------------------------- state

let LEVELS: LevelAnchor[] = [];
let QBANK: QBankRow[] = [];
let CONCEPT_LEVELS: Map<number, number[]> = new Map();
let REMEDIATION_CONCEPTS: number[] = [];

const MOVE_INTERVAL_DAYS = 30;
const DWELL_DAYS = 30;
const ADVERSE_COOLING_OFF_DAYS = 90;
const CONFIRMATION_VALID_DAYS = 395;
const ADVERSE_ACTIONS = ['redeem_full', 'redeem_partial', 'sip_pause'];
const STRESS_SEED: Record<string, number> = {
  'Sell and move to safety': 35,
  'Do nothing': 50,
  'Invest more': 65,
};

// ---------------------------------------------------------------- CSV loading

function loadCSV(filePath: string): Record<string, string>[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

export function loadConfig(configDir: string): void {
  const levelsRaw = loadCSV(path.join(configDir, 'level_anchors.csv'));
  LEVELS = [];
  let cummax = 0;
  for (const row of levelsRaw) {
    const worst_fall_pct = parseFloat(row.worst_fall_rs_per_lakh) / 1000;
    cummax = Math.max(cummax, worst_fall_pct);
    LEVELS.push({
      level: parseInt(row.level),
      sd_annual_pct: parseFloat(row.sd_annual_pct),
      worst_fall_rs_per_lakh: parseFloat(row.worst_fall_rs_per_lakh),
      worst_year_terminal_rs: parseFloat(row.worst_year_terminal_rs),
      cvar95_monthly_rs: parseFloat(row.cvar95_monthly_rs),
      loss_months_pct: parseFloat(row.loss_months_pct),
      riskometer_score: parseFloat(row.riskometer_score),
      riskometer_band: row.riskometer_band,
      new_asset_at_level: row.new_asset_at_level,
      growth_share_pct: parseFloat(row.growth_share_pct),
      worst_fall_pct,
      worst_fall_pct_cummax: cummax,
    });
  }

  const qbankRaw = loadCSV(path.join(configDir, 'question_bank.csv'));
  QBANK = qbankRaw.map(r => ({
    factor: r.factor,
    code: r.code,
    option_id: r.option_id,
    question: r.question,
    option: r.option,
    points: parseInt(r.points),
    note: r.note || '',
  }));

  const conceptsRaw = loadCSV(path.join(configDir, 'concept_level_map.csv'));
  CONCEPT_LEVELS = new Map();
  REMEDIATION_CONCEPTS = [];
  for (const row of conceptsRaw) {
    if (row.gating !== 'Y') continue;
    const lv = parseInt(row.level);
    const cid = parseInt(row.concept_id);
    if (isNaN(lv) || lv < 1 || lv > 15) {
      throw new Error(`concept_level_map.csv has unreadable level for concept id: ${row.concept_id}`);
    }
    if (!CONCEPT_LEVELS.has(lv)) CONCEPT_LEVELS.set(lv, []);
    CONCEPT_LEVELS.get(lv)!.push(cid);
    if (row.remediation === 'Y') REMEDIATION_CONCEPTS.push(cid);
  }
}

export function getLevels(): readonly LevelAnchor[] {
  return LEVELS;
}

export function resolveOptionId(optionId: string): { factor: string; code: string; option: string; points: number } | null {
  const row = QBANK.find(r => r.option_id === optionId);
  if (!row) return null;
  return { factor: row.factor, code: row.code, option: row.option, points: row.points };
}

export function getQuestionBank(): readonly { factor: string; code: string; option_id: string; question: string; option: string; points: number }[] {
  return QBANK;
}

// ---------------------------------------------------------------- rounding: half away from zero

export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

// ---------------------------------------------------------------- loss curve

export function lossFromScore(score_0_100: number): number {
  const s = Math.min(Math.max(score_0_100, 0), 100) / 100;
  return 2 + 32 * Math.pow(s, 1.1);
}

// ---------------------------------------------------------------- level from loss (running-max lookup)

export function levelFromLoss(lossPct: number): number {
  const ok = LEVELS.filter(l => l.worst_fall_pct_cummax <= lossPct);
  if (ok.length === 0) return 1;
  return Math.max(...ok.map(l => l.level));
}

// ---------------------------------------------------------------- factor 1: ability

export function ability(answers: Record<string, string>): AbilityResult {
  const pts = (cd: string, op: string): number => {
    const row = QBANK.find(r => r.factor === 'ability' && r.code === cd && r.option === op);
    if (!row) throw new Error(`no points for ${cd} = ${op}`);
    return row.points;
  };

  const score = Object.keys(answers).reduce((sum, k) => sum + pts(k, answers[k]), 0);

  const id = (cd: string): string => {
    const row = QBANK.find(r => r.factor === 'ability' && r.code === cd && r.option === answers[cd]);
    if (!row) throw new Error(`no option id for ${cd} = ${answers[cd]}`);
    return row.option_id;
  };

  const short_horizon = ['A1_LT3', 'A1_3TO5'].includes(id('A1'));
  const drawing_down = id('A2') === 'A2_OVER5';
  const no_reserve = ['A3_NONE', 'A3_LT3'].includes(id('A3'));
  const long_horizon = id('A1') === 'A1_10PLUS';
  const no_withdrawal = id('A2') === 'A2_NONE';
  const has_reserve = ['A3_3TO6', 'A3_6PLUS'].includes(id('A3'));

  let band: 'Low' | 'Moderate' | 'High';
  if (short_horizon || (drawing_down && no_reserve)) {
    band = 'Low';
  } else if (long_horizon && no_withdrawal && has_reserve) {
    band = 'High';
  } else {
    band = 'Moderate';
  }

  const band_cap: Record<string, number> = { Low: 5, Moderate: 10, High: 15 };
  const cap = band_cap[band];

  const loss = lossFromScore(score);
  const ceiling = Math.min(levelFromLoss(loss), cap);

  return {
    score,
    band,
    absorbable_loss_pct: loss,
    band_cap: cap,
    ceiling_level: ceiling,
  };
}

// ---------------------------------------------------------------- factor 2: tolerance

export function tolerance(
  t: Record<string, string>,
  knowledgeQuizScore: number | null = null,
  composureScore: number | null = null,
  anchorLossPct: number | null = null,
  knowledgeOverride: number | null = null,
): ToleranceResult {
  const pts = (cd: string, op: string): number => {
    const row = QBANK.find(r => r.factor === 'tolerance' && r.code === cd && r.option === op);
    if (!row) throw new Error(`no points for tolerance ${cd} = ${op}`);
    return row.points;
  };

  const T1 = pts('T1', t.T1);
  const T2 = pts('T2', t.T2);
  const T4 = pts('T4', t.T4);
  const T5 = pts('T5', t.T5);

  // Knowledge: when knowledgeOverride is set, use it directly as the trait value
  // (V1 passes 3; nothing about a quiz is stored). Otherwise derive from quiz score.
  let T3: number;
  if (knowledgeOverride != null) {
    T3 = knowledgeOverride;
  } else if (knowledgeQuizScore == null) {
    T3 = 1;
  } else {
    if (knowledgeQuizScore >= 85) T3 = 5;
    else if (knowledgeQuizScore >= 70) T3 = 4;
    else if (knowledgeQuizScore >= 55) T3 = 3;
    else if (knowledgeQuizScore >= 40) T3 = 2;
    else T3 = 1;
  }

  // Composure: observed score when available, otherwise seed from T6_seed answer.
  let T6: number;
  if (composureScore != null) {
    if (composureScore >= 65) T6 = 5;
    else if (composureScore >= 40) T6 = 3;
    else T6 = 1;
  } else {
    T6 = pts('T6_seed', t.T6_seed);
  }

  const total = T1 + T2 + T3 + T4 + T5 + T6;
  let band: 'Low' | 'Moderate' | 'High';
  if (total <= 13) band = 'Low';
  else if (total <= 22) band = 'Moderate';
  else band = 'High';

  const lvl = Math.max(1, Math.min(15, roundHalfUp(1 + 14 * (total - 6) / 24)));
  const levelRow = LEVELS.find(l => l.level === lvl);
  const loss = levelRow ? levelRow.worst_fall_pct : 0;

  const anchor_level = anchorLossPct != null ? levelFromLoss(anchorLossPct) : null;
  const binding: 'rupee anchor' | 'trait score' =
    anchor_level != null && anchor_level < lvl ? 'rupee anchor' : 'trait score';
  const finalLevel = anchor_level != null ? Math.min(lvl, anchor_level) : lvl;

  return {
    traits: { T1, T2, T3, T4, T5, T6 },
    total,
    band,
    tolerable_loss_pct: loss,
    trait_level: lvl,
    anchor_level,
    binding_input: binding,
    level: finalLevel,
  };
}

// ---------------------------------------------------------------- stress seed

export function stressSeedScore(answer: string): number {
  const score = STRESS_SEED[answer];
  if (score === undefined) throw new Error(`unknown stress prompt answer: ${answer}`);
  return score;
}

// ---------------------------------------------------------------- literacy ceiling

export function literacyCeiling(conceptsPassed: number[]): number {
  const passed = new Set(conceptsPassed);
  let unlocked = 0;
  for (let lv = 1; lv <= 15; lv++) {
    const need = CONCEPT_LEVELS.get(lv) || [];
    if (need.length > 0 && !need.every(c => passed.has(c))) break;
    unlocked = lv;
  }
  return unlocked;
}

// ---------------------------------------------------------------- remediation

export function remediationDue(earnedLevel: number | null): number[] {
  const allRem: Array<{ concept_id: number; level: number }> = [];
  for (const [lv, concepts] of CONCEPT_LEVELS.entries()) {
    for (const cid of concepts) {
      if (REMEDIATION_CONCEPTS.includes(cid)) {
        allRem.push({ concept_id: cid, level: lv });
      }
    }
  }
  allRem.sort((a, b) => a.level - b.level);

  if (allRem.length === 0) throw new Error('no concept in concept_level_map.csv is flagged for remediation');

  if (earnedLevel == null) return [allRem[0].concept_id];
  const due = allRem.filter(r => r.level <= earnedLevel).map(r => r.concept_id);
  if (due.length === 0) return [allRem[0].concept_id];
  return due;
}

// ---------------------------------------------------------------- composure gate

export function composureGate(
  score: number,
  stressEventsSeen: number,
  lastDeepAction: string | null = null,
  monthsSinceDeep: number | null = null,
  remediationCleared: boolean = false,
): ComposureGateResult {
  if (stressEventsSeen < 1) {
    return {
      bonus: 0,
      status: 'untested',
      frozen: false,
      note: 'No fall observed yet. The ladder opens on ability, literacy and tolerance alone.',
    };
  }

  const panicked = lastDeepAction != null && ADVERSE_ACTIONS.includes(lastDeepAction);
  const recent = monthsSinceDeep == null || monthsSinceDeep <= 24;

  if (panicked && recent) {
    return {
      bonus: 0,
      status: 'weak',
      frozen: !remediationCleared,
      note: remediationCleared
        ? 'The last deep fall was sold or paused into. The remediation concepts have been retaken, so the climb is open again and the score carries no bonus.'
        : 'The last time the portfolio fell more than 10 percent, the investor sold or paused. The climb is frozen until the remediation concepts are retaken.',
    };
  }

  const held = lastDeepAction != null && ['hold', 'add'].includes(lastDeepAction);

  if (score >= 80 && held && lastDeepAction === 'add') {
    return {
      bonus: 2,
      status: 'strong',
      frozen: false,
      note: 'Added to the portfolio during a deep fall. Tolerance counts two rungs higher.',
    };
  }
  if (score >= 65 && held) {
    return {
      bonus: 1,
      status: 'good',
      frozen: false,
      note: 'Held through a deep fall. Tolerance counts one rung higher.',
    };
  }
  if (score <= 35) {
    return {
      bonus: 0,
      status: 'weak',
      frozen: !remediationCleared,
      note: remediationCleared
        ? 'A record of selling or pausing in falls. The remediation concepts have been retaken, so the climb is open again and the score carries no bonus.'
        : 'A record of selling or pausing in falls. The climb is frozen until the remediation concepts are retaken.',
    };
  }

  return { bonus: 0, status: 'steady', frozen: false, note: 'Ordinary pace.' };
}

// ---------------------------------------------------------------- reconcile

export function reconcile(
  ab: AbilityResult,
  tol: ToleranceResult,
  need: NeedInput,
  litCeiling: number,
  compScore: number | null = null,
  stressEventsSeen: number = 0,
  earnedLevelSoFar: number | null = null,
  lastDeepAction: string | null = null,
  monthsSinceDeep: number | null = null,
  daysSinceLastMove: number = Infinity,
  remediationCleared: boolean = false,
): ReconcileResult {
  const gate = compScore == null
    ? composureGate(50, 0)
    : composureGate(compScore, stressEventsSeen, lastDeepAction, monthsSinceDeep, remediationCleared);

  const adj = gate.bonus;

  // Composure bonus added to trait_level, then anchor caps
  let tolLevel = Math.max(1, Math.min(15, tol.trait_level + adj));
  if (tol.anchor_level != null) tolLevel = Math.min(tolLevel, tol.anchor_level);

  let light: 'Green' | 'Yellow' | 'Red' = 'Green';
  const notes: string[] = [];

  const needUnreachable = need.stated && need.level == null;

  if (need.stated && need.level != null && need.level > ab.ceiling_level) {
    light = 'Red';
    notes.push('The goal needs more risk than the household can absorb. Revise the goal, the contribution or the horizon.');
  } else if (needUnreachable) {
    light = 'Red';
    if (need.status === 'invalid inputs') {
      notes.push(`The goal cannot be read: ${need.reason}. Nothing is solved until it is corrected.`);
    } else {
      notes.push(`The goal is ${need.status}. Raise the contribution, extend the horizon or lower the target; the risk is not raised to meet it.`);
    }
  } else if (tolLevel <= ab.ceiling_level - 3) {
    light = 'Yellow';
    notes.push('Tolerance sits well below ability. Assign on tolerance and teach before any move up.');
  }

  const assigned = Math.min(ab.ceiling_level, tolLevel, litCeiling);
  const factors = [ab.ceiling_level, tolLevel, litCeiling];
  const minVal = Math.min(...factors);
  const bindingIdx = factors.indexOf(minVal);
  const binding: 'ability' | 'tolerance' | 'literacy' = (['ability', 'tolerance', 'literacy'] as const)[bindingIdx];

  let earned: number;
  let moveNote: string;

  if (earnedLevelSoFar == null) {
    earned = assigned;
    moveNote = 'First assignment.';
  } else if (assigned <= earnedLevelSoFar) {
    earned = earnedLevelSoFar;
    moveNote = 'No increase in entitlement.';
  } else if (gate.frozen) {
    earned = earnedLevelSoFar;
    moveNote = `Qualifies for L${assigned}. Entitlement held at L${earnedLevelSoFar} while the climb is frozen.`;
  } else if (daysSinceLastMove < MOVE_INTERVAL_DAYS) {
    earned = earnedLevelSoFar;
    moveNote = `Qualifies for L${assigned}. Entitlement held at L${earnedLevelSoFar} until ${MOVE_INTERVAL_DAYS} days have passed since the last move.`;
  } else {
    earned = earnedLevelSoFar + 1;
    moveNote = `Qualifies for L${assigned}. One rung granted, to L${earned}. The rest waits for the next permitted move.`;
  }

  const advice = Math.min(earned, ab.ceiling_level);

  if (gate.frozen) {
    const due = remediationDue(earned);
    const conceptList = due.length === 1
      ? `concept ${due[0]}`
      : `concepts ${due.join(' and ')}`;
    const verb = due.length === 1 ? 'has' : 'have';
    notes.push(`Progression is frozen. It reopens as soon as ${conceptList} ${verb} been retaken.`);
  }

  if (advice < earned) {
    notes.push(
      `Level L${earned} stays. Circumstances now support L${advice}, so new contributions and the next rebalance go to the L${advice} mix until that changes. Nothing is sold.`,
    );
  }

  return {
    qualified_level: assigned,
    earned_level: earned,
    advice_level: advice,
    light,
    binding_constraint: binding,
    composure: gate,
    move_note: moveNote,
    tolerance_level_after_composure: tolLevel,
    notes,
  };
}

// ---------------------------------------------------------------- progression check

export function progressionCheck(
  currentLevel: number,
  ab: AbilityResult,
  tolLevel: number,
  litCeiling: number,
  compScore: number,
  stressEventsSeen: number,
  daysAtLevel: number,
  lastNegativeEventDaysAgo: number = Infinity,
  lastDeepAction: string | null = null,
  monthsSinceDeep: number | null = null,
  daysSinceConfirmed: number = 0,
  remediationCleared: boolean = false,
): ProgressionResult {
  const nxt = currentLevel + 1;
  const reasons: string[] = [];

  if (nxt > 15) {
    return { can_move_up: false, next_level: 15, reasons: ['Already at the top of the ladder'] };
  }

  if (ab.ceiling_level < nxt) reasons.push('Ability ceiling');
  if (litCeiling < nxt) reasons.push('Module for the next level not completed');

  const gate = composureGate(compScore, stressEventsSeen, lastDeepAction, monthsSinceDeep, remediationCleared);
  if (gate.frozen) reasons.push('Composure: climb frozen after a sale or pause during a fall');
  if (tolLevel + gate.bonus < nxt) reasons.push('Tolerance');
  if (daysAtLevel < DWELL_DAYS) reasons.push(`Minimum stay of ${DWELL_DAYS} days not served`);
  if (lastNegativeEventDaysAgo < ADVERSE_COOLING_OFF_DAYS) {
    reasons.push(`A sale or pause during a fall in the last ${ADVERSE_COOLING_OFF_DAYS} days`);
  }
  if (daysSinceConfirmed >= CONFIRMATION_VALID_DAYS) {
    reasons.push('Circumstances not confirmed in the last 13 months');
  }

  return { can_move_up: reasons.length === 0, next_level: nxt, reasons };
}
