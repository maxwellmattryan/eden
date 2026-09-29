<script lang="ts">
	// The app mark (design/brand.md, D-65): a trilithon of weathered stone overgrown by two vines, in the brand colour on
	// whatever is behind it. In the app it stands alone; the rounded square belongs to the app icon. The drawing is a
	// mask, white where the stone and the vines are and black where they are cut, so the surface shows through the
	// joints and the cracks. It is the one in app-mark.svg beside this file, which the desktop splash inlines and the
	// masters in src-tauri/icons/src are drawn from; AppMark.test.ts holds the two together. Decorative: it always
	// sits beside the Wordmark, which carries the name.
	import type { SVGAttributes } from 'svelte/elements'

	let { class: className = '', ...rest }: SVGAttributes<SVGSVGElement> = $props()

	const uid = $props.id()
	const maskId = `${uid}-mask`
</script>

<svg class={['ed-app-mark', className]} viewBox="102 86 800 800" aria-hidden="true" focusable="false" {...rest}>
	<mask id={maskId} maskUnits="userSpaceOnUse" x="102" y="86" width="800" height="800"
		><g fill="none" stroke="#000" stroke-linecap="round"
			><path d="M446 800C445 794 444.7 774.3 440 764" stroke-width="35" /><path
				d="M440 764C435.3 753.7 428.3 745 418 738"
				stroke-width="34.6"
			/><path d="M418 738C407.7 731 394 728 378 722" stroke-width="34.2" /><path
				d="M378 722C362 716 341.3 710 322 702"
				stroke-width="33.8"
			/><path d="M322 702C302.7 694 276.7 685 262 674" stroke-width="33.4" /><path
				d="M262 674C247.3 663 236.7 649 234 636"
				stroke-width="33"
			/><path d="M234 636C231.3 623 237.7 608.7 246 596" stroke-width="32.5" /><path
				d="M582.6 800.7C582.5 794.8 577.8 776.3 582.2 765.5"
				stroke-width="35"
			/><path d="M582.2 765.5C586.6 754.7 597.7 743.4 608.8 736" stroke-width="34.6" /><path
				d="M608.8 736C619.9 728.6 633.8 727.2 648.7 721.1"
				stroke-width="34.2"
			/><path d="M648.7 721.1C663.6 715.1 678.6 706.6 698.4 699.7" stroke-width="33.8" /><path
				d="M698.4 699.7C718.3 692.8 752.3 689.8 767.8 679.9"
				stroke-width="33.4"
			/><path d="M767.8 679.9C783.3 670 789.1 655.1 791.6 640.5" stroke-width="33" /><path
				d="M791.6 640.5C794.1 625.9 791.3 606.6 783 592.4"
				stroke-width="32.5"
			/></g
		><g fill="#000" stroke="#000" stroke-width="16" stroke-linejoin="round"
			><path
				transform="translate(418 738) rotate(-92.1) scale(1 1)"
				d="M0 0C7.8 -29.5 42.7 -35.7 77.61550724627395 -6.4C65.2 9.3 32.6 27.9 0 0Z"
			/><path
				transform="translate(608.8 736) rotate(-66.5) scale(1 -1)"
				d="M0 0C8.8 -33.6 48.6 -40.6 88.36096695780022 -14.3C74.2 10.6 37.1 31.8 0 0Z"
			/></g
		><g fill="none" stroke="#fff" stroke-linecap="round"
			><path d="M446 800C445 794 444.7 774.3 440 764" stroke-width="19" /><path
				d="M440 764C435.3 753.7 428.3 745 418 738"
				stroke-width="18.6"
			/><path d="M418 738C407.7 731 394 728 378 722" stroke-width="18.2" /><path
				d="M378 722C362 716 341.3 710 322 702"
				stroke-width="17.8"
			/><path d="M322 702C302.7 694 276.7 685 262 674" stroke-width="17.4" /><path
				d="M262 674C247.3 663 236.7 649 234 636"
				stroke-width="17"
			/><path d="M234 636C231.3 623 237.7 608.7 246 596" stroke-width="16.5" /><path
				d="M582.6 800.7C582.5 794.8 577.8 776.3 582.2 765.5"
				stroke-width="19"
			/><path d="M582.2 765.5C586.6 754.7 597.7 743.4 608.8 736" stroke-width="18.6" /><path
				d="M608.8 736C619.9 728.6 633.8 727.2 648.7 721.1"
				stroke-width="18.2"
			/><path d="M648.7 721.1C663.6 715.1 678.6 706.6 698.4 699.7" stroke-width="17.8" /><path
				d="M698.4 699.7C718.3 692.8 752.3 689.8 767.8 679.9"
				stroke-width="17.4"
			/><path d="M767.8 679.9C783.3 670 789.1 655.1 791.6 640.5" stroke-width="17" /><path
				d="M791.6 640.5C794.1 625.9 791.3 606.6 783 592.4"
				stroke-width="16.5"
			/></g
		><g fill="#fff"
			><path
				transform="translate(418 738) rotate(-92.1) scale(1 1)"
				d="M0 0C7.8 -29.5 42.7 -35.7 77.61550724627395 -6.4C65.2 9.3 32.6 27.9 0 0Z"
			/><path
				transform="translate(608.8 736) rotate(-66.5) scale(1 -1)"
				d="M0 0C8.8 -33.6 48.6 -40.6 88.36096695780022 -14.3C74.2 10.6 37.1 31.8 0 0Z"
			/></g
		><g fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"
			><path transform="translate(418 738) rotate(-92.1) scale(1 1)" d="M7.8 0Q34.9 -0.8 66.7 -4.3" /><path
				transform="translate(608.8 736) rotate(-66.5) scale(1 -1)"
				d="M8.8 0Q39.8 -1.7 76 -9.5"
			/></g
		><g fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" opacity="0.55"
			><path
				transform="translate(418 738) rotate(-92.1) scale(1 1)"
				d="M20.2 -0.4Q26.4 -6.6 33.4 -15.9M20.2 -0.4Q27.2 3.3 33.4 8.9M34.2 -1.1Q40.4 -7 47.3 -15.9M34.2 -1.1Q41.1 2.4 47.3 7.7M48.1 -2.2Q54.3 -6.6 61.3 -13.1M48.1 -2.2Q55.1 0.4 61.3 4.3"
			/><path
				transform="translate(608.8 736) rotate(-66.5) scale(1 -1)"
				d="M23 -0.9Q30 -7.9 38 -18.5M23 -0.9Q30.9 3.4 38 9.7M38.9 -2.5Q45.9 -9.2 53.9 -19.3M38.9 -2.5Q46.8 1.5 53.9 7.6M54.8 -4.9Q61.9 -9.9 69.8 -17.3M54.8 -4.9Q62.7 -2 69.8 2.5"
			/></g
		><g fill="#000" stroke="#000" stroke-width="16" stroke-linejoin="round"
			><path d="M262 770L304 330H404L382 770Z" /><path d="M766 770L722 332H618L640 770Z" /><rect
				x="246"
				y="228"
				width="530"
				height="92"
				rx="8"
			/><rect x="220" y="184" width="584" height="34" rx="8" /><rect
				x="222"
				y="780"
				width="580"
				height="40"
				rx="8"
			/><rect x="176" y="830" width="672" height="40" rx="8" /><path d="M812 827L816 814L827 817L830 827Z" /><path
				d="M834 827L838 820L844 827Z"
			/><path d="M192 827L197 818L206 827Z" /></g
		><g fill="#fff"
			><path d="M262 770L304 330H404L382 770Z" /><path d="M766 770L722 332H618L640 770Z" /><rect
				x="246"
				y="228"
				width="530"
				height="92"
				rx="8"
			/><rect x="220" y="184" width="584" height="34" rx="8" /><rect
				x="222"
				y="780"
				width="580"
				height="40"
				rx="8"
			/><rect x="176" y="830" width="672" height="40" rx="8" /><path d="M812 827L816 814L827 817L830 827Z" /><path
				d="M834 827L838 820L844 827Z"
			/><path d="M192 827L197 818L206 827Z" /></g
		><g fill="#000" stroke="#000"
			><path
				d="M286.3545454545455 452L404 449"
				fill="none"
				stroke-width="9"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M275.4727272727273 564L398.2 568"
				fill="none"
				stroke-width="9"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M265.3545454545455 674L392.9 671"
				fill="none"
				stroke-width="9"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path d="M615 428L728 432" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" /><path
				d="M626 552L742 548"
				fill="none"
				stroke-width="9"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path d="M634 662L754 666" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" /><path
				d="M420 230V318"
				fill="none"
				stroke-width="9"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path d="M608 230V318" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" /><path
				d="M806 184L806 204L784 182Z"
			/><path d="M244 322L244 300L262 322Z" /><path
				d="M522 228L515 250L525 268L519 290M515 250L501 259"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M702 320L695 301L703 287L699 276"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M386 704L368 693L362 675L348 668M368 693L372 680"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M758 724L740 711L736 692"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M352 228L358 246L350 258"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M300 780L308 797L302 812"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M706 830L699 848L708 862M699 848L688 852"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path
				d="M640 184L646 200L641 210"
				fill="none"
				stroke-width="4.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/><path d="M558 322L578 322L569 309Z" /><path d="M393 628L393 652L379 641Z" /><path
				d="M612 470L612 492L626 480Z"
			/><path d="M804 778L804 798L786 778Z" /><path d="M174 872L174 852L194 872Z" /><path
				d="M330 182L350 182L339 192Z"
			/></g
		><g fill="none" stroke="#000" stroke-linecap="round"
			><path d="M246 596C254.3 583.3 268.3 571.3 284 560" stroke-width="32.1" /><path
				d="M284 560C299.7 548.7 332.3 540 340 528"
				stroke-width="31.7"
			/><path d="M340 528C347.7 516 333.7 501.7 330 488" stroke-width="31.3" /><path
				d="M330 488C326.3 474.3 316.7 460 318 446"
				stroke-width="30.9"
			/><path d="M318 446C319.3 432 330.7 417.7 338 404" stroke-width="30.5" /><path
				d="M338 404C345.3 390.3 360 377.7 362 364"
				stroke-width="30.1"
			/><path d="M362 364C364 350.3 357.3 334.3 350 322" stroke-width="29.7" /><path
				d="M350 322C342.7 309.7 328 301 318 290"
				stroke-width="29.3"
			/><path d="M318 290C308 279 295.3 268 290 256" stroke-width="28.9" /><path
				d="M290 256C284.7 244 282.7 229 286 218"
				stroke-width="28.5"
			/><path d="M286 218C289.3 207 299.3 197.7 310 190" stroke-width="28" /><path
				d="M310 190C320.7 182.3 335.7 175.3 350 172"
				stroke-width="27.6"
			/><path d="M350 172C364.3 168.7 383 171.3 396 170" stroke-width="27.2" /><path
				d="M396 170C409 168.7 419.7 166.3 428 164"
				stroke-width="26.8"
			/><path d="M428 164C436.3 161.7 441 159.7 446 156" stroke-width="26.4" /><path
				d="M446 156C451 152.3 456 144.3 458 142"
				stroke-width="26"
			/><path d="M783 592.4C774.7 578.3 758.2 566.2 741.7 555.6" stroke-width="32.1" /><path
				d="M741.7 555.6C725.2 545 691.4 539.1 684 528.7"
				stroke-width="31.7"
			/><path d="M684 528.7C676.6 518.3 693.7 507.7 697.3 493.3" stroke-width="31.3" /><path
				d="M697.3 493.3C700.9 478.9 707.8 457.8 705.8 442.2"
				stroke-width="30.9"
			/><path d="M705.8 442.2C703.8 426.7 692.4 413 685.4 400" stroke-width="30.5" /><path
				d="M685.4 400C678.4 387 665.8 377.3 664 364.3"
				stroke-width="30.1"
			/><path d="M664 364.3C662.2 351.3 667.2 334.8 674.7 322.1" stroke-width="29.7" /><path
				d="M674.7 322.1C682.2 309.4 698.7 300.3 709.1 288.3"
				stroke-width="29.3"
			/><path d="M709.1 288.3C719.5 276.3 732.6 261.9 737 250.3" stroke-width="28.9" /><path
				d="M737 250.3C741.4 238.7 740 228.1 735.6 218.5"
				stroke-width="28.5"
			/><path d="M735.6 218.5C731.2 208.9 721.1 201 710.4 192.7" stroke-width="28" /><path
				d="M710.4 192.7C699.7 184.4 684.9 172.7 671.5 168.8"
				stroke-width="27.6"
			/><path d="M671.5 168.8C658.1 164.9 643.3 169.5 629.9 169.2" stroke-width="27.2" /><path
				d="M629.9 169.2C616.5 169 598.9 168.7 590.9 167.3"
				stroke-width="26.8"
			/><path d="M590.9 167.3C582.9 165.9 585.2 164.9 581.9 161" stroke-width="26.4" /><path
				d="M581.9 161C578.6 157.2 572.7 147 570.9 144.2"
				stroke-width="26"
			/><path d="M239 614C235.2 611 222.5 604 216 596" stroke-width="27" /><path
				d="M216 596C209.5 588 202.7 571 200 566"
				stroke-width="25"
			/><path d="M704 292C697 296.3 676.7 309.7 662 318" stroke-width="27" /><path
				d="M662 318C647.3 326.3 626.7 331.7 616 342"
				stroke-width="26"
			/><path d="M616 342C605.3 352.3 601 373.7 598 380" stroke-width="25" /></g
		><g fill="#000" stroke="#000" stroke-width="16" stroke-linejoin="round"
			><path
				transform="translate(246 596) rotate(-95.3) scale(1 -1)"
				d="M0 0C6.3 -24.1 34.9 -29.2 63.38905742605251 -8.3C53.2 7.6 26.6 22.8 0 0Z"
			/><path
				transform="translate(340 528) rotate(-0.8) scale(1 1)"
				d="M0 0C5.7 -21.8 31.5 -26.3 57.25112689565687 -8.7C48.1 6.9 24 20.6 0 0Z"
			/><path
				transform="translate(318 446) rotate(-132.5) scale(1 -1)"
				d="M0 0C7.1 -27 39.1 -32.7 71.1762337244882 -3.2C59.8 8.5 29.9 25.6 0 0Z"
			/><path
				transform="translate(362 364) rotate(-20.3) scale(1 1)"
				d="M0 0C5.5 -20.9 30.2 -25.3 54.949816061054115 -3.3C46.2 6.6 23.1 19.8 0 0Z"
			/><path
				transform="translate(318 290) rotate(-192.9) scale(1 -1)"
				d="M0 0C6.6 -25.1 36.3 -30.3 65.92616748382392 -3C55.4 7.9 27.7 23.7 0 0Z"
			/><path
				transform="translate(286 218) rotate(-13.6) scale(1 1)"
				d="M0 0C6.8 -25.8 37.3 -31.2 67.80159366052129 -13.5C57 8.1 28.5 24.4 0 0Z"
			/><path
				transform="translate(350 172) rotate(-69.6) scale(1 -1)"
				d="M0 0C6.7 -25.4 36.7 -30.7 66.80685677613064 -7.2C56.1 8 28.1 24.1 0 0Z"
			/><path
				transform="translate(428 164) rotate(39.6) scale(1 1)"
				d="M0 0C5 -19.1 27.6 -23.1 50.24197050493535 -9.1C42.2 6 21.1 18.1 0 0Z"
			/><path
				transform="translate(446 156) rotate(-75.8) scale(1 -1)"
				d="M0 0C5.2 -19.8 28.7 -24 52.18352437955337 -5.5C43.8 6.3 21.9 18.8 0 0Z"
			/><path
				transform="translate(458 142) rotate(-41.4) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(458 142) rotate(-107.4) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/><path
				transform="translate(783 592.4) rotate(-65.3) scale(1 1)"
				d="M0 0C7.3 -27.7 40.1 -33.6 72.97809817440333 -13.4C61.3 8.8 30.7 26.3 0 0Z"
			/><path
				transform="translate(684 528.7) rotate(-161.8) scale(1 -1)"
				d="M0 0C5.7 -21.6 31.3 -26.2 56.87449488534568 -3C47.8 6.8 23.9 20.5 0 0Z"
			/><path
				transform="translate(705.8 442.2) rotate(-62.6) scale(1 1)"
				d="M0 0C5.7 -21.6 31.2 -26.1 56.763214542964256 -2.4C47.7 6.8 23.8 20.4 0 0Z"
			/><path
				transform="translate(664 364.3) rotate(-160.1) scale(1 -1)"
				d="M0 0C6.6 -25.2 36.5 -30.5 66.333689732582 -4.7C55.7 8 27.9 23.9 0 0Z"
			/><path
				transform="translate(709.1 288.3) rotate(-10.6) scale(1 1)"
				d="M0 0C5.4 -20.4 29.5 -24.7 53.60596895949029 -7.9C45 6.4 22.5 19.3 0 0Z"
			/><path
				transform="translate(735.6 218.5) rotate(-161.4) scale(1 -1)"
				d="M0 0C5.4 -20.5 29.7 -24.9 54.0762418750136 -10.8C45.4 6.5 22.7 19.5 0 0Z"
			/><path
				transform="translate(710.4 192.7) rotate(-88.7) scale(1 1)"
				d="M0 0C5.7 -21.6 31.3 -26.2 56.870000550234685 -9.3C47.8 6.8 23.9 20.5 0 0Z"
			/><path
				transform="translate(629.9 169.2) rotate(-224.3) scale(1 -1)"
				d="M0 0C5.4 -20.6 29.8 -25 54.242125226462 -2.7C45.6 6.5 22.8 19.5 0 0Z"
			/><path
				transform="translate(581.9 161) rotate(-73) scale(1 1)"
				d="M0 0C4.9 -18.6 26.9 -22.5 48.90421643425752 -9.6C41.1 5.9 20.5 17.6 0 0Z"
			/><path
				transform="translate(570.9 144.2) rotate(-115.2) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(570.9 144.2) rotate(-181.2) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/><path
				transform="translate(216 596) rotate(-190.7) scale(1 -1)"
				d="M0 0C6.1 -23.1 33.4 -27.9 60.658037409964656 -7.4C51 7.3 25.5 21.8 0 0Z"
			/><path
				transform="translate(200 566) rotate(-110.1) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(200 566) rotate(-176.1) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/><path
				transform="translate(662 318) rotate(189.1) scale(1 1)"
				d="M0 0C6.2 -23.5 34 -28.4 61.7745010213668 -8.4C51.9 7.4 25.9 22.2 0 0Z"
			/><path
				transform="translate(616 342) rotate(101.4) scale(1 -1)"
				d="M0 0C5.7 -21.8 31.5 -26.4 57.29037466812431 -4.8C48.1 6.9 24.1 20.6 0 0Z"
			/><path
				transform="translate(598 380) rotate(123.3) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(598 380) rotate(57.3) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/></g
		><g fill="none" stroke="#fff" stroke-linecap="round"
			><path d="M234 636C231.3 623 237.7 608.7 246 596" stroke-width="16.5" /><path
				d="M791.6 640.5C794.1 625.9 791.3 606.6 783 592.4"
				stroke-width="16.5"
			/><path d="M246 596C254.3 583.3 268.3 571.3 284 560" stroke-width="16.1" /><path
				d="M284 560C299.7 548.7 332.3 540 340 528"
				stroke-width="15.7"
			/><path d="M340 528C347.7 516 333.7 501.7 330 488" stroke-width="15.3" /><path
				d="M330 488C326.3 474.3 316.7 460 318 446"
				stroke-width="14.9"
			/><path d="M318 446C319.3 432 330.7 417.7 338 404" stroke-width="14.5" /><path
				d="M338 404C345.3 390.3 360 377.7 362 364"
				stroke-width="14.1"
			/><path d="M362 364C364 350.3 357.3 334.3 350 322" stroke-width="13.7" /><path
				d="M350 322C342.7 309.7 328 301 318 290"
				stroke-width="13.3"
			/><path d="M318 290C308 279 295.3 268 290 256" stroke-width="12.9" /><path
				d="M290 256C284.7 244 282.7 229 286 218"
				stroke-width="12.5"
			/><path d="M286 218C289.3 207 299.3 197.7 310 190" stroke-width="12" /><path
				d="M310 190C320.7 182.3 335.7 175.3 350 172"
				stroke-width="11.6"
			/><path d="M350 172C364.3 168.7 383 171.3 396 170" stroke-width="11.2" /><path
				d="M396 170C409 168.7 419.7 166.3 428 164"
				stroke-width="10.8"
			/><path d="M428 164C436.3 161.7 441 159.7 446 156" stroke-width="10.4" /><path
				d="M446 156C451 152.3 456 144.3 458 142"
				stroke-width="10"
			/><path d="M783 592.4C774.7 578.3 758.2 566.2 741.7 555.6" stroke-width="16.1" /><path
				d="M741.7 555.6C725.2 545 691.4 539.1 684 528.7"
				stroke-width="15.7"
			/><path d="M684 528.7C676.6 518.3 693.7 507.7 697.3 493.3" stroke-width="15.3" /><path
				d="M697.3 493.3C700.9 478.9 707.8 457.8 705.8 442.2"
				stroke-width="14.9"
			/><path d="M705.8 442.2C703.8 426.7 692.4 413 685.4 400" stroke-width="14.5" /><path
				d="M685.4 400C678.4 387 665.8 377.3 664 364.3"
				stroke-width="14.1"
			/><path d="M664 364.3C662.2 351.3 667.2 334.8 674.7 322.1" stroke-width="13.7" /><path
				d="M674.7 322.1C682.2 309.4 698.7 300.3 709.1 288.3"
				stroke-width="13.3"
			/><path d="M709.1 288.3C719.5 276.3 732.6 261.9 737 250.3" stroke-width="12.9" /><path
				d="M737 250.3C741.4 238.7 740 228.1 735.6 218.5"
				stroke-width="12.5"
			/><path d="M735.6 218.5C731.2 208.9 721.1 201 710.4 192.7" stroke-width="12" /><path
				d="M710.4 192.7C699.7 184.4 684.9 172.7 671.5 168.8"
				stroke-width="11.6"
			/><path d="M671.5 168.8C658.1 164.9 643.3 169.5 629.9 169.2" stroke-width="11.2" /><path
				d="M629.9 169.2C616.5 169 598.9 168.7 590.9 167.3"
				stroke-width="10.8"
			/><path d="M590.9 167.3C582.9 165.9 585.2 164.9 581.9 161" stroke-width="10.4" /><path
				d="M581.9 161C578.6 157.2 572.7 147 570.9 144.2"
				stroke-width="10"
			/><path d="M239 614C235.2 611 222.5 604 216 596" stroke-width="11" /><path
				d="M216 596C209.5 588 202.7 571 200 566"
				stroke-width="9"
			/><path d="M704 292C697 296.3 676.7 309.7 662 318" stroke-width="11" /><path
				d="M662 318C647.3 326.3 626.7 331.7 616 342"
				stroke-width="10"
			/><path d="M616 342C605.3 352.3 601 373.7 598 380" stroke-width="9" /></g
		><g fill="#fff"
			><path
				transform="translate(246 596) rotate(-95.3) scale(1 -1)"
				d="M0 0C6.3 -24.1 34.9 -29.2 63.38905742605251 -8.3C53.2 7.6 26.6 22.8 0 0Z"
			/><path
				transform="translate(340 528) rotate(-0.8) scale(1 1)"
				d="M0 0C5.7 -21.8 31.5 -26.3 57.25112689565687 -8.7C48.1 6.9 24 20.6 0 0Z"
			/><path
				transform="translate(318 446) rotate(-132.5) scale(1 -1)"
				d="M0 0C7.1 -27 39.1 -32.7 71.1762337244882 -3.2C59.8 8.5 29.9 25.6 0 0Z"
			/><path
				transform="translate(362 364) rotate(-20.3) scale(1 1)"
				d="M0 0C5.5 -20.9 30.2 -25.3 54.949816061054115 -3.3C46.2 6.6 23.1 19.8 0 0Z"
			/><path
				transform="translate(318 290) rotate(-192.9) scale(1 -1)"
				d="M0 0C6.6 -25.1 36.3 -30.3 65.92616748382392 -3C55.4 7.9 27.7 23.7 0 0Z"
			/><path
				transform="translate(286 218) rotate(-13.6) scale(1 1)"
				d="M0 0C6.8 -25.8 37.3 -31.2 67.80159366052129 -13.5C57 8.1 28.5 24.4 0 0Z"
			/><path
				transform="translate(350 172) rotate(-69.6) scale(1 -1)"
				d="M0 0C6.7 -25.4 36.7 -30.7 66.80685677613064 -7.2C56.1 8 28.1 24.1 0 0Z"
			/><path
				transform="translate(428 164) rotate(39.6) scale(1 1)"
				d="M0 0C5 -19.1 27.6 -23.1 50.24197050493535 -9.1C42.2 6 21.1 18.1 0 0Z"
			/><path
				transform="translate(446 156) rotate(-75.8) scale(1 -1)"
				d="M0 0C5.2 -19.8 28.7 -24 52.18352437955337 -5.5C43.8 6.3 21.9 18.8 0 0Z"
			/><path
				transform="translate(458 142) rotate(-41.4) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(458 142) rotate(-107.4) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/><path
				transform="translate(783 592.4) rotate(-65.3) scale(1 1)"
				d="M0 0C7.3 -27.7 40.1 -33.6 72.97809817440333 -13.4C61.3 8.8 30.7 26.3 0 0Z"
			/><path
				transform="translate(684 528.7) rotate(-161.8) scale(1 -1)"
				d="M0 0C5.7 -21.6 31.3 -26.2 56.87449488534568 -3C47.8 6.8 23.9 20.5 0 0Z"
			/><path
				transform="translate(705.8 442.2) rotate(-62.6) scale(1 1)"
				d="M0 0C5.7 -21.6 31.2 -26.1 56.763214542964256 -2.4C47.7 6.8 23.8 20.4 0 0Z"
			/><path
				transform="translate(664 364.3) rotate(-160.1) scale(1 -1)"
				d="M0 0C6.6 -25.2 36.5 -30.5 66.333689732582 -4.7C55.7 8 27.9 23.9 0 0Z"
			/><path
				transform="translate(709.1 288.3) rotate(-10.6) scale(1 1)"
				d="M0 0C5.4 -20.4 29.5 -24.7 53.60596895949029 -7.9C45 6.4 22.5 19.3 0 0Z"
			/><path
				transform="translate(735.6 218.5) rotate(-161.4) scale(1 -1)"
				d="M0 0C5.4 -20.5 29.7 -24.9 54.0762418750136 -10.8C45.4 6.5 22.7 19.5 0 0Z"
			/><path
				transform="translate(710.4 192.7) rotate(-88.7) scale(1 1)"
				d="M0 0C5.7 -21.6 31.3 -26.2 56.870000550234685 -9.3C47.8 6.8 23.9 20.5 0 0Z"
			/><path
				transform="translate(629.9 169.2) rotate(-224.3) scale(1 -1)"
				d="M0 0C5.4 -20.6 29.8 -25 54.242125226462 -2.7C45.6 6.5 22.8 19.5 0 0Z"
			/><path
				transform="translate(581.9 161) rotate(-73) scale(1 1)"
				d="M0 0C4.9 -18.6 26.9 -22.5 48.90421643425752 -9.6C41.1 5.9 20.5 17.6 0 0Z"
			/><path
				transform="translate(570.9 144.2) rotate(-115.2) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(570.9 144.2) rotate(-181.2) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/><path
				transform="translate(216 596) rotate(-190.7) scale(1 -1)"
				d="M0 0C6.1 -23.1 33.4 -27.9 60.658037409964656 -7.4C51 7.3 25.5 21.8 0 0Z"
			/><path
				transform="translate(200 566) rotate(-110.1) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(200 566) rotate(-176.1) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/><path
				transform="translate(662 318) rotate(189.1) scale(1 1)"
				d="M0 0C6.2 -23.5 34 -28.4 61.7745010213668 -8.4C51.9 7.4 25.9 22.2 0 0Z"
			/><path
				transform="translate(616 342) rotate(101.4) scale(1 -1)"
				d="M0 0C5.7 -21.8 31.5 -26.4 57.29037466812431 -4.8C48.1 6.9 24.1 20.6 0 0Z"
			/><path
				transform="translate(598 380) rotate(123.3) scale(1 1)"
				d="M0 0C4.6 -15.2 25.3 -18.4 46 -4.8C38.6 4.8 19.3 14.4 0 0Z"
			/><path
				transform="translate(598 380) rotate(57.3) scale(1 -1)"
				d="M0 0C3.6 -13.3 19.8 -16.1 36 -2.8C30.2 4.2 15.1 12.6 0 0Z"
			/></g
		><g fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"
			><path transform="translate(246 596) rotate(-95.3) scale(1 -1)" d="M6.3 0Q28.5 -1 54.5 -5.5" /><path
				transform="translate(340 528) rotate(-0.8) scale(1 1)"
				d="M5.7 0Q25.8 -1 49.2 -5.8"
			/><path transform="translate(318 446) rotate(-132.5) scale(1 -1)" d="M7.1 0Q32 -0.4 61.2 -2.1" /><path
				transform="translate(362 364) rotate(-20.3) scale(1 1)"
				d="M5.5 0Q24.7 -0.4 47.3 -2.2"
			/><path transform="translate(318 290) rotate(-192.9) scale(1 -1)" d="M6.6 0Q29.7 -0.4 56.7 -2" /><path
				transform="translate(286 218) rotate(-13.6) scale(1 1)"
				d="M6.8 0Q30.5 -1.6 58.3 -9"
			/><path transform="translate(350 172) rotate(-69.6) scale(1 -1)" d="M6.7 0Q30.1 -0.9 57.5 -4.8" /><path
				transform="translate(428 164) rotate(39.6) scale(1 1)"
				d="M5 0Q22.6 -1.1 43.2 -6.1"
			/><path transform="translate(446 156) rotate(-75.8) scale(1 -1)" d="M5.2 0Q23.5 -0.7 44.9 -3.6" /><path
				transform="translate(458 142) rotate(-41.4) scale(1 1)"
				d="M4.6 0Q20.7 -0.6 39.6 -3.2"
			/><path transform="translate(458 142) rotate(-107.4) scale(1 -1)" d="M3.6 0Q16.2 -0.3 31 -1.9" /><path
				transform="translate(783 592.4) rotate(-65.3) scale(1 1)"
				d="M7.3 0Q32.8 -1.6 62.8 -8.9"
			/><path transform="translate(684 528.7) rotate(-161.8) scale(1 -1)" d="M5.7 0Q25.6 -0.4 48.9 -2" /><path
				transform="translate(705.8 442.2) rotate(-62.6) scale(1 1)"
				d="M5.7 0Q25.5 -0.3 48.8 -1.6"
			/><path transform="translate(664 364.3) rotate(-160.1) scale(1 -1)" d="M6.6 0Q29.9 -0.6 57 -3.1" /><path
				transform="translate(709.1 288.3) rotate(-10.6) scale(1 1)"
				d="M5.4 0Q24.1 -1 46.1 -5.3"
			/><path transform="translate(735.6 218.5) rotate(-161.4) scale(1 -1)" d="M5.4 0Q24.3 -1.3 46.5 -7.2" /><path
				transform="translate(710.4 192.7) rotate(-88.7) scale(1 1)"
				d="M5.7 0Q25.6 -1.1 48.9 -6.2"
			/><path transform="translate(629.9 169.2) rotate(-224.3) scale(1 -1)" d="M5.4 0Q24.4 -0.3 46.6 -1.8" /><path
				transform="translate(581.9 161) rotate(-73) scale(1 1)"
				d="M4.9 0Q22 -1.1 42.1 -6.4"
			/><path transform="translate(570.9 144.2) rotate(-115.2) scale(1 1)" d="M4.6 0Q20.7 -0.6 39.6 -3.2" /><path
				transform="translate(570.9 144.2) rotate(-181.2) scale(1 -1)"
				d="M3.6 0Q16.2 -0.3 31 -1.9"
			/><path transform="translate(216 596) rotate(-190.7) scale(1 -1)" d="M6.1 0Q27.3 -0.9 52.2 -4.9" /><path
				transform="translate(200 566) rotate(-110.1) scale(1 1)"
				d="M4.6 0Q20.7 -0.6 39.6 -3.2"
			/><path transform="translate(200 566) rotate(-176.1) scale(1 -1)" d="M3.6 0Q16.2 -0.3 31 -1.9" /><path
				transform="translate(662 318) rotate(189.1) scale(1 1)"
				d="M6.2 0Q27.8 -1 53.1 -5.6"
			/><path transform="translate(616 342) rotate(101.4) scale(1 -1)" d="M5.7 0Q25.8 -0.6 49.3 -3.2" /><path
				transform="translate(598 380) rotate(123.3) scale(1 1)"
				d="M4.6 0Q20.7 -0.6 39.6 -3.2"
			/><path transform="translate(598 380) rotate(57.3) scale(1 -1)" d="M3.6 0Q16.2 -0.3 31 -1.9" /></g
		><g fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" opacity="0.55"
			><path
				transform="translate(246 596) rotate(-95.3) scale(1 -1)"
				d="M16.5 -0.5Q21.6 -5.6 27.3 -13.2M16.5 -0.5Q22.2 2.5 27.3 7.1M27.9 -1.4Q33 -6.3 38.7 -13.5M27.9 -1.4Q33.6 1.5 38.7 5.8M39.3 -2.9Q44.4 -6.4 50.1 -11.7M39.3 -2.9Q45 -0.7 50.1 2.5"
			/><path
				transform="translate(340 528) rotate(-0.8) scale(1 1)"
				d="M14.9 -0.5Q19.5 -5.1 24.6 -12M14.9 -0.5Q20 2.2 24.6 6.3M25.2 -1.5Q29.8 -5.9 34.9 -12.4M25.2 -1.5Q30.3 1.1 34.9 5M35.5 -3Q40.1 -6.2 45.2 -11M35.5 -3Q40.6 -1.1 45.2 1.8"
			/><path
				transform="translate(318 446) rotate(-132.5) scale(1 -1)"
				d="M18.5 -0.2Q24.2 -5.9 30.6 -14.4M18.5 -0.2Q24.9 3.2 30.6 8.3M31.3 -0.6Q37 -6 43.4 -14.1M31.3 -0.6Q37.7 2.7 43.4 7.6M44.1 -1.1Q49.8 -5.1 56.2 -11.1M44.1 -1.1Q50.5 1.3 56.2 4.9"
			/><path
				transform="translate(362 364) rotate(-20.3) scale(1 1)"
				d="M14.3 -0.2Q18.7 -4.6 23.6 -11.2M14.3 -0.2Q19.2 2.4 23.6 6.4M24.2 -0.6Q28.6 -4.8 33.5 -11M24.2 -0.6Q29.1 1.9 33.5 5.7M34.1 -1.2Q38.5 -4.2 43.4 -8.9M34.1 -1.2Q39 0.7 43.4 3.5"
			/><path
				transform="translate(318 290) rotate(-192.9) scale(1 -1)"
				d="M17.1 -0.2Q22.4 -5.5 28.3 -13.4M17.1 -0.2Q23.1 3 28.3 7.7M29 -0.5Q34.3 -5.5 40.2 -13.1M29 -0.5Q34.9 2.5 40.2 7M40.9 -1Q46.1 -4.7 52.1 -10.3M40.9 -1Q46.8 1.2 52.1 4.5"
			/><path
				transform="translate(286 218) rotate(-13.6) scale(1 1)"
				d="M17.6 -0.8Q23.1 -6.2 29.2 -14.4M17.6 -0.8Q23.7 2.4 29.2 7.3M29.8 -2.3Q35.3 -7.5 41.4 -15.2M29.8 -2.3Q35.9 0.7 41.4 5.4M42 -4.7Q47.5 -8.5 53.6 -14.2M42 -4.7Q48.1 -2.4 53.6 1"
			/><path
				transform="translate(350 172) rotate(-69.6) scale(1 -1)"
				d="M17.4 -0.4Q22.7 -5.8 28.7 -13.8M17.4 -0.4Q23.4 2.8 28.7 7.6M29.4 -1.2Q34.7 -6.3 40.8 -13.9M29.4 -1.2Q35.4 1.8 40.8 6.4M41.4 -2.5Q46.8 -6.2 52.8 -11.8M41.4 -2.5Q47.4 -0.2 52.8 3.1"
			/><path
				transform="translate(428 164) rotate(39.6) scale(1 1)"
				d="M13.1 -0.6Q17.1 -4.6 21.6 -10.6M13.1 -0.6Q17.6 1.9 21.6 5.5M22.1 -1.6Q26.1 -5.4 30.6 -11.1M22.1 -1.6Q26.6 0.7 30.6 4.1M31.2 -3.1Q35.2 -6 39.7 -10.2M31.2 -3.1Q35.7 -1.5 39.7 1.1"
			/><path
				transform="translate(446 156) rotate(-75.8) scale(1 -1)"
				d="M13.6 -0.3Q17.7 -4.5 22.4 -10.8M13.6 -0.3Q18.3 2.2 22.4 5.9M23 -1Q27.1 -4.9 31.8 -10.9M23 -1Q27.7 1.4 31.8 5M32.4 -1.9Q36.5 -4.8 41.2 -9.2M32.4 -1.9Q37.1 -0.1 41.2 2.5"
			/><path
				transform="translate(783 592.4) rotate(-65.3) scale(1 1)"
				d="M19 -0.8Q24.8 -6.7 31.4 -15.4M19 -0.8Q25.5 2.7 31.4 7.9M32.1 -2.3Q37.9 -7.9 44.5 -16.2M32.1 -2.3Q38.7 1 44.5 6M45.2 -4.6Q51.1 -8.7 57.7 -14.9M45.2 -4.6Q51.8 -2.2 57.7 1.5"
			/><path
				transform="translate(684 528.7) rotate(-161.8) scale(1 -1)"
				d="M14.8 -0.2Q19.3 -4.7 24.5 -11.6M14.8 -0.2Q19.9 2.5 24.5 6.6M25 -0.5Q29.6 -4.8 34.7 -11.3M25 -0.5Q30.1 2.1 34.7 6M35.3 -1Q39.8 -4.2 44.9 -9M35.3 -1Q40.4 0.9 44.9 3.7"
			/><path
				transform="translate(705.8 442.2) rotate(-62.6) scale(1 1)"
				d="M14.8 -0.1Q19.3 -4.7 24.4 -11.5M14.8 -0.1Q19.9 2.6 24.4 6.7M25 -0.4Q29.5 -4.7 34.6 -11.2M25 -0.4Q30.1 2.2 34.6 6.1M35.2 -0.8Q39.7 -4 44.8 -8.8M35.2 -0.8Q40.3 1.1 44.8 4"
			/><path
				transform="translate(664 364.3) rotate(-160.1) scale(1 -1)"
				d="M17.2 -0.3Q22.6 -5.6 28.5 -13.6M17.2 -0.3Q23.2 2.9 28.5 7.7M29.2 -0.8Q34.5 -5.9 40.5 -13.4M29.2 -0.8Q35.2 2.2 40.5 6.7M41.1 -1.6Q46.4 -5.3 52.4 -10.9M41.1 -1.6Q47.1 0.6 52.4 3.9"
			/><path
				transform="translate(709.1 288.3) rotate(-10.6) scale(1 1)"
				d="M13.9 -0.5Q18.2 -4.8 23.1 -11.2M13.9 -0.5Q18.8 2.1 23.1 6M23.6 -1.4Q27.9 -5.5 32.7 -11.6M23.6 -1.4Q28.4 1.1 32.7 4.7M33.2 -2.7Q37.5 -5.7 42.3 -10.2M33.2 -2.7Q38.1 -0.9 42.3 1.8"
			/><path
				transform="translate(735.6 218.5) rotate(-161.4) scale(1 -1)"
				d="M14.1 -0.7Q18.4 -5 23.3 -11.5M14.1 -0.7Q18.9 1.9 23.3 5.8M23.8 -1.9Q28.1 -6 33 -12.1M23.8 -1.9Q28.7 0.6 33 4.3M33.5 -3.7Q37.9 -6.8 42.7 -11.3M33.5 -3.7Q38.4 -1.9 42.7 0.8"
			/><path
				transform="translate(710.4 192.7) rotate(-88.7) scale(1 1)"
				d="M14.8 -0.6Q19.3 -5.1 24.5 -11.9M14.8 -0.6Q19.9 2.2 24.5 6.3M25 -1.6Q29.6 -5.9 34.7 -12.4M25 -1.6Q30.1 1 34.7 4.9M35.3 -3.2Q39.8 -6.4 44.9 -11.2M35.3 -3.2Q40.4 -1.3 44.9 1.6"
			/><path
				transform="translate(629.9 169.2) rotate(-224.3) scale(1 -1)"
				d="M14.1 -0.2Q18.4 -4.5 23.3 -11M14.1 -0.2Q19 2.4 23.3 6.3M23.9 -0.5Q28.2 -4.6 33.1 -10.8M23.9 -0.5Q28.7 2 33.1 5.7M33.6 -0.9Q38 -4 42.9 -8.5M33.6 -0.9Q38.5 0.9 42.9 3.6"
			/><path
				transform="translate(216 596) rotate(-190.7) scale(1 -1)"
				d="M15.8 -0.4Q20.6 -5.3 26.1 -12.6M15.8 -0.4Q21.2 2.5 26.1 6.8M26.7 -1.3Q31.5 -5.9 37 -12.8M26.7 -1.3Q32.1 1.5 37 5.6M37.6 -2.5Q42.5 -5.9 47.9 -11M37.6 -2.5Q43.1 -0.5 47.9 2.5"
			/><path
				transform="translate(662 318) rotate(189.1) scale(1 1)"
				d="M16.1 -0.5Q21 -5.5 26.6 -12.9M16.1 -0.5Q21.6 2.5 26.6 6.9M27.2 -1.5Q32.1 -6.2 37.7 -13.2M27.2 -1.5Q32.7 1.3 37.7 5.6M38.3 -2.9Q43.2 -6.4 48.8 -11.6M38.3 -2.9Q43.9 -0.8 48.8 2.3"
			/><path
				transform="translate(616 342) rotate(101.4) scale(1 -1)"
				d="M14.9 -0.3Q19.5 -4.9 24.6 -11.7M14.9 -0.3Q20.1 2.5 24.6 6.6M25.2 -0.8Q29.8 -5.2 34.9 -11.7M25.2 -0.8Q30.4 1.8 34.9 5.7M35.5 -1.7Q40.1 -4.9 45.3 -9.7M35.5 -1.7Q40.7 0.3 45.3 3.2"
			/></g
		></mask
	><rect class="ed-app-mark-ink" x="102" y="86" width="800" height="800" fill="#4f7a5a" mask="url(#{maskId})" />
</svg>

<style>
	.ed-app-mark {
		display: block;
		flex: none;
		width: var(--space-8);
		height: var(--space-8);
	}
	.ed-app-mark-ink {
		fill: var(--brand-primary);
	}
</style>
