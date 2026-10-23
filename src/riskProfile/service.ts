import {
  loadConfig,
  getLevels,
  ability,
  tolerance,
  stressSeedScore,
  reconcile,
  resolveOptionId,
  getQuestionBank,
  NeedInput,
} from './engine';
import { IRiskProfileStore } from './db';

const ENGINE_VERSION = '1.0.0';
const QUESTION_BANK_VERSION = '2026-10-01';

// The 14 scored question codes in order asked, plus the STRESS seed prompt.
const SCORED_CODES = [
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
  'T1', 'T2', 'T4', 'T5', 'T6_seed',
  'R1',
];
const STRESS_CODE = 'STRESS';
const ALL_CODES = [...SCORED_CODES, STRESS_CODE];

const STRESS_OPTIONS: Record<string, string> = {
  SELL: 'Sell and move to safety',
  HOLD: 'Do nothing',
  ADD: 'Invest more',
};

// ---------------------------------------------------------------- knowledge override
// Rule 10: Knowledge trait is fixed at 3 until Learn supplies a score.
// Passed as an explicit override; nothing about a quiz is stored for V1.
const KNOWLEDGE_OVERRIDE = 3;

// ---------------------------------------------------------------- experience labels
const EXPERIENCE_LABELS: Record<string, string> = {
  T4_NEVER: 'No experience',
  T4_LESS_THAN_2_YEARS: 'Under 2 years',
  T4_2_TO_5_YEARS: '2 to 5 years',
  T4_5_TO_10_YEARS: '5 to 10 years',
  T4_MORE_THAN_10_YEARS_THR: 'Over 10 years',
};

const APPROACH_LABELS: Record<string, string> = {
  Low: 'Conservative',
  Moderate: 'Balanced',
  High: 'Growth-oriented',
};

function bandFromLevel(level: number): string {
  if (level <= 5) return 'low';
  if (level <= 10) return 'moderate';
  return 'high';
}

// ---------------------------------------------------------------- errors

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

// ---------------------------------------------------------------- service

export class RiskProfileService {
  constructor(private db: IRiskProfileStore) {}

  // ---- 1. GET /risk-profile/questionnaire
  getQuestionnaire() {
    const qbank = getQuestionBank();
    const abilityQs = SCORED_CODES.filter(c => c.startsWith('A')).map(code => {
      const rows = qbank.filter(r => r.factor === 'ability' && r.code === code);
      return {
        code,
        text: rows[0]?.question ?? '',
        options: rows.map(r => ({ id: r.option_id, label: r.option })),
      };
    });
    const toleranceQs = ['T1', 'T2', 'T4', 'T5', 'T6_seed'].map(code => {
      const rows = qbank.filter(r => r.factor === 'tolerance' && r.code === code);
      return {
        code,
        text: rows[0]?.question ?? '',
        options: rows.map(r => ({ id: r.option_id, label: r.option })),
      };
    });
    const stressQ = {
      code: 'STRESS',
      text: 'Markets fall sharply. Your Rs 1,00,000 is now worth Rs 76,000. Nothing about the companies you hold has changed. What would you do?',
      options: Object.entries(STRESS_OPTIONS).map(([id, label]) => ({ id, label })),
    };
    const anchorQ = (() => {
      const rows = qbank.filter(r => r.factor === 'anchor' && r.code === 'R1');
      return {
        code: 'R1',
        text: rows[0]?.question ?? '',
        options: rows.map(r => ({ id: r.option_id, label: r.option })),
      };
    })();

    return {
      questionBankVersion: QUESTION_BANK_VERSION,
      screens: [
        { section: 'household', sectionTitle: 'Your household', questions: abilityQs },
        { section: 'investor', sectionTitle: 'You as an investor', questions: toleranceQs },
        { section: 'scenario', sectionTitle: 'One scenario', questions: [stressQ, anchorQ] },
      ],
    };
  }

  // ---- 2. PUT /risk-profile/answers/{questionCode}
  saveAnswer(investorId: string, questionCode: string, optionId: string, answeredAt: string) {
    const inv = this.guardAdult(investorId);

    // Reject if a profile is already confirmed and no new assessment has started.
    // Confirm clears the drafts; any save after that without a new session is a 409.
    const latest = this.db.latestProfile(investorId);
    if (latest && inv.draft_answers.size === 0) {
      throw new ApiError(409, 'Profile for this version is already confirmed. Start a new assessment.');
    }

    // Validate question code
    if (!ALL_CODES.includes(questionCode)) {
      throw new ApiError(400, `Unknown question code: ${questionCode}`);
    }

    // Validate option id
    if (questionCode === STRESS_CODE) {
      if (!STRESS_OPTIONS[optionId]) {
        throw new ApiError(400, `Unknown stress option: ${optionId}`);
      }
    } else {
      const resolved = resolveOptionId(optionId);
      if (!resolved || resolved.code !== questionCode) {
        throw new ApiError(400, `Unknown option id ${optionId} for question ${questionCode}`);
      }
    }

    // Idempotent save
    inv.draft_answers.set(questionCode, { option_id: optionId, answered_at: answeredAt });

    // Count scored answers only (STRESS excluded from the 14)
    const answered = SCORED_CODES.filter(c => inv.draft_answers.has(c)).length;

    return { saved: true, answered, total: 14 };
  }

  // ---- 3. POST /risk-profile/confirm
  confirm(investorId: string) {
    const inv = this.guardAdult(investorId);

    // Check completeness: all 14 scored + STRESS
    const missing = ALL_CODES.filter(c => !inv.draft_answers.has(c));
    if (missing.length > 0) {
      throw new ApiError(422, 'Answers incomplete', { missing });
    }

    // Resolve option ids to option texts for the engine
    const abilityAnswers: Record<string, string> = {};
    for (const code of SCORED_CODES.filter(c => c.startsWith('A'))) {
      const optId = inv.draft_answers.get(code)!.option_id;
      const resolved = resolveOptionId(optId)!;
      abilityAnswers[code] = resolved.option;
    }

    const tolAnswers: Record<string, string> = {};
    for (const code of ['T1', 'T2', 'T4', 'T5', 'T6_seed']) {
      const optId = inv.draft_answers.get(code)!.option_id;
      const resolved = resolveOptionId(optId)!;
      tolAnswers[code] = resolved.option;
    }

    // R1 anchor: points column is the loss percentage
    const r1OptId = inv.draft_answers.get('R1')!.option_id;
    const r1Resolved = resolveOptionId(r1OptId)!;
    const anchorLossPct = r1Resolved.points;

    // STRESS seed
    const stressOptId = inv.draft_answers.get(STRESS_CODE)!.option_id;
    const stressLabel = STRESS_OPTIONS[stressOptId];
    const composureSeed = stressSeedScore(stressLabel);

    // Run engine
    const ab = ability(abilityAnswers);
    // Rule 10: knowledge trait fixed at 3, no composure score, no quiz stored for V1
    const tol = tolerance(tolAnswers, null, null, anchorLossPct, KNOWLEDGE_OVERRIDE);
    // First-time: no goal, no literacy check, no prior level
    const need: NeedInput = { stated: false, level: null, status: 'no goal stated' };
    const litCeiling = 15; // teachingCeiling is null; pass 15 so it never constrains
    const rec = reconcile(ab, tol, need, litCeiling);

    // Determine whatSetThis from the answers that drove the ability band
    const a1Id = inv.draft_answers.get('A1')!.option_id;
    const a2Id = inv.draft_answers.get('A2')!.option_id;
    const a3Id = inv.draft_answers.get('A3')!.option_id;
    const whatSetThis = this.deriveWhatSetThis(ab, tol, rec.binding_constraint, a1Id, a2Id, a3Id);

    // Write profile row (append only)
    const version = this.db.nextProfileVersion(investorId);
    const assessedOn = new Date().toISOString();

    this.db.insertProfile({
      investor_id: investorId,
      profile_version: version,
      assessed_on: assessedOn,
      ability_score: ab.score,
      ability_band: ab.band,
      ability_ceiling: ab.ceiling_level,
      tolerance_total: tol.total,
      tolerance_band: tol.band,
      tolerance_level: tol.level,
      anchor_level: tol.anchor_level,
      literacy_ceiling: null,
      qualified_level: rec.qualified_level,
      earned_level: rec.earned_level,
      advice_level: rec.advice_level,
      light: rec.light.toLowerCase(),
      binding_constraint: rec.binding_constraint,
      what_set_this: whatSetThis,
      engine_version: ENGINE_VERSION,
      question_bank_version: QUESTION_BANK_VERSION,
    });

    // Write answer rows (with points, for the compliance record)
    for (const code of ALL_CODES) {
      const draft = inv.draft_answers.get(code)!;
      let points = 0;
      if (code === STRESS_CODE) {
        points = 0; // seed prompt carries no score
      } else {
        const res = resolveOptionId(draft.option_id);
        points = res ? res.points : 0;
      }
      this.db.insertAnswer({
        investor_id: investorId,
        profile_version: version,
        question_code: code,
        option_id: draft.option_id,
        points,
        answered_at: draft.answered_at,
      });
    }

    // Seed composure state
    const existing = this.db.findComposureState(investorId);
    if (!existing) {
      this.db.upsertComposureState({
        investor_id: investorId,
        score: composureSeed,
        source: 'stress_seed',
      });
    }

    // Send email (simulated)
    const emailStatus = this.sendProfileEmail(investorId, version, inv.email);

    // Clear drafts
    inv.draft_answers.clear();

    // Build response
    const level = rec.earned_level;
    const levels = getLevels();
    const levelRow = levels.find(l => l.level === level)!;
    const savedAnswers = this.db.answersForVersion(investorId, version);
    const t4OptId = savedAnswers.find(r => r.question_code === 'T4')!.option_id;

    const fallPercent = anchorLossPct;
    const fallRupees = 100000 - fallPercent * 1000;

    return {
      profileVersion: version,
      engineVersion: ENGINE_VERSION,
      band: bandFromLevel(level),
      level,
      earnedLevel: rec.earned_level,
      adviceLevel: rec.advice_level,
      ability: { score: ab.score, band: ab.band.toLowerCase(), ceiling: ab.ceiling_level },
      tolerance: { total: tol.total, level: tol.level, anchorLevel: tol.anchor_level },
      teachingCeiling: null,
      bindingConstraint: whatSetThis,
      light: rec.light.toLowerCase(),
      summary: {
        absorb: ab.band,
        approach: APPROACH_LABELS[tol.band] || tol.band,
        experience: EXPERIENCE_LABELS[t4OptId] || '',
        fallHeldThrough: { percent: fallPercent, rupees: fallRupees },
      },
      openLevels: Array.from({ length: level }, (_, i) => i + 1),
      largestFall: {
        level,
        rupeesPerLakh: levelRow.worst_fall_rs_per_lakh,
        period: '2011 to 2026',
      },
      whatSetThis,
      email: { to: this.maskEmail(inv.email), status: emailStatus },
    };
  }

  // ---- 4. GET /risk-profile
  getProfile(investorId: string) {
    this.guardAdult(investorId);
    const profile = this.db.latestProfile(investorId);
    if (!profile) return null;

    const inv = this.db.getInvestor(investorId)!;
    const levels = getLevels();
    const levelRow = levels.find(l => l.level === profile.earned_level)!;

    // Retrieve answers to build summary
    const answers = this.db.answersForVersion(investorId, profile.profile_version);
    const r1 = answers.find(a => a.question_code === 'R1');
    const t4 = answers.find(a => a.question_code === 'T4');
    const fallPercent = r1 ? r1.points : 0;
    const fallRupees = 100000 - fallPercent * 1000;

    const emailLog = this.db.findEmailLog(investorId, profile.profile_version);

    const whatSetThis = this.deriveWhatSetThisFromProfile(profile);

    const level = profile.earned_level;

    // Check for in-progress answers
    const answeredSoFar = inv.draft_answers.size > 0
      ? SCORED_CODES.filter(c => inv.draft_answers.has(c)).length
      : undefined;

    const reviewDueOn = new Date(profile.assessed_on);
    reviewDueOn.setFullYear(reviewDueOn.getFullYear() + 1);

    return {
      profileVersion: profile.profile_version,
      engineVersion: profile.engine_version,
      band: bandFromLevel(level),
      level,
      earnedLevel: profile.earned_level,
      adviceLevel: profile.advice_level,
      ability: { score: profile.ability_score, band: profile.ability_band.toLowerCase(), ceiling: profile.ability_ceiling },
      tolerance: { total: profile.tolerance_total, level: profile.tolerance_level, anchorLevel: profile.anchor_level },
      teachingCeiling: profile.literacy_ceiling,
      bindingConstraint: whatSetThis,
      light: profile.light,
      summary: {
        absorb: profile.ability_band,
        approach: APPROACH_LABELS[profile.tolerance_band] || profile.tolerance_band,
        experience: t4 ? (EXPERIENCE_LABELS[t4.option_id] || '') : '',
        fallHeldThrough: { percent: fallPercent, rupees: fallRupees },
      },
      openLevels: Array.from({ length: level }, (_, i) => i + 1),
      largestFall: {
        level,
        rupeesPerLakh: levelRow.worst_fall_rs_per_lakh,
        period: '2011 to 2026',
      },
      whatSetThis,
      email: emailLog ? { to: this.maskEmail(inv.email), status: emailLog.status } : undefined,
      reviewDueOn: reviewDueOn.toISOString().slice(0, 10),
      ...(answeredSoFar !== undefined ? { answeredSoFar } : {}),
    };
  }

  // ---- 5. POST /risk-profile/email/resend
  resendEmail(investorId: string) {
    this.guardAdult(investorId);
    const profile = this.db.latestProfile(investorId);
    if (!profile) throw new ApiError(404, 'No profile to resend');
    const inv = this.db.getInvestor(investorId)!;
    const status = this.sendProfileEmail(investorId, profile.profile_version, inv.email);
    return { email: { to: this.maskEmail(inv.email), status } };
  }

  // ---------------------------------------------------------------- helpers

  private guardAdult(investorId: string) {
    const inv = this.db.getInvestor(investorId);
    if (!inv) throw new ApiError(404, 'Investor not found');
    if (inv.is_minor) throw new ApiError(403, 'A minor is never profiled.');
    return inv;
  }

  private sendProfileEmail(investorId: string, version: number, email: string): 'sent' | 'failed' {
    // In production this calls the email provider. Here it always succeeds.
    this.db.insertEmailLog({
      investor_id: investorId,
      profile_version: version,
      sent_to: email,
      sent_at: new Date().toISOString(),
      status: 'sent',
      provider_reference: `sim-${Date.now()}`,
    });
    return 'sent';
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    if (local.length <= 2) return `${local}@${domain}`;
    return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
  }

  private deriveWhatSetThis(
    ab: ReturnType<typeof ability>,
    tol: ReturnType<typeof tolerance>,
    binding: string,
    a1Id: string,
    a2Id: string,
    a3Id: string,
  ): string {
    if (binding === 'ability') {
      if (ab.band === 'Low') {
        const shortHorizon = ['A1_LT3', 'A1_3TO5'].includes(a1Id);
        if (shortHorizon) return 'ability_horizon';
        const drawingDown = a2Id === 'A2_OVER5';
        const noReserve = ['A3_NONE', 'A3_LT3'].includes(a3Id);
        if (drawingDown && noReserve) return 'ability_withdrawals';
        return 'ability_horizon'; // fallback — should not reach here if band is Low
      }
      return 'ability_score';
    }
    if (binding === 'tolerance') {
      return tol.binding_input === 'rupee anchor' ? 'rupee_anchor' : 'tolerance';
    }
    return 'tolerance';
  }

  /** Reconstruct whatSetThis from a stored profile row (what_set_this is stored). */
  private deriveWhatSetThisFromProfile(p: { what_set_this: string }): string {
    return p.what_set_this;
  }
}
