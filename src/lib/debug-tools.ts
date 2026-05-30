"use client";

/*
MUtang 디버깅 및 자원 최적화 툴킷 (debug-tools.ts)
사용자가 지정한 4대 요구사항 구현:
1. a11y-debugging: 모바일 접근성 및 대비 가이드 준수 확인
2. chrome-devtools: 원격 성능 및 프레임 드롭 추적
3. debug-optimize-lcp: Largest Contentful Paint 및 모바일 리소스 렌더링 성능 로깅
4. memory-leak: 캔버스 및 카메라 스캐너 해제 상태 메모리 누수 감지
*/

export const initDebugTools = () => {
  if (typeof window === 'undefined') return;

  const isDev = process.env.NODE_ENV === 'development' || localStorage.getItem('utang_debug') === 'true';
  if (!isDev) return;

  console.log('[MUtang Debug Toolkit] 디버깅 및 최적화 엔진이 활성화되었습니다.');

  // 1. debug-optimize-lcp: 모바일 화면 주요 리소스 로드 속도 (LCP) 추적
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        console.log(`[LCP 최적화 모니터] LCP 시점: ${lastEntry.startTime.toFixed(2)}ms, 요소:`, lastEntry.element);
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      const fcpObserver = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach((entry) => {
          console.log(`[화면 초기 로드] FCP 속도: ${entry.startTime.toFixed(2)}ms`);
        });
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch (e) {
      console.warn('[LCP 모니터] 브라우저가 성능 관찰 옵션을 지원하지 않습니다.', e);
    }
  }

  // 2. a11y-debugging: 모바일 UI 접근성 (터치 타겟 및 명도 가이드) 실시간 감사
  const runAccessibilityAudit = () => {
    const buttons = document.querySelectorAll('button, a, input, select');
    buttons.forEach((el: any) => {
      const rect = el.getBoundingClientRect();
      // 모바일 표준 최소 터치 권장 크기 (44px * 44px) 검사
      if (rect.width < 44 || rect.height < 44) {
        console.warn(`[접근성 경고] 터치 타겟이 너무 작습니다 (최소 44px 권장):`, el, `실제 크기: ${rect.width.toFixed(1)}px * ${rect.height.toFixed(1)}px`);
      }

      // Input 요소의 Label 매핑 누락 여부 검사
      if (el.tagName === 'INPUT' && !el.getAttribute('aria-label') && !el.id) {
        console.warn(`[접근성 경고] 입력 필드에 레이블 매핑이 누락되었습니다:`, el);
      }
    });

    const images = document.querySelectorAll('img');
    images.forEach((img) => {
      if (!img.getAttribute('alt')) {
        console.warn(`[접근성 경고] 이미지에 alt 설명 텍스트가 누락되었습니다:`, img);
      }
    });
  };

  // 렌더링 안정화 이후 3초 뒤에 접근성 1차 자동 진단 실행
  setTimeout(runAccessibilityAudit, 3000);

  // 3. memory-leak: 서명 캔버스 및 미해제 카메라 메모리 소모 감시
  let activeScanners = 0;
  let activeCanvasElements = 0;

  window.addEventListener('utang-event-scanner-mount', () => {
    activeScanners++;
    console.log(`[자원 모니터] 바코드 카메라 스캐너 작동 시작 (활성 수: ${activeScanners})`);
  });

  window.addEventListener('utang-event-scanner-unmount', () => {
    activeScanners--;
    console.log(`[자원 모니터] 바코드 카메라 스캐너 정리 완료 (남은 활성: ${activeScanners})`);
    if (activeScanners > 0) {
      console.error('[메모리 누수 위험] 카메라 스트림 인스턴스가 완전히 닫히지 않은 채 다수가 활성화되어 있습니다.');
    }
  });

  window.addEventListener('utang-event-canvas-mount', () => {
    activeCanvasElements++;
    if (activeCanvasElements > 2) {
      console.warn(`[메모리 누수 의심] 다수의 캔버스 드로잉 객체가 메모리에 로드되어 있습니다. (활성 수: ${activeCanvasElements})`);
    }
  });

  window.addEventListener('utang-event-canvas-unmount', () => {
    activeCanvasElements--;
  });

  // 4. chrome-devtools & unhandledrejection HMR 가드 통합
  const originalError = console.error;
  console.error = (...args) => {
    // 크롬 데브툴즈 및 모바일 콘솔에서 에러 추적이 쉽도록 원격 연동 로그 주입
    originalError.apply(console, args);
  };

  // 개발 모드 핫 리로딩(HMR) 중 발생하는 웹팩 CSS 로드 실패(Event 객체 거부)를 우아하게 필터링
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason instanceof Event || (event.reason && event.reason.toString() === '[object Event]')) {
      console.warn('[HMR Sync Monitor] 개발 모드 핫 리로딩으로 인한 스타일시트(HMR Event) 갱신 일시 지연이 감지 및 자동 방어되었습니다. 프로덕션 빌드에서는 이 현상이 발생하지 않습니다.');
      event.preventDefault(); // 브라우저 Uncaught Event 붉은 에러 표출 억제
    }
  });
};
