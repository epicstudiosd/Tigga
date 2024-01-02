"use strict";


module.exports = function() {
	Object.defineProperty(PowerCreep.prototype, 'mem', {
		get: function() {
			// if (!this.my) {
			// 	throw new Error("Getting memory on a PC that ain't mine");
			// }

			return Memory.powerCreeps[this.name] = Memory.powerCreeps[this.name] || {};
		},
		set: function(value) {
			// if (!this.my) {
			// 	throw new Error("Setting memory on a PC that ain't mine");
			// }

			Memory.powerCreeps[this.name] = value
		},
		configurable: true,
	});

	PowerCreep.prototype.initTick = function() {
		this.powerCreep = 1;
		this.body = [{boost: undefined, type: MOVE, hits: 100}];
		this.fatigue = 0;
		this.nudged = null;
		this.hasNudged = null;
		// Override the above. The above is needed as for some reason spawning creeps don't have memory when this is set. ???
		this.mem = Memory.powerCreeps[this.name];
	}

	PowerCreep.prototype.getPreferredNudgeDirections = function() {

	}


	PowerCreep.prototype.processNudges = function() {
		return Creep.prototype.processNudges.call(this);
	}

	PowerCreep.prototype.moveTo = function(x, y, opts) {
		return Creep.prototype.moveTo.call(this, x, y, opts);

	}
	PowerCreep.prototype.moveTo = function(target, opts) {
		return Creep.prototype.moveTo.call(this, target, opts);
	}

	PowerCreep.prototype.updatePathForLastMove = function() {
		return Creep.prototype.updatePathForLastMove.call(this);
	}

	PowerCreep.prototype.stepPath = function(path, opts) {
		return Creep.prototype.stepPath.call(this, path, opts);
	}


	PowerCreep.prototype.myMoveByPath = function(path, opts) {
		return Creep.prototype.myMoveByPath.call(this, path, opts);
	}

	PowerCreep.prototype.hasCombatBodypart = function() {
		return false
	}

	PowerCreep.prototype.getEffectiveHitPoints = function() {
		return this.hits
	}
	PowerCreep.prototype.getEffectiveMaxHitPoints = function() {
		return this.hitsMax
	}

	// TODO: Consider simple versions with less checking (eg. no pathopts or range check)
	PowerCreep.prototype.uncachedMoveTo = function(target, targetRange, options) {
		return this.myMoveTo(target, targetRange || 0, false, options)
	}

	PowerCreep.prototype.cachedMoveTo = function(target, targetRange, options) {
		return this.myMoveTo(target, targetRange || 0, true, options)
	}

	PowerCreep.prototype.canMove = function() {
		return true
	}

	PowerCreep.prototype.canSnakeMove = function() {
		return true
	}


	PowerCreep.prototype.getMoveSpeed = function() {
		return 5
	}


	PowerCreep.prototype.myMoveTo = function(target, targetRange, useCache, options) {
		return Creep.prototype.myMoveTo.call(this, target, targetRange, useCache, options);
	}


	PowerCreep.prototype.civilianSpookedNonSK = function() {
		return Creep.prototype.civilianSpookedNonSK.call(this);
	}

	PowerCreep.prototype.civilianSpookedSK = function() {
		return Creep.prototype.civilianSpookedSK.call(this);

	}

	PowerCreep.prototype.combatCivilianSpookedSK = function() {
		return Creep.prototype.combatCivilianSpookedSK.call(this);
	}


	PowerCreep.prototype.retreatToRoom = function(retreatRoomName, moveOptions) {
		return Creep.prototype.retreatToRoom.call(this, retreatRoomName, moveOptions);
	}

	// Hmm.
	PowerCreep.prototype.getSignature = function(type) {
		return this.id;
	}

	PowerCreep.prototype.getActiveBodyparts = function(type) {
		return type == MOVE ? 1 : 0
	}

	PowerCreep.prototype.hasActiveBodypart = function(type) {
		return type == MOVE ? 1 : 0
	}

	PowerCreep.prototype.hasBodypart = function(type) {
		return type == MOVE ? 1 : 0
	}

	// Ffs
	PowerCreep.prototype.hasBodyPart = function(type) {
		return this.hasBodypart(type);
	}


	PowerCreep.prototype.hasDamagingBodypart = function(active) {
		return false;
	}


	PowerCreep.prototype.hasBoost = function() {
		return false;
	}


	PowerCreep.prototype.getNumOfBodyPart = function(type) {
		return type == MOVE ? 1 : 0
	}

	// Does the creep become half move in the first 15% of damage.
	PowerCreep.prototype.getEarlyHalfMove = function() {
		return 0;
	}

	PowerCreep.prototype.getBoostModifiedHeal = function() {
		return 0
	}

	PowerCreep.prototype.getActiveBoostModifiedHeal = function() {
		return 0
	}

	PowerCreep.prototype.getActiveBoostModifiedAttack = function() {
		return 0
	}


	PowerCreep.prototype.getActiveToughBoostLevel = function() {
		return 1
	}

	// Needs at least two boosts to be counted as tough boosted
	PowerCreep.prototype.getToughBoostLevel = function(activeOnly) {
		return 1;
	}


	// Get number of each fighty body part, scaled up to take into account boosts.
	// Can't cache across ticks as creeps are allowed to boost.
	PowerCreep.prototype.getBoostModifiedCombatParts = function(activeOnly, noModifiers, healCount) {
		return {"numAttack" : 0, "numRanged" : 0, "numHeal" : 0, "numWork" : 0, "numBoosts" : 0}
	}

	PowerCreep.prototype.transferFirst = function(target) {
		return Creep.prototype.transferFirst.call(this, target);
	}

	PowerCreep.prototype.withdrawFirst = function(target) {
		return Creep.prototype.withdrawFirst.call(this, target);
	}


	PowerCreep.prototype.getStoreUsedCapacity = function(target) {
		return Creep.prototype.getStoreUsedCapacity.call(this, target);

	}


	PowerCreep.prototype.grabBonusEnergy = function(minEnergy) {
		minEnergy = minEnergy || 0;
		if (Game.cpu.bucket > 6000) {
			if (this.store.getUsedCapacity() != this.carryCapacity) {
				var target = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
					filter: (resource) => {return resource.resourceType == RESOURCE_ENERGY && resource.amount > minEnergy}
				})[0];
				if (target) {
					var ret = this.pickup(target);
				}
				else {
					var target = this.pos.findInRange(FIND_TOMBSTONES, 1, {
						filter: (tombStone) => {return tombStone.store[RESOURCE_ENERGY] > minEnergy }
					})[0];
					if (target) {
						var ret = this.withdraw(target, RESOURCE_ENERGY);
					}
				}
			}
		}
	}

	PowerCreep.prototype.shouldBoost = function() {
		return false;

	}

	PowerCreep.prototype.getBoosts = function() {
		return false;
	}
}