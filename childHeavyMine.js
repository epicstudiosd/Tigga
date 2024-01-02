"use strict";

const Mission = require('missionBase')

var util = require('util');
var safeRoute = require('safeRoute');
var pathCache = require('pathCache');
var roomIntel = require('roomIntel');
var constants = require('constants');
var creepCreator = require('creepCreator');
var intelAI = require('intelAI');
var roomAI = require('roomAI');
const mapVisuals = require("mapVisuals")
var MissionBase = require("missionBase")

class ChildHeavyMine extends MissionBase {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = memory.type || MISSION_CHILD_HEAVY_MINE;

		memory.fRefreshRate = 1000;
		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		if (createNew && this.isActive()) {
			memory.targetRoomName = memory.targetRoomName || targetRoomName;

			memory.pairIdx = 0;
			memory.pairNames = [];

			this.memory.lastLaunchTick = Game.time
		}
	}


	tick() {
		if (this.isActive()) {
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep) {
					if (creep.mem.pairIdx !== undefined) {
						creep.mem.pairedName = this.memory.pairNames[creep.mem.pairIdx][0] == creep.name ? this.memory.pairNames[creep.mem.pairIdx][1] : this.memory.pairNames[creep.mem.pairIdx][0]
					}
				}
			}

			let numMiners = 0
			let numNoCarryMiners = 0

			if (Game.map.visual) mapVisuals.get().text("⛏️", new RoomPosition(10, 25, this.memory.targetRoomName), {fontSize: 10})

			let teamNames = []
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep && creep.mem.role === "childMiner") {
					if (creep.spawning || (creep.ticksToLive > 250 && (!creep.hasBoost() || creep.ticksToLive > 350))) {
						numMiners++
						if (!creep.hasBodypart(CARRY)) {
							numNoCarryMiners++
						}
					}
					teamNames.push(creep.name)
					if (!creep.mem.maxRenewTime) {
						creep.mem.maxRenewTime = Game.time + 400
					}
				}
			}
			for (let creepName of this.memory.assignedCreeps) {
				let creep = Game.creeps[creepName]
				if (creep && creep.mem.role === "childMiner") {
					creep.mem.teamCreepNames = teamNames
				}
			}

			let targetRoom = Game.rooms[this.memory.targetRoomName]

			if (targetRoom.extractor) {
				for (let creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (creep) {
						creep.mem.target = targetRoom.extractor.pos
					}
				}
				targetRoom.mem.supressFetchers = 0
			}

			if (!targetRoom || !targetRoom.isMyRoom()) {
				for (let creepName of this.memory.assignedCreeps) {
					let creep = Game.creeps[creepName]
					if (creep && !creep.mem.tugJobDone) {
						creep.mem.tugJobDone = 1
						creep.mem.travelTime = 150
					}
					else if (creep) {
						creep.mem.returningHome = 1
					}
				}
			}

			if (Math.random() < 0.1 && targetRoom && targetRoom.isMyRoom() && targetRoom.extractor && this.memory.spawningCreeps.length == 0) {

				let numSpaces = 0
				let spaces = []
				let mineral
				for (let loopMineral of targetRoom.find(FIND_MINERALS)) {
					if (targetRoom.extractor && targetRoom.extractor.pos.isEqualToPos(loopMineral.pos)) {
						mineral = loopMineral
						break
					}
				}

				if (mineral && !mineral.ticksToRegeneration) {
					let possibleContainers = mineral.pos.findInRange(targetRoom.containers.filter(c => roomAI.isSourceContainer(c)), mineral.mineralType == RESOURCE_THORIUM ? 2 : 1)

					if (possibleContainers.length) {
						let roomTerrain = Game.map.getRoomTerrain(targetRoom.name)

						for (let pass = 0; pass < 2; pass++) {
							for (let i = -1; i <= 1; i++) {
								if (targetRoom.extractor.pos.x + i <= 0 || targetRoom.extractor.pos.x + i >= 49) {
									continue
								}
								for (let j = -1; j <= 1; j++) {
									if (targetRoom.extractor.pos.y + j <= 0 || targetRoom.extractor.pos.y + j >= 49) {
										continue
									}

									if (roomTerrain.get(targetRoom.extractor.pos.x + i, targetRoom.extractor.pos.y + j) & TERRAIN_MASK_WALL) {
										continue
									}


									let testPos = new RoomPosition(targetRoom.extractor.pos.x + i, targetRoom.extractor.pos.y + j, targetRoom.name)
									if (testPos.inRangeToPos(targetRoom.extractor.pos, 1)) {
										if (pass == 0 && testPos.inRangeToPos(possibleContainers[0].pos, 1)) {
											numSpaces++
											spaces.push(testPos)								
										} 
										else if (pass == 1 && testPos.findInRange(spaces, 1).length != testPos.findInRange(spaces, 0).length) {
											let fail = false
											for (let space of spaces) {
												if (space.isEqualToPos(testPos)) {
													fail = true
													break
												}
											}
											if (!fail) {
												numSpaces++	
											}										
										}									
									}
								}
							}
						}



						console.log("Num spaces", numSpaces)
						//numSpaces = spaces.length
						numSpaces = Math.max(numSpaces, 1)
						//numSpaces = 1
					}
					else {
						numSpaces = 1
					}


					// This check will fail to work right when numSpaces > 0
					if (Game.time - (this.memory.lastLaunchTick || 0) > 500 / numSpaces || (this.memory.spawningCreeps.length == 0 && this.memory.assignedCreeps.length == 0)) {
						if (numMiners + this.memory.spawningCreeps.length < numSpaces) {
							this.configureAndSpawnMiner()		
						}					
					}
				}
			}
		}

		super.tick()
	}

	configureAndSpawnMiner() {

		let targetRoom = Game.rooms[this.memory.targetRoomName]
		if (!targetRoom) {
			return
		}

		if (Memory.seasonUnclaim == this.memory.targetRoomName) {
			return
		}

		let pos
		for (let mineral of targetRoom.find(FIND_MINERALS)) {
			if (targetRoom.extractor && targetRoom.extractor.pos.isEqualToPos(mineral.pos)) {
				pos = mineral.pos
				break
			}
		}

		if (!pos) {
			return
		}

		let roomName = this.memory.targetRoomName;

		let room = Game.rooms[this.memory.sourceRoomName]

		if (room) {
			if (room.spawns[0].hasPrioritySpawn("childMinerTug") || room.spawns[0].hasPrioritySpawn("childMiner")) {
				return;
			}

			let anyFreeSpawns = false
			
			for (let spawn of room.spawns) {
				if (!spawn.spawning || spawn.spawning.remainingTime < 10) {
					anyFreeSpawns = true;
					break
				}
			}

			if (!anyFreeSpawns) return


			this.memory.pairNames[this.memory.pairIdx] = [];
			let spawn = room.spawns[0];

			let body = creepCreator.getDesignForEnergyCap("childMiner", room.energyCapacityAvailable, false, false, false)

			let minerBoosts = {}
			let harvestBoost;
			harvestBoost = room.getAvailableBoost(util.isHarvestBoost, 50 * LAB_BOOST_MINERAL)
			if (harvestBoost) {
				body = creepCreator.getDesignForEnergyCap("childMiner", room.energyCapacityAvailable, false, false, false, {boosted: 1})
			}

			let numWork = 0
			for (let part of body) {
				if (part == WORK) {
					numWork++
				}
				if (harvestBoost) {
			 		minerBoosts = {[harvestBoost]: numWork}
				}
			}


			let minerName = this.spawnCreep("childMiner", body, minerBoosts, spawn, {target: pos, pairIdx: this.memory.pairIdx, alwaysPulled: 1})

			this.memory.pairNames[this.memory.pairIdx].push(minerName)

			body = creepCreator.getDesignForEnergyCap("seasonTug", room.energyCapacityAvailable, false, false, false, {requiredMove: numWork, noCarry: true})
			let tugName = this.spawnCreep("childMinerTug", body, {}, spawn, {target: pos, pairIdx: this.memory.pairIdx});
			this.memory.pairNames[this.memory.pairIdx].push(tugName)

			this.memory.pairIdx++

			this.memory.lastLaunchTick = Game.time

			targetRoom.mem.supressFetchers = 0
			targetRoom.spawns[0].addPrioritySpawn("fetcher")
		}
	}


	requestSpawns() {
		if (!Game.rooms[this.memory.targetRoomName]) {
			return
		}
		if (!Game.rooms[this.memory.targetRoomName].isMyRoom()) {
			return
		}		
		if (!Game.rooms[this.memory.targetRoomName].extractor) {
			return
		}		
		if (Memory.rooms[this.memory.targetRoomName].DT > 0.1) {
			return
		}

		this.configureAndSpawnMiner();

		return true
	}

	cleanMemory() {
		delete this.memory.pairIdx
		delete this.memory.pairNames
		return super.cleanMemory();
	}


	missionComplete(success) {
		this.cleanMemory();

		return super.missionComplete(success)
	}
}

module.exports = ChildHeavyMine