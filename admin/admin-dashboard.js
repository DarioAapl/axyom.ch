const API = "https://api.axyom.ch";

// website_id is not returned by /admin/keys, so we key by domain
const domainKeyMap   = {};  // domain -> api_key string
const trainingPollers = {}; // website_id -> interval id
const widgetPositions = {}; // website_id -> 'right' | 'left'

/* ============================================================
   UTILITIES
============================================================ */
function normalizeDomain(input) {
  return input.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ============================================================
   MODAL  (new HTML: modalOverlay / modalTitle / modalBody / modalFooter)
============================================================ */
let _modalResolve = null;

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("active");
  if (_modalResolve) { _modalResolve(null); _modalResolve = null; }
}

function _modal({ title = "Notice", message, showCancel = false, showInput = false, inputPlaceholder = "", inputDefault = "", okLabel = "OK" }) {
  return new Promise(resolve => {
    _modalResolve = resolve;

    document.getElementById("modalTitle").textContent = title;

    document.getElementById("modalBody").innerHTML =
      `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>` +
      (showInput
        ? `<input type="text" id="modal-dyn-input" placeholder="${escapeHtml(inputPlaceholder)}" value="${escapeHtml(inputDefault)}" style="margin-top:14px" />`
        : "");

    document.getElementById("modalFooter").innerHTML =
      (showCancel ? `<button class="btn-ghost" onclick="closeModal()">Cancel</button>` : "") +
      `<button class="btn-primary" id="modal-dyn-ok">${escapeHtml(okLabel)}</button>`;

    if (showInput) {
      setTimeout(() => document.getElementById("modal-dyn-input")?.focus(), 50);
      const inp = document.getElementById("modal-dyn-input");
      if (inp) inp.onkeydown = e => {
        if (e.key === "Enter")  document.getElementById("modal-dyn-ok")?.click();
        if (e.key === "Escape") closeModal();
      };
    }

    document.getElementById("modal-dyn-ok").onclick = () => {
      const val = showInput ? (document.getElementById("modal-dyn-input")?.value ?? "") : true;
      document.getElementById("modalOverlay").classList.remove("active");
      _modalResolve = null;
      resolve(val);
    };

    document.getElementById("modalOverlay").classList.add("active");
  });
}

const showAlert   = msg => _modal({ title: "Notice",  message: msg });
const showConfirm = msg => _modal({ title: "Confirm", message: msg, showCancel: true, okLabel: "Confirm" });
const showPrompt  = (msg, placeholder = "", def = "") =>
  _modal({ title: "Input", message: msg, showCancel: true, showInput: true, inputPlaceholder: placeholder, inputDefault: def });

/* ============================================================
   DEPLOY INFO
============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const el = document.getElementById("deployInfo");
  if (!el) return;
  try {
    const res  = await fetch(`${API}/deploy-info`);
    const data = await res.json();
    // Server returns UTC without timezone suffix — append Z so Date parses correctly
    const dt = new Date((data.deploy_time || "").replace(" ", "T") + "Z");
    const formatted = dt.toLocaleString("de-CH", {
      timeZone: "Europe/Vaduz",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
    el.textContent = "Deploy: " + formatted;

    // Uptime stat
    const uptimeEl = document.getElementById("statUptime");
    if (uptimeEl) {
      const sec = Math.floor((Date.now() - dt.getTime()) / 1000);
      uptimeEl.textContent = sec < 3600
        ? Math.floor(sec / 60) + "m"
        : Math.floor(sec / 3600) + "h";
    }
  } catch {
    el.textContent = "Deploy: —";
  }
});

/* ============================================================
   AUTH
============================================================ */
function getToken() { return localStorage.getItem("admin_token"); }
function authHeaders() { return { Authorization: `Bearer ${getToken()}` }; }
function logout() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_email");
  window.location.href = "admin.html";
}

/* ============================================================
   INIT
============================================================ */
(async function init() {
  if (!getToken()) return logout();

  const test = await fetch(`${API}/admin/customers`, { headers: authHeaders() });
  if (!test.ok) return logout();

  const emailEl = document.getElementById("adminEmail");
  if (emailEl) emailEl.textContent = localStorage.getItem("admin_email");

  await loadCustomers();
  await loadKeys();
  await loadWebsites();
})();

/* ============================================================
   PROGRESS BAR
============================================================ */
const progressIntervals = {};

function progressBar(id) {
  return `
    <div id="progress-${id}" class="progress-container" style="display:none">
      <div class="progress-bar">
        <div id="progress-fill-${id}" class="progress-fill"></div>
      </div>
      <span id="progress-text-${id}" class="progress-text">0%</span>
    </div>
    <div id="progress-msg-${id}" class="progress-msg"></div>`;
}

function startProgress(id, msg = "") {
  const container = document.getElementById(`progress-${id}`);
  const fill      = document.getElementById(`progress-fill-${id}`);
  const text      = document.getElementById(`progress-text-${id}`);
  const msgEl     = document.getElementById(`progress-msg-${id}`);
  if (!container) return;

  container.style.display = "inline-flex";
  if (msgEl) msgEl.textContent = msg;
  let pct = 0;

  progressIntervals[id] = setInterval(() => {
    if (pct < 90) {
      pct += Math.random() * 5;
      pct = Math.min(pct, 90);
      if (fill) fill.style.width = pct + "%";
      if (text) text.textContent = Math.floor(pct) + "%";
    }
  }, 400);
}

function finishProgress(id) {
  if (progressIntervals[id]) { clearInterval(progressIntervals[id]); delete progressIntervals[id]; }
  const fill      = document.getElementById(`progress-fill-${id}`);
  const text      = document.getElementById(`progress-text-${id}`);
  const container = document.getElementById(`progress-${id}`);
  if (fill) fill.style.width = "100%";
  if (text) text.textContent = "100%";
  setTimeout(() => { if (container) container.style.display = "none"; }, 600);
}

/* ============================================================
   REAL TRAINING PROGRESS  (polling)
============================================================ */
function startProgressPolling(websiteId, jobId) {
  const container = document.getElementById(`progress-${websiteId}`);
  if (container) container.style.display = "inline-flex";

  if (trainingPollers[websiteId]) clearInterval(trainingPollers[websiteId]);

  trainingPollers[websiteId] = setInterval(async () => {
    try {
      const res  = await fetch(`${API}/admin/websites/${websiteId}/training-status`, { headers: authHeaders() });
      const data = await res.json();

      const fill  = document.getElementById(`progress-fill-${websiteId}`);
      const text  = document.getElementById(`progress-text-${websiteId}`);
      const msgEl = document.getElementById(`progress-msg-${websiteId}`);
      const cont  = document.getElementById(`progress-${websiteId}`);

      if (cont && cont.style.display === "none") cont.style.display = "inline-flex";
      if (fill)  fill.style.width  = data.progress + "%";
      if (text)  text.textContent  = data.progress + "%";
      if (msgEl) msgEl.textContent = data.message || "";

      if (data.status === "done") {
        clearInterval(trainingPollers[websiteId]);
        delete trainingPollers[websiteId];
        if (fill)  fill.style.width  = "100%";
        if (text)  text.textContent  = "100%";
        if (msgEl) msgEl.textContent = "Done!";
        setTimeout(async () => {
          if (cont) cont.style.display = "none";
          await loadWebsites();
        }, 1500);
      }

      if (data.status === "error") {
        clearInterval(trainingPollers[websiteId]);
        delete trainingPollers[websiteId];
        if (msgEl) {
          msgEl.textContent = "Error: " + (data.message || "Training failed");
          msgEl.style.color = "var(--red)";
        }
      }
    } catch { /* network blip — keep polling */ }
  }, 2000);
}

/* ============================================================
   CUSTOMERS
============================================================ */
async function loadCustomers() {
  const res  = await fetch(`${API}/admin/customers`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById("statCustomers").textContent = data.length;

  const tbody = document.getElementById("customersTable");
  tbody.innerHTML = "";
  data.forEach(c => {
    tbody.innerHTML += `
      <tr>
        <td>${c.id}</td>
        <td>${escapeHtml(c.email)}</td>
        <td><span class="pill ${c.is_active ? "green" : "gray"}">${c.is_active ? "Active" : "Disabled"}</span></td>
        <td>${fmtDate(c.created_at)}</td>
        <td>
          <button class="btn-danger btn-sm" onclick="deleteCustomer(${c.id})">Delete</button>
          ${progressBar("customer-" + c.id)}
        </td>
      </tr>`;
  });
}

async function deleteCustomer(id) {
  if (!await showConfirm("Delete this customer and ALL their websites?")) return;
  startProgress("customer-" + id);
  const res = await fetch(`${API}/admin/customers/${id}`, { method: "DELETE", headers: authHeaders() });
  finishProgress("customer-" + id);
  if (!res.ok) { await showAlert("Delete failed"); return; }
  await loadCustomers();
  await loadWebsites();
  await loadKeys();
}

/* ============================================================
   API KEYS
============================================================ */
async function loadKeys() {
  const res  = await fetch(`${API}/admin/keys`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById("statKeys").textContent = data.length;

  // Build domain → api_key map for widget config
  Object.keys(domainKeyMap).forEach(k => delete domainKeyMap[k]);
  data.forEach(k => { if (k.is_active) domainKeyMap[k.domain] = k.key; });

  const tbody = document.getElementById("keysTable");
  tbody.innerHTML = "";
  data.forEach(k => {
    tbody.innerHTML += `
      <tr>
        <td>${k.id}</td>
        <td class="mono">${escapeHtml(k.key)}</td>
        <td>${escapeHtml(k.domain)}</td>
        <td><span class="pill ${k.is_active ? "green" : "gray"}">${k.is_active ? "Active" : "Revoked"}</span></td>
        <td>${fmtDate(k.created_at)}</td>
        <td>
          <button class="btn-ghost btn-sm" onclick="copyEmbed('${escapeHtml(k.key)}')">📋 Copy embed</button>
        </td>
      </tr>`;
  });
}

function copyEmbed(apiKey) {
  const script = `<!-- AXYOM AI -->\n<script>\n  window.AXYOM_KEY = "${apiKey}";\n<\/script>\n<script src="https://api.axyom.ch/widget/axyom.js" async><\/script>`;
  navigator.clipboard.writeText(script)
    .then(() => showAlert("Embed script copied to clipboard."))
    .catch(() => showAlert("Copy failed — check clipboard permissions."));
}

/* ============================================================
   WEBSITES
============================================================ */
async function loadWebsites() {
  const res      = await fetch(`${API}/admin/websites`, { headers: authHeaders() });
  const websites = await res.json();
  const table    = document.getElementById("websitesTable");
  table.innerHTML = "";

  websites.forEach(w => {
    const analysis = w.analysis;

    // Analysis verdict badge
    let verdictBadge = `<span class="pill muted">Not analyzed</span>`;
    if (analysis) {
      const cls = { ok: "green", too_big: "red", too_small: "orange", error: "red" }[analysis.verdict] || "gray";
      verdictBadge = `<span class="pill ${cls}">${analysis.verdict.toUpperCase()}</span>`;
    }

    // Primary action
    let mainBtn = "";
    if (w.is_trained) {
      mainBtn = `
        <span class="pill green">Trained</span>
        <button class="btn-ghost btn-sm" onclick="trainWebsite(${w.id}, true)">Retrain</button>`;
    } else if (!analysis) {
      mainBtn = `<button class="btn-ghost btn-sm" onclick="analyzeWebsite(${w.id})">Analyze</button>`;
    } else if (analysis.verdict === "ok") {
      mainBtn = `<button class="btn-primary btn-sm" onclick="trainWebsite(${w.id})">Train</button>`;
    } else {
      mainBtn = `<button class="btn-ghost btn-sm" onclick="trainWebsite(${w.id}, true)">Force Train</button>`;
    }

    table.innerHTML += `
      <tr id="row-${w.id}">
        <td>${w.id}</td>
        <td>${escapeHtml(w.domain)}</td>
        <td>${verdictBadge}</td>
        <td>
          ${analysis
            ? `<span style="font-size:0.8rem;color:var(--text-muted)">${analysis.estimated_pages} pages · ${analysis.estimated_chunks} chunks</span>`
            : `<span style="color:var(--text-muted)">—</span>`}
        </td>
        <td>
          <div class="action-row">
            ${mainBtn}
            ${progressBar(w.id)}
          </div>
          <div class="action-secondary">
            <button class="btn-ghost btn-sm" onclick="inspectWebsite(${w.id})">Inspect</button>
            <button class="btn-ghost btn-sm" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'widget')">Widget</button>
            <button class="btn-ghost btn-sm" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'chats')">Chats</button>
            <button class="btn-ghost btn-sm" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'stats')">Stats</button>
            <button class="btn-danger btn-sm" onclick="deleteWebsite(${w.id})">Delete</button>
          </div>
        </td>
      </tr>
      <tr id="detail-${w.id}" class="detail-row" style="display:none">
        <td colspan="5" class="detail-cell" id="detail-cell-${w.id}"></td>
      </tr>`;
  });

  // Re-attach any active polling bars (table was re-rendered)
  Object.keys(trainingPollers).forEach(id => {
    const cont = document.getElementById(`progress-${id}`);
    if (cont) cont.style.display = "inline-flex";
  });
}

/* ============================================================
   DETAIL ROW TOGGLE  (widget / chats / stats)
============================================================ */
function toggleDetail(websiteId, domain, type) {
  const row  = document.getElementById(`detail-${websiteId}`);
  const cell = document.getElementById(`detail-cell-${websiteId}`);
  if (!row || !cell) return;

  // Same type already open → close
  if (row.dataset.activeType === type && row.style.display !== "none") {
    row.style.display = "none";
    row.dataset.activeType = "";
    return;
  }

  row.style.display = "";
  row.dataset.activeType = type;
  cell.innerHTML = `<span style="color:var(--text-muted);font-size:0.85rem">Loading…</span>`;

  if (type === "widget") loadWidgetConfig(websiteId, domain, cell);
  else if (type === "chats") loadConversations(websiteId, cell);
  else if (type === "stats") loadStats(websiteId, cell);
}

/* ============================================================
   WIDGET CONFIG
============================================================ */
async function loadWidgetConfig(websiteId, domain, cell) {
  const apiKey = domainKeyMap[domain];
  if (!apiKey) {
    cell.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">No active API key found for this website.</p>`;
    return;
  }

  try {
    const res = await fetch(`${API}/widget/config/${apiKey}`);
    const cfg = await res.json();

    widgetPositions[websiteId] = cfg.bubble_position || "right";
    const pos = widgetPositions[websiteId];

    cell.innerHTML = `
      <div class="widget-form">

        <div class="input-group">
          <label>Primary Color</label>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="color" id="wc-primary-${websiteId}" value="${escapeHtml(cfg.primary_color || "#00B2A0")}" />
            <span id="wc-primary-hex-${websiteId}" class="mono">${escapeHtml(cfg.primary_color || "#00B2A0")}</span>
          </div>
        </div>

        <div class="input-group">
          <label>Text Color</label>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="color" id="wc-text-${websiteId}" value="${escapeHtml(cfg.text_color || "#0b0d12")}" />
            <span id="wc-text-hex-${websiteId}" class="mono">${escapeHtml(cfg.text_color || "#0b0d12")}</span>
          </div>
        </div>

        <div class="input-group">
          <label>Bubble Position</label>
          <div style="display:flex;gap:8px">
            <button id="wc-pos-right-${websiteId}"
              class="${pos !== "left" ? "btn-primary" : "btn-ghost"} btn-sm"
              onclick="setWidgetPosition(${websiteId}, 'right')">Right</button>
            <button id="wc-pos-left-${websiteId}"
              class="${pos === "left" ? "btn-primary" : "btn-ghost"} btn-sm"
              onclick="setWidgetPosition(${websiteId}, 'left')">Left</button>
          </div>
        </div>

        <div class="input-group" style="grid-column:1/-1">
          <label>Welcome Message</label>
          <input type="text" id="wc-welcome-${websiteId}"
            placeholder="Hi! How can I help you?"
            value="${escapeHtml(cfg.welcome_message || "")}" />
        </div>

        <div style="grid-column:1/-1;display:flex;align-items:center;gap:12px">
          <button class="btn-primary btn-sm" onclick="saveWidgetConfig(${websiteId})">Save configuration</button>
          <span id="wc-msg-${websiteId}" style="display:none;font-size:0.82rem"></span>
        </div>

      </div>`;

    // Live hex label update
    [`wc-primary-${websiteId}`, `wc-text-${websiteId}`].forEach(inputId => {
      const input = document.getElementById(inputId);
      const hexEl = document.getElementById(inputId + "-hex");
      if (input && hexEl) input.addEventListener("input", () => { hexEl.textContent = input.value; });
    });

  } catch {
    cell.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">Failed to load widget config.</p>`;
  }
}

function setWidgetPosition(websiteId, pos) {
  widgetPositions[websiteId] = pos;
  const rBtn = document.getElementById(`wc-pos-right-${websiteId}`);
  const lBtn = document.getElementById(`wc-pos-left-${websiteId}`);
  if (rBtn) rBtn.className = (pos === "right" ? "btn-primary" : "btn-ghost") + " btn-sm";
  if (lBtn) lBtn.className = (pos === "left"  ? "btn-primary" : "btn-ghost") + " btn-sm";
}

async function saveWidgetConfig(websiteId) {
  const primary  = document.getElementById(`wc-primary-${websiteId}`)?.value;
  const textCol  = document.getElementById(`wc-text-${websiteId}`)?.value;
  const welcome  = document.getElementById(`wc-welcome-${websiteId}`)?.value;
  const position = widgetPositions[websiteId] || "right";
  const msgEl    = document.getElementById(`wc-msg-${websiteId}`);

  const res = await fetch(`${API}/admin/websites/${websiteId}/widget-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ primary_color: primary, text_color: textCol, bubble_position: position, welcome_message: welcome }),
  });

  if (msgEl) {
    msgEl.style.display = "inline";
    if (res.ok) {
      msgEl.textContent = "✓ Saved!";
      msgEl.style.color = "var(--green)";
    } else {
      msgEl.textContent = "Save failed";
      msgEl.style.color = "var(--red)";
    }
    setTimeout(() => { msgEl.style.display = "none"; }, 2500);
  }
}

/* ============================================================
   CONVERSATIONS
============================================================ */
async function loadConversations(websiteId, cell) {
  try {
    const res      = await fetch(`${API}/admin/websites/${websiteId}/conversations`, { headers: authHeaders() });
    const sessions = await res.json();

    if (!sessions.length) {
      cell.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">No conversations yet.</p>`;
      return;
    }

    const totalMsgs = sessions.reduce((n, s) => n + s.messages.length, 0);

    let html = `
      <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px">
        ${sessions.length} session${sessions.length !== 1 ? "s" : ""} · ${totalMsgs} message${totalMsgs !== 1 ? "s" : ""}
      </p>
      <div style="display:flex;flex-direction:column;gap:12px">`;

    sessions.forEach(session => {
      const safeId   = session.session_id.replace(/[^a-zA-Z0-9]/g, "-");
      const firstMsg = session.messages[0];
      const shortId  = session.session_id.length > 24
        ? session.session_id.slice(0, 12) + "…" + session.session_id.slice(-8)
        : session.session_id;

      html += `
        <div style="border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
          <div class="session-header" onclick="toggleSession('${safeId}')" style="cursor:pointer;padding:10px 16px;background:var(--surface-2)">
            <span id="arrow-${safeId}" style="font-size:0.65rem;color:var(--teal)">▶</span>
            <span class="mono">${escapeHtml(shortId)}</span>
            <span style="margin-left:auto;margin-right:8px;font-size:0.75rem;color:var(--text-muted)">${session.messages.length} msgs</span>
            <span style="font-size:0.72rem;color:var(--text-muted)">${fmtDate(firstMsg?.created_at)}</span>
          </div>
          <div class="chat-thread" id="sess-${safeId}" style="display:none">`;

      session.messages.forEach(m => {
        const sourceLinks = (m.sources || [])
          .filter(Boolean)
          .map(s => `<a href="${escapeHtml(s)}" target="_blank" style="display:block;font-size:0.68rem;color:var(--teal);text-decoration:none;opacity:0.8">${escapeHtml(s)}</a>`)
          .join("");

        html += `
            <div class="chat-msg ${m.role}">
              ${escapeHtml(m.message)}
              ${sourceLinks ? `<div style="margin-top:6px">${sourceLinks}</div>` : ""}
              <div style="font-size:0.63rem;opacity:0.6;margin-top:4px">${fmtDate(m.created_at)}</div>
            </div>`;
      });

      html += `</div></div>`;
    });

    html += `</div>`;
    cell.innerHTML = html;

  } catch {
    cell.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">Failed to load conversations.</p>`;
  }
}

function toggleSession(safeId) {
  const el    = document.getElementById(`sess-${safeId}`);
  const arrow = document.getElementById(`arrow-${safeId}`);
  if (!el) return;
  const open = el.style.display !== "none";
  el.style.display    = open ? "none" : "";
  if (arrow) arrow.textContent = open ? "▶" : "▼";
}

/* ============================================================
   STATS
============================================================ */
async function loadStats(websiteId, cell) {
  try {
    const res  = await fetch(`${API}/admin/stats/${websiteId}`, { headers: authHeaders() });
    const data = await res.json();

    let topHtml = `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:12px">No queries yet.</p>`;
    if (data.top_user_messages && data.top_user_messages.length) {
      topHtml = `
        <div class="top-queries">
          <h4>Top User Queries</h4>
          ${data.top_user_messages.map((q, i) => `
            <div class="query-item">
              <span class="q">${escapeHtml(q.message)}</span>
              <span class="count">${q.count}×</span>
            </div>`).join("")}
        </div>`;
    }

    cell.innerHTML = `
      <div class="stats-detail">
        <div class="stat-mini">
          <div class="label">Total Conversations</div>
          <div class="value">${data.total_conversations}</div>
        </div>
        <div class="stat-mini">
          <div class="label">Total Messages</div>
          <div class="value">${data.total_messages}</div>
        </div>
        <div class="stat-mini">
          <div class="label">Messages Today</div>
          <div class="value">${data.messages_today}</div>
        </div>
      </div>
      ${topHtml}`;

  } catch {
    cell.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">Failed to load stats.</p>`;
  }
}

/* ============================================================
   ANALYZE WEBSITE
============================================================ */
async function analyzeWebsite(id) {
  if (!await showConfirm("Analyze this website? This may take up to 30 seconds.")) return;
  startProgress(id, "Analyzing…");

  const res = await fetch(`${API}/admin/websites/${id}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({}),
  });

  finishProgress(id);
  if (!res.ok) { await showAlert("Analysis failed"); return; }
  await loadWebsites();
}

/* ============================================================
   TRAIN WEBSITE  (async — returns job_id immediately)
============================================================ */
async function trainWebsite(id, force = false) {
  const customUrl = await showPrompt(
    "Enter a specific URL to train (or leave empty to train the entire domain):",
    "https://example.com/page",
    ""
  );
  if (customUrl === null) return; // cancelled

  const msg = force ? "Force-train despite analysis warnings?" : "Start training now?";
  if (!await showConfirm(msg)) return;

  const res = await fetch(`${API}/admin/websites/${id}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ force, url: customUrl.trim() || null }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    await showAlert(data.detail || "Training failed to start");
    return;
  }

  const { job_id } = await res.json();
  startProgressPolling(id, job_id);
}

/* ============================================================
   DELETE WEBSITE
============================================================ */
async function deleteWebsite(id) {
  if (!await showConfirm("Delete this website permanently? This cannot be undone.")) return;
  startProgress(id);
  const res = await fetch(`${API}/admin/websites/${id}`, { method: "DELETE", headers: authHeaders() });
  finishProgress(id);
  if (!res.ok) { await showAlert("Delete failed"); return; }
  await loadWebsites();
  await loadKeys();
}

/* ============================================================
   CREATE KEY
============================================================ */
async function createKey() {
  const email     = document.getElementById("newEmail").value.trim();
  const rawDomain = document.getElementById("newDomain").value;
  const domain    = normalizeDomain(rawDomain);

  if (!domain) { await showAlert("Domain is required"); return; }

  const res = await fetch(`${API}/admin/create-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ email, domain }),
  });

  if (!res.ok) { await showAlert("Failed to create key"); return; }

  const msgEl = document.getElementById("createKeyMsg");
  if (msgEl) msgEl.textContent = "API key created for " + domain;
  document.getElementById("newEmail").value  = "";
  document.getElementById("newDomain").value = "";
  setTimeout(() => { if (msgEl) msgEl.textContent = ""; }, 3000);

  await loadKeys();
  await loadWebsites();
}

/* ============================================================
   INSPECT WEBSITE
============================================================ */
async function inspectWebsite(id) {
  startProgress(id, "Inspecting…");
  try {
    const res = await fetch(`${API}/admin/websites/${id}/inspect`, { headers: authHeaders() });
    finishProgress(id);

    if (res.status === 401) { logout(); return; }
    if (!res.ok) { await showAlert("Inspect failed"); return; }

    const data = await res.json();
    const summary = `Intent: ${data.intent ?? "N/A"}\nConfidence: ${data.confidence ?? "N/A"}\n\n${data.notes ?? ""}`;

    if (data.all_chunks_text) {
      const download = await showConfirm(summary + "\n\nDownload all chunks as .txt file?");
      if (download) {
        const blob = new Blob([data.all_chunks_text], { type: "text/plain" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `axyom_chunks_${id}.txt`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }
    } else {
      await showAlert(summary);
    }
  } catch (err) {
    finishProgress(id);
    await showAlert("Inspect crashed: " + err.message);
  }
}
