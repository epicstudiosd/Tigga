"use strict";

const idleCreepManager = require('idleCreepManager')
const Mission = require('missionBase')
const safeRoute = require('safeRoute');
const creepCreator = require('creepCreator');
const util = require('util');

const mapVisuals = require("mapVisuals")
const intelAI = require("intelAI")



class SeasonalWallRepair extends Mission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_SEASONAL_DROP_WALL_REPAIR;

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
		if (Game.map.visual) mapVisuals.get().text("👷", new RoomPosition(10, 25, this.memory.targetRoomName), {fontSize: 10})

		if (this.isActive()) {
			let allowRespawn = false;
			let anyWork = false;
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
					if (creep.hasBodyPart(WORK)) {
						anyWork = true
					}
				}
			}

			if (!anyWork) {
				allowRespawn = false
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

				if (Game.rooms[this.memory.targetRoomName]) {
					this.memory.rangeToDiggers = this.memory.rangeToDiggers || 999
					let room = Game.rooms[this.memory.targetRoomName]
					for (let creep of room.find(FIND_HOSTILE_CREEPS)) {
						if (creep.owner.username == "QzarSTB") {
							for (let myCreep of room.find(FIND_MY_CREEPS)) {
								this.memory.rangeToDiggers = Math.min(myCreep.pos.getRangeToPos(creep.pos), this.memory.rangeToDiggers)
							}
						}
					}
				}
			}

			// Relaunch
			if ((Game.time - this.memory.lastLaunchTick > 1500 - this.memory.routeCost * 40 || allowRespawn) &&
				Game.rooms[this.memory.targetRoomName] && 
				Memory.rooms[this.memory.targetRoomName] && 
				Memory.rooms[this.memory.targetRoomName].DT < 1 && 
				!Game.rooms[this.memory.targetRoomName].dangerous) {

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

		return false

		// return false
		let parentRoom = Game.rooms[this.memory.sourceRoomName]

		if (parentRoom.defcon < 5) return false

		let spawns = parentRoom.find(FIND_MY_SPAWNS);

		// Oh. Crap.
		if (spawns.length == 0) return false;

		let spawn = spawns[0];

		
		let destroyerBody = creepCreator.getDesignForEnergyCap("seasonWallBuilderR", parentRoom.energyCapacityAvailable - 50, false, false, false, {})
		let tugBody1 = creepCreator.getDesignForEnergyCap("seasonTug", parentRoom.energyCapacityAvailable - 50, false, false, false, {requiredMove: destroyerBody.length - 2, long: this.memory.routeCost > 3})
		let tugBody2 = creepCreator.getDesignForEnergyCap("seasonTug", parentRoom.energyCapacityAvailable - 50, false, false, false, {requiredMove: destroyerBody.length - 2, long: this.memory.routeCost > 3})


		let destroyerBoosts = {}
		let repairerBoosts = {}
		let dismantleBoost = parentRoom.getAvailableBoost(util.isDismantleBoost, 50 * LAB_BOOST_MINERAL, undefined, undefined, true)

		if (this.memory.rangeToDiggers > 4) {
			dismantleBoost = undefined
		}

		// Want to be able to unboost
		if (dismantleBoost) {			
			let freeLabCount = 0
			for (let lab of parentRoom.labs) {
				if ((lab.cooldown || 0) < 1500) {
					freeLabCount++;
				}
			}

			// 2x as some people may be coming back
			if (freeLabCount < 2) {
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
			// TEST: Want to test with small creeps before sending beefy boosted chaps
			// workerBody = creepCreator.getDesignForEnergyCap("seasonWallDestroyer", 100, false, false, false, {})
			tugBody1 = creepCreator.getDesignForEnergyCap("seasonTug", parentRoom.energyCapacityAvailable - 50, false, false, false, {requiredMove: destroyerBody.length - 2, boosted: 1, long: this.memory.routeCost > 2})

			let numBoosts = 0
			for (let part of destroyerBody) {
				if (part == WORK) {
					numBoosts++;
				}
			}
			destroyerBoosts = {[dismantleBoost]: numBoosts}
		}

		let numRepairNeeded = Math.ceil(48 * (dismantleBoost ? BOOSTS[WORK][dismantleBoost].dismantle : 1) * 0.25)

		let repairBoost = parentRoom.getAvailableBoost(util.isRepairBoost, numRepairNeeded * LAB_BOOST_MINERAL, undefined, undefined, true)
		let repairerBody = creepCreator.getDesignForEnergyCap("seasonWallBuilderR", parentRoom.energyCapacityAvailable - 50, false, false, false, {numRepairNeeded: numRepairNeeded})

		if (this.memory.rangeToDiggers > 4) {
			repairBoost = undefined
		}


		if (repairBoost) {
			// TEST: Want to test with small creeps before sending beefy boosted chaps
			// workerBody = creepCreator.getDesignForEnergyCap("seasonWallDestroyer", 100, false, false, false, {})
			tugBody2 = creepCreator.getDesignForEnergyCap("seasonTug", parentRoom.energyCapacityAvailable - 50, false, false, false, {requiredMove: repairerBody.length - 2, boosted: 1, long: this.memory.routeCost > 2})

			let numBoosts = 0
			for (let part of repairerBody) {
				if (part == WORK) {
					numBoosts++;
				}
			}
			repairerBoosts = {[repairBoost]: numBoosts}
		}

		this.memory.pairNames[this.memory.pairIdx] = [];

		let wallDestroyerName = this.spawnCreep("seasonWallBuilderD", destroyerBody, destroyerBoosts, spawn, destroyerBoosts)
		this.memory.pairNames[this.memory.pairIdx].push(wallDestroyerName)

		let tugName = this.spawnCreep("seasonTug", tugBody1, {}, spawn, destroyerBoosts);
		this.memory.pairNames[this.memory.pairIdx].push(tugName)

		this.memory.pairIdx++


		this.memory.pairNames[this.memory.pairIdx] = [];

		let wallRepairerName = this.spawnCreep("seasonWallBuilderR", repairerBody, repairerBoosts, spawn, repairerBoosts)
		this.memory.pairNames[this.memory.pairIdx].push(wallRepairerName)

		let tugName2 = this.spawnCreep("seasonTug", tugBody2, {}, spawn, repairerBoosts);
		this.memory.pairNames[this.memory.pairIdx].push(tugName2)

		this.memory.pairIdx++

		if (this.memory.rangeToDiggers < 4 && !Memory.disableWallGuard) {
			let guardBody = creepCreator.getDesignForEnergyCap("seasonWallGuard", parentRoom.energyCapacityAvailable - 50, false, false, false, {})
			let tugBody3 = creepCreator.getDesignForEnergyCap("seasonTug", parentRoom.energyCapacityAvailable - 50, false, false, false, {requiredMove: guardBody.length, long: this.memory.routeCost > 3})

			let guardName = this.spawnCreep("seasonWallGuard", guardBody, {}, spawn, {})
			this.memory.pairNames[this.memory.pairIdx].push(guardName)

			let tugName3 = this.spawnCreep("seasonTug", tugBody3, {}, spawn, {});
			this.memory.pairNames[this.memory.pairIdx].push(tugName3)

			this.memory.pairIdx++

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
		if (role != "seasonTug") {
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
module.exports = SeasonalWallRepair