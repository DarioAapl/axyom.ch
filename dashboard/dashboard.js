/* ═══════════════════════════════════════════
   AXYOM Customer Dashboard
   ═══════════════════════════════════════════ */

const API = 'https://api.axyom.ch';

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('customer_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { ...authHeaders(), ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) {
    localStorage.removeItem('customer_token');
    window.location.href = 'login.html';
    throw new Error('Unauthorized');
  }
  return res;
}

function logout() {
  localStorage.removeItem('customer_token');
  window.location.href = 'login.html';
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) {
    window.location.href = 'login.html';
    return;
  }

  try {
    await loadDashboard();
  } catch (err) {
    if (err.message !== 'Unauthorized') console.error(err);
  }
});

async function loadDashboard() {
  const res = await apiFetch('/customer/me');
  const me = await res.json();

  // Nav email pill
  document.getElementById('customerEmail').textContent = me.email;

  // Stats
  const sub = me.subscription;
  document.getElementById('statWebsites').textContent = me.websites.length;
  document.getElementById('statPlan').textContent = sub.plan
    ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)
    : 'No plan';

  const used = sub.conversations_used ?? 0;
  const limit = sub.conversation_limit;
  document.getElementById('statConvos').textContent = limit
    ? `${used} / ${limit}`
    : used;

  const trained = me.websites.filter(w => w.is_trained).length;
  document.getElementById('statTrained').textContent = trained;

  // Websites section
  renderWebsites(me.websites, sub);

  // Billing section
  await loadBilling();
}

// ── Websites ──────────────────────────────────────────────────────────────────

function renderWebsites(websites, sub) {
  const container = document.getElementById('websitesList');
  container.innerHTML = '';

  if (!websites.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
        </div>
        <div>No websites found. Contact support to get set up.</div>
      </div>`;
    return;
  }

  websites.forEach(w => {
    const card = document.createElement('div');
    card.className = 'website-card';
    card.id = `wcard-${w.id}`;

    const trainedPill = w.is_trained
      ? `<span class="pill pill-green">Trained</span>`
      : `<span class="pill pill-orange">Not trained</span>`;
    const activePill = w.is_active
      ? `<span class="pill pill-teal">Active</span>`
      : `<span class="pill pill-muted">Inactive</span>`;

    card.innerHTML = `
      <div class="website-header" onclick="toggleWebsite(${w.id})">
        <div class="website-title">
          <span class="website-domain">${escHtml(w.domain)}</span>
          <div class="website-meta">${trainedPill}${activePill}</div>
        </div>
        <div class="website-actions">
          <span class="text-dim" style="font-size:0.8rem;color:var(--text-muted)">${w.conversations_total} convos</span>
          <svg id="chevron-${w.id}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);transition:transform 0.2s"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="website-panel" id="wpanel-${w.id}">
        <div class="panel-tabs">
          <div class="panel-tab active" onclick="switchTab(${w.id},'stats',this)">Stats</div>
          <div class="panel-tab" onclick="switchTab(${w.id},'widget',this)">Widget</div>
          <div class="panel-tab" onclick="switchTab(${w.id},'embed',this)">Embed</div>
          <div class="panel-tab" onclick="switchTab(${w.id},'chats',this)">Conversations</div>
          <div class="panel-tab" onclick="switchTab(${w.id},'retrain',this)">Retrain</div>
        </div>
        <div class="panel-content">
          <div class="tab-pane active" id="tab-${w.id}-stats">
            <div class="loading-row"><div class="loader"></div>Loading stats…</div>
          </div>
          <div class="tab-pane" id="tab-${w.id}-widget">
            ${buildWidgetForm(w)}
          </div>
          <div class="tab-pane" id="tab-${w.id}-embed">
            <div class="loading-row"><div class="loader"></div>Loading embed code…</div>
          </div>
          <div class="tab-pane" id="tab-${w.id}-chats">
            <div class="loading-row"><div class="loader"></div>Loading conversations…</div>
          </div>
          <div class="tab-pane" id="tab-${w.id}-retrain">
            ${buildRetrainPane(w)}
          </div>
        </div>
      </div>`;

    container.appendChild(card);
  });
}

function toggleWebsite(id) {
  const panel = document.getElementById(`wpanel-${id}`);
  const chevron = document.getElementById(`chevron-${id}`);
  const isOpen = panel.classList.contains('open');

  panel.classList.toggle('open', !isOpen);
  chevron.style.transform = isOpen ? '' : 'rotate(180deg)';

  if (!isOpen) {
    // Load stats tab on first open
    loadWebsiteStats(id);
    loadEmbedCode(id);
  }
}

function switchTab(websiteId, tabName, el) {
  // Deactivate all tabs in this panel
  const tabs = el.closest('.panel-tabs').querySelectorAll('.panel-tab');
  tabs.forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  // .panel-content is a sibling of .panel-tabs, not an ancestor — closest() can't see it.
  const wrapper = el.closest('.website-panel');
  wrapper.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById(`tab-${websiteId}-${tabName}`);
  pane.classList.add('active');

  // Lazy-load on demand
  if (tabName === 'chats') loadConversations(websiteId);
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

async function loadWebsiteStats(websiteId) {
  const pane = document.getElementById(`tab-${websiteId}-stats`);
  try {
    const res = await apiFetch(`/customer/websites/${websiteId}/stats`);
    const s = await res.json();

    const avgMsgs = s.total_conversations > 0
      ? (s.total_messages / s.total_conversations).toFixed(1)
      : '—';

    let topHtml = '<p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">No queries yet.</p>';
    if (s.top_user_messages && s.top_user_messages.length) {
      const maxCount = s.top_user_messages[0].count || 1;
      topHtml = `
        <div class="queries-section">
          <h4>Top Questions</h4>
          ${s.top_user_messages.slice(0, 8).map(m => `
            <div class="query-bar-item">
              <div class="query-bar-header">
                <span class="query-bar-text">${escHtml(m.message)}</span>
                <span class="query-bar-count">${m.count}×</span>
              </div>
              <div class="query-bar-track">
                <div class="query-bar-fill" data-width="${Math.round(m.count / maxCount * 100)}"></div>
              </div>
            </div>`).join('')}
        </div>`;
    }

    pane.innerHTML = `
      <div class="stats-mini-grid">
        <div class="stat-mini-card">
          <div class="stat-mini-icon">🗣️</div>
          <div class="stat-mini-label">Conversations</div>
          <div class="stat-mini-value">${s.total_conversations}</div>
        </div>
        <div class="stat-mini-card">
          <div class="stat-mini-icon">💬</div>
          <div class="stat-mini-label">Total Messages</div>
          <div class="stat-mini-value">${s.total_messages}</div>
        </div>
        <div class="stat-mini-card">
          <div class="stat-mini-icon">📅</div>
          <div class="stat-mini-label">Messages Today</div>
          <div class="stat-mini-value">${s.messages_today}</div>
        </div>
        <div class="stat-mini-card">
          <div class="stat-mini-icon">📈</div>
          <div class="stat-mini-label">Avg / Session</div>
          <div class="stat-mini-value">${avgMsgs}</div>
        </div>
      </div>
      ${topHtml}`;

    // Animate bars after paint
    requestAnimationFrame(() => {
      setTimeout(() => {
        pane.querySelectorAll('.query-bar-fill[data-width]').forEach(bar => {
          bar.style.width = bar.dataset.width + '%';
        });
      }, 60);
    });
  } catch {
    pane.innerHTML = '<div class="alert alert-error">Failed to load stats.</div>';
  }
}

// ── Widget tab ────────────────────────────────────────────────────────────────

function buildWidgetForm(w) {
  const cfg = w.widget_config || {};
  const primary = cfg.primary_color || '#00B2A0';
  const textCol = cfg.text_color || '#0b0d12';
  const pos = cfg.bubble_position || 'right';
  const welcome = cfg.welcome_message || '';
  const headerTitle = cfg.header_title || '';

  return `
    <div class="widget-form" id="wform-${w.id}">
      <div class="form-row">
        <div class="input-group">
          <label>Primary Color</label>
          <div class="color-row">
            <input type="color" id="wc-primary-${w.id}" value="${escHtml(primary)}" style="width:52px;flex-shrink:0"
              oninput="syncColorFromPicker(${w.id},'primary')"/>
            <input type="text" id="wc-primary-txt-${w.id}" value="${escHtml(primary)}" placeholder="#00B2A0" style="font-family:var(--mono);font-size:0.82rem" oninput="syncColor(${w.id},'primary')"/>
          </div>
        </div>
        <div class="input-group">
          <label>Text Color</label>
          <div class="color-row">
            <input type="color" id="wc-text-${w.id}" value="${escHtml(textCol)}" style="width:52px;flex-shrink:0"
              oninput="syncColorFromPicker(${w.id},'text')"/>
            <input type="text" id="wc-text-txt-${w.id}" value="${escHtml(textCol)}" placeholder="#0b0d12" style="font-family:var(--mono);font-size:0.82rem" oninput="syncColor(${w.id},'text')"/>
          </div>
        </div>
      </div>
      <div class="widget-preview-area" id="wc-cust-preview-area-${w.id}">
        <span style="font-size:0.72rem;color:var(--text-muted);font-weight:500;">Preview</span>
        <div class="preview-bubble ${pos === 'left' ? 'left' : ''}" id="wc-cust-preview-${w.id}" style="background:${escHtml(primary)}">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="${escHtml(textCol)}">
            <path d="M20 15a4 4 0 01-4 4H7l-3 3V7a4 4 0 014-4h8a4 4 0 014 4z"/>
          </svg>
        </div>
      </div>
      <div class="input-group">
        <label>Widget Position</label>
        <div class="pos-btns">
          <button class="pos-btn ${pos==='left'?'active':''}" id="wpos-left-${w.id}" onclick="setPos(${w.id},'left')">← Left</button>
          <button class="pos-btn ${pos==='right'?'active':''}" id="wpos-right-${w.id}" onclick="setPos(${w.id},'right')">Right →</button>
        </div>
      </div>
      <div class="input-group">
        <label>Header Title</label>
        <input type="text" id="wc-header-title-${w.id}" placeholder="AI Support · domain.com (default)" value="${escHtml(headerTitle)}"/>
      </div>
      <div class="input-group">
        <label>Welcome Message</label>
        <textarea id="wc-welcome-${w.id}" placeholder="Hi! How can I help you today?" style="min-height:64px">${escHtml(welcome)}</textarea>
      </div>
      <div class="save-row">
        <button class="btn-primary" onclick="saveWidgetConfig(${w.id})">Save changes</button>
        <span class="save-status" id="wsave-status-${w.id}">Saved ✓</span>
      </div>
    </div>`;
}

function syncColor(websiteId, which) {
  const txt = document.getElementById(`wc-${which}-txt-${websiteId}`);
  const picker = document.getElementById(`wc-${which}-${websiteId}`);
  const preview = document.getElementById(`wc-cust-preview-${websiteId}`);
  if (/^#[0-9a-fA-F]{6}$/.test(txt.value)) {
    picker.value = txt.value;
    if (preview) {
      if (which === 'primary') preview.style.background = txt.value;
      if (which === 'text') { const svg = preview.querySelector('svg'); if (svg) svg.style.fill = txt.value; }
    }
  }
}

function syncColorFromPicker(websiteId, which) {
  const picker = document.getElementById(`wc-${which}-${websiteId}`);
  const txt = document.getElementById(`wc-${which}-txt-${websiteId}`);
  const preview = document.getElementById(`wc-cust-preview-${websiteId}`);
  if (txt) txt.value = picker.value;
  if (preview) {
    if (which === 'primary') preview.style.background = picker.value;
    if (which === 'text') { const svg = preview.querySelector('svg'); if (svg) svg.style.fill = picker.value; }
  }
}

function setPos(websiteId, pos) {
  ['left', 'right'].forEach(p => {
    document.getElementById(`wpos-${p}-${websiteId}`)
      ?.classList.toggle('active', p === pos);
  });
  const preview = document.getElementById(`wc-cust-preview-${websiteId}`);
  if (preview) preview.classList.toggle('left', pos === 'left');
}

function getSelectedPos(websiteId) {
  return document.getElementById(`wpos-right-${websiteId}`)?.classList.contains('active')
    ? 'right' : 'left';
}

async function saveWidgetConfig(websiteId) {
  const payload = {
    primary_color: document.getElementById(`wc-primary-txt-${websiteId}`)?.value
      || document.getElementById(`wc-primary-${websiteId}`)?.value,
    text_color: document.getElementById(`wc-text-txt-${websiteId}`)?.value
      || document.getElementById(`wc-text-${websiteId}`)?.value,
    bubble_position: getSelectedPos(websiteId),
    welcome_message: document.getElementById(`wc-welcome-${websiteId}`)?.value || '',
    header_title: document.getElementById(`wc-header-title-${websiteId}`)?.value || '',
  };

  try {
    const res = await apiFetch(`/customer/websites/${websiteId}/widget-config`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json(); alert(d.detail || 'Save failed'); return; }
    const status = document.getElementById(`wsave-status-${websiteId}`);
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 2500);
  } catch {
    alert('Network error — save failed');
  }
}

// ── Embed tab ─────────────────────────────────────────────────────────────────

let _embedCache = null;

async function loadEmbedCode(websiteId) {
  const pane = document.getElementById(`tab-${websiteId}-embed`);
  if (pane.dataset.loaded) return;

  try {
    if (!_embedCache) {
      const res = await apiFetch('/customer/embed-code');
      _embedCache = await res.json();
    }
    const entry = _embedCache.find(e => e.website_id === websiteId);
    if (!entry || !entry.embed_script) {
      pane.innerHTML = `
        <div class="alert alert-warn">No API key found for this website. Contact support.</div>`;
    } else {
      pane.innerHTML = `
        <p style="font-size:0.83rem;color:var(--text-dim);margin-bottom:12px;">
          Add this snippet to your website's <code style="font-family:var(--mono)">&lt;head&gt;</code> or before <code style="font-family:var(--mono)">&lt;/body&gt;</code>:
        </p>
        <div class="embed-block" id="embed-code-${websiteId}">${escHtml(entry.embed_script)}</div>
        <div class="embed-actions">
          <button class="btn-ghost" onclick="copyEmbed(${websiteId})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy snippet
          </button>
        </div>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:10px;">${escHtml(entry.note)}</p>`;
    }
    pane.dataset.loaded = '1';
  } catch {
    pane.innerHTML = '<div class="alert alert-error">Failed to load embed code.</div>';
  }
}

function copyEmbed(websiteId) {
  const el = document.getElementById(`embed-code-${websiteId}`);
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = el.nextElementSibling?.querySelector('button');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy snippet`, 2000); }
  });
}

// ── Conversations tab ─────────────────────────────────────────────────────────

async function loadConversations(websiteId) {
  const pane = document.getElementById(`tab-${websiteId}-chats`);
  if (pane.dataset.loaded) return;
  pane.innerHTML = '<div class="loading-row"><div class="loader"></div>Loading conversations…</div>';

  try {
    const res = await apiFetch(`/customer/websites/${websiteId}/conversations`);
    const sessions = await res.json();

    if (!sessions.length) {
      pane.innerHTML = '<div class="empty-state"><div>No conversations yet.</div></div>';
      pane.dataset.loaded = '1';
      return;
    }

    pane.innerHTML = `<div class="session-list">${sessions.map((s, i) => {
      const firstUser = s.messages.find(m => m.role === 'user');
      const ts = s.messages[0]?.created_at
        ? new Date(s.messages[0].created_at).toLocaleString()
        : '';
      const preview = firstUser ? firstUser.message.slice(0, 60) : 'Empty session';
      return `
        <div class="session-item">
          <div class="session-header" onclick="toggleSession(this)">
            <span style="color:var(--text-dim)">${escHtml(preview)}${firstUser?.message.length > 60 ? '…' : ''}</span>
            <span style="font-size:0.72rem;color:var(--text-muted)">${ts} · ${s.messages.length} msgs</span>
          </div>
          <div class="session-messages">
            ${s.messages.map(m => `
              <div class="chat-bubble ${m.role}">${escHtml(m.message)}</div>`).join('')}
          </div>
        </div>`;
    }).join('')}</div>`;
    pane.dataset.loaded = '1';
  } catch {
    pane.innerHTML = '<div class="alert alert-error">Failed to load conversations.</div>';
  }
}

function toggleSession(header) {
  const messages = header.nextElementSibling;
  messages.classList.toggle('open');
}

// ── Retrain tab ───────────────────────────────────────────────────────────────

function buildRetrainPane(w) {
  if (!w.is_trained) {
    return `<div class="alert alert-warn">This website has not been trained yet. Contact support to run the initial training.</div>`;
  }

  return `
    <p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:16px;">
      Retrain the AI on your latest website content. Optionally specify a single URL to retrain only that page.
    </p>
    <div class="retrain-row" id="retrain-row-${w.id}">
      <input type="text" id="retrain-url-${w.id}" placeholder="https://${escHtml(w.domain)}/ (leave empty to retrain all)"
        style="flex:1;min-width:200px"/>
      <button class="btn-primary" onclick="startRetrain(${w.id})">Start retraining</button>
    </div>
    <div id="retrain-status-${w.id}" style="margin-top:14px;"></div>`;
}

async function startRetrain(websiteId) {
  const urlInput = document.getElementById(`retrain-url-${websiteId}`);
  const statusEl = document.getElementById(`retrain-status-${websiteId}`);
  const url = urlInput?.value.trim() || '';

  statusEl.innerHTML = '<div class="loading-row" style="padding:0"><div class="loader"></div>Starting…</div>';

  try {
    const res = await apiFetch(`/customer/websites/${websiteId}/retrain`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!res.ok) {
      statusEl.innerHTML = `<div class="alert alert-error">${escHtml(data.detail || 'Error')}</div>`;
      return;
    }

    statusEl.innerHTML = `<div class="alert alert-success">Retraining started (job #${data.job_id}). This runs in the background — check back in a few minutes.</div>`;
  } catch {
    statusEl.innerHTML = '<div class="alert alert-error">Network error.</div>';
  }
}

// ── Billing ───────────────────────────────────────────────────────────────────

async function loadBilling() {
  const section = document.getElementById('billingSection');
  try {
    const res = await apiFetch('/customer/billing');
    const data = await res.json();
    const sub = data.subscription;

    let planPill = '';
    if (sub.status === 'active') planPill = `<span class="pill pill-green">Active</span>`;
    else if (sub.status === 'trialing') planPill = `<span class="pill pill-teal">Trialing</span>`;
    else if (sub.status === 'past_due') planPill = `<span class="pill pill-orange">Past due</span>`;
    else planPill = `<span class="pill pill-muted">No plan</span>`;

    const planName = sub.plan
      ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)
      : 'Free';

    const used = sub.conversations_used ?? 0;
    const limit = sub.conversation_limit;
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const fillClass = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';

    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end).toLocaleDateString()
      : '—';

    section.innerHTML = `
      <div class="plan-display">
        <span class="plan-name">${escHtml(planName)}</span>
        ${planPill}
        ${sub.current_period_end ? `<span style="font-size:0.78rem;color:var(--text-muted)">Renews ${periodEnd}</span>` : ''}
      </div>

      ${limit ? `
      <div class="usage-bar-wrap">
        <div class="usage-bar-label">
          <span>Conversations this period</span>
          <span>${used} / ${limit}</span>
        </div>
        <div class="usage-bar-track">
          <div class="usage-bar-fill ${fillClass}" style="width:${pct}%"></div>
        </div>
      </div>` : `
      <p style="font-size:0.85rem;color:var(--text-dim);margin-bottom:16px;">Conversations this period: <strong>${used}</strong></p>`}

      ${data.billing_portal_url ? `
      <a class="btn-ghost" href="${escHtml(data.billing_portal_url)}" target="_blank" rel="noopener">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        Manage billing &amp; invoices
      </a>` : `
      <p style="font-size:0.82rem;color:var(--text-muted)">No Stripe account linked. Contact support to manage your subscription.</p>`}`;

  } catch {
    section.innerHTML = '<div class="alert alert-error">Failed to load billing info.</div>';
  }
}

// ── Account ───────────────────────────────────────────────────────────────────

async function saveAccount(e) {
  e.preventDefault();
  const btn = document.getElementById('saveAccountBtn');
  const errMsg = document.getElementById('accountErr');
  const successMsg = document.getElementById('accountSuccess');
  errMsg.textContent = '';
  successMsg.textContent = '';

  const currentPw = document.getElementById('currentPw').value;
  const newEmail = document.getElementById('newEmail').value.trim();
  const newPw = document.getElementById('newPw').value;
  const confirmPw = document.getElementById('confirmPw').value;

  if (!currentPw) { errMsg.textContent = 'Current password is required'; return; }
  if (newPw && newPw !== confirmPw) { errMsg.textContent = 'New passwords do not match'; return; }

  const payload = { current_password: currentPw };
  if (newEmail) payload.new_email = newEmail;
  if (newPw) payload.new_password = newPw;

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const res = await apiFetch('/customer/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) { errMsg.textContent = data.detail || 'Update failed'; return; }

    // Update token with new one (email may have changed)
    localStorage.setItem('customer_token', data.access_token);
    document.getElementById('customerEmail').textContent = data.email;
    document.getElementById('newEmail').value = '';
    document.getElementById('currentPw').value = '';
    document.getElementById('newPw').value = '';
    document.getElementById('confirmPw').value = '';
    successMsg.textContent = 'Account updated successfully.';
  } catch {
    errMsg.textContent = 'Network error.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

// ── Delete Account ───────────────────────────────────────────────────────────

function openDeleteModal() {
  const modal = document.getElementById('deleteModal');
  modal.style.display = 'flex';
  document.getElementById('deletePw').value = '';
  document.getElementById('deleteErr').textContent = '';
  document.getElementById('confirmDeleteBtn').disabled = false;
  document.getElementById('confirmDeleteBtn').textContent = 'Delete permanently';
  setTimeout(() => document.getElementById('deletePw').focus(), 50);
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
}

async function confirmDelete() {
  const btn = document.getElementById('confirmDeleteBtn');
  const errMsg = document.getElementById('deleteErr');
  const password = document.getElementById('deletePw').value;

  errMsg.textContent = '';
  if (!password) { errMsg.textContent = 'Password is required'; return; }

  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const res = await apiFetch('/customer/me', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errMsg.textContent = data.detail || 'Deletion failed';
      return;
    }

    localStorage.removeItem('customer_token');
    window.location.href = '/';
  } catch {
    errMsg.textContent = 'Network error — please try again';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Delete permanently';
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
