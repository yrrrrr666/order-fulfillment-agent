import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createCase, executeTool } from '../business.mjs';
import { stepAgent } from '../agent.mjs';
import { createApp } from '../server.mjs';

const config={apiKey:'test-fixture-only',model:'fixture-model'};
function fixtureCall(name,args){return {message:{role:'assistant',content:null,tool_calls:[{id:'call_fixture',type:'function',function:{name,arguments:JSON.stringify({...args,decision_summary:'测试夹具选择工具，不是真实模型。'})}}]},usage:{prompt_tokens:12,completion_tokens:5},model:'fixture-model'};}

test('循环确实将工具回执交给下一轮模型，参数错误不执行',async()=>{
 const s=createCase();let phase=0;
 const provider=async(_c,messages,tools)=>{assert.ok(tools.length>8);if(phase++===0)return fixtureCall('get_order',{order_id:s.orderId});assert.equal(messages.at(-1).role,'tool');assert.equal(JSON.parse(messages.at(-1).content).shortage,120);return fixtureCall('query_inventory',{order_id:'wrong-order'});};
 await stepAgent(s,config,provider);await stepAgent(s,config,provider);assert.equal(s.observed,true);assert.equal(s.inventoryRead,false);assert.equal(s.events.at(-1).data.result.code,'ORDER_MISMATCH');
});
test('没有工具调用的文字不会被当作成功，两轮后接管',async()=>{
 const s=createCase();const p=async()=>({message:{role:'assistant',content:'已经完成交付。'},usage:{}});
 await stepAgent(s,config,p);assert.notEqual(s.status,'completed');await stepAgent(s,config,p);assert.equal(s.status,'human');assert.equal(s.delivery,'pending');
});
test('请求失败可以重试；并发执行被拒绝，接管后不会执行迟到回包',async()=>{
 const s=createCase();await stepAgent(s,config,async()=>{throw new Error('fixture timeout');});assert.equal(s.status,'error');
 let release;const pending=stepAgent(s,config,()=>new Promise(r=>release=r));await assert.rejects(()=>stepAgent(s,config),/正在执行/);
 s.status='human';s.controller.abort();release(fixtureCall('get_order',{order_id:s.orderId}));await pending;assert.equal(s.observed,false);assert.equal(s.busy,false);
});
test('HTTP：密钥不回显、不导出，禁止跨来源写请求和任意文件读取',async()=>{
 const {server}=createApp({apiKey:config.apiKey,provider:async()=>fixtureCall('get_order',{order_id:'SO20261025-0186'})});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const cfg=await (await fetch(`${base}/api/config`)).text();assert.ok(!cfg.includes(config.apiKey));
  const foreign=await fetch(`${base}/api/config`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.invalid'},body:JSON.stringify({clear:true})});assert.equal(foreign.status,403);
  assert.equal((await fetch(`${base}/.env`)).status,404);
  const s=await (await fetch(`${base}/api/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
  const res=await fetch(`${base}/api/sessions/${s.id}/step`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(res.status,200);
  const exported=await (await fetch(`${base}/api/sessions/${s.id}/export`)).text();assert.ok(!exported.includes(config.apiKey));assert.ok(!exported.includes('messages'));assert.ok(exported.includes('get_order'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('HTTP 分块在 UTF-8 中文字符内部时，审批依据仍完整进入审计',async()=>{
 const {server,sessions}=createApp({apiKey:'fixture'});server.listen(0,'127.0.0.1');await once(server,'listening');
 const s=createCase('approval');sessions.set(s.id,s);
 const call=(name,args)=>executeTool(s,name,{...args,decision_summary:'测试分块审批输入。'});
 call('get_order',{order_id:s.orderId});call('query_inventory',{order_id:s.orderId});call('compare_plans',{order_id:s.orderId});call('check_authorization',{plan_id:'PLAN-B',expected_version:3});
 const note='同意本次跨仓调拨，确保客户窗口。';const bytes=Buffer.from(JSON.stringify({approved:true,note}),'utf8');const split=bytes.indexOf(Buffer.from('同'))+1;
 try{
  const result=await new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:`/api/sessions/${s.id}/approve`,method:'POST',headers:{'Content-Type':'application/json'}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));});
    req.on('error',reject);req.write(bytes.subarray(0,split));setTimeout(()=>req.end(bytes.subarray(split)),20);
  });
  assert.equal(result.status,'active');assert.equal(result.events.at(-1).data.note,note);assert.ok(!JSON.stringify(result).includes('\uFFFD'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
