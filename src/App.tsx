import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, HeartHandshake, LockKeyhole, Menu, X } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'

const Landing = lazy(() => import('./components/Landing').then(module => ({ default: module.Landing })))
const AuthPage = lazy(() => import('./components/AuthPages').then(module => ({ default: module.AuthPage })))
const ResetPasswordPage = lazy(() => import('./components/AuthPages').then(module => ({ default: module.ResetPasswordPage })))
const Workspace = lazy(() => import('./components/Workspace').then(module => ({ default: module.Workspace })))

function App() { return <AuthProvider><Shell /></AuthProvider> }
function Shell() {
  const { session, profile, roles, loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const location = useLocation(); const navigate = useNavigate()
  const role = roles.includes('super_admin') ? 'super_admin' : roles.includes('admin') ? 'admin' : roles.includes('staff') ? 'staff' : 'student'
  useEffect(() => { setMenuOpen(false) }, [location.pathname])
  async function signOut() { await supabase?.auth.signOut(); navigate('/') }
  if (loading) return <div className="loading-screen"><img className="brand-logo" src="/sao-logo.png" alt="SAO Student Affairs Office"/><div className="loader"/><span>Preparing your space</span></div>
  return <>
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
    <header className="topbar"><div className="topbar-inner">
      <Link to="/" className="brand"><img className="brand-logo" src="/sao-logo.png" alt="SAO Student Affairs Office"/><span className="brand-connect">Connect</span></Link>
      <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X/> : <Menu/>}</button>
      <nav className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Main navigation">
        <a href="/#services">Services</a><a href="/#announcements">Updates</a><a href="/#how">How it works</a><Link to="/help">Help center</Link>
      </nav>
      <div className="top-actions">{session ? <><Link to={role === 'student' ? '/student/dashboard' : `/${role === 'super_admin' ? 'admin' : role}/dashboard`} className="btn btn-quiet">My workspace <ArrowRight size={15}/></Link><button className="avatar" title="Sign out" onClick={signOut}>{profile?.full_name?.[0]?.toUpperCase() || 'U'}</button></> : <><Link to="/login" className="btn btn-quiet">Log in</Link><Link to="/register" className="btn btn-primary">Get started <ArrowUpRight size={16}/></Link></>}</div>
    </div></header>
    <Suspense fallback={<div className="loading-screen"><div className="loader"/><span>Loading your workspace</span></div>}><Routes>
      <Route path="/" element={<Landing/>}/>
      <Route path="/login" element={<AuthPage mode="login" notify={setNotice}/>}/><Route path="/register" element={<AuthPage mode="register" notify={setNotice}/>}/><Route path="/forgot-password" element={<AuthPage mode="forgot" notify={setNotice}/>}/><Route path="/reset-password" element={<ResetPasswordPage notify={setNotice}/>}/>
      <Route path="/help" element={<HelpPage/>}/>
      <Route path="/student/*" element={<Protected role="student"><Workspace role="student" notify={setNotice}/></Protected>}/>
      <Route path="/staff/*" element={<Protected role="staff"><Workspace role="staff" notify={setNotice}/></Protected>}/>
      <Route path="/admin/*" element={<Protected role="admin"><Workspace role="admin" notify={setNotice}/></Protected>}/>
      <Route path="*" element={<NotFound/>}/>
    </Routes></Suspense>
    <Footer/>
  </>
}

function Protected({ role, children }: { role:'student'|'staff'|'admin'; children:React.ReactNode }) {
 const {session,roles,loading}=useAuth(); const loc=useLocation()
 if(loading)return <div className="loading-screen"><div className="loader"/></div>
 if(!session)return <Navigate to="/login" state={{from:loc.pathname}} replace/>
 const allowed=role==='student'?roles.includes('student'):role==='staff'?roles.some(r=>['staff','admin','super_admin'].includes(r)):roles.some(r=>['admin','super_admin'].includes(r))
 if(!allowed)return <main className="access-denied"><div className="auth-card"><span className="denied-icon"><LockKeyhole/></span><h1>This space is restricted</h1><p>Your account doesn’t have access to this workspace. If you believe this is a mistake, contact your Student Affairs Office administrator.</p><Link className="btn btn-primary" to="/">Back to home</Link></div></main>
 return <>{children}</>
}

function HelpPage(){return <main className="simple-page"><div className="container"><div className="eyebrow eyebrow-muted">SAOCONNECT HELP CENTER</div><h1>How can we help?</h1><p className="simple-lede">Get answers about using SAOConnect.</p><div className="simple-card"><h2>Getting started</h2><p>Create a student account with your university email. Verify your email address, then sign in to submit service requests, book appointments when available, and browse campus events.</p><h2>Request privacy</h2><p>Your private requests, appointments, and attachments are protected by database access policies. Students can access only their own records.</p><h2>Connecting the university</h2><p>To activate accounts and live service data, configure a Supabase project using the setup instructions in the project README and apply the included database migration.</p><Link className="btn btn-primary" to="/register">Get started <ArrowRight size={16}/></Link></div></div></main>}
function NotFound(){return <main className="simple-page"><div className="container"><div className="simple-card"><span className="eyebrow eyebrow-muted">PAGE NOT FOUND</span><h1>Looks like this page wandered off.</h1><p>The link may be out of date. Head back to the SAOConnect home page.</p><Link className="btn btn-primary" to="/">Back home <ArrowRight size={16}/></Link></div></div></main>}
function Footer(){return <footer className="footer"><div className="container footer-main"><div className="footer-brand"><Link to="/" className="brand"><img className="brand-logo" src="/sao-logo.png" alt="SAO Student Affairs Office"/><span className="brand-connect">Connect</span></Link><p>Student Affairs support, campus updates, and activities for CTU Daanbantayan students.</p></div><div className="footer-col"><b>Explore</b><a href="/#services">Services</a><a href="/#announcements">Office updates</a><a href="/#how">How it works</a></div><div className="footer-col"><b>Support</b><Link to="/help">Help center</Link><Link to="/login">Sign in</Link><Link to="/register">Student account</Link></div><div className="footer-contact"><span className="footer-contact-icon"><HeartHandshake size={19}/></span><div><b>Here when you need us.</b><p>Visit the CTU Daanbantayan Campus Student Affairs Office for official support and office hours.</p><small>Contact details and office hours will be provided by your campus SAO.</small></div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} SAOConnect · CTU Daanbantayan Campus</span><span><LockKeyhole size={12}/> Student-first. Privacy-minded.</span><span>Built for campus connection <span className="footer-heart">✳</span></span></div></footer>}

export default App
