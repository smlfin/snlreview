/* ══════════════════════════════════════════════════════════
   PRESENTATION MODE
   New, standalone file. Does NOT modify script.js — only reads
   its already-loaded globals (allData, MONTHS, PLABEL, PROD_COLOR,
   getEffectiveMonths, calc, fmt, fmtFull, initials) once load()
   (inside script.js) has finished populating allData.
   ══════════════════════════════════════════════════════════ */

const presState = {
  screen: "branch",      // branch | month | dash | staff
  branchName: null,
  months: new Set(),     // subset of MONTHS
  staffName: null,
  branchMode: "period"   // period | ytd — toggles the Product Performance cards
};

/* ── wait for script.js's own load() to finish populating allData ── */
(function waitForData() {
  const iv = setInterval(() => {
    if (typeof allData !== "undefined" && Array.isArray(allData) && allData.length) {
      clearInterval(iv);
      presInit();
    }
  }, 150);
})();

function presInit() {
  document.getElementById("presCrumb").textContent = SESSION_NAME + " · " + (SESSION_ROLE === "admin" ? "All Branches" : SESSION_BRANCH);

  // Non-admin sessions only ever have their own branch in allData (already
  // filtered by script.js's load()) — skip straight past branch-picking.
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
  if (presState.months.size) parts.push([...presState.months].sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b)).join("+"));
  if (presState.staffName) parts.push(presState.staffName);
  document.getElementById("presCrumb").textContent = parts.join(" · ");
}

function presGoBack() {
  if (presState.screen === "staff") { presShowScreen("dash"); return; }
  if (presState.screen === "dash")  { presShowScreen("month"); return; }
  if (presState.screen === "month") {
    if (SESSION_ROLE !== "admin") return; // no branch step to go back to
    presState.branchName = null;
    presShowScreen("branch");
    return;
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
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
      <div class="t-sub">${(b.staff||[]).filter(s=>s.name.toUpperCase()!=="TOTAL").length} staff</div>
    </div>`;
  }).join("");
  presShowScreen("branch");
}

// Event delegation — bound ONCE to the container, never to the tiles
// themselves, so re-rendering innerHTML never loses the listener and
// there's no inline-onclick string to accidentally break on quotes.
document.getElementById("branchGrid").addEventListener("click", e => {
  const tile = e.target.closest(".pres-tile");
  if (!tile) return;
  const b = allData[Number(tile.dataset.branchIdx)];
  if (b) presSelectBranch(b.branchName);
});

function presEsc(s) {
  return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function presSelectBranch(name) {
  presState.branchName = name;
  presState.branchMode = "period"; // reset each time a new branch is opened
  if (!presState.months.size) presState.months = new Set([presCurrentMonth()]);
  presRenderMonthChips();
  presShowScreen("month");
}

/* ═══════════════ SCREEN 2 — MONTH PICKER ═══════════════ */
function presCurrentMonth() {
  const m = new Date().toLocaleString('en-US', { month: 'short' });
  return MONTHS.includes(m) ? m : MONTHS[MONTHS.length - 1];
}
function presCurrentOrDefaultMonths() { return presState.months.size ? [...presState.months] : [presCurrentMonth()]; }

function presRenderMonthChips() {
  document.getElementById("monthTitle").textContent = "Select Month — " + presState.branchName;
  const row = document.getElementById("monthChips");
  row.innerHTML = MONTHS.map(m =>
    `<span class="pres-chip ${presState.months.has(m)?"on":""}" onclick="presToggleMonth('${m}')">${m}</span>`
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

// Shared by both the branch Product Performance grid and the staff detail
// screen — same markup/classes so the two always look identical.
function presProdCardHTML(k, ach, tgt, outstanding, due) {
  const pct = tgt > 0 ? Math.round(ach / tgt * 100) : 100;
  const gap = ach - tgt;
  const color = PROD_COLOR[k] || "#2d6bff";
  const outRow = outstanding ? `<div class="pp-extra">📦 Outstanding: <b>${fmtFull(outstanding.amount,k)}</b>${outstanding.count?` <span class="pp-extra-n">(${outstanding.count} a/c)</span>`:""}</div>` : "";
  const dueRow = due ? `<div class="pp-extra pp-due">⏰ Due: <b>${fmtFull(due.amount,k)}</b>${due.count?` <span class="pp-extra-n">(${due.count} a/c)</span>`:""}</div>` : "";
  return `<div class="pres-prod-card">
    <div class="pp-head">
      <span class="pp-dot" style="background:${color}"></span>
      <span class="pp-label">${PLABEL[k]||k}</span>
      <span class="pp-pct-badge" style="color:${presPctColor(pct)}">${pct}%</span>
    </div>
    <div class="pp-track"><div class="pp-fill" style="width:${Math.min(pct,100)}%;background:${color}"></div></div>
    <div class="pp-figs">
      <div class="pp-fig"><span class="pp-fig-line"><span class="pp-fig-dot filled" style="background:${color}"></span>Achievement</span><b>${fmtFull(ach,k)}</b></div>
      <div class="pp-fig"><span class="pp-fig-line"><span class="pp-fig-dot hollow" style="border-color:${color}"></span>Target</span><b>${fmtFull(tgt,k)}</b></div>
    </div>
    <div class="pp-gap ${gap<0?'short':'excess'}">${gap<0?'Shortfall':'Excess'} <b>${gap>=0?'+':''}${fmtFull(gap,k)}</b></div>
    ${outRow}
    ${dueRow}
  </div>`;
}

/* ═══════════════ SCREEN 3 — BRANCH DASHBOARD ═══════════════ */
function presShowDashboard() {
  const b = allData.find(x => x.branchName === presState.branchName);
  if (!b) return;
  const months = [...presState.months].sort((a,b2)=>MONTHS.indexOf(a)-MONTHS.indexOf(b2));
  const lastMonth = months[months.length - 1];
  const ytdMonths = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);

  const agg    = presAggregateBranch(b, months);
  const aggYtd = presAggregateBranch(b, ytdMonths);
  const extra    = presAggregateExtra(agg.staff);
  const extraYtd = presAggregateExtra(aggYtd.staff);

  // stashed so presRenderProductGrid()/the period-YTD toggle can re-render
  // the Product Performance cards without recomputing everything above.
  presState.dash = { agg, aggYtd, extra, extraYtd, lastMonth, months };

  document.getElementById("dashTitle").textContent = "🏢 " + b.branchName + " — " + months.join("+");

  document.getElementById("branchModeToggle").innerHTML = `
    <span class="pres-chip ${presState.branchMode!=="ytd"?"on":""}" data-branch-mode="period">This Period</span>
    <span class="pres-chip ${presState.branchMode==="ytd"?"on":""}" data-branch-mode="ytd">YTD (Apr–${lastMonth})</span>`;

  presRenderProductGrid();

  document.getElementById("dashStaffGrid").innerHTML = agg.staff.map((s, i) => {
    const spct = presStaffOverallPct(s, months);
    return `<div class="pres-staff-chip" data-staff-idx="${i}">
      <span class="c-ring" style="background:${presPctBg(spct)}">${spct}%</span>
      <span class="c-name">${presEsc(s.name)}</span>
    </div>`;
  }).join("");
  presState.currentStaffList = agg.staff; // for the delegated click handler below

  presState.staffName = null;
  presShowScreen("dash");
}

function presSetBranchMode(mode) {
  presState.branchMode = mode;
  document.querySelectorAll('#branchModeToggle [data-branch-mode]').forEach(chip => {
    chip.classList.toggle("on", chip.dataset.branchMode === mode);
  });
  presRenderProductGrid();
}

function presRenderProductGrid() {
  const d = presState.dash;
  if (!d) return;
  const isYtd = presState.branchMode === "ytd";
  const totals = isYtd ? d.aggYtd.totals : d.agg.totals;
  const extra  = isYtd ? d.extraYtd : d.extra;

  document.getElementById("dashProducts").innerHTML = `
    <div class="pres-legend">
      <span><span class="leg-dot filled"></span> Achievement</span>
      <span><span class="leg-dot hollow"></span> Target</span>
    </div>
    <div class="pres-prod-grid">
    ${Object.keys(totals).map(k => {
      const t = totals[k];
      const out = extra.outstanding[k] || null;
      const due = (k === "RD" && extra.rdDueAmount) ? { amount: extra.rdDueAmount, count: extra.rdDueCount } : null;
      return presProdCardHTML(k, t.ach, t.tgt, out, due);
    }).join("")}
    </div>`;
}

document.getElementById("branchModeToggle").addEventListener("click", e => {
  const chip = e.target.closest("[data-branch-mode]");
  if (chip) presSetBranchMode(chip.dataset.branchMode);
});

document.getElementById("dashStaffGrid").addEventListener("click", e => {
  const tile = e.target.closest(".pres-staff-chip");
  if (!tile) return;
  const list = presState.currentStaffList || [];
  const s = list[Number(tile.dataset.staffIdx)];
  if (s) presSelectStaff(s.name);
});

/* ═══════════════ SCREEN 4 — STAFF DETAIL ═══════════════ */
function presSelectStaff(name) {
  presState.staffName = name;
  presState.staffMode = "period"; // reset each time a new staff is opened
  presRenderStaffCards();
  presShowScreen("staff");
}

function presSetStaffMode(mode) {
  presState.staffMode = mode;
  presRenderStaffCards();
}

function presRenderStaffCards() {
  const b = allData.find(x => x.branchName === presState.branchName);
  const s = (b.staff || []).find(x => x.name === presState.staffName);
  if (!s) return;

  const periodMonths = [...presState.months].sort((a,b2)=>MONTHS.indexOf(a)-MONTHS.indexOf(b2));
  const lastMonth    = periodMonths[periodMonths.length - 1];
  const ytdMonths    = MONTHS.slice(0, MONTHS.indexOf(lastMonth) + 1);
  const isYtd        = presState.staffMode === "ytd";
  const months       = isYtd ? ytdMonths : periodMonths;
  const periodLabel  = isYtd ? ("Apr–" + lastMonth + " (YTD)") : periodMonths.join("+");

  const svc = presServiceStr(s.doj);
  document.getElementById("staffAvatar").textContent = initials(s.name);
  document.getElementById("staffName").textContent = s.name;
  document.getElementById("staffSub").textContent =
    presState.branchName + " · " + periodLabel + (svc ? " · " + svc + " service" : "");

  document.getElementById("staffModeToggle").innerHTML = `
    <span class="pres-chip ${!isYtd?"on":""}" data-staff-mode="period">This Period</span>
    <span class="pres-chip ${isYtd?"on":""}" data-staff-mode="ytd">YTD (Apr–${lastMonth})</span>`;

  document.getElementById("staffCards").innerHTML = `
    <div class="pres-legend">
      <span><span class="leg-dot filled"></span> Achievement</span>
      <span><span class="leg-dot hollow"></span> Target</span>
    </div>
    <div class="pres-prod-grid">
    ${Object.keys(s.metrics).map(k => {
      const metric = s.metrics[k];
      const r = calc(metric, months, s.doj); // { ach, tgt, pct, gap } — reuses script.js's own calc()
      const out = (OUT_CFG[k] && metric.outstanding) ? { amount: metric.outstanding, count: metric.outstandingCount } : null;
      const due = (k === "RD" && metric.dueAmount) ? { amount: metric.dueAmount, count: metric.dueCount } : null;
      return presProdCardHTML(k, r.ach, r.tgt, out, due);
    }).join("") || `<div class="pres-empty">No product data for this staff member.</div>`}
    </div>`;
}

document.getElementById("staffModeToggle").addEventListener("click", e => {
  const chip = e.target.closest("[data-staff-mode]");
  if (chip) presSetStaffMode(chip.dataset.staffMode);
});

/* ═══════════════ SHARED AGGREGATION (mirrors renderSnap's math in script.js,
   so figures on this screen always match the main dashboard) ═══════════════ */
function presAggregateBranch(b, months) {
  const staff = (b.staff || []).filter(s => s.name.toUpperCase() !== "TOTAL");
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
    const blAnnual  = b.blBranchTotalTarget || 0;
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

function presAggregateExtra(staffList) {
  const outstanding = {}; // key -> { amount, count } — only for products OUT_CFG covers (Investment, GoldLoan, RD)
  let rdDueAmount = 0, rdDueCount = 0;
  staffList.forEach(s => {
    for (const k in s.metrics) {
      const m = s.metrics[k];
      if (OUT_CFG[k] && m.outstanding) {
        if (!outstanding[k]) outstanding[k] = { amount: 0, count: 0 };
        outstanding[k].amount += m.outstanding || 0;
        outstanding[k].count  += m.outstandingCount || 0;
      }
    }
    const rd = s.metrics["RD"];
    if (rd && rd.dueAmount) { rdDueAmount += rd.dueAmount; rdDueCount += rd.dueCount || 0; }
  });
  return { outstanding, rdDueAmount, rdDueCount };
}

// Service duration from DOJ ("DD-MMM-YYYY"), reuses script.js's own parseDOJDate.
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

function presPctColor(p) { return p >= 100 ? "#4ade80" : p >= 75 ? "#fbbf24" : "#f87171"; }
function presPctBg(p)    { return p >= 100 ? "#16a34a" : p >= 75 ? "#d97706" : "#dc2626"; }