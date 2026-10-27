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
 // Exercise the real page styles with long predictions, without downloading a model.
 for(const viewport of [{width:375,height:548},{width:390,height:664},{width:430,height:740}]){
  const layoutContext=await browser.newContext({viewport});
  const layoutPage=await layoutContext.newPage();
  await layoutPage.goto('http://127.0.0.1:8000/site/');
  for(const language of ['de','en'])for(const active of [false,true]){
   await layoutPage.evaluate(({language,active})=>{
    document.documentElement.lang=language;document.body.classList.toggle('scanning',active);
    document.querySelector('#start').hidden=active;document.querySelector('#stop').hidden=!active;
    document.querySelector('#name').textContent=language==='de'?'Kunststoff-Getränkeverpackung':'Plastic beverage packaging';
    document.querySelector('#destination').textContent=language==='de'?'Gelbe Tonne / Gelber Sack':'Yellow bin / yellow bag';
    document.querySelector('#advice').textContent=language==='de'?'Nur restentleerte Verpackungen. Bei Getränkeflaschen und -dosen zuerst Pfand prüfen.':'Emptied packaging only. Check beverage bottles and cans for a deposit first.';
    document.querySelector('#status').textContent=language==='de'?'Erkennung wird vorbereitet. Der erste Download kann etwas dauern …':'Preparing recognition. The first download may take a while …';
   },{language,active});
   const bounds=await layoutPage.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,rects:['camera','name','advice','versionDisclaimer','status',document.querySelector('#start').hidden?'stop':'start'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};})}));
   assert(bounds.scrollWidth<=bounds.width && bounds.scrollHeight<=bounds.height+1,`Page overflow: ${JSON.stringify(bounds)}`);
   for(const r of bounds.rects)assert(r.top>=0&&r.bottom<=bounds.height+1&&r.left>=0&&r.right<=bounds.width,`Offscreen ${r.id}`);
   assert(bounds.rects[0].height>=100,'Camera became too small');
  }
  await layoutPage.locator('#infoButton').click();assert(await layoutPage.locator('#infoDialog').isVisible());
  await layoutPage.locator('#closeInfo').click();assert(!(await layoutPage.locator('#infoDialog').isVisible()));
  await layoutContext.close();
 }
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
  const png=await live.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=640;const g=c.getContext('2d');g.fillStyle='#cedac2';g.fillRect(0,0,640,640);g.fillStyle='#345d47';g.fillRect(220,80,200,480);return c.toDataURL().split(',')[1];});
  await live.locator('#image').setInputFiles({name:'synthetic-test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  let d,success=false;
  for(let n=0;n<240;n++){
   d=JSON.parse(await live.locator('#diagnostics').textContent());
   if(d.error)throw Error(d.error);
   if(d.completed>0){success=true;break;}
   await new Promise(r=>setTimeout(r,1000));
  }
  assert(success,'Model did not complete browser inference within four minutes');
  assert.equal(d.mode,'trained');
  assert.equal(d.inputSize,640);
  assert.equal(d.model,'waste_yolov8n.pt');
  assert(Array.isArray(d.detections));
  for(const b of d.detections)assert([b.conf,b.x1,b.y1,b.x2,b.y2].every(Number.isFinite));
  if(forceCPU)assert.equal(d.backend,'cpu');
  reports.push({forceCPU,backend:d.backend,fallback:d.fallback,completed:true,detections:d.detections});
  await ctx.close();
 }
 const path='site/models/validation.json',report=JSON.parse(readFileSync(path));
 report.browserTested=true;report.browser=reports;writeFileSync(path,JSON.stringify(report,null,2));
 console.log('PASS: rear camera, language, layout, YOLOv8n inference and CPU path.',reports);
}finally{await browser?.close();server.kill();}
