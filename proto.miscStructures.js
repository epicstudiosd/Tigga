"use strict";

module.exports = function() {


	let towerAttack = StructureTower.prototype.attack
	let towerHeal = StructureTower.prototype.heal
	let towerRepair = StructureTower.prototype.repair

	StructureTower.prototype.attack = function(target) {
		var ret = towerAttack.apply(this, arguments);

		if (ret == OK) {
			global.inTickObject.energyExpenditures["towerAttack"] = (global.inTickObject.energyExpenditures["towerAttack"] || 0) + TOWER_ENERGY_COST;
		}

		return ret;
	}

	StructureTower.prototype.repair = function(target) {
		var ret = towerRepair.apply(this, arguments);

		if (ret == OK) {
			global.inTickObject.energyExpenditures["towerRepair"] = (global.inTickObject.energyExpenditures["towerRepair"] || 0) + TOWER_ENERGY_COST;
		}

		return ret;
	}
	StructureTower.prototype.heal = function(target) {
		var ret = towerHeal.apply(this, arguments);

		if (ret == OK) {
			global.inTickObject.energyExpenditures["towerHeal"] = (global.inTickObject.energyExpenditures["towerHeal"] || 0) + TOWER_ENERGY_COST;
		}

		return ret;
	}

	let launchNuke = StructureNuker.prototype.launchNuke

	StructureNuker.prototype.launchNuke = function(target) {
		var ret = launchNuke.apply(this, arguments);

		if (ret == OK) {
			global.inTickObject.energyExpenditures["nuke"] = (global.inTickObject.energyExpenditures["nuke"] || 0) + NUKER_ENERGY_CAPACITY;
		}

		return ret;
	}

}