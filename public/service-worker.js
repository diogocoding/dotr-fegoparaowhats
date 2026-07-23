// Service worker do SDR Reheat.
//
// IMPORTANTE: este painel mostra dados de leads que mudam o tempo todo no
// Kommo. Por isso o cache aqui é só do "shell" estático (HTML/CSS/JS/ícones),
// pra abrir rápido e funcionar como app instalado — as chamadas de API
// (para o backend no Render) NUNCA são cacheadas, sempre vão direto pra rede,
// pra nunca mostrar leads desatualizados.

const CACHE_VERSION = "sdr-reheat-shell-v1";
const ARQUIVOS_DO_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ARQUIVOS_DO_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_VERSION)
          .map((chave) => caches.delete(chave))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só mexe em pedidos GET de dentro do próprio site (mesma origem). Qualquer
  // chamada pro backend do Render (outra origem, /api/..., /v/...) passa
  // direto pela rede, sem interceptação — dado de lead nunca fica em cache.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((respostaEmCache) => {
      if (respostaEmCache) return respostaEmCache;
      return fetch(request).then((respostaDaRede) => {
        // Guarda uma cópia no cache do shell pra próxima vez, mas só de
        // arquivos estáticos do próprio site.
        const copia = respostaDaRede.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copia));
        return respostaDaRede;
      });
    })
  );
});
