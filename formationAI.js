"use strict";

var util = require('util');
var segments = require('segments');
var roomIntel = require('roomIntel');
const constants = require('constants');
const defenseAnalysis = require("defenseAnalysis")
const snakeAI = require("snakeAI")

const roomCombat = require("roomCombat")

// Maximize for RMA
function getDamageAtPos(_pos, numRanged, numAttack) {

	let massDamage = 0
	let rangedDamage = 0
	let closeDamage = 0

	if (numRanged) {		
		let rangedTargets = _pos.findInRange(Game.rooms[_pos.roomName].getAllHostileCreepsAndPowerCreeps(), 3).concat(_pos.findInRange(FIND_HOSTILE_STRUCTURES, 3));
		if (rangedTargets.length > 0) {
			let usedPositions = [];
			for (var i in rangedTargets) {
				let used = false;
				for (let position of usedPositions) {
					if (position.isEqualTo(rangedTargets[i].pos)) {
						used = true;
						break;
					}
				}
				if (used) {
					continue;
				}

				let range = _pos.getRangeTo(rangedTargets[i])

				if (range == 3) {
					massDamage += 1;
					usedPositions.push(rangedTargets[i].pos)
				}
				else if (range == 2) {
					massDamage += 4;
					usedPositions.push(rangedTargets[i].pos)
				}
				else if (range == 1) {
					closeDamage = ATTACK_POWER;
					massDamage += 10;
					usedPositions.push(rangedTargets[i].pos)
				}

				// Tiebreak => closer is better
				rangedDamage += range / 65536
				massDamage += range / 65536
			}

			if (massDamage >= 10) {
				rangedDamage = massDamage
			}
			else {
				rangedDamage = RANGED_ATTACK_POWER
			}
		}
	}

	if (numAttack || (!rangedDamage && numRanged)) {
		let targets = _pos.findInRange(Game.rooms[_pos.roomName].constructedWalls, 1)

		for (let target of targets) {
			if (!target.hits) continue

			if (!rangedDamage && numRanged) {
				rangedDamage = RANGED_ATTACK_POWER;
			}

			closeDamage = ATTACK_POWER;
			break;
		}

		if (!closeDamage) {
			targets = _pos.findInRange(FIND_HOSTILE_STRUCTURES, 1)
			for (let target of targets) {
				if (!target.hits) continue

				if (!rangedDamage && numRanged) {
					rangedDamage = RANGED_ATTACK_POWER;
				}

				closeDamage = ATTACK_POWER;
				break;
			}
		}

		if (!closeDamage) {
			targets = _pos.findInRange(Game.rooms[_pos.roomName].getAllHostileCreepsAndPowerCreeps(), 1)
			for (let target of targets) {
				if (!target.hits) continue

				if (!rangedDamage && numRanged) {
					rangedDamage = RANGED_ATTACK_POWER;
				}

				closeDamage = ATTACK_POWER;
				break;
			}
		}

		if (!closeDamage) {
			targets = _pos.findInRange(FIND_STRUCTURES, 1)
			for (let target of targets) {
				if (!target.hits) continue

				if (!rangedDamage && numRanged) {
					rangedDamage = RANGED_ATTACK_POWER;
				}

				closeDamage = ATTACK_POWER;
				break;
			}
		}
	}


	return rangedDamage * numRanged + closeDamage * numAttack;
}

// Pos is zerocreep pos
function getMostDamagingOrientation(zeroCreep, diagonalDir) {
	// if (!zeroCreep.room.hasHostiles && Math.random())
	let numRanged = 0
	let numAttack = 0

	// let hasCloseCombat = 0

	for (let otherCreepName of zeroCreep.mem.formationCreeps) {
		let creep = Game.creeps[otherCreepName]
		if (!creep) continue
		if (creep.hasBodypart(WORK)) {
			numAttack = Math.max(numAttack, creep.getBoostModifiedDismantle() * DISMANTLE_POWER / ATTACK_POWER)
		}
		else if (creep.hasBodypart(ATTACK)) {
			numAttack = Math.max(numAttack, creep.getBoostModifiedAttack())
		}

		numRanged = Math.max(numRanged, creep.getBoostModifiedRangedAttack())
	}

	// Our zero creep will be a high damage creep so we want position maximise his damage. 
	// In either case the position in the diagonal direction will be max damage so zero will go to one of the others
	let pos = zeroCreep.pos;
	let p1 = new RoomPosition(pos.x, pos.y, pos.roomName)
	let p2 = new RoomPosition(pos.x, pos.y, pos.roomName)

	// Was getting OOB errors. Not sure why
	// Compare TR and BL damages
	if (diagonalDir == TOP_LEFT) {
		if (p1.x < 49) p1.x += 1;
		if (p2.y < 49) p2.y += 1;
	}
	// TL BR
	else if (diagonalDir == TOP_RIGHT) {
		if (p2.x < 49) p2.x += 1;
		if (p2.y < 49) p2.y += 1;
	}
	// TR BL
	else if (diagonalDir == BOTTOM_RIGHT) {
		if (p1.x < 49) p1.x += 1;
		if (p2.y < 49) p2.y += 1;
	}
	// TL BR
	else if (diagonalDir == BOTTOM_LEFT) {
		if (p2.x < 49) p2.x += 1;
		if (p2.y < 49) p2.y += 1;
	}

	let d1 = getDamageAtPos(p1, numRanged, numAttack);
	let d2 = getDamageAtPos(p2, numRanged, numAttack);

	// Neither matter. Try to base it on future path
	if (d1 == d2) {
		for (let step of zeroCreep.mem.path) {
			if (step == LEFT && (diagonalDir == TOP_LEFT || diagonalDir == BOTTOM_LEFT)) {
				return LEFT
			}
			if (step == RIGHT && (diagonalDir == TOP_RIGHT || diagonalDir == BOTTOM_RIGHT)) {
				return RIGHT
			}
			if (step == BOTTOM && (diagonalDir == BOTTOM_RIGHT || diagonalDir == BOTTOM_LEFT)) {
				return BOTTOM
			}
			if (step == TOP && (diagonalDir == TOP_LEFT || diagonalDir == TOP_LEFT)) {
				return TOP
			}
		}
	}

	// console.log(p1, p2, d1, d2)

	if (diagonalDir == TOP_LEFT) {
		return d1 > d2 ? TOP : LEFT
	}
	else if (diagonalDir == TOP_RIGHT) {
		return d1 > d2 ? TOP : RIGHT
	}
	else if (diagonalDir == BOTTOM_RIGHT) {
		return d1 > d2 ? RIGHT : BOTTOM
	}
	else if (diagonalDir == BOTTOM_LEFT) {
		return d1 > d2 ? LEFT : BOTTOM
	}
}

function isOnTargetOrAdvancedOrRetreatPoint(creep) {
	let zeroName = creep.mem.formationCreeps[0];
	let zeroCreep = Game.creeps[zeroName];

	if (!zeroCreep || !zeroCreep.mem.targetPos) {
		return false
	}

	let dx
	let dy;

	switch (creep.mem.targetPos.retreatDir) {
		case TOP:
			dx = 0
			dy = -1
			break;
		case TOP_RIGHT:
			dx = 1
			dy = -1
			break;
		case RIGHT:
			dx = 1
			dy = 0
			break;
		case BOTTOM_RIGHT:
			dx = 1
			dy = 1
			break;
		case BOTTOM:
			dx = 0
			dy = 1
			break;
		case BOTTOM_LEFT:
			dx = -1
			dy = 1
			break;
		case LEFT:
			dx = -1
			dy = -1
			break;
		case TOP_LEFT:
			dx = -1
			dy = -1
			break;
	}


	return zeroCreep && zeroCreep.mem.targetPos && zeroCreep.mem.targetPos.retreatDir && !zeroCreep.setupFormation && zeroCreep.room.name == zeroCreep.mem.targetRoom &&
			((zeroCreep.pos.x == zeroCreep.mem.targetPos.x + dx && zeroCreep.pos.y == zeroCreep.mem.targetPos.y + dy) ||
			 (zeroCreep.pos.x == zeroCreep.mem.targetPos.x && zeroCreep.pos.y == zeroCreep.mem.targetPos.y) || 
			 (zeroCreep.pos.x == zeroCreep.mem.targetPos.advX1 && zeroCreep.pos.y == zeroCreep.mem.targetPos.advY1) ||
			 (zeroCreep.pos.x == zeroCreep.mem.targetPos.advX2 && zeroCreep.pos.y == zeroCreep.mem.targetPos.advY2))

}

function isOnTargetOrAdvancedPoint(creep) {
	let zeroName = creep.mem.formationCreeps[0];
	let zeroCreep = Game.creeps[zeroName];

	return zeroCreep && zeroCreep.mem.targetPos && zeroCreep.mem.targetPos.retreatDir && !zeroCreep.setupFormation && zeroCreep.room.name == zeroCreep.mem.targetRoom &&
			((zeroCreep.pos.x == zeroCreep.mem.targetPos.x && zeroCreep.pos.y == zeroCreep.mem.targetPos.y) || 
			 (zeroCreep.pos.x == zeroCreep.mem.targetPos.advX1 && zeroCreep.pos.y == zeroCreep.mem.targetPos.advY1) ||
			 (zeroCreep.pos.x == zeroCreep.mem.targetPos.advX2 && zeroCreep.pos.y == zeroCreep.mem.targetPos.advY2))

}

function isOnAdvancedPoint(creep) {
	let zeroName = creep.mem.formationCreeps[0];
	let zeroCreep = Game.creeps[zeroName];

	return zeroCreep && zeroCreep.mem.targetPos && zeroCreep.mem.targetPos.retreatDir && !zeroCreep.setupFormation && zeroCreep.room.name == zeroCreep.mem.targetRoom &&
			((zeroCreep.pos.x == zeroCreep.mem.targetPos.advX1 && zeroCreep.pos.y == zeroCreep.mem.targetPos.advY1) ||
			 (zeroCreep.pos.x == zeroCreep.mem.targetPos.advX2 && zeroCreep.pos.y == zeroCreep.mem.targetPos.advY2))

}


// function isOnTargetPos(creep) {
// 	let zeroName = creep.mem.formationCreeps[0];
// 	let zeroCreep = Game.creeps[zeroName];

// 	// Does this cover everything? I think so
// 	return zeroCreep && zeroCreep.mem.targetPos && zeroCreep.mem.targetPos.retreatDir && !zeroCreep.setupFormation && zeroCreep.pos.x == zeroCreep.mem.targetPos.x && zeroCreep.pos.y == zeroCreep.mem.targetPos.y && zeroCreep.room.name == zeroCreep.mem.targetRoom 
// }


// TODO: When we're blocked on a diagonal often we can go horizontal/vertical and do more damage.
//		 Can then hack the path to be still valid.


var formationAI = {
	trySideSlip : function(zeroCreep, sideLength, diagonalDir) {

		let direction0 = 0
		let direction1 = 0

		let direction0Valid = false
		let direction1Valid = false

		let pos0
		let pos1

		switch (diagonalDir) {
			case TOP_LEFT:
				direction0 = TOP;
				direction1 = LEFT;
				break;
			case TOP_RIGHT:
				direction0 = TOP;
				direction1 = RIGHT;
				break;
			case BOTTOM_LEFT:
				direction0 = BOTTOM;
				direction1 = LEFT;
				break;
			case BOTTOM_RIGHT:
				direction0 = BOTTOM;
				direction1 = RIGHT;
				break;
		}
		

		if (direction0 && !this.formationCheckBlockedBuildings(zeroCreep, sideLength, false, direction0) && (Math.random() < 0.2 || !this.formationCheckBlockedUnits(zeroCreep, direction0, sideLength, false))) {
			switch (direction0) {
				case TOP:
					if (zeroCreep.pos.y > 1) {
						direction0Valid = true
					}
					break
				case BOTTOM:
					if (zeroCreep.pos.y < 48) {
						direction0Valid = true
					}
					break
			}
		}
		if (direction1 && !this.formationCheckBlockedBuildings(zeroCreep, sideLength, false, direction1) && (Math.random() < 0.2 || !this.formationCheckBlockedUnits(zeroCreep, direction1, sideLength, false))) {
			switch (direction1) {
				case LEFT:
					if (zeroCreep.pos.x > 1) {
						direction1Valid = true
					}
					break
				case RIGHT:
					if (zeroCreep.pos.x < 48) {
						direction1Valid = true
					}
					break
			}
		}

		if (!direction0Valid && !direction1Valid) {
			return false
		}

		let damageAtCurrentPos = 0;
		let damageAtPos0 = 0;
		let damageAtPos1 = 0;

		let terrain = Game.map.getRoomTerrain(zeroCreep.room.name)

		for (let otherCreepName of zeroCreep.mem.formationCreeps) {
			let creep = Game.creeps[otherCreepName]
			if (!creep) continue

			let numAttack = 0
			let numRanged = 0

			if (creep.hasBodypart(WORK)) {
				numAttack = creep.getBoostModifiedDismantle() * DISMANTLE_POWER / ATTACK_POWER
			}
			else if (creep.hasBodypart(ATTACK)) {
				numAttack = creep.getBoostModifiedAttack()
			}

			numRanged = creep.getBoostModifiedRangedAttack()


			damageAtCurrentPos += getDamageAtPos(creep.pos, numRanged, numAttack)
			// console.log(creep, JSON.stringify(creep.pos), numRanged, numAttack, damageAtCurrentPos, getDamageAtPos(creep.pos, numRanged, numAttack))
			if (direction0Valid) {
				switch (direction0) {
					case TOP:
						if (creep.pos.y > 1) {
							pos0 = new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name)
						}
						break
					case BOTTOM:
						if (creep.pos.y < 48) {
							pos0 = new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name)
						}
						break
				}
				if (pos0) {
					if (terrain.get(pos0.x, pos0.y) & TERRAIN_MASK_WALL) {
						damageAtPos0 = 0
						direction0Valid = false
					}
					else {
						damageAtPos0 += getDamageAtPos(pos0, numRanged, numAttack)
					}
					// console.log(creep, JSON.stringify(pos0), numRanged, numAttack, damageAtPos0, getDamageAtPos(pos0, numRanged, numAttack))
				}
			}
			if (direction1Valid) {
				switch (direction1) {
					case LEFT:
						if (creep.pos.x > 1) {
							pos1 = new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name)
						}
						break
					case RIGHT:
						if (creep.pos.x < 48) {
							pos1 = new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name)
						}
						break
				}
				if (pos1) {
					if (terrain.get(pos1.x, pos1.y) & TERRAIN_MASK_WALL) {
						damageAtPos1 = 0
						direction1Valid = false
					}
					else {
						damageAtPos1 += getDamageAtPos(pos1, numRanged, numAttack)
					}
					// console.log(creep, JSON.stringify(pos1), numRanged, numAttack, damageAtPos1, getDamageAtPos(pos1, numRanged, numAttack))
				}
			}
		}


		let slipDir

		if (damageAtPos0 >= damageAtCurrentPos) {
			if (damageAtPos1 > damageAtPos0) {
				slipDir = direction1
			}
			else {
				slipDir = direction0
			}
		}
		else if (damageAtPos1 >= damageAtCurrentPos) {
			slipDir = direction1
		}
		// console.log(zeroCreep, JSON.stringify(pos0), JSON.stringify(pos1), damageAtCurrentPos, damageAtPos0, damageAtPos1, slipDir, diagonalDir)

		function setSlipDirMem(slipDir) {
			for (let otherCreepName of zeroCreep.mem.formationCreeps) {
				let creep = Game.creeps[otherCreepName]
				if (!creep) continue
				creep.mem.sideSlipDir = slipDir
			}
		}

		if (slipDir) {
			switch (diagonalDir) {
				// If take the full path then when it takes the right angle it goes wrong on the rotation logic.
				case TOP_LEFT:
					if (slipDir == TOP) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = TOP.toString() //+ LEFT.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					else if (slipDir == LEFT) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = LEFT.toString() //+ TOP.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					break;
				case TOP_RIGHT:
					if (slipDir == TOP) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = TOP.toString() //+ RIGHT.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					else if (slipDir == RIGHT) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = RIGHT.toString() //+ TOP.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					break;
				case BOTTOM_LEFT:
					if (slipDir == BOTTOM) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = BOTTOM.toString() //+ LEFT.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					else if (slipDir == LEFT) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = LEFT.toString() //+ BOTTOM.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					break;
				case BOTTOM_RIGHT:
					if (slipDir == BOTTOM) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = BOTTOM.toString() //+ RIGHT.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					else if (slipDir == RIGHT) {
						setSlipDirMem(slipDir);
						zeroCreep.mem.path = RIGHT.toString() // + BOTTOM.toString() + zeroCreep.mem.path.substr(1)
						return true
					}
					break;
			}
			
		}
		return false
	},


	moveBlkCreep : function(zeroCreep, sideLength, running, mask) {
		// We have trouble advancing into a far away creep. Rotate toward it.
		if (zeroCreep.room.name == zeroCreep.mem.targetRoom && zeroCreep.mem.directionalFormation && !this.formationCheckBlockedUnits(zeroCreep, 0, sideLength, false)) {
			let dir = zeroCreep.mem.path[0];

			let targetOrientation;

			if (parseInt(dir) == TOP) {
				targetOrientation = TOP;
			}
			else if (parseInt(dir) == RIGHT) {
				targetOrientation = RIGHT;
			}
			else if (parseInt(dir) == BOTTOM ) {
				targetOrientation = BOTTOM;
			}
			else if (parseInt(dir) == LEFT) {
				targetOrientation = LEFT;
			}
			else if (parseInt(dir) == TOP_RIGHT || parseInt(dir) == TOP_LEFT || parseInt(dir) == BOTTOM_RIGHT || parseInt(dir) == BOTTOM_LEFT) {
				targetOrientation = getMostDamagingOrientation(zeroCreep, parseInt(dir));
			}


			if (targetOrientation && zeroCreep.mem.formationOrientation != targetOrientation) {
				let allowRotation = true;
				let attackFormation = false;
				for (var i = 0; i < mask.length; i++) {
					let formationCreep = Game.creeps[zeroCreep.mem.formationCreeps[i]];
					if (formationCreep && formationCreep.hasBodypart(ATTACK)) {
						attackFormation = true;
					}
				}

				// Don't rotate ranged squads to face while on swamps.
				if (!attackFormation || running) {
					for (var i = 0; i < mask.length; i++) {
						let formationCreep = Game.creeps[zeroCreep.mem.formationCreeps[i]];
						if (formationCreep && formationCreep.pos.lookFor(LOOK_TERRAIN)[0] == "swamp") {
							allowRotation = false;
						}
					}
				}
				if (allowRotation) {
					this.formation2x2Rotate(targetOrientation, zeroCreep);
					return true;
				}
			}
		}
		return false;
	},

	formation2x2CheckBlockedReorient : function (zeroCreep) {
		let s0;
		let s1;
		let s2;
		let s3;
		let s4;

		if (zeroCreep.formation2x2CheckBlockedReorientRet) {
			return zeroCreep.formation2x2CheckBlockedReorientRet;
		}

		if (zeroCreep.room.name == zeroCreep.mem.targetRoom) {
			// let dir = parseInt(zeroCreep.mem.path[0]);
			let dir
			// Ok, our current path is blocked because of a building.
			if (zeroCreep.mem.path && zeroCreep.mem.path.length > 0 && formationAI.formationCheckBlockedBuildings(zeroCreep, 2, false, dir = parseInt(zeroCreep.mem.path[0]))) {

				var targetOrientation = 0;
				var currentOrientation = zeroCreep.mem.formationOrientation;

				var room = Game.rooms[zeroCreep.mem.targetRoom];

				if (room) {
					let x = zeroCreep.pos.x;
					let y = zeroCreep.pos.y;

					// Zero creep on 49 means we're actually looking from zero
					if (x == 49) {
						x = 0;
					}
					if (y == 49) {
						y = 0;
					}

					// Easy!
					if (dir == TOP || dir == LEFT || dir == RIGHT || dir == BOTTOM) {
						targetOrientation = dir;

						var t0;
						var t1;

						if (dir == TOP) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x, y - 1);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 1, y - 1);
						}
						else if (dir == RIGHT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 2, y);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 2, y + 1);

						}
						else if (dir == BOTTOM) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 1, y + 2);
							t1 = room.lookForAt(LOOK_STRUCTURES, x, y + 2);

						}
						else if (dir == LEFT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x - 1, y);
							t1 = room.lookForAt(LOOK_STRUCTURES, x - 1, y + 1);
						}

						t0 = _.filter(t0, function(struct) { return struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t1 = _.filter(t1, function(struct) { return struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });

						s0 = t0.length ? t0[0] : undefined;
						s1 = t1.length ? t1[0] : undefined;
					}
					// For the other four there are four cases:
					//  1) All three occupied, in which case we can stay (if we fit already) or rotate
					//  2) Two occupied with the same facing (turn to face)
					//  3) One occupied (turn to face... unless it's diagonal)
					//  4) Two occupied but facing different directions
					else {
						// TODO: Pick the most damaging for the whole formation
						var t0;
						var t1;
						var t2;
						var t3;
						var t4;

						// Go around clockwise throughout
						if (dir == TOP_LEFT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x - 1, y);
							t1 = room.lookForAt(LOOK_STRUCTURES, x - 1, y - 1);
							t2 = room.lookForAt(LOOK_STRUCTURES, x, y - 1);
							t3 = room.lookForAt(LOOK_STRUCTURES, x + 1, y - 1);
							t4 = room.lookForAt(LOOK_STRUCTURES, x - 1, y + 1);
						}
						else if (dir == TOP_RIGHT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 1, y - 1);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 2, y - 1);
							t2 = room.lookForAt(LOOK_STRUCTURES, x + 2, y);
							t3 = room.lookForAt(LOOK_STRUCTURES, x, y - 1);
							t4 = room.lookForAt(LOOK_STRUCTURES, x + 2, y + 1);
						}
						else if (dir == BOTTOM_RIGHT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 2, y + 1);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 2, y + 2);
							t2 = room.lookForAt(LOOK_STRUCTURES, x + 1, y + 2);
						}
						else if (dir == BOTTOM_LEFT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x, y + 2);
							t1 = room.lookForAt(LOOK_STRUCTURES, x - 1, y + 2);
							t2 = room.lookForAt(LOOK_STRUCTURES, x - 1, y + 1);
						}

						t0 = _.filter(t0, function(struct) { return struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t1 = _.filter(t1, function(struct) { return struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t2 = _.filter(t2, function(struct) { return struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t3 = _.filter(t3, function(struct) { return struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t4 = _.filter(t4, function(struct) { return struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });


						s0 = t0.length ? t0[0] : undefined;
						s1 = t1.length ? t1[0] : undefined;
						s2 = t2.length ? t2[0] : undefined;
						s3 = t3.length ? t3[0] : undefined;
						s4 = t4.length ? t4[0] : undefined;

						if ((s0 && s1 && s2) || (!s0 && s1 && !s2) || (s0 && !s1 && s2)) {
							if (dir == TOP_LEFT && currentOrientation != TOP && currentOrientation != LEFT) {
								if (s3) {
									targetOrientation = TOP;
								}
								else if (s4) {
									targetOrientation = LEFT;
								}
								else {
									targetOrientation = Math.random() > 0.5 ? TOP : LEFT;
								}
							}
							else if (dir == TOP_RIGHT && currentOrientation != TOP && currentOrientation != RIGHT) {
								if (s3) {
									targetOrientation = TOP;
								}
								else if (s4) {
									targetOrientation = RIGHT;
								}
								else {
									targetOrientation = Math.random() > 0.5 ? TOP : RIGHT;
								}
							}
							else if (dir == BOTTOM_RIGHT && currentOrientation != BOTTOM && currentOrientation != RIGHT) {
								targetOrientation = Math.random() > 0.5 ? BOTTOM : RIGHT;
							}
							else if (dir == BOTTOM_LEFT && currentOrientation != BOTTOM && currentOrientation != LEFT) {
								targetOrientation = Math.random() > 0.5 ? BOTTOM : LEFT;
							}
							else {
								targetOrientation = currentOrientation;
							}
						}
						else if ((s0 && s1) || (s0 && !s1 && !s2)) {
							if (dir == TOP_LEFT && currentOrientation != LEFT) {
								targetOrientation = LEFT;
							}
							else if (dir == TOP_RIGHT && currentOrientation != TOP) {
								targetOrientation = TOP;
							}
							else if (dir == BOTTOM_RIGHT && currentOrientation != RIGHT) {
								targetOrientation = RIGHT;
							}
							else if (dir == BOTTOM_LEFT && currentOrientation != BOTTOM) {
								targetOrientation = BOTTOM;
							}
							else {
								targetOrientation = currentOrientation;
							}
						}
						else if (s1 && s2 || (!s0 && !s1 && s2)) {
							if (dir == TOP_LEFT && currentOrientation != TOP) {
								targetOrientation = TOP;
							}
							else if (dir == TOP_RIGHT && currentOrientation != RIGHT) {
								targetOrientation = RIGHT;
							}
							else if (dir == BOTTOM_RIGHT && currentOrientation != BOTTOM) {
								targetOrientation = BOTTOM;
							}
							else if (dir == BOTTOM_LEFT && currentOrientation != LEFT) {
								targetOrientation = LEFT;
							}
							else {
								targetOrientation = currentOrientation;
							}
						}
					}


					if (targetOrientation) {
						// console.log("New orientation", targetOrientation)
						for (var formationCreepName of zeroCreep.mem.formationCreeps) {
							var formationCreep = Game.creeps[formationCreepName];
							if (formationCreep) {
								formationCreep.mem.targetFormationOrientation = targetOrientation;
							}
						}
					}
					else {
						console.log(zeroCreep.name, "blocked but no orientation set", dir, t0, t1, t2, s0, s1, s2)
					}
				}
			}
		}

		let ret = {}
		ret.s0 = s0;
		ret.s1 = s1;
		ret.s2 = s2;

		zeroCreep.formation2x2CheckBlockedReorientRet = ret;

		return ret;
	},

	formation2x2CheckBlockedReorientCC : function (zeroCreep) {
		if (zeroCreep.formation2x2CheckBlockedReorientRetCC) {
			return zeroCreep.formation2x2CheckBlockedReorientRetCC;
		}

		let s0;
		let s1;
		let s2;
		let s3;
		let s4;

		if (zeroCreep.room.name == zeroCreep.mem.targetRoom) {
			let dir
			// Ok, our current path is blocked because of a building.
			if (zeroCreep.mem.path && zeroCreep.mem.path.length > 0 && formationAI.formationCheckBlockedBuildings(zeroCreep, 2, false, dir = parseInt(zeroCreep.mem.path[0]))) {

				var currentOrientation = zeroCreep.mem.formationOrientation;

				var room = Game.rooms[zeroCreep.mem.targetRoom];

				if (room) {
					let x = zeroCreep.pos.x;
					let y = zeroCreep.pos.y;

					// Zero creep on 49 means we're actually looking from zero
					if (x == 49) {
						x = 0;
					}
					if (y == 49) {
						y = 0;
					}

					// Easy!
					if (dir == TOP || dir == LEFT || dir == RIGHT || dir == BOTTOM) {
						var t0;
						var t1;

						if (dir == TOP) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x, y - 1);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 1, y - 1);
						}
						else if (dir == RIGHT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 2, y);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 2, y + 1);

						}
						else if (dir == BOTTOM) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 1, y + 2);
							t1 = room.lookForAt(LOOK_STRUCTURES, x, y + 2);

						}
						else if (dir == LEFT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x - 1, y);
							t1 = room.lookForAt(LOOK_STRUCTURES, x - 1, y + 1);
						}

						t0 = _.filter(t0, function(struct) { return !struct.my && struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t1 = _.filter(t1, function(struct) { return !struct.my && struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });

						s0 = t0.length ? t0[0] : undefined;
						s1 = t1.length ? t1[0] : undefined;
					}
					// For the other four there are four cases:
					//  1) All three occupied, in which case we can stay (if we fit already) or rotate
					//  2) Two occupied with the same facing (turn to face)
					//  3) One occupied (turn to face... unless it's diagonal)
					//  4) Two occupied but facing different directions
					else {
						var t0;
						var t1;
						var t2;

						// Go around clockwise throughout
						if (dir == TOP_LEFT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x - 1, y);
							t1 = room.lookForAt(LOOK_STRUCTURES, x - 1, y - 1);
							t2 = room.lookForAt(LOOK_STRUCTURES, x, y - 1);
						}
						else if (dir == TOP_RIGHT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 1, y - 1);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 2, y - 1);
							t2 = room.lookForAt(LOOK_STRUCTURES, x + 2, y);
						}
						else if (dir == BOTTOM_RIGHT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x + 2, y + 1);
							t1 = room.lookForAt(LOOK_STRUCTURES, x + 2, y + 2);
							t2 = room.lookForAt(LOOK_STRUCTURES, x + 1, y + 2);
						}
						else if (dir == BOTTOM_LEFT) {
							t0 = room.lookForAt(LOOK_STRUCTURES, x, y + 2);
							t1 = room.lookForAt(LOOK_STRUCTURES, x - 1, y + 2);
							t2 = room.lookForAt(LOOK_STRUCTURES, x - 1, y + 1);
						}

						t0 = _.filter(t0, function(struct) { return !struct.my && struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t1 = _.filter(t1, function(struct) { return !struct.my && struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });
						t2 = _.filter(t2, function(struct) { return !struct.my && struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER });


						s0 = t0.length ? t0[0] : undefined;
						s1 = t1.length ? t1[0] : undefined;
						s2 = t2.length ? t2[0] : undefined;
					}

					this.formation2x2CheckBlockedReorientV2(zeroCreep)
				}
			}
		}

		let ret = {}
		ret.s0 = s0;
		ret.s1 = s1;
		ret.s2 = s2;

		zeroCreep.formation2x2CheckBlockedReorientRetCC = ret;

		return ret;
	},


	formation2x2CheckBlockedReorientV2 : function (zeroCreep) {
		if (zeroCreep.formation2x2CheckBlockedReorientRetV2) {
			return;
		}

		if (zeroCreep.room.name == zeroCreep.mem.targetRoom) {
			let dir
			// Ok, our current path is blocked because of a building.
			if (zeroCreep.mem.path && zeroCreep.mem.path.length > 0 && formationAI.formationCheckBlockedBuildings(zeroCreep, 2, false, dir = parseInt(zeroCreep.mem.path[0]))) {
				// let dir = parseInt(zeroCreep.mem.path[0]);

				let targetOrientation
				if (parseInt(dir) == TOP) {
					targetOrientation = TOP;
				}
				else if (parseInt(dir) == RIGHT) {
					targetOrientation = RIGHT;
				}
				else if (parseInt(dir) == BOTTOM ) {
					targetOrientation = BOTTOM;
				}
				else if (parseInt(dir) == LEFT) {
					targetOrientation = LEFT;
				}
				else if (parseInt(dir) == TOP_RIGHT || parseInt(dir) == TOP_LEFT || parseInt(dir) == BOTTOM_RIGHT || parseInt(dir) == BOTTOM_LEFT) {
					targetOrientation = getMostDamagingOrientation(zeroCreep, parseInt(dir));
				}

				zeroCreep.formation2x2CheckBlockedReorientRetV2 = 1

				if (targetOrientation) {
					// console.log("New orientation", targetOrientation)
					for (var formationCreepName of zeroCreep.mem.formationCreeps) {
						var formationCreep = Game.creeps[formationCreepName];
						if (formationCreep) {
							formationCreep.mem.targetFormationOrientation = targetOrientation;
						}
					}
				}
				else {
					console.log(zeroCreep.name, "blocked but no orientation set V2", dir)
				}
			}
		}
	},

	// TODO: We need to put ourselves in sensible places not just defaulting to "top"
	// Lets
	formation2x2GetFlushOrientation : function(targetX, targetY, floodArray, room, formationCreepNames) {
		// Nice to have, but I think it screws up my "is there another formation sitting on this one" logic below
		// if (room) {
		// 	global.flushOrientation2x2s = global.flushOrientation2x2s || {};
		// 	global.flushOrientation2x2s[room.name] = global.flushOrientation2x2s[room.name] || {};
		// 	global.flushOrientation2x2s[room.name][targetX] = global.flushOrientation2x2s[room.name][targetX] || {};

		// 	if (global.flushOrientation2x2s[room.name][targetX][targetY] && Math.random() > 0.1) {
		// 		return global.flushOrientation2x2s[room.name][targetX][targetY];
		// 	}
		// }


		// There's a bunch of locations we can go and remain flush to the target.
		// We don't know of the orientation of the target relative to positions we could go
		// Top:
		// (-1, 1)
		// (0, 1)
		// Right:
		// (-2, 0)
		// (-2, -1)
		// Bottom:
		// (-1, -2)
		// (0, -2)
		// Left:
		// (1, 0)
		// (1, -1)
		var targetLoc = {};

		function checkPos(targetLoc) {
			var fail = false;
			let otherCreepCount = 0;
			for (var j = 0; j < 2; j++) {
				if (targetLoc.x + j < 0 || targetLoc.x + j > 49)  {
					return true;
				}
				for (var k = 0; k < 2; k++) {
					if (targetLoc.y + k < 0 || targetLoc.y + k > 49) {
						return true;
					}
					if (floodArray && parseInt(floodArray[targetLoc.x + j][targetLoc.y + k]) < 4) {
						return true;
					}
					if (room && formationCreepNames) {
						let otherCreep = room.lookForAt(LOOK_CREEPS, targetLoc.x + j, targetLoc.y + k)[0];
						if (otherCreep && !formationCreepNames.includes(otherCreep.name) && otherCreep.assaulter) {
							return true;
						}
					}
				}
			}
			return fail;
		}

		for (var i = 0; i < 2; i++) {
			targetLoc.x = targetX - i;
			targetLoc.y = targetY + 1;

			// Top
			var fail = checkPos(targetLoc)
			if (!fail) {
				// if (room) global.flushOrientation2x2s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": TOP};
				return {"targetLoc": targetLoc, "o": TOP};
			}

			// Bottom
			targetLoc.x = targetX - i;
			targetLoc.y = targetY - 2;

			fail = checkPos(targetLoc)
			if (!fail) {
				// if (room) global.flushOrientation2x2s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": BOTTOM};
				return {"targetLoc": targetLoc, "o": BOTTOM};
			}

			// Right
			targetLoc.x = targetX - 2;
			targetLoc.y = targetY - i;

			fail = checkPos(targetLoc)
			if (!fail) {
				// if (room) global.flushOrientation2x2s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": RIGHT};
				return {"targetLoc": targetLoc, "o": RIGHT};
			}

			// Left
			targetLoc.x = targetX + 1;
			targetLoc.y = targetY - i;

			fail = checkPos(targetLoc)
			if (!fail) {
				// if (room) global.flushOrientation2x2s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": LEFT};
				return {"targetLoc": targetLoc, "o": LEFT};
			}
		}
		return undefined
	},

	formation3x3GetFlushOrientation : function(targetX, targetY, floodArray, room, formationCreepNames) {
		if (room) {
			global.flushOrientation3x3s = global.flushOrientation3x3s || {};
			global.flushOrientation3x3s[room.name] = global.flushOrientation3x3s[room.name] || {};
			global.flushOrientation3x3s[room.name][targetX] = global.flushOrientation3x3s[room.name][targetX] || {};

			if (global.flushOrientation3x3s[room.name][targetX][targetY] && Math.random() > 0.1) {
				return global.flushOrientation3x3s[room.name][targetX][targetY];
			}
		}

		var targetLoc = {};

		function checkPos(targetLoc) {
			var fail = false;
			for (var j = 0; j < 3; j++) {
				if (targetLoc.x + j < 0 || targetLoc.x + j > 49) {
					return true
				}
				for (var k = 0; k < 3; k++) {
					if (targetLoc.y + k < 0 || targetLoc.y + k > 49) {
						return true
					}
					if (floodArray && parseInt(floodArray[targetLoc.x + j][targetLoc.y + k]) < 4) {
						return true;
					}
				}
			}
			return fail;
		}

		targetLoc.x = targetX - 1;
		targetLoc.y = targetY + 1;

		// Top
		var fail = checkPos(targetLoc)
		if (!fail) {
			if (room) global.flushOrientation3x3s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": TOP};
			return {"targetLoc": targetLoc, "o": TOP};
		}

		// Bottom
		targetLoc.x = targetX - 1;
		targetLoc.y = targetY - 3;

		fail = checkPos(targetLoc)
		if (!fail) {
			if (room) global.flushOrientation3x3s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": BOTTOM};
			return {"targetLoc": targetLoc, "o": BOTTOM};
		}

		// Right
		targetLoc.x = targetX - 3;
		targetLoc.y = targetY - 1;

		fail = checkPos(targetLoc)
		if (!fail) {
			if (room) global.flushOrientation3x3s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": RIGHT};
			return {"targetLoc": targetLoc, "o": RIGHT};
		}

		// Left
		targetLoc.x = targetX + 1;
		targetLoc.y = targetY - 1;

		fail = checkPos(targetLoc)
		if (!fail) {
			if (room) global.flushOrientation3x3s[room.name][targetX][targetY] = {"targetLoc": targetLoc, "o": LEFT};
			return {"targetLoc": targetLoc, "o": LEFT};
		}

		return undefined
	},

	formation2x2Rotate : function(targetOrientation, zeroCreep) {
		let c0 = Game.creeps[zeroCreep.mem.formationCreeps[0]];
		let c1 = Game.creeps[zeroCreep.mem.formationCreeps[1]];
		let c2 = Game.creeps[zeroCreep.mem.formationCreeps[2]];
		let c3 = Game.creeps[zeroCreep.mem.formationCreeps[3]];

		if (!c0) return

		// Don't rotate if split across rooms.
		let room0name = c0.room.name;
		if (!c1 || c1.room.name != room0name) return;
		if (!c2 || c2.room.name != room0name) return;
		if (!c3 || c3.room.name != room0name) return;

		c0.mem.lastFPos = c0.pos;
		c1.mem.lastFPos = c1.pos;
		c2.mem.lastFPos = c2.pos;
		c3.mem.lastFPos = c3.pos;

		if ((targetOrientation + 4 - 1) % 8 + 1 === zeroCreep.mem.formationOrientation) {
			c0.move(c0.pos.getDirectionTo(c3.pos))
			c1.move(c1.pos.getDirectionTo(c2.pos))
			c2.move(c2.pos.getDirectionTo(c1.pos))
			c3.move(c3.pos.getDirectionTo(c0.pos))

			// Mirror
			for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
				var formationCreep = Game.creeps[formationCreepName];
				if (formationCreep) {
					var s = formationCreep.mem.formationCreeps[0];
					formationCreep.mem.formationCreeps[0] = formationCreep.mem.formationCreeps[3];
					formationCreep.mem.formationCreeps[3] = s;

					var s = formationCreep.mem.formationCreeps[1];
					formationCreep.mem.formationCreeps[1] = formationCreep.mem.formationCreeps[2];
					formationCreep.mem.formationCreeps[2] = s;
				}
			}
		}
		else if ((targetOrientation + 2 - 1) % 8 + 1 === zeroCreep.mem.formationOrientation) {
			c0.move(c0.pos.getDirectionTo(c2.pos))
			c1.move(c1.pos.getDirectionTo(c0.pos))
			c2.move(c2.pos.getDirectionTo(c3.pos))
			c3.move(c3.pos.getDirectionTo(c1.pos))

			// Rotate anti-clockwise
			for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
				var formationCreep = Game.creeps[formationCreepName];
				if (formationCreep) {
					var s = formationCreep.mem.formationCreeps[0];
					formationCreep.mem.formationCreeps[0] = formationCreep.mem.formationCreeps[1];
					formationCreep.mem.formationCreeps[1] = formationCreep.mem.formationCreeps[3];
					formationCreep.mem.formationCreeps[3] = formationCreep.mem.formationCreeps[2];
					formationCreep.mem.formationCreeps[2] = s;
				}
			}
		}
		else if ((targetOrientation + 6 - 1) % 8 + 1 === zeroCreep.mem.formationOrientation) {
			c0.move(c0.pos.getDirectionTo(c1.pos))
			c1.move(c1.pos.getDirectionTo(c3.pos))
			c2.move(c2.pos.getDirectionTo(c0.pos))
			c3.move(c3.pos.getDirectionTo(c2.pos))

			// Rotate clockwise
			for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
				var formationCreep = Game.creeps[formationCreepName];
				if (formationCreep) {
					var s = formationCreep.mem.formationCreeps[0];
					formationCreep.mem.formationCreeps[0] = formationCreep.mem.formationCreeps[2];
					formationCreep.mem.formationCreeps[2] = formationCreep.mem.formationCreeps[3];
					formationCreep.mem.formationCreeps[3] = formationCreep.mem.formationCreeps[1];
					formationCreep.mem.formationCreeps[1] = s;
				}
			}
		}
		else {
			console.log(zeroCreep.mem.formationOrientation, targetOrientation)
			console.log((targetOrientation + 4 - 1) % 8 + 1)
			console.log((targetOrientation + 2 - 1) % 8 + 1)
			console.log((targetOrientation + 6 - 1) % 8 + 1)
			console.log("Invalid formation specified")
		}

		for (var formationCreepName of zeroCreep.mem.formationCreeps) {
			var formationCreep = Game.creeps[formationCreepName];
			if (formationCreep) {
				delete formationCreep.mem.path;
				formationCreep.mem.formationOrientation = targetOrientation;
				formationCreep.mem.targetFormationOrientation = targetOrientation;
			}
		}

		// Flip
		/*if ((targetOrientation + 4 - 1) % 8 + 1 === zeroCreep.mem.formationOrientation) {
			c0.move(c0.pos.getDirectionTo(c3.pos))
			c1.move(c1.pos.getDirectionTo(c2.pos))
			c2.move(c2.pos.getDirectionTo(c1.pos))
			c3.move(c3.pos.getDirectionTo(c0.pos))

			// Mirror
			for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
				var formationCreep = Game.creeps[formationCreepName];
				if (formationCreep) {
					var s = formationCreep.memory.formationCreeps[0];
					formationCreep.memory.formationCreeps[0] = formationCreep.memory.formationCreeps[3];
					formationCreep.memory.formationCreeps[3] = s;

					var s = formationCreep.memory.formationCreeps[1];
					formationCreep.memory.formationCreeps[1] = formationCreep.memory.formationCreeps[2];
					formationCreep.memory.formationCreeps[2] = s;
				}
			}
		}
		// Rotate
		else if ((targetOrientation + 2 - 1) % 8 + 1 === zeroCreep.mem.formationOrientation) {
			// c1.move(c1.pos.getDirectionTo(c2.pos))
			// c2.move(c2.pos.getDirectionTo(c1.pos))

			// // Rotate anti-clockwise
			// for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
			// 	var formationCreep = Game.creeps[formationCreepName];
			// 	if (formationCreep) {
			// 		var s = formationCreep.memory.formationCreeps[2];
			// 		formationCreep.memory.formationCreeps[2] = formationCreep.memory.formationCreeps[1];
			// 		formationCreep.memory.formationCreeps[1] = s

			// 		s = formationCreep.memory.formationCreeps[0];
			// 		formationCreep.memory.formationCreeps[0] = formationCreep.memory.formationCreeps[3];
			// 		formationCreep.memory.formationCreeps[3] = s;
			// 	}
			// }
			c0.move(c0.pos.getDirectionTo(c2.pos))
			c1.move(c1.pos.getDirectionTo(c0.pos))
			c2.move(c2.pos.getDirectionTo(c3.pos))
			c3.move(c3.pos.getDirectionTo(c1.pos))

			// Rotate anti-clockwise
			for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
				var formationCreep = Game.creeps[formationCreepName];
				if (formationCreep) {
					var s = formationCreep.memory.formationCreeps[0];
					formationCreep.memory.formationCreeps[0] = formationCreep.memory.formationCreeps[1];
					formationCreep.memory.formationCreeps[1] = formationCreep.memory.formationCreeps[3];
					formationCreep.memory.formationCreeps[3] = formationCreep.memory.formationCreeps[2];
					formationCreep.memory.formationCreeps[2] = s;
				}
			}
		}
		else if ((targetOrientation + 6 - 1) % 8 + 1 === zeroCreep.mem.formationOrientation) {
			// c0.move(c0.pos.getDirectionTo(c3.pos))
			// c3.move(c3.pos.getDirectionTo(c0.pos))

			// // Rotate clockwise
			// for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
			// 	var formationCreep = Game.creeps[formationCreepName];
			// 	if (formationCreep) {
			// 		var s = formationCreep.memory.formationCreeps[0];
			// 		formationCreep.memory.formationCreeps[0] = formationCreep.memory.formationCreeps[3];
			// 		formationCreep.memory.formationCreeps[3] = s;

			// 		s = formationCreep.memory.formationCreeps[1];
			// 		formationCreep.memory.formationCreeps[2] = formationCreep.memory.formationCreeps[1];
			// 		formationCreep.memory.formationCreeps[1] = s
			// 	}
			// }
			c0.move(c0.pos.getDirectionTo(c1.pos))
			c1.move(c1.pos.getDirectionTo(c3.pos))
			c2.move(c2.pos.getDirectionTo(c0.pos))
			c3.move(c3.pos.getDirectionTo(c2.pos))

			// Rotate clockwise
			for (var formationCreepName of _.clone(zeroCreep.mem.formationCreeps)) {
				var formationCreep = Game.creeps[formationCreepName];
				if (formationCreep) {
					var s = formationCreep.memory.formationCreeps[0];
					formationCreep.memory.formationCreeps[0] = formationCreep.memory.formationCreeps[2];
					formationCreep.memory.formationCreeps[2] = formationCreep.memory.formationCreeps[3];
					formationCreep.memory.formationCreeps[3] = formationCreep.memory.formationCreeps[1];
					formationCreep.memory.formationCreeps[1] = s;
				}
			}
		}
		else {
			console.log(zeroCreep.mem.formationOrientation, targetOrientation)
			console.log((targetOrientation + 4 - 1) % 8 + 1)
			console.log((targetOrientation + 2 - 1) % 8 + 1)
			console.log((targetOrientation + 6 - 1) % 8 + 1)
			console.log("Invalid formation specified")
		}

		for (var formationCreepName of zeroCreep.mem.formationCreeps) {
			var formationCreep = Game.creeps[formationCreepName];
			if (formationCreep) {
				delete formationCreep.memory.path;
				formationCreep.memory.formationOrientation = targetOrientation;
				formationCreep.memory.targetFormationOrientation = targetOrientation;
			}
		}*/
	},

	formationCheckBlockedUnits : function(zeroCreep, step, sideLength, usingRetreatDir) {
		if (zeroCreep.ignoreFormationBlockingCreeps) return
		// While we can be blocked if we're on the edge of the room, the alternative causes
		// annoying bouncing, so ignore that.
		let edge = false;
		for (var formationCreepName of zeroCreep.mem.formationCreeps) {
			var formationCreep = Game.creeps[formationCreepName];
			if (formationCreep && util.isEdgeOfRoom(formationCreep.pos)) {
				edge = true;
			}
		}

		if (edge) {
			sideLength--;
		}

		var nearbyCreeps = zeroCreep.pos.findInRange(FIND_CREEPS, 1 + sideLength).concat(zeroCreep.pos.findInRange(FIND_POWER_CREEPS, 1 + sideLength));
		let blockingCreep;

		for (var otherCreep of nearbyCreeps) {
			if (zeroCreep.mem.formationCreeps.includes(otherCreep.name)) continue;

			let dist = sideLength;
			let sub = 0;
			if ((otherCreep.fatigue || 0) > 0 || otherCreep.notMoving || !otherCreep.hasActiveBodypart(MOVE)) {
				dist -= 1;
				sub = -1;
			}
			// Moons know not to move into the way.
			else if (otherCreep.moon && otherCreep.mem.parentFormationCreeps && otherCreep.mem.parentFormationCreeps.includes(zeroCreep.name)) {
				dist -= 1;
				sub = -1;
			}
			else if (usingRetreatDir && otherCreep.mem.targetPos && otherCreep.mem.targetPos.retreatDir && otherCreep.mem.targetPos.retreatDir == zeroCreep.mem.targetPos.retreatDir && isOnTargetOrAdvancedPoint(otherCreep)) {
				dist -= 1;
				sub = -1;
			}

			let dx = zeroCreep.pos.x - otherCreep.pos.x
			let dy = zeroCreep.pos.y - otherCreep.pos.y

			switch(step) {
				case LEFT:
					if (dx <= 2 + sub && dx >= 1 - dist && dy <= 1 + sub && dy >= 0 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				case TOP_LEFT:
					if (dx <= 2 + sub && dx >= 1 - dist && dy <= 2 + sub && dy >= 1 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				case TOP:
					if (dx <= 1 + sub && dx >= 0 - dist && dy <= 2 + sub && dy >= 1 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				case TOP_RIGHT:
					if (dx <= 0 + sub && dx >= -1 - dist && dy <= 2 + sub && dy >= 1 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				case RIGHT:
					if (dx <= 0 + sub && dx >= -1 - dist && dy <= 1 + sub && dy >= 0 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				case BOTTOM_RIGHT:
					if (dx <= 0 + sub && dx >= -1 - dist && dy <= 0 + sub && dy >= -1 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				case BOTTOM:
					if (dx <= 1 + sub && dx >= 0 - dist && dy <= 0 + sub && dy >= -1 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				case BOTTOM_LEFT:
					if (dx <= 2 + sub && dx >= 1 - dist && dy <= 0 + sub && dy >= -1 - dist) {
						blockingCreep = otherCreep;
					}
					break;
				default:
					if (dx <= 1 + sub && dx >= 0 - dist && dy <= 1 + sub && dy >= 0 - dist) {
						blockingCreep = otherCreep;

					}
					break;
			}

			if (blockingCreep && blockingCreep.my) blockingCreep.mem.blockingFormation = blockingCreep.moon ? 2 : 3;

			// If we break here we don't set blocking formation on all the blocking ones
			// if (potentiallyBlocked) break;
		}
		return blockingCreep
	},

	formationCheckBlockedBuildings : function(zeroCreep, sideLength, mark, step) {
		var potentiallyBlocked = false;

		if (!mark) {
			zeroCreep.blockedWithSideLength = zeroCreep.blockedWithSideLength || {}
			if (zeroCreep.blockedWithSideLength[sideLength.toString() + (step || 0).toString()] !== undefined) {
				return zeroCreep.blockedWithSideLength[sideLength.toString() + (step || 0).toString()]
			}
		}

		// Check buildings
		var nearbyBuildings = zeroCreep.pos.findInRange(FIND_STRUCTURES, sideLength, {
			filter: (structure) => {
				return (structure.structureType != STRUCTURE_CONTAINER && structure.structureType != STRUCTURE_ROAD && (structure.structureType != STRUCTURE_RAMPART || !structure.my))
			}
		});

		// let step = parseInt(zeroCreep.mem.path[0]);

		// if (mark) {
		// 	zeroCreep.room.memory.markedBuildings = zeroCreep.room.memory.markedBuildings || {}
		// }

		for (var building of nearbyBuildings) {
			let blocked = false;

			let dx = zeroCreep.pos.x - building.pos.x;
			let dy = zeroCreep.pos.y - building.pos.y;

			switch(step) {
				case LEFT:
					if (dx <= 1 && dx >= 2 - sideLength && dy <= 0 && dy >= 1 - sideLength) {
						blocked = building;
					}
					break;
				case TOP_LEFT:
					if (dx <= 1 && dx >= 2 - sideLength && dy <= 1 && dy >= 2 - sideLength) {
						blocked = building;
					}
					break;
				case TOP:
					if (dx <= 0 && dx >= 1 - sideLength && dy <= 1 && dy >= 2 - sideLength) {
						blocked = building;
					}
					break;
				case TOP_RIGHT:
					if (dx <= -1 && dx >= 0 - sideLength && dy <= 1 && dy >= 2 - sideLength) {
						blocked = building;
					}
					break;
				case RIGHT:
					if (dx <= -1 && dx >= 0 - sideLength && dy <= 0 && dy >= 1 - sideLength) {
						blocked = building;
					}
					break;
				case BOTTOM_RIGHT:
					if (dx <= -1 && dx >= 0 - sideLength && dy <= -1 && dy >= 0 - sideLength) {
						blocked = building;
					}
					break;
				case BOTTOM:
					if (dx <= 0 && dx >= 1 - sideLength && dy <= -1 && dy >= 0 - sideLength) {
						blocked = building;
					}
					break;
				case BOTTOM_LEFT:
					if (dx <= 1 && dx >= 2 - sideLength && dy <= -1 && dy >= 0 - sideLength) {
						blocked = building;
					}
					break;
			}
			potentiallyBlocked = potentiallyBlocked || blocked;

			if (potentiallyBlocked && !mark) {
				return true;
			}
			else if (blocked && mark) {
				blocked.blockingFormation = 1
				// if (building.structureType == STRUCTURE_RAMPART || building.structureType == STRUCTURE_WALL) {
				// 	let valid = true;

				// 	// Don't have to worry about ramparts that the enemy can't stand on. Nibbles are for
				// 	// buildings they can stand on.
				// 	if (building.structureType == STRUCTURE_RAMPART) {
				// 		let otherBuildings = building.pos.lookFor(LOOK_STRUCTURES);
				// 		for (let otherBuilding of otherBuildings) {
				// 			if (otherBuilding.structureType != STRUCTURE_RAMPART &&
				// 				otherBuilding.structureType != STRUCTURE_CONTAINER &&
				// 				otherBuilding.structureType != STRUCTURE_ROAD) {
				// 				valid = false;
				// 				break;
				// 			}
				// 		}
				// 	}

				// 	// if (valid) {
				// 	// 	zeroCreep.room.memory.markedBuildings[building.id] = zeroCreep.room.memory.markedBuildings[building.id] || {c: 0, t: Game.time};
				// 	// 	if (zeroCreep.room.memory.markedBuildings[building.id].t != Game.time) {
				// 	// 		zeroCreep.room.memory.markedBuildings[building.id].c++;
				// 	// 		zeroCreep.room.memory.markedBuildings[building.id].t = Game.time;
				// 	// 		// console.log(zeroCreep.room.memory.markedBuildings[building.id].c, building.pos.x, building.pos.y)
				// 	// 		zeroCreep.room.visual.text(zeroCreep.room.memory.markedBuildings[building.id].c, building.pos.x, building.pos.y)
				// 	// 	}
				// 	// }
				// }
			}
		}

		zeroCreep.blockedWithSideLength = zeroCreep.blockedWithSideLength || {}
		zeroCreep.blockedWithSideLength[sideLength.toString() + (step || 0).toString()] = potentiallyBlocked

		// if (potentiallyBlocked) console.log("Formation blocked", zeroCreep.mem.path[0])

		return potentiallyBlocked;
	},


	getDamageForPos: function(creep, room, pos, nearbyHostiles, closeHostiles, opponentPushes, advancing, anySwamp) {
		let towers = room.towers;
		let eTotalAttack = 0;
		let eTotalRanged = 0;

		// console.log(pos, opponentPushes)
		let opponentSafePush = false;
		let edge = false
		if (pos.x <= 1 || pos.x >= 48 || pos.y <= 1 || pos.y >= 48) {
			edge = true;
			// opponentPushes = true;
		}

		// WE DON'T KNOW ABOUT ANY CREEPS OUTSIDE OF RANGE 4

		let numRampartsClose = 0;
		let numRampartsFar = 0;

		// Don't push next to ramparts
		if (Game.rooms[pos.roomName]) {
			for (let i = pos.x - 1; i <= pos.x + 1; i++) {
				if (i < 0 || i > 49) continue
				for (let j = pos.y - 1; j <= pos.y + 1; j++) {
					if (j < 0 || j > 49) continue

					let structs = Game.rooms[pos.roomName].lookForAt(LOOK_STRUCTURES, i, j);

					let rampart = false;
					let blocked = false;

					for (let struct of structs) {
						if (struct.structureType == STRUCTURE_RAMPART) {							
							rampart = true;
						}
						else if (OBSTACLE_OBJECT_TYPES.includes(struct.structureType)) {
							blocked = true;
							break;
						}
					}

					if (!blocked && rampart) {
						numRampartsClose++
						opponentSafePush = true;
					}
				}
			}
			for (let i = pos.x - 3; i <= pos.x + 3; i++) {
				if (i < 0 || i > 49) continue
				for (let j = pos.y - 3; j <= pos.y + 3; j++) {
					if (j < 0 || j > 49) continue

					let structs = Game.rooms[pos.roomName].lookForAt(LOOK_STRUCTURES, i, j);

					let rampart = false;
					let blocked = false;

					for (let struct of structs) {
						if (struct.structureType == STRUCTURE_RAMPART) {							
							rampart = true;
						}
						else if (OBSTACLE_OBJECT_TYPES.includes(struct.structureType)) {
							blocked = true;
							break;
						}
					}

					if (!blocked && rampart) {
						numRampartsFar++
					}
				}
			}
		}

		let numAttackers = 0;
		let mostAttack = 0;

		let numRanged = 0;
		let mostRanged = 0;

		let anyHealers = false
		for (let hostileCreep of nearbyHostiles) {
			if (hostileCreep.hasBodypart(HEAL)) {
				anyHealers = true;
				break
			}
		}



		for (let hostileCreep of nearbyHostiles) {
			//var parts = hostileCreep.getBoostModifiedCombatParts(true, true);
			// 09-11-22 - changed nomodifiers to false to account for tough boosted enemes
			let parts = hostileCreep.getBoostModifiedCombatParts(true, false);
			// Attack creeps have to be closer before we worry.
			// This doesn't really handle the case where we move forward into each
			// other very well.
			let range = pos.getRangeTo(hostileCreep);

			let ramparted = false;
			let structsOnCreep = hostileCreep.pos.lookFor(LOOK_STRUCTURES);
			for (let structOnCreep of structsOnCreep) {
				if (structOnCreep.structureType == STRUCTURE_RAMPART) {
					ramparted = true;
					break;
				}
			}

			let mod = 1;
			if (!ramparted) {
				mod = 1.25;
			}

			/*let toughBoosted = 0
			if (hostileCreep && hostileCreep.getToughBoostLevel(false) !== 1) {
				toughBoosted = Math.max(toughBoosted, formationCreep.getNumOfBodyPart(TOUGH));
			}

			if (toughBoosted) {
				mod *= Math.min(1.3, 1 + 0.04 * toughBoosted);
			}*/

			// Small hack because ranged attack keeps going after I run...
			let rangedHackMod = range >= 3 ? 1.1 : 1.2;

			// console.log(pos, range)
			if (range == 1){
				// Unramparted or pushy stuff is dangerous - it won't just hit once!
				let closeMod = 1.5;

				eTotalAttack += parts.numAttack * mod * (ramparted && !opponentPushes ? 1 : closeMod);
				// No range hack mod. We're saying ranged does 28 damage due to RMA.
				// If we run, it won't. That's the hack, I guess
				let rangedAsAttack = parts.numRanged * (28 / 10.) * (10 / 30);

				// Count ranged as attack here for the "close enemies" counting
				eTotalAttack += rangedAsAttack * mod * (ramparted && !opponentPushes ? 1 : closeMod);;

				mostAttack = Math.max(mostAttack, parts.numAttack, rangedAsAttack);
				numAttackers += 1;
			}
			else if (range == 2 && hostileCreep.fatigue == 0) {
				// Try to account for only so many ways to hit us at least a little bit.
				if (opponentPushes || opponentSafePush) {
					if (parts.numAttack) {						
						eTotalAttack += (opponentSafePush || anyHealers ? 1 : 0.75) * parts.numAttack * (nearbyHostiles.length > 3 ? 0.9 : 1) * (closeHostiles.length > 2 ? 0.9 : 1) * mod;
						mostAttack = Math.max(mostAttack, parts.numAttack);
						numAttackers += 1;
					}
				}

				if (parts.numRanged) {					
					numRanged += 1;
					mostRanged = Math.max(mostRanged, parts.numRanged);

					eTotalRanged += parts.numRanged * mod * rangedHackMod;
				}

			}
			// Need a bit more reaction time on the edge.
			else if (edge && hostileCreep.fatigue == 0 && (opponentPushes || opponentSafePush)) {
				if ((advancing && range <= 3) || range <= 2) {					
					// Try to account for only so many ways to hit us at least a little bit.
					// eTotalAttack += parts.numAttack * 0.75 * (nearbyHostiles.length > 3 ? 0.9 : 1) * (closeHostiles.length > 2 ? 0.9 : 1) * mod;
					eTotalAttack += parts.numAttack * (opponentSafePush || anyHealers ? 0.75 : 0.15) * (nearbyHostiles.length > 3 ? 0.9 : 1) * (closeHostiles.length > 2 ? 0.9 : 1) * mod;
				}

				if ((advancing || range <= 4) && parts.numRanged) {
					numRanged += 1;
					mostRanged = Math.max(mostRanged, parts.numRanged);

					eTotalRanged += parts.numRanged * mod * rangedHackMod;
				}
			}
			else {
				if (((advancing && range <= 3) || range <= 2) && hostileCreep.fatigue == 0 && !ramparted && opponentPushes) {
					eTotalAttack += (anyHealers ? 0.5 : 0.1) * parts.numAttack * (nearbyHostiles.length > 3 ? 0.9 : 1) * (closeHostiles.length > 2 ? 0.9 : 1) * mod;
				}
				else if (((advancing && range <= 4) || range <= 3) && hostileCreep.fatigue == 0 && (opponentPushes || opponentSafePush)) {
					// eTotalAttack += 0.25 * parts.numAttack * (nearbyHostiles.length > 3 ? 0.9 : 1) * (closeHostiles.length > 2 ? 0.9 : 1) * mod;
					eTotalAttack += (opponentSafePush || anyHealers ? 0.25 : 0.05) * parts.numAttack * (nearbyHostiles.length > 3 ? 0.9 : 1) * (closeHostiles.length > 2 ? 0.9 : 1) * mod;
				}

				if ((advancing || range <= 4) && parts.numRanged) {
					numRanged += 1;
					mostRanged = Math.max(mostRanged, parts.numRanged);
					eTotalRanged += parts.numRanged * mod * rangedHackMod;
				}
				// else if ((advancing && range <= 5) && parts.numRanged) {
				// 	mostRanged = Math.max(mostRanged, parts.numRanged);
				// 	eTotalRanged += 0.5 * parts.numRanged * mod * rangedHackMod;
				// }
			}

			// if (pos.x == 29 && pos.y == 35) {
			// 	console.log(hostileCreep, eTotalAttack, eTotalRanged, numAttackers, numRanged, mostAttack, mostRanged)
			// }
		}

		if (mostAttack * numRampartsClose < eTotalAttack * numAttackers) {
			eTotalAttack = mostAttack * numRampartsClose;
		}
		if (mostRanged * numRampartsFar < eTotalRanged * numRanged) {
			eTotalRanged = mostRanged * numRampartsFar;
		}


		// If towerShootsAtStrongholdMax is high then creeps only shoot if towers are
		// Causes swamp problems
		if (room.memory.invCL) {
			let advancingMod = 1;
			let threshold = 0.98

			if (advancing) {
				if (creep.mem.numFormationsInRoom > 2) {			
					// This isn't going to predict well when advancing, but if they've got this flaw I can also retreat pretty easily and having many formations can cover me.
					advancingMod = Math.min(0.1 + (creep.mem.numFormationsInRoom - 2) * 0.1, 0.35);
				}
				else {
					advancingMod = 0.1;
				}
				if (anySwamp) {
					advancingMod /= 5;
				}
			}

			// Trust it less when damaged
			let damageMod = creep.hits / creep.hitsMax;

			if ((Memory.rooms[pos.roomName].towerShootsAtStrongholdMax || 0) > threshold && global.defenseAnalysis && global.defenseAnalysis[room.name] && global.defenseAnalysis[room.name].strongholdLogicTargetId) {
				let obj = Game.getObjectById(global.defenseAnalysis[room.name].strongholdLogicTargetId)
				// We're not it, probably won't take damage.
				if (obj && creep && obj != creep) {
					// 0-1
					let reRanged = (Memory.rooms[pos.roomName].towerShootsAtStrongholdMax - threshold) / (1 - threshold);

					// 0.8 => 0.02
					// 0.9 => 0.18
					// 0.95 => 0.32
					// 0.99 => 0.4608
					eTotalRanged *= 1 - advancingMod * reRanged * reRanged * damageMod;
				}
				// console.log(pos, damage)
			}
		}

		// if (pos.x == 29 && pos.y == 35) {
		// 	console.log(numRampartsClose, numRampartsFar, eTotalAttack, eTotalRanged)
		// }

		let hostileDamage = ATTACK_POWER * eTotalAttack + RANGED_ATTACK_POWER * eTotalRanged; 
		// Mod up hostile damage from creeps as they'll follow
		if (opponentPushes) {
			hostileDamage *= (anyHealers ? 1.25 : 1.05)
		}

		let towerDamage = roomCombat.getModifiedTowerDamageForPos(creep, room, pos, 0, advancing, anySwamp)


		let closeFriendlyHealers = []
		for (let otherCreep of pos.findInRange(FIND_MY_CREEPS, 3)) {
			// if (!otherCreep.assaulter) continue
			if (!otherCreep.hasBodypart(HEAL)) continue
			if (creep.mem.formationCreeps.includes(otherCreep.name)) continue
			if (!otherCreep.notMoving && !pos.inRangeToPos(otherCreep.pos, 2)) continue

			closeFriendlyHealers.push(otherCreep)
		}

		if (closeFriendlyHealers.length) {
			let allHostileRangedCreeps = creep.room.getAllHostileCreepsWithBodyParts([RANGED_ATTACK], true)
			let allHostileAttackCreeps = creep.room.getAllHostileCreepsWithBodyParts([ATTACK], true)

			// If we're braver assume a bit more networked healing.
			// We ramp up bravery while nobody is dying, but we kinda want to ramp up the bravery
			// of networked formations more than standalone ones. This acheives that.
			let healMod = Math.max(0.25, Math.min(4, 1 + (creep.room.mem.formationBravery || 0) / 5))

			for (let otherCreep of closeFriendlyHealers) {
				let healPower = otherCreep.getActiveBoostModifiedHeal() * HEAL_POWER

				// Towers can't shoot everyone. If we have a neighbouring healers close by assume they'll help if we're shot.
				// They should also be able to pre-heal us a bit.
				let range = pos.getRangeToPos(otherCreep.pos)
				if (otherCreep.notMoving && range <= 1) {
					towerDamage -= 0.25 * healPower * healMod;	
				}
				else {
					towerDamage -= 0.05 * healPower * healMod;
				}

				let rangeMod = 0;
				if (otherCreep.notMoving) rangeMod -= 1;
				if (advancing) rangeMod += 1;

				// If the others don't have enemy creeps in range they can also contribute to my healing
				if (!otherCreep.pos.findFirstInRange(allHostileRangedCreeps, 5 + rangeMod) && !otherCreep.pos.findFirstInRange(allHostileAttackCreeps, 3 + rangeMod)) {
					if (pos.getRangeToPos(otherCreep.pos) <= 1) {
						hostileDamage -= 0.25 * healPower * healMod;	
					}
					else {
						hostileDamage -= 0.05 * healPower * healMod;
					}
				}
			}
		}

		hostileDamage = Math.max(0, hostileDamage)
		towerDamage = Math.max(0, towerDamage)

		let towersOnly = 0;
		if (hostileDamage == 0) {
			towersOnly = 1
		}

		hostileDamage += towerDamage


		// console.log(creep, hostileDamage)

		return {dmg: hostileDamage, towersOnly: towersOnly};
	},

	getTargetOrientationForRoamingAttackers(zeroCreep, target) {
	// getTargetOrientationForRoamingAttackers(zeroCreep, sideLength, mask) {
		/*let attackers = zeroCreep.room.getAllHostileCreepsWithBodyParts([ATTACK], true);

		if (attackers.length == 0) {
			return 0;
		}

		let healers = zeroCreep.room.getAllHostileCreepsWithBodyParts([HEAL], true);

		if (healers.length == 0) {
			return 0;
		}

		let roamingAttackers = [];
		for (var i = 0; i < mask.length; i++) {
			let formationCreep = Game.creeps[zeroCreep.mem.formationCreeps[i]];
			if (formationCreep) {
				let nearbyAttackers = formationCreep.pos.findInRange(attackers, 2);
				for (let attacker of nearbyAttackers) {
					let attackerPairedHealers = attacker.pos.findInRange(healers, 1);
					if (attackerPairedHealers.length) {
						roamingAttackers.push(attacker)
					}
				}

			}
		}

		if (!roamingAttackers.length) return 0;

		roamingAttackers = _.uniq(roamingAttackers);

		if (roamingAttackers.length == 1) {*/
			// let roamingAttacker = roamingAttackers[0];
			// Figure out the quadrant
			// let dx = roamingAttacker.pos.x - zeroCreep.pos.x;
			// let dy = roamingAttacker.pos.y - zeroCreep.pos.y;

			let dx = target.x - zeroCreep.pos.x;
			let dy = target.y - zeroCreep.pos.y;

			if (dx < 0) {
				if (dy < 0) {
					if (dx == dy) {
						return TOP_LEFT
					}
					else if (dx < dy) {
						return LEFT
					}
					else {
						return TOP
					}
				}
				else {
					if (dy <= 1) return LEFT;

					dy -= 1;
					if (dx == -dy) {
						return BOTTOM_LEFT
					}
					else if (dx < -dy) {
						return LEFT
					}
					else  {
						return BOTTOM
					}
				}
			}
			else if (dy < 0) {
				if (dx <= 1) return TOP;

				dx -= 1;
				if (-dx == dy) {
					return TOP_RIGHT
				}
				else if (-dx < dy) {
					return RIGHT
				}
				else  {
					return TOP
				}
			}
			else {
				if (dx <= 1) return BOTTOM;
				if (dy <= 1) return RIGHT;

				dy -= 1;
				dx -= 1;

				if (dx < dy) {
					return BOTTOM;
				}
				else if (dx > dy) {
					return RIGHT
				}
				else {
					return BOTTOM_RIGHT
				}
			}
		/*}
		else {
			// Dunno how to deal with that. Ignore.
			return 0;
		}*/
	},


	formationMovement: function(creep, mostLostHits, mostLostHitsCreep, totalLostHits, numHeals, numHealsBase, numHealsActive) {
		if (creep.combatSnake) {
			// No retreat yet.
			snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(25, 25, creep.mem.targetRoom), {}, 22, true)
			return;
		}
		else if (creep.assaultSnake) {
			if (creep.setupFormation && creep.mem.setupPos) {
				let moveOpts = {"avoidTowers": Math.round(numHeals * HEAL_POWER * 0.75),
								"avoidRamparts": 1}

				let setupPos = new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName)
				snakeAI.moveSnake(creep.mem.allSquadCreeps, setupPos, moveOpts, 0, false)

			}
			// No retreat yet.
			else if (creep.mem.targetPos) {
				let moveOpts = {"avoidTowers": Math.round(numHeals * HEAL_POWER * 0.75),
								"avoidRamparts": 1}

				snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(creep.mem.targetPos.x, creep.mem.targetPos.y, creep.mem.targetRoom), moveOpts, 0, true)

				// If we have specific points for the healer and tank, use them
				if (creep.mem.allSquadCreeps.length == 2 && creep.mem.targetPos && creep.mem.healerPoint) {					
					let inPosition = false;
					for (let squadCreepName of creep.mem.allSquadCreeps) {
						let squadCreep = Game.creeps[squadCreepName]
						if (squadCreep && squadCreep.mem.role == "tank" && squadCreep.pos.x == squadCreep.mem.targetPos.x && squadCreep.pos.y == squadCreep.mem.targetPos.y && squadCreep.pos.roomName == squadCreep.mem.targetRoom) {
							inPosition = true;
							break;
						}
					}

					if (inPosition) {					
						for (let squadCreepName of creep.mem.allSquadCreeps) {
							let squadCreep = Game.creeps[squadCreepName]
							if (squadCreep && squadCreep.mem.role == "ranged") {
								squadCreep.uncachedMoveTo(new RoomPosition(squadCreep.mem.healerPoint.x, squadCreep.mem.healerPoint.y, squadCreep.mem.healerPoint.roomName), 0, {plainsCost: 1, swampCost: 1, avoidLocalCreeps: 1})
								break;
							}
						}
					}
				}
				return;
			}
			else {
				// TODO. Not this. Run it through withdraw logic below
				if (creep.mem.allSquadCreeps.length == 2) {
					snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.targetRoom), {goThroughStructures: 1}, creep.mem.targetRange || 1, true)
					return;
				}
			}
		}

		let maxHostileDamage = 0;
		let maxHostileDanageCreep;

		let squadHasNearbyHostiles = false;
		let squadHasMultipleNearbyHostiles = false;

		// Room stats tracking so I can size attacks correctly
		let allAttackCreepsInRange = [];
		let allRangedCreepsInRange = [];

		let totalHostileDamage = 0;

		let overrideReusePath

		let swampy = false;
		let assumePush = creep.room.mem.hostilesPushOut;
		if (assumePush && Math.random() < 0.1) {
			assumePush = false;
		}
		else if (!assumePush && Game.time - (creep.room.mem.hostilesPushTest || 0) < 750 && Math.random() > (Game.time - (creep.room.mem.hostilesPushTest || 0)) / 750) {
			assumePush = true;
		}


		for (var formationCreepName of creep.mem.formationCreeps) {
			let formationCreep = Game.creeps[formationCreepName];
			if (formationCreep && formationCreep.pos.lookFor(LOOK_TERRAIN)[0] == "swamp") {
				swampy = true;
				break;
			}
		}

		if (swampy) {
			assumePush = true;
		}

		if ((Game.rooms[creep.mem.targetRoom] && Game.rooms[creep.mem.targetRoom].dangerous) || Math.random() < 0.1) {
			for (var formationCreepName of creep.mem.formationCreeps) {
				// let hostileDamage = 0;
				let hostileDamage;
				let formationCreep = Game.creeps[formationCreepName];
				if (formationCreep && formationCreep.room.name == formationCreep.mem.targetRoom) {
					let myNearbyHostiles = formationCreep.pos.findInRange(formationCreep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), 4);

					if (formationCreep.ignoreInvaders) {
						myNearbyHostiles = _.filter(myNearbyHostiles, function(hostile) { return hostile.owner.username != "Invader" });
					}

					let closeHostiles = formationCreep.pos.findInRange(myNearbyHostiles, 2);



					if (myNearbyHostiles.length) {
						for (let nearbyHostile of myNearbyHostiles) {
							if (formationCreep.pos.inRangeToPos(nearbyHostile.pos, 3) && nearbyHostile.hasBodypart(RANGED_ATTACK) && !allRangedCreepsInRange.includes(nearbyHostile)) {
								allRangedCreepsInRange.push(nearbyHostile)
							}
						}
					}
					if (closeHostiles.length) {
						for (let closeHostile of closeHostiles) {
							if (formationCreep.pos.inRangeToPos(closeHostile.pos, 1) && closeHostile.hasBodypart(ATTACK) && !allAttackCreepsInRange.includes(closeHostile)) {
								allAttackCreepsInRange.push(closeHostile)
							}
						}
					}

					squadHasNearbyHostiles = squadHasNearbyHostiles || (myNearbyHostiles.length > 0);
					squadHasMultipleNearbyHostiles = squadHasMultipleNearbyHostiles || (myNearbyHostiles.length > 1);

					let roomMap = roomIntel.getEnemyRoomMap(formationCreep.room.name);
					if (roomMap && !formationCreep.room.memory.hostilesPushOut) {
						for (let hostile of myNearbyHostiles) {
							if (parseInt(roomMap[hostile.pos.x][hostile.pos.y]) >= 4) {
								let bodyParts = hostile.getBoostModifiedCombatParts(false, false)

								// Tough boosted is the only way of doing this (> 40 * 4).
								// If they're tough boosted they're probably pushing out.
								if (bodyParts.numTough && (bodyParts.numAttack > 150 || bodyParts.numRanged > 150)) {
									formationCreep.room.mem.hostilesPushOut = Game.time;
									// Aaah.
									overrideReusePath = 3;
								}
								else if (bodyParts.numAttack > 50 || bodyParts.numRanged > 50) {
									formationCreep.room.mem.hostilesPushTest = Game.time;
								}
							}
						}
					}

					let ret = this.getDamageForPos(formationCreep, formationCreep.room, formationCreep.pos, myNearbyHostiles, closeHostiles, assumePush, false, false);

					hostileDamage = ret.dmg

					let toughBoostLevel = formationCreep.getToughBoostLevel(true);
					if (toughBoostLevel >= 2) {
						let numTough = formationCreep.getNumOfBodyPart(TOUGH);

						let mod = 1;
						if 		(toughBoostLevel == 4) mod = 0.3;
						else if (toughBoostLevel == 3) mod = 0.5;
						else if (toughBoostLevel == 2) mod = 0.7;

						if (hostileDamage * mod < numTough * 100) {
							hostileDamage *= mod;
						}
						else {
							hostileDamage -= (numTough * 100) / mod - numTough * 100;
						}
						// formationCreep.say(Math.round((numTough * 100) / 0.3));
					}


					totalHostileDamage += hostileDamage;
					if (hostileDamage > maxHostileDamage) {
						maxHostileDamage = hostileDamage;
						maxHostileDanageCreep = formationCreep;
					}
				}
			}	
			if ((!Game.rooms[creep.mem.targetRoom] || !Game.rooms[creep.mem.targetRoom].dangerous) && totalHostileDamage) {
				console.log("Non dangerous room hurt", Game.time, creep.mem.targetRoom)
				Game.notify("Non dangerous room hurt" +  Game.time + " " + creep.mem.targetRoom)
			}
		}


		var zeroName = creep.mem.formationCreeps[0];
		var zeroCreep = Game.creeps[zeroName];


		let mask;
		let sideLength;
		let fixedFormation;

		if (creep.mem.mask) {
			mask = creep.mem.mask
			for (let spot of mask) {

			}
		}
		else {			
			if (creep.mem.formationCreeps.length <= 2) {
				mask = [[0,0]];
				sideLength = 1;
				fixedFormation = false;
			}
			else if (creep.mem.formationCreeps.length == 4) {
				mask = [[0,0],[1,0],[0,1],[1,1]];
				sideLength = 2;
				fixedFormation = true;
			}
			else if (creep.mem.formationCreeps.length == 9) {
	  		 	mask = [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]];
				sideLength = 3;
				fixedFormation = true;
			}
		}


		if (!mask) {
			return;
		}

		if (zeroCreep) {
			if (zeroCreep.mem.nibbler) {
				if (zeroCreep.mem.nibbleShape == constants.MASK_SHAPE_TT) {
					mask = [[0,0],[-1,1],[0,1],[1,1]];
				}
				else if (zeroCreep.mem.nibbleShape == constants.MASK_SHAPE_TR) {
					mask = [[0,0],[-1,1],[-1,0],[-1,-1]];
				}
				else if (zeroCreep.mem.nibbleShape == constants.MASK_SHAPE_TB) {
					mask = [[0,0],[-1,-1],[0,-1],[1,-1]];
				}
				else if (zeroCreep.mem.nibbleShape == constants.MASK_SHAPE_TL) {
					mask = [[0,0],[1,1],[1,0],[1,-1]];
				}
			}

			// console.log("creep.setupFormation", creep.name, creep.setupFormation)
			// We've become split. This shouldn't actually happen in the field as I think I've caught most of the cases where it would.
			// Spawning creeps maybe? Room boundaries?
			if (creep.setupFormation) {

				let canAttemptReformRevert = 1;
				let canAttemptReformRestep = 1;
				let canAttemptReformGeneral = 1;
				let lastPosInvalid = 0;

				let alive = 0

				if (canAttemptReformRevert) {
					for (var formationCreepName of creep.mem.formationCreeps) {
						var formationCreep = Game.creeps[formationCreepName];
						if (formationCreep) {
							alive++
							if (formationCreep.room.name != zeroCreep.room.name) {
								canAttemptReformRevert = false;
								lastPosInvalid = true;
							}
							if (formationCreep.fatigue > 0 && formationCreep.hasActiveBodypart(MOVE)) {
								canAttemptReformRevert = false;
							}
							if (!formationCreep.mem.lastFPos) {
								canAttemptReformRevert = false;
							}
						}
					}
					if (lastPosInvalid) {
						for (var formationCreepName of creep.mem.formationCreeps) {
							var formationCreep = Game.creeps[formationCreepName];
							if (formationCreep) {
								delete formationCreep.mem.lastFPos;
							}
						}
					}
				}

				if (alive < creep.mem.formationCreeps.length) {
					canAttemptReformRevert = 0
					canAttemptReformRestep = 0
					canAttemptReformGeneral = 0
				}


				if (canAttemptReformRestep) {
					for (var formationCreepName of creep.mem.formationCreeps) {
						var formationCreep = Game.creeps[formationCreepName];
						if (formationCreep) {
							if (formationCreep.room.name != zeroCreep.room.name) {
								canAttemptReformRestep = 0;
								lastPosInvalid = 1;
							}
							if (!formationCreep.mem.lastMove || !formationCreep.mem.lastFPos) {
								canAttemptReformRestep = 0;
							}
						}
					}
					if (lastPosInvalid) {
						for (var formationCreepName of creep.mem.formationCreeps) {
							var formationCreep = Game.creeps[formationCreepName];
							if (formationCreep) {
								delete formationCreep.mem.lastMove;
							}
						}
					}
				}
				if (canAttemptReformGeneral) {
					for (var formationCreepName of creep.mem.formationCreeps) {
						var formationCreep = Game.creeps[formationCreepName];
						if (formationCreep) {
							if ((formationCreep.mem.reformGeneralTime || 0) > 10) {
								canAttemptReformGeneral = 0;
								if (Math.random() < 0.5) {
									formationCreep.mem.reformGeneralTime -= 5;
								}
								break
							}
							else if ((formationCreep.mem.usingInternalSetup || 0) && formationCreep.pos.getRangeToPos(formationCreep.mem.setupPos) < 3 + (formationCreep.mem.reformGeneralTime || 0)) {
								canAttemptReformGeneral = 0;
								break
							}
							else if (formationCreep.room.name != zeroCreep.room.name) {
								canAttemptReformGeneral = 0;
								break
							}
							else if (formationCreep.room.name != formationCreep.mem.targetRoom) {
								canAttemptReformGeneral = 0;
								break
							}
							else if (util.isEdgeOfRoom(formationCreep.pos)) {
								canAttemptReformGeneral = 0;
								break
							}
						}
					}
				}

				var moveOptions = {"ignoreKeepers": 1,
		  							"avoidEnemyRooms" : 1,
		  							"avoidHostiles": 0.1};

				let creepIdx = 0;
				for (var formationCreepName of creep.mem.formationCreeps) {
					var formationCreep = Game.creeps[formationCreepName];

					if (formationCreep) {
						delete formationCreep.mem.splitRoomsCounter

						if (formationCreep.room.name == formationCreep.mem.setupPos.roomName && formationCreep.mem.arrivedAtSetup) {
							formationCreep.mem.setupFormation = (formationCreep.mem.setupFormation || 0) + 1
						}

						// This really really does not work right now
						if (formationCreep.room.name == formationCreep.mem.setupPos.roomName && formationCreep.mem.arrivedAtSetup && Game.time - (formationCreep.mem.setupFailTick || 0) < 10 + 30 * Math.random()) {
							if (!formationCreep.moveOrdersGiven) {
								moveOptions.flee = 1
								formationCreep.uncachedMoveTo(new RoomPosition(formationCreep.mem.setupPos.x, formationCreep.mem.setupPos.y, formationCreep.mem.setupPos.roomName), 6, moveOptions)

								formationCreep.mem.setupFormation = Math.max(0, formationCreep.mem.setupFormation - 2)
								formationCreep.moveOrdersGiven = true;
							}
						}
						// Try to reform by undoing whatever we just did to get unformed.
						else if (canAttemptReformRevert) {
							formationCreep.mem.forceNewTarget = Game.time;
							let dir = formationCreep.pos.getDirectionTo(formationCreep.mem.lastFPos);
							formationCreep.moveOrdersGiven = true;
							formationCreep.move(dir);
							formationCreep.expectedPos = formationCreep.pos.getPosInDirection(dir);
							delete formationCreep.mem.path;
							delete formationCreep.mem.lastFPos;
						}
						else if (canAttemptReformRestep) {
							formationCreep.mem.forceNewTarget = Game.time;
							if (formationCreep.pos.x == formationCreep.mem.lastFPos.x && formationCreep.pos.y == formationCreep.mem.lastFPos.y) {
								let dir = formationCreep.mem.lastMove
								formationCreep.moveOrdersGiven = true;
								formationCreep.move(dir);
								formationCreep.expectedPos = formationCreep.pos.getPosInDirection(dir);
							}
							delete formationCreep.mem.path;
							delete formationCreep.mem.lastFPos;
							delete formationCreep.mem.lastMove;
						}
						else if (canAttemptReformGeneral) {
							formationCreep.mem.forceNewTarget = Game.time;
							formationCreep.mem.reformGeneralTime = (formationCreep.mem.reformGeneralTime || 0) + 1
							let meanX = 0
							let meanY = 0
							for (let otherFormationCreepName of creep.mem.formationCreeps) {
								let otherFormationCreep = Game.creeps[otherFormationCreepName];

								if (otherFormationCreep) {
									meanX += otherFormationCreep.pos.x;
									meanY += otherFormationCreep.pos.y;
								}
							}
							meanX = Math.floor(meanX / creep.mem.formationCreeps.length)
							meanY = Math.floor(meanY / creep.mem.formationCreeps.length)

							let maskPos = mask[creepIdx];
							let targetX = meanX + maskPos[0]
							let targetY = meanY + maskPos[1]

							moveOptions.avoidLocalCreeps = 0.1

							if (formationCreep.room.name == formationCreep.mem.setupPos.roomName && !util.isEdgeOfRoom(formationCreep.pos)) {
								moveOptions.maxRooms = 1
							}

							formationCreep.uncachedMoveTo(new RoomPosition(targetX, targetY, formationCreep.room.name), 0, moveOptions)
							formationCreep.moveOrdersGiven = true;
							delete formationCreep.mem.path;
							delete formationCreep.mem.lastFPos;
							delete formationCreep.mem.lastMove;
						}
					}

					creepIdx++;
				}
				for (var formationCreepName of creep.mem.formationCreeps) {
					var formationCreep = Game.creeps[formationCreepName];

					if (formationCreep && !formationCreep.moveOrdersGiven) {
						if (formationCreep.getBoosts()) {
							formationCreep.moveOrdersGiven = 1;
							continue;
						}
					}
				}

				let allowSnake = 1;
				for (var formationCreepName of creep.mem.formationCreeps) {
					var formationCreep = Game.creeps[formationCreepName];
					if (formationCreep) {
						if (formationCreep.room.isEnemyRoom() && formationCreep.room.towers.length && formationCreep.mem.setupPos.roomName != formationCreep.room.name) {
							moveOptions.forceMoveRooms = 1;
							moveOptions.avoidEnemyRooms = 0;
							allowSnake = 0;
							moveOptions.avoidRamparts = 3;
						}
					}
				}


				for (var formationCreepName of creep.mem.formationCreeps) {
					var formationCreep = Game.creeps[formationCreepName];

					if (formationCreep && !formationCreep.moveOrdersGiven) {
						if (allowSnake && formationCreep.mem.setupPos) {
							let setupPos = new RoomPosition(formationCreep.mem.setupPos.x, formationCreep.mem.setupPos.y, formationCreep.mem.setupPos.roomName)

							let breakRange = formationCreep.mem.usingInternalSetup ? 2 : 8;

							if ((formationCreep.mem.setupPos.roomName == formationCreep.pos.roomName && formationCreep.pos.inRangeToPos(setupPos, breakRange)) || formationCreep.mem.arrivedAtSetup) {
								moveOptions.avoidLocalCreeps = 0.01 //formationCreep.mem.usingInternalSetup ? 0.01 : 2;
								moveOptions.reusePath = 2;

								if (mask.length > 1) {									
									for (let i = 0; i < mask.length; i++) {
										if (Game.creeps[creep.mem.formationCreeps[i]]) {
											Game.creeps[creep.mem.formationCreeps[i]].mem.arrivedAtSetup = 1;
										}
										if (formationCreepName == creep.mem.formationCreeps[i]) {
											formationCreep.moveOrdersGiven = true;
											formationCreep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x + mask[i][0], creep.mem.setupPos.y + mask[i][1], creep.mem.setupPos.roomName), 0, moveOptions)
										}
									}
								}
								else {
									for (let i = 0; i < creep.mem.formationCreeps[i].length; i++) {
										if (Game.creeps[creep.mem.formationCreeps[i]]) {
											Game.creeps[creep.mem.formationCreeps[i]].mem.arrivedAtSetup = 1;
										}
										if (formationCreepName == creep.mem.formationCreeps[i]) {
											formationCreep.moveOrdersGiven = true;
											formationCreep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), i, moveOptions)
										}
									}
								}
							}
							else {
								// Really crap
								if (mostLostHits > creep.hitsMax * 0.75 && creep.room.dangerous == 2) {
									let retreatPos = new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
											 					  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
																  creep.mem.fallbackRoom)
									snakeAI.moveSnake(creep.mem.allSquadCreeps, retreatPos, moveOptions, 10, true)

								}
								else {									
									let setupPos = new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName)
									snakeAI.moveSnake(creep.mem.allSquadCreeps, setupPos, moveOptions, 0, false)
								}
							}
						}
						else {
							if (formationCreep.mem.setupPos && formationCreep.room.name == formationCreep.mem.setupPos.roomName) {
								moveOptions.avoidLocalCreeps = 4;
							}

							if (formationCreep.hits < 0.9 * formationCreep.hitsMax &&
								(formationCreep.room.dangerous == 2 || (formationCreep.room.isEnemyRoom() && formationCreep.room.towers.length) || util.isEdgeOfRoom(formationCreep.pos))) {
								if (formationCreep.hasActiveBodypart(HEAL) || !formationCreep.mem.setupPos) {
									formationCreep.moveOrdersGiven = true;
									// Memory.combatManager.requestedMissions["remoteDefense"]
									formationCreep.uncachedMoveTo(new RoomPosition(Memory.rooms[formationCreep.mem.fallbackRoom].fallbackX || 25,
											 					  Memory.rooms[formationCreep.mem.fallbackRoom].fallbackY || 25,
																  formationCreep.mem.fallbackRoom),
																  3,
																  moveOptions);
								}
								else {
									formationCreep.moveOrdersGiven = true;
									formationCreep.uncachedMoveTo(new RoomPosition(Memory.rooms[formationCreep.mem.setupPos.roomName].fallbackX || 25,
											 					  Memory.rooms[formationCreep.mem.setupPos.roomName].fallbackY || 25,
																  formationCreep.mem.setupPos.roomName),
																  3,
																  moveOptions);
								}
							}
							else {
								if (creep.mem.setupPos) {
									if (mask.length > 1) {									
										for (let i = 0; i < mask.length; i++) {
											if (formationCreepName == creep.mem.formationCreeps[i]) {
												formationCreep.moveOrdersGiven = true;
												formationCreep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x + mask[i][0], creep.mem.setupPos.y + mask[i][1], creep.mem.setupPos.roomName), 0, moveOptions)
											}
										}
									}
									else {
										for (let i = 0; i < creep.mem.formationCreeps.length; i++) {
											if (formationCreepName == creep.mem.formationCreeps[i]) {
												formationCreep.moveOrdersGiven = true;
												formationCreep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), i, moveOptions)
											}
										}
									}
								}
							}
						}
					}
				}
			}
			else {

				if (!zeroCreep.mem.randomRepathID) {
					zeroCreep.mem.randomRepathID = Math.round(Math.random() * 100);
				}
				let numFormationsInRoom = 1;

				if (creep.room.numFormationsInRoom === undefined) {
					if (zeroCreep.room.name == zeroCreep.mem.targetRoom) {
						let formationIds = [];
						let friendlyCreeps = zeroCreep.room.find(FIND_MY_CREEPS);

						for (let friendlyCreep of friendlyCreeps) {
							if (friendlyCreep.mem.formationId !== undefined && !formationIds.includes(friendlyCreep.mem.formationId + friendlyCreep.mem.ID * 10000)) {
								formationIds.push(friendlyCreep.mem.formationId + friendlyCreep.mem.ID * 10000)
							}
						}

						numFormationsInRoom = formationIds.length;
					}
				}
				else {
					numFormationsInRoom = creep.room.numFormationsInRoom;
				}


				// On repath update some settings
				if (!zeroCreep.mem.randomReusepath || (Game.time + zeroCreep.mem.randomRepathID) % 75 == 0) {
					if (Game.rooms[zeroCreep.mem.targetRoom]) {
						if (Game.rooms[zeroCreep.mem.targetRoom].dangerous) {
							zeroCreep.mem.randomReusepath = (5 + Math.round(Math.random() * 10))
						}
						else {
							zeroCreep.mem.randomReusepath = (30 + Math.round(Math.random() * 40))
						}
					}
					else {
						zeroCreep.mem.randomReusepath = 100;
					}

					if (!zeroCreep.mem.closeCombatFormation) {
						zeroCreep.mem.randomReusepath += (Memory.rooms[zeroCreep.mem.targetRoom].undamagingFormation || 1) * 100
					}

					zeroCreep.mem.randomReusepath = Math.round(zeroCreep.mem.randomReusepath)

					// zeroCreep.mem.randomReusepath = Game.rooms[zeroCreep.mem.targetRoom] ? (5 + Math.round(Math.random() * 10)) : 100;

					for (var formationCreepName of creep.mem.formationCreeps) {
						var formationCreep = Game.creeps[formationCreepName];
						if (formationCreep) {
							formationCreep.mem.numFormationsInRoom = numFormationsInRoom;
						}
					}
				}

				creep.room.numFormationsInRoom = numFormationsInRoom

				zeroCreep.room.notOnWall = (zeroCreep.room.notOnWall || 0) + 1;

				// TODO: Fixed reuse path can lead to bad oscillations. Need to randomize then remember the setting.
				let formationMoveOptions;

				let advanceAvoidHostiles = 1 / (zeroCreep.mem.numFormationsInRoom || 1) // If more formations in room, be less bouncy.

				if (zeroCreep.mem.runSinceRepathed) {
					advanceAvoidHostiles *= 4;
				}

				let maxRooms = 3;
				// If targetPos is set I'm _pretty_ sure there is a path, but it might be complicated
				if (Game.time - (zeroCreep.mem.pIncompleteTick || 0) < 200 && zeroCreep.mem.targetPos) {
					maxRooms = 4;
				}

				if (zeroCreep.mem.targetPos) {
					formationMoveOptions = {"ignoreKeepers": 1,
											"avoidHostiles": advanceAvoidHostiles,
											"avoidAllEnemies": (zeroCreep.mem.mS || 0) > 2,
											"closeCombatFormation": zeroCreep.mem.closeCombatFormation,
											"movementMask": mask,
											"avoidTowers": Math.round(numHeals * HEAL_POWER * 0.9 * 0.25), // Mega formation wants to get into the target pos. Skirting around the stronghold
											"reusePath" : overrideReusePath || zeroCreep.mem.randomReusepath,
											"heuristicWeight" : 2,
											"avoidEnemyRooms": 1,
											"pathOnly": 1,
											"avoidRamparts": 3,
											"avoidOtherFormations": 200,
											"maxRooms": maxRooms}
				}
				else {
					formationMoveOptions = {"ignoreKeepers": 1,
											"avoidHostiles": advanceAvoidHostiles,
											"avoidAllEnemies": (zeroCreep.mem.mS || 0) > 2,
											"goThroughStructures": zeroCreep.mem.nibbler ? 0 : (!zeroCreep.mem.target || zeroCreep.mem.target.creepTarget ? 0 : 1),
											"closeCombatFormation": zeroCreep.mem.closeCombatFormation,
											"movementMask": mask,
											"avoidTowers": Math.round(numHeals * HEAL_POWER * 0.9),
											"reusePath" : overrideReusePath || zeroCreep.mem.randomReusepath,
											"heuristicWeight" : 2,
											"avoidEnemyRooms": 1,
											"pathOnly": 1,
											"avoidFormations": 200,
											// "pathTick": Math.floor(((Game.time + zeroCreep.mem.randomRepathID) % 150) / 75),
											"maxRooms": zeroCreep.mem.nibbler ? 16 : maxRooms/*, //(zeroCreep.room.name == zeroCreep.mem.targetRoom ? 2 : 16),
											"srcRoom": zeroCreep.room.name*/}; // This option does nothing, but triggers a repath on room change
				}


				let formationRetreatMoveOptions = {"avoidHostiles": 4,
													"avoidAllEnemies": ((zeroCreep.mem.mS || 0) > 2 ? 1 : 0),
													"movementMask": mask,
													"avoidTowers": Math.round(numHeals * HEAL_POWER * 0.75),
													"avoidRamparts": 3,
													"reusePath" : Math.round(zeroCreep.mem.randomReusepath / 2),
													"avoidEnemyRooms": 1,
													"pathOnly": 1,
													"heuristicWeight" : 2,
													"avoidFormations": 10,
													"maxOptsMod": 4,
													"maxRooms": maxRooms, //(zeroCreep.room.name == zeroCreep.mem.targetRoom ? 2 : 16),
													"srcRoom": zeroCreep.room.name}; // This option does nothing, but triggers a repath on room change


				if ((Game.time + zeroCreep.mem.randomRepathID) % 75 == 0) {
					zeroCreep.mem.runSinceRepathed = 0
				}


				var target;

				let numCantMove = 0

				var canOnlyMoveWithPull = false;
				var canMove = true;
				var canOnlyWithdraw = false;
				let splitRooms = false;
				let anyFatigue = false
				if (fixedFormation) {					
					for (var formationCreepName of creep.mem.formationCreeps) {
						var formationCreep = Game.creeps[formationCreepName];
						if (formationCreep) {
							if (formationCreep.fatigue) {
								anyFatigue = true
							}
							if (formationCreep.room.name != zeroCreep.room.name) {
								splitRooms = true;
							}
							if (formationCreep.fatigue > 0 || !formationCreep.hasActiveBodypart(MOVE)) {
								canOnlyMoveWithPull = true;
								canOnlyWithdraw = true;
								numCantMove++
							}
							if (formationCreep.moveOrdersGiven) {
								canMove = false;
							}
							// Hmm.
							// Random is called twice. 0.75 => 1/16.
							// TODO: Not quite sure why this code exists in the first place. I guess to force squads through into the room? Trouble is it doesn't work if they're advancing backwards
							if (util.isEdgeOfRoom(formationCreep.pos) && formationCreep.room.name != formationCreep.mem.targetRoom && (Game.time - (zeroCreep.mem.pIncompleteTick || 0) > 200 && Math.random() < 0.8)) {
								let moveAway = false;
								if (zeroCreep.mem.path) {								
									if (formationCreep.pos.x == 0 && (zeroCreep.mem.path[0] == 2 || zeroCreep.mem.path[0] == 3 || zeroCreep.mem.path[0] == 4)) {
										moveAway = true;
									}
									else if (formationCreep.pos.y == 0 && (zeroCreep.mem.path[0] == 4 || zeroCreep.mem.path[0] == 5 || zeroCreep.mem.path[0] == 6)) {
										moveAway = true;
									}
									else if (formationCreep.pos.x == 49 && (zeroCreep.mem.path[0] == 6 || zeroCreep.mem.path[0] == 7 || zeroCreep.mem.path[0] == 8)) {
										moveAway = true;
									}
									else if (formationCreep.pos.y == 49 && (zeroCreep.mem.path[0] == 7 || zeroCreep.mem.path[0] == 8 || zeroCreep.mem.path[0] == 1)) {
										moveAway = true;
									}
								}
								if (!moveAway) {
									canOnlyWithdraw = true;
								}
							}
						}
					}


					// Try to have them close
					// if (creep.mem.moons) {					
					// 	for (var moonName of creep.mem.moons) {
					// 		var moon = Game.creeps[moonName];
					// 		if (moon) {
					// 			if (moon.fatigue > 0 || !moon.hasActiveBodypart(MOVE) && moon.hasBoost()) {
					// 				canOnlyWithdraw = true;
					// 			}
					// 			else{								
					// 				let close = false;
					// 				let sameRoom = false;
					// 				for (var formationCreepName of creep.mem.formationCreeps) {
					// 					var formationCreep = Game.creeps[formationCreepName];

					// 					if (formationCreep && formationCreep.room.name == moon.name) {
					// 						sameRoom = true;
					// 						if (formationCreep.pos.isNearToPos(moon.pos)) {
					// 							close = true;
					// 							break;
					// 						}
					// 					}
					// 				}
					// 				if (sameRoom && !close) {
					// 					canOnlyWithdraw = true;
					// 				}
					// 			}
					// 		}
					// 	}
					// }
				}



				for (var formationCreepName of creep.mem.formationCreeps) {
					var formationCreep = Game.creeps[formationCreepName];
					if (formationCreep) {
						formationCreep.mem.splitRoomsCounter = Math.max(0, splitRooms ? ((formationCreep.mem.splitRoomsCounter || 0) + 2) : (formationCreep.mem.splitRoomsCounter || 0) - 1)

						delete formationCreep.mem.reformGeneralTime;
						delete formationCreep.mem.setupFormation;
						delete formationCreep.mem.setupFailTick;
					}
				}

				// console.log("canmove", canMove)

				// Room stats tracking.
				if (allAttackCreepsInRange.length > 0) {
					creep.room.attackCreepsClose = (creep.room.attackCreepsClose || 0) + allAttackCreepsInRange.length;
					creep.room.attackCreepsCloseNumFormations = (creep.room.attackCreepsCloseNumFormations || 0) + 1;
				}
				if (allRangedCreepsInRange.length > 0) {
					creep.room.rangedCreepsClose = (creep.room.rangedCreepsClose || 0) + allRangedCreepsInRange.length;
					creep.room.rangedCreepsCloseNumFormations = (creep.room.rangedCreepsCloseNumFormations || 0) + 1;
				}


				let moving = false;


				// Something kept going wrong, no idea what. https://screeps.com/a/#!/history/shard2/W5S36?t=19851500 onward. Just disabled as tired.
				if (canOnlyMoveWithPull) {
					// console.log("canOnlyMoveWithPull", creep, creep.pos, canOnlyMoveWithPull, numCantMove)
					canMove = false;
				}

				// canMove = canMove && (!canOnlyMoveWithPull || numCantMove <= 2)

				if (canMove) {

					// 01
					// 23
					// Heal count is a bit dodgy for mixed squads
					var withdraw;
					var withdrawFast;
					var withdrawForced;
					var swapToCentre = false;

					let minTTL = Infinity;
					var onEdge = false;
					var outOfRoom = false;
					let toughBoosted = 0;

					for (var formationCreepName of creep.mem.formationCreeps) {
						let formationCreep = Game.creeps[formationCreepName];
						if (formationCreep && util.isEdgeOfRoom(formationCreep.pos)) {
							onEdge = true;
						}
						if (formationCreep && formationCreep.room.name != creep.mem.targetRoom) {
							outOfRoom = true;
						}

						if (formationCreep && formationCreep.ticksToLive < minTTL) {
							minTTL = formationCreep.ticksToLive;
						}
						if (formationCreep && formationCreep.getToughBoostLevel(false) !== 1) {
							toughBoosted = Math.max(toughBoosted, formationCreep.getNumOfBodyPart(TOUGH));
						}
					}

					// Get braver with time.
					let mod = 1;
					if (minTTL < 750) {
						mod = 1 + (750 - minTTL) / 3000;
					}
					if (minTTL < 50) {
						mod *= 1 + (50 - minTTL) / 100;
					}

					// Be more cautious. Depends on how many tough parts we actually have
					if (toughBoosted) {
						mod *= 1 / Math.min(1.3, 1 + 0.04 * toughBoosted);
					}

					let hitsHeuristic = totalLostHits;
					// let hitsHeuristic = mostLostHits + (totalLostHits - mostLostHits) / 2;

					// Kinda assumes we've all got the same body length
					if (mostLostHits >= creep.hitsMax / 2) {
						hitsHeuristic *= 2;
					}
					if (mostLostHits >= 3 * creep.hitsMax / 4) {
						hitsHeuristic *= 2;
					}

					if (outOfRoom) {
						hitsHeuristic *= 2;
						maxHostileDamage *= 2;
					}
					// Assume we've taken more hits than we have.
					if (toughBoosted) {
						hitsHeuristic *= 1 + Math.min(0.3, 0.03 * toughBoosted) * (outOfRoom ? 2 : 1);
					}

					// console.log(zeroCreep, maxHostileDamage, numHeals, mod)

					let possibleHostileDamage = (totalLostHits > 0 || squadHasNearbyHostiles) && maxHostileDamage > 0;

					if (squadHasMultipleNearbyHostiles) {
						mod *= 0.9;
					}

					if (swampy) {
						mod *= 0.9;
					}

					let swampMod = swampy ? (anyFatigue ? 5 : 2) : 1

					let damageHeuristic = maxHostileDamage + 0.1 * totalHostileDamage / (sideLength * sideLength);

					if (onEdge || outOfRoom) {
						damageHeuristic *= 1.5;
					}

					let combinedHeuristic = hitsHeuristic * 0.5 + damageHeuristic - numHealsActive * HEAL_POWER;

					// They will do less than 2.5% damage
					if (combinedHeuristic < creep.hitsMax * 0.025 / swampMod) {
						mod *= 2 - Math.min(1, 0.2 * toughBoosted);
					}
					// They will do less than 5% damage
					else if (combinedHeuristic < creep.hitsMax * 0.05 / swampMod) {
						mod *= 1.5 - Math.min(0.5, 0.1 * toughBoosted);
					}
					// They will do less than 10% damage
					else if (combinedHeuristic < creep.hitsMax * 0.1 / swampMod) {
						mod *= 1.25 - Math.min(0.25, 0.05 * toughBoosted);
					}
					// They will do less than 20% damage
					else if (combinedHeuristic < creep.hitsMax * 0.2 / swampMod) {
						mod *= 1.125 - Math.min(0.125, 0.025 * toughBoosted);
					}
					// They will do more than 80% damage
					else if (combinedHeuristic > creep.hitsMax * 0.8 / swampMod) {
						mod *= 0.125 - Math.min(0.0675, 0.0125 * toughBoosted);
					}
					// They will do more than 60% damage
					else if (combinedHeuristic > creep.hitsMax * 0.6 / swampMod) {
						mod *= 0.25 - Math.min(0.125, 0.025 * toughBoosted);
					}
					// They will do more than 40% damage
					else if (combinedHeuristic > creep.hitsMax * 0.4 / swampMod) {
						mod *= 0.5 - Math.min(0.25, 0.05 * toughBoosted);
					}
					// They will do more than 30% damage
					else if (combinedHeuristic > creep.hitsMax * 0.3 / swampMod) {
						mod *= 0.75 - Math.min(0.375, 0.075 * toughBoosted);
					}

					// We're expecting power. There ain't no power. What gives? Careful I think.
					if (!creep.room.canPowerCreepDisruptTower && creep.mem.expectingPowerSupport) {
						mod *= 0.8;
					}

					if (maxHostileDamage + totalLostHits > 5000) {
						mod *= 1 - Math.min(0.9, (maxHostileDamage + totalLostHits - 5000) / 10000)
					}

					// If creeps died near here, be careful
					if (creep.room.mem.deathLocs) {						
						for (let loc of creep.room.mem.deathLocs) {
							mod *= 1 - 0.5 * Math.max(0, (1 - (Game.time - loc.t) / 1500)) / (creep.pos.getRangeToXY(loc.x, loc.y) + 1)
						}
					}


					let bravery = (Memory.rooms[creep.mem.targetRoom].formationBravery || 0)

					if (Memory.rooms[creep.mem.targetRoom].towerShootsAtStrongholdMax > 0.999) {
						if (zeroCreep.mem.numFormationsInRoom) {
							bravery += Math.min(10, zeroCreep.mem.numFormationsInRoom - 1);
						}
					}

					if (Game.time - (Memory.rooms[creep.mem.targetRoom].lastFormationKilled || 0) < 500) {
						bravery -= Math.pow(1 - (Game.time - (Memory.rooms[creep.mem.targetRoom].lastFormationKilled || 0)) / 500, 2);
					}

					// Be brave! Or not!
					if (bravery > 0) {
						mod *= 1 + bravery / 10;
					}
					else {
						// Bravery = -10, mod = 0.5
						mod /= 1 - bravery / 20;	
					}

					// console.log(mod)

					if (sideLength == 2) {
						if (onEdge || outOfRoom) {
							if (creep.mem.closeCombatFormation) {
								mod *= 0.75;
							}
							else if (creep.mem.directionalFormation) {
								mod *= 1.5;
							}
							else {
								mod *= 2;
							}

							if (toughBoosted) {
								mod *= 1 - Math.min(0.1, 0.03 * toughBoosted) - (maxHostileDanageCreep ? Math.min(0.1, maxHostileDanageCreep.getNumOfBodyPart(TOUGH) * 0.03) : 0);
							}

							// console.log(zeroCreep, hitsHeuristic, maxHostileDamage, mod, numHealsBase)
							withdraw = (possibleHostileDamage || hitsHeuristic != 0) && (hitsHeuristic + damageHeuristic > mod * 2.5 * numHealsActive * 12);
							withdrawFast = possibleHostileDamage && (hitsHeuristic + damageHeuristic > mod * (toughBoosted > 6 ? 3.5 : 4.5) * numHealsActive * 12);
							// withdrawForced = (hitsHeuristic > 0 + maxHostileDamage > mod * 10 * numHealsActive * 12);
						}
						else {
							withdraw = (possibleHostileDamage || hitsHeuristic != 0) && (hitsHeuristic + damageHeuristic > mod * 1.25 * numHealsActive * 12);
							withdrawFast = possibleHostileDamage && (hitsHeuristic + damageHeuristic > mod * (toughBoosted > 6 ? 1.7 : 2.) * numHealsActive * 12);
							// withdrawForced = (hitsHeuristic > 0 + damageHeuristic > mod * 5 * numHealsActive * 12);
							// console.log(zeroCreep, possibleHostileDamage, hitsHeuristic, damageHeuristic, mod, numHealsActive, withdraw, withdrawFast)
						}
					}
					else if (sideLength == 3) {
						if (onEdge || outOfRoom) {
							withdraw = (possibleHostileDamage || hitsHeuristic != 0) && (hitsHeuristic + damageHeuristic > mod * 1.75 * numHealsActive * 12);
							withdrawFast = possibleHostileDamage && (hitsHeuristic + damageHeuristic > mod * 3.5 * numHealsActive * 12);
							// withdrawForced = (hitsHeuristic > 0 + damageHeuristic > mod * 5 * numHealsActive * 12);
						}
						else {
							swapToCentre = (hitsHeuristic + damageHeuristic > mod * 1.5 * numHealsActive * 12 * (4 / 9));

							withdraw = (possibleHostileDamage || hitsHeuristic != 0) && (hitsHeuristic + damageHeuristic > mod * 1.25 * numHealsActive * 12);
							withdrawFast = possibleHostileDamage && (hitsHeuristic + damageHeuristic > mod * 2.5 * numHealsActive * 12);
							// withdrawForced = (hitsHeuristic > 0 + damageHeuristic > mod * 5 * numHealsActive * 12);
						}
					}
					else {
						withdraw = (possibleHostileDamage || hitsHeuristic != 0) && (hitsHeuristic + damageHeuristic > mod * 1.25 * numHealsActive * 12);
						withdrawFast = possibleHostileDamage && (hitsHeuristic + damageHeuristic > mod * (toughBoosted > 6 ? 1.7 : 2.) * numHealsActive * 12);
					}

					let blocking = 0;
					for (var i = 0; i < mask.length; i++) {
						if (Game.creeps[creep.mem.formationCreeps[i]] && Game.creeps[creep.mem.formationCreeps[i]].mem.blockingFormationRetreat) {
							blocking = Math.max(Game.creeps[creep.mem.formationCreeps[i]].mem.blockingFormationRetreat, blocking);
							Game.creeps[creep.mem.formationCreeps[i]].mem.blockingFormationRetreat = 0;
						}
					}

					if (blocking == 1) {
						withdraw = true;
					}
					else if (blocking == 2) {
						withdrawFast = true;
					}

					if (withdraw || withdrawFast) {
						zeroCreep.mem.runSinceRepathed = 1;
						zeroCreep.room.memory.withdrawTick = Game.time;
					}

					if (withdrawFast) {
						formationRetreatMoveOptions.avoidHostiles *= 2;
						formationRetreatMoveOptions.avoidAllEnemies = (formationRetreatMoveOptions.avoidAllEnemies || 1) * 2;
						formationRetreatMoveOptions.avoidTowers = Math.round(formationRetreatMoveOptions.avoidTowers * 0.75);
					}

					if (withdraw || withdrawFast) {
						zeroCreep.room.memory.withdrawLocs = zeroCreep.room.memory.withdrawLocs || [];
						for (var i = 0; i < mask.length; i++) {
							if (Game.creeps[creep.mem.formationCreeps[i]]) {
								zeroCreep.room.memory.withdrawLocs.push({x: Game.creeps[creep.mem.formationCreeps[i]].pos.x, y: Game.creeps[creep.mem.formationCreeps[i]].pos.y, t: Game.time})
							}
						}
					}


					// if (hitsHeuristic )

					// console.log(withdraw, withdrawFast, withdrawForced, hitsHeuristic, maxHostileDamage, mostLostHits, totalLostHits, numHealsBase)
					if (withdrawForced) {
						console.log("Thought I disabled withdrawForced...")
						for (var i = 0; i < mask.length; i++) {
							if (Game.creeps[creep.mem.formationCreeps[i]]) {
								Game.creeps[creep.mem.formationCreeps[i]].mem.retreatTimer = 10;
								Game.creeps[creep.mem.formationCreeps[i]].mem.forceNewTarget = Game.time;
							}
						}
					}
					// TODO: Need to do advBlkDmg
					else if (zeroCreep.assaultSnake) {
						if (withdraw || withdrawFast) {
							delete formationRetreatMoveOptions.movementMask
							delete formationRetreatMoveOptions.pathOnly
							snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), formationRetreatMoveOptions, 0, true, true)
						}
						else {
							delete formationMoveOptions.movementMask
							delete formationMoveOptions.pathOnly
							snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.targetRoom), formationMoveOptions, creep.mem.targetRange || 1, true, false)
						}
					}
					else if (fixedFormation) {
						if (withdraw || withdrawFast) {
							// console.log(creep, totalLostHits, mod, hitsHeuristic, toughBoosted, swampy)
							let oldStuck = zeroCreep.mem.mS || 0;

							for (var i = 0; i < mask.length; i++) {
								if (Game.creeps[creep.mem.formationCreeps[i]]) {
									Game.creeps[creep.mem.formationCreeps[i]].mem.withdrawn = Game.time;
									Game.creeps[creep.mem.formationCreeps[i]].mem.considerNewTarget = Game.time;
									if (withdrawFast && Math.random() < 0.05) {
										Game.creeps[creep.mem.formationCreeps[i]].mem.forceNewTarget = Game.time;
										Game.creeps[creep.mem.formationCreeps[i]].mem.forceExternalSetup = 1;
									}
								}
							}

							zeroCreep.updatePathForLastMove();

							let usingRetreatDir = false

							// This is with pathOnly
							if (creep.mem.setupPos) {
								if (isOnTargetOrAdvancedPoint(creep)) {
									if (creep.mem.targetPos.retreatDir) {
										// zeroCreep.mem.path = creep.mem.targetPos.retreatDir.toString()
										// Not sure why this not the above. Testing it.
										switch (creep.mem.targetPos.retreatDir) {
											case TOP:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x, zeroCreep.pos.y - 1, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;
											case TOP_RIGHT:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x + 1, zeroCreep.pos.y - 1, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;
											case RIGHT:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x + 1, zeroCreep.pos.y, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;
											case BOTTOM_RIGHT:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x + 1, zeroCreep.pos.y + 1, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;
											case BOTTOM:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x, zeroCreep.pos.y + 1, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;
											case BOTTOM_LEFT:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x - 1, zeroCreep.pos.y + 1, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;
											case LEFT:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x - 1, zeroCreep.pos.y, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;
											case TOP_LEFT:
												zeroCreep.uncachedMoveTo(new RoomPosition(zeroCreep.pos.x - 1, zeroCreep.pos.y - 1, zeroCreep.room.name), 0, formationRetreatMoveOptions);
												break;

											// console.log(creep.mem.targetPos.retreatDir, zeroCreep.mem.pTX, zeroCreep.mem.pTY)
										}
										usingRetreatDir = true;
									}
									else {
										console.log("Target pos with no retreatDir", JSON.stringify(zeroCreep.mem))
										zeroCreep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), 0, formationRetreatMoveOptions);
									}
								}
								else {
									zeroCreep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), 0, formationRetreatMoveOptions);
								}
							}
							else {
								console.log("NO SETUP POS!!!", creep)
							}

							/*if (sideLength == 2) {
								if (zeroCreep.pos.x == 48 && zeroCreep.mem.path && (zeroCreep.mem.path[0] == "2" || zeroCreep.mem.path[0] == "4")) {
									zeroCreep.mem.path = "3"
								}
								if (zeroCreep.pos.x == 49 && zeroCreep.mem.path && (zeroCreep.mem.path[0] == "8" || zeroCreep.mem.path[0] == "6")) {
									zeroCreep.mem.path = "7"
								}
								if (zeroCreep.pos.y == 48 && zeroCreep.mem.path && (zeroCreep.mem.path[0] == "4" || zeroCreep.mem.path[0] == "6")) {
									zeroCreep.mem.path = "5"
								}
								if (zeroCreep.pos.y == 49 && zeroCreep.mem.path && (zeroCreep.mem.path[0] == "8" || zeroCreep.mem.path[0] == "1")) {
									zeroCreep.mem.path = "2"
								}
							}*/
							// Ok, this is complicated. Take moving to the right for example.
							// ZeroCreep is on 48, creep 1 is on 0 in the next room. If we try
							// to move left we'll break formation. In this case to withdraw
							// we actually want to stay still...
							let splitStatic = false;
							if (!zeroCreep.assaultSnake && splitRooms && onEdge && zeroCreep.mem.path) {
								let dir = zeroCreep.mem.path[0];
								// I don't know what the path says. I think it'll give RIGHT
								if (zeroCreep.pos.x == 49) {
									if (dir == TOP_RIGHT || dir == RIGHT || dir == BOTTOM_RIGHT) {
										splitStatic = true;
									}
								}
								else if (zeroCreep.pos.x == 50 - sideLength /*&& zeroCreep.room.name != zeroCreep.mem.targetRoom*/) {
									if (dir == TOP_LEFT || dir == LEFT || dir == BOTTOM_LEFT) {
										splitStatic = true;
									}
								}
								else if (zeroCreep.pos.y == 49) {//} && zeroCreep.pos.roomName != zeroCreep.mem.targetRoom) {
									if (dir == BOTTOM_LEFT || dir == BOTTOM || dir == BOTTOM_RIGHT) {
										splitStatic = true;
									}
								}
								else if (zeroCreep.pos.y == 50 - sideLength /*&& zeroCreep.room.name != zeroCreep.mem.targetRoom*/) {
									if (dir == TOP_LEFT || dir == TOP || dir == TOP_RIGHT) {
										splitStatic = true;
									}
								}
							}



							if (!splitStatic) {
								/*if (swapToCentre && !splitRooms && mostLostHitsCreep) {
									let middleCreepName = creep.mem.formationCreeps[4];
									let mostLostHitsIndex = creep.mem.formationCreeps.indexOf(mostLostHitsCreep.name)

									mostLostHitsCreep.move(mostLostHitsCreep.pos.getDirectionTo(Game.creeps[middleCreepName]))
									Game.creeps[middleCreepName].move(Game.creeps[middleCreepName].pos.getDirectionTo(mostLostHitsCreep))

									for (let creepName of _.clone(creep.mem.formationCreeps)) {
										if (Memory.creeps[creepName]) {
											Memory.creeps[creepName].formationCreeps[4] = mostLostHitsCreep.name;
											Memory.creeps[creepName].formationCreeps[mostLostHitsIndex] = middleCreepName;
										}
									}
								}
								else*/ if (zeroCreep.mem.path) {
									// console.log(Game.time, zeroCreep.mem.path)
									// If we're blocked don't move unless we've been stuck for fookin ages.
									if (!this.formationCheckBlockedBuildings(zeroCreep, sideLength, false, parseInt(zeroCreep.mem.path[0]))) {
										if (withdraw) zeroCreep.say("Run");
										if (withdrawFast) zeroCreep.say("Run Fast");

										let blockingCreep = this.formationCheckBlockedUnits(zeroCreep, parseInt(zeroCreep.mem.path[0]), sideLength, usingRetreatDir)
										if (blockingCreep && blockingCreep.my) {
											blockingCreep.mem.blockingFormationRetreat = withdrawFast ? 2 : 1;
										}

										let moved = 0;

										if (!blockingCreep || oldStuck > 2.5 + Math.random() || withdrawFast) {
											if (blockingCreep) {
												for (var i = 0; i < mask.length; i++) {
													if (Game.creeps[creep.mem.formationCreeps[i]]) {
														Game.creeps[creep.mem.formationCreeps[i]].blockedMove = 1
													}
												}
											}

											// Don't force move if the target is fatigued!
											let dir = zeroCreep.mem.path[0];
											let hardBlock = 0

											// Never force move to a hostile or tired creep assuming it'll get out the way. That's dumb.
											if (blockingCreep) {													
												for (var i = 0; i < mask.length; i++) {
													if (Game.creeps[creep.mem.formationCreeps[i]]) {
														let moveToPos = Game.creeps[creep.mem.formationCreeps[i]].pos.getPosInDirection(dir);

														let creepsAtPos = moveToPos.lookFor(LOOK_CREEPS).concat(moveToPos.lookFor(LOOK_POWER_CREEPS));
														for (let otherCreep of creepsAtPos) {
															if (!otherCreep.my || otherCreep.fatigue || otherCreep.notMoving) {
																hardBlock = 1;
																break;
															}
														}
													}
													if (hardBlock) break;
												}
											} 

											if (!hardBlock && canOnlyMoveWithPull) {
												// I saw this go wrong once. 
												/*for (var i = 0; i < mask.length; i++) {
													if (Game.creeps[creep.mem.formationCreeps[i]]) {
														if (dir == TOP || dir == RIGHT || dir == BOTTOM || dir == LEFT) {
															if (!Game.creeps[creep.mem.formationCreeps[i]].canMove()) {															
																let moveToPos = Game.creeps[creep.mem.formationCreeps[i]].pos.getPosInDirection(dir);
																let otherCreep = moveToPos.lookFor(LOOK_CREEPS)[0];

																if (otherCreep && creep.mem.formationCreeps.includes(otherCreep.name) && otherCreep.canMove()) {
																	otherCreep.proposedFormationWagon = Game.creeps[creep.mem.formationCreeps[i]]
																	Game.creeps[creep.mem.formationCreeps[i]].proposedFormationTug = otherCreep
																}
																else {
																	hardBlock = 1;
																}
															}
														}
														else {
															hardBlock = 1;
															break;
														}
													}
												}

												// Testing
												if (!hardBlock) {												
													for (var i = 0; i < mask.length; i++) {
														if (Game.creeps[creep.mem.formationCreeps[i]]) {
															console.log(Game.creeps[creep.mem.formationCreeps[i]], dir, Game.creeps[creep.mem.formationCreeps[i]].proposedFormationTug, Game.creeps[creep.mem.formationCreeps[i]].proposedFormationWagon)
														}
													}
												}*/

												hardBlock = 1;

											}


											if (!hardBlock) {
												moved = 1;
												if (zeroCreep.mem.path.length > 1) {
													Game.creeps[creep.mem.formationCreeps[0]].mem.lastFPos = Game.creeps[creep.mem.formationCreeps[0]].pos;

													zeroCreep.stepPath(zeroCreep.mem.path);
													if (zeroCreep.proposedFormationWagon) {
														zeroCreep.pull(zeroCreep.proposedFormationWagon)
													}
													else if (zeroCreep.proposedFormationTug) {
														zeroCreep.move(proposedFormationTug)
													}

													zeroCreep.expectedPos = zeroCreep.pos.getPosInDirection(dir);
													// Direction is the 0 element of the path.
													for (var i = 1; i < mask.length; i++) {
														if (Game.creeps[creep.mem.formationCreeps[i]]) {
															let creep = Game.creeps[zeroCreep.mem.formationCreeps[i]]

															if (creep.proposedFormationWagon) {
																creep.pull(creep.proposedFormationWagon)
															}
															else if (creep.proposedFormationTug) {
																creep.move(creep.proposedFormationTug)
															}
															else {
																creep.move(dir);
															}

															creep.expectedPos = creep.pos.getPosInDirection(dir);
															if (!withdrawFast) {
																creep.mem.lastFPos = creep.pos;
																creep.mem.lastMove = dir;
															}
															else {
																delete creep.mem.lastFPos
																delete creep.mem.lastMove
															}
															delete creep.mem.sideSlipDir
														}
													}
												}
												else {
													for (var i = 0; i < mask.length; i++) {
														if (Game.creeps[creep.mem.formationCreeps[i]]) {
															let creep = Game.creeps[zeroCreep.mem.formationCreeps[i]]

															if (creep.proposedFormationWagon) {
																creep.pull(creep.proposedFormationWagon)
															}
															else if (creep.proposedFormationTug) {
																creep.move(creep.proposedFormationTug)
															}
															else {
																creep.move(dir);
															}

															creep.expectedPos = creep.pos.getPosInDirection(dir);
															if (!withdrawFast) {
																creep.mem.lastFPos = creep.pos;
																creep.mem.lastMove = dir;
															}
															else {
																delete creep.mem.lastFPos
																delete creep.mem.lastMove
															}
															delete creep.mem.sideSlipDir
														}
													}
													delete zeroCreep.mem.path
												}
												moving = true;
												zeroCreep.mem.mS = 0;
											}
										}
										if (!moved) {
											// This can be a lie. TODO. Better message when pulling and running.
											zeroCreep.say("RunBlkCrp" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : ""));
											if (this.moveBlkCreep(zeroCreep, sideLength, true, mask)) {
												moving = true;
											}
											zeroCreep.mem.mS = oldStuck + (withdrawFast ? 2 : 1);
										}
									}
									else {
										zeroCreep.say("RunBlkBld" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : ""));
									}
								}
								else {
									zeroCreep.say("RunNopth" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : "_") + (splitStatic ? 1 : 0));
								}
							}
							else {
								zeroCreep.say("RunNopth" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : "_") + (splitStatic ? 1 : 0));
							}
						}
						else if (!canOnlyWithdraw) {
							// TODO: Target x and y can come out undefined. We update tower/spawn info every 10 ticks, but discover no target instantly.
							let position;
							if (creep.mem.nibbler) {
								if (creep.mem.target && Game.rooms[creep.mem.targetRoom]) {
									let targetStructs = Game.rooms[creep.mem.targetRoom].lookForAt(LOOK_STRUCTURES, creep.mem.target.x, creep.mem.target.y);
									let isThereATarget = false;
									for (let structs of targetStructs) {
										if (struct.structureType == STRUCTURE_RAMPART || struct.structureType == STRUCTURE_WALL) {
											isThereATarget = true;
											break;
										}
									}

									if (!isThereATarget) {
										delete creep.mem.target;
									}
								}

								if (!creep.mem.target && Game.rooms[creep.mem.targetRoom]) {
									// We self-select targets.
									let nibblePositions = roomIntel.getNibblerPositionsWithVisibility(creep.mem.targetRoom, mask, creep.mem.nibbleShape, false);
									let bestPosition;
									let bestScore = Infinity;
									for (let nibblePosition of nibblePositions) {
										let building = Game.getObjectById(nibblePosition.b);
										if (!building) continue;

										let score = zeroCreep.pos.getWorldRangeToPos(new RoomPosition(nibblePosition.x, nibblePosition.x, creep.mem.targetRoom))

										score += nibblePosition.d.c / 100;
										score += (Game.time - nibblePosition.d.t) / 1000;

										if (score < bestScore) {
											bestScore = score;
											bestPosition = nibblePosition;
										}
									}
									if (bestPosition) {
										position = {targetLoc: {}, o: -1};
										let building = Game.getObjectById(nibblePosition.b);

										creep.mem.target.x = building.pos.x;
										creep.mem.target.y = building.pos.y;

										position.targetLoc.x = bestPosition.x;
										position.targetLoc.y = bestPosition.y;

										if (creep.mem.nibbleShape == constants.MASK_SHAPE_2x2) {
											if (bestPosition.x < building.pos.x) {
												if (bestPosition.y < building.pos.y) {
													position.o = BOTTOM; // Attack creep is bottom right
												}
												else {
													position.o = RIGHT;	// Attack creep is top right
												}
											}
											else {
												if (bestPosition.y < building.pos.y) {
													position.o = LEFT; // Attack creep is bottom left
												}
												else {
													position.o = TOP;	// Attack creep is top left
												}
											}
										}
									}

								}
							}
							else if (creep.mem.target && !creep.mem.target.creepTarget && !creep.mem.targetPos) {
								let roomMap = roomIntel.getEnemyRoomMap(creep.mem.targetRoom);
								if (sideLength == 2) {
									position = this.formation2x2GetFlushOrientation(creep.mem.target.x, creep.mem.target.y, roomMap, Game.rooms[creep.mem.targetRoom], creep.mem.formationCreeps);
								}
								else if (sideLength == 3) {
									position = this.formation3x3GetFlushOrientation(creep.mem.target.x, creep.mem.target.y, roomMap, Game.rooms[creep.mem.targetRoom], creep.mem.formationCreeps);
								}
							}
							// console.log(JSON.stringify(position))
							var targetLoc;
							var targetOrientation;
							if (position) {
								// console.log(Game.time, position.targetLoc.x, position.targetLoc.y, position.o)
								// console.log(JSON.stringify(position.targetLoc), JSON.stringify(position.o))
								targetLoc = position.targetLoc;
								targetLoc.o = position.o;
							}
							else if (creep.mem.targetPos) {
								if (creep.mem.targetPos.advX1 >= 0 && creep.mem.targetPos.advY1 >= 0 && isOnTargetOrAdvancedPoint(zeroCreep)) {
									if (creep.mem.targetPos.advX2 >= 0 && creep.mem.targetPos.advY2 >= 0 && isOnAdvancedPoint(zeroCreep)) {
										targetLoc = {x: creep.mem.targetPos.advX2, y: creep.mem.targetPos.advY2, o: (creep.mem.targetPos.retreatDir - 1 + 4) % 8 + 1};
									}
									else {
										targetLoc = {x: creep.mem.targetPos.advX1, y: creep.mem.targetPos.advY1, o: (creep.mem.targetPos.retreatDir - 1 + 4) % 8 + 1};
									}
									targetOrientation = targetLoc.o
								}
								else {
									targetLoc = {x: creep.mem.targetPos.x, y: creep.mem.targetPos.y, o: (creep.mem.targetPos.retreatDir - 1 + 4) % 8 + 1};
								}

								if (targetLoc.o == BOTTOM_RIGHT || targetLoc.o == BOTTOM_LEFT) {
									targetLoc.o = BOTTOM;
								}
								else if (targetLoc.o == TOP_RIGHT || targetLoc.o == TOP_LEFT) {
									targetLoc.o = TOP;
								}

							}
							else if (creep.mem.target) {
								targetLoc = {x: creep.mem.target.x, y: creep.mem.target.y};
							}
							else {
								targetLoc = {x: zeroCreep.pos.x, y: zeroCreep.pos.y};
							}

							zeroCreep.room.visual.line(zeroCreep.pos.x, zeroCreep.pos.y, targetLoc.x, targetLoc.y, {color: "#aeae10"})


							// If we're in the right position, do the rotation
							// Otherwise, targetFormationOrientation can be set because we're blocked, so use that
							if (targetLoc && zeroCreep.pos.x == targetLoc.x && zeroCreep.pos.y == targetLoc.y && zeroCreep.room.name == zeroCreep.mem.targetRoom && targetLoc.o !== undefined) {
								targetOrientation = targetLoc.o;
							}
							// if (targetLoc.o) {
							// 	targetOrientation = targetLoc.o;
							// }
							else {
								let newOrientation = 0;
								if (creep.mem.target && creep.mem.target.creepTarget) {
									if (Math.min(Math.abs(zeroCreep.pos.x - creep.mem.target.x), Math.abs(zeroCreep.pos.y - creep.mem.target.y)) <= 5) {									
										newOrientation = this.getTargetOrientationForRoamingAttackers(zeroCreep, creep.mem.target); //zeroCreep, sideLength, mask);
										let currentOrientation = zeroCreep.mem.targetFormationOrientation;
										if (newOrientation == TOP_RIGHT) {
											if (currentOrientation == LEFT || currentOrientation == BOTTOM) {
												newOrientation = TOP;
											}
											else {
												newOrientation = 0;
											}
										}
										else if (newOrientation == TOP_LEFT) {
											if (currentOrientation == RIGHT || currentOrientation == BOTTOM) {
												newOrientation = TOP;
											}
											else {
												newOrientation = 0;
											}
										}
										else if (newOrientation == BOTTOM_LEFT) {
											if (currentOrientation == RIGHT || currentOrientation == TOP) {
												newOrientation = BOTTOM;
											}
											else {
												newOrientation = 0;
											}
										}
										else if (newOrientation == BOTTOM_RIGHT) {
											if (currentOrientation == LEFT || currentOrientation == TOP) {
												newOrientation = BOTTOM;
											}
											else {
												newOrientation = 0;
											}
										}
									}
								}
								if (newOrientation) {
									zeroCreep.mem.targetFormationOrientation = newOrientation;
								}

								targetOrientation = targetOrientation || zeroCreep.mem.targetFormationOrientation;

							}
							if (targetOrientation === undefined && zeroCreep.mem.directionalFormation) {
								console.log("2x2 formation orientation fail on target");//, creep.mem.target, targetOrientation, zeroCreep.pos, targetLoc.x, targetLoc.y, targetLoc.o, zeroCreep.mem.targetFormationOrientation)
							}
							else {
								// Rotation is needed
								if (zeroCreep.mem.directionalFormation && zeroCreep.mem.formationOrientation != targetOrientation) {
									if (creep.mem.targetPos) {
										console.log("targetPos rotate", zeroCreep.mem.formationOrientation, targetOrientation)
									}

									this.formation2x2Rotate(targetOrientation, zeroCreep);
									moving = true;

									zeroCreep.say("Rot" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : "_"));
									// This is fairly lazy. Once we've sorted out the orientation we actually need to adjust and rolling back into here should do it.
									// return this.formation2x2Movement(creep, mostLostHits, numHeals, numHealsBase);
								}
								else {
									let oldStuck = zeroCreep.mem.mS || 0;
									zeroCreep.updatePathForLastMove();

									// if (zeroCreep.room.name == creep.mem.targetRoom) {
										// formationMoveOptions.maxRooms = 1;
									// }

									// if (creep.mem.targetPos) {
									// 	console.log("targetPos move to", targetLoc.x, targetLoc.y)
									// }


									// This is with pathOnly
									zeroCreep.uncachedMoveTo(new RoomPosition(targetLoc.x, targetLoc.y, creep.mem.targetRoom), 0, formationMoveOptions);

									let splitStatic = false;
									if (splitRooms && onEdge && zeroCreep.mem.path) {
										let dir = zeroCreep.mem.path[0];
										// I don't know what the path says. I think it'll give RIGHT
										if (zeroCreep.pos.x == 49) {
											if (dir == TOP_RIGHT || dir == RIGHT || dir == BOTTOM_RIGHT) {
												splitStatic = true;
											}
										}
										else if (zeroCreep.pos.x == 50 - sideLength /*&& zeroCreep.room.name != zeroCreep.mem.targetRoom*/) {
											if (dir == TOP_LEFT || dir == LEFT || dir == BOTTOM_LEFT) {
												splitStatic = true;
											}
										}
										else if (zeroCreep.pos.y == 49) {
											if (dir == BOTTOM_LEFT || dir == BOTTOM || dir == BOTTOM_RIGHT) {
												splitStatic = true;
											}
										}
										else if (zeroCreep.pos.y == 50 - sideLength /*&& zeroCreep.room.name != zeroCreep.mem.targetRoom*/) {
											if (dir == TOP_LEFT || dir == TOP || dir == TOP_RIGHT) {
												splitStatic = true;
											}
										}
									}

									if (onEdge && !splitRooms && zeroCreep.mem.path) {
										let dir = zeroCreep.mem.path[0];
										// I don't know what the path says. I think it'll give RIGHT
										if (zeroCreep.pos.x == 49) {
											if (dir == TOP_LEFT || dir == LEFT || dir == BOTTOM_LEFT) {
												splitStatic = true;
											}
										}
										else if (zeroCreep.pos.x == 50 - sideLength /*&& zeroCreep.room.name != zeroCreep.mem.targetRoom*/) {
											if (dir == TOP_RIGHT || dir == RIGHT || dir == BOTTOM_RIGHT) {
												splitStatic = true;
											}
										}
										else if (zeroCreep.pos.y == 49) {
											if (dir == TOP_LEFT || dir == TOP || dir == TOP_RIGHT) {
												splitStatic = true;
											}
										}
										else if (zeroCreep.pos.y == 50 - sideLength /*&& zeroCreep.room.name != zeroCreep.mem.targetRoom*/) {
											if (dir == BOTTOM_LEFT || dir == BOTTOM || dir == BOTTOM_RIGHT) {
												splitStatic = true;
											}
										}
									}

									// console.log(zeroCreep, splitStatic, splitRooms, onEdge, zeroCreep.mem.path)
									// splitStatic isn't good enough for 3x3 squads.
									if (!splitStatic) {
										if (swapToCentre && !splitRooms && mostLostHitsCreep) {
											let middleCreepName = creep.mem.formationCreeps[4];
											let mostLostHitsIndex = creep.mem.formationCreeps.indexOf(mostLostHitsCreep.name)

											mostLostHitsCreep.move(mostLostHitsCreep.pos.getDirectionTo(Game.creeps[middleCreepName]))
											Game.creeps[middleCreepName].move(Game.creeps[middleCreepName].pos.getDirectionTo(mostLostHitsCreep))

											for (let creepName of _.clone(creep.mem.formationCreeps)) {
												if (Memory.creeps[creepName]) {
													Memory.creeps[creepName].formationCreeps[4] = mostLostHitsCreep.name;
													Memory.creeps[creepName].formationCreeps[mostLostHitsIndex] = middleCreepName;
												}
											}
										}
										else if (zeroCreep.mem.path) {
											// console.log(Game.time, zeroCreep.mem.path)
											// If we're blocked don't move unless we've been stuck for fookin ages.


											let blockedBuilding = false;

											let dir = parseInt(zeroCreep.mem.path[0]);

											if (this.formationCheckBlockedBuildings(zeroCreep, sideLength, true, dir)) {
												blockedBuilding = true
												if (dir == TOP_LEFT || dir == TOP_RIGHT || dir == BOTTOM_LEFT || dir == BOTTOM_RIGHT) {
													if (!Memory.disableSideSlip && Math.random() < 0.2 && this.trySideSlip(zeroCreep, sideLength, dir)) {
														dir = parseInt(zeroCreep.mem.path[0]);
														blockedBuilding = false;
														console.log(zeroCreep, "slip")
													}
												}
											}

											if (!blockedBuilding) {
												// Predict damage at next step.
												let maxPredictedDamage = 0;

												let assumePush = zeroCreep.room.mem.hostilesPushOut;
												if (assumePush && (Math.random() < 0.1 || zeroCreep.room.offsideTrap)) {
													assumePush = false;
													zeroCreep.room.offsideTrap = true;
												}
												else if (!assumePush && Game.time - (zeroCreep.room.memory.hostilesPushTest || 0) < 750 && Math.random() > (Game.time - (creep.room.memory.hostilesPushTest || 0)) / 750) {
													assumePush = true;
												}

												let blkDamage = false;
												let blkDamageTowersOnly = false;
												let dir = zeroCreep.mem.path[0];

												let anyMovingIntoSwamp = false;

												for (var i = 0; i < mask.length; i++) {
													let formationCreep = Game.creeps[creep.mem.formationCreeps[i]];
													if (formationCreep && formationCreep.room.dangerous) {
														let posX = formationCreep.pos.x
														let posY = formationCreep.pos.y

														switch(dir) {
															case "8":
															case "1":
															case "2":
																posY -= 1;
																break;
															case "4":
															case "5":
															case "6":
																posY += 1;
																break;
														}
														switch(dir) {
															case "2":
															case "3":
															case "4":
																posX += 1;
																break;
															case "6":
															case "7":
															case "8":
																posX -= 1;
																break;
														}

														if (posX >= 0 && posY >= 0 && posX <= 49 && posY <= 49) {
															let pos = new RoomPosition(posX, posY, formationCreep.room.name);
															if (pos.lookFor(LOOK_TERRAIN)[0] == "swamp") {
																anyMovingIntoSwamp = true
															}
														}
													}
												}

												// let sumPredictedDamage = 0;

												for (var i = 0; i < mask.length; i++) {
													let formationCreep = Game.creeps[creep.mem.formationCreeps[i]];
													if (formationCreep && formationCreep.room.dangerous) {
														let posX = formationCreep.pos.x
														let posY = formationCreep.pos.y

														switch(dir) {
															case "8":
															case "1":
															case "2":
																posY -= 1;
																break;
															case "4":
															case "5":
															case "6":
																posY += 1;
																break;
														}
														switch(dir) {
															case "2":
															case "3":
															case "4":
																posX += 1;
																break;
															case "6":
															case "7":
															case "8":
																posX -= 1;
																break;
														}


														if (posX >= 0 && posY >= 0 && posX <= 49 && posY <= 49) {
															let pos = new RoomPosition(posX, posY, formationCreep.room.name);
															let hostileDamagingCreeps = formationCreep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true)
															if (formationCreep.ignoreInvaders) {
																hostileDamagingCreeps = _.filter(hostileDamagingCreeps, function(hostile) { return hostile.owner.username != "Invader" });
															}

															let nearbyHostiles = pos.findInRange(hostileDamagingCreeps, anyMovingIntoSwamp ? 8 : 4);
															let closeHostiles = pos.findInRange(nearbyHostiles, 1);

															let ret = this.getDamageForPos(formationCreep, formationCreep.room, pos, nearbyHostiles, closeHostiles, assumePush, true, anyMovingIntoSwamp);
															let predictedDamage = ret.dmg
															predictedDamage += totalLostHits * 1.25


															// console.log(creep, predictedDamage, posX, posY)

															let threshold;

															let toughBoostLevel = formationCreep.getToughBoostLevel(true);
															if (toughBoostLevel >= 2) {
																let numTough = formationCreep.getNumOfBodyPart(TOUGH);
																// Hmm. Really?
																if (numTough > 5) {
																	threshold = 0.8 * numTough / MAX_CREEP_SIZE;
																}
																else {
																	threshold = (assumePush ? 0.15 : 0.2)
																}

																let mod = 1;
																if 		(toughBoostLevel == 4) mod = 0.3;
																else if (toughBoostLevel == 3) mod = 0.5;
																else if (toughBoostLevel == 2) mod = 0.7;

																if (predictedDamage * mod < numTough * 100) {
																	// console.log("A pred damage", dir, pos, zeroCreep, toughBoostLevel, predictedDamage, this.getDamageForPos(pos, nearbyHostiles, closeHostiles, assumePush, formationCreep.room.towers))
																	predictedDamage *= mod;
																	// console.log("A2 pred damage", dir, pos, zeroCreep, toughBoostLevel, predictedDamage, this.getDamageForPos(pos, nearbyHostiles, closeHostiles, assumePush, formationCreep.room.towers))
																}
																else {
																	// console.log("B pred damage", dir, pos, zeroCreep, toughBoostLevel, predictedDamage, this.getDamageForPos(pos, nearbyHostiles, closeHostiles, assumePush, formationCreep.room.towers))
																	predictedDamage -= (numTough * 100) / mod - numTough * 100;
																	// console.log(numTough, mod)
																	// console.log("B2 pred damage", dir, pos, zeroCreep, toughBoostLevel, predictedDamage, this.getDamageForPos(pos, nearbyHostiles, closeHostiles, assumePush, formationCreep.room.towers))
																}

																// formationCreep.say(Math.round((numTough * 100) / 0.3));
															}
															else {
																threshold = (assumePush ? 0.15 : 0.2)
															}


															// sumPredictedDamage += predictedDamage;

															// console.log(creep, predictedDamage, numHeals)

															if (anyMovingIntoSwamp) {
																threshold /= 5;
															}

															if (onEdge || outOfRoom) {
																threshold *= (mask.length == 4 ? 0.75 : 0.9)
															}

															// We're expecting power. There ain't no power. What gives? Careful I think.
															if (!formationCreep.room.canPowerCreepDisruptTower && formationCreep.mem.expectingPowerSupport) {
																threshold *= 0.8;
															}

															if (isOnTargetOrAdvancedPoint(zeroCreep)) {
																threshold *= 0.5;
															}
															if (isOnAdvancedPoint(zeroCreep)) {
																threshold *= 0.5;
															}

															if (bravery > 0) {
																threshold *= 1 + bravery / 10;
															}
															else {
																// Bravery = -10, mod = 0.5
																threshold /= 1 - bravery / 10;	
															}

															// We're expecting power. There ain't no power. What gives? Careful I think.
															if (!creep.room.canPowerCreepDisruptTower && creep.mem.expectingPowerSupport) {
																threshold *= 0.8;
															}

															threshold *= (0.9 + Math.random() * 0.2)

															// Be less pushy at low bucket to stop retreat bouncing
															if (Game.cpu.bucket < 1000) {
																threshold *= (Game.cpu.bucket - 500) / 500
															}

															// console.log(formationCreep, "pred damage", dir, pos, zeroCreep, toughBoostLevel, predictedDamage, numHeals * 12)//, this.getDamageForPos(pos, nearbyHostiles, closeHostiles, assumePush, formationCreep.room.towers));

															// TODO: Probably should be looking at the sum at least a little? This assumes perfect pre-healing...
															if (predictedDamage > maxPredictedDamage) {
																maxPredictedDamage = predictedDamage;

																let healMod
																let effectiveMaxHP = formationCreep.getEffectiveMaxHitPoints()
																if (maxPredictedDamage > effectiveMaxHP * .75) {
																	healMod = effectiveMaxHP * .75 / maxPredictedDamage
																}
																else {
																	healMod = 1;
																}

																if (maxPredictedDamage - healMod * numHealsActive * 12 > 100 * formationCreep.body.length * threshold) {
																	if (ret.towersOnly) {
																		blkDamageTowersOnly = true
																	}
																	formationCreep.say(dir + " " + Math.round(predictedDamage - healMod * numHealsActive * 12) + " " + Math.round(threshold * 100));
																	blkDamage = true;
																	break;
																}
															}
														}
													}
												}

												// More than 20% damage in a single tick is bad news. This is before tough.
												if (blkDamage) {
													// console.log(zeroCreep, "AdvBlkDmg", maxPredictedDamage, numHeals * 12)
													// zeroCreep.say("AdvBlkDmg" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : ""));

													creep.room.advBlkDmg = (creep.room.advBlkDmg || 0) + 1;
													if (blkDamageTowersOnly) {
														creep.room.advBlkDmgTowersOnly = (creep.room.advBlkDmgTowersOnly || 0) + 1;
													}

													// console.log(this.formationCheckBlockedUnits(zeroCreep, sideLength - 1), zeroCreep)
													if (zeroCreep.mem.directionalFormation && (!this.formationCheckBlockedUnits(zeroCreep, 0, sideLength, false) || Math.random() < 0.1)) {												
														let targetOrientation;

														let intDir = parseInt(dir)

														if (intDir == TOP || intDir == RIGHT || intDir == BOTTOM || intDir == LEFT) {
															// If we're side-slipping we don't want to rotate
															if (zeroCreep.mem.sideSlipDir != intDir || zeroCreep.mem.path[1] && Math.abs(parseInt(zeroCreep.mem.path[1]) - intDir) == 2) {
																targetOrientation = intDir;
															}
														}
														else if (intDir == TOP_RIGHT || intDir == TOP_LEFT || intDir == BOTTOM_RIGHT || intDir == BOTTOM_LEFT) {
															if (creep.mem.targetPos && creep.mem.targetPos.retreatDir && (creep.mem.targetPos.retreatDir == TOP || creep.mem.targetPos.retreatDir == RIGHT || creep.mem.targetPos.retreatDir == BOTTOM || creep.mem.targetPos.retreatDir == LEFT)) {															
																let nonTowerDamage = false;
																for (var i = 0; i < mask.length; i++) {
																	let formationCreep = Game.creeps[creep.mem.formationCreeps[i]];
																	if (formationCreep && formationCreep.nonTowerDamage) {
																		nonTowerDamage = true;
																		break
																	}
																}
																if (nonTowerDamage) {
																	targetOrientation = getMostDamagingOrientation(zeroCreep, intDir);
																}
																else {
																	targetOrientation = (creep.mem.targetPos.retreatDir + 4 - 1) % 8 + 1
																}
															}
															else {
																targetOrientation = getMostDamagingOrientation(zeroCreep, intDir);
															}
														}

														// console.log(zeroCreep, zeroCreep.mem.formationOrientation, targetOrientation)


														if (targetOrientation && zeroCreep.mem.formationOrientation != targetOrientation) {
															let willCauseFatigue = false;

															for (var i = 0; i < mask.length; i++) {
																if (Game.creeps[creep.mem.formationCreeps[i]]) {
																	if (Game.creeps[creep.mem.formationCreeps[i]].getNumOfBodyPart(MOVE) != Game.creeps[creep.mem.formationCreeps[i]].getActiveBodyparts(MOVE)) {
																		willCauseFatigue = true;
																		break;
																	}
																}
															}
															if (!willCauseFatigue) {															
																this.formation2x2Rotate(targetOrientation, zeroCreep);
																moving = true;
															}
														}
													}

													zeroCreep.mem.mS = 0;
													// Repath.
													if (Math.random() < 0.01) {
														delete zeroCreep.mem.pO;
													}
													if (blkDamageTowersOnly && Math.random() < 0.01) {
														delete zeroCreep.mem.pO;
													}
												}
												else {
													// Drainers don't advance if any has taken damage and they're no on room edge
													if (zeroCreep.lowEAssault && totalLostHits >= 100 && !onEdge) {
														zeroCreep.say("AdvBlkDrn");
													}
													else {
														let blockingCreep = this.formationCheckBlockedUnits(zeroCreep, parseInt(zeroCreep.mem.path[0]), sideLength - (splitRooms ? 1 : 0), isOnTargetOrAdvancedOrRetreatPoint(creep));

														let swampMove = swampy;

														let moved = 0;

														if (!blockingCreep || (oldStuck > 3.5 * (swampy ? 3 : 1) + Math.random() && !blockingCreep.notMoving)) {
															// For moons
															if (blockingCreep) {
																for (var i = 0; i < mask.length; i++) {
																	if (Game.creeps[creep.mem.formationCreeps[i]]) {
																		Game.creeps[creep.mem.formationCreeps[i]].blockedMove = 1
																	}
																}

															}

															let hardBlock = 0

															// Never force move to a hostile or fatigued creep assuming it'll get out the way. That's dumb.
															if (blockingCreep) {
																for (var i = 0; i < mask.length; i++) {
																	if (Game.creeps[creep.mem.formationCreeps[i]]) {
																		let moveToPos = Game.creeps[creep.mem.formationCreeps[i]].pos.getPosInDirection(dir);

																		let creepsAtPos = moveToPos.lookFor(LOOK_CREEPS).concat(moveToPos.lookFor(LOOK_POWER_CREEPS));
																		for (let otherCreep of creepsAtPos) {
																			if (!otherCreep.my || otherCreep.fatigue || otherCreep.notMoving) {
																				hardBlock = 1;
																				break;
																			}
																		}
																	}
																	if (hardBlock) break;
																}
															} 

															if (!hardBlock) {
																zeroCreep.say("Adv");
																moved = 1;
																if (zeroCreep.mem.path.length > 1) {
																	Game.creeps[creep.mem.formationCreeps[0]].mem.lastFPos = Game.creeps[creep.mem.formationCreeps[0]].pos;

																	zeroCreep.stepPath(zeroCreep.mem.path);
																	zeroCreep.expectedPos = zeroCreep.pos.getPosInDirection(dir);

																	// Direction is the 0 element of the path.
																	for (var i = 1; i < mask.length; i++) {
																		if (Game.creeps[zeroCreep.mem.formationCreeps[i]]) {
																			let creep = Game.creeps[zeroCreep.mem.formationCreeps[i]]
																			creep.mem.lastFPos = creep.pos;
																			creep.move(dir);
																			creep.expectedPos = creep.pos.getPosInDirection(dir);
																			creep.mem.lastMove = dir;
																			delete creep.mem.sideSlipDir
																		}
																	}
																}
																else {
																	for (var i = 0; i < mask.length; i++) {
																		if (Game.creeps[zeroCreep.mem.formationCreeps[i]]) {
																			let creep = Game.creeps[zeroCreep.mem.formationCreeps[i]]
																			creep.mem.lastFPos = creep.pos;
																			creep.move(dir);
																			creep.expectedPos = creep.pos.getPosInDirection(dir);
																			creep.mem.lastMove = dir;
																			delete creep.mem.sideSlipDir
																		}
																	}
																	delete zeroCreep.mem.path
																}

																moving = true;
																zeroCreep.mem.mS = 0;
																for (var i = 0; i < mask.length; i++) {
																	if (Game.creeps[creep.mem.formationCreeps[i]]) {
																		delete Game.creeps[creep.mem.formationCreeps[i]].mem.forceNewTarget
																		delete Game.creeps[creep.mem.formationCreeps[i]].mem.considerNewTarget
																	}
																}
															}
														}
														if (!moved) {
															if (blockingCreep && blockingCreep.my && blockingCreep.assaulter) {
																for (var i = 0; i < mask.length; i++) {
																	if (Game.creeps[creep.mem.formationCreeps[i]]) {
																		if (blockingCreep.notMoving) {
																			Game.creeps[creep.mem.formationCreeps[i]].mem.forceNewTarget = Game.time;
																		}
																		else {
																			Game.creeps[creep.mem.formationCreeps[i]].mem.considerNewTarget = Game.time;
																		}
																	}
																}
															}
															zeroCreep.say("AdvBlkCrp" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : ""));
															if (this.moveBlkCreep(zeroCreep, sideLength, false, mask)) {
																moving = true;
															}

															zeroCreep.mem.mS = oldStuck + 1;
														}
													}											
												}
											}
											else {
												zeroCreep.room.notOnWall -= 1;

												zeroCreep.say("AdvBlkBld" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : ""));
											}
										}
										else {
											zeroCreep.say("AdvNopth" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : "_") + (splitStatic ? 1 : 0));
											// for (var i = 0; i < 4; i++) {
											// 	if (Game.creeps[creep.mem.formationCreeps[i]]) {
											// 		delete Game.creeps[creep.mem.formationCreeps[i]].mem.setupPos
											// 	}
											// }
										}

									}
									else {
										zeroCreep.say("AdvNopth" + (zeroCreep.mem.path ? zeroCreep.mem.path[0] : "_") + (splitStatic ? 1 : 0));
										// for (var i = 0; i < 4; i++) {
										// 	if (Game.creeps[creep.mem.formationCreeps[i]]) {
										// 		delete Game.creeps[creep.mem.formationCreeps[i]].mem.setupPos
										// 	}
										// }
									}
								}

							}
						}
						else {
							zeroCreep.say("caw")

						}

					}
					else {

						if (withdraw || withdrawFast) {
							delete formationRetreatMoveOptions.movementMask
							delete formationRetreatMoveOptions.pathOnly

							if (creep.mem.setupRoom) {
								snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(25, 25, creep.mem.setupRoom), formationRetreatMoveOptions, 20, true, true)
							}
							else if (creep.mem.setupPos) {
								snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), formationRetreatMoveOptions, 20, true, true)
							}
							else {
								let retreatPos = new RoomPosition(25, 25, creep.mem.sR)
								snakeAI.moveSnake(creep.mem.allSquadCreeps, retreatPos, formationRetreatMoveOptions, 20, true, true)
								console.log("NO SETUP POS!!!", creep)
							}

						}
						else if (!canOnlyWithdraw) {
							delete formationMoveOptions.movementMask
							delete formationMoveOptions.pathOnly
							formationMoveOptions.avoidEnemyRooms = 1
							
							if (creep.room.name == creep.mem.setupRoom || (creep.mem.setupPos && creep.room.name == creep.mem.setupPos.roomName) || creep.room.name == creep.mem.targetRoom || creep.mem.reachedSetup) {
								creep.mem.reachedSetup = 1
								if (creep.mem.target) {
									// formationMoveOptions.maxRooms = 2; 

									snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.targetRoom), formationMoveOptions, creep.mem.targetRange || 1, true, false)
								}
								else {
									console.log("NO TARGET!!!", creep)		
								}
							}
							else {
								var moveOptions = {"ignoreKeepers": 1,
						  							"avoidEnemyRooms" : 1,
						  							"avoidHostiles": 0.1};

								if (creep.mem.setupRoom) {
									snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(25, 25, creep.mem.setupRoom), moveOptions, 20, true, true)
								}
								else if (creep.mem.setupPos) {
									snakeAI.moveSnake(creep.mem.allSquadCreeps, new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), moveOptions, 20, true, true)
								}
							}
						}
						else {
							zeroCreep.say("caw")
						}
					}
				}

				for (var formationCreepName of creep.mem.formationCreeps) {
					var formationCreep = Game.creeps[formationCreepName];
					if (formationCreep) {
						formationCreep.moveOrdersGiven = true;
						formationCreep.notMoving = !moving
					}
				}
			}
		}
		else {
			for (var formationCreepName of creep.mem.formationCreeps) {
				var formationCreep = Game.creeps[formationCreepName];
				if (formationCreep) {
					creep.mem.retreat = true;
				}
			}
		}
	},
};

module.exports = formationAI;