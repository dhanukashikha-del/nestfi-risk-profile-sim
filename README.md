# NESTfi Risk Profile Simulator

Stakeholder demo of the first-time risk profile: 14 questions, the simulated fall, the engine, and every screen from the spec. The professor can check each persona against his table using the dropdown.

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

## Run tests

```bash
npm test
# 406 tests: 188 engine + 218 API integration
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

## What the simulator shows

- **Phone frame** (390 px): every screen from SCREEN_SPEC.md in order, same copy, same exits.
- **Workings panel**: live engine internals — every answer with its option id, ability score/band/ceiling, tolerance traits/total/level, anchor level, teaching ceiling, binding constraint, final level.
- **Dev bar**: toggle offline, save-failed, email-failed states. Load any of the eight test personas from the dropdown.
- **Reset**: clears the store so a reviewer can start again.

## No numbers in code

Every point value, band boundary, curve constant and level cap comes from `config/riskProfile/`. A change to a question or a point value is a CSV edit.
