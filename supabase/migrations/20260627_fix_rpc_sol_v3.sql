DROP FUNCTION IF EXISTS public.complete_solana_deposit(p_from_wallet TEXT, p_amount NUMERIC, p_tx_id TEXT, p_method TEXT, p_secret TEXT);
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
    IF p_secret IS NOT NULL THEN
        SELECT value_text INTO v_stored_secret FROM public.system_settings WHERE key = 'solana_webhook_secret';
        IF v_stored_secret IS NOT NULL AND p_secret <> v_stored_secret THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid webhook secret');
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_tx_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already processed transaction signature');
    END IF;
    SELECT id, user_id INTO v_request_id, v_user_id
    FROM public.deposit_requests
    WHERE from_wallet = p_from_wallet AND unique_amount = p_amount AND method = p_method AND status = 'pending' AND expires_at > NOW()
    LIMIT 1;
    IF v_request_id IS NULL THEN
        SELECT id INTO v_user_id FROM public.profiles WHERE solana_wallet = p_from_wallet LIMIT 1;
        IF v_user_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'No profile matching the sender wallet address');
        END IF;
    ELSE
        UPDATE public.deposit_requests SET status = 'completed' WHERE id = v_request_id;
    END IF;
    UPDATE public.profiles SET credit = COALESCE(credit, 0) + p_amount WHERE id = v_user_id;
    INSERT INTO public.payment_proofs (loan_id, submitter_id, screenshot_url, gcash_reference, amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method, wallet_address)
    VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_user_id, 'Solana Blockchain Transfer Verified', p_tx_id, p_amount, NOW(), 'confirmed', NOW(), 'coin', p_from_wallet);
    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', p_amount);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$FN$;
