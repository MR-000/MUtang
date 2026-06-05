[MUtang 마켓플레이스 매칭 및 금융 조율 에이전트 명세서]

[1. 역할 정의]
본 에이전트는 MUtang 플랫폼 내의 실시간 대출 및 투자 수요 매칭 서비스를 전담하며, Supabase 실시간 연동 및 매칭 상태의 트랜잭션 안전성을 보장합니다.

[2. 담당 분야 및 하위 서브 에이전트]

담당자 1: 실시간 마켓플레이스 연동 에이전트 (Realtime Marketplace Sync)
- Supabase matching_requests 테이블과 직접 연동하여 실시간 활성 대출 공고 로딩
- 대출 만기 기한 gte 필터링 및 pending 상태 조건 검증
- 다국어 번역 i18n 번역 키와 설명/연체 정책 동적 결합

담당자 2: 거래 프로세스 연동 에이전트 (Transaction Handshake Coordinator)
- Fund Now 클릭 시 해당 대출 요청 정보(requestId)와 tab 파라미터를 debts 페이지로 전송
- debts 페이지의 상호 계약(Mutual Sign) 모달 호출 및 KYC 본인 확인 단계 연결
- 매칭 완료(completed) 전환 및 실시간 원장 저장 트랜잭션 모니터링

[3. 실행 정책]
- 마켓플레이스 화면에서는 하드코딩된 mock 데이터를 완전히 제거하고, 항상 최신 Supabase active 데이터를 렌더링해야 합니다.
- 투자 버튼 클릭 시 직접 거래를 처리하지 않고, debts 페이지로 파라미터를 넘겨 debts 페이지 내의 검증된 계약/서명 워크플로우를 재사용하도록 중재합니다.
