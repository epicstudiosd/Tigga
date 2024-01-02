"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');


class RoomEdgeAssaultMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, setupRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_EDGE_ASSAULT;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			// Dupicated :/
			memory.setupRoomName = setupRoomName;
			memory.bestSetupRoom = setupRoomName;


			let targetExitDir;
			let exits = Game.map.describeExits(setupRoomName);
			for (let exitDir in exits) {
				if (exits[exitDir] == targetRoomName) {
					targetExitDir = exitDir;
					break;
				}
			}

			if (!targetExitDir) {
				console.log("Bad rooms chosen for RoomEdgeAssaultMission" + targetRoomName, setupRoomName);
				return;
			}

			let roomTerrain = Game.map.getRoomTerrain(setupRoomName)

			let positions = [];
			for (let i = 1; i < 49; i++) {
				if (targetExitDir == LEFT && !(roomTerrain.get(0, i) & TERRAIN_MASK_WALL)) {
					positions.push(i);
				}
				else if (targetExitDir == TOP && !(roomTerrain.get(i, 0) & TERRAIN_MASK_WALL)) {
					positions.push(i);
				}
				else if (targetExitDir == RIGHT && !(roomTerrain.get(49, i) & TERRAIN_MASK_WALL)) {
					positions.push(i);
				}
				else if (targetExitDir == BOTTOM && !(roomTerrain.get(i, 49) & TERRAIN_MASK_WALL)) {
					positions.push(i);
				}
			}

			this.memory.numBorderPositions = positions.length;
			this.memory.borderPositions = positions;

			this.memory.roomRange = safeRoute.getSafeRouteCost(sourceRoomName, setupRoomName, true)
		}
	}

	tick() {
		if (this.isActive()) {
			let targetRoomName = this.memory.targetRoomName;

			let numCreeps = 0;
			// Handle healing. Multiple passes.
			for (var creepName of this.memory.assignedCreeps) {
				var creep = Game.creeps[creepName];
				if (creep) {
					creep.edgeBouncer = true;
					creep.borderPostion = this.memory.borderPositions[creep.memory.edgeCreepID];
					creep.expectedHealth = creep.hits
					creep.memory.targetRoom = targetRoomName
					creep.memory.setupRoom = this.memory.setupRoomName
					numCreeps++;
				}
			}

			if (this.memory.pending && numCreeps >= 3) {
				this.memory.pending = false;
				for (var creepName of this.memory.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						creep.memory.retreat = false;
					}
				}
			}

			for (var creepName of this.memory.assignedCreeps) {
				var creep = Game.creeps[creepName];
				if (creep) {
					if (creep.room.name == targetRoomName) {
						creep.expectedHealth += creep.getBoostModifiedHeal() * HEAL_POWER;
						creep.heal(creep);
						creep.doneHealing = 1;
					}
					else if (creep.room.name == this.memory.setupRoomName && !creep.room.dangerous) {
						if (creep.hits != creep.hitsMax) {
							creep.expectedHealth += creep.getBoostModifiedHeal() * HEAL_POWER;
							creep.heal(creep)
							creep.doneHealing = 1;
						}
					}
				}
			}
			for (var creepName of this.memory.assignedCreeps) {
				var creep = Game.creeps[creepName];
				if (creep) {
					if (creep.room.name == this.memory.setupRoomName && !creep.room.dangerous && !creep.doneHealing) {
						let friends = creep.pos.findInRange(creep.room.getMyInjuredCreeps(), 1);
						for (let friend of friends) {
							if (friend.expectedHealth < friend.hits) {
								friend.expectedHealth += creep.getBoostModifiedHeal() * HEAL_POWER;
								creep.heal(friend);
								creep.doneHealing = 1;
							}
						}

					}
				}
			}
			for (var creepName of this.memory.assignedCreeps) {
				var creep = Game.creeps[creepName];
				if (creep) {
					if (creep.room.name == this.memory.setupRoomName && !creep.room.dangerous && !creep.doneHealing) {
						let friends = creep.pos.findInRange(creep.room.getMyInjuredCreeps(), 3);
						for (let friend of friends) {
							if (friend.expectedHealth < friend.hits) {
								friend.expectedHealth += creep.getBoostModifiedHeal() * RANGED_HEAL_POWER;
								creep.rangedHeal(target)(friend);
								creep.doneHealing = 1;
							}
						}

					}
				}
			}


			if ((this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) || Game.time - this.memory.lastLaunchTick > 2000) {
				// Launch fail
				if (Game.time - this.memory.lastLaunchTick <= 1) {
					return this.missionComplete(true);
				}
				else if (Game.time - this.memory.lastLaunchTick > 1450) {
					this.memory.s++;
					return this.missionComplete(true);
				}
				else if (Game.time - this.memory.lastLaunchTick < 1000) {

					this.memory.f++;
					this.memory.fTick = Game.time;
					/*if (Game.time - this.memory.lastLaunchTick < 750) {
						if (Game.rooms[this.memory.sourceRoomName].energyCapacityAvailable >= (this.memory.e + 1) * 700 && (this.memory.e + 1) * 5 <= MAX_CREEP_SIZE) {
							this.memory.e++;
							// Wait for the guys who killed me to despawn.
							this.memory.fRefreshRate = 1400;
							this.memory.fTick = Game.time;
						}
						else {
							this.memory.fRefreshRate = 10000;
							this.memory.fRefreshRate *= (1.5 - this.getSuccessRate());
							this.memory.fTick = Game.time;
						}
					}
					else {
						this.memory.fRefreshRate = 7500;
						this.memory.fRefreshRate *= (1.5 - this.getSuccessRate());
						this.memory.fTick = Game.time;
					}*/
					return this.missionComplete(false);

				}
				return this.missionComplete(false);
			}
			// Need moar. If our guys are still alive and they've managed to kill more than they cost, spawn them some friends.
			else if (Game.time - this.memory.lastLaunchTick > 150 + this.memory.roomRange * 50 &&
					this.memory.spawningCreeps.length == 0 &&
					this.memory.numLaunches < 50 && // Cap to 50 replacement creeps. After 50 then we'd need to request the mission again.
					 Game.time % 10 == 0) {
				if (!this.renewRestricted()) {
					// Only renew if supporting
					global.roomAssaultCounts[targetRoomName] = global.roomAssaultCounts[targetRoomName] || {}
					if (global.roomAssaultCounts[targetRoomName].assaultCount) {
						// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
						// spawning in thinking life is going well.
						let needNew = 0;
						let effectiveTeam = false;
						for (var creepName of this.memory.assignedCreeps) {
							var creep = Game.creeps[creepName];
							if (creep) {
								if (creep.ticksToLive < 150 + this.memory.roomRange * 50) {
									needNew++;
								}
							}
						}
						if (needNew) {
							let creepCount = 0;
							for (var creepName of this.memory.assignedCreeps) {
								var creep = Game.creeps[creepName];
								if (creep && creep.memory.arrivalTime) {
									if (creep.hasActiveBodypart(RANGED_ATTACK)) {
										effectiveTeam = true;
										creepCount++;
									}
								}
							}
							if (effectiveTeam && creepCount > 3) {
								let exits = Game.map.describeExits(targetRoomName)

								for (var exitDir in exits) {
									var exitRoom = exits[exitDir];
									if (exitRoom != this.memory.setupRoomName) continue

									if ((exitDir == LEFT && Memory.rooms[targetRoomName].eWallsL) ||
										(exitDir == RIGHT && Memory.rooms[targetRoomName].eWallsR) ||
										(exitDir == TOP && Memory.rooms[targetRoomName].eWallsT) ||
										(exitDir == BOTTOM && Memory.rooms[targetRoomName].eWallsB)) {
										console.log(this.memory.sourceRoomName + "relaunching " + this.memory.type + " against " +  targetRoomName)
										this.memory.numLaunches += needNew;
										this.memory.lastLaunchTick = Game.time;


										if (Math.random() < 0.1 && this.memory.assignedCreeps.length < this.memory.targetNumCreeps) {
											needNew++
										}

										this.requestSpawns(this.memory.maxBoostLevel, needNew);
										break;
									}
								}
							}
						}
					}

				}
			}
		}

		super.tick();

	}

	setTowerDamage(towerDamage) {
		this.memory.expectedTowerDamage = towerDamage;
	}

	requestSpawns(maxBoostLevel, maxCreepCount) {
		this.memory.maxBoostLevel = this.memory.maxBoostLevel || maxBoostLevel
		maxCreepCount = maxCreepCount || this.memory.numBorderPositions;

		// Need to be able to cover half the tower damage between two of us.
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];


		let numCreeps;

		// Just a guess for now.
		if (parentRoom.effectiveLevel == 8) {
			numCreeps = 9;
		}
		else if (parentRoom.effectiveLevel == 7) {
			numCreeps = 6;
		}
		else {
			numCreeps = 14 - parentRoom.effectiveLevel
		}
		numCreeps = Math.min(numCreeps, this.memory.numBorderPositions, maxCreepCount);


		let toughBoost;
		let rangedBoost;
		let moveBoost;
		let healBoost;

		if (maxBoostLevel > 1) {
			if (maxBoostLevel == 4 && parentRoom.energyCapacityAvailable >= 30 * BODYPART_COST[HEAL] + 10 * BODYPART_COST[RANGED_ATTACK] + 10 * BODYPART_COST[MOVE]) {
				toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, numCreeps * 10 * LAB_BOOST_MINERAL);
				moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, numCreeps * 10 * LAB_BOOST_MINERAL);
			}

			rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, numCreeps * 25 * LAB_BOOST_MINERAL);
			healBoost  = parentRoom.getAvailableBoost(util.isHealBoost, numCreeps * 25 * LAB_BOOST_MINERAL);
		}

		if (!healBoost || !rangedBoost) {
			moveBoost = undefined;
		}

		if (!healBoost || !rangedBoost || !moveBoost) {
			toughBoost = undefined;
		}

		let healPerTickNeeded = this.memory.expectedTowerDamage * 0.175 / (maxBoostLevel == 1 ? 4 : 1);

		let numTough = 0;
		if (toughBoost) {
			numTough = Math.ceil(healPerTickNeeded * 2 * 0.3 / 100);
		}

		let numHeal;
		if (toughBoost) {
			numHeal = Math.ceil(healPerTickNeeded * 0.3 / (BOOSTS[HEAL][healBoost][HEAL] * HEAL_POWER));
		}
		else {
			if (healBoost) {
				numHeal = Math.ceil(healPerTickNeeded / (BOOSTS[HEAL][healBoost][HEAL] * HEAL_POWER));
				if (numHeal < 1.5) {
					healBoost = undefined;
					numHeal = Math.ceil(healPerTickNeeded / HEAL_POWER);
				}
			}
			else {
				numHeal = Math.ceil(healPerTickNeeded / HEAL_POWER);
			}
		}

		console.log("Edge room build")
		console.log(toughBoost, rangedBoost, moveBoost, healBoost)
		console.log(numTough, numHeal)

		let numMove;
		let moveScale;

		let numRanged
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
			numMove = moveScale == 4 ? 10 : (moveScale == 3 ? 13 : 17);
			numRanged = MAX_CREEP_SIZE - numMove - numTough - numHeal;
			if (numRanged < 10) {
				return false;
			}
		}
		else {
			moveScale = 1;
			numMove = numTough + numHeal;
			let remainingEnergy = parentRoom.energyCapacityAvailable - numTough * BODYPART_COST[TOUGH] + numMove * BODYPART_COST[MOVE] + numHeal * BODYPART_COST[HEAL];
			numRanged = Math.min(Math.floor((MAX_CREEP_SIZE - numMove - numTough - numHeal) / 2), Math.floor(remainingEnergy / (BODYPART_COST[MOVE] + BODYPART_COST[RANGED_ATTACK])));

			if (numRanged < parentRoom.effectiveLevel) {
				return false;
			}
			numMove += numRanged;
		}

		let body = [];
		let boosts = {};

		for (var i = 0; i < numTough; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < Math.floor(numMove / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < numRanged; i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < Math.ceil(numMove / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < numHeal; i++) {
			body.push(HEAL)
		}

		if (toughBoost) boosts[toughBoost] = numTough;
		if (rangedBoost) boosts[rangedBoost] = numRanged;
		if (healBoost) boosts[healBoost] = numHeal;
		if (moveBoost) boosts[moveBoost] = (moveScale == 2 || moveScale == 3) ? (numMove - 1) : numMove;


		if (parentRoom.effectiveLevel == 8) {
			numCreeps = Math.round(MAX_CREEP_SIZE * 9 / body.length);
		}
		else if (parentRoom.effectiveLevel == 7) {
			numCreeps = Math.round(MAX_CREEP_SIZE * 6 / body.length);
		}
		else {
			numCreeps = Math.round(MAX_CREEP_SIZE * 3 / body.length)
		}

		this.memory.targetNumCreeps = Math.min(numCreeps, this.memory.numBorderPositions);
		numCreeps = Math.min(this.memory.targetNumCreeps, maxCreepCount);


		for (let i = 0; i < numCreeps; i++) {
			if (this.memory.creepID === undefined) this.memory.creepID = 0;
			this.spawnCreep("ranged", body, boosts, spawn, {edgeCreepID: this.memory.creepID})
			this.memory.creepID++;
			this.memory.creepID %= this.memory.numBorderPositions;
		}
		return true
	}
}



module.exports = RoomEdgeAssaultMission