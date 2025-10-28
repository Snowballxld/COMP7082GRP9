import ezdxf
import numpy as np
import cv2
import matplotlib.pyplot as plt

doc = ezdxf.readfile("floorPlans/cleaned_floorplan.dxf")
msp = doc.modelspace()

line_data = []
scale_factor = 4

# Handle LINE entities
for e in msp.query('LINE'):
    start = e.dxf.start
    end = e.dxf.end
    line_data.append([(start.x, start.y), (end.x, end.y)])

# Handle LWPOLYLINE and POLYLINE entities
for e in msp.query('LWPOLYLINE'):
    points = [tuple(p[0:2]) for p in e.get_points()]  # each point has (x, y[, bulge])
    line_data.append(points)

for e in msp.query('POLYLINE'):
    points = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
    line_data.append(points)

# print(line_data)


# Flatten all points
all_points = [pt for poly in line_data for pt in poly]
xs, ys = zip(*all_points)

# Compute bounds
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)

# Define grid resolution
cell_size = 1  # each cell = 10 CAD units, adjust based on density

# Compute grid size
width = int((max_x - min_x) / cell_size) + 1
height = int((max_y - min_y) / cell_size) + 1

# Initialize grid
grid = np.zeros((height, width), dtype=int)


# Convert coordinates to grid indices
def to_grid_coords(x, y):
    gx = int((x - min_x) / cell_size)
    gy = int((max_y - y) / cell_size)  # invert y (image coordinates)
    return gx, gy

# Create an image grid (0 = empty)
img = np.zeros((height, width), dtype=np.uint8)

# Draw each wall/polyline
for poly in line_data:
    pts = np.array([to_grid_coords(x, y) for x, y in poly], np.int32)
    pts = pts.reshape((-1, 1, 2))
    cv2.polylines(img, [pts], isClosed=False, color=255, thickness=1)

# Convert to 0/1 grid
grid = (img > 0).astype(int)

# Resize using nearest neighbor to preserve 0/1 values
grid_scaled = cv2.resize(grid, (grid.shape[1]*scale_factor, grid.shape[0]*scale_factor),
                         interpolation=cv2.INTER_NEAREST)

plt.imshow(grid_scaled, cmap='gray')
plt.show()

# np.save("floorplan_grid.npy", grid)