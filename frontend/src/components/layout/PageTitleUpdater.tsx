import { usePageTitle } from '@/hooks/usePageTitle';

/**
 * Global component to handle page title updates.
 * Must be rendered inside BrowserRouter.
 */
export function PageTitleUpdater() {
    usePageTitle();
    return null;
}
