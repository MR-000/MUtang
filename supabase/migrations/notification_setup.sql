-- ============================================================
-- MUtang 알림 시스템 셋업 SQL
-- Supabase 대시보드 > SQL Editor 에서 순서대로 실행하세요.
-- ============================================================

-- 1. push_subscriptions 테이블 생성
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. RLS 활성화
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. RLS 정책: 본인 구독만 관리
CREATE POLICY "Users can manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- 4. notifications 테이블에 type 컬럼 due_reminder 추가 (이미 있으면 무시)
-- (현재 type 컬럼은 text 타입으로 기존에 존재함. 추가 작업 불필요)

-- 5. pg_cron 익스텐션 활성화
-- (Supabase 대시보드 Database > Extensions 에서 pg_cron 을 직접 Enable 하세요)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 6. Cron Job 등록: 매일 오전 9시 (Asia/Manila = UTC+8 = UTC 01:00)
-- pg_cron 활성화 후 아래를 실행하세요.
/*
SELECT cron.schedule(
  'mutang-due-notifications',
  '0 1 * * *',
  $$
    SELECT net.http_post(
      url := 'https://bqkviztmboddwfwhcoyh.supabase.co/functions/v1/send-due-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb
    )
  $$
);
*/

-- 확인: 현재 cron job 목록
-- SELECT * FROM cron.job;
