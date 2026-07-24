/**
 * WhatsAppProvider — interface desacoplada para provedores de WhatsApp.
 * Trocar de provedor no futuro só requer uma nova implementação desta interface.
 */

export type WhatsAppInstanceStatus =
  | "creating"
  | "awaiting_qr"
  | "connecting"
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

export interface WhatsAppGroup {
  jid: string;
  name: string;
  participants: number | null;
  pictureUrl: string | null;
}

export interface WhatsAppProvider {
  readonly name: string;
  createInstance(input: {
    instanceName: string;
    webhookUrl?: string;
  }): Promise<WhatsAppProviderStatus>;
  reconnect(instanceName: string): Promise<WhatsAppProviderStatus>;
  getStatus(instanceName: string): Promise<WhatsAppProviderStatus>;
  disconnect(instanceName: string): Promise<void>;
  deleteInstance(instanceName: string): Promise<void>;
  fetchGroups(instanceName: string): Promise<WhatsAppGroup[]>;
  sendText(instanceName: string, jid: string, text: string): Promise<{ id?: string }>;
  sendMedia(
    instanceName: string,
    jid: string,
    input: { mediaUrl: string; caption: string; fileName?: string },
  ): Promise<{ id?: string }>;
}
