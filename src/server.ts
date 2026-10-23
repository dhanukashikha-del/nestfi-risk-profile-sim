import express from 'express';
import path from 'path';
import { loadConfig } from './riskProfile/engine';
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

  const profile = db.latestProfile('demo');
  const composure = db.findComposureState('demo');

  res.json({
    drafts,
    answeredCount: Object.keys(drafts).filter(k => k !== 'STRESS').length,
    profile: profile || null,
    composureSeed: composure?.score ?? null,
  });
});

// ---- SPA fallback

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NESTfi Risk Profile Simulator running on http://localhost:${PORT}`);
});
