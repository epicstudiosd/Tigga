"use strict";

const util = require('util');
const safeRoute = require('safeRoute');
const constants = require('constants');
const creepCreator = require('creepCreator');
var intelAI = require('intelAI');
const roomAI = require('roomAI');

const season2Map = require("season2Map")


const season5ReactorClaim = require('season5ReactorClaim');
const season5Scoring = require('season5Scoring');
var roomDesignAI = require('roomDesignAI');


var overseerSeason = {
	season1TickEnd : function() {
		let interval = 151;

		if (Memory.enableVisuals || Memory.forceSaveMemory) {			
			for (let roomName of Memory.scoreContainerRooms) {
				if (!Memory.rooms[roomName]) continue
				if (!Memory.rooms[roomName].scoreContainers || !Memory.rooms[roomName].scoreContainers.length) continue

				for (let scoreContainer of Memory.rooms[roomName].scoreContainers) {
					if (scoreContainer.decayTick >= Game.time) {
						Game.map.visual.text("🏆" + Math.round((scoreContainer.decayTick - Game.time) / 100), new RoomPosition(scoreContainer.pos.x, scoreContainer.pos.y, scoreContainer.pos.roomName), {fontSize: 2.5 * Math.sqrt(scoreContainer.amount / 1000)})
					}
				}
			}

			for (let roomName of Memory.scoreCollectorRooms) {
				if (!Memory.rooms[roomName]) continue
				if (!Memory.rooms[roomName].seasonDropOffAvailable) continue
				Game.map.visual.rect(new RoomPosition(10, 42, roomName), 30, 6, {opacity:0.25})

				let percentage = Memory.rooms[roomName].dropOffBucket / 20000
				let colour
				if (percentage < .33) {
					colour = "#ff0000"
				}
				else if (percentage < .67) {
					colour = "#ffff00"
				}
				else {
					colour = "#00ff00"
				}

				Game.map.visual.rect(new RoomPosition(11, 43, roomName), 28 * percentage, 4, {fill:colour})
			}
		}
		if (Game.time % (interval * (global.anySmallHaulers && Memory.anySeasonDropOffAvailable ? 1 : 2)) && !Memory.debugSeasonTickEnd) return


		let coveredDrops = {}

		if (Game.time % (interval * 8) == 0) {
			for (let room of Game.myRooms) {
				let dropRoomName = room.mem.closestDropOff;
				if (coveredDrops[dropRoomName]) continue
				if (!Memory.rooms[dropRoomName] || !Memory.rooms[dropRoomName].seasonDropOffAvailable) continue

				let spawn = room.spawns[0]
				if (!spawn) continue

				coveredDrops[dropRoomName] = 1



				let body
				body = creepCreator.getDesignForEnergyCap("raiderHauler", Math.max(300, room.energyCapacityAvailable * Math.min(1, Memory.rooms[dropRoomName].DT)), false, false, false)
				spawn.addPrioritySpawn("raiderHauler", {targetRoom: dropRoomName}, undefined, body)

				if (Memory.rooms[dropRoomName].DT > 0.01) {
					body = creepCreator.getDesignForEnergyCap("raiderRoaming", Math.max(300, room.energyCapacityAvailable * Math.min(1, Memory.rooms[dropRoomName].DT)), false, false, false)
					spawn.addPrioritySpawn("raiderRoaming", {targetRoom: dropRoomName}, undefined, body)
				}
				if (Memory.rooms[dropRoomName].DT > 0.02) {
					body = creepCreator.getDesignForEnergyCap("raiderClose", Math.max(300, room.energyCapacityAvailable * Math.min(1, Memory.rooms[dropRoomName].DT)), false, false, false)
					spawn.addPrioritySpawn("raiderClose", {targetRoom: dropRoomName}, undefined, body)
				}
			}
		}


		// Temp
		// if (Game.gcl.level < 4) return

		delete Memory.debugSeasonTickEnd

		for (let roomName of Memory.scoreCollectorRooms) {
			Memory.combatManager.requestedMissions[global.MISSION_SEASONAL_DROP_WALL_REMOVE][roomName] = Game.time;
		}

		// Dig first. Collecting and saturating is going to be fairly easy. At sub RCL 7 we'll use 
		// tugs to fetch as well
		if (!Memory.anySeasonDropOffAvailable && Game.cpu.bucket < 9000) {
			return
		}

		// if (true) {
		// 	console.log("overseer seasonTickEnd disabled")
		// 	return
		// }

		let allContainers = []
		for (let roomName of Memory.scoreContainerRooms) {
			if (!Memory.rooms[roomName]) continue
			if (!Memory.rooms[roomName].scoreContainers || !Memory.rooms[roomName].scoreContainers.length) continue

			if (Memory.rooms[roomName].skLairsX && !Memory.usedRemotes.includes(roomName)) {
				continue
			}


			let added = false
			for (let myRoom of Game.myRooms) {
				let maxRange = Math.min(constants.MAX_SEASON_SCORE_RANGE_SPAWN, myRoom.effectiveLevel)
				if (safeRoute.getSafeRouteCost(myRoom.name, roomName, false, false, Math.ceil(maxRange)) <= maxRange) {
					for (let scoreContainer of Memory.rooms[roomName].scoreContainers) {
						allContainers.push(scoreContainer)
					}
					added = true
					break					
				}
			}

			if (added) {
				continue
			}
			for (let myRoom of Game.myRooms) {
				let dropRoom = myRoom.mem.closestDropOff

				if (!dropRoom || !Memory.rooms[dropRoom] || !Memory.rooms[dropRoom].seasonDropOffAvailable) continue

				let maxRange = Math.min(constants.MAX_SEASON_SCORE_RANGE_SPAWN, myRoom.effectiveLevel)
				if (safeRoute.getSafeRouteCost(dropRoom, roomName, false, false, Math.ceil(maxRange)) <= maxRange) {
					for (let scoreContainer of Memory.rooms[roomName].scoreContainers) {
						allContainers.push(scoreContainer)
					}
					added = true
					break					
				}
			}
			for (let myRoom of Game.myRooms) {
				let dropRoom = myRoom.mem.secondClosestDropOff

				if (dropRoom || !Memory.rooms[dropRoom] || !Memory.rooms[dropRoom].seasonDropOffAvailable) continue

				let maxRange = Math.min(constants.MAX_SEASON_SCORE_RANGE_SPAWN * 0.75, myRoom.effectiveLevel * .75)
				if (safeRoute.getSafeRouteCost(dropRoom, roomName, false, false, Math.ceil(maxRange)) <= maxRange) {
					for (let scoreContainer of Memory.rooms[roomName].scoreContainers) {
						allContainers.push(scoreContainer)
					}
					added = true
					break					
				}
			}
			for (let myRoom of Game.myRooms) {
				let dropRoom = myRoom.mem.thirdClosestDropOff

				if (dropRoom || !Memory.rooms[dropRoom] || !Memory.rooms[dropRoom].seasonDropOffAvailable) continue

				let maxRange = Math.min(constants.MAX_SEASON_SCORE_RANGE_SPAWN * 0.5, myRoom.effectiveLevel * .5)
				if (safeRoute.getSafeRouteCost(dropRoom, roomName, false, false, Math.ceil(maxRange)) <= maxRange) {
					for (let scoreContainer of Memory.rooms[roomName].scoreContainers) {
						allContainers.push(scoreContainer)
					}
					added = true
					break					
				}
			}
		}

		console.log(allContainers.length, "season containers in range")
		//console.log(JSON.stringify(allContainers))

		global.inTickObject.allSeasonFetchers = global.inTickObject.allSeasonFetchers || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'seasonFetcher'))


		let targetContainers

		let fetchers = _.clone(global.inTickObject.allSeasonFetchers)

		let overflowGuard = 0
		let anySpawned = 0
		let spawnedByRoom = {}
		let anyDropOffPoint = Memory.anySeasonDropOffAvailable

		do {
			overflowGuard++
			targetContainers = []

			for (let container of allContainers) {
				if (container.decayTick - Game.time < 1500 && container.decayTick - Game.time < container.amount / 2) {
				// if (container.decayTick - Game.time < 1500 && container.decayTick - Game.time < container.amount / 2) {
					targetContainers.push(container)
				}
				else {					
					let matched = false
					for (let fetcher of fetchers) {
						let maxRange = Math.min(Math.ceil(fetcher.ticksToLive / 150), constants.MAX_SEASON_SCORE_RANGE_SPAWN * 0.75)
						let dist = safeRoute.getSafeRouteCost(fetcher.room.name, container.pos.roomName, false, false, Math.ceil(maxRange))
						if (dist <= maxRange) {
							matched = true;
							break
						}
					}
					if (!matched) {
						targetContainers.push(container)
					}
				}
			}

			// console.log(targetContainers.length, "target containers")

			if (targetContainers.length) {
				let container = targetContainers[0]
				let bestScore = Infinity
				let bestRoom
				let bestRoomBucket = 0
				for (let myRoom of Game.myRooms) {
					if (!myRoom.storage) continue

					let dropMem = Memory.rooms[myRoom.mem.closestDropOff]
					let hasDropoff = myRoom.mem.closestDropOff && dropMem && dropMem.seasonDropOffAvailable

					let bucket = (dropMem.expectedBucket === undefined ? dropMem.dropOffBucket : dropMem.expectedBucket) || SCORE_COLLECTOR_MAX_CAPACITY

					if (myRoom.mem.secondClosestDropOff) {
						let secondDropMem = Memory.rooms[myRoom.mem.secondClosestDropOff]

						if (secondDropMem && secondDropMem.seasonDropOffAvailable) {							
							let distClosest = myRoom.mem.closestDropOffRange
							let distSecond = myRoom.mem.secondClosestDropOffRange

							// If this is small the second is not significant. If it's large it is.
							let distRatio = distClosest / distSecond

							// eg. if we're right next to one and far from another this will be low (like 0.1). If we're roughly equidistant we rate them both well
							bucket += distRatio * ((secondDropMem.expectedBucket === undefined ? secondDropMem.dropOffBucket : secondDropMem.expectedBucket) || SCORE_COLLECTOR_MAX_CAPACITY)
						}

						if (myRoom.mem.thirdClosestDropOff) {			
							let thirdDropMem = Memory.rooms[myRoom.mem.thirdClosestDropOff]				
							if (thirdDropMem && thirdDropMem.seasonDropOffAvailable) {							
								let distClosest = myRoom.mem.closestDropOffRange
								let distSecond = myRoom.mem.secondClosestDropOffRange
								let distThird = myRoom.mem.thirdClosestDropOffRange

								// If this is small the third is not significant. If it's large it is.
								let distRatio = (distClosest + distSecond) / distThird

								// eg. if we're right next to one and far from another this will be low (like 0.1). If we're roughly equidistant we rate them both well
								bucket += distRatio * ((thirdDropMem.expectedBucket === undefined ? thirdDropMem.dropOffBucket : thirdDropMem.expectedBucket) || SCORE_COLLECTOR_MAX_CAPACITY)
							}
						}
					}


					if (bucket < 5000) {
						hasDropoff = false;
					}
					else if ((spawnedByRoom[myRoom.name] || 0) > 2 * bucket / 5000) {
						hasDropoff = false
					}

					if (hasDropoff) {
						if (bucket < dropMem.lastExpectedBucket) {
							bucket -= 1000
						}
						else if (bucket > dropMem.lastExpectedBucket) {
							bucket += 1000
						}

						// if (bucket < 0) {
						// 	bucket = 0
						// }
					}


					if (myRoom.storage.store.getFreeCapacity() < (hasDropoff ? 100000 : 500000)) continue

					if (myRoom.restrictOffensiveMissions(undefined, hasDropoff ? ((Memory.IveWonAlready && Math.random() < 0.5) ? false : true) : false, false, hasDropoff ? false : true)) continue
					if (!myRoom.spawns.length) continue


					let dist = safeRoute.getSafeRouteCost(myRoom.name, container.pos.roomName, false, false, myRoom.effectiveLevel)
					if (Game.time + dist * 50 + 150 > container.decayTick) continue

					if (!hasDropoff && dist > 1.5) {
						continue
					}

					// Proximity to me or any of my drop-offs
					if (dist > myRoom.effectiveLevel) {
						if (!myRoom.mem.closestDropOff || !Memory.rooms[myRoom.mem.closestDropOff].seasonDropOffAvailable) {
							continue
						}
						let dist1st = safeRoute.getSafeRouteCost(myRoom.mem.closestDropOff, container.pos.roomName, false, false, myRoom.effectiveLevel)

						if (dist1st > myRoom.effectiveLevel) {
							if (!myRoom.mem.secondClosestDropOff || !Memory.rooms[myRoom.mem.secondClosestDropOff].seasonDropOffAvailable) {
								continue
							}
							let dist2nd = safeRoute.getSafeRouteCost(myRoom.mem.secondClosestDropOff, container.pos.roomName, false, false, Math.ceil(myRoom.effectiveLevel * .75))

							if (dist2nd > myRoom.effectiveLevel * .75) {
								if (!myRoom.mem.thirdClosestDropOff || !Memory.rooms[myRoom.mem.thirdClosestDropOff].seasonDropOffAvailable) {
									continue
								}
								let dist3rd = safeRoute.getSafeRouteCost(myRoom.mem.thirdClosestDropOff, container.pos.roomName, false, false, Math.ceil(myRoom.effectiveLevel * .5))
								if (dist3rd > myRoom.effectiveLevel * .5) {
									continue
								}
							}
						}
					}



					let score = dist - myRoom.effectiveLevel
					if (score < bestScore) {
						bestScore = score
						bestRoom = myRoom
						bestRoomBucket = hasDropoff ? bucket : 0
					}
				}

				if (bestRoom && bestRoomBucket >= 0) {
					let spawn = bestRoom.spawns[0]
					console.log(bestRoom.name, "spawning hauler for season container", JSON.stringify(container))
					anySpawned++
					// Spoof so that unmatched containers sorts itself out
					spawn.addPrioritySpawn("seasonFetcher")
					spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					fetchers.push({room: {name: bestRoom.name}, ticksToLive: CREEP_LIFE_TIME})
					if ((container.amount > 5000 || (container.amount > 2500 && container.decayTick - Game.time < 1500)) && bestRoomBucket > 5000) {
						console.log(bestRoom.name, "spawning another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
					if ((container.amount > 10000 || (container.amount > 5000 && container.decayTick - Game.time < 2500)) && bestRoomBucket > 10000) {
						console.log(bestRoom.name, "spawning yet another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
					if ((container.amount > 15000 || (container.amount > 10000 && container.decayTick - Game.time < 2500)) && bestRoomBucket > 15000) {
						console.log(bestRoom.name, "spawning yet another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
					if ((container.amount > 20000 || (container.amount > 15000 && container.decayTick - Game.time < 2500)) && bestRoomBucket > 17500) {
						console.log(bestRoom.name, "spawning yet another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
					if (!Memory.anySeasonDropOffAvailable) return
				}
				else {
					console.log("No best room for", JSON.stringify(container))
				}
				_.pull(allContainers, container)
			}
		}
		while (targetContainers.length || overflowGuard > 10000)
		if (overflowGuard > 10000) {
			console.log("----------------seasonTickEnd overflow!!!!!!!!!!!!")
		}

		// Could be during a crisis. Got to keep the haulers rolling.
		if (!anySpawned && Memory.anySeasonDropOffAvailable) {
			for (let myRoom of Game.myRooms) {
				if (!myRoom.storage) continue
				if (myRoom.storage.store[RESOURCE_SCORE] < 20000) continue

				if (myRoom.restrictOffensiveMissions(undefined, myRoom.storage.store[RESOURCE_SCORE] > 100000, false, myRoom.storage.store[RESOURCE_SCORE] <= 100000)) continue
				if (!myRoom.spawns.length) continue
				if (!myRoom.mem.closestDropOff || !Memory.rooms[myRoom.mem.closestDropOff]) continue

				let mem = Memory.rooms[myRoom.mem.closestDropOff]
				let bucket = mem.expectedBucket === undefined ? mem.dropOffBucket : mem.expectedBucket

				if (bucket < mem.lastExpectedBucket) {
					bucket -= 1000
				}
				else if (bucket > mem.lastExpectedBucket) {
					bucket += 1000
				}

				if (mem.seasonDropOffAvailable && bucket > 5000) {
					let spawn = myRoom.spawns[0]
					console.log(myRoom.name, "spawning hauler to clear storage")
					spawn.addPrioritySpawn("seasonFetcher")
					if (myRoom.storage.store[RESOURCE_SCORE] > 50000 && bucket > 10000) {
						console.log(myRoom.name, "spawning another hauler to clear storage")
						spawn.addPrioritySpawn("seasonFetcher")
					}
					if (myRoom.storage.store[RESOURCE_SCORE] > 100000 && bucket > 15000) {
						console.log(myRoom.name, "spawning yet another hauler to clear storage")
						spawn.addPrioritySpawn("seasonFetcher")
					}
				}
			}
		}

		for (let roomName of Memory.scoreCollectorRooms) {
			if (!Memory.rooms[roomName]) continue

			Memory.rooms[roomName].lastExpectedBucket = Memory.rooms[roomName].expectedBucket
		}


	},

	season2TickStart : function() {
		season2Map.tick()
		// global.currentlyUnclaimingRoom = Memory.seasonUnclaim
	},


	season2TickEnd : function() {
		if (Memory.visSymbols) {
			for (let roomName in Memory.rooms) {
				if (!Memory.rooms[roomName].decoderType) continue

				// if (Memory.myDecoders.includes(Memory.rooms[roomName].decoderType)) continue
				// if (Memory.allyDecoders.includes(Memory.rooms[roomName].decoderType)) continue
				// if (Memory.friendDecoders.includes(Memory.rooms[roomName].decoderType)) continue
				// if (Memory.stealingDecoders.includes(Memory.rooms[roomName].decoderType)) continue

				Game.map.visual.text(Memory.rooms[roomName].decoderType.split("_")[1], new RoomPosition(25, 25, roomName), {fontSize: 10})	
			}
		}

		// if (Game.rooms["W9S9"] && Game.rooms["W9S9"].controller.my) {
		// 	for (let rampart of Game.rooms.W9S9.controller.pos.findInRange(FIND_MY_STRUCTURES, 2)) {
		// 		delete Memory.rooms["W9S9"].oldRampartPrioritiesR[rampart.id]; 
		// 		delete Memory.rooms["W9S9"].oldRampartPrioritiesT[rampart.id]
		// 	}
		// }

		// Interceping quads
		

		if (Game.time < 1711258 + 50000) {
			if (Math.random() < 0.05) {
				if (!Game.rooms["W18N7"].hasAtLeastXOfResource(RESOURCE_CATALYZED_ZYNTHIUM_ACID, 3000)) {
					for (let room of _.shuffle(Game.myRoom)) {
						if (Math.random() < 0.05) {
							if (!room.terminal) continue
							if (room.name == "W18N7") continue
							if (room.terminal.cooldown) continue

							if (!room.terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID]) continue


							room.terminal.send(RESOURCE_CATALYZED_ZYNTHIUM_ACID, Math.min(room.terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ACID], room.terminal.store[RESOURCE_ENERGY]), "W18N7")
						}
					}
				}
			}
		}

		if (Game.time % 1200 == 1010) {
			let pairs = [/*["W19S8", "W19S10"],*/ ["W6N18", "W8N20"]]
			for (let pair of pairs) {
				Game.rooms[pair[0]].spawns[0].addPrioritySpawn("season2ContainerManager", {targetRoom: pair[1]})
				Game.rooms[pair[0]].spawns[0].addPrioritySpawn("season2ContainerShuffler", {targetRoom: pair[1]})
				if (pair[1] == "W8N20") {
					// Game.rooms[pair[0]].spawns[0].addPrioritySpawn("season2ContainerShuffler", {targetRoom: pair[1]})
					// Game.rooms[pair[0]].spawns[0].addPrioritySpawn("season2ContainerShuffler", {targetRoom: pair[1]})
					// Game.rooms[pair[0]].spawns[0].addPrioritySpawn("season2ContainerManager", {targetRoom: pair[1]})
				}

				if (Game.rooms[pair[1]]) {
					for (let container of Game.rooms[pair[1]].containers) {
						if (container.hits < container.hitsMax * 0.75) {
							Game.rooms[pair[0]].spawns[0].addPrioritySpawn("season2ContainerManager", {targetRoom: pair[1]})
							break
						}
					}
					let numFree = 0
					for (let container of Game.rooms[pair[1]].containers) {
						if (container.store.getFreeCapacity() > 1250) {
							numFree++
						}
					}
					for (let i = 0; i < Game.rooms[pair[1]].containers.length - numFree; i++) {
						Game.rooms[pair[0]].spawns[0].addPrioritySpawn("season2ContainerShuffler", {targetRoom: pair[1]})
					}
				}
			}
		}

		if ((Game.time % 565 == 564 && Game.cpu.bucket > 3000) || Memory.debugPsyTermainlTrade) {
			delete Memory.debugPsyTermainlTrade
			let sellSymbols = []

			for (let symbol of Memory.tradeSell) {
				if (Memory.seasonTradeInfo["psy372"].buy.includes(symbol)) {
					sellSymbols.push(symbol)
				}
			}

			let buySymbols = []
			for (let symbol of Memory.tradeBuy) {
				if (Memory.seasonTradeInfo["psy372"].sell.includes(symbol)) {
					buySymbols.push(symbol)
				}
			}

			if (buySymbols.length && sellSymbols.length) {
				Game.rooms["W6N18"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W11N21", bidirectional: 1, minerals: 0, energy: 0})
			}
		}


		// Slightly higher than Cub's value to avoid any chance we tie and neither of us do anything!
		Memory.TARGET_SCORE_RATIO = Memory.TARGET_SCORE_RATIO || 1.501

		if (Game.time % 501 == 345) {
			// if (Memory.rooms["W15N23"] && 
			// 	(Memory.rooms["W15N23"].rcl || 0) < 3) {
			// 	if (Game.rooms["W6N18"] && 
			// 		Game.rooms["W6N18"].isMyRoom() &&
			// 		Game.rooms["W6N18"].defcon >= 4 &&
			// 		Game.rooms["W6N18"].spawns.length &&
			// 		!Game.rooms["W6N18"].restrictOffensiveMissions(undefined, true, false, false)) {

			// 		Game.rooms["W6N18"].spawns[0].addPrioritySpawn("allyPioneer", {targetRoom: "W15N23", ally: "Cub"})

			// 	}
			// }
			// }
			if (Memory.rooms["W19S3"] && 
				Memory.rooms["W19S3"].rcl >= 4 && 
				Memory.rooms["W19S3"].rcl < 6 && 
				Memory.rooms["W19S3"].hasStorage && 
				(Memory.rooms["W19S3"].storageAmount || 0) < 200000 && 
				Memory.rooms["W19S3"].owner == "Codablo") {
				if (Game.rooms["W19N1"] && 
					Game.rooms["W19N1"].isMyRoom() &&
					Game.rooms["W19N1"].defcon == 5 &&
					Game.rooms["W19N1"].spawns.length &&
					!Game.rooms["W19N1"].restrictOffensiveMissions(undefined, true, false, false)) {

					Game.rooms["W19N1"].spawns[0].addPrioritySpawn("transporter", {targetRoom: "W19S3"})
				}
			}
			/*if (Memory.rooms["W19N6"] && 
				Memory.rooms["W19N6"].rcl >= 4 && 
				Memory.rooms["W19N6"].rcl < 7 && 
				Memory.rooms["W19N6"].hasStorage && 
				(Memory.rooms["W19N6"].storageAmount || 0) < 100000 && 
				Memory.rooms["W19N6"].owner == "kalDima") {
				if (Game.rooms["W18N7"] && 
					Game.rooms["W18N7"].isMyRoom() &&
					Game.rooms["W18N7"].defcon == 5 &&
					Game.rooms["W18N7"].spawns.length &&
					!Game.rooms["W18N7"].restrictOffensiveMissions(undefined, true, false, false)) {

					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("transporter", {targetRoom: "W19N6"})
				}
			}
			if (Memory.rooms["W18N8"] && 
				Memory.rooms["W18N8"].rcl == 7 && 
				Memory.rooms["W18N8"].hasStorage && 
				(Memory.rooms["W18N8"].storageAmount || 0) < 100000 && 				
				Memory.rooms["W18N8"].owner == "kalDima") {
				if (Game.rooms["W18N7"] && 
					Game.rooms["W18N7"].isMyRoom() &&
					(Game.rooms["W18N7"].effectiveLevel == 8 || Memory.terminalNetworkFreeEnergy > 1.5e6) && 
					Game.rooms["W18N7"].defcon == 5 &&
					Game.rooms["W18N7"].spawns.length &&
					!Game.rooms["W18N7"].restrictOffensiveMissions(undefined, true, false, false)) {

					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("transporter", {targetRoom: "W18N8"})
				}
			}
			if (Memory.rooms["W19N6"] && 
				Memory.rooms["W19N6"].rcl == 7 && 
				Memory.rooms["W19N6"].hasStorage && 
				(Memory.rooms["W19N6"].storageAmount || 0) < 100000 && 
				Memory.rooms["W19N6"].owner == "kalDima") {
				if (Game.rooms["W18N7"] && 
					Game.rooms["W18N7"].isMyRoom() &&
					(Game.rooms["W18N7"].effectiveLevel == 8 || Memory.terminalNetworkFreeEnergy > 1.5e6) && 
					Game.rooms["W18N7"].defcon == 5 &&
					Game.rooms["W18N7"].spawns.length &&
					!Game.rooms["W18N7"].restrictOffensiveMissions(undefined, true, false, false)) {

					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("transporter", {targetRoom: "W19N6"})
				}
			}*/
		}

		if ((Game.time % 569 == 234 && Game.cpu.bucket > 2000) || Memory.debugSymbolShuffler) {
			// let SCORE_TRANSFER_THRESHOLD = 20000
			// let SCORE_OVERFLOW_THRESHOLD = 100000
			// let SCORE_MEGA_OVERFLOW_THRESHOLD = 200000

			// Don't turn in the worst few symbols 
			let orderedSymbols = util.getSeasonOrderedSymbols()



			let spawned = false
			delete Memory.debugSymbolShuffler
			for (let allyName in Memory.allyScore) {
				for (let symbol of SYMBOLS) {
					let SCORE_TRANSFER_THRESHOLD = 1
					let SCORE_OVERFLOW_THRESHOLD = 2
					let SCORE_MEGA_OVERFLOW_THRESHOLD = 5000

					if (Memory.allyScore[allyName][symbol] * Memory.TARGET_SCORE_RATIO >= Game.symbols[symbol] || (Memory.stats.globalResources[symbol] || 0) > SCORE_MEGA_OVERFLOW_THRESHOLD * 3 || (Memory.modifiedOutgoingTradeLedger["Montblanc"][symbol] || 0) > 200000) {
						// We want to score. Find a room (heh heh heh)
						console.log("Want to score with", symbol)
						// if (orderedSymbols.indexOf(symbol) < constants.SEASON2_MAX_X_HOARD) {
						// 	SCORE_TRANSFER_THRESHOLD = 150000
						// 	SCORE_OVERFLOW_THRESHOLD = 175000
						// 	SCORE_MEGA_OVERFLOW_THRESHOLD = 200000
						// }

						// Simple
						let found = false
						for (let room of Game.myRooms) {
							
							if (room.mem.decoderType != symbol || room.controller.level != 8 || room.defcon < 4 || !room.spawns.length) continue

							let currentAmount = ((Memory.stats.globalResources[symbol] || 0) + room.getCurrentOfResource(symbol)) / 2

							for (let playerName in Memory.incomingTradeLedger) {
								currentAmount -= Math.max(0, (Memory.incomingTradeLedger[playerName][symbol] || 0))
							}
							if (currentAmount < SCORE_MEGA_OVERFLOW_THRESHOLD) {
								if ((Memory.allyDropsPlanned[allyName][symbol] || 0) > Game.time || (Memory.dropsPlanned[symbol] || 0) > Game.time) {
									continue
								}
							}

							if (currentAmount > SCORE_TRANSFER_THRESHOLD && !room.restrictOffensiveMissions(undefined, currentAmount > SCORE_MEGA_OVERFLOW_THRESHOLD, false, currentAmount > SCORE_OVERFLOW_THRESHOLD)) {
								let body
								if (currentAmount > SCORE_MEGA_OVERFLOW_THRESHOLD) {
									body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", room.energyCapacityAvailable, true, 0, 1, {veryLarge: 1})
								}
								else if (currentAmount > SCORE_OVERFLOW_THRESHOLD) {
									body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", room.energyCapacityAvailable, true, 0, 1, {large: 1})
								}								
								else {
									body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", room.energyCapacityAvailable, true, 0, 1)	
								}

								console.log("Spawning season2ScoreShuffler in", room)					
								room.spawns[0].addPrioritySpawn("season2ScoreShuffler", {targetRoom: room.name}, "", body)
								found = true
								spawned = true
								if (currentAmount < SCORE_MEGA_OVERFLOW_THRESHOLD) {
									Memory.dropsPlanned[symbol] = Game.time + 1500
								}
								break
							}
						}
						if (found) {
							continue
						}
						for (let allyRoomName in Memory.allySymbols[allyName]) {
							if (Memory.allySymbols[allyName][allyRoomName] != symbol) continue
							console.log(allyRoomName, Memory.allySymbolAmount[allyName][allyRoomName])

							// TODO: Got to get ally incoming ledger into this
							if (Memory.allySymbolAmount[allyName][allyRoomName] < SCORE_TRANSFER_THRESHOLD) continue

							if (Memory.allySymbolAmount[allyName][allyRoomName] < SCORE_MEGA_OVERFLOW_THRESHOLD) {
								if ((Memory.allyDropsPlanned[allyName][symbol] || 0) > Game.time || (Memory.dropsPlanned[symbol] || 0) > Game.time) {
									continue
								}
							}

							let bestDist = Infinity
							let bestRoom

							for (let room of Game.myRooms) {
								if (room.defcon >= 4 && 
									room.effectiveLevel >= 4 && 
									!room.restrictOffensiveMissions(undefined, Memory.allySymbolAmount[allyName][allyRoomName] > SCORE_MEGA_OVERFLOW_THRESHOLD, false, Memory.allySymbolAmount[allyName][allyRoomName] > SCORE_OVERFLOW_THRESHOLD) && 
									room.spawns.length) {
									let dist = safeRoute.getSafeRouteCost(room.name, allyRoomName, false, false, 20) 

									if (dist < 20 && dist < bestDist) {
										bestDist = dist;
										bestRoom = room;
									}
								}
							}
							if (bestRoom) {	
								let veryLarge = Memory.allySymbolAmount[allyName][allyRoomName] > SCORE_MEGA_OVERFLOW_THRESHOLD / 4
								let large = Memory.allySymbolAmount[allyName][allyRoomName] > SCORE_OVERFLOW_THRESHOLD / 4
								console.log("Spawning season2ScoreShuffler for", allyRoomName, "in", bestRoom)					
								let body
								if (veryLarge) {
									body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", bestRoom.energyCapacityAvailable, true, 0, 1, {veryLarge: 1})
								}
								else if (large) {
									body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", bestRoom.energyCapacityAvailable, true, 0, 1, {large: 1})
								}								
								else {
									body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", bestRoom.energyCapacityAvailable, true, 0, 1)	
								}

								bestRoom.spawns[0].addPrioritySpawn("season2ScoreShuffler", {targetRoom: allyRoomName}, "", body)
								found = true
								spawned = true
								if (Memory.allySymbolAmount[allyName][allyRoomName] < SCORE_MEGA_OVERFLOW_THRESHOLD) {
									Memory.dropsPlanned[symbol] = Game.time + 1500
								}
								break
							}
						}

						if (found) {
							continue
						}

						// if ((Memory.allyDropsPlanned[allyName][symbol] || 0) > Game.time) {
						// 	continue
						// }
						// if ((Memory.dropsPlanned[symbol] || 0) > Game.time) {
						// 	continue
						// }

						// Back to how it should be
						// SCORE_TRANSFER_THRESHOLD = 20000
						// SCORE_OVERFLOW_THRESHOLD = 100000
						// SCORE_MEGA_OVERFLOW_THRESHOLD = 200000

						let friendNames = ["Montblanc"]

						for (let friendName of friendNames) {
							if (Memory.modifiedOutgoingTradeLedger[friendName][symbol] < SCORE_MEGA_OVERFLOW_THRESHOLD / 6) {
								if ((Memory.allyDropsPlanned[allyName][symbol] || 0) > Game.time || (Memory.dropsPlanned[symbol] || 0) > Game.time) {
									continue
								}
							}

							if (!Memory.currentMBSymbols.includes(symbol)) continue

							for (let friendRoomName in Memory.friendInfo[friendName]) {

								if (Memory.friendInfo[friendName][friendRoomName] != symbol) continue
								if (Memory.modifiedOutgoingTradeLedger[friendName][symbol] < SCORE_TRANSFER_THRESHOLD && !Memory.testMBScoreSubmit) continue
								if (Memory.rooms[friendRoomName].rcl != 8) continue

								let bestDist = Infinity
								let bestRoom


								for (let room of Game.myRooms) {
									if (room.defcon >= 4 && 
										room.effectiveLevel >= 4 && 
										!room.restrictOffensiveMissions(undefined, true, false, false) && 
										room.spawns.length) {
										let dist = safeRoute.getSafeRouteCost(room.name, friendRoomName, false, false, 20) 

										if (dist < 20 && dist < bestDist) {
											bestDist = dist;
											bestRoom = room;
										}
									}
								}
								if (bestRoom) {	
									let veryLarge = Memory.modifiedOutgoingTradeLedger[friendName][symbol] > SCORE_MEGA_OVERFLOW_THRESHOLD / 6
									let large = Memory.modifiedOutgoingTradeLedger[friendName][symbol] > SCORE_OVERFLOW_THRESHOLD / 4
									console.log("Spawning season2ScoreShuffler for", friendRoomName, "in", bestRoom)					
									let body
									if (veryLarge) {
										body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", bestRoom.energyCapacityAvailable, true, 0, 1, {veryLarge: 1})
									}
									else if (large) {
										body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", bestRoom.energyCapacityAvailable, true, 0, 1, {large: 1})
									}								
									else {
										body = creepCreator.getDesignForEnergyCap("season2ScoreShuffler", bestRoom.energyCapacityAvailable, true, 0, 1)	
									}

									bestRoom.spawns[0].addPrioritySpawn("season2ScoreShuffler", {targetRoom: friendRoomName}, "", body)
									// if (bestDist > 10 && veryLarge) {
									// 	bestRoom.spawns[0].addPrioritySpawn("season2ScoreShuffler", {targetRoom: friendRoomName}, "", body)
									// }
									spawned = true
									delete Memory.testMBScoreSubmit
									if (Memory.modifiedOutgoingTradeLedger[friendName][symbol] < SCORE_MEGA_OVERFLOW_THRESHOLD / 6) {
										Memory.dropsPlanned[symbol] = Game.time + 1500
									}
									break
								}
							}
						}

					}
				}
			}

			// Overflow guard
			/*if (!spawned) {
				for (let room of _.shuffle(Game.myRooms)) {
					let symbol = room.mem.decoderType
					let currentAmount = room.getCurrentOfResource(symbol)

					for (let playerName in Memory.incomingTradeLedger) {
						currentAmount -= Math.max(0, (Memory.incomingTradeLedger[playerName][symbol] || 0))
					}



					if (room.controller.level == 8 && 
						(room.mem.ownedCreeps["season2ScoreShuffler"] || []).length == 0 &&
						currentAmount > SCORE_OVERFLOW_THRESHOLD && 
						room.defcon == 5 && 
						!room.restrictOffensiveMissions(undefined, true, false, false) && 
						room.spawns.length) {
						room.spawns[0].addPrioritySpawn("season2ScoreShuffler", {targetRoom: room.name})
						spawned = true
						break
					}
				}
			}*/
		}
		
		if (Game.damagedRooms <= Game.myRooms.length / 2 && (Game.time % 1787 == 123 && (Game.cpu.bucket > 2000 || Memory.allyResourceRequests["Cub"][RESOURCE_ENERGY])) || Memory.debugCubTerminalExchange) {
			delete Memory.debugCubTerminalExchange

			Memory.terminalShuffleRoomLastEmpty = Memory.terminalShuffleRoomLastEmpty || {}
			Memory.terminalShuffleRoomLastEmpty["W18N7"] = Memory.terminalShuffleRoomLastEmpty["W18N7"] || Game.time

			// Love hardcoding
			let terminal = Game.rooms["W18N7"].terminal
			let storage = Game.rooms["W18N7"].storage

			let spawned = false;
			let body = creepCreator.getDesignForEnergyCap("season2TerminalTransporter", Game.rooms["W18N7"].energyCapacityAvailable, true, 0, 1, {roads: 1})

			let cubEnergyThreshold = Memory.allyResourceRequests["Cub"][RESOURCE_ENERGY] ? 1e6 : 10e6
			let sendEnergy = Memory.allyResourceRequests["Cub"][RESOURCE_ENERGY] || Memory.terminalNetworkFreeEnergy > cubEnergyThreshold;

			let orderedSymbols = util.getSeasonOrderedSymbols()

			let candidateSmybols = _.shuffle(Object.values(Memory.allySymbols["Cub"]))
			for (let symbol of candidateSmybols) {
				if (Memory.myDecoders.includes(symbol)) continue
				if (orderedSymbols.indexOf(symbol) < constants.SEASON2_MAX_X_HOARD) {
					continue
				}

				let amount = (terminal.store[symbol] || 0) + (storage.store[symbol] || 0)
				if (amount < 10000) {
					continue
				}



				if (terminal.store[symbol]) {
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: sendEnergy}, "", body)
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: sendEnergy}, "", body)
					spawned = true;
					if (amount < 30000) {
						break
					}
				}
			}

			if (sendEnergy) {
				if (Memory.terminalNetworkFreeEnergy > cubEnergyThreshold + 0.25e6) {					
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
				}
				if (Memory.terminalNetworkFreeEnergy > cubEnergyThreshold + 0.5e6) {					
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
				}
				if (Memory.terminalNetworkFreeEnergy > cubEnergyThreshold + 0.75e6) {					
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
				}
				Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
				Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
				Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
				Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 1}, "", body)
			}
			else {
				for (let i = 0; i < Math.ceil((Game.time - Memory.terminalShuffleRoomLastEmpty["W17N6"]) / 1500); i++) {
					Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 0}, "", body)
				}
				// Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 0}, "", body)
				// Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 0}, "", body)
				// Game.rooms["W18N7"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: "W17N6", bidirectional: 1, minerals: 1, energy: 0}, "", body)
			}			
		}

		if ((Game.time % 887 == 423 && Game.cpu.bucket > 2000) || Memory.debugMBTerminalExchange) {
			delete Memory.debugMBTerminalExchange
			// Love hardcoding
			let terminal = Game.rooms["W12N9"].terminal
			let storage = Game.rooms["W12N9"].storage

			let orderedSymbols = util.getSeasonOrderedSymbols()

			let candidateSmybols = _.shuffle(Memory.currentMBSymbols)
			for (let symbol of candidateSmybols) {
				if (Memory.myDecoders.includes(symbol)) continue
				if (Memory.allyDecoders.includes(symbol)) continue


				let amount = ((Memory.stats.globalResources[symbol] || 0) + (terminal.store[symbol] || 0) + (storage.store[symbol] || 0)) / 2
				// if (amount < 10000) {
				// 	continue
				// }
				if (Memory.modifiedOutgoingTradeLedger["Montblanc"][symbol] > 75000) {
					continue
				}
				if (amount < 50000 && orderedSymbols.indexOf(symbol) < constants.SEASON2_MAX_X_HOARD) {
					continue
				}


				if (terminal.store[symbol]) {
					let targetRoomName = "W12N11"
					Game.rooms["W12N9"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: targetRoomName, bidirectional: 1, minerals: 1})
					if (amount > 20000) {
						Game.rooms["W12N9"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: targetRoomName, bidirectional: 1, minerals: 1})
					}
					if (amount > 40000) {
						Game.rooms["W12N9"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: targetRoomName, bidirectional: 1, minerals: 1})
					}
					if (amount > 60000) {
						Game.rooms["W12N9"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: targetRoomName, bidirectional: 1, minerals: 1})
					}
					if (amount > 80000) {
						Game.rooms["W12N9"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: targetRoomName, bidirectional: 1, minerals: 1})
					}
					if (amount > 100000) {
						Game.rooms["W12N9"].spawns[0].addPrioritySpawn("season2TerminalTransporter", {targetRoom: targetRoomName, bidirectional: 1, minerals: 1})
					}
				}
			}
		}


		let interval = 151;

		if (Memory.maxRoomLevel < 8) {
			interval *= 2
		}


		Memory.scoreContainerRooms = Memory.scoreContainerRooms || []

		for (let roomName in Game.rooms) {
			let decoder = Game.rooms[roomName].find(FIND_SYMBOL_DECODERS)[0]

			if (decoder) {
				Memory.rooms[roomName].decoderType = decoder.resourceType
				Memory.rooms[roomName].decoderX = decoder.pos.x
				Memory.rooms[roomName].decoderY = decoder.pos.y
			}
		}


		if (Memory.enableVisuals || Memory.forceSaveMemory) {			
			for (let roomName of Memory.scoreContainerRooms) {
				if (!Memory.rooms[roomName]) continue
				if (!Memory.rooms[roomName].scoreContainers || !Memory.rooms[roomName].scoreContainers.length) continue

				for (let scoreContainer of Memory.rooms[roomName].scoreContainers) {
					if (scoreContainer.decayTick >= Game.time) {
						let allyTarget = false
						for (let playerName in Memory.allyHaulerTargets) {
							for (let haulerTargetId in Memory.allyHaulerTargets[playerName]) {
								if (haulerTargetId == scoreContainer.id) {
									allyTarget = true
									break
								}
							}
						}


						Game.map.visual.text("🏆" + Math.round((scoreContainer.decayTick - Game.time) / 100) + (allyTarget ? "*" : ""), new RoomPosition(scoreContainer.pos.x, scoreContainer.pos.y, scoreContainer.pos.roomName), {fontSize: 2.5 * Math.sqrt(scoreContainer.amount / 1000)})
					}
				}
			}
		}
		if (Game.time % (interval * (global.anySmallHaulers ? 1 : 2)) && !Memory.debugSeasonTickEnd) return


		delete Memory.debugSeasonTickEnd

		global.inTickObject.allSeasonFetchers = global.inTickObject.allSeasonFetchers || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'seasonFetcher'))


		let allContainers = []
		for (let roomName of Memory.scoreContainerRooms) {
			if (!Memory.rooms[roomName]) continue
			if (!Memory.rooms[roomName].scoreContainers || !Memory.rooms[roomName].scoreContainers.length) continue

			if (Memory.rooms[roomName].skLairsX && !Memory.usedRemotes.includes(roomName)) {
				continue
			}

			let sectorCoords = util.getSectorCoords(roomName)
			let highway = (sectorCoords.x == 0 || sectorCoords.y == 0)

			// if (Memory.maxRoomLevel < 8) {
			// 	let sectorCoords = util.getSectorCoords(roomName)

			// 	if (sectorCoords.x % 10 == 0 || sectorCoords.y % 10 == 0) {
			// 		continue
			// 	}
			// }

			// let centreRoomName = util.getCentreRoomForRoomName(roomName)


			for (let myRoom of Game.myRooms) {
				let maxRange = Math.min(constants.MAX_SEASON_SCORE_RANGE_SPAWN, myRoom.effectiveLevel)

				let cost = safeRoute.getSafeRouteCost(myRoom.name, roomName, false, false, Math.ceil(maxRange))

				// This may be a bitch to reach, be careful
				// if (util.getCentreRoomForRoomName(myRoom.name) != centreRoomName) {
				// 	cost += 2;
				// }

				if (cost <= maxRange) {
					for (let scoreContainer of Memory.rooms[roomName].scoreContainers) {
						// if (!Memory.allyDecoders.includes(scoreContainer.resourceType) && 
						// 	!Memory.myDecoders.includes(scoreContainer.resourceType) &&
						// 	!Memory.friendDecoders.includes(scoreContainer.resourceType) &&
						// 	!Memory.stealingDecoders.includes(scoreContainer.resourceType)) {
						// 	continue
						// }

						let amount = scoreContainer.amount

						for (let otherFetcher of global.inTickObject.allSeasonFetchers) {
							if (otherFetcher.mem.f && otherFetcher.mem.fT === scoreContainer.id) {
								amount -= otherFetcher.carryCapacity
							}
						}

						for (let playerName in Memory.allyHaulerTargets) {
							for (let haulerTargetId in Memory.allyHaulerTargets[playerName]) {
								if (haulerTargetId == scoreContainer.id) {
									amount -= Memory.allyHaulerTargets[playerName][haulerTargetId]
								}
							}
						}

						// Don't cosider if it it is handled
						if (amount < 0) {
							continue
						}

						if (!scoreContainer.reachable && highway && util.getCentreRoomForRoomName(myRoom.name) != util.getCentreRoomForRoomPos(new RoomPosition(scoreContainer.pos.x, scoreContainer.pos.y, scoreContainer.pos.roomName))) {
							continue
							// let roomCoords = util.getRoomCoords(roomName)
							// let testRoom = util.getRoomNameFromCoords({x : roomCoords.x + 1, y : roomCoords.y})

							// if (!util.isRoomAccessible(testRoom)) {
							// 	continue
							// }

							// testRoom = util.getRoomNameFromCoords({x : roomCoords.x - 1, y : roomCoords.y})
							// if (!util.isRoomAccessible(testRoom)) {
							// 	continue
							// }

							// testRoom = util.getRoomNameFromCoords({x : roomCoords.x, y : roomCoords.y + 1})
							// if (!util.isRoomAccessible(testRoom)) {
							// 	continue
							// }

							// testRoom = util.getRoomNameFromCoords({x : roomCoords.x, y : roomCoords.y - 1})
							// if (!util.isRoomAccessible(testRoom)) {
							// 	continue
							// }
						}

						allContainers.push(scoreContainer)
					}
					break					
				}
			}		
		}


		console.log(allContainers.length, "season containers in range")
		//console.log(JSON.stringify(allContainers))


		// if (Memory.maxRoomLevel < 5) {
		// 	return
		// }


		let targetContainers

		let fetchers = _.clone(global.inTickObject.allSeasonFetchers)

		let overflowGuard = 0
		let anySpawned = 0
		let spawnedByRoom = {}
		let anyDropOffPoint = Memory.anySeasonDropOffAvailable

		do {
			overflowGuard++
			targetContainers = []

			for (let container of allContainers) {
				if (container.decayTick - Game.time < 1800 && container.decayTick - Game.time < container.amount / 2) {
				// if (container.decayTick - Game.time < 1500 && container.decayTick - Game.time < container.amount / 2) {
					targetContainers.push(container)
				}
				else {					
					let matched = false
					for (let fetcher of fetchers) {
						let maxRange = Math.min(Math.ceil(fetcher.ticksToLive / 150), constants.MAX_SEASON_SCORE_RANGE_SPAWN * 0.75)
						let dist = safeRoute.getSafeRouteCost(fetcher.room.name, container.pos.roomName, false, false, Math.ceil(maxRange))

						if (Memory.season2) {
							if (util.getCentreRoomForRoomPos(fetcher.pos) != util.getCentreRoomForRoomPos(new RoomPosition(container.pos.x, container.pos.y, container.pos.roomName))) {
								dist += 5
							}
						}

						if (dist <= maxRange) {
							matched = true;
							break
						}
					}
					if (!matched) {
						targetContainers.push(container)
					}
				}
			}

			// console.log(targetContainers.length, "target containers")

			if (targetContainers.length) {
				let container = targetContainers[0]
				let bestScore = Infinity
				let bestRoom
				let bestRoomBucket = 0
				for (let myRoom of Game.myRooms) {
					if (!myRoom.storage) continue


					// if (myRoom.storage.store.getFreeCapacity() < 100000) continue

					if (myRoom.restrictOffensiveMissions(undefined, Memory.maxRoomLevel >= 7, false, false)) continue
					if (!myRoom.spawns.length) continue

					let score = 0

					if (Memory.season2) {
						if (util.getCentreRoomForRoomName(myRoom.name) != util.getCentreRoomForRoomPos(new RoomPosition(container.pos.x, container.pos.y, container.pos.roomName))) {
							score += 5
						}
						else {
							// Same sector.
							global.inTickObject.ignoreSeason2Walls = 1
						}
					}

					let dist = safeRoute.getSafeRouteCost(myRoom.name, container.pos.roomName, false, false, myRoom.effectiveLevel)

					delete global.inTickObject.ignoreSeason2Walls

					if (Game.time + dist * 50 + 150 > container.decayTick) continue

					score += dist - myRoom.effectiveLevel
					if (score < bestScore) {
						bestScore = score
						bestRoom = myRoom
					}
				}

				if (bestRoom) {
					let centreRoomName = util.getCentreRoomForRoomName(container.pos.roomName)

					let mod = 1
					if (centreRoomName == "W5S5" && !global.inTickObject.anyRoomUnderBigAttack) {
						mod = 2
					}



					let spawn = bestRoom.spawns[0]
					console.log(bestRoom.name, "spawning hauler for season container", JSON.stringify(container))
					anySpawned++
					// Spoof so that unmatched containers sorts itself out
					spawn.addPrioritySpawn("seasonFetcher")
					spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					fetchers.push({pos: new RoomPosition(25, 25, bestRoom.name), room: {name: bestRoom.name}, ticksToLive: CREEP_LIFE_TIME})
					if ((container.amount > 5000 / mod || (container.amount > 2500 / mod && container.decayTick - Game.time < 1500 * mod)) && spawn.room.spawns.length > 1) {
						console.log(bestRoom.name, "spawning another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
					if ((container.amount > 7500 / mod || (container.amount > 5000 / mod && container.decayTick - Game.time < 2500 * mod)) && spawn.room.spawns.length > 1 && Game.cpu.bucket > 2000) {
						console.log(bestRoom.name, "spawning yet another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
					if ((container.amount > 10000 / mod || (container.amount > 7500 / mod && container.decayTick - Game.time < 2500 * mod)) && spawn.room.spawns.length > 2 && Game.cpu.bucket > 3000) {
						console.log(bestRoom.name, "spawning yet another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
					if ((container.amount > 12500 / mod || (container.amount > 10000 / mod && container.decayTick - Game.time < 2500 * mod)) && spawn.room.spawns.length > 2 && Game.cpu.bucket > 4000) {
						console.log(bestRoom.name, "spawning yet another hauler for season container", JSON.stringify(container))
						spawn.addPrioritySpawn("seasonFetcher")
						spawnedByRoom[bestRoom.name] = (spawnedByRoom[bestRoom.name] || 0) + 1
					}
				}
				else {
					console.log("No best room for", JSON.stringify(container))
				}
				_.pull(allContainers, container)
			}
		}
		while (targetContainers.length || overflowGuard > 10000)
		if (overflowGuard > 10000) {
			console.log("----------------seasonTickEnd overflow!!!!!!!!!!!!")
		}

	},

	season3TickEnd : function() {
		// Need to worry about single spawn getting ganked by power creeps + dismantlers
		// Strategy is to pre-spawn attack creeps have have them boost on danger
		if (Memory.preEmptiveDefense) {			
			for (let room of Game.myRooms) {
				if (room.defcon == 5 && !Memory.ignoreDefconForPremtiveDefense) continue
				if (room.effectiveLevel < 6) continue
				var spawns = room.spawns;

				var currentlySpawning = false;
				for (let spawn of spawns) {
					if (spawn.memory.currentBuildingRole == "tank") {
						currentlySpawning = true;
						break;
					}
				}

				let needNewGaurd = true
				for (let creepName of room.mem.ownedCreeps["tank"] || []) {
					let creep = Game.creeps[creepName]
					if (!creep) continue
					if (!creep.spawning) continue
					if (!creep.mem.baseGuard) continue

					if (creep.ticksToLive >= 750) {
						needNewGaurd = false
					}
				}

				if (needNewGaurd && !currentlySpawning && spawns[0]) {
					let extraMem = {baseGuard: 1, targetRoom: room.name, boostOnDanger: 1, targetBoosts: {[RESOURCE_CATALYZED_UTRIUM_ACID]: -1}}					
					if (!spawns[0].hasPrioritySpawn("tank", extraMem)) {
						spawns[0].addPrioritySpawn("tank", extraMem)
					}
				}
			}
		}




		if (Math.random() < 0.1) {
			for (let room of Game.myRooms) {
				if (room.mem.powerRooms && room.mem.powerRooms.length && (room.mem.ownedCreeps["powerScout"] || []).length == 0 && !room.observer) {
					var spawns = room.spawns;

					var currentlySpawning = false;
					for (let spawn of spawns) {
						if (spawn.memory.currentBuildingRole == "powerScout") {
							currentlySpawning = true;
							break;
						}
					}

					if (!currentlySpawning && spawns[0]) {
						if (!spawns[0].hasPrioritySpawn("powerScout")) {
							spawns[0].addPrioritySpawn("powerScout")
						}
					}
				}
			}
		}

		if (Math.random() < 0.01 || Memory.debugS3PowerBalance) {
			delete Memory.debugS3PowerBalance
			for (let room of Game.myRooms) {			
				if (room.terminal && !room.transferred) {
					let myAmount = room.getCurrentOfResourceNonMineral(RESOURCE_POWER)

					let targetAmount = (Game.time - (room.mem.wantsToOpPower || 0)) < 50000 ? 125000 : 20000

					if (myAmount < targetAmount) {				
						for (let otherRoom of _.shuffle(Game.myRooms)) {
							if (!otherRoom.terminal) continue
							if (otherRoom.terminal.cooldown) continue
							if (otherRoom.transferred) continue

							let otherTargetAmount = (Game.time - (otherRoom.mem.wantsToOpPower || 0)) < 50000 ? 125000 : 20000

							if (!otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, otherTargetAmount)) continue

							if (otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, otherTargetAmount * 1.5)) {
								let otherAmount = otherRoom.getCurrentOfResourceNonMineral(RESOURCE_POWER)

								let requiredAmount = Math.min(targetAmount - myAmount, Math.round((otherAmount - otherTargetAmount * 1.5) * 0.5))
								let amount = Math.min(requiredAmount, otherRoom.terminal.store[RESOURCE_POWER], otherRoom.terminal.store[RESOURCE_ENERGY])
								let cost = Game.market.calcTransactionCost(amount, room.name, otherRoom.name)

								otherRoom.terminal.send(RESOURCE_POWER, amount, room.name)
								global.inTickObject.energyExpenditures["terminalPower"]  = (global.inTickObject.energyExpenditures["terminalPower"] || 0) + cost

								otherRoom.transferred = 1
								room.transferred = 1
								break
							}
						}
					}
				}
			}
		}
	},

	season4TickEnd : function() {
		if (Math.random() < 0.01 || Memory.debugS4PowerBalance) {
			delete Memory.debugS4PowerBalance
			for (let room of _.shuffle(Game.myRooms)) {
				if (room.terminal && !room.terminal.cooldown && !room.transferred) {
					let myAmount = room.getCurrentOfResourceNonMineral(RESOURCE_POWER)

					let targetAmount = (Game.time - (room.mem.wantsToOpPower || 0)) < 50000 ? 125000 : 10000

					if (myAmount < targetAmount) {				
						for (let otherRoom of _.shuffle(Game.myRooms)) {
							if (!otherRoom.terminal) continue
							if (otherRoom.terminal.cooldown) continue
							if (otherRoom.transferred) continue

							let otherTargetAmount = (Game.time - (otherRoom.mem.wantsToOpPower || 0)) < 50000 ? 125000 : 10000

							if (!otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, otherTargetAmount)) continue

							if (otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, otherTargetAmount * 1.5)) {
								let otherAmount = otherRoom.getCurrentOfResourceNonMineral(RESOURCE_POWER)

								let requiredAmount = Math.min(targetAmount - myAmount, Math.round((otherAmount - otherTargetAmount * 1.5) * 0.5))
								let amount = Math.min(requiredAmount, otherRoom.terminal.store[RESOURCE_POWER], otherRoom.terminal.store[RESOURCE_ENERGY])
								let cost = Game.market.calcTransactionCost(amount, room.name, otherRoom.name)

								if (amount <= 0) {
									continue
								}

								console.log(otherRoom.name, "sending", amount, "power to", room.name)

								otherRoom.terminal.send(RESOURCE_POWER, amount, room.name)
								global.inTickObject.energyExpenditures["terminalPower"]  = (global.inTickObject.energyExpenditures["terminalPower"] || 0) + cost

								otherRoom.transferred = 1
								room.transferred = 1
								break
							}
						}
					}
				}
			}
		}
	},


	season5TickEnd: function() {
		if (Math.random() < 0.01 || Memory.debugS5PowerBalance) {
			delete Memory.debugS5PowerBalance
			for (let room of _.shuffle(Game.myRooms)) {
				if (room.terminal && !room.terminal.cooldown && !room.transferred) {
					let myAmount = room.getCurrentOfResourceNonMineral(RESOURCE_POWER)

					let targetAmount = room.effectiveLevel < 8 ? 0 : 5000

					if (myAmount < targetAmount) {				
						for (let otherRoom of _.shuffle(Game.myRooms)) {
							if (!otherRoom.terminal) continue
							if (otherRoom.terminal.cooldown) continue
							if (otherRoom.transferred) continue

							let otherTargetAmount = otherRoom.effectiveLevel < 8 ? 0 : 5000

							//if (!otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, otherTargetAmount)) continue

							if (otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_POWER, otherTargetAmount * 1.5)) {
								let otherAmount = otherRoom.getCurrentOfResourceNonMineral(RESOURCE_POWER)

								let requiredAmount = Math.min(targetAmount - myAmount, Math.round((otherAmount - otherTargetAmount * 1.5) * 0.5))
								let amount = Math.min(requiredAmount, otherRoom.terminal.store[RESOURCE_POWER], otherRoom.terminal.store[RESOURCE_ENERGY])
								let cost = Game.market.calcTransactionCost(amount, room.name, otherRoom.name)

								if (amount <= 0) {
									continue
								}

								console.log(otherRoom.name, "sending", amount, "power to", room.name)

								otherRoom.terminal.send(RESOURCE_POWER, amount, room.name)
								global.inTickObject.energyExpenditures["terminalPower"]  = (global.inTickObject.energyExpenditures["terminalPower"] || 0) + cost

								otherRoom.transferred = 1
								room.transferred = 1
								break
							}
						}
					}
				}
			}
		}

		if (Math.random() < 0.01 || Memory.debugS5ThoriumBalance) {
			delete Memory.debugS5ThoriumBalance
			for (let room of _.shuffle(Game.myRooms)) {
				if (room.terminal && !room.terminal.cooldown && !room.transferred) {
					let myAmount = room.getCurrentOfResourceNonMineral(RESOURCE_THORIUM)

					let targetAmount = room.mem.reactorTarget ? 5000 : 0

					if (myAmount > targetAmount && room.mem.claimToUnclaimRoom) {
						for (let otherRoom of _.shuffle(Game.myRooms)) {
							if (!otherRoom.terminal) continue
							if (otherRoom.terminal.cooldown) continue
							if (otherRoom.transferred) continue

							let otherTargetAmount = otherRoom.mem.reactorTarget ? 10000 : 0

							//if (!otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_THORIUM, otherTargetAmount)) continue

							if (!otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_THORIUM, otherTargetAmount)) {
								let otherAmount = otherRoom.getCurrentOfResourceNonMineral(RESOURCE_THORIUM)

								let requiredAmount = Math.min(myAmount - targetAmount, otherTargetAmount - otherAmount)
								let amount = Math.min(requiredAmount, room.terminal.store[RESOURCE_THORIUM], room.terminal.store[RESOURCE_ENERGY])
								let cost = Game.market.calcTransactionCost(amount, otherRoom.name, room.name)

								if (amount <= 0) {
									continue
								}

								console.log(room.name, "sending", amount, "thorium to", otherRoom.name)

								room.terminal.send(RESOURCE_THORIUM, amount, otherRoom.name)
								global.inTickObject.energyExpenditures["terminalThorium"]  = (global.inTickObject.energyExpenditures["terminalThorium"] || 0) + cost

								room.transferred = 1
								otherRoom.transferred = 1
								break
							}
						}
					}

					if (myAmount < targetAmount) {				
						for (let otherRoom of _.shuffle(Game.myRooms)) {
							if (!otherRoom.terminal) continue
							if (otherRoom.terminal.cooldown) continue
							if (otherRoom.transferred) continue

							let otherTargetAmount = otherRoom.mem.reactorTarget ? 5000 : 0

							//if (!otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_THORIUM, otherTargetAmount)) continue

							if (otherRoom.hasAtLeastXOfResourceNonMineral(RESOURCE_THORIUM, otherTargetAmount * 1.5)) {
								let otherAmount = otherRoom.getCurrentOfResourceNonMineral(RESOURCE_THORIUM)

								let requiredAmount = Math.min(targetAmount - myAmount, Math.round((otherAmount - otherTargetAmount * 1.5) * 0.5))
								let amount = Math.min(requiredAmount, otherRoom.terminal.store[RESOURCE_THORIUM], otherRoom.terminal.store[RESOURCE_ENERGY])
								let cost = Game.market.calcTransactionCost(amount, room.name, otherRoom.name)

								if (amount <= 0) {
									continue
								}

								console.log(otherRoom.name, "sending", amount, "thorium to", room.name)

								otherRoom.terminal.send(RESOURCE_THORIUM, amount, room.name)
								global.inTickObject.energyExpenditures["terminalThorium"]  = (global.inTickObject.energyExpenditures["terminalThorium"] || 0) + cost

								otherRoom.transferred = 1
								room.transferred = 1
								break
							}
						}
					}

				}
			}
		}


		for (let room of Game.myRooms) {
			if (room.effectiveLevel < 6 && room.mem.claimToUnclaimRoom) {
				for (let creep of room.find(FIND_MY_CREEPS)) {
					if (creep.mem.role == "transporter") {
						if (creep.mem.timeToDest && creep.mem.sR == room.mem.supportFrom) {
							room.mem.avgTransporterRoomDist = ((room.mem.avgTransporterRoomDist || 0) * 0.999 + creep.mem.timeToDest * 0.001) / 50
						}


						if (creep.store[RESOURCE_ENERGY] && creep.getStoreUsedCapacity() > 0 && !creep.mem.f) {
							let containers = creep.pos.findInRange(room.containers, 1)
							let transferred = false
							for (let container of containers) {
								if (roomAI.isDropoffPoint(container) && container.store.getFreeCapacity()) {
									creep.transfer(container, RESOURCE_ENERGY)
									if (!creep.mem.timeToDest) {
										creep.mem.timeToDest = CREEP_LIFE_TIME - creep.ticksToLive
									}
									transferred = true
									break
								}
							}

							if (!transferred) {
								for (let otherCreep of creep.pos.findInRange(FIND_MY_CREEPS, 1).filter(c => !c.spawning && c.mem.role == "upgrader" && c.mem.targetRoom == c.room.name && c.store.getFreeCapacity() > creep.getNumOfBodyPart(WORK))) {
									creep.transfer(otherCreep, RESOURCE_ENERGY)
									if (!creep.mem.timeToDest) {
										creep.mem.timeToDest = CREEP_LIFE_TIME - creep.ticksToLive
									}
									transferred = true
									break
								}
							}
							
						}
					}
				}
			}
		}


		try {
			if (Memory.visThorium) {
				for (let roomName in Memory.rooms) {
					let mem = Memory.rooms[roomName]
					if (!mem.thoriumAmount) {
						continue
					}

					Game.map.visual.text("" + mem.thoriumAmount, new RoomPosition(25, 25, roomName), {fontSize: 3 * Math.sqrt(mem.thoriumAmount / 1000)})						
				}				
			}

			try {
				if (Memory.rooms.W15N5 && Game.rooms.W13N4 && Game.rooms.W13N4.isMyRoom()) {
					if (Memory.stats.globalResources[RESOURCE_THORIUM] > 200000) {
						Memory.rooms.W15N5.useReactorForScoring = true
						Memory.rooms.W13N4.reactorTarget = "W15N5"
					}
					else if (Memory.stats.globalResources[RESOURCE_THORIUM] < 50000) {
						Memory.rooms.W15N5.useReactorForScoring = false
						Memory.rooms.W13N4.reactorTarget = undefined
					}
				}
				else {
					if (Memory.rooms.W15N5) {
						Memory.rooms.W15N5.useReactorForScoring = false
					}
					if (Memory.rooms.W13N4) {
						Memory.rooms.W13N4.reactorTarget = undefined
					}
				}
			}
			catch (e) {
				console.log("Error in s5TickEnd")
				console.log(e)
				console.log(e.stack)
			}


			for (let roomName in Memory.rooms) {
				let mem = Memory.rooms[roomName]
				if (!mem.reactorPos) {
					continue
				}

				if (mem.useReactorForScoring && mem.reactorOwner != util.getMyName()) {
					season5ReactorClaim.request(roomName)
				}
			}

			for (let room of Game.myRooms) {				
				if (room.mem.claimToUnclaimRoom) {					
					if (room.controller.level >= 6 && !room.terminal && Game.time % 397 == 272) {
						let cargoToOffload = room.storage ? room.storage.store.getUsedCapacity() - room.storage.store.getUsedCapacity(RESOURCE_ENERGY) : 0
						if (room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 50000) {
							cargoToOffload += (room.storage.store.getUsedCapacity(RESOURCE_ENERGY) - 50000) / 4
						}
						if (cargoToOffload) {
							if (!room.mem.priorityBuilds || room.mem.priorityBuilds["season5UnclaimEmptier"] <= 0) {
								let spawn = room.find(FIND_MY_SPAWNS)[0]
								for (let i = 0; i < Math.min(3, Math.ceil(cargoToOffload / 5000)); i++) {
									spawn.addPrioritySpawn("season5UnclaimEmptier", {"targetRoom": room.mem.supportFrom})
								}								
							}

							if (Game.rooms[room.mem.supportFrom]) {
								let spawn = Game.rooms[room.mem.supportFrom].find(FIND_MY_SPAWNS)[0]
								for (let i = 0; i < Math.min(6, Math.ceil(cargoToOffload / 5000)); i++) {
									spawn.addPrioritySpawn("season5UnclaimEmptier", {"targetRoom": room.mem.supportFrom, "sourceRoom": room.name})
								}
							}
						}
					}
				}
				if (room.controller.level >= 6) {
					if (room.mem.claimToUnclaimRoom) {
						let upgraders = room.find(FIND_MY_CREEPS, {
							filter: (creep) => {	
								return creep.mem.role == "upgrader"
							}
						})

						for (let i = 0; i < upgraders.length - (room.controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[room.controller.level] * 0.95 ? 0 : 1); i++) {
							let creep = upgraders[i]
							creep.mem.role = "recycler"
						}
					}
					let anyMinerals = false
					let extractorValid = false
					for (let mineral of room.find(FIND_MINERALS)) {
						if (mineral.mineralAmount > (room.mem.claimToUnclaimRoom || 
							mineral.mineralType != RESOURCE_THORIUM || 
							(room.mem.ownedCreeps["season5ThoriumMiner"] || []).length ? 0 : 2500)) {

							if (mineral.mineralType != RESOURCE_THORIUM && 
								Memory.stats.globalResources[mineral.mineralType] > Game.gcl.level * 10000 &&
								room.mem.claimToUnclaimRoom) {
								continue
							}

							anyMinerals = true
							if (!room.extractor) {
								room.createConstructionSite(mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR)
							} 
							else if (room.extractor && room.extractor.pos.isEqualToPos(mineral.pos)) {
								extractorValid = true
								if (room.mem.claimToUnclaimRoom && mineral.mineralType == RESOURCE_THORIUM && room.containers.length < 5) {
									room.mem.triggerRebuild = 1
								}
							}
						}
					}
					if (anyMinerals && !extractorValid && room.extractor) {
						room.extractor.destroy()						
					}
					if (!anyMinerals && room.mem.claimToUnclaimRoom) {
						let mineralsInTransit = false
						try {
							for (let creep of room.find(FIND_MY_CREEPS)) {
								if ((creep.store.getUsedCapacity() || 0) != (creep.store[RESOURCE_ENERGY] || 0)) {
									mineralsInTransit = true
									break
								}
							}
						}
						catch (e) {
							console.log("Error in s5TickEnd")
							console.log(e)
							console.log(e.stack)
						}
						
						if (!mineralsInTransit) {
							console.log("Should unclaim", room.name)
							if (!Memory.seasonUnclaim || !Game.rooms[Memory.seasonUnclaim] || !Game.rooms[Memory.seasonUnclaim].isMyRoom()) {
								Memory.seasonUnclaim = room.name	
							}							
						}
					}				
				}


				if (room.mem.reactorTarget && Memory.rooms[room.mem.reactorTarget] && Memory.rooms[room.mem.reactorTarget].reactorOwner == util.getMyName()) {
					season5Scoring.request(room, room.mem.reactorTarget)
				}
			}

			if (Game.myRooms.length < Game.gcl.level && (Game.time - (Memory.lastSeason5Claim || 0)) > 1000 && Memory.enableStripping) {
				let numStripping = 0
				let supportRooms = []
				for (let room of Game.myRooms) {
					if (room.mem.claimToUnclaimRoom && room.effectiveLevel < 6) {
						numStripping++
						if (room.mem.supportFrom) {
							supportRooms.push(room.mem.supportFrom)
						}
					}
				}
				if (numStripping < (Game.gcl.level >= 9 ? 2 : 1)) {
					let bestRoomName
					let bestRoomClosestRoom
					let bestRoomScore = -Infinity
					for (let roomName in Memory.rooms) {
						let mem = Memory.rooms[roomName]
						if ((mem.thoriumAmount || 0) < 1000) {
							continue
						}
						if (mem.owner) {
							continue
						}
						if (mem.designFailed) {
							continue
						}

						let minDist = Infinity
						let closestRoom
						for (let myRoom of Game.myRooms) {
							if (myRoom.effectiveLevel < 7) {
								continue
							}
							if (Game.map.getRoomLinearDistance(myRoom.name, roomName) > 3) {
								continue
							}
							let distScore = safeRoute.getSafeRouteCost(myRoom.name, roomName, false, true, 5)

							distScore += myRoom.effectiveLevel == 7 ? 1 : 0

							for (let supportRoom of supportRooms) {
								if (supportRoom == myRoom.name) {
									distScore += 2
								}
							}

							if (distScore < 4) {						
								distScore -= 2 * (myRoom.mem.assignedPowerCreeps.length || 0)
								if (distScore < minDist) {
									minDist = distScore
									closestRoom = myRoom
								}
							}
						}
						if (minDist < 5) {
							let score = mem.thoriumAmount - minDist * 15000
							if (score > bestRoomScore) {
								bestRoomScore = score
								bestRoomName = roomName
								bestRoomClosestRoom = closestRoom
							}
						}
					}

					if (bestRoomName && bestRoomClosestRoom) {
						console.log("Strip mine", bestRoomName)
						roomDesignAI.designRoom(bestRoomName, true);
						if (Memory.rooms[bestRoomName].designFailed === false) {
							Memory.rooms[bestRoomName].claimToUnclaimRoom = 1
							Memory.rooms[bestRoomName].supportFrom = bestRoomClosestRoom.name
							Memory.rooms[bestRoomName].supportRoomDist = safeRoute.getSafeRouteCost(bestRoomClosestRoom.name, bestRoomName, false, true, 5)

							let spawn = bestRoomClosestRoom.find(FIND_MY_SPAWNS)[0]

							let maxHate = intelAI.getMaxHate()
							if (maxHate > 3000) spawn.addPrioritySpawn("ranged", {"targetRoom": bestRoomName})
							if (maxHate > 3000) spawn.addPrioritySpawn("ranged", {"targetRoom": bestRoomName})
							if (maxHate > 3000 || (Memory.rooms[bestRoomName] && Memory.rooms[bestRoomName].reservedBy == "Invader")) {
								spawn.addPrioritySpawn("tank", {"targetRoom": bestRoomName})
							}

							spawn.addPrioritySpawn("claimer", {"targetRoom": bestRoomName})
							spawn.addPrioritySpawn("pioneer", {"targetRoom": bestRoomName})
							spawn.addPrioritySpawn("pioneer", {"targetRoom": bestRoomName})
							spawn.addPrioritySpawn("pioneer", {"targetRoom": bestRoomName})
							spawn.addPrioritySpawn("pioneer", {"targetRoom": bestRoomName})


							Memory.lastSeason5Claim = Game.time
							Memory.claimScanData.lastClaimerSpawnedTick = Game.time
							Memory.claimScanData.lastClaimerSpawnedDest = bestRoomName

						} else {
							console.log("Strip mine design failed in", bestRoomName)
							Memory.lastSeason5Claim = Game.time - 900
						}
					} 
					else {
						console.log("Failed to find room to strip mine")
						Memory.lastSeason5Claim = Game.time - 900
					}
				}
			}
		}
		catch (e) {
			console.log("Error in s5TickEnd")
			console.log(e)
			console.log(e.stack)
		}

	},

}

module.exports = overseerSeason;