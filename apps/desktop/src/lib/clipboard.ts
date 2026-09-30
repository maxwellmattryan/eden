// Text onto the clipboard: through the crate's plugin in the app, through the browser's own in `yarn dev:web`.
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { isTauri } from '@eden/shared/api'

/** Copies the text; rejects when the clipboard refuses. */
export async function copyText(text: string): Promise<void> {
	if (isTauri()) await writeText(text)
	else await navigator.clipboard.writeText(text)
}
