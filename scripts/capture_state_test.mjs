import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const elements=new Map();
const ctx2d={clearRect(){},drawImage(){},scale(){},strokeRect(){}};
function el(id){if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',width:480,height:640,videoWidth:480,videoHeight:640,naturalWidth:480,naturalHeight:640,classList:{toggle(){}},setAttribute(){},getContext:()=>ctx2d,getBoundingClientRect:()=>({width:390,height:420})});return elements.get(id);}
const scope=vm.createContext({document:{getElementById:el,body:{dataset:{},classList:{toggle(){}}},documentElement:{},addEventListener(){},hidden:false},window:{addEventListener(){}},localStorage:{getItem(){},setItem(){}},requestAnimationFrame:fn=>setImmediate(fn),performance,devicePixelRatio:1,URL,console});
vm.runInContext(readFileSync('web/app.js','utf8'),scope);
vm.runInContext(`config={confidence:.25,classes:[{de:'Papier',en:'Paper',bin:'paper'}]};manifest={mode:'trained',model:'yolo11s.pt',inputSize:640};source=$('video');mode='camera';phase='preview';globalThis.calls=0;model={device:'cpu',predict:async src=>{globalThis.calls++;if(globalThis.fail){globalThis.fail=false;throw Error('test error')}return {width:480,height:640,boxes:[{cls:0,conf:.9,x1:10,y1:10,x2:200,y2:300}]}}};render();`,scope);
assert.equal(scope.calls,0);
for(let n=1;n<=3;n++){
 const promise=el('classify').onclick();await el('classify').onclick();await promise;
 assert.equal(scope.calls,n,'Double click must not start a second inference');assert.equal(el('name').textContent,'Papier');
 assert.equal(el('continue').hidden,false);assert.equal(el('capture').hidden,false);
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
