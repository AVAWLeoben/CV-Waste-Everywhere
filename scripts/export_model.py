# SPDX-License-Identifier: AGPL-3.0-or-later
"""Export in a child process; publish only after TFLite numerical checks pass."""
import argparse, json, os, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--candidate',choices=['world']);p.add_argument('--choice',choices=['world'],default='world');a=p.parse_args()
(ROOT/'model-work').mkdir(exist_ok=True);out=ROOT/'build/models';out.mkdir(parents=True,exist_ok=True)
if not a.candidate:
    for mode in ['world']:
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
            sys.exit(0)
    sys.exit('No candidate passed export and numerical checks; nothing will deploy.')

import copy,hashlib,shutil,zipfile
import numpy as np
import torch
from ultralytics import YOLOWorld
from classroom_input import classroom_input
from ai_edge_litert.interpreter import Interpreter
os.chdir(ROOT/'model-work');torch.set_num_threads(2)
config=json.loads((ROOT/'web/config.json').read_text());prompts=[c['prompt'] for c in config['classes']]
checkpoint='yolov8s-worldv2.pt'
model=YOLOWorld(checkpoint)
model.set_classes(prompts)
reference=copy.deepcopy(model.model).eval().float()
export=Path(model.export(format='tflite',imgsz=640,batch=1,half=False,int8=False,nms=False,device='cpu',opset=17))
file=export if export.is_file() else next(export.glob('*_float32.tflite'))
file=classroom_input(file,file.with_name('world_classroom.tflite'))
i=Interpreter(model_path=str(file),num_threads=2);i.allocate_tensors()
inputs=i.get_input_details();outputs=i.get_output_details()
assert len(inputs)==len(outputs)==1
assert list(inputs[0]['shape'])==[1,3,640,640]
assert inputs[0]['dtype']==outputs[0]['dtype']==np.float32
ops=sorted({x['op_name'] for x in i._get_ops_details()})
assert not any(x.startswith('Flex') or x=='CUSTOM' for x in ops),'Custom/Flex operations cannot be shipped'
rng=np.random.default_rng(42);checks=[]
xs=[np.zeros((1,640,640,3),np.float32),rng.random((1,640,640,3),dtype=np.float32),np.tile(np.linspace(0,1,640,dtype=np.float32)[None,None,:,None],(1,640,1,3))]
for x in xs:
    with torch.inference_mode():
        y=reference(torch.from_numpy(x.transpose(0,3,1,2).copy()))
        expected=(y[0] if isinstance(y,tuple) else y).numpy()
    i.set_tensor(inputs[0]['index'],x.transpose(0,3,1,2).copy());i.invoke();actual=i.get_tensor(outputs[0]['index'])
    if actual.shape!=expected.shape and actual.transpose(0,2,1).shape==expected.shape:actual=actual.transpose(0,2,1)
    assert actual.shape==expected.shape and np.isfinite(actual).all()
    # Ultralytics TFLite exports normalize decoded coordinates to input size.
    actual=actual.copy();actual[:,:4,:]*=640
    np.testing.assert_allclose(actual[:,:4,:],expected[:,:4,:],rtol=.003,atol=.25)
    np.testing.assert_allclose(actual[:,4:,:],expected[:,4:,:],rtol=.005,atol=.002)
    checks.append({'maxBoxErrorPixels':float(abs(actual[:,:4,:]-expected[:,:4,:]).max()),'maxScoreError':float(abs(actual[:,4:,:]-expected[:,4:,:]).max())})
with zipfile.ZipFile(file) as z: metadata=json.loads(z.read('metadata.json'))
assert metadata['task']=='detect'
assert metadata['imgsz']==[640,640]
names=prompts
assert [metadata['names'][str(k)] for k in range(len(names))]==names
shutil.copyfile(file,out/'waste_640.tflite')
manifest={'file':'waste_640.tflite','mode':'world','pipeline':'classroom','inputSize':640,'model':checkpoint,'prompts':prompts,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'build':os.environ.get('GITHUB_SHA','local')}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
(out/'validation.json').write_text(json.dumps({'checks':checks,'ops':ops,'input':inputs[0]['shape'].tolist(),'output':outputs[0]['shape'].tolist(),'mobileTested':False},indent=2))
print(json.dumps(manifest,indent=2))
