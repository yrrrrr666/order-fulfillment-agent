import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createCase, SCENARIOS, publicCase, approveCase, addEvent } from './business.mjs';
import { stepAgent } from './agent.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root,'.env')); } catch (e) { if (e.code!=='ENOENT') console.error('本地 .env 读取失败，请检查文件格式。'); }

export function createApp({apiKey=process.env.DEEPSEEK_API_KEY||'',model=process.env.DEEPSEEK_MODEL||'deepseek-flash',provider}={}) {
  const config={apiKey,model};
  const sessions=new Map();
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    const host=req.headers.host;
    const port=server.address()?.port;
    const permitted=[`127.0.0.1:${port}`,`localhost:${port}`];
    if (!permitted.includes(host)) return send(res,403,{error:'只允许从本机访问。'});
    if (req.headers.origin && !permitted.map(h=>`http://${h}`).includes(req.headers.origin)) return send(res,403,{error:'拒绝跨来源请求。'});
    const url=new URL(req.url,`http://${host}`);
    async function body() {
      if (!String(req.headers['content-type']).startsWith('application/json')) throw new Error('请求格式须为 JSON。');
      const chunks=[];let length=0;
      for await (const chunk of req) {length+=chunk.length;if(length>12000)throw new Error('请求过大。');chunks.push(chunk);}
      const value=Buffer.concat(chunks).toString('utf8');
      return value ? JSON.parse(value) : {};
    }
    try {
      if (req.method==='GET' && url.pathname==='/api/config') return send(res,200,{configured:!!config.apiKey,model:config.model,provider:'DeepSeek',scenarios:SCENARIOS});
      if (req.method==='POST' && url.pathname==='/api/config') {
        const b=await body();
        if ([...sessions.values()].some(s=>s.busy)) return send(res,409,{error:'运行过程中无法更改模型配置。'});
        if (b.clear===true) config.apiKey='';
        else if (b.apiKey!==undefined && b.apiKey!=='') {
          if (typeof b.apiKey!=='string'||b.apiKey.length<8||b.apiKey.length>256||/[\r\n]/.test(b.apiKey)) throw new Error('API Key 格式无效。');
          config.apiKey=b.apiKey.trim();
        }
        if (b.model!==undefined) {if (typeof b.model!=='string'||! /^[a-zA-Z0-9._:/-]{1,80}$/.test(b.model)) throw new Error('模型名称无效。');config.model=b.model;}
        return send(res,200,{configured:!!config.apiKey,model:config.model});
      }
      if (req.method==='POST' && url.pathname==='/api/sessions') {
        const b=await body();
        if ([...sessions.values()].some(s=>s.busy)) return send(res,409,{error:'请先结束当前执行轮次。'});
        if (sessions.size>=24) { const oldest=[...sessions.values()].find(s=>!s.busy); if(oldest) sessions.delete(oldest.id); }
        const s=createCase(b.scenario||'standard'); sessions.set(s.id,s);
        addEvent(s,'observe','异常事件已进入待办',{order_id:s.orderId,scenario:SCENARIOS[s.scenario].name,simulation:true});
        return send(res,201,publicCase(s));
      }
      const match=url.pathname.match(/^\/api\/sessions\/([\w-]+)(?:\/(step|approve|takeover|export))?$/);
      if (match) {
        const s=sessions.get(match[1]); if(!s) return send(res,404,{error:'会话不存在或服务已重启，请新建演示。'});
        const action=match[2];
        if (req.method==='GET' && (!action||action==='export')) {
          if(action==='export') {res.setHeader('Content-Disposition',`attachment; filename="agent-audit-${s.id.slice(0,8)}.json"`);return send(res,200,{...publicCase(s),disclosure:'真实 DeepSeek 模型调用；订单、库存、物流、审批角色为业务模拟。内存会话，未包含密钥或模型隐藏思维。'});}
          return send(res,200,publicCase(s));
        }
        if (req.method==='POST'&&action==='step') {await body(); await stepAgent(s,{...config},provider);return send(res,200,publicCase(s));}
        if (req.method==='POST'&&action==='approve') {
          const b=await body();if(typeof b.approved!=='boolean'||typeof b.note!=='string'||!b.note.trim()||b.note.length>400)throw new Error('审批需要选择结果并填写原因（最多 400 字）。');
          approveCase(s,b.approved,b.note);return send(res,200,publicCase(s));
        }
        if(req.method==='POST'&&action==='takeover') {
          await body(); if(['completed','rejected','human'].includes(s.status))return send(res,200,publicCase(s));
          s.status='human';s.controller?.abort();addEvent(s,'handover','操作人已接管',{message:'自动写操作停止；现有资源锁保留，请依据回执人工处理。'});return send(res,200,publicCase(s));
        }
      }
      const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
      if(req.method==='GET'&&files[url.pathname]) {
        const data=await readFile(path.join(root,'public',files[url.pathname]));
        const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(files[url.pathname])];
        res.writeHead(200,{'Content-Type':`${mime}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return res.end(data);
      }
      send(res,404,{error:'未找到资源。'});
    }catch(error){send(res,400,{error:error.message||'请求失败'});}
  });
  return {server,sessions,config};
}

if (process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const port=Number(process.env.PORT||3120);
  const {server}=createApp();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请修改 .env 的 PORT。`:'服务启动失败。');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`订单履约智能体 Demo\n本机地址：http://127.0.0.1:${port}\n浏览器配置 API Key 后即可开始。按 Ctrl+C 关闭服务。`));
}
