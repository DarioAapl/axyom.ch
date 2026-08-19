/* ─────────────────────────────────────────────────────────────────────────
   Dashboard shell: view switching, filtering, and the derived Overview.

   Loaded AFTER admin-dashboard.js and deliberately additive — the loaders,
   renderers and every inline onclick handler in that file are untouched. This
   only decides which view is visible and which rows are hidden.
   ───────────────────────────────────────────────────────────────────────── */

const VIEW_TITLES = {
  overview: "Overview",
  websites: "Websites",
  direct:   "Direct customers",
  shopify:  "Shopify merchants",
  keys:     "API keys",
  spend:    "Model spend",
};

let currentView = "overview";
let websiteFilter = "all";

function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  const el = document.getElementById("view-" + view);
  if (el) el.hidden = false;

  document.querySelectorAll("[data-view]").forEach(b =>
    b.classList.toggle("on", b.dataset.view === view));
  document.getElementById("viewTitle").textContent = VIEW_TITLES[view] || "Dashboard";

  // The filter box is per-view; carrying a stale term across views hides rows
  // for reasons the user can no longer see.
  const s = document.getElementById("globalSearch");
  if (s) { s.value = ""; applySearch(""); }

  if (view === "spend") loadSpend();

  try { localStorage.setItem("admin_view", view); } catch (e) {}
}

function applySearch(term) {
  const q = (term || "").trim().toLowerCase();
  const scope = document.getElementById("view-" + currentView);
  if (!scope) return;
  scope.querySelectorAll("tbody tr[data-search]").forEach(tr => {
    const hit = !q || (tr.dataset.search || "").toLowerCase().includes(q);
    tr.classList.toggle("filtered-out", !hit);
    // A website's detail row must follow its parent, or an expanded panel is
    // left orphaned when its row is filtered away.
    const next = tr.nextElementSibling;
    if (next && next.classList.contains("detail-row")) {
      next.classList.toggle("filtered-out", !hit);
    }
  });
}

function applyWebsiteFilter(kind) {
  websiteFilter = kind;
  document.querySelectorAll("[data-wfilter]").forEach(b =>
    b.classList.toggle("on", b.dataset.wfilter === kind));

  document.querySelectorAll("#websitesTable tr[data-source]").forEach(tr => {
    let show = true;
    if (kind === "direct")    show = tr.dataset.source !== "shopify";
    if (kind === "shopify")   show = tr.dataset.source === "shopify";
    if (kind === "untrained") show = tr.dataset.trained === "0";
    tr.classList.toggle("filtered-out", !show);
    const next = tr.nextElementSibling;
    if (next && next.classList.contains("detail-row")) {
      next.classList.toggle("filtered-out", !show);
    }
  });
}

/* Counts and the attention list are derived from what the loaders already
   fetched — no extra requests. Called after each refresh. */
function refreshDerived() {
  const customers = window._customerRows || [];
  const direct  = customers.filter(c => c.source !== "shopify").length;
  const shopify = customers.filter(c => c.source === "shopify").length;

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("navDirect", direct);   set("statDirect", direct);
  set("navShopify", shopify); set("statShopify", shopify);

  const rows = [...document.querySelectorAll("#websitesTable tr[data-source]")];
  set("navWebsites", rows.length);
  const trained = rows.filter(r => r.dataset.trained === "1").length;
  set("statTrained", trained);
  set("statUntrained", rows.length - trained);
  set("navKeys", document.querySelectorAll("#keysTable tr:not(.key-domains-row)").length);

  // Anything registered but not yet answering customers. This is the list that
  // used to require scrolling the whole websites table to assemble by eye.
  const att = document.getElementById("attentionTable");
  if (!att) return;
  const needs = rows.filter(r => r.dataset.trained === "0");
  att.innerHTML = needs.length
    ? needs.map(r => {
        const id = r.id.replace("row-", "");
        const dom = (r.dataset.search || "").split(" ")[0];
        const src = r.dataset.source === "shopify" ? "shopify" : "direct";
        return `<tr>
          <td>${escapeHtml(id)}</td>
          <td>${escapeHtml(dom)}</td>
          <td><span class="srcbadge ${src}">${src === "shopify" ? "Shopify" : "Direct"}</span></td>
          <td><span style="color:var(--text-muted)">Not trained — the assistant cannot answer yet</span></td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="4" class="empty-state">Everything is trained and answering.</td></tr>`;
}



/* ── Spend view ───────────────────────────────────────────────────────────
   Charts are plain divs rather than a charting library: nothing extra to load
   on an authenticated page, and no dependency to keep patched.
   ──────────────────────────────────────────────────────────────────────── */
let spendRange = 30;

const usd = n => "$" + Number(n || 0).toFixed(2);
const compact = n => {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
};

async function loadSpend() {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  try {
    const r = await fetch(`${API}/admin/usage?days=${spendRange}`, { headers: authHeaders() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();

    set("spendMTD", usd(d.month_to_date.cost_usd));
    set("spendProjected", usd(d.projected_month_usd));
    set("spendWindow", usd(d.total.cost_usd));
    set("spendTokens", compact(d.total.tokens));

    // Budget bar. Colour shifts before the ceiling, not at it — the point is to
    // notice the trend while there is still time to act on it.
    const pct = Math.min(d.budget_used_pct || 0, 100);
    set("budgetLabel", usd(d.month_to_date.cost_usd) + " of " + usd(d.budget_usd));
    set("budgetPct", (d.budget_used_pct || 0).toFixed(1) + "%");
    const fill = document.getElementById("budgetFill");
    if (fill) {
      fill.style.width = pct + "%";
      fill.className = "budget-fill" + (d.budget_used_pct >= 100 ? " over"
                                      : d.budget_used_pct >= 75 ? " warn" : "");
    }
    set("budgetNote", d.projected_month_usd > d.budget_usd
      ? `At the current rate this month lands near ${usd(d.projected_month_usd)} — over budget.`
      : `At the current rate this month lands near ${usd(d.projected_month_usd)}.`);

    // Daily chart
    const chart = document.getElementById("spendChart");
    if (chart) {
      if (!d.daily.length) {
        chart.className = "chart-empty";
        chart.textContent = "No usage recorded yet in this window.";
      } else {
        chart.className = "chart";
        const max = Math.max(...d.daily.map(x => x.cost_usd), 0.0001);
        chart.innerHTML = d.daily.map(x =>
          `<div class="bar" style="height:${Math.max((x.cost_usd / max) * 100, 2)}%"
                data-tip="${escapeHtml(x.day)} · ${usd(x.cost_usd)} · ${compact(x.tokens)} tok"></div>`
        ).join("");
      }
    }

    const brk = rows => rows.length
      ? rows.map(x => `<div class="brk"><span class="nm">${escapeHtml(x.label)}</span>
           <span class="vl">${usd(x.cost_usd)}</span></div>`).join("")
      : '<div class="brk"><span class="nm">Nothing recorded yet</span></div>';

    document.getElementById("spendByKind").innerHTML =
      brk(d.by_kind.map(k => ({ label: k.kind, cost_usd: k.cost_usd })));
    document.getElementById("spendByModel").innerHTML =
      brk(d.by_model.map(m => ({ label: m.model, cost_usd: m.cost_usd })));

    // Cost per website — resolve ids to domains from the already-loaded table.
    const domains = {};
    document.querySelectorAll("#websitesTable tr[data-source]").forEach(tr => {
      domains[tr.id.replace("row-", "")] = (tr.dataset.search || "").split(" ")[0];
    });
    const sites = document.getElementById("spendSites");
    sites.innerHTML = d.top_websites.length
      ? d.top_websites.map(w => `<tr>
          <td>${escapeHtml(domains[w.website_id] || ("#" + w.website_id))}</td>
          <td>${compact(w.tokens)}</td><td>${usd(w.cost_usd)}</td></tr>`).join("")
      : `<tr><td colspan="3" class="empty-state">No attributed usage yet.</td></tr>`;

    document.getElementById("spendNote").textContent = d.prices_note +
      " Only calls made since spend tracking was added are included.";
  } catch (e) {
    set("budgetNote", "Could not load usage: " + e.message);
  }
}

/* Create-key moved out of a permanent card into a modal: it is an occasional
   action that was taking up the top of every page load. The hidden inputs it
   writes to still exist, so createKey() itself is unchanged. */
async function openCreateKey() {
  const picked = await openModal("🔑 New API key", `
    <p style="color:var(--text-muted);margin:0 0 14px;font-size:13.5px">
      Creates a customer if the email is new, and locks the key to that domain.</p>
    <div class="input-group" style="margin-bottom:10px">
      <label for="ck-email">Customer email</label>
      <input id="ck-email" type="email" placeholder="merchant@example.com">
    </div>
    <div class="input-group">
      <label for="ck-domain">Website domain</label>
      <input id="ck-domain" placeholder="example.com">
    </div>`, [
      { label: "Cancel", className: "btn-ghost" },
      { label: "Create key", className: "btn-primary" },
    ]);
  if (picked !== "Create key") return;

  // Hand the values to the existing createKey(), which reads these ids.
  document.getElementById("newEmail").value  = (document.getElementById("ck-email")?.value || "").trim();
  document.getElementById("newDomain").value = (document.getElementById("ck-domain")?.value || "").trim();
  if (!document.getElementById("newDomain").value) return showAlert("Domain is required");
  await createKey();
  refreshDerived();
}

async function refreshAll() {
  const b = document.getElementById("refreshBtn");
  if (b) { b.disabled = true; b.textContent = "Refreshing…"; }
  try {
    // Order matters: loadWebsites reads customerSubMap, which loadCustomers
    // fills, and the widget panel reads domainKeyMap, which loadKeys fills.
    await loadCustomers();
    await loadKeys();
    await loadWebsites();
    refreshDerived();
    applyWebsiteFilter(websiteFilter);
    if (currentView === "spend") await loadSpend();
  } finally {
    if (b) { b.disabled = false; b.textContent = "Refresh"; }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-view]").forEach(b =>
    b.onclick = () => switchView(b.dataset.view));
  document.querySelectorAll("[data-wfilter]").forEach(b =>
    b.onclick = () => applyWebsiteFilter(b.dataset.wfilter));

  document.querySelectorAll("[data-spend-range]").forEach(b =>
    b.onclick = () => {
      spendRange = parseInt(b.dataset.spendRange, 10);
      document.querySelectorAll("[data-spend-range]").forEach(x =>
        x.classList.toggle("on", x === b));
      loadSpend();
    });

  const s = document.getElementById("globalSearch");
  if (s) s.addEventListener("input", e => applySearch(e.target.value));

  try {
    const saved = localStorage.getItem("admin_view");
    if (saved && VIEW_TITLES[saved]) switchView(saved);
  } catch (e) {}

  // admin-dashboard.js loads its three tables on boot; derive from them once
  // that has settled, then again shortly after in case a slow table is still
  // rendering.
  setTimeout(refreshDerived, 1200);
  setTimeout(refreshDerived, 3500);
});
