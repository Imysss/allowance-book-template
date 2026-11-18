// 계산 검증: node tests/check.js
// 빈 상태 → 온보딩(설정) → 기록 몇 개 → 월급날 → 날짜 지난 자동이체 → 만기·비상금 예상 → 백업 왕복 → 예전(v2) 백업 변환
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

let NOW = '2026-11-18', TIME = 'T12:00:00';
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW + TIME); }
  static now() { return new RealDate(NOW + TIME).getTime(); }
}
const mem = {};
const ctx = vm.createContext({
  Date: FakeDate, console, JSON, Math,
  localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } },
});
const root = path.join(__dirname, '..');
// const/let/class는 vm 전역에 안 붙으니 마지막에 꺼내 줌
const src = ['history.js', 'config.js', 'legacy.js', 'data.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
  + '\n;globalThis.T = { Store, exampleCfg, useCfg, budgetOf, salaryDateOf, nextSalaryDate, payDates, maturityOf, getC: () => C, getS: () => SCHEDULE };';
vm.runInContext(src, ctx);
const T = ctx.T;
let n = 0;
const eq = (a, b, msg) => { a = JSON.parse(JSON.stringify(a)); assert.deepStrictEqual(a, b, msg); n++; console.log('  ✓', msg, '=', JSON.stringify(a)); };
const at = (d, fn) => { NOW = d; console.log(`\n[${d}]`); fn(); };

// 1. 빈 상태
const store = new T.Store();
at('2026-11-18', () => {
  eq(store.s.setupDone, false, '처음엔 설정 전 (마법사가 열림)');
  eq(store.applyAuto(), 0, '설정 전엔 자동이체 반영 안 함');
});

// 2. 온보딩 (마법사에서 고른 값)
at('2026-11-18', () => {
  const cfg = T.exampleCfg();
  cfg.accounts = [
    { id: 'main', name: '월급통장', role: '', color: '#000', kind: 'bank' },
    { id: 'cash', name: '현금', role: '', color: '#000', kind: 'cash' },
    { id: 'bill', name: '고정비', role: '', color: '#000', kind: 'bank' },
    { id: 'emerg', name: '비상금', role: '', color: '#000', kind: 'bank', emergency: true },
    { id: 'sav1', name: '적금', role: '', color: '#000', kind: 'saving' },
  ];
  cfg.salary = 2500000; cfg.salaryDay = 25; cfg.livingAcc = 'main';
  cfg.split = [];
  cfg.savings = [{ acc: 'sav1', from: 'emerg', amount: 250000, start: '2026-10-22', rounds: 6, paidBefore: 1, maturity: '', rate: 3.0 }];
  cfg.fund = { on: true, acc: 'emerg' };
  cfg.livingIn = { acc: 'bill', amount: 700000 };
  cfg.fixed = [
    { id: 'f1', name: '통신비', amount: 55000, day: 12, acc: 'bill', since: '2026-11-18' },
    { id: 'f2', name: '보험', amount: 61000, day: 23, acc: 'bill', since: '2026-11-18' },
    { id: 'f3', name: '말일 출금', amount: 10000, day: 31, acc: 'bill', since: '2026-11-18' },
  ];
  store.setCfg(cfg);
  Object.assign(store.s.base, { main: 400000, cash: 50000, bill: 100000, emerg: 500000, sav1: 250000 });
  store.s.baseEmergency = 100000;
  store.s.baseDate = '2026-11-18';
  store.s.setupDone = true; store.save();
  eq(T.getS().map(i => i.key), ['sav1-2026-11-22', 'sav1-2026-12-22', 'sav1-2027-01-22', 'sav1-2027-02-22', 'sav1-2027-03-22'], '자동이체 일정 (1회차는 이미 냄)');
  eq(store.pending('emerg'), 250000, '11/22 적금 이체 대기 (돈은 이미 비상금 통장에 있음)');
  const em = store.emergency();
  eq([em.total, em.monthly, em.cash], [250000, 150000, 100000], '비상금 = 50만 - 대기 25만 (매달 15만 / 현금 10만)');
  eq(store.saved(), 250000, '모은 돈');
  eq(T.nextSalaryDate(), '2026-11-25', '다음 월급날');
  eq(T.getC().salaryAcc, 'main', '월급 받는 통장을 안 고르면 생활비 통장');
  eq([store.fixedTotal(), store.fixedLeft('bill')], [126000, 71000], '고정지출 합계 · 이번 달 남은 것 (12일분은 등록 전이라 다음 달부터)');
  eq(store.nextFixed('bill').date, '2026-11-23', '다음 자동출금');
});

// 3. 기록 몇 개
at('2026-11-18', () => {
  const add = (acc, amt, cat, extra = {}) => store.s.tx.push({ id: Math.random().toString(36), date: NOW, acc, amt, cat, memo: '', kind: 'manual', ...extra });
  add('main', -12000, '식사', { sub: '점심', opt: '혼자' });
  add('cash', -5000, '카페');
  add('emerg', -30000, '병원비', { fund: 'cash' });
  add('main', -3000, '카페', { gift: true });
  eq(store.balance('main'), 388000, '월급통장 (기프티콘은 잔액에서 안 빠짐)');
  eq(store.balance('cash'), 45000, '현금');
  eq(store.livingSpent('2026-10-25'), 12000, '이번 달 사용한 생활비 (기프티콘 제외)');
  const em = store.emergency();
  eq([em.total, em.monthly, em.cash], [220000, 150000, 70000], '현금 비상금에서 3만 씀');
});

// 4. 날짜 지난 자동이체
at('2026-11-23', () => {
  eq(store.applyAuto(), 2, '11/22 적금 자동이체 + 11/23 보험 자동출금 (0시 기준 당일 포함)');
  eq(store.balance('bill'), 39000, '고정지출 통장에서 보험료 출금');
  eq(store.applyAuto(), 0, '두 번 반영 안 함');
  eq([store.balance('emerg'), store.balance('sav1'), store.paidRounds('sav1')], [220000, 500000, 2], '비상금 통장 → 적금 2회차');
  eq(store.pending('emerg'), 0, '이체 대기 없음 (12월분 돈은 아직 안 들어옴)');
});

// 5. 월급날 버튼
at('2026-11-25', () => {
  eq(T.nextSalaryDate(), '2026-11-25', '오늘이 월급날');
  store.addSalary('2026-11-25', 2500000);
  eq([store.salaryDone('2026-12', 'pay'), store.salaryDone('2026-12', 'split')], [true, false], '월급 입금! (생활비 입금은 아직)');
  eq(store.balance('main'), 388000 + 2500000, '월급 받는 통장에 월급만 들어옴');
  store.addLivingIn('2026-11-25', 700000);
  eq(store.salaryDone('2026-12', 'split'), true, '생활비 입금! 기록됨 (고정지출 통장에 바로 입금)');
  eq(store.s.tx.filter(t => t.step === 'split').map(t => [t.acc, t.amt, t.cat]), [['bill', 700000, '생활비']], '생활비 입금은 다른 통장에서 빼지 않음');
  // 비상금 통장으로는 직접 이체 (예전 테스트 흐름 유지)
  store.s.tx.push({ id: 'tr1', date: '2026-11-25', acc: 'main', amt: -500000, cat: '이체', kind: 'manual', group: 'tr', transfer: true },
    { id: 'tr2', date: '2026-11-25', acc: 'emerg', amt: 500000, cat: '이체', kind: 'manual', group: 'tr', transfer: true });
  eq(store.balance('main'), 388000 + 2500000 - 500000, '월급통장 = 월급 - 비상금 이체');
  eq([store.balance('bill'), store.balance('emerg')], [739000, 720000], '고정비 통장 생활비 입금 · 비상금 통장 이체');
  eq(store.pending('emerg'), 250000, '12/22 적금 이체 대기가 생김');
  eq(store.emergency().total, 470000, '비상금은 대기분을 뺀 금액');
});

// 6. 다음 자동이체 + 예상
at('2026-12-23', () => {
  eq(store.applyAuto(), 4, '11/30 말일·12/12·12/23 고정지출 3건 + 12/22 적금 1건');
  eq(store.balance('bill'), 739000 - 10000 - 55000 - 61000, '고정지출 통장 잔액');
  eq(store.applyAuto(), 0, '고정지출도 두 번 안 나감');
  eq([store.balance('emerg'), store.balance('sav1'), store.paidRounds('sav1')], [470000, 750000, 3], '3회차까지 납입');
  eq(store.horizon(), '2027-03', '예상 기준 = 마지막 납입 예산월');
  eq(store.emergencyForecast(), 470000 - 3 * 250000, '비상금 예상 = 지금 - 남은 적금 3번 (월급에서 비상금으로 정해진 이체가 없으니)');
  const f = store.forecast('sav1');
  eq([f.maturity, f.principal], ['2027-04-22', 1500000], '만기일(자동) · 원금');
  const pre = ['2026-10-22', '2026-11-22', '2026-12-22', '2027-01-22', '2027-02-22', '2027-03-22']
    .reduce((s, d) => s + Math.round(250000 * 0.03 * Math.round((new RealDate('2027-04-22') - new RealDate(d)) / 864e5) / 365), 0);
  eq(f.pre, pre, '세전 이자 (회차별 일수 단리)');
  eq(f.tax, Math.floor(pre * 0.154 / 10) * 10, '이자소득세');
});

// 6-1. 0시 기준: 날짜가 바뀐 직후(00:00)에 그날 고정지출이 찍힘
TIME = 'T00:00:30';
at('2027-01-12', () => {
  const before = store.balance('bill');
  eq(store.applyAuto(), 2, '1/12 0시 0분 30초에 열면 → 12/31 말일 출금 + 1/12 통신비');
  const t = store.s.tx[store.s.tx.length - 1];
  eq([t.date, t.kind, t.acc, t.amt, t.cat, t.memo], ['2027-01-12', 'fixed', 'bill', -55000, '고정지출', '통신비'], '지출 내역에 그 날짜로 기록');
  eq(store.balance('bill'), before - 10000 - 55000, '잔액 반영');
});

TIME = 'T12:00:00';
// 7. 백업 왕복 (기록 + 설정 한 파일)
at('2026-12-23', () => {
  const back = T.Store.fromData(JSON.parse(JSON.stringify(store.s)));
  eq(back.cfg.savings[0].amount, 250000, '백업에 설정 포함');
  eq(back.tx.length, store.s.tx.length, '백업에 기록 포함');
  const s2 = new T.Store();
  eq(s2.balance('emerg'), 470000, '다시 열어도(localStorage) 같은 잔액');
});

// 8. 월급날 31일 · 짧은 달
at('2027-02-28', () => {
  store.s.cfg.salaryDay = 31; T.useCfg(store.s.cfg);
  eq([T.budgetOf('2027-02-27'), T.budgetOf('2027-02-28'), T.salaryDateOf('2027-03')], ['2027-02', '2027-03', '2027-02-28'], '2월은 28일이 월급날');
  store.s.cfg.salaryDay = 25; T.useCfg(store.s.cfg);
});

// 9. 예전 개인용 백업(version 2) 변환
at('2027-01-12', () => {
  const v2 = {
    version: 2, baseDate: '2026-11-01', kksMaturity: '2027-06-10', rates: { cpd: 3.5, kks: null }, bonusExpect: null, baseEmergency: 70000,
    base: { kb: 100000, cash: 10000, nh: 50000, sh: 200000, cpd: 111000, kk: 0, kks: 222000, bonus: 0 },
    applied: { 'kks-2027-01-10': true },
    tx: [
      { id: 'a1', date: '2026-11-25', acc: 'kb', amt: 1000000, cat: '월급', kind: 'salary', group: 'g1', budget: '2026-12', transfer: false },
      { id: 'a2', date: '2026-11-25', acc: 'kb', amt: -333000, cat: '이체', kind: 'salary', group: 'g1', budget: '2026-12', transfer: true },
      { id: 'a3', date: '2026-11-25', acc: 'nh', amt: 333000, cat: '이체', kind: 'salary', group: 'g1', budget: '2026-12', transfer: true },
      { id: 'a4', date: '2026-11-25', acc: 'kb', amt: -10000, cat: '곗돈', kind: 'salary', group: 'g1', budget: '2026-12', transfer: false },
      { id: 'a5', date: '2027-01-10', acc: 'kk', amt: -222000, cat: '적금', memo: '카카오 적금 2회차 자동이체', kind: 'auto', group: 'g2', transfer: true },
      { id: 'a6', date: '2027-01-10', acc: 'kks', amt: 222000, cat: '적금', memo: '2회차 납입', kind: 'auto', group: 'g2', transfer: true },
      { id: 'a7', date: '2026-12-01', acc: 'kb', amt: -4500, cat: '커피', memo: '', kind: 'manual', opt: '혼자' },
      { id: 'a8', date: '2026-12-02', acc: 'sh', amt: -9000, cat: '헌금', memo: '', kind: 'manual', fund: 'cash' },
    ],
  };
  const s = T.Store.fromData(v2);
  eq(s.setupDone, false, '변환 후 마법사로 확인');
  eq(s.cfg.accounts.map(a => a.id), ['kb', 'cash', 'nh', 'sh', 'cpd', 'kk', 'kks', 'bonus'], '통장 id 유지');
  eq([s.cfg.salary, s.cfg.salaryDay], [1000000, 25], '월급·월급날을 기록에서 찾음');
  eq(s.cfg.split, [{ to: 'nh', amount: 333000, label: '농협' }, { to: null, amount: 10000, label: '곗돈' }], '분배를 기록에서 찾음');
  const kks = s.cfg.savings.find(x => x.acc === 'kks'), cpd = s.cfg.savings.find(x => x.acc === 'cpd');
  eq([kks.amount, kks.start, kks.paidBefore, kks.maturity], [222000, '2026-12-10', 1, '2027-06-10'], '카카오 적금: 자동이체 기록에서 금액·첫 납입일');
  eq([cpd.amount, cpd.start, cpd.rate], [111000, '', 3.5], '신한 적금: 금액은 잔액에서, 날짜는 마법사에서 확인');
  eq(s.tx.find(t => t.id === 'a7').cat, '카페', '예전 분류 이름 변환 (커피 → 카페)');
  eq(s.cfg.cats.out.some(c => c[0] === '헌금'), true, '기록에 쓰인 분류를 분류 목록에 추가');
  eq(s.cfg.fund, { on: true, acc: 'sh' }, '비상금 구분 통장');
  const st = new T.Store(); st.replace(s);
  eq([st.balance('kb'), st.balance('kks'), st.emergency().cash], [100000 + 1000000 - 343000 - 4500, 444000, 61000], '변환 후 잔액·현금 비상금 그대로');
  cpd.start = '2026-11-05'; st.setCfg(s.cfg); st.s.setupDone = true; // 마법사에서 날짜 확인했다고 가정
  eq(st.applyAuto(), 2, '이미 반영된 카카오 1/10은 다시 안 넣고, 신한 12/5·1/5만 반영');
  eq(st.balance('cpd'), 333000, '신한 적금 3회차까지');
});

console.log(`\n모두 통과 (${n}개 확인)`);
