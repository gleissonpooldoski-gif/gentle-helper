document.getElementById('btnTest').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://web.whatsapp.com')) {
    alert('Abra o WhatsApp Web nesta aba primeiro.');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (response) => {
    if (chrome.runtime.lastError) {
      alert('Erro: ' + chrome.runtime.lastError.message);
      return;
    }
    alert(response?.ok ? 'Conexão OK com o WhatsApp Web.' : 'Sem resposta do content script.');
  });
});
