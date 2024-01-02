"use strict";

var util = require('util');
var creepCreator = require('creepCreator');


const ERR_POWER_RANGER_NOT_ENOUGH_DAMAGE = -100
const ERR_POWER_RANGER_NO_TARGET = -101

function runPowerTank(creep, targetX, targetY, targetRoom) {

	if (creep.room.name != targetRoom) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
		creep.cachedMoveTo(new RoomPosition(targetX, targetY, targetRoom), 4, moveOptions);
		return POWER_BANK_DECAY;
	}

	var targets = creep.room.powerBanks;

	// Done!
	if (targets.length == 0) {
		return ERR_POWER_RANGER_NO_TARGET
	}

	if (creep.hits > creep.hitsMax * .5 - 100 || creep.ticksToLive < 20) {
		var ret = creep.attack(targets[0]);
		if (ret == ERR_NOT_IN_RANGE) {
			creep.cachedMoveTo(targets[0], 1)
		}
		// Hack - not sure why he thinks he's stuck. Probably because it only gets cleared
		// on a successful move
		else if (ret == OK) {
			creep.memory.mS = 0;
		}
	}

	// Estimate ticks to destruction
	var dps = creep.getNumOfBodyPart(ATTACK) * ATTACK_POWER;
	var hp = targets[0].hits;

	var ticksLeft = Math.ceil(hp / dps)

	if (ticksLeft > targets[0].ticksToDecay) {
		return ERR_POWER_RANGER_NOT_ENOUGH_DAMAGE
	}
	else {
		return ticksLeft
	}

}

function runPowerHealer(creep, targetX, targetY, targetRoom) {
	if (creep.hits != creep.hitsMax) {
		creep.heal(creep)
	}

	if (creep.room.name != targetRoom) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
		creep.cachedMoveTo(new RoomPosition(targetX, targetY, targetRoom), 4, moveOptions);
		return 0;
	}

	var powerBanks = creep.room.powerBanks;

	if (powerBanks.length == 0) {
		return ERR_POWER_RANGER_NO_TARGET
	}

	var targets = creep.room.find2(FIND_MY_CREEPS, {
		filter: (targetCreep) => {
			return targetCreep && targetCreep.mem && targetCreep.mem.role && targetCreep.mem.role.startsWith("powerTank");
		}
	});

	// Sit around
	if (targets.length == 0) {
		creep.cachedMoveTo(new RoomPosition(targetX, targetY, targetRoom), 4);
		return 0;
	}

	if (targets[0] && (targets[0].memory.mS || 0) >= 2) {
		// Aaah, my tank is stuck! Maybe it's my fault? I don't know. I'm going to move!
		creep.move(Math.floor(Math.random() * 8) + 1)
	}

	if (creep.hits == creep.hitsMax) {
		if (creep.heal(targets[0]) == ERR_NOT_IN_RANGE) {
			creep.moveTo(targets[0])
			creep.rangedHeal(targets[0])
		}
	}
	else {
		creep.heal(creep)
	}

	return 0
}


function runPowerGuard(creep, targetX, targetY, targetRoom) {
	if (creep.room.name != targetRoom) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
		creep.cachedMoveTo(new RoomPosition(targetX, targetY, targetRoom), 4, moveOptions);
		return 0;
	}

	var enemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
	var areaHostile = [];
	if (enemy) {
		var areaHostile = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 5, {
			filter: (object) => {
				return object.hasBodyPart(ATTACK) || object.hasBodyPart(RANGED_ATTACK);
			}
		});
	}
	var areaFriends = creep.pos.findInRange(FIND_MY_CREEPS, 5);

	var caution = 0;
	if (creep.hits != creep.hitsMax) {
		caution = 1;
	}
	else if (areaHostile.length >= 1) {
		for (var hostileIdx in areaHostile) {
			if (areaHostile[hostileIdx].hits / areaHostile[hostileIdx].hitsMax > .8) {
				caution = 1;
				break;
			}
		}
	}
	else {
		// Nobody can hurt me. Charge!
		caution = -1;
	}

	if (caution) {
		creep.heal(creep)
	}

	if ((enemy && creep.pos.getRangeTo(enemy) <= 1 + caution) || (creep.hits < creep.hitsMax / 2 && areaHostile.length > 1)) {
		creep.uncachedMoveTo(new RoomPosition(25, 25, creep.memory.sR), 20);
	}
	else if (enemy && (creep.pos.getRangeTo(enemy) != 2 + caution && !util.isEdgeOfRoom(enemy.pos))) {
		creep.moveTo(enemy, {visualizePathStyle: {stroke: '#0000ff'}, reusePath: 0, range: 2});
	}


	if (enemy || areaHostile.length > 0) {
		var targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);

		var massDamage = 0;
		for (var i in targets) {
			if (creep.pos.getRangeTo(targets[i]) == 3) massDamage += 1;
			if (creep.pos.getRangeTo(targets[i]) == 2) massDamage += 4;
			if (creep.pos.getRangeTo(targets[i]) == 1) massDamage += 10;
		}
		//
		if(massDamage > 10) {
			creep.rangedMassAttack();
		}
		else {
			creep.rangedAttack(enemy);
		}
	}

	return 0;
}



var powerRangerAI = {
	init: function(spawn, targetX, targetY, targetRoom, power, id) {
		let obj = {};
		obj.creeps = [];
		obj.creepForcedRespawn = [];
		// this.active = false;
		obj.targetX = targetX;
		obj.targetY = targetY;
		obj.targetRoom = targetRoom;
		obj.spawn = spawn.name;
		obj.sR = spawn.room.name;
		obj.squadSize = 3;
		obj.composition = [];
		obj.composition[0] = 'powerTank';
		obj.composition[1] = 'powerHealer';
		obj.composition[2] = 'powerHealer';
		obj.spawnTime = Game.time;
		obj.reinfocementCount = 0;
		// this.retreat = -1;
		obj.calledFetcherCarry = 0;
		obj.neededFetcherCarry = power / 1.05; // Slightly lower to stop us sending haulers for almost nothing.
		obj.missionComplete = false;
		obj.missionFailed = false;
		obj.spawnedFetchers = false;
		obj.id = id;


		console.log(targetX, targetY, targetRoom)

		var pathToSpawn = PathFinder.search(
			spawn.pos, {pos: new RoomPosition(targetX, targetY, targetRoom), range: 2}, {
				plainCost: 1,
				swampCost: 5,
				maxOps: 50000,

				roomCallback: function(roomName) {
					let room = Game.rooms[roomName];
					let costs = new PathFinder.CostMatrix;

					if (room) {
						room.find2(FIND_STRUCTURES).forEach(function(structure) {
							if (structure.structureType == STRUCTURE_ROAD) {
								costs.set(structure.pos.x, structure.pos.y, 1);
							}
							else if (structure.structureType !== STRUCTURE_CONTAINER &&
									   (structure.structureType !== STRUCTURE_RAMPART ||
										!structure.my)) {
								costs.set(structure.pos.x, structure.pos.y, 0xff);
							}
						});
					}

					return costs;
				},
			}
		);

		obj.pathCostToSpawn = pathToSpawn.cost
		if (pathToSpawn.incomplete == true) {
			console.log("Incomplete power path", pathToSpawn.cost, spawn.pos, new RoomPosition(targetX, targetY, targetRoom))

			obj.pathCostToSpawn = 300;
		}

		return obj;
	},

	addCreep : function(instance, role, creepName) {
		instance.creeps.push(creepName);
		console.log(creepName);
		return;
	},

	getCreep : function(instance, idx) {
		return Game.creeps[instance.creeps[idx]];
	},

	run: function(instance) {
		var numCreeps = instance.creeps.length;

		var ticksToEnd = POWER_BANK_DECAY;

		if (!instance.missionComplete) {
			for (var idx = 0; idx < numCreeps; idx++) {
				var creep = this.getCreep(instance, idx);
				if (creep && !creep.spawning) {
					if (creep.room.name != instance.targetRoom /*&& (creep.memory.role.startsWith('powerTank') || creep.memory.role.startsWith('powerHealer'))*/) {
						this.getCreep(instance, idx).cachedMoveTo(new RoomPosition(25, 25, instance.targetRoom), 20);
					}
					else if (creep.room.name == instance.targetRoom) {
						if (creep.memory.role.startsWith('powerTank')) {
							var powerStatus = runPowerTank(creep, instance.targetX, instance.targetY, instance.targetRoom);

							// Ticks to end
							if (powerStatus >= 0 && powerStatus < POWER_BANK_DECAY && instance.calledFetcherCarry < instance.neededFetcherCarry) {
								ticksToEnd = powerStatus;
								// console.log(powerStatus, instance.pathCostToSpawn * 1.2)
								// Gonna be stealing a bunch of fetchers soon. Lets spawn an extra two to cover the gap
								if (powerStatus < instance.pathCostToSpawn * 1.5 + 150 && !instance.spawnedFetchers) {
									if (Game.spawns[instance.spawn]) {
										const HAULER_CARRY = 1250;
										// Spawn half as many as we need. Rest will come from pool
										for (var i = 0; i < instance.neededFetcherCarry / (2 * HAULER_CARRY); i++) {
											Game.spawns[instance.spawn].addPrioritySpawn("fetcher", undefined, undefined, creepCreator.getDesignForEnergyCap("fetcher", Game.spawns[instance.spawn].room.energyCapacityAvailable, 0, 0, false, {}))
										}
										// Game.spawns[instance.spawn].addPrioritySpawn("fetcher")
										instance.spawnedFetchers = true;
									}
								}

								if (powerStatus < instance.pathCostToSpawn * 1.5) {
									if (instance.calledFetcherCarry == 0) console.log("Fetcher request", instance.targetRoom, instance.calledFetcherCarry, instance.neededFetcherCarry)
									if (Game.spawns[instance.spawn]) {
										var fetchers = Game.spawns[instance.spawn].room.memory.ownedCreeps["fetcher"] || [];
										for (let fetcherName of fetchers) {
											var fetcher = Game.creeps[fetcherName]

											if (fetcher && fetcher.memory.role == "fetcher" && _.sum(fetcher.carry) == 0 && fetcher.ticksToLive > 4.5 * instance.pathCostToSpawn) {
												fetcher.memory.role = "powerFetcher"
												fetcher.memory.targetX = instance.targetX
												fetcher.memory.targetY = instance.targetY
												fetcher.memory.targetRoom = instance.targetRoom
												fetcher.memory.f = 1;
												fetcher.memory.dTgt = null;
												fetcher.memory.path = null;

												instance.calledFetcherCarry += fetcher.carryCapacity
												console.log("Fetcher request", instance.targetRoom, instance.calledFetcherCarry, instance.neededFetcherCarry)
											}

											if (instance.calledFetcherCarry >= instance.neededFetcherCarry) {
												break
											}
										}
									}
								}
							}
							else if (powerStatus == ERR_POWER_RANGER_NOT_ENOUGH_DAMAGE) { // Crap
								console.log("Not enough damage to kill power :(", instance.targetRoom)
								instance.missionFailed = true;
							}
							else if (powerStatus == ERR_POWER_RANGER_NO_TARGET) { // I guess we've killed it
								console.log("Power destroyed!", instance.targetRoom)
								instance.missionComplete = true;
							}


						}
						else if (creep.memory.role.startsWith('powerHealer')) {
							var ret = runPowerHealer(creep, instance.targetX, instance.targetY, instance.targetRoom);

							if (ret == ERR_POWER_RANGER_NO_TARGET) {
								instance.missionComplete = true;
							}
						}
						else if (creep.memory.role.startsWith('powerGuard')) {
							var ret = runPowerGuard(creep, instance.targetX, instance.targetY, instance.targetRoom);

							if (ret == ERR_POWER_RANGER_NO_TARGET) {
								instance.missionComplete = true;
							}
						}
					}
				}
			}
		}

		var aliveCount = 0;
		var guardCount = 0;
		var guardCountMini = 0;

		// Need moar
		for (var idx = 0; idx < numCreeps; idx++) {
			var creep = this.getCreep(instance, idx);

			if (creep) {
				if (instance.creepForcedRespawn[idx] == undefined) {
					instance.creepForcedRespawn.push(Game.time + CREEP_LIFE_TIME + creep.body.length);
				}

				aliveCount++;
				if (creep.memory.role == "powerGuard") {
					guardCount++;
				}
				if (creep.memory.role == "powerGuardMini") {
					guardCountMini++;
				}
			}
		}



		if (!instance.missionComplete && !instance.missionFailed) {
	   		// Need moar
			for (var idx = 0; idx < numCreeps; idx++) {
				var creep = this.getCreep(instance, idx);
				if ((creep && creep.ticksToLive == creep.body.length * 3 + instance.pathCostToSpawn && ticksToEnd > creep.ticksToLive) || (Game.time == instance.creepForcedRespawn[idx])) {
					if (Game.spawns[instance.spawn]) {
						var requestRole = instance.composition[idx % instance.squadSize];
						if (instance.reinfocementCount >= 3) {
							// console.log("Mini")
							if (requestRole.startsWith("powerTank")) {
								requestRole = "powerTankMini";
							}
							else if (requestRole.startsWith("powerHealer")) {
								requestRole = "powerHealerMini";
							}
						}
						Game.spawns[instance.spawn].addPrioritySpawn(requestRole, {teamIdx: instance.id});
						console.log("Request new:", requestRole);
						instance.reinfocementCount += 1;
						instance.creepForcedRespawn[idx] = -1;
					}
				}
			}
		}

		if (Game.rooms[instance.targetRoom] && Game.rooms[instance.targetRoom].dangerous == 2) {
			if (Game.spawns[instance.spawn]) {
				var role = "";
				var enemies = Game.rooms[instance.targetRoom].find2(FIND_HOSTILE_CREEPS);

				if (enemies) {
					if (enemies.length > 1 || enemies[0].body.length > 20) {
						role = "powerGuardMini";
					}
					else {
						role = "powerGuard";
					}

					if ((guardCount == 0 && role == "powerGuard") || (guardCountMini == 0 && role == "powerGuardMini")) {
						if (!Game.spawns[instance.spawn].hasPrioritySpawn(role, {teamIdx: instance.id})) {
							Game.spawns[instance.spawn].addPrioritySpawn(role, {teamIdx: instance.id});
						}
					}
				}
			}
		}


		if (instance.missionComplete && instance.calledFetcherCarry < instance.neededFetcherCarry) {
			if (Game.spawns[instance.spawn]) {
				var fetchers = Game.spawns[instance.spawn].room.memory.ownedCreeps["fetcher"] || []
				for (var fetcherName of fetchers) {
					var fetcher = Game.creeps[fetcherName]
					if (fetcher && fetcher.memory.role == "fetcher" && _.sum(fetcher.carry) == 0 && fetcher.ticksToLive > 4.5 * instance.pathCostToSpawn) {
						fetcher.memory.role = "powerFetcher"
						fetcher.memory.targetX = instance.targetX
						fetcher.memory.targetY = instance.targetY
						fetcher.memory.targetRoom = instance.targetRoom
						fetcher.memory.f = 1;
						fetcher.memory.dTgt = null;
						fetcher.memory.path = null;

						instance.calledFetcherCarry += fetcher.carryCapacity
						console.log("Fetcher request", instance.targetRoom, instance.calledFetcherCarry, instance.neededFetcherCarry)
					}

					if (instance.calledFetcherCarry >= instance.neededFetcherCarry) {
						break
					}
				}
			}
		}

		// Not sure what's happened, but it seems like we've failed.
		if (Game.time - instance.spawnTime > 20000) {
			instance.missionFailed = true;
		}


		if (instance.missionComplete || instance.missionFailed) {
			for (var idx = 0; idx < numCreeps; idx++) {
				var creep = this.getCreep(instance, idx);
				if (creep) {
					if (creep.memory.role != "powerGuard") {
						// if (Game.rooms[instance.targetRoom] && Game.rooms[instance.targetRoom].find2(FIND_HOSTILE_CREEPS).length > 0) {
							if (creep.memory.role.startsWith("powerTank")) {
								creep.memory.role = "tank"
								Memory.combatManager.idlePool.push(creep.name)
							}
							if (creep.memory.role.startsWith("powerHealer")) {
								creep.memory.role = "healer"
								Memory.combatManager.idlePool.push(creep.name)
							}
						// }
						// else {
						// 	creep.memory.role = "recycler"
						// }
					}
					else if (Game.rooms[instance.targetRoom] && Game.rooms[instance.targetRoom].find2(FIND_DROPPED_RESOURCES, { filter: (resource) => { return resource.resourceType == RESOURCE_POWER;}}).length == 0) {
						creep.memory.role = "ranged"
						Memory.combatManager.idlePool.push(creep.name)
					}
				}
			}
		}

		if (instance.calledFetcherCarry >= instance.neededFetcherCarry && !instance.lastCall) {
			instance.lastCall = Game.time;
		}

		if ((instance.missionComplete && instance.calledFetcherCarry >= instance.neededFetcherCarry && Game.time > instance.lastCall + instance.pathCostToSpawn * 1.25) || instance.missionFailed) {
			return -1
		}

		return 0;
	}
};

module.exports = powerRangerAI;