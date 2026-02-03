const API = "https://backend-still-river-1228.fly.dev";

/* ============================
   AUTH HELPERS
============================ */
function getToken() {
  return localStorage.getItem("admin_token");
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`
  };
}

function logout() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_email");
  window.location.href = "admin.html";
}

/* ============================
   INIT (PROTECT PAGE)
============================ */
(async function init() {
  if (!getToken()) return logout();

  const test = await fetch(`${API}/admin/customers`, {
    headers: authHeaders(),
  });

  if (!test.ok) return logout();

  document.getElementById("adminEmail").textContent =
    localStorage.getItem("admin_email");

  await loadCustomers();
  await loadKeys();
  await loadWebsites();
})();

/* ============================
   CUSTOMERS
============================ */
async function loadCustomers() {
  const res = await fetch(`${API}/admin/customers`, {
    headers: authHeaders(),
  });
  const data = await res.json();

  document.getElementById("statCustomers").textContent = data.length;

  const tbody = document.getElementById("customersTable");
  tbody.innerHTML = "";

  data.forEach(c => {
    tbody.innerHTML += `
      <tr>
        <td>${c.id}</td>
        <td>${c.email}</td>
        <td>${c.is_active ? "Active" : "Disabled"}</td>
        <td>${new Date(c.created_at).toLocaleString()}</td>
      </tr>
    `;
  });
}

/* ============================
   API KEYS
============================ */
async function loadKeys() {
  const res = await fetch(`${API}/admin/keys`, {
    headers: authHeaders(),
  });
  const data = await res.json();

  document.getElementById("statKeys").textContent = data.length;

  const tbody = document.getElementById("keysTable");
  tbody.innerHTML = "";

  data.forEach(k => {
    tbody.innerHTML += `
      <tr>
        <td>${k.id}</td>
        <td class="mono">${k.key}</td>
        <td>${k.website_id}</td>
        <td>${k.is_active ? "Active" : "Revoked"}</td>
        <td>${new Date(k.created_at).toLocaleString()}</td>
      </tr>
    `;
  });
}

/* ============================
   WEBSITES
============================ */
async function loadWebsites() {
  const res = await fetch(`${API}/admin/websites`, {
    headers: authHeaders(),
  });

  const websites = await res.json();
  const table = document.getElementById("websitesTable");
  table.innerHTML = "";

  websites.forEach(w => {
    const analysis = w.analysis;

    let verdictBadge = `<span class="pill muted">Not analyzed</span>`;
    let actionBtn = `
      <button class="btn small" onclick="analyzeWebsite(${w.id})">
        Analyze
      </button>
    `;

    if (analysis) {
      const color =
        analysis.verdict === "ok" ? "green" :
        analysis.verdict === "too_big" ? "red" :
        analysis.verdict === "too_small" ? "orange" :
        "gray";

      verdictBadge = `
        <span class="pill ${color}">
          ${analysis.verdict.toUpperCase()}
        </span>
      `;

      if (analysis.verdict === "ok") {
        actionBtn = `
          <button class="btn primary small" onclick="trainWebsite(${w.id})">
            Train
          </button>
        `;
      } else {
        actionBtn = `
          <button class="btn ghost small" onclick="trainWebsite(${w.id}, true)">
            Force Train
          </button>
        `;
      }
    }

    table.innerHTML += `
      <tr>
        <td>${w.id}</td>
        <td>${w.domain}</td>
        <td>${verdictBadge}</td>
        <td>
          ${analysis ? `
            <div class="meta">
              ${analysis.estimated_pages} pages ·
              ${analysis.estimated_chunks} chunks
            </div>
          ` : `<span class="muted">—</span>`}
        </td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });
}

/* ============================
   TRAIN WEBSITE
============================ */
async function trainWebsite(id) {
  if (!confirm("Train this website now?")) return;

  const res = await fetch(`${API}/admin/websites/${id}/train`, {
    method: "POST",
    headers: authHeaders(),
  });

  if (!res.ok) {
    alert("Training failed");
    return;
  }

  alert("Website trained");
  loadWebsites();
}




/* ============================
   ANALYZE WEBSITE
============================ */
async function analyzeWebsite(id) {
  if (!confirm("Analyze this website first?")) return;

  const res = await fetch(`${API}/admin/websites/${id}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const err = await res.text();
    alert("Analyze failed: " + err);
    return;
  }

  alert("Analysis completed");
  loadWebsites();
}

async function trainWebsite(id, force = false) {
  const msg = force
    ? "Force training despite warnings?"
    : "Train this website now?";

  if (!confirm(msg)) return;

  const res = await fetch(`${API}/admin/websites/${id}/train`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ force }),
  });

  if (!res.ok) {
    const err = await res.text();
    alert("Training blocked: " + err);
    return;
  }

  alert("Website trained");
  loadWebsites();
}



/* ============================
   CREATE KEY
============================ */
async function createKey() {
  const email = document.getElementById("newEmail").value.trim();
  const domain = document.getElementById("newDomain").value.trim();

  if (!domain) return alert("Domain required");

  await fetch(`${API}/admin/create-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ email, domain }),
  });

  document.getElementById("createKeyMsg").textContent = "API key created";
  document.getElementById("newDomain").value = "";
  loadKeys();
}