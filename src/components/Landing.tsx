import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, FileText, MessageSquareText, ShieldCheck, Sparkles, Users } from 'lucide-react'
const services = [
  { icon: FileText, title: 'Student requests', text: 'Submit a concern or request and follow every update in one place.', tag: 'Clear updates' },
  { icon: CalendarDays, title: 'Appointments', text: 'Find an available time with Student Affairs and book online.', tag: 'Easy booking' },
  { icon: Users, title: 'Campus life', text: 'Discover activities, register for events, and stay connected.', tag: 'Get involved' },
]

export function Landing() {
 const [currentTime, setCurrentTime] = useState(() => new Date())
 const officeTimeParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(currentTime)
 const officeWeekday = officeTimeParts.find(part => part.type === 'weekday')?.value
 const officeHour = Number(officeTimeParts.find(part => part.type === 'hour')?.value)
 const saoIsOpen = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(officeWeekday || '') && officeHour >= 8 && officeHour < 17
 const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; category: string; published_at: string | null; is_pinned: boolean }>>([])
 const [announcementsLoading, setAnnouncementsLoading] = useState(true)
 const [announcementsFailed, setAnnouncementsFailed] = useState(false)
 useEffect(() => {
  const interval = window.setInterval(() => setCurrentTime(new Date()), 1000)
  return () => window.clearInterval(interval)
 }, [])
 useEffect(() => {
  let active = true
  async function loadAnnouncements() {
   if (!supabase) { setAnnouncementsLoading(false); return }
   const { data, error } = await supabase.from('announcements')
    .select('id,title,content,category,published_at,is_pinned')
    .eq('status', 'published').eq('audience', 'all')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('is_pinned', { ascending: false }).order('published_at', { ascending: false }).limit(4)
   if (!active) return
   setAnnouncements(data || [])
   setAnnouncementsFailed(Boolean(error))
   setAnnouncementsLoading(false)
  }
  void loadAnnouncements()
  return () => { active = false }
 }, [])
 return <main>
  <section className="hero"><div className="hero-grid"/><div className="container hero-content"><motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:.55}} className="hero-copy">
   <div className="eyebrow"><span className="eyebrow-dot"/> CTU DAANBANTAYAN CAMPUS · STUDENT AFFAIRS</div>
   <h1>Support for your<br/><span>campus life.</span></h1>
   <p className="hero-lede">Connect with the Student Affairs Office at CTU Daanbantayan Campus, track your requests, book appointments, and keep up with campus activities.</p>
   <div className="hero-buttons"><Link className="btn btn-primary btn-large" to="/register">Get started <ArrowRight size={17}/></Link><a className="btn btn-outline btn-large" href="#how">See how it works <ArrowDown size={16}/></a><a className="text-link hero-contact-link" href="https://web.facebook.com/ctudaanbantayansao" target="_blank" rel="noopener noreferrer">Contact Student Affairs <ArrowUpRight size={15}/></a></div>
   <div className="trust-line"><span className="trust-icon"><ShieldCheck size={16}/></span><span>Your information stays private and secure</span><span className="trust-sep">·</span><span>Made for students</span></div>
  </motion.div><motion.div initial={{opacity:0,scale:.96,y:12}} animate={{opacity:1,scale:1,y:0}} transition={{duration:.65,delay:.12}} className="hero-art" aria-label="Current time in the Philippines">
    <div className="hero-clock-display">
      <time className="hero-clock" dateTime={currentTime.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h12' }).format(currentTime)}</time>
      <time className="hero-date" dateTime={currentTime.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(currentTime)}</time>
      <div className={`hero-office-status${saoIsOpen ? ' is-open' : ' is-closed'}`} role="status" aria-live="polite">
        <span className="hero-office-indicator" aria-hidden="true" />
        <span>{saoIsOpen ? 'Open now' : 'Closed now'}</span>
        <span className="hero-office-hours">Mon–Fri · 8:00 AM–5:00 PM · Closed weekends and holidays</span>
      </div>
    </div>
   </motion.div></div><a className="scroll-cue" href="#services"><span>SCROLL TO EXPLORE</span><ArrowDown size={14}/></a></section>
  <section className="proof-strip"><div className="container proof-inner"><span>ONE SIMPLE PLACE FOR</span><div><MessageSquareText size={16}/> Student support</div><div><CalendarDays size={16}/> Appointments</div><div><Sparkles size={16}/> Campus life</div><div><Bell size={16}/> Office updates</div></div></section>
  <section className="section services-section" id="services"><div className="container"><div className="section-heading"><div><div className="eyebrow eyebrow-muted">MADE AROUND YOUR DAY</div><h2>Student services,<br/><span>without the runaround.</span></h2></div><p>From your first question to your next campus event, find the support you need without chasing forms or wondering what happens next.</p></div><div className="service-grid">{services.map((s,i)=><motion.article className="service-card" key={s.title} initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true,margin:'-40px'}} transition={{delay:i*.09}}><div className={`service-icon service-icon-${i}`}><s.icon size={21}/></div><span className="service-tag">{s.tag}</span><h3>{s.title}</h3><p>{s.text}</p><Link to="/register" aria-label={`Explore ${s.title}`}>Explore <ArrowRight size={15}/></Link></motion.article>)}</div></div></section>
  <section className="updates-section" id="announcements"><div className="container"><div className="section-heading updates-heading"><div><div className="eyebrow eyebrow-muted">THE LATEST FROM SAO</div><h2>Good to <span>know.</span></h2></div><p>Official announcements and campus updates from CTU Daanbantayan Campus.</p></div>{announcementsLoading ? <div className="announcement-empty" role="status"><b>Loading campus updates…</b></div> : announcementsFailed ? <div className="announcement-empty" role="status"><b>Updates are temporarily unavailable</b><p>Please check back soon or contact the Student Affairs Office directly.</p></div> : announcements.length ? <div className="announcement-grid">{announcements.map((item, index) => <article className="announcement-card" key={item.id}><div className={`announcement-art art-${index % 2}`} aria-hidden="true"><span className="art-orb"/><span className="art-label">{item.category.slice(0, 12)}</span><span className="art-spark">✳</span><span className="art-number">SAO · {String(index + 1).padStart(2, '0')}</span></div><div className="announcement-body"><div className="announcement-meta"><span>{item.category}{item.is_pinned ? ' · PINNED' : ''}</span><small>{item.published_at ? new Date(item.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Official update'}</small></div><h3>{item.title}</h3><p>{item.content.length > 190 ? `${item.content.slice(0, 187).trimEnd()}…` : item.content}</p></div></article>)}</div> : <div className="announcement-empty"><b>No announcements yet</b><p>Check back here for official updates from the CTU Daanbantayan Campus Student Affairs Office.</p></div>}</div></section>
  <section className="how-section" id="how"><div className="container how-layout"><div className="how-intro"><div className="eyebrow eyebrow-muted">A BETTER WAY TO GET THINGS DONE</div><h2>From question<br/>to <span>sorted.</span></h2><p>No wondering whether your request went through. No digging for the right contact. Just a clear next step, every time.</p><Link to="/register" className="text-link">Create your account <ArrowRight size={16}/></Link></div><div className="steps"><article className="step"><span className="step-num">01</span><div className="step-graphic step-blue"><Users size={20}/></div><div><h3>Find the right service</h3><p>Browse guidance and choose the help you need, with requirements clearly explained.</p></div></article><article className="step"><span className="step-num">02</span><div className="step-graphic step-peach"><FileText size={20}/></div><div><h3>Send it in, on your time</h3><p>Submit a request or book an appointment without making a trip to the office.</p></div></article><article className="step"><span className="step-num">03</span><div className="step-graphic step-mint"><Check size={20}/></div><div><h3>Know where things stand</h3><p>Get clear status updates, useful follow-ups, and a simple record of what’s done.</p></div></article></div></div></section>
  <section className="faq-section"><div className="container faq-layout"><div><div className="eyebrow eyebrow-muted">A FEW QUICK ANSWERS</div><h2>Good questions.<br/><span>Clear answers.</span></h2><Link className="text-link" to="/help">Visit the help center <ArrowRight size={16}/></Link></div><div className="faq-list"><details><summary>Who can use SAOConnect?<ChevronDown size={17}/></summary><p>Students can create an account to access services. SAO staff and administrators receive access only after an authorized administrator assigns their role.</p></details><details><summary>Can I check my request after I send it?<ChevronDown size={17}/></summary><p>Yes. Once you sign in, you can see your request reference, current status, and student-visible updates in your workspace.</p></details><details><summary>Are the notices on this page official?<ChevronDown size={17}/></summary><p>Yes. Announcements are published by authorized CTU Daanbantayan Campus staff.</p></details></div></div></section>
  <section className="cta-section"><div className="container cta-card"><div className="cta-decoration"/><div className="cta-copy"><div className="eyebrow cta-eyebrow">YOUR NEXT STEP STARTS HERE</div><h2>Student life has<br/>enough on its plate.</h2><p>Let’s make getting support one less thing to worry about.</p></div><Link to="/register" className="btn btn-white btn-large">Join SAOConnect <ArrowRight size={17}/></Link><span className="cta-star">✳</span></div></section>
 </main>
}
