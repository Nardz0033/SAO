import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Camera, X } from 'lucide-react'
import type { Profile } from '../lib/supabase'
import { supabase } from '../lib/supabase'

type Values = {
  first_name: string; middle_name: string; last_name: string; student_number: string; email: string
  contact_number: string; program: string; department: string; year_level: string; section: string; gender: string
  photoFile: File | null; removePhoto: boolean
}

export function ProfileEditor({ profile, accountEmail, close, onSaved }: { profile: Profile; accountEmail: string; close: () => void; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState<Values>({
    first_name: profile.first_name || profile.full_name.split(' ')[0] || '', middle_name: profile.middle_name || '',
    last_name: profile.last_name || profile.full_name.split(' ').slice(1).join(' '), student_number: profile.student_number || '',
    email: accountEmail, contact_number: profile.contact_number || '', program: profile.program || '',
    department: profile.department || '', year_level: profile.year_level || '', section: profile.section || '',
    gender: profile.gender || '', photoFile: null, removePhoto: false,
  })
  const initial = useRef(values)
  const [photo, setPhoto] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial.current)

  useEffect(() => {
    let active = true
    if (!profile.avatar_path || !supabase) return () => { active = false }
    void supabase.storage.from('profile-photos').createSignedUrl(profile.avatar_path, 3600).then(({ data }) => { if (active) setPhoto(data?.signedUrl || '') })
    return () => { active = false }
  }, [profile.avatar_path])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  })

  function dismiss() {
    if (dirty && !window.confirm('Discard your unsaved profile changes?')) return
    close()
  }
  function update<K extends keyof Values>(key: K, value: Values[K]) { setValues(current => ({ ...current, [key]: value })) }
  function selectPhoto(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WEBP image.'); if (fileRef.current) fileRef.current.value = ''; return }
    if (file.size > 5 * 1024 * 1024) { setError('The image must be 5 MB or smaller.'); if (fileRef.current) fileRef.current.value = ''; return }
    setError(''); update('photoFile', file); update('removePhoto', false); setPhoto(URL.createObjectURL(file))
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!values.first_name.trim() || !values.last_name.trim() || !values.student_number.trim() || !values.email.trim()) { setError('First name, last name, student ID, and email are required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) { setError('Enter a valid email address.'); return }
    if (!supabase) { setError('Profile saving is unavailable right now.'); return }
    setBusy(true)
    let uploadedPath: string | null = null
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Your session has expired. Please sign in again.')
      if (values.photoFile) {
        const extension = values.photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('profile-photos').upload(uploadedPath, values.photoFile, { contentType: values.photoFile.type, upsert: false, cacheControl: '3600' })
        if (uploadError) throw uploadError
      }
      const nextEmail = values.email.trim()
      if (nextEmail !== accountEmail) {
        const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail })
        if (emailError) throw emailError
      }
      const fullName = [values.first_name.trim(), values.middle_name.trim(), values.last_name.trim()].filter(Boolean).join(' ')
      const { photoFile: _file, removePhoto: _removePhoto, ...fields } = values
      const { error: updateError, count } = await supabase.from('profiles').update({
        ...fields, email: nextEmail, full_name: fullName, student_number: values.student_number.trim(),
        first_name: values.first_name.trim(), middle_name: values.middle_name.trim(), last_name: values.last_name.trim(),
        contact_number: values.contact_number.trim(), program: values.program.trim(), department: values.department.trim(),
        year_level: values.year_level.trim(), section: values.section.trim(), gender: values.gender,
        avatar_path: values.removePhoto ? null : uploadedPath || profile.avatar_path,
      }, { count: 'exact' }).eq('id', user.id)
      if (updateError) throw updateError
      if (count === 0) throw new Error('Your profile could not be found. Please sign in again.')
      if ((uploadedPath || values.removePhoto) && profile.avatar_path) await supabase.storage.from('profile-photos').remove([profile.avatar_path])
      await onSaved()
    } catch (caught) {
      if (uploadedPath) await supabase.storage.from('profile-photos').remove([uploadedPath])
      const message = caught instanceof Error ? caught.message : 'Unable to save your profile. Please try again.'
      setError(message.includes('duplicate key') || message.includes('profiles_student_number_key') ? 'That student ID is already linked to another account.' : message)
    } finally { setBusy(false) }
  }

  const textField = (key: keyof Values, label: string, required = false, type = 'text') => <label className="profile-field" key={key}>{label}{required && <span> *</span>}<input type={type} required={required} value={String(values[key] || '')} onChange={event => update(key, event.target.value)}/></label>
  return <div className="modal-scrim profile-editor-scrim" onMouseDown={event => { if (event.target === event.currentTarget) dismiss() }}><section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
    <header className="profile-editor-head"><div><span className="eyebrow eyebrow-muted">YOUR ACCOUNT</span><h2 id="profile-editor-title">Edit profile</h2><p>Keep your student information up to date.</p></div><button className="modal-close" aria-label="Close profile editor" onClick={dismiss}><X/></button></header>
    <form onSubmit={submit}><div className="profile-editor-body">
      <div className="profile-photo-field"><div className="profile-photo-preview">{photo && !values.removePhoto ? <img src={photo} alt="Profile preview"/> : values.removePhoto ? (values.first_name[0] || 'U').toUpperCase() : profile.full_name[0]?.toUpperCase()}</div><div className="profile-photo-controls"><b>Profile picture</b><small>JPG, PNG or WEBP · up to 5 MB</small><div><label className="btn btn-outline btn-small profile-photo-choose"><Camera size={15}/>{values.photoFile ? 'Change picture' : 'Upload picture'}<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => selectPhoto(event.target.files?.[0])}/></label>{(photo || profile.avatar_path) && <button type="button" className="profile-photo-remove" onClick={() => { update('photoFile', null); update('removePhoto', true); setPhoto('') }}>Remove</button>}</div></div></div>
      <div className="profile-fields-grid">{textField('first_name', 'First name', true)}{textField('middle_name', 'Middle name')}{textField('last_name', 'Last name', true)}{textField('student_number', 'Student ID', true)}{textField('email', 'Email address', true, 'email')}{textField('contact_number', 'Contact number', false, 'tel')}{textField('program', 'Course / Program')}{textField('year_level', 'Year level')}{textField('section', 'Section')}<label className="profile-field">Gender<select value={values.gender} onChange={event => update('gender', event.target.value)}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Self-describe</option></select></label></div>
      {error && <p className="profile-editor-error" role="alert">{error}</p>}
    </div><footer className="profile-editor-actions"><button type="button" className="btn btn-outline" onClick={dismiss} disabled={busy}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></footer></form>
  </section></div>
}
