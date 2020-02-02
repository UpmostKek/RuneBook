const {ipcRenderer, remote} = require('electron');
const path = require('path');
const LCUConnector = require('lcu-connector');
const request = require('request');
const plugins = require('../plugins');
const settings = require('./settings');
const freezer = require('./state');
const api = require('./lcu-api');

freezer.get().configfile.set({
	name: settings.get('config.name') + settings.get('config.ext'),
	cwd: settings.get('config.cwd'),
	leaguepath: settings.get('leaguepath'),
	pathdiscovery: settings.get('pathdiscovery'),
	darktheme: settings.get('darktheme'),
	lang: settings.get('lang')
});

freezer.get().set('autochamp', settings.get('autochamp'));
freezer.get().tab.set({active: settings.get('lasttab'), loaded: true});

console.log('config leaguepath', freezer.get().configfile.leaguepath);
console.log('config pathdiscovery', freezer.get().configfile.pathdiscovery);
const connector = new LCUConnector(freezer.get().configfile.pathdiscovery ? undefined : freezer.get().configfile.leaguepath);

connector.on('connect', data => {
	console.log('client found');
	api.bind(data);
});

connector.on('disconnect', () => {
	console.log('client closed');
	api.destroy();
	freezer.get().session.set({connected: false, state: ''});
	freezer.get().set('champselect', false);
});

// Start listening for the LCU client
connector.start();

ipcRenderer.on('update:ready', event => {
	console.log('github new latest found');
	freezer.get().set('updateready', true);
});
ipcRenderer.on('update:downloaded', event => {
	console.log('update downloaded');
	freezer.emit('update:downloaded');
});

freezer.on('configfile:change', newPath => {
	settings.set({
		config: {
			name: path.basename(newPath, path.extname(newPath)),
			cwd: path.dirname(newPath),
			ext: path.extname(newPath)
		}
	});
});

freezer.on('pathdiscovery:switch', val => {
	freezer.get().configfile.set('pathdiscovery', val);
	settings.set('pathdiscovery', val);
});

freezer.on('darktheme:switch', val => {
	freezer.get().configfile.set('darktheme', val);
	settings.set('darktheme', val);
});

freezer.on('lang:update', val => {
	freezer.get().configfile.set('lang', val);
	settings.set('lang', val);
});

freezer.on('leaguepath:change', leaguepath => {
	leaguepath = path.join(path.dirname(path.normalize(leaguepath)), (process.platform === 'darwin' ? 'LeagueClient.app' : 'LeagueClient.exe'));
	freezer.get().configfile.set('leaguepath', leaguepath);
	settings.set('leaguepath', leaguepath);
});

freezer.on('update:do', () => {
	ipcRenderer.send('update:do');
});

freezer.on('content:reload', () => {
	ipcRenderer.send('content:reload');
});

freezer.on('changelog:ready', () => {
	const appVersion = remote.app.getVersion();
	console.log(appVersion, settings.get('changelogversion'));
	if (settings.get('changelogversion') !== appVersion) {
		// Freezer.get().set("showchangelog", true);
		settings.set('changelogversion', appVersion);
	}
});

request('https://ddragon.leagueoflegends.com/realms/euw.json', (error, response, data) => {
	if (!error && response && response.statusCode === 200) {
		freezer.emit('version:set', JSON.parse(data).v);
	} else {
		throw new Error('Couldn\'t get ddragon api version');
	}
});

freezer.on('version:set', ver => {
	request('http://ddragon.leagueoflegends.com/cdn/' + ver + '/data/en_US/champion.json', (error, response, data) => {
		if (!error && response && response.statusCode === 200) {
			freezer.get().set('championsinfo', JSON.parse(data).data);
			freezer.emit('championsinfo:set');
		}
	});
});

freezer.on('api:connected', () => {
	api.get('/lol-summoner/v1/current-summoner').then(res => {
		updateConnectionData();
		if (!res) {
			console.log('no session response');
			return;
		}
		console.log('session success', res);
		freezer.get().session.set({connected: res.connected, state: res.state});
	});
});

console.log('plugins', plugins);
function loadPlugins() {
	const remote = {};
	const local = {};
	Object.keys(plugins).forEach(key => {
		if (plugins[key].local === true) {
			local[key] = {name: plugins[key].name};
		} else {
			remote[key] = {
				name: plugins[key].name,
				bookmarks: plugins[key].bookmarks || false,
				cache: {}
			};
		}
	});
	freezer.get().plugins.set({local, remote});
}
loadPlugins();

freezer.on('champion:choose', champion => {
	let state = freezer.get();

	const plugin = state.tab.active;

	// Check if champion is already been cached before asking the remote plugin
	if (state.plugins.remote[plugin] && state.plugins.remote[plugin].cache[champion]) {
		freezer.get().current.set({champion, champdata: state.plugins.remote[plugin].cache[champion] || {pages: {}}});
		console.log('CACHE HIT!');
		return;
	}

	freezer.get().tab.set({active: freezer.get().tab.active, loaded: false});
	freezer.get().current.set({champion}); // Update champ portrait before the data response

	state = freezer.get();

	plugins[state.tab.active].getPages(champion, res => {
		if (freezer.get().tab.active !== state.tab.active) {
			return;
		}
		freezer.get().current.set({champion, champdata: res || {pages: {}}});
		freezer.get().tab.set({loaded: true});

		// Cache results obtained from a remote source
		if (freezer.get().plugins.remote[plugin])			{
			freezer.get().plugins.remote[plugin].cache.set(champion, res);
		}
	});
});

freezer.on('tab:switch', tab => {
	freezer.get().tab.set({active: tab, loaded: true});
	settings.set('lasttab', tab);

	let state = freezer.get();

	const plugin = state.tab.active;
	const champion = freezer.get().current.champion;

	// Check if champion is already been cached before asking the remote plugin
	if (state.plugins.remote[plugin] && state.plugins.remote[plugin].cache[champion]) {
		freezer.get().current.set({champion, champdata: state.plugins.remote[plugin].cache[champion] || {pages: {}}});
		console.log('CACHE HIT!');
		return;
	}

	freezer.get().tab.set({active: tab, loaded: tab === 'local' || !freezer.get().current.champion});

	state = freezer.get();

	if (!state.current.champion) {
		return;
	}
	plugins[state.tab.active].getPages(state.current.champion, res => {
		if (freezer.get().tab.active !== state.tab.active) {
			return;
		}
		freezer.get().current.set({champion: freezer.get().current.champion, champdata: res || {pages: {}}});
		freezer.get().tab.set({loaded: true});

		// Cache results obtained from a remote source
		if (freezer.get().plugins.remote[plugin])			{
			freezer.get().plugins.remote[plugin].cache.set(champion, res);
		}
	});
});

freezer.on('page:fav', (champion, page) => {
	const state = freezer.get();
	plugins[state.tab.active].favPage(champion, page);
	plugins[state.tab.active].getPages(champion, res => {
		state.current.champdata.set(res);
	});
});

freezer.on('page:delete', (champion, page) => {
	const state = freezer.get();
	plugins[state.tab.active].deletePage(champion, page);
	plugins[state.tab.active].getPages(champion, res => {
		state.current.champdata.set(res);
	});
});

freezer.on('page:unlinkbookmark', (champion, page) => {
	if (freezer.get().lastbookmarkedpage.champion === champion && freezer.get().lastbookmarkedpage.page === page)		{
		freezer.get().lastbookmarkedpage.set({page: null, champion: null});
	}
	const state = freezer.get();
	plugins[state.tab.active].unlinkBookmark(champion, page);
	plugins[state.tab.active].getPages(champion, res => {
		state.current.champdata.set(res);
	});
});

freezer.on('page:bookmark', (champion, pagename) => {
	const state = freezer.get();

	const page = state.current.champdata.pages[pagename];
	console.log(page);

	plugins.local.setPage(champion, page);
	freezer.get().lastbookmarkedpage.set({champion, page: pagename});
	freezer.get().lastsyncedpage.set({champion: null, page: null, loading: false});
});

freezer.on('page:syncbookmark', (champion, page) => {
	freezer.get().lastsyncedpage.set({champion, page, loading: true});

	const state = freezer.get();

	page = state.current.champdata.pages[page];
	console.log(page);

	plugins[page.bookmark.remote.id].syncBookmark(page.bookmark, _page => {
		if (!_page) {
			freezer.get().lastsyncedpage.set({champion: null, page: null, loading: false});
			return;
		}
		plugins[state.tab.active].setPage(champion, _page);
		plugins[state.tab.active].getPages(champion, res => {
			state.current.champdata.set(res);
			freezer.get().lastsyncedpage.set({champion, page: _page.name, loading: false});
		});
	});
});

freezer.on('page:upload', (champion, page) => {
	const state = freezer.get();
	console.log('DEV page', page);
	console.log('DEV page data', state.current.champdata.pages[page]);
	console.log('DEV state pages', state.current.champdata.pages);
	let pageData = state.current.champdata.pages[page];
	pageData.name = page;
	pageData.current = true;

	console.log('page.id, page.isEditable', state.connection.page.id, state.connection.page.isEditable);
	if (state.connection.page.id && state.connection.page.isEditable && state.connection.summonerLevel >= 10) {
		freezer.off('/lol-perks/v1/currentpage:Update');
		freezer.get().lastuploadedpage.set({champion, page, loading: true});
		api.del('/lol-perks/v1/pages/' + freezer.get().connection.page.id).then(res => {
			console.log('api delete current page', res);

			// Stat shards check
			pageData = freezer.get().current.champdata.pages[page].toJS();
			if (!pageData.selectedPerkIds[6] && !pageData.selectedPerkIds[7] && !pageData.selectedPerkIds[8]) {
				pageData.selectedPerkIds = pageData.selectedPerkIds.concat([5008, 5002, 5003]);
			}

			api.post('/lol-perks/v1/pages/', pageData).then(res => {
				if (!res) {
					console.log('Error: no response after page upload request.');
					api.get('/lol-perks/v1/currentpage').then(res => {
						handleCurrentPageUpdate(res);
						freezer.on('/lol-perks/v1/currentpage:Update', handleCurrentPageUpdate);
					});
					return;
				}
				console.log('post res', res);
				api.get('/lol-perks/v1/currentpage').then(res => {
					handleCurrentPageUpdate(res);
					freezer.on('/lol-perks/v1/currentpage:Update', handleCurrentPageUpdate);
				});
				freezer.on('/lol-perks/v1/currentpage:Update', handleCurrentPageUpdate);
				freezer.get().lastuploadedpage.set({champion, page, valid: res.isValid === true, loading: false});

				const state = freezer.get();
				if (plugins[state.tab.active].local) {
					plugins[state.tab.active].confirmPageValidity(champion, page, res);
					plugins[state.tab.active].getPages(champion, res => {
						state.current.champdata.set(res);
					});
				}
			});
		});
	}
});

freezer.on('currentpage:download', () => {
	const state = freezer.get();

	const champion = state.current.champion;
	const page = state.connection.page;

	plugins[state.tab.active].setPage(champion, page);
	plugins[state.tab.active].getPages(champion, res => {
		state.current.champdata.set(res);
	});
});

freezer.on('/lol-summoner/v1/current-summoner:Update', summoner => {
	const state = freezer.get();

	state.session.set({connected: true, state: null});
	if (summoner.summonerLevel) {
		updateConnectionData();
	} else {
		freezer.get().connection.set({page: null, summonerLevel: 0});
	}
});

function handleCurrentPageUpdate(page) {
	const state = freezer.get();

	console.log('currentpage:Update', page.name);
	state.connection.set({page});
	if (page.name !== freezer.get().lastuploadedpage.page) {
		freezer.get().lastuploadedpage.set({champion: null, page: null, valid: false});
	}
}

function updateConnectionData() {
	api.get('/lol-perks/v1/currentpage').then(page => {
		if (!page) {
			console.log('Error: current page initialization failed');
			return;
		}
		freezer.get().connection.set({page});
		freezer.get().lastuploadedpage.set({champion: null, page: null, valid: false});
	});

	api.get('/lol-summoner/v1/current-summoner').then(summoner => {
		if (!summoner) {
			console.log('no summoner response');
			return;
		}
		freezer.get().connection.set('summonerLevel', summoner.summonerLevel);
	});

	api.get('/lol-perks/v1/perks').then(data => {
		if (!data) {
			return;
		}
		freezer.get().tooltips.set('rune', data);
	});
}

freezer.on('/lol-perks/v1/perks:Update', data => {
	if (!data) {
		return;
	}
	freezer.get().tooltips.set('rune', data);
});

freezer.on('/lol-perks/v1/currentpage:Update', handleCurrentPageUpdate);

freezer.on('/lol-champ-select/v1/session:Delete', () => {
	freezer.get().set('champselect', false);
});

freezer.on('/lol-champ-select/v1/session:Update', data => {
	console.log(data);
	const action = data.myTeam.find(el => data.localPlayerCellId === el.cellId);
	if (!action) {
		return;
	}

	freezer.get().set('champselect', (data.timer.phase === 'FINALIZATION'));

	if (freezer.get().autochamp === false) {
		return;
	}
	const champions = freezer.get().championsinfo;
	const champion = Object.keys(champions).find(el => champions[el].key === action.championId);
	console.log(champion);
	// If(champion !== freezer.get().current.champion) freezer.get().tab.set("active", "local"); // Avoid request spamming
	freezer.emit('champion:choose', champion);
});

freezer.on('autochamp:enable', () => {
	freezer.get().set('autochamp', true);
	settings.set('autochamp', true);

	// Check if a champ was already selected in client
	api.get('/lol-champ-select/v1/session').then(data => {
		console.log(data);
		if (!data) {
			return;
		}
		const action = data.myTeam.find(el => data.localPlayerCellId === el.cellId);
		if (!action) {
			return;
		}
		if (data.timer.phase !== 'FINALIZATION') {
			freezer.get().set('champselect', true);
		}
		const champions = freezer.get().championsinfo;
		const champion = Object.keys(champions).find(el => champions[el].key === action.championId);
		console.log(champion);
		// If(champion !== freezer.get().current.champion) freezer.get().tab.set("active", "local"); // Avoid request spamming
		freezer.emit('champion:choose', champion);
	});
});

freezer.on('autochamp:disable', () => {
	freezer.get().set('autochamp', false);
	settings.set('autochamp', false);
});
