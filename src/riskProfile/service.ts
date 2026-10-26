import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  loadConfig,
  getLevels,
  ability,
  tolerance,
  stressSeedScore,
  reconcile,
  progressionCheck,
  resolveOptionId,
  getQuestionBank,
  NeedInput,
} from './engine';
import { IRiskProfileStore } from './db';

const ENGINE_VERSION = '1.0.0';
const QUESTION_BANK_VERSION = '2026-10-01';
const DRAFT_MAX_AGE_DAYS = 7;

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

function computeConfigVersion(): string {
  const configDir = path.join(__dirname, '..', '..', 'config', 'riskProfile');
  try {
    const files = fs.readdirSync(configDir).sort();
    const hash = crypto.createHash('sha256');
    for (const f of files) {
      hash.update(fs.readFileSync(path.join(configDir, f)));
    }
    return hash.digest('hex').slice(0, 12);
  } catch {
    return 'unknown';
  }
}

let _configVersion: string | null = null;
function getConfigVersion(): string {
  if (!_configVersion) _configVersion = computeConfigVersion();
  return _configVersion;
}

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

    // Drop drafts older than 7 days
    if (inv.draft_answers.size > 0) {
      const oldest = [...inv.draft_answers.values()].reduce((min, v) =>
        v.answered_at < min ? v.answered_at : min, answeredAt);
      const ageMs = Date.now() - new Date(oldest).getTime();
      if (ageMs > DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
        inv.draft_answers.clear();
      }
    }

    // Ignore an answer whose answeredAt is older than the stored answer to the same question
    const existing = inv.draft_answers.get(questionCode);
    if (existing && answeredAt < existing.answered_at) {
      const answered = SCORED_CODES.filter(c => inv.draft_answers.has(c)).length;
      return { saved: false, answered, total: 14 };
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

    // Compute binding_constraints: all parts that tied for lowest
    const factors = [
      { name: 'ability', value: ab.ceiling_level },
      { name: 'tolerance', value: tol.level },
    ];
    const minValue = Math.min(...factors.map(f => f.value));
    const bindingConstraints = factors.filter(f => f.value === minValue).map(f => f.name);
    if (tol.binding_input === 'rupee anchor' && tol.level === minValue) {
      // Replace 'tolerance' with 'rupee_loss' when the anchor is what set tolerance
      const idx = bindingConstraints.indexOf('tolerance');
      if (idx >= 0) bindingConstraints[idx] = 'rupee_loss';
    }

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
      binding_constraints: bindingConstraints,
      config_version: getConfigVersion(),
      knowledge_source: 'default',
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

    // For updates (version > 1), include the previous level so the result
    // screen can show "Was Level N"
    const previousProfile = version > 1
      ? this.db.profileForVersion(investorId, version - 1)
      : null;

    return {
      profileVersion: version,
      level,
      label: levelRow.riskometer_band,
      description: (levelRow as any).description || '',
      worstFallRupeesPerLakh: levelRow.worst_fall_rs_per_lakh,
      lowestValueOnALakh: 100000 - levelRow.worst_fall_rs_per_lakh,
      confirmedOn: assessedOn.slice(0, 10),
      emailStatus,
      // Summary for the confirm preview screen
      summary: {
        absorb: ab.band,
        approach: APPROACH_LABELS[tol.band] || tol.band,
        experience: EXPERIENCE_LABELS[t4OptId] || '',
        fallHeldThrough: { percent: fallPercent, rupees: fallRupees },
      },
      email: { to: this.maskEmail(inv.email), status: emailStatus },
      ...(previousProfile ? {
        previousLevel: previousProfile.earned_level,
        previousBand: bandFromLevel(previousProfile.earned_level),
      } : {}),
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
      level,
      label: levelRow.riskometer_band,
      description: levelRow.description,
      worstFallRupeesPerLakh: levelRow.worst_fall_rs_per_lakh,
      lowestValueOnALakh: 100000 - levelRow.worst_fall_rs_per_lakh,
      confirmedOn: profile.assessed_on.slice(0, 10),
      emailStatus: emailLog?.status ?? 'not_sent',
      email: emailLog ? { to: this.maskEmail(inv.email), status: emailLog.status } : undefined,
      reviewDueOn: reviewDueOn.toISOString().slice(0, 10),
      ...(answeredSoFar !== undefined ? { answeredSoFar } : {}),
    };
  }

  // ---- 6. POST /risk-profile/update
  startUpdate(investorId: string) {
    const inv = this.guardAdult(investorId);
    const profile = this.db.latestProfile(investorId);
    if (!profile) throw new ApiError(404, 'No confirmed profile to update');
    if (inv.draft_answers.size > 0) throw new ApiError(409, 'An update draft already exists');

    // Copy all answers from the last confirmed version into drafts
    const prevAnswers = this.db.answersForVersion(investorId, profile.profile_version);
    for (const a of prevAnswers) {
      inv.draft_answers.set(a.question_code, { option_id: a.option_id, answered_at: a.answered_at });
    }

    const prefilled: Record<string, string> = {};
    for (const [k, v] of inv.draft_answers.entries()) prefilled[k] = v.option_id;

    return {
      profileVersion: profile.profile_version + 1,
      previousVersion: profile.profile_version,
      previousLevel: profile.earned_level,
      previousBand: bandFromLevel(profile.earned_level),
      prefilled,
    };
  }

  // ---- 7. GET /risk-profile/can-invest
  canInvest(investorId: string, learnLevel: number | null = null) {
    this.guardAdult(investorId);
    const profile = this.db.latestProfile(investorId);
    if (!profile) throw new ApiError(404, 'No profile yet');
    const emailLog = this.db.findEmailLog(investorId, profile.profile_version);
    const emailStatus = emailLog?.status ?? 'not_sent';
    // Email never blocks investing (Step 2.3). Keep recording the status.
    const canInvest = true;

    let learnGate = null;
    if (learnLevel != null && learnLevel > profile.earned_level) {
      learnGate = {
        finishedLearnLevel: learnLevel,
        profileLevel: profile.earned_level,
        message: `Based on your risk profile, Level ${profile.earned_level} suits you best.`,
      };
    }

    return {
      canInvest,
      level: profile.earned_level,
      earnedLevel: profile.earned_level,
      emailStatus,
      learnLevel: learnLevel,
      learnGate,
    };
  }

  // ---- 8. POST /risk-profile/monthly-check
  monthlyCheck(investorId: string, input: { nothingChanged: boolean; learnLevel: number; daysAtLevel: number }) {
    this.guardAdult(investorId);
    const profile = this.db.latestProfile(investorId);
    if (!profile) throw new ApiError(404, 'No profile yet');

    // If something changed, the investor must go through the update flow
    if (!input.nothingChanged) {
      return { moved: false, action: 'update_required' as const, level: profile.earned_level, reasons: [] };
    }

    // Re-run ability and tolerance from stored answers to get current engine state
    const answers = this.db.answersForVersion(investorId, profile.profile_version);
    const abilityAnswers: Record<string, string> = {};
    for (const a of answers) {
      if (a.question_code.startsWith('A')) {
        const r = resolveOptionId(a.option_id);
        if (r) abilityAnswers[a.question_code] = r.option;
      }
    }
    const ab = ability(abilityAnswers);

    // Tolerance level from the stored profile (no need to recompute)
    const tolLevel = profile.tolerance_level;

    // Composure
    const composure = this.db.findComposureState(investorId);
    const compScore = composure?.score ?? 50;

    // Days since last confirmed profile
    const daysSinceConfirmed = Math.floor(
      (Date.now() - new Date(profile.assessed_on).getTime()) / (1000 * 60 * 60 * 24),
    );

    // Run progression check
    const prog = progressionCheck(
      profile.earned_level,
      ab,
      tolLevel,
      input.learnLevel,   // literacy ceiling = the Learn level they've cleared
      compScore,
      0,                   // stress events seen — V1 has none
      input.daysAtLevel,
      Infinity,            // no adverse event
      null,                // no deep action
      null,                // no months since deep
      daysSinceConfirmed,
    );

    if (!prog.can_move_up) {
      return {
        moved: false,
        action: 'no_change' as const,
        level: profile.earned_level,
        nextLevel: prog.next_level,
        reasons: prog.reasons,
      };
    }

    // Grant one rung: write a new profile row with earned_level + 1
    const newLevel = profile.earned_level + 1;
    const newVersion = this.db.nextProfileVersion(investorId);
    const levels = getLevels();
    const newLevelRow = levels.find(l => l.level === newLevel)!;

    this.db.insertProfile({
      ...profile,
      profile_version: newVersion,
      assessed_on: new Date().toISOString(),
      earned_level: newLevel,
      advice_level: Math.min(newLevel, profile.ability_ceiling),
      qualified_level: newLevel,
      engine_version: ENGINE_VERSION,
      question_bank_version: QUESTION_BANK_VERSION,
    });

    // Copy answers to the new version
    for (const a of answers) {
      this.db.insertAnswer({ ...a, profile_version: newVersion });
    }

    // Send email for the new profile
    const inv = this.db.getInvestor(investorId)!;
    this.sendProfileEmail(investorId, newVersion, inv.email);

    return {
      moved: true,
      action: 'promoted' as const,
      previousLevel: profile.earned_level,
      newLevel,
      level: newLevel,
      largestFall: newLevelRow.worst_fall_rs_per_lakh,
      reasons: [],
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
