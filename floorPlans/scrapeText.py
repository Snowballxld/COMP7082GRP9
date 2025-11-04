import ezdxf
import math

BUILDING_CODE = "se06F1"

folder_path = f"floorPlans/{BUILDING_CODE[:2]}/{BUILDING_CODE[2:4]}/{BUILDING_CODE[4:]}"
DXF_PATH = f"{folder_path}/{BUILDING_CODE}Plan.dxf"
OUTPUT_DXF = f"{folder_path}/scraped.dxf"

# === STEP 2: Clean DXF geometry ===
doc_dxf = ezdxf.readfile(DXF_PATH)
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

    if diag < 35:  # small = likely text junk
        continue

    cleaned_polys.append(pts)

print(f"[✓] Kept {len(cleaned_polys)} wall polylines after filtering.")

# Save cleaned DXF
new_doc = ezdxf.new()
msp_new = new_doc.modelspace()
for poly in cleaned_polys:
    msp_new.add_lwpolyline(poly)
new_doc.saveas(OUTPUT_DXF)
print(f"[✓] Saved cleaned DXF: {OUTPUT_DXF}")

print("\nAll done!")
