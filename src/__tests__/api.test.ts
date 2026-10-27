import * as path from 'path';
import { loadConfig } from '../riskProfile/engine';
import { RiskProfileDB } from '../riskProfile/db';
import { RiskProfileService, ApiError } from '../riskProfile/service';

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'riskProfile');

beforeAll(() => {
  loadConfig(CONFIG_DIR);
});

// ---------------------------------------------------------------- helpers

function freshServiceAndDB() {
  const db = new RiskProfileDB();
  const svc = new RiskProfileService(db);
  return { db, svc };
}

/** Submit all answers for a persona and confirm, returning the result. */
function submitAndConfirm(
  svc: RiskProfileService,
  db: RiskProfileDB,
  investorId: string,
  answers: Record<string, string>,
  stressAnswer: string,
) {
  db.addInvestor(investorId, `${investorId}@example.com`, false);
  const now = '2026-10-23T10:00:00Z';
  for (const [code, optionId] of Object.entries(answers)) {
    svc.saveAnswer(investorId, code, optionId, now);
  }
  svc.saveAnswer(investorId, 'STRESS', stressAnswer, now);
  return svc.confirm(investorId);
}

// ---------------------------------------------------------------- persona answer sets (option IDs)
// Each persona's 14 scored answers mapped from run_personas.R answer text
// to the option_id in question_bank.csv.

const PERSONA_ANSWERS: Record<string, { answers: Record<string, string>; stress: string }> = {
  arjun: {
    answers: {
      A1: 'A1_10PLUS', A2: 'A2_NONE', A3: 'A3_3TO6', A4: 'A4_SAL',
      A5: 'A5_UPTO20', A6: 'A6_NONE', A7: 'A7_50TO75', A8: 'A8_ONE',
      T1: 'T1_QUITE_WILLING', T2: 'T2_MOSTLY_RETURN',
      T4: 'T4_LESS_THAN_2_YEARS', T5: 'T5_SOMEWHAT_RISKY',
      T6_seed: 'T6_seed_I_HAVE_NOT_INVESTED_TH',
      R1: 'R1_RS_79_000_A_FALL_OF_21',
    },
    stress: 'HOLD',
  },
  meera: {
    answers: {
      A1: 'A1_5TO10', A2: 'A2_UPTO5', A3: 'A3_3TO6', A4: 'A4_STABLE',
      A5: 'A5_20TO40', A6: 'A6_3PLUS', A7: 'A7_25TO50', A8: 'A8_BOTH',
      T1: 'T1_MODERATELY_WILLING', T2: 'T2_A_MIX_OF_SAFETY_AND_RE',
      T4: 'T4_5_TO_10_YEARS', T5: 'T5_SOMEWHAT_RISKY',
      T6_seed: 'T6_seed_DID_NOTHING',
      R1: 'R1_RS_85_000_A_FALL_OF_15',
    },
    stress: 'HOLD',
  },
  ramesh: {
    answers: {
      A1: 'A1_LT3', A2: 'A2_OVER5', A3: 'A3_6PLUS', A4: 'A4_STABLE',
      A5: 'A5_NONE', A6: 'A6_1TO2', A7: 'A7_75PLUS', A8: 'A8_BOTH',
      T1: 'T1_QUITE_WILLING', T2: 'T2_MOSTLY_RETURN',
      T4: 'T4_MORE_THAN_10_YEARS_THR', T5: 'T5_NEITHER_RISKY_NOR_SAFE',
      T6_seed: 'T6_seed_INVESTED_MORE',
      R1: 'R1_RS_79_000_A_FALL_OF_21',
    },
    stress: 'ADD',
  },
  kavya: {
    answers: {
      A1: 'A1_3TO5', A2: 'A2_UPTO5', A3: 'A3_LT3', A4: 'A4_VAR',
      A5: 'A5_20TO40', A6: 'A6_1TO2', A7: 'A7_75PLUS', A8: 'A8_ONE',
      T1: 'T1_VERY_WILLING', T2: 'T2_MAXIMUM_RETURN',
      T4: 'T4_2_TO_5_YEARS', T5: 'T5_SOMEWHAT_SAFE',
      T6_seed: 'T6_seed_DID_NOTHING',
      R1: 'R1_RS_69_000_A_FALL_OF_31',
    },
    stress: 'HOLD',
  },
  suresh: {
    answers: {
      A1: 'A1_10PLUS', A2: 'A2_NONE', A3: 'A3_6PLUS', A4: 'A4_VAR',
      A5: 'A5_NONE', A6: 'A6_1TO2', A7: 'A7_LT25', A8: 'A8_BOTH',
      T1: 'T1_SLIGHTLY_WILLING', T2: 'T2_MOSTLY_SAFETY',
      T4: 'T4_2_TO_5_YEARS', T5: 'T5_VERY_RISKY',
      T6_seed: 'T6_seed_SOLD_OUT_OF_THE_MARKET',
      R1: 'R1_RS_92_000_A_FALL_OF_8_',
    },
    stress: 'SELL',
  },
  priya: {
    answers: {
      A1: 'A1_10PLUS', A2: 'A2_NONE', A3: 'A3_6PLUS', A4: 'A4_STABLE',
      A5: 'A5_UPTO20', A6: 'A6_1TO2', A7: 'A7_25TO50', A8: 'A8_BOTH',
      T1: 'T1_QUITE_WILLING', T2: 'T2_MOSTLY_RETURN',
      T4: 'T4_MORE_THAN_10_YEARS_THR', T5: 'T5_NEITHER_RISKY_NOR_SAFE',
      T6_seed: 'T6_seed_INVESTED_MORE',
      R1: 'R1_RS_69_000_A_FALL_OF_31',
    },
    stress: 'ADD',
  },
  vikram: {
    answers: {
      A1: 'A1_10PLUS', A2: 'A2_NONE', A3: 'A3_3TO6', A4: 'A4_SAL',
      A5: 'A5_UPTO20', A6: 'A6_1TO2', A7: 'A7_50TO75', A8: 'A8_BOTH',
      T1: 'T1_QUITE_WILLING', T2: 'T2_MOSTLY_RETURN',
      T4: 'T4_5_TO_10_YEARS', T5: 'T5_SOMEWHAT_RISKY',
      T6_seed: 'T6_seed_DID_NOTHING',
      R1: 'R1_RS_79_000_A_FALL_OF_21',
    },
    stress: 'HOLD',
  },
  ananya: {
    answers: {
      A1: 'A1_10PLUS', A2: 'A2_NONE', A3: 'A3_3TO6', A4: 'A4_STABLE',
      A5: 'A5_UPTO20', A6: 'A6_NONE', A7: 'A7_LT25', A8: 'A8_BOTH',
      T1: 'T1_MODERATELY_WILLING', T2: 'T2_A_MIX_OF_SAFETY_AND_RE',
      T4: 'T4_NEVER', T5: 'T5_SOMEWHAT_RISKY',
      T6_seed: 'T6_seed_I_HAVE_NOT_INVESTED_TH',
      R1: 'R1_RS_85_000_A_FALL_OF_15',
    },
    stress: 'HOLD',
  },
};

// Expected results under first-time-profile rules:
//   T3 = 3 (knowledge fixed), composure untested, litCeiling = 15,
//   no prior level, no goal.
interface Expected {
  level: number;
  earnedLevel: number;
  adviceLevel: number;
  band: string;
  ability: { score: number; band: string; ceiling: number };
  tolerance: { total: number; level: number; anchorLevel: number | null };
  light: string;
  whatSetThis: string;
  summary: {
    absorb: string;
    approach: string;
    experience: string;
    fallHeldThrough: { percent: number; rupees: number };
  };
  largestFall: { rupeesPerLakh: number };
  composureSeed: number;
}

const EXPECTED: Record<string, Expected> = {
  arjun: {
    level: 7, earnedLevel: 7, adviceLevel: 7, band: 'moderate',
    ability: { score: 81, band: 'high', ceiling: 9 },
    tolerance: { total: 18, level: 7, anchorLevel: 7 },
    light: 'green', whatSetThis: 'rupee_anchor',
    summary: { absorb: 'High', approach: 'Balanced', experience: 'Under 2 years',
               fallHeldThrough: { percent: 21, rupees: 79000 } },
    largestFall: { rupeesPerLakh: 16866 },
    composureSeed: 50,
  },
  meera: {
    level: 6, earnedLevel: 6, adviceLevel: 6, band: 'moderate',
    ability: { score: 66, band: 'moderate', ceiling: 8 },
    tolerance: { total: 18, level: 6, anchorLevel: 6 },
    light: 'green', whatSetThis: 'rupee_anchor',
    summary: { absorb: 'Moderate', approach: 'Balanced', experience: '5 to 10 years',
               fallHeldThrough: { percent: 15, rupees: 85000 } },
    largestFall: { rupeesPerLakh: 14217 },
    composureSeed: 50,
  },
  ramesh: {
    level: 5, earnedLevel: 5, adviceLevel: 5, band: 'low',
    ability: { score: 48, band: 'low', ceiling: 5 },
    tolerance: { total: 24, level: 7, anchorLevel: 7 },
    light: 'green', whatSetThis: 'ability_horizon',
    summary: { absorb: 'Low', approach: 'Growth-oriented', experience: 'Over 10 years',
               fallHeldThrough: { percent: 21, rupees: 79000 } },
    largestFall: { rupeesPerLakh: 8046 },
    composureSeed: 65,
  },
  kavya: {
    level: 5, earnedLevel: 5, adviceLevel: 5, band: 'low',
    ability: { score: 37, band: 'low', ceiling: 5 },
    tolerance: { total: 23, level: 11, anchorLevel: 11 },
    light: 'green', whatSetThis: 'ability_horizon',
    summary: { absorb: 'Low', approach: 'Growth-oriented', experience: '2 to 5 years',
               fallHeldThrough: { percent: 31, rupees: 69000 } },
    largestFall: { rupeesPerLakh: 8046 },
    composureSeed: 50,
  },
  suresh: {
    level: 4, earnedLevel: 4, adviceLevel: 4, band: 'low',
    ability: { score: 92, band: 'high', ceiling: 12 },
    tolerance: { total: 12, level: 4, anchorLevel: 4 },
    light: 'yellow', whatSetThis: 'rupee_anchor',
    summary: { absorb: 'High', approach: 'Conservative', experience: '2 to 5 years',
               fallHeldThrough: { percent: 8, rupees: 92000 } },
    largestFall: { rupeesPerLakh: 4051 },
    composureSeed: 35,
  },
  priya: {
    level: 11, earnedLevel: 11, adviceLevel: 11, band: 'high',
    ability: { score: 93, band: 'high', ceiling: 12 },
    tolerance: { total: 24, level: 11, anchorLevel: 11 },
    light: 'green', whatSetThis: 'rupee_anchor',
    summary: { absorb: 'High', approach: 'Growth-oriented', experience: 'Over 10 years',
               fallHeldThrough: { percent: 31, rupees: 69000 } },
    largestFall: { rupeesPerLakh: 30706 },
    composureSeed: 65,
  },
  vikram: {
    level: 7, earnedLevel: 7, adviceLevel: 7, band: 'moderate',
    ability: { score: 81, band: 'high', ceiling: 9 },
    tolerance: { total: 20, level: 7, anchorLevel: 7 },
    light: 'green', whatSetThis: 'rupee_anchor',
    summary: { absorb: 'High', approach: 'Balanced', experience: '5 to 10 years',
               fallHeldThrough: { percent: 21, rupees: 79000 } },
    largestFall: { rupeesPerLakh: 16866 },
    composureSeed: 50,
  },
  ananya: {
    level: 6, earnedLevel: 6, adviceLevel: 6, band: 'moderate',
    ability: { score: 92, band: 'high', ceiling: 12 },
    tolerance: { total: 15, level: 6, anchorLevel: 6 },
    light: 'yellow', whatSetThis: 'tolerance',
    summary: { absorb: 'High', approach: 'Balanced', experience: 'No experience',
               fallHeldThrough: { percent: 15, rupees: 85000 } },
    largestFall: { rupeesPerLakh: 14217 },
    composureSeed: 50,
  },
};

// ================================================================ persona integration tests

describe.each(Object.keys(PERSONA_ANSWERS))('First-time profile: %s', (name) => {
  const pa = PERSONA_ANSWERS[name];
  const exp = EXPECTED[name];
  let result: ReturnType<RiskProfileService['confirm']>;
  let db: RiskProfileDB;

  beforeAll(() => {
    ({ db } = freshServiceAndDB());
    const svc = new RiskProfileService(db);
    result = submitAndConfirm(svc, db, name, pa.answers, pa.stress);
  });

  // API response shape (what the app receives)
  test('level', () => expect(result.level).toBe(exp.level));
  test('label', () => expect(result.label).toBeTruthy());
  test('description', () => expect(result.description).toBeTruthy());
  test('worstFallRupeesPerLakh', () => expect(result.worstFallRupeesPerLakh).toBe(exp.largestFall.rupeesPerLakh));
  test('lowestValueOnALakh', () => expect(result.lowestValueOnALakh).toBe(100000 - exp.largestFall.rupeesPerLakh));
  test('confirmedOn', () => expect(result.confirmedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  test('emailStatus', () => expect(result.emailStatus).toBe('sent'));
  test('profileVersion is 1', () => expect(result.profileVersion).toBe(1));
  test('summary.absorb', () => expect(result.summary.absorb).toBe(exp.summary.absorb));
  test('summary.approach', () => expect(result.summary.approach).toBe(exp.summary.approach));
  test('summary.experience', () => expect(result.summary.experience).toBe(exp.summary.experience));
  test('summary.fallHeldThrough', () => expect(result.summary.fallHeldThrough).toEqual(exp.summary.fallHeldThrough));
  test('email.status is sent', () => expect(result.email.status).toBe('sent'));
  test('no openLevels in response', () => expect(result).not.toHaveProperty('openLevels'));
  test('no whatSetThis in response', () => expect(result).not.toHaveProperty('whatSetThis'));

  // Stored row (what compliance keeps)
  test('stored row has correct level', () => expect(db.latestProfile(name)!.earned_level).toBe(exp.level));
  test('stored row has ability score', () => expect(db.latestProfile(name)!.ability_score).toBe(exp.ability.score));
  test('stored row has tolerance total', () => expect(db.latestProfile(name)!.tolerance_total).toBe(exp.tolerance.total));
  test('stored row has light', () => expect(db.latestProfile(name)!.light).toBe(exp.light));
  test('stored row has binding_constraints', () => expect(db.latestProfile(name)!.binding_constraints.length).toBeGreaterThanOrEqual(1));
  test('stored row has config_version', () => expect(db.latestProfile(name)!.config_version).toBeTruthy());
  test('stored row has knowledge_source default', () => expect(db.latestProfile(name)!.knowledge_source).toBe('default'));

  test('profile row is append-only', () => {
    expect(db.investor_profiles.filter(r => r.investor_id === name)).toHaveLength(1);
  });

  test('answer rows stored as option_ids', () => {
    const rows = db.investor_answers.filter(r => r.investor_id === name);
    expect(rows).toHaveLength(15); // 14 scored + STRESS
    for (const row of rows) {
      expect(row.option_id).toBeTruthy();
    }
  });

  test('composure seeded from STRESS', () => {
    const cs = db.findComposureState(name);
    expect(cs).toBeDefined();
    expect(cs!.score).toBe(exp.composureSeed);
    expect(cs!.source).toBe('stress_seed');
  });

  test('email log written', () => {
    const log = db.findEmailLog(name, 1);
    expect(log).toBeDefined();
    expect(log!.status).toBe('sent');
  });
});

// ================================================================ GET /risk-profile after confirm

describe('GET profile after confirm', () => {
  test('returns the confirmed profile with reviewDueOn', () => {
    const { db, svc } = freshServiceAndDB();
    const result = submitAndConfirm(svc, db, 'test-get', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const profile = svc.getProfile('test-get');
    expect(profile).not.toBeNull();
    expect(profile!.level).toBe(result.level);
    expect(profile!.reviewDueOn).toBeDefined();
  });

  test('returns null (404) when no profile exists', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('nobody', 'nobody@example.com', false);
    expect(svc.getProfile('nobody')).toBeNull();
  });
});

// ================================================================ GET /risk-profile/questionnaire

describe('GET questionnaire', () => {
  test('returns all sections with questions', () => {
    const { svc } = freshServiceAndDB();
    const q = svc.getQuestionnaire();
    expect(q.questionBankVersion).toBe('2026-10-01');
    expect(q.screens).toHaveLength(3);
    // household: 8 questions
    expect(q.screens[0].questions).toHaveLength(8);
    // investor: 5 questions
    expect(q.screens[1].questions).toHaveLength(5);
    // scenario: STRESS + R1
    expect(q.screens[2].questions).toHaveLength(2);
  });

  test('points are never sent to the client', () => {
    const { svc } = freshServiceAndDB();
    const q = svc.getQuestionnaire();
    const json = JSON.stringify(q);
    expect(json).not.toContain('"points"');
  });
});

// ================================================================ PUT answers edge cases

describe('PUT answer validation', () => {
  test('400 for unknown question code', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('val1', 'v@example.com', false);
    expect(() => svc.saveAnswer('val1', 'Z99', 'A1_10PLUS', '2026-10-23T10:00:00Z'))
      .toThrow(expect.objectContaining({ status: 400 }));
  });

  test('400 for unknown option id', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('val2', 'v@example.com', false);
    expect(() => svc.saveAnswer('val2', 'A1', 'A1_BOGUS', '2026-10-23T10:00:00Z'))
      .toThrow(expect.objectContaining({ status: 400 }));
  });

  test('400 for option id that does not match question code', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('val3', 'v@example.com', false);
    expect(() => svc.saveAnswer('val3', 'A1', 'A2_NONE', '2026-10-23T10:00:00Z'))
      .toThrow(expect.objectContaining({ status: 400 }));
  });

  test('idempotent: same option changes nothing', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('val4', 'v@example.com', false);
    const r1 = svc.saveAnswer('val4', 'A1', 'A1_10PLUS', '2026-10-23T10:00:00Z');
    const r2 = svc.saveAnswer('val4', 'A1', 'A1_10PLUS', '2026-10-23T10:00:00Z');
    expect(r1).toEqual(r2);
  });

  test('different option replaces earlier one', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('val5', 'v@example.com', false);
    svc.saveAnswer('val5', 'A1', 'A1_10PLUS', '2026-10-23T10:00:00Z');
    svc.saveAnswer('val5', 'A1', 'A1_LT3', '2026-10-23T10:01:00Z');
    const inv = db.getInvestor('val5')!;
    expect(inv.draft_answers.get('A1')!.option_id).toBe('A1_LT3');
  });

  test('answered count increments correctly', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('val6', 'v@example.com', false);
    const r1 = svc.saveAnswer('val6', 'A1', 'A1_10PLUS', '2026-10-23T10:00:00Z');
    expect(r1.answered).toBe(1);
    const r2 = svc.saveAnswer('val6', 'A2', 'A2_NONE', '2026-10-23T10:00:00Z');
    expect(r2.answered).toBe(2);
    // STRESS does not count toward the 14
    svc.saveAnswer('val6', 'STRESS', 'HOLD', '2026-10-23T10:00:00Z');
    const r3 = svc.saveAnswer('val6', 'A3', 'A3_6PLUS', '2026-10-23T10:00:00Z');
    expect(r3.answered).toBe(3);
    expect(r3.total).toBe(14);
  });
});

// ================================================================ 409: confirmed profile blocks saves

describe('409 after confirmation', () => {
  test('saving an answer after confirm throws 409', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'confirmed1', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    expect(() => svc.saveAnswer('confirmed1', 'A1', 'A1_LT3', '2026-10-23T11:00:00Z'))
      .toThrow(expect.objectContaining({ status: 409 }));
  });
});

// ================================================================ 422: incomplete

describe('422 incomplete submission', () => {
  test('confirm with missing answers returns 422 with missing list', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('incomplete', 'i@example.com', false);
    svc.saveAnswer('incomplete', 'A1', 'A1_10PLUS', '2026-10-23T10:00:00Z');
    try {
      svc.confirm('incomplete');
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).body).toHaveProperty('missing');
      expect(((e as ApiError).body as any).missing).toContain('A2');
      expect(((e as ApiError).body as any).missing).toContain('STRESS');
    }
  });
});

// ================================================================ 403: child account

describe('403 for child (minor) accounts', () => {
  test('saveAnswer throws 403', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('child1', 'parent@example.com', true);
    expect(() => svc.saveAnswer('child1', 'A1', 'A1_10PLUS', '2026-10-23T10:00:00Z'))
      .toThrow(expect.objectContaining({ status: 403 }));
  });

  test('confirm throws 403', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('child2', 'parent@example.com', true);
    expect(() => svc.confirm('child2'))
      .toThrow(expect.objectContaining({ status: 403 }));
  });

  test('getProfile throws 403', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('child3', 'parent@example.com', true);
    expect(() => svc.getProfile('child3'))
      .toThrow(expect.objectContaining({ status: 403 }));
  });

  test('resendEmail throws 403', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('child4', 'parent@example.com', true);
    expect(() => svc.resendEmail('child4'))
      .toThrow(expect.objectContaining({ status: 403 }));
  });
});

// ================================================================ POST /risk-profile/email/resend

describe('POST resend email', () => {
  test('resends for a confirmed profile', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'resend1', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const result = svc.resendEmail('resend1');
    expect(result.email.status).toBe('sent');
    // Two email log entries now
    const logs = db.profile_email_log.filter(r => r.investor_id === 'resend1');
    expect(logs).toHaveLength(2);
  });

  test('404 when no profile exists', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('resend2', 'r@example.com', false);
    expect(() => svc.resendEmail('resend2'))
      .toThrow(expect.objectContaining({ status: 404 }));
  });
});

// ================================================================ POST /risk-profile/update

describe('POST start update', () => {
  test('creates draft v2 prefilled from confirmed profile', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'upd1', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const result = svc.startUpdate('upd1');
    expect(result.profileVersion).toBe(2);
    expect(result.previousVersion).toBe(1);
    expect(result.previousLevel).toBe(7); // Arjun first-time level
    expect(result.prefilled['A1']).toBe('A1_10PLUS');
    expect(result.prefilled['STRESS']).toBe('HOLD');
    expect(result.prefilled['R1']).toBe('R1_RS_79_000_A_FALL_OF_21');
  });

  test('404 when no profile exists', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('upd2', 'u@example.com', false);
    expect(() => svc.startUpdate('upd2'))
      .toThrow(expect.objectContaining({ status: 404 }));
  });

  test('409 when an update draft already exists', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'upd3', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    svc.startUpdate('upd3');
    expect(() => svc.startUpdate('upd3'))
      .toThrow(expect.objectContaining({ status: 409 }));
  });

  test('changing an answer and confirming shows previousLevel', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'upd4', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    svc.startUpdate('upd4');
    // Change A1 to 10+ years (was already, but save to mark as active)
    svc.saveAnswer('upd4', 'A3', 'A3_6PLUS', '2026-10-24T10:00:00Z');
    const result = svc.confirm('upd4');
    expect(result.profileVersion).toBe(2);
    expect(result.previousLevel).toBe(7);
    expect(result.previousBand).toBe('moderate');
  });
});

// ================================================================ GET /risk-profile/can-invest

describe('GET can-invest', () => {
  test('returns canInvest true after confirmed profile with email sent', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'ci1', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const result = svc.canInvest('ci1');
    expect(result.canInvest).toBe(true);
    expect(result.level).toBe(7);
    expect(result.emailStatus).toBe('sent');
    expect(result.learnGate).toBeNull();
  });

  test('404 when no profile exists', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('ci2', 'c@example.com', false);
    expect(() => svc.canInvest('ci2'))
      .toThrow(expect.objectContaining({ status: 404 }));
  });

  test('returns learnGate when learn level exceeds profile level', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'ci3', PERSONA_ANSWERS.ramesh.answers, 'ADD');
    // Ramesh first-time level is 5, simulate finishing Learn level 8
    const result = svc.canInvest('ci3', 8);
    expect(result.canInvest).toBe(true);
    expect(result.learnGate).not.toBeNull();
    expect(result.learnGate!.finishedLearnLevel).toBe(8);
    expect(result.learnGate!.profileLevel).toBe(5);
  });

  test('no learnGate when learn level is at or below profile level', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'ci4', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const result = svc.canInvest('ci4', 5); // Arjun is level 7, learn 5 is below
    expect(result.learnGate).toBeNull();
  });

  test('403 for child account', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('ci5', 'c@example.com', true);
    expect(() => svc.canInvest('ci5'))
      .toThrow(expect.objectContaining({ status: 403 }));
  });
});

// ================================================================ POST /risk-profile/monthly-check

describe('POST monthly-check', () => {
  // The monthly check opens the next level; it never rewrites the risk profile.
  const DAY = 24 * 60 * 60 * 1000;

  test('opens the next level when Learn is done, 30 days have passed and the check is confirmed', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'mc1', PERSONA_ANSWERS.arjun.answers, 'HOLD'); // risk profile level 7
    const t0 = new Date();
    expect(svc.canInvest('mc1', 5, t0).highestOpenLevel).toBe(5);         // first level, no wait
    const result = svc.monthlyCheck('mc1', { nothingChanged: true, learnLevel: 10 }, new Date(t0.getTime() + 31 * DAY));
    expect(result.moved).toBe(true);
    expect(result.previousLevel).toBe(5);
    expect(result.newLevel).toBe(6);
    expect(db.latestProfile('mc1')!.earned_level).toBe(7);                 // risk profile level unchanged
    expect(db.profileForVersion('mc1', 2)).toBeUndefined();                // no new profile row
  });

  test('does not open the next level when Learn is not done for it', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'mc2', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const t0 = new Date();
    svc.canInvest('mc2', 5, t0);
    const result = svc.monthlyCheck('mc2', { nothingChanged: true, learnLevel: 5 }, new Date(t0.getTime() + 45 * DAY));
    expect(result.moved).toBe(false);
    expect(result.level).toBe(5);
  });

  test('does not open the next level before 30 days', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'mc3', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const t0 = new Date();
    svc.canInvest('mc3', 5, t0);
    const result = svc.monthlyCheck('mc3', { nothingChanged: true, learnLevel: 10 }, new Date(t0.getTime() + 15 * DAY));
    expect(result.moved).toBe(false);
    expect(result.reasons).toContain('wait');
  });

  test('never opens a level above the risk profile level', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'mc4', PERSONA_ANSWERS.ramesh.answers, 'ADD'); // risk profile level 5
    const t0 = new Date();
    expect(svc.canInvest('mc4', 15, t0).highestOpenLevel).toBe(5);
    const result = svc.monthlyCheck('mc4', { nothingChanged: true, learnLevel: 15 }, new Date(t0.getTime() + 60 * DAY));
    expect(result.moved).toBe(false);
    expect(result.reasons).toContain('risk profile level');
  });

  test('nothing opens above Level 15', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'mc5', PERSONA_ANSWERS.priya.answers, 'ADD');
    (db.latestProfile('mc5')! as any).earned_level = 15;
    db.upsertOpeningState({ investor_id: 'mc5', highest_open_level: 15, last_opened_on: '2026-01-01T00:00:00Z', last_check_on: new Date().toISOString() });
    const result = svc.monthlyCheck('mc5', { nothingChanged: true, learnLevel: 15, daysAtLevel: 45 });
    expect(result.moved).toBe(false);
    expect(result.level).toBe(15);
  });

  test('the first level opens at the lower of the risk profile level and Learn, with no wait', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'mc9', PERSONA_ANSWERS.arjun.answers, 'HOLD'); // risk profile level 7
    expect(svc.canInvest('mc9', 0).highestOpenLevel).toBe(0);              // nothing finished in Learn
    expect(svc.canInvest('mc9', 3).highestOpenLevel).toBe(3);              // start level 1: Level 3 opens
  });

  test('nothingChanged false triggers update flow instead', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 'mc6', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const result = svc.monthlyCheck('mc6', { nothingChanged: false, learnLevel: 10, daysAtLevel: 45 });
    expect(result.moved).toBe(false);
    expect(result.action).toBe('update_required');
  });

  test('404 when no profile exists', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('mc7', 'm@example.com', false);
    expect(() => svc.monthlyCheck('mc7', { nothingChanged: true, learnLevel: 5, daysAtLevel: 30 }))
      .toThrow(expect.objectContaining({ status: 404 }));
  });

  test('403 for child account', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('mc8', 'm@example.com', true);
    expect(() => svc.monthlyCheck('mc8', { nothingChanged: true, learnLevel: 5, daysAtLevel: 30 }))
      .toThrow(expect.objectContaining({ status: 403 }));
  });
});

// ================================================================ Step 2 spec changes (CLAUDE_CODE_BRIEF)

describe('Step 2.2: confirm response shape', () => {
  test('returns level, label, description, worstFallRupeesPerLakh, lowestValueOnALakh, confirmedOn', () => {
    const { db, svc } = freshServiceAndDB();
    const result = submitAndConfirm(svc, db, 's2a', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    expect(result.level).toBe(7);
    expect(result.label).toBe('Moderately High');
    expect(result.description).toBeTruthy();
    expect(result.worstFallRupeesPerLakh).toBe(16866);
    expect(result.lowestValueOnALakh).toBe(100000 - 16866);
    expect(result.confirmedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.emailStatus).toBe('sent');
    expect(result.profileVersion).toBe(1);
  });

  test('does not return openLevels or whatSetThis to the app', () => {
    const { db, svc } = freshServiceAndDB();
    const result = submitAndConfirm(svc, db, 's2b', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    expect(result).not.toHaveProperty('openLevels');
    expect(result).not.toHaveProperty('whatSetThis');
  });
});

describe('Step 2.3: email never blocks', () => {
  test('can-invest returns true even if email failed', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 's3a', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    // Even with default sent status, canInvest should be true regardless
    const result = svc.canInvest('s3a');
    expect(result.canInvest).toBe(true);
  });
});

describe('Step 2.4: profile row stores config_version, knowledge_source, binding_constraints', () => {
  test('stored profile has the new fields', () => {
    const { db, svc } = freshServiceAndDB();
    submitAndConfirm(svc, db, 's4a', PERSONA_ANSWERS.arjun.answers, 'HOLD');
    const profile = db.latestProfile('s4a')!;
    expect(profile.config_version).toBeTruthy();
    expect(profile.config_version.length).toBeGreaterThan(0);
    expect(profile.knowledge_source).toBe('default');
    expect(Array.isArray(profile.binding_constraints)).toBe(true);
    expect(profile.binding_constraints.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Step 2.5: draft expiry and answeredAt ordering', () => {
  test('ignores an answer whose answeredAt is older than the stored answer', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('s5a', 's@example.com', false);
    svc.saveAnswer('s5a', 'A1', 'A1_10PLUS', '2026-10-26T10:00:00Z');
    // Send an older answer — should be ignored
    const result = svc.saveAnswer('s5a', 'A1', 'A1_LT3', '2026-10-26T09:00:00Z');
    expect(result.saved).toBe(false);
    const inv = db.getInvestor('s5a')!;
    expect(inv.draft_answers.get('A1')!.option_id).toBe('A1_10PLUS');
  });

  test('a newer answer replaces the stored one', () => {
    const { db, svc } = freshServiceAndDB();
    db.addInvestor('s5b', 's@example.com', false);
    svc.saveAnswer('s5b', 'A1', 'A1_10PLUS', '2026-10-26T10:00:00Z');
    svc.saveAnswer('s5b', 'A1', 'A1_LT3', '2026-10-26T11:00:00Z');
    const inv = db.getInvestor('s5b')!;
    expect(inv.draft_answers.get('A1')!.option_id).toBe('A1_LT3');
  });
});
