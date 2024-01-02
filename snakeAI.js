"use strict";

var util = require('util');
const moveResolver = require("moveResolver")

function getBestCombatParts(creeps, force) {
	let bestCreep
	let bestParts = -1;

	for (let creep of creeps) {
		let parts = creep.getNumOfBodyPart(RANGED_ATTACK) + 3 * creep.getNumOfBodyPart(ATTACK)

		if (creep.assaultSnake) {
			parts += 5 * creep.getNumOfBodyPart(WORK)
		}

		if (parts > bestParts) {
			bestParts = parts
			bestCreep = creep
		}
	}
	return bestCreep;
}

function getBestHealParts(creeps, force) {
	let bestCreep
	let bestParts = -1;

	for (let creep of creeps) {
		if (creep.mem.forceLast && !force && creeps.length) {
			continue
		}

		let parts = creep.getNumOfBodyPart(HEAL)

		if (parts > bestParts) {
			bestParts = parts
			bestCreep = creep
		}
	}
	return bestCreep;
}

function getOrder(_creeps, assaultSnake) {
	let order = [];

	// Consistent
	let creeps = _.sortBy(_creeps, "id");

	let noMoveList = [];

	for (let creep of _creeps) {
		if (!creep.powerCreep && creep.renew) {
			_.pull(creeps, creep)
		}
	}

	// Power creeps go first. They don't need the ordering.
	for (let creep of _creeps) {
		if (creep.powers) {
			order.push(creep)
			_.pull(creeps, creep)
		}
		// Pull out creeps with no move
		else if (creep.mem.alwaysPulled || !creep.hasBodypart(MOVE)) {
			noMoveList.push(creep);
			_.pull(creeps, creep)	
		}
	}

	// Moons go next.
	if (!assaultSnake) {		
		for (let creep of _.clone(creeps)) {
			if (creep.moon && !creep.assaultSnake) {
				order.push(creep)
				_.pull(creeps, creep)
			}
		}
	}

	let i = 0;

	while(creeps.length) {
		let nextCreep
		if (i % 2 == 0) nextCreep = getBestCombatParts(creeps);
		else			nextCreep = getBestHealParts(creeps);
		if (!nextCreep) {
			if (i % 2 == 0) nextCreep = getBestCombatParts(creeps, true);
			else			nextCreep = getBestHealParts(creeps, true);
		}
		order.push(nextCreep);
		_.pull(creeps, nextCreep);
		i++
	}

	for (let creep of noMoveList) {
		order.push(creep)
	}

	return order;

}

var snakeAI = {
	movePowerCreepSnake(creepNames, targetPos, moveOptions, targetRange, assaultSnake, withdraw) {
		moveOptions = moveOptions || {};
		moveOptions.powerCreepSnake = 1;
		moveOptions.ignoreKeepers = 1;
		return this.moveSnake(creepNames, targetPos, moveOptions, targetRange, assaultSnake, withdraw);

	},

	moveSnake(creepNames, targetPos, moveOptions, targetRange, assaultSnake, withdraw) {
		let a = Game.cpu.getUsed();

		// let aliveCreeps = 0
		let creeps = [];
		for (let creepName of creepNames) {
			if (Game.powerCreeps[creepName]) {
				creeps.push(Game.powerCreeps[creepName])
				// aliveCreeps++;
			}
			if (Game.creeps[creepName]) {
				if (!Game.creeps[creepName].ignoreSnake) {
					creeps.push(Game.creeps[creepName])
				}
				else if (creeps[0] && !Game.creeps[creepName].renew && !Game.creeps[creepName].getBoosts()) {
					let roomDist = Game.map.getRoomLinearDistance(Game.creeps[creepName].room.name, creeps[0].room.name);

					if (roomDist > 1) {
						let pos = new RoomPosition(25, 25, creeps[0].room.name)
						Game.creeps[creepName].uncachedMoveTo(pos, 22, moveOptions)
					}
					else {
						Game.creeps[creepName].uncachedMoveTo(creeps[0], 1, moveOptions)
					}
				}
			}
		}

		if (targetRange === undefined) {
			console.log("Snake target range undefeind, default to zero")
			targetRange = targetRange || 0
		}

		// console.log(creeps)

		if (creeps.length == 1) {
			creeps[0].moveOrdersGiven = true
			creeps[0].uncachedMoveTo(targetPos, targetRange, moveOptions)
			return
		}


		let orderedCreeps = getOrder(creeps, assaultSnake);

		if (!orderedCreeps.length) {
			return
		}

		let totalHeal = 0
		for (let creep of orderedCreeps) {
			totalHeal += creep.getBoostModifiedHeal()
		}

		// More than enough
		if (totalHeal >= 20) {
			moveOptions.ignoreKeepers = 1
		}

		if (Memory.debugSnake) {
			for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
				let creep = orderedCreeps[creepIdx];
				let nextCreep = orderedCreeps[creepIdx + 1]

				creep.room.visual.text(creepIdx, creep.pos)

				if (nextCreep) {
					creep.room.visual.line(creep.pos, nextCreep.pos)					
				}
			}
		}

		// Private servers suck
		if (Memory.privateServer) {
			for (let creep of orderedCreeps) {
				for (let otherCreep of orderedCreeps) {
					// ffuuuu
					if (creep != otherCreep && creep.pos.isEqualToPos(otherCreep.pos)) {
						if (creep.pos.x == 0) {
							creep.move(RIGHT)
						}
						else if (creep.pos.y == 0) {
							creep.move(BOTTOM)
						}
						else if (creep.pos.x == 49) {
							creep.move(LEFT)
						}
						else if (creep.pos.y == 49) {
							creep.move(TOP)
						}

						console.log("TWO SNAKE CREEPS ON SAME TILE!!!!", creep.pos)
						return
					}
				}
			}
		}



		if (withdraw) {
			orderedCreeps.reverse();
		}

		let areFormed = 1;
		let needBoosts = 0;
		let spawning = 0;
		let alreadyMoved = 0;
		let anyInsR = 0;
		let anyNotInsR = 0;
		let numOnEdge = 0;
		let numOnPortal = 0;

		let creepRooms = {}

		for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
			let creep = orderedCreeps[creepIdx];

			if (creep.getBoosts()) {
				needBoosts = 1;
				creep.moveOrdersGiven = true
			}
			if (creep.spawning) {
				spawning = 1;
			}
			if (creep.moveOrdersGiven) {
				alreadyMoved = 1;
			}
			creepRooms[creep.room.name] = 1

			if (creep.room.name == (creep.memory.sR || creep.memory.homeRoom) && !creep.room.dangerous) {
				anyInsR = 1;
			}
			else {
				anyNotInsR = 1;
			}
			if (util.isEdgeOfRoom(creep.pos)) {
				numOnEdge++;
			}
			if (creep.room.centreRoom) {
				let structs = creep.pos.lookFor(LOOK_STRUCTURES);
				for (let struct of structs) {
					if (struct.structureType == STRUCTURE_PORTAL) {
						numOnPortal++;
						creep.onPortal = 1;
						break;
					}
				}
			}
		}

		// These can go wrong.
		if (numOnEdge || Object.keys(creepRooms).length) {
			delete moveOptions.avoidCombatEdges;
			if (moveOptions.maxRooms) {
				moveOptions.maxRooms = Math.max(moveOptions.maxRooms, 2)
			}
		}

		let hasPullFunction = true;
		let anyCantMove = false


		for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
			let creep = orderedCreeps[creepIdx];
			if (creep.mem.alwaysPulled || !creep.hasBodypart(MOVE)) {
				anyCantMove = true
				break
			}
		}

		if (anyCantMove) {
			for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
				let creep = orderedCreeps[creepIdx];
				if (creep.mem.nextMoveDir) {
					creep.move(creep.mem.nextMoveDir)
					delete creep.mem.nextMoveDir
					return
				}
			}
		}

		for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
			let creep = orderedCreeps[creepIdx];
			let range = anyCantMove ? 1 : (anyInsR ? 3 : 1);
			// Power creeps
			if (!creep.pull) hasPullFunction = false;

			if (creepIdx != 0) {
				let parentCreep = orderedCreeps[creepIdx - 1]
				if (!creep.pos.inRangeToPos(parentCreep.pos, (numOnEdge > 1 && !anyCantMove ? 1 : 0) + range) && (parentCreep.room.name == creep.room.name || !util.isNearEdgeOfRoom(parentCreep.pos, (numOnEdge > 1 && !anyCantMove ? 1 : 0) + range))) {
					// console.log("A", creep.pos, parentCreep.pos)
					areFormed = 0;
					break;
				}
				if (creep.pos.getWorldRangeToPos(parentCreep.pos) > (anyCantMove ? 0 : 2) + range) {
					// console.log("B")
					areFormed = 0;
					break;
				}
			}

			if (creepIdx != orderedCreeps.length - 1) {
				let childCreep = orderedCreeps[creepIdx + 1]
				if (!creep.pos.inRangeToPos(childCreep.pos, (numOnEdge > 1 && !anyCantMove ? 1 : 0) + range) && (childCreep.room.name == creep.room.name || !util.isNearEdgeOfRoom(childCreep.pos, (numOnEdge > 1 && !anyCantMove ? 1 : 0) + range))) {
					// console.log("C")
					areFormed = 0;
					break;
				}
				if (creep.pos.getWorldRangeToPos(childCreep.pos) > (anyCantMove ? 0 : 2) + range) {
					// console.log("D")
					areFormed = 0;
					break;
				}
			}
		}

		if (!areFormed && moveOptions.flee) {
			delete moveOptions.flee
		}

		// if (orderedCreeps[0].name == "t590_9473") console.log(orderedCreeps[0].pos, needBoosts, alreadyMoved, targetPos, areFormed);

		if ((needBoosts || alreadyMoved || spawning) && !anyCantMove) {
			delete moveOptions.flee
			for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
				let creep = orderedCreeps[creepIdx];
				// if (!creep.gettingBoosts && !creep.mem.haveSnaked && !creep.moveOrdersGiven) {
				if (!creep.gettingBoosts && !creep.mem.haveSnaked && !creep.moveOrdersGiven) {
					creep.moveOrdersGiven = true
					// if (!creep.movedThisTick) {						
						if (creep.powerCreepHealer && Game.getObjectById(creep.mem.powerCreep)) {
							let pc = Game.getObjectById(creep.mem.powerCreep);

							// Go out to meet
							let roomDist = Game.map.getRoomLinearDistance(creep.room.name, pc.room.name);

							if (roomDist > 1) {
								let pos = new RoomPosition(25, 25, pc.room.name)
								creep.uncachedMoveTo(pos, 22, moveOptions)
							}
							else {
								creep.uncachedMoveTo(pc, 1, moveOptions)
							}

							// creep.uncachedMoveTo(Game.getObjectById(creep.mem.powerCreep), 1, moveOptions);
						}
						else {
							let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR || creep.mem.homeRoom;

							// We're not boosting. Get out of the boost area.
							creep.uncachedMoveTo(new RoomPosition(Memory.rooms[fallbackRoom].fallbackX || 25,
																  Memory.rooms[fallbackRoom].fallbackY || 25,
																  fallbackRoom),
																  1,
																  moveOptions);
						}
					// }
				}
			}
		}
		else {

			if (!areFormed) {
				if (moveOptions.maxRooms == 1) {
					moveOptions.maxRooms = 2
				}
				delete moveOptions.avoidCombatEdges
				delete moveOptions.flee
				if (orderedCreeps[0].mem.haveSnaked) {

					if (Math.random() < 0.2 || (orderedCreeps[0].mem.altReformMode && Math.random() < 0.5)) {
						let disableAltReform = false;
						for (let roomName in creepRooms) {
							for (let otherRoomName in creepRooms) {
								if (Game.map.getRoomLinearDistance(roomName, otherRoomName) > 1) {
									disableAltReform = true
									break
								}
							}
						}
						orderedCreeps[0].mem.altReformMode = !disableAltReform && !(orderedCreeps[0].mem.altReformMode || 0)
					}
				}
				for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
					let creep = orderedCreeps[creepIdx];
					creep.mem.lastSnakePos = creep.pos;
					// creep.moveOrdersGiven = true

					if (creep.fatigue) {
						continue
					}


					// Hit a portal
					if (orderedCreeps[0].room.centreRoom && creep.room.centreRoom && orderedCreeps[0].room.name != creep.room.name) {
						// console.log("A", creep)
						creep.uncachedMoveTo(creep.pos.findClosestByRange(creep.room.portals), 0, moveOptions);
					}
					else {
						let fallbackPos 
						if (Memory.rooms[(creep.mem.sR || creep.mem.homeRoom)]) {
						 	fallbackPos = new RoomPosition(Memory.rooms[(creep.mem.sR || creep.mem.homeRoom)].fallbackX || 25, 
														   Memory.rooms[(creep.mem.sR || creep.mem.homeRoom)].fallbackY || 25, 
														   (creep.mem.sR || creep.mem.homeRoom))
						}
						else {
							// Fuck it
							console.log("Using weird fallback pos")
						 	fallbackPos = new RoomPosition(Memory.rooms[targetPos.roomName].fallbackX || 25, 
														   Memory.rooms[targetPos.roomName].fallbackY || 25, 
														   targetPos.roomName)

						}

						if (creep.powerCreepHealer && !creep.room.centreRoom && Game.map.getRoomLinearDistance(creep.room.name, orderedCreeps[0].room.name) > 1) {
							// console.log("B", creep)

							// Go out to meet
							creep.uncachedMoveTo(new RoomPosition(25, 25, orderedCreeps[0].room.name), 20, moveOptions);
							creep.say("PC20")
							// creep.uncachedMoveTo(orderedCreeps[0], 1, moveOptions);
						}
						// Move the middle ones to the fallback pos. Everybody else should go toward them.
						else if (!creep.mem.haveSnaked &&
							(creepIdx == Math.floor(orderedCreeps.length / 2) || creepIdx == Math.ceil(orderedCreeps.length / 2)) &&
							(creep.room.name == (creep.memory.sR || creep.memory.homeRoom) || (creep.room.controller && creep.room.controller.my)) &&
							creep.room.name == creeps[0].room.name &&
							!creep.pos.isEqualToPos(fallbackPos)) {
							// console.log("C", creep)
							// creep.uncachedMoveTo(fallbackPos, 0, moveOptions);

							if (orderedCreeps[creepIdx - 1] && Math.random() < 0.5) {
								creep.uncachedMoveTo(orderedCreeps[creepIdx - 1], 0, moveOptions);
								if (Memory.debugSnake) {
									creep.say("NF21a")
								}
							}
							else if (orderedCreeps[creepIdx + 1]) {
								creep.uncachedMoveTo(orderedCreeps[creepIdx + 1], 0, moveOptions);
								if (Memory.debugSnake) {
									creep.say("NF21b")
								}
							}
							else {
								creep.uncachedMoveTo(fallbackPos, 0, moveOptions);
								if (Memory.debugSnake) {
									creep.say("NF21c")
								}
							}



						}
						else if (creepIdx < orderedCreeps.length / 2) {
							if (creepIdx == 0 &&
								anyInsR &&
								anyNotInsR &&
								(creep.room.name == (creep.mem.sR || creep.mem.homeRoom) || (creep.room.controller && creep.room.controller.my)) &&
								util.isNearEdgeOfRoom(creep.pos, 3) &&
								!util.isEdgeOfRoom(creep.pos) &&
								creep.pos.getWorldRangeToPos(orderedCreeps[creepIdx + 1].pos) <= 5 &&
								orderedCreeps[creepIdx + 1].canSnakeMove()) {
								if (Memory.debugSnake) {
									creep.say("NF22")
								}

								// console.log("D", creep)
								continue;
							}
							else {
								// console.log("E", creep)
								if (creep.onPortal) {
									creep.uncachedMoveTo(targetPos, targetRange, moveOptions);
									if (Memory.debugSnake) {
										creep.say("NF23")
									}
								}
								else if (util.isEdgeOfRoom(creep.pos)) {
									if (creepIdx == 0) {
										if (Game.map.getRoomLinearDistance(creep.room.name, orderedCreeps[creepIdx + 1].room.name) > 1) {
											creep.uncachedMoveTo(orderedCreeps[creepIdx + 1], 1, moveOptions);
											if (Memory.debugSnake) {
												creep.say("NF24a")
											}
										}
										else {
											if (!orderedCreeps[creepIdx + 1].mem.alwaysPulled && orderedCreeps[creepIdx + 1].hasBodypart(MOVE)) {										
												creep.uncachedMoveTo(new RoomPosition(25, 25, creep.room.name), 20, moveOptions);
											}
											else if (numOnEdge == 2 && creep.pos.getWorldRangeToPos(orderedCreeps[creepIdx + 1].pos) > 1) {
												console.log(creep.pos)
												console.log(orderedCreeps[creepIdx + 1].pos)
												console.log(creep.pos.getWorldRangeToPos(orderedCreeps[creepIdx + 1].pos))
												console.log("NEW CASE IN SNAKE!!! NF24c")
												creep.say("NF24c")
											}
											if (Memory.debugSnake) {
												creep.say("NF24b")
											}
										}
										// if (!util.isEdgeOfRoom(orderedCreeps[creepIdx + 1])) {
										// }
										// else {
											// creep.uncachedMoveTo(orderedCreeps[creepIdx - 1], 1, moveOptions);	
										// }
									}
									else {
										if (Game.map.getRoomLinearDistance(creep.room.name, orderedCreeps[creepIdx - 1].room.name) > 1) {
											creep.uncachedMoveTo(new RoomPosition(25, 25, creep.room.name), 20, moveOptions);
											if (Memory.debugSnake) {
												creep.say("NF25")
											}
										}
										else {
											// If they're moving toward us don't move toward them
											// if (creep.pos.getRangeTo(orderedCreeps[creepIdx - 1]) > 2 || orderedCreeps[creepIdx - 1].fatigue) {
												creep.uncachedMoveTo(orderedCreeps[creepIdx - 1], 1, moveOptions);	
												if (Memory.debugSnake) {
													creep.say("NF26")
												}
											// }
										}
									}
								}
								// If the guy in front of me is on a portal in a different room, go to where he was last tick.
								else if (creepIdx > 0 && orderedCreeps[creepIdx - 1].onPortal && orderedCreeps[creepIdx - 1].room.name != creep.room.name && creep.room.centreRoom) {
									let forwardLastSnakePos = orderedCreeps[creepIdx - 1].mem.lastSnakePos;
									if (forwardLastSnakePos.roomName == creep.room.name) {
										creep.uncachedMoveTo(creep.pos.findClosestByRange(creep.room.portals), 0, moveOptions);
										if (Memory.debugSnake) {
											creep.say("NF27")
										}
										// console.log(creep, forwardLastSnakePos)
										// creep.move(creep.pos.getDirectionTo(new RoomPosition(forwardLastSnakePos.x, forwardLastSnakePos.y, forwardLastSnakePos.roomName)));
									}
									else {
										creep.uncachedMoveTo(targetPos, targetRange, moveOptions);
										if (Memory.debugSnake) {
											creep.say("NF28")
										}
									}
								}
								// If anybody is on a portal, leader just keeps on trucking
								else if (creepIdx == 0 && numOnPortal > 0) {
									creep.uncachedMoveTo(targetPos, targetRange, moveOptions);
									if (Memory.debugSnake) {
										creep.say("NF29")
									}
								}
								else {
									if (orderedCreeps[0].mem.altReformMode && orderedCreeps[creepIdx + 1].canSnakeMove()) {
										creep.uncachedMoveTo(orderedCreeps[0], 0, moveOptions);
										if (Memory.debugSnake) {
											creep.say("NF210")
										}
									}
									else if (numOnPortal == 0) {
										// Issues with portals, I think.
										// if (Game.map.getRoomLinearDistance(creep.room.name, orderedCreeps[creepIdx + 1].room.name) > 1) {
										// 	creep.uncachedMoveTo(new RoomPosition(25, 25, orderedCreeps[creepIdx + 1].room.name), 20, moveOptions);
										// }
										// else {
										if (creepIdx == 0 && numOnEdge && orderedCreeps[creepIdx + 1].canSnakeMove()) {
											if (orderedCreeps[creepIdx + 1].canSnakeMove()) {
												// Don't step on to the edge
												let myMoveOptions
												if (creep.room.name == orderedCreeps[creepIdx + 1].room.name) {
													myMoveOptions = _.clone(moveOptions)
													myMoveOptions.avoidCombatEdges = 1;
													myMoveOptions.maxRooms = 1;
												}
												else {
													myMoveOptions = moveOptions
												}
												
												creep.uncachedMoveTo(orderedCreeps[creepIdx + 1], 2, myMoveOptions);
												if (Memory.debugSnake) {
													creep.say("NF211a")
												}
											}
											else {
												// Don't step on to the edge
												let myMoveOptions
												if (creep.room.name == orderedCreeps[creepIdx + 1].room.name) {
													myMoveOptions = _.clone(moveOptions)
													myMoveOptions.avoidCombatEdges = 1;
													myMoveOptions.maxRooms = 1;
												}
												else {
													myMoveOptions = moveOptions
												}

												creep.uncachedMoveTo(orderedCreeps[creepIdx + 1], 1, myMoveOptions);
												if (Memory.debugSnake) {
													creep.say("NF212")
												}
											}
										}
										else {
											// Don't step on to the edge
											let myMoveOptions
											let noMove = false
											if (creep.room.name == orderedCreeps[creepIdx + 1].room.name) {
												myMoveOptions = _.clone(moveOptions)
												myMoveOptions.avoidCombatEdges = 1;
												myMoveOptions.maxRooms = 1;
											}
											// else if (creep.pos.getWorldRangeToPos(orderedCreeps[creepIdx + 1].pos) <= 2 && util.isEdgeOfRoom(orderedCreeps[creepIdx + 1].pos)) {
											// 	noMove = true
											// }
											else {
												myMoveOptions = moveOptions
											}

											if (!noMove) {
												let range
												if (orderedCreeps[creepIdx + 1].room.name == orderedCreeps[creepIdx].room.name) {
													range = util.isEdgeOfRoom(orderedCreeps[creepIdx + 1].pos) ? 1 : 0
													creep.uncachedMoveTo(orderedCreeps[creepIdx + 1], range, myMoveOptions);
													if (Memory.debugSnake) {
														creep.say("NF212b" + range)
													}
												}
												else {
													range = 2;
												}

											}
										}
										// }	
										// Let them come to us
										// if (creep.pos.getRangeTo(orderedCreeps[creepIdx + 1]) > 1) {
										// }
									}
									else if (creepIdx != 0) {
										creep.uncachedMoveTo(orderedCreeps[creepIdx - 1], 0, moveOptions);
										if (Memory.debugSnake) {
											creep.say("NF213")
										}

									}
								}
							}
						}
						else  {
							if (orderedCreeps[0].mem.altReformMode) {
								moveOptions.avoidLocalCreeps = 1
								creep.uncachedMoveTo(orderedCreeps[0], 1, moveOptions);
								if (Memory.debugSnake) {
									creep.say("NF214")
								}
							}
							else {
								if (Game.map.getRoomLinearDistance(creep.room.name, orderedCreeps[creepIdx - 1].room.name) > 1) {
									creep.uncachedMoveTo(new RoomPosition(25, 25, orderedCreeps[creepIdx - 1].room.name), 20, moveOptions);
									if (Memory.debugSnake) {
										creep.say("NF215")
									}
								}
								else {
									creep.uncachedMoveTo(orderedCreeps[creepIdx - 1], 1, moveOptions);	
									if (Memory.debugSnake) {
										creep.say("NF216")
									}
								}
							}
							
						}
					}
				}
			}
			else {
				if (orderedCreeps[0].room.name == targetPos.roomName && !moveOptions.flee && orderedCreeps[0].pos.inRangeToPos(targetPos, targetRange)) {
					for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
						let creep = orderedCreeps[creepIdx];
						creep.moveOrdersGiven = true
						if (Memory.debugSnake) {
							creep.say("FA")
						}
						return;
					}
				}

				moveOptions.snaking = 1;

				let cantPull = !hasPullFunction;
				if (moveOptions.powerCreepSnake || anyCantMove) {
					moveOptions.swampMod = 5 + Math.max(0, 4 * (orderedCreeps.length - 2) / 5);
				}
				else {
					moveOptions.swampMod = 1 + Math.max(0, 4 * (orderedCreeps.length - 2) / 5);
				}

				// orderedCreeps[0].mem.forceFlee = 0

				// Might be deadlocked due to having to keep tight and stuff going the opposit direction.
				// This might clean it up sometimes? Was a problem on season 2 where I have these one-wide
				// tunnels with no alternative route
				if (areFormed && orderedCreeps[0] && anyCantMove && (orderedCreeps[0].mem.forceFlee || orderedCreeps[0].mem.mS > 5) && !orderedCreeps[0].room.hasHostiles) {
					for (let otherCreep of orderedCreeps[0].room.find(FIND_MY_CREEPS)) {
						if (!otherCreep.mem.haveSnaked && !otherCreep.assaulter && otherCreep.mem.inP === undefined && otherCreep.pos.inRangeToPos(orderedCreeps[0].pos, 5)) {
							otherCreep.uncachedMoveTo(orderedCreeps[0], 10, {flee: 1})
							otherCreep.forceNoNewMove = 1
							otherCreep.mem.spooked = 5
						}
					}

					if (orderedCreeps[0].mem.forceFlee) {
						orderedCreeps[0].mem.forceFlee--
					}
					else {
						orderedCreeps[0].mem.forceFlee = 5
					}

					console.log("SNAKE SNAKE, OOOH IT'S A SNAKE. RUUUUN", orderedCreeps[0].room.name)
				}

				// Cases where I want to pull:
				// 1) Other creep literally can't move (tugs, like deposit chaps)
				// 2) Behind creep is fatigued and in front creep is moving in a way that wouldn't cause them excess fatigue (ie. to plains or road)
				// 3) Move balanced pairs


				let fatigued = 0;
				for (let creep of orderedCreeps) {
					if (!creep.canSnakeMove()) {
						fatigued = 1;
						break;
					}
				}

				let pullingZero = false;
				let pullList = [];
				if (fatigued) {
					for (let creepIdx = 0; creepIdx < orderedCreeps.length - 1; creepIdx++) {
						let creep = orderedCreeps[creepIdx];
						if (creep.pulledBy && !creep.roadedPull) {
							continue
						}

						let nextCreep = orderedCreeps[creepIdx + 1] 
						let structs = creep.pos.lookFor(LOOK_STRUCTURES);

						let roaded = false
						for (let struct of structs) {
							if (struct.structureType == STRUCTURE_ROAD) {
								roaded = true;
								break;
							}
						}

						/*if (!creep.fatigue && !nextCreep.fatigue && creep.pos.lookFor(LOOK_TERRAIN)[0] != "swamp") {
							pullList.push([creep, nextCreep])
							if (creepIdx == 0) pullingZero = true;
							nextCreep.pulledBy = creep;
							if (roaded) {
								nextCreep.roadedPull = 1
							}
						}
						else*/ if ((!creep.fatigue || creep.pulledBy) && ((nextCreep.fatigue && (creep.pos.lookFor(LOOK_TERRAIN)[0] != "swamp" || creep.pulledBy || roaded)) || (nextCreep.mem.alwaysPulled || !nextCreep.hasBodypart(MOVE)))) {

						// if ((!creep.fatigue || creep.pulledBy) && ((orderedCreeps[creepIdx + 1].fatigue && (creep.pos.lookFor(LOOK_TERRAIN)[0] != "swamp" || creep.pulledBy || (structs.length > 0 && structs[0].structureType == STRUCTURE_ROAD))) ||
						// 					   					   !orderedCreeps[creepIdx + 1].hasBodypart(MOVE))) {
							pullList.push([creep, nextCreep])
							if (creepIdx == 0) pullingZero = true;
							nextCreep.pulledBy = creep;
							if (roaded) {
								nextCreep.roadedPull = 1
							}
						}
						// else if (!orderedCreeps[creepIdx + 1].canSnakeMove()) {
						// else if (!nextCreep.fatigue) {
						// 	cantPull = 1;
						// 	break;
						// }
					}
				}

				// if (Memory.debugSnake) {
				// 	console.log(pullingZero, pullList, fatigued, cantPull)
				// }


				// Looping backwards allows us to use the moveResolver correctly
				for (let creepIdx = orderedCreeps.length - 1; creepIdx >= 0; creepIdx--) {
					let creep = orderedCreeps[creepIdx];
					if (!creep.mem.retreat) {
						creep.memory.haveSnaked = (creep.memory.haveSnaked || 0) + 1;
					}
					creep.memory.lastSnakePos = creep.pos;

					creep.moveOrdersGiven = true

					if (creepIdx == 0) {
						if (fatigued && cantPull) continue
						// let holdPosition = 0;
						// let otherCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 2);
						// for (let otherCreep of otherCreeps) {
						// 	if (creepNames.includes(otherCreep.name)) {
						// 		continue;
						// 	}
						// 	else if (otherCreep.memory.haveSnaked && otherCreep.memory.ID != undefined && otherCreep.memory.ID < creep.memory.ID) {
						// 		holdPosition = 1;
						// 		break;
						// 	}
						// }
						// if (!holdPosition) {
							// console.log(targetPos, targetRange, moveOptions)
						if (!pullingZero || !util.isEdgeOfRoom(creep.pos)) {
							// if (orderedCreeps.length > 2 && Game.time - (creep.mem.pIncompleteTick || 0) > 10) {
							// 	moveOptions = _.clone(moveOptions)
							// 	moveOptions.excludedPositions = []
							// 	// for (let otherCreepIdx = orderedCreeps.length - 1; creepIdx >= 0; creepIdx--) {
							// }


							creep.cachedMoveTo(targetPos, targetRange, moveOptions)
							if (Memory.debugSnake) {
								creep.say("F11")
							}
						}
						// We are pulling. If we're both on the same exit side then go ahead and move forth
						else if (pullingZero) {
							let otherCreep = orderedCreeps[1]
							if (util.isEdgeOfRoom(creep.pos) && util.isEdgeOfRoom(otherCreep.pos)) {
								creep.uncachedMoveTo(targetPos, targetRange, moveOptions)
								if (Memory.debugSnake) {
									creep.say("F12a")
								}
							}
							else {
								if (Memory.debugSnake) {
									creep.say("F12b")
								}

							}
						}


						if (creep.mem.path && creep.mem.path[0] !== undefined) {
							creep.nextPos = creep.pos.findPosInDirection(creep.mem.path[0])
						}

					}
					else {
						let forwardCreep = orderedCreeps[creepIdx - 1];
						if (creep.pos.isNearToPos(forwardCreep.pos) && forwardCreep.pos.roomName == creep.pos.roomName) {
							// console.log(orderedCreeps, areFormed, withdraw, targetRange)
							if (hasPullFunction && /*!creep.canSnakeMove() &&*/ creep.pulledBy) {
								if (!creep.pulledBy.nextPos || creep.pos.getRangeToPos(creep.pulledBy.nextPos) != 1) {
									if (Memory.debugSnake) {
										creep.say("F21a")
									}

									let ret = creep.move(creep.pulledBy)
									if (ret == -999) {
										// We're blocked on not-the-first creep
										// That means that someone is trying to cut into the snake. 
										// We should tell them "no", put them in the replay list
										let state = moveResolver.getState(creep.room.name)

										let offendingCreepName = state[creep.pulledBy.pos.x * 100 + creep.pulledBy.pos.y + 25]


										// This isn't ideal on CPU but should be infrequent and it's hard to sort out otherwise
										if (Game.creeps[offendingCreepName].cancelOrder("move") == OK) {											
											delete state[creep.pulledBy.pos.x * 100 + creep.pulledBy.pos.y + 25]

											// Let them have another go, but we're moving like it or not.
											global.inTickObject.replayCreep = global.inTickObject.replayCreep || []
											global.inTickObject.replayCreep.push(offendingCreepName)

											ret = creep.move(creep.pulledBy)
										}
									}
									
									// Ain't nobody moving
									if (ret != OK) {
										moveResolver.static(creep)
										// All the others aren't moving either
										for (creepIdx--; creepIdx >= 0; creepIdx--) {
											moveResolver.static(orderedCreeps[creepIdx]);
										}
										break
									}
									else {
										moveResolver.set(creep, creep.pulledBy.pos)
									}
									delete creep.mem.pTX;
									delete creep.mem.pTY;
									delete creep.mem.pTgtRoom;
									delete creep.mem.pO;

									creep.pulledBy.pull(creep);
									creep.nextPos = creep.pulledBy.pos
								}
								else {
									moveResolver.static(creep)
									creep.nextPos = creep.pos
								}
							}
							else {
								if (fatigued && cantPull) continue
								if (hasPullFunction && creepIdx != orderedCreeps.length - 1 && !orderedCreeps[creepIdx + 1].pulledBy) {
									let newPos = forwardCreep.pos;

									// Always pull onto roads or edges
									let newPosCheap = newPos.x == 0 || newPos.y == 0 || newPos.x == 49 || newPos.y == 49;

									if (!newPosCheap && creep.hits == creep.hitsMax) {									
										let newPosStructs = newPos.lookFor(LOOK_STRUCTURES);
										for (var struct of newPosStructs) {
											if (struct.structureType == STRUCTURE_ROAD) {
												newPosCheap = true;
												break;
											}
										}
									}

									// Pull the guy behind me because we'll have spare fatigue.
									if (newPosCheap) {
										if (Math.random() < 0.01) console.log("Pull A", creep.pos, orderedCreeps[creepIdx + 1].pos)
										orderedCreeps[creepIdx + 1].pulledBy = creep;
										creep.pull(orderedCreeps[creepIdx + 1])
									}
								}

								let dir = creep.pos.getDirectionTo(forwardCreep)

								if (!forwardCreep.nextPos || creep.pos.getRangeToPos(forwardCreep.nextPos) != 1) {
									let ret = creep.move(dir)

									if (ret == -999) {
										// We're blocked on not-the-first creep
										// That means that someone is trying to cut into the snake. 
										// We should tell them "no", put them in the replay list
										let state = moveResolver.getState(creep.room.name)

										let offendingCreepName = state[forwardCreep.pos.x * 100 + forwardCreep.pos.y + 25]

										// This isn't ideal on CPU but should be infrequent and it's hard to sort out otherwise
										if (Game.creeps[offendingCreepName].cancelOrder("move") == OK) {											
											delete state[forwardCreep.pos.x * 100 + forwardCreep.pos.y + 25]

											// Let them have another go, but we're moving like it or not.
											global.inTickObject.replayCreep = global.inTickObject.replayCreep || []
											global.inTickObject.replayCreep.push(offendingCreepName)

											ret = creep.move(dir)
										}
									}

									if (ret != OK) {
										moveResolver.static(creep)
										// All the others aren't moving either
										for (creepIdx--; creepIdx >= 0; creepIdx--) {
											moveResolver.static(orderedCreeps[creepIdx]);
										}
										break
									}
									else {
										moveResolver.set(creep, creep.pos.getPosInDirection(dir))

										delete creep.mem.pTX;
										delete creep.mem.pTY;
										delete creep.mem.pTgtRoom;
										delete creep.mem.pO;
										
										if (Memory.debugSnake) {
											creep.say("F21b")
										}

									}
									creep.nextPos = creep.pos.findPosInDirection(dir)
								}
								else {
									moveResolver.static(creep)
									creep.nextPos = creep.pos
								}
							}
						}
						else if (orderedCreeps[creepIdx - 1].onPortal) {
							if (fatigued && cantPull) continue
							let forwardLastSnakePos = forwardCreep.mem.lastSnakePos;
							creep.move(creep.pos.getDirectionTo(new RoomPosition(forwardLastSnakePos.x, forwardLastSnakePos.y, forwardLastSnakePos.roomName)));
							delete creep.mem.pTX;
							delete creep.mem.pTY;
							delete creep.mem.pTgtRoom;
							delete creep.mem.pO;

							if (Memory.debugSnake) {
								creep.say("F22")
							}
						}
						else {
							if (fatigued && cantPull) continue
							delete moveOptions.flee
							// We'll be next to their next pos anyway
							if (!forwardCreep.nextPos || creep.pos.getRangeToPos(forwardCreep.nextPos) != 1) {
								// Move priority - pull goes first, so pull to avoid annoying creeps jumping in the way and spliting us up.
								// Don't do it onto a swamp, don't do it if we might have lost a move part (TODO: move part loss detection better)
								// That should cover all the fatigue transferring cases I think
								if (creep.hits > creep.hitsMax - 100 && creep.pos.isNearToPos(forwardCreep.pos) && forwardCreep.pos.lookFor(LOOK_TERRAIN)[0] != "swamp") {
									if (creep.move(forwardCreep) != OK) {
										moveResolver.static(creep)
										// All the others aren't moving either
										for (creepIdx--; creepIdx >= 0; creepIdx--) {
											moveResolver.static(orderedCreeps[creepIdx]);
										}

										break
									}
									else {
										moveResolver.set(creep, forwardCreep.pos)
									}
									delete creep.mem.pTX;
									delete creep.mem.pTY;
									delete creep.mem.pTgtRoom;
									delete creep.mem.pO;

									forwardCreep.pull(creep)
									if (Memory.debugSnake) {
										creep.say("F23")
									}
								}	
								else {
									// Is this ever true?
									if (creep.pos.isNearToPos(forwardCreep.pos)) {
										console.log("SnakeAI condition I think is never true", creep, creep.pos, forwardCreep, forwardCreep.pos)
										if (creep.move(creep.pos.getDirectionTo(forwardCreep.pos) != OK)) {
											moveResolver.static(creep)
											for (creepIdx--; creepIdx >= 0; creepIdx--) {
												moveResolver.static(orderedCreeps[creepIdx]);
											}

											break
										}
										else {
											moveResolver.set(creep, forwardCreep.pos)
										}

										delete creep.mem.pTX;
										delete creep.mem.pTY;
										delete creep.mem.pTgtRoom;
										delete creep.mem.pO;

									}
									else {
										creep.uncachedMoveTo(forwardCreep, 0, moveOptions)
										if (Memory.debugSnake) {
											creep.say("F24")
										}
									}
								}
								creep.nextPos = forwardCreep.pos
							}
							else {
								moveResolver.static(creep)
								creep.nextPos = creep.pos
							}
						}
					}
				}

				// Room edge swapping
				if (fatigued && !cantPull) {
					for (let pullPair of pullList) {
						// This gets a bit awkward with swamps if both sides can move.
						if ((!pullPair[0].mem.alwaysPulled && pullPair[0].getNumOfBodyPart(MOVE)) && pullPair[1].getNumOfBodyPart(MOVE)) continue
							
						if (Math.random() < 0.1 && Memory.debugPull) console.log("Pull B", pullPair[0].pos, pullPair[1].pos)
						pullPair[0].pull(pullPair[1])


						// let terrain = Game.map.getRoomTerrain(pullPair[0].pos.roomName)

						// Situations where the puller is on the room edge and wants to pull the other creep to his position

						// We have to do a dummy intent to get this to work right. This seems to be the only way of doing it.
						if (pullPair[0].pos.x == 0 && pullPair[1].pos.x == 1) {
							pullPair[0].move(pullPair[1])
							delete pullPair[0].mem.pTX;
							delete pullPair[0].mem.pTY;
							delete pullPair[0].mem.pTgtRoom;
							delete pullPair[0].mem.pO;
						}	
						else if (pullPair[0].pos.x == 49 && pullPair[1].pos.x == 48) {
							pullPair[0].move(pullPair[1])
							delete pullPair[0].mem.pTX;
							delete pullPair[0].mem.pTY;
							delete pullPair[0].mem.pTgtRoom;
							delete pullPair[0].mem.pO;							
						}									
						else if (pullPair[0].pos.y == 0 && pullPair[1].pos.y == 1) {
							pullPair[0].move(pullPair[1])
							delete pullPair[0].mem.pTX;
							delete pullPair[0].mem.pTY;
							delete pullPair[0].mem.pTgtRoom;
							delete pullPair[0].mem.pO;							
						}									
						else if (pullPair[0].pos.y == 49 && pullPair[1].pos.y == 48) {
							pullPair[0].move(pullPair[1])
							delete pullPair[0].mem.pTX;
							delete pullPair[0].mem.pTY;
							delete pullPair[0].mem.pTgtRoom;
							delete pullPair[0].mem.pO;							
						}

						if (util.isEdgeOfRoom(pullPair[0].pos) && !util.isEdgeOfRoom(pullPair[1].pos) && pullPair[0].pos.roomName == pullPair[1].pos.roomName) {							
							let dir = pullPair[0].pos.getDirectionTo(pullPair[1].pos)
							dir = (dir - 1 + 4) % 8 + 1

							if (Memory.debugSnake) {
								console.log("Swap pull", pullPair[0].pos, pullPair[1].pos, dir)
							}

							pullPair[0].mem.nextMoveDir = dir;
						}

						// if (Memory.debugSnake) {
						// 	pullPair[0].say("F25")
						// }

					}
				}
			}

			// Don't let anyone do anything
			for (let creepIdx = 0; creepIdx < orderedCreeps.length; creepIdx++) {
				let creep = orderedCreeps[creepIdx];
				creep.moveOrdersGiven = true
			}
		}

		// console.log("sssss", Game.cpu.getUsed() - a, creepNames.length)

	},

};

module.exports = snakeAI;