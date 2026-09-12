# Estabilização definitiva do WhatsApp

## Objetivo
Eliminar quedas recorrentes entre Cloudflare Quick Tunnel e Evolution API, recuperar sessões travadas automaticamente e manter o envio protegido contra duplicidade.

## Correções
1. **Origem do túnel**
   - Padronizar o túnel para apontar ao serviço Evolution correto dentro do Docker, sem depender de `127.0.0.1:8081`.
   - Fazer o Cloudflare aguardar a Evolution ficar saudável antes de iniciar.
   - Adicionar verificação de saúde e reinício automático do túnel quando a origem parar de responder.

2. **Watcher resiliente**
   - Verificar continuamente container, origem e URL pública.
   - Detectar mudança de URL mesmo após reinícios e sincronizá-la novamente com o SaaS.
   - Evitar considerar a URL sincronizada quando ela deixou de responder.

3. **Cliente Evolution**
   - Separar timeout de consultas rápidas e operações lentas de grupos.
   - Tratar cancelamentos de transporte como falha transitória sem marcar a sessão como desconectada.
   - Reiniciar a sessão somente para `Connection Closed`, com espera e confirmação do estado antes da nova tentativa.

4. **Health check e recuperação**
   - Usar o cliente central em todas as verificações, evitando chamadas concorrentes com timeouts diferentes.
   - Registrar falhas consecutivas e só degradar o estado após confirmação, reduzindo falsos alarmes.

5. **Validação**
   - Testes do túnel, timeout, `Connection Closed` e recuperação.
   - Verificação das instâncias atuais e do endpoint de grupos.
   - Confirmar que nenhum retry adicional foi introduzido no envio real de mensagens.

## Observação técnica
O log `Incoming request ended abruptly: context canceled` indica que uma chamada foi encerrada antes da resposta da origem. O ponto mais importante é que o túnel em execução está apontando para `http://127.0.0.1:8081`, enquanto a configuração versionada usa a rede Docker e `http://evolution_api:8080`; a correção elimina essa configuração divergente.
