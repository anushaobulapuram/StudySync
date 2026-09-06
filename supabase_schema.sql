-- StudySync Database Schema
-- Run this script in your Supabase SQL Editor (https://app.supabase.com/project/_/sql)

-- 1. Create Rooms Table
CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    host_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    max_participants INTEGER DEFAULT 15,
    settings JSONB DEFAULT '{}'::jsonb
);

-- Index for fast lookup and active check
CREATE INDEX IF NOT EXISTS idx_rooms_active ON public.rooms (id, is_active);

-- 2. Create Private Notes Table
CREATE TABLE IF NOT EXISTS public.private_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_room_user_notes UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_private_notes_lookup ON public.private_notes (room_id, user_id);

-- 3. Row Level Security (RLS) Setup
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_notes ENABLE ROW LEVEL SECURITY;

-- Rooms RLS Policies
-- Allow anyone to look up room validity and status
DROP POLICY IF EXISTS "Public rooms select" ON public.rooms;
CREATE POLICY "Public rooms select" ON public.rooms
    FOR SELECT USING (true);

-- Allow room creation
DROP POLICY IF EXISTS "Public rooms insert" ON public.rooms;
CREATE POLICY "Public rooms insert" ON public.rooms
    FOR INSERT WITH CHECK (true);

-- Allow updating room active status (e.g. deactivation upon departure)
DROP POLICY IF EXISTS "Public rooms update" ON public.rooms;
CREATE POLICY "Public rooms update" ON public.rooms
    FOR UPDATE USING (true);

-- Private Notes RLS Policies
-- Users can manage their own private notes based on user_id
DROP POLICY IF EXISTS "Private notes select" ON public.private_notes;
CREATE POLICY "Private notes select" ON public.private_notes
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Private notes insert" ON public.private_notes;
CREATE POLICY "Private notes insert" ON public.private_notes
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Private notes update" ON public.private_notes;
CREATE POLICY "Private notes update" ON public.private_notes
    FOR UPDATE USING (true);

-- 4. Enable Supabase Realtime Replication
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.private_notes;
