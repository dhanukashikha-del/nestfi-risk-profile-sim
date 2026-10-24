// NESTfi Risk Profile Simulator — plain JS, no framework, no build step.

const API = '/api';
let questionnaire = null;
let answers = {};       // code → optionId
let stressAnswer = null;
let confirmedResult = null;
let currentScreen = 'doorway';
let currentQ = 0;       // 0-based index into flowOrder
let simOffline = false;
let simSaveFail = false;
let simEmailFail = false;
let lastSaveError = false;
let returnToResult = false; // when changing answers from result screen

// 15 questions in flow order (STRESS between T6_seed and R1)
const flowOrder = ['A1','A2','A3','A4','A5','A6','A7','A8','T1','T2','T4','T5','T6_seed','STRESS','R1'];
const scoredCodes = flowOrder.filter(c => c !== 'STRESS');

// Persona answer sets from the test file
const PERSONAS = {
  arjun: { A1:'A1_10PLUS',A2:'A2_NONE',A3:'A3_3TO6',A4:'A4_SAL',A5:'A5_UPTO20',A6:'A6_NONE',A7:'A7_50TO75',A8:'A8_ONE',T1:'T1_QUITE_WILLING',T2:'T2_MOSTLY_RETURN',T4:'T4_LESS_THAN_2_YEARS',T5:'T5_SOMEWHAT_RISKY',T6_seed:'T6_seed_I_HAVE_NOT_INVESTED_TH',STRESS:'HOLD',R1:'R1_RS_79_000_A_FALL_OF_21' },
  meera: { A1:'A1_5TO10',A2:'A2_UPTO5',A3:'A3_3TO6',A4:'A4_STABLE',A5:'A5_20TO40',A6:'A6_3PLUS',A7:'A7_25TO50',A8:'A8_BOTH',T1:'T1_MODERATELY_WILLING',T2:'T2_A_MIX_OF_SAFETY_AND_RE',T4:'T4_5_TO_10_YEARS',T5:'T5_SOMEWHAT_RISKY',T6_seed:'T6_seed_DID_NOTHING',STRESS:'HOLD',R1:'R1_RS_85_000_A_FALL_OF_15' },
  ramesh: { A1:'A1_LT3',A2:'A2_OVER5',A3:'A3_6PLUS',A4:'A4_STABLE',A5:'A5_NONE',A6:'A6_1TO2',A7:'A7_75PLUS',A8:'A8_BOTH',T1:'T1_QUITE_WILLING',T2:'T2_MOSTLY_RETURN',T4:'T4_MORE_THAN_10_YEARS_THR',T5:'T5_NEITHER_RISKY_NOR_SAFE',T6_seed:'T6_seed_INVESTED_MORE',STRESS:'ADD',R1:'R1_RS_79_000_A_FALL_OF_21' },
  kavya: { A1:'A1_3TO5',A2:'A2_UPTO5',A3:'A3_LT3',A4:'A4_VAR',A5:'A5_20TO40',A6:'A6_1TO2',A7:'A7_75PLUS',A8:'A8_ONE',T1:'T1_VERY_WILLING',T2:'T2_MAXIMUM_RETURN',T4:'T4_2_TO_5_YEARS',T5:'T5_SOMEWHAT_SAFE',T6_seed:'T6_seed_DID_NOTHING',STRESS:'HOLD',R1:'R1_RS_69_000_A_FALL_OF_31' },
  suresh: { A1:'A1_10PLUS',A2:'A2_NONE',A3:'A3_6PLUS',A4:'A4_VAR',A5:'A5_NONE',A6:'A6_1TO2',A7:'A7_LT25',A8:'A8_BOTH',T1:'T1_SLIGHTLY_WILLING',T2:'T2_MOSTLY_SAFETY',T4:'T4_2_TO_5_YEARS',T5:'T5_VERY_RISKY',T6_seed:'T6_seed_SOLD_OUT_OF_THE_MARKET',STRESS:'SELL',R1:'R1_RS_92_000_A_FALL_OF_8_' },
  priya: { A1:'A1_10PLUS',A2:'A2_NONE',A3:'A3_6PLUS',A4:'A4_STABLE',A5:'A5_UPTO20',A6:'A6_1TO2',A7:'A7_25TO50',A8:'A8_BOTH',T1:'T1_QUITE_WILLING',T2:'T2_MOSTLY_RETURN',T4:'T4_MORE_THAN_10_YEARS_THR',T5:'T5_NEITHER_RISKY_NOR_SAFE',T6_seed:'T6_seed_INVESTED_MORE',STRESS:'ADD',R1:'R1_RS_69_000_A_FALL_OF_31' },
  vikram: { A1:'A1_10PLUS',A2:'A2_NONE',A3:'A3_3TO6',A4:'A4_SAL',A5:'A5_UPTO20',A6:'A6_1TO2',A7:'A7_50TO75',A8:'A8_BOTH',T1:'T1_QUITE_WILLING',T2:'T2_MOSTLY_RETURN',T4:'T4_5_TO_10_YEARS',T5:'T5_SOMEWHAT_RISKY',T6_seed:'T6_seed_DID_NOTHING',STRESS:'HOLD',R1:'R1_RS_79_000_A_FALL_OF_21' },
  ananya: { A1:'A1_10PLUS',A2:'A2_NONE',A3:'A3_3TO6',A4:'A4_STABLE',A5:'A5_UPTO20',A6:'A6_NONE',A7:'A7_LT25',A8:'A8_BOTH',T1:'T1_MODERATELY_WILLING',T2:'T2_A_MIX_OF_SAFETY_AND_RE',T4:'T4_NEVER',T5:'T5_SOMEWHAT_RISKY',T6_seed:'T6_seed_I_HAVE_NOT_INVESTED_TH',STRESS:'HOLD',R1:'R1_RS_85_000_A_FALL_OF_15' },
};

// ---------------------------------------------------------------- init

async function init() {
  const res = await fetch(`${API}/risk-profile/questionnaire`);
  questionnaire = await res.json();
  render();
}

// ---------------------------------------------------------------- API helpers

async function apiSaveAnswer(code, optionId) {
  if (simOffline) return { saved: true, offline: true };
  if (simSaveFail) { lastSaveError = true; render(); return null; }
  const res = await fetch(`${API}/risk-profile/answers/${code}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optionId, answeredAt: new Date().toISOString() })
  });
  if (!res.ok) { lastSaveError = true; render(); return null; }
  lastSaveError = false;
  return res.json();
}

async function apiConfirm() {
  if (simEmailFail) {
    const res = await fetch(`${API}/risk-profile/confirm`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      confirmedResult = data;
      confirmedResult.email = { to: data.email.to, status: 'failed' };
      return 'email_failed';
    }
    return 'error';
  }
  const res = await fetch(`${API}/risk-profile/confirm`, { method: 'POST' });
  if (!res.ok) return 'error';
  confirmedResult = await res.json();
  return confirmedResult.email.status === 'sent' ? 'ok' : 'email_failed';
}

async function apiResend() {
  const res = await fetch(`${API}/risk-profile/email/resend`, { method: 'POST' });
  return res.ok;
}

// ---------------------------------------------------------------- question lookup

function getQuestion(code) {
  if (code === 'STRESS') return {
    code: 'STRESS', section: 'scenario', sectionTitle: 'One scenario',
    text: 'Markets fall sharply. Your Rs 1,00,000 is now worth Rs 76,000.',
    subText: 'Nothing about the companies you hold has changed. What would you do?',
    options: [{ id: 'SELL', label: 'Sell and move to safety' }, { id: 'HOLD', label: 'Do nothing' }, { id: 'ADD', label: 'Invest more' }]
  };
  if (!questionnaire) return null;
  for (const screen of questionnaire.screens) {
    for (const q of screen.questions) {
      if (typeof q === 'object' && q.code === code) return { ...q, section: screen.section, sectionTitle: screen.sectionTitle };
    }
  }
  return null;
}

function getSectionTitle(code) {
  if (['A1','A2','A3','A4','A5','A6','A7','A8'].includes(code)) return 'Your household';
  if (['T1','T2','T4','T5','T6_seed'].includes(code)) return 'You as an investor';
  return 'One scenario';
}

function answeredCount() { return scoredCodes.filter(c => answers[c]).length; }

// ---------------------------------------------------------------- render router

function render() {
  const phone = document.getElementById('phone');
  switch (currentScreen) {
    case 'doorway': phone.innerHTML = renderDoorway(); break;
    case 'intro': phone.innerHTML = renderIntro(); break;
    case 'question': phone.innerHTML = renderQuestion(); break;
    case 'stress': phone.innerHTML = renderStress(); break;
    case 'rupee': phone.innerHTML = renderRupee(); break;
    case 'confirm': phone.innerHTML = renderConfirm(); break;
    case 'change': phone.innerHTML = renderChangeAnswers(); break;
    case 'confirmed': phone.innerHTML = renderConfirmed(); break;
    case 'result': phone.innerHTML = renderResult(); break;
    case 'email_failed': phone.innerHTML = renderEmailFailed(); break;
    default: phone.innerHTML = renderDoorway();
  }
  updateWorkings();
}

// ---------------------------------------------------------------- screen: doorway (1, 16)

function renderDoorway() {
  const n = answeredCount();
  const isResume = n > 0 && !confirmedResult;
  return `
    <div style="flex:1;background:rgba(0,0,0,0.4);"></div>
    <div class="bottom-sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Set up investing</div>
      <div style="border-top:1px solid var(--border-subtle)"></div>
      <div class="step-row">
        <div class="step-icon done">&#10003;</div>
        <div class="step-label">Identity check</div>
        <div class="step-status">Done</div>
      </div>
      <div class="step-row">
        <div class="step-icon current"></div>
        <div class="step-label current">Risk profile${isResume ? `<br><span style="font-size:14px;font-weight:400;color:var(--text-secondary)">${n} of 14 answered</span>` : ''}</div>
        <button class="btn-primary step-btn" style="width:auto;padding:0 20px;height:36px" onclick="goScreen('intro')">${isResume ? 'Continue' : 'Start'}</button>
      </div>
      <div class="step-row"><div class="step-icon pending"></div><div class="step-label pending">Agreement</div></div>
      <div class="step-row"><div class="step-icon pending"></div><div class="step-label pending">Payment</div></div>
      <div class="step-row"><div class="step-icon pending"></div><div class="step-label pending">Broker link</div></div>
      <div style="border-top:1px solid var(--border-subtle);margin-top:8px"></div>
      <div style="padding-top:16px"><button class="btn-secondary" onclick="goScreen('doorway')">Back</button></div>
    </div>`;
}

// ---------------------------------------------------------------- screen: intro (2)

function renderIntro() {
  return `
    <div class="screen">
      <button class="back-btn" onclick="goScreen('doorway')">&#8249;</button>
      <div class="intro-illustration"><img src="seesaw.svg" alt="Balance illustration"></div>
      <div style="font-size:28px;font-weight:700;line-height:1.2;margin-bottom:12px">Find your balance between safe and growth</div>
      <div class="sub-text">14 questions, 3 minutes. Your answers decide which levels you can invest in.</div>
      <div class="btn-bottom">
        <button class="btn-primary" onclick="startQuestions()">Start</button>
        <div class="intro-notice">Used only to assess what suits you. Kept 5 years, as SEBI requires.</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- screen: question (3-7)
// Tap an option → saves and auto-advances. No Continue button.

function renderQuestion() {
  const code = flowOrder[currentQ];
  const q = getQuestion(code);
  if (!q) return '<div class="screen">Loading...</div>';
  const n = currentQ < 13 ? currentQ + 1 : (currentQ === 13 ? 13 : 14);
  const selected = answers[code] || null;

  let banner = '';
  if (simOffline) banner = `<div class="banner-offline"><span class="icon">&#9432;</span><span>You're offline. Your answers are saved on this phone.</span></div>`;

  let errorBanner = '';
  if (lastSaveError) errorBanner = `<div class="banner-error" style="margin:0 20px 20px"><span class="icon">&#9888;</span><span style="flex:1">Answer not saved. Check your connection.</span><button class="retry-btn" onclick="retryAnswer()">Retry</button></div>`;

  return `
    <div class="screen">
      <div class="screen-header">
        <button class="back-btn" onclick="prevQuestion()">&#8249;</button>
        ${progressStrip(n, 14)}
        <span class="progress-count">${n} of 14</span>
      </div>
      ${banner}
      <div class="section-label">${q.sectionTitle || getSectionTitle(code)}</div>
      <div class="question-text">${q.text}</div>
      <div style="flex:1">
        ${q.options.map(o => `
          <div class="option-row ${selected === o.id ? 'selected' : ''}" onclick="selectOption('${code}','${o.id}')">
            <span class="label">${o.label}</span>
            <span class="tick">&#10003;</span>
          </div>`).join('')}
      </div>
      ${errorBanner}
    </div>`;
}

// ---------------------------------------------------------------- screen: stress (8)

function renderStress() {
  const options = [
    { id: 'SELL', label: 'Sell and move to safety' },
    { id: 'HOLD', label: 'Do nothing' },
    { id: 'ADD', label: 'Invest more' },
  ];
  return `
    <div class="screen">
      <div class="screen-header">
        <button class="back-btn" onclick="prevQuestion()">&#8249;</button>
        ${progressStrip(13, 14)}
        <span class="progress-count">13 of 14</span>
      </div>
      <div class="section-label">One scenario</div>
      <div class="question-text">Markets fall sharply. Your Rs 1,00,000 is now worth Rs 76,000.</div>
      <div class="sub-text">Nothing about the companies you hold has changed. What would you do?</div>
      <div class="two-bars">
        <div class="bar-col"><div class="bar-rect" style="background:var(--border-subtle)"></div><div class="bar-label">1,00,000</div></div>
        <div class="bar-col"><div class="bar-rect" style="background:var(--brand-purple)"></div><div class="bar-label">76,000</div></div>
      </div>
      ${options.map(o => `
        <div class="option-row" onclick="selectStress('${o.id}')">
          <span class="label">${o.label}</span>
        </div>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------- screen: rupee (9)

function renderRupee() {
  const tiles = [
    { id:'R1_RS_96_000_A_FALL_OF_4_', rs:'Rs 96,000', pct:'down 4%' },
    { id:'R1_RS_92_000_A_FALL_OF_8_', rs:'Rs 92,000', pct:'down 8%' },
    { id:'R1_RS_85_000_A_FALL_OF_15', rs:'Rs 85,000', pct:'down 15%' },
    { id:'R1_RS_79_000_A_FALL_OF_21', rs:'Rs 79,000', pct:'down 21%' },
    { id:'R1_RS_69_000_A_FALL_OF_31', rs:'Rs 69,000', pct:'down 31%' },
    { id:'R1_RS_66_000_A_FALL_OF_34', rs:'Rs 66,000', pct:'down 34%' },
  ];
  const selected = answers['R1'] || null;
  return `
    <div class="screen">
      <div class="screen-header">
        <button class="back-btn" onclick="goStress()">&#8249;</button>
        ${progressStrip(14, 14)}
        <span class="progress-count">14 of 14</span>
      </div>
      <div class="section-label">One scenario</div>
      <div class="question-text">Your Rs 1,00,000 falls within a year, then recovers over the following years.</div>
      <div class="sub-text">What is the lowest it could go without you selling?</div>
      <div class="rupee-grid">
        ${tiles.map(t => `
          <div class="rupee-tile ${selected === t.id ? 'selected' : ''}" onclick="selectRupee('${t.id}')">
            <div class="rupee">${t.rs}</div><div class="pct">${t.pct}</div>
          </div>`).join('')}
      </div>
      ${selected ? `<div class="btn-bottom"><button class="btn-primary" onclick="goConfirm()">See my profile</button></div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------- screen: confirm (10)

function renderConfirm() {
  const anchor = anchorData();
  // Use confirmed result if available, otherwise show labels from answers
  const absorb = confirmedResult ? confirmedResult.summary.absorb : '—';
  const approach = confirmedResult ? confirmedResult.summary.approach : '—';
  const exp = experienceLabel();
  // If workings has a profile, use that for the preview
  const w = lastWorkings;
  const previewAbsorb = (w && w.profile) ? w.profile.ability_band : absorb;
  const previewApproach = (w && w.profile) ? approachLabel(w.profile.tolerance_band) : approach;

  return `
    <div class="screen">
      <button class="back-btn" onclick="currentScreen='rupee';render()">&#8249;</button>
      <div style="font-size:28px;font-weight:700;margin:8px 0 24px">Your profile</div>
      <div class="summary-card">
        <div class="summary-row"><div class="label">What your household can absorb</div><div class="value">${previewAbsorb}</div></div>
        <div class="summary-row"><div class="label">How you approach risk</div><div class="value">${previewApproach}</div></div>
        <div class="summary-row"><div class="label">Investing experience</div><div class="value">${exp}</div></div>
        <div class="summary-row highlighted"><div class="label">The fall you'd sit through</div><div class="value">${anchor.pct}%, Rs ${anchor.rs} on a lakh</div></div>
      </div>
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px">A copy goes to demo@nestfi.in.</div>
      <div class="btn-bottom">
        <button class="btn-primary" onclick="doConfirm()">These are right</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="returnToResult=false;currentScreen='change';render()">Change an answer</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- screen: change answers (11)

function renderChangeAnswers() {
  let html = `<div class="screen">
    <button class="back-btn" onclick="currentScreen='${returnToResult ? 'result' : 'confirm'}';render()">&#8249;</button>
    <div style="font-size:28px;font-weight:700;margin:8px 0 16px">Your answers</div>
    <div style="flex:1;overflow-y:auto">`;
  let lastSection = '';
  for (let i = 0; i < flowOrder.length; i++) {
    const code = flowOrder[i];
    const q = getQuestion(code);
    if (!q) continue;
    const section = q.sectionTitle || getSectionTitle(code);
    if (section !== lastSection) {
      html += `<div class="section-label" style="margin-top:16px">${section}</div>`;
      lastSection = section;
    }
    const optId = code === 'STRESS' ? stressAnswer : answers[code];
    const opt = q.options.find(o => o.id === optId);
    html += `<div class="answer-row" onclick="jumpToQuestion(${i})">
      <div style="flex:1"><div class="answer-q">${q.text.substring(0, 60)}${q.text.length > 60 ? '...' : ''}</div><div class="answer-a">${opt ? opt.label : '—'}</div></div>
      <div class="answer-chevron">&#8250;</div></div>`;
  }
  html += `</div></div>`;
  return html;
}

// ---------------------------------------------------------------- screen: confirmed (12)

function renderConfirmed() {
  return `
    <div class="screen center-screen">
      <div class="center-icon" style="background:var(--success-bg);color:var(--success)">&#10003;</div>
      <div class="center-title">Profile confirmed</div>
      <div class="center-sub">Copy sent to demo@nestfi.in</div>
      <div class="btn-bottom" style="width:100%"><button class="btn-primary" onclick="currentScreen='result';render()">See my result</button></div>
    </div>`;
}

// ---------------------------------------------------------------- screen: result (13, 14)

function renderResult() {
  const r = confirmedResult;
  if (!r) return '<div class="screen">No result yet.</div>';
  const level = r.level;
  const bandLabel = level <= 5 ? 'Low' : level <= 10 ? 'Moderate' : 'High';
  const bandDesc = {
    Low: 'Keeping your money safe matters more than growing it fast.',
    Moderate: 'Some ups and downs for better growth, within limits.',
    High: 'Comfortable with big swings for the chance of more growth.'
  }[bandLabel];
  const showWhatSet = r.whatSetThis === 'ability_horizon' || r.whatSetThis === 'ability_withdrawals';
  const whatSetText = r.whatSetThis === 'ability_horizon' ? 'You need this money within 5 years.' : 'You plan to withdraw more than 5% a year.';
  const notYetText = level >= 15 ? null : level >= 11 ? `Level ${level+1} and above` : `Level ${level+1} and above. Your own stock picks, from Level 11`;
  const fall = r.largestFall.rupeesPerLakh.toLocaleString('en-IN');

  let levelSegs = '';
  for (let i = 1; i <= 15; i++) {
    const filled = i <= level;
    const opacity = filled ? (0.4 + 0.6 * i / level) : 1;
    const color = filled ? `rgba(106,87,227,${opacity})` : 'var(--border-subtle)';
    levelSegs += `<div class="level-seg" style="background:${color}"></div>`;
  }

  return `
    <div class="screen" style="padding-top:40px">
      <div class="section-label">Your risk profile</div>
      <div style="font-size:36px;font-weight:700;margin-bottom:8px">Level ${level}</div>
      <div class="sub-text">${bandLabel}. ${bandDesc}</div>
      <div class="level-strip">${levelSegs}</div>
      <div class="video-card">
        <div class="video-icon">&#9654;</div>
        <div><div class="video-title">What Level ${level} means for you</div><div class="video-dur">1 min</div></div>
      </div>
      <div class="info-card">
        <div class="info-row"><div class="label">Open to you</div><div class="value">Mixes for Levels 1 to ${level}</div></div>
        ${showWhatSet ? `<div class="info-row"><div class="label">What set this</div><div class="value">${whatSetText}</div></div>` : ''}
        ${!showWhatSet && notYetText ? `<div class="info-row"><div class="label">Not yet</div><div class="value">${notYetText}</div></div>` : ''}
        <div class="info-row"><div class="label">Largest fall at Level ${level}, ${r.largestFall.period}</div><div class="value">Rs ${fall} on a lakh</div></div>
      </div>
      <div style="font-size:14px;color:var(--text-secondary);line-height:1.4;margin-bottom:16px">Levels open as your circumstances, learning and investing record change.</div>
      <div class="btn-bottom">
        <button class="btn-primary" onclick="goScreen('doorway')">Continue to agreement</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="returnToResult=true;currentScreen='change';render()">Change an answer</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- screen: email failed (17)

function renderEmailFailed() {
  return `
    <div class="screen center-screen">
      <div class="center-icon" style="background:var(--error-bg);color:var(--error)">&#9993;</div>
      <div class="center-title">We couldn't send your copy</div>
      <div class="center-sub">Your profile is saved. Investing opens once the copy is delivered.</div>
      <div class="email-box"><div class="label">Sending to</div><div class="addr">demo@nestfi.in</div></div>
      <div class="btn-bottom" style="width:100%">
        <button class="btn-primary" onclick="doResend()">Try again</button>
        <button class="btn-secondary" style="margin-top:8px">Change email</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- helpers

function progressStrip(filled, total) {
  let h = '<div class="progress-strip">';
  for (let i = 0; i < total; i++) h += `<div class="progress-seg ${i < filled ? 'filled' : ''}"></div>`;
  return h + '</div>';
}

function approachLabel(band) { return { Low:'Conservative', Moderate:'Balanced', High:'Growth-oriented' }[band] || band; }

function experienceLabel() {
  const map = { T4_NEVER:'No experience', T4_LESS_THAN_2_YEARS:'Under 2 years', T4_2_TO_5_YEARS:'2 to 5 years', T4_5_TO_10_YEARS:'5 to 10 years', T4_MORE_THAN_10_YEARS_THR:'Over 10 years' };
  return map[answers['T4']] || '';
}

function anchorData() {
  const map = {
    R1_RS_96_000_A_FALL_OF_4_: { pct: 4, rs: '96,000' },
    R1_RS_92_000_A_FALL_OF_8_: { pct: 8, rs: '92,000' },
    R1_RS_85_000_A_FALL_OF_15: { pct: 15, rs: '85,000' },
    R1_RS_79_000_A_FALL_OF_21: { pct: 21, rs: '79,000' },
    R1_RS_69_000_A_FALL_OF_31: { pct: 31, rs: '69,000' },
    R1_RS_66_000_A_FALL_OF_34: { pct: 34, rs: '66,000' },
  };
  return map[answers['R1']] || { pct: 0, rs: '0' };
}

// ---------------------------------------------------------------- navigation

function goScreen(s) { currentScreen = s; render(); }

function startQuestions() {
  for (let i = 0; i < flowOrder.length; i++) {
    const code = flowOrder[i];
    if (code === 'STRESS') { if (!stressAnswer) { currentQ = i; currentScreen = 'stress'; render(); return; } }
    else { if (!answers[code]) { currentQ = i; currentScreen = code === 'R1' ? 'rupee' : 'question'; render(); return; } }
  }
  currentScreen = 'confirm';
  render();
}

// Tap an option → save, brief highlight, then auto-advance
async function selectOption(code, optionId) {
  answers[code] = optionId;
  lastSaveError = false;
  render(); // show selection highlight
  await apiSaveAnswer(code, optionId);
  if (lastSaveError) { render(); return; } // stay on this question if save failed
  await updateWorkings();
  // Auto-advance after a short pause so the user sees the tick
  setTimeout(() => { nextQuestion(); }, 250);
}

async function retryAnswer() {
  const code = flowOrder[currentQ];
  const optId = answers[code];
  if (optId) {
    lastSaveError = false;
    simSaveFail = false;
    await apiSaveAnswer(code, optId);
    if (!lastSaveError) {
      await updateWorkings();
      setTimeout(() => { nextQuestion(); }, 250);
    }
    render();
  }
}

function nextQuestion() {
  currentQ++;
  if (currentQ >= flowOrder.length) { currentScreen = 'confirm'; updateWorkings(); render(); return; }
  const code = flowOrder[currentQ];
  if (code === 'STRESS') currentScreen = 'stress';
  else if (code === 'R1') currentScreen = 'rupee';
  else currentScreen = 'question';
  render();
}

function prevQuestion() {
  if (currentQ <= 0) { currentScreen = 'intro'; render(); return; }
  currentQ--;
  const code = flowOrder[currentQ];
  if (code === 'STRESS') currentScreen = 'stress';
  else if (code === 'R1') currentScreen = 'rupee';
  else currentScreen = 'question';
  render();
}

async function selectStress(id) {
  stressAnswer = id;
  await apiSaveAnswer('STRESS', id);
  currentQ = 14; // R1
  currentScreen = 'rupee';
  render();
  await updateWorkings();
}

function goStress() { currentQ = 13; currentScreen = 'stress'; render(); }

async function selectRupee(id) {
  answers['R1'] = id;
  render();
  await apiSaveAnswer('R1', id);
  render();
  await updateWorkings();
}

function goConfirm() { currentScreen = 'confirm'; updateWorkings(); render(); }

async function doConfirm() {
  const status = await apiConfirm();
  if (status === 'ok') { currentScreen = 'confirmed'; }
  else if (status === 'email_failed') { currentScreen = 'email_failed'; }
  render();
  await updateWorkings();
}

async function doResend() {
  const ok = await apiResend();
  if (ok) { currentScreen = 'confirmed'; render(); }
}

function jumpToQuestion(idx) {
  currentQ = idx;
  const code = flowOrder[idx];
  if (code === 'STRESS') currentScreen = 'stress';
  else if (code === 'R1') currentScreen = 'rupee';
  else currentScreen = 'question';
  render();
}

// ---------------------------------------------------------------- dev bar

function toggleOffline() {
  simOffline = !simOffline;
  document.getElementById('btn-offline').textContent = `Offline: ${simOffline ? 'on' : 'off'}`;
  document.getElementById('btn-offline').classList.toggle('active', simOffline);
  render();
}

function toggleSaveFail() {
  simSaveFail = !simSaveFail;
  document.getElementById('btn-savefail').textContent = `Save fail: ${simSaveFail ? 'on' : 'off'}`;
  document.getElementById('btn-savefail').classList.toggle('active', simSaveFail);
}

function toggleEmailFail() {
  simEmailFail = !simEmailFail;
  document.getElementById('btn-emailfail').textContent = `Email fail: ${simEmailFail ? 'on' : 'off'}`;
  document.getElementById('btn-emailfail').classList.toggle('active', simEmailFail);
}

async function loadPersona(name) {
  if (!name) return;
  await fetch(`${API}/reset`, { method: 'POST' });
  answers = {};
  stressAnswer = null;
  confirmedResult = null;
  lastSaveError = false;
  const p = PERSONAS[name];
  for (const code of flowOrder) {
    const optId = p[code];
    if (code === 'STRESS') { stressAnswer = optId; }
    else { answers[code] = optId; }
    await apiSaveAnswer(code, optId);
  }
  currentScreen = 'confirm';
  await updateWorkings();
  render();
  document.getElementById('persona-select').value = '';
}

async function resetAll() {
  await fetch(`${API}/reset`, { method: 'POST' });
  answers = {};
  stressAnswer = null;
  confirmedResult = null;
  currentScreen = 'doorway';
  currentQ = 0;
  lastSaveError = false;
  returnToResult = false;
  await updateWorkings();
  render();
}

// ---------------------------------------------------------------- workings panel

let lastWorkings = null;

async function updateWorkings() {
  try {
    const res = await fetch(`${API}/workings`);
    lastWorkings = await res.json();
  } catch { return; }

  const el = document.getElementById('workings-content');
  const w = lastWorkings;
  if (!w || !w.drafts || Object.keys(w.drafts).length === 0) {
    el.innerHTML = 'Submit answers to see workings.';
    return;
  }

  const p = w.profile;
  let html = '';

  // Answers table
  html += '<div class="wk-section"><h4>Answers</h4>';
  for (const code of flowOrder) {
    const optId = w.drafts[code];
    if (optId) html += `<div class="wk-row"><span class="wk-label">${code}</span><span class="wk-value">${optId}</span></div>`;
  }
  html += '</div>';

  if (p) {
    html += '<div class="wk-divider"></div>';
    html += '<div class="wk-section"><h4>Ability (Factor 1)</h4>';
    html += `<div class="wk-row"><span class="wk-label">Score</span><span class="wk-value">${p.ability_score}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Band</span><span class="wk-value">${p.ability_band}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Absorbable loss</span><span class="wk-value">${lossCurve(p.ability_score)}%</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Ceiling</span><span class="wk-value ${p.binding_constraint === 'ability' ? 'binding' : ''}">${p.ability_ceiling}</span></div>`;
    html += '</div>';

    html += '<div class="wk-divider"></div>';
    html += '<div class="wk-section"><h4>Tolerance (Factor 2)</h4>';
    html += `<div class="wk-row"><span class="wk-label">Total</span><span class="wk-value">${p.tolerance_total}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Band</span><span class="wk-value">${p.tolerance_band}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Trait level</span><span class="wk-value">${p.tolerance_level}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Anchor level</span><span class="wk-value ${p.binding_constraint === 'tolerance' ? 'binding' : ''}">${p.anchor_level ?? '—'}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Knowledge (T3)</span><span class="wk-value">3 (fixed)</span></div>`;
    html += '</div>';

    html += '<div class="wk-divider"></div>';
    html += '<div class="wk-section"><h4>Reconcile</h4>';
    html += `<div class="wk-row"><span class="wk-label">Teaching ceiling</span><span class="wk-value">${p.literacy_ceiling ?? 'null'}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Binding</span><span class="wk-value binding">${p.binding_constraint}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">What set this</span><span class="wk-value">${p.what_set_this}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Light</span><span class="wk-value">${p.light}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Qualified</span><span class="wk-value">${p.qualified_level}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Earned</span><span class="wk-value">${p.earned_level}</span></div>`;
    html += `<div class="wk-row"><span class="wk-label">Advice</span><span class="wk-value">${p.advice_level}</span></div>`;
    html += '</div>';

    html += '<div class="wk-divider"></div>';
    html += '<div class="wk-section"><h4>Result</h4>';
    html += `<div class="wk-row"><span class="wk-label" style="font-size:16px;font-weight:700">Level</span><span class="wk-value" style="font-size:20px;color:var(--brand-purple)">${p.earned_level}</span></div>`;
    html += '</div>';
  }

  if (w.composureSeed !== null) {
    html += '<div class="wk-divider"></div>';
    html += `<div class="wk-section"><h4>Composure</h4>`;
    html += `<div class="wk-row"><span class="wk-label">Seed</span><span class="wk-value">${w.composureSeed}</span></div>`;
    html += `</div>`;
  }

  el.innerHTML = html;
}

function lossCurve(score) {
  const s = Math.min(Math.max(score, 0), 100) / 100;
  return (2 + 32 * Math.pow(s, 1.1)).toFixed(1);
}

// ---------------------------------------------------------------- boot

init();
