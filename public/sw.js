// MUtang Service Worker - PWA Offline Caching and Push Notifications

const CACHE_NAME = 'mutang-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/android-192.png',
  '/android-512.png',
  '/apple-touch-icon.png'
];

// 설치 이벤트 - 정적 에셋 캐싱
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 활성화 이벤트 - 구버전 캐시 삭제
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return clients.claim();
    })
  );
});

// fetch 이벤트 - PWA 오프라인 작동 요건 (Lighthouse PWA 필수 조건)
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // API나 Supabase 데이터 조회, 웹훅 등은 캐시 대상에서 배제
  if (event.request.url.includes('/api/') || event.request.url.includes('/supabase/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // 방문 페이지 동적 캐싱
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(function() {
        // 네트워크 실패 시 동작
      });
    })
  );
});

// 푸시 알림 수신
self.addEventListener('push', function(event) {
  let data = { title: 'MUtang 알림', body: '새로운 알림이 있습니다.' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message,
    icon: '/android-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'mutang-due-reminder',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/debts',
      loanId: data.loanId || null
    },
    actions: [
      { action: 'view', title: '확인하기' },
      { action: 'dismiss', title: '닫기' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/debts';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

