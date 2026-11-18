import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Category = { id:string; name:string; description:string; requirements:string; processing_instructions:string; contact_information:string; availability_status:string; estimated_processing_days:number|null }
type Document = { id:string; category_id:string; title:string; description:string; storage_path:string; mime_type:string }

export function SAOServices() {
  const [categories,setCategories]=useState<Category[]>([])
  const [documents,setDocuments]=useState<Document[]>([])
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('all')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{if(!supabase){setLoading(false);return}let active=true;void Promise.all([
    supabase.from('service_categories').select('id,name,description,requirements,processing_instructions,contact_information,availability_status,estimated_processing_days').eq('is_active',true).neq('availability_status','archived').order('name'),
    supabase.from('service_documents').select('id,category_id,title,description,storage_path,mime_type').eq('is_active',true).eq('is_public',true).order('title'),
  ]).then(([categoryResult,documentResult])=>{if(!active)return;if(categoryResult.error||documentResult.error)setError('SAO services could not be loaded. Apply the latest database migration and check your connection.');else{setCategories(categoryResult.data??[]);setDocuments(documentResult.data??[])}setLoading(false)});return()=>{active=false}},[])
  const visible=useMemo(()=>categories.filter(item=>(category==='all'||item.id===category)&&(!query.trim()||[item.name,item.description,item.requirements,item.processing_instructions].some(text=>text?.toLowerCase().includes(query.trim().toLowerCase())))),[categories,query,category])
  async function download(document:Document){if(!supabase)return;const{data,error}=await supabase.storage.from('sao-documents').createSignedUrl(document.storage_path,60);if(error){setError(`Could not open ${document.title}: ${error.message}`);return}window.open(data.signedUrl,'_blank','noopener,noreferrer')}
  return <section className="panel standalone-panel admin-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-muted">STUDENT AFFAIRS OFFICE</span><h2>SAO Services and Documents</h2><p className="admin-lede">Browse service information and authenticated student documents. Confirm specific procedures with the SAO office.</p></div></div>
    <div className="service-catalog-filters"><label className="admin-search"><Search size={16}/><input aria-label="Search services" placeholder="Search services and requirements" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter service category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
    {error&&<div className="admin-message error" role="alert">{error}</div>}{loading?<div className="admin-empty">Loading available services…</div>:visible.length?<div className="service-catalog">{visible.map(item=><article className="service-catalog-card" key={item.id}><div className="service-catalog-heading"><span className="admin-list-icon"><FileText size={18}/></span><div><h3>{item.name}</h3><span className={`admin-status ${item.availability_status==='available'?'active':''}`}>{item.availability_status.replaceAll('_',' ')}</span></div></div><p>{item.description||'Contact the SAO office for service details.'}</p>{item.requirements&&<div><b>Requirements</b><p>{item.requirements}</p></div>}{item.processing_instructions&&<div><b>How to avail</b><p>{item.processing_instructions}</p></div>}{item.estimated_processing_days&&<small>Estimated processing: {item.estimated_processing_days} business days</small>}{item.contact_information&&<div><b>Office contact</b><p>{item.contact_information}</p></div>}{documents.filter(document=>document.category_id===item.id).map(document=><article className="service-document-row" key={document.id}><div><b>{document.title}</b>{document.description&&<small>{document.description}</small>}</div><button className="btn btn-outline btn-small" onClick={()=>void download(document)}><Download size={14}/> Download</button></article>)}</article>)}</div>:<div className="admin-empty">No matching services have been published yet.</div>}
  </section>
}
