import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type AppRole, type Profile } from './supabase'

type AuthState = { session: Session | null; profile: Profile | null; roles: AppRole[]; loading: boolean; refresh: () => Promise<AppRole[] | null> }
const AuthContext = createContext<AuthState>({ session: null, profile: null, roles: [], loading: true, refresh: async () => null })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)
  async function refresh(): Promise<AppRole[] | null> {
    if (!supabase) { setLoading(false); return null }
    const { data: { session: current } } = await supabase.auth.getSession()
    setSession(current)
    if (current?.user) {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('id,full_name,email,department,program').eq('id', current.user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', current.user.id),
      ])
      setProfile(p.data as Profile | null)
      if (r.error) {
        setRoles([])
        setLoading(false)
        return null
      }
      const currentRoles = (r.data ?? []).map((x) => x.role as AppRole)
      setRoles(currentRoles)
      setLoading(false)
      return currentRoles
    } else { setProfile(null); setRoles([]) }
    setLoading(false)
    return null
  }
  useEffect(() => {
    void refresh()
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      window.setTimeout(() => void refresh(), 0)
    })
    return () => subscription.unsubscribe()
  }, [])
  return <AuthContext.Provider value={{ session, profile, roles, loading, refresh }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
