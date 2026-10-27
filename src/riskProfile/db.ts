// Database interface and types for the risk-profile tables.
// Two implementations: InMemoryStore (tests) and PgStore (production).

export interface InvestorProfileRow {
  investor_id: string;
  profile_version: number;
  assessed_on: string;
  ability_score: number;
  ability_band: string;
  ability_ceiling: number;
  tolerance_total: number;
  tolerance_band: string;
  tolerance_level: number;
  anchor_level: number | null;
  literacy_ceiling: number | null;
  qualified_level: number;
  earned_level: number;
  advice_level: number;
  light: string;
  binding_constraint: string;
  what_set_this: string;
  binding_constraints: string[];    // all parts that tied for lowest
  config_version: string;           // hash of config files
  knowledge_source: string;         // "default" for V1
  engine_version: string;
  question_bank_version: string;
}

export interface InvestorAnswerRow {
  investor_id: string;
  profile_version: number;
  question_code: string;
  option_id: string;
  points: number;
  answered_at: string;
}

export interface ProfileEmailLogRow {
  investor_id: string;
  profile_version: number;
  sent_to: string;
  sent_at: string;
  status: 'sent' | 'failed';
  provider_reference: string | null;
}

export interface ComposureStateRow {
  investor_id: string;
  score: number;
  source: 'stress_seed';
}

// Which levels are open to invest. One row per person (or child's portfolio).
export interface OpeningStateRow {
  investor_id: string;
  highest_open_level: number;     // 0 = nothing open
  last_opened_on: string | null;  // ISO date of the last opening
  last_check_on: string;          // ISO date of the last monthly check (risk profile confirm counts)
}

// Written once per opening, never edited.
export interface LevelOpeningRow {
  investor_id: string;
  opened_on: string;
  level_before: number;
  level_after: number;
  risk_profile_version: number;
}

// Written once per monthly check, never edited.
export interface MonthlyCheckRow {
  investor_id: string;
  checked_on: string;
  nothing_changed: boolean;
  risk_profile_version: number;
}

export interface InvestorRecord {
  id: string;
  is_minor: boolean;
  email: string;
  draft_answers: Map<string, { option_id: string; answered_at: string }>;
}

// ---------------------------------------------------------------- interface

export interface IRiskProfileStore {
  addInvestor(id: string, email: string, isMinor: boolean): void;
  getInvestor(id: string): InvestorRecord | undefined;
  latestProfile(investorId: string): InvestorProfileRow | undefined;
  nextProfileVersion(investorId: string): number;
  answersForVersion(investorId: string, version: number): InvestorAnswerRow[];
  insertProfile(row: InvestorProfileRow): void;
  insertAnswer(row: InvestorAnswerRow): void;
  insertEmailLog(row: ProfileEmailLogRow): void;
  findEmailLog(investorId: string, version: number): ProfileEmailLogRow | undefined;
  profileForVersion(investorId: string, version: number): InvestorProfileRow | undefined;
  findComposureState(investorId: string): ComposureStateRow | undefined;
  upsertComposureState(row: ComposureStateRow): void;
  findOpeningState(investorId: string): OpeningStateRow | undefined;
  upsertOpeningState(row: OpeningStateRow): void;
  insertLevelOpening(row: LevelOpeningRow): void;
  insertMonthlyCheck(row: MonthlyCheckRow): void;
}

// ---------------------------------------------------------------- in-memory implementation (tests)

export class RiskProfileDB implements IRiskProfileStore {
  investor_profiles: InvestorProfileRow[] = [];
  investor_answers: InvestorAnswerRow[] = [];
  profile_email_log: ProfileEmailLogRow[] = [];
  composure_state: ComposureStateRow[] = [];
  // created empty per API_CONTRACT.md
  composure_events: never[] = [];
  concept_progress: never[] = [];
  advice_overrides: never[] = [];
  investors: Map<string, InvestorRecord> = new Map();

  addInvestor(id: string, email: string, isMinor: boolean): void {
    this.investors.set(id, { id, is_minor: isMinor, email, draft_answers: new Map() });
  }

  getInvestor(id: string): InvestorRecord | undefined {
    return this.investors.get(id);
  }

  latestProfile(investorId: string): InvestorProfileRow | undefined {
    const rows = this.investor_profiles.filter(r => r.investor_id === investorId);
    return rows.length > 0 ? rows[rows.length - 1] : undefined;
  }

  nextProfileVersion(investorId: string): number {
    const rows = this.investor_profiles.filter(r => r.investor_id === investorId);
    return rows.length + 1;
  }

  answersForVersion(investorId: string, version: number): InvestorAnswerRow[] {
    return this.investor_answers.filter(
      r => r.investor_id === investorId && r.profile_version === version,
    );
  }

  insertProfile(row: InvestorProfileRow): void {
    this.investor_profiles.push(row);
  }

  insertAnswer(row: InvestorAnswerRow): void {
    this.investor_answers.push(row);
  }

  insertEmailLog(row: ProfileEmailLogRow): void {
    this.profile_email_log.push(row);
  }

  findEmailLog(investorId: string, version: number): ProfileEmailLogRow | undefined {
    return this.profile_email_log.find(
      r => r.investor_id === investorId && r.profile_version === version,
    );
  }

  profileForVersion(investorId: string, version: number): InvestorProfileRow | undefined {
    return this.investor_profiles.find(
      r => r.investor_id === investorId && r.profile_version === version,
    );
  }

  findComposureState(investorId: string): ComposureStateRow | undefined {
    return this.composure_state.find(r => r.investor_id === investorId);
  }

  upsertComposureState(row: ComposureStateRow): void {
    const idx = this.composure_state.findIndex(r => r.investor_id === row.investor_id);
    if (idx >= 0) this.composure_state[idx] = row;
    else this.composure_state.push(row);
  }

  opening_state: OpeningStateRow[] = [];
  level_openings: LevelOpeningRow[] = [];
  monthly_checks: MonthlyCheckRow[] = [];

  findOpeningState(investorId: string): OpeningStateRow | undefined {
    return this.opening_state.find(r => r.investor_id === investorId);
  }

  upsertOpeningState(row: OpeningStateRow): void {
    const idx = this.opening_state.findIndex(r => r.investor_id === row.investor_id);
    if (idx >= 0) this.opening_state[idx] = row;
    else this.opening_state.push(row);
  }

  insertLevelOpening(row: LevelOpeningRow): void {
    this.level_openings.push(row);
  }

  insertMonthlyCheck(row: MonthlyCheckRow): void {
    this.monthly_checks.push(row);
  }
}
