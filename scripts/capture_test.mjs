import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const server=spawn('python3',['-m','http.server','8011','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:8011/web/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:390,height:664},{width:375,height:548},{width:844,height:390}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/models/manifest.json',route=>route.fulfill({json:{pipeline:'classroom',mode:'trained',model:'yolo11s.pt',file:'mock.tflite',inputSize:640,prompts:['Papier','Leichtverpackung','Buntglas','Weißglas','Biotonne','Restmüll']}}));
 await page.route('**/mock.tflite',route=>route.fulfill({body:'mock'}));
 await page.route('https://esm.sh/**',route=>route.fulfill({contentType:'application/javascript',body:`export const YOLO={load:async()=>({device:'cpu',predict:async(src)=>{window.calls=(window.calls||0)+1;window.inputType=src.tagName;await new Promise(r=>setTimeout(r,120));if(window.failNext){window.failNext=false;throw Error('Simulated failure')}return {width:src.width,height:src.height,boxes:[{cls:0,name:'Papier',conf:.9,x1:10,y1:10,x2:200,y2:300}]}},free(){}})};`}));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{const c=document.createElement('canvas');c.width=480;c.height=640;const g=c.getContext('2d');g.fillStyle='gray';g.fillRect(0,0,480,640);return c.captureStream(15);}}});});
 await page.goto('http://127.0.0.1:8011/web/');await page.locator('#start').click();
 await page.waitForFunction(()=>document.querySelector('#classify').hidden===false);
 assert.equal(await page.evaluate(()=>window.calls||0),0);
 const initial=await page.locator('#video').boundingBox();
 const frame=await page.locator('#camera').boundingBox();
 assert(Math.abs(initial.height-frame.height)<1 || Math.abs(initial.width-frame.width)<1,'Preview does not fill either frame dimension');
 assert(await page.locator('#reticle').isVisible());
 for(let n=1;n<=3;n++){
  await page.locator('#classify').click();
  await page.waitForFunction(()=>document.body.dataset.phase==='result');
  assert.equal(await page.evaluate(()=>window.calls),n);
  assert.equal(await page.evaluate(()=>window.inputType),'CANVAS');
  assert(await page.locator('#capture').isVisible());
  assert.equal(await page.locator('#video').evaluate(e=>e.hidden),false);
  assert.equal(await page.locator('#name').textContent(),'Papier');
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.calls),n);
  if(n===1)await page.screenshot({path:`capture-${viewport.width}.png`});
  await page.locator('#continue').click();assert(await page.locator('#video').isVisible());
  const current=await page.locator('#video').boundingBox();
  assert.deepEqual(current,initial,'Continue changed the displayed video size');
 }
 await page.evaluate(()=>window.failNext=true);await page.locator('#classify').click();
 await page.waitForFunction(()=>document.body.dataset.phase==='error');
 await page.locator('#continue').click();await page.locator('#classify').click();
 await page.waitForFunction(()=>document.body.dataset.phase==='result');assert.equal(await page.evaluate(()=>window.calls),5);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 await page.close();
 }
 console.log('PASS: three viewports, no automatic inference, repeated full-frame capture, frozen result, Continue, error recovery');
}finally{await browser?.close();server.kill();}
