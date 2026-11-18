import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, FileText, Search, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'

const statuses = ['submitted', 'under_review', 'in_progress', 'awaiting_student', 'approved', 'rejected', 'completed', 'cancelled'] as const
type Status = typeof statuses[number]
type RequestRow = {
  id: string
  reference_number: string
  subject: string
  description: string
  status: Status
  submitted_at: string
  completed_at: string | null
  priority: 'low' | 'normal' | 'high'
  student_visible_note: string | null
  assigned_staff_id: string | null
  service_categories: { name: string } | null
  profiles: { full_name: string; student_number: string | null; department: string | null; program: string | null } | null
}
type StaffMember = { id: string; full_name: string }

export function StaffRequestsPanel({ canAssign, notify }: { canAssign: boolean; notify: (message: string) => void }) {
  const [items, setItems] = useState<RequestRow[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [submittedAfter,setSubmittedAfter]=useState('')
  const [submittedBefore,setSubmittedBefore]=useState('')
  const [completedAfter,setCompletedAfter]=useState('')
  const [completedBefore,setCompletedBefore]=useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const loadRequests = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data, error: requestError } = await supabase
      .from('service_requests')
      .select('id,reference_number,subject,description,status,priority,submitted_at,completed_at,student_visible_note,assigned_staff_id,service_categories(name),profiles!service_requests_student_id_fkey(full_name,student_number,department,program)')
      .order('submitted_at', { ascending: false })
      .limit(1000)
    if (requestError) setError('Requests could not be loaded. Check the database migration and access policies.')
    else setItems((data ?? []) as unknown as RequestRow[])
    setLoading(false)
  }, [])

  useEffect(() => { void loadRequests() }, [loadRequests])
  const categories = useMemo(() => [...new Set(items.map(item => item.service_categories?.name).filter((name): name is string => Boolean(name)))].sort(), [items])
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return items.filter(item => {
      const profile = item.profiles
      const matchesTerm = !term || [item.reference_number, item.subject, item.description, profile?.full_name, profile?.student_number, profile?.department, profile?.program, item.service_categories?.name, item.assigned_staff_id].some(value => value?.toLowerCase().includes(term))
      const submittedDay=item.submitted_at.slice(0,10), completedDay=item.completed_at?.slice(0,10)||''
      return matchesTerm && (statusFilter === 'all' || item.status === statusFilter) && (categoryFilter === 'all' || item.service_categories?.name === categoryFilter) && (assignmentFilter === 'all' || (assignmentFilter === 'unassigned' ? !item.assigned_staff_id : item.assigned_staff_id === assignmentFilter)) && (!submittedAfter||submittedDay>=submittedAfter)&&(!submittedBefore||submittedDay<=submittedBefore)&&(!completedAfter||(Boolean(completedDay)&&completedDay>=completedAfter))&&(!completedBefore||(Boolean(completedDay)&&completedDay<=completedBefore))
    }).sort((a,b) => sort === 'oldest' ? Date.parse(a.submitted_at)-Date.parse(b.submitted_at) : sort === 'priority' ? ({high:0,normal:1,low:2}[a.priority]-{high:0,normal:1,low:2}[b.priority]) || Date.parse(b.submitted_at)-Date.parse(a.submitted_at) : sort === 'status' ? a.status.localeCompare(b.status) : Date.parse(b.submitted_at)-Date.parse(a.submitted_at))
  }, [items, query, statusFilter, categoryFilter, assignmentFilter, sort,submittedAfter,submittedBefore,completedAfter,completedBefore])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page-1)*pageSize, page*pageSize)
  useEffect(() => {
    if (!supabase || !canAssign) return
    let active = true
    void (async () => {
      const { data: roleRows, error: roleError } = await supabase.from('user_roles').select('user_id').eq('role', 'staff')
      if (roleError || !roleRows?.length) return
      const { data, error: profileError } = await supabase.from('profiles').select('id,full_name').in('id', roleRows.map(row => row.user_id)).order('full_name')
      if (active && !profileError) setStaff(data ?? [])
    })()
    return () => { active = false }
  }, [canAssign])

  async function saveRequest(request: RequestRow, form: HTMLFormElement) {
    if (!supabase) return
    const formData = new FormData(form)
    const status = String(formData.get('status')) as Status
    const note = String(formData.get('student_visible_note') ?? '').trim()
    const assignedStaffId = canAssign ? String(formData.get('assigned_staff_id') ?? '') || null : request.assigned_staff_id
    setSaving(request.id)
    const { error: saveError } = await supabase.from('service_requests').update({
      status,
      student_visible_note: note || null,
      assigned_staff_id: assignedStaffId,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    }).eq('id', request.id)
    if (saveError) notify(`Request was not updated: ${saveError.message}`)
    else {
      notify('Request updated. The student can see the current status and update in request details.')
      await loadRequests()
    }
    setSaving(null)
  }

  async function claimRequest(request: RequestRow) {
    if (!supabase) return
    setSaving(request.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { notify('Sign in again to claim this request.'); setSaving(null); return }
    const { error: claimError } = await supabase.from('service_requests').update({ assigned_staff_id: user.id }).eq('id', request.id).is('assigned_staff_id', null)
    if (claimError) notify(`Request was not claimed: ${claimError.message}`)
    else { notify('Request assigned to you.'); await loadRequests() }
    setSaving(null)
  }

  return <section className="panel standalone-panel admin-panel">
    <div className="panel-heading"><div><span className="eyebrow eyebrow-muted">SERVICE OPERATIONS</span><h2>Requests</h2><p className="admin-lede">Review incoming cases, assign ownership, and send students a status update.</p></div><span className="admin-total">{filtered.length} matching requests</span></div>
    <div className="request-filters">
      <label className="admin-search"><Search size={16}/><input value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} placeholder="Search ID, student, subject, program…" aria-label="Search requests"/></label>
      <select aria-label="Filter by status" value={statusFilter} onChange={event=>{setStatusFilter(event.target.value);setPage(1)}}><option value="all">All statuses</option>{statuses.map(value=><option key={value} value={value}>{label(value)}</option>)}</select>
      <select aria-label="Filter by service" value={categoryFilter} onChange={event=>{setCategoryFilter(event.target.value);setPage(1)}}><option value="all">All services</option>{categories.map(value=><option key={value}>{value}</option>)}</select>
      {canAssign&&<select aria-label="Filter by assigned staff" value={assignmentFilter} onChange={event=>{setAssignmentFilter(event.target.value);setPage(1)}}><option value="all">All assignments</option><option value="unassigned">Unassigned</option>{staff.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select>}
      <select aria-label="Sort requests" value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority</option><option value="status">Status</option></select>
      <label className="request-date-filter">Submitted after<input aria-label="Submitted on or after" type="date" value={submittedAfter} onChange={e=>{setSubmittedAfter(e.target.value);setPage(1)}}/></label><label className="request-date-filter">Submitted before<input aria-label="Submitted on or before" type="date" value={submittedBefore} onChange={e=>{setSubmittedBefore(e.target.value);setPage(1)}}/></label><label className="request-date-filter">Completed after<input aria-label="Completed on or after" type="date" value={completedAfter} onChange={e=>{setCompletedAfter(e.target.value);setPage(1)}}/></label><label className="request-date-filter">Completed before<input aria-label="Completed on or before" type="date" value={completedBefore} onChange={e=>{setCompletedBefore(e.target.value);setPage(1)}}/></label>
      <button className="btn btn-outline btn-small" onClick={()=>{setQuery('');setStatusFilter('all');setCategoryFilter('all');setAssignmentFilter('all');setSort('newest');setSubmittedAfter('');setSubmittedBefore('');setCompletedAfter('');setCompletedBefore('');setPage(1)}}>Clear filters</button>
    </div>
    {error && <div className="admin-message error" role="alert">{error}</div>}
    {loading ? <div className="admin-empty">Loading requests…</div> : filtered.length === 0 ? <div className="admin-empty">{items.length?'No requests match these filters.':'No requests are available yet.'}</div> : <div className="admin-list">{visible.map(request => <article className="request-workflow-row" key={request.id}>
      <div className="request-workflow-heading"><span className="request-icon"><FileText size={17}/></span><div><small>{request.reference_number} · {request.service_categories?.name ?? 'Student service'} · {new Date(request.submitted_at).toLocaleString()}</small><h3>{request.subject}</h3>{request.profiles&&<small>{request.profiles.full_name}{request.profiles.student_number?` · ${request.profiles.student_number}`:''}{request.profiles.program?` · ${request.profiles.program}`:''}</small>}</div><span className={`status-pill status-${request.status}`}>{label(request.status)}</span></div>
      <p className="request-workflow-description">{request.description}</p>
      {request.assigned_staff_id ? <small className="request-assignee"><UserRound size={14}/> Assigned to {staff.find(person => person.id === request.assigned_staff_id)?.full_name ?? (request.assigned_staff_id.slice(0, 8) + '…')}</small> : <small className="request-assignee unassigned">Unassigned</small>}
      {!canAssign && !request.assigned_staff_id ? <button className="btn btn-outline btn-small" disabled={saving === request.id} onClick={() => void claimRequest(request)}>Claim request <ArrowRight size={14}/></button> : <form className="request-workflow-form" onSubmit={event => { event.preventDefault(); void saveRequest(request, event.currentTarget) }}>
        <label>Status<select name="status" defaultValue={request.status}>{statuses.map(status => <option key={status} value={status}>{label(status)}</option>)}</select></label>
        {canAssign && <label>Assigned staff<select name="assigned_staff_id" defaultValue={request.assigned_staff_id ?? ''}><option value="">Unassigned</option>{staff.map(person => <option key={person.id} value={person.id}>{person.full_name || 'Staff member'}</option>)}</select></label>}
        <label className="request-note-field">Student update<input name="student_visible_note" defaultValue={request.student_visible_note ?? ''} maxLength={1000} placeholder="Optional note shown in the student's request history"/></label>
        <button className="btn btn-primary btn-small" disabled={saving === request.id}>{saving === request.id ? 'Saving…' : 'Save update'}</button>
      </form>}
    </article>)}</div>}
    {!loading&&filtered.length>pageSize&&<div className="request-pagination"><span>Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span><button className="btn btn-outline btn-small" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="btn btn-outline btn-small" disabled={page===pageCount} onClick={()=>setPage(page+1)}>Next</button></div>}
  </section>
}

function label(status: string) { return status.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase()) }
