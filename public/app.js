'use strict';
const $=id=>document.getElementById(id);
const state={config:null,session:null,scenario:'standard',auto:false,pending:false,view:'console',requestSerial:0};
const descriptions={standard:'主仓缺货 120 件。由智能体寻找资源、校验权限并跟踪交付。',retry:'邻仓库存发生争抢。观察模型能否根据失败回执，重新选择可行方案。',approval:'可行调拨费用超过示例阈值。自动执行暂停，等待管理者审批。'};
const statuses={ready:'待启动',active:'执行中',awaiting_approval:'等待审批',completed:'履约完成',human:'人工接管',rejected:'审批拒绝',error:'执行中断'};
const terminal=s=>['completed','human','rejected'].includes(s?.status);
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(value){return `¥${Number(value).toLocaleString('zh-CN')}`;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6000);}
async function api(path,body){
  let response;try{response=await fetch(path,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{throw new Error('无法连接本机服务，请确认启动窗口仍在运行。');}
  const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;
}
function showView(view){state.view=view;for(const section of document.querySelectorAll('.view'))section.hidden=section.id!==`view-${view}`;for(const nav of document.querySelectorAll('.nav'))nav.classList.toggle('active',nav.dataset.view===view);if(view==='config')$('model').value=state.config?.model||'deepseek-flash';}
function setConfig(config){state.config=config;$('connection').classList.toggle('configured',config.configured);$('connection-text').textContent=config.configured?`${config.model} · 密钥已配置`:'DeepSeek · 未配置密钥';$('key-hint').textContent=config.configured?'已配置密钥，输入框留空会保留现有配置。首次执行时验证鉴权。':'密钥不会回显，也不会写入浏览器存储或审计记录。';render();}
function render(){
  const s=state.session,busy=state.pending||s?.busy,stopped=terminal(s),awaiting=s?.status==='awaiting_approval';
  $('need-config').hidden=!!state.config?.configured;
  $('run').disabled=!state.config?.configured||busy||stopped||awaiting||state.auto;
  $('step').disabled=!state.config?.configured||busy||stopped||awaiting||state.auto;
  $('run').querySelector('span').textContent=s?.rounds?'继续运行':'连续运行';
  $('pause').hidden=!state.auto;$('pause').disabled=!state.auto;
  $('takeover').disabled=!s||stopped;$('reset').disabled=!!busy;
  $('export').disabled=!s||!!busy;
  for(const button of document.querySelectorAll('[data-scenario]')){button.disabled=!!busy;button.classList.toggle('selected',button.dataset.scenario===state.scenario);button.setAttribute('aria-pressed',String(button.dataset.scenario===state.scenario));}
  $('scenario-desc').textContent=descriptions[state.scenario];
  $('session-status').textContent=busy?'模型决策中':statuses[s?.status]||'待启动';
  $('session-status').className=`status-chip ${s?.status==='completed'?'success':awaiting?'warning':s?.status==='error'?'error':''}`;
  $('version').textContent=`承诺 V${s?.version||3}`;
  $('order-status').textContent=s?.delivery==='delivered'?'已模拟履约':s?.delivery==='in_transit'?'调拨运输中':s?.reservation?'资源已锁定':'主仓缺货';
  $('order-status').className=`status-chip ${s?.delivery==='delivered'?'success':'warning'}`;
  $('remaining-shortage').textContent=s?.delivery==='delivered'?'0':'120';
  $('rounds').textContent=s?.rounds||0;$('calls').textContent=s?.calls||0;
  $('tokens').textContent=((s?.usage?.prompt_tokens||0)+(s?.usage?.completion_tokens||0)).toLocaleString('zh-CN');
  $('busy-indicator').hidden=!busy;
  $('next-action').textContent=busy?(state.auto?'连续运行中 · 可暂停下一轮或人工接管':'正在等待模型返回工具选择'):awaiting?'等待管理者决定，模型不可代批':stopped?(s.status==='completed'?'已核验模拟签收，所有关闭条件满足':'自动操作已停止，资源与回执保留'):s?.status==='error'?'检查错误回执后，可重试本轮':state.auto?'准备下一轮模型决策':s?.rounds?'可单步查看下一轮，也可继续连续运行':'准备就绪后启动模型';
  $('approval').hidden=!awaiting;
  if(awaiting){const p=s.pendingApproval;$('approval-desc').textContent=`${p.warehouse==='B'?'昆山邻仓':'太仓备选仓'}调拨 ${p.quantity} 件，增量费用 ${money(p.cost)}，超过自动审批上限 ¥500。审批绑定方案 ${p.planId} 与承诺 V${p.version}，批准前不会锁定库存。`;}
  $('approve').disabled=!!busy;$('reject').disabled=!!busy;
  const warehouse=s?.reservation?.warehouse;
  $('route-b').classList.toggle('active',warehouse==='B'&&s.delivery!=='delivered');$('route-c').classList.toggle('active',warehouse==='C'&&s.delivery!=='delivered');
  $('route-b').classList.toggle('failed',!!s?.failures);$('route-customer').classList.toggle('active',s?.delivery==='in_transit');$('route-customer').classList.toggle('delivered',s?.delivery==='delivered');
  $('stock-b').textContent=`可用 ${s?.inventory.B??120} 件 · 6h`;$('stock-c').textContent=`可用 ${s?.inventory.C??120} 件 · 8h`;
  $('legend-stock-b').textContent=`可用 ${s?.inventory.B??120} 件 · 预计 6 小时`;$('legend-stock-c').textContent=`可用 ${s?.inventory.C??120} 件 · 预计 8 小时`;
  $('legend-delivery').textContent=`${s?.delivery==='delivered'?'已模拟签收':s?.delivery==='in_transit'?'模拟运输中':s?.transfer?'已创建调拨':'等待调拨'} · 客户窗口 12 小时`;
  $('route-label').textContent=s?.delivery==='delivered'?'已模拟签收':s?.delivery==='in_transit'?'模拟运输中':s?.transfer?'已创建调拨':'等待调拨';
  $('delivery-label').textContent=s?.delivery==='delivered'?'已确认模拟签收':s?.delivery==='in_transit'?'运输中 · 继续跟踪':s?.transfer?'调拨单已创建':s?.reservation?'资源已锁定':s?.inventoryRead?'库存已查询':'等待资源查询';
  $('network-note').textContent=s?.reservation?`当前选择${warehouse==='B'?'昆山邻仓':'太仓备选仓'}，锁定 ${s.reservation.quantity} 件；${s.delivery==='delivered'?'模拟交付已确认。':'仍须核验回执并跟踪模拟交付。'}`:s?.failures?'邻仓锁库失败，未扣减库存。下一步应重新查询并试算其他方案。':'模型将从工具获取库存；图中为模拟业务环境的初始状态。';
  const milestones=[s?.observed,!!s?.reservation,s?.verified,(s?.version||0)>3,s?.notified,s?.delivery==='delivered',s?.status==='completed'];
  [...$('milestones').children].forEach((el,i)=>el.classList.toggle('done',!!milestones[i]));
  if(s?.plans.length){$('plans-body').innerHTML=s.plans.map(p=>`<tr class="${warehouse===p.warehouse?'selected-plan':''}"><td class="plan-name">${p.warehouse==='B'?'昆山邻仓调拨':'太仓备选仓调拨'}<small>${esc(p.id)} · ${p.quantity} 件</small></td><td>${money(p.cost)}</td><td>${p.eta_hours} 小时</td><td><span class="status-chip ${p.cost>500?'warning':''}">${warehouse===p.warehouse?'已锁定':p.cost>500?'需审批':'阈值内'}</span></td></tr>`).join('');}
  else $('plans-body').innerHTML='<tr><td colspan="4" class="empty-table">模型调用方案试算器后，结果将出现在这里。</td></tr>';
  renderTimeline();
}
const emptyTimeline=$('timeline').innerHTML;
function renderTimeline(){
  const box=$('timeline'),s=state.session;
  if(!s?.events.length){box.innerHTML=emptyTimeline;return;}
  const expanded=new Set([...box.querySelectorAll('details[open]')].map(el=>el.dataset.seq));
  const shouldScroll=box.scrollHeight-box.scrollTop-box.clientHeight<90;
  const priorScroll=box.scrollTop;
  const events=s.events.filter(e=>e.type!=='model');
  box.innerHTML=events.map(e=>{
    const isTool=e.type==='tool',bad=e.type==='error'||(isTool&&!e.data.result?.ok),stage=isTool?'行动 / 再观察':e.type==='approval'?'人工审批':e.type==='observe'?'观察':e.type==='summary'?'决策摘要':e.type==='complete'?'闭环完成':e.type==='handover'?'人工接管':'状态';
    const args=e.data.args,result=e.data.result;
    let desc=isTool?args?.decision_summary:e.type==='summary'?e.data.text:e.data.message||e.data.reason||e.data.note||'';
    if(e.type==='observe')desc=`${e.data.order_id} · ${e.data.scenario} · 业务数据为模拟`;
    if(e.type==='complete')desc=`新承诺 V${e.data.version} · 增量成本 ${money(e.data.cost)} · 模拟签收已核验`;
    const resultText=isTool?result?.message:e.type==='error'?e.data.message:'';
    return `<article class="event ${bad?'error':''}"><div class="event-meta"><span class="stage">${stage}</span><span>${e.round?`第 ${e.round} 轮`:'事件触发'}</span><time>${new Date(e.at).toLocaleTimeString('zh-CN',{hour12:false})}</time></div><h3>${esc(e.title)}</h3>${desc?`<p>${esc(desc)}</p>`:''}${resultText?`<div class="receipt">${esc(resultText)}${result?.code?`<span class="receipt-code">${esc(result.code)}</span>`:''}</div>`:''}${isTool?`<details data-seq="${e.seq}" ${expanded.has(String(e.seq))?'open':''}><summary>查看工具参数与原始回执 · ${esc(e.data.name)}</summary><pre>${esc(JSON.stringify({tool:e.data.name,arguments:args,result},null,2))}</pre></details>`:''}</article>`;
  }).join('');
  if(state.pending||s.busy)box.insertAdjacentHTML('beforeend','<article class="event thinking-event"><div class="event-meta"><span class="stage">决策中</span></div><p><span class="spinner"></span>DeepSeek 正在根据最新回执选择工具…</p></article>');
  box.scrollTop=shouldScroll?box.scrollHeight:priorScroll;
}
async function newSession(scenario=state.scenario){
  if(state.pending||state.session?.busy)return;
  state.auto=false;state.pending=true;render();
  try{const session=await api('/api/sessions',{scenario});state.scenario=scenario;state.session=session;$('approval-note').value='';}
  finally{state.pending=false;render();}
}
async function oneStep(){
  if(state.pending)return;
  if(!state.session)await newSession();
  if(terminal(state.session)||state.session.status==='awaiting_approval')return;
  state.pending=true;render();
  // Polling exposes server-side tool events while a model call is in flight.
  const id=state.session.id,requestSerial=++state.requestSerial;
  const poll=setInterval(async()=>{try{const snapshot=await api(`/api/sessions/${id}`);if(state.pending&&state.requestSerial===requestSerial&&state.session?.id===id){state.session=snapshot;render();}}catch{}},900);
  try{state.session=await api(`/api/sessions/${id}/step`,{});}catch(error){state.auto=false;toast(error.message);}
  finally{clearInterval(poll);state.pending=false;render();}
}
async function continuous(){
  if(state.auto||state.pending)return;if(!state.session)await newSession();state.auto=true;render();
  while(state.auto){await oneStep();if(!state.session||terminal(state.session)||['awaiting_approval','error'].includes(state.session.status)){state.auto=false;break;}await new Promise(resolve=>setTimeout(resolve,450));}
  render();
}
document.addEventListener('click',async event=>{
  const viewButton=event.target.closest('[data-view]');if(viewButton){showView(viewButton.dataset.view);return;}
  const scenarioButton=event.target.closest('[data-scenario]');if(scenarioButton){try{await newSession(scenarioButton.dataset.scenario);showView('console');}catch(error){toast(error.message);}}
});
$('run').addEventListener('click',()=>continuous().catch(e=>{state.auto=false;state.pending=false;render();toast(e.message);}));
$('step').addEventListener('click',()=>oneStep().catch(e=>toast(e.message)));
$('pause').addEventListener('click',()=>{state.auto=false;render();toast(state.pending?'本轮结束后暂停，已有状态保留。':'已暂停连续运行。');});
$('reset').addEventListener('click',()=>newSession().catch(e=>toast(e.message)));
$('takeover').addEventListener('click',async()=>{state.auto=false;try{state.session=await api(`/api/sessions/${state.session.id}/takeover`,{});render();toast('已接管。请查看回执和资源锁，自动操作停止。');}catch(e){toast(e.message);}});
async function approval(approved){
  const note=$('approval-note').value.trim();if(!note){$('approval-note').focus();toast('请先填写审批依据。');return;}
  try{state.session=await api(`/api/sessions/${state.session.id}/approve`,{approved,note});render();if(approved)await continuous();}catch(e){toast(e.message);}
}
$('approve').addEventListener('click',()=>approval(true));$('reject').addEventListener('click',()=>approval(false));
$('export').addEventListener('click',()=>{if(state.session)window.location.href=`/api/sessions/${state.session.id}/export`;});
$('config-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const config=await api('/api/config',{apiKey:$('api-key').value,model:$('model').value.trim()});$('api-key').value='';setConfig(config);showView('console');toast('配置已保存到本机后端内存；首次运行将验证连接。');}catch(e){toast(e.message);}finally{button.disabled=false;}});
$('clear-key').addEventListener('click',async()=>{try{setConfig(await api('/api/config',{clear:true}));$('api-key').value='';toast('后端内存密钥已清除。');}catch(e){toast(e.message);}});
window.addEventListener('pagehide',()=>{state.auto=false;});
api('/api/config').then(setConfig).catch(error=>{$('connection-text').textContent='本机服务不可用';toast(error.message);});
