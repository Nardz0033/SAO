import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceRoleKey) return response({ error: 'Server is missing Supabase configuration.' }, 500)
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Sign in is required.' }, 401)

  const accessToken = authorization.slice('Bearer '.length)
  const callerClient = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(accessToken)
  if (callerError || !callerData.user) return response({ error: 'Your session is invalid or expired.' }, 401)

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: callerRoles, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', callerData.user.id)
  if (roleError) return response({ error: 'Could not verify administrator access.' }, 500)
  if (!callerRoles?.some(({ role }) => role === 'super_admin')) return response({ error: 'Only a super admin can delete accounts.' }, 403)

  let targetId: string
  try {
    const payload = await request.json()
    targetId = payload?.userId
  } catch {
    return response({ error: 'A valid user ID is required.' }, 400)
  }
  if (!targetId || typeof targetId !== 'string') return response({ error: 'A valid user ID is required.' }, 400)
  if (targetId === callerData.user.id) return response({ error: 'You cannot delete your own account.' }, 400)

  const { data: targetRoles, error: targetRoleError } = await admin.from('user_roles').select('role').eq('user_id', targetId)
  if (targetRoleError) return response({ error: 'Could not verify the selected account.' }, 500)
  if (targetRoles?.some(({ role }) => role === 'super_admin')) {
    const { count, error: countError } = await admin.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'super_admin')
    if (countError) return response({ error: 'Could not verify super admin coverage.' }, 500)
    if ((count ?? 0) <= 1) return response({ error: 'Keep at least one super admin account.' }, 400)
  }

  // Request files live in Storage and are not removed by PostgreSQL cascades.
  const { data: attachmentObjects, error: storageListError } = await admin
    .storage.from('request-attachments').list(targetId, { limit: 1000 })
  if (storageListError) return response({ error: 'Could not prepare the account files for deletion.' }, 500)
  if (attachmentObjects?.length) {
    const paths = attachmentObjects.filter(({ id }) => id !== null).map(({ name }) => `${targetId}/${name}`)
    const { error: storageDeleteError } = await admin.storage.from('request-attachments').remove(paths)
    if (storageDeleteError) return response({ error: `Account files could not be deleted: ${storageDeleteError.message}` }, 500)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetId)
  if (deleteError) return response({ error: `Account deletion failed: ${deleteError.message}` }, 500)
  return response({ success: true })
})
