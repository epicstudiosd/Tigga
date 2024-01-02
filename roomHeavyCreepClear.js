"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');


class RoomHeavyCreepClear extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, assaultRoomName, createNew, priority) {
		memory.type = MISSION_ROOM_HEAVY_CREEP_CLEAR;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.type = MISSION_ROOM_HEAVY_CREEP_CLEAR;
			memory.targetRoomName = memory.targetRoomName || targetRoomName;
			memory.assaultRoomName = memory.assaultRoomName || assaultRoomName;

			memory.routeCost = Math.round(safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) * 10) / 10

			memory.formations = [];
			memory.interestingCreepsSeenTotal = [];
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];		
		let mem = Memory.rooms[this.memory.targetRoomName];
		let formationCreepNames = [];

		let allowBoosts = Memory.empireStrength > 10 

		let healer = creepCreator.createBestHeal(parentRoom, 0, false, allowBoosts)
		let tank = creepCreator.createBestTank(parentRoom, true, allowBoosts)

		if (healer.body.length && tank.body.length) {
			formationCreepNames.push(super.spawnCreep("ranged", healer.body, healer.boosts, spawn, {targetRoom: this.memory.targetRoomName}));
			formationCreepNames.push(super.spawnCreep("tank", tank.body, tank.boosts, spawn, {targetRoom: this.memory.targetRoomName}));
			this.memory.formations.push(formationCreepNames);

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
			if (Math.random() < 0.01 && mmem.killCount > 0) {
				this.grabExtraCreeps(mmem.pending ? mmem.sourceRoomName : mmem.targetRoomName);
			}

			var room = Game.rooms[mmem.targetRoomName];
			if (room) {
				// We're targeting civilians. Combat creeps we'd actually prefer to avoid
				let interestingCreeps = room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_POWER_CREEPS))

				for (let creep of interestingCreeps) {
					if (mmem.interestingCreepsSeenTotal.indexOf(creep.id) == -1) {
						mmem.interestingCreepsSeenTotal.push(creep.id);
					}
				}

				// if (!mmem.pending) {
				// 	if (room) {
				// 		mmem.killCount += room.killCount
				// 	}
				// }
			}

			for (let formationIdx in this.memory.formations) {
				let formation = this.memory.formations[formationIdx];

				for (let formationCreepName of formation) {
					let formationCreep = Game.creeps[formationCreepName]
					if (!formationCreep) continue;

					formationCreep.memory.formationCreeps = _.clone(formation);
					formationCreep.memory.allSquadCreeps = _.clone(formation);
					formationCreep.combatSnake = 1;
				}
			}
		}

		this.formationPairRenew()


		if (this.isActive() && ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) || Game.time - mmem.lastLaunchTick > 2000)) {
			if (Game.time - mmem.lastLaunchTick > 1450 && (mmem.interestingCreepsSeenTotal.length >= 4 * mmem.numLaunches || mmem.killCount > mmem.bC / 2)) {
				mmem.s++;
				return this.missionComplete(true);
			}
			else if (Game.time - mmem.lastLaunchTick < 1250) {
				console.log("Heavy hold fail RIP")
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
				console.log("Heavy hold fail boring")
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
		// Need moar. If our guys are still alive and they've managed to kill more than they cost, spawn them some friends.
		else if (Game.time - mmem.lastLaunchTick >= 1350 - mmem.routeCost * 50 &&
				 global.roomAssaultCounts[this.memory.assaultRoomName] &&
				 global.roomAssaultCounts[this.memory.assaultRoomName].assaultCount && 
				 mmem.spawningCreeps.length == 0 &&
				 Game.time % 10 == 0 &&
				 mmem.killCount > mmem.bC * 0.5) {


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
					console.log(mmem.sourceRoomName, "relaunching heavy room hold against", mmem.targetRoomName)
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

		delete this.memory.routeCost
		delete this.memory.formations;
		delete this.memory.interestingCreepsSeenTotal;
	}

	static requestHeavyCreepBorderClear(assaultRoomName) {
		let exits = Game.map.describeExits(assaultRoomName)

		for (let targetRoomName of Object.values(exits)) {
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_CLEAR]) {
				if (mission.assaultRoomName == assaultRoomName && mission.targetRoomName == targetRoomName) {
					// Doing this already.
					if (mission.ID) {
						return 0;
					}
				}
			}

			let lowestScore = Infinity;
			let bestSourceRoom;

			for (let room of Game.myRooms) {
				if (room.effectiveLevel < Memory.rooms[assaultRoomName].rcl) {
					continue;
				}

				if (room.restrictOffensiveMissions(assaultRoomName, false, false, true)) {
					continue;
				}

				let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true)
				let score = dist - room.effectiveLevel * 4;

				if (dist < 20 && score < lowestScore) {
					lowestScore = score;
					bestSourceRoom = room;
				}
			}


			if (bestSourceRoom) {
				let currentMemory = {};
				for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_CLEAR]) {
					if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
						currentMemory = mission;
						break;
					}
				}
				var newMemory = (!currentMemory.type);
				// constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission) {
				let currentMission = new RoomHeavyCreepClear(currentMemory || {}, bestSourceRoom.name, targetRoomName, assaultRoomName, true, 0)

				if (currentMission.isActive()) {
					let spawnSuccessful = currentMission.requestSpawns();

					if (!spawnSuccessful) {
						console.log("Heavy creep clear spawn failed " + targetRoomName)
						currentMission.memory.ID = 0;
						continue
					}

					console.log(bestSourceRoom.name + "Launching heavy creep clear to " + targetRoomName)

					if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_CLEAR].push(currentMission.memory);
					continue
				}
				console.log("Heavy creep clear activate failed " + targetRoomName)
				continue
			}
			else {
				console.log("Heavy creep clear no spawn room to " + targetRoomName)
			}
		}
	}
}


module.exports = RoomHeavyCreepClear