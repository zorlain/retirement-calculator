/* ---------- 공통 유틸 ---------- */
function toNumber(str) {
  const n = Number(String(str || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

/* 만원 단위 숫자를 억/만원으로 보기 좋게 포맷 */
function formatManwon(n) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10000) {
    return `${sign}${(abs / 10000).toFixed(2)}억원`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}만원`;
}

/* 입력창에 천단위 콤마 자동 포맷 */
function bindThousandsInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const raw = el.value.replace(/[^\d.]/g, "");
    const parts = raw.split(".");
    const intPart = parts[0] ? Number(parts[0]).toLocaleString("ko-KR") : "";
    el.value = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  });
}

/* ---------- 정보 툴팁 ---------- */
function initInfoTooltips() {
  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = btn.classList.contains("open");
      document.querySelectorAll(".info-btn.open").forEach((b) => b.classList.remove("open"));
      if (!wasOpen) btn.classList.add("open");
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".info-btn.open").forEach((b) => b.classList.remove("open"));
  });
}

/* ---------- 다크/라이트 모드 토글 ---------- */
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  const getTheme = () => document.documentElement.getAttribute("data-theme") || "light";
  const applyIcon = () => {
    btn.textContent = getTheme() === "dark" ? "☀️" : "🌙";
  };

  applyIcon();
  btn.addEventListener("click", () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    applyIcon();
  });
}

/* ---------- 사이드바 (모바일 드로어) ---------- */
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (!sidebar || !toggle || !backdrop) return;
  const close = () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
  };
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("open");
    backdrop.classList.toggle("open");
  });
  backdrop.addEventListener("click", close);
}

/* ---------- 은퇴자산 시뮬레이션 (매달 복리) ----------
   매달: 잔액 = 잔액 * (1 + 월수익률) + 월저축액.
   연 단위 스냅샷을 함께 남겨 성장 그래프에 사용한다. */
function simulateGrowth(startAsset, monthlySaving, annualRatePct, years) {
  const monthlyRate = annualRatePct / 100 / 12;
  let balance = startAsset;
  const yearly = [Math.round(balance)];
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthlySaving;
    }
    yearly.push(Math.round(balance));
  }
  return { finalBalance: balance, yearly };
}

/* 자산이 매달 인출되어 소진되는 과정을 시뮬레이션 (연 단위로 인출액이 증가) */
function simulateDepletion(startAsset, initialMonthlyWithdrawal, annualRatePct, inflationPct, capYears) {
  const monthlyRate = annualRatePct / 100 / 12;
  let balance = startAsset;
  let withdrawal = initialMonthlyWithdrawal;
  const yearly = [Math.round(balance)];

  for (let y = 1; y <= capYears; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) - withdrawal;
      if (balance <= 0) {
        yearly.push(0);
        return { depleted: true, years: y - 1 + (m + 1) / 12, yearly };
      }
    }
    yearly.push(Math.round(balance));
    withdrawal = withdrawal * (1 + inflationPct / 100);
  }
  return { depleted: false, years: capYears, finalBalance: balance, yearly };
}

/* ---------- 연도별 자산 증감 막대그래프 ---------- */
function renderGrowthChart(yearly, title) {
  const years = yearly.length - 1;
  const maxBars = 16;
  const step = Math.max(1, Math.ceil(years / maxBars));

  const points = [];
  for (let y = 0; y <= years; y += step) points.push({ year: y, value: yearly[y] });
  if (points[points.length - 1].year !== years) points.push({ year: years, value: yearly[years] });

  const maxValue = Math.max(...points.map((p) => p.value), 1);

  const bars = points
    .map((p) => {
      const heightPct = Math.max(2, (p.value / maxValue) * 100);
      return `
        <div class="growth-chart-col">
          <div class="growth-chart-value">${formatManwon(p.value)}</div>
          <div class="growth-chart-bar" style="height:${heightPct}%"></div>
          <div class="growth-chart-label">${p.year}년</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="growth-chart">
      <div class="growth-chart-title">${title || "연도별 예상 자산 성장"}</div>
      <div class="growth-chart-bars">${bars}</div>
    </div>
  `;
}

/* ---------- 상태 ---------- */
let goalState = null; // 1단계 결과: { target, years, rate, inflation, monthlySpend, futureMonthlySpend }
let savingState = null; // 2단계 결과: { currentAsset, requiredSaving }

/* 하위 단계의 안내 문구·자동 채움 값을 최신 goalState 기준으로 갱신 */
function refreshDownstreamFromGoal() {
  const savingContext = document.getElementById("saving-context");
  const progressContext = document.getElementById("progress-context");
  const depletionContext = document.getElementById("depletion-context");

  document.getElementById("saving-result").innerHTML = "";
  document.getElementById("progress-result").innerHTML = "";
  document.getElementById("depletion-result").innerHTML = "";
  savingState = null;

  if (!goalState) {
    savingContext.textContent = "먼저 위에서 목표 자산을 계산합니다.";
    progressContext.textContent = "먼저 위 단계를 계산합니다.";
    depletionContext.textContent = "먼저 1단계에서 목표 자산을 계산합니다.";
    return;
  }

  const summary = `목표 자산 ${formatManwon(goalState.target)} · 수익률 ${goalState.rate}% · 은퇴 시기 ${goalState.years}년 후 기준`;
  savingContext.textContent = `${summary}으로 계산합니다.`;
  progressContext.textContent = "먼저 2단계에서 필요 저축액을 계산합니다.";

  const depletionAssetEl = document.getElementById("depletion-asset");
  const depletionWithdrawalEl = document.getElementById("depletion-withdrawal");
  depletionAssetEl.value = Math.round(goalState.target).toLocaleString("ko-KR");
  depletionWithdrawalEl.value = Math.round(goalState.futureMonthlySpend).toLocaleString("ko-KR");
  depletionContext.textContent = `수익률 ${goalState.rate}% · 인플레이션 ${goalState.inflation}% 기준으로 계산합니다. 값은 직접 바꿀 수 있습니다.`;
}

/* ---------- 1단계: 목표 자산 계산 ---------- */
function setupGoal() {
  bindThousandsInput("goal-spend");

  document.getElementById("goal-calc-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("goal-result");
    const monthlySpend = toNumber(document.getElementById("goal-spend").value);
    const rate = toNumber(document.getElementById("goal-rate").value);
    const years = Math.round(toNumber(document.getElementById("goal-years").value));
    const inflation = toNumber(document.getElementById("goal-inflation").value);

    if (
      !monthlySpend ||
      monthlySpend <= 0 ||
      !Number.isFinite(rate) ||
      !years ||
      years <= 0 ||
      !Number.isFinite(inflation)
    ) {
      resultEl.innerHTML = `<p class="result-placeholder">월 생활비, 예상 연 수익률, 은퇴 시기, 인플레이션을 모두 입력합니다.</p>`;
      goalState = null;
      refreshDownstreamFromGoal();
      return;
    }

    const realWithdrawalRate = rate - inflation;
    if (realWithdrawalRate <= 0) {
      resultEl.innerHTML = `<p class="result-placeholder">예상 연 수익률이 인플레이션보다 높아야 계산할 수 있습니다.</p>`;
      goalState = null;
      refreshDownstreamFromGoal();
      return;
    }

    const futureMonthlySpend = monthlySpend * Math.pow(1 + inflation / 100, years);
    const target = (futureMonthlySpend * 12) / (realWithdrawalRate / 100);

    goalState = { target, years, rate, inflation, monthlySpend, futureMonthlySpend };

    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">${years}년 후 낙원을 이루기 위한 자산</div>
        <div class="result-hero-value">${formatManwon(target)}</div>
        <div class="result-hero-sub">실질 인출률 ${realWithdrawalRate.toFixed(1)}% (수익률 ${rate}% − 인플레이션 ${inflation}%) 기준</div>
      </div>
      <div class="result-grid">
        <div class="result-stat">
          <div class="result-stat-label">현재 기준 월 생활비</div>
          <div class="result-stat-value">${formatManwon(monthlySpend)}</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-label">${years}년 후 월 생활비(인플레 반영)</div>
          <div class="result-stat-value">${formatManwon(futureMonthlySpend)}</div>
        </div>
      </div>
    `;

    refreshDownstreamFromGoal();
  });
}

/* ---------- 2단계: 필요 월 저축액 ---------- */
function setupSaving() {
  bindThousandsInput("saving-current-asset");

  document.getElementById("saving-calc-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("saving-result");
    if (!goalState) {
      resultEl.innerHTML = `<p class="result-placeholder">먼저 1단계에서 목표 자산을 계산합니다.</p>`;
      return;
    }

    const currentAsset = toNumber(document.getElementById("saving-current-asset").value) || 0;
    const monthlyRate = goalState.rate / 100 / 12;
    const months = goalState.years * 12;
    const futureValueOfCurrent = currentAsset * Math.pow(1 + monthlyRate, months);

    document.getElementById("progress-result").innerHTML = "";

    if (futureValueOfCurrent >= goalState.target) {
      savingState = { currentAsset, requiredSaving: 0 };
      resultEl.innerHTML = `
        <div class="result-hero">
          <div class="result-hero-label">필요 월 저축액</div>
          <div class="result-hero-value positive">0원</div>
          <div class="result-hero-sub">현재 자산만으로도 ${goalState.years}년 후 목표(${formatManwon(goalState.target)})에 도달합니다.</div>
        </div>
      `;
      document.getElementById("progress-context").textContent = "2단계 결과를 기준으로 계산합니다.";
      const plannedEl = document.getElementById("progress-planned-saving");
      if (!plannedEl.value) plannedEl.value = "0";
      return;
    }

    const requiredSaving =
      monthlyRate === 0
        ? (goalState.target - futureValueOfCurrent) / months
        : (goalState.target - futureValueOfCurrent) / ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);

    savingState = { currentAsset, requiredSaving };

    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">목표 달성을 위한 필요 월 저축액</div>
        <div class="result-hero-value">${formatManwon(requiredSaving)}</div>
        <div class="result-hero-sub">${goalState.years}년 후 ${formatManwon(goalState.target)} 목표 기준</div>
      </div>
    `;

    document.getElementById("progress-context").textContent = `현재 자산 ${formatManwon(currentAsset)} · ${goalState.years}년 후 ${formatManwon(goalState.target)} 목표 기준으로 계산합니다.`;
    const plannedEl = document.getElementById("progress-planned-saving");
    if (!plannedEl.value) plannedEl.value = Math.max(0, Math.round(requiredSaving)).toLocaleString("ko-KR");
  });
}

/* ---------- 3단계: 목표 달성 진행률 확인 ---------- */
function setupProgress() {
  bindThousandsInput("progress-planned-saving");

  document.getElementById("progress-calc-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("progress-result");
    if (!goalState || !savingState) {
      resultEl.innerHTML = `<p class="result-placeholder">먼저 위 단계를 계산합니다.</p>`;
      return;
    }

    const plannedSaving = toNumber(document.getElementById("progress-planned-saving").value) || 0;
    const { finalBalance } = simulateGrowth(savingState.currentAsset, plannedSaving, goalState.rate, goalState.years);
    const diff = finalBalance - goalState.target;
    const progressPct = Math.min(100, (finalBalance / goalState.target) * 100);

    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">${goalState.years}년 후 예상 자산</div>
        <div class="result-hero-value">${formatManwon(finalBalance)}</div>
      </div>
      <div class="result-grid">
        <div class="result-stat">
          <div class="result-stat-label">목표 자산과의 차이</div>
          <div class="result-stat-value ${diff >= 0 ? "positive" : "negative"}">${diff >= 0 ? "+" : "-"}${formatManwon(Math.abs(diff))}</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-label">목표 달성률</div>
          <div class="result-stat-value">${progressPct.toFixed(1)}%</div>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-track">
          <div class="progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>
      <p class="result-hero-sub" style="text-align:center;margin-top:14px;">
        ${
          diff >= 0
            ? "목표 자산을 달성할 것으로 예상됩니다."
            : `목표 자산에는 ${formatManwon(Math.abs(diff))} 부족할 것으로 예상됩니다.`
        }
      </p>
    `;
  });
}

/* ---------- 4단계: 은퇴 후 자산 소진 검증 ---------- */
function setupDepletion() {
  bindThousandsInput("depletion-asset");
  bindThousandsInput("depletion-withdrawal");

  document.getElementById("depletion-calc-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("depletion-result");
    if (!goalState) {
      resultEl.innerHTML = `<p class="result-placeholder">먼저 1단계에서 목표 자산을 계산합니다.</p>`;
      return;
    }

    const retireAsset = toNumber(document.getElementById("depletion-asset").value);
    const withdrawal = toNumber(document.getElementById("depletion-withdrawal").value);
    const rate = goalState.rate;
    const inflation = goalState.inflation;

    if (!retireAsset || retireAsset <= 0 || !withdrawal || withdrawal <= 0) {
      resultEl.innerHTML = `<p class="result-placeholder">은퇴 시점 자산과 월 인출액을 입력합니다.</p>`;
      return;
    }

    const capYears = 60;
    const result = simulateDepletion(retireAsset, withdrawal, rate, inflation, capYears);

    if (result.depleted) {
      resultEl.innerHTML = `
        <div class="result-hero">
          <div class="result-hero-label">자산 소진까지 예상 기간</div>
          <div class="result-hero-value negative">약 ${result.years.toFixed(1)}년</div>
          <div class="result-hero-sub">이 시점 이후에도 같은 조건으로 인출을 지속하면 자산이 바닥날 것으로 예상됩니다.</div>
        </div>
        ${renderGrowthChart(result.yearly, "연도별 예상 자산 잔액")}
      `;
    } else {
      resultEl.innerHTML = `
        <div class="result-hero">
          <div class="result-hero-label">${capYears}년 후 잔액</div>
          <div class="result-hero-value positive">${formatManwon(result.finalBalance)}</div>
          <div class="result-hero-sub">${capYears}년 동안 자산이 소진되지 않을 것으로 예상됩니다.</div>
        </div>
        ${renderGrowthChart(result.yearly, "연도별 예상 자산 잔액")}
      `;
    }
  });
}

function init() {
  initThemeToggle();
  initSidebar();
  initInfoTooltips();
  setupGoal();
  setupSaving();
  setupProgress();
  setupDepletion();
}

document.addEventListener("DOMContentLoaded", init);
