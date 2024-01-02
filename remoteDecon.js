"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute')
const util = require('util')



class RemoteDeconMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_REMOTE_DECON;

		let fRefreshMod = 1;
		if (priority !== undefined && priority < 0) {
			fRefreshMod = 0.5;
		}

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority, fRefreshMod);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			// If we fail, don't go back for a bit.
			memory.fRefreshRate = memory.fRefreshRate || 7500;

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
					memory.e = 1;
				}
				else {
					memory.e = Math.floor(sum / cnt);
				}
			}
			else if (cnt && sum / cnt > memory.e) {
				memory.e = Math.round((memory.e + sum / cnt) / 2)
			}

			// Only if we're creating it from zero memory.
			if (!memory.s && !memory.f) {				
				if (priority < 0) {				
					memory.e += Math.ceil(-priority / 10)
				}
			}

		   	memory.rangeHealRatio = memory.rangeHealRatio || 2.;
		   	memory.bodyOrder = memory.bodyOrder || 0;
		   	memory.maxBonusTough = memory.maxBonusTough || 2;

			var exits = Game.map.describeExits(targetRoomName);
			let candidateRooms = [];
			for (var exitDir in exits) {
				var exitRoom = exits[exitDir];

				if (Game.rooms[exitRoom] && Game.rooms[exitRoom].controller && Game.rooms[exitRoom].controller.owner) {
					continue;
				}
				if (!Memory.rooms[exitRoom] || Memory.rooms[exitRoom].owner) {
					continue;
				}

				// Don't tie in with an assault 
				//(why not?? I guess it went wrong some time in the past)
				global.roomAssaultCounts[exitRoom] = global.roomAssaultCounts[exitRoom] || {};
				if (global.roomAssaultCounts[exitRoom].assaultCount) {
					continue;
				}

				if (!Memory.rooms[exitRoom] || (Memory.rooms[exitRoom].numStructures || 0) < 15) continue;

				if (Game.map.getRoomLinearDistance(sourceRoomName, exitRoom) >= 12)  {
					continue;
				}
				if (Memory.usedRemotes.includes(exitRoom)) {
					continue;
				}

				var routeCost = safeRoute.getSafeRouteCost(sourceRoomName, exitRoom, true);
				if (routeCost > 3 && routeCost < 12) {
					candidateRooms.push(exitRoom);
				}
			}

			if (candidateRooms.length == 0) {
				// console.log("No candidateRooms rooms for decon", sourceRoomName, targetRoomName)
				// memory.fTick = Game.time;
				this.missionComplete(true);
			}
			else {
				// De-escalate from time to time
				if (memory.e && Math.random() > 0.9) {
					memory.e--;
				}

				memory.deconRoom = _.sample(candidateRooms);
			}
		}
	}

	grabExtraCreeps(roomName) {
		for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && Math.random() > .5 && (Game.creeps[idleCreep].hasActiveBodypart(RANGED_ATTACK) || Game.creeps[idleCreep].hasActiveBodypart(ATTACK)) && Game.creeps[idleCreep].hasActiveBodypart(HEAL)) {
				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, true);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep]);
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}
	}


	getRandomRangedHealRatio() {
		// 2. is what we start with.
		let minRatio = 1.5; // 3:2
		let maxRatio = 5; // 5:1

		return Math.round((1.5 + Math.random() * (5 - 1.5) * 100)) / 100;
	}

	getRandomBodyOrder() {
		// 0 == RA first
		// 1 == Half move first
		// 2 == Move First
		return _.sample([0, 0, 0, 1, 1, 2]);
	}

	getRandomMaxBonusTough() {
		return _.sample([0, 1, 1, 2, 2, 2, 3, 3, 4]);
	}

	tick() {
		let mmem = this.memory;
		if (this.isActive()) {
			// if (!mmem.pending) {
			// 	var room = Game.rooms[mmem.deconRoom];
			// 	if (room) {
			// 		mmem.killCount += room.killCount
			// 	}
			// }

			if (Math.random() < 0.01 && mmem.killCount > 0) {
				this.grabExtraCreeps(mmem.pending ? mmem.sourceRoomName : mmem.targetRoomName);
			}
		}
		if (this.isActive() && ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) || Game.time - mmem.lastLaunchTick > 2000 || (Memory.rooms[mmem.deconRoom].numStructures || 0) == 0)) {
			// Completion should be "we're all dead".
			// I think if it's a long time since the start and we're all dead, we can call it a success as we've probably timed out.
			// If it's not many ticks, we've probably died and that's probably a fail.
			// We also want to see action. We're going to count the number of unique creeps we see. If we don't see many we've not had much impact.
			if (Game.time - mmem.lastLaunchTick > 1450 || (Memory.rooms[mmem.deconRoom].numStructures || 0) == 0) {
				mmem.s++;

				// De-escalate if no kills.
				if (mmem.killCount == 0) {
					mmem.e = Math.max(mmem.e - 1, 0)
				}
				return this.missionComplete(true);
			}
			else if (Game.time - mmem.lastLaunchTick < 1200) {
				console.log("Decon Fail")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.deconRoom)
				console.log(mmem.killCount, mmem.bC, mmem.numLaunches)
				console.log(mmem.targetRoomName, mmem.e)

				mmem.f++;
				// Only escalate if we think we saw interesting stuff and can build a beefier creep, otherwise take a nap
				if (Game.time - mmem.lastLaunchTick < 950) {
					mmem.rangeHealRatio = this.getRandomRangedHealRatio();
					mmem.bodyOrder = this.getRandomBodyOrder();
					mmem.maxBonusTough = this.getRandomMaxBonusTough();

					if (mmem.e < Math.round((Memory.rooms[mmem.targetRoomName].rcl || 0) / 2)) {
						mmem.e = Math.round((Memory.rooms[mmem.targetRoomName].rcl || 0) / 2);
					}

					if (Game.rooms[mmem.sourceRoomName].energyCapacityAvailable >= (mmem.e + 1) * 700 && (mmem.e + 1) * 4 <= MAX_CREEP_SIZE) {
						mmem.e += (mmem.p < 0 ? 2 : 1);
						if (this.getSuccessRate() < 0.5) {
							mmem.e++;
						}
						// Wait for the guys who killed me to despawn.
						mmem.fRefreshRate = 1400;
						mmem.fTick = Game.time;
					}
					else {
						mmem.fRefreshRate = 10000;
						mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
						mmem.fTick = Game.time;
					}
				}
				else {
					mmem.fRefreshRate = 7500;
					mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
					mmem.fTick = Game.time;
				}
				return this.missionComplete(false);

			}
			return this.missionComplete(false);
		}
		// Need moar. If our guys are still alive and they've got stuff left to remove
		else if (Game.time - mmem.lastLaunchTick >= 1200 &&
				 mmem.spawningCreeps.length == 0 &&
				 Game.time % 10 == 0 &&
				 Game.rooms[mmem.deconRoom] &&
				 (Memory.rooms[mmem.deconRoom].numStructures || 0) > 10) {

			/*let numStructures = Game.rooms[mmem.deconRoom].find(FIND_STRUCTURES, {
				filter: (structure) => {
					return (structure.structureType == STRUCTURE_ROAD || structure.structureType == STRUCTURE_CONTAINER);
				}
			}).length;

			if (numStructures > 0) {
				Memory.rooms[mmem.deconRoom].numStructures = numStructures;
			}
			else {
				delete Memory.rooms[mmem.deconRoom].numStructures
			}*/

			if ((Memory.rooms[mmem.deconRoom].kd || 0) > -0.5 &&
				!this.renewRestricted()) {
				// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
				// spawning in thinking life is going well.
				var effectiveTeam = false;
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						if (creep.hasActiveBodypart(RANGED_ATTACK)) {
							effectiveTeam = true;
							break;
						}
					}
				}
				if (effectiveTeam && Memory.rooms[mmem.deconRoom].reservedBy != util.getMyName()) {
					global.roomAssaultCounts[mmem.targetRoomName] = global.roomAssaultCounts[mmem.targetRoomName] || {};
					if (!global.roomAssaultCounts[mmem.targetRoomName].assaultCount) {
						console.log(mmem.sourceRoomName, "relaunching decon against", mmem.targetRoomName, "e", mmem.e)
						console.log(mmem.killCount, mmem.bC, mmem.numLaunches)
						// Attenuate the kill count & cost. If we don't do that we could hit the case where we have 5 good launches we persist through 5 bad ones.
						mmem.killCount /= 2;
						mmem.bC /= 2;
						mmem.numLaunches += 1;

						mmem.lastLaunchTick = Game.time;

						this.requestSpawns();
					}
				}
			}
		}

		super.tick();
	}


	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		let body = [];

		let e = this.memory.e;

		if (this.memory.p < 0) {
			e *= 1.2;
		}

		if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
			Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += e / 10
		}


		// Build a body based on this ratio for (this.memory.e + 1) * 700 energy.
		let targetRanged = 1;
		let targetHeal = 1;
		let cost = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[HEAL] + 2 * BODYPART_COST[MOVE];
		let maxCost = Math.min(parentRoom.energyCapacityAvailable, e * 700 + cost);

		while ((targetRanged + targetHeal) * 2 < MAX_CREEP_SIZE) {
			let ratio = targetRanged / targetHeal;
			if (ratio < this.memory.rangeHealRatio) {
				let newCost = cost + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
				if (newCost <= maxCost) {
					cost = newCost;
					targetRanged++;
				}
				else {
					break;
				}
			}
			else {
				let newCost = cost + BODYPART_COST[HEAL] + BODYPART_COST[MOVE];
				if (newCost <= maxCost) {
					cost = newCost;
					targetHeal++;
				}
				else {
					// Just plug on another RA. Why not.
					newCost = cost + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
					if (newCost <= maxCost) {
						cost = newCost;
						targetRanged++;
					}
					break;
				}
			}
		}

		let bonusCarry = 0;
		if (parentRoom.memory.spawnUtilization < 0.9) {
			while (cost <= maxCost - BODYPART_COST[MOVE] && bonusCarry < this.memory.maxBonusTough && (targetRanged + targetHeal) * 2 + bonusCarry < MAX_CREEP_SIZE) {
				bonusCarry += 1;
				cost += BODYPART_COST[MOVE];
			}
		}

		let bigRanged = (targetRanged + targetHeal) * 4 + bonusCarry * 2 <= MAX_CREEP_SIZE && cost <= Math.floor(parentRoom.energyCapacityAvailable / 2);

		if (bigRanged) {
			bonusCarry *= 2;
			targetRanged *= 2;
			targetHeal *= 2;
		}

		for (let i = 0; i < bonusCarry; i++) {
			body.push(MOVE)
		}

		if (this.memory.bodyOrder == 0) {
			for (let i = 0; i < targetRanged; i++) {
				body.push(RANGED_ATTACK)
			}
			for (let i = 0; i < targetRanged + targetHeal - 1; i++) {
				body.push(MOVE)
			}
			for (let i = 0; i < targetHeal; i++) {
				body.push(HEAL)
			}

			body.push(MOVE)
		}
		else if (this.memory.bodyOrder == 1) {
			for (let i = 0; i < Math.floor((targetRanged + targetHeal) / 2); i++) {
				body.push(MOVE)
			}
			for (let i = 0; i < targetRanged; i++) {
				body.push(RANGED_ATTACK)
			}
			for (let i = 0; i < Math.ceil((targetRanged + targetHeal) / 2) - 1; i++) {
				body.push(MOVE)
			}
			for (let i = 0; i < targetHeal; i++) {
				body.push(HEAL)
			}

			body.push(MOVE)
		}
		else if (this.memory.bodyOrder == 2) {
			for (let i = 0; i < targetRanged + targetHeal - 1; i++) {
				body.push(MOVE)
			}
			for (let i = 0; i < targetRanged; i++) {
				body.push(RANGED_ATTACK)
			}
			for (let i = 0; i < targetHeal; i++) {
				body.push(HEAL)
			}

			body.push(MOVE)
		}

		for (let i = 0; i < (bigRanged ? 1 : 2); i++) {
			let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

			if (idleCreep && idleCreep.ticksToLive > 1100) {
				this.assignCreep(idleCreep);
			}
			else {
				this.spawnCreep("ranged", body, {}, spawn)
			}
		}

		body = []
		let numHeal = Math.min(Math.floor(maxCost / 300), MAX_CREEP_SIZE / 2)

		for (let i = 0; i < numHeal - 1; i++) {
			body.push(MOVE)
		}
		for (let i = 0; i < numHeal; i++) {
			body.push(HEAL)
		}

		body.push(MOVE)

		let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

		if (idleCreep && idleCreep.ticksToLive > 1100) {
			this.assignCreep(idleCreep);
		}
		else {
			this.spawnCreep("healer", body, {}, spawn)
		}


		body = []
		let numAttack = Math.min(Math.floor(maxCost / 130), MAX_CREEP_SIZE / 2)

		for (let i = 0; i < numAttack; i++) {
			body.push(ATTACK)
		}
		for (let i = 0; i < numAttack; i++) {
			body.push(MOVE)
		}

		idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

		if (idleCreep && idleCreep.ticksToLive > 1100) {
			this.assignCreep(idleCreep);
		}
		else {
			this.spawnCreep("tank", body, {}, spawn)
		}

		let maxCount = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (2 * 150)), Math.floor(MAX_CREEP_SIZE / 2));
		let eCount = this.memory.e == 0 ? 1 : this.memory.e * 2.5;
		let count = Math.min(eCount, maxCount);

		body = [];
		for (let i = 0; i < count; i++) {
			body.push(WORK)
		}
		for (let i = 0; i < count; i++) {
			body.push(MOVE)
		}

		for (let i = 0; i < 2; i++) {
			let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

			if (idleCreep && idleCreep.ticksToLive > 1100) {
				this.assignCreep(idleCreep);
			}
			else {
				this.spawnCreep("deconstructor", body, {}, spawn)
			}
		}


		if (!Memory.rooms[this.memory.deconRoom].unexposedController &&
			global.totalRooms && Game.myRooms.length < global.totalRooms &&
			parentRoom.effectiveLevel == 8 &&
			safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.deconRoom, true) * 50 < (Memory.rooms[this.memory.deconRoom].reservedBy ? 0.5 : 0.8) * CREEP_CLAIM_LIFE_TIME) {
			// Game.notify("Claimer remote decon " + this.memory.sourceRoomName + " " + this.memory.deconRoom + " " + safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.deconRoom, true))
			// Game.notify("Claimer spawning")
			Memory.rooms[this.memory.deconRoom].clearRoomClaim = Game.time;

			let bC = BODYPART_COST[CLAIM] + 5 * BODYPART_COST[MOVE]
			let body = [];
			let bodySize = Math.min(Math.floor(MAX_CREEP_SIZE / 6), Math.max(1, Math.min(e, (Memory.rooms[this.memory.deconRoom].reserveTicksToEnd || 0) / 250, Math.floor(parentRoom.energyCapacityAvailable / bC))))

			for (let i = 0; i < bodySize; i++) {
				body.push(CLAIM)
			}
			for (let i = 0; i < bodySize * 5; i++) {
				body.push(MOVE)
			}

			this.spawnCreep("claimer", body, {}, spawn)
		}

		this.grabExtraCreeps(this.memory.sourceRoomName);
		return true
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.deconRoom
	}

	spawnCreep(role, body, boosts, spawn) {
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.deconRoom, fallbackRoom: this.memory.sourceRoomName})
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}


module.exports = RemoteDeconMission