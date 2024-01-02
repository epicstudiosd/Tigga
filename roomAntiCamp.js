"use strict";

const idleCreepManager = require('idleCreepManager')
const Mission = require('missionBase')
const safeRoute = require('safeRoute');
const creepCreator = require('creepCreator');

const mapVisuals = require("mapVisuals")



class RoomAntiCampMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_ROOM_ANTICAMP;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.fRefreshRate = 10000;
			memory.targetRoomName = targetRoomName;

			memory.startHostileRanged = Memory.rooms[targetRoomName].creepCombatPartsRanged || 0;
			memory.startHostileHeal = Memory.rooms[targetRoomName].creepCombatPartsHeal || 0;
			memory.startHostileAttack = Memory.rooms[targetRoomName].creepCombatPartsAttack || 0;

			memory.targetHostileRanged = memory.startHostileRanged
			memory.targetHostileHeal = memory.startHostileHeal
			memory.targetHostileAttack = memory.startHostileAttack

			memory.routeCost = Math.round(safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) * 10) / 10
		}
	}

	grabExtraCreeps(roomName) {
		for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && (Math.random() > .25 || Game.creeps[idleCreep].ticksToLive < 200)) {
				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, false);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep]);
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}
	}

	tick() {
		if (this.isActive()) {
			if (Game.map.visual) mapVisuals.get().text("⛺", new RoomPosition(40, 25, this.memory.targetRoomName), {fontSize: 10})
			// mapVisuals.get().text("", new RoomPosition(25, 25, this.memory.targetRoomName), {fontSize: 15})


			if (this.memory.assignedCreeps.length) {
				this.memory.pending = 0;
				for (let creepName of this.memory.assignedCreeps) {
					if (Memory.creeps[creepName]) {
						Memory.creeps[creepName].retreat = false;
					}
				}
			}

			if (Game.rooms[this.memory.targetRoomName]) {
				if (!Game.rooms[this.memory.targetRoomName].dangerous) {
					if (!this.memory.clearedOnce) {
						this.memory.targetHostileRanged = 0;
						this.memory.targetHostileHeal = 0;
						this.memory.targetHostileAttack = 0;
					}
					this.memory.clearedOnce = 1;
				}
			}

			if (/*this.memory.clearedOnce &&*/ Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].dangerous) {
				// Get the most dangerous point in time. We'll respawn to deal with min(2x that, starting point).
				let creepCombatPartsRanged = 0;
				let creepCombatPartsHeal = 0;
				let creepCombatPartsAttack = 0;
				for (let creep of (Game.rooms[this.memory.targetRoomName].humanTargets || [])) {
					var combatParts = creep.getBoostModifiedCombatParts(false, true);
					creepCombatPartsRanged += combatParts.numRanged;
					creepCombatPartsHeal += combatParts.numHeal;
					creepCombatPartsAttack += combatParts.numAttack;
				}

				// This used to be 2x. I don't think that was needed
				// Pessimism, that and we only spawn to deal with 0.75x of this.
				// creepCombatPartsRanged *= 1.25;
				// creepCombatPartsHeal *= 1.25;
				if (creepCombatPartsRanged > this.memory.targetHostileRanged || creepCombatPartsHeal > this.memory.targetHostileHeal) {
					this.memory.dontNeedHelp = 0
				}

				this.memory.targetHostileRanged = Math.max(this.memory.targetHostileRanged, creepCombatPartsRanged)
				this.memory.targetHostileHeal = Math.max(this.memory.targetHostileHeal, creepCombatPartsHeal)
				this.memory.targetHostileAttack = Math.max(this.memory.targetHostileAttack, creepCombatPartsAttack)
			}

			// Relaunch
			if (Game.time - this.memory.lastLaunchTick > 1500 - this.memory.routeCost * 50 - 200 &&
				// this.memory.clearedOnce &&
				(this.memory.targetHostileRanged || this.memory.targetHostileAttack) &&
				this.memory.targetHostileHeal &&
				Game.rooms[this.memory.targetRoomName] && !Game.rooms[this.memory.targetRoomName].dangerous) {

				var effectiveTeam = false;
				for (var creepName of this.memory.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						if (creep.hasActiveBodypart(RANGED_ATTACK)) {
							effectiveTeam = true;
							break;
						}
					}
				}

				if (effectiveTeam && !this.renewRestricted()) {
					if (this.requestSpawns()) {
						this.memory.clearedOnce = 0;
						this.memory.numLaunches += 1;
						this.memory.lastLaunchTick = Game.time;
					}
				}

			}

			if (this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) {
				if (Game.time - this.memory.lastLaunchTick < 500) {
					this.memory.fTick = Game.time;
					this.memory.f++;
					this.missionComplete(false);
				}
				else if (Game.time - this.memory.lastLaunchTick < 1400) {
					this.memory.f++;
					this.missionComplete(false);
				}
				else {
					this.memory.s++;
					this.missionComplete(true);
				}
				return;
			}
		}
		super.tick();
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]

		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return false;

		let mem = Memory.rooms[this.memory.targetRoomName];

		if (mem && mem.kd < -1) {
			return false
		}

		if (Memory.season2 && Game.time < 1618227 + 3000) {
			return false
		}

		let spawn = spawns[0];

		let maxCreeps = Math.min(Memory.empireStrength / 2, 3)

		// TODO. Anticamp for no boosts
		let forceNoBoosts = false;
		if (Memory.empireStrength < 10) {
			if (!Memory.season1 || !mem.seasonDropOffAvailable) {
				forceNoBoosts = true
			}
		}

		let numOtherMissions = 0

		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_ANTICAMP]) {
			if (mission.targetRoomName == this.memory.targetRoomName) {
				if (mission.ID && mission.ID != this.memory.ID) {
					numOtherMissions++;
					if (mission.dontNeedHelp) {
						return false
					}
				}
			}
		}


		for (let i = 1; i <= maxCreeps; i++) {		
			let div = i + numOtherMissions * maxCreeps;

			let targetHostileRanged = this.memory.targetHostileRanged + this.memory.targetHostileAttack
			let targetHostileHeal = this.memory.targetHostileHeal

			// Up to 1.25x based on failing
			if (this.memory.s || this.memory.f) {				
				targetHostileHeal 	*= 1 + 0.25 * (this.memory.f || 0) / ((this.memory.s || 0) + (this.memory.f || 0))
				targetHostileRanged *= 1 + 0.25 * (this.memory.f || 0) / ((this.memory.s || 0) + (this.memory.f || 0))
			}

			// Don't overspawn. If the other missions can create enough of the right strength, then let them
			if (numOtherMissions) {
				let ret = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], 0, 0, Math.ceil(targetHostileRanged / (numOtherMissions * maxCreeps), Math.ceil(targetHostileHeal / (numOtherMissions * maxCreeps)), maxCreeps >= 3, undefined, forceNoBoosts))
				if (ret.body.length > 0) {
					return false
				}
			}

			// If we're spawning more than 2, max 'em out
			let forceMaxSize = div >= 3;

			let ret = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], 0, 0, Math.ceil(targetHostileRanged / div), Math.ceil(targetHostileHeal / div), forceMaxSize, undefined, forceNoBoosts)

			if (ret.body.length > 0) {
				if (numOtherMissions == 0 && i < maxCreeps) {
					this.memory.dontNeedHelp = 1
				}
				else {
					this.memory.dontNeedHelp = 0	
				}

				for (let j = 0; j < i; j++) {					
					console.log(this.memory.type, "RAMBO spawning for", this.memory.targetRoomName)
					this.spawnCreep("ranged", ret.body, ret.boosts, spawn)
				}

				this.grabExtraCreeps(this.memory.targetRoomName);

				return true
			}
		}

		// Huh, try roping in another room?


	}

	cleanMemory() {
		delete this.memory.startHostileRanged
		delete this.memory.startHostileHeal
		delete this.memory.startHostileAttack

		delete this.memory.targetHostileRanged
		delete this.memory.targetHostileHeal
		delete this.memory.targetHostileAttack

		delete this.memory.routeCost
		delete this.memory.clearedOnce
		
		delete this.memory.numLaunches
		delete this.memory.effectiveNumLaunches

		delete this.memory.dontNeedHelp

		return super.cleanMemory();
	}

	missionComplete(success) {
		this.cleanMemory()

		return super.missionComplete(success)
	}

	spawnCreep(role, body, boosts, spawn) {
		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}
module.exports = RoomAntiCampMission