// The data layer for the apps (docs/engineering/data-layer.md): the owner's rows, read and written through the
// crate under Tauri and through the engine in a plain browser.
export * from './bundle.js'
export * from './client.js'
export { DataError, dataErrorCode } from './errors.js'
export { importLegacyDocument } from './legacy.js'
export { MIN_STAMP, stampToDate } from './hlc.js'
export { WriteQueue, type Write } from './queue.js'
export * from './types.js'
export { isUlid, newId } from './ulid.js'
export { isResourceId, parseUri, toUri } from './uri.js'
