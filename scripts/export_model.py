# SPDX-License-Identifier: AGPL-3.0-or-later
"""Export in a child process; publish only after TFLite numerical checks pass."""
import argparse, json, os, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--candidate',choices=['trained']);p.add_argument('--choice',choices=['trained'],default='trained');a=p.parse_args()
(ROOT/'model-work').mkdir(exist_ok=True);out=ROOT/'build/models';out.mkdir(parents=True,exist_ok=True)
if not a.candidate:
    for mode in ['trained']:
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
from ultralytics import YOLO
from classroom_input import classroom_input
from ai_edge_litert.interpreter import Interpreter
os.chdir(ROOT/'model-work');torch.set_num_threads(2)
config=json.loads((ROOT/'web/config.json').read_text());prompts=[c['prompt'] for c in config['classes']]
source=ROOT/os.environ['MODEL_PATH']
checkpoint=source.name
assert source.is_file(), f'Missing trained model: {source}'
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
model=YOLO(str(source))
assert model.task=='detect', 'Expected a detection checkpoint'
assert [model.names[k] for k in range(len(model.names))]==prompts, 'Checkpoint class order differs from config'
architecture=Path(str(model.model.yaml.get('yaml_file',''))).stem or 'Custom YOLO detector'
scale=str(model.model.yaml.get('scale',''))
if scale and not architecture.endswith(scale): architecture+=' ('+scale+')'
end2end=bool(getattr(model.model,'end2end',False))
reference=copy.deepcopy(model.model).eval().float()
export=Path(model.export(format='tflite',imgsz=640,batch=1,half=False,int8=False,nms=False,end2end=end2end,device='cpu',opset=17))
file=export if export.is_file() else next(export.glob('*_float32.tflite'))
file=classroom_input(file,file.with_name('trained_classroom.tflite'))
i=Interpreter(model_path=str(file),num_threads=2);i.allocate_tensors()
inputs=i.get_input_details();outputs=i.get_output_details()
assert len(inputs)==len(outputs)==1
assert list(inputs[0]['shape'])==[1,3,640,640]
assert inputs[0]['dtype']==outputs[0]['dtype']==np.float32
ops=sorted({x['op_name'] for x in i._get_ops_details()})
assert not any(x.startswith('Flex') or x=='CUSTOM' for x in ops),'Custom/Flex operations cannot be shipped'
def compare_outputs(actual,expected,end2end,nc):
    assert np.isfinite(actual).all() and np.isfinite(expected).all(), 'Non-finite predictions'
    actual=actual.copy()
    if end2end:
        assert actual.ndim==expected.ndim==3 and actual.shape==expected.shape and actual.shape[0]==1 and actual.shape[2]==6, f'Expected matching [1,N,6], got {actual.shape}, {expected.shape}'
        # Only xyxy coordinates are normalized; confidence and class IDs are not.
        actual[...,:4]*=640
        a,e=actual[0],expected[0]
        for rows in (a,e):
            assert ((rows[:,4]>=0)&(rows[:,4]<=1)).all(), 'Invalid confidence'
            assert ((rows[:,5]>=0)&(rows[:,5]<nc)).all(), 'Invalid class ID'
            np.testing.assert_allclose(rows[:,5],np.rint(rows[:,5]),rtol=0,atol=1e-6)
        # Top-k ordering can change across runtimes. Match within class using box and score error.
        from scipy.optimize import linear_sum_assignment
        box_cost=np.max(np.abs(a[:,None,:4]-e[None,:,:4])/(.25+.003*np.abs(e[None,:,:4])),axis=2)
        score_cost=np.abs(a[:,None,4]-e[None,:,4])/(.002+.005*np.abs(e[None,:,4]))
        cost=box_cost+score_cost+(a[:,None,5]!=e[None,:,5])*1e9
        ai,ei=linear_sum_assignment(cost)
        a,e=a[ai],e[ei]
        np.testing.assert_array_equal(a[:,5],e[:,5])
        ab,eb,asc,esc=a[:,:4],e[:,:4],a[:,4],e[:,4]
    else:
        if actual.shape!=expected.shape and actual.ndim==3 and actual.transpose(0,2,1).shape==expected.shape:
            actual=actual.transpose(0,2,1)
        assert actual.shape==expected.shape and expected.ndim==3 and expected.shape[1]==4+nc, f'Expected raw [1,{4+nc},N], got {actual.shape}, {expected.shape}'
        actual[:,:4,:]*=640
        ab,eb,asc,esc=actual[:,:4,:],expected[:,:4,:],actual[:,4:,:],expected[:,4:,:]
    np.testing.assert_allclose(ab,eb,rtol=.003,atol=.25)
    np.testing.assert_allclose(asc,esc,rtol=.005,atol=.002)
    return {'maxBoxErrorPixels':float(np.max(np.abs(ab-eb),initial=0)), 'maxScoreError':float(np.max(np.abs(asc-esc),initial=0)), 'end2end':end2end}
rng=np.random.default_rng(42);checks=[]
xs=[np.zeros((1,640,640,3),np.float32),rng.random((1,640,640,3),dtype=np.float32),np.tile(np.linspace(0,1,640,dtype=np.float32)[None,None,:,None],(1,640,1,3))]
for x in xs:
    with torch.inference_mode():
        y=reference(torch.from_numpy(x.transpose(0,3,1,2).copy()))
        expected=(y[0] if isinstance(y,tuple) else y).numpy()
    i.set_tensor(inputs[0]['index'],x.transpose(0,3,1,2).copy());i.invoke();actual=i.get_tensor(outputs[0]['index'])
    checks.append(compare_outputs(actual,expected,end2end,len(prompts)))
with zipfile.ZipFile(file) as z: metadata=json.loads(z.read('metadata.json'))
assert metadata['task']=='detect'
assert bool(metadata.get('end2end',False))==end2end, 'Export metadata lost end-to-end mode'
assert metadata['imgsz']==[640,640]
names=prompts
assert [metadata['names'][str(k)] for k in range(len(names))]==names
shutil.copyfile(file,out/'waste_640.tflite')
manifest={'file':'waste_640.tflite','mode':'trained','pipeline':'classroom','inputSize':640,'model':checkpoint,'architecture':architecture,'end2end':end2end,'outputLayout':'xyxy-score-class' if end2end else 'xywh-class-scores','checkpointSha256':source_hash,'prompts':prompts,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'build':os.environ.get('GITHUB_SHA','local')}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
(out/'validation.json').write_text(json.dumps({'checks':checks,'ops':ops,'input':inputs[0]['shape'].tolist(),'output':outputs[0]['shape'].tolist(),'mobileTested':False},indent=2))
print(json.dumps(manifest,indent=2))
