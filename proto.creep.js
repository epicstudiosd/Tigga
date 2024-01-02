"use strict";

var pathCache = require('pathCache');
var roomDefenseAI = require('roomDefenseAI');

var util = require('util');
var safeRoute = require('safeRoute');
const segments = require('segments');
const constants = require('constants');
const moveResolver = require('moveResolver');
const scouting = require('scouting');

module.exports = function() {
	Creep.prototype.ramparter = 0;
	Creep.prototype.moon = 0;
	Creep.prototype.assaulter = 0;
	Creep.prototype.retreat = 0;
	Creep.prototype.healOrdersGiven = 0;
	Creep.prototype.movedThisTick = 0;
	Creep.prototype.moveOrdersGiven = 0;
	Creep.prototype.nudged = null;
	Creep.prototype.hasNudged = false;
	Creep.prototype.renew = 0;


	Object.defineProperty(Creep.prototype, 'mem', {
		get: function() {
			// if (!this.my) {
			// 	throw new Error("Getting memory on a creep that ain't mine");
			// }
			return Memory.creeps[this.name] = Memory.creeps[this.name] || {};
		},
		set: function(value) {
			// if (!this.my) {
			// 	throw new Error("Setting memory on a creep that ain't mine");
			// }
			Memory.creeps[this.name] = value
		},
		configurable: true,
	});	

	Creep.prototype.initTick = function() {
		// Override the above. The above is needed as for some reason spawning creeps don't have memory when this is set. ???
		this.mem = Memory.creeps[this.name];
	}

	Creep.prototype.getPreferredNudgeDirections = function(nudger, step) {
		let nudgerNextPathStep = nudger.mem.path && nudger.mem.path.length > 1 ? nudger.mem.path[1] : null

		let preferredNudgeDirections = []
		if (this.mem.role == "upgrader") {
			let target = Game.getObjectById(this.mem.fT)
			if (!target) {
				target = Game.getObjectById(this.mem.link)
			}			
			if (!target) {
				target = this.pos.findFirstInRange(this.room.containers, 1)
			}
			if (!target) {
				target = this.pos.findFirstInRange(this.room.links, 1)
			}
			if (target) {
				for (let dir = 1; dir <= 8; dir++) {
					if (nudgerNextPathStep == dir && step == 0) continue

					let pos = this.pos.getPosInDirection(dir);
					if (target.pos.isNearToPos(pos)) {
						let creeps = this.room.lookForAt(LOOK_CREEPS, pos.x, pos.y);

						if (creeps.length > 0 && creeps[0] != nudger) {
							continue;
						}

						preferredNudgeDirections.push(dir)
					}
				}
				if (preferredNudgeDirections.length) {
					return preferredNudgeDirections	
				}				

			}

			let controller = this.room.controller
			if (controller) {
				for (let dir = 1; dir <= 8; dir++) {
					if (nudgerNextPathStep == dir && step == 0) continue

					let pos = this.pos.getPosInDirection(dir);				
					if (controller.pos.inRangeToPos(pos, 3)) {
						let creeps = this.room.lookForAt(LOOK_CREEPS, pos.x, pos.y);

						if (creeps.length > 0 && creeps[0] != nudger) {
							continue;
						}

						preferredNudgeDirections.push(dir)
					}
				}
			}

			return preferredNudgeDirections

			// console.log(this, preferredNudgeDirections)

		}
		else if ((this.mem.role == "repairer" || this.mem.role == "builder") && !this.mem.f) {
			let tgt = Game.getObjectById(this.mem.bTgt || this.mem.rTgt);
			if (!tgt) return;

			if (this.room.dangerous) {
				for (let dir = 1; dir <= 8; dir++) {
					if (nudgerNextPathStep == dir && step == 0) continue

					if (tgt.pos.getRangeToPos(this.pos.getPosInDirection(dir)) == 3) {
						preferredNudgeDirections.push(dir)
					}
				}
			}
			else {				
				for (let dir = 1; dir <= 8; dir++) {
					if (nudgerNextPathStep == dir && step == 0) continue

					if (tgt.pos.inRangeToPos(this.pos.getPosInDirection(dir), 3)) {
						preferredNudgeDirections.push(dir)
					}
				}
			}

			return preferredNudgeDirections
		}
		else if (this.mem.role == "newPowerTank") {
			let tgt = new RoomPosition(this.mem.target.x, this.mem.target.y, this.mem.target.roomName)
			if (!tgt) return;

			for (let dir = 1; dir <= 8; dir++) {
				if (nudgerNextPathStep == dir && step == 0) continue

				if (tgt.inRangeToPos(this.pos.getPosInDirection(dir), 1)) {
					preferredNudgeDirections.push(dir)
				}
			}
			return preferredNudgeDirections			
		}
		else if (this.mem.role == "season5ThoriumMiner") {
			let target = Game.getObjectById(this.mem.hSource)
			if (target) {
				for (let dir = 1; dir <= 8; dir++) {
					if (nudgerNextPathStep == dir && step == 0) continue

					if (target.pos.isNearToPos(this.pos.getPosInDirection(dir))) {
						preferredNudgeDirections.push(dir)
					}
				}
				return preferredNudgeDirections
			}
			
			return preferredNudgeDirections

			// console.log(this, preferredNudgeDirections)

		}		
		else {
			let terrain = Game.map.getRoomTerrain(this.room.name)
			for (let dir = 1; dir <= 8; dir++) {
				if (nudgerNextPathStep == dir && step == 0) continue

				let newPos = this.pos.getPosInDirection(dir)
				if (newPos.x == 0 || newPos.x == 49 || newPos.y == 0 || newPos.y == 49) continue

				if (terrain.get(newPos.x, newPos.y) & TERRAIN_MASK_SWAMP) {
					let structs = this.room.lookForAt(LOOK_STRUCTURES, newPos.x, newPos.y);
					for (let struct of structs) {
						if (struct.structureType == STRUCTURE_ROAD) {
							preferredNudgeDirections.push(dir)			
						}
					}
				}
				else {
					preferredNudgeDirections.push(dir)
				}		
			}
			return preferredNudgeDirections			
		}

	}

	Creep.prototype.processNudges = function() {
		// if (this.nudged && this.mem.type !== undefined) {
		// 	console.log(this, this.nudged)
		// }
		if (this.nudged && (!this.hasNudged || Math.random() < 0.5) && this.fatigue == 0 && (!this.mem.path || this.mem.path.length == 1 || (Game.creeps[this.nudged] || Game.powerCreeps[this.nudged]).mem.mS >= 7)) {
			// if (this.nudged && this.mem.type !== undefined) {
			// 	console.log(this, this.nudged)
			// }

			// Piss of, I don't move for noone
			if (this.mem.role == "sbs" || this.strongholdSniper) {
				this.nudged = false;
				return
			}

			// if (Memory.season3 && this.mem.role == "powerShuffler") {
			// 	this.nudged = false;
			// 	return
			// }

			let nudger = Game.creeps[this.nudged] || Game.powerCreeps[this.nudged]

			if (nudger.mem.role == "healer" && (this.hasBodypart(ATTACK) || this.hasBodypart(RANGED_ATTACK) || this.powerCreep)) {
				return;
			}
			// Harvesters can't nudge pioneers
			if (nudger.mem.role == "harvester" && this.mem.role == "pioneer") {
				return
			}

			if (!this.hasBodypart(MOVE)) {
				return
			}

			// console.log(this)

			// Don't mess with formations
			// if (this.mem.formationPosition !== undefined && !this.mem.retreat && !this.setupFormation && this.mem.formationCreeps && !this.mem.formationCreeps.includes(nudger.name)) {
			if (this.mem.formationPosition !== undefined && !this.mem.retreat && !this.setupFormation /*&& this.mem.formationCreeps && !this.mem.formationCreeps.includes(nudger.name)*/) {
				return;
			}

			// Proper stuck. Flee
			if (nudger.mem.mS >= 9) {
				this.uncachedMoveTo(nudger.pos, 10, {flee: 1})
			}
			else {
				var iDir = Math.random() > 0.5 ? -1 : 1;

				let terrain = Game.map.getRoomTerrain(this.room.name)

				let preferredNudgeDirections = this.getPreferredNudgeDirections(nudger, 0) || []

				if (!preferredNudgeDirections.length) {
					preferredNudgeDirections = this.getPreferredNudgeDirections(nudger, 1) || []
				}

				let startPass = (preferredNudgeDirections.length ? 0 : 1)
				let endPass = 2

				for (let pass = startPass; pass < endPass; pass++) {
					for (var i = -1; i <= 1; i++) {
						var x = this.pos.x + i * iDir;
						if (x <= 0 || x >= 49) continue

						var jDir = Math.random() > 0.5 ? -1 : 1;

						for (var j = -1; j <= 1; j++) {
							var y = this.pos.y + j * jDir;
							if (y <= 0 || y >= 49) continue
							if (i == 0 && j == 0) continue;


							if (terrain.get(x, y) & TERRAIN_MASK_WALL) {
								continue;
							}

							var targets = this.room.lookForAt(LOOK_STRUCTURES, x, y);

							targets = targets.concat(this.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y));

							targets = _.filter(targets, (structure) => {return !(structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER || (structure.structureType === STRUCTURE_RAMPART && structure.my))});

							if (Memory.season1) {
								targets = targets.concat(this.room.find(FIND_SCORE_COLLECTORS, {filter: (s) => (s.pos.x == x && s.pos.y == y)}))
							}


							if (targets.length > 0) continue;

							let moveResolverState = moveResolver.getState(this.room.name)
							if (moveResolverState && moveResolverState[x * 100 + y + 25]) {
								continue
							}

							var creeps = this.room.lookForAt(LOOK_CREEPS, x, y);

							if (creeps.length > 0 && creeps[0] != nudger) continue;

							var powerCreeps = this.room.lookForAt(LOOK_POWER_CREEPS, x, y);
							if (powerCreeps.length > 0 && powerCreeps[0] != nudger) continue;

							// Don't nudge to outside of the safe zone..
							if (this.room.dangerous && (this.room.mem.ID !== undefined) && (this.hasDamagingBodypart() || this.hasBodypart(HEAL) || this.mem.role == "repairer")) {
								var targetRamparts = this.room.lookForAt(LOOK_STRUCTURES, x, y);

								targetRamparts = _.filter(targetRamparts, (structure) => {return (structure.structureType === STRUCTURE_RAMPART && structure.my)});

								if (targetRamparts.length == 0) {
									continue;
								}
							}

							if (targets.length == 0 && powerCreeps.length == 0) {
								let dir 
								if (i * iDir == 1) {
									dir = 3 + j * jDir
									// console.log(this, "is nudged", this.pos.x, this.pos.y, x, y, 3 + j * jDir)
								}
								else if (i == 0) {
									dir = 3 + 2 * j * jDir
									// console.log(this, "is nudged", this.pos.x, this.pos.y, x, y, 3 + 2 * j * jDir)
								}
								else if (i * iDir == -1) {
									dir = 7 - j * jDir
									// console.log(this, "is nudged", this.pos.x, this.pos.y, x, y, 7 - j * jDir)
								}

								if (pass == 0 && !preferredNudgeDirections.includes(dir)) {
									continue
								}

								if (this.move(dir) == OK) {		
									delete this.mem.path
									// if (this.room.name == "E30N0") {
									// 	console.log(this, dir, nudger)
									// }						
									this.say("Bumped1!")
									// this.say("Bumped1!"+(i*iDir+1).toString()+(j*jDir+1).toString())
									delete this.mem.simpleHarvest
									nudger.say("Bump1!")
									if (nudger.mem.mS && Math.random() < .9) nudger.mem.mS--
									// nudger.say("Bump1!"+(i*iDir+1).toString()+(j*jDir+1).toString())
								}

								return;
							}
						}
					}
				}

				// Couldn't find a slot to move in to. Must be the only slot is where the nudger is.
				// Move to it!
				if (this.move(this.pos.getDirectionTo(nudger.pos)) == OK) {				
					this.say("Bumped2!")
					delete this.mem.path
					nudger.say("Bump2!")
					if (nudger.mem.mS && Math.random() < .9) nudger.mem.mS--
				}
				// this.moveTo(this.nudged, {ignoreCreeps: true, reusePath: 0})
			}


		}
	}

	// Stats tracking - doesn't get fed back
	let build = Creep.prototype.build

	Creep.prototype.build = function(target) {
		var ret = build.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;

		if (ret == OK) {
			global.inTickObject.energyExpenditures["build"] = (global.inTickObject.energyExpenditures["build"] || 0) + this.getNumOfBodyPart(WORK) * BUILD_POWER;
			global.inTickObject.energyExpenditures["build_" + target.structureType] = (global.inTickObject.energyExpenditures["build_" + target.structureType] || 0) + this.getNumOfBodyPart(WORK) * BUILD_POWER;
		}

		return ret;
	}

	let repair = Creep.prototype.repair
	Creep.prototype.repair = function(target) {
		var ret = repair.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;

		if (ret == OK) {
			global.inTickObject.energyExpenditures["repair"] = (global.inTickObject.energyExpenditures["repair"] || 0) + this.getNumOfBodyPart(WORK);
			global.inTickObject.energyExpenditures["repair_" + target.structureType] = (global.inTickObject.energyExpenditures["repair_" + target.structureType] || 0) + this.getNumOfBodyPart(WORK);
		}

		return ret;
	}

	let upgradeController = Creep.prototype.upgradeController
	Creep.prototype.upgradeController = function(target) {
		var ret = upgradeController.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;

		if (ret == OK) {
			global.inTickObject.creepUpgraded = global.inTickObject.creepUpgraded || {}

			if (!global.inTickObject.creepUpgraded[this.id]) {
				global.inTickObject.creepUpgraded[this.id] = 1
				global.inTickObject.energyExpenditures["upgradeController"] = (global.inTickObject.energyExpenditures["upgradeController"] || 0) + Math.min(this.store[RESOURCE_ENERGY], this.getNumOfBodyPart(WORK));
			}
			// else {
				// console.log("Already upgraded OK?", this)
				// throw(new Error())
			// }
		}

		return ret;
	}
	

	let harvest = Creep.prototype.harvest
	Creep.prototype.harvest = function(target) {
		var ret = harvest.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;

		if (ret == OK) {
			if (target.energy) {
				Game.harvestedThisTick += this.mem.hpt || 0;
				this.room.harvestedThisTick += this.mem.hpt || 0;
			}
		}

		return ret;
	}

	let drop = Creep.prototype.drop
	Creep.prototype.drop = function(target, amount) {
		var ret = drop.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;

		return ret;
	}

	let pickup = Creep.prototype.pickup
	Creep.prototype.pickup = function(target) {
		var ret = pickup.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;

		return ret;
	}

	Creep.prototype.pickupAndUpdateCarry = function(target) {
		var ret = pickup.apply(this, arguments);

		if (ret == OK) {
			global._creepStoreUsedCapacity[this.id] = Math.min(this.carryCapacity, this.getStoreUsedCapacity() + target.amount)
		}

		return ret;
	}

	let transfer = Creep.prototype.transfer
	Creep.prototype.transfer = function(target, resourceType, amount) {
		var ret = transfer.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;
		if (target) global._creepStoreUsedCapacityInvalid[target.id] = 1;

		return ret;
	}


	Creep.prototype.transferAndUpdateCarry = function(target, resourceType, amount) {
		let ret = this.transfer(target, resourceType, amount);
		if (ret == OK) {
			global._creepStoreUsedCapacity[this.id] = this.getStoreUsedCapacity() - Math.min((amount || Infinity), target.store ? target.store.getFreeCapacity() : Infinity, this.store[resourceType])
		}
		return ret;
	}


	let withdraw = Creep.prototype.withdraw
	Creep.prototype.withdraw = function(target, resourceType, amount) {
		var ret = withdraw.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;
		if (target) global._creepStoreUsedCapacityInvalid[target.id] = 1;

		return ret;
	}

	Creep.prototype.withdrawAndUpdateCarry = function(target, resourceType, amount) {
		let ret = this.withdraw(target, resourceType, amount);
		if (ret == OK) {
			global._creepStoreUsedCapacity[this.id] = Math.min(this.carryCapacity, this.getStoreUsedCapacity() + Math.min((amount || Infinity), target.store[resourceType]))
		}
		return ret;
	}


	let generateSafeMode = Creep.prototype.generateSafeMode
	Creep.prototype.generateSafeMode = function(target) {
		var ret = generateSafeMode.apply(this, arguments);

		global._creepStoreUsedCapacityInvalid[this.id] = 1;

		return ret;
	}

	let rangedAttack = Creep.prototype.rangedAttack
	Creep.prototype.rangedAttack = function(target) {
		var ret = rangedAttack.apply(this, arguments);

		if (ret == OK && target && target.structureType && !target.structureType.owner) {
			this.room.rangedOnUnowned = (this.room.rangedOnUnowned || 0) + 1;
		}

		this.mem.engaged = 1

		return ret;
	}

	let rangedMassAttack = Creep.prototype.rangedMassAttack
	Creep.prototype.rangedMassAttack = function() {
		var ret = rangedMassAttack.apply(this, arguments);

		this.mem.engaged = 1

		return ret;
	}

	let attack = Creep.prototype.attack
	Creep.prototype.attack = function(target) {
		var ret = attack.apply(this, arguments);

		this.mem.engaged = 1

		return ret;
	}	

	let heal = Creep.prototype.heal

	Creep.prototype.forceHeal = function(target) {
		return heal.apply(this, arguments);
	}

	Creep.prototype.heal = function(target) {
		let ret
		if (!this.healOrdersGiven) {
			ret = heal.apply(this, arguments);
		}
		else {
			ret = 999;
		}

		if (ret == OK) {			
			this.healOrdersGiven = 1
		}
		this.mem.engaged = 1

		return ret;
	}

	let rangedHeal = Creep.prototype.rangedHeal
	Creep.prototype.rangedHeal = function(target) {
		let ret
		if (!this.healOrdersGiven) {
			ret = rangedHeal.apply(this, arguments);
		}
		else {
			ret = 999;
		}

		if (ret == OK) {
			this.healOrdersGiven = 1
			this.hasDoneRangedHeal = 1
		}
		this.mem.engaged = 1

		return ret;
	}

	let move = Creep.prototype.move
	Creep.prototype.trackedMove = function(target) {
		let ret = moveResolver.move(this, target, move)

		if (ret != OK) {
			// Run it again at the end with repath
			if (ret == -999) {
				let skipReplay = false;
				if (this.mem.role == "fetcher" && Math.random() > 0.75) {
					skipReplay = true;
				}
				// if (global.creepReplayPhase) {
				// 	this.mem.mS = (this.mem.mS || 0) + 1
				// }
				if (!skipReplay && (this.mem.pTgtRoom == this.room.name || Game.cpu.bucket > 9000)) {
					delete this.mem.pTgtRoom
					delete this.mem.pTX
					delete this.mem.pTY

					// this.mem.stuckPath = this.mem.path

					// Don't delete path as we'll want it to compare with
					global.inTickObject.replayCreep = global.inTickObject.replayCreep || []
					global.inTickObject.replayCreep.push(this.name)
				}
			}
			this.say(ret)
		}
		return ret;
	}

	Creep.prototype.resolvedMove = function(target) {
		return move.apply(this, arguments);
	}




	let moveTo = Creep.prototype.moveTo;
	// let moveByPath = Creep.prototype.moveByPath;

	Creep.prototype.moveTo = function(x, y, opts) {
		if (this.fatigue > 0) return ERR_TIRED
		delete this.mem.path

		// if (opts.shouldUseRoads) {

		// }

		// var ret = moveTo.apply(this, arguments);
		var ret = moveTo.call(this, x, y, opts);

		// if (ret == -999) return ret

		// Not quite accurate at the start of a path
		var lastPos = this.mem.lP;
		if (lastPos && ((lastPos.x == this.pos.x && lastPos.y == this.pos.y) ||
			(util.isEdgeOfRoom(lastPos) && util.isEdgeOfRoom(this.pos)))) {
			this.mem.mS = (this.mem.mS || 0) + 1;
		}
		else {
			this.mem.mS = 0;
		}
		this.mem.lP = {x: this.pos.x, y: this.pos.y}


		return ret;
	}
	Creep.prototype.moveTo = function(target, opts) {
		if (this.fatigue > 0) return ERR_TIRED
		delete this.mem.path

		var ret = moveTo.call(this, target, opts);

		// Not quite accurate at the start of a path
		var lastPos = this.mem.lP;
		if (lastPos && ((lastPos.x == this.pos.x && lastPos.y == this.pos.y) ||
			(util.isEdgeOfRoom(lastPos) && util.isEdgeOfRoom(this.pos)))) {
			this.mem.mS = (this.mem.mS || 0) + 1;
		}
		else {
			this.mem.mS = 0;
		}
		this.mem.lP = {x: this.pos.x, y: this.pos.y}


		return ret;
	}

	Creep.prototype.updatePathForLastMove = function() {
		let mem = this.mem;
		let lastPos = mem.lP;
		if (mem.path && 
			mem.path.length && 
			lastPos && 
			(lastPos.x != this.pos.x || lastPos.y != this.pos.y) &&
			(!util.isEdgeOfRoom(this.pos) || !util.isEdgeOfRoom(lastPos))) {
			mem.path = mem.path.substr(1)
			mem.lP = {x: this.pos.x, y: this.pos.y};
		}
	}

	Creep.prototype.stepPath = function(path, opts) {
		// Saves some parsing
		if (this.fatigue > 0) return ERR_TIRED
		var mem = this.mem;

		if (mem.path.length == 0) {
			mem.mS = 0;
			delete mem.path
			delete mem.pTX
			delete mem.pTY
			delete mem.pTgtRoom
			delete mem.pO
			return OK
		}
		else {
			var ret = this.move(+mem.path[0]);
			this.movedThisTick = 1;
			mem.lP = {x: this.pos.x, y: this.pos.y}
			return ret;
		}
	}


	Creep.prototype.myMoveByPath = function(path, opts) {
		// Saves some parsing
		// if (this.fatigue > 0) return ERR_TIRED
		var mem = this.mem;

		var lastPos = mem.lP;
		// if (this.name == "r7072_9915") console.log(this.name, this.room.name, this.nudged, lastPos, mem.path.length, this.pos.x, this.pos.y, this.pos)

		// Recently added the edge of room check
		// 4-7-21 added sideways on edge check
		if (mem.path.length && 
			lastPos && 
			(lastPos.x != this.pos.x || lastPos.y != this.pos.y) && 
			((!util.isEdgeOfRoom(this.pos) || !util.isEdgeOfRoom(lastPos) || (this.pos.x != lastPos.x && this.pos.y != lastPos.y)))) {
			// ((!util.isEdgeOfRoom(this.pos) || !util.isEdgeOfRoom(lastPos)) || (util.isEdgeOfRoom(this.pos) && util.isEdgeOfRoom(lastPos)))) {
		// if (mem.path.length && lastPos && (lastPos.x != this.pos.x || lastPos.y != this.pos.y)) {
			mem.path = mem.path.substr(1)
		}
		if (mem.path.length == 0) {
			mem.mS = 0;
			delete mem.path
			delete mem.pTX
			delete mem.pTY
			delete mem.pTgtRoom
			delete mem.pO
			return OK
		}
		else {
			var ret = this.move(+mem.path[0]);
			this.movedThisTick = 1;
			// if (this.name == "Melati") console.log(ret, this.name, this.room.name, this.nudged, lastPos, mem.lP, mem.path.length, this.pos.x, this.pos.y, this.pos)
			// if (this.name == "r7072_9915") console.log(this.name, this.room.name, this.nudged, lastPos, mem.path.length, this.pos.x, this.pos.y, this.pos)
			// if (this.name == "f526") console.log(mem.mS)
			// if (this.room.name == "W3S23") console.log(ret, this.name, this.nudged, lastPos, this.pos)
			// if (!this.nudged && ((lastPos && ((lastPos.x == this.pos.x && lastPos.y == this.pos.y) ||
				// (util.isEdgeOfRoom(lastPos) && util.isEdgeOfRoom(this.pos)))))) {
			if (((!lastPos && (mem.path.length == 1 || util.isEdgeOfRoom(this.pos))) || (lastPos && ((lastPos.x == this.pos.x && lastPos.y == this.pos.y) ||
				(util.isEdgeOfRoom(lastPos) && util.isEdgeOfRoom(this.pos) && (lastPos.x == this.pos.x || lastPos.y == this.pos.y)))))) {

			// if (!this.nudged && ((!lastPos && (mem.path.length == 1 || util.isEdgeOfRoom(this.pos))) || (lastPos && ((lastPos.x == this.pos.x && lastPos.y == this.pos.y) ||
			// 	(util.isEdgeOfRoom(lastPos) && util.isEdgeOfRoom(this.pos)))))) {
				// if (this.name == "f526") console.log(mem.mS)

				if (!global.replayPhase) mem.mS = (mem.mS || 0) + 1;
				if (mem.mS >= 2 && !this.nudged) {
					// Send a nudge
					var direction = mem.path[0];
					var newX = this.pos.x;
					var newY = this.pos.y;

					switch (direction) {
						case "2":
						case "3":
						case "4":
							newX += 1;
							break;
						case "6":
						case "7":
						case "8":
							newX -= 1;
							break;
					}
					switch (direction) {
						case "1":
						case "2":
						case "8":
							newY -= 1;
							break;
						case "4":
						case "5":
						case "6":
							newY += 1;
							break;
					}

					if (newX >= 0 && newX <= 49 && newY >= 0 && newY <= 49) {
						var targetCreep = this.room.lookForAt(LOOK_CREEPS, newX, newY);
						if (targetCreep.length > 0) {
							if (!targetCreep[0].mem || targetCreep[0].mem.role != "sbs") {
								// console.log("nudge", this.name, targetCreep[0])

								targetCreep[0].nudged = this.name;
								this.hasNudged = true;
								global.inTickObject.anyNudges = true
							}
						}
						var targetPowerCreep = this.room.lookForAt(LOOK_POWER_CREEPS, newX, newY);
						if (targetPowerCreep.length > 0) {
							targetPowerCreep[0].nudged = this.name;
							this.hasNudged = true;
							global.inTickObject.anyNudges = true
						}
					}

				}

			}
			else if (!util.isEdgeOfRoom(this.pos)) {
				// if (this.name == "f526") {
				// 	console.log(!this.nudged, lastPos.x, this.pos.x, lastPos.y, this.pos.y,
				// 				(!lastPos && (mem.path.length == 1 || util.isEdgeOfRoom(this.pos))),
				// 				(lastPos.x == this.pos.x && lastPos.y == this.pos.y),
				// 				util.isEdgeOfRoom(lastPos) && util.isEdgeOfRoom(this.pos))
				// }
				// if (this.name == "f526") console.log("resetms a", mem.mS)
				if (!lastPos || this.pos.x != lastPos.x || this.pos.y != lastPos.y) {
					mem.mS = 0;
				}
			}
			mem.lP = {x: this.pos.x, y: this.pos.y}

			// if (this.name == "Melati") console.log(ret, this.name, this.room.name, this.nudged, lastPos, mem.lP, mem.path.length, this.pos.x, this.pos.y, this.pos)

			return ret;
		}
	}

	// TODO: Consider simple versions with less checking (eg. no pO or range check)
	Creep.prototype.uncachedMoveTo = function(target, targetRange, options) {
		return this.myMoveTo(target, targetRange || 0, false, options)
	}

	Creep.prototype.cachedMoveTo = function(target, targetRange, options) {
		// let a = Game.cpu.getUsed();
		let ret = this.myMoveTo(target, targetRange || 0, true, options)
		// this.say(Math.round((Game.cpu.getUsed() - a) * 1000))
		return ret
	}

	Creep.prototype.canMove = function() {
		return !this.fatigue && this.getActiveBodyparts(MOVE)
	}

	Creep.prototype.canSnakeMove = function() {
		return !this.fatigue && !this.mem.alwaysPulled && this.getActiveBodyparts(MOVE)
	}


	Creep.prototype.getMoveSpeed = function() {
		if (Memory.season2 && this.mem.role == "seasonTug") {
			return 0
		}

		var fatigueReduction = 0;
		var moveParts = 0;
		var carryParts = 0;
		var boostedCarry = false;
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].hits <= 0) {
				break;
			}
			if (this.body[i].type === MOVE) {
				moveParts++;
				fatigueReduction++;
				if (this.body[i].boost == RESOURCE_ZYNTHIUM_OXIDE) {
					fatigueReduction++;
				}
				else if (this.body[i].boost == RESOURCE_ZYNTHIUM_ALKALIDE) {
					fatigueReduction += 2;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE) {
					fatigueReduction += 3;
				}
			}
			else if (this.body[i].type === CARRY) {
				carryParts++;
				if (this.body[i].boost) {
					boostedCarry = true;
				}
			}
		}

		if (moveParts == 0) {
			return ERR_NO_BODYPART;
		}

		var moveSpeed = 0;

		var weight
		// Can't handle boosted carries right now
		if (!boostedCarry && carryParts) {
			var usedCarry = Math.ceil(this.getStoreUsedCapacity() / 50)
			var freeCarry = carryParts - usedCarry;

			weight = this.body.length - moveParts - freeCarry
		}
		else {
			weight = this.body.length - moveParts
		}

		// Do most common first
		if (fatigueReduction >= weight) {
			// Can move fast over plains
			if (fatigueReduction < 2 * weight) {
				moveSpeed = 1;
			}
			else if (fatigueReduction >= 5 * weight) {
				moveSpeed = 5;
			}
			else if (fatigueReduction < 3 * weight) {
				moveSpeed = 2;
			}
			else if (fatigueReduction < 4 * weight) {
				moveSpeed = 3;
			}
			else if (fatigueReduction < 5 * weight) {
				moveSpeed = 4;
			}
			/*// Can move over swamps
			if (fatigueReduction >= weight * 5) {
				moveSpeed = 3;
			}
			// Can move half speed over swamps
			else if (fatigueReduction >= Math.ceil(weight * 2.5)) {
				moveSpeed = 2;
			}*/
		}
		// Zero - moves slow over everything

		return moveSpeed
	}


	Creep.prototype.myMoveTo = function(target, targetRange, useCache, options) {
		if (this.fatigue > 0) return ERR_TIRED

		let targetPos = target.pos || target;

		// if (this.mem.mS) this.say(this.mem.mS)

		let mem = this.mem;

		options = options || {}
		if (targetPos.x == this.pos.x && targetPos.y == this.pos.y && targetPos.roomName == this.pos.roomName && !options.flee) {
			delete mem.pTX;
			delete mem.pTY;
			delete mem.pTgtRoom;
			delete mem.pO;
			delete mem.path
			return OK
		}


		let rangeToDestination = this.pos.getRangeToPos(targetPos);
		if (!options.pathOnly) {
			if (rangeToDestination <= targetRange && !options.flee) {
				delete mem.pTX;
				delete mem.pTY;
				delete mem.pTgtRoom;
				delete mem.pO;
				delete mem.path
				return OK;
			}
		}

		// TODO: Maybe don't stringify every tick?
		if (targetPos.x != mem.pTX || targetPos.y != mem.pTY || targetPos.roomName != mem.pTgtRoom || (!options.noRePathOnOptsChange && mem.pO != JSON.stringify(options))) {
			// if (this.mem.role == "fetcher") {
			// 	console.log(this, "repathing due to change in positions/options")
			// 	console.log(mem.pTX, mem.pTY, mem.pTgtRoom, mem.pO)
			// 	console.log(targetPos.x, targetPos.y, targetPos.roomName, JSON.stringify(options))
			// }
			// if (this.name == "r1730_1101") {
			// 	console.log(JSON.stringify(options), mem.pO, mem.mS) 
			// }
			delete mem.path
			mem.pTX = targetPos.x
			mem.pTY = targetPos.y
			mem.pTgtRoom = targetPos.roomName
			delete options.noRePathOnOptsChange
			mem.pO = JSON.stringify(options);

		}

		const resetPaths = false;
		var currentRange = rangeToDestination - targetRange;

		if (resetPaths || !mem.path || mem.mS > 2 || (mem.path.length == 1 && currentRange >= 1)) {
			if (!options.pathOnly && rangeToDestination == 1 && mem.mS <= 2 && !options.flee) {
				delete mem.path;
				delete mem.lP;
				var dx = targetPos.x - this.pos.x;
				var dy = targetPos.y - this.pos.y;

				// console.log(this.name, mem.mS)
				if (mem.mS >= 2) {
					var newX = this.pos.x + dx;
					var newY = this.pos.y + dy;

					if (newX >= 0 && newX <= 49 && newY >= 0 && newY <= 49) {
						var targetCreep = this.room.lookForAt(LOOK_CREEPS, newX, newY);
						if (targetCreep.my && targetCreep.length > 0) {
							targetCreep[0].nudged = this.name;
							this.hasNudged = true;
							global.inTickObject.anyNudges = true
							// console.log(this.name)
						}
					}
				}

				mem.mS = (mem.mS || 0) + 1;
				if (dx == 1) {
					return this.move(3 + dy);
				}
				else if (dx == 0) {
					return this.move(3 + 2 * dy);
				}
				else if (dx == -1) {
					return this.move(7 - dy);
				}
				// mem.path = this.pos.getDirectionTo(targetPos).toString()
			}
			else if (options.pathOnly && rangeToDestination == 1 && !options.flee) {
				mem.path = this.pos.getDirectionTo(targetPos).toString()
			}
			else {
				if (!mem.pIncompleteTick || Game.time - mem.pIncompleteTick - 2 * Math.random() > (this.room.dangerous == 2 ? 2 : 10) || options.pathOnly) {
					// If we're really stuck skip a tick
					// if (mem.mS > 5) {
					// 	mem.mS--;
					// 	return
					// }

					if (this.movedThisTick) {
						if (this.forceNoNewMove) {
							return
						}
						console.log("WARNING: Creep has pathed AFTER moving this tick", this.name, this.pos)
					    var err = new Error();
					    console.log(err.stack);
    				}
					// Copied and modified from getActiveBodyParts source
					// Assumes all snakes move at most at regular off-road speed.
					let moveSpeed = options.snaking ? Math.min(1, this.getMoveSpeed()) : this.getMoveSpeed();

					// Had the || for a very long time. 
					// It kinda makes sence in some cases. If I want everyone to gather around a position (eg. claimers)
					// Without it I could get forever-bumps. Trouble is it kicks off too early. Eg. season 3
					// power dropping was doing long paths around creeps
					// Guess I can work around by specailizing on role

					let avoidLocalCreeps = mem.mS > 2 //|| (currentRange == 1 && rangeToDestination < 3 && !options.flee)

					if (currentRange == 1 && rangeToDestination < 3 && !options.flee && 
						(this.mem.role == "harvester" || 
						 this.mem.role == "controllerAttacker" ||
						 this.mem.role == "upgrader" ||
						 this.mem.role == "pioneer")) {
						avoidLocalCreeps = true
					}

					let lastPath = mem.path

					// if (avoidLocalCreeps) this.say("p" + mem.mS + "_" + ((currentRange == 1 && !options.flee) ? 1 : 0))
					// this.say("p")
					let res = pathCache.getPathForRole(this.pos, targetPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options, mem.role + (this.assaulter ? "ass" : ""))

					// If we can go along roads with small haulers, do so.
					if (moveSpeed == 5 && Game.cpu.bucket > 7000 && this.mem.role == "fetcher" && Game.rooms[this.mem.sR] && (Game.rooms[this.mem.sR].mem.mediumHaulers || 
																															  Game.rooms[this.mem.sR].mem.smallHaulers || 
																															  Game.rooms[this.mem.sR].mem.verySmallHaulers) && !res.incomplete) {
						let res2 = pathCache.getPathForRole(this.pos, targetPos, targetRange, 0, avoidLocalCreeps, useCache, options, mem.role + (this.assaulter ? "ass" : ""))

						if (!res2.incomplete) {
							if (res2.path.length <= res.path.length) {
								res = res2;
								// console.log(this, "using road path")
							}
						}
					}

					// if (mem.mS > 2) {
						// mem.mS = 2;
					// }

					mem.path = res.path;
					if (res.incomplete /*&& res.path.length < 10*/) {
						// console.log(this.name, "incomplete", targetPos, this.pos, mem.path)
						mem.pIncompleteTick = Game.time;

						let hash = this.pos.roomName + targetPos.roomName;

						global.incompletePaths[hash] = Game.time;

						if (this.mem.f) {
							delete this.mem.fT
						}
					}
					else {
						// delete mem.pIncompleteTick
					}

					// console.log(this.name, mem.path, this.pos, targetPos, targetRange)
					if (mem.path) {
						// I had a power creep stuck, removing this saved it. I don't know if this was needed
						// I don't know if it wasn't needed. Essentially, it had a 4 step path which was blocked
						// by another creep that wasn't moving, and for some reason it came into here every tick.
						// I don't really understand how it got here as the top level branch should have been false.
						// Current suspicion is that I was calling this function multiple times per tick with different options
						// and it was resetting things.
						if (!global.creepReplayPhase || !lastPath || mem.path[0] != lastPath[0]) {		
							// Next time movement is playing up try commenting this out					
							// if (mem.lP && (!mem.mS || mem.path.length == 1 || !util.isEdgeOfRoom(mem.lP))) {
							// 	delete mem.lP;
							// }

							// Switched to always delete at 17:55 4/7/21. Maybe the below TODO and half writte code is right

							// TODO: I think I need to be smarter about this. I think the issue is that it doesn't delete
							// it when moving from the edge of the room into the room. I want it to in that case 
							// but not in the case where the next step crossed boundaries.
							// if (mem.lP && (!mem.mS || mem.path.length == 1 || !util.isEdgeOfRoom(mem.lP))) {
								delete mem.lP;
							// }
							// if (mem.lP) {
							// 	if (util.isEdgeOfRoom(mem.lP)) {
							// 		if (!mem.mS || mem.path.length == 1) {
							// 			delete mem.lP;
							// 		}
							// 		else {

							// 		}
							// 	}
							// 	else {
							// 		delete mem.lP;
							// 	}
							// }
							// mem.lP = this.pos;
							// We've got a new path, it's not the same as the last one,
							// so we _should_ be unstuck
							if (mem.mS >= 2 && lastPath && mem.path[0] != lastPath[0]) {
								mem.mS = 1
							}
						}
						else if (global.creepReplayPhase && lastPath && mem.path[0] == lastPath[0]) {
							mem.mS += 1
							// 4-7-21 - again trying to fix annoying behaviour at edges during swamp season
							// delete mem.lP;
						}

						delete mem._move

						if (options.reusePath) {
							mem.path = mem.path.substr(0, Math.min(mem.path.length, options.reusePath))
						}
						// if (util.isEdgeOfRoom(this.pos)) {
						// 	this.mem.mS += 1
						// }
					}

				}

			}

		}

		if (!options.pathOnly) {
			if (mem.path) {
				// this.mem.path = pathCache.reSerializePath(this.pos, this.mem.path)
				return this.myMoveByPath(mem.path);
			}
			else if (!options.flee && (!mem.pIncompleteTick || Game.time - mem.pIncompleteTick > 10)) {
				return this.moveTo(targetPos, {ignoreCreeps: mem.mS <= 2, range: 1});
			}
		}
	}

	Creep.prototype.flee = function(targets, targetRange, options) {
		if (this.fatigue > 0) return ERR_TIRED

		let mem = this.mem;

		options = options || {}

		options.flee = 1

		if (this.movedThisTick) {
			console.log("WARNING: Creep has pathed AFTER moving this tick", this.name, this.pos)
		    var err = new Error();
		    console.log(err.stack);
    	}

		// Copied and modified from getActiveBodyParts source
		// Assumes all snakes move at regular off-road speed.
		let moveSpeed = options.snaking ? 1 : this.getMoveSpeed();
		// this.say("p")
		let targetPath = this.runPathFleeFinder(fromPos, targets, targetRange, moveSpeed, options)
		let serializedPath = this.serializePath(fromPos, targetPath.path, moveSpeed, options.trimPathToRoom || false);

		mem.path = serializedPath

		if (mem.mS > 2) {
			mem.mS = 2;
		}

		mem.path = res.path;

		// console.log(this.name, mem.path, this.pos, targetPos, targetRange)
		if (mem.path) {
			// I had a power creep stuck, removing this saved it. I don't know if this was needed
			// I don't know if it wasn't needed. Essentially, it had a 4 step path which was blocked
			// by another creep that wasn't moving, and for some reason it came into here every tick.
			// I don't really understand how it got here as the top level branch should have been false.
			// Current suspicion is that I was calling this function multiple times per tick with different options
			// and it was resetting things.
			if (mem.lP && !util.isEdgeOfRoom(mem.lP)) {
				delete mem.lP;
			}
			// mem.lP = {x: this.pos.x, y: this.pos.y};
			if (mem.mS > 0) {
				mem.mS--
			}
			delete mem._move

			if (options.reusePath) {
				mem.path = mem.path.substr(0, Math.min(mem.path.length, options.reusePath))
			}
			// if (util.isEdgeOfRoom(this.pos)) {
			// 	this.mem.mS += 1
			// }
		}

		if (mem.path) {
			// this.mem.path = pathCache.reSerializePath(this.pos, this.mem.path)
			return this.myMoveByPath(mem.path);
		}
	}


	Creep.prototype.civilianSpookedNonSK = function() {
		if (this.ticksToLive > 50) {
			let mem = this.mem;
			if (mem.spooked > 0) {
				let moveOptions;
				if (this.room.dangerous) {
					moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5};
				}
				else {
					moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "noRePathOnOptsChange": 1, "minKD" : -0.5};
				}
				if (this.room.name == mem.sR) {
					let spawn = this.room.find(FIND_MY_SPAWNS)[0];
					// console.log(this, spawn)
					if (spawn) {
						this.cachedMoveTo(spawn, 3, moveOptions);
					}
				}
				else {
					this.cachedMoveTo(new RoomPosition(25, 25, mem.sR), 20, moveOptions);
				}
				mem.spooked -= 1;
				return true;
			}

			if (this.room.dangerous) {
				let safe = roomDefenseAI.checkCreepSafety(this.room,
														  this.pos,
														 Game.rooms[this.mem.sR],
														 this.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false));
				if (!safe) {
					let moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5, "reusePath": Game.cpu.bucket > 9000 ? 3 : 5};

					if (this.room.name == this.mem.sR) {
						if (this.hits < 0.9 * this.hitsMax && this.pos.findFirstInRange(this.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false), 5)) {
							this.mem.spooked = 4;
							let spawn = this.room.find(FIND_MY_SPAWNS)[0];
							if (spawn) {
								this.cachedMoveTo(spawn, 1, moveOptions);
							}
							return true;
						}
					}
					else {
						this.mem.spooked = 10;
						this.cachedMoveTo(new RoomPosition(25, 25, mem.sR), 20, moveOptions);
						return true;
					}
				}
			}
		}

		return false;
	}

	Creep.prototype.civilianSpookedSK = function(ignoreInvaders = false) {

		if (this.ticksToLive > 100) {
			let mem = this.mem;
			if (mem.spooked > 0) {
				return this.civilianSpookedNonSK();
			}
			if (ignoreInvaders && this.room.dangerous) {
				let combatCreeps = this.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true)
				if (combatCreeps.length == 0) {
					return false
				}

				combatCreeps = _.filter(combatCreeps, (target) => {return target.owner.username != "Source Keeper" && target.owner.username != "Invader" && target.owner.username != "Screeps"})

				if (Memory.season2) {
					combatCreeps = _.filter(combatCreeps, (target) => {return !scouting.isPlayerMediumWhiteListed(target.owner.username)})
					// combatCreeps = _.filter(combatCreeps, (target) => {return !scouting.isPlayerSoftWhiteListed(target.owner.username)})

				}

				if (combatCreeps.length == 0) {
					return false
				}
			}

			if (this.room.dangerous || this.hits != this.hitsMax) {
				if (this.room.keeperRoom) {
					let hostileCreeps = this.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);
					// It's possible to get bad timing as the SK moves and take a hit, but trust in pathing to take us around
					// and only flee if it screws up.
					let threat = this.pos.findFirstInRange(hostileCreeps, this.hits == this.hitsMax ? 3 : (constants.SK_DANGER_RANGE + 1));

					if (!threat) {						
						for (let hostileCreep of hostileCreeps) {
							if (hostileCreep.owner.username != "Source Keeper") {
								threat = hostileCreep
								break;
							}
						}
					}

					if (threat) {
						mem.spooked = 8 + Math.round(Math.random() * 4)
						let moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5};
						this.cachedMoveTo(new RoomPosition(25, 25, mem.sR), 20, moveOptions);
						return true;
					}
				}
				else {
					return this.civilianSpookedNonSK();
				}
			}
			else if (this.room.keeperRoom && Game.time % 5 == 0) {
				// Check every 5 ticks. "Safety" would be 8 ticks to spawn.
				// Somehow this uses 0.05-0.1 CPU. Fuck knows why.
				let dangerousLair = this.pos.findFirstInRange(this.room.keeperLairs, 4, {
					filter: function(object) {
						return object.ticksToSpawn < 13;
					}
				});

				if (dangerousLair) {
					mem.spooked = 14;
					let numMove = this.getNumOfBodyPart(MOVE)
					if (this.carry.energy && numMove / (this.body.length - numMove) < 0.5) {
						this.drop(RESOURCE_ENERGY)
					}
					let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
					this.cachedMoveTo(new RoomPosition(25, 25, mem.sR), 5, moveOptions);
					return true
				}
			}
		}


		return false;
	}

	Creep.prototype.combatCivilianSpookedSK = function() {
		let mem = this.mem;
		if (this.ticksToLive > 100) {
			if (mem.spooked > 0) {
				return this.civilianSpookedNonSK();
			}

			if (this.room.dangerous) {
				if (this.room.keeperRoom) {
					var threat = this.pos.findFirstInRange(this.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true), this.hits == this.hitsMax ? 3 : 4, {
						filter: function(object) {
							return object.owner.username != "Source Keeper";
						}
					});

					if (threat) {
						this.say("Spooky")
						mem.spooked = 10
						let moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5};
						this.cachedMoveTo(new RoomPosition(25, 25, mem.sR), 20, moveOptions);
						return true;
					}
				}
				else {
					return this.civilianSpookedNonSK();
				}
			}
		}


		return false;
	}


	Creep.prototype.retreatToRoom = function(retreatRoomName, moveOptions) {
		if (retreatRoomName == this.room.name) {
			this.uncachedMoveTo(new RoomPosition((Memory.rooms[retreatRoomName] && Memory.rooms[retreatRoomName].fallbackX) || 25,
										 		  (Memory.rooms[retreatRoomName] && Memory.rooms[retreatRoomName].fallbackY) || 25,
												  retreatRoomName),
								1,
								moveOptions);

		}
		else {
			if (this.mem.pTgtRoom == retreatRoomName) {
				this.uncachedMoveTo(new RoomPosition((Memory.rooms[retreatRoomName] && Memory.rooms[retreatRoomName].fallbackX) || 25,
											 		  (Memory.rooms[retreatRoomName] && Memory.rooms[retreatRoomName].fallbackY) || 25,
													  retreatRoomName),
									1,
									moveOptions);
			}
			else {
				let route = safeRoute.findSafeRoute(this.room.name, retreatRoomName);

				if (route == ERR_NO_PATH || route.length == 1) {
					this.uncachedMoveTo(new RoomPosition((Memory.rooms[retreatRoomName] && Memory.rooms[retreatRoomName].fallbackX) || 25,
												 		  (Memory.rooms[retreatRoomName] && Memory.rooms[retreatRoomName].fallbackY) || 25,
														  retreatRoomName),
										1,
										moveOptions);
				}
				else {
					// Step back two rooms rather than all the way.
					let tmpRoom = route[1].room;
					this.uncachedMoveTo(new RoomPosition(25, 25, tmpRoom),
										20,
										moveOptions);
				}
			}
		}
	}

	Creep.prototype.getSignature = function(type) {
		global._creepSigs = global._creepSigs || {};
		if (!global._creepSigs[this.id]) {
			let sig = "";
			let i = 0;
			for (let i = 0; i < this.body.length; i++) {
				let part = this.body[i];

				if (i != 0 && this.body[i].type == this.body[i - 1].type && (this.body[i].boost || "") == (this.body[i - 1].boost || "")) {
					sig += "_"
				}
				else {
					sig += part.type[0] + part.type[1]
					sig += part.boost || " "
				}
			}
			global._creepSigs[this.id] = sig
		}
		return global._creepSigs[this.id];
	}

	Creep.prototype.getActiveBodyparts = function(type) {
		if (!this.hasBodypart(type)) {
			return 0;
		}
		if (this.hits > this.hitsMax - 100) {
			return this.getNumOfBodyPart(type)
		}


		var count = 0;
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].hits <= 0)
				break;
			if (this.body[i].type === type)
				count++;
		}
		return count;
	}

	Creep.prototype.hasActiveBodypart = function(type) {
		if (this.hits > this.hitsMax - 100) {
			return this.hasBodypart(type)
		}
		else if (!this.hasBodypart(type)) {
			return false;
		}

		this._hasActiveBodypart = this._hasActiveBodypart || {};
		if (this._hasActiveBodypart[type] !== undefined) {
			return this._hasActiveBodypart[type]
		}
		else if (this.activeBodyParts) {
			return (this.activeBodyParts[type] || false)
		}
		else {
			for(let i = this.body.length-1; i>=0; i--) {
				if (this.body[i].hits <= 0)
					break;
				if (this.body[i].type === type) {
					this._hasActiveBodypart[type] = true;
					return true;
				}
			}
			this._hasActiveBodypart[type] = false;
			return false;
		}
	}

	Creep.prototype.hasBodypart = function(type) {
		global._creepHasBodyPart = global._creepHasBodyPart || {};
		global._creepHasBodyPart[this.id] = global._creepHasBodyPart[this.id] || {};
		if (global._creepHasBodyPart[this.id][type] !== undefined) {
			return global._creepHasBodyPart[this.id][type];
		}

		for(let i = this.body.length-1; i>=0; i--) {
			if (this.body[i].type === type) {
				global._creepHasBodyPart[this.id][type] = true;
				return true;
			}
		}
		global._creepHasBodyPart[this.id][type] = false;
		return false;
	}

	// Ffs
	Creep.prototype.hasBodyPart = function(type) {
		return this.hasBodypart(type);
	}


	Creep.prototype.hasCombatBodypart = function(active) {
		if (active) {
			if (this._combatBodypart !== undefined) {
				return this._combatBodypart
			}
			else {
				this._combatBodypart = this.hasActiveBodypart(ATTACK) || this.hasActiveBodypart(RANGED_ATTACK) || this.hasActiveBodypart(HEAL);
				return this._combatBodypart
			}
		}
		else {
			return this.hasBodypart(ATTACK) || this.hasBodypart(RANGED_ATTACK) || this.hasBodypart(HEAL)
		}
	}

	Creep.prototype.hasDamagingBodypart = function(active) {
		if (active) {
			if (this._damagingBodypart !== undefined) {
				return this._damagingBodypart
			}
			else {
				this._damagingBodypart = this.hasActiveBodypart(ATTACK) || this.hasActiveBodypart(RANGED_ATTACK);
				return this._damagingBodypart
			}
		}
		else {
			return this.hasBodypart(ATTACK) || this.hasBodypart(RANGED_ATTACK)
		}
	}


	Creep.prototype.hasBoost = function() {
		global._creepHasBoost = global._creepHasBoost || {};
		if (global._creepHasBoost[this.id] !== undefined) {
			return global._creepHasBoost[this.id];
		}

		if (this.my && (!this.mem.targetBoosts || Object.keys(this.mem.targetBoosts).length == 0)) {
			// Assumes targetBoosts can't be set later. Hmm.
			global._creepHasBoost[this.id] = false;
			return false
		}

		var i;
		for(i = this.body.length-1; i>=0; i--) {
			if (this.body[i].boost) {
				global._creepHasBoost[this.id] = true;
				return true;
			}
		}
		return false;
	}


	Creep.prototype.getNumOfBodyPart = function(type) {
		global._creepNumBodyPart = global._creepNumBodyPart || {};
		global._creepNumBodyPart[this.id] = global._creepNumBodyPart[this.id] || {};
		if (global._creepNumBodyPart[this.id][type] !== undefined) {
			return global._creepNumBodyPart[this.id][type];
		}


		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].type === type) {
				parts++;
			}
		}

		global._creepNumBodyPart[this.id][type] = parts;
		return parts
	}

	Creep.prototype.getCurrentBoostCost = function() {
		// Not sure how to cache this through the boosting process
		// global._creepCurrentBoosts = global._creepCurrentBoosts || {};
		// if (global._creepCurrentBoosts[this.id] !== undefined && Object.values(global._creepCurrentBoosts[this.id])) == this.body.length) {
		// 	return global._creepCurrentBoosts[this.id];
		// }

		// global._creepCurrentBoosts[this.id] = 0; 

		var cost = 0
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].boost) {
				cost += util.getBoostTier(this.body[i].boost)
			}
		}

		return cost
	}

	// Does the creep become half move in the first 15% of damage.
	Creep.prototype.getEarlyHalfMove = function() {
		global._creepEarlyHalfMove = global._creepEarlyHalfMove || {};

		if (global._creepEarlyHalfMove[this.id] !== undefined) {
			return global._creepEarlyHalfMove[this.id];
		}


		let numMove = this.getNumOfBodyPart(MOVE);
		let numParts = this.body.length;
		let numPartsToLose = 2 * numMove - numParts;

		let moveLost = 0;
		for (let i = 0; i < Math.round(numParts * 0.15); i++) {
			if (this.body[i].type == MOVE) {
				moveLost++;
				if (moveLost >= numPartsToLose) {
					global._creepEarlyHalfMove[this.id] = i+1;
					return i+1;
				}
			}
		}
		global._creepEarlyHalfMove[this.id] = 0;
		return 0;
	}

	Creep.prototype.canBeAttacked = function() {
		if (this._canIBeAttacked !== undefined)  {
			return this._canIBeAttacked 
		}


		let ramparted = false
		for (let structure of this.pos.lookFor(LOOK_STRUCTURES)) {
			if (structure.structureType == STRUCTURE_RAMPART) {
				this._canIBeAttacked = false;
				return this._canIBeAttacked
			}
		}


		this._canIBeAttacked = (this.room.towers.length > 0 && this.room.isEnemyRoom() && _.any(this.room.towers, function(tower) { return tower.energy >= TOWER_ENERGY_COST && tower.isActive()})) ||
							   (this.pos.findFirstInRange(this.room.getAllHostileCreepsWithBodyParts([RANGED_ATTACK], true), 3)) ||
							   (this.pos.findFirstInRange(this.room.getAllHostileCreepsWithBodyParts([ATTACK], true), 1))

		this._canIBeAttacked = this._canIBeAttacked ? 1 : 0
		
		return this._canIBeAttacked			
	}



	Creep.prototype.getBoostModifiedHarvest = function() {
		if (!this.hasBodypart(WORK)) return 0;
		if (!this.hasBoost()) return this.getNumOfBodyPart(WORK) * HARVEST_POWER

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
		  	if (this.body[i].type === WORK) {
				if (this.body[i].boost == RESOURCE_UTRIUM_OXIDE) {
					parts += 3;
				}
				else if (this.body[i].boost == RESOURCE_UTRIUM_ALKALIDE) {
					parts += 5;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_UTRIUM_ALKALIDE) {
					parts += 7;
				}
				else {
					parts++;
				}
			}
		}
		return parts * HARVEST_POWER
	}



	Creep.prototype.getBoostModifiedHeal = function() {
		if (!this.hasBodypart(HEAL)) return 0;
		if (!this.hasBoost()) return this.getNumOfBodyPart(HEAL)

		if (this.boostModifiedHeal) {
			return this.boostModifiedHeal
		}

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
		  	if (this.body[i].type === HEAL) {
				if (this.body[i].boost == RESOURCE_LEMERGIUM_OXIDE) {
					parts += 2;
				}
				else if (this.body[i].boost == RESOURCE_LEMERGIUM_ALKALIDE) {
					parts += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}

		this.boostModifiedHeal = parts

		return parts
	}

	Creep.prototype.getActiveBoostModifiedHeal = function() {
		if (this._getActiveBoostModifiedHeal !== undefined) {
			return this._getActiveBoostModifiedHeal;
		}
		if (this.hits > this.hitsMax - 100) {
			return this.getBoostModifiedHeal();
		}

		if (!this.hasBodypart(HEAL)) return 0;

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].hits <= 0) {
				break;
			}

		  	if (this.body[i].type === HEAL) {
				if (this.body[i].boost == RESOURCE_LEMERGIUM_OXIDE) {
					parts += 2;
				}
				else if (this.body[i].boost == RESOURCE_LEMERGIUM_ALKALIDE) {
					parts += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}
		this._getActiveBoostModifiedHeal = parts;

		return parts
	}

	Creep.prototype.getBoostModifiedDismantle = function() {
		if (!this.hasBodypart(WORK)) return 0;
		if (!this.hasBoost()) return this.getNumOfBodyPart(WORK)

		if (this.boostModifiedDismantle) {
			return this.boostModifiedDismantle
		}

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
		  	if (this.body[i].type === WORK) {
				if (this.body[i].boost == RESOURCE_ZYNTHIUM_HYDRIDE) {
					parts += 2;
				}
				else if (this.body[i].boost == RESOURCE_ZYNTHIUM_ACID) {
					parts += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_ZYNTHIUM_ACID) {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}

		this.boostModifiedAttack = parts

		return parts
	}	

	Creep.prototype.getActiveBoostModifiedDismantle = function() {
		if (this._getActiveBoostModifiedDismantle !== undefined) {
			return this._getActiveBoostModifiedDismantle;
		}
		if (this.hits > this.hitsMax - 100) {
			return this.getBoostModifiedDismantle();
		}

		if (!this.hasBodypart(WORK)) return 0;

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].hits <= 0) {
				break;
			}
			if (this.body[i].type === WORK) {
				if (this.body[i].boost == RESOURCE_ZYNTHIUM_HYDRIDE) {
					parts += 2;
				}
				else if (this.body[i].boost == RESOURCE_ZYNTHIUM_ACID) {
					parts += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_ZYNTHIUM_ACID) {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}

		this._getActiveBoostModifiedAttack = parts;


		return parts
	}

	Creep.prototype.getBoostModifiedAttack = function() {
		if (!this.hasBodypart(ATTACK)) return 0;
		if (!this.hasBoost()) return this.getNumOfBodyPart(ATTACK)

		if (this.boostModifiedAttack) {
			return this.boostModifiedAttack
		}

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
		  	if (this.body[i].type === ATTACK) {
				if (this.body[i].boost == RESOURCE_UTRIUM_HYDRIDE) {
					parts += 2;
				}
				else if (this.body[i].boost == RESOURCE_UTRIUM_ACID) {
					parts += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_UTRIUM_ACID) {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}

		this.boostModifiedAttack = parts

		return parts
	}	

	Creep.prototype.getActiveBoostModifiedAttack = function() {
		if (this._getActiveBoostModifiedAttack !== undefined) {
			return this._getActiveBoostModifiedAttack;
		}
		if (this.hits > this.hitsMax - 100) {
			return this.getBoostModifiedAttack();
		}

		if (!this.hasBodypart(ATTACK)) return 0;

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].hits <= 0) {
				break;
			}
			if (this.body[i].type === ATTACK) {
				if (this.body[i].boost == RESOURCE_UTRIUM_HYDRIDE) {
					parts += 2;
				}
				else if (this.body[i].boost == RESOURCE_UTRIUM_ACID) {
					parts += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_UTRIUM_ACID) {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}

		this._getActiveBoostModifiedAttack = parts;


		return parts
	}

	Creep.prototype.getBoostModifiedRangedAttack = function() {
		if (!this.hasBodypart(RANGED_ATTACK)) return 0;
		if (!this.hasBoost()) return this.getNumOfBodyPart(RANGED_ATTACK)

		if (this.boostModifiedRanged) {
			return this.boostModifiedRanged
		}

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
		  	if (this.body[i].type === RANGED_ATTACK) {
				if (this.body[i].boost == "KO") {
					parts += 2;
				}
				else if (this.body[i].boost == "KHO2") {
					parts += 3;
				}
				else if (this.body[i].boost == "XKHO2") {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}

		this.boostModifiedRanged = parts

		return parts
	}	

	Creep.prototype.getActiveBoostModifiedRangedAttack = function() {
		if (this._getActiveBoostModifiedRanged !== undefined) {
			return this._getActiveBoostModifiedRanged;
		}
		if (this.hits > this.hitsMax - 100) {
			return this.getBoostModifiedRangedAttack();
		}

		if (!this.hasBodypart(RANGED_ATTACK)) return 0;

		var parts = 0
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].hits <= 0) {
				break;
			}
			if (this.body[i].type === RANGED_ATTACK) {
				if (this.body[i].boost == "KO") {
					parts += 2;
				}
				else if (this.body[i].boost == "KHO2") {
					parts += 3;
				}
				else if (this.body[i].boost == "XKHO2") {
					parts += 4;
				}
				else {
					parts++;
				}
			}
		}

		this._getActiveBoostModifiedRanged = parts;


		return parts
	}

	Creep.prototype.getEffectiveHitPoints = function() {
		if (this._getEffectiveHitPoints !== undefined) {
			return this._getEffectiveHitPoints
		}

		if (this.hits == this.hitsMax) {
			this._getEffectiveHitPoints = this.getEffectiveMaxHitPoints();
			return this._getEffectiveHitPoints
		}

		if (!this.hasBodyPart(TOUGH) || !this.getActiveBodyparts(TOUGH) || !this.hasBoost()) {
			this._getEffectiveHitPoints = this.hits
			return this._getEffectiveHitPoints
		}

		let hits = 0;

		for (let i = this.body.length-1; i>=0; i--) {
			if (this.body[i].boost == RESOURCE_GHODIUM_OXIDE) {
				hits += this.body[i].hits / 0.7
			}
			else if (this.body[i].boost == RESOURCE_GHODIUM_ALKALIDE) {
				hits += this.body[i].hits / 0.5
			}
			else if (this.body[i].boost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
				hits += this.body[i].hits / 0.3
			}
			else {
				hits += this.body[i].hits
			}

			if (this.body[i].hits < 100) {
				break
			}
		}

		this._getEffectiveHitPoints = Math.ceil(hits)

		return this._getEffectiveHitPoints;
	}

	Creep.prototype.getEffectiveMaxHitPoints = function() {
		if (this._getEffectiveMaxHitPoints !== undefined) {
			return this._getEffectiveMaxHitPoints
		}

		if (!this.hasBodyPart(TOUGH) || !this.hasBoost()) {
			this._getEffectiveMaxHitPoints = this.hitsMax
			return this._getEffectiveMaxHitPoints
		}



		let hits = 0

		for (let i = this.body.length-1; i>=0; i--) {
			if (this.body[i].boost == RESOURCE_GHODIUM_OXIDE) {
				hits += 100 / 0.7
			}
			else if (this.body[i].boost == RESOURCE_GHODIUM_ALKALIDE) {
				hits += 100 / 0.5
			}
			else if (this.body[i].boost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
				hits += 100 / 0.3
			}
			else {
				hits += 100
			}
		}

		this._getEffectiveMaxHitPoints = Math.ceil(hits)

		return this._getEffectiveMaxHitPoints
	}



	Creep.prototype.getHeadEffectiveMaxHitPoints = function() {
		if (this._getHeadEffectiveMaxHitPoints !== undefined) {
			return this._getHeadEffectiveMaxHitPoints
		}

		if (!this.hasBodyPart(TOUGH) || !this.hasBoost()) {
			this._getHeadEffectiveMaxHitPoints = this.hitsMax
			return this._getHeadEffectiveMaxHitPoints
		}

		let hits = 0

		for(var i = 0; i < this.body.length; i++) {
			if (this.body[i].boost == RESOURCE_GHODIUM_OXIDE) {
				hits += 100 / 0.7
			}
			else if (this.body[i].boost == RESOURCE_GHODIUM_ALKALIDE) {
				hits += 100 / 0.5
			}
			else if (this.body[i].boost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
				hits += 100 / 0.3
			}
			else {
				// The rest of the body. We ignore tough. Just head.
				hits += (this.body.length - i) * 100
				this._getEffectiveMaxHitPoints = Math.ceil(hits)
				return hits
			}
		}

		return this._getEffectiveMaxHitPoints
	}


	Creep.prototype.getHeadTough = function() {
		var boostLevel = 1;
		for(var i = 0; i < this.body.length; i++) {
			if (this.body[i].type !== TOUGH) {
				return i
			}
		}
		return this.body.length
	}

	Creep.prototype.getActiveToughBoostLevel = function() {
		var boostLevel = 1;
		for(var i = this.body.length-1; i>=0; i--) {
			if (this.body[i].hits <= 0) {
				break;
			}

			if (this.body[i].type === TOUGH) {
				if (this.body[i].boost == RESOURCE_GHODIUM_OXIDE) {
					boostLevel = Math.max(boostLevel, 2);
				}
				else if (this.body[i].boost == RESOURCE_GHODIUM_ALKALIDE) {
					boostLevel = Math.max(boostLevel, 3);
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
					return 4;
				}
			}
		}
		return boostLevel
	}

	// Needs at least two boosts to be counted as tough boosted
	Creep.prototype.getToughBoostLevel = function(activeOnly) {
		if (!this.hasBodypart(TOUGH)) {
			return 1;
		}
		if (!this.hasBoost()) {
			return 1;
		}
		let fourCnt = 0;
		let threeCnt = 0;
		let twoCnt = 0;

		for(var i = this.body.length-1; i>=0; i--) {
			if (activeOnly && this.body[i].hits <= 0) {
				break;
			}

		  	if (this.body[i].type === TOUGH) {
				if (this.body[i].boost == RESOURCE_GHODIUM_OXIDE) {
					twoCnt++;
				}
				else if (this.body[i].boost == RESOURCE_GHODIUM_ALKALIDE) {
					threeCnt++;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
					fourCnt++;
					return 4
				}
			}
		}
		if (threeCnt) return 3;
		if (twoCnt) return 2;
		return 1;
	}


	// Get number of each fighty body part, scaled up to take into account boosts.
	// Can't cache across ticks as creeps are allowed to boost.
	Creep.prototype.getBoostModifiedCombatParts = function(activeOnly, noModifiers, healCount) {
		// Multi-tick cache is a bit dodgy. It assumes no unboost/renew/boosting.
		// It's cleared on average every 100 ticks, and it should only cache if the room the creep is seen in has no labs owned
		// by me (if I own it), or no labs (if someone else owns it - you can boost friendly creeps)
		if (!healCount) {
			if (activeOnly && noModifiers && this.hits > this.hitsMax - 100 && (global._creepBMCP_U[this.id] || this._creepAllBoostUnModifiedCombatParts)) {
				return (global._creepBMCP_U[this.id] || this._creepAllBoostUnModifiedCombatParts)
			}
			else if (activeOnly && noModifiers && this._creepActiveBoostUnModifiedCombatParts) {
				return this._creepActiveBoostUnModifiedCombatParts
			}
			else if (!activeOnly && noModifiers && (global._creepBMCP_U[this.id] || this._creepAllBoostUnModifiedCombatParts)) {
				return (global._creepBMCP_U[this.id] || this._creepAllBoostUnModifiedCombatParts)
			}
			else if (activeOnly && !noModifiers && this.hits > this.hitsMax - 100 && (global._creepBMCP_M[this.id] || this._creepAllBoostUnModifiedCombatParts)) {
				return (global._creepBMCP_M[this.id] || this._creepAllBoostUnModifiedCombatParts)
			}
			else if (activeOnly && !noModifiers && this._creepActiveBoostModifiedCombatParts) {
				return this._creepActiveBoostModifiedCombatParts
			}
			else if (!activeOnly && !noModifiers && (global._creepBMCP_M[this.id] || this._creepAllBoostUnModifiedCombatParts)) {
				return (global._creepBMCP_M[this.id] || this._creepAllBoostUnModifiedCombatParts)
			}
		}

		var numRanged = 0;
		var numAttack = 0;
		var numHeal = 0;
		var numWork = 0;
		var numExtra = 0;
		var numTough = 0;
		var maxTough = 0;

		var numBoosts = 0;

		let healedParts = 0;

		for(var i = this.body.length-1; i>=0; i--) {
			if (!healCount && activeOnly && this.body[i].hits <= 0) {
				break;
			}
			else if (healCount && activeOnly && this.body[i].hits <= 0) {
				if (healedParts > healCount * HEAL_POWER) {
					break;
				}
				healedParts += 100;
			}


			if (this.body[i].boost) {
				numBoosts++;
			}
			if (this.body[i].type === RANGED_ATTACK) {
				if (this.body[i].boost == RESOURCE_KEANIUM_OXIDE) {
					numRanged += 2;
				}
				else if (this.body[i].boost == RESOURCE_KEANIUM_ALKALIDE) {
					numRanged += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_KEANIUM_ALKALIDE) {
					numRanged += 4;
				}
				else {
					numRanged++;
				}
			}
			else if (this.body[i].type === HEAL) {
				if (this.body[i].boost == RESOURCE_LEMERGIUM_OXIDE) {
					numHeal += 1.9;
				}
				else if (this.body[i].boost == RESOURCE_LEMERGIUM_ALKALIDE) {
					numHeal += 2.8;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) {
					numHeal += 3.7;
				}
				else {
					numHeal++;
				}
			}
			else if (this.body[i].type === ATTACK) {
				if (this.body[i].boost == RESOURCE_UTRIUM_HYDRIDE) {
					numAttack += 2;
				}
				else if (this.body[i].boost == RESOURCE_UTRIUM_ACID) {
					numAttack += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_UTRIUM_ACID) {
					numAttack += 4;
				}
				else {
					numAttack++;
				}
			}
			else if (this.body[i].type === WORK) {
				if (this.body[i].boost == RESOURCE_ZYNTHIUM_HYDRIDE) {
					numWork += 2;
				}
				else if (this.body[i].boost == RESOURCE_ZYNTHIUM_ACID) {
					numWork += 3;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_ZYNTHIUM_ACID) {
					numWork += 4;
				}
				else {
					numWork++;
				}
				if (!noModifiers) numTough += 1;
			}
			else if (this.body[i].type == TOUGH) {
				if (this.body[i].boost == RESOURCE_GHODIUM_OXIDE) {
					maxTough = Math.max(maxTough, 1);
					numTough += 1;
				}
				else if (this.body[i].boost == RESOURCE_GHODIUM_ALKALIDE) {
					maxTough = Math.max(maxTough, 2)
					numTough += 1;
				}
				else if (this.body[i].boost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
					maxTough = Math.max(maxTough, 3)
					numTough += 1;
				}
				else {
					numTough += 1;
				}
			}
			else {
				// Parts that act like tough.
				numExtra += 1;
			}
		}


		// Count these as tough if they're not paired with something.
		if (!noModifiers) {
			let extra = Math.max(0, numExtra - numAttack - numRanged - numHeal);

			numTough += extra;
			numAttack *= (1 + numTough * 0.025);
			numRanged *= (1 + numTough * 0.025);
			numHeal *= (1 + numTough * 0.025);
			numWork *= (1 + numTough * 0.025);

			// Not real values as tough healing is hard
			if (maxTough == 3) {
				numAttack *= 1 / (Math.max(0.7, 1 - 0.05 * numTough));
				numRanged *= 1 / (Math.max(0.7, 1 - 0.05 * numTough));
				numWork *= 1 / (Math.max(0.7, 1 - 0.05 * numTough));
				// numAttack *= 1 / (Math.max(0.4, 0.9 - 0.1 * numTough));
				// numRanged *= 1 / (Math.max(0.4, 0.9 - 0.1 * numTough));
				numHeal *= 1 / (Math.max(0.35, 0.8 - 0.1 * numTough));
				// numWork *= 1 / (Math.max(0.4, 0.9 - 0.1 * numTough));
			}
			else if (maxTough == 2) {
				numAttack *= 1 / (Math.max(0.8, 1 - 0.025 * numTough));
				numRanged *= 1 / (Math.max(0.8, 1 - 0.025 * numTough));
				numWork *= 1 / (Math.max(0.8, 1 - 0.025 * numTough));
				// numAttack *= 1 / (Math.max(0.55, 0.95 - 0.05 * numTough));
				// numRanged *= 1 / (Math.max(0.55, 0.95 - 0.05 * numTough));
				numHeal *= 1 / (Math.max(0.525, 0.9 - 0.05 * numTough));
				// numWork *= 1 / (Math.max(0.55, 0.95 - 0.05 * numTough));
			}
			else if (maxTough == 1) {
				numAttack *= 1 / (Math.max(0.9, 1 - 0.01 * numTough));
				numRanged *= 1 / (Math.max(0.9, 1 - 0.01 * numTough));
				numWork *= 1 / (Math.max(0.9, 1 - 0.01 * numTough));
				// numAttack *= 1 / (Math.max(0.7, 1 - 0.05 * numTough));
				// numRanged *= 1 / (Math.max(0.7, 1 - 0.05 * numTough));
				numHeal *= 1 / (Math.max(0.7, 1 - 0.05 * numTough));
				// numWork *= 1 / (Math.max(0.7, 1 - 0.05 * numTough));
			}
			// if (this.ticksToLive < 50) {
			// 	numAttack /= 2;
			// 	numRanged /= 2;
			// 	numHeal /= 2;
			// 	numWork /= 2;
			// }
			if (activeOnly) {
				if (!healCount) {
					this._creepActiveBoostModifiedCombatParts = {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};

					if (this.hits > this.hitsMax - 100) {
						this._creepAllBoostModifiedCombatParts = {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
						if (!this.room.labs.length || (this.room.controller && this.room.controller.my && this.room.controller.owner.username != this.owner.username)) {
							global._creepBMCP_M[this.id] = this._creepAllBoostModifiedCombatParts
						}
						else {
							delete global._creepBMCP_M[this.id]	
						}
					}
				}
				return {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
			}
			else {
				if (!healCount) {
					this._creepAllBoostModifiedCombatParts = {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
					if (!this.room.labs.length || (this.room.controller && this.room.controller.my && this.room.controller.owner.username != this.owner.username)) {
						global._creepBMCP_M[this.id] = this._creepAllBoostModifiedCombatParts
					}
					else {
						delete global._creepBMCP_M[this.id]	
					}

				}
				return {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
			}
		}
		else {
			if (activeOnly) {
				if (!healCount) {
					this._creepActiveBoostUnModifiedCombatParts = {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
					if (this.hits > this.hitsMax - 100) {
						this._creepAllBoostUnModifiedCombatParts = {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
						if (!this.room.labs.length || (this.room.controller && this.room.controller.my && this.room.controller.owner.username != this.owner.username)) {
							global._creepBMCP_U[this.id] = this._creepAllBoostUnModifiedCombatParts
						}
						else {
							delete global._creepBMCP_U[this.id]	
						}

					}
				}
				return {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
			}
			else {
				if (!healCount) {
					this._creepAllBoostUnModifiedCombatParts = {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts};
					if (!this.room.labs.length || (this.room.controller && this.room.controller.my && this.room.controller.owner.username != this.owner.username)) {
						global._creepBMCP_U[this.id] = this._creepAllBoostUnModifiedCombatParts
					}
					else {
						delete global._creepBMCP_U[this.id]
					}
				}
				return {"numAttack" : numAttack, "numRanged" : numRanged, "numHeal" : numHeal, "numWork" : numWork, "numTough": numTough, "numBoosts" : numBoosts}
			}
		}

	}





	Creep.prototype.dropMinerals = function() {
		// http://support.screeps.com/hc/en-us/community/posts/201556642-PTR-Changelog-2015-11-27
		for (let resourceType in this.store) {
			if (resourceType != RESOURCE_ENERGY && this.store[resourceType] > 0) {
				return this.drop(resourceType);
			}
		}
	}

	Creep.prototype.transferFirst = function(target) {
		// http://support.screeps.com/hc/en-us/community/posts/201556642-PTR-Changelog-2015-11-27
		for (let resourceType in this.store) {
			if (this.store[resourceType] > 0) {
				let ret = this.transfer(target, resourceType);
				if (ret == OK) {
					if (this.mem.role == "fetcher" && resourceType == RESOURCE_ENERGY) {
						if (target.energyCapacity) {
							let delta = Math.min(target.energyCapacity - (target.energy || 0), this.store[resourceType]);
							Game.haulerTransferredEnergy += delta
							this.room.haulerTransferredEnergy += delta
						}
						else {
							Game.haulerTransferredEnergy += this.store[resourceType];
							this.room.haulerTransferredEnergy += this.store[resourceType];
						}
					}

					global._creepStoreUsedCapacity[this.id] = this.getStoreUsedCapacity() - Math.min(target.store.getFreeCapacity(), this.store[resourceType])
				}
				return ret;
			}
		}
		return OK;
	}
	Creep.prototype.withdrawFirst = function(target, nonEnergyFirst = false) {
		// http://support.screeps.com/hc/en-us/community/posts/201556642-PTR-Changelog-2015-11-27
		if (Game.rooms[this.mem.sR].storage) {		

			// Test for looting
			/*if (Memory.marketInfo && Memory.marketInfo.energyPrice && Memory.marketInfo.avgEValues) {
				let maxValue = 0
				let bestResource
				for (let resourceType in target.store) {
					if (resourceType == RESOURCE_ENERGY) continue

					value = (Memory.marketInfo.avgEValues[resourceType] || 0)

					if (value > maxValue) {
						bestResource = resourceType
						maxValue = value;
					}

				}
				if (bestResource) {
					let ret = this.withdraw(target, bestResource);
					if (ret == OK) {
						global._creepStoreUsedCapacity[this.id] = Math.min(this.carryCapacity, this.getStoreUsedCapacity() + target.store[bestResource])
					}
					return ret;
				}
			}*/

			let bestScore = -Infinity
			let bestResource = undefined

			for (let resourceType in target.store) {
				let score
				if (resourceType == RESOURCE_ENERGY) {
					if (nonEnergyFirst) {
						continue
					}
					score = Math.min(this.store.getCapacity(), target.store[resourceType])
				} 
				else {
					let mod = 2;
					if (COMMODITIES[resourceType] && !RECIPES[resourceType]) {
						if (Memory.marketInfo && Memory.marketInfo.energyPrice && Memory.marketInfo.avgEValues && Memory.marketInfo.avgEValues[resourceType]) {
							mod = (Memory.marketInfo.avgEValues[resourceType] / Memory.marketInfo.energyPrice);
						}
						else {									
							mod = Math.pow(2, ((COMMODITIES[resourceType].level || 0) + 1) * 3);
						}

						if (this.room.name == target.room.name) {
							if (this.ticksToLive < 500 && COMMODITIES[resourceType].level) {
								score = -Infinity
							}
							else if (this.ticksToLive < 250 && (!target.room.controller || !target.room.controller.my)) {
								score = -Infinity
							}
						}
						else {									
							if (this.ticksToLive < 1000 && COMMODITIES[resourceType].level) {
								score = -Infinity
							}
							else if (this.ticksToLive < 500 && (!target.room.controller || !target.room.controller.my)) {
								score = -Infinity
							}
						}
					}
					else if (RECIPES[resourceType]) {
						// eh, a bit of a hack
						mod = 1 + Math.pow(resourceType.length, 1.5)
					}
					score = Math.min(this.store.getCapacity(), target.store[resourceType]) * mod;
				}
				if (score > bestScore) {
					bestScore = score
					bestResource = resourceType
				}
			}
			if (bestResource) {
				let ret = this.withdraw(target, bestResource);
				if (ret == OK) {
					global._creepStoreUsedCapacity[this.id] = Math.min(this.carryCapacity, this.getStoreUsedCapacity() + target.store[bestResource])
				}
				return ret;				
			}
					

			
			// Fallback
			for (let resourceType in target.store) {
				if (resourceType == RESOURCE_ENERGY) continue

				if (target.store[resourceType] > 0) {
					let ret = this.withdraw(target, resourceType);
					if (ret == OK) {
						global._creepStoreUsedCapacity[this.id] = Math.min(this.carryCapacity, this.getStoreUsedCapacity() + target.store[resourceType])
					}
					return ret;
				}
			}
		}
		if (target.store[RESOURCE_ENERGY]) {
			let ret = this.withdraw(target, RESOURCE_ENERGY);
			if (ret == OK) {
				global._creepStoreUsedCapacity[this.id] = Math.min(this.carryCapacity, this.getStoreUsedCapacity() + target.store[RESOURCE_ENERGY])
			}
			return ret;
		}
		return OK;
	}

	Creep.prototype.grabBonusEnergy = function(minEnergy) {
		minEnergy = minEnergy || 0;
		if (Game.cpu.bucket > 6000 || this.mem.mS) {
			if (this.getStoreUsedCapacity() != this.carryCapacity) {
				var target = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
					filter: (resource) => {return resource.resourceType == RESOURCE_ENERGY && resource.amount > minEnergy}
				})[0];
				if (target) {
					var ret = this.pickup(target);
					// We've changed weight. Path will be invalid now.
					if (ret == OK ) {
						this.mem.path = undefined
					}
				}
				else {
					var target = this.pos.findInRange(FIND_TOMBSTONES, 1, {
						filter: (tombStone) => {return tombStone.store[RESOURCE_ENERGY] > minEnergy }
					})[0];
					if (target) {
						var ret = this.withdraw(target, RESOURCE_ENERGY);
						// We've changed weight. Path will be invalid now.
						if (ret == OK) {
							this.mem.path = undefined
						}
					}
				}
			}
		}
	}


	Creep.prototype.getStoreUsedCapacity = function() {
		// if (!global._creepStoreUsedCapacity[this.id] || Math.random() < 0.1) {
		// 	global._creepStoreUsedCapacity[this.id] = this.store.getUsedCapacity();
		// }
		if (global._creepStoreUsedCapacity[this.id] === undefined || this.hits != this.hitsMax) {
			global._creepStoreUsedCapacity[this.id] = this.store.getUsedCapacity();
		}

		// Test
		// if (Math.random() < 0.01 && global._creepStoreUsedCapacity[this.id] != this.store.getUsedCapacity()) {
		// 	console.log("capacity confusion in getStoreUsedCapacity", global._creepStoreUsedCapacity[this.id] != this.store.getUsedCapacity())
		// 	Game.notify("capacity confusion in getStoreUsedCapacity")
		// }

		return global._creepStoreUsedCapacity[this.id]

	}

	Creep.prototype.valuableCreepExtraHate = function(mod = 1) {
		// try {			
			if (this.hits != this.hitsMax && this.room.dangerous == 2) {
				let potentialTargets = _.filter(this.pos.findInRange(FIND_HOSTILE_CREEPS, 5), (target) => {return target.owner.username != "Source Keeper" && target.owner.username != "Invader" && target.owner.username != "Screeps"})

				// Normally 0.2 for my reserved rooms and 0.02 for neutral rooms
				let factor = 2 * mod
				for (let hostile of potentialTargets) {	
					if (scouting.isPlayerMediumWhiteListed(hostile.owner.username)) {
						continue
					}
					if (hostile.hasDamagingBodypart()) {						
						Memory.stats.hateCounter[hostile.owner.username] = (Memory.stats.hateCounter[hostile.owner.username] || 0) + (hostile.level ? hostile.level * factor * 10 : Math.sqrt(hostile.body.length) * factor);
						console.log(hostile.owner.username, "near my damanged valuable creep", this, this.pos)
						// Memory.combatManager.requestedMissions[global.MISSION_ROOM_ANTICAMP][this.room.name] = Game.time;
					}		
				}
			}
		// }
		// catch (e) {
		// 	console.log("Caught error on valuable creep!", this.name, this.pos);
		// 	console.log(e);
		// 	console.log(e.stack);
		// 	this.say("ERROR!")
		// }	
	}

	Creep.prototype.requestAvailableBoosts = function() {
		// Don't much like this!
		if (this.mem.role == "pairedPowerHealer" || this.mem.role == "pairedPowerTank") {
			for (let boost in this.mem.targetBoosts) {
				this.room.requestAvailableBoost(boost, true, this.mem.targetBoosts[boost] * LAB_BOOST_MINERAL);
			}
		}
		else {			
			for (let boost in this.mem.targetBoosts) {
				this.room.requestAvailableBoost(boost);
			}
		}
	}

	Creep.prototype.shouldBoost = function() {
		// Most likely case.
		if (!this.mem.targetBoosts) return false;

		// Checked already
		if (this.mem.boostsChecked) return false;

		// No time to lose!
		if (this.room.breached) return false;

		if (this.mem.boostOnDanger) {
			if (this.room.labs.length == 0) {
				return false
			}


			let roomName = this.mem.targetRoom || this.mem.sR

			// Boost on danger used to be 1000, but with unboost we can push it down to 500 I think
			// Human attacks
			if (roomName &&
				Game.rooms[roomName] &&
				Game.rooms[roomName].dangerous == 2 &&
				Game.rooms[roomName].mem.attackScore &&
				Game.rooms[roomName].controller &&
				Game.rooms[roomName].controller.my) {


				if (this.ticksToLive && this.ticksToLive > 500) {
					if (!this.spawning) {
						this.mem.dangerBoostTick = this.mem.dangerBoostTick || Game.time;
					}
					return true
				}
				else if (!this.spawning) {
					this.mem.targetBoosts = {}
					return false;
				}
				else {
					return true;
				}
			}
			else if (this.mem.role == "repairer" && (this.room.defcon || 5) <= 2) {
				if (this.ticksToLive && this.ticksToLive > 500) {
					if (!this.spawning) {
						this.mem.dangerBoostTick = this.mem.dangerBoostTick || Game.time;
					}
				}
				else if (!this.spawning)  {
					this.mem.targetBoosts = {}
					return false;
				}
			}
			else if (this.mem.role == "repairer" && this.mem.ID) {
				if (this.ticksToLive && this.ticksToLive > 500) {
					if (!this.spawning) {
						this.mem.dangerBoostTick = this.mem.dangerBoostTick || Game.time;
					}
				}
			}
			else {
				return false;
			}
		}
		return true;
	}

	Creep.prototype.getBoosts = function(allowedToMoveToBoost = true, exactRequired = false, limitAmount = false) {
		if (!this.shouldBoost()) {
			return false;
		}

		if (this.gettingBoosts) {
			return true
		}

		if ((this.room.name == this.mem.sR || this.room.name == this.mem.targetRoom || (this.mem.forceBoost && this.room.labs.length)) && this.body && this.ticksToLive && this.room.labs.length) {
			var needsBoost = false;

			let targetBoostTypes = Object.keys(this.mem.targetBoosts);
			// Get move first
			for (let targetBoostType of _.clone(targetBoostTypes)) {
				if (util.isMoveBoost(targetBoostType)) {
					_.pull(targetBoostTypes, targetBoostType);
					targetBoostTypes.unshift(targetBoostType);
					break;
				}
			}

			for (var boost of targetBoostTypes) {
				if (!boost) continue;
				var numRequired = this.mem.targetBoosts[boost];

				// if (numRequired > 0) {
					// Remove currently boosted parts					
					for (var bodyPart of this.body) {
						if (util.isSameBoostType(bodyPart.boost, boost)) {
							numRequired--;
							// numRequired = 0; // Check if we have any. I guess this works but it's a bit weird
							if (numRequired <= 0) {
								numRequired = 0;
								break;
							}
						}
					}
				// }

				// console.log(this.name, boost, numRequired)

				let labsHaveBoost = false;

				if (numRequired !== 0) {
					let maxAmount
					if (limitAmount) {
						maxAmount = LAB_BOOST_MINERAL * numRequired
					}

					this.room.requestAvailableBoost(boost, exactRequired, maxAmount);

					needsBoost = true;

					var labs = this.room.labs

					for (var lab of labs) {
						// Only ones that are for boosts. Otherwise we may pick up something
						// being crafted.
						if (!this.room.mem.labMemory || !this.room.mem.labMemory[lab.id]) continue;

						// console.log(this.name, numRequired, lab)

						if ((util.isSameBoostType(lab.mineralType, boost) && this.room.mem.labMemory[lab.id].lockedForBoosts) || (lab.mineralType == boost && lab.mineralAmount >= LAB_BOOST_MINERAL)) {//} && lab.mineralAmount >= numRequired * LAB_BOOST_MINERAL && lab.energy >= numRequired * LAB_BOOST_ENERGY) {
							if (lab.mineralAmount >= LAB_BOOST_MINERAL) {								
								labsHaveBoost = true;
								if (this.pos.isNearToPos(lab.pos)) {
									let ret = lab.boostCreep(this, numRequired > 0 ? numRequired : undefined)
									if (ret != OK) {
										if (ret == ERR_INVALID_TARGET) {
											console.log("Boosting fail invalid target", this.name, this.room.name, ret)
											this.room.mem.boostFailed = (this.room.mem.boostFailed || 0) + 1
										}
										else if (ret == ERR_NOT_ENOUGH_RESOURCES) {
											console.log("Boosting fail not enough resources", this.name, this.room.name, ret)
											this.gettingBoosts = 1;
											this.room.mem.boostFailed = (this.room.mem.boostFailed || 0) + 1
										}
										else {
											console.log("Boosting fail weirdly", this.name, this.room.name, ret, lab)
											this.room.mem.boostFailed = (this.room.mem.boostFailed || 0) + 1
										}
									}
								}
								else {
									// this.gettingBoosts = 1;
									if (allowedToMoveToBoost && this.hasBodypart(MOVE)) {
										this.cachedMoveTo(lab, 1);
									}

									// Opportunistic
									let haveOppBoosted = false;
									for (var boost2 of targetBoostTypes) {
										if (!boost2) continue;
										var numRequired2 = this.mem.targetBoosts[boost2];
										for (var bodyPart of this.body) {
											if (util.isSameBoostType(bodyPart.boost, boost2)) {
												numRequired2--;
												if (numRequired2 <= 0) {
													numRequired2 = 0;
													break;
												}
											}
										}
										if (numRequired2 !== 0) {
											for (let lab2 of labs) {
												if (!lab2.pos.isNearToPos(this.pos)) continue

												if (!this.room.mem.labMemory || !this.room.mem.labMemory[lab2.id] || !this.room.mem.labMemory[lab2.id].lockedForBoosts) continue;
												if (util.isSameBoostType(lab2.mineralType, boost2)) {
													if (lab2.mineralAmount >= LAB_BOOST_MINERAL) {
														lab2.boostCreep(this, numRequired2 > 0 ? numRequired2 : undefined)
														haveOppBoosted = true;
														break;
													}
												}

											}
										}
										if (haveOppBoosted) {
											break;
										}
									}						
									break;
								}
							}
							else {
								this.room.mem.boostFailed = (this.room.mem.boostFailed || 0) + 1
							}
						}
					}
					if (labsHaveBoost) {
						break;
					}
				}

				// Negative numbers mean optional boosting
				if (!labsHaveBoost && numRequired < 0) {
					needsBoost = false;
				}
			}
			// console.log(needsBoost)

			// If it's all gone tits up it should have gone tits up in the first
			// 200 ticks, so just go for it if we've lived that long.
			if (this.mem.dangerBoostTick) {
				if (needsBoost && Game.time - this.mem.dangerBoostTick < (this.room.dangerous ? 50 : (this.mem.formationCreeps ? 300 : 150))) {
					this.gettingBoosts = 1;
					return true;
				}
				else {
					this.mem.boostsChecked = 1;
					return false;
				}
			}
			else {
				if (needsBoost && this.ticksToLive >= (this.hasBodypart(CLAIM) ? CREEP_CLAIM_LIFE_TIME - 150 : (this.room.dangerous ? 1400 : ((this.mem.formationCreeps || this.mem.parentFormationCreeps) ? 1000 : 1350)))) {
					this.gettingBoosts = 1;
					return true;
				}
				else {
					this.mem.boostsChecked = 1;
					return false;
				}
			}
		}
		return false;
	}
}