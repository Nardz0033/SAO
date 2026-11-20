import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, FileText, MessageSquareText, ShieldCheck, Sparkles, Users, Megaphone, Clock3, X } from 'lucide-react'
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
 const [selectedAnnouncement, setSelectedAnnouncement] = useState<(typeof announcements)[number] | null>(null)
 const [showAllAnnouncements, setShowAllAnnouncements] = useState(false)
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
    .order('is_pinned', { ascending: false }).order('published_at', { ascending: false }).limit(24)
   if (!active) return
   setAnnouncements(data || [])
   setAnnouncementsFailed(Boolean(error))
   setAnnouncementsLoading(false)
  }
  void loadAnnouncements()
  return () => { active = false }
 }, [])
 useEffect(() => {
  if (!selectedAnnouncement) return
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedAnnouncement(null) }
  document.addEventListener('keydown', onKeyDown)
  document.body.style.overflow = 'hidden'
  return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = '' }
 }, [selectedAnnouncement])
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
  <section className="updates-section" id="announcements"><div className="container"><div className="section-heading updates-heading"><div><div className="eyebrow eyebrow-muted">THE LATEST FROM SAO</div><h2>Good to <span>know.</span></h2></div><p>Official announcements and campus updates from CTU Daanbantayan Campus.</p></div>{announcementsLoading ? <div className="announcement-empty" role="status"><b>Loading campus updates…</b></div> : announcementsFailed ? <div className="announcement-empty" role="status"><b>Updates are temporarily unavailable</b><p>Please check back soon or contact the Student Affairs Office directly.</p></div> : announcements.length ? <>
   <div className={`announcement-grid${showAllAnnouncements ? ' announcement-grid-all' : ''}`}>
    {(showAllAnnouncements ? announcements : announcements.slice(0, 3)).map((item, index) => {
     const category = item.category.toLowerCase()
     const tone = category.includes('important') ? 'important' : category.includes('event') || category.includes('life') ? 'event' : category.includes('reminder') ? 'reminder' : category.includes('academic') ? 'academic' : 'general'
     const date = item.published_at ? new Date(item.published_at) : null
     const preview = item.content.replace(/\s+/g, ' ').trim()
     return <motion.button type="button" className={`announcement-card announcement-feature announcement-${tone}${index === 0 && (item.is_pinned || tone === 'important') ? ' is-featured' : ''}`} key={item.id} onClick={() => setSelectedAnnouncement(item)} aria-label={`Read announcement: ${item.title}`} initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true,margin:'-30px'}} transition={{duration:.35,delay:Math.min(index,3)*.07}}>
      <span className="announcement-visual" aria-hidden="true"><span className="announcement-visual-orb"/><span className="announcement-visual-icon"><Megaphone size={30}/></span><span className="announcement-visual-caption">CTU · SAO</span></span>
      <span className="announcement-content"><span className="announcement-topline"><span className={`announcement-badge badge-${tone}`}><i/> {item.category}</span>{(item.is_pinned || tone === 'important') && <span className="announcement-featured-label"><Sparkles size={12}/> Featured</span>}</span>
       <span className="announcement-title">{item.title}</span><span className="announcement-preview">{preview}</span>
       <span className="announcement-footer"><span className="announcement-date"><Clock3 size={14}/>{date ? <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(date)}</time> : 'Official update'}</span><span className="announcement-read">Read more <ArrowUpRight size={15}/></span></span>
      </span>
     </motion.button>
    })}
   </div>
   {announcements.length > 3 && <button className="announcement-view-all" type="button" onClick={() => setShowAllAnnouncements(value => !value)}>{showAllAnnouncements ? 'Show featured updates' : 'View all announcements'} <ArrowRight size={15}/></button>}
   </> : <div className="announcement-empty"><b>No announcements yet</b><p>Check back here for official updates from the CTU Daanbantayan Campus Student Affairs Office.</p></div>}</div></section>
   {selectedAnnouncement && <div className="announcement-dialog-scrim" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedAnnouncement(null) }}><section className="announcement-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-dialog-title"><button type="button" className="announcement-dialog-close" onClick={() => setSelectedAnnouncement(null)} aria-label="Close announcement"><X size={20}/></button><div className="announcement-dialog-kicker"><Megaphone size={17}/> STUDENT AFFAIRS OFFICE</div><span className={`announcement-badge badge-${selectedAnnouncement.category.toLowerCase().includes('important')?'important':selectedAnnouncement.category.toLowerCase().includes('event')||selectedAnnouncement.category.toLowerCase().includes('life')?'event':selectedAnnouncement.category.toLowerCase().includes('reminder')?'reminder':selectedAnnouncement.category.toLowerCase().includes('academic')?'academic':'general'}`}><i/> {selectedAnnouncement.category}</span><h2 id="announcement-dialog-title">{selectedAnnouncement.title}</h2><p className="announcement-dialog-date">{selectedAnnouncement.published_at ? new Intl.DateTimeFormat(undefined,{dateStyle:'full',timeStyle:'short'}).format(new Date(selectedAnnouncement.published_at)) : 'Official campus update'}</p><div className="announcement-dialog-copy">{selectedAnnouncement.content}</div>{selectedAnnouncement.is_pinned && <div className="announcement-dialog-note"><Sparkles size={15}/> Pinned by the Student Affairs Office</div>}</section></div>}
  <section className="how-section" id="how"><div className="container how-layout"><div className="how-intro"><div className="eyebrow eyebrow-muted">A BETTER WAY TO GET THINGS DONE</div><h2>From question<br/>to <span>sorted.</span></h2><p>No wondering whether your request went through. No digging for the right contact. Just a clear next step, every time.</p><Link to="/register" className="text-link">Create your account <ArrowRight size={16}/></Link></div><div className="steps"><article className="step"><span className="step-num">01</span><div className="step-graphic step-blue"><Users size={20}/></div><div><h3>Find the right service</h3><p>Browse guidance and choose the help you need, with requirements clearly explained.</p></div></article><article className="step"><span className="step-num">02</span><div className="step-graphic step-peach"><FileText size={20}/></div><div><h3>Send it in, on your time</h3><p>Submit a request or book an appointment without making a trip to the office.</p></div></article><article className="step"><span className="step-num">03</span><div className="step-graphic step-mint"><Check size={20}/></div><div><h3>Know where things stand</h3><p>Get clear status updates, useful follow-ups, and a simple record of what’s done.</p></div></article></div></div></section>
  <section className="faq-section"><div className="container faq-layout"><div className="faq-intro"><div className="eyebrow eyebrow-muted">A FEW QUICK ANSWERS</div><h2>Good questions.<br/><span>Clear answers.</span></h2><Link className="text-link" to="/help">Visit the help center <ArrowRight size={16}/></Link></div><div className="faq-list"><details><summary>Who can use SAOConnect?<ChevronDown size={17}/></summary><div className="faq-answer"><p>Students can create an account to access services. SAO staff and administrators receive access only after an authorized administrator assigns their role.</p></div></details><details><summary>Can I check my request after I send it?<ChevronDown size={17}/></summary><div className="faq-answer"><p>Yes. Once you sign in, you can see your request reference, current status, and student-visible updates in your workspace.</p></div></details><details><summary>Are the notices on this page official?<ChevronDown size={17}/></summary><div className="faq-answer"><p>Yes. Announcements are published by authorized CTU Daanbantayan Campus staff.</p></div></details></div></div></section>
 </main>
}
