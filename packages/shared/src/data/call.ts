// One dispatcher for every command of the crate (docs/engineering/data-layer.md, "The frontend module"): under Tauri
// the call is the command, in a plain browser it goes to the engine over localStorage. The data layer, the grant
// store and the egress ledger share it, so they share the one engine and its document.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../api/tauri.js'
import { createEngine, type Engine } from './engine.js'
import { DataError } from './errors.js'

let engine: Engine | undefined

/** The engine over localStorage, made on first use. It rejects where there is no storage at all. */
export function fallback(): Engine {
	if (typeof localStorage === 'undefined') throw new DataError('unavailable', 'no storage to keep the data in')
	return (engine ??= createEngine(localStorage))
}

/** The command under Tauri, the engine elsewhere; the engine's errors reject as the command's would. */
export async function call<T>(
	command: string,
	args: Record<string, unknown>,
	local: (engine: Engine) => T
): Promise<T> {
	if (isTauri()) return invoke<T>(command, args)
	return local(fallback())
}
