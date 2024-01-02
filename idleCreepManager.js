"use strict";

let safeRoute = require('safeRoute');

let creepCreator = require('creepCreator');
let roomIntel = require('roomIntel');
let util = require('util');

var idleCreepManager = {
	tick: function() {
		let t = Game.cpu.getUsed()

		// Find orphans. This can happen if they're queued for spawning
		// and their mission is completed.
		if (Math.random() < 0.02) {
			for (var creepName in Game.creeps) {
				var creep = Game.creeps[creepName];
				if (creep.mem.ID && !creep.mem.shardTarget) {
					var orphaned = true;
					for (let type of MISSION_TYPES) {
						for (var mission of Memory.combatManager.currentMissions[type]) {
							if (mission.ID && creep.mem.ID == mission.ID) {
								orphaned = false;
								break;
							}
						}
					}

					if (orphaned) {
						creep.mem.ID = 0;
						creep.mem.retreat = 1;
						Memory.combatManager.idlePool.push(creepName);
					}
				}
			}
		}

		try {
			Memory.combatManager.idleSpawns = Memory.combatManager.idleSpawns || []
			for (let idleSpawn of _.clone(Memory.combatManager.idleSpawns)) {

				// console.log(JSON.stringify(idleSpawn), Game.creeps[idleSpawn.name])

				let creepName = idleSpawn.name
				if (Game.creeps[creepName]) {
					_.pull(Memory.combatManager.idleSpawns, idleSpawn)
					Memory.combatManager.idlePool.push(creepName)
				}
				else if (Game.time - idleSpawn.t > 100000) {
					_.pull(Memory.combatManager.idleSpawns, idleSpawn)
				}
			}
			// I get duplicates in here. Dunno why
			if (Math.random() < 0.001) {
				let len = Memory.combatManager.idlePool.length
				Memory.combatManager.idlePool = _.uniq(Memory.combatManager.idlePool)
				if (Memory.combatManager.idlePool.length != len) {
					console.log("Idle pool had duplicates?")
				}
			}

			for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
				if (Game.creeps[idleCreep]) {
					var creep = Game.creeps[idleCreep];

					if (creep.mem.ID) {
						_.pull(Memory.combatManager.idlePool, idleCreep)
						continue
					}

					if (creep.spawning) {
						continue
					}

					// Recylce boosted creeps.
					if (Math.random() < 0.1 && !creep.mem.role.includes("ChildRoom")) {
						if ((!creep.room.dangerous && (creep.hasBoost() || (creep.mem.targetBoosts && Object.keys(creep.mem.targetBoosts).length && !creep.mem.boostsChecked)) && Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].labs.length) || creep.mem.role == "claimer") {
							creep.mem.role = "recycler";
						}
					}
					// if (!creep.mem.boostsChecked && creep.mem.targetBoosts && Object.keys(creep.mem.targetBoosts).length && !creep.mem.role.includes("ChildRoom")) {
					// 	creep.mem.boostsChecked = 1
					// }

					if (creep.mem.role == "powerTank" || creep.mem.role == "newPowerTank" ) {
						creep.mem.role = "tank"
					}
					else if (creep.mem.role == "powerHealer" || creep.mem.role == "newPowerHealer" ) {
						creep.mem.role = "healer"
					}

					// They're not great harvesters, but why not.
					/*if (creep.memory.role == "fetcher" || creep.memory.role == "powerFetcher") {
						// Return them to the world.
						_.pull(Memory.combatManager.idlePool, idleCreep);
					}
					else*/ if (creep.mem.role == "deconstructor") {
						creep.mem.role = "recycler"
						_.pull(Memory.combatManager.idlePool, idleCreep);
					}
					else if (creep.mem.role == "transporter" || creep.mem.role == "fetcher" || creep.mem.role == "powerFetcher") {
						creep.mem.role = "fetcher"
						_.pull(Memory.combatManager.idlePool, idleCreep);

						var room = Game.rooms[creep.mem.sR]
						if (room) {
							if (!room.mem.ownedCreeps["fetcher"]) {
								room.mem.ownedCreeps["fetcher"] = []
							}
							if (!room.mem.ownedCreeps["fetcher"].includes(creep.name)) {
								room.mem.ownedCreeps["fetcher"].push(creep.name)
							}
						}
					}
					else if (creep.mem.role.startsWith("intershard")) {
						_.pull(Memory.combatManager.idlePool, idleCreep);	
					}
					// Maybe something will fall through the cracks here. Probably not.
					else if (!creep.hasBodypart(ATTACK) && !creep.hasBodypart(HEAL) && !creep.hasBodypart(RANGED_ATTACK) && (!creep.hasBodypart(WORK) || creep.hasBodypart(CARRY)) && !creep.hasBodypart(CLAIM)) {
						_.pull(Memory.combatManager.idlePool, idleCreep);
					}
					else if (Memory.season4 && creep.mem.role == "season4Scorer") {
						_.pull(Memory.combatManager.idlePool, idleCreep);
					}
					else if (Memory.season5 && creep.mem.role == "season5ScoreTransport") {
						_.pull(Memory.combatManager.idlePool, idleCreep);
					}
					else if (Memory.season5 && creep.mem.role == "season5ReactorClaim") {
						_.pull(Memory.combatManager.idlePool, idleCreep);
					}
					else {			
						if (creep.room.isMyRoom() && !creep.mem.role.includes("ChildRoom")) {
							creep.mem.sR = creep.room.name;
						}

						var protectRooms = Memory.rooms[creep.mem.sR].protectRooms || [];

						if (global.inTickObject.flushIdleCreeps) {
							delete creep.mem.targetRoom
							creep.mem.idleGuardTimer = 0
						}

						if (creep.mem.targetRoom && Memory.rooms[creep.mem.targetRoom].owner != util.getMyName() && (Memory.rooms[creep.mem.targetRoom].safeMode || 0) > 0) {
							delete creep.mem.targetRoom
						}

						if (!creep.mem.targetRoom || creep.room.name == creep.mem.targetRoom) {
							if (creep.room.name == creep.mem.targetRoom) {
								creep.mem.idleGuardTimer = creep.mem.idleGuardTimer || (35 + Math.round(10 * Math.random()));
								if (!creep.room.dangerous || creep.room.keeperRoom) {
									creep.mem.idleGuardTimer--;
								}
							}
							if (!creep.mem.targetRoom || (creep.mem.idleGuardTimer || 0) <= 0) {
								if (creep.mem.role.includes("ChildRoom")) {
									creep.mem.targetRoom = this.getNewRoomToProtect(creep, creep.mem.sR, false, protectRooms, 2);
								}
								else {
									if (creep.getNumOfBodyPart(MOVE) < creep.body.length / 2) {
										creep.mem.targetRoom = this.getNewRoomToProtect(creep, creep.room.name, false, protectRooms, 3);
									}
									else {
										creep.mem.targetRoom = this.getNewRoomToProtect(creep, creep.room.name, false, protectRooms, 5);
									}
								}

								delete creep.mem.idleGuardTimer;
							}
						}

						if (!creep.mem.targetRoom) {
							if (Memory.rooms[creep.mem.sR].DT < 0.5 && !creep.mem.role.includes("ChildRoom")) {
								creep.recycle = 1
							}
							else {
								creep.mem.targetRoom = creep.mem.sR
							}
						}

						if (creep.mem.targetRoom) {
							creep.mem.retreat = 0
						}

						/*let goodRooms = Memory.rooms[creep.mem.sR].goodRooms;
						if (!creep.mem.targetRoom || (goodRooms && !goodRooms.includes(creep.room.name) && !goodRooms.includes(creep.mem.targetRoom))) {
							creep.mem.targetRoom = this.getNewRoomToProtect(creep, protectRooms);
							// creep.mem.retreat = true;
						}
						// If we're miles away from the new room just go home
						if (safeRoute.getSafeRouteCost(creep.room.name, creep.mem.targetRoom, false) > 5) {
							creep.mem.fallbackRoom = creep.mem.sR
							creep.mem.retreat = true;
						}
						else {
							creep.mem.retreat = false;
						}*/
					}

				}
				else {
					_.pull(Memory.combatManager.idlePool, idleCreep);
				}
			}
		}
		catch(e) {
			console.log("Error on idle creep management!");
			console.log(e);
			console.log(e.stack);
		}

		Memory.stats.profiler["combatManagerIdleCreeps"] = (Game.cpu.getUsed() - t)
	},


	getNewRoomToProtect(creep, homeRoom, dangerousOnly, protectRoomNames, maxRange) {
		// fromRoom, toRoom, allowPortals, force, maxRange, avoidKeepers, ignoreKeepers
		// First go to owned rooms we're actively defending.
		let minRange = maxRange
		let bestRoomName
		for (let room of Game.myRooms) {
			let defenseRoomName = room.name
			if (dangerousOnly && Game.rooms[defenseRoomName] && !Game.rooms[defenseRoomName].dangerous) {
				continue
			}
			if (!room.mem.attackScore && room.mem.DT < 0.2) {
				continue
			}

			var pathCost = safeRoute.getSafeRouteCost(homeRoom, defenseRoomName, false, false, maxRange);

			if (pathCost < minRange) {
				bestRoomName = defenseRoomName
				minRange = pathCost
			}
		}

		if (bestRoomName) {
			// console.log("A idle creep", creep, "going to", bestRoomName)
			return bestRoomName
		}

		// Join in current defense missions
		if (global.inTickObject.activeDefenseMissions) {
			for (let defenseRoomName of _.shuffle(global.inTickObject.activeDefenseMissions)) {
				if (dangerousOnly && Game.rooms[defenseRoomName] && !Game.rooms[defenseRoomName].dangerous) {
					continue
				}

				var pathCost = safeRoute.getSafeRouteCost(homeRoom, defenseRoomName, false, false, maxRange);

				if (pathCost < minRange) {
					bestRoomName = defenseRoomName
					minRange = pathCost
				}
			}
		}

		if (bestRoomName) {
			// console.log("B idle creep", creep, "going to", bestRoomName)
			return bestRoomName
		}

		// Then ones we're picketing.
		if (global.inTickObject.activePicketMissions) {
			for (let defenseRoomName of _.shuffle(global.inTickObject.activePicketMissions)) {
				if (homeRoom == defenseRoomName) continue
				if (dangerousOnly && Game.rooms[defenseRoomName] && !Game.rooms[defenseRoomName].dangerous) {
					continue
				}

				var pathCost = safeRoute.getSafeRouteCost(homeRoom, defenseRoomName, false, false, maxRange);

				if (pathCost < minRange) {
					bestRoomName = defenseRoomName
					minRange = pathCost
				}
			}
		}

		if (bestRoomName) {
			// console.log("C idle creep", creep, "going to", bestRoomName)
			return bestRoomName
		}

		// if (protectRoomNames.length) {
			// minRange = Infinity

			// Then seek out some tasty danger even if we don't have a mission for it yet
			// Ignore room names specifically marked. Checking current state is more up to date for current danger.
			let dangerousRoomNames = []
			let allProtectRooms = protectRoomNames

			if (Game.rooms[homeRoom] && Game.rooms[homeRoom].isMyRoom()) {
				allProtectRooms = _.uniq(allProtectRooms.concat(Game.rooms[homeRoom].goodRooms).concat(Game.rooms[homeRoom].buildRooms))
			}
			else if (creep) {
				allProtectRooms = _.uniq(allProtectRooms.concat(Game.rooms[creep.mem.sR].goodRooms).concat(Game.rooms[creep.mem.sR].buildRooms))
			}

			// console.log(protectRoomNames)
			// console.log(allProtectRooms)

			for (let protectRoomName of allProtectRooms) {
				if (Game.rooms[protectRoomName] && Game.rooms[protectRoomName].dangerous == 2) {
					var pathCost = safeRoute.getSafeRouteCost(homeRoom, protectRoomName, false, false);

					if (pathCost < minRange) {
						bestRoomName = protectRoomName
						minRange = pathCost
					}

					// dangerousRoomNames.push(protectRoomName)
				}
			}

			if (bestRoomName) {
				// console.log("D idle creep", creep, "going to", bestRoomName)
				return bestRoomName
			}

			// Then go where we think invaders will appear next.
			for (let protectRoomName of allProtectRooms) {
				if (Memory.rooms[protectRoomName] && (Memory.rooms[protectRoomName].hSnceLstInv || 0) > INVADERS_ENERGY_GOAL * .7 && util.hasSectorGotAStronghold(protectRoomName)) {
					var pathCost = safeRoute.getSafeRouteCost(homeRoom, protectRoomName, false, false);

					// More sources means more likely to cross over threshold
					pathCost -= roomIntel.getEffectiveNumSources(protectRoomName)

					if (pathCost < minRange) {
						bestRoomName = protectRoomName
						minRange = pathCost
					}					
				}
			}

			if (bestRoomName) {
				// console.log("E idle creep", creep, "going to", bestRoomName)
				return bestRoomName
			}

			bestRoomName = _.sample(protectRoomNames)	
			// console.log("F idle creep", creep, "going to", bestRoomName)

			// Then just patrol. Could do max(DT)
			return bestRoomName
		// }

		return 
	},

	canPullIdleCreep: function(creep, sourceRoomName, halfMove) {
		if (creep.mem.ID) {
			return false;
		}
		if (creep.mem.role.endsWith("ChildRoom") && sourceRoomName != creep.mem.sR) {
			return false;
		}
		if (!halfMove && creep.mem.forceRamparter) {
			return false;
		}
		if (!halfMove && creep.getNumOfBodyPart(MOVE) < creep.body.length / 2) {
			return false
		}
		// if (creep.room.dangerous && creep.room.name != sourceRoomName) {
		// 	return false;
		// }

		return true;
	},


	getIdleCreepForBody : function(body, spawnRoom, halfMove, minTTL = 0) {
		var bodyCounts = _.countBy(body);

		for (var idleCreep of Memory.combatManager.idlePool) {
			// I don't think this can fail, but what the heck
			if (Game.creeps[idleCreep]) {
				if (Game.creeps[idleCreep].ticksToLive < minTTL) {
					continue
				}

				if (!this.canPullIdleCreep(Game.creeps[idleCreep], spawnRoom.name, halfMove)) {
					continue;
				}

				let maxRange = Math.min(5, 0.5 * Game.creeps[idleCreep].ticksToLive / 50)

				// Don't want creeps from half way across the world
				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, spawnRoom.name, false, false, maxRange);

				if (pathCost > maxRange) continue;


				// var idleBodyCounts = _.countBy(_.map(Game.creeps[idleCreep].body, 'type'));
				// console.log("a", JSON.stringify(idleBodyCounts));
				// console.log("b", JSON.stringify(bodyCounts));
				var fail = false;
				for (var bodyPart of Object.keys(bodyCounts)) {
					if (Game.creeps[idleCreep].getNumOfBodyPart(bodyPart) < (bodyCounts[bodyPart] || 0)) {
					// if ((idleBodyCounts[bodyPart] || 0) < (bodyCounts[bodyPart] || 0)) {
						fail = true;
						break;
					}
				}

				if (!fail) {
					console.log("Repurposing idle creep", idleCreep);
					return Game.creeps[idleCreep];
				}

			}
		}

		return ""
	},

	sortIdleCreepsByDistanceToRoom(roomName) {
		Memory.combatManager.idlePool = _.sortBy(Memory.combatManager.idlePool, [function(creepName) { return safeRoute.getSafeRouteCost(Game.creeps[creepName].room.name, roomName, false); }]);
	},

	hasRoomGotIdleCreepAssigned(targetRoomName) {
		for (var idleCreep of Memory.combatManager.idlePool) {
			if (Game.creeps[idleCreep]) {
				var creep = Game.creeps[idleCreep];

				if (creep.mem.targetRoom == targetRoomName) {
					return true
				}
			}
		}
		return false;
	},

	// isRoomSpawningToIdlePool(room) {
	// 	Memory.combatManager.idleSpawns = Memory.combatManager.idleSpawns || []
	// 	for (let creepInfo of Memory.combatManager.idleSpawns) {
	// 		if (creepInfo.sourceRoom == room.name) {
	// 			return true
	// 		}
	// 	}
	// 	return false
	// },


	spawnToIdlePool(sourceRoom, role, maxEnergy, targetRoomName) {
		console.log(sourceRoom, role, maxEnergy, targetRoomName)
		let body = creepCreator.getDesignForEnergyCap(role, maxEnergy, false, false, false, {})

		var name = "il" + (role[0] + Memory.creepCount.toString());
		Memory.creepCount++

		// Don't need a long idle guard timer as they should go to places at risk of invasion
		let extraMemory = {targetRoom: targetRoomName, ID: 0, idleGuardTimer: 10};

		let spawn = sourceRoom.spawns[0]

		if (!spawn) {
			return;
		}

		spawn.addPrioritySpawn(role, extraMemory, name, body);

		Memory.combatManager.idleSpawns = Memory.combatManager.idleSpawns || []
		Memory.combatManager.idleSpawns.push({t: Game.time, name, sourceRoom: sourceRoom.name});

		// Memory.combatManager.idleSpawns_TEST.push({t: Game.time, name, sourceRoom: sourceRoom.name});

		sourceRoom.mem.lastSpawnToIdlePool = Game.time

		console.log("SPAWN TO IDLE", sourceRoom, role, maxEnergy, targetRoomName)
	},
}

module.exports = idleCreepManager;