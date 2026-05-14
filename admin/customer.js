const API = "https://api.axyom.ch";
const ADMIN_KEY = "admin_token";
const ADMIN_LOGIN_URL = "admin.html";
const CUSTOMER_ID = new URLSearchParams(location.search).get("id");

let CURRENT = null;  // most recent customer detail snapshot

function authHeaders() {
  const t = localStorage.getItem(ADMIN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function logout() {
  localStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem("admin_email");
  location.href = ADMIN_LOGIN_URL;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

// ── Boot ──────────────────────────────────────────────────────────────────────

if (!CUSTOMER_ID) {
  document.getElementById("custHeader").innerHTML =
    '<div class="alert alert-error">No customer id in URL.</div>';
} else if (!localStorage.getItem(ADMIN_KEY)) {
  location.href = ADMIN_LOGIN_URL;
} else {
  loadCustomer();
}

async function loadCustomer() {
  try {
    const res = await fetch(`${API}/admin/customers/${CUSTOMER_ID}`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) throw new Error((await res.json()).detail || "Failed to load");
    CURRENT = await res.json();
    render();
  } catch (e) {
    document.getElementById("custHeader").innerHTML =
      `<div class="alert alert-error">${escapeHtml(e.message || "Failed to load customer")}</div>`;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const c = CURRENT.customer;
  const sub = CURRENT.subscription;

  const verifiedBadge = c.email_verified
    ? '<span class="pill green">✓ Email verified</span>'
    : '<span class="pill gray">Email unverified</span>';
  const activeBadge = c.is_active
    ? '<span class="pill green">Active account</span>'
    : '<span class="pill red">Disabled</span>';
  const planBadge = _planBadge(sub);

  document.getElementById("custHeader").innerHTML = `
    <div class="cust-header-top">
      <h1 class="cust-email">${escapeHtml(c.email)}</h1>
      <div class="cust-badges">${verifiedBadge} ${activeBadge} ${planBadge}</div>
    </div>
    <div class="cust-header-meta">
      <span><strong>ID:</strong> ${c.id}</span>
      <span><strong>Joined:</strong> ${fmtDate(c.created_at)}</span>
      <span><strong>Last login:</strong> ${c.last_login_at ? fmtDateTime(c.last_login_at) : 'never'}</span>
    </div>`;

  document.getElementById("tabRow").style.display = "";
  document.getElementById("tabContent").style.display = "";

  renderAccountInfo(c);
  renderWebsites(CURRENT.websites);
  renderSubscription(sub);
}

function _planBadge(sub) {
  if (!sub || !sub.plan) return '<span class="pill gray">⚪ NO PLAN</span>';
  const label = ({ starter: "Starter", pro: "Pro", business: "Business" }[sub.plan]) || escapeHtml(sub.plan);
  const deactivated = sub.active === false || ["cancelled", "canceled"].includes(sub.status);
  if (deactivated) return `<span class="pill red">🔴 ${label} · DEACTIVATED</span>`;
  const isActive = sub.active !== false && ["active", "trialing"].includes(sub.status);
  if (isActive) {
    return sub.paid
      ? `<span class="pill green">🟢 ${label} · ✅ PAID</span>`
      : `<span class="pill yellow">🟢 ${label} · ❌ UNPAID</span>`;
  }
  return `<span class="pill orange">⚠ ${label} · ${escapeHtml(sub.status || "unknown")}</span>`;
}

function renderAccountInfo(c) {
  document.getElementById("accountInfo").innerHTML = `
    <div class="info-cell"><span class="info-label">Email</span><span class="info-value">${escapeHtml(c.email)}</span></div>
    <div class="info-cell"><span class="info-label">Customer ID</span><span class="info-value">${c.id}</span></div>
    <div class="info-cell"><span class="info-label">Email verified</span><span class="info-value">${c.email_verified ? '✓ Yes' : '✗ No'}</span></div>
    <div class="info-cell"><span class="info-label">Account status</span><span class="info-value">${c.is_active ? 'Active' : 'Disabled'}</span></div>
    <div class="info-cell"><span class="info-label">Created</span><span class="info-value">${fmtDateTime(c.created_at)}</span></div>
    <div class="info-cell"><span class="info-label">Last login</span><span class="info-value">${c.last_login_at ? fmtDateTime(c.last_login_at) : '—'}</span></div>
    <div class="info-cell"><span class="info-label">Stripe customer ID</span><span class="info-value mono">${c.stripe_customer_id || '—'}</span></div>`;
}

function renderWebsites(websites) {
  const body = document.getElementById("websitesBody");
  if (!websites.length) {
    body.innerHTML = '<tr><td colspan="5" class="placeholder">No websites yet.</td></tr>';
    return;
  }
  body.innerHTML = websites.map(w => `
    <tr>
      <td>${w.id}</td>
      <td>${escapeHtml(w.domain)}</td>
      <td>${w.is_trained ? '<span class="pill green">✓</span>' : '<span class="pill gray">✗</span>'}</td>
      <td>${w.last_trained_at ? fmtDateTime(w.last_trained_at) : '—'}</td>
      <td>${w.is_active ? '<span class="pill green">Active</span>' : '<span class="pill red">Inactive</span>'}</td>
    </tr>`).join('');
}

function renderSubscription(sub) {
  const panel = document.getElementById("subscriptionPanel");
  if (!sub) {
    panel.innerHTML = `
      <div class="placeholder">No active subscription.</div>
      <div class="action-row">
        <button class="btn-primary" onclick="openActivateModal()">💳 Activate Subscription</button>
      </div>`;
    return;
  }
  const isActive = sub.active !== false && ["active", "trialing"].includes(sub.status);
  panel.innerHTML = `
    <div class="info-grid">
      <div class="info-cell"><span class="info-label">Plan</span><span class="info-value">${escapeHtml(sub.plan)}</span></div>
      <div class="info-cell"><span class="info-label">Status</span><span class="info-value">${escapeHtml(sub.status)}</span></div>
      <div class="info-cell"><span class="info-label">Active flag</span><span class="info-value">${sub.active ? '✓ Yes' : '✗ No'}</span></div>
      <div class="info-cell"><span class="info-label">Paid</span><span class="info-value">${sub.paid ? '✓ Yes' : '✗ No (trust basis)'}</span></div>
      <div class="info-cell"><span class="info-label">Activated</span><span class="info-value">${fmtDateTime(sub.activated_at)}</span></div>
      <div class="info-cell"><span class="info-label">Last paid</span><span class="info-value">${fmtDateTime(sub.last_paid_at)}</span></div>
      <div class="info-cell"><span class="info-label">Period end</span><span class="info-value">${fmtDateTime(sub.current_period_end)}</span></div>
      <div class="info-cell"><span class="info-label">Usage</span><span class="info-value">${sub.conversations_used} / ${sub.conversation_limit || '∞'} conv this period</span></div>
    </div>
    <div class="action-row">
      ${isActive
        ? `<button class="btn-ghost" style="color:var(--red)" onclick="deactivateThisSub(${sub.id})">✕ Deactivate Subscription</button>`
        : `<button class="btn-primary" onclick="openActivateModal()">💳 Activate Subscription</button>`}
    </div>`;
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchCustTab(name, el) {
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function sendPasswordReset() {
  const c = CURRENT.customer;
  if (!confirm(`Send password reset email to ${c.email}? This will invalidate any previous reset link.`)) return;

  const status = document.getElementById("actionStatus");
  status.innerHTML = '<span class="loader-inline"></span> Sending…';

  try {
    const res = await fetch(`${API}/admin/customers/${c.id}/send-password-reset`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      status.innerHTML = `<span style="color:var(--red)">${escapeHtml(data.detail || "Failed")}</span>`;
      return;
    }
    status.innerHTML = `<span style="color:var(--green)">✓ Reset email sent. Link expires in 24h.</span>`;
  } catch (e) {
    status.innerHTML = `<span style="color:var(--red)">Network error</span>`;
  }
}

async function deleteThisCustomer() {
  const c = CURRENT.customer;
  if (!confirm(`Delete customer ${c.email}? This permanently removes all their websites, conversations, and data. This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API}/admin/customers/${c.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.detail || "Failed to delete customer");
      return;
    }
    location.href = "dashboard.html";
  } catch {
    alert("Network error");
  }
}

async function deactivateThisSub(subId) {
  const c = CURRENT.customer;
  if (!confirm(`Deactivate subscription for ${c.email}? They'll lose access to their plan features.`)) return;

  try {
    const res = await fetch(`${API}/admin/subscriptions/${subId}/deactivate`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.detail || "Failed to deactivate");
      return;
    }
    await loadCustomer();
  } catch {
    alert("Network error");
  }
}

// ── Activate Subscription modal (inlined; mirrors dashboard.js modal) ────────

function openActivateModal() {
  const c = CURRENT.customer;
  document.getElementById("modalTitle").textContent = "💳 Activate Subscription";
  document.getElementById("modalBody").innerHTML = `
    <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:20px">
      Activate a plan for <strong style="color:var(--text)">${escapeHtml(c.email)}</strong>.
      Plan becomes active immediately on a trust basis — customer pays via the Stripe link in their dashboard.
    </p>
    <p style="font-size:0.75rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Plan</p>
    <div class="plan-grid" style="margin-bottom:20px">
      <label class="plan-card">
        <input type="radio" name="subPlan" value="starter" checked>
        <div class="plan-card-inner">
          <div class="plan-card-name">Starter</div>
          <div class="plan-card-price">49 <span>/mo</span></div>
        </div>
      </label>
      <label class="plan-card">
        <input type="radio" name="subPlan" value="pro">
        <div class="plan-card-inner">
          <div class="plan-card-name">Pro</div>
          <div class="plan-card-price">149 <span>/mo</span></div>
        </div>
      </label>
      <label class="plan-card">
        <input type="radio" name="subPlan" value="business">
        <div class="plan-card-inner">
          <div class="plan-card-name">Business</div>
          <div class="plan-card-price">349 <span>/mo</span></div>
        </div>
      </label>
    </div>
    <p style="font-size:0.75rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Currency</p>
    <div class="currency-toggle" style="margin-bottom:24px">
      <label class="currency-btn"><input type="radio" name="subCurrency" value="chf" checked><span>CHF 🇨🇭</span></label>
      <label class="currency-btn"><input type="radio" name="subCurrency" value="eur"><span>EUR 🇪🇺</span></label>
    </div>
    <button class="btn-primary" style="width:100%;padding:14px" id="activateBtn" onclick="doActivate(this)">
      ✅ Activate Subscription
    </button>
    <div id="activateResult" style="margin-top:14px"></div>`;
  document.getElementById("modalFooter").innerHTML =
    `<button class="btn-ghost" onclick="closeModal()">Close</button>`;
  document.getElementById("modalOverlay").classList.add("active");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("active");
}

async function doActivate(btn) {
  const c = CURRENT.customer;
  const plan     = document.querySelector('input[name="subPlan"]:checked')?.value;
  const currency = document.querySelector('input[name="subCurrency"]:checked')?.value;
  if (!plan || !currency) return;

  btn.disabled = true;
  btn.textContent = "Activating…";

  try {
    const res = await fetch(`${API}/admin/customers/${c.id}/activate-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ plan, currency }),
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById("activateResult").innerHTML =
        `<p style="color:var(--red);font-size:0.82rem">${escapeHtml(data.detail || "Failed")}</p>`;
      return;
    }
    document.getElementById("activateResult").innerHTML = `
      <div class="alert-success">✅ Activated. Plan: <strong>${escapeHtml(data.plan)}</strong>.</div>`;
    setTimeout(async () => { closeModal(); await loadCustomer(); }, 1200);
  } catch {
    document.getElementById("activateResult").innerHTML =
      `<p style="color:var(--red);font-size:0.82rem">Network error</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "✅ Activate Subscription";
  }
}
