"use strict";

const idleCreepManager = require('idleCreepManager')
const Mission = require('missionBase')
const safeRoute = require('safeRoute');
const creepCreator = require('creepCreator');
const util = require('util');

const mapVisuals = require("mapVisuals")
const intelAI = require("intelAI")



class SeasonalWallRemove extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_SEASONAL_DROP_WALL_REMOVE;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.fRefreshRate = 10000;
			memory.targetRoomName = targetRoomName;

			memory.pairIdx = 0;
			memory.pairNames = [];

			memory.routeCost = Math.round(safeRoute.getSafeRouteCost(sourceRoomName, targetRoomName, false, true) * 10) / 10
		}
	}

	tick() {
		if (Game.map.visual) mapVisuals.get().text("⛏️", new RoomPosition(10, 25, this.memory.targetRoomName), {fontSize: 10})

		if (this.isActive()) {
			let allowRespawn = false;
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep) {
					if (creep.mem.pairIdx !== undefined) {
						creep.mem.pairedName = this.memory.pairNames[creep.mem.pairIdx][0] == creep.name ? this.memory.pairNames[creep.mem.pairIdx][1] : this.memory.pairNames[creep.mem.pairIdx][0]
					}
					if (!creep.mem.maxRenewTime) {
						creep.mem.maxRenewTime = Game.time + 400
					}					
					if (creep.mem.returningToUnboost && 
						Memory.rooms[this.memory.targetRoomName].numSeasonDismantlePositions == 1 &&
						this.memory.assignedCreeps.length <= 2 && 
						this.memory.spawningCreeps.length == 0) {
						allowRespawn = true
					}
				}
			}

			if (!Memory.rooms[this.memory.targetRoomName].seasonWallsToRemove.length) {
				return this.missionComplete();
			}

			if (this.memory.assignedCreeps.length) {
				this.memory.pending = 0;
				for (let creepName of this.memory.assignedCreeps) {
					if (Memory.creeps[creepName]) {
						Memory.creeps[creepName].retreat = false;
					}
				}
				if (Math.random() < 0.01) {
					let newRouteCost = safeRoute.getSafeRouteCost(this.memory.sourceRoomName, this.memory.targetRoomName, false, true);

					if (newRouteCost != Infinity) {
						this.memory.routeCost = Math.round(newRouteCost * 10) / 10
					}
				}

				// TODO: Reenable once fetchers can reason about walls
				if (!Game.rooms[this.memory.sourceRoomName].lootRooms.includes(this.memory.targetRoomName) && Game.rooms[this.memory.targetRoomName] && Game.rooms[this.memory.targetRoomName].find(FIND_HOSTILE_CREEPS).length == 0) {
					Game.rooms[this.memory.sourceRoomName].lootRooms.push(this.memory.targetRoomName)
				}
			}

			// Relaunch
			if ((Game.time - this.memory.lastLaunchTick > 1500 - this.memory.routeCost * 40 || allowRespawn) &&
				Game.rooms[this.memory.targetRoomName] && 
				Memory.rooms[this.memory.targetRoomName] && 
				(Memory.rooms[this.memory.targetRoomName].DT < 1 || (Memory.season2 && this.memory.targetRoomName == "W9S10")) && 
				(!Game.rooms[this.memory.targetRoomName].dangerous || (Memory.season2 && this.memory.targetRoomName == "W9S10"))) {

				if (!this.renewRestricted()) {
					if (this.requestSpawns()) {
						this.memory.numLaunches += 1;
						this.memory.lastLaunchTick = Game.time;
					}
				}

			}

			if (this.memory.assignedCreeps.length == 0 && this.memory.spawningCreeps.length == 0) {
				if (Game.time - this.memory.lastLaunchTick < 1400) {
					this.memory.fTick = Game.time;
					this.memory.f++;
					this.missionComplete(false);
				}
				else {
					this.memory.s++;
					this.missionComplete(true);
				}
				return;
			}
		}
		super.tick();
	}

	requestSpawns() {
		// if (!Memory.anySeasonDropOffAvailable && (this.memory.targetRoomName != "E20S10" || this.memory.sourceRoomName != "E18S8")) {
		// 	console.log("SDWR failed not E18S8 to E20S10")
		// 	return 0
		// }

		// if (this.memory.targetRoomName == "W19S10") {
		// 	return 0
		// }

		// if (Game.gcl.level < 5) return
		if (Game.time - (Memory.combatManager.requestedMissions[this.memory.type][this.memory.targetRoomName] || 0) > 100) {
			return
		}

		// return false
		let parentRoom = Game.rooms[this.memory.sourceRoomName]

		if (parentRoom.defcon < 5) return false

		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return false;

		let spawn = spawns[0];

		let healBoost = parentRoom.getAvailableBoost(util.isHealBoost, 50 * LAB_BOOST_MINERAL, undefined, undefined, true)


		let destroyerOpts = {}
		let tugOpts = {}
		if (this.memory.targetRoomName == "W9S10") {
			// if (Memory.rooms["W10S9"].creepCombatPartsRanged > 25) {
			// 	return false
			// }

			if (util.getBoostTier(healBoost) == 3) {
				destroyerOpts = {tough: 0, move: 20}
			}
			else if (util.getBoostTier(healBoost) == 2) {
				destroyerOpts = {tough: 0, move: 25}
			}
			else {
				return false
			}

		}

		// 	getDesignForEnergyCap(role, energyCap, highUtilization, altDesign, willUseRoads, opts) {

		let destroyerBody = creepCreator.getDesignForEnergyCap("seasonWallDestroyer", parentRoom.energyCapacityAvailable - 50, false, false, false, destroyerOpts)
		tugOpts = {requiredMove: destroyerBody.length - 2 * (destroyerOpts.move || 0), long: this.memory.routeCost > 3}

		if (this.memory.targetRoomName == "W9S10") {
			tugOpts.heal = (destroyerOpts.move || 0)
			tugOpts.requiredMove += (destroyerOpts.move || 0)
			tugOpts.requiredMove += (destroyerOpts.tough || 0)
		}

		let tugBody = creepCreator.getDesignForEnergyCap("seasonTug", parentRoom.energyCapacityAvailable - 50, false, false, false, tugOpts)



		let delta = spawns.length == 3 ? 0.05 : spawns.length == 2 ? 0.075 : 0.1

		// if (parentRoom.restrictUpgraders) {
		// 	delta /= 2
		// }

		let maxPairs = Math.floor((1. - parentRoom.mem.spawnUtilization) / delta)

		if (Memory.season2) {
			maxPairs = Math.max(maxPairs, 1)
			maxPairs = 1
		}

		// if (Game.gcl.level < 5) maxPairs = 1

		if (maxPairs <= 0) return false
		let numPairs = Math.min(maxPairs, Memory.rooms[this.memory.targetRoomName].numSeasonDismantlePositions)

		let destroyerBoosts = {}
		let dismantleBoost = parentRoom.getAvailableBoost(util.isDismantleBoost, 50 * LAB_BOOST_MINERAL, undefined, undefined, true)

		if (this.memory.targetRoomName == "W9S10" && (!dismantleBoost || !healBoost)) {
			if (Memory.rooms["W9S10"].creepCombatPartsRanged > 25) {
				return false
			}
		}
		/*if (this.memory.targetRoomName == "W9S10" && Memory.rooms[this.memory.targetRoomName].DT > 0.2) {
			dismantleBoost = undefined
		}*/

		// if (this.memory.targetRoomName == "W9S10") {
		// 	let toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 10 * LAB_BOOST_MINERAL, undefined, undefined, true)
		// 	if (!toughBoost) {
		// 		return false
		// 	}
		// 	destroyerBoosts[toughBoost] = 1
		// }

		// if (!Memory.anySeasonDropOffAvailable) {
		// 	dismantleBoost = undefined
		// }

		// Want to be able to unboost
		if (dismantleBoost) {			
			let freeLabCount = 0
			for (let lab of parentRoom.labs) {
				if ((lab.cooldown || 0) < 1500) {
					freeLabCount++;
				}
			}

			// 2x as some people may be coming back
			if (freeLabCount < numPairs * 2) {
				console.log("Not boosting due to no expected unboost labs", dismantleBoost)
				dismantleBoost = undefined
			}
		}

		// Not sure if I want to keep this here or not.
		if (dismantleBoost && util.getBoostTier(dismantleBoost) < 2) {
			console.log("Not boosting due to too low boost teir for dismantleBoost", dismantleBoost)
			dismantleBoost = undefined
		}

		if (dismantleBoost) {
			tugOpts.boosted = 1
			tugOpts.long = this.memory.routeCost > 3
			tugOpts.requiredMove = destroyerBody.length - 2 * (destroyerOpts.move || 0) 

			if (this.memory.targetRoomName == "W9S10") {
				tugOpts.heal = (destroyerOpts.move || 0)
				tugOpts.requiredMove += (destroyerOpts.move || 0)
				tugOpts.requiredMove += (destroyerOpts.tough || 0)
			}


			tugBody = creepCreator.getDesignForEnergyCap("seasonTug", parentRoom.energyCapacityAvailable - 50, false, false, false, tugOpts)

			let numBoosts = 0
			for (let part of destroyerBody) {
				if (part == WORK) {
					numBoosts++;
				}
			}
			destroyerBoosts[dismantleBoost] = numBoosts
		}

		let tugBoosts = {}
		if (healBoost && tugOpts.heal) {
			tugBoosts[healBoost] = tugOpts.heal
		}


		for (let i = 0; i < numPairs; i++) {
			this.memory.pairNames[this.memory.pairIdx] = [];

			let wallDestroyerName = this.spawnCreep("seasonWallDestroyer", destroyerBody, destroyerBoosts, spawn, destroyerBoosts)
	
			this.memory.pairNames[this.memory.pairIdx].push(wallDestroyerName)


			let tugName = this.spawnCreep("seasonTug", tugBody, tugBoosts, spawn, destroyerBoosts);
			this.memory.pairNames[this.memory.pairIdx].push(tugName)

			this.memory.pairIdx++
		}

		if (Memory.rooms[this.memory.targetRoomName].DT > 0.01 && intelAI.getMaxHate() > 10000) {
			let threat = Memory.rooms[this.memory.targetRoomName].DT + this.memory.f * 0.5	
			let body = creepCreator.getDesignForEnergyCap("ranged", parentRoom.energyCapacityAvailable * Math.min(1, threat), false, false, false)
			this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: this.memory.targetRoomName})
			if (threat > 1) {
				this.spawnCombatCreep("ranged", body, undefined, spawn, {targetRoom: this.memory.targetRoomName})
			}
		}

		return true
	}

	cleanMemory() {
		delete this.memory.routeCost
		
		delete this.memory.numLaunches
		delete this.memory.effectiveNumLaunches

		delete this.memory.pairIdx
		delete this.memory.pairNames

		return super.cleanMemory();
	}

	missionComplete(success) {
		this.cleanMemory()

		return super.missionComplete(success)
	}

	spawnCreep(role, body, boosts, spawn, destroyerBoosts) {
		if (role == "seasonWallDestroyer") {
			return super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, pairIdx: this.memory.pairIdx, alwaysPulled: 1})		
		}
		else {
			return super.spawnCreep(role, body, boosts, spawn, {targetRoom : this.memory.targetRoomName, pairIdx: this.memory.pairIdx, boostedPair: (destroyerBoosts ? 1 : 0)})
		}
	}

	spawnCombatCreep(role, body, boosts, spawn, extraMem) {
		return super.spawnCreep(role, body, boosts, spawn, extraMem)
	}

	assignCreep(creep) {
		super.assignCreep(creep);
		creep.memory.targetRoom = this.memory.targetRoomName
	}

	get targetRoomName() {
		return this.memory.targetRoomName;
	}
}
module.exports = SeasonalWallRemove