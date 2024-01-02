"use strict";

const Mission = require('missionBase')

const RoomHeavyCreepClear = require('roomHeavyCreepClear')
const RoomHeavyCreepHold = require('roomHeavyCreepHold')


const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');

const creepCreator = require('creepCreator');

class RoomAssaultPowerSupport extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission, maxPowerCreeps) {
		memory.type = memory.type || MISSION_ROOM_POWER_ASSAULT;

		memory.fRefreshRate = 10000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			// We piggyback off a mission
			if (!parentAssaultMission) {
				console.log("Power assault with no parent")
				this.ID = 0
				return;
			}

			if (!parentAssaultMission.memory.boosted) {
				console.log("Power assault won't bother if the parent ain't boosted")
				this.ID = 0
				return
			}

			let mem = Memory.rooms[targetRoomName]
			if (mem.powerEnabled && 
				(mem.spwnX || []).length == 0 &&
				(mem.twrX || []).length == 0) {
				console.log("Power assault won't bother if the room is killed")
				this.ID = 0
				return
			}

			memory.parentMissionID = parentAssaultMission.ID;
			memory.maxPowerCreeps = maxPowerCreeps || 9999;

			memory.targetRoomName = parentAssaultMission.memory.targetRoomName || targetRoomName;
			memory.setupRoom = parentAssaultMission.memory.bestSetupRoom;
			memory.routeLength = parentAssaultMission.memory.routeLength;

			memory.assignedPowerCreeps = [];
			memory.assignedCreeps = [];
		}
	}

	getPowerCreeps() {
		if (this.memory.assignedPowerCreeps.length >= (this.memory.maxPowerCreeps || Infinity)) {
			return;
		}

		let availablePowerCreeps = []

		for (let powerCreepName in Game.powerCreeps) {
			let powerCreep = Game.powerCreeps[powerCreepName]
			if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive || powerCreep.level == 0) {
				continue;
			}

			// Doing something else
			if (powerCreep.memory.ID && powerCreep.memory.ID != this.memory.ID && missionInfo.findMissionForID(powerCreep.memory.ID, MISSION_ROOM_POWER_ASSAULT)) {
				continue;
			}

			if (this.memory.assignedPowerCreeps.includes(powerCreep.name)) {
				continue
			}

			availablePowerCreeps.push(powerCreep)
		}

		if ((this.memory.maxPowerCreeps || Infinity) < availablePowerCreeps.length) {
			let sourceRoomName = this.memory.sourceRoomName
			availablePowerCreeps = _.sortBy(availablePowerCreeps,  function(powerCreep) {return safeRoute.getSafeRouteCost(powerCreep.room.name, sourceRoomName, true)});
		}

		for (let powerCreep of availablePowerCreeps) {
			if (this.memory.assignedPowerCreeps.length >= (this.memory.maxPowerCreeps || Infinity)) {
				break;
			}
			this.memory.assignedPowerCreeps.push(powerCreep.name);
			powerCreep.memory.targetRoomName = this.memory.targetRoomName;
			powerCreep.memory.setupRoom = this.memory.setupRoom;
			powerCreep.memory.ID = this.memory.ID;
			powerCreep.memory.formationCreeps = [powerCreep.name];
		}
	}

	requestSpawns() {
		if (this.memory.spawningCreeps.length == 0) {		
			this.getPowerCreeps();
			if (!this.memory.assignedPowerCreeps.length) return false

			let targetPowerEnabled = Memory.rooms[this.memory.targetRoomName].powerEnabled;

			let ret = creepCreator.createBestHeal(Game.rooms[this.memory.sourceRoomName], 1, !targetPowerEnabled, true)
			if (ret.body.length > 0) {
				var spawns = Game.rooms[this.memory.sourceRoomName].find2(FIND_MY_SPAWNS);
				// Oh. Crap.
				if (spawns.length == 0) return false;
				var spawn = spawns[0];

				for (let powerCreepName of this.memory.assignedPowerCreeps) {
					let powerCreep = Game.powerCreeps[powerCreepName]
					if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive) {
						continue;
					}

					let numHealers = 0;
					for (let creepName of powerCreep.memory.formationCreeps) {
						let creep = Game.creeps[creepName]
						if (creep && (creep.ticksToLive > this.memory.routeLength * 50 + 150 || creep.spawning)) {
							numHealers++;
						}
					}

					if (numHealers < (targetPowerEnabled ? 1 : 2) && this.memory.spawningCreeps.length == 0) {
						for (let i = 0; i < (targetPowerEnabled ? 1 : 2) - numHealers; i++) {
							powerCreep.memory.formationCreeps.push(this.spawnCreep("ranged", ret.body, ret.boosts, spawn))
						}

						// Now would be a good time to send ops. Don't fuck about, fill it up. We get through them fast.
						let currentOps = _.sum(powerCreep.carry)
						let currentCapacity = powerCreep.carryCapacity;

						let missingOps = powerCreep.carryCapacity - currentOps * 0.25;

						// We're not chomping them that quickly, clearly
						if (currentOps == currentCapacity) {
							missingOps /= 2
						}

						if (missingOps >= CARRY_CAPACITY) {
							let opHaulerBody = []

							let numParts = Math.floor(missingOps / CARRY_CAPACITY)
							let numCreeps = Math.ceil(numParts * 2 / MAX_CREEP_SIZE)

							for (let i = 0; i < Math.floor(numParts / numCreeps); i++) {
								opHaulerBody.push(CARRY)
								opHaulerBody.push(MOVE)
							}

							let extraMem = {pc: powerCreepName};
							for (let i = 0; i < numCreeps; i++) {
								this.spawnCreep("opHauler", opHaulerBody, {}, spawn, extraMem)
							}
						}

						this.memory.lastLaunchTick = Game.time;
					}			
				}
				return true;
			}
		}
		return false;
	}



	missionComplete(success) {
		for (let powerCreepName of this.memory.assignedPowerCreeps) {
			let powerCreep = Game.powerCreeps[powerCreepName]
			if (!powerCreep) {
				continue;
			}

			// I think the super does this, but why the heck not.
			powerCreep.memory.ID = 0;
			delete powerCreep.memory.formationCreeps;
		}

		super.missionComplete(success);

		delete this.memory.assignedPowerCreeps;
		delete this.memory.maxPowerCreeps;
		delete this.memory.parentMissionID;
		delete this.memory.setupRoom;
		delete this.memory.routeLength;
		delete this.memory.assignedCreeps;
	}

	tick() {
		super.tick();

		global.totalAssaultCount += 0.5

		if (this.isActive()) {			
			// let parentAssaultMission = missionInfo.findMissionForID(this.memory.parentMissionID, MISSION_ROOM_ASSAULT);
			let targetPowerEnabled = Memory.rooms[this.memory.targetRoomName].powerEnabled;

			// We're done, for better or worse
			// if (!parentAssaultMission) {
			// 	this.missionComplete()
			// 	return
			// }

			// Nobody assaulting it.
			if (!global.roomAssaultCounts[this.memory.targetRoomName]) {
				this.missionComplete(true)
				return
			}

			if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].controller && Game.rooms[this.memory.targetRoomName].controller.safeMode) {
				this.missionComplete(true)
				return	
			}

			let mem = Memory.rooms[this.memory.targetRoomName]

			if ((!mem.invCL && (mem.spwnX || []).length == 0) ||
				(mem.twrX || []).length == 0) {
				this.missionComplete(true)
				return
			}
			// Strongholds
			if (Game.rooms[this.memory.targetRoomName] && 
				!Game.rooms[this.memory.targetRoomName].controller && 
				!mem.invCL) {
				this.missionComplete(true)
				return
			}

			// Can't have this
			//if ((Game.rooms[this.memory.setupRoom] && Game.rooms[this.memory.setupRoom].dangerous) || (Memory.rooms[this.memory.setupRoom] && Memory.rooms[this.memory.setupRoom].DT > 1)) {
				RoomHeavyCreepHold.requestHeavyCreepHold(this.memory.setupRoom, 1)
			//}

			if (Math.random() < 0.01) {
				this.getPowerCreeps()
			}

			// Tag power creeps with healers.
			for (let powerCreepName of this.memory.assignedPowerCreeps) {
				let powerCreep = Game.powerCreeps[powerCreepName]
				if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive) {
					continue;
				}

				powerCreep.memory.homeRoom = this.memory.sourceRoomName;			
				powerCreep.memory.targetRoom = this.memory.targetRoomName;			
				powerCreep.memory.setupRoom = this.memory.setupRoom;
			}

			for (let powerCreepName of this.memory.assignedPowerCreeps) {
				let powerCreep = Game.powerCreeps[powerCreepName]
				if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive) {
					continue;
				}

				// This isn't needed. Temp to fix a bug
				// if (!powerCreep.memory.formationCreeps.includes(powerCreep.name)) {
				// 	powerCreep.memory.formationCreeps.push(powerCreep.name)
				// }

				let numHealers = 0;
				for (let creepName of powerCreep.memory.formationCreeps) {
					let creep = Game.creeps[creepName]
					if (creep && (creep.ticksToLive > this.memory.routeLength * 50 + 150 || creep.spawning)) {
						numHealers++;
						creep.powerCreepHealer = 1
					}
				}

				if (numHealers < (targetPowerEnabled ? 1 : 2) && this.memory.spawningCreeps.length == 0) {
					this.requestSpawns();
					break;
				}
			}

			for (let powerCreepName of this.memory.assignedPowerCreeps) {
				let powerCreep = Game.powerCreeps[powerCreepName]
				if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive) {
					continue;
				}

				let targetHealers = (targetPowerEnabled ? 1 : 2);

				let numHealers = 0;
				for (let creepName of powerCreep.memory.formationCreeps) {
					let creep = Game.creeps[creepName]
					if (creep) {
						if (creep.room.controller && creep.room.controller.my && creep.ticksToLive < 100) {
							creep.mem.role = "recycler"
							creep.ignoreSnake = 1;
						}
						else {							
							numHealers++
							// Ignore "extra" creeps. These will prespawn and head toward us 
							if (numHealers > targetHealers || creep.spawning) {
								creep.ignoreSnake = 1;
							}
							creep.combatSnake = 1;
							creep.mem.retreat = 0;
							// Override this
							//creep.mem.haveSnaked = 1;
							creep.mem.targetRoom = this.memory.targetRoomName;
							creep.mem.setupRoom = this.memory.setupRoom;	
							creep.mem.formationCreeps = powerCreep.memory.formationCreeps;	
						}
					}
				}
			}
		}
	}

	static requestPowerCreepSupport(parentAssaultMission, maxPowerCreeps) {
		let targetRoomName = parentAssaultMission.memory.targetRoomName

		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_POWER_ASSAULT]) {
			if (mission.targetRoomName == targetRoomName && mission.ID) {
				return mission.ID;
			}
		}

		let availablePowerCreepCnt = 0;
		for (let powerCreepName in Game.powerCreeps) {
			let powerCreep = Game.powerCreeps[powerCreepName]
			if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive || powerCreep.level == 0 || powerCreep.memory.ID) {
				continue;
			}
			availablePowerCreepCnt++;
		}

		if (!availablePowerCreepCnt) {
			return 0
		}


		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			// Need to spawn big ass-healers
			if (room.effectiveLevel < Math.max(7, (Memory.rooms[targetRoomName].rcl || 0))) {
				continue;
			}

			if (room.restrictOffensiveMissions(targetRoomName, true, false, true)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true)
			let score = dist - room.effectiveLevel * 4;

			if (dist < 10 && score < lowestScore) {				
				let hasValidPowerCreep = false;
				for (let powerCreepName in Game.powerCreeps) {
					let powerCreep = Game.powerCreeps[powerCreepName]
					if (!powerCreep || !powerCreep.room || !powerCreep.memory.aggressive || powerCreep.level == 0 || powerCreep.memory.ID) {
						continue;
					}

					// Nice
					if (powerCreep.memory.homeRoom === room.name) {
						let dist2 = safeRoute.getSafeRouteCost(powerCreep.room.name, room.name, true)

						if (dist2 < 4) {
							hasValidPowerCreep = true;
							break;
						}
					}
				}

				if (hasValidPowerCreep) {
					lowestScore = score;
					bestSourceRoom = room;
				}
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_POWER_ASSAULT]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}			

			var newMemory = (!currentMemory.type);

			let currentMission = new RoomAssaultPowerSupport(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, 0, parentAssaultMission, maxPowerCreeps)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Power assist spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return 0;
				}

				console.log(bestSourceRoom.name + " Launching power assist assault to " + targetRoomName)

				if (newMemory) {
					Memory.combatManager.currentMissions[MISSION_ROOM_POWER_ASSAULT].push(currentMission.memory);
				}

				// Camp the exits. Don't let reinforcements reinforce.
				if (Memory.rooms[targetRoomName].rcl >= 7 && (Memory.rooms[targetRoomName].percentLocalDefense || 1) < 0.8 && parentAssaultMission.memory.type !== MISSION_STRONGHOLD_ASSAULT) {
					RoomHeavyCreepClear.requestHeavyCreepBorderClear(targetRoomName)
				}

				return currentMission.memory.ID;
			}
			console.log("Power assist activate failed " + targetRoomName)
			return 0;
		}
		else {
			Memory.combatManager.requestedPowerCreeps = Memory.combatManager.requestedPowerCreeps || {}
			Memory.combatManager.requestedPowerCreeps[parentAssaultMission.memory.sourceRoomName] = Game.time

			console.log("Power assist no spawn room to " + targetRoomName)
			return 0
		}
	}
}


module.exports = RoomAssaultPowerSupport