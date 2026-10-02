import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from "three";

export interface EarthMaps {
  day: Texture;
  night: Texture;
  clouds: Texture;
}

let pending: Promise<EarthMaps> | null = null;

/**
 * NASA Blue Marble (day), Black Marble (night lights) and cloud maps, 384 kB of WebP in public/textures.
 * Loaded once, after the scene has drawn; the Earth shader shows flat blue until they arrive.
 */
export function loadEarthMaps(maxAnisotropy: number): Promise<EarthMaps> {
  pending ??= (async () => {
    const loader = new TextureLoader();
    const base = `${import.meta.env.BASE_URL}textures/`;
    const [day, night, clouds] = await Promise.all(
      ["earth_day.webp", "earth_night.webp", "earth_clouds.webp"].map((f) => loader.loadAsync(base + f)),
    );
    day.colorSpace = SRGBColorSpace;
    night.colorSpace = SRGBColorSpace;
    clouds.wrapS = RepeatWrapping; // the cloud layer drifts in longitude
    for (const t of [day, night, clouds]) {
      t.anisotropy = Math.min(8, maxAnisotropy);
      t.needsUpdate = true;
    }
    return { day, night, clouds };
  })();
  pending.catch(() => (pending = null)); // offline: try again next time the scene mounts
  return pending;
}
