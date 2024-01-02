"use strict";

const Mission = require('missionBase')
const RoomHeavyCreepRangedHold = require("roomHeavyCreepRangedHold")

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');

class SeasonDropRaidMission extends RoomHeavyCreepRangedHold {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_SEASONAL_DROP_RAID;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];
			
		let mem = Memory.rooms[this.memory.targetRoomName];

		if (mem.kd < -1) {
			return false
		}


		if (this.memory.targetRoomName == "E20S20" || this.memory.targetRoomName == "E20S10" || this.memory.targetRoomName == "E30S10" || this.memory.targetRoomName == "E30S0" || this.memory.targetRoomName == "E30N0" || this.memory.targetRoomName == "E20S40") {
			return false
		}


		let hostileRangedParts = 0;
		let hostileHealParts = 0;

		if (Game.rooms[this.memory.targetRoomName]) {
			let hostileCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK, HEAL], false);
			for (let creep of hostileCreeps) {
				hostileRangedParts += creep.getBoostModifiedCombatParts(false).numRanged;
				hostileHealParts += creep.getBoostModifiedCombatParts(false).numHeal;
			}
		}
		else {
			hostileRangedParts = mem.creepCombatPartsRanged || 0
			hostileHealParts = mem.creepCombatPartsHeal || 0
		}

		hostileRangedParts = Math.min(hostileRangedParts, hostileHealParts * 2)


		hostileRangedParts = Math.max(2, hostileRangedParts);
		// Got to kill some transposts or something. Better actually kill them.
		// This is heal because we build to overcome heal
		hostileHealParts = Math.max(5, hostileHealParts);

		let maxCreeps = Math.min(Memory.empireStrength / 2, 3)

		let rambo
		let numRambos
		for (numRambos = 1; numRambos <= maxCreeps; numRambos++) {		

			rambo = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName], 0, 0, Math.ceil(hostileRangedParts / numRambos), Math.ceil(hostileHealParts / numRambos), false, 0, true)
			if (rambo.body.length) {
				break;
			}
		}

		if (rambo.body.length > 0) {
			if (Memory.rooms[this.memory.targetRoomName].DT > 0.03) {
				for (let i = 0; i < numRambos; i++) {				
					console.log("RAMBO spawning for resource raid", this.memory.targetRoomName)
					// role, body, boosts, spawn, extraMemory
					this.spawnCreep("ranged", rambo.body, rambo.boosts, spawn, {attackPower: 0, targetRoom: this.memory.targetRoomName})
				}
			}

			if (mem.seasonDropOffAvailable) {				
				let raiderBody = creepCreator.getDesignForEnergyCap("raiderHauler", Math.max(300, parentRoom.energyCapacityAvailable * Math.min(1, Memory.rooms[this.memory.targetRoomName].DT)), false, false, false)
				this.spawnCreep("raiderHauler", raiderBody, {}, spawn, {targetRoom: this.memory.targetRoomName})
				if (Memory.rooms[this.memory.targetRoomName].DT > 0.01) {
					let raiderBody = creepCreator.getDesignForEnergyCap("raiderRoaming", Math.max(300, parentRoom.energyCapacityAvailable * Math.min(1, Memory.rooms[this.memory.targetRoomName].DT)), false, false, false)				
					this.spawnCreep("raiderRoaming", raiderBody, {}, spawn, {targetRoom: this.memory.targetRoomName})
				}
				if (Memory.rooms[this.memory.targetRoomName].DT > 0.02) {
					let raiderBody = creepCreator.getDesignForEnergyCap("raiderClose", Math.max(300, parentRoom.energyCapacityAvailable * Math.min(1, Memory.rooms[this.memory.targetRoomName].DT)), false, false, false)
					this.spawnCreep("raiderClose", raiderBody, {}, spawn, {targetRoom: this.memory.targetRoomName})
				}
			}

			return true
		}
		else {
			console.log("Can't spawn enough rambos")
		}

		return false
	}


	tick() {
		super.tick();

		// if (!Memory.rooms[this.memory.sourceRoomName].lootRooms.includes(this.memory.targetRoomName)) {
		// 	Memory.rooms[this.memory.sourceRoomName].lootRooms.push(this.memory.targetRoomName)
		// }
	}
}


module.exports = SeasonDropRaidMission