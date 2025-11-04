#!/usr/bin/env python3
"""
Multi-floor pathfinder.py — automatically loads floor grids and labels
"""

import sys, os, json
import numpy as np
import heapq
from collections import deque
import matplotlib.pyplot as plt

# === CONFIG ===
BASE_DIR = "floorPlans"
OUT_DIR = "public"

# --- Load floor data dynamically ---
def load_floor_data(base_dir, building_code):
    """
    Loads all floor grids (.npy) and label positions (.json) in DXF coordinates.
    Returns:
        floor_grids: {floor_number: np.ndarray}
        room_coords: {room_id: (floor_number, (r,c))}
        stairs: {label: {floor_number: (r,c)}}
    """
    floor_grids = {}
    room_coords = {}
    stairs = {}

    building_dir = os.path.join(base_dir, building_code[:2], building_code[2:])

    for floor_folder in sorted(os.listdir(building_dir)):
        if not floor_folder.startswith("F"):
            continue

        floor_num = int(floor_folder[1:])
        floor_path = os.path.join(building_dir, floor_folder)

        grid_path = os.path.join(floor_path, "floorplan_grid.npy")
        labels_path = os.path.join(floor_path, "labels.json")

        if not os.path.exists(grid_path) or not os.path.exists(labels_path):
            continue

        grid = np.load(grid_path, allow_pickle=True)
        floor_grids[floor_num] = grid

        # Load label data
        with open(labels_path, "r") as f:
            raw_labels = json.load(f)

        # Load meta info to convert DXF → grid coordinates
        meta_path = os.path.join(floor_path, "meta.json")
        if not os.path.exists(meta_path):
            raise FileNotFoundError(f"Missing {meta_path} for coordinate conversion.")
        with open(meta_path, "r") as f:
            meta = json.load(f)

        min_x, max_y, cell_size = meta["min_x"], meta["max_y"], meta["cell_size"]

        def to_grid_coords(x, y):
            """Convert DXF (x,y) to grid (row,col)"""
            col = int((x - min_x) / cell_size)
            row = int((max_y - y) / cell_size)
            return (row, col)

        for item in raw_labels:
            label = item["label"].strip().lower()
            gx, gy = item["x"], item["y"]
            row, col = to_grid_coords(gx, gy)

            if label.startswith("stairs"):
                stair_name = label.split()[-1].upper()
                stairs.setdefault(stair_name, {})[floor_num] = (row, col)
            elif label.replace(" ", "").isdigit():
                room_id = int(label)
                room_coords[room_id] = (floor_num, (row, col))

    return floor_grids, room_coords, stairs


# === A* pathfinding functions (unchanged) ===
def heuristic(a, b):
    floor_a, r_a, c_a = a
    floor_b, r_b, c_b = b
    return abs(r_a - r_b) + abs(c_a - c_b) + 10 * abs(floor_a - floor_b)


def neighbors(state):
    floor, r, c = state
    grid = FLOOR_GRIDS[floor]
    rows, cols = grid.shape

    for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
        nr, nc = r+dr, c+dc
        if 0 <= nr < rows and 0 <= nc < cols and grid[nr, nc] == 0:
            yield (floor, nr, nc)

    for stair, floors in STAIRS.items():
        if floors.get(floor) == (r, c):
            for other_floor, pos in floors.items():
                if other_floor != floor:
                    yield (other_floor, pos[0], pos[1])


def astar_multi_floor(start, goal):
    open_heap = []
    counter = 0
    gscore = {start: 0}
    fscore = {start: heuristic(start, goal)}
    heapq.heappush(open_heap, (fscore[start], 0, counter, start)); counter += 1
    came_from = {}
    closed = set()

    while open_heap:
        _, _, _, current = heapq.heappop(open_heap)
        if current in closed:
            continue
        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path
        closed.add(current)
        for neighbor in neighbors(current):
            tentative_g = gscore[current] + 1
            if tentative_g < gscore.get(neighbor, float('inf')):
                came_from[neighbor] = current
                gscore[neighbor] = tentative_g
                f = tentative_g + heuristic(neighbor, goal)
                heapq.heappush(open_heap, (f, tentative_g, counter, neighbor))
                counter += 1
    return None


def snap_to_free(state):
    floor, r, c = state
    grid = FLOOR_GRIDS[floor]
    if grid[r, c] == 0:
        return state
    q = deque([(r,c)])
    seen = {(r,c)}
    while q:
        rr, cc = q.popleft()
        for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
            nr, nc = rr+dr, cc+dc
            if 0 <= nr < grid.shape[0] and 0 <= nc < grid.shape[1] and (nr,nc) not in seen:
                if grid[nr,nc] == 0:
                    return (floor,nr,nc)
                seen.add((nr,nc))
                q.append((nr,nc))
    return state


def visualize_path(path, start, goal):
    os.makedirs(OUT_DIR, exist_ok=True)
    for floor in sorted(FLOOR_GRIDS.keys()):
        vis = FLOOR_GRIDS[floor].copy().astype(int)
        for f,r,c in path:
            if f == floor:
                vis[r,c] = 2
        if start[0] == floor:
            vis[start[1],start[2]] = 3
        if goal[0] == floor:
            vis[goal[1],goal[2]] = 4

        plt.figure(figsize=(8,8 * (vis.shape[0]/vis.shape[1])))
        plt.imshow(vis, cmap='viridis', interpolation='nearest')
        plt.title(f"Floor {floor} path visualization")
        out_path = os.path.join(OUT_DIR, f"floor{floor}_path.png")
        plt.savefig(out_path)
        plt.close()


# === main ===
def main():
    if len(sys.argv) != 5:
        print("Usage: python pathFinding.py <direction> <building_number> <start_floor,x,y> <goal_room>")
        sys.exit(1)

    direction = sys.argv[1].lower()   # e.g. 'se'
    building_number = sys.argv[2]     # e.g. '06'
    start_str = sys.argv[3]           # e.g. '1,735.0,302.0' (DXF coords!)
    room_str = sys.argv[4]            # e.g. '102'

    building_code = f"{direction}{building_number}"
    print(f"🗺️ Loading building {building_code}...")

    global FLOOR_GRIDS, ROOM_COORDS, STAIRS
    FLOOR_GRIDS, ROOM_COORDS, STAIRS = load_floor_data(BASE_DIR, building_code)

    # --- Parse user input ---
    try:
        start_floor, start_y, start_x = [float(x) for x in start_str.split(',')]
        start_floor = int(start_floor)
    except ValueError:
        print("❌ Invalid start coordinate format. Use: <floor,x,y> (e.g. 1,735.0,302.0)")
        sys.exit(1)

    # --- Validate goal room ---
    try:
        room_num = int(room_str)
    except ValueError:
        print("❌ Invalid room number format.")
        sys.exit(1)

    if room_num not in ROOM_COORDS:
        print(f"❌ Unknown room number {room_num} in labels.")
        sys.exit(1)

    # --- Locate meta.json for the same floor as the start ---
    floor_folder = os.path.join(BASE_DIR, direction, building_number, f"F{start_floor}")
    meta_path = os.path.join(floor_folder, "meta.json")

    if not os.path.exists(meta_path):
        raise FileNotFoundError(f"Missing {meta_path} for coordinate conversion.")

    # --- Load metadata for DXF → grid conversion ---
    with open(meta_path, "r") as f:
        meta = json.load(f)
    min_x, max_y, cell_size = meta["min_x"], meta["max_y"], meta["cell_size"]

    # --- Convert DXF → grid coordinates ---
    start_col = int((start_x - min_x) / cell_size)
    start_row = int((max_y - start_y) / cell_size)

    # --- Ensure the point is inside grid bounds ---
    grid = FLOOR_GRIDS[start_floor]
    start_row = max(0, min(grid.shape[0] - 1, start_row))
    start_col = max(0, min(grid.shape[1] - 1, start_col))

    start = snap_to_free((start_floor, start_row, start_col))

    # --- Get goal (already in grid coords) ---
    goal_floor, (goal_r, goal_c) = ROOM_COORDS[room_num]
    goal = snap_to_free((goal_floor, goal_r, goal_c))

    print(f"📍 Start (DXF {start_x:.1f},{start_y:.1f}) → Grid {start}")
    print(f"🎯 Goal room {room_num} → Grid {goal}")

    # --- Run pathfinding ---
    path = astar_multi_floor(start, goal)
    if not path:
        print("❌ No path found!")
        sys.exit(1)

    print(f"✅ Path found: {len(path)} steps")
    visualize_path(path, start, goal)

    if len(path) > 20:
        print("First 10 path states:", path[:10], "...")
    else:
        print("Full path:", path)


if __name__ == "__main__":
    main()
 