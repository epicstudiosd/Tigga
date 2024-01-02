"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const creepCreator = require('creepCreator');
const util = require('util');

class ChildNeighbourHoldMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, childRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_CHILD_NEIGHBOUR_ROOM_HOLD;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		memory.fRefreshRate = 1000;
		if (createNew && this.isActive()) {
			if (memory.e === undefined) {
				if (Memory.rooms[targetRoomName]) {
					if ((Memory.rooms[targetRoomName].DT || 1) < 0.2) {
						memory.e = 0;
					}
					else if ((Memory.rooms[targetRoomName].DT || 1) < 1) {
						memory.e = 1;
					}
					else if ((Memory.rooms[targetRoomName].DT || 1) < 1.5) {
						memory.e = 2;
					}
					else {
						memory.e = 3;
					}
				}
				else {
					memory.e = 1;
				}

				if (Game.rooms[sourceRoomName].effectiveLevel < 7) {
					memory.e = Math.max(0, memory.e - 1);
				}
				else if (Game.rooms[sourceRoomName].effectiveLevel == 8) {
					memory.e++;
				}
			}

			// De-escalate from time to time
			if (memory.e && Math.random() > 0.9) {
				memory.e--;
			}

			memory.targetRoomName = memory.targetRoomName || targetRoomName;
			memory.childRoomName = memory.childRoomName || childRoomName;

			memory.routeCost = Math.round(safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, false, true) * 10) / 10
		}

	}

	tick() {
		if (this.isActive()) {
			let mmem = this.memory;
			// Fall back into the main room if it's under attack
			if (Game.rooms[mmem.childRoomName] && Game.rooms[mmem.childRoomName].dangerous) {
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						creep.memory.targetRoom = mmem.childRoomName;
					}
				}
			}
			else {
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						creep.memory.targetRoom = mmem.targetRoomName;
					}
				}
			}

			if (!mmem.escalated && Game.rooms[mmem.targetRoomName]) {
				var dangerousCreeps = Game.rooms[mmem.targetRoomName].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true);

				var eNumAttack = 0;
				var fNumAttack = 0;
				var eNumRanged = 0;
				var fNumRanged = 0;
				var eNumHeals = 0;
				var fNumHeals = 0;

				for (var creep of dangerousCreeps) {
					var parts = creep.getBoostModifiedCombatParts(false);

					eNumAttack += parts.numAttack;
					eNumRanged += parts.numRanged;
					eNumHeals += parts.numHeal;
				}

				for (var creepName of mmem.assignedCreeps) {
					if (Game.creeps[creepName]) {
				   		var parts = Game.creeps[creepName].getBoostModifiedCombatParts(false);

				   		fNumAttack += parts.numAttack;
				   		fNumRanged += parts.numRanged;
				   		fNumHeals += parts.numHeal;
					}
				}

				// If they beat me in more than one field, escalte for next round.
				if ((eNumAttack > fNumAttack * 1.1 ? 1 : 0) + (eNumRanged > fNumRanged * 1.1 ? 1 : 0) + (eNumHeals > fNumHeals * 1.1 ? 1 : 0) > 1) {
					if ((eNumAttack > fNumAttack * 2 ? 1 : 0) + (eNumRanged > fNumRanged * 2 ? 1 : 0) + (eNumHeals > fNumHeals * 2 ? 1 : 0) > 1) {
						mmem.e += 4;
					}
					else if ((eNumAttack > fNumAttack * 1.5 ? 1 : 0) + (eNumRanged > fNumRanged * 1.5 ? 1 : 0) + (eNumHeals > fNumHeals * 1.5 ? 1 : 0) > 1) {
						mmem.e += 2;
					}
					else {
						mmem.e += 1;
					}
					mmem.escalated = 1;
				}
			}

			if (Math.random() < 0.01 || !mmem.routeCost) {
				mmem.routeCost = Math.round(safeRoute.getSafeRouteCost(mmem.sourceRoomName, mmem.targetRoomName, false, true) * 10) / 10
			}


			if (Game.rooms[mmem.childRoomName] && (Game.rooms[mmem.childRoomName].effectiveLevel || 0) > 3 && Game.rooms[mmem.childRoomName].towers.length > 0) {
				// RCL 4, that'll do pig
				mmem.s++;
				this.missionComplete(true);
			}
			else if (!Memory.rooms[mmem.targetRoomName] || Memory.rooms[mmem.targetRoomName].owner) {
				// Wat da fuk. Somebody claimed it!
				mmem.fTick = Game.time;
				mmem.f++;
				this.missionComplete(false);
			}
			else if (mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) {
				if (Game.time - mmem.lastLaunchTick <= 1500) {
					// Oh, we're all dead before expected.
					mmem.e++;
					if (this.getSuccessRate() < 0.5) {
						mmem.e++;
					}
					// If we lived more than 500 ticks post launch, just escalate it.
					if (Game.time - mmem.lastLaunchTick < 500) {
						mmem.fTick = Game.time;
						this.missionComplete(false);
					}
					else {
						this.missionComplete(true);
					}
				}
				// Mission complete! Our creeps should live at least 1500 ticks, and we've decided not to respawn for some reason.
				else {
					mmem.s++;
					this.missionComplete(true);
				}
			}
			// Need moar. Our last guys are still alive, so back them up.
			else if (Game.time - mmem.lastLaunchTick >= Math.max(1250 - mmem.routeCost * 50, 750) &&
					 mmem.spawningCreeps.length == 0 &&
					 Game.rooms[mmem.childRoomName] &&
					 Game.rooms[mmem.childRoomName].controller.my &&
					 !this.renewRestricted()) {
				// Quick sanity check: are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
				// spawning in thinking life is going well.
				var effectiveTeam = false;
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						if (creep.getActiveBodyparts(ATTACK) > 3 || creep.getActiveBodyparts(RANGED_ATTACK) > 2 || creep.getActiveBodyparts(HEAL) > 1) {
							effectiveTeam = true;
							break;
						}
					}
				}
				if (effectiveTeam) {

					// Reset the clock
					if (this.requestSpawns()) {
						mmem.lastLaunchTick = Game.time;

						// De-escalate
						if (mmem.killCount < 100) {
							mmem.e = Math.max(mmem.e - 1, 0)
						}
						mmem.killCount = 0
						mmem.escalated = 0					
					}
				}
			}
		}
		super.tick();
	}

	requestSpawns() {
		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		var spawn = spawns[0];

		let e = this.memory.e;

		if (this.memory.e == 0) {
			e = 0.5;
		}

		let eCap = parentRoom.energyCapacityAvailable

		// This is all a bit hacked. Attack/heal kinda sucks if not paired and my ranged guys want to have heal

		// Escalating engagment.
		// let maxCountA = Math.min(Math.floor(eCap / (1 * 80 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));
		let maxCountR = Math.min(Math.floor(eCap / (1 * 150 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));
		// let maxCountH = Math.min(Math.floor(eCap / (1 * 250 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));

		// let eCountA = Math.round(e * 714 / 130);
		let eCountR = Math.round(3 * e * 699 / 200);
		// let eCountH = Math.round(e * 749 / 300);

		let hostilePartsA = Memory.rooms[this.memory.targetRoomName] ? (Memory.rooms[this.memory.targetRoomName].creepCombatPartsAttack || 0) : 0;
		let hostilePartsR = Memory.rooms[this.memory.targetRoomName] ? (Memory.rooms[this.memory.targetRoomName].creepCombatPartsRanged || 0) : 0;
		let hostilePartsH = Memory.rooms[this.memory.targetRoomName] ? (Memory.rooms[this.memory.targetRoomName].creepCombatPartsHeal || 0) : 0;

		let targetPartsA = 0//Math.max(eCountA, hostilePartsA);
		let targetPartsR = Math.max(eCountR, hostilePartsR);
		let targetPartsH = 0//Math.max(eCountH, hostilePartsH);

		let numSpawnsA = 0//Math.ceil(targetPartsA / maxCountA);
		let numSpawnsR = Math.ceil(targetPartsR / maxCountR);
		let numSpawnsH = 0//Math.ceil(targetPartsH / maxCountH);

		let countA = 0//Math.min(targetPartsA, maxCountA);
		let countR = Math.min(targetPartsR, maxCountR);
		let countH = 0//Math.min(targetPartsH, maxCountH);

		console.log("CRD count, num", countA, numSpawnsA, countR, numSpawnsR, countH, numSpawnsH, this.memory.sourceRoomName, this.memory.childRoomName, this.memory.targetRoomName)

		if (!Game.rooms[this.memory.sourceRoomName].canSupportBodyCount(countA * numSpawnsA + countR * numSpawnsR + countH * numSpawnsH)) {
			return;
		}

		if (countA && countR && countH) {
			// let bodyA = [];
			let bodyR = [];
			// let bodyH = [];

			// for (var i = 0; i < Math.floor(countA / 2); i++) {
			// 	bodyA.push(ATTACK)
			// }
			// for (var i = 0; i < countA - 1; i++) {
			// 	bodyA.push(MOVE)
			// }
			// for (var i = 0; i < Math.ceil(countA / 2); i++) {
			// 	bodyA.push(ATTACK)
			// }
			// bodyA.push(MOVE)

			bodyR = creepCreator.getDesignForEnergyCap("ranged", Math.min(eCap, targetPartsR * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])), false, false, false, {})

			// for (var i = 0; i < countR; i++) {
			// 	bodyR.push(RANGED_ATTACK)
			// }
			// for (var i = 0; i < countR; i++) {
			// 	bodyR.push(MOVE)
			// }

			// for (var i = 0; i < countH - 1; i++) {
			// 	bodyH.push(MOVE)
			// }
			// for (var i = 0; i < countH; i++) {
			// 	bodyH.push(HEAL)
			// }
			// bodyH.push(MOVE)

			let minTLL = 1100

			// for (var i = 0; i < numSpawnsA; i++) {
			// 	var idleCreepA = idleCreepManager.getIdleCreepForBody(bodyA, parentRoom, false, minTLL);
			// 	if (idleCreepA && idleCreepA.ticksToLive >= minTLL) {
			// 		this.assignCreep(idleCreepA);
			// 	}
			// 	else {
			// 		this.spawnCreep("tank", bodyA, {}, spawn)
			// 	}
			// }

			for (var i = 0; i < numSpawnsR; i++) {
				var idleCreepR = idleCreepManager.getIdleCreepForBody(bodyR, parentRoom, false, minTLL);
				if (idleCreepR && idleCreepR.ticksToLive >= minTLL) {
					this.assignCreep(idleCreepR);
				}
				else {
					this.spawnCreep("ranged", bodyR, {}, spawn)
				}
			}

			// for (var i = 0; i < numSpawnsH; i++) {
			// 	var idleCreepH = idleCreepManager.getIdleCreepForBody(bodyH, parentRoom, false, minTLL);
			// 	if (idleCreepH && idleCreepH.ticksToLive >= minTLL) {
			// 		this.assignCreep(idleCreepH);
			// 	}
			// 	else {
			// 		this.spawnCreep("healer", bodyH, {}, spawn)
			// 	}
			// }
			return true
		}

	}


	spawnCreep(role, body, boosts, spawn) {
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.childRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
		creep.memory.fallbackRoom = this.memory.childRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
	get childRoomName() {
		return this.memory.childRoomName;
	}
}
module.exports = ChildNeighbourHoldMission