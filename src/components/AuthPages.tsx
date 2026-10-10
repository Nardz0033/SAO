import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, GraduationCap, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
export function AuthPage({ mode, notify }: { mode: 'login'|'register'|'forgot'; notify: (v:string)=>void }) {
 const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [showPassword,setShowPassword]=useState(false); const nav=useNavigate(); const location=useLocation()
 const authSchema=z.object({name:z.string().trim().optional(),email:z.email('Enter a valid email address.'),password:z.string().optional()})
 type AuthFields=z.infer<typeof authSchema>
 const {register:bind,handleSubmit,formState:{errors:fieldErrors}}=useForm<AuthFields>({resolver:zodResolver(authSchema)})
 const title=mode==='login'?'Welcome back':mode==='register'?'Make campus life a little easier':'Reset your password'
 async function submit(values:AuthFields){setBusy(true);setError(''); if(!supabase){setError('Connect your Supabase project to enable account access. See the setup guide in README.md.');setBusy(false);return}
  const email=values.email; const password=values.password||''
  const result=mode==='register'?await supabase.auth.signUp({email,password,options:{data:{full_name:values.name||''},emailRedirectTo:window.location.origin}}):mode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/reset-password`})
  if(result.error)setError(result.error.message);else if(mode==='register'){notify('Check your email for a verification link.');nav('/login')}else if(mode==='forgot'){notify('If an account exists for that email, a reset link is on its way.');nav('/login')}else {
   const userId=(result.data as {user?:{id?:string}|null}).user?.id
   if(!userId){setError('Sign-in succeeded, but the account ID could not be read. Please try again.');setBusy(false);return}
   const {data:roleRows,error:roleError}=await supabase.from('user_roles').select('role').eq('user_id',userId)
   if(roleError){setError(`Signed in, but your account role could not be loaded: ${roleError.message}. Ask a project administrator to check the user_roles table and its read policy.`);setBusy(false);return}
   const assignedRoles=(roleRows??[]).map(row=>row.role)
   const home=assignedRoles.includes('admin')||assignedRoles.includes('super_admin')?'/admin/dashboard':assignedRoles.includes('staff')?'/staff/dashboard':'/student/dashboard'
   const requested=(location.state as {from?:string}|null)?.from
   const expectedPrefix=home.startsWith('/admin')?'/admin/':home.startsWith('/staff')?'/staff/':'/student/'
   nav(requested?.startsWith(expectedPrefix)?requested:home)
  }
  setBusy(false)
 }
 return <main className="auth-page"><div className="auth-orb auth-orb-a"/><div className="auth-orb auth-orb-b"/><div className="auth-card"><Link to="/" className="brand auth-brand"><span className="brand-mark"><GraduationCap size={21}/></span><span>SAO<span className="brand-light">Connect</span><small>STUDENT AFFAIRS OFFICE</small></span></Link><div className="auth-heading"><div className="eyebrow eyebrow-muted">{mode==='register'?'A WARM WELCOME TO CAMPUS SUPPORT':mode==='login'?'YOUR STUDENT SPACE':'ACCOUNT RECOVERY'}</div><h1>{title}</h1><p>{mode==='register'?'Create your student account to access services and campus updates.':mode==='login'?'Sign in to see your requests, appointments, and campus updates.':'Enter your email and we’ll send a secure reset link.'}</p></div>
  {!isSupabaseConfigured&&<div className="config-callout"><LockKeyhole size={17}/><span>Account access is ready once Supabase is connected. Add your project settings to <code>.env</code>.</span></div>}
  <form className="auth-form" onSubmit={handleSubmit(submit)}>{mode==='register'&&<label>Full name<input {...bind('name')} type="text" autoComplete="name" placeholder="e.g. Alex Rivera" required minLength={2}/></label>}<label>University email<input {...bind('email')} type="email" autoComplete="email" placeholder="you@university.edu" required/>{fieldErrors.email&&<small className="field-error">{fieldErrors.email.message}</small>}</label>{mode!=='forgot'&&<label>Password<div className="password-control"><input {...bind('password')} type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="At least 8 characters" required minLength={8}/><button className="password-toggle" type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}</button></div></label>}
  {mode==='login'&&<Link className="forgot-link" to="/forgot-password">Forgot password?</Link>}{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-primary btn-large submit-btn" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':mode==='register'?'Create my account':'Send reset link'} <ArrowRight size={17}/></button></form>
   <p className="auth-switch">{mode==='login'?<>New to SAOConnect? <Link to="/register">Create an account</Link></>:mode==='register'?<>Already have an account? <Link to="/login">Sign in</Link></>:<>Remembered your password? <Link to="/login">Sign in</Link></>}</p><div className="auth-secure"><ShieldCheck size={14}/> Your account and personal requests are protected by university access controls.</div>
 </div></main>
}

export function ResetPasswordPage({notify}:{notify:(v:string)=>void}) {
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [showPassword,setShowPassword]=useState(false);const nav=useNavigate()
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(!supabase){setError('Connect your Supabase project first.');return}const password=String(new FormData(e.currentTarget).get('password'));setBusy(true);const{error}=await supabase.auth.updateUser({password});setBusy(false);if(error)setError(error.message);else{notify('Your password has been updated.');nav('/login')}}
 return <main className="auth-page"><div className="auth-card"><Link to="/" className="brand auth-brand"><span className="brand-mark"><GraduationCap size={21}/></span><span>SAO<span className="brand-light">Connect</span><small>STUDENT AFFAIRS OFFICE</small></span></Link><div className="auth-heading"><div className="eyebrow eyebrow-muted">ACCOUNT RECOVERY</div><h1>Choose a new password</h1><p>Set a new password for your SAOConnect account.</p></div><form className="auth-form" onSubmit={submit}><label>New password<div className="password-control"><input name="password" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} required/><button className="password-toggle" type="button" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}</button></div></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-primary btn-large submit-btn" disabled={busy}>{busy?'Saving…':'Update password'} <ArrowRight size={17}/></button></form></div></main>
}
