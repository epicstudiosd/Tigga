"use strict";

const safeRoute = require('safeRoute');
const intelAI = require('intelAI');

const RoomAssaultMission = require('roomAssault')

class RoomHeavyFormationHold extends RoomAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 4;
		memory.mask = [[0,0],[1,0],[0,1],[1,1]];

		memory.type = memory.type || MISSION_ROOM_HEAVY_FORMATION_HOLD;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);
		memory.minHeal = 3600
		this.memory.closeCombat = 1
		this.memory.directional = 1
	}


	shouldKeepFormation() {
		return 1;
	}

	selectCloseCombat() {
		this.memory.closeCombat = 1;
		this.memory.directional = 1
	}

	tick() {
		super.tick()


		let	relaunchCooldown = 1500 - (this.memory.preSpawnOffset || 0) - (this.memory.routeLength || 10) * 50 - 300;

		if (Game.time % 10 == 2 && Game.time - this.memory.lastLaunchTick > relaunchCooldown && 
			Game.time - (Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_FORMATION_HOLD][this.memory.targetRoomName] || 0) < 100 && 
			!this.renewRestricted(this.memory.sourceRoomName) &&
			this.memory.spawningCreeps.length == 0) {
			if (this.requestSpawns(false, true)) {
				// Decay so that damage done a long time ago doesn't matter so much.
				const alpha = Math.exp(-(1/8.));
				this.memory.startWallHP = alpha * this.memory.startWallHP + (1 - alpha) * targetMem.wallHP
				this.memory.startRampHP = alpha * this.memory.startRampHP + (1 - alpha) * targetMem.rampHP
				this.memory.effectiveNumLaunches = alpha * (this.memory.effectiveNumLaunches + 1)


				if (Math.random() < 0.2) {
					this.memory.e--;
				}

				this.memory.lastLaunchTick = Game.time;
				this.memory.numLaunches += 1;
			}
		}
	}

	getBestTarget(squadHeal, formationIdx) {
		let target = super.getBestTarget(squadHeal, formationIdx)

		if (target) {
			return target
		}
		else {
			if (this.memory.formations[formationIdx]) {
				let formation = this.memory.formations[formationIdx];
				for (let creepName of formation) {
					let creep = Game.creeps[creepName];
					if (creep) {
						let enemy = creep.pos.findClosestByRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL]))
						if (enemy) {
							return {s: 1, sh: squadHeal, fIdxTest: formationIdx, x: enemy.pos.x, y: enemy.pos.y}	
						}
						
						break;
					}
				}
				for (let creepName of formation) {
					let creep = Game.creeps[creepName];
					if (creep) {
						let enemy = creep.pos.findClosestByRange(creep.room.find(FIND_HOSTILE_CREEPS))
						if (enemy) {
							return {s: 1, sh: squadHeal, fIdxTest: formationIdx, x: enemy.pos.x, y: enemy.pos.y}	
						}
						
						break;
					}
				}
			}

			return {s: 1, sh: squadHeal, fIdxTest: formationIdx, x: 25, y: 25}
		}
	}

	getMinHealPerTowerNeeded() {
		return 0
	}

	getMaxHealPerTowerNeeded() {
		return 0
	}

	requestSpawns(restrictBoosts, refresh) {
		return super.requestSpawns(false, refresh)
	}



	static requestHeavyFormationHold(targetRoomName, alliesPriority = 0) {
		Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_FORMATION_HOLD][targetRoomName] = Game.time;

		if (!Memory.rooms[targetRoomName]) {
			return 0
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_FORMATION_HOLD]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					mission.alliesPriority = alliesPriority;
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.name == targetRoomName) continue;
			
			if (intelAI.getEnemyRoomSet().has(targetRoomName)) {
				let renewPriority = alliesPriority >= 1
				let lowPriority = alliesPriority < 0.1
				let highPriority = alliesPriority > 0.5 && !renewPriority
				if (Memory.season2 && Memory.rooms[targetRoomName] && Memory.rooms[targetRoomName].owner && Memory.rooms[targetRoomName].owner == "Cub") {

					if (room.restrictOffensiveMissions(undefined, renewPriority, lowPriority, highPriority)) {
						continue;
					}
				}
				else {					
					if (room.restrictOffensiveMissions(targetRoomName, renewPriority, lowPriority, highPriority)) {
						continue;
					}
				}
			}
			else {				
				if (room.restrictDefensiveMissions(false, true, false)) {
					continue;
				}
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, true)
			let score = dist - room.effectiveLevel * 4;

			// console.log(room, dist, score)

			if (dist < 15 && score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_FORMATION_HOLD]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			// constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission) {
			let currentMission = new RoomHeavyFormationHold(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, 0, alliesPriority)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns(false, alliesPriority >= 1);

				if (!spawnSuccessful) {
					console.log("Heavy creep formation spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching heavy formation hold to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_FORMATION_HOLD].push(currentMission.memory);
				return
			}
			console.log("Heavy creep formation activate failed " + targetRoomName)
			return
		}
		else {
			console.log("Heavy creep formation no spawn room to " + targetRoomName)
		}
	}

}


module.exports = RoomHeavyFormationHold