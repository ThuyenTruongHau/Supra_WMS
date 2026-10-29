"""Route graph / A* tests: synthetic graphs and map ZIPs read-only; no DB, Redis or robot calls."""

import itertools
import json
import math
import os
import random
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="map-route-test",
)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.main  # noqa: F401  registers every model on Base.metadata
from app.core.database import Base, get_db
from app.core.dependencies import get_current_user
from app.modules.warehouse.location_map import location_api
from app.modules.warehouse.location_map import map_graph_service as map_graph_module
from app.modules.warehouse.location_map.map_route_algo import (
    RouteError,
    RouteUnreachableError,
    astar,
    build_graph,
    dijkstra_distances,
    plan_route,
)

MAP_DIR = Path(__file__).resolve().parents[1] / "app" / "static" / "warehouse_maps"


def make_map(nodes, lines):
    """nodes: (key, x, y, type, name); lines: (from, to) or (from, to, path)."""
    return {
        "nodeKeys": ["x", "y", "type", "content", "name", "isTurn", "shelfIsTurn", "extraTypes"],
        "lineKeys": ["from", "to", "leftWidth", "rightWidth", "startExpandDistance",
                     "endExpandDistance", "path"],
        "nodeArr": [[x, y, t, k, name, 0, 1, []] for k, x, y, t, name in nodes],
        "lineArr": [[ln[0], ln[1], 1500, 1500, 600, 600, ln[2] if len(ln) > 2 else []]
                    for ln in lines],
    }


def both_ways(*pairs):
    return [p for a, b in pairs for p in ((a, b), (b, a))]


# Corridor A-B-C-D (y=0), shelf S1 above B, S2 above C and S3 behind S2 (only via S2).
# S1-S2 is a 2000 mm detour. Z only has an outgoing edge, so nothing can reach it.
#   S3 (2000,2000)
#   S1 (1000,1000)  S2 (2000,1000)
#   A(0,0) - B(1000,0) - C(2000,0) - D(3000,0)
S1_S2_PATH = [[1000, 1000], [1000, 1500], [2000, 1500], [2000, 1000]]
GRID = make_map(
    [
        ("A", 0, 0, 0, "A"), ("B", 1000, 0, 0, "B"), ("C", 2000, 0, 0, "C"),
        ("D", 3000, 0, 0, "D"), ("Z", 0, 1000, 0, "Z"),
        ("S1", 1000, 1000, 12, "R1_C1_L1_BG001"), ("S2", 2000, 1000, 12, "R1_C2_L1_BG002"),
        ("S3", 2000, 2000, 12, "R1_C3_L1_BG003"),
    ],
    both_ways(("A", "B"), ("B", "C"), ("C", "D"), ("B", "S1"), ("C", "S2"), ("S2", "S3"))
    + [("S1", "S2", S1_S2_PATH), ("S2", "S1", S1_S2_PATH[::-1]), ("Z", "A")],
)


class GraphBuildTests(unittest.TestCase):
    def test_build_uses_keys_polyline_and_direction(self):
        data = make_map(
            [("A", 0, 0, 0, "A"), ("B", 1000, 0, 0, "B")],
            [("A", "B", [[0, 0], [0, 500], [1000, 500], [1000, 0]]), ("X", "A")],
        )
        g = build_graph(1, "src", data)
        self.assertEqual(g.graph["A"], [("B", 2000.0)])
        self.assertEqual(g.graph["B"], [])
        self.assertEqual(g.one_way_edge_count, 1)

    def test_resolve_by_code_or_name(self):
        g = build_graph(1, "src", GRID)
        self.assertEqual(g.resolve_node("S2"), "S2")
        self.assertEqual(g.resolve_node("r1_c2_l1_bg002"), "S2")
        with self.assertRaises(RouteError):
            g.resolve_node("NOPE")


class AStarTests(unittest.TestCase):
    def setUp(self):
        self.g = build_graph(1, "src", GRID)
        self.shelves = frozenset(self.g.shelf_nodes)

    def test_shortest_path_free(self):
        nodes, dist, _ = astar(self.g, "A", "D")
        self.assertEqual(nodes, ["A", "B", "C", "D"])
        self.assertAlmostEqual(dist, 3000)

    def test_shelf_pass_through_by_default_blockable_on_request(self):
        # Corridor A->B is a long detour (4800); the shortcut goes through shelf S (~3007).
        g = build_graph(1, "src", make_map(
            [("A", 0, 0, 0, "A"), ("B", 3000, 0, 0, "B"), ("S", 1500, 100, 12, "S")],
            both_ways(("A", "S"), ("S", "B")) + [("A", "B", [[0, 0], [0, 900], [3000, 900], [3000, 0]])],
        ))
        free, d_free, _ = astar(g, "A", "B")
        self.assertEqual(free, ["A", "S", "B"])
        nodes, dist, _ = astar(g, "A", "B", frozenset(g.shelf_nodes))
        self.assertEqual(nodes, ["A", "B"])
        self.assertGreater(dist, d_free)

    def test_adjacent_shelf_is_allowed_from_a_shelf(self):
        nodes, dist, _ = astar(self.g, "S1", "S2", self.shelves)
        self.assertEqual(nodes, ["S1", "S2"])
        self.assertAlmostEqual(dist, 2000)
        self.assertIsNone(astar(self.g, "S1", "S3", self.shelves)[0])

    def test_unreachable_without_incoming_edge(self):
        nodes, dist, _ = astar(self.g, "A", "Z")
        self.assertIsNone(nodes)
        self.assertEqual(dist, math.inf)
        self.assertIsNotNone(astar(self.g, "Z", "D")[0])

    def test_shelf_only_reachable_through_shelf_is_unreachable(self):
        nodes, dist, _ = astar(self.g, "A", "S3", self.shelves)
        self.assertIsNone(nodes)
        self.assertEqual(dist, math.inf)
        self.assertIsNotNone(astar(self.g, "A", "S3")[0])

    def test_one_way_edge(self):
        g = build_graph(1, "src", make_map(
            [("A", 0, 0, 0, "A"), ("B", 1000, 0, 0, "B"), ("C", 0, 5000, 0, "C")],
            [("A", "B"), ("B", "C"), ("C", "A")],
        ))
        self.assertEqual(astar(g, "A", "B")[0], ["A", "B"])
        self.assertEqual(astar(g, "B", "A")[0], ["B", "C", "A"])

    def test_matches_dijkstra_on_random_graph(self):
        rng = random.Random(7)
        nodes = [(f"N{i}", rng.randint(0, 20000), rng.randint(0, 20000),
                  12 if i % 5 == 0 else 0, f"N{i}") for i in range(80)]
        lines = [(f"N{rng.randrange(80)}", f"N{rng.randrange(80)}") for _ in range(260)]
        g = build_graph(1, "src", make_map(nodes, lines))
        for _ in range(200):
            a, b = f"N{rng.randrange(80)}", f"N{rng.randrange(80)}"
            for blocked in (frozenset(), frozenset(g.shelf_nodes)):
                _, dist, _ = astar(g, a, b, blocked)
                expected = dijkstra_distances(g, a, [b], blocked)[b]
                if expected == math.inf:
                    self.assertEqual(dist, math.inf)
                else:
                    self.assertAlmostEqual(dist, expected, places=6)


class PlanRouteTests(unittest.TestCase):
    def setUp(self):
        self.g = build_graph(1, "src", GRID)

    def test_ordered_waypoints_follow_given_order(self):
        res = plan_route(self.g, "A", "A", ["S2", "S1"])
        self.assertEqual(res["visit_order"], ["A", "S2", "S1", "A"])
        self.assertEqual(res["algorithm"], "ordered")
        self.assertAlmostEqual(res["total_distance_mm"], 3000 + 2000 + 2000)
        self.assertEqual(res["polyline"][0], [0.0, 0.0])
        self.assertEqual(res["polyline"][-1], [0.0, 0.0])

    def test_optimize_order_matches_brute_force(self):
        rng = random.Random(3)
        nodes = [(f"N{i}", rng.randint(0, 9000), rng.randint(0, 9000), 0, f"N{i}")
                 for i in range(40)]
        lines = both_ways(*[(f"N{i}", f"N{i + 1}") for i in range(39)])
        lines += [(f"N{rng.randrange(40)}", f"N{rng.randrange(40)}") for _ in range(60)]
        g = build_graph(1, "src", make_map(nodes, lines))
        waypoints = ["N5", "N33", "N12", "N27", "N20", "N8"]
        res = plan_route(g, "N0", "N39", waypoints, optimize_order=True)
        self.assertEqual(res["algorithm"], "held_karp")
        best = min(
            sum(astar(g, a, b)[1] for a, b in zip(["N0", *perm], [*perm, "N39"]))
            for perm in itertools.permutations(waypoints)
        )
        self.assertAlmostEqual(res["total_distance_mm"], round(best, 1), places=1)

    def test_heuristic_order_for_many_waypoints(self):
        nodes = [(f"N{i}", i * 1000, 0, 0, f"N{i}") for i in range(30)]
        g = build_graph(1, "src", make_map(nodes, both_ways(*[(f"N{i}", f"N{i + 1}") for i in range(29)])))
        waypoints = [f"N{i}" for i in (17, 3, 25, 9, 1, 21, 13, 5, 27, 11, 19, 7, 23, 15)]
        res = plan_route(g, "N0", "N29", waypoints, optimize_order=True)
        self.assertEqual(res["algorithm"], "nearest_neighbor_2opt")
        self.assertAlmostEqual(res["total_distance_mm"], 29000)

    def test_unreachable_and_invalid(self):
        res = plan_route(self.g, "A", "S3")
        self.assertEqual(res["nodes"], ["A", "B", "C", "S2", "S3"])
        with self.assertRaises(RouteUnreachableError):
            plan_route(self.g, "A", "Z")
        with self.assertRaises(RouteUnreachableError):
            plan_route(self.g, "A", "D", ["Z", "S1"], optimize_order=True)
        with self.assertRaises(RouteUnreachableError):
            plan_route(self.g, "A", "S3", avoid_shelf_transit=True)
        with self.assertRaises(RouteError):
            plan_route(self.g, "A", "NOPE")
        with self.assertRaises(RouteError):
            plan_route(self.g, "A", "D", ["B"] * 51)


class RouteApiTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(location_api.router, prefix="/api/v1")
        admin = SimpleNamespace(roles=[SimpleNamespace(name="admin", permissions=[])], warehouses=[])
        self.app.dependency_overrides[get_current_user] = lambda: admin
        self.app.dependency_overrides[get_db] = lambda: object()
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.graph = build_graph(1, "static/warehouse_maps/warehouse_1/x", GRID)
        patcher = patch.object(location_api.map_graph_service, "get",
                               side_effect=lambda wid: self.graph if wid == 1 else None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_route_and_summary(self):
        res = self.client.post("/api/v1/warehouse-maps/1/route",
                               json={"start": "A", "end": "R1_C2_L1_BG002", "waypoints": ["S1"]})
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["visit_order"], ["A", "S1", "S2"])
        self.assertEqual(body["nodes"], ["A", "B", "S1", "S2"])
        self.assertFalse(body["avoid_shelf_transit"])
        summary = self.client.get("/api/v1/warehouse-maps/1/graph").json()
        self.assertEqual((summary["node_count"], summary["shelf_node_count"]), (8, 3))

    def test_error_codes(self):
        url = "/api/v1/warehouse-maps/{}/route"
        self.assertEqual(self.client.post(url.format(2), json={"start": "A", "end": "D"}).status_code, 404)
        self.assertEqual(self.client.post(url.format(1), json={"start": "A", "end": "NOPE"}).status_code, 400)
        self.assertEqual(self.client.post(url.format(1), json={"start": "A", "end": "S3"}).status_code, 200)
        self.assertEqual(self.client.post(url.format(1), json={"start": "A", "end": "Z"}).status_code, 422)
        self.assertEqual(self.client.post(url.format(1), json={"start": "A", "end": "S3",
                                                               "avoid_shelf_transit": True}).status_code, 422)
        self.assertEqual(self.client.post(url.format(1), json={"start": "A"}).status_code, 422)


class DistanceApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        tables = Base.metadata.tables
        self.db.execute(insert(tables["warehouse"]).values(id=1, code="W1", name="W1"))
        rows = [
            (1, "A", None, None, True), (2, "S2", None, None, True), (3, "S3", None, None, True),
            (4, "OLD-D", 3000, 0, True), (5, "OFFMAP", 9999, 9999, True), (6, "S1", None, None, False),
            (7, "Z", None, None, True),
        ]
        for ident, code, x, y, active in rows:
            self.db.execute(insert(tables["location"]).values(
                id=ident, location_code=code, location_name=code, warehouse_id=1,
                map_x=x, map_y=y, is_active=active))
        self.db.commit()

        self.app = FastAPI()
        self.app.include_router(location_api.router, prefix="/api/v1")
        admin = SimpleNamespace(roles=[SimpleNamespace(name="admin", permissions=[])], warehouses=[])
        self.app.dependency_overrides[get_current_user] = lambda: admin
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        graph = build_graph(1, "src", GRID)
        patcher = patch.object(map_graph_module.map_graph_service, "get",
                               side_effect=lambda wid: graph if wid == 1 else None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def distance(self, a, b, warehouse_id=1):
        return self.client.get(f"/api/v1/warehouse-maps/{warehouse_id}/distance",
                               params={"from_location_code": a, "to_location_code": b})

    def test_distance_through_connected_nodes(self):
        res = self.distance("A", "S2")
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertEqual(body["nodes"], ["A", "B", "C", "S2"])
        self.assertAlmostEqual(body["distance_mm"], 3000)
        self.assertAlmostEqual(body["distance_m"], 3.0)
        self.assertEqual(body["node_count"], 4)

    def test_location_resolved_by_map_coordinates(self):
        body = self.distance("A", "OLD-D").json()
        self.assertEqual(body["nodes"], ["A", "B", "C", "D"])
        self.assertAlmostEqual(body["distance_mm"], 3000)

    def test_same_location_is_zero(self):
        self.assertEqual(self.distance("S2", "S2").json()["distance_mm"], 0)

    def test_passes_through_shelf_nodes(self):
        body = self.distance("A", "S3").json()
        self.assertEqual(body["nodes"], ["A", "B", "C", "S2", "S3"])
        self.assertAlmostEqual(body["distance_mm"], 4000)

    def test_fail_cases(self):
        self.assertEqual(self.distance("A", "Z").status_code, 422)       # no edge leads to Z
        self.assertEqual(self.distance("A", "NOPE").status_code, 404)
        self.assertEqual(self.distance("A", "S1").status_code, 404)      # inactive location
        self.assertEqual(self.distance("A", "OFFMAP").status_code, 400)
        self.assertEqual(self.distance("A", "S2", warehouse_id=2).status_code, 404)
        self.assertEqual(self.client.get("/api/v1/warehouse-maps/1/distance",
                                         params={"from_location_code": "A"}).status_code, 422)


def _latest_map_zips():
    if not MAP_DIR.is_dir():
        return []
    result = []
    for folder in sorted(MAP_DIR.glob("warehouse_*")):
        files = [p for p in folder.iterdir() if p.is_file() and not p.name.endswith(".zip")]
        if files:
            result.append(max(files, key=lambda p: p.stat().st_mtime))
    return result


class MapZipPathTests(unittest.TestCase):
    def test_windows_separators_resolve_under_backend_root(self):
        from app.modules.warehouse.location_map.location_service import (
            BACKEND_ROOT,
            resolve_map_zip_path,
        )

        resolved = resolve_map_zip_path(
            r"static\warehouse_maps\warehouse_1\map.zip"
        )
        self.assertEqual(
            resolved,
            BACKEND_ROOT / "static" / "warehouse_maps" / "warehouse_1" / "map.zip",
        )
        self.assertNotIn("\\", resolved.name)


class RealMapTests(unittest.TestCase):
    def test_astar_matches_dijkstra_on_map_files(self):
        zips = _latest_map_zips()
        if not zips:
            self.skipTest("No map ZIP in static/warehouse_maps")
        for path in zips:
            with zipfile.ZipFile(path) as zf:
                name = next((n for n in ("compress/compress.json", "compress.json")
                             if n in zf.namelist()), None)
                if name is None:
                    continue
                data = json.loads(zf.read(name))
            g = build_graph(0, str(path), data)
            rng = random.Random(11)
            nodes = sorted(g.graph)
            shelves = frozenset(g.shelf_nodes)
            with self.subTest(map=path.parent.name):
                for _ in range(100):
                    a, b = rng.choice(nodes), rng.choice(nodes)
                    for blocked in (frozenset(), shelves):
                        _, dist, _ = astar(g, a, b, blocked)
                        expected = dijkstra_distances(g, a, [b], blocked)[b]
                        if expected == math.inf:
                            self.assertEqual(dist, math.inf)
                        else:
                            self.assertAlmostEqual(dist, expected, places=6)


if __name__ == "__main__":
    unittest.main()
