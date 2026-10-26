// SPDX-License-Identifier: AGPL-3.0-or-later
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
const server=spawn('python3',['-m','http.server','8000','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
const reports=[];
try{
 let ready=false;
 for(let n=0;n<40;n++){
  try{if((await fetch('http://127.0.0.1:8000/site/')).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 assert(ready,'Test server did not start');
 browser=await chromium.launch({args:['--enable-unsafe-webgpu','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.addInitScript(()=>{
  window.requests=[];
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async c=>{
   window.requests.push(c);throw new DOMException('No rear camera','OverconstrainedError');
  }}});
 });
 await page.goto('http://127.0.0.1:8000/site/');await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
 const requests=await page.evaluate(()=>window.requests);
 assert.equal(requests.length,1);assert.deepEqual(requests[0].video.facingMode,{exact:'environment'});
 await page.locator('#language').click();assert.equal(await page.locator('#start').textContent(),'Start rear camera');
 await page.reload();assert.equal(await page.locator('#start').textContent(),'Start rear camera');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await context.close();
 for(const forceCPU of [false,true]){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  const live=await ctx.newPage();
  live.on('pageerror',e=>console.error('Page error:',e.stack));
  live.on('console',m=>{if(m.type()==='error')console.error('Browser:',m.text());});
  if(forceCPU)await live.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));
  await live.goto('http://127.0.0.1:8000/site/');
  const png=await live.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=320;const g=c.getContext('2d');g.fillStyle='#cedac2';g.fillRect(0,0,320,320);g.fillStyle='#345d47';g.fillRect(110,40,100,240);return c.toDataURL().split(',')[1];});
  await live.locator('#image').setInputFiles({name:'synthetic-test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  let d,success=false;
  for(let n=0;n<240;n++){
   d=JSON.parse(await live.locator('#diagnostics').textContent());
   if(d.error)throw Error(d.error);
   if(d.completed>0){success=true;break;}
   await new Promise(r=>setTimeout(r,1000));
  }
  assert(success,'Model did not complete browser inference within four minutes');
  assert.equal(d.mode,'world');
  assert.equal(d.model,'yolov8s-worldv2.pt');
  assert(Array.isArray(d.detections));
  for(const b of d.detections)assert([b.conf,b.x1,b.y1,b.x2,b.y2].every(Number.isFinite));
  if(forceCPU)assert.equal(d.backend,'cpu');
  reports.push({forceCPU,backend:d.backend,fallback:d.fallback,completed:true,detections:d.detections});
  await ctx.close();
 }
 const path='site/models/validation.json',report=JSON.parse(readFileSync(path));
 report.browserTested=true;report.browser=reports;writeFileSync(path,JSON.stringify(report,null,2));
 console.log('PASS: rear camera, language, layout, YOLO-World v2 inference and CPU path.',reports);
}finally{await browser?.close();server.kill();}
