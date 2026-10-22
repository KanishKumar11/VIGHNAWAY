'use client';

import type { Incident } from '@vighnaway/contracts';
import type { CSSProperties } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { recommendedRoute, type TripState } from '@/lib/demoTrip';
import { incidentFacts } from '@/lib/incidents';

/**
 * Text alternative to the map (DESIGN_VISION section 3): every route and incident the map shows,
 * as a readable list. Replaces the map stage while the List view is on.
 */
export function MapListView({ trip, incidents, nowS, style }: { trip: TripState | null; incidents: readonly Incident[]; nowS: number; style?: CSSProperties }) {
  const rec = trip ? recommendedRoute(trip.plan) : null;
  const routes = trip ? [...(rec ? [rec] : []), ...trip.plan.routes.filter((r) => r.routeId !== rec?.routeId)] : [];
  return (
    <section aria-labelledby="list-title" className="vw-scroll absolute inset-0 z-10 overflow-y-auto bg-shell-raised px-10 py-8" style={style}>
      <h2 id="list-title" className="text-console-title font-semibold text-ink-on-shell">
        {t.list.title}
      </h2>
      <p className="mt-1 text-body text-ink-on-shell-muted">{t.list.intro}</p>

      <h3 className="mt-8 text-title font-semibold text-ink-on-shell">{t.list.routes}</h3>
      <ol className="mt-3 divide-y divide-shell-hairline border-y border-shell-hairline">
        {routes.map((r) => {
          const blocked = r.role === 'blocked' || !r.viable;
          return (
            <li key={r.routeId} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-4">
              <p className="text-title font-semibold text-ink-on-shell">
                {r.name}
                <span className={cn('ml-3 text-body font-medium', blocked ? 'text-danger-ink' : r.routeId === rec?.routeId ? 'text-accent-ink' : 'text-ink-on-shell-muted')}>
                  {t.route.roles[r.role]}
                </span>
              </p>
              <p className="text-title font-semibold text-ink-on-shell tabular">{blocked ? t.route.notViable : t.time.duration(r.etaS)}</p>
              <p className="col-span-2 text-body text-ink-on-shell-muted">{r.explanation.reason}</p>
            </li>
          );
        })}
        {routes.length === 0 && <li className="py-4 text-body text-ink-on-shell-muted">{t.trip.loading}</li>}
      </ol>

      <h3 className="mt-8 text-title font-semibold text-ink-on-shell">{t.list.incidents}</h3>
      <ul className="mt-3 divide-y divide-shell-hairline border-y border-shell-hairline">
        {incidents.map((inc) => {
          const f = incidentFacts(inc, nowS);
          return (
            <li key={inc.id} className="py-4">
              <p className="text-title font-semibold text-ink-on-shell">{f.title}</p>
              <p className="text-body text-ink-on-shell-muted">
                {[inc.roadName ? t.queue.road(inc.roadName) : t.queue.unknownRoad, f.status, f.source, f.age].join(' · ')}
              </p>
            </li>
          );
        })}
        {incidents.length === 0 && <li className="py-4 text-body text-ink-on-shell-muted">{t.list.noIncidents}</li>}
      </ul>
    </section>
  );
}
