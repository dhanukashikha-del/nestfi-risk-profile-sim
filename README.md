# NESTfi Risk Profile Simulator

Stakeholder demo of the first-time risk profile: 14 questions, the simulated fall, the engine, and every screen from the spec. Choose an investment flow, complete the profile, and see the result. Sample answers for eight personas can be loaded from the dropdown.

Spec: `RISK_PROFILE_SPEC.md` in the handover folder. Scoring follows the base file (`Nestfi_Risk_Profiler_Manual.docx`).

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

## Run tests

```bash
npm test
# 448 tests: 188 engine, 249 API integration, 11 status/entry gate
```

## Deploy to Render

1. Push to GitHub under `dhanukashikha-del/nestfi-risk-profile-sim`.
2. In Render, **New > Web Service**, connect the repo.
3. Render reads `render.yaml` automatically.
4. Build command: `npm install`, start command: `npm start`.
5. The app serves on port 3000.

Or use the Dockerfile:

```
docker build -t nestfi-sim .
docker run -p 3000:3000 nestfi-sim
```

## API calls

| # | Call | Method | What |
|---|---|---|---|
| 1 | `/api/risk-profile/questionnaire` | GET | Questions, options, order, version |
| 2 | `/api/risk-profile/answers/:code` | PUT | Save one answer by option id |
| 3 | `/api/risk-profile/confirm` | POST | Score, save profile, send email, return result |
| 4 | `/api/risk-profile` | GET | Latest confirmed profile |
| 5 | `/api/risk-profile/email/resend` | POST | Resend the summary email |
| 6 | `/api/risk-profile/update` | POST | Start an update (draft from last profile) |
| 7 | `/api/risk-profile/can-invest` | GET | Can the investor proceed? |
| 8 | `/api/risk-profile/monthly-check` | POST | Monthly progression: one rung if Learn is done |
| 9 | `/api/risk-profile/status` | GET | Per-person status for every screen |
| 10 | `/api/investment-flows/:flow/enter` | POST | Entry gate for Learn and invest, Goals, Build your own |
| — | `/api/reset` | POST | Clear the store (simulator only) |

## What the simulator shows

- **Start screen**: three investment flow buttons. Each calls the entry gate.
- **Phone frame** (390 px): every screen from the spec in order, same copy, same exits.
- **Fill sample answers**: dropdown loads one of eight personas. Ananya (15, minor) hits the entry gate and is sent to Request parent.
- **Flow placeholder**: after the result, Continue returns to the chosen flow with a Start again link that resets.

## No numbers in code

Every point value, band boundary, curve constant and level cap comes from `config/riskProfile/`. A change to a question or a point value is a CSV edit.
