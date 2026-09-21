export type Theme = 'light' | 'dark';

/**
 * The theme is stored as `data-theme` on <html>, set before first paint by the
 * inline script in app.html and toggled from the controls panel. Reading it off
 * the DOM rather than a store means anything can change it — the toggle, the
 * boot script, devtools — and every subscriber stays in sync.
 */
export function currentTheme(): Theme {
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Subscribe to theme changes. Returns an unsubscribe. */
export function onThemeChange(fn: (theme: Theme) => void) {
	const observer = new MutationObserver(() => fn(currentTheme()));
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	return () => observer.disconnect();
}
