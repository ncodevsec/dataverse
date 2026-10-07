// Female-photo privacy: blur on/off, only for female profiles, and the click -> confirm -> view flow.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Avatar } from '../src/components/ui.jsx';
import { RevealablePhoto } from '../src/components/Photos.jsx';
import { SiteProvider } from '../src/context/AppContext.jsx';

const mockSettings = (blur) => {
  globalThis.fetch = async () => new Response(JSON.stringify({ settings: { siteName: 'X', siteDescription: '', registrationEnabled: true, defaultTheme: 'system', blurFemalePhotos: blur } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const wrap = (ui) => render(<MemoryRouter><SiteProvider>{ui}</SiteProvider></MemoryRouter>);
const filterOf = (img) => img.style.filter;
afterEach(cleanup);

describe('photo blur', () => {
  it('blurs only female photos when ON, and nobody when OFF', async () => {
    mockSettings(true);
    wrap(<><Avatar src="/f.jpg" name="Fem" gender="FEMALE" /><Avatar src="/m.jpg" name="Male" gender="MALE" /><Avatar src="/o.jpg" name="Org" /></>);
    await screen.findAllByRole('img', { hidden: true });
    await new Promise((r) => setTimeout(r, 30));
    const imgs = [...document.querySelectorAll('img')];
    expect(filterOf(imgs[0])).toMatch(/blur/);
    expect(filterOf(imgs[1])).toBe('');
    expect(filterOf(imgs[2])).toBe('');
    cleanup();
    mockSettings(false);
    wrap(<Avatar src="/f.jpg" name="Fem" gender="FEMALE" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(filterOf(document.querySelector('img'))).toBe('');
  });

  it('is blurred until the settings are known (no unblurred flash)', () => {
    globalThis.fetch = () => new Promise(() => {}); // never resolves
    wrap(<Avatar src="/f.jpg" name="Fem" gender="FEMALE" />);
    expect(filterOf(document.querySelector('img'))).toMatch(/blur/);
  });

  it('profile photo: click -> popup with blurred photo -> Cancel keeps it blurred; View un-blurs only inside the popup', async () => {
    mockSettings(true);
    wrap(<RevealablePhoto src="/f.jpg" name="Fem" gender="FEMALE" />);
    await new Promise((r) => setTimeout(r, 30));
    fireEvent.click(screen.getByRole('button', { name: /View photo of Fem/ }));
    const dialog = screen.getByRole('dialog');
    const popupImg = dialog.querySelector('img');
    expect(filterOf(popupImg)).toMatch(/blur\(18px\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // asked again next time
    fireEvent.click(screen.getByRole('button', { name: /View photo of Fem/ }));
    expect(filterOf(screen.getByRole('dialog').querySelector('img'))).toMatch(/blur/);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(filterOf(screen.getByRole('dialog').querySelector('img'))).toBe('none');
    expect(filterOf(document.querySelector('button[aria-label^="View photo"] img'))).toMatch(/blur/); // the page photo stays blurred
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));
    fireEvent.click(screen.getByRole('button', { name: /View photo of Fem/ }));
    expect(filterOf(screen.getByRole('dialog').querySelector('img'))).toMatch(/blur/); // reset after closing
  });

  it('no popup when the feature is OFF or the person is not female', async () => {
    mockSettings(false);
    wrap(<RevealablePhoto src="/f.jpg" name="Fem" gender="FEMALE" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('button', { name: /View photo/ })).toBeNull();
    cleanup(); mockSettings(true);
    wrap(<RevealablePhoto src="/m.jpg" name="Man" gender="MALE" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('button', { name: /View photo/ })).toBeNull();
  });
});
