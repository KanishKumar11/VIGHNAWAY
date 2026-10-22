import { and, count, eq, notInArray, sql } from 'drizzle-orm';
import { GraphFileSchema, ScenarioSchema } from '@vighnaway/contracts';
import { scenarios as bundles } from '@vighnaway/scenario-data';
import type { Db } from './client';
import { places, roadEdges, scenarios, simRuns } from './schema';

export interface SeedResult {
  scenarioId: string;
  graphVersion: string;
  edges: number;
  places: number;
}

/** 14 columns per edge: 1,000 rows is 14,000 parameters, well inside Postgres' 65,535. */
const EDGE_BATCH = 1000;

export const initialRunId = (scenarioId: string): string => `${scenarioId}:run:0`;

/**
 * Upserts road_edges for each scenario's graph version, its places and the scenarios row.
 * Idempotent: re-running changes nothing except refreshing the definition; the live sim columns
 * (seq, reset_seq, run_id, clock) of an existing scenario row are left alone.
 *
 * The graph version is a hash of the graph's content, so when the database already holds every edge
 * of that version the road_edges upsert is skipped. The real Andheri graph has about 23,000 edges:
 * rewriting them on every container start took longer than the platform's health-check window.
 * `log` reports progress (the container logs show where a slow first seed is).
 */
export async function seedAll(db: Db, log: (line: string) => void = () => {}): Promise<SeedResult[]> {
  const out: SeedResult[] = [];
  for (const id of Object.keys(bundles).sort()) {
    const bundle = bundles[id]!;
    const scenario = ScenarioSchema.parse(bundle.scenario);
    const graph = GraphFileSchema.parse(bundle.graph);
    if (scenario.graphVersion !== graph.graphVersion) {
      throw new Error(`scenario ${id} expects graph ${scenario.graphVersion}, got ${graph.graphVersion}`);
    }
    const [have] = await db.select({ n: count() }).from(roadEdges).where(eq(roadEdges.graphVersion, graph.graphVersion));
    const edgesCurrent = Number(have?.n ?? 0) === graph.edges.length;
    log(edgesCurrent ? `${id}: ${graph.edges.length} road edges already stored for ${graph.graphVersion}, skipping` : `${id}: storing ${graph.edges.length} road edges for ${graph.graphVersion} (first load can take a minute)`);
    await db.transaction(async (tx) => {
      const rows = edgesCurrent ? [] : graph.edges.map((e) => ({
        id: e.id,
        graphVersion: graph.graphVersion,
        fromNode: e.from,
        toNode: e.to,
        reverseId: e.reverseId,
        wayId: e.wayId,
        name: e.name,
        highway: e.highway,
        oneway: e.oneway,
        bridge: e.bridge,
        tunnel: e.tunnel,
        layer: e.layer,
        lengthM: e.lengthM,
        floodProne: e.floodProne,
        geom: e.geometry.map(([x, y]) => [x, y] as [number, number]),
      }));
      for (let i = 0; i < rows.length; i += EDGE_BATCH) {
        await tx
          .insert(roadEdges)
          .values(rows.slice(i, i + EDGE_BATCH))
          .onConflictDoUpdate({
            target: roadEdges.id,
            set: {
              graphVersion: sql`excluded.graph_version`,
              fromNode: sql`excluded.from_node`,
              toNode: sql`excluded.to_node`,
              reverseId: sql`excluded.reverse_id`,
              wayId: sql`excluded.way_id`,
              name: sql`excluded.name`,
              highway: sql`excluded.highway`,
              oneway: sql`excluded.oneway`,
              bridge: sql`excluded.bridge`,
              tunnel: sql`excluded.tunnel`,
              layer: sql`excluded.layer`,
              lengthM: sql`excluded.length_m`,
              floodProne: sql`excluded.flood_prone`,
              geom: sql`excluded.geom`,
            },
          });
      }
      if (!edgesCurrent) {
        await tx.delete(roadEdges).where(
          and(
            eq(roadEdges.graphVersion, graph.graphVersion),
            notInArray(
              roadEdges.id,
              rows.map((r) => r.id),
            ),
          ),
        );
      }

      const placeRows = scenario.places.map((p) => ({
        id: p.id,
        scenarioId: scenario.id,
        name: p.name,
        kind: p.kind,
        nodeId: p.nodeId,
        side: p.side,
        address: p.address,
        geom: [p.point.lng, p.point.lat] as [number, number],
      }));
      if (placeRows.length) {
        await tx
          .insert(places)
          .values(placeRows)
          .onConflictDoUpdate({
            target: places.id,
            set: {
              scenarioId: sql`excluded.scenario_id`,
              name: sql`excluded.name`,
              kind: sql`excluded.kind`,
              nodeId: sql`excluded.node_id`,
              side: sql`excluded.side`,
              address: sql`excluded.address`,
              geom: sql`excluded.geom`,
            },
          });
      }
      await tx.delete(places).where(
        and(
          eq(places.scenarioId, scenario.id),
          notInArray(
            places.id,
            placeRows.map((p) => p.id),
          ),
        ),
      );

      await tx
        .insert(scenarios)
        .values({
          id: scenario.id,
          name: scenario.name,
          graphVersion: scenario.graphVersion,
          definition: scenario,
          runId: initialRunId(scenario.id),
        })
        .onConflictDoUpdate({
          target: scenarios.id,
          set: {
            name: scenario.name,
            graphVersion: scenario.graphVersion,
            definition: scenario,
          },
        });
      await tx
        .insert(simRuns)
        .values({ id: initialRunId(scenario.id), scenarioId: scenario.id, status: 'idle' })
        .onConflictDoNothing();
    });
    out.push({
      scenarioId: scenario.id,
      graphVersion: graph.graphVersion,
      edges: graph.edges.length,
      places: scenario.places.length,
    });
  }
  return out;
}
