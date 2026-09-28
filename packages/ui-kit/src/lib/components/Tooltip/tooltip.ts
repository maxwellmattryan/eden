// The tooltip attachment: `<IconButton {@attach tooltip(s.back)} />`. One bubble, mounted into <body> the first time it
// is needed, serves every host: it moves to whichever control is hovered (mouse or pen, never touch) or focused from
// the keyboard, names it through aria-describedby while it shows, and hides on leave, blur, Escape, pointer down or
// when the host goes away. A tooltip is the visible form of a label that already exists (an icon's name, a collapsed
// subtitle); it is never the only place a fact lives, and it never appears on touch.
import { mount } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import { anchor } from '$lib/internal/anchor.js'
import { dismiss } from '$lib/internal/dismiss.js'
import { hasTopLayer } from '$lib/internal/portal.js'
import TooltipBubble from './TooltipBubble.svelte'

export interface TooltipOptions {
	/** The side of the host the bubble prefers; it flips when there is no room. */
	side?: 'top' | 'bottom'
	/** Hover delay in ms, 400 by default. There is none while another tooltip is still up or just closing. */
	delay?: number
}

const HIDE_DELAY = 100

// Client-only module state. The kit takes ids from $props.id(), but this element is mounted imperatively, outside any
// component tree, and tooltips never render on the server, so a fixed prefix plus a module counter cannot collide.
let counter = 0
let bubble: HTMLElement | undefined
let host: HTMLElement | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
let unanchor: (() => void) | undefined
let undismiss: (() => void) | undefined

function ensureBubble(): HTMLElement {
	if (bubble) return bubble
	const id = `ed-tooltip-${++counter}`
	// mount() builds the DOM synchronously, so the element exists as soon as this returns. The body is its home even
	// without the popover API: a sibling would break a <ul> host's list and a child would join a <button>'s name.
	mount(TooltipBubble, { target: document.body, props: { id } })
	bubble = document.getElementById(id)!
	return bubble
}

const describedBy = (el: HTMLElement) => (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)

function describe(el: HTMLElement, id: string) {
	const ids = describedBy(el)
	if (!ids.includes(id)) el.setAttribute('aria-describedby', [...ids, id].join(' '))
}

function undescribe(el: HTMLElement, id: string) {
	const ids = describedBy(el).filter((x) => x !== id)
	if (ids.length) el.setAttribute('aria-describedby', ids.join(' '))
	else el.removeAttribute('aria-describedby')
}

const cleanup = (off: void | (() => void)) => (typeof off === 'function' ? off : undefined)

function show(next: HTMLElement, text: string, side: 'top' | 'bottom') {
	const el = ensureBubble()
	clearTimeout(hideTimer)
	hideTimer = undefined
	if (host && host !== next) undescribe(host, el.id)
	host = next
	el.textContent = text
	// the preferred side first, so the unfurl starts from the right direction; anchor() corrects it if it must flip
	el.dataset.side = side
	describe(next, el.id)
	unanchor?.()
	undismiss?.()
	if (hasTopLayer()) {
		if (!el.matches(':popover-open')) el.showPopover()
	} else {
		el.dataset.open = ''
	}
	unanchor = cleanup(anchor(() => ({ anchor: next, side }))(el))
	undismiss = cleanup(dismiss(() => ({ onDismiss: () => hide(true), focusout: false, outside: false }))(el))
}

function settle() {
	hideTimer = undefined
	unanchor?.()
	unanchor = undefined
	undismiss?.()
	undismiss = undefined
	if (host && bubble) undescribe(host, bubble.id)
	host = undefined
	if (!bubble) return
	if (hasTopLayer()) {
		if (bubble.matches(':popover-open')) bubble.hidePopover()
	} else {
		delete bubble.dataset.open
	}
}

/** Hides after a short grace period, so moving between neighbouring controls does not flicker; `now` skips it. */
function hide(now = false) {
	clearTimeout(hideTimer)
	if (now) settle()
	else hideTimer = setTimeout(settle, HIDE_DELAY)
}

/** True while a tooltip is up or on its way out: the next host shows its own at once. */
const warm = () => host !== undefined

/**
 * Attaches a tooltip to a control: `<button {@attach tooltip(s.back)}>`. `text` may be a getter, read each time the
 * bubble opens, so a changing label needs no re-attachment. Shows after `delay` on hover (mouse or pen only) and at once
 * on keyboard focus; hides on leave, blur, pointer down, Escape, or when the host is removed.
 */
export function tooltip(text: string | (() => string), options: TooltipOptions = {}): Attachment<HTMLElement> {
	const { side = 'bottom', delay = 400 } = options
	const read = () => (typeof text === 'function' ? text() : text)
	return (el) => {
		let showTimer: ReturnType<typeof setTimeout> | undefined
		const cancel = () => {
			clearTimeout(showTimer)
			showTimer = undefined
		}
		const open = () => {
			const value = read()
			if (value) show(el, value, side)
		}
		const leave = (now = false) => {
			cancel()
			if (host === el) hide(now)
		}
		const onPointerEnter = (e: PointerEvent) => {
			if (e.pointerType === 'touch') return
			cancel()
			showTimer = setTimeout(open, warm() ? 0 : delay)
		}
		const onPointerLeave = () => leave()
		const onPointerDown = () => leave(true)
		const onFocusIn = () => {
			// keyboard focus only: a click or a tap focuses the control too, and neither wants a tooltip
			if (el.matches(':focus-visible') || el.querySelector(':focus-visible')) open()
		}
		const onFocusOut = (e: FocusEvent) => {
			if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return
			leave()
		}
		el.addEventListener('pointerenter', onPointerEnter)
		el.addEventListener('pointerleave', onPointerLeave)
		el.addEventListener('pointerdown', onPointerDown)
		el.addEventListener('focusin', onFocusIn)
		el.addEventListener('focusout', onFocusOut)
		return () => {
			el.removeEventListener('pointerenter', onPointerEnter)
			el.removeEventListener('pointerleave', onPointerLeave)
			el.removeEventListener('pointerdown', onPointerDown)
			el.removeEventListener('focusin', onFocusIn)
			el.removeEventListener('focusout', onFocusOut)
			leave(true)
		}
	}
}
