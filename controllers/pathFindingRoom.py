#!/usr/bin/env python3
"""
Multi-building, multi-floor pathfinder.py
"""

import sys, os, json
import numpy as np
import heapq
from collections import deque
import matplotlib.pyplot as plt
from matplotlib import colors as mcolors
from PIL import Image, ImageDraw # Import Pillow for image overlay

# === CONFIG ===
BASE_DIR = "floorPlans"
OUT_DIR = "public/images"
OUT_DIR_DATA = "public/data"

# Global data structures (keyed by building_code for ALL_BUILDING_DATA)
ALL_BUILDING_DATA = {} # Stores grids, connections, meta, etc. {b_code: {floor_num: {data...}}}
ROOM_COORDS = {}    # {room_id: [(b_code, floor, r, c), ...]}
STAIRS = {}      # {stair_name: {(b_code, floor): (r, c)}}
ENTRANCES = {}     # {entrance_label: [(b_code, floor, r, c), ...]}

# =============================================================
# === DATA LOADING ===
# =============================================================

def load_floor_data(base_dir, building_code):
    """
    Loads ALL data (grids, labels, meta, connections) for a single building.
    Returns: Dict structured by floor number: {floor_num: {data...}}
    """
    building_data = {}
    
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
        
        # Paths
        grid_path = os.path.join(floor_path, "floorplan_grid.npy")
        labels_path = os.path.join(floor_path, "labels.json")
        meta_path = os.path.join(floor_path, "meta.json")
        connections_path = os.path.join(floor_path, "connections.json") 
        # Path for the image used in the overlay
        image_path = os.path.join(floor_path, "floorplan_image.png")

        if not os.path.exists(grid_path) or not os.path.exists(labels_path) or not os.path.exists(meta_path):
            continue

        # Load Grid and Meta
        grid = np.load(grid_path, allow_pickle=True)
        with open(meta_path, "r") as f:
            meta = json.load(f)
        with open(labels_path, "r") as f:
            raw_labels = json.load(f)

        # Load Connections (if present)
        connections = {}
        if os.path.exists(connections_path):
            with open(connections_path, "r") as f:
                content = f.read().strip()
                if content:
                    try:
                        connections = json.loads(content)
                    except json.JSONDecodeError as e:
                        print(f"Warning: Failed to decode JSON in {connections_path}. Error: {e}")

        # Coordinate conversion setup
        min_x, max_y, cell_size = meta["min_x"], meta["max_y"], meta["cell_size"]
        
        original_image_size = None
        if os.path.exists(image_path):
            try:
                with Image.open(image_path) as img:
                    original_image_size = img.size
            except Exception as e:
                print(f"Warning: Could not load image {image_path}: {e}")

        def to_grid_coords(x, y):
            """Convert DXF (x,y) to grid (row,col)"""
            col = int((x - min_x) / cell_size)
            row = int((max_y - y) / cell_size)
            return (row, col)

        def to_image_coords(r, c):
            """Convert grid (row,col) to original image (x,y) for drawing"""
            # Convert grid (row,col) to DXF center (x,y)
            x_dxf = min_x + (c * cell_size) + (cell_size / 2)
            y_dxf = max_y - (r * cell_size) - (cell_size / 2)
            
            if original_image_size:
                img_width, img_height = original_image_size
                
                # Use metadata to scale DXF bounds to image pixel bounds
                dxf_width = meta["max_x"] - meta["min_x"]
                dxf_height = meta["max_y"] - meta["min_y"]
                
                if dxf_width > 0 and dxf_height > 0:
                    scale_x = img_width / dxf_width
                    scale_y = img_height / dxf_height
                    
                    # Convert DXF (x,y) to Image (x,y)
                    img_x = int((x_dxf - meta["min_x"]) * scale_x)
                    img_y = int((meta["max_y"] - y_dxf) * scale_y) # Y-axis inverted for image coords
                    return (img_x, img_y)
            return (int(c), int(r)) # Fallback
            
        # Process Labels
        floor_rooms = {}
        floor_stairs = {}
        floor_entrances = {}

        for item in raw_labels:
            label = item["label"].strip().lower()
            gx, gy = item["x"], item["y"]
            row, col = to_grid_coords(gx, gy)
            grid_coords = (row, col)

            if label.startswith("stairs"):
                stair_name = label.split()[-1].upper()
                floor_stairs.setdefault(stair_name, {})[floor_num] = grid_coords
            elif label.startswith("entrance"):
                entrance_name = label
                floor_entrances.setdefault(entrance_name, []).append((floor_num, grid_coords))
            elif label.replace(" ", "").isdigit():
                room_id = int(label)
                floor_rooms.setdefault(room_id, []).append((floor_num, grid_coords))

        building_data[floor_num] = {
            "grid": grid,
            "rooms": floor_rooms,
            "stairs": floor_stairs,
            "entrances": floor_entrances,
            "connections": connections,
            "meta": meta, # Store meta for image coord conversion
            "image_path": image_path, # Store image path
            "to_image_coords": to_image_coords # Store the converter function
        }
        
    return building_data

# =============================================================
# === PATHFINDING ALGORITHM ===
# =============================================================

# State is now: (b_code, floor, r, c)

def heuristic(a, b):
    b_a, floor_a, r_a, c_a = a
    b_b, floor_b, r_b, c_b = b
    
    # High penalty for cross-building travel in heuristic
    building_penalty = 1000 if b_a != b_b else 0
    
    return abs(r_a - r_b) + abs(c_a - c_b) + 10 * abs(floor_a - floor_b) + building_penalty

def neighbors(state):
    b_code, floor, r, c = state
    
    if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or floor not in ALL_BUILDING_DATA[b_code]["grids"]:
        return

    # --- 1. Same Floor / Same Building (Standard Movement) ---
    grid = ALL_BUILDING_DATA[b_code]["grids"][floor] 
    floor_data = ALL_BUILDING_DATA[b_code][floor]
    rows, cols = grid.shape

    for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
        nr, nc = r+dr, c+dc
        if 0 <= nr < rows and 0 <= nc < cols and grid[nr, nc] == 0:
            yield (b_code, floor, nr, nc) 

    # --- 2. Stair connections (Within the same building) ---
    for stair_name, floor_map in STAIRS.items():
        if floor_map.get((b_code, floor)) == (r, c):
            for (other_b_code, other_floor), pos in floor_map.items():
                if other_b_code == b_code and other_floor != floor:
                    yield (b_code, other_floor, pos[0], pos[1])

    # --- 3. Cross-Building Connections (Entrance Portals) ---
    conn_data = floor_data.get("connections", {})
    
    if conn_data:
        for i, (current_entrance_label, connected_entrance_label) in enumerate(conn_data.get("connectedEntrances", [])):
            
            entrance_coords_list = floor_data["entrances"].get(current_entrance_label.lower(), [])
            
            # Check if the current state's (floor, (r, c)) matches a known entrance coordinate
            if (floor, (r, c)) in entrance_coords_list:
                
                dest_b_code = conn_data["connectedBuildings"][i]
                dest_floor_str = conn_data["connectedFloors"][i]
                
                try:
                    dest_floor = int(dest_floor_str[1:])
                except ValueError: continue

                # Look up the destination entrance point in the global ENTRANCES (b_code, floor, r, c)
                dest_entrance_locs = ENTRANCES.get(connected_entrance_label.lower(), [])
                
                dest_point = next(((b, f, row, col) for b, f, row, col in dest_entrance_locs 
                                    if b == dest_b_code and f == dest_floor), None)
                
                if dest_point:
                    yield dest_point


def astar_multi_floor(start, goal):
    # Implementation of A* search algorithm (Adapted for 4-tuple state)
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
            # All movements (cell, stair, or entrance jump) cost 1
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
    b_code, floor, r, c = state
    
    if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or floor not in ALL_BUILDING_DATA[b_code]["grids"]:
        return state 
    grid = ALL_BUILDING_DATA[b_code]["grids"][floor]
    
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
                    return (b_code, floor, nr, nc) 
                seen.add((nr,nc))
                q.append((nr,nc))
    return state

# =============================================================
# === VISUALIZATION AND OUTPUT ===
# =============================================================

def get_points_on_line(p1, p2):
    """
    Returns a list of (r, c) coordinates that lie on the line segment
    between p1 and p2. Assumes same floor/building.
    p1, p2 are 4-tuple states: (b_code, floor, r, c)
    Uses Bresenham-like algorithm for grid points.
    """
    r1, c1 = p1[2], p1[3]
    r2, c2 = p2[2], p2[3]
    
    points = []
    r, c = r1, c1
    dr, dc = r2 - r1, c2 - c1
    
    step_r = 1 if dr > 0 else -1
    step_c = 1 if dc > 0 else -1
    
    abs_dr = abs(dr)
    abs_dc = abs(dc)
    
    error = abs_dr - abs_dc
    
    points.append((r1, c1))
    
    while r != r2 or c != c2:
        if error > 0:
            r += step_r
            error -= abs_dc
        elif error < 0:
            c += step_c
            error += abs_dr
        else:
            r += step_r
            c += step_c
            error = abs_dr - abs_dc
            
        points.append((r, c))

    return points


def save_path_array(smoothed_path):
    """Saves the final path array to a JSON file."""
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR_DATA, "final_path.json")
    
    path_list = [list(step) for step in smoothed_path]
    
    with open(out_path, "w") as f:
        json.dump(path_list, f, indent=2)
    print(f"Saved final path array to {out_path}")


def get_segment_markers(path):
    """
    Helper to identify start and end points of path segments on each map.
    Returns: segment_markers {(b_code, floor): [local_start, local_end]}
             path_segments_by_map {(b_code, floor): [(p1, p2), ...]}
    """
    required_viz = set((b, f) for b, f, _, _ in path)
    path_segments_by_map = {map_id: [] for map_id in required_viz}
    segment_markers = {} 

    for i in range(len(path) - 1):
        p1 = path[i]
        p2 = path[i+1]
        
        is_map_change = (p1[0], p1[1]) != (p2[0], p2[1])

        if (p1[0], p1[1]) not in segment_markers:
            segment_markers[(p1[0], p1[1])] = [p1, None] 
        
        if is_map_change:
            segment_markers[(p1[0], p1[1])][1] = p1 
            segment_markers.setdefault((p2[0], p2[1]), [p2, None])[0] = p2 
            
        b_code, floor = p1[0], p1[1]
        if not is_map_change:
            path_segments_by_map[(b_code, floor)].append((p1, p2))

    last_map_id = (path[-1][0], path[-1][1])
    segment_markers.setdefault(last_map_id, [path[-1], path[-1]])[1] = path[-1]
    
    return segment_markers, path_segments_by_map


# ... (all code before visualize_path remains the same) ...

# =============================================================
# === VISUALIZATION AND OUTPUT ===
# =============================================================

# ... (get_points_on_line, save_path_array, get_segment_markers remain the same) ...

def visualize_path(path, start, goal):
    """
    Visualizes the path segments on the floor grid(s) using matplotlib, 
    making the start (blue circle) and end (green triangle) of EACH floor 
    segment clearly marked. Saves as *_full.png with a **transparent background**.
    """
    os.makedirs(OUT_DIR, exist_ok=True)
    
    # Define numeric values for visualization
    PATH_VALUE = 2   
    START_MARKER_VALUE = 3   # Blue Circle
    GOAL_MARKER_VALUE = 4   # Green Triangle/Arrow
    PATH_LINE_WIDTH = 3

    path_thickness_offset = (PATH_LINE_WIDTH - 1) // 2
    marker_size = 10
    
    segment_markers, path_segments_by_map = get_segment_markers(path)
    required_viz = segment_markers.keys()
    
    # Map raw path points (r, c) to map IDs
    path_by_map = {map_id: [] for map_id in required_viz}
    for (b_code, floor), segments in path_segments_by_map.items():
        for p1, p2 in segments:
            line_points_rc = get_points_on_line(p1, p2) 
            path_by_map[(b_code, floor)].extend(line_points_rc)

    # --- Iterate through each map and draw ---
    for (b_code, floor) in required_viz:
        if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or floor not in ALL_BUILDING_DATA[b_code]["grids"]:
            continue
            
        grid_dimensions = ALL_BUILDING_DATA[b_code]["grids"][floor].shape
        rows, cols = grid_dimensions[0], grid_dimensions[1]

        # Start with the grid, but we will modify the colormap later to make the background transparent
        vis = ALL_BUILDING_DATA[b_code]["grids"][floor].copy().astype(int)
        
        # --- Draw Path ---
        for r, c in path_by_map[(b_code, floor)]:
            # Iterate over a square area based on the new thickness offset
            for dr in range(-path_thickness_offset, path_thickness_offset + 1):
                for dc in range(-path_thickness_offset, path_thickness_offset + 1):
                    nr, nc = r + dr, c + dc
                    
                    # Check bounds and only draw path on free space (value 0)
                    if 0 <= nr < rows and 0 <= nc < cols and vis[nr, nc] == 0:
                        vis[nr, nc] = PATH_VALUE

        # --- Draw Markers (Overwrite everything) ---
        local_start, local_end = segment_markers.get((b_code, floor), (None, None))

        # Draw Local Start Marker (Circle - Blue)
        if local_start:
            start_r, start_c = local_start[2], local_start[3]
            for dr in range(-marker_size, marker_size + 1):
                for dc in range(-marker_size, marker_size + 1):
                    nr, nc = start_r + dr, start_c + dc
                    if 0 <= nr < rows and 0 <= nc < cols and (dr**2 + dc**2) <= marker_size**2:
                        vis[nr, nc] = START_MARKER_VALUE

        # Draw Local Goal Marker (Triangle - Green)
        if local_end:
            end_r, end_c = local_end[2], local_end[3]
            for dr in range(-marker_size, marker_size + 1):
                for dc in range(-marker_size, marker_size + 1):
                    nr, nc = end_r + dr, end_c + dc
                    if 0 <= nr < rows and 0 <= nc < cols:
                        if dr <= 0 and abs(dc) <= (marker_size + dr): 
                            vis[nr, nc] = GOAL_MARKER_VALUE
                            
        # --- Matplotlib Plotting & Saving ---
        plt.figure(figsize=(8, 8 * (rows / cols))) 
        
        # Define a custom colormap: 
        # 0: Background (Transparent), 1: Wall (Transparent)
        # 2: Path (Red), 3: Start/Local Start (Blue), 4: Goal/Local Goal (Green)
        cmap_colors = ['#00000000', '#00000000', 'red', 'blue', 'green'] # Use transparent hex for 0 and 1
        cmap = mcolors.ListedColormap(cmap_colors)

        # Grid/Free space (0 and 1) are VISIBLE for the background file
        # Assuming 0: Free Space (White), 1: Wall/Obstacle (Dark Gray)
        GRID_COLORS = ['#ffffff', '#595959', 'red', 'blue', 'green']
        cmap_with_grid = mcolors.ListedColormap(GRID_COLORS)
        cmap_with_grid.set_under(GRID_COLORS[0])
        
        # Use a Normalized colormap and set the out-of-range color to transparent black
        cmap.set_under('#00000000') # Ensure values below min (0) are transparent
        
        plt.imshow(vis, cmap=cmap, interpolation='nearest', vmin=0, vmax=len(cmap_colors) - 1) 
        
        plt.axis('off') 
        
        out_path_full = os.path.join(OUT_DIR, f"{b_code}_floor{floor}_path.png")
        
        # *** KEY CHANGE: Set transparent=True when saving ***
        plt.savefig(out_path_full, bbox_inches='tight', pad_inches=0, transparent=True)

        # 2. Save WITH background (full grid/floor plan)
        # Use the grid colormap (re-plot on the same figure to change the colors)
        plt.imshow(vis, cmap=cmap_with_grid, interpolation='nearest', vmin=0, vmax=len(GRID_COLORS) - 1)
        
        out_path_full_bg = os.path.join(OUT_DIR, f"{b_code}_floor{floor}_path_bg.png")
        plt.savefig(out_path_full_bg, bbox_inches='tight', pad_inches=0, transparent=False)

        plt.close()


def is_line_of_sight(p1, p2):
    """
    Checks if there is a straight-line path between two grid points (p1 and p2)
    without hitting any walls (grid cell value != 0).
    """
    b_code, f1, r1, c1 = p1
    b_code_2, f2, r2, c2 = p2
    
    if b_code != b_code_2 or f1 != f2:
        return False
    
    if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or f1 not in ALL_BUILDING_DATA[b_code]["grids"]:
        return False
    grid = ALL_BUILDING_DATA[b_code]["grids"][f1]
    
    # Handle adjacent points quickly
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
        
        # Check if start_node and end_node are on the same map (building/floor)
        same_map = (start_node[0] == end_node[0]) and (start_node[1] == end_node[1])
        
        if same_map and is_line_of_sight(start_node, end_node):
            continue
        else:
            # Obstacle, floor change, or building change: finalize the segment at path[i-1]
            if path[i-1] != start_node:
                 smoothed.append(path[i-1])
            start_node = path[i-1]
            
    if smoothed[-1] != path[-1]:
        smoothed.append(path[-1])
        
    return smoothed


def resolve_location(loc_str, b_code, room_coords, entrances):
    """
    Attempts to resolve an input location string (room ID or entrance label) 
    into a list of (b_code, floor, r, c) coordinates within the specified building.
    """
    loc_str_lower = loc_str.strip().lower()

    try:
        # 1. Check if it's a numeric room ID
        room_id = int(loc_str_lower)
        locations = [loc for loc in room_coords.get(room_id, []) if loc[0] == b_code]
        if locations:
            print(f"Resolved '{loc_str}' as Room ID {room_id}.")
            return locations
    except ValueError:
        # 2. Check if it's an entrance label
        if loc_str_lower.startswith("entrance"):
            locations = [loc for loc in entrances.get(loc_str_lower, []) if loc[0] == b_code]
            if locations:
                print(f"Resolved '{loc_str}' as Entrance '{loc_str_lower}'.")
                return locations
        pass # Not a number and not an entrance label

    return [] # Return empty list if resolution failed


def main():
    # Expect 6 arguments: 
    if len(sys.argv) != 7:
        print("Usage: python pathfinder.py <start_dir> <start_num> <start_loc> <goal_dir> <goal_num> <goal_loc>")
        print("Locations (<start_loc>, <goal_loc>) can be a Room ID (e.g., 101) or an Entrance Label (e.g., entranceNorth).")
        sys.exit(1)

    # --- 1. Parse all 6 input parameters ---
    start_direction = sys.argv[1].lower()
    start_number = sys.argv[2]
    start_loc_str = sys.argv[3]
    goal_direction = sys.argv[4].lower()
    goal_number = sys.argv[5]
    goal_loc_str = sys.argv[6]

    start_building_code = f"{start_direction}{start_number}"
    goal_building_code = f"{goal_direction}{goal_number}"
    
    # --- 2. Load Data for ALL required buildings ---
    print(f"\n--- 1. Data Loading ---")

    global ALL_BUILDING_DATA, ROOM_COORDS, STAIRS, ENTRANCES
    
    required_buildings = set([start_building_code, goal_building_code])

    for b_code in required_buildings:
        print(f"Loading data for building {b_code}...")
        try:
            building_data = load_floor_data(BASE_DIR, b_code)
            
            building_stairs_merged = {}
            
            ALL_BUILDING_DATA[b_code] = {}
            ALL_BUILDING_DATA[b_code]["grids"] = {}
            
            for floor_num, data in building_data.items():
                
                # Store data by floor
                ALL_BUILDING_DATA[b_code][floor_num] = data
                ALL_BUILDING_DATA[b_code]["grids"][floor_num] = data["grid"]
                
                # Consolidate stairs into the temporary structure
                for stair_name, floor_map in data["stairs"].items():
                    building_stairs_merged.setdefault(stair_name, {}).update(floor_map)
                
                # Consolidate global ROOM_COORDS
                for room_id, locations in data["rooms"].items():
                    ROOM_COORDS.setdefault(room_id, []).extend(
                        [(b_code, f, r_coord, c_coord) for f, (r_coord, c_coord) in locations]
                    )

                # Consolidate global ENTRANCES
                for entrance_label, locations in data["entrances"].items():
                    ENTRANCES.setdefault(entrance_label, []).extend(
                        [(b_code, f, r_coord, c_coord) for f, (r_coord, c_coord) in locations]
                    )
            
            # --- Consolidate Merged Stairs into the GLOBAL STAIRS dictionary ---
            for stair_name, floor_map in building_stairs_merged.items():
                for floor, (r, c) in floor_map.items():
                    STAIRS.setdefault(stair_name, {})[(b_code, floor)] = (r, c)

        except FileNotFoundError as e:
            print(f"Data loading failed for {b_code}: {e}")
            sys.exit(1)
            
    if not any(ALL_BUILDING_DATA[b]["grids"] for b in ALL_BUILDING_DATA):
        print(f"Could not load any floor data for the required buildings.")
        sys.exit(1)

    # --- 3. Resolve and locate Start & Goal Locations ---
    start_locations = resolve_location(start_loc_str, start_building_code, ROOM_COORDS, ENTRANCES)
    goal_locations = resolve_location(goal_loc_str, goal_building_code, ROOM_COORDS, ENTRANCES)

    if not start_locations:
        print(f"Error: Could not find location '{start_loc_str}' in building {start_building_code}.")
        print("Please use a valid Room ID (e.g., 101) or Entrance Label (e.g., entranceNorth).")
        sys.exit(1)
        
    if not goal_locations:
        print(f"Error: Could not find location '{goal_loc_str}' in building {goal_building_code}.")
        print("Please use a valid Room ID (e.g., 101) or Entrance Label (e.g., entranceNorth).")
        sys.exit(1)


    # --- 4. Select Closest Label Pair and Prepare States ---
    print(f"\n--- 2. Pair Selection Debug ---")
    
    best_start_flat = None
    best_goal_flat = None
    min_cost = float('inf')

    print(f"\n--- Running Cost Comparison ({len(start_locations)}x{len(goal_locations)} checks) ---")
    for s_flat in start_locations:
        for g_flat in goal_locations:
            cost = heuristic(s_flat, g_flat)
            
            if cost < min_cost:
                min_cost = cost
                best_start_flat = s_flat
                best_goal_flat = g_flat

    if not best_start_flat or not best_goal_flat:
        print("Error: Could not determine start/goal points from labels.")
        sys.exit(1)

    # 5. Use the closest pair for pathfinding
    start = snap_to_free(best_start_flat)
    goal = snap_to_free(best_goal_flat)

    print(f"\n--- 3. Final Selection ---")
    print(f"Start location '{start_loc_str}' -> Final Grid {start}")
    print(f"Goal location '{goal_loc_str}' -> Final Grid {goal}")

    # --- 6. Run pathfinding ---
    path = astar_multi_floor(start, goal)
    
    if not path:
        print("No path found!")
        sys.exit(1)

    print(f"\n--- 4. Path Results ---")
    print(f"Raw path found: {len(path)} steps")
    
    smoothed_path = smooth_path(path)
    save_path_array(smoothed_path) 
    
    print(f"Smoothed path: {len(smoothed_path)} key steps")

    # --- 7. Visualize the path (Grid plot and Image Overlay) ---
    visualize_path(smoothed_path, start, goal) # Saves *_full.png

    if len(smoothed_path) > 20:
        print("First 10 smoothed path states:", smoothed_path[:10], "...")
    else:
        print("Full smoothed path:", smoothed_path)


if __name__ == "__main__":
    main()