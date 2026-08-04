#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# Cloudflare Quick Tunnel Watcher
#
# Detecta automaticamente a URL trycloudflare.com gerada pelo cloudflared e
# envia para o SaaS, que atualiza o banco e ressincroniza os webhooks.
#
# Requisitos: docker CLI + curl (imagem sugerida: docker:cli).
#
# Variáveis de ambiente:
#   APP_URL        URL pública do SaaS (ex.: https://sunny-friend-factory.lovable.app)
#   CRON_SECRET    mesmo valor do secret CRON_SECRET no SaaS
#   TUNNEL_CONTAINER  nome do container cloudflared (default: cloudflared)
#   CHECK_INTERVAL    segundos entre verificações (default: 15)
# ---------------------------------------------------------------------------
set -eu

APP_URL="${APP_URL:?defina APP_URL}"
CRON_SECRET="${CRON_SECRET:?defina CRON_SECRET}"
TUNNEL_CONTAINER="${TUNNEL_CONTAINER:-cloudflared}"
CHECK_INTERVAL="${CHECK_INTERVAL:-15}"

LAST_URL=""

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

detect_url() {
  # A URL aparece no stderr do cloudflared logo após o start do quick tunnel.
  docker logs --tail 500 "$TUNNEL_CONTAINER" 2>&1 \
    | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' \
    | tail -n 1
}

push_url() {
  url="$1"
  # O secret vai apenas no header; nunca é impresso em log.
  code=$(curl -s -o /tmp/tunnel-watcher-resp.json -w '%{http_code}' \
    --max-time 45 \
    -X POST "$APP_URL/api/public/hooks/tunnel-url" \
    -H 'Content-Type: application/json' \
    -H "x-cron-secret: $CRON_SECRET" \
    -d "{\"url\":\"$url\"}") || code=000
  log "[TUNNEL] push $url -> HTTP $code"
  if [ "$code" = "200" ]; then
    log "[EVOLUTION] URL atualizada no SaaS"
    return 0
  fi
  log "[TUNNEL] falha ao sincronizar (HTTP $code): $(head -c 300 /tmp/tunnel-watcher-resp.json 2>/dev/null || true)"
  return 1
}

log "watcher iniciado (container=$TUNNEL_CONTAINER, intervalo=${CHECK_INTERVAL}s)"

while true; do
  URL="$(detect_url || true)"
  if [ -n "$URL" ] && [ "$URL" != "$LAST_URL" ]; then
    log "[TUNNEL] Nova URL detectada: $URL"
    if push_url "$URL"; then
      LAST_URL="$URL"
      log "[HEALTH] Sistema online"
    fi
  fi
  sleep "$CHECK_INTERVAL"
done
