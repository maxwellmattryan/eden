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

export type StockLocation = 'fridge' | 'freezer' | 'pantry' | 'counter'
export interface StockItem {
	id: string
	name: string
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
	{ id: 'st-14', name: 'Olive oil', qty: '500', unit: 'ml', location: 'pantry', category: 'condiments-and-spices' },
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
/** The categories a stock item or a haul row may be filed under: the app's twelve, id and English name. */
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
	{ id: 'other', label: 'Other' },
]
/**
 * The captured haul: 09-29 18:12, read by Anthropic's Haiku for about 0.6 cents from a photo of the bags, a photo of
 * the receipt, the order's PDF and a pasted list. 11 recognised, 2 merge, 1 was a misread. Every row has a category
 * but the tofu, which the capture could not place; the spinach carries a storage tip.
 */
export const haul = {
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
			qty: '500',
			unit: 'g',
			location: 'fridge',
			expiry: '2026-10-06',
			category: 'dairy-and-eggs',
		},
		{
			id: 'h-05',
			name: 'Lemons',
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
}
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
		{ id: 'g-01', listId: 'gl-01', name: 'LMNT citrus', qty: '1 box', origin: 'low stock', done: false },
		{ id: 'g-02', listId: 'gl-01', name: 'Limes', qty: '4', origin: 'recipe', done: false },
		{ id: 'g-03', listId: 'gl-01', name: 'Ginger', qty: '1', origin: 'recipe: soba', done: true },
		{ id: 'g-04', listId: 'gl-02', name: 'Paper towels', qty: '', origin: 'manual', done: false },
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
export type GardenDomain = 'weather' | 'today' | 'kitchen' | 'toolbench' | 'fitness' | 'garden'
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
]
