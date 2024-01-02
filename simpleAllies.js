"use strict";

// This is completely unencrypted and in the clear. Maybe it shouldn't be :D
const combatManager = require('combatManager');
const intelAI = require('intelAI');
const util = require('util');

const segmentID = 98;

let allyList = []
let friendList = []
// if (Game.shard.name == "shardSeason") {
// 	allyList = [
// 		"Cub"
// 	];
// 	friendList = [
// 		"Montblanc",
// 		"psy372"
// 	];
// }

// Priotity convention:
// 1: I really need this or I'm going to die
// 0: That'd be nice I guess maybe if you really don't mind.
// Everything in between: everything in betweeen


// It's kinda important everybody has the same enums here.
const requestTypes = {
	RESOURCE: 0,
	DEFENSE: 1,
	ATTACK: 2,
	EXECUTE: 3,
	HATE: 4,
	REMOTE_DEF: 5,
	SEASON_INFO: 6,	
	SEASON_SCORE: 7,
	SEASON_TRADE: 8
}

var requestArray = [];

let hasSetForeignSegment = false;

const period = 20

var simpleAllies = {
	// This sets foreign segments. Maybe you set them yourself for some other reason
	// Up to you to fix that.
	checkAllies() {
		// let allyList = global.whiteList || [];

		let workingList = allyList.concat(friendList)
		if (!workingList.length) return;

		Memory.allySymbols = Memory.allySymbols || {}
		Memory.allySymbolAmount = Memory.allySymbolAmount || {}
		Memory.allyScore = Memory.allyScore || {}
		Memory.allyHaulerTargets = Memory.allyHaulerTargets || {}
		Memory.allyDropsPlanned = Memory.allyDropsPlanned || {}
		Memory.allyResourceRequests = Memory.allyResourceRequests || {}
		Memory.allyOutgoingTradeLedger = Memory.allyOutgoingTradeLedger || {}

		Memory.allyRoomsUnderAttack = Memory.allyRoomsUnderAttack || {}

		Memory.seasonTradeInfo = Memory.seasonTradeInfo || {}


		Memory.friendInfo = Memory.friendInfo || {}

		// iterated through them all. Collate a bit.
		if (Memory.season2 && Game.time % (period * workingList.length) == workingList.length) {
			Memory.allyRoomNames = []
			Memory.allyDecoders = []
			for (let allyName in Memory.allySymbols) {
				for (let roomName in Memory.allySymbols[allyName]) {
					Memory.allyRoomNames.push(roomName)
					Memory.allyDecoders.push(Memory.allySymbols[allyName][roomName])
				}
			}

			Memory.friendDecoders = []
			Memory.friendRoomNames = []
			for (let friendName in Memory.friendInfo) {
				for (let roomName in Memory.friendInfo[friendName]) {
					Memory.friendRoomNames.push(roomName)
					Memory.friendDecoders.push(Memory.friendInfo[friendName][roomName])
				}
			}

			Memory.modifiedOutgoingTradeLedger = _.cloneDeep(Memory.outgoingTradeLedger)

			for (let allyName of allyList) {
				for (let ledgerPlayer in Memory.allyOutgoingTradeLedger[allyName]) {
					Memory.modifiedOutgoingTradeLedger[ledgerPlayer] = Memory.modifiedOutgoingTradeLedger[ledgerPlayer] || {}
					for (let symbol in Memory.allyOutgoingTradeLedger[allyName][ledgerPlayer]) {
						Memory.modifiedOutgoingTradeLedger[ledgerPlayer][symbol] = Memory.modifiedOutgoingTradeLedger[ledgerPlayer][symbol] || 0

						Memory.modifiedOutgoingTradeLedger[ledgerPlayer][symbol] += Memory.allyOutgoingTradeLedger[allyName][ledgerPlayer][symbol]

					}
				}
			}
		}

		// Only work 5% of the time
		if (Game.time % (period * workingList.length) >= workingList.length) return

		let currentAllyName = workingList[Game.time % workingList.length];



		if (RawMemory.foreignSegment && RawMemory.foreignSegment.username == currentAllyName) {
			let allyRequests = JSON.parse(RawMemory.foreignSegment.data);

			console.log(currentAllyName, "segment read")

			Memory.allyResourceRequests[currentAllyName] = {}
			Memory.allyRoomsUnderAttack[currentAllyName] = []

			for (var request of allyRequests) {
				let priority = Math.max(0, Math.min(1, (request.priority || 0)));
				let roomName;
				switch (request.requestType) {
					case requestTypes.ATTACK:
						if (!allyList.includes(currentAllyName)) {
							continue
						}
						roomName = request.roomName;
						console.log("Attack help requested!", request.roomName, priority)

						Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT][roomName] = Game.time

						break;
					case requestTypes.DEFENSE:				
						if (!allyList.includes(currentAllyName)) {
							continue
						}

						roomName = request.roomName;
						console.log("Defense help requested!", request.roomName, priority)

						// Send some energy or whatever
						if (roomName) {
							Memory.allyRoomsUnderAttack[currentAllyName].push(roomName)
							if (Memory.season2) {
								combatManager.requestHeavyRoomHold(request.roomName, Math.max(0, Math.min(3, (request.priority || 0))));
							}
							else {
								combatManager.requestHeavyRoomHold(request.roomName, priority)
							}
						}

						break;
					case requestTypes.RESOURCE:
						if (!allyList.includes(currentAllyName)) {
							continue
						}

						roomName = request.roomName;
						let resourceType = request.resourceType;
						let maxAmount = request.maxAmount;

						if (Game.time % 137 == 0) {
							console.log("Resource requested!", request.roomName, resourceType, maxAmount, priority)
						}

						priority = Math.max(0, Math.min(1, priority))

						let lowerELimit = 350000 - priority * 200000
						let lowerRLimit = 24000 - priority * 12000

						// Send some resources or whatever
						if (!Memory.season2) {							
							if (resourceType == RESOURCE_ENERGY) {
								for (let room of Game.myRooms) {
									if (!room.storage || !room.terminal || room.effectiveLevel < 6) continue

									let e = (room.storage.store[RESOURCE_ENERGY] || 0) + (room.terminal.store[RESOURCE_ENERGY] || 0);

									if (e > lowerELimit) {
										let sendAmount = Math.min((room.terminal.store[RESOURCE_ENERGY] || 0), maxAmount, e - lowerELimit);
										if (sendAmount >= 1000) {
											room.terminal.send(RESOURCE_ENERGY, sendAmount, roomName);
											console.log(room.name, "sending", sendAmount, resourceType, "to", request.roomName)
											break;
										}
									}
								}
							}
							else {
								for (let room of Game.myRooms) {
									if (!room.storage || !room.terminal || room.effectiveLevel < 6) continue

									let amount = (room.storage.store[resourceType] || 0) + (room.terminal.store[resourceType] || 0);

									if (amount > lowerRLimit) {
										let sendAmount = Math.min((room.terminal.store[resourceType] || 0), maxAmount, amount - lowerRLimit);
										if (sendAmount >= 1000) {
											room.terminal.send(resourceType, sendAmount, roomName);
											console.log(room.name, "sending", sendAmount, resourceType, "to", request.roomName)
											break;
										}
									}
								}
							}
						}
						else {
							if (resourceType != RESOURCE_ENERGY) {
								let theirAmount = Math.max(0, Object.keys(Memory.allySymbols[currentAllyName]).length * 6000 * (0.5 - priority) * 2)
								let myAmount = Memory.stats.globalResources[resourceType]

								let targetAmount = Game.myRooms.length * 6000
								if (priority > 0.5 || resourceType == "XZH2O" || resourceType == "KH") {
									targetAmount = 0
									Memory.allyResourceRequests[currentAllyName][resourceType] = maxAmount
									continue
								}

								if ((myAmount > 2 * theirAmount || priority > 0.5 || resourceType == "XZH2O" || resourceType == "KH") && myAmount > targetAmount) {
									Memory.allyResourceRequests[currentAllyName][resourceType] = Math.min(maxAmount, myAmount - 1.5 * theirAmount)
								}


								console.log(currentAllyName, "requests", resourceType, theirAmount, myAmount, priority)
							}
							else {
								if (Memory.terminalNetworkFreeEnergy / Game.myRooms.length - 100000 * priority >= 0) {
									Memory.allyResourceRequests[currentAllyName][resourceType] = Memory.terminalNetworkFreeEnergy / Game.myRooms.length - 100000 * priority
								}
								
							}
						}
						
						break;
					case requestTypes.REMOTE_DEF:
						console.log("Remote def requested!", currentAllyName, request.roomName, priority)

						break;
					case requestTypes.HATE:
						if (!allyList.includes(currentAllyName)) {
							continue
						}

						let playerName = request.playerName;
						console.log("Hate requested!", request.playerName, priority)

						// if (Memory.stats.hateCounter[playerName]) {
						// 	Memory.stats.hateCounter[playerName] = Math.max(Memory.stats.hateCounter[playerName], 1e9)
						// }

						break;
					case requestTypes.SEASON_INFO:
						// if (Math.random() < 0.05) console.log(currentAllyName, "has symbols", JSON.stringify(request.symbols))
						if (allyList.includes(currentAllyName)) {
							Memory.allySymbols[currentAllyName] = {}
							Memory.allySymbolAmount[currentAllyName] = {}
							Memory.allyScore[currentAllyName] = {}
							Memory.allyHaulerTargets[currentAllyName] = {}
							Memory.allyDropsPlanned[currentAllyName] = {}
							Memory.allyOutgoingTradeLedger[currentAllyName] = {}
						}
						else {
							Memory.friendInfo[currentAllyName] = {}
						}

						if (JSON.stringify(request).length < 30000) {		
							console.log("Has", Object.keys(request.symbols).length, "symbol keys")
							if (allyList.includes(currentAllyName)) {
								Memory.allyScore[currentAllyName] = request.currentScore
								// Not sure I need Ojbect.assign, but it's here now
								Memory.allyHaulerTargets[currentAllyName] = Object.assign(Memory.allyHaulerTargets[currentAllyName], request.haulerTargets || {})
								Memory.allyDropsPlanned[currentAllyName] = Object.assign(Memory.allyDropsPlanned[currentAllyName], request.dropsPlanned || {})

								Memory.allyOutgoingTradeLedger[currentAllyName] = request.outgoingTradeLedger

								console.log("request.haulerTargets", JSON.stringify(request.haulerTargets))
								console.log("request.dropsPlanned", JSON.stringify(request.dropsPlanned))
							}
							for (let roomName in request.symbols) {
								if (allyList.includes(currentAllyName)) {
									Memory.allySymbols[currentAllyName][roomName] = request.symbols[roomName]
									Memory.allySymbolAmount[currentAllyName][roomName] = request.symbolAmount[roomName]
								}
								else {
									Memory.friendInfo[currentAllyName][roomName] = request.symbols[roomName]
								}
							}
						}
						else {
							console.log("Long request from", currentAllyName, JSON.stringify(request).length)
						}


						// Memory.allyDecoders = request.symbols

						break;
					case requestTypes.SEASON_SCORE:
						break						
					case requestTypes.SEASON_TRADE:
						console.log("Season trade info", JSON.stringify(request))
						Memory.seasonTradeInfo[currentAllyName] = {}
						Memory.seasonTradeInfo[currentAllyName].roomName = request.roomName
						Memory.seasonTradeInfo[currentAllyName].buy = request.buy
						Memory.seasonTradeInfo[currentAllyName].sell = request.sell

						break						
					default:

						if (request.symbols && JSON.stringify(request.symbols).length < 100000) {
							if (allyList.includes(currentAllyName)) {
								Memory.allySymbols[currentAllyName] = {}
							}
							else {
								Memory.friendInfo[currentAllyName] = {}
							}
							console.log("Has", Object.keys(request.symbols).length, "keys")
							for (let roomName in request.symbols) {
								if (allyList.includes(currentAllyName)) {
									Memory.allySymbols[currentAllyName][roomName] = request.symbols[roomName]
								}
								else {
									Memory.friendInfo[currentAllyName][roomName] = request.symbols[roomName]
								}
							}
						}
						else {
							console.log("unknown request")
						}



						break;

				}
			}
		}
		else {
			// console.log("Simple allies either has no segment or has the wrong name?", currentAllyName)
		}
		
		let nextAllyName = workingList[(Game.time + 1) % workingList.length];
		// console.log(currentAllyName, nextAllyName, RawMemory.foreignSegment)


		RawMemory.setActiveForeignSegment(nextAllyName)
	},

	// Call before making any requests
	startOfTick() {
		if (!hasSetForeignSegment) {
			RawMemory.setDefaultPublicSegment(segmentID)
			hasSetForeignSegment = true
		}

		requestArray = []
		if (global.roomAssaultCounts) {			
			for (let roomName of Object.keys(global.roomAssaultCounts)) {
				if (Game.rooms[roomName]) {					
					let request = {requestType: requestTypes.ATTACK, roomName: roomName, playerName: Memory.rooms[roomName].owner, priority: 0.5}
					requestArray.push(request)
				}
			}
		}

		for (let playerName in Memory.stats.hateCounter) {
			let hatePercent = intelAI.getHatePercentage(playerName)
			let request = {requestType: requestTypes.HATE, playerName: playerName, priority: hatePercent}
			requestArray.push(request)
		}


	    // requestArray.push({
	    //   code: "Game.flags.camping_2.setPosition(new RoomPosition(25,20,\"E8N3\"))",
	    //   player: "Devnix",
	    //   requestType: requestTypes.EXECUTE
	    // });
	},

	// Call after making all your requests
	endOfTick() {
		if (!Memory.requestedSegments[9] && Object.keys(RawMemory.segments).length < 10) {			
			
			let myDecoders = {}
			let symbolAmount = {}
			Memory.dropsPlanned = Memory.dropsPlanned || {}
			Memory.outgoingTradeLedger = Memory.outgoingTradeLedger || {}
			Memory.incomingTradeLedger = Memory.incomingTradeLedger || {}
			Memory.myDecoders = []

			for (let room of Game.myRooms) {
				myDecoders[room.name] = room.mem.decoderType
				if (room.controller.level == 8) {
					if (room.mem.closeRamparts) {
						symbolAmount[room.name] = 0
					}
					else {					
						symbolAmount[room.name] = (room.getCurrentOfResource(room.mem.decoderType) + Memory.stats.globalResources[room.mem.decoderType]) / 2
						for (let playerName in Memory.incomingTradeLedger) {
							symbolAmount[room.name] -= Math.max(0, (Memory.incomingTradeLedger[playerName][room.mem.decoderType] || 0))
						}
					}
					
				}
				Memory.myDecoders.push(room.mem.decoderType)
			}

			global.inTickObject.allSeasonFetchers = global.inTickObject.allSeasonFetchers || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'seasonFetcher'))

			let haulerTargets = {}
			for (let seasonFetcher of global.inTickObject.allSeasonFetchers) {
				if (seasonFetcher.mem.fT) {
					haulerTargets[seasonFetcher.mem.fT] = (haulerTargets[seasonFetcher.mem.fT] || 0) + seasonFetcher.store.getCapacity();
				}
			}

			requestArray.push({
				requestType: requestTypes.SEASON_INFO,
				symbols: myDecoders,
				symbolAmount: symbolAmount,
				currentScore: Game.symbols,
				haulerTargets: haulerTargets,
				dropsPlanned: Memory.dropsPlanned,
				outgoingTradeLedger: Memory.outgoingTradeLedger,
				incomingTradeLedger: Memory.incomingTradeLedger,
				ratio: Memory.TARGET_SCORE_RATIO - 0.001
			});

			// console.log(JSON.stringify(requestArray[requestArray.length - 1]))

	        requestArray.push({
	            symbols: Game.symbols,
	            requestType: requestTypes.SEASON_SCORE
	        });

			if (Game.time % 1500 == 733 || !Memory.tradeSell || !Memory.tradeBuy) {
				let tradeSell = []

				let orderedSymbols = util.getSeasonOrderedSymbols()
				let tradeBuy = [orderedSymbols[orderedSymbols.length - 1], orderedSymbols[orderedSymbols.length - 2], orderedSymbols[orderedSymbols.length - 3], orderedSymbols[orderedSymbols.length - 4], orderedSymbols[orderedSymbols.length - 5]]

				for (let i = 0; i < 5; i++) {
					if (Game.rooms["W6N18"].hasAtLeastXOfResource(orderedSymbols[i], 10000)) {
						tradeSell.push(orderedSymbols[i])
					}
				}

				Memory.tradeSell = tradeSell
				Memory.tradeBuy = tradeBuy
			}

			requestArray.push({
				roomName: "W6N18",
				buy: Memory.tradeBuy,
				sell: Memory.tradeSell,
				requestType: 8
			});

			for (let room of Game.myRooms) {
				if (!global.defenseRooms[room.name]) continue
				for (let defenseRoom of global.defenseRooms[room.name]) {
					if ((Game.rooms[defenseRoom] && Game.rooms[defenseRoom].dangerous == 2) || (Memory.rooms[defenseRoom] && Memory.rooms[defenseRoom].DT > 1.2)) {
						let request = {requestType: requestTypes.REMOTE_DEF, roomName: defenseRoom, priority: 0.5}

						requestArray.push(request)
					}
				}
			}
			for (let room of Game.myRooms) {
				if (room.memory.attackScore) {
					let priority = Math.max(0, Math.min(1, Math.sqrt(room.memory.attackScore / 3e6)))
					if (!priority) continue

					let request = {requestType: requestTypes.DEFENSE, roomName: room.name, priority: priority}
					requestArray.push(request)
				}
			}

			// Send help, even if not asked for
			// if (Math.random() < 0.01) {
			// 	for (let roomName in Memory.rooms) {
			// 		if (!Memory.rooms[roomName].owner || Memory.rooms[roomName].owner == "Invader") continue
			// 		if (Memory.rooms[roomName].twrX && Memory.rooms[roomName].twrX.length) continue
			// 		if (!global.whiteList.includes(Memory.rooms[roomName].owner)) continue
			// 		if ((Memory.rooms[roomName].safeMode || 0) > 100) continue

			// 		combatManager.requestHeavyRoomHold(roomName)
			// 	}
			// }


			RawMemory.segments[segmentID] = JSON.stringify(requestArray)

			// console.log("Set pub segment", segmentID)

			// If you're already setting public segements somewhere this will overwrite that. You should
			// fix that yourself because I can't fix it for you.
			RawMemory.setPublicSegments([segmentID]);
		}
	},

	requestAttack(roomName, priority) {
	},

	requestHelp(roomName, priority) {
		let request = {requestType: requestTypes.DEFENSE, roomName: roomName, priority: (priority === undefined ? 0 : priority)}

		requestArray.push(request)
	},

    requestRemoteDefence(roomName, priority) {
    },

	requestResource(roomName, resourceType, maxAmount, priority) {
		if (maxAmount > 0) {
			let request = {requestType: requestTypes.RESOURCE, resourceType: resourceType, maxAmount: maxAmount, roomName: roomName, priority: (priority === undefined ? 0 : priority)}

			if (Game.time % 1000 == 0) {
				console.log(roomName, "requesting", resourceType, "max amount", maxAmount, "priority", priority)
			}

			requestArray.push(request)
		}
	},
};

module.exports = simpleAllies;