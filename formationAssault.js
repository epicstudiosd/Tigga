"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const formationCreator = require('formationCreator');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');
const nukeAI = require('nukeAI');
const defenseAnalysis = require("defenseAnalysis")

const roomHeavyCreepHold = require("roomHeavyCreepHold");

const utf15 = require('./utf15');
const Codec = utf15.Codec;


class FormationAssaultMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		let fRefreshMod = 1;
		global.roomAssaultCounts[targetRoomName] = global.roomAssaultCounts[targetRoomName] || {};
		if (global.roomAssaultCounts[targetRoomName].assaultCount && missionInfo.canLaunchNewAssault(targetRoomName)) {
			fRefreshMod = 0.1;
		}

		super(memory, sourceRoomName, targetRoomName, createNew, priority, fRefreshMod)

		// Grandfathering
		memory.targets = memory.targets || [];

		if (createNew && this.isActive()) {
			memory.closeCombat = 0; // Default
			memory.directional = 0; // Default
			memory.nextCreepPosD0 = 0;
			memory.nextCreepPosD1 = 0;

			memory.keepFormation = 1;

			// We want to do an escalating engagement.
			// Start small, if we fail, escalate.
			let sum = 0;
			let cnt = 0;

			for (let otherMission of Memory.combatManager.currentMissions[memory.type]) {
				if (otherMission.targetRoomName == targetRoomName) {
					sum += (otherMission.e || 0)
					cnt++;
				}
			}
			if (!memory.e) {
				if (cnt == 0) {
					memory.e = 0;
				}
				else {
					memory.e = Math.floor(sum / cnt);
				}
			}
			else if (cnt && sum / cnt > memory.e) {
				memory.e = Math.round((memory.e + sum / cnt) / 2)
			}

			memory.formations = [];
			memory.formationTypes = [];
			memory.setupPositions = [];
			memory.targets = [];
			memory.roamingCreepDangers = [];

			memory.boosted = 0;
			memory.peakBoosted = 0;
			memory.withdrawnEscalated = 0;

			memory.lastLaunchTick = Game.time

			memory.preSpawnOffset = 0;

			memory.routeLength = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true, true)

			// This is going to change, so poke it to refresh.
			// We activate then fail spawn too often for this to be good.
			// Memory.remoteRefreshOffset = (Memory.remoteRefreshOffset || 0) - 500;
		}
	}

	selectCloseCombat() {
		let mem = Memory.rooms[this.memory.targetRoomName];

		// If the defense is more wall based we can't use RMA
		// to damage multiple at once, so we want to go decon.
		let wallCountRatio;
		let mostlyWalls;


		if (mem.wallHPByEdge && mem.rampartHPByEdge && mem.wallCountByEdge && mem.rampartCountByEdge) {
			let idx = Math.round((parseInt(this.memory.bestExitDir) - 1) / 2);

			wallCountRatio = (mem.wallCountByEdge[idx] || 0) / ((mem.wallCountByEdge[idx] || 0) + (mem.rampartCountByEdge[idx] || 0) + 1e-9)
			mostlyWalls = Math.random() * ((mem.wallHPByEdge[idx] || 0)) * wallCountRatio > Math.random() * ((mem.rampartHPByEdge[idx] || 0)) * (1 - wallCountRatio);
		}
		else {
			wallCountRatio = (mem.numWalls || 0) / ((mem.numWalls || 0) + (mem.numRamps || 0) + 1e-9);
			mostlyWalls = Math.random() * (mem.wallHP || 0) * wallCountRatio > Math.random() * (mem.rampHP || 0) * (1 - wallCountRatio);
		}

		// Chance we ignore this and spawn the other type anyway. In general RA is bad when there are walls, directional is fine when there are.
		if (mostlyWalls && Math.random() < 0.05) {
			mostlyWalls = false;
		}
		else if (!mostlyWalls && Math.random() < 0.3) {
			mostlyWalls = true;
		}
		if (wallCountRatio > 0.25 && Math.random() < 0.75) {
			mostlyWalls = true;
		}

		if ((mem.numAttacksFailed || 0) >= 3 || intelAI.strugglingToKillRooms(mem.owner) >= 10) {
			if (mostlyWalls && (mem.numAttacksFailedClose || 0) / mem.numAttacksFailed > 0.7) {
				mostlyWalls = false;
			}
			if (!mostlyWalls && (mem.numAttacksFailedRanged || 0) / mem.numAttacksFailed > 0.7) {
				mostlyWalls = true;
			}
		}

		// The wall attackers really don't like big tower damage
		// if (mem.maxTowerDamage >= 3000 && mostlyWalls && Math.random() < 0.5) {
		// 	mostlyWalls = false;
		// }

		// Are there any extenal keypoints? If so, favour attack.
		if (!mostlyWalls) {
			let externalStuff = false;

		  	for (var towerIdx in mem.twrX) {
				if (mem.twrExtern[towerIdx] || !mem.twrInside[towerIdx]) {
					externalStuff = true;
					break;
				}
			}

		  	for (var spawnIdx in mem.spwnX) {
				if (mem.spwnExtern[spawnIdx] || !mem.spwnInside[spawnIdx]) {
					externalStuff = true;
					break;
				}
			}

			if (externalStuff && Math.random() < 0.5) {
				mostlyWalls = true;
			}
			// Ranged attack aren't great at killing pushers
			if ((mem.unableToHurtDangerTargets || 0) > 5000 & Math.random() < 0.5) {
				mostlyWalls = true;
			}
		}


		if (mostlyWalls && this.memory.squadSize == 9) {
			if (Math.random() < 0.05) {
				console.log("Large low E assault won't go against walls", this.memory.sourceRoomName, this.memory.targetRoomName)
			}
			// Memory.fTick = Game.time;
			this.ID = 0;
			return 1;
		}

		if (mostlyWalls) {
			this.memory.closeCombat = 1;
			this.memory.directional = 1;
		}

		return 0
	}

	preTick() {
		if (this.isActive()) {
			let targetRoomName = this.memory.targetRoomName;

			if (Math.random() < 0.005) {
				console.log("current assault from", this.memory.sourceRoomName, "to", targetRoomName)
			}
			if (Game.map.visual) Game.map.visual.line(new RoomPosition(25, 25, this.memory.sourceRoomName), new RoomPosition(25, 25, targetRoomName), {color: "#ff0000", width: 3})

			global.roomAssaultCounts[targetRoomName] = global.roomAssaultCounts[targetRoomName] || {};

			let relaunchPreSpawn = (this.memory.preSpawnOffset || 0) + (this.memory.routeLength || 10) * 50 + 300;

			let count = 0;
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName];
				if (creep) {
					if (creep.ticksToLive < relaunchPreSpawn) {
						// Do nothing
					}
					else if (creep.renew || creep.mem.retreat || creep.moon) {
						count += 0.5;
					}
					else {
						count++;
					}
				}
			}

			let activeFormations = 0;
			for (let formationIdx in this.memory.formations) {
				let formation = this.memory.formations[formationIdx];
				let numCreepsAlive = 0;
				for (let creepName of formation) {
					let creep = Game.creeps[creepName];
					if (creep && creep.ticksToLive >= relaunchPreSpawn) {
						numCreepsAlive++
					}
				}
				if (numCreepsAlive == this.memory.squadSize) {
					activeFormations++;
				}
			}

			global.roomAssaultCounts[targetRoomName].activeFormations = (global.roomAssaultCounts[targetRoomName].activeFormations || 0) + activeFormations;


			count = count * 0.5 * .75 / Math.sqrt(this.memory.squadSize)

			// let count = 0.5 * (this.memory.assignedCreeps.length / Math.sqrt(this.memory.squadSize)) * .75

			this.memory.currentAssaultCount = count

			global.roomAssaultCounts[targetRoomName].assaultCount = (global.roomAssaultCounts[targetRoomName].assaultCount || 0) + count;
			global.roomAssaultCounts[targetRoomName].assaultCountByEdge = global.roomAssaultCounts[targetRoomName].assaultCountByEdge || [0, 0, 0, 0];

			if (this.memory.type == MISSION_ROOM_LOW_ENERGY_ASSAULT || this.memory.type == MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE) {
				global.roomAssaultCounts[targetRoomName].lowECount = (global.roomAssaultCounts[targetRoomName].lowECount || 0) + count;
			}
			if (this.memory.boosted) {
				global.roomAssaultCounts[targetRoomName].boostedCount = (global.roomAssaultCounts[targetRoomName].boostedCount || 0) + count;	
			}

			global.roomAssaultCounts[targetRoomName].nibbleCount = global.roomAssaultCounts[targetRoomName].nibbleCount || 0

			for (let creepName of this.memory.assignedCreeps) {
				if (Memory.creeps[creepName] && Memory.creeps[creepName].nibbler) {
					global.roomAssaultCounts[targetRoomName].nibbleCount++;
				}
			}

			let exits = Game.map.describeExits(targetRoomName)
			for (let exitDir in exits) {
				if (exits[exitDir] == this.memory.bestSetupRoom) {
					global.roomAssaultCounts[targetRoomName].assaultCountByEdge[Math.round((parseInt(exitDir) - 1) / 2)] += count;
					break;
				}
			}

			global.roomAssaultCounts[targetRoomName].numAssaultLaunches = (global.roomAssaultCounts[targetRoomName].numAssaultLaunches || 0) + this.memory.numLaunches;

			// For some reason a 4-creep squad uses count = 0.75. Don't want to change that but total count is used for CPU and stuff so I'd rather it be correct in that regard.
			global.totalAssaultCount = global.totalAssaultCount + count / 0.75;

			global.roomAssaultFromCounts[this.memory.sourceRoomName] = global.roomAssaultFromCounts[this.memory.sourceRoomName] || {};
			global.roomAssaultFromCounts[this.memory.sourceRoomName].assaultCount = (global.roomAssaultFromCounts[this.memory.sourceRoomName].assaultCount || 0) + count;

			if (this.memory.boosted) {
				global.boostedRoomAssaultFromCounts[this.memory.sourceRoomName] = global.boostedRoomAssaultFromCounts[this.memory.sourceRoomName] || {};
				global.boostedRoomAssaultFromCounts[this.memory.sourceRoomName].assaultCount = (global.boostedRoomAssaultFromCounts[this.memory.sourceRoomName].assaultCount || 0) + count;

				global.totalBoostedAssaultCount = global.totalBoostedAssaultCount + count;
				if (Memory.rooms[targetRoomName].invCL == 5 || 
					(!Memory.rooms[targetRoomName].invCL && this.memory.planWaves > 1)) {
					global.currentBoostedAssault.push(Memory.rooms[targetRoomName].owner);
				}
			}
		}
	}

	shouldKeepFormation() {
		let mem = Memory.rooms[this.memory.targetRoomName]
		if (!mem) return 0
		if ((mem.spwnX && mem.spwnX.length == 0 &&
			 mem.twrX && mem.twrX.length == 0 &&
			 !mem.hostileBoostedCreeps && 
			 !mem.invCH &&
			 (!mem.trmX || !mem.killTerminal) &&
			 (!mem.storX || !mem.killStorage) &&
			 !mem.unexposedController) ||
			(!this.memory.target && Game.rooms[this.memory.targetRoomName])) {

			return 0;
		}
		else if (mem.DT < 0.0001) {
			return 0;
		}
		else {
			return 1;
		}
	}

	tick() {
		if (this.isActive()) {
			// Keep this up to date
			if (Math.random() < 0.01) {
				this.memory.routeLength = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.targetRoomName, true, true)
			}

			let tmem = Memory.rooms[this.memory.targetRoomName]

			if (this.memory.type != MISSION_FORMATION_REMOTE_DECON) {
				if (this.memory.type != MISSION_STRONGHOLD_ASSAULT && this.memory.type != MISSION_STRONGHOLD_MEGA_ASSAULT) { 
					if (Game.rooms[this.memory.targetRoomName] && !Game.rooms[this.memory.targetRoomName].controller.owner) {
						this.memory.s++;
						this.missionComplete(true);
						return;
					}
				}

				this.memory.keepFormation = this.shouldKeepFormation();
				if (!this.memory.keepFormation && this.memory.type == MISSION_ROOM_ASSAULT) {
					Memory.combatManager.requestedMissions[MISSION_WEAK_ROOM_ATTACK][this.memory.targetRoomName] = Game.time;
				}
			}

			// Setup room has been taken out
			// TODO: Write a way to change setup room mid assault rather than just fail hard.
			if (Memory.rooms[this.memory.bestSetupRoom] && Memory.rooms[this.memory.bestSetupRoom].owner && (Memory.rooms[this.memory.bestSetupRoom].invCL || (Memory.rooms[this.memory.bestSetupRoom].twrX && Memory.rooms[this.memory.bestSetupRoom].twrX.length))) {
				this.memory.f++;
				this.missionComplete(false);
				return;
			}

			if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].controller && (Game.rooms[this.memory.targetRoomName].controller.safeMode || 0) > 1500) {
				Memory.combatManager.assaultSafeModeTriggered = Memory.combatManager.assaultSafeModeTriggered || {};
				if (this.memory.boosted) {					
					Memory.combatManager.assaultSafeModeTriggered[Game.rooms[this.memory.targetRoomName].controller.owner.username] = Math.max(Memory.combatManager.assaultSafeModeTriggered[Game.rooms[this.memory.targetRoomName].controller.owner.username] || 0,
																																			   Game.time - SAFE_MODE_DURATION + Game.rooms[this.memory.targetRoomName].controller.safeMode);
				}

				// It's kinda a fizzle. 
				tmem.numAttacksFizzled = tmem.numAttacksFizzled || 0
				if (tmem.spwnX.length && tmem.twrX.length) {
					tmem.numAttacksFizzled += 0.5
				}
				else {
					tmem.numAttacksFizzled += 0.25	
				}

				this.memory.s++;
				this.missionComplete(true);

				// Prioritze coming back
				Memory.combatManager.requestedMissions[this.memory.type][this.memory.targetRoomName] = Game.time + Game.rooms[this.memory.targetRoomName].controller.safeMode;

				return;
			}

			for (let creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName] && Game.creeps[creepName].room.name == this.memory.targetRoomName) {
					this.memory.lastCreepsInRoom = Game.time;
					break;
				}
			}

			// Haven't seen the room in 3000 ticks, launched over 3000 ticks ago. Something has gone wrong. Maybe a portal disappearing.
			if ((Game.time - tmem.lo > 3000 || (Game.time - this.memory.lastCreepsInRoom || 0) > 3000) && Game.time - this.memory.startTick > 3000) {
				this.memory.f++;
				this.missionComplete(false);
				return;
			}

			let creepsInRoom = 0;


			// Everybody, meet everybody else.
			for (var formationIdx in this.memory.formations) {
				let formation = this.memory.formations[formationIdx]
				if (!formation.length) continue;

				let fullFormation = true;
				let currentlySpawning = false;
				for (var creepName of formation) {
					var creep = Game.creeps[creepName];
					if (!creep) {
						fullFormation = false;
						break;
					}
					if (creep.spawning) {
						let structs = creep.pos.lookFor(LOOK_STRUCTURES);
						for (let struct of structs) {
							if (struct.structureType == STRUCTURE_SPAWN) {
								if (struct.spawning && struct.spawning.remainingTime > 10 && this.memory.assignedCreeps.includes(struct.spawning.name)) {
									fullFormation = false;
									currentlySpawning = true;
									break;
								}
							}
						}
					}

					if (creep.mem.withdrawn) {
						// This doesn't work great. Withdrawing isn't neccessarily bad.
						// Got to figure out what I want to do instead. I think we just remove this.
						if (!this.memory.withdrawnEscalated) {
							this.memory.withdrawnEscalated = 1;
							// this.memory.withdrawne = (this.memory.withdrawne || 0) + 1;
						}
						delete creep.mem.withdrawn
					}

					// They shouldn't need to be reminded every tick, but this is easier
					// Really, I'm not sure it needs to be in creep memory... but it is
					creep.mem.setupPos = this.memory.setupPositions[formationIdx] || this.memory.setupPos;

					if (!creep.mem.nibbler) {
						creep.mem.target = this.memory.targets[formationIdx] || this.memory.target;
					}

					if (creep.room.name == this.memory.targetRoomName || creep.room.name == (this.memory.setupPositions[formationIdx] || this.memory.setupPos).roomName) {
						creepsInRoom++;
					}

					// Sometimes memory corruption can cause this.
					if (Memory.ticksSinceThisSignWasLastReset < 1500 && Math.random() < 0.1 && creep.mem.formationCreeps) {						
						for (let creepName2 of creep.mem.formationCreeps) { 
							let creep2 = Game.creeps[creepName2]
							if (!creep2) continue
							if (!this.memory.assignedCreeps.includes(creepName2)) {
								this.memory.assignedCreeps.push(creepName2)
							}
						}
					}

					creep.mem.allSquadCreeps = [];
					for (let creepName2 of this.memory.assignedCreeps) {
						let creep2 = Game.creeps[creepName2]
						if (creep2 && creep2.mem.formationId == formationIdx) {
							creep.mem.allSquadCreeps.push(creepName2)
						}							
					}


					if (creep.mem.formationCreeps &&
						creep.mem.formationCreeps.length == this.memory.squadSize) {

						let cont = true;
						for (let i = 0; i < this.memory.squadSize; i++) {
							if (!creep.mem.formationCreeps[i]) {
								cont = false;
								break;
							}
						}

						if (cont) {
							continue;
						}
					}


					for (var creepName2 of formation) {
						if (Game.creeps[creepName2]) {
							creep.mem.formationCreeps = creep.mem.formationCreeps || [];
							creep.mem.formationCreeps[Game.creeps[creepName2].mem.formationPosition] = creepName2;
						}
					}
				}

				if (fullFormation) {
					this.memory.pending = 0;
					for (var creepName of this.memory.assignedCreeps) {
						var creep = Game.creeps[creepName];
						if (creep && creep.mem.formationId !== undefined && creep.mem.formationId == formationIdx) {
							creep.mem.retreat = 0;
						}
					}

					for (var creepName of formation) {
						var creep = Game.creeps[creepName];
						creep.mem.retreat = 0;
						creep.renew = false;
					}
				}
				else {
					let creepCount = 0;
					for (var creepName of formation) {
						var creep = Game.creeps[creepName];
						if (creep) {
							creepCount++;
						}
						if (creep && creep.room.name == creep.mem.sR && (this.memory.spawningCreeps.length || currentlySpawning)) {
							if (!creep.hasBoost()) {
								creep.renew = true;
							}
							creep.mem.retreat = 1;
						}
					}

					// 10 formations ago, no creeps. They're dead jim. Not sure I want to pop the data off
					// but we can zero it out to save some memory.
					if (creepCount == 0 && formationIdx < this.memory.formations.length - 10) {
						this.memory.formations[formationIdx] = [];
						this.memory.setupPositions[formationIdx] = {};
						this.memory.targets[formationIdx] = {};
					}
				}
			}


			// Slowly amp up the bravery if nonone is dying gets corrected down when someone dies
			// and we're not flat against the walls
			if (creepsInRoom && Game.rooms[this.memory.targetRoomName]) {
				if (Game.rooms[this.memory.targetRoomName].dangerous) {					
					let timeWithoutDeath = Game.time - Math.max(this.memory.startTick, (tmem.lastFormationKilled || 0))

					if (timeWithoutDeath > 500 && ((tmem.notOnWall || 0) > 0.5 || tmem.formationBravery < 0)) {
						// 4 squads in room (across different missions will lead to +1 bravery in 1000 ticks)
						tmem.formationBravery = (tmem.formationBravery || 0) + 2.5e-4 * creepsInRoom / 4;
					}
				}
				else if (tmem.formationBravery < 0) {
					tmem.formationBravery = (tmem.formationBravery || 0) + 2.5e-4 * creepsInRoom / 4;
				}
			}


			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep && creep.mem.formationPosition === undefined && creep.mem.formationId !== undefined) {
					creep.mem.parentFormationCreeps = this.memory.formations[creep.mem.formationId]

					let shouldRenew = 0;

					if (creep.room.name == creep.mem.sR) {
						for (let parentFormationCreepName of creep.mem.parentFormationCreeps) {
							let parentFormationCreep = Game.creeps[parentFormationCreepName];
							if (!parentFormationCreep || parentFormationCreep.spawning) {
								shouldRenew = 1;
								break;
							}
						}
					}

					if (shouldRenew && !creep.hasBoost()) {
						creep.renew = 1;
					}
					else {
						for (let parentFormationCreepName of creep.mem.parentFormationCreeps) {
							let parentFormationCreep = Game.creeps[parentFormationCreepName];
							if (parentFormationCreep) {								
								parentFormationCreep.mem.moons = parentFormationCreep.mem.moons || [];
								if (!parentFormationCreep.mem.moons.includes(creep.name)) {
									parentFormationCreep.mem.moons.push(creep.name)
								}
							}
						}
					}

					if (this.memory.keepFormation) {
						creep.moon = 1
					}
				}
			}

			if (!this.memory.pending) {
				if (this.memory.numLaunches > 1) {
					if (!Game.rooms[this.memory.targetRoomName]) {
						this.memory.preSpawnOffset++;
					}
					else if (creepsInRoom > this.memory.squadSize) {
						this.memory.preSpawnOffset--;
					}

					this.memory.preSpawnOffset = Math.min(this.memory.preSpawnOffset, 200);
					this.memory.preSpawnOffset = Math.max(this.memory.preSpawnOffset, -200);
				}

				// I'd hoped that formations wouldn't need telling which direction they were facing
				// I think they often don't. There's something that breaks. We can just
				// tell them which direction their facing. formationPosition is where they are when
				// facing bottom, and their location in formationCreeps is where they are now.
				if (this.memory.directional) {
					for (var formation of this.memory.formations) {
						for (var creepName of formation) {
							var creep = Game.creeps[creepName];
							if (!creep) break;

							if (creep.mem.formationCreeps && creep.mem.formationCreeps.length == this.memory.squadSize) {
								let zeroCreep = Game.creeps[creep.mem.formationCreeps[0]];
								if (zeroCreep) {
									// These are formation positions from the BOTTOM
									// So if we're facing RIGHT creep 1 is in the top left slot
									if (zeroCreep.mem.formationPosition == 0) {
										creep.mem.formationOrientation = BOTTOM;
									}
									else if (zeroCreep.mem.formationPosition == 1) {
										creep.mem.formationOrientation = RIGHT;
									}
									else if (zeroCreep.mem.formationPosition == 2) {
										creep.mem.formationOrientation = LEFT;
									}
									else if (zeroCreep.mem.formationPosition == 3) {
										creep.mem.formationOrientation = TOP;
									}
									else {
										console.log("Attempting invalid rotation", zeroCreep.mem.formationPosition)
									}
								}
							}

						}
					}
				}
			}

			if (!this.memory.pending && this.memory.keepFormation) {
				// TODO: Delete this in the dim distant future once all the grandfather missions have it
				this.memory.setupPositions = this.memory.setupPositions || [];

				let anyInTargetRoom = 0;
				let numInSetupRoom = 0
				let numAliveTotal = 0

				for (var formationIdx in this.memory.formations) {
					let formation = this.memory.formations[formationIdx];
					if (!formation.length) continue;

					let setupPos = this.memory.setupPositions[formationIdx] || JSON.parse(JSON.stringify(this.memory.setupPos));
					let areSetup = true;
					let recycling = false;
					let creepsCloseToTargetRoom = true;
					let numCreepsAlive = 0;
					let numCreepsSpawning = 0;
					for (var creepName of formation) {
						var creep = Game.creeps[creepName];
						if (creep) {
							if (creep.mem.role == "recycler") {
								recycling = true
							}
							numCreepsAlive++
							numAliveTotal++
							if (creep.room.name != this.memory.targetRoomName && creep.room.name != setupPos.roomName) {
								creepsCloseToTargetRoom = false;
							}
							if (creep.room.name == setupPos.roomName) {
								numInSetupRoom++
							}
						}
						else if (this.memory.spawningCreeps.includes(creepName)) {
							numCreepsSpawning++;
						}
					}

					if (numCreepsAlive + numCreepsSpawning == this.memory.squadSize && !recycling) {
						let setupRoomCount = 0;
						let targetRoomCount = 0;

						let otherRoom;

						if (setupPos) {
							for (var creepName of formation) {
								var creep = Game.creeps[creepName];

								if (!creep || !creep.mem.formationCreeps) {
									areSetup = false;
									// console.log("Weird thing going on - creep in formation that doesn't live, but we have", numCreepsAlive, "alive. Hmmh", creepName)
									continue;
								}

								creep.assaulter = 1;
								creep.mem.setupPos = setupPos;
								creep.mem.usingInternalSetup = (setupPos && setupPos.roomName === this.memory.targetRoomName) ? 1 : 0

								if (this.memory.maxPowerCreepDisruptTowerLevel) {
									creep.mem.expectingPowerSupport = 1
								}

								if (this.memory.type == MISSION_ROOM_LOW_ENERGY_ASSAULT || this.memory.type == MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE) {
									creep.lowEAssault = 1;
								}

								if (creep.room.name == this.memory.targetRoomName) {
									targetRoomCount++;
								}
								else if (!otherRoom) {
									setupRoomCount++;
									otherRoom = creep.room.name;
								}
								else if (creep.room.name == otherRoom) {
									setupRoomCount++;
								}
								// More than two rooms
								else {
									areSetup = false;
									continue
								}

								// Ug. Sometimes they accidently get setup... if they're further than 2 rooms away they can't be set up!
								// This doesn't catch all problems, but catches a bunch.
								if (Game.map.getRoomLinearDistance(creep.room.name, this.memory.targetRoomName) > 1) {
									areSetup = false;
									continue
								}

								if (!creep.mem.haveEverBeenSetup && creep.room.name != this.memory.targetRoomName && creep.room.name != setupPos.roomName) {
									areSetup = false;
									continue
								}


								var leadCreep = Game.creeps[creep.mem.formationCreeps[0]];

								if (leadCreep) {
									// if (Game.map.getRoomLinearDistance(creep.room.name, this.memory.targetRoomName) > 1) {
									// 	areSetup = false;
									// 	continue
									// }

									// Make sure we're in one of the two correct rooms
									if (creep.room.name != this.memory.targetRoomName && (!otherRoom || creep.room.name != otherRoom)) {
										areSetup = false;
										continue
										// console.log("a", creepName, leadCreep, areSetup, leadCreep.pos, creep.pos)
									}

									for (let i = 0; i < this.memory.mask.length; i++) {
										if (creepName == creep.mem.formationCreeps[i]) {
											if ((creep.pos.x - leadCreep.pos.x + 49) % 49 != this.memory.mask[i][0] || (creep.pos.y - leadCreep.pos.y + 49) % 49 != this.memory.mask[i][1]) {
												areSetup = false;
												break;
											}
										}
									}
									// console.log(creepName, leadCreep, areSetup, leadCreep.pos, creep.pos)

									// creep.setupFormation = true; //!areSetup;
									// creep.setupFormation = !areSetup;
								}
							}
						}

						anyInTargetRoom = anyInTargetRoom || targetRoomCount

						if (areSetup && 
							((this.memory.squadSize == 4 && (setupRoomCount % 2 == 1 || targetRoomCount % 2 == 1)) ||
							(this.memory.squadSize == 9 && (setupRoomCount % 3 != 0 || targetRoomCount % 3 != 0)) ||
							!setupPos)) {
							areSetup = false;
						}

						// Not sure I need this. They should hit moveToInternal below...
						for (var creepName of formation) {
							var creep = Game.creeps[creepName];
							if (creep) {
								if (creep.mem.usingInternalSetup && (creep.mem.splitRoomsCounter || 0) > 75) {
									areSetup = false;
									// creep.mem.arrivedAtSetup = 0;
								}
							}
						}

						for (var creepName of formation) {
							var creep = Game.creeps[creepName];
							if (creep) {
								creep.setupFormation = !areSetup;
								// Update so they don't retreat so far if they become solo creeps.
								if (areSetup) {
									creep.mem.fallbackRoom = (this.memory.setupPositions[formationIdx] || this.memory.setupPos).roomName;
									creep.mem.haveEverBeenSetup = true
								}
							}
						}

						if (numCreepsAlive == this.memory.squadSize) {
							let forceExternalSetup = false;
							let setupFailing = 0
							if (areSetup) {
								for (var creepName of formation) {
									var creep = Game.creeps[creepName];
									if (creep.mem.forceExternalSetup) {
										forceExternalSetup = true;
									}
								}
							}
							else {
								for (var creepName of formation) {
									var creep = Game.creeps[creepName];
									if (!creep) continue
									setupFailing += (creep.mem.setupFormation || 0)
								}
								setupFailing /= formation.length
							}

							if (setupFailing > 60) {
								for (var creepName of formation) {
									var creep = Game.creeps[creepName];
									if (!creep) continue
									if (creep.room.find(FIND_MY_CREEPS).length > 4) {
										creep.mem.setupFailTick = Game.time
									}
								}
							}



							if (targetRoomCount && Game.rooms[this.memory.targetRoomName]) {
								if (Game.rooms[this.memory.targetRoomName].undamagingFormation === undefined) {
									Game.rooms[this.memory.targetRoomName].undamagingFormation = 0
								}

								if (!Game.rooms[this.memory.targetRoomName].undamagingFormation) {
									let damaging = 0

									for (var creepName of formation) {
										var creep = Game.creeps[creepName];
										if (creep && creep.room.name == this.memory.targetRoomName) {
											if (creep.pos.findFirstInRange(FIND_STRUCTURES, 3)) {
												damaging = 1
												break
											}
										}
									}

									// Formation is in the room and can't hurt anything
									if (!damaging) {
										// console.log(formation, "not doing damage")
										Game.rooms[this.memory.targetRoomName].undamagingFormation = 1
									}
								}
							}

							// forceExternalSetup = 1;

							let internalSetupPos;
							let triedInternalSetup = false;
							if (anyInTargetRoom && areSetup && Math.random() > 0.96 && !forceExternalSetup) {
								triedInternalSetup = true;
								let tryInternalSetupPos = true;
								for (var creepName of formation) {
						 			var creep = Game.creeps[creepName];
						 			if ((creep.room.name != this.memory.targetRoomName || creep.hits != creep.hitsMax) || (creep.mem.usingInternalSetup && Math.random() > 0.25)) {
						 				tryInternalSetupPos = false;
						 				break;
						 			}
						 		}
						 		if (tryInternalSetupPos) {
									let leadCreep = Game.creeps[creep.mem.formationCreeps[0]];
									if (leadCreep) {
										internalSetupPos = this.getInternalSetupPos(creep.mem.formationCreeps, leadCreep.pos, this.memory.targets[formationIdx] || this.memory.target, (leadCreep.mem.splitRoomsCounter || 0) > 50);
									}
								}
							}

							// Reset the setup location from time to time. Otherwise we can get blocked
							if ((!areSetup && (Math.random() > 0.98 /*|| setupFailing > 100*/)) || internalSetupPos || (forceExternalSetup && anyInTargetRoom) || !this.memory.setupPositions[formationIdx]) {
								if (!internalSetupPos && !triedInternalSetup && !forceExternalSetup && creepsCloseToTargetRoom) {
									let tryInternalSetupPos = true;
									for (var creepName of formation) {
						 				var creep = Game.creeps[creepName];
						 				if ((creep.room.name != this.memory.targetRoomName || creep.hits != creep.hitsMax) || (creep.mem.usingInternalSetup && Math.random() > 0.25)) {
						 					tryInternalSetupPos = false;
						 					break;
						 				}
						 			}
						 			if (tryInternalSetupPos) {
										let leadCreep = Game.creeps[creep.mem.formationCreeps[0]];
										if (leadCreep) {
											internalSetupPos = this.getInternalSetupPos(creep.mem.formationCreeps, leadCreep.pos, this.memory.targets[formationIdx] || this.memory.target, (leadCreep.mem.splitRoomsCounter || 0) > 50);
										}
						 			}
								}

								setupPos = internalSetupPos;
								if (!setupPos) {
									let setupExitDir = ((this.memory.bestExitDir - 1 + 4)) % 8 + 1;
									setupPos = this.getSetupPos(setupExitDir, this.memory.targets[formationIdx] || this.memory.target, this.memory.bestSetupRoom, setupFailing > 100);
								}

								if (setupPos) {									
									this.memory.setupPositions[formationIdx] = setupPos;

									let moveToInternal;

									for (var creepName of formation) {
										let creep = Game.creeps[creepName];
										if (!creep) continue;
										creep.mem.setupPos = setupPos;
										creep.mem.usingInternalSetup = internalSetupPos ? 1 : 0

										// if (internalSetupPos && internalSetupPos.roomName != this.memory.targetRoomName) {
										// 	console.log("------------ WTF - internalSetupPos outside of target room", JSON.stringify(internalSetupPos), this.memory.targetRoomName)
										// }
										// if (internalSetupPos && internalSetupPos != setupPos) {
										// 	console.log("------------ WTF - internalSetupPos not equal setupPos", JSON.stringify(internalSetupPos), JSON.stringify(setupPos))
										// }

										if (util.isEdgeOfRoom(creep.pos) && creep.hits == creep.hitsMax) {
											moveToInternal = true;
										}
									}

									if (internalSetupPos && moveToInternal) {
										for (var creepName of formation) {
											let creep = Game.creeps[creepName];
											if (!creep) continue;
											creep.setupFormation = 1;
											// By setting this to zero it'll attempt to snake which can be troublesome.
											// creep.mem.arrivedAtSetup = 0;
										}
									}
								}

							}
						}
					}
					// Ok, some casualties, fall back to combat snake
					else if (numCreepsSpawning == 0) {
						let targetRoomCount = 0;

						for (var creepName of formation) {
							var creep = Game.creeps[creepName];
							if (creep && creep.room.name == this.memory.targetRoomName) {
								targetRoomCount++
							}
						}

						let anyAtSetup = false;

						// Catches internal setup
						for (var creepName of formation) {
							var creep = Game.creeps[creepName];
							if (creep && (creep.pos.x == creep.mem.setupPos.x && creep.pos.y == creep.mem.setupPos.y && creep.pos.roomName == creep.mem.setupPos.roomName)) {
								anyAtSetup = true;
							}
						}

						if (!targetRoomCount || anyAtSetup) {
							for (var creepName of formation) {
								var creep = Game.creeps[creepName];
								if (creep) {
									creep.mem.role = "recycler"
								}
							}

						}
						else {							
							let maxTTL = 0;
							let markedDeath = 0;
							for (var creepName of formation) {
								var creep = Game.creeps[creepName];
								if (creep) {
									maxTTL = Math.max(creep.ticksToLive, maxTTL)
									markedDeath = markedDeath || creep.mem.markedDeath
								}
							}

							if (targetRoomCount && maxTTL > CREEP_LIFE_TIME / 5 && !recycling) {
								if (!markedDeath) {
									// if (global.roomAssaultCounts[this.memory.targetRoomName].activeFormations) {
									// 	tmem.formationBravery -= 10 / global.roomAssaultCounts[this.memory.targetRoomName].activeFormations;
									// }
									// else {
										tmem.formationBravery -= 2.5 * maxTTL / CREEP_LIFE_TIME;
									// }
									tmem.lastFormationKilled = Math.max(tmem.lastFormationKilled || 0, Game.time);
									// Used to determine if we want to ditch close combat due to not enough heals
									// If we were being super-brave, then maybe don't ditch
									if (tmem.formationBravery < 0) {
										tmem.lastFormationKilledCC = Math.max(tmem.lastFormationKilledCC || 0, Game.time);
									}

									// tmem.lastFormationKilled = Math.max(tmem.lastFormationKilled || 0, Game.time);
									for (var creepName of formation) {
										let creep = Game.creeps[creepName];
										if (creep) {
											creep.mem.markedDeath = 1;
											tmem.deathLocs = tmem.deathLocs || [];
											tmem.deathLocs.push({x: creep.pos.x, y: creep.pos.y, t: Game.time})

											// We died and there are unrampred hostile creeps near me
											if (!tmem.hostilesPushOut) {
												for (let enemyCreep of creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK])) {
													if (!creep.pos.inRangeTo(enemyCreep, 1)) {
														continue
													}
													if (enemyCreep.pos.findFirstInRange(creep.room.ramparts, 0)) {
														tmem.hostilesPushOut = Game.time
													}
												}
											}
										}
									}

								}
							}

							for (var creepName of formation) {
								var creep = Game.creeps[creepName];
								if (creep) {
									creep.assaulter = 1;
									creep.assaultSnake = 1;
									if (maxTTL > CREEP_LIFE_TIME / 3) {
										creep.setupFormation = 1
									}
								}
							}
						}
					}
				}

				if (this.memory.boosted && numInSetupRoom > 4 && numAliveTotal > 12) {
					roomHeavyCreepHold.requestHeavyCreepHold(this.memory.bestSetupRoom, 1)
				}
				if (Game.rooms[this.memory.bestSetupRoom] && this.memory.bestSetupRoom.dangerous) {
					roomHeavyCreepHold.requestHeavyCreepHold(this.memory.bestSetupRoom, Game.rooms[this.memory.bestSetupRoom].mem.hostileBoostedCreeps ? 1 : 0)
				}

				if (anyInTargetRoom) {
					defenseAnalysis.run(Game.rooms[this.memory.targetRoomName])
				}
				else if (!Game.rooms[this.memory.targetRoomName]) {
					delete tmem.meanActiveTowers;
				}
			}


			if (Math.random() < 0.1 && tmem.withdrawLocs) {
				for (let withdrawLoc of _.clone(tmem.withdrawLocs)) {
					if (Game.time - withdrawLoc.t > 300) {
						_.pull(tmem.withdrawLocs, withdrawLoc)
					}
				}
			}
			if (Math.random() < 0.1 && tmem.deathLocs) {
				for (let deathLoc of _.clone(tmem.deathLocs)) {
					if (Game.time - deathLoc.t > 1500) {
						_.pull(tmem.deathLocs, deathLoc)
					}
				}
			}
		}

		super.tick();
	}


	getActualAssaultSpawnPlan(closeCombat, minHealPerTowerMod, maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, expensiveBoosts, restrictBoosts, refresh) {
		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		let targetRoomName = this.memory.targetRoomName;
		let mem = Memory.rooms[this.memory.targetRoomName]

		let numWaves = Math.max(1, refresh ? (0.75 + 0.5 * Math.random()) : 2);

		if (Memory.formationForceAttack === targetRoomName) {
			numWaves = 1
		}

		let supporting = false;

		let allowControllerRaid = !mem.invCL && (this.memory.routeLength || Infinity) * 50 < CREEP_CLAIM_LIFE_TIME * 0.9 && mem.rcl >= 7;

		if (this.memory.maxPowerCreepDisruptTowerLevel) {
			restrictBoosts = false
		}

		if (Memory.debugAssaultSpawning) {
			console.log(closeCombat, minHealPerTowerMod, maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, expensiveBoosts, restrictBoosts, refresh)
		}

		// Supporting attack.
		// if (numWaves > 1) {
		// 	global.roomAssaultCounts[targetRoomName] = global.roomAssaultCounts[targetRoomName] || {};

		// 	if ((!Game.rooms[targetRoomName] || Game.rooms[targetRoomName].dangerous || Game.rooms[targetRoomName].towers.length) &&
		// 		missionInfo.canLaunchNewAssault(targetRoomName, this.memory.bestSetupRoom)) {
		// 		numWaves = 1.25 + 0.5 * Math.random();
		// 		supporting = true
		// 	}
		// }

		let cpuStart = Game.cpu.getUsed();

		let plan

		let threshold = Memory.botArena ? 1 : 2;

		// High priority, do boosts earlier
		threshold += (this.memory.p || 0) / 10

		let drain = this.memory.type == MISSION_ROOM_LOW_ENERGY_ASSAULT || this.memory.type == MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE;

		let notFailedYet = Game.time - this.memory.startTick < 10000 && ((mem.numAttacksFizzled || 0) < threshold && (mem.numAttacksFailed || 0) < threshold && intelAI.strugglingToKillRooms(mem.owner) < 5 * threshold)

		// Possible intershard trading
		if (Game.shard.name == "shard2") {
			var sectorPos = util.getSectorCoords(this.memory.targetRoomName);

			if ((sectorPos.x == 1 || sectorPos.x == 9) && (sectorPos.y == 1 || sectorPos.y == 9)) {
				notFailedYet = false;
			}
		}


		// First wave sees full modded damage. Further waves see less as hopefully we'll have our own PCs. 
		// TODO: Actually check to see if we have our own PCs...
		let powerMod = 1;
		if (mem.opTowerLevel !== undefined) {
			powerMod = POWER_INFO[PWR_OPERATE_TOWER].effect[mem.opTowerLevel - 1]
		}

		if (this.memory.maxPowerCreepDisruptTowerLevel) {
			let diff = (POWER_INFO[PWR_DISRUPT_TOWER].effect[this.memory.maxPowerCreepDisruptTowerLevel - 1] - 1)
			// Well, don't assume I'll have it 100%, but assume it works at 75% strength is ok I guess
			powerMod *= 1 + diff * 0.6
		}
		else if (this.memory.expectedMaxPowerCreepDisruptTowerLevel) {
			let diff = (POWER_INFO[PWR_DISRUPT_TOWER].effect[this.memory.expectedMaxPowerCreepDisruptTowerLevel - 1] - 1)
			// Don't even know I'm going to have it
			powerMod *= 1 + diff * 0.3
		}

		if (this.memory.type == MISSION_ROOM_HEAVY_FORMATION_HOLD) {
			numWaves = 1
		}



		// Always try cheap-ass first.
		if ((restrictBoosts || notFailedYet) && this.memory.type != MISSION_ROOM_HEAVY_FORMATION_HOLD) {
			let minHealPerTower = this.getMinHealPerTowerNeeded(true) * minHealPerTowerMod

			plan = formationCreator.getFormationAssaultSpawnPlan(parentRoom,
												targetRoomName,
												this.memory.bestSetupRoom,
												this.memory.e,
												closeCombat,
												minHealPerTower,
												maxHealPerTower,
												maxAccountedForEnemyAttack,
												maxAccountedForEnemyRanged,
												false,
												true,
												this.memory.squadSize,
												this.memory.cornerNibble,
												false,
												numWaves,
												!refresh,
												supporting,
												drain,
												allowControllerRaid,
												powerMod,
												this.memory.minHeal,
												this.memory.type === MISSION_ROOM_HEAVY_FORMATION_HOLD);
		}

		// Nope, seems we need boosts. Try that if it's allowed.
		if (!plan && !restrictBoosts) {
			

			// Used to determine wall height vs wave count. Lower factor => more needed

			// Reasons:
			// Botarena rooms tend to be a bit better defended and we have fewer boosts to burn
			// If we're not failed yet be more optimistic
			// If we're not max RCL RCL, be patient
			// Strongholds cores are less important on botarena
			// If we have an RCL advantage we can get more shit done
			let factor = 0.5e6 * (Memory.botArena ? 0.75 : 1) * (notFailedYet ? 2 : 1) * (parentRoom.effectiveLevel < 8 ? 0.5 : 1) * (mem.invCL && !Memory.botArena ? 1 : 0.5) * (mem.invCL ? 1 : (1 + (parentRoom.effectiveLevel - mem.rcl) / 4));

			// I hate repair creeps
			if (mem.invCL == 4 && mem.creepFortifier) {
				factor *= .25
			}

			if (Memory.privateServer && !mem.invCL) {
				let energyPerRoom
		 		// Less than 30k energy/room? Push a bit...
		 		// If they literally have no energy we go 7x harder.
				if (mem.trmX) {
					let energyEstimate = intelAI.getEnergyEstimate(mem.owner)
					let numRooms = intelAI.getPlayerNumRooms(mem.owner) || 1
	 
					energyPerRoom = energyEstimate / numRooms
				}
				else {
					energyPerRoom = (mem.storE || 0)
				}
				if (energyPerRoom < 30000) {
					// factor *= (1 + (30000 - energyPerRoom) / 5000)
					// 1 = 30k enegy, 0 = 0 energy
					let normalized = (30000 - energyPerRoom) / 30000
					factor *= (1 + normalized * normalized * 6)
				}
			}

			if (this.memory.routeLength) {
				factor *= (CREEP_LIFE_TIME - this.memory.routeLength * 50) / CREEP_LIFE_TIME
			}


			if (Memory.swc && global.whiteList.length) {
				factor *= 2;
			}

			if (mem.storageOnExternalRampart) {
				factor *= 1.25
			}
			if (mem.terminalOnExternalRampart) {
				factor *= 1.25;
			}
			if (mem.twrExtern) {				
				for (let i = 0; i < mem.twrExtern.length; i++) {
					if (mem.twrExtern[i]) {
						factor *= 1.02;
					}
					if (!mem.twrInside[i]) {
						factor *= 1.02;
					}
				}
			}
			if (mem.spwnExtern) {				
				for (let i = 0; i < mem.spwnExtern.length; i++) {
					if (mem.spwnExtern[i]) {
						factor *= 1.04;
					}
					if (mem.spwnInside[i]) {
						factor *= 1.04;
					}
				}
			}

			/*if (Memory.swc) {
				if (Math.random() < 0.001) console.log("Banzai mode in combatManager for swc")
				factor *= 4;
			}*/

			let wallMod = closeCombat ? 0.9 : 1.1
			let rampartMod = closeCombat ? 1.1 : 0.9



			// Defenses are often deep. This gives me a rough approximation of that depth
			let depth;
			if (mem.boundaryWallCount) {
				depth = Math.floor(((mem.numWalls || 0) + (mem.numRamps || 0)) / mem.boundaryWallCount)
			}
			else {
				depth = 1
			}
			// factor /= depth;

			let edgeIdx = Math.round((this.memory.bestExitDir - 1) / 2)

			let wallHeuristic
			if ((mem.numWalls || 0) + (mem.numRamps || 0) > 0 && mem.lowestOuterWallByEdge[edgeIdx]) {
				wallHeuristic = (mem.lowestOuterWallByEdge[edgeIdx] + (depth - 1) * (mem.wallHP * wallMod + mem.rampHP * rampartMod) / (mem.numWalls + mem.numRamps))
			}
			else {
				wallHeuristic = 0;
			}

			let minHealPerTower = this.getMinHealPerTowerNeeded(false) * minHealPerTowerMod

			// If heal per tower is saying we don't need much healing, we'll be doing more damage.
			let hptMod = 0.5 * (minHealPerTower / ROOM_ASSAULT_MIN_HEAL_PER_TOWER_BOOSTED + maxHealPerTower / ROOM_ASSAULT_MAX_HEAL_PER_TOWER) / minHealPerTowerMod

			// if (targetRoomName == "E12S38") console.log("waves", targetRoomName, numWaves, wallHeuristic, factor)

			// This is fairly arbirtrary
			// if (wallHeuristic > factor) {
				numWaves *= wallHeuristic * hptMod / factor
			// }

			// if (Memory.season1) {
			// 	if (intelAI.getGCLUpperBound(mem.owner) < Game.gcl.level / 2) {
			// 		numWaves *= 0.5
			// 	}
			// }


			if (Memory.debugAssaultSpawning) {
				if (targetRoomName == "E8S11") console.log(numWaves, wallHeuristic, hptMod, factor)
			}

			// Ok... repairs. I hate repairs.
			// The main problem in all of this is that I don't know how much damage I'm going to do!
			// So all this really says is "it sucks if they repair"
			// numWaves *= 1 + (mem.repairPerTick || 0) / 1000


			// We have something that restricts boosts if we have many ongoing assaults
			// But if they're all to the same place this isn't actually a problem
			// I'm not 100% happy with the reasoning here. I think if it's the same boost level surely I should go for numWaves = 0
			// as by doubling creep count I should halve kill time. Or maybe better?
			// But if it's not the same boost level... maybe I shouldn't?
			// Should supporting attacks basically ignore boost count and just wham it in?
			// But then I need to know which is the "main" and which is supporting.
			// The safe solution is to do nothing.
			// The next "safe" solution is this
			let numOtherAssaults = (global.roomAssaultCounts[targetRoomName].boostedCount || 1) - (this.memory.currentAssaultCount || 1)
			numWaves /= Math.max(1, 1 + numOtherAssaults);

			if (Memory.debugAssaultSpawning) {
				if (targetRoomName == "E8S11") console.log(numWaves)
			}

			// The (potentially) unsafe solution is to do this
			// This would end up using high tier boosts and maybe running out super-quick
			// But maybe it'd whack down the room fast?
			// I think my main concern is that it'd require a lot of lab swapping as we drop tiers. 

			// Are we the first
			let firstMission = 1
			for (let type of ASSAULT_MISSION_TYPES) {
				for (let mission of Memory.combatManager.currentMissions[type]) {
					if (!mission.ID) continue
					if (!mission.boosted) continue
					if (mission.targetRoomName != this.memory.targetRoomName) continue

					// It's possible two missions launch on the same tick. If that's the case
					// neither will believe they are first. That's fine. It's rare and we'll
					// just have to be suboptimal.
					if (mission.startTick <= this.memory.startTick && mission.ID != this.memory.ID) {
						firstMission = 0;
					}
				}

				if (!firstMission) {
					break
				}
			}

			// We're a supporting mission and there's loads of space to attack into. Cut waves heavily. Worst case we'll just end up
			// using the same boost type as the main mission, but hopefully we can burn off some higher tiers and get things chucking along
			// even if those higher tiers run out
			if (numOtherAssaults && !firstMission && missionInfo.canLaunchNewAssault(this.memory.targetRoomName, this.memory.bestSetupRoom, 2)) {
				numWaves = 1
			}

			let tryingLowControllerPush = this.memory.tryingLowControllerPush || 0
			if (tryingLowControllerPush || 
				(this.memory.type == MISSION_ROOM_ASSAULT && !mem.triedLowControllerPush && mem.rcl == 8 &&
				 (mem.controllerNearlyExposedToEdge[Math.round((parseInt(this.memory.bestExitDir) - 1) / 2)] || mem.controllerExposedToEdge[Math.round((parseInt(this.memory.bestExitDir) - 1) / 2)]) &&
				 mem.cttd < CONTROLLER_DOWNGRADE[mem.rcl] / 2 - CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD)) {
				let testNumWaves = mem.cttd / (CREEP_LIFE_TIME - 50 * (this.memory.routeLength || 0));
				if (testNumWaves < numWaves) {
					numWaves = testNumWaves
					tryingLowControllerPush = 1;
				}
			}


			// numWaves /= Math.pow(Math.max(1, 1 + (global.roomAssaultCounts[targetRoomName].assaultCount || 0)), 0.5);
			// numWaves /= Math.pow(Math.max(1, (global.roomAssaultCounts[targetRoomName].assaultCount || 1)), 0.25);

			let intWaves = Math.max(1, Math.ceil(numWaves))
			// let minHealPerTower = this.getMinHealPerTowerNeeded(false) * minHealPerTowerMod

			if (Memory.banzai) {
				intWaves = 1;
			}

			if (Memory.debugAssaultSpawning) {
				if (targetRoomName == "E8S11") console.log(numWaves)
			}

			if (this.memory.type == MISSION_ROOM_HEAVY_FORMATION_HOLD) {
				numWaves = 1
			}

			// Try cheap boosts (no tough)
			plan = formationCreator.getFormationAssaultSpawnPlan(parentRoom,
												this.memory.targetRoomName,
												this.memory.bestSetupRoom,
												this.memory.e,
												closeCombat,
												minHealPerTower,
												maxHealPerTower,
												maxAccountedForEnemyAttack,
												maxAccountedForEnemyRanged,
												false,
												restrictBoosts,
												this.memory.squadSize,
												this.memory.cornerNibble,
												false,
												intWaves,
												!refresh,
												supporting,
												drain,
												allowControllerRaid,
												powerMod,
												this.memory.minHeal,
												this.memory.type === MISSION_ROOM_HEAVY_FORMATION_HOLD);



			// Now expensive
			if (!plan) {
				plan = formationCreator.getFormationAssaultSpawnPlan(parentRoom,
													this.memory.targetRoomName,
													this.memory.bestSetupRoom,
													this.memory.e,
													closeCombat,
													minHealPerTower,
													maxHealPerTower,
													maxAccountedForEnemyAttack,
													maxAccountedForEnemyRanged,
													expensiveBoosts,
													restrictBoosts,
													this.memory.squadSize,
													this.memory.cornerNibble,
													false,
													intWaves,
													!refresh,
													supporting,
													drain,
													allowControllerRaid,
													powerMod,
													this.memory.minHeal,
													this.memory.type === MISSION_ROOM_HEAVY_FORMATION_HOLD);
			}

			if (plan && tryingLowControllerPush) {
				plan.tryingLowControllerPush = 1
			}


			if (!plan) {
				if (Memory.debugAssaultSpawning) {					
					console.log("-------------------------  No plan, num waves:", numWaves, "wallHeuristic", wallHeuristic, "depth", depth, "factor", factor, "hptmod", hptMod)
					console.log(parentRoom,
							    this.memory.targetRoomName,
							    this.memory.bestSetupRoom,
							    this.memory.e,
							    closeCombat,
							    minHealPerTower,
							    maxHealPerTower,
							    maxAccountedForEnemyAttack,
							    maxAccountedForEnemyRanged,
							    expensiveBoosts,
							    restrictBoosts,
							    this.memory.squadSize,
							    this.memory.cornerNibble,
							    false,
							    intWaves,
							    !refresh,
							    supporting,
							    drain,
							    allowControllerRaid,
							    powerMod,
							    tryingLowControllerPush)
				}
			}
		}




		if (plan) {
			// Don't downgrade boost level if we've failed in the past
			if (!refresh) {
				let maxFailedAt = Math.max((mem.failedAtBoostLevel || 0), (mem.fizzledAtBoostLevel || 0))

				let targetMinBoostLevel = Math.min(3, (maxFailedAt == 3 ? 0.9 : 1.00001) * maxFailedAt)
				if (targetMinBoostLevel) {
					let totalBoostScore = 0
					for (let idx in plan.bodies) {
						if (!plan.formation[idx]) continue
						let boosts = plan.boosts[idx];
						if (Object.keys(boosts).length > 0) {
							let boostScore = 0
							for (let boost in boosts) {
								boostScore += util.getBoostTier(boost) * boosts[boost];
							}
							boostScore /= MAX_CREEP_SIZE

							totalBoostScore += boostScore

							console.log("Assault boost level in getActualAssaultSpawnPlan", boostScore)
						}
					}

					totalBoostScore /= plan.bodies.length

					if (totalBoostScore && totalBoostScore < targetMinBoostLevel) {
						console.log(targetRoomName, "Plan boost level is too low", totalBoostScore, targetMinBoostLevel, JSON.stringify(plan))
						plan = undefined;
					}
				}
			}


			if (plan) {				
				global.roomAssaultCounts[targetRoomName] = global.roomAssaultCounts[targetRoomName] || {};
				// Damage check
				let targetDamage = 2 * (mem.repairPerTick || 0) / ((global.roomAssaultCounts[targetRoomName] || 0) + 1);

				// Skip check if using T3 boosts.
				let T3 = 0;

				let totalDamage = 0;
				for (let bodyIdx in plan.bodies) {
					let body = plan.bodies[bodyIdx];

					let boosts = plan.boosts[bodyIdx];
					let rangedBoost = 1;
					let attackBoost = 1;
					let dismantleBoost = 1;

					if 		(boosts[RESOURCE_KEANIUM_OXIDE]) 			  rangedBoost = 2;
					else if (boosts[RESOURCE_KEANIUM_ALKALIDE]) 		  rangedBoost = 3;
					else if (boosts[RESOURCE_CATALYZED_KEANIUM_ALKALIDE]) T3 = 1;

					if 		(boosts[RESOURCE_UTRIUM_HYDRIDE]) 		 attackBoost = 2;
					else if (boosts[RESOURCE_UTRIUM_ACID]) 			 attackBoost = 3;
					else if (boosts[RESOURCE_CATALYZED_UTRIUM_ACID]) T3 = 1;

					if 		(boosts[RESOURCE_ZYNTHIUM_HYDRIDE])		   dismantleBoost = 2;
					else if (boosts[RESOURCE_ZYNTHIUM_ACID]) 		   dismantleBoost = 3;
					else if (boosts[RESOURCE_CATALYZED_ZYNTHIUM_ACID]) T3 = 1;

					if (T3) break;

					for (let bodyPart of body) {
						if (bodyPart == RANGED_ATTACK) {
							// FFS. RMA? RA? Who the fuck knows.
							totalDamage += 3 * RANGED_ATTACK_POWER * rangedBoost;
						}
						else if (bodyPart == ATTACK) {
							totalDamage += ATTACK_POWER * attackBoost;
						}
						else if (bodyPart == WORK) {
							totalDamage += DISMANTLE_POWER * dismantleBoost;
						}
					}
				}

				// Give up. Can't out damage the repair.
				if (totalDamage < targetDamage && !T3) {
					console.log(targetRoomName, "Can't out damage repair", totalDamage, targetDamage, JSON.stringify(plan))
					plan = undefined;
				}
			}
		}

		if (plan) {
			let avgBoostLevel = 0
			for (let bodyIdx in plan.bodies) {
				let boosts = plan.boosts[bodyIdx];

				let boostScore = 0
				for (let boost in boosts) {
					boostScore += util.getBoostTier(boost) * boosts[boost];
				}
				boostScore /= plan.bodies[bodyIdx].length

				avgBoostLevel += boostScore;
			}

			avgBoostLevel /= plan.bodies.length

			if (Memory.debugAssaultSpawning) {
				console.log("avgBoostLevel calculated at", avgBoostLevel)
			}

			let factor = 4 - avgBoostLevel


			// Last time we said it'd be x waves. That should have reduced...
			if (this.memory.planWaves && this.memory.planWavesTick) {
				let projectedWaves = Math.max(0.001, this.memory.planWaves * factor - (Game.time - this.memory.planWavesTick) / CREEP_LIFE_TIME)

				let alpha = Math.exp(-1/4)

				mem.wavesNormalization = alpha * (mem.wavesNormalization || 1) + (1 - alpha) * numWaves * factor / projectedWaves
			}


			this.memory.planWaves = numWaves
			this.memory.planWavesTick = Game.time
			// plan.closeCombat = closeCombat ? 1 : 0

			if ((mem.invCL || Infinity) <= 3 && plan.squadHeal < mem.invCL * 600) {
				console.log("Stronghold attack attacking without enough heal???")
				console.log(JSON.stringify(plan))
				console.log(JSON.stringify(this.memory))
				console.log(JSON.stringify(mem))
				Game.notify("Stronghold attack attacking without enough heal???")
				Game.notify(JSON.stringify(plan))
				Game.notify(JSON.stringify(this.memory))
				Game.notify(JSON.stringify(mem))
			}
		}


		Memory.stats.profiler["assaultPlan"] = (Game.cpu.getUsed() - cpuStart)

		return plan;
	}

	requestSpawns(maxHealPerTower, expensiveBoosts, restrictBoosts, refresh) {
		// I suspect a CPU problem in here somewhere. Infinite loop or somesuch
		let t = Game.cpu.getUsed();

		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let maxAccountedForEnemyRanged;
		let maxAccountedForEnemyAttack;
		if ((Memory.rooms[this.memory.targetRoomName].invCL || 0) == 5) {
			maxAccountedForEnemyAttack = 0;
			if (Memory.rooms[this.memory.targetRoomName].numMegaTargetTiles) {
				maxAccountedForEnemyRanged = 4 * Memory.rooms[this.memory.targetRoomName].creepRanged / Memory.rooms[this.memory.targetRoomName].numMegaTargetTiles
				// if (Memory.rooms[this.memory.targetRoomName].invCL) console.log("a", maxAccountedForEnemyRanged, Memory.rooms[this.memory.targetRoomName].numMegaTargetTiles, Memory.rooms[this.memory.targetRoomName].creepRanged)
			}
			else {
				maxAccountedForEnemyRanged = 1;
				// if (Memory.rooms[this.memory.targetRoomName].invCL) console.log("b", maxAccountedForEnemyRanged, Memory.rooms[this.memory.targetRoomName].numMegaTargetTiles, Memory.rooms[this.memory.targetRoomName].creepRanged)
			}
		} 
		else {
			maxAccountedForEnemyAttack = (Memory.rooms[this.memory.targetRoomName].attackCreepsClose || 3);
			maxAccountedForEnemyRanged = (Memory.rooms[this.memory.targetRoomName].rangedCreepsClose || 6);
			// if (Memory.rooms[this.memory.targetRoomName].invCL) console.log("c", maxAccountedForEnemyRanged, Memory.rooms[this.memory.targetRoomName].numMegaTargetTiles, Memory.rooms[this.memory.targetRoomName].creepRanged)
		}

		// Invaders disabled
		if ((this.memory.type == MISSION_STRONGHOLD_ASSAULT || this.memory.type == MISSION_STRONGHOLD_MEGA_ASSAULT) && !Memory.rooms[this.memory.targetRoomName].invCL) {
			maxAccountedForEnemyAttack = 0;
			maxAccountedForEnemyRanged = 0;
		}
		if (this.memory.cornerNibble) {
			maxAccountedForEnemyAttack = 1;
		}

		let closeCombat = this.memory.closeCombat

		if ((Memory.rooms[this.memory.targetRoomName].rangedOnUnowned || 0) > Math.random() && this.memory.type != MISSION_ROOM_LOW_ENERGY_ASSAULT && !Memory.rooms[this.memory.targetRoomName].invCL) {
			closeCombat = 1
		}
		// On the whole close combat has less healing. If we're losing close-combat formations, override it
		if (closeCombat && Game.time - (Memory.rooms[this.memory.targetRoomName].lastFormationKilledCC || 0) < 2000) {
			closeCombat = 0
		}
		if (closeCombat && (Memory.rooms[this.memory.targetRoomName].advBlkDmg > 0.8 || Memory.rooms[this.memory.targetRoomName].notOnWall > 0.8)) {
			closeCombat = 0
		}


		let plan = this.getActualAssaultSpawnPlan(closeCombat, 1, maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, expensiveBoosts, restrictBoosts, refresh)

		if (refresh || (this.memory.closeCombat == 0 && closeCombat)) {
			let cnt = 0;
			let minHealPerTowerMod = 1;
			while (cnt < (restrictBoosts ? 25 : 15) && !plan) {
				// Getting too much of a healing drop, cut to ranged
				if (closeCombat && cnt > 10) {
					closeCombat = 0;
				}
				// We wanted to go close combat due to rangedOnUnowned
				// but that failed to make a plan, so reset that and try ranged
				else if (this.memory.closeCombat == 0 && closeCombat) {
					closeCombat = 0
				}
				else {
					minHealPerTowerMod *= 0.975;
					maxHealPerTower *= 0.95;
					maxAccountedForEnemyAttack *= 0.9;
					maxAccountedForEnemyRanged *= 0.95;
				}
				plan = this.getActualAssaultSpawnPlan(closeCombat, minHealPerTowerMod, maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, expensiveBoosts, restrictBoosts, refresh)

				if (Memory.debugAssaultSpawning) {
					console.log(cnt, minHealPerTowerMod, maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, expensiveBoosts, restrictBoosts, refresh)
				}

				if (cnt == 1 && !refresh) {
					break;
				}
				cnt++;
			}
			if (!plan) {
				console.log(cnt, minHealPerTowerMod, maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged)
			}
		}


		if (!plan || plan.roles.length < this.memory.squadSize) {
			console.log("Request spawns failed???", maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, expensiveBoosts, restrictBoosts, refresh, JSON.stringify(plan))
			return false;
		}

		if (plan.roles.length !== plan.bodies.length || plan.roles.length !== plan.boosts.length || plan.roles.length !== plan.formation.length) {
			console.log("WEIRD FORMATION PLAN!!!", JSON.stringify(plan));
			return false;
		}

		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		let spawn = spawns[0];

		// You know what? It really sucks if we can't fill extensions fast
		// if ((parentRoom.memory.ownedCreeps["baseManager"] || []).length < 2 && !spawn.hasPrioritySpawn("baseManager")) {
		// 	spawn.addPrioritySpawn("baseManager")
		// }
		// if (!Memory.rooms[this.memory.targetRoomName].invCL || Memory.rooms[this.memory.targetRoomName].invCL > 3) {
			parentRoom.memory.spawningHeavyMission = Game.time;
		// }

		this.memory.e = Math.round(this.memory.e * 900) / 1000;
		this.memory.withdrawnEscalated = 0;

		if (plan.directional) {
			this.memory.directional = 1;
		}



		this.memory.squadHeal = plan.squadHeal;
		// Will be set on spawnCreep if we spawn a boosted creep
		this.memory.boosted = 0;

		let formationCreepNames = []
		let extraMemoryFormation = {formationId: this.memory.formations.length, closeCombatFormation: plan.closeCombat};
		let extraMemorySolo = {formationId: this.memory.formations.length};

		if (plan.nibbler) {
			extraMemoryFormation.nibbler = 1;
			extraMemoryFormation.nibbleShape = plan.nibbleShape;
		}

		for (let i = 0; i < plan.roles.length; i++) {
			if (plan.formation[i]) {
				formationCreepNames.push(this.spawnCreep(plan.roles[i], plan.bodies[i], plan.boosts[i], plan.formationPos[i], spawn, 1, extraMemoryFormation))
			}
			else {
				this.memory.targets = this.memory.targets || [];
				let target = this.memory.targets[this.memory.formations.length] || this.memory.target;
				// non formation guys tend to go all sorts of wrong with edge walls.
				if (target && target.x > 2 && target.x < 47 && target.y > 2 && target.y < 47) {
					this.spawnCreep(plan.roles[i], plan.bodies[i], plan.boosts[i], plan.formationPos[i], spawn, 0, extraMemorySolo)
				}
			}
		}

		this.memory.formations.push(formationCreepNames);

		// Grandfathering.
		this.memory.formationTypes = this.memory.formationTypes || [];
		this.memory.formationTypes.push(plan.nibbler ? "n" : "d");


		global._sourceRoomSpawningMission = global._sourceRoomSpawningMission || {}
		global._sourceRoomSpawningMission[this.memory.sourceRoomName] = 1;

		if (!refresh) {
			spawn.addPrioritySpawn("baseManager")
		}

		Memory.stats.profiler["formationAssaultRequestSpawns"] = (Game.cpu.getUsed() - t)

		if (this.memory.numLaunches <= 1 && plan.tryingLowControllerPush) {
			this.memory.tryingLowControllerPush = 1;
			Memory.rooms[this.memory.targetRoomName].triedLowControllerPush = 1;
		}


		return true;
	}



	launchBonusAttack(minHealPerTower, maxHealPerTower) {
		if (Math.random() < 0.7) {
			return false;
		}
		if (!this.memory.keepFormation) {
			return false;
		}

		let rand = Math.random()

		// 0: Edge bouncer
		// 1: A whole new squad of a different type
		// 2: NUKE
		let probs = [0.7, 0.1, 0.2];

		let bonus = -1;
		let accum = 0;
		for (let i = 0; i < probs.length; i++) {
			accum += probs[i];
			if (rand < accum) {
				bonus = i;
				break;
			}
		}

		// if (bonus == 0) {
		// 	return true;
		// }
		console.log("Bonus! " + bonus + " parent: " + this.memory.sourceRoomName + " target: " + this.memory.targetRoomName)
		// Game.notify("Bonus! " + bonus + " parent: " + this.memory.sourceRoomName + " target: " + this.memory.targetRoomName)

		let mem = Memory.rooms[this.memory.targetRoomName];

		if (bonus == 0) {
			Memory.combatManager.requestedMissions[MISSION_ROOM_EDGE_ASSAULT][this.memory.targetRoomName] = Game.time
			return true
		}
		else if (bonus == 1 && !this.memory.edgeWallAttack) {
			let directional = this.memory.directional
			this.memory.closeCombat = !this.memory.closeCombat
			// Don't want it to fail this or it could all go tits up
			let ret = false;
			try {
				if (missionInfo.canLaunchNewAssault(this.memory.targetRoomName, this.memory.bestSetupRoom)) {
					// ret = this.requestSpawns(minHealPerTower, maxHealPerTower, this.memory.restrictBoosts ? false : true, this.memory.restrictBoosts, true);
					ret = this.requestSpawns(this.memory.restrictBoosts, true);
					console.log("Spawn ret for bonus 1: " + ret)
					// Game.notify("Spawn ret for bonus 1: " + ret)

				}
			}
			catch (e) {
				console.log("Error on bonus attack requestSpawns!");
				console.log(e);
				Game.notify(e.stack)
				console.log(e.stack);
			}
			this.memory.closeCombat = !this.memory.closeCombat
			this.memory.directional = directional;
			return ret;
		}
		else if (bonus == 2 && this.memory.boosted >= 2) {
			if (this.memory.externalTowers) return false;
			if (this.memory.externalSpawns) return false;

			// These just fuck up safe mode
			// return nukeAI.tryNukeRequest(this.memory.targetRoomName)
		}
	}

	spawnCreep(role, body, boosts, formationPos, spawn, inFormation, extraMemory) {
		var extraMemory = extraMemory || {}
		extraMemory = _.clone(extraMemory)
		extraMemory.fallbackRoom = this.memory.sourceRoomName;
		extraMemory.setupPos 	 = this.memory.setupPos;

		// Formations cannot take in idle creeps. The mission can, not the formation.
		if (inFormation) {
			extraMemory.formationPosition = formationPos;
			if (this.memory.directional) {
				extraMemory.formationOrientation = BOTTOM;
				if (this.memory.bestExitDir == TOP) {
					extraMemory.targetFormationOrientation = BOTTOM;
				}
				else if (this.memory.bestExitDir == BOTTOM) {
					extraMemory.targetFormationOrientation = TOP;
				}
				else if (this.memory.bestExitDir == LEFT) {
					extraMemory.targetFormationOrientation = RIGHT;
				}
				else if (this.memory.bestExitDir == RIGHT) {
					extraMemory.targetFormationOrientation = LEFT;
				}
			}

			if (!extraMemory.nibbler) {
				extraMemory.target 			 = this.memory.target;
			}
			extraMemory.directionalFormation = this.memory.directional ? 1 : 0;
		}

		extraMemory.targetRoom = this.memory.targetRoomName;

		let myBoostLevel = 0;

		if (inFormation && Object.keys(boosts).length > 0) {
			let boostScore = 0
			for (let boost in boosts) {
				boostScore += util.getBoostTier(boost) * boosts[boost];
				// myBoostLevel = Math.max(myBoostLevel, util.getBoostTier(boost));
			}
			boostScore /= MAX_CREEP_SIZE

			console.log("Assault boost level", myBoostLevel, boostScore)

			myBoostLevel = boostScore
		}
		extraMemory.boostLevel = myBoostLevel;

		this.memory.boosted = Math.max(this.memory.boosted, myBoostLevel);
		this.memory.peakBoosted = Math.max((this.memory.peakBoosted || 0), myBoostLevel);

		return super.spawnCreep(role, body, boosts, spawn, extraMemory)
	}

	assignCreep(creep) {
		creep.mem.targetRoom = this.memory.targetRoomName;
		super.assignCreep(creep);
	}

	getSetupPos(setupExitDir, bestTarget, bestSetupRoom, setupFailing) {
		var setupPos;
		var targetAlignment;
		// A bit of noise in the alignment means that a bug cause by the alignment
		// can be "noised" around most of the time.

		let width = 16;

		/*if (Game.rooms[this.memory.targetRoomName]) {
			width += Game.rooms[this.memory.targetRoomName].assaultCountByEdge[(Math.round((parseInt(setupExitDir) - 1) / 2) + 2) % 4]
		}*/

		let xSetup = bestTarget ? bestTarget.x : 25;
		let ySetup = bestTarget ? bestTarget.y : 25;

		if (setupExitDir == TOP || setupExitDir == BOTTOM) {
			targetAlignment = (xSetup - width + Math.round(Math.random() * width + Math.random() * width));
		}
		else if (setupExitDir == RIGHT || setupExitDir == LEFT) {
			targetAlignment = (ySetup - width + Math.round(Math.random() * width + Math.random() * width));
		}
		else {
			console.log("Bad setupExitDir in getSetupPos", setupExitDir)
		}

		// Middle is good as well...
		targetAlignment = Math.round((targetAlignment + 25) / 2)

		let roomTerrain = Game.map.getRoomTerrain(bestSetupRoom)

		// Find a 2x2 space in the setup room near the exit direction.
		for (var _iter = 0; _iter < 100; _iter++) {
			let iter;
			// Can get from anywhere to anywhere, spawn _away_ from the target if it's not the controller
			if (Memory.rooms[this.memory.targetRoomName].enemyFullyConnected && (!bestTarget || !bestTarget.controllerTarget)) {
				iter = 99 - _iter;
			}
			else {
				iter = _iter;
			}

			// 0, -1, 1, -2, 2. Match target alginment as close as possible
			var i = targetAlignment + Math.floor((iter + 1) / 2) * Math.pow(-1, iter)

			let OOB = false

			// console.log(JSON.stringify(setupExitDir), JSON.stringify(bestTarget), JSON.stringify(bestSetupRoom), JSON.stringify(this.memory.mask))

			for (let dir of this.memory.mask) {
				if ((setupExitDir == LEFT || setupExitDir == RIGHT) && (i + dir[0] >= 49 || i + dir[0] <= 0)) OOB = true;
				if ((setupExitDir == TOP || setupExitDir == BOTTOM) && (i + dir[1] >= 49 || i + dir[1] <= 0)) OOB = true;

				if (dir[0] < 0 || dir[1] < 0) {
					console.log("Negative mask. That's potentially going to break setupPos in the bit just after this. Dunno. Check it.", JSON.stringify(dir))
				}
			}

			if (OOB) continue;

			let offset = 1 + (setupFailing ? Math.round(Math.random() * 10) : 0)

			// for (var j = 2; j < 4; j++) {
			// for (var j = 2 + offset; j < 3 + offset; j++) {

			if (setupExitDir == TOP) {
				let wall = false;
				for (let k = 0; k <= offset; k++) {
					for (let dir of this.memory.mask) {
						if (roomTerrain.get(i + dir[0], k + dir[1]) & TERRAIN_MASK_WALL) {
							wall = true;
							break;
						}
					}
				}
				if (!wall) {
					setupPos = new RoomPosition(i, offset, bestSetupRoom)
				}
			}
			else if (setupExitDir == LEFT) {
				let wall = false;
				for (let k = 0; k <= offset; k++) {
					for (let dir of this.memory.mask) {
						if (roomTerrain.get(k + dir[0], i + dir[1]) & TERRAIN_MASK_WALL) {
							wall = true;
							break;
						}
					}
				}
				if (!wall) {
					setupPos = new RoomPosition(offset, i, bestSetupRoom)
				}
			}
			else if (setupExitDir == BOTTOM) {
				let wall = false;
				let maxDirY = 0;
				for (let k = 0; k <= offset; k++) {
					for (let dir of this.memory.mask) {
						if (dir[1] > maxDirY) {
							maxDirY = dir[1];
						}
						if (roomTerrain.get(i + dir[0], 49 - k - dir[1]) & TERRAIN_MASK_WALL) {
							wall = true
							break
						}

					}
				}
				if (!wall) {
					setupPos = new RoomPosition(i, 49 - (offset) - maxDirY, bestSetupRoom)
				}
			}
			else if (setupExitDir == RIGHT) {
				let wall = false;
				let maxDirX = 0;
				for (let k = 0; k <= offset; k++) {
					for (let dir of this.memory.mask) {
						if (dir[0] > maxDirX) {
							maxDirX = dir[0];
						}

						if (roomTerrain.get(49 - k - dir[0], i + dir[1]) & TERRAIN_MASK_WALL) {
							wall = true;
							break;
						}

					}
				}
				if (!wall) {
					setupPos = new RoomPosition(49 - (offset) - maxDirX, i, bestSetupRoom)
				}
			}

			if (setupPos) {
				for (let formationIdx in this.memory.formations) {
					if (setupPos) {
						let formation = this.memory.formations[formationIdx];
						let numCreepsAlive = 0;
						for (let creepName of formation) {
					  		let creep = Game.creeps[creepName];
					  		if (creep) {
					  			numCreepsAlive++
					  		}
					  	}
					  	if (numCreepsAlive == this.memory.squadSize && this.memory.setupPositions[formationIdx]) {
							if ((this.memory.setupPositions[formationIdx].x == setupPos.x || this.memory.setupPositions[formationIdx].x + 1 == setupPos.x) &&
								(this.memory.setupPositions[formationIdx].y == setupPos.y || this.memory.setupPositions[formationIdx].y + 1 == setupPos.y)) {
								setupPos = undefined;
							}
						}
					}
				}
				break;
			}
			// if (setupPos) {
			// 	break;
			// }
		}

		if (setupPos) {
			this.memory.edgeWallAttack = 0;
			let exits = Game.map.describeExits(this.memory.targetRoomName);
			for (let exitDir in exits) {
				if (exits[exitDir] == setupPos.roomName) {
					if ((exitDir == LEFT && Memory.rooms[this.memory.targetRoomName].eWallsL) ||
						(exitDir == RIGHT && Memory.rooms[this.memory.targetRoomName].eWallsR) ||
						(exitDir == TOP && Memory.rooms[this.memory.targetRoomName].eWallsT) ||
						(exitDir == BOTTOM && Memory.rooms[this.memory.targetRoomName].eWallsB)) {
						this.memory.edgeWallAttack = 1;
					}
				}
			}
		}


		return setupPos;
	}

	// If there is a safe position within five tiles, set up there.
	getInternalSetupPos(formationCreepNames, currentPos, bestTargetPos, aggressive) {
		// console.log("getInternalSetupPos", currentPos, bestTargetPos);

		if (!Game.rooms[this.memory.targetRoomName]) return;
		if (!bestTargetPos) return;
		if (currentPos.roomName != this.memory.targetRoomName) return;

		let roomMap = roomIntel.getEnemyRoomMap(this.memory.targetRoomName);
		if (!roomMap) return;

		if (!Memory.rooms[this.memory.targetRoomName].navigationByMask || !Memory.rooms[this.memory.targetRoomName].navigationByMask[JSON.stringify(this.memory.mask)]) {
			roomIntel.calcNavigableByMask(this.memory.targetRoomName, this.memory.mask, true)
		}

		let maskNavigation = Memory.rooms[this.memory.targetRoomName].navigationByMask[JSON.stringify(this.memory.mask)];
		// console.log("getInternalSetupPos", currentPos, bestTargetPos);

		let room = Game.rooms[this.memory.targetRoomName];

		let setupPos;
		let setupRange = Infinity;

		let maxMaskX = 0;
		let maxMaskY = 0;

		let minTTL = Infinity
		for (let creepName of formationCreepNames) {
			if (!Game.creeps[creepName]) continue

			minTTL = Math.min(minTTL, Game.creeps[creepName].ticksToLive)
		}

		for (let dir of this.memory.mask) {
			if (dir[0] > maxMaskX) maxMaskX = dir[0];
			if (dir[1] > maxMaskY) maxMaskY = dir[1];
		}

		// Find a space in the setup room near the exit direction.
		for (let x = -5; x <= 5; x++) {
			let newX = currentPos.x + x;
			if (newX <= 1 || newX >= 48 - maxMaskX) continue;
			for (let y = -5; y <= 5; y++) {
				let newY = currentPos.y + y;
				if (newY <= 1 || newY >= 48 - maxMaskY) continue;

				for (let deathLoc of (Memory.rooms[this.memory.targetRoomName].deathLocs || [])) {
					if (Math.max(Math.abs(newX - deathLoc.x), Math.abs(newY - deathLoc.y)) < 3) {
						continue
					}
				}

				let cont = false
				// If there's a creep in the way, don't.
				for (let dir of this.memory.mask) {
					if (room.lookForAt(LOOK_CREEPS, newX + dir[0], newY + dir[1]).length) {
						cont = true;
						break
					}
				}
				if (cont) {
					continue
				}



				// How far I have to move.
				let range = Math.max(Math.abs(x), Math.abs(y)) * 0.75;

				// Diagonal is slightly annoying
				range += (Math.abs(x) + Math.abs(y)) / 10.

				// Get close to the target
				// range -= Math.max(Math.abs(bestTargetPos.x - newX), Math.abs(bestTargetPos.y - newY));

				if (range >= setupRange) continue;

				if (Game.shard.name != "AppleCrumble") {
					const depth = 1;
					const codec = new Codec({ depth, array:1 });
					if (codec.decode(maskNavigation[newX])[newY] != 1) {
						continue;
					}
				}
				else {
					if (maskNavigation[newX][newY] == 1) {
						continue;
					}
				}

				// Needs to be clear and external
				// cont = false;
				// for (let dir of this.memory.mask) {
				// 	if (parseInt(roomMap[newX + dir[0]][newY + dir[1]]) < 4) {
				// 		cont = true;
				// 		break;
				// 	}
				// }
				// if (cont) {
				// 	continue;
				// }

				for (let dir of this.memory.mask) {
					let s = room.lookForAt(LOOK_STRUCTURES, newX + dir[0], newY + dir[1]);
					s = _.filter(s, function(struct) { return struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER });
					if (s.length > 0) {
						cont = true;
						break;
					}
				}
				if (cont) {
					continue;
				}

				let pos = new RoomPosition(newX, newY, this.memory.targetRoomName);

				let towerDamage = 0;
				for (let towerIdx in Memory.rooms[this.memory.targetRoomName].twrX) {
					let towerX = Memory.rooms[this.memory.targetRoomName].twrX[towerIdx];
					let towerY = Memory.rooms[this.memory.targetRoomName].twrY[towerIdx];

					if (Memory.rooms[this.memory.targetRoomName].twrE[towerIdx] >= 20) {
						towerDamage += util.getTowerDamageForDist(currentPos.getRangeTo(towerX, towerY));
						towerDamage += util.getTowerDamageForDist(pos.getRangeTo(towerX, towerY));
					}
				}
				// Mean of where we are and where we're going
				towerDamage /= 2;

				if (Game.rooms[this.memory.targetRoomName]) {
					let enemyDamagingCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false);
					for (let enemyCreep of pos.findInRange(enemyDamagingCreeps, 5)) {
						towerDamage += enemyCreep.getBoostModifiedRangedAttack() * RANGED_ATTACK_POWER
						if (pos.inRangeToPos(enemyCreep.pos, 3)) {
							towerDamage += enemyCreep.getBoostModifiedAttack() * ATTACK_POWER
						}
					}

				}

				// console.log(towerDamage, this.memory.squadHeal)

				let mod = 0
				if (minTTL < 300) {
					mod = 0.6 * (300 - minTTL) / 300
				}


				if (towerDamage > this.memory.squadHeal * (mod + (aggressive ? 0.6 : 0.4))) {
					continue;
				}

				// Tiebreak
				range += towerDamage / this.memory.squadHeal


				// Do a quick path check
				let pathResult = PathFinder.search(currentPos, {pos: pos, range: 0}, {
					// We need to set the defaults costs higher so that we
					// can set the road cost lower in `roomCallback`
					plainCost: 2,
					swampCost: 10,

					roomCallback: function(roomName) {
						let room = Game.rooms[roomName];
						if (!room) return;
						let costs = new PathFinder.CostMatrix;

						room.find(FIND_STRUCTURES).forEach(function(struct) {
							if (struct.structureType === STRUCTURE_ROAD) {
								// Favor roads over plain tiles
								costs.set(struct.pos.x, struct.pos.y, 1);
							}
							else if (struct.structureType !== STRUCTURE_CONTAINER &&
									(struct.structureType !== STRUCTURE_RAMPART ||
									!struct.my)) {
								// Can't walk through non-walkable buildings
								costs.set(struct.pos.x, struct.pos.y, 0xff);
							}
						});
						return costs;
					}
				});

				if (!pathResult.incomplete && pathResult.path.length < 8) {
					range += pathResult.path.length;

					if (range >= setupRange) continue;

					setupPos = pos;
					setupRange = range;

					// That'll do. Not super-important if we're not taking any damage.
					if (towerDamage == 0) {
						x = 6;
						y = 6;
						break
					}
				}

			}
		}

		if (setupPos) {
			console.log("getInternalSetupPos", setupPos, setupRange);
		}

		return setupPos;
	}

	checkNeedNewTargetForced(formationIdx) {
		let room = Game.rooms[this.memory.targetRoomName];

		let forceNewTarget = false;
		let formation = this.memory.formations[formationIdx];

		if (formation.length == 0) return false;


		let numCreepsAlive = 0;
		for (let creepName of formation) {
			let creep = Game.creeps[creepName];
			if (creep) {
				numCreepsAlive++
			}
		}
		if (numCreepsAlive == this.memory.squadSize) {
			for (let creepName of formation) {
				let creep = Game.creeps[creepName];

				if (creep && creep.mem.forceNewTarget && creep.mem.forceNewTarget == Game.time - 1) {
					forceNewTarget = true;
					if (creep.room.dangerous || Math.random() < 0.1) {
						this.memory.setupPositions[formationIdx] = undefined;
					}
				}
				else if (creep && creep.mem.considerNewTarget && creep.mem.considerNewTarget == Game.time - 1 && Math.random() < 0.02) {
					forceNewTarget = true;
					if (creep.room.dangerous || Math.random() < 0.1) {
						this.memory.setupPositions[formationIdx] = undefined;
					}
				}
			}
		}
		
		return forceNewTarget;
	}

	checkNeedNewTargetKilled(formationIdx) {
		if (this.memory.formations[formationIdx].length == 0) return false;

		// console.log(formationIdx)
		let room = Game.rooms[this.memory.targetRoomName];

		let target = this.memory.targets[formationIdx] || this.memory.target

		if (target.creepTarget) {
			return true
		}

		if (target) {
			let targetStructs = room.lookForAt(LOOK_STRUCTURES, target.x, target.y);

			if (targetStructs.length == 0) {
				if (this.memory.targets[formationIdx]) {
					delete this.memory.targets[formationIdx]
				}
				delete this.memory.target
				return true;
			}

			// Maybe this isn't working? I was getting weird target swapping in botarena.
			// let otherCreeps = (new RoomPosition(this.memory.target.x, this.memory.target.y, this.memory.targetRoomName)).findInRange(FIND_MY_CREEPS, 1);

			// if (otherCreeps.length > Math.sqrt(this.memory.squadSize) - 0.01) {
			// 	return true
			// }
			
			for (let targetStruct of targetStructs) {
				if (targetStruct.structureType != STRUCTURE_ROAD && targetStruct.structureType != STRUCTURE_CONTAINER) {
					return false;
				}
			}
		}

		return true;
	}


	reTargetRoamingCreepDanger() {
		let room = Game.rooms[this.memory.targetRoomName];

		if (!room) return false;
		if (!room.memory.hostileBoostedCreeps && this.memory.boosted) return false;


		let hostiles = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false);

		// console.log("reTargetRoamingCreepDanger", hostiles)

		if (hostiles.length == 0) return false;

		// If there are dangerous creeps within 5 tiles of my formation outside
		// of the walls, set them as the target for all squads in this mob.
		let roomMap = roomIntel.getEnemyRoomMap(this.memory.targetRoomName);

		// console.log("reTargetRoamingCreepDanger", !!roomMap)

		if (!roomMap) return false;

		let dangerTargets = [];
		let bigDangerTargets = [];

		for (let formationIdx in this.memory.formations) {
			let formation = this.memory.formations[formationIdx];

			for (let formationCreepName of formation) {
				let creep = Game.creeps[formationCreepName];
				if (!creep) continue;
				if (creep.room.name != this.memory.targetRoomName) continue;

				let range = creep.mem.target && creep.mem.target.creepTarget ? 6 : 4

				let creepHostiles = creep.pos.findInRange(hostiles, range);

				if (!creepHostiles.length) continue;

				for (var creepHostile of creepHostiles) {
					if (creepHostile.owner.username == "Source Keeper" || creepHostile.owner.username == "Invader") continue
					if (parseInt(roomMap[creepHostile.pos.x][creepHostile.pos.y]) == parseInt(roomMap[creep.pos.x][creep.pos.y])) {
						if (!dangerTargets.includes(creepHostile)) {
							dangerTargets.push(creepHostile);
						}
						if (Game.time - (creep.mem.withdrawTick || 0) < 5 && !bigDangerTargets.includes(creepHostile)) {
							bigDangerTargets.push(creepHostile);
						}
					}
				}
			}
		}

		// console.log("reTargetRoamingCreepDanger", dangerTargets)

		if (dangerTargets.length == 0) return false;

		if (!room.memory.navigationByMask) {
			roomIntel.calcNavigableByMask(this.memory.targetRoomName, this.memory.mask, true);
		}

		let mask = JSON.stringify(this.memory.mask);
		let maskNavigation = room.memory.navigationByMask[mask];

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

		// Ok, pick the best one.
		for (let formationIdx in this.memory.formations) {
			let formation = this.memory.formations[formationIdx];

			let formationDamage = 0;
			// let isDismantle = false;
			for (let formationCreepName of formation) {
				let creep = Game.creeps[formationCreepName];
				if (!creep) continue;
				let bmcp = creep.getBoostModifiedCombatParts(false, true);

				// if (this.memory.closeCombat && !bmcp.numAttack && creep.hasBodypart(WORK)) {
				// 	isDismantle = true;
				// 	break
				// }

				formationDamage += bmcp.numRanged * RANGED_ATTACK_POWER + bmcp.numAttack * ATTACK_POWER;
			}

			if (!formationDamage) continue

			let bestTarget
			let bestScore = -Infinity;

			let totalHeal = 0;

			for (let target of dangerTargets) {
				if (doesXYFail(target.pos.x, target.pos.y, this.memory.squadSize)) continue;
				let rangeOverride

				if (bigDangerTargets.includes(target)) {
					rangeOverride = 15;
				}

				let anyInRange = false;
				for (let formationCreepName of formation) {
					let creep = Game.creeps[formationCreepName];
					if (!creep) continue;


					let range = rangeOverride || (creep.mem.target && creep.mem.target.creepTarget ? 6 : 4)

					if (target.pos.inRangeToPos(creep.pos, range)) {
						anyInRange = true;
						break;
					}
				}

				if (!anyInRange) continue

				let bmcp = target.getBoostModifiedCombatParts(false, true);
				if (bmcp.numRanged + bmcp.numAttack == 0) {
					continue
				}

				let score= 0;
				score += bmcp.numHeal * 64 + bmcp.numRanged * 16 + bmcp.numAttack * 4;
				score -= target.hits / 4;


				let targetHeal = bmcp.numHeal * HEAL_POWER

				let friendlyDamage = 0
				for (let myCreep of room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false)) {
					if (formation.includes(myCreep.name)) continue

					let alreadyTargeting = myCreep.mem.target && myCreep.mem.target.x == target.pos.x && myCreep.mem.target.y == target.pos.y && myCreep.mem.target.creepTarget

					if (alreadyTargeting || myCreep.pos.inRangeToPos(target.pos, 3)) {
						if (myCreep.hasBodypart(RANGED_ATTACK)) {
							targetHeal -= myCreep.getBoostModifiedRangedAttack() * RANGED_ATTACK_POWER
						}
						if (alreadyTargeting || myCreep.pos.inRangeToPos(target.pos, 1)) {
							if (myCreep.hasBodypart(ATTACK)) {
								targetHeal -= myCreep.getBoostModifiedAttack() * ATTACK_POWER
							}
						}
					}
				}

				// Can't hurt it. This is probably not a good sign.
				if (targetHeal >= formationDamage || totalHeal >= formationDamage) {
					continue;
				}

				for (let tower of room.towers) {
					if (!tower.isActive() || tower.energy <= 20) continue;
					var towerDist = Math.max(Math.abs(target.pos.x - tower.pos.x), Math.abs(target.pos.y - tower.pos.y));

					targetHeal += util.getTowerHealForDist(towerDist)
				}

				totalHeal += targetHeal * 0.5;

				if (targetHeal) {					
					let numTough = target.getNumOfBodyPart(TOUGH);

					if (numTough) {						
						let toughBoostLevel = target.getToughBoostLevel(true);
						if (toughBoostLevel > 1) {							
							let myDamage = formationDamage

							let mod = 1;
							if 		(toughBoostLevel == 4) mod = 0.3;
							else if (toughBoostLevel == 3) mod = 0.5;
							else if (toughBoostLevel == 2) mod = 0.7;

							if (myDamage * mod < numTough * 100) {
								myDamage *= mod;
							}
							else {
								myDamage -= (numTough * 100) / mod - numTough * 100;
							}

							myDamage -= targetHeal;

							if (myDamage <= 0) {
								continue;
							}
						}
					}
				}

				if (totalHeal >= formationDamage) {
					bestTarget = undefined
					break
				}

				for (let formationCreepName of formation) {
					let creep = Game.creeps[formationCreepName];
					if (!creep) continue;
					score -= creep.pos.getRangeTo(target.pos) * 128;
				}

				if (score > bestScore) {
					bestScore = score;
					bestTarget = target;
				}
			}

			if (bestTarget) {
				console.log("reTargetRoamingCreepDanger", bestTarget.pos)
				let target = {x: bestTarget.pos.x, y: bestTarget.pos.y, creepTarget: 1}
				this.memory.targets[formationIdx] = target
				this.memory.target = target
				for (let formationCreepName of formation) {
					let creep = Game.creeps[formationCreepName];
					if (!creep) continue;
					creep.mem.target = target;
				}
				this.memory.unableToHurtDangerTargets = Math.max(0, (this.memory.unableToHurtDangerTargets || 0) - 1);
			}
			else {
				this.memory.unableToHurtDangerTargets = (this.memory.unableToHurtDangerTargets || 0) + 1;
			}
		}
	}

	cleanMemory() {
		delete this.memory.nextCreepPosD0;
		delete this.memory.nextCreepPosD1;
		delete this.memory.keepFormation;
		delete this.memory.formations;
		delete this.memory.formationTypes;
		delete this.memory.setupPositions;
		delete this.memory.targets;
		delete this.memory.target;
		delete this.memory.startWallHP;
		delete this.memory.startRampHP;
		delete this.memory.realStartWallHP;
		delete this.memory.realStartRampHP;
		delete this.memory.startEnergy;

		delete this.memory.lastCreepsInRoom;

		delete this.memory.maxPowerCreepDisruptTowerLevel;
		delete this.memory.expectedMaxPowerCreepDisruptTowerLevel;
		delete this.memory.powerCreepMissionID;

		delete this.memory.roamingCreepDangers;

		delete this.memory.withdrawnEscalated
		delete this.memory.externalTowers
		delete this.memory.externalSpawns

		delete this.memory.mask
		delete this.memory.squadSize

		delete this.memory.restrictBoosts;
		delete this.memory.squadHeal;
		delete this.memory.allowBonusAttack;
		delete this.memory.bestExitDir;
		delete this.memory.routeLength;
		delete this.memory.preSpawnOffset;
		delete this.memory.boosted;

		delete this.memory.planWaves
		delete this.memory.closeCombat
		delete this.memory.directional
		delete this.memory.edgeWallAttack
		delete this.memory.setupPos
		delete this.memory.bestSetupRoom

		delete this.memory.currentAssaultCount
		delete this.memory.bestTargetFailTick

		delete this.memory.tryingLowControllerPush

		return super.cleanMemory();
	}


	missionComplete(success) {
		if (this.memory.lastLaunchTick !== Game.time) {
			Memory.rooms[this.memory.targetRoomName].numAttacksCompleted = (Memory.rooms[this.memory.targetRoomName].numAttacksCompleted || 0) + 1;
		}

		if (!success && Game.time - this.memory.lastLaunchTick < 1000) {
			if (Game.time - (Memory.rooms[this.memory.targetRoomName].hostilesPushTest || 0) < 100) {
				Memory.rooms[this.memory.targetRoomName].hostilesPushOut = Game.time;
			}
		}

		this.cleanMemory()

		return super.missionComplete(success);
	}

}


module.exports = FormationAssaultMission