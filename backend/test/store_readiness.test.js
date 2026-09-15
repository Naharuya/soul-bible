import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createMemberStore } from '../src/member_store.js';
import { createContentReports } from '../src/content_reports.js';
import { loadPrivacyPolicy, privacyPolicy } from '../src/privacy_policy.js';

const ready = () => { const {ready: _ready, missing: _missing, ...raw} = loadPrivacyPolicy(); return privacyPolicy({ ...raw, approved:true, operatorName:'Fixture',
  supportEmail:'privacy@example.com', memberRetention:'Fixture policy', usageRetention:'Fixture policy', reportsRetentionDays:7,
  internationalTransfer:'Fixture disclosure', reviewer:'Fixture reviewer', reviewedAt:'2026-09-15T00:00:00Z' }); };
async function serve(t, extra={}) {
  const app = createApp({ generate:async()=>{ throw Error('No model allowed'); }, memberStore:{}, adminToken:'store-fixture-admin', ...extra });
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  return { base, send:(route,body,headers={},method='POST')=>fetch(base+route,{method,headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}) };
}
test('incomplete policy never publishes approval; privacy pages escape operator input', async t=>{
  assert.equal(loadPrivacyPolicy().ready,false);
  const {base}=await serve(t,{privacy:{...ready(),operatorName:'<script>fixture</script>'}});
  const privacy=await fetch(base+'/v1/privacy'); assert.equal(privacy.headers.get('cache-control'),'no-store');
  const data=await privacy.json(); assert.equal(data.reviewer,undefined); assert.equal(data.registrationEnabled,false);
  const html=await (await fetch(base+'/privacy')).text(); assert.ok(!html.includes('<script>fixture'));
  assert.ok(html.includes('&lt;script&gt;fixture')); assert.equal((await fetch(base+'/account-deletion')).status,200);
});
test('production policy blocks ordinary requests and signup but crisis remains local before consent',async t=>{
  let calls=0;
  const {send}=await serve(t,{production:true,generate:async()=>{calls++;throw Error('must not call');}});
  const payload={session:{sessionId:'policy-fixture',selectedEmotion:'불안',emotionIntensity:5},userMessage:'내일 발표가 걱정돼요',allowedVerseIds:[],systemPromptVersion:'ko-v1'};
  assert.equal((await send('/v1/mind/chat',payload)).status,503);
  const crisis=await send('/v1/mind/chat',{...payload,userMessage:'지금 당장 죽고 싶고 계획을 세웠어요'});
  assert.equal(crisis.status,200); assert.equal((await crisis.json()).stage,'crisis');
  assert.equal((await send('/v1/auth/signup',{})).status,503); assert.equal(calls,0);
  const configured=await serve(t,{production:true,privacy:ready()});
  assert.equal((await configured.send('/v1/mind/chat',payload)).status,428);
});
test('member erasure requires session, CSRF and exact confirmation; deletes only verified target',async t=>{
  const store=createMemberStore({filename:':memory:'});t.after(()=>store.close());
  const first=store.create({name:'Fixture A',phone:'01000000001',churchName:'Fixture',loginProvider:'phone'});
  store.create({name:'Fixture B',phone:'01000000002',churchName:'Fixture',loginProvider:'phone'});
  const {base,send}=await serve(t,{memberStore:store,production:true,trustProxy:'loopback'});
  const forwarded={'x-forwarded-proto':'https'},origin=base.replace('http:','https:');
  const route=`/v1/admin/members/${first.id}`,body={confirmation:`DELETE_MEMBER:${first.id}`,verificationReference:'FIXTURE-123'};
  assert.equal((await send(route,body,forwarded,'DELETE')).status,401);
  const login=await send('/v1/admin/session',{token:'store-fixture-admin'},{...forwarded,origin});
  const cookie=login.headers.get('set-cookie').split(';')[0],{csrfToken}=await login.json();
  const headers={...forwarded,origin,cookie,'x-csrf-token':csrfToken};
  assert.equal((await send(route,body,{...forwarded,origin,cookie},'DELETE')).status,403);
  assert.equal((await send(route,{...body,confirmation:'DELETE_MEMBER:999'},headers,'DELETE')).status,400);
  assert.equal(store.getAdminOverview().total,2);
  assert.equal((await send(route,body,headers,'DELETE')).status,204);
  assert.equal(store.getAdminOverview().total,1);
  assert.equal(store.getAdminOverview().recent[0].id,first.id+1);
  assert.equal((await send(route,body,headers,'DELETE')).status,204);
});
test('reports validate explicit attachment consent, retry identity and protected review',async t=>{
  const reports=createContentReports({filename:':memory:',retentionDays:7});t.after(()=>reports.close());
  const {base,send}=await serve(t,{reports,privacy:ready()});
  const report={submissionId:'a'.repeat(32),reason:'unsafe',includeResponse:false};
  assert.equal((await send('/v1/reports',{...report,responseText:'not consented'})).status,400);
  assert.equal((await send('/v1/reports',{...report,userMessage:'must not retain'})).status,400);
  for(let i=0;i<2;i++)assert.equal((await send('/v1/reports',report)).status,202);
  assert.equal((await send('/v1/reports',{...report,reason:'hate'})).status,409);
  assert.equal(reports.list().length,1);assert.equal(reports.list()[0].responseText,null);
  assert.equal((await fetch(base+'/v1/admin/reports')).status,401);
  const headers={authorization:'Bearer store-fixture-admin'};
  const response=await fetch(base+'/v1/admin/reports',{headers});assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await send(`/v1/admin/reports/${report.submissionId}/review`,{confirmation:'REVIEWED'},headers)).status,200);
  assert.equal(reports.list()[0].status,'reviewed');
});
test('reports survive reopen and expire without touching member data',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'onaria-report-test-'));
  t.after(async()=>{store.close();assert.equal(path.dirname(root),path.resolve(tmpdir()));await rm(root,{recursive:true,force:true});});
  let time=1000;const options={filename:path.join(root,'reports.sqlite'),retentionDays:1,now:()=>time};
  let store=createContentReports(options);store.add({submissionId:'b'.repeat(32),reason:'misleading',includeResponse:true,responseText:'Fixture AI response'});store.close();
  store=createContentReports(options);assert.equal(store.list()[0].responseText,'Fixture AI response');
  time+=86400001;store.purge();assert.equal(store.list().length,0);
});
