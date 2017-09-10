'use strict';

// Any dependencies, notably the event emitter utility
const util = require('util');
const EventEmitter = require('events').EventEmitter;

// Constructor function to instantiate the hardware object
function Button(hardware, callback) {
	const self = this;

	// Set hardware connection of the object
	self.hardware = hardware;

	// Object properties
	self.delay = 100;
	self.pressed = false;

	// Begin listening for events
	self.hardware.on('fall', () => {
		self._press();
	});

	self.hardware.on('rise', () => {
		self._release();
	});

	// Make sure the events get emitted, even if late
	setInterval(() => {
		self.hardware.read((err, value) => {
			/* eslint-disable eqeqeq */
			if (err && err != 0 && err != 1) {
				console.log(err);
			} else if (err == 0 || value == 0) {
				self._press();
			} else {
				self._release();
			}
			/* eslint-enable eqeqeq */
		});
	}, self.delay);

	// Emit the ready event when everything is set up
	setImmediate(() => {
		self.emit('ready');
	});
	// Call the callback with object
	if (callback) {
		callback(null, self);
	}
}

// Inherit event emission
util.inherits(Button, EventEmitter);

Button.prototype._press = function () {
	const self = this;
	if (!self.pressed) {
		self.emit('press');
		self.pressed = true;
	}
};

Button.prototype._release = function () {
	const self = this;
	if (self.pressed) {
		self.emit('release');
		self.pressed = false;
	}
};

// Use function which calls the constructor
function use(hardware, callback) {
	return new Button(hardware, callback);
}

// Export functions
exports.Button = Button;
exports.use = use;