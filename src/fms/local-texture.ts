import { Texture } from 'pixi.js';

/** Keep URL resolution in the browser: Pixi 8 path.toAbsolute only recognises
 * http(s), losing localhost for /assets on capacitor://. Its texture parser also
 * uses CORS fetch/bitmap workers or crossOrigin=anonymous. Packaged images need
 * neither: Image's same-origin load works without CORS response headers. */
export function localAssetUrl(source: string, base = document.baseURI): string {
  return new URL(source, base).href;
}
const textures = new Map<string, Promise<Texture>>();
export function loadLocalTexture(source: string): Promise<Texture> {
  const url = localAssetUrl(source);
  let pending = textures.get(url);
  if (!pending) {
    pending = new Promise<Texture>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(Texture.from(image));
      image.onerror = () => reject(new Error(`地图纹理加载失败：${url}`));
      // Do not assign crossOrigin, including the empty string (also anonymous).
      image.src = url;
    }).catch(error => { textures.delete(url); throw error; });
    textures.set(url, pending);
  }
  return pending;
}
