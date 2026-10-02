// The store the phone's Grocery stands in (D-TBD(phone-grocery)): every list (`null`), one store's by its id, or
// Miscellaneous (''). Held for the session, so leaving the page in a shop and coming back finds the same list;
// never kept.
class GroceryStand {
	store = $state<string | null>(null)
}

export const groceryStand = new GroceryStand()
