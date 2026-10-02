// Whether the Gardener's page is drawn for a phone: the app's root says so (`data-platform`, set in its app.html).
// The tables' columns are built in script, and the kit has no media queries to ask, so the page asks the platform
// and not its own width: a narrow desktop page keeps every column and scrolls sideways, as it always has
// (D-TBD(gardener-page-phone)).
export function compactPage(): boolean {
	return typeof document !== 'undefined' && document.documentElement.dataset.platform === 'mobile'
}
