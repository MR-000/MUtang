CREATE OR REPLACE FUNCTION public.complete_gcash_deposit(
    p_received_amount NUMERIC,
    p_ref_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
    v_request_id UUID;
    v_user_id UUID;
    v_amount NUMERIC;
BEGIN
    IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_ref_no) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already processed reference number');
    END IF;
    SELECT id, user_id, amount INTO v_request_id, v_user_id, v_amount
    FROM public.deposit_requests
    WHERE unique_amount = p_received_amount
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1;
    IF v_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active matching request found or expired');
    END IF;
    UPDATE public.deposit_requests SET status = 'completed' WHERE id = v_request_id;
    UPDATE public.profiles
    SET credit = COALESCE(credit, 0) + (v_amount * 10)
    WHERE id = v_user_id;
    INSERT INTO public.payment_proofs (loan_id, submitter_id, screenshot_url, gcash_reference, amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method)
    VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_user_id, 'System Auto Credit Recharge', p_ref_no, v_amount, NOW(), 'confirmed', NOW(), 'gcash');
    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', v_amount * 10);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.complete_solana_deposit(
    p_from_wallet TEXT,
    p_amount NUMERIC,
    p_tx_id TEXT,
    p_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
    v_request_id UUID;
    v_user_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_tx_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already processed transaction signature');
    END IF;
    SELECT id, user_id INTO v_request_id, v_user_id
    FROM public.deposit_requests
    WHERE from_wallet = p_from_wallet
      AND unique_amount = p_amount
      AND method = p_method
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1;
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
    UPDATE public.profiles
    SET credit = COALESCE(credit, 0) + p_amount
    WHERE id = v_user_id;
    INSERT INTO public.payment_proofs (loan_id, submitter_id, screenshot_url, gcash_reference, amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method, wallet_address)
    VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_user_id, 'Solana Blockchain Transfer Verified', p_tx_id, p_amount, NOW(), 'confirmed', NOW(), 'coin', p_from_wallet);
    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', p_amount);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.deduct_credit(
    p_user_id UUID,
    p_amount NUMERIC,
    p_loan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
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
$BODY$;
