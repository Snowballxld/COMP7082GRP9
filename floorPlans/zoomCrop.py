import ezdxf
import numpy as np
import cv2
import matplotlib.pyplot as plt

# === Input/Output Paths ===
BUILDING_CODE = "se06F1"

folder_path = f"floorPlans/{BUILDING_CODE[:2]}/{BUILDING_CODE[2:4]}/{BUILDING_CODE[4:]}"
INPUT_DXF = f"{folder_path}/scraped.dxf"
OUTPUT_DXF = f"{folder_path}/cropped.dxf"

# === Parameters (same as your original script) ===
scale_factor = 4        # for visualization
zoom_ratio = 0.88       # keep top 90% vertically
zoom_factor = 1.1       # normal zoom-in (1.1 = 10% zoom)
cell_size = 1           # adjust based on drawing scale

# === Step 1: Load DXF ===
doc = ezdxf.readfile(INPUT_DXF)
msp = doc.modelspace()

line_data = []

# Collect all geometry
for e in msp.query("LINE"):
    start, end = e.dxf.start, e.dxf.end
    line_data.append([(start.x, start.y), (end.x, end.y)])

for e in msp.query("LWPOLYLINE"):
    points = [tuple(p[0:2]) for p in e.get_points()]
    line_data.append(points)

for e in msp.query("POLYLINE"):
    points = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
    line_data.append(points)

# === Step 2: Compute bounds ===
all_points = [pt for poly in line_data for pt in poly]
xs, ys = zip(*all_points)
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# === Step 3: Rasterize for visualization (same as before) ===
width = int((max_x - min_x) / cell_size) + 1
height = int((max_y - min_y) / cell_size) + 1
img = np.zeros((height, width), dtype=np.uint8)

def to_grid_coords(x, y):
    gx = int((x - min_x) / cell_size)
    gy = int((max_y - y) / cell_size)
    return gx, gy

for poly in line_data:
    pts = np.array([to_grid_coords(x, y) for x, y in poly], np.int32)
    pts = pts.reshape((-1, 1, 2))
    cv2.polylines(img, [pts], isClosed=False, color=255, thickness=1)

grid = (img > 0).astype(int)

# === Step 4: Crop top 90% ===
height_zoom = int(grid.shape[0] * zoom_ratio)
grid_zoomed = grid[:height_zoom, :]

# === Step 5: Centered zoom-in ===
h, w = grid_zoomed.shape
new_h, new_w = int(h / zoom_factor), int(w / zoom_factor)
start_y, start_x = (h - new_h) // 2, (w - new_w) // 2
grid_zoomed_center = grid_zoomed[start_y:start_y + new_h, start_x:start_x + new_w]

# === Step 6: Compute new DXF bounds ===
y1_dxf = max_y - (start_y + new_h) * cell_size
y2_dxf = max_y - start_y * cell_size
x1_dxf = min_x + start_x * cell_size
x2_dxf = min_x + (start_x + new_w) * cell_size

# === Step 7: Create new DXF with cropped content ===
new_doc = ezdxf.new(dxfversion="R2010")
new_msp = new_doc.modelspace()

for poly in line_data:
    for i in range(len(poly) - 1):
        (x1, y1), (x2, y2) = poly[i], poly[i + 1]
        if (
            (x1_dxf <= x1 <= x2_dxf and y1_dxf <= y1 <= y2_dxf)
            or (x1_dxf <= x2 <= x2_dxf and y1_dxf <= y2 <= y2_dxf)
        ):
            new_msp.add_line((x1, y1), (x2, y2))

new_doc.saveas(OUTPUT_DXF)
print(f"[✓] Saved cropped DXF region → {OUTPUT_DXF}")

# === Step 8: Optional display for confirmation ===
grid_scaled = cv2.resize(
    grid_zoomed_center,
    (grid_zoomed_center.shape[1] * scale_factor, grid_zoomed_center.shape[0] * scale_factor),
    interpolation=cv2.INTER_NEAREST,
)

plt.imshow(grid_scaled, cmap="gray")
plt.axis("off")
plt.show()
