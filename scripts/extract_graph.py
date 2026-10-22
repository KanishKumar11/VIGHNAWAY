#!/usr/bin/env python3
"""Extract the Andheri road graph from OpenStreetMap for VIGHNAWAY.

Writes packages/scenario-data/andheri/graph.json (+ places.osm.json, flood-prone report and a
GeoJSON/HTML overlay for checking drift against the Google basemap). Follows BUILD_PROMPT
section 4, "Road graph preparation":

 1. osmnx graph for the Andheri bounding box, network type "all" (footways, footbridges and steps
    survive), simplified, largest connected component.
 2. Keeps the tags highway, oneway, junction, bridge, tunnel, layer, name, access, foot,
    motor_vehicle.
 3. Stable edge ids "u-v-key" from OSM node ids; one directed edge per travel direction, two-way
    roads produce two edges with reversed geometry.
 4. Edge coordinates are stored in the direction of travel.
 5./6. Access and speeds per profile are applied by the engine (packages/engine/src/rules.ts), so
    this script only keeps the tags.
 7. flood_prone = tunnels or negative layers under the railway, plus the way ids in
    andheri/flood-prone.json.
 8. graph.json carries graph_version (content hash); the API seeds PostGIS from the same file.
 9. Verification: connectivity per profile, the three named crossings present, and an overlay for
    a visual check at the crossings.

Usage (needs network access to the Overpass API):
    python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
    .venv/bin/python scripts/extract_graph.py            # writes graph.json
    .venv/bin/python scripts/extract_graph.py --check    # verification only, on an existing file

After extracting, re-run `pnpm --filter @vighnaway/scenario-data tune` and update the scenario
(event points, place node ids) for the real graph: the committed scenario was tuned on the
schematic fixture. Never hand-edit graph.json; change this script and re-run it.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "packages" / "scenario-data" / "andheri"
CONFIG = Path(__file__).resolve().parent / "andheri_config.json"

KEEP_TAGS = ["highway", "oneway", "junction", "bridge", "tunnel", "layer", "name", "access", "foot", "motor_vehicle"]

# Mirrors SCORING_RULES.access in packages/engine/src/rules.ts (used only for the connectivity check).
MOTOR_EXCLUDED = {"footway", "path", "pedestrian", "steps", "cycleway", "bridleway", "corridor", "platform", "elevator"}
FOOT_EXCLUDED = {"motorway", "motorway_link"}
YES = {"yes", "designated", "permissive"}


def first(value):
    """osmnx merges tags of simplified ways into lists; keep the first value."""
    if isinstance(value, list):
        return value[0] if value else None
    return value


def as_bool(value) -> bool:
    v = first(value)
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    return str(v).lower() not in {"no", "false", "0", ""}


def as_layer(value) -> int:
    v = first(value)
    try:
        return int(float(str(v).split(";")[0]))
    except (TypeError, ValueError):
        return 0


def as_text(value):
    v = first(value)
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else str(v)


def haversine(a, b) -> float:
    r = 6371008.8
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    dlat = lat2 - lat1
    dlng = math.radians(b[0] - a[0])
    s = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(s)))


def allowed(edge: dict, profile: str) -> bool:
    no_access = edge["access"] in {"no", "private"}
    if profile == "foot":
        if edge["foot"] == "no":
            return False
        if edge["foot"] in YES:
            return True
        if edge["highway"] in FOOT_EXCLUDED:
            return False
        return not no_access
    if edge["highway"] in MOTOR_EXCLUDED:
        return False
    if edge["motorVehicle"] in {"no", "private"}:
        return False
    if edge["motorVehicle"] in YES:
        return True
    return not no_access


def to_graph_json(G, rail_lines, flood_prone_way_ids: set[str], bbox) -> dict:
    """Converts an osmnx MultiDiGraph into the GraphFile format (packages/contracts graph.ts)."""
    from shapely.geometry import LineString

    nodes = []
    for nid, data in G.nodes(data=True):
        nodes.append({"id": str(nid), "lat": round(float(data["y"]), 7), "lng": round(float(data["x"]), 7)})
    nodes.sort(key=lambda n: n["id"])

    rail_union = None
    if rail_lines:
        from shapely.ops import unary_union

        rail_union = unary_union(rail_lines)

    edges = []
    for u, v, k, data in G.edges(keys=True, data=True):
        if "geometry" in data and data["geometry"] is not None:
            coords = [(float(x), float(y)) for x, y in data["geometry"].coords]
        else:
            coords = [(float(G.nodes[u]["x"]), float(G.nodes[u]["y"])), (float(G.nodes[v]["x"]), float(G.nodes[v]["y"]))]
        start = (float(G.nodes[u]["x"]), float(G.nodes[u]["y"]))
        # Store coordinates in the direction of travel (u -> v).
        if haversine(coords[0], start) > haversine(coords[-1], start):
            coords.reverse()
        coords = [[round(x, 7), round(y, 7)] for x, y in coords]
        length = sum(haversine(coords[i - 1], coords[i]) for i in range(1, len(coords)))
        way = first(data.get("osmid"))
        way_ids = data.get("osmid") if isinstance(data.get("osmid"), list) else [data.get("osmid")]
        highway = as_text(data.get("highway")) or "road"
        tunnel = as_text(data.get("tunnel")) not in {None, "no"}
        bridge = as_text(data.get("bridge")) not in {None, "no"}
        layer = as_layer(data.get("layer"))
        under_rail = False
        if (tunnel or layer < 0) and rail_union is not None:
            # ~25 m in degrees at Mumbai's latitude
            under_rail = LineString(coords).distance(rail_union) < 0.00025
        flood = under_rail or any(str(w) in flood_prone_way_ids for w in way_ids)
        edges.append(
            {
                "id": f"{u}-{v}-{k}",
                "from": str(u),
                "to": str(v),
                "reverseId": None,
                "wayId": str(way),
                "name": as_text(data.get("name")),
                "highway": highway,
                "oneway": as_bool(data.get("oneway")),
                "junction": as_text(data.get("junction")),
                "bridge": bridge,
                "tunnel": tunnel,
                "layer": layer,
                "access": as_text(data.get("access")),
                "foot": as_text(data.get("foot")),
                "motorVehicle": as_text(data.get("motor_vehicle")),
                "lengthM": round(length, 1),
                "floodProne": bool(flood),
                "geometry": coords,
            }
        )

    # Link reverse twins: the edge v->u with the same way and mirrored geometry.
    by_pair: dict[tuple[str, str], list[dict]] = {}
    for e in edges:
        by_pair.setdefault((e["from"], e["to"]), []).append(e)
    for e in edges:
        for cand in by_pair.get((e["to"], e["from"]), []):
            if cand["wayId"] == e["wayId"] and abs(cand["lengthM"] - e["lengthM"]) < 1.0:
                e["reverseId"] = cand["id"]
                break
    edges.sort(key=lambda e: e["id"])

    body = json.dumps({"nodes": nodes, "edges": edges}, sort_keys=True, separators=(",", ":"))
    version = "osm-" + hashlib.sha256(body.encode()).hexdigest()[:12]
    south, west, north, east = bbox
    return {
        "graphVersion": version,
        "source": "osm",
        "attribution": "Road data © OpenStreetMap contributors",
        "generatedBy": "scripts/extract_graph.py",
        "bbox": {"south": south, "west": west, "north": north, "east": east},
        "nodes": nodes,
        "edges": edges,
    }


def reachable(graph: dict, origin: str, profile: str) -> set[str]:
    adj: dict[str, list[str]] = {}
    for e in graph["edges"]:
        if not allowed(e, profile):
            continue
        adj.setdefault(e["from"], []).append(e["to"])
        if profile == "foot" and e["reverseId"] is None:
            adj.setdefault(e["to"], []).append(e["from"])
    seen = {origin}
    q = deque([origin])
    while q:
        n = q.popleft()
        for m in adj.get(n, []):
            if m not in seen:
                seen.add(m)
                q.append(m)
    return seen


def nearest_node(graph: dict, lat: float, lng: float) -> tuple[str, float]:
    best, best_d = None, float("inf")
    for n in graph["nodes"]:
        d = haversine((lng, lat), (n["lng"], n["lat"]))
        if d < best_d:
            best, best_d = n["id"], d
    return best, best_d


def verify(graph: dict, config: dict) -> list[str]:
    problems = []
    places = config["places"]
    origin = next(p for p in places if p["kind"] == "origin")
    o, od = nearest_node(graph, origin["lat"], origin["lng"])
    if od > 80:
        problems.append(f"origin snaps {od:.0f} m away; check its coordinates")
    for profile in ("car", "two_wheeler", "foot"):
        seen = reachable(graph, o, profile)
        for p in places:
            if p["kind"] == "origin":
                continue
            n, d = nearest_node(graph, p["lat"], p["lng"])
            if n not in seen:
                problems.append(f"{p['name']} not reachable from origin by {profile}")
    names = {e["name"] for e in graph["edges"] if e["name"]}
    for crossing in config["crossings"]:
        if not any(crossing["match"].lower() in n.lower() for n in names):
            problems.append(f"crossing '{crossing['label']}' not found (looked for name containing '{crossing['match']}')")
    if not any(e["floodProne"] for e in graph["edges"]):
        problems.append("no flood-prone edges; check tunnels under the railway and flood-prone.json")
    return problems


def write_overlay(graph: dict, config: dict) -> None:
    """GeoJSON + an HTML page that draws the graph over Google Maps for the drift check."""
    features = []
    for e in graph["edges"]:
        if e["reverseId"] is not None and e["id"] > e["reverseId"]:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"id": e["id"], "name": e["name"], "highway": e["highway"], "floodProne": e["floodProne"]},
                "geometry": {"type": "LineString", "coordinates": e["geometry"]},
            }
        )
    geo = {"type": "FeatureCollection", "features": features}
    (OUT_DIR / "graph.overlay.geojson").write_text(json.dumps(geo))
    crossings = json.dumps(config["crossings"])
    html = f"""<!doctype html><meta charset="utf-8"><title>Graph drift check</title>
<style>html,body,#m{{height:100%;margin:0}}#p{{position:absolute;top:8px;left:8px;background:#fff;padding:8px;font:14px sans-serif}}</style>
<div id="m"></div><div id="p">Graph over Google basemap. Crossings: <span id="c"></span></div>
<script>
const KEY = new URLSearchParams(location.search).get('key') || '';
const crossings = {crossings};
window.init = () => {{
  const map = new google.maps.Map(document.getElementById('m'), {{ center: {{lat: crossings[0].lat, lng: crossings[0].lng}}, zoom: 17 }});
  map.data.loadGeoJson('graph.overlay.geojson');
  map.data.setStyle(f => ({{ strokeColor: f.getProperty('floodProne') ? '#0284c7' : '#e11d48', strokeWeight: 3 }}));
  document.getElementById('c').innerHTML = crossings.map((c, i) => `<a href="#" data-i="${{i}}">${{c.label}}</a>`).join(' · ');
  document.getElementById('c').onclick = (ev) => {{ const c = crossings[ev.target.dataset.i]; if (c) {{ map.setCenter(c); map.setZoom(18); }} }};
}};
const s = document.createElement('script');
s.src = `https://maps.googleapis.com/maps/api/js?key=${{KEY}}&callback=init`;
document.head.appendChild(s);
</script>"""
    (OUT_DIR / "graph.overlay.html").write_text(html)


def write_places(graph: dict, config: dict) -> None:
    out = []
    for p in config["places"]:
        node, dist = nearest_node(graph, p["lat"], p["lng"])
        out.append(
            {
                "id": p["id"],
                "name": p["name"],
                "kind": p["kind"],
                "point": {"lat": p["lat"], "lng": p["lng"]},
                "nodeId": node,
                "side": p.get("side"),
                "address": p.get("address"),
                "_snapDistanceM": round(dist, 1),
            }
        )
    (OUT_DIR / "places.osm.json").write_text(json.dumps(out, indent=1) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="verify an existing graph.json only")
    parser.add_argument("--out", default=str(OUT_DIR / "graph.json"))
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text())

    if args.check:
        graph = json.loads(Path(args.out).read_text())
    else:
        import osmnx as ox

        ox.settings.useful_tags_way = KEEP_TAGS
        ox.settings.log_console = True
        south, west, north, east = config["bbox"]
        G = ox.graph_from_bbox((west, south, east, north), network_type="all", simplify=True, retain_all=False)
        G = ox.truncate.largest_component(G, strongly=False)
        try:
            rails = ox.features_from_bbox((west, south, east, north), tags={"railway": ["rail"]})
            rail_lines = [g for g in rails.geometry if g.geom_type in ("LineString", "MultiLineString")]
        except Exception as exc:  # no railway data is a verification failure, not a crash
            print(f"warning: could not load railway lines: {exc}", file=sys.stderr)
            rail_lines = []
        flood_ids = set(json.loads((OUT_DIR / "flood-prone.json").read_text()).get("osmWayIds", []))
        graph = to_graph_json(G, rail_lines, flood_ids, config["bbox"])
        Path(args.out).write_text(json.dumps(graph, separators=(",", ":")) + "\n")
        print(f"wrote {args.out}: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges, {graph['graphVersion']}")
        write_places(graph, config)

    write_overlay(graph, config)
    problems = verify(graph, config)
    for p in problems:
        print(f"CHECK FAILED: {p}")
    if not problems:
        print("checks passed: connectivity for car, two_wheeler and foot; crossings present; flood-prone edges found")
    print(f"open {OUT_DIR / 'graph.overlay.html'}?key=<browser key> to check drift at the crossings")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
