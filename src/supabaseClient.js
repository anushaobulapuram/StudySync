import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cesfrfuwzizbgidrelmp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qBuTHcAgIlj-uEh1sluSag__AoCovV0'; // Akkada copy chesina key ni ikkada paste chey

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);