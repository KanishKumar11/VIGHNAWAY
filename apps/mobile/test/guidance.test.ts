import { buildGuidePath, classifyTurn, progressOn, turnAngle, type GuidePoint } from '@/features/guidance/guide';
import { instructionText, maneuverText } from '@/features/guidance/text';

const LAT0 = 31.634;
const LNG0 = 74.822;
const M_N = 1 / 110574;
const M_E = 1 / (111320 * Math.cos((LAT0 * Math.PI) / 180));
/** A point `n` metres north and `e` metres east of the origin. */
const at = (n: number, e: number, extra: Partial<GuidePoint> = {}): GuidePoint => ({ lat: LAT0 + n * M_N, lng: LNG0 + e * M_E, ...extra });

describe('turn angles', () => {
  it('measures the signed change of bearing, right positive', () => {
    expect(turnAngle(0, 90)).toBe(90);
    expect(turnAngle(90, 0)).toBe(-90);
    expect(turnAngle(350, 10)).toBe(20);
    expect(turnAngle(10, 350)).toBe(-20);
    expect(Math.abs(turnAngle(0, 180))).toBe(180);
  });
  it('names turns by size', () => {
    expect(classifyTurn(10)).toBeNull();
    expect(classifyTurn(-40)).toBe('slight_left');
    expect(classifyTurn(90)).toBe('right');
    expect(classifyTurn(-90)).toBe('left');
    expect(classifyTurn(140)).toBe('sharp_right');
    expect(classifyTurn(-175)).toBe('uturn');
  });
});

describe('manoeuvres on a path', () => {
  // North 200 m on Gate Road, then east 300 m on Ring Road: one right turn at the junction.
  const rightTurn = () => [at(0, 0, { junction: true, name: 'Gate Road' }), at(100, 0), at(200, 0, { junction: true, name: 'Ring Road' }), at(200, 150), at(200, 300, { junction: true })];

  it('departs, turns right at the junction onto the new road, and arrives', () => {
    const path = buildGuidePath(rightTurn());
    expect(path.maneuvers.map((m) => m.kind)).toEqual(['depart', 'right', 'arrive']);
    const turn = path.maneuvers[1]!;
    expect(turn.name).toBe('Ring Road');
    expect(turn.atM).toBeGreaterThan(195);
    expect(turn.atM).toBeLessThan(205);
    expect(path.maneuvers[0]!.name).toBe('Gate Road');
    expect(path.totalM).toBeGreaterThan(495);
    expect(path.totalM).toBeLessThan(505);
  });

  it('turns left when the road bends the other way', () => {
    const path = buildGuidePath([at(0, 0, { junction: true, name: 'A' }), at(200, 0, { junction: true, name: 'B' }), at(200, -200, { junction: true })]);
    expect(path.maneuvers.map((m) => m.kind)).toEqual(['depart', 'left', 'arrive']);
  });

  it('says nothing on a straight road, even across junctions and a name change', () => {
    const path = buildGuidePath([at(0, 0, { junction: true, name: 'A' }), at(150, 0, { junction: true, name: 'B' }), at(300, 0, { junction: true })]);
    expect(path.maneuvers.map((m) => m.kind)).toEqual(['depart', 'arrive']);
  });

  it('ignores a gentle bend that is not a junction, but announces a sharp one', () => {
    const gentle = buildGuidePath([at(0, 0, { junction: true, name: 'A' }), at(100, 0), at(180, 60), at(260, 120, { junction: true })]);
    expect(gentle.maneuvers.map((m) => m.kind)).toEqual(['depart', 'arrive']);
    const sharp = buildGuidePath([at(0, 0, { junction: true, name: 'A' }), at(100, 0), at(100, 120, { junction: true })]);
    expect(sharp.maneuvers.map((m) => m.kind)).toEqual(['depart', 'right', 'arrive']);
  });

  it('is one manoeuvre where a curve has several corners close together', () => {
    const path = buildGuidePath([at(0, 0, { junction: true, name: 'A' }), at(100, 0, { junction: true }), at(110, 8, { junction: true }), at(112, 18, { junction: true }), at(112, 150, { junction: true })]);
    expect(path.maneuvers.filter((m) => m.kind !== 'depart' && m.kind !== 'arrive')).toHaveLength(1);
  });

  it('merges the same place given twice (end of one road, start of the next)', () => {
    const path = buildGuidePath([at(0, 0, { name: 'A' }), at(100, 0, { junction: true }), at(100, 0, { junction: true, name: 'B' }), at(100, 150)]);
    expect(path.points).toHaveLength(3);
    expect(path.maneuvers[1]!.kind).toBe('right');
    expect(path.maneuvers[1]!.name).toBe('B');
  });
});

describe('progress along the path', () => {
  const path = buildGuidePath([at(0, 0, { junction: true, name: 'Gate Road' }), at(100, 0), at(200, 0, { junction: true, name: 'Ring Road' }), at(200, 150), at(200, 300, { junction: true })]);

  it('points at the turn and how far it is', () => {
    const p = progressOn(path, at(50, 0))!;
    expect(p.next.kind).toBe('right');
    expect(p.nextDistM).toBeGreaterThan(145);
    expect(p.nextDistM).toBeLessThan(155);
    expect(p.offRoute).toBe(false);
    expect(p.remainingM).toBeGreaterThan(445);
  });

  it('moves on to arrival once the turn is behind', () => {
    const p = progressOn(path, at(200, 100), 200)!;
    expect(p.next.kind).toBe('arrive');
    expect(p.nextDistM).toBeGreaterThan(195);
    expect(p.nextDistM).toBeLessThan(205);
  });

  it('knows the following turn when it comes soon after', () => {
    const two = buildGuidePath([at(0, 0, { junction: true, name: 'A' }), at(100, 0, { junction: true, name: 'B' }), at(100, 80, { junction: true, name: 'C' }), at(200, 80, { junction: true })]);
    const p = progressOn(two, at(40, 0))!;
    expect(p.next.kind).toBe('right');
    expect(p.then?.kind).toBe('left');
  });

  it('reports being off the path, and finds the way back by looking further afield', () => {
    expect(progressOn(path, at(50, 90))!.offRoute).toBe(true);
    const back = progressOn(path, at(200, 250), 20)!;
    expect(back.offRoute).toBe(false);
    expect(back.alongM).toBeGreaterThan(440);
  });
});

describe('instruction text', () => {
  const path = buildGuidePath([at(0, 0, { junction: true, name: 'Gate Road' }), at(200, 0, { junction: true, name: 'Ring Road' }), at(200, 300, { junction: true })]);

  it('names the road, and the heading at the start', () => {
    expect(maneuverText(path.maneuvers[1]!, path)).toBe('Turn right onto Ring Road');
    expect(maneuverText(path.maneuvers[0]!, path)).toBe('Head north on Gate Road');
    expect(maneuverText(path.maneuvers[2]!, path)).toBe('You have arrived');
  });
  it('puts the distance first, and drops it when the turn is here', () => {
    expect(instructionText(path.maneuvers[1]!, 200, path)).toBe('In 200 m, turn right onto Ring Road');
    expect(instructionText(path.maneuvers[1]!, 10, path)).toBe('Turn right onto Ring Road');
  });
  it('speaks an unnamed road as just the turn', () => {
    const lane = buildGuidePath([at(0, 0, { junction: true, name: null }), at(200, 0, { junction: true, name: null }), at(200, -200, { junction: true })]);
    expect(maneuverText(lane.maneuvers[1]!, lane)).toBe('Turn left');
  });
});
