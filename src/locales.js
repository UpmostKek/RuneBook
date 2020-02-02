const path = require('path');
const glob = require('glob');

const dictionary = {};
glob.sync(path.join(__dirname, '/locales/*.json')).forEach(filepath => {
	const lang = path.basename(filepath, '.json');
	dictionary[lang] = require(filepath);
});
module.exports = dictionary;
