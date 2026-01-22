// supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://tcvfnmpaevkjwwsbsndz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdmZubXBhZXZrand3c2JzbmR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODI3MDcsImV4cCI6MjA3ODk1ODcwN30.WvSc57gD1fdE-gBmFgQJCDVcJz8IJkzTYFedNObmMCY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
