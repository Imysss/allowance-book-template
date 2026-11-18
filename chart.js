// ===== 이 달 어디에 썼는지: 원형 그래프 + 표 =====
// 포함: 직접 적은 지출(통장 이체 제외) + 월급날 밖으로 보낸 돈(곗돈 등). 'OO 환급'은 같은 이름 분류에서 차감.
const PALETTE = ['#3c7a5a', '#e0a800', '#d0573f', '#2f5fd0', '#7c4dcc', '#2e9e5b', '#c2553a', '#1f9bb5', '#d64d8a', '#8a6d00', '#6b7a8f', '#a0522d', '#4f8f2f', '#b07cc6'];

// cat → (key → 금액) 누적
function addNested(map, cat, key, v) {
  const m = map.get(cat) || new Map(); map.set(cat, m);
  m.set(key, (m.get(key) || 0) + v);
}
// 고정지출(kind fixed)은 그래프에서 빼고 아래에 합계만 따로 보여줘요
const isSpend = t => t.amt < 0 && !t.transfer && (t.kind === 'manual' || t.kind === 'salary');

function renderChart(list) {
  const sum = new Map(), subSum = new Map(), optSum = new Map(), giftSum = new Map();
  const refunds = new Map();
  let giftTotal = 0;
  for (const t of list) {
    const rc = t.kind === 'manual' && t.amt > 0 && / 환급$/.test(t.cat) ? t.cat.replace(/ 환급$/, '') : null;
    if (rc) { refunds.set(rc, (refunds.get(rc) || 0) + t.amt); continue; }
    if (!isSpend(t)) continue;
    const v = -t.amt;
    sum.set(t.cat, (sum.get(t.cat) || 0) + v);
    if (t.sub) addNested(subSum, t.cat, t.sub, v);
    const opt = t.opt || (t.treat ? '내가 사줌' : null); // 예전 체크칸 기록 호환
    if (opt) addNested(optSum, t.cat, opt, v);
    if (t.gift) { giftSum.set(t.cat, (giftSum.get(t.cat) || 0) + v); giftTotal += v; }
  }
  const fixedSum = list.reduce((s, t) => t.kind === 'fixed' ? s - t.amt : s, 0);
  const usedRefunds = [...refunds].filter(([c]) => sum.has(c));
  for (const [c, v] of usedRefunds) sum.set(c, Math.max(0, sum.get(c) - v));
  const rows = [...sum].filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, r) => s + r[1], 0);
  const box = $('#chart');
  if (!total) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;

  // 도넛: 원 둘레를 100으로 두고 dasharray로 조각 그리기
  let acc = 0;
  const arcs = rows.map(([, v], i) => {
    const p = v / total * 100;
    const a = `<circle r="15.915" cx="21" cy="21" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="6"
      stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${25 - acc}"/>`;
    acc += p; return a;
  }).join('');

  const line = (m, fmt = (k, v) => `${esc(k)} ${won(v)}`) => [...m].map(([k, v]) => fmt(k, v)).join(' · ');
  const subrow = html => `<tr class="subrow"><td colspan="3">${html}</td></tr>`;
  const optFmt = (k, v) => k === '1년치' ? `1년치 ${won(v)} (월 ${won(Math.round(v / 12))}꼴)` : `${esc(k)} ${won(v)}`;

  box.innerHTML = `
    <div class="donut"><svg viewBox="0 0 42 42">${arcs}</svg>
      <div class="donut-c"><span class="label">이 달 소비</span><b class="num">${won(total)}</b></div></div>
    <table class="cat-table num">${rows.map(([c, v], i) => `
      <tr><td><i style="background:${PALETTE[i % PALETTE.length]}"></i>${emojiOf(c)} ${esc(c)}</td>
      <td>${Math.round(v / total * 100)}%</td><td>${won(v)}</td></tr>` +
      (subSum.has(c) ? subrow(line(subSum.get(c))) : '') +
      (optSum.has(c) ? subrow(line(optSum.get(c), optFmt)) : '') +
      (giftSum.has(c) ? subrow(`🎁 기프티콘 ${won(giftSum.get(c))}${v > giftSum.get(c) ? ` · 내 돈 ${won(v - giftSum.get(c))}` : ''}`) : '')).join('')}
    </table>
    ${giftTotal ? `<div class="mini" style="margin-top:6px">🎁 기프티콘 소비 ${won(giftTotal)}도 소비 습관으로 함께 보여줘요 (실제로 나간 돈 ${won(total - giftTotal)})</div>` : ''}
    ${fixedSum ? `<div class="mini" style="margin-top:6px">📌 고정지출 ${won(fixedSum)}은 그래프에서 빼고 따로 셌어요 (고정지출 탭)</div>` : ''}
    ${usedRefunds.map(([c, v]) => `<div class="mini" style="margin-top:6px">🔄 ${esc(c)} 환급 +${won(v)}을 ${esc(c)}에서 뺐어요</div>`).join('')}`;
}
