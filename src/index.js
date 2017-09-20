// Native
const tessel = require('tessel');

// Packages
const osc = require('osc');

// Ours
const buttonLib = require('./button-lib');

const X32_UDP_PORT = 10023;
const LOCAL_PORT = 54263;
const HOST_MIC_CH = '04';
const HOST_TALKBACK_AUXIN_CH = '01';

const state = {
	testMode: false,
	hostMicOn: false,
	hostTalkbackOn: false,
	ledOn: true,
	writingToLed: false,
	buttonPressed: false,
	initialized: false
};

const aButton = buttonLib.use(tessel.port.A.pin[2]);
const ledPin = tessel.port.B.pin[0];
const udpPort = new osc.UDPPort({
	localAddress: '0.0.0.0',
	localPort: LOCAL_PORT,
	remoteAddress: '172.30.10.35',
	remotePort: X32_UDP_PORT,
	metadata: true
});

// Start with the LED off.
turnLedOff();

console.log('Current node version: ' + process.version);

aButton.on('ready', () => {
	aButton.on('press', () => {
		state.buttonPressed = true;

		if (!state.initialized) {
			return;
		}

		if (state.testMode) {
			turnLedOn();
		} else {
			state.hostMicAlreadyMuted = !state.hostMicOn;
			udpPort.send({
				address: `/ch/${HOST_MIC_CH}/mix/on`,
				args: [{type: 'i', value: 0}]
			});
			udpPort.send({
				address: `/auxin/${HOST_TALKBACK_AUXIN_CH}/mix/on`,
				args: [{type: 'i', value: 1}]
			});
		}
	});

	aButton.on('release', () => {
		state.buttonPressed = false;

		if (!state.initialized) {
			return;
		}

		if (state.testMode) {
			turnLedOff();
		} else {
			// Don't unmute the host mic on main if it was already muted before the button was pressed.
			if (!state.hostMicAlreadyMuted) {
				udpPort.send({
					address: `/ch/${HOST_MIC_CH}/mix/on`,
					args: [{type: 'i', value: 1}]
				});
			}

			udpPort.send({
				address: `/auxin/${HOST_TALKBACK_AUXIN_CH}/mix/on`,
				args: [{type: 'i', value: 0}]
			});
		}
	});
});

setTimeout(async () => {
	// If the button is held down when the device turns on, go into test mode,
	if (state.buttonPressed) {
		state.testMode = true;
		console.log('Test mode activated.');

		/* eslint-disable no-await-in-loop */
		// Blink 3 times to indicate that we're in test mode.
		const numBlinks = 3;
		for (let i = 0; i <= numBlinks; i++) {
			await blinkLed(true);

			if (i < numBlinks - 1) {
				await wait(100);
			}
		}
		/* eslint-enable no-await-in-loop */

		// Blink every 3 seconds to remind that it's in test mode.
		setInterval(blinkLed, 3000);
	} else {
		console.log('Normal mode activated.');

		// Open the socket.
		udpPort.open();
	}

	state.initialized = true;
}, 500);

udpPort.on('message', oscBundle => {
	if (oscBundle.address === `/ch/${HOST_MIC_CH}/mix/on`) {
		state.hostMicOn = Boolean(oscBundle.args[0].value);
	} else if (oscBundle.address === `/auxin/${HOST_TALKBACK_AUXIN_CH}/mix/on`) {
		state.hostTalkbackOn = Boolean(oscBundle.args[0].value);
	}

	checkLED();
});

udpPort.on('error', error => {
	console.error('[osc] Error:', error.stack);
});

udpPort.on('open', () => {
	console.log('[osc] X32 port open');
});

udpPort.on('close', () => {
	console.log('[osc] X32 port closed');
});

udpPort.once('open', () => {
	renewSubscriptions();
	setInterval(renewSubscriptions, 10000);
});

function checkLED() {
	if (state.writingToLed) {
		return;
	}

	if (!state.hostMicOn && state.hostTalkbackOn) {
		turnLedOn();
	} else if (state.ledOn) {
		turnLedOff();
	}
}

/**
 * Renews subscriptions with the X32 (they expire every 10s).
 * @returns {undefined}
 */
function renewSubscriptions() {
	// Subscribe to the mute status of the Host Mic channel on the main bus.
	udpPort.send({
		address: '/subscribe',
		args: [
			{type: 's', value: `/ch/${HOST_MIC_CH}/mix/on`},
			{type: 'i', value: 3}
		]
	});

	// Subscribe to the mute status of the Host Talkback channel on the main bus.
	udpPort.send({
		address: '/subscribe',
		args: [
			{type: 's', value: `/auxin/${HOST_TALKBACK_AUXIN_CH}/mix/on`},
			{type: 'i', value: 3}
		]
	});
}

/**
 * Turns the button LED on.
 */
function turnLedOn() {
	if (state.ledOn) {
		return;
	}

	state.writingToLed = true;
	return new Promise((resolve, reject) => {
		ledPin.write(1, error => {
			state.writingToLed = false;
			if (error) {
				console.error('Error turning LED on:', error);
				reject(error);
			} else {
				state.ledOn = true;
				resolve();
			}
		});
	});
}

/**
 * Turns the button LED off.
 */
function turnLedOff() {
	if (!state.ledOn) {
		return;
	}

	state.writingToLed = true;
	return new Promise((resolve, reject) => {
		ledPin.write(0, error => {
			state.writingToLed = false;
			if (error) {
				console.error('Error turning LED off:', error);
				reject(error);
			} else {
				state.ledOn = false;
				resolve();
			}
		});
	});
}

/**
 * Turns the LED on for 100ms, only if the button isn't currently pressed.
 */
async function blinkLed(force) {
	if (!force && state.buttonPressed) {
		return;
	}

	await turnLedOn();
	await wait(100);

	if (!force && state.buttonPressed) {
		return;
	}

	return turnLedOff();
}

/**
 * Returns a promise that resolves after the provided number of milliseconds.
 * @param ms {number} - The duration to wait, in milliseconds.
 * @returns {Promise}
 */
function wait(ms) {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
