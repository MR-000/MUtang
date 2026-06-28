DROP FUNCTION IF EXISTS public.complete_gcash_deposit(p_received_amount NUMERIC, p_ref_no TEXT, p_secret TEXT);
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
    IF p_secret IS NOT NULL THEN
        SELECT value_text INTO v_stored_secret FROM public.system_settings WHERE key = 'gcash_webhook_secret';
        IF v_stored_secret IS NOT NULL AND p_secret <> v_stored_secret THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid webhook secret');
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.payment_proofs WHERE gcash_reference = p_ref_no) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already processed reference number');
    END IF;
    SELECT id, user_id, amount INTO v_request_id, v_user_id, v_amount
    FROM public.deposit_requests
    WHERE unique_amount = p_received_amount AND status = 'pending' AND expires_at > NOW()
    LIMIT 1;
    IF v_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active matching request found or expired');
    END IF;
    UPDATE public.deposit_requests SET status = 'completed' WHERE id = v_request_id;
    UPDATE public.profiles SET credit = COALESCE(credit, 0) + (v_amount * 10) WHERE id = v_user_id;
    INSERT INTO public.payment_proofs (loan_id, submitter_id, screenshot_url, gcash_reference, amount_claimed, deposited_at, status, auto_confirm_deadline, payment_method)
    VALUES ('00000000-0000-0000-0000-000000000000'::UUID, v_user_id, 'System Auto Credit Recharge', p_ref_no, v_amount, NOW(), 'confirmed', NOW(), 'gcash');
    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'credited_amount', v_amount * 10);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$FN$;
