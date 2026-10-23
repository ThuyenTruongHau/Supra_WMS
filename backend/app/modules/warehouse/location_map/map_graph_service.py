"""In-memory route graph per warehouse, built from the active map ZIP."""

from __future__ import annotations

import threading
from typing import Optional

from sqlalchemy.orm import Session

from app.core.database import db_session
from app.core.logger import get_logger
from app.modules.warehouse.location_map.location_model import Location, WarehouseMap
from app.modules.warehouse.location_map.location_service import (
    SHELF_NODE_TYPES,
    _load_compress_json,
    resolve_map_zip_path,
)
from app.modules.warehouse.location_map.map_route_algo import (
    RouteError,
    WarehouseGraph,
    build_graph,
    travel_distance,
)

logger = get_logger("main")


class WarehouseMapGraphService:
    """Each process keeps its own copy; call reload() after the active map changes."""

    def __init__(self) -> None:
        self._graphs: dict[int, WarehouseGraph] = {}
        self._lock = threading.Lock()

    def load_all(self) -> int:
        with db_session() as db:
            rows = (
                db.query(WarehouseMap.warehouse_id, WarehouseMap.source)
                .filter(WarehouseMap.is_active.is_(True))
                .order_by(WarehouseMap.warehouse_id, WarehouseMap.id.desc())
                .all()
            )
        latest: dict[int, str] = {}
        for warehouse_id, source in rows:
            latest.setdefault(int(warehouse_id), source)
        loaded = 0
        for warehouse_id, source in latest.items():
            if self._load(warehouse_id, source) is not None:
                loaded += 1
        return loaded

    def reload(self, warehouse_id: int) -> Optional[WarehouseGraph]:
        with db_session() as db:
            row = (
                db.query(WarehouseMap.source)
                .filter(
                    WarehouseMap.warehouse_id == warehouse_id,
                    WarehouseMap.is_active.is_(True),
                )
                .order_by(WarehouseMap.id.desc())
                .first()
            )
        if row is None:
            with self._lock:
                self._graphs.pop(warehouse_id, None)
            logger.warning("No active map for warehouse_id=%s; route graph cleared", warehouse_id)
            return None
        return self._load(warehouse_id, row.source)

    def get(self, warehouse_id: int) -> Optional[WarehouseGraph]:
        graph = self._graphs.get(warehouse_id)
        if graph is not None:
            return graph
        return self.reload(warehouse_id)

    def _load(self, warehouse_id: int, source: str) -> Optional[WarehouseGraph]:
        try:
            data = _load_compress_json(resolve_map_zip_path(source))
            graph = build_graph(warehouse_id, source, data, SHELF_NODE_TYPES)
        except Exception:
            logger.exception("Load route graph failed warehouse_id=%s source=%s", warehouse_id, source)
            return None
        with self._lock:
            self._graphs[warehouse_id] = graph
        logger.info(
            "Route graph loaded warehouse_id=%s: %s nodes, %s edges (%s one-way), %s shelf nodes",
            warehouse_id,
            len(graph.graph),
            graph.edge_count,
            graph.one_way_edge_count,
            len(graph.shelf_nodes),
        )
        return graph


map_graph_service = WarehouseMapGraphService()


class MapDistanceNotFound(LookupError):
    """Warehouse has no route graph, or a location code does not exist in it."""


def _location_node(db: Session, graph: WarehouseGraph, warehouse_id: int, code: str) -> str:
    location = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.location_code == code,
            Location.is_active.is_(True),
        )
        .first()
    )
    if location is None:
        raise MapDistanceNotFound(f"Location code {code!r} not found in warehouse_id={warehouse_id}")
    if location.location_code in graph.node_coords:
        return location.location_code
    if location.map_x is not None and location.map_y is not None:
        node = graph.node_at(location.map_x, location.map_y)
        if node is not None:
            return node
    raise RouteError(f"Location code {code!r} is not on the active map")


def calculate_distance(
    db: Session,
    warehouse_id: int,
    from_location_code: str,
    to_location_code: str,
) -> dict:
    """Distance a robot travels between two locations through connected nodes (shelf nodes included)."""
    graph = map_graph_service.get(warehouse_id)
    if graph is None:
        raise MapDistanceNotFound(f"No route graph for warehouse_id={warehouse_id}")
    from_code = from_location_code.strip()
    to_code = to_location_code.strip()
    start = _location_node(db, graph, warehouse_id, from_code)
    goal = _location_node(db, graph, warehouse_id, to_code)
    result = travel_distance(graph, start, goal)
    return {
        "warehouse_id": warehouse_id,
        "from_location_code": from_code,
        "to_location_code": to_code,
        "distance_mm": result["distance_mm"],
        "distance_m": round(result["distance_mm"] / 1000, 3),
        "node_count": len(result["nodes"]),
        "nodes": result["nodes"],
    }
