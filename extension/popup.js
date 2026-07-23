const $ = (id) => document.getElementById(id);
const log = (...a) => console.log("[WA EXT]", ...a);

function browserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["browser_id"], (r) => {
      if (r && r.browser_id) return resolve(r.browser_id);
      const id = "bx_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      chrome.storage.local.set({ browser_id: id }, () => resolve(id));
    });
  });
}

function setStatus(msg, kind) {
  const el = $("status");
  el.style.display = "block";
  el.className = "status" + (kind ? " " + kind : "");
  el.textContent = msg;
}

async function checkWhatsApp() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (tabs && tabs.length > 0) {
      $("waStatus").textContent = "WhatsApp Web: aberto";
      log("Sessão WhatsApp ativa");
    } else {
      $("waStatus").textContent = "WhatsApp Web: fechado";
    }
  } catch (e) {
    $("waStatus").textContent = "WhatsApp Web: indisponível";
  }
}

async function loadDefaults() {
  chrome.storage.local.get(["api_base", "connected", "session_id", "connected_at"], (r) => {
    if (r.api_base) $("apiBase").value = r.api_base;
    else $("apiBase").value = "https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app";
    if (r.connected && r.session_id) {
      setStatus(`Já conectado à sessão ${r.session_id}`, "ok");
    }
  });
}

$("connect").addEventListener("click", async () => {
  const raw = $("token").value.trim();
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  if (!raw) return setStatus("Cole o token gerado no painel.", "err");
  if (!apiBase) return setStatus("Informe a URL do servidor.", "err");

  // Accept legacy "<token>|<channelId>" pasted format — keep only the token part.
  const token = raw.includes("|") ? raw.split("|")[0].trim() : raw;

  const bId = await browserId();
  const body = { token, browser_id: bId };

  $("connect").disabled = true;
  setStatus("Conectando…");
  log("Token enviado", { api: apiBase });

  try {
    const res = await fetch(`${apiBase}/api/public/whatsapp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      setStatus(`Falha: ${msg}`, "err");
      log("Falha ao conectar", msg);
      return;
    }
    await new Promise((r) =>
      chrome.storage.local.set(
        {
          connected: true,
          session_id: data.session_id,
          connected_at: data.connected_at,
          api_base: apiBase,
        },
        r,
      ),
    );
    setStatus(`Sessão conectada: ${data.session_id}`, "ok");
    log("Sessão conectada", data.session_id);
  } catch (e) {
    setStatus(`Erro de rede: ${e?.message || e}`, "err");
    log("Erro de rede", e);
  } finally {
    $("connect").disabled = false;
  }
});

loadDefaults();
checkWhatsApp();
