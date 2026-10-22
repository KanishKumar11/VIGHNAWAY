/**
 * English catalog: the source of every sentence the engine produces. renderText(text, 'en') must
 * reproduce the engine's English output byte for byte (tested against every parity case).
 *
 * Placeholders: {name}. Modifiers for Latin text: {name|cap} capitalises the first letter,
 * {name|lower} lower-cases the first letter, {name|lowerall} lower-cases everything. Devanagari is
 * unaffected by case modifiers.
 */
export const en = {
  // Hazards
  'depth.ankle': 'ankle deep',
  'depth.knee': 'knee deep',
  'depth.waist': 'waist deep',
  'depth.none': 'depth not given',
  'hazard.flood': 'Flooding ({depth})',
  'hazard.closure': 'Road closure',
  'hazard.congestion.moderate': 'Moderate congestion',
  'hazard.congestion.heavy': 'Heavy congestion',
  'hazard.congestion.standstill': 'Standstill congestion',
  'hazard.debris': 'Debris',
  'hazard.debris.impassable': 'Debris (reported impassable)',
  'hazard.accident': 'Accident',
  'hazard.walking.poorly_lit': 'Poorly lit road',
  'hazard.walking.isolated': 'Isolated stretch',
  'hazard.accident.impassable': 'Accident (reported impassable)',
  'hazard.at': '{hazard} at {road}',
  'hazard.on': '{hazard} on {road}',

  // Evidence status and source
  'status.unverified': 'Unverified',
  'status.corroborated': 'Corroborated ({n} devices)',
  'status.verified': 'Verified by operator',
  'status.verified.sim': 'Verified by operator (simulated)',
  'status.resolved': 'Resolved',
  'status.dismissed': 'Dismissed',
  'status.feed': 'Reported by {provider} live traffic{devices}',
  'status.feed.devices.one': ' and 1 device',
  'status.feed.devices': ' and {n} devices',
  'provider.tomtom': 'TomTom',
  'provider.unknown': 'a',
  'source.simulated': 'Simulated',
  'source.user_report': 'User report',
  'source.operator': 'Operator',
  'source.live_feed': 'Live traffic feed',
  'source.feed': '{provider} live traffic',
  'evidence.full': '{hazard}: {status}, {source}',
  'evidence.short': '{hazard}: {status}',

  // Numbers as words
  'dur.min': '{n} min',
  'dur.h': '{h} h',
  'dur.hmin': '{h} h {m} min',
  'delta.plus': '+{n} min',
  'delta.minus': '−{n} min',
  'delta.same': 'about the same time',
  'eta.adds': 'adds {n} min',
  'eta.saves': 'saves {n} min',
  'eta.same': 'takes about the same time',

  // Places and routes
  'route.via': 'Via {road}',
  'route.via.lower': 'via {road}',
  'route.direct': 'Direct route',
  'crossing.unnamed.underpass': 'Unnamed underpass',
  'crossing.unnamed.flyover': 'Unnamed flyover',
  'crossing.unnamed.bridge': 'Unnamed bridge',
  'crossing.unnamed.footbridge': 'Unnamed footbridge',
  'place.floodProneRoad': 'a flood-prone road',
  'place.floodStretch': 'the flood-prone stretch',

  // Hazard summaries
  'hazards.none': 'no reported hazards',
  'hazards.unknown': 'a reported hazard',
  'hazards.head': '{hazard} ({status})',
  'hazards.more': '{head} and {n} more',

  // Confidence reasons
  'conf.conflict': 'A Road clear report conflicts with an incident on this route',
  'conf.stale': 'Relies on a report older than 3 hours',
  'conf.almostSame': 'Another route scores almost the same',
  'conf.reversal': 'Turning back is the only option left',
  'conf.unverified.one': '1 unverified report on this route',
  'conf.unverified.many': '{n} unverified reports on this route',
  'conf.gap.road': 'No recent reports on {road}',
  'conf.gap.unnamed': 'No recent reports on a flood-prone road',
  'conf.noAlert': 'No rain alert information',
  'conf.stepFreeUnknown': 'Step-free access is not recorded on {n} segments of this route',
  'conf.close': 'Another route scores close to this one',

  // Re-check lines
  'recheck.unverified.road': 'Re-check if the report at {road} is corroborated or verified.',
  'recheck.unverified': 'Re-check if the report is corroborated or verified.',
  'recheck.gap': 'Re-check if reports arrive from {road}.',
  'recheck.crossing': 'Re-check if anything is reported on {crossing}.',
  'recheck.default': 'Re-check if a new incident is reported on this route.',
  'recheck.operator': 'Re-check if the operator resolves it.',

  // Route reasons
  'reason.notViable': 'Not viable: {evidence}.',
  'reason.notViable.unknown': 'Not viable: a reported blockage.',
  'reason.staleBlock': '{reason} The report is older than 3 hours but stays in force until an operator resolves it.',
  'reason.reversal': '{reversal}. No forward route is viable.',
  'reason.fastest.clear': 'Fastest route, no reported hazards.',
  'reason.fastest.gap': 'Fastest route. No recent reports on {road} during the rain alert.',
  'reason.fastest.hazards': 'Fastest route. {hazards|cap} does not outweigh a detour.',
  'reason.kept': 'Kept: no other route is better by more than the switching threshold. {reason}',
  'reason.avoids.block': 'Avoids {hazard|lower} ({status}), which makes the usual fastest route not viable.',
  'reason.avoids.blockUnknown': 'Avoids a blockage on the usual fastest route.',
  'reason.avoids.unconfirmed': 'Avoids an unconfirmed report of {hazard|lower} on the usual fastest route.',
  'reason.avoids.hazard': 'Avoids {hazard|lower} on the usual fastest route.',
  'reason.avoids.gap': 'Avoids a data gap on the usual fastest route.',
  'reason.usual': 'Usual fastest route, but it has {hazards}.',
  'reason.alternative': 'Alternative with {hazards}.',

  // Trade-offs
  'trade.vsUsual': '{delta} compared with the usual fastest route',
  'trade.passes': 'Passes {hazards}',
  'trade.none': 'None: this is also the fastest route',
  'trade.vsRecommended': '{delta} compared with the recommended route',
  'trade.vsPrevious': '{delta} compared with the previous route',

  // Route changes
  'change.cause': '{evidence}.',
  'change.noViable': 'No viable route.',
  'change.noViable.cause': 'No viable route. {cause}',
  'change.changed': 'Route changed.',
  'change.changed.cause': 'Route changed. {cause}',
  'change.new': 'Route changed. {cause} New route {via} {eta}.',
  'change.new.nocause': 'Route changed. New route {via} {eta}.',
  'change.new.better': 'Route changed. Another route is now clearly better. New route {via} {eta}.',
  'change.reversal': '{base} No forward route is viable. {reversal}.',

  // Why not that route? (counterfactuals)
  'cf.blocked.notEnough': 'Even if {hazards|lower} were cleared, another route would still be recommended.',
  'cf.hazard.one': 'Would be recommended if {hazard|lower} were cleared.',
  'cf.hazard.many': 'Would be recommended if these were cleared: {hazards}.',
  'cf.time': 'Would be recommended if it were {n} min faster.',
  'cf.none.hazards': 'Clearing its reported hazards would not make it recommended.',
  'cf.none.time': 'Saving time alone would not make it recommended.',
  'cf.join': '{head}; {tail}',

  // Evidence coverage
  'cov.road.fresh': '{road}: reported in the last 30 min',
  'cov.road.ageing': '{road}: last report {age} ago',
  'cov.road.stale': '{road}: last report {age} ago, older than 3 h',
  'cov.road.none': '{road}: no reports',
  'cov.brief.none': 'Every flood-prone road has a report in the last hour',
  'cov.brief.one': '1 flood-prone road has no report in the last hour',
  'cov.brief.many': '{n} flood-prone roads have no report in the last hour',
  'cov.brief.noRoads': 'No flood-prone roads are mapped',

  // Plan notices
  'notice.unchanged.one': 'Route unchanged: one unverified report',
  'notice.unchanged.many': 'Route unchanged: {n} unverified reports',
  'notice.unchanged.hazard': 'Route unchanged: {hazard|lowerall} does not outweigh a detour',
  'notice.noViable': 'No viable route to this destination. In an emergency, call 112.',
  'notice.noRoute': 'No route found between these points for this profile.',
  'notice.onBlocked': 'Warning: {hazard} is reported on the road you are on. The plan shown starts at the next junction ahead.',
  reversal: 'Turn back only where it is safe to do so',

  // What to do now
  'next.reversal': '{reversal}, then follow the new route.',
  'next.noViable.reach': 'No viable route. Head to {place}, {eta} away. In an emergency, call 112.',
  'next.noViable': 'No viable route. Stay where you are if you can. In an emergency, call 112.',
  'next.take': 'Take {via} to {place}, {eta}.',
  'next.takeShort': 'Take {via}, {eta}.',
} as const;

export type TextKey = keyof typeof en;
