// Entity URIs (D-24): `eden://<type>/<id>`, where the type is a registry id and the id a ULID.
import { isUlid } from './ulid.js'

const SCHEME = 'eden://'
const RESOURCE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Whether `id` can name a resource in the registry: kebab-case, no domain prefix, no dot (D-36). */
export function isResourceId(id: string): boolean {
	return RESOURCE_ID.test(id)
}

export function toUri(type: string, id: string): string {
	return `${SCHEME}${type}/${id}`
}

export function parseUri(uri: string): { type: string; id: string } | null {
	if (!uri.startsWith(SCHEME)) return null
	const [type = '', id = '', ...rest] = uri.slice(SCHEME.length).split('/')
	if (rest.length || !isResourceId(type) || !isUlid(id)) return null
	return { type, id }
}
