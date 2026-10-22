const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/**
 * Writes android/app/src/main/res/xml/network_security_config.xml and points the manifest at it.
 * Cleartext (plain HTTP) is allowed only when options.cleartext is true (USE_CLEARTEXT=1, laptop API
 * on the phone hotspot); otherwise the app accepts HTTPS only.
 */
module.exports = function withNetworkSecurityConfig(config, { cleartext = false } = {}) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="${cleartext ? 'true' : 'false'}">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;
      fs.writeFileSync(path.join(dir, 'network_security_config.xml'), xml);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });
};
