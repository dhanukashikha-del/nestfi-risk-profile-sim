import express from 'express';
import path from 'path';
import { loadConfig, ability, tolerance, reconcile, stressSeedScore, resolveOptionId, NeedInput } from './riskProfile/engine';
import { RiskProfileDB } from './riskProfile/db';
import { RiskProfileService, ApiError } from './riskProfile/service';

const PORT = parseInt(process.env.PORT || '3000', 10);
const CONFIG_DIR = path.join(__dirname, '..', 'config', 'riskProfile');

loadConfig(CONFIG_DIR);

let db = new RiskProfileDB();
let svc = new RiskProfileService(db);

function seedDemoInvestor() {
  db.addInvestor('demo', 'demo@nestfi.in', false);
}
seedDemoInvestor();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'web')));

// ---- API routes

app.get('/api/risk-profile/questionnaire', (_req, res) => {
  res.json(svc.getQuestionnaire());
});

app.put('/api/risk-profile/answers/:code', (req, res) => {
  try {
    const result = svc.saveAnswer(
      'demo',
      req.params.code,
      req.body.optionId,
      req.body.answeredAt || new Date().toISOString(),
    );
    res.json(result);
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message, ...(e.body ? { details: e.body } : {}) });
    throw e;
  }
});

app.post('/api/risk-profile/confirm', (_req, res) => {
  try {
    const result = svc.confirm('demo');
    res.json(result);
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message, ...(e.body ? { details: e.body } : {}) });
    throw e;
  }
});

app.get('/api/risk-profile', (_req, res) => {
  try {
    const result = svc.getProfile('demo');
    if (!result) return res.status(404).json({ error: 'No profile yet' });
    res.json(result);
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

app.post('/api/risk-profile/email/resend', (_req, res) => {
  try {
    const result = svc.resendEmail('demo');
    res.json(result);
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// ---- Reset for reviewers

app.post('/api/reset', (_req, res) => {
  db = new RiskProfileDB();
  svc = new RiskProfileService(db);
  seedDemoInvestor();
  res.json({ reset: true });
});

// ---- Workings endpoint: returns the current engine state for the live panel

app.get('/api/workings', (_req, res) => {
  const inv = db.getInvestor('demo');
  if (!inv) return res.json({ state: 'no investor' });

  const drafts: Record<string, string> = {};
  for (const [k, v] of inv.draft_answers.entries()) drafts[k] = v.option_id;

  const composure = db.findComposureState('demo');

  // Compute a live preview from draft answers (the engine runs server-side)
  let preview: any = null;
  const abilityCodes = ['A1','A2','A3','A4','A5','A6','A7','A8'];
  const tolCodes = ['T1','T2','T4','T5','T6_seed'];
  const hasAbility = abilityCodes.every(c => drafts[c]);
  const hasTol = tolCodes.every(c => drafts[c]);

  if (hasAbility) {
    try {
      const abilityAnswers: Record<string, string> = {};
      for (const c of abilityCodes) {
        const r = resolveOptionId(drafts[c]);
        if (r) abilityAnswers[c] = r.option;
      }
      const ab = ability(abilityAnswers);

      if (hasTol && drafts['R1']) {
        const tolAnswers: Record<string, string> = {};
        for (const c of tolCodes) {
          const r = resolveOptionId(drafts[c]);
          if (r) tolAnswers[c] = r.option;
        }
        const r1 = resolveOptionId(drafts['R1']);
        const anchorPct = r1 ? r1.points : null;
        const tol = tolerance(tolAnswers, null, null, anchorPct, 3);
        const need: NeedInput = { stated: false, level: null, status: 'no goal stated' };
        const rec = reconcile(ab, tol, need, 15);

        // Derive what_set_this
        const a1Id = drafts['A1'], a2Id = drafts['A2'], a3Id = drafts['A3'];
        let whatSetThis = 'tolerance';
        if (rec.binding_constraint === 'ability') {
          if (ab.band === 'Low') {
            whatSetThis = ['A1_LT3','A1_3TO5'].includes(a1Id) ? 'ability_horizon' :
              (a2Id === 'A2_OVER5' && ['A3_NONE','A3_LT3'].includes(a3Id)) ? 'ability_withdrawals' : 'ability_horizon';
          } else { whatSetThis = 'ability_score'; }
        } else if (rec.binding_constraint === 'tolerance') {
          whatSetThis = tol.binding_input === 'rupee anchor' ? 'rupee_anchor' : 'tolerance';
        }

        preview = {
          ability_score: ab.score, ability_band: ab.band, ability_ceiling: ab.ceiling_level,
          tolerance_total: tol.total, tolerance_band: tol.band, tolerance_level: tol.level,
          anchor_level: tol.anchor_level, literacy_ceiling: null,
          qualified_level: rec.qualified_level, earned_level: rec.earned_level,
          advice_level: rec.advice_level, light: rec.light.toLowerCase(),
          binding_constraint: rec.binding_constraint, what_set_this: whatSetThis,
        };
      } else {
        // Partial: only ability computed
        preview = {
          ability_score: ab.score, ability_band: ab.band, ability_ceiling: ab.ceiling_level,
          partial: true,
        };
      }
    } catch (_) { /* incomplete answers */ }
  }

  // Also return the confirmed profile if it exists
  const confirmed = db.latestProfile('demo');

  res.json({
    drafts,
    answeredCount: Object.keys(drafts).filter(k => k !== 'STRESS').length,
    profile: preview || confirmed || null,
    composureSeed: composure?.score ?? (drafts['STRESS'] ? ({'SELL':35,'HOLD':50,'ADD':65} as any)[drafts['STRESS']] : null),
  });
});

// ---- SPA fallback

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NESTfi Risk Profile Simulator running on http://localhost:${PORT}`);
});
