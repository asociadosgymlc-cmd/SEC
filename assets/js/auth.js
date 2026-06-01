/* LICITA · Autenticación y gestión de usuarios
 *
 * Sistema simple cliente-side: usuarios con rol (admin · cliente),
 * contraseñas hasheadas con SHA-256 vía Web Crypto. El admin gestiona
 * los clientes; cada cliente accede con sus credenciales.
 *
 * Nota: al ser una app sin backend, esto es una compuerta de acceso, no
 * cifrado de extremo a extremo. No almacene información altamente
 * sensible aquí sin un servidor de respaldo.
 */
window.LICITA = window.LICITA || {};

LICITA.auth = (function () {
  "use strict";

  const LS_USERS = "licita.users.v1";
  const LS_SESSION = "licita.session.v1";

  // SHA-256 de "licita2026" — credencial por defecto del administrador.
  const DEFAULT_ADMIN_HASH =
    "88f124b3b784959b8cc5b6136515711510ea644af046f3a11c93e64977e89bcf";

  let current = null;
  let users = [];

  /* ---------------------- helpers ---------------------- */

  async function sha256(text) {
    const buf = new TextEncoder().encode(String(text));
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_USERS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(LS_USERS, JSON.stringify(users));
    } catch (e) {
      /* sin almacenamiento */
    }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function persistSession(s) {
    try {
      if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
      else localStorage.removeItem(LS_SESSION);
    } catch (e) {}
  }

  function newId() {
    return "u_" + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------------- semilla ---------------------- */

  function seedAdmin() {
    return {
      id: "u_admin",
      username: "admin",
      passwordHash: DEFAULT_ADMIN_HASH,
      role: "admin",
      name: "Luis Carlos Gómez",
      email: "asociadosgym.lc@gmail.com",
      organization: "Asociados GYM LC",
      plan: "premium",
      planExpira: null,
      active: true,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      mustChangePassword: true,
      notes: "Administrador principal. Cambia esta contraseña en el panel de Clientes.",
    };
  }

  function init() {
    users = load();
    if (!users || !users.length) {
      users = [seedAdmin()];
      persist();
    } else if (!users.some((u) => u.role === "admin")) {
      users.unshift(seedAdmin());
      persist();
    }
    const s = loadSession();
    if (s) current = users.find((u) => u.id === s.userId && u.active) || null;
    return current;
  }

  /* ---------------------- API público ---------------------- */

  async function login(username, password) {
    const u = users.find(
      (x) =>
        x.active &&
        x.username.toLowerCase() === String(username).trim().toLowerCase()
    );
    if (!u) return { ok: false, error: "Usuario o contraseña incorrectos." };
    const h = await sha256(password);
    if (h !== u.passwordHash)
      return { ok: false, error: "Usuario o contraseña incorrectos." };
    u.lastLogin = new Date().toISOString();
    persist();
    current = u;
    persistSession({ userId: u.id, since: u.lastLogin });
    return { ok: true, user: u };
  }

  function logout() {
    current = null;
    persistSession(null);
  }

  function currentUser() {
    return current;
  }

  function isAdmin() {
    return !!(current && current.role === "admin");
  }

  function isPremium() {
    if (!current) return false;
    if (current.role === "admin") return true;
    if (current.plan !== "premium") return false;
    if (current.planExpira && new Date(current.planExpira) < new Date()) return false;
    return true;
  }

  function listUsers() {
    return users.slice();
  }

  function getUser(id) {
    return users.find((u) => u.id === id) || null;
  }

  async function createUser(data) {
    if (!isAdmin()) throw new Error("Solo el administrador puede crear usuarios.");
    const username = String(data.username || "").trim();
    if (!username) throw new Error("El usuario es obligatorio.");
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
      throw new Error("Ya existe un usuario con ese nombre.");
    const password = String(data.password || "").trim();
    if (password.length < 6)
      throw new Error("La contraseña debe tener al menos 6 caracteres.");
    const u = {
      id: newId(),
      username,
      passwordHash: await sha256(password),
      role: data.role === "admin" ? "admin" : "client",
      name: String(data.name || "").trim() || username,
      email: String(data.email || "").trim(),
      organization: String(data.organization || "").trim(),
      plan: data.plan === "premium" ? "premium" : "free",
      planExpira: data.planExpira || null,
      active: true,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      mustChangePassword: false,
      notes: String(data.notes || "").trim(),
    };
    users.push(u);
    persist();
    return u;
  }

  async function updateUser(id, patch) {
    if (!isAdmin() && (!current || current.id !== id))
      throw new Error("No autorizado.");
    const u = users.find((x) => x.id === id);
    if (!u) throw new Error("Usuario no encontrado.");
    if (patch.username) {
      const nu = String(patch.username).trim();
      if (
        users.some(
          (x) => x.id !== id && x.username.toLowerCase() === nu.toLowerCase()
        )
      )
        throw new Error("Ya existe un usuario con ese nombre.");
      u.username = nu;
    }
    ["name", "email", "organization", "notes"].forEach((k) => {
      if (typeof patch[k] === "string") u[k] = patch[k].trim();
    });
    if (typeof patch.active === "boolean" && isAdmin()) u.active = patch.active;
    if (patch.role && isAdmin()) u.role = patch.role === "admin" ? "admin" : "client";
    if (patch.plan && isAdmin()) {
      u.plan = patch.plan === "premium" ? "premium" : "free";
      if (typeof patch.planExpira !== "undefined") u.planExpira = patch.planExpira;
    }
    if (patch.password) {
      const p = String(patch.password).trim();
      if (p.length < 6)
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
      u.passwordHash = await sha256(p);
      u.mustChangePassword = false;
    }
    persist();
    return u;
  }

  function deleteUser(id) {
    if (!isAdmin()) throw new Error("No autorizado.");
    const u = users.find((x) => x.id === id);
    if (!u) return;
    if (u.role === "admin" && users.filter((x) => x.role === "admin").length <= 1)
      throw new Error("Debe existir al menos un administrador.");
    users = users.filter((x) => x.id !== id);
    persist();
  }

  return {
    init,
    login,
    logout,
    currentUser,
    isAdmin,
    isPremium,
    listUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    sha256,
  };
})();
