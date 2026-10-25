-- ====================================================================
-- FlipStack Database Schema (Version 0.2 - Fully Normalized)
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
    -- Foreign key to deck is added after the deck table exists (see below)
    last_active_deck_id UUID,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT deck_title_length CHECK (char_length(title) BETWEEN 1 AND 32),
    -- 2 or 3 labels, each a string of 1 to 32 characters
    CONSTRAINT deck_side_labels_valid CHECK (
        (
            jsonb_typeof(side_labels) = 'array'
            AND jsonb_array_length(side_labels) BETWEEN 2 AND 3
            AND jsonb_typeof(side_labels->0) = 'string'
            AND char_length(side_labels->>0) BETWEEN 1 AND 32
            AND jsonb_typeof(side_labels->1) = 'string'
            AND char_length(side_labels->>1) BETWEEN 1 AND 32
            AND (
                jsonb_array_length(side_labels) = 2
                OR (
                    jsonb_typeof(side_labels->2) = 'string'
                    AND char_length(side_labels->>2) BETWEEN 1 AND 32
                )
            )
        ) IS TRUE
    )
);

-- Profile and deck reference each other, so this key is added after both exist
ALTER TABLE public.profile
    ADD CONSTRAINT profile_last_active_deck_fk
    FOREIGN KEY (last_active_deck_id) REFERENCES public.deck(id) ON DELETE SET NULL;

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Ordered list of 2 or 3 entries: sides 1 to 3 without duplicates,
    -- exactly one question (first), at least one answer. Size is capped.
    CONSTRAINT direction_configuration_valid CHECK (
        (
            jsonb_typeof(configuration) = 'array'
            AND jsonb_array_length(configuration) BETWEEN 2 AND 3
            AND octet_length(configuration::text) <= 200
            AND configuration->0->>'role' = 'question'
            AND jsonb_array_length(jsonb_path_query_array(configuration, '$[*] ? (@.role == "question")')) = 1
            AND jsonb_path_exists(configuration, '$[*] ? (@.role == "answer")')
            AND jsonb_array_length(jsonb_path_query_array(
                    configuration,
                    '$[*] ? ((@.role == "question" || @.role == "answer" || @.role == "extra") && @.side >= 1 && @.side <= 3 && @.side == @.side.floor())'
                )) = jsonb_array_length(configuration)
            AND configuration->0->'side' <> configuration->1->'side'
            AND (
                jsonb_array_length(configuration) = 2
                OR (
                    configuration->2->'side' <> configuration->0->'side'
                    AND configuration->2->'side' <> configuration->1->'side'
                )
            )
        ) IS TRUE
    )
);

-- Tag table (Defines learning topics per deck)
CREATE TABLE public.tag (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    deck_id UUID REFERENCES public.deck(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_tag_per_deck UNIQUE (deck_id, name),
    CONSTRAINT tag_name_length CHECK (char_length(name) BETWEEN 1 AND 32)
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Only the keys s1, s2, s3; each a string of at most 256 characters
    CONSTRAINT card_content_valid CHECK (
        (
            jsonb_typeof(content) = 'object'
            AND (content - 's1' - 's2' - 's3') = '{}'::jsonb
            AND (content->'s1' IS NULL OR (jsonb_typeof(content->'s1') = 'string' AND char_length(content->>'s1') <= 256))
            AND (content->'s2' IS NULL OR (jsonb_typeof(content->'s2') = 'string' AND char_length(content->>'s2') <= 256))
            AND (content->'s3' IS NULL OR (jsonb_typeof(content->'s3') = 'string' AND char_length(content->>'s3') <= 256))
        ) IS TRUE
    )
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

-- Per-Deck User Preference table (last selected direction and tag)
CREATE TABLE public.user_deck_preference (
    user_id UUID REFERENCES public.profile(id) ON DELETE CASCADE NOT NULL,
    deck_id UUID REFERENCES public.deck(id) ON DELETE CASCADE NOT NULL,
    last_selected_direction_id UUID REFERENCES public.direction(id) ON DELETE SET NULL,
    last_selected_tag_id UUID REFERENCES public.tag(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (user_id, deck_id)
);

-- ====================================================================
-- INDEXES FOR PERFORMANCE
-- ====================================================================

CREATE INDEX idx_profile_last_deck ON public.profile(last_active_deck_id);
CREATE INDEX idx_deck_user_id ON public.deck(user_id);
CREATE INDEX idx_direction_deck_id ON public.direction(deck_id);
CREATE INDEX idx_tag_deck_id ON public.tag(deck_id);
CREATE INDEX idx_card_deck_id ON public.card(deck_id);
CREATE INDEX idx_card_user_id ON public.card(user_id);
-- Lookups on card_progress (user_id, card_id, direction_id) and on
-- user_deck_preference (user_id, deck_id) are served by the indexes of
-- their unique and primary key constraints.

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
ALTER TABLE public.user_deck_preference ENABLE ROW LEVEL SECURITY;

-- Profile Policies
-- (created by trigger, deleted by cascade: no insert or delete policy)
CREATE POLICY "Users can view own profile" 
    ON public.profile FOR SELECT 
    USING (auth.uid() = id);

-- The last active deck must belong to the user
CREATE POLICY "Users can update own profile" 
    ON public.profile FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND (
            last_active_deck_id IS NULL
            OR EXISTS (SELECT 1 FROM public.deck WHERE deck.id = profile.last_active_deck_id AND deck.user_id = auth.uid())
        )
    );

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

-- Card Policies (the deck must belong to the user)
CREATE POLICY "Users can CRUD own cards" 
    ON public.card FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (SELECT 1 FROM public.deck WHERE deck.id = card.deck_id AND deck.user_id = auth.uid())
    );

-- Card-Tag Policies (the card and the tag must belong to the user)
CREATE POLICY "Users can CRUD own card tags" 
    ON public.card_tag FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.card WHERE card.id = card_tag.card_id AND card.user_id = auth.uid()))
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.card WHERE card.id = card_tag.card_id AND card.user_id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.tag
            JOIN public.deck ON deck.id = tag.deck_id
            WHERE tag.id = card_tag.tag_id AND deck.user_id = auth.uid()
        )
    );

-- Card Progress Policies (the card and the direction must belong to the user)
CREATE POLICY "Users can CRUD own card progress" 
    ON public.card_progress FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (SELECT 1 FROM public.card WHERE card.id = card_progress.card_id AND card.user_id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.direction
            JOIN public.deck ON deck.id = direction.deck_id
            WHERE direction.id = card_progress.direction_id AND deck.user_id = auth.uid()
        )
    );

-- Deck Preference Policies (deck, direction and tag must belong to the user)
CREATE POLICY "Users can CRUD own deck preferences"
    ON public.user_deck_preference FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (SELECT 1 FROM public.deck WHERE deck.id = user_deck_preference.deck_id AND deck.user_id = auth.uid())
        AND (
            last_selected_direction_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.direction
                JOIN public.deck ON deck.id = direction.deck_id
                WHERE direction.id = user_deck_preference.last_selected_direction_id AND deck.user_id = auth.uid()
            )
        )
        AND (
            last_selected_tag_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.tag
                JOIN public.deck ON deck.id = tag.deck_id
                WHERE tag.id = user_deck_preference.last_selected_tag_id AND deck.user_id = auth.uid()
            )
        )
    );

-- ====================================================================
-- TRIGGERS & FUNCTIONS (With Error Handling)
-- ====================================================================

-- Create the profile for each new Auth user. Let failures abort signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profile (id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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

CREATE TRIGGER update_user_deck_preference_updated_at
    BEFORE UPDATE ON public.user_deck_preference
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ====================================================================
-- Update: concurrency-safe row limits
-- Replaces public.check_row_limit(). The existing triggers
-- (limit_*_rows) call the function by name and stay attached.
-- Safe to run more than once.
-- ====================================================================

-- Row limits (checked on insert; runs with the rights of the caller, so RLS applies)
--   deck:          20 per user
--   card:          100000 per user
--   card_progress: 1000000 per user
--   direction:     10 per deck
--   tag:           100 per deck
--   card_tag:      10 per card
--
-- Concurrent inserts into the same table and scope are serialized with a
-- transaction-level advisory lock taken before counting. The lock is held
-- until the inserting transaction ends, so the next waiting insert counts
-- after the previous row is committed.
CREATE OR REPLACE FUNCTION public.check_row_limit()
RETURNS TRIGGER AS $$
DECLARE
    scope_id UUID;
    current_count BIGINT;
    max_count BIGINT;
BEGIN
    -- 1. Scope (owner or parent) and maximum for this table
    CASE TG_TABLE_NAME
        WHEN 'deck' THEN
            scope_id := NEW.user_id;
            max_count := 20;
        WHEN 'card' THEN
            scope_id := NEW.user_id;
            max_count := 100000;
        WHEN 'card_progress' THEN
            scope_id := NEW.user_id;
            max_count := 1000000;
        WHEN 'direction' THEN
            scope_id := NEW.deck_id;
            max_count := 10;
        WHEN 'tag' THEN
            scope_id := NEW.deck_id;
            max_count := 100;
        WHEN 'card_tag' THEN
            scope_id := NEW.card_id;
            max_count := 10;
    END CASE;

    -- 2. Serialize concurrent inserts for this table and scope
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(TG_TABLE_NAME::text || ':' || scope_id::text, 0)
    );

    -- 3. Count after the lock is held
    CASE TG_TABLE_NAME
        WHEN 'deck' THEN
            SELECT count(*) INTO current_count FROM public.deck WHERE user_id = scope_id;
        WHEN 'card' THEN
            SELECT count(*) INTO current_count FROM public.card WHERE user_id = scope_id;
        WHEN 'card_progress' THEN
            SELECT count(*) INTO current_count FROM public.card_progress WHERE user_id = scope_id;
        WHEN 'direction' THEN
            SELECT count(*) INTO current_count FROM public.direction WHERE deck_id = scope_id;
        WHEN 'tag' THEN
            SELECT count(*) INTO current_count FROM public.tag WHERE deck_id = scope_id;
        WHEN 'card_tag' THEN
            SELECT count(*) INTO current_count FROM public.card_tag WHERE card_id = scope_id;
    END CASE;

    IF current_count >= max_count THEN
        RAISE EXCEPTION 'Row limit reached for table % (maximum %)', TG_TABLE_NAME, max_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Attach row limit triggers
CREATE TRIGGER limit_deck_rows
    BEFORE INSERT ON public.deck
    FOR EACH ROW EXECUTE FUNCTION public.check_row_limit();

CREATE TRIGGER limit_card_rows
    BEFORE INSERT ON public.card
    FOR EACH ROW EXECUTE FUNCTION public.check_row_limit();

CREATE TRIGGER limit_card_progress_rows
    BEFORE INSERT ON public.card_progress
    FOR EACH ROW EXECUTE FUNCTION public.check_row_limit();

CREATE TRIGGER limit_direction_rows
    BEFORE INSERT ON public.direction
    FOR EACH ROW EXECUTE FUNCTION public.check_row_limit();

CREATE TRIGGER limit_tag_rows
    BEFORE INSERT ON public.tag
    FOR EACH ROW EXECUTE FUNCTION public.check_row_limit();

CREATE TRIGGER limit_card_tag_rows
    BEFORE INSERT ON public.card_tag
    FOR EACH ROW EXECUTE FUNCTION public.check_row_limit();
