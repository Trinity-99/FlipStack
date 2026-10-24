-- ====================================================================
-- FlipStack Database Schema (Version 2.2 - Fully Normalized)
-- Target: Supabase (PostgreSQL)
-- ====================================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- TABLES (Singular Naming Convention)
-- ====================================================================

-- Profile table linked to Supabase Auth
CREATE TABLE public.profile (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Deck table
CREATE TABLE public.deck (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profile(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    -- side_labels defines names for sides: e.g., ["Thai Script", "Phonetic", "Meaning"]
    side_labels JSONB NOT NULL DEFAULT '["Side 1", "Side 2", "Side 3"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Direction table (Stores saved study directions per deck)
CREATE TABLE public.direction (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    deck_id UUID REFERENCES public.deck(id) ON DELETE CASCADE NOT NULL,
    -- Expected JSONB structure example:
    -- [
    --   {"side": 3, "role": "question"},
    --   {"side": 2, "role": "answer"},
    --   {"side": 1, "role": "extra"}
    -- ]
    configuration JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tag table (Defines learning topics per deck)
CREATE TABLE public.tag (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    deck_id UUID REFERENCES public.deck(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_tag_per_deck UNIQUE (deck_id, name)
);

-- Card table
CREATE TABLE public.card (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    deck_id UUID REFERENCES public.deck(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profile(id) ON DELETE CASCADE NOT NULL,
    -- Expected JSONB structure for content:
    -- {
    --   "s1": "Text for side 1",
    --   "s2": "Text for side 2",
    --   "s3": "Text for side 3"
    -- }
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Card-Tag Junction Table (Strict Normalization for Many-to-Many Tags)
CREATE TABLE public.card_tag (
    card_id UUID REFERENCES public.card(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.tag(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
);

-- Card Progress (Counters) table
CREATE TABLE public.card_progress (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profile(id) ON DELETE CASCADE NOT NULL,
    card_id UUID REFERENCES public.card(id) ON DELETE CASCADE NOT NULL,
    direction_id UUID REFERENCES public.direction(id) ON DELETE CASCADE NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0 AND counter <= 10),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_user_card_direction UNIQUE (user_id, card_id, direction_id)
);

-- ====================================================================
-- INDEXES FOR PERFORMANCE
-- ====================================================================

CREATE INDEX idx_deck_user_id ON public.deck(user_id);
CREATE INDEX idx_direction_deck_id ON public.direction(deck_id);
CREATE INDEX idx_tag_deck_id ON public.tag(deck_id);
CREATE INDEX idx_card_deck_id ON public.card(deck_id);
CREATE INDEX idx_card_user_id ON public.card(user_id);
CREATE INDEX idx_card_progress_lookup ON public.card_progress(user_id, card_id, direction_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direction ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_progress ENABLE ROW LEVEL SECURITY;

-- Profile Policies
CREATE POLICY "Users can view own profile" 
    ON public.profile FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON public.profile FOR UPDATE 
    USING (auth.uid() = id);

-- Deck Policies
CREATE POLICY "Users can CRUD own decks" 
    ON public.deck FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Direction Policies (Inherited via deck ownership)
CREATE POLICY "Users can CRUD directions for own decks" 
    ON public.direction FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.deck WHERE deck.id = direction.deck_id AND deck.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.deck WHERE deck.id = direction.deck_id AND deck.user_id = auth.uid()));

-- Tag Policies (Inherited via deck ownership)
CREATE POLICY "Users can CRUD tags for own decks" 
    ON public.tag FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.deck WHERE deck.id = tag.deck_id AND deck.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.deck WHERE deck.id = tag.deck_id AND deck.user_id = auth.uid()));

-- Card Policies
CREATE POLICY "Users can CRUD own cards" 
    ON public.card FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Card-Tag Policies (Inherited via card ownership)
CREATE POLICY "Users can CRUD own card tags" 
    ON public.card_tag FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.card WHERE card.id = card_tag.card_id AND card.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.card WHERE card.id = card_tag.card_id AND card.user_id = auth.uid()));

-- Card Progress Policies
CREATE POLICY "Users can CRUD own card progress" 
    ON public.card_progress FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- TRIGGERS & FUNCTIONS (With Error Handling)
-- ====================================================================

-- Function to handle new user signup with error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profile (id)
    VALUES (NEW.id);
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in handle_new_user trigger for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generic updated_at timestamp function with error handling
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error updating timestamp for table: %', TG_TABLE_NAME;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach updated_at triggers
CREATE TRIGGER update_deck_updated_at
    BEFORE UPDATE ON public.deck
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_card_updated_at
    BEFORE UPDATE ON public.card
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    

--  **********************************************************************
--  V 0.1
--  New Feature: User Preferences for Decks             
--  update the database with user preferences
--
--  ***********************************************************************

ALTER TABLE public.profile
ADD COLUMN IF NOT EXISTS last_active_deck_id UUID REFERENCES public.deck(id) ON DELETE SET NULL;

-- 2. Create Per-Deck User Preference Table
CREATE TABLE IF NOT EXISTS public.user_deck_preference (
user_id UUID REFERENCES public.profile(id) ON DELETE CASCADE NOT NULL,
deck_id UUID REFERENCES public.deck(id) ON DELETE CASCADE NOT NULL,
last_selected_direction_id UUID REFERENCES public.direction(id) ON DELETE SET NULL,
last_selected_tag_id UUID REFERENCES public.tag(id) ON DELETE SET NULL,
updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
PRIMARY KEY (user_id, deck_id)
);

-- ====================================================================
-- INDEXES & PERFORMANCE
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_profile_last_deck ON public.profile(last_active_deck_id);
CREATE INDEX IF NOT EXISTS idx_user_deck_pref_lookup ON public.user_deck_preference(user_id, deck_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.user_deck_preference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own deck preferences"
ON public.user_deck_preference FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- TRIGGERS
-- ====================================================================

CREATE TRIGGER update_user_deck_preference_updated_at
BEFORE UPDATE ON public.user_deck_preference
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();