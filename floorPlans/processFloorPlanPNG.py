import cv2
import numpy as np
import os

# Load cleaned floor plan
img_path = "se06F1BasicPlan.jpg"
img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)

img = cv2.equalizeHist(img)

# Threshold to black/white
binary = cv2.adaptiveThreshold(
    img, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 5
)

# Target grid size
grid_h, grid_w = 300, 600

# Split into nearly equal blocks (covers whole image, no cropping)
rows = np.array_split(np.arange(binary.shape[0]), grid_h)
cols = np.array_split(np.arange(binary.shape[1]), grid_w)

grid = np.zeros((grid_h, grid_w), dtype=np.uint8)

for i, r_idx in enumerate(rows):
    for j, c_idx in enumerate(cols):
        block = binary[np.ix_(r_idx, c_idx)]
        if np.max(block) > 0:   # any wall pixel
            grid[i, j] = 1


# Generate output filename based on input image name
base_name = os.path.splitext(os.path.basename(img_path))[0]
out_path = f"{base_name}_grid_{grid_h}x{grid_w}.txt"

# Save as plain text
np.savetxt(out_path, grid, fmt="%d")
print(f"Grid saved as: {out_path}")

cv2.imshow("binary", binary)
cv2.imshow("grid preview", cv2.resize(grid*255, (1650,500), interpolation=cv2.INTER_NEAREST))
cv2.waitKey(0)