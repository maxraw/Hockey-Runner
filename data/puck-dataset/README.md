# Hockey Runner puck dataset

Structure:

```text
data/puck-dataset/
  images/train/*.jpg
  images/val/*.jpg
  labels/train/*.txt
  labels/val/*.txt
  data.yaml
```

Label format: YOLO bbox per line:

```text
<class_id> <x_center> <y_center> <width> <height>
```

Recommended dataset:
- 1,000+ images minimum for prototype.
- Different lighting: warm/cold, daylight, shadows.
- Different field sizes: 100×50 cm to 233×100 cm.
- Puck partly occluded by stick.
- Negative samples: stick only, glove, black tape, shadow, shoe.

Do not use third-party model weights in production unless licensing is cleared.
