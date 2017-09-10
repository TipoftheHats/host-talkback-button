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

let hostMicOn = false;
let hostTalkbackOn = false;
let ledOn = true;
let writingToLED = false;

const aButton = buttonLib.use(tessel.port.A.pin[2]);
const ledPin = tessel.port.B.pin[0];
const udpPort = new osc.UDPPort({
	localAddress: '0.0.0.0',
	localPort: LOCAL_PORT,
	remoteAddress: '192.168.1.209',
	remotePort: X32_UDP_PORT,
	metadata: true
});

// Start with the LED off.
writingToLED = true;
ledPin.write(0, (error) => {
	writingToLED = false;
	if (error) {
		console.error('Error turning LED off at start:', error);
	} else {
		ledOn = false;
	}
});

aButton.on('ready', () => {
	aButton.on('press', () => {
		udpPort.send({
			address: `/ch/${HOST_MIC_CH}/mix/on`,
			args: [{type: 'i', value: 0}]
		});
		udpPort.send({
			address: `/auxin/${HOST_TALKBACK_AUXIN_CH}/mix/on`,
			args: [{type: 'i', value: 1}]
		});
	});

	aButton.on('release', () => {
		udpPort.send({
			address: `/ch/${HOST_MIC_CH}/mix/on`,
			args: [{type: 'i', value: 1}]
		});
		udpPort.send({
			address: `/auxin/${HOST_TALKBACK_AUXIN_CH}/mix/on`,
			args: [{type: 'i', value: 0}]
		});
	});
});

udpPort.on('message', oscBundle => {
	if (oscBundle.address === `/ch/${HOST_MIC_CH}/mix/on`) {
		hostMicOn = Boolean(oscBundle.args[0].value);
	} else if (oscBundle.address === `/auxin/${HOST_TALKBACK_AUXIN_CH}/mix/on`) {
		hostTalkbackOn = Boolean(oscBundle.args[0].value);
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

// Open the socket.
udpPort.open();

function checkLED() {
	if (writingToLED) {
		return;
	}

	if (!hostMicOn && hostTalkbackOn) {
		if (!ledOn) {
			writingToLED = true;
			ledPin.write(1, (error) => {
				writingToLED = false;
				if (error) {
					console.error('Error turning LED on:', error);
				} else {
					ledOn = true;
				}
			});
		}
	} else if (ledOn) {
		writingToLED = true;
		ledPin.write(0, (error) => {
			writingToLED = false;
			if (error) {
				console.error('Error turning LED off:', error);
			} else {
				ledOn = false;
			}
		});
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
