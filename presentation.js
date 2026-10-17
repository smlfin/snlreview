/* ══════════════════════════════════════════════════════════
   PRESENTATION MODE — v3 (light theme, Monthly + YTD side-by-side)
   Reads script.js globals: allData, MONTHS, PLABEL, PROD_COLOR,
   OUT_CFG, getEffectiveMonths, calc, fmt, fmtFull, initials,
   parseDOJDate, SESSION_NAME, SESSION_ROLE, SESSION_BRANCH.
   No toggle switch — both periods shown simultaneously.
   Staff names + legend at TOP of dashboard & staff screens.
   RD Due shown on both branch aggregate and staff cards.
   ══════════════════════════════════════════════════════════ */

const presState = {
  screen: "branch",
  branchName: null,
  months: new Set(),
  staffName: null
};

/* ── Wait for script.js's own load() to finish ── */
(function waitForData() {
  const iv = setInterval(() => {
    if (typeof allData !== "undefined" && Array.isArray(allData) && allData.length) {
      clearInterval(iv);
      presInit();
    }
  }, 150);
})();

function presInit() {
  document.getElementById("presCrumb").textContent =
    SESSION_NAME + " · " + (SESSION_ROLE === "admin" ? "All Branches" : SESSION_BRANCH);
  if (SESSION_ROLE !== "admin" && allData.length === 1) {
    presSelectBranch(allData[0].branchName);
    return;
  }
  presRenderBranchGrid();
}

/* ═══════════════ SCREEN SWITCHING ═══════════════ */
function presShowScreen(name) {
  document.querySelectorAll(".pres-screen").forEach(s => s.classList.remove("on"));
  document.getElementById("scr-" + name).classList.add("on");
  presState.screen = name;
  document.getElementById("presBackBtn").style.display = name === "branch" ? "none" : "inline-block";
  presUpdateCrumb();
}

function presUpdateCrumb() {
  const parts = [SESSION_NAME];
  if (presState.branchName) parts.push(presState.branchName);
  if (presState.months.size) {
    const sorted = [...presState.months].sort((a,b) => MONTHS.indexOf(a) - MONTHS.indexOf(b));
    parts.push(presPeriodLabel(sorted));
  }
  if (presState.staffName) parts.push(presState.staffName);
  document.getElementById("presCrumb").textContent = parts.join(" · ");
}

function presGoBack() {
  if (presState.screen === "staff")  { presShowScreen("dash");   return; }
  if (presState.screen === "dash")   { presShowScreen("month");  return; }
  if (presState.screen === "month") {
    if (SESSION_ROLE !== "admin") return;
    presState.branchName = null;
    presShowScreen("branch");
    return;
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}

/* ═══════════════ SCREEN 1 — BRANCH PICKER ═══════════════ */
function presRenderBranchGrid() {
  const grid = document.getElementById("branchGrid");
  grid.innerHTML = allData.map((b, i) => {
    const agg = presAggregateBranch(b, presCurrentOrDefaultMonths());
    const pct = presOverallPct(agg);
    return `<div class="pres-tile" data-branch-idx="${i}">
      <div class="t-ring" style="background:${presPctBg(pct)};color:#fff">${pct}%</div>
      <div class="t-name">${presEsc(b.branchName)}</div>
      <div class="t-sub">${(b.staff || []).filter(s => s.name.toUpperCase() !== "TOTAL").length} staff</div>
    </div>`;
  }).join("");
  presShowScreen("branch");
}

document.getElementById("branchGrid").addEventListener("click", e => {
  const tile = e.target.closest(".pres-tile");
  if (!tile) return;
  const b = allData[Number(tile.dataset.branchIdx)];
  if (b) presSelectBranch(b.branchName);
});

function presEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function presSelectBranch(name) {
  presState.branchName = name;
  if (!presState.months.size) presState.months = new Set([presCurrentMonth()]);
  presRenderMonthChips();
  presShowScreen("month");
}

/* ═══════════════ SCREEN 2 — MONTH PICKER ═══════════════ */

/* Full month name map */
const MONTH_FULL = {
  Jan:"January", Feb:"February", Mar:"March",   Apr:"April",
  May:"May",     Jun:"June",     Jul:"July",     Aug:"August",
  Sep:"September", Oct:"October", Nov:"November", Dec:"December"
};
function presFullMonth(m) { return MONTH_FULL[m] || m; }

/* Period label using full names: "September" or "April – September" */
function presPeriodLabel(months) {
  if (!months || !months.length) return "";
  if (months.length === 1) return presFullMonth(months[0]);
  return presFullMonth(months[0]) + " – " + presFullMonth(months[months.length - 1]);
}
/* YTD label: "April – September (YTD)" */
function presYtdLabel(lastMonth) {
  return "April – " + presFullMonth(lastMonth) + " (YTD)";
}

function presCurrentMonth() {
  const m = new Date().toLocaleString('en-US', { month: 'short' });
  return MONTHS.includes(m) ? m : MONTHS[MONTHS.length - 1];
}
function presCurrentOrDefaultMonths() {
  return presState.months.size ? [...presState.months] : [presCurrentMonth()];
}
function presRenderMonthChips() {
  document.getElementById("monthTitle").textContent = "Select Month — " + presState.branchName;
  document.getElementById("monthChips").innerHTML = MONTHS.map(m =>
    `<span class="pres-chip ${presState.months.has(m) ? "on" : ""}" onclick="presToggleMonth('${m}')">${presFullMonth(m)}</span>`
  ).join("");
}
function presToggleMonth(m) {
  if (presState.months.has(m)) { if (presState.months.size > 1) presState.months.delete(m); }
  else presState.months.add(m);
  presRenderMonthChips();
}
function presQuickRange(kind) {
  const cur = presCurrentMonth();
  const idx = MONTHS.indexOf(cur);
  presState.months = kind === "ytd" ? new Set(MONTHS.slice(0, idx + 1)) : new Set([cur]);
  presRenderMonthChips();
}

/* ═══════════════ DUAL-COLUMN PRODUCT CARD ═══════════════
   Left  = selected period (blue)
   Right = YTD              (purple — strong shading)
   Figures stacked as label→value rows, never clipped.
   Short/Excess shown as full shaded row on both sides.
   RD Due shown when available.
   ═════════════════════════════════════════════════════════ */
function presDualProdCardHTML(k, ach, tgt, achYtd, tgtYtd, outstanding, due, inflow, periodLabel, ytdLabel) {
  const pct    = tgt    > 0 ? Math.round(ach    / tgt    * 100) : 100;
  const pctYtd = tgtYtd > 0 ? Math.round(achYtd / tgtYtd * 100) : 100;
  const gap    = ach    - tgt;
  const gapYtd = achYtd - tgtYtd;
  const color  = PROD_COLOR[k] || "#2d6bff";

  /* Outstanding + Due share ONE row — saves one full row of card height */
  const outDueRow = (outstanding || due)
    ? `<div class="pp-extra-row">
        ${outstanding ? `<span class="pp-extra pp-extra-half">📦 Outstanding: <b>${fmtFull(outstanding.amount, k)}</b>${outstanding.count ? ` <span class="pp-extra-n">(${outstanding.count} a/c)</span>` : ""}</span>` : `<span></span>`}
        ${due         ? `<span class="pp-extra pp-due pp-extra-half">⏰ Due: <b>${fmtFull(due.amount, k)}</b>${due.count ? ` <span class="pp-extra-n">(${due.count} a/c)</span>` : ""}</span>` : ""}
       </div>`
    : "";
  /* Inflow YTD — full-width row below */
  const inflowRow = (k === "RD" && inflow)
    ? `<div class="pp-extra pp-inflow">💰 Inflow YTD: <b>${fmtFull(inflow.amount, k)}</b>${inflow.count ? ` <span class="pp-extra-n">(${inflow.count} a/c)</span>` : ""}</div>`
    : "";

  return `<div class="pres-prod-card">
    <div class="pp-head">
      <span class="pp-dot" style="background:${color}"></span>
      <span class="pp-label">${PLABEL[k] || k}</span>
    </div>
    <div class="dual-cols">

      <!-- LEFT: Selected Period -->
      <div class="dual-col">
        <div class="dual-col-badge" style="border-color:${color}40;background:${color}12">
          <span class="dual-col-label">${presEsc(periodLabel)}</span>
          <span class="pp-pct-badge ${presPctClass(pct)}">${pct}%</span>
        </div>
        <div class="pp-track"><div class="pp-fill" style="width:${Math.min(pct,100)}%;background:${color}"></div></div>
        <div class="dual-fig-row">
          <div class="dual-fig">
            <span class="dual-fig-lbl">Achievement</span>
            <b class="dual-fig-val">${fmtFull(ach, k)}</b>
          </div>
          <div class="dual-fig">
            <span class="dual-fig-lbl">Target</span>
            <b class="dual-fig-val muted">${fmtFull(tgt, k)}</b>
          </div>
        </div>
        <div class="pp-gap ${gap < 0 ? 'short' : 'excess'}">
          ${gap < 0 ? '▼ Short' : '▲ Excess'} <b>${gap >= 0 ? '+' : ''}${fmtFull(gap, k)}</b>
        </div>
      </div>

      <!-- RIGHT: YTD -->
      <div class="dual-col">
        <div class="dual-col-badge" style="border-color:#a78bfa50;background:rgba(167,139,250,.08)">
          <span class="dual-col-label ytd-lbl">${presEsc(ytdLabel)}</span>
          <span class="pp-pct-badge ${presPctClass(pctYtd)}">${pctYtd}%</span>
        </div>
        <div class="pp-track"><div class="pp-fill" style="width:${Math.min(pctYtd,100)}%;background:#7c3aed"></div></div>
        <div class="dual-fig-row">
          <div class="dual-fig">
            <span class="dual-fig-lbl">Achievement</span>
            <b class="dual-fig-val">${fmtFull(achYtd, k)}</b>
          </div>
          <div class="dual-fig">
            <span class="dual-fig-lbl">Target</span>
            <b class="dual-fig-val muted">${fmtFull(tgtYtd, k)}</b>
          </div>
        </div>
        <div class="pp-gap ${gapYtd < 0 ? 'short' : 'excess'}">
          ${gapYtd < 0 ? '▼ Short' : '▲ Excess'} <b>${gapYtd >= 0 ? '+' : ''}${fmtFull(gapYtd, k)}</b>
        </div>
      </div>

    </div>
    ${outDueRow}${inflowRow}
  </div>`;
}

/* ═══════════════ SCREEN 3 — BRANCH DASHBOARD ═══════════════ */
function presShowDashboard() {
  const b = allData.find(x => x.branchName === presState.branchName);
  if (!b) return;

  const months    = [...presState.months].sort((a, b2) => MONTHS.indexOf(a) - MONTHS.indexOf(b2));
  const lastMonth = months[months.length - 1];
  const ytdMonths = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);

  const agg     = presAggregateBranch(b, months);
  const aggYtd  = presAggregateBranch(b, ytdMonths);
  const extra    = presAggregateExtra(agg.staff);
  const extraYtd = presAggregateExtra(aggYtd.staff);

  const periodLabel = presPeriodLabel(months);
  const ytdLabel    = presYtdLabel(lastMonth);

  presState.dash = { agg, aggYtd, extra, extraYtd, lastMonth, months, periodLabel, ytdLabel };

  document.getElementById("dashTitle").textContent = "🏢 " + b.branchName + " — " + periodLabel;
  document.getElementById("branchModeToggle").innerHTML = "";

  /* Legend pills in top strip */
  const pillsEl = document.getElementById("dashLegendPills");
  if (pillsEl) pillsEl.innerHTML = `
    <span class="dual-legend-pill period-pill">📅 ${presEsc(periodLabel)}</span>
    <span class="dual-legend-pill ytd-pill">📈 ${presEsc(ytdLabel)}</span>`;

  /* Staff chips with period % ring + YTD badge */
  document.getElementById("dashStaffGrid").innerHTML = agg.staff.map((s, i) => {
    const spct    = presStaffOverallPct(s, months);
    const spctYtd = presStaffOverallPct(s, ytdMonths);
    return `<div class="pres-staff-chip" data-staff-idx="${i}">
      <span class="c-ring" style="background:${presPctBg(spct)}">${spct}%</span>
      <span class="c-name">${presEsc(s.name)}</span>
      <span class="c-ytd-badge" style="color:${presPctColor(spctYtd)}">YTD ${spctYtd}%</span>
    </div>`;
  }).join("");

  presRenderProductGrid();

  presState.currentStaffList = agg.staff;
  presState.staffName = null;
  presShowScreen("dash");
}

function presRenderProductGrid() {
  const d = presState.dash;
  if (!d) return;
  const { agg, aggYtd, extra, extraYtd, periodLabel, ytdLabel } = d;

  document.getElementById("dashProducts").innerHTML = `
    <div class="pres-prod-grid">
    ${Object.keys(agg.totals).map(k => {
      const t    = agg.totals[k];
      const tYtd = aggYtd.totals[k] || { ach: 0, tgt: 0 };
      const out  = extra.outstanding[k] || null;
      /* RD Due — shown for branch aggregate */
      const due  = (k === "RD" && extra.rdDueAmount) ? { amount: extra.rdDueAmount, count: extra.rdDueCount } : null;
      return presDualProdCardHTML(k, t.ach, t.tgt, tYtd.ach, tYtd.tgt, out, due, null, periodLabel, ytdLabel);
    }).join("")}
    </div>`;
}

document.getElementById("dashStaffGrid").addEventListener("click", e => {
  const tile = e.target.closest(".pres-staff-chip");
  if (!tile) return;
  const list = presState.currentStaffList || [];
  const s    = list[Number(tile.dataset.staffIdx)];
  if (s) presSelectStaff(s.name);
});

/* ═══════════════ SCREEN 4 — STAFF DETAIL ═══════════════ */
function presSelectStaff(name) {
  presState.staffName = name;
  presRenderStaffCards();
  presShowScreen("staff");
}

function presRenderStaffCards() {
  const b = allData.find(x => x.branchName === presState.branchName);
  const s = (b.staff || []).find(x => x.name === presState.staffName);
  if (!s) return;

  const periodMonths = [...presState.months].sort((a, b2) => MONTHS.indexOf(a) - MONTHS.indexOf(b2));
  const lastMonth    = periodMonths[periodMonths.length - 1];
  const ytdMonths    = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);
  const periodLabel  = presPeriodLabel(periodMonths);
  const ytdLabel     = presYtdLabel(lastMonth);

  const svc = presServiceStr(s.doj);
  document.getElementById("staffAvatar").textContent = initials(s.name);
  document.getElementById("staffName").textContent   = s.name;
  document.getElementById("staffSub").textContent    =
    presState.branchName + " · " + periodLabel + " & " + ytdLabel + (svc ? " · " + svc : "");

  document.getElementById("staffModeToggle").innerHTML = "";

  /* Legend pills in staff top card */
  const staffPillsEl = document.getElementById("staffLegendPills");
  if (staffPillsEl) staffPillsEl.innerHTML = `
    <span class="dual-legend-pill period-pill">📅 ${presEsc(periodLabel)}</span>
    <span class="dual-legend-pill ytd-pill">📈 ${presEsc(ytdLabel)}</span>`;

  document.getElementById("staffCards").innerHTML = `
    <div class="pres-prod-grid">
    ${Object.keys(s.metrics).map(k => {
      const metric  = s.metrics[k];
      const rPeriod = calc(metric, periodMonths, s.doj);
      const rYtd    = calc(metric, ytdMonths,    s.doj);
      const out = (OUT_CFG[k] && metric.outstanding) ? { amount: metric.outstanding, count: metric.outstandingCount } : null;
      /* RD Due — shown on staff card */
      const due = (k === "RD" && metric.dueAmount) ? { amount: metric.dueAmount, count: metric.dueCount } : null;
      return presDualProdCardHTML(k, rPeriod.ach, rPeriod.tgt, rYtd.ach, rYtd.tgt, out, due, null, periodLabel, ytdLabel);
    }).join("") || `<div class="pres-empty">No product data for this staff member.</div>`}
    </div>`;

  presRenderStaffSwitchStrip(b);
}

function presRenderStaffSwitchStrip(b) {
  const list = (presState.currentStaffList && presState.currentStaffList.length)
    ? presState.currentStaffList
    : (b.staff || []).filter(x => x.name.toUpperCase() !== "TOTAL");
  document.getElementById("staffSwitchStrip").innerHTML = list.map(st =>
    `<span class="pres-staffswitch-chip ${st.name === presState.staffName ? "on" : ""}" data-switch-name="${presEsc(st.name)}">${presEsc(st.name)}</span>`
  ).join("");
}

document.getElementById("staffModeToggle").addEventListener("click", () => { /* no-op v3 */ });
document.getElementById("staffSwitchStrip").addEventListener("click", e => {
  const chip = e.target.closest("[data-switch-name]");
  if (chip && chip.dataset.switchName !== presState.staffName) presSelectStaff(chip.dataset.switchName);
});

/* ═══════════════ AGGREGATION ═══════════════ */
function presAggregateBranch(b, months) {
  const staff  = (b.staff || []).filter(s => s.name.toUpperCase() !== "TOTAL");
  const totals = {};
  staff.forEach(s => {
    for (const k in s.metrics) {
      if (!totals[k]) totals[k] = { tgt: 0, ach: 0 };
      const metric = s.metrics[k];
      months.forEach(m => totals[k].ach += (metric.monthlyAchievement[m] || 0));
      if (k !== "BusinessLoan") totals[k].tgt += (metric.monthlyTarget || 0) * getEffectiveMonths(s.doj, months).length;
    }
  });
  if (totals["BusinessLoan"]) {
    const blMonthly = b.blBranchMonthlyTarget || 0;
    const blAnnual  = b.blBranchTotalTarget   || 0;
    totals["BusinessLoan"].tgt = blAnnual > 0 ? blAnnual : (blMonthly * months.length);
  }
  if (totals["GoldLoan"] && b.glBranchMonthlyTarget) {
    totals["GoldLoan"].tgt = b.glBranchMonthlyTarget * months.length;
  }
  let onTgt = 0;
  staff.forEach(s => {
    let sa = 0, st = 0;
    for (const k in s.metrics) {
      if (k === "BusinessLoan") continue;
      const metric = s.metrics[k];
      months.forEach(m => sa += (metric.monthlyAchievement[m] || 0));
      st += (metric.monthlyTarget || 0) * getEffectiveMonths(s.doj, months).length;
    }
    if (st > 0 && sa >= st) onTgt++;
  });
  let belowProd = 0;
  for (const k in totals) {
    const p = totals[k].tgt > 0 ? Math.round(totals[k].ach / totals[k].tgt * 100) : 100;
    if (p < 100) belowProd++;
  }
  return { totals, staff, staffCount: staff.length, onTgt, belowProd };
}

function presOverallPct(agg) {
  let ach = 0, tgt = 0;
  for (const k in agg.totals) { ach += agg.totals[k].ach; tgt += agg.totals[k].tgt; }
  return tgt > 0 ? Math.round(ach / tgt * 100) : 100;
}

function presStaffOverallPct(s, months) {
  let ach = 0, tgt = 0;
  for (const k in s.metrics) {
    if (k === "BusinessLoan") continue;
    const metric = s.metrics[k];
    months.forEach(m => ach += (metric.monthlyAchievement[m] || 0));
    tgt += (metric.monthlyTarget || 0) * getEffectiveMonths(s.doj, months).length;
  }
  return tgt > 0 ? Math.round(ach / tgt * 100) : 100;
}

/* presAggregateExtra — collects outstanding balances AND RD Due amounts */
function presAggregateExtra(staffList) {
  const outstanding = {};
  let rdDueAmount = 0, rdDueCount = 0;
  staffList.forEach(s => {
    for (const k in s.metrics) {
      const m = s.metrics[k];
      if (OUT_CFG[k] && m.outstanding) {
        if (!outstanding[k]) outstanding[k] = { amount: 0, count: 0 };
        outstanding[k].amount += m.outstanding        || 0;
        outstanding[k].count  += m.outstandingCount   || 0;
      }
    }
    /* RD Due — aggregate across all staff */
    const rd = s.metrics["RD"];
    if (rd && rd.dueAmount) { rdDueAmount += rd.dueAmount; rdDueCount += rd.dueCount || 0; }
  });
  return { outstanding, rdDueAmount, rdDueCount };
}

function presServiceStr(dojStr) {
  const d = parseDOJDate(dojStr);
  if (!d) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months--;
  if (months < 0) months = 0;
  const yrs = Math.floor(months / 12), mos = months % 12;
  if (yrs === 0) return mos + (mos === 1 ? " mo" : " mos");
  if (mos === 0) return yrs + (yrs === 1 ? " yr" : " yrs");
  return yrs + (yrs === 1 ? " yr " : " yrs ") + mos + (mos === 1 ? " mo" : " mos");
}

/* Light-theme colour helpers */
function presPctClass(p) { return p >= 100 ? "pct-green" : p >= 75 ? "pct-amber" : "pct-red"; }
function presPctBg(p)    { return p >= 100 ? "#15803d"   : p >= 75 ? "#b45309"   : "#b91c1c"; }
function presPctColor(p) { return p >= 100 ? "#15803d"   : p >= 75 ? "#b45309"   : "#b91c1c"; }

/* ══════════════════════════════════════════════════════════
   RD INFLOW YTD — fetched live from Google Sheets CSV
   CSV columns: Sl.No | Staff Members | Company | Branch |
                Total inflow | Total Count | Emp Code
   Matching priority:
     1. Emp Code (clubs all rows with same code)
     2. Name + Branch fallback (when no code match)
   ══════════════════════════════════════════════════════════ */

const INFLOW_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTxcZ5BVpz-jvCQze4msaEqv1uSUTS-Z-mulCPYUU9xvh0_8R4aDoMmOIMclJQbIeeVWAtA9qkyJ8Vv/pub?gid=2022218927&single=true&output=csv";

let presInflowMap = null;
let presInflowLoading = false;

function presNorm(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function presParseInflowCSV(text) {
  const map = {};
  const nameMap = {};
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  let cols = { slno:0, name:1, company:2, branch:3, amount:4, count:5, empCode:6 };

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const row = lines[i].split(",").map(c => c.replace(/^"|"$/g,"").trim());
    const lower = row.map(c => c.toLowerCase());
    if (lower.some(c => c.includes("emp") || c.includes("staff"))) {
      headerIdx = i;
      lower.forEach((c, j) => {
        if (c.includes("staff") || c.includes("name"))    cols.name    = j;
        if (c.includes("branch"))                          cols.branch  = j;
        if (c.includes("inflow") || c.includes("amount")) cols.amount  = j;
        if (c.includes("count"))                           cols.count   = j;
        if (c.includes("emp"))                             cols.empCode = j;
      });
      break;
    }
  }

  const dataStart = headerIdx >= 0 ? headerIdx + 1 : 1;
  for (let i = dataStart; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const row = [];
    let inQ = false, cur = "";
    for (let ci = 0; ci < raw.length; ci++) {
      const ch = raw[ci];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { row.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    row.push(cur.trim());

    const name    = presNorm(row[cols.name]);
    const branch  = presNorm(row[cols.branch]);
    const rawAmt  = String(row[cols.amount] || "").replace(/[,₹\s]/g, "");
    const amount  = parseFloat(rawAmt) || 0;
    const count   = parseInt(row[cols.count]) || 0;
    const empCode = presNorm(row[cols.empCode]);

    if (!name && !empCode) continue;

    if (empCode) {
      if (!map[empCode]) map[empCode] = { amount: 0, count: 0 };
      map[empCode].amount += amount;
      map[empCode].count  += count;
    }
    const nbKey = name + "||" + branch;
    if (!nameMap[nbKey]) nameMap[nbKey] = { amount: 0, count: 0 };
    nameMap[nbKey].amount += amount;
    nameMap[nbKey].count  += count;
  }
  return { byCode: map, byNameBranch: nameMap };
}

function presFetchInflow(callback) {
  if (presInflowMap) { callback(presInflowMap); return; }
  if (presInflowLoading) {
    const iv = setInterval(() => {
      if (presInflowMap) { clearInterval(iv); callback(presInflowMap); }
    }, 200);
    return;
  }
  presInflowLoading = true;
  fetch(INFLOW_CSV_URL)
    .then(r => r.text())
    .then(text => {
      presInflowMap = presParseInflowCSV(text);
      presInflowLoading = false;
      callback(presInflowMap);
    })
    .catch(() => {
      presInflowMap = { byCode: {}, byNameBranch: {} };
      presInflowLoading = false;
      callback(presInflowMap);
    });
}

function presGetStaffInflow(staffObj, branchName, inflowMap) {
  if (!inflowMap) return null;
  const code = presNorm(staffObj.empCode || staffObj.emp_code || staffObj.employeeCode || "");
  if (code && inflowMap.byCode[code]) return inflowMap.byCode[code];
  const nbKey = presNorm(staffObj.name) + "||" + presNorm(branchName);
  return inflowMap.byNameBranch[nbKey] || null;
}

function presGetBranchInflow(staffList, branchName, inflowMap) {
  let amount = 0, count = 0;
  staffList.forEach(s => {
    const inf = presGetStaffInflow(s, branchName, inflowMap);
    if (inf) { amount += inf.amount; count += inf.count; }
  });
  return amount > 0 ? { amount, count } : null;
}

/* Patch presRenderProductGrid to inject inflow */
const _origRenderProductGrid = presRenderProductGrid;
presRenderProductGrid = function() {
  presFetchInflow(inflowMap => {
    const d = presState.dash;
    if (!d) return;
    const { agg, aggYtd, extra, extraYtd, periodLabel, ytdLabel } = d;

    const pillsEl = document.getElementById("dashLegendPills");
    if (pillsEl) pillsEl.innerHTML = `
      <span class="dual-legend-pill period-pill">📅 ${presEsc(periodLabel)}</span>
      <span class="dual-legend-pill ytd-pill">📈 ${presEsc(ytdLabel)}</span>`;

    document.getElementById("dashProducts").innerHTML = `
      <div class="pres-prod-grid">
      ${Object.keys(agg.totals).map(k => {
        const t    = agg.totals[k];
        const tYtd = aggYtd.totals[k] || { ach: 0, tgt: 0 };
        const out  = extra.outstanding[k] || null;
        const due  = (k === "RD" && extra.rdDueAmount) ? { amount: extra.rdDueAmount, count: extra.rdDueCount } : null;
        const inflow = (k === "RD") ? presGetBranchInflow(agg.staff, presState.branchName, inflowMap) : null;
        return presDualProdCardHTML(k, t.ach, t.tgt, tYtd.ach, tYtd.tgt, out, due, inflow, periodLabel, ytdLabel);
      }).join("")}
      </div>`;
  });
};

/* Patch presRenderStaffCards to inject inflow */
const _origRenderStaffCards = presRenderStaffCards;
presRenderStaffCards = function() {
  _origRenderStaffCards();
  presFetchInflow(inflowMap => {
    const b = allData.find(x => x.branchName === presState.branchName);
    const s = (b && b.staff || []).find(x => x.name === presState.staffName);
    if (!s) return;

    const periodMonths = [...presState.months].sort((a,b2) => MONTHS.indexOf(a)-MONTHS.indexOf(b2));
    const lastMonth    = periodMonths[periodMonths.length - 1];
    const ytdMonths    = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);
    const periodLabel  = presPeriodLabel(periodMonths);
    const ytdLabel     = presYtdLabel(lastMonth);
    const staffInflow  = presGetStaffInflow(s, presState.branchName, inflowMap);

    document.getElementById("staffCards").innerHTML = `
      <div class="pres-prod-grid">
      ${Object.keys(s.metrics).map(k => {
        const metric  = s.metrics[k];
        const rPeriod = calc(metric, periodMonths, s.doj);
        const rYtd    = calc(metric, ytdMonths,    s.doj);
        const out = (OUT_CFG[k] && metric.outstanding) ? { amount: metric.outstanding, count: metric.outstandingCount } : null;
        const due = (k === "RD" && metric.dueAmount)   ? { amount: metric.dueAmount,   count: metric.dueCount }         : null;
        const inflow = (k === "RD") ? staffInflow : null;
        return presDualProdCardHTML(k, rPeriod.ach, rPeriod.tgt, rYtd.ach, rYtd.tgt, out, due, inflow, periodLabel, ytdLabel);
      }).join("") || `<div class="pres-empty">No product data.</div>`}
      </div>`;
    presRenderStaffSwitchStrip(b);
  });
};
