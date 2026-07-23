export interface SendMessagePayload {
  groupJid: string;
  messageText: string;
  delayMs?: number;
}

/**
 * Simula o delay humano anti-SPAM e o envio automatizado via DOM do WhatsApp Web.
 * Este utilitário é executado dentro da extensão do Chrome, no contexto do WhatsApp Web.
 */
export async function sendWhatsAppMessage({
  groupJid,
  messageText,
  delayMs = 3000,
}: SendMessagePayload): Promise<boolean> {
  try {
    console.log(`[Anti-SPAM] Aguardando ${delayMs}ms antes do disparo para ${groupJid}...`);

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const chatInput = document.querySelector(
      'div[contenteditable="true"][data-tab="10"]',
    ) as HTMLElement | null;

    if (!chatInput) {
      throw new Error(
        'Campo de texto do WhatsApp Web não encontrado. Certifique-se de que o chat está aberto.',
      );
    }

    chatInput.focus();
    document.execCommand('insertText', false, messageText);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const sendButton = document.querySelector('span[data-icon="send"]') as HTMLElement | null;
    if (sendButton) {
      sendButton.click();
      console.log('[Sucesso] Mensagem disparada para o grupo.');
      return true;
    } else {
      throw new Error('Botão de envio não localizado.');
    }
  } catch (error) {
    console.error('[Erro no Disparo WhatsApp]:', error);
    return false;
  }
}
