import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { evidenceCoverage, observationsFromIncidents } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { colors } from '@vighnaway/tokens';
import { MapLegend } from '@/components/map/MapLegend';
import { setCurrentLang, t } from '@/i18n';
import type { TripEnv } from '@/lib/demoTrip';
import { buildScene, COVERAGE_STYLE, coverageLines } from '@/lib/scene';
import { graphFor } from '@/lib/scenario';
import { usePrefs } from '@/stores/prefs';
import { makeIncident, scenarioEvent } from './helpers';

/** P1-5.b: the map colours flood-prone roads by coverage class, and says so in the legend. */

const env: TripEnv = { graph: graphFor(andheriScenario.demoTrip.profile), scenario: andheriScenario };
const subway = scenarioEvent(andheriScenario, 'ev01-ankle').report.point;
const NOW = 4 * 3600;

afterEach(() => {
  cleanup();
  usePrefs.setState({ coverage: false });
  setCurrentLang('en');
});

describe('coverage layer on the map', () => {
  it('is absent until asked for, and draws one line per flood-prone edge of each road when on', () => {
    const base = buildScene(env, andheriGraph, null, { phase: 'idle', flashOn: false, change: null });
    expect(base.lines.some((l) => l.kind === 'coverage')).toBe(false);
    const coverage = evidenceCoverage(env.graph, [], NOW);
    const lines = coverageLines(andheriGraph, coverage);
    const prone = andheriGraph.edges.filter((e) => e.floodProne);
    const baseIds = new Set(coverage.flatMap((c) => c.edgeIds));
    expect(lines.length).toBe(baseIds.size);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.kind).toBe('coverage');
    expect(prone.length).toBeGreaterThanOrEqual(lines.length);
    const withLayer = buildScene(env, andheriGraph, null, { phase: 'idle', flashOn: false, change: null }, [], coverage);
    expect(withLayer.lines.filter((l) => l.kind === 'coverage')).toHaveLength(lines.length);
  });

  it('uses a different colour or pattern per class, from existing colour tokens', () => {
    const patterns = Object.values(COVERAGE_STYLE).map((s) => `${s.color}|${s.dash?.join(',') ?? ''}`);
    expect(new Set(patterns).size).toBe(4);
    expect(COVERAGE_STYLE.fresh.dash).toBeNull();
    // A road with no reports is never drawn in the "clear" colour.
    expect(COVERAGE_STYLE.none.color).not.toBe(COVERAGE_STYLE.fresh.color);
    expect(COVERAGE_STYLE.stale.color).not.toBe(COVERAGE_STYLE.fresh.color);
    for (const s of Object.values(COVERAGE_STYLE)) expect(Object.values(colors)).toContain(s.color);
  });

  it('a recent report turns the Andheri Subway from "no reports" to "fresh"', () => {
    const none = evidenceCoverage(env.graph, [], NOW);
    expect(none.find((c) => c.name === 'Andheri Subway')?.class).toBe('none');
    const report = makeIncident({ id: 'inc-flood', type: 'flood', depth: 'ankle', point: subway, createdAtS: NOW - 60, lastReportAtS: NOW - 60, updatedAtS: NOW - 60 });
    const fresh = evidenceCoverage(env.graph, observationsFromIncidents([report]), NOW);
    expect(fresh.find((c) => c.name === 'Andheri Subway')?.class).toBe('fresh');
    const color = (cov: typeof none) => coverageLines(andheriGraph, cov).find((l) => report.edgeIds.includes(l.edgeIds![0]!))!.color;
    expect(color(none)).toBe(COVERAGE_STYLE.none.color);
    expect(color(fresh)).toBe(COVERAGE_STYLE.fresh.color);
  });

  it('the legend lists the four classes, with words, only when the layer is on', () => {
    const { container, rerender } = render(<MapLegend unavailable={false} compact={false} />);
    screen.getByRole('button', { name: /./ }).click();
    expect(screen.queryByTestId('coverage-legend')).toBeNull();
    usePrefs.setState({ coverage: true });
    rerender(<MapLegend unavailable={false} compact={false} />);
    const legend = screen.getByTestId('coverage-legend');
    for (const name of Object.values(t.coverage.classes)) expect(legend.textContent).toContain(name);
    // The note sits beside the list: "No reports is not the same as clear".
    expect(container.textContent).toContain(t.coverage.note);
    expect(container.textContent).not.toMatch(/\bsafe\b/i);
  });
});
