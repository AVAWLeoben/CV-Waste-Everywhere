import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const elements=new Map();
const ctx2d={clearRect(){},drawImage(){},scale(){},strokeRect(){}};
function el(id){if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,style:{},addEventListener(){},textContent:'',width:480,height:640,videoWidth:480,videoHeight:640,naturalWidth:480,naturalHeight:640,classList:{toggle(){}},setAttribute(){},getContext:()=>ctx2d,getBoundingClientRect:()=>({width:390,height:420})});return elements.get(id);}
const scope=vm.createContext({document:{getElementById:el,body:{dataset:{},classList:{toggle(){}}},documentElement:{},addEventListener(){},hidden:false},window:{addEventListener(){}},localStorage:{getItem(){},setItem(){}},requestAnimationFrame:fn=>setImmediate(fn),performance,devicePixelRatio:1,URL,console});
vm.runInContext(readFileSync('web/app.js','utf8'),scope);
vm.runInContext(`config={confidence:.25,classes:[{de:'Papier',en:'Paper',bin:'paper'}]};manifest={mode:'trained',model:'yolo11s.pt',inputSize:640};source=$('video');mode='camera';phase='preview';globalThis.calls=0;model={device:'cpu',predict:async src=>{globalThis.calls++;if(globalThis.fail){globalThis.fail=false;throw Error('test error')}return {width:480,height:640,boxes:[{cls:0,conf:.9,x1:10,y1:10,x2:200,y2:300}]}}};render();`,scope);
assert.equal(scope.calls,0);
for(let n=1;n<=3;n++){
 const promise=el('classify').onclick();await el('classify').onclick();await promise;
 assert.equal(scope.calls,n,'Double click must not start a second inference');assert.equal(el('name').textContent,'Papier');
 assert.equal(el('continue').hidden,false);assert.equal(el('capture').hidden,false);
 assert.equal(el('video').hidden,false,'Live video must stay mounted behind the frozen capture');
 el('continue').onclick();assert.equal(el('capture').hidden,true);assert.equal(el('video').hidden,false);
}
scope.fail=true;await el('classify').onclick();assert.equal(el('continue').hidden,false);assert.match(el('diagnostics').textContent,/test error/);
el('continue').onclick();await el('classify').onclick();assert.equal(scope.calls,5);assert.equal(el('name').textContent,'Papier');
el('continue').onclick();const pending=el('classify').onclick();el('stop').onclick();await pending;
assert.equal(scope.calls,5,'Cancelled capture must not run');assert.equal(el('capture').hidden,true);
console.log('PASS: repeated capture, duplicate-click guard, frozen results, error recovery, cancellation before inference');

// Exercise the actual browser wait predicate with a DOM string property.
const browserTest=readFileSync('scripts/browser_test.mjs','utf8');
const predicate=browserTest.match(/live\.waitForFunction\((n=>.*?),first\+1,/)[1];
scope.document.querySelector=()=>({textContent:JSON.stringify({completed:2})});
assert.equal(vm.runInContext(`(${predicate})(2)`,scope),true);
assert.equal(vm.runInContext(`(${predicate})(3)`,scope),false);
// Runtime output order, size, centrality and cross-class overlap must not override confidence.
vm.runInContext(`source=$('video');mode='camera';phase='preview';config.classes.push({de:'Restmüll',en:'Residual waste',bin:'residual'});model.predict=async()=>({width:480,height:640,boxes:globalThis.testBoxes});`,scope);
for(const boxes of [
 [{cls:1,conf:.3,x1:0,y1:0,x2:480,y2:640},{cls:0,conf:.95,x1:5,y1:5,x2:40,y2:60}],
 [{cls:1,conf:.89,x1:10,y1:10,x2:200,y2:300},{cls:0,conf:.92,x1:10,y1:10,x2:200,y2:300}]
]){
 scope.testBoxes=boxes;await el('classify').onclick();assert.equal(el('name').textContent,'Papier');el('continue').onclick();
}
scope.testBoxes=[];await el('classify').onclick();assert.equal(el('name').textContent,'Kein eindeutiger Gegenstand erkannt');
console.log('PASS: actual browser wait predicate, highest confidence regardless of area/position/overlap, empty detections');
// A selected photo remains on the same element throughout the capture cycle.
el('continue').onclick();
vm.runInContext("source=$('photo');mode='photo';phase='preview';$('photo').hidden=false;render();",scope);
assert.equal(el('start').hidden,true);
await el('classify').onclick();
assert.equal(el('photo').hidden,false);assert.equal(el('capture').hidden,true);
el('continue').onclick();assert.equal(el('photo').hidden,false);assert.equal(el('capture').hidden,true);
assert.equal(vm.runInContext('cpuOnly',scope),false);
console.log('PASS: photo display continuity and GPU preference');

const rect=vm.runInContext('previewRect(1080,1920,373,397)',scope);
assert.equal(rect.width,373);assert.equal(rect.height,373*1920/1080);
assert.equal(rect.left,0);assert.equal(rect.top,(397-rect.height)/2);
for(const [w,h,fw,fh] of [[1080,1920,373,397],[1920,1080,373,397],[640,640,373,397]]){
 const g=vm.runInContext(`previewRect(${w},${h},${fw},${fh})`,scope);
 assert(g.width>=fw-1e-9&&g.height>=fh-1e-9);
 assert(Math.abs(g.left+g.width/2-fw/2)<1e-9);
 assert(Math.abs(g.top+g.height/2-fh/2)<1e-9);
}
console.log('PASS: centred cover geometry for portrait, landscape and square images');

// Loading starts during preview, gates CLASSIFY, and never invokes prediction.
el('continue').onclick();
vm.runInContext("model=null;phase='preview';globalThis.releaseLoad=null;ensureModel=()=>new Promise(resolve=>{globalThis.releaseLoad=()=>{model={device:'cpu'};resolve(model)}})",scope);
const before=scope.calls;const preload=vm.runInContext('preparePreview()',scope);
assert.equal(el('classify').disabled,true);assert.equal(el('photo').hidden,false);
await el('classify').onclick();assert.equal(scope.calls,before);
scope.releaseLoad();await preload;assert.equal(el('classify').disabled,false);assert.equal(scope.calls,before);
vm.runInContext("model=null;ensureModel=async()=>{throw Error('download failed')}",scope);
await vm.runInContext('preparePreview()',scope);assert.equal(el('classify').disabled,false);
assert.match(el('diagnostics').textContent,/download failed/);
vm.runInContext("ensureModel=async()=>{model={device:'cpu'};return model}",scope);
await el('classify').onclick();assert.equal(scope.calls,before);assert.equal(el('classify').textContent,'CLASSIFY');
console.log('PASS: preview preload, readiness gating, no preload inference, failed-load retry');
// Exercise GPU safety decisions without requiring a physical GPU.
const good={boxes:[{cls:0,conf:.9,x1:20,y1:30,x2:180,y2:300}]};
scope.good=good;
vm.runInContext(`
globalThis.cpuCalls=0;globalThis.gpuCalls=0;globalThis.freed=0;
gpuDevice={pushErrorScope(){},popErrorScope:async()=>null,queue:{onSubmittedWorkDone:async()=>{}}};
gpuFault='';gpuChecks=0;cpuOnly=false;
function testCpu(){return {device:'cpu',predict:async()=>{cpuCalls++;return good},free(){freed++}}}
YOLOFactory={load:async()=>testCpu()};cpuReference=testCpu();
model={device:'webgpu',predict:async()=>{gpuCalls++;return good},free(){freed++}};
`,scope);
const frame={width:720,height:1280};scope.frame=frame;
for(let i=0;i<3;i++)await vm.runInContext('predictWithFallback(frame,{})',scope);
assert.equal(scope.cpuCalls,2);assert.equal(scope.gpuCalls,3);
assert.equal(vm.runInContext('diagnostics.gpuVerification',scope),'passed');
assert.equal(vm.runInContext('cpuReference',scope),null);
// A later GPU validation failure falls back even after both comparisons passed.
vm.runInContext("gpuDevice.popErrorScope=async()=>({message:'invalid shader'})",scope);
assert.deepEqual(await vm.runInContext('predictWithFallback(frame,{})',scope),good);
assert.equal(vm.runInContext('model.device',scope),'cpu');
assert.match(vm.runInContext('diagnostics.gpuError',scope),/invalid shader/);
// A plausible finite but different GPU result is never displayed.
vm.runInContext(`gpuChecks=0;cpuOnly=false;gpuDevice.popErrorScope=async()=>null;gpuFault='';
model={device:'webgpu',predict:async()=>({boxes:[{cls:1,conf:.8,x1:20,y1:30,x2:180,y2:300}]}),free(){}};`,scope);
assert.deepEqual(await vm.runInContext('predictWithFallback(frame,{})',scope),good);
assert.equal(vm.runInContext('model.device',scope),'cpu');
// The exact padding signature is rejected, but confidence 114/255 alone is legal.
scope.padding={boxes:[{cls:0,conf:114/255,x1:6.117645263671875,y1:286.1176452636719,x2:578.3529052734375,y2:858.3529052734375}]};
assert.equal(vm.runInContext('paddingOutput(padding,720,1280)',scope),true);
assert.equal(vm.runInContext('paddingOutput({boxes:[{...good.boxes[0],conf:114/255}]},720,1280)',scope),false);
vm.runInContext("cpuOnly=false;gpuChecks=2;model={device:'webgpu',predict:async()=>padding,free(){}}",scope);
assert.deepEqual(await vm.runInContext('predictWithFallback(frame,{})',scope),good);
assert.match(vm.runInContext('diagnostics.gpuError',scope),/padding/);
console.log('PASS: two CPU comparisons, GPU-only after verification, later validation failure, silent mismatch and padding fallback');
vm.runInContext(`globalThis.GPUDevice=class {createShaderModule(d){return {getCompilationInfo:async()=>({messages:[{type:'error',message:'Not a valid statement',lineNum:2,linePos:1}]})}}};installShaderDiagnostics();new GPUDevice().createShaderModule({label:'test',code:'loop {\\n;\\ncontinuing {}\\n}'});`,scope);
await vm.runInContext('collectShaderDiagnostics()',scope);
assert.equal(vm.runInContext('diagnostics.shaderCapture',scope),'enabled');
assert.match(vm.runInContext('diagnostics.shaderErrors[0].messages[0].source',scope),/2: continuing/);
assert.equal(vm.runInContext('diagnostics.shaderErrors[0].messages[0].message',scope),'Not a valid statement');
console.log('PASS: shader compiler message, line number and source excerpt capture');

assert.equal(vm.runInContext("compatibleShader('loop {\\n  ;\\n  continuing {\\n i++;\\n }\\n}')",scope),'loop {\n  continuing {\n i++;\n }\n}');
for(const code of ['i++;\ncontinuing {','for(var i=0;i<4;i++){',';\nlet x=1;','// ;\ncontinuing {']){
 scope.shaderSample=code;assert.equal(vm.runInContext('compatibleShader(shaderSample)',scope),code);
}
assert.equal(vm.runInContext('diagnostics.shadersPatched',scope),1);
console.log('PASS: targeted shader repair preserves loop increments and other statements');
vm.runInContext("busy=false;loading=null;phase='result';model={device:'webgpu',free(){}};cpuReference=null;ensureModel=async()=>{model={device:cpuOnly?'cpu':'webgpu',free(){}};return model};diagnostics.inferenceMs=500",scope);
await el('backendToggle').onclick();
assert.equal(vm.runInContext('model.device',scope),'cpu');
assert.equal(vm.runInContext('phase',scope),'result');
assert.equal(vm.runInContext('diagnostics.inferenceMs',scope),undefined);
await el('backendToggle').onclick();assert.equal(vm.runInContext('model.device',scope),'webgpu');
vm.runInContext('busy=true',scope);await el('backendToggle').onclick();assert.equal(vm.runInContext('model.device',scope),'webgpu');
console.log('PASS: backend toggle both directions, preserved result, cleared stale timing, busy guard');
