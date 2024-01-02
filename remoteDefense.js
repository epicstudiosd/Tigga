"use strict";

const idleCreepManager = require('idleCreepManager')
const Mission = require('missionBase')
const safeRoute = require('safeRoute');
const roomIntel = require('roomIntel');

const constants = require('constants');
const util = require("util")

// Mission id != 0 means active mission, otherwise it's inactive
class RemoteDefenseMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_REMOTE_DEFENSE;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.capture = 0;
			memory.clearCounter = 0;

			// If we fail, don't go back for a bit.
			memory.fRefreshRate = 3000;

			// If we've just finished and the threat comes back, extend the time we wait
			memory.clearWaitTime = memory.clearWaitTime || 50;
			if (Game.time - (memory.completeTick || 0) < 30) {
				memory.clearWaitTime += 5;
			}
			else {
				memory.clearWaitTime = Math.max(memory.clearWaitTime - 5, 10)
			}

			memory.completeTick = 0;
			memory.meanRelativeStrength = 0

			// Co-opt the idle creeps
			this.grabExtraCreeps(sourceRoomName);
		}
	}

	grabExtraCreeps(roomName) {
		// This function ties up expensive creeps for non-missions. 
		// Let idle creeps come in via the idle creep manager.

		return

		/*for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && (Math.random() > .25 || Game.creeps[idleCreep].ticksToLive < 200)) {
				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, false);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep]);
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}*/
	}

	tick() {
		let targetRoomName = this.memory.targetRoomName;

		if (this.isActive()) {
			let myCreepCostPerTick = 0 

			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep || creep.spawning) continue

				myCreepCostPerTick += (creep.mem.bC || util.getECostForCreep(creep)) / CREEP_LIFE_TIME
			}


			if (Memory.rooms[targetRoomName] && Memory.rooms[targetRoomName].meanHarvestYeild) {
				for (let creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (!creep || creep.spawning) continue

					Memory.rooms[this.memory.targetRoomName].meanHarvestYeild -= myCreepCostPerTick * (1 - Math.exp(-(1/3000.)))
				}
			}

			if (Game.rooms[targetRoomName] || Game.time - this.memory.startTick > 1500) {
				let mmem = this.memory;
				if (mmem.spawningCreeps.length) {
					for (let creepName of this.memory.assignedCreeps) {
						if (Game.creeps[creepName]) {
							Game.creeps[creepName].caution = (Game.creeps[creepName].caution || 0) + 2;
						}
					}
				}

				let threats;
				if (Game.rooms[targetRoomName]) {
					if (Game.rooms[targetRoomName].dangerous) {					
						threats = Game.rooms[targetRoomName].find(FIND_HOSTILE_CREEPS, {
							filter: function(object) {
								if (object.owner.username == "Source Keeper") {
									return false;
								}
								return true;
							}
						});
						threats = threats.concat(Game.rooms[targetRoomName].find(FIND_HOSTILE_POWER_CREEPS));

						let numSources = roomIntel.getEffectiveNumSources(targetRoomName)

						for (let threat of threats) {
							if (threat.owner.username == "Invader" || threat.owner.username == "Screeps") continue;
							if (threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK)) {
								// What's this for?
								// this.memory.dangerous = 1;

								Memory.stats.globalHarassTracking[threat.owner.username] = (Memory.stats.globalHarassTracking[threat.owner.username] || 0) + myCreepCostPerTick / threats.length
								Memory.stats.globalHarassTracking[threat.owner.username] += numSources * 10 / threats.length;
							}
						}

					}

					// We're winning already, don't wait for everything to spawn to attack
					if (this.memory.pending) {					
						const alpha = Math.exp(-1/10.);
						if (Game.rooms[targetRoomName].dangerous) {
							this.memory.meanRelativeStrength = this.memory.meanRelativeStrength * alpha + (1 - alpha) * (Game.rooms[targetRoomName].roomStrength || 0)
						}
						else {
							this.memory.meanRelativeStrength = this.memory.meanRelativeStrength * alpha + (1 - alpha) * 3
						}

						if (this.memory.meanRelativeStrength > 1.5) {
							if (this.memory.assignedCreeps.length) {
								console.log("Room defense launching into", targetRoomName, "as current mean relative strength is", this.memory.meanRelativeStrength)
								this.memory.pending = 0;
								for (let creepName of this.memory.assignedCreeps) {
									if (Memory.creeps[creepName]) {
										Memory.creeps[creepName].retreat = 0;
									}
								}
							}					
						}
					}
				}





				// if (!this.memory.pending) {
					global.inTickObject.activeDefenseMissions = global.inTickObject.activeDefenseMissions || [];
					global.inTickObject.activeDefenseMissions.push(targetRoomName)
				// }

				// if (Math.random() < 0.02) {
				// 	this.grabExtraCreeps(mmem.pending ? mmem.sourceRoomName : targetRoomName);
				// }

				if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].isEnemyRoom()) {
					let towers = Game.rooms[targetRoomName].towers;

					let towerEnergy = 0;
					for (let tower of towers) {
						towerEnergy += tower.energy;
					}

					if (towerEnergy > 200) {
						_.pull(Memory.rooms[mmem.sourceRoomName].protectRooms, targetRoomName);
						this.missionComplete(false);
						return;
					}
				}

				if (threats && threats.length) {
					mmem.clearCounter = 0;
				}

				// Wtf
				if (!Memory.rooms[targetRoomName]) {
					mmem.f++;
					mmem.fTick = Game.time;
					this.missionComplete(false);
					return
				}

				// Give it some time to make sure it really is clean
				if ((threats && threats.length) || (mmem.clearCounter > mmem.clearWaitTime + (Memory.rooms[targetRoomName].DT || 1) * 50) || Game.time - mmem.startTick > 1500) {
					// Ok, we completed
					// if (Game.time - mmem.startTick < 20) {
						// Oh, that was quick. We should probably get some data. It might be somebody
						// just popped in and straight back out again. That's expensive if it causes
						// a phat-ass defence to come out every time.

						// For now I'm not going to count it as a failure, however I will set a failure
						// tick, which will prevent us spawning anybody new to deal with it.
						// mmem.fTick = Game.time - memory.fRefreshRate + 100;
					// }
					// Well, there was probably a big-ass fight and we lost
					if (Game.time - mmem.startTick > 1500 && (Memory.rooms[targetRoomName].kd || 0) < 1) {
						mmem.f++;
						mmem.fTick = Game.time;

						// This was an offensive "defense", and failed
						if (mmem.capture) {
							mmem.fRefreshRate = 10000;
						}

						let oldStrategy = Memory.rooms[targetRoomName].cS || constants.COMBAT_STRATEGY_DEFAULT;

						do  {
							Memory.rooms[targetRoomName].cS = _.sample(constants.ROOM_COMBAT_STRATEGIES) + _.sample(constants.REMOTE_DEFENSE_BUILD_STRATEGIES) * 100;
						}
						while (Memory.rooms[targetRoomName].cS == oldStrategy)

						Memory.rooms[targetRoomName].restrictHarvestingUntil = Game.time + mmem.fRefreshRate;

						console.log("Failed to defend. Changing strategy for", targetRoomName, "Old:", oldStrategy, "New:", Memory.rooms[targetRoomName].cS)
						this.missionComplete(false);
					}
					// It's going alright. We're over 1.5k ticks, but also over 1 k:d. lets test again in 100 ticks
					else if (threats && threats.length) {
						mmem.startTick += 100;
					}
					else {
						mmem.s++;
						this.missionComplete(true);
					}

				}
				else {
					// Love a good bit of noise this means we'll hang around for a non-deterministic time.
					mmem.clearCounter += Math.round(Math.random() * 2)
				}
			}
		}
		super.tick();
	}

	setAsCapture() {
		this.memory.capture = 1;
	}

	missionComplete(success) {
		super.missionComplete(success);

		this.memory.completeTick = Game.time;

		delete this.memory.capture;
		delete this.memory.clearCounter;
		delete this.memory.meanRelativeStrength;
	}

	spawnCreep(role, body, boosts, spawn, invasion) {
		// Ok, this is a bit of a test. New rooms have a problem because they try to defend themselves
		// and relaly they should use all that energy to grow
		if (!invasion && Game.myRooms.length > 1 && Memory.maxRoomLevel > 5 && !spawn.room.storage) {
			return false
		}

		/*let parentRoom = Game.rooms[this.memory.sourceRoomName]

		if (parentRoom.memory.regularHarvestRooms.includes(this.memory.targetRoomName) ||
			parentRoom.memory.doubleHarvestRooms.includes(this.memory.targetRoomName) || 
			parentRoom.memory.keeperHarvestRooms.includes(this.memory.targetRoomName)) {
			if (Memory.rooms[this.memory.targetRoomName].meanHarvestYeild !== undefined) {
				Memory.rooms[this.memory.targetRoomName].meanHarvestYeild -= util.getECostForDesign(body) * (1 - Math.exp(-(1/1500.)));
			}
		}
		else if (parentRoom.memory.goodRooms.length) {
			let diff = util.getECostForDesign(body) * (1 - Math.exp(-(1/1500.))) / parentRoom.memory.goodRooms.length
			for (let roomName of parentRoom.memory.goodRooms) {
				if (Memory.rooms[roomName].meanHarvestYeild) {
					Memory.rooms[roomName].meanHarvestYeild -= diff;
				}
			}
		}*/

		super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.mem.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = RemoteDefenseMission