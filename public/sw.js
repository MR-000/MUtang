// MUtang Service Worker - 푸시 알림 수신 처리

const CACHE_VERSION = 'mutang-v1';

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
    tag: 'mutang-due-reminder',        // 같은 태그면 덮어씀 (중복 방지)
    renotify: true,
    requireInteraction: false,           // 자동으로 사라짐
    data: {
      url: data.url || '/debts',         // 클릭 시 외상거래 페이지로 이동
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
      // 이미 열린 탭이 있으면 포커스
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // 없으면 새 탭 열기
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 설치 이벤트
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// 활성화 이벤트
self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});
