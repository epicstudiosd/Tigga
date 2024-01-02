"use strict";

const Mission = require('missionBase')
// const RoomHeavyCreepRangedHold = require("roomHeavyCreepRangedHold")
const RoomHeavyCreepHold = require("roomHeavyCreepHold")

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');

// Reall this is a room hold not a gap raid... oh well.
class SeasonGapRaidMission extends RoomHeavyCreepHold {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = MISSION_SEASONAL_GAP_RAID;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			// Give it some time
			this.memory.lastCreepInRoom = Game.time
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let maxDist = 15;
		// if (this.memory.targetRoomName == "W7S4") {
		// 	maxDist = 18
		// }
		// if (this.memory.targetRoomName == "W6S20") {
		// 	maxDist = 20
		// }

		if (Game.time - (Memory.combatManager.requestedMissions[this.memory.type][this.memory.targetRoomName] || 0) > 100) {
			return
		}


		if (this.memory.routeCost > maxDist) return		

		let spawn = spawns[0];
			
		let mem = Memory.rooms[this.memory.targetRoomName];

		if (mem && (mem.kd < -1 || mem.owner)) {
			return false
		}

		// if (this.memory.sourceRoomName != "W19S8" && this.memory.sourceRoomName != "W23S14" && this.memory.sourceRoomName != "W12S3" && this.memory.targetRoomName == "W6S20") {
		// 	console.log("Gap raids must be from W19S8 or W23S14 or W12S3")
		// 	return false
		// }

		// Grandfathering
		this.memory.lastCreepInRoom = this.memory.lastCreepInRoom || Game.time

		if (Game.time - this.memory.lastCreepInRoom > 2000) {
			console.log("Gap raid not reaching room", this.memory.lastCreepInRoom, this.memory.targetRoomName)			
			return false	
		}



		// else if (this.memory.sourceRoomName != "W19S8" && this.memory.sourceRoomName != "W12S3" && this.memory.targetRoomName == "W7S0") {
		// 	console.log("Gap raids must be from W19S8 or W12S3")
		// 	return false
		// }

		// if (this.memory.targetRoomName == "W6S20") {
		// 	console.log("------------ Disabled gap raid for W6S20")
		// 	return false

		// }

		let hostileRangedParts = 0;
		let hostileHealParts = 0;

		if (Game.rooms[this.memory.targetRoomName]) {
			let hostileCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK, ATTACK, HEAL], false);
			for (let creep of hostileCreeps) {
				hostileRangedParts += creep.getBoostModifiedCombatParts(false).numRanged + creep.getBoostModifiedCombatParts(false).numAttack;
				hostileHealParts += creep.getBoostModifiedCombatParts(false).numHeal;
			}
		}
		else if (mem) {
			hostileRangedParts = (mem.creepCombatPartsRanged || 0) + (mem.creepCombatPartsAttack || 0)
			hostileHealParts = mem.creepCombatPartsHeal || 0
		}

		hostileRangedParts = Math.min(hostileRangedParts, Math.round(hostileHealParts * 0.5))


		hostileRangedParts = Math.max(1, hostileRangedParts);
		// Got to kill some transposts or something. Better actually kill them.
		// This is heal because we build to overcome heal
		hostileHealParts = Math.max(6, hostileHealParts);

		let maxCreeps = Math.max(1, Math.min(Memory.empireStrength / 2, 3))

		let rambo
		let numRambos
		for (numRambos = 1; numRambos <= maxCreeps; numRambos++) {		

			rambo = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], 0, 0, Math.ceil(hostileRangedParts / numRambos), Math.ceil(hostileHealParts / numRambos), false, 0, true)
			if (rambo.body.length) {
				break;
			}
			if (Object.keys(rambo.boosts).length) {
				console.log("ForceNoBoosts set but rambo has boosts?")
				return false
			}
		}
		if (mem && mem.DT < 0.03) {
			numRambos = 1
		}


		if (rambo && rambo.body.length > 0) {
			if (numRambos >= 3) {
				// Spawn a tank-healer.
				let healer = creepCreator.createBestHeal(parentRoom, 0, false, false)
				let tank = creepCreator.createBestTank(parentRoom, false, false)
				if (healer.body.length && tank.body.length) {
					let formationCreepNames = [];
					let creepMemory = {targetRoom: this.memory.targetRoomName};

					formationCreepNames.push(super.spawnCreep("ranged", healer.body, healer.boosts, spawn, _.clone(creepMemory)));
					formationCreepNames.push(super.spawnCreep("tank", tank.body, tank.boosts, spawn, _.clone(creepMemory)));
					this.memory.formations.push(formationCreepNames);

					numRambos -= 2;
				}

			}
			for (let i = 0; i < numRambos; i++) {				
				console.log("RAMBO spawning for gap raid", this.memory.targetRoomName)
				// role, body, boosts, spawn, extraMemory
				this.spawnCreep("ranged", rambo.body, rambo.boosts, spawn, {attackPower: 0, targetRoom: this.memory.targetRoomName})
			}

			return true
		}
		else {
			console.log("Can't spawn enough rambos", hostileRangedParts, hostileHealParts, maxCreeps)
		}

		return false
	}


	tick() {
		// Grandfathering
		this.memory.formations = this.memory.formations || []

		for (let creepName of this.memory.assignedCreeps) {
			if (Game.creeps[creepName] && Game.creeps[creepName].room.name != this.memory.targetRoomName) {
				let sectorCoords = util.getSectorCoords(Game.creeps[creepName].room.name)
				if (sectorCoords.x == 0 || sectorCoords.y == 0) {
					Game.creeps[creepName].ignoreCivilians = 1
					if (Game.creeps[creepName].room.dangerous && Game.time - (Game.creeps[creepName].mem.pIncompleteTick || 0) < 10) {
						Game.creeps[creepName].ignoreEnemies = 1
					}
				}
				else {
					let anythingUsefulToShoot = false
					for (let hostile of Game.creeps[creepName].room.find(FIND_HOSTILE_CREEPS)) {
						// If their score haulers start carrying energy I'll look stupid
						if (hostile.store.getCapacity() && !hostile.store[RESOURCE_ENERGY]) {
							anythingUsefulToShoot = true
							break
						}
					}
					if (!anythingUsefulToShoot) {
						Game.creeps[creepName].ignoreCivilians = 1
					}
					else {
						Game.creeps[creepName].targetCivilians = 1	
					}

					// They have a strong defender which is far, and we don't want to be here
					if (!anythingUsefulToShoot &&
						!Game.creeps[creepName].room.dangerous &&
						Game.creeps[creepName].room.roomStrength && 
						Game.creeps[creepName].room.roomStrength < 1.5 &&
						Game.creeps[creepName].room.find(FIND_MY_CREEPS).length == 1 &&
						!Game.creeps[creepName].pos.findFirstInRange(Game.creeps[creepName].room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false), 5)) {

						Game.creeps[creepName].forceMoveRooms = 1
					}
				}


				Game.creeps[creepName].mem.noAutoIgnoreKeepers = 1
			}
			else if (Game.creeps[creepName] && Game.creeps[creepName].room.name == this.memory.targetRoomName) {
				Game.creeps[creepName].targetCivilians = 1
				this.memory.lastCreepInRoom = Game.time
			}
		}


		super.tick();

		// if (!Memory.rooms[this.memory.sourceRoomName].lootRooms.includes(this.memory.targetRoomName)) {
		// 	Memory.rooms[this.memory.sourceRoomName].lootRooms.push(this.memory.targetRoomName)
		// }
	}
}


module.exports = SeasonGapRaidMission