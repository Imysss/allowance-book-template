// ===== 설정 마법사(처음) · 설정하기(나중에) =====
// 둘 다 같은 단계(setup-steps.js)를 써요. 마법사는 한 단계씩, 설정하기는 위 탭으로 골라요.
const WIZARD = ['accounts', 'salary', 'split', 'fixed', 'savings', 'emerg', 'cats', 'balance'];
const SETTINGS = ['accounts', 'salary', 'split', 'fixed', 'savings', 'emerg', 'cats', 'balance', 'backup'];
let D = null, step = 0, catSide = 'out';

// 분류 → 편집용 줄 / 편집용 줄 → 분류
function toCatRows(c) {
  const rows = k => c.cats[k].filter(x => x[0] !== '기타').map(([name, emoji]) => ({
    orig: name, name, emoji,
    subs: (c.subcats[name] || []).join(', '),
    opt: c.opts[name] ? `${c.opts[name].label}: ${c.opts[name].choices.join(', ')}` : '',
    optional: c.optionalSubs.includes(name),
  }));
  return { out: rows('out'), in: rows('in') };
}
const splitList = s => String(s || '').split(/[,，]/).map(x => x.trim()).filter(Boolean);
function fromCatRows(rows) {
  const cats = {}, subcats = {}, opts = {}, optionalSubs = [];
  for (const k of ['out', 'in']) {
    const seen = new Set();
    cats[k] = rows[k].filter(r => r.name.trim() && !seen.has(r.name.trim()) && seen.add(r.name.trim()))
      .map(r => [r.name.trim(), r.emoji.trim() || '✏️']).concat([['기타', '✏️']]);
  }
  for (const r of rows.out) {
    const name = r.name.trim(); if (!name) continue;
    if (splitList(r.subs).length) subcats[name] = splitList(r.subs);
    const m = String(r.opt || '').match(/^\s*([^:：]+)[:：](.+)$/);
    if (m && splitList(m[2]).length) opts[name] = { label: m[1].trim(), choices: splitList(m[2]) };
    if (r.optional) optionalSubs.push(name);
  }
  return { cats, subcats, opts, optionalSubs };
}

function openSetup(mode) {
  const s = store.s;
  D = { mode, cfg: clone(s.cfg), base: { ...s.base }, baseEmergency: s.baseEmergency, bonusExpect: s.bonusExpect };
  D.catRows = toCatRows(D.cfg);
  D.snap = draftKey();
  step = 0; catSide = 'out';
  $('#setup').hidden = false; $('#app').hidden = true;
  document.body.classList.add('in-setup');
  drawSetup();
  syncBack();
}
function closeSetup() {
  $('#setup').hidden = true; $('#app').hidden = false;
  document.body.classList.remove('in-setup');
  D = null;
  syncBack();
}
// 바뀐 게 있는지 비교용 (catSide 같은 화면 상태는 제외)
const draftKey = () => JSON.stringify([D.cfg, D.base, D.baseEmergency, D.bonusExpect, D.catRows]);
const stepList = () => (D.mode === 'wizard' ? WIZARD : SETTINGS);

function syncSavings() {
  const c = D.cfg, plain = c.accounts.filter(a => !isSaving(a));
  c.savings = c.savings.filter(sv => c.accounts.some(a => a.id === sv.acc && a.kind === 'saving'));
  for (const a of c.accounts) if (a.kind === 'saving' && !c.savings.some(sv => sv.acc === a.id)) {
    c.savings.push({ acc: a.id, from: (plain.find(p => p.emergency) || plain[0] || {}).id || null, amount: 0,
      start: addMonths(today(), 1), rounds: 12, paidBefore: 0, maturity: '', rate: null });
  }
  for (const sv of c.savings) if (!plain.some(p => p.id === sv.from)) sv.from = plain[0]?.id || null;
  if (!plain.some(a => a.id === c.livingAcc)) c.livingAcc = plain[0]?.id;
  if (!plain.some(a => a.id === c.salaryAcc)) c.salaryAcc = c.livingAcc;
  c.split = c.split.filter(sp => sp.to === null || (sp.to !== c.salaryAcc && c.accounts.some(a => a.id === sp.to)));
  if (!plain.some(a => a.id === c.livingIn.acc)) c.livingIn.acc = c.livingAcc;
  for (const f of c.fixed) if (!plain.some(p => p.id === f.acc)) f.acc = plain[0]?.id;
  c.sumAccs = c.sumAccs.filter(id => plain.some(a => a.id === id));
  if (!c.accounts.some(a => a.id === c.fund.acc && a.emergency)) c.fund.acc = (plain.find(a => a.emergency) || {}).id || null;
}

function drawSetup() {
  syncSavings();
  const list = stepList(), key = list[step], st = STEPS[key], wiz = D.mode === 'wizard';
  $('#setupTitle').textContent = wiz ? `${step + 1}/${list.length} · ${st.title}` : '⚙️ 설정하기';
  $('#setupClose').hidden = wiz;
  $('#setupTabs').innerHTML = list.map((k, i) => wiz
    ? `<i class="${i <= step ? 'on' : ''}"></i>`
    : `<button class="chip ${i === step ? 'on' : ''}" data-step="${i}">${STEPS[k].title}</button>`).join('');
  $('#setupTabs').className = wiz ? 'setup-progress' : 'chips setup-tabs'; // 줄바꿈: 옆으로 밀지 않아도 다 보이게
  const intro = wiz && step === 0
    ? `<div class="welcome">👋 처음 오셨네요! 내 통장·월급·적금 구조로 맞춰볼게요.<br><span>예시가 채워져 있으니 고치기만 하면 돼요. 백업 파일이 있다면 <button class="link" data-act="import">불러오기</button></span></div>` : '';
  const notice = wiz && step === 0 && store.s.fromV2 ? `<div class="hint warn">예전 버전 백업을 불러왔어요. 기록에서 찾은 값으로 채웠으니 통장·월급·적금 날짜가 맞는지 확인해 주세요.</div>` : '';
  $('#setupBody').innerHTML = intro + notice + (st.lead ? `<div class="lead">${st.lead}</div>` : '') + st.draw();
  $('#setupPrev').hidden = !wiz || step === 0;
  $('#setupNext').textContent = wiz ? (step === list.length - 1 ? '다 됐어요! 시작하기' : '다음') : '설정 저장';
  $('#setupNext').hidden = key === 'backup';
}

// ----- 입력값을 D에 바로 반영 -----
function setPath(path, value) {
  const parts = path.split('.');
  let o = parts[0] in D ? D : D.cfg;
  for (const p of parts.slice(0, -1)) o = o[p];
  o[parts[parts.length - 1]] = value;
}
function readInput(el) {
  const t = el.dataset.t;
  if (t === 'won') return parseWon(el.value);
  if (t === 'int') return parseInt(el.value, 10) || 0;
  if (t === 'float') { const v = parseFloat(el.value.replace(',', '.')); return isNaN(v) ? null : v; }
  if (t === 'bool') return el.checked;
  if (t === 'to') return el.value || null;
  return el.value;
}
function onSetupInput(e) {
  const el = e.target; if (!el.dataset.k) return;
  if (el.dataset.t === 'won' && e.type === 'input') fmtInput(el);
  setPath(el.dataset.k, readInput(el));
  if (e.type === 'change' && el.dataset.r) {
    // 마법사에서 첫 납입일을 바꾸면 날짜 지난 회차를 "이미 낸 회차"로 (지금 잔액에 들어 있으니)
    if (el.dataset.r === 'start' && D.mode === 'wizard') {
      const sv = D.cfg.savings[+el.dataset.k.split('.')[1]];
      sv.paidBefore = payDates(sv).filter(d => d <= today()).length;
    }
    drawSetup();
  }
}

// ----- 버튼 -----
const ACTS = {
  color(i) { const a = D.cfg.accounts[i]; a.color = COLORS[(COLORS.indexOf(a.color) + 1) % COLORS.length]; },
  kind(i, v) { D.cfg.accounts[i].kind = v; if (isSaving(D.cfg.accounts[i])) D.cfg.accounts[i].emergency = false; },
  addAcc() { D.cfg.accounts.push({ id: newId(), name: '', role: '', kind: 'bank', color: COLORS[D.cfg.accounts.length % COLORS.length] }); },
  delAcc(i) {
    const a = D.cfg.accounts[i], n = store.s.tx.filter(t => t.acc === a.id).length;
    if (n) return toast(`기록이 ${n}개 있는 통장은 지울 수 없어요`), false;
    if (D.cfg.accounts.filter(x => !isSaving(x)).length === 1 && !isSaving(a)) return toast('입출금 통장이 하나는 있어야 해요'), false;
    D.cfg.accounts.splice(i, 1); delete D.base[a.id];
  },
  living(_, v) { D.cfg.livingAcc = v; },
  salaryAcc(_, v) { D.cfg.salaryAcc = v; },
  homeLeft(_, v) { D.cfg.homeLeft = v; },
  addFixed() { const c = D.cfg; c.fixed.push({ id: newId(), name: '', memo: '', amount: 0, day: c.salaryDay, acc: (c.fixed[c.fixed.length - 1] || {}).acc || c.livingAcc, cat: '고정지출', since: today() }); },
  delFixed(i) { D.cfg.fixed.splice(i, 1); },
  livingInAcc(_, v) { D.cfg.livingIn.acc = v; },
  up(i) { if (i > 0) { const a = D.cfg.accounts; [a[i - 1], a[i]] = [a[i], a[i - 1]]; } },
  fundAcc(_, v) { D.cfg.fund.acc = v; },
  sumAcc(_, v) {
    const s = D.cfg.sumAccs;
    if (s.includes(v)) s.splice(s.indexOf(v), 1); else if (s.length < 3) s.push(v); else return toast('최대 3개까지 골라요'), false;
  },
  catSide(_, v) { catSide = v; },
  addCat() { D.catRows[catSide].push({ orig: null, name: '', emoji: '✏️', subs: '', opt: '', optional: false }); },
  delCat(i) { D.catRows[catSide].splice(i, 1); },
  export() { exportData(); return false; },
  import() { $('#fileInput').click(); return false; },
  clearRecords() {
    if (!confirm('기록과 잔액을 모두 지울까요? 설정은 그대로예요. 되돌릴 수 없으니 먼저 백업을 저장해 두세요.')) return false;
    store.clearRecords(); closeSetup(); refreshAuto(); toast('기록을 지웠어요'); return false;
  },
  resetAll() {
    if (!confirm('설정과 기록을 모두 지우고 처음으로 돌아갈까요? 되돌릴 수 없으니 먼저 백업을 저장해 두세요.')) return false;
    store.resetAll(); closeSetup(); openSetup('wizard'); return false;
  },
};
function onSetupClick(e) {
  const tabBtn = e.target.closest('[data-step]');
  if (tabBtn) { step = +tabBtn.dataset.step; drawSetup(); window.scrollTo(0, 0); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (ACTS[b.dataset.act](+b.dataset.i, b.dataset.v) !== false && D) drawSetup();
}

// ----- 확인 -----
function checkStep(key) {
  const c = D.cfg;
  if (key === 'accounts') {
    if (c.accounts.some(a => !a.name.trim())) return '이름이 빈 통장이 있어요';
    if (!c.accounts.some(a => !isSaving(a))) return '입출금이나 현금 통장이 하나는 있어야 해요';
  }
  if (key === 'salary') {
    if (!(c.salaryDay >= 1 && c.salaryDay <= 31)) return '월급날은 1~31 사이로 적어주세요';
  }
  if (key === 'savings') for (const sv of c.savings) {
    const n = accName2(sv.acc);
    if (!sv.from) return `${n}: 어느 통장에서 낼지 골라주세요`;
    if (!(sv.amount > 0)) return `${n}: 매달 넣는 돈을 적어주세요`;
    if (!isYmd(sv.start)) return `${n}: 첫 납입일을 골라주세요`;
    if (!(sv.rounds >= 1 && sv.rounds <= 120)) return `${n}: 총 회차를 확인해 주세요`;
    if (sv.paidBefore < 0 || sv.paidBefore > sv.rounds) return `${n}: 이미 낸 회차가 총 회차보다 많아요`;
  }
  if (key === 'fixed') for (const f of c.fixed) {
    if (!f.name.trim()) return '이름이 빈 고정지출이 있어요';
    if (!(f.amount > 0)) return `${f.name}: 금액을 적어주세요`;
    if (!(f.day >= 1 && f.day <= 31)) return `${f.name}: 날짜는 1~31 사이로 적어주세요`;
  }
  if (key === 'cats' && ['out', 'in'].some(k => !D.catRows[k].some(r => r.name.trim()))) return '분류가 하나는 있어야 해요';
  return null;
}
function finishSetup() {
  for (const k of stepList()) { const err = checkStep(k); if (err) { step = stepList().indexOf(k); drawSetup(); return toast(err); } }
  // 이름 바꾼 분류는 예전 기록도 같이 바꿈
  for (const k of ['out', 'in']) for (const r of D.catRows[k]) {
    const name = r.name.trim();
    if (r.orig && name && r.orig !== name) for (const t of store.s.tx) if (t.cat === r.orig && (t.amt < 0) === (k === 'out')) t.cat = name;
  }
  const s = store.s, first = !s.setupDone;
  store.setCfg({ ...D.cfg, ...fromCatRows(D.catRows) });
  s.base = { ...s.base, ...D.base };
  s.baseEmergency = D.baseEmergency || 0;
  s.bonusExpect = D.bonusExpect || null;
  if (first && !s.tx.length) s.baseDate = today();
  s.setupDone = true; delete s.fromV2;
  persist(); closeSetup(); switchTab(tab); refreshAuto();
  toast(first ? '🎉 준비 끝! 이제 기록해 보세요' : '저장했어요');
}

$('#setup').addEventListener('input', onSetupInput);
$('#setup').addEventListener('change', onSetupInput);
$('#setup').addEventListener('click', onSetupClick);
// 바꾼 게 없으면 바로 닫고, 바꾼 게 있을 때만 확인
$('#setupClose').onclick = () => { if (draftKey() === D.snap || confirm('바꾼 내용을 저장하지 않고 닫을까요?')) closeSetup(); };
$('#setupPrev').onclick = () => { step--; drawSetup(); window.scrollTo(0, 0); };
$('#setupNext').onclick = () => {
  if (D.mode !== 'wizard' || step === WIZARD.length - 1) return finishSetup();
  const err = checkStep(WIZARD[step]); if (err) return toast(err);
  step++; drawSetup(); window.scrollTo(0, 0);
};
