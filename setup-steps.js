// ===== 설정 마법사 · 설정하기 화면의 각 단계 그리기 =====
// D(설정 초안)를 그리고, 입력칸은 data-k="경로"로 D에 바로 반영돼요 (setup.js의 bind)
const opt = (v, label, on) => `<option value="${esc(v)}" ${v === on ? 'selected' : ''}>${esc(label)}</option>`;
const wonIn = (k, v, ph = '0') => `<input class="input num" inputmode="numeric" data-k="${k}" data-t="won" value="${commaVal(v)}" placeholder="${ph}">`;
const field = (label, html, hint = '') => `<div class="field-label">${label}</div>${html}${hint ? `<div class="hint">${hint}</div>` : ''}`;
const plainAccs = () => D.cfg.accounts.filter(a => !isSaving(a));
const accSelect = (k, on, list, extra = '') => `<select class="input" data-k="${k}" data-r="1">${extra}${list.map(a => opt(a.id, a.name || '(이름 없음)', on)).join('')}</select>`;

const STEPS = {
  accounts: { title: '통장', lead: '쓰고 있는 통장을 모두 적어주세요. 이 순서대로 홈에 보여요 (↑로 순서 바꾸기). 종류가 적금이면 적금 단계에서 납입일·금액을 정해요.', draw() {
    return D.cfg.accounts.map((a, i) => `<div class="edit-card">
      <div class="edit-top">
        <button class="dot" style="background:${esc(a.color)}" data-act="color" data-i="${i}" aria-label="색 바꾸기">${esc(dotText({ ...a, name: a.name || '?' }))}</button>
        <input class="input" data-k="accounts.${i}.name" value="${esc(a.name)}" placeholder="통장 이름 (예: 국민 입출금)" maxlength="14">
        ${i ? `<button class="x" data-act="up" data-i="${i}" aria-label="위로">↑</button>` : ''}
        <button class="x" data-act="delAcc" data-i="${i}" aria-label="지우기">✕</button>
      </div>
      <div class="chips mt8">${KINDS.map(([k, n]) => `<button class="chip ${a.kind === k ? 'on' : ''}" data-act="kind" data-i="${i}" data-v="${k}">${n}</button>`).join('')}</div>
      <input class="input mt8" data-k="accounts.${i}.role" value="${esc(a.role)}" placeholder="용도 (예: 월세 · 관리비 · 구독)" maxlength="24">
      ${isSaving(a) ? '' : `<label class="check"><input type="checkbox" data-k="accounts.${i}.emergency" data-t="bool" data-r="1" ${a.emergency ? 'checked' : ''}> 비상금 통장이에요</label>`}
    </div>`).join('') + `<button class="add" data-act="addAcc">+ 통장 추가</button>`;
  } },

  salary: { title: '월급', lead: '월급이 들어오는 통장과, 생활비를 실제로 쓰는 통장을 골라요. 같은 통장이어도 돼요.', draw() {
    const c = D.cfg, chips = (act, on) => `<div class="chips">${plainAccs().map(a =>
      `<button class="chip ${a.id === on ? 'on' : ''}" data-act="${act}" data-v="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>`;
    return field('월급 (세후 · "월급 입금!" 버튼의 기본값)', wonIn('salary', c.salary)) +
      field('월급날', `<input class="input num" inputmode="numeric" data-k="salaryDay" data-t="int" value="${c.salaryDay}" placeholder="25">`,
        '매달 이 날부터 다음 달 예산으로 계산해요. 말일이면 31을 적어주세요.') +
      field('월급 받는 통장', chips('salaryAcc', c.salaryAcc)) +
      field('생활비 쓰는 통장', chips('living', c.livingAcc), '홈의 "이번 달 사용한 생활비"가 이 통장에서 쓴 돈이에요.') +
      field('한 달 생활비 예산 (없으면 비워두세요)', wonIn('livingBudget', c.livingBudget, '비우면 생활비 막대를 숨겨요')) +
      (c.livingBudget ? field('이 금액 아래면 "생활비 다 씀" 표시', wonIn('livingFloor', c.livingFloor)) : '');
  } },

  split: { title: '생활비 입금', lead: '"🏦 생활비 입금!" 버튼을 누르면 고른 통장에 생활비가 들어왔다고 기록해요. 금액은 누를 때마다 고칠 수 있어요.', draw() {
    const c = D.cfg, fixedBy = id => c.fixed.filter(f => f.acc === id).reduce((s, f) => s + (f.amount || 0), 0);
    return field('생활비가 들어오는 통장', `<div class="chips">${plainAccs().map(a =>
        `<button class="chip ${a.id === c.livingIn.acc ? 'on' : ''}" data-act="livingInAcc" data-v="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>`,
        fixedBy(c.livingIn.acc) ? `이 통장에서 나가는 고정지출 합계: ${won(fixedBy(c.livingIn.acc))}` : '') +
      field('매달 들어오는 생활비 (기본값)', wonIn('livingIn.amount', c.livingIn.amount));
  } },

  fixed: { title: '고정지출', lead: '매달 같은 날 자동으로 나가는 돈이에요. 그 날짜 0시가 지나면 앱을 열 때 나가는 통장에서 자동으로 출금 기록돼요. 나중에 고정지출 탭에서도 고칠 수 있어요.', draw() {
    const c = D.cfg, total = c.fixed.reduce((s, f) => s + (f.amount || 0), 0);
    return c.fixed.map((f, i) => `<div class="edit-card">
      <div class="edit-top"><input class="input" data-k="fixed.${i}.name" value="${esc(f.name)}" placeholder="이름 (예: 휴대폰 요금)" maxlength="20">
        <button class="x" data-act="delFixed" data-i="${i}" aria-label="지우기">✕</button></div>
      <div class="grid2 mt8">
        <div><label>금액</label>${wonIn(`fixed.${i}.amount`, f.amount)}</div>
        <div><label>매달 며칠</label><input class="input num" inputmode="numeric" data-k="fixed.${i}.day" data-t="int" value="${f.day || ''}" placeholder="25"></div>
        <div><label>나가는 통장</label>${accSelect(`fixed.${i}.acc`, f.acc, plainAccs())}</div>
        <div><label>메모</label><input class="input" data-k="fixed.${i}.memo" value="${esc(f.memo)}" placeholder="예: 운전자보험" maxlength="30"></div>
      </div></div>`).join('') + `<button class="add" data-act="addFixed">+ 고정지출 추가</button>
      <div class="split-list num">${kv(`매달 고정지출 ${c.fixed.length}건`, won(total), 'total')}</div>`;
  } },

  savings: { title: '적금', lead: '날짜가 되면 고른 통장에서 적금으로 자동이체가 기록돼요. 그 전까지는 "적금 이체 대기"로 따로 보여요.', draw() {
    const list = D.cfg.savings.map((sv, i) => {
      const passed = payDates(sv).filter(d => d <= today()).length;
      return `<div class="edit-card"><b>🐷 ${esc(accName2(sv.acc))}</b>
      <div class="grid2 mt8">
        <div><label>어느 통장에서</label>${accSelect(`savings.${i}.from`, sv.from, plainAccs())}</div>
        <div><label>매달 넣는 돈</label>${wonIn(`savings.${i}.amount`, sv.amount)}</div>
        <div><label>첫 납입일</label><input type="date" class="input" data-k="savings.${i}.start" data-r="start" value="${esc(sv.start)}"></div>
        <div><label>총 회차</label><input class="input num" inputmode="numeric" data-k="savings.${i}.rounds" data-t="int" data-r="1" value="${sv.rounds || ''}" placeholder="12"></div>
        <div><label>이미 낸 회차</label><input class="input num" inputmode="numeric" data-k="savings.${i}.paidBefore" data-t="int" value="${sv.paidBefore || 0}"></div>
        <div><label>금리 (연 %)</label><input class="input num" inputmode="decimal" data-k="savings.${i}.rate" data-t="float" value="${sv.rate ?? ''}" placeholder="0.0"></div>
      </div>
      <div class="field-label">만기일 (비우면 마지막 회차 한 달 뒤 · ${dotted(maturityOf({ ...sv, maturity: '' }))})</div>
      <input type="date" class="input" data-k="savings.${i}.maturity" value="${esc(sv.maturity)}">
      <div class="hint">이미 낸 회차는 지금 잔액에 들어 있는 회차예요. 오늘까지 날짜가 지난 회차: ${passed}회</div></div>`;
    }).join('');
    return (list || `<div class="empty">적금 통장이 없어요.<br>1단계에서 종류를 "적금"으로 고르면 여기서 설정해요.</div>`) +
      field('예상에 더할 돈 (보너스 등 · 없으면 비워두세요)', wonIn('bonusExpect', D.bonusExpect, '예) 1,000,000')) +
      field('적금 만기 후 계획 메모 (한 줄에 하나 · 적금 탭에 보여요)', `<textarea class="input" rows="3" data-k="cfg.plan" placeholder="예) 만기되면 1년 예금으로 옮기기">${esc(D.cfg.plan)}</textarea>`);
  } },

  emerg: { title: '홈 화면', lead: '홈 위쪽 두 칸에 보일 내용을 골라요. 오른쪽 칸은 "비상금 통장"에 체크한 통장의 잔액(적금 이체 대기분 제외)이에요.', draw() {
    const c = D.cfg, em = c.accounts.filter(a => a.emergency && !isSaving(a));
    return field('왼쪽 칸', `<div class="chips">${[['spent', '이번 달 사용한 생활비'], ['saved', '지금까지 모은 돈 (적금·예금)']].map(([v, n]) =>
        `<button class="chip ${c.homeLeft === v ? 'on' : ''}" data-act="homeLeft" data-v="${v}">${n}</button>`).join('')}</div>`) +
      `<label class="check"><input type="checkbox" data-k="showEmerg" data-t="bool" ${c.showEmerg !== false ? 'checked' : ''}> 오른쪽 칸에 비상금 보이기</label>
      <div class="field-label">비상금</div>${em.length ? '' : '<div class="hint warn">1단계에서 "비상금 통장"에 체크한 통장이 없으면 비상금 칸이 숨겨져요.</div>'}`+`<label class="check"><input type="checkbox" data-k="fund.on" data-t="bool" data-r="1" ${c.fund.on ? 'checked' : ''}> 비상금을 "${FUNDS.monthly}"과 "${FUNDS.cash}"으로 나눠 볼래요</label>
      <div class="hint">매달 조금씩 쌓는 돈과, 따로 모아둔 큰돈을 한 통장에서 구분해요. 그 통장에서 돈을 쓸 때 어느 쪽에서 썼는지 골라요.</div>` +
      (c.fund.on ? (em.length ? field('나눠 볼 통장', `<div class="chips">${em.map(a =>
        `<button class="chip ${a.id === c.fund.acc ? 'on' : ''}" data-act="fundAcc" data-v="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>`)
        : `<div class="hint warn">1단계에서 "비상금 통장"에 체크한 통장이 있어야 해요.</div>`) : '') +
      field('내역에서 "쓴 돈"을 따로 볼 통장 (최대 3개)', `<div class="chips">${c.accounts.filter(a => !isSaving(a)).map(a =>
        `<button class="chip ${c.sumAccs.includes(a.id) ? 'on' : ''}" data-act="sumAcc" data-v="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>`);
  } },

  cats: { title: '분류', lead: '기록할 때 고르는 분류예요. 세부 항목은 쉼표로, 두 번째 선택지는 "이름: 선택1, 선택2"로 적어요.', draw() {
    const rows = D.catRows[catSide];
    return `<div class="seg mt8"><button class="${catSide === 'out' ? 'on' : ''}" data-act="catSide" data-v="out">나간 돈</button><button class="${catSide === 'in' ? 'on' : ''}" data-act="catSide" data-v="in">들어온 돈</button></div>` +
      rows.map((r, i) => `<div class="edit-card">
        <div class="edit-top"><input class="input emoji-in" data-k="catRows.${catSide}.${i}.emoji" value="${esc(r.emoji)}" maxlength="4">
          <input class="input" data-k="catRows.${catSide}.${i}.name" value="${esc(r.name)}" placeholder="분류 이름" maxlength="12">
          <button class="x" data-act="delCat" data-i="${i}" aria-label="지우기">✕</button></div>
        ${catSide === 'out' ? `<input class="input mt8" data-k="catRows.out.${i}.subs" value="${esc(r.subs)}" placeholder="세부 항목 (예: 점심, 저녁, 배달)">
        <input class="input mt8" data-k="catRows.out.${i}.opt" value="${esc(r.opt)}" placeholder="두 번째 선택지 (예: 누구랑: 혼자, 내가 사줌)">
        <label class="check"><input type="checkbox" data-k="catRows.out.${i}.optional" data-t="bool" ${r.optional ? 'checked' : ''}> 세부 항목은 안 골라도 돼요</label>` : ''}
      </div>`).join('') + `<button class="add" data-act="addCat">+ 분류 추가</button>
      <div class="hint">"기타"는 항상 맨 끝에 있어요. 고르면 이름을 직접 쓸 수 있어요. "OO 환급"(들어온 돈)은 분석에서 "OO" 지출에서 빼줘요.</div>`;
  } },

  balance: { title: '잔액', lead: '', draw() {
    const fresh = !store.s.tx.length || D.mode === 'wizard' && !store.s.fromV2;
    const fa = D.cfg.fund.on ? D.cfg.fund.acc : null;
    return `<div class="lead">${fresh ? '지금 통장 앱·지갑에 있는 금액을 적어주세요. 나중에 내역 → 통장 → "실제 잔액으로 맞추기"로도 고칠 수 있어요.'
        : '첫 기록 이전의 시작 잔액이에요. 지금 잔액을 맞출 땐 내역의 "실제 잔액으로 맞추기"가 편해요.'}</div>
      <div class="grid2">${D.cfg.accounts.map(a => `<div><label>${esc(a.name || '(이름 없음)')}</label>${wonIn(`base.${a.id}`, D.base[a.id])}</div>`).join('')}</div>` +
      (fa ? field(`${esc(accName2(fa))} 중 ${FUNDS.cash} (${FUNDS.monthly}과 따로 모아둔 돈)`, wonIn('baseEmergency', D.baseEmergency)) : '');
  } },

  backup: { title: '백업', lead: '', draw() {
    return `<button class="menu-item" data-act="export">백업 파일 저장<small>기록과 설정을 파일 하나로 내보내요. 가끔 해두면 안심!</small></button>
      <button class="menu-item" data-act="import">백업 불러오기<small>저장해둔 파일로 기록·설정을 되살려요 (예전 버전 백업도 돼요)</small></button>
      <button class="menu-item red" data-act="clearRecords">기록만 지우기<small>설정은 그대로 두고 기록·잔액을 지워요</small></button>
      <button class="menu-item red" data-act="resetAll">전부 지우기<small>설정까지 지우고 처음 설정 마법사로 돌아가요</small></button>`;
  } },
};
const accName2 = id => D.cfg.accounts.find(a => a.id === id)?.name || '(통장)';
