// The rules behind BundleProtection's two fields (docs/engineering/data-layer.md, "Sealed bundle").

/** The crate's floor too (`sealed::check_passphrase`), in characters, not UTF-16 units. */
export const MIN_PASSPHRASE = 8

export type ProtectionState = {
	/** Long enough and confirmed: the passphrase may be used. */
	valid: boolean
	/** Show the too-short error: only once the field was left, and never while it is empty. */
	short: boolean
	/** Show the mismatch error: only once the confirm field holds something. */
	mismatch: boolean
}

/** What the fields say, given the passphrase, its confirmation and whether the passphrase field was left. */
export function protectionState(passphrase: string, confirm: string, left: boolean): ProtectionState {
	const length = [...passphrase].length
	return {
		valid: length >= MIN_PASSPHRASE && passphrase === confirm,
		short: left && length > 0 && length < MIN_PASSPHRASE,
		mismatch: confirm !== '' && passphrase !== confirm,
	}
}
