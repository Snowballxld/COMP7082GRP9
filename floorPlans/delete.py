import ezdxf
import numpy as np
import cv2
import pyautogui
import os

# === Paths ===
BUILDING_CODE = "se06F1"

folder_path = f"floorPlans/{BUILDING_CODE[:2]}/{BUILDING_CODE[2:4]}/{BUILDING_CODE[4:]}"
INPUT_DXF = f"{folder_path}/cropped.dxf"
OUTPUT_DXF = f"{folder_path}/cleaned.dxf"

# === Load DXF ===
doc = ezdxf.readfile(INPUT_DXF)
msp = doc.modelspace()

# --- Extract geometry function ---
def extract_lines(msp):
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

line_data = extract_lines(msp)

# === Bounds & rasterization ===
all_pts = [p for seg in line_data for p in seg]
xs, ys = zip(*all_pts)
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

cell_size = 1

def draw_dxf_to_image(msp, scale, min_x, max_y, cell_size):
    lines = extract_lines(msp)
    all_pts = [p for seg in lines for p in seg]
    xs, ys = zip(*all_pts)
    width = int((max(xs) - min(xs)) / cell_size) + 1
    height = int((max(ys) - min(ys)) / cell_size) + 1
    img = np.zeros((height, width), np.uint8)

    def to_grid(x, y):
        gx = int((x - min_x) / cell_size)
        gy = int((max_y - y) / cell_size)
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

display_img = draw_dxf_to_image(msp, scale, min_x, max_y, cell_size)

# === Undo stack ===
undo_stack = []

# === Mouse interaction ===
drawing = False
x_start, y_start = -1, -1

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
        x1_dxf = min_x + gx1 * cell_size
        x2_dxf = min_x + gx2 * cell_size
        y1_dxf = max_y - gy2 * cell_size
        y2_dxf = max_y - gy1 * cell_size

        print(f"\n[🧹] Removing lines in area: ({x1_dxf:.2f}, {y1_dxf:.2f}) → ({x2_dxf:.2f}, {y2_dxf:.2f})")

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
            print(f" → Removed {len(deleted_entities)} entities. (Undo available)")

        # === Update visualization ===
        display_img = draw_dxf_to_image(msp, scale, min_x, max_y, cell_size)
        cv2.imshow("Edit DXF", display_img)

# === Display window ===
cv2.namedWindow("Edit DXF", cv2.WINDOW_NORMAL)
cv2.resizeWindow("Edit DXF", display_img.shape[1], display_img.shape[0])
cv2.imshow("Edit DXF", display_img)
cv2.setMouseCallback("Edit DXF", mouse_draw)

print("\n🖱️ Drag to select areas to delete.")
print("💾 Press 'S' to save cleaned DXF")
print("↩️  Press 'Z' to undo last delete")
print("❌ Press ESC to quit")

while True:
    key = cv2.waitKey(1) & 0xFF
    if key == 27:  # ESC
        break
    elif key in [ord('s'), ord('S')]:
        doc.saveas(OUTPUT_DXF)
        print(f"[💾] Saved cleaned DXF to {OUTPUT_DXF}")
    elif key in [ord('z'), ord('Z')]:
        if undo_stack:
            last_deleted = undo_stack.pop()
            for e in last_deleted:
                msp.add_entity(e)
            print(f"[↩️] Undid last delete ({len(last_deleted)} entities).")
            display_img = draw_dxf_to_image(msp, scale, min_x, max_y, cell_size)
            cv2.imshow("Edit DXF", display_img)
        else:
            print("[⚠️] Nothing to undo.")

cv2.destroyAllWindows()
