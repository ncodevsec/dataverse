import { EmptyState, LinkButton } from '../components/ui.jsx';
export default function NotFound() {
  return <EmptyState title="Page not found" icon="search" action={<LinkButton to="/" variant="primary">Go home</LinkButton>}>The page you're looking for doesn't exist or was moved.</EmptyState>;
}
