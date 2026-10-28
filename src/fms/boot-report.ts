type BootPhase = 'module' | 'map' | 'error';
type BootFn = (phase: BootPhase, detail?: string) => void;

function boot(): BootFn | undefined {
  return (window as unknown as { __lieguojiBoot?: BootFn }).__lieguojiBoot;
}

/** Tell the classic boot script that the module graph started or why the map cannot draw. */
export function reportBoot(phase: BootPhase, detail?: string) {
  boot()?.(phase, detail);
}

/** A laid-out canvas is the signal that the map is no longer a silent blank screen. */
export function reportMapCanvas(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (width < 2 || height < 2) reportBoot('error', `画布尚未布局（${width}×${height}）`);
  else reportBoot('map', `画布 ${width}×${height}`);
}
