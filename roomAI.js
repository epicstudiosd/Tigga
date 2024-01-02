"use strict";

var util = require('util');
var constants = require('constants');
var missionInfo = require('missionInfo');
var roomDesignAI = require('roomDesignAI');
var roomIntel = require('roomIntel');
var intelAI = require('intelAI');
var segments = require('segments');
var pathCache = require('pathCache');
const creepCreator = require('creepCreator');

const mapVisuals = require("mapVisuals")

const utf15 = require('./utf15');
const Codec = utf15.Codec;
const MAX_DEPTH = utf15.MAX_DEPTH;




// Many are *10 as we only update one in every 10 ticks.
const alpha_pathing = Math.exp(-(1/10000.) * 20);

const alpha_danger0 = Math.exp(-(1/1000.)*20);
const alpha_danger1 = Math.exp(-(1/1500.)*20);
const alpha_danger2 = Math.exp(-(1/500.)*20);

const alphaKDa = Math.exp(-(1/10000));
const alphaKDb = Math.exp(-(1/10000)*20);

const alpha_camped = Math.exp(-(1/1000)*20);

const alphaBorderEnergy = Math.exp(-(1/1000.)*20);
const alphaDamage = Math.exp(-(1/5000.)*20); // Want to slowly lower expected reaction damage

const alphaClaim = Math.exp(-(1/200000.)*20);

const alphaRepair = Math.exp(-(1/100000.)*20);

var roomAI = {
	isEnergyEndPoint : function(structure) {
		var spawnBatteryCentre = this.getSpawnBatteryCentre(structure.room.name)

		if (spawnBatteryCentre && spawnBatteryCentre.x == structure.pos.x && spawnBatteryCentre.y == structure.pos.y && spawnBatteryCentre.roomName == structure.room.name) {
			return true;
		}

		var flags = structure.pos.lookFor(LOOK_FLAGS);
		for (var flag of flags) {
			if (flag.name.startsWith("endLink")) {
				return true;
			}
		}

		// if (structure.room.effectiveLevel == 8) {
		// 	if (structure.pos.isNearToRoomObject(structure.room.terminal)) {
		// 		return true;
		// 	}
		// }

		return false;
	},

	isEnergyStartPoint : function(structure) {
		return this.isInStorageBattery(structure);
	},

	isControllerLink : function(structure) {
		var flags = structure.pos.lookFor(LOOK_FLAGS);
		for (var flag of flags) {
			if (flag.name.startsWith("dropContainer")) {
				return true;
			}
		}
		return false;
	},

	isHarvesterLink : function(structure) {
		var flags = structure.pos.lookFor(LOOK_FLAGS);
		for (var flag of flags) {
			if (flag.name.startsWith("harvestLink")) {
				return true;
			}
		}
		return false;
	},

	isHaulerLink : function(structure) {
		return !this.isEnergyEndPoint(structure) && !this.isEnergyStartPoint(structure) && !this.isHarvesterLink(structure)
	},

	isDropoffPoint : function(structure) {
		global.dropOffPoints = global.dropOffPoints || {};

		if (global.dropOffPoints[structure.id] !== undefined) {
			return global.dropOffPoints[structure.id];
		}
		else {
			if (structure.dropOffPoint !== undefined) {
				return structure.dropOffPoint
			}

			var flags = structure.room.lookForAt(LOOK_FLAGS, structure.pos);
			for (var flag of flags) {
				if (flag.name.startsWith("dropContainer")) {
					global.dropOffPoints[structure.id] = true;
					return true;
				}
			}

			var spawnBatteryCentre = this.getSpawnBatteryCentre(structure.room.name)

			if (spawnBatteryCentre && (spawnBatteryCentre.x == structure.pos.x + 2 || spawnBatteryCentre.x == structure.pos.x - 2) && spawnBatteryCentre.y == structure.pos.y && spawnBatteryCentre.roomName == structure.room.name) {
				structure.dropOffPoint = true;
				global.dropOffPoints[structure.id] = true;
				return true;
			}

			structure.dropOffPoint = false;
			global.dropOffPoints[structure.id] = false;
			return false;
		}
	},


	isSourceContainer : function(structure) {
		var flags = structure.room.lookForAt(LOOK_FLAGS, structure.pos);
		for (var flag of flags) {
			if (flag.name.startsWith("sourceContainer")) {
				return true;
			}
		}

		return false;
	},

	isInSpawnBattery: function (structure) {
		var batteryCentre = this.getSpawnBatteryCentre(structure.room.name)
		if (batteryCentre) {
			if (Math.abs(structure.pos.x - batteryCentre.x) <= 2 && Math.abs(structure.pos.y - batteryCentre.y) <= 2) {
				return true;
			}
		}
	},

	isInStorageBattery: function (structure) {
		var batteryCentre = this.getStorageBatteryCentre(structure.room.name)
		if (batteryCentre) {
			if (Math.abs(structure.pos.x - batteryCentre.x) <= 1 && Math.abs(structure.pos.y - batteryCentre.y) <= 1) {
				return true;
			}
		}
		return false;
	},

	getSpawnBatteryCentre: function(roomName) {
		if (Memory.rooms[roomName].spawnBatteryCentreX) {
			return new RoomPosition(Memory.rooms[roomName].spawnBatteryCentreX, Memory.rooms[roomName].spawnBatteryCentreY, roomName);
		}
	},

	getSpawnBatteryTopLeftExtensionIDs(roomName) {
		global.spawnBatteryTopLeftExtensionIDs = global.spawnBatteryTopLeftExtensionIDs || {}
		if (Math.random() < 0.1 || !global.spawnBatteryTopLeftExtensionIDs[roomName]) {
			global.spawnBatteryTopLeftExtensionIDs[roomName] = []

			function findEnergyTargetID(room, x, y) {
				var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
				for (var structure of structures) {
					if (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) {
						return structure.id;
					}
				}
			}

			let room = Game.rooms[roomName];
			let spawnBatteryCentre = this.getSpawnBatteryCentre(roomName)

			let ids = global.spawnBatteryTopLeftExtensionIDs[roomName]

			let id;
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 2, spawnBatteryCentre.y - 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 1, spawnBatteryCentre.y - 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y - 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 2, spawnBatteryCentre.y - 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y - 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 1, spawnBatteryCentre.y    )) ids.push(id);

		}

		return global.spawnBatteryTopLeftExtensionIDs[roomName];
	},

	getSpawnBatteryTopRightExtensionIDs(roomName) {
		global.spawnBatteryTopRightExtensionIDs = global.spawnBatteryTopRightExtensionIDs || {}
		if (Math.random() < 0.1 || !global.spawnBatteryTopRightExtensionIDs[roomName]) {
			global.spawnBatteryTopRightExtensionIDs[roomName] = []

			function findEnergyTargetID(room, x, y) {
				var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
				for (var structure of structures) {
					if (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) {
						return structure.id;
					}
				}
			}

			let room = Game.rooms[roomName];
			let spawnBatteryCentre = this.getSpawnBatteryCentre(roomName)

			let ids = global.spawnBatteryTopRightExtensionIDs[roomName]

			let id;
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y - 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 1, spawnBatteryCentre.y - 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 2, spawnBatteryCentre.y - 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y - 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 2, spawnBatteryCentre.y - 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 1, spawnBatteryCentre.y    )) ids.push(id);

		}

		return global.spawnBatteryTopRightExtensionIDs[roomName];
	},

	getSpawnBatteryBottomLeftExtensionIDs(roomName) {
		global.spawnBatteryBottomLeftExtensionIDs = global.spawnBatteryBottomLeftExtensionIDs || {}
		if (Math.random() < 0.1 || !global.spawnBatteryBottomLeftExtensionIDs[roomName]) {
			global.spawnBatteryBottomLeftExtensionIDs[roomName] = []

			function findEnergyTargetID(room, x, y) {
				var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
				for (var structure of structures) {
					if (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) {
						return structure.id;
					}
				}
			}

			let room = Game.rooms[roomName];
			let spawnBatteryCentre = this.getSpawnBatteryCentre(roomName)

			let ids = global.spawnBatteryBottomLeftExtensionIDs[roomName]

			let id;
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 2, spawnBatteryCentre.y + 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 1, spawnBatteryCentre.y + 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y + 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 2, spawnBatteryCentre.y + 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y + 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x - 1, spawnBatteryCentre.y    )) ids.push(id);
		}

		return global.spawnBatteryBottomLeftExtensionIDs[roomName];
	},

	getSpawnBatteryBottomRightExtensionIDs(roomName) {
		global.spawnBatteryBottomRightExtensionIDs = global.spawnBatteryBottomRightExtensionIDs || {}
		if (Math.random() < 0.1 || !global.spawnBatteryBottomRightExtensionIDs[roomName]) {
			global.spawnBatteryBottomRightExtensionIDs[roomName] = []

			function findEnergyTargetID(room, x, y) {
				var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
				for (var structure of structures) {
					if (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) {
						return structure.id;
					}
				}
			}

			let room = Game.rooms[roomName];
			let spawnBatteryCentre = this.getSpawnBatteryCentre(roomName)

			let ids = global.spawnBatteryBottomRightExtensionIDs[roomName]

			let id;
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y + 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 1, spawnBatteryCentre.y + 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 2, spawnBatteryCentre.y + 2)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x    , spawnBatteryCentre.y + 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 2, spawnBatteryCentre.y + 1)) ids.push(id);
			if (id = findEnergyTargetID(room, spawnBatteryCentre.x + 1, spawnBatteryCentre.y    )) ids.push(id);
		}

		return global.spawnBatteryBottomRightExtensionIDs[roomName];
	},

	getStorageBatteryCentre: function(roomName) {
		if (Memory.rooms[roomName].storageBatteryX) {
			return new RoomPosition(Memory.rooms[roomName].storageBatteryX, Memory.rooms[roomName].storageBatteryY, roomName);
		}
	},

	getSpawnBatteryContainers: function(room) {
		global.spawnBatteryContainerIDs = global.spawnBatteryContainerIDs || {}
		if (global.spawnBatteryContainerIDs[room.name] && Math.random() > 0.999) {
			let containers = []
			for (let id of global.spawnBatteryContainerIDs[room.name]) {
				let obj = Game.getObjectById(id)

				if (obj) {
					containers.push(obj)
				}
				else {
					delete global.spawnBatteryContainerIDs[room.name]
					return this.getSpawnBatteryContainers(room)
				}
			}
			return containers
		}

		let containers = []
		var spawnBatteryCentre = this.getSpawnBatteryCentre(room.name);
		if (spawnBatteryCentre) {
			var structures1 = room.lookForAt(LOOK_STRUCTURES, spawnBatteryCentre.x - 2, spawnBatteryCentre.y);
			var structures2 = room.lookForAt(LOOK_STRUCTURES, spawnBatteryCentre.x + 2, spawnBatteryCentre.y);

			for (var structure of structures1) {
				if (structure.structureType == STRUCTURE_CONTAINER) {
					containers.push(structure);
					break;
				}
			}
			for (var structure of structures2) {
				if (structure.structureType == STRUCTURE_CONTAINER) {
					containers.push(structure);
					break;
				}
			}

			if (containers.length == 2) {
				global.spawnBatteryContainerIDs[room.name] = [containers[0].id, containers[1].id]
			}
		}
		return containers;
	},

	hasSpawnBatteryContainers: function(room) {
		if (global.spawnBatteryContainerIDs && Math.random() > 0.999) {
			return (global.spawnBatteryContainerIDs[room.name] || this.getSpawnBatteryContainers(room)).length == 2;
		}
		else {
			return this.getSpawnBatteryContainers(room).length == 2
		}
	},


	isHarvesterExtension: function(structure) {
		if (structure.room.mem.harvestPointsX) {
			for (var i = 0; i < structure.room.mem.harvestPointsX.length; i++) {
				if (structure.pos.isNearToXY(structure.room.mem.harvestPointsX[i], structure.room.mem.harvestPointsY[i])) {
					return true;
				}
			}
		}
		return false;
	},


	/*getHarvesterExtensions: function(structure) {
		if (!this.harvesterExtensions) {
			this.harvesterExtensions = [];
			for (var i = 0; i < structure.room.memoryharvestPointsX.length; i++) {
				if (structure.pos.getRangeTo(structure.room.memory.harvestPointsX[i], structure.room.memory.harvestPointsY[i]) == 1) {
					this.harvesterExtensions.push(structure);
				}
			}
		}

		return this.harvesterExtensions;
	},*/


	cleanUpHarassTracking: function(roomName) {
		if (Memory.rooms[roomName].harassTracking) {			
			for (let harass of _.clone(Memory.rooms[roomName].harassTracking)) {
				if (Game.time - harass.t > constants.HARASS_FORGET_TIME * (global.stringifyError ? 0.5 : 1)) {
					_.pull(Memory.rooms[roomName].harassTracking, harass)
				}
			}
			if (Memory.rooms[roomName].harassTracking.length == 0) {
				delete Memory.rooms[roomName].harassTracking
			}
		}
	},


	getEnergyPriorityForStructure: function(structure) {
		var priority = 0;
		switch	(structure.structureType) {
			case STRUCTURE_SPAWN:
				// C&P from extension below
				if (structure.energyCapacity - (structure.expectedEnergy || structure.energy) > 0) {
					priority = (structure.energyCapacity / 50) * (structure.energyCapacity + 2 * (structure.energyCapacity - 0));
					if (structure.room.energyAvailable < structure.room.energyCapacityAvailable / 4) {
						priority *= 50;
					}
					else if (structure.room.energyAvailable < structure.room.energyCapacityAvailable / 2) {
						priority *= 25;
					}
					if (structure.room.effectiveLevel <= 2) {
						priority *= 10;
					}

					let numPriorityBuilds = _.sum(_.values(structure.room.mem.priorityBuilds));
					if (numPriorityBuilds) {
						priority *= numPriorityBuilds;
					}
				}

				break;
			case STRUCTURE_EXTENSION:
				priority = 0;
				if (structure.room.effectiveLevel == 8 && roomAI.isHarvesterExtension(structure)) {
					priority = -1
				}
				else if (structure.energyCapacity - (structure.expectedEnergy || structure.energy) > 0) {
					priority = (structure.energyCapacity / 50) * (structure.energyCapacity + 2 * (structure.energyCapacity - 0));
					if (structure.room.energyAvailable < structure.room.energyCapacityAvailable / 4) {
						priority *= 50;
					}
					else if (structure.room.energyAvailable < structure.room.energyCapacityAvailable / 2) {
						priority *= 25;
					}
					if (structure.room.effectiveLevel <= 2) {
						priority *= 10;
					}

					if (roomAI.isHarvesterExtension(structure)) {
						// Doesn't include other types of harvester? Think that's fine.
						let harvester = structure.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => {return c.mem.role == "harvester" && c.hasBodyPart(CARRY)}})[0]
						if (harvester) {
							let source = Game.getObjectById(harvester.mem.hSource)
							// Harvester has got it
							if (source && (source.energy || source.ticksToRegeneration < 100)) {
								priority = -1
							}
							else {
								// Harvester will get to it...
								priority /= 100;
							}
						}
					}
					// else if (this.isInSpawnBattery(structure)) {
					// 	priority *= structure.room.effectiveLevel <= 4 ? 0.1 : 0.000000001;
					// }

					let numPriorityBuilds = _.sum(_.values(structure.room.mem.priorityBuilds));
					if (numPriorityBuilds) {
						priority *= numPriorityBuilds;
					}

					if (structure.room.mem.notEnoughEnergyToSpawn) {
						priority *= 4;
					}
				}
				break;
			case STRUCTURE_TOWER:
				if (structure.energyCapacity - (structure.expectedEnergy || structure.energy) > 200) {
					priority = 10 * (structure.energyCapacity - (structure.expectedEnergy || structure.energy));
				}
				if (structure.energy < 500) {
					priority *= 5;
				}
				if (structure.energy < 200) {
					priority *= 10;
				}
				break;
			case STRUCTURE_CONTAINER:
				if (structure.expectedEnergy || structure.store[RESOURCE_ENERGY] < 1400) {
					priority = 0.2 * (structure.storeCapacity - (structure.expectedEnergy || structure.store[RESOURCE_ENERGY]));
				}
				if (structure.room.effectiveLevel <= 2) {
					priority *= 0.1;
				}

				if (this.isInSpawnBattery(structure)) {
					priority *= 0.1;
				}

				break;
			case STRUCTURE_LINK:
				// This show be lowest priority.
				let controllerLink = this.isControllerLink(structure);
				if (!structure.room.dangerous && controllerLink) {
					if (structure.room.effectiveLevel < 8) {
						priority = 0.01 * (structure.energyCapacity - (structure.expectedEnergy || structure.energy));
						// Always deliver even if full
						if (structure.room.upgradeFocus && (structure.room.mem.ownedCreeps["upgrader"] || []).length) {
							priority *= 10
							priority = Math.max(priority, 10)
						}
					}
					// else if ((structure.room.mem.ownedCreeps["upgrader"] || []).length) {
					// 	priority = 0.01 * (structure.energyCapacity - (structure.expectedEnergy || structure.energy));
					// }
				}
				else if (!controllerLink) {
					if (structure.room.effectiveLevel == 8) {
						if ((structure.room.mem.ownedCreeps["upgrader"] || []).length || 
							(structure.room.energyCapacityAvailable != structure.room.energyAvailable && 
							(global.roomData[structure.room.name].spawnBatteryStatus === undefined || global.roomData[structure.room.name].spawnBatteryStatus < 0.75))) {
							priority = 9 * (structure.energyCapacity * 0.5 - (structure.expectedEnergy || structure.energy));
						}
					}
					else {
						priority = 9 * (structure.energyCapacity - (structure.expectedEnergy || structure.energy));						
					}
				}
				break;
			case STRUCTURE_STORAGE:
				// Fill up to be >4x terminal, or 5k
				if (structure.room.terminal && structure.store[RESOURCE_ENERGY] < structure.room.terminal.store[RESOURCE_ENERGY] * 4) {
					priority = 1e-4 * (structure.room.terminal.store[RESOURCE_ENERGY] * 4 - structure.store[RESOURCE_ENERGY]);
				}
				else if (structure.store[RESOURCE_ENERGY] < 5000) {
					priority = 1e-4 * (structure.storeCapacity - structure.store[RESOURCE_ENERGY]);
				}
				break;
			case STRUCTURE_TERMINAL:
				if (structure.room.storage && structure.room.storage.store[RESOURCE_ENERGY] > 10000) {
					if (structure.store[RESOURCE_ENERGY] < 1000) {
						priority = 2.5e-3 * (40000 - structure.store[RESOURCE_ENERGY]);
					}
					else {
						priority = 1e-3 * (40000 - structure.store[RESOURCE_ENERGY]);
					}
				}
				break;
			case STRUCTURE_LAB:
				priority = 0.5 * (structure.energyCapacity - (structure.expectedEnergy || structure.energy));
				if ((structure.expectedEnergy || structure.energy) < structure.energyCapacity * 0.05) {
					priority *= 8;
				}
				else if ((structure.expectedEnergy || structure.energy) < structure.energyCapacity * 0.25) {
					priority *= 4;
				}
				else if ((structure.expectedEnergy || structure.energy) < structure.energyCapacity * 0.5) {
					priority *= 2;
				}
				break;
			case STRUCTURE_NUKER:
				if (intelAI.getMaxHate() > 10000 && structure.room.storage && structure.room.storage.store[RESOURCE_ENERGY] > 50000 && (!Memory.season || Memory.enabledNukers.includes(structure.room.name))) {
					if (0.9 * structure.cooldown / NUKER_COOLDOWN <= 1 - (structure.expectedEnergy || structure.energy) / structure.energyCapacity) {
						priority = 500 * (1 - structure.cooldown / NUKER_COOLDOWN) * (structure.energyCapacity - (structure.expectedEnergy || structure.energy)) / structure.energyCapacity;
					}
				}
				break;
			case STRUCTURE_POWER_SPAWN:
				if (structure.expectedEnergy || structure.energy < structure.energyCapacity - 1000) {
					priority = 0.1 * (structure.energyCapacity - (structure.expectedEnergy || structure.energy));
					// if (Memory.season3) {
						// Need 5x less energy
						// priority *= 0.2
					// }
				}
				break;
			default:
				// throw new Error("Bad energy target")
				priority = -1;
		}
		if (priority < 0) priority = 0


		return priority;
	},

	getEnergyPriorityTargets : function (room) {
		let structures;

		// if (!room.energyPriorityTargets) {
			if (room.energyCandidateStructures) {
				structures = room.energyCandidateStructures;
			}
			else {
				if (!global.energyTargets) global.energyTargets = {}

				// Random cleans the cache so new buildings don't get missed.
				if (!global.energyTargets[room.name] || Game.cpu.bucket > 9500 || Math.random() < 0.05 || (global.energyTargets[room.name].length == 0 && room.energyCapacity != room.energyCapacityAvailable)) {
					let hasSpawnBatteryContainers = this.hasSpawnBatteryContainers(room)

					structures = room.find2(FIND_STRUCTURES, {
						filter: (structure) => {
							if (structure.structureType == STRUCTURE_ROAD || structure.structureType == STRUCTURE_WALL) return false

							let active = structure.isActive();

							// Don't check against energy available. This is structures, not checking if they actually need energy.
							return ((structure.structureType == STRUCTURE_EXTENSION && active &&
										(!hasSpawnBatteryContainers ||
										structure.room.effectiveLevel <= 3 ||
										(!this.isInSpawnBattery(structure) && (!structure.room.storage || !this.isInStorageBattery(structure))))) ||
									(structure.structureType == STRUCTURE_LAB && active) ||
									(structure.structureType == STRUCTURE_TOWER && active) ||
									(structure.structureType == STRUCTURE_LINK && this.isControllerLink(structure)) ||
									(structure.structureType == STRUCTURE_CONTAINER && 
										this.isDropoffPoint(structure) && 
										structure.room.mem.ownedCreeps["upgrader"] && 
										structure.room.mem.ownedCreeps["upgrader"].length &&
										(structure.room.effectiveLevel <= 4 || !this.isInSpawnBattery(structure))) ||
									(structure.structureType == STRUCTURE_SPAWN && active && (structure.room.effectiveLevel <= 3 || !this.isInSpawnBattery(structure))) ||
									(structure.structureType == STRUCTURE_POWER_SPAWN && active) ||
									(structure.structureType == STRUCTURE_NUKER && active));
						}
					});
					global.energyTargets[room.name] = []
					for (var structure of structures) {
						global.energyTargets[room.name].push(structure.id)
					}
				}
				else {
					structures = [];
					for (var structureId of global.energyTargets[room.name]) {
						structures.push(Game.getObjectById(structureId));
					}
				}
			}

			const threshold = 0.8;

			var maxPriority = 0;
			var priorityEnergy = null;

			var candidateStructures = []

			for(var structureIdx in structures) {
				var structure = structures[structureIdx];
				if (structure) {
					var priority = this.getEnergyPriorityForStructure(structure);
					// if (priority) console.log(room, structure, priority)
					if (priority > maxPriority) {
						maxPriority = priority;
						priorityEnergy = structure;
						candidateStructures.push(structure)
					}
					else if (priority > maxPriority * threshold) {
						candidateStructures.push(structure)
					}
				}
			}

			var returnArray;
			if (priorityEnergy) {
				returnArray = [];

				for(var structureIdx in candidateStructures) {
					var structure = candidateStructures[structureIdx];
					if (structure) {
						var priority = this.getEnergyPriorityForStructure(structure);

						if (priority > maxPriority * threshold) {
							returnArray.push(structure);
						}
					}
				}
			}
			else {
				returnArray = []
			}

			room.energyCandidateStructures = returnArray;
			// room.energyPriorityTargets = returnArray
		// }
		// else {
		// 	returnArray = room.energyPriorityTargets
		// }
		return returnArray;
	},

	getRepairPriority : function(room, spawnCheck=false, force=false, boosted=false, creep = null) {
		if (!room || room.memory.ID == undefined) {
			return {priority: -1, target: undefined};
		}

		if (!global.repairTargets) global.repairTargets = {}

		// Random cleans the cache so new buildings don't get missed.
		var structures;
		if (!global.repairTargets[room.name] || Math.random() < 0.025 || room.dangerous || force) {
			structures = [];
			for (var roomIdx in room.goodRooms) {
				let roomName = room.goodRooms[roomIdx];
				if (Game.rooms[roomName]) {
					// Repair if no controller, if the controller doesn't have an owner, of it's my controller
					if (!Game.rooms[roomName].controller || !Game.rooms[roomName].controller.owner || Game.rooms[roomName].controller.my) {
						structures = structures.concat(Game.rooms[roomName].find(FIND_STRUCTURES, {
							filter: (structure) => {
								return structure.hitsMax != structure.hits;
							}
						}));
					}
				}
			}
			global.repairTargets[room.name] = []
			for (var structure of structures) {
				global.repairTargets[room.name].push(structure.id)
			}
		}
		else {
			structures = [];
			for (var structureId of global.repairTargets[room.name]) {
				let struct = Game.getObjectById(structureId);
				if (struct && struct.hits < struct.hitsMax) {
					if (struct.structureType == STRUCTURE_ROAD &&
						global.flaggedRoads &&
						global.flaggedRoads[struct.room.name] &&
						global.flaggedRoads[struct.room.name].has(struct.id)) {
						struct.flagged = true;
					}

					structures.push(struct);
				}
			}
		}

		let vis;
		if (Memory.visRoomRepair) {
			vis = new RoomVisual(Memory.visRoomRepair)
		}

		let towers;
		if (Game.rooms[room.name]) {
			towers = Game.rooms[room.name].towers;
		}

		var maxPriority = 0;
		var priorityRepair;
		let roomEnergy = (room.storage ? (room.storage.store[RESOURCE_ENERGY] || 0) : 0) + (room.terminal ? (room.terminal.store[RESOURCE_ENERGY] || 0) : 0);

		let buildings = roomDesignAI.getBuildings(room.name);
		if (room.memory.tmpBuildings) {
			buildings = buildings.concat(room.memory.tmpBuildings);
		}
		if (room.memory.pressureBuildings) {
			buildings = buildings.concat(room.memory.pressureBuildings);
		}


		for (let building of buildings || []) {
			// if (building.name && building.name.startsWith(STRUCTURE_ROAD)) continue;
			let structs = room.lookForAt(LOOK_STRUCTURES, (building.x || building.pos.x), (building.y || building.pos.y));

			for (let struct of structs) {
				if (!building.name ||
					building.name.startsWith(struct.structureType) ||
					struct.structureType != STRUCTURE_ROAD) {
					struct.flagged = true;
					continue
				}
			}
		}

		let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);

		if (segementData && segementData[room.name]) {
			let floodedDesign = segementData[room.name].floodedDesign;

			let ramparts = room.ramparts;

			for (let rampart of ramparts) {
				let v = parseInt(floodedDesign[rampart.pos.x][rampart.pos.y]);
				// room.visual.text(Math.round(v), rampart.pos.x, rampart.pos.y)

				let nukeRampart = 0;
				if (room.memory.nukeRamparts && room.memory.nukeRamparts.includes(rampart.pos.y * 50 + rampart.pos.x)) {
					nukeRampart = 1;
					rampart.flagged = true;
					rampart.nukeRampart = true;
				}

				if (v === 0 && !nukeRampart) {
					rampart.external = true;
					if (room.dangerous || room.mem.attackScore) {
						let rampartValid = 0;
						if (parseInt(floodedDesign[rampart.pos.x][rampart.pos.y]) >= 1) {
							rampartValid = 1;
						}
						else if (room.mem.nukeRamparts && room.mem.nukeRamparts.includes(rampart.pos.y * 50 + rampart.pos.x)) {
							rampartValid = 1;
						}
						else {
							for (let i = -1; i <= 1; i++) {
								if (rampart.pos.x + i < 0 || rampart.pos.x + i > 49) continue
								for (let j = -1; j <= 1; j++) {
									if (rampart.pos.y + j < 0 || rampart.pos.u + j > 49) continue

									if (parseInt(floodedDesign[rampart.pos.x + i][rampart.pos.y + j]) >= 1) {
										rampartValid = 1;
										break;
									}
								}
								if (rampartValid) {
									break;
								}
							}
						}
						if (!rampartValid) {
							rampart.notCombatValid = 1
						}
					}
				}
				else if (v === 1 && !nukeRampart) {
					rampart.internal = true;
				}
			}
		}

		global.roomOverNuked = global.roomOverNuked || {};
		global.roomOverNuked[room.name] = false;

		let lowRamparts = room.defcon >= 4 && (Memory.forceLowRamparts || (Memory.minRoomLevel != 8 && intelAI.getMaxHate() < 10000));

		if (Memory.reallyForceLowRamparts) {
			lowRamparts = true
		}
		if (room.mem.attackScore) {
			lowRamparts = false
		}
		if (Memory.forceNoLowRamparts) {
			lowRamparts = false	
		}

		room.mem.outerWallDamageLevel = 0;

		// Season 3 is swampy and needs more repair.
		// I guess really rather than hacking it for season 3 we should analyse swampiness
		const ROAD_THRESH_SC_1 = Memory.season3 ? 0.4 : 0.2
		const ROAD_THRESH_SC_2 = Memory.season3 ? 0.4 : 0.2

		const ROAD_THRESH_NSC_1 = 0.35
		const ROAD_THRESH_NSC_2 = 0.7

		for(var siteIdx in structures) {
			var structure = structures[siteIdx];
			if (structure.owner && !structure.my) {
				continue;
			}

			let dist = 0
			if (creep) {
				dist = structure.pos.getWorldRangeToPos(creep.pos)
			}


			if (creep && dist > creep.ticksToLive) {
				continue
			}

			let isInMyRoom = structure.room.controller && structure.room.controller.my;
			var priority = -1;
			switch	(structure.structureType) {
				case STRUCTURE_SPAWN:
					if (structure.my && structure.hitsMax != structure.hits) priority = 1000;
					break;
				case STRUCTURE_EXTENSION:
					if (structure.my && structure.hitsMax != structure.hits) priority = 900;
					break;
				case STRUCTURE_ROAD:
					if ((isInMyRoom || 
						structure.room.keeperRoom || 
						structure.room.centreRoom || 
						room.mem.mediumHaulers || 
						room.mem.smallHaulers || 
						room.mem.verySmallHaulers || 
						structure.hits < (spawnCheck ? ROAD_THRESH_SC_1 : ROAD_THRESH_NSC_1) * structure.hitsMax)
							&& structure.hits < (spawnCheck ? ROAD_THRESH_SC_2 : ROAD_THRESH_NSC_2) * structure.hitsMax) {
					// if ((isInMyRoom || structure.room.keeperRoom || structure.room.centreRoom) && structure.hits < (spawnCheck ? 0.4 : 0.7) * (spawnCheck ? 5000 : structure.hitsMax)) {
						let flagged = structure.flagged;
						if (flagged) {
							if (structure.currentlyRepairing) {
								priority = structure.hitsMax / structure.hits;	
							}
							else {
								priority = 2 * structure.hitsMax / structure.hits;
							}
						}
					}
					break;
				case STRUCTURE_CONTAINER:
					if ((isInMyRoom || structure.room.keeperRoom || structure.room.centreRoom) && structure.hits < (spawnCheck ? 0.125 : .9) * structure.hitsMax) {
						let flags = structure.pos.lookFor(LOOK_FLAGS);

						let flagged = structure.flagged;
						for (let flag of flags) {
							if (!flag.name.startsWith(STRUCTURE_ROAD)) {
								flagged = true;
								break;
							}
						}
						if (!isInMyRoom || flagged) {
							priority = 4 * structure.hitsMax / structure.hits;
						}
					}
					break;
				case STRUCTURE_WALL:
					var rcl;
					if (room.controller && room.controller.my) {
						rcl = room.effectiveLevel
					}
					else {
						rcl = 0;
					}

					let flags = structure.pos.lookFor(LOOK_FLAGS);

					let flagged = false;
					for (let flag of flags) {
						if (flag.name.startsWith(STRUCTURE_WALL)) {
							flagged = true;
							break;
						}
					}

					if (flagged) {
						priority = (rcl / 8) * 5.e-2 * structure.hitsMax / structure.hits;
						let energyMod = spawnCheck ? 0.95 : 1;

						if (towers && towers.length > 0) {
							let towerDamage = 0;
							for (let tower of towers) {
								let range = structure.pos.getRangeTo(tower.pos);
								towerDamage = util.getTowerDamageForDist(range);
							}

							// NOTE: This assumes that tower damages are 600->150. This will then go to 0 for 150 damage, 1 for 450 damage
							let towerDamagePercent = (towerDamage - 150) / (towers.length * 450);

							// Repair guys that are further away at higher priority. They're higher risk.
							priority *= (1 + 0.2 * (1 - towerDamagePercent));
							energyMod *= (1 + 0.2 * (1 - towerDamagePercent));
						}

						if (structure.pos.x >= 45 || structure.pos.x <= 4 || structure.pos.y >= 45 || structure.pos.y <= 4) {
							priority *= 1.2;
							energyMod *= 1.2;
						}

						if (roomEnergy > 200e3) {
							energyMod *= roomEnergy / 100e3;
						}

						if (room.defcon == 5 && structure.hits > 2e6 * energyMod) {
							priority = -1;
						}
						else if (room.defcon == 4 && structure.hits > 3e6 * energyMod) {
							priority = -1;
						}
						else if (room.defcon == 3 && structure.hits > 5e6 * energyMod) {
							priority = -1;
						}
						else if (room.defcon == 2 && structure.hits > 10e6 * energyMod) {
							priority = -1;
						}
						else {
							priority /= room.defcon
						}

						if (room.defcon == 1) {
							priority += 25;
						}
					}
					else {
						priority = -1;
					}

					break;
				case STRUCTURE_RAMPART:
					if (structure.my && !structure.notCombatValid) {
						var rcl = room.effectiveLevel;

						let flagged = structure.flagged;
						if (!flagged) {
							let flags = structure.pos.lookFor(LOOK_FLAGS);
							for (let flag of flags) {
								if (!flag.name.startsWith(STRUCTURE_ROAD)) {
									flagged = true;
									break;
								}
							}
						}

						if (structure.external && room.dangerous) {
							priority = -1
						}

						if (flagged) {
							let nukeDamage = 0;
							let burstNukeDamage = 0
							if ((structure.room.mem.nukeLandTime || 0) - Game.time > 0) {
								let nukes = structure.room.find(FIND_NUKES);


								let hitTimes = []

								for (let nuke of nukes) {
									let range = structure.pos.getRangeTo(nuke.pos);
									if (range <= 2) {
										hitTimes.push(nuke.timeToLand)
									}									
								}

								// let nextHit = _.min(hitTimes)

								for (let nuke of nukes) {
									let range = structure.pos.getRangeTo(nuke.pos);
									if (range == 0) {
										nukeDamage += NUKE_DAMAGE[0];
									}
									else if (range <= 2) {
										nukeDamage += NUKE_DAMAGE[2];
									}
								}

								for (let nextHit of hitTimes) {
									let tmpBurstNukeDamage = 0
									for (let nuke of nukes) {
										let range = structure.pos.getRangeTo(nuke.pos);
										if (range == 0) {
											if (Math.abs(nuke.timeToLand - nextHit) < 5000) {
												tmpBurstNukeDamage += NUKE_DAMAGE[0];
											}
										}
										else if (range <= 2) {
											if (Math.abs(nuke.timeToLand - nextHit) < 5000) {
												tmpBurstNukeDamage += NUKE_DAMAGE[2];
											}
										}
									}

									if (tmpBurstNukeDamage > burstNukeDamage) {
										burstNukeDamage = tmpBurstNukeDamage
									}

								}

								if (burstNukeDamage > structure.hitsMax) {
									nukeDamage = 0
									if (room.controller.level < 8) {
										global.roomOverNuked[room.name] = true;
									}
								}
							}

							// if (structure.hitsMax - nukeDamage < 0 && room.controller.level < 8) {
							// 	global.roomOverNuked[room.name] = true;
							// }

							if (nukeDamage) {
								priority = (rcl / 8) * 0.05 * WALL_HITS_MAX / Math.max(200000, structure.hits - (nukeDamage ? nukeDamage * (1 - (structure.room.mem.nukeLandTime - Game.time) / 100000) : 0));
							}
							else {
								priority = (rcl / 8) * 0.05 * WALL_HITS_MAX / Math.max(10000, structure.hits);
							}

							if (structure.hits - nukeDamage < 200000) {
								let allStructs = structure.pos.lookFor(LOOK_STRUCTURES);


								// Includes myself
								// High priority for important structures
								// Ignore low importance structures if it looks expensive.
								let highP = 0;
								for (let struct of allStructs) {
									if (struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER && struct.structureType != STRUCTURE_RAMPART) {
										priority += 25;
									}

									if (struct.structureType == STRUCTURE_TERMINAL) {
										priority *= 9;
										highP = 1;
									}
									else if (struct.structureType == STRUCTURE_STORAGE) {
										priority *= 8;
										highP = 1;
									}
									else if (struct.structureType == STRUCTURE_SPAWN) {
										priority *= 7;
										highP = 1;
									}
									else if (struct.structureType == STRUCTURE_FACTORY) {
										priority *= 6.5;
										highP = 1;
									}
									else if (struct.structureType == STRUCTURE_LAB) {
										priority *= 6;
										highP = 1;
									}
									else if (struct.structureType == STRUCTURE_TOWER) {
										if (nukeDamage - structure.hits > 2 * NUKE_DAMAGE[0]) {
											nukeDamage = 0;
										}
										else {
											priority *= 1.25;
											highP = 1;
										}
									}
									else if (struct.structureType == STRUCTURE_NUKER) {
										if (nukeDamage - structure.hits > 4 * NUKE_DAMAGE[0]) {
											nukeDamage = 0;
										}
										else {
											priority *= 1.125;
											highP = 1;
										}
									}
									else if (struct.structureType == STRUCTURE_OBSERVER || struct.structureType == STRUCTURE_POWER_SPAWN) {
										if (nukeDamage - structure.hits > 3 * NUKE_DAMAGE[0]) {
											nukeDamage = 0;
										}
										else {
											priority *= 1.125;
											highP = 1;
										}
									}
								}

								// Not protecting anything and not easy to repair
								if (!highP && (structure.hits - burstNukeDamage < -100e3 || structure.hitsMax - burstNukeDamage <= 10000)) {
									// Not on the perimiter
									if (structure.internal || structure.hitsMax - burstNukeDamage <= 10000) {
										priority = -1;
										nukeDamage = 0;
									}
									// Or it is and we have nukeRamparts building which don't go internal
									else if (room.mem.nukeRamparts && room.mem.nukeRamparts.length && !room.mem.nukeRampartsInternal && !structure.nukeRampart) {
										priority = -1;
										nukeDamage = 0;
									}
								}

								if (!highP && room.mem.nukeRamparts && !room.mem.nukeRampartsInternal && room.mem.nukeLandTime && !structure.nukeRampart) {
									for (let struct of allStructs) {
										if (structure.hits - nukeDamage < -100e3) {
											nukeDamage = 0;
											priority = -1;
										}
									}
								}
							}

							let energyMod = spawnCheck ? 0.8 : 1;

							// if (Memory.swc) energyMod *= 0.75;
							if (Memory.economyArena) energyMod *= 0.125;

							if (Game.gcl.level == 1) {
								energyMod *= 0.25;
							}
							else if (Game.gcl.level == 2) {
								energyMod *= 0.75;
							}

							if (Memory.maxEnemyRoomLevel < 6) {
								priority *= 0.25;
								energyMod *= 0.25;
							}
							else if (Memory.maxEnemyRoomLevel == 6) {
								priority *= 0.5;
								energyMod *= 0.5;
							}
							else if (Memory.maxEnemyRoomLevel == 7) {
								priority *= 0.75;
								energyMod *= 0.75;
							}

							if (rcl == 8) {
								if (!Memory.botArena) {
									energyMod *= 3;
								}
								else {									
									energyMod *= 1.5;
								}
								priority *= 1.5;
							}
							else if (rcl == 7) {
								priority *= 1.25;
								energyMod *= 1.25;
							}
							else if (rcl == 6) {
								priority *= 1.1;
								energyMod *= 1.1;
							}

							if (structure.external) {
								priority *= 0.5;
								energyMod *= 0.5;
							}
							else if (structure.internal) {
								priority *= 0.7;
								energyMod *= 0.7;
							}

							// structure.room.visual.text(Math.round(priority), structure.pos.x, structure.pos.y)


							let lowestLimit = 2e6 * rcl * rcl * rcl / 512

							if ((Memory.swc || (Memory.botArena && !Memory.timedRound)) && !Memory.season && Memory.tick < 0.5e6) {
								energyMod *= Math.pow(Memory.tick / 0.5e6, 1.25);
								lowestLimit *= Math.pow(Memory.tick / 0.5e6, 1.25);
							}
							else if (((Memory.botArena && Memory.timedRound) || Memory.season1 || Memory.season2) && Memory.tick < 1e6) {
								energyMod *= Math.pow(Memory.tick / 1e6, 1.25);
								lowestLimit *= Math.pow(Memory.tick / 1e6, 1.25);
							}
							else if (Memory.season && Memory.tick < 0.75e6) {
								energyMod *= Math.pow(Memory.tick / 0.75e6, 1.25);
								lowestLimit *= Math.pow(Memory.tick / 0.75e6, 1.25);
							}

							if (lowRamparts) {
								if (Math.random() < 0.001) {
									console.log("lowRamparts set")
								}
								energyMod *= 0.25
								lowestLimit *= 0.25
							}

							if (Memory.season5 && structure.room.mem.claimToUnclaimRoom) {
								if (lowRamparts) {
									priority *= 0.001
									lowestLimit *= 0.001
									energyMod *= 0.001
								}
								else {
									priority *= 0.1;
									lowestLimit *= 0.1
									energyMod *= 0.1;
								}
							}


							if (room.effectiveLevel == 8) {
								if (roomEnergy > constants.ROOM_ENERGY_ENERGY_INTO_WALLS_2) {
									priority *= 1.5;
									energyMod *= 1.5;
								}
								if (roomEnergy > constants.ROOM_ENERGY_ENERGY_INTO_WALLS_3) {
									priority *= 1.5;
									energyMod *= 1.5;
								}
							}

							if (towers && towers.length > 0) {
								let towerDamage = 0;
								for (let tower of towers) {
									let range = structure.pos.getRangeTo(tower.pos);
									towerDamage += util.getTowerDamageForDist(range);
								}

								// NOTE: This assumes that tower damages are 600->150. This will then go to 0 for 150 damage, 1 for 450 damage
								let towerDamagePercent = (towerDamage - towers.length * 150) / (towers.length * 450);

								// Repair guys that are further away at higher priority. They're higher risk.
								priority *= (1.5 - 0.5 * towerDamagePercent);
								energyMod *= (1.5 - 0.5 * towerDamagePercent);
							}

							if (structure.pos.x >= 45 || structure.pos.x <= 4 || structure.pos.y >= 45 || structure.pos.y <= 4) {
								if (structure.pos.findFirstInRange(FIND_EXIT, 4)) {
									priority *= 1.2;
									energyMod *= 1.2;
								}
							}

							if (Memory.roomPressurePoints &&
								Memory.roomPressurePoints[room.name] &&
								Memory.roomPressurePoints[room.name][structure.id] &&
								Game.time - Memory.roomPressurePoints[room.name][structure.id].t < 10000) {

								let dangerMod = room.dangerous ? 1 : 0.5;

								energyMod *= 1.2;

								if (Game.time - Memory.roomPressurePoints[room.name][structure.id].t < 100) {
									priority += 50 * dangerMod;
									priority *= 5 * dangerMod;
								}
								else {
									priority *= 5 * dangerMod;
								}
							}
							if (structure.hits < 10000) {
								let dangerMod = room.dangerous ? 1 : 0.5;

								energyMod *= 1.2;
								priority += 100 * dangerMod;
								priority *= 10 * dangerMod;
							}

							let effectiveNukeDamage = 0
							if (nukeDamage && room.mem.nukeLandTime !== undefined) {								
								if (room.mem.nukeLandTime - Game.time < 22000) {
									effectiveNukeDamage = nukeDamage
								}
								else {
									effectiveNukeDamage = nukeDamage * (1 - (room.mem.nukeLandTime - Game.time - 22000) / 28000)
								}
							}

							let effectiveHits = structure.hits - effectiveNukeDamage
							if (!structure.internal && !structure.external && effectiveHits < lowestLimit) {
								if (effectiveHits < 0) {
									room.memory.outerWallDamageLevel = 5;
								}
								else if (effectiveHits < 0.25 * lowestLimit) {
									room.memory.outerWallDamageLevel = Math.max(room.memory.outerWallDamageLevel, 4);
								}
								else if (effectiveHits < 0.5 * lowestLimit) {
									room.memory.outerWallDamageLevel = Math.max(room.memory.outerWallDamageLevel, 3);
								}
								else if (effectiveHits < 0.75 * lowestLimit) {
									room.memory.outerWallDamageLevel = Math.max(room.memory.outerWallDamageLevel, 2);
								}
								else if (effectiveHits < 1 * lowestLimit) {
									room.memory.outerWallDamageLevel = Math.max(room.memory.outerWallDamageLevel, 1);
								}
							}


							if (roomEnergy > constants.ROOM_ENERGY_ENERGY_INTO_WALLS) {
								energyMod *= roomEnergy / constants.ROOM_ENERGY_ENERGY_INTO_WALLS;
							}

							if (boosted) {
								energyMod *= 2
							}

							// Disable spawn + dismantle "shock" attacks are a risk. We can counter in time from other rooms, but
							// we don't want to lose these key buildings
							if (Memory.season3 && !lowRamparts) {
								let allStructs = structure.pos.lookFor(LOOK_STRUCTURES);
								for (let struct of allStructs) {
									if (struct.structureType == STRUCTURE_TERMINAL || struct.structureType == STRUCTURE_STORAGE || struct.structureType == STRUCTURE_SPAWN) {
										priority *= 1.5;
										energyMod *= 3;
									}
								}
							}

							if (room.defcon == 5 && effectiveHits > 3e6 * energyMod) {
								priority = -1;
							}
							else if (room.defcon == 4 && effectiveHits > 4e6 * energyMod) {
								priority = -1;
							}
							else if (room.defcon == 3 && effectiveHits > 6e6 * energyMod) {
								priority = -1;
							}
							else if (room.defcon == 2 && effectiveHits > 10e6 * energyMod) {
								priority = -1;
							}
							else if (room.defcon == 1 && effectiveHits > 30e6 * energyMod) {
								priority = -1;
							}
							else if (structure.hits >= structure.hitsMax * (nukeDamage ? 1 : .95)) {
								priority = -1;
							}

							if (Memory.reallyForceLowRamparts && effectiveHits > 3e6) {
								priority = -1;
							}
						}
						else {
							priority = -1;
						}
					}
					else {
						priority = -1;

					}
					break;
				case STRUCTURE_OBSERVER:
				case STRUCTURE_LINK:
				case STRUCTURE_EXTRACTOR:
				case STRUCTURE_NUKER:
				case STRUCTURE_LAB:
				case STRUCTURE_STORAGE:
				case STRUCTURE_TERMINAL:
				case STRUCTURE_FACTORY:
				case STRUCTURE_POWER_SPAWN:
					if (structure.my && structure.hitsMax != structure.hits) priority = 4 * structure.hitsMax / structure.hits;
					break;
				case STRUCTURE_TOWER:
					if (structure.my && structure.hitsMax != structure.hits) priority = 100 * structure.hitsMax / structure.hits;
					break;
				case STRUCTURE_POWER_BANK:
				case STRUCTURE_KEEPER_LAIR:
				case STRUCTURE_PORTAL:
					priority = 0;
					break;

				default:
					console.log("Structure not covered by roomAI repair switch", structure.structureType)
					if (structure.my && structure.hitsMax != structure.hits) priority = 1e-9;
			}

			// Use distance as a tiebreaker
			if (!spawnCheck && dist) {
				priority *= 1 - dist / 1500	
			}			

			if (Memory.visRoomRepair && structure.room.name == Memory.visRoomRepair) {
				vis.text(Math.round(priority), structure.pos.x, structure.pos.y, {font: 0.5})
			}

			if (priority > maxPriority * (0.99 + 0.02 * Math.random())) {
				maxPriority = priority;
				priorityRepair = structure;
			}
		}
		return {priority: maxPriority, target: priorityRepair};
	},

	getNumBuildersRequired: function(room) {
		if (!room) return

		// Ignore construction sites in my room if I have pioneers.
		// Pioneers will tend to be boosted
		// And it'll tend to be one pioneer is stronger than all the builders I may build
		let anyPioneers = room.mem.ownedCreeps && room.mem.ownedCreeps["pioneer"] && room.mem.ownedCreeps["pioneer"].length

		var sites = anyPioneers ? [] : room.find(FIND_MY_CONSTRUCTION_SITES);
		// console.log(anyPioneers, sites)

		for (var roomName of _.uniq(room.buildRooms.concat(room.goodRooms))) {
			if (Game.rooms[roomName]) {
				if (roomName != room.name) {
					sites = sites.concat(Game.rooms[roomName].find(FIND_MY_CONSTRUCTION_SITES));
				}
			}
		}

		// console.log(anyPioneers, sites)

		var count = 0;
		for(var site of sites) {

			switch (site.structureType) {
				case STRUCTURE_EXTENSION:
					count += 0.05;
					break;
				case STRUCTURE_ROAD:
					if (site.room.keeperRoom) {
						count += 0.2;
					}
					else {
						count += 0.1;
					}
					break;
				case STRUCTURE_WALL:
				case STRUCTURE_RAMPART:
					count += 0.001;
					break;
				case STRUCTURE_TOWER:
					count += 0.5;
					break;
				case STRUCTURE_SPAWN:
					count += 1;
					break;
				case STRUCTURE_CONTAINER:
					if (site.room.keeperRoom) {
						count += 0.5;
					}
					else {
						count += 0.1;
					}
					break;
				case STRUCTURE_LINK:
					count += 0.05;
					break;
				case STRUCTURE_STORAGE:
					count += 2.5;
					break;
				case STRUCTURE_TERMINAL:
					count += 0.9;
					break;
				case STRUCTURE_LAB:
					count += 0.1;
					break;
				default:
					count += 0.001;
			}
		}

		if (count > 0 && room.storage && room.storage.store[RESOURCE_ENERGY] < 50000) {
			count = 1;
		}

		if (count && Object.keys(Game.constructionSites).length > 80) {
			count *= 2;
		}

		// if (room.effectiveLevel == 8) {
		// 	return count > 0 ? 1 : 0;
		// }
		// else {
			return Math.ceil(count * (room.controller.level <= 3 ? 2.5 : 1));
		// }

	},


	getRemoteHarvestingValue: function(parentRoomName, testRoomName, idealized, refreshPercentage, claimScan) {
		var parentRoom = Game.rooms[parentRoomName];

		if (!Memory.rooms[testRoomName].sP ||
			(parentRoom && !parentRoom.energyCapacityAvailable && parentRoom.controller && parentRoom.controller.my) || 
			Memory.rooms[testRoomName].owner) {
			if (Memory.remoteHarvestingValues && Memory.remoteHarvestingValues[parentRoomName] && Memory.remoteHarvestingValues[parentRoomName][testRoomName]) {
				delete Memory.remoteHarvestingValues[parentRoomName][testRoomName];
			}
			return {"v": -1, "u": 0, "c": 0};
		}

		if (Memory.swc && Memory.rooms[testRoomName].reservedBy && global.whiteList.includes(Memory.rooms[testRoomName].reservedBy)) {
			return {"v": -1, "u": 0, "c": 0};
		}
		// else if (Memory.swc && Game.time < 600000 && parentRoomName == "E1N4" && (testRoomName =="E1N6") && global.whiteList.includes("Sergey")) {
		// 	return {"v": -1, "u": 0, "c": 0};
		// }

		if (Memory.tick < 2000) {
			idealized = true
		}

		if (Memory.season2) {
			if (testRoomName == "W17N6" || testRoomName == "W18N5" || testRoomName == "W16N6") {
				return {"v": -1, "u": 0, "c": 0};
			}

			// Kasami is a pain
			if (testRoomName == "W24S14" || 
				testRoomName == "W24S15" || 
				testRoomName == "W24S16" ||
				testRoomName == "W25S14" || 
				testRoomName == "W25S15" || 
				testRoomName == "W25S16" ||
				testRoomName == "W26S14" || 
				testRoomName == "W26S15" || 
				testRoomName == "W26S16") {
				return {"v": -1, "u": 0, "c": 0};
			}


			let roomCoords = util.getRoomCoords(testRoomName)

			if (roomCoords.x >= 11 && roomCoords.y <= 21 &&
				roomCoords.y >= 11 && roomCoords.y <= 21) {
				return {"v": -1, "u": 0, "c": 0};
			}

		}
		// Hard stop for Xolym
		if (Memory.season4) {
			let roomCoords = util.getRoomCoords(testRoomName)
			if (roomCoords.y >= 16) {
				return {"v": -1, "u": 0, "c": 0};
			}

			if (testRoomName == "W16N1" || testRoomName == "W17N2" || testRoomName == "W16N2") {
				return {"v": -1, "u": 0, "c": 0};
			}

		}

		if (!claimScan && !idealized) {
			Memory.remoteHarvestingValues = Memory.remoteHarvestingValues || {};
			Memory.remoteHarvestingValues[parentRoomName] = Memory.remoteHarvestingValues[parentRoomName] || {}
			Memory.remoteHarvestingValues[parentRoomName][testRoomName] = Memory.remoteHarvestingValues[parentRoomName][testRoomName] || {}
		}

		if (Memory.rooms[testRoomName].loot) {
			refreshPercentage *= 4;
		}

		if (!claimScan &&
			!idealized &&
			Memory.remoteHarvestingValues[parentRoomName][testRoomName] &&
			Memory.remoteHarvestingValues[parentRoomName][testRoomName].v !== undefined &&
			(Math.random() > refreshPercentage || Game.cpu.getUsed() > 400)) {
			return Memory.remoteHarvestingValues[parentRoomName][testRoomName];
		}
		else {
			let keeperRoom = false;
			let centreRoom = false;
			let normalRoom = true;
			var sectorCoords = util.getSectorCoords(testRoomName);
			if (sectorCoords.x >= 4 && sectorCoords.x <= 6 && sectorCoords.y >= 4 && sectorCoords.y <= 6) {
				if (sectorCoords.x == 5 && sectorCoords.y == 5) {
					centreRoom = true;
					normalRoom = false;
				}
				else {
					keeperRoom = true;
					normalRoom = false;
				}
			}



			// Need RCL to do keeper rooms
			if (!Memory.inactiveSourceKeepers && keeperRoom && parentRoom && (parentRoom.effectiveLevel < 7 || parentRoom.energyCapacityAvailable < 4410)) {
				return {"v": -1, "u": 0, "c": 0};
			}

			if (centreRoom && Memory.season5) {
				return {"v": -1, "u": 0, "c": 0};	
			}


			var harvestPathLength = 0;
			var harvestPaths = [];


			// If we're using this to judge the value of rooms to claim we don't know where the storage is going to be
			// The trouble is that really this is chicken and egg: we want to place the storage is the best place for this
			// algo, but solving for that is... a pain.
			// Hacked solution is to allow any tile within 20 tiles of the centre of the room, then add 20 to the path length.

			let effectiveNumSources = roomIntel.getEffectiveNumSources(testRoomName)
			let sourceCount = roomIntel.getNumSources(testRoomName)

			// Well this isn't right. Really we want paths to and from at offroad speed for low RCL.
			// Right now we just assume on-road speed at all times.
			// let moveSpeed = parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel < 3 ? 1 : 3; //(claimScan || (parentRoom && parentRoom.effectiveLevel >= 3)) ? 3 : 2
			let moveSpeed = (claimScan || (parentRoom && parentRoom.effectiveLevel >= 3)) ? 5 : 2

			for (var sourceIdx = 0; sourceIdx < sourceCount; sourceIdx++) {
				let sourceX = roomIntel.getSourceX(testRoomName, sourceIdx);
				let sourceY = roomIntel.getSourceY(testRoomName, sourceIdx);


				if (Memory.rooms[parentRoomName].storageX) {
					// harvestPaths.push(roomDesignAI.getDesignRoadPath(new RoomPosition(Memory.rooms[parentRoomName].storageX, Memory.rooms[parentRoomName].storageY, parentRoomName),
					// 							 			 new RoomPosition(sourceX, sourceY, testRoomName),
					// 										 2, null, true));
					harvestPaths.push(pathCache.getPathAnalyseRooms(new RoomPosition(Memory.rooms[parentRoomName].storageX, Memory.rooms[parentRoomName].storageY, parentRoomName),
									 								new RoomPosition(sourceX, sourceY, testRoomName), 1, moveSpeed, false, true, {"avoidEnemyRooms": 1, "saveRoomNames": 1}));

					// console.log(harvestPaths[sourceIdx].cost, harvestPaths[sourceIdx].path.length)
					// console.log(JSON.stringify(harvestPaths[sourceIdx]))
					if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel < 3 && harvestPaths[sourceIdx].cost !== undefined) {
						harvestPathLength += harvestPaths[sourceIdx].cost;
					}
					else {
						harvestPathLength += harvestPaths[sourceIdx].path.length;
					}

					if (harvestPaths[sourceIdx].incomplete) {
						if (harvestPaths[sourceIdx].path.length > 0) {
							console.log("Incomplete harvestPath to", testRoomName, "Terminates in", harvestPaths[sourceIdx].r[harvestPaths[sourceIdx].r.length-1])
							if (harvestPaths[sourceIdx].r[harvestPaths[sourceIdx].r.length-1] != testRoomName) {
								harvestPathLength += 100;
							}
						}
						else {
							console.log("Incomplete harvestPath to", testRoomName)
							harvestPathLength += 500;
						}
					}
				}
				else {
					console.log("Harvest path to 25 25???")
					harvestPaths.push(pathCache.getPathAnalyseRooms(new RoomPosition(sourceX, sourceY, testRoomName),
														new RoomPosition(25, 25, parentRoomName), 20, moveSpeed, false, true, {"avoidEnemyRooms": 1, "saveRoomNames": 1}));


					// if (!harvestPaths[sourceIdx].incomplete) {
					if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel < 3) {
						harvestPathLength += harvestPaths[sourceIdx].cost;
					}
					else {						
						harvestPathLength += harvestPaths[sourceIdx].path.length + 20;
					}
					// }
					// else {
						// Well shit
						// harvestPathLength += 500;
					// }

				}
			}

			// 
			let sourceSourceDist;
			if (sourceCount == 2) {
				// We want to be able to container to container stuff
				if (Game.rooms[testRoomName]) {
					let sourcePos0 = new RoomPosition(roomIntel.getSourceX(testRoomName, 0), roomIntel.getSourceY(testRoomName, 0), testRoomName)
					let sourcePos1 = new RoomPosition(roomIntel.getSourceX(testRoomName, 1), roomIntel.getSourceY(testRoomName, 1), testRoomName)

					let container0 = sourcePos0.findFirstInRange(Game.rooms[testRoomName].containers, 1)
					let container1 = sourcePos1.findFirstInRange(Game.rooms[testRoomName].containers, 1)

					if (container0 && container1) {						
						let sourceSourcePath = pathCache.getPathAnalyseRooms(container0.pos, container1.pos, 0, 0, false, true, {})
						if (!sourceSourcePath.incomplete) {
							sourceSourceDist = sourceSourcePath.path.length
						}
					}
				}
			}



			let controllerPathLength;
			let controllerPath;

			if (keeperRoom || centreRoom) {
				controllerPathLength = 0;
			}
			else {
				if (Memory.rooms[parentRoomName].spawnBatteryCentreX) {
					controllerPath = pathCache.getPathAnalyseRooms(new RoomPosition(Memory.rooms[parentRoomName].spawnBatteryCentreX, Memory.rooms[parentRoomName].spawnBatteryCentreY, parentRoomName),
													   new RoomPosition(Memory.rooms[testRoomName].conX, Memory.rooms[testRoomName].conY, testRoomName),
													   1, 5, false, true, {"avoidEnemyRooms": 1, "saveRoomNames": 1});

					controllerPathLength = controllerPath.path.length;
					if (controllerPath.incomplete) {
						if (controllerPath.path.length > 0) {
							if (controllerPath.r[controllerPath.r.length-1] != testRoomName) {
								controllerPathLength += 100;
							}
						}
						else {
							controllerPathLength += 250;
						}
					}
				}
				else {
					controllerPath = pathCache.getPathAnalyseRooms(new RoomPosition(Memory.rooms[testRoomName].conX, Memory.rooms[testRoomName].conY, testRoomName),
													   new RoomPosition(25, 25, parentRoomName),
													   20, 5, false, true, {"avoidEnemyRooms": 1, "saveRoomNames": 1});
					// if (!controllerPath.incomplete) {
						controllerPathLength = controllerPath.path.length + 20;
					// }
					// else {
						// Well shit
						// controllerPathLength = 500;
					// }
				}
			}

	 		let baseSourceYield;
	 		let sourceYield;
	 		// Not enough WORK, no container
	 		if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 1) {

	 			if (Memory.privateServer && Memory.rooms[testRoomName].sT) {
	 				baseSourceYield = 0
	 				
					for (var sourceIdx = 0; sourceIdx < sourceCount; sourceIdx++) {
						if (Memory.season3 && sourceCount == 1) {
							baseSourceYield += Math.min(2 * SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 4 * roomIntel.getSourceTiles(testRoomName, sourceIdx))
						}
						else {
							baseSourceYield += Math.min(SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 4 * roomIntel.getSourceTiles(testRoomName, sourceIdx))
						}
					}

					baseSourceYield /= sourceCount
	 			}
	 			else {
	 				baseSourceYield = 4;
	 			}

	 			sourceYield = baseSourceYield - 1;
	 		}
	 		// No reservation, no container
	 		else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2 && !keeperRoom && !centreRoom) {
	 			// 4 work max.

	 			if (Memory.privateServer && Memory.rooms[testRoomName].sT) {
	 				baseSourceYield = 0

					for (var sourceIdx = 0; sourceIdx < sourceCount; sourceIdx++) {
						if (Memory.season3 && sourceCount == 1) {
							baseSourceYield += Math.min(2 * SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 8 * roomIntel.getSourceTiles(testRoomName, sourceIdx))
						}
						else {
							baseSourceYield += Math.min(SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 8 * roomIntel.getSourceTiles(testRoomName, sourceIdx))
						}
					}

					baseSourceYield /= sourceCount
	 			}
	 			else {
		 			if (Memory.season3 && sourceCount == 1) {	 			
		 				baseSourceYield = Math.min(2 * SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 8);
		 			}
		 			else {
		 				baseSourceYield = Math.min(SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 8);	
		 			}
	 			}

	 			sourceYield = baseSourceYield - 1;
	 		}
	 		// Reservation, no container
	 		else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 3 && !keeperRoom && !centreRoom) {
	 			if (Memory.privateServer && Memory.rooms[testRoomName].sT) {
	 				baseSourceYield = 0
	 				
					for (var sourceIdx = 0; sourceIdx < sourceCount; sourceIdx++) {
						if (Memory.season3 && sourceCount == 1) {
							baseSourceYield += Math.min(2 * SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME, 12 * roomIntel.getSourceTiles(testRoomName, sourceIdx))
						}
						else {
							baseSourceYield += Math.min(SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME, 12 * roomIntel.getSourceTiles(testRoomName, sourceIdx))
						}
					}

					baseSourceYield /= sourceCount	 	
	 			}
	 			else {
		 			if (Memory.season3 && sourceCount == 1) {	 			
		 				baseSourceYield = Math.min(2 * SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME, 12);
		 			}
		 			else {
		 				baseSourceYield = Math.min(SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME, 12);	
		 			}
	 			}

	 			sourceYield = baseSourceYield - 1;
	 		}
	 		else if (keeperRoom || centreRoom) {
	 			if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2) {
	 				baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 8);
	 				sourceYield = baseSourceYield - 1;
	 			}
	 			else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 3) {
	 				baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 12);
	 				sourceYield = baseSourceYield - 1;
	 			}
	 			else {
	 				baseSourceYield = SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME;
	 				sourceYield = baseSourceYield - 0.5;
	 			}
	 		}
	 		else {
	 			if (Memory.season3 && sourceCount == 1) {
	 				baseSourceYield = 2 * SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
	 			}
	 			else {
	 				baseSourceYield = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
	 			}

	 			sourceYield = baseSourceYield - 0.5;
	 		}



			// Haulers Costs:
			//	2xcarry 1xmove per tick to move 100 energy one tile. Equal to 0.1 enegy/tick to move 100 energy one tile. We get 10 energy/source/tick so each source needs 0.01 energy/tick/tile one-way.
			//	Need to go there and back, so double
			let haulerCost = 0.01 * harvestPathLength * 2;

			// We have to get a carry part to each source every carryPeriod ticks.
			let carryPeriod = CARRY_CAPACITY / sourceYield;

			let haulerSpawnUtil;
			// No roads before 3, so 1:1 carry:move
			if (parentRoom && parentRoom.controller && parentRoom.controller.my && parentRoom.effectiveLevel < 3) {
				haulerSpawnUtil = ((CREEP_SPAWN_TIME * 2) * harvestPathLength * 2) / carryPeriod;
				// haulerSpawnUtil *= 0.4; // Not reserving
			}
			// 1 carry comes with 0.5 moves.
			else {
				haulerSpawnUtil = ((CREEP_SPAWN_TIME * 1.5) * harvestPathLength * 2) / carryPeriod;
			}

			let numCarryPerHauler;
			if (parentRoom && parentRoom.controller && parentRoom.controller.my) {
				if (parentRoom.effectiveLevel < 3) {
					numCarryPerHauler = Math.floor(Math.min(MAX_CREEP_SIZE / 2, parentRoom.energyCapacityAvailable / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])));
				}
				else {
					numCarryPerHauler = Math.floor(Math.min(2 * MAX_CREEP_SIZE / 3, 2 * parentRoom.energyCapacityAvailable / (BODYPART_COST[CARRY] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE])));
				}
			}
			else {
				// Claim for RCL 7+ CPU optimization. Perhaps a bit dodgy.
				numCarryPerHauler = 32;
			}

			let numHaulers = (harvestPathLength * 2) / (carryPeriod * numCarryPerHauler);
			let haulerCPUCost = numHaulers * global.INTENT_CPU_COST;

			// Harvester Costs:
			//	Call it 6xwork 3xmove, 1 carry per tick. ~0.5 energy/tick total. Multiply this by 1500/useful time.
			let harvesterCost;
			let harvesterSpawnUtil;
			/*if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 1) {
			 	harvesterSpawnUtil = (4 * CREEP_SPAWN_TIME) * sourceCount * (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount)));
			 	harvesterCost = ((BODYPART_COST[WORK] * 2 + BODYPART_COST[MOVE] + BODYPART_COST[CARRY]) / CREEP_LIFE_TIME) * sourceCount * (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount)));
			}
			if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2) {
			 	harvesterSpawnUtil = (7 * CREEP_SPAWN_TIME) * sourceCount * (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount)));
			 	harvesterCost = ((BODYPART_COST[WORK] * 4 + BODYPART_COST[MOVE] * 2 + BODYPART_COST[CARRY]) / CREEP_LIFE_TIME) * sourceCount * (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount)));
			}
			else {*/
				// The above code was nice, but we tended to get stale values leading to overexpansion in RCL 3. RCL 3 is pretty damn quick and we have multi-harvesters per source now, so this will do.
			// }

			if (keeperRoom) {
				let lifeMod = (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount) - 16 * CREEP_SPAWN_TIME))

				harvesterSpawnUtil = (16 * CREEP_SPAWN_TIME) * sourceCount * lifeMod;
			 	harvesterCost = ((BODYPART_COST[WORK] * 10 + BODYPART_COST[MOVE] * 5 + BODYPART_COST[CARRY]) / CREEP_LIFE_TIME) * sourceCount * lifeMod;
			}
			else if (centreRoom) {
				let lifeMod = (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount) - 13 * CREEP_SPAWN_TIME))

				harvesterSpawnUtil = (13 * CREEP_SPAWN_TIME) * sourceCount * lifeMod;
			 	harvesterCost = ((BODYPART_COST[WORK] * 8 + BODYPART_COST[MOVE] * 4 + BODYPART_COST[CARRY]) / CREEP_LIFE_TIME) * sourceCount * lifeMod;
			}
			else {
				let lifeMod = (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount) - 10 * CREEP_SPAWN_TIME))

				harvesterSpawnUtil = (10 * CREEP_SPAWN_TIME) * sourceCount * lifeMod;
			 	harvesterCost = ((BODYPART_COST[WORK] * 6 + BODYPART_COST[MOVE] * 3 + BODYPART_COST[CARRY]) / CREEP_LIFE_TIME) * sourceCount * lifeMod;
			}

			if (Memory.season3 && sourceCount == 1) {
				harvesterSpawnUtil *= 2
				harvesterCost *= 2
			}

			let harvesterCPUCost = sourceCount * global.INTENT_CPU_COST * (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount)));



			let yieldPerCPU = Memory.stats.yieldPerCPU || 1;

			// Assume we'll be spawning fat harvesters.
			if ((!parentRoom || !parentRoom.controller.my || parentRoom.effectiveLevel >= 7) && yieldPerCPU > 1) {
				// HACK
				let mod;
				if (yieldPerCPU < 5) {
					mod = 1;
				}
				else if (yieldPerCPU < 6.5) {
					mod = 0.75;
				}
				else if (yieldPerCPU < 9.5) {
					mod = 0.6;
				}
				else if (yieldPerCPU < 13) {
					mod = 0.6;
				}
				else if (yieldPerCPU < 17) {
					mod = 0.43;
				}
				else {
					mod = 0.375
				}

				harvesterCPUCost *= mod;
				harvesterCost /= mod;
				harvesterSpawnUtil /= mod;
			}


			// Reserver costs:
			//	Need 1 claim, 0.5 move to get 100% uptime. Lives for 500 ticks
			let reserverCost = ((BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) / CREEP_CLAIM_LIFE_TIME) * (CREEP_CLAIM_LIFE_TIME / (CREEP_CLAIM_LIFE_TIME - controllerPathLength));
			let reserverSpawnUtil = (2 * CREEP_SPAWN_TIME) * (CREEP_CLAIM_LIFE_TIME / (CREEP_CLAIM_LIFE_TIME - controllerPathLength - 2 * CREEP_SPAWN_TIME));
			let reserverCPUCost = global.INTENT_CPU_COST * (CREEP_CLAIM_LIFE_TIME / (CREEP_CLAIM_LIFE_TIME - controllerPathLength));

			if (parentRoom) {
				let numClaim = Math.min(7, Math.floor(parentRoom.energyCapacityAvailable / 650));
				if (numClaim >= 2) {
					reserverCPUCost /= numClaim;
				}
			}
			else if (claimScan) {
				// Magic
				reserverCPUCost /= 7
			}

			// Reservers kick in at RCL 3
			if ((parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel < 3) || keeperRoom || centreRoom) {
				reserverCost = 0;
				reserverSpawnUtil = 0;
				reserverCPUCost = 0;
			}


			// One energy every 1000 ticks on planes, 5 for swamps. Call that 2 every 1000 ticks.
			// We're assuming completely separate paths for two sources... hacky term is to balance against that.
			let roadUpkeepCost = 0.002 * harvestPathLength * (sourceCount >= 2 ? 0.75 : 1);

			// Add creeps walking. One body part costs 0.001 energy per tick while on a plain road, 0.005 on a swamp road. Call it 0.002.
			// haulerSpawnUtil / CREEP_SPAWN_TIME is the number of body parts we spawn for haulers
			// Return leg won't be on roads so much, so multiply by 0.75.
			// Ignoring other stuff on raods
			roadUpkeepCost += 0.002 * (haulerSpawnUtil / CREEP_SPAWN_TIME) * 0.75;

			// Assuming we're repairing with three work parts
			let roadUpkeepCPU = global.INTENT_CPU_COST * (roadUpkeepCost / (3 * REPAIR_POWER));

			if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel < 3) {
				roadUpkeepCost = 0;
				roadUpkeepCPU = 0;
			}


			let totalReward = 0;

			let guardSpawnUtil = 0;
			let guardCost = 0;
			let guardCPU = 0;
			//
			if (keeperRoom) {
				let lifeMod = (CREEP_LIFE_TIME / (CREEP_LIFE_TIME - (harvestPathLength / sourceCount) - 50 * CREEP_SPAWN_TIME))

				guardSpawnUtil = 50 * CREEP_SPAWN_TIME * lifeMod;
				guardCost = (4410 / CREEP_LIFE_TIME) * lifeMod; // Magic numbers :(
				guardCPU = 1.5 * global.INTENT_CPU_COST;

				// Picking up from tombstones
				haulerCost *= 1.2;
				haulerCPUCost *= 1.2;
				haulerSpawnUtil *= 1.2;

				// Magic number. Roughly what you can get from SKs - 2400 energy ever 300 ticks.
				totalReward += 8;
			}

			if (keeperRoom || centreRoom) {
				// Get minerals! Especially when there is no market
				if (Memory.empireStrength < 10 && (Memory.rooms[testRoomName].mineralAmount || claimScan)) {
					let minResourceAmount = Infinity;
					let minResource;
					let rawResources = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
					for (let resource of rawResources) {
						let resourceAmount = 0;
						for (let loopRoom of Game.myRooms) {
							resourceAmount += loopRoom.getCurrentOfResource(resource)
						}

						if (resourceAmount < minResourceAmount) {
							minResourceAmount = resourceAmount;
							minResource = resource;
						}
					}

					let mineralType = roomIntel.getMineralType(testRoomName);

					let mineralReward = (mineralType == minResource ? 2 : 1) * (Game.market.credits == 0 ? 3 : 1) * 2 * (10 - Memory.empireStrength)

					if (Memory.season2 && mineralType == "X") {
						mineralReward *= 2
					}
					if (Memory.season4 && mineralType == "O") {
						mineralReward *= 2
					}
					// Season 4 is all about these minerals
					if (Memory.season4) {
						mineralReward *= 2
					}

					// Assume 50% uptime
					let mod = claimScan ? 0.5 : 1

					totalReward += mineralReward * mod

					let numParts = (parentRoom ? creepCreator.getDesignForEnergyCap("miner", parentRoom.energyCapacityAvailable, false, false, true, {}).length : 50)

					harvesterSpawnUtil += numParts * CREEP_SPAWN_TIME * mod
					harvesterCPUCost += global.INTENT_CPU_COST / 5 * mod
					harvesterCost += (numParts / 5) * 450 / CREEP_LIFE_TIME * mod
				}
			}

			// People are gits
			if ((Memory.timedRound || Memory.season) && intelAI.getMaxHate() > 10000) {
				guardSpawnUtil += 10 * CREEP_SPAWN_TIME
			}

			// Lets be honest.
			// Looking at measurements harvesters don't carry nearly so much overhead.
			if (keeperRoom) {
				haulerCPUCost *= 1.4;
				harvesterCPUCost *= 1.1;
			}
			else {
				haulerCPUCost *= 1.25;
				harvesterCPUCost *= 1.05;
				reserverCPUCost *= 1.25;
			}

			let totalCost = haulerCost + harvesterCost + reserverCost + guardCost + roadUpkeepCost;
			let totalUtil = haulerSpawnUtil + harvesterSpawnUtil + reserverSpawnUtil + guardSpawnUtil;
			let totalCPU = haulerCPUCost + harvesterCPUCost + reserverCPUCost + guardCPU + roadUpkeepCPU;

			if (Memory.debugHarvestValues) {
				console.log(haulerCost, harvesterCost, reserverCost, guardCost, roadUpkeepCost)
			}


			// Favour low CPU options.
			// if (Memory.stats.avgBucket < 9000) {
			// 	totalCost += Game.energyPerCPU * totalCPU;
			// }

			totalReward += sourceCount * sourceYield;

			// Got a mineral and T3 boost invaders as well, give it a little bonus.
			// Actually no, we'll get this anyway and invaders are bad
			/*if ((keeperRoom || centreRoom) && (!parentRoom || !parentRoom.controller.my || parentRoom.effectiveLevel >= 7)) {
				if (Memory.rooms[testRoomName].mineralAmount || claimScan) {
					if (Memory.rooms[testRoomName].m == RESOURCE_OXYGEN ||
						Memory.rooms[testRoomName].m == RESOURCE_CATALYST) {
						totalReward *= 1.3
					}
					else if (Memory.rooms[testRoomName].m == RESOURCE_HYDROGEN ||
							 Memory.rooms[testRoomName].m == RESOURCE_LEMERGIUM) {
						totalReward *= 1.2
					}
					else {
						totalReward *= 1.1
					}
					// Mineral is more important than energy.
					if (parentRoom && parentRoom.effectiveLevel == 8) {
						totalReward *= 1.1;
					}
				}
			}*/

			// Swamps with no roads are nasty shit
			if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel < 3) {
				totalReward /= (1 + (Memory.rooms[testRoomName].sR || 0));
			}


			let loot
			// Kind of a hack
			if (!claimScan && !idealized && parentRoom && parentRoom.storage) {
				loot = Memory.rooms[testRoomName].loot || 0;

				if (loot && loot > 8000) {
					totalReward += Math.max(20, (loot - 8000) / 8000);

					if (loot > 400000) {
						totalReward *= 10;
					}
					else if (loot > 200000) {
						totalReward *= 5;
					}
					else if (loot > 100000) {
						totalReward *= 3;
					}
				}
				else {
					// Didn't effect score, allow it to save
					loot = 0
				}
			}

			if (!idealized) {
				// If we're not using them they'll track back toward being viable over time, but if we're trying to use them
				// and doing poorly then just stop.
				let harvestYield = Memory.rooms[testRoomName].meanHarvestYeild === undefined ? (sourceCount * baseSourceYield) : Memory.rooms[testRoomName].meanHarvestYeild
				totalReward *= harvestYield / (sourceCount * baseSourceYield);

				if (Memory.debugHarvestValues) {
					console.log("trmod", testRoomName, totalReward, harvestYield, sourceCount, baseSourceYield, Memory.rooms[testRoomName].meanHarvestYeild)
				}


			}


			// Higher is better. Negative is bad!
			var value = (totalReward - totalCost);



			if (Memory.debugHarvestValues) {
				console.log(value, totalReward, totalCost)
			}


			if (value < 0) {
				let result = {"v": Math.round(value * 1000) / 1000, "u": Math.round(totalUtil), "c": Math.round(totalCPU * 1000) / 1000};

				if (!claimScan && !idealized) {
					Memory.remoteHarvestingValues[parentRoomName][testRoomName] = result;
				}

				return result;
			}

			// Don't claim ones that rely on keeper rooms early
			if (claimScan && keeperRoom && Memory.timedRound) {
				if (Game.gcl.level < 5) {
					value *= Game.gcl.level / 5;
				}
			}

			let result = {"i": Math.round(value * 1000) / 1000}

			// console.log(totalReward, totalCost, totalUtil, Game.energyPerCPU * totalCPU, value, parentRoomName, testRoomName)

			// Now, some danger contributions. Want to factor in distance, proximity to enemies and our danger tracking.
			// I'm not sure if I want idealized == true at any point.
			if (!idealized) {
				// If we're not using them they'll track back toward being viable over time, but if we're trying to use them
				// and doing poorly then just stop.
				let harvestYield = Memory.rooms[testRoomName].meanHarvestYeild === undefined ? (sourceCount * baseSourceYield) : Memory.rooms[testRoomName].meanHarvestYeild
				value *= harvestYield / (sourceCount * baseSourceYield);
				if (Memory.debugHarvestValues) {
					console.log(value)
				}

				// Far is bad because bad people can kill us.
				// Drop linearly with distance With this calculation at 100 tiles mean we'll be multiplying by 0.875.
				value *= 1 - (harvestPathLength + controllerPathLength) / (800 * ((normalRoom ? 1 : 0) + sourceCount))
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// Danger!
				value -= (claimScan ? 0.025 : 0.05) * (Memory.rooms[testRoomName].DT || 1) * totalReward
				if (value < 0) {
					result.v = Math.round(value * 1000) / 1000
					result.u = Math.round(totalUtil)
					result.c = Math.round(totalCPU * 1000) / 1000

					if (!claimScan && !idealized) {
						Memory.remoteHarvestingValues[parentRoomName][testRoomName] = result;
					}

					return result;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				value *= 1 - (claimScan ? 0.05 : 0.1) * (Memory.rooms[testRoomName].DT || 1);
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// Danger is more important if we have more rooms as we can just get stuff from other rooms.
				if (!claimScan && (Memory.rooms[testRoomName].DT || 1) > 1. && parentRoom && parentRoom.effectiveLevel >= 6 && Memory.terminalNetworkFreeEnergy) {
					value /= 1 + 0.1 * (Memory.rooms[testRoomName].DT - 1) * Game.myRooms.length;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// If somebody else has reserved the target room we don't really want to be there.
				if (Memory.rooms[testRoomName].reservedBy && Memory.rooms[testRoomName].reservedBy != "Invader" && (claimScan || Memory.rooms[testRoomName].reservedBy != util.getMyName())) {
					value *= 0.5;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// Not claim scanning and it's already ours then consider the sunk cost.
				// This is done at the picking end
				// else if (!claimScan && Memory.rooms[testRoomName].reservedBy && Memory.rooms[testRoomName].reservedBy == util.getMyName()) {
				// 	value *= 1.1;
				// }

				// Maybe a bit harsh?
				if ((Memory.rooms[testRoomName].exitCampedB || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if ((Memory.rooms[testRoomName].exitCampedT || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if ((Memory.rooms[testRoomName].exitCampedL || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if ((Memory.rooms[testRoomName].exitCampedR || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				var pathRooms = [];
				// Figure out all the rooms between here and there.
				for (var pathIdx in harvestPaths) {
					if (harvestPaths[pathIdx].r) {						
						for (var pathRoomName of harvestPaths[pathIdx].r) {
							if (!pathRooms.includes(pathRoomName)) {
								pathRooms.push(pathRoomName)
							}
						}
					}
					else {
						console.log("No room names for harvestPath path", JSON.stringify(harvestPaths[pathIdx]))
					}
				}

				if (controllerPath) {
					if (controllerPath.r) {
						for (var pathRoomName of controllerPath.r) {
							if (!pathRooms.includes(pathRoomName)) {
								pathRooms.push(pathRoomName)
							}
						}
					}
					else {
						console.log("No room names for controller path", JSON.stringify(controllerPath))
					}
				}

				if (Memory.debugHarvestValues) {
					console.log("Path rooms from", parentRoomName, "to", testRoomName, "are", pathRooms)
					console.log(JSON.stringify(harvestPaths))
					console.log(JSON.stringify(controllerPath))
				}


				// If they're dangerous penalize.
				for (var roomName of pathRooms) {
					// console.log(roomName)
					if (roomName == parentRoomName) continue
					// if (roomName == testRoomName || roomName == parentRoomName) continue
					Memory.rooms[roomName] = Memory.rooms[roomName] || {}

					if ((Memory.rooms[roomName].restrictHarvestingUntil || 0) > Game.time) {
						if (claimScan) {
							value *= 0.95
						}
						else {
							value = 0;
							break;
						}
					}
					if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
						if (claimScan) {
							if (Memory.rooms[roomName].owner != "Invader") {
								value *= 0.25
							}
						}
						else {
							value = 0;
							break;
						}
					}

					if (Memory.debugHarvestValues) {
						console.log("a", roomName, value)
					}

					if (roomName == testRoomName) continue

					value -= (claimScan ? 0.025 : 0.05) * (Memory.rooms[roomName].DT || 1) * totalReward


					if (value < 0) {
						result.v = Math.round(value * 1000) / 1000
						result.u = Math.round(totalUtil)
						result.c = Math.round(totalCPU * 1000) / 1000

						if (!claimScan && !idealized) {
							Memory.remoteHarvestingValues[parentRoomName][testRoomName] = result;
						}

						return result;
					}

					if (Memory.debugHarvestValues) {
						console.log("b", roomName, value)
					}

					value *= 1 - (claimScan ? 0.125 : 0.25) * (Memory.rooms[roomName].DT || 1);

					if (Memory.debugHarvestValues) {
						console.log("c", roomName, value)
					}


					// Don't path through very dangerous rooms
					if (!claimScan) {
						value -= 0.05 * (Memory.rooms[roomName].DT || 1) * totalReward;
						if (Memory.rooms[roomName].DT > 1.5) {
							value = 0;
							break;
						}
						else if (Memory.rooms[roomName].DT > 1.25) {
							value /= 4;
						}
						else if (Memory.rooms[roomName].DT > 1.) {
							value /= 2;
						}

						// Danger is more important if we have more rooms as we can just get stuff from other rooms.
						if ((Memory.rooms[roomName].DT || 1) > 1. && parentRoom && parentRoom.effectiveLevel >= 6) {
							value /= 1 + 0.05 * (Memory.rooms[roomName].DT - 1) * Game.myRooms.length;
						}
					}

					if ((Memory.rooms[roomName].exitCampedB || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if ((Memory.rooms[roomName].exitCampedT || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if ((Memory.rooms[roomName].exitCampedL || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if ((Memory.rooms[roomName].exitCampedR || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if (Memory.debugHarvestValues) {
						console.log("d", roomName, value)
					}

					// Or if they're reserved
					if (Memory.rooms[roomName].reservedBy && Memory.rooms[testRoomName].reservedBy != "Invader" && Memory.rooms[roomName].reservedBy != util.getMyName()) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if (Memory.debugHarvestValues) {
						console.log("e", roomName, value)
					}

					// If we're tried to harvest and got a bad yield from it it's probably hard to move through too.
					if (Memory.rooms[roomName].sP && roomIntel.getEffectiveNumSources(roomName) > 0 && !claimScan) {
						let keeperRoom = false;
						let centreRoom = false;
						let normalRoom = true;
						var sectorCoords = util.getSectorCoords(roomName);
						if (sectorCoords.x >= 4 && sectorCoords.x <= 6 && sectorCoords.y >= 4 && sectorCoords.y <= 6) {
							if (sectorCoords.x == 5 && sectorCoords.y == 5) {
								centreRoom = true;
								normalRoom = false;
							}
							else {
								keeperRoom = true;
								normalRoom = false;
							}
						}

				 		let baseSourceYield;
				 		let sourceYield;
				 		// Not enough WORK, no container
				 		if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 1) {
				 			baseSourceYield = 4;
				 			sourceYield = baseSourceYield - 1;
				 		}
				 		// No reservation, no container
				 		else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2 && !keeperRoom && !centreRoom) {
				 			// 4 work max.
				 			baseSourceYield = Math.min(SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 8);
				 			sourceYield = baseSourceYield - 1;
				 		}
				 		// Reservation, no container
				 		else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 3 && !keeperRoom && !centreRoom) {
				 			baseSourceYield = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
				 			sourceYield = baseSourceYield - 1;
				 		}
				 		else if (keeperRoom || centreRoom) {
				 			if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2) {
				 				baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 8);
				 				sourceYield = baseSourceYield - 1;
				 			}
				 			else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 3) {
				 				baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 12);
				 				sourceYield = baseSourceYield - 1;
				 			}
				 			else {
				 				baseSourceYield = SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME;
				 				sourceYield = baseSourceYield - 0.5;
				 			}
				 		}
				 		else {
				 			baseSourceYield = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
				 			sourceYield = baseSourceYield - 0.5;
				 		}

						let harvestYield = Memory.rooms[roomName].meanHarvestYeild === undefined ? (roomIntel.getEffectiveNumSources(roomName) * baseSourceYield) : Memory.rooms[roomName].meanHarvestYeild;
						value *= harvestYield / (roomIntel.getEffectiveNumSources(roomName) * baseSourceYield);

						if (value < 0) {
							result.v = Math.round(value * 1000) / 1000
							result.u = Math.round(totalUtil)
							result.c = Math.round(totalCPU * 1000) / 1000

							if (!claimScan && !idealized) {
								Memory.remoteHarvestingValues[parentRoomName][testRoomName] = result;
							}

							return result;
						}
					}
					if (Memory.debugHarvestValues) {
						console.log("f", roomName, value)
					}

					// Find the adjacent rooms and do the above but much less severe.
					var exits = Game.map.describeExits(roomName);
					for (var exitID in exits) {
						var exitRoom = exits[exitID];
						Memory.rooms[exitRoom] = Memory.rooms[exitRoom] || {}

						let dt = Memory.rooms[exitRoom].DT || 1

						if (dt > 1) {
							value *= (0.8 + Object.keys(exits).length * 0.04) + (0.2 - Object.keys(exits).length * 0.04) * (1 - 0.5 * dt);
						}
						else {
							value *= (0.8 + Object.keys(exits).length * 0.04) + (0.2 - Object.keys(exits).length * 0.04) * (1 - 0.1 * dt);	
						}


						if (Memory.rooms[exitRoom].reservedBy && Memory.rooms[exitRoom].reservedBy != "Invader" && Memory.rooms[exitRoom].reservedBy != util.getMyName()) {
							value *= 0.9;
						}

						// Avoid harvesting rooms with exits directly on to enemy
						if (Memory.rooms[exitRoom].owner && (Memory.rooms[exitRoom].spwnX && Memory.rooms[exitRoom].spwnX.length) && Memory.rooms[exitRoom].owner != "Invader" && Memory.rooms[exitRoom].owner != util.getMyName()) {
							if (claimScan) {
								value *= 0.5;
							}
							// This is kinda dealt with by danger/exit camp/reserve/harvestYield accounting for defenders
							// else if (parentRoom) {
							// 	value *= Math.min(0.5, 0.5 - (0.05 * (Memory.rooms[exitRoom].rcl - parentRoom.effectiveLevel)));
							// }
						}
					}
					if (Memory.debugHarvestValues) {
						console.log("g", roomName, value)
					}

				}
			}

			result.v = Math.round(value * 1000) / 1000
			result.u = Math.round(totalUtil)
			result.c = Math.round(totalCPU * 1000) / 1000

			if (sourceSourceDist) {
				result.ss = sourceSourceDist
			}

			if (!claimScan && !idealized && !loot) {
				Memory.remoteHarvestingValues[parentRoomName][testRoomName] = result;
			}
			
			// if (Memory.debugRemotePicking) {				
				result.cf = Math.round(haulerCPUCost * 1000) / 1000
				result.ch = Math.round(harvesterCPUCost * 1000) / 1000
				result.cz = Math.round(reserverCPUCost * 1000) / 1000
				result.cg = Math.round(guardCPU * 1000) / 1000
				result.cr = Math.round(roadUpkeepCPU * 1000) / 1000
			// }

			return result;
		}
	},

	getRemoteSKMineralValue: function(parentRoomName, testRoomName, idealized, refreshPercentage, claimScan) {
		if (!Memory.rooms[testRoomName].mineralAmount || !roomIntel.getMineralX(testRoomName)) {
			if (Memory.remoteSKMineralValues && Memory.remoteSKMineralValues[parentRoomName] && Memory.remoteSKMineralValues[parentRoomName][testRoomName]) {
				delete Memory.remoteSKMineralValues[parentRoomName][testRoomName];
			}
			return {"v": -1, "u": 0};
		}

		if (Memory.season2) {
			if (testRoomName == "W17N6" || testRoomName == "W18N5" || testRoomName == "W16N6") {
				return {"v": -1, "u": 0, "c": 0};
			}
			// Kasami is a pain
			if (testRoomName == "W24S14" || 
				testRoomName == "W24S15" || 
				testRoomName == "W24S16" ||
				testRoomName == "W25S14" || 
				testRoomName == "W25S15" || 
				testRoomName == "W25S16" ||
				testRoomName == "W26S14" || 
				testRoomName == "W26S15" || 
				testRoomName == "W26S16") {
				return {"v": -1, "u": 0, "c": 0};
			}
			let roomCoords = util.getRoomCoords(testRoomName)

			if (roomCoords.x >= 11 && roomCoords.y <= 21 &&
				roomCoords.y >= 11 && roomCoords.y <= 21) {
				return {"v": -1, "u": 0, "c": 0};			
			}

		}
		// Hard stop for Xolym
		if (Memory.season4) {
			let roomCoords = util.getRoomCoords(testRoomName)
			if (roomCoords.y >= 16) {
				return {"v": -1, "u": 0, "c": 0};
			}
		}
		if (Memory.season5) {
			let sectorCoords = util.getSectorCoords(testRoomName)

			if (sectorCoords.x == 5 && sectorCoords.y == 5) {
				console.log("DISABLING CENTRE ROOM MINING AS IT SEEMS TO HARVEST WITH BUILDERS! FIX")
				return {"v": -1, "u": 0, "c": 0};	
			}
		}

		if (!claimScan) {
			Memory.remoteSKMineralValues = Memory.remoteSKMineralValues || {};
			Memory.remoteSKMineralValues[parentRoomName] = Memory.remoteSKMineralValues[parentRoomName] || {}
			Memory.remoteSKMineralValues[parentRoomName][testRoomName] = Memory.remoteSKMineralValues[parentRoomName][testRoomName] || {}
		}

		if (!claimScan &&
			Memory.remoteSKMineralValues[parentRoomName][testRoomName] &&
			Memory.remoteSKMineralValues[parentRoomName][testRoomName].v !== undefined &&
			(Math.random() > refreshPercentage || Game.cpu.getUsed() > 375)) {
			return Memory.remoteSKMineralValues[parentRoomName][testRoomName];
		}
		else {
			let path;
			let pathLength;

			let mX = roomIntel.getMineralX(testRoomName)
			let mY = roomIntel.getMineralY(testRoomName)

			if (Memory.rooms[parentRoomName].spawnBatteryCentreX) {

				path = pathCache.getPathAnalyseRooms(new RoomPosition(Memory.rooms[parentRoomName].spawnBatteryCentreX, Memory.rooms[parentRoomName].spawnBatteryCentreY, parentRoomName),
												     new RoomPosition(mX, mY, testRoomName),
													 1, 5, false, true, {"avoidEnemyRooms": 1, "saveRoomNames": 1});

				pathLength = path.path.length;
				if (path.incomplete) {
					if (path.path.length > 0) {
						if (path.r[path.r.length-1] != testRoomName) {
							pathLength += 100;
						}
					}
					else {
						pathLength += 250;
					}
				}
			}
			else {
				path = pathCache.getPathAnalyseRooms(new RoomPosition(mX, mY, testRoomName),
												   new RoomPosition(25, 25, parentRoomName),
												   20, 5, false, true, {"avoidEnemyRooms": 1, "saveRoomNames": 1});
				// if (!controllerPath.incomplete) {
					pathLength = path.path.length + 20;
				// }
				// else {
					// Well shit
					// controllerPathLength = 500;
				// }
			}

			var parentRoom = Game.rooms[parentRoomName];

			// Isn't meaningful
			let value = 1000;

			if (Game.market.credits === 0) {
				value *= 2;
			}


			let mineralType = roomIntel.getMineralType(testRoomName);

			if (Memory.stats.globalResources && Memory.stats.globalResources[mineralType] == 0) {
				value *= 2;
			}

			// if (mineralType == RESOURCE_OXYGEN ||
			// 	mineralType == RESOURCE_CATALYST) {
			// 	value *= 1.3
			// }
			// else if (mineralType == RESOURCE_HYDROGEN ||
			// 		 mineralType == RESOURCE_LEMERGIUM) {
			// 	value *= 1.2
			// }
			// else {
			// 	value *= 1.1
			// }

			let rawResources = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
			// console.log("g", Game.cpu.getUsed())

			if (Memory.empireStrength < 10 || Game.market.credits == 0) {				
				let minResourceAmount = Infinity;
				let minResource;
				for (let resource of rawResources) {
					let resourceAmount = 0;
					for (let loopRoom of Game.myRooms) {
						resourceAmount += loopRoom.getCurrentOfResource(resource)
					}

					if (resourceAmount < minResourceAmount) {
						minResourceAmount = resourceAmount;
						minResource = resource;
					}
				}

				if (mineralType == minResource) {
					value *= 2 * (Game.market.credits == 0 ? 2 : 1)
				}
				if (Memory.season2 && mineralType == "X") {
					value *= 2
				}
				if (Memory.season4 && mineralType == "O") {
					value *= 2
				}
				if (Memory.season5 && mineralType == "O" && Game.gcl.level <= 5) {
					value *= 2
				}

				// Season 4 is all about these minerals
				if (Memory.season4) {
					value *= 2
				}

				// if (Memory.season4 && (mineralType == "L" || mineralType == "" || mineralType == "U" || mineralType == "K")) {
				// 	value *= 2
				// }
			}


			let result = {}

			// Now, some danger contributions. Want to factor in distance, proximity to enemies and our danger tracking.
			// I'm not sure if I want idealized == true at any point.
			if (!idealized) {
				// If we're not using them they'll track back toward being viable over time, but if we're trying to use them
				// and doing poorly then just stop.
				let baseSourceYield;
				let sourceYield;
				// Not enough WORK, no container
				if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 1) {
					baseSourceYield = 4;
					sourceYield = baseSourceYield - 1;
				}
				else {
					if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2) {
						baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 8);
						sourceYield = baseSourceYield - 1;
					}
					else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 3) {
						baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 12);
						sourceYield = baseSourceYield - 1;
					}
					else {
						baseSourceYield = SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME;
						sourceYield = baseSourceYield - 0.5;
					}
				}

				let harvestYield = Memory.rooms[testRoomName].meanHarvestYeild === undefined ? (roomIntel.getEffectiveNumSources(testRoomName) * baseSourceYield) : Memory.rooms[testRoomName].meanHarvestYeild
				value *= harvestYield / (roomIntel.getEffectiveNumSources(testRoomName) * baseSourceYield);
				if (Memory.debugHarvestValues) {
					console.log(value)
				}

				// Far is bad because bad people can kill us.
				// Drop linearly with distance With this calculation at 100 tiles mean we'll be multiplying by 0.875.
				value *= 1 - (pathLength) / (800 * roomIntel.getEffectiveNumSources(testRoomName))
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// Danger!
				value -= (claimScan ? 0.025 : 0.05) * (Memory.rooms[testRoomName].DT || 1) * value
				if (value < 0) {
					result.v = Math.round(value * 1000) / 1000
					result.u = Math.round(150)
					result.c = Math.round(0.2 * 1000) / 1000

					if (!claimScan && !idealized) {
						Memory.remoteSKMineralValues[parentRoomName][testRoomName] = result;
					}

					return result;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				value *= 1 - (claimScan ? 0.05 : 0.1) * (Memory.rooms[testRoomName].DT || 1);
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// Danger is more important if we have more rooms as we can just get stuff from other rooms.
				if (!claimScan && (Memory.rooms[testRoomName].DT || 1) > 1. && parentRoom && parentRoom.effectiveLevel >= 6 && Memory.terminalNetworkFreeEnergy) {
					value /= 1 + 0.1 * (Memory.rooms[testRoomName].DT - 1) * Game.myRooms.length;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// If somebody else has reserved the target room we don't really want to be there.
				if (Memory.rooms[testRoomName].reservedBy && Memory.rooms[testRoomName].reservedBy != "Invader" && (claimScan || Memory.rooms[testRoomName].reservedBy != util.getMyName())) {
					value *= 0.5;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				// Not claim scanning and it's already ours then consider the sunk cost.
				// This is done at the picking end
				// else if (!claimScan && Memory.rooms[testRoomName].reservedBy && Memory.rooms[testRoomName].reservedBy == util.getMyName()) {
				// 	value *= 1.1;
				// }

				// Maybe a bit harsh?
				if ((Memory.rooms[testRoomName].exitCampedB || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if ((Memory.rooms[testRoomName].exitCampedT || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if ((Memory.rooms[testRoomName].exitCampedL || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if ((Memory.rooms[testRoomName].exitCampedR || 0) > 100) {
					value *= claimScan ? 0.75 : 0.5;
				}
				if (Memory.debugHarvestValues) {
					console.log(value)
				}


				var pathRooms = [];
				// Figure out all the rooms between here and there.
				if (path.r) {					
					for (var pathRoomName of path.r) {
						if (!pathRooms.includes(pathRoomName)) {
							pathRooms.push(pathRoomName)
						}
					}
				}
				else {
					console.log("No room names for SK solo mine path", JSON.stringify(path))
				}

				if (Memory.debugHarvestValues) {
					console.log("Path rooms from", parentRoomName, "to", testRoomName, "are", pathRooms)
					console.log(JSON.stringify(path))
				}


				// If they're dangerous penalize.
				for (var roomName of pathRooms) {
					// console.log(roomName)
					if (roomName == parentRoomName) continue
					// if (roomName == testRoomName || roomName == parentRoomName) continue
					Memory.rooms[roomName] = Memory.rooms[roomName] || {}

					if ((Memory.rooms[roomName].restrictHarvestingUntil || 0) > Game.time) {
						if (claimScan) {
							value *= 0.95
						}
						else {
							value = 0;
							break;
						}
					}
					if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
						if (claimScan) {
							if (Memory.rooms[roomName].owner != "Invader") {
								value *= 0.25
							}
						}
						else {
							value = 0;
							break;
						}
					}

					if (Memory.debugHarvestValues) {
						console.log("a", roomName, value)
					}

					if (roomName == testRoomName) continue

					value -= (claimScan ? 0.025 : 0.05) * (Memory.rooms[roomName].DT || 1) * value


					if (value < 0) {
						result.v = Math.round(value * 1000) / 1000
						result.u = Math.round(150)
						result.c = Math.round(0.2 * 1000) / 1000

						if (!claimScan && !idealized) {
							Memory.remoteSKMineralValues[parentRoomName][testRoomName] = result;
						}

						return result;
					}

					if (Memory.debugHarvestValues) {
						console.log("b", roomName, value)
					}

					value *= 1 - (claimScan ? 0.125 : 0.25) * (Memory.rooms[roomName].DT || 1);

					if (Memory.debugHarvestValues) {
						console.log("c", roomName, value)
					}


					// Don't path through very dangerous rooms
					if (!claimScan) {
						value -= 0.05 * (Memory.rooms[roomName].DT || 1) * value;
						if (Memory.rooms[roomName].DT > 1.5) {
							value = 0;
							break;
						}
						else if (Memory.rooms[roomName].DT > 1.25) {
							value /= 4;
						}
						else if (Memory.rooms[roomName].DT > 1.) {
							value /= 2;
						}

						// Danger is more important if we have more rooms as we can just get stuff from other rooms.
						if ((Memory.rooms[roomName].DT || 1) > 1. && parentRoom && parentRoom.effectiveLevel >= 6) {
							value /= 1 + 0.05 * (Memory.rooms[roomName].DT - 1) * Game.myRooms.length;
						}
					}

					if ((Memory.rooms[roomName].exitCampedB || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if ((Memory.rooms[roomName].exitCampedT || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if ((Memory.rooms[roomName].exitCampedL || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if ((Memory.rooms[roomName].exitCampedR || 0) > 100) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if (Memory.debugHarvestValues) {
						console.log("d", roomName, value)
					}

					// Or if they're reserved
					if (Memory.rooms[roomName].reservedBy && Memory.rooms[testRoomName].reservedBy != "Invader" && Memory.rooms[roomName].reservedBy != util.getMyName()) {
						value *= claimScan ? 0.75 : 0.5;
					}
					if (Memory.debugHarvestValues) {
						console.log("e", roomName, value)
					}

					// If we're tried to harvest and got a bad yield from it it's probably hard to move through too.
					if (Memory.rooms[roomName].sP && roomIntel.getEffectiveNumSources(roomName) > 0 && !claimScan) {
						let keeperRoom = false;
						let centreRoom = false;
						let normalRoom = true;
						var sectorCoords = util.getSectorCoords(roomName);
						if (sectorCoords.x >= 4 && sectorCoords.x <= 6 && sectorCoords.y >= 4 && sectorCoords.y <= 6) {
							if (sectorCoords.x == 5 && sectorCoords.y == 5) {
								centreRoom = true;
								normalRoom = false;
							}
							else {
								keeperRoom = true;
								normalRoom = false;
							}
						}

				 		let baseSourceYield;
				 		let sourceYield;
				 		// Not enough WORK, no container
				 		if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 1) {
				 			baseSourceYield = 4;
				 			sourceYield = baseSourceYield - 1;
				 		}
				 		// No reservation, no container
				 		else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2 && !keeperRoom && !centreRoom) {
				 			// 4 work max.
				 			baseSourceYield = Math.min(SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME, 8);
				 			sourceYield = baseSourceYield - 1;
				 		}
				 		// Reservation, no container
				 		else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 3 && !keeperRoom && !centreRoom) {
				 			baseSourceYield = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
				 			sourceYield = baseSourceYield - 1;
				 		}
				 		else if (keeperRoom || centreRoom) {
				 			if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 2) {
				 				baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 8);
				 				sourceYield = baseSourceYield - 1;
				 			}
				 			else if (parentRoom && parentRoom.controller.my && parentRoom.effectiveLevel == 3) {
				 				baseSourceYield = Math.min(SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME, 12);
				 				sourceYield = baseSourceYield - 1;
				 			}
				 			else {
				 				baseSourceYield = SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME;
				 				sourceYield = baseSourceYield - 0.5;
				 			}
				 		}
				 		else {
				 			baseSourceYield = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
				 			sourceYield = baseSourceYield - 0.5;
				 		}

						let harvestYield = Memory.rooms[roomName].meanHarvestYeild === undefined ? (roomIntel.getEffectiveNumSources(roomName) * baseSourceYield) : Memory.rooms[roomName].meanHarvestYeild;
						value *= harvestYield / (roomIntel.getEffectiveNumSources(roomName) * baseSourceYield);
						
						if (value < 0) {
							result.v = Math.round(value * 1000) / 1000
							result.u = Math.round(150)
							result.c = Math.round(0.2 * 1000) / 1000

							if (!claimScan && !idealized) {
								Memory.remoteSKMineralValues[parentRoomName][testRoomName] = result;
							}

							return result;
						}
					}
					if (Memory.debugHarvestValues) {
						console.log("f", roomName, value)
					}

					// Find the adjacent rooms and do the above but much less severe.
					var exits = Game.map.describeExits(roomName);
					for (var exitID in exits) {
						var exitRoom = exits[exitID];
						Memory.rooms[exitRoom] = Memory.rooms[exitRoom] || {}

						let dt = Memory.rooms[exitRoom].DT || 1

						if (dt > 1) {
							value *= (0.8 + Object.keys(exits).length * 0.04) + (0.2 - Object.keys(exits).length * 0.04) * (1 - 0.5 * dt);
						}
						else {
							value *= (0.8 + Object.keys(exits).length * 0.04) + (0.2 - Object.keys(exits).length * 0.04) * (1 - 0.1 * dt);	
						}


						if (Memory.rooms[exitRoom].reservedBy && Memory.rooms[exitRoom].reservedBy != "Invader" && Memory.rooms[exitRoom].reservedBy != util.getMyName()) {
							value *= 0.9;
						}

						// Avoid harvesting rooms with exits directly on to enemy
						if (Memory.rooms[exitRoom].owner && (Memory.rooms[exitRoom].spwnX && Memory.rooms[exitRoom].spwnX.length) && Memory.rooms[exitRoom].owner != "Invader" && Memory.rooms[exitRoom].owner != util.getMyName()) {
							if (claimScan) {
								value *= 0.5;
							}
							// This is kinda dealt with by danger/exit camp/reserve/harvestYield accounting for defenders
							// else if (parentRoom) {
							// 	value *= Math.min(0.5, 0.5 - (0.05 * (Memory.rooms[exitRoom].rcl - parentRoom.effectiveLevel)));
							// }
						}
					}
					if (Memory.debugHarvestValues) {
						console.log("g", roomName, value)
					}
				}
			}

			if (value < 250) {
				value = 0;
			}

			result = {"v": value, "u": 150};

			if (!claimScan) {
				Memory.remoteSKMineralValues[parentRoomName][testRoomName] = result;
			}

			return result;
		}
	},

	// TODO: Profile this on S+2
	updateRoomMemoryStartTick() {
		let start = Game.cpu.getUsed();

		if (!global.roomsWithNukesLandingSet) {
			global.roomsWithNukesLandingSet = new Set();
			for (const roomName in Memory.rooms) {
				if (Memory.rooms[roomName].nukeLandTime) {
					global.roomsWithNukesLandingSet.add(roomName)
				}
			}
		}

		let a = Game.cpu.getUsed();

		for (let roomName of global.roomsWithNukesLandingSet) {
			const mem = Memory.rooms[roomName];
			if (mem && Game.shard.name == "shard2" && mem.rcl && mem.nukeLandTime - Game.time < 1300 && mem.nukeLandTime - Game.time > 300 && !mem.rampHP && !mem.wallHP) {
				//combatManager.requestNukeFollowMission(roomName);
				Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT_NUKE_FOLLOW][roomName] = Game.time;
			}

			if (!Game.rooms[roomName] && mem) {	
				if (Game.map.visual) mapVisuals.get().text("☢", new RoomPosition(43, 43, roomName), {fontSize: 12})


				if (mem.nukeLandTime - Game.time <= 0) {
					mem.seenSinceNuked = 0;
					mem.lastNukeLand = Game.time;
					/*const room = Game.rooms[roomName]
					if (room && room.controller && room.controller.my) {
						mem.triggerRebuild = 1;
						mem.attackScore = (mem.attackScore || 0) + 1e5;
					}*/
					if ((mem.nukeLandTime2 || 0) > 0) {
						mem.nukeLandTime = mem.nukeLandTime2;
						delete mem.nukeLandTime2
					}
					else {
						delete mem.nukeLandTime2;
						delete mem.nukeLandTime;
					}
				}
				else {
					global.anyNukes = 1;
				}
			}
		}

		Memory.stats.profiler["updateRoomMemoryStartTick_nukes"] = (Game.cpu.getUsed() - a)
		a = Game.cpu.getUsed();

		if (global.anySmallHaulers || Game.cpu.bucket > 9000) {
			for (const roomName in Game.rooms) {
				const room = Game.rooms[roomName]
				room.runCarrySwaps();
			}
		}

		Memory.stats.profiler["updateRoomMemoryStartTick_carrySwaps"] = (Game.cpu.getUsed() - a)

		a = Game.cpu.getUsed();


		for (const roomName in Game.rooms) {
			const mem = Memory.rooms[roomName];
			const room = Game.rooms[roomName]
			room.runDangerTracking()

			if (room.dangerous && room.friendlyLosses && mem.attackScore) {
				mem.attackScore += room.friendlyLosses;
			}
			if (mem.kd || room.killCount || room.friendlyLosses) {
				mem.kd = Math.round((alphaKDa * (mem.kd || 0) + (1 - alphaKDa) * ((room.killCount || 0) - (room.friendlyLosses || 0))) * 1000000) / 1000000;
			}
		}
		
		Memory.stats.profiler["updateRoomMemoryStartTick_visRooms"] = (Game.cpu.getUsed() - a)

		a = Game.cpu.getUsed();


		// let start = Game.cpu.getUsed();

		if (Math.random() < 0.05) {
			for (const roomName in Memory.rooms) {
				const mem = Memory.rooms[roomName];
				const room = Game.rooms[roomName]
				if (!room) {
					if (mem.kd) {
						mem.kd = Math.round(mem.kd * alphaKDb * 1000000) / 1000000;
					}
					if (mem.repairPerTick) {
						mem.repairPerTick = alphaRepair * (mem.repairPerTick || 0);
					}
					delete mem.defenseHeatMap;
					delete mem.requestHelpAgainst;
					delete mem.withdrawLocs
					delete mem.deathLocs

					delete mem.hostileCreeps;	
					delete mem.hostileCreepsTick;	

					// Only want them if they're actually annoying, so consistently visible
					if (mem.hostileCampCheck) {
						mem.hostileCampCheck--;
					}
				}

				var alpha;

				// Learn danger quick, forget slowly
				if (room && room.dangerous == 2) {
					alpha = alpha_danger2;
				}
				else if (room && room.dangerous == 0) {
					alpha = alpha_danger2;
				}
				else {
					alpha = alpha_danger1;
				}

				// if (roomName == "E10S20") {
				// 	console.log("a", mem.DT, room, (room ? room.dangerous : 1))
				// }
				mem.DT = Math.round((alpha * (mem.DT === undefined ? 1 : mem.DT) + (1 - alpha) * (room ? room.dangerous : 1)) * 1000000) / 1000000;
				// if (roomName == "E10S20") {
				// 	console.log("b", mem.DT, room, (room ? room.dangerous : 1))
				// }

				if (mem.DT >= 0.9999 && mem.DT <= 1.0001) {
					mem.DT = 1;
				}
				// if (mem.kd >= -0.00001 && mem.kd <= 0.00001) {
				// 	mem.kd = 0;
				// }

				if (mem.exitCampedL) {
					mem.exitCampedL = alpha_camped * (mem.exitCampedL || 0);

					if (mem.exitCampedL < 10) {
						delete mem.exitCampedL;
						delete mem.exitCampedLPos;
					}
				}
				if (mem.exitCampedR) {
					mem.exitCampedR = alpha_camped * (mem.exitCampedR || 0);

					if (mem.exitCampedR < 10) {
						delete mem.exitCampedR;
						delete mem.exitCampedRPos;
					}
				}
				if (mem.exitCampedT) {
					mem.exitCampedT = alpha_camped * (mem.exitCampedT || 0);

					if (mem.exitCampedT < 10) {
						delete mem.exitCampedT;
						delete mem.exitCampedTPos;
					}
				}
				if (mem.exitCampedB) {
					mem.exitCampedB = alpha_camped * (mem.exitCampedB || 0);

					if (mem.exitCampedB < 10) {
						delete mem.exitCampedB;
						delete mem.exitCampedBPos;
					}
				}

				if (mem.iP) {
					mem.iP = Math.round(alpha_pathing * (mem.iP || 0) * 1000000) / 1000000;;

					if (mem.fullyConnected === 0 && room && !room.highway && !room.keeperRoom && !room.centreRoom && !mem.owner && room.find(FIND_STRUCTURES).length > 1) {
						Memory.combatManager.requestedMissions["connectivityDecon"][roomName] = Game.time;
						// combatManager.requestConnectivityDecon(roomName)
					}

					if (mem.iP < 0.5) {
						delete mem.fullyConnected;
						delete mem.iP;
					}
					else if (room && room.find(FIND_STRUCTURES).length == 1) {
						mem.fullyConnected = 1
					}
					else if (Memory.season2 && mem.seasonWallsToRemove !== undefined && mem.seasonWallsToRemove.length == 0 && (util.getSectorCoords(roomName).x != 0 || util.getSectorCoords(roomName).y != 0)) {
						mem.fullyConnected = 1	
					}
					// Ok, the room may be blocked.
					else if (mem.iP > 50 && (Math.random() < 0.01 || mem.fullyConnected === undefined) && room && !room.isMyRoom()) {
						var structures = room.find(FIND_STRUCTURES, {
							filter: (structure) => {
								return structure.structureType != STRUCTURE_ROAD && 
									structure.structureType != STRUCTURE_CONTAINER && 
									(!structure.my || structure.structureType != STRUCTURE_RAMPART);
							}
						});

						function floodFill(_floodArray, i, j, value) {
							if (_floodArray[i][j] == 1) {
								_floodArray[i][j] = value
								if (i - 1 >= 0)  floodFill(_floodArray, i-1, j, value);
								if (i + 1 <= 49) floodFill(_floodArray, i+1, j, value);
								if (j - 1 >= 0)  floodFill(_floodArray, i, j-1, value);
								if (j + 1 <= 49) floodFill(_floodArray, i, j+1, value);

								if (i - 1 >= 0 && j - 1 >= 0)  floodFill(_floodArray, i-1, j-1, value);
								if (i + 1 <= 49 && j - 1 >= 0) floodFill(_floodArray, i+1, j-1, value);
								if (i - 1 >= 0 && j + 1 <= 49)  floodFill(_floodArray, i-1, j+1, value);
								if (i + 1 <= 49 && j + 1 <= 49) floodFill(_floodArray, i+1, j+1, value);
							}
						}

						let terrainMap = Game.map.getRoomTerrain(roomName)

						var floodArray = [];
						for (var i = 0; i < 50; i++) {
							floodArray[i] = [];
							for (var j = 0; j < 50; j++) {
								floodArray[i][j] = (terrainMap.get(i,j) & TERRAIN_MASK_WALL) ? 0 : 1;
							}
						}

						for (var structure of structures) {
							floodArray[structure.pos.x][structure.pos.y] = 0;
						}

						// Flood from the first exit
						for (let i = 1; i < 49; i++) {
							if (floodArray[0][i] == 1) {
								floodFill(floodArray, 0, i, 2);
								break;
							}
							else if (floodArray[49][i] == 1) {
								floodFill(floodArray, 49, i, 2);
								break;
							}
							else if (floodArray[i][0] == 1) {
								floodFill(floodArray, i, 0, 2);
								break;
							}
							else if (floodArray[i][49] == 1) {
								floodFill(floodArray, i, 49, 2);
								break;
							}
						}

						mem.fullyConnected = 1;
						for (let i = 1; i < 49; i++) {
							if (floodArray[0][i] == 1) {
								mem.fullyConnected = 0;
								break;
							}
							else if (floodArray[49][i] == 1) {
								mem.fullyConnected = 0;
								break;
							}
							else if (floodArray[i][0] == 1) {
								mem.fullyConnected = 0;
								break;
							}
							else if (floodArray[i][49] == 1) {
								mem.fullyConnected = 0;
								break;
							}
						}
					}
				}

				// mem.cS = mem.cS || (constants.ROOM_COMBAT_STRATEGY_DEFAULT + constants.REMOTE_DEFENSE_BUILD_STRATEGY_DEFAULT * 100);

				if (mem.kd && Math.abs(mem.kd) < 1e-4) {
					delete mem.kd;
				}
				// It's not going well. Change strategy and reset K:D tracking.
				else if ((mem.kd || 0) < -1) {
					mem.kd = (mem.kd || 0) / 2;

					let oldStrategy = mem.cS || constants.COMBAT_STRATEGY_DEFAULT;

					do {
						mem.cS = _.sample(constants.ROOM_COMBAT_STRATEGIES) + _.sample(constants.REMOTE_DEFENSE_BUILD_STRATEGIES) * 100;
					}
					while (mem.cS == oldStrategy)

					console.log("Bad K:D. Changing strategy for", roomName, "Old:", oldStrategy, "New:", mem.cS)
				}


				if (mem.borderInfos) {
					// let visual;
					// if (Memory.visuals) {
					// 	visual = new RoomVisual(roomName);
					// }
					let keyCount = 0;
					for (let borderIdx in _.clone(mem.borderInfos)) {
						let borderInfo = mem.borderInfos[borderIdx];

						borderInfo.avgEnergyCost = alphaBorderEnergy * borderInfo.avgEnergyCost;
						borderInfo.creepsSeen = alphaBorderEnergy * borderInfo.creepsSeen;
						borderInfo.maxdps = alphaDamage * borderInfo.maxdps;
						// For alpha = exp(-0.001) a 2500 energy creep travelling through once
						// will expire after ~511 ticks.
						// We also want to track annoying tiny creeps as well.
						if ((Game.time - borderInfo.lastTick > 1000 && borderInfo.avgEnergyCost < 1) || (Game.time - borderInfo.lastTick > 1500)) {
							delete mem.borderInfos[borderIdx];
						}
						else {
							keyCount++;
							// if (Memory.visuals) {
							// 	visual.text(Math.round(borderInfo.avgEnergyCost), Math.floor(borderIdx / 50), borderIdx % 50 - 0.1, {color: 'red', font: 0.35});
							// 	visual.text((Game.time - borderInfo.lastTick), Math.floor(borderIdx / 50), borderIdx % 50 + 0.2, {color: 'red', font: 0.35});
							// 	visual.text(Math.round(borderInfo.creepsSeen * 10) / 10 + "/" + Math.round(borderInfo.maxdps), Math.floor(borderIdx / 50), borderIdx % 50 + 0.5, {color: 'red', font: 0.35});
							// }
						}
					}
					if (keyCount == 0) {
						delete mem.borderInfos;
					}
				}

				if (mem.numAttemptedClaims) {
					mem.numAttemptedClaims = Math.round(alphaClaim * mem.numAttemptedClaims * 100000000) / 100000000;
				}
			}
		}

		Memory.stats.profiler["updateRoomMemoryStartTick_memRooms"] = (Game.cpu.getUsed() - a)

		Memory.stats.profiler["updateRoomMemoryStartTick"] = (Game.cpu.getUsed() - start)
	},

	updateRoomMemoryEndTick() {
		if (Game.cpu.getUsed() > 400) return

		// Learn quickly when active, recover slowly when not

		// Once every 10 ticks
		const alphaLive = Math.exp(-(1/300.));
		const alphaRecover = Math.exp(-(1/3000.));
		// const ticksToRecover = 30000;

		Memory.usedRemotes = Memory.usedRemotes || {};

		if (Math.random() < 0.1) {
			for (var roomName in Memory.rooms) {
				let mem = Memory.rooms[roomName]
				if (Memory.usedRemotes.includes(roomName)) {
					// Lazy
					let numSources = roomIntel.getEffectiveNumSources(roomName);
					let yieldPerSource = (numSources == 3 ? (4000 / 300.) : 10);


					// Start by assuming full yield. Otherwise we'll be fairly inflexible.
					if (mem.meanHarvestYeild === undefined) {
						mem.meanHarvestYeild = numSources * yieldPerSource
					}

					// For the first 400 ticks since it's added, don't track stats
					if ((Game.rooms[roomName] && Game.rooms[roomName].harvestedThisTick >= mem.meanHarvestYeild) || Game.time - (Memory.lastRemoteRefresh || 0) > (Game.rooms[roomName] && Game.rooms[roomName].keeperRoom ? 800 : 400) || !Memory.lastAddedRemotes.includes(roomName)) {						
						let harvested = (Game.rooms[roomName] ? Game.rooms[roomName].harvestedThisTick : 0) || 0;
						mem.meanHarvestYeild = alphaLive * mem.meanHarvestYeild + (1 - alphaLive) * harvested;
						mem.meanHarvestYeild = Math.round(mem.meanHarvestYeild * 1000000) / 1000000

						// Memory.
						if (Game.shard.name != "shard2") mem.hSnceLstInv = (mem.hSnceLstInv || 0) + (harvested || 0) * 10
					}
					/*else {
						// It's a new remote. Ignore ticks where we haven't harvested
						if (Game.rooms[roomName] && Game.rooms[roomName].harvestedThisTick) {
							mem.meanHarvestYeild = alphaLive * mem.meanHarvestYeild + (1 - alphaLive) * Game.rooms[roomName].harvestedThisTick;
							mem.meanHarvestYeild = Math.round(mem.meanHarvestYeild * 1000000) / 1000000
						}
					}*/
				}
				else if (mem.sP && mem.meanHarvestYeild !== undefined && roomIntel.getNumSources(roomName) ) {
					// Revert to mean
					// Lazy
					let numSources = roomIntel.getEffectiveNumSources(roomName);
					let yieldPerSource = (numSources == 3 ? (4000 / 300.) : 10);


					// mem.meanHarvestYeild += (10 / ticksToRecover) * numSources * yieldPerSource;
					mem.meanHarvestYeild = alphaRecover * mem.meanHarvestYeild + (1 - alphaRecover) * numSources * yieldPerSource;

					if (mem.meanHarvestYeild > numSources * yieldPerSource * 0.99999) {
						mem.meanHarvestYeild = numSources * yieldPerSource;
					}
					else {
						mem.meanHarvestYeild = Math.round(mem.meanHarvestYeild * 1000000) / 1000000
					}
				}
			}
		}

		// Cleanup. 1/200
		if (Math.random() < 0.005 || global.stringifyError) {
			let names = Object.keys(Memory.rooms)
			for (let roomName of names) {
				let coords = util.getSectorCoords(roomName);
				let highway = (coords.x == 0 || coords.y == 0);
				let timeout
				if (highway) {
					// Remember portal rooms
					if (coords.x == 0 && coords.y == 0) {
						timeout = 20000;
					}
					else {
						timeout = 5000;
						// Nothing really to remember.
						if (Math.abs(Memory.rooms[roomName].DT - 1) < 0.05 && !Memory.season2) {
							timeout /= 5;
						}
					}
				}
				else {
					if (Memory.rooms[roomName].owner) {
						timeout = 50000
					}
					else if (Memory.rooms[roomName].reservedBy) {
						timeout = 20000
					}
					else {
						timeout = 10000
					}
				}

				if (Memory.botArena) {
					timeout *= 10;
				}
				if (Memory.rooms[roomName].numAttemptedClaims) {
					timeout *= 1 + Memory.rooms[roomName].numAttemptedClaims
				}

				if (global.stringifyError) {
					timeout *= 1 - 0.001 * (global.stringifyError - 1)
				}

				if ((!Memory.rooms[roomName].lo || Game.time - Memory.rooms[roomName].lo > timeout) && !Memory.rooms[roomName].clearRoomClaim && (!Memory.rooms[roomName].owner || Memory.rooms[roomName].owner != util.getMyName())) {
					delete Memory.rooms[roomName];
					// These all require a portal destination
					_.pull(Memory.knownPortalRoomNames, roomName);
					_.pull(Memory.knownIntershardPortalRoomNames, roomName);
				}
				// Memory saving.
				// if (!Memory.rooms[roomName].lo || Game.time - Memory.rooms[roomName].lo > 100) {
					// Memory.rooms[roomName].DT = Math.round(Memory.rooms[roomName].DT * 100) / 100;
					// if (Memory.rooms[roomName].kd) {
					// 	Memory.rooms[roomName].kd = Math.round(Memory.rooms[roomName].kd * 10000) / 10000;
					// }
				// }



				if (Memory.rooms[roomName]) {
					delete Memory.rooms[roomName].requestHelpAgainst;
					delete Memory.rooms[roomName].controllerUnreachable;

					this.cleanUpHarassTracking(roomName);

					if (global.stringifyError) {
						// Not assaulting it, clear up. Ideally we'd keep this, but low on memory, so dump it
						if (!global.roomAssaultCounts[roomName] || !global.roomAssaultCounts[roomName].activeFormations) {
							delete Memory.rooms[roomName].formationBravery
							delete Memory.rooms[roomName].roomIsCreepDefending
							delete Memory.rooms[roomName].roomIsDefending
							delete Memory.rooms[roomName].repairPerTick
							delete Memory.rooms[roomName].defenseBoostCost
							delete Memory.rooms[roomName].towerShoots
							delete Memory.rooms[roomName].towerShootsAttack
							delete Memory.rooms[roomName].towerShootsAtHealers
							delete Memory.rooms[roomName].towerShootsAtClosest
							delete Memory.rooms[roomName].towerShootsAtFirst
							delete Memory.rooms[roomName].towerShootsAtStrongholdMax
							delete Memory.rooms[roomName].towerShootsWithFocus
							delete Memory.rooms[roomName].towerShootsAtLastTarget
							delete Memory.rooms[roomName].towerShootsWhenCouldHeal
							delete Memory.rooms[roomName].termEnergyInPerTick
							delete Memory.rooms[roomName].towerEnergyThreshold
							delete Memory.rooms[roomName].towerLastShot
							delete Memory.rooms[roomName].attackCreepsClose
							delete Memory.rooms[roomName].rangedCreepsClose
							delete Memory.rooms[roomName].rangedOnUnowned
							delete Memory.rooms[roomName].towerShootsAtMax
							delete Memory.rooms[roomName].hostilesPushTest
							delete Memory.rooms[roomName].percentLocalDefense
							delete Memory.rooms[roomName].withdrawTick
							delete Memory.rooms[roomName].meanActiveTowers
						}

						if (Memory.rooms[roomName].owner != util.getMyName()) {
							delete Memory.rooms[roomName].priorityBuilds
							delete Memory.rooms[roomName].priorityBuildsTicks
							delete Memory.rooms[roomName].postBuildExtraMemory
							delete Memory.rooms[roomName].overrideName
							delete Memory.rooms[roomName].overrideBody
							delete Memory.rooms[roomName].spawnUtilization
							delete Memory.rooms[roomName].supressFetchers
						}
					}

					if (Memory.rooms[roomName].clearRoomClaim && Game.time - Memory.rooms[roomName].clearRoomClaim > 10 * CREEP_CLAIM_LIFE_TIME) {
						delete Memory.rooms[roomName].clearRoomClaim;
					}

					if (Memory.rooms[roomName].numAttemptedClaims < 1e-3) {
						delete Memory.rooms[roomName].numAttemptedClaims
					}

					if (!Memory.rooms[roomName].owner || Memory.rooms[roomName].owner != util.getMyName()) {
						// Dunno how this sneaks in
						delete Memory.rooms[roomName].ownedCreeps
					}
					
					// 1 in 2000
					if (Math.random() < 0.1) {
						if (!missionInfo.hasActiveMissionsToRoom(roomName)) {
							delete Memory.rooms[roomName].navigableByMask
							delete Memory.rooms[roomName].navigationByMask
						}
						delete Memory.rooms[roomName].blockedEntrances
					}
					// 1 in 100,000
					if (Math.random() < 0.002) {
						delete Memory.rooms[roomName].noobieZone
					}
					// if (Memory.swc && Memory.rooms[roomName] && global.whiteList.indexOf(Memory.rooms[roomName].owner) != -1) {
					// 	delete Memory.rooms[roomName].floodFill
					// }

					// Called 1/200. 
					if (!global.stringifyError || Math.random() < 0.005) {						
						const alphaBoostDecay = Math.exp(-(1/1000.));

						if (Memory.rooms[roomName].failedAtBoostLevel) {
							Memory.rooms[roomName].failedAtBoostLevel = Math.round(Memory.rooms[roomName].failedAtBoostLevel * alphaBoostDecay * 1e6) / 1e6
						}
						if (Memory.rooms[roomName].fizzledAtBoostLevel) {
							Memory.rooms[roomName].fizzledAtBoostLevel = Math.round(Memory.rooms[roomName].fizzledAtBoostLevel * alphaBoostDecay * 1e6) / 1e6
						}
					}

					roomIntel.compressEnemyRoomMap(roomName);
				}
			}
		}

		// Remove stuff that shouldn't exist and decay some stuff
		if (Math.random() < 0.0001) {
			for (let roomName of _.clone(Memory.enemyRooms)) {
				if (Memory.rooms[roomName] && (!Memory.rooms[roomName].owner || Memory.rooms[roomName].owner == util.getMyName())) {
					// Not quite sure how this happens
					delete Memory.rooms[roomName].nxtOPoll;
					delete Memory.rooms[roomName].twrX;
					delete Memory.rooms[roomName].hostileCreepOwners;
					_.pull(Memory.enemyRooms, roomName)
					if (global.enemyRoomSet) {
						global.enemyRoomSet.delete(roomName)
					}
				}
				else if (Memory.rooms[roomName]) {
					if (Memory.rooms[roomName].numAttacksFailed) {
						Memory.rooms[roomName].numAttacksFailed *= 0.99
					}
					if (Memory.rooms[roomName].numAttacksFizzled) {
						Memory.rooms[roomName].numAttacksFizzled *= 0.99
					}
				}
			}
		}
	},

	updateRoomMemoryEndTickSeason1() {
		if (Math.random() < 0.01) {
			for (var roomName of _.clone(Memory.scoreContainerRooms)) {
				let mem = Memory.rooms[roomName]

				if (!mem) {
					_.pull(Memory.scoreContainerRooms, roomName)
					continue
				}

				if (mem.scoreContainers) {
					for (let scoreContainer of _.clone(mem.scoreContainers)) {
						if (scoreContainer.decayTick < Game.time) {
							_.pull(mem.scoreContainers, scoreContainer)
						}
					}

					if (mem.scoreContainers.length == 0) {
						delete mem.scoreContainers
						_.pull(Memory.scoreContainerRooms, roomName)
					}
				}
				else {
					_.pull(Memory.scoreContainerRooms, roomName)
				}
			}
		}
	},

	updateRoomMemoryEndTickSeason2() {
		if (Math.random() < 0.01 && Memory.scoreContainerRooms) {
			for (var roomName of _.clone(Memory.scoreContainerRooms)) {
				let mem = Memory.rooms[roomName]

				if (!mem) {
					_.pull(Memory.scoreContainerRooms, roomName)
					continue
				}

				if (mem.scoreContainers) {
					for (let scoreContainer of _.clone(mem.scoreContainers)) {
						if (scoreContainer.decayTick < Game.time) {
							_.pull(mem.scoreContainers, scoreContainer)
						}
					}

					if (mem.scoreContainers.length == 0) {
						delete mem.scoreContainers
						_.pull(Memory.scoreContainerRooms, roomName)
					}
				}
				else {
					_.pull(Memory.scoreContainerRooms, roomName)
				}
			}
		}
	}
};

module.exports = roomAI; 