// ===== 시트들: 월급날 · 실제 잔액 맞추기 · 분석 · 백업 + 이벤트 연결 · 시작 =====

// ----- 월급날 -----
let payBonusTo = null;
function openPay() {
  $('#payDate').value = today();
  $('#payAmount').value = commaVal(C.salary);
  $('#payBonus').value = '';
  payBonusTo = C.accounts.find(a => a.kind === 'deposit')?.id || C.salaryAcc;
  drawPay();
  openSheet($('#paySheet'));
}
function drawPay() {
  const salary = parseWon($('#payAmount').value), bonus = parseWon($('#payBonus').value);
  const main = accName(C.salaryAcc);
  $('#bonusToField').hidden = !bonus;
  $('#bonusToChips').innerHTML = C.accounts.map(a =>
    `<button class="chip ${a.id === payBonusTo ? 'on' : ''}" data-bto="${esc(a.id)}">${esc(a.name)}</button>`).join('');
  $('#paySplit').innerHTML =
    `<div class="kv"><span>${esc(main)} 월급</span><b class="in-c">+${won(salary)}</b></div>` +
    (bonus ? `<div class="kv"><span>보너스 → ${esc(accName(payBonusTo))}</span><b>${won(bonus)}</b></div>` : '') +
    `<div class="kv total"><span>입금 후 ${esc(main)} 잔액</span><b>${won(store.balance(C.salaryAcc) + salary + (payBonusTo === C.salaryAcc ? bonus : 0))}</b></div>` +
''
}
function confirmPay() {
  const date = $('#payDate').value || today(), salary = parseWon($('#payAmount').value), bonus = parseWon($('#payBonus').value);
  if (salary <= 0) { toast('월급을 입력해 주세요'); return; }
  const b = budgetOf(date);
  if (store.salaryDone(b, 'pay') && !confirm(`${Number(b.slice(5))}월 예산 월급은 이미 기록했어요. 한 번 더 넣을까요?`)) return;
  store.addSalary(date, salary, bonus, payBonusTo);
  closeSheets(); render();
  toast(`🎉 ${accName(C.salaryAcc)}에 월급 ${won(salary)} 입금`);
}

// ----- 실제 잔액으로 맞추기 (비상금 구분 통장은 매달 / 현금 비상금을 따로) -----
function openAdjust() {
  const b = store.balance(histFilter), isFund = histFilter === fundAcc();
  $('#adjustTitle').textContent = `${accName(histFilter)} 잔액 맞추기`;
  $('#adjustNow').textContent = `앱에 적힌 잔액 ${won(b)}`;
  $('#adjustOne').hidden = isFund;
  $('#adjustFund').hidden = !isFund;
  if (isFund) {
    const em = store.emergency(), p = store.pendingRaw(histFilter);
    $('#adjMonthly').value = commaVal(em.monthly);
    $('#adjCash').value = commaVal(em.cash);
    $('#adjustPending').textContent = p ? `곧 적금으로 나갈 ${won(p)}은 앱이 알아서 더해요. 통장 잔액에서 이 금액을 뺀 나머지를 나눠 적어주세요.` : '';
  } else $('#adjustAmount').value = commaVal(b);
  openSheet($('#adjustSheet'));
  if (!isFund) setTimeout(() => $('#adjustAmount').select(), 260);
}
function saveAdjust() {
  const name = accName(histFilter);
  if (histFilter === fundAcc()) {
    const monthly = parseWon($('#adjMonthly').value), cash = parseWon($('#adjCash').value);
    const diff = store.adjustEmergency(monthly, cash);
    closeSheets(); render();
    toast(`${FUNDS.monthly} ${won(monthly)} · ${FUNDS.cash} ${won(cash)}으로 맞췄어요${diff ? ` (${signed(diff)})` : ''}`);
    return;
  }
  const actual = parseWon($('#adjustAmount').value);
  const diff = store.adjustTo(histFilter, actual);
  closeSheets(); render();
  toast(diff ? `${name} 잔액을 ${won(actual)}으로 맞췄어요 (${signed(diff)})` : '이미 같은 금액이에요');
}

// ----- 분석 -----
const anMonth = new Date(); anMonth.setDate(1);
function drawAnalysis() {
  const mk = `${anMonth.getFullYear()}-${pad(anMonth.getMonth() + 1)}`;
  $('#anMonth').textContent = `${anMonth.getFullYear()}년 ${anMonth.getMonth() + 1}월`;
  renderChart(store.s.tx.filter(t => t.date.startsWith(mk)));
  $('#anEmpty').hidden = !$('#chart').hidden;
}

// ----- 백업 (기록 + 설정 한 파일) -----
async function exportData() {
  const name = `용돈기입장_${today()}.json`;
  const file = new File([JSON.stringify(store.s, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    let s;
    try { s = Store.fromData(JSON.parse(r.result)); } catch (e) { toast('백업 파일을 읽지 못했어요'); return; }
    const what = s.fromV2 ? '예전 버전 백업이에요. 기록을 불러온 뒤 통장·적금 설정을 한 번 확인할게요.' : '기록과 설정을 함께 불러와요.';
    if (!confirm(`기록 ${s.tx.length}개를 불러올까요?\n${what}\n지금 기록과 설정은 백업 내용으로 바뀌어요.`)) return;
    store.replace(s);
    closeSheets(); closeSetup();
    if (!s.setupDone) openSetup('wizard'); else { refreshAuto(); toast('불러왔어요'); }
  };
  r.readAsText(file);
}

// ===== 이벤트 연결 =====
document.querySelector('nav').onclick = e => { const b = e.target.closest('button'); if (b) switchTab(b.dataset.tab); };
$('#moreBtn').onclick = () => switchTab('history');
$('#addBtn').onclick = () => tab === 'fixed' ? openFixed(null) : openForm(null, tab === 'history' && histFilter !== 'all' ? histFilter : C.livingAcc);
$('#payBtn').onclick = openPay;
$('#splitBtn').onclick = openSplit;
$('#menuBtn').onclick = () => openSheet($('#menuSheet'));
$('#settingsBtn').onclick = () => { closeSheets(); openSetup('settings'); };
$('#dim').onclick = closeSheets;
// 모든 시트 오른쪽 위에 닫기(✕) 버튼
document.querySelectorAll('.sheet').forEach(sh => {
  const x = document.createElement('button');
  x.className = 'sheet-x'; x.setAttribute('aria-label', '닫기'); x.textContent = '✕'; x.onclick = closeSheets;
  sh.prepend(x);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });
document.querySelector('#app').addEventListener('click', e => {
  const row = e.target.closest('.row'); if (row) return onTx(row.dataset.id);
  const acc = e.target.closest('.acc');
  if (acc) { histFilter = acc.dataset.acc; switchTab('history'); }
});
$('#prev').onclick = () => { histMonth.setMonth(histMonth.getMonth() - 1); render(); };
$('#next').onclick = () => { histMonth.setMonth(histMonth.getMonth() + 1); render(); };
$('#filters').onclick = e => { const b = e.target.closest('[data-filter]'); if (b) { histFilter = b.dataset.filter; render(); } };
$('#analysisBtn').onclick = () => { anMonth.setTime(histMonth.getTime()); closeSheets(); drawAnalysis(); openSheet($('#analysisSheet')); };
$('#anPrev').onclick = () => { anMonth.setMonth(anMonth.getMonth() - 1); drawAnalysis(); };
$('#anNext').onclick = () => { anMonth.setMonth(anMonth.getMonth() + 1); drawAnalysis(); };
$('#savingCards').addEventListener('change', e => {
  const sv = savingOf(e.target.dataset.rate); if (!sv) return;
  const v = parseFloat(e.target.value.replace(',', '.'));
  sv.rate = isNaN(v) ? null : v;
  persist(); render();
});
['#payAmount', '#payBonus'].forEach(s => { $(s).oninput = e => { fmtInput(e.target); drawPay(); }; });
$('#bonusToChips').onclick = e => { const b = e.target.closest('[data-bto]'); if (b) { payBonusTo = b.dataset.bto; drawPay(); } };
$('#payConfirm').onclick = confirmPay;
$('#adjustBtn').onclick = openAdjust;
['#adjustAmount', '#adjMonthly', '#adjCash'].forEach(s => { $(s).oninput = e => fmtInput(e.target); });
$('#adjustSave').onclick = saveAdjust;
$('#fileInput').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };
document.addEventListener('visibilitychange', () => { if (!document.hidden && store.s.setupDone) refreshAuto(); });

// 자정(0시)이 지나면 앱을 켜 둔 채여도 고정지출·적금 자동 반영 (폰이 앱을 재우면 다시 열 때 반영)
function scheduleMidnight() {
  const n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5);
  setTimeout(() => { if (store.s.setupDone) refreshAuto(); scheduleMidnight(); }, next - n);
}
scheduleMidnight();

// ===== 시작: 설정 전이면 마법사, 아니면 자동이체 반영 후 홈 =====
if (store.s.setupDone) refreshAuto(); else openSetup('wizard');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
