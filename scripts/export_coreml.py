"""
Export the trained puck detector to CoreML.

Run after training:
  python scripts/export_coreml.py

Output example:
  runs/puck/hockeyrunner-puck-v1/weights/best.mlpackage or best.mlmodel
"""
from ultralytics import YOLO

WEIGHTS = "runs/puck/hockeyrunner-puck-v1/weights/best.pt"
model = YOLO(WEIGHTS)
model.export(format="coreml", imgsz=640, nms=True, half=False, int8=False)
