"use strict";

const Mission = require('missionBase')

const idleCreepManager = require('idleCreepManager')
const missionInfo = require('missionInfo')
const safeRoute = require('safeRoute');
const util = require('util');
const creepCreator = require('creepCreator');
const intelAI = require('intelAI');
const roomIntel = require('roomIntel');

const alphaIntercepted = Math.exp(-1/300)


class WeakRoomAttackMission extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_WEAK_ROOM_ATTACK;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// If we fail, don't go again for a while.
		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.fRefreshRate = memory.fRefreshRate || 3000;
			memory.wasRequest = false

			// We want to do an escalating engagement.
			// Start small, if we fail, escalate.
			let sum = 0;
			let cnt = 0;

			for (let otherMission of Memory.combatManager.currentMissions[memory.type]) {
				if (otherMission.targetRoomName == targetRoomName && otherMission.sourceRoomName != sourceRoomName) {
					sum += (otherMission.e || 0)
					cnt++;
				}
			}
			if (!memory.e) {
				if (cnt == 0) {
					memory.e = 0;
				}
				else {
					memory.e = sum / cnt;
				}
				memory.e += Math.min(10, (Memory.rooms[targetRoomName].numWeakRoomAttacksFailed || 0))
			}
			else if (cnt) {
				memory.e = (memory.e + sum / cnt) / 2
			}

			if (!memory.s && !memory.f) {				
				if (priority < 0) {				
					memory.e += Math.min(10, -priority / 10)
				}
			}

			// De-escalate from time to time
			if (memory.e && Math.random() > 0.9) {
				memory.e--;
			}

			memory.routeCost = Math.round((safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) || 15) * 10) / 10;
			memory.e = Math.max(Game.rooms[sourceRoomName].effectiveLevel - Math.round(memory.routeCost), memory.e);

			memory.formations = [];
			memory.preSpawnOffset = 0;
			memory.numLaunches = 1;
			memory.numLaunchesSinceOutOfCreeps = 1;

			memory.routeClear = 1

			// Co-opt the idle creeps.
			this.grabExtraCreeps(sourceRoomName);

			memory.attackedController = undefined;
			memory.escalated = undefined;
		}
	}

	grabExtraCreeps(roomName) {
		for (var idleCreep of _.clone(Memory.combatManager.idlePool)) {
			if (Game.creeps[idleCreep] && Math.random() > .25 && Game.creeps[idleCreep].ticksToLive > this.memory.routeCost * 50) {
				if (!idleCreepManager.canPullIdleCreep(Game.creeps[idleCreep], roomName)) {
					continue;
				}

				var pathCost = safeRoute.getSafeRouteCost(Game.creeps[idleCreep].room.name, roomName, true);

				if (pathCost > 4) continue;

				this.assignCreep(Game.creeps[idleCreep]);
				_.pull(Memory.combatManager.idlePool, idleCreep)
			}
		}
	}

	escalateBasedOnVisible() {
		var dangerousCreeps = Game.rooms[this.memory.targetRoomName].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true);
		let mmem = this.memory;
		let tmem = Memory.rooms[this.memory.targetRoomName];

		if (dangerousCreeps.length) {
			var eNumAttack = 0;
			var fNumAttack = 0;
			var eNumRanged = 0;
			var fNumRanged = 0;
			var eNumHeals = 0;
			var fNumHeals = 0;

			for (var creep of dangerousCreeps) {
				var parts = creep.getBoostModifiedCombatParts(false);

				eNumAttack += parts.numAttack;
				eNumRanged += parts.numRanged;
				eNumHeals += parts.numHeal;
			}

			for (var creepName of mmem.assignedCreeps) {
				if (Game.creeps[creepName]) {
			   		var parts = Game.creeps[creepName].getBoostModifiedCombatParts(false);

			   		let mod = creep.room.name == this.memory.targetRoomName ? 1 : 0.5
			   		fNumAttack += parts.numAttack * mod;
			   		fNumRanged += parts.numRanged * mod;
			   		fNumHeals += parts.numHeal * mod;
				}
			}

			for (let creepName of mmem.spawningCreeps) {
				var body = this.getSpawningBody(creepName);
				var boosts = this.getSpawningBoosts(creepName);

				let numAttack = 0;
				let numRanged = 0;
				let numHeal = 0;
				let numTough = 0;
				let numExtra = 0;

				let attackBoostTier = 0;
				let rangedBoostTier = 0;
				let healBoostTier = 0;
				for (let boost in boosts) {
					if (boost == RESOURCE_UTRIUM_HYDRIDE) {
						attackBoostTier = 1;
					}
					else if (boost == RESOURCE_UTRIUM_ACID) {
						attackBoostTier = 2;
					}
					else if (boost == RESOURCE_CATALYZED_UTRIUM_ACID) {
						attackBoostTier = 3;
					}
					else if (boost == RESOURCE_KEANIUM_OXIDE) {
						rangedBoostTier = 1;
					}
					else if (boost == RESOURCE_KEANIUM_ALKALIDE) {
						rangedBoostTier = 2;
					}
					else if (boost == RESOURCE_CATALYZED_KEANIUM_ALKALIDE) {
						rangedBoostTier = 3;
					}
					else if (boost == RESOURCE_LEMERGIUM_OXIDE) {
						healBoostTier = 1;
					}
					else if (boost == RESOURCE_LEMERGIUM_ALKALIDE) {
						healBoostTier = 2;
					}
					else if (boost == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) {
						healBoostTier = 3;
					}
				}


				for (var bodyPart of body) {
					if (bodyPart == ATTACK) {
						numAttack += attackBoostTier + 1;
					}
					else if (bodyPart == RANGED_ATTACK) {
						numRanged += rangedBoostTier + 1;
					}
					else if (bodyPart == HEAL) {
						numHeal += healBoostTier + 1;
					}
					else if (bodyPart == TOUGH) {
						numTough += 1;
					}
					else {
						numExtra += 1;
					}
				}


				let extra = Math.max(0, numExtra - numAttack - numRanged - numHeal);
				numTough += extra;

				numAttack *= (1 + numTough * 0.05);
				numRanged *= (1 + numTough * 0.05);
				numHeal *= (1 + numTough * 0.05);

				fNumAttack += numAttack * 0.3;
				fNumRanged += numRanged * 0.3;
				fNumHeals += numHeal * 0.3;
			}



			// If they beat me in one field, escalate for next round and push next round sooner
			if ((eNumAttack > fNumAttack * 1.1 ? 1 : 0) + (eNumRanged > fNumRanged * 1.1 ? 1 : 0) + (eNumHeals > fNumHeals * 1.1 ? 1 : 0) >= 1) {
				// Game.time - mmem.lastLaunchTick >= Math.max(500, 1100 - (mmem.routeCost || 15) * 50 + mmem.preSpawnOffset)
				let launchTickToTrigger = Game.time - Math.max(500, (1100 - (mmem.routeCost || 15) * 50 + mmem.preSpawnOffset))

				let mod = tmem.hostileBoostedCreeps ? 2 : 1;

				if ((eNumAttack > fNumAttack * 2 ? 1 : 0) + (eNumRanged > fNumRanged * 2 ? 1 : 0) + (eNumHeals > fNumHeals * 2 ? 1 : 0) >= 1) {
					mmem.e += 4 * mod;
					mmem.lastLaunchTick = Math.max(mmem.lastLaunchTick - 400 * mod, launchTickToTrigger)
				}
				else if ((eNumAttack > fNumAttack * 1.5 ? 1 : 0) + (eNumRanged > fNumRanged * 1.5 ? 1 : 0) + (eNumHeals > fNumHeals * 1.5 ? 1 : 0) >= 1) {
					mmem.e += 2 * mod;
					mmem.lastLaunchTick = Math.max(mmem.lastLaunchTick - 200 * mod, launchTickToTrigger)					
				}
				else if ((eNumAttack > fNumAttack * 1.1 ? 1 : 0) + (eNumRanged > fNumRanged * 1.1 ? 1 : 0) + (eNumHeals > fNumHeals * 1.1 ? 1 : 0) > 1) {
					mmem.e += 1 * mod;
					mmem.lastLaunchTick = Math.max(mmem.lastLaunchTick - 100 * mod, launchTickToTrigger)
				}
				else {
					mmem.e += 0.5 * mod;
					mmem.lastLaunchTick = Math.max(mmem.lastLaunchTick - 50 * mod, launchTickToTrigger)					
				}
				mmem.escalated = 1;
			}
		}
	}


	tick() {
		// let a = Game.cpu.getUsed()
		let mmem = this.memory;
		if (this.isActive()) {

			let targetRoomName = mmem.targetRoomName;
			let sourceRoomName = mmem.sourceRoomName;
			let tmem = Memory.rooms[targetRoomName];

			if (Game.map.visual) Game.map.visual.line(new RoomPosition(25, 25, sourceRoomName), new RoomPosition(25, 25, targetRoomName), {color: "#00ff00", width: 3})

			if (Math.random() < 0.01) {
				this.memory.routeCost = safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) || this.memory.routeCost;
			}

			if (!tmem) {
				console.log("Weak room attack can't find room in memory!", mmem.targetRoomName);
				mmem.fTick = Game.time;
				mmem.f++;
				this.missionComplete(false);
				return;
			}

			// console.log("x", Game.cpu.getUsed() - a)

			// if (!mmem.pending && Math.random() < 0.1) {
			// 	if (Game.rooms[sourceRoomName].lootRooms.indexOf(targetRoomName) == -1 && safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, true) < 4) {
			// 		Game.rooms[sourceRoomName].lootRooms.push(targetRoomName);
			// 	}
			// }
			// console.log("y", Game.cpu.getUsed() - a)

			if (Math.random() < 0.01) {
				this.grabExtraCreeps(mmem.pending ? sourceRoomName : targetRoomName);
			}
			// console.log("z", Game.cpu.getUsed() - a)

			let useShift = false;
			// This is a bit more expensive than I'd like.
			for (let formationIdx in this.memory.formations) {
				let formation = this.memory.formations[formationIdx];

				let cnt = 0;
				for (let formationCreepName of formation) {
					let formationCreep = Game.creeps[formationCreepName]
					if (!formationCreep) continue;
					cnt ++

					formationCreep.mem.formationCreeps = _.clone(formation);
					formationCreep.mem.allSquadCreeps = _.clone(formation);
					formationCreep.combatSnake = 1;
				}

				// Old and dead formation. Clean it.
				if (formationIdx == 0 && cnt == 0 && this.memory.formations.length > 5) {
					useShift = true;
				}
			}

			if (useShift && !mmem.pending && mmem.spawningCreeps.length == 0) {
				this.memory.formations.shift();
			}

			if (!mmem.pending && mmem.numLaunches > 1) {
				if (!Game.rooms[targetRoomName]) {
					mmem.preSpawnOffset = Math.max(-200, mmem.preSpawnOffset - 1)
				}
				else {
					mmem.preSpawnOffset = Math.min(0, mmem.preSpawnOffset + 0.01)	
				}
			}

			if (!mmem.pending) {
				let numAlive = 0;
				let numClear = 0;
				for (let creepName of mmem.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (!creep) continue

					numAlive++
					numClear += creep.room.name === creep.mem.targetRoom || creep.room.dangerous !== 2 ? 1 : 0
				}

				if (numAlive) {
					mmem.routeClear = alphaIntercepted * (mmem.routeClear || 1) + (1 - alphaIntercepted) * numClear / numAlive
				}

				if (mmem.numLaunches > 1 && !Game.rooms[targetRoomName]) {
					mmem.routeClear = alphaIntercepted * (mmem.routeClear || 1)	
				}
			}

			// console.log("a", Game.cpu.getUsed() - a)


			// This runs out-of-sync with regular spawns
			if (!mmem.pending &&
				 (mmem.e >= 5 || tmem.numWeakRoomAttacksFailed || tmem.closestRoomRange < 2 || tmem.numAttacksFailed || Memory.stats.hateCounter[tmem.owner] > 100000) && 
				(!mmem.attackedController || Game.time - mmem.attackedController > CONTROLLER_ATTACK_BLOCKED_UPGRADE * .8) &&
				!Memory.banzai &&
				tmem &&
				tmem.controllerAdjacency &&
				mmem.spawningCreeps.length == 0 &&
				Game.rooms[targetRoomName] &&
				(Game.rooms[targetRoomName].controller.upgradeBlocked || 0) < CREEP_CLAIM_LIFE_TIME &&
				!Game.rooms[targetRoomName].dangerous &&
				!Game.rooms[targetRoomName].controller.safeMode &&
				mmem.routeCost < CREEP_CLAIM_LIFE_TIME / 60) {
				var spawns = Game.rooms[sourceRoomName].find(FIND_MY_SPAWNS);
				var spawn = spawns[0];

				// Factor in escalation?
				let numAttackers = Math.max(1, Math.min(Math.round(((CREEP_CLAIM_LIFE_TIME / 60) - mmem.routeCost)), tmem.controllerAdjacency))

				let names = [];
				for (let i = 0; i < numAttackers; i++) {
					names.push("ca" + mmem.ID + "_" + Memory.creepCount++)
				}

				let extraMemory = {"targetRoom" : targetRoomName, "teamNames" : names}

				for (let i = 0; i < numAttackers; i++) {
					spawn.addPrioritySpawn("controllerAttacker", extraMemory, names[i]);
				}
				mmem.attackedController = Game.time;
			}

			// console.log("b", Game.cpu.getUsed() - a)

			if (!mmem.escalated && Game.rooms[targetRoomName]) {
				this.escalateBasedOnVisible()
			}

			// console.log("c", Game.cpu.getUsed() - a)

			// If there's a tower then nope out of there.
			let isTower = false
			if (Game.rooms[targetRoomName]) {
				let towers = Game.rooms[targetRoomName].getTowers();

				let towerEnergy = 0;
				for (let tower of towers) {
					towerEnergy += tower.energy;
				}


				if (towerEnergy > 200) {
					isTower = true
					if (mmem.e < 100) {						
						console.log("Weak room attack has hit a tower", targetRoomName)
						mmem.fTick = Game.time;
						mmem.f++;
						this.missionComplete(false);
						return;
					}
				}

				if (Game.rooms[targetRoomName].dangerous == 2) {
					mmem.e *= 1.0002
				}
				else if (Game.rooms[targetRoomName].find(FIND_HOSTILE_CREEPS).length) {
					mmem.e *= 1.0001
				}
				else {
					mmem.e /= 1.0001	
				}
			}

			function testAndRespawn(mission, skipEffectiveCheck) {
				if (!isTower &&
					 Game.time - mmem.lastLaunchTick >= Math.max(500, 1100 - (mmem.routeCost || 15) * 50 + mmem.preSpawnOffset) &&
					 mmem.spawningCreeps.length == 0 &&
					 Game.rooms[targetRoomName] &&
					 // !tmem.hostileBoostedCreeps &&
					 Game.map.getRoomStatus(targetRoomName).status == global.zoneType &&
					 !mission.renewRestricted()) {
					// Quick sanity check: are our guys an effective team? Somebody may cripple us and leave us alive, and we don't want to keep
					// spawning in thinking life is going well.
					let effectiveTeam = false;

					if (!skipEffectiveCheck) {
						for (var creepName of mmem.assignedCreeps) {
							var creep = Game.creeps[creepName];
							if (creep) {
								if (creep.hasBodyPart(ATTACK) || creep.hasBodyPart(RANGED_ATTACK) || creep.hasBodyPart(HEAL)) {
									effectiveTeam = true;
									break;
								}
							}
						}
					}

					if (skipEffectiveCheck || effectiveTeam) {
						if (mission.requestSpawns()) {						
							console.log("Renewing", sourceRoomName, "weak room attack against", targetRoomName)
							mmem.lastLaunchTick = Game.time;
							mmem.numLaunches++
							mmem.numLaunchesSinceOutOfCreeps++

							// mmem.e += tmem.DT

							// De-escalate if we're not killing more than we cost
							if (mmem.killCount < mmem.bC && Math.random() < 0.5) {
								mmem.e = Math.max(mmem.e - 1, 0)
							}
							// Reset the clock
							mmem.escalated = undefined;
							mmem.killCount = mmem.killCount / 2
							// || 0 is grandfathering
							mmem.bC = (mmem.bC || 0) / 2

							return true
						}
						else {
							mmem.routeClear = mmem.routeClear * 0.99 + 0.01
							mmem.e /= 1.001
						}
					}
					return false
				}
			}


			if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller.safeMode && Game.time - mmem.startTick > WEAK_ROOM_ATTACK_SAFE_MODE_PRESPAWN) {
				// They safe moded
				Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT][targetRoomName] = Game.time + Game.rooms[targetRoomName].controller.safeMode
				console.log("Weak room attack has triggered safe mode", targetRoomName)
				mmem.e++;
				mmem.s++;
				this.missionComplete(true);
				return;
			}
			// Room is no longer owned by somebody else.
			else if (Game.rooms[targetRoomName] &&
				(!Game.rooms[targetRoomName].controller.owner || Game.rooms[targetRoomName].controller.owner.username == util.getMyName())) {
				console.log("Weak room attack has removed owner", targetRoomName);
				mmem.s++;
				mmem.e = Math.max(1, mmem.e - 1);
				this.missionComplete(true);
				return;
			}
			else if (mmem.assignedCreeps.length == 0 && mmem.spawningCreeps.length == 0) {
				if (Game.time - mmem.lastLaunchTick <= 1100) { // 1100 is minimum idle creep ttl at mission creation
					if (Game.time - mmem.lastLaunchTick == 1) {
						console.log("Weak room attack has crapped out on launch", targetRoomName, Game.time - mmem.lastLaunchTick)
						this.missionComplete(true);

						// I think I fixed this by adding a returnVal check in the launcher, but if not, 100 tick delay might help

						// Give it 100 ticks
						// mmem.fTick = Game.time - mmem.fRefreshRate + 100;
						return;
					}
					else {
						console.log("Weak room attack has lost all creeps earlier than desired", targetRoomName, Game.time - mmem.lastLaunchTick)

						if (mmem.numLaunchesSinceOutOfCreeps > 5) {
							if (testAndRespawn(this, true)) {
								console.log("Respawning anyway", mmem.numLaunchesSinceOutOfCreeps)
								mmem.numLaunchesSinceOutOfCreeps -= 5
							}
						}
						else {
							console.log("Marking as failed")

							tmem.numWeakRoomAttacksFailed = (tmem.numWeakRoomAttacksFailed || 0) + 1;

							// Oh, we're all dead before expected.

							// If we lived more than 500 ticks post launch, just escalate it.
							if (Game.time - mmem.lastLaunchTick < 500) {
								mmem.e += Game.rooms[sourceRoomName].effectiveLevel; 
								mmem.fTick = Game.time;
								this.missionComplete(false);
							}
							else {
								mmem.e += Math.round(Game.rooms[sourceRoomName].effectiveLevel / 2); 
								Memory.combatManager.requestedMissions[MISSION_WEAK_ROOM_ATTACK][this.memory.targetRoomName] = Game.time;
								this.missionComplete(true);
							}
							return;
						}
					}
				}
				// Mission complete! Our creeps should live at least 1500 ticks, and we've decided not to respawn for some reason.
				else {
					// Just keep pushing this. It'll hit a 3k timer in missionBase
					if (Game.time - mmem.lastLaunchTick < 3000) {						
						if (Game.time % 10 == 0) console.log("Weak room attack has lost all creeps. Pushing respawn a bit longer", Game.time - mmem.lastLaunchTick)
						testAndRespawn(this, true)
					}
					else {
						console.log("Weak room attack has lost all creeps and not respawned for some reason", targetRoomName)
						mmem.s++;
						this.missionComplete(true);
						return;
					}
				}
			}
			// Need moar. Our last guys are still alive, so back them up.
			else {
				testAndRespawn(this, false);
			}

			// console.log("d", Game.cpu.getUsed() - a)

			// Mark this as a protect room. This means we'll get dynamic reserves that'll come and go if enemy gets fighty.
			if (Memory.rooms[sourceRoomName].protectRooms.indexOf(targetRoomName) == -1) {
				Memory.rooms[sourceRoomName].protectRooms.push(targetRoomName);
			}
		}

		this.formationPairRenew()

		// console.log("e", Game.cpu.getUsed() - a)

		super.tick();

		// console.log("f", Game.cpu.getUsed() - a)
	}

	requestSpawns(partWild = 1, noWild = false) {
		var parentRoom = Game.rooms[this.memory.sourceRoomName]
		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return;

		var spawn = spawns[0];

		let e = this.memory.e;

		// Up to 10x. That's a big x
		if (this.memory.routeClear != 1) {
			e /= Math.max(this.memory.routeClear, 0.1)
		}

		// They're dead Jim
		if (Memory.rooms[this.memory.targetRoomName].DT < 0.001 && intelAI.getPlayerDamagedRoomsFraction(Memory.rooms[this.memory.targetRoomName].owner) == 1) {
			noWild = true;
			e /= 2;
		}

		let preWildE = e;

		// Parent room is doing just fine, go wild.
		let goWild = false;
		if (!noWild && !parentRoom.restrictOffensiveMissions(this.memory.targetRoomName, false, true, false)) {
			goWild = true;
			e *= 1.25;
			if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].controller.ticksToDowngrade < 1500) {
				e += 1;
				e *= 1.25;
			}
			else if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[Game.rooms[this.memory.targetRoomName].controller.level] / 2) {
				e += 1;
				e *= 1.25;
			}

			if (Memory.rooms[this.memory.targetRoomName].twrX && Memory.rooms[this.memory.targetRoomName].twrX.length) {
				e += 1;
				e *= 1.25;
			}
			if (Memory.rooms[this.memory.targetRoomName].spwnX && Memory.rooms[this.memory.targetRoomName].spwnX.length) {
				e += 1;
				e *= 1.25;
			}

			if ((Memory.rooms[this.memory.targetRoomName].numAttacksFailed || 0) > 2 || 
				(Memory.rooms[this.memory.targetRoomName].numAttacksFizzled || 0) > 2 || 
				(Memory.rooms[this.memory.targetRoomName].numWeakRoomAttacksFailed || 0) > 2 ||  
				intelAI.strugglingToKillRooms(Memory.rooms[this.memory.targetRoomName].owner) >= 5) {
				e += 1;
				e *= 1.25;
			}
			if (Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].controller.progress > Game.rooms[this.memory.targetRoomName].controller.progressTotal) {
				e += 1;
				e *= 1.25;
			}
			if (!Memory.rooms[this.memory.targetRoomName].controllerAdjacency) {
				e += 1;
				e *= 1.25;
			}
		}

		if (partWild) {
			e = preWildE * (1 - partWild) + e * partWild
		}

		e = Math.max(e, 0.25)

		// Need to open that up.
		if (!Memory.rooms[this.memory.targetRoomName].controllerAdjacency) {
			e = Math.max(e, 2)
		}

		let eCap = parentRoom.energyCapacityAvailable

		// Escalating engagment.
		let maxCountA = Math.min(Math.floor(eCap / (1 * 80 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));
		let maxCountR = Math.min(Math.floor(eCap / (1 * 150 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));
		let maxCountH = Math.min(Math.floor(eCap / (1 * 250 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));

		let eCountA = Math.round(e * 714 / 130);
		let eCountR = Math.round(e * 699 / 200);
		let eCountH = Math.round(e * 749 / 300);

		let hostilePartsA = Memory.rooms[this.memory.targetRoomName].creepCombatPartsAttack || 0;
		let hostilePartsR = Memory.rooms[this.memory.targetRoomName].creepCombatPartsRanged || 0;
		let hostilePartsH = Memory.rooms[this.memory.targetRoomName].creepCombatPartsHeal || 0;

		let targetPartsA = Math.max(eCountA, hostilePartsA);
		let targetPartsR = Math.max(eCountR, hostilePartsR);
		let targetPartsH = Math.max(eCountH, hostilePartsH);

		// let swampRatio = roomIntel.getSwampRatio(this.memory.targetRoomName)
		// let wallRatio = roomIntel.getWallRatio(this.memory.targetRoomName)

		// let realsR = swampRatio / (1 - wallRatio);
		// targetPartsA = Math.round(targetPartsA * (1 - realsR));
		// targetPartsR = Math.round(targetPartsR * (1 + realsR));

		let deltaA = 0;
		let deltaR = 0;
		let deltaH = 0;
		for (let creepName of this.memory.assignedCreeps) {
			var creep = Game.creeps[creepName];
			// Anybody who is going to be around for a while can contribute. Count as half
			if (creep && creep.ticksToLive > 1100) {
				var combatParts = creep.getBoostModifiedCombatParts(creep.spawning ? false : true);
				deltaA += Math.round(combatParts.numAttack / 2);
				deltaR += Math.round(combatParts.numRanged / 2);
				deltaH += Math.round(combatParts.numHeal / 2);
			}
		}

		targetPartsA = Math.max(targetPartsA / 2, targetPartsA - deltaA)
		targetPartsR = Math.max(targetPartsR / 2, targetPartsR - deltaR)
		targetPartsH = Math.max(targetPartsH / 2, targetPartsH - deltaH)

		if (targetPartsA < 0 ) targetPartsA = 0;
		if (targetPartsR < 0 ) targetPartsR = 0;
		if (targetPartsH < 0 ) targetPartsH = 0;

		// let numSpawnsA = Math.max(1, Math.ceil(targetPartsA / maxCountA));
		// let numSpawnsR = Math.max(1, Math.ceil(targetPartsR / maxCountR));
		// let numSpawnsH = Math.max(1, Math.ceil(targetPartsH / maxCountH));

		// let countA = Math.max(1, Math.min(targetPartsA, maxCountA));
		// let countR = Math.max(1, Math.min(targetPartsR, maxCountR));
		// let countH = Math.max(1, Math.min(targetPartsH, maxCountH));


		// console.log("WA count, num", countA, numSpawnsA, countR, numSpawnsR, countH, numSpawnsH)

		let swampRatio = roomIntel.getSwampRatio(this.memory.targetRoomName) / (1 - roomIntel.getWallRatio(this.memory.targetRoomName))

		// if (countA && countR && countH) {
			let eps = 1e-6
			let step = 0;
			let ramboDef = {body: []}
			while (!ramboDef.body.length && step < 20) {
				let moveRatio = 1
				if (swampRatio > 0.8) {
					moveRatio = 3
				}
				else if (swampRatio > 0.7) {
					moveRatio = 2
				}

				ramboDef = creepCreator.createBestRanged(parentRoom, step > 0, true, false, undefined, targetPartsR * (1 - step * 0.05), undefined, undefined, step >= 5, {moveRatio: moveRatio})
				if (!ramboDef.body.length) {
					step++
				}
			}

			if (!ramboDef.body.length) {
				return
			}


			let numRambos = Math.ceil(1 / (1 - step * 0.05) - eps);

			step = 0
			let healerDef = {body: []}
			let tankDef = {body: []}
			while ((!healerDef.body.length || !tankDef.body.length) && step < 20) {

				let moveRatio = 1
				if (swampRatio > 0.8) {
					moveRatio = 5
				}
				else if (swampRatio > 0.7) {
					moveRatio = 4
				}
				else if (swampRatio > 0.6) {
					moveRatio = 3
				}
				else if (swampRatio > 0.5) {
					moveRatio = 2
				}

				healerDef = creepCreator.createBestHeal(parentRoom, step > 0 ? 1 : 0, true, false, undefined, targetPartsH * (1 - step * 0.05), undefined, step >= 5, {moveRatio: moveRatio})
				tankDef = creepCreator.createBestTank(parentRoom, step > 0, false, undefined, targetPartsA * (1 - step * 0.05), false, step >= 5, undefined, {moveRatio: moveRatio})

				if (!healerDef.body.length || !tankDef.body.length) {
					step++
				}
			}

			if (!healerDef.body.length || !tankDef.body.length) {
				return
			}

			let numHealerTanks = Math.ceil(1 / (1 - step * 0.05) - eps);


			let totalBodyCount = ramboDef.body.length * numRambos + (healerDef.body.length + tankDef.body.length) * numHealerTanks;
			if (!Game.rooms[this.memory.sourceRoomName].canSupportBodyCount(totalBodyCount, this.memory.wasRequest || (!goWild && this.memory.numLaunches > 1))) {
				console.log(this.memory.sourceRoomName, "can't support", totalBodyCount, "for weak room attack with escalation", e, this.memory.targetRoomName, ". Wild?", goWild, numRambos, numHealerTanks)
				// Game.rooms[this.memory.sourceRoomName].mem.spawningHeavyMission = Game.time


				if (goWild && (partWild || 0) < 0.2 && !noWild) {
					return this.requestSpawns(0, true)
				}
				else if (goWild && !noWild) {
					return this.requestSpawns(partWild * 0.8, false)
				}

				// Try to get something out by slowly dropping e
				// This is 10x the rate we do it when not dangerous, but 
				// also only hits when respawning and is kinda urgent if we want
				// to continue the mission
				this.memory.e /= 1.001
				this.memory.routeClear = this.memory.routeClear * 0.99 + 0.01
				return;
			}
			else if (totalBodyCount > 200) {
				Game.rooms[this.memory.sourceRoomName].mem.spawningHeavyMission = Game.time
			}


			if (Memory.rooms[this.memory.targetRoomName] && Memory.rooms[this.memory.targetRoomName].owner) {
				Memory.attackFocus[Memory.rooms[this.memory.targetRoomName].owner] += 3 * e / 10
			}


			for (let i = 0; i < numRambos; i++) {
				this.spawnCreep("ranged", ramboDef.body, ramboDef.boosts, spawn)
			}

			let roomIsDangerous = Memory.rooms[this.memory.targetRoomName].DT > 0.2 ||
								 ((Memory.rooms[this.memory.targetRoomName].creepCombatPartsRanged || Memory.rooms[this.memory.targetRoomName].creepCombatPartsAttack) && Memory.rooms[this.memory.targetRoomName].hostileBoostedCreeps);

			for (let towerIdx in Memory.rooms[this.memory.targetRoomName].twrX.length) {
				if (Memory.rooms[this.memory.targetRoomName].twrE >= 10) {
					roomIsDangerous = true;
					break;
				}
			}

			// Skip these if it's really super quiet
			if (this.memory.e || roomIsDangerous) {				
				this.memory.formations = this.memory.formations || [];
				for (let i = 0; i < numHealerTanks; i++) {
					let formationCreepNames = []
					formationCreepNames.push(this.spawnCreep("tank", tankDef.body, tankDef.boosts, spawn))
					formationCreepNames.push(this.spawnCreep("ranged", healerDef.body, healerDef.boosts, spawn))
					this.memory.formations.push(formationCreepNames)
				}
			}

			// Spawn the biggest deconstructor that money can buy
			if (!roomIsDangerous && Memory.rooms[this.memory.targetRoomName].wallHP + Memory.rooms[this.memory.targetRoomName].rampHP > 2e6) {
				var bodyD = [];

				let countD = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (BODYPART_COST[WORK] + BODYPART_COST[MOVE])), Math.floor(MAX_CREEP_SIZE / 2));

				for (var i = 0; i < countD - 1; i++) {
					bodyD.push(MOVE)
				}
				for (var i = 0; i < countD; i++) {
					bodyD.push(WORK)
				}
				bodyD.push(MOVE)

				let numSpawnsD = goWild ? 2 : 1;

				for (var i = 0; i< numSpawnsD; i++) {
					var idleCreepD = idleCreepManager.getIdleCreepForBody(bodyD, parentRoom);
					if (idleCreepD && idleCreepD.ticksToLive > 500) {
						this.assignCreep(idleCreepD);
					}
					else {
						this.spawnCreep("deconstructor", bodyD, {}, spawn)
					}
				}
			}
		// }
		// else {
		// 	console.log("Error, trying low power room attack without bodycounts", countA, countR, countH)
		// }

		// First smack in a cheap-shot controller attack with the aim of triggering safe mode or blocking it
		if (this.memory.numLaunches === 1 && 
			Memory.rooms[this.memory.targetRoomName].controllerAdjacency && 
			Memory.rooms[this.memory.targetRoomName].safeModeCooldown < 1000 && 
			!Memory.rooms[this.memory.targetRoomName].upgradeBlocked) {
			let closestRoomRange = Infinity
			let closestRoom
			for (let myRoom of Game.myRooms) {
				if (myRoom.energyCapacityAvailable < 5 * BODYPART_COST[MOVE] + BODYPART_COST[CLAIM]) {
					continue
				}
				let range = safeRoute.getSafeRouteCost(myRoom.name, this.memory.targetRoomName, true, true, 12)
				if (range < closestRoomRange) {
					closestRoom = myRoom
					closestRoomRange = range
				}
			}

			if (closestRoom) {
				let extraMemory = {"targetRoom" : this.memory.targetRoomName}
				closestRoom.spawns[0].addPrioritySpawn("controllerAttacker", extraMemory, undefined, [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM])
				this.memory.attackedController = Game.time;
			}
		}




		return true
	}

	missionComplete(success) {
		let idx = Game.rooms[this.memory.sourceRoomName].lootRooms.indexOf(this.memory.targetRoomName);
		if (idx >= 0) {
			Game.rooms[this.memory.sourceRoomName].lootRooms = Game.rooms[this.memory.sourceRoomName].lootRooms.splice(idx, 1)
		}

		delete this.memory.attackedController;
		delete this.memory.routeCost;
		delete this.memory.formations;
		delete this.memory.numLaunches;
		delete this.memory.numLaunchesSinceOutOfCreeps;
		delete this.memory.preSpawnOffset
		delete this.memory.routeClear
		delete this.memory.wasRequest

		super.missionComplete(success);
	}

	spawnCreep(role, body, boosts, spawn) {
		return super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, fallbackRoom: this.memory.sourceRoomName})
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}


	static requestWeakRoomAttack(targetRoomName, p) {
		Memory.combatManager.requestedMissions[MISSION_WEAK_ROOM_ATTACK][targetRoomName] = Game.time;

		if (!Memory.rooms[targetRoomName]) {
			return 0
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_WEAK_ROOM_ATTACK]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		let renewPriority = p < 0
		let highPriority = !renewPriority && p < 10
		let lowPriority = p > 30

		let maxDist = renewPriority ? 20 : highPriority ? 15 : lowPriority ? 7 : 12

		for (let room of Game.myRooms) {		
			if (room.restrictOffensiveMissions(targetRoomName, renewPriority, lowPriority, highPriority)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, false, maxDist)
			let score = dist - room.effectiveLevel * 4;

			// console.log(room, dist, score)

			if (dist < maxDist && score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_WEAK_ROOM_ATTACK]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			// constructor(memory, sourceRoomName, targetRoomName, createNew, priority, parentAssaultMission) {
			let currentMission = new WeakRoomAttackMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true, p)

			if (currentMission.isActive()) {
				currentMission.wasRequest = p < 0
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Weak room attack spawn failed " + targetRoomName)
					currentMission.memory.ID = 0;
					return
				}

				console.log(bestSourceRoom.name + "Launching weak room attack to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_WEAK_ROOM_ATTACK].push(currentMission.memory);
				return 1
			}
			console.log("Weak room attack activate failed " + targetRoomName)
			return
		}
		else {
			console.log("Weak room attack no spawn room to " + targetRoomName)
		}
	}

}
module.exports = WeakRoomAttackMission