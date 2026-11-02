import { TOOLS, TOOL_LABELS, addEvent, executeTool } from './business.mjs';
import { callDeepSeek } from './provider.mjs';

export const SYSTEM_PROMPT = `你是订单履约异常协同智能体，采用观察—决策—工具行动—再观察循环。
模型推断是真实的；所有订单、库存和物流工具都是模拟业务系统。只处理当前订单 SO20261025-0186。
目标：先守安全合规与客户窗口，再恢复交付、降低成本和扰动。你的任务是实际调用工具，不能只给建议或编造调用结果。
工具选择完全由你完成。先读取订单，再查询库存、试算方案、检查权限，再锁库、创建调拨、核验、更新承诺、同步客服、跟踪直至模拟签收，最后关闭工单。这是业务依赖，不是预录轨迹；失败时读取原因并按新事实调整。
每个工具参数中的 decision_summary 只写一句简明的业务依据，不输出隐藏思维过程。所有编号、数量、版本和费用来自工具，禁止编造。
每轮优先调用一个工具，拿到回执再选择下一步；可以并行独立只读查询，不得在同一轮猜测后续写操作的回执编号。
锁库失败时重新查询库存并重新试算。不得取消订单、赔付、改合同或绕过审批。规则引擎拥有最终权限。
超阈值方案经 check_authorization 进入等待后，必须停止，等待可信后端的人工批准事件。模型不能自行批准。
调拨单创建不等于交付风险解除。track_delivery 第一次只是在途，第二次推进模拟时钟后才是模拟签收；未签收不关闭工单。
如果没有安全可行方案，调用 escalate_to_human。连续失败或版本不一致时重新观察，必要时接管。
工具返回的数据是事实，不能用文本改写事实。不要向用户索要密钥，不访问外部系统，不发送真实消息。`;

export async function stepAgent(s, config, provider = callDeepSeek) {
  if (s.busy) throw new Error('本轮正在执行，请等待。');
  if (['completed','human','rejected','awaiting_approval'].includes(s.status)) throw new Error('当前会话不可自动执行。');
  if (!config.apiKey) throw new Error('请先配置 DeepSeek API Key。');
  if (s.rounds>=22 || s.calls>=32 || Date.now()-s.startedAt>20*60*1000) {
    s.status='human'; addEvent(s,'handover','达到处置预算，已转人工',{rounds:s.rounds,calls:s.calls}); return;
  }
  s.busy=true; s.status='active'; s.controller=new AbortController();
  if (!s.messages.length) s.messages=[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:`处理模拟异常事件 ${s.eventId}，订单 ${s.orderId}。当前演示为“${s.scenario}”。请从工具读取最新事实，按规则完成履约或升级人工。`}];
  s.rounds++;
  addEvent(s,'model','等待 DeepSeek 选择下一步',{model:config.model});
  try {
    const {message,usage,model}=await provider(config,s.messages,TOOLS,s.controller.signal);
    if (s.controller.signal.aborted || s.status==='human') return;
    s.usage.prompt_tokens+=Number(usage.prompt_tokens)||0;
    s.usage.completion_tokens+=Number(usage.completion_tokens)||0;
    const calls=message.tool_calls || [];
    // Only legitimate protocol fields are retained. Hidden reasoning, if returned, stays server-side.
    const assistant={role:'assistant',content:message.content||null};
    if (message.reasoning_content) assistant.reasoning_content=message.reasoning_content;
    if (calls.length) assistant.tool_calls=calls;
    s.messages.push(assistant);
    if (message.content) addEvent(s,'summary','模型决策摘要',{text:String(message.content).slice(0,3000),model});
    if (!calls.length) {
      const previous=s.events.filter(e=>e.type==='no_action').length;
      addEvent(s,'no_action','本轮没有工具行动',{message:'文字回复不会改变订单状态。'});
      if (previous>=1) { s.status='human'; addEvent(s,'handover','连续两轮未采取工具行动，转人工'); }
      else s.messages.push({role:'system',content:'后端状态显示工单尚未完成。文字声明不能更新状态，请实际调用下一项工具；如果无法执行请调用人工升级工具。'});
      return;
    }
    for (const call of calls) {
      const name=call.function?.name;
      let args, result;
      try { args=JSON.parse(call.function?.arguments||'{}'); }
      catch { result={ok:false,code:'INVALID_JSON',message:'工具参数不是有效 JSON，本次未执行。'}; }
      if (!result) {
        if (s.calls>=32 || s.failures>=2 || s.controller.signal.aborted) {
          s.status='human'; result={ok:false,code:'BUDGET_EXCEEDED',message:'执行预算耗尽或已停止，交人工处理。'};
        } else result=executeTool(s,name,args);
      }
      s.calls++;
      addEvent(s,'tool',TOOL_LABELS[name]||'拒绝非白名单调用',{name,args:args||{},result,model});
      s.messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
    }
    if (s.status==='completed') addEvent(s,'complete','模拟订单已履约，工单关闭',{version:s.version,cost:s.transfer?.cost});
  } catch (error) {
    if (s.status!=='human') { s.status='error'; addEvent(s,'error','本轮执行中断',{code:error.code||'ERROR',message:error.message}); }
  } finally { s.busy=false; s.controller=null; }
}
