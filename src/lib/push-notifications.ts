import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

/**
 * 서비스 워커 등록 및 푸시 알림 구독 전체 흐름
 */
export const initPushNotifications = async (userId: string): Promise<boolean> => {
  try {
    // 1. 브라우저 지원 확인
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('이 브라우저는 푸시 알림을 지원하지 않습니다.');
      return false;
    }

    // 2. 알림 권한 요청
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('알림 권한이 거부됐습니다.');
      return false;
    }

    // 3. 서비스 워커 등록
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 4. 기존 구독 확인 또는 신규 구독
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
      });
    }

    // 5. Supabase에 구독 정보 저장 (upsert)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert([{
        user_id: userId,
        subscription: subscription.toJSON(),
        updated_at: new Date().toISOString(),
      }], { onConflict: 'user_id' });

    if (error) {
      console.error('구독 저장 실패:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('푸시 알림 초기화 실패:', error);
    return false;
  }
};

/**
 * 푸시 구독 해제
 */
export const unsubscribePush = async (userId: string): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }

    // DB에서도 삭제
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId);

    return true;
  } catch (error) {
    console.error('구독 해제 실패:', error);
    return false;
  }
};

/**
 * 현재 알림 권한 상태 확인
 */
export const getNotificationStatus = (): NotificationPermission | 'unsupported' => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

// VAPID 공개키 변환 유틸리티
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
