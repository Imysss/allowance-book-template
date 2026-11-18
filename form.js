// ===== 기록 입력 시트 (나간 돈 / 들어온 돈 / 통장 이체) =====
// app.js 다음에 로드됨: store, $, persist, render, toast, openSheet, closeSheets 사용
const TRANSFER = 0;
let editing = null, fSign = -1, fAcc = null, fTo = null, fCat = null, fSub = null, fOpt = null, fFund = 'monthly';

function openForm(t, acc) {
  editing = t || null;
  fSign = t ? Math.sign(t.amt) : -1;
  fAcc = t ? t.acc : (acc || C.livingAcc);
  fCat = t ? t.cat : null;
  fSub = t ? t.sub || null : null;
  fOpt = t ? optOf(t) : null;
  fFund = (t && t.fund) || 'monthly';
  $('#gift').checked = !!(t && t.gift);
  $('#etcName').value = '';
  if (t && !isPreset(t.cat, fSign)) { $('#etcName').value = t.cat; fCat = '기타'; } // 직접 쓴 분류
  $('#amount').value = t ? Math.abs(t.amt).toLocaleString('ko-KR') : '';
  $('#memo').value = t ? t.memo : '';
  $('#date').value = t ? t.date : today();
  $('#delBtn').hidden = !t;
  drawForm();
  openSheet($('#formSheet'));
  if (!t) setTimeout(() => $('#amount').focus(), 260);
}

const chipsHtml = (items, on, attr) => items.map(([v, label]) => `<button class="chip ${v === on ? 'on' : ''}" data-${attr}="${v}">${label}</button>`).join('');
const accItems = () => C.accounts.filter(a => !a.hideIfZero || store.balance(a.id)).map(a => [a.id, a.name]);

function drawForm() {
  const isTr = fSign === TRANSFER, gift = fSign < 0 && $('#gift').checked;
  document.querySelectorAll('#signSeg button').forEach(b => b.classList.toggle('on', +b.dataset.sign === fSign));
  $('#signMark').textContent = isTr ? '→' : gift ? '🎁' : (fSign < 0 ? '-' : '+');
  $('#signMark').className = isTr ? 'sub' : fSign < 0 ? 'out-c' : 'in-c';

  // 통장 (이체면 보내는 통장 + 받는 통장)
  if (isTr && (fTo === fAcc || !fTo)) fTo = (accItems().find(([id]) => id !== fAcc) || [fAcc])[0];
  $('#accLabel').textContent = isTr ? '보내는 통장' : '통장';
  $('#accChips').innerHTML = chipsHtml(accItems(), fAcc, 'acc');
  $('#toField').hidden = !isTr;
  $('#toChips').innerHTML = isTr ? chipsHtml(accItems().filter(([id]) => id !== fAcc), fTo, 'to') : '';
  $('#giftRow').hidden = fSign >= 0;
  $('#accField').hidden = gift;
  // 비상금 구분 통장에서 꺼내는 돈(나간 돈·이체)이면 매달 / 현금 비상금 중 고르기
  const showFund = fAcc === fundAcc() && (fSign < 0 || isTr) && !gift;
  $('#fundField').hidden = !showFund;
  if (showFund) $('#fundChips').innerHTML = chipsHtml(Object.entries(FUNDS), fFund, 'fund');
  $('#catField').hidden = isTr;
  if (isTr) return;

  // 분류 → 세부 항목 → 두 번째 선택지
  const cats = catsOf(fSign);
  if (!cats.some(c => c[0] === fCat)) fCat = cats[0][0];
  $('#catChips').innerHTML = chipsHtml(cats.map(([c, e]) => [c, `${e} ${c}`]), fCat, 'cat');
  $('#etcName').hidden = fCat !== '기타';

  const subs = fSign < 0 && C.subcats[fCat]?.length ? C.subcats[fCat] : null;
  const optional = C.optionalSubs.includes(fCat);
  if (subs && !subs.includes(fSub)) fSub = optional ? null : subs[0];
  if (!subs) fSub = null;
  $('#subChips').hidden = !subs;
  $('#subLabel').hidden = !subs;
  $('#subChips').innerHTML = subs ? chipsHtml(subs.map(s => [s, s]), fSub, 'sub') : '';

  const od = fSign < 0 && C.opts[fCat]?.choices?.length ? C.opts[fCat] : null;
  if (od && !od.choices.includes(fOpt)) fOpt = od.choices[0];
  if (!od) fOpt = null;
  $('#optField').hidden = !od;
  if (od) {
    $('#optLabel').textContent = od.label;
    $('#optChips').innerHTML = chipsHtml(od.choices.map(c => [c, c]), fOpt, 'opt');
  }
}

// 비상금 구분 통장에서 꺼낸 돈일 때만 비상금 구분 저장
const fundOf = () => ($('#fundField').hidden ? null : fFund);

function saveForm() {
  const n = parseWon($('#amount').value);
  if (n <= 0) { toast('금액을 입력해 주세요'); return; }
  const date = $('#date').value || today(), memo = $('#memo').value.trim();
  if (fSign === TRANSFER) return saveTransfer(n, date, memo);
  const cat = fCat === '기타' ? ($('#etcName').value.trim() || '기타') : fCat;
  const data = { date, acc: fAcc, amt: fSign * n, cat, sub: fSub, opt: fOpt, treat: false, gift: fSign < 0 && $('#gift').checked, memo,
    fund: fundOf() };
  if (editing) Object.assign(editing, data);
  else store.s.tx.push({ id: newId(), kind: 'manual', order: Date.now(), ...data });
  persist(); closeSheets(); render();
  toast(editing ? '수정했어요' : data.gift ? `🎁 기프티콘 ${won(n)} 소비 기록` : `${accName(fAcc)} ${signed(data.amt)}`);
}

// 통장 이체 (예: ATM에서 국민 → 현금): 양쪽 통장에 한 묶음으로 기록
function saveTransfer(n, date, memo) {
  const group = newId(), order = Date.now(), from = accName(fAcc), to = accName(fTo);
  const base = { date, kind: 'manual', group, transfer: true, cat: '이체', order };
  store.s.tx.push(
    { id: newId(), ...base, acc: fAcc, amt: -n, memo: memo || `${ro(to)} 이체`, fund: fundOf() },
    { id: newId(), ...base, acc: fTo, amt: n, memo: memo || `${from}에서 이체` });
  persist(); closeSheets(); render();
  toast(`${from} → ${to} ${won(n)} 이체`);
}

// 기록 누르기: 직접 쓴 건 수정, 이체·월급날·자동이체는 묶음 삭제
function onTx(id) {
  const t = store.s.tx.find(x => x.id === id);
  if (!t) return;
  if (t.kind === 'manual' && !t.group) return openForm(t);
  // 고정지출 자동출금은 이 한 건만 지움 (다시 자동으로 들어오지 않음)
  if (t.kind === 'fixed' || !t.group) {
    if (!confirm('이 기록을 지울까요?')) return;
    store.s.tx = store.s.tx.filter(x => x !== t);
    persist(); render(); toast('지웠어요'); return;
  }
  const what = t.kind === 'salary' ? '이 월급날 기록 전체(통장별 이체 포함)' : '이 이체 기록(양쪽 통장)';
  if (!confirm(`${what}를 지울까요?`)) return;
  store.s.tx = store.s.tx.filter(x => x.group !== t.group);
  persist(); render(); toast('지웠어요');
}

// ----- 이벤트 연결 -----
const pick = (sel, attr, fn) => { $(sel).onclick = e => { const b = e.target.closest(`[data-${attr}]`); if (b) { fn(b.dataset[attr]); drawForm(); } }; };
pick('#signSeg', 'sign', v => { fSign = +v; });
pick('#accChips', 'acc', v => { fAcc = v; });
pick('#toChips', 'to', v => { fTo = v; });
pick('#catChips', 'cat', v => { fCat = v; });
pick('#subChips', 'sub', v => { fSub = fSub === v && C.optionalSubs.includes(fCat) ? null : v; });
pick('#optChips', 'opt', v => { fOpt = v; });
pick('#fundChips', 'fund', v => { fFund = v; });
$('#gift').onchange = drawForm;
$('#quick').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  const add = +b.dataset.add, n = add ? Math.min(parseWon($('#amount').value) + add, 99999999) : 0;
  $('#amount').value = n ? n.toLocaleString('ko-KR') : '';
};
$('#amount').oninput = e => fmtInput(e.target);
$('#saveBtn').onclick = saveForm;
$('#delBtn').onclick = () => {
  if (!confirm('이 기록을 지울까요?')) return;
  store.s.tx = store.s.tx.filter(t => t !== editing);
  persist(); closeSheets(); render(); toast('지웠어요');
};
