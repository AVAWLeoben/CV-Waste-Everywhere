# Waste Everywhere — trained YOLOv8n
Commit your trained detection checkpoint to models/waste_yolov8n.pt and run this workflow on main.
The six trained class IDs are Papier, Leichtverpackung, Buntglas, Weißglas, Biotonne, Restmüll.
Class names are validated against the checkpoint before float32 TFLite export at 640 pixels.
Numerical equivalence and real browser inference checks must pass before Pages deployment.
The checkpoint hash participates in the export cache key. Camera images remain on device.
Browser checks establish execution, not sorting accuracy or physical phone performance.
