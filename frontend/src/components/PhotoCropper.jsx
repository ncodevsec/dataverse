import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Button, Modal } from './ui.jsx';
import { cropToBlob } from '../lib/image.js';
import { useToast } from '../context/AppContext.jsx';

/** Square, round-guided crop with zoom and rotate. Calls onDone(blob) with the cropped image. */
export default function PhotoCropper({ file, onCancel, onDone }) {
  const toast = useToast();
  const [url, setUrl] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u); setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); setArea(null);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const onComplete = useCallback((_, pixels) => setArea(pixels), []);
  async function apply() {
    if (!area) return;
    setBusy(true);
    try { onDone(await cropToBlob(file, area, rotation)); }
    catch (e) { toast.error(e.message || 'Could not crop that image'); } finally { setBusy(false); }
  }

  return (
    <Modal open={!!file} onClose={onCancel} title="Crop photo"
      footer={<><Button type="button" onClick={onCancel}>Cancel</Button><Button type="button" variant="primary" loading={busy} disabled={!area} onClick={apply}>Use this crop</Button></>}>
      <div className="relative h-72 w-full overflow-hidden rounded-xl bg-black sm:h-80">
        {url && <Cropper image={url} crop={crop} zoom={zoom} rotation={rotation} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onRotationChange={setRotation} onCropComplete={onComplete} />}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm"><span className="mb-1 block font-medium">Zoom</span>
          <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Zoom" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Rotate</span>
          <input type="range" min="-180" max="180" step="1" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Rotate" /></label>
      </div>
      <p className="mt-3 text-xs text-muted">Drag to move, pinch or use the sliders to zoom. When you save the profile, the photo is compressed so it loads fast.</p>
    </Modal>
  );
}
