// NESTfi Risk Profile Simulator — plain JS, no framework, no build step.

const API = '/api';
let questionnaire = null;
let answers = {};       // code → optionId
let stressAnswer = null;
let confirmedResult = null;
let currentScreen = 'start';
let currentQ = 0;       // 0-based index into flowOrder
let simOffline = false;
let simSaveFail = false;
let simEmailFail = false;
let lastSaveError = false;
let returnToResult = false;
let returnToFlow = null;
let isMinor = false;

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
    case 'start': phone.innerHTML = renderStart(); break;
    case 'request_parent': phone.innerHTML = renderRequestParent(); break;
    case 'doorway': phone.innerHTML = renderDoorway(); break;
    case 'intro': phone.innerHTML = renderIntro(); break;
    case 'why': phone.innerHTML = renderWhySheet(); break;
    case 'question': phone.innerHTML = renderQuestion(); break;
    case 'stress': phone.innerHTML = renderStress(); break;
    case 'rupee': phone.innerHTML = renderRupee(); break;
    case 'confirm': phone.innerHTML = renderConfirm(); break;
    case 'saving': phone.innerHTML = renderSaving(); break;
    case 'change': phone.innerHTML = renderChangeAnswers(); break;
    case 'confirmed': phone.innerHTML = renderConfirmed(); break;
    case 'result': phone.innerHTML = renderResult(); break;
    case 'email_failed': phone.innerHTML = renderEmailFailed(); break;
    case 'learn_gate': phone.innerHTML = renderLearnGate(); break;
    case 'my_profile': phone.innerHTML = renderMyProfile(); break;
    case 'update_sheet': phone.innerHTML = renderUpdateSheet(); break;
    case 'answers_edit': phone.innerHTML = renderAnswersEdit(); break;
    case 'confirm_update': phone.innerHTML = renderConfirmUpdate(); break;
    case 'result_updated': phone.innerHTML = renderResultUpdated(); break;
    case 'flow_placeholder': phone.innerHTML = renderFlowPlaceholder(); break;
    default: phone.innerHTML = renderDoorway();
  }
}

// ---------------------------------------------------------------- screen: start (choose a flow)

function renderStart() {
  return `
    <div class="screen center-screen" style="gap:20px">
      <div style="font-size:28px;font-weight:600;text-align:center">NESTfi</div>
      <div style="font-size:16px;color:var(--text-secondary);text-align:center">Choose how you'd like to invest</div>
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;margin-top:20px">
        <button class="btn-primary" onclick="enterFlow('learn_and_invest')">Learn and invest</button>
        <button class="btn-secondary" onclick="enterFlow('goals')">Goals</button>
        <button class="btn-secondary" onclick="enterFlow('build_your_own')">Build your own portfolio</button>
      </div>
    </div>`;
}

function renderRequestParent() {
  return `
    <div class="screen center-screen" style="gap:16px">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none"><circle cx="36" cy="36" r="36" fill="#F1EFFC"/><path d="M36 22a8 8 0 1 1 0 16 8 8 0 0 1 0-16z" fill="#6A57E3"/><path d="M22 48c0-6 6-10 14-10s14 4 14 10" stroke="#6A57E3" stroke-width="3" stroke-linecap="round"/></svg>
      <div style="font-size:22px;font-weight:600">Request parent</div>
      <div style="font-size:16px;color:var(--text-secondary);text-align:center;line-height:1.5">A child is advised under the parent's profile. Ask your parent to complete the risk profile on their account.</div>
      <div class="btn-bottom" style="width:100%"><button class="btn-secondary" onclick="fullReset()">Back</button></div>
    </div>`;
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
      <div style="font-size:30px;font-weight:700;line-height:1.15;margin-bottom:12px">Find your balance between safe and growth</div>
      <div class="sub-text">3 minutes. Your answers decide which levels you can invest in.</div>
      <div class="btn-bottom">
        <button class="btn-primary" onclick="startQuestions()">Start</button>
        <div class="intro-notice">Your answers stay private. <a href="#" onclick="event.preventDefault();goScreen('why')" style="color:var(--brand-purple);font-weight:600;text-decoration:underline">Why a risk profile?</a></div>
      </div>
    </div>`;
}

function renderWhySheet() {
  return `
    <div style="flex:1;background:rgba(0,14,38,0.45);display:flex;flex-direction:column;justify-content:flex-end">
      <div class="bottom-sheet" style="border-radius:20px 20px 0 0;padding:12px 20px 32px;display:flex;flex-direction:column;gap:20px">
        <div class="sheet-handle"></div>
        <div style="font-size:22px;font-weight:600;line-height:1.3">Why a risk profile?</div>
        <div style="display:flex;flex-direction:column;gap:14px;font-size:16px;line-height:1.5">
          <div style="display:flex;gap:12px"><span style="color:var(--brand-purple);font-weight:600">1</span><span>It tells us how much of a fall you can afford, and how much you can sit through.</span></div>
          <div style="display:flex;gap:12px"><span style="color:var(--brand-purple);font-weight:600">2</span><span>That sets the levels you can invest in. Higher levels open as your situation and record change.</span></div>
          <div style="display:flex;gap:12px"><span style="color:var(--brand-purple);font-weight:600">3</span><span>Every investor completes one before any investment is suggested. Your answers are kept 5 years and never shared or sold.</span></div>
        </div>
        <button class="btn-primary" onclick="goScreen('intro')">Got it</button>
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

// ---------------------------------------------------------------- screen: saving (10b)

function renderSaving() {
  const anchor = anchorData();
  const w = lastWorkings;
  const previewAbsorb = (w && w.profile) ? w.profile.ability_band : '—';
  const previewApproach = (w && w.profile) ? approachLabel(w.profile.tolerance_band) : '—';
  return `
    <div class="screen">
      <div style="height:40px"></div>
      <div style="font-size:28px;font-weight:600;line-height:1.2;margin-bottom:8px">Your profile</div>
      <div class="summary-card">
        <div class="summary-row"><div class="label" style="font-size:13px">What your household can absorb</div><div class="value" style="font-size:18px">${previewAbsorb}</div></div>
        <div class="summary-row"><div class="label" style="font-size:13px">How you approach risk</div><div class="value" style="font-size:18px">${previewApproach}</div></div>
        <div class="summary-row"><div class="label" style="font-size:13px">Investing experience</div><div class="value" style="font-size:18px">${experienceLabel()}</div></div>
        <div class="summary-row highlighted"><div class="label" style="font-size:13px">The fall you'd sit through</div><div class="value" style="font-size:18px">${anchor.pct}%, Rs ${anchor.rs} on a lakh</div></div>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">A copy goes to demo@nestfi.in.</div>
      <div style="flex:1"></div>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;height:48px;border-radius:8px;background:var(--brand-purple);color:white;font-size:16px;font-weight:600">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" stroke-opacity="0.35" stroke-width="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="white" stroke-width="2.5" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/></path></svg>
        Saving your profile
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
      <img src="envelope.svg" alt="Envelope" style="width:300px;height:200px;object-fit:contain">
      <div style="display:flex;flex-direction:column;gap:8px;text-align:center">
        <div style="font-size:26px;font-weight:600;line-height:1.2">Profile confirmed</div>
        <div style="font-size:16px;color:var(--text-secondary);line-height:1.5">A copy is in your inbox, demo@nestfi.in</div>
      </div>
      <div class="btn-bottom" style="width:100%"><button class="btn-primary" onclick="currentScreen='result';render()">See my result</button></div>
    </div>`;
}

// ---------------------------------------------------------------- screen: result (13, 14)

function renderResult() {
  const r = confirmedResult;
  if (!r) return '<div class="screen">No result yet.</div>';
  const level = r.level;
  const label = r.label || '';
  const description = r.description || '';
  const lowestValue = (r.lowestValueOnALakh || 0).toLocaleString('en-IN');
  const waveIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><circle cx="12" cy="12" r="11" fill="#F1EFFC"/><path d="M5 12c2-4 4-4 6 0s4 4 6 0 3-2 3-2" stroke="#6A57E3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const levelsIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20h4v-5H4zM10 20h4v-9h-4zM16 20h4V5h-4z" stroke="#6A57E3" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const goalsIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="#6A57E3" stroke-width="2"/><circle cx="12" cy="12" r="3.5" stroke="#6A57E3" stroke-width="2"/></svg>`;
  const portfolioIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="#6A57E3" stroke-width="2"/><rect x="13" y="4" width="7" height="7" rx="1.5" stroke="#6A57E3" stroke-width="2"/><rect x="4" y="13" width="7" height="7" rx="1.5" stroke="#6A57E3" stroke-width="2"/><path d="M16.5 13.5v6M13.5 16.5h6" stroke="#6A57E3" stroke-width="2" stroke-linecap="round"/></svg>`;

  return `
    <div class="screen" style="gap:16px">
      <div style="display:flex;align-items:center;justify-content:center;height:160px"><img src="level_block.svg" style="width:252px;height:160px;object-fit:contain" alt="Level ${level}"></div>
      <div style="display:flex;flex-direction:column;gap:6px;text-align:center">
        <span style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--brand-purple)">Your risk profile</span>
        <div style="font-size:32px;font-weight:600;line-height:1.15">Level ${level}</div>
        <div style="font-size:16px;color:var(--text-secondary)">${label}</div>
        <div style="font-size:16px;line-height:1.5;margin-top:8px">${description}</div>
      </div>
      <div style="display:flex;flex-direction:column;border:1px solid var(--border-default);border-radius:8px">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px">
          ${waveIcon}
          <span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--text-secondary)">Biggest dip since 2011</span><span style="font-size:16px;font-weight:600;font-variant-numeric:tabular-nums">Rs 1,00,000 went to Rs ${lowestValue}</span></span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <span style="font-size:13px;color:var(--text-secondary)">Used in every way you invest</span>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border-radius:8px;background:#F7F8FA">${levelsIcon}<span style="font-size:13px;font-weight:600;text-align:center">Levels</span></div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border-radius:8px;background:#F7F8FA">${goalsIcon}<span style="font-size:13px;font-weight:600;text-align:center">Goals</span></div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border-radius:8px;background:#F7F8FA">${portfolioIcon}<span style="font-size:13px;font-weight:600;text-align:center">Your own portfolio</span></div>
        </div>
      </div>
      <div style="flex:1"></div>
      <button class="btn-primary" onclick="returnToFlow ? goScreen('flow_placeholder') : goScreen('doorway')">Continue</button>
    </div>`;
}

// ---------------------------------------------------------------- screen: email failed (17)

function renderEmailFailed() {
  return `
    <div class="screen center-screen">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none"><circle cx="36" cy="36" r="36" fill="#FFEDEB"/><rect x="20" y="25" width="32" height="24" rx="3" stroke="#E70F00" stroke-width="3"/><path d="M22 28l14 11 14-11" stroke="#E70F00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div style="display:flex;flex-direction:column;gap:8px;text-align:center">
        <div style="font-size:26px;font-weight:600;line-height:1.2">We couldn't send your copy</div>
        <div style="font-size:16px;color:var(--text-secondary);line-height:1.5">Your profile is saved. We will keep trying, and you can carry on.</div>
      </div>
      <div class="email-box"><div class="label">Sending to</div><div class="addr">demo@nestfi.in</div></div>
      <div class="btn-bottom" style="width:100%">
        <button class="btn-primary" onclick="currentScreen='result';render()">See my result</button>
        <button class="btn-secondary" style="margin-top:8px" onclick="doResend()">Try again</button>
        <a href="#" onclick="event.preventDefault()" style="display:flex;align-items:center;justify-content:center;height:44px;color:var(--brand-purple);font-size:16px;font-weight:600;text-decoration:none">Change email</a>
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
  currentScreen = 'saving';
  render();
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

// ---------------------------------------------------------------- screen: learn gate (S18)

function renderLearnGate() {
  const learnLvl = window._simLearnLevel || 8;
  const profileLvl = confirmedResult ? confirmedResult.level : 5;
  return `
    <div class="screen">
      <button class="back-btn" onclick="goScreen('my_profile')">&#8249;</button>
      <div style="flex:1"></div>
      <div style="display:flex;align-items:center;justify-content:center;height:160px"><img src="level_block.svg" style="width:252px;height:160px;object-fit:contain"></div>
      <div style="display:flex;flex-direction:column;gap:10px;text-align:center">
        <div style="font-size:28px;font-weight:600;line-height:1.2">You've finished Level ${learnLvl}</div>
        <div style="font-size:16px;color:var(--text-secondary);line-height:1.5">Based on your risk profile, Level ${profileLvl} suits you best.</div>
      </div>
      <div style="flex:1"></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn-primary" onclick="goScreen('doorway')">Keep learning</button>
        <button class="btn-secondary" onclick="goScreen('result')">See my risk profile</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- screen: my risk profile (S19)

function renderMyProfile() {
  const r = confirmedResult;
  if (!r) return '<div class="screen"><div>No profile yet.</div></div>';
  const level = r.level;
  const bandLabel = level <= 5 ? 'Low' : level <= 10 ? 'Moderate' : 'High';
  const fall = r.largestFall.rupeesPerLakh.toLocaleString('en-IN');
  const notYetText = level >= 15 ? null : `Level ${level+1} and above`;
  const tickIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><circle cx="12" cy="12" r="11" fill="#CFFCE4"/><path d="M7 12.5l3 3 7-7" stroke="#009466" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const dashIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><circle cx="12" cy="12" r="10" stroke="#98A2B3" stroke-width="2" stroke-dasharray="3 3"/></svg>`;
  const fallIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M4 8l6 6 4-4 6 6" stroke="#B03C00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 11v5h-5" stroke="#B03C00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `
    <div class="screen" style="gap:16px">
      <button class="back-btn" onclick="goScreen('doorway')">&#8249;</button>
      <div style="display:flex;align-items:center;justify-content:center;height:120px"><img src="level_block.svg" style="width:189px;height:120px;object-fit:contain"></div>
      <div style="display:flex;flex-direction:column;gap:6px;text-align:center">
        <span style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--brand-purple)">Your risk profile</span>
        <div style="font-size:32px;font-weight:600;line-height:1.15">Level ${level}</div>
        <div style="font-size:16px;color:var(--text-secondary)">${bandLabel}</div>
      </div>
      <div class="info-card">
        <div class="info-row" style="display:flex;align-items:center;gap:12px">${tickIcon}<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--text-secondary)">Open to you</span><span style="font-size:16px;font-weight:600">Levels 1 to ${level}</span></span></div>
        ${notYetText ? `<div class="info-row" style="display:flex;align-items:center;gap:12px">${dashIcon}<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--text-secondary)">Not yet</span><span style="font-size:16px;font-weight:600">${notYetText}</span></span></div>` : ''}
        <div class="info-row" style="display:flex;align-items:center;gap:12px">${fallIcon}<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--text-secondary)">Largest fall, Level ${level}</span><span style="font-size:16px;font-weight:600;font-variant-numeric:tabular-nums">Rs ${fall} on a lakh</span></span></div>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);text-align:center">Assessed 24 Oct 2026. Next review by 24 Oct 2027.</div>
      <div style="flex:1"></div>
      <button class="btn-primary" onclick="startUpdateFlow()">Update my answers</button>
    </div>`;
}

// ---------------------------------------------------------------- screen: update sheet (S20)

function renderUpdateSheet() {
  return `
    <div style="flex:1;background:rgba(0,14,38,0.45);display:flex;flex-direction:column;justify-content:flex-end">
      <div class="bottom-sheet" style="border-radius:20px 20px 0 0;padding:12px 20px 32px;display:flex;flex-direction:column;gap:20px">
        <div class="sheet-handle"></div>
        <div style="font-size:22px;font-weight:600;line-height:1.3">Update your answers?</div>
        <div style="font-size:16px;color:var(--text-secondary);line-height:1.5">New job, loan paid off, goal moved? Go through your answers and change what's different. A new copy goes to your email.</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn-primary" onclick="goScreen('answers_edit')">Review my answers</button>
          <button class="btn-secondary" onclick="goScreen('my_profile')">Not now</button>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- screen: answers edit for update (S21)

function renderAnswersEdit() {
  const updateCodes = ['A1','A2','A3','A4','A5','A6','A7','A8','T1','T2','T4','T5'];
  const shortLabels = {
    A1:"When you'll use most of it", A2:'Withdrawals in the next 3 years', A3:'Months of expenses set aside',
    A4:'Household income', A5:'Income going to loans', A6:'People who depend on you',
    A7:'Share of family investments', A8:'Health and term cover',
    T1:'Willing to take risk', T2:'Safety or return', T4:'Years investing', T5:'How risky is the market',
  };
  let html = `<div class="screen" style="gap:20px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;height:40px">
      <button class="back-btn" onclick="goScreen('confirm_update')">&#8249;</button>
      <div style="font-size:20px;font-weight:600">Your answers</div>
    </div>
    <div style="display:flex;flex-direction:column;overflow-y:auto;min-height:0;flex:1">`;
  let lastSection = '';
  for (const code of updateCodes) {
    const section = code.startsWith('A') ? 'Your household' : 'You as an investor';
    if (section !== lastSection) {
      html += `<span style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--brand-purple);padding:${lastSection?'20':'8'}px 0 8px">${section}</span>`;
      lastSection = section;
    }
    const q = getQuestion(code);
    const optId = answers[code];
    const opt = q ? q.options.find(o => o.id === optId) : null;
    html += `<a href="#" onclick="event.preventDefault();jumpToQuestion(${flowOrder.indexOf(code)})" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-top:1px solid var(--border-subtle);text-decoration:none;color:var(--text-primary)">
      <span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:13px;color:var(--text-secondary)">${shortLabels[code]||code}</span><span style="font-size:16px">${opt?opt.label:'—'}</span></span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#98A2B3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`;
  }
  html += `</div>
    <button class="btn-primary" onclick="goScreen('confirm_update')" style="position:sticky;bottom:0;box-shadow:0 -8px 16px white">These are up to date</button>
  </div>`;
  return html;
}

// ---------------------------------------------------------------- screen: confirm update (S22)

function renderConfirmUpdate() {
  const w = lastWorkings;
  const p = w && w.profile ? w.profile : null;
  const prev = confirmedResult;
  const anchor = anchorData();
  const prevAnchor = prev ? { pct: prev.summary.fallHeldThrough.percent } : { pct: 0 };
  const absorb = p ? p.ability_band : '—';
  const prevAbsorb = prev ? prev.summary.absorb : '';
  const approach = p ? approachLabel(p.tolerance_band) : '—';
  const prevApproach = prev ? prev.summary.approach : '';
  const exp = experienceLabel();

  function wasLabel(curr, prev) { return curr !== prev && prev ? ` <span style="font-size:13px;font-weight:400;color:var(--text-secondary)">was ${prev}</span>` : ''; }

  return `
    <div class="screen">
      <button class="back-btn" onclick="goScreen('answers_edit')">&#8249;</button>
      <div style="font-size:28px;font-weight:600;line-height:1.2;margin:8px 0 24px">Your updated profile</div>
      <div class="summary-card">
        <div class="summary-row"><div class="label" style="font-size:13px">What your household can absorb</div><div class="value" style="font-size:18px">${absorb}${wasLabel(absorb,prevAbsorb)}</div></div>
        <div class="summary-row"><div class="label" style="font-size:13px">How you approach risk</div><div class="value" style="font-size:18px">${approach}${wasLabel(approach,prevApproach)}</div></div>
        <div class="summary-row"><div class="label" style="font-size:13px">Investing experience</div><div class="value" style="font-size:18px">${exp}</div></div>
        <div class="summary-row highlighted"><div class="label" style="font-size:13px">The fall you'd sit through</div><div class="value" style="font-size:18px">${anchor.pct}%, Rs ${anchor.rs} on a lakh${anchor.pct !== prevAnchor.pct ? ` <span style="font-size:13px;font-weight:400;color:var(--text-secondary)">was ${prevAnchor.pct}%</span>` : ''}</div></div>
      </div>
      <div style="font-size:13px;color:var(--text-secondary)">A copy goes to demo@nestfi.in.</div>
      <div style="flex:1"></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn-primary" onclick="doConfirmUpdate()">These are right</button>
        <button class="btn-secondary" onclick="goScreen('answers_edit')">Back to answers</button>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- screen: result updated (S23)

function renderResultUpdated() {
  const r = confirmedResult;
  if (!r) return '<div class="screen">No result.</div>';
  const level = r.level;
  const prevLevel = r.previousLevel || level;
  const bandLabel = level <= 5 ? 'Low' : level <= 10 ? 'Moderate' : 'High';
  const fall = r.largestFall.rupeesPerLakh.toLocaleString('en-IN');
  const notYetText = level >= 15 ? null : `Level ${level+1} and above`;
  const tickIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><circle cx="12" cy="12" r="11" fill="#CFFCE4"/><path d="M7 12.5l3 3 7-7" stroke="#009466" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const dashIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><circle cx="12" cy="12" r="10" stroke="#98A2B3" stroke-width="2" stroke-dasharray="3 3"/></svg>`;
  const fallIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M4 8l6 6 4-4 6 6" stroke="#B03C00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 11v5h-5" stroke="#B03C00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `
    <div class="screen" style="gap:16px">
      <div style="display:flex;align-items:center;justify-content:center;height:160px"><img src="level_block.svg" style="width:252px;height:160px;object-fit:contain"></div>
      <div style="display:flex;flex-direction:column;gap:6px;text-align:center">
        <span style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--brand-purple)">Your risk profile</span>
        <div style="font-size:32px;font-weight:600;line-height:1.15">Level ${level}</div>
        <div style="font-size:16px;color:var(--text-secondary)">${bandLabel}${level !== prevLevel ? `. Was Level ${prevLevel}.` : ''}</div>
      </div>
      <a href="#" onclick="event.preventDefault()" class="video-card" style="background:#F1EFFC;text-decoration:none;color:var(--text-primary)">
        <span class="video-icon">&#9654;</span>
        <span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:16px;font-weight:600">What Level ${level} means</span><span style="font-size:13px;color:var(--text-secondary)">1 min</span></span>
      </a>
      <div class="info-card">
        <div class="info-row" style="display:flex;align-items:center;gap:12px">${tickIcon}<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--text-secondary)">Open to you</span><span style="font-size:16px;font-weight:600">Levels 1 to ${level}</span></span></div>
        ${notYetText ? `<div class="info-row" style="display:flex;align-items:center;gap:12px">${dashIcon}<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--text-secondary)">Not yet</span><span style="font-size:16px;font-weight:600">${notYetText}</span></span></div>` : ''}
        <div class="info-row" style="display:flex;align-items:center;gap:12px">${fallIcon}<span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--text-secondary)">Largest fall, Level ${level}</span><span style="font-size:16px;font-weight:600;font-variant-numeric:tabular-nums">Rs ${fall} on a lakh</span></span></div>
      </div>
      <div style="flex:1"></div>
      <button class="btn-primary" onclick="goScreen('my_profile')">Done</button>
    </div>`;
}

// ---------------------------------------------------------------- update flow helpers

async function startUpdateFlow() {
  try {
    const res = await fetch(`${API}/risk-profile/update`, { method: 'POST' });
    if (!res.ok) { goScreen('update_sheet'); return; }
    const data = await res.json();
    // Prefill answers from the update response
    for (const [code, optId] of Object.entries(data.prefilled)) {
      if (code === 'STRESS') stressAnswer = optId;
      else answers[code] = optId;
    }
    goScreen('update_sheet');
  } catch { goScreen('update_sheet'); }
}

async function doConfirmUpdate() {
  currentScreen = 'saving';
  render();
  const status = await apiConfirm();
  if (status === 'ok') { currentScreen = 'result_updated'; }
  else if (status === 'email_failed') { currentScreen = 'email_failed'; }
  render();
}

function renderFlowPlaceholder() {
  const labels = { learn_and_invest: 'Learn and invest', goals: 'Goals', build_your_own: 'Build your own portfolio' };
  return `
    <div class="screen center-screen" style="gap:16px">
      <div style="font-size:48px">&#127919;</div>
      <div style="font-size:22px;font-weight:600">${labels[returnToFlow] || returnToFlow}</div>
      <div style="font-size:16px;color:var(--text-secondary);text-align:center">You're in. Your risk profile level is ${confirmedResult ? confirmedResult.level : '—'}.</div>
      <div class="btn-bottom" style="width:100%">
        <a href="#" onclick="event.preventDefault();fullReset()" style="display:flex;align-items:center;justify-content:center;height:44px;color:var(--brand-purple);font-size:16px;font-weight:600;text-decoration:none">Start again</a>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- dev bar: fill sample answers

async function loadPersona(name) {
  if (!name) return;
  await fetch(`${API}/reset`, { method: 'POST' });
  answers = {};
  stressAnswer = null;
  confirmedResult = null;
  lastSaveError = false;
  returnToFlow = null;
  isMinor = false;

  if (name === 'ananya') {
    // Ananya is 15, a minor. Call the entry gate — she should be sent to Request parent.
    isMinor = true;
    // Re-create investor as minor
    // The reset already created a non-minor demo. We need the server to know she's a minor.
    // For the sim, we just show the request parent screen.
    currentScreen = 'request_parent';
    render();
    document.getElementById('persona-select').value = '';
    return;
  }

  const p = PERSONAS[name];
  for (const code of flowOrder) {
    const optId = p[code];
    if (code === 'STRESS') { stressAnswer = optId; }
    else { answers[code] = optId; }
    await apiSaveAnswer(code, optId);
  }
  returnToFlow = 'learn_and_invest';
  currentScreen = 'confirm';
  render();
  document.getElementById('persona-select').value = '';
}

// ---------------------------------------------------------------- boot

init();
