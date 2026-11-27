import test from 'node:test'
import assert from 'node:assert/strict'
import {limaDate,ticketAgeDays,ticketAgeLabel,averageTicketAge} from '../src/lib/ticket-age.ts'
import {ticketHierarchy,productPairError} from '../src/lib/ticket-hierarchy.ts'
import {createOperations} from '../src/lib/operations.ts'
import {createRpcAttempt} from '../src/lib/rpc-attempt.ts'

test('Lima midnight, not UTC midnight, changes the calendar day',()=>{
 assert.equal(limaDate('2026-11-28T04:59:59Z'),'2026-11-27');assert.equal(limaDate('2026-11-28T05:00:00Z'),'2026-11-28');
 assert.equal(ticketAgeLabel('2026-11-27T04:59:00Z','2026-11-27'),'1 día en tablero');
 assert.equal(ticketAgeLabel('2026-11-27T05:01:00Z','2026-11-27'),'Hoy');
});
test('Board creation age ignores the request date, phase, assignee and last update',()=>{
 const p={created_at:'2026-10-01T03:00:00Z',updated_at:'2026-11-27T12:00:00Z',requests:{created_at:'2020-01-01'},flow:{assigned_to:'a',phase:'analysis'}};
 const changed={...p,updated_at:'2026-11-28T12:00:00Z',flow:{assigned_to:'b',phase:'testing'}};
 assert.equal(ticketAgeLabel(p.created_at,'2026-11-27'),'58 días en tablero');assert.equal(ticketAgeLabel(changed.created_at,'2026-11-27'),'58 días en tablero');
});
test('Unknown dates are explicit and future data never produce negative ages',()=>{
 for(const date of [null,undefined,'bad'])assert.equal(ticketAgeLabel(date,'2026-11-27'),'Antigüedad no disponible');
 assert.equal(ticketAgeDays('2027-01-01T12:00:00Z','2026-11-27'),0);assert.equal(averageTicketAge([]),null);
 assert.equal(averageTicketAge([{created_at:'2026-11-26T05:00:00Z'},{created_at:'2026-11-25T05:00:00Z'},{created_at:'bad'}],'2026-11-27'),2);
});
const catalog={systems:[{id:'s',name:'Producto dinámico, sin nombre prefijado'}],subsystems:[{id:'sub',system_id:'s',name:'Subproducto largo distinto del proyecto'},{id:'foreign',system_id:'other',name:'No corresponde'}]};
const portfolios={portfolios:[{id:'p',name:'Portafolio elegido'}],initiatives:[{id:'i',portfolio_id:'p',name:'Proyecto operativo compartido'},{id:'x',portfolio_id:'other',name:'Proyecto ajeno'}]};
test('Hierarchy uses the catalog pair and the operational project pair independently',()=>{
 const p={requests:{system_id:'s',subsystem_id:'sub'},portfolio_id:'p',initiative_id:'i'};
 assert.deepEqual(ticketHierarchy(p,catalog,portfolios),{product:catalog.systems[0].name,subproduct:catalog.subsystems[0].name,portfolio:'Portafolio elegido',project:'Proyecto operativo compartido'});
 assert.equal(productPairError('s','foreign',catalog),'El subproducto no pertenece al producto seleccionado.');
 const bad=ticketHierarchy({...p,requests:{system_id:'s',subsystem_id:'foreign'},initiative_id:'x'},catalog,portfolios);
 assert.equal(bad.subproduct,'Subproducto no disponible');assert.equal(bad.project,'Proyecto no disponible');
});
test('Missing references remain explicit; requester text never supplies product/project names',()=>{
 const empty=ticketHierarchy({},catalog,portfolios);assert.deepEqual(empty,{product:'Sin producto',subproduct:'Sin subproducto',portfolio:'Sin portafolio',project:'Sin proyecto específico'});
 const stale=ticketHierarchy({requests:{system_id:'missing'},portfolio_id:'missing'},catalog,portfolios);assert.equal(stale.product,'Producto no disponible');assert.equal(stale.portfolio,'Portafolio no disponible');
});
test('New tickets and approvals omit historical dates even when supplied by an old caller',async()=>{
 const id='10000000-0000-4000-8000-000000000001',calls=[];
 const api=createOperations({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='create_internal_ticket'?{project:{id},request_number:'INT26-001'}:{id,request_id:id},error:null}}});
 const input={title:'QA',description:'QA',priority:'medium',assigned_dev:id,start_date:'2000-01-01',due_date:'2000-01-02'};
 await api.createInternalTicket({...input,mode:'internal'},createRpcAttempt());
 await api.approveRequest({id,request_type:'QA'},input,createRpcAttempt());
 await api.approveRequestWithPortfolio({id,request_type:'QA'},input,{mode:'independent'},createRpcAttempt());
 for(const {args} of calls)for(const key of ['start_date','due_date','sla_target_date','sla_formal_days'])assert.equal(key in args.p_payload,false);
});
