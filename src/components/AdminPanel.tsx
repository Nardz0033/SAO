import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, FileText, Plus, Search, Shield, Trash2, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase, type AppRole } from '../lib/supabase'

type Person = { id: string; full_name: string; email: string; department: string | null; program: string | null; created_at: string }
type UserRow = { person: Person; roles: AppRole[] }
type Category = { id: string; name: string; description: string; estimated_processing_days: number | null; is_active: boolean }
const roleOrder: AppRole[] = ['student', 'staff', 'admin', 'super_admin']

export function AdminPanel({ section, notify }: { section: string; notify: (message: string) => void }) {
  if (!supabase) return <section className="panel standalone-panel"><p>Connect the Supabase project to use administration tools.</p></section>
  if (section === 'Users & roles') return <UsersPanel notify={notify}/>
  if (section === 'Services') return <ServicesPanel notify={notify}/>
  if (section === 'Feedback') return <FeedbackPanel/>
  if (section === 'Reports') return <ReportsPanel/>
  if (section === 'Audit logs') return <AuditPanel/>
  if (section === 'Availability') return <AvailabilityPanel notify={notify}/>
  return null
}

function UsersPanel({ notify }: { notify: (message: string) => void }) {
  const { session, roles } = useAuth()
  const isSuperAdmin = roles.includes('super_admin')
  const [users, setUsers] = useState<UserRow[]>([])
  const [query, setQuery] = useState('')
  const [roleDraft, setRoleDraft] = useState<AppRole>('staff')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  async function load() {
    if (!supabase) return
    setLoading(true); setError('')
    const [profilesResult, rolesResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email,department,program,created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('user_roles').select('user_id,role'),
    ])
    if (profilesResult.error || rolesResult.error) setError('Could not load users and roles. Check the admin policies and migration status.')
    else {
      const rows = profilesResult.data ?? []
      const assignments = rolesResult.data ?? []
      setUsers(rows.map(person => ({ person, roles: assignments.filter(item => item.user_id === person.id).map(item => item.role as AppRole).sort((a,b) => roleOrder.indexOf(a)-roleOrder.indexOf(b)) })))
    }
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return users.filter(({ person, roles: userRoles }) => !term || [person.full_name, person.email, person.department, ...userRoles].some(value => value?.toLowerCase().includes(term)))
  }, [users, query])
  async function changeRole(user: UserRow, role: AppRole, remove: boolean) {
    if (!supabase || !session || saving) return
    if (user.person.id === session.user.id) { notify('For safety, you cannot change your own role here.'); return }
    if (remove && user.roles.length <= 1) { notify('Every account must keep at least one role.'); return }
    if (remove && role === 'super_admin' && users.filter(row => row.roles.includes('super_admin')).length <= 1) { notify('Keep at least one super admin assigned.'); return }
    if (!isSuperAdmin && role !== 'staff') { notify('Only a super admin can assign elevated roles.'); return }
    setSaving(user.person.id)
    const result = remove
      ? await supabase.from('user_roles').delete().eq('user_id', user.person.id).eq('role', role)
      : await supabase.from('user_roles').insert({ user_id: user.person.id, role })
    setSaving(null)
    if (result.error) notify(`Role update failed: ${result.error.message}`)
    else { notify(remove ? `${role.replace('_',' ')} role removed.` : `${role.replace('_',' ')} role assigned.`); await load() }
  }
  return <section className="panel standalone-panel admin-panel">
    <div className="panel-heading"><div><span className="eyebrow eyebrow-muted">ACCOUNT ACCESS</span><h2>Users &amp; roles</h2><p className="admin-lede">Review accounts and assign the access each person needs.</p></div><span className="admin-total"><Users size={16}/>{users.length} accounts</span></div>
    <div className="admin-toolbar"><label className="admin-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search name, email, department or role"/></label><span>{isSuperAdmin?'You can manage every role.':'You can assign or remove staff access.'}</span></div>
    {error&&<div className="admin-message error">{error}<button onClick={()=>void load()}>Retry</button></div>}
    {loading?<div className="admin-empty">Loading accounts…</div>:visible.length===0?<div className="admin-empty">No matching accounts.</div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Account</th><th>Department</th><th>Roles</th><th>Access controls</th></tr></thead><tbody>{visible.map(user=>{const own=user.person.id===session?.user.id;return <tr key={user.person.id}><td><b>{user.person.full_name||'Unnamed account'}</b><small>{user.person.email}</small></td><td>{user.person.department||'—'}{user.person.program&&<small>{user.person.program}</small>}</td><td><div className="role-chips">{user.roles.map(role=><span className={`role-chip role-${role}`} key={role}>{role.replace('_',' ')}</span>)}</div></td><td>{own?<small className="admin-muted">Your own access is protected</small>:<div className="role-actions"><select aria-label={`Choose role for ${user.person.full_name}`} value={roleDraft} onChange={event=>setRoleDraft(event.target.value as AppRole)}><option value="staff">Staff</option>{isSuperAdmin&&<><option value="admin">Admin</option><option value="super_admin">Super admin</option><option value="student">Student</option></>}</select><button className="btn btn-outline btn-small" disabled={saving===user.person.id||user.roles.includes(roleDraft)} onClick={()=>void changeRole(user,roleDraft,false)}><Plus size={13}/> Assign</button>{user.roles.filter(role=>isSuperAdmin||role==='staff').map(role=><button className="remove-role" key={role} title={`Remove ${role} role`} disabled={saving===user.person.id||user.roles.length<=1||(role==='super_admin'&&users.filter(row=>row.roles.includes('super_admin')).length<=1)} onClick={()=>void changeRole(user,role,true)}><Trash2 size={13}/></button>)}</div>}</td></tr>})}</tbody></table></div>}
    <p className="admin-footnote"><Shield size={14}/> A regular admin can manage staff roles. Only super admins can assign or remove admin and super admin access. Role permissions are enforced by database policies.</p>
  </section>
}

function ServicesPanel({ notify }: { notify: (message: string) => void }) {
  const [items, setItems] = useState<Category[]>([]); const [loading,setLoading]=useState(true); const [showForm,setShowForm]=useState(false)
  async function load(){if(!supabase)return;const{data,error}=await supabase.from('service_categories').select('id,name,description,estimated_processing_days,is_active').order('name');if(error)notify(`Services could not be loaded: ${error.message}`);else setItems(data??[]);setLoading(false)}
  useEffect(()=>{void load()},[])
  async function create(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase)return;const form=event.currentTarget;const fd=new FormData(form);const days=String(fd.get('days')||'');const{error}=await supabase.from('service_categories').insert({name:String(fd.get('name')).trim(),description:String(fd.get('description')).trim(),estimated_processing_days:days?Number(days):null});if(error)notify(`Service was not created: ${error.message}`);else{notify('Service category created.');setShowForm(false);form.reset();await load()}}
  async function toggle(item:Category){if(!supabase)return;const{error}=await supabase.from('service_categories').update({is_active:!item.is_active}).eq('id',item.id);if(error)notify(`Service was not updated: ${error.message}`);else await load()}
  return <section className="panel standalone-panel admin-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-muted">STUDENT SUPPORT</span><h2>Service categories</h2><p className="admin-lede">Control which services students can request.</p></div><button className="btn btn-primary btn-small" onClick={()=>setShowForm(!showForm)}><Plus size={14}/> Add service</button></div>
    {showForm&&<form className="admin-inline-form" onSubmit={create}><label>Service name<input name="name" required maxLength={100}/></label><label>Processing days<input name="days" type="number" min="1" placeholder="Optional"/></label><label className="wide">Description<textarea name="description" rows={2} maxLength={1000}/></label><button className="btn btn-primary btn-small">Create category</button></form>}
    {loading?<div className="admin-empty">Loading service categories…</div>:<div className="admin-list">{items.map(item=><article className="admin-list-row" key={item.id}><span className="admin-list-icon"><FileText size={17}/></span><div className="admin-list-copy"><b>{item.name}</b><p>{item.description||'No description provided.'}</p><small>{item.estimated_processing_days?`${item.estimated_processing_days} business days`:'No estimated turnaround'}</small></div><span className={`admin-status ${item.is_active?'active':''}`}>{item.is_active?'Active':'Inactive'}</span><button className="btn btn-outline btn-small" onClick={()=>void toggle(item)}>{item.is_active?'Deactivate':'Activate'}</button></article>)}{items.length===0&&<div className="admin-empty">No service categories found.</div>}</div>}
  </section>
}

function FeedbackPanel(){const[items,setItems]=useState<{id:string;rating:number;comments:string|null;created_at:string;student_id:string;request_id:string|null;appointment_id:string|null}[]>([]);const[loading,setLoading]=useState(true);useEffect(()=>{if(!supabase)return;void supabase.from('feedback').select('id,rating,comments,created_at,student_id,request_id,appointment_id').order('created_at',{ascending:false}).limit(200).then(({data,error})=>{if(!error&&data)setItems(data);setLoading(false)})},[]);return <section className="panel standalone-panel admin-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-muted">STUDENT EXPERIENCE</span><h2>Feedback</h2><p className="admin-lede">Recent ratings and comments from completed services.</p></div><span className="admin-total">{items.length} responses</span></div>{loading?<div className="admin-empty">Loading feedback…</div>:items.length?<div className="admin-list">{items.map(item=><article className="feedback-row" key={item.id}><div><span className="feedback-stars">{'★'.repeat(item.rating)}<span>{'★'.repeat(5-item.rating)}</span></span><small>{new Date(item.created_at).toLocaleString()} · {item.request_id?'Service request':'Appointment'}</small></div><p>{item.comments||'No written comment.'}</p><small>Account {item.student_id.slice(0,8)}</small></article>)}</div>:<div className="admin-empty">No feedback has been submitted yet.</div>}</section>}

function ReportsPanel(){const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[data,setData]=useState<{total:number;byStatus:Record<string,number>;feedbackCount:number}>({total:0,byStatus:{},feedbackCount:0});useEffect(()=>{if(!supabase)return;const statuses=['submitted','under_review','in_progress','awaiting_student','approved','rejected','completed','cancelled'];void Promise.all([supabase.from('service_requests').select('id',{count:'exact',head:true}),supabase.from('feedback').select('id',{count:'exact',head:true}),...statuses.map(status=>supabase!.from('service_requests').select('id',{count:'exact',head:true}).eq('status',status))]).then(results=>{const[total,feedback,...byStatusResults]=results;if(total.error||feedback.error||byStatusResults.some(result=>result.error))setError('Report counts could not be loaded.');else{const byStatus:Record<string,number>={};statuses.forEach((status,index)=>{const count=byStatusResults[index].count??0;if(count)byStatus[status]=count});setData({total:total.count??0,byStatus,feedbackCount:feedback.count??0})}setLoading(false)})},[]);const max=Math.max(1,...Object.values(data.byStatus));return <section className="panel standalone-panel admin-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-muted">SERVICE OPERATIONS</span><h2>Reports</h2><p className="admin-lede">A live summary of requests and student feedback.</p></div></div>{error&&<div className="admin-message error">{error}</div>}{loading?<div className="admin-empty">Building report…</div>:<><div className="report-stats"><div><small>Total requests</small><b>{data.total}</b></div><div><small>Feedback responses</small><b>{data.feedbackCount}</b></div><div><small>Request statuses</small><b>{Object.keys(data.byStatus).length}</b></div></div><section className="report-breakdown"><h3>Requests by status</h3>{Object.keys(data.byStatus).length?Object.entries(data.byStatus).sort((a,b)=>b[1]-a[1]).map(([status,count])=><div className="report-bar-row" key={status}><span>{status.replaceAll('_',' ')}</span><div><i style={{width:`${Math.max(5,count/max*100)}%`}}/></div><b>{count}</b></div>):<p className="admin-empty">No request activity yet.</p>}</section></>}</section>}

function AuditPanel(){const[items,setItems]=useState<{id:number;actor_id:string|null;action:string;entity_type:string;entity_id:string|null;metadata:Record<string,unknown>;created_at:string}[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');useEffect(()=>{if(!supabase)return;void supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,metadata,created_at').order('created_at',{ascending:false}).limit(200).then(({data,error})=>{if(error)setError(error.message);else setItems(data??[]);setLoading(false)})},[]);return <section className="panel standalone-panel admin-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-muted">SECURITY &amp; ACCOUNTABILITY</span><h2>Audit logs</h2><p className="admin-lede">A record of administrative actions and important system changes.</p></div><span className="admin-total">Latest 200</span></div>{error&&<div className="admin-message error">Audit logs could not be loaded. {error}</div>}{loading?<div className="admin-empty">Loading audit history…</div>:items.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>When</th><th>Action</th><th>Record</th><th>Actor</th><th>Details</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td><b>{item.action}</b></td><td>{item.entity_type}{item.entity_id&&<small>{item.entity_id.slice(0,8)}</small>}</td><td>{item.actor_id?.slice(0,8)||'System'}</td><td><code>{JSON.stringify(item.metadata)}</code></td></tr>)}</tbody></table></div>:<div className="admin-empty">No audit entries have been recorded yet.</div>}</section>}

function AvailabilityPanel({ notify }: { notify:(message:string)=>void }){
 const{session}=useAuth();const[staff,setStaff]=useState<Person[]>([]);const[slots,setSlots]=useState<{id:string;staff_id:string;available_date:string;start_time:string;end_time:string;is_available:boolean}[]>([]);const[loading,setLoading]=useState(true)
 async function load(){if(!supabase)return;const[profiles,assignments,availability]=await Promise.all([supabase.from('profiles').select('id,full_name,email,department,program,created_at').order('full_name'),supabase.from('user_roles').select('user_id').eq('role','staff'),supabase.from('staff_availability').select('id,staff_id,available_date,start_time,end_time,is_available').order('available_date',{ascending:false}).limit(300)]);if(profiles.error||assignments.error||availability.error)notify('Could not load staff availability. Check the admin migration and database policies.');else{const ids=new Set((assignments.data??[]).map(row=>row.user_id));setStaff((profiles.data??[]).filter(person=>ids.has(person.id)));setSlots(availability.data??[])}setLoading(false)}
 useEffect(()=>{void load()},[])
 async function add(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase||!session)return;const form=event.currentTarget;const fd=new FormData(form);const{error}=await supabase.from('staff_availability').insert({staff_id:String(fd.get('staff')),available_date:String(fd.get('date')),start_time:String(fd.get('start')),end_time:String(fd.get('end')),is_available:true});if(error)notify(`Availability was not added: ${error.message}`);else{notify('Staff availability added.');form.reset();await load()}}
 async function remove(id:string){if(!supabase)return;const{error}=await supabase.from('staff_availability').delete().eq('id',id);if(error)notify(`Availability was not removed: ${error.message}`);else setSlots(current=>current.filter(slot=>slot.id!==id))}
 return <section className="panel standalone-panel admin-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-muted">STAFF SCHEDULING</span><h2>Availability</h2><p className="admin-lede">Publish and maintain appointment times for staff.</p></div><span className="admin-total"><Clock3 size={16}/>{slots.filter(slot=>slot.is_available).length} open slots</span></div><form className="admin-inline-form availability-form" onSubmit={add}><label>Staff<select name="staff" required defaultValue=""><option value="" disabled>Select a staff member</option>{staff.map(person=><option value={person.id} key={person.id}>{person.full_name||person.email}</option>)}</select></label><label>Date<input name="date" type="date" required min={new Date().toISOString().slice(0,10)}/></label><label>Start<input name="start" type="time" required/></label><label>End<input name="end" type="time" required/></label><button className="btn btn-primary btn-small"><Plus size={14}/> Add slot</button></form>{loading?<div className="admin-empty">Loading staff availability…</div>:slots.length?<div className="admin-list">{slots.map(slot=><article className="admin-list-row" key={slot.id}><span className="admin-list-icon"><Clock3 size={17}/></span><div className="admin-list-copy"><b>{staff.find(person=>person.id===slot.staff_id)?.full_name||'Staff member'}</b><p>{new Date(`${slot.available_date}T00:00:00`).toLocaleDateString()} · {slot.start_time.slice(0,5)}–{slot.end_time.slice(0,5)}</p></div><span className={`admin-status ${slot.is_available?'active':''}`}>{slot.is_available?'Available':'Reserved'}</span>{slot.is_available&&<button className="remove-role" title="Remove time slot" onClick={()=>void remove(slot.id)}><Trash2 size={14}/></button>}</article>)}</div>:<div className="admin-empty"><Check size={17}/> No staff availability added yet.</div>}</section>
}
