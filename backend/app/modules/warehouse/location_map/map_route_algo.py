"""Warehouse map graph and route algorithms (pure: no DB, Redis or FastAPI)."""

from __future__ import annotations

import heapq
import itertools
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional

SHELF_NODE_TYPES = frozenset({1, 12})
EXACT_ORDER_MAX_WAYPOINTS = 12


class RouteError(ValueError):
    """Invalid route request (unknown point, too many waypoints...)."""


class RouteUnreachableError(RouteError):
    """No path along the map edges between two points."""


@dataclass
class WarehouseGraph:
    warehouse_id: int
    source: str
    loaded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # node -> [(neighbor, weight_mm)]; directed, as drawn in the map editor.
    graph: dict[str, list[tuple[str, float]]] = field(default_factory=dict)
    node_coords: dict[str, tuple[float, float]] = field(default_factory=dict)
    node_types: dict[str, int] = field(default_factory=dict)
    node_names: dict[str, str] = field(default_factory=dict)
    name_index: dict[str, str] = field(default_factory=dict)
    ambiguous_names: set[str] = field(default_factory=set)
    edge_paths: dict[tuple[str, str], list[tuple[float, float]]] = field(default_factory=dict)
    shelf_nodes: set[str] = field(default_factory=set)

    @property
    def edge_count(self) -> int:
        return sum(len(v) for v in self.graph.values())

    @property
    def one_way_edge_count(self) -> int:
        return sum(1 for a, b in self.edge_paths if (b, a) not in self.edge_paths)

    def resolve_node(self, point: str) -> str:
        """Map a node number (location_code) or display name to a node key."""
        text = str(point).strip()
        if text in self.node_coords:
            return text
        key = text.upper()
        if key in self.ambiguous_names:
            raise RouteError(f"Point {text!r} matches more than one map node")
        node = self.name_index.get(key)
        if node is None:
            raise RouteError(f"Point {text!r} not found on map")
        return node

    def node_at(self, x: float, y: float) -> Optional[str]:
        for node, (nx, ny) in self.node_coords.items():
            if nx == x and ny == y:
                return node
        return None


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _polyline_length(points: list[tuple[float, float]]) -> float:
    return sum(_distance(p, q) for p, q in zip(points, points[1:]))


def build_graph(
    warehouse_id: int,
    source: str,
    data: dict,
    shelf_types: frozenset[int] = SHELF_NODE_TYPES,
) -> WarehouseGraph:
    """Build the graph from a Roboshop ``compress.json`` payload."""
    try:
        nk = {k: i for i, k in enumerate(data["nodeKeys"])}
        lk = {k: i for i, k in enumerate(data["lineKeys"])}
        for col in ("x", "y", "type", "content", "name"):
            nk[col]
        for col in ("from", "to"):
            lk[col]
    except KeyError as e:
        raise ValueError(f"Invalid compress.json: missing key {e.args[0]}") from e

    g = WarehouseGraph(warehouse_id=warehouse_id, source=source)

    for node in data.get("nodeArr") or []:
        key = str(node[nk["content"]]).strip()
        x, y = node[nk["x"]], node[nk["y"]]
        if not key or x is None or y is None:
            continue
        g.node_coords[key] = (float(x), float(y))
        node_type = int(node[nk["type"]])
        g.node_types[key] = node_type
        name = str(node[nk["name"]] or "").strip()
        g.node_names[key] = name
        g.graph.setdefault(key, [])
        if node_type in shelf_types:
            g.shelf_nodes.add(key)
        if name and name != key:
            upper = name.upper()
            if upper in g.name_index and g.name_index[upper] != key:
                g.ambiguous_names.add(upper)
            g.name_index.setdefault(upper, key)

    path_col = lk.get("path")
    for line in data.get("lineArr") or []:
        start = str(line[lk["from"]]).strip()
        end = str(line[lk["to"]]).strip()
        if start not in g.node_coords or end not in g.node_coords or start == end:
            continue
        a, b = g.node_coords[start], g.node_coords[end]
        raw_path = line[path_col] if path_col is not None else None
        points = [(float(p[0]), float(p[1])) for p in raw_path or [] if len(p) >= 2]
        if len(points) < 2:
            points = [a, b]
        # Never shorter than the straight line, so the A* heuristic stays admissible.
        weight = max(_polyline_length(points), _distance(a, b))
        if weight <= 0:
            continue
        if (start, end) in g.edge_paths:
            neighbors = g.graph[start]
            for i, (nxt, w) in enumerate(neighbors):
                if nxt == end and weight < w:
                    neighbors[i] = (end, weight)
                    g.edge_paths[(start, end)] = points
            continue
        g.graph[start].append((end, weight))
        g.edge_paths[(start, end)] = points

    return g


def _blocked_nodes(g: WarehouseGraph, avoid_shelf_transit: bool) -> frozenset[str]:
    return frozenset(g.shelf_nodes) if avoid_shelf_transit else frozenset()


def astar(
    g: WarehouseGraph,
    start: str,
    goal: str,
    blocked: Iterable[str] = frozenset(),
) -> tuple[Optional[list[str]], float, int]:
    """Shortest path along edges. Blocked nodes may be the goal but never a pass-through.

    Returns (nodes, distance_mm, expanded_nodes); nodes is None when unreachable.
    """
    if start == goal:
        return [start], 0.0, 0
    blocked = blocked if isinstance(blocked, (set, frozenset)) else frozenset(blocked)
    goal_xy = g.node_coords[goal]
    coords = g.node_coords

    def h(node: str) -> float:
        return _distance(coords[node], goal_xy)

    counter = itertools.count()
    open_heap: list[tuple[float, int, float, str]] = [(h(start), next(counter), 0.0, start)]
    best = {start: 0.0}
    parent: dict[str, str] = {}
    expanded = 0
    while open_heap:
        _, _, cost, node = heapq.heappop(open_heap)
        if cost > best.get(node, math.inf):
            continue
        if node == goal:
            path = [goal]
            while path[-1] != start:
                path.append(parent[path[-1]])
            path.reverse()
            return path, cost, expanded
        expanded += 1
        for nxt, weight in g.graph.get(node, ()):
            if nxt in blocked and nxt != goal:
                continue
            new_cost = cost + weight
            if new_cost < best.get(nxt, math.inf):
                best[nxt] = new_cost
                parent[nxt] = node
                heapq.heappush(open_heap, (new_cost + h(nxt), next(counter), new_cost, nxt))
    return None, math.inf, expanded


def dijkstra_distances(
    g: WarehouseGraph,
    source: str,
    targets: Iterable[str],
    blocked: Iterable[str] = frozenset(),
) -> dict[str, float]:
    """Distances from source to every target; blocked nodes are reachable but not expanded."""
    blocked = blocked if isinstance(blocked, (set, frozenset)) else frozenset(blocked)
    remaining = set(targets)
    result = {t: math.inf for t in remaining}
    best = {source: 0.0}
    heap: list[tuple[float, str]] = [(0.0, source)]
    while heap and remaining:
        cost, node = heapq.heappop(heap)
        if cost > best.get(node, math.inf):
            continue
        if node in remaining:
            result[node] = cost
            remaining.discard(node)
        if node in blocked and node != source:
            continue
        for nxt, weight in g.graph.get(node, ()):
            new_cost = cost + weight
            if new_cost < best.get(nxt, math.inf):
                best[nxt] = new_cost
                heapq.heappush(heap, (new_cost, nxt))
    return result


def travel_distance(
    g: WarehouseGraph,
    start: str,
    goal: str,
    *,
    avoid_shelf_transit: bool = False,
) -> dict:
    """Travel distance start -> goal along connected map edges; fails if goal is not reachable."""
    nodes, distance, _ = astar(g, start, goal, _blocked_nodes(g, avoid_shelf_transit))
    if nodes is None:
        raise RouteUnreachableError(f"No connected path along map edges from {start} to {goal}")
    return {
        "distance_mm": round(distance, 1),
        "nodes": nodes,
    }


def _route_cost(order: list[int], dist: list[list[float]]) -> float:
    return sum(dist[a][b] for a, b in zip(order, order[1:]))


def _held_karp(dist: list[list[float]], k: int) -> list[int]:
    """Exact order for points 1..k between fixed start 0 and end k+1."""
    end = k + 1
    full = (1 << k) - 1
    dp: dict[tuple[int, int], float] = {}
    back: dict[tuple[int, int], int] = {}
    for j in range(k):
        dp[(1 << j, j)] = dist[0][j + 1]
    for mask in range(1, full + 1):
        for j in range(k):
            if not mask & (1 << j) or (mask, j) not in dp:
                continue
            base = dp[(mask, j)]
            if base == math.inf:
                continue
            for nxt in range(k):
                if mask & (1 << nxt):
                    continue
                state = (mask | (1 << nxt), nxt)
                cost = base + dist[j + 1][nxt + 1]
                if cost < dp.get(state, math.inf):
                    dp[state] = cost
                    back[state] = j
    best_cost, last = math.inf, None
    for j in range(k):
        cost = dp.get((full, j), math.inf) + dist[j + 1][end]
        if cost < best_cost:
            best_cost, last = cost, j
    if last is None:
        return [0, *range(1, k + 1), end]
    order: list[int] = []
    mask, j = full, last
    while True:
        order.append(j + 1)
        prev = back.get((mask, j))
        if prev is None:
            break
        mask, j = mask & ~(1 << j), prev
    order.reverse()
    return [0, *order, end]


def _nearest_neighbor_2opt(dist: list[list[float]], k: int) -> list[int]:
    end = k + 1
    unvisited = set(range(1, k + 1))
    order = [0]
    while unvisited:
        here = order[-1]
        nxt = min(unvisited, key=lambda j: dist[here][j])
        order.append(nxt)
        unvisited.discard(nxt)
    order.append(end)

    best = _route_cost(order, dist)
    improved = True
    while improved:
        improved = False
        for i in range(1, len(order) - 2):
            for j in range(i + 1, len(order) - 1):
                candidate = order[:i] + order[i:j + 1][::-1] + order[j + 1:]
                cost = _route_cost(candidate, dist)
                if cost < best - 1e-9:
                    order, best, improved = candidate, cost, True
    return order


def _join_polyline(g: WarehouseGraph, nodes: list[str], out: list[tuple[float, float]]) -> None:
    if not out:
        out.append(g.node_coords[nodes[0]])
    for a, b in zip(nodes, nodes[1:]):
        for point in g.edge_paths.get((a, b), [g.node_coords[a], g.node_coords[b]]):
            if out[-1] != point:
                out.append(point)


def plan_route(
    g: WarehouseGraph,
    start: str,
    end: str,
    waypoints: Optional[list[str]] = None,
    *,
    optimize_order: bool = False,
    avoid_shelf_transit: bool = False,
    include_polyline: bool = True,
    max_waypoints: int = 50,
) -> dict:
    """Route start -> waypoints -> end along map edges.

    optimize_order keeps start/end fixed and reorders the waypoints for the
    shortest total distance (exact up to EXACT_ORDER_MAX_WAYPOINTS).
    """
    began = time.perf_counter()
    waypoints = list(waypoints or [])
    if len(waypoints) > max_waypoints:
        raise RouteError(f"Too many waypoints: {len(waypoints)} > {max_waypoints}")

    points = [g.resolve_node(start), *(g.resolve_node(w) for w in waypoints), g.resolve_node(end)]
    blocked = _blocked_nodes(g, avoid_shelf_transit)
    k = len(waypoints)

    algorithm = "ordered"
    order = list(range(len(points)))
    if optimize_order and k >= 2:
        dist = [[math.inf] * len(points) for _ in points]
        for i, src in enumerate(points[:-1]):
            found = dijkstra_distances(g, src, set(points[1:]), blocked)
            for j, dst in enumerate(points):
                if j == 0:
                    continue
                dist[i][j] = 0.0 if src == dst else found.get(dst, math.inf)
        if k <= EXACT_ORDER_MAX_WAYPOINTS:
            order, algorithm = _held_karp(dist, k), "held_karp"
        else:
            order, algorithm = _nearest_neighbor_2opt(dist, k), "nearest_neighbor_2opt"
        if _route_cost(order, dist) == math.inf:
            unreachable = [
                f"{points[a]}->{points[b]}"
                for a, b in zip(order, order[1:])
                if dist[a][b] == math.inf
            ]
            raise RouteUnreachableError(
                "No path along map edges for: " + ", ".join(unreachable)
            )

    visit_order = [points[i] for i in order]
    segments: list[dict] = []
    route_nodes: list[str] = [visit_order[0]]
    polyline: list[tuple[float, float]] = []
    total = 0.0
    expanded_total = 0
    for a, b in zip(visit_order, visit_order[1:]):
        nodes, distance, expanded = astar(g, a, b, blocked)
        expanded_total += expanded
        if nodes is None:
            raise RouteUnreachableError(f"No path along map edges for: {a}->{b}")
        total += distance
        route_nodes.extend(nodes[1:])
        if include_polyline:
            _join_polyline(g, nodes, polyline)
        segments.append({
            "from_node": a,
            "to_node": b,
            "distance_mm": round(distance, 1),
            "nodes": nodes,
        })

    return {
        "warehouse_id": g.warehouse_id,
        "total_distance_mm": round(total, 1),
        "algorithm": algorithm,
        "avoid_shelf_transit": avoid_shelf_transit,
        "visit_order": visit_order,
        "visit_order_names": [g.node_names.get(n, "") for n in visit_order],
        "segments": segments,
        "nodes": route_nodes,
        "polyline": [[x, y] for x, y in polyline] if include_polyline else None,
        "expanded_nodes": expanded_total,
        "elapsed_ms": round((time.perf_counter() - began) * 1000, 3),
    }
