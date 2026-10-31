// The phone's half of the Sync tab's file port (`@eden/shared/shell/settings`, archive-files.ts;
// D-161). The crate reads and writes paths with the standard library, and a phone's pickers do not
// answer one it can use (Android's answer a `content://` address), so both ways go through Eden's own folder:
//   - import: the file comes from a file input, is written to `<data dir>/imports/`, and the crate reads it there;
//   - export: the crate writes to `<data dir>/exports/` as it does by default, then the system's save dialog says
//     where a copy goes. A cancel, or a system that will not take the copy, leaves the archive where it is, and the
//     tab says so.
// Nothing here runs in the browser build (the tab shows its "installed app" notice instead), so none of it is
// proven short of a device: see docs/engineering/data-layer.md, "The bundle".
import { save } from '@tauri-apps/plugin-dialog'
import { copyFile, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs'
import { getAppInfo } from '@eden/shared/api'
import type { ArchiveFiles } from '@eden/shared/shell/settings'

const ARCHIVE = [{ name: 'Eden', extensions: ['zip'] }]

/** A file name with nothing in it that could leave the folder it is written to. */
const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'archive.zip'

export const archiveFiles: ArchiveFiles = {
	async stage(file) {
		const { dataDir } = await getAppInfo()
		const folder = `${dataDir}/imports`
		await mkdir(folder, { recursive: true })
		const path = `${folder}/${Date.now()}-${safeName(file.name)}`
		await writeFile(path, new Uint8Array(await file.arrayBuffer()))
		return path
	},
	discard: (path) => remove(path),
	async deliver(path, name) {
		try {
			const target = await save({ defaultPath: name, filters: ARCHIVE })
			if (!target) return 'kept'
			try {
				await copyFile(path, target)
			} catch {
				// an address the file calls cannot copy to (Android's) may still be written to
				await writeFile(target, await readFile(path))
			}
			return 'saved'
		} catch {
			return 'kept'
		}
	},
}
