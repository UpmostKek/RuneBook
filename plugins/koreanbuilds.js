const request = require('request');
const cheerio = require('cheerio');
const freezer = require('../src/state');

const url = 'http://koreanbuilds.net';

const stylesMap = {
	8000: 8000,
	8100: 8100,
	8200: 8200,
	8300: 8400,
	8400: 8300
};

const shardsMap = {
	5003: 5008,
	5008: 5003
};

function extractPage(html, champObj, champion, role, rec, callback, pageType) {
	const $ = cheerio.load(html);

	let pages = [];
	const slots = $('div[class^=perk-itm], div[class^=statperk]');

	$('img[src^=\'//statics.koreanbuilds.net/perks/\']', slots).each(function (index) {
		console.log(index);
		if (index % 11 === 0) {
			pages.push({
				name: champObj.name + ' ' + role + ' BC ' + $('#circle-big').text(),
				primaryStyleId: -1,
				selectedPerkIds: [0, 0, 0, 0, 0, 0],
				subStyleId: -1
				// "bookmark": {
				// 	"src": url + "/champion/" + champion + "/" + role + "/" + champObj.version.replace(/\.(?:[0-9]*)$/, '') + '/-1',
				// 	"meta": {
				// 		"pageType": Math.floor(index / 6),
				// 		"champion": champion
				// 	},
				// 	"remote": { "name": plugin.name, "id": plugin.id }
				// }
			});
		}
		let rune = $(this).attr('src');
		rune = rune.replace('//statics.koreanbuilds.net/perks/', '');
		rune = rune.replace('.png', '');
		rune = shardsMap[rune] ? shardsMap[rune] : rune;
		let primary = $('#reforged-primary .perk-img-c').attr('src');
		primary = primary.replace('//statics.koreanbuilds.net/perk-types/', '');
		primary = primary.replace('.png', '');
		let secondary = $('#reforged-secondary .perk-img-c').attr('src');
		secondary = secondary.replace('//statics.koreanbuilds.net/perk-types/', '');
		secondary = secondary.replace('.png', '');
		if (index % 9 === 0) {
			pages[pages.length - 1].primaryStyleId = stylesMap[primary];
			pages[pages.length - 1].subStyleId = stylesMap[secondary];
		}
		pages[pages.length - 1].selectedPerkIds[index] = parseInt(rune, 10);
	});

	if (rec) {
		let reqCount = 0;
		const summs = [];
		$('#summSel option').each(function (index) {
			if (index !== 0)				{
				summs.push($(this).val());
			}
		});
		console.log('IF REC TRUE');
		console.log('summs length', summs.length);
		if (summs.length === 0) {
			return callback(pages);
		}
		summs.forEach(value => {
			console.log(url + '/champion/' + champObj.name + '/' + role + '/' + champObj.version.replace(/\.(?:[0-9]*)$/, '') + '/enc/' + value);
			request.get(url + '/champion/' + champObj.name + '/' + role + '/' + champObj.version.replace(/\.(?:[0-9]*)$/, '') + '/enc/' + value, (error, response, _html) => {
				if (!error && response.statusCode === 200) {
					const newPages = extractPage(_html, champObj, champion, role, false);
					pages = pages.concat(newPages);
					console.log('newPages', newPages);
					if (++reqCount === summs.length) {
						callback(pages);
					}
				}
			});
		});
	}
	const regex = /(?:\d{0,3}(\.\d{1,2})? *%?)$/;
	pages.sort((a, b) => {
		const percentA = parseFloat(a.name.match(regex)[0]);
		const percentB = parseFloat(b.name.match(regex)[0]);
		return percentB - percentA;
	});
	return ((typeof pageType === 'undefined') ? pages : pages[pageType]);
}

function _getPages(champion, callback) {
	const res = {pages: {}};

	const champ = freezer.get().championsinfo[champion];
	const champId = champ.key;
	request.get(url + '/roles?championid=' + champId, (error, response, html) => {
		if (!error && response.statusCode === 200) {
			const $ = cheerio.load(html);
			const rolesExtracted = $.root().text().split('\n').filter(value => value !== '');
			const roles = rolesExtracted.map(s => {
				return String.prototype.trim.apply(s);
			});
			if (roles.length === 0 || roles.length === undefined) {
				console.log(`No builds found for ${champion}.`);
				callback(res);
			} else {
				roles.forEach(role => {
					const champUrl = url + '/champion/' + champ.name + '/' + role + '/' + champ.version.replace(/\.(?:[0-9]*)$/, '') + '/enc/NA';
					request.get(champUrl, (error, response, html) => {
						if (!error && response.statusCode === 200) {
							extractPage(html, champ, champion, role, true, pages => {
								pages.forEach(page => {
									res.pages[page.name] = page;
								});
								console.log(res);
								callback(res);
							});
						} else {
							callback(res);
							throw new Error('rune page not loaded');
						}
					});
				});
			}
		} else {
			callback(res);
			throw new Error('roles page not loaded');
		}
	});
}

const plugin = {
	id: 'koreanbuilds',
	name: 'Korean Builds',
	active: true,
	bookmarks: false,

	getPages(champion, callback) {
		_getPages(champion, callback);
	},

	syncBookmark(bookmark, callback) {
		request.get(bookmark.src, (error, response, html) => {
			if (!error && response.statusCode === 200) {
				callback(extractPage(html, bookmark.meta.champion, false, null, bookmark.meta.pageType));
			} else {
				throw new Error('rune page not loaded');
			}
		});
	}
};

module.exports = {plugin};
