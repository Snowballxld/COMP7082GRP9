# === generate_grid.py ===
import ezdxf
import numpy as np
import cv2
import matplotlib.pyplot as plt
import json

# === CONFIG ===
BUILDING_CODE = "se06F2"

folder_path = f"floorPlans/{BUILDING_CODE[:2]}/{BUILDING_CODE[2:4]}/{BUILDING_CODE[4:]}"
INPUT_DXF = f"{folder_path}/cleaned.dxf"
OUTPUT_NPY = f"{folder_path}/floorplan_grid.npy"

CELL_SIZE = 1
SCALE_FACTOR = 4
BOUNDARY_BUFFER = 0.02   # 5% margin around DXF extents (adjust as needed)

def dxf_to_grid(input_dxf=INPUT_DXF, cell_size=CELL_SIZE, buffer_ratio=BOUNDARY_BUFFER):
    # === Load DXF ===
    doc = ezdxf.readfile(input_dxf)
    msp = doc.modelspace()
    line_data = []

    for e in msp.query("LINE"):
        start, end = e.dxf.start, e.dxf.end
        line_data.append([(start.x, start.y), (end.x, end.y)])

    for e in msp.query("LWPOLYLINE"):
        points = [tuple(p[0:2]) for p in e.get_points()]
        line_data.append(points)

    for e in msp.query("POLYLINE"):
        points = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
        line_data.append(points)

    # === Compute bounds ===
    all_points = [pt for poly in line_data for pt in poly]
    xs, ys = zip(*all_points)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    # --- Add buffer around edges ---
    x_range = max_x - min_x
    y_range = max_y - min_y
    min_x -= x_range * buffer_ratio
    max_x += x_range * buffer_ratio
    min_y -= y_range * buffer_ratio
    max_y += y_range * buffer_ratio

    # === Rasterize ===
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

    meta = {
        "min_x": min_x,
        "max_x": max_x,
        "min_y": min_y,
        "max_y": max_y,
        "cell_size": cell_size,
    }

    return grid, meta

# === Main Execution ===
if __name__ == "__main__":
    grid, meta = dxf_to_grid()
    np.save(OUTPUT_NPY, grid)
    print(f"[✓] Saved grid → {OUTPUT_NPY}")

    grid_scaled = cv2.resize(
        grid,
        (grid.shape[1] * SCALE_FACTOR, grid.shape[0] * SCALE_FACTOR),
        interpolation=cv2.INTER_NEAREST
    )

    with open(f"{folder_path}/meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    plt.imshow(grid_scaled, cmap="gray")
    plt.axis("off")
    plt.show()
