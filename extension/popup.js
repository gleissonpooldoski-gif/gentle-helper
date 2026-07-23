document.getElementById('trigger').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Enviando comando para a aba do WhatsApp...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://web.whatsapp.com')) {
    status.textContent = 'Abra o WhatsApp Web nesta aba primeiro.';
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    { type: 'DISPATCH_QUEUE' },
    (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = 'Erro: ' + chrome.runtime.lastError.message;
        return;
      }
      status.textContent = response?.ok ? 'Fila disparada com sucesso.' : 'Falha no disparo.';
    },
  );
});
