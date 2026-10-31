// Desktop's half of the Sync tab's file port (`@eden/shared/shell/settings`, archive-files.ts): the system's save
// and open dialogs, each answering a path the crate reads or writes itself.
import { open, save } from '@tauri-apps/plugin-dialog'
import type { ArchiveFiles } from '@eden/shared/shell/settings'

const ARCHIVE = [{ name: 'Eden', extensions: ['zip'] }]

export const archiveFiles: ArchiveFiles = {
	target: (name) => save({ defaultPath: name, filters: ARCHIVE }),
	async choose() {
		const path = await open({ multiple: false, directory: false, filters: ARCHIVE })
		return typeof path === 'string' ? path : null
	},
}
