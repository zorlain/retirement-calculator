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

/* ---------- 탭 내비게이션 ---------- */
function initTabs() {
  const tabs = document.getElementById("tabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const target = btn.dataset.tab;
    tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== target;
    });
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

/* 목표 금액에 도달하기까지 걸리는 개월 수 (최대 capMonths까지 시뮬레이션) */
function monthsToReach(startAsset, monthlySaving, annualRatePct, target, capMonths) {
  const monthlyRate = annualRatePct / 100 / 12;
  let balance = startAsset;
  if (balance >= target) return 0;
  for (let m = 1; m <= capMonths; m++) {
    balance = balance * (1 + monthlyRate) + monthlySaving;
    if (balance >= target) return m;
  }
  return null;
}

/* ---------- 연도별 자산 성장 막대그래프 ---------- */
function renderGrowthChart(yearly) {
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
      <div class="growth-chart-title">연도별 예상 자산 성장</div>
      <div class="growth-chart-bars">${bars}</div>
    </div>
  `;
}

/* ---------- 상태 ---------- */
let simState = null;

/* ---------- 탭 1: 자산 시뮬레이션 ---------- */
function setupSim() {
  bindThousandsInput("s-asset");
  bindThousandsInput("s-saving");

  document.getElementById("sim-calc-btn").addEventListener("click", () => {
    const asset = toNumber(document.getElementById("s-asset").value) || 0;
    const saving = toNumber(document.getElementById("s-saving").value) || 0;
    const rate = toNumber(document.getElementById("s-rate").value);
    const years = Math.round(toNumber(document.getElementById("s-years").value));
    const resultEl = document.getElementById("sim-result");

    if (!years || years <= 0 || !Number.isFinite(rate)) {
      resultEl.innerHTML = `<p class="result-placeholder">예상 연 수익률과 시뮬레이션 기간을 입력해주세요.</p>`;
      return;
    }

    const { finalBalance, yearly } = simulateGrowth(asset, saving, rate, years);
    const totalContribution = asset + saving * 12 * years;
    const totalReturn = finalBalance - totalContribution;

    simState = { asset, saving, rate, years, finalBalance };

    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">${years}년 후 예상 자산</div>
        <div class="result-hero-value">${formatManwon(finalBalance)}</div>
      </div>
      <div class="result-grid">
        <div class="result-stat">
          <div class="result-stat-label">총 납입액(현재 자산 포함)</div>
          <div class="result-stat-value">${formatManwon(totalContribution)}</div>
        </div>
        <div class="result-stat">
          <div class="result-stat-label">투자 수익</div>
          <div class="result-stat-value positive">${formatManwon(totalReturn)}</div>
        </div>
      </div>
      ${renderGrowthChart(yearly)}
    `;
  });
}

/* ---------- 탭 2: 낙원 금액 (경제적 자유) ---------- */
let paradiseState = null;

function setupParadise() {
  bindThousandsInput("p-spend");
  bindThousandsInput("p-current-asset");
  bindThousandsInput("p-monthly-saving");

  const tabsEl = document.getElementById("tabs");
  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn || btn.dataset.tab !== "paradise" || !simState) return;
    const assetEl = document.getElementById("p-current-asset");
    const savingEl = document.getElementById("p-monthly-saving");
    if (!assetEl.value) assetEl.value = simState.asset.toLocaleString("ko-KR");
    if (!savingEl.value) savingEl.value = simState.saving.toLocaleString("ko-KR");
  });

  document.getElementById("paradise-calc-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("paradise-result");
    const monthlySpend = toNumber(document.getElementById("p-spend").value);
    const rate = toNumber(document.getElementById("p-rate").value);
    const years = Math.round(toNumber(document.getElementById("p-years").value));
    const inflation = toNumber(document.getElementById("p-inflation").value);

    if (
      !monthlySpend ||
      monthlySpend <= 0 ||
      !Number.isFinite(rate) ||
      !years ||
      years <= 0 ||
      !Number.isFinite(inflation)
    ) {
      resultEl.innerHTML = `<p class="result-placeholder">월 생활비, 예상 연 수익률, 은퇴 시기, 인플레이션을 모두 입력합니다.</p>`;
      paradiseState = null;
      document.getElementById("paradise-compare-result").innerHTML = "";
      return;
    }

    const realWithdrawalRate = rate - inflation;
    if (realWithdrawalRate <= 0) {
      resultEl.innerHTML = `<p class="result-placeholder">예상 연 수익률이 인플레이션보다 높아야 계산할 수 있습니다.</p>`;
      paradiseState = null;
      document.getElementById("paradise-compare-result").innerHTML = "";
      return;
    }

    const futureMonthlySpend = monthlySpend * Math.pow(1 + inflation / 100, years);
    const paradiseAmount = (futureMonthlySpend * 12) / (realWithdrawalRate / 100);

    paradiseState = { paradiseAmount, years, rate, inflation };

    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">${years}년 후 낙원을 이루기 위한 자산</div>
        <div class="result-hero-value">${formatManwon(paradiseAmount)}</div>
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

    document.getElementById("paradise-compare-result").innerHTML = "";
  });

  document.getElementById("paradise-compare-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("paradise-compare-result");
    if (!paradiseState) {
      resultEl.innerHTML = `<p class="result-placeholder">위에서 낙원 금액을 먼저 계산합니다.</p>`;
      return;
    }

    const currentAsset = toNumber(document.getElementById("p-current-asset").value) || 0;
    const monthlySaving = toNumber(document.getElementById("p-monthly-saving").value) || 0;

    const { finalBalance } = simulateGrowth(currentAsset, monthlySaving, paradiseState.rate, paradiseState.years);
    const diff = finalBalance - paradiseState.paradiseAmount;
    const progressPct = Math.min(100, (finalBalance / paradiseState.paradiseAmount) * 100);

    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">${paradiseState.years}년 후 예상 자산</div>
        <div class="result-hero-value">${formatManwon(finalBalance)}</div>
      </div>
      <div class="result-grid">
        <div class="result-stat">
          <div class="result-stat-label">낙원 금액과의 차이</div>
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
            ? "낙원 금액을 달성할 것으로 예상됩니다."
            : `낙원 금액에는 ${formatManwon(Math.abs(diff))} 부족할 것으로 예상됩니다.`
        }
      </p>
    `;
  });
}

function init() {
  initThemeToggle();
  initSidebar();
  initTabs();
  initInfoTooltips();
  setupSim();
  setupParadise();
}

document.addEventListener("DOMContentLoaded", init);
