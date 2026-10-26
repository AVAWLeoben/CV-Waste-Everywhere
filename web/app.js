// SPDX-License-Identifier: AGPL-3.0-or-later
const $=id=>document.getElementById(id);
const words={
 de:{eyebrow:'WENIGER RÄTSELN. BESSER TRENNEN.',heading:'Zeig uns, was du entsorgen möchtest.',intro:'Ein Gegenstand. Deine Rückkamera. Eine erste Orientierung.',privacy:'● Bleibt auf deinem Gerät',start:'Rückkamera starten',stop:'Kamera stoppen',chooseText:'Oder ein Foto auswählen',resultTitle:'DEINE SORTIERHILFE',ready:'Bereit, wenn du es bist.',search:'Gegenstand ins Bild halten',steady:'Kurz ruhig halten …',uncertain:'Noch nicht eindeutig',loading:'Erkennung wird vorbereitet. Der erste Download kann etwas dauern …',active:'Erkennung läuft lokal auf deinem Gerät.',stopped:'Kamera gestoppt.',cameraError:'Rückkamera nicht verfügbar. Kamerazugriff in Safari erlauben oder ein Foto auswählen.',modelError:'Erkennung konnte nicht geladen werden. Bitte erneut versuchen.',imageError:'Foto konnte nicht geöffnet werden.',inferError:'Erkennung unterbrochen. Bitte neu starten.',generic:'Objekt erkannt. Dieses Testmodell bestimmt noch keine passende Sammlung.',world:'Experimentelle Erkennung. Empfehlung und Ausnahmen bitte prüfen.',standin:'Testmodus: allgemeines YOLO-Modell. Objekterkennung ohne Entsorgungsempfehlung.',footer:'Prototyp für Österreich. Bilder werden nicht hochgeladen oder gesammelt. Unsichere Ergebnisse sind keine Entsorgungsempfehlung.',rules:'Offizielle Informationen zur Mülltrennung ↗'},
 en:{eyebrow:'LESS GUESSING. BETTER SORTING.',heading:'Show us what you want to throw away.',intro:'One item. Your rear camera. A little guidance.',privacy:'● Stays on your device',start:'Start rear camera',stop:'Stop camera',chooseText:'Or choose a photo',resultTitle:'YOUR SORTING GUIDE',ready:'Ready when you are.',search:'Hold one item in view',steady:'Hold still for a moment …',uncertain:'Not clear yet',loading:'Preparing recognition. The first download may take a while …',active:'Recognition is running locally on your device.',stopped:'Camera stopped.',cameraError:'Rear camera unavailable. Allow camera access in Safari or choose a photo.',modelError:'Could not load recognition. Please try again.',imageError:'Could not open this photo.',inferError:'Recognition interrupted. Please restart.',generic:'Object detected. This test model does not determine its collection stream yet.',world:'Experimental recognition. Check the suggestion and exceptions.',standin:'Test mode: general YOLO model. Object recognition without disposal advice.',footer:'Prototype for Austria. Images are not uploaded or collected. Uncertain results are not disposal advice.',rules:'Official waste-sorting information ↗'}
};
const bins={
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
let state='ready',status='',error='',item=null;const diagnostics={};
// Mobile scanning behaviour
// Build identification start
const APP_BUILD={"version": "0.4.1", "build": "8.1-c1ff179", "builtAt": "2026-10-26 19:00 UTC"};
function renderVersion(){
 const size=manifest?.inputSize;
 const modelInfo=size ? `YOLO-World v2 · ${size}×${size}` : (lang==='de'?'Modell noch nicht geladen':'Model not loaded yet');
 $('versionDisclaimer').textContent=`v${APP_BUILD.version} · Build ${APP_BUILD.build} · ${modelInfo}\n${APP_BUILD.builtAt}\n`+(lang==='de'?'Experimenteller Prototyp – Material und Sortierempfehlung können falsch sein.':'Experimental prototype – material and sorting advice may be incorrect.');
 diagnostics.appVersion=APP_BUILD.version;diagnostics.appBuild=APP_BUILD.build;
}
// Build identification end
function render(){
 renderVersion();
 document.body.classList.toggle('scanning',!!source);
 document.documentElement.lang=lang;
 for(const id of ['eyebrow','heading','intro','privacy','start','stop','chooseText','resultTitle','footer','rules'])$(id).textContent=words[lang][id];
 $('language').textContent=lang==='de'?'EN':'DE';$('status').textContent=words[lang][status]||'';$('status').classList.toggle('error',!!error);
 $('destination').textContent='';$('advice').textContent='';$('name').textContent=words[lang][state]||'';
 if(item){const c=manifest.mode==='world'?config.classes[item.cls]:null;const name=item.name||String(item.cls);$('name').textContent=c?.[lang]||(lang==='de'?common[name]:null)||name;if(c&&bins[c.bin]){[$('destination').textContent,$('advice').textContent]=bins[c.bin][lang];}else $('advice').textContent=words[lang].generic;}
 if(item && manifest.mode==='world'){
  const prompt=config.classes[item.cls]?.prompt||'';
  if(/bottle/i.test(prompt)){
   $('name').textContent=lang==='de'?'Flasche – Material unklar':'Bottle – material uncertain';
   $('destination').textContent='';
   $('advice').textContent=lang==='de'?'Kunststoff oder Glas? Bitte am Gegenstand prüfen. Aus diesem Bild lässt sich das Material nicht sicher bestimmen.':'Plastic or glass? Please check the item. This image does not establish its material reliably.';
  }else if(mode==='camera' && count<2){
   $('name').textContent=(lang==='de'?'Möglicherweise: ':'Possible: ')+$('name').textContent;
   $('destination').textContent='';
   $('advice').textContent=lang==='de'?'Erkennung wird bestätigt …':'Confirming recognition …';
  }
 }
 $('notice').textContent=manifest?words[lang][manifest.mode]:'';$('diagnostics').textContent=JSON.stringify({...diagnostics,backend:model?.device,error:error||undefined},null,2);
}
function setStatus(key,e=''){status=key;error=e;render();}
function reset(){previous=null;count=0;item=null;state='search';const c=$('overlay');c.getContext('2d').clearRect(0,0,c.width,c.height);render();}
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json();}

// Classroom model loading: same YOLO.load(File) / predict(image) API as DSL.
// Keep the JavaScript import map and the WebAssembly assets on 2.5.3.
let cpuOnly=false;
async function ensureModel(){
 if(model)return model;if(loading)return loading;
 loading=(async()=>{
  setStatus('loading');
  [config,manifest]=await Promise.all([json('./config.json'),json('./models/manifest.json')]);
  if(manifest.pipeline!=='classroom'||manifest.mode!=='world'||manifest.model!=='yolov8s-worldv2.pt')throw Error('Expected the YOLO-World v2 classroom-compatible export');
  if(JSON.stringify(manifest.prompts)!==JSON.stringify(config.classes.map(c=>c.prompt)))throw Error('Model vocabulary mismatch');
  diagnostics.model=manifest.model;diagnostics.mode=manifest.mode;diagnostics.inputSize=manifest.inputSize;render();
  const {YOLO}=await import('@ultralytics/yolo');
  const response=await fetch(new URL('./models/'+manifest.file,location.href));
  if(!response.ok)throw Error(`Model HTTP ${response.status}`);
  const file=new File([await response.blob()],manifest.file,{type:'application/octet-stream'});
  model=await YOLO.load(file,{
   device:cpuOnly?'cpu':'webgpu',
   litertWasmUrl:'https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/wasm/'
  });
  return model;
 })();
 try{return await loading;}finally{loading=null;}
}
async function predictWithFallback(src,options){
 try{return await model.predict(src,options);}
 catch(e){
  if(cpuOnly||model?.device!=='webgpu')throw e;
  // A GPU can compile successfully and still fail when invoking the model.
  // Retry the entire model on CPU once, using the public loader API.
  cpuOnly=true;diagnostics.fallback='cpu';diagnostics.gpuError=String(e.message||e);
  const failed=model;model=null;
  try{failed.free();}catch{}
  await ensureModel();
  const result=await model.predict(src,options);
  return result;
 }
}
function stop(){epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;source=null;mode=null;$('video').srcObject=null;$('video').hidden=true;$('photo').hidden=true;$('placeholder').hidden=false;$('stop').hidden=true;$('start').hidden=false;reset();state='ready';setStatus('stopped');}
$('stop').onclick=stop;
$('start').onclick=async()=>{
 stop();const token=epoch;$('start').disabled=true;
 try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera unavailable');
 const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{exact:'environment'},width:{ideal:1280},height:{ideal:720}}});
 if(token!==epoch){next.getTracks().forEach(t=>t.stop());return;}
 if(next.getVideoTracks()[0]?.getSettings().facingMode==='user'){next.getTracks().forEach(t=>t.stop());throw Error('Rear camera required');}
 stream=next;$('video').srcObject=next;await $('video').play();if(token!==epoch)return;
 source=$('video');mode='camera';$('video').hidden=false;$('placeholder').hidden=true;$('stop').hidden=false;$('start').hidden=true;
 }catch(e){if(token===epoch){stop();setStatus('cameraError',e.message);}return;}finally{$('start').disabled=false;}
 try{await ensureModel();if(token===epoch)setStatus('active');}catch(e){if(token===epoch)setStatus('modelError',e.message);}
};
$('image').onchange=async()=>{
 const file=$('image').files[0];if(!file)return;stop();const token=epoch;if(photoURL)URL.revokeObjectURL(photoURL);photoURL=URL.createObjectURL(file);
 try{$('photo').src=photoURL;await $('photo').decode();if(token!==epoch)return;source=$('photo');mode='photo';$('photo').hidden=false;$('placeholder').hidden=true;}
 catch(e){setStatus('imageError',e.message);return;}
 try{await ensureModel();if(token===epoch)setStatus('active');}catch(e){if(token===epoch)setStatus('modelError',e.message);}finally{$('image').value='';}
};
$('language').onclick=()=>{lang=lang==='de'?'en':'de';try{localStorage.setItem('waste-lang',lang);}catch{}render();};
function iou(a,b){const area=x=>(x.x2-x.x1)*(x.y2-x.y1);const overlap=Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1))*Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1));return overlap/(area(a)+area(b)-overlap)||0;}
function draw(b,w,h){const c=$('overlay'),r=c.getBoundingClientRect(),d=devicePixelRatio||1;c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);if(!b)return;const ctx=c.getContext('2d');ctx.scale(d,d);const s=(mode==='camera'?Math.max:Math.min)(r.width/w,r.height/h),dx=(r.width-s*w)/2,dy=(r.height-s*h)/2;ctx.lineWidth=3;ctx.strokeStyle='#bcf28f';ctx.strokeRect(dx+b.x1*s,dy+b.y1*s,(b.x2-b.x1)*s,(b.y2-b.y1)*s);}
async function tick(now){
 requestAnimationFrame(tick);if(!model||!source||busy||document.hidden||error||now-last<250)return;
 const src=source,token=epoch,w=src.videoWidth||src.naturalWidth,h=src.videoHeight||src.naturalHeight;if(!w||!h)return;busy=true;last=now;
 try{const t=performance.now(),r=await predictWithFallback(src,{conf:config.confidence,iou:.65});if(token!==epoch)return;status='active';diagnostics.inferenceMs=Math.round(performance.now()-t);diagnostics.completed=(diagnostics.completed||0)+1;
 const rw=r.width||w,rh=r.height||h,boxes=(r.boxes||[]).filter(b=>b.conf>=config.confidence&&[b.x1,b.y1,b.x2,b.y2].every(Number.isFinite)&&b.x2>b.x1&&b.y2>b.y1);
 diagnostics.detections=boxes.map(({cls,name,conf,x1,y1,x2,y2})=>({cls,name,conf,x1,y1,x2,y2}));
 const rank=b=>(b.x2-b.x1)*(b.y2-b.y1)/(rw*rh)*.65+(1-Math.min(1,Math.hypot((b.x1+b.x2)/2/rw-.5,(b.y1+b.y2)/2/rh-.5)*2))*.25+b.conf*.1;
 boxes.sort((a,b)=>rank(b)-rank(a));const b=boxes[0];item=null;
 if(!b){previous=null;count=0;state='search';draw(null,rw,rh);}
 else if(manifest.mode==='world'&&boxes.some(x=>x!==b&&Math.abs(x.conf-b.conf)<.08&&iou(b,x)>.6&&config.classes[x.cls]?.bin!==config.classes[b.cls]?.bin)){previous=null;count=0;state='uncertain';draw(null,rw,rh);}
 else{count=previous&&previous.cls===b.cls&&iou(previous,b)>.35?count+1:1;previous=b;state='steady';item=b;draw(b,rw,rh);}render();
 }catch(e){if(token===epoch){reset();setStatus('inferError',e.message);}}finally{busy=false;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stop();});
window.addEventListener('pagehide',()=>{stop();if(photoURL)URL.revokeObjectURL(photoURL);});
render();
requestAnimationFrame(tick);