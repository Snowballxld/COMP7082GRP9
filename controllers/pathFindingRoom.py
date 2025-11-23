#!/usr/bin/env python3
"""
Multi-building, multi-floor pathfinder.py
"""

import sys, os, json
import numpy as np
import heapq
from collections import deque
import matplotlib.pyplot as plt

# === CONFIG ===
BASE_DIR = "floorPlans"
OUT_DIR = "public"

# Global data structures (keyed by building_code for ALL_BUILDING_DATA)
ALL_BUILDING_DATA = {} # Stores grids, connections, etc. {b_code: {floor_num: {data...}}}
ROOM_COORDS = {}       # {room_id: [(b_code, floor, r, c), ...]}
STAIRS = {}            # {stair_name: {(b_code, floor): (r, c)}}
ENTRANCES = {}         # {entrance_label: [(b_code, floor, r, c), ...]}

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
        connections_path = os.path.join(floor_path, "connections.json") # NEW

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
                connections = json.load(f)

        # Coordinate conversion setup
        min_x, max_y, cell_size = meta["min_x"], meta["max_y"], meta["cell_size"]

        def to_grid_coords(x, y):
            """Convert DXF (x,y) to grid (row,col)"""
            col = int((x - min_x) / cell_size)
            row = int((max_y - y) / cell_size)
            return (row, col)
            
        # Process Labels
        floor_rooms = {}
        floor_stairs = {}
        floor_entrances = {} # New storage for entrance labels

        for item in raw_labels:
            label = item["label"].strip().lower()
            gx, gy = item["x"], item["y"]
            row, col = to_grid_coords(gx, gy)
            grid_coords = (row, col)

            if label.startswith("stairs"):
                stair_name = label.split()[-1].upper()
                floor_stairs.setdefault(stair_name, {})[floor_num] = grid_coords
            elif label.startswith("entrance"): # New entrance handling
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
            "connections": connections
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
    # Assumes a cost of 1000 to cross a connection (must be lower than actual path cost)
    building_penalty = 1000 if b_a != b_b else 0
    
    # Standard multi-floor heuristic (Manhattan distance + 10x floor difference)
    return abs(r_a - r_b) + abs(c_a - c_b) + 10 * abs(floor_a - floor_b) + building_penalty

def neighbors(state):
    b_code, floor, r, c = state
    
    # Check if building/floor data exists
    if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or floor not in ALL_BUILDING_DATA[b_code]["grids"]:
        return

    # --- CORRECTED GRID ACCESS ---
    grid = ALL_BUILDING_DATA[b_code]["grids"][floor] 
    # --- END CORRECTION ---

    floor_data = ALL_BUILDING_DATA[b_code][floor] # Original data used for connections/entrances
    rows, cols = grid.shape

    # --- 1. Same Floor / Same Building (Standard Movement) ---
    for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
        nr, nc = r+dr, c+dc
        if 0 <= nr < rows and 0 <= nc < cols and grid[nr, nc] == 0:
            yield (b_code, floor, nr, nc) 

    # --- 2. Stair connections (Within the same building) ---
    for stair_name, floor_map in STAIRS.items():
        # Check if the current state is one of the stair points
        if floor_map.get((b_code, floor)) == (r, c):
            for (other_b_code, other_floor), pos in floor_map.items():
                # If same building, different floor:
                if other_b_code == b_code and other_floor != floor:
                    yield (b_code, other_floor, pos[0], pos[1])

    # --- 3. Cross-Building Connections (Entrance Portals) ---
    conn_data = floor_data.get("connections", {})
    
    if conn_data:
        # Check all connections defined for this floor
        for i, (current_entrance_label, connected_entrance_label) in enumerate(conn_data.get("connectedEntrances", [])):
            
            # Find the grid coordinates for the current building's entrance name on this floor
            entrance_coords_list = floor_data["entrances"].get(current_entrance_label.lower(), [])
            
            # Check if the current (r, c) matches one of the registered entrance points
            # The list stores (floor_num, (r, c)) pairs from load_floor_data
            if (floor, (r, c)) in [(f, (r_coord, c_coord)) for f, (r_coord, c_coord) in entrance_coords_list]:
                
                # Determine the destination state
                dest_b_code = conn_data["connectedBuildings"][i]
                dest_floor_str = conn_data["connectedFloors"][i]
                
                try:
                    dest_floor = int(dest_floor_str[1:])
                except ValueError: continue

                # Look up the destination entrance point in the destination building
                dest_entrance_locs = ENTRANCES.get(connected_entrance_label.lower(), [])
                
                # Find the specific destination point (b_code, floor, r, c)
                dest_point = next(((b, f, row, col) for b, f, row, col in dest_entrance_locs 
                                 if b == dest_b_code and f == dest_floor), None)
                
                if dest_point:
                    # Neighbor is the connected entrance in the other building/floor
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
            # Cost of movement is 1 for adjacent cell, or 1 for floor/building change
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
    
    # --- CORRECTED GRID ACCESS ---
    if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or floor not in ALL_BUILDING_DATA[b_code]["grids"]:
        return state # Cannot snap if data is missing
    grid = ALL_BUILDING_DATA[b_code]["grids"][floor]
    # --- END CORRECTION ---
    
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
                    return (b_code, floor, nr, nc) # Return 4-tuple state
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
    out_path = os.path.join(OUT_DIR, "final_path.json")
    
    # Convert tuples to list of lists for JSON serialization
    path_list = [list(step) for step in smoothed_path]
    
    with open(out_path, "w") as f:
        json.dump(path_list, f, indent=2)
    print(f"Saved final path array to {out_path}")


def visualize_path(path, start, goal):
    """
    Visualizes only the path segments on a truly transparent background for all 
    involved buildings/floors, saving only the path and markers as an overlay.
    """
    os.makedirs(OUT_DIR, exist_ok=True)
    
    # Define numeric values for visualization
    TRANSPARENT_BG = 0 
    PATH_VALUE = 1       
    START_VALUE = 2      
    GOAL_VALUE = 3       

    # --- Custom Colormap for Transparency ---
    colors = [
        [0, 0, 0, 0],       # Transparent for BACKGROUND_COLOR (value 0)
        [0.1, 0.8, 0.1, 1], # Green for PATH_VALUE (value 1)
        [1, 0, 0, 1],       # Red for START_VALUE (value 2)
        [0, 0, 1, 1]        # Blue for GOAL_VALUE (value 3)
    ]
    custom_cmap = plt.cm.colors.ListedColormap(colors)
    bounds = [0, 1, 2, 3, 4] 
    norm = plt.cm.colors.BoundaryNorm(bounds, custom_cmap.N)
    # --- End Custom Colormap ---

    # --- Marker Size Configuration ---
    # This determines the "radius" or extent of the custom markers
    marker_size = 5 # A size of 1 means a 3x3 square/cross; 2 means 5x5, etc.
    # --- End Marker Size Configuration ---

    # Determine all buildings and floors needed for visualization
    required_viz = set((b, f) for b, f, _, _ in path)
    
    # Structure to hold all coordinates to be colored for each (b_code, floor)
    path_by_map = {map_id: [] for map_id in required_viz}
    
    for i in range(len(path) - 1):
        p1 = path[i]
        p2 = path[i+1]
        
        # If segment is a map change (stair/entrance transition)
        if (p1[0], p1[1]) != (p2[0], p2[1]):
            path_by_map[(p1[0], p1[1])].append((p1[2], p1[3]))
            path_by_map[(p2[0], p2[1])].append((p2[2], p2[3]))
            continue
            
        # If same map, draw the line segment between key points
        b_code, floor = p1[0], p1[1]
        line_points_rc = get_points_on_line(p1, p2) 

        for r, c in line_points_rc:
            path_by_map[(b_code, floor)].append((r, c))
            
    
    # 2. Iterate through each map and draw the stored path
    for (b_code, floor), coords in path_by_map.items():
        if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or floor not in ALL_BUILDING_DATA[b_code]["grids"]:
            continue
            
        grid_dimensions = ALL_BUILDING_DATA[b_code]["grids"][floor].shape
        rows, cols = grid_dimensions[0], grid_dimensions[1]
        
        vis = np.full((rows, cols), TRANSPARENT_BG, dtype=int)
        
        for r, c in coords:
            if 0 <= r < vis.shape[0] and 0 <= c < vis.shape[1]:
                vis[r, c] = PATH_VALUE # Path color

        # --- Draw Larger Start Marker (Circle/Cross Shape) ---
        if (b_code, floor) == (start[0], start[1]):
            start_r, start_c = start[2], start[3]
            for dr in range(-marker_size, marker_size + 1):
                for dc in range(-marker_size, marker_size + 1):
                    nr, nc = start_r + dr, start_c + dc
                    # Draw a circular shape by checking distance from center
                    if 0 <= nr < rows and 0 <= nc < cols and (dr**2 + dc**2) <= marker_size**2:
                        vis[nr, nc] = START_VALUE 

        # --- Draw Larger Goal Marker (Triangle/Arrow Shape) ---
        if (b_code, floor) == (goal[0], goal[1]):
            goal_r, goal_c = goal[2], goal[3]
            for dr in range(-marker_size, marker_size + 1):
                for dc in range(-marker_size, marker_size + 1):
                    nr, nc = goal_r + dr, goal_c + dc
                    # Draw an arrow/triangle shape pointing "up" (decreasing row index)
                    # This is a simple approximation; can be made more sophisticated.
                    if 0 <= nr < rows and 0 <= nc < cols:
                        # Simple triangle: more pixels at the bottom, fewer at the top
                        # e.g., for marker_size=2:
                        # (0,0) center
                        # (-2,-2) (-2,-1) (-2,0) (-2,1) (-2,2)
                        # (-1,-1) (-1,0) (-1,1)
                        # (0,0)
                        if dr <= 0 and abs(dc) <= (marker_size + dr): # Inverted for typical grid rendering
                             vis[nr, nc] = GOAL_VALUE


        # --- Matplotlib Plotting & Saving ---
        plt.figure(figsize=(8, 8 * (rows / cols)), facecolor='none') 
        
        plt.imshow(vis, cmap=custom_cmap, norm=norm, interpolation='nearest') 
        
        plt.axis('off') 
        
        out_path = os.path.join(OUT_DIR, f"{b_code}_floor{floor}_path_overlay.png")
        plt.savefig(out_path, transparent=True, bbox_inches='tight', pad_inches=0) 
        plt.close()

def is_line_of_sight(p1, p2):
    """
    Checks if there is a straight-line path between two grid points (p1 and p2)
    without hitting any walls (grid cell value != 0).
    p1, p2 are 4-tuple states, only works if p1[0] == p2[0] and p1[1] == p2[1].
    """
    b_code, f1, r1, c1 = p1
    b_code_2, f2, r2, c2 = p2
    
    # Must be on the same floor/building
    if b_code != b_code_2 or f1 != f2:
        return False
    
    # --- CORRECTED GRID ACCESS ---
    if b_code not in ALL_BUILDING_DATA or "grids" not in ALL_BUILDING_DATA[b_code] or f1 not in ALL_BUILDING_DATA[b_code]["grids"]:
        return False # Cannot check sight if data is missing
    grid = ALL_BUILDING_DATA[b_code]["grids"][f1]
    # --- END CORRECTION ---
    
    # Simple check: If the distance is only 1, it's already a neighbor move (and free)
    if abs(r1 - r2) + abs(c1 - c2) <= 1:
        return True

    dr = abs(r2 - r1)
    dc = abs(c2 - c1)
    s_r = 1 if r1 < r2 else -1
    s_c = 1 if c1 < c2 else -1
    
    r, c = r1, c1
    
    # Bresenham's line algorithm check
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
            # If line of sight is clear, skip the intermediate point path[i-1]
            continue
        else:
            # Obstacle, floor change, or building change: finalize the segment at path[i-1]
            # If it's a building/floor change, path[i-1] is the exit point.
            smoothed.append(path[i-1])
            start_node = path[i-1]
            
    # Always add the final node (goal)
    if smoothed[-1] != path[-1]:
        smoothed.append(path[-1])
        
    return smoothed


# === HELPER FUNCTIONS FOR MAIN LOGIC (MOVED TO GLOBAL SCOPE) ===

def _flatten_coords(loc):
    """This helper is now effectively superseded by the 4-tuple state, but remains."""
    # loc in the new structure is already a 4-tuple: (b_code, floor, r, c)
    return loc 

def get_stair_points():
    """Flattens the global STAIRS dictionary into a single list of (b_code, floor, r, c) tuples."""
    all_stair_coords = []
    for stair_name, floor_map in STAIRS.items():
        for (b_code, floor), (r, c) in floor_map.items():
            all_stair_coords.append((b_code, floor, r, c))
    return all_stair_coords

# =============================================================


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
    
    # --- 2. Load Data for ALL required buildings ---
    print(f"\n--- 1. Data Loading ---")

    global ALL_BUILDING_DATA, ROOM_COORDS, STAIRS, ENTRANCES
    
    required_buildings = set([start_building_code, goal_building_code])

    for b_code in required_buildings:
        print(f"Loading data for building {b_code}...")
        try:
            # Load the floor data for this building
            building_data = load_floor_data(BASE_DIR, b_code)
            
            # Store all data
            ALL_BUILDING_DATA[b_code] = {}
            ALL_BUILDING_DATA[b_code]["grids"] = {}
            for floor_num, data in building_data.items():
                
                # Store data by floor
                ALL_BUILDING_DATA[b_code][floor_num] = data
                ALL_BUILDING_DATA[b_code]["grids"][floor_num] = data["grid"]
                
                # Consolidate global ROOM_COORDS (now 4-tuple state: b_code, floor, r, c)
                for room_id, locations in data["rooms"].items():
                    ROOM_COORDS.setdefault(room_id, []).extend(
                        [(b_code, loc[0], loc[1][0], loc[1][1]) for loc in locations]
                    )

                # Consolidate global STAIRS
                for stair_name, floor_map in data["stairs"].items():
                    for floor, (r, c) in floor_map.items():
                        STAIRS.setdefault(stair_name, {})[(b_code, floor)] = (r, c)
                        
                # Consolidate global ENTRANCES
                for entrance_label, locations in data["entrances"].items():
                    ENTRANCES.setdefault(entrance_label, []).extend(
                        [(b_code, loc[0], loc[1][0], loc[1][1]) for loc in locations]
                    )

        except FileNotFoundError as e:
            print(f"Data loading failed for {b_code}: {e}")
            sys.exit(1)
            
    if not any(ALL_BUILDING_DATA[b]["grids"] for b in ALL_BUILDING_DATA):
        print(f"Could not load any floor data for the required buildings.")
        sys.exit(1)

    # --- 3. Validate and locate Start & Goal Rooms ---
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

    # --- 4. Select Closest Label Pair and Prepare States ---
    # The A* state is now a 4-tuple: (b_code, floor, r, c)
    print(f"\n--- 2. Pair Selection Debug ---")
    
    # Filter global room coords to only include the correct building
    start_locations = [loc for loc in ROOM_COORDS[start_room_num] if loc[0] == start_building_code]
    goal_locations = [loc for loc in ROOM_COORDS[goal_room_num] if loc[0] == goal_building_code]
    
    all_stair_coords = get_stair_points()
    STAIR_PENALTY = 10 

    best_start_flat = None
    best_goal_flat = None
    min_cost = float('inf')

    print(f"\n--- Running Cost Comparison ({len(start_locations)}x{len(goal_locations)} checks) ---")
    for s_flat in start_locations:
        for g_flat in goal_locations:
            
            s_b, s_floor = s_flat[0], s_flat[1]
            g_b, g_floor = g_flat[0], g_flat[1]
            
            cost = heuristic(s_flat, g_flat) # Heuristic already includes building/floor penalty
            
            if cost < min_cost:
                min_cost = cost
                best_start_flat = s_flat
                best_goal_flat = g_flat

    # Check if a pair was found
    if not best_start_flat or not best_goal_flat:
        print("Error: Could not determine start/goal points from labels.")
        sys.exit(1)

    # 5. Use the closest pair for pathfinding
    start = snap_to_free(best_start_flat)
    goal = snap_to_free(best_goal_flat)

    print(f"\n--- 3. Final Selection ---")
    print(f"Start room {start_room_num} -> Final Grid {start}")
    print(f"Goal room {goal_room_num} -> Final Grid {goal}")

    # --- 6. Run pathfinding ---
    path = astar_multi_floor(start, goal)
    
    if not path:
        print("No path found!")
        sys.exit(1)

    print(f"\n--- 4. Path Results ---")
    print(f"Raw path found: {len(path)} steps")
    
    # Smooth the path and save the array
    smoothed_path = smooth_path(path)
    save_path_array(smoothed_path) 
    
    print(f"Smoothed path: {len(smoothed_path)} key steps")

    # Visualize the path
    visualize_path(smoothed_path, start, goal)

    if len(smoothed_path) > 20:
        print("First 10 smoothed path states:", smoothed_path[:10], "...")
    else:
        print("Full smoothed path:", smoothed_path)


if __name__ == "__main__":
    main()