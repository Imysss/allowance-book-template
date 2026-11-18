// ===== 고정지출 탭 · 고정지출 추가/수정 시트 · 생활비 입금 시트 =====
// app.js 다음에 로드됨: store, $, won, esc, render, toast, openSheet, closeSheets, persist 사용

// ----- 고정지출 탭 -----
function renderFixed() {
  const list = [...(C.fixed || [])].sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  const total = store.fixedTotal(), left = store.fixedLeft();
  $('#fixedTotal').textContent = won(total);
  $('#fixedDetail').innerHTML = `${list.length}건 · 이번 달 남은 고정지출 <b>${won(left)}</b>`;
  const days = [...new Set(list.map(f => f.day))];
  const t = today();
  $('#fixedList').innerHTML = list.length ? days.map(d => `<div class="fx-day">매달 ${d}일 · ${won(list.filter(f => f.day === d).reduce((s, f) => s + f.amount, 0))}</div>
    <div class="rows">${list.filter(f => f.day === d).map(f => {
      const a = accOf(f.acc), done = store.s.applied[`fx-${f.id}-${t.slice(0, 7)}`];
      return `<button class="row" data-fx="${esc(f.id)}">
        <div class="emoji">${emojiOf(f.cat)}</div>
        <div class="meta"><b>${esc(f.name)}</b><span><i class="fx-acc" style="background:${esc(a.color)}"></i>${esc(a.name)}${f.memo ? ' · ' + esc(f.memo) : ''}${done ? ' · 이번 달 나감' : ''}</span></div>
        <div class="amt num out-c">-${won(f.amount)}</div></button>`;
    }).join('')}</div>`).join('') : `<div class="empty">아직 고정지출이 없어요.<br>아래 버튼으로 보험·관리비·통신비처럼 매달 나가는 돈을 추가해 보세요.</div>`;
  renderSavings();
}

// ----- 고정지출 추가·수정 시트 -----
let fxEditing = null, fxAcc = null, fxCat = '고정지출';
function openFixed(id) {
  const f = (C.fixed || []).find(x => x.id === id) || null;
  fxEditing = f;
  fxAcc = f ? f.acc : (C.fixed?.[0]?.acc || C.accounts.find(a => !isSaving(a)).id);
  fxCat = f ? f.cat || '고정지출' : '고정지출';
  $('#fixedTitle').textContent = f ? '📌 고정지출 고치기' : '📌 고정지출 추가';
  $('#fxName').value = f ? f.name : '';
  $('#fxDay').value = f ? f.day : '';
  $('#fxAmount').value = f ? commaVal(f.amount) : '';
  $('#fxMemo').value = f ? f.memo || '' : '';
  $('#fxDel').hidden = !f;
  drawFixedSheet();
  openSheet($('#fixedSheet'));
  if (!f) setTimeout(() => $('#fxName').focus(), 260);
}
function drawFixedSheet() {
  $('#fxAccChips').innerHTML = C.accounts.filter(a => !isSaving(a)).map(a =>
    `<button class="chip ${a.id === fxAcc ? 'on' : ''}" data-fxacc="${esc(a.id)}">${esc(a.name)}</button>`).join('');
  const cats = [['고정지출', '📌'], ...catsOf(-1).filter(c => c[0] !== '기타')];
  $('#fxCatChips').innerHTML = cats.map(([c, e]) => `<button class="chip ${c === fxCat ? 'on' : ''}" data-fxcat="${esc(c)}">${e} ${esc(c)}</button>`).join('');
}
function saveFixed() {
  const name = $('#fxName').value.trim(), day = parseInt($('#fxDay').value, 10), amount = parseWon($('#fxAmount').value);
  if (!name) return toast('이름을 적어주세요');
  if (!(day >= 1 && day <= 31)) return toast('날짜는 1~31 사이로 적어주세요');
  if (!(amount > 0)) return toast('금액을 적어주세요');
  const data = { name, day, amount, acc: fxAcc, cat: fxCat, memo: $('#fxMemo').value.trim() };
  // 새로 추가하면 오늘부터 (이번 달 날짜가 이미 지났으면 다음 달부터 나가요)
  if (fxEditing) Object.assign(fxEditing, data);
  else C.fixed.push({ id: newId(), since: today(), ...data });
  store.setCfg(C); persist(); closeSheets(); refreshAuto();
  toast(fxEditing ? '고쳤어요' : `매달 ${day}일 ${won(amount)} 추가했어요`);
}
function deleteFixed() {
  if (!confirm(`"${fxEditing.name}" 고정지출을 지울까요? 이미 나간 기록은 내역에 남아요.`)) return;
  C.fixed = C.fixed.filter(f => f !== fxEditing);
  store.setCfg(C); persist(); closeSheets(); render(); toast('지웠어요');
}

// ----- 생활비 입금 시트: 생활비가 들어오는 통장에 입금 기록 -----
function openSplit() {
  $('#splitDate').value = today();
  $('#splitFrom').textContent = `${accName(C.livingIn.acc)} 지금 잔액 ${won(store.balance(C.livingIn.acc))}`;
  $('#splitAmount').value = commaVal(C.livingIn.amount);
  drawSplit();
  openSheet($('#splitSheet'));
}
function drawSplit() {
  const amt = parseWon($('#splitAmount').value), acc = C.livingIn.acc;
  $('#splitSum').innerHTML = kv(`${esc(accName(acc))} 입금`, '+' + won(amt)) + kv('입금 후 잔액', won(store.balance(acc) + amt), 'total');
}
function confirmSplit() {
  const date = $('#splitDate').value || today(), amt = parseWon($('#splitAmount').value);
  if (!(amt > 0)) return toast('금액을 적어주세요');
  const b = budgetOf(date);
  if (store.salaryDone(b, 'split') && !confirm(`${Number(b.slice(5))}월 생활비는 이미 기록했어요. 한 번 더 기록할까요?`)) return;
  store.addLivingIn(date, amt);
  closeSheets(); render();
  toast(`🏦 ${accName(C.livingIn.acc)}에 생활비 ${won(amt)} 입금`);
}

// ----- 이벤트 -----
$('#fixedList').onclick = e => { const b = e.target.closest('[data-fx]'); if (b) openFixed(b.dataset.fx); };
$('#fixedAdd').onclick = () => openFixed(null);
$('#fxAccChips').onclick = e => { const b = e.target.closest('[data-fxacc]'); if (b) { fxAcc = b.dataset.fxacc; drawFixedSheet(); } };
$('#fxCatChips').onclick = e => { const b = e.target.closest('[data-fxcat]'); if (b) { fxCat = b.dataset.fxcat; drawFixedSheet(); } };
$('#fxAmount').oninput = e => fmtInput(e.target);
$('#fxSave').onclick = saveFixed;
$('#fxDel').onclick = deleteFixed;
$('#splitAmount').oninput = e => { fmtInput(e.target); drawSplit(); };
$('#splitConfirm').onclick = confirmSplit;
