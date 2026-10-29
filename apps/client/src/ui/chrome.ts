import { Application, Graphics, Rectangle } from 'pixi.js';

export type ChromeKind =
  'command' | 'medallion' | 'portrait' | 'card' | 'panel' | 'pile' | 'actions';
export interface ChromeState {
  kind: ChromeKind;
  primary?: boolean;
  selected?: boolean;
  disabled?: boolean;
  hovered?: boolean;
  pressed?: boolean;
  value?: number;
}

// One offscreen renderer for the whole interface, including native top-layer dialogs.
// Cached Pixi plates are copied into local canvases: no WebGL context per button,
// layout polling, continuous ticker or full-screen canvas obscuring the board.
let renderer: Promise<Application> | undefined;
const plates = new Map<string, HTMLCanvasElement>();
let cachedBytes = 0;
function application() {
  return (renderer ??= (async () => {
    const app = new Application();
    await app.init({
      width: 16,
      height: 16,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
    });
    return app;
  })());
}

function plate(width: number, height: number, state: ChromeState) {
  const g = new Graphics();
  const { kind, disabled, selected, primary, hovered, pressed } = state;
  const active = !disabled && (selected || primary);
  const edge = disabled ? 0x57544a : active ? 0xd9b774 : hovered ? 0xd4c5a3 : 0x8d7954;
  const dark = 0x0b100e;
  const fill = disabled ? 0x20241f : active ? 0x56452b : hovered ? 0x343c33 : 0x232c26;
  const cut = kind === 'panel' ? 14 : kind === 'card' || kind === 'portrait' ? 4 : 9;
  const polygon = (inset: number) => [
    inset + cut,
    inset,
    width - inset - cut,
    inset,
    width - inset,
    inset + cut,
    width - inset,
    height - inset - cut,
    width - inset - cut,
    height - inset,
    inset + cut,
    height - inset,
    inset,
    height - inset - cut,
    inset,
    inset + cut,
  ];
  if (kind === 'actions') {
    const count = Math.max(2, Math.min(state.value ?? 0, 4));
    const step = width / count;
    const r = Math.min(step * 0.42, height * 0.42);
    for (let i = 0; i < count; i++) {
      const x = step * (i + 0.5);
      const y = height / 2;
      const filled = i < (state.value ?? 0);
      g.poly([x, y - r, x + r, y, x, y + r, x - r, y])
        .fill(0x0b100e)
        .stroke({ color: 0x9a8153, width: 1.5 });
      g.poly([x, y - r + 4, x + r - 4, y, x, y + r - 4, x - r + 4, y]).fill(
        filled ? 0xe4c487 : 0x263126,
      );
      if (filled) {
        g.poly([x, y - r + 4, x, y + r - 4, x - r + 4, y]).fill(0xb18c4f);
        g.moveTo(x, y - r + 5)
          .lineTo(x + r - 5, y)
          .stroke({ color: 0xffedc1, width: 1.5 });
      }
    }
    return g;
  }
  if (kind === 'medallion') {
    const r = Math.min(width, height) / 2 - 2;
    g.circle(width / 2, height / 2, r)
      .fill(dark)
      .stroke({ color: edge, width: 1.5 });
    g.circle(width / 2, height / 2 - (pressed ? 0 : 1), r - 4)
      .fill(fill)
      .stroke({ color: edge, width: 0.7, alpha: 0.55 });
    return g;
  }
  if (kind === 'card' || kind === 'portrait') {
    // The art is the control's material; only its frame is drawn over it.
    g.poly(polygon(1)).stroke({ color: edge, width: selected ? 3 : 1.5 });
    if (selected || hovered) g.poly(polygon(4)).stroke({ color: 0xf2d39b, alpha: 0.75, width: 1 });
    return g;
  }
  g.poly(polygon(1)).fill(dark).stroke({ color: edge, width: 1.5 });
  g.poly(polygon(4))
    .fill(kind === 'panel' ? 0x151e19 : fill)
    .stroke({ color: edge, width: 0.65, alpha: 0.45 });
  // Broken highlights and inlaid corners give the plates depth without a CSS skin.
  g.moveTo(cut + 5, 5)
    .lineTo(width - cut - 5, 5)
    .stroke({ color: 0xf8e2b8, alpha: pressed ? 0.08 : active ? 0.42 : 0.18, width: 1 });
  g.moveTo(cut + 5, height - 5)
    .lineTo(width - cut - 5, height - 5)
    .stroke({ color: 0x000000, alpha: 0.7, width: 2 });
  if (width > 80 && height >= 42) {
    for (const x of [8, width - 8]) {
      g.circle(x, height / 2, 1.8).fill(edge);
      g.circle(x - 0.4, height / 2 - 0.5, 0.6).fill(0xf5dfb4);
    }
  }
  if (kind === 'panel') {
    for (const [x, y, sx, sy] of [
      [9, 9, 1, 1],
      [width - 9, 9, -1, 1],
      [9, height - 9, 1, -1],
      [width - 9, height - 9, -1, -1],
    ]) {
      g.moveTo(x, y + 18 * sy)
        .lineTo(x, y + 6 * sy)
        .lineTo(x + 6 * sx, y)
        .lineTo(x + 24 * sx, y)
        .stroke({ color: edge, width: 2, alpha: 0.8 });
    }
  }
  if (kind === 'pile') {
    const x = width / 2;
    const y = height * 0.42;
    const r = Math.min(width * 0.25, height * 0.2);
    g.poly([x, y - r, x + r, y, x, y + r, x - r, y]).stroke({ color: edge, width: 2 });
    g.poly([x, y - r + 7, x + r - 7, y, x, y + r - 7, x - r + 7, y]).stroke({
      color: edge,
      width: 0.75,
    });
    g.moveTo(x - r, y)
      .lineTo(x + r, y)
      .moveTo(x, y - r)
      .lineTo(x, y + r)
      .stroke({ color: edge, width: 0.75, alpha: 0.6 });
    g.circle(x, y, 3).fill(edge);
  }
  return g;
}

export function mountChrome(canvas: HTMLCanvasElement, state: () => ChromeState) {
  const host = canvas.parentElement!;
  let disposed = false;
  let revision = 0;
  let previousKey = '';
  const draw = async () => {
    const current = ++revision;
    const width = Math.round(host.clientWidth);
    const height = Math.round(host.clientHeight);
    if (width < 10 || height < 10) return;
    const resolution = Math.min(devicePixelRatio || 1, 2);
    const appearance = state();
    const key = JSON.stringify([width, height, resolution, appearance]);
    if (key === previousKey && host.dataset.chromeReady) return;
    try {
      const app = await application();
      if (disposed || revision !== current) return;
      let image = plates.get(key);
      if (!image) {
        const graphics = plate(width, height, appearance);
        image = app.renderer.extract.canvas({
          target: graphics,
          frame: new Rectangle(0, 0, width, height),
          resolution,
        }) as HTMLCanvasElement;
        graphics.destroy();
        const bytes = image.width * image.height * 4;
        while (plates.size && (plates.size >= 96 || cachedBytes + bytes > 24 * 1024 * 1024)) {
          const oldest = plates.keys().next().value!;
          const entry = plates.get(oldest)!;
          cachedBytes -= entry.width * entry.height * 4;
          plates.delete(oldest);
        }
        plates.set(key, image);
        cachedBytes += bytes;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = image.width;
      canvas.height = image.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      host.dataset.chromeReady = 'true';
      previousKey = key;
    } catch {
      // CSS material remains usable on devices without a graphics context.
    }
  };
  const resize = new ResizeObserver(() => void draw());
  resize.observe(host);
  void draw();
  return {
    draw,
    destroy() {
      disposed = true;
      revision++;
      resize.disconnect();
    },
  };
}
