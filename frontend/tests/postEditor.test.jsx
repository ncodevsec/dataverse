// Regression: clicking "Preview" in the post editor must neither save nor close the dialog.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PostEditor } from '../src/components/PostViews.jsx';
import { ToastProvider } from '../src/context/AppContext.jsx';

describe('PostEditor', () => {
  it('Preview tab switches view without submitting or closing', () => {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (...a) => { calls.push(a); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }); });
    const onClose = vi.fn(); const onSaved = vi.fn();
    render(<MemoryRouter><ToastProvider><PostEditor open profile={{ id: 1, name: 'X' }} post={undefined} onClose={onClose} onSaved={onSaved} /></ToastProvider></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText(/^Post/), { target: { value: '**bold** <b>raw</b>' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.queryByText('raw', { selector: 'b' })).toBeNull(); // raw HTML is not rendered as HTML
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Write' }));
    expect(screen.getByLabelText(/^Post/)).toBeTruthy();
    globalThis.fetch = realFetch; cleanup();
  });
});
