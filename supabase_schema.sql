-- Run this SQL in your Supabase SQL Editor:

-- 1. Create tables
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  trust_score NUMERIC DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue')),
  due_date DATE,
  payment_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID REFERENCES debts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT CHECK (method IN ('cash', 'gcash')),
  reference_no TEXT,
  paid_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
CREATE POLICY "Users can view own customers" ON customers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customers" ON customers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customers" ON customers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own customers" ON customers FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own debts" ON debts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own debts" ON debts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own debts" ON debts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own debts" ON debts FOR DELETE USING (auth.uid() = user_id);

-- For payments, we verify the debt belongs to the user
CREATE POLICY "Users can view own debt payments" ON payments FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM debts 
    WHERE debts.id = payments.debt_id AND debts.user_id = auth.uid()
  )
);
CREATE POLICY "Users can insert own debt payments" ON payments FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM debts 
    WHERE debts.id = payments.debt_id AND debts.user_id = auth.uid()
  )
);

-- 4. Push Subscriptions for PWA
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- 5. Credit Deposit Requests Table (MUtang GCash & Solana 자동 충전 시스템용)
CREATE TABLE IF NOT EXISTS public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  unique_amount NUMERIC NOT NULL UNIQUE, -- SMS 감지용 고유 금액
  method TEXT NOT NULL CHECK (method IN ('gcash', 'solana_usdt', 'solana_usdc')),
  from_wallet TEXT, -- 솔라나 전용
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Enable & Policies
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own deposit requests" ON public.deposit_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own deposit requests" ON public.deposit_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Payment Proofs Table (대출 상환 증빙 스크린샷 및 고유 참조 번호 보관용)
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL, -- loans 테이블 외래키
  submitter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  screenshot_url TEXT NOT NULL,
  gcash_reference TEXT NOT NULL UNIQUE, -- 중복 입금 승인 원천 차단을 위한 유일성 인덱스 제약 조건
  amount_claimed NUMERIC NOT NULL,
  deposited_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'rejected')),
  auto_confirm_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('gcash', 'coin')),
  wallet_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Enable & Policies
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users involved in loan can view proofs" ON public.payment_proofs FOR SELECT USING (true);
CREATE POLICY "Users can insert own proofs" ON public.payment_proofs FOR INSERT WITH CHECK (auth.uid() = submitter_id);

-- 7. GCash 자동 충전 완료 RPC 함수 ( complete_gcash_deposit )
CREATE OR REPLACE FUNCTION public.complete_gcash_deposit(
  p_received_amount NUMERIC,
  p_ref_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id UUID;
  v_user_id UUID;
  v_amount NUMERIC;
  v_result JSONB;
BEGIN
  -- 1. 중복 승인 방지: 이미 처리된 참조 번호인지 검사
  IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_ref_no) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed reference number');
  END IF;

  -- 2. 3분 이내 만료되지 않은 PENDING 요청 매칭 조회 (고유 금액 매칭)
  SELECT id, user_id, amount INTO v_request_id, v_user_id, v_amount
  FROM public.deposit_requests
  WHERE unique_amount = p_received_amount
    AND status = 'pending'
    AND expires_at > NOW()
  LIMIT 1;

  IF v_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active matching request found or expired');
  END IF;

  -- 3. 충전 요청 상태를 완료로 변경
  UPDATE public.deposit_requests
  SET status = 'completed'
  WHERE id = v_request_id;

  -- 4. 유저 프로필 크레딧 지급 (1 PHP = 10 Credits 변환 정책 반영)
  UPDATE public.profiles
  SET credit = COALESCE(credit, 0) + (v_amount * 10)
  WHERE id = v_user_id;

  -- 5. 중복 입금 검증용 이력에 자동 기록
  INSERT INTO public.payment_proofs (
    loan_id, submitter_id, screenshot_url, gcash_reference, 
    amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::UUID, -- 시스템 충전용 가상 UUID
    v_user_id,
    'System Auto Credit Recharge',
    p_ref_no,
    v_amount,
    NOW(),
    'confirmed',
    NOW(),
    'gcash'
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', v_amount * 10);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. Solana 암호화폐 입금 충전 완료 RPC 함수 ( complete_solana_deposit )
CREATE OR REPLACE FUNCTION public.complete_solana_deposit(
  p_from_wallet TEXT,
  p_amount NUMERIC,
  p_tx_id TEXT,
  p_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id UUID;
  v_user_id UUID;
  v_result JSONB;
BEGIN
  -- 1. 중복 트랜잭션 방지
  IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_tx_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed transaction signature');
  END IF;

  -- 2. 송금자 지갑 주소 및 청구액 매칭 여부 우선 조회
  SELECT id, user_id INTO v_request_id, v_user_id
  FROM public.deposit_requests
  WHERE from_wallet = p_from_wallet
    AND unique_amount = p_amount
    AND method = p_method
    AND status = 'pending'
    AND expires_at > NOW()
  LIMIT 1;

  -- 3. 매칭된 정액 신청서가 없다면 (다이렉트 외부 전송 감지)
  IF v_request_id IS NULL THEN
    -- 지갑 주소로 프로필 테이블을 매칭하여 직접 크레딧 추가
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE solana_wallet = p_from_wallet
    LIMIT 1;
    
    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No profile matching the sender wallet address');
    END IF;
  ELSE
    -- 신청서가 매칭된 경우 완료 처리
    UPDATE public.deposit_requests
    SET status = 'completed'
    WHERE id = v_request_id;
  END IF;

  -- 4. 유저 프로필 크레딧 즉각 지급 (입금 금액만큼의 크레딧 지급)
  UPDATE public.profiles
  SET credit = COALESCE(credit, 0) + p_amount
  WHERE id = v_user_id;

  -- 5. 중복 승인 방지용 영수증 기록
  INSERT INTO public.payment_proofs (
    loan_id, submitter_id, screenshot_url, gcash_reference, 
    amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method, wallet_address
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::UUID,
    v_user_id,
    'Solana Blockchain Transfer Verified',
    p_tx_id,
    p_amount,
    NOW(),
    'confirmed',
    NOW(),
    'coin',
    p_from_wallet
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', p_amount);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
