import { describe, expect, it } from 'vitest'
import {
	INITIAL_LOCK,
	LAUNCH_LOCK,
	lockAfterMs,
	parseLockAfter,
	relockDue,
	transition,
	type LockEvent,
	type LockState,
} from './relock.js'

const open: LockState = { phase: 'open', hiddenAt: null, failed: false, unavailable: false }
const held = (hiddenAt: number): LockState => ({ ...open, phase: 'held', hiddenAt })
const locked: LockState = { ...open, phase: 'locked' }
const failed: LockState = { ...locked, failed: true }
const unavailable: LockState = { ...INITIAL_LOCK }
const MINUTE = 60_000

describe('the phone lock', () => {
	const rows: [string, LockState, LockEvent, LockState][] = [
		['a lockable launch is locked', INITIAL_LOCK, { type: 'launch', lockable: true }, locked],
		[
			'a launch that is not lockable is open and unavailable',
			LAUNCH_LOCK,
			{ type: 'launch', lockable: false },
			unavailable,
		],
		['hide from open is held', open, { type: 'hide', now: 1000 }, held(1000)],
		['hide while held keeps when it first went', held(1000), { type: 'hide', now: 5000 }, held(1000)],
		['hide while locked stays locked', locked, { type: 'hide', now: 1000 }, locked],
		['hide does nothing while unavailable', unavailable, { type: 'hide', now: 1000 }, unavailable],
		['show within the window drops to open', held(0), { type: 'show', now: MINUTE - 1, afterMs: MINUTE }, open],
		['show at the window locks', held(0), { type: 'show', now: MINUTE, afterMs: MINUTE }, locked],
		['show past the window locks', held(0), { type: 'show', now: 20 * MINUTE, afterMs: 15 * MINUTE }, locked],
		['show after the clock went backwards locks', held(5000), { type: 'show', now: 4000, afterMs: MINUTE }, locked],
		['Immediately re-locks however short the time away', held(1000), { type: 'show', now: 1000, afterMs: 0 }, locked],
		['show while locked stays locked', locked, { type: 'show', now: 1, afterMs: MINUTE }, locked],
		['show while failed stays failed', failed, { type: 'show', now: 1, afterMs: MINUTE }, failed],
		['show does nothing while unavailable', unavailable, { type: 'show', now: 1, afterMs: 0 }, unavailable],
		['unlocked goes to open', locked, { type: 'unlocked' }, open],
		['unlocked clears the error', failed, { type: 'unlocked' }, open],
		['failed stays locked with the error set', locked, { type: 'failed' }, failed],
		['failed while open changes nothing', open, { type: 'failed' }, open],
		['an unlock that answers no-passcode ends open and unavailable', locked, { type: 'no-passcode' }, unavailable],
	]

	it.each(rows)('%s', (_name, state, event, expected) => {
		expect(transition(state, event)).toEqual(expected)
	})

	const due: [string, number | null, number, number, boolean][] = [
		['a cold launch is due', null, 0, MINUTE, true],
		['within the window is not due', 0, MINUTE - 1, MINUTE, false],
		['at the window is due', 0, MINUTE, MINUTE, true],
		['a clock that went backwards is due', 10, 5, MINUTE, true],
		['Immediately is always due', 10, 10, 0, true],
	]

	it.each(due)('relockDue: %s', (_name, hiddenAt, now, afterMs, expected) => {
		expect(relockDue(hiddenAt, now, afterMs)).toBe(expected)
	})
})

describe('Lock after', () => {
	const parsed: [string | null, string][] = [
		['immediately', 'immediately'],
		['1m', '1m'],
		['5m', '5m'],
		['15m', '15m'],
		[null, '1m'],
		['', '1m'],
		['off', '1m'],
		['30m', '1m'],
	]

	it.each(parsed)('parses %j as %s', (value, expected) => {
		expect(parseLockAfter(value)).toBe(expected)
	})

	const ms: [Parameters<typeof lockAfterMs>[0], number][] = [
		['immediately', 0],
		['1m', 60_000],
		['5m', 300_000],
		['15m', 900_000],
	]

	it.each(ms)('maps %s to %i ms', (value, expected) => {
		expect(lockAfterMs(value)).toBe(expected)
	})
})
