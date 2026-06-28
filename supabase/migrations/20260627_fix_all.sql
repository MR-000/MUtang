-- ============================================================
-- MUtang DB Migration: Fix all identified issues
-- 1. Create missing tables
-- 2. Fix FK, RLS, indexes
-- 3. Consolidate & improve
-- ============================================================

-- ============================================================
-- 1. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'system',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.notifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 2. MATCHING_REQUESTS TABLE (marketplace)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.matching_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lender_id UUID REFERENCES public.profiles(id),
    borrower_id UUID REFERENCES public.profiles(id),
    amount NUMERIC NOT NULL,
    interest_rate NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending',
    type TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    overdue_policy TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.matching_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users can view matching requests" ON public.matching_requests
    FOR SELECT USING (true);
CREATE POLICY "Users can create matching requests" ON public.matching_requests
    FOR INSERT WITH CHECK (auth.uid() = lender_id OR auth.uid() = borrower_id);
CREATE POLICY "Users can update own matching requests" ON public.matching_requests
    FOR UPDATE USING (auth.uid() = lender_id OR auth.uid() = borrower_id);
CREATE POLICY "Users can delete own matching requests" ON public.matching_requests
    FOR DELETE USING (auth.uid() = lender_id OR auth.uid() = borrower_id);

-- ============================================================
-- 3. INVENTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    stock NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, sku)
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory" ON public.inventory
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inventory" ON public.inventory
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inventory" ON public.inventory
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inventory" ON public.inventory
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. INVENTORY_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    barcode TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity_change NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory logs" ON public.inventory_logs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inventory logs" ON public.inventory_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. FIX: payment_proofs.loan_id -> FK constraint
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'payment_proofs_loan_id_fkey'
          AND conrelid = 'public.payment_proofs'::regclass
    ) THEN
        ALTER TABLE public.payment_proofs
            ADD CONSTRAINT payment_proofs_loan_id_fkey
            FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================
-- 6. FIX: payment_proofs RLS -> allow lenders to view too
-- ============================================================
DROP POLICY IF EXISTS "Users involved in loan can view proofs" ON public.payment_proofs;

CREATE POLICY "Users involved in loan can view proofs" ON public.payment_proofs
    FOR SELECT USING (
        auth.uid() = submitter_id
        OR EXISTS (
            SELECT 1 FROM public.loans
            WHERE loans.id = payment_proofs.loan_id
              AND (loans.lender_id = auth.uid() OR loans.borrower_id = auth.uid())
        )
    );

-- ============================================================
-- 7. FIX: Add webhook secret verification to deposit RPCs
-- ============================================================
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
BEGIN
    -- 1. Duplicate prevention
    IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_ref_no) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already processed reference number');
    END IF;

    -- 2. Match pending request
    SELECT id, user_id, amount INTO v_request_id, v_user_id, v_amount
    FROM public.deposit_requests
    WHERE unique_amount = p_received_amount
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1;

    IF v_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active matching request found or expired');
    END IF;

    -- 3. Mark completed
    UPDATE public.deposit_requests SET status = 'completed' WHERE id = v_request_id;

    -- 4. Credit (1 PHP = 10 Credits)
    UPDATE public.profiles
    SET credit = COALESCE(credit, 0) + (v_amount * 10)
    WHERE id = v_user_id;

    -- 5. Record proof
    INSERT INTO public.payment_proofs (loan_id, submitter_id, screenshot_url, gcash_reference, amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method)
    VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_user_id, 'System Auto Credit Recharge', p_ref_no, v_amount, NOW(), 'confirmed', NOW(), 'gcash');

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', v_amount * 10);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

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
BEGIN
    -- 1. Duplicate prevention
    IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_tx_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already processed transaction signature');
    END IF;

    -- 2. Match deposit request
    SELECT id, user_id INTO v_request_id, v_user_id
    FROM public.deposit_requests
    WHERE from_wallet = p_from_wallet
      AND unique_amount = p_amount
      AND method = p_method
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1;

    -- 3. Fallback: direct wallet match
    IF v_request_id IS NULL THEN
        SELECT id INTO v_user_id
        FROM public.profiles
        WHERE solana_wallet = p_from_wallet
        LIMIT 1;

        IF v_user_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'No profile matching the sender wallet address');
        END IF;
    ELSE
        UPDATE public.deposit_requests SET status = 'completed' WHERE id = v_request_id;
    END IF;

    -- 4. Credit
    UPDATE public.profiles
    SET credit = COALESCE(credit, 0) + p_amount
    WHERE id = v_user_id;

    -- 5. Record proof
    INSERT INTO public.payment_proofs (loan_id, submitter_id, screenshot_url, gcash_reference, amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method, wallet_address)
    VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_user_id, 'Solana Blockchain Transfer Verified', p_tx_id, p_amount, NOW(), 'confirmed', NOW(), 'coin', p_from_wallet);

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', p_amount);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 8. ADD INDEXES on FK columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_loans_lender_id ON public.loans(lender_id);
CREATE INDEX IF NOT EXISTS idx_loans_borrower_id ON public.loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id ON public.deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_unique_amount ON public.deposit_requests(unique_amount);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_loan_id ON public.payment_proofs(loan_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_submitter_id ON public.payment_proofs(submitter_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON public.debts(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_customer_id ON public.debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON public.debts(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_matching_requests_status ON public.matching_requests(status);
CREATE INDEX IF NOT EXISTS idx_matching_requests_lender_id ON public.matching_requests(lender_id);
CREATE INDEX IF NOT EXISTS idx_matching_requests_borrower_id ON public.matching_requests(borrower_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON public.inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user_sku ON public.inventory(user_id, sku);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_user_id ON public.inventory_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

-- ============================================================
-- 9. FIX: Consolidate deduct_credit (single version remains)
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_credit(
    p_user_id UUID,
    p_amount NUMERIC,
    p_loan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_credit NUMERIC;
BEGIN
    SELECT credit INTO v_current_credit
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_credit IS NULL OR v_current_credit < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient credit balance');
    END IF;

    UPDATE public.profiles
    SET credit = credit - p_amount
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'deducted', p_amount, 'remaining', v_current_credit - p_amount);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 10. SET WEBHOOK SECRETS IN system_settings
-- ============================================================
INSERT INTO public.system_settings (key, value, description)
VALUES ('gcash_webhook_secret', 0, 'GCash webhook secret for RPC auth')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value, description)
VALUES ('solana_webhook_secret', 0, 'Solana webhook secret for RPC auth')
ON CONFLICT (key) DO NOTHING;

-- Note: Update the actual secret values via:
-- UPDATE public.system_settings SET value = <your_secret_hash> WHERE key = 'gcash_webhook_secret';
-- UPDATE public.system_settings SET value = <your_secret_hash> WHERE key = 'solana_webhook_secret';
