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
          <button class="btn-ghost btn-sm" onclick="copyEmbed('${escapeHtml(k.key)}')">📋 Copy</button>
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
        <button class="btn-ghost btn-sm" onclick="trainWebsite(${w.id}, true)">🔄 Retrain</button>`;
    } else if (!analysis) {
      mainBtn = `<button class="btn-ghost btn-sm" onclick="analyzeWebsite(${w.id})">🔍 Analyze</button>`;
    } else if (analysis.verdict === "ok") {
      mainBtn = `<button class="btn-primary btn-sm" onclick="trainWebsite(${w.id})">⚡ Train</button>`;
    } else {
      mainBtn = `<button class="btn-ghost btn-sm" onclick="trainWebsite(${w.id}, true)">⚠️ Force Train</button>`;
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
            <button class="btn-ghost btn-sm" onclick="inspectWebsite(${w.id})">🔬 Inspect</button>
            <button class="btn-ghost btn-sm" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'widget')">🎨 Widget</button>
            <button class="btn-ghost btn-sm" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'chats')">💬 Chats</button>
            <button class="btn-ghost btn-sm" onclick="toggleDetail(${w.id}, '${escapeHtml(w.domain)}', 'stats')">📊 Stats</button>
            <button class="btn-danger btn-sm" onclick="deleteWebsite(${w.id})">🗑️ Delete</button>
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
function closeDetail(websiteId) {
  const row = document.getElementById(`detail-${websiteId}`);
  if (row) { row.style.display = "none"; row.dataset.activeType = ""; }
}

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
    cell.innerHTML = `
      <div class="detail-panel-header">
        <span class="detail-panel-title">🎨 Widget Configuration</span>
        <button class="detail-close" onclick="closeDetail(${websiteId})">✕</button>
      </div>
      <p style="color:var(--text-muted);font-size:0.85rem">No active API key found for this website.</p>`;
    return;
  }

  try {
    const res = await fetch(`${API}/widget/config/${apiKey}`);
    const cfg = await res.json();

    widgetPositions[websiteId] = cfg.bubble_position || "right";
    const pos    = widgetPositions[websiteId];
    const pColor = cfg.primary_color || "#00B2A0";
    const tColor = cfg.text_color    || "#0b0d12";

    cell.innerHTML = `
      <div class="detail-panel-header">
        <span class="detail-panel-title">🎨 Widget Configuration</span>
        <button class="detail-close" onclick="closeDetail(${websiteId})">✕</button>
      </div>

      <div class="widget-form">

        <div class="input-group">
          <label>Primary Color</label>
          <div class="color-picker-row">
            <div class="color-swatch" id="wc-swatch-primary-${websiteId}" style="background:${escapeHtml(pColor)}" onclick="document.getElementById('wc-primary-${websiteId}').click()"></div>
            <input type="color" class="inline-picker" id="wc-primary-${websiteId}" value="${escapeHtml(pColor)}" />
            <span id="wc-primary-hex-${websiteId}" class="mono">${escapeHtml(pColor)}</span>
          </div>
        </div>

        <div class="input-group">
          <label>Text Color</label>
          <div class="color-picker-row">
            <div class="color-swatch" id="wc-swatch-text-${websiteId}" style="background:${escapeHtml(tColor)}" onclick="document.getElementById('wc-text-${websiteId}').click()"></div>
            <input type="color" class="inline-picker" id="wc-text-${websiteId}" value="${escapeHtml(tColor)}" />
            <span id="wc-text-hex-${websiteId}" class="mono">${escapeHtml(tColor)}</span>
          </div>
        </div>

        <div class="input-group">
          <label>Bubble Position</label>
          <div class="position-toggle">
            <button id="wc-pos-right-${websiteId}"
              class="pos-btn ${pos !== "left" ? "active" : ""}"
              onclick="setWidgetPosition(${websiteId}, 'right')">◀ Right</button>
            <button id="wc-pos-left-${websiteId}"
              class="pos-btn ${pos === "left" ? "active" : ""}"
              onclick="setWidgetPosition(${websiteId}, 'left')">Left ▶</button>
          </div>
        </div>

        <div class="input-group" style="grid-column:1/-1">
          <label>Welcome Message</label>
          <input type="text" id="wc-welcome-${websiteId}"
            placeholder="Hi! How can I help you?"
            value="${escapeHtml(cfg.welcome_message || "")}" />
        </div>

        <div class="widget-preview-area" id="wc-preview-area-${websiteId}">
          <div class="preview-bubble ${pos === "left" ? "left" : ""}" id="wc-preview-${websiteId}" style="background:${escapeHtml(pColor)}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="${escapeHtml(tColor)}">
              <path d="M20 15a4 4 0 01-4 4H7l-3 3V7a4 4 0 014-4h8a4 4 0 014 4z"/>
            </svg>
          </div>
        </div>

        <div style="grid-column:1/-1;display:flex;align-items:center;gap:12px">
          <button class="btn-primary" onclick="saveWidgetConfig(${websiteId})">Save configuration</button>
          <span id="wc-msg-${websiteId}" style="display:none;font-size:0.82rem"></span>
        </div>

      </div>`;

    // Live updates: hex label, swatch, preview bubble
    const primaryInput = document.getElementById(`wc-primary-${websiteId}`);
    const textInput    = document.getElementById(`wc-text-${websiteId}`);

    if (primaryInput) {
      primaryInput.addEventListener("input", () => {
        const v = primaryInput.value;
        const hexEl   = document.getElementById(`wc-primary-hex-${websiteId}`);
        const swatch  = document.getElementById(`wc-swatch-primary-${websiteId}`);
        const preview = document.getElementById(`wc-preview-${websiteId}`);
        if (hexEl)   hexEl.textContent     = v;
        if (swatch)  swatch.style.background = v;
        if (preview) preview.style.background = v;
      });
    }
    if (textInput) {
      textInput.addEventListener("input", () => {
        const v = textInput.value;
        const hexEl  = document.getElementById(`wc-text-hex-${websiteId}`);
        const swatch = document.getElementById(`wc-swatch-text-${websiteId}`);
        const svg    = document.querySelector(`#wc-preview-${websiteId} svg`);
        if (hexEl)  hexEl.textContent      = v;
        if (swatch) swatch.style.background = v;
        if (svg)    svg.style.fill         = v;
      });
    }

  } catch {
    cell.innerHTML = `
      <div class="detail-panel-header">
        <span class="detail-panel-title">🎨 Widget Configuration</span>
        <button class="detail-close" onclick="closeDetail(${websiteId})">✕</button>
      </div>
      <p style="color:var(--text-muted);font-size:0.85rem">Failed to load widget config.</p>`;
  }
}

function setWidgetPosition(websiteId, pos) {
  widgetPositions[websiteId] = pos;
  const rBtn    = document.getElementById(`wc-pos-right-${websiteId}`);
  const lBtn    = document.getElementById(`wc-pos-left-${websiteId}`);
  const preview = document.getElementById(`wc-preview-${websiteId}`);
  if (rBtn) rBtn.className = "pos-btn" + (pos === "right" ? " active" : "");
  if (lBtn) lBtn.className = "pos-btn" + (pos === "left"  ? " active" : "");
  if (preview) {
    preview.classList.toggle("left", pos === "left");
  }
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

    const totalMsgs = sessions.reduce((n, s) => n + s.messages.length, 0);

    let html = `
      <div class="detail-panel-header">
        <span class="detail-panel-title">💬 Conversations</span>
        <button class="detail-close" onclick="closeDetail(${websiteId})">✕</button>
      </div>`;

    if (!sessions.length) {
      html += `<p style="color:var(--text-muted);font-size:0.85rem">No conversations yet.</p>`;
      cell.innerHTML = html;
      return;
    }

    html += `
      <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px">
        ${sessions.length} session${sessions.length !== 1 ? "s" : ""} · ${totalMsgs} message${totalMsgs !== 1 ? "s" : ""}
      </p>
      <div class="sessions-wrap">`;

    sessions.forEach(session => {
      const safeId   = session.session_id.replace(/[^a-zA-Z0-9]/g, "-");
      const firstMsg = session.messages[0];
      const shortId  = session.session_id.length > 28
        ? session.session_id.slice(0, 12) + "…" + session.session_id.slice(-8)
        : session.session_id;

      html += `
        <div class="session-card">
          <div class="session-toggle" onclick="toggleSession('${safeId}')">
            <span class="session-arrow" id="arrow-${safeId}">▶</span>
            <span class="session-id-label">${escapeHtml(shortId)}</span>
            <span class="session-badge">${session.messages.length} msg${session.messages.length !== 1 ? "s" : ""}</span>
            <span class="session-date-label">${fmtDate(firstMsg?.created_at)}</span>
          </div>
          <div class="session-body" id="sess-${safeId}">
            <div class="chat-thread-wrap">`;

      session.messages.forEach(m => {
        const sourceLinks = (m.sources || [])
          .filter(Boolean)
          .map(s => `<a href="${escapeHtml(s)}" target="_blank" class="chat-source-link">${escapeHtml(s)}</a>`)
          .join("");

        html += `
              <div class="chat-row ${m.role}">
                <div class="chat-bubble-msg">
                  ${escapeHtml(m.message)}
                  ${sourceLinks}
                  <span class="chat-ts">${fmtDate(m.created_at)}</span>
                </div>
              </div>`;
      });

      html += `
            </div>
          </div>
        </div>`;
    });

    html += `</div>`;
    cell.innerHTML = html;

  } catch {
    cell.innerHTML = `
      <div class="detail-panel-header">
        <span class="detail-panel-title">💬 Conversations</span>
        <button class="detail-close" onclick="closeDetail(${websiteId})">✕</button>
      </div>
      <p style="color:var(--text-muted);font-size:0.85rem">Failed to load conversations.</p>`;
  }
}

function toggleSession(safeId) {
  const body  = document.getElementById(`sess-${safeId}`);
  const arrow = document.getElementById(`arrow-${safeId}`);
  if (!body) return;
  const open = body.style.display === "block";
  body.style.display = open ? "none" : "block";
  if (arrow) {
    arrow.textContent = open ? "▶" : "▼";
    arrow.classList.toggle("open", !open);
  }
}

/* ============================================================
   STATS
============================================================ */
async function loadStats(websiteId, cell) {
  try {
    const res  = await fetch(`${API}/admin/stats/${websiteId}`, { headers: authHeaders() });
    const data = await res.json();

    let topHtml = `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">No queries yet.</p>`;
    if (data.top_user_messages && data.top_user_messages.length) {
      const maxCount = data.top_user_messages[0].count || 1;
      topHtml = `
        <div class="queries-section">
          <h4>Top User Queries</h4>
          ${data.top_user_messages.map((q, i) => `
            <div class="query-bar-item">
              <div class="query-bar-header">
                <span class="query-bar-text">${escapeHtml(q.message)}</span>
                <span class="query-bar-count">${q.count}×</span>
              </div>
              <div class="query-bar-track">
                <div class="query-bar-fill" data-width="${Math.round(q.count / maxCount * 100)}"></div>
              </div>
            </div>`).join("")}
        </div>`;
    }

    cell.innerHTML = `
      <div class="detail-panel-header">
        <span class="detail-panel-title">📊 Stats</span>
        <button class="detail-close" onclick="closeDetail(${websiteId})">✕</button>
      </div>
      <div class="stats-mini-grid">
        <div class="stat-mini-card">
          <div class="stat-mini-icon">🗣️</div>
          <div class="stat-mini-label">Conversations</div>
          <div class="stat-mini-value">${data.total_conversations}</div>
        </div>
        <div class="stat-mini-card">
          <div class="stat-mini-icon">💬</div>
          <div class="stat-mini-label">Total Messages</div>
          <div class="stat-mini-value">${data.total_messages}</div>
        </div>
        <div class="stat-mini-card">
          <div class="stat-mini-icon">📅</div>
          <div class="stat-mini-label">Messages Today</div>
          <div class="stat-mini-value">${data.messages_today}</div>
        </div>
      </div>
      ${topHtml}`;

    // Animate bars after paint
    requestAnimationFrame(() => {
      setTimeout(() => {
        cell.querySelectorAll(".query-bar-fill[data-width]").forEach(bar => {
          bar.style.width = bar.dataset.width + "%";
        });
      }, 60);
    });

  } catch {
    cell.innerHTML = `
      <div class="detail-panel-header">
        <span class="detail-panel-title">📊 Stats</span>
        <button class="detail-close" onclick="closeDetail(${websiteId})">✕</button>
      </div>
      <p style="color:var(--text-muted);font-size:0.85rem">Failed to load stats.</p>`;
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
