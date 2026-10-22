import { colors } from '@vighnaway/tokens';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrPath, type QrMatrix } from '@/lib/relay';

/** Modules of empty margin round the code: the QR standard asks for four. */
const QUIET = 4;

/**
 * A QR code. Always dark on white, in both themes, because scanners need the contrast; the colours come
 * from the tokens (ink on white), never the theme's panel.
 */
export function QrCode({ matrix, size, label, testID }: { matrix: QrMatrix; size: number; label: string; testID?: string }) {
  const d = useMemo(() => qrPath(matrix), [matrix]);
  const span = matrix.size + QUIET * 2;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} testID={testID} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`}>
        <Rect width={span} height={span} fill={colors.white} />
        <Path d={d} transform={`translate(${QUIET} ${QUIET})`} fill={colors.ink} />
      </Svg>
    </View>
  );
}
