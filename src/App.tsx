import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, HeartHandshake, LockKeyhole, Menu, X, UserRound, Settings, LogOut, Camera, ChevronDown } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { ProfileEditor } from './components/ProfileEditor'

const Landing = lazy(() => import('./components/Landing').then(module => ({ default: module.Landing })))
const AuthPage = lazy(() => import('./components/AuthPages').then(module => ({ default: module.AuthPage })))
const ResetPasswordPage = lazy(() => import('./components/AuthPages').then(module => ({ default: module.ResetPasswordPage })))
const Workspace = lazy(() => import('./components/Workspace').then(module => ({ default: module.Workspace })))

function App() { return <AuthProvider><Shell /></AuthProvider> }
function Shell() {
  const { session, profile, roles, loading, refresh } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileViewerOpen, setProfileViewerOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation(); const navigate = useNavigate()
  const role = roles.includes('super_admin') ? 'super_admin' : roles.includes('admin') ? 'admin' : roles.includes('staff') ? 'staff' : 'student'
  useEffect(() => { setMenuOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!profileMenuOpen) return
    const outside = (event: PointerEvent) => { if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileMenuOpen(false) }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [profileMenuOpen])
  useEffect(() => { let active = true; if (!supabase || !profile?.avatar_path) { setProfilePhotoUrl(''); return () => { active = false } } void supabase.storage.from('profile-photos').createSignedUrl(profile.avatar_path, 3600).then(({ data, error }) => { if (active) setProfilePhotoUrl(error ? '' : data?.signedUrl || '') }); return () => { active = false } }, [profile?.avatar_path])
  async function signOut() { await supabase?.auth.signOut(); navigate('/') }
  if (loading) return <div className="loading-screen"><img className="brand-logo" src="/sao-logo.png" alt="SAO Student Affairs Office"/><div className="loader"/><span>Preparing your space</span></div>
  return <>
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16}/></button></div>}
    <header className={`topbar${location.pathname.startsWith('/student') || location.pathname.startsWith('/staff') || location.pathname.startsWith('/admin') ? ' topbar-workspace' : ''}`}><div className="topbar-inner">
      <Link to="/" className="brand"><img className="brand-logo" src="/sao-logo.png" alt="SAO Student Affairs Office"/><span className="brand-copy"><span className="brand-connect">Connect</span><small className="brand-campus">CTU DAANBANTAYAN CAMPUS</small></span></Link>
      <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="main-navigation">{menuOpen ? <X/> : <Menu/>}</button>
      <nav id="main-navigation" className={menuOpen ? 'nav-links open' : 'nav-links'} aria-label="Main navigation">
        <a href="/#services">Services</a><a href="/#announcements">Updates</a><a href="/#how">How it works</a><Link to="/help">Help center</Link>
      </nav>
      <div className="top-actions">{session ? <><Link to={role === 'student' ? '/student/dashboard' : `/${role === 'super_admin' ? 'admin' : role}/dashboard`} className="btn btn-quiet">My workspace <ArrowRight size={15}/></Link><div className="profile-menu-wrap" ref={profileMenuRef}><button className="avatar" title="Open profile menu" aria-label="Open profile menu" aria-expanded={profileMenuOpen} onClick={()=>setProfileMenuOpen(value=>!value)}>{profilePhotoUrl?<img src={profilePhotoUrl} alt=""/>:profile?.full_name?.[0]?.toUpperCase() || 'U'}<ChevronDown size={12} className="avatar-chevron"/></button>{profileMenuOpen&&<div className="profile-dropdown" role="menu"><div className="profile-dropdown-user"><b>{profile?.full_name||'SAO Connect user'}</b><small>{profile?.email||session.user.email}</small></div><button role="menuitem" onClick={()=>{setProfileMenuOpen(false);setProfileViewerOpen(true)}}><UserRound size={16}/>View Profile</button><button role="menuitem" onClick={()=>{setProfileMenuOpen(false);setProfileEditorOpen(true)}}><Camera size={16}/>Edit Profile</button><button role="menuitem" onClick={()=>{setProfileMenuOpen(false);navigate('/reset-password')}}><Settings size={16}/>Account Settings</button><button role="menuitem" className="profile-logout" onClick={()=>void signOut()}><LogOut size={16}/>Logout</button></div>}</div></> : <><Link to="/login" className="btn btn-quiet">Log in</Link><Link to="/register" className="btn btn-primary">Get started <ArrowUpRight size={16}/></Link></>}</div>
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
    {profileViewerOpen&&profile&&session&&<ProfileEditor mode="view" profile={profile} accountEmail={session.user.email||profile.email} close={()=>setProfileViewerOpen(false)} onSaved={async()=>{}}/>}
    {profileEditorOpen&&profile&&session&&<ProfileEditor profile={profile} accountEmail={session.user.email||profile.email} close={()=>setProfileEditorOpen(false)} onSaved={async()=>{await refresh();setProfileEditorOpen(false);setNotice('Your profile has been updated.')}}/>}
    <Footer workspace={location.pathname.startsWith('/student') || location.pathname.startsWith('/staff') || location.pathname.startsWith('/admin')}/>
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

function HelpPage(){return <main className="simple-page"><div className="container"><div className="eyebrow eyebrow-muted">CTU DAANBANTAYAN CAMPUS · SAOCONNECT HELP</div><h1>How can we help?</h1><p className="simple-lede">Guidance for using Student Affairs services at CTU Daanbantayan Campus.</p><div className="simple-card">
 <h2>Create your account</h2><ol><li>Select <b>Get started</b> and sign up with an email address you can access. You can use your personal email; a university email isn’t required.</li><li>Check your inbox for a verification message and follow the link to confirm your address.</li><li>Return to SAOConnect and sign in to open your student workspace.</li></ol>
 <h2>Submit and follow a request</h2><ol><li>Sign in and choose the relevant service or request option.</li><li>Describe what you need and include the details the SAO team will need to assist you.</li><li>Submit the form, then keep the reference number shown after submission.</li><li>Check <b>My requests</b> in your workspace for the latest status and updates.</li></ol>
 <h2>Appointments and campus updates</h2><p>When appointment times or campus events are available, you can view them in your workspace. Official announcements will appear on the landing page when authorized CTU Daanbantayan Campus staff publish them.</p>
 <h2>Response times</h2><p>SAOConnect does not currently show a guaranteed response time. Check your request status for updates. If your concern is time-sensitive, contact or visit the CTU Daanbantayan Campus Student Affairs Office.</p>
 <h2>Urgent concerns</h2><p>For a concern that needs prompt attention, contact the campus Student Affairs Office directly through its official page or visit the office. If someone is in immediate danger, contact local emergency services.</p>
 <h2>Trouble accessing your account?</h2><p>If the verification message does not appear, check your spam or junk folder and make sure you entered your email address correctly. If you can no longer access the email address linked to your account, contact the campus Student Affairs Office for help.</p>
 <h2>Contact CTU Daanbantayan SAO</h2><p>Send a message through the official Student Affairs Office Facebook page for campus contact and support.</p><a className="btn btn-outline" href="https://web.facebook.com/ctudaanbantayansao" target="_blank" rel="noopener noreferrer">Contact Student Affairs <ArrowUpRight size={16}/></a>
 <h2>Request privacy</h2><p>Your requests, appointments, and attachments are protected. Students can access only their own records, while authorized SAO staff can access information needed to handle requests.</p>
 <Link className="btn btn-primary" to="/register">Get started <ArrowRight size={16}/></Link>
 </div></div></main>}
function NotFound(){return <main className="simple-page"><div className="container"><div className="simple-card"><span className="eyebrow eyebrow-muted">PAGE NOT FOUND</span><h1>Looks like this page wandered off.</h1><p>The link may be out of date. Head back to the SAOConnect home page.</p><Link className="btn btn-primary" to="/">Back home <ArrowRight size={16}/></Link></div></div></main>}
function Footer({workspace=false}:{workspace?:boolean}){return <footer className={`footer${workspace?' footer-workspace':''}`}><div className="container footer-main"><div className="footer-brand"><Link to="/" className="brand"><img className="brand-logo" src="/sao-logo.png" alt="SAO Student Affairs Office"/><span className="brand-copy"><span className="brand-connect">Connect</span><small className="brand-campus">CTU DAANBANTAYAN CAMPUS</small></span></Link><p>Student Affairs support, campus updates, and activities for CTU Daanbantayan students.</p></div><div className="footer-col"><b>Explore</b><a href="/#services">Services</a><a href="/#announcements">Office updates</a><a href="/#how">How it works</a></div><div className="footer-col"><b>Support</b><Link to="/help">Help center</Link><Link to="/login">Sign in</Link><Link to="/register">Student account</Link></div><div className="footer-contact"><span className="footer-contact-icon"><HeartHandshake size={19}/></span><div><b>Here when you need us.</b><p>Visit the CTU Daanbantayan Campus Student Affairs Office for official support and office hours.</p><small>Contact details and office hours will be provided by your campus SAO.</small></div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} SAOConnect · CTU Daanbantayan Campus</span><span><LockKeyhole size={12}/> Student-first. Privacy-minded.</span><span>Built for campus connection <span className="footer-heart">✳</span></span></div></footer>}

export default App
