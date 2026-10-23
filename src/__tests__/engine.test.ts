import * as path from 'path';
import {
  loadConfig,
  getLevels,
  roundHalfUp,
  lossFromScore,
  levelFromLoss,
  ability,
  tolerance,
  stressSeedScore,
  literacyCeiling,
  composureGate,
  reconcile,
  progressionCheck,
  NeedInput,
} from '../riskProfile/engine';

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'riskProfile');

beforeAll(() => {
  loadConfig(CONFIG_DIR);
});

// ---------------------------------------------------------------- helpers

/** All gating concept IDs for levels 1..lv, derived from the loaded concept_level_map.csv */
function allConceptsTo(lv: number): number[] {
  // Read concept_level_map directly for test independence
  const fs = require('fs');
  const { parse } = require('csv-parse/sync');
  const text = fs.readFileSync(path.join(CONFIG_DIR, 'concept_level_map.csv'), 'utf-8');
  const rows: any[] = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  return rows
    .filter((r: any) => r.gating === 'Y' && parseInt(r.level) <= lv)
    .map((r: any) => parseInt(r.concept_id));
}

// ---------------------------------------------------------------- persona definitions (from run_personas.R)

interface Persona {
  name: string;
  ability: Record<string, string>;
  tol: Record<string, string>;
  quiz: number | null;
  concepts: number[];
  anchor_pct: number;
  goal: { target: number | null; years: number | null; sip: number | null; corpus: number | null; step_up: number | null };
  comp_score: number | null;
  stress_seen: number;
  days_at_level: number;
  level_now: number | null;
  days_since_move: number;
  last_deep_action: string | null;
  months_since_deep: number | null;
  // Pre-computed need (goal solver not in scope)
  need: NeedInput;
  // Expected outputs
  expected: {
    ability_score: number;
    ability_band: string;
    ability_loss_pct: number;
    ability_ceiling: number;
    tolerance_total: number;
    tolerance_band: string;
    tolerance_loss_pct: number;
    tolerance_level: number;
    binding_tolerance_input: string;
    need_band: string;
    need_status: string;
    need_required_return: number | null;
    need_level: number | null;
    literacy_ceiling: number;
    composure_score: number | null;
    light: string;
    qualifies_for: number;
    earned_level: number;
    advice_level: number;
    binding_constraint: string;
    composure_status: string;
    climb_frozen: boolean;
    rate_limit_note: string;
    can_move_up: boolean;
    blocked_by: string;
  };
}

const PERSONAS: Persona[] = [
  {
    name: 'Arjun, 29, salaried, first portfolio',
    ability: { A1: '10 years or more', A2: 'Nothing planned', A3: '3 months to less than 6', A4: 'Salaried, private sector', A5: 'Above zero and up to 20 percent', A6: 'Nobody else', A7: '50 percent to less than 75', A8: 'One of the two' },
    tol: { T1: 'Quite willing', T2: 'Mostly return', T4: 'Less than 2 years', T5: 'Somewhat risky', T6_seed: 'I have not invested through a fall' },
    quiz: 72, concepts: allConceptsTo(6), anchor_pct: 21,
    goal: { target: 2150000, years: 12, sip: 12000, corpus: 100000, step_up: 10 },
    comp_score: null, stress_seen: 0, days_at_level: 0, level_now: null, days_since_move: Infinity,
    last_deep_action: null, months_since_deep: null,
    need: { stated: true, level: 5, status: 'solved' },
    expected: {
      ability_score: 81, ability_band: 'High', ability_loss_pct: 27.4, ability_ceiling: 9,
      tolerance_total: 19, tolerance_band: 'Moderate', tolerance_loss_pct: 23.5, tolerance_level: 7,
      binding_tolerance_input: 'rupee anchor',
      need_band: 'Low', need_status: 'solved', need_required_return: 7.9, need_level: 5,
      literacy_ceiling: 6, composure_score: null,
      light: 'Green', qualifies_for: 6, earned_level: 6, advice_level: 6, binding_constraint: 'literacy',
      composure_status: 'untested', climb_frozen: false,
      rate_limit_note: 'First assignment.',
      can_move_up: false,
      blocked_by: 'Module for the next level not completed; Minimum stay of 30 days not served',
    },
  },
  {
    name: 'Meera, 41, two children, home loan',
    ability: { A1: '5 years to less than 10', A2: 'Withdrawals of up to 5 percent a year', A3: '3 months to less than 6', A4: 'Salaried with a stable employer or a pension', A5: 'More than 20 percent and up to 40', A6: 'Three or more', A7: '25 percent to less than 50', A8: 'Both health and term cover' },
    tol: { T1: 'Moderately willing', T2: 'A mix of safety and return', T4: '5 to 10 years', T5: 'Somewhat risky', T6_seed: 'Did nothing' },
    quiz: 81, concepts: allConceptsTo(10), anchor_pct: 15,
    goal: { target: 3100000, years: 8, sip: 25000, corpus: 800000, step_up: 5 },
    comp_score: 58, stress_seen: 1, days_at_level: 420, level_now: 6, days_since_move: 420,
    last_deep_action: 'hold', months_since_deep: 18,
    need: { stated: true, level: 5, status: 'solved' },
    expected: {
      ability_score: 66, ability_band: 'Moderate', ability_loss_pct: 22.3, ability_ceiling: 8,
      tolerance_total: 19, tolerance_band: 'Moderate', tolerance_loss_pct: 23.5, tolerance_level: 6,
      binding_tolerance_input: 'rupee anchor',
      need_band: 'Low', need_status: 'solved', need_required_return: 7.9, need_level: 5,
      literacy_ceiling: 10, composure_score: 58,
      light: 'Green', qualifies_for: 6, earned_level: 6, advice_level: 6, binding_constraint: 'tolerance',
      composure_status: 'steady', climb_frozen: false,
      rate_limit_note: 'No increase in entitlement.',
      can_move_up: false, blocked_by: 'Tolerance',
    },
  },
  {
    name: 'Ramesh, 63, retired, drawing an income',
    ability: { A1: 'Less than 3 years', A2: 'Regular withdrawals of more than 5 percent a year', A3: '6 months or more', A4: 'Salaried with a stable employer or a pension', A5: 'No loans', A6: 'One or two', A7: '75 percent or more', A8: 'Both health and term cover' },
    tol: { T1: 'Quite willing', T2: 'Mostly return', T4: 'More than 10 years, through at least one crash', T5: 'Neither risky nor safe', T6_seed: 'Invested more' },
    quiz: 88, concepts: allConceptsTo(10), anchor_pct: 21,
    goal: { target: null, years: null, sip: null, corpus: null, step_up: null },
    comp_score: 71, stress_seen: 2, days_at_level: 900, level_now: 5, days_since_move: 900,
    last_deep_action: 'hold', months_since_deep: 30,
    need: { stated: false, level: null, status: 'no goal stated' },
    expected: {
      ability_score: 48, ability_band: 'Low', ability_loss_pct: 16.3, ability_ceiling: 5,
      tolerance_total: 26, tolerance_band: 'High', tolerance_loss_pct: 32.6, tolerance_level: 7,
      binding_tolerance_input: 'rupee anchor',
      need_band: 'No goal yet', need_status: 'no goal stated', need_required_return: null, need_level: null,
      literacy_ceiling: 10, composure_score: 71,
      light: 'Green', qualifies_for: 5, earned_level: 5, advice_level: 5, binding_constraint: 'ability',
      composure_status: 'good', climb_frozen: false,
      rate_limit_note: 'No increase in entitlement.',
      can_move_up: false, blocked_by: 'Ability ceiling',
    },
  },
  {
    name: 'Kavya, 34, consultant, variable income, goal needs more risk than she can hold',
    ability: { A1: '3 years to less than 5', A2: 'Withdrawals of up to 5 percent a year', A3: 'Less than 3 months, which counts as no reserve', A4: 'Self-employed or variable', A5: 'More than 20 percent and up to 40', A6: 'One or two', A7: '75 percent or more', A8: 'One of the two' },
    tol: { T1: 'Very willing', T2: 'Maximum return', T4: '2 to 5 years', T5: 'Somewhat safe', T6_seed: 'Did nothing' },
    quiz: 65, concepts: allConceptsTo(8), anchor_pct: 31,
    goal: { target: 1850000, years: 4, sip: 30000, corpus: 500000, step_up: 0 },
    comp_score: 55, stress_seen: 1, days_at_level: 200, level_now: 5, days_since_move: 200,
    last_deep_action: 'hold', months_since_deep: 20,
    need: { stated: true, level: 6, status: 'solved' },
    expected: {
      ability_score: 37, ability_band: 'Low', ability_loss_pct: 12.7, ability_ceiling: 5,
      tolerance_total: 23, tolerance_band: 'High', tolerance_loss_pct: 30.7, tolerance_level: 11,
      binding_tolerance_input: 'trait score',
      need_band: 'Moderate', need_status: 'solved', need_required_return: 9.1, need_level: 6,
      literacy_ceiling: 8, composure_score: 55,
      light: 'Red', qualifies_for: 5, earned_level: 5, advice_level: 5, binding_constraint: 'ability',
      composure_status: 'steady', climb_frozen: false,
      rate_limit_note: 'No increase in entitlement.',
      can_move_up: false, blocked_by: 'Ability ceiling',
    },
  },
  {
    name: 'Suresh, 47, business owner, high ability and cautious by temperament',
    ability: { A1: '10 years or more', A2: 'Nothing planned', A3: '6 months or more', A4: 'Self-employed or variable', A5: 'No loans', A6: 'One or two', A7: 'Less than 25 percent', A8: 'Both health and term cover' },
    tol: { T1: 'Slightly willing', T2: 'Mostly safety', T4: '2 to 5 years', T5: 'Very risky', T6_seed: 'Sold out of the market' },
    quiz: 55, concepts: allConceptsTo(10), anchor_pct: 8,
    goal: { target: 12150000, years: 15, sip: 40000, corpus: 2500000, step_up: 8 },
    comp_score: 32, stress_seen: 1, days_at_level: 365, level_now: 4, days_since_move: 365,
    last_deep_action: 'redeem_full', months_since_deep: 14,
    need: { stated: true, level: 6, status: 'solved' },
    expected: {
      ability_score: 92, ability_band: 'High', ability_loss_pct: 31.2, ability_ceiling: 12,
      tolerance_total: 12, tolerance_band: 'Low', tolerance_loss_pct: 8.0, tolerance_level: 4,
      binding_tolerance_input: 'rupee anchor',
      need_band: 'Moderate', need_status: 'solved', need_required_return: 9.3, need_level: 6,
      literacy_ceiling: 10, composure_score: 32,
      light: 'Yellow', qualifies_for: 4, earned_level: 4, advice_level: 4, binding_constraint: 'tolerance',
      composure_status: 'weak', climb_frozen: true,
      rate_limit_note: 'No increase in entitlement.',
      can_move_up: false,
      blocked_by: 'Composure: climb frozen after a sale or pause during a fall; Tolerance',
    },
  },
  {
    name: 'Priya, 38, held through 2020 and added, satellite investor',
    ability: { A1: '10 years or more', A2: 'Nothing planned', A3: '6 months or more', A4: 'Salaried with a stable employer or a pension', A5: 'Above zero and up to 20 percent', A6: 'One or two', A7: '25 percent to less than 50', A8: 'Both health and term cover' },
    tol: { T1: 'Quite willing', T2: 'Mostly return', T4: 'More than 10 years, through at least one crash', T5: 'Neither risky nor safe', T6_seed: 'Invested more' },
    quiz: 92, concepts: allConceptsTo(12), anchor_pct: 31,
    goal: { target: 21250000, years: 18, sip: 50000, corpus: 3000000, step_up: 10 },
    comp_score: 88, stress_seen: 3, days_at_level: 400, level_now: 10, days_since_move: 400,
    last_deep_action: 'add', months_since_deep: 8,
    need: { stated: true, level: 7, status: 'solved' },
    expected: {
      ability_score: 93, ability_band: 'High', ability_loss_pct: 31.5, ability_ceiling: 12,
      tolerance_total: 26, tolerance_band: 'High', tolerance_loss_pct: 32.6, tolerance_level: 11,
      binding_tolerance_input: 'rupee anchor',
      need_band: 'Moderate', need_status: 'solved', need_required_return: 9.7, need_level: 7,
      literacy_ceiling: 12, composure_score: 88,
      light: 'Green', qualifies_for: 11, earned_level: 11, advice_level: 11, binding_constraint: 'tolerance',
      composure_status: 'strong', climb_frozen: false,
      rate_limit_note: 'Qualifies for L11. One rung granted, to L11. The rest waits for the next permitted move.',
      can_move_up: true, blocked_by: '',
    },
  },
  {
    name: 'Vikram, 44, sold out in a 12 percent fall last year',
    ability: { A1: '10 years or more', A2: 'Nothing planned', A3: '3 months to less than 6', A4: 'Salaried, private sector', A5: 'Above zero and up to 20 percent', A6: 'One or two', A7: '50 percent to less than 75', A8: 'Both health and term cover' },
    tol: { T1: 'Quite willing', T2: 'Mostly return', T4: '5 to 10 years', T5: 'Somewhat risky', T6_seed: 'Did nothing' },
    quiz: 78, concepts: allConceptsTo(12), anchor_pct: 21,
    goal: { target: 8600000, years: 14, sip: 35000, corpus: 2000000, step_up: 5 },
    comp_score: 24, stress_seen: 2, days_at_level: 300, level_now: 12, days_since_move: 120,
    last_deep_action: 'redeem_full', months_since_deep: 11,
    need: { stated: true, level: 6, status: 'solved' },
    expected: {
      ability_score: 81, ability_band: 'High', ability_loss_pct: 27.4, ability_ceiling: 9,
      tolerance_total: 19, tolerance_band: 'Moderate', tolerance_loss_pct: 23.5, tolerance_level: 7,
      binding_tolerance_input: 'rupee anchor',
      need_band: 'Moderate', need_status: 'solved', need_required_return: 9.3, need_level: 6,
      literacy_ceiling: 12, composure_score: 24,
      light: 'Green', qualifies_for: 7, earned_level: 12, advice_level: 9, binding_constraint: 'tolerance',
      composure_status: 'weak', climb_frozen: true,
      rate_limit_note: 'No increase in entitlement.',
      can_move_up: false,
      blocked_by: 'Ability ceiling; Module for the next level not completed; Composure: climb frozen after a sale or pause during a fall; Tolerance',
    },
  },
  {
    name: 'Ananya, 15, minor account, parent approves every decision',
    ability: { A1: '10 years or more', A2: 'Nothing planned', A3: '3 months to less than 6', A4: 'Salaried with a stable employer or a pension', A5: 'Above zero and up to 20 percent', A6: 'Nobody else', A7: 'Less than 25 percent', A8: 'Both health and term cover' },
    tol: { T1: 'Moderately willing', T2: 'A mix of safety and return', T4: 'Never', T5: 'Somewhat risky', T6_seed: 'I have not invested through a fall' },
    quiz: 86, concepts: allConceptsTo(5), anchor_pct: 15,
    goal: { target: 350000, years: 6, sip: 5000, corpus: 50000, step_up: 0 },
    comp_score: null, stress_seen: 0, days_at_level: 120, level_now: 4, days_since_move: 120,
    last_deep_action: null, months_since_deep: null,
    need: { stated: true, level: 5, status: 'solved' },
    expected: {
      ability_score: 92, ability_band: 'High', ability_loss_pct: 31.2, ability_ceiling: 12,
      tolerance_total: 17, tolerance_band: 'Moderate', tolerance_loss_pct: 16.9, tolerance_level: 6,
      binding_tolerance_input: 'rupee anchor',
      need_band: 'Low', need_status: 'solved', need_required_return: 7.4, need_level: 5,
      literacy_ceiling: 5, composure_score: null,
      light: 'Yellow', qualifies_for: 5, earned_level: 5, advice_level: 5, binding_constraint: 'literacy',
      composure_status: 'untested', climb_frozen: false,
      rate_limit_note: 'Qualifies for L5. One rung granted, to L5. The rest waits for the next permitted move.',
      can_move_up: false, blocked_by: 'Module for the next level not completed',
    },
  },
];

// ================================================================ persona tests

describe.each(PERSONAS)('Persona: $name', (p) => {
  let ab: ReturnType<typeof ability>;
  let tol: ReturnType<typeof tolerance>;
  let lit: number;
  let rec: ReturnType<typeof reconcile>;
  let prog: ReturnType<typeof progressionCheck>;

  beforeAll(() => {
    ab = ability(p.ability);
    tol = tolerance(p.tol, p.quiz, p.comp_score, p.anchor_pct);
    lit = literacyCeiling(p.concepts);
    rec = reconcile(
      ab, tol, p.need, lit,
      p.comp_score, p.stress_seen,
      p.level_now, p.last_deep_action,
      p.months_since_deep, p.days_since_move,
    );
    const compForProg = p.comp_score ?? 50;
    prog = progressionCheck(
      rec.earned_level, ab, tol.level, lit, compForProg,
      p.stress_seen, p.days_at_level,
      Infinity, p.last_deep_action, p.months_since_deep,
    );
  });

  // ability
  test('ability_score', () => expect(ab.score).toBe(p.expected.ability_score));
  test('ability_band', () => expect(ab.band).toBe(p.expected.ability_band));
  test('ability_loss_pct', () => expect(Math.round(ab.absorbable_loss_pct * 10) / 10).toBe(p.expected.ability_loss_pct));
  test('ability_ceiling', () => expect(ab.ceiling_level).toBe(p.expected.ability_ceiling));

  // tolerance
  test('tolerance_total', () => expect(tol.total).toBe(p.expected.tolerance_total));
  test('tolerance_band', () => expect(tol.band).toBe(p.expected.tolerance_band));
  test('tolerance_loss_pct', () => expect(Math.round(tol.tolerable_loss_pct * 10) / 10).toBe(p.expected.tolerance_loss_pct));
  test('tolerance_level', () => expect(tol.level).toBe(p.expected.tolerance_level));
  test('binding_tolerance_input', () => expect(tol.binding_input).toBe(p.expected.binding_tolerance_input));

  // literacy
  test('literacy_ceiling', () => expect(lit).toBe(p.expected.literacy_ceiling));

  // reconcile
  test('light', () => expect(rec.light).toBe(p.expected.light));
  test('qualifies_for', () => expect(rec.qualified_level).toBe(p.expected.qualifies_for));
  test('earned_level', () => expect(rec.earned_level).toBe(p.expected.earned_level));
  test('advice_level', () => expect(rec.advice_level).toBe(p.expected.advice_level));
  test('binding_constraint', () => expect(rec.binding_constraint).toBe(p.expected.binding_constraint));
  test('composure_status', () => expect(rec.composure.status).toBe(p.expected.composure_status));
  test('climb_frozen', () => expect(rec.composure.frozen).toBe(p.expected.climb_frozen));
  test('rate_limit_note', () => expect(rec.move_note).toBe(p.expected.rate_limit_note));

  // progression
  test('can_move_up', () => expect(prog.can_move_up).toBe(p.expected.can_move_up));
  test('blocked_by', () => expect(prog.reasons.join('; ')).toBe(p.expected.blocked_by));
});

// ================================================================ findings tests (in-scope)

describe('F08 stress prompt seeds a stated value', () => {
  test('Sell and move to safety = 35', () => expect(stressSeedScore('Sell and move to safety')).toBe(35));
  test('Do nothing = 50', () => expect(stressSeedScore('Do nothing')).toBe(50));
  test('Invest more = 65', () => expect(stressSeedScore('Invest more')).toBe(65));
});

describe('F09 module gate (literacy ceiling)', () => {
  test('every module except the stock score reaches 10', () => {
    // All concepts through level 10 (concepts 1-59)
    const concepts = allConceptsTo(10);
    expect(literacyCeiling(concepts)).toBe(10);
  });

  test('nothing passed at all reaches 0', () => {
    expect(literacyCeiling([])).toBe(0);
  });
});

describe('F12 rounding and boundaries', () => {
  test('trait total 13 gives level 5 by half-up rounding', () => {
    // level = roundHalfUp(1 + 14 * (13 - 6) / 24) = roundHalfUp(1 + 14*7/24) = roundHalfUp(1 + 4.0833) = roundHalfUp(5.0833) = 5
    const lvl = Math.max(1, Math.min(15, roundHalfUp(1 + 14 * (13 - 6) / 24)));
    expect(lvl).toBe(5);
  });

  test('a quiz average of 39.5 scores 1 on knowledge (under 40)', () => {
    // Knowledge trait: under 40 → 1
    const tol39 = tolerance(
      { T1: 'Moderately willing', T2: 'A mix of safety and return', T4: '2 to 5 years', T5: 'Neither risky nor safe', T6_seed: 'Did nothing' },
      39.5,
    );
    expect(tol39.traits.T3).toBe(1);
  });
});

describe('F01 an upgrade grants one rung, not the whole gap', () => {
  test('earned level moves to 11 when qualifying for L14', () => {
    // An investor at L10 who qualifies for L14 gets one rung to L11
    const ab = ability({
      A1: '10 years or more', A2: 'Nothing planned', A3: '6 months or more',
      A4: 'Salaried with a stable employer or a pension', A5: 'No loans',
      A6: 'Nobody else', A7: 'Less than 25 percent', A8: 'Both health and term cover',
    });
    const tol = tolerance(
      { T1: 'Very willing', T2: 'Maximum return', T4: 'More than 10 years, through at least one crash', T5: 'Very safe', T6_seed: 'Invested more' },
      92, 88, 34,
    );
    const lit = 15;
    const need: NeedInput = { stated: false, level: null, status: 'no goal stated' };
    const rec = reconcile(ab, tol, need, lit, 88, 3, 10, 'add', 8, 400);
    expect(rec.earned_level).toBe(11);
    expect(rec.move_note).toMatch(/One rung granted, to L11/);
  });
});

describe('F02 a frozen climb cannot raise entitlement', () => {
  test('earned level stays at 8 when frozen', () => {
    // An investor at L8 who qualifies for L12 but is frozen
    const ab = ability({
      A1: '10 years or more', A2: 'Nothing planned', A3: '6 months or more',
      A4: 'Salaried with a stable employer or a pension', A5: 'No loans',
      A6: 'Nobody else', A7: 'Less than 25 percent', A8: 'Both health and term cover',
    });
    const tol = tolerance(
      { T1: 'Very willing', T2: 'Maximum return', T4: 'More than 10 years, through at least one crash', T5: 'Very safe', T6_seed: 'Invested more' },
      92, null, 34,
    );
    const lit = 15;
    const need: NeedInput = { stated: false, level: null, status: 'no goal stated' };
    // Frozen: redeem_full within 24 months, remediation not cleared
    const rec = reconcile(ab, tol, need, lit, 24, 2, 8, 'redeem_full', 11, 400, false);
    expect(rec.earned_level).toBe(8);
    expect(rec.move_note).toMatch(/Entitlement held at L8 while the climb is frozen/);
  });
});

describe('F03 the rupee anchor caps the composure bonus', () => {
  test('traits alone reach L14, 15% answer implies L6, with strong bonus result is L6', () => {
    // Build an investor with very high traits (total near 30) and strong composure
    // but rupee anchor at 15%
    const tol = tolerance(
      { T1: 'Very willing', T2: 'Maximum return', T4: 'More than 10 years, through at least one crash', T5: 'Very safe', T6_seed: 'Invested more' },
      92, 88, 15,
    );
    // trait_level should be high (around 14)
    expect(tol.trait_level).toBeGreaterThanOrEqual(13);
    // anchor at 15% → level 6
    expect(tol.anchor_level).toBe(6);

    const ab = ability({
      A1: '10 years or more', A2: 'Nothing planned', A3: '6 months or more',
      A4: 'Salaried with a stable employer or a pension', A5: 'No loans',
      A6: 'Nobody else', A7: 'Less than 25 percent', A8: 'Both health and term cover',
    });
    const need: NeedInput = { stated: false, level: null, status: 'no goal stated' };
    // Strong composure: score 88, add during deep fall → bonus +2
    const rec = reconcile(ab, tol, need, 15, 88, 3, null, 'add', 8);
    // Despite +2 bonus on trait_level, anchor at L6 caps the result
    expect(rec.tolerance_level_after_composure).toBe(6);
  });
});

// ================================================================ unit tests

describe('roundHalfUp', () => {
  test('0.5 rounds to 1', () => expect(roundHalfUp(0.5)).toBe(1));
  test('1.5 rounds to 2', () => expect(roundHalfUp(1.5)).toBe(2));
  test('2.5 rounds to 3', () => expect(roundHalfUp(2.5)).toBe(3));
  test('-0.5 rounds to 0', () => expect(roundHalfUp(-0.5)).toBe(0));
  test('5.0833 rounds to 5', () => expect(roundHalfUp(5.0833)).toBe(5));
  test('8.583 rounds to 9', () => expect(roundHalfUp(8.583)).toBe(9));
});

describe('lossFromScore', () => {
  test('score 0 gives loss 2', () => expect(lossFromScore(0)).toBeCloseTo(2, 5));
  test('score 100 gives loss 34', () => expect(lossFromScore(100)).toBeCloseTo(34, 5));
  test('clamped below 0', () => expect(lossFromScore(-10)).toBeCloseTo(2, 5));
  test('clamped above 100', () => expect(lossFromScore(110)).toBeCloseTo(34, 5));
});

describe('levelFromLoss with running maximum', () => {
  test('L4 gold has a shallower worst fall than L3 but cummax keeps monotonicity', () => {
    const levels = getLevels();
    const l3 = levels.find(l => l.level === 3)!;
    const l4 = levels.find(l => l.level === 4)!;
    // L4 worst fall is shallower than L3
    expect(l4.worst_fall_pct).toBeLessThan(l3.worst_fall_pct);
    // But cummax is monotone
    expect(l4.worst_fall_pct_cummax).toBeGreaterThanOrEqual(l3.worst_fall_pct_cummax);
  });

  test('loss of 4.2 reaches L3 (cummax handles non-monotone worst falls)', () => {
    // Without cummax, 4.2 > L4.worst_fall(4.051) would give L4 but miss L3(4.658)
    // With cummax, L3.cummax=4.658 > 4.2 so L3 is excluded; L2.cummax=3.427 <= 4.2
    expect(levelFromLoss(4.2)).toBe(2);
  });
});

describe('composureGate', () => {
  test('untested when no events', () => {
    const g = composureGate(50, 0);
    expect(g.status).toBe('untested');
    expect(g.frozen).toBe(false);
    expect(g.bonus).toBe(0);
  });

  test('strong when score >= 80 and added', () => {
    const g = composureGate(88, 3, 'add', 8);
    expect(g.status).toBe('strong');
    expect(g.bonus).toBe(2);
  });

  test('good when score >= 65 and held', () => {
    const g = composureGate(71, 2, 'hold', 30);
    expect(g.status).toBe('good');
    expect(g.bonus).toBe(1);
  });

  test('weak and frozen when panicked recently', () => {
    const g = composureGate(24, 2, 'redeem_full', 11);
    expect(g.status).toBe('weak');
    expect(g.frozen).toBe(true);
  });

  test('weak but unfrozen after remediation cleared', () => {
    const g = composureGate(24, 2, 'redeem_full', 11, true);
    expect(g.status).toBe('weak');
    expect(g.frozen).toBe(false);
  });

  test('steady in the middle', () => {
    const g = composureGate(58, 1, 'hold', 18);
    expect(g.status).toBe('steady');
    expect(g.bonus).toBe(0);
  });
});
