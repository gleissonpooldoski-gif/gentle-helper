// Detects WhatsApp Web presence and reports readiness to the extension.
(function () {
  const log = (...a) => console.log("[WA EXT]", ...a);
  log("content script carregado em web.whatsapp.com");

  const check = () => {
    const hasApp = document.querySelector('#app, [data-testid="chat-list"], [data-testid="intro-md-beta-logo-dark"], [data-testid="intro-md-beta-logo-light"]');
    if (hasApp) {
      log("Sessão WhatsApp ativa");
      try {
        chrome.runtime.sendMessage({ type: "wa:active" });
      } catch {}
      return true;
    }
    return false;
  };

  if (!check()) {
    const iv = setInterval(() => {
      if (check()) clearInterval(iv);
    }, 2000);
    setTimeout(() => clearInterval(iv), 60000);
  }
})();
