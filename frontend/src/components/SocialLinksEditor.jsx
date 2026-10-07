import { Button, IconButton, TextField } from './ui.jsx';

export const NETWORKS = [['facebook', 'Facebook', 'Profile link or username'], ['instagram', 'Instagram', 'Profile link or @username'], ['tiktok', 'TikTok', 'Profile link or @username']];
export const emptySocial = () => Object.fromEntries(NETWORKS.map(([k]) => [k, ['']]));

/** Form state for social links coming from the API (at least one empty input per network). */
export const socialToForm = (links) => Object.fromEntries(NETWORKS.map(([k]) => [k, links?.[k]?.length ? [...links[k]] : ['']]));
/** Form state -> API payload (blank inputs dropped). */
export const socialToPayload = (form) => Object.fromEntries(NETWORKS.map(([k]) => [k, (form[k] || []).map((v) => v.trim()).filter(Boolean)]));

/** Several accounts of one social network: one input per account, with add / remove. */
export default function SocialLinksEditor({ value, onChange, errors }) {
  const set = (net, list) => onChange({ ...value, [net]: list });
  return (
    <div className="space-y-5 sm:col-span-2">
      {NETWORKS.map(([net, label, hint]) => {
        const list = value[net] || [''];
        return (
          <fieldset key={net}>
            <legend className="mb-1.5 text-sm font-medium">{label}{list.filter(Boolean).length > 1 && <span className="ml-1 text-muted">({list.filter(Boolean).length} accounts)</span>}</legend>
            <div className="space-y-2">
              {list.map((v, i) => (
                <div key={i} className="flex items-start gap-1">
                  <TextField className="flex-1" aria-label={`${label} account ${i + 1}`} value={v} placeholder={i === 0 ? hint : `Another ${label} account`} maxLength={255}
                    onChange={(e) => set(net, list.map((x, j) => (j === i ? e.target.value : x)))} />
                  {list.length > 1 && <IconButton icon="x" label={`Remove ${label} account ${i + 1}`} className="mt-0.5" onClick={() => set(net, list.filter((_, j) => j !== i))} />}
                </div>
              ))}
            </div>
            {list.length < 10 && <Button type="button" size="sm" variant="ghost" icon="plus" className="mt-1 -ml-2" onClick={() => set(net, [...list, ''])}>Add another {label} account</Button>}
          </fieldset>
        );
      })}
      {errors?.socialLinks && <p className="text-xs text-danger" role="alert">{String(errors.socialLinks)}</p>}
    </div>
  );
}

