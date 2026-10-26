import * as path from 'path';
import { loadConfig, getQuestionBank } from '../riskProfile/engine';
import { RiskProfileDB } from '../riskProfile/db';
import { RiskProfileService } from '../riskProfile/service';
import { getRiskProfileStatus, checkInvestmentEntry, INVESTMENT_FLOWS } from '../riskProfile/status';

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'riskProfile');
beforeAll(() => loadConfig(CONFIG_DIR));

const CODES = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'T1', 'T2', 'T4', 'T5', 'T6_seed', 'R1'];
const NOW = '2026-10-26T10:00:00Z';

function lastOption(code: string): string {
  const rows = getQuestionBank().filter(r => r.code === code);
  return rows[rows.length - 1].option_id;
}

function setup(minor = false) {
  const db = new RiskProfileDB();
  const svc = new RiskProfileService(db);
  db.addInvestor('p1', 'p1@example.com', minor);
  return { db, svc };
}

function answerAll(svc: RiskProfileService, upTo = CODES.length) {
  for (const code of CODES.slice(0, upTo)) svc.saveAnswer('p1', code, lastOption(code), NOW);
}

describe('risk profile status', () => {
  test('not started when nothing is saved', () => {
    const { db } = setup();
    const s = getRiskProfileStatus(db, 'p1', new Date(NOW));
    expect(s.status).toBe('not_started');
    expect(s.hasConfirmedProfile).toBe(false);
    expect(s.riskProfileLevel).toBeNull();
  });

  test('in progress with a draft, and counts answers', () => {
    const { db, svc } = setup();
    answerAll(svc, 5);
    const s = getRiskProfileStatus(db, 'p1', new Date(NOW));
    expect(s.status).toBe('in_progress');
    expect(s.answeredCount).toBe(5);
  });

  test('confirmed carries level, label and review date one year on', () => {
    const { db, svc } = setup();
    answerAll(svc);
    svc.saveAnswer('p1', 'STRESS', 'HOLD', NOW);
    svc.confirm('p1');
    const s = getRiskProfileStatus(db, 'p1', new Date());
    expect(s.status).toBe('confirmed');
    expect(s.riskProfileLevel).toBeGreaterThanOrEqual(1);
    expect(s.riskProfileLevel).toBeLessThanOrEqual(15);
    expect(s.label).not.toBeNull();
    const confirmed = new Date(s.confirmedOn!);
    const due = new Date(s.reviewDueOn!);
    expect(due.getUTCFullYear() - confirmed.getUTCFullYear()).toBe(1);
  });

  test('review due after twelve months', () => {
    const { db, svc } = setup();
    answerAll(svc);
    svc.saveAnswer('p1', 'STRESS', 'HOLD', NOW);
    svc.confirm('p1');
    const later = new Date();
    later.setUTCMonth(later.getUTCMonth() + 13);
    expect(getRiskProfileStatus(db, 'p1', later).status).toBe('review_due');
  });
});

describe('investment entry gate', () => {
  test.each(INVESTMENT_FLOWS)('%s is gated until a profile is confirmed', flow => {
    const { db, svc } = setup();
    answerAll(svc, 3);
    const r = checkInvestmentEntry(db, 'p1', flow, new Date(NOW));
    expect(r.allowed).toBe(false);
    expect(r.gate).toEqual({ row: 'risk_profile', resumeAt: 4, returnTo: flow });
  });

  test.each(INVESTMENT_FLOWS)('%s opens once a profile is confirmed, with the level', flow => {
    const { db, svc } = setup();
    answerAll(svc);
    svc.saveAnswer('p1', 'STRESS', 'HOLD', NOW);
    svc.confirm('p1');
    const r = checkInvestmentEntry(db, 'p1', flow);
    expect(r.allowed).toBe(true);
    expect(r.gate).toBeNull();
    expect(r.riskProfileLevel).not.toBeNull();
  });

  test('a child is never sent to the risk profile', () => {
    const { db } = setup(true);
    const r = checkInvestmentEntry(db, 'p1', 'goals', new Date(NOW));
    expect(r.allowed).toBe(false);
    expect(r.gate).toBeNull();
  });
});
