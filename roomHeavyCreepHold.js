"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const scouting = require('scouting');
const util = require('util');
const intelAI = require('intelAI');

const creepCreator = require('creepCreator');


class RoomHeavyCreepHold extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority, alliesPriority, longRange) {
		memory.type = memory.type || MISSION_ROOM_HEAVY_CREEP_HOLD;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.type = memory.type || MISSION_ROOM_HEAVY_CREEP_HOLD;
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true)

			memory.formations = [];
			memory.interestingCreepsSeenTotal = [];

			memory.alliesPriority = alliesPriority || 0

			if (intelAI.getEnemyRoomSet().has(targetRoomName)) {
				if (Memory.season2 && Memory.rooms[targetRoomName] && Memory.rooms[targetRoomName].owner && Memory.rooms[targetRoomName].owner == "Cub") {

				}
				else {
					memory.enemyRoomAttack = 1;
				}

			}
			if (Game.rooms[targetRoomName] && Game.myRooms.includes(Game.rooms[targetRoomName])) {
				memory.myRoomHold = 1;
			}

			memory.firstArrivedInRoom = undefined
			memory.longRange = longRange			
		}
	}

	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return;

		if (this.memory.routeCost > (this.memory.longRange ? 20 : 15)) {
			console.log(this.memory.type, "not spawning due to range", this.memory.routeCost)
			return
		}


		let spawn = spawns[0];		
		let mem = Memory.rooms[this.memory.targetRoomName];
		if (mem.invCL) {
			console.log(this.memory.type, "won't go against a stronghold!", mem.invCL)
			return
		}

		let creepMemory = {targetRoom: this.memory.targetRoomName};

		let healer;
		let healer2;
		let tank;

		let myRoomHeavyDefense = this.memory.myRoomHold && Memory.rooms[this.memory.targetRoomName].hostileBoostedCreeps >= 2
		let myRoomVeryHeavyDefense = this.memory.myRoomHold && Memory.rooms[this.memory.targetRoomName].hostileBoostedCreeps >= 4


		if (this.memory.enemyRoomAttack || 
			myRoomHeavyDefense || 
			(this.memory.myRoomHold && Memory.rooms[this.memory.targetRoomName].safeModeCooldown) || 
			(this.memory.alliesPriority || 0) > 0.5) {
			healer = creepCreator.createBestHeal(parentRoom, 1, true, true)
			if (myRoomVeryHeavyDefense /*|| (this.memory.alliesPriority || 0) > 0.9*/) {
				healer2 = creepCreator.createBestHeal(parentRoom, 0.5, false, true)
			}
			// parentRoom, useTough, useBoost, energyCap, targetAttackRequired, useRanged, buildToMaxSize, useOneRanged
			tank = creepCreator.createBestTank(parentRoom, true, true, undefined, undefined, undefined, true, 1)
		}
		else {			
			healer = creepCreator.createBestHeal(parentRoom, 0, false, false)
			tank = creepCreator.createBestTank(parentRoom, false, false)
		}

		if (healer.body.length && tank.body.length) {
			// This is a big hack
			if (this.memory.alliesPriority > 1) {
				for (let i = 0; i < this.memory.alliesPriority; i++) {
					let formationCreepNames = [];
					if (healer2 && healer2.body.length) {
						Memory.rooms[this.memory.sourceRoomName].spawningHeavyMission = Game.time

						let healer2Mem = _.clone(creepMemory)
						healer2Mem.forceLast = 1
						formationCreepNames.push(super.spawnCreep("healer", healer2.body, healer2.boosts, spawn, healer2Mem));
					}
					formationCreepNames.push(super.spawnCreep("healer", healer.body, healer.boosts, spawn, _.clone(creepMemory)));
					formationCreepNames.push(super.spawnCreep("tank", tank.body, tank.boosts, spawn, _.clone(creepMemory)));
					this.memory.formations.push(formationCreepNames);
				}
			}
			else {
				let formationCreepNames = [];
				if (healer2 && healer2.body.length) {
					Memory.rooms[this.memory.sourceRoomName].spawningHeavyMission = Game.time

					let healer2Mem = _.clone(creepMemory)
					healer2Mem.forceLast = 1
					formationCreepNames.push(super.spawnCreep("healer", healer2.body, healer2.boosts, spawn, healer2Mem));
				}

				formationCreepNames.push(super.spawnCreep("healer", healer.body, healer.boosts, spawn, _.clone(creepMemory)));
				formationCreepNames.push(super.spawnCreep("tank", tank.body, tank.boosts, spawn, _.clone(creepMemory)));
				this.memory.formations.push(formationCreepNames);
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

				this.assignCreep(Game.creeps[idleCreep]);
				Game.creeps[idleCreep].mem.targetRoom = this.memory.targetRoomName
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}
	}


	tick() {
		let mmem = this.memory;
		if (this.isActive()) {
			var room = Game.rooms[mmem.targetRoomName];

			if (mmem.enemyRoomAttack && room && !room.controller.owner) {
				mmem.s++;
				this.missionComplete(true);
				return;
			}

			if (Memory.rooms[mmem.targetRoomName] && (Memory.rooms[mmem.targetRoomName].safeMode || 0) >= 1500) {
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

			let anyHostiles = 0

			if (room) {
				let interestingCreeps = room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_POWER_CREEPS))

				if (Memory.swc) {
					interestingCreeps = _.filter(interestingCreeps, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
				}
				if (Memory.season2) {
					interestingCreeps = _.filter(interestingCreeps, (threat) => (!scouting.isPlayerMediumWhiteListed(threat.owner.username)));	
				}

				anyHostiles = interestingCreeps.length > 0

				for (let creep of interestingCreeps) {
					if (!mmem.interestingCreepsSeenTotal.includes(creep.id)) {
						mmem.interestingCreepsSeenTotal.push(creep.id);
					}
				}

				//if (Memory.season2 && (this.memory.targetRoomName == "W24S14" || this.memory.targetRoomName == "W24S14") && room.dangerous != 2) {
				//	room.mem.DT -= 0.01
				//}

				// if (!mmem.pending) {
				// 	if (room) {
				// 		mmem.killCount += room.killCount
				// 	}
				// }
			}

			for (let formationIdx in mmem.formations) {
				let formation = mmem.formations[formationIdx];

				for (let formationCreepName of formation) {
					let formationCreep = Game.creeps[formationCreepName]
					if (!formationCreep) continue;

					formationCreep.memory.formationCreeps = _.clone(formation);
					formationCreep.memory.allSquadCreeps = _.clone(formation);
					if (!formationCreep.mem.haveSnaked) {
						formationCreep.combatSnake = 1;	
					}
					else {
						let anyAttack = 0
						for (let testCreepName of formation) {
							if (Game.creeps[testCreepName] && Game.creeps[testCreepName].hasBodypart(ATTACK)) {
								anyAttack = 1
								break
							}
						}
						formationCreep.combatSnake = anyAttack;	
					}
					

					if (mmem.enemyRoomAttack || mmem.myRoomHold || mmem.alliesPriority) {
						formationCreep.ignoreCivilians = 1
					}

					if (formationCreep.room.name == mmem.targetRoomName && !mmem.firstArrivedInRoom && formationCreep.room.dangerous) {
						mmem.firstArrivedInRoom = Game.time
					}

					if (!mmem.myRoomHold) {						
						if (formationCreep.room.name == mmem.targetRoomName && !formationCreep.mem.tripTime) {
							formationCreep.mem.tripTime = CREEP_LIFE_TIME - formationCreep.ticksToLive
						}

						if (formationCreep.mem.tripTime !== undefined && formationCreep.mem.tripTime < 300) {							
							if ((!anyHostiles || (formationCreep.mem.wantsToRecycle && formationCreep.room.name != mmem.targetRoomName)) && formationCreep.mem.tripTime !== undefined && formationCreep.hasBoost()) {
								if (formationCreep.mem.tripTime && formationCreep.ticksToLive < formationCreep.mem.tripTime * 1.2) {
									if (formationCreep.mem.wantsToRecycle || formationCreep.ticksToLive > formationCreep.mem.tripTime * 1.1) {
										formationCreep.mem.wantsToRecycle = 1
										formationCreep.recycle = 1;
									}
								}
							}
						}
					}

					if (mmem.myRoomHold && room && room.labs.length && !room.dangerous && formationCreep.ticksToLive < 75 && formationCreep.hasBoost()) {
						formationCreep.mem.sR = room.name
						formationCreep.recycle = 1
					}
				}
			}
		}

		this.formationPairRenew()


		if (this.isActive() && ((mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) || Game.time - mmem.lastLaunchTick > 2000)) {
			if (Game.time - mmem.lastLaunchTick > 1450 && (mmem.interestingCreepsSeenTotal.length >= 4 * mmem.numLaunches || mmem.killCount > mmem.bC / 2) &&
				(Game.time - Memory.combatManager.requestedMissions[this.memory.type][this.memory.targetRoomName] || 0) >= 100) {
				mmem.s++;
				return this.missionComplete(true);
			}
			else if (Game.time - mmem.lastLaunchTick < 1250) {
				console.log(this.memory.type, "fail RIP")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName)

				mmem.f++;

				// Wait for the guys who killed me to despawn.
				if (mmem.myRoomHold || mmem.alliesPriority >= 1) {
					mmem.fRefreshRate = 500;
				}
				else {
					mmem.fRefreshRate = 1500;
				}
				mmem.fRefreshRate *= (1.5 - this.getSuccessRate());
				mmem.fTick = Game.time;

				return this.missionComplete(false);
			}
			else {
				// Booooring.
				console.log(this.memory.type, "fail boring")
				console.log(Game.time, mmem.lastLaunchTick)
				console.log(mmem.targetRoomName)

				if (mmem.myRoomHold || mmem.alliesPriority >= 1) {
					mmem.fRefreshRate = 500;
				}
				else {
					mmem.fRefreshRate = 5000;
				}
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

		let respawnTimer = 1350 - mmem.routeCost * 50;

		// We've arrived and not instantly won. Send another.
		if (Game.time - (this.memory.firstArrivedInRoom || Infinity) > 200) {
			if ((this.memory.alliesPriority || 0) > 0.99 || this.memory.myRoomHold) {
				respawnTimer *= 0.5
			}
			else if ((this.memory.alliesPriority || 0) > 0.9) {
				respawnTimer *= 0.75
			}
		}


		// Need moar. If our guys are still alive and they've still requested.
		if (Game.time - mmem.lastLaunchTick >= respawnTimer &&
			Game.time - (Memory.combatManager.requestedMissions[this.memory.type][this.memory.targetRoomName] || 0) < 100 && 
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

		delete this.memory.formations;
		delete this.memory.interestingCreepsSeenTotal;
		delete this.memory.enemyRoomAttack;
		delete this.memory.firstArrivedInRoom;
		delete this.memory.longRange;
		delete this.memory.alliesPriority;
	}

	static requestHeavyCreepHold(targetRoomName, alliesPriority, force = false) {
		if (!Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_CREEP_HOLD][targetRoomName]) {
			Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_CREEP_HOLD][targetRoomName] = Game.time;
		}

		if (!Memory.rooms[targetRoomName]) {
			return 0
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_HOLD]) {
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
		let longRange = force

		if (Memory.season2 && targetRoomName == "W6S20") {
			longRange = true
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.name == targetRoomName) continue;
			
			if (intelAI.getEnemyRoomSet().has(targetRoomName)) {
				let renewPriority = alliesPriority >= 1 || force
				let lowPriority = alliesPriority < 0.1
				let highPriority = alliesPriority > 0.5 && !renewPriority

				if (Memory.season2 && Memory.rooms[targetRoomName] && Memory.rooms[targetRoomName].owner && Memory.rooms[targetRoomName].owner == "Cub") {
					let lowPriority = alliesPriority < 0.1
					let highPriority = alliesPriority > 0.5

					if (room.restrictOffensiveMissions(undefined, renewPriority, lowPriority, highPriority)) {
						continue;
					}
				}
				else {
					if (room.restrictOffensiveMissions(targetRoomName, force || (alliesPriority || 0) > 0.5, lowPriority, highPriority)) {
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

			if (dist < (longRange ? 15 : 20) && score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_HOLD]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);


			// constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission) {
			let currentMission = new RoomHeavyCreepHold(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, 0, alliesPriority, longRange)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Heavy creep hold spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching heavy creep hold to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_HEAVY_CREEP_HOLD].push(currentMission.memory);
				return
			}
			console.log("Heavy creep hold activate failed ", bestSourceRoom.name, targetRoomName)
			return
		}
		else {
			console.log("Heavy creep hold no spawn room to " + targetRoomName)
		}
	}
}



module.exports = RoomHeavyCreepHold