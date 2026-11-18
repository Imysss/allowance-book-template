// ===== 예전 개인용 백업(version 2) → 지금 형식(version 3) 변환 =====
// version 2에는 통장 구조가 코드에 고정돼 있었고 파일엔 기록만 있어요.
// 통장 id·종류만 아래 표로 되살리고, 월급·분배·적금 금액은 기록에서 거꾸로 찾아내요.
// 찾지 못한 값은 설정 마법사에서 확인하도록 setupDone=false로 둬요.
const V2_ACCS = {
  kb:    { name: '국민',       kind: 'bank',  color: '#e0a800', role: '월급 · 생활비' },
  cash:  { name: '현금',       kind: 'cash',  color: '#6b7a8f', role: '지갑' },
  nh:    { name: '농협',       kind: 'bank',  color: '#2e9e5b', role: '고정비' },
  sh:    { name: '신한',       kind: 'bank',  color: '#2f5fd0', role: '비상금 · 적금 이체', emergency: true },
  cpd:   { name: '신한 적금',   kind: 'saving', color: '#7c4dcc', role: '', from: 'sh' },
  kk:    { name: '카카오',     kind: 'bank',  color: '#c9a400', role: '적금 이체', emergency: true },
  kks:   { name: '카카오 적금', kind: 'saving', color: '#8a6d00', role: '', from: 'kk' },
  bonus: { name: '보너스 예금', kind: 'deposit', color: '#c2553a', role: '보너스', hideIfZero: true },
};
const V2_ROUNDS = 6;
// 예전 분류 이모지 (기록에 쓰인 분류를 설정 분류에 다시 넣을 때 사용)
const EMOJI_HINTS = { '월세': '🏠', '관리비': '🏢', '구독': '📺', '식사': '🍚', '카페': '☕', '간식': '🍪', '선물': '🎁', '모임·여행': '🧳',
  '교통비': '🚌', '책': '📚', '옷': '👕', '화장품': '💄', '생필품': '🧴', '병원비': '💊', '경조사비': '💐', '택배·소포': '📦',
  '취미': '🎨', '세탁비': '🧺', '헌금': '⛪', '곗돈': '🤝', '교통비 환급': '🔄', '월급': '💼', '이자': '✨' };
const SYSTEM_CATS = new Set(['이체', '적금', '보너스', '월급']);
const V2_WHO = { label: '누구랑', choices: ['혼자', '내가 사줌'] };

function convertV2(old) {
  const tx = clone(old.tx);
  // 이름 바뀐 분류 (개인용 앱 migrate와 같음)
  for (const t of tx) {
    if (t.cat === '커피') t.cat = '카페';
    if (t.cat === '관리비' && t.sub === '난방') t.sub = '가스';
    if (t.cat === '택시비') { t.cat = '교통비'; t.sub = '택시'; }
  }
  const base = { ...(old.base || {}) };
  const used = new Set([...Object.keys(base), ...tx.map(t => t.acc)]);
  const accounts = Object.entries(V2_ACCS).filter(([id]) => used.has(id) || id === 'kb')
    .map(([id, a]) => { const { from, ...rest } = a; return { id, ...rest }; });
  const has = id => accounts.some(a => a.id === id);
  const bal = id => (base[id] || 0) + tx.reduce((s, t) => t.acc === id && !t.gift ? s + t.amt : s, 0);

  const cfg = exampleCfg();
  cfg.accounts = accounts;
  cfg.livingAcc = 'kb'; cfg.salaryAcc = 'kb'; cfg.homeLeft = 'saved'; cfg.fixed = []; cfg.livingBudget = 0;
  cfg.fund = { on: has('sh'), acc: has('sh') ? 'sh' : null };
  cfg.sumAccs = ['kb', 'nh', 'sh'].filter(has);
  cfg.plan = '';

  // 월급·분배: 가장 최근 월급날 묶음에서 찾기
  const salaryTx = tx.filter(t => t.kind === 'salary');
  const lastGroup = salaryTx.reduce((g, t) => (!g || t.date >= g.date ? { id: t.group, date: t.date } : g), null);
  cfg.split = [];
  if (lastGroup) {
    const g = salaryTx.filter(t => t.group === lastGroup.id);
    const pay = g.find(t => t.cat === '월급' && t.amt > 0);
    if (pay) cfg.salary = pay.amt;
    cfg.salaryDay = Number(lastGroup.date.slice(8));
    for (const t of g) {
      if (t.acc !== 'kb' && t.transfer && t.cat === '이체' && t.amt > 0) cfg.split.push({ to: t.acc, amount: t.amt, label: V2_ACCS[t.acc]?.name || t.acc });
      if (t.acc === 'kb' && !t.transfer && t.amt < 0) cfg.split.push({ to: null, amount: -t.amt, label: t.cat });
    }
  }

  // 적금: 자동이체 기록·반영 표시에서 금액과 날짜 찾기 (첫 회차는 시작 잔액에 들어 있던 구조)
  cfg.savings = Object.entries(V2_ACCS).filter(([id, a]) => a.from && has(id)).map(([id, a]) => {
    const autos = tx.filter(t => t.kind === 'auto' && t.acc === id && t.amt > 0);
    const autoSum = autos.reduce((s, t) => s + t.amt, 0);
    const amount = autos[0]?.amt || Math.max(0, bal(id) - autoSum);
    let start = '';
    const known = autos.map(t => ({ date: t.date, round: Number((t.memo.match(/(\d+)회차/) || [])[1]) })).find(x => x.round);
    if (known) start = addMonths(known.date, 1 - known.round);
    else {
      const key = Object.keys(old.applied || {}).filter(k => k.startsWith(id + '-')).sort()[0];
      if (key) start = addMonths(key.slice(id.length + 1), -1); // 반영된 첫 키 = 2회차
      else if (id === 'kks' && isYmd(old.kksMaturity)) start = addMonths(old.kksMaturity, -V2_ROUNDS);
    }
    return { acc: id, from: a.from, amount, start, rounds: V2_ROUNDS, paidBefore: 1,
      maturity: id === 'kks' && isYmd(old.kksMaturity) ? old.kksMaturity : '', rate: old.rates?.[id] ?? null };
  });

  // 분류: 예시 분류 + 기록에 쓰인 분류·세부 항목·선택지
  for (const t of tx) {
    if (t.kind !== 'manual' || SYSTEM_CATS.has(t.cat) || !t.cat) continue;
    const list = cfg.cats[t.amt < 0 ? 'out' : 'in'];
    if (!list.some(c => c[0] === t.cat)) list.splice(list.length - 1, 0, [t.cat, EMOJI_HINTS[t.cat] || '✏️']);
    if (t.sub) { const s = cfg.subcats[t.cat] || (cfg.subcats[t.cat] = []); if (!s.includes(t.sub)) s.push(t.sub); }
    const o = optOf(t);
    if (o && !cfg.opts[t.cat]?.choices.includes(o)) cfg.opts[t.cat] = ['매달', '1년치'].includes(o) ? { label: '결제 주기', choices: ['매달', '1년치'] } : clone(V2_WHO);
  }
  for (const a of accounts) if (typeof base[a.id] !== 'number') base[a.id] = 0;

  return {
    ...emptyState(normalizeCfg(cfg)),
    setupDone: false, fromV2: true,
    baseDate: old.baseDate || today(), base, applied: { ...(old.applied || {}) }, tx,
    baseEmergency: old.baseEmergency || 0, bonusExpect: old.bonusExpect || null,
  };
}
