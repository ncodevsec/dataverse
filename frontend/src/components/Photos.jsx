import { useState } from 'react';
import { Avatar, Button, Modal, cx, useBlur } from './ui.jsx';

/**
 * Profile-page photo. When the privacy blur applies, clicking it opens a confirmation dialog that shows the blurred photo;
 * only "View" removes the blur (inside the dialog). Closing the dialog starts over, so it is asked every time.
 */
export function RevealablePhoto({ src, name, gender, size = 'xl' }) {
  const protectedPhoto = useBlur(gender) && !!src;
  const [open, setOpen] = useState(false);
  const [clear, setClear] = useState(false);
  if (!protectedPhoto) return <Avatar src={src} name={name} gender={gender} size={size} />;
  const close = () => { setOpen(false); setClear(false); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`View photo of ${name}`} title="Click to view"
        className="shrink-0 cursor-zoom-in rounded-full transition-opacity hover:opacity-90"><Avatar src={src} name={name} gender={gender} size={size} /></button>
      <Modal open={open} onClose={close} size="sm" title={clear ? name : 'View this photo?'}
        footer={clear ? <Button variant="primary" onClick={close}>Close</Button> : <><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={() => setClear(true)}>View</Button></>}>
        <div className="flex justify-center">
          <div className="h-64 w-64 max-w-full overflow-hidden rounded-2xl border border-line bg-surface-2">
            <img src={src} alt={clear ? `Photo of ${name}` : ''} className={cx('h-full w-full object-cover transition-[filter] duration-300', !clear && 'scale-110 select-none')} style={{ filter: clear ? 'none' : 'blur(18px)' }} />
          </div>
        </div>
        {!clear && <p className="mt-3 text-center text-sm text-muted">This photo is blurred for privacy. Do you want to see the original?</p>}
      </Modal>
    </>
  );
}
