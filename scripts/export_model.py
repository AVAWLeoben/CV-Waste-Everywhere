# SPDX-License-Identifier: AGPL-3.0-or-later
"""Export in a child process; publish only after TFLite numerical checks pass."""
import argparse, json, os, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--candidate',choices=['world','standin']);p.add_argument('--choice',choices=['auto','world','standin'],default='auto');a=p.parse_args()
(ROOT/'model-work').mkdir(exist_ok=True);out=ROOT/'build/models';out.mkdir(parents=True,exist_ok=True)
if not a.candidate:
    for mode in (['world','standin'] if a.choice=='auto' else [a.choice]):
        log=ROOT/'model-work'/f'{mode}.log'
        print(f'Attempting {mode}',flush=True)
        with log.open('w') as f:
            try: ok=subprocess.run([sys.executable,__file__,'--candidate',mode],stdout=f,stderr=subprocess.STDOUT,timeout=1500).returncode==0
            except subprocess.TimeoutExpired: ok=False
        print(log.read_text()[-18000:],flush=True)
        if ok:
            summary=os.environ.get('GITHUB_STEP_SUMMARY')
            if summary:
                with open(summary,'a') as f:f.write(f'## Model\nSelected: **{mode}**. Conversion checks passed.\n')
            if mode=='standin':print('::warning::General YOLO stand-in selected. The app gives object labels only, not bin advice.')
            sys.exit(0)
    sys.exit('No candidate passed export and numerical checks; nothing will deploy.')

import copy,hashlib,shutil,zipfile
import numpy as np
import torch
from ultralytics import YOLO,YOLOWorld
from ai_edge_litert.interpreter import Interpreter
os.chdir(ROOT/'model-work');torch.set_num_threads(2)
config=json.loads((ROOT/'web/config.json').read_text());prompts=[c['prompt'] for c in config['classes']]
checkpoint='yolov8s-worldv2.pt' if a.candidate=='world' else 'yolov8s.pt'
model=(YOLOWorld if a.candidate=='world' else YOLO)(checkpoint)
if a.candidate=='world':model.set_classes(prompts)
reference=copy.deepcopy(model.model).eval().float()
export=Path(model.export(format='tflite',imgsz=320,batch=1,half=False,int8=False,nms=False,device='cpu',opset=17))
file=export if export.is_file() else next(export.glob('*_float32.tflite'))
i=Interpreter(model_path=str(file),num_threads=2);i.allocate_tensors()
inputs=i.get_input_details();outputs=i.get_output_details()
assert len(inputs)==len(outputs)==1
assert list(inputs[0]['shape'])==[1,320,320,3]
assert inputs[0]['dtype']==outputs[0]['dtype']==np.float32
ops=sorted({x['op_name'] for x in i._get_ops_details()})
assert not any(x.startswith('Flex') or x=='CUSTOM' for x in ops),'Custom/Flex operations cannot be shipped'
rng=np.random.default_rng(42);checks=[]
xs=[np.zeros((1,320,320,3),np.float32),rng.random((1,320,320,3),dtype=np.float32),np.tile(np.linspace(0,1,320,dtype=np.float32)[None,None,:,None],(1,320,1,3))]
for x in xs:
    with torch.inference_mode():
        y=reference(torch.from_numpy(x.transpose(0,3,1,2).copy()))
        expected=(y[0] if isinstance(y,tuple) else y).numpy()
    i.set_tensor(inputs[0]['index'],x);i.invoke();actual=i.get_tensor(outputs[0]['index'])
    if actual.shape!=expected.shape and actual.transpose(0,2,1).shape==expected.shape:actual=actual.transpose(0,2,1)
    assert actual.shape==expected.shape and np.isfinite(actual).all()
    # Ultralytics TFLite exports normalize decoded coordinates to input size.
    actual=actual.copy();actual[:,:4,:]*=320
    np.testing.assert_allclose(actual[:,:4,:],expected[:,:4,:],rtol=.003,atol=.25)
    np.testing.assert_allclose(actual[:,4:,:],expected[:,4:,:],rtol=.005,atol=.002)
    checks.append({'maxBoxErrorPixels':float(abs(actual[:,:4,:]-expected[:,:4,:]).max()),'maxScoreError':float(abs(actual[:,4:,:]-expected[:,4:,:]).max())})
with zipfile.ZipFile(file) as z: metadata=json.loads(z.read('metadata.json'))
assert metadata['task']=='detect'
names=prompts if a.candidate=='world' else list(model.names.values())
assert [metadata['names'][str(k)] for k in range(len(names))]==names
shutil.copyfile(file,out/'waste_320.tflite')
manifest={'file':'waste_320.tflite','mode':a.candidate,'model':checkpoint,'prompts':prompts if a.candidate=='world' else [],'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'build':os.environ.get('GITHUB_SHA','local')}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
(out/'validation.json').write_text(json.dumps({'checks':checks,'ops':ops,'input':inputs[0]['shape'].tolist(),'output':outputs[0]['shape'].tolist(),'mobileTested':False},indent=2))
print(json.dumps(manifest,indent=2))
