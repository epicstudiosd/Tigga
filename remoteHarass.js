"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const roomIntel = require('roomIntel')

class RemoteHarassMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_REMOTE_HARASS;

		let fRefreshMod = 1;
		if (priority !== undefined && priority < 0) {
			fRefreshMod = 0.5
		}
		if (memory.type == MISSION_REMOTE_HARASS_LIGHT) {
			fRefreshMod *= 0.1;
		}

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority, fRefreshMod);

		memory.harassRooms = memory.harassRooms || [];

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			// If we fail, don't go back for a bit.
			memory.fRefreshRate = memory.fRefreshRate || 5000;

			// Track target room energy reserves
			memory.tgtE = (Memory.rooms[memory.targetRoomName].storE || 0) + (Memory.rooms[memory.targetRoomName].trmE || 0)

			memory.denialCount = 0;

			// We want to do an escalating engagement.
			// Start small, if we fail, escalate.
			let sum = 0;
			let cnt = 0;

			for (let otherMission of Memory.combatManager.currentMissions[memory.type]) {
				if (otherMission.targetRoomName == targetRoomName) {
					sum += (otherMission.e || 0)
					cnt++;
				}
			}
			if (!memory.e) {
				if (cnt == 0) {
					memory.e = 1;
				}
				else {
					memory.e = Math.floor(sum / cnt);
				}
			}
			else if (cnt && sum / cnt > memory.e) {
				memory.e = Math.round((memory.e + sum / cnt) / 2)
			}

			if (!memory.s && !memory.f) {				
				if (priority < 0) {				
					memory.e += Math.ceil(-priority / 10)
				}
			}

			memory.rangeHealRatio = memory.rangeHealRatio || 2.;
			memory.bodyOrder = memory.bodyOrder || 0;
			memory.maxBonusTough = memory.maxBonusTough || 2;

			let isStakeoutType = memory.type == MISSION_REMOTE_STAKEOUT || memory.type == MISSION_REMOTE_STAKEOUT_CAPPED || memory.type == MISSION_ROOM_HEAVY_CREEP_CLEAR

			var exits = Game.map.describeExits(targetRoomName);
			memory.harassRooms = [];
			for (var exitDir in exits) {
				var exitRoom = exits[exitDir];

				// console.log("a", exitDir, exitRoom)

				// Don't harass owned neighbour rooms!
				if (Game.rooms[exitRoom] && Game.rooms[exitRoom].controller && Game.rooms[exitRoom].controller.owner) {
					continue;
				}
				// console.log("aa", exitDir, exitRoom)

				if (!Memory.rooms[exitRoom] || Memory.rooms[exitRoom].owner) {
					continue;
				}
				// console.log("ab", exitDir, exitRoom)

				if (Memory.rooms[exitRoom].reservedBy == util.getMyName()) {
					continue;
				}
				// console.log("ac", exitDir, exitRoom)

				// If it's not reserved or we saw no interesting creeps on the last visit
				if (isStakeoutType && (!Memory.rooms[exitRoom].reservedBy && Memory.rooms[targetRoomName].rcl >= 6) && memory.interestingCreepsSeen && memory.interestingCreepsSeen[exitRoom] == 0) {
					continue;
				}
				// console.log("ad", exitDir, exitRoom)


				let maxRange = this.memory.p < 0 ? 15 : 10

				// console.log("b", exitDir, exitRoom, maxRange, Game.map.getRoomLinearDistance(sourceRoomName, exitRoom))

				if (Game.map.getRoomLinearDistance(sourceRoomName, exitRoom) >= maxRange)  {
					continue;
				}

				var coords = util.getSectorCoords(exitRoom);

				// Don't harass highways or special rooms
				if (coords.x == 0 || coords.y == 0) continue;
				if (coords.x >= 4 && coords.y >= 4 && coords.x <= 6 && coords.y <= 6 && (!Memory.rooms[exitRoom] || !Memory.rooms[exitRoom].skNavigable)) continue;

				let routeCost = safeRoute.getSafeRouteCost(sourceRoomName, exitRoom, true)

				// console.log("c", exitDir, exitRoom, maxRange, Game.map.getRoomLinearDistance(sourceRoomName, exitRoom), routeCost, JSON.stringify(memory.interestingCreepsSeen))

				// Can path to parent room, but can we path to harass room?
				if (routeCost < maxRange) {
					// There is a problem where going from one harass room to another can be a very long path. Especially as we avoid SK rooms.
					// If we're going to add one, make sure it's within 6 rooms of any another otherwise pathing can go a bit ape.
					var minDistanceToCurrentHarassroom = 0;
					if (!isStakeoutType) {
						if (memory.harassRooms.length == 0) {
							minDistanceToCurrentHarassroom = 0;
						}
						else {
							minDistanceToCurrentHarassroom = 16;
							for (var currentHarassRoom of memory.harassRooms) {
							 	var route2Cost = safeRoute.getSafeRouteCost(currentHarassRoom, exitRoom, false);
								minDistanceToCurrentHarassroom = Math.min(minDistanceToCurrentHarassroom, route2Cost);
							}
						}
					}

					// Avoid going back to a room if we didn't see much last time we were there. Check it sometimes though!
					if (isStakeoutType || (minDistanceToCurrentHarassroom <= 6 && (!memory.interestingCreepsSeen || memory.interestingCreepsSeen[exitRoom] >= 1 || Math.random() < 0.25))) {
						memory.harassRooms.push(exitRoom);
					}
				}
			}

			// Nothing to harass. Bother. Come back in a bit
			if (memory.harassRooms.length == 0) {
				console.log("No harass rooms", sourceRoomName, targetRoomName, memory.type)
				memory.fRefreshRate = 100;
				memory.fTick = Game.time;
				Memory.rooms[targetRoomName].missionFailList = Memory.rooms[targetRoomName].missionFailList || {};
				Memory.rooms[targetRoomName].missionFailList[memory.type] = Game.time;
				this.memory.ID = 0;

				delete memory.bouncedCount
				delete memory.interestingCreepsSeenTotal

				return
			}
			else {
				memory.interestingCreepsSeenTotal = []

				// If we're bounced out of a room too much that's a bad thing.
				memory.bouncedCount = 0;

				// De-escalate from time to time
				if (memory.e && Math.random() > 0.9) {
					memory.e--;
				}


				memory.interestingCreepsSeen = {}
				memory.hasStructures = {}
				for (var roomName of this.memory.harassRooms) {
					memory.interestingCreepsSeen[roomName] = [];
				}
			}
		}
	}

	grabExtraCreeps(roomName) {
		for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && Math.random() > .5 && (Game.creeps[idleCreep].hasActiveBodypart(RANGED_ATTACK) || Game.creeps[idleCreep].hasActiveBodypart(ATTACK)) && Game.creeps[idleCreep].hasActiveBodypart(HEAL)) {
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


	getRandomRangedHealRatio() {
		// 2. is what we start with.
		let minRatio = 1.5; // 3:2
		let maxRatio = 5; // 5:1

		return Math.round((1.5 + Math.random() * (5 - 1.5) * 100)) / 100;
	}

	getRandomBodyOrder() {
		// 0 == RA first
		// 1 == Half move first
		// 2 == Move First
		return _.sample([0, 0, 0, 1, 1, 2]);
	}

	getRandomMaxBonusTough() {
		return _.sample([0, 1, 1, 2, 2, 2, 3, 3, 4]);
	}

	tick() {
		if (this.memory.type == MISSION_REMOTE_STAKEOUT || this.memory.type == MISSION_REMOTE_STAKEOUT_CAPPED || this.memory.type == MISSION_ROOM_HEAVY_CREEP_CLEAR) {
			super.tick();
			return
		}

		// console.log("ticking in harass", this.memory.type)

		if (this.isActive()) {
			if (Math.random() < 0.01 && this.memory.killCount > 0 && this.memory.type != MISSION_REMOTE_HARASS_LIGHT) {
				this.grabExtraCreeps(this.memory.pending ? this.memory.sourceRoomName : this.memory.targetRoomName);
			}

			for (var creepName of this.memory.assignedCreeps) {
				if (Game.creeps[creepName] && Game.creeps[creepName].ticksToLive < 50) {
					// Stolen from Geir. When TTL is low, just yolo into the room and do some confusion/tower energy cost
					Game.creeps[creepName].mem.targetRoom = this.memory.targetRoomName
				}
			}


			for (var roomName of this.memory.harassRooms) {
				var room = Game.rooms[roomName];
				if (room) {
					// We're targeting civilians. Combat creeps we'd actually prefer to avoid
					let interestingCreeps = room.getAllHostileCreepsWithBodyParts([WORK, CARRY, CLAIM], true)

					this.memory.interestingCreepsSeen[roomName] = this.memory.interestingCreepsSeen[roomName] || []

					for (let creep of interestingCreeps) {
						if (this.memory.interestingCreepsSeen[roomName].indexOf(creep.id) == -1) {
							// Oooh, that's interesting
							this.memory.interestingCreepsSeen[roomName].push(creep.id);
						}
						if (this.memory.interestingCreepsSeenTotal.indexOf(creep.id) == -1) {
							// Oooh, that's interesting
							this.memory.interestingCreepsSeenTotal.push(creep.id);
						}
					}

					if (!this.memory.pending) {
						if (room) {
							// this.memory.killCount += room.killCount
							this.memory.denialCount += roomIntel.getEffectiveNumSources(roomName);
						}
					}

					// One structure means controller
					this.memory.hasStructures = this.memory.hasStructures || {}
					this.memory.hasStructures[roomName] = this.memory.hasStructures[roomName] || (room.find2(FIND_STRUCTURES).length > 1);
				}
			}

			if (!this.memory.pending) {
				for (var roomName of this.memory.harassRooms) {
					if (Game.rooms[roomName]) {
						var interestingCreeps = Game.rooms[roomName].getAllHostileCreepsWithBodyParts([WORK, CARRY, CLAIM], true)

						if (interestingCreeps.length == 0) {
							for (var creepName of this.memory.assignedCreeps) {
								if (Game.creeps[creepName]) {
									if (Game.creeps[creepName].mem.targetRoom == roomName) {
										let newRoom = _.sample(this.memory.harassRooms)
										if (!Game.rooms[newRoom] || Game.rooms[newRoom].find(FIND_HOSTILE_CREEPS).length) {
											Game.creeps[creepName].mem.targetRoom = newRoom;
										}
									}
								}
							}
						}
						// TODO: Run a risk assessment. Are we going to lose to combat creeps? If so, signal a retreat
						var dangerousCreeps = Game.rooms[roomName].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true);

						var eNumRanged = 0;
						var eNumHeals = 0;

						for (var creep of dangerousCreeps) {
							var parts = creep.getBoostModifiedCombatParts(true);

							eNumRanged += parts.numRanged;
							eNumHeals += parts.numHeal;
						}

						let fNumRanged = 0;
						let fNumHeals = 0;

						let fNumTotalRanged = 0;
						let fNumTotalHeals = 0;


						for (var creepName of this.memory.assignedCreeps) {
							if (Game.creeps[creepName]) {
								let parts = Game.creeps[creepName].getBoostModifiedCombatParts(true);

								if (Game.creeps[creepName].room.name == roomName) {
									fNumRanged += parts.numRanged;
									fNumHeals += parts.numHeal;
								}
								fNumTotalRanged += parts.numRanged;
								fNumTotalHeals += parts.numHeal;
							}
						}

						// console.log(eNumRanged, eNumHeals, fNumRanged, fNumHeals, this.memory.assignedCreeps, this.memory.harassRooms)

						// Run away! We're not looking for fair fights here.
						let mod = 1.1;

						// Run away! We're not looking for fair fights here.
						if ((eNumRanged * 10 + eNumHeals * 12) * mod >= fNumRanged * 10 + fNumHeals * 12) {
							let allMove = ((eNumRanged * 10 + eNumHeals * 12) * mod >= fNumTotalRanged * 10 + fNumTotalHeals * 12);

							// We've got nowhere to run to. Let's can the mission.
							if (this.memory.harassRooms.length == 1 && allMove) {
								for (var creepName of _.clone(this.memory.assignedCreeps)) {
									if (Game.creeps[creepName]) {
										Game.creeps[creepName].memory.retreat = true;
										Game.creeps[creepName].memory.ID = 0;
										_.pull(this.memory.assignedCreeps, creepName);
										Memory.combatManager.idlePool.push(creepName)

										console.log("Single room harass outmatched:", this.memory.targetRoomName, roomName)


										// console.log(creepName)
										// console.log(Game.creeps[creepName].memory.retreat)
										// console.log(Game.creeps[creepName].memory.ID)
										// console.log(this.memory.assignedCreeps)
										// console.log(Memory.combatManager.idlePool)
									}
								}
							}
							else {
								for (var creepName of this.memory.assignedCreeps) {
									if (Game.creeps[creepName]) {
										if ((allMove && Game.creeps[creepName].memory.targetRoom == roomName) || (Game.creeps[creepName].room.name == roomName && Game.creeps[creepName].memory.targetRoom == roomName)) {
											Game.creeps[creepName].memory.targetRoom = _.sample(this.memory.harassRooms);

											if (Game.creeps[creepName].room.name == roomName && Game.creeps[creepName].memory.role != "dismantler") {
												this.memory.bouncedCount++;
											}
											Game.creeps[creepName].forceMoveRooms = true;
										}
									}
								}
							}
						}
					}
				}
			}
		}
		if (this.isActive() && ((this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) || Game.time - this.memory.lastLaunchTick > 2000)) {
			// Completion should be "we're all dead".
			// I think if it's a long time since the start and we're all dead, we can call it a success as we've probably timed out.
			// If it's not many ticks, we've probably died and that's probably a fail.
			// We also want to see action. We're going to count the number of unique creeps we see. If we don't see many we've not had much impact.
			if (Game.time - this.memory.lastLaunchTick > 1450 && this.memory.interestingCreepsSeenTotal.length >= this.memory.harassRooms * 2 * this.memory.numLaunches && this.memory.bouncedCount < 10 * this.memory.numLaunches) {
				this.memory.s++;

		 		// De-escalate if no kills.
		 		if (this.memory.killCount == 0) {
		 			this.memory.e = Math.max(this.memory.e - 1, 0)
		 		}

		 		return this.missionComplete(true);
			}
			else if (Game.time - this.memory.lastLaunchTick < 750 || this.memory.interestingCreepsSeenTotal.length < this.memory.harassRooms * this.memory.numLaunches || this.memory.bouncedCount >= 50 * this.memory.numLaunches) {
				console.log("Harass Fail")
				console.log(Game.time, this.memory.lastLaunchTick)
				console.log(this.memory.harassRooms.length)
				console.log(this.memory.interestingCreepsSeenTotal.length)
				console.log(this.memory.bouncedCount)
				console.log(this.memory.killCount, this.memory.bC, this.memory.numLaunches)
				console.log(this.memory.targetRoomName, this.memory.e)

				this.memory.f++;
				// Only escalate if we think we saw interesting stuff and can build a beefier creep, otherwise take a nap
				if (Game.time - this.memory.lastLaunchTick < 750 || this.memory.bouncedCount >= 50 * this.memory.numLaunches) {
					this.memory.rangeHealRatio = this.getRandomRangedHealRatio();
					this.memory.bodyOrder = this.getRandomBodyOrder();
					this.memory.maxBonusTough = this.getRandomMaxBonusTough();

					if (Memory.rooms[this.memory.targetRoomName]) {
						if (this.memory.e < Math.round((Memory.rooms[this.memory.targetRoomName].rcl || 0) / 2)) {
							this.memory.e = Math.round((Memory.rooms[this.memory.targetRoomName].rcl || 0) / 2);
						}
					}
					if (Game.rooms[this.memory.sourceRoomName].energyCapacityAvailable >= (this.memory.e + 1) * 700 && (this.memory.e + 1) * 5 <= MAX_CREEP_SIZE) {
						this.memory.e++;
					}
					if (this.getSuccessRate() < 0.5) {
						if (Game.rooms[this.memory.sourceRoomName].energyCapacityAvailable >= (this.memory.e + 1) * 700 && (this.memory.e + 1) * 5 <= MAX_CREEP_SIZE) {
							this.memory.e++;
						}
					}
					// Wait for the guys who killed me to despawn.
					this.memory.fRefreshRate = 1400;
					this.memory.fTick = Game.time;
				}
				else {
					this.memory.fRefreshRate = 5000;
					this.memory.fRefreshRate *= (1.5 - this.getSuccessRate());
					this.memory.fTick = Game.time;
				}
				return this.missionComplete(false);
			}
			return this.missionComplete(true);
		}
		// Need moar. If our guys are still alive and they've managed to kill more than they cost, spawn them some friends.
		else if (Game.time % 10 == 0) { 
			let targetRoomEnergy = (Memory.rooms[this.memory.targetRoomName].storE || 0) + (Memory.rooms[this.memory.targetRoomName].trmE || 0)

			let cost = this.memory.bC

			for (let creepName in this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				cost += creep.mem.c * Memory.stats.yieldPerCPU
			}


			if (Game.time - this.memory.lastLaunchTick >= 1200 &&
				 this.memory.spawningCreeps.length == 0 &&
				 (this.memory.killCount + this.memory.denialCount * 2 > cost || this.memory.tgtE - targetRoomEnergy >= (Memory.rooms[this.memory.targetRoomName.trmX] ? cost * 2 : cost))) {


				// Sanity check. Sum the K:Ds of our harass rooms to provide another confirmation that we're doing well.
				let averageKD = 0;
				for (let harassRoom of this.memory.harassRooms) {
					if (Memory.rooms[harassRoom]) {
						averageKD += (Memory.rooms[harassRoom].kd || 0);
					}
				}

				averageKD /= this.memory.harassRooms.length;

				if (averageKD > 0 && !this.renewRestricted()) {
					// Are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
					// spawning in thinking life is going well.
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
					if (effectiveTeam) {
						console.log(this.memory.sourceRoomName, "relaunching", this.memory.type,  "against", this.memory.targetRoomName)
						console.log(this.memory.killCount, this.memory.bC, this.memory.numLaunches)
						// Attenuate the kill count & cost. If we don't do that we could hit the case where we have 5 good launches we persist through 5 bad ones.
						this.memory.killCount /= 2;
						this.memory.bC /= 2;
						this.memory.numLaunches += 1;
						this.memory.denialCount /= 2;

						if (targetRoomEnergy > this.memory.tgtE) {
							this.memory.tgtE = targetRoomEnergy;
						}
						else {
							this.memory.tgtE = (targetRoomEnergy + this.memory.tgtE) / 2
						}


						this.memory.lastLaunchTick = Game.time;

						this.requestSpawns();
					}
				}
			}
		}

		super.tick();
	}


	requestSpawns() {
		let parentRoom = Game.rooms[this.memory.sourceRoomName]
		let spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		let spawn = spawns[0];

		let body = [];
		if (this.memory.e == 0 || this.memory.type == MISSION_REMOTE_HARASS_LIGHT) {
			if (this.memory.bodyOrder == 0 || this.memory.bodyOrder == 1) {
				body.push(RANGED_ATTACK);
				body.push(MOVE);
			}
			else {
				body.push(MOVE);
				body.push(RANGED_ATTACK);
			}

			if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
				Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += 0.1
			}
		}
		else {
			let e = this.memory.e;

			if (this.memory.p < 0) {
				e *= 1.2;
			}

			if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
				Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += e / 10
			}


			// Build a body based on this ratio for this.memory.e * 700 energy.
			let targetRanged = 1;
			let targetHeal = 1;
			let cost = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[HEAL] + 2 * BODYPART_COST[MOVE];
			let maxCost = Math.min(parentRoom.energyCapacityAvailable, e * 700);

			while ((targetRanged + targetHeal) * 2 < MAX_CREEP_SIZE) {
				let ratio = targetRanged / targetHeal;
				if (ratio < this.memory.rangeHealRatio) {
					let newCost = cost + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
					if (newCost <= maxCost) {
						cost = newCost;
						targetRanged++;
					}
					else {
						break;
					}
				}
				else {
					let newCost = cost + BODYPART_COST[HEAL] + BODYPART_COST[MOVE];
					if (newCost <= maxCost) {
						cost = newCost;
						targetHeal++;
					}
					else {
						// Just plug on another RA. Why not.
						newCost = cost + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
						if (newCost <= maxCost) {
							cost = newCost;
							targetRanged++;
						}
						break;
					}
				}
			}

			let bonusCarry = 0;
			if (parentRoom.memory.spawnUtilization < 0.9) {
				while (cost <= maxCost - BODYPART_COST[MOVE] && bonusCarry < this.memory.maxBonusTough && (targetRanged + targetHeal) * 2 + bonusCarry < MAX_CREEP_SIZE) {
					bonusCarry += 1;
					cost += BODYPART_COST[MOVE];
				}
			}

			for (let i = 0; i < bonusCarry; i++) {
				body.push(MOVE)
			}

			if (this.memory.bodyOrder == 0) {
				for (let i = 0; i < targetRanged; i++) {
					body.push(RANGED_ATTACK)
				}
				for (let i = 0; i < targetRanged + targetHeal - 1; i++) {
					body.push(MOVE)
				}
				for (let i = 0; i < targetHeal; i++) {
					body.push(HEAL)
				}

				body.push(MOVE)
			}
			else if (this.memory.bodyOrder == 1) {
				for (let i = 0; i < Math.floor((targetRanged + targetHeal) / 2); i++) {
					body.push(MOVE)
				}
				for (let i = 0; i < targetRanged; i++) {
					body.push(RANGED_ATTACK)
				}
				for (let i = 0; i < Math.ceil((targetRanged + targetHeal) / 2) - 1; i++) {
					body.push(MOVE)
				}
				for (let i = 0; i < targetHeal; i++) {
					body.push(HEAL)
				}

				body.push(MOVE)
			}
			else if (this.memory.bodyOrder == 2) {
				for (let i = 0; i < targetRanged + targetHeal - 1; i++) {
					body.push(MOVE)
				}
				for (let i = 0; i < targetRanged; i++) {
					body.push(RANGED_ATTACK)
				}
				for (let i = 0; i < targetHeal; i++) {
					body.push(HEAL)
				}

				body.push(MOVE)
			}
		}

		// One for each room.
		for (let i = 0; i < this.memory.harassRooms.length; i++) {
			let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

			if (idleCreep && idleCreep.ticksToLive > 1100) {
				this.assignCreep(idleCreep);
			}
			else {
				this.spawnCreep("ranged", body, {}, spawn)
			}
		}

		// Ok, we've decided to push this beyond the first.
		// Start spawning in special harass units
		if (this.memory.numLaunches > 1) {
			// If they're far enough away that I can be happy they're not my structures, then tear them down!
			if (Math.random() > 0.5) {
				let minDist = Infinity;
				let areStructures = false;
				for (let harassRoomName of this.memory.harassRooms) {
					let dist = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, harassRoomName, true);
					areStructures = areStructures || this.memory.hasStructures[harassRoomName];
					if (dist < minDist) {
						minDist = dist;
					}
				}
				if (areStructures && minDist > 3) {
					let maxCount = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (2 * 150)), Math.floor(MAX_CREEP_SIZE / 2));
					let eCount = this.memory.e == 0 ? 1 : this.memory.e * 2.5;
					let count = Math.min(eCount, maxCount);

					body = [];
					for (let i = 0; i < count; i++) {
						body.push(WORK)
					}
					for (let i = 0; i < count; i++) {
						body.push(MOVE)
					}

					for (let i = 0; i < this.memory.harassRooms.length; i++) {
						if (this.memory.hasStructures[this.memory.harassRooms[i]]) {
							let idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

							if (idleCreep && idleCreep.ticksToLive > 1100) {
								this.assignCreep(idleCreep);
							}
							else {
								this.spawnCreep("deconstructor", body, {}, spawn)
							}
						}
					}

				}
			}
		}

		// Co-opt the idle creeps. 
		this.grabExtraCreeps(this.memory.sourceRoomName);
	}

	cleanMemory() {
		delete this.memory.harassRooms;
		delete this.memory.hasStructures;
		delete this.memory.interestingCreepsSeenTotal;
		delete this.memory.bouncedCount;

		delete this.memory.tgtE;
		delete this.memory.denialCount;

		return super.cleanMemory();
	}


	missionComplete(success) {
		this.cleanMemory();

		return super.missionComplete(success);
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = _.sample(this.memory.harassRooms)
	}

	spawnCreep(role, body, boosts, spawn, extraMemory) {
		extraMemory = extraMemory || {};

		// console.log(JSON.stringify(extraMemory))

		if (!extraMemory.targetRoom) {
			extraMemory.targetRoom = _.sample(this.memory.harassRooms);
		}

		if (!extraMemory.fallbackRoom) {
			extraMemory.fallbackRoom = this.memory.sourceRoomName;
		}

		// console.log(JSON.stringify(extraMemory))

		let name = super.spawnCreep(role, body, boosts, spawn, extraMemory)

		// console.log(JSON.stringify(extraMemory))
		return name
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}

module.exports = RemoteHarassMission