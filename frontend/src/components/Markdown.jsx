import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cx } from './ui.jsx';

/**
 * Renders user-written Markdown safely: raw HTML is never interpreted (react-markdown escapes it), dangerous URL schemes
 * (javascript:, data:) are stripped by react-markdown's URL filter, images are not rendered (no remote tracking pixels,
 * and the CSP blocks them anyway), and every link opens in a new tab with noopener/nofollow.
 */
export default function Markdown({ children, className }) {
  return (
    <div className={cx('md text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={['img']}
        components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" /> }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
