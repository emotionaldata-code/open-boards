import { relative, sep } from 'node:path';
import express from 'express';

export function clientAssets(directory: string) {
  return express.static(directory, {
    setHeaders(res, file) {
      const path = relative(directory, file).split(sep).join('/');
      // Only generated, content-hashed URLs are safe to keep across deployments.
      const immutable =
        /^assets\/.+-[\w-]{8}\.(?:js|css)$/.test(path) ||
        /^artwork\/.+-[a-f0-9]{12}\.webp$/.test(path);
      res.setHeader(
        'Cache-Control',
        immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
}
