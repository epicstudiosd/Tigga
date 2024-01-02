"use strict";


var roomAI = require('roomAI');
var powerRangerAI = require('powerRangerAI');
var util = require('util');
var safeRoute = require('safeRoute');
var pathCache = require('pathCache');
var roomIntel = require('roomIntel');
var combatManager = require('combatManager');
var missionInfo = require('missionInfo');
const constants = require('constants');

const intelAI = require("intelAI")
const creepCreator = require("creepCreator")

const marketTrader = require("marketTrader")

// 300
// 550
// 800
// 1300
// 1800
// 2300
// 5600
// 12900

function changeCreepRole(creep, roomMemory, newRole) {
	if (!roomMemory.ownedCreeps[newRole]) roomMemory.ownedCreeps[newRole] = []
	roomMemory.ownedCreeps[newRole].push(creep.name)

	if (roomMemory.ownedCreeps[creep.mem.role] && roomMemory.ownedCreeps[creep.mem.role].indexOf(creep.name) != -1) {
		roomMemory.ownedCreeps[creep.mem.role].splice(roomMemory.ownedCreeps[creep.mem.role].indexOf(creep.name), 1);
	}
	
	creep.mem.role = newRole
}


const HIGH_UTIL_THRESH = 0.9

function getBudgetPercentageForRole(role) {
	switch(role) {
		case "reserver":
			// Just get it out. CPU wasteful but keeps spawn out of bubbles
			if (Memory.stats.avgBucket > 9000) {
				return 0.25
			}
			else {
				return 0.8
			}
		case "miner":
		case "builder":
		case "repairer":
		case "dismantler":
			return 0.7;
		case "upgrader":
			return 0.85;
		case "fetcher":
			return 0.9;
		case "baseManager":
			return 0.6;
		case "controllerAttacker":
			return 0.6;
		default:
			return 1;
	}
}


function getUpgradersForRCL(rcl) {
	switch (rcl) {
		case 1:
			return 1;
		case 2:
			return 5;
		case 3:
			return 4;
		case 4:
		case 5:
			return 3;
		case 6:
			return 2;
		case 7:
		case 8:
			return 1;
	}
}

function getBaseManagersForRCL(rcl) {
	switch (rcl) {
		case 1:
			return 0;
		case 2:
			return 1;
		case 3:
			return 1;
		case 4:
			return 1;
		case 5:
			return 1;
		case 6:
			return 1;
		case 7:
			return 1;
		case 8:
			return 1;
	}
}



function getNameForRole(role) {
	Memory.creepCount = Memory.creepCount || 0;

	let cnt = Memory.creepCount;

	if (role == "sbs") {
		return "sbs" + cnt
	}
	else if (role == "ss") {
		return "ss" + cnt
	}
	else if (role == "baseManager") {
		return "bm" + cnt
	}
	// else if (role == "keeperGuard1") {
	// 	return "kg1_" + Memory.creepCount
	// }
	else if (role == "keeperGuard2") {
		return "kg2" + cnt
	}
	else if (role == "scout") {
		return "sc" + cnt
	}
	else if (role == "observer") {
		return "ob" + cnt
	}
	else if (role == "keeperHarvester2") {
		return "kh2" + cnt
	}
	else if (role == "controllerAttacker" || role == "heavyControllerAttacker") {
		return "ca" + cnt
	}
	else if (role == "antiScout") {
		return "as" + cnt
	}
	else if (role == "tankChildRoom") {
		return "tc" + cnt
	}
	else if (role == "healerChildRoom") {
		return "hc" + cnt
	}
	else if (role == "rangedChildRoom") {
		return "rc" + cnt
	}
	else if (role == "powerTank") {
		return "pt" + cnt
	}
	else if (role == "powerHealer") {
		return "ph" + cnt
	}
	else if (role == "bHarvester") {
		return "bh" + cnt
	}
	return role[0] + cnt
}


function getBestroomSpawn(currentSpawn) {
	var bestroomSpawn = null
	var minBadness = Infinity;

	for (var spawnName in Game.spawns) {
		var spawn = Game.spawns[spawnName];

		if (spawn.room.availableForRemoteSpawn >= (2 - (spawn.room.mem.spawnUtilization < 0.5 ? 1 : 0)) && spawn.room.storage && spawn.room.storage.store[RESOURCE_ENERGY] > constants.ROOM_ENERGY_NO_REMOTE_SPAWN) {
			if (Memory.season2 && util.getCentreRoomForRoomName(currentSpawn.room.name) != util.getCentreRoomForRoomName(spawn.room.name)) {
				continue
			}
			var badness = safeRoute.getSafeRouteCost(currentSpawn.room.name, spawn.room.name)


			if (spawn.room.storage.store[RESOURCE_ENERGY] > 500000) badness -= 2
			if (spawn.room.storage.store[RESOURCE_ENERGY] < 100000) badness += 4

			// These guys probably need extra special bootstrapping.
			badness -= currentSpawn.room.controller.level - currentSpawn.room.effectiveLevel;

			if ((currentSpawn.room.controller.safeMode || 0) > 1500) {
				badness -= 2;
			}

			if (spawn.room.spawnUtilization > 0.9) {
				continue
			}
			else if (spawn.room.spawnUtilization > 0.85) {
				badness += 3;
			}
			else if (spawn.room.spawnUtilization > 0.8) {
				badness += 2;
			}
			else if (spawn.room.spawnUtilization > 0.75) {
				badness += 2;
			}


			if (badness < 6 && badness < minBadness) {
				bestroomSpawn = spawn;
				minBadness = badness;
			}
		}
	}

	return bestroomSpawn;
}


module.exports = function() {
	let recycleCreep = StructureSpawn.prototype.recycleCreep
	Spawn.prototype.recycleCreep = function(creep) {
		let ret = recycleCreep.apply(this, arguments);

		if (ret == OK) {
			Memory.stats.spawnCosts["recycle"] = (Memory.stats.spawnCosts["recycle"] || 0) + (creep.mem.bC || 0) * creep.ticksToLive / CREEP_LIFE_TIME;
		}
		return ret;
	}

	// Only ones that can be spawned without a priority spawn
	const autoSpawnRoles = ["ss",
					"harvester",
					"bHarvester",
					"centralHarvester",
					"doubleHarvester",
					"miner",
					"fetcher",
					"sbs",
					"baseManager",
					"keeperHarvester2",
					// "keeperGuard1",
					"keeperGuard2",
					"soloKeeperMiner",
					"soloCentreMiner",
					"upgrader",
					"repairer",
					"reserver",
					"claimer",
					"controllerAttacker",
					"builder",
					"lootFetcher",
					"powerFetcher",
					"transporter",
					"tankChildRoom",
					"rangedChildRoom",
					"healerChildRoom",
					"tank",
					"ranged",
					"healer",
					"edgeBouncer",
					"defender",
					"deconstructor",
					"dismantler",
					"coreDismantler",
					"controllerRescuer",
					"pioneer",
					"safeModeGenerator",
					"powerShuffler",
					"labTech",
					"advLabManager",
					"scout",
					"observer",
					"season5ThoriumMiner",
					"season5UnclaimEmptier"
					];

	const defaultPriority = {"dummy": 0,
							"sbs" : 190,
							"ss" : 110,
							"baseManager" : 90,
							"harvester" : 100,
							"bHarvester" : 100,
							"doubleHarvester" : 105,
							"miner" : 85,
							"centralHarvester" : 100,
							"fetcher" : 100,
							"keeperHarvester2" : 100,
							// "keeperGuard1" : 95,
							"keeperGuard2" : 101,
							"soloKeeperMiner" : 10,
							"soloCentreMiner" : 89,
							"upgrader" : 25,
							"repairer" : 45,
							"reserver" : 100,
							"claimer": 84,
							"controllerAttacker": -1,
							"heavyControllerAttacker": -1,
							"lootFetcher": 5,
							"opHauler": 5,
							"powerFetcher": 84,
							"transporter": 5,
							"roadTransporter": 5,
							"builder" : 55,
							"tank" : 151,
							"ranged" : 150,
							"raiderClose" : 150,
							"raiderRoaming" : 150,
							"raiderHauler" : 150,
							"healer" : 149,
							"edgeBouncer" : 50,
							"tankChildRoom" : 60,
							"rangedChildRoom" : 60,
							"healerChildRoom" : 60,
							"defender" : 170,
							"deconstructor" : 70,
							"strongholdDeconstructor" : 70,
							"dismantler" : 70,
							"coreDismantler" : 70,
							"pioneer" : 73,
							"allyPioneer" : 73,
							"controllerRescuer" : 50,
							"powerTank" : 135,
							"newPowerTank" : 135,
							"powerTankMini" : 135,
							"powerHealer" : 130,
							"newPowerHealer" : 130,
							"powerHealerMini" : 130,
							"powerGuard" : 130,
							"powerGuardMini" : 130,
							"boostGrabber" : -1,
							"safeModeGenerator": 10,
							"season2ScoreShuffler": 10,
							"season2ContainerShuffler": 101,
							"season2FactoryBuster": 101,
							"powerShuffler": 110,
							"advLabManager": 10,
							"labTech": 15,
							"scout" : 20,
							"portalScout" : 1,
							"intershardScout" : 1,
							"intershardClaimer" : 89,
							"intershardPioneer" : 89,
							"intershardRepairer" : 70,
							"intershardRanged" : 89,
							"intershardPairedHealer" : 89,
							"intershardPairedTank" : 89,
							"isUpgrader" : 2,
							"isTransporter" : 10,
							"isHeavyTransport" : 10,
							"intershardSMG" : 10,
							"observer" : 20,
							"antiScout" : 85,
							"depositFetcher" : 35,
							"depositMiner" : 40,
							"depositTug" : 40,
							"depositTroll" : -3,
							"seasonFetcher": -1,
							"seasonTug": -1,
							"seasonWallDestroyer": -2,
							"season4Scorer": 200,
							"season5ThoriumMiner": 85,
							"season5ScoreTransport": 999
						};

	StructureSpawn.prototype.initFixedValues = function() {
		this.init = true;

		if (this.room.spawnFixedValues) {
			this.targetCounts = this.room.spawnFixedValues.targetCounts;
			this.requiredCounts = this.room.spawnFixedValues.requiredCounts;
			this.designs = this.room.spawnFixedValues.designs;
			this.extraMemory = this.room.spawnFixedValues.extraMemory;
			this.extraPriority = this.room.spawnFixedValues.extraPriority;
		}
		else {
			let hasSBC = roomAI.hasSpawnBatteryContainers(this.room);

			this.targetCounts = {"scout" : this.room.effectiveLevel < 8 ? Math.ceil((Math.min(this.room.effectiveLevel, Memory.scoutRooms.length / 4) / ((Memory.stats.avgBucket < 6000 ? 4 : 2) * (((Memory.botArena || Memory.swc || Memory.season) ? 1 : 2))))) : 1,
								"sbs": hasSBC ? 4 : 0,
								"ss": this.room.storage ? 1 : 0,
								"baseManager" : getBaseManagersForRCL(this.room.effectiveLevel) + Math.min(1, (this.room.defcon <= 3 ? 1 : 0) + (Game.time - (this.room.mem.spawningHeavyMission || -2000) < 2000 ? 1 : 0)),
								"upgrader" : getUpgradersForRCL(this.room.controller.level),
								"repairer" : 0,
								"builder" : -1,
								"miner" : -1,
								"soloKeeperMiner" : -1,
								"soloCentreMiner" : -1,
								"pioneer" : -1,
								"dismantler" : -1,
								"coreDismantler" : -1,
								"labTech" : 0,
								"keeperHarvester2" : this.room.keeperHarvestRooms.length * 3,
								// "keeperGuard2" : -1,
								// "keeperGuard2" : Memory.inactiveSourceKeepers ? 0 : (this.room.energyCapacityAvailable >= 4270 ? this.room.keeperHarvestRooms.length : 0),
								};

			this.requiredCounts = {"baseManager" : getBaseManagersForRCL(this.room.effectiveLevel) > 0 ? (this.room.energyCapacityAvailable > 300 ? 1 : 0) : 0,
									"harvester" : (Memory.tick < 1000 ? 1 : roomIntel.getNumSources(this.room.name)), // Early game don't build a 1 work one.
									"fetcher" : 1,
									"repairer" : this.room.defcon <= 1 && this.room.effectiveLevel > 2 ? 1 : 0,
									"sbs": hasSBC ? 4 : 0,
									"ss": this.room.storage ? 1 : 0,
									"scout" : this.room.controller.level <= 2 && Game.myRooms.length == 1 ? (Memory.tick > 240 ? 1 : 0) : 0,
									"upgrader" : this.room.controller.ticksToDowngrade < 1000 ? 1 : 0
								};

			this.designs = {
							"sbs": this.room.controller.level < 7 ? [CARRY, MOVE] : (this.room.controller.level == 7 ? [CARRY, CARRY, MOVE] : [CARRY, CARRY, CARRY, CARRY, MOVE]),
							 };

			this.extraMemory = {
							"repairer": {boostOnDanger: 1, targetBoosts: {"LH": -1}},
							"upgrader": Memory.economyArena ? {targetBoosts: {"XGH2O": -1}} : {},
							"pioneer": {targetBoosts: {"LH": -1}},
							"allyPioneer": {targetBoosts: {"LH": -1}},
							"bHarvester": {targetBoosts: {"UO": -1}},
							// "intershardPioneer": {targetBoosts: {"LH": -1}},
							"builder": {targetBoosts: (this.room.effectiveLevel < this.room.controller.level) ? {"LH": -1} : {}},
			};
			if (this.room.processingPower) {
				this.requiredCounts["powerShuffler"] = 1
			}
			if (Memory.preEmptiveDefense && (this.room.defcon != 5 || Memory.ignoreDefconForPremtiveDefense)) {
				this.targetCounts["labTech"] = 1
			}

			this.extraPriority = {};

			if (Memory.season5) {
				this.targetCounts["season5ThoriumMiner"] = -1
				if (this.room.mem.claimToUnclaimRoom && !this.room.terminal && this.room.extractor && this.room.effectiveLevel >= 6) {
					//this.targetCounts["season5UnclaimEmptier"] = 1
				} else if (this.room.mem.claimToUnclaimRoom && this.room.terminal && this.room.extractor) {
					this.extraPriority["season5ThoriumMiner"] = 50
				}
			}

			this.room.spawnFixedValues = {};
			this.room.spawnFixedValues.targetCounts = this.targetCounts;
			this.room.spawnFixedValues.requiredCounts = this.requiredCounts;
			this.room.spawnFixedValues.designs = this.designs;
			this.room.spawnFixedValues.extraMemory = this.extraMemory;
			this.room.spawnFixedValues.extraPriority = this.extraPriority;
		}
	}


	StructureSpawn.prototype.addPrioritySpawn = function(role, extraMemory, name, body) {
		this.room.memory.priorityBuilds = this.room.memory.priorityBuilds || {}
		this.room.memory.priorityBuildsTicks = this.room.memory.priorityBuildsTicks || {}
		this.room.memory.postBuildExtraMemory = this.room.memory.postBuildExtraMemory || {}

		if (!this.room.memory.priorityBuilds[role]) this.room.memory.priorityBuilds[role] = 0;

		// Not sure why this happens.
		if (this.room.memory.priorityBuilds[role] < 0) this.room.memory.priorityBuilds[role] = 0

		// Fuck off.
		// Tanks for swarm
		// Powerfetch for small hauler mutliple banks
		if (this.room.memory.priorityBuilds[role] > (role == "tank" ? 200 : role == "powerFetcher" ? 40 : 20)) {
			console.log("Attempting to create a mega queue for:", role, this.room.name)
			this.room.memory.priorityBuilds[role] = (role == "tank" ? 200 : role == "powerFetcher" ? 40 : 20);
			return;
		}

		// console.log(role, JSON.stringify(extraMemory), name, body)

		this.room.memory.priorityBuilds[role] += 1;
		this.room.memory.priorityBuildsTicks[role] = Game.time;
		this.room.memory.postBuildExtraMemory[role] = this.room.memory.postBuildExtraMemory[role] || [];

		if (extraMemory) {
			this.room.memory.postBuildExtraMemory[role].push(extraMemory);
		}
		else {
			this.room.memory.postBuildExtraMemory[role].push({});
		}

		this.room.memory.overrideName = this.room.memory.overrideName || {};
		this.room.memory.overrideName[role] = this.room.memory.overrideName[role] || [];

		if (name) {
			this.room.memory.overrideName[role].push(name);
		}
		else {
			this.room.memory.overrideName[role].push("");
		}

		this.room.memory.overrideBody = this.room.memory.overrideBody || {};
		this.room.memory.overrideBody[role] = this.room.memory.overrideBody[role] || [];

		if (body) {
			this.room.memory.overrideBody[role].push(body);
		}
		else {
			this.room.memory.overrideBody[role].push([]);
		}
	}

	StructureSpawn.prototype.hasPrioritySpawn = function(role, extraMemory) {
		// console.log(this.room.memory.priorityBuilds[role])
		if (!this.room.memory.priorityBuilds[role] || this.room.memory.priorityBuilds[role] == 0) {
			return false;
		}

		if (!extraMemory && this.room.memory.priorityBuilds[role] && this.room.memory.priorityBuilds[role] > 0) {
			return true;
		}

		// Not neccessarily perfect.
		// if (extraMemory && !this.room.memory.postBuildExtraMemory[role].length) {
		// 	return false;
		// }

		if (extraMemory && this.room.memory.postBuildExtraMemory[role]) {
			for (let i = 0; i < this.room.memory.postBuildExtraMemory[role].length; i++) {
				if (JSON.stringify(this.room.memory.postBuildExtraMemory[role][i]) == JSON.stringify(extraMemory)) {
					return true;
				}
			}
		}
		else if (!extraMemory) {
			return true;
		}
		return false;
	}

	StructureSpawn.prototype.removePrioritySpawnByName = function(removeName) {
		// All we know is the name, so lets dig into overrideName and try to find it
		let mem = this.room.memory;

		let removeRole;
		let removeIdx;
		mem.overrideName = mem.overrideName || {};
		for (let role in mem.overrideName) {
			for (let nameIdx in mem.overrideName[role]) {
				let name = mem.overrideName[role][nameIdx];
				if (name === removeName) {
					removeRole = role;
					removeIdx = nameIdx;
					break
				}
			}
			if (removeRole) {
				break;
			}
		}

		if (removeRole === undefined || removeIdx === undefined) {
			return;
		}

		mem.postBuildExtraMemory[removeRole].splice(removeIdx, 1);
		mem.overrideName[removeRole].splice(removeIdx, 1);
		mem.overrideBody[removeRole].splice(removeIdx, 1);

		if (mem.postBuildExtraMemory[removeRole].length == 0) {
			mem.postBuildExtraMemory[removeRole] = undefined;
		}

		if (mem.overrideName[removeRole].length == 0) {
			mem.overrideName[removeRole] = undefined;
		}

		if (mem.overrideBody[removeRole].length == 0) {
			mem.overrideBody[removeRole] = undefined;
		}


		mem.priorityBuilds[removeRole] = Math.max(mem.priorityBuilds[removeRole] - 1, 0);
	}

	StructureSpawn.prototype.clearPowerRangerPrioritySpawns = function(teamIdx) {
		let mem = this.room.memory;
		if (!mem.postBuildExtraMemory) {
			mem.postBuildExtraMemory = {}
		}
		if (!mem.postBuildExtraMemory["powerHealer"]) {
			mem.postBuildExtraMemory["powerHealer"] = [];
		}
		if (!mem.postBuildExtraMemory["powerTank"]) {
			mem.postBuildExtraMemory["powerTank"] = [];
		}
		if (!mem.postBuildExtraMemory["powerHealerMini"]) {
			mem.postBuildExtraMemory["powerHealerMini"] = [];
		}
		if (!mem.postBuildExtraMemory["powerTankMini"]) {
			mem.postBuildExtraMemory["powerTankMini"] = [];
		}

		if (!mem.postBuildExtraMemory["powerGuard"]) {
			mem.postBuildExtraMemory["powerGuard"] = [];
		}
		if (!mem.postBuildExtraMemory["powerGuardMini"]) {
			mem.postBuildExtraMemory["powerGuardMini"] = [];
		}

		var index;
		while ((index = mem.postBuildExtraMemory["powerHealer"].indexOf(teamIdx)) >= 0) {
			mem.postBuildExtraMemory["powerHealer"].splice(teamIdx, 1)
			mem.priorityBuilds["powerHealer"] -= 1;
		}
		while ((index = mem.postBuildExtraMemory["powerTank"].indexOf(teamIdx)) >= 0) {
			mem.postBuildExtraMemory["powerTank"].splice(teamIdx, 1)
			mem.priorityBuilds["powerTank"] -= 1;
		}
		while ((index = mem.postBuildExtraMemory["powerHealerMini"].indexOf(teamIdx)) >= 0) {
			mem.postBuildExtraMemory["powerHealerMini"].splice(teamIdx, 1)
			mem.priorityBuilds["powerHealerMini"] -= 1;
		}
		while ((index = mem.postBuildExtraMemory["powerTankMini"].indexOf(teamIdx)) >= 0) {
			mem.postBuildExtraMemory["powerTankMini"].splice(teamIdx, 1)
			mem.priorityBuilds["powerTankMini"] -= 1;
		}
		while ((index = mem.postBuildExtraMemory["powerGuard"].indexOf(teamIdx)) >= 0) {
			mem.postBuildExtraMemory["powerGuard"].splice(teamIdx, 1)
			mem.priorityBuilds["powerGuard"] -= 1;
		}
		while ((index = mem.postBuildExtraMemory["powerGuardMini"].indexOf(teamIdx)) >= 0) {
			mem.postBuildExtraMemory["powerGuardMini"].splice(teamIdx, 1)
			mem.priorityBuilds["powerGuardMini"] -= 1;
		}
	}


	// sourceSpawn is the spawn that wanted the creep. this is the spawn that's spawning it.
	StructureSpawn.prototype.newSpawn = function(sourceSpawn, role, budget, force, extraMemory) {
		if (this.room.memory.buildTick && this.room.memory.buildTick == Game.time) return;

		if (sourceSpawn == this) {
			this.spawnUsed = true;
		}

		extraMemory = _.clone(extraMemory)

		let srcRoomMem = sourceSpawn.room.memory

		let designOpts = {}

		if (role == "bHarvester") {
			console.log("Something is spawning a bHarvester directly")
		}

		// TODO: THIS IS WRONG WRONG WRONG
		// We can't change the role in here as all my priority build arrays will get fucked up.
		// I need to rewrite most of this mess.

		let actualRole = role

		// Do we want to boost
		if (sourceSpawn == this && global.useHarvestBoost && (role == "harvester" || role == "bHarvester")) {
			let boost = sourceSpawn.room.getAvailableBoost(util.isHarvestBoost, 34 * LAB_BOOST_MINERAL)
			// 34 is probably too high but.. eh.
			if (boost) {
				sourceSpawn.room.requestAvailableBoost(boost)
				designOpts.boost = boost
				actualRole = "bHarvester"
				extraMemory.targetBoosts = {[boost]: -1}
			}
		}

		if (sourceSpawn == this && global.useHarvestBoost && (role == "soloKeeperMiner" || role == "miner")) {
			let boost = sourceSpawn.room.getAvailableBoost(util.isHarvestBoost, 40 * LAB_BOOST_MINERAL)
			if (boost) {
				sourceSpawn.room.requestAvailableBoost(boost)
				extraMemory.targetBoosts = extraMemory.targetBoosts || {}
				extraMemory.targetBoosts[boost] = -1
				designOpts.boost = boost
			}
		}


		// console.log(this, sourceSpawn, role, budget, force, extraMemory)

		var result;
		var name;

		if (sourceSpawn.extraMemory[role]) {
			Object.assign(extraMemory, sourceSpawn.extraMemory[role])
		}

		srcRoomMem.postBuildExtraMemory = srcRoomMem.postBuildExtraMemory || {}
		srcRoomMem.postBuildExtraMemory[role] = srcRoomMem.postBuildExtraMemory[role] || [];

		srcRoomMem.overrideName = srcRoomMem.overrideName || {}
		srcRoomMem.overrideName[role] = srcRoomMem.overrideName[role] || []

		srcRoomMem.overrideBody = srcRoomMem.overrideBody || {}
		srcRoomMem.overrideBody[role] = srcRoomMem.overrideBody[role] || []


		if (srcRoomMem.postBuildExtraMemory[role].length > 0) {
			Object.assign(extraMemory, srcRoomMem.postBuildExtraMemory[role][0])
		}

		// if (role == "depositMiner") {
		// 	console.log(role, "spawn extraMemory", JSON.stringify(extraMemory))
		// }

		// These were ordered a long time ago. They're meant to spawn then renew, but no 
		// longer than maxRenewTime. Spawning after maxRenewTime is not on...
		// So just early exit out of the spawn and clear them from the queue
		if (extraMemory.maxRenewTime !== undefined && Game.time > extraMemory.maxRenewTime) {
			if (srcRoomMem.postBuildExtraMemory[role].length > 0) {
				srcRoomMem.postBuildExtraMemory[role].shift()
			}
			if (srcRoomMem.overrideName[role].length > 0) {
				srcRoomMem.overrideName[role].shift()
			}
			if (srcRoomMem.overrideBody[role].length > 0) {
				srcRoomMem.overrideBody[role].shift()
			}

			if (srcRoomMem.postBuildExtraMemory[role].length == 0) {
				srcRoomMem.postBuildExtraMemory[role] = undefined;
			}

			if (srcRoomMem.overrideName[role].length == 0) {
				srcRoomMem.overrideName[role] = undefined;
			}

			if (srcRoomMem.overrideBody[role].length == 0) {
				srcRoomMem.overrideBody[role] = undefined;
			}

			return OK
		}

		if (role == "depositMiner" && extraMemory.targetBoosts) {
			designOpts.boost = Object.keys(extraMemory.targetBoosts)[0]
		}

		// if (role == "depositMiner") {
		// 	console.log(role, "spawn designOpts", JSON.stringify(designOpts))
		// }


		// Don't auto-spawn into dangerous rooms
		if (["harvester", "doubleHarvester", "centralHarvester", "bHarvester"].includes(role) && extraMemory && extraMemory.tLoc && extraMemory.tLoc.roomName) {
			var roomName = extraMemory.tLoc.roomName;
			if (Memory.rooms[roomName]) {
				if ((Game.rooms[roomName] && Game.rooms[roomName].dangerous == 2) || Memory.rooms[roomName].DT >= 0.5) {
					delete extraMemory.tLoc;
					delete extraMemory.hSource;
				}
			}
		}


		if (srcRoomMem.overrideName[role].length > 0 && srcRoomMem.overrideName[role][0].length > 0) {
			name = srcRoomMem.overrideName[role][0];
		}
		else {
			name = getNameForRole(actualRole);
		}


		// Override the upgrader spec
		if (role == "upgrader") {
			if ((this.room.storage && this.room.storage.store[RESOURCE_ENERGY] < constants.ROOM_ENERGY_CHEAP_UPGRADERS / (this.room.upgradeFocus ? 2 : 1)) ||
				(this.room.effectiveLevel >= 6 && this.room.defcon <= 3 && (!global.roomOverNuked || !global.roomOverNuked[this.room.name])) ||
				(this.room.effectiveLevel == 7 && Memory.noRCL8) || 
				(this.room.restrictUpgraders && this.room.storage && this.room.storage.store[RESOURCE_ENERGY] < constants.ROOM_ENERGY_MAX_RESTRICT_UPGRADERS)) {
				sourceSpawn.designs["upgrader"] = [WORK,CARRY,MOVE];
			}
			else if (sourceSpawn.room.controller.level == 8) {
				if (Memory.season2 && Game.gcl.level >= constants.SEASON_TARGET_GCL) {
					sourceSpawn.designs["upgrader"] = [WORK,CARRY,MOVE];
				}
				// 15W, 3C, 4M
				else if (Memory.stats.avgBucket > 9000) {
					sourceSpawn.designs["upgrader"] = [WORK,WORK,WORK,WORK,WORK,
										 		WORK,WORK,WORK,WORK,WORK,
												WORK,WORK,WORK,WORK,
												CARRY,
												MOVE,MOVE,MOVE,MOVE,WORK];
				}
				else {
					sourceSpawn.designs["upgrader"] = [WORK,WORK,WORK,WORK,WORK,
										 		WORK,WORK,WORK,WORK,WORK,
												WORK,WORK,WORK,WORK,
												CARRY,CARRY,
												MOVE,MOVE,MOVE,MOVE,WORK];					
				}
			}
			else if (sourceSpawn.room.effectiveLevel < sourceSpawn.room.controller.level &&
					 sourceSpawn.room.controller.progress / sourceSpawn.room.controller.progressTotal < 0.9) {
				sourceSpawn.designs["upgrader"] = [WORK,CARRY,MOVE];
			}
		}


		let altDesign = 0;
		/*if (["harvester", "doubleHarvester", "centralHarvester", "bHarvester"].includes(role) && extraMemory.hSource && extraMemory.tLoc && (extraMemory.tLoc.roomName == sourceSpawn.room.name || (Memory.season3 && roomIntel.getNumSources(roomName) == 1))) {
			// I don't much like this but here it is
			let room = Game.rooms[extraMemory.tLoc.roomName]
			if (extraMemory.tLoc.roomName == sourceSpawn.room.name && sourceSpawn.room.controller.isPowerEnabled) {
				altDesign = 1;
				let powerLevel = -1;
				let sources = sourceSpawn.room.find(FIND_SOURCES);
				for (let source of sources) {
					if (!source.effects) continue;

					for (let effect of source.effects) {
						if (effect.power == PWR_REGEN_SOURCE) {
							powerLevel = Math.max(powerLevel, effect.level)
						}
					}
				}

				for (let powerCreepName of (sourceSpawn.room.memory.assignedPowerCreeps || [])) {
					let pc = Game.powerCreeps[powerCreepName]
					if (!pc || !pc.room || !pc.powers[PWR_REGEN_SOURCE]) continue

					powerLevel = Math.max(powerLevel, pc.powers[PWR_REGEN_SOURCE].level)
				}

				if (sourceSpawn.room.memory.lastRegenSourceUsed && Game.time - sourceSpawn.room.memory.lastRegenSourceUsed.t < 1500) {
					powerLevel = Math.max(powerLevel, sourceSpawn.room.memory.lastRegenSourceUsed.l)
				}

				if (powerLevel >= 0) {
					console.log("Spawning", actualRole, "with power level", sourceSpawn.room, powerLevel)
					// Game.notify("Spawning harvester with power level" + sourceSpawn.room + " " + powerLevel)
					designOpts.powerLevel = powerLevel - 1;
				}

			}
			if (Memory.season3) {
				designOpts.singleSourceRoom = roomIntel.getNumSources(extraMemory.tLoc.roomName) == 1
				if (designOpts.singleSourceRoom) {
					console.log("Spawning", actualRole, "for single source room", sourceSpawn.room)
				}
				else {
					console.log("Spawning", actualRole, "for two source room", sourceSpawn.room)				
				}
			}
		}*/
		if (["harvester", "doubleHarvester", "centralHarvester", "bHarvester"].includes(role) && extraMemory.hSource && extraMemory.tLoc) {
			let powerLevel = -1

			let PCLevel = - 1
			for (let powerCreepName of (sourceSpawn.room.mem.assignedPowerCreeps || [])) {
				let pc = Game.powerCreeps[powerCreepName]
				if (!pc || !pc.room || !pc.powers[PWR_REGEN_SOURCE]) continue

				PCLevel = Math.max(PCLevel, pc.powers[PWR_REGEN_SOURCE].level)
			}

			// For owned rooms assume any assigned power creep will boost up the source.
			if (extraMemory.tLoc.roomName == sourceSpawn.room.name) {
				altDesign = 1;
				powerLevel = Math.max(powerLevel, PCLevel)

				// Not really sure what this was for
				// if (sourceSpawn.room.memory.lastRegenSourceUsed && Game.time - sourceSpawn.room.memory.lastRegenSourceUsed.t < 1500) {
				// 	powerLevel = Math.max(powerLevel, sourceSpawn.room.memory.lastRegenSourceUsed.l)
				// }
			}
			// For unowned, assume any boost applied will continue
			else if (Game.rooms[extraMemory.tLoc.roomName]) {
				let sources = Game.rooms[extraMemory.tLoc.roomName].find(FIND_SOURCES);
				for (let source of sources) {
					if (source.id != extraMemory.hSource) continue
					if (!source.effects) continue;

					for (let effect of source.effects) {
						if (effect.power == PWR_REGEN_SOURCE) {
							powerLevel = Math.max(PCLevel, powerLevel, effect.level)
						}
					}
				}
			}

			// Hit in the last 2k ticks, assume it'll be hit again
			if (Memory.rooms[extraMemory.tLoc.roomName] && 
				Memory.rooms[extraMemory.tLoc.roomName].lastRegenSourceUsed && 
				Memory.rooms[extraMemory.tLoc.roomName].lastRegenSourceUsed[extraMemory.hSource] &&
				Game.time - Memory.rooms[extraMemory.tLoc.roomName].lastRegenSourceUsed[extraMemory.hSource].t < 2000) {
				powerLevel = Math.max(powerLevel, Memory.rooms[extraMemory.tLoc.roomName].lastRegenSourceUsed[extraMemory.hSource].l)
			}

			if (powerLevel >= 0) {
				console.log("Spawning", actualRole, "with power level", sourceSpawn.room, powerLevel)
				// Game.notify("Spawning harvester with power level" + sourceSpawn.room + " " + powerLevel)
				designOpts.powerLevel = powerLevel - 1;
			}

			if (Memory.season3) {
				designOpts.singleSourceRoom = roomIntel.getNumSources(extraMemory.tLoc.roomName) == 1
				if (designOpts.singleSourceRoom) {
					console.log("Spawning", actualRole, "for single source room", sourceSpawn.room)
				}
				else {
					console.log("Spawning", actualRole, "for two source room", sourceSpawn.room)				
				}
			}
		}
		else if (role == 'fetcher') {
			if (sourceSpawn.room.mem.workFetcher == undefined) {
				sourceSpawn.room.mem.workFetcher = 0
			}
			srcRoomMem.workFetcher += 1

			if (!sourceSpawn.room.mem.phatHaulers) {
				designOpts.medium = sourceSpawn.room.mem.mediumHaulers;
				designOpts.small = sourceSpawn.room.mem.smallHaulers;
				designOpts.verySmall = sourceSpawn.room.mem.verySmallHaulers;
			}

			if (sourceSpawn.room.mem.phatHaulers) {
				designOpts.phatHaulers = 1;

				console.log(sourceSpawn.room, "spawning phat haulers")

				if (sourceSpawn.room.effectiveLevel >= 7) {
					srcRoomMem.workFetcher %= 5
					altDesign = srcRoomMem.workFetcher == 1 ? 2 : 0;
				}
				else {
					srcRoomMem.workFetcher %= 2;
					altDesign = srcRoomMem.workFetcher;
				}
			}
			else if (designOpts.medium || designOpts.small || designOpts.verySmall) {
				designOpts.effectiveNumSpawns = sourceSpawn.room.spawns.length

				let powerMod = 1;
				let PCLevel = -1
				for (let powerCreepName of (sourceSpawn.room.mem.assignedPowerCreeps || [])) {
					if (Game.powerCreeps[powerCreepName].room && Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN]) {
						if (Memory.season && Game.powerCreeps[powerCreepName].level < 9) {
							continue
						}
						else {
							PCLevel = Math.max(PCLevel, Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN].level)
						}
					}
				}

				if (Memory.season3) {			
					if (sourceSpawn.room.mem.lastOpSpawnUsed && Game.time - sourceSpawn.room.mem.lastOpSpawnUsed.t < 1500) {
						PCLevel = Math.max(PCLevel, sourceSpawn.room.mem.lastOpSpawnUsed.l)
					}
					for (let spawn of sourceSpawn.room.spawns) {
						for (let effect of (spawn.effects || [])) {
							if (effect.effect == PWR_OPERATE_SPAWN) {
								PCLevel = Math.max(PCLevel, effect.level)
							}
						}
					}
				}

				if (PCLevel > 0) {
					powerMod = POWER_INFO[PWR_OPERATE_SPAWN].effect[PCLevel - 1]
				}

				designOpts.effectiveNumSpawns /= powerMod

				// 50% seems to work well
				if (sourceSpawn.room.effectiveLevel == 7) {
					srcRoomMem.workFetcher %= 5
					altDesign = srcRoomMem.workFetcher == 1 ? 1 : 0;
				}
				else if (sourceSpawn.room.effectiveLevel == 8) {
					srcRoomMem.workFetcher %= 8
					altDesign = srcRoomMem.workFetcher == 1 ? 2 : 0;
				}
				else {
					srcRoomMem.workFetcher %= 2;
					altDesign = srcRoomMem.workFetcher;
				}
			}
			else {
				// 50% seems to work well
				if (sourceSpawn.room.effectiveLevel == 7) {
					srcRoomMem.workFetcher %= 5
					altDesign = srcRoomMem.workFetcher == 1 ? 2 : 0;
				}
				else if (sourceSpawn.room.effectiveLevel == 8) {
					srcRoomMem.workFetcher %= 8
					altDesign = srcRoomMem.workFetcher == 1 ? 3 : 0;
				}
				else {
					srcRoomMem.workFetcher %= 2;
					altDesign = srcRoomMem.workFetcher;
				}
			}
		}
		// Cheapo. Probably saves me 1 energy/tick/room when I think I don't need a big base manager.
		else if (role == "baseManager" && !Memory.season3 && sourceSpawn.room.defcon == 5 && (sourceSpawn.room.effectiveLevel == 8 || sourceSpawn.room.restrictUpgraders) && !sourceSpawn.room.upgradeFocus && !combatManager.hasActiveMissionsFromRoom(sourceSpawn.room.name)) {
			altDesign = 1;
		}
		else if (role == "ss") {
			// Stuff is getting full
			if (((sourceSpawn.room.storage && sourceSpawn.room.storage.store.getUsedCapacity() > STORAGE_CAPACITY * 0.8) || 
											 (sourceSpawn.room.terminal && sourceSpawn.room.terminal.store.getUsedCapacity() > TERMINAL_CAPACITY * 0.8) ||
											 (sourceSpawn.room.factory && sourceSpawn.room.factory.store.getUsedCapacity() > FACTORY_CAPACITY * 0.8))) {
				altDesign = 1;
			}
			else if (Memory.stats.avgBucket > 7500 && Game.cpu.bucket > 7500) {
				let cheap = 0
				if ((sourceSpawn.room.mem.ownedCreeps["upgrader"] || []).length == 0) {
					cheap++
				}
				if (sourceSpawn.room.mem.spawnUtilization < 0.7) {
					cheap++
				}
				if (sourceSpawn.room.mem.spawnUtilization < 0.35) {
					cheap++
				}
				if (Memory.stats.extensionEnergy[sourceSpawn.room.name] > 0.95) {
					cheap++
				}
				if (cheap && (sourceSpawn.room.mem.upgradersStarved || 0) > 0) {
					cheap--
				}

				// We need to ship energy out
				if (cheap && sourceSpawn.room.restrictUpgraders) {
					cheap--
				}

				if (cheap) {
					designOpts.cheap = cheap;
				}
			}
		}
		else if (role == "labTech" && (sourceSpawn.room.mem.combatBoostsPending || Game.time - (sourceSpawn.room.mem.spawningHeavyMission || -2000) < 2000)) {
			altDesign = 1;
		}
		else if (role == "builder") {
			// Lets assume 1 work part working half the time. That's 2.5 energy/tick. Boost then saves us 1.25 energy/tick. Call it 0.5 as builders often fall back to repairers
			if (sourceSpawn.room.mem.avgImportValues && sourceSpawn.room.mem.avgImportValues["LH"] * LAB_BOOST_MINERAL + sourceSpawn.room.mem.energyPrice * LAB_BOOST_ENERGY < sourceSpawn.room.mem.energyPrice * 0.5 * CREEP_LIFE_TIME) {				
				let boost = sourceSpawn.room.getAvailableBoost(util.isCheapRepairBoost, 20 * LAB_BOOST_MINERAL)
				if (boost) {
					sourceSpawn.room.requestAvailableBoost(boost)
					extraMemory.targetBoosts = extraMemory.targetBoosts || {}
					extraMemory.targetBoosts[boost] = -1
					designOpts.boost = boost

					delete extraMemory.boostOnDanger
				}
			}
			// If we're not mining because we have to much, probably want to use it.
			else if (global.notMining && Game.time - (global.notMining["L"] || 0) < 500 &&  Game.time - (global.notMining["H"] || 0) < 500) {
				let boost = sourceSpawn.room.getAvailableBoost(util.isCheapRepairBoost, 30 * LAB_BOOST_MINERAL)
				if (boost) {
					sourceSpawn.room.requestAvailableBoost(boost)
					extraMemory.targetBoosts = extraMemory.targetBoosts || {}
					extraMemory.targetBoosts[boost] = -1
					designOpts.boost = boost

					delete extraMemory.boostOnDanger
				}
			}
		}
		else if (role == "repairer") {
			// Lets assume 1 work part working half the time. That's .5 energy/tick. Boost then saves us 0.25 energy/tick. Call it 0.2.
			if (sourceSpawn.room.mem.avgImportValues && sourceSpawn.room.mem.avgImportValues["LH"] * LAB_BOOST_MINERAL + sourceSpawn.room.mem.energyPrice * LAB_BOOST_ENERGY < sourceSpawn.room.mem.energyPrice * 0.2 * CREEP_LIFE_TIME) {				
				let boost = sourceSpawn.room.getAvailableBoost(util.isCheapRepairBoost, 30 * LAB_BOOST_MINERAL)
				if (boost) {
					sourceSpawn.room.requestAvailableBoost(boost)
					extraMemory.targetBoosts = extraMemory.targetBoosts || {}
					extraMemory.targetBoosts[boost] = -1
					designOpts.boost = boost

					delete extraMemory.boostOnDanger
				}
			}
			// If we're not mining because we have to much, probably want to use it.
			else if (global.notMining && Game.time - (global.notMining["L"] || 0) < 500 &&  Game.time - (global.notMining["H"] || 0) < 500) {
				let boost = sourceSpawn.room.getAvailableBoost(util.isCheapRepairBoost, 30 * LAB_BOOST_MINERAL)
				if (boost) {
					sourceSpawn.room.requestAvailableBoost(boost)
					extraMemory.targetBoosts = extraMemory.targetBoosts || {}
					extraMemory.targetBoosts[boost] = -1
					designOpts.boost = boost

					delete extraMemory.boostOnDanger
				}
			}
		}
		else if (role == "pioneer" && extraMemory.targetRoom) {
			let sR = roomIntel.getRealSwampRatio(extraMemory.targetRoom)

			if (sR > 0.6) {
				designOpts.swampy = true
			}
		}
		if (role == "baseManager") {
			designOpts.extensionEnergy = Memory.stats.extensionEnergy[sourceSpawn.room.name]
			designOpts.smallHaulers = sourceSpawn.room.mem.smallHaulers || sourceSpawn.room.mem.verySmallHaulers
			designOpts.restrictUpgraders = sourceSpawn.room.effectiveLevel == 8 || sourceSpawn.room.restrictUpgraders

			designOpts.lotsOfUpgrading = 0
			if (sourceSpawn.room.upgradeFocus) {
				designOpts.lotsOfUpgrading++
			}
			if (Memory.highEnergyUpgrading) {
				designOpts.lotsOfUpgrading++	
			}
			if ((sourceSpawn.room.mem.upgradersStarved || 0) > 0) {
				designOpts.lotsOfUpgrading++
			}
			if (Memory.season3 && sourceSpawn.room.effectiveLevel >= 5 && sourceSpawn.room.effectiveLevel < 7 && sourceSpawn.room.powerSpawn && global.processingPower) {
				designOpts.lotsOfUpgrading++
			}
			if (Memory.season3) {
				for (let powerCreepName of (sourceSpawn.room.mem.assignedPowerCreeps || [])) {
					if (Game.powerCreeps[powerCreepName].room && Game.powerCreeps[powerCreepName].level < 9) {
						designOpts.lotsOfUpgrading--
					}
				}
				if (sourceSpawn.room.powerSpawn && (sourceSpawn.room.powerSpawn.effects || []).length) {
					designOpts.lotsOfUpgrading++		
					designOpts.lotsOfUpgrading++		
				}
			}

			if (Memory.season5 && this.room.mem.claimToUnclaimRoom) {
				designOpts.lotsOfUpgrading += 5
			}

			if (this.room.powerSpawn && this.room.powerSpawn.isActive() && Memory.stats.processingPower[this.room.name] > 0.1) {
				designOpts.lotsOfUpgrading++
			}
		}

		var willUseRoads = this.room.effectiveLevel > 3 ||
						  (this.room.effectiveLevel == 3 && this.room.controller.level == 3 && this.room.controller.progress > CONTROLLER_LEVELS[3] / (this.room.find(FIND_MY_CONSTRUCTION_SITES).length ? 2 : 10) && this.room.controller.progress < this.room.controller.progressTotal * 1.05);

		// console.log(this.room, willUseRoads)

		// Make it move at regular speed over plains when unloaded
		if (role == "repairer" && (sourceSpawn.room.dangerous || sourceSpawn.room.mem.DT > 0.5 || sourceSpawn.room.mem.attackScore)) { 
			willUseRoads = false
		}
		if (Memory.season5 && role == "season5ThoriumMiner" && !this.room.mem.claimToUnclaimRoom) { 
			willUseRoads = false
		}

		Memory.creepCount += 1
		Memory.creepCount %= 10000

		let highUtilization = this.room.memory.spawnUtilization > HIGH_UTIL_THRESH || _.sum(_.values(this.room.memory.priorityBuilds)) > 2;

		var design;
		if (srcRoomMem.overrideBody[role].length > 0 && srcRoomMem.overrideBody[role][0].length > 0) {
			design = srcRoomMem.overrideBody[role][0];
		}
		else {
			if (sourceSpawn == this) {
				design = sourceSpawn.designs[actualRole]
				if (!design) {
					design = creepCreator.getDesignForEnergyCap(actualRole, sourceSpawn.room.energyCapacityAvailable * (budget ? getBudgetPercentageForRole(actualRole) : 1), highUtilization, altDesign, willUseRoads, designOpts);
				}
			}
			else {
				// We're trying to request something from a room with less capcilty.
				if (sourceSpawn.room.energyCapacityAvailable > this.room.energyCapacityAvailable) {
					design = this.designs[actualRole];
					if (!design) {
						design = creepCreator.getDesignForEnergyCap(actualRole, this.room.energyCapacityAvailable * (budget ? getBudgetPercentageForRole(actualRole) : 1), highUtilization, altDesign, willUseRoads, designOpts);
					}
				}
				else {
					// As a higher enery room lets slightly overfeed. If we do it too much it'll skew the census, but that's not a huge issue.
					let targetEnergy = Math.min(Math.round(sourceSpawn.room.energyCapacityAvailable * 2), this.room.energyCapacityAvailable);
					design = sourceSpawn.designs[actualRole]
					if (!design) {
						design = creepCreator.getDesignForEnergyCap(actualRole, targetEnergy * (budget ? getBudgetPercentageForRole(actualRole) : 1), highUtilization, altDesign, willUseRoads, designOpts);
					}
				}
			}
		}



		let spawnBatteryCentre = roomAI.getSpawnBatteryCentre(this.room.name);

		let directions;
		if (roomAI.hasSpawnBatteryContainers(this.room)) {
			if (this.pos.x < spawnBatteryCentre.x) {
				directions = [TOP_LEFT, LEFT, BOTTOM_LEFT, BOTTOM];
			}
			else if (this.pos.x > spawnBatteryCentre.x) {
				directions = [TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM];
			}
			else if (this.pos.y > spawnBatteryCentre.y) {
				directions = [BOTTOM, BOTTOM_LEFT, BOTTOM_RIGHT];
			}
		}

		if (false && (role.startsWith("powerTank") || role.startsWith("powerHealer") || role.startsWith("powerGuard"))) {
			var teamIdx = extraMemory.teamIdx;
			// if (this.room.name == "W1N84") console.log(role, JSON.stringify(extraMemory), Memory.powerRangers.length, teamIdx)

			if (Memory.powerRangers.length > teamIdx) {
				// This happened when a third party helped in clearing out the spawn, meaning the timing went wrong.
				// We *should* clear the requests as soon as the power rangers power down, but this wasn't working 100%
				if (Memory.powerRangers[teamIdx]) {
					result = this.spawnCreep(design, name, {memory: Object.assign({role: role, spawn : sourceSpawn.id, sR : sourceSpawn.room.name}, extraMemory),
											energyStructures: this.room.getSpawnEnergyStructures(),
											directions: directions });


					if (result == OK) {
						powerRangerAI.addCreep(Memory.powerRangers[teamIdx], role, name);
					}
				}
				else {
					console.log("Weirdness in power rangers spawn", role, srcRoomMem.priorityBuilds[role], Memory.powerRangers.length, teamIdx, JSON.stringify(extraMemory))
					if (srcRoomMem.postBuildExtraMemory[role].length > 0) {
						srcRoomMem.postBuildExtraMemory[role].shift()
					}
					srcRoomMem.priorityBuilds[role] -= 1;
					return -999;
				}
			}
			else {
				// Don't spawn anything. Something weird is happening.
				console.log("Weirdness in spawn", role, srcRoomMem.priorityBuilds[role], Memory.powerRangers.length, teamIdx, extraMemory, JSON.stringify(extraMemory))
				if (srcRoomMem.postBuildExtraMemory[role].length > 0) {
					srcRoomMem.postBuildExtraMemory[role].shift()
				}
				sourceSpawn.room.memory.priorityBuilds[role] -= 1;
				return -999;
			}
		}

		else {
			// console.log(JSON.stringify(design), name, Object.assign({role: role, spawn : sourceSpawn.id, sR : sourceSpawn.room.name}, extraMemory))
			result = this.spawnCreep(design, name, {memory: Object.assign({role: actualRole, sR : sourceSpawn.room.name}, extraMemory),
													energyStructures: this.room.getSpawnEnergyStructures(),
													directions: directions });
			// console.log(design, name, JSON.stringify({memory: Object.assign({role: role, spawn : sourceSpawn.id, sR : sourceSpawn.room.name}, extraMemory),
			// 										energyStructures: this.room.getSpawnEnergyStructures() }));

			if (result == OK) {
				// console.log(this.name + " " + result);
			}
			else if (force) {
				// console.log("Forced spawn", role, sourceSpawn.room.name)

				design = creepCreator.getDesignForEnergyCap(actualRole, sourceSpawn.room.energyAvailable, this.room.memory.spawnUtilization > HIGH_UTIL_THRESH, altDesign, willUseRoads, designOpts);
				if (design.length > 0) {
					result = this.spawnCreep(design,
											 name,
											 {memory: Object.assign({role: actualRole, sR : sourceSpawn.room.name}, extraMemory),
											  energyStructures: this.room.getSpawnEnergyStructures(),
											  directions: directions });

				}
			}
		}


		// console.log(this.name + " " + role + " " + result);
		if (result == OK) {
			if (srcRoomMem.postBuildExtraMemory[role].length > 0) {
				srcRoomMem.postBuildExtraMemory[role].shift()
			}
			if (srcRoomMem.overrideName[role].length > 0) {
				srcRoomMem.overrideName[role].shift()
			}
			if (srcRoomMem.overrideBody[role].length > 0) {
				srcRoomMem.overrideBody[role].shift()
			}

			if (srcRoomMem.postBuildExtraMemory[role].length == 0) {
				srcRoomMem.postBuildExtraMemory[role] = undefined;
			}

			if (srcRoomMem.overrideName[role].length == 0) {
				srcRoomMem.overrideName[role] = undefined;
			}

			if (srcRoomMem.overrideBody[role].length == 0) {
				srcRoomMem.overrideBody[role] = undefined;
			}


			// console.log(this.name + " " + role + " " + result);
			if (sourceSpawn == this) {
				this.memory.currentBuildingRole = role;
			}
			else {
				sourceSpawn.memory.currentBuildingRemoteRole = role;
				sourceSpawn.memory.remoteAvailableTick = Game.time + 1 + design.length * 3;
				sourceSpawn.memory.remoteSpawnTick = Game.time
			}


			// Wake up our spawn managers to refill extensions
			// Note this happens before the creep runs, so it's not aware of changes to energy in structures
			// This is why we wake it next tick
			var baseManagers = this.room.memory.ownedCreeps["baseManager"] || []
			for (var baseManagerName of baseManagers) {
				if (Game.creeps[baseManagerName].mem.f == 2) {
					Game.creeps[baseManagerName].mem.f = 1
				}

				// As per above comment, won't work as it doesn't know about changes to energy.
				// For this reason we send it to sleep for this tick. It'll wake up next tick
				// and look for a fresh drop target.
				if (Game.creeps[baseManagerName].mem.dTgt) {
					delete Game.creeps[baseManagerName].mem.dTgt
					Game.creeps[baseManagerName].mem.wT = Game.time + 1
				}
				// Wake next tick
				else if (Game.creeps[baseManagerName].mem.wT == Game.time) {
					Game.creeps[baseManagerName].mem.wT = Game.time + 1
				}
				else {
					// Don't put it to sleep if it's already awake and not caught above
					Game.creeps[baseManagerName].mem.wT = Math.min(Game.creeps[baseManagerName].mem.wT || 0, Game.time + 1);
				}
			}

			var spawnBatterySitters = this.room.memory.ownedCreeps["sbs"] || []
			for (var spawnBatterySitterName of spawnBatterySitters) {
				if (Game.creeps[spawnBatterySitterName].mem.wT == Game.time) {
					Game.creeps[spawnBatterySitterName].mem.wT = Game.time + 1
				}
				else {
					// Don't put it to sleep if it's already awake!
					Game.creeps[spawnBatterySitterName].mem.wT = Math.min(Game.creeps[spawnBatterySitterName].mem.wT || 0, Game.time + 1);
				}
			}

			// Only one spawn per tick. Todo: Fix!
			this.room.memory.buildTick = Game.time;

			delete this.room.memory.notEnoughEnergyToSpawn

			// We won't catch them all, but mark this one invalid
			if (global.energyTargets && global.energyTargets[this.room]) {
				delete global.energyTargets[this.room];
			}
		}

		if (result == ERR_INVALID_ARGS && design.length > 0 && design.length <= MAX_CREEP_SIZE) {
			console.log("Bad args in spawn", this.name, name, result, role, design)
		}
		else if (result == ERR_INVALID_ARGS && (design.length == 0 || design.length > MAX_CREEP_SIZE)) {
			if (design.length > MAX_CREEP_SIZE) {
				console.log("Bad args in spawn, too long design", this.name, name, result, role, design)
			}
			else {
				console.log("Bad args in spawn, zero length design", this.name, name, result, role, design)
			}
			if (srcRoomMem.postBuildExtraMemory[role].length > 0) {
				srcRoomMem.postBuildExtraMemory[role].shift()
			}
			if (srcRoomMem.overrideName[role].length > 0) {
				srcRoomMem.overrideName[role].shift()
			}
			if (srcRoomMem.overrideBody[role].length > 0) {
				srcRoomMem.overrideBody[role].shift()
			}

			if (srcRoomMem.priorityBuilds[role] > 0) {
				srcRoomMem.priorityBuilds[role] -= 1;
			}
		}
		else if (result == ERR_NOT_ENOUGH_ENERGY && this.room.energyCapacityAvailable == this.room.energyAvailable) {
			console.log("Design trying to use more energy than capacity", this.name, result, role, design)

			if (this.room.energyCapacityAvailable < util.getECostForDesign(design)) {
				console.log("Design was always invalid. Destroyed extensions?")
				if (srcRoomMem.postBuildExtraMemory[role].length > 0) {
					console.log(JSON.stringify(srcRoomMem.postBuildExtraMemory[role]))
					srcRoomMem.postBuildExtraMemory[role].shift()
				}
				if (srcRoomMem.overrideName[role].length > 0) {
					console.log(srcRoomMem.overrideName[role])
					srcRoomMem.overrideName[role].shift()
				}
				if (srcRoomMem.overrideBody[role].length > 0) {
					console.log(srcRoomMem.overrideBody[role])
					srcRoomMem.overrideBody[role].shift()
				}

				if (srcRoomMem.priorityBuilds[role] > 0) {
					console.log(srcRoomMem.priorityBuilds[role])
					srcRoomMem.priorityBuilds[role] -= 1;
				}
			}
			// While upgrading energyStructures can go out of date, making the spawn fail as we don't pass enough extensions.
			delete global.spawnEnergyStructures[this.room.name]
			this.room.clearStructuresCache()

		}
		else if (result == ERR_NOT_ENOUGH_ENERGY && !budget) {
			result = this.newSpawn(sourceSpawn, role, true, force, extraMemory);
			if (result == ERR_NOT_ENOUGH_ENERGY) {
				this.room.mem.notEnoughEnergyToSpawn = 1
			}
		}
		return result;
	}



	// Figures out what we want to build and if we can, builds it.
	StructureSpawn.prototype.spawnPass1 = function(roomSpawns, finalSpawn) {
		// Only one spawn per tick. Todo: Fix!
		var alreadySpawnedInRoom = this.room.memory.buildTick && this.room.memory.buildTick == Game.time;
		this.spawnSkipped = false;

		// I think this is not quite accurate, but it'll do
		this.spawnUsed = !!this.spawning;

		if (alreadySpawnedInRoom) {
			this.spawnSkipped = 1;
			return
		}

		// Active is checked elsewhere
		var spawnAvailable = !(this.spawning) && this.room.energyCapacityAvailable >= 50 //&& this.isActive();

		// A previous remote request is still executing.
		if (!spawnAvailable && this.memory.remoteSpawnTick && Game.time < this.memory.remoteAvailableTick) {
			this.spawnSkipped = 1;
			return;
		}
		else if (!this.memory.remoteSpawnTick || Game.time > this.memory.remoteAvailableTick) {
			this.memory.currentBuildingRemoteRole = ""
		}

		if (spawnAvailable && this.room.memory.requestRenew >= Game.time - 1) {
			delete this.room.memory.requestRenew;
			return;
		}

		// Don't remote request from anything but the final spawn
		if (!spawnAvailable && !finalSpawn) {
			this.spawnSkipped = true;
			return;
		}

		// Nukes incoming. Just sit tight.
		if (this.room.memory.nukeLandTime !== undefined && this.room.memory.nukeLandTime - Game.time < 200 && this.room.memory.nukeLandTime - Game.time >= 0) return;

		// random squared means this doesn't fire very often

		// We'd be looking for remote spawns. Don't do this very often.
		if (this.spawning) {
			if (this.spawning.remainingTime === 0) {
				for (let creep of this.pos.findInRange(FIND_MY_CREEPS, 2)) {
					if (creep.mem.role != "sbs" && (!creep.mem.path || creep.mem.path.length <= 2)) {
						creep.move(Math.ceil(Math.random() * 8))
						creep.myMoveTo = function(target, targetRange, useCache, options) {};
					}
				}
			}
			if ((6 - this.room.defcon) * (Game.cpu.bucket - 500) / 9500 < Math.sqrt(Math.random())) {
				this.spawnSkipped = true;
				return;
			}
		}

		let heavy = Game.time - (this.room.memory.spawningHeavyMission || -2000) < 2000


		if (!heavy && (6 - this.room.defcon) * (Game.cpu.bucket - 500) / 9500 < Math.random() * Math.random() && this.room.mem.spawnUtilization < 0.8) {
			this.spawnSkipped = true;
			return;
		}

		// If the last spawn in the room is not available, try for a remote spawn.
		// Note: this is allowed to remote spawn if a different spawn here didn't trigger due to lack
		// of energy: useful if we're locally energy starved.

		// if (!spawnAvailable) {
		// 	var bestroomSpawn = null;
			// Remote spawning costs some CPU. Cut it when we're really low
		// 	if (Game.cpu.bucket >= 500) {
		// 		bestroomSpawn = getBestroomSpawn(this)
		// 	}
		// 	if (!bestroomSpawn) return
		// }

		this.initFixedValues();

		let roomMemory = this.room.memory;

		// Initialise memory
		// this.room.memory.initialized = false;
		// if (!spawnAvailable) {
		// 	return;
		// }
		// else {
		// 	this.memory.currentBuildingRole = ""
		// }
		var lastRole = null;
		if (spawnAvailable) {
			lastRole = this.memory.currentBuildingRole;
			this.memory.currentBuildingRole = ""
		}

		var willUseRoads = this.room.effectiveLevel > 3 ||
						  (this.room.effectiveLevel == 3 && this.room.controller.level == 3 && this.room.controller.progress > CONTROLLER_LEVELS[3] / (this.room.find(FIND_MY_CONSTRUCTION_SITES).length ? 2 : 10) && this.room.controller.progress < this.room.controller.progressTotal * 1.05);


		// console.log(this.room, willUseRoads)

		// var anyPriorities = false;
		// for (var role of roles) {
		// 	if (roomMemory.priorityBuilds[role]) {
		// 		anyPriorities = true;
		// 		break;
		// 	}
		// }
		// if (!anyPriorities) {
		// 	delete roomMemory.priorityBuilds
		// 	delete roomMemory.postBuildExtraMemory
		// }
		// if (this.room.name == "W16S17") {
		// 	console.log(this.room.name, "a")
		// }

		roomMemory.priorityBuilds = roomMemory.priorityBuilds || {}
		roomMemory.ownedCreeps = roomMemory.ownedCreeps || {}

		var lackingRequired = false;
		if (!this.room.noUsefulSpawns) {
			// for (var role of roles) {
			for (var role in this.requiredCounts) {
				// console.log(role, this.requiredCounts[role])
				if (!this.requiredCounts[role]) continue;
				if (!roomMemory.ownedCreeps[role]) roomMemory.ownedCreeps[role] = []

				var currentOfRole;

				let sharedHarvesterRoles = ["harvester", "bHarvester"]
				let isHarvester = ["harvester", "keeperHarvester2", "doubleHarvester", "centralHarvester", "bHarvester"].includes(role)

				if (role != "sbs" && !isHarvester) {
					currentOfRole = _.filter(roomMemory.ownedCreeps[role],
						function(creepName) {
							if (!Game.creeps[creepName]) return false;
							if (Game.creeps[creepName].spawning) return true;


							var design = creepCreator.getDesignForEnergyCap(role, this.room.energyCapacityAvailable, roomMemory.spawnUtilization > HIGH_UTIL_THRESH, false, willUseRoads)
							let ttlLimit = ((design.length + Game.creeps[creepName].body.length) / 2) * 3 + 10;

							if (Memory.season3 && role == "powerShuffler") {
								ttlLimit += 150
							}

							return Game.creeps[creepName].ticksToLive > ttlLimit
						},
						this
					).length;
				}
				else if (sharedHarvesterRoles.includes(role)) {
					currentOfRole = (roomMemory.ownedCreeps["harvester"] || []).length + (roomMemory.ownedCreeps["bHarvester"] || []).length
				}
				else {
					currentOfRole = roomMemory.ownedCreeps[role].length;
				}

				if (role == "fetcher" && (roomMemory.ownedCreeps["harvester"] || []).length + (roomMemory.ownedCreeps["bHarvester"] || []).length == 0) {
					continue
				}

				for (var roomSpawn of roomSpawns) {
					if (sharedHarvesterRoles.includes(role)) {
						if (sharedHarvesterRoles.includes(roomSpawn.memory.currentBuildingRole) || sharedHarvesterRoles.includes(lastRole)) {
							currentOfRole += 1;
						}
						if (sharedHarvesterRoles.includes(roomSpawn.memory.currentBuildingRemoteRole)) {
							currentOfRole += 1;
						}
					}
					else {									
						// console.log(roomSpawn.memory.currentBuildingRole, roomSpawn.memory.currentBuildingRemoteRole)
						if (roomSpawn.memory.currentBuildingRole == role || lastRole == role) {
							currentOfRole += 1;
						}
						if (roomSpawn.memory.currentBuildingRemoteRole == role) {
							currentOfRole += 1;
						}
					}
				}

				if (this.memory.currentBuildingRemoteRole == role) {
					currentOfRole += 1;
				}

				// We need to meet this or the whole thing will fall apart.
				if (currentOfRole < this.requiredCounts[role]) {

					var reassignedToRole = false;
					if (role == "harvester" && currentOfRole == 0) {
						// Don't need a cheapo harvester if we have pioneers
						if (roomMemory.ownedCreeps["pioneer"] && roomMemory.ownedCreeps["pioneer"].length) {
							continue
						}
						var convertingCreepName;
						if (roomMemory.ownedCreeps["builder"] && roomMemory.ownedCreeps["builder"].length > 0) {
							convertingCreepName = roomMemory.ownedCreeps["builder"][0];
						}
						else if (roomMemory.ownedCreeps["repairer"] && roomMemory.ownedCreeps["repairer"].length > 0) {
							convertingCreepName = roomMemory.ownedCreeps["repairer"][0];
						}
						else if (roomMemory.ownedCreeps["upgrader"] && roomMemory.ownedCreeps["upgrader"].length > 0) {
							convertingCreepName = roomMemory.ownedCreeps["upgrader"][0];
						}

						// Don't convert helpers
						if (convertingCreepName && Game.creeps[convertingCreepName] && !Game.creeps[convertingCreepName].memory.ID) {
							_.pull(roomMemory.ownedCreeps[Game.creeps[convertingCreepName].memory.role], convertingCreepName)
							Game.creeps[convertingCreepName].memory.role = "harvester";
							roomMemory.ownedCreeps["harvester"].push(convertingCreepName);
							reassignedToRole = true;
						}
					}
					else if (role == "baseManager" && (roomMemory.ownedCreeps[role].length == 0 || (roomMemory.attackScore > 2000000 && roomMemory.ownedCreeps[role].length == 1))) {
						if (this.room.controller.level == 2 && this.room.extensions.length == 0) {
							continue
						}

						var convertingCreepName;
						if (roomMemory.ownedCreeps["fetcher"] && roomMemory.ownedCreeps["fetcher"].length > 1) {
							for (let creepName of roomMemory.ownedCreeps["fetcher"]) {
								if (Game.creeps[creepName] &&
									!Game.creeps[creepName].memory.ID &&
									Game.creeps[creepName].room.name == this.room.name && _.sum(Game.creeps[creepName].carry) == 0) {
									convertingCreepName = creepName;
									break;
								}
							}
						}

						if (convertingCreepName && Game.creeps[convertingCreepName]) {
							_.pull(roomMemory.ownedCreeps[Game.creeps[convertingCreepName].memory.role], convertingCreepName)
							Game.creeps[convertingCreepName].memory.role = "baseManager";
							roomMemory.ownedCreeps["baseManager"].push(convertingCreepName);
							reassignedToRole = true;
						}
					}
					else if (role == "repairer" && this.room.calcEffectiveEnergy() < constants.ROOM_ENERGY_NO_REPAIRERS) {
						continue
					}
					// else if (role == "scout" && this.room.storage && this.room.calcEffectiveEnergy() < 50000) {
					// 	continue
					// }
					// I've no idea why this existed!
					// else if (currentOfRole && this.room.dangerous) {
					// 	continue
					// }

					if (reassignedToRole) {
						continue;
					}

					lackingRequired = true;
					if (!alreadySpawnedInRoom) {
						if (spawnAvailable)	{
							var result = this.newSpawn(this, role, true, true, {});
							for (var roomSpawn of roomSpawns) {
								roomSpawn.spawnUsed = true;
							}

							// console.log(this.room.name, this, role, result)


							// Only break if we've created one, otherwise we should check over required roles.
							if (result == OK) {
								if (roomMemory.priorityBuilds[role] > 0) {
									roomMemory.priorityBuilds[role] -= 1;
									if (roomMemory.priorityBuilds[role] == 0) {
										delete roomMemory.postBuildExtraMemory[role];
										delete roomMemory.priorityBuilds[role];
										delete roomMemory.overrideName[role];
										delete roomMemory.overrideBody[role];
									}
								}
								return;
							}
						}
						// We return if we spawn
						if (role != "reserver" &&
							role != "miner" &&
							role != "soloKeeperMiner" &&
							role != "soloCentreMiner" &&
							role != "upgrader" &&
							role != "baseManager" &&
							role != "sbs" &&
							role != "ss" &&
							role != "tankChildRoom" &&
							role != "rangedChildRoom" &&
							role != "healerChildRoom" &&
							role != "pioneer") {
							this.room.remoteRequestRole = role;
						}
					}
				}
			}
		}


		// Don't waste stuff/slots on other things.
		if (lackingRequired) {
			for (var roomSpawn of roomSpawns) {
				roomSpawn.spawnUsed = true;
			}
			return;
		}
		var targetRole = "";
		var maxPriority = 0;

		// Now look for priority builds. Create the highest priority.
		// Don't build lower priorities ones just because we can.
		if (!this.room.noUsefulSpawns) {
			if (!alreadySpawnedInRoom) {				
				// No double harvester. It doesn't set replaced?
				let harvesterRoles = ["bHarvester", "harvester", "centralHarvester", "keeperHarvester2"]

				let keys = Object.keys(roomMemory.priorityBuilds || [])

				for (let role of keys) {
					if (roomMemory.priorityBuilds[role] > 0) {
						// If the last one for this role was more than 1000 ticks ago.
						// It's probably no longer relevent. We've certainly not managed "priority!"
						if (Game.time - roomMemory.priorityBuildsTicks[role] > 1000) {
							roomMemory.priorityBuilds[role] = 0

							console.log(this.room.name, "clearing priority builds for", role)

							// Clean this through 
							for (let name of roomMemory.overrideName[role]) {
								if (name.length) {
									combatManager.clearCreepNameFromSpawning(name)
								}
							}


							delete roomMemory.postBuildExtraMemory[role];
							delete roomMemory.priorityBuilds[role];
							delete roomMemory.overrideName[role];
							delete roomMemory.overrideBody[role];
							delete roomMemory.priorityBuildsTicks[role];
							continue
						}


						if (harvesterRoles.includes(role)) {
							let alreadyTaken = false;
							// Are we spawning for a particular source?
							if (roomMemory.postBuildExtraMemory[role] && roomMemory.postBuildExtraMemory[role].length >= 1) {
								let mem = roomMemory.postBuildExtraMemory[role][0];
								if (mem && mem.hSource) {
									// Is there any other creep on that source?
									// If so, don't spawn
									for (let otherRole of harvesterRoles) {								
										for (let otherHarvester of (roomMemory.ownedCreeps[otherRole] || [])) {
											// if (Game.creeps[otherHarvester] && Game.creeps[otherHarvester].mem.hSource == mem.hSource && (Game.creeps[otherHarvester].ticksToLive > 300 || !Game.creeps[otherHarvester].mem.replaced)) {
											if (Game.creeps[otherHarvester] && Game.creeps[otherHarvester].mem.hSource == mem.hSource && !Game.creeps[otherHarvester].mem.replaced) {
												alreadyTaken = true;
												if (roomMemory.postBuildExtraMemory[role].length > 0) {
													roomMemory.postBuildExtraMemory[role].shift()
												}
												if (roomMemory.overrideName[role].length > 0) {
													roomMemory.overrideName[role].shift()
												}
												if (roomMemory.overrideBody[role].length > 0) {
													roomMemory.overrideBody[role].shift()
												}

												if (roomMemory.postBuildExtraMemory[role].length == 0) {
													roomMemory.postBuildExtraMemory[role] = undefined;
												}
												if (roomMemory.overrideName[role].length == 0) {
													roomMemory.overrideName[role] = undefined;
												}
												if (roomMemory.overrideBody[role].length == 0) {
													roomMemory.overrideBody[role] = undefined;
												}
												break;
											}
										}
									}
								}
								if (alreadyTaken) {
									break;
								}
							}
							if (alreadyTaken) {
								continue;
							}
						}
						// These can block the queue because it sees it has a lot of priority builds
						// but supress fetchers has overridden that!
						else if (role == "fetcher" && (roomMemory.supressFetchers || 0) >= 100 && Math.random() < 0.25) {
							roomMemory.priorityBuilds[role]--
							if (roomMemory.postBuildExtraMemory[role].length > 0) {
								roomMemory.postBuildExtraMemory[role].shift()
							}
							if (roomMemory.overrideName[role].length > 0) {
								roomMemory.overrideName[role].shift()
							}
							if (roomMemory.overrideBody[role].length > 0) {
								roomMemory.overrideBody[role].shift()
							}

							if (roomMemory.postBuildExtraMemory[role].length == 0) {
								roomMemory.postBuildExtraMemory[role] = undefined;
							}
							if (roomMemory.overrideName[role].length == 0) {
								roomMemory.overrideName[role] = undefined;
							}
							if (roomMemory.overrideBody[role].length == 0) {
								roomMemory.overrideBody[role] = undefined;
							}

							continue
						}

						// Small random term is meant to balance out creeps of same priority
						var priority = roomMemory.priorityBuilds[role] * 10 + Math.random() / 10;
						priority -= (roomMemory.ownedCreeps[role] || []).length;

						priority += (defaultPriority[role] || 1);

						if (Memory.season3 && role == "powerShuffler") {
							priority += 100
						}

						if (role == "labTech") priority += 200;
						if (role == "fetcher" && (roomMemory.supressFetchers || 0) > 0) {
							priority -= roomMemory.supressFetchers
						}

						priority *= (0.95 + Math.random() * 0.1);

						if (priority > maxPriority) {
							maxPriority = priority;
							targetRole = role;
						}
					}
				}

				if (maxPriority > 0) {
					if (spawnAvailable) {
						var result = this.newSpawn(this, targetRole, false, false, {});
						for (var roomSpawn of roomSpawns) {
							roomSpawn.spawnUsed = true;
						}

						if (result == OK) {
							roomMemory.priorityBuilds[targetRole] -= 1;
							// Not sure why this is needed. Not sure it is.
							if (roomMemory.priorityBuilds[targetRole] == 0) {
								delete roomMemory.postBuildExtraMemory[targetRole];
								delete roomMemory.priorityBuilds[targetRole];
								delete roomMemory.overrideName[targetRole];
								delete roomMemory.overrideBody[targetRole];
								delete roomMemory.priorityBuildsTicks[targetRole];
							}
							return;
						}
					}
				}
			}

			// Need energy for high priority, don't use it on renewing/other spawns
			if (maxPriority > 0) return
		}


		// if (this.room.name == "W16S17") {
		// 	console.log(this.room.name, this.room.defcon)
		// }

		// Renew before regular spawns as it's more time efficient.
		// The tricky bit is when I want to upgrade.
		// I guess I should compare target body against body.
		if (Math.random() < 0.1 || Game.cpu.bucket > (this.room.mem.spawnUtilization > 0.8 ? 2500 : 9500)) {
			if (!this.effects || !this.effects.length) {
				var nearbyFriends = this.pos.findInRange(FIND_MY_CREEPS, 1, {
					filter: (friend) => {
						return (friend.ticksToLive && friend.ticksToLive > 50 && friend.mem.role != "recycler" && friend.mem.role != "reserver" && friend.mem.role != "miner")
					}
				});


				if (nearbyFriends.length > 0) {
					for (var friend of nearbyFriends) {
						// var currentOfRole = roomMemory.ownedCreeps[friend.memory.role] || 0

						// for (var roomSpawn of roomSpawns) {
							// if (roomSpawn.memory.currentBuildingRole == role) {
								// currentOfRole += 1;
							// }
							// if (roomSpawn.memory.currentBuildingRemoteRole == role) {
								// currentOfRole += 1;
							// }
						// }

						// if (this.targetCounts[friend.memory.role] && currentOfRole <= this.targetCounts[friend.memory.role]) {
							var canRenew = true;

							if (friend.ticksToLive >= CREEP_LIFE_TIME - Math.floor(600 / friend.body.length)) {
								canRenew = false;
							}
							else if ((friend.mem.maxRenewTime || Infinity) < Game.time) {
								canRenew = false;
							}
							// Whatever mission it was on is no longer valid. Let it go.
							else if (friend.mem.ID === 0) {
								canRenew = false;
							}
							else if (friend.mem.role == "sbs") {
								if (friend.mem.inP === undefined) {
									canRenew = false;

								}
								else if (creepCreator.getDesignForEnergyCap("sbs", this.room.energyCapacityAvailable, false, false, false).length != friend.body.length) {
									canRenew = false;
								}
							}
							// I guess I will want them around, and I want to consume energy so the fetchers can be used again
							else if (this.room.effectiveLevel >= 3 && ((this.room.mem.supressFetchers || 0) > 0) && friend.mem.role == "fetcher") {
								canRenew = false;
							}
							else if ((this.room.mem.mediumHaulers || this.room.mem.smallHaulers || this.room.mem.verySmallHaulers) && 
									 friend.mem.role == "fetcher") {
								if (creepCreator.getDesignForEnergyCap(friend.mem.role, this.room.energyCapacityAvailable, false, false, willUseRoads, {small: this.room.mem.smallHaulers, verySmall: this.room.mem.verySmallHaulers}).length != friend.body.length) {
									canRenew = false;
									// console.log("Not renewing small hauler", friend, this.room)
								}
							}
							else if (friend.mem.role == "season2ScoreShuffler") {
								canRenew = false;
							}
							else if (friend.mem.role == "keeperGuard2") {
								canRenew = false;
							}
							// Don't renew crappy creeps
							else if (creepCreator.getDesignForEnergyCap(friend.mem.role, this.room.energyCapacityAvailable, false, false, willUseRoads).length >= friend.body.length * 2) {
								// console.log("Not renewing regular hauler", friend, this.room)
								canRenew = false;
							}


							if (!canRenew) {
								continue;
							}

							var boosted = false;
							for (var bodyPart of friend.body) {
								if (bodyPart.boost) {
									boosted = true;
									break;
								}
							}

							if (!boosted && canRenew) {
								if (this.renewCreep(friend) == OK) {
									let ticksLived = CREEP_LIFE_TIME - friend.ticksToLive
									let ticksRenewed = Math.floor(600 / friend.body.length)

									friend.mem.c = friend.mem.c * (1 - ticksRenewed / ticksLived)

									// friend.mem.c = 0; // Not true, but otherwise we suicide renewed creeps a bit to violently.
									this.spawnUsed = true
									return;
								}
							}
						// }
					}
				}
			}
		}

		if (alreadySpawnedInRoom) return;

		// This loop isn't cheap. It doesn't matter much if we drop a few ticks from the spawning cycle here and there.
		let repairOnly = false;
		if (Game.cpu.bucket / 10000 < Math.random() && this.room.mem.spawnUtilization < 0.8) {
			if ((6 - this.room.defcon) * Game.cpu.bucket / 10000 < Math.random() * 2) {
				repairOnly = true;
			}
			else {
				return;
			}
		}
		// console.log(this.room.name, this.room.noUsefulSpawns, lackingRequired)

		// global.targetCountsForRole1 = global.targetCountsForRole1 || {};
		// global.targetCountsForRole1[this.room.name] = global.targetCountsForRole1[this.room.name] || {};

		// global.targetCountsForRole2 = global.targetCountsForRole2 || {};
		// global.targetCountsForRole2[this.room.name] = global.targetCountsForRole2[this.room.name] || {};

		if (!this.room.noUsefulSpawns) {
			var targetExtraMemory = {};

			let spawnRoles = repairOnly ? ["repairer"] : autoSpawnRoles

			let effectiveEnergy
			let effectiveEnergyNT

			let maxHate

			for (var role of spawnRoles) {
				if (role != "scout" && this.room.energyAvailable < 100) {
					continue;
				}

				let targetCount;
				let extraMemory = {};
				let extraPriority = 0;

				// In some cases, usually when we're sending something to a speicfic
				// room, we're not checking the target count but instead a delta,
				// so target count will tend to be less than we actually need. We
				// should not subtract owned in this case.
				let alreadyCheckedOwned = false;



				if (role == "reserver" && this.room.energyCapacityAvailable >= 650) {
					targetCount = 0;

					// Census doesn't work well if we're checking for remotes. End up with targetCount=0 in real cases.
					// if (!roomMemory.reserverCensusTick || Game.time - roomMemory.reserverCensusTick > 100) {
						// Do a reserver census
						for (var roomName of this.room.goodRooms) {
							if (Game.rooms[roomName]) {
								let room = Game.rooms[roomName];

								if (!room.controller) {
									continue
								}
								if (room.controller.reservation && ((room.controller.reservation.ticksToEnd > 1000 && this.room.energyCapacityAvailable >= 1300) || room.controller.reservation.ticksToEnd > 1500)) {
									continue
								}
								if (/*room.memory.DT > 0.5 ||*/ room.dangerous > 1) {
									continue
								}
								if (room.controller.owner) {
									continue
								}

								if (Memory.season2 && roomName == "W17N6") {
									continue
								}

								let targetForRoom = this.room.energyCapacityAvailable > 1300 ? 1 : Math.min(3, room.controller.pos.countAccessibleTiles());


								// Ok, we want a reserver there.
								var reservers = roomMemory.ownedCreeps["reserver"] || [];
								var cnt = 0;
								for (var reserverName of reservers) {
									var creep = Game.creeps[reserverName]
									if (creep && creep.memory.targetRoom == roomName) {
										cnt++
										if (cnt >= targetForRoom) {
											break;
										}
									}
								}

								if (cnt < targetForRoom) {
									targetCount = targetForRoom - cnt;
									extraMemory = {"targetRoom": roomName}
									if (!room.controller.reservation) {
										extraPriority = 45;
									}
									break;
								}
							}
						// }
						// roomMemory.reserverCensusTick = Game.time;
					}
					alreadyCheckedOwned = true;
				}
				else if (role == "pioneer") {
					targetCount = 0;
					if (roomMemory.spawnUtilization > 0.98 && Math.random() > 0.1) continue

					if (effectiveEnergy === undefined) effectiveEnergy = this.room.calcEffectiveEnergy();
					if (effectiveEnergy < constants.ROOM_ENERGY_NO_PIONEERS) continue


					roomMemory.childRooms = roomMemory.childRooms || [];

					// I think this works for multiple child rooms but it may not.
					// It may not work for one child room any more :)
					var pioneers = roomMemory.ownedCreeps["pioneer"] || [];

					for (var childRoom of _.shuffle(roomMemory.childRooms)) {
						var takenCount = 0;
						var requiredCount = 0


						// Lets wait until things have settled down.

						if (!Game.rooms[childRoom]) {
							continue;
						}
						else if (Game.rooms[childRoom].dangerous) {
							continue;
						}
						// Not sure what this does. I guess I don't count bHarvesters below
						else if (Game.rooms[childRoom].effectiveLevel >= 6) {
							continue;
						}

						if (Game.rooms[childRoom].controller.my && (Game.rooms[childRoom].effectiveLevel < 3 || Game.rooms[childRoom].find(FIND_MY_SPAWNS).length == 0)) {
							if (Game.rooms[childRoom].effectiveLevel != Game.rooms[childRoom].controller.level) {
								extraPriority = 50;
							}
							else {
								extraPriority = 25;
							}
							requiredCount = Game.rooms[childRoom].effectiveLevel == 1 ? 3 : 1;
							if (takenCount > 0) extraPriority /= 2;
						}
						// This shouldn't happen, but if it does help a buddy out
						else if (Game.rooms[childRoom].controller.my && (!Game.rooms[childRoom].mem.ownedCreeps || (Game.rooms[childRoom].mem.ownedCreeps["harvester"] || []).length < 1)) {
							requiredCount = 1;
						}

						if (this.room.effectiveLevel < 4) {
							requiredCount = requiredCount * 2;
						}
						// It's all swampy, that's annoying, get more
						let sR = roomIntel.getRealSwampRatio(childRoom)

						if (sR > 0.6) {
							requiredCount = requiredCount * 2;	
						}							

						for (var pioneerName of pioneers) {
							var creep = Game.creeps[pioneerName]
							if (creep && creep.mem.targetRoom == childRoom && creep.ticksToLive > 150) {
								takenCount++;
							}
						}
						if (Memory.rooms[childRoom].ownedCreeps) {							
							for (var pioneerName of (Memory.rooms[childRoom].ownedCreeps["pioneer"] || [])) {
								var creep = Game.creeps[pioneerName]
								if (creep && creep.ticksToLive > 150) {
									takenCount++;
								}
							}
						}

						if (takenCount < requiredCount) {
							if (safeRoute.getSafeRouteCost(this.room.name, childRoom, true) > 20) {
								continue;
							}
							extraMemory = {"targetRoom": childRoom}
							targetCount = requiredCount - takenCount;


							break;
						}
					}
					alreadyCheckedOwned = true;
				}
				else if (role == "safeModeGenerator") {
					targetCount = 0;
					if (roomMemory.spawnUtilization > 0.98 && Math.random() > 0.1) continue

					if (effectiveEnergy === undefined) effectiveEnergy = this.room.calcEffectiveEnergy();
					if (effectiveEnergy < Math.min(constants.ROOM_ENERGY_NO_CHILD_ROOM_CREEPS, constants.ROOM_ENERGY_NO_PIONEERS)) continue


					roomMemory.childRooms = roomMemory.childRooms || [];


					for (var childRoom of _.shuffle(roomMemory.childRooms)) {
						// Lets wait until things have settled down.

						if (!Game.rooms[childRoom]) {
							continue;
						}
						else if (Game.rooms[childRoom].dangerous) {
							continue;
						}
						else if (Game.rooms[childRoom].controller.safeModeAvailable) {
							continue;
						}
						else if (Game.rooms[childRoom].terminal || Game.rooms[childRoom].controller.level < 3) {
							continue;
						}
						else if (!this.room.terminal || this.room.terminal.store.getUsedCapacity(RESOURCE_GHODIUM) < 2000) {
							continue
						}

						targetCount = 1;
						extraMemory = {"targetRoom": childRoom}
						break;
					}
				}
				else if (role == "transporter") {
					targetCount = 0;
					// These are very inefficient on spawn util
					if (roomMemory.spawnUtilization > 0.8) continue
					if (Game.gcl.level < 5 && this.room.effectiveLevel < 7) continue
					if (Game.gcl.level < 3) continue

					if (effectiveEnergy === undefined) effectiveEnergy = this.room.calcEffectiveEnergy();

					if (effectiveEnergy < constants.ROOM_ENERGY_NO_TRANSPORTERS) continue
					if (!this.room.terminal) continue

					roomMemory.childRooms = roomMemory.childRooms || [];

					let transporters = roomMemory.ownedCreeps["transporter"] || [];

					for (var childRoom of _.shuffle(roomMemory.childRooms)) {
						var takenCount = 0;
						var requiredCount = 0


						// Lets wait until things have settled down.
						if (!Game.rooms[childRoom]) {
							continue;
						}
						else if (Game.rooms[childRoom].dangerous) {
							continue;
						}
						else if (Game.rooms[childRoom].controller.my && (Game.rooms[childRoom].storage || (Game.rooms[childRoom].memory.supressFetchers || 0) <= 0) && !Game.rooms[childRoom].terminal && Game.rooms[childRoom].effectiveLevel >= 3) {
							if (!Game.rooms[childRoom].storage || Game.rooms[childRoom].storage.store[RESOURCE_ENERGY] < effectiveEnergy) {
								requiredCount = 1;
							}
						}

						for (var transporterName of transporters) {
							var creep = Game.creeps[transporterName]
							if (creep && creep.memory.targetRoom == childRoom) {
								takenCount++;
							}
						}
						// console.log(childRoom, takenCount, requiredCount, Game.rooms[childRoom].controller.my, Game.rooms[childRoom].storage, Game.rooms[childRoom].effectiveLevel)

						if (takenCount < requiredCount) {
							if (safeRoute.getSafeRouteCost(this.room.name, childRoom, true) > 20) {
								continue;
							}
							extraMemory = {"targetRoom": childRoom}
							targetCount = requiredCount - takenCount;
							break;
						}
					}

					// console.log("transporter", this.room, targetCount, JSON.stringify(extraMemory))

					alreadyCheckedOwned = true;
				}
				else if (role == "tankChildRoom" || role == "healerChildRoom" || role == "rangedChildRoom") {
					roomMemory.childRooms = roomMemory.childRooms || [];

					if (roomMemory.spawnUtilization > 0.975 && Math.random() > 0.1) continue
					if (effectiveEnergy === undefined) effectiveEnergy = this.room.calcEffectiveEnergy();
					if (effectiveEnergy < constants.ROOM_ENERGY_NO_CHILD_ROOM_CREEPS) continue

					maxHate = maxHate || intelAI.getMaxHate()

					for (var childRoom of _.shuffle(roomMemory.childRooms)) {
						if (maxHate < 3000) {
							if (Math.random() < 0.0001) console.log(this.room, "Skipping child room defense due to very low max hate")
							targetCount = 0
							continue
						}
						else if (maxHate < 10000 && Game.rooms[childRoom] && (Game.rooms[childRoom].effectiveLevel || 0) >= 6) {
							if (Math.random() < 0.0001) console.log(this.room, "Skipping child room defense due to very low max hate")
							targetCount = 0
							continue
						}
						if (role == "healerChildRoom") {
							targetCount = 0
							continue
						}

						if (Memory.rooms[childRoom]) {
							Memory.rooms[childRoom].ownedCreeps = Memory.rooms[childRoom].ownedCreeps || [];
							var current = Memory.rooms[childRoom].ownedCreeps[role] || [];
							// That's not what we're for
							if ((Memory.rooms[childRoom].hostileBoostedCreeps || 0) >= 4 && Memory.empireStrength < 10) {
								targetCount = 0;
								continue
							}

							targetCount = 0;
							let takenCount = 0;
							let takenIdCount = 0;
							let requiredCount = 0

							if (Game.rooms[childRoom] && (Game.rooms[childRoom].effectiveLevel || 0) >= this.room.effectiveLevel) {
								continue;
							}
							if (Game.rooms[childRoom] && (Game.rooms[childRoom].effectiveLevel || 0) >= 7) {
								continue
							}

							let routeCost = safeRoute.getSafeRouteCost(this.room.name, childRoom, true, true);

							// What is this step for? Can't we just count owned creeps?
							for (var name of current) {
								var creep = Game.creeps[name]
								if (creep && creep.memory.sR == childRoom && ((creep.ticksToLive > 300 + routeCost * 50) || creep.ticksToLive === undefined)) {
									takenCount++;
									if (creep.memory.ID !== undefined) takenIdCount++;
								}
							}

							// Make sure the child room has some units to fight with while it's still young
							if (!Game.rooms[childRoom]) {
								extraPriority = 50;
								requiredCount = 3;
							}
							else if (Game.rooms[childRoom].controller.my &&
								(Game.rooms[childRoom].effectiveLevel <= 2 || (Game.rooms[childRoom].find(FIND_MY_SPAWNS).length == 0 && Game.rooms[childRoom].towers.length == 0) || (Game.rooms[childRoom].defcon <= 3 && Game.rooms[childRoom].effectiveLevel < 7)) &&
								(Game.rooms[childRoom].controller.safeMode || 0) < 1500) {
								extraPriority = 50;
								if (Game.rooms[childRoom].towers.length > 0 && role == "healerChildRoom") {
									requiredCount = 1;
								}
								else {
									requiredCount = 3;
								}
							}
							else if (Game.rooms[childRoom].controller.my &&
									(Game.rooms[childRoom].effectiveLevel < 3 || Game.rooms[childRoom].towers.length == 0) &&
									(Game.rooms[childRoom].controller.safeMode || 0) < 1500) {
								extraPriority = 25;
								requiredCount = 3;
							}
							else if (Game.rooms[childRoom].controller.my &&
									 Game.rooms[childRoom].effectiveLevel <= this.room.effectiveLevel - 2 &&
									(Game.rooms[childRoom].controller.safeMode || 0) < 1500) {
								extraPriority = 25;
								if (Game.rooms[childRoom].effectiveLevel <= this.room.effectiveLevel - 4) {
									if (role == "healerChildRoom") {
										requiredCount = 1;
									}
									else {
										requiredCount = 2;
									}
								}
								else {
									if (this.room.effectiveLevel < 6 && Game.rooms[childRoom].towers.length) {
										requiredCount = 0
									}
									else {
										requiredCount = 1;
									}
								}
							}
							if (role != "healerChildRoom" && Game.rooms[childRoom]) {
								if (Game.rooms[childRoom].defcon == 2) {
									requiredCount++;
								}
								else if (Game.rooms[childRoom].defcon == 1) {
									requiredCount += 2;
								}
							}

							if (maxHate < 10000) {
								requiredCount = Math.min(1, requiredCount)
								if (requiredCount && (role == "tankChildRoom" || role == "healerChildRoom")) {
									if (Math.random() < 0.1) console.log(this.room, "Skipping tank/healer for child room due to low max hate")
									targetCount = 0
									continue
								}							
								// RCL 6 and below ranged creeps ain't doing shit compared to just the one tower
								if (Game.rooms[childRoom].effectiveLevel >= 3 && Game.rooms[childRoom].towers.length && role == "rangedChildRoom" && this.room.effectiveLevel < 7) {
									continue
								}
								else if (Game.rooms[childRoom].effectiveLevel >= 5 && Game.rooms[childRoom].towers.length > 1 && role == "rangedChildRoom" && this.room.effectiveLevel < 8) {
									continue
								}
							}
							if (requiredCount && maxHate < 1000) {
								targetCount = 0
								if (Math.random() < 0.1) console.log(this.room, "Skipping child room defense due to very low max hate")
								continue
							}

							requiredCount = Math.min(3, requiredCount)

							if (takenCount > 0) extraPriority /= 2;

							// Err, a bit of hack. sR should be the room spawning,
							// but the way that the order works means that this'll
							// override the default.
							// The other hack is to get this tracked by the combat manager.
							// The combat manager will pick up orphaned creeps with a "dead" mission ID and
							// pull them into it's idle pool. This should work.
							if ((!Game.rooms[childRoom] || (takenIdCount >= 1 && requiredCount > 1 && (Game.rooms[childRoom].controller.safeMode || 0) < 1500)) && maxHate > 100000) {
								// We don't want to be taken over by the combat manager.
								extraMemory = {"targetRoom": childRoom, "sR": childRoom, "targetBoosts": {}, "forceBoost": 1}
								// Ok, lets get boosts if we're feeling rich
								if (role == "tankChildRoom" && Memory.empireStrength > 10) {
									let attackBoost = this.room.getAvailableBoost(util.isAttackBoost, 25 * 50 * LAB_BOOST_MINERAL)
									if (attackBoost) {
										extraMemory.targetBoosts[attackBoost] = -1
									}
								}
								if (role == "rangedChildRoom" && Memory.empireStrength > 10) {
									let rangedBoost = this.room.getAvailableBoost(util.isRangedBoost, 20 * 50 * LAB_BOOST_MINERAL)
									let healBoost = this.room.getAvailableBoost(util.isHealBoost, 5 * 50 * LAB_BOOST_MINERAL)
									extraMemory.targetBoosts = {};
									if (rangedBoost) {
										extraMemory.targetBoosts[rangedBoost] = -1;
									}
									if (healBoost) {
										extraMemory.targetBoosts[healBoost] = -1;
									}
								}
								if (role == "healerChildRoom" && Memory.empireStrength > 10) {
									let healBoost = this.room.getAvailableBoost(util.isHealBoost, 25 * 10 * LAB_BOOST_MINERAL)
									if (healBoost) {
										extraMemory.targetBoosts[healBoost] = -1
									}
								}
							}
							else {
								extraMemory = {"targetRoom": childRoom, "sR": childRoom, "ID": -9999}
							}

							if (takenCount < requiredCount) {
								// If we can't make it there, don't bother
								if (routeCost > 20) {
									continue;
								}
								targetCount = requiredCount - takenCount;
								break;
							}

						}
					}
					alreadyCheckedOwned = true;
				}
				// else if (this.room.dangerous || Math.random() < 0.1 || global.targetCountsForRole1[this.room.name][role] === undefined) {
				else if (role == "harvester") {
					if (false && Memory.season3) {
						// New code I'd like to test for a bit...
						let myHarvesters = (this.rooms.mem.ownedCreeps["harvester"] || []).concat(this.rooms.mem.ownedCreeps["bHarvester"] || []);

						for (var roomName of this.room.regularHarvestRooms) {
							let sectorCoords = util.getSectorCoords(roomName);
							if (sectorCoords.x <= 6 && sectorCoords.x >= 4 && sectorCoords.y <= 6 && sectorCoords.y >= 4) continue;

							let cnt

							var room = Game.rooms[roomName];
							if (room) {
								if (room.controller && room.controller.owner && room.controller.owner.username != util.getMyName()) {
									continue
								}
								if (room.controller && room.controller.reservation && room.controller.reservation.username != util.getMyName()) {
									continue
								}
								if (room.dangerous == 2) {
									continue
								}

								if (this.room.energyCapacityAvailable < 1000 || (Memory.season3 && this.room.energyCapacityAvailable < 1300)) {
									let design = creepCreator.getDesignForEnergyCap("harvester", this.room.energyCapacityAvailable, roomMemory.spawnUtilization > HIGH_UTIL_THRESH, false, willUseRoads);

									let hpt = 0;
									for (let part of design) {
										if (part == WORK) {
											hpt += 2;
										}
									}

									cnt = 0
									for (let source of room.find(FIND_SOURCES)) {
										cnt += Math.min(Math.ceil(source.energyCapacity / (hpt * ENERGY_REGEN_TIME)), source.pos.countAccessibleTiles());

										// extraMemory = {tLoc: _.clone(possibleLootRooms), hSource: _.sample(possibleLootRooms)}
									}
								}
								else {
									cnt = roomIntel.getNumSources(roomName);
								}

							}
							else if (Memory.rooms[roomName]) {
								if (Memory.rooms[roomName].reservedBy && Memory.rooms[roomName].reservedBy != util.getMyName()) {
									continue;
								}

								if (Memory.rooms[roomName].DT > 0.5 && Memory.tick > 1000) {
									continue
								}
								cnt = roomIntel.getNumSources(roomName);
							}



							targetCount += cnt;
						}

					}
					else {
						targetCount = 0;


						// if (!roomMemory.harvesterCensusTick || Game.time - roomMemory.harvesterCensusTick > 100) {
							for (var roomName of this.room.regularHarvestRooms) {
								let sectorCoords = util.getSectorCoords(roomName);
								if (sectorCoords.x <= 6 && sectorCoords.x >= 4 && sectorCoords.y <= 6 && sectorCoords.y >= 4) continue;

								let cnt

								var room = Game.rooms[roomName];
								if (room) {
									if (room.controller && room.controller.owner && room.controller.owner.username != util.getMyName()) {
										continue
									}
									if (room.controller && room.controller.reservation && room.controller.reservation.username != util.getMyName()) {
										continue
									}
									if (room.dangerous == 2) {
										continue
									}

									if (this.room.energyCapacityAvailable < 1000 || (Memory.season3 && this.room.energyCapacityAvailable < 1300)) {
										let design = creepCreator.getDesignForEnergyCap("harvester", this.room.energyCapacityAvailable, roomMemory.spawnUtilization > HIGH_UTIL_THRESH, false, willUseRoads);

										let hpt = 0;
										for (let part of design) {
											if (part == WORK) {
												hpt += 2;
											}
										}

										cnt = 0
										for (let source of room.find(FIND_SOURCES)) {
											cnt += Math.min(Math.ceil(source.energyCapacity / (hpt * ENERGY_REGEN_TIME)), source.pos.countAccessibleTiles());

											// extraMemory = {tLoc: _.clone(possibleLootRooms), hSource: _.sample(possibleLootRooms)}
										}
									}
									else {
										cnt = roomIntel.getNumSources(roomName);
									}

								}
								else if (Memory.rooms[roomName]) {
									if (Memory.rooms[roomName].reservedBy && Memory.rooms[roomName].reservedBy != util.getMyName()) {
										continue;
									}

									if (Memory.rooms[roomName].DT > 0.5 && Memory.tick > 1000) {
										continue
									}
									cnt = roomIntel.getNumSources(roomName);
								}



								targetCount += cnt;
								// targetCount += room.find2(FIND_SOURCES).length;
							}
						// 	roomMemory.harvesterCensusTick = Game.time;
						// }
					}
				}
				else if (role == "doubleHarvester") {
					targetCount = 0;

					// if (!roomMemory.harvesterCensusTick || Game.time - roomMemory.harvesterCensusTick > 100) {
						for (var roomName of this.room.doubleHarvestRooms) {
							let sectorCoords = util.getSectorCoords(roomName);
							if (sectorCoords.x <= 6 && sectorCoords.x >= 4 && sectorCoords.y <= 6 && sectorCoords.y >= 4) continue;

							let cnt

							var room = Game.rooms[roomName];
							if (room) {
								if (room.controller && room.controller.owner && room.controller.owner.username != util.getMyName()) {
									continue
								}
								if (room.controller && room.controller.reservation && room.controller.reservation.username != util.getMyName()) {
									continue
								}
								if (room.dangerous == 2) {
									continue
								}

								targetCount++;

							}
							else if (Memory.rooms[roomName]) {
								if (Memory.rooms[roomName].reservedBy && Memory.rooms[roomName].reservedBy != util.getMyName()) {
									continue;
								}

								if (Memory.rooms[roomName].DT > 0.5 && Memory.tick > 1000) {
									continue
								}
								targetCount++;
							}


							
							// targetCount += room.find2(FIND_SOURCES).length;
						}
					// 	roomMemory.harvesterCensusTick = Game.time;
					// }
				}
				else if (role == "centralHarvester") {
					targetCount = 0;

					for (var roomName of this.room.centreHarvestRooms) {
						var room = Game.rooms[roomName];
						if (!room || room.dangerous == 2) {
							continue
						}
						if (!room.centreRoom) {
							continue;
						}

						targetCount += roomIntel.getNumSources(roomName);
					}
				}
				else if (role == "keeperGuard2") {
					targetCount = 0;

					for (var roomName of this.room.keeperHarvestRooms) {
						let doingIt = false
						for (let guardName of (this.room.memory.ownedCreeps["keeperGuard2"] || [])) {
							if (Memory.creeps[guardName] && Memory.creeps[guardName].targetRoom == roomName) {
								doingIt = true;
								break;
							}
						}

						if (!doingIt) {
							for (let extraMemory of (this.room.memory.postBuildExtraMemory["keeperGuard2"] || [])) {
								if (extraMemory.targetRoom == roomName) {
									doingIt = true;
									break;
								}
							}
						}

						if (!doingIt) {
							targetCount += 1;
						}
					}
				}
				else if (role == "fetcher") {
					global.fetcherTargetCounts = global.fetcherTargetCounts || {};
					// Even rarer than the above
					if (global.fetcherTargetCounts[this.room.name] && (Game.cpu.bucket < 8000 && Math.random() > 0.2)) {
						targetCount = global.fetcherTargetCounts[this.room.name]
					}
					else {
						let carryRequirement = 0;
						for (let roomName of this.room.goodRooms) {
							// if (Game.rooms[roomName]) {
								let room = Game.rooms[roomName];
								// Should I completely ignore these? That seems a bit dramatic given it's cached.
								if (room) {
									if (room.controller && room.controller.owner && room.controller.owner.username != util.getMyName()) {
										continue
									}
									if (room.controller && room.controller.reservation && room.controller.reservation.username != util.getMyName()) {
										continue
									}
									if (room.dangerous == 2 && Memory.rooms[roomName].DT > 0.25) {
										continue
									}
								}
								else if (Memory.rooms[roomName]) {
									if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
										continue;
									}
									if (Memory.rooms[roomName].reservedBy && Memory.rooms[roomName].reservedBy != util.getMyName()) {
										continue;
									}
									if (Memory.rooms[roomName].DT > 0.5 && Memory.tick > 5000) {
										continue
									}
								}
								else {
									continue
								}

								let pathOpts = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};

								let sources;
								let keeperRoom
								let centreRoom
								if (room) {	
									keeperRoom = room.keeperRoom
									centreRoom = room.centreRoom

									if (keeperRoom && !this.room.keeperHarvestRooms.includes(roomName)) {
										sources = []
									}
									else if (centreRoom && !this.room.centreHarvestRooms.includes(roomName)) {
										sources = []
									}
									else {
										sources = room.find(FIND_SOURCES);
									}
								}
								else {							
									let roomPos = util.getSectorCoords(roomName);
									keeperRoom = (roomPos.x >= 4 && roomPos.x <= 6 && roomPos.y >= 4 && roomPos.y <= 6 && !(roomPos.x == 5 && roomPos.y == 5))
									centreRoom = (roomPos.x == 5 && roomPos.y == 5)

									if (keeperRoom && !this.room.keeperHarvestRooms.includes(roomName)) {
										sources = []
									}
									else if (centreRoom && !this.room.centreHarvestRooms.includes(roomName)) {
										sources = []
									}
									else {										
										// Make some fake sources
										sources = []
										for (let sourceIdx = 0; sourceIdx < roomIntel.getNumSources(roomName); sourceIdx++) {
											let obj = {}

											obj.pos = new RoomPosition(roomIntel.getSourceX(roomName, sourceIdx), roomIntel.getSourceY(roomName, sourceIdx), roomName)
											obj.energyCapacity = keeperRoom || centreRoom ? SOURCE_ENERGY_KEEPER_CAPACITY : SOURCE_ENERGY_CAPACITY

											sources.push(obj)
										}
									}

								}


								let modifier = 1.
								// These are a bit of a PITA sometimes due to inaders/SK. They also have dropped resources quite often
								if (keeperRoom) {
									// SK rooms also get ~8 energy/tick from SK kills, which is +20%.
									modifier = 1.35; 
								}
								else if (centreRoom) {
									// Got to go through SK rooms
									modifier = 1.1;
								}
								// Our room may need some handling but links, base manager and extension filling should handle it
								else if (room == this.room) {
									modifier = this.room.effectiveLevel >= 7 ? 0.2 : 0.5;
								}

								for (var source of sources) {
									let energyCap = source.energyCapacity;
									// Means we've cocked up the reservers or we don't have any!
									// if (energyCap == SOURCE_ENERGY_NEUTRAL_CAPACITY) {
									// 	energyCap *= SOURCE_ENERGY_NEUTRAL_CAPACITY / SOURCE_ENERGY_CAPACITY;
									// }

									if (source.effects) {
										for (let effect of source.effects) {
											if (effect.power == PWR_REGEN_SOURCE) {
												energyCap += POWER_INFO[PWR_REGEN_SOURCE].effect[effect.level - 1] * ENERGY_REGEN_TIME / POWER_INFO[PWR_REGEN_SOURCE].period
												break;
											}
										}
									}


									let energyPerTick = energyCap / ENERGY_REGEN_TIME;

									if (this.room.effectiveLevel == 1 && energyPerTick > 4) {
										// Two work per harvester can't get more than 4
										energyPerTick = 4;
									}
									else if (this.room.effectiveLevel == 2 && energyPerTick > 8) {
										if (roomName == this.room.name) {
											// Four work per harvester can't get more than 8
											energyPerTick = 8;
										}
										else {
											energyPerTick = 5;
										}
									}

									// Decay and containers
									if (this.room.effectiveLevel < 3) {
										energyPerTick -= 1;
									}
									else {
										energyPerTick -= 0.5;
									}


									// Assumes we move at full speed.
									let outSteps;
									let returnSteps;
									if (this.room.storage) {
										outSteps = pathCache.getPathSpawn(this.room.storage.pos, source.pos, 1, 5, false, true, pathOpts).path.length;
										returnSteps = pathCache.getPathSpawn(source.pos, this.room.storage.pos, 1, 0, false, true, pathOpts).path.length - 1;
									}
									else {
										outSteps = pathCache.getPathSpawn(this.pos, source.pos, 1, 5, false, true, pathOpts).path.length;
										returnSteps = pathCache.getPathSpawn(source.pos, this.pos, 1, 0, false, true, pathOpts).path.length - 1;
									}

									// Swamps are horrible. We don't have roads at this stage, lets make a fairly conservative estimate of how much
									// extra we'll need.
									if (this.room.effectiveLevel < 3) {
										let swampRatio = roomIntel.getSwampRatio(this.room.name)
										let wallRatio = roomIntel.getWallRatio(this.room.name)

										outSteps *= 1 + swampRatio / (1 - wallRatio);
										returnSteps *= 1 + swampRatio / (1 - wallRatio);
									}

									// console.log(outSteps, returnSteps, this.room.storage.pos, source.pos)

									carryRequirement += modifier * energyPerTick * (outSteps + returnSteps);
								}

								if (room && (room == this.room || this.room.goodRooms.includes(roomName))) {
									let minerals = room.find(FIND_MINERALS, {
										filter: (mineral) => {
											if (mineral.mineralAmount == 0) return false;

											let structures = room.lookForAt(LOOK_STRUCTURES, mineral);

											if (structures.length == 1) {
												structures = _.filter(structures, (structure) => structure.structureType == STRUCTURE_EXTRACTOR && ((structure.my && structure.isActive()) || room.keeperRoom || room.centreRoom));
												return structures.length == 1
											}
											return false;
										}
									});

									for (let mineral of minerals) {
										// Assumes we move at full speed.
										let outSteps;
										let returnSteps;
										if (this.room.storage) {
											outSteps = pathCache.getPathSpawn(this.room.storage.pos, mineral.pos, 1, 5, false, true, pathOpts).path.length;
											returnSteps = pathCache.getPathSpawn(mineral.pos, this.room.storage.pos, 1, 0, false, true, pathOpts).path.length - 1;
										}
										else if (this.room.find2(FIND_MY_SPAWNS).length > 0) {
											outSteps = pathCache.getPathSpawn(this.room.find2(FIND_MY_SPAWNS)[0].pos, mineral.pos, 1, 5, false, true, pathOpts).path.length;
											returnSteps = pathCache.getPathSpawn(mineral.pos, this.room.find2(FIND_MY_SPAWNS)[0].pos, 1, 0, false, true, pathOpts).path.length - 1;
										}
										let mineralModifier = 1.
										// These are a bit of a PITA sometimes due to invaders/SK.
										if (keeperRoom) mineralModifier = 1.1;
										if (centreRoom) mineralModifier = 1.05;


										if (Memory.season5 && this.room.mem.claimToUnclaimRoom && this.room.extractor) {
											// Boosted fat guy
											mineralModifier *= 10 * Math.min(5, this.room.extractor.pos.countAccessibleTiles())
										}

										// Bit of a hack. Build for 30 work parts. This will be low in some cases, high in others. Minerals shouldn't cause much of a delta in fetchers though.
										carryRequirement += mineralModifier * (HARVEST_MINERAL_POWER * 30 / EXTRACTOR_COOLDOWN) * (outSteps + returnSteps);
									}
								}
							// }
							// else if (Memory.rooms[roomName]) {
							// 	if (Memory.rooms[roomName].reservedBy && Memory.rooms[roomName].reservedBy != util.getMyName()) {
							// 		continue;
							// 	}
							// 	if (Memory.rooms[roomName].DT > 0.5 && Memory.tick > 5000) {
							// 		continue
							// 	}


							// }
						}

						let designOpts = {}
						if (this.room.mem.phatHaulers) {
							designOpts.phatHaulers = 1;
						}


						if (Memory.tick > 1000 && Game.time - (Memory.lastHaulerSizeToggle || -2000) >= 1500 - 100 * Math.random()) {							
							if (Game.cpu.bucket < 7000 || Memory.stats.avgBucket < 9000 || this.room.mem.phatHaulers || (this.room.mem.spawnUtilization < 0.5 && Memory.tick >= 5000 && Game.time - (this.room.mem.claimTick || 0) >= 5000)) {
								if (this.room.mem.verySmallHaulers) {								
									delete this.room.mem.verySmallHaulers
									this.room.mem.smallHaulers = 1
								}
							}
							if (Game.cpu.bucket < 3000 || Memory.stats.avgBucket < 8000 || this.room.mem.phatHaulers || this.room.mem.spawnUtilization < 0.5) {
								if (this.room.mem.smallHaulers) {								
									delete this.room.mem.smallHaulers
									this.room.mem.mediumHaulers = 1
								}
							}
							if (Game.cpu.bucket < 2000 || Memory.stats.avgBucket < 7000 || this.room.mem.phatHaulers || this.room.mem.spawnUtilization < 0.5) {
								delete this.room.mem.mediumHaulers
							}
						}

						designOpts.medium = this.room.mem.mediumHaulers;
						designOpts.small = this.room.mem.smallHaulers;
						designOpts.verySmall = this.room.mem.verySmallHaulers;

						let fetcherDesign = creepCreator.getDesignForEnergyCap("fetcher", this.room.energyCapacityAvailable, roomMemory.spawnUtilization > HIGH_UTIL_THRESH, false, willUseRoads, designOpts);
						var numCarry = 0;
						for (var bodyPart of fetcherDesign) {
							if (bodyPart == CARRY) numCarry++;
						}

						// We spend 2/3 of our time moving slow
						if (this.room.mem.phatHaulers) {
							numCarry /= 1.5;
							// They're a bit less efficient due to moving slow without being full, and more likely to die in the field
							numCarry *= .9
						}

						if (this.room.lootRooms.length > 0) {
							carryRequirement += 3000;
						}

						carryRequirement *= 1.1; // Safety margin. There will be some inefficiencies in pathing, and when TTL is low there's also some issues.

						// Swaps help. Safety margin is also less important when we have bucket chains and less quantisation
						if (this.room.mem.verySmallHaulers) {
							carryRequirement /= 1.1
						}
						else if (this.room.mem.smallHaulers) {
							carryRequirement /= 1.05
						}
						else if (this.room.mem.mediumHaulers) {
							carryRequirement /= 1.025
						}


						let numFetchers = Math.ceil(carryRequirement / (numCarry * CARRY_CAPACITY))


						// console.log(this.room.name, numFetchers)

						// if (numFetchers > 20) {
						// 	console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", this.room.name, numFetchers)							
						// 	console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", this.room.name, numFetchers)							
						// 	console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", this.room.name, numFetchers)							
						// 	console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", this.room.name, numFetchers)							
						// 	console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", this.room.name, numFetchers)							
						// 	Game.notify(this.room.name + " " + numFetchers)							
						// }

						targetCount = numFetchers;

						let currentCarry = 0
						for (let ownedCreep of roomMemory.ownedCreeps["fetcher"]) {
							if (Game.creeps[ownedCreep]) {
								currentCarry += Game.creeps[ownedCreep].getNumOfBodyPart(CARRY)
							}
						}

						// Must be being supported by some other creeps. Dunno. Don't build loads more.
						if (currentCarry > 2 * numFetchers * numCarry) {
							targetCount = Math.round(targetCount / 2)
						}					


						global.fetcherTargetCounts[this.room.name] = targetCount
					}


					if (roomMemory.supressFetchers > 0) {
						targetCount *= 0.8;
						extraPriority -= roomMemory.supressFetchers
					}
					if (roomMemory.supressFetchers >= 50) targetCount *= 0.8;
					if (roomMemory.supressFetchers >= 100) targetCount *= 0.8;
					if (roomMemory.supressFetchers >= 150) targetCount *= 0.8;
					if (roomMemory.supressFetchers >= 200) targetCount *= 0.8;


					let numHarvesters = (roomMemory.ownedCreeps["harvester"] || 0) + (roomMemory.ownedCreeps["bHarvester"] || 0) + (roomMemory.ownedCreeps["centralHarvester"] || 0) + (roomMemory.ownedCreeps["keeperHarvester2"] || 0);
					if (targetCount > Math.round(Math.max(2, 10 / this.room.effectiveLevel) * numHarvesters)) {
						targetCount = Math.round(Math.max(2, 10 / this.room.effectiveLevel) * numHarvesters);
					}

					if (Memory.season5 && this.room.mem.claimToUnclaimRoom && this.room.extractor) {
						targetCount = Math.max(targetCount, 2)
					}


				}
				else if (role == "antiScout") {
					roomMemory.childRooms = roomMemory.childRooms || [];

					/*for (var childRoom of roomMemory.childRooms) {
						if (Game.rooms[childRoom] && Game.rooms[childRoom].controller.level >= 4) continue;

						var baseCoords = util.getRoomCoords(childRoom);
						for (var i = -1; i <= 1; i++) {
							for (var j = -1; j <= 1; j++) {
								var coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};

								// Don't do centre rooms
								if (coords.x >= 4 && coords.x <= 6 && coords.y >= 4 && coords.y <= 6) continue;

								var testRoomName = util.getRoomNameFromCoords(coords);

								if (Game.map.findRoute(childRoom, testRoomName).length > 3) continue

								targetCount++
							}
						}

					}*/
				}
				else if (role == "scout") {
					if (Game.time - (Memory.observerOperated || -1e6) < 1000) {
						targetCount = 0;
					}
					else if (this.room.effectiveLevel == 8) {						
						let anyScoutRooms = false;
						for (let scoutRoomName of Memory.scoutRooms) {
							if ((Game.map.getRoomLinearDistance(scoutRoomName, this.room.name) > 10 && Game.map.getRoomLinearDistance(scoutRoomName, this.room.name) <= 15)) {
								anyScoutRooms = true;
								break;
							}
						}
						if (!anyScoutRooms) {
							targetCount = 0;
						}
						else {
							targetCount = this.targetCounts[role];
						}
					}
					else {
						targetCount = this.targetCounts[role];
					}
				}
				else if (role == "lootFetcher") {
					if (roomMemory.lootRooms.length) {
						let possibleLootRooms = []
						for (let lootRoom of roomMemory.lootRooms) {
							if (Game.rooms[lootRoom] && Game.rooms[lootRoom].dangerous) {
								continue
							}
							else if (Memory.rooms[lootRoom].DT > 1) {
								continue
							}
							possibleLootRooms.push(lootRoom)
						}
						if (possibleLootRooms.length) {							
							targetCount = 1;
							extraMemory = {fR: _.clone(possibleLootRooms), targetRoom: _.sample(possibleLootRooms)}
						}
					}
					else {
						targetCount = 0;				
					}
				}
				else if (role == "advLabManager" || role == "labTech") {
					if (this.room.effectiveLevel == 7 && this.room.labs.length == 6 && this.room.mem.targetCompound && (Game.time - (this.room.mem.boostsRequestedTime || -2000) >= 2000) && REACTION_TIME[this.room.mem.targetCompound] >= 10) {
						let anyOpLab = 0
						let anyNotCooking = 0

						for (let lab of this.room.labs) {
							if (lab.effects && lab.effects.length) {
								anyOpLab = 1;
								break
							}
						}

						if (!anyOpLab) {							
							for (let room of Game.myRooms) {
								if (!room.mem.targetCompound && room.labs.length > 3 && global.currentlyUnclaimingRoom != room.name) {
									if (Math.random() < 0.1) console.log(room, "is not cooking so no advLabManager");
									anyNotCooking = 1;
									break
								}
							}
						}

						targetCount = anyNotCooking || anyOpLab ? (this.targetCounts[role] || 0) : 1;
					}
					else if (this.room.effectiveLevel == 8 && this.room.labs.length >= 6 && this.room.mem.targetCompound && (Game.time - (this.room.mem.boostsRequestedTime || -2000) >= 2000) && REACTION_TIME[this.room.mem.targetCompound] >= 20) {
						let anyOpLab = 0
						let anyNotCooking = 0

						for (let lab of this.room.labs) {
							if (lab.effects && lab.effects.length) {
								anyOpLab = 1;
								break
							}
						}

						if (!anyOpLab) {							
							for (let room of Game.myRooms) {
								if (!room.mem.targetCompound && room.labs.length > 3 && global.currentlyUnclaimingRoom != room.name) {
									if (Math.random() < 0.1 && !Memory.season) console.log(room, "is not cooking so no op lab");
									anyNotCooking = 1;
									break
								}
							}
						}

						targetCount = anyNotCooking || anyOpLab ? (this.targetCounts[role] || 0) : 1;
					}
					else {
						targetCount = (this.targetCounts[role] || 0);				
					}
				}
				else {
					targetCount = this.targetCounts[role];
				}
				// global.targetCountsForRole1[this.room.name][role] = targetCount;
				// }
				// else {
				// 	targetCount = global.targetCountsForRole1[this.room.name][role];
				// }

				if (role == "upgrader" || role == "builder" || role == "repairer") {
					let mod
					if (Game.gcl.level == 1) {
						mod = 0.125;
					}
					else if (this.room.effectiveLevel < 5) {
						mod = 0.5;
					}
					else if (this.room.effectiveLevel == 5) {
						mod = 0.75;
					}
					else {
						mod = 1;
					}

					if (Game.gcl.level < 4) {
						mod *= .9
					}
					if (Game.gcl.level < 3) {
						mod *= .9
					}
					if (Game.gcl.level < 2) {
						mod *= .9
					}
					if (Memory.boomMode && !global.totalAssaultCount) {
						mod *= .8
					}

					// Don't overreact to non-threats
					if (Memory.maxEnemyRoomLevel <= 5 || Memory.maxEnemyRoomLevel < this.room.effectiveLevel) {
						mod *= 0.25
					}

					// Cool it a bit so we can do power
					if (Memory.season3 && this.room.effectiveLevel >= 5) {
						mod *= 1.2
					}

					// Hack
					// if (Memory.season1 && Game.gcl.level < 5) {
					// 	mod *= 2
					// }

					if (this.room.storage &&
						(this.room.storage.store[RESOURCE_ENERGY] > 900000 * mod || (this.room.storage.store[RESOURCE_ENERGY] > 600000 * mod && _.sum(this.room.storage.store) > 900000 * mod))) {
						extraPriority = this.room.controller.level < 8 ? 100 : 50
					}
					else if (this.room.storage &&
						(this.room.storage.store[RESOURCE_ENERGY] > 600000 * mod || (this.room.storage.store[RESOURCE_ENERGY] > 300000 * mod && _.sum(this.room.storage.store) > 600000 * mod))) {
						extraPriority = this.room.controller.level < 8 ? 50 : 25
					}
					else if (this.room.storage &&
						(this.room.storage.store[RESOURCE_ENERGY] > 300000 * mod || (this.room.storage.store[RESOURCE_ENERGY] > 100000 * mod && _.sum(this.room.storage.store) > 300000 * mod))) {
						extraPriority = this.room.controller.level < 8 ? 20 : 10
					}

					if (role == "upgrader") {						
						if (this.room.upgradeFocus) {
							extraPriority += 25;
							if (Memory.boomMode) { 
								extraPriority += 25
							}
							if (Memory.highEnergyUpgrading) {
								extraPriority += 25
							}
						}

						if (this.room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[this.room.controller.level] / (Memory.tick < 20000 ? 10 : 2)) {
							extraPriority = 100;
							if (!targetCount) targetCount = 1;
						} 
						else if (Memory.season5 && this.room.mem.claimToUnclaimRoom && this.room.effectiveLevel >= 6) {
							targetCount = 0
						}
					}
				}
				if (role == "repairer") {
					if (effectiveEnergy === undefined) {
						effectiveEnergy = this.room.calcEffectiveEnergy();
					}
					if (effectiveEnergyNT === undefined) {
						effectiveEnergyNT = this.room.calcEffectiveEnergy(false);
					}

					if (effectiveEnergy < constants.ROOM_ENERGY_NO_REPAIRERS && this.room.effectiveLevel >= 4) {
						targetCount = 0;
					}
					else if ((this.room.effectiveLevel == 3 || (this.room.effectiveLevel > 3 && !this.room.storage)) && effectiveEnergy < 1000) {
						targetCount = 0;
					}
					else if (this.room.effectiveLevel <= 2) {
						targetCount = 0;
					}
					else {
						// This is expensive. Don't check too frequently
						let priority = 0;
						if (Math.random() < 0.025 * (6 - this.room.defcon) || ((this.room.dangerous || roomMemory.nukeCount) && Math.random() < 0.25) || this.room.defcon == 1) {
							priority = roomAI.getRepairPriority(this.room, true, false).priority;
						}
						// if (this.room.name == "W16S17") {
						// 	console.log("Rep spawn", priority)
						// }

						targetCount = priority > 0 ? 1 : 0;
						if (priority > 0) {
							if (this.room.defcon <= 4) {
								targetCount++;
							}
							if (this.room.defcon <= 3 && this.room.terminal) {
								targetCount++;
							}

							if (effectiveEnergyNT > 300e3 || (this.room.defcon < 2 && effectiveEnergy > 300e3)) {
								targetCount++;
							}
							if (effectiveEnergyNT > 600e3 || (this.room.defcon < 2 && effectiveEnergy > 600e3)) {
								targetCount++;
							}
							if (effectiveEnergyNT > 900e3 || (this.room.defcon < 2 && effectiveEnergy > 900e3)) {
								targetCount++;
							}

							if (this.room.defcon <= 2) {
								targetCount++;
							}
							if (this.room.defcon <= 1) {
								targetCount++;
							}
							if (this.room.effectiveLevel < this.room.controller.level) {
								targetCount++;
							}
							if (roomMemory.nukeCount) {
								targetCount += Math.round(roomMemory.nukeCount / 5)
							}

							// Don't overreact to non-threats at low RCL
							else if (Memory.maxEnemyRoomLevel <= 5 || Memory.maxEnemyRoomLevel < this.room.effectiveLevel) {
								targetCount = Math.ceil(targetCount * 0.3)
							}


							if (priority < 2.5 && effectiveEnergy < constants.ROOM_ENERGY_NO_P2_REPAIRERS && this.room.effectiveLevel >= 4) {
								targetCount = 0;
							}
							else if (priority < 5 && effectiveEnergy < constants.ROOM_ENERGY_NO_P1_REPAIRERS && this.room.effectiveLevel >= 4) {
								targetCount = 0;
							}
							else if (targetCount > 0 && effectiveEnergy < constants.ROOM_ENERGY_LIMIT_REPAIRERS_TO_ONE && this.room.effectiveLevel >= 4) {
								targetCount = 1;
							}
							else if (targetCount > 0 && effectiveEnergyNT < constants.ROOM_ENERGY_LOCAL_LIMIT_REPAIRERS_TO_ONE && this.room.effectiveLevel >= 4) {
								targetCount = 1;
							}

							if (Game.time - (roomMemory.lastBreached || 0) < 50000 && this.room.terminal) {
								extraPriority += 25;
							}


							extraPriority += priority;
							extraPriority += (5 - this.room.defcon) * 10;

							// if (this.room.name == "W16S17") {
							// 	console.log("Rep spawn", targetCount, extraPriority)
							// }
						}
					}

					if (effectiveEnergy < constants.ROOM_ENERGY_ONE_REPAIRER && this.room.effectiveLevel >= 4) {
						targetCount = Math.min(targetCount, 1);
					}
				}

				if (!targetCount) continue;

				var priority = (defaultPriority[role] || 1) + (this.extraPriority[role] || 0) + extraPriority
				if (Memory.season3 && role == "powerShuffler") {
					priority += 100
				}

				if (priority > maxPriority) {
					if (role == "builder") {
						targetCount = roomAI.getNumBuildersRequired(this.room);
						if (targetCount > 0) {							
							if (this.room.effectiveLevel < 4 || !this.room.storage) {
								if (roomMemory.supressFetchers >= 40) {
									console.log("Used to multiply by 1.5 for every supressFetchers, now do something else. Consider!")
								}
								if (roomMemory.supressFetchers >= 40) {
									targetCount++
									targetCount *= 1.1;
								}
								if (roomMemory.supressFetchers >= 80) {
									targetCount++
									targetCount *= 1.1;
								}
								if (roomMemory.supressFetchers >= 120) {
									targetCount++
									targetCount *= 1.1;
								}
								if (roomMemory.supressFetchers >= 160) {
									targetCount++
									targetCount *= 1.1;
								}
								if (roomMemory.supressFetchers >= 200) {
									targetCount++
									targetCount *= 1.1;
								}
							}

							if (this.room.effectiveLevel < this.room.controller.level && targetCount) {
								targetCount++;
							}


							// if (this.room.storage) {
								if (effectiveEnergy === undefined) {
									effectiveEnergy = this.room.calcEffectiveEnergy();
								}
								if (this.room.effectiveLevel > 4 && this.room.storage) {
									targetCount = Math.min(targetCount, Math.floor(effectiveEnergy / constants.ROOM_ENERGY_STORE_PER_BUILDER))
								}

								if (this.room.effectiveLevel == 3 || (this.room.effectiveLevel > 3 && !this.room.storage)) {
									if (effectiveEnergy < 2000) {
										targetCount = 0;
									}
								}
								else if (this.room.effectiveLevel > 3 && this.room.storage) {					
									if (effectiveEnergy < (this.room.effectiveLevel == 4 ? constants.ROOM_ENERGY_NO_BUILDERS_RCL4 : constants.ROOM_ENERGY_NO_BUILDERS)) {
										targetCount = 0;
									}
								}
							// }

							// If we're low on harvesters, throttle down the builders
							if ((roomMemory.supressFetchers || 0) < 100 && effectiveEnergy < 30000) {
								targetCount = Math.min(targetCount, (roomMemory.ownedCreeps["harvester"] || []).length + (roomMemory.ownedCreeps["bHarvester"] || []).length + (roomMemory.ownedCreeps["centralHarvester"] || []).length);
							}
						}
					}
					else if (role == "dismantler") {
						// This is expensive. Don't check too frequently
						targetCount = 0;
						if (Math.random() < 0.1) {
							let rooms = this.room.goodRooms.concat(this.room.buildRooms).concat(this.room.lootRooms);

							rooms = _.uniq(rooms);

							let targets = [];

							for (let roomName of rooms) {
								if (Game.rooms[roomName]) {
									let sectorCoords = util.getSectorCoords(roomName)

									if (sectorCoords.x == 0 || sectorCoords.y == 0) continue

									let room = Game.rooms[roomName];

									if (room.controller && room.controller.safeMode) continue
									// if (Game.myRooms.indexOf(room) != -1) continue;

									targets = targets.concat(room.find(FIND_STRUCTURES, {
										filter: (structure) => {
											return structure.structureType == STRUCTURE_WALL && structure.hits;
										}
									}));
									targets = targets.concat(room.find(FIND_HOSTILE_STRUCTURES, {
										filter: (structure) => {
											return structure.structureType != STRUCTURE_CONTROLLER && 
												   structure.structureType != STRUCTURE_KEEPER_LAIR &&
												   (structure.structureType != STRUCTURE_STORAGE || structure.store.getUsedCapacity() == 0) &&
												   (structure.structureType != STRUCTURE_TERMINAL || structure.store.getUsedCapacity() == 0) &&
												   (structure.structureType != STRUCTURE_FACTORY || structure.store.getUsedCapacity() == 0) &&
												   structure.structureType != STRUCTURE_INVADER_CORE;
										}
									}));
									if (targets.length > 0) {
										break;
									}
								}
							}

							if (targets.length > 0) {
								if (Game.cpu.bucket < 3000 || Memory.stats.avgBucket < 3000) {
									targetCount = 1;
								}
								else {
									targetCount = Math.ceil(targets.length / 20);
								}
							}
						}
					}
					else if (role == "coreDismantler") {
						// This is expensive. Don't check too frequently
						targetCount = 0;
						if (Math.random() < 0.1) {
							let rooms = this.room.goodRooms.concat(this.room.buildRooms);

							rooms = _.uniq(rooms);

							let targets = [];

							for (let roomName of rooms) {
								if (Game.rooms[roomName]) {
									let room = Game.rooms[roomName];

									if (room.invaderCore) {
										targets.push(room.invaderCore)
										break;
									}
								}
							}

							targetCount = targets.length
							// if (targets.length > 0) {
							// 	targetCount = 1;
							// }
						}
					}
					else if (role == "upgrader") {
						// Don't hoard energy at GCL 1.
						let mod;

						// Smaller upgraders we can push a few more out.
						if (Game.gcl.level == 1) {
							mod = 0.125;
						}
						else if (this.room.effectiveLevel < 5){
							mod = 0.5;
						}
						else if (this.room.effectiveLevel == 5) {
							mod = 0.75;
						}
						else if (this.room.effectiveLevel == 6) {
							mod = 0.9;
						}
						else {
							mod = 1;
						}

						if (Game.gcl.level < 4) {
							mod *= .9
						}
						if (Game.gcl.level < 3) {
							mod *= .9
						}
						if (Game.gcl.level < 2) {
							mod *= .9
						}
						if (Memory.boomMode && !global.totalAssaultCount) {
							mod *= .8
							// If we're really not fighting yet don't fight. Push RCL/GCL hard
							maxHate = maxHate || intelAI.getMaxHate()

							if (Memory.season3 && this.room.effectiveLevel >= 5) {
								if (maxHate < 10000) {
									mod *= 0.5
								}
								else if (maxHate < 20000) {
									mod *= 0.75
								}
								else if (maxHate < 30000) {
									mod *= 0.9
								}
							}
							else {								
								if (maxHate < 10000) {
									mod *= 0.25
								}
								else if (maxHate < 20000) {
									mod *= 0.5
								}
								else if (maxHate < 30000) {
									mod *= 0.75
								}
							}

						}

						// Cool it a bit so we can do power
						if (Memory.season3 && this.room.effectiveLevel >= 5) {
							mod *= 1.2
						}


						// Hack
						// if (Memory.season1 && this.room.name == "E18S8" && Game.gcl.level < 3) {
						// 	mod *= 0.2
						// }
						// else if (Memory.season1 && this.room.name == "E15S8" && Game.gcl.level < 3) {
						// 	mod *= 0.75
						// }
						// if (Memory.season1 && Game.gcl.level < 5) {
						// 	mod *= 2
						// }

						let progressMod 
						if (this.room.controller.level != 8 && this.room.controller.progress / this.room.controller.progressTotal > 0.9) {
							progressMod = 1 - 0.5 * (this.room.controller.progress / this.room.controller.progressTotal - 0.9) / 0.1
							mod *= progressMod
						}

						if (this.room.upgradeFocus) {
							mod *= 0.5;
						}
						if (this.room.mem.claimToUnclaimRoom) {
							mod *= 0.5;
						}

						if (Game.cpu.bucket < 2000) {
							mod *= 1.1;
						}
						if (Game.cpu.bucket < 3000) {
							mod *= 1.1;
						}
						if (Memory.stats.avgBucket < 3000) {
							mod *= 1.1;
						}

						if (effectiveEnergyNT === undefined) {
							effectiveEnergyNT = this.room.calcEffectiveEnergy(false);
						}

						if (this.room.storage && effectiveEnergyNT < constants.ROOM_ENERGY_MAX_RESTRICT_UPGRADERS * mod) {
							if (effectiveEnergyNT < constants.ROOM_ENERGY_NO_UPGRADERS * mod && this.room.controller.ticksToDowngrade >= CONTROLLER_DOWNGRADE[this.room.controller.level] / 2) {
								targetCount = 0;
							} 
							else if ((this.room.dangerous || roomMemory.DT > 0.1 || (this.room.defcon <= 3 && this.room.effectiveLevel >= 5)) && this.room.controller.ticksToDowngrade >= CONTROLLER_DOWNGRADE[this.room.controller.level] / 2) {
								if (global.roomOverNuked && global.roomOverNuked[this.room.name]) {
									targetCount = Math.max(1, Math.floor(targetCount / 2))
								}
								else {
									targetCount = this.room.effectiveLevel < 7 ? 1 : 0;
								}
							}
							else if (this.room.effectiveLevel == 7 && effectiveEnergyNT < constants.ROOM_ENERGY_NO_UPGRADERS_RCL7 * mod) {
								targetCount = 0;
							}
							else if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length != 0) {
								targetCount -= 1;
							}
						}
						else if (this.room.effectiveLevel == 3) {
							if (effectiveEnergyNT < 3000) {
								targetCount = 0;
							}
						}
						else if (this.room.effectiveLevel > 3 && !this.room.storage) {
							targetCount = 0;
						}
						// If we don't have storage, prioritze construction, otherwise our energy drains too quick.
						else if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length != 0) {
							targetCount = 0;
						}

						// We have too much energy that our haulers are waiting. Build more upgraders.
						if (!this.room.storage) {
							if (roomMemory.supressFetchers > 75) {
								targetCount *= 1.5;
								targetCount *= 1.5;
								targetCount *= 1.5;
							}
							else if (roomMemory.supressFetchers > 50) {
								targetCount *= 1.5;
								targetCount *= 1.5;
							}
							else if (roomMemory.supressFetchers > 25) {
								targetCount *= 1.5;
							}
						}


						if (this.room.controller.level == 8 || (this.room.effectiveLevel == 7 && Memory.noRCL8)) {
							if (targetCount > 0) {
								targetCount = 1;
							}
							if (Memory.season2 && Game.gcl.level >= constants.SEASON_TARGET_GCL && this.room.controller.ticksToDowngrade >= CONTROLLER_DOWNGRADE[this.room.controller.level] * 0.55) {
								targetCount = 0
							}

							// Only upgrade to burn energy
							if ((this.room.restrictUpgraders || Memory.season) && this.room.controller.ticksToDowngrade >= CONTROLLER_DOWNGRADE[this.room.controller.level] * 0.55) {
								targetCount = 0
							}
							else if (effectiveEnergyNT < constants.ROOM_ENERGY_UPGRADE_RCL_8 * mod || this.room.defcon < 5) {
								targetCount = 0;
							}
						}
						else if (targetCount > 0 && effectiveEnergyNT > 1500000 * mod) {
							targetCount += 5
						}
						else if (targetCount > 0 && effectiveEnergyNT > 1200000 * mod) {
							targetCount += 4
						}
						else if (targetCount > 0 && effectiveEnergyNT > 900000 * mod) {
							targetCount += 3
						}
						else if (targetCount > 0 && effectiveEnergyNT > 600000 * mod) {
							targetCount += 2
						}
						else if (targetCount > 0 && effectiveEnergyNT > 400000 * mod) {
							targetCount += 1
						}
						// if (targetCount && this.room.controller.level == 8) console.log(this.room, "upgrader target count A", targetCount)
						if (this.room.upgradeFocus) {
							if (effectiveEnergy === undefined) {
								effectiveEnergy = this.room.calcEffectiveEnergy(true);
							}
							if (targetCount > 0 && effectiveEnergy > 1500000 * mod) {
								targetCount += 5
							}
							else if (targetCount > 0 && effectiveEnergy > 1200000 * mod) {
								targetCount += 4
							}
							else if (targetCount > 0 && effectiveEnergy > 900000 * mod) {
								targetCount += 3
							}
							else if (targetCount > 0 && effectiveEnergy > 600000 * mod) {
								targetCount += 2
							}
							else if (targetCount > 0 && effectiveEnergy > 400000 * mod) {
								targetCount += 1
							}

							// This is done with mod above
							// targetCount *= 1.5;
						}
						// if (this.room.name == "W3S4") console.log("A", "upgrader target", targetCount)

						if (roomMemory.storageControllerLinkDist && targetCount > 1 && this.room.effectiveLevel >= 6 && this.room.effectiveLevel < 8) {
							let smallHaulersMod = 1

							// If we have small haulers the spawn battery does a lot less work
							// as a lot more comes from the harvester extensions.
							// Similarly the base manager does less work as the outer extensions
							// are very rarely used
							if (this.room.mem.verySmallHaulers) {
								smallHaulersMod = 0.25
							}
							else if (this.room.mem.smallHaulers) {
								smallHaulersMod = 0.5
							}
							else if (this.room.mem.mediumHaulers) {
								smallHaulersMod = 0.75
							}

							// We've actually got to fill the link. If it's too close calculated throughput would be too high
							// So assume it's at least 4 tiles
							let minDist = 4;
							// Design is roughly 4:1. Don't want to be link starved. 0.75 modifier as some goes to spawns.
							let throughput = LINK_CAPACITY * (1 - LINK_LOSS_RATIO) / ((Math.max(minDist, roomMemory.storageControllerLinkDist) + smallHaulersMod * 0.5 * (roomMemory.storageSpawnLinkDist || 4)) * LINK_COOLDOWN);

							let focussed = this.room.upgradeFocus && Memory.highEnergyUpgrading

							// Some base managers. Lets say 20% of their time and they carry 600 at RCL 6, 1000 at RCL 7
							// If we have two base managers we can say they spend 40% of their time.
							// And at RCL 7 one source link. 
							throughput += (focussed ? 2 : 1) * ((focussed ? 0.4 : 0.2) / ((1 + smallHaulersMod) / 2)) * (this.room.effectiveLevel == 6 ? 600 : 1000)  / (2 * roomMemory.storageControllerLinkDist) + (this.room.effectiveLevel == 7 ? 8 : 0);


							let expectedWork = Math.min(35, Math.floor(4 * ((this.room.energyCapacityAvailable - 50) / (4 * BODYPART_COST[WORK] + BODYPART_COST[MOVE]))));

							// Used to have floor at > 3 and <= 2. Now just round.
							// if (targetCount > 3) {
							// 	targetCount = Math.max(1, Math.min(Math.round(throughput / expectedWork), targetCount))
							// }
							// else if (targetCount > 2) {
							// 	targetCount = Math.max(1, Math.min(Math.round(throughput / expectedWork), targetCount))
							// }
							// else {
							// if (Math.round(throughput / expectedWork) < targetCount) {
							// 	this.room.mem.upgradeThroughputLimited = Game.time
							// }
							targetCount = Math.max(1, Math.min(Math.round(throughput / expectedWork), targetCount))
							if (Math.random() < 0.01) console.log(this.room.name, "max upgrader throughput", throughput, "limiting at", Math.round(throughput / expectedWork))
							if (progressMod) {
								targetCount /= progressMod
							}
							// }
						}
						// if (this.room.name == "W3S4") console.log("B", "upgrader target", targetCount)

						if (this.room.effectiveLevel == 7 && effectiveEnergy === undefined) {
							effectiveEnergy = this.room.calcEffectiveEnergy(true);
						}

						if (this.room.storage && effectiveEnergyNT < constants.ROOM_ENERGY_ONE_UPGRADER * mod || (this.room.effectiveLevel == 7 && effectiveEnergy < constants.ROOM_ENERGY_ONE_UPGRADER_RCL7 * mod)) {
							targetCount = Math.min(1, targetCount);
						}

						if (this.room.effectiveLevel < this.room.controller.level) {
							targetCount = Math.min(1, targetCount);
						}
						// if (this.room.name == "W3S4") console.log("C", "upgrader target", targetCount)

						// if (targetCount && this.room.controller.level == 8) console.log(this.room, "upgrader target count B", targetCount)

						if (this.room.upgradeFocus) {
							extraPriority += 50;
						}
						else if (this.room.restrictUpgraders && targetCount > 1) {
							targetCount = 1;
						}
						if ((this.room.mem.upgradersStarved || 0) > 0 && targetCount > 1) {
							targetCount = Math.round(targetCount * 0.75)
							targetCount--;
							targetCount = Math.max(1, targetCount)
						}
						if ((this.room.mem.upgradersStarved || 0) > 100 && targetCount > 1) {
							targetCount = Math.round(targetCount * 0.75)
							targetCount--;
							targetCount = Math.max(1, targetCount)
						}
						// if (this.room.name == "W3S4") console.log("D", "upgrader target", targetCount)

						if (targetCount > 1 && effectiveEnergyNT < constants.ROOM_ENERGY_NO_BUILDERS && this.room.effectiveLevel >= 4 && this.room.storage) {
							targetCount = 1;	
						}
						if (targetCount > 1 && missionInfo.isRoomAssaulting(this.room)) {
							targetCount = 1;
						}

						if ((this.room.storage && this.room.storage.store[RESOURCE_ENERGY] < constants.ROOM_ENERGY_CHEAP_UPGRADERS / (this.room.upgradeFocus ? 2 : 1)) ||
							(this.room.effectiveLevel >= 6 && this.room.defcon <= 3 && (!global.roomOverNuked || !global.roomOverNuked[this.room.name])) ||
							(this.room.restrictUpgraders && this.room.storage && this.room.storage.store[RESOURCE_ENERGY] < constants.ROOM_ENERGY_MAX_RESTRICT_UPGRADERS)) {

							if (this.room.controller.ticksToDowngrade >= CONTROLLER_DOWNGRADE[this.room.controller.level] * 0.55) {
								targetCount = 0
							}
							else {
								targetCount = Math.min(1, targetCount);
							}
						}
						// if (this.room.name == "W3S4") console.log("E", "upgrader target", targetCount)

						// To stop it going wild with battiers that can't actually be converted that fast
						if (this.room.factory) {							
							targetCount = Math.min(Math.ceil(this.room.getStoredEnergy() / 30000), targetCount);	
						}
						// if (targetCount && this.room.controller.level == 8) console.log(this.room, "upgrader target count C", targetCount)
						// if (this.room.name == "W3S4") console.log("F", "upgrader target", targetCount)

						// Don't push it when we don't have a storage and only have one source
						if (targetCount > 1 && !this.room.storage && roomIntel.getEffectiveNumSources(this.room.name) < 2) {
							targetCount = Math.floor(targetCount / 2)
						}

						// if (this.room.name == "W3S4") console.log("G", "upgrader target", targetCount)

						// Um. They won't be running 100% anyway.
						if (targetCount > 1 && Game.cpu.bucket < 2000) {
							targetCount = Math.floor(targetCount / 2)
						}
						if (targetCount > 1 && Game.cpu.bucket < 1000) {
							targetCount = Math.floor(targetCount / 2)
						}

						// if (this.room.name == "W3S4") console.log("H", "upgrader target", targetCount)

						// We want to not have rooms linger just before upgrading, but we also don't
						// want to go compeltely wild and drain all the energy.
						// This reverses the progressMod if we've already got upgraders planned
						if (progressMod && targetCount > 0) {
							targetCount = Math.max(1, targetCount * progressMod)
						}

						// Spaces
						targetCount = Math.round(Math.min(targetCount, this.room.effectiveLevel >= 5 ? 6 : (this.room.effectiveLevel >= 3 ? 8 : 12)))
						// targetCount = Math.round(targetCount)

						if (this.room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[this.room.controller.level] / 2 && targetCount < 1) {
							targetCount = 1;
						}

						// if (this.room.name == "W3S4") console.log("I", "upgrader target", targetCount)

						// if (targetCount) console.log(this.room, "upgrader target count", targetCount)

						if (Memory.swc && Memory.banzai) {
							if (Math.random() < 0.001) {
								console.log("Not spawning upgraders in Bazai mode")
							}
							targetCount = 0
						}
						if (Memory.season5 && this.room.controller.level >= 6 && this.room.mem.claimToUnclaimRoom) {
							targetCount = 0
						}
					}
					else if (role == "baseManager") {
						if (this.room.storage && this.room.storage.store[RESOURCE_ENERGY] < constants.ROOM_ENERGY_LIMIT_BASE_MANAGERS_TO_ONE && targetCount > 1) {
							targetCount -= 1;
						}
						if ((this.room.mem.ownedCreeps["upgrader"] || []).length) {							
							if (this.room.storage) {
								// Is this a bit mad?
								if (this.room.mem.spawnUtilization < 0.7) {									
									if (this.room.storage.store[RESOURCE_ENERGY] > 100000 && this.room.effectiveLevel < 6) {
										targetCount += 1;
									}
									if (this.room.storage.store[RESOURCE_ENERGY] > 200000 && this.room.effectiveLevel < 6) {
										targetCount += 1;
									}
									if (this.room.storage.store[RESOURCE_ENERGY] > 300000 && this.room.effectiveLevel < 6) {
										targetCount += 1;
									}
									if (this.room.storage.store[RESOURCE_ENERGY] > 400000 && this.room.effectiveLevel < 6) {
										targetCount += 1;
									}
								}
								if (this.room.upgradeFocus && Memory.highEnergyUpgrading && this.terminal && this.terminal.isActive()) {
									targetCount += 1;
								}
							}
							if (roomMemory.upgradersStarved > 20) {
								targetCount += 1;
							}
						}
						if (Memory.season3) {							
							if (this.room.powerSpawn && (this.room.powerSpawn.effects || []).length) {
								targetCount++	
							}
						}
						if (Memory.season5 && this.room.mem.claimToUnclaimRoom) {
							targetCount *= 2
						}

						// console.log(this.room, "baseManager target", targetCount)
					}
					else if (role == "miner" || role == "season5ThoriumMiner") {
						if (effectiveEnergy === undefined) effectiveEnergy = this.room.calcEffectiveEnergy();

						if (effectiveEnergy > constants.ROOM_ENERGY_NO_MINERS || (Memory.season5 && this.room.mem.claimToUnclaimRoom) || role == "season5ThoriumMiner") {
							var minerals = []


							for (var roomName of [this.room.name].concat(this.room.keeperHarvestRooms).concat(this.room.centreHarvestRooms)) {
								if (Game.rooms[roomName]) {
									if ((roomName == this.room.name && (this.room.storage || this.room.terminal)) || (roomName != this.room.name && this.room.effectiveLevel >= 4 && !Game.rooms[roomName].controller)) {
										minerals = minerals.concat(Game.rooms[roomName].find(FIND_MINERALS, {
											filter: (mineral) => {
												if (mineral.mineralAmount == 0) return false;

												if (!marketTrader.isMineralRequired(mineral.mineralType)) {
													return false
												}

												if (Memory.season5) {  
													if (role == "miner" && mineral.mineralType == RESOURCE_THORIUM) {
														return false
													}
													else if (role == "season5ThoriumMiner") {
														if (mineral.mineralType != RESOURCE_THORIUM) {
															return false	
														}
														if (!this.room.mem.claimToUnclaimRoom && mineral.mineralAmount < 2500) {
															return false
														}
														
													}
												}

												var structures = Game.rooms[roomName].lookForAt(LOOK_STRUCTURES, mineral);

												if (structures.length == 1) {
													structures = _.filter(structures, (structure) => structure.structureType == STRUCTURE_EXTRACTOR && ((structure.my && structure.isActive()) || structure.room.keeperRoom || structure.room.centreRoom));
													return structures.length == 1
												}
												return false;
											}
										}));
									}
								}
							}

							if (role == "miner") {
								targetCount = minerals.length;	
								if (Memory.season5 && this.room.mem.claimToUnclaimRoom && this.room.mem.supportFrom) {
									targetCount--;
								}
							}
							else if (role == "season5ThoriumMiner") {
								targetCount = 0
								for (let mineral of minerals) {
									let mod = 1
									let tiles = mineral.pos.countAccessibleTiles()
									if (mineral.room.mem.supportFrom) {
										tiles -= 1
									}
									if (tiles <= 0) {
										targetCount += 1
									}
									else {
										if (mineral.room.storage) {
											mod = Math.max(1, mineral.room.storage.pos.getRangeTo(mineral.pos) / 10)
										}
										targetCount += Math.max(1, Math.min(Math.ceil(mod * mineral.mineralAmount / 2500), Math.round(mod * targetCount)))
									}
								}
							}
							
						}
					}
					else if (role == "soloKeeperMiner") {
						// They're not energy efficient enough tbh
						// if (Memory.economyArena) {
						// 	targetCount = 0;
						// }
						// else {							
							if (effectiveEnergy === undefined) effectiveEnergy = this.room.calcEffectiveEnergy();
							if (effectiveEnergy > constants.ROOM_ENERGY_NO_SOLO_MINERS && !Memory.season3) {

								var minerals = []
								for (var roomName of this.room.keeperMineRooms) {
									if (Game.rooms[roomName] && !Game.rooms[roomName].centreRoom && Game.time - (Memory.rooms[roomName].lastSKM || 0) > 1350) {
										if (Memory.usedRemotes.includes(roomName)) continue
										if (this.room.effectiveLevel >= 7 && this.room.energyCapacityAvailable >= 5000) {
											minerals = minerals.concat(Game.rooms[roomName].find(FIND_MINERALS, {
												filter: (mineral) => {
													if (!marketTrader.isMineralRequired(mineral.mineralType)) {
														return false
													}

													return (mineral.mineralAmount > 0)
												}
											}));
										}
									}
								}

								targetCount = minerals.length;
							}
						// }

					}
					else if (role == "soloCentreMiner") {
						if (effectiveEnergy === undefined) effectiveEnergy = this.room.calcEffectiveEnergy();

						if (effectiveEnergy > constants.ROOM_ENERGY_NO_MINERS) {

							var minerals = []
							for (var roomName of this.room.keeperMineRooms) {
								if (Game.rooms[roomName] && Game.rooms[roomName].centreRoom) {
									if (this.room.effectiveLevel >= 7 && this.room.energyCapacityAvailable > 5000) {
										if (Memory.usedRemotes.includes(roomName)) continue
										minerals = minerals.concat(Game.rooms[roomName].find(FIND_MINERALS, {
											filter: (mineral) => {
												if (!marketTrader.isMineralRequired(mineral.mineralType)) {
													return false
												}


												return (mineral.mineralAmount > 0)
											}
										}));
									}
								}
							}

							targetCount = minerals.length;
						}
					}

					if (targetCount > 0) {
						var currentOfRole

						// Already checked we need one
						if (!alreadyCheckedOwned) {
							let sharedHarvesterRoles = ["harvester", "bHarvester"]

							if (roomMemory.ownedCreeps[role] != undefined) {
								let isHarvester = ["harvester", "keeperHarvester2", "doubleHarvester", "centralHarvester", "bHarvester"].includes(role)

								// Build based on dying things. Shouldn't cost much CPU, but building creeps in the first place costs CPU.
								// Will occasionally cock it up due to renew
								if (Game.cpu.bucket > 2500 && role != "sbs" && !isHarvester) {
									let powerMod = 1

									currentOfRole = _.filter(roomMemory.ownedCreeps[role],
										function(creepName) {
											if (!Game.creeps[creepName]) return false;
											if (Game.creeps[creepName].spawning) return true;

											var design = creepCreator.getDesignForEnergyCap(role, this.room.energyCapacityAvailable, roomMemory.spawnUtilization > HIGH_UTIL_THRESH, false, willUseRoads)
											return Game.creeps[creepName].ticksToLive > ((design.length + Game.creeps[creepName].body.length) / 2) * CREEP_SPAWN_TIME + 10;
										},
										this
									).length;

									// console.log(role, roomMemory.ownedCreeps[role].length, _.filter(roomMemory.ownedCreeps[role],
									// 	function(creepName) {
									// 		return Game.creeps[creepName] && Game.creeps[creepName].ticksToLive > creepCreator.getDesignForEnergyCap(role, this.room.energyCapacityAvailable, false).length * 3;
									// 	},
									// 	this
									// ).length)
								}
								else if (sharedHarvesterRoles.includes(role)) {
									currentOfRole = (roomMemory.ownedCreeps["harvester"] || []).length + (roomMemory.ownedCreeps["bHarvester"] || []).length
								}
								else {
									currentOfRole = roomMemory.ownedCreeps[role].length
								}
							}
							else {
								if (sharedHarvesterRoles.includes(role)) {
									currentOfRole = (roomMemory.ownedCreeps["harvester"] || []).length + (roomMemory.ownedCreeps["bHarvester"] || []).length
								}
								else {
									currentOfRole = 0;
								}
							}

							for (var roomSpawn of roomSpawns) {
								if (sharedHarvesterRoles.includes(role)) {
									if (sharedHarvesterRoles.includes(roomSpawn.memory.currentBuildingRole) || sharedHarvesterRoles.includes(lastRole)) {
										currentOfRole += 1;
									}
									if (sharedHarvesterRoles.includes(roomSpawn.memory.currentBuildingRemoteRole)) {
										currentOfRole += 1;
									}
								}
								else {									
									// console.log(roomSpawn.memory.currentBuildingRole, roomSpawn.memory.currentBuildingRemoteRole)
									if (roomSpawn.memory.currentBuildingRole == role || lastRole == role) {
										currentOfRole += 1;
									}
									if (roomSpawn.memory.currentBuildingRemoteRole == role) {
										currentOfRole += 1;
									}
								}
							}

						}

						if (currentOfRole < targetCount && !alreadyCheckedOwned) {
							// These three roles can interchange. Don't spawn a new one if I have a current one with that speciality
							if (role == "repairer") {
								for (let creepName of (roomMemory.ownedCreeps["builder"] || []).concat(roomMemory.ownedCreeps["upgrader"] || [])) {
									let creep = Game.creeps[creepName]
									if (!creep) continue
									if (creep.ticksToLive <= creep.body.length * 3 + 10) continue

									if (creep.mem.origRole == "repairer") {
										changeCreepRole(creep, roomMemory, "repairer")
										currentOfRole++
										if (currentOfRole >= targetCount) {
											break
										}
									}
								}
							}
							else if (role == "builder") {
								for (let creepName of (roomMemory.ownedCreeps["repairer"] || []).concat(roomMemory.ownedCreeps["upgrader"] || [])) {
									let creep = Game.creeps[creepName]
									if (!creep) continue
									if (creep.ticksToLive <= creep.body.length * 3 + 10) continue

									if (creep.mem.origRole == "builder") {
										changeCreepRole(creep, roomMemory, "builder")
										currentOfRole++
										if (currentOfRole >= targetCount) {
											break
										}
									}
								}
							}
							else if (role == "upgrader") {
								for (let creepName of (roomMemory.ownedCreeps["repairer"] || []).concat(roomMemory.ownedCreeps["builder"] || [])) {
									let creep = Game.creeps[creepName]
									if (!creep) continue
									if (creep.ticksToLive <= creep.body.length * 3 + 10) continue

									if (creep.mem.origRole == "upgrader") {
										changeCreepRole(creep, roomMemory, "upgrader")
										currentOfRole++
										if (currentOfRole >= targetCount) {
											break
										}
									}
								}
							}
						}

						if (currentOfRole < targetCount || alreadyCheckedOwned) {
							// Last term is used to balance out things of the same priority - it is < 1, so not going to span integer gaps
							priority -= currentOfRole / targetCount;

							if (priority > maxPriority) {
								maxPriority = priority;
								targetRole = role;
								targetExtraMemory = extraMemory
							}
						}
					}
				}
			}

			if (maxPriority > 0) {
				var requestRemote = false;
				if (spawnAvailable) {
					var result = this.newSpawn(this, targetRole, false, false, targetExtraMemory);

					for (var roomSpawn of roomSpawns) {
						roomSpawn.spawnUsed = true;
					}

					if (result == ERR_NOT_ENOUGH_ENERGY) {
						if (this.room.energyAvailable < this.room.energyCapacityAvailable * .5 || this.room.effectiveLevel < this.room.controller.level) {
							requestRemote = true;
						}
					}
					else {
						return;
					}
				}
				else {
					if (this.room.memory.spawnUtilization > 0.75) {
						requestRemote = true;
					}
				}

				// Some remotes don't work
				if (requestRemote &&
					targetRole != "reserver" &&
					targetRole != "miner" &&
					targetRole != "season5ThoriumMiner" &&
					targetRole != "soloKeeperMiner" &&
					targetRole != "soloCentreMiner" &&
					targetRole != "upgrader" &&
					targetRole != "baseManager" &&
					targetRole != "sbs" &&
					targetRole != "ss" &&
					targetRole != "tankChildRoom" &&
					targetRole != "rangedChildRoom" &&
					targetRole != "healerChildRoom" &&
					targetRole != "transporter" &&
					targetRole != "bHarvester" &&
					targetRole != "powerShuffler" &&
					targetRole != "pioneer") {
					this.room.remoteRequestRole = targetRole;
					return;
				}
			}
			else {
				this.room.noUsefulSpawns = true;
			}
		}


		// Ok, got to here and nobody has taken the spawn. Allow people to spawn from me.
		if (spawnAvailable && !alreadySpawnedInRoom) {
			this.room.availableForRemoteSpawn += 1;
		}
	}


	StructureSpawn.prototype.spawnPass2 = function(roomSpawns) {
		// This makes it more stable when we're util bound. Is that good?
		let mod = (Game.cpu.bucket > 9000 || global.anySmallHaulers) ? 1 : 3


		// const alpha = Math.exp(-1/(((6000 / 3.))*roomSpawns.length))
		// Decay is 3k ticks. This function is called for every spawn, so multiple decay time by number of spawns
		// Used to be 2k

		let powerMod = 1
		for (let effect of (this.effects || [])) {
			if (effect.effect == PWR_OPERATE_SPAWN) {
				powerMod = POWER_INFO[PWR_OPERATE_SPAWN].effect[effect.level - 1]
			}
		}

		// 
		mod *= powerMod



		const alpha = Math.exp(-1/(3000 * roomSpawns.length / mod))
		// const alpha = Math.exp(-1/((Game.cpu.bucket > 9000 ? 4000 : (4000 / 3.))*roomSpawns.length))
		this.room.memory.spawnUtilization = alpha * (this.room.memory.spawnUtilization || 0) + (1 - alpha) * (this.spawnUsed ? 1 : (this.spawnSkipped ? 0.5 : 0));

		// Remote spawning ain't going so well across SK rooms.

		if (!this.room.remoteRequestRole) return

		var bestroomSpawn = getBestroomSpawn(this)
		if (bestroomSpawn) {
			if (!bestroomSpawn.init) bestroomSpawn.initFixedValues()
			if (!this.init)			 this.initFixedValues();
			var result = bestroomSpawn.newSpawn(this, this.room.remoteRequestRole, false, false, {})
			if (result == OK) {
				console.log("Remote spawn!", this.room.remoteRequestRole, "to", this.room.name, "from", bestroomSpawn.room.name)
				bestroomSpawn.room.availableForRemoteSpawn -= 1;
			}
		}


		// Why not delete this if taken
		// delete this.room.remoteRequestRole
	}

	StructureSpawn.prototype.spawnRambo = function(mem) {
		let rambo
		if (Memory.season2) {
			let modeHeal = 14 * 4
			let modeRanged = 16 * 4
			let modeTough = 8

			let requiredRanged = Math.ceil(Math.min(modeTough * 100 / 0.3, modeHeal * HEAL_POWER / 0.3) / (2 * RANGED_ATTACK_POWER));
			let requiredTough = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER / 100) * 0.3)
			let requiredHeal = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER) * 0.3 / (HEAL_POWER))

			// Sanity
			requiredRanged = Math.max(20, requiredRanged) * 4
			requiredTough = Math.max(4, requiredTough)
			requiredHeal = Math.max(8, requiredHeal) * 4

			if (Math.ceil(requiredRanged / 4) + requiredTough + Math.ceil(requiredHeal / 4) <= Math.round(4 * MAX_CREEP_SIZE / 5)) {
				rambo = creepCreator.createBestRanged(this.room, true, true, true, this.room.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)			
			}
			else {
				// I think this build still gets a reasonable balance. 
				// We can't nessessarily 2v1 them
				requiredRanged = Math.ceil(Math.min(modeTough * 100 / 0.3, modeHeal * HEAL_POWER / 0.3) / (RANGED_ATTACK_POWER)) + 1;

				// But they can't 2v1 us.
				requiredTough = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER / 100) * 0.3)
				requiredHeal = Math.ceil((2 * modeRanged * RANGED_ATTACK_POWER) * 0.3 / (HEAL_POWER))
				
				// Sanity
				requiredRanged = Math.max(20, requiredRanged) * 4
				requiredTough = Math.max(4, requiredTough)
				requiredHeal = Math.max(8, requiredHeal) * 4


				if (Math.ceil(requiredRanged / 4) + requiredTough + Math.ceil(requiredHeal / 4) <= Math.round(4 * MAX_CREEP_SIZE / 5)) {
					rambo = creepCreator.createBestRanged(this.room, true, true, true, this.room.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
				}
				else {
					// Ok, so I guess they're packing a punch? Try to survive 1v1!
					// I can damage them in 1v1
					requiredRanged = Math.ceil(Math.min(modeTough * 100 / 0.3, modeHeal * HEAL_POWER / 0.3) / RANGED_ATTACK_POWER) + 1;
					// They can't damage me in 1v1
					requiredTough = Math.ceil((modeRanged * RANGED_ATTACK_POWER / 100) * 0.3) + 1
					requiredHeal = Math.ceil((modeRanged * RANGED_ATTACK_POWER) * 0.3 / (HEAL_POWER)) + 1

					// Sanity
					requiredRanged = Math.max(20, requiredRanged) * 4
					requiredTough = Math.max(4, requiredTough)
					requiredHeal = Math.max(8, requiredHeal) * 4

					if (Math.ceil(requiredRanged / 4) + requiredTough + Math.ceil(requiredHeal / 4) <= Math.round(4 * MAX_CREEP_SIZE / 5)) {
						rambo = creepCreator.createBestRanged(this.room, true, true, true, this.room.energyCapacityAvailable, requiredRanged, requiredHeal, requiredTough, true)
					}
				}
			}

			if (!rambo) {
				console.log("Default rambo")
			}
		}

		if (!rambo) {
			rambo = creepCreator.createBestRanged(this.room, true, true, true, this.room.energyCapacityAvailable, undefined)
		}



		for (let boost in rambo.boosts) {
			this.room.requestAvailableBoost(boost)
		}

		mem = _.clone(mem) || {};
		Object.assign(mem, {"targetBoosts": rambo.boosts})

		// console.log(JSON.stringify(extraMemory))

		this.addPrioritySpawn("ranged", mem, undefined, rambo.body);

	
	}

	// Inteded to be used manually
	StructureSpawn.prototype.attackWithRambo = function(targetRoom) {
		let rambo = creepCreator.createRambo(this.room, [targetRoom], true, true)

		if (!rambo.body.length) {
			return
		}

		for (let boost in rambo.boosts) {
			this.room.requestAvailableBoost(boost)
		}

		let mem = {targetRoom, targetBoosts: rambo.boosts}

		console.log(this.room.name, "Rambo spawning for", targetRoom)

		this.addPrioritySpawn("ranged", mem, undefined, rambo.body);

	
	}


	StructureSpawn.prototype.spawnFromCreepCreator = function(role, mem, creationFunc, creationArgs) {
		let retObj = creationFunc(...creationArgs)

		if (retObj.body) {
			mem = _.clone(mem) || {};
			Object.assign(mem, {"targetBoosts": retObj.boosts})

			this.addPrioritySpawn(role, mem, undefined, retObj.body);
			console.log("Spawning", role, JSON.stringify(mem), JSON.stringify(retObj))
		}
	}

}

