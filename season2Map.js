"use strict";

const util = require('util');
// const safeRoute = require('safeRoute');
const constants = require('constants');

let safeRoute

var season2Map = {
	init : function(safeRoute_) {
		safeRoute = safeRoute_
	},


	tick : function() {
		if (!Memory.season2) {
			console.log("Ticking season 2 not in season 2?")
			return
		}
		if (Math.random() < 0.01 || !Memory.season2WallGaps) {
			Memory.season2WallGaps = []
			for (let roomName in Memory.rooms) {
				let coords = util.getSectorCoords(roomName)
				let mem = Memory.rooms[roomName];
				let sector0
				let sector1


				if (coords.x == 0 && coords.y == 0) {
					if (!mem.seasonWalkable) continue


					if (mem.seasonWalkable[0]) {
						sector0 = util.getCentreRoomForRoomPos(new RoomPosition(1, 1, roomName))
						sector1 = util.getCentreRoomForRoomPos(new RoomPosition(48, 1, roomName))
						if (!Memory.openSectors.includes(sector0)) {
							Memory.openSectors.push(sector0)
						}
						if (!Memory.openSectors.includes(sector1)) {
							Memory.openSectors.push(sector1)
						}

						Memory.season2WallGaps.push({roomName: roomName, sector0: sector0, sector1: sector1})
					}
					if (mem.seasonWalkable[1]) {
						sector0 = util.getCentreRoomForRoomPos(new RoomPosition(48, 1, roomName))
						sector1 = util.getCentreRoomForRoomPos(new RoomPosition(48, 48, roomName))
						if (!Memory.openSectors.includes(sector0)) {
							Memory.openSectors.push(sector0)
						}
						if (!Memory.openSectors.includes(sector1)) {
							Memory.openSectors.push(sector1)
						}

						Memory.season2WallGaps.push({roomName: roomName, sector0: sector0, sector1: sector1})
					}
					if (mem.seasonWalkable[2]) {
						sector0 = util.getCentreRoomForRoomPos(new RoomPosition(48, 48, roomName))
						sector1 = util.getCentreRoomForRoomPos(new RoomPosition(1, 48, roomName))
						if (!Memory.openSectors.includes(sector0)) {
							Memory.openSectors.push(sector0)
						}
						if (!Memory.openSectors.includes(sector1)) {
							Memory.openSectors.push(sector1)
						}

						Memory.season2WallGaps.push({roomName: roomName, sector0: sector0, sector1: sector1})
					}
					if (mem.seasonWalkable[3]) {
						sector0 = util.getCentreRoomForRoomPos(new RoomPosition(1, 48, roomName))
						sector1 = util.getCentreRoomForRoomPos(new RoomPosition(1, 1, roomName))
						if (!Memory.openSectors.includes(sector0)) {
							Memory.openSectors.push(sector0)
						}
						if (!Memory.openSectors.includes(sector1)) {
							Memory.openSectors.push(sector1)
						}

						Memory.season2WallGaps.push({roomName: roomName, sector0: sector0, sector1: sector1})
					}
					continue

				}

				if (coords.x != 0 && coords.y != 0) continue
				if (coords.x == 0 && coords.y == 0) continue


				if (mem.seasonWallsToRemove === undefined) continue
				if (!util.isRoomAccessible(roomName)) continue

				if (mem.seasonWallsToRemove.length == 0) {
					if (coords.x == 0) {
						sector0 = util.getCentreRoomForRoomPos(new RoomPosition(1, 25, roomName))
						sector1 = util.getCentreRoomForRoomPos(new RoomPosition(48, 25, roomName))
					}
					else {
						sector0 = util.getCentreRoomForRoomPos(new RoomPosition(25, 1, roomName))
						sector1 = util.getCentreRoomForRoomPos(new RoomPosition(25, 48, roomName))
					}

					if (!Memory.openSectors.includes(sector0)) {
						Memory.openSectors.push(sector0)
					}
					if (!Memory.openSectors.includes(sector1)) {
						Memory.openSectors.push(sector1)
					}

					Memory.season2WallGaps.push({roomName: roomName, sector0: sector0, sector1: sector1})
				}
			}
		}
	},



	getNextSector : function(fromPos, toPos, debug = false) {
		let currentSector = util.getCentreRoomForRoomPos(fromPos)
		let targetSector = util.getCentreRoomForRoomPos(toPos)

		if (currentSector == targetSector) {
			return;
		}

		// let route = safeRoute.findSafeRoute(fromPos.roomName, toPos.roomName)

		let rangeMap = {[currentSector]: 1}
		let parentMap = {[currentSector]: null}
		let queue = [currentSector]

		while (queue.length) {
			let loopSector = queue.shift();

			for (let gap of Memory.season2WallGaps) {
				let newSector
				let cost
				if (gap.sector0 == loopSector) {
					newSector = gap.sector1
					if (gap.sector0 == currentSector) {
						cost = safeRoute.getSafeRouteCost(fromPos.roomName, gap.roomName, false, true)
					}
					else {
						cost = 100
					}
				}
				else if (gap.sector1 == loopSector) {
					newSector = gap.sector0
					if (gap.sector1 == currentSector) {
						cost = safeRoute.getSafeRouteCost(fromPos.roomName, gap.roomName, false, true)
					}
					else {
						cost = 100
					}
				}
				else {
					continue
				}


				if ((rangeMap[newSector] || Infinity) > rangeMap[loopSector] + cost) {
					rangeMap[newSector] = rangeMap[loopSector] + cost
					parentMap[newSector] = {sector: loopSector, gap}
					queue.push(newSector)
				}
			}
			// We could exit here if we'd reached the target sector as this is a BFS.
		}

		if (!rangeMap[targetSector]) {
			// console.log("Target sector should be inaccessible?", fromPos, toPos)
			return
		}

		let found = false;
		let path = [targetSector]

		if (debug) {
			console.log(JSON.stringify(rangeMap))
			console.log(JSON.stringify(parentMap))
		}

		let pathCost = 0
		let lastRoom = toPos.roomName

		while (true) {
			let obj = parentMap[path[path.length - 1]]
			let nextSector = obj.sector

			if (!lastRoom.includes("--") && !obj.gap.roomName.includes("--")) {
				pathCost += Game.map.getRoomLinearDistance(lastRoom, obj.gap.roomName)
			}

			lastRoom = obj.gap.roomName

			if (nextSector == currentSector) {
				break
			}

			path.push(nextSector)
		}

		pathCost += Game.map.getRoomLinearDistance(fromPos.roomName, lastRoom)


		/*while (!found) {
			let loopSector = path[path.length - 1]

			let minScore = Infinity
			let bestRoom

			for (let gap of Memory.season2WallGaps) {
				let newSector
				if (gap.sector0 == loopSector) {
					newSector = gap.sector1
				}
				else if (gap.sector1 == loopSector) {
					newSector = gap.sector0
				}
				else {
					continue
				}

				if (rangeMap[newSector] < minScore) {
					minScore = rangeMap[newSector]
					bestRoom = newSector
					if (newSector == currentSector) {
						found = true;
						break
					}
				}
				// if (rangeMap[newSector] == rangeMap[loopSector] - 1) {
				// 	if (newSector == currentSector) {
				// 		found = true;
				// 	}
				// 	else {
				// 		path.push(newSector)
				// 	}
				// 	break
				// }
			}
			if (found) {
				break
			}
			path.push(bestRoom)

		}*/

		while (path.length && path[path.length - 1].includes("--")) {
			path.pop()
		}


		if (path[path.length - 1] != currentSector) {
			return {nextSector: path[path.length - 1], pathCost}
		}
	}
}

module.exports = season2Map;