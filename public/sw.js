const CACHE_NAME = 'grafica-vendas-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-512.png'
];

// Instala o service worker e faz o cache dos recursos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA Service Worker] Guardando ativos estáticos no cache...');
      // Executa de forma resiliente para evitar rejeições se algum recurso falhar temporariamente
      return Promise.all(
        ASSETS_TO_CACHE.map((asset) => {
          return cache.add(asset).catch((err) => {
            console.warn(`[PWA Service Worker] Falha ao cachear ativo resiliente: ${asset}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Ativa o service worker e limpa caches obsoletos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[PWA Service Worker] Excluindo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptador de requisições inteligentes (ignora chamadas live do Supabase/API e ambiente dev)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // IMPORTANTE: Nunca interceptar ou cachear requisições de desenvolvimento local ou caminhos contendo '/src/'
  if (
    url.pathname.includes('/src/') ||
    url.pathname.startsWith('/src') ||
    url.pathname.includes('node_modules') ||
    url.pathname.includes('@vite') ||
    url.pathname.includes('@react-refresh') ||
    url.searchParams.has('t') ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.port === '3000' ||
    url.pathname.includes('/api/') || 
    url.hostname.includes('supabase.co') || 
    request.method !== 'GET'
  ) {
    return; // Passa direto para a rede sem bloquear nem interceptar
  }

  // 1. Estratégia Network-First para navegação (index.html) para evitar cache antigo travando com tela branca
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback offline se a rede falhar
          return caches.match('/index.html') || caches.match('/') || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // 2. Estratégia Cache-First para ativos de mídia e outros recursos estáticos normais
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retorna do cache se existir
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        // Coloca dinamicamente novos estáticos seguros no cache
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          networkResponse.type === 'basic' &&
          !url.pathname.endsWith('.ts') &&
          !url.pathname.endsWith('.tsx')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback robusto se estiver totalmente sem internet - sempre retornar um objeto Response válido
        if (request.mode === 'navigate') {
          return caches.match('/index.html') || Response.error();
        }
        return Response.error();
      });
    })
  );
});
