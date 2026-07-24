import type { WhatsAppProvider } from "./provider";
import { evolutionProvider } from "./evolution/provider.server";

/**
 * Fábrica de provedor WhatsApp. Trocar de provedor futuramente:
 * basta escolher outra implementação aqui.
 */
export function getWhatsAppProvider(name: string = "evolution"): WhatsAppProvider {
  switch (name) {
    case "evolution":
      return evolutionProvider;
    default:
      throw new Error(`Provedor WhatsApp desconhecido: ${name}`);
  }
}
