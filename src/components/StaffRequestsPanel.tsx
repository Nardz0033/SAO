import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, FileText, UserRound } from 'lucide-react'
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
  student_visible_note: string | null
  assigned_staff_id: string | null
  service_categories: { name: string } | null
}
type StaffMember = { id: string; full_name: string }

export function StaffRequestsPanel({ canAssign, notify }: { canAssign: boolean; notify: (message: string) => void }) {
  const [items, setItems] = useState<RequestRow[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadRequests = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data, error: requestError } = await supabase
      .from('service_requests')
      .select('id,reference_number,subject,description,status,submitted_at,student_visible_note,assigned_staff_id,service_categories(name)')
      .order('submitted_at', { ascending: false })
      .limit(100)
    if (requestError) setError('Requests could not be loaded. Check the database migration and access policies.')
    else setItems((data ?? []) as unknown as RequestRow[])
    setLoading(false)
  }, [])

  useEffect(() => { void loadRequests() }, [loadRequests])
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
    <div className="panel-heading"><div><span className="eyebrow eyebrow-muted">SERVICE OPERATIONS</span><h2>Requests</h2><p className="admin-lede">Review incoming cases, assign ownership, and send students a status update.</p></div><span className="admin-total">{items.length} requests</span></div>
    {error && <div className="admin-message error" role="alert">{error}</div>}
    {loading ? <div className="admin-empty">Loading requests…</div> : items.length === 0 ? <div className="admin-empty">No requests are available yet.</div> : <div className="admin-list">{items.map(request => <article className="request-workflow-row" key={request.id}>
      <div className="request-workflow-heading"><span className="request-icon"><FileText size={17}/></span><div><small>{request.reference_number} · {request.service_categories?.name ?? 'Student service'} · {new Date(request.submitted_at).toLocaleString()}</small><h3>{request.subject}</h3></div><span className={`status-pill status-${request.status}`}>{label(request.status)}</span></div>
      <p className="request-workflow-description">{request.description}</p>
      {request.assigned_staff_id ? <small className="request-assignee"><UserRound size={14}/> Assigned to {staff.find(person => person.id === request.assigned_staff_id)?.full_name ?? (request.assigned_staff_id.slice(0, 8) + '…')}</small> : <small className="request-assignee unassigned">Unassigned</small>}
      {!canAssign && !request.assigned_staff_id ? <button className="btn btn-outline btn-small" disabled={saving === request.id} onClick={() => void claimRequest(request)}>Claim request <ArrowRight size={14}/></button> : <form className="request-workflow-form" onSubmit={event => { event.preventDefault(); void saveRequest(request, event.currentTarget) }}>
        <label>Status<select name="status" defaultValue={request.status}>{statuses.map(status => <option key={status} value={status}>{label(status)}</option>)}</select></label>
        {canAssign && <label>Assigned staff<select name="assigned_staff_id" defaultValue={request.assigned_staff_id ?? ''}><option value="">Unassigned</option>{staff.map(person => <option key={person.id} value={person.id}>{person.full_name || 'Staff member'}</option>)}</select></label>}
        <label className="request-note-field">Student update<input name="student_visible_note" defaultValue={request.student_visible_note ?? ''} maxLength={1000} placeholder="Optional note shown in the student's request history"/></label>
        <button className="btn btn-primary btn-small" disabled={saving === request.id}>{saving === request.id ? 'Saving…' : 'Save update'}</button>
      </form>}
    </article>)}</div>}
  </section>
}

function label(status: string) { return status.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase()) }
