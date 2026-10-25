# Waste Everywhere — first prototype

German/English rear-camera-only advisory app. Camera frames and selected photos stay on the device. The browser downloads TFLite model and runtime assets. There is no image upload, crowdsourcing, analytics or server inference.

## iPhone setup

1. Create `.github/workflows/bootstrap.yml` from the supplied workflow and commit it to `main`.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Actions → **Waste app — bootstrap and deploy** → Run workflow (branch `main`, model `auto`).
4. Wait for the build and deploy jobs. Open https://avawleoben.github.io/CV-Waste-Everywhere/ in Safari and allow the rear camera.

If source commit permissions fail, check Settings → Actions → General → Workflow permissions. Repository rules may also require permitting this workflow's source commit. No personal access token is needed. Do not enable bypasses on unrelated repositories.

The workflow is restricted to AVAWLeoben/CV-Waste-Everywhere and main. It creates only missing app files, preserves existing edits, commits those named files, and builds/deploys in the same run. It never writes another workflow file. On later edits, run it manually again. Model binaries are deployment artifacts, not Git commits.

## Model behavior

`auto` tries YOLOv8s-World v2 with fixed vocabulary from `web/config.json`. If conversion or numerical checks fail, it tries conventional YOLOv8s. This fallback shows object predictions only and is clearly marked in the UI; it never assigns a bin. Select `world` to require YOLO-World with no fallback, or `standin` to test ordinary YOLO explicitly. Conversion logs are retained as workflow artifacts.

Models must have float32 NHWC inputs, built-in TFLite operations, embedded class metadata and numerical agreement with PyTorch on three synthetic inputs. A Chromium test checks rear-only camera constraints, language persistence, narrow layout and actual TFLite inference through the pinned browser runtime. These checks do not establish classification accuracy or iPhone speed. The device/backend and time are shown under Test details.

No front camera picker or permissive camera fallback exists. If the rear camera cannot be opened, select a photo. Backgrounding the page stops its camera. Three consistent live detections stabilize the result; no detection or conflicting disposal destinations clear the advice. Unknown is never mapped to residual waste.

The prompts are experimental. Packaging versus non-packaging, deposit status, reusable bottles and municipal biowaste rules remain limitations. Advice is conditional. Check https://www.oesterreich.gv.at/de/themen/bauen_und_wohnen/abfall and https://www.recycling-pfand.at/ . The app does not determine deposit status from bottle shape.

## Editing

Edit files in `web/` or `scripts/` through GitHub's web editor, then run this workflow again. Existing source files are not overwritten by the embedded bootstrap. The cache key includes the export script, requirements, vocabulary and selected mode. To retry an unchanged failed World export after an `auto` fallback, choose `world` or clear the model cache.

Application code: AGPL-3.0-or-later (https://www.gnu.org/licenses/agpl-3.0.html). Ultralytics, YOLO-World, CLIP and other dependencies retain their upstream licenses and notices. The runtime versions follow the AVAWLeoben YOLO Classroom LiteRT demo; the DSL repository is not changed. No user photo is included.
