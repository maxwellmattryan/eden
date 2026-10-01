// The words Hearth must never suggest (D-25): the owner's food allergies, medical dietary restrictions and dislikes,
// read from the profile on this device and never sent. `null` until they have been read, and when they cannot be:
// the filter fails closed on `null`, so nothing is suggested on an unread profile.
import { forbiddenWords } from '@eden/shared/domains/kitchen'
import { queryFacts } from '@eden/shared/profile'

class Forbidden {
	words = $state<string[] | null>(null)

	/** Reads the words again; every suggestion is filtered on what the profile says now. */
	async read(): Promise<string[] | null> {
		try {
			const facts = await queryFacts({ types: ['allergy', 'medical-dietary-restriction', 'disliked-ingredient'] })
			this.words = forbiddenWords(facts)
		} catch {
			this.words = null
		}
		return this.words
	}
}

export const forbidden = new Forbidden()
