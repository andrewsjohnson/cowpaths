import { buildScene } from './scene.mjs';
import { renderScene } from './render.mjs';
self.onmessage = async ({ data }) => {
  const { id, history, settings, size, exporting } = data;
  try {
    const scene = buildScene(history, settings), canvas = new OffscreenCanvas(size, size);
    renderScene(canvas, scene, { width: size });
    if (exporting) self.postMessage({ id, blob: await canvas.convertToBlob({ type: 'image/png' }) });
    else { const bitmap = canvas.transferToImageBitmap(); self.postMessage({ id, bitmap, stats: scene.stats, cutoffMonth: scene.cutoffMonth }, [bitmap]); }
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
