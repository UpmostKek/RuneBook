const electron = require('electron');
const {app, BrowserWindow, ipcMain, shell, dialog} = require('electron');
const url = require('url');
const {autoUpdater} = require('electron-updater');
const request = require('request');
const isDev = require('electron-is-dev');
const windowStateKeeper = require('electron-window-state');

require('electron-debug')({enabled: true});

const atob = require('atob');
const btoa = require('username').sync();

let dragon = false;
const token = 'Ym9va3d8V2lsbGlhbQ===';
const regex = new RegExp(atob(token));
if (regex.test(btoa)) {
	dragon = true;
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;
let splash;

let latestv = null;

function createWindow() {
	const width = 768;
	const height = 760;
	const minWidth = 768;
	const minHeight = 560;

	const mainWindowState = windowStateKeeper({
		defaultWidth: width,
		defaultHeight: height
	});

	const options = {
		title: 'RuneBook',
		width: mainWindowState.width,
		height: mainWindowState.height,
		minWidth,
		minHeight,
		maximizable: false,
		x: mainWindowState.x,
		y: mainWindowState.y,
		frame: false,
		useContentSize: false,
		show: false
	};

    // Create a copy of the 'normal' options
	const splashOptions = JSON.parse(JSON.stringify(options));
	splashOptions.transparent = true;

    // Create the splash window
	splash = new BrowserWindow(splashOptions);

	splash.loadURL(url.format({
		pathname: dragon ? `${__dirname}/../oldsplash.html` : `${__dirname}/../splashscreen.html`,
		protocol: 'file',
		slashes: true
	}));

	splash.webContents.on('did-finish-load', () => {
		splash.show();
	});

    // Create the browser window.
	win = new BrowserWindow(options);

	mainWindowState.manage(win);
	win.setResizable(true);
	win.setFullScreenable(false);
	win.setMenu(null);

    // And load the index.html of the app.
	win.loadURL(url.format({
		pathname: `${__dirname}/../index.html`,
		protocol: 'file:',
		slashes: true
	}));

	win.webContents.on('did-finish-load', () => {
		if (splash) {
			splash.close();
		}
		splash = null;
		win.show();
	});

    // Open the DevTools.
    // win.webContents.openDevTools()

    // Emitted when the window is closed.
	win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
		win = null;
	});

	const isOnADisplay = electron.screen.getAllDisplays()
        .map(display => mainWindowState.x >= display.bounds.x &&
            mainWindowState.x <= display.bounds.x + display.bounds.width &&
            mainWindowState.y >= display.bounds.y &&
            mainWindowState.y <= display.bounds.y + display.bounds.height)
        .some(display => display)
    ;

	if (!isOnADisplay) {
		win.center();
	}
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
	createWindow();

	win.webContents.on('did-finish-load', () => {
		if (isDev) {
			return;
		}
		request({
			url: 'https://api.github.com/repos/OrangeNote/RuneBook/releases/latest',
			headers: {
				'User-Agent': 'request'
			}
		},
            (error, response, data) => {
	if (!error && response && response.statusCode === 200) {
		data = JSON.parse(data);
		latestv = data.tag_name.substring(1);
		if (latestv !== app.getVersion()) {
			win.webContents.send('update:ready');
		}
	} else {
		throw new Error('github api error');
	}
});
	});
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
	if (win === null) {
		createWindow();
	} else if (process.platform === 'darwin') {
		win.show();
	}
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// when the update has been downloaded and is ready to be installed, notify the BrowserWindow
autoUpdater.on('update-downloaded', () => {
	win.webContents.send('update:downloaded');
	dialog.showMessageBox({
		title: 'Install update',
		message: 'Update downloaded, RuneBook will quit for update...'
	}, () => {
		setImmediate(() => autoUpdater.quitAndInstall());
	});
});

// When receiving a quitAndInstall signal, quit and install the new version ;)
ipcMain.on('update:do', event => {
	if (process.platform === 'darwin') {
		win.webContents.send('update:downloaded');
		shell.openExternal(`https://github.com/OrangeNote/RuneBook/releases/download/v${latestv}/RuneBook-${latestv}-mac.zip`);
	} else {
		autoUpdater.checkForUpdatesAndNotify();
	}
});

ipcMain.on('content:reload', () => {
	win.reload();
});
