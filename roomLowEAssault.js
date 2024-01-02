"use strict";

const FormationAssaultMission = require('formationAssault')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');
const formationAI  = require('formationAI');
const WeakRoomAttack = require("weakRoomAttack")

const utf15 = require('./utf15');
const Codec = utf15.Codec;

class RoomLowEAssaultMission extends FormationAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;


			memory.fRefreshRate = memory.fRefreshRate || 20000;
			memory.startEnergy = undefined;
			memory.startWallHP = undefined;
			memory.startRampHP = undefined;
			delete this.memory.target;
			delete this.memory.targets;
			delete this.memory.bestSetupRoom;
			delete this.memory.setupPos;

			let mem = Memory.rooms[targetRoomName];

			var bestSetupRoom;
			var bestExitDir;
			var bestRouteLength = Infinity;

			var exits = Game.map.describeExits(this.memory.targetRoomName);
			for (var exitDir in exits) {
				var exitRoom = exits[exitDir];

				if (mem.blockedEntrances[JSON.stringify(this.memory.mask)] && mem.blockedEntrances[JSON.stringify(this.memory.mask)][exitDir]) {
					continue;
				}

				if (!Memory.rooms[exitRoom]) {
					continue;
				}

				if (Memory.rooms[exitRoom].owner && Memory.rooms[exitRoom].owner != util.getMyName()) {
					continue;
				}

				if (exitDir == LEFT && mem.eWallsL) {
					if (this.memory.squadSize == 9) {
						continue;
					}
				}
				else if (exitDir == RIGHT && mem.eWallsR) {
					if (this.memory.squadSize == 9) {
						continue;
					}
				}
				else if (exitDir == BOTTOM && mem.eWallsB) {
					if (this.memory.squadSize == 9) {
						continue;
					}
				}
				else if (exitDir == TOP && mem.eWallsT) {
					if (this.memory.squadSize == 9) {
						continue;
					}
				}
			 	if (Memory.rooms[exitRoom].fullyConnected === 0) {
			 		continue;
			 	}
			 	if ((Memory.rooms[exitRoom].safeMode || 0) > ASSAULT_SAFE_MODE_PRESPAWN) {
			 		continue;
			 	}

				if (!missionInfo.canLaunchNewAssault(this.memory.targetRoomName, exitRoom)) {
					continue;
				}


				// var coords = util.getSectorCoords(exitRoom);


				var pathCost = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, exitRoom, true);

				if (pathCost > 15) {
					continue;
				}

				if (pathCost < bestRouteLength) {
					bestRouteLength = pathCost;
					bestSetupRoom = exitRoom;
					bestExitDir = exitDir;
				}
			}

			if (!bestSetupRoom) {
				if (Math.random() < 0.01) console.log("no setup room for", this.memory.type, "attack", sourceRoomName, targetRoomName, this.memory.squadSize)
				// Memory.fTick = Game.time;
				this.ID = 0;
				return;
			}

			if (this.selectCloseCombat()) {
				this.ID = 0;
				return;
			}


			let softTargets = 0;
			for (var towerIdx in Memory.rooms[targetRoomName].twrX) {
				if (Memory.rooms[targetRoomName].twrExtern[towerIdx] || !Memory.rooms[targetRoomName].twrInside[towerIdx]) {
					softTargets = 1;
					break;
				}
			}

			for (var spawnIdx in Memory.rooms[targetRoomName].spwnX) {
				if (Memory.rooms[targetRoomName].spwnExtern[spawnIdx] || !Memory.rooms[targetRoomName].spwnInside[spawnIdx]) {
					softTargets = 1;
					break;
				}
			}


			var energyAvailable = Game.rooms[sourceRoomName].energyCapacityAvailable;
			var maxHeals;
			if (this.memory.closeCombat) {
				maxHeals = Math.min(MAX_CREEP_SIZE / 2, Math.floor((energyAvailable) / 300)); // All heal on the healers.
			}
			else {
				maxHeals = Math.min((MAX_CREEP_SIZE - 6) / 2, Math.floor((energyAvailable - 600) / 300)) // Need at least three damaging parts per creep to make this a threat. Squad of four.
			}

			let healPower = HEAL_POWER;
			let maxHealPower = healPower * maxHeals;

			this.memory.squadMaxHeal = maxHealPower * (this.memory.closeCombat ? 2 : this.memory.squadSize);

			// console.log("LowE", sourceRoomName, targetRoomName, this.memory.squadMaxHeal)

			this.memory.bestExitDir = bestExitDir;
			this.memory.bestSetupRoom = bestSetupRoom;

			// Find a room to enter from and a wall to hit.
			// Wall should have two places I can hit it from.
			//	Far from the towers
			//	Close to spawns
			//	  Close to the exit
			// Assume we have max heal. This is just to see if there IS a target.
			let bestTarget = this.getBestTarget(this.memory.squadMaxHeal, false);
			if (!bestTarget) {
				// console.log("no target for lowE attack", sourceRoomName, targetRoomName)
				this.ID = 0;
				return;
			}

			// Find a setup location
			let setupExitDir = ((bestExitDir - 1 + 4)) % 8 + 1;

			let setupPos = this.getSetupPos(setupExitDir, bestTarget, bestSetupRoom);
			if (!setupPos) {
				console.log("no setup pos for", this.memory.type, "attack", sourceRoomName, targetRoomName, setupExitDir, bestTarget, bestSetupRoom)
				this.ID = 0;
				return;
			}

			// Now we have a trial target, see how much heal it needs and spawn for that
			let numTowers = mem.twrX.length || 0.1;
			// console.log("Testing lowE attack", this.memory.squadMaxHeal, this.memory.targetDamage, targetRoomName, LOW_E_MAX_INCOMING_DPS, numTowers)
			// this.ID = 0;
			// return;

			let maxTowerDamage
			if (mem.maxTowerDamageAtOuterWallByEdge) {
				maxTowerDamage = mem.maxTowerDamageAtOuterWallByEdge[Math.round((parseInt(bestExitDir) - 1) / 2)];
			}
			else {
				maxTowerDamage = mem.maxTowerDamageAtOuterWall
			}


			let damageScale = this.memory.targetDamage / (maxTowerDamage || 1);

			let minDamage = (numTowers * 600 * damageScale - LOW_E_MAX_INCOMING_DPS * (Memory.botArena ? 1 : 0.5)) / numTowers
			let maxDamage = (Math.min(600, numTowers * 600 * damageScale + LOW_E_MAX_INCOMING_DPS * (Memory.botArena ? 1 : 0.5))) / numTowers

			if ((mem.storE || 0) <= 10000 && !mem.trmX) {
				minDamage *= 0.75;
			}
			if ((mem.storE || 0) + (mem.trmE || 0) <= 100) {
				minDamage *= 0.75;
			}
			if (softTargets) {
				minDamage *= 0.9
			}

			// Always on towers are easy to run from
			if (mem.towerShootsAttack > 0.99) {
				minDamage *= 0.5;
			}
			else if (mem.towerShootsAttack > 0.9) {
				minDamage *= 0.75;
			}
			else if (mem.towerShootsAttack > 0.75) {
				minDamage *= 0.9;
			}
			// So are always off towers...
			else if (mem.towerShootsAttack < 0.001) {
				minDamage *= 0.5;
			}
			else if (mem.towerShootsAttack < 0.01) {
				minDamage *= 0.8;
			}
			else if (mem.towerShootsAttack < 0.05) {
				minDamage *= 0.95;
			}
			// We just don't know. Be optimistic
			else if (mem.towerShootsAttack === undefined) {
				minDamage *= 0.5;
			}

			// Kinda a drain attack
			if (mem.wallHP == 0 && mem.rampHP == 0) {
				minDamage *= 0.5;
			}

			this.memory.minHealPerTower = Math.round(minDamage * 10000) / 10000;

			if (!this.requestSpawns(maxDamage, false, true, false)) {
				console.log("Spawn failed for", this.memory.type, "attack", sourceRoomName, targetRoomName)
				this.ID = 0;
				return;
			}

			// Find best target an setup pos with real heal.
			// May as well have checks on these as well though I don't think they should fail.
			bestTarget = this.getBestTarget(this.memory.squadHeal, true, 0);
			if (!bestTarget) {
				console.log("Check 2: no target for", this.memory.type, "attack", sourceRoomName, targetRoomName)
				this.missionComplete(true);
				return;
			}
			this.memory.target = bestTarget;

			// Find a setup location
			setupExitDir = ((bestExitDir - 1 + 4)) % 8 + 1;
			setupPos = this.getSetupPos(setupExitDir, bestTarget, bestSetupRoom);

			this.memory.setupPos = setupPos;
			if (!setupPos) {
				console.log("Check 2: no setup pos for", this.memory.type, "attack", sourceRoomName, targetRoomName)
				this.missionComplete(true);
				return;
			}

			console.log(sourceRoomName, "Launching", memory.type, "against", targetRoomName, "mode", this.memory.closeCombat ? "w" : "r")
		}
	}

	getBestTarget(healAmount, force, recurCount) {
		var bestScore = Infinity;
		var bestTarget;

		let roomMap = roomIntel.getEnemyRoomMap(this.memory.targetRoomName);

		if (!Memory.rooms[this.memory.targetRoomName].navigationByMask) {
			roomIntel.calcNavigableByMask(this.memory.targetRoomName, this.memory.mask, true);
		}

		let mask = JSON.stringify(this.memory.mask);
		let maskNavigation = Memory.rooms[this.memory.targetRoomName].navigationByMask[mask];


		var targetPositions = [];
		if (roomMap) {
			function doesXYFail(x, y, squadSize) {
				const depth = 1;
				const codec = new Codec({ depth, array:1 });

				if (squadSize == 4) {
					if ((x >= 2 && codec.decode(maskNavigation[x - 2])[y] != 1) &&
						(x >= 2 && codec.decode(maskNavigation[x - 2])[y - 1] != 1) &&
						(y >= 2 && codec.decode(maskNavigation[x - 1])[y - 2] != 1) &&
						(y >= 2 && codec.decode(maskNavigation[x])[y - 2] != 1) &&
						codec.decode(maskNavigation[x + 1])[y - 1] != 1 &&
						codec.decode(maskNavigation[x + 1])[y] != 1 &&
						codec.decode(maskNavigation[x])[y + 1] != 1 &&
						codec.decode(maskNavigation[x - 1])[y + 1] != 1
						) {
						return true;
					}
				}
				else if (squadSize == 9) {
					if ((x >= 3 && codec.decode(maskNavigation[x - 3])[y - 1] != 1) &&
						codec.decode(maskNavigation[x + 1])[y - 1] != 1 &&
						(y >= 3 && codec.decode(maskNavigation[x - 1])[y - 3] != 1) &&
						codec.decode(maskNavigation[x - 1])[y + 1] != 1
						) {
						return true;
					}
				}
				return false;
			}

			if (Game.rooms[this.memory.targetRoomName]) {
				for (let structure of Game.rooms[this.memory.targetRoomName].find(FIND_STRUCTURES)) {
					if (!structure.hits) continue
					if (structure.structureType == STRUCTURE_RAMPART && structure.my) continue

					let scoreMod = 1;
					if (structure.structureType == STRUCTURE_ROAD) {
						scoreMod = 0.3;
					}
					if (structure.structureType == STRUCTURE_WALL || structure.structureType == STRUCTURE_CONTAINER) {
						scoreMod = 0.4;
					}
					if (structure.structureType == STRUCTURE_RAMPART) {
						scoreMod = 0.8;
					}

					let i = structure.pos.x;
					let j = structure.pos.y;
					// Exterior wall, or something outside
					if (parseInt(roomMap[i][j]) >= 3) {
						if (doesXYFail(i, j, this.memory.squadSize)) continue;

						if (this.memory.squadSize == 4) {
							if (formationAI.formation2x2GetFlushOrientation(i, j, roomMap, Game.rooms[this.memory.targetRoomName]) != undefined) {
								targetPositions.push({"x": i, "y": j, scoreMod: scoreMod})
							}
						}
						else if (this.memory.squadSize == 9) {
							if (formationAI.formation3x3GetFlushOrientation(i, j, roomMap, Game.rooms[this.memory.targetRoomName]) != undefined) {
								targetPositions.push({"x": i, "y": j, scoreMod: scoreMod})
							}
						}

					}
				}
			}
			else {			
				for (var i = 1; i < 49; i++) {
					for (var j = 1; j < 49; j++) {
						// Exterior walls are 3.
						if (parseInt(roomMap[i][j]) === 3) {
							if (Game.shard.name != "AppleCrumble") {
								if (doesXYFail(i, j, this.memory.squadSize)) continue;
							}
							else {
								if (maskNavigation[i][j] != 1) {
									continue;
								}
							}

							// We need a 2x2 square that sits flush.
							// We're pushing the position of the wall not the position we sit at. The sit-position and orientation are returned if we need them.
							if (this.memory.squadSize == 4) {
								if (formationAI.formation2x2GetFlushOrientation(i, j, roomMap, Game.rooms[this.memory.targetRoomName]) != undefined) {
									targetPositions.push({"x": i, "y": j, scoreMod: 1})
								}
							}
							else if (this.memory.squadSize == 9) {
								if (formationAI.formation3x3GetFlushOrientation(i, j, roomMap, Game.rooms[this.memory.targetRoomName]) != undefined) {
									targetPositions.push({"x": i, "y": j, scoreMod: 1})
								}
							}
						}
					}
				}
			}
		}

		var dangerousCreeps = [];
		if (Game.rooms[this.memory.targetRoomName]) {
			let room = Game.rooms[this.memory.targetRoomName];
			dangerousCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK]);
		}

		// if (Game.rooms[this.memory.targetRoomName]) {


		// }
		// else {


		// }
		for (var targetPosition of targetPositions) {
			var rangeToEdge;
			if 		(this.memory.bestExitDir == TOP)	 rangeToEdge = targetPosition.y;
			else if (this.memory.bestExitDir == LEFT)	 rangeToEdge = targetPosition.x;
			else if (this.memory.bestExitDir == BOTTOM)	 rangeToEdge = 49 - targetPosition.y;
			else if (this.memory.bestExitDir == RIGHT)	 rangeToEdge = 49 - targetPosition.x;

			var towerDamage = 0;

			for (var towerIdx = 0; towerIdx < Memory.rooms[this.memory.targetRoomName].twrX.length; towerIdx++) {
				var towerX = Memory.rooms[this.memory.targetRoomName].twrX[towerIdx];
				var towerY = Memory.rooms[this.memory.targetRoomName].twrY[towerIdx];

				var towerDist = Math.max(Math.abs(targetPosition.x - towerX), Math.abs(targetPosition.y - towerY));

				towerDamage += util.getTowerDamageForDist(towerDist);
			}

			if (targetPosition.x == 2 || targetPosition.x == 47 || targetPosition.y == 2 || targetPosition.y == 47) {
				if (this.memory.directional) {
					if (this.memory.closeCombat) {
						towerDamage *= 2;
					}
					else {
						towerDamage *= 1.5;
					}
				}
				else {
					towerDamage *= 1.25;
				}
			}

			// We're happy to take some damage, but there is a limit.
			// This is dealt with later. Maybe we could have a shortcut here though.
			// if (towerDamage - healAmount > LOW_E_MAX_INCOMING_DPS * (1 + this.memory.e / 10) * (Memory.botArena ? 1 : 0.5)) {
			// 	continue;
			// }

			// Score is based on tower damage and how far we have to move.
			// Minimize the score.
			let score = 0;

			// Scale based on potential
			for (let dangerCreep of dangerousCreeps) {
				if (dangerCreep.pos.getRangeTo(targetPosition.x, targetPosition.y) < 3) {
					let hostileParts = dangerCreep.getBoostModifiedCombatParts(true);

					score += hostileParts.numAttack * 30;
					score += hostileParts.numRanged * 40;
				}
			}

			// We lose a bunch of healing in this case
			if (rangeToEdge < 2) {
				score += 300 * Memory.rooms[this.memory.targetRoomName].twrX.length;
			}
			// They're on the opposite side to I spawned in on? No.
			else {
				score += rangeToEdge * 20 * Memory.rooms[this.memory.targetRoomName].twrX.length;
			}

			// Can do this without vision, but it's late.
			// TODO: Do it without vision
			if (Game.rooms[this.memory.targetRoomName]) {
				let wallPos = new RoomPosition(targetPosition.x, targetPosition.y, this.memory.targetRoomName)
				score += 20 * wallPos.getRangeTo(wallPos.findClosestByRange(FIND_EXIT));
			}

			score += towerDamage;

			this.memory.targetDamage = towerDamage;

			score *= (0.9 + Math.random() * 0.2);

			score /= targetPosition.scoreMod;

			if (score < bestScore) {
				bestScore = score;
				bestTarget = targetPosition;
			}
		}

		if (force && !bestTarget && (recurCount || 0) < 20) {
			return this.getBestTarget(healAmount * 1.1, force, (recurCount || 0) + 1)
		}

		return bestTarget;
	}

	checkNeedNewTargetKilled(formationIdx) {
		if (this.memory.formations[formationIdx].length == 0) return false;

		// console.log(formationIdx)
		let room = Game.rooms[this.memory.targetRoomName];

		let target = this.memory.targets[formationIdx] || this.memory.target

		if (target) {
			let targetStructs = room.lookForAt(LOOK_STRUCTURES, target.x, target.y);

			if (targetStructs.length == 0) {
				if (this.memory.targets[formationIdx]) {
					delete this.memory.targets[formationIdx]
				}
				delete this.memory.target
				return true;
			}

			return false;
		}

		return true;
	}



	tick() {
		super.tick();

		if (this.isActive()) {
			let tmem = Memory.rooms[this.memory.targetRoomName];


			if (!this.memory.pending) {
				// Do we need a new target?
				if (Game.rooms[this.memory.targetRoomName]) {
					if (this.memory.keepFormation) {
						for (let formationIdx in this.memory.formations) {
							let formation = this.memory.formations[formationIdx];
							if (formation.length == 0) continue;
							
							let forcedNewTarget = this.checkNeedNewTargetForced(formationIdx);
							let newTarget =  !this.memory.targets[formationIdx] || this.checkNeedNewTargetKilled(formationIdx);

							if (newTarget || forcedNewTarget) {
								var newBestTarget = this.getBestTarget(this.memory.squadHeal, true);
								// console.log(this.memory.ID, this.memory.target, newBestTarget)
								if (newBestTarget) {
									this.memory.target = newBestTarget;
									this.memory.targets[formationIdx] = newBestTarget;

									for (let creepName of formation) {
										var creep = Game.creeps[creepName];
										if (creep && !creep.memory.nibbler) {
											if (newTarget || creep.memory.forceNewTarget == Game.time - 1) {
												creep.memory.target = newBestTarget;
											}
										}
									}
								}
								else {
									this.memory.keepFormation = 0;
								}
							}
						}
					}
					
					this.reTargetRoamingCreepDanger()

					if (this.memory.startWallHP === undefined || this.memory.startRampHP === undefined || this.memory.startEnergy === undefined) {
						let defensiveStructures = Game.rooms[this.memory.targetRoomName].find2(FIND_STRUCTURES, {
							filter: (structure) => {
								return (structure.structureType == STRUCTURE_WALL || structure.structureType == STRUCTURE_RAMPART) && structure.hits;
							}
						});

						this.memory.startWallHP = 0;
						this.memory.startRampHP = 0;
						for (var structure of defensiveStructures) {
							if 		(structure.structureType == STRUCTURE_WALL)	   this.memory.startWallHP += structure.hits;
							else if (structure.structureType == STRUCTURE_RAMPART) this.memory.startRampHP += structure.hits;
						}

						let totalEnergy = 0;
						for (var towerIdx in Memory.rooms[this.memory.targetRoomName].twrX) {
							totalEnergy += Memory.rooms[this.memory.targetRoomName].twrE[towerIdx];
						}
						totalEnergy += Memory.rooms[this.memory.targetRoomName].storE || 0;
						totalEnergy += Memory.rooms[this.memory.targetRoomName].trmE || 0;

						this.memory.startEnergy = totalEnergy

					}
				}
			}

			let relaunchCooldown = 1500 - (this.memory.preSpawnOffset || 0) - (this.memory.routeLength || 10) * 50 - 300;

			let targetRoomName = this.memory.targetRoomName;

			if (missionInfo.canLaunchNewAssault(targetRoomName, this.memory.bestSetupRoom) && Memory.rooms[this.memory.sourceRoomName].spawnUtilization < 0.85) {
				relaunchCooldown -= 250 + (Memory.rooms[targetRoomName].enemyFullyConnected ? 100 : 0)
			}

			relaunchCooldown += (Memory.rooms[this.memory.sourceRoomName].boostFailed || 0);

			relaunchCooldown += (10000 - Game.cpu.bucket) / 100
			relaunchCooldown += (10000 - Memory.stats.avgBucket) / 100


			if (relaunchCooldown < 400) {
				relaunchCooldown = 400;
			}
			else if (relaunchCooldown > 1200) {
				relaunchCooldown = 1200;
			}

			if (Game.time % 10 == 0) {
				// Not tested
				try {						
					let totalTowerEnergy = 0;
					for (let energy of Memory.rooms[targetRoomName].twrE) {
						totalTowerEnergy += energy;
					}

					if (totalTowerEnergy < 30 || !Memory.rooms[targetRoomName].twrX.length) {
						WeakRoomAttack.requestWeakRoomAttack(this.memory.targetRoomName, (this.memory.p || 0))
					}
					else {
						// Spam it, 'cos we'll want it
						Memory.combatManager.requestedMissions[MISSION_WEAK_ROOM_ATTACK][this.memory.targetRoomName] = Game.time
					}
				}
				catch(e) {
					console.log(e)
				}
			}


			if (((this.memory.assignedCreeps.length + this.memory.spawningCreeps.length < 4) || Game.time - this.memory.lastLaunchTick > 3000)) {
				var totalEnergy = 0;
				for (var towerIdx in Memory.rooms[this.memory.targetRoomName].twrX) {
					totalEnergy += Memory.rooms[this.memory.targetRoomName].twrE[towerIdx];
				}
				totalEnergy += Memory.rooms[this.memory.targetRoomName].storE || 0;
				totalEnergy += Memory.rooms[this.memory.targetRoomName].trmE || 0;

				let energyDrained = this.memory.startEnergy - totalEnergy + (this.memory.startWallHP + this.memory.startRampHP - tmem.wallHP - tmem.rampHP) / 100;

				global.roomAssaultCounts[this.memory.targetRoomName] = global.roomAssaultCounts[this.memory.targetRoomName] || {};
				if (global.roomAssaultCounts[this.memory.targetRoomName].assaultCount) {
					energyDrained /= global.roomAssaultCounts[this.memory.targetRoomName].assaultCount;
				}

				// Can't trust this number too much, and we're ideally not doing an empire drain.
				energyDrained += relaunchCooldown * (tmem.termEnergyInPerTick || 0) / (Memory.botArena ? 10 : 20);

				if (Game.rooms[this.memory.targetRoomName] && tmem.assaultReactionCreepsSpawned) {						
					// Look at all the creeps, figure out the % that are from this room.
					let defenseCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);

					let reactionCreepBodyCost = 0;

					for (var defenseCreep of defenseCreeps) {
						if (!tmem.assaultReactionCreepsSpawned.includes(defenseCreep.id)) {
							reactionCreepBodyCost += util.getECostForCreep(defenseCreep)
						}
					}

					// Again, empire drain.
					energyDrained += reactionCreepBodyCost / (Memory.botArena ? 10 : 20);
				}

				// If we haven't cost them half as much energy as we cost ourselves don't bother.
				// The attack probably costs 4x that. Give up for now.
				// If we've broken formation then we've killed all spawns/towers, so that's not a failure
				if (energyDrained < 0.5 * this.memory.bC * this.memory.numLaunches * ((this.memory.boosted || 0) + 1) * ((this.memory.boosted || 0) + 1) && this.memory.keepFormation == 1) {
					// We ded or never got there
					if (Game.time - this.memory.lastLaunchTick < 1000 || this.memory.startWallHP === undefined || this.memory.startRampHP === undefined || this.memory.startEnergy === undefined) {
						this.memory.fRefreshRate = 10000 * ((this.memory.boosted || 0) + 1) * ((this.memory.boosted || 0) + 1) * (Memory.botArena ? 1 : 2);
						if (Game.time - this.memory.lastLaunchTick < 900) {
							this.memory.e++;
							if (this.getSuccessRate() < 0.5) {
								this.memory.e++;
							}
						}
					}
					// Just not enough drained. This could be because a terminal sent in more...
					else {
						if (energyDrained > 0) {
							this.memory.fRefreshRate = 1500 * ((this.memory.boosted || 0) + 1) * ((this.memory.boosted || 0) + 1) * (Memory.botArena ? 1 : 2);
						}
						else {
							this.memory.fRefreshRate = 3000 * ((this.memory.boosted || 0) + 1) * ((this.memory.boosted || 0) + 1) * (Memory.botArena ? 1 : 2);
						}
						if (Math.random() < 0.1) {
							this.memory.e--;
						}
					}
					this.memory.f++;
					this.memory.fRefreshRate *= (1.5 - this.getSuccessRate());
					if (Memory.stats.avgBucket < 3000)  {
						this.memory.fRefreshRate *= 1.25;
					}
					if (Memory.maxRoomLevel < 7) {
						this.memory.fRefreshRate *= 3
					}

					this.memory.fTick = Game.time;
					this.missionComplete(false);


				}
				else {
					// We've not failed, but ideally we'd be respawning
					// Have a bit of a break.
					this.memory.fRefreshRate = 250 * ((this.memory.boosted || 0) + 1) * ((this.memory.boosted || 0) + 1) * (Memory.botArena ? 1 : 2);
					this.memory.fTick = Game.time;

					if (Memory.maxRoomLevel < 7) {
						this.memory.fRefreshRate *= 3
					}					

					this.memory.s++;
					this.missionComplete(true);
				}
			}
			else if (Game.time - this.memory.lastLaunchTick > relaunchCooldown &&
					 Game.time % 10 == 1 && this.memory.target) {
				let nothingToHurt = false
				if (Memory.rooms[this.memory.targetRoomName].wallHP == 0 &&
					Memory.rooms[this.memory.targetRoomName].rampHP == 0 &&
					Memory.rooms[this.memory.targetRoomName].spwnX.length == 0 &&
					Memory.rooms[this.memory.targetRoomName].twrX.length == 0) {
					nothingToHurt = true;
				}

				if (!nothingToHurt &&
					this.memory.startWallHP !== undefined &&
					this.memory.startRampHP !== undefined &&
					this.memory.startEnergy !== undefined) {
					var totalEnergy = 0;
					for (var towerIdx in Memory.rooms[this.memory.targetRoomName].twrX) {
						totalEnergy += Memory.rooms[this.memory.targetRoomName].twrE[towerIdx];
					}
					totalEnergy += tmem.storE || 0;
					totalEnergy += tmem.trmE || 0;

					// If we haven't cost them half as much energy as we cost ourselves don't bother.
					// The attack probably costs 4x that. Give up for now.
					let energyDrained = this.memory.startEnergy - totalEnergy + (this.memory.startWallHP + this.memory.startRampHP - tmem.wallHP - tmem.rampHP) / 100;

					global.roomAssaultCounts[this.memory.targetRoomName] = global.roomAssaultCounts[this.memory.targetRoomName] || {};
					if (global.roomAssaultCounts[this.memory.targetRoomName].assaultCount) {
						energyDrained /= Math.max(1, global.roomAssaultCounts[this.memory.targetRoomName].assaultCount);
					}

					let obscureDrainMod = 1 / (Memory.botArena ? (Memory.timedRound ? 1 : 10) : 20)

					// Can't trust this number too much, and we're ideally not doing an empire drain.
					energyDrained += relaunchCooldown * (tmem.termEnergyInPerTick || 0) * obscureDrainMod;
					
					if (Game.rooms[this.memory.targetRoomName] && tmem.assaultReactionCreepsSpawned) {						
						// Look at all the creeps, figure out the % that are from this room.
						let defenseCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);

						let remoteReactionCreepBodyCost = 0;

						for (var defenseCreep of defenseCreeps) {
							if (!tmem.assaultReactionCreepsSpawned.includes(defenseCreep.id)) {
								remoteReactionCreepBodyCost += util.getECostForCreep(defenseCreep)
							}
						}

						// Again, empire drain.
						energyDrained += remoteReactionCreepBodyCost * obscureDrainMod;
					}

					// This is going well enough. Respawn.
					// Boosts are expesive, so base it on the square of the boost level

					// If we're not boosted and the source room allows low priorty missions, cut the renew cost.
					let cheapRenew = !this.memory.boosted && !Game.rooms[this.memory.sourceRoomName].restrictOffensiveMissions(this.memory.targetRoomName, false, true, false) && this.memory.squadSize == 4

					// Hit rooms without terminals (or no apparent terminal income) harder
					let mod = 1
					if (Memory.maxRoomLevel >= 7) {						
						if (!tmem.trmX || (tmem.termEnergyInPerTick || 0) < 1) {
							mod = 4;
						}
					}

					// Look at percentage energy drained not just absolute. If we take them from 10000->1000 that's a bigger deal than 100000->91000
					mod *= Math.max(1, 4 - 3 * totalEnergy / this.memory.startEnergy);


					if (energyDrained * mod > (cheapRenew ? 0.5 : 1) * this.memory.bC * this.memory.numLaunches * ((this.memory.boosted || 0) + 1) * ((this.memory.boosted || 0) + 1) &&
						!this.renewRestricted()) {
						console.log(this.memory.sourceRoomName, "relaunching", this.memory.type, "against", this.memory.targetRoomName)
						console.log("Drained", energyDrained)

						let numTowers = Memory.rooms[this.memory.targetRoomName].twrX.length || 0.1;
						if (this.requestSpawns(this.memory.targetDamage / numTowers, false, true, true)) {
							if (Math.random() < 0.1) {
								this.memory.e--;
							}

							this.memory.lastLaunchTick = Game.time;
							this.memory.numLaunches += 1;
						}
					}
				}

			}
		}
	}

	requestSpawns(maxHealPerTower, expensiveBoosts, restrictBoosts, refresh) {

		let ret = super.requestSpawns(maxHealPerTower, expensiveBoosts, restrictBoosts, refresh)

		if (ret) {
			if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
				Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += 4
			}			
		}

		return ret
	}


	getMinHealPerTowerNeeded(restrictBoosts) {
		return this.memory.minHealPerTower;
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = RoomLowEAssaultMission