// Real frontend adapters + real PostgreSQL RPC bodies, via a disposable Unix-socket bridge.
// Auth UID and Storage schemas are fixtures. This is not an HTTP/Supabase/provider E2E.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClientPortal } from '../../src/lib/client-portal.ts'
import { createOperations } from '../../src/lib/operations.ts'
import { createRpcAttempt } from '../../src/lib/rpc-attempt.ts'
import { createBoardOperations, DEVELOPMENT_PHASES } from '../../contracts/board-operations-client.mjs'
import { createTicketMetrics } from '../../contracts/ticket-metrics-client.mjs'
import { attachmentMetadata } from '../../contracts/ticket-security-client.mjs'

globalThis.fetch = () => { throw new Error('External HTTP forbidden in SQL integration tests') }
const f = JSON.parse(readFileSync(0, 'utf8'))
const roles = [null, f.owner, 'anon', 'authenticated', 'service_role']
const lit = value => value == null ? 'NULL' : typeof value === 'boolean' ? String(value)
  : typeof value === 'number' ? String(value) : "'" + (typeof value === 'object' ? JSON.stringify(value) : String(value)).replaceAll("'", "''") + "'"
function sql(text, role = f.owner, actor = null) {
  assert.ok(roles.includes(role))
  if (actor) assert.match(actor, /^[0-9a-f-]{36}$/)
  return spawnSync(f.base[0], f.base.slice(1), { encoding: 'utf8', env: process.env,
    input: (role ? `SET ROLE ${role};\n` : '') + `SET request.jwt.claim.sub=${lit(actor ?? '')};\n` + text })
}
function q(text, role, actor) {
  const r = sql(text, role, actor)
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}
const json = (text, role, actor) => JSON.parse(q(text, role, actor))
const pass = name => console.log('PASS ' + name)
function denied(text, role, actor, code = '42501') {
  const r = sql(text, role, actor)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, new RegExp(code))
}
assert.equal(q('SHOW data_directory', null), f.cluster)
assert.equal(q('SHOW listen_addresses', null), '')
assert.ok(f.cluster.startsWith('/tmp/procont-integrated-'))

function client(role, actor = null, token = null) {
  return {
    async rpc(name, args) {
      assert.match(name, /^[a-z_]+$/)
      const params = Object.entries(args).map(([k,v]) => {
        assert.match(k, /^p_[a-z_]+$/)
        return `${k}=>${lit(v)}`
      }).join(',')
      const call = `public.${name}(${params})`
      const statement = name === 'get_ticket_performance'
        ? `SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM ${call} t`
        : `SELECT coalesce(to_jsonb(${call}),'null'::jsonb)`
      const r = sql(statement, role, actor)
      return r.status ? { data: null, error: { code: r.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] ?? 'XX000',
        message: r.stderr.match(/ERROR:\s+[A-Z0-9]{5}:\s+([^\n]+)/)?.[1] ?? 'Local SQL bridge error' } }
        : { data: JSON.parse(r.stdout.trim()), error: null }
    },
    // Only the external identity assertion is simulated; session/products are real M13 SQL.
    functions: { invoke: async () => ({ data: { session_token: token, session: {} }, error: null }) },
  }
}
const admin = client('authenticated', f.users.admin)
const ops = createOperations(admin), board = createBoardOperations(admin)
for (const role of ['anon','authenticated','service_role']) {
  denied("SELECT public.submit_client_request('{}',gen_random_uuid())",role,role==='authenticated'?f.users.admin:null)
}
for (const name of ['submit_request','submit_classified_request']) {
  const args = name==='submit_request' ? "'{}',gen_random_uuid()" : "'{}','{}',gen_random_uuid()"
  for (const role of ['external','inactive','viewer']) denied(`SELECT public.${name}(${args})`,'authenticated',f.users[role])
}
pass('M15 effective permissions reject direct legacy creation and external/inactive/viewer internal intake')

const makePortal = token => createClientPortal(client('anon',null,token), {
  enabled:true, metadata:attachmentMetadata,
  upload:async (grant,file) => q(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES(${lit(grant.bucket)},${lit(grant.path)},${lit({size:file.size,mimetype:file.type})})`,'anon'),
})
const qp = makePortal(f.tokens.quipu), fac = makePortal(f.tokens.quipufac)
const lq = await qp.login({auth_type:'quipu',ruc:'20000000016',username:'FixtureUser',password:'synthetic-only'})
const lf = await fac.login({auth_type:'quipufac',ruc:'20000000016',password:'synthetic-only'})
assert.equal(lq.session.studio_id,f.study); assert.equal(lf.session.studio_id,f.study)
assert.ok(lq.session.products.some(p=>p.id===f.quipu));assert.ok(!lf.session.products.some(p=>p.id===f.quipu))
const subsystem=q(`SELECT id FROM public.catalog_subsystems WHERE system_id=${lit(f.quipu)} AND is_active ORDER BY id LIMIT 1`)
const facSubsystem=q(`SELECT id FROM public.catalog_subsystems WHERE system_id=${lit(f.fac)} AND is_active ORDER BY id LIMIT 1`)
const input={requester_name:'Synthetic integration customer',system_id:f.quipu,subsystem_id:subsystem,request_type_id:f.typ,title:'Integrated Quipu fixture',description:'Fictitious local data only',requested_priority:'medium',urgent_requested:false}
const key=randomUUID(), before=Number(q('SELECT count(*) FROM public.requests'))
const rq=await qp.submitTicket(lq.token,lq.session,input,createRpcAttempt(()=>key))
assert.deepEqual(await qp.submitTicket(lq.token,lq.session,input,createRpcAttempt(()=>key)),rq)
const rf=await fac.submitTicket(lf.token,lf.session,{...input,system_id:f.fac,subsystem_id:facSubsystem,title:'Integrated QuipuFac fixture'},createRpcAttempt())
assert.equal(Number(q('SELECT count(*) FROM public.requests')),before+2)
assert.match(rq.request_number,/^REQ\d{2}-\d{3,}$/);assert.notEqual(rq.request_number,rf.request_number)
await assert.rejects(fac.submitTicket(lf.token,lf.session,input,createRpcAttempt()),e=>e.code==='product_unavailable')
pass('actual portal adapter loads M13 sessions and creates both providers through M15 with REQ/study/idempotency intact')
const own=await qp.listMyTickets(lq.token), company=await fac.listMyTickets(lf.token)
assert.ok(own.some(t=>t.id===rq.id)&&!own.some(t=>t.id===rf.id))
assert.ok(company.some(t=>t.id===rf.id)&&!company.some(t=>t.id===rq.id))
assert.equal(await qp.ticketDetail(lq.token,rf.id),null)
assert.equal((await qp.currentSession(lq.token)).auth_type,'quipu')
assert.equal((await qp.ticketDetail(lq.token,rq.id)).id,rq.id)
pass('actual My tickets/detail adapters isolate identities and preserve session after foreign detail denial')
const pdf=new File(['synthetic evidence'],'fixture.pdf',{type:'application/pdf'})
const delivered=await qp.deliverAttachments(lq.token,rq.id,[{file:pdf,uploadKey:randomUUID()}])
assert.deepEqual(delivered.failed,[]);assert.deepEqual(delivered.uploaded,['fixture.pdf'])
assert.equal(q(`SELECT count(*) FROM storage.objects WHERE name LIKE ${lit(rq.id+'/%')}`),'1')
const excess=await qp.deliverAttachments(lq.token,rq.id,Array.from({length:4},(_,i)=>({file:new File(['x'],`extra${i}.pdf`,{type:'application/pdf'}),uploadKey:randomUUID()})))
assert.equal(excess.uploaded.length,0);assert.equal(excess.failed.length,4)
denied(`SELECT public.client_reserve_attachments(${lit(lf.token)},${lit(rq.id)},'[]')`,'anon',null,'PT404')
pass('client attachment adapter reserves/uploads through real SQL policies and rejects fifth slot or foreign ticket')

let plannerReceipt
for(const role of ['superadmin','admin','developer']){
  const staffOps=createOperations(client('authenticated',f.users[role]))
  const plannerKey=randomUUID(), attempt=()=>createRpcAttempt(()=>plannerKey)
  const planner={requester_name:'Synthetic Planner creator',requester_area:'Fixture area',request_type:'Otro',origin:'Interno',description:'Planner imported fixture',observations:'Bucket: Fixture',needs_code:false}
  const imported=await staffOps.submitRequest(planner,attempt())
  assert.deepEqual(await staffOps.submitRequest(planner,attempt()),imported)
  if(role==='admin') plannerReceipt=imported
}
pass('real Planner consumer adapter preserves authorized superadmin/admin/developer intake and retry')
const unclassified=json(`SELECT to_jsonb(r) FROM public.requests r WHERE id=${lit(plannerReceipt.id)}`,'authenticated',f.users.admin)
assert.equal(unclassified.studio_id,null)
const plannerProject=await ops.approveRequest(unclassified,{priority:'medium',assigned_dev:f.users.developer},createRpcAttempt())
assert.equal((await board.getTicket(plannerProject.id)).workflow_version,2)
pass('historical-shaped Planner intake without studio still approves with an explicit authorized principal')
assert.equal(q(`SELECT count(*) FROM public.requests WHERE id IN(${lit(rq.id)},${lit(rf.id)}) AND status='pending'`,'authenticated',f.users.admin),'2')
await ops.startRequestReview(rq.id)
await ops.classifyRequest(rq.id,{studio_code_id:f.code,subsystem_id:subsystem||null})
const request=json(`SELECT to_jsonb(r) FROM public.requests r WHERE id=${lit(rq.id)}`,'authenticated',f.users.admin)
const project=await ops.approveRequest(request,{priority:'medium',assigned_dev:f.users.developer},createRpcAttempt())
let snapshot=await board.getTicket(project.id)
assert.equal(snapshot.workflow_version,2);assert.equal(snapshot.flows.length,1)
for(const phase of DEVELOPMENT_PHASES.slice(1,-1))snapshot=await board.movePhase(project.id,phase,randomUUID())
assert.equal(snapshot.flows[0].phase,'deploy')
await assert.rejects(createBoardOperations(client('authenticated',f.users.viewer)).block(project.id,'Denied',randomUUID()))
await board.block(project.id,'Synthetic dependency',randomUUID())
await assert.rejects(board.movePhase(project.id,'done',randomUUID()))
await board.unblock(project.id,randomUUID())
const task=q(`SELECT id FROM public.checklist_items WHERE project_flow_id=${lit(snapshot.flows[0].id)} LIMIT 1`)
if(task)q(`UPDATE public.checklist_items SET completed=true WHERE id=${lit(task)}`,'authenticated',f.users.developer)
snapshot=await board.getTicket(project.id)
assert.ok(snapshot.flows[0].checklist_completed>=1)
snapshot=await board.movePhase(project.id,'done',randomUUID(),{confirmPending:true,pendingFingerprint:snapshot.pending_fingerprint})
assert.equal(snapshot.project_status,'completed')
pass('actual approval/board adapters preserve inbox, classification, eight Development phases, checklist, block and Done rules under M15')
const metrics=createTicketMetrics(admin)
const metric=(await metrics.performance()).find(t=>t.request_id===rq.id)
assert.equal(metric.metric_status,'complete');assert.ok(Number(metric.lead_time_seconds)>=Number(metric.cycle_time_seconds))
assert.ok(metric.first_started_at&&metric.completed_at&&Number(metric.cycle_time_seconds)>=0)
const pending=(await metrics.performance()).find(t=>t.request_id===rf.id)
assert.equal(pending.completed_at,null);assert.equal(pending.cycle_time_seconds,null)
await board.reopen(project.id,'testing','Synthetic reopen',randomUUID())
assert.equal((await metrics.performance()).find(t=>t.request_id===rq.id).completed_at,null)
snapshot=await board.getTicket(project.id)
await board.movePhase(project.id,'done',randomUUID(),{confirmPending:true,pendingFingerprint:snapshot.pending_fingerprint})
const event=q(`SELECT id FROM public.request_events WHERE request_id=${lit(rq.id)} LIMIT 1`)
denied(`UPDATE public.request_events SET action='forged' WHERE id=${event}`,f.owner,null,'23514')
pass('real server Cycle/Lead metrics follow completion/reopen; unknown dates stay null and audit history rejects edits')

if(f.legacy){
  let old=await board.getTicket(f.legacy)
  assert.equal(old.workflow_version,null);assert.equal(old.flows[0].flow_type,'administrative')
  old=await board.movePhase(f.legacy,'design',randomUUID())
  old=await board.movePhase(f.legacy,'deployed',randomUUID(),{confirmPending:true,pendingFingerprint:old.pending_fingerprint})
  assert.equal(old.project_status,'completed')
  old=await board.reopen(f.legacy,'discovery','Synthetic historical reopen',randomUUID())
  assert.equal(old.workflow_version,null);assert.equal(old.flows[0].flow_type,'administrative')
  pass('existing Administrative history remains readable/operable and reopens without conversion under M15')
}
await ops.classifyRequest(rf.id,{studio_code_id:f.code})
await ops.rejectRequest(rf.id,'Public synthetic reason','Private fixture note')
assert.equal((await fac.ticketDetail(lf.token,rf.id)).rejection_reason,'Public synthetic reason')
const publicStatus=await createOperations(client('anon')).trackRequest(rq.request_number)
assert.deepEqual(Object.keys(publicStatus).sort(),['request_number','status'])
await qp.logout(lq.token)
await assert.rejects(qp.submitTicket(lq.token,lq.session,input,createRpcAttempt()),e=>e.code==='session_expired')
q(`UPDATE app_private.client_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE identity_id=(SELECT id FROM app_private.client_identities WHERE provider='quipufac')`)
await assert.rejects(fac.currentSession(lf.token),e=>e.code==='session_expired')
pass('rejection exposes only public reason; REQ tracking remains public; logout/expiry block actual client adapters')
