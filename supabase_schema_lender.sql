-- Lender: Trust-based Agreement Record Marketplace Schema

-- 1. Profiles (Enhanced with Trust Score & Tier)
CREATE TYPE user_tier AS ENUM ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond');

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    phone_number TEXT,
    address_barangay TEXT,
    address_city TEXT,
    address_province TEXT,
    trust_score INTEGER DEFAULT 20, -- Starts at Bronze (20) if they sign up?
    tier user_tier DEFAULT 'Bronze',
    is_id_verified BOOLEAN DEFAULT FALSE,
    id_type TEXT,
    id_number TEXT,
    id_expiry DATE,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Loan Requests (Borrowers)
CREATE TABLE IF NOT EXISTS public.loan_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    borrower_id UUID REFERENCES public.profiles(id) NOT NULL,
    amount DECIMAL NOT NULL,
    repay_amount DECIMAL NOT NULL,
    duration_days INTEGER NOT NULL,
    purpose TEXT,
    status TEXT DEFAULT 'open', -- open, matched, completed, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Loan Offers (Lenders)
CREATE TABLE IF NOT EXISTS public.loan_offers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lender_id UUID REFERENCES public.profiles(id) NOT NULL,
    amount_offer DECIMAL NOT NULL,
    repay_amount DECIMAL NOT NULL,
    duration_days INTEGER NOT NULL,
    status TEXT DEFAULT 'open', -- open, matched, completed, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Matches & Unlocks (Revenue & Identity Disclosure)
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID REFERENCES public.loan_requests(id),
    offer_id UUID REFERENCES public.loan_offers(id),
    lender_id UUID REFERENCES public.profiles(id) NOT NULL,
    borrower_id UUID REFERENCES public.profiles(id) NOT NULL,
    is_identity_unlocked BOOLEAN DEFAULT FALSE,
    unlock_fee_paid BOOLEAN DEFAULT FALSE,
    match_status TEXT DEFAULT 'pending', -- pending, unlocked, active, closed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Agreement Records (Evidence/Transaction)
CREATE TABLE IF NOT EXISTS public.agreement_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id UUID REFERENCES public.matches(id),
    lender_id UUID REFERENCES public.profiles(id) NOT NULL,
    borrower_id UUID REFERENCES public.profiles(id) NOT NULL,
    amount DECIMAL NOT NULL,
    repay_amount DECIMAL NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, active, paid, overdue, dispute
    lender_confirmed BOOLEAN DEFAULT FALSE,
    borrower_confirmed BOOLEAN DEFAULT FALSE,
    payment_proof_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_records ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view all (for marketplace) but only update their own
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Loan Requests: Viewable by all, manageable by owner
CREATE POLICY "Requests are viewable by everyone" ON public.loan_requests FOR SELECT USING (true);
CREATE POLICY "Users can create their own requests" ON public.loan_requests FOR INSERT WITH CHECK (auth.uid() = borrower_id);
CREATE POLICY "Users can update their own requests" ON public.loan_requests FOR UPDATE USING (auth.uid() = borrower_id);

-- Matches: Only involved parties can see
CREATE POLICY "Matches are viewable by participants" ON public.matches FOR SELECT USING (auth.uid() = lender_id OR auth.uid() = borrower_id);

-- Agreement Records: Only involved parties can see
CREATE POLICY "Agreement records are viewable by participants" ON public.agreement_records FOR SELECT USING (auth.uid() = lender_id OR auth.uid() = borrower_id);
