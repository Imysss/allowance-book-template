// ===== 화면 (Store 데이터를 그리고 입력을 Store로 전달) =====
const store = new Store();
const $ = s => document.querySelector(s);
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const signed = n => (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원';
const short = n => n >= 10000 ? (Math.round(n / 1000) / 10).toLocaleString('ko-KR') + '만' : n.toLocaleString('ko-KR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const md = s => { const d = toDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const dotted = s => s ? s.replace(/-/g, '.') : '미정';
const parseWon = v => parseInt(String(v).replace(/\D/g, '').slice(0, 10), 10) || 0;
const fmtInput = el => { const n = parseWon(el.value); el.value = n ? n.toLocaleString('ko-KR') : ''; };
const commaVal = n => (n > 0 ? n.toLocaleString('ko-KR') : '');
const kv = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><b class="num">${v}</b></div>`;

let tab = 'home';
const histMonth = new Date(); histMonth.setDate(1);
let histFilter = 'all';

function render() {
  if (!store.s.setupDone) return;
  if (tab === 'home') renderHome();
  if (tab === 'history') renderHistory();
  if (tab === 'fixed') renderFixed();
}
const visibleAccs = () => C.accounts.filter(a => !(a.hideIfZero && store.balance(a.id) === 0));

// ----- 홈 -----
function renderHome() {
  const savers = visibleAccs().filter(isSaving), thisBudget = budgetOf(today()), m = Number(thisBudget.slice(5));
  const leftOn = C.homeLeft === 'spent' || savers.length;
  $('#savedCard').hidden = !leftOn;
  if (C.homeLeft === 'spent') {
    // 이번 예산월(지난 월급날부터) 생활비 통장에서 쓴 돈
    const from = salaryDateOf(thisBudget);
    $('#leftLabel').textContent = '이번 달 사용한 생활비';
    $('#savedTotal').textContent = won(store.livingSpent(from));
    $('#savedDetail').innerHTML = '';
  } else {
    $('#leftLabel').textContent = '지금까지 모은 돈';
    $('#savedTotal').textContent = won(store.saved());
    $('#savedDetail').innerHTML = savers.map(a => `${esc(a.name)} <b>${won(store.balance(a.id))}</b>`).join('<br>');
  }

  const em = store.emergency();
  const emOn = C.showEmerg && em.list.length > 0;
  $('#emergCard').hidden = !emOn;
  $('#emergTotal').textContent = won(em.total);
  $('#emergDetail').innerHTML = em.list.map(x => x.id === em.fundAcc
    ? `${FUNDS.monthly} <b>${won(em.monthly)}</b><br>${FUNDS.cash} <b>${won(em.cash)}</b>`
    : `${esc(x.name)} <b>${won(x.amt)}</b>`).join('<br>');
  $('.twin').classList.toggle('one', !leftOn || !emOn);
  $('.twin').hidden = !leftOn && !emOn;

  const kb = store.balance(C.livingAcc), budget = C.livingBudget || 0;
  $('#living').hidden = !budget; // 생활비 예산을 안 정했으면 막대 칸은 숨김
  const pct = budget ? Math.max(0, Math.min(100, kb / budget * 100)) : 0;
  $('#livingLabel').textContent = `이번 달 생활비 · ${accName(C.livingAcc)}`;
  $('#livingAmt').innerHTML = won(kb) + (kb < C.livingFloor ? ' <span class="badge">생활비 다 씀</span>' : '');
  $('#livingBar').style.width = pct + '%';
  $('#living').classList.toggle('warn', kb < C.livingFloor);
  const ns = nextSalaryDate(), dd = daysBetween(today(), ns);
  $('#dday').textContent = dd === 0 ? '오늘 월급날!' : `월급까지 D-${dd}`;

  $('#paySub').textContent = store.salaryDone(thisBudget, 'pay') ? `${m}월 월급 기록했어요` : `${md(ns)} ${accName(C.salaryAcc)}${dd ? ` · D-${dd}` : ' · 오늘!'}`;
  $('#splitSub').textContent = store.salaryDone(thisBudget, 'split') ? `${m}월 생활비 들어왔어요` : '';

  let total = 0;
  $('#accList').innerHTML = visibleAccs().map(a => {
    const b = store.balance(a.id); total += b;
    const nx = store.nextAuto(a.id); // 고정지출 자동출금 예정은 통장 목록에 따로 안 보여줌
    const note = nx ? (nx.from === a.id ? `${md(nx.date)} ${ro(accName(nx.to))} -${short(nx.amount)} 자동이체` : `${md(nx.date)} ${nx.round}회차 +${short(nx.amount)} 들어올 예정`) : '';
    const sv = savingOf(a.id);
    const extra = sv && payDates(sv).length ? ` · ${store.paidRounds(a.id)}/${sv.rounds}회` : '';
    return `<button class="acc" data-acc="${a.id}">
      <div class="dot" style="background:${esc(a.color)}">${esc(dotText(a))}</div>
      <div class="meta"><b>${esc(a.name)}${extra}</b><span>${esc(a.role)}</span>${note ? `<em>${esc(note)}</em>` : ''}</div>
      <div class="amt num">${won(b)}${accSplit(a, em)}</div></button>`;
  }).join('');
  $('#balTotal').textContent = '전체 ' + won(total);

  const recent = sortTx(store.s.tx).slice(0, 8);
  $('#recent').innerHTML = recent.length ? groupHtml(recent) : `<div class="empty">아직 기록이 없어요.<br>+ 버튼으로 쓴 돈을 적거나, 월급날에 위 버튼을 눌러주세요.</div>`;
}

// 통장 금액 아래 작은 구분 줄: 초록 = 비상금, 회색 = 곧 적금으로 넘어갈 돈
function accSplit(a, em) {
  const wait = store.pending(a.id), fxLeft = store.fixedLeft(a.id);
  const waitLine = [wait ? `<span class="wait">적금 이체 대기 ${won(wait)}</span>` : '', fxLeft ? `<span class="wait">이번 달 고정지출 ${won(fxLeft)}</span>` : '']
    .filter(Boolean).join('<br>');
  if (a.id === em.fundAcc) return `<small>${FUNDS.monthly} ${won(em.monthly)}<br>${FUNDS.cash} ${won(em.cash)}${waitLine ? '<br>' + waitLine : ''}</small>`;
  const x = em.list.find(e => e.id === a.id);
  if (x && wait) return `<small>비상금 ${won(x.amt)}<br>${waitLine}</small>`;
  return waitLine ? `<small>${waitLine}</small>` : '';
}

// ----- 내역 -----
function renderHistory() {
  if (histFilter !== 'all' && !C.accounts.some(a => a.id === histFilter)) histFilter = 'all';
  const mk = `${histMonth.getFullYear()}-${pad(histMonth.getMonth() + 1)}`;
  $('#month').textContent = `${histMonth.getFullYear()}년 ${histMonth.getMonth() + 1}월`;
  $('#filters').innerHTML = [['all', '전체'], ...C.accounts.map(a => [a.id, a.name])]
    .map(([id, n]) => `<button class="chip ${histFilter === id ? 'on' : ''}" data-filter="${esc(id)}">${esc(n)}</button>`).join('');
  $('#accBal').hidden = histFilter === 'all';
  if (histFilter !== 'all') {
    $('#accBalName').textContent = `${accName(histFilter)} 지금 잔액`;
    $('#accBalAmt').textContent = won(store.balance(histFilter));
  }
  const list = sortTx(store.s.tx.filter(t => t.date.startsWith(mk) && (histFilter === 'all' || t.acc === histFilter)));
  let inc = 0, out = 0;
  for (const t of list) {
    if ((histFilter === 'all' && t.transfer) || t.gift) continue;
    t.amt > 0 ? inc += t.amt : out -= t.amt;
  }
  $('#sumIn').textContent = '+' + won(inc);
  $('#sumOut').textContent = '-' + won(out);
  // 통장별 실제로 쓴 돈 (이체·자동이체·기프티콘 제외), 전체 보기에서만 · 설정에서 고른 최대 3개
  const by = C.sumAccs;
  $('#sumsBy').hidden = histFilter !== 'all' || !by.length;
  $('#sumsBy').style.gridTemplateColumns = `repeat(${by.length || 1},1fr)`;
  const spent = acc => store.s.tx.reduce((s, t) =>
    t.date.startsWith(mk) && t.acc === acc && t.amt < 0 && !t.transfer && !t.gift ? s - t.amt : s, 0);
  $('#sumsBy').innerHTML = by.map(id => {
    const n = accName(id), tag = id === C.livingAcc ? '생활비' : accOf(id).emergency ? '비상금' : '';
    const v = spent(id), label = tag && !n.includes(tag) ? `${tag} (${n})` : n;
    return `<div><span class="label">${esc(label)}</span><b class="out-c num">${v ? '-' : ''}${won(v)}</b></div>`;
  }).join('');
  $('#history').innerHTML = list.length ? groupHtml(list) : `<div class="empty">이 달 기록이 없어요.</div>`;
}

function sortTx(list) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.order || 0) - (a.order || 0));
}
function groupHtml(list) {
  const groups = [];
  for (const t of list) {
    const g = groups[groups.length - 1];
    g && g.date === t.date ? g.items.push(t) : groups.push({ date: t.date, items: [t] });
  }
  return groups.map(g => {
    const d = toDate(g.date);
    return `<div class="day"><div class="day-head"><span>${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일</span></div>
      <div class="rows">${g.items.map(t => `
        <button class="row" data-id="${t.id}">
          <div class="emoji">${emojiOf(t.cat)}</div>
          <div class="meta"><b>${esc(t.memo || catLabel(t))}</b><span>${t.gift ? '' : esc(accName(t.acc)) + ' · '}${esc(catLabel(t))}${t.kind === 'auto' ? ' · 자동이체' : t.kind === 'fixed' ? ' · 자동출금' : t.kind === 'salary' ? ' · 월급날' : ''}</span></div>
          ${t.gift ? `<div class="amt num gift">🎁 ${won(-t.amt)}</div>` : `<div class="amt num ${t.amt > 0 ? 'in-c' : 'out-c'}">${signed(t.amt)}</div>`}
        </button>`).join('')}</div></div>`;
  }).join('');
}

// ----- 적금 -----
function renderSavings() {
  const svs = C.savings.filter(sv => payDates(sv).length);
  $('#savingSec').hidden = !svs.length;
  $('#savingCards').innerHTML = svs.map(sv => {
    const id = sv.acc, f = store.forecast(id), paid = store.paidRounds(id), nx = store.nextAuto(id);
    return `<div class="card saving" style="margin-bottom:12px">
      <h3>${esc(accName(id))}</h3><div class="label">월 ${short(sv.amount)}원 × ${f.rounds}회 · ${esc(accName(sv.from))}에서 매달 ${Number(sv.start.slice(8))}일 · 만기 ${dotted(f.maturity)}</div>
      <div class="progress">${payDates(sv).map((_, i) => `<i class="${i < paid ? 'on' : ''}"></i>`).join('')}</div>
      ${kv(`지금까지 넣은 돈 (${paid}/${f.rounds}회)`, won(store.balance(id)))}
      <div class="kv"><span>다음 납입</span><b>${nx ? `${md(nx.date)} ${nx.round}회차` : '납입 끝!'}</b></div>
      <div class="kv"><span>적용 금리 (연)</span><label class="rate"><input class="num" inputmode="decimal" data-rate="${esc(id)}" value="${sv.rate ?? ''}" placeholder="0.0">%</label></div>
      ${kv('만기 원금', won(f.principal))}${kv('세전 이자', won(f.pre))}${kv('이자소득세 15.4%', '-' + won(f.tax))}
      ${kv('만기 예상 수령액', won(f.total), 'total')}
    </div>`;
  }).join('');

  const end = store.horizon();
  $('#forecastSec').hidden = !end;
  if (end) {
    $('#forecastWhen').textContent = `${end.slice(0, 4)}년 ${Number(end.slice(5))}월 말`;
    const rows = svs.map(sv => { const f = store.forecast(sv.acc); return [`${accName(sv.acc)} 만기금 (${f.maturity ? md(f.maturity) : '미정'})`, f.total]; });
    for (const a of C.accounts.filter(a => a.kind === 'deposit')) if (store.balance(a.id)) rows.push([a.name, store.balance(a.id)]);
    const em = store.emergency();
    if (em.list.length) rows.push([`비상금 (${em.list.map(x => x.name).join(' + ')})`, store.emergencyForecast()]);
    if (store.s.bonusExpect) rows.push(['보너스 등 (예상)', store.s.bonusExpect]);
    const sum = rows.reduce((s, r) => s + r[1], 0);
    $('#forecast').innerHTML = rows.map(([k, v]) => kv(esc(k), won(v))).join('') + kv('합계', won(sum), 'total');
  }
  const plan = (C.plan || '').split('\n').map(s => s.trim()).filter(Boolean);
  $('#planSec').hidden = !plan.length;
  $('#planList').innerHTML = plan.map(s => `<li>${esc(s.replace(/^[-•]\s*/, ''))}</li>`).join('');
}

// ===== 공통 =====
function openSheet(el) { $('#dim').classList.add('on'); el.classList.add('on'); }
function closeSheets() {
  $('#dim').classList.remove('on');
  document.querySelectorAll('.sheet').forEach(s => s.classList.remove('on'));
  document.activeElement?.blur();
}
function persist() { if (!store.save()) toast('저장에 실패했어요'); }
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}
function switchTab(name) {
  tab = name;
  ['home', 'history', 'fixed'].forEach(n => { $('#tab-' + n).hidden = n !== name; });
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  $('#title').textContent = { home: '내 통장', history: '내역', fixed: '고정지출' }[name];
  window.scrollTo(0, 0);
  render();
}
// 앱을 열거나 다시 볼 때 날짜 지난 자동이체 반영
function refreshAuto() {
  const n = store.applyAuto();
  render();
  if (n) toast(`자동이체 ${n}건이 반영됐어요`);
}
