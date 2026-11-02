import { randomUUID } from 'node:crypto';

export const SCENARIOS = {
  standard: { name: '常规缺货调拨', description: '主仓缺货 120 件，邻仓调拨 360 元，授权范围内自动处理。', costs: [360, 480], failFirst: false },
  retry: { name: '锁库失败后重选', description: '邻仓库存被并发订单占用，观察失败回执后重新查询并选择其他仓。', costs: [360, 480], failFirst: true },
  approval: { name: '超阈值人工审批', description: '可行调拨方案均超过 500 元，暂停写操作并等待管理者决定。', costs: [860, 980], failFirst: false }
};

export function createCase(scenario = 'standard') {
  if (!SCENARIOS[scenario]) throw new Error('未知场景');
  return { id: randomUUID(), scenario, orderId: 'SO20261025-0186', eventId: `EV-${randomUUID().slice(0,8)}`, status: 'ready', version: 3,
    quantity: 500, mainStock: 380, shortage: 120, threshold: 500, deliveryWindowHours: 12, inventory: { B: 120, C: 120 }, observed: false,
    inventoryRead: false, plans: [], checkedPlans: [], approvedPlans: [], reservation: null, transfer: null, verified: false,
    notified: false, delivery: 'pending', trackingPolls: 0, failures: 0, rounds: 0, calls: 0, pendingApproval: null,
    events: [], messages: [], usage: { prompt_tokens: 0, completion_tokens: 0 }, startedAt: Date.now(), busy: false, controller: null };
}

export function addEvent(s, type, title, data = {}) {
  const event = { seq: s.events.length + 1, at: new Date().toISOString(), round: s.rounds, type, title, data };
  s.events.push(event); return event;
}

const stringProp = { type: 'string', minLength: 1, maxLength: 600 };
const definitions = [
  ['get_order', '查询订单与承诺版本', '读取当前订单、主仓可用量、缺口、交付窗口和承诺版本。必须先查询事实再决策。', { order_id: stringProp }],
  ['query_inventory', '查询区域库存', '获取最新 B/C 仓可调拨库存和资源约束。锁库失败后必须重新查询。', { order_id: stringProp }],
  ['compare_plans', '试算候选方案', '以最新库存确定性计算成本与时效，返回可行方案和淘汰原因。', { order_id: stringProp }],
  ['check_authorization', '校验规则与审批', '执行前必须检查方案权限。成本超过阈值时暂停会话，等待真实网页操作人审批。', { plan_id: stringProp, expected_version: { type: 'integer', minimum: 1 } }],
  ['reserve_inventory', '锁定调拨库存', '按已校验方案锁定缺口库存。必须使用当前承诺版本；失败后重新查询，不得声称成功。', { plan_id: stringProp, expected_version: { type: 'integer', minimum: 1 } }],
  ['create_transfer', '创建调拨单', '用真实工具回执中的有效 reservation_id 创建调拨单；操作幂等。', { reservation_id: stringProp, expected_version: { type: 'integer', minimum: 1 } }],
  ['verify_transfer', '核验调拨回执', '重新查询并确认资源锁与调拨单一致，接口接收不等于已签收。', { transfer_id: stringProp }],
  ['update_commitment', '更新订单承诺', '回执核验成功后更新承诺版本，进入物流跟踪；不代表履约完成。', { transfer_id: stringProp, expected_version: { type: 'integer', minimum: 1 } }],
  ['notify_service', '同步客服工单', '承诺更新后生成模拟客服通知和客户沟通草稿，不对外发送。', { order_id: stringProp }],
  ['track_delivery', '跟踪模拟运输', '推进模拟物流时钟，每次 3 小时；首次在途、第二次签收。只有此工具能够确认模拟签收。', { transfer_id: stringProp }],
  ['close_case', '核验并关闭工单', '只有回执核验、承诺更新、客服同步及模拟签收全部完成，才允许关闭工单。', { order_id: stringProp }],
  ['release_reservation', '释放未发运资源', '补偿工具：只可释放未创建调拨单的库存锁。调拨单创建后的撤销需要人工接管。', { reservation_id: stringProp }],
  ['escalate_to_human', '升级人工接管', '没有安全可行方案、数据冲突或需要人工处理时停止自动操作，并说明接管原因。', { reason: stringProp }]
];
export const TOOL_LABELS = Object.fromEntries(definitions.map(([name,label])=>[name,label]));
export const TOOLS = definitions.map(([name, label, description, props])=>({ type: 'function', function: { name, description: `${label}。${description}`, parameters: {
  type: 'object', properties: { ...props, decision_summary: { type: 'string', minLength: 1, maxLength: 240, description: '一句简明业务决策依据，仅说明目的与事实，不输出隐藏思维过程。' } },
  required: [...Object.keys(props), 'decision_summary'], additionalProperties: false
} } }));

function bad(code, message, data={}) { return { ok: false, code, message, ...data }; }
function good(message, data={}) { return { ok: true, message, ...data }; }
function validate(name, args) {
  const schema = TOOLS.find(x=>x.function.name===name)?.function.parameters;
  if (!schema) return '工具不在白名单内';
  if (!args || typeof args !== 'object' || Array.isArray(args)) return '参数须为对象';
  for (const key of schema.required) if (!(key in args)) return `缺少参数 ${key}`;
  for (const [key, value] of Object.entries(args)) {
    const p = schema.properties[key];
    if (!p) return `不允许的参数 ${key}`;
    if (p.type === 'string' && (typeof value !== 'string' || !value.trim() || value.length > p.maxLength)) return `参数 ${key} 无效`;
    if (p.type === 'integer' && (!Number.isInteger(value) || value < p.minimum)) return `参数 ${key} 无效`;
  }
  return null;
}

export function executeTool(s, name, args) {
  const error = validate(name, args);
  if (error) return bad('INVALID_ARGUMENTS', error);
  if (['human','completed','rejected'].includes(s.status)) return bad('SESSION_STOPPED', '会话已停止，禁止继续操作。');
  if (s.pendingApproval) return bad('APPROVAL_REQUIRED', '等待网页中的人工审批，模型不能代替审批。');
  if (args.order_id && args.order_id !== s.orderId) return bad('ORDER_MISMATCH', '只可处理当前订单。');
  if (args.expected_version && args.expected_version !== s.version) {
    // Exact retries of the already-committed update return the same receipt without writing again.
    if (name==='update_commitment' && s.transfer?.id===args.transfer_id && s.transfer.commitmentFrom===args.expected_version && s.version===args.expected_version+1) return good('重复请求已去重，返回原承诺回执。', {version:`V${s.version}`});
    return bad('VERSION_CONFLICT', '承诺版本已变化，请重新查询订单。', { current_version: s.version });
  }
  const plan = s.plans.find(p=>p.id===args.plan_id);
  const transfer = s.transfer && s.transfer.id===args.transfer_id ? s.transfer : null;
  switch(name) {
    case 'get_order': s.observed = true; return good('订单快照已读取。', { order_id:s.orderId, event_id:s.eventId, commitment_version:s.version, quantity:s.quantity, main_warehouse_available:s.mainStock, shortage:s.shortage, delivery_window_hours:s.deliveryWindowHours, auto_cost_limit:s.threshold, simulation:true });
    case 'query_inventory':
      if (!s.observed) return bad('READ_ORDER_FIRST','请先读取订单。');
      s.inventoryRead = true;
      return good('区域库存快照已刷新。', { warehouses:[{id:'B', name:'昆山邻仓', available:s.inventory.B, eta_hours:6},{id:'C',name:'太仓备选仓',available:s.inventory.C,eta_hours:8}], simulation:true });
    case 'compare_plans':
      if (!s.inventoryRead) return bad('REFRESH_INVENTORY','请先查询最新区域库存。');
      s.plans = ['B','C'].filter(w=>s.inventory[w]>=s.shortage).map(w=>({id:`PLAN-${w}`,warehouse:w,quantity:s.shortage,cost:SCENARIOS[s.scenario].costs[w==='B'?0:1],eta_hours:w==='B'?6:8,feasible:true}));
      return good('按交付窗口、成本、扰动顺序比较。', { plans:s.plans, rejected:[{id:'PRODUCTION',cost:900,eta_hours:30,reason:'超过 12 小时客户交付窗口'},{id:'SUBSTITUTE',reason:'替代料未获客户确认'}], simulation:true });
    case 'check_authorization':
      if (!plan) return bad('INVALID_PLAN','请先试算并选择当前可行方案。');
      if (plan.cost>s.threshold && !s.approvedPlans.includes(plan.id)) {
        s.pendingApproval = { planId:plan.id, cost:plan.cost, warehouse:plan.warehouse, quantity:plan.quantity, version:s.version, at:new Date().toISOString() };
        s.status='awaiting_approval';
        return good('方案超过自动执行阈值，已提交人工审批，尚未锁库。', { authorization:'PENDING_HUMAN', ...s.pendingApproval });
      }
      if (!s.checkedPlans.includes(plan.id)) s.checkedPlans.push(plan.id);
      return good('规则校验通过。', { authorization:s.approvedPlans.includes(plan.id)?'HUMAN_APPROVED':'AUTO_ALLOWED', plan_id:plan.id, cost:plan.cost, rule_version:'DEMO-R1', threshold:s.threshold });
    case 'reserve_inventory':
      if (!plan || !s.checkedPlans.includes(plan.id)) return bad('AUTHORIZATION_REQUIRED','执行前须调用规则校验工具。');
      if (plan.cost>s.threshold && !s.approvedPlans.includes(plan.id)) return bad('APPROVAL_REQUIRED','超阈值方案未获得人工授权。');
      if (s.reservation) return s.reservation.planId===plan.id ? good('重复锁库请求已去重。', {reservation_id:s.reservation.id,idempotent:true}) : bad('RESOURCE_ALREADY_LOCKED','已有库存锁，请先处理现有资源。');
      if (SCENARIOS[s.scenario].failFirst && plan.warehouse==='B' && s.failures===0) {
        s.inventory.B=0; s.inventoryRead=false; s.checkedPlans=[]; s.failures++;
        return bad('STOCK_CONFLICT','邻仓库存被并发订单占用，本次未锁定任何库存。请刷新库存并重新试算。',{reserved_quantity:0});
      }
      if (!s.inventoryRead || s.inventory[plan.warehouse]<plan.quantity) return bad('INSUFFICIENT_STOCK','库存不足或快照已失效，请刷新。');
      s.inventory[plan.warehouse]-=plan.quantity;
      s.reservation={id:`RSV-${s.id.slice(0,8)}`,planId:plan.id,warehouse:plan.warehouse,quantity:plan.quantity,cost:plan.cost};
      return good('库存锁定成功。',{reservation_id:s.reservation.id,quantity:plan.quantity,warehouse:plan.warehouse,idempotency_key:`${s.eventId}:${s.orderId}:V${s.version}:reserve`});
    case 'create_transfer':
      if (!s.reservation || s.reservation.id!==args.reservation_id) return bad('NO_RESERVATION','没有对应的有效库存锁。');
      if (s.transfer) return good('重复创建请求已去重。',{transfer_id:s.transfer.id,idempotent:true});
      s.transfer={id:`TR-${s.id.slice(0,8)}`,reservationId:s.reservation.id,warehouse:s.reservation.warehouse,cost:s.reservation.cost,status:'created'};
      return good('模拟调拨单已创建，尚未签收。',{transfer_id:s.transfer.id,status:'created',simulation:true});
    case 'verify_transfer':
      if (!transfer || !s.reservation) return bad('NO_TRANSFER','调拨单或资源锁不存在。');
      s.verified=true;
      return good('调拨单与资源锁匹配，无重复扣减。',{transfer_id:transfer.id,reserved_quantity:s.reservation.quantity,receipt_verified:true,delivered:false});
    case 'update_commitment':
      if (!transfer || !s.verified) return bad('VERIFY_FIRST','必须先核验调拨回执。');
      if (!transfer.commitmentFrom) { transfer.commitmentFrom=s.version; s.version++; }
      return good('承诺版本已更新，仍需客服同步与物流跟踪。',{commitment_version:s.version,delivery_status:s.delivery,closed:false});
    case 'notify_service':
      if (s.version<4 || !s.verified) return bad('COMMITMENT_REQUIRED','尚未形成已核验的新承诺。');
      s.notified=true;
      return good('客服模拟工单已同步，沟通草稿已生成。',{draft:'已安排跨仓调拨 120 件，预计在约定窗口内交付，后续持续跟踪。',external_message_sent:false});
    case 'track_delivery':
      if (!transfer || s.version<4 || !s.verified) return bad('COMMITMENT_REQUIRED','请先完成调拨核验及承诺更新。');
      s.trackingPolls=Math.min(s.trackingPolls+1,2); s.delivery=s.trackingPolls===1?'in_transit':'delivered'; transfer.status=s.delivery;
      return good(s.delivery==='delivered'?'模拟签收已确认。':'模拟物流已发运，仍在运输中。',{transfer_id:transfer.id,status:s.delivery,elapsed_simulated_hours:s.trackingPolls===1?3:(transfer.warehouse==='B'?6:8),simulation:true});
    case 'close_case':
      if (!s.verified || s.version<4 || !s.notified || s.delivery!=='delivered') return bad('NOT_FULFILLED','尚未满足关闭条件：必须核验回执、更新承诺、同步客服并确认模拟签收。');
      s.status='completed'; return good('模拟履约已完成，工单关闭。',{closed:true,version:s.version,cost:s.transfer.cost,simulation:true});
    case 'release_reservation':
      if (!s.reservation || s.reservation.id!==args.reservation_id) return bad('NO_RESERVATION','库存锁不存在或已经释放。');
      if (s.transfer) return bad('MANUAL_COMPENSATION_REQUIRED','调拨单已创建，需要人工核查后补偿，禁止自动释放资源。');
      s.inventory[s.reservation.warehouse]+=s.reservation.quantity; s.reservation=null; s.inventoryRead=false; s.checkedPlans=[];
      return good('未发运库存锁已释放，需重新查询资源。');
    case 'escalate_to_human': s.status='human'; return good('已转人工，保留当前资源锁和订单状态。',{reason:args.reason});
    default: return bad('UNKNOWN_TOOL','未知工具');
  }
}

export function approveCase(s, approved, note) {
  if (s.busy) throw new Error('本轮尚未结束，请稍后操作。');
  if (!s.pendingApproval || s.status!=='awaiting_approval') throw new Error('当前没有待审批事项。');
  const pending=s.pendingApproval;
  if (pending.version!==s.version) throw new Error('版本已变化，审批失效。');
  if (approved) { s.approvedPlans.push(pending.planId); s.checkedPlans.push(pending.planId); s.status='active'; }
  else s.status='rejected';
  s.pendingApproval=null;
  addEvent(s,'approval',approved?'管理者批准方案':'管理者拒绝方案',{...pending,approved,note,actor:'本机演示操作人（模拟管理者）'});
  s.messages.push({role:'system',content:`可信后端审批事件：${JSON.stringify({approved,...pending,note})}。${approved?'审批仅授权此方案，可继续执行。':'审批被拒绝，停止自动操作。'}`});
}

export function publicCase(s) {
  const {messages,controller,checkedPlans,approvedPlans,...rest}=s;
  return structuredClone(rest);
}
