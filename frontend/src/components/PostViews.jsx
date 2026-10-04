import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Markdown from './Markdown.jsx';
import ProfilePicker from './ProfilePicker.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, IconButton, Modal, SelectField, Tabs, TextArea, TextField, apiErrors, cx } from './ui.jsx';
import { useToast } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { fmtDateTime, timeAgo } from '../lib/format.js';

export function TagChip({ tag, active, onRemove }) {
  const cls = cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors', active ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent hover:opacity-80');
  return onRemove
    ? <span className={cls}>#{tag}<button type="button" onClick={onRemove} aria-label={`Remove tag ${tag}`} className="-mr-1 rounded-full px-1 hover:bg-black/10">×</button></span>
    : <Link to={`/posts?tag=${encodeURIComponent(tag)}`} className={cls}>#{tag}</Link>;
}

/** Type a tag and press Enter or comma. Tags are stored lower-case without '#'. */
export function TagInput({ label = 'Tags', value, onChange, error, max = 10 }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const t = raw.trim().replace(/^#+/, '').toLowerCase().slice(0, 40);
    if (t && !value.includes(t) && value.length < max) onChange([...value, t]);
    setText('');
  };
  return (
    <TextField label={label} value={text} error={error} placeholder={value.length >= max ? `Up to ${max} tags` : 'Type a tag and press Enter'}
      hint={value.length ? undefined : 'Tags help people find related posts, e.g. family, eid, wedding'} disabled={value.length >= max}
      onChange={(e) => { const v = e.target.value; if (v.includes(',')) v.split(',').forEach((p, i, a) => { if (i < a.length - 1) add(p); else setText(p); }); else setText(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
      onBlur={() => add(text)}
    />
  );
}

function TagList({ value, onChange }) {
  if (!value.length) return null;
  return <div className="-mt-1 flex flex-wrap gap-1.5">{value.map((t) => <TagChip key={t} tag={t} onRemove={() => onChange(value.filter((x) => x !== t))} />)}</div>;
}

export function PostCard({ post, showProfile = true, onEdit, onDelete }) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const content = full ?? post.content;
  const expand = async () => {
    setLoading(true);
    try { setFull((await api.get(`/posts/${post.id}`)).post.content); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {showProfile && <Link to={`/profiles/${post.profile.id}`} aria-label={`About ${post.profile.name}`}><Avatar src={post.profile.photoUrl} name={post.profile.name} size="sm" /></Link>}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug">{post.title} {post.status !== 'published' && <Badge tone="warn">{post.status}</Badge>}</h3>
          <p className="text-xs text-muted">
            {showProfile && <>About <Link to={`/profiles/${post.profile.id}`} className="text-ink hover:text-accent">{post.profile.name}</Link> · </>}
            {post.author ? `by ${post.author.name}` : 'by a removed account'} · <time dateTime={post.createdAt} title={fmtDateTime(post.createdAt)}>{timeAgo(post.createdAt)}</time>
          </p>
        </div>
        {post.canManage && <div className="flex shrink-0">{onEdit && <IconButton icon="edit" label="Edit post" onClick={() => onEdit(post)} />}{onDelete && <IconButton icon="trash" label="Delete post" onClick={() => onDelete(post)} />}</div>}
      </div>
      {content && <Markdown className="mt-3">{content}</Markdown>}
      {post.truncated && full === null && <Button size="sm" variant="ghost" className="mt-1 -ml-2" loading={loading} onClick={expand}>Read more</Button>}
      {post.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{post.tags.map((t) => <TagChip key={t} tag={t} />)}</div>}
    </Card>
  );
}

/** Create / edit dialog with a Markdown preview. Pass `profile` to fix the subject, otherwise a picker is shown. */
export function PostEditor({ open, post, profile, onClose, onSaved }) {
  const toast = useToast();
  const blank = { title: '', content: '', status: 'published', tags: [] };
  const [form, setForm] = useState(blank);
  const [subject, setSubject] = useState(null);
  const [tab, setTab] = useState('write');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(post ? { title: post.title, content: post.content, status: post.status, tags: post.tags } : blank);
    setSubject(profile?.id ?? post?.profile?.id ?? null); setTab('write'); setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post, profile?.id]);

  async function save(e) {
    e?.preventDefault();
    if (!post && !subject) { setErrors({ profileId: 'Choose who this post is about' }); return; }
    setBusy(true); setErrors({});
    try {
      if (post) await api.patch(`/posts/${post.id}`, form); else await api.post('/posts', { ...form, profileId: subject });
      toast.success(post ? 'Post updated' : 'Post published'); onSaved?.(); onClose();
    } catch (err) { setErrors(apiErrors(err)); toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title={post ? 'Edit post' : 'New post'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{post ? 'Save post' : 'Publish'}</Button></>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        {!post && !profile && <ProfilePicker label="Who is this post about?" value={subject} onChange={setSubject} error={errors.profileId} />}
        <TextField label="Title" required value={form.title} error={errors.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'write', label: 'Write' }, { id: 'preview', label: 'Preview' }]} className="mb-3" />
          {tab === 'write'
            ? <TextArea label="Post" rows={9} value={form.content} error={errors.content} maxLength={20000} onChange={(e) => setForm({ ...form, content: e.target.value })}
                hint="Markdown is supported: **bold**, *italic*, # headings, - lists, > quotes, [links](https://…), `code`." className="font-mono" />
            : <div className="min-h-[12rem] rounded-lg border border-line p-3">{form.content.trim() ? <Markdown>{form.content}</Markdown> : <p className="text-sm text-muted">Nothing to preview yet.</p>}</div>}
        </div>
        <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} error={errors.tags} />
        <TagList value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
        <SelectField label="Visibility" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="published">Published (all members can see it)</option><option value="draft">Draft (only you and editors)</option><option value="archived">Archived</option>
        </SelectField>
        <button type="submit" className="sr-only">Save</button>
      </form>
    </Modal>
  );
}

/** Shared create / edit / delete plumbing for any list of posts. */
export function usePostDialogs({ reload, profile }) {
  const toast = useToast();
  const [editing, setEditing] = useState(undefined); // undefined closed | null new | post
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const openEdit = async (p) => { try { setEditing(p.truncated ? (await api.get(`/posts/${p.id}`)).post : p); } catch (e) { toast.error(e.message); } };
  async function remove() {
    setBusy(true);
    try { await api.del(`/posts/${del.id}`); toast.success('Post deleted'); setDel(null); reload(); } catch (e) { toast.error(e.message); setDel(null); } finally { setBusy(false); }
  }
  const dialogs = (
    <>
      <PostEditor open={editing !== undefined} post={editing || undefined} profile={profile} onClose={() => setEditing(undefined)} onSaved={reload} />
      <ConfirmDialog open={!!del} danger title="Delete this post?" message={del ? `“${del.title}” will be permanently removed.` : ''} confirmLabel="Delete post" loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </>
  );
  return { openNew: () => setEditing(null), openEdit, askDelete: setDel, dialogs };
}
