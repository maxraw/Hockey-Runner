"""
Train a proprietary puck detector. Requires your own labeled dataset in YOLO format.

Install:
  python3 -m venv .venv
  source .venv/bin/activate
  pip install ultralytics

Run:
  python scripts/train_puck_yolo.py
"""
from ultralytics import YOLO

DATA = "data/puck-dataset/data.yaml"

# Start with a nano model for real-time mobile inference.
model = YOLO("yolov8n.pt")

model.train(
    data=DATA,
    imgsz=640,
    epochs=80,
    batch=16,
    device="mps",  # Apple Silicon. Use 'cpu' if MPS is unavailable.
    project="runs/puck",
    name="hockeyrunner-puck-v1",
    patience=20,
)
