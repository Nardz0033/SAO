import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

export type AppRole = 'student' | 'staff' | 'admin' | 'super_admin'
export type Profile = { id: string; full_name: string; email: string; department: string | null; program: string | null }
export type ServiceRequest = {
  id: string; reference_number: string; subject: string; description: string; status: string;
  submitted_at: string; student_visible_note: string | null; service_categories?: { name: string } | null
}
