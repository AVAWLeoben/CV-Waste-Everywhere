# Waste Everywhere — YOLO-World v2

This app uses `yolov8s-worldv2.pt` with the fixed waste prompts in `web/config.json`, exported to 640 x 640 float32 TFLite. The prompts are embedded during export; the browser does not run a text encoder. The prototype does not require a newly annotated training dataset, but sorting accuracy still needs evaluation.

The app reuses the YOLO Classroom demo's `YOLO.load(File)` and `model.predict(image)` interface. The existing classroom repository is read-only and is not deployed or modified by this workflow.

The export adds one built-in TRANSPOSE to accept the classroom runtime's NCHW input. Model weights, class order and normalized output coordinates remain unchanged. The numerical tests compare the final TFLite model with the PyTorch model before deployment.

JavaScript and WebAssembly both use LiteRT 2.5.3. If WebGPU invocation fails, the app reloads the same World model on CPU and retries once. There is no fallback to a conventional YOLO model.

Run **Actions → Waste app - YOLO-World v2 → Run workflow** on `main`. The workflow updates the app sources, exports and validates World, runs browser inference tests, commits the verified source changes and deploys GitHub Pages. A failed export or browser test prevents deployment.

Edit `web/config.json` to change prompts and their German/English bin mapping, then commit and rerun the workflow. The changed vocabulary invalidates the model cache. Text prompts and bin names are not evidence that the model can reliably distinguish every material.

Images remain on the device. The camera uses `facingMode: { exact: 'environment' }` with no front-camera fallback. Low-confidence or ambiguous results show no sorting advice.

The browser checks include real TFLite invocation with WebGPU available and with WebGPU disabled, plus rear-camera constraints, language persistence and narrow-screen layout. They do not establish recognition accuracy or physical iPhone performance. Test those on the target phones.
