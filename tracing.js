var EventPhase;
(function (EventPhase) {
	EventPhase["Start"] = "B";
	EventPhase["End"] = "E";
})(EventPhase || (EventPhase = {}));

class Tracing {
	constructor() {
		this.serializedEvents = "";
		this.events = [];
		this.isEnabled = false;
		this.ticksLeft = 0;
	}
	enableTracing(ticks) {
		this.events = [];
		this.isEnabled = true;
		this.ticksLeft = ticks;
		this.serializedEvents = '';
	}
	traceCall(name, fn, argsFn) {
		if (this.isEnabled) {
			const start = {
				name,
				ph: EventPhase.Start,
				ts: Game.cpu.getUsed(),
			};
			fn();
			this.events.push(start, {
				name,
				ph: EventPhase.End,
				ts: Game.cpu.getUsed(),
				args: argsFn ? argsFn() : undefined,
			});
		}
		else {
			fn();
		}
	}
	startCall(name) {
		if (this.isEnabled) {
			const start = {
				name,
				ph: EventPhase.Start,
				ts: Game.cpu.getUsed()
			};
			return {
				endCall: () => {
					this.events.push(start, {
						name,
						ph: EventPhase.End,
						ts: Game.cpu.getUsed()
					});
				}
			};
		}
		else {
			return {
				endCall: () => { },
			};
		}
	}
	downloadTrace() {
		const code = 'Download trace hook x3Cscript>' +
			`(() => {` +
			`angular.element("section.console").scope().Console.clear();` +
			`var filename = 'trace.json';` +
			`var text = JSON.stringify({ traceEvents: [${this.serializedEvents}], displayTimeUnit: 'ms'});` +
			`const element = document.createElement('input');` +
			`element.nwsaveas = 'trace.json';` +
			`element.type='file';` +
			`document.body.appendChild(element);` +
			`element.click();` +
			`document.body.removeChild(element);` +
			`element.addEventListener('change', () => {` +
			`	const fs = nw.require('fs');` +
			`	fs.writeFileSync(element.value, text);` +
			`});` +
			`})();` +
			`x3C/script>`;
		console.log(code.replace("\n", ""));
	}
	serializeEvents() {
		for (let event of this.events) {
			event.ts *= 1000
			event.pid = 0
			event.tid = Game.time
		}

		const serial = JSON.stringify(this.events);
		this.events = [];
		if (this.serializedEvents.length > 0) {
			this.serializedEvents += ',';
		}
		this.serializedEvents += serial.substring(1, serial.length - 1);
	}
	postTick() {
		if (this.isEnabled) {
			this.ticksLeft--;
			this.serializeEvents();
			if (this.ticksLeft <= 0) {
				this.isEnabled = false;
				this.downloadTrace();
				this.events = [];
				this.serializedEvents = '';
			}
			else {
				console.log(`Tracing ${this.ticksLeft}...`);
			}
		}
	}
}


module.exports = Tracing