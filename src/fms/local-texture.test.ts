import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLocalTexture, localAssetUrl } from './local-texture';

describe('packaged asset URLs preserve authority and deployment path', () => {
  it.each(['capacitor', 'ionic', 'https'])('%s keeps localhost for root assets', scheme => {
    expect(localAssetUrl('/assets/parchment.jpg', `${scheme}://localhost/index.html`))
      .toBe(`${scheme}://localhost/assets/parchment.jpg`);
  });
  it('resolves relative and already absolute URLs without path concatenation', () => {
    expect(localAssetUrl('./assets/p.jpg', 'https://localhost/sub/')).toBe('https://localhost/sub/assets/p.jpg');
    expect(localAssetUrl('capacitor://localhost/assets/p.jpg', 'capacitor://localhost/')).toBe('capacitor://localhost/assets/p.jpg');
  });
});

vi.mock('pixi.js', () => ({ Texture: { from: (image: unknown) => ({ image }) } }));
afterEach(() => vi.unstubAllGlobals());
it('loads without anonymous CORS, shares textures and retries failed images', async () => {
  class ImageStub {
    static instances: ImageStub[] = [];
    src = '';
    onload = () => {};
    onerror = () => {};
    constructor() { ImageStub.instances.push(this); }
    set crossOrigin(_value: string) { throw new Error('Packaged images must not opt into CORS'); }
  }
  vi.stubGlobal('document', { baseURI: 'capacitor://localhost/' });
  vi.stubGlobal('Image', ImageStub);
  const first = loadLocalTexture('/assets/shared.jpg');
  expect(loadLocalTexture('/assets/shared.jpg')).toBe(first);
  expect(ImageStub.instances[0].src).toBe('capacitor://localhost/assets/shared.jpg');
  ImageStub.instances[0].onload();
  await expect(first).resolves.toHaveProperty('image', ImageStub.instances[0]);
  const failure = loadLocalTexture('/assets/retry.jpg');
  const rejected = expect(failure).rejects.toThrow('capacitor://localhost/assets/retry.jpg');
  ImageStub.instances[1].onerror();
  await rejected;
  const retry = loadLocalTexture('/assets/retry.jpg');
  expect(retry).not.toBe(failure);
  ImageStub.instances[2].onload();
  await expect(retry).resolves.toHaveProperty('image', ImageStub.instances[2]);
});
