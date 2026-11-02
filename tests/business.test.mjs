import test from 'node:test';
import assert from 'node:assert/strict';
import { createCase, executeTool, approveCase } from '../business.mjs';
const run=(s,name,args={})=>executeTool(s,name,{...args,decision_summary:'测试业务约束。'});
function prep(s){run(s,'get_order',{order_id:s.orderId});run(s,'query_inventory',{order_id:s.orderId});return run(s,'compare_plans',{order_id:s.orderId});}
function reserve(s,id='PLAN-B'){run(s,'check_authorization',{plan_id:id,expected_version:3});return run(s,'reserve_inventory',{plan_id:id,expected_version:3});}
function finish(s){const r=s.reservation.id;run(s,'create_transfer',{reservation_id:r,expected_version:3});const t=s.transfer.id;run(s,'verify_transfer',{transfer_id:t});run(s,'update_commitment',{transfer_id:t,expected_version:3});run(s,'notify_service',{order_id:s.orderId});run(s,'track_delivery',{transfer_id:t});run(s,'track_delivery',{transfer_id:t});return run(s,'close_case',{order_id:s.orderId});}

test('普通场景：验证完整闭环，创建调拨和第一次在途均不能关单',()=>{
 const s=createCase();prep(s);assert.equal(reserve(s).ok,true);
 run(s,'create_transfer',{reservation_id:s.reservation.id,expected_version:3});
 assert.equal(run(s,'close_case',{order_id:s.orderId}).code,'NOT_FULFILLED');
 const t=s.transfer.id;run(s,'verify_transfer',{transfer_id:t});run(s,'update_commitment',{transfer_id:t,expected_version:3});run(s,'notify_service',{order_id:s.orderId});
 assert.equal(run(s,'track_delivery',{transfer_id:t}).status,'in_transit');
 assert.equal(run(s,'close_case',{order_id:s.orderId}).ok,false);
 run(s,'track_delivery',{transfer_id:t});assert.equal(run(s,'close_case',{order_id:s.orderId}).ok,true);assert.equal(s.status,'completed');
});
test('库存争抢：没有扣减库存，需要刷新并选择其他仓',()=>{
 const s=createCase('retry');prep(s);const fail=reserve(s);assert.equal(fail.code,'STOCK_CONFLICT');assert.equal(s.reservation,null);assert.equal(s.inventory.C,120);
 assert.equal(run(s,'compare_plans',{order_id:s.orderId}).code,'REFRESH_INVENTORY');
 run(s,'query_inventory',{order_id:s.orderId});const plans=run(s,'compare_plans',{order_id:s.orderId}).plans;assert.deepEqual(plans.map(p=>p.id),['PLAN-C']);
 assert.equal(reserve(s,'PLAN-C').ok,true);assert.equal(finish(s).ok,true);assert.equal(s.transfer.cost,480);
});
test('超阈值：不能绕过规则，真实批准后才能继续',()=>{
 const s=createCase('approval');prep(s);
 assert.equal(run(s,'reserve_inventory',{plan_id:'PLAN-B',expected_version:3}).code,'AUTHORIZATION_REQUIRED');
 const auth=run(s,'check_authorization',{plan_id:'PLAN-B',expected_version:3});assert.equal(auth.authorization,'PENDING_HUMAN');
 assert.equal(run(s,'reserve_inventory',{plan_id:'PLAN-B',expected_version:3}).code,'APPROVAL_REQUIRED');assert.equal(s.reservation,null);
 approveCase(s,true,'为交付窗口授权本方案。');assert.equal(run(s,'reserve_inventory',{plan_id:'PLAN-B',expected_version:3}).ok,true);assert.equal(finish(s).ok,true);
});
test('审批拒绝、版本变化和非白名单调用均被阻止',()=>{
 const s=createCase('approval');prep(s);run(s,'check_authorization',{plan_id:'PLAN-B',expected_version:3});approveCase(s,false,'不同意成本。');
 assert.equal(run(s,'reserve_inventory',{plan_id:'PLAN-B',expected_version:3}).code,'SESSION_STOPPED');
 const s2=createCase();prep(s2);assert.equal(run(s2,'reserve_inventory',{plan_id:'PLAN-B',expected_version:2}).code,'VERSION_CONFLICT');
 assert.equal(run(s2,'cancel_order',{}).code,'INVALID_ARGUMENTS');
 assert.equal(run(s2,'get_order',{order_id:s2.orderId,override:true}).code,'INVALID_ARGUMENTS');
});
test('写操作幂等，补偿不重复释放且调拨创建后禁止自动释放',()=>{
 const s=createCase();prep(s);const first=reserve(s);assert.equal(reserve(s).reservation_id,first.reservation_id);assert.equal(s.inventory.B,0);
 assert.equal(run(s,'release_reservation',{reservation_id:first.reservation_id}).ok,true);assert.equal(s.inventory.B,120);
 assert.equal(run(s,'release_reservation',{reservation_id:first.reservation_id}).code,'NO_RESERVATION');assert.equal(s.inventory.B,120);
 prep(s);reserve(s);const r=s.reservation.id;const a=run(s,'create_transfer',{reservation_id:r,expected_version:3});const b=run(s,'create_transfer',{reservation_id:r,expected_version:3});assert.equal(a.transfer_id,b.transfer_id);
 assert.equal(run(s,'release_reservation',{reservation_id:r}).code,'MANUAL_COMPENSATION_REQUIRED');
 run(s,'verify_transfer',{transfer_id:a.transfer_id});run(s,'update_commitment',{transfer_id:a.transfer_id,expected_version:3});
 assert.equal(run(s,'update_commitment',{transfer_id:a.transfer_id,expected_version:3}).ok,true);assert.equal(s.version,4);
});
