import ezdxf
import math

doc = ezdxf.readfile("floorPlans/AnyConv_se06F2Plan.dxf")
msp = doc.modelspace()

cleaned_polys = []

for e in msp.query('LWPOLYLINE POLYLINE'):
    # Get all points
    if e.dxftype() == "LWPOLYLINE":
        pts = [p[0:2] for p in e.get_points()]
    else:
        pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]

    # Skip empty or short data
    if len(pts) < 2:
        continue

    # Compute bounding box size
    xs, ys = zip(*pts)
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    diag = math.hypot(width, height)

    # Filter small junk text shapes
    if diag < 50:   # threshold (tweak depending on your drawing units)
        continue

    cleaned_polys.append(pts)

print(f"Kept {len(cleaned_polys)} polylines after filtering.")

# (Optional) save cleaned geometry
new_doc = ezdxf.new()
msp_new = new_doc.modelspace()
for poly in cleaned_polys:
    msp_new.add_lwpolyline(poly)
new_doc.saveas("floorPlans/cleaned_floorplan.dxf")
print("Saved cleaned DXF.")
