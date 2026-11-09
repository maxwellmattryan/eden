// The payoff plan's inputs for the session (#86, D-201): the strategy and the extra each month as typed, held in module
// state only, as Activity's chips are (D-199). Moving between tabs and places keeps them; a reload or quitting the app
// wipes them. Nothing here is written to storage, the database or the address.
import type { Strategy } from './debt.js'

export class DebtSession {
	strategy = $state<Strategy>('interest')
	/** The extra each month as the owner typed it, in the home currency. */
	extra = $state('')
}

export const debtSession = new DebtSession()
