#!/usr/bin/env python3
"""Marks the OSM way ids listed in packages/scenario-data/andheri/flood-prone.json (osmWayIds) as
flood-prone in the committed graph.json, without Overpass access, and re-computes graphVersion with
the same formula as scripts/extract_graph.py. It only ever sets floodProne to true (the extractor's
own tunnel-under-railway rule is kept). It also applies hand-set fields from osmWayOverrides
(for example a name and tunnel=true for an underpass that OSM leaves unnamed), so run it after every
scripts/extract_graph.py. It then updates graphVersion in every scenario file that names it.

    python scripts/apply_flood_prone.py            # apply
    python scripts/apply_flood_prone.py --check    # exit 1 if graph.json does not match flood-prone.json

Re-running scripts/extract_graph.py with Overpass access produces the same flags, because it reads the
same osmWayIds.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "packages" / "scenario-data" / "andheri"
SCENARIOS = ["scenario.json", "scenario.live.json"]


def version_of(nodes, edges) -> str:
    body = json.dumps({"nodes": nodes, "edges": edges}, sort_keys=True, separators=(",", ":"))
    return "osm-" + hashlib.sha256(body.encode()).hexdigest()[:12]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    config = json.loads((DATA / "flood-prone.json").read_text(encoding="utf-8"))
    ways = {str(w) for w in config.get("osmWayIds", [])}
    overrides = {str(w): fields for w, fields in config.get("osmWayOverrides", {}).items()}
    graph_path = DATA / "graph.json"
    graph = json.loads(graph_path.read_text(encoding="utf-8"))

    missing = (ways | set(overrides)) - {e["wayId"] for e in graph["edges"]}
    if missing:
        print(f"error: way ids not in the graph: {sorted(missing)}", file=sys.stderr)
        return 1

    changed = 0
    for e in graph["edges"]:
        wanted = dict(overrides.get(e["wayId"], {}))
        if e["wayId"] in ways:
            wanted["floodProne"] = True
        diff = {k: v for k, v in wanted.items() if e.get(k) != v}
        if diff:
            changed += 1
            if not args.check:
                e.update(diff)
    if args.check:
        print(f"{changed} edge(s) differ from flood-prone.json" if changed else "graph.json matches flood-prone.json")
        return 1 if changed else 0
    if not changed:
        print("nothing to change")
        return 0

    old = graph["graphVersion"]
    graph["graphVersion"] = version_of(graph["nodes"], graph["edges"])
    graph_path.write_text(json.dumps(graph, separators=(",", ":")) + "\n", encoding="utf-8")
    for name in SCENARIOS:
        path = DATA / name
        text = path.read_text(encoding="utf-8")
        if old not in text:
            print(f"warning: {name} does not name {old}", file=sys.stderr)
        path.write_text(text.replace(old, graph["graphVersion"]), encoding="utf-8")
    print(f"updated {changed} edge(s); graphVersion {old} -> {graph['graphVersion']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
