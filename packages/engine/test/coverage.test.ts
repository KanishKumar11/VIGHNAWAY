import { describe, expect, it } from 'vitest';
import { findForbiddenWords } from '@vighnaway/contracts';
import {
  coverageBriefText,
  coverageClass,
  evidenceCoverage,
  loadGraph,
  observationsFromIncidents,
  renderText,
  roadsWithoutRecentReport,
  SCORING_RULES,
  TEXT_LANGS,
} from '../src';
import { andheriGraph, edgesNamed, incident } from './helpers';

const foot = loadGraph(andheriGraph, 'foot');
const floodProne = andheriGraph.edges.filter((e) => e.floodProne);
const SUBWAY = edgesNamed(andheriGraph, 'Andheri Subway');
const H = 3600;

describe('evidence coverage', () => {
  it('classifies by the scoring-rule age thresholds: 30 min, 3 h, with the boundaries on the older side', () => {
    const { fullUntilS } = SCORING_RULES.ageFactor.value;
    const staleAfterS = SCORING_RULES.staleAfterS.value;
    expect(coverageClass(0)).toBe('fresh');
    expect(coverageClass(fullUntilS)).toBe('fresh');
    expect(coverageClass(fullUntilS + 1)).toBe('ageing');
    expect(coverageClass(staleAfterS)).toBe('ageing');
    expect(coverageClass(staleAfterS + 1)).toBe('stale');
    expect(coverageClass(null)).toBe('none');
  });

  it('lists every flood-prone road once, and a road with no report is "none", never "clear"', () => {
    expect(floodProne.length).toBeGreaterThan(0);
    const roads = evidenceCoverage(foot, [], 1000);
    const names = new Set(floodProne.map((e) => e.name ?? `edge:${e.id}`));
    expect(roads.length).toBeGreaterThan(0);
    expect(roads.length).toBeLessThanOrEqual(names.size);
    for (const r of roads) {
      expect(r.class).toBe('none');
      expect(r.lastObservedAtS).toBeNull();
      expect(r.oldestObservedAtS).toBeNull();
      expect(r.unobservedEdges).toBe(r.edgeIds.length);
      expect(renderText(r.text, 'en')).toMatch(/no reports$/);
    }
  });

  it('shades the reported road by its newest report and sorts the blind spots first', () => {
    const subway = incident({ type: 'flood', depth: 'knee', edgeIds: SUBWAY, lastReportAtS: 1000, roadName: 'Andheri Subway' });
    const at = (nowS: number) => evidenceCoverage(foot, observationsFromIncidents([subway]), nowS);
    const road = (nowS: number) => at(nowS).find((r) => r.name === 'Andheri Subway')!;
    expect(road(1000 + 600).class).toBe('fresh');
    expect(road(1000 + 1800).class).toBe('fresh');
    expect(road(1000 + 1801).class).toBe('ageing');
    expect(road(1000 + 3 * H).class).toBe('ageing');
    expect(road(1000 + 3 * H + 1).class).toBe('stale');
    expect(road(1600).lastObservedAtS).toBe(1000);
    expect(renderText(road(1000 + H).text, 'en')).toBe('Andheri Subway: last report 1 h ago');
    expect(renderText(road(1000 + 4 * H).text, 'en')).toMatch(/older than 3 h/);
    // Roads nobody reported on come first.
    const list = at(1600);
    expect(list[list.length - 1]!.name).toBe('Andheri Subway');
    expect(list.find((r) => r.name === 'Andheri Subway')!.class).toBe('fresh');
    expect(list[0]!.class).toBe('none');
  });

  it('mixed edges on one road: the newest edge wins and the oldest is reported', () => {
    const [first, ...rest] = SUBWAY;
    expect(rest.length).toBeGreaterThan(0);
    const roads = evidenceCoverage(
      foot,
      [
        { edgeId: first!, lastObservedAtS: 100 },
        { edgeId: rest[0]!, lastObservedAtS: 900 },
      ],
      1000,
    );
    const road = roads.find((r) => r.name === 'Andheri Subway')!;
    expect(road.lastObservedAtS).toBe(900);
    expect(road.oldestObservedAtS).toBe(100);
    expect(road.class).toBe('fresh');
  });

  it('a Resolved report was still a report, and a later report replaces an earlier one', () => {
    const resolved = incident({ type: 'flood', depth: 'knee', status: 'resolved', edgeIds: SUBWAY, lastReportAtS: 500, closedAtS: 600 });
    const later = incident({ type: 'debris', edgeIds: SUBWAY, lastReportAtS: 800 });
    const road = evidenceCoverage(foot, observationsFromIncidents([resolved, later]), 1000).find((r) => r.name === 'Andheri Subway')!;
    expect(road.lastObservedAtS).toBe(800);
  });

  it('counts roads with no report in the last hour, using the data-gap window', () => {
    const { windowS } = SCORING_RULES.dataGap.value;
    const subway = incident({ type: 'flood', depth: 'knee', edgeIds: SUBWAY, lastReportAtS: 0 });
    const roads = evidenceCoverage(foot, observationsFromIncidents([subway]), windowS);
    const blind = (nowS: number) => roadsWithoutRecentReport(evidenceCoverage(foot, observationsFromIncidents([subway]), nowS), nowS).length;
    // Exactly 60 min old still counts as a recent report (same boundary as the ranking rule); one second more does not.
    expect(blind(windowS)).toBe(roads.length - 1);
    expect(blind(windowS + 1)).toBe(roads.length);
  });

  it('writes the brief line for none, one and many blind roads, in every language, with no forbidden words', () => {
    const subway = incident({ type: 'flood', depth: 'knee', edgeIds: SUBWAY, lastReportAtS: 0 });
    const roads = evidenceCoverage(foot, observationsFromIncidents([subway]), 100);
    expect(roads.length).toBeGreaterThan(0);
    const none = coverageBriefText(roads, 100);
    const one = coverageBriefText(roads.slice(0, 1), 2 * H);
    const many = coverageBriefText([roads[0]!, roads[0]!, roads[0]!], 2 * H);
    expect(renderText(none, 'en')).toBe('Every flood-prone road has a report in the last hour');
    expect(renderText(one, 'en')).toBe('1 flood-prone road has no report in the last hour');
    expect(renderText(many, 'en')).toBe('3 flood-prone roads have no report in the last hour');
    expect(renderText(coverageBriefText([], 0), 'en')).toBe('No flood-prone roads are mapped');
    for (const lang of TEXT_LANGS) {
      for (const text of [none, one, many, coverageBriefText([], 0), ...roads.map((r) => r.text)]) {
        const s = renderText(text, lang);
        expect(s).not.toMatch(/{w+(|w+)?}/);
        expect(findForbiddenWords(s)).toEqual([]);
      }
    }
  });
});
