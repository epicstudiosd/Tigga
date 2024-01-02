"use strict";

// test

const constants = require('constants');
const wrapLoop = require('./memory-cache');



global.Memory.creeps = global.Memory.creeps || {}
global.Memory.rooms = global.Memory.rooms || {}


console.warn = console.log;
global.wasm_loader = require('wasm_loader')
global.wasm_module = wasm_loader('loop_mod', 'loop');

global.benchmarkFunc = function(func, iters) {
	iters = iters || 1
	let a = Game.cpu.getUsed();

	for (let i = 0; i < iters; i++) {
		func();
	}
	console.log(Game.cpu.getUsed() - a)
}


global.INTENT_CPU_COST = 0.22



require('proto.OwnedStructure')();
require('proto.powerCreep')();
require('proto.miscStructures')();

var creepAI = require('creepAI');
var powerCreepAI = require('powerCreepAI');
var overseerAI = require('overseerAI');
var roomAI = require('roomAI');
var roomIntel = require('roomIntel');
var scouting = require('scouting');
var roomDesignAI = require('roomDesignAI');
var roomDefenseAI = require('roomDefenseAI');
var combatManager = require('combatManager');
var powerRangerAI = require('powerRangerAI');
var marketTrader = require('marketTrader');
var pathCache = require('pathCache');
var util = require('util');
var safeRoute = require('safeRoute');
var segments = require('segments');
const mapVisuals = require('mapVisuals');
const roomCombatAnalysis = require("roomCombatAnalysis")

const moveResolver = require('moveResolver');
const simpleAllies = require('simpleAllies');

const commoditiesManager = require('commoditiesManager');
const interShardMemoryManager = require('interShardMemoryManager');



require('proto.spawn')();
require('proto.room')();
require('proto.roomPosition')();



String.prototype.zeroPad = function (len) {
	str = str + '';
	ch = "0"
	len = len - this.length;
	if (len <= 0) return this;
	var pad = '';
	while (true) {
	if (len & 1) pad += ch;
	len >>= 1;
	if (len) ch += ch;
	else break;
	}
	return pad + this;
}

const Tracing = require("tracing")
const profile = require("profile")
global.trace = (ticks) => {
		global.Tracing.enableTracing(ticks);
		console.log(`Enabled tracing for ${ticks} ticks`);
};
global.Tracing = new Tracing();
// profile.wrapEngine();


// const profiler = require('screeps-profiler');
const profilerEnabled = 0

// profiler.enable();


global.incompletePaths = {}

module.exports.loop = wrapLoop(function() {














	// profiler.wrap(function() {
		if (Memory.disableCarryBoost === undefined) {
			Memory.disableCarryBoost = 1
		}
		// Disable decorations
	// console.log(`x3Cscript>angular.element(document.querySelector('.room')).scope().Room.decorations = []x3C/script>`);
	if (Memory.privateServer === undefined) {
		if (["shard0", "shard1", "shard2", "shard3"].includes(Game.shard.name)) {
			Memory.botArena = 0
			Memory.privateServer = 0;
			Memory.actuallyBotArena = 0;
		}
		else {
			// Memory.season1 = 1
			// Memory.scoreContainerRooms = []

			Memory.botArena = 1;
			Memory.timedRound = 1;
			Memory.privateServer = 1;

			Memory.startWallTime = Date.now();
		}
		if (Game.shard.name == "swc") {
			Memory.swc = 1
			Memory.actuallyBotArena = 0;
		}
	}

	if (Memory.economyArena) {
		global.targetMinerals = [
			RESOURCE_HYDROGEN,
			RESOURCE_OXYGEN,
			RESOURCE_UTRIUM,
			RESOURCE_KEANIUM,
			RESOURCE_LEMERGIUM,
			RESOURCE_ZYNTHIUM,
			RESOURCE_CATALYST,

			RESOURCE_HYDROXIDE,

			RESOURCE_GHODIUM,
			RESOURCE_ZYNTHIUM_KEANITE,
			RESOURCE_UTRIUM_LEMERGITE,

			RESOURCE_GHODIUM_HYDRIDE, // Upgrade.
		];
	}

	if (Memory.swc == 1) {
		global.whiteList = [];
	}
	else if (Memory.season2) {
		global.whiteList = ["Cub"]
	}
	else {
		global.whiteList = []
	}

	if (Memory.season2) {
		require("season2Map").init(require("safeRoute"))
	}

		

	if (Memory.privateServer) {
		global.activeShards = [Game.shard.name]
		global.roomLimit = Game.gcl.level
	}
	else {
		global.activeShards = ["shard1", "shard2", "shard3"]

		let isActiveShard1 = Memory.attemptShard1StartTick || Memory.hasRoomOnShard1

		if (isActiveShard1) {
			if (Game.cpu.shardLimits["shard1"] != 20 || Game.cpu.shardLimits["shard2"] != 280 || Game.cpu.shardLimits["shard3"] != 0) {
				Game.cpu.setShardLimits({shard1: 20, shard2: 280, shard3: 0})
			}
		}
		else {			
			if (Game.cpu.shardLimits["shard1"] != 2 || Game.cpu.shardLimits["shard2"] != 298 || Game.cpu.shardLimits["shard3"] != 0) {
				Game.cpu.setShardLimits({shard1: 2, shard2: 298, shard3: 0})
			}
		}

		if (Math.random() < 1 / 1e6 && !Memory.attemptShard1StartTick) {
			Memory.attemptShard1Claim = true
		}


		// global.activeShards = ["shard1", "shard2", "shard3"]
		if (Game.shard.name == "shard2") {
			global.roomLimit = Game.gcl.level - /*Math.floor(Game.gcl.level * 2 / 30.) -*/ (isActiveShard1 ? Math.floor(Game.gcl.level * 2 / 30.) : 0)
		}
		else if (Game.shard.name == "shard3") {
			global.roomLimit = 0//Math.floor(Game.gcl.level * 2 / 30.)
		}
		else if (Game.shard.name == "shard1") {
			global.roomLimit = isActiveShard1 ? Math.floor(Game.gcl.level * 2 / 30.) : 0
		}
	}

		global.inTickObject = {}
		global.inTickObject.energyExpenditures = {}
		
		global.anyNukes = 0;
		global.anySmallHaulers = 0

		Memory.saleLevel = Memory.saleLevel || 0;
		Memory.stats = Memory.stats || {}
		Memory.stats.tick = Game.time
		Memory.stats.globalResources = Memory.stats.globalResources || {}
		Memory.stats.spawnCosts = Memory.stats.spawnCosts || {}
		Memory.stats.missionCosts = Memory.stats.missionCosts || {}
		Memory.stats.factoryStats = Memory.stats.factoryStats || {}
		Memory.stats.processingPower = Memory.stats.processingPower || {}

	Memory.stats.globalHarassTracking = Memory.stats.globalHarassTracking || {}

		global.lastProcessingPower = global.processingPower || 0;
		global.processingPower = 0;
		global.creepData = global.creepData || {};

	global._creepBMCP_U = global._creepBMCP_U || {}
	global._creepBMCP_M = global._creepBMCP_M || {}
	global._creepStoreUsedCapacity = global._creepStoreUsedCapacity || {}
	global._creepStoreUsedCapacityInvalid = {}

		global.allowPortals = 1;

		if (Memory.season2) {
			Memory.stats.symbols = _.clone(Game.symbols)
		}

	if (!Memory.privateServer && !Memory.botArena && !Memory.screepsPlus) {
		global.creditLimit = Game.market.credits - 2.5e6;
	}
	else {
		global.creditLimit = Game.market.credits;
	}


	let heapStats = Game.cpu.getHeapStatistics ? Game.cpu.getHeapStatistics() : {};
	let heapUsed = heapStats.total_heap_size + heapStats.externally_allocated_size;

	let start
	let end

	// if (true || Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
	// 	console.log("Profile memParse: " + (end - start) + " (" + Game.cpu.bucket + ")")
	// }


	if (Memory.profiler && !profilerEnabled) {
		delete Memory.profiler
	}

	// parseBench.runBench()



	start = Game.cpu.getUsed()

	// For pathfinding.
	Memory.requestedSegments = Memory.requestedSegments || [0, 1, 2, 3, 4, 5, 6, 7, 8];

	// We can get stuck in a situation where someone requested a segment and never
	// consumed that request. This clears that state.
	if (Math.random() < 0.01) {
		Memory.requestedSegments = [0, 1, 2, 3, 4, 5, 6, 7, 8]
	}



	Memory.tick = (Memory.tick + 1) || 0;

	Memory.stats.profiler = {};
	Memory.stats.intentCounts = {}


	Memory.stats.rolePathCalls = Memory.stats.rolePathCalls || {};
	Memory.stats.rolePathHits = Memory.stats.rolePathHits || {};
	Memory.stats.rolePathCPUs = Memory.stats.rolePathCPUs || {};
	//

	Game.harvestedThisTick = 0;
	Game.haulerTransferredEnergy = 0;
	Game.damagedRooms = 0;

	// if (Game.map.visual) {		
	// 	try {		
	// 		mapVisuals.startTick();
	// 	}
	// 	catch(e) {
	// 		console.log("Error in mapVisuals");
	// 		console.log(e.stack);
	// 	}
	// }

	end = Game.cpu.getUsed()

	Memory.stats.profiler["setup"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile setup: " + (end - start) + " (" + Game.cpu.bucket + ")");
	}




	// This needs to be early. The important bit is setting creep.mem = Memory.creeps[creep.name];
	start = Game.cpu.getUsed()
	moveResolver.init();
	try {		
		for(var name in Game.creeps) {
			var creep = Game.creeps[name];
			creep.initTick()
		}

		for(var name in Game.powerCreeps) {
			let powerCreep = Game.powerCreeps[name];
			if (powerCreep && powerCreep.pos) powerCreep.initTick()
		}
	}
	catch(e) {
		console.log("Error in creep init");
		console.log(e.stack);
	}
	end = Game.cpu.getUsed()

	Memory.stats.profiler["creepInit"] = (end - start)



	try {
		if ((Game.shard.name == "swc" && global.whiteList.length) || Memory.season2) {
			simpleAllies.startOfTick();
		}
	}
	catch(e) {
		console.log(e.stack);
		console.log("Error in ally stuff sot");
	}


	// ------------------------------------------------------------- ROOMS
	start = Game.cpu.getUsed()


	try {
		// Which rooms are actually mine?
		Game.myRooms = Game.myRooms || [];
		global.roomData = global.roomData || {}
		for (var roomName in Game.rooms) {
			var room = Game.rooms[roomName];

			if (room.controller && room.controller.my && !room.memory.clearRoomClaim) {
				Game.myRooms.push(room);
				global.roomData[room.name] = global.roomData[room.name] || {}
			}
		}

		if (Game.myRooms.length) {
			global.zoneType = Game.map.getRoomStatus(Game.myRooms[0].name).status
		}
		else {
			global.zoneType = "normal"
		}

		Memory.stats.profiler["room_findMyRooms"] = (Game.cpu.getUsed() - start)

		let a = Game.cpu.getUsed()

		for (var roomName in Game.rooms) {
			var room = Game.rooms[roomName]
			room.initForTick()
		}

		Memory.stats.profiler["room_initForTick_stage1"] = (Game.cpu.getUsed() - a)

		let b = Game.cpu.getUsed()

		if (Math.random() < 0.001) {
			for (var roomName in Game.rooms) {
				var room = Game.rooms[roomName]
				room.initForTick_stage1()
			}
		}
		else {			
			for (var room of Game.myRooms) {
				room.initForTick_stage1()
			}
		}

		Memory.stats.profiler["room_initForTick_stage1_5"] = (Game.cpu.getUsed() - b)

		let c = Game.cpu.getUsed()

		roomAI.updateRoomMemoryStartTick();

		Memory.stats.profiler["updateRoomMemoryStartTick"] = (Game.cpu.getUsed() - c)

		let startScouting = Game.cpu.getUsed()
		scouting.updateScouting();
		Memory.stats.profiler["scouting"] = (Game.cpu.getUsed() - startScouting)

		let d = Game.cpu.getUsed()

		for (var room of Game.myRooms) {
			room.initForTick_stage2()
		}

		Memory.stats.profiler["room_initForTick_stage2"] = (Game.cpu.getUsed() - d)

		if (Memory.stats.profiling) {
			console.log(start, a, b, startScouting, d)
		}

		let e = Game.cpu.getUsed()
		global.roomCombatIntents = 0
		for (var roomName in Game.rooms) {
			var room = Game.rooms[roomName];

			if (room.dangerous) {
				room.runRoomCombat();
			}
		}


		if (Math.random() < 0.01) console.log("Room combat", global.roomCombatIntents, (Game.cpu.getUsed() - e), (Game.cpu.getUsed() - e) / global.roomCombatIntents)

		Memory.stats.profiler["roomRunCombat"] = (Game.cpu.getUsed() - e)
		Memory.stats.profiler["roomRunCombatNonIntents"] = (Game.cpu.getUsed() - e - global.roomCombatIntents * 0.2)

		let e2 = Game.cpu.getUsed()
		if (Memory.season1) {
			for (var roomName in Game.rooms) {
				Game.rooms[roomName].season1Tick()
			}
		}
		if (Memory.season2) {
			for (var roomName in Game.rooms) {
				Game.rooms[roomName].season2Tick()
			}
		}
		Memory.stats.profiler["seasonTick"] = (Game.cpu.getUsed() - e2)

		let f = Game.cpu.getUsed()

		// This isn't super urgent
		if (Game.cpu.bucket > 2000) {		
			for (var roomName in Game.rooms) {
				var room = Game.rooms[roomName];

				if (room.dangerous == 2) {
					roomCombatAnalysis.analyse(room)
				}
			}
		}
		Memory.stats.profiler["roomCombatAnalysis"] = (Game.cpu.getUsed() - f)
	}
	catch(e) {
		console.log("Error in start tick room update");
		console.log(e.stack);
	}


	end = Game.cpu.getUsed()

	Memory.stats.profiler["rooms"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("room_findMyRooms: " + Memory.stats.profiler["room_findMyRooms"] + " (" + Game.cpu.bucket + ")")
		console.log("room_initForTick_stage1: " + Memory.stats.profiler["room_initForTick_stage1"] + " (" + Game.cpu.bucket + ")")
		console.log("room_initForTick_stage2: " + Memory.stats.profiler["room_initForTick_stage2"] + " (" + Game.cpu.bucket + ")")
		console.log("updateRoomMemoryStartTick: " + Memory.stats.profiler["updateRoomMemoryStartTick"] + " (" + Game.cpu.bucket + ")")
		console.log("scouting: " + Memory.stats.profiler["scouting"] + " (" + Game.cpu.bucket + ")")
		console.log("room_initForTick_stage3: " + Memory.stats.profiler["room_initForTick_stage3"] + " (" + Game.cpu.bucket + ")")

		console.log("Profile rooms init: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}

	start = Game.cpu.getUsed()

	try {
		overseerAI.tickStart();
	}
	catch(e) {
		console.log("Error in overseer tickStart");
		console.log(e.stack);
	}
	end = Game.cpu.getUsed()
	Memory.stats.profiler["overseerStart"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile overseer tickStart: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}


	start = Game.cpu.getUsed()

	// This to purge things that have had a role change
	try {
		global.creepData = global.creepData || {}

		let purgeAliveList = Game.time % 41 == 0 || global.stringifyError
		for(var room of Game.myRooms) {
			if (purgeAliveList || !room.mem.ownedCreeps) {
				room.mem.ownedCreeps = {}
			}
		}
		for(var creepName in Memory.creeps) {
			if (!Memory.creeps[creepName]) continue
			// console.log(creepName, Memory.creeps[creepName])

			// Sometimes I get errors here saying it can't read sR of undefined.
			// Not quite sure how that's possible
			var room = Game.rooms[Memory.creeps[creepName].sR]
			let mem = Memory.rooms[Memory.creeps[creepName].sR]

			if (room && mem.ownedCreeps) {
				if (purgeAliveList || !mem.ownedCreeps[Memory.creeps[creepName].role]) {
					mem.ownedCreeps[Memory.creeps[creepName].role] = []
				}
			}
		}

		for(var creepName in Memory.creeps) {
			if (!Memory.creeps[creepName]) continue
			var room = Game.rooms[Memory.creeps[creepName].sR]

			if (Game.creeps[creepName]) {
				if (room) {
					let mem = Memory.rooms[Memory.creeps[creepName].sR]

					if (mem.ownedCreeps && !mem.ownedCreeps[Memory.creeps[creepName].role].includes(creepName)) {
						mem.ownedCreeps[Memory.creeps[creepName].role].push(creepName)
					}
				}
			}
			else {
				// Dead
				if (room && room.mem.ownedCreeps && room.mem.ownedCreeps[Memory.creeps[creepName].role] && room.mem.ownedCreeps[Memory.creeps[creepName].role].indexOf(creepName) != -1) {
					room.mem.ownedCreeps[Memory.creeps[creepName].role].splice(room.mem.ownedCreeps[Memory.creeps[creepName].role].indexOf(creepName), 1);
				}
				if (Memory.creeps[creepName].role == "scout" && Memory.creeps[creepName].scoutMode == 1 && Memory.creeps[creepName].targetRoom) {
					Memory.scoutRooms.push(Memory.creeps[creepName].targetRoom);
				}

				if (global.creepData[creepName] && global.creepData[creepName].roomName) {
					let roomName = global.creepData[creepName].roomName

					if (Memory.rooms[roomName]) {
						let roomMemory = Memory.rooms[roomName]

						// global.creepData[creepName] = global.creepData[creepName] || {}

						let cost = Memory.creeps[creepName].bC * (global.creepData[creepName].ttl || 1500) / 1500
						let roomDiedIn = Game.rooms[global.creepData[creepName].roomName]
						if (roomDiedIn) {
							roomDiedIn.friendlyLosses = (roomDiedIn.friendlyLosses || 0) + cost;
						}
						let lastPos = Memory.creeps[creepName].lP;

						if (lastPos) {
							if (lastPos.x == 0) {
								roomMemory.exitCampedL = (roomMemory.exitCampedL || 0) + cost;
								if (roomMemory.exitCampedLPos) roomMemory.exitCampedLPos = Math.round((roomMemory.exitCampedLPos + lastPos.y) / 2);
								else 							 roomMemory.exitCampedLPos = lastPos.y;
							}
							else if (lastPos.x == 49) {
								roomMemory.exitCampedR = (roomMemory.exitCampedR || 0) + cost;
								if (roomMemory.exitCampedRPos) roomMemory.exitCampedRPos = Math.round((roomMemory.exitCampedRPos + lastPos.y) / 2);
								else 							 roomMemory.exitCampedRPos = lastPos.y;
							}
							else if (lastPos.y == 0) {
								roomMemory.exitCampedT = (roomMemory.exitCampedT || 0) + cost;
								if (roomMemory.exitCampedTPos) roomMemory.exitCampedTPos = Math.round((roomMemory.exitCampedTPos + lastPos.x) / 2);
								else 							 roomMemory.exitCampedTPos = lastPos.x;
							}
							else if (lastPos.y == 49) {
								roomMemory.exitCampedB = (roomMemory.exitCampedB || 0) + cost;
								if (roomMemory.exitCampedBPos) roomMemory.exitCampedBPos = Math.round((roomMemory.exitCampedBPos + lastPos.x) / 2);
								else 							 roomMemory.exitCampedBPos = lastPos.x;
							}
						}
					}

				}
				delete Memory.creeps[creepName];
				delete global.creepData[creepName];
			}
		}
	}
	catch(e) {
		console.log("Error in start tick purge");
		console.log(e.stack);
	}

	end = Game.cpu.getUsed()

	Memory.stats.profiler["purge"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile creep purge: " + (end - start) + " (" + Game.cpu.bucket + ")");
	}



	start = Game.cpu.getUsed()

	// This is before creeps
	if (start > 100) {
		console.log("Skipping room updates tick due to 100 CPU used already")
	}
	else {
		let room
		try {
			for (var roomName in Game.rooms) {
				room = Game.rooms[roomName]
				roomDesignAI.designRoom(roomName)
			}
			end = Game.cpu.getUsed()
			Memory.stats.profiler["design"] = (end - start)
			if (Memory.profiling) {
				console.log("Profile design: "	+ (end - start) + " (" + Game.cpu.bucket + ")")
			}
			start = Game.cpu.getUsed()

			Memory.stats.profiler["updateDesignRoads"] = 0
			Memory.stats.profiler["updateDesignSpecial"] = 0
			Memory.stats.profiler["updateDesignBuildings"] = 0

			for (room of _.shuffle(Game.myRooms)) {
				roomDesignAI.updateDesignAndBuild(room.name)
			}
			end = Game.cpu.getUsed()
			Memory.stats.profiler["updateDesign"] = (end - start)
			if (Memory.profiling) {
				console.log("Profile update design: " + (end - start) + " (" + Game.cpu.bucket + ")")
			}

			roomDesignAI.cleanupConstructionSites()
			// roomDesignAI.cleanupFlags()
			// Only my rooms tick.

			start = Game.cpu.getUsed()
			global.currentlyUnclaimingRoom = undefined
			for (room of Game.myRooms) {
				room.tick();
			}
			end = Game.cpu.getUsed()
			Memory.stats.profiler["roomTick"] = (end - start)

			start = Game.cpu.getUsed()
			for (room of Game.myRooms) {
				room.manageLinks();
			}
			end = Game.cpu.getUsed()
			Memory.stats.profiler["roomLinks"] = (end - start)

			start = Game.cpu.getUsed()
			for (room of Game.myRooms) {
				room.managePowerProcessing();
				if (!room.processedPower) {
					Memory.stats.processingPower[room.name] = (Memory.stats.processingPower[room.name] || 0) * 0.99
				}
			}
			end = Game.cpu.getUsed()
			Memory.stats.profiler["roomPower"] = (end - start)

			start = Game.cpu.getUsed()
			for (room of Game.myRooms) {
				room.manageLabs();
			}
			end = Game.cpu.getUsed()
			Memory.stats.profiler["roomLabs"] = (end - start)

			start = Game.cpu.getUsed()
			for (room of Game.myRooms) {
				room.manageObserver();
			}
			end = Game.cpu.getUsed()
			Memory.stats.profiler["roomObserver"] = (end - start)

			start = Game.cpu.getUsed()
			for (let i = 0; i < 6; i++) {
				Memory.stats.factoryStats[i] = constants.FACTORY_STATS_ALPHA * (Memory.stats.factoryStats[i] || 0)
			}
			// if (!Memory.swc) {
				for (room of Game.myRooms) {
					room.manageFactory();
				}			
			// }
			end = Game.cpu.getUsed()
			Memory.stats.profiler["roomFactory"] = (end - start)
		}
		catch(e) {
			console.log(e.stack);
			console.log("Error in room update", room);

		}
	}


	start = Game.cpu.getUsed()
	if (!Memory.powerRangers) Memory.powerRangers = []

	var finishedPowerRangers = []

	try {
		for(var powerRangerIdx in Memory.powerRangers) {
			if (Memory.powerRangers[powerRangerIdx] != null) {
				var res = powerRangerAI.run(Memory.powerRangers[powerRangerIdx]);
				if (res < 0) {
					var spawn = Game.spawns[Memory.powerRangers[powerRangerIdx].spawn];
					if (spawn) {
						spawn.clearPowerRangerPrioritySpawns(powerRangerIdx)
					}
					delete Memory.powerRangers[powerRangerIdx];
				}
			}
		}
	}
	catch(e) {
		console.log("Error in power rangers");
		console.log(e.stack);
	}
	var activePowerRangers = 0;

	for(var powerRangerIdx in Memory.powerRangers) {
		if (Memory.powerRangers[powerRangerIdx] != null) {
			activePowerRangers++;
		}
	}

	if (activePowerRangers == 0) {
		Memory.powerRangers = []
	}


	end = Game.cpu.getUsed()
	Memory.stats.profiler["powerRangers"] = (end - start)
	if ((Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1))) {
		console.log("Profile powerRangers: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}

	// Want this to run to make sure I don't accidently buy when exploitng abitrage
	/*start = Game.cpu.getUsed()
	marketTrader.exploit()

	end = Game.cpu.getUsed()
	if ((Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1))) {
		console.log("Profile market exploit: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}*/

	// -------------------------- SPAWNS

	start = Game.cpu.getUsed()
	// If we're really low on bucket start cutting. I don't think we lose too much by doing this
	// just a few spawn opportunities. Also doesn't save a huge amount of CPU.
	let spawnsByRoom = {}
	for (var spawnName in Game.spawns) {
		let spawn = Game.spawns[spawnName];
		if (spawn.isActive()) {
			spawnsByRoom[spawn.room.name] = spawnsByRoom[spawn.room.name] || []
			spawnsByRoom[spawn.room.name].push(spawn)
		}
	}
	for (var sRName in spawnsByRoom) {
		Game.rooms[sRName].noUsefulSpawns = false;
		Game.rooms[sRName].availableForRemoteSpawn = 0;
		Game.rooms[sRName].spawnCount = spawnsByRoom[sRName].length;
		Game.rooms[sRName].spawnOrder = spawnsByRoom[sRName];
	}

	if (Game.cpu.bucket > 9000 || Game.time % 3 == 0 || global.anySmallHaulers) {	
		for (var sRName in spawnsByRoom) {
			for (var spawn of spawnsByRoom[sRName]) {
				try {
					spawn.spawnPass1(spawnsByRoom[sRName], spawnsByRoom[sRName][spawnsByRoom[sRName].length - 1] == spawn);
				}
				catch(e) {
					console.log("Error in spawnerPass1!", spawnName);
					console.log(e.stack);
				}
			}
		}

		end = Game.cpu.getUsed()
		Memory.stats.profiler["spawns"] = (end - start)
		start = Game.cpu.getUsed()

		for (var sRName in spawnsByRoom) {
			for (var spawn of spawnsByRoom[sRName]) {
				try {
					spawn.spawnPass2(spawnsByRoom[sRName]);
				}
				catch(e) {
					console.log("Error in spawnerPass2!", spawnName);
					console.log(e.stack);
				}
			}
		}

		end = Game.cpu.getUsed()
		Memory.stats.profiler["spawns2"] = (end - start)
		if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
			console.log("Profile spawns: " + (end - start) + " (" + Game.cpu.bucket + ")")
		}
	}
	else {
		end = Game.cpu.getUsed()
		Memory.stats.profiler["spawns"] = (end - start)
	}





	// ------------------------------------------------------------------------------ Room defense
	start = Game.cpu.getUsed()
	for (var room of Game.myRooms) {
		try {
			roomDefenseAI.localDefense(room)
		}
		catch(e) {
			console.log("Error in roomDefenseAI!", room.name);
			console.log(e.stack);
		}
	}


	end = Game.cpu.getUsed()
	Memory.stats.profiler["roomDefenseLocal"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile room defense local: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}


	start = Game.cpu.getUsed()
	for (var room of Game.myRooms) {
		try {
			roomDefenseAI.remoteDefense(room)
		}
		catch(e) {
			console.log("Error in roomDefenseAI!", room.name);
			console.log(e.stack);
		}
	}


	end = Game.cpu.getUsed()
	Memory.stats.profiler["roomDefenseRemote"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile room defense remote: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}


	// ------------------------------------------------------------------------------ Combat Manager
	Memory.stats.profiler["assaultPlan"] = 0;
	start = Game.cpu.getUsed()
	try {
		combatManager.tick();
	}
	catch(e) {
		console.log("Error in combatManager");
		Game.notify(e.stack)
		console.log(e.stack);
	}
	end = Game.cpu.getUsed()
	Memory.stats.profiler["combatManager"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile combatManager: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}

	// ----------------------------------------------------------------------------- Observers
	/*start = Game.cpu.getUsed()
	// Well this is ancient shit code isn't it. Seems to work...


	end = Game.cpu.getUsed()
	Memory.stats.profiler["observers"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		Memory.stats.profiler["observers"] = (end - start)
		console.log("Profile observers: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}*/

	// ----------------------------------------------------------------------------- Creeps
	start = Game.cpu.getUsed()
	// Path caching.
	if (Game.time % 499 == 0 || (Game.cpu.bucket > 9900 && Math.random() < 0.01)) {
		pathCache.purgePaths((Game.cpu.bucket > 9900 ? 4 : 1) * (Memory.botArena ? 2 : 1));
	}
	if (Game.time % 498 == 0 || (Game.cpu.bucket > 9900 && Math.random() < 0.01)) {
		pathCache.purgeCostMatrices((Game.cpu.bucket > 9900 ? 4 : 1) * (Memory.botArena ? 2 : 1));
	}

	try {
		powerCreepAI.tick();
	}	
	catch(e) {
		console.log("Error in powerCreeps");
		console.log(e.stack);
	}



	end = Game.cpu.getUsed()
	Memory.stats.profiler["PowerCreeps"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile power creeps: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}

	Memory.stats.creepCPUs = Memory.stats.creepCPUs || {};

	start = Game.cpu.getUsed()

	// This (probably) uses more CPU but is more efficient.
	if (Game.cpu.bucket > 8000) {
		for (let creepName in Game.creeps) {
			Game.creeps[creepName].move = Game.creeps[creepName].trackedMove
		}
	}
	// require("snakeAI").moveSnake(["d5340", "d5338"], new RoomPosition(30, 25, "E18S8"), {}, 0)
	creepAI.runCreeps();

	{		
		let t = Game.cpu.getUsed();
		if (global.inTickObject.anyNudges) {
			for(var name in Game.creeps) {
				var creep = Game.creeps[name];
				creep.processNudges()
			}
			for(var name in Game.powerCreeps) {
				let powerCreep = Game.powerCreeps[name];
				powerCreep.processNudges()
			}
		}
		Memory.stats.profiler["nudges"] = (Game.cpu.getUsed() - t)
	}

	{
		let t = Game.cpu.getUsed()
		pathCache.finalizeTick();
		Memory.stats.profiler["pathCache_finalize"] = (Game.cpu.getUsed() - t)

	}


	end = Game.cpu.getUsed()
	Memory.stats.profiler["creeps"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile creeps: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}


	// ----------------------------------------------------------------------------- Power Creeps



	start = Game.cpu.getUsed()

	// Energy balancing
	 if ((!Memory.marketExploit || Math.abs((Memory.marketExploit.tick || 0) - Game.time) > 20) && Game.time % 51 == 0) {
		let storageInfos = []

	 		for (var room of Game.myRooms) {
			if (room.terminal && room.storage && room.terminal.my && room.terminal.isActive() && room.effectiveLevel >= 6) {
				var energyStoreAmount = room.storage.store[RESOURCE_ENERGY] + room.terminal.store[RESOURCE_ENERGY] + (room.factory ? (room.storage.store[RESOURCE_BATTERY] + room.terminal.store[RESOURCE_BATTERY]) * 10 : 0)
				var totalStoreAmount = room.storage.store.getUsedCapacity()

				// Batteries can screw things up
				energyStoreAmount = Math.min(energyStoreAmount, (room.storage.store[RESOURCE_ENERGY] + room.terminal.store[RESOURCE_ENERGY]) * 30)

				var effectiveStorageAmount;
				if (totalStoreAmount > STORAGE_CAPACITY * .5) {
					if (energyStoreAmount > 500000) {
						effectiveStorageAmount = energyStoreAmount + (totalStoreAmount - energyStoreAmount) / 2.
					}
					else if (energyStoreAmount > 100000) {
						effectiveStorageAmount = energyStoreAmount + (totalStoreAmount - energyStoreAmount) / 4.
					}
					else {
						effectiveStorageAmount = energyStoreAmount + (totalStoreAmount - energyStoreAmount) / 8.
					}					
				}
				else {
					effectiveStorageAmount = energyStoreAmount
				}

				if (totalStoreAmount > STORAGE_CAPACITY * .95) {
					effectiveStorageAmount *= 2;
				}

				effectiveStorageAmount *= 1 - 0.1 * ((5 - room.defcon) / 5);
				effectiveStorageAmount *= 1 - 0.05 * (room.memory.nukeCount || 0)

				if (room.restrictUpgraders) {
					effectiveStorageAmount *= 1.25;
				}
				if (room.upgradeFocus) {
					effectiveStorageAmount *= 0.75;
				}

				// if (room.effectiveLevel == 8) {
				// 	effectiveStorageAmount *= 1.25;
				// }
				// else if (!room.restrictUpgraders)
				// 	effectiveStorageAmount *= 0.75;
				// }

				storageInfos.push({roomName: room.name, effectiveStorageAmount, totalStoreAmount, energyStoreAmount})
			}
		}

		let sentRooms = [];

		for (let pass_ = 0; pass_ < 2; pass_++) {	
			let pass = global.inTickObject.anyRoomUnderBigAttack ? 1 - pass_ : pass_

			let storageInfosLargeToSmall = _.sortBy(storageInfos, function(obj) { return -obj.totalStoreAmount });
			let storageInfosSmallToLarge = storageInfosLargeToSmall.slice().reverse();
			for (let storageInfoFrom of storageInfosLargeToSmall) {

				if (storageInfoFrom.effectiveStorageAmount < constants.ROOM_ENERGY_NO_TERMINAL_SEND) {
					continue
				}

				let roomFrom = Game.rooms[storageInfoFrom.roomName]
				if (sentRooms.includes(roomFrom.name)) continue

				for (let storageInfoTo of storageInfosSmallToLarge) {
					if (storageInfoTo.effectiveStorageAmount >= constants.ROOM_ENERGY_NO_TERMINAL_RECIEVE) {
						continue
					}

					let roomTo = Game.rooms[storageInfoTo.roomName]

					if (roomTo.name == global.currentlyUnclaimingRoom && (pass == 0 || storageInfoTo.energyStoreAmount != 0)) continue

					if (roomFrom == roomTo) continue
					if (pass == 0) {
						if (!roomTo.factory) {
							continue
						}
						if (roomTo.storage.store[RESOURCE_ENERGY] + roomTo.terminal.store[RESOURCE_ENERGY] < 100000) {
							continue
						}
					}
					
					let deltaEffectiveStorage = storageInfoFrom.effectiveStorageAmount - storageInfoTo.effectiveStorageAmount
					let ratioEffectiveStorage = (storageInfoFrom.effectiveStorageAmount || 1e-6) / (storageInfoTo.effectiveStorageAmount || 1e-6)


					// console.log(JSON.stringify(storageInfoFrom), JSON.stringify(storageInfoTo), deltaEffectiveStorage)

					let sent = 0;				
					// Batteries are 20% cost and 5:1 compression Don't send them if it's cheaper end-to-end to send energy
					if (pass == 0 && Game.market.calcTransactionCost(1000, roomFrom.name, roomTo.name) >= 240) {
						let cost
						if (deltaEffectiveStorage > 300000 ||
							ratioEffectiveStorage > 10000 ||
							(storageInfoFrom.energyStoreAmount > 10 * storageInfoTo.energyStoreAmount && storageInfoTo.totalStoreAmount < 900000)) {
							cost = Game.market.calcTransactionCost(1000, roomFrom.name, roomTo.name)
							if (roomFrom.terminal.send(RESOURCE_BATTERY, 1000, roomTo.name) == OK) {
								sent = 1000;;
							}
						}
						else if (deltaEffectiveStorage > 200000 ||
								 ratioEffectiveStorage > 1000) {
							cost = Game.market.calcTransactionCost(750, roomFrom.name, roomTo.name)
							if (cost < 375 * 750 / 500) {
								if (roomFrom.terminal.send(RESOURCE_BATTERY, 750, roomTo.name) == OK) {
									sent = 750;
								}
							}
						}
						else if (deltaEffectiveStorage > 100000 ||
								 ratioEffectiveStorage > 100) {
							cost = Game.market.calcTransactionCost(500, roomFrom.name, roomTo.name)
							if (cost < 150) {
								if (roomFrom.terminal.send(RESOURCE_BATTERY, 500, roomTo.name) == OK) {
									sent = 500;
								}
							}
						}
						else if (deltaEffectiveStorage > 50000 ||
								 ratioEffectiveStorage > 10) {
							cost = Game.market.calcTransactionCost(500, roomFrom.name, roomTo.name)
							if (cost < 60) {
								if (roomFrom.terminal.send(RESOURCE_BATTERY, 500, roomTo.name) == OK) {
									sent = 500;
								}
							}
						}

						if (sent) {
							console.log(roomFrom.name, "Sending", sent, "batteries to", roomTo.name, "Cost", cost)
							// console.log("BUT IT'S ACTUALLY DISABLED", JSON.stringify(storageInfoFrom), JSON.stringify(storageInfoTo), deltaEffectiveStorage)
							storageInfoTo.effectiveStorageAmount += sent * 10;
							storageInfoTo.energyStoreAmount +=	sent * 10;
							storageInfoTo.totalStoreAmount +=	sent;

							storageInfoFrom.effectiveStorageAmount -= sent + cost;
							storageInfoFrom.energyStoreAmount -= sent + cost;
							storageInfoFrom.totalStoreAmount -= sent + cost;

							global.inTickObject.energyExpenditures["terminalBattery"] = (global.inTickObject.energyExpenditures["terminalBattery"] || 0) + cost

							sentRooms.push(roomFrom.name)
							break
						}
					}
					else if (pass == 1) {
						let cost
						let sent

						if (deltaEffectiveStorage > 300000 ||
							ratioEffectiveStorage > 10000 ||
							(storageInfoFrom.energyStoreAmount > 10 * storageInfoTo.energyStoreAmount && storageInfoTo.totalStoreAmount < 900000)) {
							cost = Game.market.calcTransactionCost(10000, roomFrom.name, roomTo.name)

							let amount = Math.min(10000, roomFrom.terminal.store[RESOURCE_ENERGY] - cost)

							if (amount > 1000 && roomFrom.terminal.send(RESOURCE_ENERGY, amount, roomTo.name) == OK) {
								cost = Game.market.calcTransactionCost(amount, roomFrom.name, roomTo.name)
								sent = amount;
							}
						}
						if (!sent && (deltaEffectiveStorage > 200000 || ratioEffectiveStorage > 1000)) {
							cost = Game.market.calcTransactionCost(7500, roomFrom.name, roomTo.name)
							if (cost < 2500 * 7500 / 5000) {
								let amount = Math.min(7500, roomFrom.terminal.store[RESOURCE_ENERGY] - cost)

								if (amount > 1000 && roomFrom.terminal.send(RESOURCE_ENERGY, amount, roomTo.name) == OK) {
									cost = Game.market.calcTransactionCost(amount, roomFrom.name, roomTo.name)
									sent = amount;
								}
							}
						}
						if (!sent && (deltaEffectiveStorage > 100000 || ratioEffectiveStorage > 100)) {
							cost = Game.market.calcTransactionCost(5000, roomFrom.name, roomTo.name)
							if (cost < 1000) {
								let amount = Math.min(5000, roomFrom.terminal.store[RESOURCE_ENERGY] - cost)

								if (amount  > 1000 && roomFrom.terminal.send(RESOURCE_ENERGY, amount, roomTo.name) == OK) {
									cost = Game.market.calcTransactionCost(amount, roomFrom.name, roomTo.name)
									sent = amount;
								}
							}
						}
						if (!sent && (deltaEffectiveStorage > 50000 || ratioEffectiveStorage > 10)) {
							cost = Game.market.calcTransactionCost(5000, roomFrom.name, roomTo.name)
							if (cost < 400) {
								let amount = Math.min(5000, roomFrom.terminal.store[RESOURCE_ENERGY] - cost)

								if (amount  > 1000 && roomFrom.terminal.send(RESOURCE_ENERGY, amount, roomTo.name) == OK) {
									cost = Game.market.calcTransactionCost(amount, roomFrom.name, roomTo.name)
									sent = amount;
								}
							}
						}

						if (sent) {
							console.log(roomFrom.name, "Sending", sent, "energy to", roomTo.name, "Cost", cost)
							// console.log("BUT IT'S ACTUALLY DISABLED", JSON.stringify(storageInfoFrom), JSON.stringify(storageInfoTo), deltaEffectiveStorage)
							storageInfoTo.effectiveStorageAmount += sent;
							storageInfoTo.energyStoreAmount += sent;
							storageInfoTo.totalStoreAmount += sent;

							storageInfoFrom.effectiveStorageAmount -= sent + cost;
							storageInfoFrom.energyStoreAmount -= sent + cost;
							storageInfoFrom.totalStoreAmount -= sent + cost;

							global.inTickObject.energyExpenditures["terminalEnergy"] = (global.inTickObject.energyExpenditures["terminalEnergy"] || 0) + cost

							sentRooms.push(roomFrom.name)
							break
						}

					}
				}
			}
		}


		/*for (var room of _.shuffle(Game.myRooms)) {
			if (Game.time % 51 == 0 && room.terminal && room.storage && room.terminal.my && room.terminal.isActive() && room.effectiveLevel >= 6) {
				var energyStoreAmount = room.storage.store[RESOURCE_ENERGY] + room.terminal.store[RESOURCE_ENERGY] + (room.factory ? (room.storage.store[RESOURCE_BATTERY] + room.terminal.store[RESOURCE_BATTERY]) * 10 : 0)
				var totalStoreAmount = room.storage.store.getUsedCapacity()

				// From
				// Bodged
				var effectiveStorageAmount;
				if (energyStoreAmount > 500000) {
					effectiveStorageAmount = energyStoreAmount + (totalStoreAmount - energyStoreAmount) / 2.
				}
				else if (energyStoreAmount > 100000) {
					effectiveStorageAmount = energyStoreAmount + (totalStoreAmount - energyStoreAmount) / 4.
				}
				else {
					effectiveStorageAmount = energyStoreAmount + (totalStoreAmount - energyStoreAmount) / 8.
				}

				if (totalStoreAmount > STORAGE_CAPACITY * .95) {
					effectiveStorageAmount *= 2;
				}

				effectiveStorageAmount *= 1 - 0.1 * ((5 - room.defcon) / 5);
				effectiveStorageAmount *= 1 - 0.05 * (room.memory.nukeCount || 0)

				if (room.restrictUpgraders) {
					effectiveStorageAmount *= 1.75;
				}

				if (room.effectiveLevel == 8) {
					effectiveStorageAmount *= 1.25;
				}
				else {
					effectiveStorageAmount *= 0.75;
				}

				for (let pass = 0; pass < 2; pass++) {
					if (pass == 0 && room.terminal.store.getUsedCapacity(RESOURCE_BATTERY) < 500) {
						continue
					}
					for (var room2 of _.shuffle(Game.myRooms)) {
						if (room == room2) continue
						if (pass == 0 && !room2.factory) continue
						if (room2.terminal && room2.storage && room2.terminal.my && room2.terminal.isActive() && room2.effectiveLevel >= 4 && (room2.terminal.store.getFreeCapacity() > 5000 || room2.terminal.store[RESOURCE_ENERGY] < 5000)) {

							// To
							var energyStoreAmount2 = room2.storage.store[RESOURCE_ENERGY] + room2.terminal.store[RESOURCE_ENERGY] + (room2. factory ? (room2.storage.store[RESOURCE_BATTERY] + room2.terminal.store[RESOURCE_BATTERY]) * 10 : 0)
							var totalStoreAmount2 = room2.storage.store.getUsedCapacity()
							if (targetRooms[room2.name]) {
								energyStoreAmount2 += targetRooms[room2.name] * 5000
								totalStoreAmount2 += targetRooms[room2.name] * 5000
							}

							// Bodged
							var effectiveStorageAmount2;
							if (energyStoreAmount2 > 500000) {
								effectiveStorageAmount2 = energyStoreAmount2 + (totalStoreAmount2 - energyStoreAmount2) / 2.
							}
							else if (energyStoreAmount2 > 100000) {
								effectiveStorageAmount2 = energyStoreAmount2 + (totalStoreAmount2 - energyStoreAmount2) / 4.
							}
							else {
								effectiveStorageAmount2 = energyStoreAmount2 + (totalStoreAmount2 - energyStoreAmount2) / 8.
							}

							if (totalStoreAmount2 > STORAGE_CAPACITY * .95) {
								effectiveStorageAmount2 *= 2;
							}

							effectiveStorageAmount2 *= 1 - 0.1 * ((5 - room2.defcon) / 5);
							effectiveStorageAmount2 *= 1 - 0.05 * (room2.memory.nukeCount || 0)

							if (room2.restrictUpgraders) {
								effectiveStorageAmount2 *= 1.75;
							}

							if (room2.effectiveLevel == 8) {
								effectiveStorageAmount2 *= 1.25;
							}
							else {
								effectiveStorageAmount2 *= 0.75;
							}

							// if (roomName == "W4N83" && roomName2 == "W2N82") console.log(energyStoreAmount, totalStoreAmount, energyStoreAmount2, totalStoreAmount2, effectiveStorageAmount, effectiveStorageAmount2)

							if (pass == 0) {								
								if (effectiveStorageAmount - effectiveStorageAmount2 > 300000 ||
									(energyStoreAmount > 10 * energyStoreAmount2 && totalStoreAmount2 < 900000)) {
									if (room.terminal.send(RESOURCE_BATTERY, 500, room2.name) == OK) {
										let cost = Game.market.calcTransactionCost(500, room.name, room2.name)
										console.log(room.name, "Sending 1000 batteries to", room2.name, "Cost", cost)
										targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
										break;
									}
								}
								else if (effectiveStorageAmount - effectiveStorageAmount2 > 200000) {
									var cost = Game.market.calcTransactionCost(500, room.name, room2.name)
									if (cost < 375) {
										if (room.terminal.send(RESOURCE_BATTERY, 500, room2.name) == OK) {
											console.log(room.name, "Sending 1000 batteries to", room2.name, "Cost", cost)
											targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
											break;
										}
									}
								}
								else if (effectiveStorageAmount - effectiveStorageAmount2 > 100000) {
									var cost = Game.market.calcTransactionCost(500, room.name, room2.name)
									if (cost < 150) {
										if (room.terminal.send(RESOURCE_BATTERY, 500, room2.name) == OK) {
											console.log(room.name, "Sending 1000 batteries to", room2.name, "Cost", cost)
											targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
											break;
										}
									}
								}
								else if (effectiveStorageAmount - effectiveStorageAmount2 > 50000) {
									var cost = Game.market.calcTransactionCost(500, room.name, room2.name)
									if (cost < 60) {
										if (room.terminal.send(RESOURCE_BATTERY, 500, room2.name) == OK) {
											console.log(room.name, "Sending 1000 batteries to", room2.name, "Cost", cost)
											targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
											break;
										}
									}
								}
							}
							else if (pass == 1) {
								if (effectiveStorageAmount - effectiveStorageAmount2 > 300000 ||
									(energyStoreAmount > 10 * energyStoreAmount2 && totalStoreAmount2 < 900000)) {
									if (room.terminal.send(RESOURCE_ENERGY, 5000, room2.name) == OK) {
										let cost = Game.market.calcTransactionCost(5000, room.name, room2.name)
										console.log(room.name, "Sending 5000 energy to", room2.name, "Cost", cost)
										targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
										break;
									}
								}
								else if (effectiveStorageAmount - effectiveStorageAmount2 > 200000) {
									var cost = Game.market.calcTransactionCost(5000, room.name, room2.name)
									if (cost < 2500) {
										if (room.terminal.send(RESOURCE_ENERGY, 5000, room2.name) == OK) {
											console.log(room.name, "Sending 5000 energy to", room2.name, "Cost", cost)
											targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
											break;
										}
									}
								}
								else if (effectiveStorageAmount - effectiveStorageAmount2 > 100000) {
									var cost = Game.market.calcTransactionCost(5000, room.name, room2.name)
									if (cost < 1000) {
										if (room.terminal.send(RESOURCE_ENERGY, 5000, room2.name) == OK) {
											console.log(room.name, "Sending 5000 energy to", room2.name, "Cost", cost)
											targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
											break;
										}
									}
								}
								else if (effectiveStorageAmount - effectiveStorageAmount2 > 50000) {
									var cost = Game.market.calcTransactionCost(5000, room.name, room2.name)
									if (cost < 400) {
										if (room.terminal.send(RESOURCE_ENERGY, 5000, room2.name) == OK) {
											console.log(room.name, "Sending 5000 energy to", room2.name, "Cost", cost)
											targetRooms[room2.name] = (targetRooms[room2.name] || 0) + 1
											break;
										}
									}
								}
							}

						}
					}
				}
			}
		}*/

	}

	end = Game.cpu.getUsed()
	Memory.stats.profiler["terminals"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile terminals: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}


	start = Game.cpu.getUsed()

	try {
		roomAI.updateRoomMemoryEndTick();
		if (Memory.season1) {
			roomAI.updateRoomMemoryEndTickSeason1();
		}
		if (Memory.season2) {
			roomAI.updateRoomMemoryEndTickSeason2();
		}
	}
	catch(e) {
		console.log("Error in updateRoomMemoryEndTick");
		console.log(e.stack);
	}

	end = Game.cpu.getUsed()
	Memory.stats.profiler["updateRoomMemoryEndTick"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile updateRoomMemoryEndTick: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}


	start = Game.cpu.getUsed()

	try {
		for (let roomName in Game.rooms) {
			Game.rooms[roomName].endTick();
		}
	}
	catch(e) {
		console.log("Error in room end tick");
		console.log(e.stack);
	}

	end = Game.cpu.getUsed()
	Memory.stats.profiler["room_end_tick"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile room end tick: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}

	start = Game.cpu.getUsed()

	try {
		overseerAI.tickEnd();
	}
	catch(e) {
		console.log("Error in overseer tickEnd");
		console.log(e.stack);
	}

	end = Game.cpu.getUsed()
	Memory.stats.profiler["overseer_tickEnd"] = (end - start)
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
		console.log("Profile overseer tickEnd: " + (end - start) + " (" + Game.cpu.bucket + ")")
	}

	try {
		start = Game.cpu.getUsed()
		commoditiesManager.tick();
		end = Game.cpu.getUsed()
		Memory.stats.profiler["commoditiesManager"] = (end - start)
		if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
			console.log("Profile commoditiesManager: " + (end - start) + " (" + Game.cpu.bucket + ")")
		}
	}
	catch (e) {
		console.log("Error in commoditiesManager");
		console.log(e.stack);
	}

	try {
		start = Game.cpu.getUsed()
		marketTrader.run();
		end = Game.cpu.getUsed()
		Memory.stats.profiler["market"] = (end - start)
		if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end - start) > 1)) {
			console.log("Profile market: " + (end - start) + " (" + Game.cpu.bucket + ")")
		}
	}
	catch (e) {
		console.log("Error in marketTrader");
		console.log(e.stack);
	}

	segments.storeSegments();

	try {
		if (["shard0", "shard1", "shard2", "shard3"].includes(Game.shard.name)) {
			if (RawMemory.foreignSegment) {
				// Standard for a nuke is 3k/tick. We're called once every 1000 ticks (otherwise segment is null)
				if (RawMemory.foreignSegment.id == 99) {
					let loanAllianceData = JSON.parse(RawMemory.foreignSegment.data);
					global.loanAllianceData = loanAllianceData
					for (let alliance in loanAllianceData) {
						for (let member of loanAllianceData[alliance]) {
							let knownRoom = 0;
							for (let roomName of Memory.enemyRooms) {
								if (Memory.rooms[roomName] && Memory.rooms[roomName].owner == member) {
									knownRoom = 1;
									break;
								}
							}

							let mod1 = .25;
							let mod2 = 1.001;
							if (alliance == "YP") {
								mod1 = 5;
								mod2 = 1.005;
							}							

							if (Memory.stats.hateCounter[member] && knownRoom) {
								Memory.stats.hateCounter[member] += mod1 * 1e3 * 5;
								Memory.stats.hateCounter[member] *= mod2;
							}
						}
					}
				}
				else if (RawMemory.foreignSegment.id == 98) {
					let loanCloneData = JSON.parse(RawMemory.foreignSegment.data);
					global.loanCloneData = loanCloneData
					for (let botName in loanCloneData) {
						for (let member of loanCloneData[botName].members) {
							let knownRoom = 0;
							for (let roomName of Memory.enemyRooms) {
								if (Memory.rooms[roomName] && Memory.rooms[roomName].owner == member) {
									knownRoom = 1;
									break;
								}
							}

							let mod1 = .1;
							let mod2 = 1.001;
							if (botName == "Overmind" && member != "Muon") {
								mod1 = 1;
								mod2 = 1.003;
							}
							if (knownRoom && Memory.stats.hateCounter[member]) {
								Memory.stats.hateCounter[member] += mod1 * 3e3 * 10;
								Memory.stats.hateCounter[member] *= mod2;
							}
						}
					}
				}
			}

			if (Math.random() < 0.01) {
				RawMemory.setActiveForeignSegment("LeagueOfAutomatedNations", _.sample([96, 98, 99]))
			}
			else {
				RawMemory.setActiveForeignSegment(null)
			}
		}
	}
	catch (e) {
		console.log("Error in clone hating");
		console.log(e.stack);
	}


	try {
		if ((Game.shard.name == "swc" && global.whiteList.length) || Memory.season2) {
			simpleAllies.checkAllies();

			if (Memory.season2) {
				const EVERYTHING_NOT_ENERGY_TARGET = 6000 * Game.myRooms.length

				if (Memory.maxRoomLevel > 6) {
					for (let resource of global.targetMinerals) {
						let amount = (Memory.stats.globalResources[resource] || 0)

						if (amount < EVERYTHING_NOT_ENERGY_TARGET) {
							simpleAllies.requestResource("all", resource, 1000 + EVERYTHING_NOT_ENERGY_TARGET - amount, 0.5 * (1 - amount / EVERYTHING_NOT_ENERGY_TARGET))
						}					
					}
				}

			}
			else {				
				const ENERGY_TARGET = 100000
				const EVERYTHING_NOT_ENERGY_TARGET = 6000

				for (let room of Game.myRooms) {
					if (!room.storage || !room.terminal || room.effectiveLevel < 6) continue

					let e = (room.storage.store[RESOURCE_ENERGY] || 0) + (room.terminal.store[RESOURCE_ENERGY] || 0);

					let eTarget = (ENERGY_TARGET + 10000 * (5 - room.defcon)) * (room.upgradeFocus ? 1.25 : 1)

					if (e < eTarget) {
						simpleAllies.requestResource(room.name, RESOURCE_ENERGY, 10000 + eTarget - e, Math.min(1, 1 - e / eTarget + (5 - room.defcon) * 0.1))
					}

					if (room.effectiveLevel > 6) {
						for (let resource of global.targetMinerals) {
							let amount = (room.storage.store[resource] || 0) + (room.terminal.store[resource] || 0);

							if (amount < EVERYTHING_NOT_ENERGY_TARGET) {
								simpleAllies.requestResource(room.name, resource, 1000 + EVERYTHING_NOT_ENERGY_TARGET - amount, 0.25 * (1 - amount / EVERYTHING_NOT_ENERGY_TARGET))
							}					
						}
					}
				}
			}

			simpleAllies.endOfTick();
		}
	}
	catch(e) {
		console.log(e.stack);
		console.log("Error in ally stuff eot");
	}



	// Clocking

	if (Game.time % 100 == 37) {
		const alpha = Math.exp(-(1/(2000.)));
		if (Memory.stats.tpsTrackTime) {
			Memory.stats.secsPerTick = (alpha * Memory.stats.secsPerTick || 3) + (1 - alpha) * 0.001 * (Date.now() - Memory.stats.tpsTrackTime) / (Game.time - Memory.stats.tpsTrackTick)
		}

		Memory.stats.tpsTrackTime = Date.now() 
		Memory.stats.tpsTrackTick = Game.time;
	}


	try {		
		if (!Memory.privateServer && Game.time - (Memory.lastISMemoryUpdate || 0) > 50 && Math.random() < 0.1) {
			Memory.lastISMemoryUpdate = Game.time
			let isMemory = interShardMemoryManager.getMem(Game.shard.name)

			let currentLength = (InterShardMemory.getLocal() || "").length

			let overSized = currentLength > 1024 * 80;

			let rECnt = {}
			let rICnt = {}
			let energyCnt = 0;

			isMemory.attemptShard1Claim = Memory.attemptShard1Claim
			isMemory.energyPrice = 0
			isMemory.avgEValues = {}
			isMemory.avgIValues = {}

			isMemory.myRooms = {}
			for (let room of Game.myRooms) {
				isMemory.myRooms[room.name] = room.getIntershardInfo();

				for (let resourceName in (room.memory.avgExportValues || {})) {
					isMemory.avgEValues[resourceName] = (isMemory.avgEValues[resourceName] || 0) + room.memory.avgExportValues[resourceName]
					rECnt[resourceName] = (rECnt[resourceName] || 0) + 1
				}
				for (let resourceName in (room.memory.avgImportValues || {})) {
					isMemory.avgIValues[resourceName] = (isMemory.avgIValues[resourceName] || 0) + room.memory.avgImportValues[resourceName]
					rICnt[resourceName] = (rICnt[resourceName] || 0) + 1
				}

				if (room.memory.energyPrice !== undefined) {
					isMemory.energyPrice = (isMemory.energyPrice || 0) + room.memory.energyPrice
					energyCnt++
				}
			}

			for (let resourceName in isMemory.avgEValues) {
				isMemory.avgEValues[resourceName] /= (rECnt[resourceName] || 1)
			}
			for (let resourceName in isMemory.avgIValues) {
				isMemory.avgIValues[resourceName] /= (rICnt[resourceName] || 1)
			}

			isMemory.energyPrice /= (energyCnt || 1)
			

			// isMemory.roomData = {}

			if (Math.random() < 0.1 || overSized) {
				isMemory.creepData = isMemory.creepData || {}

				for (let key of _.clone(Object.keys(isMemory.creepData))) {
					if (!isMemory.creepData[key].t || Game.time - isMemory.creepData[key].t > (currentLength > 1024 * 95 ? 625 : (currentLength > 1024 * 90 ? 1250 : (overSized ? 2500 : 5000)))) {
						delete isMemory.creepData[key]
					}
				}
			}

			isMemory.tick = Game.time;
			isMemory.secsPerTick = Memory.stats.secsPerTick;
			isMemory.bucket = Game.cpu.bucket;
			isMemory.avgBucket = Memory.stats.avgBucket;

			isMemory.globalResources = _.clone(Memory.stats.globalResources)

			isMemory.gclEstimates = Memory.gclEstimates

			isMemory.avgBucket = Memory.stats.avgBucket;
			isMemory.wallClock = Date.now()

			isMemory.portalStatus = {}
			for (let portalRoomName of Memory.knownIntershardPortalRoomNames) {
				if (Memory.rooms[portalRoomName] && Memory.rooms[portalRoomName].DT && (Memory.rooms[portalRoomName].DT > 0.5 || Memory.rooms[portalRoomName].creepCombatPartsRanged || Memory.rooms[portalRoomName].creepCombatPartsAttack || Memory.rooms[portalRoomName].creepCombatPartsHeal)) {
					let obj = {}
					obj.DT = Memory.rooms[portalRoomName].DT
					obj.ccp = {}
					obj.ccp.r = (Memory.rooms[portalRoomName].creepCombatPartsRanged || 0)
					obj.ccp.a = (Memory.rooms[portalRoomName].creepCombatPartsAttack || 0)
					obj.ccp.h = (Memory.rooms[portalRoomName].creepCombatPartsHeal || 0)

					obj.mode = {};
					obj.mode.r = (Memory.rooms[portalRoomName].modeRanged || 0)
					obj.mode.a = (Memory.rooms[portalRoomName].modeAttack || 0)
					obj.mode.h = (Memory.rooms[portalRoomName].modeHeal || 0)
					obj.mode.t = (Memory.rooms[portalRoomName].modeTough || 0)

					obj.myccp = {r:0, a:0, h:0}

					if (Game.rooms[portalRoomName]) {
						for (let creep of Game.rooms[portalRoomName].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL])) {
							// Why is it unmodified in room? I don't want to screw with it as I don't know what leans on that
							var combatParts = creep.getBoostModifiedCombatParts(false, true);

							obj.myccp.r += combatParts.numRanged;
							obj.myccp.a += combatParts.numAttack;
							obj.myccp.h += combatParts.numHeal;
						}
					}


					isMemory.portalStatus[portalRoomName] = obj
				}
			}

			// Don't need this.
			// for (let roomName in Memory.rooms) {
			// 	let numSources = roomIntel.getNumSources(roomName)
			// 	if (numSources) {
			// 		let exits = Game.map.describeExits(roomName)
			// 		let dirKeyStr = ""
			// 		for (let key of Object.keys(exits)) {
			// 			dirKeyStr += key;
			// 		}

			// 		isMemory.roomData[roomName] = {s: numSources, e: dirKeyStr}
			// 	}
			// }
			interShardMemoryManager.touchLocal();

		}

		if (global.inTickObject.updateLocalIntershard) {
			let outString = JSON.stringify(interShardMemoryManager.getMem(Game.shard.name))
			if (Math.random() < 0.01) {
				if (outString.length >= 1024 * 100) {
					console.log("InterShardMemory string getting a bit long", outString.length)
				}
			}

			InterShardMemory.setLocal(outString);
		}
	}
	catch(e) {
		console.log(e.stack);
		console.log("Error intershard memory");
	}


	start = Game.cpu.getUsed()
	try {		
		for(var id in global._creepStoreUsedCapacityInvalid) {
			delete global._creepStoreUsedCapacity[id]
		}
	}
	catch(e) {
		console.log("Error in creep finalise");
		console.log(e.stack);
	}
	end = Game.cpu.getUsed()

	Memory.stats.profiler["creepFinalise"] = (end - start)


	safeRoute.cleanSafeRouteCostCache();

	start = Game.cpu.getUsed()

	if (Game.map.visual) {		
		try {		
			mapVisuals.endTick();
		}
		catch(e) {
			console.log("Error in mapVisuals");
			console.log(e.stack);
		}
	}

	end = Game.cpu.getUsed()

	Memory.stats.profiler["mapVisEnd"] = end - start



	start = Game.cpu.getUsed()
	

	// Clean up some stuff
	if (Math.random() > 0.99975) delete global._creepBodyParts;
	if (Math.random() > 0.99975) delete global._creepHasBodyPart;
	if (Math.random() > 0.99975) global._creepNumBodyPart = {};
	if (Math.random() > 0.99975) delete global._creepHasBoost;
	if (Math.random() > 0.99975) delete global._creepSigs;
	if (Math.random() > 0.99975) delete global._creepStoreUsedCapacity;

	// Clear aggressively as it may not be correct.
	if (Math.random() > 0.95) delete global._creepBMCP_M;
	if (Math.random() > 0.95) delete global._creepBMCP_U;

	if (Math.random() > 0.99999) delete global.roomRampartHits;
	if (Math.random() > 0.99999) delete global.roomPressurePoints;
	if (Math.random() > 0.9999) delete global.flaggedRoads;

	if (Math.random() > 0.99999) {
		for (let roomName in _.clone(Memory.remoteHarvestingValues)) {
			let exists = false;
			for (let room of Game.myRooms) {
				if (room.name == roomName) {
					exists = true;
					break;
				}				
			}
			if (!exists) {
				delete Memory.remoteHarvestingValues[roomName]
			}
		}
	}

	if (Math.random() > 0.99999 && Memory.mlps) {
		for (let mlpMode in Memory.mlps) {
			for (let sig in _.clone(Memory.mlps[mlpMode])) {
				if (Game.time - (Memory.mlps[mlpMode][sig].lastTouched || 0) > 500e3) {
					delete Memory.mlps[mlpMode][sig];
				}
			}
		}
	}


	let gcStart = Game.cpu.getUsed();

	heapStats = Game.cpu.getHeapStatistics ? Game.cpu.getHeapStatistics() : {};
	heapUsed = heapStats.total_heap_size + heapStats.externally_allocated_size;

	/*if (heapUsed > 0.92 * heapStats.heap_size_limit) {
		if (Memory.lastGCTick && (Memory.lastGCTick || 0) != Game.time - 1) {
			// console.log("End tick: Heap getting big", heapUsed, heapStats.heap_size_limit);
			// console.log("Heap getting big, triggering manual GC", heapUsed, heapStats.heap_size_limit);
			// pathCache.purgeCostMatrices();
			if (Game.cpu.bucket > 9500) {
				// gc();
				// heapStats = Game.cpu.getHeapStatistics();
				// console.log("New:", heapStats.total_heap_size + heapStats.externally_allocated_size);
			}
			else {
				// gc(true);
				// heapStats = Game.cpu.getHeapStatistics();
				// console.log("New:", heapStats.total_heap_size + heapStats.externally_allocated_size);
			}
		}
		else {
			// console.log("Heap seems leaky, TODO: wipe global");
		}
		Memory.lastGCTick = Game.time;
	}*/

	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end) > 1)) {
		console.log("Profile gc: " + (tickEnd) + " (" + Game.cpu.bucket + ")")
	}

	let gcEnd = Game.cpu.getUsed();

	Memory.stats.bucket = Game.cpu.bucket;

	if (Game.time % 50 == 0) {
		Memory.stats.ticks *= 0.97;
		Memory.stats.ticksLong *= 0.997;
		Memory.stats.pathCPU *= 0.97;
		Memory.stats.pathHits *= 0.97;
		Memory.stats.pathCalls *= 0.97;

		for (let i in Memory.stats.rolePathCalls) {
			Memory.stats.rolePathCalls[i] *= 0.97;
		}
		for (let i in Memory.stats.rolePathHits) {
			Memory.stats.rolePathHits[i] *= 0.97;
		}

		Memory.stats.rolePathHitsPercent = Memory.stats.rolePathHitsPercent || {};
		for (let i in _.clone(Memory.stats.rolePathCalls)) {
			if (Memory.stats.rolePathCalls[i] < 0.01) {
				delete Memory.stats.rolePathCalls[i]
				delete Memory.stats.rolePathHits[i]
				delete Memory.stats.rolePathHitsPercent[i]
			}
		}


		for (let i in Memory.stats.rolePathCalls) {
			if (Memory.stats.rolePathHits[i] !== undefined) {
				Memory.stats.rolePathHitsPercent[i] = Memory.stats.rolePathHits[i] / Memory.stats.rolePathCalls[i];
			}
		}

		for (let i in _.clone(Memory.stats.rolePathCPUs)) {
			if ((Memory.stats.rolePathCPUs[i] || 0) < 1e-10) {
				_.pull(i, Memory.stats.rolePathCPUs)
			}
			else {
				Memory.stats.rolePathCPUs[i] *= 0.97;
			}
		}
		for (let i in Memory.stats.spawnCosts) {
			Memory.stats.spawnCosts[i] *= 0.97;
		}
		for (let i in Memory.stats.missionCosts) {
			Memory.stats.missionCosts[i] *= 0.97;
		}

		for (let i in Memory.stats.globalHarassTracking) {
			Memory.stats.globalHarassTracking[i] *= 0.97;
		}

		Memory.stats.pathAnalyseHits *= 0.97;
		Memory.stats.pathAnalyseCalls *= 0.97;

		Memory.stats.pathSpawnHits *= 0.97;
		Memory.stats.pathSpawnCalls *= 0.97;

		Memory.stats.cmHits *= 0.97;
		Memory.stats.cmCPU *= 0.97;
		Memory.stats.cmCalls *= 0.97;

		if (Memory.stats.lastCreepCPUs) {
			// Don't allow a jump of more than 10000... because that's an insaenly high amount of CPU for a single creep type over 50 ticks (200/tick)
			// Also it obviously can't be negative...
			for (let role in _.clone(Memory.stats.creepCPUs)) {
				if ((Memory.stats.creepCPUs[role] || 0) < 1e-10) {
					_.pull(role, Memory.stats.creepCPUs)
					_.pull(role, Memory.stats.lastCreepCPUs)
				}
				else if (Memory.stats.creepCPUs[role] > (Memory.stats.lastCreepCPUs[role] || 0) + 10000 || Memory.stats.creepCPUs[role] < (Memory.stats.lastCreepCPUs[role] || 0)) {
					Memory.stats.creepCPUs[role] = Memory.stats.lastCreepCPUs[role]
				}
			}
		}

		for (let role in Memory.stats.creepCPUs) {
			Memory.stats.creepCPUs[role] *= 0.97;
		}

		Memory.stats.lastCreepCPUs = _.clone(Memory.stats.creepCPUs)

		if (Game.time % 100 == 0) {
			let roleCount = {}
			for (let creepName in Game.creeps) {
				let creep = Game.creeps[creepName]
				let mem = Memory.creeps[creepName]
				let cpuHash = mem.role + (creep.assaulter ? "ass" : "") + (creep.ramparter ? "ramp" : "") + (creep.moon ? "moon" : "") + (creep.renew ? "renew" : "");
				roleCount[cpuHash] = (roleCount[cpuHash] || 0) + 1
			}

			Memory.stats.creepCPUsPerCreep = {}
			for (let role in Memory.stats.creepCPUs) {
				if (roleCount[role]) {
					Memory.stats.creepCPUsPerCreep[role] = Memory.stats.creepCPUs[role] / roleCount[role];
				}
				else {
					delete Memory.stats.creepCPUsPerCreep[role]
				}
			}
		}

		Memory.stats.marketInfo = Memory.marketInfo

		Memory.stats.labUpTime *= 0.997
	}

	if (Memory.playerDefenseAnalysis && Math.random() < 0.001) {
		let keys = Object.keys(Memory.playerDefenseAnalysis)
		for (let player of keys) {
			let value = Memory.playerDefenseAnalysis[player];

			// 200000 ticks should be enough to invalidate this stuff
			if (Game.time - value.lastUpdated > 200000) {
				delete Memory.playerDefenseAnalysis[player]
			}
		}
	}

	if (Game.cpu.getHeapStatistics) {
		const alpha = Math.exp(-(1/(2000.)));
		let stats = Game.cpu.getHeapStatistics();
		let size = stats["total_heap_size"] + stats["externally_allocated_size"];
		// if (Game.cpu.getHeapStatistics) {
		// 	console.log(size, Object.keys(global.costMatrices || {}).length, Game.cpu.getUsed());
		// }
		Memory.stats.heapStats = stats;
		Memory.stats.heapStats["size"] = size;
		// Memory.stats.heapSize = size;
		Memory.stats.heapSizeAvg = alpha * (Memory.stats.heapSizeAvg || 0) + (1 - alpha) * (size || 0);
	}

	if (Memory.requestedSegments[9] == 0) {
		Memory.requestedSegments.pop();
	}

	// console.log("Memory.requestedSegments", Memory.requestedSegments)

	RawMemory.setActiveSegments(Memory.requestedSegments);


	if (Game.cpu.bucket < 5000 && Game.time % 100 == 0) {
		console.log("Theres a hole in my bucket! " + Game.cpu.bucket)
	}

	// Clean up
	// delete Game.myRooms;


	// END-------------

	const alpha = Math.exp(-(1/(20000.)))
	Memory.stats.harvestEnergyPerTick = Game.harvestedThisTick;
	Memory.stats.harvestEnergyPerTickAvg = alpha * (Memory.stats.harvestEnergyPerTickAvg || 0) + (1 - alpha) * (Game.harvestedThisTick || 0)

	Memory.stats.haulerTransferredEnergy = Game.haulerTransferredEnergy;
	Memory.stats.haulerTransferredEnergyAvg = alpha * (Memory.stats.haulerTransferredEnergyAvg || 0) + (1 - alpha) * (Game.haulerTransferredEnergy || 0)

	const alpha2 = Math.exp(-(1/(3000.)))

		Memory.stats.energyExpenditures = Memory.stats.energyExpenditures || {}

		for (let expenditure of _.uniq(Object.keys(global.inTickObject.energyExpenditures).concat(Object.keys(Memory.stats.energyExpenditures)))) {
			Memory.stats.energyExpenditures[expenditure] = alpha2 * (Memory.stats.energyExpenditures[expenditure] || 0) + (1 - alpha2) * (global.inTickObject.energyExpenditures[expenditure] || 0)
		}


	Memory.stats.ticks = (Memory.stats.ticks || 0) + 1;
	Memory.stats.ticksLong = (Memory.stats.ticksLong || 0) + 1;

	if (Game.cpu.bucket < 2000 || Game.cpu.bucket > 9000 || global.bucketBurning) {
		if (Game.cpu.bucket == 10000) {
			const alpha4 = Math.exp(-(1/((2000.))))
			Memory.stats.avgBucket = alpha4 * (Memory.stats.avgBucket || 10000) + (1 - alpha4) * (Game.cpu.bucket)
		}
		else {			
			const alpha4 = Math.exp(-(1/((4000.))))
			Memory.stats.avgBucket = alpha4 * (Memory.stats.avgBucket || 10000) + (1 - alpha4) * (Game.cpu.bucket)
		}
	}
	else {
		const alpha4 = Math.exp(-(1/(8000.)))
		Memory.stats.avgBucket = alpha4 * (Memory.stats.avgBucket || 10000) + (1 - alpha4) * (Game.cpu.bucket)
	}

	if (Game.time % 1000 == 0 && ((Memory.avgCPUFast / Memory.avgCPU) > 1.25 || (Memory.avgCPU / Memory.avgCPUFast) > 1.25)) {
		console.log("CPU anomoly detected!", "Recent:", Memory.avgCPUFast, "Long term", Memory.avgCPU)
	}

	if (Math.random() < 0.01) {
		for (let structureID in Game.structures) {
			if (Math.random() < 0.01) {
				Game.getObjectById(structureID).notifyWhenAttacked(false)
			}
		}
	}

	// if (Memory.stats.avgBucket > 9900 && Game.cpu.bucket == 10000 && Memory.stats.avgCPUFast < Game.cpu.limit * 0.9 && Memory.stats.avgCPU < Game.cpu.limit * 0.9 && Game.cpu.generatePixel && !Memory.season1) {
	// 	Game.cpu.generatePixel()
	// }

	// Maybe this helps GC, maybe it doesn't
	// Actually, don't do this, hurts debugging
	// global.inTickObject = {}

	end = Game.cpu.getUsed()
	Memory.stats.profiler["tick_shutdown"] = (end - start)



	var tickEnd = Game.cpu.getUsed()
	if (Memory.profiling || ((Game.cpu.bucket < 2000) && Game.time % 100 == 0 && (end) > 1)) {
		console.log("Profile tick: " + (tickEnd) + " (" + Game.cpu.bucket + ")")
	}

	Memory.stats.profiler["Whole_tick"] = tickEnd
	// if (Game.time % 1001 == 350 && Game.shard.name == "shard2" && Memory.stats.avgBucket < 5000 && Memory.stats.avgCPU < Game.cpu.limit * 0.915) {
	// 	Game.cpu.halt();
	// }
// }
// catch(e) {
// 	console.log("<font color=\"red\">" + e.stack + "</font>");
// }
	// fromRoom, toRoom, useNoise, swampMod, allowPortals, maxRange, avoidKeepers, ignoreKeepers, avoidHostiles
	// safeRoute.findSafeRoute("E1N6", "E7N5", false, undefined, false, undefined, false, true, undefined)

	// require("moveResolver").vis("E18S8")



	if (false && Game.shard.name == "swc") {


		let roomName = "W7N4"		
		// let rangeMap = []
		// for (let i = 0; i < 50; i++) {
		// 	rangeMap.push([])
		// 	for (let j = 0; j < 50; j++) {
		// 		rangeMap[i].push(9999);
		// 	}
		// }

		if (!global._____rangeMap) {
			global._____rangeMap = new Uint32Array(64 * 64)
		}

		let rangeMap = global._____rangeMap
		rangeMap.fill(1 << 15)

		let roomTerrain = Game.map.getRoomTerrain(roomName)

		if (!global._____queue) {
			global._____queue = new Uint32Array(2500)
		}
		function createRangeMap(rangeMap, startX, startY) {
			rangeMap[startX * 64 + startY] = 0

			let queue = global._____queue

			queue[0] = startX * 64 + startY
			let steps = 0
			let elements = 1;
			while (elements - steps >= 0) {
				const val = queue[steps]

				const x = val >> 6;
				const y = val & 63;

				for (let i = x - 1; i <= x + 1; i++) {
					if (i <= 0 || i >= 49) continue
					for (let j = y - 1; j <= y + 1; j++) {
						if (j <= 0 || j >= 49) continue

						const idx = i * 64 + j

						if (rangeMap[idx] > rangeMap[val] + 1 && !(roomTerrain.get(i, j) & TERRAIN_MASK_WALL)) {
							rangeMap[idx] = rangeMap[val] + 1
							queue[elements] = idx
							elements++
						}
					}
				}
				steps++
			}

		}


		console.log(JSON.stringify(Game.cpu.getHeapStatistics()))
		let a = Game.cpu.getUsed();
		createRangeMap(rangeMap, Memory.rooms[roomName].conX, Memory.rooms[roomName].conY)
		console.log(Game.cpu.getUsed() - a)
		console.log(JSON.stringify(Game.cpu.getHeapStatistics()))

		let vis = new RoomVisual(roomName)
		for (let i = 0; i < 50; i++) {
			for (let j = 0; j < 50; j++) {
				if (rangeMap[i * 64 + j] < (1 << 15)) {
					vis.text(rangeMap[i * 64 + j], i, j)
				}
			}
		}

	}

	global.Tracing.postTick();
});
// });