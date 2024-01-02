"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const intelAI = require('intelAI');

const creepCreator = require('creepCreator');


class RoomHeavyCreepRangedHold extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority, alliesPriority, longRange) {
		memory.type = memory.type || MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true)

			memory.interestingCreepsSeenTotal = [];
			memory.alliesPriority = alliesPriority || 0

			if (intelAI.getEnemyRoomSet().has(targetRoomName)) {
				memory.enemyRoomAttack = 1;
			}
			if (Game.rooms[targetRoomName] && Game.myRooms.includes(Game.rooms[targetRoomName])) {
				memory.myRoomHold = 1;
			}

			memory.killCount = 0
			memory.longRange = longRange
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		if (this.memory.routeCost > (this.memory.longRange ? 20 : 15)) {
			console.log(this.memory.type, "not spawning due to range", this.memory.routeCost)
			return
		}



		let spawn = spawns[0];		
		let mem = Memory.rooms[this.memory.targetRoomName];
		let formationCreepNames = [];

		let creepMemory = {targetRoom: this.memory.targetRoomName};

		let myRoomHeavyDefense = this.memory.myRoomHold && Memory.rooms[this.memory.targetRoomName].hostileBoostedCreeps >= 2

		// TODO: Probably want the same logic as anti-camp to stop too heavy scale-down
		let rambo;
		if (myRoomHeavyDefense || (this.memory.alliesPriority || 0) > 0.5) {
			let useTough = !Game.rooms[this.memory.targetRoomName] || Game.rooms[this.memory.targetRoomName].ramparts.length == 0
			rambo = creepCreator.createBestRanged(parentRoom, useTough, true, true, undefined, undefined, undefined, undefined, true)
		}
		else {
		 	rambo = creepCreator.createRambo(parentRoom, [this.memory.targetRoomName])
		}

		if (rambo.body.length) {
			if (this.memory.alliesPriority > 1) {
				for (let i = 0; i < this.memory.alliesPriority; i++) {
					console.log("RAMBO spawning for", this.memory.targetRoomName)
					this.spawnCreep("ranged", rambo.body, rambo.boosts, spawn, {"targetRoom": this.memory.targetRoomName})
				}
			}
			else {
				console.log("RAMBO spawning for", this.memory.targetRoomName)
				this.spawnCreep("ranged", rambo.body, rambo.boosts, spawn, {"targetRoom": this.memory.targetRoomName})
			}
			this.memory.lastLaunchTick = Game.time
			return true;
		}


		return false;
	}

	// Ok. We're quite a heavy party so these won't do great but why not!
	grabExtraCreeps(roomName) {
		for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && Math.random() > .5 && (Game.creeps[idleCreep].hasActiveBodypart(RANGED_ATTACK) || Game.creeps[idleCreep].hasActiveBodypart(ATTACK)) && Game.creeps[idleCreep].hasActiveBodypart(HEAL)) {
				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, true);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep], this.memory.targetRoomName);
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}
	}


	tick() {
		let mmem = this.memory;
		if (this.isActive()) {
			var room = Game.rooms[mmem.targetRoomName];

			if (this.memory.myRoomHold) {				
				for (let creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (!creep) continue

					if (!creep.mem.targetBoosts || Object.keys(creep.mem.targetBoosts).length == 0 || creep.mem.boostsChecked) {
						creep.mem.sR = this.memory.targetRoomName
					}
				}
			}

			if (this.memory.enemyRoomAttack && room && !room.controller.owner) {
				this.memory.s++;
				this.missionComplete(true);
				return;
			}
			if ((Memory.rooms[mmem.targetRoomName].safeMode || 0) >= 1500) {
				mmem.s++;
				this.missionComplete(true);
				return;
			}

			if (this.memory.alliesPriority > 1) {
				Memory.rooms[mmem.sourceRoomName].spawningHeavyMission = Game.time
			}


			if (Math.random() < 0.01) {
				mmem.routeCost = Math.round((safeRoute.getSafeRouteCost(mmem.sourceRoomName, mmem.targetRoomName, true) || 15) * 10) / 10;

				if (mmem.killCount > 0) {
					this.grabExtraCreeps(mmem.pending ? mmem.sourceRoomName : mmem.targetRoomName);
				}
			}

			for (let creepName in this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				// Todo: when we reach the target room mark range. Then recycle if appicable.
				if (creep.room.name == this.memory.targetRoom && !creep.mem.arrivedAtTargetRoom) {
					creep.mem.arrivedAtTargetRoom = Game.time
				}

				if (room && room.isMyRoom() && room.labs && !room.dangerous && creep.ticksToLive < 75 && creep.hasBoost()) {
					creep.mem.sR = room.name
					creep.recycle = 1
				}

			}


			if (room) {
				let interestingCreeps = room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_POWER_CREEPS))

				if (Memory.swc) {
					interestingCreeps = _.filter(interestingCreeps, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
				}

				for (let creep of interestingCreeps) {
					if (mmem.interestingCreepsSeenTotal.indexOf(creep.id) == -1) {
						mmem.interestingCreepsSeenTotal.push(creep.id);
					}
				}

				// if (!mmem.pending) {
				// 	mmem.killCount = mmem.killCount || 0
				// 	if (room) {
				// 		mmem.killCount += (room.killCount || 0)
				// 	}
				// }
			}
		}

		if (this.isActive() && ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) || Game.time - mmem.lastLaunchTick > 2000)) {
			if (Game.time - mmem.lastLaunchTick > 1450 && (mmem.interestingCreepsSeenTotal.length >= 4 * mmem.numLaunches || mmem.killCount > mmem.bC / 2)) {
				mmem.s++;
				return this.missionComplete(true);
			}
			else if (Game.time - mmem.lastLaunchTick < 1250) {
				console.log(this.memory.type, "fail RIP")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName)

				mmem.f++;

				// Wait for the guys who killed me to despawn.
				mmem.fRefreshRate = 2000;
				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				return this.missionComplete(false);
			}
			else {
				// Booooring.
				console.log(this.memory.type, "fail boring")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName)

				mmem.fRefreshRate = 5000;
				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				if (mmem.killCount < 0.5 * mmem.bC) {
					mmem.fRefreshRate *= 2;
				}
				if (mmem.killCount < 0.25 * mmem.bC) {
					mmem.fRefreshRate *= 2;
				}

				return this.missionComplete(false);
			}
		}
		// Need moar. If our guys are still alive and they've still requested.
		else if (Game.time - mmem.lastLaunchTick >= 1350 - mmem.routeCost * 50 &&
				// Mission will scale down fine. Perhaps too fine.
				 (Game.time - (Memory.combatManager.requestedMissions[this.memory.type][this.memory.targetRoomName] || 0) < 100) && 
				 mmem.spawningCreeps.length == 0 &&
				 Game.time % 10 == 0) {


			if (!this.renewRestricted()) {
				// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
				// spawning in thinking life is going well.
				var effectiveTeam = false;
				for (var creepName of mmem.assignedCreeps) {
					var creep = Game.creeps[creepName];
					if (creep) {
						if (creep.hasActiveBodypart(RANGED_ATTACK) || creep.hasActiveBodypart(HEAL) || creep.hasActiveBodypart(ATTACK)) {
							effectiveTeam = true;
							break;
						}
					}
				}
				if (effectiveTeam) {
					console.log(mmem.sourceRoomName, "relaunching", this.memory.type, "against", mmem.targetRoomName)
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

		super.tick();
	}

	missionComplete(success) {
		super.missionComplete(success);

		delete this.memory.interestingCreepsSeenTotal;
		delete this.memory.enemyRoomAttack;
		delete this.memory.longRange;
		delete this.memory.alliesPriority;
	}

	static requestHeavyCreepRangedHold(targetRoomName, alliesPriority, force = false) {
		if (!Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD][targetRoomName]) {
			Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD][targetRoomName] = Game.time;
		}

		if (!Memory.rooms[targetRoomName]) {
			return 0
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					if (alliesPriority !== undefined) {
						mission.alliesPriority = alliesPriority;
					}

					return 0;
				}
			}
		}

		alliesPriority = alliesPriority || 0.15		

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.name == targetRoomName) continue;
			
			if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].isMyRoom()) {
				if (room.restrictDefensiveMissions(false, true, false)) {
					continue;
				}
			}
			else {				
				if (room.restrictOffensiveMissions(undefined, force || (alliesPriority || 0) > 0.5)) {
					continue;
				}
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, true)
			let score = dist - room.effectiveLevel * 4;

			// console.log(room, dist, score)

			if (dist < (force ? 20 : 15) && score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			// constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission) {
			let currentMission = new RoomHeavyCreepRangedHold(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, 0, alliesPriority, force)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Heavy creep ranged hold spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching heavy ranged creep hold to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD].push(currentMission.memory);
				return
			}
			console.log("Heavy creep ranged hold activate failed " + targetRoomName)
			return
		}
		else {
			console.log("Heavy creep ranged hold no spawn room to " + targetRoomName)
		}
	}
}



module.exports = RoomHeavyCreepRangedHold