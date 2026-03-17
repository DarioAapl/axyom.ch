const API = "https://api.axyom.ch";

// website_id is not returned by /admin/keys, so we key by domain
const domainKeyMap = {};   // domain  -> api_key string
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
   MODAL  (replaces alert / confirm / prompt)
============================================================ */
function _modal({ message, showCancel = false, showInput = false, inputPlaceholder = "", inputDefault = "", okLabel = "OK" }) {
  return new Promise(resolve => {
    const overlay  = document.getElementById("modal");
    const msgEl    = document.getElementById("modal-msg");
    const inputEl  = document.getElementById("modal-input");
    const okBtn    = document.getElementById("modal-ok");
    const cancelBtn = document.getElementById("modal-cancel");

    msgEl.textContent = message;
    okBtn.textContent = okLabel;
    cancelBtn.style.display = showCancel ? "" : "none";

    if (showInput) {
      inputEl.placeholder = inputPlaceholder;
      inputEl.value = inputDefault;
      inputEl.style.display = "";
      setTimeout(() => inputEl.focus(), 50);
    } else {
      inputEl.style.display = "none";
    }

    overlay.style.display = "flex";

    const cleanup = () => { overlay.style.display = "none"; };

    okBtn.onclick = () => {
      cleanup();
      resolve(showInput ? inputEl.value : true);
    };
    cancelBtn.onclick = () => { cleanup(); resolve(null); };
    inputEl.onkeydown = e => {
      if (e.key === "Enter")  okBtn.click();
      if (e.key === "Escape") cancelBtn.click();
    };
    overlay.onclick = e => { if (e.target === overlay) { cleanup(); resolve(null); } };
  });
}

const showAlert   = msg  => _modal({ message: msg });
const showConfirm = msg  => _modal({ message: msg, showCancel: true, okLabel: "Confirm" });
const showPrompt  = (msg, placeholder = "", def = "") =>
  _modal({ message: msg, showCancel: true, showInput: true, inputPlaceholder: placeholder, inputDefault: def });

/* ============================================================
   DEPLOY INFO
============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const el = document.getElementById("deployInfo");
  if (!el) return;
  try {
    const res  = await fetch(`${API}/deploy-info`);
    const data = await res.json();
    el.textContent = "Deploy: " + fmtDate(data.deploy_time);
  } catch { el.textContent = "Deploy: unknown"; }
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
   PROGRESS BAR  (fake animation for blocking ops like Analyze)
============================================================ */
const progressIntervals = {};

function progressBar(id) {
  return `
    <div id="progress-${id}" class="progress-container" style="display:none">
      <div class="progress-bar-wrap">
        <div class="progress-bar">
          <div id="progress-fill-${id}" class="progress-fill"></div>
        </div>
        <span id="progress-text-${id}" class="progress-text">0%</span>
      </div>
      <span id="progress-msg-${id}" class="progress-msg"></span>
    </div>`;
}

function startProgress(id, msg = "") {
  const container = document.getElementById(`progress-${id}`);
  const fill      = document.getElementById(`progress-fill-${id}`);
  const text      = document.getElementById(`progress-text-${id}`);
  const msgEl     = document.getElementById(`progress-msg-${id}`);
  if (!container) return;

  container.style.display = "flex";
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
  // Re-show the bar (table might have just re-rendered)
  const container = document.getElementById(`progress-${websiteId}`);
  if (container) container.style.display = "flex";

  if (trainingPollers[websiteId]) clearInterval(trainingPollers[websiteId]);

  trainingPollers[websiteId] = setInterval(async () => {
    try {
      const res  = await fetch(`${API}/admin/websites/${websiteId}/training-status`, { headers: authHeaders() });
      const data = await res.json();

      const fill    = document.getElementById(`progress-fill-${websiteId}`);
      const text    = document.getElementById(`progress-text-${websiteId}`);
      const msgEl   = document.getElementById(`progress-msg-${websiteId}`);
      const cont    = document.getElementById(`progress-${websiteId}`);

      if (cont && cont.style.display === "none") cont.style.display = "flex";
      if (fill)  fill.style.width   = data.progress + "%";
      if (text)  text.textContent   = data.progress + "%";
      if (msgEl) msgEl.textContent  = data.message || "";

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
          msgEl.textContent  = "Error: " + (data.message || "Training failed");
          msgEl.style.color  = "var(--danger)";
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
        <td>${c.is_active ? "Active" : "Disabled"}</td>
        <td>${fmtDate(c.created_at)}</td>
        <td>
          <button class="btn danger small" onclick="deleteCustomer(${c.id})">Delete</button>
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
        <td>${k.is_active ? "Active" : "Revoked"}</td>
        <td>${fmtDate(k.created_at)}</td>
        <td>
          <button class="btn small" onclick="copyEmbed('${escapeHtml(k.key)}')">📋 Copy</button>
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

    // Primary action button (left of progress bar)
    let mainBtn = "";
    if (w.is_trained) {
      mainBtn = `
        <span class="pill green">Trained</span>
        <button class="btn ghost small" onclick="trainWebsite(${w.id}, true)">Retrain</button>`;
    } else if (!analysis) {
      mainBtn = `<button class="btn small" onclick="analyzeWebsite(${w.id})">Analyze</button>`;
    } else if (analysis.verdict === "ok") {
      mainBtn = `<button class="btn primary small" onclick="trainWebsite(${w.id})">Train</button>`;
    } else {
      mainBtn = `<button class="btn ghost small" onclick="trainWebsite(${w.id}, true)">Force Train</button>`;
    }

    table.innerHTML += `
      <tr id="row-${w.id}">
        <td>${w.id}</td>
        <td>${escapeHtml(w.domain)}</td>
        <td>${verdictBadge}</td>
        <td>
          ${analysis ? `<div class="meta">${analysis.estimated_pages} pages · ${analysis.estimated_chunks} chunks</div>` : `<span class="muted">—</span>`}
        </td>
        <td>
          <div class="action-primary">
            ${mainBtn}
            ${progressBar(w.id)}
          </div>
          <div class="action-secondary">
            <button class="btn ghost small" onclick="inspectWebsite(${w.id})">Inspect</button>
            <button class="btn ghost small" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'widget')">🎨 Widget</button>
            <button class="btn ghost small" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'chats')">💬 Chats</button>
            <button class="btn ghost small" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'stats')">📊 Stats</button>
            <button class="btn danger small" onclick="deleteWebsite(${w.id})">Delete</button>
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
    if (cont) cont.style.display = "flex";
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
  cell.innerHTML = `<div class="detail-loading">Loading…</div>`;

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
    cell.innerHTML = `<div class="detail-content"><p class="muted">No active API key found for this website.</p></div>`;
    return;
  }

  try {
    const res = await fetch(`${API}/widget/config/${apiKey}`);
    const cfg = await res.json();

    widgetPositions[websiteId] = cfg.bubble_position || "right";

    cell.innerHTML = `
      <div class="detail-content widget-config-form">
        <h3>Widget Configuration</h3>
        <div class="config-grid">

          <div class="config-field">
            <label>Primary Color</label>
            <div class="color-field">
              <input type="color" id="wc-primary-${websiteId}" value="${escapeHtml(cfg.primary_color || "#00B2A0")}" />
              <span id="wc-primary-hex-${websiteId}" class="color-hex">${escapeHtml(cfg.primary_color || "#00B2A0")}</span>
            </div>
          </div>

          <div class="config-field">
            <label>Text Color</label>
            <div class="color-field">
              <input type="color" id="wc-text-${websiteId}" value="${escapeHtml(cfg.text_color || "#0b0d12")}" />
              <span id="wc-text-hex-${websiteId}" class="color-hex">${escapeHtml(cfg.text_color || "#0b0d12")}</span>
            </div>
          </div>

          <div class="config-field">
            <label>Bubble Position</label>
            <div class="toggle-group">
              <button id="wc-pos-right-${websiteId}"
                class="toggle-btn ${widgetPositions[websiteId] !== "left" ? "active" : ""}"
                onclick="setWidgetPosition(${websiteId}, 'right')">Right</button>
              <button id="wc-pos-left-${websiteId}"
                class="toggle-btn ${widgetPositions[websiteId] === "left" ? "active" : ""}"
                onclick="setWidgetPosition(${websiteId}, 'left')">Left</button>
            </div>
          </div>

          <div class="config-field wide">
            <label>Welcome Message</label>
            <input type="text" id="wc-welcome-${websiteId}"
              placeholder="Hi! How can I help you?"
              value="${escapeHtml(cfg.welcome_message || "")}" />
          </div>

        </div>
        <div class="config-actions">
          <button class="btn primary small" onclick="saveWidgetConfig(${websiteId})">Save Configuration</button>
          <span id="wc-msg-${websiteId}" class="config-saved" style="display:none">✓ Saved!</span>
        </div>
      </div>`;

    // Live hex label update
    [`wc-primary-${websiteId}`, `wc-text-${websiteId}`].forEach(inputId => {
      const input = document.getElementById(inputId);
      const hexEl = document.getElementById(inputId + "-hex");
      if (input && hexEl) {
        input.addEventListener("input", () => { hexEl.textContent = input.value; });
      }
    });

  } catch {
    cell.innerHTML = `<div class="detail-content"><p class="muted">Failed to load widget config.</p></div>`;
  }
}

function setWidgetPosition(websiteId, pos) {
  widgetPositions[websiteId] = pos;
  const rBtn = document.getElementById(`wc-pos-right-${websiteId}`);
  const lBtn = document.getElementById(`wc-pos-left-${websiteId}`);
  if (rBtn) rBtn.className = "toggle-btn" + (pos === "right" ? " active" : "");
  if (lBtn) lBtn.className = "toggle-btn" + (pos === "left"  ? " active" : "");
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
      msgEl.textContent  = "✓ Saved!";
      msgEl.style.color  = "var(--success)";
    } else {
      msgEl.textContent  = "Save failed";
      msgEl.style.color  = "var(--danger)";
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
      cell.innerHTML = `<div class="detail-content"><p class="muted">No conversations yet.</p></div>`;
      return;
    }

    const totalMsgs = sessions.reduce((n, s) => n + s.messages.length, 0);

    let html = `<div class="detail-content convos-wrap">
      <div class="convos-meta">${sessions.length} session${sessions.length !== 1 ? "s" : ""} · ${totalMsgs} message${totalMsgs !== 1 ? "s" : ""}</div>
      <div class="sessions-list">`;

    sessions.forEach((session, si) => {
      const safeId   = session.session_id.replace(/[^a-zA-Z0-9]/g, "-");
      const firstMsg = session.messages[0];
      const shortId  = session.session_id.length > 24
        ? session.session_id.slice(0, 12) + "…" + session.session_id.slice(-8)
        : session.session_id;

      html += `
        <div class="session">
          <div class="session-header" onclick="toggleSession('${safeId}')">
            <span class="session-arrow" id="arrow-${safeId}">▶</span>
            <span class="session-id mono">${escapeHtml(shortId)}</span>
            <span class="session-count">${session.messages.length} msgs</span>
            <span class="session-time">${fmtDate(firstMsg?.created_at)}</span>
          </div>
          <div class="session-messages" id="sess-${safeId}" style="display:none">`;

      session.messages.forEach(m => {
        const sourceLinks = (m.sources || [])
          .filter(Boolean)
          .map(s => `<a href="${escapeHtml(s)}" target="_blank" class="source-link">${escapeHtml(s)}</a>`)
          .join("");

        html += `
          <div class="chat-msg ${m.role}">
            <span class="chat-icon">${m.role === "user" ? "👤" : "🤖"}</span>
            <div class="chat-bubble">
              <p>${escapeHtml(m.message)}</p>
              ${sourceLinks ? `<div class="chat-sources">${sourceLinks}</div>` : ""}
              <span class="chat-time">${fmtDate(m.created_at)}</span>
            </div>
          </div>`;
      });

      html += `</div></div>`;
    });

    html += `</div></div>`;
    cell.innerHTML = html;

  } catch {
    cell.innerHTML = `<div class="detail-content"><p class="muted">Failed to load conversations.</p></div>`;
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

    let topHtml = `<p class="muted" style="margin-top:1rem">No queries yet.</p>`;
    if (data.top_user_messages && data.top_user_messages.length) {
      topHtml = `
        <div class="top-queries">
          <h4>Top User Queries</h4>
          <div class="query-list">
            ${data.top_user_messages.map((q, i) => `
              <div class="query-item">
                <span class="query-rank">${i + 1}</span>
                <span class="query-text">${escapeHtml(q.message)}</span>
                <span class="query-count">${q.count}×</span>
              </div>`).join("")}
          </div>
        </div>`;
    }

    cell.innerHTML = `
      <div class="detail-content stats-detail">
        <div class="stats-grid">
          <div class="stat-item">
            <span>Total Conversations</span>
            <strong>${data.total_conversations}</strong>
          </div>
          <div class="stat-item">
            <span>Total Messages</span>
            <strong>${data.total_messages}</strong>
          </div>
          <div class="stat-item">
            <span>Messages Today</span>
            <strong>${data.messages_today}</strong>
          </div>
        </div>
        ${topHtml}
      </div>`;

  } catch {
    cell.innerHTML = `<div class="detail-content"><p class="muted">Failed to load stats.</p></div>`;
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
  msgEl.textContent = "API key created for " + domain;
  document.getElementById("newEmail").value  = "";
  document.getElementById("newDomain").value = "";
  setTimeout(() => { msgEl.textContent = ""; }, 3000);

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
