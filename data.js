// ===== 데이터·계산 (화면과 무관한 로직) =====
// 개인용 앱(allowance-v2)과 같은 주소(github.io)에서 열려도 서로 덮어쓰지 않게 키를 따로 씀
const KEY = 'allowance-template-v3';

function emptyState(cfg) {
  return {
    version: 3,
    setupDone: false,
    cfg: cfg || exampleCfg(),
    baseDate: today(),
    base: {},          // 통장별 시작 잔액
    applied: {},       // 반영된 자동이체 key
    baseEmergency: 0,  // 비상금 통장 중 "현금 비상금" (매달 비상금과 구분)
    bonusExpect: null, // 예상에 더할 돈 (보너스 등)
    tx: [...HISTORY_TX], // { id, date, acc, amt(부호 포함), cat, sub, opt, memo, kind: manual|salary|auto, group, transfer, budget, gift, fund }
  };
}

// 설정값 빈칸 채우기 (예전 버전 저장본·직접 고친 파일도 안전하게)
function normalizeCfg(cfg) {
  const ex = exampleCfg(), c = { ...ex, ...cfg };
  c.accounts = (Array.isArray(c.accounts) ? c.accounts : ex.accounts).filter(a => a && a.id)
    .map((a, i) => ({ role: '', color: COLORS[i % COLORS.length], kind: 'bank', ...a, name: String(a.name || '통장') }));
  if (!c.accounts.some(a => a.kind === 'bank' || a.kind === 'cash')) c.accounts.unshift({ id: 'main', name: '입출금', role: '', color: COLORS[0], kind: 'bank' });
  const ids = new Set(c.accounts.map(a => a.id));
  const plainOk = id => ids.has(id) && !isSaving(c.accounts.find(a => a.id === id));
  if (!plainOk(c.livingAcc)) c.livingAcc = c.accounts.find(a => !isSaving(a)).id;
  if (!plainOk(c.salaryAcc)) c.salaryAcc = c.livingAcc; // 예전 설정: 월급 받는 통장 = 생활비 통장
  c.homeLeft = c.homeLeft === 'saved' ? 'saved' : 'spent';
  c.showEmerg = c.showEmerg !== false;
  c.livingIn = { amount: 0, ...c.livingIn };
  if (!plainOk(c.livingIn.acc)) c.livingIn.acc = c.livingAcc;
  c.fixed = (Array.isArray(c.fixed) ? c.fixed : []).filter(f => f && f.id && ids.has(f.acc))
    .map(f => ({ name: '고정지출', memo: '', cat: '고정지출', since: today(), ...f, day: Math.min(31, Math.max(1, parseInt(f.day, 10) || 1)) }));
  c.salaryDay = Math.min(31, Math.max(1, parseInt(c.salaryDay, 10) || 25));
  c.split = (c.split || []).filter(s => s && s.amount > 0 && (s.to === null || ids.has(s.to)) && s.to !== c.salaryAcc);
  c.savings = (c.savings || []).filter(s => s && ids.has(s.acc) && (!s.from || ids.has(s.from)))
    .map(s => ({ rounds: 12, paidBefore: 0, maturity: '', rate: null, ...s }));
  c.fund = { on: false, acc: null, ...c.fund };
  c.sumAccs = (c.sumAccs || []).filter(id => ids.has(id)).slice(0, 3);
  for (const k of ['out', 'in']) {
    if (!Array.isArray(c.cats?.[k])) c.cats = { ...c.cats, [k]: clone(DEFAULT_CATS[k]) };
    c.cats[k] = c.cats[k].filter(x => x[0] !== '기타').concat([['기타', '✏️']]);
  }
  c.subcats = c.subcats || {}; c.opts = c.opts || {}; c.optionalSubs = c.optionalSubs || [];
  return c;
}

// ===== 상태 저장소 =====
class Store {
  constructor() { this.s = this.load(); useCfg(this.s.cfg); }

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) return Store.fromData(s);
    } catch (e) { /* 손상된 값이면 처음 상태 */ }
    return emptyState();
  }
  // 저장본·백업 파일 → 지금 형식 (version 2 개인용 백업은 legacy.js에서 변환)
  static fromData(data) {
    if (!data || !Array.isArray(data.tx)) throw new SyntaxError('형식 오류');
    if (data.version === 2) return convertV2(data);
    if (data.version !== 3) throw new SyntaxError('알 수 없는 버전');
    const s = { ...emptyState(), ...clone(data) };
    s.cfg = normalizeCfg(s.cfg);
    for (const a of s.cfg.accounts) if (typeof s.base[a.id] !== 'number') s.base[a.id] = 0;
    return s;
  }
  replace(s) { this.s = s; useCfg(s.cfg); return this.save(); }
  setCfg(cfg) {
    this.s.cfg = normalizeCfg(cfg);
    for (const a of this.s.cfg.accounts) if (typeof this.s.base[a.id] !== 'number') this.s.base[a.id] = 0;
    useCfg(this.s.cfg);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); return true; } catch (e) { return false; }
  }
  // 기록만 지우기 (설정은 그대로) / 설정까지 전부 지우기
  clearRecords() { const s = emptyState(this.s.cfg); s.setupDone = true; this.replace(s); }
  resetAll() { this.replace(emptyState()); }

  // 잔액 = 시작 잔액 + 모든 기록 합 (기프티콘 소비는 돈이 안 나갔으니 제외)
  balance(acc) {
    return (this.s.base[acc] || 0) + this.s.tx.reduce((sum, t) => t.acc === acc && !t.gift ? sum + t.amt : sum, 0);
  }

  // 날짜가 지난 자동이체(적금) + 고정지출 자동 출금 반영. 반영된 개수 반환
  applyAuto() {
    if (!this.s.setupDone) return 0;
    const t = today();
    let n = 0;
    for (const it of dueFixed(t)) {
      if (this.s.applied[it.key]) continue;
      this.s.tx.push({ id: newId(), date: it.date, acc: it.f.acc, amt: -it.f.amount, cat: it.f.cat || '고정지출',
        memo: it.f.memo ? `${it.f.name} · ${it.f.memo}` : it.f.name, kind: 'fixed', fixedId: it.f.id });
      this.s.applied[it.key] = true;
      n++;
    }
    for (const it of SCHEDULE) {
      if (it.date > t || this.s.applied[it.key]) continue;
      const group = newId(), name = accName(it.to);
      this.s.tx.push(
        { id: newId(), date: it.date, acc: it.from, amt: -it.amount, cat: '적금', memo: `${name} ${it.round}회차 자동이체`, kind: 'auto', group, transfer: true },
        { id: newId(), date: it.date, acc: it.to, amt: it.amount, cat: '적금', memo: `${it.round}회차 납입`, kind: 'auto', group, transfer: true });
      this.s.applied[it.key] = true;
      n++;
    }
    if (n) this.save();
    return n;
  }

  // step: 'pay'(월급 입금) / 'split'(생활비 입금). 예전 기록(step 없음)은 둘 다 한 것으로 봄
  salaryDone(budget, step) {
    return this.s.tx.some(t => t.kind === 'salary' && t.budget === budget && (!step || !t.step || t.step === step));
  }

  // "월급 입금!" 버튼: 월급 받는 통장에 월급 (+ 보너스는 고른 통장으로)
  addSalary(date, salary, bonus = 0, bonusTo = null) {
    const group = newId(), budget = budgetOf(date), main = C.salaryAcc, mainName = accName(main);
    const base = { date, kind: 'salary', step: 'pay', group, budget };
    const m = Number(budget.slice(5));
    const push = (acc, amt, cat, memo, transfer) => this.s.tx.push({ id: newId(), ...base, acc, amt, cat, memo, transfer });
    push(main, salary, '월급', `${m}월 예산 월급`, false);
    if (bonus > 0) {
      push(main, bonus, '보너스', '보너스', false);
      if (bonusTo && bonusTo !== main) {
        push(main, -bonus, '이체', `보너스 ${ro(accName(bonusTo))}`, true);
        push(bonusTo, bonus, '보너스', `${mainName}에서 보너스`, true);
      }
    }
    this.save();
  }

  // "생활비 입금!" 버튼: 생활비가 들어오는 통장에 생활비가 들어왔다고 기록 (다른 통장에서 빼지 않음)
  addLivingIn(date, amount) {
    const budget = budgetOf(date), m = Number(budget.slice(5));
    this.s.tx.push({ id: newId(), date, acc: C.livingIn.acc, amt: amount, cat: '생활비', memo: `${m}월 생활비 입금`,
      kind: 'salary', step: 'split', group: newId(), budget, transfer: false });
    this.save();
  }

  // ----- 고정지출 -----
  fixedTotal() { return (C.fixed || []).reduce((s, f) => s + (f.amount || 0), 0); }
  // 이번 달(달력 기준) 아직 안 나간 고정지출
  fixedLeft(acc) {
    const t = today(), ym = t.slice(0, 7);
    return (C.fixed || []).filter(f => (!acc || f.acc === acc) && !this.s.applied[`fx-${f.id}-${ym}`] && fixedDateIn(f, ym) >= f.since && fixedDateIn(f, ym) > t)
      .reduce((s, f) => s + f.amount, 0);
  }
  nextFixed(acc) {
    const t = today();
    return (C.fixed || []).filter(f => f.acc === acc && f.amount > 0)
      .map(f => ({ f, date: nextFixedDate(f, t) })).sort((a, b) => a.date.localeCompare(b.date))[0];
  }
  // 생활비 통장에서 직접 쓴 돈 (이체·자동이체·고정지출·기프티콘 제외). from 이후
  livingSpent(from) {
    return this.s.tx.reduce((s, t) => t.acc === C.livingAcc && t.amt < 0 && t.kind === 'manual' && !t.transfer && !t.gift && (!from || t.date >= from) ? s - t.amt : s, 0);
  }

  // 자동이체가 예정돼 있고 그 돈이 이미 통장에 들어와 있는 금액 (비상금에서 제외)
  pendingRaw(acc) {
    const t = today(), baseBudget = budgetOf(this.s.baseDate);
    return SCHEDULE.filter(it => it.from === acc && !this.s.applied[it.key] && it.date > t)
      .filter(it => { const b = budgetOf(it.date); return b <= baseBudget || this.salaryDone(b); })
      .reduce((s, it) => s + it.amount, 0);
  }
  // 통장에 실제로 있는 돈보다 많이 잡지 않음
  pending(acc) { return Math.min(this.pendingRaw(acc), Math.max(0, this.balance(acc))); }
  nextAuto(acc) { return SCHEDULE.find(it => (it.from === acc || it.to === acc) && !this.s.applied[it.key]); }

  // 실제 잔액으로 맞추기: 기록을 남기지 않고 시작 잔액을 차이만큼 조정. 조정액 반환
  adjustTo(acc, actual) {
    const diff = actual - this.balance(acc);
    this.s.base[acc] = (this.s.base[acc] || 0) + diff;
    this.save();
    return diff;
  }

  saved() { return C.accounts.filter(isSaving).reduce((s, a) => s + this.balance(a.id), 0); }
  // 비상금 = 비상금 통장 잔액 - 적금 이체 대기. 구분을 쓰면 한 통장을 매달 / 현금 비상금으로 나눔
  emergency() {
    const fa = fundAcc();
    const list = C.accounts.filter(a => a.emergency).map(a => ({ id: a.id, name: a.name, amt: this.balance(a.id) - this.pending(a.id) }));
    const f = list.find(x => x.id === fa);
    const cashLeft = Math.max(0, this.s.baseEmergency - this.cashFundSpent());
    const cash = f ? Math.min(cashLeft, Math.max(0, f.amt)) : 0;
    return { list, fundAcc: fa, cash, monthly: f ? f.amt - cash : 0, total: list.reduce((s, x) => s + x.amt, 0) };
  }
  // 구분 통장에서 "현금 비상금"으로 표시하고 꺼낸 돈 합계
  cashFundSpent() {
    const fa = fundAcc();
    return this.s.tx.reduce((sum, t) => t.acc === fa && t.fund === 'cash' && t.amt < 0 ? sum - t.amt : sum, 0);
  }
  // 구분 통장 실제 잔액 맞추기: 매달·현금 비상금을 각각 입력 (적금 이체 대기분은 앱이 더함)
  adjustEmergency(monthly, cash) {
    const fa = fundAcc();
    this.s.baseEmergency = cash + this.cashFundSpent();
    return this.adjustTo(fa, monthly + cash + this.pendingRaw(fa));
  }
  paidRounds(acc) {
    const sv = savingOf(acc);
    return (sv ? sv.paidBefore || 0 : 0) + SCHEDULE.filter(it => it.to === acc && this.s.applied[it.key]).length;
  }

  // 적금 만기 예상 (단리 · 회차별 예치 일수)
  forecast(acc) {
    const sv = savingOf(acc), rate = (sv.rate || 0) / 100, dates = payDates(sv), maturity = maturityOf(sv);
    const principal = sv.amount * dates.length;
    const pre = maturity ? dates.reduce((s, d) => s + Math.round(sv.amount * rate * Math.max(0, daysBetween(d, maturity)) / 365), 0) : 0;
    const tax = Math.floor(pre * TAX / 10) * 10;
    return { principal, pre, tax, post: pre - tax, total: principal + pre - tax, maturity, rounds: dates.length };
  }

  // 예상 기준 시점: 마지막 적금 납입이 있는 예산월
  horizon() {
    const last = SCHEDULE.length ? SCHEDULE[SCHEDULE.length - 1].date : null;
    return last ? budgetOf(last) : null;
  }
  // 그때 비상금 예상: 지금 비상금 + 아직 안 받은 월급마다 (비상금 통장으로 가는 돈 - 그 달 그 통장에서 나갈 적금)
  emergencyForecast() {
    const end = this.horizon(), em = this.emergency();
    if (!end) return em.total;
    const emergIds = new Set(C.accounts.filter(a => a.emergency).map(a => a.id));
    // 월급 한 번에 비상금 통장들로 순수하게 들어오는 돈 (월급 통장이 비상금이면 월급 - 나눠 보내는 돈)
    const splitAll = C.split.reduce((s, sp) => s + sp.amount, 0);
    const inPerSalary = C.split.filter(sp => emergIds.has(sp.to)).reduce((s, sp) => s + sp.amount, 0)
      + (emergIds.has(C.salaryAcc) ? C.salary - splitAll : 0)
      - (C.fixed || []).filter(f => emergIds.has(f.acc)).reduce((s, f) => s + f.amount, 0);
    let add = 0;
    for (let b = budgetOf(today()); b <= end; b = nextBudget(b)) {
      if (this.salaryDone(b) || salaryDateOf(b) < today()) continue; // 받았거나, 이미 지난 월급(지금 잔액에 들어 있음)
      const out = SCHEDULE.filter(it => emergIds.has(it.from) && budgetOf(it.date) === b).reduce((s, it) => s + it.amount, 0);
      add += inPerSalary - out;
    }
    return em.total + add;
  }
}
