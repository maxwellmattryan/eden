// The export bundle and its import (docs/engineering/data-layer.md, "The bundle"): a zip archive of the owner's rows
// as plain files. The crate writes and reads it; a plain browser has no file to write to, so there these reject with
// `unavailable`.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../api/tauri.js'
import { DataError } from './errors.js'

/** The whole workspace, or what one domain owns. */
export type BundleScope = { kind: 'full' } | { kind: 'domain'; domain: string }

/**
 * `merge`: rows win by stamp, and what is already here and the same is skipped. `replace`: what the scope holds is
 * cleared first, after a backup of the whole workspace, and the bundle's rows take its place.
 */
export type ImportMode = 'merge' | 'replace'

export interface BundleFile {
	path: string
	sha256: string
	bytes: number
	/** For a file of rows: how many, tombstones included. */
	rows?: number
	tombstones?: number
}

export interface BundleManifest {
	format: string
	formatVersion: number
	schemaVersion: number
	app: { version: string; channel: string }
	/** When it was written, as an instant. */
	createdAt: string
	node: string
	scope: BundleScope
	/** The live rows of each type. */
	counts: Record<string, number>
	files: BundleFile[]
}

/** A file the frontend writes into the bundle, under `friendly/`: the formats made for reading. */
export interface BundleExtra {
	path: string
	content: string
}

export interface ExportRequest {
	scope: BundleScope
	/** Where to write the archive; the app data dir's `exports/` when it is left out. */
	path?: string
	/** The settings to carry, which live in the frontend. Full scope only. */
	settings?: Record<string, string>
	extras?: BundleExtra[]
}

export interface ExportResult {
	path: string
	counts: Record<string, number>
	bytes: number
}

export interface ImportSummary {
	mode: ImportMode
	scope: BundleScope
	inserted: number
	updated: number
	skipped: number
	/** Rows deleted because only one of them can be: a second home, a second overlay of one mirror. */
	tombstoned: number
	/** Types the bundle holds that this build does not know. Their rows are kept. */
	unknownTypes: string[]
	/** The backup a replace wrote before it cleared anything. */
	backupPath: string | null
	/** The settings the bundle carries. */
	settings: Record<string, string> | null
}

async function command<T>(name: string, args: Record<string, unknown>): Promise<T> {
	if (!isTauri()) throw new DataError('unavailable', 'bundles are written and read by the app')
	return invoke<T>(name, args)
}

export function exportBundle(request: ExportRequest): Promise<ExportResult> {
	return command('export_bundle', { request })
}

/** The manifest of a bundle, once every file in it has been checked against its hash. */
export function inspectBundle(path: string): Promise<BundleManifest> {
	return command('inspect_bundle', { path })
}

export function importBundle(path: string, mode: ImportMode): Promise<ImportSummary> {
	return command('import_bundle', { path, mode })
}

/** The rows a bundle or an import counts, of every type together. */
export function totalRows(counts: Record<string, number>): number {
	return Object.values(counts).reduce((sum, count) => sum + count, 0)
}
