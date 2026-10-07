// Local-only preview: Node receives HTTP; Django still handles every request.
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const port=Number(process.env.PORT||3000);
const packages=path.resolve(__dirname,'../work/python-packages');
const child=spawn(process.env.FLOWDESK_PYTHON||'python',['-u',path.join(__dirname,'backend/preview_bridge.py')],{
  env:{...process.env,...(fs.existsSync(packages)?{PYTHONPATH:packages}:{})},stdio:['pipe','pipe','inherit']
});
let next=0;
const pending=new Map();
readline.createInterface({input:child.stdout}).on('line',line=>{
  let result;try{result=JSON.parse(line)}catch{return}
  const item=pending.get(result.id);if(!item)return;
  clearTimeout(item.timer);pending.delete(result.id);
  item.res.writeHead(result.status,result.headers.flat());item.res.end(Buffer.from(result.body,'base64'));
});
const server=http.createServer(async(req,res)=>{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1024*1024){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
  const url=new URL(req.url,`http://127.0.0.1:${port}`),id=++next;
  const timer=setTimeout(()=>{pending.delete(id);res.writeHead(504);res.end('Django did not respond');},15000);
  pending.set(id,{res,timer});
  child.stdin.write(JSON.stringify({id,method:req.method,path:url.pathname,query:url.search.slice(1),port,headers:req.headers,body:Buffer.concat(chunks).toString('base64')})+'\n');
});
child.on('error',error=>{console.error(error.message);server.close();process.exitCode=1});
child.on('exit',code=>{console.error('Django process stopped with exit code:',code);for(const {res,timer} of pending.values()){clearTimeout(timer);res.writeHead(502);res.end('Django stopped')}server.close()});
process.on('SIGINT',()=>{child.kill();server.close()});
server.on('error',error=>{console.error(error.message);child.kill();process.exitCode=1});
server.listen(port,'127.0.0.1',async()=>{
  try{const response=await fetch(`http://127.0.0.1:${port}/html/sign-in.html`);if(response.status!==200)throw new Error('HTTP '+response.status);console.log(`FlowDesk preview verified: http://127.0.0.1:${port}/html/sign-in.html`)}catch(error){console.error('Preview check failed:',error.message)}
});
