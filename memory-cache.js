module.exports = function wrapLoop(fn, safe = true) {
	let memory;
	let tick;

	return () => {
		if (Game.cpu.limit === 0) return;

		let tickStart = Game.cpu.getUsed()
		if(tickStart > Game.cpu.limit) {
			console.log("CPU Monster ate the tick", tickStart)
		}

		let start;
		let end;
		start = Game.cpu.getUsed()

		if (tick && tick + 1 === Game.time && memory) {
			delete global.Memory;
			Memory = memory;
			Memory.ticksSinceThisSignWasLastReset = Memory.ticksSinceThisSignWasLastReset + 1;
		}
		else {
			if (Game.cpu.getHeapStatistics) console.log("Global reset", tick, Game.time, Memory.ticksSinceThisSignWasLastReset, Game.cpu.getUsed())
			Memory.ticksSinceThisSignWasLastReset = 0;
			memory = Memory;
		}

		end = Game.cpu.getUsed()

		if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 10 == 0 && (tickStart) > 1)) {
			console.log("Profile startup: " + (tickStart) + " (" + Game.cpu.bucket + ") ");
		}

		const alpha = Math.exp(-(1/1000.));
		Memory.parseTime = alpha * Memory.parseTime + (1 - alpha) * (end - start);

		if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 10 == 0 && (end - start) > 1)) {
			console.log("Profile memParse: " + (end - start) + " (" + Game.cpu.bucket + ") ");
		}

		tick = Game.time;

		// Dump the tick
		if (Game.cpu.bucket < 500) {
			console.log("Skipping tick due to not enough bucket", Game.time)
			return;
		}
		else {
			try {
				fn();
			}
			catch(e) {
				console.log("Error in tick");
				console.log(e.stack);
			}
		}


		// there are two ways of saving Memory with different advantages and disadvantages
		// 1. RawMemory.set(JSON.stringify(Memory));
		// + ability to use custom serialization method
		// - you have to pay for serialization
		// - unable to edit Memory via Memory watcher or console
		// 2. RawMemory._parsed = Memory;
		// - undocumented functionality, could get removed at any time
		// + the server will take care of serialization, it doesn't cost any CPU on your site
		// + maintain full functionality including Memory watcher and console
		try {
			let freq = Math.min(19, Math.floor(Memory.ticksSinceThisSignWasLastReset / 50));
			if (Game.time % (1 + freq) == 0 || Memory.forceSaveMemory || global.forceSaveMemory || Game.cpu.bucket == 10000 || Memory.ticksSinceThisSignWasLastReset < 50) {
				if (safe) {
					RawMemory.set(JSON.stringify(Memory));
				} else {
					RawMemory._parsed = Memory;
				}
				global.stringifyError = 0;
				delete global.forceSaveMemory
			}
		}
		catch(e) {
			console.log("Error in memory stringify");
			console.log(e.stack);
			global.stringifyError = (global.stringifyError || 0) + 1
		}

		Memory.stats.cpu = Game.cpu.getUsed();

		const alpha2 = Math.exp(-(1/(1000.)))
		Memory.stats.avgCPU = alpha2 * (Memory.stats.avgCPU || 0) + (1 - alpha2) * (Game.cpu.getUsed())

		const alpha3 = Math.exp(-(1/(100.)))
		Memory.stats.avgCPUFast = alpha3 * (Memory.stats.avgCPUFast || 0) + (1 - alpha3) * (Game.cpu.getUsed())

	};
}