// ===== 사용자 설정 (통장 · 월급 · 적금 · 분류) =====
// 코드에는 예시값만 있어요. 실제 값은 처음 설정 마법사에서 정하고 기기(localStorage)에 저장돼요.
const TAX = 0.154;
const KINDS = [['bank', '입출금'], ['cash', '현금'], ['saving', '적금'], ['deposit', '예금']];
const COLORS = ['#e0a800', '#2e9e5b', '#2f5fd0', '#7c4dcc', '#c2553a', '#1f9bb5', '#d64d8a', '#6b7a8f', '#8a6d00', '#3c7a5a'];
const FUNDS = { monthly: '매달 비상금', cash: '현금 비상금' };

// ===== 날짜 유틸 =====
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const toDate = s => new Date(s + 'T00:00:00');
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const lastDay = (y, m0) => new Date(y, m0 + 1, 0).getDate();
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
// "2026-01-31" + 1달 → "2026-02-28" (말일 보정, 원래 날짜 기준)
function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  t.setDate(Math.min(d, lastDay(t.getFullYear(), t.getMonth())));
  return ymd(t);
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

// ===== 기본 분류 =====
const WHO = { label: '누구랑', choices: ['혼자 먹음', '내가 사줌'] };
const DEFAULT_CATS = {
  out: [['식비', '🍚'], ['카페', '☕'], ['간식', '🍪'], ['통신비', '📱'], ['관리비', '🏢'], ['자동차', '🚗'], ['교통비', '🚌'],
        ['경조사비', '💐'], ['선물', '🎁'], ['옷', '👕'], ['화장품', '💄'], ['생필품', '🧴'], ['병원비', '💊'], ['세탁비', '🧺'],
        ['택배·소포', '📦'], ['헌금', '⛪'], ['모임·여행', '🧳'], ['취미', '🎨'], ['현금', '💵'], ['기타', '✏️']],
  in:  [['월급', '💼'], ['용돈', '🪙'], ['환급', '🔄'], ['이자', '✨'], ['기타', '✏️']],
};
const DEFAULT_SUBCATS = {
  '식비': ['외식비', '재료비'],
  '자동차': ['기름', '수리', '세금', '관리'],
  '교통비': ['톨비', '지하철', 'KTX'],
};
const DEFAULT_OPTS = { '식비': WHO, '카페': WHO };

// 처음 열었을 때 마법사에 미리 채워지는 예시
function exampleCfg() {
  return {
    accounts: [
      { id: 'fix', name: '고정지출 통장', role: '고정지출', color: COLORS[1], kind: 'bank' },
      { id: 'live', name: '생활비 통장', role: '생활비', color: COLORS[0], kind: 'bank' },
      { id: 'pay', name: '월급통장', role: '비상금', color: COLORS[2], kind: 'bank', emergency: true },
      { id: 'cash', name: '현금', role: '지갑', color: COLORS[7], kind: 'cash' },
    ],
    salaryAcc: 'pay', livingAcc: 'live', salary: 3000000, salaryDay: 25, livingBudget: 0, livingFloor: 0,
    livingIn: { acc: 'fix', amount: 1000000 },
    split: [],
    fixed: [
      { id: 'ex1', name: '휴대폰 요금', memo: '', amount: 50000, day: 15, acc: 'fix', cat: '통신비', since: today() },
      { id: 'ex2', name: '보험료', memo: '', amount: 80000, day: 25, acc: 'fix', cat: '고정지출', since: today() },
    ],
    savings: [],
    fund: { on: false, acc: null },
    homeLeft: 'spent', showEmerg: false,
    sumAccs: ['fix', 'live', 'pay'],
    cats: clone(DEFAULT_CATS), subcats: clone(DEFAULT_SUBCATS), opts: clone(DEFAULT_OPTS), optionalSubs: [],
    plan: '',
  };
}

// ===== 지금 쓰는 설정 (Store가 불러올 때 useCfg로 바꿈) =====
let C = exampleCfg();
let SCHEDULE = [];

const accOf = id => C.accounts.find(a => a.id === id) || { id, name: '(지운 통장)', role: '', color: '#999', kind: 'bank' };
const accName = id => accOf(id).name;
const isSaving = a => a.kind === 'saving' || a.kind === 'deposit';
const savingOf = id => C.savings.find(s => s.acc === id);
const fundAcc = () => (C.fund && C.fund.on && C.accounts.some(a => a.id === C.fund.acc && a.emergency) ? C.fund.acc : null);
const dotText = a => a.kind === 'saving' ? '적금' : a.kind === 'deposit' ? '예금' : a.name.slice(0, 2);

// 적금 회차별 납입일 (첫 납입일부터 한 달씩)
function payDates(sv) {
  if (!isYmd(sv.start) || !(sv.rounds > 0)) return [];
  return Array.from({ length: sv.rounds }, (_, i) => addMonths(sv.start, i));
}
const maturityOf = sv => sv.maturity || (isYmd(sv.start) ? addMonths(sv.start, sv.rounds || 0) : '');

// 날짜가 되면 자동으로 들어가는 이체 (이미 낸 회차는 시작 잔액에 들어 있으니 제외)
function buildSchedule(cfg) {
  return cfg.savings.filter(sv => sv.from && sv.amount > 0).flatMap(sv =>
    payDates(sv).slice(sv.paidBefore || 0).map((date, i) => ({
      key: `${sv.acc}-${date}`, date, from: sv.from, to: sv.acc, amount: sv.amount, round: (sv.paidBefore || 0) + i + 1,
    }))).sort((a, b) => a.date.localeCompare(b.date));
}
function useCfg(cfg) { C = cfg; SCHEDULE = buildSchedule(cfg); }

// ===== 고정지출: 매달 그 날짜 0시가 되면 나가는 통장에서 자동 출금 =====
const fixedDateIn = (f, ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(Math.min(f.day, lastDay(y, m - 1)))}`; };
// since(등록한 날)부터 오늘까지 날짜가 된 출금들
function dueFixed(t) {
  const out = [];
  for (const f of C.fixed || []) {
    if (!(f.amount > 0) || !f.acc || !isYmd(f.since)) continue;
    for (let ym = f.since.slice(0, 7); ym <= t.slice(0, 7); ym = addMonths(ym + '-01', 1).slice(0, 7)) {
      const date = fixedDateIn(f, ym);
      if (date >= f.since && date <= t) out.push({ key: `fx-${f.id}-${ym}`, date, f });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
// 다음 출금일 (오늘 이후)
function nextFixedDate(f, t) {
  const ym = t.slice(0, 7), d = fixedDateIn(f, ym);
  return d > t && d >= f.since ? d : fixedDateIn(f, addMonths(ym + '-01', 1).slice(0, 7));
}

// 예산월: 월급날부터는 다음 달 예산 (월급날이 31일이면 짧은 달은 말일)
const payDayIn = (y, m0) => Math.min(C.salaryDay, lastDay(y, m0));
function budgetOf(dateStr) {
  const d = toDate(dateStr);
  if (d.getDate() >= payDayIn(d.getFullYear(), d.getMonth())) d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
// 예산월 "2026-12"의 월급날 (11월 25일)
function salaryDateOf(budget) {
  const [y, m] = budget.split('-').map(Number);
  const t = new Date(y, m - 2, 1);
  t.setDate(payDayIn(t.getFullYear(), t.getMonth()));
  return ymd(t);
}
const nextBudget = b => addMonths(b + '-01', 1).slice(0, 7);
// 다음 월급날 (오늘이 월급날이면 오늘)
function nextSalaryDate() {
  const t = today(), cur = salaryDateOf(budgetOf(t));
  return cur === t ? t : salaryDateOf(nextBudget(budgetOf(t)));
}

// ===== 분류 =====
const catsOf = sign => C.cats[sign < 0 ? 'out' : 'in'];
const optOf = t => t.opt || (t.treat ? '내가 사줌' : null);
const catLabel = t => [t.sub ? `${t.cat}(${t.sub})` : t.cat, optOf(t), t.gift ? '🎁 기프티콘' : null, FUNDS[t.fund]].filter(Boolean).join(' · ');
const SYS_EMOJI = { '이체': '🔁', '적금': '🐷', '보너스': '🎉', '월급': '💼', '고정지출': '📌', '생활비': '🏦' };
const emojiOf = cat => SYS_EMOJI[cat] || [...C.cats.out, ...C.cats.in].find(c => c[0] === cat)?.[1] || '✏️';
const isPreset = (cat, sign) => catsOf(sign).some(c => c[0] === cat);
// 받침에 따라 "로/으로"
function ro(word) {
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  if (code < 0 || code > 11171) return word + '로';
  const jong = code % 28;
  return word + (jong === 0 || jong === 8 ? '로' : '으로');
}
