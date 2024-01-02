"use strict";

const roomIntel = require('roomIntel');
const combatManager = require('combatManager');
const pathCache = require('pathCache');
const snakeAI = require('snakeAI');
const util = require('util');
const safeRoute = require('safeRoute');
const missionInfo = require('missionInfo');

const roomAI = require("roomAI")

// 32
const powerCreepNames = [
	"Tony",
	"Shere Khan",
	"Hobbes",
	"Dawon",
	"Byakko",
	"Tygra",
	"Bengali",
	"Javan",
	"Caspin",
	"Richard Parker",
	"Stelmaria",
	"Paws",
	"Vitaly",
	"TeX",
	"Tawky Tawny",
	"Tyger",
	"Cool Cat",
	"Patrina",
	"Rajah",
	"Jacob",
	"Melati",
	"Garfield",
	"Amber",
	"Edan",
	"Kano",
	"Maynard",
	"Rayas",
	"Ryker",
	"Koumal",
	"Sangha",
	"Suzy",
	"Machli"]


const POWER_CREEP_TYPE_BOOTSTRAP = 0;
const POWER_CREEP_TYPE_ASSAULT_SPAWNER = 1;
const POWER_CREEP_TYPE_ECONOMY = 2;
const POWER_CREEP_TYPE_ECONOMY_1 = 21;
const POWER_CREEP_TYPE_ECONOMY_2 = 22;
const POWER_CREEP_TYPE_ECONOMY_3 = 23;
const POWER_CREEP_TYPE_ECONOMY_4 = 24;
const POWER_CREEP_TYPE_ECONOMY_5 = 25;
const POWER_CREEP_TYPE_ROOM_ATTACK = 3;
const POWER_CREEP_TYPE_ROOM_ATTACK_A = 31;
const POWER_CREEP_TYPE_ROOM_ATTACK_B = 32;
const POWER_CREEP_TYPE_ROOM_DEFEND = 4;

const POWER_CREEP_TYPE_SEASONAL = 2;
const POWER_CREEP_TYPE_SEASONAL_DEFEND = 4;
const POWER_CREEP_TYPE_SEASONAL_POWER = 5;
const POWER_CREEP_TYPE_SEASONAL_OP_GEN = 6;
const POWER_CREEP_TYPE_SEASONAL_MINERAL = 7;

var powerCreepLevels;
var POWER_CREEP_ORDER;
var POWER_CREEP_ORDER_PSERVER;
var POWER_CREEP_ORDER_TIMED;
var POWER_CREEP_ORDER_SEASONAL;
var POWER_CREEP_ORDER_SEASON3;
var POWER_CREEP_ORDER_SEASON5;

powerCreepLevels = {
	// Low level rooms. Doesn't have to be superpowerd.
	// Doubles as economy/room defense
	[POWER_CREEP_TYPE_BOOTSTRAP]: {priorities: [[PWR_REGEN_SOURCE, 5], [PWR_GENERATE_OPS, 5], [PWR_OPERATE_SPAWN, 5], [PWR_OPERATE_TOWER, 5], [PWR_FORTIFY, 5]], maxLevel: 16, minLevel: 2},
	
	// Don't need top level operate extension. 
	[POWER_CREEP_TYPE_ASSAULT_SPAWNER]: {priorities: [[PWR_OPERATE_SPAWN, 5], [PWR_OPERATE_EXTENSION, 4], [PWR_GENERATE_OPS, 5], [PWR_REGEN_SOURCE, 5], [PWR_OPERATE_FACTORY, 1], [PWR_OPERATE_LAB, 4], [PWR_FORTIFY, 5]], maxLevel: 25, minLevel: 6},


	[POWER_CREEP_TYPE_ECONOMY]: {priorities: [[PWR_GENERATE_OPS, 5], [PWR_REGEN_SOURCE, 5], [PWR_OPERATE_EXTENSION, 2], [PWR_OPERATE_LAB, 4], [PWR_FORTIFY, 4], [PWR_OPERATE_SPAWN, 1]], maxLevel: 25, minLevel: 3},

	[POWER_CREEP_TYPE_ECONOMY_1]: {priorities: [[PWR_GENERATE_OPS, 2],
												[PWR_OPERATE_FACTORY, 1]], maxLevel: 3, minLevel: 3},

	[POWER_CREEP_TYPE_ECONOMY_2]: {priorities: [[PWR_OPERATE_FACTORY, 2], 
												[PWR_GENERATE_OPS, 2]], maxLevel: 4, minLevel: 4},

	[POWER_CREEP_TYPE_ECONOMY_3]: {priorities: [[PWR_REGEN_SOURCE, 4], 
												[PWR_GENERATE_OPS, 2],
												[PWR_OPERATE_LAB, 4],
												[PWR_OPERATE_SPAWN, 1],
												[PWR_OPERATE_FACTORY, 3],
												[PWR_GENERATE_OPS, 4],
												[PWR_OPERATE_SPAWN, 4],
												[PWR_OPERATE_EXTENSION, 2]], maxLevel: 19, minLevel: 8},

	[POWER_CREEP_TYPE_ECONOMY_4]: {priorities: [[PWR_REGEN_SOURCE, 3], 
												[PWR_GENERATE_OPS, 3], 
												[PWR_OPERATE_LAB, 2],
												[PWR_OPERATE_SPAWN, 2], 
												[PWR_OPERATE_FACTORY, 4],
												[PWR_REGEN_SOURCE, 4],
												[PWR_GENERATE_OPS, 4],
												[PWR_OPERATE_LAB, 4],
												[PWR_OPERATE_SPAWN, 4], 
												[PWR_OPERATE_EXTENSION, 2]], maxLevel: 20, minLevel: 15},

	[POWER_CREEP_TYPE_ECONOMY_5]: {priorities: [[PWR_REGEN_SOURCE, 4], 
												[PWR_GENERATE_OPS, 4], 
												// [PWR_OPERATE_EXTENSION, 4], 
												[PWR_OPERATE_LAB, 4], 
												[PWR_OPERATE_SPAWN, 4], 
												[PWR_OPERATE_FACTORY, 5],
												[PWR_REGEN_SOURCE, 5], 
												[PWR_OPERATE_SPAWN, 5], 
												[PWR_OPERATE_OBSERVER, 2],
												[PWR_OPERATE_EXTENSION, 4]], maxLevel: 25, minLevel: 23},

	// Ideally want four
	[POWER_CREEP_TYPE_ROOM_ATTACK_A]: {priorities: [[PWR_DISRUPT_TERMINAL, 5], [PWR_DISRUPT_SPAWN, 5], [PWR_DISRUPT_TOWER, 5], [PWR_GENERATE_OPS, 5], [PWR_OPERATE_FACTORY, 2], [PWR_SHIELD, 5], [PWR_FORTIFY, 5]], maxLevel: 25, minLevel: 6},
	[POWER_CREEP_TYPE_ROOM_ATTACK_B]: {priorities: [[PWR_DISRUPT_SPAWN, 5], [PWR_DISRUPT_TOWER, 5], [PWR_DISRUPT_TERMINAL, 5], [PWR_GENERATE_OPS, 5], [PWR_OPERATE_FACTORY, 3], [PWR_SHIELD, 5], [PWR_FORTIFY, 5]], maxLevel: 25, minLevel: 6},

	// Doubles as assault spawner. 
	// Don't need a lot of op extension as defense creeps don't use heal.
	[POWER_CREEP_TYPE_ROOM_DEFEND]: {priorities: [[PWR_GENERATE_OPS, 1], [PWR_OPERATE_TOWER, 5], [PWR_FORTIFY, 5], [PWR_GENERATE_OPS, 4], [PWR_OPERATE_SPAWN, 5], [PWR_OPERATE_FACTORY, 1], [PWR_REGEN_SOURCE, 5], [PWR_OPERATE_EXTENSION, 3]], maxLevel: 25, minLevel: 1},
}

if (Game.shard.name == "shardSeason" && Memory.season3) {
	powerCreepLevels[POWER_CREEP_TYPE_ECONOMY] = {priorities: [[PWR_GENERATE_OPS, 2], [PWR_OPERATE_SPAWN, 4], [PWR_GENERATE_OPS, 3], [PWR_REGEN_SOURCE, 5], [PWR_GENERATE_OPS, 5], [PWR_FORTIFY, 5], [PWR_OPERATE_POWER, 5], [PWR_OPERATE_TOWER, 5]], maxLevel: 17, minLevel: 1}
	powerCreepLevels[POWER_CREEP_TYPE_SEASONAL_POWER] = {priorities: [[PWR_GENERATE_OPS, 2], [PWR_OPERATE_SPAWN, 5], [PWR_GENERATE_OPS, 3], [PWR_REGEN_SOURCE, 4], [PWR_GENERATE_OPS, 5], [PWR_OPERATE_POWER, 5], [PWR_FORTIFY, 5], [PWR_OPERATE_TOWER, 5]], maxLevel: 25, minLevel: 1}
	// powerCreepLevels[POWER_CREEP_TYPE_SEASONAL_DEFEND] = {priorities: [[PWR_GENERATE_OPS, 4], [PWR_OPERATE_SPAWN, 3], [PWR_FORTIFY, 5], [PWR_REGEN_SOURCE, 5], [PWR_OPERATE_SPAWN, 5], [PWR_OPERATE_TOWER, 5]], maxLevel: 20, minLevel: 1}
	// Short replacement to level it in peace time
	powerCreepLevels[POWER_CREEP_TYPE_SEASONAL_DEFEND] = {priorities: [[PWR_GENERATE_OPS, 4], [PWR_OPERATE_SPAWN, 4], [PWR_REGEN_SOURCE, 5], [PWR_FORTIFY, 5], [PWR_OPERATE_SPAWN, 5], [PWR_OPERATE_TOWER, 5]], maxLevel: 17, minLevel: 1}
	powerCreepLevels[POWER_CREEP_TYPE_SEASONAL_OP_GEN] = {priorities: [[PWR_GENERATE_OPS, 2], [PWR_OPERATE_SPAWN, 1]], maxLevel: 3, minLevel: 3}
}

if (Game.shard.name == "shardSeason" && Memory.season4) {
	// Overrite these
	powerCreepLevels[POWER_CREEP_TYPE_ECONOMY_1] = {priorities: [[PWR_OPERATE_FACTORY, 1],
																 [PWR_GENERATE_OPS, 2]], maxLevel: 3, minLevel: 1}

	powerCreepLevels[POWER_CREEP_TYPE_ECONOMY_2] = {priorities: [[PWR_OPERATE_FACTORY, 2],
																 [PWR_GENERATE_OPS, 2],
																 ], maxLevel: 4, minLevel: 3}

	powerCreepLevels[POWER_CREEP_TYPE_ECONOMY_3] = {priorities: [[PWR_GENERATE_OPS, 4],
																 [PWR_OPERATE_FACTORY, 3],
																 [PWR_OPERATE_SPAWN, 2],
																 [PWR_OPERATE_EXTENSION, 1]], maxLevel: 9, minLevel: 9}

	powerCreepLevels[POWER_CREEP_TYPE_ECONOMY_4] = {priorities: [[PWR_GENERATE_OPS, 4], 
																[PWR_OPERATE_FACTORY, 4],
																[PWR_REGEN_SOURCE, 4],
																[PWR_OPERATE_SPAWN, 3], 
																[PWR_OPERATE_EXTENSION, 2]], maxLevel: 17, minLevel: 16}

	powerCreepLevels[POWER_CREEP_TYPE_ECONOMY_5] = {priorities: [[PWR_GENERATE_OPS, 4], 
																// [PWR_OPERATE_EXTENSION, 4], 												 
																[PWR_OPERATE_FACTORY, 5],
																[PWR_GENERATE_OPS, 5], 
																[PWR_REGEN_SOURCE, 5], 
																[PWR_OPERATE_SPAWN, 4], 
																[PWR_OPERATE_OBSERVER, 2],
																[PWR_OPERATE_EXTENSION, 4]], maxLevel: 24, minLevel: 23}

}

if (Game.shard.name == "shardSeason" && Memory.season5) {
	// Overrite these
	powerCreepLevels[POWER_CREEP_TYPE_SEASONAL_MINERAL] = {priorities: [[PWR_REGEN_MINERAL, 5],
																 [PWR_REGEN_SOURCE, 5],
																 [PWR_GENERATE_OPS, 5],
																 [PWR_OPERATE_SPAWN, 5],
																 [PWR_OPERATE_EXTENSION, 5],
																 [PWR_OPERATE_TOWER, 5]], maxLevel: 15, minLevel: 1}
}

POWER_CREEP_ORDER = [
	[
		POWER_CREEP_TYPE_BOOTSTRAP,
		POWER_CREEP_TYPE_ASSAULT_SPAWNER,
		POWER_CREEP_TYPE_ECONOMY_1,
		POWER_CREEP_TYPE_ECONOMY_2,
		POWER_CREEP_TYPE_ROOM_ATTACK_A,
		POWER_CREEP_TYPE_ROOM_DEFEND
	], // 6 6
	[
		POWER_CREEP_TYPE_ECONOMY_3,
		POWER_CREEP_TYPE_ECONOMY_4,
		POWER_CREEP_TYPE_ECONOMY_5,
		POWER_CREEP_TYPE_ROOM_ATTACK_B,
		POWER_CREEP_TYPE_ASSAULT_SPAWNER,
	], // 5 11
	[
		POWER_CREEP_TYPE_ECONOMY_1,
		POWER_CREEP_TYPE_ECONOMY_2,
		POWER_CREEP_TYPE_ECONOMY_3,
		POWER_CREEP_TYPE_ECONOMY_4,
		POWER_CREEP_TYPE_ECONOMY_5,
	], // 5 16
	[
		POWER_CREEP_TYPE_ECONOMY_1,
		POWER_CREEP_TYPE_ECONOMY_2,
		POWER_CREEP_TYPE_ROOM_ATTACK_A,
		POWER_CREEP_TYPE_ROOM_ATTACK_B,
	], // 4 20
	[
		POWER_CREEP_TYPE_ECONOMY_1,
		POWER_CREEP_TYPE_ECONOMY_2,
		POWER_CREEP_TYPE_ECONOMY_3,
		POWER_CREEP_TYPE_ASSAULT_SPAWNER,
	], // 4 24
	[
		POWER_CREEP_TYPE_ROOM_ATTACK_A,
		POWER_CREEP_TYPE_ROOM_ATTACK_B,
	], // 2 26
	[
		POWER_CREEP_TYPE_ROOM_ATTACK_A,
		POWER_CREEP_TYPE_ROOM_ATTACK_B,
	], // 2 28
	[
		POWER_CREEP_TYPE_ROOM_ATTACK_A,
		POWER_CREEP_TYPE_ROOM_ATTACK_B,
	], // 2 30
	[
		POWER_CREEP_TYPE_ROOM_ATTACK_A,
		POWER_CREEP_TYPE_ROOM_ATTACK_B,
	], // 2 32
];

POWER_CREEP_ORDER_TIMED = [
	[
		POWER_CREEP_TYPE_ECONOMY_1
	],
	[
		POWER_CREEP_TYPE_ROOM_DEFEND
	],
];

POWER_CREEP_ORDER_PSERVER = [
	[
		POWER_CREEP_TYPE_ECONOMY_1
	],
	[
		POWER_CREEP_TYPE_ECONOMY_2
	],
	[
		POWER_CREEP_TYPE_BOOTSTRAP,
		POWER_CREEP_TYPE_ASSAULT_SPAWNER
	]
];

POWER_CREEP_ORDER_SEASON3 = [
	[
		// TODO: Change this guy to power
		POWER_CREEP_TYPE_SEASONAL_POWER // 1
	],
	[
		POWER_CREEP_TYPE_SEASONAL_POWER // 3
	],
	[
		POWER_CREEP_TYPE_SEASONAL_DEFEND // 1
	],
	[
		POWER_CREEP_TYPE_SEASONAL_OP_GEN, // 2
		POWER_CREEP_TYPE_SEASONAL_OP_GEN, // 2
		POWER_CREEP_TYPE_SEASONAL_OP_GEN, // 2
		POWER_CREEP_TYPE_SEASONAL_OP_GEN // 2
	],
	[
		POWER_CREEP_TYPE_SEASONAL_DEFEND // 1
	],
	[
		POWER_CREEP_TYPE_SEASONAL_DEFEND // 1
	],
	[
		POWER_CREEP_TYPE_SEASONAL_POWER // 1
	],
	[
		POWER_CREEP_TYPE_SEASONAL_DEFEND // 1
	],
	[
		POWER_CREEP_TYPE_SEASONAL_DEFEND // 1
	],
	[
		POWER_CREEP_TYPE_SEASONAL_DEFEND // 1
	],
];

POWER_CREEP_ORDER_SEASON5 = [
	[
		POWER_CREEP_TYPE_SEASONAL_MINERAL // 1
	],
];

POWER_CREEP_ORDER_SEASONAL = [
	[
		POWER_CREEP_TYPE_ECONOMY_1,
		POWER_CREEP_TYPE_ECONOMY_2,
		POWER_CREEP_TYPE_ECONOMY_3,
		POWER_CREEP_TYPE_ECONOMY_4,  
		POWER_CREEP_TYPE_ECONOMY_5,
		POWER_CREEP_TYPE_ECONOMY_2,
		POWER_CREEP_TYPE_ECONOMY_1,
	],
];

// Temporary as pservers have busted commodities
// POWER_CREEP_ORDER_PSERVER = [
// 	[
// 		POWER_CREEP_TYPE_BOOTSTRAP,
// 	],
// 	[
// 		POWER_CREEP_TYPE_ASSAULT_SPAWNER
// 	],
// 	[
// 		POWER_CREEP_TYPE_ECONOMY_1
// 	],
// 	[
// 		POWER_CREEP_TYPE_ECONOMY_2
// 	],

// ];

function getNextPower(powerCreep) {
	let priorities = powerCreepLevels[powerCreep.mem.type].priorities;

	for (var priority of priorities) {
		let power = priority[0];

		// if (Memory.privateServer && power == PWR_OPERATE_FACTORY) {
		// 	continue
		// }

		let maxLevel = priority[1];
		let currentLevel = powerCreep.powers[power] ? powerCreep.powers[power].level : 0;

		if (currentLevel >= maxLevel) continue;

		if (powerCreep.level >= POWER_INFO[power].level[currentLevel]) {
			return power;
		}
	}
}


function spawnPowerCreepForHomeRoom(powerCreep) {
	let bestRoom;
	let minDist = Infinity;

	for (var myRoom of Game.myRooms) {
		if (!myRoom.powerSpawn) continue;

		let dist = safeRoute.getSafeRouteCost(powerCreep.mem.homeRoom, myRoom.name, true); 

		if (dist < minDist && dist * 50 < POWER_CREEP_LIFE_TIME * 0.25) {
			minDist = dist;
			bestRoom = myRoom
		}
	}

	if (bestRoom) {
		return powerCreep.spawn(bestRoom.powerSpawn);
	}
	return -Infinity
}

// Return OK if we're carrying on
// Otherwise return an error and pick a new power
function activatePowerInCurrentRoom(powerCreep) {
	if (powerCreep.pos.isNearTo(powerCreep.room.controller)) {
		return powerCreep.enableRoom(powerCreep.room.controller)
	}

	let mem = powerCreep.mem;
	if (mem.pTX != powerCreep.room.controller.pos.x || mem.pTY != powerCreep.room.controller.pos.y) {
		let res = pathCache.getPath(powerCreep.pos, powerCreep.room.controller, 1, 5, 0, false, {maxRooms: 1});

		if (!res.incomplete) {
			mem.pTX = powerCreep.room.controller.x
			mem.pTY = powerCreep.room.controller.y
			mem.path = res.path;
		}
		else {
			powerCreep.room.memory.controllerUnreachable = 1;
			return -Infinity;
		}
	}

	powerCreep.uncachedMoveTo(powerCreep.room.controller, 1, {maxRooms: 1})
	powerCreep.moving = 1;

	return OK
}


function runGenerateOps(powerCreep) {
	if (!powerCreep.room.controller || powerCreep.room.controller.isPowerEnabled) {
		let ret = powerCreep.usePower(PWR_GENERATE_OPS);
		powerCreep.usedPower = ret == OK;
		return ret;
	}
	else if (!powerCreep.room.memory.controllerUnreachable && !powerCreep.moveOrdersGiven) {
		return activatePowerInCurrentRoom(powerCreep);
	}
}

function runAsHauler(powerCreep, secondCall, endOfDelivery) {
	//if (!secondCall && (!powerCreep.room.controller || powerCreep.room.controller.isPowerEnabled) && powerCreep.store.getFreeCapacity()) {
	if (!secondCall && powerCreep.store.getFreeCapacity()) {
		runGenerateOps(powerCreep)
		if (powerCreep.moving) {
			return
		}
	}

	// Copied heavily from base manager
	if (powerCreep.pos.roomName != powerCreep.mem.homeRoom) {
		powerCreep.cachedMoveTo(new RoomPosition(25, 25, powerCreep.mem.homeRoom), 20, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
		return;
	}


	let moveOptions;

	if (powerCreep.room.dangerous) {
		moveOptions = {"maxRooms" : 1, "avoidHostiles" : 10};
	}
	else {
		moveOptions = {"maxRooms" : 1};
	}

	// This is written for season 3 where we're only allowed one spawn per room so we need to keep pumping it
	// and we're likely to still be util bound while wanting to pump it, so want to continue hauling.
	if (Memory.season3) {		
		if (!secondCall && powerCreep.room.storage) {
			let shouldOpSpawn = powerCreep.room.storage.store[RESOURCE_OPS] + powerCreep.store[RESOURCE_OPS] >= POWER_INFO[PWR_OPERATE_SPAWN].ops && (runOperateSpawn(powerCreep, true) == OK)

			if (shouldOpSpawn) {
				console.log(powerCreep, "operating spawn")
				if (powerCreep.store[RESOURCE_OPS] >= POWER_INFO[PWR_OPERATE_SPAWN].ops) {
					runOperateSpawn(powerCreep, false)
				}
				else {
					if (!powerCreep.pos.inRangeTo(powerCreep.room.storage, 1)) {
						powerCreep.uncachedMoveTo(powerCreep.room.storage, 1, moveOptions)
					}
					else {
						if (powerCreep.store[RESOURCE_ENERGY]) {
							powerCreep.transfer(powerCreep.room.storage, RESOURCE_ENERGY)
						}
						else {
							powerCreep.withdraw(powerCreep.room.storage, RESOURCE_OPS, POWER_INFO[PWR_OPERATE_SPAWN].ops - powerCreep.store[RESOURCE_OPS])
						}
					}
				}
				return
			}
		}

		if (powerCreep.mem.state) {
			delete powerCreep.mem.state.targetSpawn
		}
	}
	else if (Memory.season4) {
		if (!secondCall) {
			let primaryType = powerCreep.mem.type
			let typeRoomAssignment = primaryType
			if (primaryType >= 21 && primaryType < 30 && powerCreep.powers[PWR_OPERATE_FACTORY]) {
				typeRoomAssignment = 20 + powerCreep.powers[PWR_OPERATE_FACTORY].level
			}
			// Our home room is invalid, run generic to reset it
			// Can also be I have two creeps on the same one when I want to spread 'em, so let it randomly change as well
			if (!global.powerCreepDistribution[typeRoomAssignment][powerCreep.mem.homeRoom] || 
				((Memory.rooms[powerCreep.mem.homeRoom].lastAssignedPowerCreeps || []).length > 1 && (Math.random() < 0.001 || Memory.debugSeason4PCMove))) {
				delete Memory.debugSeason4PCMove
				return runGeneric(powerCreep, powerCreep.mem.type)
			}
		}

		if (!secondCall && powerCreep.room.storage && powerCreep.room.terminal) {
			let shouldOpFactory = (runOperateFactory(powerCreep, true) == OK)

			if (shouldOpFactory) {
				let hasEnoughOps = powerCreep.room.terminal.store[RESOURCE_OPS] + 
								  powerCreep.store[RESOURCE_OPS] >= POWER_INFO[PWR_OPERATE_FACTORY].ops

				if (hasEnoughOps) {
					console.log(powerCreep, "operating factory")
					if (powerCreep.store[RESOURCE_OPS] >= POWER_INFO[PWR_OPERATE_FACTORY].ops) {
						runOperateFactory(powerCreep, false)
					}
					else {
						if (!powerCreep.pos.inRangeTo(powerCreep.room.terminal, 1)) {
							powerCreep.uncachedMoveTo(powerCreep.room.terminal, 1, moveOptions)
						}
						else {
							if (powerCreep.store[RESOURCE_ENERGY]) {
								powerCreep.transfer(powerCreep.room.terminal, RESOURCE_ENERGY)
							}
							else {
								powerCreep.withdraw(powerCreep.room.terminal, RESOURCE_OPS, POWER_INFO[PWR_OPERATE_FACTORY].ops - powerCreep.store[RESOURCE_OPS])
							}
						}
					}
					return
				}
				else {
					// With true arg this just requests ops to the terminal
					opsBalancing(powerCreep, true)
				}
			}
		}

		if (powerCreep.mem.state) {
			delete powerCreep.mem.state.runOperateFactory
			delete powerCreep.mem.state.factoryTargetRoom
		}		
	}


	// if (creep.room.name == "W6N83") console.log("A", creep.name, creep.store.getUsedCapacity(), creep.mem.fT)
	if (!powerCreep.mem.fT && (powerCreep.getStoreUsedCapacity() - powerCreep.store[RESOURCE_OPS] == 0 || endOfDelivery)) {
		powerCreep.mem.f = 1;
		powerCreep.mem.dTgt = undefined;
	}
	if (powerCreep.mem.f && powerCreep.getStoreUsedCapacity() >= powerCreep.carryCapacity * 0.75) {
		powerCreep.mem.f = 0;
		powerCreep.mem.fT = undefined;
	}


	if (powerCreep.room.storage && powerCreep.store[RESOURCE_OPS] >= powerCreep.carryCapacity * 0.1) {
		powerCreep.uncachedMoveTo(powerCreep.room.storage, 1, moveOptions)
		powerCreep.transfer(powerCreep.room.storage, RESOURCE_OPS);
		return
	}
	// if (powerCreep.room.name == "W6N83") console.log("C", powerCreep.name, powerCreep.store.getUsedCapacity(), powerCreep.mem.fT)


	if (powerCreep.mem.f) {
		if (!powerCreep.mem.fT || Math.random() < 0.01) {
			// if (((powerCreep.mem.wT != undefined && Game.time < powerCreep.mem.wT) || powerCreep.mem.f == 2) && !powerCreep.room.dangerous) {
			let target = powerCreep.pos.findClosestByRange(FIND_TOMBSTONES, {
				filter: (structure) => {
					return structure.store[RESOURCE_ENERGY] > powerCreep.pos.getRangeToPos(structure.pos) * Memory.stats.yieldPerCPU * global.INTENT_CPU_COST;
				}
			});

			if (!target) {
				target = powerCreep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
					filter: (dropped) => {
						return dropped.resourceType == RESOURCE_ENERGY && dropped.amount > powerCreep.pos.getRangeToPos(dropped.pos) * Memory.stats.yieldPerCPU * global.INTENT_CPU_COST;
					}
				});
			}
			if (!target) {
				target = powerCreep.pos.findClosestByRange(powerCreep.room.containers, {
					filter: (structure) => {
						return structure.store[RESOURCE_ENERGY] > powerCreep.pos.getRangeToPos(structure.pos) * Memory.stats.yieldPerCPU * global.INTENT_CPU_COST && roomAI.isSourceContainer(structure);
					}
				});
			}

			if (target) {
				powerCreep.mem.fT = target.id;
			}
			else {
				let targets = [];
				if (powerCreep.room.storage) {						
					if (powerCreep.room.terminal) {
						if (powerCreep.room.factory && powerCreep.room.factory.store[RESOURCE_ENERGY] > 20000) {
							targets.push(powerCreep.room.factory)
						}
						else if (powerCreep.room.storage.store[RESOURCE_ENERGY] > powerCreep.room.terminal.store[RESOURCE_ENERGY] * 5) {
							targets.push(powerCreep.room.storage)
						}
						else {
							targets.push(powerCreep.room.terminal)	
						}
					}
					else if (powerCreep.room.storage.store[RESOURCE_ENERGY] > 0) {
						targets.push(powerCreep.room.storage)
					}
				}

				let target = powerCreep.pos.findClosestByRange(targets);

				if (!target) {
					target = powerCreep.pos.findClosestByRange(FIND_STRUCTURES, {
						filter: (structure) => {
							if (roomAI.isSourceContainer(structure)) {
								return false;
							}
							if (roomAI.isDropoffPoint(structure) && !roomAI.isInSpawnBattery(structure)) {
								return false;
							}
							if (structure.structureType == STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > (powerCreep.carryCapacity - powerCreep.getStoreUsedCapacity()) / 2) {
								return true;
							}
							if (structure.structureType == STRUCTURE_LINK && !roomAI.isEnergyEndPoint(structure) && !roomAI.isEnergyStartPoint(structure) && structure.energy > 0) {
								return true;
							}
							return false;
						}
					});
				}
			 	if (!target && !powerCreep.room.dangerous) {
					target = powerCreep.pos.findClosestByRange(FIND_TOMBSTONES, {
						filter: (structure) => {
							return structure.store[RESOURCE_ENERGY] > 0;
						}
					});
			 	}
			 	if (!target && !powerCreep.room.dangerous) {
					target = powerCreep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
						filter: (resource) => {
							return resource.resourceType == RESOURCE_ENERGY;
						}
					});
			 	}
			 	if (!target && !powerCreep.room.dangerous) {
					target = powerCreep.pos.findClosestByRange(powerCreep.room.containers, {
						filter: (structure) => {
							return structure.store[RESOURCE_ENERGY] > 0 && roomAI.isSourceContainer(structure);
						}
					});
			 	}

				if (target) {
					powerCreep.mem.fT = target.id;
				}
				else {
					// Nowhere to pick up. Nap.
					// if ((Game.cpu.bucket > 8250 || (global.anySmallHaulers && Game.cpu.bucket > 2000)) && Memory.rooms[powerCreep.mem.sR].spawnUtilization > 0.8 && Memory.rooms[powerCreep.mem.sR].ownedpowerCreeps["baseManager"] && Memory.rooms[powerCreep.mem.sR].ownedpowerCreeps["baseManager"].length == 1) {
					// 	powerCreep.renew = 1;
					// 	return this.runRenewer(powerCreep)
					// }
					// else {
					// 	let heavy = Game.time - (powerCreep.room.mem.spawningHeavyMission || -2000) < 2000
					// 	if (!heavy) {
					// 		powerCreep.mem.wT = Game.time + 10
					// 	}
					// }
				}
			}
		}

		if (powerCreep.mem.fT) {
			var target = Game.getObjectById(powerCreep.mem.fT)

			if (!target) {
				powerCreep.mem.fT = undefined;
				if (!secondCall) runAsHauler(powerCreep, true, false)
			}
			else {
				if (!powerCreep.pos.isNearToRoomObject(target)) {
					powerCreep.cachedMoveTo(target, 1, moveOptions);
					if (powerCreep.mem.mS > 5) {
						// if (powerCreep.room.name == "W6N83") console.log(powerCreep.name, "stuck")
						powerCreep.mem.fT = undefined;
					}

				}
				else if (!secondCall) {
					let ret;
					if (target.resourceType && target.resourceType == RESOURCE_ENERGY) {
						ret = powerCreep.pickup(target);
					}
					else {
						ret = powerCreep.withdraw(target, RESOURCE_ENERGY, Math.max(0, Math.round(powerCreep.store.getCapacity() * 0.8) - powerCreep.store[RESOURCE_ENERGY]));
					}

					if (ret != OK) {
						// if (powerCreep.room.name == "W6N83") console.log(powerCreep.name, ret)
						powerCreep.mem.fT = undefined;
						if (!secondCall) runAsHauler(powerCreep, true, false)
					}
				}
			}
		}
		else {
			powerCreep.mem.f = 1;
		}
	}
	else {
		if (powerCreep.mem.wT != undefined && Game.time < powerCreep.mem.wT) {
			delete powerCreep.mem.path
			return;
		}

		if (!powerCreep.mem.dTgt) {
			delete powerCreep.mem.path
			var targets = roomAI.getEnergyPriorityTargets(powerCreep.room);
			var target = powerCreep.pos.findClosestByRange(targets);

			if (target) {
				powerCreep.mem.dTgt = target.id
			}
		}

		if (powerCreep.mem.dTgt) {
			var target = Game.getObjectById(powerCreep.mem.dTgt);
			if (!target || (target.energyCapacity && target.energy == target.energyCapacity)) {
				delete powerCreep.mem.path
				delete powerCreep.mem.pTX
				delete powerCreep.mem.pTY
				delete powerCreep.mem.pTgtRoom
				powerCreep.mem.dTgt = undefined;
				return
			}

			// var targetEnergy
			// if (target.energy != undefined) targetEnergy = target.energy
			// else							targetEnergy = target.store[RESOURCE_ENERGY]

			target.expectedEnergy = powerCreep.getStoreUsedCapacity() + (target.expectedEnergy || 0)

			if (!powerCreep.pos.isNearTo(target)) {
				var moveRet = powerCreep.cachedMoveTo(target, 1, moveOptions);
				// var moveRet = powerCreep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}, ignorepowerCreeps: (powerCreep.mem.mS % 20) < 3, range: 1})

				// Maybe fill others?
				// if (target.structureType == STRUCTURE_EXTENSION) {

				// }

				// It's possible a harvester extension is unreachable.
				if (moveRet == ERR_NO_PATH || powerCreep.mem.mS >= (2 + (Math.random() < 0.5 ? 1 : 0))) {
					powerCreep.mem.dTgt = undefined;
					delete powerCreep.mem.path
				}

				if (powerCreep.mem.mS > 5) {
					powerCreep.mem.dTgt = undefined;
					delete powerCreep.mem.path
				}

				// Fill one, fill any
				if (target.structureType == STRUCTURE_EXTENSION) {
					if (powerCreep.pos.x > 0 && powerCreep.pos.x < 49 && powerCreep.pos.y > 0 && powerCreep.pos.y < 49) {
						var closeTarget = powerCreep.pos.findFirstInRange(FIND_MY_STRUCTURES, 1, {
							filter: function(struct) {
								return struct.structureType == STRUCTURE_EXTENSION && struct.energy < struct.energyCapacity;
							}
						});
						if (closeTarget) {
							if (powerCreep.transfer(closeTarget, RESOURCE_ENERGY) == OK) {
								let delta = Math.min(powerCreep.carry[RESOURCE_ENERGY], closeTarget.energyCapacity - closeTarget.energy);
								// Game.haulerTransferredEnergy += delta
								// powerCreep.room.haulerTransferredEnergy += delta
							}
						}
					}
				}
			}
			else if (!secondCall) {
				let ret = powerCreep.transfer(target, RESOURCE_ENERGY);
				if (ret == OK) {
					if (powerCreep.getStoreUsedCapacity() > target.energyCapacity - target.energy) {
						var targets = roomAI.getEnergyPriorityTargets(powerCreep.room);
						var newTarget = powerCreep.pos.findClosestByRange(targets);

						if (newTarget) {
							powerCreep.mem.dTgt = newTarget.id;
							newTarget.expectedEnergy = powerCreep.getStoreUsedCapacity() - (target.energyCapacity - target.energy) + (newTarget.expectedEnergy || 0)

							// var moveRet = powerCreep.moveTo(newTarget, {visualizePathStyle: {stroke: '#ffffff'}, ignorepowerCreeps: (powerCreep.mem.mS % 20) < 3, range: 1});
							var moveRet = powerCreep.cachedMoveTo(newTarget, 1, moveOptions);
							if (moveRet == ERR_NO_PATH) {
								powerCreep.mem.dTgt = undefined;
								delete powerCreep.mem.path
							}
						}
						else if (!roomAI.isEnergyEndPoint(target)) {									
							powerCreep.mem.dTgt = undefined;
							delete powerCreep.mem.path
							powerCreep.mem.f = 2;
						}
					}
					// Unless there's been a collision we can now move back to spawn. Collisions will be rare and should only cause momentary confusion...
					else {
						// this.runBaseManager(powerCreep, true, true)
					}
				}
				else {
					powerCreep.mem.dTgt = undefined
					delete powerCreep.mem.path
				}
			}
		}
		else {
			if (powerCreep.getStoreUsedCapacity() <= powerCreep.carryCapacity / 2) {
				powerCreep.mem.f = 2;
			}
		}
	}

	if (powerCreep.room.storage && powerCreep.pos.isNearToPos(powerCreep.room.storage.pos)) {
		powerCreep.transfer(powerCreep.room.storage, RESOURCE_OPS);
	}

	if (powerCreep.getStoreUsedCapacity() != powerCreep.carryCapacity && !secondCall) {
		if (powerCreep.room.storage && powerCreep.pos.isNearToPos(powerCreep.room.storage.pos)) {
			let amount = Math.round(powerCreep.store.getCapacity() * 0.8) - powerCreep.store[RESOURCE_ENERGY]
			if (amount > 0) {
				powerCreep.withdraw(powerCreep.room.storage, RESOURCE_ENERGY, amount);
			}
		}
	}


	powerCreep.grabBonusEnergy();


}


// TODO: Use my carry to carry shit
function runRegenSource(powerCreep, dryRun = false) {
	if (!powerCreep.mem.state.targetSource || !powerCreep.mem.state.targetSourcePos) {
		let sources = [];

		// if (Game.rooms[powerCreep.mem.homeRoom].defcon < 3) {
		// 	return -Infinity
		// }

		if (Memory.season5) {
			sources = sources.concat(Game.rooms[powerCreep.mem.homeRoom].find(FIND_SOURCES))
		} else {
			for (let roomName of Memory.rooms[powerCreep.mem.homeRoom].goodRooms) {
				if (Game.rooms[roomName] && !Game.rooms[roomName].dangerous && (roomName == powerCreep.mem.homeRoom || Game.rooms[powerCreep.mem.homeRoom].defcon == 5)) {
					sources = sources.concat(Game.rooms[roomName].find(FIND_SOURCES))
				}
			}
		}
		for (let roomName of Memory.rooms[powerCreep.mem.homeRoom].goodRooms) {
			if (Game.rooms[roomName] && !Game.rooms[roomName].dangerous && (roomName == powerCreep.mem.homeRoom || Game.rooms[powerCreep.mem.homeRoom].defcon == 5)) {
				sources = sources.concat(Game.rooms[roomName].find(FIND_SOURCES))
			}
		}

		// let numSources = POWER_INFO[PWR_REGEN_SOURCE].duration / POWER_INFO[PWR_REGEN_SOURCE].cooldown;
		let scoredSources = [];

		for (let source of sources) {
			// let effectRemaining = 0;

			let fail = false;
			for (var effect of (source.effects || [])) {
				if (effect.power == PWR_DISRUPT_SOURCE) {
					fail = true;
					break;
				}
				// else if (effect.power == PWR_REGEN_SOURCE) {
				// 	effectRemaining = effect.ticksRemaining
				// }
			}
			if (fail) continue;

			// if (effectRemaining > (powerCreep.powers[PWR_REGEN_SOURCE].cooldown || 0)) {
			// 	continue;
			// }

			// Higher is better
			let score = source.pos.roomName == powerCreep.mem.homeRoom ? 100 : 0
			if (Game.rooms[powerCreep.mem.homeRoom].storage) {
				score -= Game.rooms[powerCreep.mem.homeRoom].storage.pos.getHeuristicWorldRangeToPos(source.pos)
			}
			else {
				score -= powerCreep.pos.getHeuristicWorldRangeToPos(source.pos)
			}
			if (source.room.keeperRoom) {
				score -= 50;
			}
			// Negative score as sort is low->high
			scoredSources.push({source: source, score: -score})
		}

		let sortedSources = _.sortBy(scoredSources, "score");

		let bestSources = [sortedSources[0] ? sortedSources[0].source : null, 
						   sortedSources[1] ? sortedSources[1].source : null, 
						   sortedSources[2] ? sortedSources[2].source : null]

		let lowestTicksRemaining = Infinity;
		let targetSource

		for (let source of bestSources) {
			// Can have less than 3
			if (!source) break
			let ticksRemaining = 0;
			for (let effect of source.effects || []) {
				if (effect.power == PWR_REGEN_SOURCE) {
					ticksRemaining = effect.ticksRemaining
					break;
				}
			}

			if (ticksRemaining < lowestTicksRemaining) {
				lowestTicksRemaining = ticksRemaining;
				targetSource = source;
			}
		}

		if (!targetSource) {
			return -Infinity
		}

		// Arrive with time to spare. If we have time to spare though, go do other shit.
		if (Math.max(powerCreep.powers[PWR_REGEN_SOURCE].cooldown, lowestTicksRemaining) > Math.max(10, (powerCreep.pos.getWorldRangeToPos(targetSource.pos) - POWER_INFO[PWR_REGEN_SOURCE].range) * 1.5)) {
			return -Infinity
		}

		powerCreep.mem.state.targetSource = targetSource.id;
		powerCreep.mem.state.targetSourcePos = targetSource.pos;


		/*sources = _.filter(sources, (source) => {
			let worldRange = powerCreep.pos.getWorldRangeToPos(source.pos)
			// Trouble with this is it'll go pick a shit source that's further away
			// if (powerCreep.powers[PWR_REGEN_SOURCE].cooldown >= 1.25 * (worldRange - POWER_INFO[PWR_REGEN_SOURCE].range)) {
			// 	return false;
			// }

			if (source.room.dangerous) return false;

			if (!source.effects) return true
			for (let effect of source.effects) {
				if (effect.power == PWR_DISRUPT_SOURCE) {
					return false;
				}

				if (effect.power != PWR_REGEN_SOURCE) {
					console.log("Weird effect on mah source")
				}

				if (effect.ticksRemaining >= powerCreep.powers[PWR_REGEN_SOURCE].cooldown)

				if (effect.ticksRemaining >= worldRange - POWER_INFO[PWR_REGEN_SOURCE].range) {
					return false;
				}
			}			
			return true;
		});


		if (sources.length == 0) {
			return -Infinity;
		}

		// TODO: Better scoring here
		let bestScore = -Infinity
		let targetSource;
		for (let source of sources) {
			let score = source.pos.roomName == powerCreep.mem.homeRoom ? 100 : 0
			if (Game.rooms[powerCreep.mem.homeRoom].storage) {
				score -= Game.rooms[powerCreep.mem.homeRoom].storage.pos.getWorldRangeToPos(source.pos)
			}
			else {
				score -= powerCreep.pos.getWorldRangeToPos(source.pos)
			}

			if (score > bestScore) {
				bestScore = score;
				targetSource = source;
			}
		}*/
	}

	if (powerCreep.room.name == powerCreep.mem.state.targetSourcePos.roomName) {
		if (powerCreep.room.controller && !powerCreep.room.controller.isPowerEnabled && !powerCreep.room.memory.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	let targetPos = new RoomPosition(powerCreep.mem.state.targetSourcePos.x, powerCreep.mem.state.targetSourcePos.y, powerCreep.mem.state.targetSourcePos.roomName);

	let targetSource = Game.getObjectById(powerCreep.mem.state.targetSource);

	if (targetSource && targetSource.effects && targetSource.effects[PWR_REGEN_SOURCE] && targetSource.effects[PWR_REGEN_SOURCE].ticksRemaining > POWER_INFO[PWR_REGEN_SOURCE].duration - 2) {
		// Somebody else has done it
		delete powerCreep.mem.state.targetSource;
		delete powerCreep.mem.state.targetSourcePos;
		return runRegenSource(powerCreep)
	}
	else if (powerCreep.room.name != powerCreep.mem.state.targetSourcePos.roomName || !powerCreep.pos.inRangeToPos(targetPos, POWER_INFO[PWR_REGEN_SOURCE].range)) {
		if (dryRun) {
			return OK
		}
		powerCreep.cachedMoveTo(targetPos, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}	
	else if (powerCreep.usePower(PWR_REGEN_SOURCE, Game.getObjectById(powerCreep.mem.state.targetSource)) == OK) {
		if (dryRun) {
			return OK
		}
		
		if (global.fetcherTargetCounts) {
			delete global.fetcherTargetCounts[powerCreep.mem.homeRoom]
		}


		powerCreep.room.regenSourceCast(powerCreep.powers[PWR_REGEN_SOURCE].level, Game.getObjectById(powerCreep.mem.state.targetSource))

		powerCreep.usedPower = 1;
		delete powerCreep.mem.path;
		delete powerCreep.mem.state.targetSource;
		delete powerCreep.mem.state.targetSourcePos;
	}
	else {
		delete powerCreep.mem.path
		return -Infinity
	}
	return OK
}

// Only works on owned room due to lazy.
// This power is shit.
function runRegenMineral(powerCreep) {
	if (!powerCreep.mem.state.targetMineral) {
		let minerals = [];

		for (let roomName of Memory.rooms[powerCreep.mem.homeRoom].goodRooms) {
			if (Game.rooms[roomName] && (!Game.rooms[roomName].controller || Game.rooms[roomName].controller.my)) {
				minerals = minerals.concat(Game.rooms[roomName].find(FIND_MINERALS))
			}
		}

		if (Memory.season5) {
			minerals = _.filter(minerals, (mineral) => {
				return mineral.mineralType == RESOURCE_THORIUM
			})
		}

		minerals = _.filter(minerals, (mineral) => {
			if (!mineral.mineralAmount) return false
			let worldRange = powerCreep.pos.getWorldRangeToPos(mineral.pos)
			if (mineral.room.dangerous == 2) return false;

			if (!mineral.effects) return true
			for (let effect of mineral.effects) {
				if (effect.ticksRemaining >= worldRange - POWER_INFO[PWR_REGEN_MINERAL].range + (Memory.season5 ? 10 : 0)) {
					return false;
				}
			}			
			return true;
		});


		if (minerals.length == 0) {
			return -Infinity;
		}

		// TODO: Better scoring here
		let bestScore = -Infinity
		let targetMineral;
		for (let mineral of minerals) {
			let score = mineral.pos.roomName == powerCreep.mem.homeRoom ? 100 : 0
			if (Game.rooms[powerCreep.mem.homeRoom].storage) {
				score -= Game.rooms[powerCreep.mem.homeRoom].storage.pos.getWorldRangeToPos(mineral.pos)
			}
			else {
				score -= powerCreep.pos.getWorldRangeToPos(mineral.pos)
			}

			if (score > bestScore) {
				bestScore = score;
				targetMineral = mineral;
			}
		}
		powerCreep.mem.state.targetMineral = targetMineral.id;
		powerCreep.mem.state.targetMineralPos = targetMineral.pos;
	}

	let targetMineral = Game.getObjectById(powerCreep.mem.state.targetMineral)
	let targetPos = new RoomPosition(powerCreep.mem.state.targetMineralPos.x, powerCreep.mem.state.targetMineralPos.y, powerCreep.mem.state.targetMineralPos.roomName);

	if (targetMineral && targetMineral.effects && targetMineral.effects[PWR_REGEN_MINERAL] && targetMineral.effects[PWR_REGEN_MINERAL].ticksRemaining > POWER_INFO[PWR_REGEN_MINERAL].duration - 2) {
		// Somebody else has done it
		delete powerCreep.mem.state.targetMineral;
		delete powerCreep.mem.state.targetMineralPos;
		return runRegenMineral(powerCreep)
	}
	else if (powerCreep.room.name != powerCreep.mem.state.targetMineralPos.roomName || !powerCreep.pos.inRangeToPos(targetPos, POWER_INFO[PWR_REGEN_MINERAL].range)) {
		powerCreep.uncachedMoveTo(targetPos, POWER_INFO[PWR_REGEN_MINERAL].range, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else if (powerCreep.usePower(PWR_REGEN_MINERAL, targetMineral) == OK) {
		delete powerCreep.mem.path;
		delete powerCreep.mem.state.targetMineral;
		delete powerCreep.mem.state.targetMineralPos;		
	}
	else {
		delete powerCreep.mem.path
		return -Infinity
	}
	return OK
}

function runOperatePower(powerCreep, dryRun = false) {
	if (!dryRun && (powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_POWER].ops) {
		if (powerCreep.room.controller && !powerCreep.room.controller.isPowerEnabled) {
			return activatePowerInCurrentRoom(powerCreep);
		}
		return -Infinity
	}
	// This is really only for season 3. Wait until we actually need to burn the power
	if (powerCreep.powers[PWR_OPERATE_POWER].level < 4) {
		return -Infinity
	}

	// Don't want to block spawn op if low on ops
	if ((powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_POWER].ops + POWER_INFO[PWR_OPERATE_SPAWN].ops) {
		return -Infinity
	}

	// console.log("a", "runOperateSpawn", powerCreep, dryRun)

	if (!powerCreep.mem.state.target) {
		let room = Game.rooms[powerCreep.mem.homeRoom]
		let powerSpawn = Game.rooms[powerCreep.mem.homeRoom].powerSpawn

		if (!powerSpawn) {
			return -Infinity
		}

		if (room.calcEffectiveEnergy(true) < 200000) {
			return -Infinity
		}

		room.mem.wantsToOpPower = Game.time

		if (!room.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, 100000)) {
			return -Infinity
		}

		powerCreep.mem.state.target = powerSpawn.id;
	}


	let powerSpawn = Game.getObjectById(powerCreep.mem.state.target)

	if (!powerSpawn) return -Infinity;

	// It already has an effect, don't give it another
	for (let effect of (powerSpawn.effects || [])) {
		delete powerCreep.mem.state
		return -Infinity
	}

	if (dryRun) {
		return OK
	}

	if (powerCreep.room.name == powerSpawn.room.name) {
		if (!powerCreep.room.controller.isPowerEnabled && !powerCreep.room.memory.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	if (powerCreep.room.name != powerSpawn.room.name || !powerCreep.pos.inRangeToPos(powerSpawn.pos, POWER_INFO[PWR_OPERATE_POWER].range)) {
		powerCreep.uncachedMoveTo(powerSpawn, POWER_INFO[PWR_OPERATE_POWER].range, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else if (powerCreep.usePower(PWR_OPERATE_POWER, powerSpawn) == OK) {
		// Wake 'em up next tick. This may also sleep them for one tick, but that's fine.
		for (let creepName of (powerCreep.room.mem.ownedCreeps["powerShuffler"] || [])) {
			Memory.creeps[creepName].wT = Game.time + 1
		}
		powerCreep.usedPower = 1
		delete powerCreep.mem.path;
		delete powerCreep.mem.state.target;
	}
	else {
		delete powerCreep.mem.path;

		return -Infinity
	}
	return OK
}

function runOperateSpawn(powerCreep, dryRun = false) {
	// console.log("__a", "runOperateSpawn", powerCreep, dryRun)	

	if (!dryRun && (powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_SPAWN].ops) {
		if (powerCreep.room.controller && !powerCreep.room.controller.isPowerEnabled) {
			return activatePowerInCurrentRoom(powerCreep);
		}
		// console.log("_a", "runOperateSpawn", powerCreep, dryRun)	
		return -Infinity
	}

	if (!powerCreep.powers[PWR_OPERATE_SPAWN]) {
		return -Infinity
	} 

	// console.log("a", "runOperateSpawn", powerCreep, dryRun)

	powerCreep.mem.state = powerCreep.mem.state || {}

	if (!powerCreep.mem.state.targetSpawn) {
		let room = Game.rooms[powerCreep.mem.homeRoom]

		let spawns = Game.rooms[powerCreep.mem.homeRoom].find(FIND_MY_SPAWNS);


		let spawnFree = false
		for (let spawn of spawns) {
			if (!spawn.isActive()) continue

			if (!spawn.spawning) {
				spawnFree = true;
				break;
			}
		}

		// Too expensive to run at a shit level
		if ((room.mem.attackScore || 0) == 0) {
			if (powerCreep.powers[PWR_OPERATE_SPAWN].level < 3) {
				return -Infinity
			}
			if (Memory.season && powerCreep.powers[PWR_OPERATE_SPAWN].level < 4 && Memory.stats.globalResources[RESOURCE_POWER] > 200000 && Memory.stats.globalResources[RESOURCE_OPS] < 20000 && !Memory.season5) {
				return -Infinity
			}
		}

		if ((room.mem.attackScore || 0) == 0 && 
			room.mem.spawnUtilization < (Memory.season5 ? 0.9 : 0.8) && 
			(spawnFree || _.sum(room.mem.priorityBuilds) < 2) &&
			(Game.time - (room.mem.spawningHeavyMission || 0)) > 2000 &&
			!missionInfo.isRoomAssaulting(room, false)) {
			// console.log("b", "runOperateSpawn", powerCreep)
			return -Infinity
		}

		if (Memory.season && !Memory.season3 && !Memory.season5 &&
			(room.mem.attackScore || 0) == 0 && 
			room.mem.spawnUtilization < 0.95 && 
			(spawnFree || _.sum(room.mem.priorityBuilds) < 5) &&
			(Game.time - (room.mem.spawningHeavyMission || 0)) > 2000 &&
			(Memory.stats.globalResources[RESOURCE_OPS] || 0) < 20000 &&
			!missionInfo.isRoomAssaulting(room, false)) {
			return -Infinity
		}

		// if (Memory.season4 && !room.mem.attackScore && room.defcon > 2) {
		// 	return -Infinity	
		// }


		let validSpawns = []

		for (let spawn of spawns) {
			let worldRange = powerCreep.pos.getWorldRangeToPos(spawn.pos)

			if (powerCreep.powers[PWR_OPERATE_SPAWN].cooldown > 1.25 * Math.max(0, (worldRange - POWER_INFO[PWR_OPERATE_SPAWN].range))) {
				// console.log("c", "runOperateSpawn", powerCreep, spawn)
				continue;
			}

			// Hmm. 25 will do I guess.
			if (spawn.spawning && spawn.spawning.remainingTime > Math.max(powerCreep.pos.getWorldRangeToPos(spawn.pos), 25)) {
				// console.log("d", "runOperateSpawn", powerCreep, spawn)
				continue;
			}

			let valid = true;
			for (let effect of (spawn.effects || [])) {
				if (effect.power == PWR_OPERATE_SPAWN) {
					if (effect.ticksRemaining > Math.max(0, worldRange - POWER_INFO[PWR_OPERATE_SPAWN].range) * 0.8) {						
						valid = false;
						break;
					}
				}
				// Don't bother
				else if (effect.power == PWR_DISRUPT_SPAWN) {
					valid = false;
					break;
				}
				else {
					console.log("Unknown effect on spawn", effect.power)
				}
			}
			if (valid && spawn.isActive()) {
				// console.log("e", "runOperateSpawn", powerCreep, spawn)
				validSpawns.push(spawn);
			}
		}

		let bestSpawn
		if (validSpawns.length == 0) {
			// console.log("f", "runOperateSpawn", powerCreep, validSpawns)
			return -Infinity
		}
		else if (validSpawns.length == 1) {
			// console.log("g", "runOperateSpawn", powerCreep, validSpawns)
			bestSpawn = validSpawns[0];
		}
		else {
			let bestScore = -Infinity;

			for (let spawn of validSpawns) {
				let score = Math.max(0, powerCreep.pos.getWorldRangeToPos(spawn.pos) - POWER_INFO[PWR_OPERATE_SPAWN].range);

				// Get the first spawn first
				// console.log("Spawn order test 1", room, room.spawnOrder)
				// console.log("Spawn order test 2", room.spawnOrder.indexof(spawn))
				score -= 50 * room.spawnOrder.indexOf(spawn);

				if (spawn.spawning) score -= spawn.spawning.remainingTime;

				if (score > bestScore) {
					bestSpawn = spawn
					bestScore = score;
				}
			}
			// console.log("h", "runOperateSpawn", powerCreep, bestSpawn, bestScore)
		}		

		if (!bestSpawn) return -Infinity;

		// console.log("i", "runOperateSpawn", powerCreep, bestSpawn)

		powerCreep.mem.state.targetSpawn = bestSpawn.id;
	}


	let spawn = Game.getObjectById(powerCreep.mem.state.targetSpawn)

	if (!spawn) return -Infinity;

	// Missed it
	if (spawn.spawning && spawn.spawning.remainingTime > 25) {
		delete powerCreep.mem.path;
		delete powerCreep.mem.state.targetSpawn;		
		return -Infinity;
	}


	if (dryRun) {
		return OK
	}

	if (powerCreep.room.name == spawn.room.name) {
		if (!powerCreep.room.controller.isPowerEnabled && !powerCreep.room.memory.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	// it'll be ready soon, just not quite yet
	let allowPowerUse = true
	for (let effect of (spawn.effects || [])) {
		if (effect.power == PWR_OPERATE_SPAWN) {
			if (effect.ticksRemaining) {						
				allowPowerUse = false
				break
			}
		}
	}
	if (allowPowerUse && spawn.spawning && spawn.spawning.remainingTime > 1) {
		allowPowerUse = false
	}

	if (powerCreep.room.name != spawn.room.name || !powerCreep.pos.inRangeToPos(spawn.pos, POWER_INFO[PWR_OPERATE_SPAWN].range)) {
		powerCreep.uncachedMoveTo(spawn, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else if (!allowPowerUse) {
		delete powerCreep.mem.path;
		return OK
	}
	else if (powerCreep.usePower(PWR_OPERATE_SPAWN, spawn) == OK) {
		powerCreep.room.opSpawnCast(powerCreep.powers[PWR_OPERATE_SPAWN].level)
		powerCreep.usedPower = 1
		delete powerCreep.mem.path;
		delete powerCreep.mem.state.targetSpawn;
	}
	else {
		delete powerCreep.mem.path;

		return -Infinity
	}
	return OK
}

function runOperateLab(powerCreep) {
	// console.log("runOperateLab 1")
	if ((powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_LAB].ops) {
		if (powerCreep.room.controller && !powerCreep.room.controller.isPowerEnabled) {
			return activatePowerInCurrentRoom(powerCreep);
		}
		return -Infinity
	}

	// console.log("runOperateLab 2")

	if (!powerCreep.mem.state.targetLab) {
		// Only if all labs are busy.
		for (let room of Game.myRooms) {
			if (room.effectiveLevel == 8 && !room.memory.targetCompound && global.currentlyUnclaimingRoom != room.name) {
				if (Math.random() < 0.1) console.log(room, "is not cooking");
				return -Infinity;
			}
		}

		// console.log("runOperateLab 3")

		let room = Game.rooms[powerCreep.mem.homeRoom]
		if (!room.memory.targetCompound) return -Infinity

		// console.log("runOperateLab 4")

		let labs = room.labs;

		let sourceLabs = _.filter(labs, (lab) => ((lab.pos.x == lab.room.memory.labPositionX 	 && lab.pos.y == lab.room.memory.labPositionY) ||
												  (lab.pos.x == lab.room.memory.labPositionX - 1 && lab.pos.y == lab.room.memory.labPositionY - 1)));


		let boostLabs = _.difference(labs, sourceLabs)

		let validLabs = []

		// console.log("runOperateLab 5", boostLabs)

		for (let lab of boostLabs) {
			if (!lab.isActive()) continue
			if (lab.room.memory.labMemory[lab.id].lockedForBoosts) continue
			if (sourceLabs.includes(lab)) continue

			let worldRange = powerCreep.pos.getWorldRangeToPos(lab.pos)

			if (powerCreep.powers[PWR_OPERATE_LAB].cooldown > 1.25 * Math.max(0, (worldRange - POWER_INFO[PWR_OPERATE_LAB].range))) {
				continue;
			}

			// Hmm. 20 will do I guess.
			if (lab.cooldown && lab.cooldown > 20) {
				continue;
			}

			let valid = true;
			for (let effect of (lab.effects || [])) {
				if (effect.power == PWR_OPERATE_LAB) {
					if (effect.ticksRemaining > Math.max(0, worldRange - POWER_INFO[PWR_OPERATE_LAB].range)) {						
						valid = false;
						break;
					}
				}
				else {
					console.log("Unknown effect on lab", effect.power)
				}
			}
			if (valid && lab.isActive()) {
				validLabs.push(lab);
			}
		}


		let bestLab
		if (validLabs.length == 0) {
			// console.log(powerCreep, "runOperateLab 6", validLabs)
			return -Infinity
		}
		else if (validLabs.length == 1) {
			bestLab = validLabs[0];
		}
		else {
			let bestScore = -Infinity;

			for (let lab of validLabs) {
				let score = Math.max(0, powerCreep.pos.getWorldRangeToPos(lab.pos) - POWER_INFO[PWR_OPERATE_LAB].range);

				if (lab.cooldown) score -= lab.cooldown;

				if (score > bestScore) {
					bestLab = lab
					bestScore = score;
				}
			}	
		}		
		// console.log("runOperateLab 7", bestLab)

		if (!bestLab) {
			// console.log(powerCreep, "runOperateLab 7", validLabs)
			return -Infinity;
		}

		powerCreep.mem.state.targetLab = bestLab.id;
	}


	let lab = Game.getObjectById(powerCreep.mem.state.targetLab)

	if (!lab) return -Infinity;

	if (powerCreep.room.name == lab.room.name) {
		if (!powerCreep.room.controller.isPowerEnabled && !powerCreep.room.memory.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	if (powerCreep.room.name != lab.room.name || !powerCreep.pos.inRangeToPos(lab.pos, POWER_INFO[PWR_OPERATE_LAB].range)) {
		powerCreep.uncachedMoveTo(lab, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else if (powerCreep.usePower(PWR_OPERATE_LAB, lab) == OK) {
		powerCreep.usedPower = 1
		delete powerCreep.mem.path;
		delete powerCreep.mem.state.targetLab;
	}
	else {
		delete powerCreep.mem.path;

		return -Infinity
	}
	return OK
}

function runOperateExtensions(powerCreep) {
	if ((powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_EXTENSION].ops) {
		return -Infinity
	}

	if (Memory.season3 || Memory.season4) {
		return -Infinity
	}

	// if (Memory.season1 && powerCreep.powers[PWR_OPERATE_EXTENSION].level < 2) {
	// 	return -Infinity
	// }

	let room = Game.rooms[powerCreep.mem.homeRoom]

	if (!powerCreep.mem.state.runOperateExtensions) {
		if (!room || !room.storage) {
			return -Infinity;
		}

		let anyOpSpawn = false
		for (let spawn of room.spawns) {
			if (!spawn.isActive()) continue
			for (let effect of (spawn.effects || [])) {
				if (effect.power == PWR_OPERATE_SPAWN) {
					anyOpSpawn = true
					break
				}
			}
			if (anyOpSpawn) {
				break
			}
		}

		if (!anyOpSpawn) {
			return -Infinity
		}
		
		let fillPercent = POWER_INFO[PWR_OPERATE_EXTENSION].effect[powerCreep.powers[PWR_OPERATE_EXTENSION].level - 1];

		let currentPercentToGain = 1 - (room.energyAvailable / room.energyCapacityAvailable);

		if (currentPercentToGain < Math.max(0.4, fillPercent * 0.75)) {
			return -Infinity
		}

		if (Memory.season && 
			(room.mem.attackScore || 0) == 0 && 
			(Game.time - (room.mem.spawningHeavyMission || 0)) > 2000 &&
			!missionInfo.isRoomAssaulting(room, false)) {
			return -Infinity
		}


		powerCreep.mem.state.runOperateExtensions = 1;
	}

	let sourceStore = room.terminal || room.storage;

	if (!sourceStore) return -Infinity;
	if (!sourceStore.store[RESOURCE_ENERGY]) return -Infinity;

	if (powerCreep.room.name == room.name) {
		if (!room.controller.isPowerEnabled && !room.memory.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	let fillPercent = POWER_INFO[PWR_OPERATE_EXTENSION].effect[powerCreep.powers[PWR_OPERATE_EXTENSION].level - 1];

	let currentPercentToGain = 1 - (room.energyAvailable / room.energyCapacityAvailable);

	if (currentPercentToGain < Math.max(0.4, fillPercent * 0.75)) {
		delete powerCreep.mem.state.runOperateExtensions
		return -Infinity
	}


	if (powerCreep.room.name != room.name || !powerCreep.pos.inRangeToPos(sourceStore.pos, POWER_INFO[PWR_OPERATE_EXTENSION].range)) {
		powerCreep.uncachedMoveTo(sourceStore, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else {
		let ret = powerCreep.usePower(PWR_OPERATE_EXTENSION, sourceStore)
		if (ret == OK) {			
			powerCreep.usedPower = 1
			delete powerCreep.mem.path
			delete powerCreep.mem.state.runOperateExtensions;
		}
		else if (sourceStore == room.terminal) {
			sourceStore = room.storage
			if (!sourceStore) {
				delete powerCreep.mem.path;

				return -Infinity;
			}

			if (powerCreep.room.name != room.name || !powerCreep.pos.inRangeToPos(sourceStore.pos, POWER_INFO[PWR_OPERATE_EXTENSION].range)) {
				powerCreep.uncachedMoveTo(sourceStore, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
			}
			else {
				ret = powerCreep.usePower(PWR_OPERATE_EXTENSION, sourceStore)
				if (ret == OK) {			
					powerCreep.usedPower = 1
					delete powerCreep.mem.path
					delete powerCreep.mem.state.runOperateExtensions;
				}
				else {
					delete powerCreep.mem.path;

					return -Infinity;
				}
			}
		}
		else {
			delete powerCreep.mem.path;

			return -Infinity
		}
	}
	return OK
}


function runOperateFactory(powerCreep, dryRun = false) {
	if (!dryRun && (powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_FACTORY].ops) {
		powerCreep.mem.opsBalancing = 1;
		if (opsBalancing(powerCreep)) {
			return OK
		}
		return -Infinity
	}

	if (!powerCreep.powers[PWR_OPERATE_FACTORY]) {
		return -Infinity
	}

	// if (Memory.season) {		
	// 	if (Math.random() < 0.01) console.log("Factory operation (temp) disabled on season")
	// 	return -Infinity
	// }

	powerCreep.mem.state = powerCreep.mem.state || {}	

	let room;
	if (powerCreep.mem.state.runOperateFactory && powerCreep.mem.state.factoryTargetRoom) {
		room = Game.rooms[powerCreep.mem.state.factoryTargetRoom]
	}
	else {
	 	room = Game.rooms[powerCreep.mem.homeRoom]
	}

	if (!powerCreep.mem.state.runOperateFactory) {
		if (!room || !room.factory || !room.factory.isActive() || (!room.mem.factoryTargetPower && room.factory.level !== undefined)) {
			// This room doesn't have a factory. Try another nearby
			let bestRoom
			let minRouteCost = Infinity;
			for (let otherRoom of Game.myRooms) {
				if (Game.map.getRoomLinearDistance(powerCreep.room.name, otherRoom.name) > 5) continue
				if (!otherRoom.factory) continue
				if (otherRoom.factory.operatedThisTick) continue
				if (!otherRoom.factory.isActive()) continue
				if (otherRoom.factory.level != powerCreep.powers[PWR_OPERATE_FACTORY].level) continue
				if (otherRoom.factory.cooldown > 50) continue

				let otherPCDoingIt = false;
				for (let otherPowerCreepName of (otherRoom.mem.lastAssignedPowerCreeps || [])) {
					if (otherPowerCreepName == powerCreep.name) continue
					// Maybe could widen this to include others with same power level.
					if (Game.powerCreeps[otherPowerCreepName].powers[PWR_OPERATE_FACTORY] && Game.powerCreeps[otherPowerCreepName].powers[PWR_OPERATE_FACTORY].level == powerCreep.powers[PWR_OPERATE_FACTORY].level) {
						otherPCDoingIt = true;
						break
					}
				}
				if (otherPCDoingIt) {
					continue
				}

				let routeCost = safeRoute.getSafeRouteCost(powerCreep.room.name, otherRoom.name, false, false)

				if (routeCost < minRouteCost) {
					minRouteCost = routeCost;
					bestRoom = otherRoom
				}
			}

			if (bestRoom) {
				powerCreep.mem.state.factoryTargetRoom = bestRoom.name;
				room = bestRoom
			}
			else {
				return -Infinity;
			}
		}

		if (room.factory.cooldown > 50) {
			return -Infinity;
		}

		let worldRange = powerCreep.pos.getWorldRangeToPos(room.factory.pos)

		for (let effect of (room.factory.effects || [])) {
			if (effect.power == PWR_OPERATE_FACTORY) {
				if (effect.ticksRemaining > Math.max(0, worldRange - POWER_INFO[PWR_OPERATE_FACTORY].range)) {
					return -Infinity
				}
			}
			else {
				console.log("Unknown effect on factory", effect.power)
			}
		}

		if (!powerCreep.powers[PWR_OPERATE_FACTORY]) {
			return -Infinity
		}

		if (powerCreep.powers[PWR_OPERATE_FACTORY].level !== Memory.commoditiesManager.factoryPowerAssignment[room.name]) {
			if (Math.floor(powerCreep.mem.type / 10) == POWER_CREEP_TYPE_ECONOMY) {
				console.log("Power creep trying to operate factory in room with wrong level!", powerCreep, room.name)
			}
			return -Infinity;
		}
		
		powerCreep.mem.state.runOperateFactory = 1;
	}

	if (room.factory.level && (room.factory.operatedThisTick || !room.mem.factoryTargetPower)) {
		delete powerCreep.mem.state.runOperateFactory;
		delete powerCreep.mem.state.factoryTargetRoom;
		return -Infinity
	}

	if (dryRun) {
		return OK
	}

	if (powerCreep.room.name == room.name) {
		if (!room.controller.isPowerEnabled && !room.mem.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	// Wake up the room



	if (powerCreep.room.name != room.name || !powerCreep.pos.inRangeToPos(room.factory.pos, POWER_INFO[PWR_OPERATE_FACTORY].range)) {		
		powerCreep.uncachedMoveTo(room.factory, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else {
		delete powerCreep.mem.path

		// Sanity check, if it's operated already, don't do it again!
		for (let effect of (room.factory.effects || [])) {
			if (effect.power == PWR_OPERATE_FACTORY) {
				delete powerCreep.mem.state.runOperateFactory;
				delete powerCreep.mem.state.factoryTargetRoom;
				return -Infinity
			}
		}

		// Saves ops
		if (Memory.season4 && (room.factory.cooldown || 0) > 5) {
			return OK
		}

		let ret = powerCreep.usePower(PWR_OPERATE_FACTORY, room.factory)
		if (ret == OK) {
			// Tell them to skip this tick and wake up next tick.
			let storageSitters = []
			if (room.mem.ownedCreeps && room.mem.ownedCreeps["storageSitter"]) {
				for (let name of room.mem.ownedCreeps["storageSitter"]) {
					Memory.creeps[name].wT = Game.tick + 1
				}
			}

			room.mem.forceRefreshFactory = 1

			room.factory.operatedThisTick = 1
			powerCreep.usedPower = 1

			// If anyone else is trying to do it tell 'em to stop
			for (let otherPowerCreepName in Game.powerCreeps) {
				let otherPowerCreep = Game.powerCreeps[otherPowerCreepName]

				if (otherPowerCreep.mem.state && otherPowerCreep.mem.state.factoryTargetRoom == room.name) {
					delete otherPowerCreep.mem.state.runOperateFactory;
					delete otherPowerCreep.mem.state.factoryTargetRoom;
				}
			}

			delete powerCreep.mem.state.runOperateFactory;
			delete powerCreep.mem.state.factoryTargetRoom;
		}
		else {
			return -Infinity
		}
	}
	return OK
}


function runOperateObserver(powerCreep) {
	if ((powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_OBSERVER].ops) {
		return -Infinity
	}



	if (Memory.season4) {
		return -Infinity
	}

	let room = Game.rooms[powerCreep.mem.homeRoom]

	if (!powerCreep.mem.state.runOperateObserver) {
		if (!room || !room.observer || !room.observer.isActive()) {
			return -Infinity;
		}

		let worldRange = powerCreep.pos.getWorldRangeToPos(room.observer.pos)

		for (let effect of (room.observer.effects || [])) {
			if (effect.power == PWR_OPERATE_OBSERVER) {
				if (effect.ticksRemaining > Math.max(0, worldRange - POWER_INFO[PWR_OPERATE_OBSERVER].range)) {						
					return -Infinity
				}
			}
			else {
				console.log("Unknown effect on observer", effect.power)
			}
		}

		powerCreep.mem.state.runOperateObserver = 1;
	}

	if (powerCreep.room.name == room.name) {
		if (!room.controller.isPowerEnabled && !room.memory.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	if (powerCreep.room.name != room.name || !powerCreep.pos.inRangeToPos(room.observer.pos, POWER_INFO[PWR_OPERATE_OBSERVER].range)) {
		powerCreep.uncachedMoveTo(room.observer, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else {
		delete powerCreep.mem.path

		let ret = powerCreep.usePower(PWR_OPERATE_OBSERVER, room.observer)
		if (ret == OK) {			
			powerCreep.usedPower = 1
			Memory.observerOperated = Game.time
			delete powerCreep.mem.state.runOperateObserver;
		}
		else {
			return -Infinity
		}
	}
	return OK
}

function runOperateTower(powerCreep) {
	if ((powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_OPERATE_TOWER].ops) {
		return -Infinity
	}

	if (!powerCreep.mem.state.targetTower) {
		if (Game.rooms[powerCreep.mem.homeRoom].dangerous != 2) return -Infinity

		let towers = Game.rooms[powerCreep.mem.homeRoom].towers;

		let validTowers = []

		for (let tower of towers) {
			let valid = true;
			for (let effect of (tower.effects || [])) {
				if (effect.power == PWR_OPERATE_TOWER && effect.ticksRemaining > powerCreep.pos.getWorldRangeToPos(tower.pos) - POWER_INFO[PWR_OPERATE_TOWER].range) {
					valid = false;
					break;
				}
				// else {
				// 	console.log("Unknown effect on tower")
				// }
			}
			if (valid && tower.my && tower.isActive()) validTowers.push(tower);
		}

		let bestTower
		if (validTowers.length == 0) {
			return -Infinity
		}
		else if (validTowers.length == 1) {
			bestTower = validTowers[0];
		}
		else {
			let bestScore = -Infinity;

			for (let tower of validTowers) {
				let score = Math.max(0, powerCreep.pos.getWorldRangeToPos(tower.pos) - POWER_INFO[PWR_OPERATE_TOWER].range);

				// TODO: Rank by damage output

				if (score > bestScore) {
					bestTower = tower
					bestScore = score;
				}
			}	
		}		

		if (!bestTower) return -Infinity;

		powerCreep.mem.state.targetTower = bestTower.id;
	}

	let tower = Game.getObjectById(powerCreep.mem.state.targetTower)

	if (!tower) return -Infinity;

	if (powerCreep.room.name == tower.room.name) {
		if (!powerCreep.room.controller.isPowerEnabled && !powerCreep.room.memory.controllerUnreachable) {
			return activatePowerInCurrentRoom(powerCreep);
		}
	}

	if (powerCreep.room.name != tower.room.name) {
		powerCreep.uncachedMoveTo(tower, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
	}
	else if (!powerCreep.pos.inRangeToPos(tower.pos, POWER_INFO[PWR_OPERATE_TOWER].range)) {
		powerCreep.uncachedMoveTo(tower, 1, {rampartFocus: 1, avoidCombatEdges: 1, avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1, maxRooms: 1, avoidHostiles: 1});
	}
	else if (powerCreep.usePower(PWR_OPERATE_TOWER, tower) == OK) {
		powerCreep.usedPower = 1
		delete powerCreep.mem.path;
		delete powerCreep.mem.state.targetTower;
	}
	else {
		delete powerCreep.mem.path
		return -Infinity
	}
	return OK
}

function runFortify(powerCreep) {
	if ((powerCreep.carry[RESOURCE_OPS] || 0) < POWER_INFO[PWR_FORTIFY].ops) {
		return -Infinity
	}

	if (!powerCreep.room.dangerous) {
		return -Infinity
	}

	if (!global.maxDamageRampart || !global.maxDamageRampart[powerCreep.room.name]) {
		return -Infinity
	}

	let bestRampart = Game.getObjectById(global.maxDamageRampart[powerCreep.room.name])

	if (!bestRampart) return -Infinity

	if (!powerCreep.pos.inRangeToPos(bestRampart.pos, POWER_INFO[PWR_FORTIFY].range)) {
		powerCreep.uncachedMoveTo(bestRampart, POWER_INFO[PWR_FORTIFY].range, {rampartFocus: 1, avoidCombatEdges: 1, avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1, maxRooms: 1, avoidHostiles: 1});
	}
	else if (powerCreep.usePower(PWR_FORTIFY, bestRampart) == OK) {
		powerCreep.usedPower = 1
		delete powerCreep.mem.path
	}
	else {
		delete powerCreep.mem.path
		return -Infinity
	}
	return OK

	// Only working on things with shields
	/*if (!powerCreep.powers[PWR_SHIELD]) return -Infinity

	let closeRamparts = _.filter(powerCreep.room.ramparts, (rampart) => { return rampart.my && rampart.effects && rampart.effects.length });

	if (!closeRamparts.length) return -Infinity;

	let bestRampart;
	let bestScore = Infinity;

	for (let rampart of closeRamparts) {
		let alreadyEffected = false;
		let shieldEffect;

		for (let effect of rampart.effects) {
			if (effect.power == PWR_FORTIFY) {
				alreadyEffected = true;
				break;
			}
			else if (effect.power == PWR_SHIELD) {
				shieldEffect = effect;
				break;
			}
		}

		if (alreadyEffected || !shielded) continue;

		// TODO: Get rid of magic numbers :/. Maybe calculate?
		if (rampart.hits < bestScore && shieldEffect.ticksRemaining >= 10 && rampart.hits < POWER_INFO[PWR_SHIELD].effect[shieldEffect.level - 1] * 0.5) {
			bestRampart = rampart;
			bestScore = rampart.hits;
		}
	}

	if (!bestRampart) return -Infinity;

	powerCreep.usePower(PWR_FORTIFY, bestRampart)
	powerCreep.usedPower = 1;
	return OK*/
}

function runShield(powerCreep) {
	// If it runs it runs
	powerCreep.mem.currentPower = undefined
	if (!powerCreep.powers[PWR_SHIELD]) return -Infinity
	if ((powerCreep.powers[PWR_SHIELD].cooldown || 0) > 1) return -Infinity

	if (util.isEdgeOfRoom(powerCreep.pos)) return -Infinity;
	
	// Fuck it, it's free, just fire it all over the enemy room
	if (powerCreep.mem.formationCreeps) {
		// If we're on a shield. Move to a random plains not near the edge
		let currentStructs = powerCreep.pos.lookFor(LOOK_STRUCTURES);

		let hasShield = false;
		for (let struct of currentStructs) {
			if (struct.structureType == STRUCTURE_RAMPART && struct.my) {
				hasShield = true;
				break
			}
		}
		if (!hasShield) {
			if (powerCreep.powers[PWR_SHIELD].cooldown) return -Infinity
			powerCreep.usePower(PWR_SHIELD)
			powerCreep.usedPower = 1;
			return OK
		}
		else {
			let bestScore = -Infinity;
			let bestX
			let bestY

			let roomTerrain = Game.map.getRoomTerrain(powerCreep.room.name);

			let iDir = Math.random() > 0.5 ? -1 : 1;
			for (var i = -1; i <= 1; i++) {
				let x = powerCreep.pos.x + i * iDir;
				if (x <= 0 || x >= 49) continue

				let jDir = Math.random() > 0.5 ? -1 : 1;

				for (var j = -1; j <= 1; j++) {
					let y = powerCreep.pos.y + j * jDir;
					if (x <= 2 || x >= 48 || y <= 2 || y >= 48) {
						continue;
					}

					let terrain = roomTerrain.get(x, y)
					if (terrain & TERRAIN_MASK_WALL) {
						continue;
					}

					let score
					if (terrain & TERRAIN_MASK_SWAMP) {
						score = 0;
					}
					else {
						score = 10;
					}
					if (score > bestScore) {
						bestScore = score;
						bestX = x;
						bestY = y;						
					}
				}
			}

			if (bestX !== undefined && bestY !== undefined) {
				snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(bestX, bestY, powerCreep.room.name), {}, 0, true, false);
			}
		}
	}
}

function runDisruptSpawn(powerCreep) {
	// We run pretty hot on the cooldowns on offensive powers, just ignore it if we're on cooldown
	if (!powerCreep.powers[PWR_DISRUPT_SPAWN]) return -Infinity
	if (!powerCreep.mem.ID) return -Infinity
	if (powerCreep.powers[PWR_DISRUPT_SPAWN].cooldown) return -Infinity
	if (POWER_INFO[PWR_DISRUPT_SPAWN].ops > (powerCreep.carry[RESOURCE_OPS] || 0)) return -Infinity

	let targetRoom = Game.rooms[powerCreep.mem.targetRoom]
	if (!targetRoom) return -Infinity;

	let enemySpawns = targetRoom.find(FIND_HOSTILE_SPAWNS, {filter: (spawn) => spawn.isActive()})

	let potentialTargets = [];
	let enemyOperating

	for (let spawn of enemySpawns) {
		if (!spawn.spawning) continue
		if (spawn.beingDisrupted) continue;

		let alreadyEffected;
		for (let effect of (spawn.effects || [])) {
			if (effect.power == PWR_DISRUPT_SPAWN && effect.ticksRemaining > 1) {
				alreadyEffected = true;
				break;
			}
			if (effect.power == PWR_OPERATE_SPAWN) {
				enemyOperating = true;
				break;
			}
		}

		if (alreadyEffected) continue;
		potentialTargets.push(spawn);
	}

	// If the enemy is operating spawn then we want at least as many power creeps as spawns as really we ain't doing shit on our own
	if (enemyOperating) {
		let myDisruptSpawns = 0;

		let myPowerCreeps = powerCreep.room.find(FIND_MY_POWER_CREEPS)
		for (let otherPowerCreep of myPowerCreeps) {
			if (otherPowerCreep.powers[PWR_DISRUPT_SPAWN]) {
				myDisruptSpawns++;
			}
		}

		if (myDisruptSpawns < potentialTargets.length) {
			return -Infinity;
		}
	}


	let bestScore = -Infinity;
	let bestTarget;

	if (potentialTargets.length == 0) {
		return -Infinity
	}
	else {
		for (let target of potentialTargets) {
			let score = 0;

			// If remaining time is zero it's blocked by other things. No point in disrupting.
			if (target.spawning && target.spawning.remainingTime > 0) {
				let creepBody = target.pos.lookFor(LOOK_CREEPS)[0].body
				let hasCombat = 0;
				let hasWork = 0;
				let hasCarry = 0;

				for (let part of creepBody) {
					switch (part.type) {
						case ATTACK:
						case RANGED_ATTACK:
							hasCombat = 1;
							score += 30;
							break;
						case WORK:
							hasWork = 1;
							score += 10;
							break;
						case TOUGH:
							score += 5;
							break;
						case HEAL:
							hasCombat = 1;
							score += 5;
							break;
						case CARRY:
							hasCarry = 1;
							score += 1;
							break;
						default:
							score += 1;
					}
				}

				if (hasCombat || (hasWork && hasCarry)) {
					// Tiebreak, closest first
					score += powerCreep.pos.getRangeTo(target) / 100;

					if (score > bestScore) {
						bestScore = score;
						bestTarget = target;
					}
				}
			}

		}
	}

	if (!bestTarget) return -Infinity

	if (powerCreep.room.name != targetRoom.name || !powerCreep.pos.inRangeToPos(bestTarget.pos, POWER_INFO[PWR_DISRUPT_SPAWN].range)) {
		if (powerCreep.room.name != targetRoom.name && (powerCreep.pos.getWorldRangeToPos(bestTarget.pos) <= POWER_INFO[PWR_DISRUPT_SPAWN].range || Memory.rooms[targetRoom.name].enemyFullyConnected)) {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, targetRoom.name), {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, 22, true, false);
		}
		else {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, bestTarget.pos, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, POWER_INFO[PWR_DISRUPT_SPAWN].range, true, false);
		}
	}
	else {
		powerCreep.usePower(PWR_DISRUPT_SPAWN, bestTarget)
		bestTarget.beingDisrupted = 1
		powerCreep.usedPower = 1;
	}
	return OK
}

function runDisruptTower(powerCreep) {
	// Engine bug
	// if (POWER_INFO[PWR_DISRUPT_TOWER].range == 3) return -Infinity
	// We run pretty hot on the cooldowns on offensive powers, just ignore it if we're on cooldown	
	if (!powerCreep.mem.ID) return -Infinity
	if (POWER_INFO[PWR_DISRUPT_TOWER].ops > (powerCreep.carry[RESOURCE_OPS] || 0)) return -Infinity

	let targetRoom = Game.rooms[powerCreep.mem.targetRoom]
	if (!targetRoom) return -Infinity;
	if (!powerCreep.powers[PWR_DISRUPT_TOWER]) return -Infinity

	if (powerCreep.room == targetRoom) {
		targetRoom.canPowerCreepDisruptTower = 1;
	}

	if (powerCreep.powers[PWR_DISRUPT_TOWER].cooldown) return -Infinity
	let problematicTowers = false
	// Towers don't seem to be a bother.
	if ((targetRoom.memory.advBlkDmg || 0) > 0.1 || (Game.time - (targetRoom.memory.withdrawTick || 0)) < 20 || powerCreep.hits < powerCreep.hitsMax * 0.9) {
		problematicTowers = true;
	}

	let enemyTowers = _.filter(targetRoom.towers, (tower) => { return tower.energy >= TOWER_ENERGY_COST && tower.isActive() });

	let potentialTargets = [];

	for (let tower of enemyTowers) {
		if (tower.beingDisrupted) continue;
		if (tower.energy < 10) continue;

		let alreadyEffected;
		let operated;
		for (let effect of (tower.effects || [])) {
			if (effect.power == PWR_DISRUPT_TOWER && effect.ticksRemaining > 1) {
				alreadyEffected = true;
			}
			if (effect.power == PWR_OPERATE_TOWER && effect.ticksRemaining > 1) {
				operated = true;
			}
		}
		if (alreadyEffected) continue;

		// Need to take down operated towers as if I miss a tick they're very damn dangerous
		if (operated || problematicTowers) {
			potentialTargets.push(tower);			
		}
	}


	let bestScore = -Infinity;
	let bestTarget;

	if (potentialTargets.length == 0) {
		return -Infinity
	}
	else if (potentialTargets.length == 1) {
		bestTarget = potentialTargets[0];
	}
	else {
		for (let target of potentialTargets) {
			let score = 0;

			for (let effect of (target.effects || [])) {
				if (effect.power == PWR_OPERATE_TOWER) {
					score += effect.level;
					score += effect.ticksRemaining / 1000;
					break;
				}
			}

			// Tiebreak, closest first
			score += powerCreep.pos.getRangeTo(target) / 100;

			if (score > bestScore) {
				bestScore = score;
				bestTarget = target;
			}
		}
	}

	if (!bestTarget) return -Infinity

	if (powerCreep.room.name != targetRoom.name || !powerCreep.pos.inRangeToPos(bestTarget.pos, POWER_INFO[PWR_DISRUPT_TOWER].range)) {
		// console.log(powerCreep.room.name, targetRoom.name, powerCreep.pos.inRangeToPos(bestTarget.pos, POWER_INFO[PWR_DISRUPT_TOWER].range), POWER_INFO[PWR_DISRUPT_TOWER].range)
		if (powerCreep.room.name != targetRoom.name && (powerCreep.pos.getWorldRangeToPos(bestTarget.pos) <= POWER_INFO[PWR_DISRUPT_TOWER].range || Memory.rooms[targetRoom.name].enemyFullyConnected)) {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, targetRoom.name), {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, 22, true, false);
		}
		else {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, bestTarget.pos, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, POWER_INFO[PWR_DISRUPT_TOWER].range, true, false);
		}
	}
	else {
		powerCreep.usePower(PWR_DISRUPT_TOWER, bestTarget)
		bestTarget.beingDisrupted = 1;
		powerCreep.usedPower = 1;
	}
	return OK
}

function runDisruptTerminal(powerCreep) {
	// We run pretty hot on the cooldowns on offensive powers, just ignore it if we're on cooldown
	if (!powerCreep.powers[PWR_DISRUPT_TERMINAL]) return -Infinity
	if (!powerCreep.mem.ID) return -Infinity
	if (powerCreep.powers[PWR_DISRUPT_TERMINAL].cooldown) return -Infinity
	if (POWER_INFO[PWR_DISRUPT_TERMINAL].ops > (powerCreep.carry[RESOURCE_OPS] || 0)) return -Infinity

	// Towers don't seem to be a bother
	let targetRoom = Game.rooms[powerCreep.mem.targetRoom]

	if (!targetRoom) return -Infinity;

	let terminal = targetRoom.terminal;

	if (!terminal) return -Infinity;

	if (terminal.beingDisrupted) return -Infinity;

	if (_.sum(terminal.store) < 100) return -Infinity;

	// Already doing it
	if (terminal.effects) {
		for (let effect of terminal.effects) {
			if (effect.power == PWR_DISRUPT_TERMINAL && effect.ticksRemaining > 1) {
				return -Infinity
			}
		}
	}


	if (powerCreep.room.name != targetRoom.name || !powerCreep.pos.inRangeToPos(terminal.pos, POWER_INFO[PWR_DISRUPT_TERMINAL].range)) {
		if (powerCreep.room.name != targetRoom.name && (powerCreep.pos.getWorldRangeToPos(terminal.pos) <= POWER_INFO[PWR_DISRUPT_TERMINAL].range || Memory.rooms[targetRoom.name].enemyFullyConnected)) {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, targetRoom.name), {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, 22, true, false);
		}
		else {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, terminal, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, POWER_INFO[PWR_DISRUPT_TERMINAL].range, true, false);
		}
	}
	else {
		let hostileCarries = terminal.pos.findInRange(FIND_HOSTILE_CREEPS, 2, {filter: (creep) => creep.hasBodyPart(CARRY)}).concat(terminal.pos.findInRange(FIND_HOSTILE_POWER_CREEPS, 2));

		if (hostileCarries.length) {
			powerCreep.usePower(PWR_DISRUPT_TERMINAL, terminal)
			terminal.beingDisrupted = 1;
			powerCreep.usedPower = 1;			
		}

	}
	return OK
}


// <20% capacity in ops, fill up to 80%. Over 90% capacity in ops drop to 50%
function opsBalancing(powerCreep, notEnoughTransferOnly = false) {
	if (powerCreep.room === undefined) return false

	const MAX_CARRY_RATIO = 0.9;
	const MAX_CARRY_TARGET = 0.5;

	const MIN_CARRY_RATIO = (powerCreep.mem.aggressive ? 0.05 : 0.2) + (powerCreep.mem.opsBalancing ? 0.2 : 0);
	const MIN_CARRY_TARGET = 0.8;

	const MIN_CARRY_AMOUNT = powerCreep.mem.opsBalancing ? powerCreep.carryCapacity * 0.8 : Math.min(300, powerCreep.carryCapacity * 0.8); 

	let currentCarry = _.sum(powerCreep.carry)
	let currentRatio = currentCarry / powerCreep.carryCapacity

	// Too many
	if (currentRatio > MAX_CARRY_RATIO && (!powerCreep.mem.aggressive || !powerCreep.mem.ID)) {
		let storeTarget = powerCreep.room.terminal

		if (!storeTarget || !storeTarget.my) {
			storeTarget = powerCreep.room.storage
		}

		if ((!storeTarget || !storeTarget.my) && powerCreep.mem.homeRoom) {
			storeTarget = Game.rooms[powerCreep.mem.homeRoom].storage;
		}
		// Hmmph.
		if (!storeTarget || !storeTarget.my) {
			delete powerCreep.mem.path
			return false;
		}

		if (storeTarget.room.name != powerCreep.room.name || !powerCreep.pos.isNearToPos(storeTarget.pos)) {
			powerCreep.uncachedMoveTo(storeTarget, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1})
		}
		else {
			delete powerCreep.mem.path
			let transferred = 0;
			for (let resource of Object.keys(powerCreep.carry)) {
				if (resource == RESOURCE_OPS) continue;
				if (!powerCreep.carry[resource]) continue;
				let ret = powerCreep.transfer(storeTarget, resource);
				if (ret == OK)  {
					transferred = powerCreep.carry[resource];
				}
				else {
					console.log("Transfer error", ret, powerCreep.name)
				}
				
				break;
			}
			// Transferred enough
			if (transferred && (currentCarry - transferred) / powerCreep.carryCapacity > MAX_CARRY_RATIO) {
				return true;
			}
			else if (!transferred && powerCreep.carry[RESOURCE_OPS]) {
				let ret = powerCreep.transfer(storeTarget, RESOURCE_OPS, currentCarry - powerCreep.carryCapacity * MAX_CARRY_TARGET);
				if (ret != OK) console.log("Transfer error 2", ret, currentCarry - powerCreep.carryCapacity * MAX_CARRY_TARGET, powerCreep.name)
				return true;
			}
			else {
				// Transfer more
				return false
			}
		}

		return true
	}
	// Not enough
	else if (currentCarry < MIN_CARRY_AMOUNT) {

		let homeRoom = Game.rooms[powerCreep.mem.homeRoom];
		// Request more ops to home room.
		if (Game.time % 20 == 17 && homeRoom.terminal && !homeRoom.terminal.cooldown && !homeRoom.transferred) {
			// let numOps = homeRoom.getCurrentOfResource(RESOURCE_OPS);

			if (!homeRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_OPS, powerCreep.carryCapacity)) {
				for (let amount = powerCreep.carryCapacity; amount >= 0.0625 * powerCreep.carryCapacity; amount /= 2) {
					let potentialFeeders = [];
					for (let otherRoom of Game.myRooms) {
						// console.log(powerCreep, "ops balancing test", otherRoom, "a")
						if (otherRoom === homeRoom || !otherRoom.terminal) continue;
						// console.log(powerCreep, "ops balancing test", otherRoom, "b")
						if (otherRoom.terminal.cooldown) continue;
						// console.log(powerCreep, "ops balancing test", otherRoom, "c")
						if (otherRoom.transferred) continue
						// console.log(powerCreep, "ops balancing test", otherRoom, "d")
						if (otherRoom.mem.lastAssignedPowerCreeps.length && !otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_OPS, 1000 + amount)) {
							let shouldContinue = false
							for (let otherPowerCreepName of otherRoom.mem.lastAssignedPowerCreeps) {
								if (Game.powerCreeps[otherPowerCreepName] && Game.powerCreeps[otherPowerCreepName].mem.type != POWER_CREEP_TYPE_SEASONAL_OP_GEN) {
									shouldContinue = true
									break
								}
							}

							if (shouldContinue) {
								// console.log(powerCreep, "ops balancing can't grab from", otherRoom, "due to not enough ops")
								continue
							}
						}
						// console.log(powerCreep, "ops balancing test", otherRoom, "e")
						if ((otherRoom.terminal.store[RESOURCE_OPS] || 0) >= amount && (otherRoom.terminal.store[RESOURCE_ENERGY] || 0) >= amount) {
							// console.log(powerCreep, "ops balancing test", otherRoom, "f")
							potentialFeeders.push(otherRoom);
						}
					}

					// console.log(powerCreep, "ops balancing potentialFeeders", potentialFeeders)

					let minDist = Infinity;
					let bestFeeder;
					for (let feeder of potentialFeeders) {
						let dist = Game.map.getRoomLinearDistance(homeRoom.name, feeder.name, true);
						if (dist < minDist) {
							minDist = dist;
							bestFeeder = feeder;
						}
					}

					if (bestFeeder) {
						console.log("Terminal send", bestFeeder.name, "to", homeRoom.name, amount, "for ops balancing");
						bestFeeder.terminal.send(RESOURCE_OPS, amount, homeRoom.name);
						bestFeeder.transferred = 1
						break;
					}
				}
			}
		}

		if (notEnoughTransferOnly) {
			return false
		}

		let storage = powerCreep.room.storage
		if ((!storage || !storage.store[RESOURCE_OPS] || !storage.my) && powerCreep.mem.homeRoom) {
			storage = homeRoom.storage;
		}

		let terminal = powerCreep.room.terminal
		if ((!terminal || !terminal.store[RESOURCE_OPS] || !terminal.my) && powerCreep.mem.homeRoom) {
			terminal = homeRoom.terminal;
		}

		// console.log("Ops balancing", currentCarry, MIN_CARRY_AMOUNT, powerCreep.name)
		let sources = [storage, terminal]

		if (powerCreep.mem.aggressive) {
			let opHaulers = powerCreep.room.find(FIND_MY_CREEPS, {
				filter: (creep) => {return creep.mem.role == "opHauler" && creep.mem.pc == powerCreep.name && !creep.spawning && creep.store && creep.store.getUsedCapacity()}
			});

			// Ophaulers go first.
			sources = opHaulers.concat(sources)
		}


		let combatMoveOpts = {avoidEnemyRooms: 1,
							avoidHostiles: 4,
							avoidRamparts: 1,
							avoidStronghold: 1}

		let moved = false;
		let anySource = false
		for (let source of sources) {
			// Hmmph.
			if (!source || !source.store[RESOURCE_OPS]) {
				continue;
			}

			anySource = true

			if (source.room.name != powerCreep.room.name || !powerCreep.pos.isNearToPos(source.pos)) {
				if (!powerCreep.movedThisTick) {					
					if (powerCreep.mem.formationCreeps && powerCreep.room.name != source.room.name) {
						// console.log("Ops balancing", powerCreep.name, "moving to", source)

						if (powerCreep.room.isEnemyRoom()) {
							snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, source, combatMoveOpts, 1, true, true);
						}
						else {
							snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, source, combatMoveOpts, 1, true, true);
							// snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, source, {avoidEnemyRooms: 1, noRePathOnOptsChange: 1}, 1, true, true);
						}
					}
					else {
						if (powerCreep.mem.formationCreeps && powerCreep.room.name == source.room.name && source.mem && source.mem.role == "opHauler") {
							// creepNames, targetPos, moveOptions, targetRange, assaultSnake, withdraw
							if (powerCreep.pos.inRangeToPos(source.pos, 2)) {
								snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, source, combatMoveOpts, 1, true, false);
							}
							else {
								snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, source, combatMoveOpts, 0, true, true);
							}
							// snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, source, {avoidEnemyRooms: 1, noRePathOnOptsChange: 1}, 0, true, true);
						}
						else {
							powerCreep.uncachedMoveTo(source, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1})
						}
					}
				}
				moved = true
				break
			}
			else {
				delete powerCreep.mem.path
				if (source.mem && source.mem.role == "opHauler") {
					source.transfer(powerCreep, RESOURCE_OPS, Math.min((source.store[RESOURCE_OPS] || 0), powerCreep.carryCapacity * MIN_CARRY_TARGET - currentCarry));
				}
				else {
					powerCreep.withdraw(source, RESOURCE_OPS, Math.min((source.store[RESOURCE_OPS] || 0), powerCreep.carryCapacity * MIN_CARRY_TARGET - currentCarry));
				}
				moved = false;
				break
			}
		}

		if (!moved && !anySource && powerCreep.mem.aggressive) {
			delete powerCreep.mem.path
		}


		return moved;
	}

	powerCreep.mem.opsBalancing = 0;

	return false;
}

function runRoomAttack(powerCreep) {
	if (powerCreep.pos) {	
		let droppedOps = powerCreep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
			filter: (resource) => {return resource.resourceType == RESOURCE_OPS}}
		)[0];

		if (droppedOps) {
			powerCreep.pickup(droppedOps)
		}
		else {
			var target = powerCreep.pos.findInRange(FIND_TOMBSTONES, 1, {
				filter: (tombStone) => {return tombStone.store.getUsedCapacity(RESOURCE_OPS) }
			})[0];
			if (target) {
				powerCreep.withdraw(target, RESOURCE_OPS);
			}
		}
	}

	// console.log("Test 1", powerCreep.name)

	// Shoud I call this?
	if (opsBalancing(powerCreep)) {
		powerCreep.mem.opsBalancing = 1;
		return
	}
	else {
		powerCreep.mem.opsBalancing = 0
	}

	// console.log("Test 1.5", powerCreep.name)

	// New target needed
	if (!powerCreep.mem.homeRoom || 
		!global.powerCreepDistribution[POWER_CREEP_TYPE_ROOM_ATTACK][powerCreep.mem.homeRoom] || 
		((!powerCreep.mem.currentPower || powerCreep.mem.currentPower == PWR_SHIELD) && !powerCreep.mem.ID && Math.random() < 0.01) || 
		Game.rooms[powerCreep.mem.homeRoom].dangerous == 2) {
		let potentialRoomNames = Object.keys(global.powerCreepDistribution[POWER_CREEP_TYPE_ROOM_ATTACK]);

		if (potentialRoomNames.length == 0 && powerCreep.powers[PWR_OPERATE_FACTORY]) {	
			return runGeneric(powerCreep, POWER_CREEP_TYPE_ECONOMY * 10 + powerCreep.powers[PWR_OPERATE_FACTORY].level, null)
		}

		let bestScore = -Infinity;
		let bestTargetRoomName
		for (let roomName of _.shuffle(potentialRoomNames)) {
			let baseScore = global.powerCreepDistribution[POWER_CREEP_TYPE_ROOM_ATTACK][roomName];

			let score = baseScore - (powerCreep.room ? safeRoute.getSafeRouteCost(powerCreep.room.name, roomName, true) / 20 : 0); 

			// score -= (Memory.rooms[roomName].lastAssignedPowerCreeps || []).length * 3;
			for (let assignedPowerCreepName of (Memory.rooms[roomName].lastAssignedPowerCreeps || [])) {
				if (assignedPowerCreepName != powerCreep.name) {
					score -= 3;
				}
			}

			if (score > bestScore) {
				bestTargetRoomName = roomName;
				bestScore = score;
			}
		}

		if (bestTargetRoomName) {
			powerCreep.mem.homeRoom = bestTargetRoomName;
		}
		else {

		}
	}

	// console.log("Test 2", powerCreep.name)

	if (powerCreep.room === undefined) {
		if (powerCreep.mem.homeRoom) {			
			if (spawnPowerCreepForHomeRoom(powerCreep) != OK) {
				powerCreep.mem.homeRoom = undefined	
			}
		}
		return
	}

	// console.log("Test 3", powerCreep.name)

	// Needs to tie with combat manager quite closely.

	// Am no longer attached to a mission. Clear that data.
	if (powerCreep.mem.ID && Math.random() < 0.1 && !missionInfo.findMissionForID(powerCreep.mem.ID, "roomPowerAssault")) {
		delete powerCreep.mem.ID
		delete powerCreep.mem.tagetRoom;
		delete powerCreep.mem.setupRoom;
		delete powerCreep.mem.formationCreeps;
		return;
	}
	else if (!powerCreep.mem.ID) {
		if (powerCreep.hits != powerCreep.hitsMax && Game.rooms[powerCreep.mem.homeRoom].storage) {
			powerCreep.uncachedMoveTo(new RoomPosition(Game.rooms[powerCreep.mem.homeRoom].storage.pos.x, Game.rooms[powerCreep.mem.homeRoom].storage.pos.y, powerCreep.mem.homeRoom), 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
		}
		else if (Memory.rooms[powerCreep.mem.homeRoom] && Memory.rooms[powerCreep.mem.homeRoom].fallbackX) {
			powerCreep.uncachedMoveTo(new RoomPosition(Memory.rooms[powerCreep.mem.homeRoom].fallbackX, Memory.rooms[powerCreep.mem.homeRoom].fallbackY, powerCreep.mem.homeRoom), 3, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
		}
		else {
			powerCreep.uncachedMoveTo(new RoomPosition(25, 25, powerCreep.mem.homeRoom), 20, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
		}
		return;
	}



	// Grab ops/energy. Might be this will take a while, but we can't work without ops.
	const OPS_PERCENTAGE = 1;
	const ENERGY_PERCENTAGE = 1 - OPS_PERCENTAGE;
	if (powerCreep.room.storage && powerCreep.room.storage.my && powerCreep.room.storage.store[RESOURCE_OPS] && _.sum(powerCreep.carry) < powerCreep.carryCapacity * 0.9) {
		if (!powerCreep.pos.isNearToPos(powerCreep.room.storage.pos)) {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, powerCreep.room.storage, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, 1, true, false);
			return
		}
		else {
			let energyAmount = powerCreep.carryCapacity * ENERGY_PERCENTAGE - (powerCreep.carry[RESOURCE_ENERGY] || 0);

			if (energyAmount > 0 && (powerCreep.room.storages.store[RESOURCE_ENERGY] || 0) > energyAmount) {
				powerCreep.withdraw(powerCreep.room.storage, RESOURCE_ENERGY, energyAmount);
			}
			else {
				let opsAmount = powerCreep.carryCapacity * OPS_PERCENTAGE - (powerCreep.carry[RESOURCE_OPS] || 0);				
				if (opsAmount > 0 && (powerCreep.room.storage.store[RESOURCE_OPS] || 0) > opsAmount) {
					powerCreep.withdraw(powerCreep.room.storage, RESOURCE_OPS, opsAmount);
				}
			}
		}
	}
	else if (powerCreep.room.terminal && powerCreep.room.terminal.my && powerCreep.room.terminal.store[RESOURCE_OPS] && _.sum(powerCreep.carry) < powerCreep.carryCapacity * 0.9) {
		if (!powerCreep.pos.isNearToPos(powerCreep.room.terminal.pos)) {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, powerCreep.room.terminal, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, 1, true, false);
			return
		}
		else {
			let energyAmount = powerCreep.carryCapacity * ENERGY_PERCENTAGE - (powerCreep.carry[RESOURCE_ENERGY] || 0);

			if (energyAmount > 0 && (powerCreep.room.terminals.store[RESOURCE_ENERGY] || 0) > energyAmount) {
				powerCreep.withdraw(powerCreep.room.terminal, RESOURCE_ENERGY, energyAmount);
			}
			else {
				let opsAmount = powerCreep.carryCapacity * OPS_PERCENTAGE - (powerCreep.carry[RESOURCE_OPS] || 0);				
				if (opsAmount > 0 && (powerCreep.room.terminal.store[RESOURCE_OPS] || 0) > opsAmount) {
					powerCreep.withdraw(powerCreep.room.terminal, RESOURCE_OPS, opsAmount);
				}
			}
		}
	}

	let combatMoveOpts = {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1,
						avoidHostiles: 4,
						avoidRamparts: 1,
						avoidStronghold: 1}


	// console.log("Test 4", powerCreep.name)


	// Don't TTL out in the field
	if (powerCreep.ticksToLive < POWER_CREEP_LIFE_TIME - 200 && powerCreep.room.powerSpawn && powerCreep.room.powerSpawn.my && powerCreep.room.powerSpawn.isActive()) {
		if (!powerCreep.pos.isNearToPos(powerCreep.room.powerSpawn.pos)) {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, powerCreep.room.powerSpawn, combatMoveOpts, 1, true, false);
			return
		}
		else {
			powerCreep.renew(powerCreep.room.powerSpawn)
		}

	}

	let numHealers = 0;
	let numLocalHealers = 0;
	for (let creepName of powerCreep.mem.formationCreeps) {
		let creep = Game.creeps[creepName]
		if (creep && creep.ticksToLive > 10) {
			numHealers++;
			if (creep.room.name == powerCreep.room.name) {
				numLocalHealers++;
			}
			// Hax to deal with portals. Not pretty at all :(
			else if (creep.room.centreRoom && powerCreep.room.centreRoom) {
				numLocalHealers++;
			}
			else if (creep.pos.getWorldRangeToPos(powerCreep.pos) <= 2) {
				numLocalHealers++;
			}
		}
	}

	let danger = powerCreep.hits < powerCreep.hitsMax * 0.95 || 
				(powerCreep.room.name != powerCreep.mem.targetRoom && powerCreep.room.dangerous == 2 && (powerCreep.room.memory.creepCombatPartsRanged || 0) + (powerCreep.room.memory.creepCombatPartsAttack || 0) > 200) || 
				(Memory.rooms[powerCreep.mem.targetRoom].nukeLandTime && Memory.rooms[powerCreep.mem.targetRoom].nukeLandTime - Game.time < 200) || 
				(powerCreep.room.controller && !powerCreep.room.controller.my && powerCreep.room.controller.safeMode)

	if (danger) {
		console.log(powerCreep.name, "is in danger")
	}

	if (numHealers == 0 || (numLocalHealers == 0 && !util.isEdgeOfRoom(powerCreep.pos)) || danger) {
		if (powerCreep.powers[PWR_SHIELD] && !powerCreep.powers[PWR_SHIELD].cooldown) {
			powerCreep.mem.currentPower = PWR_SHIELD;
			runPower(powerCreep);
		}

		console.log("No healers or danger", powerCreep.name, powerCreep.room.name == powerCreep.mem.targetRoom ? "Path setup" : "Path home")


		if (powerCreep.room.name == powerCreep.mem.targetRoom) {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.setupRoom), combatMoveOpts, 20, true, true);
		}
		else {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.homeRoom), combatMoveOpts, 20, true, true);
		}
		return;
	}

	if (powerCreep.room.name == powerCreep.mem.setupRoom || powerCreep.room.name == powerCreep.mem.targetRoom || (Game.time - powerCreep.mem.setupTime) < 200) {
		if (powerCreep.room.name == powerCreep.mem.setupRoom || powerCreep.room.name == powerCreep.mem.targetRoom) {
			powerCreep.mem.setupTime = Game.time;
		}
		else {
			powerCreep.mem.setupTime--;
		}

		// Well, here's the complicated bit figure out what power we want to use, where to use it
		// Simple running away
		if (powerCreep.room.name == powerCreep.mem.targetRoom && powerCreep.hits < powerCreep.hitsMax * 0.95) {
			if (powerCreep.powers[PWR_SHIELD] && !powerCreep.powers[PWR_SHIELD].cooldown) {
				powerCreep.mem.currentPower = PWR_SHIELD;
				runPower(powerCreep);
			}

			// Shield failed. Run
			if (!powerCreep.usedPower) {
				console.log("Path setup")
				snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.setupRoom), combatMoveOpts, 20, true, true);
			}
		}
		else {
			// Don't move into the target room if we can't see it and/or don't have at least 4 creeps there already.
			if (!Game.rooms[powerCreep.mem.targetRoom] || Game.rooms[powerCreep.mem.targetRoom].find(FIND_MY_CREEPS).length < 4) {
				console.log("No vision on attack room", powerCreep.name)
				snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.setupRoom), combatMoveOpts, 15, true, powerCreep.room.isEnemyRoom());
			}
			else if (powerCreep.room.name == powerCreep.mem.targetRoom && powerCreep.room.controller && !powerCreep.room.controller.isPowerEnabled) {
				console.log("Enabling power", powerCreep.name)
				let roomMemory = Memory.rooms[powerCreep.mem.targetRoom]
				let controllerPos = new RoomPosition(roomMemory.conX, roomMemory.conY, powerCreep.mem.targetRoom);

				let mem = powerCreep.mem;
				if (mem.pTX != controllerPos.x || mem.pTY != controllerPos.y) {
					let res = pathCache.getPath(powerCreep.pos, controllerPos, 1, 1, 0, false, {maxRooms: 1});

					if (!res.incomplete) {
						console.log("Path controller")
						snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, controllerPos, combatMoveOpts, 1, true, false);
						mem.pTX = controllerPos.x
						mem.pTY = controllerPos.y
					}
					else {
						console.log("Attacking power creep expecting to see a damn controller")
						roomMemory.controllerUnreachable = 1;
					}
				}
				if (!roomMemory.controllerUnreachable) {
					console.log("Path controller")
					snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, controllerPos, combatMoveOpts, 1, true, false);
				}
				if (powerCreep.pos.isNearToPos(controllerPos)) {
					powerCreep.enableRoom(powerCreep.room.controller)
				}
			}
			else {
				let priorities = _.clone(powerCreepLevels[powerCreep.mem.type].priorities)

				for (let _priority of priorities) {
					let priority = _priority[0];
					if (priority == PWR_OPERATE_FACTORY && powerCreep.mem.ID) {
						continue;
					}
					else if (!powerCreep.mem.ID && (priority == PWR_DISRUPT_SPAWN || priority == PWR_DISRUPT_TOWER || priority == PWR_DISRUPT_TERMINAL)) {
						continue;
					}

					powerCreep.mem.currentPower = priority;
					// console.log("Run power", powerCreep.name, priority)
					if (runPower(powerCreep) == OK && powerCreep.usedPower) {
						break;
					}
				}

				// console.log("Move", powerCreep.name, powerCreep.moveOrdersGiven)

				if (!powerCreep.moveOrdersGiven) {
					// Try to stay near the edge of the room
					// TODO: This is shit when there are edge walls.

					let pullBack = false;
					let targetRoom = Game.rooms[powerCreep.mem.targetRoom]

					if (!targetRoom) {
						pullBack = true;
					}


					// DISRUPT_SPAWN is the only one with a range that could be a problem right now
					if (!pullBack) {
						if (targetRoom && powerCreep.room.name == powerCreep.mem.targetRoom) {
							let enemySpawns = targetRoom.find(FIND_HOSTILE_SPAWNS, {filter: (spawn) => spawn.isActive()})

							for (let spawn of enemySpawns) {
								if (powerCreep.pos.inRangeToPos(spawn.pos, POWER_INFO[PWR_DISRUPT_SPAWN].range - 1)) {
									pullBack = true;
									break;
								}
							}
						}
					}

					if (powerCreep.room.name == powerCreep.mem.targetRoom && powerCreep.pos.inRangeToPos(new RoomPosition(25, 25, powerCreep.mem.targetRoom), 19)) {
						if (pullBack) {
							console.log("pullBack", powerCreep.name, powerCreep.moveOrdersGiven)
							snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.setupRoom), combatMoveOpts, 20, true, true);
						}
					}
					else {
						// console.log("move", powerCreep.name, powerCreep.moveOrdersGiven)
						snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.targetRoom), combatMoveOpts, 20, true, false);
					}				
				}
			}
		}
	}
	else {
		// console.log("Not nearby", powerCreep.name)
		if (powerCreep.hits < powerCreep.hitsMax * 0.95) {
			if (powerCreep.powers[PWR_SHIELD] && !powerCreep.powers[PWR_SHIELD].cooldown) {
				powerCreep.mem.currentPower = PWR_SHIELD;
				runPower(powerCreep);
			}
			// Shield failed. Run.
			if (!powerCreep.usedPower) {
				snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.homeRoom), combatMoveOpts, 20, true, true);
			}
		}
		else {
			snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, new RoomPosition(25, 25, powerCreep.mem.setupRoom), {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, 20, true, false);
		}
	}

	// For the unformed healers to catch up
	if (!powerCreep.moveOrdersGiven && powerCreep.mem.formationCreeps.length) {
		snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, powerCreep.pos, {avoidEnemyRooms: 1}, 0, true, false);
	}
}

function runGeneric(powerCreep, primaryType, secondaryFunc) {
	// Unclaimed or something?
	if (!Game.rooms[powerCreep.mem.homeRoom]) {
		delete powerCreep.mem.homeRoom
	}

	if (opsBalancing(powerCreep)) return

	if (powerCreep.spawnCooldownTime) {
		return;
	}

	if (Object.keys(global.powerCreepDistribution[primaryType] || []).length == 0) {
		if (secondaryFunc) {
			return secondaryFunc();
		}
		if (Math.random() < 0.1) console.log("Power creep don't know what to do", powerCreep.name)
		return
	}


	let swapChance;
	switch (primaryType) {
		// Keep on the bounce
		case POWER_CREEP_TYPE_ASSAULT_SPAWNER:
			swapChance = 0.002;
			break
		case POWER_CREEP_TYPE_ROOM_DEFEND:
			swapChance = 0.05;
			break;
		// Don't keep on the bounce so much
		case POWER_CREEP_TYPE_BOOTSTRAP:
		case POWER_CREEP_TYPE_ECONOMY:
		case POWER_CREEP_TYPE_SEASONAL:
		case POWER_CREEP_TYPE_SEASONAL_POWER:
		case POWER_CREEP_TYPE_SEASONAL_OP_GEN:
		case POWER_CREEP_TYPE_SEASONAL_MINERAL:
			swapChance = 0.001;
			break
		default:
			swapChance = 0.001;
	}

	let typeRoomAssignment = primaryType
	if (primaryType >= 21 && primaryType < 30 && powerCreep.powers[PWR_OPERATE_FACTORY]) {
		typeRoomAssignment = 20 + powerCreep.powers[PWR_OPERATE_FACTORY].level
		swapChance = 0
	}

	// New target needed
	if (powerCreep.room && (powerCreep.mem.type >= 20 && powerCreep.mem.type < 30) && powerCreep.mem.homeRoom && powerCreep.powers[PWR_OPERATE_FACTORY]) {
		if (Game.rooms[powerCreep.mem.homeRoom].factory) {
			let isPowered = false;
			for (let effect of (Game.rooms[powerCreep.mem.homeRoom].factory.effects || [])) {
				if (effect.effect == PWR_OPERATE_FACTORY && effect.ticksRemaining > powerCreep.powers[PWR_OPERATE_FACTORY].cooldown) {
					isPowered = true;
					break
				}
			}
			if (isPowered) {
				let potentialRoomNames = Object.keys(global.powerCreepDistribution[typeRoomAssignment]);

				let bestScore = -Infinity;
				let bestTargetRoomName
				for (let roomName of potentialRoomNames) {
					let baseScore = global.powerCreepDistribution[typeRoomAssignment][roomName];

					isPowered = false;
					if (Game.rooms[roomName] && Game.rooms[roomName].factory && 
						(!Game.rooms[roomName].factory.level || Memory.rooms[roomName].factoryTargetPower || !Game.rooms[roomName].hasPowerCreepForFactory())) {
						for (let effect of (Game.rooms[roomName].factory.effects || [])) {
							if (effect.effect == PWR_OPERATE_FACTORY && effect.ticksRemaining > powerCreep.powers[PWR_OPERATE_FACTORY].cooldown) {
								isPowered = true;
								break
							}
						}				
					}
					// Shouldn't happen
					// else {
					// 	console.log("Power creep factory assignment code running that shouldn't")
					// 	continue
					// }

					let otherPCDoingIt = false;
					for (let otherPowerCreepName of (Game.rooms[roomName].mem.lastAssignedPowerCreeps || [])) {
						if (otherPowerCreepName == powerCreep.name) continue
						// Maybe could widen this to include others with same power level.
						if (Game.powerCreeps[otherPowerCreepName].powers[PWR_OPERATE_FACTORY] && Game.powerCreeps[otherPowerCreepName].powers[PWR_OPERATE_FACTORY].level == powerCreep.powers[PWR_OPERATE_FACTORY].level) {
							otherPCDoingIt = true;
							break
						}
					}
					if (otherPCDoingIt) {
						continue
					}


					let dist = safeRoute.getSafeRouteCost(powerCreep.room.name, roomName, true);

					if (dist * 50 >= 300 && (Memory.rooms[powerCreep.mem.homeRoom].lastAssignedPowerCreeps || []).length <= 1) continue

					let score = baseScore - dist / 20; 

					// Don't stack unless you really have to
					for (let assignedPowerCreepName of Memory.rooms[roomName].lastAssignedPowerCreeps || []) {
						if (assignedPowerCreepName != powerCreep.name) {
							score -= 100000;
						}
					}
					
					score -= isPowered ? 100000 : 0;

					if (score > bestScore) {
						bestTargetRoomName = roomName;
						bestScore = score;
					}
				}

				if (bestTargetRoomName) {
					powerCreep.mem.homeRoom = bestTargetRoomName;
				}
			}
		}
	}

	if (!powerCreep.mem.homeRoom || 
		!global.powerCreepDistribution[typeRoomAssignment][powerCreep.mem.homeRoom] || 
		(!powerCreep.mem.currentPower && Math.random() < swapChance)) {
		let potentialRoomNames = Object.keys(global.powerCreepDistribution[typeRoomAssignment]);

		let bestScore = -Infinity;
		let bestTargetRoomName
		for (let roomName of potentialRoomNames) {
			let baseScore = global.powerCreepDistribution[typeRoomAssignment][roomName];

			let score = baseScore 

			if (Memory.season3 && primaryType != POWER_CREEP_TYPE_SEASONAL_DEFEND) {
				// Don't want them bouncing around in S3. We're util bound and need them working or we get bouncing remotes
				score -= (powerCreep.room ? safeRoute.getSafeRouteCost(powerCreep.room.name, roomName, true) : 0);
			}
			else {
				score -= (powerCreep.room ? safeRoute.getSafeRouteCost(powerCreep.room.name, roomName, true) / 20 : 0); 	
			}
			

			// Don't stack unless you really have to
			for (let assignedPowerCreepName of Memory.rooms[roomName].lastAssignedPowerCreeps || []) {
				if (assignedPowerCreepName != powerCreep.name) {
					score -= 100000;
				}
			}

			if (score > bestScore) {
				bestTargetRoomName = roomName;
				bestScore = score;
			}
		}

		if (bestTargetRoomName) {
			powerCreep.mem.homeRoom = bestTargetRoomName;
		}
		else if (secondaryFunc) {
			return secondaryFunc(powerCreep);
		}
	}

	// This is fairly manual, so have some sanity checking and should fallback to the above
	if (Memory.season3 && 
		powerCreep.mem.primaryRoom && 
		powerCreep.mem.secondaryRoom && 
		Game.rooms[powerCreep.mem.primaryRoom] && 
		Game.rooms[powerCreep.mem.secondaryRoom] && 
		Game.rooms[powerCreep.mem.primaryRoom].spawns.length && 
		Game.rooms[powerCreep.mem.secondaryRoom].spawns.length) {

		let priMem = Memory.rooms[powerCreep.mem.primaryRoom]
		let secMem = Memory.rooms[powerCreep.mem.secondaryRoom]

		// This will be poor when they're both hovering around 0.85
		// Go to secondary
		if (priMem.spawnUtilization < 0.85 && secMem.spawnUtilization >= 0.85) {
			powerCreep.mem.homeRoom = powerCreep.mem.secondaryRoom
		}
		// Go to primary
		else if (priMem.spawnUtilization >= 0.85 && secMem.spawnUtilization < 0.85) {
			powerCreep.mem.homeRoom = powerCreep.mem.primaryRoom
		}
		// Go to whichever room has the lowest cooldown
		else if (priMem.spawnUtilization >= 0.85 && secMem.spawnUtilization >= 0.85) {
			let priSpawn = Game.rooms[powerCreep.mem.primaryRoom].spawns[0]
			let secSpawn = Game.rooms[powerCreep.mem.secondaryRoom].spawns[0]

			let priCooldown = 0
			let secCooldown = 0

			for (let effect of (priSpawn.effects || [])) {
				if (effect.effect == PWR_OPERATE_SPAWN) {
					priCooldown = effect.ticksRemaining
				}
			}
			for (let effect of (secSpawn.effects || [])) {
				if (effect.effect == PWR_OPERATE_SPAWN) {
					secCooldown = effect.ticksRemaining
				}
			}

			if (priCooldown < secCooldown) {
				powerCreep.mem.homeRoom = powerCreep.mem.primaryRoom
			}
			else {
				powerCreep.mem.homeRoom = powerCreep.mem.secondaryRoom
			}
		}



	}


	// Spawn
	if (!powerCreep.room) {
		if (spawnPowerCreepForHomeRoom(powerCreep) != OK) {
			powerCreep.mem.homeRoom = undefined
			if (secondaryFunc) {
				return secondaryFunc();
			}		
		}
		return
	}

	// Danger
	if (powerCreep.mem.homeRoom && powerCreep.room.name != powerCreep.mem.homeRoom && (powerCreep.room.dangerous == 2 || powerCreep.mem.fleeTimer)) {
		powerCreep.uncachedMoveTo(new RoomPosition(25, 25, powerCreep.mem.homeRoom), 20, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
		if ((powerCreep.mem.fleeTimer || 0) > 0 && powerCreep.room.dangerous != 2) {
			powerCreep.mem.fleeTimer--;
			if (powerCreep.mem.fleeTimer <= 0) {
				delete powerCreep.mem.fleeTimer;
			}
		}
		else {
			powerCreep.mem.fleeTimer = 5;
		}
	}
	else if (powerCreep.mem.homeRoom && 
			 powerCreep.room.name == powerCreep.mem.homeRoom && 
			 (powerCreep.hits < (powerCreep.room.dangerous == 2 ? powerCreep.hitsMax : powerCreep.hitsMax * 0.5) || (powerCreep.mem.fleeTimer || 0) > 0) && 
			 powerCreep.room.spawns.length) {
		if ((powerCreep.mem.fleeTimer || 0) > 0) {
			powerCreep.mem.fleeTimer--;
			if (powerCreep.mem.fleeTimer <= 0) {
				delete powerCreep.mem.fleeTimer;
			}
		}
		else {
			powerCreep.mem.fleeTimer = 5;
		}
		powerCreep.uncachedMoveTo(powerCreep.room.spawns[0], 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
		powerCreep.mem.state = {};
		delete powerCreep.mem.currentPower;
	}
	else {
		// Retarget at random
		if (Math.random() < 0.01 || (primaryType == POWER_CREEP_TYPE_SEASONAL_MINERAL)) {
			powerCreep.mem.state = {};
			delete powerCreep.mem.currentPower
		}

		let priorities = _.clone(powerCreepLevels[primaryType].priorities)

		// Got to move tower/fortify to the front of the queue.
		if (powerCreep.room.name == powerCreep.mem.homeRoom && powerCreep.room.dangerous == 2) {
			let newPriorities = []
			for (let priority of priorities) {
				if (priority[0] == PWR_OPERATE_TOWER) {
					newPriorities.push(priority)
					break;
				}
			}
			for (let priority of priorities) {
				if (priority[0] == PWR_FORTIFY) {
					newPriorities.push(priority)
					break;
				}
			}
			for (let priority of priorities) {
				if (priority[0] == PWR_OPERATE_SPAWN) {
					newPriorities.push(priority)
					break;
				}
			}
			for (let priority of priorities) {
				if (priority[0] == PWR_OPERATE_EXTENSION) {
					newPriorities.push(priority)
					break;
				}
			}
			// for (let priority of priorities) {
			// 	if (priority[0] != PWR_OPERATE_TOWER && priority[0] != PWR_FORTIFY) {
			// 		newPriorities.push(priority)
			// 	}
			// }

			priorities = newPriorities;
		}

		let ranPower = false;
		let failedPowers = []
		// Not quite sure why this is do, while
		do {
			powerCreep.mem.state = powerCreep.mem.state || {};

			if (powerCreep.mem.currentPower) {
				if (runPower(powerCreep) == OK) {
					ranPower = true;
					break;
				}

				failedPowers.push(powerCreep.mem.currentPower)
				delete powerCreep.mem.currentPower;
				powerCreep.mem.state = {};
			}
			// if (powerCreep.name == "Cool Cat") {
			// 	console.log(JSON.stringify(priorities))
			// }

			let power = priorities.shift()[0];

			// Just do this if we don't have a better power. It's handled elsewhere
			if (power == PWR_GENERATE_OPS && (!powerCreep.room.controller || powerCreep.room.controller.isPowerEnabled)) continue

			// if (powerCreep.name == "Cool Cat") {
			// 	console.log(JSON.stringify(failedPowers))
			// 	console.log(power)
			// 	console.log(powerCreep.mem.currentPower)
			// }

			if (!powerCreep.powers[power]) continue
			// if (powerCreep.powers[power].cooldown) continue
			if (failedPowers.includes(power)) continue

			powerCreep.mem.currentPower = power;
		}
		while (priorities.length) 

		// Hmm. Not sure about do/while for the above
		if (!ranPower && powerCreep.mem.currentPower) {
			if (runPower(powerCreep) == OK) {
				return
			}

			delete powerCreep.mem.currentPower;
			powerCreep.mem.state = {};
		}

		if (!powerCreep.mem.currentPower && !powerCreep.moving) {
			if (Game.rooms[powerCreep.mem.homeRoom] && Game.rooms[powerCreep.mem.homeRoom].dangerous) {
				if (powerCreep.room.storage) {
					powerCreep.uncachedMoveTo(powerCreep.room.storage, 2, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
				}
				else if (powerCreep.room.spawns && powerCreep.room.spawns[0]) {
					powerCreep.uncachedMoveTo(powerCreep.room.spawns[0], 2, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
				}
				else {
					powerCreep.uncachedMoveTo(new RoomPosition(25, 25, powerCreep.mem.homeRoom), 20, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});	
				}
			}
			else {				
				// TODO: Park somewhere sensible.
				powerCreep.uncachedMoveTo(new RoomPosition(25, 25, powerCreep.mem.homeRoom), 20, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1});
			}
		}
	}


}

function runPower(powerCreep) {
	switch (powerCreep.mem.currentPower) {
		case PWR_GENERATE_OPS:
			return runGenerateOps(powerCreep);
		case PWR_REGEN_SOURCE:
			return runRegenSource(powerCreep);			
		case PWR_REGEN_MINERAL:
			return runRegenMineral(powerCreep);
		case PWR_OPERATE_SPAWN:
			return runOperateSpawn(powerCreep);
		case PWR_OPERATE_TOWER:
			return runOperateTower(powerCreep);
		case PWR_OPERATE_EXTENSION:
			return runOperateExtensions(powerCreep);
		case PWR_OPERATE_FACTORY:
			return runOperateFactory(powerCreep);
		case PWR_OPERATE_OBSERVER:
			return runOperateObserver(powerCreep);
		case PWR_OPERATE_LAB:
			return runOperateLab(powerCreep);
		case PWR_FORTIFY:
			return runFortify(powerCreep);
		case PWR_DISRUPT_SPAWN:
			return runDisruptSpawn(powerCreep);
		case PWR_DISRUPT_TOWER:
			return runDisruptTower(powerCreep);
		case PWR_DISRUPT_TERMINAL:
			return runDisruptTerminal(powerCreep);
		case PWR_SHIELD:
			return runShield(powerCreep);
		case PWR_OPERATE_POWER:
			return runOperatePower(powerCreep);
		default:
			console.log("Trying to use unwritten power", powerCreep.mem.currentPower)
			return -Infinity

	}
}


var powerCreepAI = {
	handleLeveling: function() {
		if ((Math.random() < 0.01 || (Game.time % 10 == 0 && Memory.levelPowerCreeps)) && !Memory.freezePowerCreeps) {
			Memory.powerCreepNames = Memory.powerCreepNames || [];
			Memory.powerCreeps = Memory.powerCreeps || {};

			let seenPowerCreepsMin = [];
			let seenPowerCreepsMax = [];

			// let powerCreepSubOrder = POWER_CREEP_ORDER[0];

			let order
			if (Memory.season5) {
				order = POWER_CREEP_ORDER_SEASON5
			}
			else if (Memory.season) {
				order = POWER_CREEP_ORDER_SEASONAL
			} 
			else if (Memory.timedRound) {
				order = POWER_CREEP_ORDER_TIMED
			}
			else if (Memory.privateServer) {
				order = POWER_CREEP_ORDER_PSERVER
			}
			else {
				order = POWER_CREEP_ORDER
			}
			
			for (let powerCreepSubOrder of order) {			
				let localOrder = _.clone(powerCreepSubOrder)
				let powerCreepType;
				let found
				// Go to min levels on currently spawned creeps
				while (localOrder.length) {
					powerCreepType = localOrder.shift();

					found = false;
					// Ordered from earliest to latest.
					for (var powerCreepName of Memory.powerCreepNames) {
						if (seenPowerCreepsMin.includes(powerCreepName)) continue;

						let powerCreep = Game.powerCreeps[powerCreepName];
					
						// Huh
						if (powerCreep.mem.type === undefined) {
							powerCreep.mem.type = powerCreepType;
							Memory.powerCreepNames.push(powerCreep.name)
						}

						if (powerCreep.mem.type == powerCreepType) {
							found = true;
							seenPowerCreepsMin.push(powerCreepName)

							// console.log(powerCreepName, powerCreepType, powerCreep.level, powerCreepLevels[powerCreepType].minLevel)

							if (powerCreep.level < powerCreepLevels[powerCreepType].minLevel && powerCreep.level < powerCreepLevels[powerCreepType].maxLevel) {
								let nextPower = getNextPower(powerCreep);
								if (!nextPower) {
									console.log(nextPower, powerCreep.name, powerCreepType, powerCreep.level, powerCreepLevels[powerCreepType].minLevel, powerCreepLevels[powerCreepType].maxLevel)
									throw(new Error("No next power for power creep"))
								}
								console.log("upgrade a", powerCreep.name, nextPower)
								console.log(powerCreep.upgrade(nextPower))
								delete Memory.disablePower 
								return;
							}
							break;
						}
					}
					if (!found) {
						break;
					}
				}

				// if (Memory.powerCreepNames.length >= 2) return

				// console.log(localOrder, powerCreepType)

				// localOrder now contains a list of the order we don't have yet.
				if (!found) {
					let valid = true;
					if (powerCreepType >= POWER_CREEP_TYPE_ECONOMY_1 && powerCreepType <= POWER_CREEP_TYPE_ECONOMY_5) {
						if (!global.maxEconomyCreepsOfLevel) {
							valid = false;
							console.log("Not spawning power creep of", powerCreepType, "due to no global.maxEconomyCreepsOfLevel")
						}

						let target = global.maxEconomyCreepsOfLevel[powerCreepType - POWER_CREEP_TYPE_ECONOMY_1] || 0

						let currentCnt = 0
						for (let powerCreepName in Game.powerCreeps) {
							if (!Game.powerCreeps[powerCreepName]) continue

							if (Game.powerCreeps[powerCreepName].memory.type == powerCreepType) {
								currentCnt++
							}
						}

						if (currentCnt >= target) {
							valid = false
							console.log("Not spawning power creep of", powerCreepType, "due to not enough factories")
						}
					}

					if (valid) {						
						let name = _.sample(powerCreepNames);
						if (!Game.powerCreeps[name]) {
							if (PowerCreep.create(name, POWER_CLASS.OPERATOR) == OK) {
								// TODO: Don't know if this works
								Memory.powerCreeps[name] = {type: powerCreepType};
								Memory.powerCreepNames.push(name)
								console.log("create new power creep", name)
							}
						}
						delete Memory.disablePower 
						return;
					}
				}
				
				localOrder = _.clone(powerCreepSubOrder)

				// Ok, we have all of them at their min levels. Time to push to max levels.
				while (localOrder.length) {
					powerCreepType = localOrder.shift();

					let found = false;
					
					// Random order
					// TODO: Prioritize that.
					for (var powerCreepName of _.shuffle(Memory.powerCreepNames)) {
						if (seenPowerCreepsMax.includes(powerCreepName)) continue;

						let powerCreep = Game.powerCreeps[powerCreepName];

						if (powerCreep.mem.type == powerCreepType) {
							found = true;
							seenPowerCreepsMax.push(powerCreepName)

							// console.log(powerCreepName, powerCreepType, powerCreep.level, powerCreepLevels[powerCreepType].maxLevel)

							if (powerCreep.level < powerCreepLevels[powerCreepType].maxLevel) {
								let nextPower = getNextPower(powerCreep);
								// console.log("Next power", nextPower)
								if (!nextPower) {
									console.log(nextPower, powerCreepType, powerCreep.level, powerCreepLevels[powerCreepType].minLevel, powerCreepLevels[powerCreepType].maxLevel)
									throw(new Error("No next power for power creep"))
								}
								console.log("upgrade b", powerCreep.name, nextPower)
								console.log(powerCreep.upgrade(nextPower))
								delete Memory.disablePower 
								return;
							}
							break;
						}
					}
					if (!found) {
						break;
					}
				}
			}

			if ((!Memory.timedRound && !Memory.privateServer) || Memory.season3) {
				console.log("Power collection disabled (no upgrade found)")
				// TODO automatic extension into infinite factory levels global.maxEconomyCreepsOfLevel


			}
			else {
				Memory.disablePower = 1
			}
			if (Math.random() < 0.001) {
				console.log("Power collection disabled (no upgrade found)")
			}
		}

	},




	tick: function() {
		// Just for now
		if (Game.shard.name == "shard0" || Game.shard.name == "shard1" || Game.shard.name == "shard3") {
			return
		}
		if (Memory.maxRoomLevel < 8 && !Memory.season3) {
			return
		}

		// Resetting
		// return

		if (Memory.swc) {
			if (Math.random() < 0.0001) {
				console.log("Power creeps disabled on swc")
			}
			return;
		}

		try {
			this.handleLeveling();

			// Decide on distribution. For each type of power creep (except attack) score all my rooms.
			if (Math.random() < 0.005 || !global.powerCreepDistribution) {
				global.powerCreepDistribution = {};

				// POWER_CREEP_TYPE_BOOTSTRAP
				// Pick the lowest level room. Subtract one if power already enabled. Subtract another if boostrap creep is there

				// In all cases higher is better

				// Bootstrap's first mission is to defend
				global.powerCreepDistribution[POWER_CREEP_TYPE_BOOTSTRAP] = {};
				// Don't want them on season
				if (!Memory.season) {					
					for (let room of Game.myRooms) {
						if (room.effectiveLevel == 8) continue;

						if (room.defcon < 5 && room.towers.length > 1) {					
							let score = -room.defcon + room.memory.DT * 0.5 + room.towers.length
							global.powerCreepDistribution[POWER_CREEP_TYPE_BOOTSTRAP][room.name] = score;
						}
					}

					// Then following that support low level rooms
					if (Object.keys(global.powerCreepDistribution[POWER_CREEP_TYPE_BOOTSTRAP]).length == 0) {					
						for (let room of Game.myRooms) {
							let score = -room.effectiveLevel + (room.controller.isPowerEnabled ? 1 : 0)

							// Doesn't actually help much until we can build fat enough harvesters
							if (room.effectiveLevel < 4) {
								continue
							}

							for (var powerCreepName in Game.powerCreeps) {
								let powerCreep = Game.powerCreeps[powerCreepName];
								if (powerCreep.mem.type == POWER_CREEP_TYPE_BOOTSTRAP) {
									if (powerCreep.room && powerCreep.room.name == room.name) {
										score--;
									}
									break;
								}
							}

							global.powerCreepDistribution[POWER_CREEP_TYPE_BOOTSTRAP][room.name] = score;
						}
					}
				}

				// POWER_CREEP_TYPE_ECONOMY
				Memory.commoditiesManager = Memory.commoditiesManager || {};
				Memory.commoditiesManager.factoryPowerAssignment = {}

				let meanX = 0;
				let meanY = 0;

				for (let room of Game.myRooms) {
					let roomCoords = util.getRoomCoords(room.name);
					meanX += roomCoords.x;
					meanY += roomCoords.y;
				}

				meanX /= Game.myRooms.length;
				meanY /= Game.myRooms.length;

				meanX = Math.round(meanX);
				meanY = Math.round(meanY);

				let centreRoomName = util.getRoomNameFromCoords({x: meanX, y: meanY});

				let roomsByDist = _.sortBy(Game.myRooms, function(room) {
					return Game.map.getRoomLinearDistance(room.name, centreRoomName);
				});

				// This should be fine, but lets hide it behind privateServer for now
				if (Memory.privateServer) {					
					// Don't make the assignment until we need to
					// TODO: As far as I can tell this never fires
					// Is that actually a problem? We just keep on refining with the factories
					// that aren't locked down if anyOpFac is always false.
					let anyOpFac = false;
					for (let powerCreepName in Game.powerCreeps) {
						// This line is never true - can't index power on creep
						if (Game.powerCreeps[powerCreepName][PWR_OPERATE_FACTORY]) {
							anyOpFac = true
							break;
						}
					}
					if (!anyOpFac) {
						Memory.commoditiesManager.factoryPowerAssignment = {}
					}
				}

				// TODO: Funcionize this, write something that proposes a new assignment, and rebuilds factories
				// Needed when we claim/unclaim rooms.
				let targetRatios = [0.8, 0.8 * 1302 / 1177, 0.8 * 1302 / 1005, 1302 / 400, 1302 / 400]

				if (Memory.season4) {
					targetRatios = [1, 1, 1, 1, 1]
				}
				let numOfEachSoFar = [0, 0, 0, 0, 0];

				for (let room of roomsByDist) {
					if (Memory.commoditiesManager.factoryPowerAssignment[room.name]) {
						numOfEachSoFar[Memory.commoditiesManager.factoryPowerAssignment[room.name] - 1] += targetRatios[Memory.commoditiesManager.factoryPowerAssignment[room.name] - 1];

						if (room.factory && room.factory.level && room.factory.level != Memory.commoditiesManager.factoryPowerAssignment[room.name]) {
							console.log(room, "has weird factory level", room.factory.level, "should be", Memory.commoditiesManager.factoryPowerAssignment[room.name])
						}
					}
					else if (room.factory && room.factory.level) {
						Memory.commoditiesManager.factoryPowerAssignment[room.name] = room.factory.level
						numOfEachSoFar[room.factory.level - 1]++
					}
				}

				for (let room of roomsByDist) {
					if (!Memory.commoditiesManager.factoryPowerAssignment[room.name]) {
						for (let i = 4; i >= 0; i--) {
							if (room.factory && room.factory.level && room.factory.level != i + 1) continue

							// No level 5 on season 4
							// if (Memory.season4 && i == 4) {
							// 	continue
							// }

							// if (i == 0 || numOfEachSoFar[i - 1] > numOfEachSoFar[i]) {
							if (i == 0 || numOfEachSoFar[i - 1] > numOfEachSoFar[i] || (room.factory && room.factory.level == i + 1)) {
								Memory.commoditiesManager.factoryPowerAssignment[room.name] = i + 1;
								numOfEachSoFar[i] += targetRatios[i];

								if (!Memory.season4) {									
									let roomsByDist2 = _.sortBy(roomsByDist, function(room2) {
										if (Memory.commoditiesManager.factoryPowerAssignment[room2.name] && 
											Memory.commoditiesManager.factoryPowerAssignment[room2.name] !== i + 1) {
											return Infinity;
										}
										else if (room2 == room) {
											return Infinity;
										}
										else if (room2.factory && room2.factory.level && room2.factory.level !== i + 1) {
											return Infinity;	
										}
										return safeRoute.getSafeRouteCost(room2.name, room.name, true, true, 5);
									});

									for (let otherRoom of roomsByDist2) {
										if (otherRoom == room) continue
										if (Memory.commoditiesManager.factoryPowerAssignment[otherRoom.name] && 
											Memory.commoditiesManager.factoryPowerAssignment[otherRoom.name] === i + 1) {
											break;
										}
										else if (Memory.commoditiesManager.factoryPowerAssignment[otherRoom.name]) {
											continue;
										}
										else if (otherRoom.factory && otherRoom.factory.level && otherRoom.factory.level !== i + 1) {
											continue;
										}
										else if (safeRoute.getSafeRouteCost(otherRoom.name, room.name, true, true, 5) > 5) {
											break;
										}

										Memory.commoditiesManager.factoryPowerAssignment[otherRoom.name] = i + 1;
										numOfEachSoFar[i] += targetRatios[i];
										break
									}
								}


								break
							}
						}
					}
				}

				global.maxEconomyCreepsOfLevel = numOfEachSoFar

				for (let i = 1; i <= 5; i++) {
					global.powerCreepDistribution[POWER_CREEP_TYPE_ECONOMY * 10 + i] = {};

					let score = 0;
					for (let room of roomsByDist) {
						if (room.factory && room.effectiveLevel >= 7 && Memory.commoditiesManager.factoryPowerAssignment[room.name] == i) {
							global.powerCreepDistribution[POWER_CREEP_TYPE_ECONOMY * 10 + i][room.name] = room.effectiveLevel + score;

							score--;
						}
					}

					// Get the PC in
					if (score == 0) {
						score -= 1000
						for (let room of roomsByDist) {
							if (Memory.commoditiesManager.factoryPowerAssignment[room.name] == i) {
								global.powerCreepDistribution[POWER_CREEP_TYPE_ECONOMY * 10 + i][room.name] = room.effectiveLevel + score;

								score--;
							}
						}
					}
				}

				// Generic 
				global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL] = {};
				for (let room of Game.myRooms) {
					// Doesn't actually help much until we can build fat enough harvesters
					if (room.effectiveLevel < 4 || !room.storage || (Memory.season2 && room.effectiveLevel < 5)) {
						continue
					}

					// Low level, two sources
					let score
					if (Memory.season3) {
						score = room.effectiveLevel + 
								(room.towers.length ? -room.defcon : 0) * 5 + 
								 roomIntel.getEffectiveNumSources(room.name) * 3 + 
								 (room.controller.isPowerEnabled ? 1 : 0) + 
								 room.mem.spawnUtilization * 10 + 
								 (((Game.time - (room.mem.spawningHeavyMission || 0)) < 2000 || missionInfo.isRoomAssaulting(room, false)) ? 10 : 0);
					}
					else {
						score = -room.effectiveLevel + 
								(room.towers.length ? -room.defcon : 0) * 5 + 
								 roomIntel.getEffectiveNumSources(room.name) * 3 + 
								 (room.controller.isPowerEnabled ? 1 : 0) + 
								 room.mem.spawnUtilization * 10 + 
								 (((Game.time - (room.mem.spawningHeavyMission || 0)) < 2000 || missionInfo.isRoomAssaulting(room, false)) ? 10 : 0);
					}

					if (Memory.season2 && Memory.minRoomLevel == 8 && room.name == "W12S3") {
						score += 15;
					}


					global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL][room.name] = score;
				}


				global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL_POWER] = {};
				for (let room of Game.myRooms) {
					// Doesn't actually help much until we can build fat enough harvesters
					if (room.effectiveLevel < 4 || !room.storage || (Memory.season2 && room.effectiveLevel < 5)) {
						continue
					}

					// Low level, two sources
					let score
					if (Memory.season3) {
						score = room.effectiveLevel + 
								(room.towers.length ? -room.defcon : 0) * 5 + 
								 roomIntel.getEffectiveNumSources(room.name) * 3 + 
								 (room.controller.isPowerEnabled ? 1 : 0) + 
								 room.mem.spawnUtilization * 10 + 
								 (((Game.time - (room.mem.spawningHeavyMission || 0)) < 2000 || missionInfo.isRoomAssaulting(room, false)) ? 10 : 0);
					}
					else {
						score = -room.effectiveLevel + 
								(room.towers.length ? -room.defcon : 0) * 5 + 
								 roomIntel.getEffectiveNumSources(room.name) * 3 + 
								 (room.controller.isPowerEnabled ? 1 : 0) + 
								 room.mem.spawnUtilization * 10 + 
								 (((Game.time - (room.mem.spawningHeavyMission || 0)) < 2000 || missionInfo.isRoomAssaulting(room, false)) ? 10 : 0);
					}

					if (Memory.season3 && room.name == "W3N5") {
						score += 15;
					}


					global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL_POWER][room.name] = score;
				}

				global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL_OP_GEN] = {};
				for (let room of Game.myRooms) {
					// Doesn't actually help much until we can build fat enough harvesters
					if (!room.powerSpawn) {
						continue
					}
					let score = 0

					global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL_OP_GEN][room.name] = score;
				}


				global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL_MINERAL] = {};
				for (let room of Game.myRooms) {
					// Doesn't actually help much until we can build fat enough harvesters
					if (!room.mem.thoriumAmount) {
						continue
					}
					if (Memory.season5 && util.getRoomCoords(room.name).y < 0) {
						continue
					}
					let score = room.effectiveLevel

					//if (Memory.stats.globalResources[RESOURCE_OPS] > 1000) {
						for (let otherRoom of Game.myRooms) {
							if (otherRoom.mem.supportFrom == room.name) {
								score += 5
							}
						}						
					//}


					global.powerCreepDistribution[POWER_CREEP_TYPE_SEASONAL_MINERAL][room.name] = score;
				}

				// POWER_CREEP_TYPE_ASSAULT_SPAWNER
				global.powerCreepDistribution[POWER_CREEP_TYPE_ASSAULT_SPAWNER] = {};
				for (let room of Game.myRooms) {
					if (global.powerCreepDistribution[POWER_CREEP_TYPE_BOOTSTRAP][room.name] && room.effectiveLevel < 7) continue
					// Assault going out. Help.
					if ((Game.time - (room.mem.spawningHeavyMission || 0)) < 2000 || missionInfo.isRoomAssaulting(room, false)) {
						let score = room.effectiveLevel + room.mem.spawnUtilization * 20 + (room.controller.isPowerEnabled ? 1 : 0);
						global.powerCreepDistribution[POWER_CREEP_TYPE_ASSAULT_SPAWNER][room.name] = score;
					}
				}

				// POWER_CREEP_TYPE_ROOM_ATTACK
				global.powerCreepDistribution[POWER_CREEP_TYPE_ROOM_ATTACK] = {};
				for (let room of Game.myRooms) {
					if (global.powerCreepDistribution[POWER_CREEP_TYPE_BOOTSTRAP][room.name] && room.effectiveLevel < 7) continue

					let score = 0
					// Assault going out. Help.
					if (missionInfo.isRoomAssaulting(room, true) && (room.dangerous || 0) != 2) {
						score += room.effectiveLevel + (room.controller.isPowerEnabled ? 1 : 0);
					}

					Memory.combatManager.requestedPowerCreeps = Memory.combatManager.requestedPowerCreeps || {}

					if (Game.time - (Memory.combatManager.requestedPowerCreeps[room.name] || 0) < 1500) {
						score += 10 - (Game.time - (Memory.combatManager.requestedPowerCreeps[room.name] || 0)) / 1500;
					}

					if (score) {
						global.powerCreepDistribution[POWER_CREEP_TYPE_ROOM_ATTACK][room.name] = score;
					}
				}

				// POWER_CREEP_TYPE_ROOM_DEFEND
				global.powerCreepDistribution[POWER_CREEP_TYPE_ROOM_DEFEND] = {};
				for (let room of Game.myRooms) {
					if (global.powerCreepDistribution[POWER_CREEP_TYPE_BOOTSTRAP][room.name] && room.effectiveLevel < 7) continue
						
					if (room.defcon < 5 && room.towers.length > 1) {					
						let score = -room.defcon + room.mem.DT * 0.5 + room.towers.length * 0.2
						global.powerCreepDistribution[POWER_CREEP_TYPE_ROOM_DEFEND][room.name] = score;
					}
				}
			}


			for (let room of Game.myRooms) {
				room.mem.lastAssignedPowerCreeps = room.mem.assignedPowerCreeps;
				room.mem.assignedPowerCreeps = [];
			}

			let cnt = 0;
			for (var powerCreepName in Game.powerCreeps) {
				try {
					let start = Game.cpu.getUsed();
					let powerCreep = Game.powerCreeps[powerCreepName]

					if (powerCreep.room) {
						powerCreep.mem.roomName = powerCreep.room.name
					}

					// Look at renewals
					if (Game.time % 10 == cnt % 10 && powerCreep.room !== undefined) {
						let renew = true
						let bestRoom;
						if (powerCreep.room.powerSpawn && powerCreep.room.powerSpawn.my && powerCreep.room.powerSpawn.isActive() && (powerCreep.room.mem.nukeLandTime || Infinity) - Game.time > 2 * POWER_CREEP_LIFE_TIME) {
							if (powerCreep.ticksToLive > 300 && (!powerCreep.mem.aggressive || powerCreep.ticksToLive > POWER_CREEP_LIFE_TIME - 300)) {
								renew = false;
							}
							else {
								bestRoom = powerCreep.room
							}
						}

						if (renew && !bestRoom) {
							let minDist = Infinity;

							// Try not to spam too many long range safe route checks...
							let sortedRooms = _.sortBy(Game.myRooms, function(room) {return Game.map.getRoomLinearDistance(room.name, powerCreep.room.name) });

							for (let room of sortedRooms) {
								if (!room.powerSpawn || !room.powerSpawn.my || !room.powerSpawn.isActive() || (room.dangerous == 2) || (room.mem.nukeLandTime || Infinity) - Game.time < 2 * POWER_CREEP_LIFE_TIME) continue

								let allowPortals = minDist >= 150

								if (!allowPortals && Game.map.getRoomLinearDistance(room.name, powerCreep.room.name) * 50 > minDist * 2) {
									continue;
								}

								let dist = safeRoute.getSafeRouteCost(powerCreep.room.name, room.name, allowPortals) * 50;

								if (dist < minDist) {
									minDist = dist;
									bestRoom = room;
									let pathDist = powerCreep.mem.path ? powerCreep.mem.path.length : 0
									if (Math.max(pathDist * 2, minDist * 2) < powerCreep.ticksToLive) {
										renew = false;
										break;
									}
								}
							}

							// console.log(powerCreep.name, minDist, powerCreep.ticksToLive)

						}

						if (renew && bestRoom) {
							powerCreep.mem.renewing = 1;
							powerCreep.mem.renewRoom = bestRoom.name;
						}
					}

					let opportunitisticRenew

					if (powerCreep.room && (powerCreep.mem.renewing || (powerCreep.room.powerBanks.length && !powerCreep.room.constructedWalls.length && (powerCreep.ticksToLive || Infinity) < POWER_CREEP_LIFE_TIME - 500))) {
						// Opportunistic
						if (powerCreep.room.powerBanks && powerCreep.room.powerBanks.length && !powerCreep.room.constructedWalls.length) {
							let powerBank = powerCreep.room.powerBanks[0]
							if (!powerCreep.pos.isNearToPos(powerBank.pos)) {
								opportunitisticRenew = 1;
								if (powerCreep.mem.formationCreeps) {
									snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, powerBank.pos, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1}, 1, true, false);
								}
								else {
									powerCreep.uncachedMoveTo(powerBank, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1})
								}
							}
							else {
								if (powerCreep.renew(powerBank) == OK) {
									delete powerCreep.mem.renewing;
									delete powerCreep.mem.renewRoom
								}
								else {
									console.log("error on powerCreep renew 1")
								}
							}
						}
						else {						
							let pos = Game.rooms[powerCreep.mem.renewRoom].powerSpawn.pos
							if (powerCreep.room.name != powerCreep.mem.renewRoom || !powerCreep.pos.isNearToPos(pos)) {
								if (powerCreep.mem.formationCreeps) {
									snakeAI.movePowerCreepSnake(powerCreep.mem.formationCreeps, pos, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1, ignoreKeepers: 1}, 1, true, false);
								}
								else {
									powerCreep.uncachedMoveTo(pos, 1, {avoidEnemyRooms: powerCreep.room.isEnemyRoom() ? 0 : 1, ignoreKeepers: 1})
								}
							}
							else {
								if (powerCreep.renew(powerCreep.room.powerSpawn) == OK) {
									delete powerCreep.mem.renewing;
									delete powerCreep.mem.renewRoom
								}
								else {
									console.log("error on powerCreep renew 2")
								}
							}
						}

					}

					if (global.anyNukes && powerCreep.room) {
						if (powerCreep.room.mem.nukeLandTime !== undefined) {
							if (powerCreep.room.mem.nukeLandTime - Game.time < 50 && powerCreep.ticksToLive > powerCreep.room.mem.nukeLandTime - Game.time) {
								powerCreep.moveTo(powerCreep.pos.findClosestByRange(FIND_EXIT), {ignoreCreeps: true});
								continue
							}
						}
					}

					let allowHauler = true

					/*if (Memory.season4 && powerCreep.store[RESOURCE_OPS] + powerCreep.room.getCurrentOfResource(RESOURCE_OPS) >= POWER_INFO[PWR_OPERATE_FACTORY].ops) {
						if (powerCreep.mem.type == POWER_CREEP_TYPE_ECONOMY_1 && powerCreep.level >= 2) {
							allowHauler = false;
						}
						else if (powerCreep.mem.type == POWER_CREEP_TYPE_ECONOMY_2 && powerCreep.level >= 3) {
							allowHauler = false;
						}
						else if (powerCreep.mem.type == POWER_CREEP_TYPE_ECONOMY_3 && powerCreep.level >= 8) {
							allowHauler = false;
						}
						else if (powerCreep.mem.type == POWER_CREEP_TYPE_ECONOMY_4 && powerCreep.level >= 15) {
							allowHauler = false;
						}
						else if (powerCreep.mem.type == POWER_CREEP_TYPE_ECONOMY_5 && powerCreep.level >= 23) {
							allowHauler = false;
						}
					}*/

					if (Memory.season &&
						allowHauler && 
						powerCreep.room && 
						!powerCreep.mem.renewing && 
						((powerCreep.level < (Memory.season5 ? 8 : 11) && powerCreep.room.dangerous != 2) || powerCreep.store[RESOURCE_ENERGY])) {
						runAsHauler(powerCreep, false, false)
					}
					else if ((!powerCreep.room || !powerCreep.mem.renewing) && !opportunitisticRenew) {
						switch (powerCreep.mem.type) {
							case POWER_CREEP_TYPE_BOOTSTRAP:
								runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ROOM_DEFEND, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ECONOMY, null)})});
								break;
							case POWER_CREEP_TYPE_ASSAULT_SPAWNER:
								runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ECONOMY_1, null)});
								break;
							case POWER_CREEP_TYPE_ECONOMY_1:
							case POWER_CREEP_TYPE_ECONOMY_2:
								runGeneric(powerCreep, powerCreep.mem.type, null);
								break;
							case POWER_CREEP_TYPE_ECONOMY_3:
							case POWER_CREEP_TYPE_ECONOMY_4:
							case POWER_CREEP_TYPE_ECONOMY_5:
								runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ECONOMY, null)});
								break;
							// case POWER_CREEP_TYPE_ECONOMY:
							// 	runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ROOM_DEFEND, null)});
							// 	break;
							case POWER_CREEP_TYPE_SEASONAL_DEFEND:
							case POWER_CREEP_TYPE_SEASONAL_MINERAL:
								runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ECONOMY, null)});
								break;
							case POWER_CREEP_TYPE_ROOM_DEFEND:
								runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ASSAULT_SPAWNER, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ECONOMY_1, null)})});
								break;
							case POWER_CREEP_TYPE_ROOM_ATTACK:
							case POWER_CREEP_TYPE_ROOM_ATTACK_A:
							case POWER_CREEP_TYPE_ROOM_ATTACK_B:
								powerCreep.mem.aggressive = 1;
								runRoomAttack(powerCreep)						
								break;
							case POWER_CREEP_TYPE_SEASONAL:
							case POWER_CREEP_TYPE_SEASONAL_POWER:
							case POWER_CREEP_TYPE_SEASONAL_OP_GEN:
								runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ROOM_DEFEND, null)});
								break;
							case POWER_CREEP_TYPE_ECONOMY:
								runGeneric(powerCreep, powerCreep.mem.type, function() {return runGeneric(powerCreep, POWER_CREEP_TYPE_ROOM_DEFEND, null)});
								break;
							default:
								console.log("Power creep with unknown type :", powerCreep.mem.type)
						}
						if (!powerCreep.usedPower) {
							// Should probably check the cooldown myself rather than spamming it
							powerCreep.usePower(PWR_GENERATE_OPS)
						}						
					}

					if (global.anyNukes && powerCreep.room) {				
						let mem = powerCreep.mem;
						if (mem.pTgtRoom &&
								 Game.rooms[mem.pTgtRoom] &&
								 Game.rooms[mem.pTgtRoom].mem.nukeLandTime &&
								 powerCreep.room.name != mem.pTgtRoom &&
								 Game.rooms[mem.pTgtRoom].mem.nukeLandTime - Game.time < 50 &&
								 Game.rooms[mem.pTgtRoom].controller &&
								 Game.rooms[mem.pTgtRoom].controller.my) {
							powerCreep.moveTo(new RoomPosition(25, 25, powerCreep.room.name), {range: 20, ignoreCreeps: true});
						}
					}


					if (powerCreep.mem.homeRoom && Memory.rooms[powerCreep.mem.homeRoom] && Memory.rooms[powerCreep.mem.homeRoom].assignedPowerCreeps && !Memory.rooms[powerCreep.mem.homeRoom].assignedPowerCreeps.includes(powerCreepName)) {
						Memory.rooms[powerCreep.mem.homeRoom].assignedPowerCreeps.push(powerCreepName)
					}

					cnt++;

					let end = Game.cpu.getUsed()
					Memory.stats.profiler["PowerCreeps" + powerCreepName] = (end - start)
				}
				catch(e) {
					console.log("Error in power creep!", powerCreepName);
					console.log(e);
					if (e) console.log(e.stack);
				}

			}
		}
		catch(e) {
			console.log("Error in power creeps!");
			console.log(e);
			console.log(e.stack);
		}
	}

};

module.exports = powerCreepAI;
