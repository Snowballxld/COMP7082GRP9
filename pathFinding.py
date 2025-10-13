#!/usr/bin/env python3
"""
Multi-floor pathfinder.py — floor files mapped internally
"""

import sys, os
import numpy as np
import heapq
from collections import deque
import matplotlib.pyplot as plt

OUT_DIR = "public"

# --- Grid files per floor ---
FLOOR_FILES = {
    1: "floorPlans/se06F1BasicPlan_grid_300x600.txt",
    2: "floorPlans/se06F2BasicPlan_grid_300x600.txt"
}

# --- Load grids automatically ---
def load_grid(path):
    g = np.loadtxt(path, dtype=int)
    if g.ndim == 1:
        g = g[np.newaxis, :]
    return g

FLOOR_GRIDS = {floor: load_grid(fname) for floor, fname in FLOOR_FILES.items()}

# --- ROOM_COORDS: (floor, (row, col)) ---
ROOM_COORDS = {
    102: (1, (84, 470)),
    104: (1, (84, 345)),
    106: (1, (84, 244)),
    108: (1, (84, 166)),
    112: (1, (59, 113)),
    103: (1, (207, 470)),
    105: (1, (207, 345)),
    107: (1, (207, 244)),
    109: (1, (207, 166)),
    114: (1, (235, 113)),

    202: (2, (83, 535)),
    204: (2, (83, 455)),
    206: (2, (83, 354)),
    208: (2, (83, 281)),
    210: (2, (83, 222)),
    203: (2, (200, 535)),
    205: (2, (200, 455)),
    207: (2, (200, 354)),
    209: (2, (200, 281)),
    230: (2, (86, 58)),
    238: (2, (154, 61))
}

# --- STAIRS connecting floors ---
STAIRS = {
    "A": {1: (24, 36), 2: (63, 115)},
    "B": {1: (140, 559), 2: (141, 576)}
}

# ---------------- helpers ----------------
def heuristic(a, b):
    floor_a, r_a, c_a = a
    floor_b, r_b, c_b = b
    return abs(r_a - r_b) + abs(c_a - c_b) + 10 * abs(floor_a - floor_b)

def neighbors(state):
    floor, r, c = state
    grid = FLOOR_GRIDS[floor]
    rows, cols = grid.shape

    # 4-way neighbors
    for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
        nr, nc = r+dr, c+dc
        if 0 <= nr < rows and 0 <= nc < cols and grid[nr, nc] == 0:
            yield (floor, nr, nc)

    # stairs
    for stair, floors in STAIRS.items():
        if floors.get(floor) == (r, c):
            other_floor = 3 - floor
            yield (other_floor, floors[other_floor][0], floors[other_floor][1])

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
    for floor in [1,2]:
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
        # plt.colorbar(ticks=[0,1,2,3,4], label='0=free,1=wall,2=path,3=start,4=goal')
        out_path = os.path.join(OUT_DIR, f"floor{floor}_path.png")
        plt.savefig(out_path)
        plt.close()

# ---------------- main ----------------
def main():
    if len(sys.argv) != 3:
        print("Usage: python pathfinder.py <start_floor,start_row,start_col> <goal_room>")
        sys.exit(1)

    start_str, room_str = sys.argv[1], sys.argv[2]
    room_num = int(room_str)

    if room_num not in ROOM_COORDS:
        print("Unknown room number")
        sys.exit(1)
    
    start_floor, start_r, start_c = [int(x) for x in start_str.split(',')]
    start = snap_to_free((start_floor, start_r, start_c))
    goal_floor, (goal_r, goal_c) = ROOM_COORDS[room_num]
    goal = snap_to_free((goal_floor, goal_r, goal_c))

    print(f"Start -> {start}   Goal -> {goal}")
    path = astar_multi_floor(start, goal)
    if not path:
        print("No path found!")
        sys.exit(1)

    print(f"Path found: {len(path)} steps")
    visualize_path(path, start, goal)
    print("First 10 path states:", path[:10], "..." if len(path) > 20 else "")

if __name__ == "__main__":
    main()
