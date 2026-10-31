// A fact as a row of the profile page (docs/design/screens.md, `profile`): the value as one line, then the type,
// who wrote it and when it holds, the T2 lock, the Gardener's confidence, and how many requests read it.
import type { ListRowData, MenuItem } from '@eden/ui-kit'
import { stampToDate } from '../../data/index.js'
import { formatDateOf } from '../../dates/index.js'
import { formatValue, isExpired, weightOf, type Fact, type FactProposal } from '../../profile/index.js'
import { tierOf } from '../../registry/index.js'

export interface RowContext {
	t: (key: string, options?: { values: Record<string, string | number> }) => string
	lang: string
	/** Today, `YYYY-MM-DD`. */
	today: string
	/** How many Gardener requests read each fact, by id. */
	usage: Record<string, number>
	/** The name of an owner, for a fact a domain derived. */
	ownerName: (owner: string) => string
}

/** The row's calendar date, from its stamp; nothing for a row the store has not stamped yet. */
function dayOf(stamp: string): string | undefined {
	return stampToDate(stamp)?.toISOString().slice(0, 10)
}

/** What else accepting a proposal does, for its card: the value it takes the place of, and the day it holds until. */
export function proposalDetail(proposal: FactProposal, t: RowContext['t'], lang: string): string | undefined {
	const parts = [
		proposal.replaces
			? t('profile.proposal.replaces', {
					values: { value: formatValue(proposal.type, proposal.replaced, (key) => t(key)) },
				})
			: undefined,
		proposal.until ? t('profile.proposal.until', { values: { day: formatDateOf(proposal.until, lang) } }) : undefined,
	].filter((part) => part !== undefined)
	return parts.length ? parts.join(' · ') : undefined
}

export function provenanceLine(fact: Fact, ctx: RowContext): string {
	const values: Record<string, string> = {
		owner: ctx.ownerName(fact.type),
		source: fact.source ?? '',
	}
	return ctx.t(`profile.provenance.${fact.provenance}`, { values })
}

export function rowOf(fact: Fact, ctx: RowContext): ListRowData {
	const expired = isExpired(fact, ctx.today)
	const updated = dayOf(fact.updatedAt)
	const secondary = [ctx.t(`profile.facts.${fact.type}`), provenanceLine(fact, ctx)]
	if (updated) secondary.push(formatDateOf(updated, ctx.lang))
	if (expired && fact.validUntil) {
		secondary.push(ctx.t('profile.expired', { values: { date: formatDateOf(fact.validUntil, ctx.lang) } }))
	} else {
		if (fact.validFrom && fact.validFrom > ctx.today) {
			secondary.push(ctx.t('profile.since', { values: { date: formatDateOf(fact.validFrom, ctx.lang) } }))
		}
		if (fact.validUntil) {
			secondary.push(ctx.t('profile.until', { values: { date: formatDateOf(fact.validUntil, ctx.lang) } }))
		}
	}

	const badges: ListRowData['badges'] = []
	if (tierOf(fact.type) === 'T2') badges.push({ id: 'tier', kind: 'tier', label: 'T2' })
	if (fact.provenance === 'ai-inferred' && fact.confidence != null) {
		badges.push({
			id: 'ai',
			kind: 'ai',
			label: ctx.t('profile.confidence', { values: { percent: Math.round(fact.confidence * 100) } }),
		})
	}
	if (fact.provenance === 'integration' && fact.source)
		badges.push({ id: 'origin', kind: 'origin', label: fact.source })

	const weight = weightOf(fact.value)
	const chips: ListRowData['chips'] =
		weight === undefined
			? undefined
			: [
					{
						id: 'weight',
						label: ctx.t('profile.weight', { values: { percent: Math.round(weight * 100) } }),
						mono: true,
					},
				]

	const actions: MenuItem[] | undefined =
		fact.provenance === 'system-derived'
			? undefined
			: [
					{ id: 'edit', label: ctx.t('profile.edit'), icon: 'pencil' },
					{ id: 'window', label: ctx.t('profile.window'), icon: 'calendar' },
					...(expired ? [{ id: 'renew', label: ctx.t('profile.renew'), icon: 'refresh-cw' } as MenuItem] : []),
					{ id: 'delete', label: ctx.t('profile.delete'), icon: 'trash', destructive: true },
				]

	return {
		id: fact.id,
		primary: formatValue(fact.type, fact.value, ctx.t),
		secondary: secondary.join(' · '),
		chips,
		badges,
		meta: ctx.t('profile.usedBy', { values: { count: ctx.usage[fact.id] ?? 0 } }),
		done: expired,
		actions,
	}
}
