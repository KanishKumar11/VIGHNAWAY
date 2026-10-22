"""Offline test of the conversion step with a hand-made osmnx-style graph (no network needed).
Run: python3 scripts/test_extract_graph.py (needs osmnx/networkx/shapely installed)."""
import json
import sys
from pathlib import Path

import networkx as nx
from shapely.geometry import LineString

sys.path.insert(0, str(Path(__file__).parent))
import extract_graph as eg  # noqa: E402

G = nx.MultiDiGraph()
G.add_node(1, x=72.840, y=19.110)
G.add_node(2, x=72.845, y=19.110)
G.add_node(3, x=72.845, y=19.115)
# two-way road 1<->2, geometry for the reverse stored reversed (as osmnx may)
G.add_edge(1, 2, 0, osmid=100, highway="primary", name="Test Road", oneway=False,
           geometry=LineString([(72.840, 19.110), (72.8425, 19.1102), (72.845, 19.110)]))
G.add_edge(2, 1, 0, osmid=100, highway="primary", name="Test Road", oneway=False,
           geometry=LineString([(72.840, 19.110), (72.8425, 19.1102), (72.845, 19.110)]))
# one-way tunnel under a railway 2->3
G.add_edge(2, 3, 0, osmid=[200, 201], highway=["secondary", "tertiary"], name="Test Subway", oneway=True,
           tunnel="yes", layer="-1")
rail = [LineString([(72.844, 19.1125), (72.846, 19.1125)])]
graph = eg.to_graph_json(G, rail, {"999"}, [19.1, 72.8, 19.2, 72.9])
e12 = next(e for e in graph["edges"] if e["id"] == "1-2-0")
e21 = next(e for e in graph["edges"] if e["id"] == "2-1-0")
e23 = next(e for e in graph["edges"] if e["id"] == "2-3-0")
assert e12["reverseId"] == "2-1-0" and e21["reverseId"] == "1-2-0", "twins linked"
assert e21["geometry"][0] == [72.845, 19.11], "geometry in travel direction"
assert e23["reverseId"] is None and e23["oneway"] is True
assert e23["floodProne"] is True and e23["tunnel"] is True and e23["layer"] == -1, e23
assert e23["highway"] == "secondary" and e23["wayId"] == "200"
assert graph["graphVersion"].startswith("osm-") and graph["source"] == "osm"
assert eg.reachable(graph, "3", "foot") == {"1", "2", "3"}, "foot walks one-way streets both ways"
assert eg.reachable(graph, "3", "car") == {"3"}
print("extract_graph conversion test passed:", json.dumps({k: graph[k] for k in ("graphVersion", "source")}))
