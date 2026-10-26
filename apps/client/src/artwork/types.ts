export interface RasterVariant {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export interface RasterAsset extends RasterVariant {
  kind: 'card' | 'portrait' | 'token';
  focal: [number, number];
  variants: RasterVariant[];
  anchor?: [number, number];
  scale?: number;
}

export type RasterManifest = Record<string, RasterAsset>;
