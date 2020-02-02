const WebSocket = require('ws');
const request = require('request');
const freezer = require('./state');

let ws = null;
let connectionData = null;

function bind(data) {
	connectionData = data;
	ws = new WebSocket(`wss://${data.username}:${data.password}@${data.address}:${data.port}/`, 'wamp', {
		rejectUnauthorized: false
	});

	ws.on('error', err => {
		console.log(err);
		if (err.message.includes('ECONNREFUSED')) {
			destroy();
			setTimeout(() => {
				bind(data);
			}, 1000);
		}
	});

	ws.on('message', msg => {
		let res;
		try {
			res = JSON.parse(msg);
		} catch (err) {
			console.log(err);
		}
		if (res[0] === 0) {
			console.log('connected', res);
			freezer.emit(`api:connected`);
		}
		if (res[1] === 'OnJsonApiEvent') {
			const evt = res[2];
			// Console.log(`${evt.uri}:${evt.eventType}`);
			freezer.emit(`${evt.uri}:${evt.eventType}`, evt.data);
		}
	});

	ws.on('open', () => {
		ws.send('[5, "OnJsonApiEvent"]');
	});
}

function destroy() {
	ws.removeEventListener();
	ws = null;
}

const methods = {};
['post', 'put', 'get', 'del'].forEach(method => {
	methods[method] = function (endpoint, body) {
		return new Promise(resolve => {
			const options = {
				url: `${connectionData.protocol}://${connectionData.address}:${connectionData.port}${endpoint}`,
				auth: {
					user: connectionData.username,
					pass: connectionData.password
				},
				headers: {
					Accept: 'application/json'
				},
				json: true,
				body,
				rejectUnauthorized: false
			};

			request[method](options, (error, response, data) => {
				if (error || response.statusCode !== 200) {
					resolve();
					return;
				}

				resolve(data);
			});
		});
	};
});

module.exports = Object.assign({bind, destroy}, methods);
