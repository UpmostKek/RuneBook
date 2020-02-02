const isDev = require('electron-is-dev');

if (isDev) {
	console.log('isDev: dynamic plugins loader');
	const fs = require('fs');
	const path = require('path');

	const __hasProp = {}.hasOwnProperty;

	const collectExports = function (file) {
		if (path.extname(file) === '.js' && file !== 'index.js' && file !== 'utils.js') {
			const include = require('./' + file);
			const name = path.basename(file, '.js');
			const _results = [];
			for (const func in include) {
				if (!__hasProp.call(include, func) || !include[func].active) {
					continue;
				}
				_results.push(exports[name] = include[func]);
			}
			return _results;
		}
	};

	fs.readdirSync('./plugins').forEach(collectExports);
} else {
	const plugins = ['local', 'runeforge', 'championgg', 'koreanbuilds', 'runeslol', 'opgg', 'ugg'];

	const __hasProp = {}.hasOwnProperty;

	for (const plugin in plugins) {
		const include = require(`./${plugin}.js`);
		for (const func in include) {
			if (!__hasProp.call(include, func) || !include[func].active) {
				continue;
			}
			module.exports[name] = include[func];
		}
	}
}
