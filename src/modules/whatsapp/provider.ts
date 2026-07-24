/**
 * WhatsAppProvider — interface desacoplada para provedores de WhatsApp.
 * Trocar de provedor no futuro só requer uma nova implementação desta interface.
 */

export type WhatsAppInstanceStatus =
  | "creating"
  | "awaiting_qr"
  | "connected"
  | "disconnected"
  | "error";

export interface WhatsAppQRCode {
  /** Imagem base64 (data URL) do QR Code, quando disponível. */
  base64: string | null;
  /** Código pareamento em texto (fallback). */
  code: string | null;
}

export interface WhatsAppProviderStatus {
  status: WhatsAppInstanceStatus;
  phone: string | null;
  qr: WhatsAppQRCode | null;
}

export interface WhatsAppProvider {
  readonly name: string;
  /** Cria (ou reutiliza) uma instância remota. Retorna já o QR inicial se possível. */
  createInstance(input: {
    instanceName: string;
    webhookUrl?: string;
  }): Promise<WhatsAppProviderStatus>;
  /** Solicita novo QR ou reconecta. */
  reconnect(instanceName: string): Promise<WhatsAppProviderStatus>;
  /** Consulta status atual. */
  getStatus(instanceName: string): Promise<WhatsAppProviderStatus>;
  /** Desconecta a sessão (mantém instância). */
  disconnect(instanceName: string): Promise<void>;
  /** Remove a instância completamente. */
  deleteInstance(instanceName: string): Promise<void>;
}
