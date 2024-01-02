"use strict";


var interShardMemoryManager = {
	getMem(shardName) {
		global.inTickObject.intershardMemory = global.inTickObject.intershardMemory || {};

		if (!global.inTickObject.intershardMemory[shardName]) {
			if (Game.shard.name == shardName) {
				global.inTickObject.intershardMemory[shardName] = JSON.parse(InterShardMemory.getLocal()) || {}
			}
			else {
				global.inTickObject.intershardMemory[shardName] = JSON.parse(InterShardMemory.getRemote(shardName))	|| {}
			}
		}
		return global.inTickObject.intershardMemory[shardName]
	},

	// Doesn't bother to check if it exists
	lazyGetMem(shardName) {
		global.inTickObject.intershardMemory = global.inTickObject.intershardMemory || {};
		return global.inTickObject.intershardMemory[shardName]
	},

	touchLocal() {
		global.inTickObject.updateLocalIntershard = 1;		
	},
};

module.exports = interShardMemoryManager;