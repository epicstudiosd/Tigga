"use strict";
let util = require('util');
var intelAI = require('intelAI');
var roomIntel = require('roomIntel');
var scouting = require('scouting');
var constants = require('constants');


var nukeAI = {
	tick() {
		Memory.combatManager.requestedNukes = Memory.combatManager.requestedNukes || {};
		let t = Game.cpu.getUsed()
		if (Math.random() < 0.1) {
			for (let requestRoomName in _.clone(Memory.combatManager.requestedNukes)) {
				if (Game.time - Memory.combatManager.requestedNukes[requestRoomName] < 200) {
					if (this.tryNukeRequest(requestRoomName)) {
						delete Memory.combatManager.requestedNukes[requestRoomName];
					}
				}
				else {
					delete Memory.combatManager.requestedNukes[requestRoomName]
				}
			}
		}

		if (Game.cpu.bucket > 1000 && t < 100) {
			for (var room of _.shuffle(Game.myRooms)) {
				if (Math.random() < (1 / 100.)) {
					if (room.controller.level >= 8) {
						try {
							nukeAI.nukeTargetSelection(room);
						}
						catch(e) {
							console.log("Error on nukeTargetSelection tick for ", room);
							console.log(e);
							console.log(e.stack);
						}
					}
				}
			}
			if (Math.random() < 0.01) {
				this.clusterNukeCheck();
			}
		}
	},

	tryNukeRequest(roomName) {
		let mem = Memory.rooms[roomName];

		if (mem.nukeLandTime && mem.nukeLandTime - Game.time < NUKE_LAND_TIME * 0.95) return false;
		if (mem.nukeLandTime) {		
			if ((mem.numAttacksFailed || 0) < 2 && intelAI.strugglingToKillRooms(mem.owner) < 10) return false;
			if (mem.rcl < 4) return false;
		}
		if (!mem.seenSinceNuked) return false;

		if (mem.invCL && mem.invCL < 5) return false

		if (Memory.season && mem.rcl < 5) {
			return false
		}

		let targetX;
		let targetY;
		if (mem.trmX && mem.trmY) {
			targetX = mem.trmX
			targetY = mem.trmY
		}
		else if (mem.storX && mem.storY) {
			targetX = mem.trmX
			targetY = mem.trmY
		}
		else if (mem.spwnX.length && mem.spwnY.length) {
			targetX = mem.spwnX[0]
			targetY = mem.spwnY[0]
		}
		else if (mem.twrX.length && mem.twrY.length) {
			targetX = mem.twrX[0]
			targetY = mem.twrY[0]
		}

		if (targetX && targetY) {
			for (let room of Game.myRooms) {
				if (Game.map.getRoomLinearDistance(room.name, roomName) > NUKE_RANGE) continue;
				if (room.canLaunchNuke()) {
					let nuker = room.nuker;
					let pos = new RoomPosition(targetX, targetY, roomName)
					console.log(room.name, "launching nuke at", pos)
					if (nuker.launchNuke(pos) == OK) {
						console.log("----- NUCLEAR LAUNCH DETECTED -----")
						console.log("Landing at", pos, "in", NUKE_LAND_TIME, "ticks!")
						Game.notify("----- NUCLEAR LAUNCH DETECTED -----")
						Game.notify("Landing at " + pos + " in " + NUKE_LAND_TIME + " ticks!")
						Memory.rooms[pos.roomName].nukeLandTime = Game.time + NUKE_LAND_TIME;

						Memory.attackFocus[Memory.rooms[pos.roomName].owner] = (Memory.attackFocus[Memory.rooms[pos.roomName].owner] || 0) + 10;
						return true;
					}
				}
			}
		}
		return false;
	},

	nukeTargetSelection(room, forceTargetRoom, forceSpawns, forceTerminal, forceLabs) {

		// LAUNCH ZE MISSILES
		if (room.canLaunchNuke()) {
			let nuker = room.nuker;
			let damagedFraction = (Game.damagedRooms || 0) / Game.myRooms.length;
			let highestHate;
			if (damagedFraction > 0.2) {
				highestHate = intelAI.getMaxHatePercentage();
			}

			let gclEstimate = intelAI.getGCLEstimates();

			let bestPos;
			let maxScore = 0;

			let nukeSpawns = false;
			let nukeTerminal = false;
			let nukeStorage = false;
			let nukeLabs = false;

			let firingNukers = [];

			let enemyRooms = forceTargetRoom ? [forceTargetRoom] : Memory.enemyRooms;

			for (var roomName of enemyRooms) {
				if (!Memory.rooms[roomName]) {
					continue;
				}
				if (!Memory.rooms[roomName].seenSinceNuked) {
					continue;
				}
				if (Game.map.getRoomLinearDistance(room.name, roomName) > NUKE_RANGE) continue;

				if (scouting.isRoomWhiteListed(roomName)) {
					continue;
				}

				let rm = Memory.rooms[roomName];

				// Unless we're automated, don't bother. MMO people are too good in general. Use them with attacks only.
				if (!Memory.botArena && (!global.roomAssaultCounts[roomName] || !global.roomAssaultCounts[roomName].assaultCount) && (rm.trmE || 0) + (rm.storE || 0) > 0 && Memory.rooms[roomName].rcl == 8) {
					continue;
				}
				if (Memory.season2) {
					continue
				}

				let numAttacksThreshold;
				if ((global.roomAssaultCounts[roomName] && global.roomAssaultCounts[roomName].assaultCount) || Game.time - (Memory.combatManager.assaultSafeModeTriggered[Memory.rooms[roomName].owner] || 0) < 10000) {
					numAttacksThreshold = 1;
				}
				else {
					numAttacksThreshold = 2;
				}

				// Give it a go first!
				if ((rm.numAttacksFailed || 0) + 0.5 * (rm.numAttacksFizzled || 0) < numAttacksThreshold && intelAI.strugglingToKillRooms(rm.owner) < 10) {
					continue;
				}

				if (!rm.spwnX || rm.spwnX.length == 0) continue;

				let safeModeBypass = rm.rcl >= 6 && (Memory.rooms[roomName].safeMode || Memory.rooms[roomName].safeModeCooldown) && rm.hostileBoostedAnyCreeps


				if (rm.rcl < 7 && !rm.hostileBoostedCreeps && !safeModeBypass) continue;

				// Go for rooms that are actually built up.
				if (rm.twrX.length == 0 || rm.spwnX.length == 0) continue;

				// Single nuke per room for now.
				if (((rm.nukeLandTime || 0) - Game.time > NUKE_LAND_TIME * 0.9) || forceSpawns || forceTerminal || forceLabs) continue;

				// console.log("room", roomName, "nuke scan")

				let externalStuff = false;
			  	for (var towerIdx in Memory.rooms[roomName].twrX) {
					if (Memory.rooms[roomName].twrExtern[towerIdx] || !Memory.rooms[roomName].twrInside[towerIdx]) {
						externalStuff = true;
						break;
					}
				}

			  	for (var spawnIdx in Memory.rooms[roomName].spwnX) {
					if (Memory.rooms[roomName].spwnExtern[spawnIdx] || !Memory.rooms[roomName].spwnInside[spawnIdx]) {
						externalStuff = true;
						break;
					}
				}

				if (externalStuff && !safeModeBypass) {
					continue;
				}

				let hatePriority = intelAI.getHatePercentage(rm.owner);

				if (damagedFraction > 0.2) {
					if (hatePriority / highestHate < 0.5) continue;
				}

				let allNukers = [nuker];
				for (let otherRoom of Game.myRooms) {
					if (otherRoom == room) continue;
					if (otherRoom.canLaunchNuke() && Game.map.getRoomLinearDistance(otherRoom.name, roomName) <= NUKE_RANGE) {
						allNukers.push(otherRoom.nuker)
					}
				}

				// Target wants to be high GCL, high RCL, with <1 million on all spawns.
				// If we can kill all spawns with one nuke, do that.
				let minX = 50;
				let minY = 50;
				let maxX = 0;
				let maxY = 0;
				let sumX = 0;
				let sumY = 0;
				let spawnDamagePass = true;
				let spawnClusteringPass = true;
				let anyspwnR = false;
				for (let spawnIdx = 0; spawnIdx < rm.spwnX.length; spawnIdx++) {
					if ((rm.spwnR[spawnIdx] || 0) > 0) anyspwnR = true;
					if (rm.spwnR[spawnIdx] >= allNukers.length * NUKE_DAMAGE[2]) {
						spawnDamagePass = false;
					}

					sumX += rm.spwnX[spawnIdx];
					sumY += rm.spwnY[spawnIdx];

					if (rm.spwnX[spawnIdx] < minX) {
						minX = rm.spwnX[spawnIdx];
					}
					if (rm.spwnX[spawnIdx] > maxX) {
						maxX = rm.spwnX[spawnIdx];
					}
					if (rm.spwnY[spawnIdx] < minY) {
						minY = rm.spwnY[spawnIdx];
					}
					if (rm.spwnY[spawnIdx] > maxY) {
						maxY = rm.spwnY[spawnIdx];
					}

					if (maxX - minX >= 5 || maxY - minY >= 5) {
						spawnClusteringPass = false;
						break;
					}
				}

				let score = 100 + (gclEstimate[Memory.rooms[roomName].owner] || 0) / (Memory.enemyRooms.length);

				score += rm.rcl;
				score += hatePriority * 4;

				if (Memory.attackFocus && Memory.attackFocus[Memory.rooms[roomName].owner]) {
					score += Memory.attackFocus[Memory.rooms[roomName].owner] / 10;
				}

				if (!forceTerminal && !forceLabs && spawnClusteringPass && spawnDamagePass && (!rm.nukeSpawnsFailed || forceSpawns) && !rm.nukeSpawnsAttempt) {
					if (score > maxScore) {
						maxScore = score;

						if (maxX - minX > 2 || maxY - minY > 2) {
							sumX /= rm.spwnX.length;
							sumY /= rm.spwnY.length;

							bestPos = new RoomPosition(Math.round(sumX), Math.round(sumY), roomName);
						}
						else {
							let spawnIdx = Math.floor(Math.random() * rm.spwnX.length);
							bestPos = new RoomPosition(rm.spwnX[spawnIdx], rm.spwnY[spawnIdx], roomName);

							nukeSpawns = true;
							nukeTerminal = false;
							nukeStorage = false;
							nukeLabs = false;

							firingNukers = anyspwnR ? allNukers : [nuker];
						}
					}
				}
				// Drop on the terminal
				else if (!forceSpawns &&
						 !forceLabs &&
						rm.trmX &&
						rm.trmY &&
						(rm.trmR || 0) < allNukers.length * NUKE_DAMAGE[0] &&
						!Memory.rooms[roomName].nukeTerminalAttempt &&
						(forceTerminal || rm.terminalDenseRamparts || (rm.killTerminal && rm.terminalInsideWalls && !rm.terminalOnExternalRampart && !rm.nukeTerminalFailed && !rm.nukeTerminalAttempt))) {
					if (!rm.terminalDenseRamparts) {
						score /= 2;
					}
					else {
						score *= 2;
					}

					if (score > maxScore) {
						maxScore = score;
						bestPos = new RoomPosition(rm.trmX, rm.trmY, roomName);

						nukeSpawns = false;
						nukeTerminal = true;
						nukeStorage = false;
						nukeLabs = false;

						firingNukers = (rm.trmR || 0) > 0 ? allNukers : [nuker];
					}
				}
				// Drop on the storage
				else if (!forceSpawns &&
						 !forceLabs &&
						rm.storX &&
						rm.storY &&
						(rm.storR || 0) < allNukers.length * NUKE_DAMAGE[0] &&
						!Memory.rooms[roomName].nukeStorageAttempt &&
						(rm.storageDenseRamparts || (rm.killStorage && rm.storageInsideWalls && !rm.storageOnExternalRampart && !rm.nukeStorageFailed && !rm.nukeStorageAttempt))) {
					if (!rm.storageDenseRamparts) {
						score /= 2;
					}
					else {
						score *= 2;
					}

					// Terminal is higher priority
					score *= 0.9;

					if (score > maxScore) {
						maxScore = score;
						bestPos = new RoomPosition(rm.storX, rm.storY, roomName);

						nukeSpawns = false;
						nukeTerminal = false;
						nukeStorage = true;
						nukeLabs = false;

						firingNukers = (rm.storR || 0) > 0 ? allNukers : [nuker];
					}
				}
				// Drop on labs
				else if (rm.lbX && rm.lbX.length == 10 && (!rm.nukeLabsFailed || forceLabs) && !rm.nukeLabsAttempt) {
					score /= 4;

					if (score > maxScore) {
						minX = 50;
						minY = 50;
						maxX = 0;
						maxY = 0;
						sumX = 0;
						sumY = 0;
						let labDamagePass = true;
						let labClusteringPass = true;
						let anyRamparts = false;
						for (let labIdx = 0; labIdx < rm.lbX.length; labIdx++) {
							if ((rm.lbR[labIdx] || 0) > 0) {
								anyRamparts = true;
							}

							if (rm.lbR[labIdx] >= allNukers.length * NUKE_DAMAGE[2]) {
								labDamagePass = false;
								break;
							}

							sumX += rm.lbX[labIdx];
							sumY += rm.lbY[labIdx];

							if (rm.lbX[labIdx] < minX) {
								minX = rm.lbX[labIdx];
							}
							if (rm.lbX[labIdx] > maxX) {
								maxX = rm.lbX[labIdx];
							}
							if (rm.lbY[labIdx] < minY) {
								minY = rm.lbY[labIdx];
							}
							if (rm.lbY[labIdx] > maxY) {
								maxY = rm.lbY[labIdx];
							}

							if (maxX - minX >= 5 || maxY - minY >= 5) {
								labClusteringPass = false;
								break;
							}
						}

						if (labDamagePass && labClusteringPass) {
							maxScore = score;
							sumX /= rm.lbX.length;
							sumY /= rm.lbY.length;

							let pos0 = new RoomPosition(Math.floor(sumX), Math.floor(sumY), roomName);
							let pos1 = new RoomPosition(Math.floor(sumX), Math.ceil(sumY), roomName);
							let pos2 = new RoomPosition(Math.ceil(sumX), Math.ceil(sumY), roomName);
							let pos3 = new RoomPosition(Math.ceil(sumX), Math.floor(sumY), roomName);

							for (let labIdx = 0; labIdx < rm.lbX.length; labIdx++) {
								if (pos0.x == rm.lbX[labIdx] && pos0.y == rm.lbY[labIdx]) {
									bestPos = pos0;
									break;
								}
								if (pos1.x == rm.lbX[labIdx] && pos1.y == rm.lbY[labIdx]) {
									bestPos = pos1;
									break;
								}
								if (pos2.x == rm.lbX[labIdx] && pos2.y == rm.lbY[labIdx]) {
									bestPos = pos2;
									break;
								}
								if (pos3.x == rm.lbX[labIdx] && pos3.y == rm.lbY[labIdx]) {
									bestPos = pos3;
									break;
								}
							}

							if (!bestPos) {
								bestPos = new RoomPosition(Math.round(sumX), Math.round(sumY), roomName);
							}

							nukeSpawns = false;
							nukeTerminal = false;
							nukeStorage = false;
							nukeLabs = true;

							firingNukers = anyRamparts ? allNukers : [nuker];

							// console.log(room.name, "labnuketest", roomName, labDamagePass, labClusteringPass, sumX / 10, sumY / 10)
						}
					}
				}
			}

			// Here we go!
			if (bestPos) {
				for (let firingNuker of firingNukers) {
					console.log(firingNuker.room.name, "launching nuke at", bestPos)
					if (firingNuker.launchNuke(bestPos) == OK) {
						console.log("----- NUCLEAR LAUNCH DETECTED -----")
						console.log("Landing at", bestPos, "in", NUKE_LAND_TIME, "ticks!")
						Game.notify("----- NUCLEAR LAUNCH DETECTED -----")
						Game.notify("Landing at " + bestPos + " in " + NUKE_LAND_TIME + " ticks!")

						Memory.rooms[bestPos.roomName].nukeLandTime = Game.time + NUKE_LAND_TIME;

						Memory.attackFocus[Memory.rooms[bestPos.roomName].owner] = (Memory.attackFocus[Memory.rooms[bestPos.roomName].owner] || 0) + 10;

						if (nukeStorage) {
							Memory.rooms[bestPos.roomName].nukeStorageAttempt = Game.time + NUKE_LAND_TIME + 1;
						}
						if (nukeTerminal) {
							Memory.rooms[bestPos.roomName].nukeTerminalAttempt = Game.time + NUKE_LAND_TIME + 1;
						}
						if (nukeSpawns) {
							Memory.rooms[bestPos.roomName].nukeSpawnsAttempt = Game.time + NUKE_LAND_TIME + 1;
						}
						if (nukeLabs) {
							Memory.rooms[bestPos.roomName].nukeLabsAttempt = Game.time + NUKE_LAND_TIME + 1;
						}

					}
				}
			}
			else {
				if (Math.random() < 0.01) console.log("No nuke target", room)
			}
		}
	},

	clusterNukeCheck() {
		let activeNukers = [];
		for (let room of Game.myRooms) {
			if (room.canLaunchNuke()) {
				activeNukers.push(room.nuker);
			}
		}

		if (Math.random() < 0.1) console.log(activeNukers.length, "active nukers")

		if (activeNukers.length < 4) return;

		let damagedFraction = (Game.damagedRooms || 0) / Game.myRooms.length;
		let highestHate;
		if (damagedFraction > 0.2) {
			highestHate = intelAI.getMaxHatePercentage();
		}


		let highestPriority = 0;
		for (var roomName of Memory.enemyRooms) {
			let mem = Memory.rooms[roomName];
			if (!mem) {
				continue;
			}
			if (!scouting.canClusterNuke(roomName)) {
				continue;
			}

			let hatePriority = intelAI.getHatePercentage(mem.owner);

			let highestHate;
			if (damagedFraction > 0.2) {
				highestHate = intelAI.getMaxHatePercentage();
			}

			let enoughHate = true;

			if (damagedFraction > 0.2) {
				if (hatePriority / highestHate < 0.5) {
					enoughHate = false;
				}
			}

			if (!enoughHate) {
				continue;
			}

			let gclEstimate = intelAI.getGCLEstimates();
			let gclPriority = (gclEstimate[mem.owner] || 0) / (Memory.enemyRooms.length);
			let attackFocusPriority = 0;
			if (Memory.attackFocus[mem.owner]) {
				attackFocusPriority = Memory.attackFocus[mem.owner] / 10;
			}

			let priority = attackFocusPriority + gclPriority + hatePriority;

			if (priority < highestPriority) continue;

			let nukersInRange = [];
			for (let nuker of activeNukers) {
				if (Game.map.getRoomLinearDistance(nuker.room.name, roomName) <= NUKE_RANGE) {
					nukersInRange.push(nuker);
				}
			}


			// console.log(roomName, "has", nukersInRange.length, "nukers in range")

			// Ooh. This could be interesting.
			if (nukersInRange.length >= 4) {
				if (global.wasm_module && global.wasm_module.lzw_decode) {
					let allStructures = JSON.parse(global.wasm_module.lzw_decode(mem.allStructures));

					let nukeScores = [];

					for (let i = 2; i < 48; i++) {
						for (let j = 2; j < 48; j++) {
							let score = 0;
							for (let i2 = -2; i2 <= 2; i2++) {
								let x = i + i2;
								for (let y of allStructures[x]) {
									if (Math.abs(y - j) <= 2) {
										score++;
									}
								}
							}
							// If we can't get a big hit, ignore it.
							if (score >= 10) {
								nukeScores.push({x:i, y:j, score:score})
							}
							// Can only get 5 more per step, so do some fast forward.
							if	  (score == 0) j += 2;
							else if (score < 5)  j += 1;
						}
					}


					if (nukeScores.length < 4) continue;

					nukeScores = _.sortBy(nukeScores, "score")
					// console.log(roomName, JSON.stringify(nukeScores))

					let nukePositions = [];
					let cnt = 0;
					let totalScore = 0;

					while (cnt < nukeScores.length && nukePositions.length < nukersInRange.length) {
						// console.log(roomName, JSON.stringify(nukePositions))
						cnt++;
						let nextPosition = nukeScores[nukeScores.length - cnt];

						let ignore = false;
						// Check for collisions.
						for (let position of nukePositions) {
							let dist = Math.max(Math.abs(nextPosition.x - position.x), Math.abs(nextPosition.y - position.y));
							if (dist >= 5) continue;

							let bumped = false
							// Try to bump the other one to increase coverage
							// No point in bumping this one as the while loop will just pick up the bumped-to position.
							let overlap = (5 - dist) * (5 - Math.min(Math.abs(nextPosition.x - position.x), Math.abs(nextPosition.y - position.y)));

							// Meh, let the corners overlap.
							if (overlap == 1) continue;

							// This defines the bounding box of the overlap.
							let xMin = Math.max(nextPosition.x, position.x) - 2;
							let xMax = Math.min(nextPosition.x, position.x) + 2;
							let yMin = Math.max(nextPosition.y, position.y) - 2;
							let yMax = Math.min(nextPosition.y, position.y) + 2;

							let overlapBuildingCount = 0;
							for (let x = xMin; x <= xMax; x++) {
								for (let y of allStructures[x]) {
									if (y >= yMin && y <= yMax) {
										overlapBuildingCount++;
									}
								}
							}

							// Bumping too far seems to go wrong.
							overlapBuildingCount *= 0.2 + (0.2 * dist)

							let xOffset = 0;
							let yOffset = 0;
							if (nextPosition.x - position.x == dist) {
								xOffset = -(5 - dist)
							}
							else if (nextPosition.y - position.y == dist) {
								yOffset = -(5 - dist)
							}
							else if (nextPosition.x - position.x == -dist) {
								xOffset = (5 - dist)
							}
							else if (nextPosition.y - position.y == -dist) {
								yOffset = (5 - dist)
							}


							for (let otherScore of nukeScores) {
								if (otherScore.x == position.x + xOffset && otherScore.y == position.y + yOffset) {
									if (otherScore.score >= position.score - overlapBuildingCount) {
										let valid = true;
										for (let otherPosition of nukePositions) {
											if (otherPosition == position) continue;
											let newDist = Math.max(Math.abs(otherPosition.x - otherScore.x), Math.abs(otherPosition.y - otherScore.y));

											if (newDist < 5) {
												valid = false;
												break;
											}
										}
										if (valid) {
											bumped = true;
											position.newX = otherScore.x;
											position.newY = otherScore.y;
											position.newScore = otherScore.score;
										}
									}
									break;
								}
							}

							if (!bumped) {
								ignore = true;
								break;
							}
						}

						for (let position of nukePositions) {
							if (position.newX) {
								if (!ignore) {
									position.x = position.newX;
									position.y = position.newY;
									position.score = position.newScore;
								}

								position.newX = undefined;
								position.newY = undefined;
								position.newScore = undefined;
							}
						}
						if (ignore) continue;


						nukePositions.push(nextPosition)

						totalScore = 0;
						for (let position of nukePositions) {
							totalScore += position.score;
						}
						if (totalScore > 70) {
							break;
						}
					}

					// If one edge is completely empty, then push us away from it.
					// This will probably result in overlap, but that's better than
					// not hitting anythig.
					for (let position of nukePositions) {
						let leftEdge = false;
						let rightEdge = false;
						let topEdge = false;
						let bottomEdge = false;

						for (let i = -2; i <= 2; i++) {
							if (allStructures[position.x + i].indexOf(position.y - 2) !== -1) {
								topEdge = true;
							}
							if (allStructures[position.x + i].indexOf(position.y + 2) !== -1) {
								bottomEdge = true;
							}
							if (allStructures[position.x - 2].indexOf(position.y + i) !== -1) {
								leftEdge = true;
							}
							if (allStructures[position.x + 2].indexOf(position.y + i) !== -1) {
								rightEdge = true;
							}
						}

						if (!topEdge) {
							position.y += 1;
						}
						else if (!bottomEdge) {
							position.y -= 1;
						}
						else if (!leftEdge) {
							position.x += 1;
						}
						else if (!rightEdge) {
							position.x -= 1;
						}
					}

					if (nukePositions.length >= 5) {
						for (let nukePosition of nukePositions) {
							let pos = new RoomPosition(nukePosition.x, nukePosition.y, roomName)

							let nuker = nukersInRange.pop();

							if (nuker) {
								console.log(nuker.room.name, "launching nuke at", pos)
								if (nuker.launchNuke(pos) == OK) {
									console.log("----- NUCLEAR LAUNCH DETECTED -----")
									console.log("Landing at", pos, "in", NUKE_LAND_TIME, "ticks!")
									Game.notify("----- NUCLEAR LAUNCH DETECTED -----")
									Game.notify("Landing at " + pos + " in " + NUKE_LAND_TIME + " ticks!")

									Memory.rooms[pos.roomName].nukeLandTime = Game.time + NUKE_LAND_TIME;

									Memory.attackFocus[Memory.rooms[pos.roomName].owner] = (Memory.attackFocus[Memory.rooms[pos.roomName].owner] || 0) + 10;

								}
							}
						}
						// Reset this.
						mem.numAttacksFailed = 0;

						let nuker = nukersInRange.pop();
						if (nuker) {
							this.nukeTargetSelection(nuker.room, roomName, true, false);
						}
						nuker = nukersInRange.pop();
						if (nuker) {
							this.nukeTargetSelection(nuker.room, roomName, false, true);
						}

						for (let nuker of nukersInRange) {
							let pos = new RoomPosition(mem.trmX, mem.trmY, roomName);
							console.log(nuker.room.name, "launching nuke at", pos)
							if (nuker.launchNuke(pos) == OK) {
								console.log("----- NUCLEAR LAUNCH DETECTED -----")
								console.log("Landing at", pos, "in", NUKE_LAND_TIME, "ticks!")
								Game.notify("----- NUCLEAR LAUNCH DETECTED -----")
								Game.notify("Landing at " + pos + " in " + NUKE_LAND_TIME + " ticks!")

								Memory.rooms[pos.roomName].nukeLandTime = Game.time + NUKE_LAND_TIME;

								Memory.attackFocus[Memory.rooms[pos.roomName].owner] = (Memory.attackFocus[Memory.rooms[pos.roomName].owner] || 0) + 10;
							}
						}
					}

					// console.log(roomName, JSON.stringify(nukePositions))
				}
			}
		}
	},
};

module.exports = nukeAI;