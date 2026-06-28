-- 1. Add value_text column to system_settings
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS value_text TEXT;

-- 2. Remove unused hash entry
DELETE FROM public.system_settings WHERE key = 'gcash_webhook_secret_hash';

-- 3. Store webhook secrets as text (use generated values)
UPDATE public.system_settings SET value_text = '5eFd1DBEb3A28f7a0cC496', description = 'GCash webhook secret for RPC auth' WHERE key = 'gcash_webhook_secret';
UPDATE public.system_settings SET value_text = '8B2ea0bFf5d4CcEA97D316', description = 'Solana webhook secret for RPC auth' WHERE key = 'solana_webhook_secret';

-- 4. Update complete_gcash_deposit with secret verification
CREATE OR REPLACE FUNCTION public.complete_gcash_deposit(
    p_received_amount NUMERIC,
    p_ref_no TEXT,
    p_secret TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $FN$
DECLARE
    v_stored_secret TEXT;
    v_request_id UUID;
    v_user_id UUID;
    v_amount NUMERIC;
BEGIN
    SELECT value_text INTO v_stored_secret
    FROM public.system_settings
    WHERE key = 'gcash_webhook_secret';

    IF v_stored_secret IS NOT NULL AND (p_secret IS NULL OR p_secret <> v_stored_secret) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid webhook secret');
    END IF;

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
$FN$;

-- 5. Update complete_solana_deposit with secret verification
CREATE OR REPLACE FUNCTION public.complete_solana_deposit(
    p_from_wallet TEXT,
    p_amount NUMERIC,
    p_tx_id TEXT,
    p_method TEXT,
    p_secret TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $FN$
DECLARE
    v_stored_secret TEXT;
    v_request_id UUID;
    v_user_id UUID;
BEGIN
    SELECT value_text INTO v_stored_secret
    FROM public.system_settings
    WHERE key = 'solana_webhook_secret';

    IF v_stored_secret IS NOT NULL AND (p_secret IS NULL OR p_secret <> v_stored_secret) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid webhook secret');
    END IF;

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
$FN$;
