#!/usr/bin/env python3
"""
Multi-floor pathfinder.py — automatically loads floor grids and labels
Modified: Takes a starting room number instead of a coordinate point.
"""

import sys, os, json
import numpy as np
import heapq
from collections import deque
import matplotlib.pyplot as plt

# === CONFIG ===
BASE_DIR = "floorPlans"
OUT_DIR = "public"

# --- Load floor data dynamically (UNCHANGED) ---
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

    direction = building_code[:2]
    building_number = building_code[2:]
    building_dir = os.path.join(base_dir, direction, building_number)

    if not os.path.exists(building_dir):
        raise FileNotFoundError(f"Building directory not found: {building_dir}")

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

        # Load meta info to convert DXF -> grid coordinates
        meta_path = os.path.join(floor_path, "meta.json")
        if not os.path.exists(meta_path):
            continue
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

def heuristic(a, b):
    floor_a, r_a, c_a = a
    floor_b, r_b, c_b = b
    return abs(r_a - r_b) + abs(c_a - c_b) + 10 * abs(floor_a - floor_b)


def neighbors(state):
    floor, r, c = state
    grid = FLOOR_GRIDS[floor]
    rows, cols = grid.shape

    # 1. Neighboring cells on the same floor
    for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
        nr, nc = r+dr, c+dc
        # Check bounds and ensure cell is free (0)
        if 0 <= nr < rows and 0 <= nc < cols and grid[nr, nc] == 0:
            yield (floor, nr, nc)

    # 2. Stair connections to other floors
    for stair, floors in STAIRS.items():
        if floors.get(floor) == (r, c): # If current state is a stair location
            for other_floor, pos in floors.items():
                if other_floor != floor:
                    # Neighbor is the same stair's location on a different floor
                    yield (other_floor, pos[0], pos[1])


def astar_multi_floor(start, goal):
    # Implementation of A* search algorithm
    open_heap = []
    counter = 0 # Tie-breaker for heapq
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
            # Cost of movement is 1 for adjacent cell, or 1 for floor change
            tentative_g = gscore[current] + 1
            if tentative_g < gscore.get(neighbor, float('inf')):
                came_from[neighbor] = current
                gscore[neighbor] = tentative_g
                f = tentative_g + heuristic(neighbor, goal)
                heapq.heappush(open_heap, (f, tentative_g, counter, neighbor))
                counter += 1
    return None


def snap_to_free(state):
    # Flood-fills outwards from a coordinate until it finds a free (0) cell
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
    """
    Visualizes the path segments on the floor grid(s) using matplotlib.
    Assumes 'path' is the SMOOTHED path containing only key turning points.
    """
    os.makedirs(OUT_DIR, exist_ok=True)
    
    # Structure to hold all coordinates to be colored for each floor
    path_by_floor = {f: [] for f in FLOOR_GRIDS.keys()}
    
    # Iterate over the segments of the smoothed path
    for i in range(len(path) - 1):
        p1 = path[i]
        p2 = path[i+1]
        
        # If segment is a floor change (stair transition)
        if p1[0] != p2[0]:
            # Mark the entry/exit stair points
            path_by_floor[p1[0]].append((p1[1], p1[2]))
            path_by_floor[p2[0]].append((p2[1], p2[2]))
            continue
            
        # If same floor, draw the line segment between key points
        floor = p1[0]
        
        # Use the line drawing helper to get all intermediate cells (r, c)
        line_points_rc = get_points_on_line(p1, p2) 

        # Store all points along the line segment for visualization
        for r, c in line_points_rc:
            path_by_floor[floor].append((r, c))
            
    
    # 2. Iterate through each floor grid and draw the stored path
    for floor in sorted(FLOOR_GRIDS.keys()):
        if floor not in FLOOR_GRIDS:
            continue
            
        vis = FLOOR_GRIDS[floor].copy().astype(int)
        
        # Draw all stored path cells for this floor
        for r, c in path_by_floor.get(floor, []):
            if 0 <= r < vis.shape[0] and 0 <= c < vis.shape[1]:
                vis[r, c] = 2 # Path color

        # Mark Start/Goal points (these override the path color)
        if start[0] == floor:
            vis[start[1], start[2]] = 3 # Start color
        if goal[0] == floor:
            vis[goal[1], goal[2]] = 4 # Goal color

        plt.figure(figsize=(8,8 * (vis.shape[0]/vis.shape[1])))
        plt.imshow(vis, cmap='viridis', interpolation='nearest')
        plt.title(f"Floor {floor} path visualization")
        out_path = os.path.join(OUT_DIR, f"floor{floor}_path.png")
        plt.savefig(out_path)
        plt.close()

def is_line_of_sight(p1, p2):
    """
    Checks if there is a straight-line path between two grid points (p1 and p2)
    without hitting any walls (grid cell value != 0).
    Uses a simple line drawing algorithm (like Bresenham's) check.
    """
    f1, r1, c1 = p1
    f2, r2, c2 = p2
    
    # Must be on the same floor
    if f1 != f2:
        return False
        
    grid = FLOOR_GRIDS[f1]
    
    # Simple check: If the distance is only 1, it's already a neighbor move (and free)
    if abs(r1 - r2) + abs(c1 - c2) <= 1:
        return True

    dr = abs(r2 - r1)
    dc = abs(c2 - c1)
    s_r = 1 if r1 < r2 else -1
    s_c = 1 if c1 < c2 else -1
    
    r, c = r1, c1
    
    if dr >= dc:
        err = dr / 2.0
        for _ in range(dr):
            r += s_r
            err -= dc
            if err < 0:
                c += s_c
                err += dr
            
            if grid[r, c] != 0:
                return False
    else:
        err = dc / 2.0
        for _ in range(dc):
            c += s_c
            err -= dr
            if err < 0:
                r += s_r
                err += dc
                
            if grid[r, c] != 0:
                return False
    
    return True

def smooth_path(path):
    """
    Prunes redundant points from the A* path to create a smoother, visually appealing path.
    """
    if not path or len(path) <= 2:
        return path
    
    smoothed = [path[0]]
    start_node = path[0]
    
    for i in range(2, len(path)):
        end_node = path[i]
        
        # Check if the start_node can see the end_node without obstruction.
        # This check is only meaningful for movements on the same floor.
        if start_node[0] == end_node[0] and is_line_of_sight(start_node, end_node):
            # If line of sight is clear, skip the intermediate point path[i-1]
            continue
        else:
            # Obstacle or floor change: finalize the segment at path[i-1]
            smoothed.append(path[i-1])
            start_node = path[i-1]
            
    # Always add the final node (goal)
    if smoothed[-1] != path[-1]:
        smoothed.append(path[-1])
        
    return smoothed

def get_points_on_line(p1, p2):
    """
    Returns a list of (r, c) coordinates that lie on the line segment
    between p1 (r1, c1) and p2 (r2, c2). Assumes same floor.
    """
    f, r1, c1 = p1
    _, r2, c2 = p2
    
    points = []
    
    # Use integer-based Bresenham's adapted for grid marking
    r, c = r1, c1
    dr, dc = r2 - r1, c2 - c1
    
    step_r = 1 if dr > 0 else -1
    step_c = 1 if dc > 0 else -1
    
    abs_dr = abs(dr)
    abs_dc = abs(dc)
    
    error = abs_dr - abs_dc
    
    # Start loop after appending the first point
    points.append((r1, c1))
    
    while r != r2 or c != c2:
        # Determine the next step based on the error term
        if error > 0:
            r += step_r
            error -= abs_dc
        elif error < 0:
            c += step_c
            error += abs_dr
        else: # error == 0 (diagonal step)
            r += step_r
            c += step_c
            error = abs_dr - abs_dc
            
        points.append((r, c))

    return points

def main():
    # Expect 6 arguments: 
    # <start_dir> <start_num> <start_room> <goal_dir> <goal_num> <goal_room>
    if len(sys.argv) != 7:
        print("Usage: python pathFindingMultiBuilding.py <start_dir> <start_num> <start_room> <goal_dir> <goal_num> <goal_room>")
        sys.exit(1)

    # --- 1. Parse all 6 input parameters ---
    start_direction = sys.argv[1].lower()
    start_number = sys.argv[2]
    start_room_str = sys.argv[3]
    goal_direction = sys.argv[4].lower()
    goal_number = sys.argv[5]
    goal_room_str = sys.argv[6]

    start_building_code = f"{start_direction}{start_number}"
    goal_building_code = f"{goal_direction}{goal_number}"

    # --- 2. Multi-Building Check ---
    if start_building_code != goal_building_code:
        # This is where multi-building logic would go.
        print(f"Multi-building pathfinding not yet supported.")
        print(f"Start: {start_building_code} -> Goal: {goal_building_code}")
        print(f"Please enter the same building code for both start and goal.")
        sys.exit(1)

    # --- 3. Load Data for the single required building ---
    print(f"Loading building {start_building_code}...")

    # Assign loaded data to the global variables used by A*
    global FLOOR_GRIDS, ROOM_COORDS, STAIRS
    try:
        FLOOR_GRIDS, ROOM_COORDS, STAIRS = load_floor_data(BASE_DIR, start_building_code)
    except FileNotFoundError as e:
        print(f"Data loading failed: {e}")
        sys.exit(1)

    if not FLOOR_GRIDS:
        print(f"Could not load any floor data for building {start_building_code}.")
        sys.exit(1)

    # --- 4. Validate and locate Start & Goal Rooms ---
    try:
        start_room_num = int(start_room_str)
        goal_room_num = int(goal_room_str)
    except ValueError:
        print("Invalid room number format.")
        sys.exit(1)

    if start_room_num not in ROOM_COORDS:
        print(f"Unknown starting room number {start_room_num} in {start_building_code} labels.")
        sys.exit(1)
        
    if goal_room_num not in ROOM_COORDS:
        print(f"Unknown goal room number {goal_room_num} in {goal_building_code} labels.")
        sys.exit(1)


    # --- 5. Prepare Start and Goal States ---
    start_floor, (start_r, start_c) = ROOM_COORDS[start_room_num]
    start = snap_to_free((start_floor, start_r, start_c))

    goal_floor, (goal_r, goal_c) = ROOM_COORDS[goal_room_num]
    goal = snap_to_free((goal_floor, goal_r, goal_c))

    print(f"Start room {start_room_num} ({start_building_code}) -> Grid {start}")
    print(f"Goal room {goal_room_num} ({goal_building_code}) -> Grid {goal}")

    # --- 6. Run pathfinding ---
    path = astar_multi_floor(start, goal)
    if not path:
        print("No path found!")
        sys.exit(1)

    print(f"Raw path found: {len(path)} steps")
    
    smoothed_path = smooth_path(path)
    print(f"Smoothed path: {len(smoothed_path)} key steps")
    
    print(f"Variables: {smoothed_path}, {start}, {goal}\n")

    visualize_path(smoothed_path, start, goal) # Use the smoothed path for visualization

    if len(smoothed_path) > 20:
        print("First 10 smoothed path states:", smoothed_path[:10], "...")
    else:
        print("Full smoothed path:", smoothed_path)


if __name__ == "__main__":
    main()