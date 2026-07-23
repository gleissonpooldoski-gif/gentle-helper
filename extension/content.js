// Content script executado dentro de https://web.whatsapp.com/*

async function sendWhatsAppMessage({ groupJid, messageText, delayMs = 3000 }) {
  console.log(`[Anti-SPAM] Aguardando ${delayMs}ms para ${groupJid}...`);
  await new Promise((r) => setTimeout(r, delayMs));

  const chatInput = document.querySelector('div[contenteditable="true"][data-tab="10"]');
  if (!chatInput) throw new Error('Campo de texto não encontrado — abra o chat primeiro.');

  chatInput.focus();
  document.execCommand('insertText', false, messageText);
  await new Promise((r) => setTimeout(r, 500));

  const sendButton = document.querySelector('span[data-icon="send"]');
  if (!sendButton) throw new Error('Botão de envio não localizado.');
  sendButton.click();
  return true;
}

async function processQueue() {
  const { messageQueue = [] } = await chrome.storage.local.get('messageQueue');
  if (!messageQueue.length) {
    console.log('[Queue] Vazia.');
    return { ok: false, reason: 'empty_queue' };
  }

  for (const item of messageQueue) {
    try {
      await sendWhatsAppMessage(item);
    } catch (err) {
      console.error('[Queue] falha:', err);
      return { ok: false, error: String(err) };
    }
  }

  await chrome.storage.local.set({ messageQueue: [] });
  return { ok: true, sent: messageQueue.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'DISPATCH_QUEUE') {
    processQueue().then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response
  }
  if (msg?.type === 'ENQUEUE' && Array.isArray(msg.items)) {
    chrome.storage.local.get('messageQueue').then(({ messageQueue = [] }) => {
      const next = [...messageQueue, ...msg.items];
      chrome.storage.local.set({ messageQueue: next }).then(() => sendResponse({ ok: true, size: next.length }));
    });
    return true;
  }
});

console.log('[Affiliate WhatsApp Sender] content script carregado.');
