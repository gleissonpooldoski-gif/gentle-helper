import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/ml/probe')({
  server: {
    handlers: {
      GET: async () => {
        const url = 'https://api.mercadolibre.com/sites/MLB/categories'
        try {
          const res = await fetch(url)
          const headers: Record<string, string> = {}
          res.headers.forEach((v, k) => { headers[k] = v })
          const body = await res.text()
          const log = {
            url,
            status: res.status,
            headers,
            bodySnippet: body.slice(0, 2000),
          }
          console.log('[ML][PROBE]', JSON.stringify(log))
          return new Response(JSON.stringify(log, null, 2), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        } catch (err) {
          const log = { url, error: String(err) }
          console.log('[ML][PROBE][ERROR]', JSON.stringify(log))
          return new Response(JSON.stringify(log, null, 2), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        }
      },
    },
  },
})
