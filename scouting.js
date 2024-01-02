"use strict";
let util = require('util');

const utf15 = require('./utf15');
const constants = require('constants');
const safeRoute = require('safeRoute');
const pathCache = require('pathCache');
const intelAI = require('intelAI');
const customCostMatrix = require('customCostMatrix');
const Codec = utf15.Codec;
const MAX_DEPTH = utf15.MAX_DEPTH;


var scouting = {
	// TODO: these two or three are really in the wrong file
	isPlayerWhiteListed(name) {
		if (Game.shard.name == "shard2") {
			if (Game.shard.ptr && name != "Invader") {
				return true
			}
		}
		return false;
	},

	isPlayerSoftWhiteListed(playerName) {
		if (Memory.season) {
			if ((Memory.manualThreatList || []).includes(playerName)) {
				return false
			}
			if (this.isPlayerMediumWhiteListed(playerName)) {
				return true
			}
			if (Game.damagedRooms > Game.myRooms.length / 2) {
				return false
			}

			if (Memory.stats.hateCounter[playerName] > 1e5) {
				return false
			}

			if (Memory.season3) {				
				if (playerName == "QzarSTB" && Date.now() < 1628683200000) {
					return true
				}
				if (playerName == "PythonBeatJava") {
					return true
				}
				if (playerName == "Eiskalt") {
					return true
				}
				if (playerName == "TheLastPiece") {
					return true
				}
			}
			// if (Memory.season4 && playerName == "hardcoregandhi") {
			// 	return true
			// }
			// if (Memory.season4 && playerName == "rysade") {
			// 	return true
			// }
			// if (Memory.season4 && playerName == "Trepidimous") {
			// 	return true
			// }
			// if (Memory.season4 && playerName == "Xolym") {
			// 	return true
			// }
			// if (Memory.season4 && playerName == "psy372") {
			// 	return true
			// }
		}	

		return false
	},

	isPlayerMediumWhiteListed(playerName) {
		/*if (Memory.season) {
			if (this.isPlayerHeavyWhiteListed(playerName)) {
				return true
			}
			if (Memory.stats.hateCounter[playerName] > 5e5) {
				return false
			}

			if (Game.damagedRooms > Game.myRooms.length / 2) {
				return false
			}
		}	*/

		return false
	},

	isPlayerHeavyWhiteListed(playerName) {
		/*if (Memory.season) {
			if (Memory.stats.hateCounter[playerName] > 10e5) {
				return false
			}

			if (Game.damagedRooms > Game.myRooms.length / 2) {
				return false
			}
		}*/	

		return false
	},

	isRoomWhiteListed(roomName) {
		// if (Game.shard.name == "swc") {
		// 	if (Memory.rooms[roomName].owner != "Robalian") {
		// 		return true;
		// 	}
		// }
		
		if (Game.shard.name == "shard2") {
			/*if (Memory.rooms[roomName].owner == "Selesthiel" || Memory.rooms[roomName].reservedBy == "Selesthiel") {
				let coords = util.getRoomCoords(roomName);
				if (coords.x > 20) {
					if (Game.time > 9430000 + 2 * 400000 + 380000) {
						console.log("Deal with Selestheil expires on tick", 9430000 + 2 * 400000 + 380000, "currently", Game.time)
					}
					return true;
				}
			}*/

			// For now
			// if (Memory.rooms[roomName].terminalDenseRamparts && Memory.rooms[roomName].owner == "Muon" && Memory.rooms[roomName].rcl == 8) {
			// 	if (Math.random() < 0.01) console.log("Avoiding muons bunkers... FOW NOW")
			// 	return true;
			// }

			if (!Memory.rooms[roomName]) {
				return false
			}
			let owner = Memory.rooms[roomName].owner || Memory.rooms[roomName].reservedBy

			if (this.isPlayerWhiteListed(owner)) {
				return true;
			}



			// Short term


			// Not making any progress there
			if (owner == "Taki" && Memory.rooms[roomName].rcl == 8) {
				return true;
			}
			if (owner == "psy372" && Memory.rooms[roomName].rcl == 8) {
				return true;
			}
			// Not killing
			if (owner == "roshek" && roomName != "W6S41" && roomName != "W6S42" && roomName != "W6S43"/*&& Memory.rooms[roomName].rcl == 8*/) {
				return true;
			}
			if (owner == "olo" && Memory.rooms[roomName].rcl == 8) {
				return true;
			}
			// if (Memory.rooms[roomName].owner == "inakrin" && Memory.rooms[roomName].rcl == 8) {
			// 	return true;
			// }
			// if (Memory.rooms[roomName].owner != "FeTiD" && Memory.rooms[roomName].rcl == 8) {
			// 	return true;
			// }
		}
		else if (Memory.season) {
			if (!Memory.rooms[roomName]) {
				return false
			}
			let owner = Memory.rooms[roomName].owner || Memory.rooms[roomName].reservedBy

			if (Memory.season5 && owner == "Sneaky_Polar_Bear" && util.getRoomCoords(roomName).x >= 21) {
				return true
			}
			if (Memory.season5 && owner == "V1king" && (util.getRoomCoords(roomName).y < 0 || roomName == "W18N2")) {
				return true
			}

			if (this.isPlayerSoftWhiteListed(owner)) {
				return true;
			}
			if (this.isPlayerMediumWhiteListed(owner)) {
				return true;
			}
			if (this.isPlayerHeavyWhiteListed(owner)) {
				return true;
			}

			// if (roomName == "E30N10" || roomName == "E20N10" || roomName == "E30S10"|| roomName == "E30S20" || roomName == "E20N20" || roomName == "E30N20" || roomName == "E20S40") {
			// 	return true
			// }
			// if (roomName == "E3S21") {
			// 	return true
			// }

		}
		if (Memory.swc === 1) {
			let owner = Memory.rooms[roomName].owner || Memory.rooms[roomName].reservedBy

			if (this.isPlayerWhiteListed(owner)) {
				return true;
			}

			// if (roomName != "W9N8" && roomName != "W9N7") {
			// 	return true
			// }

			return false;
		}

		return false;
	},

	canClusterNuke(roomName) {
		let mem = Memory.rooms[roomName];
		if (!mem.seenSinceNuked) {
			return 0;
		}

		if (this.isRoomWhiteListed(roomName)) {
			return 0;
		}

		// There are many many many many reasons we may not want to nuke a room into
		// the stone age. Hopefully this covers most of them.
		if (mem.rcl != 8) return 0;
		if (mem.energyCapacityAvailable < 5000) return 0;
		if (!mem.spwnX || mem.spwnX.length < 3) return 0;
		if (!mem.trmX) return 0;
		if (!mem.storX) return 0;
		if ((mem.nukeLandTime || 0) - Game.time > 0) return 0;

		if ((mem.numAttacksFailed || 0) < constants.CLUSTER_NUKE_NUM_FAILS_CHECK) return 0;
		if (mem.DT < 0.02) return 0;
		if (Game.rooms[roomName] && !Game.rooms[roomName].dangerous) return 0;

		let totalTowerEnergy = 0;
		for (let energy of mem.twrE) {
			totalTowerEnergy += energy;
		}

		if (totalTowerEnergy < mem.twrE.length * 50) return 0;
		if ((mem.storE || 0) + (mem.trmE || 0) < 1000) return 0;


		return 1
	},

	setRoomLoot: function(room) {
		let rm = room.mem;

		let stores = []
		// Count everything not energy double. Lazy. TODO: Better
		let loot = 0;
		if (room.storage) {
			stores.push(room.storage.store)
		}
		if (room.terminal) {
			stores.push(room.terminal.store)
		}
		for (let container of room.containers) {
			stores.push(container.store)
		}

		for (let ruin of room.find(FIND_RUINS)) {
			stores.push(ruin.store)
		}

		// if (room.name == "E26S4") {
		// 	console.log(stores)
		// }

		for (let store of stores) {
			for (let resourceType in store) {
				if (resourceType == RESOURCE_ENERGY) continue
				if (Memory.marketInfo && Memory.marketInfo.energyPrice && Memory.marketInfo.avgEValues && Memory.marketInfo.avgEValues[resourceType]) {
					loot += store[resourceType] * Math.max(0, (Memory.marketInfo.avgEValues[resourceType] - Memory.marketInfo.energyPrice) / Memory.marketInfo.energyPrice);
				}
				else {									
					let mod = 2;
					if (COMMODITIES[resourceType]) {
						if (util.getDeBar(resourceType)) {
							mod = 6
						}
						else {
							mod = 2 * Math.pow(2, ((COMMODITIES[resourceType].level || 0) + 1) * 3);
						}
					}
					else if (RECIPES[resourceType]) {
						// eh, a bit of a hack
						mod = 1 + Math.pow(resourceType.length, 1.5)
					}
					loot += store[resourceType] * mod;
				}
				// if (room.name == "E26S4") {
				// 	console.log(store, resourceType, loot)
				// }
			}
		}

		for (let floor of room.find(FIND_DROPPED_RESOURCES)) {
			let resourceType = floor.resourceType
			if (resourceType == RESOURCE_ENERGY) continue
			if (Memory.marketInfo && Memory.marketInfo.energyPrice && Memory.marketInfo.avgEValues && Memory.marketInfo.avgEValues[resourceType]) {
				loot += floor.amount * Math.max(0, (Memory.marketInfo.avgEValues[resourceType] - Memory.marketInfo.energyPrice) / Memory.marketInfo.energyPrice);
			}
			else {									
				let mod = 2;
				if (COMMODITIES[resourceType]) {
					if (util.getDeBar(resourceType)) {
						mod = 6
					}
					else {
						mod = 2 * Math.pow(2, ((COMMODITIES[resourceType].level || 0) + 1) * 3);
					}
				}
				else if (RECIPES[resourceType]) {
					// eh, a bit of a hack
					mod = 1 + Math.pow(resourceType.length, 1.5)
				}
				loot += floor.amount * mod;
			}
		}

		if (loot) {
			rm.loot = Math.round(loot);
		}
		else {
			delete rm.loot;
		}
	},

	updateScouting: function() {
		Memory.enemyRooms = Memory.enemyRooms || [];
		Memory.strongholdRooms = Memory.strongholdRooms || [];

		// Apply known updates
		for (var roomName of Memory.enemyRooms) {
			if (Memory.rooms[roomName] && Memory.rooms[roomName].safeMode) {
				Memory.rooms[roomName].safeMode -= 1;
				if (Memory.rooms[roomName].safeMode >= 19000 && Memory.rooms[roomName].safeModeCooldown) {
					Memory.combatManager.requestedNukes = Memory.combatManager.requestedNukes || {}
					Memory.combatManager.requestedNukes[roomName] = Game.time;
				}
			}
		}

		// if (Game.time % 2) return

		for (var roomName in Game.rooms) {
			var room = Game.rooms[roomName]
			let rm = Memory.rooms[roomName]
			
			// Dunno what that is all about
			if (room.highway) {
				if (!Memory.privateServer) {					
					let portals = room.portals;
					if (portals.length) {
						Memory.knownIntershardPortalRoomNames = Memory.knownIntershardPortalRoomNames || [];

						rm.portalDests = []
						for (let portal of portals) {
							rm.portalDests.push(portal.destination)
						}

						if (!Memory.knownIntershardPortalRoomNames.includes(roomName)) {
							Memory.knownIntershardPortalRoomNames.push(roomName)
						}
					}
					else {
						delete rm.portalDests;
					}
				}

				rm.lo = Game.time;
				continue;
			}

			

			if (rm.sP === undefined || (Memory.privateServer && rm.sT === undefined)) {
				var sources = room.find(FIND_SOURCES);
				if (sources.length > 0) {
					rm.sP = "";

					for (var source of sources) {
						if (source.pos.x < 10) {
							rm.sP += "0"
						}
						rm.sP += source.pos.x;
						if (source.pos.y < 10) {
							rm.sP += "0"
						}
						rm.sP += source.pos.y;
					}

					if (Memory.privateServer && rm.sT === undefined) {
						rm.sT = ""
						for (var source of sources) {
							rm.sT += source.pos.countAccessibleTiles();
						}
					}
				}
			}


			if (!rm.m) {
				let mineral = Memory.season5 && RESOURCE_THORIUM ? room.find(FIND_MINERALS).filter(m => m.mineralType != RESOURCE_THORIUM)[0] : room.find(FIND_MINERALS)[0];
				if (mineral) {
					rm.m = "";
					if (mineral.pos.x < 10) {
						rm.m += "0"
					}
					rm.m += mineral.pos.x;

					if (mineral.pos.y < 10) {
						rm.m += "0"
					}
					rm.m += mineral.pos.y;
					rm.m += mineral.mineralType;
				}
			}
			if (room.keeperRoom || room.centreRoom) {
				if (room.keeperRoom && !rm.skLairsX) {
					let lairs = room.find2(FIND_HOSTILE_STRUCTURES);
					rm.skLairsX = []
					rm.skLairsY = []
					for (var lair of lairs) {
						if (lair.structureType == STRUCTURE_KEEPER_LAIR) {							
							rm.skLairsX.push(lair.pos.x)
							rm.skLairsY.push(lair.pos.y)
						}
					}
				}
				if (room.keeperRoom || room.centreRoom) {
					let mineral = room.find2(FIND_MINERALS)[0];
					rm.mineralAmount = mineral.mineralAmount;
				}
				if (room.centreRoom && Memory.season5) {
					let reactor = room.find(FIND_REACTORS)[0]
					if (reactor) {					
						rm.reactorPos = {x: reactor.pos.x, y: reactor.pos.y}
						rm.reactorAmount = reactor.store.getUsedCapacity(RESOURCE_THORIUM)
						rm.reactorOwner = reactor.owner ? reactor.owner.username : "none"
					} else {
						console.log("No reactor?", room.pos)
					}
				}
			} else if (Memory.season5 && !room.highway) {
				let thorium = room.find(FIND_MINERALS).filter(m => m.mineralType == RESOURCE_THORIUM)[0] 
				if (thorium) {
					rm.thoriumAmount = thorium.mineralAmount;
				}
			}

			if (true) {
				if (room.controller) {					
					rm.conX = room.controller.pos.x;
					rm.conY = room.controller.pos.y;
				}
				
				let scoutCreep;
				let scoutPos;

				let invaderOwned = false;

				if ((room.invaderCore && room.invaderCore.level > 0) || (room.controller && room.controller.owner)) {
					invaderOwned = !!room.invaderCore;

					// if (!rm.owner) {
						// Seen any of the others, we can see this one
						// rm.creepVisited = 0;
						// if (!invaderOwned) {						
						// 	for (let enemyRoomName of Memory.enemyRooms) {
						// 		if (Memory.rooms[enemyRoomName] && Memory.rooms[enemyRoomName].owner == room.controller.owner.username && Memory.rooms[enemyRoomName].creepVisited) {
						// 			rm.creepVisited = 1;
						// 			break;
						// 		}
						// 	}
						// }

						// if (!Memory.botArena && !rm.creepVisited) {
						// 	rm.firstObserveTime = Date.now();
						// }
					// }

					if (invaderOwned) {
						rm.owner = "Invader";
						rm.invaderOwned = 1
					}
					else {
						rm.owner = room.controller.owner.username;
						rm.rcl = room.controller.level;
						if (Memory.season2) {
							rm.hasStorage = room.storage ? 1 : 0;
							rm.hasTerminal = room.terminal ? 1 : 0;
							if (room.storage) {
								rm.storagePos = room.storage.pos
								rm.storageId = room.storage.id
								rm.storageAmount = _.sum(room.storage.store)
							}
							if (room.terminal) {
								rm.terminalPos = room.terminal.pos
								rm.terminalId = room.terminal.id
							}
							if (rm.owner == "Cub") {
								rm.enemyFullyConnected = 1;
							}
						}
					}

					if (invaderOwned || !room.controller.my) {
						scoutCreep = room.find2(FIND_MY_CREEPS)[0];
						if (scoutCreep) {
							// if (!rm.creepVisited) {
								// if (invaderOwned) {
								// 	rm.creepVisited = 1;
								// }
								// else {
									// Can visit one => can visit all
									// for (let enemyRoomName of Memory.enemyRooms) {
									// 	if (Memory.rooms[enemyRoomName] && Memory.rooms[enemyRoomName].owner == room.controller.owner.username) {
									// 		Memory.rooms[enemyRoomName].creepVisited = 1;
									// 	}
									// }
								// }
							// }
							// rm.creepVisited = 1;
							delete rm.firstObserveTime;

							scoutPos = scoutCreep.pos;
						}
						else {
							scoutPos = _.sample(room.find(FIND_EXIT));
						}
					}
				}
				else {
					if (Math.random() < 0.1) {		
						this.setRoomLoot(room)
						/*let loot = 0;
						if (room.storage) {
							loot += _.sum(room.storage.store) - room.storage.store[RESOURCE_ENERGY]
						}
						if (room.terminal) {
							loot += _.sum(room.terminal.store) - room.terminal.store[RESOURCE_ENERGY]
						}
						for (let container of room.containers) {
							loot += _.sum(container.store) - container.store[RESOURCE_ENERGY]
						}

						for (let ruin of room.find(FIND_RUINS)) {
							loot += _.sum(ruin.store) - ruin.store[RESOURCE_ENERGY]
						}

						if (loot) {
							rm.loot = loot;
						}
						else {
							delete rm.loot;
						}*/

						if (!room.controller || !room.controller.reservedBy) {
							delete rm.navigableByMask;
							delete rm.navigationByMask;
						}
						delete rm.firstObserveTime;
						delete rm.safeModeCooldown;
						delete rm.owner;
						delete rm.creepVisited;
						delete rm.rcl;
						delete rm.hasTerminal;
						delete rm.hasStorage;
						delete rm.storagePos;
						delete rm.storageId;
						delete rm.invaderOwned;

						delete rm.invCX
						delete rm.invCY
						delete rm.invCH
						delete rm.invCL
						delete rm.invCT
						delete rm.invCTTL
					}
				}




				let intelPeriod;
				if (scoutCreep && (invaderOwned || room.controller.owner)) {
					// Don't refresh often for "empty" rooms
					intelPeriod = ((rm.highestWall && global.roomAssaultCounts && global.roomAssaultCounts[roomName]) || room.dangerous) ? 20 : (rm.highestWall ? 100 : 200);

					if (rm.closestRoomRange && intelPeriod >= 100) {
						intelPeriod += 10 * rm.closestRoomRange
					}

				}
				else if (room.controller && room.controller.reservation) {
					intelPeriod = 20;
				}
				else {
					intelPeriod = 200;
				}


				// Clear this stuff out. We'll recreate it in the next branch if needed.
				// And if it's not (or used to be) it's good that it's gone!
				if (Game.time - (rm.lo || 0) > intelPeriod) {
					delete rm.powerEnabled;

					delete rm.controllerProgress

					delete rm.storE;
					delete rm.trmE;

					delete rm.hasLabs;
					delete rm.totalBoosts;
					delete rm.energyCapacityAvailable;

					delete rm.wallHP;
					delete rm.rampHP;

					delete rm.highestWall;

					delete rm.lowestOuterWall;
					delete rm.highestOuterWall;

					delete rm.lowestOuterWallByEdge;
					delete rm.highestOuterWallByEdge;

					delete rm.maxTowerDamageAtOuterWall
					delete rm.maxTowerDamageAtOuterWallByEdge

					delete rm.numWalls;
					delete rm.numRamps;

					delete rm.boundaryWallCount;
					delete rm.boundaryWallCountByEdge;

					delete rm.wallHPByEdge
					delete rm.rampartHPByEdge
					delete rm.wallCountByEdge
					delete rm.rampartCountByEdge

					delete rm.eWallsL;
					delete rm.eWallsR;
					delete rm.eWallsT;
					delete rm.eWallsB;

					delete rm.enemyFullyConnected;

					delete rm.twrX;
					delete rm.twrY;
					delete rm.twrE;
					delete rm.twrR;
					delete rm.spwnX;
					delete rm.spwnY;
					delete rm.spwnR;
					delete rm.spwnOpen;
					delete rm.lbX;
					delete rm.lbY;
					delete rm.lbR;

					delete rm.storX
					delete rm.storY

					delete rm.trmX
					delete rm.trmY

					delete rm.sumStorageStore
					delete rm.sumTerminalStore

					delete rm.storR
					delete rm.trmR

					delete rm.cttd

					if (scoutPos || (!invaderOwned && (!room.controller || !room.controller.owner))) {
						if (!room.controller || !room.controller.my) {
							// I use the same variable name for my and their rooms
							// This is a bad idea.
							delete rm.floodFill
							delete rm.compressedFloodFill
						}
						delete rm.spwnInside;
						delete rm.twrInside;
						delete rm.controllerAdjacency;
						delete rm.twrExtern;
						delete rm.spwnExtern;

						delete rm.storageInsideWalls;
						delete rm.terminalInsideWalls;

						delete rm.storageOnExternalRampart;
						delete rm.terminalOnExternalRampart;
					}

					// Not sure why I don't clear these for invader owned.
					if (!invaderOwned && (!room.controller || (room.controller && (!room.controller.owner || room.controller.my || room.controller.owner.username !== rm.owner)))) {
						// Stats tracking stuff.
						delete rm.towerShoots
						delete rm.repairPerTick
						delete rm.towerShootsAtClosest
						delete rm.towerShootsAtMax
						delete rm.towerShootsAtFirst
						delete rm.towerShootsAtHealers
						delete rm.towerEnergyThreshold
						delete rm.towerShootsWithFocus
						delete rm.towerLastShot
						delete rm.towerShootsAtLastTarget
						delete rm.towerShootsAtStrongholdMax
						delete rm.creepsShootAtStrongholdMax
						delete rm.roomIsDefending
						delete rm.roomLastDefense
						delete rm.lastTrmE
						delete rm.towerShootsAttack
						delete rm.towerShootsWhenCouldHeal
						delete rm.termEnergyInPerTick

						delete rm.meanActiveTowers;

						delete rm.formationBravery
						delete rm.lastFormationKilled
						delete rm.lastFormationKilledCC

						delete rm.numAttacksCompleted;
						delete rm.numAttacksFailed;
						delete rm.numAttacksFizzled;
						delete rm.numAttacksFailedClose
						delete rm.numAttacksFailedRanged
						delete rm.failedAtBoostLevel;
						delete rm.fizzledAtBoostLevel;
						delete rm.triedLowControllerPush;


						delete rm.rangedOnUnowned
						delete rm.rangedCreepsClose
						delete rm.hostilesPushTest
						delete rm.lastNukeLand
						delete rm.notOnWall
						delete rm.attackCreepsClose
						delete rm.numWeakRoomAttacksFailed

						delete rm.wavesNormalization

						// Why is this not with rm.controllerExposedToEdge;
						delete rm.controllerNearlyExposedToEdge


						delete rm.pathTowerDamageToControllerByEdge1x1
						delete rm.pathTowerDamageToControllerByEdge2x2

						delete rm.maxTowerDamageAtEdge

						delete rm.connectedOuterRampart
						delete rm.boundaryWallScores
						delete rm.assaultReactionCreepsSpawned
						delete rm.defenseBoostCost

						delete rm.exposedCreeps
						delete rm.undamagingFormation
						delete rm.advBlkDmg;
						delete rm.advBlkDmgTowersOnly;
						delete rm.percentLocalDefense;
						delete rm.withdrawTick;
						delete rm.markedBuildings;

						delete rm.nxtOPoll;
						delete rm.missionFailList;

						delete rm.lootersSpawned
						delete rm.numMegaTargetTiles
						delete rm.lastMegaTargetTilesTick
						delete rm.nxtMegaPoll
					}

					delete rm.terminalDenseRamparts;
					delete rm.storageDenseRamparts;

					delete rm.creepCombatPartsAttack;
					delete rm.creepCombatPartsRanged;
					delete rm.creepCombatPartsHeal;

					delete rm.bestCreepCombatPartsAttack

					delete rm.hostileCreepOwners;

					delete rm.creepCnt;			

					delete rm.creepRanged;
					delete rm.creepAttack;
					delete rm.creepHeal;
					delete rm.creepFortifier;

					delete rm.hostileBoostedCreeps;
					delete rm.hostileBoostedAnyCreeps;

					// No longer used.
					delete rm.nonLocalCreeps;

					// Don't forget this easily
					if (Math.random() < 0.01) {						
						delete rm.nonLocalCombatCreeps;
						delete rm.nonLocalCivilianCreeps;
					}

					delete rm.opTowerLevel;

					delete rm.maxTowerDamage;

					delete rm.numStructures;
					delete rm.allStructures;

					if (rm.markedBuildings) {
						for (let building in _.clone(rm.markedBuildings)) {
							if (Game.time - rm.markedBuildings[building].t > 1000) {
								delete rm.markedBuildings[building]
							}
						}
						if (rm.markedBuildings.length == 0) {
							delete rm.markedBuildings
						}
					}

					delete rm.unexposedController;

					delete rm.maxControllerDefenseHits;
					delete rm.towerDamageAtController;
					delete rm.controllerExposedToEdge;

					delete rm.srcPos;

					delete rm.sourcesExposedToEdge
					delete rm.sourcesNearlyExposedToEdge


					if (Math.random() < (1 / 10)) {
						delete rm.controllerUnreachable;
					}

					if (Math.random() < (1 / 100.)) {
						delete rm.pathTowerDamageToControllerByEdge1x1;
					}
					if (Math.random() < (1 / 100.)) {
						delete rm.pathTowerDamageToControllerByEdge2x2;
					}
					if (Math.random() < (1 / 100.)) {
						delete rm.pathTowerDamageToSourcesByEdge1x1;
					}

					// Delete very infrequently (1 in 100,000) as this is called at most 1 in 10 ticks.
					// And usually less than that.
					if (Math.random() < (1 / 10000.)) {
						delete rm.hostilesPushOut;
					}

					delete rm.invCX
					delete rm.invCY
					delete rm.invCH
					delete rm.invCL
					delete rm.invCT
					delete rm.invCTTL

					delete rm.plannedZoneStartTime
					delete rm.plannedZone

				}


				if (room.invaderCore) {
					rm.invCX = room.invaderCore.pos.x;
					rm.invCY = room.invaderCore.pos.y;
					rm.invCH = room.invaderCore.hits;
					rm.invCL = room.invaderCore.level;
					if (rm.invCT !== undefined && room.invaderCore.ticksToDeploy === undefined) {
						pathCache.purgePaths(3)	
						pathCache.purgeCostMatrices(3)	
					}
					rm.invCT = room.invaderCore.ticksToDeploy;
					delete rm.invCTTL
					for (let effect of room.invaderCore.effects) {
						if (effect.effect == EFFECT_COLLAPSE_TIMER && effect.ticksRemaining < STRONGHOLD_DECAY_TICKS) {
							rm.invCTTL = effect.ticksRemaining
						}
					}
				}

				// Grab intel. Only do this every intelPeriod ticks.
				if (Game.time - (rm.lo || 0) > intelPeriod) {
					// Used to be owned
					if ((room.controller && (room.controller.my || !room.controller.owner) && rm.lastScoutPos !== undefined && intelAI.getEnemyRoomSet().has(room.name)) || (!room.highway && !room.controller && !invaderOwned && Memory.strongholdRooms.includes(room.name))) {
						delete rm.wipedOnce;
						delete rm.killStorage;
						delete rm.killTerminal;
						delete rm.numAttacksCompleted;
						delete rm.numAttacksFailed;
						delete rm.numAttacksFizzled;
						delete rm.numAttacksFailedClose
						delete rm.numAttacksFailedRanged
						delete rm.failedAtBoostLevel;
						delete rm.fizzledAtBoostLevel;
						delete rm.triedLowControllerPush;

						delete rm.wavesNormalization

						delete rm.nukeTerminalAttempt;
						delete rm.nukeStorageAttempt;
						delete rm.nukeSpawnsAttempt;
						delete rm.nukeLabsAttempt;

						delete rm.nukeTerminalFailed;
						delete rm.nukeStorageFailed;
						delete rm.nukeSpawnsFailed;
						delete rm.nukeLabsFailed;

						delete rm.markedBuildings

						delete rm.lastScoutPos;

						delete rm.hostilesPushOut;

						delete rm.seenSinceNuked

						delete rm.controllerUnreachable;
						delete rm.pathTowerDamageToControllerByEdge1x1;
						delete rm.pathTowerDamageToControllerByEdge2x2;

						delete rm.allExtensionsAtSources
						delete rm.pathTowerDamageToSourcesByEdge1x1
						delete rm.seenSinceNuked
						delete rm.requestRenew
						delete rm.roomIsCreepDefending

						delete rm.hostilesPushOut;
						
						delete rm.invCX
						delete rm.invCY
						delete rm.invCH
						delete rm.invCL
						delete rm.invCT
						delete rm.invCTTL

						delete rm.lootersSpawned

						delete rm.nxtOPoll;

						delete rm.numMegaTargetTiles
						delete rm.lastMegaTargetTilesTick
						delete rm.nxtMegaPoll


						delete rm.assaultReactionCreepsSpawned
						delete rm.formationBravery
						delete rm.lastFormationKilled
						delete rm.lastFormationKilledCC

						delete rm.closestRoomRange

						delete rm.exitSize

						delete rm.towerCnt


						// These are out of date.
						global.safeRouteCosts = {};
						_.pull(Memory.enemyRooms, room.name)
						_.pull(Memory.strongholdRooms, room.name)

						global.enemyRoomSet.delete(room.name)

						pathCache.purgePaths(3)
						pathCache.purgeCostMatrices(3)
					}

					// Reserved
					if (!invaderOwned && room.controller && !room.controller.my && room.controller.reservation && room.controller.reservation.username != util.getMyName() && room.controller.reservation.username != "Invader") {
						let numStructures = room.find(FIND_STRUCTURES, {
							filter: (structure) => {
								return (structure.structureType == STRUCTURE_ROAD || structure.structureType == STRUCTURE_CONTAINER);
							}
						}).length;

						if (numStructures > 0) {
							rm.numStructures = numStructures;
							if (!room.controller.pos.isAccessible()) {
								rm.unexposedController = 1;
								Memory.combatManager.requestedMissions["formationRemoteDecon"][roomName] = Game.time;
							}
						}
						else {
							delete rm.numStructures
							delete rm.unexposedController
						}

						rm.lo = Game.time;
					}
					// Owned
					// else if ((invaderOwned || (room.controller && !room.controller.my && room.controller.owner && !this.isRoomWhiteListed(room.name))) && util.isRoomAccessible(roomName) && (!Memory.swc || !global.whiteList.includes(rm.owner))) {
					else if ((invaderOwned || (room.controller && !room.controller.my && room.controller.owner && !scouting.isPlayerMediumWhiteListed(room.controller.owner))) && util.isRoomAccessible(roomName) && (!Memory.swc || !global.whiteList.includes(rm.owner)) && !this.isRoomWhiteListed(room.name)) {
						if (invaderOwned) {
							if (!room.invaderCore.ticksToDeploy) {
								Memory.combatManager.requestedMissions[global.MISSION_STRONGHOLD_ASSAULT][roomName] = Game.time;	
							}
							else {
								delete Memory.combatManager.requestedMissions[global.MISSION_STRONGHOLD_ASSAULT][roomName]
							}
						}


						if ((Game.cpu.getUsed() < 300 && Math.random() < 0.05) || !rm.closestRoomRange) {
							rm.closestRoomRange = Infinity
							for (let myRoom of Game.myRooms) {
								rm.closestRoomRange = Math.min(rm.closestRoomRange, safeRoute.getSafeRouteCost(myRoom.name, roomName, true))
							}
							rm.closestRoomRange = Math.round(rm.closestRoomRange * 1000) / 1000
						}


						let roomTerrain = Game.map.getRoomTerrain(roomName)

						if (invaderOwned && !Memory.strongholdRooms.includes(room.name)) {
							Memory.strongholdRooms.push(room.name);
							// These are out of date.
							global.safeRouteCosts = {};

						}
						else if (!invaderOwned && room.controller && room.controller.owner && !intelAI.getEnemyRoomSet().has(room.name)) {
							Memory.enemyRooms.push(room.name);
							global.enemyRoomSet.add(room.name)
							// These are out of date.
							global.safeRouteCosts = {};
						}

						if (room.controller && !room.controller.pos.isAccessible()) {
							rm.unexposedController = 1;
						}
						else {
							delete rm.unexposedController;
						}

						if (!invaderOwned && room.controller) {
							rm.controllerProgress = room.controller.progress
						}

						rm.numStructures = room.find2(FIND_STRUCTURES).length;

						let spawns = room.find2(FIND_HOSTILE_SPAWNS);

						rm.powerEnabled = (!room.controller || room.controller.isPowerEnabled) ? 1 : 0;

						// If the room has power enabled max level operate and disrupt cancel to 0.75
						// Sometimes they'll have operate and I won't have disrupt. Sometimes t'other way
						// sometimes neither. Feck it, leave it at 1 and deal with it later.
						let towerDamageScale = 1;

						rm.seenSinceNuked = 1;

						// Count towers, spawns and safe mode.
						rm.safeMode = room.controller ? room.controller.safeMode : 0;
						rm.safeModeCooldown = room.controller ? room.controller.safeModeCooldown : 0;

						let totalBoosts = [0, 0, 0]

						if (room.storage) {
							rm.storE = room.storage.store[RESOURCE_ENERGY];
							for (let resource in room.storage.store) {
								let boostTier = util.getBoostTier(resource)
								if (boostTier) {
									totalBoosts[boostTier - 1] += room.storage.store.getUsedCapacity(resource)
								}
							}
						}
						if (room.terminal) {
							rm.trmE = room.terminal.store[RESOURCE_ENERGY];
							for (let resource in room.terminal.store) {
								let boostTier = util.getBoostTier(resource)
								if (boostTier) {
									totalBoosts[boostTier - 1] += room.terminal.store.getUsedCapacity(resource)
								}
							}
						}
						for (let lab of room.labs) {
							for (let resource in lab.store) {
								let boostTier = util.getBoostTier(resource)
								if (boostTier) {
									totalBoosts[boostTier - 1] += lab.store.getUsedCapacity(resource)
								}
							}
						}

						rm.totalBoosts = totalBoosts

						if (room.labs.length) {
							rm.hasLabs = 1;
						}
						rm.energyCapacityAvailable = room.controller ? (room.extensions.length * EXTENSION_ENERGY_CAPACITY[room.controller.level] + spawns.length * SPAWN_ENERGY_CAPACITY) : 0;

						// We initialize to 1, make walls zero. We don't allow propagation through anything other than 1.
						// But we can mark the boundaries specially so we know where the surfaces are.
						// Post flood:
						//  Interior walls/ramparts 0
						//  Rest of inside 1
						//  Map walls 2
						//  Exterior walls/ramparts 3
						//  Everything outside will be 4
						//
						// TODO: Improve this. I think I really want "min num walls to cross to get to target".
						//       Be careful with impassible walls!
						// var defensiveStructures = room.find2(FIND_STRUCTURES, {
						// 	filter: (structure) => {
						// 		return (structure.structureType == STRUCTURE_WALL || structure.structureType == STRUCTURE_RAMPART);
						// 	}
						// });
						let towers = room.towers;
						let maxActive;
						if (invaderOwned) {
							maxActive = towers.length
						}
						else {
							maxActive = Math.min(towers.length, CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level]);
						}

						// Set one active so we continue to send assaults to RCL 1/2 rooms.
						if (towers.length > 0 && maxActive == 0) {
							maxActive = 1;
						}

						var defensiveStructures = (_.filter(room.ramparts, (rampart) => (!rampart.my))).concat(room.constructedWalls);

					
						rm.wallHP = 0;
						rm.rampHP = 0;

						rm.numWalls = 0;
						rm.numRamps = 0;

						rm.highestWall = 0;

						for (var structure of defensiveStructures) {
							if (structure.structureType == STRUCTURE_WALL && structure.hits) {
								rm.numWalls++;
								rm.wallHP += structure.hits;
							}
							else if (structure.structureType == STRUCTURE_RAMPART) {
								rm.numRamps++;
								rm.rampHP += structure.hits;

							}
							if (structure.hits > rm.highestWall) {
								rm.highestWall = structure.hits;
							}
						}

						if (!scoutPos) {
							scoutPos = rm.lastScoutPos;
						}

						let floodArray;

						if (scoutPos) {
							// Set inside the loop
							rm.maxTowerDamageAtOuterWall = defensiveStructures.length > 0 ? 0 : towers.length * TOWER_POWER_ATTACK;

							rm.lowestOuterWall = defensiveStructures.length > 0 ? Infinity : 0;
							rm.highestOuterWall = 0;

							let baseFloodArray = new customCostMatrix();

							// Do a pool to see if the enemy is contained.
							for (var i = 0; i < 50; i++) {
								for (var j = 0; j < 50; j++) {
									baseFloodArray.set2(i, j, (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) ? 2 : 1);
								}
							}

							for (var structure of defensiveStructures) {
								baseFloodArray.set2(structure.pos.x, structure.pos.y, 0);
							}

							let boundaryWallCountByEdge = [0, 0, 0, 0];
							let wallHPByEdge = [0, 0, 0, 0];
							let rampartHPByEdge = [0, 0, 0, 0];
							let wallCountByEdge = [0, 0, 0, 0];
							let rampartCountByEdge = [0, 0, 0, 0];

							function floodFillSegment(_floodArray, i, j, value) {
								if (_floodArray.get2(i, j) == 1) {
									_floodArray.set2(i, j, value)
									if (i - 1 >= 0)  floodFillSegment(_floodArray, i-1, j, value);
									if (i + 1 <= 49) floodFillSegment(_floodArray, i+1, j, value);
									if (j - 1 >= 0)  floodFillSegment(_floodArray, i, j-1, value);
									if (j + 1 <= 49) floodFillSegment(_floodArray, i, j+1, value);

									if (i - 1 >= 0 && j - 1 >= 0)  floodFillSegment(_floodArray, i-1, j-1, value);
									if (i + 1 <= 49 && j - 1 >= 0) floodFillSegment(_floodArray, i+1, j-1, value);
									if (i - 1 >= 0 && j + 1 <= 49)  floodFillSegment(_floodArray, i-1, j+1, value);
									if (i + 1 <= 49 && j + 1 <= 49) floodFillSegment(_floodArray, i+1, j+1, value);
								}
								// Boundary walls
								else if (_floodArray.get2(i, j) == 0) {
									_floodArray.set2(i, j, 3);
									rm.boundaryWallCount++;
								}
							}

							function floodFillEdgeCounts(_floodArray, i, j, value) {
								if (_floodArray.get2(i, j) == 1) {
									_floodArray.set2(i, j, value)
									if (i - 1 >= 0)  floodFillEdgeCounts(_floodArray, i-1, j, value);
									if (i + 1 <= 49) floodFillEdgeCounts(_floodArray, i+1, j, value);
									if (j - 1 >= 0)  floodFillEdgeCounts(_floodArray, i, j-1, value);
									if (j + 1 <= 49) floodFillEdgeCounts(_floodArray, i, j+1, value);

									if (i - 1 >= 0 && j - 1 >= 0)  floodFillEdgeCounts(_floodArray, i-1, j-1, value);
									if (i + 1 <= 49 && j - 1 >= 0) floodFillEdgeCounts(_floodArray, i+1, j-1, value);
									if (i - 1 >= 0 && j + 1 <= 49)  floodFillEdgeCounts(_floodArray, i-1, j+1, value);
									if (i + 1 <= 49 && j + 1 <= 49) floodFillEdgeCounts(_floodArray, i+1, j+1, value);
								}
								// Boundary walls
								else if (_floodArray.get2(i, j) == 0) {
									_floodArray.set2(i, j, 3);
									boundaryWallCountByEdge[value - 4]++;

									for (let struct of room.lookForAt(LOOK_STRUCTURES, i, j)) {
										if (struct.structureType == STRUCTURE_WALL) {
											wallHPByEdge[value - 4] += struct.hits;
											wallCountByEdge[value - 4]++
										}
										else if (struct.structureType == STRUCTURE_RAMPART) {
											rampartHPByEdge[value - 4] += struct.hits;
											rampartCountByEdge[value - 4]++
										}
									}
								}
							}

							function floodFillWithBounds(_floodArray, i, j, mini, minj, maxi, maxj, value) {

								if (_floodArray.get2(i, j) == 1) {
									_floodArray.set2(i, j, value)

									let res = 0;
									let inside = i >= 3 && i <= 46 && j >= 3 && j <= 46
									if (i >= maxi && inside) res = 1;
									if (j >= maxj && inside) res = 1;
									if (i <= mini && inside) res = 1;
									if (j <= minj && inside) res = 1;

									if (i - 1 >= 0)  res += floodFillWithBounds(_floodArray, i-1, j, mini, minj, maxi, maxj, value);
									if (i + 1 <= 49) res += floodFillWithBounds(_floodArray, i+1, j, mini, minj, maxi, maxj, value);
									if (j - 1 >= 0)  res += floodFillWithBounds(_floodArray, i, j-1, mini, minj, maxi, maxj, value);
									if (j + 1 <= 49) res += floodFillWithBounds(_floodArray, i, j+1, mini, minj, maxi, maxj, value);

									if (i - 1 >= 0 && j - 1 >= 0)  res += floodFillWithBounds(_floodArray, i-1, j-1, mini, minj, maxi, maxj, value);
									if (i + 1 <= 49 && j - 1 >= 0) res += floodFillWithBounds(_floodArray, i+1, j-1, mini, minj, maxi, maxj, value);
									if (i - 1 >= 0 && j + 1 <= 49)  res += floodFillWithBounds(_floodArray, i-1, j+1, mini, minj, maxi, maxj, value);
									if (i + 1 <= 49 && j + 1 <= 49) res += floodFillWithBounds(_floodArray, i+1, j+1, mini, minj, maxi, maxj, value);

									return res;
								}
								// Boundary walls
								else if (_floodArray.get2(i, j) == 0) {
									_floodArray.set2(i, j, 3)
								}

								return 0;
							}


							function calcTowerDamageByEdge(_floodArray) {
								for (var structure of defensiveStructures) {
									if (structure.hits && _floodArray.get2(structure.pos.x, structure.pos.y) == 3) {
										if (structure.hits < rm.lowestOuterWall) {
											rm.lowestOuterWall = structure.hits;
										}
										else if (structure.hits > rm.highestOuterWall) {
											rm.highestOuterWall = structure.hits;
										}
										// if (towers.length) {
											let damage = 0;
											for (let tower of towers) {
												damage += util.getTowerDamageForDist(tower.pos.getRangeTo(structure.pos));
											}
											if (damage > rm.maxTowerDamageAtOuterWall) {
												rm.maxTowerDamageAtOuterWall = damage;
											}

											for (let i = structure.pos.x - 1; i <= structure.pos.x + 1; i++) {
												for (let j = structure.pos.y - 1; j <= structure.pos.y + 1; j++) {
													if (_floodArray.get2(i, j) >= 4) {
														let damage = 0;
														for (let tower of towers) {
															damage += util.getTowerDamageForDist(tower.pos.getRangeTo(i, j));
														}
														let edgeIdx = _floodArray.get2(i, j) - 4;

														if (damage > rm.maxTowerDamageAtOuterWallByEdge[edgeIdx]) {
															rm.maxTowerDamageAtOuterWallByEdge[edgeIdx] = damage;
														}
														if (structure.hits < rm.lowestOuterWallByEdge[edgeIdx]) {
															rm.lowestOuterWallByEdge[edgeIdx] = structure.hits;
														}
														else if (structure.hits > rm.highestOuterWallByEdge[edgeIdx]) {
															rm.highestOuterWallByEdge[edgeIdx] = structure.hits;
														}

													}
												}
											}
										// }
									}
								}
							}

							function isPosExposedToEdge(_floodArray, pos, range) {
								let count = 0;

								for (let i = pos.x - 1; i <= pos.x + 1; i++) {
									for (let j = pos.y - 1; j <= pos.y + 1; j++) {
										if (i == j || i < 0 || j < 0 || i > 49 || j > 49) continue;
										if (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) continue;
										if (range == 2) {
											count += isPosExposedToEdge(_floodArray, new RoomPosition(i, j, pos.roomName), 1)
										}
										else {										
											if (_floodArray.get2(i, j) >= 4) {
												count++;
											}
										}
									}
								}
								return count;
							}


							floodArray = baseFloodArray.clone();

							// Wall count is not sum(wallCountByEdge). We want both.
							rm.boundaryWallCount = 0;

							// Second task is to segment and store tha map
							if (defensiveStructures.length) {
								let cnt = 0;
								for (let i = 0; i < 50; i++) {
									if (floodArray.get2(i, 0) == 1) {
										floodFillSegment(floodArray, i, 0, 4);
										cnt++;
									}
								}
								for (let i = 0; i < 50; i++) {
									if (floodArray.get2(49, i) == 1) {
										floodFillSegment(floodArray, 49, i, 5);
										cnt++;
									}
								}
								for (let i = 0; i < 50; i++) {
									if (floodArray.get2(i, 49) == 1) {
										floodFillSegment(floodArray, i, 49, 6);
										cnt++;
									}
								}

								for (let i = 0; i < 50; i++) {
									if (floodArray.get2(0, i) == 1) {
										floodFillSegment(floodArray, 0, i, 7);
										cnt++;
									}
								}
								if (cnt == 1) {
									rm.enemyFullyConnected = 1;
								}
								rm.floodFill = util.compressFloodArrayCM(floodArray);
							}
							else {
								rm.enemyFullyConnected = 1;
								delete rm.floodFill
							}


							rm.maxTowerDamageAtOuterWallByEdge = [rm.maxTowerDamageAtOuterWall, rm.maxTowerDamageAtOuterWall, rm.maxTowerDamageAtOuterWall, rm.maxTowerDamageAtOuterWall];
							rm.lowestOuterWallByEdge = defensiveStructures.length > 0 ? [Infinity, Infinity, Infinity, Infinity] : [0, 0, 0, 0];
							rm.highestOuterWallByEdge = [0, 0, 0, 0];


							rm.controllerExposedToEdge = [0, 0, 0, 0];
							rm.controllerNearlyExposedToEdge = [0, 0, 0, 0];

							if (!invaderOwned) {
								rm.sourcesExposedToEdge = {}
								rm.sourcesNearlyExposedToEdge = {}
								rm.srcPos = {}
								for (let source of room.find(FIND_SOURCES)) {								
									rm.sourcesExposedToEdge[source.id] = [0, 0, 0, 0];
									rm.sourcesNearlyExposedToEdge[source.id] = [0, 0, 0, 0];

									// Gah. Don't want this. Oh well.
									rm.srcPos[source.id] = {x: source.pos.x, y: source.pos.y};
								}
							}

							// First task is to get all the boundary wall counts.
							if (defensiveStructures.length) {
								// Quite a lot cheaper.
								/*if (rm.enemyFullyConnected) {
									calcTowerDamageByEdge(floodArray);
									if (room.controller) {									
										rm.controllerExposedToEdge[0] = isPosExposedToEdge(floodArray, room.controller.pos, 1)
										rm.controllerNearlyExposedToEdge[0] = rm.controllerExposedToEdge[0] || isPosExposedToEdge(floodArray, room.controller.pos, 2)
									}

									for (let i = 0; i < 4; i++) {
										rm.controllerExposedToEdge[i] = rm.controllerExposedToEdge[0]
										rm.controllerNearlyExposedToEdge[i] = rm.controllerNearlyExposedToEdge[0]
										rm.maxTowerDamageAtOuterWallByEdge[i] = rm.maxTowerDamageAtOuterWallByEdge[0]
										rm.lowestOuterWallByEdge[i] = rm.lowestOuterWallByEdge[0]
										rm.highestOuterWallByEdge[i] = rm.highestOuterWallByEdge[0]
										boundaryWallCountByEdge[i] = rm.boundaryWallCount						
									}
								}
								else {*/
									// Rather than the above optimization, just do the below for only active exits.
									function fillOtherEdges(iStart) {
										for (let i = iStart + 1; i < 4; i++) {
											if (room.controller) {
												rm.controllerExposedToEdge[i] = rm.controllerExposedToEdge[iStart]
												rm.controllerNearlyExposedToEdge[i] = rm.controllerNearlyExposedToEdge[iStart]
											}
											if (!invaderOwned) {
												for (let source of room.find(FIND_SOURCES)) {								
													rm.sourcesExposedToEdge[source.id][i] = rm.sourcesExposedToEdge[source.id][iStart];
													rm.sourcesNearlyExposedToEdge[source.id][i] = rm.sourcesNearlyExposedToEdge[source.id][iStart]
												}
											}
											rm.maxTowerDamageAtOuterWallByEdge[i] = rm.maxTowerDamageAtOuterWallByEdge[iStart];
											rm.lowestOuterWallByEdge[i] = rm.lowestOuterWallByEdge[iStart];
											rm.highestOuterWallByEdge[i] = rm.highestOuterWallByEdge[iStart];
											boundaryWallCountByEdge[i] = boundaryWallCountByEdge[iStart]

											wallHPByEdge[i] = wallHPByEdge[iStart]
											wallCountByEdge[i] = wallCountByEdge[iStart]
											rampartHPByEdge[i] = rampartHPByEdge[iStart]
											rampartCountByEdge[i] = rampartCountByEdge[iStart]
										}
									}


									let usedFa = false;
									let complete = false;
									let fa = baseFloodArray.clone();

									for (let i = 0; i < 50; i++) {
										if (fa.get(i, 0) == 1) {
											floodFillEdgeCounts(fa, i, 0, 4);
											usedFa = true;
										}
									}


									if (usedFa) {
										calcTowerDamageByEdge(fa);
										if (room.controller) {
											rm.controllerExposedToEdge[0] = isPosExposedToEdge(fa, room.controller.pos, 1)
											rm.controllerNearlyExposedToEdge[0] = rm.controllerExposedToEdge[0] || isPosExposedToEdge(fa, room.controller.pos, 2)
										}
										if (!invaderOwned) {
											for (let source of room.find(FIND_SOURCES)) {								
												rm.sourcesExposedToEdge[source.id][0] = isPosExposedToEdge(fa, source.pos, 1)
												rm.sourcesNearlyExposedToEdge[source.id][0] = rm.sourcesExposedToEdge[source.id][0] || isPosExposedToEdge(fa, source.pos, 2)
											}
										}

										usedFa = false

										if (rm.enemyFullyConnected) {
											complete = true;
											fillOtherEdges(0)
										}
										else {
											fa.copyFrom(baseFloodArray);
										}

									}

									if (!complete) {
										for (let i = 0; i < 50; i++) {
											if (fa.get(49, i) == 1) {
												floodFillEdgeCounts(fa, 49, i, 5);
												usedFa = true;
											}
										}


										if (usedFa) {
											calcTowerDamageByEdge(fa);
											if (room.controller) {									
												rm.controllerExposedToEdge[1] = isPosExposedToEdge(fa, room.controller.pos, 1)
												rm.controllerNearlyExposedToEdge[1] = rm.controllerExposedToEdge[1] || isPosExposedToEdge(fa, room.controller.pos, 2)
											}
											if (!invaderOwned) {
												for (let source of room.find(FIND_SOURCES)) {								
													rm.sourcesExposedToEdge[source.id][1] = isPosExposedToEdge(fa, source.pos, 1)
													rm.sourcesNearlyExposedToEdge[source.id][1] = rm.sourcesExposedToEdge[source.id][1] || isPosExposedToEdge(fa, source.pos, 2)
												}
											}

											usedFa = false
											if (rm.enemyFullyConnected) {
												complete = true;
												fillOtherEdges(1)
											}
											else {
												fa.copyFrom(baseFloodArray);
											}
										}

										if (!complete) {
											for (let i = 0; i < 50; i++) {
												if (fa.get(i, 49) == 1) {
													floodFillEdgeCounts(fa, i, 49, 6);
													usedFa = true;
												}
											}


											if (usedFa) {
												calcTowerDamageByEdge(fa);
												if (room.controller) {
													rm.controllerExposedToEdge[2] = isPosExposedToEdge(fa, room.controller.pos, 1)
													rm.controllerNearlyExposedToEdge[2] = rm.controllerExposedToEdge[2] || isPosExposedToEdge(fa, room.controller.pos, 2)
												}
												if (!invaderOwned) {
													for (let source of room.find(FIND_SOURCES)) {								
														rm.sourcesExposedToEdge[source.id][2] = isPosExposedToEdge(fa, source.pos, 1)
														rm.sourcesNearlyExposedToEdge[source.id][2] = rm.sourcesExposedToEdge[source.id][2] || isPosExposedToEdge(fa, source.pos, 2)
													}
												}

												usedFa = false
												if (rm.enemyFullyConnected) {
													complete = true;
													fillOtherEdges(2)
												}
												else {
													fa.copyFrom(baseFloodArray);
												}
											}
										}
										if (!complete) {
											for (let i = 0; i < 50; i++) {
												if (fa.get(0, i) == 1) {
													floodFillEdgeCounts(fa, 0, i, 7);
													usedFa = true;
												}
											}

											if (usedFa) {									
												calcTowerDamageByEdge(fa);
												if (room.controller) {
													rm.controllerExposedToEdge[3] = isPosExposedToEdge(fa, room.controller.pos, 1)
													rm.controllerNearlyExposedToEdge[3] = rm.controllerExposedToEdge[3] || isPosExposedToEdge(fa, room.controller.pos, 2)
												}
												if (!invaderOwned) {
													for (let source of room.find(FIND_SOURCES)) {								
														rm.sourcesExposedToEdge[source.id][3] = isPosExposedToEdge(fa, source.pos, 1)
														rm.sourcesNearlyExposedToEdge[source.id][3] = rm.sourcesExposedToEdge[source.id][3] || isPosExposedToEdge(fa, source.pos, 2)
													}
												}
											}
										}
									}
								// }
							}
							else {
								rm.controllerExposedToEdge = [1, 1, 1, 1]
								rm.controllerNearlyExposedToEdge = [1, 1, 1, 1]
								if (!invaderOwned) {
									for (let source of room.find(FIND_SOURCES)) {								
										rm.sourcesExposedToEdge[source.id] = [1, 1, 1, 1]
										rm.sourcesNearlyExposedToEdge[source.id] = [1, 1, 1, 1]
									}
								}
							}
							

							rm.boundaryWallCountByEdge = _.clone(boundaryWallCountByEdge);
							rm.wallHPByEdge = _.clone(wallHPByEdge);
							rm.rampartHPByEdge = _.clone(rampartHPByEdge);
							rm.wallCountByEdge = _.clone(wallCountByEdge);
							rm.rampartCountByEdge = _.clone(rampartCountByEdge);

							// Generate if I'm assaulting, otherwise delete
							if (global.roomAssaultCounts && global.roomAssaultCounts[roomName] && global.roomAssaultCounts[roomName].assaultCount) {
								if (!rm.exitSize) {
									rm.exitSize = []
									rm.exitSize[0] = room.find(FIND_EXIT_TOP).length
									rm.exitSize[1] = room.find(FIND_EXIT_RIGHT).length
									rm.exitSize[2] = room.find(FIND_EXIT_BOTTOM).length
									rm.exitSize[3] = room.find(FIND_EXIT_LEFT).length
								}


								rm.assaultReactionCreepsSpawned = rm.assaultReactionCreepsSpawned || [];

								// Want to know about all creeps that have spawned. That way we can see how many are local and how many are remote.
								if (!invaderOwned) {								
									for (let tombstone of room.find(FIND_TOMBSTONES)) {
										// console.log(tombstone.creep.id)
										_.pull(rm.assaultReactionCreepsSpawned, tombstone.creep.id)
									}

									for (let spawn of spawns) {
										if (spawn.spawning) {
											let spawningCreep = spawn.pos.lookFor(LOOK_CREEPS)[0];
											if (!spawningCreep.hasBodypart(ATTACK) && !spawningCreep.hasBodypart(RANGED_ATTACK) && !spawningCreep.hasBodypart(HEAL)) {
												continue
											}

											if (!rm.assaultReactionCreepsSpawned.includes(spawningCreep.id)) {
												rm.assaultReactionCreepsSpawned.push(spawningCreep.id)	
											}
										}
									}


								}


								if (global.wasm_module && global.wasm_module.lzw_encode && !rm.boundaryWallScores) {
									let boundaryWallScores = [];

									let terrain = room.getTerrain()

									for (let i = 0; i < 50; i++) {
										boundaryWallScores.push([]);
									}

									// Lets do some analysis on the outer walls. Try to find weak points.
									for (var structure of defensiveStructures) {
										if (floodArray.get2(structure.pos.x, structure.pos.y) == 3) {
											let score = 0;

											for (let i = structure.pos.x-2; i <= structure.pos.x+2; i++) {
												for (let j = structure.pos.y-2; j <= structure.pos.y+2; j++) {
													if (i < 0 || i > 49 || j < 0 || j > 49) continue;
													let swamp = terrain.get(i, j) & TERRAIN_MASK_SWAMP;

													// We want the other guy to be swampy, but not us
													if (swamp) {
														// External
														if (floodArray.get2(i, j) >= 4) {
															score -= 4;
														}
														else {
															let road = 0;
															let otherStructs = room.lookForAt(LOOK_STRUCTURES, i, j);
															for (let otherStruct of otherStructs) {
																if (otherStruct.structureType == STRUCTURE_ROAD) {
																	road = 1;
																	break;
																}
															}
															if (!road) {
																score += 1;
															}
														}
													}
												}
											}

											boundaryWallScores[structure.pos.x][structure.pos.y] = score;
										}
									}

									global.roomBoundaryWallScores = global.roomBoundaryWallScores || {};
									global.roomBoundaryWallScores[room.name] = boundaryWallScores;
									rm.boundaryWallScores = global.wasm_module.lzw_encode(JSON.stringify(boundaryWallScores));								
								}
							}
							// Not assaulting. Clear out this.
							else {
								delete rm.connectedOuterRampart

								delete rm.boundaryWallScores
								delete rm.assaultReactionCreepsSpawned
								delete rm.exitSize
							}




							let maxControllerDefenseHits = 0;
							if (room.controller && defensiveStructures.length) {
								for (let i = room.controller.pos.x - 1; i <= room.controller.pos.x + 1; i++) {
									for (let j = room.controller.pos.y - 1; j <= room.controller.pos.y + 1; j++) {
										if (i == j) continue;
										if (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) continue;
										if (floodArray.get2(i, j) == 3) {
											let structs = room.lookForAt(LOOK_STRUCTURES, i, j)
											for (let struct of structs) {
												if (struct.structureType != STRUCTURE_CONTAINER && struct.structureType != STRUCTURE_ROAD) {
													maxControllerDefenseHits = Math.max(struct.hits, maxControllerDefenseHits)
												}
											}
										}
									}
								}
							}
							rm.maxControllerDefenseHits = maxControllerDefenseHits;

							if (room.controller) {							
								rm.towerDamageAtController = 0;
								for (let tower of towers) {
									rm.towerDamageAtController += util.getTowerDamageForDist(tower.pos.getRangeTo(room.controller.pos.x, room.controller.pos.y));
								}
							}


							if (rm.towerCnt != towers.length) {
								console.log(roomName, "has changed tower count", rm.towerCnt, towers.length)

								delete rm.pathTowerDamageToControllerByEdge1x1
								delete rm.pathTowerDamageToControllerByEdge2x2
								delete rm.pathTowerDamageToSourcesByEdge1x1
							}

							rm.towerCnt = towers.length



							// This is quite a mouthful!
							// Find how much damage we'll take on the walk to the controller
							if (!rm.pathTowerDamageToControllerByEdge1x1 && room.controller) {
								console.log("Calculating pathTowerDamageToControllerByEdge1x1", roomName)
								rm.pathTowerDamageToControllerByEdge1x1 = [0, 0, 0, 0];
								if (towers.length) {									
									for (var edgeIdx = 0; edgeIdx < 4; edgeIdx++) {
										if (!rm.controllerExposedToEdge[edgeIdx] && !rm.controllerNearlyExposedToEdge[edgeIdx]) continue;

										// This is going to be fairly brutal.
										for (var i = 1; i < 49; i++) {
											let x;
											let y;
											switch (edgeIdx) {
												case 0:
													x = i;
													y = 0;
													break;
												case 1:
													x = 49;
													y = i;
													break;
												case 2:
													x = i;
													y = 49;
													break;
												case 3:
													x = 0;
													y = i;
													break;
											}
											if (roomTerrain.get(x, y) & TERRAIN_MASK_WALL) continue
											let startPos = new RoomPosition(x, y, roomName)
											let pathPlan = pathCache.getPath(startPos,
																		 new RoomPosition(room.controller.pos.x, room.controller.pos.y, roomName),
																		 2,
																		 1,
																		 0,
																		 1,
																		 {maxRooms: 1, avoidTowers: 1})

											if (pathPlan.incomplete) continue;
											for (var pos of pathCache.deserializePathSINGLEROOM(startPos, pathPlan.path)) {
												let towerDamage = 0;
												for (let tower of towers) {
													towerDamage += util.getTowerDamageForDist(tower.pos.getRangeToXY(pos.x, pos.y));
												}
												if (towerDamage > rm.pathTowerDamageToControllerByEdge1x1[edgeIdx]) {
													rm.pathTowerDamageToControllerByEdge1x1[edgeIdx] = towerDamage;
												}
											}
										}
									}
								}
							}
							if (!rm.pathTowerDamageToControllerByEdge2x2 && room.controller) {
								console.log("Calculating pathTowerDamageToControllerByEdge2x2", roomName)
								rm.pathTowerDamageToControllerByEdge2x2 = [0, 0, 0, 0];

								if (towers.length) {
									for (var edgeIdx = 0; edgeIdx < 4; edgeIdx++) {
										if (!rm.controllerExposedToEdge[edgeIdx] && !rm.controllerNearlyExposedToEdge[edgeIdx]) continue;

										// This is going to be fairly brutal.
										for (var i = 1; i < 49; i++) {
											let x;
											let y;
											switch (edgeIdx) {
												case 0:
													x = i;
													y = 0;
													break;
												case 1:
													x = 49;
													y = i;
													break;
												case 2:
													x = i;
													y = 49;
													break;
												case 3:
													x = 0;
													y = i;
													break;
											}
											if (roomTerrain.get(x, y) & TERRAIN_MASK_WALL) continue
											let startPos = new RoomPosition(x, y, roomName)
											let pathPlan = pathCache.getPath(startPos,
																		 new RoomPosition(room.controller.pos.x, room.controller.pos.y, roomName),
																		 2,
																		 1,
																		 0,
																		 1,
																		 {maxRooms: 1, movementMask: [[0,0],[1,0],[0,1],[1,1]], avoidTowers: 1})

											if (pathPlan.incomplete) continue;
											for (var pos of pathCache.deserializePathSINGLEROOM(startPos, pathPlan.path)) {
												let towerDamage = 0;
												for (let tower of towers) {
													towerDamage += util.getTowerDamageForDist(tower.pos.getRangeTo(pos.x, pos.y));
												}
												if (towerDamage > rm.pathTowerDamageToControllerByEdge2x2[edgeIdx]) {
													rm.pathTowerDamageToControllerByEdge2x2[edgeIdx] = towerDamage;
												}
											}
										}
									}
								}
							}

							// Look at sources
							// A certain player places all his extensions at sources and uses them to fuel the spawn
							// Detect that.
							let allExtensionsAtSources = 1;
							for (let extension of room.extensions) {
								let inRange = 0
								for (let source of room.find(FIND_SOURCES)) {
									if (extension.pos.inRangeToRoomObject(source, 2)) {
										inRange = 1
										break;
									}
								}
								if (!inRange) {
									allExtensionsAtSources = 0
									break;
								}
							}

							if (allExtensionsAtSources) {
								rm.allExtensionsAtSources = 1
							}


							// Don't care about strongholds here
							if (!rm.pathTowerDamageToSourcesByEdge1x1 && !invaderOwned) {
								console.log("Calculating pathTowerDamageToSourcesByEdge1x1", roomName)
								rm.pathTowerDamageToSourcesByEdge1x1 = {}
								for (let source of room.find(FIND_SOURCES)) {
									rm.pathTowerDamageToSourcesByEdge1x1[source.id] = [0, 0, 0, 0];
									if (towers.length) {
										for (var edgeIdx = 0; edgeIdx < 4; edgeIdx++) {
											if (!rm.sourcesExposedToEdge[source.id][edgeIdx] && !rm.sourcesNearlyExposedToEdge[source.id][edgeIdx]) continue;

											// This is going to be fairly brutal.
											for (var i = 1; i < 49; i++) {
												let x;
												let y;
												switch (edgeIdx) {
													case 0:
														x = i;
														y = 1;
														break;
													case 1:
														x = 48;
														y = i;
														break;
													case 2:
														x = i;
														y = 48;
														break;
													case 3:
														x = 1;
														y = i;
														break;
												}
												if (roomTerrain.get(x, y) & TERRAIN_MASK_WALL) continue
												let startPos = new RoomPosition(x, y, roomName)
												let pathPlan = pathCache.getPath(startPos,
																			 new RoomPosition(source.pos.x, source.pos.y, roomName),
																			 2,
																			 1,
																			 0,
																			 1,
																			 {maxRooms: 1, avoidTowers: towers.length * 150})

												if (pathPlan.incomplete) continue;
												for (var pos of pathCache.deserializePathSINGLEROOM(startPos, pathPlan.path)) {
													let towerDamage = 0;
													for (let tower of towers) {
														towerDamage += util.getTowerDamageForDist(tower.pos.getRangeTo(pos.x, pos.y));
													}
													if (towerDamage > rm.pathTowerDamageToSourcesByEdge1x1[source.id][edgeIdx]) {
														rm.pathTowerDamageToSourcesByEdge1x1[source.id][edgeIdx] = towerDamage;
													}
												}
											}
										}
									}
								}
							}



							// Edge damage (to calculate min healing at the edge)
							rm.maxTowerDamageAtEdge = [0, 0, 0, 0]
							if (towers.length) {							
								for (let i = 0; i < 50; i++) {
									if (baseFloodArray.get2(i, 0) == 1) {
										let towerDamage = 0;
										for (let tower of towers) {
											towerDamage += util.getTowerDamageForDist(tower.pos.getRangeTo(i, 0));
										}
										if (towerDamage > rm.maxTowerDamageAtEdge[0]) {
											rm.maxTowerDamageAtEdge[0] = towerDamage;
										}
									}
									if (baseFloodArray.get2(49, i) == 1) {
										let towerDamage = 0;
										for (let tower of towers) {
											towerDamage += util.getTowerDamageForDist(tower.pos.getRangeTo(49, i));
										}
										if (towerDamage > rm.maxTowerDamageAtEdge[1]) {
											rm.maxTowerDamageAtEdge[1] = towerDamage;
										}
									}
									if (baseFloodArray.get2(i, 49) == 1) {
										let towerDamage = 0;
										for (let tower of towers) {
											towerDamage += util.getTowerDamageForDist(tower.pos.getRangeTo(i, 49));
										}
										if (towerDamage > rm.maxTowerDamageAtEdge[2]) {
											rm.maxTowerDamageAtEdge[2] = towerDamage;
										}
									}
									if (baseFloodArray.get2(0, i) == 1) {
										let towerDamage = 0;
										for (let tower of towers) {
											towerDamage += util.getTowerDamageForDist(tower.pos.getRangeTo(0, i));
										}
										if (towerDamage > rm.maxTowerDamageAtEdge[3]) {
											rm.maxTowerDamageAtEdge[3] = towerDamage;
										}
									}
								}
							}



							global.enemyRoomMaps = global.enemyRoomMaps || {};
							// Shouldn't need a clone
							global.enemyRoomMaps[roomName] = rm.floodFill;
							// global.enemyRoomMaps[roomName] = _.cloneDeep(rm.floodFill);

							let oobL = false;
							let oobR = false;
							let oobT = false;
							let oobB = false;

							// Edge walls detection.
							// floodFillWithBounds(_floodArray, i, j, mini, minj, maxi, maxj, value) {

							if (defensiveStructures.length > 1) {
								let fa = baseFloodArray.clone();
								let usedFa = false;

								for (let i = 0; i < 50; i++) {
									if (baseFloodArray.get2(0, i) == 1 && !oobL) {
										let res = floodFillWithBounds(fa, 0, i, -1, -1, 3, 50, 4)
										oobL = res > 5;
										usedFa = true;
									}
								}

								if (usedFa) {
									fa.copyFrom(baseFloodArray);
									usedFa = false;
								}

								for (let i = 0; i < 50; i++) {
									if (baseFloodArray.get2(49, i) == 1 && !oobR) {
										let res = floodFillWithBounds(fa, 49, i, 46, -1, 50, 50, 4)
										oobR = res > 5;
										usedFa = true;
									}
								}

								if (usedFa) {
									fa.copyFrom(baseFloodArray);
									usedFa = false;
								}

								for (let i = 0; i < 50; i++) {
									if (baseFloodArray.get2(i, 0) == 1 && !oobT) {
										let res = floodFillWithBounds(fa, i, 0, -1, -1, 50, 3, 4)
										oobT = res > 5;
										usedFa = true;
									}
								}

								if (usedFa) {
									fa.copyFrom(baseFloodArray);
									usedFa = false;
								}

								for (let i = 0; i < 50; i++) {
									if (baseFloodArray.get2(i, 49) == 1 && !oobB) {
										let res = floodFillWithBounds(fa, i, 49, -1, 46, 50, 50, 4)
										oobB = res > 5;
										usedFa = true;
									}
								}
								if (!oobL) rm.eWallsL = 1;	
								if (!oobR) rm.eWallsR = 1;	
								if (!oobT) rm.eWallsT = 1;	
								if (!oobB) rm.eWallsB = 1;	

							}
						}


						rm.lastScoutPos = {x: scoutPos.x, y: scoutPos.y};


						rm.twrInside = [];
						rm.twrExtern = [];
						rm.spwnInside = [];
						rm.spwnExtern = [];

						rm.twrX = [];
						rm.twrY = [];
						rm.twrE = [];
						rm.twrR = [];

						if (defensiveStructures.length == 0) {
							// rm.storageInsideWalls = 0
							// rm.storageOnExternalRampart = 0
						}
						else if (scoutPos && floodArray && room.storage) {
							if (floodArray.get2(room.storage.pos.x, room.storage.pos.y) < 4) {
								rm.storageInsideWalls = 1
							}
							else {
								delete rm.storageInsideWalls
							}
							if (floodArray.get2(room.storage.pos.x, room.storage.pos.y) == 3) {
								rm.storageOnExternalRampart = 1
							}
							else {
								delete rm.storageOnExternalRampart
							}
						}
						else {
							rm.storageInsideWalls = 1;
							// rm.storageOnExternalRampart = 0;
						}

						if (defensiveStructures.length == 0) {
							// rm.terminalInsideWalls = 0
							// rm.terminalOnExternalRampart = 0
						}
						else if (scoutPos && floodArray && room.terminal) {
							if (floodArray.get2(room.terminal.pos.x, room.terminal.pos.y) < 4) {
								rm.terminalInsideWalls = 1
							}
							else {
								delete rm.terminalInsideWalls
							}
							if (floodArray.get2(room.terminal.pos.x, room.terminal.pos.y) == 3) {
								rm.terminalOnExternalRampart = 1
							}
							else {
								delete rm.terminalOnExternalRampart
							}
						}
						else {
							rm.terminalInsideWalls = 1;
							// rm.terminalOnExternalRampart = 0;
						}

						// Bunker detection centred on terminal. Aim is to catch 5x5 rampart tiles that terminals centre
						// Turns out a lot of people build bunkers like this. A bit fixed function but what the heck.
						let cnt = 0;
						if (room.terminal) {
							for (var defensiveStructure of defensiveStructures) {
								if (room.terminal.pos.inRangeToRoomObject(defensiveStructure, 3)) {
									cnt++;
								}
							}
						}

						if (cnt >= 25) {
							rm.terminalDenseRamparts = 1;
						}

						if (rm.nukeTerminalAttempt) {
							// If there's a terminal within 500 ticks we've failed to kill it.
							// They coudl rebuild, but tha that's 200 energy a tick
							if (Game.time > rm.nukeTerminalAttempt && Game.time < rm.nukeTerminalAttempt + 500) {
								if (room.terminal) {
									rm.nukeTerminalFailed = 1;
								}
								else {
									delete rm.nukeTerminalAttempt;
								}
							}
							else if (Game.time > rm.nukeTerminalAttempt + 500) {
								delete rm.nukeTerminalAttempt;
							}
						}

						if (!room.terminal) {
							delete rm.nukeTerminalFailed;
							delete rm.nukeTerminalAttempt;
						}


						cnt = 0;
						if (room.storage) {
							for (var defensiveStructure of defensiveStructures) {
								if (room.storage.pos.inRangeToRoomObject(defensiveStructure, 3)) {
									cnt++;
								}
							}
						}

						if (cnt >= 25) {
							rm.storageDenseRamparts = 1;
						}

						if (rm.nukeStorageAttempt) {
							// If there's a terminal within 500 ticks we've failed to kill it.
							// They coudl rebuild, but tha that's 200 energy a tick
							if (Game.time > rm.nukeStorageAttempt && Game.time < rm.nukeStorageAttempt + 500) {
								if (room.terminal) {
									rm.nukeStorageFailed = 1;
								}
								else {
									delete rm.nukeStorageAttempt;
								}
							}
							else if (Game.time > rm.nukeStorageAttempt + 500) {
								delete rm.nukeStorageAttempt;
							}
						}

						if (!room.storage) {
							delete rm.nukeStorageFailed;
							delete rm.nukeStorageAttempt;
						}



						let minX = 49;
						let minY = 49;

						let maxX = 1;
						let maxY = 1;

						let totalTowerEnergy = 0;

						for (let tower of towers) {
							// This seems to be the best way of dealing with downgraded rooms.
							if (maxActive == 1 || tower.isActive()) {
								rm.twrX.push(tower.pos.x);
								rm.twrY.push(tower.pos.y);

								if (tower.pos.x < minX) {
									minX = tower.pos.x;
								}
								if (tower.pos.y < minY) {
									minY = tower.pos.y;
								}
								if (tower.pos.x > maxX) {
									maxX = tower.pos.x;
								}
								if (tower.pos.y > maxY) {
									maxY = tower.pos.y;
								}

								rm.twrE.push(tower.energy);

								totalTowerEnergy += tower.energy;

								if (defensiveStructures.length == 0) {
									rm.twrInside.push(0);
								}
								else if (scoutPos && floodArray) {
									rm.twrInside.push(floodArray.get2(tower.pos.x, tower.pos.y) < 4 ? 1 : 0);
								}
								else {
									rm.twrInside.push(1);
								}
								if (scoutPos && floodArray) {
									rm.twrExtern.push(floodArray.get2(tower.pos.x, tower.pos.y) == 3 ? 1 : 0);
								}
								else {
									rm.twrExtern.push(0);
								}

								let structs = tower.pos.lookFor(LOOK_STRUCTURES);
								let hasRampart = false;
								for (let struct of structs) {
									if (struct.structureType == STRUCTURE_RAMPART) {
										rm.twrR.push(struct.hits);
										hasRampart = true;
										break;
									}
								}
								if (!hasRampart) {
									rm.twrR.push(0);
								}
							}
						}


						let maxTowerDamage = 0;

						if (towers.length && minX <= maxX && minY <= maxY) {
							for (let i = minX; i <= maxX; i++) {
								for (let j = minY; j <= maxY; j++) {
									if (roomTerrain.get(i, j) & TERRAIN_MASK_WALL) continue

									let damage = 0;
									for (let tower of towers) {
										damage += util.getTowerDamageForDist(tower.pos.getRangeTo(i, j));
									}
									if (damage > maxTowerDamage) {
										maxTowerDamage = damage;
										// Break if we've hit the max possible
										if (damage == towers.length * 600) {
											i = maxX + 1;
											j = maxY + 1;
										}
									}
								}
							}
						}
						rm.maxTowerDamage = maxTowerDamage;
						// console.log(room, towers.length, rm.maxTowerDamage)
						// console.log(minX, maxX, minY, maxY)


						if (rm.nukeSpawnsAttempt) {
							// We're trying to drop them to zero spawns. Let them rebuild one in 500 ticks, but not two.
							if (Game.time > rm.nukeSpawnsAttempt && Game.time < rm.nukeSpawnsAttempt + 500) {
								if (spawns.length > 1) {
									rm.nukeSpawnsFailed = 1;
								}
								else {
									delete rm.nukeSpawnsAttempt;
								}
							}
							else if (Game.time > rm.nukeSpawnsAttempt + 500) {
								delete rm.nukeSpawnsAttempt;
							}
						}

						let labs = room.labs;

						if (rm.nukeLabsAttempt) {
							if (Game.time > rm.nukeLabsAttempt && Game.time < rm.nukeLabsAttempt + 500) {
								if (labs.length > 6) {
									rm.nukeLabsFailed = 1;
								}
								else {
									delete rm.nukeLabsAttempt;
								}
							}
							else if (Game.time > rm.nukeLabsAttempt + 500) {
								delete rm.nukeLabsAttempt;
							}
						}




						rm.spwnX = [];
						rm.spwnY = [];
						rm.spwnR = [];

						let spwnsOpen = 1;

						for (let spawn of spawns) {
							rm.spwnX.push(spawn.pos.x);
							rm.spwnY.push(spawn.pos.y);


							if (scoutPos && floodArray) {
								if (defensiveStructures.length == 0) {
									rm.spwnInside.push(0);
								}
								else {
									rm.spwnInside.push(floodArray.get2(spawn.pos.x, spawn.pos.y) < 4 ? 1 : 0);
								}

								rm.spwnExtern.push(floodArray.get2(spawn.pos.x, spawn.pos.y) === 3 ? 1 : 0);

								if (spwnsOpen) {								
									for (let i = -1; i <= 1; i++) {
										for (let j = -1; j <= 1; j++) {
											if (floodArray.get2(spawn.pos.x + i, spawn.pos.y + j) >= 3) {
												spwnsOpen = 0;
												break
											}
										}
									}
								}
							}
							else {
								rm.spwnInside.push(1);
								rm.spwnExtern.push(0);
								spwnsOpen = false
							}

							let structs = spawn.pos.lookFor(LOOK_STRUCTURES);
							let hasRampart = false;
							for (let struct of structs) {
								if (struct.structureType == STRUCTURE_RAMPART) {
									rm.spwnR.push(struct.hits);
									hasRampart = true;
									break;
								}
							}
							if (!hasRampart) {
								rm.spwnR.push(0);
							}
						}

						// if (spwnsOpen) {
						// 	rm.spwnOpen = 1;
						// }

						if (room.storage) {
							rm.storX = room.storage.pos.x;
							rm.storY = room.storage.pos.y;
							rm.sumStorageStore = _.sum(room.storage.store);

							let structs = room.storage.pos.lookFor(LOOK_STRUCTURES);
							for (let struct of structs) {
								if (struct.structureType == STRUCTURE_RAMPART) {
									rm.storR = struct.hits;
								}
							}
						}

						if (room.terminal) {
							rm.trmX = room.terminal.pos.x;
							rm.trmY = room.terminal.pos.y;
							rm.sumTerminalStore = _.sum(room.terminal.store);

							let structs = room.terminal.pos.lookFor(LOOK_STRUCTURES);
							for (let struct of structs) {
								if (struct.structureType == STRUCTURE_RAMPART) {
									rm.trmR = struct.hits;
								}
							}
						}

						if (scoutPos && room.controller) {
							let controllerAdjacency = 0;
							for (var i = -1; i <= 1; i++) {
								for (var j = -1; j <= 1; j++) {
									if (defensiveStructures.length && floodArray) {
										if (floodArray.get2(room.controller.pos.x + i, room.controller.pos.y + j) >= 4) {
											controllerAdjacency++;
										}
									}
									else {
										if (!(roomTerrain.get(room.controller.pos.x + i, room.controller.pos.y + j) & TERRAIN_MASK_WALL)) {
											controllerAdjacency++;
										}
									}
								}
							}
							if (controllerAdjacency) rm.controllerAdjacency = controllerAdjacency;
						}

						let creepCombatPartsRanged = 0;
						let creepCombatPartsAttack = 0;
						let creepCombatPartsHeal = 0;

						let bestCreepCombatPartsAttack = 0;

						let creepRanged = 0;
						let creepAttack = 0;
						let creepHeal = 0;
						let creepFortifier = 0;
						rm.hostileCreepOwners = [];

						let creepCnt = 0;

						var hostileCreeps = room.getAllHostileCreepsAndPowerCreeps();

						if (Memory.swc) {
							hostileCreeps = _.filter(hostileCreeps, (targetCreep) => (!global.whiteList.includes(targetCreep.owner.username)));
						}
						if (invaderOwned) {
							hostileCreeps = _.filter(hostileCreeps, (targetCreep) => (targetCreep.owner.username == "Invader"));	
						}

						rm.hostileBoostedCreeps = 0
						rm.hostileBoostedAnyCreeps = 0
						for (var creep of hostileCreeps) {
							var combatParts = creep.getBoostModifiedCombatParts(false, true);
							creepCombatPartsRanged += combatParts.numRanged;
							creepCombatPartsAttack += combatParts.numAttack;
							creepCombatPartsHeal += combatParts.numHeal;
							if (combatParts.numRanged || combatParts.numAttack || combatParts.numHeal) {
								creepCnt++;
							}

							if (combatParts.numAttack > bestCreepCombatPartsAttack) {
								bestCreepCombatPartsAttack = combatParts.numAttack;
							}

							if (combatParts.numRanged) creepRanged++;
							if (combatParts.numAttack) creepAttack++;
							if (combatParts.numHeal) creepHeal++;

							if (invaderOwned && creep.hasBodypart(WORK)) {
								creepFortifier++;
							}

							if (rm.hostileCreepOwners.indexOf(creep.owner.username) == -1) {
								rm.hostileCreepOwners.push(creep.owner.username);
							}
							if (creep.hasBoost()) {								
								if (combatParts.numRanged || combatParts.numAttack) {
									rm.hostileBoostedCreeps++;
								}
								rm.hostileBoostedAnyCreeps++;
							}

							if (creep.owner.username == rm.owner && util.getECostForCreep(creep) > rm.energyCapacityAvailable) {
								if (combatParts.numRanged || combatParts.numAttack) {
									rm.nonLocalCombatCreeps = 1;
								}
								else {
									rm.nonLocalCivilianCreeps = 1;
								}
								global.nonLocalCreepsTracker = global.nonLocalCreepsTracker || {}
								global.nonLocalCreepsTracker[rm.owner] = Game.time

								// TODO: Figure out where they could have spawned from
								// global.nonLocalCreepsTracker = global.nonLocalCreepsTracker || {}
								// global.nonLocalCreepsTracker[rm.owner] = {t: Game.time}


							}

						}


						let hostilePowerCreeps = room.find(FIND_HOSTILE_POWER_CREEPS);

						let opTowerLevel = 0;
						for (var powerCreep of hostilePowerCreeps) {
							if (powerCreep.powers[PWR_OPERATE_TOWER]) {
								opTowerLevel = Math.max(opTowerLevel, powerCreep.powers[PWR_OPERATE_TOWER].level)
							}
						}

						if (opTowerLevel) {
							rm.opTowerLevel = opTowerLevel
						}

						// Lazy writes save memory. Not sure about perf cost.
						if (creepCnt) rm.creepCnt = creepCnt;
						if (creepCombatPartsRanged) rm.creepCombatPartsRanged = creepCombatPartsRanged;
						if (creepCombatPartsAttack) rm.creepCombatPartsAttack = creepCombatPartsAttack;
						if (creepCombatPartsHeal) rm.creepCombatPartsHeal = creepCombatPartsHeal;
						if (creepCombatPartsRanged || creepCombatPartsAttack || creepCombatPartsHeal) rm.lh = 1
						if (bestCreepCombatPartsAttack) rm.bestCreepCombatPartsAttack = bestCreepCombatPartsAttack;
						if (creepRanged) rm.creepRanged = creepRanged;
						if (creepAttack) rm.creepAttack = creepAttack;
						if (creepHeal) rm.creepHeal = creepHeal;
						if (creepFortifier) rm.creepFortifier = creepFortifier;

						// Room is being kept alive by the terminals?
						// Really don't want to accidently pop a terminal when trying to loot.
						if (room.storage && (room.storage.store[RESOURCE_ENERGY] || 0) < 10000 &&
							room.terminal && (room.terminal.store[RESOURCE_ENERGY] || 0) > 5000 &&
							totalTowerEnergy > towers.length * 50 &&
							rm.DT > 0.02 &&
							room.dangerous &&
							spawns.length > 0 && towers.length > 0) {

							rm.killTerminal = 1;
						}
						else if (rm.killTerminal) {
							delete rm.killTerminal
							// rm.killTerminal = 0;
						}

						if (spawns.length == 0 && towers.length == 0 && room.controller && room.controller.level > 3) {
							rm.wipedOnce = 1;
						}
						// They've rebuilt. Burn it all... unless DT is literally zero.
						if (rm.wipedOnce && (spawns.length || towers.length) && rm.DT) {
							rm.killStorage = 1;
							rm.killTerminal = 1;
						}

						// Not holding any stuff.
						if (room.storage && Object.keys(room.storage.store).length == 0) {
							rm.killStorage = 1;
						}
						if (room.terminal && Object.keys(room.terminal.store).length == 0) {
							rm.killTerminal = 1;
						}

						// if (rm.numAttacksCompleted > 10)

						// This has to be at the end as canClusterNuke relies on the above
						if (room.controller && room.controller.level == 8) {
							if (global.wasm_module && global.wasm_module.lzw_encode && (!rm.allStructures || Math.random() < 0.1) && this.canClusterNuke(roomName)) {
								let roomInRange = 0;
								for (let myRoom of Game.myRooms) {
									if (myRoom.effectiveLevel == 8 && Game.map.getRoomLinearDistance(myRoom.name, roomName) <= NUKE_RANGE) {
										roomInRange = 1;
										break;
									}
								}
								if (roomInRange) {								
									let structures = (room.extensions || []).concat(room.spawns || []).concat(room.towers || []).concat(room.labs || []);
									if (room.storage) structures.push(room.storage);
									if (room.terminal) structures.push(room.terminal);
									if (room.nuker) structures.push(room.nuker);
									if (room.observer) structures.push(room.observer);
									if (room.powerSpawn) structures.push(room.powerSpawn);

									let allStructures = [];

									for (let i = 0; i < 50; i++) {
										allStructures.push([]);
									}

									for (let structure of structures) {
										allStructures[structure.pos.x].push(structure.pos.y)
									}

									rm.allStructures = global.wasm_module.lzw_encode(JSON.stringify(allStructures));
								}
							}

							rm.lbX = [];
							rm.lbY = [];
							rm.lbR = [];

							for (let lab of room.labs) {
								rm.lbX.push(lab.pos.x);
								rm.lbY.push(lab.pos.y);

								let lbR = 0;

								let structs = lab.pos.lookFor(LOOK_STRUCTURES);
								for (let struct of structs) {
									if (struct.structureType == STRUCTURE_RAMPART) {
										lbR = struct.hits;
										break;
									}
								}

								rm.lbR.push(lbR);
							}
						}


						if (rm.twrX.length == 0) {
							this.setRoomLoot(room)
						}

						if (scoutPos) {
							rm.lo = Game.time;
						}
					}
					// else if (((!invaderOwned && room.controller.my) || (!invaderOwned && !room.controller.owner)) && rm.lastScoutPos !== undefined && (Memory.enemyRooms.includes(room.name) || Memory.strongholdRooms.includes(room.name))) {
					// 0.01 CPU/
					// Unowned or mine
					else if (!room.controller || room.controller.my || !room.controller.owner || this.isRoomWhiteListed(room.name)) {
						rm.lo = Game.time;
					}
					// else {
						// rm.lo = Game.time;
						// console.log(roomName, "missing all scouting conditions")
					// }
				}

				if (room.controller) {					
					if (room.controller.reservation) {
						rm.reservedBy = room.controller.reservation.username;
						rm.reserveTicksToEnd = room.controller.reservation.ticksToEnd;
					}
					else {
						rm.reservedBy = undefined
						rm.reserveTicksToEnd = undefined
					}

					if (room.controller.sign && room.controller.sign.username == "Screeps" && room.controller.sign.text == SIGN_PLANNED_AREA) {
						rm.plannedZone = 1
						// rm.plannedZoneStartTime = room.controller.sign.datetime
					}

					if (room.controller.safeModeCooldown) {
						rm.safeModeCooldown = room.controller.safeModeCooldown;
					}
					else {
						rm.safeModeCooldown = undefined	
					}

					rm.cttd = room.controller.ticksToDowngrade;


					if (Memory.swc && global.whiteList.includes(rm.owner)) {
						rm.safeModeCooldown = room.controller.safeModeCooldown;
					}
				}
			}
			// else {
			// 	if (Math.random() < 0.01) {
			// 		this.setRoomLoot(room)
			// 	}
			// 	rm.lo = Game.time;
			// }

			if (room.centreRoom) {
				let portals = room.portals;
				if (portals.length) {
					Memory.knownPortalRoomNames = Memory.knownPortalRoomNames || [];

					// There's many portals but they all go to the same place.
					let portal = portals[0];
					if ((portal.ticksToDecay || 30000 > 20000)) {
						rm.portalDest = portal.destination;
						rm.portalPos = portal.pos;
						if (!Memory.knownPortalRoomNames.includes(roomName)) {
							Memory.knownPortalRoomNames.push(roomName)
						}
					}
					else {
						_.pull(Memory.knownPortalRoomNames, roomName);
					}
				}
				else {
					_.pull(Memory.knownPortalRoomNames, roomName);
					delete rm.portalDest;
					delete rm.portalPos;
				}
			}
		}
	},
};

module.exports = scouting;