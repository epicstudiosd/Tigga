"use strict";

var util = require('util');
var roomAI = require('roomAI');
var combatManager = require('combatManager');
var roomIntel = require('roomIntel');
var intelAI = require('intelAI');
var scouting = require('scouting');
require('prototype.Room.structures');
const constants = require('constants');
const safeRoute = require('safeRoute');

const marketTrader = require('marketTrader');
const creepCreator = require('creepCreator');
const interShardMemoryManager = require('interShardMemoryManager');

const roomCombat = require("roomCombat")
const roomCombatAnalysis = require("roomCombatAnalysis")

// Only when spawns are idle
const alphaExtensions = Math.exp(-(1 / 1000))

const alphaIntercept = Math.exp(-(1/4.));
const alpha_camp = Math.exp(-(1/1000.));



module.exports = function() {
	Room.prototype.initForTick = function() {
		var roomPos = util.getSectorCoords(this.name);
		this.keeperRoom = (roomPos.x >= 4 && roomPos.x <= 6 && roomPos.y >= 4 && roomPos.y <= 6 && !(roomPos.x == 5 && roomPos.y == 5))
		this.centreRoom = (roomPos.x == 5 && roomPos.y == 5)
		this.highway = (roomPos.x == 0 || roomPos.y == 0);
		this.remoteUtilization = 0;
		this.targetRemoteUtilization = 0;
		this.harvestedThisTick = 0;
		// this.resources = {}

		Memory.rooms[this.name] = Memory.rooms[this.name] || {};
		this.mem = Memory.rooms[this.name]

		// This used to be in scouting. Maybe it should go back there.
		if (this.keeperRoom && Memory.rooms[this.name].skNavigable === undefined && Memory.rooms[this.name].skLairsX) {
			Memory.rooms[this.name].skNavigable = roomIntel.isSKRoomNavigable(this.name) ? 1 : 0;
		}
	}

	// This is usually called with just my rooms but rarely does all rooms
	Room.prototype.initForTick_stage1 = function() {


		/*if (((Math.random() < 0.01 && !this.mem.noobieZone) || (Math.random() < 0.001 && this.mem.noobieZone)) && !Memory.botArena) {
			// If we can see it we're either observing or it's a noobie room
			delete this.mem.noobieZone
			let walls = this.constructedWalls;

			if (walls.length > 0) {
				let noobieZoneL = false;
				let noobieZoneR = false;
				let noobieZoneT = false;
				let noobieZoneB = false;

				let noobieZoneHighway = false;
				for (var wall of walls) {
					if (!wall.hits) {
						if (wall.pos.x == 0) {
							noobieZoneL = true;
						}
						else if (wall.pos.y == 0) {
							noobieZoneT = true;
						}
						else if (wall.pos.x == 49) {
							noobieZoneR = true;
						}
						else if (wall.pos.y == 49) {
							noobieZoneB = true;
						}
						else {
							noobieZoneHighway = true;
						}
					}
				}

				if (noobieZoneHighway) {
					let exits = Game.map.describeExits(this.name);
					if (roomPos.x == 0 && roomPos.y != 0) {
						if (Game.rooms[exits[LEFT]] && Game.rooms[exits[LEFT]].find(FIND_MY_CREEPS).length) {
							Memory.rooms[exits[RIGHT]] = Memory.rooms[exits[RIGHT]] || {};
							Memory.rooms[exits[RIGHT]].noobieZone = 1;
						}
						else if (Game.rooms[exits[RIGHT]] && Game.rooms[exits[RIGHT]].find(FIND_MY_CREEPS).length) {
							Memory.rooms[exits[LEFT]] = Memory.rooms[exits[LEFT]] || {};
							Memory.rooms[exits[LEFT]].noobieZone = 1;
						}
						let creep = this.find(FIND_MY_CREEPS)[0];
						if (creep) {
							let wallL = false;
							let wallR = false;
							for (let i = 1; i < creep.pos.x && !wallL; i++) {
								let structs = this.lookForAt(LOOK_STRUCTURES, i, creep.pos.y)
								for (let struct of structs) {
									if (struct.structureType == STRUCTURE_WALL) {
										wallL = 1;
										break;
									}
								}
							}
							for (let i = creep.pos.x + 1; i < 50 && !wallR; i++) {
								let structs = this.lookForAt(LOOK_STRUCTURES, i, creep.pos.y)
								for (let struct of structs) {
									if (struct.structureType == STRUCTURE_WALL) {
										wallR = 1;
										break;
									}
								}
							}

							if (wallL) {
								Memory.rooms[exits[LEFT]] = Memory.rooms[exits[LEFT]] || {};
								Memory.rooms[exits[LEFT]].noobieZone = 1;
							}
							if (wallR) {
								Memory.rooms[exits[RIGHT]] = Memory.rooms[exits[RIGHT]] || {};
								Memory.rooms[exits[RIGHT]].noobieZone = 1;
							}
						}


					}
					else if (roomPos.y == 0 && roomPos.x != 0) {
						if (Game.rooms[exits[TOP]] && Game.rooms[exits[TOP]].find(FIND_MY_CREEPS).length) {
							Memory.rooms[exits[BOTTOM]] = Memory.rooms[exits[BOTTOM]] || {};
							Memory.rooms[exits[BOTTOM]].noobieZone = 1;
						}
						else if (Game.rooms[exits[BOTTOM]] && Game.rooms[exits[BOTTOM]].find(FIND_MY_CREEPS).length) {
							Memory.rooms[exits[TOP]] = Memory.rooms[exits[TOP]] || {};
							Memory.rooms[exits[TOP]].noobieZone = 1;
						}

						let creep = this.find(FIND_MY_CREEPS)[0];
						if (creep) {
							let wallB = false;
							let wallT = false;
							for (let i = 1; i < creep.pos.y && !wallB; i++) {
								let structs = this.lookForAt(LOOK_STRUCTURES, creep.pos.x, i)
								for (let struct of structs) {
									if (struct.structureType == STRUCTURE_WALL) {
										wallB = 1;
										break;
									}
								}
							}
							for (let i = creep.pos.y + 1; i < 50 && !wallT; i++) {
								let structs = this.lookForAt(LOOK_STRUCTURES, creep.pos.x, i)
								for (let struct of structs) {
									if (struct.structureType == STRUCTURE_WALL) {
										wallT = 1;
										break;
									}
								}
							}

							if (wallB) {
								Memory.rooms[exits[BOTTOM]] = Memory.rooms[exits[BOTTOM]] || {};
								Memory.rooms[exits[BOTTOM]].noobieZone = 1;
							}
							if (wallT) {
								Memory.rooms[exits[TOP]] = Memory.rooms[exits[TOP]] || {};
								Memory.rooms[exits[TOP]].noobieZone = 1;
							}
						}
					}
				}
				else if (noobieZoneL || noobieZoneB || noobieZoneR || noobieZoneT) {
					let exits = Game.map.describeExits(this.name);
					if (noobieZoneL) {
						let coords = util.getSectorCoords(exits[LEFT]);
						if (coords.x && coords.y) {
							Memory.rooms[exits[LEFT]] = Memory.rooms[exits[LEFT]] || {};
							Memory.rooms[exits[LEFT]].noobieZone = 1;
						}
					}
					if (noobieZoneR) {
						let coords = util.getSectorCoords(exits[RIGHT]);
						if (coords.x && coords.y) {
							Memory.rooms[exits[RIGHT]] = Memory.rooms[exits[RIGHT]] || {};
							Memory.rooms[exits[RIGHT]].noobieZone = 1;
						}
					}
					if (noobieZoneT) {
						let coords = util.getSectorCoords(exits[TOP]);
						if (coords.x && coords.y) {
							Memory.rooms[exits[TOP]] = Memory.rooms[exits[TOP]] || {};
							Memory.rooms[exits[TOP]].noobieZone = 1;
						}
					}
					if (noobieZoneB) {
						let coords = util.getSectorCoords(exits[BOTTOM]);
						if (coords.x && coords.y) {
							Memory.rooms[exits[BOTTOM]] = Memory.rooms[exits[BOTTOM]] || {};
							Memory.rooms[exits[BOTTOM]].noobieZone = 1;
						}
					}
				}

			}
		}*/

		if (this.controller && this.controller.my && !this.mem.clearRoomClaim) {
			var roomPos = util.getSectorCoords(this.name);
			let mem = this.memory

			if (this.controller.level < 8) {
				Memory.stats["room." + this.name + ".controllerProgressPercent"] = this.controller.progress / this.controller.progressTotal;
			}
			else {
				delete Memory.stats["room." + this.name + ".controllerProgressPercent"];
			}
			Memory.stats["room." + this.name + ".spawnUtilization"] = mem.spawnUtilization;


			Memory.stats.extensionEnergy = Memory.stats.extensionEnergy || {}

			if (this.energyCapacityAvailable) {
				let freeSpawn = false;
				for (let spawn of this.spawns) {
					if (!spawn.spawning) {
						freeSpawn = true;
						break
					}
				}
				if (freeSpawn) {
					Memory.stats.extensionEnergy[this.name] = alphaExtensions * (Memory.stats.extensionEnergy[this.name] || 1) + (1 - alphaExtensions) * Math.min(1, this.energyAvailable / Math.min(10000, this.energyCapacityAvailable));
				}
			}



			Memory.roomIDCount = Memory.roomIDCount || 0
			mem.ID = mem.ID || (Memory.roomIDCount++);

			this.haulerTransferredEnergy = 0;

			this.defcon = 5
			// Enemies here more than x% of the time
			if (mem.DT > 0.1) {
				this.defcon = Math.max(1, this.defcon - 1);
			}
			if ((mem.attackScore || 0) > 0) {
				this.defcon = Math.max(1, this.defcon - 1);
			}
			else {
				this.mem.lastAttackScore0 = Game.time
			}
			if ((mem.attackScore || 0) > 5000 || mem.DT > 0.5 || this.towers.length == 0) {
				this.defcon = Math.max(1, this.defcon - 1);
			}

			if (global.inTickObject.anyRoomUnderBigAttack === undefined) {			
				global.inTickObject.anyRoomUnderBigAttack = false;	
				// Room can be this.
				for (let room of Game.myRooms) {
					if ((room.mem.attackScore || 0) > 1e6) {
						this.defcon = Math.max(1, this.defcon - 1);
						global.inTickObject.anyRoomUnderBigAttack = true;
						break;
					}
				}
			}
			else if (global.inTickObject.anyRoomUnderBigAttack) {
				this.defcon = Math.max(1, this.defcon - 1);
			}


			// We can't safe mode. That's a problem and means we should wall up.
			this.canSafeModeSoon = true
			if (!Memory.banzai) {
				if (this.controller.level > 3 && this.controller.safeModeAvailable == 0) {
					this.defcon = 1
					this.canSafeModeSoon = false
				}
				else if ((this.controller.safeModeCooldown || 0) > 1000 || Game.time - (Memory.lastSafeModeTick || -20000) < 19000) {
					this.canSafeModeSoon = false
					if (Game.time > (this.mem.ignoreSafeModeDefconHack || 0)) {
						if ((this.controller.safeModeCooldown || 0) > 1000) {
							if ((this.controller.safeModeCooldown || 0) > 20000) {
								this.defcon = 1;
							}
							else if ((this.controller.safeModeCooldown || 0) > 10000) {
								this.defcon = Math.max(1, this.defcon - 3);
							}
							else {
								this.defcon = Math.max(1, this.defcon - 2);
							}
						}
						else {
							this.defcon = Math.max(1, this.defcon - 1);
						}
						delete this.mem.ignoreSafeModeDefconHack
					}
				}
			}

			if (this.controller.level > (mem.maxRCL || 0)) {
				mem.triggerRebuild = true;
				delete mem.triggerRebuildCooldown;
				mem.maxRCL = Math.max(this.controller.level, (mem.maxRCL || 0));
			}

			let numSpawns = this.spawns.length;

			if (numSpawns == 0) {
				// This was set to 2 before. Not sure why. 
				this.effectiveLevel = Math.min(this.controller.level, 1);
			}
			else if (!roomAI.hasSpawnBatteryContainers(this)) {
				this.effectiveLevel = Math.min(this.controller.level, 2);
			}
			else if (this.energyCapacityAvailable <= 400 || this.towers.length == 0) {
				this.effectiveLevel = Math.min(this.controller.level, 3);
			}
			else if (!this.storage || this.energyCapacityAvailable <= 800) {
				this.effectiveLevel = Math.min(this.controller.level, 4);
			}
			else if (this.links.length < 2 ||
				roomAI.getSpawnBatteryCentre(this.name).lookFor(LOOK_STRUCTURES).length == 0 ||
				this.energyCapacityAvailable <= 1300) {
				this.effectiveLevel = Math.min(this.controller.level, 5);
			}
			else if (!this.terminal || this.energyCapacityAvailable <= 1800 + 1500 ||
					 this.lookForAt(LOOK_STRUCTURES, mem.storageBatteryX - 1, mem.storageBatteryY + 1).length == 0) {
				this.effectiveLevel = Math.min(this.controller.level, 6);
			}
			else if ((numSpawns < 2 && !Memory.season3) || this.energyCapacityAvailable <= 2300 + 2000) {
				this.effectiveLevel = Math.min(this.controller.level, 7);
			}
			else {
				this.effectiveLevel = this.controller.level;
			}

			if (this.effectiveLevel < this.controller.level) {
				mem.ticksUnderEffectiveLevel = (mem.ticksUnderEffectiveLevel || 0) + 1;
				Game.damagedRooms = (Game.damagedRooms || 0) + 1;
			}
			else {
				delete mem.ticksUnderEffectiveLevel;
			}

			if (!Memory.ignoreNukeDefcon) {				
				if ((mem.nukeLandTime || 0) - Game.time > 20000 * (mem.nukeCount || 1)) {
					this.defcon = Math.max(1, this.defcon - Math.round(Math.sqrt(1 * (mem.nukeCount || 1))));
				}
				else if ((mem.nukeLandTime || 0) - Game.time > 0) {
					this.defcon = Math.max(1, this.defcon - Math.round(Math.sqrt(2 * (mem.nukeCount || 1))));
				}
			}


			// Orphan them. They'll get picked up
			if (this.effectiveLevel < 4) {
				mem.childRooms = [];
			}

			// Only allow one room to toggle every 1500 ticks. Otherwise we get too wild oscillations.
			// Random makes room order effectively non-deterministic.
			if (Game.time - (Memory.lastHaulerSizeToggle || -2000) >= 1500 - 100 * Math.random() || Memory.stats.avgBucket > 9990) {
				if (Memory.tick < 1000 || (Game.cpu.bucket > 9500 && Memory.stats.avgBucket > 9500 && (mem.spawnUtilization > 0.7 || Memory.tick < 5000 || Game.time - (mem.claimTick || 0) < 5000) && !mem.verySmallHaulers)) {
					console.log(this, "enabling very small haulers")
					mem.verySmallHaulers = 1
					Memory.lastHaulerSizeToggle = Game.time
				}
				if (Game.cpu.bucket > 9000 && Memory.stats.avgBucket > 9000 && mem.spawnUtilization > 0.7 && !mem.smallHaulers) {
					console.log(this, "enabling small haulers")
					mem.smallHaulers = 1
					Memory.lastHaulerSizeToggle = Game.time
				}
				if (Game.cpu.bucket > 8500 && Memory.stats.avgBucket > 8500 && mem.spawnUtilization > 0.7 && !mem.mediumHaulers) {
					console.log(this, "enabling medium haulers")
					mem.mediumHaulers = 1
					Memory.lastHaulerSizeToggle = Game.time
				}
			}


			if (mem.mediumHaulers || mem.smallHaulers || mem.verySmallHaulers) {
				global.anySmallHaulers = 1

				if (this.effectiveLevel >= 8 && 
					this.defcon == 5 && 
					!this.mem.attackScore && 
					this.links.length <= 6 &&
					this.links.length >= 3 + roomIntel.getNumSources(this.name)) {
					mem.fetcherArrivalPoints = mem.fetcherArrivalPoints || {}

					// Find where all the creeps arrive
					let haulers = this.find(FIND_MY_CREEPS, {
						filter: (creep) => {
							return (creep.pos.x == 1 || creep.pos.y == 1 || creep.pos.x == 48 || creep.pos.y == 48) && (creep.mem.role == "fetcher" && !creep.mem.f && creep.store[RESOURCE_ENERGY] && Object.keys(creep.store).length == 1);
						}
					});

					// console.log(haulers)

					for (let hauler of haulers) {
						let idx = hauler.pos.x * 50 + hauler.pos.y
						mem.fetcherArrivalPoints[idx] = (mem.fetcherArrivalPoints[idx] || 0) + 1

						if (mem.fetcherArrivalPoints[idx] > 1000) {
							let done = false;
							for (let i = -1; i <= 1; i++) {
								for (let j = -1; j <= 1; j++) {
									let pos = new RoomPosition(hauler.pos.x + i, hauler.pos.y + j, this.name)
									if (pos.x <= 1 || pos.y <= 1 || pos.x >= 48 || pos.y >= 48) {
										continue
									}

									let currentStructs = pos.lookFor(LOOK_STRUCTURES)
									if (currentStructs.length) continue

									if (this.createConstructionSite(pos, STRUCTURE_LINK) == OK) {
										delete mem.fetcherArrivalPoints
										done = true;
										break
									}
								}
								if (done) {
									break
								}
							}						
						}
					}
				}
				else {
					delete mem.fetcherArrivalPoints
				}
			}


			if (Game.time % 3000 == (mem.ID % 50) * 60 && this.spawns.length) {
				// Portal scouts
				let portalCoords = {}
				let myCoords = util.getRoomCoords(this.name);
				if (myCoords.x > 0) portalCoords.x = Math.floor(myCoords.x / 10) * 10 + 5;
				else 				portalCoords.x = -Math.floor(-(myCoords.x + 1) / 10) * 10 - 6;

				if (myCoords.y > 0) portalCoords.y = Math.floor(myCoords.y / 10) * 10 + 5;
				else 				portalCoords.y = -Math.floor(-(myCoords.y + 1) / 10) * 10 - 6;

				let portalRoomName = util.getRoomNameFromCoords(portalCoords);

				if (Memory.rooms[portalRoomName] && Memory.rooms[portalRoomName].portalDest) {
					this.spawns[0].addPrioritySpawn("portalScout", {portalTargetRoom: portalRoomName});
				}


				if (!Memory.season) {					
					if (myCoords.x > 0) {
						portalCoords.x = Math.floor(myCoords.x / 10) * 10;
						if (roomPos.x > 5) {
							portalCoords.x += 10
						}
					}
					else {
						portalCoords.x = -Math.floor(-(myCoords.x + 1) / 10) * 10 - 1;
						if (roomPos.x < 5) {
							portalCoords.x -= 10
						}
					}

					if (myCoords.y > 0) {
						portalCoords.y = Math.floor(myCoords.y / 10) * 10;
						if (roomPos.y > 5) {
							portalCoords.y += 10
						}
					}
					else {
						portalCoords.y = -Math.floor(-(myCoords.y + 1) / 10) * 10 - 1;
						if (roomPos.y < 5) {
							portalCoords.y -= 10
						}
					}


					portalRoomName = util.getRoomNameFromCoords(portalCoords);

					console.log("IS scout check", this.name, portalRoomName)
					// Don't do it very often
					if (Memory.rooms[portalRoomName] && Memory.rooms[portalRoomName].portalDests) {
						// console.log(JSON.stringify(Memory.rooms[portalRoomName].portalDests))
						for (let dest of Memory.rooms[portalRoomName].portalDests) {
							// console.log(JSON.stringify(dest))
							if (global.activeShards.includes(dest.shard)) {
								let isMem = interShardMemoryManager.getMem(dest.shard)

								if (Object.keys(isMem.myRooms).length && Math.random() > 0.1) continue

								// If we've not heard from it in 20 minutes or it's low on CPU, don't send anything
								if (!Object.keys(isMem).length || !Object.keys(isMem.myRooms).length || (Date.now() - isMem.wallClock < 20 * 60 * 1000 && isMem.avgBucket > 2000) || Date.now() - isMem.wallClock > 300 * 60 * 1000) {
									console.log("spawn intershardScout", this.name, portalRoomName, dest.shard)
									this.spawns[0].addPrioritySpawn("intershardScout", {portalTargetRoom: portalRoomName, shardTarget: dest.shard, scoutMode: 2});								
								}
							}
						}
					}
				}
			}

			// Every 48000 ticks go send someone to tag deposits.
			if (!Memory.botArena && Game.time % DEPOSIT_DECAY_TIME - 2000 == (mem.ID % 50) * ((DEPOSIT_DECAY_TIME - 2000) / 50) && this.spawns.length) {
				// Find a highway room that's 10 tiles from me but not within 10 tiles of any other room. Send a creep there and run up the highway
				// bonking any deposit it finds
				let myCoords = util.getRoomCoords(this.name)
				let newCoords
				let newRoomName
				let newSectorCoords

				// Randomize the order
				let iMod = Math.random() < 0.5 ? 1 : -1
				let jMod = Math.random() < 0.5 ? 1 : 0
				let spawned = 0

				for (let i = -10 * iMod; i != 11 * iMod && !spawned; i += iMod) {
					for (let j = 0; j < 2; j++) {
						if ((j + jMod) % 2 == 0) {
							newCoords = {x: myCoords.x + i, y: myCoords.y}
						}
						else {
							newCoords = {x: myCoords.x, y: myCoords.y + i}
						}
						newRoomName = util.getRoomNameFromCoords(newCoords)
						newSectorCoords = util.getSectorCoords(newRoomName)

						if (newSectorCoords.x == 0 || newSectorCoords.y == 0) {
							let fail = 0
							for (let otherRoom of Game.myRooms) {
								if (otherRoom == this) continue
								if (Game.map.getRoomLinearDistance(otherRoom.name, newRoomName) <= 10) {
									fail = 1
									break;
								}
							}

							if (!fail) {
								let dir
								if (newSectorCoords.x == 0) {
									if (newCoords.y < myCoords.y) {
										dir = TOP
									}
									else {
										dir = BOTTOM
									}
								}
								else {
									if (newCoords.x < myCoords.x) {
										dir = LEFT
									}
									else {
										dir = RIGHT
									}
								}
								// this.spawns[0].addPrioritySpawn("depositTroll", {targetRoom: newRoomName, exitDir: dir});
								
								spawned = 1
								break
							}
						}
					}
				}
			}


			// Containers can get polluted. Lab techs clear them
			if (Math.random() < 0.0005 && this.storage && (mem.ownedCreeps["labTech"] || []).length == 0) {
				for (let container of this.containers) {
					if (container.store.getUsedCapacity() != container.store.getUsedCapacity(RESOURCE_ENERGY)) {
						let spawns = this.spawns[0].addPrioritySpawn("labTech")
						break;
					}
				}
			}

			if ((mem.boostFailed || 0) > 0) {
				mem.boostFailed--;
			}

			// Clean
			if (Math.random() < 0.001) {
				for (let role in _.clone(this.mem.priorityBuildsTicks)) {
					if (Game.time - this.mem.priorityBuildsTicks[role] > 100000) {
						delete this.mem.priorityBuildsTicks[role]
					}				
				}
				for (let role in _.clone(this.mem.priorityBuilds)) {
					if (this.mem.priorityBuilds[role] && !this.mem.priorityBuilds[role]) {
						delete this.mem.priorityBuilds[role]
						delete this.mem.priorityBuildsTicks[role]
						delete this.mem.postBuildExtraMemory[role]
						delete this.mem.overrideName[role]
						delete this.mem.overrideBody[role]
					}				
				}

				for (let role in _.clone(this.mem.postBuildExtraMemory)) {
					if (this.mem.postBuildExtraMemory[role] && !this.mem.postBuildExtraMemory[role].length) {
						delete this.mem.postBuildExtraMemory[role]
					}				
				}

				for (let role in _.clone(this.mem.overrideName)) {
					if (this.mem.overrideName[role] && !this.mem.overrideName[role].length) {
						delete this.mem.overrideName[role]
					}				
				}

				for (let role in _.clone(this.mem.overrideBody)) {
					if (this.mem.overrideBody[role] && !this.mem.overrideBody[role].length) {
						delete this.mem.overrideBody[role]
					}				
				}


			}
		}
		else {
			delete Memory.stats["room." + this.name + ".controllerProgressPercent"];
			delete Memory.stats["room." + this.name + ".spawnUtilization"];
		}

	}

	// Only called in owned rooms
	Room.prototype.initForTick_stage2 = function() {
		let exits = Game.map.describeExits(this.name);

		let incomingPCDisruptSpawn = false
		let incomingPCDisruptTerminal = false
		let boostsInNeighbours = false;
		for (var exitDir in exits) {
			var exitRoom = exits[exitDir];

			if (Game.rooms[exitRoom] && Game.rooms[exitRoom].dangerous) {
				for (let hostile of Game.rooms[exitRoom].find(FIND_HOSTILE_CREEPS)) {
					if (hostile.owner.username != "Invader" && hostile.owner.username != "Source Keeper" && hostile.owner.username != "Screeps") {
						if (hostile.hasBoost()) {
							boostsInNeighbours = true;
						}

						// TODO: reduce white list hate
						if (!scouting.isPlayerMediumWhiteListed(Memory.rooms[exitRoom].owner)) {
							Memory.stats.hateCounter[hostile.owner.username] += hostile.body.length * 0.05;
						}
					}
				}
				for (let hostile of Game.rooms[exitRoom].find(FIND_HOSTILE_POWER_CREEPS)) {
					Memory.stats.hateCounter[hostile.owner.username] += hostile.level;
					if (hostile.powers[PWR_DISRUPT_SPAWN]) {
						incomingPCDisruptSpawn = true
					}
					if (hostile.powers[PWR_DISRUPT_TERMINAL]) {
						incomingPCDisruptTerminal = true
					}
					boostsInNeighbours = true
				}
			}

			for (let secondExitDir in exits) {
				let secondExitRoom = exits[exitDir];
				if (!Game.rooms[secondExitRoom]) continue
				for (let hostile of Game.rooms[secondExitRoom].find(FIND_HOSTILE_POWER_CREEPS)) {
					Memory.stats.hateCounter[hostile.owner.username] += hostile.level;
					if (hostile.powers[PWR_DISRUPT_SPAWN]) {
						incomingPCDisruptSpawn = true
					}
					if (hostile.powers[PWR_DISRUPT_TERMINAL]) {
						incomingPCDisruptTerminal = true
					}
					boostsInNeighbours = true
				}					
			}

			if (Memory.rooms[exitRoom] && Memory.rooms[exitRoom].owner && Memory.rooms[exitRoom].owner != util.getMyName() && Memory.rooms[exitRoom].owner != "Invader") {
				let diff = 100
				// if (Memory.season1 && Memory.rooms[exitRoom].owner == "Pyrodogg") {
				// 	diff = 0
				// }
				if (!scouting.isPlayerMediumWhiteListed(Memory.rooms[exitRoom].owner)) {
					Memory.stats.hateCounter[Memory.rooms[exitRoom].owner] += diff;
				}
			}
		}

		for (let roomName of this.mem.goodRooms) {
			if (Game.rooms[roomName] && Game.rooms[roomName].dangerous) {
				for (let hostile of Game.rooms[roomName].find(FIND_HOSTILE_CREEPS)) {
					if (hostile.owner.username != "Invader" && hostile.owner.username != "Source Keeper" && hostile.owner.username != "Screeps") {
						if (hostile.hasBoost()) {
							boostsInNeighbours = true;
						}
						if (!scouting.isPlayerMediumWhiteListed(hostile.owner.username)) {
							Memory.stats.hateCounter[hostile.owner.username] += hostile.body.length * 0.05;
						}
					}
				}
				for (let hostile of Game.rooms[roomName].find(FIND_HOSTILE_POWER_CREEPS)) {
					Memory.stats.hateCounter[hostile.owner.username] += hostile.level;
					if (hostile.powers[PWR_DISRUPT_SPAWN]) {
						incomingPCDisruptSpawn = true
					}
					if (hostile.powers[PWR_DISRUPT_TERMINAL]) {
						incomingPCDisruptTerminal = true
					}

					boostsInNeighbours = true
				}
			}
		}
		if (incomingPCDisruptSpawn || incomingPCDisruptTerminal) {
			this.defcon = 1
			if (!this.canSafeModeSoon) {
				combatManager.requestHeavyRoomHold(this.name)
			}
		}
		else if (boostsInNeighbours) {
			this.defcon = Math.max(1, this.defcon - 1);
		}

		if (Math.random() < 0.01) {
			let totalSiteCost = 0
			for (let site of this.find(FIND_MY_CONSTRUCTION_SITES)) {
				totalSiteCost += site.progressTotal
			}

			if (totalSiteCost >= 5000) {
				this.mem.closeRamparts = 1
				for (let rampart of this.ramparts) {
					if (rampart.isPublic) rampart.setPublic(false)
				}
				this.mem.minOpenRampartTick = (this.mem.minOpenRampartTick || (Game.time + 100))

			}
			else {
				delete this.mem.closeRamparts
			}
		}

		// We can't safe mode. That's a problem and means we should ask for help.
		// This is too expensive
		if (((this.controller.safeModeCooldown || 0) > 1000 || (this.controller.level > 1 && this.controller.safeModeAvailable == 0)) && (this.controller.safeMode || 0) < 1000) {
			if (Game.time > (this.mem.ignoreSafeModeDefconHack || 0)) {
				if (Memory.empireStrength > 10 || this.effectiveLevel != this.controller.level) {
					combatManager.requestHeavyRoomHold(this.name)
				}
				else if (Math.random() < 0.1) {
					// If we're poor, look for any hostile boosted creeps
					let baseCoords = util.getRoomCoords(this.name);

					for (let i = -10; i <= 10; i++) {
						for (let j = -10; j <= 10; j++) {
							let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
							let testRoomName = util.getRoomNameFromCoords(coords);

							if (Memory.rooms[testRoomName] && Memory.rooms[testRoomName].hostileBoostedCreeps && !Memory.rooms[testRoomName].invCL && (Game.time - (Memory.rooms[testRoomName].lo || 0) < 1000)) {
								combatManager.requestHeavyRoomHold(this.name)
								i = 11
								j = 11

								console.log(this, "requesting heavy hold as detected boosted creeps in", testRoomName)
							}
						}
					}
				}
			}
		}
	}

	Room.prototype.tick = function() {
		if (this.controller && this.controller.my && !this.mem.clearRoomClaim) {
			let mem = this.memory
			mem.supressFetchers = mem.supressFetchers || 0;
			mem.supressFetchers -= 1;
			if (mem.verySmallHaulers) {
				mem.supressFetchers -= 2;
			}
			else if (mem.smallHaulers) {
				mem.supressFetchers -= 1;	
			}

			mem.upgradersStarved = mem.upgradersStarved || 0;
			mem.upgradersStarved -= 1;

			if (Memory.unclaimDisabled && Math.random() < 0.001 / Game.myRooms.length) {
				console.log("---- UNCLAIM CODE DISABLED ----")
			}

			let unclaimed = false;
			if (this.controller.safeMode && mem.unclaimDueToSafeMode) {
				unclaimed = true;
			}
			else if ((global.totalRooms || Game.myRooms.length) === Game.gcl.level) {
				// Try to get design fails due to bugs. Give it 1000 ticks.
				if (Memory.botArena && 
					Memory.timedRound &&
					Game.time - (mem.claimTick || Infinity) > 1000 && 
					(global.totalRooms || Game.myRooms.length) > 1 &&
					global.ROOM_DESIGN_NUM_STAGES !== undefined) {
					if (this.mem.designed != global.ROOM_DESIGN_NUM_STAGES) {
						unclaimed = true
					}
				}

				// It's been 10000 ticks and we've not made RCL 2. Cut this room.
				if (mem.maxRCL == 1 && Game.time - mem.claimTick > 5000 && (global.totalRooms || Game.myRooms.length) > 1 && !this.controller.safeMode && this.spawns.length == 0) {
					console.log("Room node made RCL 2 fast enough. Unclaiming", this.name);
					unclaimed = true;
				}
				// Target for an unmolested room is 5000 ticks.
				else if (mem.maxRCL <= 2 && Game.time - mem.claimTick > 20000 && (global.totalRooms || Game.myRooms.length) > 1 && !this.controller.safeMode && this.spawns.length == 0) {
					console.log("Room node made RCL 3 fast enough. Unclaiming", this.name);
					unclaimed = true;
				}
				// Target for an unmolested room is 15000 ticks.
				else if (mem.maxRCL <= 3 && Game.time - mem.claimTick > 100000 && (global.totalRooms || Game.myRooms.length) > 1 && !this.controller.safeMode && this.spawns.length == 0) {
					console.log("Room node made RCL 4 fast enough. Unclaiming", this.name);
					unclaimed = true;
				}
				// We've lost 3 levels. Looks like we're not getting this one back.
				else if (mem.maxRCL - this.controller.level >= 3) {
					console.log("Room lost 3 levels. Unclaiming", this.name);
					unclaimed = true;
				}
				else if (mem.maxRCL >= 4 && mem.ticksUnderEffectiveLevel > this.controller.level * 25000 && (global.totalRooms || Game.myRooms.length) > 1 && !this.controller.safeMode && this.spawns.length == 0) {
					console.log("Room under effectiveLevel too long. Unclaiming", this.name);
					unclaimed = true;
				}
				else if (Game.myRooms.length == 1 && global.totalRooms != Game.myRooms.length && 
						 Game.time - mem.claimTick > 20000 &&
						 !this.controller.safeMode && 
						 this.spawns.length == 0 && 
						 this.towers.length == 0 && 
						 this.controller.level < mem.maxRCL && 
						 this.controller.safeModeCooldown) {
					console.log("Intershard claim seems to have failed", this.name);
					unclaimed = true;
				}



				if ((Memory.roomToUnclaim == this.name && Game.time - (Memory.roomToUnclaimTick || 0) > 200000 && Game.myRooms.length > 10 && Memory.minRoomLevel == 8) || (Memory.season && Memory.seasonUnclaim == this.name)) {
					global.currentlyUnclaimingRoom = this.name
					this.clearTerminal = 1
					if (this.powerSpawn) {
						this.powerSpawn.processPower();						
					}

					if ((!this.storage || this.storage.store.getUsedCapacity() === (this.storage.store[RESOURCE_ENERGY] || 0)) &&
						(!this.terminal || this.terminal.store.getUsedCapacity() === (this.terminal.store[RESOURCE_ENERGY] || 0)) &&
						(!Memory.season5 || this.calcEffectiveEnergy(false) < 10000 || this.mem.supportFrom) &&
						(!this.factory || this.factory.store.getUsedCapacity() === (this.factory.store[RESOURCE_ENERGY] || 0))) {
						unclaimed = true;
						// Should probably fire one off for giggles.
						if (this.nuker) {

						}
					}
				}
			}


			if (unclaimed) {
				console.log("-----------------------------UNCLAIMING", this)
				Game.notify("UNCLAIMING" + this.name)

				if (!Memory.unclaimDisabled) {
					// Safety check
					let totalRooms = 0
					for (let shard of global.activeShards) {
						if (shard == Game.shard.name) {
							totalRooms += Game.myRooms.length
						}
						else {					
							let isMemory = interShardMemoryManager.getMem(shard)
							totalRooms += Object.keys(isMemory.myRooms).length
						}
					}

					if (totalRooms == Game.gcl.level || mem.unclaimDueToSafeMode) {
						totalRooms--
						if (mem.unclaimDueToSafeMode) {
							// Try to claim it back
							mem.numAttemptedClaims = Math.max((mem.numAttemptedClaims || 0) - 5, -5)
						}
						else {							
							mem.numAttemptedClaims = (mem.numAttemptedClaims || 0) + 10;

							var baseCoords = util.getRoomCoords(this.name);

							var radius = this.controller.level;

							for (var i = -radius; i <= radius; i++) {
								for (var j = -radius; j <= radius; j++) {
									let coords = {"x": baseCoords.x + i, "y" : baseCoords.y + j};
									var newRoomName = util.getRoomNameFromCoords(coords);

									if (Memory.rooms[newRoomName]) {
										Memory.rooms[newRoomName].numAttemptedClaims = (Memory.rooms[newRoomName].numAttemptedClaims || 0) + (radius - Math.max(i, j) + 1);
									}
								}
							}
						}


						for (let flag of this.find(FIND_FLAGS)) {
							flag.remove();
						}
						this.controller.unclaim();

						this.memory = {lo: Game.time}

						/*delete mem.unclaimDueToSafeMode;
						delete mem.buildings;
						delete mem.tmpBuildings;
						delete mem.compressedBuildings;
						delete mem.designed;
						delete mem.claimTick;
						delete mem.spawnBatteryCentreX;
						delete mem.spawnBatteryCentreY;
						delete mem.storageBatteryX;
						delete mem.storageBatteryY;
						delete mem.storageX;
						delete mem.storageY;
						delete mem.storageControllerLinkDist;
						delete mem.labPositionX;
						delete mem.labPositionY;
						delete mem.extenstionStarsX;
						delete mem.extenstionStarsY;
						delete mem.supressFetchers;
						delete mem.upgradersStarved;
						delete mem.phatHaulers;
						delete mem.mediumHaulers
						delete mem.smallHaulers
						delete mem.verySmallHaulers
						delete mem.attackScore;
						delete mem.towerStratChangeTimer;
						delete mem.assignedPowerCreeps;
						delete mem.haulerTransferredEnergyAvg;
						delete mem.attackScore;
						delete mem.maxRCL;
						delete mem.childRooms;
						delete mem.goodRooms;
						delete mem.regularHarvestRooms;
						delete mem.doubleHarvestRooms;
						delete mem.protectRooms;
						delete mem.observeRooms;
						delete mem.powerRooms;
						delete mem.depositRooms;
						delete mem.convoyRooms;
						delete mem.lootRooms;
						delete mem.buildRooms;
						delete mem.keeperHarvestRooms;
						delete mem.keeperMineRooms;
						delete mem.avgImportValues;
						delete mem.avgExportValues;
						delete mem.harvestPointsX;
						delete mem.harvestPointsY;
						delete mem.rampartCount;
						delete mem.meanExtensionStorageDist;
						delete mem.fallbackX;
						delete mem.fallbackY;
						delete mem.pressureBuildings;
						delete mem.towerStrategy;
						delete mem.currentTarget;
						delete mem.currentTargetLastHits;
						delete mem.lastTargets;
						delete mem.energyCreepsECost;
						delete mem.energyCreepsCCost;
						delete mem.priorityBuilds;
						delete mem.postBuildExtraMemory;
						delete mem.overrideBody;
						delete mem.overrideName;
						delete mem.workFetcher;
						delete mem.spawnUtilization;
						delete mem.buildTick;
						delete mem.priorityBuildsTicks;
						delete mem.lastBreached;
						delete mem.outerWallDamageLevel;
						delete mem.incompleteHarvestPathRooms;
						delete mem.towerRepairSleep;
						delete mem.turretSleep;
						delete mem.requestRenew;
						delete mem.healersDefaultHealOthersFirst;
						delete mem.healersAlwaysHealSelfFirst;
						delete mem.reRoadWithBuilders;
						delete mem.ticksUnderEffectiveLevel;
						delete mem.oldRampartPrioritiesT;
						delete mem.oldRampartPrioritiesT;
						delete mem.boostsRequestedTime;
						// delete mem.upgradeThroughputLimited;
						delete mem.lastAttackScore0

						delete mem.advManagedLabs;
						delete mem.triggerRebuild
						delete mem.triggerRebuildCooldown

						delete mem.lastSpawnToIdlePool

						delete mem.fetcherArrivalPoints
						delete mem.closeRamparts

						delete mem.attemptingToUnBoostRick
						delete mem.spawningHeavyMission
						delete mem.observeRoomIdx
						delete mem.combatBoostsPending
						delete mem.neededBoosts
						delete mem.energyPrice
						delete mem.civilianLabs
						delete mem.labMemory*/



						// TODO

						_.pull(Game.myRooms, this)

						return;
					}
			
				}
				return
			}


			// MONEY PWEASE
			if (this.effectiveLevel < 8 && Math.random() < 0.05 && (Memory.maxRoomLevel == 8 || intelAI.getMaxHate() > 3000)) {
				if (this.controller.level == this.effectiveLevel || (this.effectiveLevel == 1 && this.controller.level == 2)) {
				// if ((this.defcon <= 3 && this.effectiveLevel < 7) || (this.effectiveLevel < 6 && !this.terminal) && this.controller.level == this.effectiveLevel) {
					combatManager.requestRoomEconSupportMission(this.name)
				}
			}
			if (Memory.season5 && this.mem.claimToUnclaimRoom && this.extractor && Math.random() < 0.05 && this.mem.supportFrom) {
				combatManager.requestRoomChildHeavyMine(this.name, this.mem.supportFrom)
			}


			// Quick sanity check. Are we overflowing containers?
			if (!this.dangerous && mem.DT < 0.1 && Game.time % 431 == 137) {
			// if (!this.dangerous && mem.DT < 0.1) {
				if ((mem.supressFetchers || 0) <= 0) {					
					let overflow = 0;
					let sites = 0
					for (let remoteRoomName of mem.goodRooms) {
						if (Game.rooms[remoteRoomName]) {
							let resources = Game.rooms[remoteRoomName].find(FIND_DROPPED_RESOURCES);
							for (let resource of resources) {
								overflow += resource.amount;
								// console.log(resource.amount)
							}
							if (overflow > 1000) {
								sites += Game.rooms[remoteRoomName].find(FIND_MY_CONSTRUCTION_SITES).length
							}
						}
					}

					let div

					if (this.mem.verySmallHaulers) {
						div = 250;
					}
					else if (this.mem.smallHaulers) {
						div = 500;
					}
					else if (this.mem.mediumHaulers) {
						div = 750
					}
					else {
						div = 1000
					}

					let numFetchers = Math.floor(overflow / div)


					if (numFetchers) {
						let spawns = this.spawns;
						if (spawns.length > 0) {
							// If we're really overflowing and have sites to build, build them with the overflow
							// Often we're overflowing because we have roads unbuit.
							if (sites && overflow > 2000 && this.calcEffectiveEnergy(true) > constants.ROOM_ENERGY_NO_BUILDERS) {
								if (!(this.mem.ownedCreeps["builder"] || []).length) {									
									spawns[0].addPrioritySpawn("builder")
								}
							}

							if (this.effectiveLevel < 7) {
								for (let i = 0; i < numFetchers; i++) {
									// console.log(spawns, overflow)
									spawns[0].addPrioritySpawn("fetcher")
								}
							}
							else {
								for (let i = 0; i < numFetchers / 2; i++) {
									// console.log(spawns, overflow)
									spawns[0].addPrioritySpawn("fetcher")
								}
							}

						}
					}
				}

				let numSources = 0;
				for (let remoteRoomName of mem.goodRooms) {
					if (!mem.keeperHarvestRooms.includes(remoteRoomName) &&
						!mem.centreHarvestRooms.includes(remoteRoomName) &&
						!mem.doubleHarvestRooms.includes(remoteRoomName)) {
						numSources += roomIntel.getNumSources(remoteRoomName);
					}
				}

				let numHarvesters = mem.ownedCreeps["harvester"] ? mem.ownedCreeps["harvester"].length : 0
				numHarvesters += mem.ownedCreeps["bHarvester"] ? mem.ownedCreeps["bHarvester"].length : 0

				if (numHarvesters <= numSources / 2) {
					let spawns = this.spawns;
					if (spawns.length > 0 && !spawns[0].hasPrioritySpawn("harvester")) {
						spawns[0].addPrioritySpawn("harvester")
					}
				}

				if (this.controller.safeModeAvailable == 0 && this.energyCapacityAvailable >= 30 * 50) {
					let g = this.storage ? (this.storage.store[RESOURCE_GHODIUM] || 0) : 0

					if (g >= 1000) {					
						let spawns = this.spawns;
						if (spawns.length > 0 && !spawns[0].hasPrioritySpawn("safeModeGenerator")) {
							spawns[0].addPrioritySpawn("safeModeGenerator")
						}
					}
					else {
						let potentialFeeders = [];
						for (let otherRoom of Game.myRooms) {
							if (otherRoom === this || !otherRoom.terminal) continue;
							if (otherRoom.terminal.cooldown) continue;
							if ((otherRoom.terminal.store[RESOURCE_GHODIUM] || 0) >= 1000 && (otherRoom.terminal.store[RESOURCE_ENERGY] || 0) >= 1000) {
								potentialFeeders.push(otherRoom);
							}
						}

						let minDist = Infinity;
						let bestFeeder;
						for (let feeder of potentialFeeders) {
							let dist = Game.map.getRoomLinearDistance(this.name, feeder.name, true);
							if (dist < minDist) {
								minDist = dist;
								bestFeeder = feeder;
							}
						}

						if (bestFeeder && this.name != global.currentlyUnclaimingRoom) {
							console.log("Terminal send", RESOURCE_GHODIUM, bestFeeder.name, "to", this.name, 1000, "for safe mode generation");
							bestFeeder.terminal.send(RESOURCE_GHODIUM, 1000, this.name);
						}
					}
				}
			}


			for (let childRoomName of mem.childRooms) {
				if (Game.rooms[childRoomName] && Game.rooms[childRoomName].controller.my && Game.rooms[childRoomName].effectiveLevel < 6 && this.effectiveLevel > 6) {
					let exits = Game.map.describeExits(childRoomName)
					let targetRoomNames = [];

					let needsHelp = 0;
					let canSeeEnemies = 0;
					for (let exitDir in exits) {
						let exitRoomName = exits[exitDir];
						if (!Memory.rooms[exitRoomName]) continue
						if (Memory.rooms[exitRoomName].owner) continue
						if (Memory.rooms[exitRoomName] && Memory.rooms[exitRoomName].DT > 1.05) {
							needsHelp = 1;
						}
						if (Game.rooms[exitRoomName] && Game.rooms[exitRoomName].dangerous == 2) {
							canSeeEnemies = 1;
						}
						targetRoomNames.push(exitRoomName)
					}

					targetRoomNames.push(childRoomName)

					if (needsHelp && canSeeEnemies && Game.rooms[childRoomName].spawns.length) {
						combatManager.requestChildRamboDefenseMission(this, childRoomName, targetRoomNames)
					}
				}
			}

			// Done outside so I can profile them
			// this.manageLinks()
			// this.managePowerProcessing()
			// this.manageLabs()
			// this.manageFactory()

			// 5 is arbitrary
			if (this.effectiveLevel == 8 && Memory.stats.yieldPerCPU > 5 && this.defcon == 5 && !Memory.botArena && Memory.stats.avgBucket < 8000) {
				if (mem.spawnUtilization < 0.65) {
					if (!mem.phatHaulers && global.fetcherTargetCounts && global.fetcherTargetCounts[this.name]) {
						delete global.fetcherTargetCounts[this.name]
					}
					mem.phatHaulers = 1;
				}
				else if (mem.spawnUtilization > 0.8 && mem.phatHaulers == 1) {
					if (mem.phatHaulers && global.fetcherTargetCounts && global.fetcherTargetCounts[this.name]) {
						delete global.fetcherTargetCounts[this.name]
					}
					mem.phatHaulers = 0;
				}
			}
			else {
				if (mem.phatHaulers && global.fetcherTargetCounts && global.fetcherTargetCounts[this.name]) {
					delete global.fetcherTargetCounts[this.name]
				}
				mem.phatHaulers = 0;
			}

		}
	}



	Room.prototype.endTick = function() {
		if (this.controller && this.controller.my) {
			let mem = this.memory
			// Get all of the things out of this thing!
			if (this.clearTerminal && this.terminal && this.terminal.my && this.terminal.isActive() && this.terminal.cooldown == 0) {
				let sent = false;
				// This isn't very smart.
				for (let otherRoom of _.shuffle(Game.myRooms)) {
					if (otherRoom === this) continue;

					if (otherRoom.storage && otherRoom.terminal && otherRoom.terminal.isActive() && otherRoom.effectiveLevel >= 6) {
						// Clear from most valuable to least.
						for (let resource of _.clone(RESOURCES_ALL).reverse()) {
							let amount = this.terminal.store[resource] || 0;
							if (resource == RESOURCE_ENERGY) {
								if (this.storage && this.storage.store[RESOURCE_ENERGY] != this.storage.store.getUsedCapacity()) {
									continue
								}
								if (this.terminal && this.terminal.store[RESOURCE_ENERGY] != this.terminal.store.getUsedCapacity()) {
									continue
								}

								amount /= 2;
							}
							if (Memory.season5 && resource == RESOURCE_THORIUM && !otherRoom.mem.reactorTarget) {
								continue
							}


							if (amount && Game.market.calcTransactionCost(this.terminal.store[resource], this.name, otherRoom.name) <= this.terminal.store[RESOURCE_ENERGY]) {
								this.terminal.send(resource, amount, otherRoom.name);
								console.log("CLEARING", amount, " ", resource, "FROM", this.name, "TO", otherRoom.name)
								sent = true;
								break;
							}
						}
					}
					if (sent) {
						break;
					}
				}
			}

			// This is used for auto unclaim. I want something super-stable.
			const alpha = Math.exp(-(1/(200000.)))
			mem.haulerTransferredEnergyAvg = alpha * (mem.haulerTransferredEnergyAvg || 0) + (1 - alpha) * (this.haulerTransferredEnergy || 0)

			if (Math.random() < 0.01) {
				const alpha2 = Math.exp(-(1/(2000.)))

				let energyCreeps = mem.ownedCreeps["harvester"] || []
				energyCreeps = energyCreeps.concat(mem.ownedCreeps["bHarvester"] || [])
				energyCreeps = energyCreeps.concat(mem.ownedCreeps["fetcher"] || [])
				energyCreeps = energyCreeps.concat(mem.ownedCreeps["reserver"] || [])
				energyCreeps = energyCreeps.concat(mem.ownedCreeps["centralHarvester"] || [])
				energyCreeps = energyCreeps.concat(mem.ownedCreeps["keeperGuard2"] || [])
				energyCreeps = energyCreeps.concat(mem.ownedCreeps["keeperHarvester2"] || [])

				// Per tick
				let totalCost = 0
				let totalCPU = 0
				for (let creepName of energyCreeps) {
					if (!Memory.creeps[creepName] || !Game.creeps[creepName]) continue;
					if (Game.creeps[creepName].mem.role == "reserver") {
						totalCost += (Memory.creeps[creepName].bC || 0) / CREEP_CLAIM_LIFE_TIME					
						totalCPU += (Memory.creeps[creepName].c || 0) / (CREEP_CLAIM_LIFE_TIME - Game.creeps[creepName].ticksToLive)
					}
					else {
						totalCost += (Memory.creeps[creepName].bC || 0) / CREEP_LIFE_TIME
						totalCPU += (Memory.creeps[creepName].c || 0) / (CREEP_LIFE_TIME - Game.creeps[creepName].ticksToLive)
					}

				}

				mem.energyCreepsECost = alpha2 * (mem.energyCreepsECost || 0) + (1 - alpha2) * (totalCost || 0)
				mem.energyCreepsCCost = alpha2 * (mem.energyCreepsCCost || 0) + (1 - alpha2) * (totalCPU || 0)
			}
		}
		else if (this.isEnemyRoom()) {
			let mem = this.memory
			const alpha = Math.exp(-(1/500.));
			const alpha2 = Math.exp(-(1/50.));
			const alpha3 = Math.exp(-(1/5000.));
			// console.log(this, this.exposedCreeps, this.mem.exposedCreeps)
			mem.exposedCreeps = (this.exposedCreeps || 0) * (1 - alpha) + (mem.exposedCreeps || 0) * alpha;
			mem.undamagingFormation = (this.undamagingFormation ? 1 : 0) * (1 - alpha) + (mem.undamagingFormation || 0) * alpha;


			if (this.numFormationsInRoom) {
				mem.notOnWall = ((this.notOnWall || 0) / this.numFormationsInRoom) * (1 - alpha) + (mem.notOnWall || 0) * alpha;
				mem.advBlkDmg = ((this.advBlkDmg || 0) / this.numFormationsInRoom) * (1 - alpha) + (mem.advBlkDmg || 0) * alpha;
				mem.advBlkDmgTowersOnly = ((this.advBlkDmgTowersOnly || 0) / this.numFormationsInRoom) * (1 - alpha) + (mem.advBlkDmgTowersOnly || 0) * alpha;
			}
			else {
				mem.notOnWall = (mem.notOnWall || 0) * alpha;
				mem.advBlkDmg = (mem.advBlkDmg || 0) * alpha;
				mem.advBlkDmgTowersOnly = (mem.advBlkDmgTowersOnly || 0) * alpha;
			}


			if (mem.exposedCreeps < 1e-10) {
				delete mem.exposedCreeps;
			}
			if (mem.undamagingFormation < 1e-10) {
				delete mem.undamagingFormation;
			}
			if (mem.advBlkDmgTowersOnly < 1e-10) {
				delete mem.advBlkDmgTowersOnly;
			}

			if (mem.advBlkDmg < 1e-10) {
				delete mem.advBlkDmg;
			}
			if (mem.notOnWall < 1e-10) {
				delete mem.notOnWall;
			}

			// Learn upward quick, decay slower.
			if (this.numFormationsInRoom) {
				if (this.attackCreepsClose) {
					this.attackCreepsClose /= this.attackCreepsCloseNumFormations;
					this.attackCreepsClose += 0.1;
					if (this.attackCreepsClose > (mem.attackCreepsClose || 0)) {
						mem.attackCreepsClose = this.attackCreepsClose * (1 - alpha2) + (mem.attackCreepsClose || 3) * alpha2;
					}
					else {
						mem.attackCreepsClose = this.attackCreepsClose * (1 - alpha3) + (mem.attackCreepsClose || 3) * alpha3;
					}
				}
				else {
					mem.attackCreepsClose = (mem.attackCreepsClose || 3) * alpha3;
				}

				if (this.rangedCreepsClose) {
					this.rangedCreepsClose /= this.rangedCreepsCloseNumFormations;
					this.rangedCreepsClose += 0.1;
					if (this.rangedCreepsClose > (mem.rangedCreepsClose || 0)) {
						mem.rangedCreepsClose = this.rangedCreepsClose * (1 - alpha2) + (mem.rangedCreepsClose || 6) * alpha2;
					}
					else {
						mem.rangedCreepsClose = this.rangedCreepsClose * (1 - alpha3) + (mem.rangedCreepsClose || 6) * alpha3;
					}
				}
				else {
					mem.rangedCreepsClose = (mem.rangedCreepsClose || 6) * alpha3;
				}

				if (this.rangedOnUnowned) {
					this.rangedOnUnowned /= this.getAllFriendlyCreepsWithBodyParts([RANGED_ATTACK], true).length
					mem.rangedOnUnowned = this.rangedOnUnowned * (1 - alpha) + (mem.rangedOnUnowned || 0) * alpha;
				}
				else {
					mem.rangedOnUnowned = (mem.rangedOnUnowned || 0) * alpha2;
				}
			}
		}
	}


	Room.prototype.getIntershardInfo = function() {
		let obj = {}

		obj.el = this.effectiveLevel;
		obj.l = this.controller.level;
		obj.s = this.controller.safeMode;
		obj.sma = this.controller.safeModeAvailable;
		obj.smc = this.controller.safeModeCooldown;
		obj.d = this.defcon;
		obj.storeCap = (this.storage ? this.storage.store.getFreeCapacity() : 500000);

		obj.ccp = {}
		obj.ccp.r = this.mem.creepCombatPartsRanged;
		obj.ccp.a = this.mem.creepCombatPartsAttack;
		obj.ccp.h = this.mem.creepCombatPartsHeal;

		obj.mode = {}
		obj.mode.r = this.mem.modeRanged;
		obj.mode.a = this.mem.modeAttack;
		obj.mode.h = this.mem.modeHeal;
		obj.mode.t = this.mem.modeTough;


		if (this.mem.attackScore) obj.attackScore = this.mem.attackScore;
		obj.e = this.getStoredEnergy();
		obj.f = this.factory ? 1 : 0;
		obj.n = this.mem.nukeLandTime - Game.time

		let numISSupportCreeps = 0
		for (let isMission of Memory.combatManager.currentMissions[MISSION_INTERSHARD_SUPPORT_LOCAL]) {
			if (isMission.ID && isMission.targetRoomName == this.name) {
				numISSupportCreeps += isMission.assignedCreeps.length
			}
		}
		if (numISSupportCreeps) {
			obj.numISSupportCreeps = numISSupportCreeps
		}

		if (Game.time - (this.mem.intershardStoreInfoRequested || 0) < 100000) {
			obj.resources = {}
			for (let resource of RESOURCES_ALL) {
				obj.resources[resource] = this.getCurrentOfResource(resource)
			}
		}
		else {
			delete this.mem.intershardStoreInfoRequested
		}

		// if (this.defcon < 5) {
			let exits = Game.map.describeExits(this.name)

			obj.exits = []
			for (let exitDir in exits) {
				let exitObj = {}
				exitObj.roomName = exits[exitDir]
				exitObj.ccp = {}
				if (Memory.rooms[exits[exitDir]]) {
					exitObj.DT = Memory.rooms[exits[exitDir]].DT

					exitObj.ccp.r = Memory.rooms[exits[exitDir]].creepCombatPartsRanged;
					exitObj.ccp.a = Memory.rooms[exits[exitDir]].creepCombatPartsAttack;
					exitObj.ccp.h = Memory.rooms[exits[exitDir]].creepCombatPartsHeal;

					exitObj.mode = {}
					exitObj.mode.r = Memory.rooms[exits[exitDir]].modeRanged;
					exitObj.mode.a = Memory.rooms[exits[exitDir]].modeAttack;
					exitObj.mode.h = Memory.rooms[exits[exitDir]].modeHeal;
					exitObj.mode.t = Memory.rooms[exits[exitDir]].modeTough;
				}

				obj.exits.push(exitObj)
			}
		// }



		return obj

	}


	Room.prototype.calculateTargetRemoteUtilization = function() {
		let numSpawns = this.spawns.length;

		if (numSpawns == 0) {
			this.targetRemoteUtilization = 0
			return
		}

		// 60% utilization for remotes.
		if (numSpawns == 1 || this.effectiveLevel < 7) {
			this.targetRemoteUtilization = 1200 - 30 * this.controller.level;
		}
		else if (numSpawns == 2 && this.storage && (this.terminal || Memory.noTerminals)) {
			this.targetRemoteUtilization = 3000 * 0.7;
		}
		else if (numSpawns == 3 && this.storage && (this.terminal || Memory.noTerminals)) {
			this.targetRemoteUtilization = 4500 * 0.7;
		}
		else {
			this.targetRemoteUtilization = 0;
		}


		let powerMod = 1;
		let PCLevel = -1
		if (Memory.stats.globalResources[RESOURCE_OPS] > 1000) {
			for (let powerCreepName of (this.mem.assignedPowerCreeps || [])) {
				if (Game.powerCreeps[powerCreepName].room && Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN]) {
					if (Memory.season && Memory.season != 5 && (Game.powerCreeps[powerCreepName].level < 9 || Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN].level < 4)) {
						continue
					}
					else {
						PCLevel = Math.max(PCLevel, Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN].level)
					}
				}
			}

			if (Memory.season3) {			
				if (this.mem.lastOpSpawnUsed && Game.time - this.mem.lastOpSpawnUsed.t < 1500) {
					PCLevel = Math.max(PCLevel, this.mem.lastOpSpawnUsed.l)
				}
				for (let spawn of this.spawns) {
					for (let effect of (spawn.effects || [])) {
						if (effect.effect == PWR_OPERATE_SPAWN) {
							PCLevel = Math.max(PCLevel, effect.level)
						}
					}
				}
			}

			if (PCLevel > 0) {
				powerMod = POWER_INFO[PWR_OPERATE_SPAWN].effect[PCLevel - 1]

				// Cut down on PC usage to get more ops if high on energy
				if (Memory.season3) {
					let currentEnergy = this.calcEffectiveEnergy(false)

					if (currentEnergy > 300000) {
						// At 300k do nothing
						// At 400k 5x power mod becomes 3.8x
						// At 500k 5x power mod becomes 3.1x
						// At 600k 5x power mod becomes 2.6x
						powerMod = Math.min(1, 0.1 * powerMod * (1 + 9 * currentEnergy / 300000))				
					}
				}
			}			
		}


		if (Memory.season5) {
			if (this.effectiveLevel == 6 && this.mem.claimToUnclaimRoom) {
				this.targetRemoteUtilization = 0
			}
		}


		console.log("a, targetRemoteUtilization", this, this.targetRemoteUtilization, powerMod)

		// this.targetRemoteUtilization /= powerMod //(1 + 2 * powerMod) / 3
		if (Memory.season3) {
			this.targetRemoteUtilization /= powerMod
		}
		else {
			this.targetRemoteUtilization /= (1 + powerMod) / 2
		}

		console.log("b, targetRemoteUtilization", this, this.targetRemoteUtilization, powerMod)

		if (Memory.boomMode) {
			this.targetRemoteUtilization *= 1.05
		}

		// So many other things to do - hauling points and removing walls
		if (Memory.season1) {
			if (this.mem.closestDropOff && Memory.rooms[this.mem.closestDropOff].seasonDropOffAvailable) {
				// Going to want to score. Hard to say exactly how many parts we need for that.
				// Call it 150 body parts. 
				let numSharedWith = 0
				for (let room of Game.myRooms) {
					if (room.mem.closestDropOff && Memory.rooms[room.mem.closestDropOff].seasonDropOffAvailable) {
						numSharedWith++
					}
				}
				this.targetRemoteUtilization -= Math.round((200 * CREEP_SPAWN_TIME) / numSharedWith)
			}
			else if (this.effectiveLevel >= 7) {
				// Digging is 100 body parts at RCL 7+. 
				this.targetRemoteUtilization -= 100 * CREEP_SPAWN_TIME
			}
		}

		if (Memory.season5) {
			for (let otherRoom of Game.myRooms) {
				if (otherRoom.mem.supportFrom == this.name && otherRoom.effectiveLevel < 6) {
					this.targetRemoteUtilization = 0			
				}
			}
		}

		// We don't want to be bouncing off this cap. Cool the jets for a little while
		if (this.mem.hardCappedSpawnUtilTime) {
			if (Game.time - this.mem.hardCappedSpawnUtilTime < 20000) {
				this.targetRemoteUtilization *= 0.9 + 0.1 * ((Game.time - this.mem.hardCappedSpawnUtilTime) / 20000)
			}
			else {
				delete this.mem.hardCappedSpawnUtilTime
			}
		}

		// Going to need extra capacity for this, not neccessarily just upgraders as below
		// but base managers and possibly less efficient hauling. Also upgraders not
		// yet spawned
		if (this.upgradeFocus) {
			this.targetRemoteUtilization *= 0.95
			if (Memory.highEnergyUpgrading) {
				this.targetRemoteUtilization *= 0.95
			}
		}

		// Our spawn has more gaps, less need for extension refilling
		// and our haulers should be more efficient and using a bit less
		// utilization than predicted. Each "swap" should avoid 2 steps (saves 4, costs 2)
		if (this.mem.verySmallHaulers) {
			this.targetRemoteUtilization *= 1.1
		}
		else if (this.mem.smallHaulers) {
			this.targetRemoteUtilization *= 1.05
		}
		else if (this.mem.mediumHaulers) {
			this.targetRemoteUtilization *= 1.025
		}


		// console.log("b, targetRemoteUtilization", this, this.targetRemoteUtilization)

		if (this.mem.ownedCreeps) {
			// this.targetRemoteUtilization -= Math.min(this.mem.keeperMineRooms.length, (this.mem.ownedCreeps["soloKeeperMiner"] || []).length) * 50 * CREEP_SPAWN_TIME
			// this.targetRemoteUtilization -= Math.min(1, (this.mem.ownedCreeps["miner"] || []).length) * 50 * CREEP_SPAWN_TIME
			this.targetRemoteUtilization -= Math.min(1, (this.mem.ownedCreeps["miner"] || []).length) * creepCreator.getDesignForEnergyCap("miner", this.energyCapacityAvailable, false, 0, true, {}).length * CREEP_SPAWN_TIME
			// this.targetRemoteUtilization -= (this.mem.ownedCreeps["soloCentreMiner"] || []).length * 50 * CREEP_SPAWN_TIME
			this.targetRemoteUtilization -= (this.mem.ownedCreeps["upgrader"] || []).length * creepCreator.getDesignForEnergyCap("upgrader", this.energyCapacityAvailable, false, 0, true, {}).length * CREEP_SPAWN_TIME

			if (global.roomAssaultFromCounts && global.roomAssaultFromCounts[this.name]) {
				// Bit of a hack. Deduct half of our assault spawning, assuming body size is proportional to effective level squared, which it kinda is
				this.targetRemoteUtilization -= 4 * global.roomAssaultFromCounts[this.name].assaultCount * Math.min(MAX_CREEP_SIZE, this.effectiveLevel * this.effectiveLevel) * CREEP_SPAWN_TIME * 2
			}
		}

		// console.log("c, targetRemoteUtilization", this, this.targetRemoteUtilization)

		// this.targetRemoteCPU = 7 * this.defcon / 5;

		this.targetRemoteUtilization -= 10 * this.controller.level * (5 - this.defcon) * numSpawns;

		let currentEnergy = this.calcEffectiveEnergy(false)

		if (currentEnergy > 300000) {
			this.targetRemoteUtilization -= (currentEnergy - 300000) / 1000
			// this.targetRemoteCPU *= 1 - (this.storage.store[RESOURCE_ENERGY] - 0.3e6) / 1e6
		}

		// console.log("d, targetRemoteUtilization", this, this.targetRemoteUtilization)

		// We can hit a state where we have lots of children, but no pioneers.
		if (this.mem.childRooms && this.mem.ownedCreeps) {
			for (var childRoomName of this.mem.childRooms) {
				if (Game.rooms[childRoomName] && Game.rooms[childRoomName].controller.my && Game.rooms[childRoomName].effectiveLevel < 4 && intelAI.getMaxHate() > 10000) {
					if (this.effectiveLevel < 7) {
						this.targetRemoteUtilization -= 50 * this.effectiveLevel;
					}
					else if (this.effectiveLevel == 7) {
						this.targetRemoteUtilization -= 600;
					}
					else {
						this.targetRemoteUtilization -= 900;
					}
				}
			}
		}

		// console.log("e, targetRemoteUtilization", this, this.targetRemoteUtilization)

		let maxUtil = 0.925 - numSpawns * 0.01;

		if (Memory.boomMode) {
			maxUtil += 0.01
		}
		// Bump it if we're spawn usage bound
		if (!Memory.stats.yieldPerCPU) {
			maxUtil += 0.01
		}
		if (_.sum(Memory.stats.hateCounter) < 10000) {
			maxUtil += 0.01
		}
		if (!util.hasSectorGotAStronghold(this.name)) {
			maxUtil += 0.01
		}

		// Not sure why this was here. I think it was to counteract an issue I was seeing with high util
		// on MMO. This was actually caused by a bug in upgradeFocus, so removing this.
		// if (Memory.maxRoomLevel > this.controller.level) {
		// 	maxUtil -= 0.05
		// }

		// console.log("ef, targetRemoteUtilization", this, this.mem.spawnUtilization, maxUtil)


		// Drop if we're really caning the spawn
		if (this.mem.spawnUtilization > maxUtil) {
			console.log(this.name, "hardcapping on spawn util", this.targetRemoteUtilization, this.targetRemoteUtilization * (1 - (this.mem.spawnUtilization - maxUtil) / (1 - maxUtil)))
			this.mem.hardCappedSpawnUtilTime = Game.time
			// Allow it to drop it by up to 25%. This is a bit optimistic on bugs. If everything is accounted for we really sholdn't be targetting 75% to get 100%.
			// Previously we allowed drop to 100%, that tended to correct far too hard
			this.targetRemoteUtilization *= 1 - 0.25 * (this.mem.spawnUtilization - maxUtil) / (1 - maxUtil);
		}
		if (this.mem.spawnUtilization < 0.8) {
			delete this.mem.hardCappedSpawnUtilTime
			this.targetRemoteUtilization *= (1 + 0.8 / this.mem.spawnUtilization) / 2
		}

		// console.log("f, targetRemoteUtilization", this, this.targetRemoteUtilization)

		// Throttle on avg bucket. Throttle high RCL rooms more.
		// this.targetRemoteUtilization *= Math.pow((Memory.stats.avgBucket - 500) / 9500, 0.7 + (numSpawns * 0.1));
		// this.targetRemoteCPU *= Math.pow((Memory.stats.avgBucket - 500) / 9500, 0.9 + (numSpawns * 0.1));

		// Seems we can maintain about 95% of the limit
		// if (Game.cpu.bucket < 9000 && Memory.stats.avgCPU / Game.cpu.limit > 0.95) {
			// Range is 0->1. 0 means 95% CPU used, 1 means 100%.
			// let normalized = 20 * (Memory.stats.avgCPU / Game.cpu.limit - 0.95);
			// this.targetRemoteUtilization *= 1 - normalized;
			// this.targetRemoteCPU *= 1 - normalized;
		// }

		if (this.mem.DT > 0.5) {
			this.targetRemoteUtilization *= 0.75;
			// this.targetRemoteCPU *= 0.9;
		}


		if (this.targetRemoteUtilization < 250 && numSpawns) {
			this.targetRemoteUtilization = 250;
		}

		if (Memory.season2) {
			// Want this one fighting
			if (this.name == "W12S3") {
				this.targetRemoteUtilization = 0
			}
			if (this.name == "W19S8") {
				this.targetRemoteUtilization *= 0.5
			}
		}

		// console.log("g, targetRemoteUtilization", this, this.targetRemoteUtilization)
		// if (this.targetRemoteCPU < 1.) {
		// 	this.targetRemoteCPU = 1.;
		// }

		// console.log(this.name, this.targetRemoteUtilization)
	}



	Room.prototype.isEnemyRoom = function() {
		if (this.mem.invCL) {
			return true
		}
		if (this.controller && this.mem.owner && !this.controller.my) {
			if (Memory.swc && global.whiteList.includes(this.mem.owner)) {
				return false
			}	
			if (Memory.season2 && scouting.isPlayerSoftWhiteListed(this.mem.owner)) {
				return false
			}
			return true
		} 

		return false
	}

	Room.prototype.isMyRoom = function() {
		return (this.controller && this.controller.my);
	}


	Room.prototype.addNumCombatBodyParts = function(numParts) {
		this.targetRemoteUtilization = (this.targetRemoteUtilization || 0) - numParts * CREEP_SPAWN_TIME;

	}

	Room.prototype.restrictOffensiveMissions = function(targetRoomName, renew, lowPriority, highPriority, predictedEnergyCost, ignoreQueue = false, ignoreRCL = false, ignoreUtil = null) {
		// TODO: Think about the ignoreUtil setting
		// The setting is nice because it means we don't overload a spawn room with too many requests
		// It's not nice because in util bound environments (early game) we're trying to get as close to 100% util as possible.
		// I'm going to try setting it to ignore if we're util bound.
		if (ignoreUtil === null) {
			ignoreUtil = Memory.stats.yieldPerCPU === 0
		}

		if (Memory.swc && Memory.banzai) {
			if (Math.random() < 0.001) console.log("Banzai mode in proto.room for swc")
			return false;
		}

		if (Memory.stats.avgBucket < 1000) {
			return true
		}

		if ((Memory.stats.avgBucket < 2000 || (Memory.timedRound && Game.gcl.level + 2 <= _.max(Memory.gclEstimates))) && !renew) {
			if (highPriority) {
				highPriority = false;				
			}
			else if (!lowPriority) {
				lowPriority = true;
			}
			else if (lowPriority) {
				return true;
			}
		}

		if (this.dangerous || this.mem.DT > (lowPriority ? 0.025 : (highPriority ? 0.1 : 0.05))) return true;
		if (!ignoreUtil && this.mem.spawnUtilization > (renew ? 0.975 : (lowPriority ? 0.85 : (highPriority ? 0.95 : 0.9)))) return true;
		if (this.effectiveLevel < this.controller.level) return true;
		if ((this.mem.nukeCount || 0) >= 3 && !Memory.ignoreNukeDefcon) return true;

		if (targetRoomName && scouting.isRoomWhiteListed(targetRoomName)) return true


		let myEnergy = 0;

		if (this.storage) {
			myEnergy += this.storage.store[RESOURCE_ENERGY]
			if (this.factory) {
				myEnergy += this.storage.store[RESOURCE_BATTERY] * 10
			}
		}

		let mod = 1;

		//if (Memory.season5 && Game.gcl.level <= 4) {
		//	mod *= .5
		//}

		// Can use some network energy. 
		if (this.terminal && Memory.terminalNetworkFreeEnergy) {
			let networkFreeEnergyMod = renew ? 1 : highPriority ? 5 : lowPriority ? 20 : 10

			myEnergy += Memory.terminalNetworkFreeEnergy / (Math.sqrt(Game.myRooms.length) * networkFreeEnergyMod);
			if (this.factory) {
				myEnergy += this.terminal.store[RESOURCE_BATTERY] * 10
			}
		}
		else {
			let sourceScore = 0
			for (let roomName of this.mem.goodRooms) {
				sourceScore += roomIntel.getEffectiveNumSources(roomName) * (roomName == this.name ? 1 : 0.5)
			}

			if (sourceScore == 0) {
				return true
			}

			if (sourceScore < 4) {
				mod *= 4 / sourceScore
			}
		}

		if (this.effectiveLevel < Memory.maxRoomLevel && !ignoreRCL) {
			mod *= 1 + (Memory.maxRoomLevel - this.effectiveLevel) * 0.5
		}

		if (Memory.season2 && this.name == "W12S3" && this.mem.attackScore == 0) {

		}
		else if (this.defcon == 1) {
			mod *= 2.5
		}
		else if (this.defcon == 2) {
			mod *= 2
		}
		else if (this.defcon == 3) {
			mod *= 1.5
		}
		else if (this.defcon == 4) {
			mod *= 1.1
		}

		if (Memory.season2 && (this.name == "W19S8" || this.name == "W23S14" || this.name == "W12S3")) {
			if (Math.random() < 0.01) console.log(this.name, "restrict offense hack")
			myEnergy *= 2;
		}

		if (myEnergy < constants.ROOM_ENERGY_NO_RESTRICT * mod || this.upgradeFocus) {			
			let restrictRenew = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE_RENEW;
			let restrictLowP = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE_LOW_P;
			let restrictHighP = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE_HIGH_P;
			let restrictNormal = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE;

			// If we're assaulting a lot compared to CPU cool off. We'll run out of energy!
			// 20 CPU means 1 assault increases mod by 1.25x
			// 100 CPU means 1 assault increases mod by 1.05x
			if (!renew) {				
				if (Memory.stats.avgBucket < 9000) {
					mod *= 1 + 5 * (global.totalAssaultCount || 0) / Game.cpu.limit
				}

				// If we're spending more on combat then we're expecting in profit, cool off
				mod *= Math.max(1, Math.min(2,  2 * (Memory.stats.combatCreepCost || 0) / (Memory.stats.expectedEnergyProfit || 1)))
			}

			// Screw the close neighbours
			if (Memory.botArena && Memory.tick < 0.2e6 && targetRoomName && safeRoute.getSafeRouteCost(this.name, targetRoomName, false, false) < 3) {
				mod *= 0.5 + 0.5 * Memory.tick / 0.2e6
			}

			if (Game.myRooms.Length < 3) {
				mod *= 1.2
			}
			// if (this.effectiveLevel < 7) {
			// 	mod *= 1.5;
			// }
			// else if (this.effectiveLevel < 8) {
			// 	mod *= 1.25;
			// }

			if (Memory.attackMode) {
				mod *= 0.8
			}

			if (Memory.boomMode) {
				// Just don't.
				if (lowPriority) {
					mod *= 2
				}
				else if (highPriority) {
					mod *= 1.1
				}
				else if (!renew) {
					mod *= 1.5
				}
			}

			if (Memory.economyArena) {
				mod *= 2;
			}

			// Realisticly our attacks are not going to be as expensive
			// so we can go at lower energy.
			// if (this.effectiveLevel == 4) {
			// 	mod *= 0.7;
			// }
			// else if (this.effectiveLevel == 5) {
			// 	mod *= 0.8;
			// }
			if (this.upgradeFocus) {
				if (lowPriority) {
					mod *= 5
				}
				else if (highPriority) {
					mod *= 2
				}
				else if (renew) {
					mod *= 1.5
				}
				else {
					mod *= 3
				}

				// mod *= 3
				if (!this.storage) {
					return true;
				}
			}

			// Cool a bit as I approach next level.
			if (this.controller.level < 8 && this.controller.progress / this.controller.progressTotal > 0.8) {
				mod *= 1 + (((this.controller.progress / this.controller.progressTotal) - 0.8) / 0.2)
			}

			// Cool if spawn util is high
			if (this.mem.spawnUtilization > 0.85 && !ignoreUtil) {
				mod *= 1 + (this.mem.spawnUtilization - 0.85) / 0.15
			}

			// Global spend. Try to keep the economy running.
			let combatSpendRatio = (Memory.stats.combatCreepCost || 1) / (Memory.stats.econCreepCost || 1)

			if (combatSpendRatio > 0.5) {
				mod *= 1 + 0.5 * (combatSpendRatio - 0.5)
			}

			// Recently triggered a safe mode. Cool down a bit against everybody else.
			if (_.max(Object.values(Memory.combatManager.assaultSafeModeTriggered || {})) > Game.time - 25000) {
				if (!Memory.rooms[targetRoomName] || Game.time - (Memory.combatManager.assaultSafeModeTriggered[Memory.rooms[targetRoomName].owner] || -25000) > 25000) {
					if (lowPriority) {
						mod *= 1.8
					}
					else if (highPriority) {
						mod *= 1.2
					}
					else {
						mod *= 1.5
					}
				}
			}

			

			restrictRenew *= mod;
			restrictLowP *= mod;
			restrictHighP *= mod;
			restrictNormal *= mod;

			// console.log(myEnergy, mod, restrictHighP)

			if (myEnergy < (renew ? restrictRenew : (lowPriority ? restrictLowP : (highPriority ? restrictHighP : restrictNormal)))) {
				// Normally we'd restrict, but if it's cheap we can do it anyway.
				if (predictedEnergyCost !== undefined) {
					if (myEnergy < predictedEnergyCost * 10 * mod) {
						return true;
					}
				}
				else {
					return true;
				}
			}
		}

		if (!renew && this.find(FIND_MY_CONSTRUCTION_SITES).length) {
			return true
		}

		if (ignoreQueue) {
			return false
		}


		// for (let childRoomName of (this.mem.childRooms || [])) {
		// 	if (Game.rooms[childRoomName] && Game.rooms[childRoomName].controller.my) {
		// 		if (Game.rooms[childRoomName].effectiveLevel < Game.rooms[childRoomName].controller.level) {
		// 			return true;
		// 		}
		// 	}
		// }

		// Shorter queues for fewer spawns as we're often spawning max size creeps which is tricky.
		var maxQueue
		if (this.effectiveLevel == 7) {
			maxQueue = 3;
		}
		else if (this.effectiveLevel == 8) {
			maxQueue = 6;
		}
		else {
			maxQueue = 1;
		}

		if (lowPriority) {
			maxQueue *= 0.75;
		}
		if (highPriority) {
			maxQueue *= 1.25;
		}

		let numPriorityBuilds = _.sum(_.values(this.mem.priorityBuilds));

		if (numPriorityBuilds >= maxQueue) {
			// Refine a bit
			let spawns = this.spawns;
			for (let spawn of spawns) {
				if (!spawn.spawning) {
					maxQueue++;
				}
				for (let effect of (spawn.effects || [])) {
					if (effect.power == PWR_OPERATE_SPAWN) {
						maxQueue /= POWER_INFO[PWR_OPERATE_SPAWN].effect[effect.level - 1]
					}
				}
			}
			if (numPriorityBuilds >= maxQueue) {
				return true;
			}
		}

		return false;
	}

	Room.prototype.restrictOffensiveMissionsTEST = function(targetRoomName, renew, lowPriority, highPriority, predictedEnergyCost) {
		/*if (Memory.swc) {
			if (Math.random() < 0.001) console.log("Banzai mode in proto.room for swc")
			return false;
		}*/

		if (Memory.stats.avgBucket < 2000 && !renew) {
			if (highPriority) {
				highPriority = false;				
			}
			else if (!lowPriority) {
				lowPriority = true;
			}
			else if (lowPriority) {
				return true;
			}
		}

		if (this.dangerous || this.mem.DT > (lowPriority ? 0.025 : (highPriority ? 0.1 : 0.05))) {
			console.log("ROM Danger")
			return true;
		}
		if (this.mem.spawnUtilization > (renew ? 0.975 : (lowPriority ? 0.85 : (highPriority ? 0.95 : 0.9)))) {
			console.log("ROM US")
			return true;
		}
		if (this.effectiveLevel < this.controller.level) {
			console.log("ROM level")
			return true;
		}
		if ((this.mem.nukeCount || 0) >= 3) {
			console.log("ROM nukeCount")
			return true;
		}

		if (targetRoomName && scouting.isRoomWhiteListed(targetRoomName)) {
			console.log("ROM white")
			return true
		}

		let restrictRenew = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE_RENEW;
		let restrictLowP = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE_LOW_P;
		let restrictHighP = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE_HIGH_P;
		let restrictNormal = constants.ROOM_ENERGY_RESTRICT_OFFENSIVE;

		let mod = 1;

		// Screw the neighbours
		if (Memory.botArena && Memory.tick < 0.2e6) {
			mod *= Memory.tick / 0.2e6
		}
		// Realisticly our attacks are not going to be as expensive
		// so we can go at lower energy.
		if (this.effectiveLevel == 4) {
			mod *= 0.6;
		}
		else if (this.effectiveLevel == 5) {
			mod *= 0.8;
		}
		if (this.upgradeFocus) {
			mod *= 3
			if (!this.storage) {
				console.log("ROM upgradeFocus")
				return true;
			}
		}

		// Cool a bit as I approach next level.
		if (this.controller.level < 8 && this.controller.progress / this.controller.progressTotal > 0.8) {
			mod *= 1 + (((this.controller.progress / this.controller.progressTotal) - 0.8) / 0.2)
		}

		// Recently triggered a safe mode. Cool down a bit against everybody else.
		if (_.max(Object.values(Memory.combatManager.assaultSafeModeTriggered || {})) > Game.time - 25000) {
			if (!Memory.rooms[targetRoomName] || Game.time - (Memory.combatManager.assaultSafeModeTriggered[Memory.rooms[targetRoomName].owner] || -25000) > 25000) {
				mod *= 1.5;
			}
		}

		// console.log(mod)

		restrictRenew *= mod;
		restrictLowP *= mod;
		restrictHighP *= mod;
		restrictNormal *= mod;

		let myEnergy = 0;

		if (this.storage) {
			myEnergy += this.storage.store[RESOURCE_ENERGY]
		}

		// Can use some network energy. 
		if (this.terminal) {
			myEnergy += Memory.terminalNetworkFreeEnergy / (Math.sqrt(Game.myRooms.length) * (renew ? 1 : 10));
		}

		if (myEnergy < (renew ? restrictRenew : (lowPriority ? restrictLowP : (highPriority ? restrictHighP : restrictNormal)))) {
			// Normally we'd restrict, but if it's cheap we can do it anyway.
			if (predictedEnergyCost !== undefined) {
				if (myEnergy < predictedEnergyCost * 10 * mod) {
					console.log("ROM energy 1")
					return true;
				}
			}
			else {
				console.log("ROM energy 2")
				return true;
			}
		}
		// for (let childRoomName of (this.mem.childRooms || [])) {
		// 	if (Game.rooms[childRoomName] && Game.rooms[childRoomName].controller.my) {
		// 		if (Game.rooms[childRoomName].effectiveLevel < Game.rooms[childRoomName].controller.level) {
		// 			return true;
		// 		}
		// 	}
		// }

		// Shorter queues for fewer spawns as we're often spawning max size creeps which is tricky.
		var maxQueue
		if (this.effectiveLevel == 7) {
			maxQueue = 3;
		}
		else if (this.effectiveLevel == 8) {
			maxQueue = 6;
		}
		else {
			maxQueue = 1;
		}

		if (lowPriority) {
			maxQueue *= 0.75;
		}
		if (highPriority) {
			maxQueue *= 1.25;
		}

		// Things already spawning at high priority. Give it a rest.
		if (_.sum(_.values(this.mem.priorityBuilds)) >= maxQueue) {
			console.log("ROM queue")
			return true;
		}

		return false;
	}

	Room.prototype.restrictDefensiveMissions = function(selfDefense, roomDefense, ignoreEnergy) {
		if ((this.controller.safeMode || 0) > 300 && selfDefense) {
			return false; // A bit of a hack. If we're under safe mode it shouldn't spawn many creeps.
		}
		if (this.mem.spawnUtilization > 0.975 - (this.upgradeFocus ? 0.05 : 0) && !selfDefense) {
			console.log("Max util")
			return true;	
		} 
		if (!ignoreEnergy) {
			let myEnergy = 0;

			if (this.storage) {
				myEnergy += this.storage.store[RESOURCE_ENERGY]
			}

			// Can use some network energy. 
			if (this.terminal) {
				myEnergy += Memory.terminalNetworkFreeEnergy / (Math.sqrt(Game.myRooms.length) * 10);
			}

			if (!selfDefense && this.storage && (myEnergy < (roomDefense ? 20000 : 10000))) {
				console.log("Lacking energy")
				return true;
			}
		}
		if (!selfDefense && this.effectiveLevel < this.controller.level) {
			console.log("Low eff level")
			return true;	
		} 
		if (!selfDefense && (this.mem.attackScore || 0) > 10000) {
			console.log("Attack score")
			return true;
		}

		var maxQueue
		if (this.effectiveLevel == 7) {
			maxQueue = selfDefense ? 4 : 2;
		}
		else if (this.effectiveLevel == 8) {
			maxQueue = selfDefense ? 6 : 2;
		}
		else {
			maxQueue = 2;
		}

		// Things already spawning at high priority. Give it a rest.
		if (_.sum(_.values(this.mem.priorityBuilds)) >= maxQueue) {
			console.log(this, "max queue")
			return true;
		}

		return false;
	}

	Room.prototype.restrictPowerMissions = function(powerAmount) {
		// return false
		// if (this.mem.resources && (this.mem.resources[RESOURCE_POWER] || 0) > 3 * powerAmount * (10 - Memory.saleLevel)) return true;
		if (Memory.swc) return true;
		// if (Memory.season2) return true
		if (Memory.disablePower) return true
		if (Memory.noTerminals) return true
		if (Memory.season && !Memory.season3 && !Memory.season4 && powerAmount < (this.restrictOffensiveMissions(undefined, false, true, false, undefined, false, true) ? 5000 : 7500)) return true
		if (Memory.season && Memory.stats.globalResources[RESOURCE_POWER] > util.getPowerRequiredToReachLevel(constants.SEASON_GPL_TARGET) + Game.myRooms.length * 100) return true
		if (Memory.privateServer && !Memory.season && this.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, 10000)) return true;

		if (Memory.economyArena) return true;

		if (!Memory.season3 && Memory.maxRoomLevel != 8) return true;
		if (!Memory.season3 && this.effectiveLevel < 7) return true;

		let refreshPriority = false
		let highPriority 
		let lowPriority
		// Added s4 after I hit 100% RCL 8
		if (Memory.season3) {
			refreshPriority = powerAmount > 5000;
			highPriority = !refreshPriority && powerAmount > 3000;
			lowPriority = powerAmount < 1500;
			lowPriority = false
			if (powerAmount < 1000) {
				return true
			}
		}
		else if (Memory.season4) {
			return true
			if (powerAmount < 9000 || Game.gpl.level == 70) {
				return true
			}
			refreshPriority = powerAmount > 8000 + (Memory.stats.globalResources[RESOURCE_POWER] || 0) / 50;
			highPriority = !refreshPriority && powerAmount > 6000 + (Memory.stats.globalResources[RESOURCE_POWER] || 0) / 50;
			lowPriority = powerAmount < 4000 + (Memory.stats.globalResources[RESOURCE_POWER] || 0) / 50;
			if (powerAmount < 2000 + (Memory.stats.globalResources[RESOURCE_POWER] || 0) / 50) {
				return true
			}
		}
		else {
			highPriority = Game.gpl.level == 0 || ((Game.gpl.level < 5) && powerAmount > 5000) || powerAmount > 7500;
			lowPriority = Game.gpl.level >= 5 && powerAmount < 5000 && !highPriority;
		}

		if (Memory.season && !Memory.season3 && !Memory.season4 && !Memory.season5) {
			if (highPriority) {
				highPriority = false;
			}
			else {
				lowPriority = true;
			}
		}
		// Really don't want to stall processing.
		if (Memory.season3 && this.effectiveLevel >= 5) {
			// Going to take me 4000 ticks or so to get the power home. Don't want to stall out the power spawn
			if (!this.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, 4000)) {
				if (lowPriority) {
					highPriority = true
					lowPriority = false
				}
				else {
					lowPriority = false
					highPriority = false
					refreshPriority = true
				}
			}
			// A bit of headroom, but not as much as I'd like
			else if (!this.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, 8000)) {				
				if (highPriority) {
					refreshPriority = true
					highPriority = false
				}
				else if (lowPriority) {
					lowPriority = false
				}
				else {
					highPriority = true
				}
			}
		}

		// Happy to starve remotes to get it done
		let ignoreUtil = !lowPriority && this.goodRooms.length > 2	
		let ignoreQueue = !lowPriority && this.goodRooms.length > 2	

		// targetRoomName, renew, lowPriority, highPriority, predictedEnergyCost
		return this.restrictOffensiveMissions(undefined, refreshPriority, lowPriority, highPriority, undefined, ignoreQueue, true, ignoreUtil)
	}

	Room.prototype.restrictDepositMissions = function(renew = false) {
		if (Memory.season && !Memory.season4) return true
		// High priorty. They make £££
		// Ignore spawn util on season 4
		// Not sure how I feel about spawn util ignoring in general. 
		return this.restrictOffensiveMissions(undefined, renew, false, !renew, undefined, false, false, Memory.season4)
	}


	Room.prototype.isUnderUtilized = function() {
		if (this.mem.spawnUtilization < 0.8 && this.storage && this.storage.store[RESOURCE_ENERGY] >= 200000 && _.sum(_.values(this.mem.priorityBuilds)) == 0) {
			return true;
		}
		return false;
	}

	// This is used for launching new missions
	Room.prototype.canSupportBodyCount = function(numParts, renew = false) {
		let powerMod = 1;
		for (let powerCreepName of (this.mem.assignedPowerCreeps || [])) {
			if (Game.powerCreeps[powerCreepName].room && Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN]) {
				if (Memory.season && Game.powerCreeps[powerCreepName].level < 9) {
					continue
				}
				else {				
					powerMod = Math.min(powerMod, POWER_INFO[PWR_OPERATE_SPAWN].effect[Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_SPAWN].level - 1])
				}
			}
		}

		if (Memory.season3) {
			numParts *= powerMod
		}
		else {
			numParts *= (1 + powerMod) / 2
		}

		if (Game.time - (this.mem.spawningHeavyMission || -2000) < 2000) {
			numParts *= 2;
		}

		console.log("Calculated num parts", numParts)

		let maxPercent = 0.45 - 0.05 * this.spawns.length



		// WTF. Don't use more than a high % of my spawn time on one mission. Just don't!
		if (numParts > maxPercent * this.spawns.length * (CREEP_LIFE_TIME / CREEP_SPAWN_TIME)) {
			return false;
		}
		if (this.effectiveLevel < 3) {
			return false;
		}
		// If we have more than 200k banked, who cares about spawn util.
		if (this.storage && this.storage.store[RESOURCE_ENERGY] > 200000) {
			return true;
		}

		if (this.targetRemoteUtilization === undefined) {
			this.calculateTargetRemoteUtilization()
		}

		// 500 is enough to be going on with
		if (this.targetRemoteUtilization - numParts * CREEP_SPAWN_TIME > 500) {
			return true;
		}
		if (this.mem.spawnUtilization > (renew ? 0.975 : 0.95)) {
			return false;
		}

		if (this.storage && this.storage.store[RESOURCE_ENERGY] > 10000) {
			return true;
		}
		else {
			return false;
		}
	}

	Room.prototype.regenSourceCast = function(level, source) {
		this.mem.lastRegenSourceUsed = this.mem.lastRegenSourceUsed || {}
		this.mem.lastRegenSourceUsed[source.id] = {t: Game.time, l: level}
	}


	Room.prototype.opSpawnCast = function(level) {
		this.mem.lastOpSpawnUsed = {t: Game.time, l: level}
	}



	Room.prototype.manageLinks = function() {
		if (this.controller.level < 5) return

		// At 8 we don't need links to be fast
		if ((this.effectiveLevel < 8 || Math.random() < 0.25 || (this.mem.spawnUtilization > 0.75 && this.energyAvailable != this.energyCapacityAvailable)) && (Game.cpu.bucket > 4000 || (Game.cpu.bucket > 2000 && Game.time % 2 == 0) || (Game.time % 4 == 0))) {
			let links = this.links
			if (links.length < 2) return;
			links = _.shuffle(links);

			if (Math.random() < 0.1 || !global.roomData[this.name].spawnBatteryStatus) {
				let containers = roomAI.getSpawnBatteryContainers(this)

				let totalEnergy = 0;
				for (let container of containers) {
					totalEnergy += container.store.getUsedCapacity()
				}

				global.roomData[this.name].spawnBatteryStatus = totalEnergy / (2 * CONTAINER_CAPACITY);
			}

			// var dropOffLinks = []
			var harvestLinks = []
			var energyStartLinks = []
			var targetLinks = []

			for(var link of links) {
				if (link.cooldown) continue
				if (roomAI.isHarvesterLink(link)) {
					if (link.energy < 200) continue
					harvestLinks.push(link);
				}
				else if (roomAI.isHaulerLink(link)) {
					if (link.energy) {
						harvestLinks.push(link);	
					}
				}
				else if (roomAI.isEnergyStartPoint(link)) {
					// If it's empty and we're RCL 8, treat as a destimation not a source
					if (this.effectiveLevel == 8 && ((link.energy == 0 && this.energyAvailable == this.energyCapacityAvailable) || global.roomData[this.name].spawnBatteryStatus > 0.75) && (this.mem.ownedCreeps["upgrader"] || []).length == 0) {
						targetLinks.push(link)
					}
					else {						
						energyStartLinks.push(link);	
					}
				}
				else {
					// Skip if controller link nearly empty and spawn battery is fine
					let skip = false;
					if (global.roomData[this.name].spawnBatteryStatus > 0.5 && 
						this.effectiveLevel < 8 && 
						!this.restrictUpgraders && 
						(this.mem.ownedCreeps["upgrader"] || []).length && 
						!roomAI.isControllerLink(link)) {
						
						let controllerLink
						for (let otherLink of links) {
							if (roomAI.isControllerLink(otherLink)) {
								controllerLink = otherLink
								break
							}
						}
						if (controllerLink && controllerLink.energy < LINK_CAPACITY / 2) {
							skip = true;
						}
					}

					if (!skip) {
						targetLinks.push(link)
					}
				}
			}

			// console.log(this, targetLinks)

			var linkTargets = [];

			/*for(var link of dropOffLinks) {
				if (link.cooldown != 0 || link.energy == 0) continue
				handleLink(link, links, linkTargets)
			}*/

			function handleLink(link) {
				// Go to energy end points first
				for(var link2 of targetLinks) {
					// if (link2 == link) continue
					if (linkTargets.includes(link2)) continue

					// isEnergyEndPoint is implicit
					// Don't have to be a complete transfer. Send if target link is near empty
					if (link2.energyCapacity - link2.energy >= link.energy || link2.energy < link2.energyCapacity * 0.1) {
					// if (link2.energyCapacity - link2.energy >= link.energy && roomAI.isEnergyEndPoint(link2)) {
						link.transferEnergy(link2)
						linkTargets.push(link2)
						return
					}

					// Dropoff links to anywhere they can go.
					// AFAIK I have no links this actually does anything with
					// if (!roomAI.isDropoffPoint(link2)) {
					// 	if (link2.energyCapacity - link2.energy >= link.energy) {
					// 		link.transferEnergy(link2)
					// 		linkTargets.push(link2)
					// 		// Wake up managers, as they may have to do something.
					// 		var managers = (link.room.mem.ownedCreeps["baseManager"] || [])
					// 		if (managers.length) {
					// 			for (var managerName of managers) {
					// 				if (!Game.creeps[managerName]) continue
					// 				if (Game.creeps[managerName].mem.wT == Game.time) {
					// 					Game.creeps[managerName].mem.wT = Game.time + 1
					// 				}
					// 				else {
					// 					// Don't put it to sleep if it's already awake!
					// 					Game.creeps[managerName].mem.wT = Math.min(Game.creeps[managerName].mem.wT || 0, Game.time + 1);
					// 				}
					// 			}
					// 		}

					// 		return
					// 	}
					// }
				}
			}


			for(var link of harvestLinks) {
				handleLink(link)
			}
			for(var link of energyStartLinks) {
				handleLink(link)
			}
		}
	}


	Room.prototype.managePowerProcessing = function() {

		if (this.controller.level >= (Memory.season3 ? 5 : 8) && (Game.cpu.bucket > 2000 || Memory.season3)) {
			// console.log(this, "a")
			if (!this.storage || (!this.terminal && !Memory.season3) || (this.defcon != 5 && !Memory.season3)) return
			// console.log(this, "b")	
			if (Memory.disablePower) return
			// console.log(this, "c")
			if ((this.storage.store[RESOURCE_POWER] || 0) == 0 && this.terminal && (this.terminal.store[RESOURCE_POWER] || 0) == 0) {
				return;
			}

			if (Game.time - (this.mem.spawningHeavyMission || -2000) < 2000 && !Memory.season3 && !Memory.season4) {
				return
			}

			// if (Memory.season1 && Memory.stats.energyExpenditures.upgradeController < 250 && Game.gcl.level < 7) {
			// 	return
			// }

			// console.log(this, "d")
			// Could use isRoomAssaulting but that's expensive. 
			// TODO: Should probably optimize isRoomAssaulting by marking it from relavent missions then checking that mark, rather than looping through all missions
			//  I think this is covered by the "spawning heavy mission"
			// let myAssaultsFromHere = (global.boostedRoomAssaultFromCounts && global.boostedRoomAssaultFromCounts[this.name]) ? (global.boostedRoomAssaultFromCounts[this.name].assaultCount || 0) : 0
			// if (myAssaultsFromHere) return

			if (((Memory.stats.globalResources[RESOURCE_ENERGY] / Game.myRooms.length) || this.calcEffectiveEnergy(false)) < 0.5 * constants.ROOM_ENERGY_PROCESS_POWER / (Memory.powerBoom ? 2 : 1)) {
				if (this.storage.store.getUsedCapacity() < 950000) {
					return false
				}
			}

			// console.log(this, "e")
			let powerSpawn = this.powerSpawn;
			let processing = false;
			if (powerSpawn && ((powerSpawn.power || 0) >= 10 || (this.calcEffectiveEnergy(false) > (constants.ROOM_ENERGY_PROCESS_POWER / (Memory.powerBoom ? 2 : 1)) || this.storage.store.getUsedCapacity() > 950000))) {
				global.processingPower = true;
				this.processingPower = true;
				processing = true;
				if (powerSpawn.processPower() == OK) {
					Memory.stats.processingPower[this.name] = (Memory.stats.processingPower[this.name] || 0) * 0.99 + 0.01
					this.processedPower = 1

					global.inTickObject.energyExpenditures["powerProcess"] = (global.inTickObject.energyExpenditures["powerProcess"] || 0) + POWER_SPAWN_ENERGY_RATIO
				}
			}
			// console.log(this, "f", processing, this.calcEffectiveEnergy(false), constants.ROOM_ENERGY_PROCESS_POWER)

			if (processing && (this.mem.ownedCreeps["powerShuffler"] || []).length == 0) {
				var spawns = this.spawns;

				var currentlySpawning = false;
				for (let spawn of spawns) {
					if (spawn.memory.currentBuildingRole == "powerShuffler") {
						currentlySpawning = true;
						break;
					}
				}

				if (!currentlySpawning && spawns[0]) {
					if (!spawns[0].hasPrioritySpawn("powerShuffler")) {
						spawns[0].addPrioritySpawn("powerShuffler")
					}
				}
			}
		}

	}

	Room.prototype.hasPowerCreepForFactory = function() {
		for (let effect of (this.factory.effects || [])) {
			if (effect.effect == PWR_OPERATE_FACTORY) {
				return true;
			}
		}
		for (let powerCreepName of this.mem.assignedPowerCreeps) {
			if (Game.powerCreeps[powerCreepName].room && Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_FACTORY] && Game.powerCreeps[powerCreepName].powers[PWR_OPERATE_FACTORY].level == this.factory.level) {
				return true
			}
		}
		return false
	}

	Room.prototype.manageFactory = function() {
		if (!this.storage || !this.terminal || !this.factory) return

		Memory.stats.factoryStats = Memory.stats.factoryStats || {}
		// TODO: Put this on produce
		Memory.stats.factoryStats[this.mem.factoryTargetPower ? (this.factory.level || 0) : 0] += (1 - constants.FACTORY_STATS_ALPHA) * (this.factory.cooldown ? 1 : 0)

		Memory.commoditiesManager.maxFactoryLevel = Math.max((this.factory.level || 0), (Memory.commoditiesManager.maxFactoryLevel || 0))

		if (!this.factory.cooldown && (this.mem.factoryTarget || this.mem.factoryTargetPower)) {
			let ret = -Infinity;
			if (this.mem.factoryTargetPower) {
				ret = this.factory.produce(this.mem.factoryTargetPower)
				if (ret == OK) {
					this.mem.forceRefreshFactory = 1
					this.factory.produced = 1
					global.inTickObject.energyExpenditures["factory"] = (global.inTickObject.energyExpenditures["factory"] || 0) + (COMMODITIES[this.mem.factoryTargetPower].components[RESOURCE_ENERGY] || 0)
					global.inTickObject.energyExpenditures["factory_" + this.mem.factoryTargetPower] = (global.inTickObject.energyExpenditures["factory_" + this.mem.factoryTargetPower] || 0) + (COMMODITIES[this.mem.factoryTargetPower].components[RESOURCE_ENERGY] || 0)
				}
			}

			if (this.mem.factoryTarget && ret != OK) {
				ret = this.factory.produce(this.mem.factoryTarget)
				if (ret == OK) {
					this.mem.forceRefreshFactory = 1
					this.factory.produced = 1
					global.inTickObject.energyExpenditures["factory"] = (global.inTickObject.energyExpenditures["factory"] || 0) + (COMMODITIES[this.mem.factoryTarget].components[RESOURCE_ENERGY] || 0)
					global.inTickObject.energyExpenditures["factory_" + this.mem.factoryTarget] = (global.inTickObject.energyExpenditures["factory_" + this.mem.factoryTarget] || 0) + (COMMODITIES[this.mem.factoryTarget].components[RESOURCE_ENERGY] || 0)
					if (this.mem.factoryTarget == RESOURCE_BATTERY) {
						global.inTickObject.energyExpenditures["factory"] = (global.inTickObject.energyExpenditures["factory"] || 0) - COMMODITIES[this.mem.factoryTarget].amount * 10
						global.inTickObject.energyExpenditures["factory_" + this.mem.factoryTarget] = (global.inTickObject.energyExpenditures["factory_" + this.mem.factoryTarget] || 0) - COMMODITIES[this.mem.factoryTarget].amount * 10
					}
				}
			}
		}

		if ((Math.random() < 0.025 && !this.factory.cooldown) || this.factory.cooldown == 20 || this.factory.cooldown == 100 || this.mem.forceRefreshFactory) {
			// console.log("manageFactory2")
			delete this.mem.factoryTarget
			delete this.mem.factoryTargetPower
			delete this.mem.factoryPowerMissingResource
			delete this.mem.factoryPowerBlockedChain
			delete this.mem.factoryMissingResource
			delete this.mem.factoryBlockedChain
			delete this.mem.forceRefreshFactory

			if (this.clearTerminal) return

			// Wake up storage sitters
			if (this.mem.ownedCreeps && this.mem.ownedCreeps["storageSitter"]) {
				for (let name of this.mem.ownedCreeps["storageSitter"]) {
					delete Memory.creeps[name].wT
				}
			}


			Memory.commoditiesManager.missingResources = Memory.commoditiesManager.missingResources || {};

			let batteryMod = 1
			// if (this.restrictUpgraders && Memory.numRCL7Plus > 1) {
			// 	batteryMod = Memory.season ? 0.5 : 0.75;
			// }

			let storedEnergy = this.getStoredEnergy()

			let currentlyOperatedMod = 1;
			let operated = false;
			if (this.factory.effects) {				
				for (let effect of this.factory.effects) {
					if (effect.power == PWR_OPERATE_FACTORY) {
						currentlyOperatedMod = 0.5;
						operated = true;
						break
					}
				}
			}

			// If we're low on energy, unpack it.
			if (!Memory.season4 || !operated) {

				if (storedEnergy < constants.ROOM_ENERGY_CONVERT_FROM_BATTERIES * currentlyOperatedMod * batteryMod && 
					this.hasAtLeastXOfResource(RESOURCE_BATTERY, 100)) {
					this.mem.factoryTarget = RESOURCE_ENERGY;
					if (!this.factory.cooldown && !this.factory.produced) {
						if (this.factory.produce(this.mem.factoryTarget) == OK) {							
							this.mem.forceRefreshFactory = 1
							this.factory.produced = 1
						}
					}
					return
				}
				if (storedEnergy < constants.ROOM_ENERGY_CONVERT_FROM_BATTERIES_MANY_BATTERIES * currentlyOperatedMod * batteryMod && 
					this.hasAtLeastXOfResource(RESOURCE_BATTERY, constants.BATTERY_RESERVE_SIZE * 2 / currentlyOperatedMod)) {
					this.mem.factoryTarget = RESOURCE_ENERGY;
					if (!this.factory.cooldown && !this.factory.produced) {
						if (this.factory.produce(this.mem.factoryTarget) == OK) {							
							this.mem.forceRefreshFactory = 1
							this.factory.produced = 1
						}
					}
					return
				}

				// console.log("manageFactory3")


				// Low on minerals, unpack
				for (let commodityType of [RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM, RESOURCE_GHODIUM, RESOURCE_OXYGEN, RESOURCE_HYDROGEN, RESOURCE_CATALYST]) {
					let current = this.getCurrentOfResource(commodityType)
					if (current > constants.MAX_AMOUNT_BEFORE_DEBAR * currentlyOperatedMod && (current > 2 * constants.MAX_AMOUNT_BEFORE_DEBAR * currentlyOperatedMod || current > this.getCurrentOfResource(util.getBar(commodityType)))) {
						continue;
					}

					let fail = false;
					let components = COMMODITIES[commodityType].components;
					for (let componentType in components) {
						if (componentType == RESOURCE_ENERGY && storedEnergy < constants.ROOM_ENERGY_NO_DEBARRING) {
							fail = true;
							break;
						}
						if (this.getCurrentOfResource(componentType) < components[componentType]) {
							fail = true;
							break;
						}
						if ((!Memory.season || Memory.season4) && util.getDeBar(componentType) && this.getCurrentOfResource(componentType) < constants.MIN_BAR_AMOUNT + 500) {
							fail = true;
							break;
						}
					}
				

					if (fail) continue;

					this.mem.factoryTarget = commodityType;
					if (!this.factory.cooldown && !this.factory.produced) {
						if (this.factory.produce(this.mem.factoryTarget) == OK) {							
							this.factory.produced = 1
							this.mem.forceRefreshFactory = 1
						}
					}
					return
				}			

				// Low on bars, pack
				if (!Memory.season || Memory.season4) {				
					for (let commodityType of [RESOURCE_UTRIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_ZYNTHIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_GHODIUM_MELT, RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_PURIFIER]) {
						let current = this.getCurrentOfResource(commodityType)
						if (current >= constants.MIN_BAR_AMOUNT * currentlyOperatedMod) {
							continue;
						}

						let fail = false;
						let components = COMMODITIES[commodityType].components;
						for (let componentType in components) {
							if (this.getCurrentOfResource(componentType) < components[componentType]) {
								fail = true;
								break;
							}
						}		

						if (fail) continue;

						this.mem.factoryTarget = commodityType;
						if (!this.factory.cooldown && !this.factory.produced) {
							if (this.factory.produce(this.mem.factoryTarget) == OK) {								
								this.factory.produced = 1
								this.mem.forceRefreshFactory = 1
							}
						}
						return
					}
				}
			}

			let produced = false;
			// console.log("manageFactory4")

			// Now... production chains. Only fancy factories.
			if (this.factory.level) {
				if (this.hasPowerCreepForFactory()) {
					let bestProduct;
					let bestProductScore = Infinity;


					let products = util.getCommoditiesForLevel(this.factory.level)
					for (let commodityType of products) {
						let baseResourcesUsed = []

						// let currentAmount = this.getCurrentOfResource(commodityType)
						let currentAmountLocal = this.getCurrentOfResource(commodityType)
						let currentAmount = Memory.stats.globalResources[commodityType] || currentAmountLocal
						let noProfitLimitLocal;
						let noProfitLimit;

						// We actually use more of this stuff than regular products.						
						if (commodityType == RESOURCE_COMPOSITE || commodityType == RESOURCE_CRYSTAL || commodityType == RESOURCE_LIQUID) {
							if (commodityType == RESOURCE_COMPOSITE && Memory.commoditiesManager.maxFactoryLevel < 2) {
								noProfitLimit = 0
								noProfitLimitLocal = 0
							}
							else if (commodityType == RESOURCE_CRYSTAL && Memory.commoditiesManager.maxFactoryLevel < 5) {
								noProfitLimit = 0
								noProfitLimitLocal = 0
							}
							else if (commodityType == RESOURCE_LIQUID && Memory.commoditiesManager.maxFactoryLevel < 4) {
								noProfitLimit = 0
								noProfitLimitLocal = 0
							}
							else {
								if (Memory.season4 && (commodityType == RESOURCE_LIQUID || commodityType == RESOURCE_CRYSTAL)) {
									noProfitLimit = 512
									noProfitLimitLocal = 512
								}
								else {					
									// They're all used at roughly the same rate/tick (1 every 4-6 ticks)
									noProfitLimit = Memory.season4 ? 1024 : 2048
									noProfitLimitLocal = 512
								}
							}

							if (currentAmount > noProfitLimit && currentAmountLocal > noProfitLimitLocal) {
								if (marketTrader.getProfitMargin(this, commodityType, true) < 1.1) {
									continue;
								}
							}
						}
						else {
							if (Memory.season4) {
								// Want to run the whole thing fairly lean so that we don't block high tiers with low tiers
								noProfitLimit = operated || this.factory.level == Memory.commoditiesManager.maxFactoryLevel ? 1e6 : (1024 >> this.factory.level)
								noProfitLimitLocal = noProfitLimit / 2
								let components = COMMODITIES[commodityType].components;
								let cooldown = COMMODITIES[commodityType].cooldown

								let reactionsPer1000 = Math.ceil(1000 / cooldown)

								let inputLimited = false
								for (let componentType in COMMODITIES[commodityType].components) {
									if ((Memory.stats.globalResources[componentType] || 0) < 10 * reactionsPer1000 * components[componentType]) {
										inputLimited = true
										break
									}
									else {
										console.log(commodityType, componentType, (Memory.stats.globalResources[componentType] || 0), reactionsPer1000, components[componentType])
									}
								} 
								if (!inputLimited) {
									console.log(commodityType, "not input limited")
									noProfitLimit = 1e6
									noProfitLimitLocal = 1e6
								}
							}
							else {
								noProfitLimit = (8192 >> (this.factory.level * 2))
								noProfitLimitLocal = noProfitLimit / 2
							}
							if (currentAmount > noProfitLimit && currentAmountLocal > noProfitLimitLocal) {
								if (marketTrader.getProfitMargin(this, commodityType, true) < 1.1) {
									continue;
								}
							}
						}


						let bestInChain = marketTrader.getBestCommoditityInChain(this, commodityType)
						// Is -1 if the commodity type isn't in a chain - eg. composite/crystal/liquid

						if (Memory.season4 || (bestInChain && (bestInChain == -1 || COMMODITIES[bestInChain].level >= this.factory.level))) {
							let components = COMMODITIES[commodityType].components;
							let cooldown = COMMODITIES[commodityType].cooldown

							let reactionsPer1000 = Math.ceil(1000 / cooldown)
							let minAmountToCraft = reactionsPer1000;
							for (let effect of this.factory.effects) {
								if (effect.effect == PWR_OPERATE_FACTORY && effect.ticksRemaining > 50) {
									minAmountToCraft = 1;
								}
							}

							// Are we actually going to make more money than selling all the components?
							// This populates baseRssourcesUsed
							for (let componentType in components) {
								function checkBaseResources(_componentType) {							
									if ([RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST].includes(_componentType)) {
										baseResourcesUsed.push(_componentType);
									}
									// Length >1 as basic minerals and will cause an infinite loop
									else if (COMMODITIES[_componentType] && _componentType.length > 1 && _componentType != RESOURCE_ENERGY) {
										for (let subCompontentType in COMMODITIES[_componentType].components) {
											if (subCompontentType.length > 1) {
												checkBaseResources(subCompontentType);
											}
										}
									}
								}

								checkBaseResources(componentType);
							}

							let fail = false;
							for (let componentType in components) {
								if (componentType == RESOURCE_ENERGY && storedEnergy < constants.ROOM_ENERGY_NO_PRODUCING_POWERED) {
									fail = true;
									break;
								}
								else if (this.getCurrentOfResource(componentType) < components[componentType] * minAmountToCraft) {
									let stuffSent = false;
									for (let amount = 4 * components[componentType] * reactionsPer1000; amount >= 1; amount /= 2) {
										let potentialFeeders = [];
										for (let otherRoom of Game.myRooms) {
											if (otherRoom === this || !otherRoom.terminal) continue;
											// Don't steal from same level factories
											if (otherRoom.factory && (otherRoom.factory.level || 0) == this.factory.level && otherRoom.hasPowerCreepForFactory()) continue;
											// Don't steal from higher level factories trying to do power shit themselves
											if (otherRoom.factory && 
												otherRoom.mem.factoryTargetPower && 
												otherRoom.factory.level && 
												otherRoom.hasPowerCreepForFactory() && 
												otherRoom.factory.level >= this.factory.level && (COMMODITIES[componentType].level || 0) < (otherRoom.factory.level || 0)) continue;
											if (otherRoom.terminal.cooldown) continue;
											if (otherRoom.transferred) continue;

											let amountMod = 2;

											// The closer we are in the chain the more we shold leave - this is because some commodities are used in level + 2
											// and if the earlier stages eat them all, we can end up never getting the top tier stuff.
											if (this.factory.level == 5 || (COMMODITIES[componentType].level || 0) >= (otherRoom.factory ? (otherRoom.factory.level || 0) : 0)) {
												// Take it all. 
												amountMod = 1;
											}
											else if (COMMODITIES[componentType].level) {
												amountMod = 5 - (this.factory.level - COMMODITIES[componentType].level);
											}

											if ((otherRoom.terminal.store[componentType] || 0) >= amountMod * amount && (otherRoom.terminal.store[RESOURCE_ENERGY] || 0) >= amountMod * amount) {
												potentialFeeders.push(otherRoom);
											}
										}

										let minDist = Infinity;
										let bestFeeder;
										for (let feeder of potentialFeeders) {
											let dist = Game.map.getRoomLinearDistance(this.name, feeder.name, true);
											if (dist < minDist) {
												minDist = dist;
												bestFeeder = feeder;
											}
										}

										if (bestFeeder && this.name != global.currentlyUnclaimingRoom) {
											console.log("Terminal send", componentType, bestFeeder.name, "to", this.name, amount, "for factory stuff");
											if (bestFeeder.terminal.send(componentType, amount, this.name) == OK) {
												bestFeeder.transferred = true
												stuffSent = amount >= components[componentType] * reactionsPer1000;
											}
											break;
										}
									}

									fail = !stuffSent;
									if (fail) {
										this.mem.factoryPowerMissingResource = componentType;
										this.mem.factoryPowerBlockedChain = bestInChain;
										this.mem.factoryPowerBlockedStage = commodityType;
										Memory.commoditiesManager.missingResources[componentType] = Game.time
										break;
									}
								}
							}

							if (fail) continue;

							// Minimising score
							let score = currentAmount / noProfitLimit;

							let maxHoldingUpLevel = 0;

							// We're holding up the chain.
							for (let otherRoom of Game.myRooms) {
								if (otherRoom.mem.factoryPowerMissingResource === commodityType) {
									maxHoldingUpLevel = Math.max(maxHoldingUpLevel, otherRoom.factory.level);
								}
							}

							score -= maxHoldingUpLevel * 1000;

							console.log(this, commodityType, score, bestProduct, bestProductScore, currentAmount, noProfitLimit)
							if (score < bestProductScore) {
								bestProduct = commodityType;
								bestProductScore = score;
							}


							// this.mem.factoryTargetPower = commodityType;
							// if (!this.factory.cooldown && !this.factory.produced) {
							// 	if (this.factory.produce(this.mem.factoryTargetPower) == OK) {
							// 		produced = true;
							// 		this.factory.produced = 1
							// 		this.mem.forceRefreshFactory = 1
							// 	}
							// }
							// if (operated) {
							// 	return
							// }						
						}
						else if (!bestInChain) {
							if (Math.random() < 0.01) console.log("Not producing", commodityType, "as value too low")
							for (let componentType of baseResourcesUsed) {
								Memory.commoditiesManager.depositStats.tooExpensive[componentType] = Game.time
							}
						}
					}

					if (bestProduct) {						
						console.log(this, "producing", bestProduct)
						this.mem.factoryTargetPower = bestProduct;
						if (!this.factory.cooldown && !this.factory.produced) {
							if (this.factory.produce(this.mem.factoryTargetPower) == OK) {
								this.factory.produced = 1
								produced = true;
								this.mem.forceRefreshFactory = 1
							}
						}
						if (operated) {
							return
						}
					}
				}
			}

			// console.log(!Memory.season || Memory.season4)

			// All factories can do this
			if (!Memory.season || Memory.season4) {
				let basicProducts = util.getCommoditiesForLevel(0);

				// console.log(this, basicProducts)

				for (let commodityType of basicProducts) {
					let components = COMMODITIES[commodityType].components;

					let fail = false;

					let currentAmount = this.getCurrentOfResource(commodityType)

					// We've got a lot. Only make more if we're going to make money by selling directly.
					if (currentAmount > 8192 && !Memory.season4) {
						if (marketTrader.getProfitMargin(this, commodityType, true) < 1.1) {
							let baseResourcesUsed = []
							function checkBaseResources(_componentType) {							
								if ([RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST].includes(_componentType)) {
									baseResourcesUsed.push(_componentType);
								}
								// Length >1 as basic minerals and will cause an infinite loop
								else if (COMMODITIES[_componentType] && _componentType.length > 1 && _componentType != RESOURCE_ENERGY) {
									for (let subCompontentType in COMMODITIES[_componentType].components) {
										if (subCompontentType.length > 1) {
											checkBaseResources(subCompontentType);
										}
									}
								}
							}

							for (let componentType in components) {
								checkBaseResources(componentType);
							}
							for (let baseResource of baseResourcesUsed) {
								// If we can't sell it directly for profit
								if (Memory.season4 || this.mem.avgExportValues[baseResource] < this.mem.energyPrice * 1.5 * Memory.commoditiesManager.depositStats.energyCost[baseResource] / Memory.commoditiesManager.depositStats.harvested[baseResource]) {
									if (Math.random() < 0.01) console.log("Not producing", commodityType, "as value too low")
									Memory.commoditiesManager.depositStats.tooExpensive[baseResource] = Game.time
								}
							}
							continue;
						}
					}

					for (let componentType in components) {
						// Are we actually going to make more money than selling all the components?
						let bestInChain = marketTrader.getBestCommoditityInChain(this, commodityType)

						if (bestInChain) {
							if (componentType == RESOURCE_ENERGY && storedEnergy < constants.ROOM_ENERGY_NO_PRODUCING) {
								fail = true;
								break;
							}
							else if (this.getCurrentOfResource(componentType) < components[componentType] * 2) {
								let stuffSent = false;
								if (!this.terminal.cooldown) {
									for (let amount = 16 * components[componentType]; amount >= components[componentType] * 2; amount /= 2) {
										let potentialFeeders = [];
										for (let otherRoom of Game.myRooms) {
											if (otherRoom === this || !otherRoom.terminal) continue;
											if (otherRoom.factory && otherRoom.factory.level == this.factory.level) continue;
											if (otherRoom.terminal.cooldown) continue;
											if (otherRoom.transferred) continue;
											if ((otherRoom.terminal.store[componentType] || 0) >= 4 * amount && (otherRoom.terminal.store[RESOURCE_ENERGY] || 0) >= 4 * amount) {
												potentialFeeders.push(otherRoom);
											}
										}

										let minDist = Infinity;
										let bestFeeder;
										for (let feeder of potentialFeeders) {
											let dist = Game.map.getRoomLinearDistance(this.name, feeder.name, true);
											if (dist < minDist) {
												minDist = dist;
												bestFeeder = feeder;
											}
										}

										if (bestFeeder && this.name != global.currentlyUnclaimingRoom) {
											console.log("Terminal send", componentType, bestFeeder.name, "to", this.name, amount, "for factory stuff");
											if (bestFeeder.terminal.send(componentType, amount, this.name) == OK) {
												stuffSent = true;
												bestFeeder.transferred = true
											}
											break;
										}
									}
								}

								fail = !stuffSent;
								if (fail) {
									this.mem.factoryMissingResource = componentType;
									this.mem.factoryBlockedChain = bestInChain;
									Memory.commoditiesManager.missingResources[componentType] = Game.time
									break;
								}
							}
						}
						else {
							fail = true;
						}
					}

					// console.log(commodityType, fail)

					if (fail) continue;

					this.mem.factoryTarget = commodityType;
					if (!this.factory.cooldown && !produced && !this.factory.produced) {
						this.factory.produce(this.mem.factoryTarget)
						this.factory.produced = 1
						this.mem.forceRefreshFactory = 1
					}
					return
				}
			}

			// Bars are worth a lot more than minerals. Unpack and sell. We can then buy minerals...
			// Slight problem: we'll get into an unpack pack cycle as we unpack when low on minerals
			/*if (storedEnergy >= constants.ROOM_ENERGY_NO_BARRING) {		
				let bestBar;
				let bestScore = 0;

				for (let commodityType of [RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM, RESOURCE_GHODIUM, RESOURCE_OXYGEN, RESOURCE_HYDROGEN, RESOURCE_CATALYST]) {
					let bar = util.getBar(commodityType);

					let income = COMMODITIES[bar].amount * this.mem.avgExportValues[bar];

					let cost = 0
					for (let componentType in COMMODITIES[bar].components) {
						if (componentType == RESOURCE_ENERGY) {
							cost += COMMODITIES[bar].components[componentType] * this.mem.energyPrice
						}
						else {
							cost += COMMODITIES[bar].components[componentType] * Math.max(this.mem.avgExportValues[componentType], this.mem.avgImportValues[componentType]);
						}
					}

					// Debar, make money?
					if (income > cost * 2) {
						if (income > bestScore) {
							bestBar = bar;
							bestScore = income;
							console.log("From a debar of", commodityType, this.name, "can make", income, "costing", cost, "profit", income - cost, "by turning it into", bar)
						}
					}
				}

				if (bestBar) {
					this.mem.factoryTarget = bestBar;
					if (!this.factory.cooldown && !produced) {
						this.factory.produce(this.mem.factoryTarget)
					}
					return
				}
			}
*/
			let wantsToDebarForSell = []


			// Debar for £££
			if (!Memory.season) {
				if (storedEnergy >= constants.ROOM_ENERGY_NO_DEBARRING) {		
					let bestDeBar;
					let bestScore = 0;

					// Minerals are worth a lot more than bars. pack and sell. We can then buy bars should we run short
					for (let commodityType of [RESOURCE_UTRIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_ZYNTHIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_GHODIUM_MELT, RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_PURIFIER]) {
						let deBar = util.getDeBar(commodityType);

						let currentAmount = this.getCurrentOfResource(deBar)

						let income = COMMODITIES[deBar].amount * this.mem.avgExportValues[deBar];

						let cost = 0
						for (let componentType in COMMODITIES[deBar].components) {
							if (componentType == RESOURCE_ENERGY) {
								cost += COMMODITIES[deBar].components[componentType] * this.mem.energyPrice
							}
							else {
								cost += COMMODITIES[deBar].components[componentType] * Math.max(this.mem.avgExportValues[componentType], this.mem.avgImportValues[componentType]);
							}
						}

						// Debar, make money?
						if (income > cost) {
							wantsToDebarForSell.push(commodityType)
							// We have sufficient
							if (currentAmount > constants.MARKET_SELL_RESOURCE_AMOUNT * 1.25) continue

							if (income > bestScore && income > cost * 2) {
								bestDeBar = deBar;
								bestScore = income;
								if (Math.random() < 0.1) console.log("From a bar of", commodityType, this.name, "can make", income, "costing", cost, "profit", income - cost, "by turning it into", deBar)
							}
						}
					}
					if (bestDeBar) {
						this.mem.factoryTarget = bestDeBar;
						if (!this.factory.cooldown && !produced && !this.factory.produced) {
							this.factory.produce(this.mem.factoryTarget)
							this.factory.produced = 1
							this.mem.forceRefreshFactory = 1
						}
						return
					}
				}
			}


			let bestBar;
			let bestScore = 0;

			// Pack minerals
			for (let commodityType of [RESOURCE_UTRIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_ZYNTHIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_GHODIUM_MELT, RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_PURIFIER]) {
				// Don't bar them if we want to sell them
				if (wantsToDebarForSell.includes(commodityType)) continue

				let urgent = Game.time - (Memory.commoditiesManager.missingResources[commodityType] || 0) < 300;

				let currentAmount = this.getCurrentOfResource(commodityType)

				let components = COMMODITIES[commodityType].components;

				let fail = false;
				let score = 0;


				for (let componentType in components) {
					if (componentType == RESOURCE_ENERGY && storedEnergy < constants.ROOM_ENERGY_NO_BARRING / (urgent ? 2 : 1)) {
						fail = true;
						break;
					}
					else {
						let numOfInput = this.getCurrentOfResource(componentType)
						let minAmount;
						if (urgent) {
							minAmount = constants.MIN_AMOUNT_BEFORE_BAR_MISSING
						}
						else {
							minAmount = constants.MIN_AMOUNT_BEFORE_BAR
						}

						if (numOfInput < minAmount) {
							fail = true;
							break;
						}
						// Keep some basics about
						if (numOfInput < 5 * currentAmount && numOfInput <= 1.25 * constants.MARKET_SELL_RESOURCE_AMOUNT) {
							fail = true;
							break;
						}

						score += numOfInput;
					}
				}

				if (fail) continue;

				if (score > bestScore) {
					bestBar = commodityType;
					bestScore = score;
				}
			}

			if (bestBar) {
				this.mem.factoryTarget = bestBar;
				if (!this.factory.cooldown && !produced && !this.factory.produced) {
					if (this.factory.produce(this.mem.factoryTarget) == OK) {						
						this.factory.produced = 1
						this.mem.forceRefreshFactory = 1
					}
				}
				return

			}

			// Nothing better to do, pack energy
			if ((storedEnergy > constants.ROOM_ENERGY_CONVERT_TO_BATTERIES_RESERVE * batteryMod && this.getCurrentOfResource(RESOURCE_BATTERY) < constants.BATTERY_RESERVE_SIZE) ||
				(storedEnergy > constants.ROOM_ENERGY_CONVERT_TO_BATTERIES * batteryMod && this.getCurrentOfResource(RESOURCE_BATTERY) * 10 < storedEnergy) ||
				(storedEnergy > constants.ROOM_ENERGY_CONVERT_TO_BATTERIES_2)) {
				this.mem.factoryTarget = RESOURCE_BATTERY;

				if (!this.factory.cooldown && !produced && !this.factory.produced) {
					if (this.factory.produce(this.mem.factoryTarget) == OK) {						
						this.factory.produced = 1
						this.mem.forceRefreshFactory = 1
					}
				}
				return

			}
		}
	}



	Room.prototype.manageObserver = function() {
		let spawn = this.spawns[0]

		// TODO: Collision detection? We can have two looking at the same room

		let observer;
		if (this.controller.level >= 8) {
			observer = this.observer;
		}
		if (observer) {
			if (this.repeatObservation) {
				observer.observeRoom(this.mem.observeRoom)
				if (Game.map.visual) Game.map.visual.text("🛰️r", new RoomPosition(25, 25, this.mem.observeRoom), {fontSize: 20})
			}
			else if (Game.cpu.bucket / 10000 > Math.random()) {
				let acted = false;
				if (Memory.scoutRooms.length) {
					let testRoom = _.sample(Memory.scoutRooms);
					let cnt = 0;

					/*while (!Memory.botArena && Memory.rooms[testRoom] && Memory.rooms[testRoom].owner && !Memory.rooms[testRoom].creepVisited && cnt < 20) {
						testRoom = _.sample(Memory.scoutRooms);
						cnt++;
					}*/

					let range = OBSERVER_RANGE;

					for (let effect of (observer.effects || [])) {
						if (effect.power == PWR_OPERATE_OBSERVER) {
							range = Infinity;
						}
					}

					if (Game.map.getRoomLinearDistance(testRoom, this.name) <= range) {
						// observer.observeRoom(Memory.scoutRooms.pop())
						// console.log(room, testRoom)
						this.mem.observeRoom = testRoom
						observer.observeRoom(testRoom)
						if (Game.map.visual) Game.map.visual.text("🛰️1", new RoomPosition(25, 25, testRoom), {fontSize: 20})
						// Not sure why I had this.
						// if (Memory.botArena || !Memory.rooms[testRoom] || !Memory.rooms[testRoom].owner) {
							_.pull(Memory.scoutRooms, testRoom)
							// console.log("scouted", testRoom)
						// }
						acted = true;
					}
				}

				if (!acted && Memory.season && (Memory.season1 || Memory.season2) && Math.random() < 0.5) {
					if (Memory.scoreContainerRooms.length) {
						let testRoom = _.sample(Memory.scoreContainerRooms);
						let cnt = 0;

						/*while (!Memory.botArena && Memory.rooms[testRoom] && Memory.rooms[testRoom].owner && !Memory.rooms[testRoom].creepVisited && cnt < 20) {
							testRoom = _.sample(Memory.scoutRooms);
							cnt++;
						}*/

						let range = OBSERVER_RANGE;

						for (let effect of (observer.effects || [])) {
							if (effect.power == PWR_OPERATE_OBSERVER) {
								range = Infinity;
							}
						}

						if (Game.map.getRoomLinearDistance(testRoom, this.name) <= range) {
							// observer.observeRoom(Memory.scoutRooms.pop())
							// console.log(room, testRoom)
							this.mem.observeRoom = testRoom
							observer.observeRoom(testRoom)
							if (Game.map.visual) Game.map.visual.text("🛰️s", new RoomPosition(25, 25, testRoom), {fontSize: 20})
							acted = true;
						}
					}
				}

				if (!acted) {
					// Alternate between our observe rooms and random rooms in range
					for (let goodRoomName of _.shuffle(this.mem.goodRooms)) {
						if (!Game.rooms[goodRoomName]) {
							observer.observeRoom(goodRoomName)
							this.mem.observeRoom = goodRoomName
							if (Game.map.visual) Game.map.visual.text("🛰️2", new RoomPosition(25, 25, goodRoomName), {fontSize: 20})
							acted = true;
							break					
						}
					}
				}

				if (!acted) {
					if (Math.random() < 0.25) {
						let newRoomName;
						let cnt = 0;
						do {
							let xDiff = Math.round((Math.random() + Math.random()) * 10.5 - 10.5);
							let yDiff = Math.round((Math.random() + Math.random()) * 10.5 - 10.5);

							let currentCoords = util.getRoomCoords(this.name);
							newRoomName = util.getRoomNameFromCoords({x: currentCoords.x + xDiff, y: currentCoords.y + yDiff})

							cnt++;
						}
						while ((Game.rooms[newRoomName] || Game.map.getRoomStatus(newRoomName).status == "closed") && cnt < 20);

						if (!Game.rooms[newRoomName] && Game.map.getRoomStatus(newRoomName).status != "closed") {
							observer.observeRoom(newRoomName)
							this.mem.observeRoom = newRoomName
							if (Game.map.visual) Game.map.visual.text("🛰️3", new RoomPosition(25, 25, newRoomName), {fontSize: 20})
						}
					}
					else {
						var count = 0;
						// No uniq. This means that rooms we have mulitple purposes for get hit mulitple times. Right now that's pretty much highways...
						var observeRooms = this.observeRooms.concat(this.powerRooms).concat(this.convoyRooms).concat(this.lootRooms).concat(this.depositRooms);
						var oldObserveRoomIdx = (this.mem.observeRoomIdx || 0);

						this.mem.observeRoomIdx = (this.mem.observeRoomIdx || 0) + 1;
						this.mem.observeRoomIdx %= observeRooms.length;

						while (Game.rooms[observeRooms[this.mem.observeRoomIdx]] && count < observeRooms.length) {
							count++;
							this.mem.observeRoomIdx += 1;
							this.mem.observeRoomIdx %= observeRooms.length;
						}

						if (this.mem.observeRoomIdx != oldObserveRoomIdx) {
							let roomName = observeRooms[this.mem.observeRoomIdx]
							if (!Game.rooms[observeRooms[this.mem.observeRoomIdx]]) {								
								this.mem.observeRoom = observeRooms[roomName];
								observer.observeRoom(roomName)
								if (Game.map.visual) Game.map.visual.text("🛰️4", new RoomPosition(25, 25, roomName), {fontSize: 20})
							}
						}
					}
				}
			}
		}

		if (!spawn) {
			return;
		}

		if (!observer || this.lootRooms.length > 0 || Memory.season1 || Memory.season2) {
			if (Game.time % 499 == 0 || Memory.tick == 250) {
				let rooms;
				if (observer) {
					rooms = (this.lootRooms || []);
				}
				else {
					rooms = (this.observeRooms.concat(this.lootRooms) || []);
					// if (!this.restrictPowerMissions(10000)) {
					// 	rooms = rooms.concat(this.powerRooms || []);
					// }
				}

				if (Memory.season1 && Memory.useAllyContainer) {
					rooms.push(this.mem.closestDropOff)
					if (this.name == "E22S3") {
						rooms.push("E24S7")
					}
				}

				if (rooms) {
					for (var roomIdx in rooms) {
						if (!Game.rooms[rooms[roomIdx]]) {
							if (!spawn.hasPrioritySpawn("observer", {targetRoom: rooms[roomIdx]})) {
								spawn.addPrioritySpawn("observer", {targetRoom: rooms[roomIdx]})
							}
						}
					}
				}
			}
		}
		if (Game.time % 499 == 0 || Memory.tick == 250) {
			if (this.protectRooms) {
				for (var roomIdx in this.protectRooms) {
					if (!Game.rooms[this.protectRooms[roomIdx]]) {
						if (!spawn.hasPrioritySpawn("observer", {targetRoom: this.protectRooms[roomIdx]})) {
							spawn.addPrioritySpawn("observer", {targetRoom: this.protectRooms[roomIdx]})
						}
					}
				}
			}
		}

		// Throttle at low CPU.
		if (Game.cpu.bucket / 10000 > Math.random()) {
			// console.log("Power check", this.restrictPowerMissions(10000), this.observeRooms)
			if (this.observeRooms && !this.restrictPowerMissions(10000)) {
				let rooms = this.observeRooms.concat(this.powerRooms);
				for (var roomIdx in rooms) {
					// console.log(roomIdx)
					if (Game.rooms[rooms[roomIdx]] && Game.rooms[rooms[roomIdx]].highway && util.isRoomAccessible(rooms[roomIdx]) && Game.rooms[rooms[roomIdx]].powerBanks.length) {
						// if (Memory.season2 && Game.rooms[rooms[roomIdx]].mem.seasonWallsToRemove !== undefined && Game.rooms[rooms[roomIdx]].mem.seasonWallsToRemove.length) {
						// 	continue
						// }

						// console.log(Game.rooms[rooms[roomIdx]])

						let energyCostForPower = 0;

						energyCostForPower += (POWER_BANK_HITS * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) / (CREEP_LIFE_TIME * ATTACK_POWER);
						energyCostForPower += (POWER_BANK_HITS * POWER_BANK_HIT_BACK * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])) / (CREEP_LIFE_TIME * HEAL_POWER);

						// Intents. Lets assume it costs ~1 CPU over 2 creep life times, which is about right. Maybe a bit high.
						if (Memory.stats.avgBucket < 9500) {
							energyCostForPower += Memory.stats.yieldPerCPU * 2
						}

						let creditsCost = energyCostForPower * (this.mem.energyPrice || Infinity);
						let powerUnitExportValue = (this.mem.avgExportValues && this.mem.avgExportValues[RESOURCE_POWER]) ? this.mem.avgExportValues[RESOURCE_POWER] : this.mem.energyPrice * 5;
						// let powerUnitImportValue = room.mem.avgImportValues[RESOURCE_POWER];

						// if (creditsCost < Infinity) {
						// 	console.log("Power price check", rooms[roomIdx], creditsCost, powerUnitExportValue);
						// }
						if (Memory.botArena) {
							// Always hit banks >8000
							creditsCost = Math.max(creditsCost, powerUnitExportValue / 8000)
						}

						let energy = 0;
						if (this.terminal) energy += this.terminal.store[RESOURCE_ENERGY]
						if (this.storage)  energy += this.storage.store[RESOURCE_ENERGY];

						let tooMuchEnergy = 0;
						// We need to burn energy
						if (energy > constants.ROOM_ENERGY_PROCESS_POWER) {
							tooMuchEnergy = 1;
						}

						let scoutRoom = Game.rooms[rooms[roomIdx]];
						// console.log("Checking", scoutRoom, "for power")

						// TODO: This could be smarter. Look at their DPT/other metrics?
						if (scoutRoom.getAllHostileCreepsWithBodyParts([ATTACK], false).length) {
							for (var powerBank of scoutRoom.powerBanks) {
								// if (powerBank.hits < POWER_BANK_HITS * 0.5) {
								if (powerBank.hits < POWER_BANK_HITS * 0.5) {
								// if (powerBank.hits < POWER_BANK_HITS * 0.3) {
									// Game.notify("Request power raid " + scoutRoom.name)
									console.log("Request power raid " + scoutRoom.name)
									combatManager.requestPowerRaid(scoutRoom.name, powerBank.power);
									break;
								}
							}
						}

						// Can there ever be more than one power bank? This assumes yes.
						let targets = _.filter(scoutRoom.powerBanks, (structure) =>
							{
								if (Memory.season && structure.power > 9000) {
									// console.log("Power test A", scoutRoom.name)
									return structure.ticksToDecay >= 3500 
								}
								let worthIt = structure.power * powerUnitExportValue > creditsCost;
								// console.log("Power test B", scoutRoom.name, worthIt)
								// Bleh.
								if (global.processingPower) {
									worthIt = worthIt || !this.restrictPowerMissions(structure.power);
								}
								// console.log("Power test C", scoutRoom.name, worthIt)
								if (tooMuchEnergy) {
									worthIt = worthIt || !this.restrictPowerMissions(structure.power);
								}
								// console.log("Power test D", scoutRoom.name, worthIt)

								return structure.ticksToDecay >= 3500 && worthIt;
							}
						);

						for (let target of targets) {
							combatManager.requestPowerHarvestMission(scoutRoom.name);
							// spawn.createPowerRangers(target.pos.x, target.pos.y, rooms[roomIdx], target.power)
							break
						}
					}
				}
			}
		}
	}

	Room.prototype.getStoredEnergy = function() {
		// global.inTickObject.resources
		// Not really sure how this is undefined sometimes
		this.resources = this.resources || {};
		if (this.resources[RESOURCE_ENERGY] !== undefined) {
			return this.resources[RESOURCE_ENERGY]
		}
		var sum = 0;
		if (this.storage) sum += this.storage.store[RESOURCE_ENERGY]
		if (this.terminal) sum += this.terminal.store[RESOURCE_ENERGY]
		if (this.factory) sum += this.factory.store[RESOURCE_ENERGY]

		this.resources[RESOURCE_ENERGY] = sum;

		return sum
	}


	Room.prototype.getCurrentOfResource = function(resource) {
		// Not really sure how this is undefined sometimes
		this.resources = this.resources || {};
		if (this.resources[resource] !== undefined) {
			return this.resources[resource]
		}

		var sum = 0;
		if (this.storage) sum += this.storage.store[resource]
		if (this.terminal) sum += this.terminal.store[resource]
		if (this.factory) sum += this.factory.store[resource]


		if (!COMMODITIES[resource] || !COMMODITIES[resource].level) {			
			for (let labTech of (this.mem.ownedCreeps["labTech"] || [])) {
				if (Game.creeps[labTech]) sum += Game.creeps[labTech].carry[resource]
			}

			for (let labTech of (this.mem.ownedCreeps["advLabManager"] || [])) {
				if (Game.creeps[labTech]) sum += Game.creeps[labTech].carry[resource]
			}

			for (let lab of this.labs) {
				if (lab.mineralType == resource) {
					sum += lab.mineralAmount;
				}
			}
		}

		this.resources[resource] = sum;

		return sum
	}

	Room.prototype.getCurrentOfResourceNonMineral = function(resource) {
		// Not really sure how this is undefined sometimes
		this.resources = this.resources || {};
		if (this.resources[resource] !== undefined) {
			return this.resources[resource]
		}

		var sum = 0;
		if (this.storage) sum += this.storage.store[resource]
		if (this.terminal) sum += this.terminal.store[resource]
		if (this.factory) sum += this.factory.store[resource]

		this.resources[resource] = sum;

		return sum
	}

	// Don't check against x too frequently. Usually storage+terminal will have enough.
	Room.prototype.hasAtLeastXOfResource = function(resource, x) {
		// Not really sure how this is undefined sometimes
		this.resources = this.resources || {};
		if (this.resources[resource] !== undefined) {
			return this.resources[resource] >= x
		}

		var sum = 0;
		if (this.storage) {
			sum += this.storage.store[resource]
		}
		if (sum >= x) {
			return true;
		}
		if (this.terminal) {
			sum += this.terminal.store[resource]
		}
		if (sum >= x) {
			return true;
		}

		if (this.factory) {
			sum += this.factory.store[resource]
		}


		if (!COMMODITIES[resource] || !COMMODITIES[resource].level) {			
			for (let labTech of (this.mem.ownedCreeps["labTech"] || [])) {
				if (Game.creeps[labTech]) {
					sum += Game.creeps[labTech].carry[resource]
				}
			}
			for (let labTech of (this.mem.ownedCreeps["advLabManager"] || [])) {
				if (Game.creeps[labTech]) {
					sum += Game.creeps[labTech].carry[resource]
				}
			}

			for (let lab of this.labs) {
				if (lab.mineralType == resource) {
					sum += lab.mineralAmount;
				}
			}
		}

		this.resources[resource] = sum;


		return sum >= x;
	}

	Room.prototype.hasAtLeastXOfResourceNonMineral = function(resource, x) {
		// Not really sure how this is undefined sometimes
		this.resources = this.resources || {};
		if (this.resources[resource] !== undefined) {
			return this.resources[resource] >= x
		}

		var sum = 0;
		if (this.storage) {
			sum += this.storage.store[resource]
		}
		if (sum >= x) {
			return true;
		}
		if (this.terminal) {
			sum += this.terminal.store[resource]
		}
		if (sum >= x) {
			return true;
		}

		if (this.factory) {
			sum += this.factory.store[resource]
		}

		this.resources[resource] = sum;

		return sum >= x;
	}

	// Room.prototype.labCensus = function() {
	// 	this.mem.resources = {}
	// 	for (let resourceType of LAB_ITEMS_ALL) {
	// 		this.getCurrentOfResource(resourceType);
	// 	}
	// }

	// Room.prototype.resourceCensus = function() {
	// 	this.mem.resources = {}
	// 	for (let resourceType of RESOURCES_ALL) {
	// 		this.getCurrentOfResource(resourceType);
	// 	}
	// }

	// boostCheckFunc is used if we want a specific boost.
	// Optional is used for launching assaults. Don't want to launch if we can get a higher boost tier soon
	Room.prototype.getAvailableBoost = function(boostTypeCheckFunc, requiredAmount, boostCheckFunc, isMultiWaveAssault = false, optional = false) {
		boostCheckFunc = boostCheckFunc || boostTypeCheckFunc;

		let sortedCandidateBoosts;

		let freeAssaults = global.runningIntershardSupport ? 0 : Game.myRooms.length / 20;

		if (Math.max(1, (global.totalBoostedAssaultCount || 1)) < freeAssaults) {
			requiredAmount = Math.min(requiredAmount, LAB_MINERAL_CAPACITY)
		}
		
		let myAssaultsFromHere = (global.boostedRoomAssaultFromCounts && global.boostedRoomAssaultFromCounts[this.name]) ? (global.boostedRoomAssaultFromCounts[this.name].assaultCount || 0) : 0
		// Don't want it to get in the way of single wave at a time pre-launches. 
		// TODO: This doesn't really work. The intent was to stop many assaults to different rooms firing at once
		//       But the required amount already factors in wave count for a single room attack. Basically, not sure it's 
		//       a net positive.
		// requiredAmount *= Math.max(1, 0.9 + 0.1 * myAssaultsFromHere)

		for (let lab of this.labs) {
			let labMemory = this.mem.labMemory[lab.id];
			if (!labMemory) continue;

			// Old comment
			// Let us use global resources. Quicker boosts assume that the global stockpile is larger.
			// Take average of cost to make and cost to make the last step (as we'll likely have ingredients)
			// LO takes 10 ticks to cook and 10 ticks for last step so we allow access to the 1x global pool.
			// XLHO2 takes 95 ticks to cook and 60 for the last step so we allow access to 12.9% of the global pool.

			// New comment
			// LO takes 10 ticks to cook and 10 ticks for last step so we allow access to the 2x global pool.
			// XLHO2 takes 95 ticks to cook and 60 for the last step so we allow access to 1.129x of the global pool.
			if (labMemory.targetMineral && labMemory.lockedForBoosts && boostCheckFunc(labMemory.targetMineral)) {
				// let myResources = ;
				// let myResources = this.getCurrentOfResource(labMemory.targetMineral);
				if (this.hasAtLeastXOfResource(labMemory.targetMineral, Math.min(LAB_MINERAL_CAPACITY, requiredAmount))) {
					let timeToCook = util.getTimeToCookBoost(labMemory.targetMineral);
					let timeToCookLastStep = REACTION_TIME[labMemory.targetMineral];

					let mod = 1 + Game.myRooms.length / (0.5 * (timeToCook + timeToCookLastStep));
					// let mod = 10. / (0.5 * (timeToCook + timeToCookLastStep));

					let diffPerAssault = 1 / (Game.myRooms.length);
					let ongoingMod = Math.min(1, Math.max(0, (1 + diffPerAssault - diffPerAssault * Math.max(0, (global.totalBoostedAssaultCount || 0) - freeAssaults - myAssaultsFromHere))))

					// mod *= ongoingMod
					let canBuyAmount = 0;
					// Money. Allow us to spend 5% on each boost type modified down by ongoing
					if (this.mem.avgImportValues && this.mem.avgImportValues[labMemory.targetMineral] && global.effectiveCreditLimit !== undefined) {
						canBuyAmount = 0.05 * (global.effectiveCreditLimit / this.mem.avgImportValues[labMemory.targetMineral]) * ongoingMod;
					}

					let globalPool = (Memory.stats.globalResources[labMemory.targetMineral] || 0);

					let canTakeFromGlobalPool = globalPool * mod / Math.max(1, (global.totalBoostedAssaultCount || 1) - freeAssaults - myAssaultsFromHere)

					// let numResources = Math.max(0, ((Memory.stats.globalResources[labMemory.targetMineral] || 0) - myResources) * mod) + myResources + canBuyAmount;
					let numResources = canTakeFromGlobalPool + canBuyAmount;

					let actualRequiredAmount
					// Wave counts assume T3. Lower teir will cause me to use more boosts as we do less damage
					let tier = util.getBoostTier(labMemory.targetMineral)
					if (isMultiWaveAssault && requiredAmount) {
						if (tier == 1) {
							actualRequiredAmount = requiredAmount * 3;
						}
						else if (tier == 2) {
							actualRequiredAmount = requiredAmount * 2;
						}
						else {
							actualRequiredAmount = requiredAmount
						}
					}
					else {
						actualRequiredAmount = requiredAmount
					}

					// If we have enough other stuff around don't burn low tiers, wait for them to be upgraded
					if (!boostCheckFunc && optional) {						
						if (tier == 1) {
							if ((Memory.stats.globalResources[RESOURCE_OXYGEN] > Game.myRooms.length * 1500 && Memory.stats.globalResources[RESOURCE_HYDROGEN] > Game.myRooms.length * 1500) ||
								Memory.stats.globalResources[RESOURCE_HYDROXIDE] > Game.myRooms.length * 1500)
							continue
						}
						else if (tier == 2) {
							if (Memory.stats.globalResources[RESOURCE_CATALYST] > Game.myRooms.length * 1500)
							continue
						}
					}

					// console.log("getAvailableBoost #1", labMemory.targetMineral, canTakeFromGlobalPool, canBuyAmount, mod, ongoingMod, numResources, requiredAmount)

					if (numResources >= (actualRequiredAmount || LAB_BOOST_MINERAL)) {
						return labMemory.targetMineral;
					}
				}
			}

			// We have a lab with the stuff, but which stuff do we have enough of?
			// Locked with no target means being held as defensive
			if (((labMemory.reservedForBoosts && !labMemory.lockedForBoosts) || (labMemory.lockedForBoosts && !labMemory.targetMineral)) && boostTypeCheckFunc(labMemory.boostMineral)) {
				// This is not efficient!
				if (!sortedCandidateBoosts) {
					sortedCandidateBoosts = _.sortBy(_.filter(LAB_ITEMS_ALL, boostCheckFunc), util.getBoostTier).reverse()
				}

				let numThisOrHigher = 0;

				// Go down in descending order and pop out the first that we have enough of.
				for (let boost of sortedCandidateBoosts) {
					if (!this.hasAtLeastXOfResource(boost, Math.min(LAB_MINERAL_CAPACITY, requiredAmount))) {
						continue
					}

					// If we have enough other stuff around don't burn low tiers, wait for them to be upgraded
					if (!boostCheckFunc && optional) {						
						let tier = util.getBoostTier(boost)
						if (tier == 1) {
							if ((Memory.stats.globalResources[RESOURCE_OXYGEN] > Game.myRooms.length * 1500 && Memory.stats.globalResources[RESOURCE_HYDROGEN] > Game.myRooms.length * 1500) ||
								Memory.stats.globalResources[RESOURCE_HYDROXIDE] > Game.myRooms.length * 1500)
							continue
						}
						else if (tier == 2) {
							if (Memory.stats.globalResources[RESOURCE_CATALYST] > Game.myRooms.length * 1500)
							continue
						}
					}


					// let myResources = this.getCurrentOfResource(boost)
					// if (myResources < Math.min(LAB_MINERAL_CAPACITY, requiredAmount)) {
					// 	continue;
					// }


					let timeToCook = util.getTimeToCookBoost(boost);
					let timeToCookLastStep = REACTION_TIME[boost];

					let mod = 1 + Game.myRooms.length / (0.5 * (timeToCook + timeToCookLastStep));
					// let mod = 10. / (0.5 * (timeToCook + timeToCookLastStep));

					let diffPerAssault = 1 / (Game.myRooms.length);
					let ongoingMod = Math.min(1, Math.max(0, (1 + diffPerAssault - diffPerAssault * Math.max(0, (global.totalBoostedAssaultCount || 0) - freeAssaults - myAssaultsFromHere))))
					// mod *= ongoingMod



					let canBuyAmount = 0;
					// Money. Allow us to spend 5% on each boost type modified down by ongoing
					if (this.mem.avgImportValues && this.mem.avgImportValues[boost] && global.effectiveCreditLimit !== undefined) {
						canBuyAmount = 0.05 * (global.effectiveCreditLimit / this.mem.avgImportValues[boost]) * ongoingMod;
					}

					let globalPool = (Memory.stats.globalResources[boost] || 0);

					let canTakeFromGlobalPool = globalPool * mod / Math.max(1, (global.totalBoostedAssaultCount || 1) - freeAssaults - myAssaultsFromHere)
					let numResources = canTakeFromGlobalPool + canBuyAmount;

					numThisOrHigher += numResources;

					// let numResources = Math.max(0, ((Memory.stats.globalResources[boost] || 0) - myResources) * mod) + myResources + canBuyAmount;

					let actualRequiredAmount
					// Wave counts assume T3. Lower teir will cause me to use more boosts as we do less damage
					if (isMultiWaveAssault && requiredAmount) {
						let tier = util.getBoostTier(boost)
						if (tier == 1) {
							actualRequiredAmount = requiredAmount * 3;
						}
						else if (tier == 2) {
							actualRequiredAmount = requiredAmount * 2;
						}
						else {
							actualRequiredAmount = requiredAmount
						}
					}
					else {
						actualRequiredAmount = requiredAmount
					}



					// console.log("getAvailableBoost #2", boost, canTakeFromGlobalPool, canBuyAmount, mod, ongoingMod, numResources, requiredAmount)

					if (numThisOrHigher >= actualRequiredAmount) {
						return boost;
					}
				}
			}
		}
	}


	Room.prototype.requestAvailableBoost = function(boost, exactRequired, maxAmount) {
		if (!this.storage || !this.terminal || !this.controller || !this.controller.my || !this.terminal.my || this.controller.level < 6 || this.labs.length == 0) return

		this.boostsRequested = (this.boostsRequested || 0);

		if (util.isHarvestBoost(boost) || (util.isRepairBoost(boost) && this.defcon == 5)) {
			this.boostsRequested += 0.1;
		}
		else {
			this.boostsRequested += 1;	
		}
		this.mem.boostsRequestedTime = Game.time

		// if (maxAmount === undefined) {
		// 	maxAmount = 
		// }

		if ((this.mem.ownedCreeps["labTech"] || []).length <= (this.boostsRequested < 3 ? 0 : 1)) {
			var spawns = this.spawns;

			var currentlySpawning = false;
			for (let spawn of spawns) {
				if (spawn.memory.currentBuildingRole == "labTech") {
					currentlySpawning = true;
					break;
				}
			}

			if (!currentlySpawning && spawns[0]) {
				if (!spawns[0].hasPrioritySpawn("labTech")) {
					spawns[0].addPrioritySpawn("labTech")
				}
			}
		}

		if (Game.time % 10 == this.mem.ID % 10) {
			if (!this.terminal.cooldown && /*!util.isHarvestBoost(boost) &&*/ !this.hasAtLeastXOfResource(boost, 2 * LAB_MINERAL_CAPACITY) && !util.isUpgradeBoost(boost)) {
			// if (this.getCurrentOfResource(boost) < 2 * LAB_MINERAL_CAPACITY && !this.terminal.cooldown && !util.isUpgradeBoost(boost)) {
				for (let amount = 2 * LAB_MINERAL_CAPACITY; amount >= 0.125 * LAB_MINERAL_CAPACITY; amount /= 2) {
					let potentialFeeders = [];
					for (let otherRoom of Game.myRooms) {
						if (otherRoom === this || !otherRoom.terminal) continue;
						if (otherRoom.terminal.cooldown) continue;
						if ((otherRoom.terminal.store[boost] || 0) >= amount && (otherRoom.terminal.store[RESOURCE_ENERGY] || 0) >= amount) {
							if (otherRoom.mem.combatBoostsPending || combatManager.isPendingBoosts(otherRoom.name)) continue;

							potentialFeeders.push(otherRoom);
						}
					}

					let minDist = Infinity;
					let bestFeeder;
					for (let feeder of potentialFeeders) {
						let dist = Game.map.getRoomLinearDistance(this.name, feeder.name, true);
						if (dist < minDist) {
							minDist = dist;
							bestFeeder = feeder;
						}
					}

					if (bestFeeder && this.name != global.currentlyUnclaimingRoom) {
						console.log("Terminal send", boost, bestFeeder.name, "to", this.name, amount, "for continued attack");
						bestFeeder.terminal.send(boost, amount, this.name);
						break;
					}
				}
			}
			if (Game.time % 100 == this.mem.ID % 10) {
				console.log("Request boost", this, boost)
			}
		}

		for (let lab of this.labs) {
			let labMemory = this.mem.labMemory[lab.id];
			if (!labMemory) continue;
			if ((labMemory.reservedForBoosts || (labMemory.lockedForBoosts && !labMemory.targetMineral)) && labMemory.boostMineral && (exactRequired ? boost == labMemory.boostMineral : util.isSameBoostType(boost, labMemory.boostMineral))) {
				labMemory.targetMineral = boost
				labMemory.lockedForBoosts = 1;
				labMemory.pickupLab = 0;
				labMemory.dropOffLab = 1;
				labMemory.maxAmount = Math.max(labMemory.maxAmount || 0, maxAmount || LAB_MINERAL_CAPACITY);
				break;
			}
		}
	}


	Room.prototype.manageLabs = function() {
		// Sanity!
		if (!this.storage || !this.terminal || !this.controller || !this.controller.my || !this.terminal.my || this.controller.level < 6) return

		this.mem.labMemory = this.mem.labMemory || {}


		let labs = this.labs;

		if (labs.length == 0) {
			return;
		}

		let techNeeded = this.mem.combatBoostsPending || 0;
		let update1 = false || Memory.debugLabs;
		let sourceLabs

		// Doesn't take much CPU, but it adds up across all labs.
		// Only run every 5 ticks as that's the shortest reaction time.
		if (Game.cpu.bucket > 1000 && 
			this.mem.targetCompound && 
			(this.mem.advManagedLabs == Game.time - 1 || (Game.cpu.bucket > 9000 && Game.time % 5 == this.mem.ID % 5) || Game.time % REACTION_TIME[this.mem.targetCompound] == this.mem.ID % REACTION_TIME[this.mem.targetCompound])) {
			// TODO: Figure out how to deal with advanced lab manager

			sourceLabs = []
			// sourceLabs = _.filter(labs, (lab) => ((lab.pos.x == this.mem.labPositionX 	 && lab.pos.y == this.mem.labPositionY) ||
			// 									  (lab.pos.x == this.mem.labPositionX - 1 && lab.pos.y == this.mem.labPositionY - 1)));

			let reactionSourceLabs
			// ~0.01. Cheap.
			if (this.mem.advManagedLabs == Game.time - 1) {
				reactionSourceLabs = []
				for (let lab of labs) {
					if (lab.mineralType == RECIPES[this.mem.targetCompound][0] || lab.mineralType == RECIPES[this.mem.targetCompound][1]) {
						reactionSourceLabs.push(lab)
						if (reactionSourceLabs.length == 2) {
							break
						}
					}
				}
			}
			else {
				let numLabsFound = 0
				for (let lab of labs) {
					if (lab.pos.x == this.mem.labPositionX && lab.pos.y == this.mem.labPositionY) {
						sourceLabs[0] = lab;
						numLabsFound++
						if (numLabsFound == 2) {
							break
						}
					}
					else if (lab.pos.x == this.mem.labPositionX - 1 && lab.pos.y == this.mem.labPositionY - 1) {
						sourceLabs[1] = lab;	
						numLabsFound++
						if (numLabsFound == 2) {
							break
						}
					}
				}

				if (numLabsFound != 2) {
					sourceLabs = []
				}

				reactionSourceLabs = sourceLabs
			}


			if (reactionSourceLabs.length == 2) {
				if (reactionSourceLabs[0].mineralAmount >= LAB_REACTION_AMOUNT && 
					reactionSourceLabs[1].mineralAmount >= LAB_REACTION_AMOUNT && 
					REACTIONS[reactionSourceLabs[0].mineralType] && 
					REACTIONS[reactionSourceLabs[0].mineralType][reactionSourceLabs[1].mineralType]) {
					for (let lab of labs) {
						this.mem.labMemory[lab.id] = this.mem.labMemory[lab.id] || {};
						if (!lab.cooldown && Game.time - (this.mem.attemptingToUnBoostRick || 0) > 5) {
							if (!this.mem.labMemory[lab.id].lockedForBoosts || this.mem.labMemory[lab.id].targetMineral == REACTIONS[reactionSourceLabs[0].mineralType][reactionSourceLabs[1].mineralType]) {
								if (lab.mineralAmount > lab.mineralCapacity - LAB_REACTION_AMOUNT) continue
								if (lab == reactionSourceLabs[0] || lab == reactionSourceLabs[1]) continue
								if (lab.mineralAmount && lab.mineralType != REACTIONS[reactionSourceLabs[0].mineralType][reactionSourceLabs[1].mineralType]) continue

								// let c = Game.cpu.getUsed()
								let ret = lab.runReaction(reactionSourceLabs[0], reactionSourceLabs[1]) 
								// console.log("runReaction", Game.cpu.getUsed() - c)
								if (ret == OK) {
									Memory.stats.intentCounts["labs"] = (Memory.stats.intentCounts["labs"] || 0) + 1
									Memory.stats.labUpTime = (Memory.stats.labUpTime || 0) + REACTION_TIME[this.mem.targetCompound]
								}
								else {
									// I guess can be due to power?
									console.log("Lab reaction failed", ret, this.name)
								}
								if (lab.mineralAmount >= LAB_MINERAL_CAPACITY - 500 && !this.mem.labMemory[lab.id].lockedForBoosts) {
									techNeeded = true;
								}
								else if (reactionSourceLabs[0].mineralAmount <= 200 || reactionSourceLabs[1].mineralAmount <= 200) {
									techNeeded = true;
								}
							}
						}
						// else  {
						// 	lab.runReaction(reactionSourceLabs[0], reactionSourceLabs[1]);
						// }
					}
				}
				else if (Math.random() < 0.05 && labs.length > 2 && (this.mem.labMemory[reactionSourceLabs[0].id].targetMineral === undefined || this.mem.labMemory[reactionSourceLabs[1].id].targetMineral === undefined)) {
					update1 = true;
				}
			}
		}

		if (this.mem.nukeLandTime - Game.time < 200) {
			this.mem.labMemory = {};
			for (let lab of labs) {
				this.mem.labMemory[lab.id] = {};
				this.mem.labMemory[lab.id].lockedForBoosts = 0;
				this.mem.labMemory[lab.id].reservedForBoosts = 0;
				this.mem.labMemory[lab.id].dropOffLab = 0;
				this.mem.labMemory[lab.id].pickupLab = 0;
				this.mem.labMemory[lab.id].maxAmount = LAB_MINERAL_CAPACITY;
			}
			return
		}

		// update1 = true;

		// Ok, we have locked labs and unlocked labs.
		// Locked labs contain the best boost of a class
		// Unlocked labs are for crafting
		if (update1 || Math.random() < 0.03 || (this.terminal.cooldown == TERMINAL_COOLDOWN && Math.random() < 0.2) || (this.mem.combatBoostsPending && Math.random() < 0.05)) {
			let update2 = false || Memory.debugLabs;
			delete Memory.debugLabs
			// update2 = true;
			if (!update1 && this.mem.targetCompound) {
				if (!this.hasAtLeastXOfResource(RECIPES[this.mem.targetCompound][0], 100)) {
					update2 = true;
				}
				if (!update2 && !this.hasAtLeastXOfResource(RECIPES[this.mem.targetCompound][1], 100)) {
					update2 = true;
				}
			}

			let refresh = 0.97;
			if (this.mem.targetCompound) {
				if (REACTION_TIME[this.mem.targetCompound] == 5) {
					refresh = 0.9;
				}
				else if (REACTION_TIME[this.mem.targetCompound] < 20) {
					refresh = 0.93;
				}
			}

			// Probably not expensive but don't want to be swapping.
			if (labs.length > 0 && (update1 || update2 || Math.random() > refresh || (this.mem.combatBoostsPending && Math.random() > (refresh - 0.025)))) {
				let b = Game.cpu.getUsed();
				// Don't check combatManager often.
				let combatBoostsPending = (this.boostsRequested || (Math.random() > 0.1 ? this.mem.combatBoostsPending : combatManager.isPendingBoosts(this.name))) ? 1 : 0;

				this.mem.combatBoostsPending = combatBoostsPending;

				function compareLabs(a, b) {
					if (a.id < b.id) return -1;
					if (a.id > b.id) return 1;
					return 0;
				}

				labs.sort(compareLabs);


				if (!combatBoostsPending) {
					this.mem.labMemory = {};
					for (let lab of labs) {
						this.mem.labMemory[lab.id] = {};
						this.mem.labMemory[lab.id].lockedForBoosts = 0;
						this.mem.labMemory[lab.id].reservedForBoosts = 0;
						this.mem.labMemory[lab.id].dropOffLab = 0;
						this.mem.labMemory[lab.id].pickupLab = 0;
						this.mem.labMemory[lab.id].maxAmount = LAB_MINERAL_CAPACITY;
					}
				}
				else {
					for (let lab of labs) {
						this.mem.labMemory[lab.id] = this.mem.labMemory[lab.id] || {};
						this.mem.labMemory[lab.id].lockedForBoosts = this.mem.labMemory[lab.id].lockedForBoosts || 0;
						this.mem.labMemory[lab.id].reservedForBoosts = this.mem.labMemory[lab.id].reservedForBoosts || 0;
						this.mem.labMemory[lab.id].dropOffLab = this.mem.labMemory[lab.id].dropOffLab || 0;
						this.mem.labMemory[lab.id].pickupLab = this.mem.labMemory[lab.id].pickupLab || 0;
						this.mem.labMemory[lab.id].maxAmount = this.mem.labMemory[lab.id].maxAmount || LAB_MINERAL_CAPACITY;
					}
					techNeeded = true;
				}


				let defensiveBoosts = this.mem.DT > 0.6 || this.mem.attackScore > 10000 || labs.length <= 2 || this.defcon <= 2;

				if (!sourceLabs && labs.length > 2 && (!defensiveBoosts || labs.length >= 5)) {
					sourceLabs = []

					let numLabsFound = 0
					for (let lab of labs) {
						if (lab.pos.x == this.mem.labPositionX && lab.pos.y == this.mem.labPositionY) {
							sourceLabs[0] = lab;
							numLabsFound++
							if (numLabsFound == 2) {
								break
							}
						}
						else if (lab.pos.x == this.mem.labPositionX - 1 && lab.pos.y == this.mem.labPositionY - 1) {
							sourceLabs[1] = lab;	
							numLabsFound++
							if (numLabsFound == 2) {
								break
							}
						}
					}

					if (numLabsFound != 2) {
						sourceLabs = []
					}

					// sourceLabs = _.filter(labs, (lab) => ((lab.pos.x == this.mem.labPositionX 	 && lab.pos.y == this.mem.labPositionY) ||
					// 									  (lab.pos.x == this.mem.labPositionX - 1 && lab.pos.y == this.mem.labPositionY - 1)));
				}

				if (!sourceLabs) {
					sourceLabs = []
				}

				sourceLabs.sort(compareLabs);

				let boostLabs = _.difference(labs, sourceLabs)
				boostLabs.sort(compareLabs);

				// If the combat manager wants to spawn boosts, don't screw around with what
				// boosts are where.
				if (boostLabs.length > 0 && !combatBoostsPending) {
					// The mission asks for a quantity of boosts of a type. It should be able
					// to deal with any quality of boost coming out of the other end (except tough).

					// RCL 6+
					let attackLab = labs.length >= (defensiveBoosts ? 1 : 3);
					let rangedLab = labs.length >= (defensiveBoosts ? 2 : 4);
					let repairLab = labs.length >= (defensiveBoosts ? 3 : 5);

					// RCL 7+
					let healLab = labs.length >= 6;
					// let healLab = !this.mem.civilianLabs && !defensiveBoosts && Math.max(healt1, healt2, healt3) >= healBoostTarget && labs.length >= 5;
					let toughLabRCL7 = labs.length == 6 && !Memory.season;
					let dismantleLabRCL7 = labs.length == 6 && Memory.season;
					let moveLabRCL7 = labs.length == 6;

					// RCL 8+
					let toughLab = labs.length >= 7;
					let moveLab = labs.length >= 8;
					let dismantleLab = labs.length >= 9;

					let harvestLab = labs.length >= 10;

					if (attackLab) {
						if (defensiveBoosts) {
							this.mem.labMemory[boostLabs[0].id].dropOffLab = 1;
							this.mem.labMemory[boostLabs[0].id].lockedForBoosts = 1;
						}
						else {
							this.mem.labMemory[boostLabs[0].id].pickupLab = 1;
							this.mem.labMemory[boostLabs[0].id].reservedForBoosts = 1;
						}

						this.mem.labMemory[boostLabs[0].id].boostMineral = RESOURCE_UTRIUM_HYDRIDE;
					}

					if (rangedLab) {
						if (defensiveBoosts) {
							this.mem.labMemory[boostLabs[1].id].dropOffLab = 1;
							this.mem.labMemory[boostLabs[1].id].lockedForBoosts = 1;
						}
						else {
							this.mem.labMemory[boostLabs[1].id].pickupLab = 1;
							this.mem.labMemory[boostLabs[1].id].reservedForBoosts = 1;
						}

						this.mem.labMemory[boostLabs[1].id].boostMineral = RESOURCE_KEANIUM_OXIDE
					}

					if (repairLab) {
						// Repurpose to upgrade
						if (Memory.economyArena) {
							this.mem.labMemory[boostLabs[2].id].dropOffLab = 1;
							this.mem.labMemory[boostLabs[2].id].lockedForBoosts = 1;
							this.mem.labMemory[boostLabs[2].id].targetMineral = RESOURCE_GHODIUM_HYDRIDE;
						}
						else {
							if (defensiveBoosts) {
								this.mem.labMemory[boostLabs[2].id].dropOffLab = 1;
								this.mem.labMemory[boostLabs[2].id].lockedForBoosts = 1;
								this.mem.labMemory[boostLabs[2].id].targetMineral = RESOURCE_LEMERGIUM_HYDRIDE;
							}
							else {
								this.mem.labMemory[boostLabs[2].id].pickupLab = 1;
								this.mem.labMemory[boostLabs[2].id].reservedForBoosts = 1;
							}

							this.mem.labMemory[boostLabs[2].id].boostMineral = RESOURCE_LEMERGIUM_HYDRIDE;
						}
					}

					if (healLab) {
						this.mem.labMemory[boostLabs[3].id].pickupLab = 1;
						this.mem.labMemory[boostLabs[3].id].reservedForBoosts = 1;

						this.mem.labMemory[boostLabs[3].id].boostMineral = RESOURCE_LEMERGIUM_OXIDE;
					}

					if (toughLab) {
						this.mem.labMemory[boostLabs[4].id].pickupLab = 1;
						this.mem.labMemory[boostLabs[4].id].reservedForBoosts = 1;

						this.mem.labMemory[boostLabs[4].id].boostMineral = RESOURCE_CATALYZED_GHODIUM_ALKALIDE;
					}


					/*if (dismantleLab) {
						this.mem.labMemory[boostLabs[4].id].dropOffLab = true;
						this.mem.labMemory[boostLabs[4].id].lockedForBoosts = true;

						let mineral = (dismantlet3 >= boostTarget) ? RESOURCE_CATALYZED_ZYNTHIUM_ACID : ((dismantlet2 >= boostTarget) ? RESOURCE_ZYNTHIUM_ACID : RESOURCE_ZYNTHIUM_HYDRIDE);
						this.mem.labMemory[boostLabs[4].id].targetMineral = mineral;


						if (boostLabs[4].mineralType != this.mem.labMemory[boostLabs[4].id].targetMineral || boostLabs[4].mineralAmount < boostTarget) {
							techNeeded = true;
						}
					}
					else if (boostLabs[4]) {
						this.mem.labMemory[boostLabs[4].id].lockedForBoosts = false;
					}*/

					if (moveLab) {
						this.mem.labMemory[boostLabs[5].id].pickupLab = 1;
						this.mem.labMemory[boostLabs[5].id].reservedForBoosts = 1;

						this.mem.labMemory[boostLabs[5].id].boostMineral = RESOURCE_ZYNTHIUM_OXIDE;
					}

					if (dismantleLab) {
						this.mem.labMemory[boostLabs[6].id].pickupLab = 1;
						this.mem.labMemory[boostLabs[6].id].reservedForBoosts = 1;

						this.mem.labMemory[boostLabs[6].id].boostMineral = RESOURCE_ZYNTHIUM_HYDRIDE;
					}

					if (harvestLab) {
						this.mem.labMemory[boostLabs[7].id].pickupLab = 1;
						this.mem.labMemory[boostLabs[7].id].reservedForBoosts = 1;

						this.mem.labMemory[boostLabs[7].id].boostMineral = Memory.season2 ? RESOURCE_KEANIUM_HYDRIDE  : RESOURCE_UTRIUM_OXIDE;
					}


					if (toughLabRCL7 && sourceLabs[0]) {
						this.mem.labMemory[sourceLabs[0].id].reservedForBoosts = 1;
						this.mem.labMemory[sourceLabs[0].id].boostMineral = RESOURCE_GHODIUM_ALKALIDE;
					}
					if (dismantleLabRCL7 && sourceLabs[0]) {
						this.mem.labMemory[sourceLabs[0].id].reservedForBoosts = 1;
						this.mem.labMemory[sourceLabs[0].id].boostMineral = RESOURCE_ZYNTHIUM_HYDRIDE;
					}

					if (moveLabRCL7 && sourceLabs[1]) {
						this.mem.labMemory[sourceLabs[1].id].reservedForBoosts = 1;
						this.mem.labMemory[sourceLabs[1].id].boostMineral = RESOURCE_ZYNTHIUM_ALKALIDE;
					}

				}

				/*let upgradeLab = Memory.economyArena && labs.length >= 10;
				if (upgradeLab) {
					this.mem.labMemory[boostLabs[7].id].pickupLab = 1;
					// this.mem.labMemory[boostLabs[7].id].dropOffLab = 1;
					this.mem.labMemory[boostLabs[7].id].reservedForBoosts = 1;
					// this.mem.labMemory[boostLabs[7].id].lockedForBoosts = 1;

					// this.mem.labMemory[boostLabs[7].id].targetMineral = RESOURCE_GHODIUM_HYDRIDE;
					this.mem.labMemory[boostLabs[7].id].boostMineral = RESOURCE_GHODIUM_HYDRIDE;
				}*/

				if (sourceLabs.length == 2) {
					let targetCompound;
					let availableTargetCompounds;

					// These lists are ordered.
					if (Memory.economyArena) {
						availableTargetCompounds = [RESOURCE_GHODIUM,

													RESOURCE_ZYNTHIUM_KEANITE,
													RESOURCE_UTRIUM_LEMERGITE,

													RESOURCE_GHODIUM_HYDRIDE, // Upgrade.
													RESOURCE_GHODIUM_ACID, // Upgrade.
													RESOURCE_CATALYZED_GHODIUM_ACID, // Upgrade.
												];

					}
					else if (defensiveBoosts || this.defcon <= 3) {
						availableTargetCompounds = [RESOURCE_KEANIUM_OXIDE,
													RESOURCE_UTRIUM_HYDRIDE,
													RESOURCE_KEANIUM_ALKALIDE,
													RESOURCE_UTRIUM_ACID,
													RESOURCE_LEMERGIUM_HYDRIDE,
													RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
													RESOURCE_CATALYZED_UTRIUM_ACID,
													RESOURCE_HYDROXIDE];
					}
					else if (this.effectiveLevel == 8)  {
						availableTargetCompounds = [RESOURCE_LEMERGIUM_OXIDE, // HEAL
													RESOURCE_KEANIUM_OXIDE, // RA
													RESOURCE_ZYNTHIUM_OXIDE, // Move
													RESOURCE_UTRIUM_HYDRIDE, // Attack.
													RESOURCE_LEMERGIUM_HYDRIDE, // Repair

													RESOURCE_LEMERGIUM_ALKALIDE, // HEAL
													RESOURCE_KEANIUM_ALKALIDE, // RA
													RESOURCE_UTRIUM_ACID, // Attack
													RESOURCE_ZYNTHIUM_ALKALIDE, // Move

													RESOURCE_HYDROXIDE,

													RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, // Move
													RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, // Heal
													RESOURCE_CATALYZED_KEANIUM_ALKALIDE, // RA
													RESOURCE_CATALYZED_UTRIUM_ACID,  // Attack.

													// For nukers/safe modes. It has a cap on it
													RESOURCE_GHODIUM,

													RESOURCE_ZYNTHIUM_KEANITE,
													RESOURCE_UTRIUM_LEMERGITE,

													RESOURCE_CATALYZED_GHODIUM_ALKALIDE, // Tough
													RESOURCE_GHODIUM_ALKALIDE, // Tough
													RESOURCE_GHODIUM_OXIDE, // Tough

													RESOURCE_ZYNTHIUM_HYDRIDE, // Dismantle
													RESOURCE_ZYNTHIUM_ACID, // Dismantle
													RESOURCE_CATALYZED_ZYNTHIUM_ACID, // Dismantle


													// RESOURCE_GHODIUM_HYDRIDE, // Upgrade.
													// RESOURCE_GHODIUM_ACID, // Upgrade.
													// RESOURCE_CATALYZED_GHODIUM_ACID, // Upgrade.



													RESOURCE_LEMERGIUM_ACID, // Repair.
													RESOURCE_CATALYZED_LEMERGIUM_ACID,  // Repair.
												];
						// Prepend stuff that's preventing us launching missions.
						availableTargetCompounds = (this.mem.neededBoosts || []).concat(availableTargetCompounds);
					}
					else {
						availableTargetCompounds = [RESOURCE_KEANIUM_OXIDE, // RA
													RESOURCE_LEMERGIUM_OXIDE, // HEAL
													RESOURCE_ZYNTHIUM_OXIDE, // Move
													RESOURCE_UTRIUM_HYDRIDE, // Attack.
													RESOURCE_LEMERGIUM_HYDRIDE, // Repair

													RESOURCE_KEANIUM_ALKALIDE, // RA
													RESOURCE_LEMERGIUM_ALKALIDE, // HEAL
													RESOURCE_UTRIUM_ACID, // Attack
													RESOURCE_ZYNTHIUM_ALKALIDE, // Move

													RESOURCE_HYDROXIDE,

													RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, // Move
													RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, // Heal
													RESOURCE_CATALYZED_KEANIUM_ALKALIDE, // RA
													RESOURCE_CATALYZED_UTRIUM_ACID,  // Attack.
												];
						// Prepend stuff that's preventing us launching missions.
						availableTargetCompounds = (this.mem.neededBoosts || []).concat(availableTargetCompounds);
					}

					if ((Memory.season1 || Memory.season2) && this.defcon == 5 && !Memory.noHighPriorityDismantleBoost) {
						// Knocking down walls is important.
						if (Memory.cheapDismantle) {
							availableTargetCompounds = [RESOURCE_ZYNTHIUM_HYDRIDE].concat(availableTargetCompounds)
						}
						else {
							availableTargetCompounds = [RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_HYDROXIDE].concat(availableTargetCompounds)
						}
					}
					if (Memory.forceHealBoost) {
						availableTargetCompounds = [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_OXIDE, RESOURCE_HYDROXIDE].concat(availableTargetCompounds)
					}
					if (Memory.disableDismantleBoost) {
						_.pull(availableTargetCompounds, RESOURCE_ZYNTHIUM_HYDRIDE)
						_.pull(availableTargetCompounds, RESOURCE_ZYNTHIUM_ACID)
						_.pull(availableTargetCompounds, RESOURCE_CATALYZED_ZYNTHIUM_ACID)
					}

					// High tier epair is too situational for season 4
					if (Memory.season4 || Memory.season5) {
						_.pull(availableTargetCompounds, RESOURCE_LEMERGIUM_ACID)
						_.pull(availableTargetCompounds, RESOURCE_CATALYZED_LEMERGIUM_ACID)
					}


					// Spawn capactiy limited and booming. Use carry boost to save spawn capacity.
					if (Memory.boomMode && (Memory.season2 || Memory.stats.avgBucket > 9500) && !Memory.disableCarryBoost) {
						availableTargetCompounds = [RESOURCE_KEANIUM_HYDRIDE].concat(availableTargetCompounds)
					}
					global.useHarvestBoost = 0
					if ((!Memory.botArena || Memory.season5) && !Memory.disableHarvestBoost) {
						if (Memory.season5 || Memory.marketInfo.avgIValues[RESOURCE_OXYGEN] + Memory.marketInfo.avgIValues[RESOURCE_UTRIUM] < Memory.marketInfo.energyPrice * 2) {
							if (Memory.season5) {
								availableTargetCompounds = [RESOURCE_UTRIUM_OXIDE].concat(availableTargetCompounds)
							} else {
								availableTargetCompounds = availableTargetCompounds.concat([RESOURCE_UTRIUM_OXIDE])	
							}
							
							if (!Memory.season5) {
								global.useHarvestBoost = 1
							}
						}
					}
					console.log(this, availableTargetCompounds)


					// If this isn't at least 3 I run into problems: the room creates to fill local need up to 6k
					// rather than global need. This means I can be burning through boosts empire-wide while one
					// room builds up stockpiles of stuff I don't actually need right now.
					let minPass = Memory.empireStrength < 2 ? 2 : 1
					let maxPass = Memory.empireStrength < 10 ? (Memory.timedRound ? 7 : 10) : 15;

					if (Memory.season4) {
						maxPass = 2;
					}

					let baseMaxPass = maxPass

					Memory.lastBoostedAssaultInfo = Memory.lastBoostedAssaultInfo || {}

					// let a = Game.cpu.getUsed()

					for (let pass = minPass; pass <= maxPass; pass++) {
						for (var resourceType of availableTargetCompounds) {
							if (!RECIPES[resourceType]) continue;
							// Stock up on T3 to maxPass, otherwise pass==4.
							if (pass > 4 && REACTIONS[resourceType]) continue;
							if (pass > 2 && resourceType == RESOURCE_UTRIUM_OXIDE) continue;
							let targetAmount = pass * LAB_MINERAL_CAPACITY;

							if (Memory.season4 && util.isDismantleBoost(resourceType) && !this.mem.neededBoosts.includes(resourceType)) {
								continue
							}

							if ((this.mem.neededBoosts || []).includes(resourceType)) {
								targetAmount += LAB_MINERAL_CAPACITY;
							}

							if ((Memory.stats.globalResources[resourceType] || 0) / Game.myRooms.length < 1.5 * LAB_MINERAL_CAPACITY) {
								targetAmount += LAB_MINERAL_CAPACITY;
							}

							let tier = util.getBoostTier(resourceType)
							if (tier != 0) {
								if (Game.time - (Memory.lastBoostedAssaultInfo[tier] || -20000) < 2000) {
									targetAmount += 2 * LAB_MINERAL_CAPACITY
								}
							}

							if (Memory.botArena && Memory.maxRoomLevel != 8) {
								if (tier == 3) {
									targetAmount -= 2 * LAB_MINERAL_CAPACITY
								}
								else if (tier == 2) {
									targetAmount -= LAB_MINERAL_CAPACITY	
								}
							}

							if (Memory.season && !Memory.season4 && pass == maxPass && maxPass < baseMaxPass) {
								function getBaseComponents(resourceType) {
									let ret = [];

									if (RECIPES[resourceType]) {
										for (let ingredient of RECIPES[resourceType]) {
											ret = ret.concat(getBaseComponents(ingredient));
										}
									}
									else {
										ret.push(resourceType);
									}
									return _.uniq(ret);
								}

								// If we're not mining the ingredients... just cook
								let notMining = true;
								global.notMining = global.notMining || {}
								for (let ingredient of getBaseComponents(resourceType)) {
									if (Game.time - (global.notMining[ingredient] || 0) >= 1500) {
										notMining = false
										break
									}
								}
								if (notMining) {
									console.log("Not mining ingredients for", resourceType, "so increasing target")
									targetAmount += LAB_MINERAL_CAPACITY * (baseMaxPass - maxPass)
								}
							}

							if (pass != maxPass) {
								// Move boost tends to be used less than the others
								if (resourceType == RESOURCE_ZYNTHIUM_ALKALIDE) {
									targetAmount *= 0.75 + 0.25 * pass / maxPass
								}
								else if (resourceType == RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) {
									targetAmount *= 0.5 + 0.5 * pass / maxPass
								}
								// Dismantle is kinda not very worthwhile in general
								else if (resourceType == RESOURCE_ZYNTHIUM_HYDRIDE && (!Memory.season || Memory.lowPriorityDismantleBoost)) {
									targetAmount *= pass / maxPass
								}
								else if (resourceType == RESOURCE_ZYNTHIUM_ACID && (!Memory.season || Memory.lowPriorityDismantleBoost)) {
									targetAmount *= pass / maxPass
								}
								else if (resourceType == RESOURCE_CATALYZED_ZYNTHIUM_ACID && (!Memory.season || Memory.lowPriorityDismantleBoost)) {
									targetAmount *= pass / maxPass
								}
							}

							// Ingredients only
							if (resourceType == RESOURCE_ZYNTHIUM_KEANITE || resourceType == RESOURCE_UTRIUM_LEMERGITE) {
								targetAmount = Math.min(targetAmount, LAB_MINERAL_CAPACITY)
							}
							else if (resourceType == RESOURCE_HYDROXIDE) {
								targetAmount = Math.min(targetAmount, LAB_MINERAL_CAPACITY)
							}
							else if (resourceType == RESOURCE_GHODIUM) {
								targetAmount = Math.min(targetAmount, (LAB_MINERAL_CAPACITY + NUKER_GHODIUM_CAPACITY) * 1.25)
							}

							if (this.hasAtLeastXOfResource(resourceType, targetAmount)) {
								continue;
							}
							// if (this.getCurrentOfResource(resourceType) >= targetAmount) continue;


							let numIngredientsRequired = 0.75 * LAB_MINERAL_CAPACITY;

							// Wait a long while before doing extra repair boosts or heal boosts.
							// We need a good deal of heal for surge attacks, and repair above
							// T1 doesn't have much benefit.
							if (resourceType == RESOURCE_LEMERGIUM_ACID) {
								numIngredientsRequired = 3 * LAB_MINERAL_CAPACITY;
							}
							else if(resourceType == RESOURCE_CATALYZED_LEMERGIUM_ACID) {
								numIngredientsRequired = 3 * LAB_MINERAL_CAPACITY;
							}
							else if (resourceType == RESOURCE_LEMERGIUM_ALKALIDE ||
									 resourceType == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) {
								numIngredientsRequired = LAB_MINERAL_CAPACITY;
							}

							let hasIngredients = true;
							for (let ingredient of RECIPES[resourceType]) {
								// let currentAmount = this.getCurrentOfResource(ingredient);

								let numOfThisIngredientRequired = numIngredientsRequired
								// We bump up the ingredients required for some things above
								// But we only generate 1.5x lab capacity of the ingredients!
								if (ingredient == RESOURCE_HYDROXIDE || ingredient == RESOURCE_ZYNTHIUM_KEANITE || ingredient == RESOURCE_UTRIUM_LEMERGITE) {
									numOfThisIngredientRequired = Math.min(numOfThisIngredientRequired, 0.75 * LAB_MINERAL_CAPACITY);
								}

								if (!this.hasAtLeastXOfResource(ingredient, numOfThisIngredientRequired * (RECIPES[ingredient] ? 0.5 : 1))) {
									hasIngredients = false;
									break;
								}
							}


							if (hasIngredients)	{
								targetCompound = resourceType;
								if (this.mem.targetCompound != targetCompound) {
									console.log(this, "is going to start cooking", targetCompound)
								}
								this.mem.targetCompound = targetCompound;
								break;
							}
							else {
								// Don't let some get too far ahead. If they get ahread I don't sell to market or make stuff I need, but instead end up with 75k heal and 2k move (for example)
								maxPass = Math.min(maxPass, pass + 1)
							}
						}
						if (targetCompound) {
							break;
						}
					}

					// console.log(Game.cpu.getUsed() - a)

					if (!targetCompound && !Memory.season4) {
						for (var resourceType of availableTargetCompounds) {
							if (!RECIPES[resourceType]) continue;

							// Don't go too wild
							if (this.hasAtLeastXOfResource(resourceType, 50000)) {
								continue
							}

							function getBaseComponents(resourceType) {
								let ret = [];

								if (RECIPES[resourceType]) {
									for (let ingredient of RECIPES[resourceType]) {
										ret = ret.concat(getBaseComponents(ingredient));
									}
								}
								else {
									ret.push(resourceType);
								}
								return _.uniq(ret);
							}

							// If we're not mining the ingredients... just cook
							let notMining = true;
							global.notMining = global.notMining || {}
							for (let ingredient of getBaseComponents(resourceType)) {
								if (Game.time - (global.notMining[ingredient] || 0) >= 1500) {
									notMining = false
									break
								}
							}

							if (notMining) {
								console.log("Not mining ingredients for", resourceType, "and not cooking anything else, so cooking", resourceType)
								targetCompound = resourceType;
								if (this.mem.targetCompound != targetCompound) {
									console.log(this, "is going to start cooking", targetCompound)
								}
								this.mem.targetCompound = targetCompound;
								break;
							}
						}
					}

					if (!targetCompound && !Memory.season4) {
						for (var resourceType of availableTargetCompounds) {
							if (!RECIPES[resourceType]) continue;

							// If I have stupid amounts of ingredients cook stuff up.
							let hasIngredients = true;
							for (let ingredient of RECIPES[resourceType]) {
								let currentAmount = 0;
								if (this.storage) currentAmount += this.storage.store[ingredient] || 0;
								if (this.terminal) currentAmount += this.terminal.store[ingredient] || 0;

								if (currentAmount < 30 * LAB_MINERAL_CAPACITY) {
									hasIngredients = false;
									break;
								}
							}

							if (hasIngredients)	{
								targetCompound = resourceType;
								if (this.mem.targetCompound != targetCompound) {
									console.log(this, "is going to start cooking", targetCompound)
								}
								this.mem.targetCompound = targetCompound;
								break;
							}
						}
					}

					// Try to grab base components into the "centre" room
					if (!targetCompound) {
						if (this.effectiveLevel >= 7 && this.name == util.getEmpireCentreRoom()) {
							console.log("Centre room has no compound")
							for (let otherRoom of Game.myRooms) {
								if (otherRoom.transferred) continue
								if (!otherRoom.terminal || otherRoom.terminal.cooldown) continue
								if (otherRoom.mem.targetCompound) continue

								for (var resourceType of availableTargetCompounds) {
									if (!RECIPES[resourceType]) continue;
									if (util.getBoostTier(resourceType)) continue

									for (let ingredient of RECIPES[resourceType]) {
										if (otherRoom.hasAtLeastXOfResource(ingredient, 1000)) continue

										otherRoom.terminal.send(ingredient, otherRoom.terminal.store[ingredient], this.name)
										console.log(otherRoom, "sending", ingredient, "to", this, "as centre room")
										otherRoom.transferred = true
										break
									}
									if (otherRoom.transferred) {
										break
									}
								}

							}
						}
					}

					if (targetCompound && !this.clearTerminal) {
						for (let i = 0; i < 2; i++) {
							this.mem.labMemory[sourceLabs[i].id].targetMineral = RECIPES[targetCompound][i];
							this.mem.labMemory[sourceLabs[i].id].dropOffLab = 1;

							if (sourceLabs[i].mineralAmount == 0 || sourceLabs[i].mineral != RECIPES[targetCompound][i]) {
								techNeeded = true;
							}
						}

						for (let i = 0; i < boostLabs.length; i++) {
							if (!this.mem.labMemory[boostLabs[i].id].lockedForBoosts) {
								this.mem.labMemory[boostLabs[i].id].pickupLab = 1;
								delete this.mem.labMemory[boostLabs[i].id].maxAmount;
								// this.mem.labMemory[boostLabs[i].id].targetMineral = targetCompound;
								if (boostLabs[i].mineralAmount >= LAB_MINERAL_CAPACITY - 500 || boostLabs[i].mineral != targetCompound) {
									techNeeded = true;
								}
							}
						}
					}
					else {
						delete this.mem.targetCompound;
						console.log(this, "has nothing to cook")
					}
				}
				// console.log("labs b", Game.cpu.getUsed() - b);

			}
		}

		// Spawn a lab tech if we don't have one.
		if (techNeeded) {
			if ((this.mem.ownedCreeps["labTech"] || []).length == 0) {				
				var spawns = this.spawns;

				var currentlySpawning = false;
				for (let spawn of spawns) {
					if (spawn.memory.currentBuildingRole == "labTech") {
						currentlySpawning = true;
						break;
					}
				}

				if (!currentlySpawning && spawns[0]) {
					if (!spawns[0].hasPrioritySpawn("labTech")) {
						spawns[0].addPrioritySpawn("labTech")
					}
				}
			}
			else {
				for (let techName of this.mem.ownedCreeps["labTech"]) {
					delete Memory.creeps[techName].wT
				}
			}
		}

	}

	Room.prototype.find2 = function(type, opts) {
		var result = [];
		opts = opts || {};

		this.findCache = this.findCache || {};

		if (this.findCache[type]) {
			result = this.findCache[type];
		}
		else {
			result = this.find(type);
			this.findCache[type] = result;
		}

		if(opts.filter) {
			result = _.filter(result, opts.filter);
		}
		return result;
	}

	Room.prototype.calcEffectiveEnergy = function(includeTerminal = true) {
		if (includeTerminal && this.effectiveEnergy !== undefined) {
			return this.effectiveEnergy;
		}
		else if (!includeTerminal && this.effectiveEnergyNT !== undefined) {
			return this.effectiveEnergyNT;
		}

		if (!this.storage && !this.terminal) {
			let containers = roomAI.getSpawnBatteryContainers(this)

			let totalEnergy = 0;
			for (let container of containers) {
				// totalEnergy += container.store[RESOURCE_ENERGY]
				// If they've got other crap, we don't want to not do anything due to that other crap
				totalEnergy += container.store.getUsedCapacity()
			}
			
			if (this.spawns[0]) {				
				// Transporters will be recycling by our spawn
				for (let tombStone of this.spawns[0].pos.findInRange(FIND_TOMBSTONES, 1)) {
					// totalEnergy += container.store[RESOURCE_ENERGY]
					// If they've got other crap, we don't want to not do anything due to that other crap
					totalEnergy += (tombStone.store.energy || 0)
				}

				// Transporters will be recycling by our spawn
				for (let droppedEnergy of this.spawns[0].pos.findInRange(FIND_DROPPED_RESOURCES, 1)) {
					// totalEnergy += container.store[RESOURCE_ENERGY]
					// If they've got other crap, we don't want to not do anything due to that other crap
					if (droppedEnergy.resourceType != RESOURCE_ENERGY) continue
					totalEnergy += droppedEnergy.amount
				}
			}
			this.effectiveEnergy = totalEnergy;
			this.effectiveEnergyNT = totalEnergy;

			return this.effectiveEnergy
		}

		let roomEnergy = (this.storage ? (this.storage.store[RESOURCE_ENERGY] || 0) : 0) + (this.terminal ? (this.terminal.store[RESOURCE_ENERGY] || 0) : 0);
		if (this.factory) {
			roomEnergy += ((this.storage ? (this.storage.store[RESOURCE_BATTERY] || 0) : 0) + (this.terminal ? (this.terminal.store[RESOURCE_BATTERY] || 0) : 0)) * 10;
		}
		this.effectiveEnergyNT = roomEnergy

		if (!includeTerminal) {
			return this.effectiveEnergyNT
		}

		// Buddy energy is good energy.
		if (this.terminal) {
			if (this.upgradeFocus && this.defcon == 5) {
				// Assume we can pull in an appreciable fraction of this
				this.effectiveEnergy = this.effectiveEnergyNT + (Memory.terminalNetworkFreeEnergy || 0) / (Game.myRooms.length);
			}
			else {
				this.effectiveEnergy = this.effectiveEnergyNT + (Memory.terminalNetworkFreeEnergy || 0) / (Game.myRooms.length * this.defcon);
			}
		}
		else {
			this.effectiveEnergy = this.effectiveEnergyNT
		}

		return this.effectiveEnergy
	}

	Room.prototype.getUnboostLab = function(creep) {
		for (let lab of this.labs) {
			if (lab.isActive() && this.mem.labMemory[lab.id] && this.mem.labMemory[lab.id].dropOffLab && !lab.cooldown) {
				return lab
			}
		}

		if (creep) {			
			// Ignore dropOffLab and cut into boost labs
			for (let lab of this.labs) {
				if (lab.isActive() && lab.cooldown < creep.ticksToLive) {
					return lab
				}
			}
		}
	}


	Room.prototype.getLinks = function() {
		return this.links || [];
	}

	Room.prototype.getLabs = function() {
		return this.labs || [];
	}

	Room.prototype.getContainers = function() {
		return this.containers || [];
	}

	Room.prototype.getTowers = function() {
		return this.towers || [];
	}

	Room.prototype.canLaunchNuke = function() {
		// Need energy for this as well.
		let nuker = this.nuker;
		return (nuker && nuker.isActive() && nuker.cooldown == 0 && nuker.ghodium == nuker.ghodiumCapacity && nuker.energy == nuker.energyCapacity && (Memory.terminalNetworkFreeEnergy || 0) > 300e3);
	}

	Room.prototype.isCheapSafeMode = function() {
		let nukes = this.find(FIND_NUKES)

		for (let nuke of nukes) {
			if (nuke.timeToLand < 20000) {
				return true
			}
		}

		return false
	}

	Room.prototype.isAllowedSafeMode = function() {
		if (this.effectiveLevel == 8) return true;

		for (let room of Game.myRooms) {
			if (room != this && (room.effectiveLevel - this.effectiveLevel + (room.mem.outerWallDamageLevel || 0)) >= 7 + (Memory.botArena ? 2 : 0) && (room.controller.safeModeCooldown || 0) <= 20000) {
				console.log(this, "disallowing safe mode due to", room)
				// console.log(room.effectiveLevel, this.effectiveLevel, (room.mem.outerWallDamageLevel || 0))
				return false;
			}
		}

		let nukes = this.find(FIND_NUKES)

		if (nukes.length) {			
			let nextHit = Infinity
			for (let nuke of nukes) {
				if (nuke.timeToLand < nextHit) {
					nextHit = nuke.timeToLand
				}
			}
			if (nextHit <= 20000) {
				if ((this.controller.safeModeAvailable > 1 && nextHit > 50) || nextHit > 2000) {
					return true
				}
				else {
					return false
				}
			}			
			else if (this.effectiveLevel < 4) {
				return false
			}
		}

		return true;
	}

	// No global caching. Maybe I should. Hmm.
	Room.prototype.getMyActiveTowers = function() {
		if (this.myActiveTowers) {
			return this.myActiveTowers;
		}
		else {
			var myActiveTowers = _.filter(this.towers, (object) => object.my && object.energy >= 10 && object.isActive());

			this.myActiveTowers = myActiveTowers
			return this.myActiveTowers;
		}
	}

	Room.prototype.getStorageBatteryStructures = function() {
		if (this.storageBatteryStructures) {
			return this.storageBatteryStructures;
		}
		else if (global.storageBatteryStructures && global.storageBatteryStructures[this.name] && Math.random() > 0.02) {
			this.storageBatteryStructures = []
			for (var buildingId of global.storageBatteryStructures[this.name]) {
				if (Game.getObjectById(buildingId)) this.storageBatteryStructures.push(Game.getObjectById(buildingId));
			}
			return this.storageBatteryStructures;
		}
		else {
			var storageBatteryStructures = (new RoomPosition(this.mem.storageBatteryX, this.mem.storageBatteryY, this.name)).findInRange(FIND_MY_STRUCTURES, 1);

			this.storageBatteryStructures = _.filter(storageBatteryStructures, function(structure) {
				return structure.structureType != STRUCTURE_RAMPART;
			});

			global.storageBatteryStructures = global.storageBatteryStructures || {}
			global.storageBatteryStructures[this.name] = []
			for (var building of storageBatteryStructures) {
				global.storageBatteryStructures[this.name].push(building.id)
			}

			return this.storageBatteryStructures;
		}
	}

	Room.prototype.getMyInjuredCreeps = function() {
		if (!this.injuredCreeps) {
			this.injuredCreeps = this.find(FIND_MY_CREEPS, {
				filter: (creep) => {
					return (creep.hits != creep.hitsMax);
				}
			});
			this.injuredCreeps = this.injuredCreeps.concat(this.find(FIND_MY_POWER_CREEPS, {
				filter: (creep) => {
					return (creep.hits != creep.hitsMax);
				}
			}));
		}

		return this.injuredCreeps;
	}


	// Got to be a bit careful about this as creep.incomingDamageUB can change within the tick
	Room.prototype.getMyInjurableCreeps = function(skipCache = true) {
		if (!this.injurableCreeps || skipCache) {
			this.injurableCreeps = this.find(FIND_MY_CREEPS, {
				filter: (creep) => {
					return creep.incomingDamageUB === undefined ? (creep.hits != creep.hitsMax) : creep.incomingDamageUB > 0;
				}
			});
			this.injurableCreeps = this.injurableCreeps.concat(this.find(FIND_MY_POWER_CREEPS, {
				filter: (creep) => {
					return creep.incomingDamageUB === undefined ? (creep.hits != creep.hitsMax) : creep.incomingDamageUB > 0;
				}
			}));
		}

		return this.injurableCreeps;
	}


	Room.prototype.getSKLairs = function() {
		return this.keeperLairs;
	}

	Room.prototype.shouldUseRecycleLink = function() {
		if (this._shouldUseRecycleLink !== undefined) {
			return this._shouldUseRecycleLink
		}

		this._shouldUseRecycleLink = false;

		if (this.mem.spawnUtilization > 0.6) return false
		if (this.energyCapacity != this.energyCapacityAvailable) return false
		if (Memory.stats.extensionEnergy[this.name] < 0.95) return false



	}

	// While upgrading this can go out of date, making the spawn fail as we don't pass enough extensions.
	Room.prototype.getSpawnEnergyStructures = function() {
		if (this.spawnEnergyStructures) {
			return this.spawnEnergyStructures;
		}
		// Sometimes the harvesters aren't there. If we have bucket, we can afford to check this
		else if (Game.cpu.bucket > 9900) {
			var spawnEnergyStructures = this.spawns.concat(this.extensions);

			let harvesterExtensions = _.filter(spawnEnergyStructures, function(structure) {
				return roomAI.isHarvesterExtension(structure);
			});

			let p0structs = harvesterExtensions.filter(e => e.pos.findFirstInRange(FIND_MY_CREEPS, 1, {filter: (creep) => 
				{
					return creep.mem.hpt;
				}
			}))

			var p1structs
			if (this.effectiveLevel < 3 && this.mem.ownedCreeps["baseManager"] && this.mem.ownedCreeps["baseManager"].length && this.containers.length == 0) {
				p1structs  = _.filter(spawnEnergyStructures, function(structure) {
					return roomAI.isInSpawnBattery(structure) && structure.structureType == STRUCTURE_EXTENSION;
				});

				p1structs = p1structs.concat(this.spawns)
			}
			else {
				p1structs = _.filter(spawnEnergyStructures, function(structure) {
					return roomAI.isInSpawnBattery(structure);
				});
			}

			var p2structs = _.filter(spawnEnergyStructures, function(structure) {
				return roomAI.isInStorageBattery(structure);
			});

			// Maybe add harvester extensions here.
			var p3structs = _.filter(spawnEnergyStructures, function(structure) {
				return !roomAI.isInSpawnBattery(structure) && !roomAI.isInStorageBattery(structure) && !roomAI.isHarvesterExtension(structure);
			});

			p3structs.sort(function(s1, s2) {
				var origin = roomAI.getStorageBatteryCentre(s1.room.name);
				return Math.max(Math.abs(origin.x - s1.pos.x), Math.abs(origin.y - s1.pos.y)) - Math.max(Math.abs(origin.x - s2.pos.x), Math.abs(origin.y - s2.pos.y));
			});


			var p4structs = harvesterExtensions.filter(e => !e.pos.findFirstInRange(FIND_MY_CREEPS, 1, {filter: (creep) => 
				{
					return creep.mem.hpt;
				}
			}))

			this.spawnEnergyStructures = p0structs.concat(p1structs.concat(p2structs.concat(p3structs.concat(p4structs))))

			return this.spawnEnergyStructures;
		}
		else if (global.spawnEnergyStructures && global.spawnEnergyStructures[this.name] && global.spawnEnergyStructures[this.name].length && Math.random() > 0.01) {
			// console.log(global.spawnEnergyStructures[this.name])
			this.spawnEnergyStructures = []
			for (let i = 0; i < global.spawnEnergyStructures[this.name].length; i++) {
				this.spawnEnergyStructures.push(Game.getObjectById(global.spawnEnergyStructures[this.name][i]));
			}
			return this.spawnEnergyStructures;
		}
		else {
			var spawnEnergyStructures = this.spawns.concat(this.extensions);

			var p0structs = _.filter(spawnEnergyStructures, function(structure) {
				return roomAI.isHarvesterExtension(structure);
			});

			var p1structs
			if (this.effectiveLevel < 3 && this.mem.ownedCreeps["baseManager"] && this.mem.ownedCreeps["baseManager"].length && this.containers.length == 0) {
				p1structs  = _.filter(spawnEnergyStructures, function(structure) {
					return roomAI.isInSpawnBattery(structure) && structure.structureType == STRUCTURE_EXTENSION;
				});

				p1structs = p1structs.concat(this.spawns)
			}
			else {
				p1structs = _.filter(spawnEnergyStructures, function(structure) {
					return roomAI.isInSpawnBattery(structure);
				});
			}

			var p2structs = _.filter(spawnEnergyStructures, function(structure) {
				return roomAI.isInStorageBattery(structure);
			});

			// Maybe add harvester extensions here.
			var p3structs = _.filter(spawnEnergyStructures, function(structure) {
				return !roomAI.isInSpawnBattery(structure) && !roomAI.isInStorageBattery(structure) && !roomAI.isHarvesterExtension(structure);
			});

			p3structs.sort(function(s1, s2) {
				var origin = roomAI.getStorageBatteryCentre(s1.room.name);
				return Math.max(Math.abs(origin.x - s1.pos.x), Math.abs(origin.y - s1.pos.y)) - Math.max(Math.abs(origin.x - s2.pos.x), Math.abs(origin.y - s2.pos.y));
			});


			this.spawnEnergyStructures = p0structs.concat(p1structs.concat(p2structs.concat(p3structs)))

			global.spawnEnergyStructures = global.spawnEnergyStructures || {}
			global.spawnEnergyStructures[this.name] = []
			for (let i = 0; i < this.spawnEnergyStructures.length; i++) {
				global.spawnEnergyStructures[this.name].push(this.spawnEnergyStructures[i].id)
			}

			return this.spawnEnergyStructures;
		}
	},

	Room.prototype.findExitPosForCreepID = function(creepID) {
		// Autocached
		let eventLog = this.getEventLog()

		// Could cache this
		for (let event of eventLog) {
			if (event.event == EVENT_EXIT && event.objectId == creepID) {
				return new RoomPosition(event.data.x, event.data.y, event.data.room)
			}
		}
	},

	Room.prototype.filterForBodyParts = function(bodyParts, activeOnly, creeps) {
		let retList = [];
		if (activeOnly) {
			for (let creep of creeps) {
				if (creep.hits > creep.hitsMax - 100) {
					// Copy paste from below. Naughty.
					global._creepBodyParts = global._creepBodyParts || {};
					if (global._creepBodyParts[creep.id]) {
						creep.bodyParts = global._creepBodyParts[creep.id];
					}
					if (!creep.bodyParts) {
						let obj = {};

						for(let i = creep.body.length - 1; i >= 0; i--) {
							obj[creep.body[i].type] = (obj[creep.body[i].type] || 0) + 1;
						}

						creep.bodyParts = obj;
						global._creepBodyParts[creep.id] = creep.bodyParts;
					}

					for (let bodyPart of bodyParts) {
						if (creep.bodyParts[bodyPart]) {
							retList.push(creep);
							break;
						}
					}
				}
				else {					
					if (!creep.activeBodyParts) {
						let obj = {};
						for(let i = creep.body.length - 1; i >= 0; i--) {
							if (creep.body[i].hits <= 0) {
								break;
							}
							obj[creep.body[i].type] = (obj[creep.body[i].type] || 0) + 1;
						}
						creep.activeBodyParts = obj;
					}
					for (let bodyPart of bodyParts) {
						if (creep.activeBodyParts[bodyPart]) {
							retList.push(creep);
							break;
						}
					}
				}
			}
		}
		else {
			global._creepBodyParts = global._creepBodyParts || {};
			for (let creep of creeps) {
				if (global._creepBodyParts[creep.id]) {
					creep.bodyParts = global._creepBodyParts[creep.id];
				}
				if (!creep.bodyParts) {
					let obj = {};

					for(let i = creep.body.length - 1; i >= 0; i--) {
						obj[creep.body[i].type] = (obj[creep.body[i].type] || 0) + 1;
					}

					creep.bodyParts = obj;
					global._creepBodyParts[creep.id] = creep.bodyParts;
				}

				for (let bodyPart of bodyParts) {
					if (creep.bodyParts[bodyPart]) {
						retList.push(creep);
						break;
					}
				}
			}
		}
		return retList;
	},

	Room.prototype.getAllFriendlyCreepsWithBodyParts = function(bodyParts, activeOnly) {
		var hash = JSON.stringify(bodyParts.sort())

		this.friendlyCreepsWithBodyParts = this.friendlyCreepsWithBodyParts || {}
		this.activeFriendlyCreepsWithBodyParts = this.activeFriendlyCreepsWithBodyParts || {}

		if (activeOnly && this.activeFriendlyCreepsWithBodyParts[hash]) {
			return this.activeFriendlyCreepsWithBodyParts[hash]
		}
		else if (this.friendlyCreepsWithBodyParts[hash]) {
			return this.friendlyCreepsWithBodyParts[hash]
		}

		let creeps = this.find(FIND_MY_CREEPS);

		let retList = this.filterForBodyParts(bodyParts, activeOnly, creeps)


		if (activeOnly) {
			this.activeFriendlyCreepsWithBodyParts[hash] = retList;
			return this.activeFriendlyCreepsWithBodyParts[hash];
		}
		else {
			this.friendlyCreepsWithBodyParts[hash] = retList;
			return this.friendlyCreepsWithBodyParts[hash];
		}
	}


	Room.prototype.getAllHostileCreepsWithBodyParts = function(bodyParts, activeOnly) {
		var hash = JSON.stringify(bodyParts.sort())

		this.hostileCreepsWithBodyParts = this.hostileCreepsWithBodyParts || {}
		this.activeHostileCreepsWithBodyParts = this.activeHostileCreepsWithBodyParts || {}

		if (activeOnly && this.activeHostileCreepsWithBodyParts[hash]) {
			return this.activeHostileCreepsWithBodyParts[hash]
		}
		else if (this.hostileCreepsWithBodyParts[hash]) {
			return this.hostileCreepsWithBodyParts[hash]
		}

		let creeps = this.find(FIND_HOSTILE_CREEPS);

		if (Memory.swc === 1) {
			creeps = _.filter(creeps, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
		}
		else if (Memory.season) {
			creeps = _.filter(creeps, (threat) => (!scouting.isPlayerMediumWhiteListed(threat.owner.username)));
		}

		let retList = this.filterForBodyParts(bodyParts, activeOnly, creeps)


		if (activeOnly) {
			this.activeHostileCreepsWithBodyParts[hash] = retList;
			return this.activeHostileCreepsWithBodyParts[hash];
		}
		else {
			this.hostileCreepsWithBodyParts[hash] = retList;
			return this.hostileCreepsWithBodyParts[hash];
		}
	}

	Room.prototype.getAllHostileCreepsAndPowerCreeps = function() {
		if (!this._hostileCreepsAndPowerCreeps) {
			this._hostileCreepsAndPowerCreeps = this.find(FIND_HOSTILE_CREEPS).concat(this.find(FIND_HOSTILE_POWER_CREEPS))
			if (Memory.swc === 1) {
				this._hostileCreepsAndPowerCreeps = _.filter(this._hostileCreepsAndPowerCreeps, (creep) => (!global.whiteList.includes(creep.owner.username)));
			}
			else if (Memory.season) {
				this._hostileCreepsAndPowerCreeps = _.filter(this._hostileCreepsAndPowerCreeps, (creep) => (!scouting.isPlayerMediumWhiteListed(creep.owner.username)));
			}
		}

		return this._hostileCreepsAndPowerCreeps
	}


	Room.prototype.runRoomCombat = function() {
		if (Game.cpu.bucket < 1000) return
		let combatCreeps

		if (this.isEnemyRoom()) {
		 	combatCreeps = this.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL, WORK])
		}
		else {
			combatCreeps = this.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL])
		}
		let allCreeps = combatCreeps.concat(this.find(FIND_MY_POWER_CREEPS))
		// if (allCreeps.length < 2) return

		// let snakeNames = []

		
		// let adHocFormations = []

		// Try some open space strategies.
		// Really we want "surround and smash"
		/*if ((!this.controller || !this.controller.owner) && roomIntel.getSwampRatio(this.name) + roomIntel.getWallRatio(this.name) < 0.3) {
			let creepCombatPartsRanged = 0;
			let creepCombatPartsAttack = 0;
			let creepCombatPartsHeal = 0;

			let creepRanged = 0;
			let creepAttack = 0;
			let creepHeal = 0;


			// If we're heavily outnumbering them, push flanking
			for (let combatCreep of combatCreeps) {
				var combatParts = combatCreep.getBoostModifiedCombatParts(false, true);
				creepCombatPartsRanged += combatParts.numRanged;
				creepCombatPartsAttack += combatParts.numAttack;
				creepCombatPartsHeal += combatParts.numHeal;

				if (combatParts.numRanged) creepRanged++;
				if (combatParts.numAttack) creepAttack++;
				if (combatParts.numHeal) creepHeal++;

			}

			// We outnumber them
			if (creepCombatPartsRanged >= 2 * (this.mem.creepCombatPartsRanged || 0) &&
				creepCombatPartsAttack >= 2 * (this.mem.creepCombatPartsAttack || 0) &&
				creepCombatPartsHeal >= 2 * (this.mem.creepCombatPartsHeal || 0)) {

				let step = 0;
				let step = 0;

				for (let combatCreep of combatCreeps) {
					combatCreep.combatMoveSkew = step % 3
				}
			}
			else {

			}
		}*/

		// if (allCreeps.length && (combatCreeps.length || Game.cpu.bucket > 3000 || this.isEnemyRoom())) {
		if (combatCreeps.length) {
			let names = []
			for (let creep of allCreeps) {
				names.push(creep.name)
			}

			global.roomCombatIntents += roomCombat.roomApplyHeal(Game.creeps[names[0]] || Game.powerCreeps[names[0]], names)
		}


		let creepCombatPartsRanged = 0;
		let creepCombatPartsAttack = 0;
		let creepCombatPartsHeal = 0;

		let targetRoomCreepCombatPartsRanged = 0;
		let targetRoomCreepCombatPartsAttack = 0;
		let targetRoomCreepCombatPartsHeal = 0;


		for (let creep of combatCreeps) {
			var combatParts = creep.getBoostModifiedCombatParts(false, false);
			creepCombatPartsRanged += combatParts.numRanged;
			creepCombatPartsAttack += combatParts.numAttack;
			creepCombatPartsHeal += combatParts.numHeal;

			if (creep.mem.targetRoom == this.name) {
				targetRoomCreepCombatPartsRanged += combatParts.numRanged;
				targetRoomCreepCombatPartsAttack += combatParts.numAttack;
				targetRoomCreepCombatPartsHeal += combatParts.numHeal;					
			}
		}

		// We only do this for intershard right now
		if (!Memory.botArena) {
			if (global.runningIntershardLocal) {				
				// Ignore invaders
				let hostileCreeps = this.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL])
				hostileCreeps = _.filter(hostileCreeps,
					function(creep) {
						return (creep.owner.username != "Invader")
					}
				);

				if (hostileCreeps.length) {		
					let modeNumRanged = []
					let modeNumAttack = []
					let modeNumHeal = []
					let modeNumTough = []


					for (let creep of hostileCreeps) {
						var combatParts = creep.getBoostModifiedCombatParts(false, true);

						// Track the MODE heal/tough/ranged/attack
						// We can then build toward that.
						// No modifiers on BMCP - we'll do that ourselves
						if (combatParts.numRanged) {
							modeNumRanged.push(combatParts.numRanged)
						}
						if (combatParts.numAttack) {
							modeNumAttack.push(combatParts.numAttack)
						}
						if (combatParts.numHeal) {
							modeNumHeal.push(combatParts.numHeal)
						}
						if (combatParts.numTough) {
							modeNumTough.push(combatParts.numTough)
						}
					}

					const alphaMode = Math.exp(-(1/1000.));

					// Bit weird to have a mode moving average, but otherwise it's the last creep to die, which skews things massively
					this.mem.modeRanged = alphaMode * (this.mem.modeRanged || util.calcMode(modeNumRanged)) + (1 - alphaMode) * util.calcMode(modeNumRanged)
					this.mem.modeAttack = alphaMode * (this.mem.modeAttack || util.calcMode(modeNumAttack)) + (1 - alphaMode) * util.calcMode(modeNumAttack)
					this.mem.modeHeal = alphaMode * (this.mem.modeHeal || util.calcMode(modeNumHeal)) + (1 - alphaMode) * util.calcMode(modeNumHeal)
					this.mem.modeTough = alphaMode * (this.mem.modeTough || util.calcMode(modeNumTough)) + (1 - alphaMode) * util.calcMode(modeNumTough)

					if (this.mem.modeRanged < 0.1) {
						delete this.mem.modeRanged			
					}
					else {
						this.mem.modeRanged = Math.round(this.mem.modeRanged * 10000) / 10000
					}

					if (this.mem.modeAttack < 0.1) {
						delete this.mem.modeAttack
					}
					else {
						this.mem.modeAttack = Math.round(this.mem.modeAttack * 10000) / 10000
					}

					if (this.mem.modeHeal < 0.1) {
						delete this.mem.modeHeal
					}
					else {
						this.mem.modeHeal = Math.round(this.mem.modeHeal * 10000) / 10000	
					}

					if (this.mem.modeTough < 0.1) { 
						delete this.mem.modeTough
					}
					else {
						this.mem.modeTough = Math.round(this.mem.modeTough * 10000) / 10000
					}
				}
				else if (this.mem.DT < 0.01) {
					delete this.mem.modeRanged
					delete this.mem.modeAttack
					delete this.mem.modeHeal
					delete this.mem.modeTough
				}
			}
			else {
				delete this.mem.modeRanged
				delete this.mem.modeAttack
				delete this.mem.modeHeal
				delete this.mem.modeTough
			}
		}


		// 2x alpha_danger2 from roomAI, so halfs the impact.

		if (combatCreeps.length) {			
			const alpha = Math.exp(-(1/1000.));
			for (let i = 0; i < 10; i++) {				
				if (targetRoomCreepCombatPartsRanged >= (1.5 + i) * (this.mem.creepCombatPartsRanged || 0) &&
					targetRoomCreepCombatPartsAttack >= (1.5 + i) * (this.mem.creepCombatPartsAttack || 0) &&
					targetRoomCreepCombatPartsHeal >= (1.5 + i) * (this.mem.creepCombatPartsHeal || 0)) {

					
					// Are we going to win? If so, squish danger tracking a little
					// This is highway rooms only, and only if I'm aiming to clear this room.
					// If I'm doing that, normally it means I'll camp it
					if (this.highway && this.mem.DT > 1.2) {			
						// console.log("Normalizing DT", this.mem.DT, this)
						this.mem.DT = alpha * this.mem.DT + (1 - alpha) * 1.2;
					}
				}
				else {
					break;
				}
			}

			this.mem.DT = Math.round(this.mem.DT * 1000000) / 1000000;


			let myCombatParts = (creepCombatPartsRanged + creepCombatPartsAttack + creepCombatPartsHeal)
			let enemyCombatParts = ((this.mem.creepCombatPartsRanged || 0) + (this.mem.creepCombatPartsAttack || 0) + (this.mem.creepCombatPartsHeal || 0))

			if (enemyCombatParts) {
				this.roomStrength = myCombatParts / enemyCombatParts
			}
		}

	}

	Room.prototype.runCarrySwaps = function() {
		let allowedSwapRoles = ["repairer", "builder", "fetcher", "baseManager", "lootFetcher", "seasonFetcher", "transporter"]
		// let allowedSwapRoles = ["repairer", "builder", "fetcher", "baseManager", "pioneer"]

		// Season fetchers are tricky. I want them to swap but they'll fuck up and run out of TTL in the field

		for (let creep of this.find(FIND_MY_CREEPS)) {
			if (!allowedSwapRoles.includes(creep.mem.role) || creep.mem.f || !creep.mem.path || creep.mem.path.length == 1 || !creep.mem.lP) continue

			if (creep.carrySwapped) continue

			let resourceType = false;
			for (let loopResourceType in creep.store) {
				if (creep.store[loopResourceType] == creep.getStoreUsedCapacity()) {
					resourceType = loopResourceType;
					break;
				}
			}
			// Allow them to swap if both empty
			if (!resourceType && Object.keys(creep.store).length) continue

			for (let otherCreep of creep.pos.findInRange(FIND_MY_CREEPS, 1)) {
				if (otherCreep.carrySwapped) continue
				if (otherCreep.mem.sR != creep.mem.sR && creep.mem.role != "seasonFetcher") continue
				if (otherCreep.mem.role != creep.mem.role || !otherCreep.mem.f || !otherCreep.mem.path || otherCreep.mem.path.length == 1 || !otherCreep.mem.lP) continue
				if (otherCreep.getStoreUsedCapacity() != 0) continue
				if (otherCreep.store.getCapacity() != creep.store.getCapacity() || otherCreep.getNumOfBodyPart(MOVE) != creep.getNumOfBodyPart(MOVE)) continue

				if (creep.ticksToLive < Math.min(500, creep.mem.path.length + otherCreep.mem.path.length) && creep.ticksToLive < otherCreep.ticksToLive) continue

				let creepPathOffset;
				let otherCreepPathOffset;

				if (creep.mem.path.length && creep.mem.lP && (creep.mem.lP.x != creep.pos.x || creep.mem.lP.y != creep.pos.y) && (!util.isEdgeOfRoom(creep.pos) || !util.isEdgeOfRoom(creep.mem.lP))) {
					creepPathOffset = 1
				}
				else {
					creepPathOffset = 0
				}

				if (otherCreep.mem.path.length && otherCreep.mem.lP && (otherCreep.mem.lP.x != otherCreep.pos.x || otherCreep.mem.lP.y != otherCreep.pos.y) && (!util.isEdgeOfRoom(otherCreep.pos) || !util.isEdgeOfRoom(otherCreep.mem.lP))) {
					otherCreepPathOffset = 1
				}
				else {
					otherCreepPathOffset = 0
				}


				if (creep.pos.getDirectionTo(otherCreep.pos) != creep.mem.path[creepPathOffset]) continue
				if (otherCreep.pos.getDirectionTo(creep.pos) != otherCreep.mem.path[otherCreepPathOffset]) continue

				if (!resourceType || creep.transfer(otherCreep, resourceType) == OK) {
					if (resourceType) {						
						let amount = creep.store[resourceType]
						creep.store[resourceType] = 0;
						global._creepStoreUsedCapacity[creep.id] = 0;

						otherCreep.store[resourceType] = amount;
						global._creepStoreUsedCapacity[otherCreep.id] = amount;
					}

					creep.carrySwapped = 1;
					otherCreep.carrySwapped = 1;

					let creepTmpMem = _.cloneDeep(creep.mem)
					let otherCreepTmpMem = _.cloneDeep(otherCreep.mem)

					// console.log(creep, otherCreep, JSON.stringify(creep.mem), JSON.stringify(otherCreep.mem))

					delete creep.mem.lP
					creep.mem.path = otherCreepTmpMem.path.substr(1 + otherCreepPathOffset)
					creep.mem.pTX = otherCreepTmpMem.pTX
					creep.mem.pTY = otherCreepTmpMem.pTY
					creep.mem.pTgtRoom = otherCreepTmpMem.pTgtRoom
					creep.mem.pO = otherCreepTmpMem.pO
					creep.mem.f = otherCreepTmpMem.f
					creep.mem.fT = otherCreepTmpMem.fT
					creep.mem.fR = otherCreepTmpMem.fR
					creep.mem.dTgt = otherCreepTmpMem.dTgt
					creep.mem.bTgt = otherCreepTmpMem.bTgt
					creep.mem.rTgt = otherCreepTmpMem.rTgt
					creep.mem.fP = otherCreepTmpMem.fP
					creep.mem.dP = otherCreepTmpMem.dP
					creep.mem.targetRoom = otherCreepTmpMem.targetRoom
					delete creep.mem.fct
					delete creep.mem.wT
					delete creep.mem.mS
					delete creep.mem.stuckPath

					delete otherCreep.mem.lP
					otherCreep.mem.path = creepTmpMem.path.substr(1 + creepPathOffset)
					otherCreep.mem.pTX = creepTmpMem.pTX
					otherCreep.mem.pTY = creepTmpMem.pTY
					otherCreep.mem.pTgtRoom = creepTmpMem.pTgtRoom
					otherCreep.mem.pO = creepTmpMem.pO
					otherCreep.mem.f = creepTmpMem.f
					otherCreep.mem.fT = creepTmpMem.fT
					otherCreep.mem.fR = creepTmpMem.fR
					otherCreep.mem.dTgt = creepTmpMem.dTgt
					otherCreep.mem.bTgt = creepTmpMem.bTgt
					otherCreep.mem.rTgt = creepTmpMem.rTgt
					otherCreep.mem.fP = creepTmpMem.fP
					otherCreep.mem.dP = creepTmpMem.dP
					otherCreep.mem.targetRoom = creepTmpMem.targetRoom
					delete otherCreep.mem.fct
					delete otherCreep.mem.wT
					delete otherCreep.mem.mS
					delete otherCreep.mem.stuckPath

					// Need to delay one tick for carry to become actually free
					if (creep.mem.fT && Game.getObjectById(creep.mem.fT) && creep.pos.isNearToPos(Game.getObjectById(creep.mem.fT).pos)) {
						creep.mem.wT = Game.time + 1
					}

					creep.say("S1")
					otherCreep.say("S2")

					// console.log(creep, otherCreep, JSON.stringify(creep.mem), JSON.stringify(otherCreep.mem))
				}
			}
		}


		let buildTargetRoles = ["builder", "repairer", "upgrader"]

		// Stuck haulers give to anybody with carry and work
		for (let creep of this.find(FIND_MY_CREEPS)) {

			if (creep.mem.role != "fetcher" || creep.mem.f || creep.carrySwapped) continue
			if (Game.rooms[creep.mem.sR].energyAvailable != Game.rooms[creep.mem.sR].energyCapacityAvailable &&
				(!Game.rooms[creep.mem.sR].storage || Game.rooms[creep.mem.sR].storage.store[RESOURCE_ENERGY] < 50000) &&
				!Game.rooms[creep.mem.sR].terminal) continue
			if (creep.carry.energy != creep.getStoreUsedCapacity()) continue

			for (let otherCreep of creep.pos.findInRange(FIND_MY_CREEPS, 1)) {
				if (otherCreep.carrySwapped) continue
				if (otherCreep.store.getFreeCapacity() < creep.carry.energy) continue
				if (!buildTargetRoles.includes(otherCreep.mem.role)) continue

				if (creep.transfer(otherCreep, RESOURCE_ENERGY) == OK) {
					let amount = creep.carry.energy

					creep.carrySwapped = 1;
					otherCreep.carrySwapped = 1;

					creep.carry.energy = 0
					global._creepStoreUsedCapacity[creep.id] = 0

					otherCreep.carry.energy = (otherCreep.carry.energy || 0) + amount;
					global._creepStoreUsedCapacity[otherCreep.id] = (global._creepStoreUsedCapacity[otherCreep.id] || 0) + amount;

					delete otherCreep.mem.path

					if (Math.random() < 0.2) {
						delete otherCreep.mem.rTgt
					}

					break
				}
			}
		}

		// for (let creep of this.find(FIND_MY_CREEPS)) {
		// 	if (creep.mem.role != "fetcher" || !creep.mem.mS || creep.mem.f || creep.carrySwapped) continue
		// 	if (creep.carry.energy != creep.getStoreUsedCapacity()) continue

		// 	let bestOtherCreep
		// 	let maxTransfer = 0

		// 	for (let otherCreep of creep.pos.findInRange(FIND_MY_CREEPS, 1)) {
		// 		if (otherCreep.carrySwapped) continue
		// 		if (!otherCreep.store.getFreeCapacity()) continue
		// 		if (!buildTargetRoles.includes(otherCreep.mem.role)) continue

		// 		if (otherCreep.store.getFreeCapacity() > maxTransfer) {
		// 			bestOtherCreep = otherCreep
		// 			maxTransfer = otherCreep.store.getFreeCapacity()
		// 		}

		// 	}
		// 	if (bestOtherCreep && creep.transfer(bestOtherCreep, RESOURCE_ENERGY) == OK) {
		// 		creep.carrySwapped = 1;
		// 		bestOtherCreep.carrySwapped = 1;
		// 	}
		// }
	}

	Room.prototype.runDangerTracking = function() {
		let mem = Memory.rooms[this.name]

		if (mem.DT === undefined) {
			mem.DT = 1;
		}
		if ((mem.DT < 0.02 && Math.random() > 0.5) && !mem.lh && !mem.nukeLandTime && !mem.owner) {
			this.dangerous = 0;
			// delete this.mem.campSiteX
			// delete this.mem.campSiteY
			return
		}

		let allTargets = this.getAllHostileCreepsAndPowerCreeps();

		// if (Memory.swc) {
		// 	allTargets = _.filter(allTargets, (threat) => (!global.whiteList.includes(threat.owner.username)));
		// }

		let humanTargets = allTargets.length ? _.filter(allTargets, (target) => {return target.owner.username != "Source Keeper" && target.owner.username != "Invader" && target.owner.username != "Screeps"}) : [];

		this.hasHostiles = allTargets.length > 0;
		this.humanTargets = humanTargets;

		let allTargetInfos = [];

		if (this.hasHostiles) {
			let myCreeps = this.find(FIND_MY_CREEPS)
			// Slightly more expensive but stops collisions.
			for (let creep of myCreeps) {
				creep.move = creep.trackedMove
			}

			mem.lh = 1;
			mem.requestHelpAgainst = mem.requestHelpAgainst || [];
			mem.requestHelpAgainst[Game.time % 2] = {};

			// All this shit is for neutral rooms.
			if (!this.controller || !this.controller.owner) {
				// Keep eyes on.
				if (humanTargets.length > 0 && this.find(FIND_MY_CREEPS).length == 0 && !Memory.scoutRooms.includes(this.name)) {
					Memory.scoutRooms.push(this.name)
				}

				let antiCampTargets = _.filter(humanTargets, (target) => {return !scouting.isPlayerSoftWhiteListed(target.owner.username) && Memory.stats.hateCounter[target.owner.username] > 100000})

				if (Memory.season2) {
					antiCampTargets = _.filter(antiCampTargets, (target) => {return target.owner.username != "Kasami"})
				}
				
				// let dangerousHumanTargets = _.filter(humanTargets, (target) => {return target.hasBodypart(ATTACK) || target.hasBodypart(RANGED_ATTACK)});
				if (antiCampTargets.length > 0 && _.some(antiCampTargets, (target) => {return target.hasBodypart(ATTACK) || target.hasBodypart(RANGED_ATTACK)})) {
					if (mem.hostileCampCheck) {
						mem.hostileCampCheck++;
						if (mem.hostileCampCheck > 400 && this.find(FIND_MY_CREEPS).length) {
							for (let creep of this.find(FIND_MY_CREEPS)) {
								// Don't fire for scouts
								if (creep.body.length > 1) {
									Memory.combatManager.requestedMissions["roomAntiCamp"][this.name] = Game.time;
									break
								}
							}
						}
					}
					else {
						mem.hostileCampCheck = 1
					}
				}
				else {
					delete mem.hostileCampCheck 
				}

				if (!this.highway) {					
					mem.campSiteX = mem.campSiteX || 25;
					mem.campSiteY = mem.campSiteY || 25;
				}

				let creepCombatPartsRanged = 0;
				let creepCombatPartsAttack = 0;
				let creepCombatPartsHeal = 0;

				let creepRanged = 0;
				let creepAttack = 0;
				let creepHeal = 0;

				mem.creepCnt = 0;
				let hostileBoostedCreeps = 0
				for (let creep of humanTargets) {
					var combatParts = creep.getBoostModifiedCombatParts(false, false);
					creepCombatPartsRanged += combatParts.numRanged;
					creepCombatPartsAttack += combatParts.numAttack;
					creepCombatPartsHeal += combatParts.numHeal;

					if (combatParts.numRanged || combatParts.numAttack || combatParts.numHeal) {
						mem.creepCnt++;
					}


					if (combatParts.numRanged) creepRanged++;
					if (combatParts.numAttack) creepAttack++;
					if (combatParts.numHeal) creepHeal++;

					if ((combatParts.numRanged || combatParts.numAttack) && creep.hasBoost()) {
						hostileBoostedCreeps++;
					}

					if (!this.highway) {
						mem.campSiteX = mem.campSiteX * alpha_camp + creep.pos.x * (1 - alpha_camp);
						mem.campSiteY = mem.campSiteY * alpha_camp + creep.pos.y * (1 - alpha_camp);

						mem.campSiteX = Math.round(mem.campSiteX * 10000) / 10000
						mem.campSiteY = Math.round(mem.campSiteY * 10000) / 10000
					}
				}

				delete mem.hostileBoostedCreeps
				delete mem.creepCombatPartsRanged
				delete mem.creepCombatPartsAttack
				delete mem.creepCombatPartsHeal

				if (hostileBoostedCreeps) mem.hostileBoostedCreeps = hostileBoostedCreeps;
				if (creepCombatPartsRanged) mem.creepCombatPartsRanged = creepCombatPartsRanged;
				if (creepCombatPartsAttack) mem.creepCombatPartsAttack = creepCombatPartsAttack;
				if (creepCombatPartsHeal) mem.creepCombatPartsHeal = creepCombatPartsHeal;

				if (creepRanged) mem.creepRanged = creepRanged;
				if (creepAttack) mem.creepAttack = creepAttack;
				if (creepHeal) mem.creepHeal = creepHeal;
			}

			if (this.highway) {
				let convoyTargets;
				let edgeConvoy = false;
				for (let creep of allTargets) {
					if (creep.owner.username == "Screeps") {
						convoyTargets = convoyTargets || [];
						if (convoyTargets.length == 0) {
							// if (Game.time % 200 == 0) Game.notify("CONVOY DETECTED " + this + " " + Game.time)
							if (Memory.season4) {
								Game.notify("CONVOY DETECTED " + this.name)
							}
							if (Game.time % 10 == 0) console.log("CONVOY DETECTED", this);
							for (let room of Game.myRooms) {
								if (room.mem.observeRoom == this.name) {
									room.repeatObservation = 1;
									break;
								}
							}
						}

						if (creep.pos.x <= 1 || creep.pos.x >= 48 || creep.pos.y <= 1 || creep.pos.y >= 48) {
							// Game.notify("CONVOY ON EDGE " + this + " " + Game.time)
							// console.log("CONVOY ON EDGE", this);
							edgeConvoy = true;
						}
						convoyTargets.push(creep);
					}
					else {
						// Hmm. Any haulers with minerals? A supply line maybe
						if (creep.store.getUsedCapacity() != creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
							if (Game.time % 10 == 0) console.log("RESOURCE MOVING DETECTED", this);

							if (Memory.season1 && this.mem.seasonDropOffAvailable) {
								Memory.combatManager.requestedMissions[global.MISSION_SEASONAL_DROP_RAID][this.name] = Game.time;
								combatManager.requestSeasonDropRaid(this.name)
							}

						}
					}
				}

				if (convoyTargets && mem.convoyPositions) {
					let done = false
					// Why is this a 2D loop in the first place?
					for (let convoyPosition of mem.convoyPositions) {
						for (let convoyTarget of convoyTargets) {
							if (convoyTarget.id == convoyPosition.id && (convoyTarget.pos.x != convoyPosition.pos.x || convoyTarget.pos.y != convoyPosition.pos.y)) {
								let oldPos = new RoomPosition(convoyPosition.pos.x, convoyPosition.pos.y, this.name);
								let newPos = new RoomPosition(convoyTarget.pos.x, convoyTarget.pos.y, this.name);

								let dir = oldPos.getDirectionTo(newPos);
								// if (Game.time % 200 == 0) Game.notify("CONVOY DIR " + dir + " " + Game.time);
								if (Game.time % 50 == 0) console.log("CONVOY DIR", dir)

								if (!edgeConvoy) {
									var roomPos = util.getSectorCoords(this.name);
									// Don't want to catch them until they've all spawned in
									if (roomPos.x != 0 || roomPos.y != 0) {
										// console.log("Request convoy takedown", this.name, dir, JSON.stringify(roomPos))
										if (!Memory.season4) {
											combatManager.requestConvoyTakedown(this.name, dir)	
										}
										else {
											combatManager.requestSeason4ConvoyTrade(this.name, dir)	
										}
									}
								}
								done = true
								break;
							}
						}
						if (done) {
							break
						}
					}
				}

				if (convoyTargets) {
					mem.convoyPositions = [];
					for (let target of convoyTargets) {
						mem.convoyPositions.push({id: target.id, pos: target.pos});
					}
				}
			}

			for (let creep of allTargets) {
				if (creep.owner.username == "Source Keeper") {
					continue;
				}
				if (creep.owner.username == "Invader") {
					delete mem.hSnceLstInv
					delete mem.preSpawnedForInvaders
				}
				let meanPos;
				if (mem.hostileCreepsTick == Game.time - 1) {					
					for (let creepInfo of (mem.hostileCreeps || [])) {
						if (creepInfo.id == creep.id) {
							meanPos = creepInfo.meanPos || {};
							meanPos.x = Math.round((alphaIntercept * meanPos.x + (1 - alphaIntercept) * creep.pos.x) * 100) / 100;
							meanPos.y = Math.round((alphaIntercept * meanPos.y + (1 - alphaIntercept) * creep.pos.y) * 100) / 100;
							break;
						}
					}
				}

				if (!meanPos) {
					meanPos = {x : creep.pos.x, y : creep.pos.y};
				}

				allTargetInfos.push({"id": creep.id, "pos" : creep.pos, "meanPos" : meanPos, "cost" : util.getECostForCreep(creep), "ttl": creep.ticksToLive});
			}

			for (let creep of humanTargets) {
				// let factor = (this.controller && this.controller.reservation && this.controller.reservation.username == util.getMyName()) ? 0.1 : 0.01;
				// Memory.stats.hateCounter[creep.owner.username] = (Memory.stats.hateCounter[creep.owner.username] || 0) + (creep.level ? creep.level * factor * 10 : creep.body.length * factor);
				let factor = (this.controller && this.controller.reservation && this.controller.reservation.username == util.getMyName()) ? 0.2 : 0.02;
				if(creep.level || creep.hasDamagingBodypart()) {
					factor *= 5
				}
				if (this.find(FIND_MY_CREEPS).length) {
					factor *= 2;
				}

				if (scouting.isPlayerHeavyWhiteListed(creep.owner.username)) {
					factor /= 100;
				}
				if (scouting.isPlayerMediumWhiteListed(creep.owner.username)) {
					factor /= 10;
				}


				Memory.stats.hateCounter[creep.owner.username] = (Memory.stats.hateCounter[creep.owner.username] || 0) + (creep.level !== undefined ? creep.level * factor * 10 : Math.sqrt(creep.body.length) * factor);

				if (scouting.isPlayerSoftWhiteListed(creep.owner.username)) {
					continue
				}

				if (Memory.season && Memory.stats.hateCounter[creep.owner.username] < 100000) {
					continue
				}

				if (Memory.privateServer) {					
					if (creep.pos.x == 0 || creep.pos.x == 49 || creep.pos.y == 0 || creep.pos.y == 49) {
						mem.borderInfos = mem.borderInfos || {};

						let idx = creep.pos.x * 50 + creep.pos.y;
						mem.borderInfos[idx] = mem.borderInfos[idx] || {};
						let oldLastTick = mem.borderInfos[idx].lastTick;
						mem.borderInfos[idx].lastTick = Game.time;

						if (!mem.borderInfos[idx].lastCreep || 
							mem.borderInfos[idx].lastCreep != creep.id || 
							!mem.borderInfos[idx].lastTick || 
							Game.time - oldLastTick > 10) {
							// This will decay
							mem.borderInfos[idx].avgEnergyCost = (mem.borderInfos[idx].avgEnergyCost || 0) + util.getECostForCreep(creep) * creep.ticksToLive / 1500.;
							mem.borderInfos[idx].creepsSeen = (mem.borderInfos[idx].creepsSeen || 0) + 1;
							mem.borderInfos[idx].lastCreep = creep.id;

							// How much damage do we need to withstand
							let parts = creep.getBoostModifiedCombatParts(true, true);
							mem.borderInfos[idx].maxdps = Math.max((mem.borderInfos[idx].maxdps || 0), parts.numAttack * 30 + parts.numRanged * 10);
						}
					}
				}
			}



		}
		else if (mem.lh) {
			delete mem.convoyPositions;
			delete mem.lastHostiles; // TODO: delete
			delete mem.lh;

			delete mem.hostileCampCheck;

			delete mem.hostileBoostedCreeps;
			delete mem.creepCombatPartsRanged;
			delete mem.creepCombatPartsAttack;
			delete mem.creepCombatPartsHeal;
			delete mem.creepRanged;
			delete mem.creepAttack;
			delete mem.creepHeal;

			delete mem.creepCnt;

			delete mem.campSiteX;
			delete mem.campSiteY;

			delete mem.requestHelpAgainst;
		}

		let killCount = 0;

		// Kill tracking
		if (mem.hostileCreeps && mem.hostileCreepsTick == Game.time - 1) {
			for (var creepInfo of _.clone(mem.hostileCreeps)) {
				var found = false;
				for (var creepInfo2 of allTargetInfos) {
					if (creepInfo2.id == creepInfo.id) {
						found = true;
						break;
					}
				}

				// Oh, they've disappeared. How... mysterious.
				if (!found) {
					// Ok, they didn't jump off the edge.
					if (creepInfo.pos.x > 1 && creepInfo.pos.x < 48 && creepInfo.pos.y > 1 && creepInfo.pos.y < 48 && creepInfo.ttl > 1) {
						// console.log("Recorded kill", creepInfo.pos.x, creepInfo.pos.y, creepInfo.pos.roomName, creepInfo.cost, creepInfo.ttl, creepInfo.cost * (creepInfo.ttl || 1500) / 1500)

						if (Game.cpu.bucket >= 9500) {
							let nearbyCreeps = (new RoomPosition(creepInfo.pos.x, creepInfo.pos.y, this.name)).findInRange(FIND_MY_CREEPS, 4);

							for (let creep of nearbyCreeps) {
								if (creep.hasActiveBodypart(ATTACK) && creep.pos.getRangeTo(creepInfo.pos.x, creepInfo.pos.y) <= 2) {
									creep.say("\uD83D\uDC2F", true)
								}
								else if (creep.hasActiveBodypart(RANGED_ATTACK) && creep.pos.getRangeTo(creepInfo.pos.x, creepInfo.pos.y) <= 4) {
									creep.say("\uD83D\uDC2F", true)
								}
							}

						}

						killCount += creepInfo.cost * (creepInfo.ttl || 1500) / 1500;
					}
					_.pull(mem.hostileCreeps, creepInfo)
				}
			}
		}

		if (this.hasHostiles) {
			mem.hostileCreeps = allTargetInfos;
			mem.hostileCreepsTick = Game.time
		}
		else {
			delete mem.hostileCreeps
			delete mem.hostileCreepsTick
		}

		// Other functions will read this.
		this.killCount = killCount;


		let combatThreats = this.hasHostiles ? this.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false).concat(this.find(FIND_HOSTILE_POWER_CREEPS)) : [];

		if (combatThreats.length > 0 && (!this.controller || !this.controller.my || !this.controller.safeMode)) {
			if (this.keeperRoom) {
				this.dangerous = 1;
				for (let threat of combatThreats) {
					if (threat.owner.username != "Source Keeper" && threat.owner.username != "Screeps") {
						this.dangerous = 2;
						break;
					}
				}
			}
			else {
				this.dangerous = 2;
			}
		}
		else {
			if (mem.DT < 1e-20) {
				mem.DT = 0;
			}
			this.dangerous = 0
		}

		if (this.controller && this.controller.my) {
			let baseThreats = combatThreats;
			// Work/carry aren't threats enough to mark them as danger unless there is something that can hurt in there.
			// baseThreats = this.hasHostiles ? combatThreats : [];
			// baseThreats = this.hasHostiles ? this.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true) : [];

			if (baseThreats.length == 0 && this.hasHostiles) {
				let dismantlers = this.getAllHostileCreepsWithBodyParts([WORK], true);
				let healers = this.getAllHostileCreepsWithBodyParts([HEAL], true);

				if (dismantlers.length > 0 && healers.length > 0) {
					baseThreats = dismantlers.concat(healers);
				}
			}
			if (baseThreats.length > 0) {
				mem.hostileBoostedCreeps = 0;
				if ((this.controller.safeMode || 0) < 100) {
					var otherHumanThreats = _.filter(baseThreats,
						function(creep) {
							return (creep.owner.username != "Invader")
						}
					);

					if (otherHumanThreats.length > 0) {
						this.dangerous = 2;
						if ((mem.attackScore || 0) > 1000) {
							mem.DT = Math.max(mem.DT, 0.525);
						}
						this.defcon = Math.max(1, this.defcon - 1);
						if (Game.time % 100 == 0) Game.notify("Nasty humans in " + this.name + " " + baseThreats[0].owner.username + " " + Game.time.toString())



						for (var creep of baseThreats) {
							var combatParts = creep.getBoostModifiedCombatParts(false, true);
							if ((combatParts.numRanged || combatParts.numAttack) && creep.hasBoost()) {
								mem.hostileBoostedCreeps += Math.max(1, creep.getCurrentBoostCost() / MAX_CREEP_SIZE);
							}
						}

						if (this.effectiveLevel <= 1) {
							this.clearTerminal = 1
						}
					}
					else {
						this.dangerous = 1
					}
				}
			}

			if (!this.dangerous && this.mem.DT < 0.01 && !this.mem.attackScore) {
				delete this.mem.lastTargets
			}
		}
		else if (this.controller && this.controller.owner && !this.controller.my) {
			if (!scouting.isPlayerHeavyWhiteListed(this.controller.owner.username)) {				
				if (this.towers.length > 0) {
					for (let tower of this.towers) {
						if (tower.energy >= 10 && tower.isActive()) {
							this.dangerous = 2;
							break;
						}
					}
				}
			}
			if (!this.hasHostiles) {
				let myCreeps = this.find(FIND_MY_CREEPS)
				for (let creep of myCreeps) {
					creep.move = creep.trackedMove
				}
			}
		}
		// Maybe guage the threat?

		// This is going to be rare in unowned rooms
		// if (Math.random() < 0.1 && this.controller && this.controller.owner) {
		if (Math.random() < 0.1) {
			let nukes = this.find(FIND_NUKES);
			if (nukes.length > 0) {
				global.roomsWithNukesLandingSet.add(this.name)
				global.anyNukes = 1;
				
				let minNukeTime = Infinity;
				let minNukeTime2 = Infinity;
				for (let nuke of nukes) {
					if (nuke.timeToLand < minNukeTime) {
						minNukeTime2 = minNukeTime;
						minNukeTime = nuke.timeToLand;
					}
					if (nuke.timeToLand > minNukeTime && nuke.timeToLand < minNukeTime2) {
						minNukeTime2 = nuke.timeToLand;
					}
					if (Memory.rooms[nuke.launchRoomName] && Memory.rooms[nuke.launchRoomName].owner && this.controller && this.controller.my) {
						// Based on damage per tick. Nuke does 10e6 + 24 * 5e6 = 130e6 damage over 50,000 ticks.
						// Also kills creeps and does other stuff... but tends not to hit a lot in practise.
						//  Call it 50e6 damage, or 1000/tick.
						Memory.stats.hateCounter[Memory.rooms[nuke.launchRoomName].owner] += 1000 * Math.sqrt(nukes.length) * 10 * constants.HATE_PER_DPT;
					}
					// getHatePercentage is kinda shit
					else if (Memory.rooms[this.name].owner && Math.sqrt(intelAI.getHatePercentage(Memory.rooms[this.name].owner)) > 0.05) {
						Memory.combatManager.requestedMissions[global.MISSION_ROOM_ASSAULT][this.name] = minNukeTime;
					}
				}

				mem.nukeLandTime = Game.time + minNukeTime;
				mem.nukeLandTime2 = Game.time + minNukeTime2;
				if (this.controller && this.controller.my) {
					mem.nukeCount = nukes.length;
				}

				// Counter nuke safe mode cheese
				if (Game.shard.name == "shard2" && mem.rcl && mem.nukeLandTime - Game.time < 1300 && mem.nukeLandTime - Game.time > 300 && !mem.rampHP && !mem.wallHP) {
					combatManager.requestNukeFollowMission(this.name);
				}
			}
			else {
				global.roomsWithNukesLandingSet.delete(this.name)
				delete mem.nukeLandTime
				delete mem.nukeLandTime2
				delete mem.nukeCount;
			}
		}
	}

	Room.prototype.season1Tick = function() {
		let mem = Memory.rooms[this.name]

		var sectorCoords = util.getSectorCoords(this.name);

		if (this.controller && this.controller.my && Memory.scoreCollectorRooms) {
			let vis = this.visual;

			if (Memory.enableVisuals || Memory.forceSaveMemory) {
				vis.text("Spawn util: " + Math.round(this.mem.spawnUtilization * 100000) / 100000, 1, 1, {align: "left"})
			}

			if (!this.mem.closestDropOff || Math.random() < 0.001) {
				let minDist = Infinity
				for (let roomName of Memory.scoreCollectorRooms) {
					let dist = safeRoute.getSafeRouteCost(this.name, roomName, false, false)
					if (dist < minDist) {
						minDist = dist;
						this.mem.closestDropOff = roomName
						this.mem.closestDropOffRange = dist
					}
				}
			}
			if (!this.mem.secondClosestDropOff || Math.random() < 0.001) {
				let minDist = Infinity
				for (let roomName of Memory.scoreCollectorRooms) {
					if (roomName == this.mem.closestDropOff) continue
					let dist = safeRoute.getSafeRouteCost(this.name, roomName, false, false)
					if (dist < minDist) {
						minDist = dist;
						this.mem.secondClosestDropOff = roomName
						this.mem.secondClosestDropOffRange = dist
					}
				}
			}
			if (!this.mem.thirdClosestDropOff || Math.random() < 0.001) {
				let minDist = Infinity
				for (let roomName of Memory.scoreCollectorRooms) {
					if (roomName == this.mem.closestDropOff) continue
					if (roomName == this.mem.secondClosestDropOff) continue
					let dist = safeRoute.getSafeRouteCost(this.name, roomName, false, false)
					if (dist < minDist) {
						minDist = dist;
						this.mem.thirdClosestDropOff = roomName
						this.mem.thirdClosestDropOffRange = dist
					}
				}
			}
		}

		if (sectorCoords.x == 0 && sectorCoords.y == 0 && Memory.season1) {
			let collector = this.find(FIND_SCORE_COLLECTORS)[0]
			let dropoffPos = collector.pos
			if (mem.seasonDropOffAvailable === undefined || Math.random() < 0.01 || (mem.seasonDropOffAvailable === 0 && !Game.getObjectById(mem.seasonWallsToRemove[mem.seasonWallsToRemove.length - 1]))) {			
				// Recursively call countAccessibleTiles from the drop-off point. If the answer is zero, need a clearer.
				let remove = true;

				var pathOutOfWalls = PathFinder.search(
					dropoffPos, {pos: dropoffPos, range: 6}, {
						plainCost: 1,
						swampCost: 1,
						maxOps: 50000,
						maxRooms: 1,
						heuristicWeight: 1,
						flee: 1,

						roomCallback: function(roomName) {
							let room = Game.rooms[roomName];
							let costs = new PathFinder.CostMatrix;

							if (room) {
								for (let wall of room.constructedWalls) {
									costs.set(wall.pos.x, wall.pos.y, Math.max(1, Math.floor(254 * wall.hits / WALL_HITS_MAX)))
								}								
							}

							return costs;
						},
					}
				);

				if (pathOutOfWalls.incomplete) {
					console.log("Season dropoff path incomplete", JSON.stringify(pathOutOfWalls))
				}
				else {				
					if (pathOutOfWalls.cost == 0) {
						remove = false;
					}
					else {
						mem.seasonWallsToRemove = []
						for (let pos of pathOutOfWalls.path) {
							let wall = pos.lookFor(LOOK_STRUCTURES)[0]
							if (wall && wall.structureType == STRUCTURE_WALL) {
								mem.seasonWallsToRemove.push(wall.id)
							}
						}

						let targetWall = Game.getObjectById(mem.seasonWallsToRemove[mem.seasonWallsToRemove.length - 1])
						if (!targetWall) {
							if (pathOutOfWalls.cost == 6) {
								remove = false;
							}
							else {
								console.log("No target wall for season dropoff", this.name)
							}
						}
						else {
							mem.numSeasonDismantlePositions = targetWall.pos.countAccessibleTiles();
							mem.dismantleWallPos = targetWall.pos
						}

					}
					if (remove) {
						Memory.combatManager.requestedMissions[global.MISSION_SEASONAL_DROP_WALL_REMOVE][this.name] = Game.time;
						mem.seasonDropOffAvailable = 0
					}
					else {
						Memory.anySeasonDropOffAvailable = 1
						mem.seasonDropOffAvailable = 1
					}
				}
			}

			Memory.scoreCollectorRooms = Memory.scoreCollectorRooms || []
			if (!Memory.scoreCollectorRooms.includes(this.name)) {
				Memory.scoreCollectorRooms.push(this.name)
			}


			mem.dropOffId = collector.id
			mem.dropOffPos = dropoffPos
			mem.dropOffBucket = collector.store.getFreeCapacity(RESOURCE_SCORE) 




			if (mem.seasonWallsToRemove && mem.seasonWallsToRemove.length) {
				// if (Game.time % 10 == 0) console.log("vis dropoff in", this.name)
				for (let wallId of mem.seasonWallsToRemove) {
					let wall = Game.getObjectById(wallId)
					if (!wall) continue
					this.visual.circle(wall.pos)
				}

				mem.hostileDiggerOwners = []

				for (let hostileCreep of this.getAllHostileCreepsAndPowerCreeps()) {
					if (hostileCreep.getNumOfBodyPart(WORK) >= 20) {
						Memory.combatManager.requestedMissions[global.MISSION_SEASONAL_DROP_RAID][this.name] = Game.time;
						mem.hostileDiggerOwners.push(hostileCreep.owner.username)
					}
				}
			}
			else {
				global.inTickObject.allSeasonFetchers = global.inTickObject.allSeasonFetchers || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'seasonFetcher'))

				// Should move to roomAI
				let bucket = mem.dropOffBucket
				for (let fetcher of global.inTickObject.allSeasonFetchers) {
					// console.log(creep.mem.dTgt, JSON.stringify(otherFetcher.mem.dP), JSON.stringify(dropPos), otherFetcher.getStoreUsedCapacity())
					if (!fetcher.mem.f && fetcher.mem.dTgt && fetcher.mem.dTgt == mem.dropOffId) {
						bucket -= fetcher.getStoreUsedCapacity()
					}
				}

				mem.expectedBucket = bucket;

				Memory.stats.dropOffBucket = Memory.stats.dropOffBucket || {}
				Memory.stats.dropOffBucket[this.name] = mem.dropOffBucket

				Memory.stats.expectedBucket = Memory.stats.expectedBucket || {}
				Memory.stats.expectedBucket[this.name] = mem.expectedBucket



				mem.hostileScoreOwners = []

				let isMyDropOff
				for (let hostileCreep of this.getAllHostileCreepsAndPowerCreeps()) {
					if (hostileCreep.carry[RESOURCE_SCORE]) {
						Memory.combatManager.requestedMissions[global.MISSION_SEASONAL_DROP_RAID][this.name] = Game.time;

						mem.hostileScoreOwners.push(hostileCreep.owner.username)
						if (this.mem.DT < 0.5 && !scouting.isPlayerSoftWhiteListed(hostileCreep.owner.username)) {
							this.mem.DT += hostileCreep.carry[RESOURCE_SCORE] / 100000
						}

						if (isMyDropOff === undefined) {
							isMyDropOff = false;
							for (let room of Game.myRooms) {
								if (room.mem.closestDropOff == this.name) {
									isMyDropOff = true;
									break
								}
							}
						}
						if (isMyDropOff && !scouting.isPlayerSoftWhiteListed(hostileCreep.owner.username)) {
							Memory.stats.hateCounter[hostileCreep.owner.username] += hostileCreep.carry[RESOURCE_SCORE]
						}
					}
				}

				let eventLog = this.getEventLog();
				for (let event of eventLog) {
					if (event.event == EVENT_TRANSFER) {
						// Going to miss some if the die on transfer
						if (event.data.resourceType == RESOURCE_SCORE && event.data.targetId == mem.dropOffId && Game.getObjectById(event.objectId) && Game.getObjectById(event.objectId).my) {
							this.mem.scoreInRoom = (this.mem.scoreInRoom || 0) + event.data.amount
							Memory.stats.seasonScore = (Memory.stats.seasonScore || 0) + event.data.amount
						}
					}
				}

			}
		}

		let scoreContainers = this.find(FIND_SCORE_CONTAINERS)
		if (scoreContainers.length) {
			mem.scoreContainers = []
			for (let scoreContainer of scoreContainers) {
				mem.scoreContainers.push({id: scoreContainer.id, pos: scoreContainer.pos, amount: scoreContainer.store[RESOURCE_SCORE], decayTick: Game.time + scoreContainer.ticksToDecay})
			}
			if (!Memory.scoreContainerRooms.includes(this.name)) {
				Memory.scoreContainerRooms.push(this.name)
			}
		}
		else {
			delete mem.scoreContainers
			_.pull(Memory.scoreContainerRooms, this.name)
		}
	}

	Room.prototype.season2Tick = function() {
		let mem = Memory.rooms[this.name]

		// for (let creep of this.getAllFriendlyCreepsWithBodyParts([HEAL, RANGED_ATTACK, ATTACK])) {
		// 	if (!creep.mem.sleep) continue
		// 	if (!creep.movedThisTick) continue

		// 	let flags = this.find(FIND_FLAGS)

		// 	if (flags.length) {
		// 		for (let flag of flags) {
		// 			if (flag.name.startsWith("form")) {
		// 				creep.uncachedMoveTo(flag, 2, {maxRooms:1, avoidEnemyRooms: 1, avoidCombatEdges: 1})
		// 				break
		// 			}
		// 		}
		// 	}
		// }




		let scoreContainers = this.find(FIND_SYMBOL_CONTAINERS)

		// var roomCoords = util.getRoomCoords(this.name);

		// let validRoomScoreContainerRoom = true || roomCoords.y <= 20 || roomCoords.x <= 0 || roomCoords.x >= 10

		// if (scoreContainers.length && !validRoomScoreContainerRoom) {
		// 	console.log(this.name, "is not valid score container room due to Meridion")
		// }

		if (scoreContainers.length) {
			let oldScoreContainers = mem.scoreContainers || []
			mem.scoreContainers = []
			for (let scoreContainer of scoreContainers) {
				let roomCoords = util.getRoomCoords(this.name)

				if (roomCoords.x >= 11 && roomCoords.y <= 21 &&
					roomCoords.y >= 11 && roomCoords.y <= 21) {

					if (this.controller) {
						if (this.controller.reservation && this.controller.reservation.username == "Montblanc") {
							continue
						}
						else if (this.controller.owner && this.controller.owner.username == "Montblanc") {
							continue
						}
					}
				}


				let obj = {id: scoreContainer.id, pos: scoreContainer.pos, resourceType: scoreContainer.resourceType, amount: scoreContainer.store[scoreContainer.resourceType], decayTick: Game.time + scoreContainer.ticksToDecay}

				if (!this.highway) {
					obj.reachable = 1
				}
				else {
					for (let oldScoreContainer of oldScoreContainers) {
						if (oldScoreContainer.id == scoreContainer.id) {
							obj.reachable = oldScoreContainer.reachable
						}
					}

					let testCreep = _.sample(this.find(FIND_MY_CREEPS))
					if (obj.reachable === undefined || Math.random() < 0.01) {
						if (testCreep) {
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

							let terrainMap = Game.map.getRoomTerrain(this.name)

							var floodArray = [];
							for (var i = 0; i < 50; i++) {
								floodArray[i] = [];
								for (var j = 0; j < 50; j++) {
									floodArray[i][j] = (terrainMap.get(i,j) & TERRAIN_MASK_WALL) ? 0 : 1;
								}
							}

							for (var wall of this.constructedWalls) {
								floodArray[wall.pos.x][wall.pos.y] = 0;
							}

							floodFill(floodArray, testCreep.pos.x, testCreep.pos.y, 2)

							if (floodArray[scoreContainer.pos.x][scoreContainer.pos.y] == 2) {
								obj.reachable = 1
							}
							else {
								obj.reachable = 0
							}
							delete this.mem.observerSent
						}
						else if (obj.reachable === undefined && (Game.time - (this.mem.observerSent || 0)) > 1000) {
							let sourceRoom
							let bestScore = 20
							// Must've spotted with an observer
							for (let otherRoom of Game.myRooms) {
								let score = safeRoute.getSafeRouteCost(otherRoom.name, this.name, false, false, 20)
								if (score < bestScore) {
									sourceRoom = otherRoom
									bestScore = score
								}
							}

							if (sourceRoom) {								
								let spawn = sourceRoom.spawns[0]
								if (spawn && !spawn.hasPrioritySpawn("observer", {targetRoom: this.name})) {
									spawn.addPrioritySpawn("observer", {targetRoom: this.name})
									this.mem.observerSent = Game.time
								}
							}
						}

					}

				}

				mem.scoreContainers.push(obj)
			}
			if (!Memory.scoreContainerRooms.includes(this.name)) {
				Memory.scoreContainerRooms.push(this.name)
			}
		}
		else {
			if (mem.scoreContainers) {
				delete mem.scoreContainers
				_.pull(Memory.scoreContainerRooms, this.name)				
			}
		}

		if (this.controller && this.controller.my) {
			// For their creeps
			let ledgerPlayerNames = ["Montblanc", "Codablo", "psy372"]

			// This isn't very efficient, but there's not going to be a lot
			// of hostile creeps in your room at once, and less likely there will
			// be one from mulitple ledger players... it'll do!
			for (let playerName of ledgerPlayerNames) {
				let hasPlayer = false;
				for (let creep of this.find(FIND_HOSTILE_CREEPS)) {
					if (creep.owner.username == playerName) {
						hasPlayer = true;
						break;
					}
				}

				if (!hasPlayer) continue

				let eventLog = this.getEventLog()
				for (let event of eventLog) {
					if (event.event == EVENT_TRANSFER) {
						let creepId
						let creepObject
						let dropoff

						let srcObj = Game.getObjectById(event.objectId)
						let targetObj = Game.getObjectById(event.data.targetId)

						// Creep to storage
						if (targetObj == this.terminal || targetObj == this.storage) {
							dropoff = true;
							creepId = event.objectId
							creepObject = srcObj
						}
						// Storage to creep
						else if (srcObj == this.terminal || srcObj == this.storage) {
							dropoff = false
							creepId = event.data.targetId
							creepObject = targetObj
						}
						else {
							continue
						}

						// Huh, probably dead?
						if (!creepObject) {
							for (let tombstone of this.find(FIND_TOMBSTONES)) {
								if (tombstone.creep.id == creepId) {
									creepObject = tombstone.creep
									break
								}
							}
						}

						// It's possible to transfer and exit on the same tick, so we could look through the event logs for EXIT events
						// to find it?
						if (!creepObject) {
							console.log("SYMBOL TRADE: Something transferred but disappeared mysteriously", JSON.stringify(event))
							continue
						}

						if (creepObject.owner.username != playerName) continue

						Memory.incomingTradeLedger = Memory.incomingTradeLedger || {}
						Memory.incomingTradeLedger[playerName] = Memory.incomingTradeLedger[playerName] || {}
						Memory.incomingTradeLedger[playerName][event.data.resourceType] = Memory.incomingTradeLedger[playerName][event.data.resourceType] || 0
						Memory.incomingTradeLedger[playerName][event.data.resourceType] += (dropoff ? 1 : -1) * event.data.amount;

						console.log("Updated incoming trade ledger for", playerName, event.data.resourceType, Memory.incomingTradeLedger[playerName][event.data.resourceType])

						if (Memory.incomingTradeLedger[playerName][event.data.resourceType] < 0) {
							console.log("------------- WARNING PLAYER IN DEBT -------------")
						}
					}
				}
			}


			// Send any symbols to their matching decoder
			if (this.terminal && !this.transferred && !this.terminal.cooldown && Math.random() < 0.1) {
				let orderedSymbols = util.getSeasonOrderedSymbols()

				let tradeRoomName = "null" //"W6N18"

				let tradeRoomSymbols = [orderedSymbols[0], orderedSymbols[1], orderedSymbols[2], orderedSymbols[3], orderedSymbols[4]]
				let tradeRoomNeededSymbols = []
				let tradeRoomExcessSymbols = []
				for (let i = 0; i < 5; i++) {
					if (Game.rooms[tradeRoomName] && !Game.rooms[tradeRoomName].hasAtLeastXOfResource(orderedSymbols[i], 10000)) {
						tradeRoomNeededSymbols.push(orderedSymbols[i])
					}
				}

				// To prevent swapping out at the lower end we just hold up to 21k of everything
				// Max transfer is 10k, so should be fine
				for (let i = 0; i < orderedSymbols.length; i++) {
					if (Game.rooms[tradeRoomName] && Game.rooms[tradeRoomName].hasAtLeastXOfResource(orderedSymbols[i], (i < 10 ? 21000 : i < 15 ? 15000 : 5000))) {
						tradeRoomExcessSymbols.push(orderedSymbols[i])
					}
				}

				// Send to target room
				for (let otherRoom of Game.myRooms) {
					if (!otherRoom.terminal) continue
					if (!otherRoom.storage) continue
					if (otherRoom.name == global.currentlyUnclaimingRoom) continue						
					if (otherRoom.transferred) continue
					if (this.terminal.cooldown) continue
					if (otherRoom == this) continue
					if (otherRoom.controller.level < 8) continue

					let targetDecoders = [otherRoom.mem.decoderType]

					if (otherRoom.name == "W12N9") {
						targetDecoders = targetDecoders.concat(Memory.currentMBSymbols)
					}
					if (otherRoom.name == tradeRoomName) {
						targetDecoders = targetDecoders.concat(tradeRoomNeededSymbols)
					}

					for (let targetDecoder of _.shuffle(targetDecoders)) {
						if (targetDecoder == this.mem.decoderType) continue

						if (!this.terminal.store[targetDecoder]) continue

						if (otherRoom.terminal.store.getFreeCapacity() < 20000 || otherRoom.storage.store.getFreeCapacity() < 100000) {
							continue
						}

						if (this.name == tradeRoomName) {
							// We want it and we don't have an excess here, so don't send
							if (!tradeRoomExcessSymbols.includes(targetDecoder)) {
								continue
							}
						}


						let amount = Math.min(10000, this.terminal.store[RESOURCE_ENERGY], this.terminal.store[targetDecoder])
						console.log(this, "send", targetDecoder, "to", otherRoom, "amount", amount)

						let cost = Game.market.calcTransactionCost(amount, this.name, otherRoom.name)
						global.inTickObject.energyExpenditures["terminalSymbols"]  = (global.inTickObject.energyExpenditures["terminalSymbols"] || 0) + cost
						global.inTickObject.energyExpenditures["terminalSymbolsA"]  = (global.inTickObject.energyExpenditures["terminalSymbolsA"] || 0) + cost

						this.terminal.send(targetDecoder, amount, otherRoom.name)
						this.transferred = true;
						otherRoom.transferred = true;
						break
					}
					if (this.transferred) {
						break
					}
				}
				// Swaps
				if (!this.transferred && this.terminal.store.getFreeCapacity() > 10000) {					
					for (let otherRoom of Game.myRooms) {
						if (!otherRoom.terminal) continue
						if (!otherRoom.storage) continue
						if (otherRoom.name == global.currentlyUnclaimingRoom) continue
						if (otherRoom.terminal.cooldown || this.terminal.cooldown) continue
						if (otherRoom.transferred) continue
						if (otherRoom == this) continue
						if (otherRoom.controller.level < 8 || this.controller.level < 8) continue

						// Lets just ignore swaps for trade room
						if (this.name == tradeRoomName || otherRoom.name == tradeRoomName) continue

						let targetDecoders = [otherRoom.mem.decoderType]

						if (otherRoom.name == "W12N9") {
							targetDecoders = targetDecoders.concat(Memory.currentMBSymbols)
						}


						for (let targetDecoder of _.shuffle(targetDecoders)) {
							if (targetDecoder == this.mem.decoderType) continue

							if (!this.terminal.store[targetDecoder]) continue
							if (!otherRoom.terminal.store[this.mem.decoderType]) continue

							if (otherRoom.terminal.store.getFreeCapacity() < 10000) {
								continue
							}

							let amount = Math.min(10000, this.terminal.store[targetDecoder], otherRoom.terminal.store[this.mem.decoderType], this.terminal.store[RESOURCE_ENERGY], otherRoom.terminal.store[RESOURCE_ENERGY])

							let cost = 2 * Game.market.calcTransactionCost(amount, this.name, otherRoom.name)
							global.inTickObject.energyExpenditures["terminalSymbols"]  = (global.inTickObject.energyExpenditures["terminalSymbols"] || 0) + cost
							global.inTickObject.energyExpenditures["terminalSymbolsB"]  = (global.inTickObject.energyExpenditures["terminalSymbolsB"] || 0) + cost



							console.log(this, "send", targetDecoder, "to", otherRoom, "amount", amount)
							this.terminal.send(targetDecoder, amount, otherRoom.name)
							console.log(otherRoom, "send", this.mem.decoderType, "to", this, "amount", amount)
							otherRoom.terminal.send(this.mem.decoderType, amount, this.name)
							this.transferred = true;
							otherRoom.transferred = true;
							break
						}
						if (this.transferred) {
							break
						}
					}
				}

				// To send to cub
				if (this.name == "W18N7" && !this.transferred && this.terminal.store.getFreeCapacity() > 20000 && this.storage.store.getFreeCapacity() > 100000) {
					for (let otherRoom of Game.myRooms) {
						if (!otherRoom.terminal) continue
						if (!otherRoom.storage) continue
						if (otherRoom.transferred) continue
						if (otherRoom.terminal.cooldown) continue
						if (otherRoom == this) continue


						for (let symbol of _.shuffle(Object.values(Memory.allySymbols["Cub"]))) {
							let canDoItMyself = false;
							for (let thirdRoom of Game.myRooms) {
								if (thirdRoom.controller.level >= 8 && thirdRoom.mem.decoderType === symbol) {
								// if (thirdRoom.mem.decoderType === symbol) {									
									canDoItMyself = true
									break
								}
							}
							if (canDoItMyself) {
								continue
							}

							// Prefer to trade
							if (tradeRoomNeededSymbols.includes(symbol)) {
								continue
							}		
							if (otherRoom.name == tradeRoomName) {
								// We want it and we don't have an excess here, so don't send
								if (!tradeRoomExcessSymbols.includes(symbol)) {
									continue
								}
							}


							if (!otherRoom.terminal.store[symbol]) continue
							let amount = Math.min(10000, otherRoom.terminal.store[RESOURCE_ENERGY], otherRoom.terminal.store[symbol])

							let cost = Game.market.calcTransactionCost(amount, this.name, otherRoom.name)
							global.inTickObject.energyExpenditures["terminalSymbols"]  = (global.inTickObject.energyExpenditures["terminalSymbols"] || 0) + cost
							global.inTickObject.energyExpenditures["terminalSymbolsC"]  = (global.inTickObject.energyExpenditures["terminalSymbolsC"] || 0) + cost


							console.log(otherRoom, "send", symbol, "to", this, "amount", amount)

							otherRoom.terminal.send(symbol, amount, this.name)
							this.transferred = true;
							otherRoom.transferred = true;
							break
						}
						if (this.transferred) {
							break
						}
					}
				}

				// Shouldn't be any "nulls" any more
				if (!this.transferred && this.storage.store.getUsedCapacity() > 800000 && false) {
					// Symbols with nowhere to go
					let nullSymbols = _.clone(SYMBOLS)
					nullSymbols = _.without(nullSymbols, ...Memory.currentMBSymbols);
					nullSymbols = _.without(nullSymbols, ...Memory.allyDecoders);
					nullSymbols = _.without(nullSymbols, ...Memory.myDecoders);

					if (nullSymbols.length == 0) {
						console.log("----------- no null symbols")
					}

					for (let otherRoom of Game.myRooms) {
						if (otherRoom.upgradeFocus && otherRoom.controller.level != 8) continue
						if (!otherRoom.terminal) continue
						if (!otherRoom.storage) continue
						if (otherRoom.name == global.currentlyUnclaimingRoom) continue
						if (otherRoom.transferred) continue
						if (otherRoom.terminal.cooldown) continue
						if (otherRoom == this) continue
						if (otherRoom.terminal.store.getFreeCapacity() < 20000 || otherRoom.storage.store.getFreeCapacity() < 300000) {
							continue
						}

						for (let symbol of nullSymbols) {
							if (!this.terminal.store[symbol]) continue

							let amount = Math.min(this.terminal.store[RESOURCE_ENERGY], this.terminal.store[symbol])

							let cost = Game.market.calcTransactionCost(amount, this.name, otherRoom.name)
							global.inTickObject.energyExpenditures["terminalSymbols"]  = (global.inTickObject.energyExpenditures["terminalSymbols"] || 0) + cost
							global.inTickObject.energyExpenditures["terminalSymbolsD"]  = (global.inTickObject.energyExpenditures["terminalSymbolsD"] || 0) + cost

							console.log(this, "send", symbol, "to", otherRoom, "amount", amount)
							this.terminal.send(symbol, amount, otherRoom.name)
							this.transferred = true;
							otherRoom.transferred = true;


							break
						}
						if (this.transferred) {
							break
						}
					}
				}

				if (!this.transferred && this.storage.store.getUsedCapacity() > 980000) {
					for (let otherRoom of Game.myRooms) {
						if (otherRoom.upgradeFocus && otherRoom.controller.level != 8) continue
						if (!otherRoom.terminal) continue
						if (!otherRoom.storage) continue
						if (otherRoom.name == global.currentlyUnclaimingRoom) continue
						if (otherRoom.transferred) continue
						if (otherRoom.terminal.cooldown) continue
						if (otherRoom == this) continue
						if (otherRoom.terminal.store.getFreeCapacity() < 25000 || otherRoom.storage.store.getFreeCapacity() < 100000) {
							continue
						}

						for (let symbol of SYMBOLS) {
							if (!this.terminal.store[symbol]) continue

							let amount = Math.min(this.terminal.store[RESOURCE_ENERGY], this.terminal.store[symbol])

							let cost = Game.market.calcTransactionCost(amount, this.name, otherRoom.name)

							console.log(this, "send", symbol, "to", otherRoom, "amount", amount)
							global.inTickObject.energyExpenditures["terminalSymbols"]  = (global.inTickObject.energyExpenditures["terminalSymbols"] || 0) + cost
							global.inTickObject.energyExpenditures["terminalSymbolsE"]  = (global.inTickObject.energyExpenditures["terminalSymbolsE"] || 0) + cost


							this.terminal.send(symbol, Math.min(this.terminal.store[RESOURCE_ENERGY], this.terminal.store[symbol]), otherRoom.name)
							this.transferred = true;
							otherRoom.transferred = true;
							break
						}
						if (this.transferred) {
							break
						}
					}

				}
			}
		}
		else if (this.controller && this.controller.owner) {
			// For my creeps
			let ledgerPlayerNames = ["Montblanc", "psy372"]

			for (let playerName of ledgerPlayerNames) {
				if (this.controller.owner.username != playerName) continue		

				let eventLog = this.getEventLog()
				for (let event of eventLog) {
					if (event.event == EVENT_TRANSFER) {
						let creepId
						let creepObject
						let dropoff

						let srcObj = Game.getObjectById(event.objectId)
						let targetObj = Game.getObjectById(event.data.targetId)

						// Creep to storage
						if (targetObj == this.terminal || targetObj == this.storage) {
							dropoff = true;
							creepId = event.objectId
							creepObject = srcObj
						}
						// Storage to creep
						else if (srcObj == this.terminal || srcObj == this.storage) {
							dropoff = false
							creepId = event.data.targetId
							creepObject = targetObj
						}
						else {
							continue;
						}

						// Huh, probably dead?
						if (!creepObject) {
							for (let tombstone of this.find(FIND_TOMBSTONES)) {
								if (tombstone.creep.id == creepId) {
									creepObject = tombstone.creep
									break
								}
							}
						}

						if (!creepObject) {
							console.log("SYMBOL TRADE: Something transferred but disappeared mysteriously", JSON.stringify(event))
							continue
						}

						if (creepObject.owner.username != util.getMyName()) continue

						Memory.outgoingTradeLedger = Memory.outgoingTradeLedger || {}
						Memory.outgoingTradeLedger[playerName] = Memory.outgoingTradeLedger[playerName] || {}
						Memory.outgoingTradeLedger[playerName][event.data.resourceType] = Memory.outgoingTradeLedger[playerName][event.data.resourceType] || 0
						Memory.outgoingTradeLedger[playerName][event.data.resourceType] += (dropoff ? 1 : -1) * event.data.amount;

						Memory.modifiedOutgoingTradeLedger = Memory.modifiedOutgoingTradeLedger || {}
						Memory.modifiedOutgoingTradeLedger[playerName] = Memory.modifiedOutgoingTradeLedger[playerName] || {}
						Memory.modifiedOutgoingTradeLedger[playerName][event.data.resourceType] = Memory.modifiedOutgoingTradeLedger[playerName][event.data.resourceType] || 0
						Memory.modifiedOutgoingTradeLedger[playerName][event.data.resourceType] += (dropoff ? 1 : -1) * event.data.amount;

						console.log("Updated outoging trade ledger for", playerName, event.data.resourceType, Memory.outgoingTradeLedger[playerName][event.data.resourceType], Memory.modifiedOutgoingTradeLedger[playerName][event.data.resourceType])

						// TODO: This needs to add contribution from ally sharing the same ledger.
						if (Memory.outgoingTradeLedger[playerName][event.data.resourceType] < 0) {
							console.log("------------- WARNING I AM IN DEBT -------------")
						}
					}
				}
			}
		}



		if (this.highway) {
			if (Math.random() < 0.001 || mem.seasonWallsToRemove === undefined || (mem.seasonWallsToRemove.length == 1 && Math.random() < 0.01)) {
				var sectorCoords = util.getSectorCoords(this.name);
				let terrain = Game.map.getRoomTerrain(this.name)
				let startPos = []
				let endPos = []
				let cuts
				if (sectorCoords.x == 0 && sectorCoords.y != 0) {
					cuts = 1
					for (let j = 0; j < 50; j++) {						
						for (let i = 0; i < 50; i++) {
							if (!(terrain.get(i, j) & TERRAIN_MASK_WALL)) {
								startPos[0] = new RoomPosition(i, j, this.name)
								break
							}
						}
						if (startPos[0]) {
							break;
						}
					}
					for (let j = 0; j < 50; j++) {						
						for (let i = 49; i >= 0; i--) {
							if (!(terrain.get(i, j) & TERRAIN_MASK_WALL)) {
								endPos[0] = new RoomPosition(i, j, this.name)
								break
							}
						}
						if (endPos[0]) {
							break;
						}
					}
				}
				else if (sectorCoords.y == 0 && sectorCoords.x != 0) {
					cuts = 1
					for (let i = 0; i < 50; i++) {
						for (let j = 0; j < 50; j++) {
							if (!(terrain.get(i, j) & TERRAIN_MASK_WALL)) {
								startPos[0] = new RoomPosition(i, j, this.name)
								break
							}
						}
						if (startPos[0]) {
							break;
						}
					}
					for (let i = 0; i < 50; i++) {
						for (let j = 49; j >= 0; j--) {						
							if (!(terrain.get(i, j) & TERRAIN_MASK_WALL)) {
								endPos[0] = new RoomPosition(i, j, this.name)
								break
							}
						}
						if (endPos[0]) {
							break;
						}
					}
				}
				else if (sectorCoords.y == 0 && sectorCoords.x == 0) {
					cuts = 4

					// TL
					for (let i = 0; i < 25; i++) {
						if (!(terrain.get(i, 0) & TERRAIN_MASK_WALL)) {
							startPos[0] = new RoomPosition(i, 0, this.name)
							break
						}
						if (!(terrain.get(0, i) & TERRAIN_MASK_WALL)) {
							startPos[0] = new RoomPosition(0, i, this.name)
							break
						}
					}

					// TR
					for (let i = 49; i >= 25; i--) {
						if (!(terrain.get(i, 0) & TERRAIN_MASK_WALL)) {
							startPos[1] = new RoomPosition(i, 0, this.name)
							break
						}
						if (!(terrain.get(49, 49 - i) & TERRAIN_MASK_WALL)) {
							startPos[1] = new RoomPosition(49, 49 - i, this.name)
							break
						}
					}

					// BR
					for (let i = 49; i >= 25; i--) {
						if (!(terrain.get(i, 49) & TERRAIN_MASK_WALL)) {
							startPos[2] = new RoomPosition(i, 49, this.name)
							break
						}
						if (!(terrain.get(49, i) & TERRAIN_MASK_WALL)) {
							startPos[2] = new RoomPosition(49, i, this.name)
							break
						}
					}

					// BL
					for (let i = 0; i < 25; i++) {
						if (!(terrain.get(i, 49) & TERRAIN_MASK_WALL)) {
							startPos[3] = new RoomPosition(i, 49, this.name)
							break
						}
						if (!(terrain.get(0, 49 - i) & TERRAIN_MASK_WALL)) {
							startPos[3] = new RoomPosition(0, 49 - i, this.name)
							break
						}
					}

					endPos[0] = startPos[1]
					endPos[1] = startPos[2]
					endPos[2] = startPos[3]
					endPos[3] = startPos[0]

					console.log(startPos)
					console.log(endPos)

					// TL-TR
					// TR-BR
					// BR-BL
					// BL-TL
					mem.seasonWalkable = [0, 0, 0, 0]
				}

				mem.seasonWallsToRemove = []
				for (let cut = 0; cut < cuts; cut++) {
					if (startPos[cut] && endPos[cut]) {
						var pathOutOfWalls = PathFinder.search(
							startPos[cut], {pos: endPos[cut], range: 1}, {
								plainCost: 1,
								swampCost: 1,
								maxOps: 50000,
								maxRooms: 1,
								heuristicWeight: 1,

								roomCallback: function(roomName) {
									let room = Game.rooms[roomName];
									let costs = new PathFinder.CostMatrix;

									if (room) {
										let terrain = Game.map.getRoomTerrain(roomName)
										for (let wall of room.constructedWalls) {
											// if (wall.id == "602c728c62f1b63ed41c0758" ||
											// 	wall.id == "602c728c62f1b63ed41c075a" ||
											// 	wall.id == "602c728c62f1b63ed41c0766") {
											// 	costs.set(wall.pos.x, wall.pos.y, 255);
											// 	continue
											// }

											if (wall.pos.x == 0 || wall.pos.y == 0 || wall.pos.x == 49 || wall.pos.y == 49 || cuts > 1) {
												costs.set(wall.pos.x, wall.pos.y, 255)
											}
											else if (!(terrain.get(wall.pos.x, wall.pos.y) & TERRAIN_MASK_WALL)) {
												costs.set(wall.pos.x, wall.pos.y, Math.max(1, Math.floor(254 * wall.hits / WALL_HITS_MAX)))
											}

										}								
									}

									return costs;
								},
							}
						);

						if (cuts == 4) {
							console.log(cut, JSON.stringify(pathOutOfWalls))
							if (!pathOutOfWalls.incomplete) {
								mem.seasonWalkable[cut] = 1;
							}
						}
						else {					
							if (pathOutOfWalls.incomplete) {
								console.log("Season dropoff path incomplete", JSON.stringify(pathOutOfWalls))
								 mem.seasonWallsToRemove = ["fail"]
							}
							else {
								mem.seasonPathCost = pathOutOfWalls.cost
								for (let pos of pathOutOfWalls.path) {
									let wall = pos.lookFor(LOOK_STRUCTURES)[0]
									if (wall && wall.structureType == STRUCTURE_WALL) {
										mem.seasonWallsToRemove.push(wall.id)
									}
								}

								if (mem.dismantleWallPos) {
									let found = false;
									for (let wallId of mem.seasonWallsToRemove) {
										if (Game.getObjectById(wallId).pos.x == mem.dismantleWallPos.x && Game.getObjectById(wallId).pos.y == mem.dismantleWallPos.y) {
											mem.numSeasonDismantlePositions = Game.getObjectById(wallId).pos.countAccessibleTiles();
											found = true;
											break
										}
									}
									if (!found) {
										let targetWall = Game.getObjectById(mem.seasonWallsToRemove[0])
										if (targetWall) {
											mem.numSeasonDismantlePositions = 1;
											mem.dismantleWallPos = targetWall.pos
										}
									}
								}
								else {							
									let targetWall = Game.getObjectById(mem.seasonWallsToRemove[0])
									if (targetWall) {
										mem.numSeasonDismantlePositions = 1;
										mem.dismantleWallPos = targetWall.pos
									}
								}



								if (mem.seasonWallsToRemove.length == 0 && util.isRoomAccessible(this.name)) {
									let currentCoords = util.getRoomCoords(this.name)
									for (let i = -1; i <= 1; i++) {
										for (let j = -1; j <= 1; j++) {
											let testRoomName = util.getRoomNameFromCoords({x: currentCoords.x + i, y: currentCoords.y + j})

											let testSectorCoords = util.getSectorCoords(testRoomName)
											if (testSectorCoords.x == 0 || testSectorCoords.y == 0) {
												continue
											}

											let centreRoomName = util.getCentreRoomForRoomName(testRoomName)
											if (!Memory.openSectors.includes(centreRoomName)) {
												Memory.openSectors.push(centreRoomName)
												delete global.safeRouteCosts
												delete global.isRoomAccessible
											}
										}
									}
								}
							}
						}
					}
				}




			}

			/*if (mem.seasonWallsToRemove && mem.seasonWallsToRemove.length) {
				// if (Game.time % 10 == 0) console.log("vis dropoff in", this.name)
				for (let wallId of mem.seasonWallsToRemove) {
					let wall = Game.getObjectById(wallId)
					if (!wall) continue
					this.visual.circle(wall.pos)
				}
			}*/
		}

	}
}


