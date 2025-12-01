import ezdxf
import numpy as np
import cv2
import json
import pyautogui

BUILDING_CODE = "se06F1"

folder_path = f"floorPlans/{BUILDING_CODE[:2]}/{BUILDING_CODE[2:4]}/{BUILDING_CODE[4:]}"
DXF_PATH = f"{folder_path}/cleaned.dxf"
OUTPUT_JSON = f"{folder_path}/labels.json"

# === Load DXF ===
doc = ezdxf.readfile(DXF_PATH)
msp = doc.modelspace()

# Extract all polylines/lines
line_data = []

for e in msp.query('LINE'):
    start = e.dxf.start
    end = e.dxf.end
    line_data.append([(start.x, start.y), (end.x, end.y)])

for e in msp.query('LWPOLYLINE'):
    points = [tuple(p[0:2]) for p in e.get_points()]
    line_data.append(points)

for e in msp.query('POLYLINE'):
    points = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
    line_data.append(points)

# Flatten to compute bounds
all_points = [pt for poly in line_data for pt in poly]
xs, ys = zip(*all_points)
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# Create grid
cell_size = 1
width = int((max_x - min_x) / cell_size) + 1
height = int((max_y - min_y) / cell_size) + 1
img = np.zeros((height, width), dtype=np.uint8)

def to_grid_coords(x, y):
    gx = int((x - min_x) / cell_size)
    gy = int((max_y - y) / cell_size)
    return gx, gy

# Draw DXF geometry into image
for poly in line_data:
    pts = np.array([to_grid_coords(x, y) for x, y in poly], np.int32)
    pts = pts.reshape((-1, 1, 2))
    cv2.polylines(img, [pts], isClosed=False, color=255, thickness=1)

# Convert to 3-channel for display
img_color = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

# === Fit to screen ===
screen_w, screen_h = pyautogui.size()
h, w = img_color.shape[:2]
scale = min((screen_w - 100) / w, (screen_h - 150) / h)
if scale < 1.0:
    display_w = int(w * scale)
    display_h = int(h * scale)
    display_img = cv2.resize(img_color, (display_w, display_h), interpolation=cv2.INTER_AREA)
else:
    display_img = img_color.copy()
    scale = 1.0

points = []

def click_event(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        # Convert scaled coords → original DXF coordinates
        grid_x = int(x / scale)
        grid_y = int(y / scale)

        # Map back to DXF coordinate system
        dxf_x = min_x + grid_x * cell_size
        dxf_y = max_y - grid_y * cell_size

        print(f"\nClicked at DXF coords ({dxf_x:.2f}, {dxf_y:.2f})")
        label = input("Enter room label: ").strip() or "unlabeled"
        points.append({"x": dxf_x, "y": dxf_y, "label": label})

        cv2.circle(param, (x, y), 5, (0, 0, 255), -1)
        cv2.putText(param, label, (x + 5, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.imshow("Label DXF", param)

cv2.namedWindow("Label DXF", cv2.WINDOW_NORMAL)
cv2.resizeWindow("Label DXF", display_img.shape[1], display_img.shape[0])
cv2.imshow("Label DXF", display_img)
cv2.setMouseCallback("Label DXF", click_event, display_img)

print("Click on room centers/corners to label them. Press ESC when done.")
while True:
    key = cv2.waitKey(1)
    if key == 27:  # ESC
        break

cv2.destroyAllWindows()

# === Save labeled data ===
with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(points, f, indent=2)

print(f"\n[✓] Saved {len(points)} labeled points to {OUTPUT_JSON}")
 