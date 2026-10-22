import { memo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { CrossingKind, RouteEvaluation } from '@vighnaway/contracts';
import { routeLabel } from '@/i18n/engineText';
import { fmtDistance } from '@/i18n/format';
import { getLanguage } from '@/i18n/lang';
import { t } from '@/i18n/en';
import { createStyles, devanagari, fontFamily, lineStyle, ringStyle, type, useColors } from '@/theme';

const crossingKey = { underpass: 'crossingUnderpass', flyover: 'crossingFlyover', bridge: 'crossingBridge', footbridge: 'crossingFootbridge' } as const;
const crossingWord = (k: CrossingKind) => t(crossingKey[k]);

const BAR_Y = 8;
const BAR_H = 6;
const HEIGHT = 36;
const LABEL = type.meta.size - 1;

/**
 * Signature route strip: origin to destination as a slim bar, hazard ticks at their real positions
 * (positionM / distanceM), crossings banded and named by kind, and the travelled part
 * tinted when en route.
 */
export const RouteStrip = memo(function RouteStrip({ route, travelledFraction }: { route: RouteEvaluation; travelledFraction?: number }) {
  const tc = useColors();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const style = lineStyle(tc, route.role);
  const total = Math.max(1, route.distanceM);
  const pad = 6;
  const span = Math.max(0, width - pad * 2);
  const x = (m: number) => pad + (Math.min(total, Math.max(0, m)) / total) * span;
  const hazards = route.hazards.filter((h) => h.effect !== 'none');
  const blocked = route.role === 'blocked';
  const label = t('routeStripLabel', {
    name: routeLabel(route),
    distance: fmtDistance(route.distanceM),
    hazards: hazards.length ? t('routeStripHazards', { n: hazards.length }) : t('routeStripNoHazards'),
  });
  const mid = BAR_Y + BAR_H / 2;
  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={label}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Rect x={pad} y={BAR_Y} width={span} height={BAR_H} rx={BAR_H / 2} fill={tc.panelSunken} />
          {blocked ? (
            <Line x1={pad + 2} x2={pad + span - 2} y1={mid} y2={mid} stroke={tc.danger} strokeWidth={BAR_H - 1} strokeDasharray={[8, 6]} />
          ) : (
            <Rect x={pad} y={BAR_Y} width={span} height={BAR_H} rx={BAR_H / 2} fill={style.color} opacity={style.opacity} />
          )}
          {travelledFraction !== undefined && travelledFraction > 0 ? (
            <Rect x={pad} y={BAR_Y} width={span * Math.min(1, travelledFraction)} height={BAR_H} rx={BAR_H / 2} fill={tc.routeTravelled} />
          ) : null}
          {route.crossings.map((c) => {
            const x0 = x(c.positionM);
            const x1 = Math.max(x0 + 4, x(c.positionM + c.lengthM));
            const cx = (x0 + x1) / 2;
            return (
              <G key={`${c.name}-${c.positionM}`}>
                <Rect x={x0 - 1} y={BAR_Y - 2} width={x1 - x0 + 2} height={BAR_H + 4} rx={3} fill={tc.panel} stroke={tc.ink} strokeWidth={1.5} />
                <SvgText
                  x={Math.min(width - pad, Math.max(pad, cx))}
                  y={HEIGHT - 3}
                  fontSize={LABEL}
                  fontFamily={getLanguage() === 'en' ? fontFamily.medium : devanagari.medium}
                  fill={tc.inkMuted}
                  textAnchor={cx < pad + 40 ? 'start' : cx > width - pad - 40 ? 'end' : 'middle'}
                >
                  {crossingWord(c.kind)}
                </SvgText>
              </G>
            );
          })}
          {route.dataGaps.map((g) => (
            <Circle key={`gap-${g.edgeId}`} cx={x(g.positionM)} cy={mid} r={2.5} fill={tc.panel} stroke={tc.inkMuted} strokeWidth={1.5} />
          ))}
          {hazards.map((h) => {
            const ring = ringStyle(tc, h.status);
            const hard = h.effect === 'block';
            const hx = x(h.positionM);
            const c = hard ? tc.danger : ring.color;
            return (
              <G key={h.incidentId}>
                <Line x1={hx} x2={hx} y1={BAR_Y - 5} y2={BAR_Y + BAR_H + 5} stroke={tc.panel} strokeWidth={6} strokeLinecap="round" />
                <Line
                  x1={hx}
                  x2={hx}
                  y1={BAR_Y - 5}
                  y2={BAR_Y + BAR_H + 5}
                  stroke={c}
                  strokeWidth={3}
                  strokeDasharray={ring.style === 'dashed' ? [3, 2] : undefined}
                  strokeLinecap="round"
                />
                {ring.style === 'double' ? <Circle cx={hx} cy={BAR_Y - 7} r={2} fill={c} /> : null}
              </G>
            );
          })}
          <Circle cx={pad} cy={mid} r={4.5} fill={tc.ink} stroke={tc.panel} strokeWidth={2} />
          <Circle cx={width - pad} cy={mid} r={4.5} fill={tc.panel} stroke={tc.ink} strokeWidth={2} />
        </Svg>
      ) : null}
    </View>
  );
});

const useStyles = createStyles(() => ({ wrap: { height: HEIGHT, width: '100%' } }));
