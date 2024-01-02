"use strict";

const Mission = require('missionBase')

const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const constants = require('constants');

const creepCreator = require('creepCreator');
const roomAI = require('roomAI');

const roomHeavyCreepHold = require("roomHeavyCreepHold");
const roomHeavyCreepRangedHold = require("roomHeavyCreepRangedHold")


class Season5Scoring extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_SEASON_5_SCORING;

		memory.fRefreshRate = 5000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			this.memory.roomRange = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, false);
		}
	}

	renewRestricted() {
		return true
	}

	tick() {
		if (this.isActive()) {
			let mmem = this.memory;
			let mem = Memory.rooms[mmem.targetRoomName];
			mmem.pending = 0;

			if ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) && Game.time - mmem.lastLaunchTick <= 1) {
				// Launch fail
				return this.missionComplete(true);
			}
				
			if (Game.time - mmem.lastLaunchTick > 2000) {
				return this.missionComplete(false);
			}

			if (mem.reactorOwner != util.getMyName()) {
				return this.missionComplete(false);
			}

			let route = safeRoute.findSafeRoute(mmem.sourceRoomName, mmem.targetRoomName)

			if (route && route != ERR_NO_PATH && route.length) {
				for (let step of route) {
					let pathRoomName = step.room;
					if (Memory.rooms[pathRoomName].creepCombatPartsRanged || Memory.rooms[pathRoomName].creepCombatPartsAttack) {
						roomHeavyCreepRangedHold.requestHeavyCreepRangedHold(pathRoomName, 0, true)
					}
				}
			}

			if (mem.reactorAmount < 300) {
				if (this.requestSpawns()) {
					if (mem.reactorAmount == 0) {
						mmem.sub300SpawnTick = Game.time + 500
					}
					else {
						mmem.sub300SpawnTick = Game.time						
					}	
					mmem.sub500SpawnTick = Game.time
					mmem.sub750SpawnTick = Game.time
					mmem.sub900SpawnTick = Game.time
					mmem.anyAmountSpawnTick = Game.time
				}
			} else if (mem.reactorAmount < 500) {
				if (this.requestSpawns()) {
					mmem.sub500SpawnTick = Game.time
					mmem.sub750SpawnTick = Game.time
					mmem.sub900SpawnTick = Game.time
					mmem.anyAmountSpawnTick = Game.time
				}
			} else if (mem.reactorAmount < 750) {
				if (this.requestSpawns()) {
					mmem.sub750SpawnTick = Game.time
					mmem.sub900SpawnTick = Game.time
					mmem.anyAmountSpawnTick = Game.time
				}
			} else if (mem.reactorAmount < 900) {
				if (this.requestSpawns()) {
					mmem.sub900SpawnTick = Game.time
					mmem.anyAmountSpawnTick = Game.time
				}
			} else {
				if (this.requestSpawns()) {
					mmem.anyAmountSpawnTick = Game.time
				}
			}
		}

		

		super.tick();

	}

	requestSpawns() {
		let mmem = this.memory;		

		if (mmem.spawningCreeps.length) {
			return false
		}

		// Need to be able to cover half the tower damage between two of us.
		let parentRoom = Game.rooms[mmem.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		// Probably should genericify this.
		let route = safeRoute.findSafeRoute(mmem.sourceRoomName, mmem.targetRoomName, false, undefined, true);

		if (route && route.length < 10) {	
			let mem = Memory.rooms[mmem.targetRoomName];
			if (mem && mem.reactorOwner != util.getMyName()) {
				return false
			}

			if (mem.reactorAmount < 300 && Game.time - (mmem.sub300SpawnTick || 0) > 500) {
				if (mem.reactorAmount > 0) {
					for (let i = 0; i < 6; i++) {					
						this.spawnCreep("season5ScoreTransport", 
							creepCreator.getDesignForEnergyCap("transporter", Math.min(200, parentRoom.energyCapacityAvailable), false, false, false, {}), 
							{},
							spawn,
							{targetRoom: mmem.targetRoomName})
					}
					mmem.lastLaunchTick = Game.time
					return true
				} 
				else if (Game.time - (mmem.sub300SpawnTick || 0) > 1000) {
					this.spawnCreep("season5ScoreTransport", 
						creepCreator.getDesignForEnergyCap("transporter", Math.min(2000, parentRoom.energyCapacityAvailable), false, false, false, {}), 
						{}, 
						spawn, 
						{targetRoom: mmem.targetRoomName})
					mmem.lastLaunchTick = Game.time
					return true
				}
			}
			else if (mem.reactorAmount && mem.reactorAmount < 500 && Game.time - (mmem.sub500SpawnTick || 0) > 300) {
				this.spawnCreep("season5ScoreTransport", 
					creepCreator.getDesignForEnergyCap("transporter", Math.min(700, parentRoom.energyCapacityAvailable), false, false, false, {}), 
					{}, 
					spawn, 
					{targetRoom: mmem.targetRoomName})
				mmem.lastLaunchTick = Game.time
				return true
			}
			else if (mem.reactorAmount && mem.reactorAmount < 750 && Game.time - (mmem.sub750SpawnTick || 0) > 300) {
				this.spawnCreep("season5ScoreTransport", 
					creepCreator.getDesignForEnergyCap("transporter", Math.min(600, parentRoom.energyCapacityAvailable), false, false, false, {}), 
					{}, 
					spawn, 
					{targetRoom: mmem.targetRoomName})
				mmem.lastLaunchTick = Game.time
				return true
			}
			else if (mem.reactorAmount && mem.reactorAmount < 900 && Game.time - (mmem.sub900SpawnTick || 0) > 300) {
				this.spawnCreep("season5ScoreTransport", 
					creepCreator.getDesignForEnergyCap("transporter", Math.min(500, parentRoom.energyCapacityAvailable), false, false, false, {}), 
					{}, 
					spawn, 
					{targetRoom: mmem.targetRoomName})
				mmem.lastLaunchTick = Game.time
				return true
			}
			else if (mem.reactorAmount && Game.time - (mmem.anyAmountSpawnTick || 0) > 300) {
				this.spawnCreep("season5ScoreTransport", 
					creepCreator.getDesignForEnergyCap("transporter", Math.min(400, parentRoom.energyCapacityAvailable), false, false, false, {}), 
					{}, 
					spawn, 
					{targetRoom: mmem.targetRoomName})
				mmem.lastLaunchTick = Game.time
				return true
			}
			else if (mem.reactorAmount > 900 && 
				Game.time - (mmem.anyAmountSpawnTick || 0) > 150 &&
				Game.time - (mmem.sub900SpawnTick || 0) > 200 &&
				Game.time - (mmem.sub750SpawnTick || 0) > 300 &&
				Game.time - (mmem.sub500SpawnTick || 0) > 400 &&
				Game.time - (mmem.sub300SpawnTick || 0) > 500) {
				this.spawnCreep("season5ScoreTransport", 
					creepCreator.getDesignForEnergyCap("transporter", Math.min(200, parentRoom.energyCapacityAvailable), false, false, false, {}), 
					{}, 
					spawn, 
					{targetRoom: mmem.targetRoomName})
				mmem.lastLaunchTick = Game.time
				return true
			}
			
		}

		return false	
	}

	static request(sourceRoom, targetRoomName) {
		if (!Memory.combatManager.requestedMissions[MISSION_SEASON_5_SCORING][targetRoomName]) {
			Memory.combatManager.requestedMissions[MISSION_SEASON_5_SCORING][targetRoomName] = Game.time;
		}

		if (!Memory.rooms[targetRoomName]) {
			return 0
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASON_5_SCORING]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					return 0;
				}
			}
		}

		let bestSourceRoom = sourceRoom;

		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_SEASON_5_SCORING]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);

			let currentMission = new Season5Scoring(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, 0)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Season5Scoring spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching Season5Scoring to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_SEASON_5_SCORING].push(currentMission.memory);
				return
			}
			console.log("Season5Scoring activate failed ", bestSourceRoom.name, targetRoomName)
			return
		}
		else {
			console.log("Season5Scoring no spawn room to " + targetRoomName)
		}
	}	

}




module.exports = Season5Scoring