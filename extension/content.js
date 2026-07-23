// Detects WhatsApp Web state (QR shown vs authenticated) and reports to backend.
(function () {
  const log = (...a) => console.log("[WA EXT]", ...a);
  log("content script carregado em web.whatsapp.com");

  const state = { qrSeen: false, authSent: false, disconnectedSent: false };

  function getContext() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["channel_id", "api_base", "connected_at"], (r) => resolve(r || {}));
    });
  }

  async function post(status, extra = {}) {
    const ctx = await getContext();
    if (!ctx.channel_id || !ctx.api_base) {
      log("sem canal/api salvos ainda; ignorando envio", status);
      return false;
    }
    const body = {
      channel_id: ctx.channel_id,
      status,
      phone_number: extra.phone_number || null,
      session_id: extra.session_id || null,
      timestamp: Date.now(),
    };
    try {
      log("Enviando status para backend", body);
      const res = await fetch(`${ctx.api_base}/api/public/channels/whatsapp/session-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        log("Falha ao enviar status", res.status, data);
        return false;
      }
      log("Status confirmado pelo backend", data.status);
      return true;
    } catch (e) {
      log("Erro de rede ao enviar status", e?.message || e);
      return false;
    }
  }

  function extractPhone() {
    // Try common WhatsApp Web selectors for the user's own number/name.
    try {
      const candidates = [
        document.querySelector('header [data-testid="default-user"]')?.getAttribute('aria-label'),
        document.querySelector('header span[title]')?.getAttribute('title'),
      ].filter(Boolean);
      return candidates[0] || null;
    } catch {
      return null;
    }
  }

  function detectQr() {
    const qr = document.querySelector('canvas[aria-label*="QR" i], canvas[aria-label*="Scan" i], div[data-ref] canvas, div[data-testid="qrcode"]');
    return Boolean(qr);
  }

  function detectAuthenticated() {
    // Presence of the chat pane / side list is a good proxy for authenticated state.
    const el = document.querySelector('[data-testid="chat-list"], #pane-side, [data-testid="chatlist-header"]');
    return Boolean(el);
  }

  async function tick() {
    if (detectQr() && !state.qrSeen) {
      state.qrSeen = true;
      log("QR detectado");
      await post("pending");
    }
    if (detectAuthenticated()) {
      if (!state.authSent) {
        state.authSent = true;
        state.disconnectedSent = false;
        log("Sessão autenticada");
        const phone = extractPhone();
        const ok = await post("connected", { phone_number: phone, session_id: "wa-web" });
        if (ok) {
          chrome.storage.local.set({ connected: true, connected_at: new Date().toISOString() });
        }
      }
    } else if (state.authSent && detectQr()) {
      // We had a session but now see the QR again -> disconnected
      if (!state.disconnectedSent) {
        state.disconnectedSent = true;
        state.authSent = false;
        log("Sessão encerrada");
        await post("disconnected");
        chrome.storage.local.set({ connected: false });
      }
    }
  }

  const iv = setInterval(tick, 3000);
  setTimeout(tick, 1500);
  // Also stop polling after 30 min of no activity to save CPU
  setTimeout(() => clearInterval(iv), 30 * 60 * 1000);
})();
