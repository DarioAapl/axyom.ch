const API = "https://backend-still-river-1228.fly.dev";

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const error = document.getElementById("loginError");

  error.textContent = "";

  if (!email || !password) {
    error.textContent = "Email and password required";
    return;
  }

  const res = await fetch(`${API}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    error.textContent = data.detail || "Login failed";
    return;
  }

  localStorage.setItem("admin_token", data.access_token);
  localStorage.setItem("admin_email", email);

  window.location.href = "dashboard.html";
}