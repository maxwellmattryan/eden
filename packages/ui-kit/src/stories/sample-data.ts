// The one fictional dataset every story uses, typed from docs/design/sample-data.md. Change both together.
// Owner: Rowan Hale (they/them), Austin, Texas. "Today" is Wednesday 2026-09-30, 07:40.

export const owner = {
	name: 'Rowan Hale',
	preferredName: 'Rowan',
	pronouns: 'they/them',
	city: 'Austin, Texas',
	locale: 'en',
	secondLocale: 'ja',
} as const

export const today = new Date(2026, 8, 30, 7, 40)

export type StockLocation = 'fridge' | 'freezer' | 'pantry' | 'counter' | 'household'
export interface StockItem {
	id: string
	name: string
	/** Who makes it and how much one package is, where the item has them (D-104). */
	brand?: string
	size?: string
	qty: string
	unit?: string
	location: StockLocation
	expiry?: string
	estimated?: boolean
	lowStock?: boolean
	/** A category id from `haulCategories`; its glyph is the row's picture when the item has no photo. */
	category?: string
}
export const stock: StockItem[] = [
	{
		id: 'st-01',
		name: 'Chicken thighs',
		qty: '900',
		unit: 'g',
		location: 'fridge',
		expiry: '10-02',
		category: 'meat-and-fish',
	},
	{
		id: 'st-02',
		name: 'Miso paste',
		qty: '400',
		unit: 'g',
		location: 'fridge',
		expiry: '12-15',
		estimated: true,
		category: 'condiments-and-spices',
	},
	{ id: 'st-03', name: 'Eggs', qty: '8', location: 'fridge', expiry: '10-14', category: 'dairy-and-eggs' },
	{
		id: 'st-04',
		name: 'Spinach',
		qty: '200',
		unit: 'g',
		location: 'fridge',
		expiry: '10-01',
		estimated: true,
		category: 'produce',
	},
	{
		id: 'st-05',
		name: 'Greek yogurt',
		brand: 'Fage',
		size: '500 g',
		qty: '500',
		unit: 'g',
		location: 'fridge',
		expiry: '10-06',
		category: 'dairy-and-eggs',
	},
	{ id: 'st-06', name: 'Lemons', qty: '3', location: 'fridge', expiry: '10-09', estimated: true, category: 'produce' },
	{ id: 'st-07', name: 'Tofu', qty: '400', unit: 'g', location: 'fridge', expiry: '10-03' },
	{
		id: 'st-08',
		name: 'Edamame',
		qty: '450',
		unit: 'g',
		location: 'freezer',
		expiry: '2027-01',
		estimated: true,
		category: 'frozen',
	},
	{
		id: 'st-09',
		name: 'Salmon fillets',
		qty: '2',
		location: 'freezer',
		expiry: '11-20',
		estimated: true,
		category: 'meat-and-fish',
	},
	{
		id: 'st-10',
		name: 'Corn tortillas',
		qty: '12',
		location: 'freezer',
		expiry: '12-01',
		estimated: true,
		category: 'grains-and-pasta',
	},
	{ id: 'st-11', name: 'Short-grain rice', qty: '2', unit: 'kg', location: 'pantry', category: 'grains-and-pasta' },
	{ id: 'st-12', name: 'Soba', qty: '300', unit: 'g', location: 'pantry', category: 'grains-and-pasta' },
	{ id: 'st-13', name: 'Canned black beans', qty: '2', location: 'pantry', category: 'canned-and-jarred' },
	{
		id: 'st-14',
		name: 'Olive oil',
		brand: 'H-E-B',
		size: '500 ml',
		qty: '500',
		unit: 'ml',
		location: 'pantry',
		category: 'condiments-and-spices',
	},
	{
		id: 'st-15',
		name: 'Soy sauce (low sodium)',
		qty: '300',
		unit: 'ml',
		location: 'pantry',
		category: 'condiments-and-spices',
	},
	{
		id: 'st-16',
		name: 'LMNT citrus',
		qty: '9',
		unit: 'packets',
		location: 'pantry',
		lowStock: true,
		category: 'supplements-and-mixes',
	},
	{
		id: 'st-17',
		name: 'Avocados',
		qty: '2',
		location: 'counter',
		expiry: '10-01',
		estimated: true,
		category: 'produce',
	},
	{ id: 'st-18', name: 'Garlic', qty: '1', unit: 'head', location: 'counter', category: 'produce' },
	{
		id: 'st-19',
		name: 'Bananas',
		qty: '4',
		location: 'counter',
		expiry: '10-02',
		estimated: true,
		category: 'produce',
	},
	// what is bought on the same trip and never cooked with (D-122)
	{
		id: 'st-30',
		name: 'Paper towels',
		brand: 'Bounty',
		size: '6 ct',
		qty: '4',
		unit: 'rolls',
		location: 'household',
		category: 'cleaning-and-laundry',
	},
	{ id: 'st-31', name: 'Dish soap', qty: '1', unit: 'bottle', location: 'household', category: 'cleaning-and-laundry' },
	{ id: 'st-32', name: 'Toothpaste', qty: '2', location: 'household', category: 'personal-care' },
]

/** What ran out lately (D-92): kept at nothing, each with the day it ran out, to be bought again. */
export const ranOut: (StockItem & { outOn: string })[] = [
	{
		id: 'st-20',
		name: 'Whole milk',
		qty: '0',
		unit: 'l',
		location: 'fridge',
		category: 'dairy-and-eggs',
		outOn: '09-29',
	},
	{
		id: 'st-21',
		name: 'Rolled oats',
		qty: '0',
		unit: 'g',
		location: 'pantry',
		category: 'grains-and-pasta',
		outOn: '09-27',
	},
]

export interface HaulRow {
	id: string
	name: string
	/** The maker and the package, apart from the name (D-104), and what one cost on the receipt (D-105). */
	brand?: string
	size?: string
	price?: number
	qty: string
	unit?: string
	location: StockLocation
	/** An ISO date. */
	expiry?: string
	estimated?: boolean
	/** A category id from `haulCategories`. */
	category?: string
	/** A storage tip worth showing beside the row. */
	tip?: string
	/** The stock item the row would merge into, and whether it will. */
	merge?: { name: string; on: boolean }
}
/** The categories a stock item or a haul row may be filed under: the app's fifteen, id and English name;
 * the three before Other are a household item's (D-122). */
export const haulCategories = [
	{ id: 'produce', label: 'Produce' },
	{ id: 'meat-and-fish', label: 'Meat and fish' },
	{ id: 'dairy-and-eggs', label: 'Dairy and eggs' },
	{ id: 'bakery', label: 'Bakery' },
	{ id: 'grains-and-pasta', label: 'Grains and pasta' },
	{ id: 'canned-and-jarred', label: 'Canned and jarred' },
	{ id: 'frozen', label: 'Frozen' },
	{ id: 'snacks', label: 'Snacks' },
	{ id: 'drinks', label: 'Drinks' },
	{ id: 'condiments-and-spices', label: 'Condiments and spices' },
	{ id: 'supplements-and-mixes', label: 'Supplements and mixes' },
	{ id: 'cleaning-and-laundry', label: 'Cleaning and laundry' },
	{ id: 'personal-care', label: 'Personal care' },
	{ id: 'health', label: 'Health' },
	{ id: 'other', label: 'Other' },
]
/**
 * The captured haul: 09-29 18:12, read by Anthropic's Haiku for about 0.6 cents from a photo of the bags, a photo of
 * the receipt, the order's PDF and a pasted list. 11 recognised, 2 merge, 1 was a misread. Every row has a category
 * but the tofu, which the capture could not place; the spinach carries a storage tip.
 */
export const haul = {
	/** The stores the haul may have been bought at, and the one its receipt names (D-105). */
	stores: [
		{ id: 'gs-01', label: 'H-E-B' },
		{ id: 'gs-02', label: 'Target' },
	],
	store: 'gs-01',
	provider: 'Anthropic',
	model: 'Haiku',
	cost: '0.6 ¢',
	capturedAt: '09-29 18:12',
	sources: [
		{ key: 'src-1', name: 'haul.jpg', detail: '2.4 MB' },
		{ key: 'src-2', name: 'receipt.jpg', detail: '840 KB' },
		{ key: 'src-3', name: 'heb-order.pdf', detail: '1.2 MB' },
		{ key: 'src-4', name: 'Pasted text', detail: '6 lines' },
	],
	rows: [
		{
			id: 'h-01',
			name: 'Chicken thighs',
			qty: '900',
			unit: 'g',
			location: 'fridge',
			expiry: '2026-10-02',
			category: 'meat-and-fish',
		},
		{
			id: 'h-02',
			name: 'Eggs',
			qty: '12',
			location: 'fridge',
			expiry: '2026-10-14',
			category: 'dairy-and-eggs',
			merge: { name: 'Eggs', on: true },
		},
		{
			id: 'h-03',
			name: 'Spinach',
			qty: '200',
			unit: 'g',
			location: 'fridge',
			expiry: '2026-10-01',
			estimated: true,
			category: 'produce',
			tip: 'Wrap in a dry towel inside the bag; it wilts fastest in the door.',
			merge: { name: 'Spinach', on: true },
		},
		{
			id: 'h-04',
			name: 'Greek yogurt',
			brand: 'Fage',
			size: '500 g',
			price: 5.49,
			qty: '500',
			unit: 'g',
			location: 'fridge',
			expiry: '2026-10-06',
			category: 'dairy-and-eggs',
		},
		{
			id: 'h-05',
			name: 'Lemons',
			price: 0.5,
			qty: '3',
			location: 'fridge',
			expiry: '2026-10-09',
			estimated: true,
			category: 'produce',
		},
		{ id: 'h-06', name: 'Tofu', qty: '400', unit: 'g', location: 'fridge', expiry: '2026-10-03' },
		{
			id: 'h-07',
			name: 'Avocados',
			qty: '2',
			location: 'counter',
			expiry: '2026-10-01',
			estimated: true,
			category: 'produce',
		},
		{
			id: 'h-08',
			name: 'Bananas',
			qty: '4',
			location: 'counter',
			expiry: '2026-10-02',
			estimated: true,
			category: 'produce',
		},
		{
			id: 'h-09',
			name: 'Corn tortillas',
			qty: '12',
			location: 'freezer',
			expiry: '2026-12-01',
			estimated: true,
			category: 'grains-and-pasta',
		},
		{
			id: 'h-10',
			name: 'Soy sauce (low sodium)',
			qty: '300',
			unit: 'ml',
			location: 'pantry',
			category: 'condiments-and-spices',
		},
		{ id: 'h-11', name: 'Napkins', qty: '1', location: 'pantry', category: 'other' },
	] as HaulRow[],
}

/** One line of a recipe: the amount, the name, and the note that follows a comma. */
export interface RecipeIngredient {
	name: string
	qty: string
	unit?: string
	note?: string
}
/** A recipe as the Recipes view reads it; `recipes` is a tuple of these. */
export interface SampleRecipe {
	id: string
	name: string
	serves: number
	minutes: number
	tags: readonly string[]
	inStock: boolean
	ingredients: readonly RecipeIngredient[]
	steps: readonly string[]
	/** A line worth knowing before cooking it: the info button beside its name. */
	tip?: string
	/** Where it was read from, when it came from a link. */
	sourceUrl?: string
}
export const recipes = [
	{
		id: 'r-01',
		name: 'Miso-glazed salmon with spinach',
		serves: 2,
		minutes: 25,
		tags: ['weeknight', 'low-sodium'],
		inStock: true,
		ingredients: [
			{ name: 'salmon fillets', qty: '2' },
			{ name: 'miso paste', qty: '2', unit: 'tbsp' },
			{ name: 'soy sauce', qty: '1', unit: 'tbsp' },
			{ name: 'spinach', qty: '200', unit: 'g' },
			{ name: 'garlic', qty: '1', unit: 'clove', note: 'sliced' },
			{ name: 'short-grain rice', qty: '150', unit: 'g' },
		],
		steps: [
			'Cook the rice.',
			'Stir the miso and the soy sauce together and brush it over the salmon.',
			'Roast at 220 °C for 10 to 12 minutes, until the glaze darkens at the edges.',
			'Wilt the spinach with the garlic in a hot pan and serve under the salmon.',
		],
		tip: 'Pat the fillets dry first: the glaze holds and the edges caramelise.',
	},
	{
		id: 'r-02',
		name: 'Black bean tacos',
		serves: 2,
		minutes: 20,
		tags: [],
		inStock: true,
		ingredients: [
			{ name: 'canned black beans', qty: '1' },
			{ name: 'corn tortillas', qty: '6' },
			{ name: 'avocados', qty: '1' },
			{ name: 'limes', qty: '1' },
			{ name: 'garlic', qty: '1', unit: 'clove' },
		],
		steps: [
			'Warm the beans with the garlic and a splash of their liquid, and crush a few.',
			'Char the tortillas over a flame or in a dry pan.',
			'Fill with the beans and sliced avocado, and finish with lime.',
		],
	},
	{
		id: 'r-03',
		name: 'Soba with tofu and edamame',
		serves: 2,
		minutes: 15,
		tags: [],
		inStock: true,
		ingredients: [
			{ name: 'soba', qty: '200', unit: 'g' },
			{ name: 'tofu', qty: '200', unit: 'g', note: 'cubed' },
			{ name: 'edamame', qty: '150', unit: 'g' },
			{ name: 'soy sauce', qty: '2', unit: 'tbsp' },
			{ name: 'ginger', qty: '1', note: 'a thumb, grated' },
		],
		steps: [
			'Boil the soba, adding the edamame for the last two minutes; rinse both cold.',
			'Brown the tofu in a pan.',
			'Toss everything with the soy sauce and the ginger.',
		],
	},
] as const satisfies readonly SampleRecipe[]

/**
 * A recipe on its way in: read from a pasted link and open in the Recipes pane as a draft, not stored until it is
 * saved there. Everything it asks for is in stock but the dill.
 */
export const recipeDraft: Omit<SampleRecipe, 'id' | 'inStock'> & { sourceUrl: string } = {
	name: 'Lemon-yogurt chicken thighs',
	serves: 2,
	minutes: 35,
	tags: ['weeknight'],
	ingredients: [
		{ name: 'chicken thighs', qty: '500', unit: 'g' },
		{ name: 'Greek yogurt', qty: '150', unit: 'g' },
		{ name: 'lemons', qty: '1', note: 'zest and juice' },
		{ name: 'garlic', qty: '2', unit: 'cloves', note: 'grated' },
		{ name: 'olive oil', qty: '1', unit: 'tbsp' },
		{ name: 'dill', qty: '1', note: 'a small bunch' },
	],
	steps: [
		'Stir the yogurt, the lemon, the garlic and the oil together and coat the chicken.',
		'Roast at 220 °C for 25 minutes, until the edges char.',
		'Rest for five minutes and scatter with the dill.',
	],
	sourceUrl: 'https://example.com/recipes/lemon-yogurt-chicken-thighs',
}

/** A store Hearth shops at (D-96): its name, what it sells, and what the owner keeps of it (D-101). */
export interface SampleGroceryStore {
	id: string
	name: string
	sells: ('grocery' | 'home goods')[]
	/** The day its list was last completed, `MM-DD`. */
	shoppedOn?: string
	note?: string
	address?: string
	url?: string
	phone?: string
	/** The store's picture (D-103), as a data URL; one without shows the store glyph on a tile. */
	picture?: string
}
/**
 * A stand-in for a store's picture, as a data URL: a story needs no binary asset, the app's CSP has no blob:, and a
 * real store's mark is not the kit's to ship.
 */
export const storePicture =
	'data:image/svg+xml,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#fff"/><circle cx="4" cy="4" r="2.6" fill="#b5483a"/><rect x="2.4" y="3.5" width="3.2" height="1" fill="#fff"/></svg>'
	)
/** One list per store; the list with no store holds what is not filed yet. The shop day is optional. */
export interface SampleGroceryList {
	id: string
	storeId?: string
	shopDay?: string
}
export interface SampleGroceryItem {
	id: string
	listId: string
	name: string
	/** The brand and the package to buy, where the line names them (D-104). */
	brand?: string
	size?: string
	/** What one costs: typed on the line, or what its store last charged (D-105). The list's sum is made of these. */
	price?: number
	qty: string
	origin: string
	done: boolean
}

/** The one shop day in the sample: H-E-B on Saturday morning. */
export const groceryShopDay = 'Sat 10-03 10:00'

export const grocery: { stores: SampleGroceryStore[]; lists: SampleGroceryList[]; items: SampleGroceryItem[] } = {
	stores: [
		{
			id: 'gs-01',
			name: 'H-E-B',
			sells: ['grocery'],
			shoppedOn: '09-26',
			address: '2400 S Congress Ave, Austin',
			url: 'https://www.heb.com',
			picture: storePicture,
		},
		{
			id: 'gs-02',
			name: 'Target',
			sells: ['grocery', 'home goods'],
			shoppedOn: '09-25',
			note: 'Park on the roof; the garage fills by noon.',
		},
	],
	lists: [
		{ id: 'gl-01', storeId: 'gs-01', shopDay: groceryShopDay },
		{ id: 'gl-02', storeId: 'gs-02' },
		{ id: 'gl-00' },
	],
	items: [
		{
			id: 'g-01',
			listId: 'gl-01',
			name: 'LMNT citrus',
			size: '30 ct',
			price: 45,
			qty: '1 box',
			origin: 'low stock',
			done: false,
		},
		{ id: 'g-02', listId: 'gl-01', name: 'Limes', price: 0.33, qty: '4', origin: 'recipe', done: false },
		{ id: 'g-03', listId: 'gl-01', name: 'Ginger', qty: '1', origin: 'recipe: soba', done: true },
		{
			id: 'g-04',
			listId: 'gl-02',
			name: 'Paper towels',
			brand: 'Bounty',
			size: '6 ct',
			qty: '',
			origin: 'manual',
			done: false,
		},
		{ id: 'g-05', listId: 'gl-00', name: 'Coffee filters', qty: '', origin: 'manual', done: false },
	],
}

export const ideas = [
	{ id: 'i-01', title: 'Pantry barcode scanner on the Pi', status: 'exploring', area: 'homelab' },
	{ id: 'i-02', title: 'nannou sketch: flow field over Austin weather', status: 'building', area: 'studio' },
	{ id: 'i-03', title: "Bike light that reads Sky's forecast", status: 'idea', area: 'hardware' },
	{ id: 'i-04', title: 'Solar logger for the balcony', status: 'idea', area: 'hardware', untouchedDays: 41 },
	{ id: 'i-05', title: 'Command palette for the Synology', status: 'archived', area: 'homelab' },
	{ id: 'i-06', title: 'Eden plugin: seed library', status: 'idea', area: 'app' },
] as const

export const projects = [
	{
		id: 'p-01',
		name: 'weather-field',
		kind: 'nannou',
		repo: 'github.com/rowanhale/weather-field',
		next: ['pick a palette per season', 'export 4K frames'],
	},
	{
		id: 'p-02',
		name: 'pi-pantry',
		kind: 'exploring',
		parts: [
			['Pi Zero 2 W', 15.0],
			['barcode module', 32.5],
			['case', 9.0],
		],
		estimate: 56.5,
	},
] as const

export type SkyCondition =
	| 'sunny'
	| 'partly-cloudy'
	| 'cloudy'
	| 'fog'
	| 'drizzle'
	| 'rain'
	| 'thunderstorm'
	| 'snow'
	| 'hail'
	| 'wind'
	| 'tornado'
export const skyWeek: { day: string; hi: number; lo: number; condition: SkyCondition; note?: string }[] = [
	{ day: 'Mon', hi: 31, lo: 22, condition: 'sunny' },
	{ day: 'Tue', hi: 32, lo: 23, condition: 'partly-cloudy' },
	{ day: 'Wed', hi: 29, lo: 21, condition: 'rain', note: 'showers from 16:00' },
	{ day: 'Thu', hi: 27, lo: 19, condition: 'sunny' },
	{ day: 'Fri', hi: 28, lo: 18, condition: 'sunny' },
	{ day: 'Sat', hi: 30, lo: 19, condition: 'sunny' },
	{ day: 'Sun', hi: 31, lo: 20, condition: 'sunny' },
]
/** The Sunday before the sample week, observed: the first row of a week that starts on Sunday (D-58). */
export const skySundayBefore: { day: string; hi: number; lo: number; condition: SkyCondition } = {
	day: 'Sun',
	hi: 30,
	lo: 21,
	condition: 'partly-cloudy',
}
/** Wednesday 07:40 in detail, in metric: what the forecast provider gives beyond the temperature. */
export const skyDetails = {
	feelsLike: 23,
	/** Percent. */
	humidity: 64,
	dewPoint: 15,
	/** km/h. */
	wind: 14,
	gust: 27,
	windFrom: 'SSE',
	/** hPa. */
	pressure: 1014,
	/** km. */
	visibility: 16,
	/** Percent. */
	cloudCover: 20,
	/** Today's rainfall, in mm. */
	rainfall: 4.2,
	/** Today's highest UV index. */
	uv: 7,
}
export type SkyAirCategory = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous'
/** The air at 07:40: the US index and the pollutants behind it, in µg/m³. */
export const skyAirQuality: {
	index: number
	category: SkyAirCategory
	pm25: number
	pm10: number
	ozone: number
	no2: number
} = { index: 42, category: 'good', pm25: 8.4, pm10: 17, ozone: 61, no2: 12 }
export type SkyAllergenLevel = 'none' | 'low' | 'moderate' | 'high' | 'very-high'
/** Austin at the end of September: ragweed at its peak, mold after the rain. */
export const skyAllergens: { id: string; name: string; level: SkyAllergenLevel }[] = [
	{ id: 'tree', name: 'Tree pollen', level: 'low' },
	{ id: 'grass', name: 'Grass pollen', level: 'moderate' },
	{ id: 'ragweed', name: 'Ragweed pollen', level: 'high' },
	{ id: 'mold', name: 'Mold', level: 'moderate' },
]
/**
 * Each day of the sample week in detail, by its short name, with the Sunday before: the date, the chance of rain and
 * its depth in mm, the highest UV index, the strongest wind in km/h, and the light.
 */
export const skyWeekDetail: Record<
	string,
	{ date: string; precip: number; rain: number; uv: number; wind: number; sunrise: string; sunset: string }
> = {
	SunBefore: { date: '09-27', precip: 10, rain: 0, uv: 7, wind: 11, sunrise: '07:20', sunset: '19:18' },
	Mon: { date: '09-28', precip: 0, rain: 0, uv: 8, wind: 12, sunrise: '07:21', sunset: '19:17' },
	Tue: { date: '09-29', precip: 5, rain: 0, uv: 7, wind: 16, sunrise: '07:21', sunset: '19:15' },
	Wed: { date: '09-30', precip: 75, rain: 4.2, uv: 7, wind: 27, sunrise: '07:22', sunset: '19:14' },
	Thu: { date: '10-01', precip: 10, rain: 0, uv: 7, wind: 14, sunrise: '07:22', sunset: '19:13' },
	Fri: { date: '10-02', precip: 0, rain: 0, uv: 7, wind: 9, sunrise: '07:23', sunset: '19:12' },
	Sat: { date: '10-03', precip: 0, rain: 0, uv: 7, wind: 10, sunrise: '07:24', sunset: '19:10' },
	Sun: { date: '10-04', precip: 5, rain: 0, uv: 6, wind: 13, sunrise: '07:24', sunset: '19:09' },
}

/** What a search for "Austin" finds when the home place is changed: a name, its region and country. */
export const skyPlaceResults = [
	{ id: 'austin-tx', name: 'Austin', region: 'Texas, United States' },
	{ id: 'austin-mn', name: 'Austin', region: 'Minnesota, United States' },
	{ id: 'austin-nv', name: 'Austin', region: 'Nevada, United States' },
]
/** Home's latitude: Hyde Park, Austin (design/sample-data.md, "The owner"). */
export const homeLatitude = 30.31

export const skyToday = {
	sunrise: '07:22',
	sunset: '19:14',
	goldenHour: '18:35',
	moon: 'waning gibbous 84 %',
	/** The phase by name and the share of the disc that is lit, for where the two are set apart. */
	moonPhase: 'Waning gibbous',
	moonLit: 84,
	/** Where the moon is in its cycle (0 new, 0.5 full): what draws the glyph. */
	moonCycle: 0.63,
	goodFor: 'an early run before the showers',
	lastGood: '07:40',
}

/** What the Sky motif draws, from the same Wednesday at 07:40: the wind from the south-south-east and the cloud. */
export const skyMotif = {
	windFrom: 157.5,
	windSpeed: skyDetails.wind,
	windGust: skyDetails.gust,
	cloudCover: skyDetails.cloudCover,
	precipitation: 0,
}

/** What the Hearth motif draws, on the same Wednesday: the stock, and what of it is dated on or before Friday. */
export const hearthMotif = {
	items: stock.length,
	expiring: stock.filter((item) => item.expiry !== undefined && item.expiry <= '10-02').length,
}

/** Daily weight in kg, 09-17 to 09-30; seven-day average 82.7; goal 80.0 by 12-31. */
export const weightSeries = [83.6, 83.4, 83.5, 83.1, 83.2, 82.9, 83.0, 82.8, 82.7, 82.9, 82.6, 82.5, 82.6, 82.4]
export const weightAverage = 82.7
export const weightGoal = 80.0

export const dailyLines = [
	{ line: 'Waste no more time arguing what a good man should be. Be one.', source: 'Marcus Aurelius' },
	{ line: 'Tend what you can reach.', source: 'Eden' },
	{ line: 'Small, daily, enough.', source: 'Eden' },
	{ line: '足るを知る', source: '老子' },
] as const

export const inbox = [
	{ id: 'n-01', domain: 'kitchen', line: 'Spinach and avocados expire tomorrow', when: '07:05', unread: true },
	{
		id: 'n-02',
		domain: 'weather',
		line: 'Showers from 16:00, your 17:30 session may get wet',
		when: '06:30',
		unread: true,
	},
	{ id: 'n-03', domain: 'fitness', line: 'Pull A is planned for tomorrow morning', when: 'yesterday', unread: false },
] as const

export const feed = [
	{ id: 'f-01', line: 'Logged 82.4 kg', when: '06:52', domain: 'fitness' },
	{ id: 'f-02', line: 'Took LMNT citrus', when: '06:50', domain: 'fitness' },
	{ id: 'f-03', line: 'Captured a haul: 9 items', when: 'yesterday 18:14', domain: 'kitchen' },
	{ id: 'f-04', line: 'Completed Pull A', when: 'Monday', domain: 'fitness' },
] as const

/** What Eden knows about Rowan (design/sample-data.md, "Facts"), in the value shapes of `@eden/shared/profile`. The
 * rows of Phase 2 types are here for the mockups; the app seeds only the types the owner may assert. */
export interface SampleFact {
	type: string
	value: unknown
	provenance: 'user-asserted' | 'ai-inferred'
	confidence?: number
}
export const facts: readonly SampleFact[] = [
	{ type: 'preferred-name', value: 'Rowan', provenance: 'user-asserted' },
	{ type: 'allergy', value: { kind: 'food', substance: 'tree nuts', severity: 'severe' }, provenance: 'user-asserted' },
	{
		type: 'allergy',
		value: { kind: 'food', substance: 'shellfish', severity: 'moderate' },
		provenance: 'user-asserted',
	},
	{ type: 'dietary-preference', value: 'low-sodium', provenance: 'user-asserted' },
	{ type: 'medical-dietary-restriction', value: 'low sodium', provenance: 'user-asserted' },
	{ type: 'disliked-ingredient', value: 'cilantro', provenance: 'ai-inferred', confidence: 0.8 },
	{ type: 'cuisine-preference', value: { name: 'Japanese', weight: 0.9 }, provenance: 'user-asserted' },
	{ type: 'cuisine-preference', value: { name: 'Mexican', weight: 0.7 }, provenance: 'user-asserted' },
	{ type: 'cuisine-preference', value: { name: 'Mediterranean', weight: 0.6 }, provenance: 'user-asserted' },
	{ type: 'household-size', value: 2, provenance: 'user-asserted' },
	{ type: 'skill', value: { name: 'Rust', level: 'advanced' }, provenance: 'user-asserted' },
	{ type: 'skill', value: { name: 'Svelte', level: 'advanced' }, provenance: 'user-asserted' },
	{ type: 'skill', value: { name: 'PCB design', level: 'beginner' }, provenance: 'user-asserted' },
	{ type: 'owned-hardware', value: 'Raspberry Pi 5', provenance: 'user-asserted' },
	{ type: 'owned-hardware', value: 'Synology DS923+', provenance: 'user-asserted' },
	{ type: 'owned-hardware', value: 'Elgato Key Light', provenance: 'user-asserted' },
	{ type: 'preferred-tool', value: 'Rust', provenance: 'user-asserted' },
	{ type: 'preferred-tool', value: 'Svelte', provenance: 'user-asserted' },
	{ type: 'preferred-tool', value: 'nannou', provenance: 'user-asserted' },
	{ type: 'preferred-tool', value: 'Neovim', provenance: 'user-asserted' },
	{ type: 'gym-preference', value: 'Castle Hill Fitness, mornings', provenance: 'user-asserted' },
	{
		type: 'training-limitation',
		value: 'left shoulder impingement, no overhead pressing',
		provenance: 'user-asserted',
	},
	{ type: 'favorite-supplement', value: 'LMNT citrus', provenance: 'user-asserted' },
	{ type: 'followed-tradition', value: 'Buddhism', provenance: 'user-asserted' },
	{ type: 'followed-tradition', value: 'Stoicism', provenance: 'user-asserted' },
	{ type: 'value', value: 'patience', provenance: 'user-asserted' },
	{ type: 'value', value: 'craft', provenance: 'user-asserted' },
	{ type: 'value', value: 'generosity', provenance: 'user-asserted' },
]

/** The "can see" chip for the Hearth chat, by registry id. */
export const canSee = [
	{ id: 'stock-item', count: 22 },
	{ id: 'recipe', count: 3 },
	{ id: 'dietary-preference', count: 1 },
	{ id: 'allergy', count: 2 },
	{ id: 'medical-dietary-restriction', count: 1 },
]
export const canSeeLocked = ['medical-dietary-restriction']

export const budget = { used: '2.84', cap: '10.00', currency: 'USD', model: 'claude-sonnet', percent: 28 }

export const audit = {
	when: '09-30 07:31',
	surface: 'Hearth chat',
	model: 'claude-sonnet',
	tokensIn: 3120,
	tokensOut: 410,
	cost: '1.1 ¢',
	outcome: 'ok',
}

/**
 * What the Gardener came to (design/sample-data.md, "Usage"): the fourteen days to 09-30 in USD by grade, the month
 * by model, and the totals. The month's spend is the budget's 2.84.
 */
export const usageDays = [
	'09-17',
	'09-18',
	'09-19',
	'09-20',
	'09-21',
	'09-22',
	'09-23',
	'09-24',
	'09-25',
	'09-26',
	'09-27',
	'09-28',
	'09-29',
	'09-30',
]
export const usageByGrade = {
	light: [0.01, 0.02, 0.01, 0, 0.02, 0.01, 0.03, 0.01, 0.02, 0.01, 0, 0.02, 0.01, 0.02],
	standard: [0.12, 0.08, 0.21, 0, 0.15, 0.09, 0.3, 0.11, 0.18, 0.07, 0, 0.24, 0.13, 0.16],
	deep: [0, 0, 0.2, 0, 0, 0, 0.25, 0, 0, 0, 0, 0.12, 0, 0],
}
export const usageTotals = { month: '2.84', last30: '2.84', allTime: '11.46', requests: 148, cap: '10.00', percent: 28 }
export const usageByModel = [
	{ model: 'claude-sonnet', requests: 79, tokensIn: '212,400', tokensOut: '31,900', cost: '$2.02' },
	{ model: 'claude-opus', requests: 8, tokensIn: '61,200', tokensOut: '9,400', cost: '61 ¢' },
	{ model: 'claude-haiku', requests: 61, tokensIn: '98,700', tokensOut: '14,300', cost: '21 ¢' },
]
export const usageByTool = [
	{ tool: 'Conversations', requests: 96, cost: '$1.74' },
	{ tool: 'capture-haul', requests: 14, cost: '52 ¢' },
	{ tool: 'suggest-recipes', requests: 21, cost: '37 ¢' },
	{ tool: 'brainstorm', requests: 17, cost: '21 ¢' },
]

/** The egress ledger for the audit day (design/sample-data.md, "Audit and grants"): where bytes went, by destination. */
export const egress = [
	{ destination: 'Anthropic (Hearth chat)', day: '09-30', requests: 4, bytesOut: '18.2 kB' },
	{ destination: 'Open-Meteo', day: '09-30', requests: 12, bytesOut: '41.0 kB' },
	{ destination: 'Google Work', day: '09-30', requests: 2, bytesOut: '3.1 kB' },
	{ destination: 'Vault → AI', day: '09-30', requests: 0, bytesOut: '0 B' },
]

export const integrations = [
	{ id: 'google-work', label: 'Google Work', status: 'healthy' as const, detail: 'Synced 07:38' },
	{ id: 'open-meteo', label: 'Open-Meteo', status: 'healthy' as const, detail: 'Forecast from 07:40' },
	{
		id: 'google-family',
		label: 'Google Family',
		status: 'off' as const,
		detail: 'Granted, not connected on this device.',
	},
]

const sidebarGroups = [
	[{ id: 'today', name: 'Today', subtitle: 'Tasks and routines', shortcut: '⌘1' }],
	[
		{ id: 'garden', name: 'Garden', subtitle: 'Dashboard', shortcut: '⌘2' },
		{ id: 'gardener', name: 'Gardener', subtitle: 'Ask, log, run', shortcut: '⌘G' },
		{ id: 'toolbench', name: 'Toolbench', subtitle: 'Ideas, projects, homelab, generative art', shortcut: '⌘3' },
	],
	[
		{ id: 'kitchen', name: 'Hearth', subtitle: 'Food, recipes, pantry, groceries', shortcut: '⌘4' },
		{ id: 'weather', name: 'Sky', subtitle: 'Weather, forecasts, sun and moon', shortcut: '⌘5' },
		{ id: 'places', name: 'Meadow', subtitle: 'Places, events, vibes, favourites', shortcut: '⌘6' },
	],
]

export const sidebar = {
	groups: sidebarGroups,
	items: sidebarGroups.flat(),
	pinned: [{ id: 'settings', name: 'Settings', subtitle: 'Preferences', shortcut: '⌘,', action: true }],
}

const sidebarJaGroups = [
	[{ id: 'today', name: '今日', subtitle: 'タスクと習慣' }],
	[
		{ id: 'garden', name: '庭', subtitle: 'ダッシュボード' },
		{ id: 'gardener', name: '庭師', subtitle: '相談、記録、実行' },
		{ id: 'toolbench', name: '工房', subtitle: 'アイデア、プロジェクト' },
	],
	[
		{ id: 'kitchen', name: '台所', subtitle: '食材、レシピ、買い物' },
		{ id: 'weather', name: '空', subtitle: '天気、日の出と月' },
		{ id: 'places', name: '野原', subtitle: '場所、イベント、雰囲気' },
	],
]

export const sidebarJa = {
	groups: sidebarJaGroups,
	items: sidebarJaGroups.flat(),
	pinned: [{ id: 'settings', name: '設定', subtitle: '環境設定', action: true }],
}

export const bottomTabs = [
	{ id: 'garden', label: 'Garden' },
	{ id: 'today', label: 'Today' },
	{ id: 'kitchen', label: 'Hearth' },
	{ id: 'weather', label: 'Sky' },
	{ id: 'more', label: 'More' },
] as const

export const quickLogs = [
	{
		id: 'weight',
		label: 'Weight',
		kind: 'number' as const,
		unit: 'kg',
		placeholder: '82.4',
		last: { value: '82.6 kg', when: 'yesterday 06:48' },
		series: weightSeries,
		reference: weightAverage,
	},
	{
		id: 'supplement',
		label: 'Supplement',
		kind: 'check' as const,
		options: ['LMNT citrus'],
		last: { value: 'LMNT citrus', when: 'today 06:50' },
	},
	{ id: 'note', label: 'Note', kind: 'text' as const, placeholder: 'One line is enough.' },
]

/** Today's hours from 08:00, twelve of them; the showers arrive at 16:00 (Sky's Wednesday). */
export interface SkyHour {
	id: string
	time: string
	temp: number
	condition: SkyCondition
	/** Chance of precipitation, in percent. */
	precip: number
}
export const skyHours: SkyHour[] = [
	{ id: 'h08', time: '08:00', temp: 22, condition: 'sunny', precip: 0 },
	{ id: 'h09', time: '09:00', temp: 23, condition: 'sunny', precip: 0 },
	{ id: 'h10', time: '10:00', temp: 25, condition: 'sunny', precip: 0 },
	{ id: 'h11', time: '11:00', temp: 26, condition: 'partly-cloudy', precip: 5 },
	{ id: 'h12', time: '12:00', temp: 27, condition: 'partly-cloudy', precip: 10 },
	{ id: 'h13', time: '13:00', temp: 28, condition: 'partly-cloudy', precip: 15 },
	{ id: 'h14', time: '14:00', temp: 29, condition: 'cloudy', precip: 25 },
	{ id: 'h15', time: '15:00', temp: 29, condition: 'cloudy', precip: 40 },
	{ id: 'h16', time: '16:00', temp: 27, condition: 'rain', precip: 70 },
	{ id: 'h17', time: '17:00', temp: 26, condition: 'rain', precip: 75 },
	{ id: 'h18', time: '18:00', temp: 25, condition: 'rain', precip: 65 },
	{ id: 'h19', time: '19:00', temp: 24, condition: 'drizzle', precip: 45 },
]

/** The log and the brainstorm attached to idea i-02 (the nannou flow field), oldest first. */
export const ideaLog = {
	ideaId: 'i-02',
	entries: [
		{ id: 'il-01', when: '09-12', line: 'Captured from a sketchbook page' },
		{ id: 'il-02', when: '09-18', line: 'Moved to exploring: mapped hourly wind to a vector field' },
		{ id: 'il-03', when: '09-26', line: 'Moved to building: linked the weather-field project' },
	],
	brainstorm: [
		{ id: 'bm-01', owner: true, text: 'How do I make the field feel like the day rather than a noise demo?' },
		{
			id: 'bm-02',
			owner: false,
			text: 'Drive the noise scale from the wind speed and the palette from the hour, so a still morning reads as slow, wide curves and a stormy evening as tight, dark ones. Seed 2049 already has the right bones.',
		},
	],
} as const

/** Wednesday's tasks for the Today widget: one overdue, one due today, one routine already done. */
export type TaskState = 'overdue' | 'due' | 'done'
export interface TodayTask {
	id: string
	title: string
	/** When it was or is due, already formatted. */
	when: string
	state: TaskState
	/** A routine rather than a one-off task. */
	routine?: boolean
}
export const todayTasks: TodayTask[] = [
	{ id: 't-01', title: 'Book the dentist', when: 'Mon 09-28', state: 'overdue' },
	{ id: 't-02', title: 'Renew library card', when: 'today', state: 'due' },
	{ id: 't-03', title: 'Morning LMNT', when: '06:50', state: 'done', routine: true },
]

/** The two todos' due days (`MM-DD`), for the page and its seed: the dentist since Monday, the card today. */
export const todayDues: Record<string, string> = { 't-01': '09-28', 't-02': '09-30' }

/** The routine behind the tile's third row: every day at 06:50 since the start of the month, done this morning. */
export const todayRoutine = {
	id: 't-03',
	title: 'Morning LMNT',
	timeOfDay: '06:50',
	freq: 'daily' as const,
	/** `MM-DD`, in the dataset's year. */
	start: '09-01',
	/** When it was done today, `HH:MM`. */
	doneAt: '06:50',
}

/** The one habit: stretching three times a week, twice so far this week, the two weeks before met. */
export const todayHabit = {
	id: 't-04',
	title: 'Stretch',
	target: { count: 3, per: 'week' as const },
	/** The days it was logged (`MM-DD`), once each. */
	days: ['09-15', '09-17', '09-19', '09-22', '09-24', '09-26', '09-28', '09-29'],
	/** What the tally reads on Wednesday. */
	tally: '2 / 3',
	streak: 2,
}

/** The Phase 1 default Garden (product/substrate/shell.md): the mockup and the app read this one list. */
export type GardenWidgetSize = 's' | 'm' | 'l'
export type GardenDomain = 'weather' | 'today' | 'kitchen' | 'toolbench' | 'fitness' | 'places' | 'garden'
export interface GardenTile {
	id: string
	/** The contributing domain's plain id; `garden` for the neutral tiles the shell owns. */
	domain: GardenDomain
	size: GardenWidgetSize
}
export const gardenLayout: GardenTile[] = [
	{ id: 'weather-now', domain: 'weather', size: 's' },
	{ id: 'today', domain: 'today', size: 'm' },
	{ id: 'expiring-soon', domain: 'kitchen', size: 's' },
	{ id: 'cook-tonight', domain: 'kitchen', size: 'm' },
	{ id: 'resurfaced-idea', domain: 'toolbench', size: 's' },
	{ id: 'active-projects', domain: 'toolbench', size: 'm' },
	{ id: 'sun-and-moon', domain: 'weather', size: 's' },
	{ id: 'daily-line', domain: 'garden', size: 'm' },
	{ id: 'quick-log', domain: 'fitness', size: 's' },
	{ id: 'nearby-favorites', domain: 'places', size: 'm' },
	{ id: 'upcoming-listings', domain: 'places', size: 'm' },
]

// ---- Meadow (design/sample-data.md, "Meadow") -----------------------------------------------------------------------

/** A place on the ground, in degrees. */
export interface SamplePoint {
	lng: number
	lat: number
}

/** A vibe belongs to one of four facets (D-133): within a facet a filter is any of, across facets all of. */
export type VibeFacet = 'purpose' | 'mood' | 'setting' | 'crowd'
export const meadowFacets: { id: VibeFacet; label: string; vibes: { id: string; label: string }[] }[] = [
	{
		id: 'purpose',
		label: 'What I’m doing',
		vibes: [
			{ id: 'deep-work', label: 'Deep work' },
			{ id: 'work-friendly', label: 'Work-friendly' },
			{ id: 'read', label: 'Read' },
			{ id: 'meet-people', label: 'Meet people' },
			{ id: 'catch-up', label: 'Catch up' },
			{ id: 'date', label: 'Date' },
			{ id: 'unwind', label: 'Unwind' },
			{ id: 'celebrate', label: 'Celebrate' },
		],
	},
	{
		id: 'mood',
		label: 'How I feel',
		vibes: [
			{ id: 'calm', label: 'Calm' },
			{ id: 'cozy', label: 'Cozy' },
			{ id: 'lively', label: 'Lively' },
			{ id: 'buzzing', label: 'Buzzing' },
			{ id: 'romantic', label: 'Romantic' },
			{ id: 'playful', label: 'Playful' },
		],
	},
	{
		id: 'setting',
		label: 'The setting',
		vibes: [
			{ id: 'quiet', label: 'Quiet' },
			{ id: 'spacious', label: 'Spacious' },
			{ id: 'outdoors', label: 'Outdoors' },
			{ id: 'natural-light', label: 'Natural light' },
			{ id: 'intimate', label: 'Intimate' },
			{ id: 'industrial', label: 'Industrial' },
			{ id: 'late-night', label: 'Late-night' },
		],
	},
	{
		id: 'crowd',
		label: 'The crowd',
		vibes: [
			{ id: 'solo-friendly', label: 'Solo-friendly' },
			{ id: 'locals', label: 'Locals' },
			{ id: 'laptop-crowd', label: 'Laptop crowd' },
			{ id: 'social', label: 'Social' },
			{ id: 'kid-friendly', label: 'Kid-friendly' },
		],
	},
]

export type PlaceCategory = 'cafe' | 'bar' | 'restaurant' | 'park' | 'museum' | 'venue'

/**
 * A stand-in for a place's picture, as a data URL (see `storePicture`): a ground and a mark in two colours, so the
 * five places read apart in a list. A real place's photograph is not the kit's to ship.
 */
const placePicture = (ground: string, mark: string) =>
	'data:image/svg+xml,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10"><rect width="16" height="10" fill="${ground}"/><path d="M0 8 L5 4 L9 7 L12 5 L16 8 V10 H0Z" fill="${mark}"/><circle cx="12.5" cy="2.6" r="1.2" fill="${mark}"/></svg>`
	)

/** A saved place: the `venue` Place and what Meadow keeps about it, flattened for a mockup. */
export interface SamplePlace {
	id: string
	name: string
	category: PlaceCategory
	point: SamplePoint
	/** A public address line and the part of town. */
	address: string
	locality: string
	/** How far from home, in kilometres. */
	distanceKm: number
	price?: 1 | 2 | 3 | 4
	vibes: string[]
	alcoholFree?: boolean
	favourite: boolean
	/** A rating from outside, with where it came from. */
	rating?: { value: number; source: string }
	/** Hours as they were read, whether that makes it open on Wednesday 07:40, and where they came from. */
	hours?: { text: string; open: boolean; source: string; asOf: string }
	picture?: string
	notes?: string
	website?: string
}
export const meadowPlaces: SamplePlace[] = [
	{
		id: 'p-01',
		name: 'Cosmic Coffee + Beer Garden',
		category: 'cafe',
		point: { lng: -97.7626, lat: 30.2269 },
		address: '121 Pickle Rd',
		locality: 'South Austin',
		distanceKm: 9.8,
		price: 2,
		vibes: ['work-friendly', 'unwind', 'cozy', 'outdoors', 'spacious', 'laptop-crowd', 'social'],
		favourite: true,
		rating: { value: 4.6, source: 'the search' },
		hours: { text: 'Daily 07:00–24:00', open: true, source: 'OpenStreetMap', asOf: 'Tue 09-29' },
		picture: placePicture('#dfe6d5', '#6f8a5b'),
		notes: 'Good porch, loud inside. Chickens out back.',
		website: 'https://www.cosmichospitalitygroup.com',
	},
	{
		id: 'p-02',
		name: 'Nickel City',
		category: 'bar',
		point: { lng: -97.7281, lat: 30.2686 },
		address: '1133 E 11th St',
		locality: 'East Austin',
		distanceKm: 4.6,
		price: 1,
		vibes: ['catch-up', 'lively', 'late-night', 'locals', 'social'],
		favourite: false,
		hours: { text: 'Daily 12:00–02:00', open: false, source: 'its website', asOf: 'Mon 09-28' },
		picture: placePicture('#e8d9cf', '#a2553f'),
	},
	{
		id: 'p-03',
		name: 'Zilker Park',
		category: 'park',
		point: { lng: -97.7669, lat: 30.2677 },
		address: 'Barton Springs Rd',
		locality: 'Zilker',
		distanceKm: 5.9,
		vibes: ['read', 'unwind', 'calm', 'quiet', 'outdoors', 'spacious', 'kid-friendly', 'solo-friendly'],
		alcoholFree: true,
		favourite: true,
		hours: { text: 'Daily 05:00–22:00', open: true, source: 'OpenStreetMap', asOf: 'Tue 09-29' },
		picture: placePicture('#d6e6ec', '#5f8f6a'),
	},
	{
		id: 'p-04',
		name: 'Cuvée Coffee',
		category: 'cafe',
		point: { lng: -97.7387, lat: 30.2563 },
		address: '48 East Ave',
		locality: 'Rainey',
		distanceKm: 6.1,
		price: 2,
		vibes: ['deep-work', 'work-friendly', 'calm', 'industrial', 'natural-light', 'laptop-crowd', 'solo-friendly'],
		alcoholFree: true,
		favourite: false,
		rating: { value: 4.4, source: 'the search' },
		hours: { text: 'Mon–Fri 07:00–17:00, Sat–Sun 08:00–17:00', open: true, source: 'OpenStreetMap', asOf: 'Tue 09-29' },
	},
	{
		id: 'p-05',
		name: 'Sour Duck Market',
		category: 'restaurant',
		point: { lng: -97.7216, lat: 30.2799 },
		address: '1814 E Martin Luther King Jr Blvd',
		locality: 'East Austin',
		distanceKm: 3.5,
		price: 2,
		vibes: ['catch-up', 'date', 'cozy', 'outdoors', 'locals', 'kid-friendly'],
		alcoholFree: true,
		favourite: true,
		rating: { value: 4.5, source: 'the search' },
		picture: placePicture('#ece3c8', '#b08a3c'),
		notes: 'Alcohol-free options on tap. The patio fills by seven.',
	},
]

/** Home, rounded to two decimals as every outgoing request rounds it (D-60): Hyde Park, Austin. */
export const meadowHome = { name: 'Home', area: 'Austin, Texas', point: { lng: -97.73, lat: 30.31 } }

export const meadowCollections = [
	{
		id: 'c-01',
		name: 'Coworking',
		placeIds: ['p-01', 'p-04'],
		note: 'Wifi that holds, somewhere to sit for three hours.',
	},
	{ id: 'c-02', name: 'Date nights', placeIds: ['p-05', 'p-02'] },
]

export const meadowVisits = [
	{ id: 'v-01', placeId: 'p-01', day: 'Sat 09-26', rating: 4, note: 'Good porch, loud inside.' },
	{ id: 'v-02', placeId: 'p-03', day: 'Sun 09-20', rating: 5, note: 'Read by the water until dark.' },
	{ id: 'v-03', placeId: 'p-05', day: 'Fri 09-11', rating: 4 },
]

/** What the search found for the weekend: each says why it fits and where it was read. */
export const meadowListings = [
	{
		id: 'l-01',
		title: 'Hot Luck food festival',
		venue: 'Wild Onion Ranch',
		point: { lng: -97.7936, lat: 30.2251 },
		when: 'Sat 10-03 20:00',
		category: 'Food',
		price: '$$$',
		url: 'https://hotluckfest.com',
		why: 'Lively and outdoors, with plenty that is not shellfish.',
		sources: [{ url: 'https://hotluckfest.com', title: 'Hot Luck' }],
		state: 'interested' as const,
	},
	{
		id: 'l-02',
		title: 'Blanton late night',
		venue: 'Blanton Museum of Art',
		point: { lng: -97.7375, lat: 30.281 },
		when: 'Thu 10-01 18:00',
		category: 'Art',
		price: 'Free',
		url: 'https://blantonmuseum.org',
		why: 'Calm, spacious and good on your own.',
		sources: [{ url: 'https://blantonmuseum.org', title: 'Blanton Museum of Art' }],
		state: undefined,
	},
]

/** Three places the Gardener found for "a quiet cafe to work in": none is saved, each says why and where from. */
export const meadowSuggestions = [
	{
		id: 's-01',
		name: 'Flitch Coffee',
		category: 'cafe' as PlaceCategory,
		point: { lng: -97.7069, lat: 30.2593 },
		address: '641 Tillery St',
		locality: 'East Austin',
		why: 'A trailer under the trees with shaded tables; quiet on weekday mornings.',
		vibes: ['work-friendly', 'calm', 'outdoors', 'solo-friendly'],
		sources: [{ url: 'https://www.flitchcoffee.com', title: 'Flitch Coffee' }],
	},
	{
		id: 's-02',
		name: 'Bennu Coffee',
		category: 'cafe' as PlaceCategory,
		point: { lng: -97.7193, lat: 30.2797 },
		address: '2001 E Martin Luther King Jr Blvd',
		locality: 'East Austin',
		why: 'Open around the clock and built for long sessions, with outlets at most tables.',
		vibes: ['deep-work', 'late-night', 'laptop-crowd'],
		sources: [{ url: 'https://bennucoffee.com', title: 'Bennu Coffee' }],
	},
	{
		id: 's-03',
		name: 'Austin Central Library',
		category: 'venue' as PlaceCategory,
		point: { lng: -97.7519, lat: 30.2659 },
		address: '710 W Cesar Chavez St',
		locality: 'Downtown',
		why: 'Six floors of quiet with a roof garden and daylight everywhere.',
		vibes: ['deep-work', 'read', 'quiet', 'natural-light', 'spacious'],
		sources: [{ url: 'https://library.austintexas.gov/central-library', title: 'Austin Public Library' }],
	},
]
/** The line the search was asked with, and what it would cost, as the page says under its button. */
export const meadowSearch = {
	query: 'a quiet cafe to work in',
	estimate: '$0.12',
	model: 'claude-sonnet',
	area: 'Austin, Texas',
}

/** A list pasted from a note, and the rows it becomes: found, found twice, and not found. */
export const meadowImport = {
	text: '- Cosmic Coffee\n- Radio Coffee & Beer — good for groups\n- Mozart’s\n- The Roosevelt Room\n- Lazarus Brewing\n- that taco truck on Manor',
	rows: [
		{ id: 'i-01', name: 'Cosmic Coffee', state: 'saved' as const, match: 'Cosmic Coffee + Beer Garden, 121 Pickle Rd' },
		{
			id: 'i-02',
			name: 'Radio Coffee & Beer',
			note: 'good for groups',
			state: 'matched' as const,
			match: 'Radio Coffee & Beer, 4204 Menchaca Rd',
			vibes: ['work-friendly', 'social', 'outdoors'],
		},
		{
			id: 'i-03',
			name: 'Mozart’s',
			state: 'matched' as const,
			match: 'Mozart’s Coffee Roasters, 3825 Lake Austin Blvd',
			vibes: ['read', 'calm', 'outdoors'],
		},
		{
			id: 'i-04',
			name: 'The Roosevelt Room',
			state: 'matched' as const,
			match: 'The Roosevelt Room, 307 W 5th St',
			vibes: ['date', 'intimate', 'late-night'],
		},
		{
			id: 'i-05',
			name: 'Lazarus Brewing',
			state: 'ambiguous' as const,
			options: ['Lazarus Brewing Co., 1902 E 6th St', 'Lazarus Brewing Co., 4803 Airport Blvd'],
		},
		{ id: 'i-06', name: 'that taco truck on Manor', state: 'not-found' as const },
	],
}

/** What the Meadow motif draws: the places saved, and how many of them are favourites. */
export const meadowMotif = {
	places: meadowPlaces.length,
	favourites: meadowPlaces.filter((place) => place.favourite).length,
}

/**
 * The ground a mockup's map stands on: central Austin, drawn by hand from a few lines, so a story needs no network
 * and no WebGL (D-129). The bounds are square on the ground; everything is in degrees and the story's drawing turns
 * it into its own units.
 */
export const meadowMap = {
	bounds: { west: -97.7999, east: -97.6841, south: 30.218, north: 30.318 },
	/** Lady Bird Lake, west to east. */
	water: [
		[
			[-97.7999, 30.296],
			[-97.787, 30.293],
			[-97.779, 30.281],
			[-97.771, 30.272],
			[-97.759, 30.266],
			[-97.747, 30.262],
			[-97.738, 30.258],
			[-97.727, 30.251],
			[-97.714, 30.249],
			[-97.701, 30.247],
			[-97.6841, 30.244],
		],
	] as [number, number][][],
	parks: [
		[
			[-97.778, 30.271],
			[-97.768, 30.2705],
			[-97.762, 30.2665],
			[-97.764, 30.262],
			[-97.774, 30.262],
			[-97.78, 30.266],
		],
		[
			[-97.742, 30.288],
			[-97.731, 30.288],
			[-97.731, 30.281],
			[-97.742, 30.281],
		],
		[
			[-97.717, 30.262],
			[-97.708, 30.262],
			[-97.708, 30.256],
			[-97.717, 30.256],
		],
	] as [number, number][][],
	/** The roads a resident would know the town by: the two highways heavier than the streets. */
	roads: [
		{
			id: 'i-35',
			major: true,
			line: [
				[-97.705, 30.318],
				[-97.722, 30.296],
				[-97.734, 30.27],
				[-97.739, 30.252],
				[-97.745, 30.218],
			],
		},
		{
			id: 'mopac',
			major: true,
			line: [
				[-97.741, 30.318],
				[-97.756, 30.298],
				[-97.768, 30.283],
				[-97.775, 30.266],
				[-97.786, 30.245],
				[-97.7999, 30.23],
			],
		},
		{
			id: 'lamar',
			major: false,
			line: [
				[-97.731, 30.318],
				[-97.742, 30.3],
				[-97.751, 30.278],
				[-97.757, 30.262],
				[-97.766, 30.245],
				[-97.777, 30.225],
			],
		},
		{
			id: 'congress',
			major: false,
			line: [
				[-97.7405, 30.274],
				[-97.745, 30.26],
				[-97.751, 30.24],
				[-97.757, 30.218],
			],
		},
		{
			id: 'guadalupe',
			major: false,
			line: [
				[-97.727, 30.318],
				[-97.736, 30.3],
				[-97.742, 30.286],
				[-97.745, 30.268],
			],
		},
		{
			id: 'sixth',
			major: false,
			line: [
				[-97.772, 30.2745],
				[-97.75, 30.2695],
				[-97.73, 30.2635],
				[-97.705, 30.2565],
				[-97.6841, 30.2505],
			],
		},
		{
			id: 'mlk',
			major: false,
			line: [
				[-97.752, 30.2835],
				[-97.735, 30.2805],
				[-97.71, 30.2795],
				[-97.6841, 30.281],
			],
		},
		{
			id: 'thirty-eighth',
			major: false,
			line: [
				[-97.752, 30.306],
				[-97.735, 30.301],
				[-97.716, 30.296],
			],
		},
		{
			id: 'oltorf',
			major: false,
			line: [
				[-97.775, 30.241],
				[-97.755, 30.2385],
				[-97.735, 30.232],
			],
		},
		{
			id: 'ben-white',
			major: true,
			line: [
				[-97.7999, 30.233],
				[-97.77, 30.2275],
				[-97.745, 30.219],
			],
		},
	] as { id: string; major: boolean; line: [number, number][] }[],
	labels: [
		{ id: 'downtown', text: 'Downtown', at: [-97.7435, 30.2675] },
		{ id: 'east', text: 'East Austin', at: [-97.712, 30.27] },
		{ id: 'zilker', text: 'Zilker', at: [-97.771, 30.2585] },
		{ id: 'soco', text: 'South Congress', at: [-97.75, 30.245] },
		{ id: 'hyde-park', text: 'Hyde Park', at: [-97.728, 30.3055] },
		{ id: 'lake', text: 'Lady Bird Lake', at: [-97.724, 30.2465] },
	] as { id: string; text: string; at: [number, number] }[],
}
