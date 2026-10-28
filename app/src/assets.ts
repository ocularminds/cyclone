import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

/**
 * Cyclone's asset manifest. Machines, tokens and the desk are procedural
 * (src/models), and all sound is synthesised, so the only file asset is the
 * settings panel (C30: no third-party or branded assets).
 */
export default defineAssets({
  'settings-panel': {
    url: publicAssetUrl('ui/settings.uikitml'),
    type: AssetType.UIKitML,
    name: 'Settings Panel',
  },
});
