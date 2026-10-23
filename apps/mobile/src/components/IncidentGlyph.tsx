import { Image, View, type ImageSourcePropType } from 'react-native';
import type { IncidentIconKey } from '@vighnaway/tokens';
import { useColors } from '@/theme';

/** The picture for each incident and report type: the illustrations from the report screen, used on every screen. */
export const INCIDENT_IMAGE: Record<IncidentIconKey, ImageSourcePropType> = {
  flood: require('../../assets/report/flood.png'),
  closure: require('../../assets/report/closure.png'),
  congestion: require('../../assets/report/congestion.png'),
  debris: require('../../assets/report/debris.png'),
  accident: require('../../assets/report/accident.png'),
  walking_concern: require('../../assets/report/walking_concern.png'),
  road_clear: require('../../assets/report/road_clear.png'),
};

/**
 * The incident picture on a white disc, the way the report screen shows it, so a flood looks the same on the map,
 * in the lists, in the evidence sheet and when reporting. `size` is the nominal glyph size callers already pass; the
 * disc is a little larger so the picture reads. The colour callers used to pass is no longer needed (the pictures
 * carry their own colours) and is ignored.
 */
export function IncidentGlyph({ type, size = 20 }: { type: IncidentIconKey; size?: number; color?: string }) {
  const tc = useColors();
  const disc = Math.round(size * 1.9);
  const image = Math.round(size * 1.5);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: tc.white, alignItems: 'center', justifyContent: 'center' }}
    >
      <Image source={INCIDENT_IMAGE[type]} style={{ width: image, height: image }} resizeMode="contain" accessible={false} />
    </View>
  );
}
