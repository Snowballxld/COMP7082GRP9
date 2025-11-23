import ezdxf
import math
import numpy as np
import cv2
import matplotlib.pyplot as plt
import json
import pyautogui
import os

# === GLOBAL CONFIGURATION AND PATHS ===
BUILDING_CODE = "sw03F1"

folder_path = f"floorPlans/{BUILDING_CODE[:2]}/{BUILDING_CODE[2:4]}/{BUILDING_CODE[4:]}"
os.makedirs(folder_path, exist_ok=True) # Ensure directory exists

# Define all file paths
DXF_PATH = f"{folder_path}/{BUILDING_CODE}.dxf" # Scrape Input
SCRAPED_DXF = f"{folder_path}/scraped.dxf"          # Scrape Output / Zoom Input
CROPPED_DXF = f"{folder_path}/cropped.dxf"          # Zoom Output / Delete Input
CLEANED_DXF = f"{folder_path}/cleaned.dxf"          # Delete Output / Label & Grid Input
OUTPUT_JSON = f"{folder_path}/labels.json"
OUTPUT_NPY = f"{folder_path}/floorplan_grid.npy"
META_JSON = f"{folder_path}/meta.json"

# --- Parameters (Consolidated/defined once) ---
scale_factor = 4        # for visualization (Zoom/Grid)
zoom_ratio = 0.99       # for vertical crop (Zoom)
zoom_factor = 1.5       # for centered zoom-in (Zoom)
cell_size = 1           # adjust based on drawing scale (Zoom, Delete, Label, Grid)
BOUNDARY_BUFFER = 0.02  # for 'Generate Grid' process

# ----------------------------------------------------
# 1. Scrape Process
# ----------------------------------------------------
print("--- 1. Scrape Process: Clean DXF geometry ---")

try:
    doc_dxf = ezdxf.readfile(DXF_PATH)
except IOError:
    print(f"Error: Cannot read initial DXF file at {DXF_PATH}. Exiting.")
    exit()

msp = doc_dxf.modelspace()
cleaned_polys = []

for e in msp.query('LWPOLYLINE POLYLINE'):
    if e.dxftype() == "LWPOLYLINE":
        pts = [p[0:2] for p in e.get_points()]
    else:
        pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]

    if len(pts) < 2:
        continue

    xs, ys = zip(*pts)
    diag = math.hypot(max(xs) - min(xs), max(ys) - min(ys))

    if diag < 35: # small = likely text junk
        continue

    cleaned_polys.append(pts)

print(f"[x] Kept {len(cleaned_polys)} wall polylines after filtering.")

# Save cleaned DXF
new_doc = ezdxf.new()
msp_new = new_doc.modelspace()
for poly in cleaned_polys:
    msp_new.add_lwpolyline(poly)
new_doc.saveas(SCRAPED_DXF)
print(f"[x] Saved cleaned DXF: {SCRAPED_DXF}")

# ----------------------------------------------------
# 2. Zoom Process
# ----------------------------------------------------
print("\n--- 2. Zoom Process: Crop and Zoom to relevant area ---")

INPUT_DXF_ZOOM = SCRAPED_DXF
OUTPUT_DXF_ZOOM = CROPPED_DXF

try:
    doc = ezdxf.readfile(INPUT_DXF_ZOOM)
except IOError:
    print(f"Error: Cannot read scraped DXF file at {INPUT_DXF_ZOOM}. Exiting.")
    exit()

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
    
if not line_data:
    print("No geometry found for zooming. Exiting.")
    exit()

# Compute bounds
all_points = [pt for poly in line_data for pt in poly]
xs, ys = zip(*all_points)
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# Rasterize for visualization
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

# Crop top 90%
height_zoom = int(grid.shape[0] * zoom_ratio)
grid_zoomed = grid[:height_zoom, :]

# Centered zoom-in
h, w = grid_zoomed.shape
new_h, new_w = int(h / zoom_factor), int(w / zoom_factor)
start_y, start_x = (h - new_h) // 2, (w - new_w) // 2
grid_zoomed_center = grid_zoomed[start_y:start_y + new_h, start_x:start_x + new_w]

# Compute new DXF bounds
y1_dxf = max_y - (start_y + new_h) * cell_size
y2_dxf = max_y - start_y * cell_size
x1_dxf = min_x + start_x * cell_size
x2_dxf = min_x + (start_x + new_w) * cell_size

# Create new DXF with cropped content
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

new_doc.saveas(OUTPUT_DXF_ZOOM)
print(f"[x] Saved cropped DXF region -> {OUTPUT_DXF_ZOOM}")

# Optional display for confirmation
grid_scaled = cv2.resize(
    grid_zoomed_center,
    (grid_zoomed_center.shape[1] * scale_factor, grid_zoomed_center.shape[0] * scale_factor),
    interpolation=cv2.INTER_NEAREST,
)

plt.imshow(grid_scaled, cmap="gray")
plt.title("Cropped DXF Region (Zoomed)")
plt.axis("off")
plt.show(block=False)
plt.pause(2)
plt.close()


# ----------------------------------------------------
# 3. Delete Process: Manual Deletion of junk (Interactive)
# ----------------------------------------------------
print("\n--- 3. Delete Process: Manual Deletion of junk (Interactive) ---")

INPUT_DXF_DELETE = CROPPED_DXF
OUTPUT_DXF_DELETE = CLEANED_DXF

try:
    doc = ezdxf.readfile(INPUT_DXF_DELETE)
except IOError:
    print(f"Error: Cannot read cropped DXF file at {INPUT_DXF_DELETE}. Exiting.")
    exit()

msp = doc.modelspace()

# --- Extract geometry function (Re-defined from original Delete Process file) ---
def extract_lines_delete(msp):
    lines = []
    for e in msp.query("LINE"):
        start, end = e.dxf.start, e.dxf.end
        lines.append([(start.x, start.y), (end.x, end.y)])
    for e in msp.query("LWPOLYLINE"):
        pts = [tuple(p[0:2]) for p in e.get_points()]
        lines.append(pts)
    for e in msp.query("POLYLINE"):
        pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
        lines.append(pts)
    return lines

line_data = extract_lines_delete(msp)

# === Bounds & rasterization ===
all_pts = [p for seg in line_data for p in seg]
xs, ys = zip(*all_pts)
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# --- draw_dxf_to_image function (MODIFIED to use all four bounds) ---
# NOTE: We now pass and use min_y and max_x as well for a fixed canvas size.
def draw_dxf_to_image(msp, scale, initial_min_x, initial_max_x, initial_min_y, initial_max_y, cell_size):
    lines = extract_lines_delete(msp)
    
    # Use INITIAL bounds to define a FIXED canvas size
    width = int((initial_max_x - initial_min_x) / cell_size) + 1
    height = int((initial_max_y - initial_min_y) / cell_size) + 1
    img = np.zeros((height, width), np.uint8)

    def to_grid(x, y):
        # Use INITIAL bounds for coordinate mapping
        gx = int((x - initial_min_x) / cell_size)
        gy = int((initial_max_y - y) / cell_size)
        return gx, gy

    for seg in lines:
        pts = np.array([to_grid(x, y) for x, y in seg], np.int32).reshape((-1, 1, 2))
        cv2.polylines(img, [pts], isClosed=False, color=255, thickness=1)

    img_color = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    disp_img = cv2.resize(img_color, (int(img_color.shape[1] * scale), int(img_color.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    return disp_img

# === Resize for display ===
screen_w, screen_h = pyautogui.size()
width = int((max_x - min_x) / cell_size) + 1
height = int((max_y - min_y) / cell_size) + 1
scale = min((screen_w - 100) / width, (screen_h - 150) / height)
if scale > 1.0:
    scale = 1.0

# === INITIAL CALL: Use all four bounds to set the fixed frame ===
display_img = draw_dxf_to_image(msp, scale, min_x, max_x, min_y, max_y, cell_size)

# === Undo stack ===
undo_stack = []

# === Mouse interaction ===
drawing = False
x_start, y_start = -1, -1

# Capture bounds to use inside the callback
delete_min_x = min_x
delete_max_x = max_x # New capture
delete_min_y = min_y # New capture
delete_max_y = max_y

def mouse_draw(event, x, y, flags, param):
    global drawing, x_start, y_start, display_img, undo_stack

    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        x_start, y_start = x, y

    elif event == cv2.EVENT_MOUSEMOVE and drawing:
        img_copy = display_img.copy()
        cv2.rectangle(img_copy, (x_start, y_start), (x, y), (0, 0, 255), 2)
        cv2.imshow("Edit DXF", img_copy)

    elif event == cv2.EVENT_LBUTTONUP:
        drawing = False
        x_end, y_end = x, y

        gx1, gy1 = int(min(x_start, x_end) / scale), int(min(y_start, y_end) / scale)
        gx2, gy2 = int(max(x_start, x_end) / scale), int(max(y_start, y_end) / scale)
        
        # Use captured bounds for transformation
        x1_dxf = delete_min_x + gx1 * cell_size
        x2_dxf = delete_min_x + gx2 * cell_size
        y1_dxf = delete_max_y - gy2 * cell_size
        y2_dxf = delete_max_y - gy1 * cell_size

        print(f"\n[ ] Removing lines in area: ({x1_dxf:.2f}, {y1_dxf:.2f}) -> ({x2_dxf:.2f}, {y2_dxf:.2f})")

        # --- Track deleted entities ---
        deleted_entities = []

        for e in list(msp):
            if e.dxftype() in {"LINE", "LWPOLYLINE", "POLYLINE"}:
                pts = []
                if e.dxftype() == "LINE":
                    pts = [(e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)]
                elif e.dxftype() == "LWPOLYLINE":
                    pts = [tuple(p[0:2]) for p in e.get_points()]
                elif e.dxftype() == "POLYLINE":
                    pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]

                if any(x1_dxf <= x <= x2_dxf and y1_dxf <= y <= y2_dxf for (x, y) in pts):
                    deleted_entities.append(e.copy())  # save for undo
                    msp.delete_entity(e)

        if deleted_entities:
            undo_stack.append(deleted_entities)
            print(f" -> Removed {len(deleted_entities)} entities. (Undo available)")

        # === UPDATE CALL: Use all four original bounds again to redraw fixed frame ===
        display_img = draw_dxf_to_image(msp, scale, delete_min_x, delete_max_x, delete_min_y, delete_max_y, cell_size)
        cv2.imshow("Edit DXF", display_img)

# === Display window (rest of the code remains the same) ===
cv2.namedWindow("Edit DXF", cv2.WINDOW_NORMAL)
cv2.resizeWindow("Edit DXF", display_img.shape[1], display_img.shape[0])
cv2.imshow("Edit DXF", display_img)
cv2.setMouseCallback("Edit DXF", mouse_draw)

print("\n[M] Drag to select areas to delete.")
print(f"[S] Press 'S' to save cleaned DXF to {OUTPUT_DXF_DELETE}")
print("[Z] Press 'Z' to undo last delete")
print("[E] Press ESC to quit")

while True:
    key = cv2.waitKey(1) & 0xFF
    if key == 27:  # ESC
        break
    elif key in [ord('s'), ord('S')]:
        doc.saveas(OUTPUT_DXF_DELETE)
        print(f"[S] Saved cleaned DXF to {OUTPUT_DXF_DELETE}")
    elif key in [ord('z'), ord('Z')]:
        if undo_stack:
            last_deleted = undo_stack.pop()
            for e in last_deleted:
                msp.add_entity(e)
            print(f"[Z] Undid last delete ({len(last_deleted)} entities).")
            # === UPDATE CALL: Use all four original bounds again to redraw fixed frame ===
            display_img = draw_dxf_to_image(msp, scale, delete_min_x, delete_max_x, delete_min_y, delete_max_y, cell_size)
            cv2.imshow("Edit DXF", display_img)
        else:
            print("[W] Nothing to undo.")

cv2.destroyAllWindows()

# ----------------------------------------------------
# 4. Label Process
# ----------------------------------------------------
print("\n--- 4. Label Process: Manual Room Labeling (Interactive) ---")

DXF_PATH_LABEL = CLEANED_DXF

try:
    doc = ezdxf.readfile(DXF_PATH_LABEL)
except IOError:
    print(f"Error: Cannot read cleaned DXF file at {DXF_PATH_LABEL}. Exiting.")
    exit()

msp = doc.modelspace()

# Extract all polylines/lines (Re-defined from original Label Process file)
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

if not line_data:
    print("No geometry found for labeling. Exiting.")
    exit()
    
# Flatten to compute bounds
all_points = [pt for poly in line_data for pt in poly]
xs, ys = zip(*all_points)
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# Create grid
width = int((max_x - min_x) / cell_size) + 1
height = int((max_y - min_y) / cell_size) + 1
img = np.zeros((height, width), dtype=np.uint8)

def to_grid_coords_label(x, y):
    gx = int((x - min_x) / cell_size)
    gy = int((max_y - y) / cell_size)
    return gx, gy

# Draw DXF geometry into image
for poly in line_data:
    pts = np.array([to_grid_coords_label(x, y) for x, y in poly], np.int32)
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

# Capture bounds to use inside the callback
label_min_x = min_x
label_max_y = max_y

def click_event(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        # Convert scaled coords -> original DXF coordinates
        grid_x = int(x / scale)
        grid_y = int(y / scale)

        # Map back to DXF coordinate system
        dxf_x = label_min_x + grid_x * cell_size
        dxf_y = label_max_y - grid_y * cell_size

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

print(f"\n[x] Saved {len(points)} labeled points to {OUTPUT_JSON}")


# ----------------------------------------------------
# 5. Generate Grid Process
# ----------------------------------------------------
print("\n--- 5. Generate Grid Process: Final Rasterization ---")

INPUT_DXF_GRID = CLEANED_DXF

# === Load DXF ===
try:
    doc = ezdxf.readfile(INPUT_DXF_GRID)
except IOError:
    print(f"Error: Cannot read cleaned DXF file at {INPUT_DXF_GRID}. Exiting.")
    exit()

msp = doc.modelspace()
line_data = []

# Extract lines (Re-defined from original Grid Process file)
for e in msp.query("LINE"):
    start, end = e.dxf.start, e.dxf.end
    line_data.append([(start.x, start.y), (end.x, end.y)])

for e in msp.query("LWPOLYLINE"):
    points = [tuple(p[0:2]) for p in e.get_points()]
    line_data.append(points)

for e in msp.query("POLYLINE"):
    points = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
    line_data.append(points)

if not line_data:
    print("No geometry found to generate grid. Exiting.")
    exit()

# === Compute bounds ===
all_points = [pt for poly in line_data for pt in poly]
xs, ys = zip(*all_points)
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# --- Add buffer around edges ---
x_range = max_x - min_x
y_range = max_y - min_y
min_x -= x_range * BOUNDARY_BUFFER
max_x += x_range * BOUNDARY_BUFFER
min_y -= y_range * BOUNDARY_BUFFER
max_y += y_range * BOUNDARY_BUFFER
print(f"Applied {BOUNDARY_BUFFER*100:.0f}% boundary buffer.")

# === Rasterize ===
width = int((max_x - min_x) / cell_size) + 1
height = int((max_y - min_y) / cell_size) + 1
img = np.zeros((height, width), dtype=np.uint8)

def to_grid_coords_grid(x, y):
    gx = int((x - min_x) / cell_size)
    gy = int((max_y - y) / cell_size)
    return gx, gy

for poly in line_data:
    pts = np.array([to_grid_coords_grid(x, y) for x, y in poly], np.int32)
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

np.save(OUTPUT_NPY, grid)
print(f"[x] Saved grid (shape: {grid.shape}) -> {OUTPUT_NPY}")

grid_scaled = cv2.resize(
    grid,
    (grid.shape[1] * scale_factor, grid.shape[0] * scale_factor),
    interpolation=cv2.INTER_NEAREST
)

with open(META_JSON, "w") as f:
    json.dump(meta, f, indent=2)
print(f"[x] Saved grid metadata -> {META_JSON}")

plt.imshow(grid_scaled, cmap="gray")
plt.title("Final Floorplan Grid")
plt.axis("off")
plt.show()

print("\n--- All processes completed! ---")