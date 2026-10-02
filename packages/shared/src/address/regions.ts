// The regions of the countries whose addresses name one from a fixed list. Codes are ISO 3166-2 suffixes.
import type { Region } from './types.js'

const list = (text: string): Region[] =>
	text.split(';').map((entry) => {
		const [code = '', name = '', ja] = entry.trim().split(':')
		return { code, name, ...(ja ? { ja } : {}) }
	})

export const US_STATES: readonly Region[] = list(
	'AL:Alabama;AK:Alaska;AZ:Arizona;AR:Arkansas;CA:California;CO:Colorado;CT:Connecticut;DE:Delaware;' +
		'DC:District of Columbia;FL:Florida;GA:Georgia;HI:Hawaii;ID:Idaho;IL:Illinois;IN:Indiana;IA:Iowa;KS:Kansas;' +
		'KY:Kentucky;LA:Louisiana;ME:Maine;MD:Maryland;MA:Massachusetts;MI:Michigan;MN:Minnesota;MS:Mississippi;' +
		'MO:Missouri;MT:Montana;NE:Nebraska;NV:Nevada;NH:New Hampshire;NJ:New Jersey;NM:New Mexico;NY:New York;' +
		'NC:North Carolina;ND:North Dakota;OH:Ohio;OK:Oklahoma;OR:Oregon;PA:Pennsylvania;RI:Rhode Island;' +
		'SC:South Carolina;SD:South Dakota;TN:Tennessee;TX:Texas;UT:Utah;VT:Vermont;VA:Virginia;WA:Washington;' +
		'WV:West Virginia;WI:Wisconsin;WY:Wyoming'
)

export const CA_PROVINCES: readonly Region[] = list(
	'AB:Alberta;BC:British Columbia;MB:Manitoba;NB:New Brunswick;NL:Newfoundland and Labrador;' +
		'NT:Northwest Territories;NS:Nova Scotia;NU:Nunavut;ON:Ontario;PE:Prince Edward Island;QC:Quebec;' +
		'SK:Saskatchewan;YT:Yukon'
)

export const AU_STATES: readonly Region[] = list(
	'ACT:Australian Capital Territory;NSW:New South Wales;NT:Northern Territory;QLD:Queensland;SA:South Australia;' +
		'TAS:Tasmania;VIC:Victoria;WA:Western Australia'
)

/** In the order Japan lists them, north to south. */
export const JP_PREFECTURES: readonly Region[] = list(
	'01:Hokkaido:北海道;02:Aomori:青森県;03:Iwate:岩手県;04:Miyagi:宮城県;05:Akita:秋田県;06:Yamagata:山形県;' +
		'07:Fukushima:福島県;08:Ibaraki:茨城県;09:Tochigi:栃木県;10:Gunma:群馬県;11:Saitama:埼玉県;12:Chiba:千葉県;' +
		'13:Tokyo:東京都;14:Kanagawa:神奈川県;15:Niigata:新潟県;16:Toyama:富山県;17:Ishikawa:石川県;18:Fukui:福井県;' +
		'19:Yamanashi:山梨県;20:Nagano:長野県;21:Gifu:岐阜県;22:Shizuoka:静岡県;23:Aichi:愛知県;24:Mie:三重県;' +
		'25:Shiga:滋賀県;26:Kyoto:京都府;27:Osaka:大阪府;28:Hyogo:兵庫県;29:Nara:奈良県;30:Wakayama:和歌山県;' +
		'31:Tottori:鳥取県;32:Shimane:島根県;33:Okayama:岡山県;34:Hiroshima:広島県;35:Yamaguchi:山口県;' +
		'36:Tokushima:徳島県;37:Kagawa:香川県;38:Ehime:愛媛県;39:Kochi:高知県;40:Fukuoka:福岡県;41:Saga:佐賀県;' +
		'42:Nagasaki:長崎県;43:Kumamoto:熊本県;44:Oita:大分県;45:Miyazaki:宮崎県;46:Kagoshima:鹿児島県;47:Okinawa:沖縄県'
)
