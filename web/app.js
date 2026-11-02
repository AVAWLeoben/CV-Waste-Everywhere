// SPDX-License-Identifier: AGPL-3.0-or-later
const $=id=>document.getElementById(id);
const words={
 de:{eyebrow:'WENIGER RÄTSELN. BESSER TRENNEN.',heading:'Zeig uns, was du entsorgen möchtest.',intro:'Ein Gegenstand. Deine Rückkamera. Eine erste Orientierung.',privacy:'● Bleibt auf deinem Gerät',start:'Rückkamera starten',stop:'Kamera stoppen',chooseText:'Foto wählen',resultTitle:'DEINE SORTIERHILFE',ready:'Bereit, wenn du es bist.',search:'Gegenstand ins Bild halten',steady:'Kurz ruhig halten …',uncertain:'Noch nicht eindeutig',loading:'Erkennung wird vorbereitet. Der erste Download kann etwas dauern …',active:'Erkennung läuft lokal auf deinem Gerät.',stopped:'Kamera gestoppt.',cameraError:'Rückkamera nicht verfügbar. Kamerazugriff in Safari erlauben oder ein Foto auswählen.',modelError:'Erkennung konnte nicht geladen werden. Bitte erneut versuchen.',imageError:'Foto konnte nicht geöffnet werden.',inferError:'Erkennung unterbrochen. Bitte neu starten.',generic:'Objekt erkannt. Dieses Testmodell bestimmt noch keine passende Sammlung.',trained:'Experimentelle Erkennung. Empfehlung und Ausnahmen bitte prüfen.',standin:'Testmodus: allgemeines YOLO-Modell. Objekterkennung ohne Entsorgungsempfehlung.',footer:'Prototyp für Österreich. Bilder werden nicht hochgeladen oder gesammelt. Unsichere Ergebnisse sind keine Entsorgungsempfehlung.',rules:'Offizielle Informationen zur Mülltrennung ↗'},
 en:{eyebrow:'LESS GUESSING. BETTER SORTING.',heading:'Show us what you want to throw away.',intro:'One item. Your rear camera. A little guidance.',privacy:'● Stays on your device',start:'Start rear camera',stop:'Stop camera',chooseText:'Choose photo',resultTitle:'YOUR SORTING GUIDE',ready:'Ready when you are.',search:'Hold one item in view',steady:'Hold still for a moment …',uncertain:'Not clear yet',loading:'Preparing recognition. The first download may take a while …',active:'Recognition is running locally on your device.',stopped:'Camera stopped.',cameraError:'Rear camera unavailable. Allow camera access in Safari or choose a photo.',modelError:'Could not load recognition. Please try again.',imageError:'Could not open this photo.',inferError:'Recognition interrupted. Please restart.',generic:'Object detected. This test model does not determine its collection stream yet.',trained:'Experimental recognition. Check the suggestion and exceptions.',standin:'Test mode: general YOLO model. Object recognition without disposal advice.',footer:'Prototype for Austria. Images are not uploaded or collected. Uncertain results are not disposal advice.',rules:'Official waste-sorting information ↗'}
};
const bins={
 residual:{de:['Restmüll','Nur nicht verwertbarer Haushaltsabfall. Keine Batterien, Elektrogeräte oder Problemstoffe.'],en:['Residual waste','Non-recyclable household waste only. No batteries, electronics or hazardous waste.']},
 yellow:{de:['Gelbe Tonne / Gelber Sack','Nur restentleerte Verpackungen. Bei Getränkeflaschen und -dosen zuerst Pfand prüfen.'],en:['Yellow bin / yellow bag','Emptied packaging only. Check beverage bottles and cans for a deposit first.']},
 deposit:{de:['Zuerst Pfand prüfen','Mit österreichischem Pfandzeichen: leer und unzerdrückt zurückgeben. Ohne Zeichen: Verpackungssammlung prüfen.'],en:['Check the deposit first','With the Austrian deposit mark: return empty and uncrushed. Otherwise check packaging collection rules.']},
 clear:{de:['Weißglas – sofern kein Mehrweg','Nur restentleerte, farblose Glasverpackungen. Mehrwegflaschen zurückgeben. Keine Trinkgläser.'],en:['Clear glass – unless returnable','Emptied, colourless glass packaging only. Return reusable bottles. No drinking glasses.']},
 colored:{de:['Buntglas – sofern kein Mehrweg','Nur restentleerte, farbige Glasverpackungen. Mehrwegflaschen zurückgeben. Keine Trinkgläser.'],en:['Coloured glass – unless returnable','Emptied, coloured glass packaging only. Return reusable bottles. No drinking glasses.']},
 paper:{de:['Altpapier – wenn geeignet','Sauberes Papier und Karton. Beschichtete Verpackungen, Getränkekartons und verschmutztes Papier gesondert prüfen.'],en:['Paper collection – if suitable','Clean paper and cardboard. Check coated packaging, beverage cartons and soiled paper separately.']},
 bio:{de:['Biotonne – örtliche Regeln prüfen','Unverpackte Obst-, Gemüse- und Pflanzenreste. Andere Speisereste werden nicht überall angenommen.'],en:['Organic waste – check local rules','Unpackaged fruit, vegetable and plant scraps. Other food leftovers are not accepted everywhere.']},
 special:{de:['Getrennte Rückgabe / Sammelstelle','Batterien und Elektrogeräte getrennt abgeben. Nicht in Restmüll, Biotonne oder Verpackungssammlung.'],en:['Separate return / collection point','Return batteries and electronics separately. Keep out of residual, organic and packaging bins.']}
};
const common={bottle:'Flasche',person:'Person',cup:'Becher / Tasse',bowl:'Schüssel',banana:'Banane',apple:'Apfel',orange:'Orange',chair:'Stuhl',book:'Buch','cell phone':'Mobiltelefon'};
let lang='de';try{lang=localStorage.getItem('waste-lang')||'de';}catch{}if(!words[lang])lang='de';
let config,manifest,model,loading,stream,source,mode,photoURL,busy=false,epoch=0,previous=null,count=0,last=0;
let phase='idle',resultSize=null;
let state='ready',status='',error='',item=null;const diagnostics={};
// Mobile scanning behaviour
Object.assign(words.de,{modelLoading:'Modell lädt …',retryModel:'Modell erneut laden',classify:'CLASSIFY',continue:'Weiter',processing:'Bild wird ausgewertet …',captureReady:'Gegenstand ausrichten und CLASSIFY drücken.',finished:'Auswertung abgeschlossen.',noItem:'Kein eindeutiger Gegenstand erkannt',inferError:'Auswertung fehlgeschlagen. Weiter drücken und erneut versuchen.'});
Object.assign(words.en,{modelLoading:'Loading model …',retryModel:'Retry model loading',classify:'CLASSIFY',continue:'Continue',processing:'Classifying captured image …',captureReady:'Frame one item, then press CLASSIFY.',finished:'Analysis complete.',noItem:'No clear object detected',inferError:'Analysis failed. Press Continue and try again.'});
// Build identification start
const APP_BUILD={"version": "0.7.3", "build": "35.1-8d53451", "builtAt": "2026-11-02 13:52 UTC"};
function renderVersion(){
 const size=manifest?.inputSize;
 const modelInfo=size ? `${manifest.architecture || "YOLO detector"} · ${manifest.model} · ${size}×${size}${manifest.end2end ? " · End-to-end" : ""}` : (lang==='de'?'Modell noch nicht geladen':'Model not loaded yet');
 $('versionDisclaimer').textContent=`v${APP_BUILD.version} · Build ${APP_BUILD.build} · ${modelInfo}\n${APP_BUILD.builtAt}\n`+(lang==='de'?'Experimenteller Prototyp – Material und Sortierempfehlung können falsch sein.':'Experimental prototype – material and sorting advice may be incorrect.');
 diagnostics.appVersion=APP_BUILD.version;diagnostics.appBuild=APP_BUILD.build;
}
// Build identification end
function render(){
 renderVersion();
 document.body.dataset.phase=phase;
 fitPreview();
 $('classify').hidden=!source||phase==='result'||phase==='error';
 $('classify').disabled=busy||!source||(!model&&status!=='modelError');
 $('classify').textContent=words[lang][phase==='processing'?'processing':!model?(status==='modelError'?'retryModel':'modelLoading'):'classify'];
 $('continue').hidden=phase!=='result'&&phase!=='error';
 $('continue').textContent=words[lang].continue;
 $('reticle').hidden=!source||phase!=='preview';
 $('image').disabled=busy;
 $('choose').classList.toggle('disabled',busy);
 $('start').disabled=busy;
 $('start').hidden=!!source;
 $('camera').setAttribute('aria-busy',String(phase==='processing'));
 $('backendToggle').disabled=busy||!!loading||!model;
 $('backendToggle').textContent=(lang==='de'?'Aktiv: ':'Active: ')+(model?.device==='webgpu'?'WebGPU':'CPU')+' · '+(lang==='de'?'Wechsel zu ':'Switch to ')+(model?.device==='webgpu'?'CPU':'WebGPU');

 renderVersion();
 document.body.classList.toggle('scanning',!!source);
 document.documentElement.lang=lang;
 for(const id of ['eyebrow','heading','intro','privacy','start','stop','chooseText','resultTitle','footer','rules'])$(id).textContent=words[lang][id];
 $('language').textContent=lang==='de'?'EN':'DE';$('status').textContent=words[lang][status]||'';$('status').classList.toggle('error',!!error);
 $('destination').textContent='';$('advice').textContent='';$('name').textContent=words[lang][state]||'';
 if(item){const c=manifest.mode==='trained'?config.classes[item.cls]:null;const name=item.name||String(item.cls);$('name').textContent=c?.[lang]||(lang==='de'?common[name]:null)||name;if(c&&bins[c.bin]){[$('destination').textContent,$('advice').textContent]=bins[c.bin][lang];}else $('advice').textContent=words[lang].generic;}
 if(item && manifest.mode==='trained'){
  const prompt=config.classes[item.cls]?.prompt||'';
  if(/bottle/i.test(prompt)){
   $('name').textContent=lang==='de'?'Flasche – Material unklar':'Bottle – material uncertain';
   $('destination').textContent='';
   $('advice').textContent=lang==='de'?'Kunststoff oder Glas? Bitte am Gegenstand prüfen.':'Plastic or glass? Please check the item.';
  }
 }
 $('notice').textContent=manifest?words[lang][manifest.mode]:'';$('diagnostics').textContent=JSON.stringify({...diagnostics,backend:model?.device,error:error||undefined},null,2);
}
function setStatus(key,e=''){status=key;error=e;render();}
function reset(){previous=null;count=0;item=null;state='search';const c=$('overlay');c.getContext('2d').clearRect(0,0,c.width,c.height);render();}
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json();}

// Pinned loader 0.0.55 checks full GPU delegation before selecting WebGPU.
const LITERT_WASM='https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/wasm/';
let cpuOnly=false,modelFile=null,YOLOFactory=null,cpuReference=null,gpuDevice=null,gpuFault='',gpuChecks=0;
// Install before model loading: GPU shaders may compile during load or first prediction.
const shaderTasks=new Set();
let shaderDiagnosticsInstalled=false;
// Remove only an empty statement immediately before a WGSL continuing block.
// No math, indexing, loop increments or model operations are changed.
function compatibleShader(code){
 return code.replace(/^[ \t]*;[ \t]*\r?\n(?=[ \t]*continuing[ \t]*\{)/gm,'');
}
function installShaderDiagnostics(){
 if(shaderDiagnosticsInstalled)return;
 const proto=globalThis.GPUDevice?.prototype;
 if(!proto?.createShaderModule){diagnostics.shaderCapture='unavailable';return;}
 const original=proto.createShaderModule;
 try{
  proto.createShaderModule=function(descriptor){
   const patched=compatibleShader(String(descriptor.code));
   if(patched!==descriptor.code){
    diagnostics.shaderWorkaround='remove empty statement before continuing';
    diagnostics.shadersPatched=(diagnostics.shadersPatched||0)+1;
    descriptor={...descriptor,code:patched};
   }
   const shader=original.call(this,descriptor);
   if(shader.getCompilationInfo){
    const task=shader.getCompilationInfo().then(info=>{
     const errors=[...info.messages].filter(m=>m.type==='error');
     if(!errors.length)return;
     diagnostics.shaderErrors??=[];
     if(diagnostics.shaderErrors.length>=8)return;
     const lines=String(descriptor.code||'').split('\n');
     diagnostics.shaderErrors.push({label:descriptor.label||'',messages:errors.slice(0,4).map(m=>({
      message:m.message,line:m.lineNum,column:m.linePos,
      source:lines.slice(Math.max(0,m.lineNum-4),m.lineNum+3).map((line,i)=>`${Math.max(0,m.lineNum-4)+i+1}: ${line}`).join('\n')
     }))});
     render();
    }).catch(e=>{diagnostics.shaderCaptureError=String(e.message||e);});
    shaderTasks.add(task);task.finally(()=>shaderTasks.delete(task));
   }
   return shader;
  };
  shaderDiagnosticsInstalled=true;diagnostics.shaderCapture='enabled';
 }catch(e){diagnostics.shaderCapture=String(e.message||e);}
}
async function collectShaderDiagnostics(){await Promise.allSettled([...shaderTasks]);}
async function cpuModel(){
 if(!cpuReference){
  cpuReference=await YOLOFactory.load(modelFile,{device:'cpu',litertWasmUrl:LITERT_WASM});
  if(cpuReference.device!=='cpu'){cpuReference.free();cpuReference=null;throw Error('CPU verification backend unavailable');}
 }
 return cpuReference;
}
async function ensureModel(){
 if(model)return model;if(loading)return loading;
 loading=(async()=>{
  setStatus('loading');
  [config,manifest]=await Promise.all([json('./config.json'),json('./models/manifest.json')]);
  if(manifest.pipeline!=='classroom'||manifest.mode!=='trained'||typeof manifest.model!=='string'||!manifest.model.endsWith('.pt'))throw Error('Expected the trained YOLO classroom-compatible export');
  if(JSON.stringify(manifest.prompts)!==JSON.stringify(config.classes.map(c=>c.prompt)))throw Error('Model vocabulary mismatch');
  Object.assign(diagnostics,{end2end:manifest.end2end,model:manifest.model,mode:manifest.mode,inputSize:manifest.inputSize,loaderVersion:'0.0.55',gpuVerification:'pending'});render();
  YOLOFactory=(await import('@ultralytics/yolo')).YOLO;
  if(!modelFile){
   const response=await fetch(new URL('./models/'+manifest.file,location.href));
   if(!response.ok)throw Error(`Model HTTP ${response.status}`);
   modelFile=new File([await response.blob()],manifest.file,{type:'application/octet-stream'});
  }
  installShaderDiagnostics();
  let candidate;
  try{
   candidate=await YOLOFactory.load(modelFile,{device:cpuOnly?'cpu':'webgpu',litertWasmUrl:LITERT_WASM});
   if(candidate.device==='webgpu'){
    const core=await import('@litertjs/core');gpuDevice=core.getWebGpuDevice();
    if(!gpuDevice?.pushErrorScope)throw Error('WebGPU validation is unavailable');
    gpuDevice.addEventListener('uncapturederror',event=>{gpuFault=event.error?.message||'Uncaptured WebGPU error';});
    gpuDevice.lost.then(info=>{gpuFault=`WebGPU device lost: ${info.message||info.reason}`;});
    // Compile CPU reference during preview too; CLASSIFY never waits for its initial download.
    await cpuModel();
   }else{cpuOnly=true;diagnostics.gpuVerification='not used';diagnostics.fallback=diagnostics.backendChoice==='cpu'?'CPU selected manually':'Runtime selected CPU (GPU unavailable, compilation failed, or partial delegation)';}
   model=candidate;
  }catch(e){
   await collectShaderDiagnostics();
   try{candidate?.free();}catch{}
   cpuOnly=true;diagnostics.gpuError=String(e.message||e);diagnostics.fallback='cpu';diagnostics.gpuVerification='fallback';
   model=await cpuModel();
  }
  return model;
 })();
 try{return await loading;}finally{loading=null;}
}
function validDetections(result){
 return Array.isArray(result?.boxes)&&result.boxes.every(b=>Number.isInteger(b.cls)&&b.cls>=0&&b.cls<config.classes.length&&Number.isFinite(b.conf)&&b.conf>=0&&b.conf<=1&&[b.x1,b.y1,b.x2,b.y2].every(Number.isFinite)&&b.x2>=b.x1&&b.y2>=b.y1);
}
function compareDetections(gpu,cpu,w,h){
 if(!validDetections(gpu)||!validDetections(cpu))return 'Invalid detection values';
 if(gpu.boxes.length!==cpu.boxes.length)return 'CPU/GPU detection counts differ';
 const remaining=[...cpu.boxes];
 const tolerance=2+Math.max(w,h)*.005;
 for(const a of [...gpu.boxes].sort((a,b)=>b.conf-a.conf)){
  const i=remaining.findIndex(b=>a.cls===b.cls&&Math.abs(a.conf-b.conf)<=.02&&['x1','y1','x2','y2'].every(k=>Math.abs(a[k]-b[k])<=tolerance));
  if(i<0)return 'CPU/GPU classes, confidence or boxes differ';
  remaining.splice(i,1);
 }
 return '';
}
function paddingOutput(result,w,h){
 // Match the complete known corruption signature, never confidence alone.
 const size=manifest.inputSize,scale=Math.min(size/w,size/h);
 const px=Math.round((size-Math.round(w*scale))/2-.1),py=Math.round((size-Math.round(h*scale))/2-.1),v=114/255;
 return result.boxes.some(b=>Math.abs(b.conf-v)<1e-5&&[
  ((b.x1+b.x2)/2*scale+px)/size,((b.y1+b.y2)/2*scale+py)/size,
  (b.x2-b.x1)*scale/size,(b.y2-b.y1)*scale/size
 ].every(x=>Math.abs(x-v)<1e-4));
}
async function checkedGpuPrediction(src,options){
 if(gpuFault)throw Error(gpuFault);
 if(!gpuDevice)throw Error('No WebGPU validation device');
 const scopes=['validation','internal','out-of-memory'];
 for(const type of scopes)gpuDevice.pushErrorScope(type);
 let result,failure;
 try{result=await model.predict(src,options);await gpuDevice.queue.onSubmittedWorkDone();}
 catch(e){failure=e;}
 finally{
  for(let i=scopes.length-1;i>=0;i--){
   try{const err=await gpuDevice.popErrorScope();if(err)failure=Error(err.message);}catch(e){failure=e;}
  }
 }
 await collectShaderDiagnostics();
 if(failure)throw failure;if(gpuFault)throw Error(gpuFault);
 if(!validDetections(result))throw Error('Invalid GPU output');
 if(paddingOutput(result,src.width,src.height))throw Error('GPU output matches input-padding corruption');
 return result;
}
async function fallbackToCpu(reason,src,options,referenceResult){
 const failed=model;cpuOnly=true;diagnostics.fallback='cpu';diagnostics.gpuError=String(reason.message||reason);diagnostics.gpuVerification='fallback';
 try{failed?.free();}catch{}model=null;
 model=await cpuModel();
 return referenceResult||await model.predict(src,options);
}
async function predictWithFallback(src,options){
 diagnostics.verificationPerformed=false;
 if(model.device!=='webgpu')return model.predict(src,options);
 let referenceResult;
 try{
  const start=performance.now(),result=await checkedGpuPrediction(src,options);
  diagnostics.gpuPredictionMs=Math.round(performance.now()-start);
  if(gpuChecks<2){
   diagnostics.verificationPerformed=true;
   const reference=await cpuModel(),t=performance.now();
   referenceResult=await reference.predict(src,options);
   diagnostics.cpuVerificationMs=Math.round(performance.now()-t);
   if(!validDetections(referenceResult))throw Error('Invalid CPU verification output');
   const difference=compareDetections(result,referenceResult,src.width,src.height);
   if(difference)throw Error(difference);
   gpuChecks++;diagnostics.gpuChecksPassed=gpuChecks;diagnostics.gpuVerification=gpuChecks===2?'passed':'1 of 2 passed';
   // Release the second model after verification to avoid retaining two weight sets.
   if(gpuChecks===2){cpuReference.free();cpuReference=null;}
  }
  return result;
 }catch(e){return fallbackToCpu(e,src,options,validDetections(referenceResult)?referenceResult:null);}
}
// Load and compile while the user frames the item; never run prediction here.
async function preparePreview(token=epoch){
 setStatus(model?'captureReady':'loading');
 try{
  await ensureModel();
  if(token===epoch&&source&&phase==='preview')setStatus('captureReady');
 }catch(e){
  if(token===epoch&&source&&phase==='preview')setStatus('modelError',String(e.message||e));
 }
}
function stop(){epoch++;phase='idle';resultSize=null;$('capture').hidden=true;stream?.getTracks().forEach(t=>t.stop());stream=null;source=null;mode=null;$('video').srcObject=null;$('video').hidden=true;$('photo').hidden=true;$('placeholder').hidden=false;$('stop').hidden=true;$('start').hidden=false;reset();state='ready';setStatus('stopped');}
$('stop').onclick=stop;
$('start').onclick=async()=>{
 stop();const token=epoch;$('start').disabled=true;
 try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera unavailable');
 const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{exact:'environment'},width:{ideal:1280},height:{ideal:720}}});
 if(token!==epoch){next.getTracks().forEach(t=>t.stop());return;}
 if(next.getVideoTracks()[0]?.getSettings().facingMode==='user'){next.getTracks().forEach(t=>t.stop());throw Error('Rear camera required');}
 stream=next;$('video').srcObject=next;await $('video').play();if(token!==epoch)return;
 source=$('video');mode='camera';phase='preview';$('video').hidden=false;$('placeholder').hidden=true;$('stop').hidden=false;$('start').hidden=true;
 }catch(e){if(token===epoch){stop();setStatus('cameraError',e.message);}return;}finally{$('start').disabled=false;}
 if(token===epoch)void preparePreview(token);
};
$('image').onchange=async()=>{
 const file=$('image').files[0];if(!file)return;stop();const token=epoch;if(photoURL)URL.revokeObjectURL(photoURL);photoURL=URL.createObjectURL(file);
 try{$('photo').src=photoURL;await $('photo').decode();if(token!==epoch)return;source=$('photo');mode='photo';phase='preview';$('photo').hidden=false;$('placeholder').hidden=true;}
 catch(e){setStatus('imageError',e.message);return;}
 if(token===epoch)void preparePreview(token);$('image').value='';
};
$('language').onclick=()=>{lang=lang==='de'?'en':'de';try{localStorage.setItem('waste-lang',lang);}catch{}render();};
function draw(b,w,h){const c=$('overlay'),r=c.getBoundingClientRect(),d=devicePixelRatio||1;c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);if(!b)return;const ctx=c.getContext('2d');ctx.scale(d,d);const {width:displayWidth,left:dx,top:dy}=previewRect(w,h,r.width,r.height),s=displayWidth/w;ctx.lineWidth=3;ctx.strokeStyle=({paper:'#ff0000',yellow:'#ffff00',colored:'#008000',clear:'#ffffff',bio:'#a52a2a',residual:'#000000'}[config.classes[b.cls]?.bin] || '#808080');ctx.strokeRect(dx+b.x1*s,dy+b.y1*s,(b.x2-b.x1)*s,(b.y2-b.y1)*s);}
// One immutable full-frame snapshot per explicit user action. No inference loop.
$('classify').onclick=async()=>{
 if(busy||!source||phase!=='preview')return;
 if(!model){if(status==='modelError')await preparePreview();return;}
 const src=source,token=epoch,w=src.videoWidth||src.naturalWidth,h=src.videoHeight||src.naturalHeight;
 if(!w||!h)return;
 busy=true;phase='processing';item=null;error='';state='processing';status='processing';
 const capture=$('capture');
 try{
  capture.width=w;capture.height=h;capture.getContext('2d').drawImage(src,0,0,w,h);
  // Keep an uploaded photo on the same display element in every phase.
  capture.hidden=mode==='photo';$('video').hidden=mode!=='camera';$('photo').hidden=mode!=='photo';
  diagnostics.captureWidth=w;diagnostics.captureHeight=h;
  diagnostics.requestedBackend=cpuOnly?'cpu':'webgpu';
  draw(null,w,h);render();
  // Give the captured frame and processing label a chance to paint before invoking WASM.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(token!==epoch)return;
  await ensureModel();if(token!==epoch)return;
  setStatus('processing');
  const t=performance.now(),r=await predictWithFallback(capture,{conf:config.confidence,iou:.65});
  if(token!==epoch)return;
  diagnostics.inferenceMs=Math.round(performance.now()-t);diagnostics.timingBackend=model.device;diagnostics.completed=(diagnostics.completed||0)+1;
 const rw=r.width||w,rh=r.height||h,boxes=(r.boxes||[]).filter(b=>b.conf>=config.confidence&&[b.x1,b.y1,b.x2,b.y2].every(Number.isFinite)&&b.x2>b.x1&&b.y2>b.y1);
 diagnostics.detections=boxes.map(({cls,name,conf,x1,y1,x2,y2})=>({cls,name,conf,x1,y1,x2,y2}));
 boxes.sort((a,b)=>b.conf-a.conf);const b=boxes[0];item=null;
 if(!b){previous=null;count=0;state='noItem';draw(null,rw,rh);}
 else{count=1;previous=b;state='steady';item=b;draw(b,rw,rh);}resultSize={w:rw,h:rh};phase='result';status='finished';render();

 }catch(e){if(token===epoch){item=null;phase='error';state='uncertain';setStatus('inferError',String(e.message||e));}}
 finally{busy=false;render();}
};
$('continue').onclick=()=>{
 if(busy)return;
 epoch++;phase=source?'preview':'idle';resultSize=null;error='';
 $('capture').hidden=true;$('video').hidden=mode!=='camera';$('photo').hidden=mode!=='photo';
 reset();setStatus(source?'captureReady':'stopped');
};
// Explicit media geometry avoids Safari retaining a shrunken video surface after capture.
function previewRect(width,height,frameWidth,frameHeight){
 const scale=Math.max(frameWidth/width,frameHeight/height);
 return {width:width*scale,height:height*scale,left:(frameWidth-width*scale)/2,top:(frameHeight-height*scale)/2};
}
function fitPreview(){
 if(!source)return;
 const w=source.videoWidth||source.naturalWidth,h=source.videoHeight||source.naturalHeight;
 const frame=$('camera').getBoundingClientRect();if(!w||!h||!frame.width||!frame.height)return;
 const rect=previewRect(w,h,frame.width,frame.height);
 for(const id of ['video','photo','capture']){
  const style=$(id).style;
  for(const key of ['width','height','left','top'])style[key]=`${rect[key]}px`;
  style.right='auto';style.bottom='auto';
 }
 $('reticle').style.width=`${frame.width*.86}px`;
 $('reticle').style.height=`${frame.height*.8}px`;
 diagnostics.preview={sourceWidth:w,sourceHeight:h,displayWidth:Math.round(rect.width),displayHeight:Math.round(rect.height)};
}
function refreshPreview(){fitPreview();if(resultSize)draw(item,resultSize.w,resultSize.h);}
window.addEventListener('resize',refreshPreview);
$('video').addEventListener('resize',refreshPreview);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(refreshPreview).observe($('camera'));

document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stop();});
window.addEventListener('pagehide',()=>{stop();if(photoURL)URL.revokeObjectURL(photoURL);});
render();

// Information dialog
$('infoButton').onclick=()=>$('infoDialog').showModal();
$('closeInfo').onclick=()=>$('infoDialog').close();

// Backend comparison control. Keep the camera and current result intact.
$('backendToggle').onclick=async()=>{
 if(busy||loading||!model)return;
 const token=epoch,target=model.device==='webgpu'?'cpu':'webgpu';
 busy=true;cpuOnly=target==='cpu';gpuChecks=0;gpuFault='';
 diagnostics.backendChoice=target;
 for(const key of ['gpuChecksPassed','gpuError','fallback','gpuPredictionMs','cpuVerificationMs','inferenceMs','timingBackend'])delete diagnostics[key];
 diagnostics.gpuVerification='pending';
 const old=model,reference=cpuReference;model=null;cpuReference=null;
 try{old.free();}catch{}
 if(reference&&reference!==old)try{reference.free();}catch{}
 render();
 try{await ensureModel();if(token===epoch)setStatus(phase==='result'?'finished':'captureReady');}
 catch(e){if(token===epoch)setStatus('modelError',String(e.message||e));}
 finally{busy=false;render();}
};
