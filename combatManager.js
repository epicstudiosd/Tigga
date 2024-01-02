"use strict";

var util = require('util');
var safeRoute = require('safeRoute');
var constants = require('constants');
var formationAI = require('formationAI');
var formationCreator = require('formationCreator');
var creepCreator = require('creepCreator');
var intelAI = require('intelAI');
var roomIntel = require('roomIntel');
var scouting = require('scouting');
var defenseAnalysis = require('defenseAnalysis');
var nukeAI = require('nukeAI');
var pathCache = require('pathCache');

var segments = require('segments');
var interShardMemoryManager = require('interShardMemoryManager');

const utf15 = require('./utf15');
const Codec = utf15.Codec;




global.MISSION_REMOTE_DEFENSE = "remoteDefense";
global.MISSION_REMOTE_RAMBO_DEFENSE = "remoteRamboDefense";
global.MISSION_REMOTE_CHILD_RAMBO_DEFENSE = "remoteChildRamboDefense";
global.MISSION_REMOTE_HARASS = "remoteHarass";
global.MISSION_REMOTE_STAKEOUT = "roomStakeOut";
global.MISSION_REMOTE_STAKEOUT_CAPPED = "roomStakeOutCapped";
global.MISSION_REMOTE_HARASS_LIGHT = "remoteHarassLight";
global.MISSION_REMOTE_DECON = "remoteDecon";
global.MISSION_EXIT_CAMP = "exitCamp";
global.MISSION_CONVOY_TAKEDOWN = "convoy";
global.MISSION_BOTTLENECK_CAMP = "bottleneckCamp";
global.MISSION_SWAMP_HARASS = "swampHarass";
global.MISSION_CHILD_NEIGHBOUR_ROOM_HOLD = "childNeighbourHold";
global.MISSION_ROOM_SOURCE_RAID = "roomSourceRaid";
global.MISSION_ROOM_DEFENSE = "roomDefense";
global.MISSION_ROOM_SWARM = "roomSwarm";
global.MISSION_ROOM_ASSAULT = "roomAssault";
global.MISSION_ROOM_ASSAULT_LARGE = "roomAssaultLarge";
global.MISSION_ROOM_ASSAULT_BLINKY = "roomAssaultBlinky";
global.MISSION_ROOM_ASSAULT_NUKE_FOLLOW = "roomAssaultNukeFollow";
global.MISSION_MEGA_ASSAULT = "roomAssaultMega";
global.MISSION_ROOM_BLITZ = "roomBlitz";
global.MISSION_STRONGHOLD_ASSAULT = "strongholdAssault";
global.MISSION_STRONGHOLD_SNIPE_ASSAULT = "strongholdSnipeAssault";
global.MISSION_STRONGHOLD_SNAKE_ASSAULT = "strongholdSnakeAssault";
global.MISSION_STRONGHOLD_MEGA_ASSAULT = "strongholdMegaAssault";
// global.MISSION_INVCORE_REMOVE = "invCoreRemove"
global.MISSION_ROOM_LOW_ENERGY_ASSAULT = "roomLowEAssault";
global.MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE = "roomLowEAssaultLarge";
global.MISSION_ROOM_EDGE_ASSAULT = "roomEdgeAssault";
global.MISSION_WEAK_ROOM_ATTACK = "roomAttackLowRCL";
global.MISSION_HEAVY_CONTROLLER_ATTACK = "roomAttackHeavyController";
global.MISSION_CONNECTIVITY_DECON = "connectivityDecon";
global.MISSION_FORMATION_REMOTE_DECON = "formationRemoteDecon";
global.MISSION_ROOM_ANTICAMP = "roomAntiCamp";
global.MISSION_PICKET = "picket";

global.MISSION_POWER_RAID = "roomPowerRaid";
global.MISSION_RESOURCE_RAID = "resourceRaid";



global.MISSION_INTERSHARD_SUPPORT = "interShardSupport";
global.MISSION_INTERSHARD_SUPPORT_LOCAL = "interShardSupportLocal";

global.MISSION_ROOM_HEAVY_CREEP_CLEAR = "roomHeavyCreepClear";
global.MISSION_ROOM_HEAVY_CREEP_HOLD = "roomHeavyCreepHold";
global.MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD  = "roomHeavyCreepRangedHold";
global.MISSION_ROOM_HEAVY_FORMATION_HOLD  = "roomHeavyFormationHold";
global.MISSION_ROOM_POWER_ASSAULT = "roomPowerAssault";

// Err. That isn't a combat mission!
global.MISSION_ROOM_ECON_SUPPORT = "roomEconSupport";
global.MISSION_DEPOSIT_FARM = "commoditiesFarm";
global.MISSION_DEPOSIT_HARVEST = "commoditiesHarvest";
global.MISSION_POWER_HARVEST = "powerHarvest";

// Seasonal
global.MISSION_SEASONAL_DROP_WALL_REPAIR = "seasonalDropWallRepair";
global.MISSION_SEASONAL_DROP_WALL_REMOVE = "seasonalDropWallRemove";
global.MISSION_SEASONAL_RESOURCE_GATHER = "seasonalResourceGather";
global.MISSION_SEASONAL_GAP_RAID = "seasonalGapRaid";
global.MISSION_SEASONAL_DROP_RAID = "seasonalDropRaid";
global.MISSION_SEASONAL_DROP_DEFEND = "seasonalDropDefend";
global.MISSION_SEASONAL_HIGHWAY_PATROL = "seasonalHighwayPatrol";
global.MISSION_SEASONAL_CONVOY_TRADE = "seasonalConvoyTrade";
global.MISSION_SEASON_5_REACTOR_CLAIM = "season5ReactorClaim"
global.MISSION_SEASON_5_SCORING = "season5ReactorScoring"
global.MISSION_CHILD_HEAVY_MINE = "childHeavyMine"

global.MISSION_TYPES = [MISSION_REMOTE_DEFENSE,
					  MISSION_REMOTE_RAMBO_DEFENSE,
					  MISSION_REMOTE_CHILD_RAMBO_DEFENSE,
					  MISSION_REMOTE_HARASS,
					  MISSION_REMOTE_STAKEOUT,
					  MISSION_REMOTE_STAKEOUT_CAPPED,
					  MISSION_REMOTE_HARASS_LIGHT,
					  MISSION_REMOTE_DECON,
					  MISSION_EXIT_CAMP,
					  MISSION_CONVOY_TAKEDOWN,
					  MISSION_SWAMP_HARASS,
					  MISSION_CHILD_NEIGHBOUR_ROOM_HOLD,
					  MISSION_ROOM_SOURCE_RAID,
					  MISSION_ROOM_DEFENSE,
					  MISSION_ROOM_SWARM,
					  MISSION_ROOM_ASSAULT,
					  MISSION_ROOM_ASSAULT_LARGE,
					  MISSION_ROOM_ASSAULT_BLINKY,
					  MISSION_ROOM_ASSAULT_NUKE_FOLLOW,
					  MISSION_MEGA_ASSAULT,
					  MISSION_STRONGHOLD_ASSAULT,
					  MISSION_STRONGHOLD_SNIPE_ASSAULT,
					  MISSION_STRONGHOLD_SNAKE_ASSAULT,
					  MISSION_STRONGHOLD_MEGA_ASSAULT,
					  MISSION_PICKET,
					  MISSION_INTERSHARD_SUPPORT,
					  MISSION_INTERSHARD_SUPPORT_LOCAL,
					  // MISSION_INVCORE_REMOVE,
					  MISSION_ROOM_LOW_ENERGY_ASSAULT,
					  MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE,
					  MISSION_ROOM_EDGE_ASSAULT,
					  MISSION_WEAK_ROOM_ATTACK,
					  MISSION_HEAVY_CONTROLLER_ATTACK,
					  MISSION_CONNECTIVITY_DECON,
					  MISSION_FORMATION_REMOTE_DECON,
					  MISSION_ROOM_ANTICAMP,
					  MISSION_ROOM_ECON_SUPPORT,
					  MISSION_ROOM_HEAVY_CREEP_CLEAR,
					  MISSION_ROOM_HEAVY_CREEP_HOLD,
					  MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD,
					  MISSION_ROOM_HEAVY_FORMATION_HOLD,
					  MISSION_ROOM_POWER_ASSAULT,
					  MISSION_POWER_RAID,
					  MISSION_RESOURCE_RAID,
					  MISSION_DEPOSIT_FARM,
					  MISSION_DEPOSIT_HARVEST,
					  MISSION_POWER_HARVEST]

if (Game.shard.name == "shardSeason") {
	global.MISSION_TYPES.push(MISSION_SEASONAL_DROP_WALL_REMOVE)
	global.MISSION_TYPES.push(MISSION_SEASONAL_DROP_WALL_REPAIR)
	global.MISSION_TYPES.push(MISSION_SEASONAL_RESOURCE_GATHER)
	global.MISSION_TYPES.push(MISSION_SEASONAL_GAP_RAID)
	global.MISSION_TYPES.push(MISSION_SEASONAL_DROP_RAID)
	global.MISSION_TYPES.push(MISSION_SEASONAL_DROP_DEFEND)
	global.MISSION_TYPES.push(MISSION_SEASONAL_HIGHWAY_PATROL)
	global.MISSION_TYPES.push(MISSION_SEASONAL_CONVOY_TRADE)
	global.MISSION_TYPES.push(MISSION_SEASON_5_REACTOR_CLAIM)
	global.MISSION_TYPES.push(MISSION_SEASON_5_SCORING)
	global.MISSION_TYPES.push(MISSION_CHILD_HEAVY_MINE)
}

global.ASSAULT_MISSION_TYPES = [MISSION_ROOM_ASSAULT,
								MISSION_ROOM_ASSAULT_LARGE,
								MISSION_MEGA_ASSAULT,
								MISSION_STRONGHOLD_ASSAULT,
								MISSION_STRONGHOLD_SNIPE_ASSAULT,
								MISSION_STRONGHOLD_SNAKE_ASSAULT,
								MISSION_STRONGHOLD_MEGA_ASSAULT,
								MISSION_ROOM_LOW_ENERGY_ASSAULT,
								MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE,
								MISSION_FORMATION_REMOTE_DECON]


global.WEAK_ROOM_ATTACK_SAFE_MODE_PRESPAWN = 200;
global.SWARM_ATTACK_SAFE_MODE_PRESPAWN = 500;
global.LOW_E_ATTACK_SAFE_MODE_PRESPAWN = 200;
global.ASSAULT_SAFE_MODE_PRESPAWN = 200;


global.LOW_E_MAX_INCOMING_DPS = 190;
global.ROOM_ASSAULT_MIN_HEAL_PER_TOWER = 420;
global.ROOM_ASSAULT_MIN_HEAL_PER_TOWER_LARGE = 590;
global.ROOM_ASSAULT_MIN_HEAL_PER_TOWER_BOOSTED = 700;
global.ROOM_ASSAULT_MAX_HEAL_PER_TOWER = 900;



const idleCreepManager = require('idleCreepManager')

const missionInfo = require('missionInfo')

const Mission = require('missionBase')

const RemoteDefenseMission = require('remoteDefense')
const RemoteRamboDefenseMission = require('remoteRamboDefense')
const ChildRemoteRamboDefenseMission = require('childRemoteRamboDefense')
const RoomAntiCampMission = require('roomAntiCamp')
const RemoteHarassMission = require('remoteHarass')
const RemoteHarassLightMission = require('remoteHarassLight')
const RemoteStakeOutMission = require('remoteStakeOut')
const RemoteStakeOutCappedMission = require('remoteStakeOutCapped')
const RemoteDeconMission = require('remoteDecon')
const ConnectivityDecon = require('connectivityDecon')
const ExitCampMission = require('exitCamp')
const ConvoyTakedownMission = require('convoyTakedown')
const ChildNeighbourHoldMission = require('childNeighbourHold')
const RoomDefenseMission = require('roomDefense')
const RoomSwarmMission = require('roomSwarm')
const HeavyControllerAttackMission = require('heavyControllerAttack')
const FormationRemoteDecon = require('formationRemoteDecon')
const RoomHeavyCreepClear = require('roomHeavyCreepClear')
const RoomHeavyCreepHold = require('roomHeavyCreepHold')
const RoomHeavyCreepRangedHold = require('roomHeavyCreepRangedHold')
const RoomHeavyFormationHold = require('roomHeavyFormationHold')
const RoomEdgeAssaultMission = require('roomEdgeAssault')
const RoomEconSupportMission = require('roomEconSupport')
const RoomAssaultPowerSupport = require('roomAssaultPowerSupport')
const PicketMission = require('picket')
const DepositFarmMission = require('depositFarm')
const DepositHarvestMission = require('depositHarvest')
const PowerHarvestMission = require('powerHarvest')

const PowerRaidMission = require('powerRaid')
const ResourceRaidMission = require('resourceRaid')

const InterShardSupport = require('intershardSupport')
const InterShardSupportLocal = require('intershardSupportLocal')

// Non-formation room attacks
const RoomSourceRaidMission = require('roomSourceRaid')
const WeakRoomAttackMission = require('weakRoomAttack')
const RoomAssaultBlinky = require('roomAssaultBlinky')
const RoomAssaultNukeFollow = require('roomAssaultNukeFollow')

// Formation stuff
const RoomLowEAssaultMission2x2 = require('roomLowEAssault2x2')
const RoomLowEAssaultMission3x3 = require('roomLowEAssault3x3')
const RoomAssaultMission2x2 = require('roomAssault2x2')
const RoomAssaultMission3x3 = require('roomAssault3x3')
const MegaAssaultMission = require('megaAssault')

const StrongholdAssaultMission = require('strongholdAssault2x2')
const StrongholdSnipeAssaultMission = require('strongholdSnipeAssault')
const StrongholdSnakeAssaultMission = require('strongholdSnakeAssault')
const StrongholdMegaAssaultMission = require('strongholdMegaAssault')


// Seasonal
const SeasonalDropWallRemove = require("seasonalDropWallRemove")
const SeasonalDropWallRepair = require("seasonalDropWallRepair")
const SeasonalDropRaid = require("seasonalDropRaid")
const SeasonalGapRaid = require("seasonalGapRaid")
const SeasonHighwayPatrolMission = require("seasonalHighwayPatrol")
const SeasonalConvoyTrade = require("seasonalConvoyTrade")
const Season5ReactorClaim = require("season5ReactorClaim")
const Season5Scoring = require("season5Scoring")
const ChildHeavyMine = require("childHeavyMine")

var combatManager = {
	tick : function() {
		Memory.combatManager = Memory.combatManager || {};

		Memory.combatManager.idlePool = Memory.combatManager.idlePool || [];
		Memory.combatManager.currentMissions = Memory.combatManager.currentMissions || {};
		Memory.combatManager.requestedMissions = Memory.combatManager.requestedMissions || {};
		Memory.combatManager.ID = Memory.combatManager.ID || 0;


		try {			
			let requests = Memory.combatManager.requestedMissions
			if (Game.shard.name == "shard2") {
				if (Memory.rooms["E12S29"] && Memory.rooms["E12S29"].rcl) {
					if ((Memory.rooms["E12S29"].safeMode || 0) < 300) this.requestHeavyRoomHold("E12S29", 2)
					if ((Memory.rooms["E12S29"].safeMode || 0) < 300) RoomHeavyFormationHold.requestHeavyFormationHold("E12S29", 2)

					this.requestHeavyRoomHold("E12S28", 2)
					RoomHeavyFormationHold.requestHeavyFormationHold("E12S28", 2)


				}
				/*if ((Memory.rooms["E14S28"].safeMode || 0) < 1500) this.requestHeavyRoomHold("E13S27", 2)
				if ((Memory.rooms["E14S28"].safeMode || 0)) this.requestHeavyRoomHold("E13S28", 1)
				if ((Memory.rooms["E14S28"].safeMode || 0)) this.requestHeavyRoomHold("E14S29", 1)*/
				//if ((Memory.rooms["E14S28"].safeMode || 0) < 300) this.requestHeavyRoomHold("E14S28", 3)
				//this.requestHeavyRoomHold("E13S27", 2)
				//if ((Memory.rooms["E14S28"].safeMode || 0) < 300) RoomHeavyFormationHold.requestHeavyFormationHold("E14S28", 2)
			}
			else if (Memory.swc && Math.random() < 0.5) {	
				// this.requestHeavyRoomHold("E2N1")
				// this.requestHeavyRoomHold("E2N2")
				// this.requestHeavyRoomHold("E3N2")
				// this.requestHeavyRoomHold("E5N1")

				// requests[MISSION_REMOTE_STAKEOUT]["E2N2"] = Game.time
				// requests[MISSION_REMOTE_STAKEOUT]["E6N1"] = Game.time
				// requests[MISSION_ROOM_ASSAULT]["E2N2"] = Game.time
				// requests[MISSION_ROOM_ASSAULT]["E6N1"] = Game.time 
			}
			if (Memory.season2 && Memory.terminalNetworkFreeEnergy > 1e6) {
				requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W8S9"] = Game.time + 1000
				requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W6S20"] = Game.time + 1000

				// Defending cub
				// if (Memory.terminalNetworkFreeEnergy > 1.5e6) {
				// 	requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["E0N7"] = Game.time + 1000
				// }

				// If Geir is doing well or doing deep harass against me
				// requests[MISSION_SEASONAL_GAP_RAID]["E10N17"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["E4N10"] = Game.time
				// E10N5 looks quiet.
				// E10N12 looks quiet
				// E15N10 looks good but too far

				// requests[MISSION_SEASONAL_GAP_RAID]["W10S4"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W7S0"] = Game.time
				// requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W7S0"] = Game.time
				// requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W10S4"] = Game.time
				// requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W6N9"] = Game.time
				// requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W10S9"] = Game.time
				// requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W24S14"] = Game.time
				// requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W24S16"] = Game.time
				// requests[MISSION_ROOM_ANTICAMP]["W10S4"] = Game.time
				// requests[MISSION_ROOM_ANTICAMP]["W7S0"] = Game.time

				// If Qzar/Geno are doing well or doing deep harass against me
				// Also do the factory raids
				
				// Stake out on Qzar
				requests[MISSION_REMOTE_STAKEOUT]["W3S1"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W7S3"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W9S2"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["E1N9"] = Game.time + 1000

				// Stakeout on Clarkok
				requests[MISSION_REMOTE_STAKEOUT]["W5S9"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W2S7"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W1S4"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W6S13"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W4S17"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W6S17"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W7S19"] = Game.time + 1000
				requests[MISSION_REMOTE_STAKEOUT]["W8S19"] = Game.time + 1000

				// Stakeout on Geno
				requests[MISSION_REMOTE_STAKEOUT]["W2S12"] = Game.time + 1000

				if (!global.inTickObject.anyRoomUnderBigAttack) {					
					// Some extra stakeout for Qzar
					requests[MISSION_SEASONAL_GAP_RAID]["W2S2"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W6S3"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W7S4"] = Game.time + 100
					// requests[MISSION_SEASONAL_GAP_RAID]["W9S1"] = Game.time

					// Some extra stakeout for Geno
					requests[MISSION_SEASONAL_GAP_RAID]["W2S11"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W1S13"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W3S12"] = Game.time + 100

					// Extra for clarkok
					requests[MISSION_SEASONAL_GAP_RAID]["W5S17"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W5S18"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W9S19"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W9S18"] = Game.time + 100

					// Gaps
					requests[MISSION_SEASONAL_GAP_RAID]["E5S10"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W5S10"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W0S11"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W6S20"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["E0S9"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["E1S10"] = Game.time + 100

					// Geno in the south
					requests[MISSION_SEASONAL_GAP_RAID]["W20S21"] = Game.time + 100
					requests[MISSION_SEASONAL_GAP_RAID]["W19S20"] = Game.time + 100

					// Geno sometimes camps it
					if (Game.rooms["W5S10"] && Game.rooms["W5S10"].dangerous) {
						requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W5S10"] = Game.time + 100
					}
				}


				// requests[MISSION_ROOM_ANTICAMP]["W9S1"] = Game.time

				// requests[MISSION_SEASONAL_GAP_RAID]["W0S9"] = Game.time

				// requests[MISSION_SEASONAL_GAP_RAID]["W18S22"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W13S22"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W12S23"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W13S24"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W14S23"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W20S26"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W19S25"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W19S27"] = Game.time


				// requests[MISSION_SEASONAL_DROP_WALL_REPAIR]["W6N0"] = Game.time
				// requests[MISSION_ROOM_ANTICAMP]["W19S10"] = Game.time
				//requests[MISSION_SEASONAL_GAP_RAID]["W19S10"] = Game.time
				// requests[MISSION_ROOM_ANTICAMP]["W21S18"] = Game.time
				// requests[MISSION_SEASONAL_GAP_RAID]["W21S18"] = Game.time

				// requests[MISSION_SEASONAL_DROP_WALL_REMOVE]["W9S10"] = Game.time + 1000
				if (Game.rooms["W9S10"] && Game.rooms["W9S10"].dangerous) {
					requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W9S10"] = Game.time + 1000
				}
				if (Game.rooms["W10S9"] && Game.rooms["W10S9"].dangerous) {
					requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["W10S9"] = Game.time + 1000
				}				
			}

			if (Memory.season3) {
				// requests[MISSION_SEASONAL_GAP_RAID]["E10N4"] = Game.time + 100
				// requests[MISSION_SEASONAL_GAP_RAID]["E10N3"] = Game.time + 100
				// requests[MISSION_REMOTE_STAKEOUT]["E11N2"] = Game.time + 100
				// requests[MISSION_ROOM_ASSAULT]["E11N2"] = Game.time + 100
				// requests[MISSION_ROOM_SOURCE_RAID]["E11N2"] = Game.time + 100

				// requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E0S10_E0S0"] = Game.time + 100

				// if (Memory.rooms["E1N11"].rcl >= 5) {					
				requests[MISSION_ROOM_ASSAULT]["E21S9"] = Game.time + 100
				requests[MISSION_WEAK_ROOM_ATTACK]["E21S9"] = Game.time + 100
				requests[MISSION_REMOTE_STAKEOUT]["E21S9"] = Game.time + 100
				// }
				// requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E0S10_E0S0"] = Game.time + 100
				// requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E0S10_E0S0"] = Game.time + 100
			}

			if (Memory.season4) {
				requests[MISSION_SEASONAL_HIGHWAY_PATROL]["W10N20_W10N30"] = Game.time + 100
				requests[MISSION_SEASONAL_HIGHWAY_PATROL]["W0N20_W0N30"] = Game.time + 100
				requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E0N20_E0N30"] = Game.time + 100
				requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E0N10_E0N20"] = Game.time + 100
				requests[MISSION_SEASONAL_HIGHWAY_PATROL]["W0N10_W0N20"] = Game.time + 100
				requests[MISSION_SEASONAL_HIGHWAY_PATROL]["W10N10_W10N20"] = Game.time + 100

				let heavyRooms = ["W0N10", "E0N10", "W10N10", "E10N10"]

				for (let roomName of heavyRooms) {					
					if (Game.rooms[roomName] && Game.rooms[roomName].dangerous) {
						requests[MISSION_ROOM_HEAVY_CREEP_HOLD][roomName] = Game.time + 1000
					}				
				}

				// requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E10N20_E20N20"] = Game.time + 100
				// requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E20N20_E10N20"] = Game.time + 100
				// requests[MISSION_SEASONAL_HIGHWAY_PATROL]["E20N10_E20N20"] = Game.time + 100
			}
			if (Memory.season5) {
				/*if (Memory.rooms["E2N6"] && Memory.rooms["E2N6"].owner) {
					//requests[MISSION_ROOM_HEAVY_CREEP_HOLD]["E1N6"] = Game.time + 1000
					requests[MISSION_REMOTE_STAKEOUT]["E2N6"] = Game.time + 1000
					requests[MISSION_REMOTE_HARASS]["E2N6"] = Game.time + 1000
					requests[MISSION_ROOM_ASSAULT]["E2N6"] = Game.time + 1000
					requests[MISSION_ROOM_LOW_ENERGY_ASSAULT]["E2N6"] = Game.time + 1000
					requests[MISSION_ROOM_SOURCE_RAID]["E2N6"] = Game.time + 1000
					requests[MISSION_WEAK_ROOM_ATTACK]["E2N6"] = Game.time + 1000
				}

				if (Memory.rooms["E2N11"] && Memory.rooms["E2N11"].owner) {
					requests[MISSION_REMOTE_STAKEOUT]["E2N11"] = Game.time + 1000
					requests[MISSION_REMOTE_HARASS]["E2N11"] = Game.time + 1000
					requests[MISSION_ROOM_ASSAULT]["E2N11"] = Game.time + 1000
					requests[MISSION_ROOM_LOW_ENERGY_ASSAULT]["E2N11"] = Game.time + 1000
					requests[MISSION_ROOM_SOURCE_RAID]["E2N11"] = Game.time + 1000
					requests[MISSION_WEAK_ROOM_ATTACK]["E2N11"] = Game.time + 1000
				}	

				if (Memory.rooms["W12N8"] && Memory.rooms["W12N8"].owner) {
					//requests[MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD]["E2N10"] = Game.time + 1000	
					requests[MISSION_REMOTE_STAKEOUT]["W12N8"] = Game.time + 1000
					requests[MISSION_REMOTE_HARASS]["W12N8"] = Game.time + 1000
					requests[MISSION_ROOM_ASSAULT]["W12N8"] = Game.time + 1000
					requests[MISSION_ROOM_LOW_ENERGY_ASSAULT]["W12N8"] = Game.time + 1000
					requests[MISSION_ROOM_SOURCE_RAID]["W12N8"] = Game.time + 1000
					requests[MISSION_WEAK_ROOM_ATTACK]["W12N8"] = Game.time + 1000
				}*/


				/*if (Game.time % 100 == 0) {
					for (let roomName in Memory.rooms) {
						if (Memory.rooms[roomName].owner == "LeTsCrEEp") {
							let t = 304510 + 30000
							requests[MISSION_REMOTE_STAKEOUT][roomName] = t
							requests[MISSION_REMOTE_HARASS][roomName] = t
							requests[MISSION_ROOM_ASSAULT][roomName] = t
							requests[MISSION_ROOM_LOW_ENERGY_ASSAULT][roomName] = t
							requests[MISSION_ROOM_SOURCE_RAID][roomName] = t
							requests[MISSION_WEAK_ROOM_ATTACK][roomName] = t							
						}
					}
				}*/			
			}
		}
		catch (e) {
			console.log(e)
			console.log(e.stack)
		}




		global.roomAssaultCounts = {};
		global.roomAssaultFromCounts = {};
		global.boostedRoomAssaultFromCounts = {};
		global.totalAssaultCount = 0;
		global.totalBoostedAssaultCount = 0;
		global.currentBoostedAssault = [];
		global.runningIntershardSupport = 0
		global.runningIntershardLocal = 0

		if (Memory.combatManager.ID > 10000) Memory.combatManager.ID -= 10000;



		let t = Game.cpu.getUsed()

		// Kill ancient missions and clear requests
		if (Math.random() < 1 / 10. || global.stringifyError) {			
			for (let type of MISSION_TYPES) {
				Memory.combatManager.currentMissions[type] = Memory.combatManager.currentMissions[type] || [];
				Memory.combatManager.requestedMissions[type] = Memory.combatManager.requestedMissions[type] || {};
				if (Math.random() < (1 / 100.) || global.stringifyError) {
					for (let mission of _.clone(Memory.combatManager.currentMissions[type])) {
						if (mission.ID) continue;

						let timeOut = 100000;

						if 		(type == MISSION_EXIT_CAMP) timeOut = 25000;
						else if (type == MISSION_REMOTE_DEFENSE) timeOut = (mission.dangerous ? 20000 : 10000);
						else if (type == MISSION_REMOTE_RAMBO_DEFENSE) timeOut = 20000;
						else if (type == MISSION_REMOTE_CHILD_RAMBO_DEFENSE) timeOut = 20000;
						else if (type == MISSION_ROOM_DEFENSE) timeOut = 10000;
						else if (type == MISSION_REMOTE_HARASS) timeOut = 65000;
						else if (type == MISSION_REMOTE_HARASS_LIGHT) timeOut = 20000;
						else if (type == MISSION_REMOTE_DECON) timeOut = 65000;
						else if (type == MISSION_REMOTE_STAKEOUT) timeOut = 65000;
						else if (type == MISSION_REMOTE_STAKEOUT_CAPPED) timeOut = 65000;
						else if (type == MISSION_CONVOY_TAKEDOWN) timeOut = 1;
						else if (type == MISSION_ROOM_EDGE_ASSAULT) timeOut = 1;
						else if (type == MISSION_CONNECTIVITY_DECON) timeOut = 50000;
						else if (type == MISSION_ROOM_ECON_SUPPORT) timeOut = 1;
						else if (type == MISSION_STRONGHOLD_ASSAULT) timeOut = 50000;
						else if (type == MISSION_STRONGHOLD_SNAKE_ASSAULT) timeOut = 50000;
						else if (type == MISSION_STRONGHOLD_SNIPE_ASSAULT) timeOut = 50000;
						else if (type == MISSION_STRONGHOLD_MEGA_ASSAULT) timeOut = 50000;
						else if (type == MISSION_INTERSHARD_SUPPORT) timeOut = 10000;
						else if (type == MISSION_POWER_HARVEST) timeOut = 15000;

						// Some don't keep any information around other than that they failed and when.
						// If they didn't fail, delete
						if (!mission.f) {
							if (type == MISSION_ROOM_ANTICAMP) {
								timeOut = 1;
							}
							else if (type == MISSION_POWER_HARVEST) {
								timeOut = 1;
							}

						}

						if (!mission.lastLaunchTick || Game.time - mission.lastLaunchTick > timeOut) {
							_.pull(Memory.combatManager.currentMissions[type], mission);
						}
					}
				}
				if (Math.random() < (1 / 5.) || global.stringifyError) {
					for (let requestRoom in _.clone(Memory.combatManager.requestedMissions[type])) {
						let requestTime = Memory.combatManager.requestedMissions[type][requestRoom];
						if (Game.time - requestTime > (type == MISSION_STRONGHOLD_ASSAULT ? 5000 : 750)) {
							delete Memory.combatManager.requestedMissions[type][requestRoom];
						}
					}
				}
			}
		}

		if (Math.random() < (1 / 1000.) || global.stringifyError) {
			if (Memory.combatManager.assaultSafeModeTriggered) {				
				for (let playerName of Object.keys(Memory.combatManager.assaultSafeModeTriggered)) {
					if (Game.time - Memory.combatManager.assaultSafeModeTriggered[playerName] > 100000) {
						delete Memory.combatManager.assaultSafeModeTriggered[playerName];
					}
				}
			}
			if (Memory.combatManager.requestedPowerCreeps) {				
				for (let roomName of Object.keys(Memory.combatManager.requestedPowerCreeps)) {
					if (Game.time - Memory.combatManager.requestedPowerCreeps[roomName] > 100000) {
						delete Memory.combatManager.requestedPowerCreeps[roomName];
					}
				}
			}
		}


		Memory.stats.profiler["combatManagerOldMissions"] = (Game.cpu.getUsed() - t)

		t = Game.cpu.getUsed()

		// Pretick room assaults to get the count
		for (let type of [MISSION_ROOM_LOW_ENERGY_ASSAULT, MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE, MISSION_ROOM_ASSAULT, MISSION_ROOM_ASSAULT_LARGE, MISSION_FORMATION_REMOTE_DECON, MISSION_STRONGHOLD_ASSAULT, MISSION_MEGA_ASSAULT, MISSION_STRONGHOLD_MEGA_ASSAULT, MISSION_INTERSHARD_SUPPORT]) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (!mission.ID) continue;

				let missionObject;
				if (mission.type == MISSION_ROOM_LOW_ENERGY_ASSAULT) {
					missionObject = new RoomLowEAssaultMission2x2(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE) {
					missionObject = new RoomLowEAssaultMission3x3(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_ROOM_ASSAULT) {
					missionObject = new RoomAssaultMission2x2(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_ROOM_ASSAULT_LARGE) {
					missionObject = new RoomAssaultMission3x3(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_FORMATION_REMOTE_DECON) {
					missionObject = new FormationRemoteDecon(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_STRONGHOLD_ASSAULT) {
					missionObject = new StrongholdAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_MEGA_ASSAULT) {
					missionObject = new MegaAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
					missionObject = new StrongholdMegaAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (mission.type == MISSION_INTERSHARD_SUPPORT) {
					missionObject = new InterShardSupport(mission, mission.sourceRoomName, mission.targetRoomName, mission.portalRoomName, mission.targetShard, undefined, false);
				}

				if (missionObject && missionObject.isActive() && Game.rooms[mission.sourceRoomName]) {
					try {
						missionObject.preTick();
					}
					catch(e) {
						console.log("Error on missionObject preTick!");
						console.log(e);
						Game.notify(e.stack)
						console.log(e.stack);
					}
				}
			}
		}

		Memory.stats.profiler["combatManagerPreTick"] = (Game.cpu.getUsed() - t)

		let missionCountAgainstPlayer = {};

		Memory.stats.profiler["combatManagerTickFormationAssault"] = 0;

		t = Game.cpu.getUsed()
		// Tick missions
		for (let type of MISSION_TYPES) {
			let t2 = Game.cpu.getUsed()

			if (!Memory.combatManager.currentMissions[type]) {
				continue
			}

			for (var mission of Memory.combatManager.currentMissions[type]) {
				var missionObject;
				if (!mission.ID) continue;
				if (type == MISSION_REMOTE_DEFENSE) {
					missionObject = new RemoteDefenseMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				if (type == MISSION_REMOTE_RAMBO_DEFENSE) {
					missionObject = new RemoteRamboDefenseMission(mission, mission.sourceRoomName, null, false)
				}
				if (type == MISSION_REMOTE_CHILD_RAMBO_DEFENSE) {
					missionObject = new ChildRemoteRamboDefenseMission(mission, mission.sourceRoomName, mission.childRoomName, null, false)
				}
				else if (type == MISSION_ROOM_DEFENSE) {
					missionObject = new RoomDefenseMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_REMOTE_HARASS) {
					missionObject = new RemoteHarassMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_REMOTE_HARASS_LIGHT) {
					missionObject = new RemoteHarassLightMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_REMOTE_DECON) {
					missionObject = new RemoteDeconMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_REMOTE_STAKEOUT) {
					missionObject = new RemoteStakeOutMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_REMOTE_STAKEOUT_CAPPED) {
					missionObject = new RemoteStakeOutCappedMission(mission, mission.sourceRoomName, mission.targetRoomName, mission.maxE, false)
				}
				else if (type == MISSION_EXIT_CAMP) {
					missionObject = new ExitCampMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_CONVOY_TAKEDOWN) {
					missionObject = new ConvoyTakedownMission(mission, mission.sourceRoomName, mission.targetRoomName, mission.convoyDirection, false)
				}
				else if (type == MISSION_SEASONAL_CONVOY_TRADE) {
					missionObject = new SeasonalConvoyTrade(mission, mission.sourceRoomName, mission.targetRoomName, mission.convoyDirection, false)
				}
				else if (type == MISSION_ROOM_SOURCE_RAID) {
					missionObject = new RoomSourceRaidMission(mission, mission.sourceRoomName, mission.targetRoomName, mission.targetSourceId, false)
				}
				else if (type == MISSION_ROOM_SWARM) {
					missionObject = new RoomSwarmMission(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_WEAK_ROOM_ATTACK) {
					missionObject = new WeakRoomAttackMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_LOW_ENERGY_ASSAULT) {
					missionObject = new RoomLowEAssaultMission2x2(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE) {
					missionObject = new RoomLowEAssaultMission3x3(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_ASSAULT) {
					missionObject = new RoomAssaultMission2x2(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_ASSAULT_LARGE) {
					missionObject = new RoomAssaultMission3x3(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_ASSAULT_BLINKY) {
					missionObject = new RoomAssaultBlinky(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_MEGA_ASSAULT) {
					missionObject = new MegaAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_STRONGHOLD_ASSAULT) {
					missionObject = new StrongholdAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_STRONGHOLD_SNAKE_ASSAULT) {
					missionObject = new StrongholdSnakeAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_STRONGHOLD_SNIPE_ASSAULT) {
					missionObject = new StrongholdSnipeAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_STRONGHOLD_MEGA_ASSAULT) {
					missionObject = new StrongholdMegaAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_EDGE_ASSAULT) {
					missionObject = new RoomEdgeAssaultMission(mission, mission.sourceRoomName, mission.targetRoomName, mission.setupRoomName, false);
				}
				else if (type == MISSION_CHILD_NEIGHBOUR_ROOM_HOLD) {
					missionObject = new ChildNeighbourHoldMission(mission, mission.sourceRoomName, mission.targetRoomName, mission.childRoomName, false);
				}
				else if (type == MISSION_CONNECTIVITY_DECON) {
					missionObject = new ConnectivityDecon(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_FORMATION_REMOTE_DECON) {
					missionObject = new FormationRemoteDecon(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_ANTICAMP) {
					missionObject = new RoomAntiCampMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_ECON_SUPPORT) {
					missionObject = new RoomEconSupportMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_HEAVY_CONTROLLER_ATTACK) {
					missionObject = new HeavyControllerAttackMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_HEAVY_CREEP_CLEAR) {
					missionObject = new RoomHeavyCreepClear(mission, mission.sourceRoomName, mission.targetRoomName, mission.assaultRoomName, false);
				}
				else if (type == MISSION_ROOM_HEAVY_CREEP_HOLD) {
					missionObject = new RoomHeavyCreepHold(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD ) {
					missionObject = new RoomHeavyCreepRangedHold(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_HEAVY_FORMATION_HOLD ) {
					missionObject = new RoomHeavyFormationHold(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_POWER_ASSAULT) {
					missionObject = new RoomAssaultPowerSupport(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_POWER_RAID) {
					missionObject = new PowerRaidMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_RESOURCE_RAID) {
					missionObject = new ResourceRaidMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_PICKET) {
					missionObject = new PicketMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_DEPOSIT_FARM) {
					missionObject = new DepositFarmMission(mission, mission.targetRoomName, false);
				}
				else if (type == MISSION_DEPOSIT_HARVEST) {
					missionObject = new DepositHarvestMission(mission, mission.targetRoomName, mission.depositInfo, false);
				}
				else if (type == MISSION_POWER_HARVEST) {
					missionObject = new PowerHarvestMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_INTERSHARD_SUPPORT) {
					missionObject = new InterShardSupport(mission, mission.sourceRoomName, mission.targetRoomName, mission.portalRoomName, mission.targetShard, undefined, false);
				}
				else if (type == MISSION_INTERSHARD_SUPPORT_LOCAL) {
					missionObject = new InterShardSupportLocal(mission, mission.targetRoomName, false);
				}
				else if (type == MISSION_SEASONAL_DROP_WALL_REMOVE) {
					missionObject = new SeasonalDropWallRemove(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_SEASONAL_DROP_WALL_REPAIR) {
					missionObject = new SeasonalDropWallRepair(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_SEASONAL_DROP_RAID) {
					missionObject = new SeasonalDropRaid(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_SEASONAL_GAP_RAID) {
					missionObject = new SeasonalGapRaid(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_SEASONAL_HIGHWAY_PATROL) {
					missionObject = new SeasonHighwayPatrolMission(mission, mission.sourceRoomName, mission.startRoomName, mission.endRoomName, false);
				}
				else if (type == MISSION_SEASON_5_REACTOR_CLAIM) {
					missionObject = new Season5ReactorClaim(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_SEASON_5_SCORING) {
					missionObject = new Season5Scoring(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}
				else if (type == MISSION_CHILD_HEAVY_MINE) {
					missionObject = new ChildHeavyMine(mission, mission.sourceRoomName, mission.targetRoomName, false)
				}

				if (missionObject && missionObject.isActive() && (!mission.sourceRoomName || Game.rooms[mission.sourceRoomName])) {
					let t3 = Game.cpu.getUsed();

					if (mission.targetRoomName && Memory.rooms[mission.targetRoomName] && Memory.rooms[mission.targetRoomName].owner) {
						let owner = Memory.rooms[mission.targetRoomName].owner;
						missionCountAgainstPlayer[owner] = missionCountAgainstPlayer[owner] || 0;
						missionCountAgainstPlayer[owner]++;
					}


					if (mission.sourceRoomName) {
						Game.rooms[mission.sourceRoomName].addNumCombatBodyParts(missionObject.getNumCombatBodyParts());
					}
					try {
						missionObject.tick();
					}
					catch(e) {
						console.log("Error on missionObject tick!");
						console.log(mission.sourceRoomName, mission.targetRoomName);
						Game.notify(e.stack)
						console.log(e.stack);
					}
					if (type == MISSION_ROOM_ASSAULT) {
						Memory.stats.profiler["combatManagerTick" + mission.sourceRoomName + "_" + mission.targetRoomName] = (Game.cpu.getUsed() - t3)
					}
				}


			}
			Memory.stats.profiler["combatManagerTick" + type] = (Game.cpu.getUsed() - t2)
		}

		Memory.stats.profiler["combatManagerTick"] = (Game.cpu.getUsed() - t)



		let launchedAttack = false;

		t = Game.cpu.getUsed()

		// New missions by room
		if (Math.random() < 0.02) console.log(JSON.stringify(global.roomAssaultCounts))
		if ((Game.cpu.bucket > 1500 && t < 100 && Memory.maxRoomLevel > 2) || Memory.forceAttackPoll) {

			// There are two ways to do this:
			// 1) Pick a room then pick an enemy room to hit
			// 2) Pick a enemy then pick a room to hit it
			// The first method is good because I hit the right enemy rooms
			// The second method is good because I hit from the right room.
			if (Math.random() < 0.1 || Memory.forceAttackPoll) {
				delete Memory.forceAttackPoll
				let priorities = []
				let reSample;

				let potentialRooms = _.shuffle(Memory.enemyRooms)
				let requestedRooms = [];

				// Test requested first.
				for (let type of MISSION_TYPES) {
					if (!Memory.combatManager.requestedMissions[type]) continue;
					for (let requestRoom in Memory.combatManager.requestedMissions[type]) {
						let enemyRoom
						if (Memory.rooms[requestRoom]) {
							enemyRoom = Memory.rooms[requestRoom].owner && Memory.rooms[requestRoom].owner != "Invader" && Memory.rooms[requestRoom].owner != util.getMyName();
						}
						else {
							enemyRoom = intelAI.getEnemyRoomSet().has(requestRoom);
						}

						if (enemyRoom) {
							// potentialRooms.push(requestRoom);
							requestedRooms.push(requestRoom);
						}
					}
				}

				potentialRooms = potentialRooms.concat(_.shuffle(requestedRooms))

				let gclEstimate = intelAI.getGCLEstimates();

				// Could save ~0.2 CPU/tick using global cache here.
				let safeModeEstimates = intelAI.getSafeModeEstimates();

				let damagedFraction = (Game.damagedRooms || 0) / Game.myRooms.length;
				let highestHate;
				if (damagedFraction > 0) {
					highestHate = intelAI.getMaxHatePercentage();
				}

				let budget = Game.cpu.limit * (0.015 / 0.1) * (Game.cpu.bucket - 500) / 9500;

				if (Memory.economyArena) {
					budget /= 2;
				}
		
				Memory.attackFocus = Memory.attackFocus || {};

				let nonMMOFactors 

				if (Memory.privateServer) {
					nonMMOFactors = {}

					// if (Memory.timedRound) {
						nonMMOFactors.gclEnergyEstimates = intelAI.getGCLEnergyEstimates()
					// }
				}


				let cnt = 0;

				// let testedRooms = []

				if (potentialRooms.length) {			
					do {
						let enemyRoom = potentialRooms.pop();
						if (Memory.rooms[enemyRoom] && Game.time >= (Memory.rooms[enemyRoom].nxtOPoll || 0)) {
							let newPriorities = [];
							if (Memory.privateServer) {
								nonMMOFactors.totalEnergy = intelAI.getEnergyEstimate(Memory.rooms[enemyRoom].owner)
								nonMMOFactors.boostStocks = intelAI.getBoostStocks(Memory.rooms[enemyRoom].owner)
							}

							try {
								newPriorities = this.getOffensiveMissionPriorities(enemyRoom, gclEstimate, safeModeEstimates, nonMMOFactors, damagedFraction, highestHate, missionCountAgainstPlayer)
							}
							catch(e) {
								console.log("Error on room offense poll!", enemyRoom);
								console.log(e);
								Game.notify(e.stack)
								console.log(e.stack);
							}


							if (newPriorities && newPriorities.priorities && newPriorities.priorities.length) {
								priorities = priorities.concat(newPriorities.priorities)
								// The world ain't changing much in 10 ticks
								Memory.rooms[enemyRoom].nxtOPoll = Game.time + 10
							}
							else {
								let assaultMod = global.roomAssaultCounts[enemyRoom] ? 0.1 : 1

								if (requestedRooms.includes(enemyRoom)) {
									Memory.rooms[enemyRoom].nxtOPoll = Game.time + 10
								}
								else if (newPriorities && newPriorities.minSafeRoute) {
									if (newPriorities.minSafeRoute == Infinity)	 {
										Memory.rooms[enemyRoom].nxtOPoll = Game.time + Math.round(Game.myRooms.length * 100 * assaultMod)
									}
									else {
										Memory.rooms[enemyRoom].nxtOPoll = Math.round(Game.time + Game.myRooms.length * newPriorities.minSafeRoute * assaultMod) 
									}
								}
								else {
									Memory.rooms[enemyRoom].nxtOPoll = Game.time + Math.round(Game.myRooms.length * 10 * assaultMod)
								}
							}

							// testedRooms.push(enemyRoom)
						}

						// Lets give this a ~0.5% CPU budget at bucket = 3500. Run once every 10 ticks

						// console.log(enemyRoom, Game.cpu.getUsed() - t)

						cnt++;
						reSample = (Game.cpu.getUsed() - t) < budget && potentialRooms.length;
					}
					while (reSample)
				}


				// console.log(JSON.stringify(priorities))

				priorities.sort(function (a, b) {
					return b.p - a.p;
				});

				if (priorities.length) {
					console.log(JSON.stringify(priorities))
				}

				try {
					let launchedMission = this.launchOMissionWithPriorities(priorities);
					// Maybe another room wants in, so let me poll again next tick.
					if (launchedMission) {
						Memory.rooms[launchedMission.targetRoomName].nxtOPoll = Game.time;
					}
				}
				catch(e) {
					console.log("Error on room offense launch!");
					console.log(e);
					Game.notify(e.stack)
					console.log(e.stack);
				}
				if (Memory.debugAttackPoll) {
					console.log("cmap:", (Game.cpu.getUsed() - t), cnt)
				}
				// if (testedRooms.length) {					
				// 	console.log(JSON.stringify(priorities))
				// 	console.log(testedRooms)
				// }
			}


			// TODO: Get rid of this child room idea. 
			for (var room of _.shuffle(Game.myRooms)) {
				// Sort out my child rooms.
				if (Math.random() < (1 / 50.)) {
					if (room.mem.childRooms) {
						// It's not technically an offensive mission
						// On the other hand, it's non-critical, just like offensive missions
						if (room.restrictOffensiveMissions(null, false, false, false)) {
							continue;
						}



						for (let childRoomName of room.memory.childRooms) {
							if (Game.rooms[childRoomName] &&
								Game.rooms[childRoomName].controller.my &&
								// Work on controller level. If we've been splatted, then I guess there's not much point in doing perimeter guards
								Game.rooms[childRoomName].controller.level < 4 &&
								Game.rooms[childRoomName].effectiveLevel < room.effectiveLevel) {

								let currentMission = {};

								for (var mission of Memory.combatManager.currentMissions[MISSION_CHILD_NEIGHBOUR_ROOM_HOLD]) {
									if (mission.type == MISSION_CHILD_NEIGHBOUR_ROOM_HOLD && mission.sourceRoomName == room.name && mission.targetRoomName == childRoomName) {
										currentMission = new ChildNeighbourHoldMission(mission, room.name, childRoomName, childRoomName, false);
										break;
									}
								}

								if (!currentMission.memory || !currentMission.isActive()) {
									let newMemory = !currentMission.memory;
									currentMission = currentMission || {};
									currentMission = new ChildNeighbourHoldMission(currentMission.memory || {}, room.name, childRoomName, childRoomName, true)

									if (currentMission.isActive()) {
										if (newMemory) {
											Memory.combatManager.currentMissions[MISSION_CHILD_NEIGHBOUR_ROOM_HOLD].push(currentMission.memory);
										}
										currentMission.requestSpawns();
									}
								}


								let exits = Game.map.describeExits(childRoomName);
								for (var exitDir in exits) {
									var exitRoom = exits[exitDir];

									let exitExits = Game.map.describeExits(exitRoom);

									// Cave room, only exit is to me.
									if (Object.keys(exitExits).length == 1) {
										continue;
									}

									if (intelAI.getEnemyRoomSet().has(exitRoom)) {
										continue;
									}

									if (Game.rooms[exitRoom] && Game.rooms[exitRoom].controller && Game.rooms[exitRoom].controller.my && Game.rooms[exitRoom].effectiveLevel >= 4) {
										continue;
									}

									let sectorCoords = util.getSectorCoords(exitRoom);
									if (sectorCoords.x >= 4 && sectorCoords.x <= 6 && sectorCoords.y >= 4 && sectorCoords.y <= 6) {
										continue;
									}

									currentMission = {};

									for (var mission of Memory.combatManager.currentMissions[MISSION_CHILD_NEIGHBOUR_ROOM_HOLD]) {
										if (mission.type == MISSION_CHILD_NEIGHBOUR_ROOM_HOLD && mission.sourceRoomName == room.name && mission.targetRoomName == exitRoom) {
											currentMission = new ChildNeighbourHoldMission(mission, room.name, exitRoom, childRoomName, false);
											break;
										}
									}
									// console.log(currentMission.memory, currentMission.isActive(), room.name, exitRoom, childRoomName)

									if (!currentMission.memory || !currentMission.isActive()) {
										let newMemory = !currentMission.memory;
										currentMission = currentMission || {};
										currentMission = new ChildNeighbourHoldMission(currentMission.memory || {}, room.name, exitRoom, childRoomName, true)


										if (currentMission.isActive()) {
											if (newMemory) {
												Memory.combatManager.currentMissions[MISSION_CHILD_NEIGHBOUR_ROOM_HOLD].push(currentMission.memory);
											}
											currentMission.requestSpawns();
										}
									}
								}
							}
						}
					}

				}
			}
		}

		Memory.stats.profiler["combatManagerAttackPoll"] = (Game.cpu.getUsed() - t)

		t = Game.cpu.getUsed()
		// Handle requests
		if (Math.random() < 0.3) {
			for (let type of MISSION_TYPES) {
				if (Math.random() < 0.3) {
					// I think this used to be here to save CPU, but as mission types increase
					// It probably does the opposite. I also always forget to add new missions to it
					// if (type != MISSION_CONNECTIVITY_DECON && 
					// 	type != MISSION_FORMATION_REMOTE_DECON && 
					// 	type != MISSION_ROOM_ANTICAMP && 
					// 	type != MISSION_STRONGHOLD_ASSAULT &&
					// 	type != MISSION_PICKET &&
					// 	type != MISSION_DEPOSIT_FARM &&
					// 	type != MISSION_DEPOSIT_HARVEST &&
					// 	type != MISSION_ROOM_HEAVY_CREEP_HOLD &&
					// 	type != MISSION_SEASONAL_GAP_RAID &&
					// 	type != MISSION_SEASONAL_DROP_RAID &&
					// 	type != MISSION_SEASONAL_DROP_WALL_REMOVE &&
					// 	type != MISSION_SEASONAL_DROP_WALL_REPAIR) continue

					Memory.combatManager.requestedMissions[type] = Memory.combatManager.requestedMissions[type] || {};
					for (let requestRoomName in _.clone(Memory.combatManager.requestedMissions[type])) {
						if (Math.random() < 0.3) {
							// Remmeber to add to if statement above
							if (type == MISSION_CONNECTIVITY_DECON) {
								this.requestConnectivityDecon(requestRoomName)
							}
							else if (type == MISSION_FORMATION_REMOTE_DECON) {
								this.requestFormationRemoteDecon(requestRoomName)
							}
							else if (type == MISSION_ROOM_ANTICAMP) {
								this.requestRoomAntiCamp(requestRoomName)
							}
							// These are expensive.
							else if (type == MISSION_STRONGHOLD_ASSAULT && (Math.random() < 0.2 || this.hasActiveMissionsOfTypeToRoom(requestRoomName, MISSION_STRONGHOLD_MEGA_ASSAULT))) {
								// Only allow one to spawn per tick
								if (this.requestStrongholdAssault(requestRoomName)) {
									break;
								}
							}
							else if (type == MISSION_PICKET) {
								this.requestPicketMission(requestRoomName)
							}
							else if (type == MISSION_DEPOSIT_FARM && Math.random() < 0.1) {
								this.requestDepositFarmMission(requestRoomName)
							}
							else if (type == MISSION_DEPOSIT_HARVEST) {
								this.requestDepositHarvestMission(requestRoomName)
							}
							else if (type == MISSION_ROOM_HEAVY_CREEP_HOLD) {
								this.requestHeavyCreepHold(requestRoomName)
							}
							else if (type == MISSION_SEASONAL_DROP_WALL_REMOVE) {
								this.requestSeasonalDropWallRemove(requestRoomName)
							}
							else if (type == MISSION_SEASONAL_DROP_WALL_REPAIR) {
								this.requestSeasonalDropWallRepair(requestRoomName)
							}
							else if (type == MISSION_SEASONAL_DROP_RAID) {
								this.requestSeasonDropRaid(requestRoomName)
							}
							else if (type == MISSION_SEASONAL_GAP_RAID) {
								this.requestSeasonGapRaid(requestRoomName)
							}
							else if (type == MISSION_SEASONAL_HIGHWAY_PATROL) {
								let splitted = requestRoomName.split("_")
								SeasonHighwayPatrolMission.requestHighwayPatrol(splitted[0], splitted[1])
							}
							else if (type == MISSION_ROOM_ASSAULT_NUKE_FOLLOW) {
								this.requestNukeFollowMission(requestRoomName)
							}
							// Remmeber to add to if statement above
						}
					}
				}
			}
		}

		Memory.stats.profiler["combatManagerRequests"] = (Game.cpu.getUsed() - t)

		t = Game.cpu.getUsed()
		if (Math.random() < 0.2) {
			this.pollInterShardMissions();
		}
		Memory.stats.profiler["combatManagerIntershardPoll"] = (Game.cpu.getUsed() - t)


		t = Game.cpu.getUsed()
		if (Math.random() < 0.01) {
			this.runLocalIntershard();
		}
		Memory.stats.profiler["combatManagerLocalIntershard"] = (Game.cpu.getUsed() - t)


		// console.log(Game.cpu.getUsed())
		t = Game.cpu.getUsed()
		this.pollCampMissions();
		Memory.stats.profiler["combatManagerCampPoll"] = (Game.cpu.getUsed() - t)
		// console.log(Game.cpu.getUsed())

		t = Game.cpu.getUsed()

		this.pollHarassCounterAttack();

		Memory.stats.profiler["combatManagerHarassCounter"] = (Game.cpu.getUsed() - t)



		t = Game.cpu.getUsed()
		nukeAI.tick();
		Memory.stats.profiler["nukeAITick"] = (Game.cpu.getUsed() - t)


		idleCreepManager.tick();


		// console.log(Game.cpu.getUsed())
	},


	moveCreepsToRamparts : function(roomName) {
		/*for (let type of MISSION_TYPES) {
			Memory.combatManager.currentMissions[type] = Memory.combatManager.currentMissions[type] || [];
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (!mission.ID) continue;

				if (mission.assignedCreeps) {
					for (var creepName of mission.assignedCreeps) {
						let creep = Game.creeps[creepName]
						if (creep && creep.room.name == roomName && (!creep.mem.haveSnaked || (creep.mem.lastAgression !== undefined && creep.mem.lastAgression < 0))) {
							creep.ramparter = true;
							creep.mem.retreat = false;
						}
					}
				}
			}
		}

		for (var idleCreep of Memory.combatManager.idlePool) {
			if (Game.creeps[idleCreep]) {
				var creep = Game.creeps[idleCreep];

				if (roomName == creep.room.name) {
					creep.ramparter = true;
					creep.mem.retreat = false;
				}
			}
		}*/

		// I think this is better than looping through all the creeps in the fecking world given it only pulls ones actually in the room!
		for (let creep of Game.rooms[roomName].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false)) {			
			if (!creep.spawning && creep.room.name == roomName && (!creep.mem.haveSnaked || (creep.mem.lastAgression !== undefined && creep.mem.lastAgression < 0))) {
				creep.ramparter = true;
				creep.mem.retreat = false;
			}
		}
	},

	getNumActiveMissions : function() {
		var count = 0;
		for (let type of MISSION_TYPES) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				count += mission.ID ? 1 : 0;
			}
		}
		return count;
	},

	getNumActiveMissionsFromRoom : function(sourceRoomName) {
		var count = 0;
		for (let type of MISSION_TYPES) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (mission.sourceRoomName == sourceRoomName && mission.ID) {
					count++;
				}
			}
		}
		return count;
	},


	hasActiveMissionsOfTypeToRoom : function(targetRoomName, type) {
		for (var mission of Memory.combatManager.currentMissions[type]) {
			if (mission.targetRoomName == targetRoomName && mission.ID) {
				return true;
			}
		}
		return false;
	},

	hasActiveMissionsFromRoom : function(sourceRoomName) {
		for (let type of MISSION_TYPES) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (mission.sourceRoomName == sourceRoomName && mission.ID) {
					return true;
				}
			}
		}

		return false;
	},



	isPendingBoosts : function(sourceRoomName) {
		// if (this.pendingBoosts !== undefined) {
		// 	return this.pendingBoosts;
		// }


		for (let type of MISSION_TYPES) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (mission.sourceRoomName == sourceRoomName && mission.ID) {
					for (let creepName in mission.spawningCreepBoosts || {}) {
						for (let boost in mission.spawningCreepBoosts[creepName]) {
							if (mission.spawningCreepBoosts[creepName][boost]) {
								// this.pendingBoosts = true;
								return true;
							}
						}
					}
					for (let creepName of mission.assignedCreeps) {
						let creep = Game.creeps[creepName];
						if (creep && creep.hasBoost()) {
							return true;
						}
						if (creep && creep.mem.targetBoosts && !creep.mem.boostsChecked) {
							for (let boost in creep.mem.targetBoosts) {
								if (creep.mem.targetBoosts[boost]) {
									// this.pendingBoosts = true;
									return true;
								}
							}
						}
					}
				}
			}
		}
		// this.pendingBoosts = false;
		return false;
	},

	getNumberOfCreepsForMission : function(ID) {
		for (let type of MISSION_TYPES) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (mission.ID == ID) {
					return mission.assignedCreeps.length;
				}
			}
		}
	},

	clearCreepNameFromSpawning : function(name) {
		console.log("Spawn wants to clear", name, "as it's been 1000 ticks since logged")
		// This ain't cheap, but hopefully not frequent either
		for (let type of MISSION_TYPES) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				var missionObject;
				if (!mission.ID) continue;

				for (let spawningCreepName of _.clone(mission.spawningCreeps)) {
					if (spawningCreepName == name) {
						delete mission.spawningBodies[name]
						delete mission.spawningCreepBoosts[name]
						_.pull(mission.spawningCreeps, name)
						return
					}
				}
			}
		}
	},




	runLocalIntershard: function() {
		for (let shardName of global.activeShards) {
			if (shardName == Game.shard.name) continue
			let isMemory = interShardMemoryManager.getMem(shardName);

			if (isMemory.sendingISSupportTo && isMemory.sendingISSupportTo.s == Game.shard.name) {
				console.log("Detecting a IS mission incoming to", Game.shard.name, isMemory.sendingISSupportTo.r)

				let currentMemory = {};
				for (let mission of Memory.combatManager.currentMissions[MISSION_INTERSHARD_SUPPORT_LOCAL]) {
					if (mission.targetRoomName == isMemory.sendingISSupportTo.r) {
						currentMemory = mission;
						break;
					}
				}
				var newMemory = (!currentMemory.type);
				let currentMission = new InterShardSupportLocal(currentMemory, isMemory.sendingISSupportTo.r, true)
				if (currentMission.isActive()) {
					if (newMemory) Memory.combatManager.currentMissions[MISSION_INTERSHARD_SUPPORT_LOCAL].push(currentMission.memory);
					return 1;
				}
			}
		}
	},


	pollInterShardMissions: function() {
		let claimScanData = Memory.claimScanData;

		if (!claimScanData.supportingISClaim) return


		if (Math.random() < 0.1 || Memory.claimScanData.isMissionOffset === undefined) {
			let isMemory = interShardMemoryManager.getMem(claimScanData.supportingISClaim.s);

			if (!isMemory.myRooms[claimScanData.supportingISClaim.r] &&
				isMemory.isSupportData[claimScanData.supportingISClaim.r] === undefined && 
				Game.time - (claimScanData.supportingISClaim.t || 0) > 10000) {
				delete claimScanData.supportingISClaim
				let localMemory = interShardMemoryManager.getMem(Game.shard.name);
				delete localMemory.sendingISSupportTo;
				interShardMemoryManager.touchLocal()
				return
			}

			if (isMemory.isSupportData && isMemory.isSupportData[claimScanData.supportingISClaim.r] !== undefined) {
				Memory.claimScanData.isMissionOffset = isMemory.isSupportData[claimScanData.supportingISClaim.r].spawnOffset || 0;
			}
		}

		let nextISMissionTime = (Memory.claimScanData.nextISMission || 0) + (Memory.claimScanData.isMissionOffset || 0)

		console.log("Intershard support launching in ", nextISMissionTime - Game.time, "ticks with", (Memory.claimScanData.isMissionOffset || 0), "offset")

		let currentlyRunning = global.runningIntershardSupport || (Game.time - (nextISMissionTime || 0) > -1500);

		if ((Game.time >= nextISMissionTime || Memory.testInterShardSupport) && !Memory.disableInterShardSupport && Memory.attemptShard1StartTick) {
			let targetShard = claimScanData.supportingISClaim.s
			let targetRoomName = claimScanData.supportingISClaim.r
			let portalRoomName = claimScanData.supportingISClaim.pr

			let bestSourceRoom
			let shortestDist = Infinity
			for (let room of Game.myRooms) {
				if (room.effectiveLevel == 8 && room.defcon == 5) {							
					// For our main room we don't want to stretch more than 4 tiles. We want to intershard trade here!
					// Also harder to support...
					let dist = safeRoute.getSafeRouteCost(claimScanData.supportingISClaim.pr, room.name, false, true, currentlyRunning ? 10 : 4)
					if (dist < shortestDist) {
						bestSourceRoom = room;
						shortestDist = dist;
					}
				}
			}

			if (bestSourceRoom) {
				let currentMemory = {};
				for (let mission of Memory.combatManager.currentMissions[MISSION_INTERSHARD_SUPPORT]) {
					if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name && mission.targetShard == targetShard && mission.portalRoomName == portalRoomName) {
						currentMemory = mission;
						break;
					}
				}
				var newMemory = (!currentMemory.type);
				let currentMission = new InterShardSupport(currentMemory || {}, bestSourceRoom.name, targetRoomName, portalRoomName, targetShard, true)

				if (currentMission.isActive()) {
					let spawnSuccessful = currentMission.requestSpawns();

					if (!spawnSuccessful) {
						console.log("IS mission spawn failed")
						currentMission.cleanMemory();
						currentMission.memory.ID = 0;
						return 0;
					}

					let localMemory = interShardMemoryManager.getMem(Game.shard.name);
					localMemory.sendingISSupportTo = {s: targetShard, r: targetRoomName};
					interShardMemoryManager.touchLocal()

					// let basePeriod = 750;
					let basePeriod = 650 - (currentMission.usingAlternativePortal ? 250 : 0);
					let isMemory = interShardMemoryManager.getMem(targetShard);

					let tickRatio = (isMemory.secsPerTick || 3) / (Memory.stats.secsPerTick || 3);
					Memory.claimScanData.nextISMission = Game.time + Math.round(basePeriod * tickRatio)

					console.log(bestSourceRoom.name + " Launching intershard support for " + targetRoomName)

					if (newMemory) Memory.combatManager.currentMissions[MISSION_INTERSHARD_SUPPORT].push(currentMission.memory);
					delete Memory.testInterShardSupport
					return 1;
				}
				console.log("IS mission inactive")
				return 0;
			}
			else {
				console.log("IS support no source room!")
			}

		}

	},


	pollCampMissions : function() {
		if (Math.random() < 0.04) {
			for (let roomName in Memory.rooms) {
				if (Memory.rooms[roomName].borderInfos && Math.random() < 0.02) {
					if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
						continue;
					}

					let closestRoom;
					let closestDist = Infinity;
					for (let myRoom of Game.myRooms) {
						if (Game.map.getRoomLinearDistance(roomName, myRoom.name) >= 10) {
							continue;
						}
						if (myRoom.effectiveLevel > 3 && !myRoom.restrictOffensiveMissions(roomName, false, false, false)) {
							let dist = safeRoute.getSafeRouteCost(myRoom.name, roomName, false);
							if (dist < 10 && dist < closestDist) {
								closestDist = dist;
								closestRoom = myRoom;
							}
						}
					}

					if (closestRoom) {
						this.requestCampMission(closestRoom, roomName);
					}
				}
			}
		}
	},

	requestCampMission : function(parentRoom, campRoomName) {
		if (parentRoom.restrictOffensiveMissions(campRoomName, false, false, false)) return;
		// We're already kicking the bucket. Don't kick it more.
		if (Game.cpu.bucket < 1000 && Math.random() < 0.9) {
			return;
		}

		if (!Memory.rooms[campRoomName] || !Memory.rooms[campRoomName].borderInfos) {
			return;
		}

		if (Memory.rooms[campRoomName].owner && Memory.rooms[campRoomName].owner != util.getMyName()) {
			return;
		}

		if (Memory.rooms[campRoomName].reservedBy && scouting.isPlayerWhiteListed(Memory.rooms[campRoomName].reservedBy)) {
			return false;
		}

		if (Memory.rooms[campRoomName].reservedBy && 
			Memory.season &&
			Memory.stats.hateCounter[Memory.rooms[campRoomName].reservedBy] < 100000) {
			return false;	
		}

		// Doing it already. We only allow one per target room.
		let currentMission = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_EXIT_CAMP]) {
			if (mission.sourceRoomName == parentRoom.name && mission.targetRoomName == campRoomName) {
				currentMission = new ExitCampMission(mission, parentRoom.name, campRoomName, false);
				break;
			}
		}

		if (!currentMission.memory || !currentMission.isActive()) {
			let newMemory = currentMission.memory === undefined;
			currentMission = new ExitCampMission(currentMission.memory || {}, parentRoom.name, campRoomName, true)

			if (currentMission.isActive()) {
				if (newMemory) {
					Memory.combatManager.currentMissions[MISSION_EXIT_CAMP].push(currentMission.memory);
				}
			}
		}
	},

	// launchPicketMission : function(parentRoom, protectRoom, meanEnemyParts) {
	// },

	pollHarassCounterAttack : function() {
		Memory.combatManager.harrassCounterAttackData = Memory.combatManager.harrassCounterAttackData || {}
		let minStakeOutCostPerRoom = RemoteStakeOutMission.getEnergyPerEscalation();

		function getProposedMaxE(playerName) {
			let energyLossPerTick = Memory.stats.globalHarassTracking[playerName] / Memory.stats.ticks

			if (energyLossPerTick < 1) {
				return {e: -1, r: []}
			}

			let totalNumExits = 0
			let energyDeniedPerTick = 0
			let enemyRoomsInRange = []

			for (let enemyRoomName of intelAI.getEnemyRoomSet()) {
				let mem = Memory.rooms[enemyRoomName];
				if (!mem) continue
				if (mem.owner != playerName) continue

				// Bit of a hack. Denying energy is less valuable in these cases
				if (mem.closestRoomRange > 10) {
					if (mem.rcl >= 6) {
						energyDeniedPerTick -= 20;
					}
					continue
				}

				enemyRoomsInRange.push(enemyRoomName)

				let exits = Game.map.describeExits(enemyRoomName);
				for (let exitDir in exits) {
					let exitRoomName = exits[exitDir]
					let exitRoomMem = Memory.rooms[exitRoomName]
					if (exitRoomMem && !exitRoomMem.owner) {
						totalNumExits++

						if (exitRoomMem.reservedBy) {
							if (exitRoomMem.reservedBy == playerName) {
								energyDeniedPerTick += roomIntel.getEffectiveNumSources(exitRoomName) * 10
							}
						}
						else {
							energyDeniedPerTick += roomIntel.getEffectiveNumSources(exitRoomName) * 2
						}
					}
				}
			}
			if (!totalNumExits) {
				return {e: -1, r: enemyRoomsInRange}
			}

			let roomsFraction = Memory.gclEstimates[playerName] / intelAI.getEnemyRoomSet().size
		
			let positivesPerTick = energyLossPerTick + Math.max(0, energyDeniedPerTick * 0.5 * (roomsFraction || 1))

			// Assume 1.5 creeps per room. Might be two, might be one.
			let negativesPerTick = (Memory.stats.yieldPerCPU || 0) * 0.3 * totalNumExits


			// Lets assume a body part averages 125 energy.
			let escalationCostInEnergyPerTick = minStakeOutCostPerRoom / CREEP_LIFE_TIME + (Memory.stats.yieldPerSpawnTick || 0) * (minStakeOutCostPerRoom / 125) * CREEP_SPAWN_TIME
			let maxE = (positivesPerTick - negativesPerTick) / (totalNumExits * escalationCostInEnergyPerTick)

			return {e: maxE, r: enemyRoomsInRange}
		}


		if (Math.random() < 0.01) {
			for (let playerName in Memory.combatManager.harrassCounterAttackData) {
				let data = Memory.combatManager.harrassCounterAttackData[playerName]
				if (Game.time - data.t > 2000 && Game.time - data.t < 10000) {
					// If the missions are being successful this should drop
					let currentMaxE = getProposedMaxE(playerName).e
					console.log(playerName, "currentMaxE for harassCounter", currentMaxE, "target:", data.e)

					// We've reduced harassment by more than it cost
					if (currentMaxE < data.e) {
						data.s++
					}
					// We have not.
					else {
						data.f++
					}
				}
			}
		}


		// TODO: Track success better
		for (let playerName in Memory.stats.globalHarassTracking) {
			if (Math.random() > 0.0001) continue

			// If we've failed a lot in the past pust it back
			if (Memory.combatManager.harrassCounterAttackData[playerName]) {
				let data = Memory.combatManager.harrassCounterAttackData[playerName]
				if (data.s || data.f) {
					let successRate = data.s / (data.s + data.f)
					if (Math.random() > 0.1 + 0.9 * successRate) {
						continue
					}
				}
			}

			let ret = getProposedMaxE(playerName)

			let maxE = ret.e;
			let enemyRoomsInRange = ret.r

			console.log(playerName, "anti-harass max escalation", maxE)

			if (maxE < 1) {
				continue
			}
			// Ok, we think we can do something here. 
			for (let enemyRoomName of enemyRoomsInRange) {
				Memory.combatManager.requestedMissions[MISSION_REMOTE_STAKEOUT_CAPPED][enemyRoomName] = Game.time
			}

			Memory.combatManager.harrassCounterAttackData[playerName] = Memory.combatManager.harrassCounterAttackData[playerName] || {}
			Memory.combatManager.harrassCounterAttackData[playerName].t = Game.time
			Memory.combatManager.harrassCounterAttackData[playerName].s = (Memory.combatManager.harrassCounterAttackData[playerName].s || 0)
			Memory.combatManager.harrassCounterAttackData[playerName].f = (Memory.combatManager.harrassCounterAttackData[playerName].f || 0)
			Memory.combatManager.harrassCounterAttackData[playerName].e = maxE

			// Cool off for a bit
			// Memory.stats.globalHarassTracking[playerName] = -Memory.stats.globalHarassTracking[playerName]
		}

		if (Memory.combatManager.requestedMissions[MISSION_REMOTE_STAKEOUT_CAPPED]) {			
			for (let targetRoomName in Memory.combatManager.requestedMissions[MISSION_REMOTE_STAKEOUT_CAPPED]) {
				if (Math.random() > 0.1) continue
				if (!Memory.rooms[targetRoomName]) continue
				if (!Memory.rooms[targetRoomName].owner) continue

				// Refresh it
				if (Game.time - Memory.combatManager.harrassCounterAttackData[Memory.rooms[targetRoomName].owner].t < 8000) {
					Memory.combatManager.requestedMissions[MISSION_REMOTE_STAKEOUT_CAPPED][targetRoomName] = Game.time
				}

				if (Game.time - Memory.combatManager.requestedMissions[MISSION_REMOTE_STAKEOUT_CAPPED][targetRoomName] > 2000) continue

				this.requestAntiHarassCappedStakeout(targetRoomName)
			}
		}
	},

	requestAntiHarassCappedStakeout : function(targetRoomName) {

		for (let mission of Memory.combatManager.currentMissions[MISSION_REMOTE_STAKEOUT_CAPPED]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("anti-harass stakeout doing A", targetRoomName)
					return 0
				}
			}
		}
		for (let mission of Memory.combatManager.currentMissions[MISSION_REMOTE_STAKEOUT]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("anti-harass stakeout doing B", targetRoomName)
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (Game.map.getRoomLinearDistance(room.name, targetRoomName) > 10) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, false, false, true)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, false, 10)
			if (dist >= 10) continue;

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_REMOTE_STAKEOUT_CAPPED]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}

			let maxE

			try {
				maxE = Memory.combatManager.harrassCounterAttackData[Memory.rooms[targetRoomName].owner].e
			}
			catch(e) {
				console.log("Grandfathered maxE")
				maxE = Memory.combatManager.harrassCounterAttackMaxEs[Memory.rooms[targetRoomName].owner]
			}

			var newMemory = (!currentMemory.type);
			let currentMission = new RemoteStakeOutCappedMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, maxE, true)

			if (currentMission.isActive()) {
				currentMission.requestSpawns();

				console.log(bestSourceRoom.name + " Launching anti-harass stakeout at " + targetRoomName)
				// Done it
				delete Memory.combatManager.requestedMissions[MISSION_REMOTE_STAKEOUT_CAPPED][targetRoomName]

				if (newMemory) Memory.combatManager.currentMissions[MISSION_REMOTE_STAKEOUT_CAPPED].push(currentMission.memory);
				return true;
			}
			console.log("anti-harass stakeout not active", targetRoomName)
			return false;
		}
		else {
			console.log("anti-harass stakeout no source room", targetRoomName)
		}
	},


	requestPicketMission : function(protectRoomName) {
		if (!Game.rooms[protectRoomName]) {
			console.log("RMP no room", protectRoomName)
			return 0;
		}
		let mem = Memory.rooms[protectRoomName];

		if (!mem) {
			console.log("RMP no mem", protectRoomName)
			return 0
		}

		if (mem.owner) {
			console.log("RMP owner", protectRoomName)
			return 0;
		}

		if (!mem.harassTracking) {
			console.log("RMP no harassTracking", protectRoomName)
			return 0;
		}

		if (scouting.isRoomWhiteListed(protectRoomName)) {
			console.log("RMP white", protectRoomName)
			return 0;
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_PICKET]) {
			if (mission.targetRoomName == protectRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("RMP doing", protectRoomName)
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (Game.map.getRoomLinearDistance(room.name, protectRoomName) > 4) {
				continue;
			}
			if (room.restrictDefensiveMissions(protectRoomName, false, false, false)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, protectRoomName, true)
			if (dist >= 4) continue;

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_PICKET]) {
				if (mission.targetRoomName == protectRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}

			var newMemory = (!currentMemory.type);
			let currentMission = new PicketMission(currentMemory || {}, bestSourceRoom.name, protectRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					console.log("RMP spawn fail", protectRoomName)
					return false;
				}

				console.log(bestSourceRoom.name + " Launching picket at " + protectRoomName)
				// Done it
				delete Memory.combatManager.requestedMissions[MISSION_PICKET][protectRoomName]

				if (newMemory) Memory.combatManager.currentMissions[MISSION_PICKET].push(currentMission.memory);
				return true;
			}
			console.log("RMP not active", protectRoomName)
			return false;
		}
		else {
			console.log("RMP no source", protectRoomName)
		}

	},

	requestConvoyTakedown : function(enemySpottedRoomName, dir) {
		let newMission = new ConvoyTakedownMission({}, "", enemySpottedRoomName, dir, true);
		if (!newMission.memory.interceptRoom) return

		for (var mission of Memory.combatManager.currentMissions[MISSION_CONVOY_TAKEDOWN]) {
			if (!mission.ID) continue;

			if (mission.interceptRoom == newMission.memory.interceptRoom) return;
		}


		// Ok, we have a new intercept room to work with, now actually bother to find a parent room.
		let minDist = 8;
		let bestRoom;
		for (let room of Game.myRooms) {
			if (Game.map.getRoomLinearDistance(room.name, newMission.memory.interceptRoom) < 8) {
				if (room.restrictOffensiveMissions(null, false, false, true)) continue;
				if (room.effectiveLevel < 7) continue;
				if (room.energyCapacityAvailable < 5400) continue
				let safeDist = safeRoute.getSafeRouteCost(room.name, newMission.memory.interceptRoom, false);
				if (safeDist < minDist) {
					minDist = safeDist;
					bestRoom = room;
				}
			}
		}

		if (!bestRoom) return;

		if (bestRoom) {
			newMission.memory.sourceRoomName = bestRoom.name;
			newMission.requestSpawns();

			Memory.combatManager.currentMissions[MISSION_CONVOY_TAKEDOWN].push(newMission.memory);
		}
	},

	requestSeason4ConvoyTrade : function(enemySpottedRoomName, dir) {
		if (!Memory.enableSeason4ConvoyTrade) return

		let newMission = new SeasonalConvoyTrade({}, "", enemySpottedRoomName, dir, true);
		if (!newMission.memory.ID) return
		if (!newMission.memory.interceptRoom) return

		for (var mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_CONVOY_TRADE]) {
			if (!mission.ID) continue;

			if (mission.interceptRoom == newMission.memory.interceptRoom) return;
		}


		// Ok, we have a new intercept room to work with, now actually bother to find a parent room.
		let minDist = 8;
		let bestRoom;

		// How long we have to intercept. 2 for spawning 100, dividing by 0.75 as a conservative "enemy moves half speed"
		let distCap = (Game.map.getRoomLinearDistance(enemySpottedRoomName, newMission.memory.interceptRoom) - 2) / 0.75

		for (let room of Game.myRooms) {
			let dist = Game.map.getRoomLinearDistance(room.name, newMission.memory.interceptRoom)
			if (dist < minDist && dist < distCap) {
				if (!room.terminal) {
					continue
				}

				let hasAnyResource = false
				for (let resource of newMission.memory.resources) {
					if (room.terminal.store[resource]) {
						hasAnyResource = true
						break
					}
				}

				if (!hasAnyResource) {
					continue
				}

				if (room.restrictOffensiveMissions(null, false, false, true)) continue;
				if (room.effectiveLevel < 7) continue;
				if (room.energyCapacityAvailable < 5400) continue
				let safeDist = safeRoute.getSafeRouteCost(room.name, newMission.memory.interceptRoom, false);
				if (safeDist < minDist && safeDist < distCap) {
					minDist = safeDist;
					bestRoom = room;
				}
			}
		}

		if (bestRoom) {
			newMission.memory.sourceRoomName = bestRoom.name;
			if (!newMission.requestSpawns()) {
				console.log("Season 4 convoy trade crapped out on launch")
				newMission.memory.ID = 0;
				newMission.cleanMemory();
			}
			else {
				Memory.combatManager.currentMissions[MISSION_SEASONAL_CONVOY_TRADE].push(newMission.memory);
			}

		}
		else {
			for (let room of Game.myRooms) {
				let dist = Game.map.getRoomLinearDistance(room.name, newMission.memory.interceptRoom)
				if (dist < minDist && dist < distCap) {
					if (room.restrictOffensiveMissions(null, false, false, true)) continue;
					if (room.effectiveLevel < 7 || !room.terminal || room.transferred || room.terminal.cooldown) continue;
					if (room.energyCapacityAvailable < 5400) continue
					let safeDist = safeRoute.getSafeRouteCost(room.name, newMission.memory.interceptRoom, false);
					if (safeDist < minDist && safeDist < distCap) {
						minDist = safeDist;
						bestRoom = room;
					}
				}
			}

			if (bestRoom) {
				console.log("Best room for convoy intercept didn't have resource", enemySpottedRoomName, dir)

				for (let resource of newMission.memory.resources) {
					if (bestRoom.terminal.store[resource]) {
						continue
					}
					for (let room of _.shuffle(Game.myRooms)) {
						if (room.terminal && !room.transferred && !room.terminal.cooldown) {
							let amount = Math.min(100, room.terminal.store[resource])

							if (amount) {
								let cost = Game.market.calcTransactionCost(amount, room.name, bestRoom.name)
								console.log(room.name, "sending", amount, resource, "to", bestRoom.name)

								room.terminal.send(resource, amount, bestRoom.name)
								global.inTickObject.energyExpenditures["terminalSeason4"]  = (global.inTickObject.energyExpenditures["terminalSeason4"] || 0) + cost

								room.transferred = 1
								bestRoom.transferred = 1
								break
							}							
						}
					}
				}

			}
			else {
				console.log("No best room for convoy intercept", enemySpottedRoomName, dir)
			}



		}
	},

	// A colony is in danger!
	// -1 is "won't spawn"
	// 0 is "don't need to spawn"
	// >0 is "spawning"

	requestDefenseMission : function(parentRoom, protectRoom) {
		// console.log(parentRoom, protectRoom, parentRoom == protectRoom, parentRoom.restrictDefensiveMissions(parentRoom == protectRoom, Game.myRooms.indexOf(protectRoom) != -1))

		// What are we up against?
		let etotalAttack = 0;
		let etotalAttackDamage = 0;
		let etotalRanged = 0;
		let etotalRangedDamage = 0;
		let etotalHeal = 0;
		let etotalWork = 0;
		let etotalBoosts = 0;
		let enemies = protectRoom.find2(FIND_HOSTILE_CREEPS).concat(protectRoom.find(FIND_HOSTILE_POWER_CREEPS));

		let invasion = true;
		let creepCount = 0;
		let friendlyCreepCount = 0;
		let enemyEarlyHalfMove = Infinity;
		for (let enemy of enemies) {
			if (enemy.ticksToLive < parentRoom.effectiveLevel * 30) continue;
			if (enemy.owner.username == "Source Keeper") {
				continue;
			}

			creepCount++;

			var combatParts = enemy.getBoostModifiedCombatParts(false, false);
			etotalAttack += combatParts.numAttack;
			etotalRanged += combatParts.numRanged;
			etotalHeal += combatParts.numHeal;
			etotalWork += combatParts.numWork;
			etotalBoosts += combatParts.numBoosts;

			if (etotalBoosts > 0) {
				let dpsParts = enemy.getBoostModifiedCombatParts(false, true);
				etotalAttackDamage += dpsParts.numAttack * ATTACK_POWER;
				etotalRangedDamage += dpsParts.numRanged * RANGED_ATTACK_POWER;
			}
			else {
				etotalAttackDamage += combatParts.numAttack * ATTACK_POWER;
				etotalRangedDamage += combatParts.numRanged * RANGED_ATTACK_POWER;
			}

			enemyEarlyHalfMove = Math.min(enemyEarlyHalfMove, enemy.getEarlyHalfMove());

			if (enemy.owner.username != "Invader") {
				invasion = false;
			}
		}


		if (creepCount == 0) {
			if (Math.random() < 0.1) console.log(parentRoom, "not spawning defense for", protectRoom, "as enemy creepCount == 0 (probably TTL too low)")
			return 0;
		}
		
		// if (!invasion && parentRoom.restrictDefensiveMissions(parentRoom == protectRoom, Game.myRooms.indexOf(protectRoom) != -1)) {
		// 	return false;
		// }

		var spawns = parentRoom.find(FIND_MY_SPAWNS);
		// Oh. Crap. Maybe send somebody in?
		if (spawns.length == 0) {
			console.log("Not spawning defense as no spawn")
			return -1;
		}

		var spawn = spawns[0];


		// Who do we have on it?
		var currentMission = {};
		var otherMissions = [];
		for (let type of [MISSION_REMOTE_DEFENSE, MISSION_ROOM_DEFENSE, MISSION_PICKET]) {
			for (var mission of Memory.combatManager.currentMissions[type]) {
				if (type == MISSION_REMOTE_DEFENSE && mission.type == MISSION_REMOTE_DEFENSE && mission.sourceRoomName == parentRoom.name && mission.targetRoomName == protectRoom.name) {
					currentMission = new RemoteDefenseMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_REMOTE_DEFENSE && mission.type == MISSION_REMOTE_DEFENSE && mission.sourceRoomName != parentRoom.name && mission.targetRoomName == protectRoom.name) {
					if (mission.ID != 0) {
						otherMissions.push(new RemoteDefenseMission(mission, mission.sourceRoomName, mission.targetRoomName, false));
					}
				}
				else if (type == MISSION_ROOM_DEFENSE && mission.type == MISSION_ROOM_DEFENSE && mission.sourceRoomName == parentRoom.name && mission.targetRoomName == protectRoom.name) {
					currentMission = new RoomDefenseMission(mission, mission.sourceRoomName, mission.targetRoomName, false);
				}
				else if (type == MISSION_ROOM_DEFENSE && mission.type == MISSION_ROOM_DEFENSE && mission.sourceRoomName != parentRoom.name && mission.targetRoomName == protectRoom.name) {
					// Ignore self defense for extra counting
					if (mission.sourceRoomName != mission.targetRoomName && mission.ID != 0) {
						otherMissions.push(new RoomDefenseMission(mission, mission.sourceRoomName, mission.targetRoomName, false));
					}
				}
				// else if (type == MISSION_PICKET && mission.targetRoomName == protectRoom.name && mission.ID) {
				// 	otherMissions.push(new PicketMission(mission, mission.sourceRoomName, mission.targetRoomName, false));
				// }
			}
		}

		let type;
		if (protectRoom.isMyRoom()) {
			type = MISSION_ROOM_DEFENSE;
		}
		else {
			type = MISSION_REMOTE_DEFENSE
		}

		var firstLaunchTick = false;
		if (!currentMission.memory || !currentMission.isActive()) {
			firstLaunchTick = true;
			var newMemory = !currentMission.memory;
			currentMission = currentMission || {};
			if (type == MISSION_ROOM_DEFENSE) {
				currentMission = new RoomDefenseMission(currentMission.memory || {}, parentRoom.name, protectRoom.name, true)
			}
			else {
				currentMission = new RemoteDefenseMission(currentMission.memory || {}, parentRoom.name, protectRoom.name, true)
			}

			// console.log(currentMission, type, currentMission.isActive())

			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				if (newMemory) {
					Memory.combatManager.currentMissions[type].push(currentMission.memory);
				}
			}
			else {
				console.log("Not spawning defense as", type, "activate failed")
				// Constructing it didn't activate it which means it's refusing. Let it refuse.
				return -1;
			}
		}

		if (protectRoom != parentRoom && type == MISSION_ROOM_DEFENSE && currentMission.assignedCreeps.length + currentMission.spawningCreeps.length > enemies.length * 3) {
			if (Math.random() < 0.1) console.log("Not spawning defense as too many friendly creeps", currentMission.assignedCreeps.length + currentMission.spawningCreeps.length, enemies.length * 3)
			return -1;
		}

		let numMaxedAttack = 0;
		let numMaxedRanged = 0;
		let numAnyAttack = 0;
		let numAnyRanged = 0;

		var ftotalAttack = 0;
		var ftotalRanged = 0;
		var ftotalHeal = 0;

		let allMissions = otherMissions.concat([currentMission])

		for (let mission of allMissions) {
			for (let creepName of mission.assignedCreeps) {
				var creep = Game.creeps[creepName];
				// Oh no! He's dead!
				if (!creep) {
					// console.log("Dead creep in combatManager assignedCreeps")
				}
				else {
					var combatParts = creep.getBoostModifiedCombatParts(creep.spawning ? false : true);

					let attackBoostTier = 0;
					let rangedBoostTier = 0;
					let healBoostTier = 0;

					if (!creep.hasBoost() && creep.room.labs.length > 0) {
						for (let boost in creep.memory.targetBoosts) {
							if (boost == RESOURCE_UTRIUM_HYDRIDE) {
								attackBoostTier = 1;
							}
							else if (boost == RESOURCE_UTRIUM_ACID) {
								attackBoostTier = 2;
							}
							else if (boost == RESOURCE_CATALYZED_UTRIUM_ACID) {
								attackBoostTier = 3;
								if (creep.body.length >= MAX_CREEP_SIZE - 1) {
									numMaxedAttack++;
								}
							}
							else if (boost == RESOURCE_KEANIUM_OXIDE) {
								rangedBoostTier = 1;
							}
							else if (boost == RESOURCE_KEANIUM_ALKALIDE) {
								rangedBoostTier = 2;
							}
							else if (boost == RESOURCE_CATALYZED_KEANIUM_ALKALIDE) {
								rangedBoostTier = 3;
								if (creep.body.length >= MAX_CREEP_SIZE - 1) {
									numMaxedRanged++;
								}
							}
							else if (boost == RESOURCE_LEMERGIUM_OXIDE) {
								healBoostTier = 1;
							}
							else if (boost == RESOURCE_LEMERGIUM_ALKALIDE) {
								healBoostTier = 2;
							}
							else if (boost == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) {
								healBoostTier = 3;
							}
						}
					}

					let mod = 1;

					if (type == MISSION_ROOM_DEFENSE && creep.room.name != protectRoom.name) {
						mod = 1.0 / safeRoute.getSafeRouteCost(creep.room.name, protectRoom.name, true);
					}

					friendlyCreepCount += mod;

					ftotalAttack += combatParts.numAttack * (1 + attackBoostTier) * mod;
					ftotalRanged += combatParts.numRanged * (1 + rangedBoostTier) * mod;
					ftotalHeal += combatParts.numHeal * (1 + healBoostTier) * mod;
				}

			}

			for (let creepName of mission.spawningCreeps) {
				var body = mission.getSpawningBody(creepName);
				var boosts = mission.getSpawningBoosts(creepName);

				friendlyCreepCount++

				let numAttack = 0;
				let numRanged = 0;
				let numHeal = 0;
				let numTough = 0;
				let numExtra = 0;

				let attackBoostTier = 0;
				let rangedBoostTier = 0;
				let healBoostTier = 0;
				for (let boost in boosts) {
					if (boost == RESOURCE_UTRIUM_HYDRIDE) {
						attackBoostTier = 1;
					}
					else if (boost == RESOURCE_UTRIUM_ACID) {
						attackBoostTier = 2;
					}
					else if (boost == RESOURCE_CATALYZED_UTRIUM_ACID) {
						attackBoostTier = 3;
					}
					else if (boost == RESOURCE_KEANIUM_OXIDE) {
						rangedBoostTier = 1;
					}
					else if (boost == RESOURCE_KEANIUM_ALKALIDE) {
						rangedBoostTier = 2;
					}
					else if (boost == RESOURCE_CATALYZED_KEANIUM_ALKALIDE) {
						rangedBoostTier = 3;
					}
					else if (boost == RESOURCE_LEMERGIUM_OXIDE) {
						healBoostTier = 1;
					}
					else if (boost == RESOURCE_LEMERGIUM_ALKALIDE) {
						healBoostTier = 2;
					}
					else if (boost == RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE) {
						healBoostTier = 3;
					}
				}


				for (var bodyPart of body) {
					if (bodyPart == ATTACK) {
						numAttack += attackBoostTier + 1;
					}
					else if (bodyPart == RANGED_ATTACK) {
						numRanged += rangedBoostTier + 1;
					}
					else if (bodyPart == HEAL) {
						numHeal += healBoostTier + 1;
					}
					else if (bodyPart == TOUGH) {
						numTough += 1;
					}
					else {
						numExtra += 1;
					}
				}

				if (body.length >= MAX_CREEP_SIZE - 1 && attackBoostTier == 3) {
					numMaxedAttack++;
				}
				else if (numAttack) {
					numAnyAttack++;
				}

				if (body.length >= MAX_CREEP_SIZE - 1 && rangedBoostTier == 3) {
					numMaxedRanged++;
				}
				else if (numRanged) {
					numAnyRanged++;
				}


				let extra = Math.max(0, numExtra - numAttack - numRanged - numHeal);
				numTough += extra;

				numAttack *= (1 + numTough * 0.05);
				numRanged *= (1 + numTough * 0.05);
				numHeal *= (1 + numTough * 0.05);

				let mod = 1;

				if (type == MISSION_ROOM_DEFENSE && mission.sourceRoomName != protectRoom.name) {
					mod = 1.0 / safeRoute.getSafeRouteCost(mission.sourceRoomName, protectRoom.name, true);
				}

				ftotalAttack += numAttack;
				ftotalRanged += numRanged;
				ftotalHeal += numHeal;
			}
		}

		if (type == MISSION_REMOTE_DEFENSE) {
			let friends = protectRoom.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false);
			// Assume our friends count for 75%. They'll probably want to be doing something else
			// but they should fight

			for (let friend of friends) {
				if (currentMission.assignedCreeps.includes(friend.name)) continue;
				if (friend.ticksToLive < 60) continue;

				if (friend.memory.role == "soloKeeperMiner" ) continue;
				// if (friend.memory.role == "keeperGuard2" || friend.memory.role == "soloKeeperMiner" ) continue;

				var combatParts = friend.getBoostModifiedCombatParts(false);
				ftotalAttack += combatParts.numAttack * 0.75;
				ftotalRanged += combatParts.numRanged * 0.75;
				ftotalHeal += combatParts.numHeal * 0.75;

				friendlyCreepCount += 0.75;
			}

			let maxTTL = 0;
			if (invasion) {
				for (let enemy of enemies) {
					if (enemy.owner.username == "Source Keeper") {
						continue;
					}
					maxTTL = Math.max(enemy.ticksToLive, maxTTL);
				}
				// We're not killing them quick enough, clearly.
				if (maxTTL >= 400 && maxTTL < 1200) {
					if (maxTTL < 800) {
						etotalHeal *= 2 - (800 - maxTTL) / 400
						etotalRanged *= 2 - (800 - maxTTL) / 400
						etotalAttack *= 2 - (800 - maxTTL) / 400						
					}
					else {
						etotalHeal *= 2 - (maxTTL - 800) / 400
						etotalRanged *= 2 - (maxTTL - 800) / 400
						etotalAttack *= 2 - (maxTTL - 800) / 400						
					}
				}
			}



			if (etotalHeal == 0 && etotalRanged == 0 && etotalAttack == 0) {
				if (ftotalRanged == 0) {
					for (var i = 0; i < enemies.length; i++) {
						var body = [];
						var j = 0
						for (; j < Math.floor(parentRoom.energyCapacityAvailable / (BODYPART_COST[MOVE] + BODYPART_COST[RANGED_ATTACK])) && i < enemies.length; j++) {							
							body.push(RANGED_ATTACK)
							if (j) i++;
						}
						for (var k = 0; k < j; k++) {
							body.push(MOVE)
						}

						var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

						if (idleCreep) {
							currentMission.assignCreep(idleCreep);
						}
						else {
							currentMission.spawnCreep("ranged", body, {}, spawn)
						}
					}
					if (Math.random() < 0.1) console.log("Basic spawn")
					return 1;
				}
				else {
					// console.log("No enemy")
					return 0;
				}
			}

			// Weak room attacks also have a remote defense mission which can get tagged on. Don't reinforce if there's towers
			if (Memory.rooms[protectRoom.name].owner && Memory.rooms[protectRoom.name].owner != util.getMyName()) {
				let towers = protectRoom.getTowers();

				let towerEnergy = 0;
				for (let tower of towers) {
					towerEnergy += tower.energy;
				}

				if (towerEnergy > 200) {
					console.log("Owner")
					_.pull(Memory.rooms[parentRoom.name].protectRooms, protectRoom.name);
					return 0;
				}
			}

			let neededMargin = invasion ? 1.1 : (protectRoom.memory.DT > 1.5 ? (1.2 + protectRoom.memory.DT / 8) : 1.2);

			let fRangedHeur = 0.9 * ftotalRanged + ftotalAttack * 0.1;
			let fAttackHeur = 0.9 * ftotalAttack + ftotalRanged * 0.1;

			var needMoreDefenders = true;
			// We at least match them
			if (fAttackHeur >= etotalAttack && fRangedHeur >= etotalRanged && ftotalHeal >= etotalHeal) {
				// But do we beat them? Want to beat them in all classes and have a 10% margin.
				// var difference = (ftotalAttack - etotalAttack) + (ftotalRanged - etotalRanged) + (ftotalHeal - etotalHeal);
				var margin = (fAttackHeur + fRangedHeur + ftotalHeal) / (etotalAttack + etotalRanged + etotalHeal + 1e-9)

				// console.log(margin, fAttackHeur, fRangedHeur, ftotalHeal, etotalAttack, etotalRanged, etotalHeal)

				if (margin > neededMargin) {
					needMoreDefenders = false;
				}
			}

			// We are not an effective team!
			if (needMoreDefenders) {

				// Can we actually spawn more
				if (!invasion && parentRoom.restrictDefensiveMissions(parentRoom == protectRoom, protectRoom.isMyRoom())) {
					console.log(parentRoom, "restrictDefensiveMissions")
					return -1;
				}

				// No point in healing if they can't kill us. Even one ranged is dangerous though.
				var needHeals = etotalAttack >= 5 || etotalRanged >= 1

				// Beat them across the board by at least 10%.
				let neededAttack;
				let neededRanged;
				let neededHeal;

				let buildStrat = Math.floor((protectRoom.memory.cS || constants.COMBAT_STRATEGY_DEFAULT) / 100);

				let totalHealRequired = Math.min((etotalAttack * ATTACK_POWER + etotalRanged * RANGED_ATTACK_POWER) / (2 * HEAL_POWER), etotalHeal * neededMargin + Math.floor((etotalAttack + etotalRanged) / 20));

				if (buildStrat == constants.REMOTE_DEFENSE_BUILD_STRATEGY_RANGED) {
					neededAttack = 0;
					neededRanged = Math.ceil((etotalRanged + etotalAttack * (130. / 180.) + 6 * totalHealRequired / 10) * neededMargin - (fRangedHeur + fAttackHeur));
					neededHeal = Math.ceil(totalHealRequired - ftotalHeal);
				}
				else if (buildStrat == constants.REMOTE_DEFENSE_BUILD_STRATEGY_ATTACK) {
					neededAttack = Math.ceil((etotalRanged * (180. / 130.) + etotalAttack + 6 * totalHealRequired / 30) * neededMargin - (fRangedHeur + fAttackHeur));
					neededRanged = 0;
					neededHeal = Math.ceil(totalHealRequired - ftotalHeal);
				}
				else if (buildStrat == constants.REMOTE_DEFENSE_BUILD_STRATEGY_COUNTER_RANGED) {
					neededAttack = Math.ceil((etotalAttack * neededMargin - fAttackHeur + 6 * totalHealRequired / 30) * 0.5);
					neededRanged = Math.ceil((etotalRanged + etotalAttack * 0.5 + 6 * totalHealRequired / 10) * neededMargin - (fRangedHeur + fAttackHeur * 0.5));
					neededHeal = Math.ceil(totalHealRequired - ftotalHeal);
				}
				else if (buildStrat == constants.REMOTE_DEFENSE_BUILD_STRATEGY_COUNTER_ATTACK) {
					neededAttack = Math.ceil((etotalRanged * 0.5 + etotalAttack + 6 * totalHealRequired / 30) * neededMargin - (fRangedHeur * 0.5 + fAttackHeur));
					neededRanged = Math.ceil((etotalRanged * neededMargin - fRangedHeur + 6 * totalHealRequired / 10) * 0.5);
					neededHeal = Math.ceil(totalHealRequired - ftotalHeal);
				}
				else {
					neededAttack = Math.ceil(etotalAttack * neededMargin - fAttackHeur + 6 * totalHealRequired / 30);
					neededRanged = Math.ceil(etotalRanged * neededMargin - fRangedHeur + 6 * totalHealRequired / 10);
					neededHeal = Math.ceil(totalHealRequired - ftotalHeal);
				}

				let attackBeforeMove;

				if (etotalRanged > etotalAttack) {
					attackBeforeMove = true;
				}
				else {
					attackBeforeMove = false;
				}

				if (ftotalHeal == 0 && neededHeal == 0 && etotalAttack + etotalRanged > 2) {
					neededHeal = 1;
				}

				if (neededAttack == 0 && neededHeal == 0 && neededRanged == 0) {
					// console.log("No needed", neededAttack, neededHeal, neededRanged)
					return 0;
				}

				// Deal with invasions slightly differently. Invaders don't do well against ATTACK parts. Healers don't do well against RMA
				// So take half of the heal and put it in ranged, and half of the ranged and put it in attack
				if (invasion) {
					if (neededRanged >= 2) {
						neededAttack += Math.ceil(neededRanged * .25)
						neededRanged = Math.ceil(neededRanged * .75)
					}
					if (neededHeal >= 2) {
						neededRanged += neededHeal * 1.25
						neededAttack += neededHeal * 1.25
						neededHeal = Math.ceil(neededHeal / 2)
					}
					// if (enemies.length <= 2) {
					// 	neededAttack *= 1.125;
					// 	neededRanged *= 1.125;
					// 	neededHeal *= 1.125;
					// }
					// Invader squad code sucks
					if (enemies.length > 3) {
						neededAttack = Math.ceil(neededAttack * 0.85);
						neededRanged = Math.ceil(neededRanged * 0.85);
						neededHeal = Math.ceil(neededHeal * 0.85);
					}
					if (enemies.length > 4) {
						neededAttack = Math.ceil(neededAttack * 0.85);
						neededRanged = Math.ceil(neededRanged * 0.85);
						neededHeal = Math.ceil(neededHeal * 0.85);
					}
					// We seem to spawn too much for these fights.
					// Cut it down for the intial response then have a second wave spawn.
					if ((protectRoom.keeperRoom || protectRoom.centreRoom) && (firstLaunchTick || currentMission.memory.pending == true)) {
						neededAttack = Math.ceil(neededAttack * 0.85);
						neededRanged = Math.ceil(neededRanged * 0.85);
						neededHeal = Math.ceil(neededHeal * 0.85);
					}
				}

				// Try not to create tiny bodies.

				// Don't screw about if we're big.
				if (!invasion || enemies.length > 2) {					
					if (parentRoom.effectiveLevel == 7) {
						if (neededAttack <= 2) neededAttack *= 2;
						if (neededRanged <= 2) neededRanged *= 2;
						if (neededHeal <= 2) neededHeal *= 2;
					}
					else if (parentRoom.effectiveLevel == 8) {
						if (neededAttack <= 4) neededAttack *= 2;
						if (neededRanged <= 4) neededRanged *= 2;
						if (neededHeal <= 3) neededHeal *= 2;
					}
				}
				var maxNeeded = Math.max(neededAttack, neededRanged, neededHeal)
				// var bodyMinimum = maxNeeded / 2;


				if (neededAttack > 0 && neededAttack < maxNeeded / 2) neededAttack = Math.ceil(maxNeeded / 2);
				if (neededRanged > 0 && neededRanged < maxNeeded / 3) neededRanged = Math.ceil(maxNeeded / 3);
				if (neededHeal > 0   && neededHeal < maxNeeded / 4)   neededHeal = Math.ceil(maxNeeded / 4);

				let mod = 1;
				if (!invasion && util.areRoomsConnected(parentRoom.name, protectRoom.name)) {
					mod *= 1.5;
				}

				if (parentRoom.effectiveLevel <= 3) {
					mod *= 0.5;
				}

				if (protectRoom.controller && protectRoom.controller.owner && !protectRoom.controller.my) {
					mod *= 4;
				}

				// if (!invasion) {					
					if (parentRoom.memory.spawnUtilization < 0.7) {
						mod *= 1.1;
					}
					if (parentRoom.memory.spawnUtilization < 0.5) {
						mod *= 1.1;
					}
					if (parentRoom.memory.spawnUtilization < 0.3) {
						mod *= 1.1;
					}
				// }


				if (parentRoom.previousRoomDefenseNoSpawn && !invasion) {
					mod *= 1 + 0.5 * parentRoom.previousRoomDefenseNoSpawn;
				}

				if (Memory.rooms[protectRoom.name].DT > 1 && !invasion) {
					neededAttack = Math.round(neededAttack * (1 + (Memory.rooms[protectRoom.name].DT - 1) / 2))
					neededRanged = Math.round(neededRanged * (1 + (Memory.rooms[protectRoom.name].DT - 1) / 2))
					neededHeal = Math.round(neededHeal * (1 + (Memory.rooms[protectRoom.name].DT - 1) / 2))
				}

				neededAttack = Math.max(0, neededAttack)
				neededRanged = Math.max(0, neededRanged)
				neededHeal = Math.max(0, neededHeal)


				// console.log(protectRoom.name)
				// console.log(neededAttack, neededRanged, neededHeal)
				// console.log(etotalAttack, etotalRanged, etotalHeal)
				// console.log(ftotalAttack, ftotalRanged, ftotalHeal)

				// It's just not worth the effort!
				if (!invasion && neededAttack * 130 + neededRanged * 200 + neededHeal * 300 > mod * parentRoom.energyCapacityAvailable * 4) {
					if (Math.random() < 0.1) console.log("RemoteDefenseMission not launching because energy required is too large", parentRoom, protectRoom, neededAttack * 130 + neededRanged * 200 + neededHeal * 300, mod * parentRoom.energyCapacityAvailable * 4)
					return -1;
				}

				let maxSize;

				if (parentRoom.effectiveLevel == 7) {
					maxSize = MAX_CREEP_SIZE;
					mod *= 1.;
				}
				else if (parentRoom.effectiveLevel == 8) {
					maxSize = MAX_CREEP_SIZE;
					mod *= 1.1;
				}
				else {
					maxSize = MAX_CREEP_SIZE * parentRoom.effectiveLevel / 7;
					mod *= 0.75;
				}

				if (!invasion && (neededAttack + neededRanged + neededHeal) * 2 > mod * maxSize * 2) {
					if (Math.random() < 0.1) console.log("RemoteDefenseMission not launching because creep body count is too high", parentRoom, protectRoom, (neededAttack + neededRanged + neededHeal) * 2, mod * maxSize * 2)
					return -1;
				}

				if (neededAttack <= 0 && neededRanged <= 0 && neededHeal <= 0) {
					// console.log("No needed v2", neededAttack, neededHeal, neededRanged)
					return 0
				}

				if (Game.time - (global.lastFlushIdleCreeps || 0) > 50 + Math.random() * 10) {				
					global.lastFlushIdleCreeps = Game.time
					global.inTickObject.flushIdleCreeps = true
				}


				if (Memory.rooms[protectRoom.name] && 
					Memory.rooms[protectRoom.name].reservedBy && 
					Memory.rooms[protectRoom.name].reserveTicksToEnd && 
					(!Memory.swc || !global.whiteList.includes(Memory.rooms[protectRoom.name].reservedBy)) &&
					Memory.rooms[protectRoom.name].reservedBy != util.getMyName()) {
					console.log("RemoteDefenseMission as a capture", parentRoom.name, protectRoom.name);
					neededAttack *= 1.5;
					neededRanged *= 1.5;
					neededHeal *= 1.5;

					currentMission.setAsCapture();
				}
				else {
					console.log("RemoteDefenseMission", parentRoom.name, protectRoom.name)
				}


				// Doesn't deal with max creep size, don't use it for doing stuff like that. Really just using it here to stop spamming a couple of big creeps with 20 small ones.
				let myApproxNumCreeps = (neededAttack * (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]) + neededRanged * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) + neededHeal * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])) / parentRoom.energyCapacityAvailable;

				if (myApproxNumCreeps + friendlyCreepCount > (invasion ? 6 : 4) * creepCount) {
					if (Math.random() < 0.1) console.log("RemoteDefenseMission not launching because creep count is too high compared to theirs", parentRoom, protectRoom, myApproxNumCreeps, friendlyCreepCount, creepCount)
					return - 1;
				}

				// Bump it up a bit. Small creeps suck
				if (neededAttack && neededAttack < (etotalAttack + etotalRanged) / 4) {
					neededAttack = (etotalAttack + etotalRanged) / 4
				}
				if (neededRanged && neededRanged < (etotalAttack + etotalRanged) / 4) {
					neededRanged = (etotalAttack + etotalRanged) / 4
				}

				console.log(neededAttack, neededRanged, neededHeal)
				console.log(etotalAttack, etotalRanged, etotalHeal)
				console.log(ftotalAttack, ftotalRanged, ftotalHeal)

				neededAttack = Math.ceil(neededAttack);
				neededRanged = Math.ceil(neededRanged);
				neededHeal = Math.ceil(neededHeal);

				var energyAvailable = parentRoom.energyCapacityAvailable;

				// Pick idle creeps from local first.
				idleCreepManager.sortIdleCreepsByDistanceToRoom(parentRoom.name)

				// Firstly, can we make a generic creep. Small ones only as this role sucks
				if (neededAttack > 0 && neededRanged > 0 && neededHeal > 0 && neededAttack + neededRanged + neededHeal <= MAX_CREEP_SIZE / 5) {
					var cost = neededAttack * 130 + neededRanged * 200 + neededHeal * 300;

					if (cost <= parentRoom.energyCapacityAvailable) {
						console.log("d", cost, neededAttack, neededRanged, neededHeal, numRequired)

						let body = [];
						for (var i = 0; i < neededRanged; i++) {
							body.push(RANGED_ATTACK)
						}

						if (attackBeforeMove) {
							for (var i = 0; i < neededAttack; i++) {
								body.push(ATTACK)
							}
							for (var i = 0; i < neededAttack + neededRanged + neededHeal; i++) {
								body.push(MOVE)
							}
						}
						else {
							for (var i = 0; i < neededAttack + neededRanged + neededHeal; i++) {
								body.push(MOVE)
							}
							for (var i = 0; i < neededAttack; i++) {
								body.push(ATTACK)
							}
						}

						for (var i = 0; i < neededHeal; i++) {
							body.push(HEAL)
						}

						var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

						// It's covered
						neededAttack = 0;
						neededRanged = 0;
						neededHeal = 0;

						if (idleCreep) {
							currentMission.assignCreep(idleCreep);
						}
						else {
							currentMission.spawnCreep("defender", body, {}, spawn)
						}
					}
				}


				if (neededRanged > 0 && neededHeal > 0 &&
					neededRanged + neededHeal <= MAX_CREEP_SIZE / 2) {
					var cost = neededRanged * 200 + neededHeal * 300;

					console.log("rh", cost, neededRanged, numRequired)

					if (cost <= parentRoom.energyCapacityAvailable) {
						let body = [];
						for (var i = 0; i < neededRanged; i++) {
							body.push(RANGED_ATTACK)
						}
						for (var i = 0; i < neededRanged + neededHeal; i++) {
							body.push(MOVE)
						}
						for (var i = 0; i < neededHeal; i++) {
							body.push(HEAL)
						}

						neededRanged = 0;
						neededHeal = 0;

						var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

						if (idleCreep) {
							currentMission.assignCreep(idleCreep);
							console.log("Assign idle")
						}
						else {
							currentMission.spawnCreep("ranged", body, {}, spawn, invasion)
							console.log("spawnCreep", body)
						}
					}
				}

				// Specialized it is
				if (neededRanged > 0) {
					// Ranged take heals whether we need it or not
					var cost = neededRanged * 200 + Math.floor(neededRanged / 4) * 300;

					var numRequired = Math.max(Math.ceil(cost / parentRoom.energyCapacityAvailable), Math.ceil((2 * neededRanged + 2 * Math.floor(neededRanged / 4)) / (MAX_CREEP_SIZE)))

					// Squads are hard, give us 20% more if we can do it
					if (numRequired > 1 && !invasion) {
						neededRanged *= 1.2;
					}

					var bodyCount = Math.floor(neededRanged / numRequired);

					if (bodyCount + Math.floor(bodyCount / 4) > MAX_CREEP_SIZE / 2) {
						bodyCount = Math.floor((MAX_CREEP_SIZE / 2) / 1.25);
					}
					if (bodyCount * 200 + Math.floor(bodyCount / 4) * 300 > parentRoom.energyCapacityAvailable || numRequired > 1) {
						bodyCount = Math.floor(Math.min((MAX_CREEP_SIZE / 2) / 1.25, parentRoom.energyCapacityAvailable / (200 + 0.25 * 300)));
					}

					console.log("ranged", cost, neededRanged, numRequired, bodyCount)

					let healDiff = 0;
					let rangedDiff = 0;

					// Special path for max size. Add 1 heal if able.
					if (bodyCount == Math.floor((MAX_CREEP_SIZE / 2) / 1.25)) {
						if (parentRoom.energyCapacityAvailable >= 5600) {
							healDiff = 1;
							rangedDiff = -1;
						}
					}

					for (var i = 0; i < numRequired; i++) {
						var body = [];

						let moveCount = 0;

						if (enemyEarlyHalfMove) {
							let earlyRanged = Math.min(bodyCount + rangedDiff, enemyEarlyHalfMove);
							let lateRanged = bodyCount + rangedDiff - earlyRanged;

							for (var j = 0; j < earlyRanged; j++) {
								body.push(RANGED_ATTACK)
							}


							if (bodyCount > 1) {
								for (var j = 0; j < bodyCount - 1; j++) {
									body.push(MOVE)
									moveCount++;
								}
							}
							else {
								body.push(MOVE)
								moveCount++;
							}

							for (var j = 0; j < Math.floor(bodyCount / 4); j++) {
								body.push(MOVE)
								moveCount++;
							}

							for (var j = 0; j < lateRanged; j++) {
								body.push(RANGED_ATTACK)
							}
							for (var j = 0; j < Math.floor(bodyCount / 4) + healDiff; j++) {
								body.push(HEAL)
							}

						}
						else {
							for (var j = 0; j < bodyCount + rangedDiff; j++) {
								body.push(RANGED_ATTACK)
							}
							if (bodyCount > 1) {
								for (var j = 0; j < bodyCount - 1; j++) {
									body.push(MOVE)
									moveCount++;
								}
							}
							else {
								body.push(MOVE)
								moveCount++;
							}
							for (var j = 0; j < Math.floor(bodyCount / 4); j++) {
								body.push(MOVE)
								moveCount++;
							}
							for (var j = 0; j < Math.floor(bodyCount / 4) + healDiff; j++) {
								body.push(HEAL)
							}
						}
						while (moveCount < body.length / 2) {
							body.push(MOVE)
							moveCount++;
						}


						// console.log(cost, neededRanged, numRequired, bodyCount, body)

						var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

						if (idleCreep) {
							neededRanged -= idleCreep.getNumOfBodyPart(RANGED_ATTACK)
							neededHeal -= idleCreep.getNumOfBodyPart(HEAL)

							currentMission.assignCreep(idleCreep);
							console.log("Assign idle")							
						}
						else {
							neededRanged -= bodyCount;
							neededHeal -= Math.floor(bodyCount / 4);
							currentMission.spawnCreep("ranged", body, {}, spawn, invasion)
							console.log("Spawn creep", body)
						}

						if (neededRanged <= 0 && neededHeal <= 0) {
							break
						}
					}
				}
				if (neededAttack > 0) {
					var cost = neededAttack * 130;

					var numRequired = Math.max(Math.ceil(cost / parentRoom.energyCapacityAvailable), Math.ceil(2 * neededAttack / (MAX_CREEP_SIZE)))

					// Squads are hard, give us 20% more if we can do it
					if (numRequired > 1 && !invasion) {
						neededAttack *= 1.2;
					}
					var bodyCount = Math.floor(neededAttack / numRequired);

					if (bodyCount > MAX_CREEP_SIZE / 2) {
						bodyCount = MAX_CREEP_SIZE / 2;
					}
					if (bodyCount * 130 > parentRoom.energyCapacityAvailable || numRequired > 1) {
						bodyCount = Math.floor(Math.min(MAX_CREEP_SIZE / 2, parentRoom.energyCapacityAvailable / 130));
					}


					// console.log(cost, numRequired, bodyCount, Math.floor(cost / parentRoom.energyCapacityAvailable), Math.ceil(2 * neededAttack / (MAX_CREEP_SIZE)))

					for (var i = 0; i < numRequired; i++) {
						var body = [];
						if (attackBeforeMove) {
							for (var j = 0; j < bodyCount; j++) {
								body.push(ATTACK)
							}
							for (var j = 0; j < bodyCount; j++) {
								body.push(MOVE)
							}
						}
						else {
							for (var j = 0; j < bodyCount - 1; j++) {
								body.push(MOVE)
							}
							for (var j = 0; j < bodyCount; j++) {
								body.push(ATTACK)
							}
							body.push(MOVE)
						}

						neededAttack -= bodyCount;

						var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

						if (idleCreep) {
							if (neededAttack >= 0) {
								neededAttack += bodyCount
								neededAttack -= idleCreep.getNumOfBodyPart(ATTACK)
							}

							currentMission.assignCreep(idleCreep);
						}
						else {
							currentMission.spawnCreep("tank", body, {}, spawn, invasion)

						}

						if (neededAttack <= 0) {
							break
						}
					}
				}
				if (neededHeal > 0) {
					var cost = neededHeal * 300;

					var numRequired = Math.max(Math.ceil(cost / parentRoom.energyCapacityAvailable), Math.ceil(2 * neededHeal / (MAX_CREEP_SIZE)))

					// Squads are hard, give us 20% more if we can do it
					if (numRequired > 1 && !invasion) {
						neededHeal *= 1.2;
					}
					var bodyCount = Math.floor(neededHeal / numRequired);

					if (bodyCount > MAX_CREEP_SIZE / 2) {
						bodyCount = MAX_CREEP_SIZE / 2;
					}
					if (bodyCount * 300 > parentRoom.energyCapacityAvailable || numRequired > 1) {
						bodyCount = Math.floor(Math.min(MAX_CREEP_SIZE / 2, parentRoom.energyCapacityAvailable / 300));
					}

					for (var i = 0; i < numRequired; i++) {
						var body = [];
						for (var j = 0; j < bodyCount - 1; j++) {
							body.push(MOVE)
						}
						for (var j = 0; j < bodyCount; j++) {
							body.push(HEAL)
						}
						body.push(MOVE)

						neededHeal -= bodyCount;

						var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

						if (idleCreep) {
							if (neededHeal >= 0) {
								neededHeal += bodyCount
								neededHeal -= idleCreep.getNumOfBodyPart(HEAL)
							}

							currentMission.assignCreep(idleCreep);
						}
						else {
							currentMission.spawnCreep("healer", body, {}, spawn, invasion)
						}

						if (neededHeal <= 0) {
							break
						}
					}
				}


				return 1
			}
		}
		else if (type == MISSION_ROOM_DEFENSE) {
			let friends = protectRoom.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false);

			for (let friend of friends) {
				if (currentMission.assignedCreeps.indexOf(friend.name) >= 0) continue;
				if (friend.ticksToLive < 60) continue;

				var combatParts = friend.getBoostModifiedCombatParts(false);
				ftotalAttack += combatParts.numAttack;
				ftotalRanged += combatParts.numRanged;
				ftotalHeal += combatParts.numHeal;
			}


			let currentCombatCreeps = protectRoom.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false)

			let numCurrentCombatCreeps = 0
			for (let combatCreep of currentCombatCreeps) {
				if (combatCreep.mem.targetRoom == protectRoom.name) {
					numCurrentCombatCreeps++
				}
			}

			// let numCurrentCombatCreeps = currentCombatCreeps.length;

			let numMaxSizeCombatCreeps = 0
			for (let combatCreep of currentCombatCreeps) {
				if (combatCreep.body.length == MAX_CREEP_SIZE) {
					numMaxSizeCombatCreeps++
				}
			}


			let mod = 0.8;

			let campedOut = false;
			// 1.995 is about 3000 ticks.
			if (parentRoom != protectRoom && protectRoom.memory.DT > 1.995) {
				campedOut = true;
				mod = 1.5;
			}

			let buildUp = false;
			if (parentRoom != protectRoom && protectRoom.effectiveLevel < 3) {
				buildUp = true;
				mod = 1.5;
			}


			var needMoreDefenders = true;

			let numTowers = protectRoom.getMyActiveTowers();

			ftotalRanged += Math.round(150 * numTowers.length / 10);
			ftotalAttack += Math.round(150 * numTowers.length / 30);
			ftotalHeal += Math.round(100 * numTowers.length / 12);

			etotalRanged += Math.round((protectRoom.memory.attackScore || 0) / 30000.);
			etotalAttack += Math.round((protectRoom.memory.attackScore || 0) / 30000.);

			if (parentRoom == protectRoom && (parentRoom.controller.safeMode || 0) > 300) {
				etotalRanged = 1;
				etotalAttack = 1;
				etotalHeal = 0;
			}

			// We at least match them
			let eRangedHeur = (etotalRanged + etotalAttack * 0.125 + etotalWork * 0.125) * mod;
			let eAttackHeur = (etotalRanged * 0.25 + etotalAttack + etotalWork * 0.5) * mod;
			let eHealHeur = etotalHeal * 0.25 * mod;

			let fRangedHeur = 0.9 * ftotalRanged + ftotalAttack * 0.1;
			let fAttackHeur = 0.9 * ftotalAttack + ftotalRanged * 0.1;

			// Beat them across the board by at least 10%.
			let neededRanged = Math.ceil(eRangedHeur - fRangedHeur);
			let neededAttack = Math.ceil(eAttackHeur - fAttackHeur);
			let neededHeal = 0;
			// console.log(protectRoom, parentRoom)
			if ((parentRoom != protectRoom && protectRoom.effectiveLevel < protectRoom.controller.level) || protectRoom.breached) {
				if (campedOut || buildUp) {
					neededHeal = Math.ceil(etotalHeal * 1.1 - ftotalHeal);
				}
				else {
					neededHeal += Math.round(0.5 * (etotalRangedDamage + etotalAttackDamage) / 12. - ftotalHeal);
					if (neededHeal > (etotalRanged + etotalAttack) / 3) {
						neededHeal = Math.floor((etotalRanged + etotalAttack) / 3);
					}
				}
			}
			// Oh, this is a reclaim. If it's swampy don't bother with ATTACK so much
			if (protectRoom.effectiveLevel < 3) {
				let swampRatio = roomIntel.getSwampRatio(protectRoom.name)
				let wallRatio = roomIntel.getWallRatio(protectRoom.name)

				let realsR = swampRatio / (1 - wallRatio);
				neededRanged = Math.round(neededRanged * (1 + realsR));
				neededAttack = Math.round(neededAttack * (1 - realsR));
			}

			// We'll get called again in the future, just limit how much is added with each call
			if (!campedOut && !buildUp && parentRoom != protectRoom) {
				neededAttack = Math.min(neededAttack, MAX_CREEP_SIZE);
				neededRanged = Math.min(neededRanged, MAX_CREEP_SIZE);
				neededHeal = Math.min(neededHeal, MAX_CREEP_SIZE);
			}

			// Don't spawn tiny creeps to run half way across the map.
			// This should be covered by child defense if it's really needed.
			if (parentRoom != protectRoom) {
				if (neededAttack < 10) neededAttack = 0;
				if (neededRanged < 10) neededRanged = 0;
				if (neededHeal < 10) neededHeal = 0;
			}

			// There's too much stuff there.
			if (parentRoom != protectRoom && neededHeal > MAX_CREEP_SIZE * 2) {
				neededHeal = MAX_CREEP_SIZE * 2
			}

			if (parentRoom == protectRoom && numCurrentCombatCreeps > enemies.length * 2) {
				console.log("Not spawning defense A")
				return -1
			}
			else if (numMaxedAttack + numMaxedRanged > enemies.length * 2) {
				console.log("Not spawning defense B")
				return -1
			}
			else if (numMaxSizeCombatCreeps > enemies.length * 2) {
				console.log("Not spawning defense C")
				return -1
			}


			console.log("Defense", parentRoom, neededAttack, neededRanged, neededHeal)

			// We are not an effective team!
			if (neededAttack > 0 || neededRanged > 0 || neededHeal > 0) {
				if (Game.time - (global.lastFlushIdleCreeps || 0) > 50 + Math.random() * 10) {				
					global.lastFlushIdleCreeps = Game.time
					global.inTickObject.flushIdleCreeps = true
				}

				if (!invasion && parentRoom.restrictDefensiveMissions(parentRoom == protectRoom, protectRoom.isMyRoom())) {
					console.log("Not spawning defense restrictDefensiveMissions")
					return -1;
				}

				let useBoosts = eAttackHeur > MAX_CREEP_SIZE || eRangedHeur > MAX_CREEP_SIZE || eHealHeur > MAX_CREEP_SIZE;

				if (parentRoom != protectRoom && (safeRoute.getSafeRouteCost(parentRoom.name, protectRoom.name, true) > 5 || protectRoom.effectiveLevel < 4)) {
					useBoosts = false;
				}


				// We keep getting attacked. Make slow guys.
				let halfMoveAttack = false;
				let halfMoveRanged = false;
				if (parentRoom == protectRoom &&
					parentRoom.effectiveLevel >= 4 &&
					roomIntel.getSwampRatio(protectRoom.name) < 0.2 &&
					(protectRoom.memory.attackScore > 10000 || protectRoom.memory.DT > 0.25) &&
					eAttackHeur > 2 * MAX_CREEP_SIZE &&
					eHealHeur > 2 * MAX_CREEP_SIZE) {
					halfMoveAttack = true;
				}

				// Should be enough for 25R at RCL 7 - 5600 * .9 / 200 = 25.2
				// If I lose an extension though...
				var energyAvailable = parentRoom.energyCapacityAvailable * .9;

				// TODO: Enable this when I can actually test it
				let rangedBoost;
				let attackBoost;
				let moveBoost;
				let moveScaleAttack = 1;
				let moveScaleRanged = 1;
				let moveScaleHeal = 1;
				if (useBoosts) {
					attackBoost = parentRoom.getAvailableBoost(util.isAttackBoost, 100 * LAB_BOOST_MINERAL);
					if (attackBoost) {
						neededAttack = Math.ceil(neededAttack / BOOSTS[ATTACK][attackBoost][ATTACK]);
					}
					rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 100 * LAB_BOOST_MINERAL);
					if (rangedBoost) {
						neededRanged = Math.ceil(neededRanged / BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"]);
					}


					moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 100 * LAB_BOOST_MINERAL);
					// TOOD: Make it work for non T3 moveBoost
					if (moveBoost) {
						// Assuming T3 move, do we have the energy? T1/T2 cost less energy, so that's fine.
						let approxNumMove = MAX_CREEP_SIZE / (halfMoveAttack ? 10 : 5);
						if (attackBoost && energyAvailable >= approxNumMove * BODYPART_COST[MOVE] + (MAX_CREEP_SIZE - approxNumMove) * BODYPART_COST[ATTACK]) {
							moveScaleAttack = 1 + util.getBoostTier(moveBoost);
						}
						approxNumMove = MAX_CREEP_SIZE / (halfMoveRanged ? 10 : 5);
						if (rangedBoost && energyAvailable >= approxNumMove * BODYPART_COST[MOVE] + (MAX_CREEP_SIZE - approxNumMove) * BODYPART_COST[RANGED_ATTACK]) {
							moveScaleRanged = 1 + util.getBoostTier(moveBoost);
						}
						approxNumMove = MAX_CREEP_SIZE / 5;
						if (energyAvailable >= approxNumMove * BODYPART_COST[MOVE] + (MAX_CREEP_SIZE - approxNumMove) * BODYPART_COST[HEAL]) {
							moveScaleHeal = 1 + util.getBoostTier(moveBoost);
						}
					}

				}

				console.log(parentRoom, protectRoom, eAttackHeur, eRangedHeur, neededAttack, neededRanged, neededHeal, useBoosts, attackBoost, rangedBoost, moveBoost, moveScaleAttack, moveScaleRanged)
				// if (parentRoom != protectRoom) {
				// 	console.log("RETURN IN ROOM OTHER DEFENSE", parentRoom, protectRoom)
				// 	return;
				// }
				// if (parentRoom.name != "W13S25" && protectRoom != "W13S25") {
					// console.log("RETURN IN ROOM SELF DEFENSE", parentRoom.name)
					// return;
				// }
				let freeSpawns = 0
				for (let spawn of parentRoom.spawns) {
					if (!spawn.spawning) {
						freeSpawns++
					}
				}


				function updateMoveCountAndRequired(numRequired, neededX, eXHeur, bodyPart, halfMove, moveScale) {
					moveScale = moveScale || 1

					let moveCount;
					let costPerNParts;
					if (halfMove) {
						costPerNParts = 2 * moveScale * BODYPART_COST[bodyPart] + BODYPART_COST[MOVE];
						let cost = (neededX / (2 * moveScale)) * costPerNParts;
						numRequired = Math.min(numRequired, Math.max(Math.ceil(cost / energyAvailable), Math.ceil((1 + 2 * moveScale) * neededX / (2 * moveScale * MAX_CREEP_SIZE) - 0.0001)))

						if (numRequired > 1 || eXHeur > MAX_CREEP_SIZE) {
							moveCount = Math.floor(energyAvailable / costPerNParts)
						}
						else {
							moveCount = Math.ceil(neededX / (2 * moveScale));
						}
						moveCount = Math.min(Math.floor(MAX_CREEP_SIZE / (1 + 2 * moveScale)), moveCount);
						numRequired = Math.min(numRequired, neededX / (moveCount * moveScale * 2));
					}
					else {
						costPerNParts = moveScale * BODYPART_COST[bodyPart] + BODYPART_COST[MOVE];
						let cost = (neededX / moveScale) * costPerNParts;
						numRequired = Math.min(numRequired, Math.max(Math.ceil(cost / energyAvailable), Math.ceil((1 + moveScale) * neededX / (moveScale * MAX_CREEP_SIZE) - 0.0001)))

						if (numRequired > 1 || eXHeur > MAX_CREEP_SIZE) {
							moveCount = Math.floor(energyAvailable / costPerNParts)
						}
						else {
							moveCount = Math.ceil(neededX / moveScale);
						}

						moveCount = Math.min(Math.floor(MAX_CREEP_SIZE / (1 + moveScale)), moveCount);
						numRequired = Math.min(numRequired, neededX / (moveScale * moveCount));
					}

					// Hmm. Needed? I don't think so. It should only fire on numRequired == 1, which should already do this.
					if (costPerNParts * moveCount > energyAvailable) {
						moveCount = Math.floor(energyAvailable / costPerNParts)
					}

					return {moveCount: moveCount, numRequired: numRequired}
				}

				// console.log(neededRanged, (etotalRanged + etotalAttack + etotalWork) * 1.1 - ftotalRanged)
				// console.log(ftotalRanged, etotalRanged, etotalAttack, etotalWork)
				if (neededAttack > 0 && freeSpawns > 0) {
					let numRequired = Math.max((protectRoom.numActiveAttackRamparts || 0), 1) - (parentRoom == protectRoom ? numMaxedAttack : Math.max(numMaxedAttack, Math.round(numAnyAttack / 2)));

					console.log(numRequired, "attackers", attackBoost, numCurrentCombatCreeps)

					if (useBoosts || parentRoom != protectRoom) {
						numRequired = Math.min(enemies.length, numRequired);
					}
					else {
						numRequired = Math.min(Math.round(enemies.length * 1.5), numRequired);
					}

					console.log(numRequired, "attackers", attackBoost, numCurrentCombatCreeps)

					if (protectRoom.memory.rampartCount) {
						numRequired = Math.min(numRequired, protectRoom.memory.rampartCount)
					}

					console.log(numRequired, "attackers", attackBoost, numCurrentCombatCreeps)

					if (parentRoom == protectRoom) {
						numRequired = Math.min(numRequired, enemies.length - numCurrentCombatCreeps)
					}

					console.log(numRequired, "attackers", attackBoost, numCurrentCombatCreeps)


					if (numRequired > 0 && (numRequired < 10 || attackBoost)) {
						let moveCount;
						let o;
						o = updateMoveCountAndRequired(numRequired, neededAttack, eAttackHeur, ATTACK, halfMoveAttack, 1)

						moveCount = o.moveCount;
						numRequired = o.numRequired;

						// Grab idles first. Can have half move or full move.
						for (var i = 0; i < numRequired; i++) {
							// Half move grab
							if (halfMoveAttack) {
								let body = [];
								for (var j = 0; j < moveCount - 1; j++) {
									body.push(MOVE)
								}
								// Max body size, or some bonus extra. Both work!
								if (energyAvailable - 130 >= moveCount * 210) {
									body.push(MOVE);
									body.push(ATTACK);
								}

								for (var j = 0; j < 2 * moveCount; j++) {
									body.push(ATTACK)
								}

								body.push(MOVE)

								var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom, halfMoveAttack);

								if (idleCreep && idleCreep.room == protectRoom && idleCreep.memory.forceRamparter) {
									if (!attackBoost) {
										neededAttack -= idleCreep.getNumOfBodyPart(ATTACK)
									}
									currentMission.assignCreep(idleCreep);
								}
							}
							if (neededAttack <= 0) {
								break
							}

							// Regular move grab
							let body = [];
							for (var j = 0; j < moveCount - 1; j++) {
								body.push(MOVE)
							}
							for (var j = 0; j < moveCount; j++) {
								body.push(ATTACK)
							}
							body.push(MOVE)

							var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

							if (idleCreep) {
								// Slightly off if creep is bigger
								if (!attackBoost) {
									neededAttack -= idleCreep.getNumOfBodyPart(ATTACK)
								}
								currentMission.assignCreep(idleCreep);
							}

							if (neededAttack <= 0) {
								break
							}
						}

						// Ok, we've got rid of some with idle creeps, now spawn more.
						o = updateMoveCountAndRequired(numRequired, neededAttack, eAttackHeur, ATTACK, halfMoveAttack, moveScaleAttack)

						moveCount = o.moveCount;
						numRequired = o.numRequired;

						// console.log(numRequired, moveCount)


						for (var i = 0; i < Math.min(numRequired, freeSpawns); i++) {
							let body = [];
							let boosts = {};
							if (halfMoveAttack) {
								for (var j = 0; j < Math.ceil(moveCount / 2); j++) {
									body.push(MOVE)
									if (moveBoost && moveScaleAttack > 1) {
										boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
									}
								}

								// Fill 'er up
								if (numRequired > 1 || eAttackHeur > MAX_CREEP_SIZE / 2) {
									let projectedBodyLength = 2 * moveCount * moveScaleAttack + moveCount;
									let creepCost = moveCount * BODYPART_COST[MOVE] + 2 * moveCount * moveScaleAttack * BODYPART_COST[ATTACK];

									if (moveScaleAttack > 1 && projectedBodyLength + 3 <= MAX_CREEP_SIZE && creepCost + 2 * BODYPART_COST[ATTACK] + BODYPART_COST[MOVE] <= energyAvailable) {
										body.push(ATTACK)
										body.push(ATTACK)

										if (attackBoost) {
											boosts[attackBoost] = (boosts[attackBoost] || 0) + 2;
										}
										body.push(MOVE)
										boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;

										projectedBodyLength += 3;
										creepCost += 2 * BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]

									}

									// Try this code when can test
									// for (let fill = 2; fill <= 4; fill++) {										
									// 	if (moveScaleAttack >= fill && projectedBodyLength + fill + 1 <= MAX_CREEP_SIZE && creepCost + fill * BODYPART_COST[ATTACK] + BODYPART_COST[MOVE] <= energyAvailable) {
									// 		for (let iFill = 0; iFill < fill; iFill++) {												
									// 			body.push(ATTACK)

									// 			if (attackBoost) {
									// 				boosts[attackBoost] = (boosts[attackBoost] || 0) + 2;
									// 			}
									// 			projectedBodyLength++
									// 			creepCost += BODYPART_COST[ATTACK]
									// 		}
									// 		body.push(MOVE)
									// 		boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;

									// 		projectedBodyLength++;
									// 		creepCost += BODYPART_COST[MOVE]

									// 	}
									// }


									while (projectedBodyLength + 2 <= MAX_CREEP_SIZE && creepCost + BODYPART_COST[ATTACK] + BODYPART_COST[MOVE] <= energyAvailable) {
										body.push(ATTACK)
										if (attackBoost) {
											boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
										}
										body.push(MOVE)

										projectedBodyLength += 2;
										creepCost += BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]
									}
								}

								for (var j = 0; j < 2 * moveCount * moveScaleAttack; j++) {
									body.push(ATTACK)
									if (attackBoost) {
										boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
									}
								}

								for (var j = 0; j < Math.floor(moveCount / 2); j++) {
									body.push(MOVE)
									if (moveBoost && moveScaleAttack > 1) {
										boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
									}
								}

								neededAttack -= 2 * moveCount * moveScaleAttack;
								currentMission.spawnCreep("tank", body, boosts, spawn, {"forceRamparter": 1, "boostOnDanger": 1})
							}
							else {
								if (parentRoom != protectRoom) {
									for (var j = 0; j < moveCount; j++) {
										body.push(ATTACK)
										if (attackBoost && moveCount > (MAX_CREEP_SIZE / 2) * .75) {
											boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
										}
									}
									for (var j = 0; j < moveCount; j++) {
										body.push(MOVE)
									}
								}
								else {
									// This code is not awfully good nor creates very good bodies
									// But I'm not under attack reliably enough to want to change it much
									for (var j = 0; j < Math.floor(moveCount / 2); j++) {
										body.push(MOVE)
										if (moveBoost && moveScaleAttack > 1) {
											boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
										}
									}

									let currentNumAttack = moveCount * moveScaleAttack;
									let currentNumMove = moveCount;


									// Fill 'er up
									if (numRequired > 1 || eAttackHeur > MAX_CREEP_SIZE / 2) {
										let projectedBodyLength = moveCount * moveScaleAttack + moveCount;
										let creepCost = moveCount * BODYPART_COST[MOVE] + moveCount * moveScaleAttack * BODYPART_COST[ATTACK];

										while (projectedBodyLength + 2 <= MAX_CREEP_SIZE && creepCost + BODYPART_COST[MOVE] + BODYPART_COST[ATTACK] <= energyAvailable) {
											if (currentNumAttack + 1 > currentNumMove * moveScaleAttack) {
												body.push(MOVE)
												if (moveBoost && moveScaleAttack > 1) {
													boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
												}
												projectedBodyLength += 1;
												currentNumMove += 1;
												creepCost += BODYPART_COST[MOVE]
											}


											body.push(ATTACK)
											if (attackBoost) {
												boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
											}

											projectedBodyLength += 1;
											currentNumAttack += 1;
											creepCost += BODYPART_COST[ATTACK]
										}

										if (projectedBodyLength + 1 <= MAX_CREEP_SIZE && currentNumAttack + 1 <= currentNumMove * moveScaleAttack && creepCost + BODYPART_COST[ATTACK] <= energyAvailable) {
											body.push(ATTACK)
											if (attackBoost) {
												boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
											}

											projectedBodyLength += 1;
											currentNumAttack += 1;
											creepCost += BODYPART_COST[ATTACK]
										}

									}

									for (var j = 0; j < moveCount * moveScaleAttack; j++) {
										body.push(ATTACK)
										if (attackBoost) {
											boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
										}
									}
									for (var j = 0; j < Math.ceil(moveCount / 2); j++) {
										body.push(MOVE)
										if (moveBoost && moveScaleAttack > 1) {
											boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
										}
									}
								}
								neededAttack -= moveCount * moveScaleAttack;
								currentMission.spawnCreep("tank", body, boosts, spawn, {"boostOnDanger": 1})
							}
						}

						freeSpawns -= Math.min(numRequired, freeSpawns)
					}

				}


				if (neededRanged > 0 && freeSpawns > 0) {
					let numRequired = Math.max((protectRoom.numActiveRangedRamparts || 0), 1) - (parentRoom == protectRoom ? numMaxedRanged : Math.max(numMaxedRanged, Math.round(numAnyRanged / 2)));
					console.log(numRequired, "ranged", rangedBoost, numCurrentCombatCreeps)

					if (useBoosts || parentRoom != protectRoom) {
						numRequired = Math.min(enemies.length, numRequired);
					}
					else {
						numRequired = Math.min(Math.round(enemies.length * 1.5), numRequired);
					}
					console.log(numRequired, "ranged", rangedBoost, numCurrentCombatCreeps)

					if (protectRoom.memory.rampartCount) {
						numRequired = Math.min(numRequired, protectRoom.memory.rampartCount)
					}

					console.log(numRequired, "ranged", rangedBoost, numCurrentCombatCreeps)

					if (parentRoom == protectRoom) {
						numRequired = Math.min(numRequired, enemies.length - numCurrentCombatCreeps)
					}

					console.log(numRequired, "ranged", rangedBoost, numCurrentCombatCreeps)

					if (numRequired > 0 && (numRequired < 10 || rangedBoost)) {
						let moveCount;
						let o;
						o = updateMoveCountAndRequired(numRequired, neededRanged, eRangedHeur, RANGED_ATTACK, false, 1)

						moveCount = o.moveCount;
						numRequired = o.numRequired;

						// Grab idles first. Can have half move or full move.
						for (var i = 0; i < numRequired; i++) {
							// Half move grab
							/*if (halfMoveRanged) {
								let body = [];
								for (var j = 0; j < moveCount - 1; j++) {
									body.push(MOVE)
								}
								// Max body size, or some bonus extra. Both work!
								if (energyAvailable - 130 >= moveCount * 210) {
									body.push(MOVE);
									body.push(ATTACK);
								}

								for (var j = 0; j < 2 * moveCount; j++) {
									body.push(ATTACK)
								}

								body.push(MOVE)

								var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom, halfMoveRanged);

								if (idleCreep && idleCreep.room == protectRoom && idleCreep.memory.forceRamparter) {
									// Slightly off if creep is bigger
									if (!rangedBoost) {
										neededRanged -= 2 * moveCount;
									}
									currentMission.assignCreep(idleCreep);
								}
							}*/

							// Regular move grab
							let body = [];
							for (var j = 0; j < moveCount - 1; j++) {
								body.push(MOVE)
							}
							for (var j = 0; j < moveCount; j++) {
								body.push(RANGED_ATTACK)
							}
							body.push(MOVE)

							var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

							if (idleCreep) {
								// Slightly off if creep is bigger
								if (!rangedBoost) {
									neededRanged -= idleCreep.getNumOfBodyPart(RANGED_ATTACK);
								}
								currentMission.assignCreep(idleCreep);
							}

							if (neededRanged <= 0) {
								break
							}
						}

						// Ok, we've got rid of some with idle creeps, now spawn more.
						o = updateMoveCountAndRequired(numRequired, neededRanged, eRangedHeur, RANGED_ATTACK, false, moveScaleRanged)

						moveCount = o.moveCount;
						numRequired = o.numRequired;

						for (var i = 0; i < Math.min(numRequired, freeSpawns); i++) {
							let body = [];
							let boosts = {};
							if (halfMoveRanged) {
								for (var j = 0; j < Math.ceil(moveCount / 2); j++) {
									body.push(MOVE)
								}

								// Max body size, or some bonus extra. Both work!
								if (energyAvailable - 200 >= moveCount * 350) {
									body.push(MOVE);
									body.push(RANGED_ATTACK);
									if (rangedBoost) {
										boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
									}

									neededRanged -= 1;
								}

								for (var j = 0; j < 2 * moveCount; j++) {
									body.push(RANGED_ATTACK)
									if (rangedBoost) {
										boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
									}
								}

								for (var j = 0; j < Math.floor(moveCount / 2); j++) {
									body.push(MOVE)
								}

								neededRanged -= 2 * moveCount;
								currentMission.spawnCreep("ranged", body, boosts, spawn, {"forceRamparter": 1, "boostOnDanger": 1})
							}
							else {
								if (parentRoom != protectRoom) {
									for (var j = 0; j < moveCount; j++) {
										body.push(RANGED_ATTACK)
										if (rangedBoost && useBoosts) {
											boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
										}
									}
									for (var j = 0; j < moveCount; j++) {
										body.push(MOVE)
									}
								}
								else {
									for (var j = 0; j < Math.floor(moveCount / 2); j++) {
										body.push(MOVE)
										if (moveBoost && moveScaleRanged > 1) {
											boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
										}
									}
									// Fill 'er up
									if (numRequired > 1 || eRangedHeur > MAX_CREEP_SIZE / 2) {
										let projectedBodyLength = moveCount * moveScaleRanged + moveCount;
										let creepCost = moveCount * BODYPART_COST[MOVE] + moveCount * moveScaleRanged * BODYPART_COST[RANGED_ATTACK];

										while (projectedBodyLength + 2 <= MAX_CREEP_SIZE && creepCost + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE] <= energyAvailable) {
											body.push(RANGED_ATTACK)
											body.push(MOVE)
											if (rangedBoost) {
												boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
											}

											projectedBodyLength += 2;
											creepCost += BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]
										}
									}

									for (var j = 0; j < moveCount * moveScaleRanged; j++) {
										body.push(RANGED_ATTACK)
										if (rangedBoost) {
											boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
										}
									}
									for (var j = 0; j < Math.ceil(moveCount / 2); j++) {
										body.push(MOVE)
										if (moveBoost && moveScaleRanged > 1) {
											boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
										}
									}
								}
								neededRanged -= moveCount * moveScaleRanged;
								currentMission.spawnCreep("ranged", body, boosts, spawn, {"boostOnDanger": 1})
							}
						}
					}
				}

				/*if (neededHeal > 0 && freeSpawns > 0) {
					var cost = neededHeal * 300;

					neededHeal = Math.max(neededHeal, Math.ceil(0.5 * energyAvailable / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])));

					let numRequired = Math.max(Math.ceil(cost / energyAvailable), Math.ceil(2 * neededHeal / (MAX_CREEP_SIZE)))

					numRequired = Math.min(Math.round(enemies.length * 1.5), numRequired);

					if (parentRoom == protectRoom) {
						numRequired = Math.min(numRequired, enemies.length - numCurrentCombatCreeps * 2)
					}


					if (numRequired > 0 && (numRequired < 10 || healBoost)) {
						let bodyCount = Math.floor(neededHeal / numRequired);

						if (numRequired > 1) {
							bodyCount = Math.min(Math.floor(MAX_CREEP_SIZE / 2), Math.floor(energyAvailable / 300))
						}

						if (bodyCount > Math.floor(MAX_CREEP_SIZE / 2)) {
							bodyCount = Math.floor(MAX_CREEP_SIZE / 2);
						}
						if (300 * bodyCount > energyAvailable) {
							bodyCount = Math.floor(energyAvailable / 300)
						}

						// Grab idles first:
						for (var i = 0; i < numRequired; i++) {
							let body = [];
							for (var j = 0; j < bodyCount; j++) {
								body.push(MOVE)
							}
							for (var j = 0; j < bodyCount; j++) {
								body.push(HEAL)
							}


							var idleCreep = idleCreepManager.getIdleCreepForBody(body, parentRoom);

							if (idleCreep) {
								neededHeal -= idleCreep.getNumOfBodyPart(HEAL);
								currentMission.assignCreep(idleCreep);
							}

							if (neededHeal <= 0) {
								break
							}
						}

						// Ok, we've got rid of some with idle creeps, now spawn more.
						cost = neededHeal * 300;
						numRequired = Math.max(Math.ceil(cost / energyAvailable), Math.ceil(2 * neededHeal / (MAX_CREEP_SIZE)))
						numRequired = Math.min(Math.round(enemies.length * 1.5), numRequired);

						bodyCount = Math.floor(neededHeal / numRequired);
						if (bodyCount > Math.floor(MAX_CREEP_SIZE / 2)) {
							bodyCount = Math.floor(MAX_CREEP_SIZE / 2);
						}
						if (300 * bodyCount > energyAvailable) {
							bodyCount = Math.floor(energyAvailable / 300)
						}

						for (var i = 0; i < numRequired; i++) {
							let body = [];
							let boosts = {};
							for (var j = 0; j < bodyCount - 1; j++) {
								body.push(MOVE)
							}
							for (var j = 0; j < bodyCount; j++) {
								body.push(HEAL)
							}

							body.push(MOVE)

							neededHeal -= bodyCount;

							// currentMission.spawnCreep("healer", body, boosts, spawn)
						}
					}
				}*/


				if (parentRoom != protectRoom && protectRoom.controller && protectRoom.controller.my && protectRoom.controller.ticksToDowngrade < 2000) {
					spawn.addPrioritySpawn("controllerRescuer", {targetRoom: protectRoom.name});
				}
			}
		}
		return 0;
	},

	requestRamboDefenseMission : function(parentRoom, protectRoomNames) {
		if (parentRoom.restrictDefensiveMissions(false, false, true)) {
			return false;
		}
		// Who do we have on it?
		var currentMission = {};
		for (var mission of Memory.combatManager.currentMissions[MISSION_REMOTE_RAMBO_DEFENSE]) {
			if (mission.sourceRoomName == parentRoom.name) {
				currentMission = new RemoteRamboDefenseMission(mission, mission.sourceRoomName, protectRoomNames, false);
				break;
			}
		}

		if (!currentMission.memory || !currentMission.isActive()) {
			var newMemory = !currentMission.type;
			currentMission = currentMission || {};
			currentMission = new RemoteRamboDefenseMission(currentMission.memory || {}, parentRoom.name, protectRoomNames, true)

			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				if (currentMission.requestSpawns()) {
					if (newMemory) {
						Memory.combatManager.currentMissions[MISSION_REMOTE_RAMBO_DEFENSE].push(currentMission.memory);
					}
					return true;
				}
				else {
					currentMission.ID = 0;
					currentMission.cleanMemory();
					return false;
				}
			}
			else {
				// Constructing it didn't activate it which means it's refusing. Let it refuse.
				return false;
			}
		}

	},

	requestChildRamboDefenseMission : function(parentRoom, childRoomName, protectRoomNames) {
		if (parentRoom.restrictDefensiveMissions(false, false, true)) {
			return false;
		}
		// Who do we have on it?
		var currentMission = {};
		for (var mission of Memory.combatManager.currentMissions[MISSION_REMOTE_CHILD_RAMBO_DEFENSE]) {
			if (mission.sourceRoomName == parentRoom.name && mission.childRoomName == childRoomName) {
				currentMission = new ChildRemoteRamboDefenseMission(mission, mission.sourceRoomName, mission.childRoomName, protectRoomNames, false);
				break;
			}
		}

		if (!currentMission.memory || !currentMission.isActive()) {
			var newMemory = !currentMission.type;
			// currentMission = currentMission || {};
			currentMission = new ChildRemoteRamboDefenseMission(currentMission.memory || {}, parentRoom.name, childRoomName, protectRoomNames, true)

			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				if (currentMission.requestSpawns()) {
					if (newMemory) {
						Memory.combatManager.currentMissions[MISSION_REMOTE_CHILD_RAMBO_DEFENSE].push(currentMission.memory);
					}
					return true;
				}
				else {
					currentMission.ID = 0;
					currentMission.cleanMemory();
					return false;
				}
			}
			else {
				// Constructing it didn't activate it which means it's refusing. Let it refuse.
				return false;
			}
		}

	},


	// Ooh, should we kill something? Annoy someone? Lets figure that out!
	getOffensiveMissionPriorities : function(roomName, gclEstimate, safeModeEstimates, nonMMOFactors, damagedFraction, highestHate, missionCountAgainstPlayer) {
		let mem = Memory.rooms[roomName];
		if (!mem) {
			return undefined;
		}
		if (!util.isRoomAccessible(roomName)) {
			return undefined;
		}
		// if (!Memory.botArena && !mem.creepVisited && mem.rcl < 8) {
		// 	if ((mem.firstObserveTime || 0) - Date.now() < constants.FIRST_OBSERVE_TO_OUT_OF_NEWBIE_TIME) {
		// 		return undefined;
		// 	}
		// }

		if (scouting.isRoomWhiteListed(roomName)) {
			return undefined;
		}

		if (Memory.economyArena && Memory.stats.hateCounter[mem.owner] < 100000) {
			return undefined;
		}

		// GCL 5+ or intershard or hated
		// ... or RCL 8
		// ... or no ramparts
		if (Game.shard.name == "shard3" && (mem.owner == "chieaina" || (mem.rcl < 8 && (mem.rampHP || mem.rcl < 6)))) {
			let enoughGCL = 0;

			if (Memory.gclEstimates[mem.owner] >= 5) {
				enoughGCL = 1;
			}
			else if (Memory.stats.hateCounter[mem.owner] >= 10000) {
				enoughGCL = 1;
			}
			else {				
				for (let shardName of global.activeShards) {
					if (shardName == Game.shard.name) continue;
					let isMemory = interShardMemoryManager.getMem(shardName);

					if (isMemory.gclEstimates[mem.owner]) {
						enoughGCL = 1;
						break
					}
				}
			}

			// if (mem.owner == "ODiesel" && Date.now() < 1630450799000 && mem.rcl < 8) {
			// 	return undefined
			// }



			if (!enoughGCL) {
				return undefined
			}
		}


		let t = Game.cpu.getUsed()

		var targetRoomMissionPriorities = [];

		let hatePercentage = intelAI.getHatePercentage(mem.owner);
		let hatePriority = Math.sqrt(hatePercentage);
		let gclPriority = (gclEstimate[mem.owner] || 0) / (Memory.enemyRooms.length);

		if (Memory.stats.hateCounter[mem.owner]) {
			hatePriority += Math.log(1 + Memory.stats.hateCounter[mem.owner]) / 40
		}

		if (Memory.timedRound) {
			gclPriority *= 10
		}
		else if (Memory.botArena) {
			gclPriority *= 5
		}

		let safeModePriority1 = 0;
		let safeModePriority2 = 0;

		if ((mem.safeModeCooldown || 0) > 10000 || safeModeEstimates[mem.owner] == 1) {
			safeModePriority1 = 1;
		}
		// Can't safe mode right now. Might be able to soon though.
		else if ((mem.cttd || Infinity) < CONTROLLER_DOWNGRADE[mem.rcl] / 2 - CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD) {
			safeModePriority1 = 0.25;
		}

		if ((mem.safeMode || 0) > 1000) {
			safeModePriority2 = 1;
		}

		mem.hostileCreepOwners = mem.hostileCreepOwners || []
		mem.twrX = mem.twrX || []

		let groupPriority = 0;
		if (mem.hostileCreepOwners.length >= 2) {
			groupPriority = -mem.hostileCreepOwners.length * 3;
		}
		else if (mem.hostileCreepOwners.length == 1) {
			if (mem.hostileCreepOwners[0] != mem.owner) {
				groupPriority = -2 * 3;
			}
		}

		let attackFocusPriority = 0;
		if (Memory.attackFocus[mem.owner]) {
			// attackFocusPriority = (Memory.attackFocus[mem.owner] / 10) * (Memory.botArena ? 2 : 1) * Math.sqrt(Memory.attackFocus[mem.owner] / _.sum(Memory.attackFocus));
			attackFocusPriority = Math.sqrt(Memory.attackFocus[mem.owner]) * (Memory.botArena ? 2 : 1) * Math.sqrt(Memory.attackFocus[mem.owner] / _.sum(Memory.attackFocus));
		}
		
		let coordinatePriority = missionCountAgainstPlayer[mem.owner] || 0;

		global.roomAssaultCounts[roomName] = global.roomAssaultCounts[roomName] || {};
		let ongoingAssaultPriority = (global.roomAssaultCounts[roomName].assaultCount || 0);
		let ongoingLowEPriority = (global.roomAssaultCounts[roomName].lowECount || 0);

		let ongoingStakeOut = (global.inTickObject.activeStakeOuts || new Set()).has(roomName);

		// If we have a room close to the target, hit it harder.
		let closestRoomPriority;
		if (Memory.season) {
			closestRoomPriority = ((mem.closestRoomRange || 10) - 9)	
		}
		else {
			closestRoomPriority = ((mem.closestRoomRange || 5) - 4)		
		}

		if (closestRoomPriority < 0) {
			// Square it. Careful on that sign! Range 1 then becomes -9, range 2: -4, range 3: -1, range 4: 0, range 5: 1, range 6: 2
			closestRoomPriority = -closestRoomPriority * closestRoomPriority
		}

		let damagedRoomPriority = 0;
		// Because of... reasons... calling in this order is faster
		let damagedRoomsFraction = intelAI.getPlayerDamagedRoomsFraction(mem.owner)
		let numEnemyRooms = intelAI.getPlayerNumRooms(mem.owner)

		if (numEnemyRooms > 1) {
			damagedRoomPriority = damagedRoomsFraction < 1 ? damagedRoomsFraction : 0
		}

		let enemyLowEnergyPriority1 = 0;
		if (Memory.privateServer) {
			let energyPerRoom
			let energyEstimate = intelAI.getEnergyEstimate(mem.owner)
	 
		 	// Empire-wide low energy/room? Push a bit...
		 	// If they literally have no energy we go 4x harder.
			energyPerRoom = energyEstimate / (numEnemyRooms || 1)
			if (Memory.maxRoomLevel <= 6) {
				if (energyPerRoom < 25000) {
					enemyLowEnergyPriority1 = 1 - Math.sqrt((25000 - energyPerRoom) / 25000)
				}
			}
			else {				
				if (energyPerRoom < 50000) {
					enemyLowEnergyPriority1 = 1 - Math.sqrt((50000 - energyPerRoom) / 50000)
				}
			}
		}

		let enemyLowEnergyPriority2 = 0;
		if ((mem.trmE || 0) + (mem.storE || 0) === 0) {
			enemyLowEnergyPriority2 = 1;
		}

		// Lower priority of everything if bucket is low
		let bucketPriority = 10 - Memory.stats.avgBucket / 1000;

		let harassPriorityBase = 16 - 2 * gclPriority - 20 * hatePriority - 5 * safeModePriority2 - groupPriority - attackFocusPriority - 3 * ongoingLowEPriority - 3 * coordinatePriority + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 10 * enemyLowEnergyPriority1
		let stakeOutPriorityBase = 22 - 2 * gclPriority - 20 * hatePriority - 5 * safeModePriority2 - groupPriority - 2 * attackFocusPriority - ongoingAssaultPriority - 4 * ongoingLowEPriority - 4 * coordinatePriority  + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 10 * enemyLowEnergyPriority1
		let sourceRaidPriorityBase = 20 - 2 * gclPriority - 20 * hatePriority - 5 * safeModePriority2 - groupPriority - 3 * attackFocusPriority - ongoingAssaultPriority - 6 * ongoingLowEPriority - 4 * coordinatePriority  + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 10 * enemyLowEnergyPriority1 - 2 * enemyLowEnergyPriority2
		let deconPriorityBase = 18 - 2 * gclPriority - 20 * hatePriority - 5 * safeModePriority2 - groupPriority - attackFocusPriority - 3 * ongoingAssaultPriority - 2 * coordinatePriority  + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 5 * enemyLowEnergyPriority1
		let swarmPriorityBase = 14 - 2 * gclPriority - 20 * hatePriority - 5 * safeModePriority1 - groupPriority - attackFocusPriority - 3 * ongoingAssaultPriority + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 5 * enemyLowEnergyPriority1
		let weakRoomPriorityBase = 6 - 2 * gclPriority - 20 * hatePriority - 5 * safeModePriority1 - groupPriority - attackFocusPriority - 10 * ongoingAssaultPriority + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 5 * enemyLowEnergyPriority1
		let lowEPriorityBase = 14 - 2 * gclPriority - 20 * hatePriority - 5 * safeModePriority1 - groupPriority - attackFocusPriority - ongoingAssaultPriority - 4 * ongoingLowEPriority - (4 * mem.towerShoots || 0) - 4 * coordinatePriority + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 10 * enemyLowEnergyPriority1 - 4 * enemyLowEnergyPriority2
		let assaultPriorityBase = 10 - 2 * gclPriority - 20 * hatePriority - 10 * safeModePriority1 - groupPriority - attackFocusPriority - 10 * ongoingAssaultPriority - 5 * coordinatePriority + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 10 * enemyLowEnergyPriority1 - 8 * enemyLowEnergyPriority2
		let roomEdgeAssaultPriorityBase = 6 - 2 * gclPriority - 20 * hatePriority - 10 * safeModePriority1 - groupPriority - attackFocusPriority + 3 * ongoingAssaultPriority + bucketPriority + closestRoomPriority - 30 * damagedRoomPriority - 10 * enemyLowEnergyPriority1
		if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
			console.log("Base p1", roomName, gclPriority, hatePriority, safeModePriority2, groupPriority, attackFocusPriority, ongoingLowEPriority, coordinatePriority, bucketPriority, closestRoomPriority, damagedRoomPriority, enemyLowEnergyPriority1, enemyLowEnergyPriority2)
		}

		if (Memory.economyArena) {
			harassPriorityBase += 10;
			stakeOutPriorityBase += 10;
			sourceRaidPriorityBase += 10;
			deconPriorityBase += 10;
			swarmPriorityBase += 10;
			weakRoomPriorityBase += 10;
			lowEPriorityBase += 10;
			assaultPriorityBase += 10;
			roomEdgeAssaultPriorityBase += 10;
		}

		if (gclEstimate[mem.owner] == 1) {
			weakRoomPriorityBase -= 10;
		}

		// Stake-outs are reasonably expensive
		if (ongoingStakeOut) {
			assaultPriorityBase -= 10;
			lowEPriorityBase -= 10;
		}

		// If we're not attacking already, cut down on rooms we're failing to acheive anything with
		if (!ongoingAssaultPriority) {
			let failedPriority = ((mem.numAttacksFailed || 0) * ((mem.failedAtBoostLevel || 0) + 1) + (mem.numAttacksFizzled || 0) * ((mem.fizzledAtBoostLevel || 0) + 1) * 0.5) * 0.25

			if (!Memory.botArena) {
				failedPriority *= 2;
			}

			if (mem.twrX.length) {
				harassPriorityBase += failedPriority;
				stakeOutPriorityBase += failedPriority;
				sourceRaidPriorityBase += failedPriority;
				deconPriorityBase += failedPriority;
				swarmPriorityBase += failedPriority;
				roomEdgeAssaultPriorityBase += failedPriority;
			}
			// Higher priority if we've failed a lot and now it's weak room attackable
			weakRoomPriorityBase -= failedPriority * 3;			
			lowEPriorityBase += failedPriority;
			assaultPriorityBase += failedPriority * 3;
		}

		if (nonMMOFactors) {
			let gclPriority2;
			if (nonMMOFactors.gclEnergyEstimates && nonMMOFactors.gclEnergyEstimates[mem.owner]) {
				gclPriority2 = 5 * nonMMOFactors.gclEnergyEstimates[mem.owner] / _.sum(Object.values(nonMMOFactors.gclEnergyEstimates))
			}
			else {
				gclPriority2 = 0
			}

			// Energy per room
			let totalEnergyPriority = nonMMOFactors.totalEnergy === undefined ? 0 : Math.max(0, 1 - nonMMOFactors.totalEnergy / (25000 * gclEstimate[mem.owner]))

			// totalEnergy
			// boostStocks

			harassPriorityBase -= 2 * gclPriority2 - 2 * totalEnergyPriority
			stakeOutPriorityBase -= 2 * gclPriority2 - 2 * totalEnergyPriority
			sourceRaidPriorityBase -= 2 * gclPriority2 - 3 * totalEnergyPriority
			deconPriorityBase -= 2 * gclPriority2 - 2 * totalEnergyPriority
			swarmPriorityBase -= 2 * gclPriority2 - totalEnergyPriority
			weakRoomPriorityBase -= 2 * gclPriority2 - totalEnergyPriority
			lowEPriorityBase -= 2 * gclPriority2 - 4 * totalEnergyPriority
			assaultPriorityBase -= 2 * gclPriority2 - totalEnergyPriority
			roomEdgeAssaultPriorityBase -= 2 * gclPriority2 - totalEnergyPriority
		}

		let requests = Memory.combatManager.requestedMissions

		let rangeModifier2Mod = (1 + (safeModePriority1 || safeModePriority2) / 4);

		if (requests[MISSION_REMOTE_HARASS][roomName] && Game.time - requests[MISSION_REMOTE_HARASS][roomName] < 1000) {
			harassPriorityBase -= 20;
		}
		if (requests[MISSION_REMOTE_STAKEOUT][roomName] && Game.time - requests[MISSION_REMOTE_STAKEOUT][roomName] < 1000) {
			stakeOutPriorityBase -= 20;
		}
		if (requests[MISSION_ROOM_SOURCE_RAID][roomName] && Game.time - requests[MISSION_ROOM_SOURCE_RAID][roomName] < 1000) {
			sourceRaidPriorityBase -= 20;
		}
		if (requests[MISSION_REMOTE_DECON][roomName] && Game.time - requests[MISSION_REMOTE_DECON][roomName] < 1000) {
			deconPriorityBase -= 20;
		}
		if (requests[MISSION_WEAK_ROOM_ATTACK][roomName] && Game.time - requests[MISSION_WEAK_ROOM_ATTACK][roomName] < 2000) {
			weakRoomPriorityBase -= 20;
		}
		if (requests[MISSION_ROOM_LOW_ENERGY_ASSAULT][roomName] && Game.time - requests[MISSION_ROOM_LOW_ENERGY_ASSAULT][roomName] < 1000) {
			lowEPriorityBase -= 20;
			rangeModifier2Mod *= 1.25
		}
		if (requests[MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE][roomName] && Game.time - requests[MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE][roomName] < 1000) {
			lowEPriorityBase -= 20;
			rangeModifier2Mod *= 1.25
		}
		if (requests[MISSION_ROOM_ASSAULT][roomName] && Game.time - requests[MISSION_ROOM_ASSAULT][roomName] < 1000) {
			assaultPriorityBase -= 20;
			rangeModifier2Mod *= 1.25
		}
		// console.log("Base p 2", roomName, harassPriorityBase, stakeOutPriorityBase, deconPriorityBase, swarmPriorityBase, weakRoomPriorityBase, lowEPriorityBase, assaultPriorityBase, assaultPriorityBase, roomEdgeAssaultPriorityBase)

		// Last time we attacked this room we triggered a safe mode. This is a prime target.
		if (Memory.combatManager.assaultSafeModeTriggered && Game.time - (Memory.combatManager.assaultSafeModeTriggered[mem.owner] || -1e9) < 10000 && (mem.safeModeCooldown || 0) > 10000) {
			rangeModifier2Mod *= 1.25
		}

		// They're actually trying
		if (mem.hostileBoostedCreeps) {
			weakRoomPriorityBase -= 10;
		}
		// They're trying in a different way
		if (mem.nonLocalCivilianCreeps || mem.nonLocalCombatCreeps) {
			weakRoomPriorityBase -= 10
			stakeOutPriorityBase -= 15
			sourceRaidPriorityBase -= 5
			harassPriorityBase -= 5
			assaultPriorityBase -= 5
			lowEPriorityBase -= 5
		}

		// Some other room owned by this player is being boosted.
		if (global.nonLocalCreepsTracker && global.nonLocalCreepsTracker[mem.owner] && Game.time - global.nonLocalCreepsTracker[mem.owner] < 1000) {
			stakeOutPriorityBase -= 7.5

			// if (global.nonLocalCreepsTracker[mem.owner][roomName] && Game.time - global.nonLocalCreepsTracker[mem.owner][roomName].t < 1000) {
			// 	stakeOutPriorityBase -= 2 * Math.min(5, global.nonLocalCreepsTracker[mem.owner][roomName].c)
			// }

		}

		// No creeps. Probably bugged out. If it needs an assault to knock it over, assault it
		if (!mem.hostileCreepOwners.length) {
			assaultPriorityBase -= 10
			lowEPriorityBase -= 10
		}

		// If we're down on GCL, cool the guns and concentrate on GCL.
		// Really just hoping other people kill each other
		if (Memory.botArena) {
			let maxEnemyGCL = _.max(Memory.gclEstimates);

			let numOverMyGCL = 0
			for (let enemy in Memory.gclEstimates) {
				if (Memory.gclEstimates[enemy] > Game.gcl.level) {
					numOverMyGCL++
				}
			}


			if (Memory.timedRound && maxEnemyGCL > Game.gcl.level) {
				let mod = (1 + (numOverMyGCL - 1) / 2) * 20 * (maxEnemyGCL - Game.gcl.level) * maxEnemyGCL / Game.gcl.level;

				harassPriorityBase += mod
				stakeOutPriorityBase += mod
				sourceRaidPriorityBase += mod
				deconPriorityBase += mod
				swarmPriorityBase += mod
				weakRoomPriorityBase += mod
				lowEPriorityBase += mod
				assaultPriorityBase += mod
				roomEdgeAssaultPriorityBase += mod
			}
			else if (Memory.boomMode && (mem.closestRoomRange || 5) > 1.5) {
				harassPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				stakeOutPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				sourceRaidPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				deconPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				swarmPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				weakRoomPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				lowEPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				assaultPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
				roomEdgeAssaultPriorityBase += 10 * maxEnemyGCL / Game.gcl.level
			}
			else if (Memory.attackMode) {
				harassPriorityBase -= 10
				stakeOutPriorityBase -= 10
				sourceRaidPriorityBase -= 10
				deconPriorityBase -= 10
				swarmPriorityBase -= 10
				weakRoomPriorityBase -= 10
				lowEPriorityBase -= 10
				assaultPriorityBase -= 10
				roomEdgeAssaultPriorityBase -= 10
			}

			// Quick check for faceclaims. Don't clear someone else's face
			if (mem.closestRoomRange > 2) {				
				let exits = Game.map.describeExits(roomName);
				for (let exitDir in exits) {
					let exitRoomName = exits[exitDir]
					if (Memory.rooms[exitRoomName] && Memory.rooms[exitRoomName].owner && Memory.rooms[exitRoomName].owner != mem.owner && Memory.rooms[exitRoomName].owner != util.getMyName()) {
						weakRoomPriorityBase += 10
						lowEPriorityBase += 10
						assaultPriorityBase += 10
					}
				}
			}
		}

		// Annoy anything without a terminal (or is struggling to use it based on actual data) more aggressively.
		if (!mem.trmX || (mem.termEnergyInPerTick || 1) < 1) {
			stakeOutPriorityBase -= 5;
			sourceRaidPriorityBase -= 10;
			harassPriorityBase -= 2.5;
			deconPriorityBase -= 2.5;

			// Under safe mode. Try to prevent rebuild
			if (safeModePriority2) {
				harassPriorityBase -= 1.25;
				deconPriorityBase -= 1.25;
				stakeOutPriorityBase -= 2.5;
			}
		}

		// console.log("Base p 3", roomName, harassPriorityBase, stakeOutPriorityBase, deconPriorityBase, swarmPriorityBase, weakRoomPriorityBase, lowEPriorityBase, assaultPriorityBase, assaultPriorityBase, roomEdgeAssaultPriorityBase)

		if (mem.nukeLandTime) {
			// Apply big pressure to rooms being nuked.
			if (mem.nukeLandTime - Game.time > 25000) {
				swarmPriorityBase -= 5;
				weakRoomPriorityBase -= 5;
				lowEPriorityBase -= 5;
				assaultPriorityBase -= 5;

				stakeOutPriorityBase -= 2.5
				sourceRaidPriorityBase -= 2.5
				harassPriorityBase -= 2.5

				rangeModifier2Mod *= 1.1;
			}
			else if (mem.nukeLandTime - Game.time > 2500) {
				swarmPriorityBase -= 10;
				weakRoomPriorityBase -= 10;
				lowEPriorityBase -= 10;
				assaultPriorityBase -= 10;

				stakeOutPriorityBase -= 5
				sourceRaidPriorityBase -= 5
				harassPriorityBase -= 5				

				rangeModifier2Mod *= 1.25;
			}
		}
		if (mem.lastNukeLand && Game.time - mem.lastNukeLand < 1500) {
			swarmPriorityBase -= 15;
			weakRoomPriorityBase -= 15;
			lowEPriorityBase -= 10;
			assaultPriorityBase -= 15;

			stakeOutPriorityBase -= 5
			sourceRaidPriorityBase -= 5
			harassPriorityBase -= 5				

			rangeModifier2Mod *= 1.25;
		}

		if (mem.allExtensionsAtSources) {
			sourceRaidPriorityBase -= 10;
		}


		let rangeModifier3Mod = 1;

		// TODO: this should be based on cpu limit not GCL level...
		if (global.totalAssaultCount > Game.gcl.level / 8) {
			let fact = global.totalAssaultCount / (Game.gcl.level / 8)
			rangeModifier3Mod *= (1 - 0.125 * fact);

			swarmPriorityBase += fact;
			lowEPriorityBase += fact;
			assaultPriorityBase += fact;
		}

		if (global.roomAssaultCounts[roomName].assaultCount) {
			rangeModifier3Mod *= 1.1;
		}

		// Linear dist check doens't work when portals exist. Hmmph.
		let allowPortals = Memory.allowCombatPortals === undefined ? 1 : Memory.allowCombatPortals

		let hasPortal = false;
		if (allowPortals) {
			// Only allow sector to sector. 
			let centreRoom = util.getCentreRoomForRoomName(roomName)

			if (Memory.rooms[centreRoom] && Memory.rooms[centreRoom].portalDest && util.isRoomAccessible(centreRoom)) {
				hasPortal = true;
			}
		}

		if (global.runningIntershardSupport) {
			harassPriorityBase += 10
			stakeOutPriorityBase += 10
			sourceRaidPriorityBase += 10
			deconPriorityBase += 10
			swarmPriorityBase += 10
			weakRoomPriorityBase += 10
			lowEPriorityBase += 10
			assaultPriorityBase += 10
			roomEdgeAssaultPriorityBase += 10

			rangeModifier2Mod *= 0.75
		}

		let maxP = Math.max(harassPriorityBase, stakeOutPriorityBase, sourceRaidPriorityBase, deconPriorityBase, swarmPriorityBase, weakRoomPriorityBase, lowEPriorityBase, assaultPriorityBase, roomEdgeAssaultPriorityBase);

		if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
			console.log("Base p2", roomName, harassPriorityBase, stakeOutPriorityBase, sourceRaidPriorityBase, deconPriorityBase, swarmPriorityBase, weakRoomPriorityBase, lowEPriorityBase, assaultPriorityBase, roomEdgeAssaultPriorityBase)
		}

		// I think all of these work out to be the same - hate is hate.
		let enoughHate = true;
		let enoughHateHarass = true;
		let enoughHateAssault = true;

		if (damagedFraction > 0) {
			if (hatePercentage / highestHate < 0.75) {
				enoughHate = false;
				enoughHateAssault = false;
				enoughHateHarass = false;
			}
		}

		// If they're not a threat to the win condition and aren't otherwise annoying, ignore 'em
		let isSensibleTarget = function(portal) {
			let hateMod = (Memory.season || portal) ? 10 : 1

			let hated = ((Memory.stats.hateCounter[mem.owner] || 0) >= hateMod * (Memory.economyArena ? 100000 : (15000 * (Memory.boomMode ? 2 : 1)))) ? 1 : 0
			let reallyHated = ((Memory.stats.hateCounter[mem.owner] || 0) >= hateMod * (Memory.economyArena ? 400000 : (60000 * (Memory.boomMode ? 2 : 1)))) ? 1 : 0

			let closeMod = 1;
			// let closeMod = Memory.season ? 1.5 : 1;

			let close = (mem.closestRoomRange <= 5 * closeMod) ? 1 : ((mem.closestRoomRange <= 10 * closeMod ? 0.5 : 0))
			let ongoing = (global.currentBoostedAssault.includes(mem.owner)) ? 1 : 0
			let focus = ((Memory.attackFocus[mem.owner] || 0) > 50) ? 0.5 : 0

			let maxTowerForEasy = Memory.maxRoomLevel == 8 ? 1 : 0

			let easy = (mem.twrX.length <= maxTowerForEasy && intelAI.getGCLUpperBound(mem.owner) == 1) ? 1 : 0

			let winConditionThreat
			if (!Memory.privateServer) {
				winConditionThreat = (!portal && mem.rcl < Memory.maxRoomLevel) ? 1 : 0
			}
			else if (Memory.season) {
				if (Memory.season2) {
					if (mem.owner == "Genovese" || mem.owner == "QzarSTB"|| mem.owner == "clarkok") {
						winConditionThreat = 1
					}
					else {
						winConditionThreat = 0
					}
				}
				else if (Memory.season3) {
					// if (roomName == "E1N11" && mem.rcl >= 5) {
					// 	winConditionThreat = 1
					// }
					// if (mem.owner == "baptr") {
					// 	winConditionThreat = 1
					// }
					// else {
						winConditionThreat = 0
					// }

				}
				else if (Memory.season5) {
					let coords = util.getRoomCoords(roomName)
					if (coords.y <= 10 && coords.y >= 0 && coords.x <= 20 && coords.x >= -10) {
						if (roomName != "W18N2" || mem.owner != "V1king") {
							winConditionThreat = 1	
						}						
					}
				}
				else {					
					// Todo
					winConditionThreat = 0; //mem.closestRoomRange <= 10 && ((!mem.rampHP && !mem.wallHP) || mem.twrX.length == 0)
				}

				// Last 6 hour party
				if (Memory.season4) {
					winConditionThreat = 1
				}

				if ((Memory.manualThreatList || []).includes(mem.owner)) {
					winConditionThreat = 1
				}
			}
			else {
				let gclUpperBound = intelAI.getGCLUpperBound(mem.owner)
				winConditionThreat = (gclUpperBound >= Game.gcl.level - (Memory.timedRound ? 1 : 0)) ? 1 : (gclUpperBound >= Game.gcl.level - 1 ? 0.5 : 0)
			}

			return (winConditionThreat || (hated + reallyHated + close + ongoing + focus + easy) >= 2)

		}

		if (!isSensibleTarget(false)) {
			enoughHateHarass = false;
			enoughHate = false;
			enoughHateAssault = false;
		}

		// This is a pretty low threshold. Intention is to roll back on first strikes/fighting far away if we have space to expand and we're not behind.
		if (!Memory.attackMode) {


			/*if ((Memory.stats.hateCounter[mem.owner] || 0) < (Memory.economyArena ? 100000 : (7500 * (Memory.boomMode ? 2 : 1)))) {
				// Don't need space to grow. Not competing for GCL. They're not close to me... Let 'em be.
				if ((Memory.season || intelAI.getGCLUpperBound(mem.owner) < Game.gcl.level - 1) && mem.closestRoomRange > 5) {
				}

				// lowEPriorityBase += 10
			}*/
		}

		// 10 is enough for someone I don't hate
		if (!Memory.privateServer && (mem.closestRoomRange || 0) > 10 && (Memory.stats.hateCounter[mem.owner] || 0) < 10000 && mem.rcl == 8) {
			enoughHateHarass = false;
			enoughHate = false;
			enoughHateAssault = false;
		}

		if (Memory.season4 && mem.owner == "rysade" && Memory.stats.hateCounter[mem.owner] < 1e5) {
			return undefined
		}

		// In general don't pick fights on seasonal
		if (Memory.season && !enoughHate) {
			return undefined
		}


		let minSafeRoute = Infinity;
		let hasActiveMission;

		for (var parentRoom of _.shuffle(Game.myRooms)) {
			let highPriorityOnly = Memory.dragon ? true : false;
			// targetRoomName, renew, lowPriority, highPriority, predictedEnergyCost
			if (!highPriorityOnly && parentRoom.restrictOffensiveMissions(roomName, false, Game.cpu.bucket < 3000 || Memory.stats.avgBucket < 4000, Game.cpu.bucket > 3000 && Memory.stats.avgBucket > 4000 && maxP < 0)) {
				if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
					console.log("restrictOffensiveMissions A", roomName, parentRoom, Game.cpu.bucket, Memory.stats.avgBucket, maxP)
				}

				if (Game.cpu.bucket > 3000) {
					highPriorityOnly = !parentRoom.restrictOffensiveMissions(roomName, false, false, true);
				}

				if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
					console.log("restrictOffensiveMissions B", roomName, parentRoom, highPriorityOnly)
				}


				if (!highPriorityOnly) {
					continue;
				}
			}

			if (parentRoom.name == global.currentlyUnclaimingRoom) continue

			if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
				console.log("Passed restrictOffensiveMissions", roomName, parentRoom)
			}



			// Not used???
			parentRoom.memory.neededBoosts = [];

			let linearDist = Game.map.getRoomLinearDistance(roomName, parentRoom.name);

			// That's 750 ticks. Nope.
			if (linearDist > 15 || linearDist > Game.cpu.limit / 2.5) {				
				if (!allowPortals || !hasPortal) {
					continue;
				}
				else {
					// Only allow sector to sector. 
					let roomCoords = util.getRoomCoords(parentRoom.name);

					let centreRoomX;
					let centreRoomY;

					if (roomCoords.x > 0) {
						centreRoomX = Math.floor(roomCoords.x / 10) * 10 + 5;
					}
					else {
						centreRoomX = Math.ceil((roomCoords.x + 1) / 10) * 10 - 5 - 1;
					}
					if (roomCoords.y > 0) {
						centreRoomY = Math.floor(roomCoords.y / 10) * 10  + 5;
					}
					else {
						centreRoomY = Math.ceil((roomCoords.y + 1) / 10) * 10 - 5 - 1;
					}

					let centreRoom = util.getRoomNameFromCoords({x: centreRoomX, y: centreRoomY});

					if (!Memory.rooms[centreRoom] || !Memory.rooms[centreRoom].portalDest || !util.isRoomAccessible(centreRoom)) {
						continue;
					}

					// Don't portal attack unless we really hate 'em
					if (!Memory.privateServer) {
						if (!isSensibleTarget(true)) {
							enoughHateHarass = false;
							enoughHate = false;
							enoughHateAssault = false;
						}
					}

				}
			}

			// if (roomName == "W14S9") console.log("C", roomName, parentRoom)

			// Prefer not to go through portals.
			let portalPriority = 0;
			if (linearDist > 20) {
				portalPriority = 10;
			}

			let powerPriority = 2;
			if (mem.powerEnabled) {
				powerPriority = -2;
			}

			// Don't go after rooms that are bigger than us while we're still RCL <= 3;
			if (parentRoom.effectiveLevel <= 3 && mem.rcl > 3) {
				// if (roomName == "E6S9") console.log("C", roomName, parentRoom, parentRoom.effectiveLevel, mem.rcl)
				continue;
			}

			// Don't stack spawning of missions
			if (parentRoom.effectiveLevel < 3 || missionInfo.isRoomSpawningMission(parentRoom, true)) {
				// if (roomName == "E6S9") console.log("C", roomName, parentRoom, parentRoom.effectiveLevel, missionInfo.isRoomSpawningMission(parentRoom, true))
				continue;
			}


			// if (roomName == "E6S9") console.log("C", roomName, parentRoom)

			// If we don't hate 'em enough, only allow missions that would pass with the low priority condition.
			if (!enoughHate && parentRoom.restrictOffensiveMissions(roomName, false, true, false)) {
				continue;
			}

			let defconPriorty = 1 - (parentRoom.defcon - 1) / 4;
			let energyOnlyDiff = 0;
			if (parentRoom.storage && parentRoom.storage.store[RESOURCE_ENERGY] > 200000) {
				energyOnlyDiff += (parentRoom.storage.store[RESOURCE_ENERGY] - 200000) / 50000
			}
			if (parentRoom.memory.spawnUtilization < 0.9) {
				energyOnlyDiff += (0.9 - parentRoom.memory.spawnUtilization) * 5;
			}

			let restrictBoostsPriority = 0

			let pathLength;

			// Atomic. Only allow one player to be assaulted with boosts at any given time.
			// Don't burn boosts if we're expecting to pile in on safe mode
			// And dont' burn boosts on lower RCL rooms.
			let assaultRestrictBoosts = false;

			// This is quite a complicated check...
			if (global.totalBoostedAssaultCount >= Game.myRooms.length / 20 &&
				((global.currentBoostedAssault.length && !global.currentBoostedAssault.includes(mem.owner) && (!global.roomAssaultCounts[roomName] || !global.roomAssaultCounts[roomName].assaultCount)) ||
				(_.max(Object.values(Memory.combatManager.assaultSafeModeTriggered || {})) > Game.time - 25000 && Game.time - (Memory.combatManager.assaultSafeModeTriggered[mem.owner] || -25000) > 25000) ||
				parentRoom.effectiveLevel < Memory.maxRoomLevel)) {

				// Restrict if the walls are high _and_ there is no exposed controller.
				if ((Memory.botArena || ((mem.highestWall || Infinity) > 1e6 && (mem.rampHP || 0) + (mem.wallHP || 0) > 5e6)) && 
					(_.sum(mem.controllerExposedToEdge) == 0 || !mem.enemyFullyConnected || (pathLength = safeRoute.getSafeRouteCost(parentRoom.name, roomName, allowPortals, false)) > CREEP_CLAIM_LIFE_TIME * 0.8)) {
					if (!Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT][roomName]) {
						assaultRestrictBoosts = true;
					}
				}
			}

			// Already sending boosts this way. Checks later should prevent piling on to rooms we shouldn't hopefully.
			// We're going to make the assumption that 2 rooms will require fewer total boosts than 1.
			if (global.roomAssaultCounts[roomName] && global.roomAssaultCounts[roomName].boostedCount) {
				assaultRestrictBoosts = false	
			}


			if (assaultRestrictBoosts) {
				// Lower priority of everything else to save energy.
				restrictBoostsPriority = Math.max(0, 5 - energyOnlyDiff);
				if (Math.random() < 0.01) {			
					console.log("Assault restrict boosts", roomName);
				}
			}

			let notMaxLevelPriority = (Memory.maxRoomLevel - parentRoom.effectiveLevel);
			let upgradeFocusPriority = parentRoom.upgradeFocus ? 10 : 0;

			// Lower is higher priority
			let harassPriority = harassPriorityBase + 9 * defconPriorty - energyOnlyDiff - (parentRoom.effectiveLevel - mem.rcl) + portalPriority + powerPriority + restrictBoostsPriority + notMaxLevelPriority + upgradeFocusPriority;
			let stakeOutPriority = stakeOutPriorityBase + 12 * defconPriorty - energyOnlyDiff - (parentRoom.effectiveLevel - mem.rcl) + portalPriority + powerPriority + restrictBoostsPriority + notMaxLevelPriority + upgradeFocusPriority;
			let sourceRaidPriority = sourceRaidPriorityBase + 12 * defconPriorty - energyOnlyDiff - 0.5 * (parentRoom.effectiveLevel - mem.rcl) + portalPriority + powerPriority + restrictBoostsPriority + notMaxLevelPriority + upgradeFocusPriority;
			let deconPriority = deconPriorityBase + 9 * defconPriorty - energyOnlyDiff - (parentRoom.effectiveLevel - mem.rcl) + portalPriority + powerPriority + restrictBoostsPriority + notMaxLevelPriority + upgradeFocusPriority;
			let swarmPriority = swarmPriorityBase + 6 * defconPriorty - energyOnlyDiff - (parentRoom.effectiveLevel - mem.rcl) + portalPriority + powerPriority + restrictBoostsPriority + notMaxLevelPriority + upgradeFocusPriority;
			let weakRoomPriority = weakRoomPriorityBase + 6 * defconPriorty + portalPriority + powerPriority + restrictBoostsPriority + notMaxLevelPriority + upgradeFocusPriority;
			let lowEPriority = lowEPriorityBase + 6 * defconPriorty - energyOnlyDiff - 4 * (parentRoom.effectiveLevel - mem.rcl) + portalPriority + powerPriority + restrictBoostsPriority + notMaxLevelPriority + upgradeFocusPriority;
			let assaultPriority = assaultPriorityBase + 6 * defconPriorty - 6 * (parentRoom.effectiveLevel - mem.rcl) + portalPriority + powerPriority + restrictBoostsPriority + 4 * notMaxLevelPriority + upgradeFocusPriority;
			let roomEdgeAssaultPriority = roomEdgeAssaultPriorityBase + 6 * defconPriorty - energyOnlyDiff + portalPriority + powerPriority + restrictBoostsPriority + 2 * notMaxLevelPriority + upgradeFocusPriority;


			if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
				console.log("p3", roomName, harassPriority, stakeOutPriority, sourceRaidPriority, deconPriority, swarmPriority, weakRoomPriority, lowEPriority, assaultPriority, roomEdgeAssaultPriority)
			}


			let rangeModifier1 = (parentRoom.isUnderUtilized() ? 1.125 : 1) *
								 (1 + gclPriority / 8) *
								 (1 + hatePriority / 2) *
								 (1 + (safeModePriority1 || safeModePriority2) / 4) *
								 (1 + attackFocusPriority / 100) *
								 (1 + ongoingAssaultPriority / 10) *
								 (1 + coordinatePriority / 10) *
								 (1 - 0.5 * defconPriorty);

			// Try to keep it local
			if (Memory.empireStrength < 10 && !Memory.manualThreatList.includes(mem.owner))	{
				rangeModifier1 *= Math.pow(Memory.empireStrength / 10, 0.3)
			}

			// Focus on building up.
			if (parentRoom.effectiveLevel <= 3) {
				rangeModifier1 *= .75;
			}

			let rangeModifier2 = rangeModifier1 * rangeModifier2Mod;

			if (mem.nukeLandTime) {
				if (mem.nukeLandTime - Game.time < linearDist * 50) {
					swarmPriority -= 10;
					weakRoomPriority -= 10;
					lowEPriority -= 7;
					assaultPriority -= 10;

					rangeModifier2 *= 1.25;
				}
			}

			let rangeModifier3 = rangeModifier2 * rangeModifier3Mod;

			// Average wall is less than 100k and max is less than 1.05 million
			let avgTarget1 = 1e5;
			let highTarget1 = 1.05e6;

			// Higher targets at lower levels.
			avgTarget1 *= 8 / parentRoom.effectiveLevel;
			highTarget1 *= 8 / parentRoom.effectiveLevel;

			// Really low.
			let avgTarget2 = avgTarget1 / 10;
			let highTarget2 = highTarget1 / 10;

			let lowWalls1 = ((mem.wallHP || 0) + (mem.rampHP || 0)) / (Math.max(1, (mem.numWalls || 0) + (mem.numRamps || 0))) <= avgTarget1 && (mem.highestWall || 0) <= highTarget1;
			let lowWalls2 = lowWalls1 && (((mem.wallHP || 0) + (mem.rampHP || 0)) / (Math.max(1, (mem.numWalls || 0) + (mem.numRamps || 0))) <= avgTarget2 && (mem.highestWall || 0) <= highTarget2);

			if (lowWalls1) {
				assaultPriority -= 4;
				lowEPriority -= 2;
			}
			if (lowWalls2) {
				assaultPriority -= 4;
				lowEPriority -= 2;
			}
			if ((mem.wallHP || 0) + (mem.rampHP || 0) == 0) {
				assaultPriority -= 8;
				lowEPriority -= 8;
			}

			let rangeModifier4 = rangeModifier3 * (1 + 0.1 * (parentRoom.effectiveLevel - mem.rcl)) * (lowWalls2 ? 1.5 : (lowWalls1 ? 1.25 : 1)) * (1 + ongoingAssaultPriority / 10)

			let harassRangeLimit = Math.min(12, 5 * rangeModifier1);
			let stakeOutRangeLimit = Math.min(12, 6 * rangeModifier1);
			let sourceRaidRangeLimit = Math.min(12, 6 * rangeModifier1);
			let harassLightRangeLimit = Math.min(12, 7 * rangeModifier1);
			let deconRangeLimit = Math.min(12, 6 * rangeModifier1);
			let weakRoomRangeLimit = Math.min(15, 7 * rangeModifier2);
			let swarmRangeLimit = Math.min(4, 2.5 * rangeModifier3); // Loads of CPU for a long path
			let roomEdgeAssaultRangeLimit  = Math.min(10, 5 * rangeModifier3);
			let lowERangeLimit = Math.min(10, 5 * rangeModifier4);
			let assaultRangeLimit  = Math.min(12, 6 * rangeModifier4);

			// These are a form of harassment
			// if (!enoughHateHarass) {
			// 	lowERangeLimit = Math.min(lowERangeLimit, 1.5);
			// }

			// Not quite sure why I'd want to do this other than playing manually.
			// if (Object.keys(Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT]).includes(roomName)) {
			// 	assaultRangeLimit *= 1.25;
			// 	assaultPriority -= 4;
			// }
			// if (roomName == "E6S9") console.log("D", roomName, parentRoom)

			let maxRange = Math.max(harassRangeLimit, harassLightRangeLimit, stakeOutRangeLimit, sourceRaidRangeLimit, deconRangeLimit, swarmRangeLimit, weakRoomRangeLimit, lowERangeLimit, assaultRangeLimit, roomEdgeAssaultRangeLimit, Game.cpu.limit / 2);

			// console.log("Range limits", roomName, harassRangeLimit, harassLightRangeLimit, stakeOutRangeLimit, deconRangeLimit, swarmRangeLimit, weakRoomRangeLimit, lowERangeLimit, assaultRangeLimit, roomEdgeAssaultRangeLimit)

			// Debug
			// if (assaultRangeLimit === null) {
				// console.log(rangeModifier4, rangeModifier3, parentRoom.effectiveLevel, mem.rcl, lowWalls2, lowWalls1)
			// }

			// Shortcut
			// if (linearDist > maxRange) {
			// 	continue;
			// }

			// What type of misison do we want to do?
			pathLength = pathLength || safeRoute.getSafeRouteCost(parentRoom.name, roomName, allowPortals, false);

			minSafeRoute = Math.min(minSafeRoute, pathLength);

			// if (roomName == "W14S9") console.log("D", roomName, parentRoom, pathLength, maxRange)

			if (pathLength > maxRange) {
				// if (roomName == "E6S9") console.log("D", pathLength, maxRange, rangeModifier1, rangeModifier2, rangeModifier3, rangeModifier4)
				continue;
			}

			if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
				console.log("Passed maxRange", roomName, parentRoom)
			}


			let pathMod = pathLength > 8 ? 2 : 1;

			harassPriority += pathLength * pathMod
			stakeOutPriority += pathLength * pathMod
			sourceRaidPriority += pathLength * pathMod
			deconPriority  += pathLength * pathMod
			swarmPriority  += pathLength * pathMod
			weakRoomPriority  += pathLength * pathMod
			lowEPriority  += pathLength * pathMod
			assaultPriority  += pathLength * pathMod

			if (pathLength * 50 < 0.5 * CREEP_CLAIM_LIFE_TIME) {
				weakRoomPriority -= 2;
			}
			else if (pathLength * 50 > 0.8 * CREEP_CLAIM_LIFE_TIME) {
				weakRoomPriority += pathLength;
			}

			// If they have no spawns before tick 50000 they're probably GCL 1 and therefore dead.
			if (Game.time < 50000 && gclEstimate[mem.owner] <= 1 && mem.spwnX.length == 0) continue

			let allowLowPriority = !highPriorityOnly && !parentRoom.restrictOffensiveMissions(roomName, false, true, false)

			if (hasActiveMission === undefined) {
				hasActiveMission = missionInfo.hasActiveMissionsToRoom(roomName);
			}


			let localMissionPriorities = [];

			if (((mem.spwnX && mem.spwnX.length > 0) || mem.nonLocalCivilianCreeps) && enoughHateHarass) {
				if (pathLength < harassRangeLimit && (allowLowPriority || harassPriority < 20)) {
					localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: harassPriority, h: highPriorityOnly, m:MISSION_REMOTE_HARASS});
				}
			}
			if (mem.spwnX && mem.spwnX.length > 0 && Game.cpu.bucket > 5000 && Memory.stats.avgBucket > 5000 && enoughHateHarass) {
				if (pathLength < harassLightRangeLimit && (allowLowPriority || harassPriority < 10 + Math.max(0, (Memory.stats.avgBucket - 8000) / 100))) {
					localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: harassPriority - (Memory.stats.avgBucket > 9000 ? 40 : 0), h: highPriorityOnly, m:MISSION_REMOTE_HARASS_LIGHT});
				}
			}
			if (mem.spwnX && mem.spwnX.length > 0 && enoughHateHarass) {
				if (pathLength < deconRangeLimit && (allowLowPriority || deconPriority < 20)) {
					localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: deconPriority, h: highPriorityOnly, m:MISSION_REMOTE_DECON});
				}
			}
			// Only do this if it's high priority. It's expensive and it's really meant for piling the pressure on.
			if (((mem.spwnX && mem.spwnX.length > 0) || mem.nonLocalCivilianCreeps) && enoughHateHarass) {
				if (pathLength < stakeOutRangeLimit && stakeOutPriority < 0) {
					localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: stakeOutPriority, h: highPriorityOnly, m:MISSION_REMOTE_STAKEOUT});
				}
			}

			let safeModeTime = Math.min(((mem.nukeLandTime - Game.time) || SAFE_MODE_DURATION), mem.safeMode || 0)

			if (Memory.debugAttackPoll && Memory.season5) {
				console.log(mem.spwnX, mem.spwnX.length, enoughHateHarass, !(safeModeTime || 0), pathLength, sourceRaidRangeLimit, mem.sourcesExposedToEdge, mem.sourcesNearlyExposedToEdge)
			}
			// Same as above. For piling pressure
			if (mem.spwnX && mem.spwnX.length > 0 && (enoughHateHarass || mem.allExtensionsAtSources) && !(safeModeTime || 0)) {
			// if (roomName == "E9S3") console.log(mem.spwnX, mem.spwnX.length, enoughHateHarass)
				if (pathLength < sourceRaidRangeLimit && (sourceRaidPriority < 0 || mem.allExtensionsAtSources)) {
					for (let sourceId in mem.pathTowerDamageToSourcesByEdge1x1) {
						if (_.any(mem.sourcesExposedToEdge[sourceId]) || _.any(mem.sourcesNearlyExposedToEdge[sourceId])) {
							let priority = sourceRaidPriority;

							let minDamage = Infinity
							for (let i = 0; i < 4; i++) {
								if (mem.pathTowerDamageToSourcesByEdge1x1[sourceId][i]) {
									minDamage = Math.min(minDamage, mem.pathTowerDamageToSourcesByEdge1x1[sourceId][i])
								}
							}

							// Prefer sources which aren't as dangerous
							priority += minDamage / 600

							// if (Math.random() < 0.01) {
								// console.log(MISSION_ROOM_SOURCE_RAID, "disabled in getOffensiveMissionPriorities")
							// }
							localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: sourceRaidPriority, h: highPriorityOnly, s: sourceId, m:MISSION_ROOM_SOURCE_RAID});
						}
					}
				}
			}

			// if (roomName == "E6S9") console.log("E", roomName, parentRoom)


			// I think if they have an exposed spawn or all their towers are exposed, we want to splat them.
			// Strategy for dealing with towers is to swarm.
			if (Memory.botArena &&
				safeModeTime < SWARM_ATTACK_SAFE_MODE_PRESPAWN &&
				(pathLength < swarmRangeLimit) &&
				(allowLowPriority || swarmPriority < 20) &&
				enoughHate &&
				mem.twrX &&
				mem.twrX.length > 0 && mem.twrX.length < 3 &&
				Game.cpu.bucket > 9000 &&
				Game.time - mem.lo < 100000) {
				if (parentRoom.storage && parentRoom.storage.store[RESOURCE_ENERGY] > 30000) {
					var exposedTowers = true;
					var twrE = 0;
					for (var towerIdx in mem.twrX) {
						// console.log(roomName);
						twrE += mem.twrE[towerIdx];
						if (mem.twrInside[towerIdx] && !mem.twrExtern[towerIdx]) {
							exposedTowers = false;
						}
					}

					var exposedSpawns = true;
					for (var spawnIdx in mem.spwnX) {
						if (mem.spwnInside[spawnIdx] && !mem.spwnExtern[spawnIdx]) {
							exposedSpawns = false;
						}
					}

					let hostilePartsA = mem.creepCombatPartsAttack || 0;
					let hostilePartsR = mem.creepCombatPartsRanged || 0;
					let hostilePartsH = mem.creepCombatPartsHeal || 0;


					// If we can get to all the spawns, or all the towers, then try to swarm them out. Can't deal
					// with > 2 towers right now. Don't really want to deal with creeps either.
					if ((exposedSpawns || exposedTowers) && (hostilePartsA + hostilePartsH + hostilePartsR < 5)) {
						localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: swarmPriority, h: highPriorityOnly, m:MISSION_ROOM_SWARM});
					}
				}
			}

			// Low-strength room to attack
			if (safeModeTime < WEAK_ROOM_ATTACK_SAFE_MODE_PRESPAWN &&
				(allowLowPriority || weakRoomPriority < 20) &&
				enoughHate &&
				pathLength < weakRoomRangeLimit
				) {

				var twrE = 0;
				for (var towerIdx in mem.twrX) {
					twrE += mem.twrE[towerIdx];
				}

				// Don't kill GCL 1 people if they have no spawn
				let tooEarly = 0;
				if (Memory.botArena && Memory.tick < 40000 && (!mem.spwnX || mem.spwnX.length == 0)) {
					tooEarly = 1;
				}

				let someoneElseDoingIt = 0;
				if (Memory.timedRound && mem.hostileCreepOwners && mem.hostileCreepOwners.length && !global.whiteList.length) { 
					for (let name of mem.hostileCreepOwners) {
						if (name != mem.owner) {
							someoneElseDoingIt = 1;
							break;
						}
					}
				}


				//
				if (twrE < 10 && !tooEarly && !someoneElseDoingIt) {
					if (!mem.spwnX || mem.spwnX.length > 0) {
						weakRoomPriority -= 5;
					}



					localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: weakRoomPriority, h: highPriorityOnly, d: pathLength, m:MISSION_WEAK_ROOM_ATTACK});
				}
			}

			let allowAnyAssaults = true;

			for (let type of [MISSION_ROOM_ASSAULT_BLINKY, MISSION_MEGA_ASSAULT, MISSION_STRONGHOLD_MEGA_ASSAULT]) {
				for (var mission of Memory.combatManager.currentMissions[type]) {
					if (mission.ID && mission.targetRoomName == roomName) {
						allowAnyAssaults = false;
					}
				}
			}


			if (Memory.timedRound && (mem.hostileCreepOwners || []).length > 1 && (!global.whiteList || !global.whiteList.length)) {
				for (let name of mem.hostileCreepOwners) {
					if (name != mem.owner && name != "Invader") {
						console.log("Not assauling/low E", roomName, "as someone else doing it", mem.hostileCreepOwners)
						allowAnyAssaults = false;
						break;
					}
				}

			}

			if (Memory.debugAttackPoll && Memory.season5) {
				console.log(safeModeTime < LOW_E_ATTACK_SAFE_MODE_PRESPAWN,
					(allowLowPriority || lowEPriority < 20),
					allowAnyAssaults,
					enoughHateHarass,
					(pathLength < lowERangeLimit),
					Game.time - mem.lo < 100000,
					parentRoom.storage && parentRoom.storage.store[RESOURCE_ENERGY] > 30000)
			}

			// Low energy room to attack. The aim is to drain, not to kill.
			if (safeModeTime < LOW_E_ATTACK_SAFE_MODE_PRESPAWN &&
				(allowLowPriority || lowEPriority < 20) &&
				allowAnyAssaults &&
				enoughHateHarass && // These are a form of harassment
				(pathLength < lowERangeLimit) &&
				Game.time - mem.lo < 100000) {

				// If we're trying to sufficate them, we want to be able to breath!
				if (parentRoom.storage && parentRoom.storage.store[RESOURCE_ENERGY] > 30000) {
					var totalEnergy = 0;
					for (var towerIdx in mem.twrX) {
						totalEnergy += mem.twrE[towerIdx];
					}

					totalEnergy += mem.storE || 0;
					totalEnergy += mem.trmE || 0;

					//
					/*if ((mem.wallHP > 0  || mem.rampHP > 0) &&
						roomIntel.isTerrainNavigableByMask(roomName, [[0,0],[1,0],[0,1],[1,1]], hasActiveMission) &&
						mem.twrX.length > 0) {
						localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: lowEPriority, h: highPriorityOnly, m:MISSION_ROOM_LOW_ENERGY_ASSAULT});
					}*/
					if ((!Memory.season || Game.gcl.level >= 5 || Memory.manualThreatList.includes(mem.owner)) &&
						roomIntel.isTerrainNavigableByMask(roomName, [[0,0],[1,0],[0,1],[1,1]], hasActiveMission) &&
						mem.twrX.length > 0) {
						localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: lowEPriority, h: highPriorityOnly, m:MISSION_ROOM_LOW_ENERGY_ASSAULT});
					}
					// if (totalEnergy < (parentRoom.storage.store[RESOURCE_ENERGY] || 0) / 2 &&
					// 	(parentRoom.effectiveLevel == 8 || (requests[MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE][roomName] && Game.time - requests[MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE][roomName] < 1000)) &&
					// 	pathLength < lowERangeLimit * .75 &&
					// 	(mem.wallHP > 0  || mem.rampHP > 0) &&
					// 	roomIntel.isTerrainNavigableByMask(roomName, [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]], hasActiveMission) &&
					// 	mem.twrX.length > 0) {
					// 	localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: lowEPriority + 1, h: highPriorityOnly, m:MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE});
					// }
				}
			}

			let isRoomWorthAssault = mem.twrX.length > 0 ||
									 ((mem.spwnX || []).length > 0 && ((mem.numAttacksFizzled || 0) >= 3 || (mem.numAttacksFailed || 0) >= 3) || intelAI.strugglingToKillRooms(mem.owner) >= 10) ||
									 (mem.killTerminal && mem.trmX) ||
									 (mem.killStorage && mem.storX)

			if (!Memory.botArena && (mem.numAttacksFailed || 0) + (mem.numAttacksFizzled || 0) > 20) {
				console.log("Not assauling", roomName, "as num failed/fizzled too high", (mem.numAttacksFailed || 0) + (mem.numAttacksFizzled || 0))
				isRoomWorthAssault = false;
			}
			// if (Memory.season2 && isRoomWorthAssault && mem.owner == "Kasami" && mem.rcl >= 7) {
			// 	isRoomWorthAssault = false;
			// }


			// Prioritize non edge wall high frontage rooms that we've not attacked before
			if (isRoomWorthAssault) {
				if (mem.eWallsL) assaultPriority++;
				if (mem.eWallsR) assaultPriority++;
				if (mem.eWallsT) assaultPriority++;
				if (mem.eWallsB) assaultPriority++;
				assaultPriority += (mem.numAttacksFizzled || 0);
				assaultPriority += (mem.numAttacksFailed || 0);
				assaultPriority -= (mem.boundaryWallCount || 0) / 20;
			}

			// console.log(roomName,
			// 			isRoomWorthAssault,
			// 			(allowLowPriority || assaultPriority < 20),
			// 			(enoughHateAssault || (parentRoom.effectiveLevel >= 7 && mem.twrX.length <= 1) || (parentRoom.effectiveLevel >= 8 && mem.twrX.length <= 2)),
			// 			(pathLength < assaultRangeLimit),
			// 			Game.time - mem.lo < 100000);

			// console.log(roomName,
			// 			isRoomWorthAssault,
			// 			((mem.spwnX || []).length > 0 && ((mem.numAttacksFizzled || 0) >= 3 || (mem.numAttacksFailed || 0) >= 3) || intelAI.strugglingToKillRooms(mem.owner) >= 10),
			// 			(mem.killTerminal && mem.trmX),
			// 			(mem.killStorage && mem.storX));

			// console.log(parentRoom.name,
			// 			roomName,
			// 			safeModeTime < ASSAULT_SAFE_MODE_PRESPAWN,
			// 			isRoomWorthAssault,
			// 			(allowLowPriority || assaultPriority < 20),
			// 			(enoughHateAssault || (parentRoom.effectiveLevel >= 7 && mem.twrX.length <= 1) || (parentRoom.effectiveLevel >= 8 && mem.twrX.length <= 2)),
			// 			(pathLength < assaultRangeLimit),
			// 			Game.time - mem.lo < 100000)



			if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
				console.log(safeModeTime < ASSAULT_SAFE_MODE_PRESPAWN,
							isRoomWorthAssault,
							allowAnyAssaults,
							(allowLowPriority || assaultPriority < 20),
							(enoughHateAssault || ((allowLowPriority || p < 0) && parentRoom.effectiveLevel >= 7 && mem.twrX.length <= 1) || ((allowLowPriority || p < 0) && parentRoom.effectiveLevel >= 8 && mem.twrX.length <= 2)),
							(pathLength < assaultRangeLimit),
							pathLength, assaultRangeLimit,
							Game.time - mem.lo < 10000,
							assaultRestrictBoosts)
			}


			// Room assault. Let's get them!
			if (safeModeTime < ASSAULT_SAFE_MODE_PRESPAWN &&
				isRoomWorthAssault &&
				allowAnyAssaults &&
				(allowLowPriority || assaultPriority < 20) &&
				(enoughHateAssault || ((allowLowPriority || p < 0) && parentRoom.effectiveLevel >= 7 && mem.twrX.length <= 1) || ((allowLowPriority || p < 0) && parentRoom.effectiveLevel >= 8 && mem.twrX.length <= 2)) &&
				(pathLength < assaultRangeLimit) &&
				Game.time - mem.lo < 10000) {

				// If the defense is more wall based we can't use RMA
				// to damage multiple at once, so we want to go decon.
				let wallCountRatio = (mem.numWalls || 0) / ((mem.numWalls || 0) + (mem.numRamps || 0) + 1e-9);
				let mostlyWalls = Math.random() * (mem.wallHP || 0) * wallCountRatio > Math.random() * (mem.rampHP || 0) * (1 - wallCountRatio);

				// Chance we ignore this and spawn the other type anyway. In general RA is bad when there are walls, directional is fine when there are.
				if (mostlyWalls && Math.random() < 0.05) {
					mostlyWalls = false;
				}
				else if (!mostlyWalls && Math.random() < 0.3) {
					mostlyWalls = true;
				}
				if (wallCountRatio > 0.25 && Math.random() < 0.75) {
					mostlyWalls = true;
				}

				if ((mem.numAttacksFailed || 0) >= 3 || ((mem.numAttacksFailed || 0) > 0 && intelAI.strugglingToKillRooms(mem.owner) >= 10)) {
					if (mostlyWalls && (mem.numAttacksFailedClose || 0) / mem.numAttacksFailed > 0.7) {
						mostlyWalls = false;
					}
					if (!mostlyWalls && (mem.numAttacksFailedRanged || 0) / mem.numAttacksFailed > 0.7) {
						mostlyWalls = true;
					}
				}

				// Are there any extenal keypoints? If so, favour attack.
				if (!mostlyWalls) {
					let externalStuff = false;

				  	for (var towerIdx in mem.twrX) {
						if (mem.twrExtern[towerIdx] || mem.twrInside[towerIdx]) {
							externalStuff = true;
							break;
						}
					}

				  	for (var spawnIdx in mem.spwnX) {
						if (mem.spwnExtern[spawnIdx] || mem.spwnInside[spawnIdx]) {
							externalStuff = true;
							break;
						}
					}

					if (externalStuff && Math.random() < 0.5) {
						mostlyWalls = true;
					}
				}

				// Single creep.
				// Don't really want to fight defenders
				// Just smash under-ramparted guys
				if ((mem.numRamps || 0) <= 5 && mem.twrX.length) {
					let p = assaultPriority;
					// p += (mem.numAttacksFailed || 0);
					// Using empire strenght and p as a comparison is... a big hack
					if ((Memory.empireStrength || 0) > p && (mem.wallHP || 0) + (mem.rampHP || 0) < 1e6 * (Memory.empireStrength || 0) / 20) {
						p -= 20;
					}

					// Biggest creep is T3 10T+10M+10R+20H, which is 960 heal, tanks 3200 damage.
					if (allowAnyAssaults && !mem.creepCombatPartsRanged && !mem.creepCombatPartsAttack && mem.maxTowerDamage <= 3200) {
						localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: p, h: highPriorityOnly, m:MISSION_ROOM_ASSAULT_BLINKY, b:1});
					}
				}

				if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
					console.log("A", roomIntel.isTerrainNavigableByMask(roomName, [[0,0],[1,0],[0,1],[1,1]], hasActiveMission))
				}


				// Small assault
				if (roomIntel.isTerrainNavigableByMask(roomName, [[0,0],[1,0],[0,1],[1,1]], hasActiveMission)) {
					let p = assaultPriority;
					// p += (mem.numAttacksFailed || 0);

					let boosts = (!assaultRestrictBoosts && enoughHate && parentRoom.effectiveLevel >= 6);

					// They basically have no walls. Not going to be expensive to boost down. Just do it.
					// Using empire strenght and p as a comparison is... a big hack
					if ((Memory.empireStrength || 0) > p && (mem.wallHP || 0) + (mem.rampHP || 0) < 1e6 * (Memory.empireStrength || 0) / 10) {
						boosts = 1;
						p -= 20;
					}

					if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
						console.log("B", allowAnyAssaults, mem.twrX.length, boosts)
					}


					// console.log(roomName, mem.twrX.length, assaultRestrictBoosts, enoughHate, parentRoom.effectiveLevel, allowAnyAssaults && (mem.twrX.length < 6 || boosts))

					if (allowAnyAssaults && (mem.twrX.length < 6 || boosts)) {
						if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
							console.log("C")
						}
						localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: p, h: highPriorityOnly, m:MISSION_ROOM_ASSAULT, b:boosts});
					}

					// MEGA!!!
					if (parentRoom.effectiveLevel == 8 && mem.numAttacksFailed > 5 && boosts && Memory.empireStrength > 10) {
						localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: p - 10, h: highPriorityOnly, m:MISSION_MEGA_ASSAULT, b:boosts});
					}
				}
				else {
					console.log(roomName, "not 2x2 navigable");
				}

				// Large assault
				// if (!mostlyWalls &&
				// 	parentRoom.effectiveLevel == 8 &&
				// 	allowAnyAssaults &&
				// 	pathLength < assaultRangeLimit * .75 &&
				// 	roomIntel.isTerrainNavigableByMask(roomName, [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]], hasActiveMission)) {

				// 	let p = assaultPriority;
				// 	p += (mem.numAttacksFailed || 0);
				// 	localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: p + 1, h: highPriorityOnly, m:MISSION_ROOM_ASSAULT_LARGE, b:false});
				// }
			}
			else if (Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT][roomName]) {
				console.log("Not assaulting requested room", 
							roomName, "from",
							parentRoom.name,
							safeModeTime, 
							isRoomWorthAssault, 
							allowLowPriority, 
							assaultPriority, 
							(enoughHateAssault || (parentRoom.effectiveLevel >= 7 && mem.twrX.length <= 1) || (parentRoom.effectiveLevel >= 8 && mem.twrX.length <= 2)), 
							pathLength, 
							assaultRangeLimit,
							Game.time - mem.lo)
			}

			if (safeModeTime == 0 &&
				enoughHate &&
				(allowLowPriority || roomEdgeAssaultPriority < 20) &&
				(pathLength < roomEdgeAssaultRangeLimit) &&
				Object.keys(Memory.combatManager.requestedMissions[MISSION_ROOM_EDGE_ASSAULT]).includes(roomName) &&
				Game.time - mem.lo < 100000) {
				if (pathLength < roomEdgeAssaultRangeLimit) {
					// We've been requested!
					localMissionPriorities.push({parentRoomName: parentRoom.name, r: roomName, p: roomEdgeAssaultPriority, h: highPriorityOnly, m:MISSION_ROOM_EDGE_ASSAULT});
				}
			}

			// Is there somebody else doing any of the missions only allow if we're allowing low priority.
			// Do I really need this at all?
			if (!allowLowPriority) {
				for (let type of MISSION_TYPES) {
					// We don't want to strip these out based on priority.
					// Stacking assaults is a good thing
					if (ASSAULT_MISSION_TYPES.includes(type)) continue
					for (var mission of Memory.combatManager.currentMissions[type]) {
						if (mission.ID) {
							for (var missionPriority of _.clone(localMissionPriorities)) {
								if (missionPriority.m == mission.type && mission.targetRoomName == missionPriority.r && mission.sourceRoomName != parentRoom.name) {
									if (mission.type == MISSION_WEAK_ROOM_ATTACK && mission.routeCost >= CREEP_CLAIM_LIFE_TIME / 60) {
										continue
									}
									_.pull(localMissionPriorities, missionPriority);
									break;
								}
							}
						}
					}
				}
			}

			if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
				console.log(JSON.stringify(localMissionPriorities))
			}


			if (localMissionPriorities.length) {
				// Don't stack weak room attacks too much.
				let currentCount = 0;
				for (var mission of Memory.combatManager.currentMissions[MISSION_WEAK_ROOM_ATTACK]) {
					if (mission.ID && mission.targetRoomName == roomName) {
						currentCount++;
					}
				}
				for (var mission of Memory.combatManager.currentMissions[MISSION_WEAK_ROOM_ATTACK]) {
					if (mission.ID) {
						for (var missionPriority of _.clone(localMissionPriorities)) {
							if (missionPriority.m == MISSION_WEAK_ROOM_ATTACK &&
								mission.targetRoomName == missionPriority.r &&
								mission.sourceRoomName != parentRoom.name &&
								(mission.routeCost < CREEP_CLAIM_LIFE_TIME / 60 || (currentCount > 2 && missionPriority.d > CREEP_CLAIM_LIFE_TIME / 60))) {
								_.pull(localMissionPriorities, missionPriority);
							}
							// If we have an ongoing weak attack, don't stack an assault on top
							else if (mission.targetRoomName == missionPriority.r && (missionPriority.m == MISSION_ROOM_ASSAULT_BLINKY || ASSAULT_MISSION_TYPES.includes(missionPriority.m))) {
								if (Memory.debugAttackPoll) {
									console.log("Won't assault with ongoing weak attack", mission.targetRoomName)
								}
								_.pull(localMissionPriorities, missionPriority);
							}
						}
					}
				}


				// Don't stack decon/harass/stakeout on the same room.
				let harassTypes = [MISSION_REMOTE_HARASS, MISSION_REMOTE_DECON, MISSION_REMOTE_HARASS_LIGHT, MISSION_REMOTE_STAKEOUT];
				for (let type of harassTypes) {
					for (var mission of Memory.combatManager.currentMissions[type]) {
						if (mission.ID) {
							for (var missionPriority of _.clone(localMissionPriorities)) {
								if (harassTypes.includes(missionPriority.m) && mission.targetRoomName == missionPriority.r) {
									_.pull(localMissionPriorities, missionPriority);
								}
							}
						}
					}
				}

				// Don't hit the same source twice
				for (var mission of Memory.combatManager.currentMissions[MISSION_ROOM_SOURCE_RAID]) {
					if (mission.ID) {
						for (var missionPriority of _.clone(localMissionPriorities)) {
							if (missionPriority.m == MISSION_ROOM_SOURCE_RAID && mission.targetRoomName == missionPriority.r && mission.targetSourceId == missionPriority.s) {
								_.pull(localMissionPriorities, missionPriority);
							}
						}
					}
				}


				// Try not to over-assault
				let assaultTypes = [MISSION_ROOM_ASSAULT, MISSION_ROOM_ASSAULT_LARGE, MISSION_ROOM_LOW_ENERGY_ASSAULT, MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE, MISSION_STRONGHOLD_ASSAULT, MISSION_FORMATION_REMOTE_DECON, MISSION_ROOM_ASSAULT_BLINKY]
				for (let type of assaultTypes) {
					for (var mission of Memory.combatManager.currentMissions[type]) {
						if (mission.ID) {
							for (var missionPriority of _.clone(localMissionPriorities)) {
								// Don't do blinkies in combination with anything else
								// First checks if the new one is a blinky and there's an assault
								// Second checks if there is currently a blinky and the new one is an assault.
								// Second is covered earlier with allowAnyAssaults and may be expensive
								// if ((missionPriority.m == MISSION_ROOM_ASSAULT_BLINKY || (type == MISSION_ROOM_ASSAULT_BLINKY && assaultTypes.includes(missionPriority.m))) && mission.targetRoomName == missionPriority.r) {
								if (missionPriority.m == MISSION_ROOM_ASSAULT_BLINKY && mission.targetRoomName == missionPriority.r) {
									if (Memory.debugAttackPoll) {
										console.log("blinky won't stack", mission.targetRoomName)
									}
									_.pull(localMissionPriorities, missionPriority);
								}
								else if (missionPriority.m == type && mission.targetRoomName == missionPriority.r) {
									// Don't stack multiple from the same room.
									if (mission.sourceRoomName == parentRoom.name) {
										if (Memory.debugAttackPoll) {
											console.log("multiple from same room", mission.targetRoomName)
										}
										_.pull(localMissionPriorities, missionPriority);
									}
									else {
										let pull = false;
										let mem = Memory.rooms[mission.targetRoomName]

										// Only gang up if we've failed at least once before
										if (!mem.numAttacksFailed &&
											!mem.numAttacksFizzled &&
											!mem.numAttacksFailedClose &&
											!mem.numAttacksFailedRanged &&
											intelAI.strugglingToKillRooms(mem.owner) < 10 &&
											(!global.roomAssaultCounts || !global.roomAssaultCounts[mission.targetRoomName] || global.roomAssaultCounts[mission.targetRoomName].numAssaultLaunches < 4) && 
											true /*(Game.time - (mem.withdrawTick || 0)) > 100*/) { // That last check is a bit RNG for such a big event
											if (Memory.debugAttackPoll) {
												console.log("won't gang up", mission.targetRoomName)
											}

											pull = true;
										}
										else if (!missionInfo.canLaunchNewAssault(mission.targetRoomName)) {
											if (Memory.debugAttackPoll) {
												console.log("can't launch new assault", mission.targetRoomName)
											}
											pull = true;
										}
										// Too hard to kill. Wait for terminal throughput limit
										// else if (!Memory.botArena && (mem.numAttacksFailed || 0) + (mem.numAttacksFizzled || 0) > 10) {
										// 	console.log("Not assauling", mission.targetRoomName, "as num failed/fizzled too high", (mem.numAttacksFailed || 0) + (mem.numAttacksFizzled || 0))
										// 	pull = true
										// }

										if (pull) {
											// Somebody else is doing this mission. Get rid of it from our selection
											_.pull(localMissionPriorities, missionPriority);
											break;
										}
									}
								}
							}
						}
					}
				}
			}

			if (Memory.debugAttackPoll && mem.owner == "liaohuo") {
				console.log(JSON.stringify(localMissionPriorities))
			}


			targetRoomMissionPriorities = targetRoomMissionPriorities.concat(localMissionPriorities)
		}

		// Many assaults => higher priority.
		let numCanAssault = 0;

		// If any can assault without high priority all can.
		let canAssaultWithoutHighP = 0;

		for (let priority of targetRoomMissionPriorities) {
			if (priority.m == MISSION_ROOM_ASSAULT) {
				numCanAssault++;
				if (!priority.h) {
					canAssaultWithoutHighP = true;
				}
			}
		}

		// For every other assault, lower my priorty by one.
		for (let priority of targetRoomMissionPriorities) {
			if (priority.m == MISSION_ROOM_ASSAULT) {
				priority.p -= numCanAssault - 1;
				if (canAssaultWithoutHighP) {
					priority.h = false;
				}
			}
		}


		targetRoomMissionPriorities.sort(function (a, b) {
			return b.p - a.p;
		});

		return {minSafeRoute: minSafeRoute, priorities: targetRoomMissionPriorities};
	},

	launchOMissionWithPriorities : function(missionPriorities) {
		if (!missionPriorities.length) {
			return false;
		}


		let currentMission = {};
		let plannedMission;
		let parentRoom;
		let highPriorityOnly;

		// Try to launch the highest priority mission.
		while (missionPriorities.length) {
			plannedMission = missionPriorities.pop();

			parentRoom = Game.rooms[plannedMission.parentRoomName];
			highPriorityOnly = plannedMission.h;

			// Are we doing it already?
			for (let mission of Memory.combatManager.currentMissions[plannedMission.m]) {
				currentMission = {};
				if (plannedMission.m == mission.type && plannedMission.r == mission.targetRoomName && mission.sourceRoomName == parentRoom.name) {
					// Grab the old object.
					if (mission.type == MISSION_ROOM_SWARM) {
						currentMission = new RoomSwarmMission(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_ROOM_SOURCE_RAID && plannedMission.s == mission.targetSourceId) {
						currentMission = new RoomSourceRaidMission(mission, parentRoom.name, plannedMission.r, mission.targetSourceId, false)
						break;
					}
					else if (mission.type == MISSION_REMOTE_HARASS) {
						currentMission = new RemoteHarassMission(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_REMOTE_HARASS_LIGHT) {
						currentMission = new RemoteHarassLightMission(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_REMOTE_DECON) {
						currentMission = new RemoteDeconMission(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_REMOTE_STAKEOUT) {
						currentMission = new RemoteStakeOutMission(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_WEAK_ROOM_ATTACK) {
						currentMission = new WeakRoomAttackMission(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_ROOM_LOW_ENERGY_ASSAULT) {
						currentMission = new RoomLowEAssaultMission2x2(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE) {
						currentMission = new RoomLowEAssaultMission3x3(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_ROOM_ASSAULT) {
						currentMission = new RoomAssaultMission2x2(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_ROOM_ASSAULT_LARGE) {
						currentMission = new RoomAssaultMission3x3(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_ROOM_ASSAULT_BLINKY) {
						currentMission = new RoomAssaultBlinky(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_MEGA_ASSAULT) {
						currentMission = new MegaAssaultMission(mission, parentRoom.name, plannedMission.r, false);
						break;
					}
					else if (mission.type == MISSION_ROOM_EDGE_ASSAULT) {
						currentMission = new RoomEdgeAssaultMission(mission, parentRoom.name, plannedMission.r, null, false);
						break;
					}
					else if (mission.type == MISSION_HEAVY_CONTROLLER_ATTACK) {
						currentMission = new HeavyControllerAttackMission(mission, parentRoom.name, plannedMission.r, null, false);
						break;
					}
				}
			}
			// If it has no ID, we're not doing it, so do it.
			if (!currentMission.ID) {
				break;
			}
		}

		// If the above loop finds we're already doing everything this is set. None of that please.
		if (currentMission.ID) {
			return this.launchOMissionWithPriorities(missionPriorities);
		}

		// The highest priority mission we have is too low priority.
		if (highPriorityOnly && plannedMission.p > 0) {
			return this.launchOMissionWithPriorities(missionPriorities);
		}

		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		// Oh. Crap.
		if (spawns.length == 0) return false;
		var spawn = spawns[0];

		if (Memory.debugAttackPoll) {
			console.log(JSON.stringify(plannedMission))
		}

		Memory.attackFocus = Memory.attackFocus || {};

		if (plannedMission.m == MISSION_REMOTE_HARASS || plannedMission.m == MISSION_REMOTE_HARASS_LIGHT) {
			// Needs to be before because otherwise count is undefined for the canSupportBodyCount call.
			var maxCount;
			if (plannedMission.m == MISSION_REMOTE_HARASS_LIGHT) {
				maxCount = 6;
			}
			else {
				maxCount = 6 * Math.min(Math.ceil(parentRoom.energyCapacityAvailable / (2 * 150 + 3 * 50 + 1 * 250)), Math.floor(MAX_CREEP_SIZE / 6));
			}	

			if (parentRoom.canSupportBodyCount(maxCount * Math.max(1, (currentMission.memory ? currentMission.memory.harassRooms.length : 1)))) {
				var newMemory = (!currentMission.memory);
				if (plannedMission.m == MISSION_REMOTE_HARASS) {
					currentMission = new RemoteHarassMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)
				}
				else if (plannedMission.m == MISSION_REMOTE_HARASS_LIGHT) {
					currentMission = new RemoteHarassLightMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)
				}

				// If we've failed recently we don't want to launch straight back into it.
				if (currentMission.isActive()) {
					if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);

					console.log(parentRoom.name, "Launching", plannedMission.m, "against", plannedMission.r, plannedMission.m, "e", currentMission.memory.e)

					// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
					// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + (plannedMission.m == MISSION_REMOTE_HARASS_LIGHT ? 0.25 : 0.5);
					// }

					currentMission.requestSpawns();

					return currentMission;
					// Spawn request done in constructor
					// currentMission.requestSpawns();
				}
				else {
					// Constructing it didn't activate it. Next!
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_REMOTE_DECON) {
			// Needs to be before because otherwise count is undefined for the canSupportBodyCount call.
			var maxCount = 6 * Math.min(Math.ceil(parentRoom.energyCapacityAvailable / (2 * 150 + 3 * 50 + 1 * 250)), Math.floor(MAX_CREEP_SIZE / 6));
			// console.log(roomName, count, currentMission.memory ? currentMission.memory.harassRooms.length : 1)

			// 4 creeps, one room
			if (parentRoom.canSupportBodyCount(maxCount * 4)) {
				var newMemory = (!currentMission.memory);
				currentMission = new RemoteDeconMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)

				// If we've failed recently we don't want to launch straight back into it.
				if (currentMission.isActive()) {
					if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);

					console.log(parentRoom.name, "Launching decon against", plannedMission.r, "e", currentMission.memory.e)

					// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
					// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 0.5;
					// }

					currentMission.requestSpawns();

					return currentMission;
				}
				else {
					// Constructing it didn't activate it. Next!
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_REMOTE_STAKEOUT) {
			var maxCount = 6 * Math.min(Math.ceil(parentRoom.energyCapacityAvailable / (2 * 150 + 3 * 50 + 1 * 250)), Math.floor(MAX_CREEP_SIZE / 6));

			if (parentRoom.canSupportBodyCount(maxCount * Math.max(1, (currentMission.memory ? currentMission.memory.harassRooms.length : 1)))) {
				var newMemory = (!currentMission.memory);
				currentMission = new RemoteStakeOutMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)

				// If we've failed recently we don't want to launch straight back into it.
				if (currentMission.isActive()) {
					if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);

					console.log(parentRoom.name, "Launching stakeout against", plannedMission.r, "es", JSON.stringify(currentMission.memory.roome))

					// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
					// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 1;
					// }

					currentMission.requestSpawns();

					return currentMission;
				}
				else {
					// Constructing it didn't activate it. Next!
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_SOURCE_RAID) {
			var maxCount = 2 * Math.min(MAX_CREEP_SIZE, Math.ceil(4 * parentRoom.energyCapacityAvailable / (200 + 500)));

			if (parentRoom.canSupportBodyCount(maxCount)) {
				var newMemory = (!currentMission.type);
				currentMission = new RoomSourceRaidMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, plannedMission.s, true, plannedMission.p)

				// If we've failed recently we don't want to launch straight back into it.
				if (currentMission.isActive()) {
					if (currentMission.requestSpawns()) {
						if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);


						// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
						// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 1.5;
						// }

						console.log(parentRoom.name, "Launching source raid against", plannedMission.r, plannedMission.m, "e", currentMission.memory.e)

						return currentMission;
					}
					else {
						console.log(parentRoom.name, "source raid inactive A", plannedMission.r, plannedMission.m, "e", currentMission.memory.e)
						// Constructing it didn't activate it. Next!
						return this.launchOMissionWithPriorities(missionPriorities);
					}
				}
				else {
					console.log(parentRoom.name, "source raid inactive B", plannedMission.r, plannedMission.m, "e", currentMission.memory.e)

					// Constructing it didn't activate it. Next!
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				console.log(parentRoom.name, "source raid can't support body count", plannedMission.r, plannedMission.m, "e", currentMission.memory ? currentMission.memory.e : "")
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_SWARM) {
			// TODO: Spawn a beast-mode base defender before launching this mission. It takes
			// a lot of spawn time and invaders at the wrong time are annoying.
			var newMemory = (!currentMission.memory);
			currentMission = new RoomSwarmMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)

			// TODO: Spawn two strong ranged/heal for the room we're going to go first.

			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				console.log(parentRoom.name, "Launching swarm against", plannedMission.r)

				// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
				// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 5;
				// }

				if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);

				// For each tower we want 15000 hit points. 450 body parts
				// TODO: Refine this.
				// Don't use all the room's energy. Prefer to spawn more with fewer energy
				// This means that if we starve out the extension fillers we don't feck everything up.
				var count = 1;

				var numCreeps = Math.ceil((150 * Memory.rooms[plannedMission.r].twrX.length) / (2 * count));

				var body = [];
				for (var i = 0; i < count; i++) {
					body.push(MOVE)
				}
				for (var i = 0; i < count; i++) {
					body.push(ATTACK)
				}

				// I'm not sure about floor/ceil here.
				var countR = Math.min(Math.floor(parentRoom.energyCapacityAvailable / 200), Math.floor(MAX_CREEP_SIZE / 2));

				var bodyR = [];
				for (var i = 0; i < countR; i++) {
					bodyR.push(RANGED_ATTACK)
				}
				for (var i = 0; i < countR; i++) {
					bodyR.push(MOVE)
				}

				currentMission.setupCreepPositions(numCreeps);

				for (var creepIdx = 0; creepIdx < numCreeps - 1; creepIdx++) {
					currentMission.spawnCreep("tank", body, {}, spawn)
				}

				for (var creepIdx = 0; creepIdx < 2; creepIdx++) {
					var idleCreep = idleCreepManager.getIdleCreepForBody(bodyR, parentRoom);

					if (idleCreep) {
						currentMission.assignCreep(idleCreep);
					}
					else {
						currentMission.spawnCreep("ranged", bodyR, {}, spawn)
					}
				}

				for (var creepIdx = 0; creepIdx < 1; creepIdx++) {
					currentMission.spawnCreep("tank", body, {}, spawn)
				}

				return currentMission;
			}
			else {
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_WEAK_ROOM_ATTACK) {
			// TODO: Spawn a beast-mode base defender before launching this mission. It takes
			// a lot of spawn time and invaders at the wrong time are annoying.
			var newMemory = (!currentMission.memory);
			currentMission = new WeakRoomAttackMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)

			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				console.log(parentRoom.name, "Launching weak room attack against", plannedMission.r)

				// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
				// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 3;
				// }


				if (currentMission.requestSpawns()) {
					if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);
					return currentMission;
				}
				else {
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_LOW_ENERGY_ASSAULT) {
			// TODO: Spawn a beast-mode base defender before launching this mission. It takes
			// a lot of spawn time and invaders at the wrong time are annoying.
			var newMemory = (!currentMission.memory);
			currentMission = new RoomLowEAssaultMission2x2(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)


			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {

				// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
				// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 5;
				// }

				if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);
				return currentMission;
			}
			else {
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE) {
			// TODO: Spawn a beast-mode base defender before launching this mission. It takes
			// a lot of spawn time and invaders at the wrong time are annoying.
			var newMemory = (!currentMission.memory);
			currentMission = new RoomLowEAssaultMission3x3(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)


			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {

				// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
				// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 5;
				// }

				if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);
				return currentMission;
			}
			else {
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_ASSAULT) {
			var newMemory = (!currentMission.memory);
			currentMission = new RoomAssaultMission2x2(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)


			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				let maxAccountedForEnemyAttack = (Memory.rooms[plannedMission.r].attackCreepsClose || 3);
				let maxAccountedForEnemyRanged = (Memory.rooms[plannedMission.r].rangedCreepsClose || 6);


				let plan = currentMission.getActualAssaultSpawnPlan(currentMission.memory.closeCombat, 1, currentMission.getMaxHealPerTowerNeeded(), maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, plannedMission.b, !plannedMission.b, false)



				if (plan) {
					let hasBoosts = false
					for (let boostObject of plan.boosts) {
						for (let boostType in boostObject) {
							if (boostObject[boostType]) {
								hasBoosts = true;
								break;
							}
						}
					}

					console.log(parentRoom.name, "Launching assault against", plannedMission.r, "mode", currentMission.closeCombat ? "w" : "r", "boosts", (!plannedMission.b) ? "n" : "y", (!hasBoosts) ? "n" : "y")

					if (currentMission.requestSpawns(!plannedMission.b, false)) {
						// Game.notify(parentRoom.name + " Launching assault against " + plannedMission.r + " mode " + (currentMission.closeCombat ? "w" : "r") + " boosts " + ((!plannedMission.b || !hasBoosts) ? " n" : " y"))
						// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
						// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 10;
						// }
						Memory.remoteRefreshOffset = (Memory.remoteRefreshOffset || 0) - 500;
						if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);
						return currentMission;
					}
					else {
						console.log(currentMission.closeCombat, 1, currentMission.getMaxHealPerTowerNeeded(), maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, plannedMission.b, !plannedMission.b, false)
						console.log(JSON.stringify(plan))
						console.log(parentRoom.name, plannedMission.r, plannedMission.b, "Room assault failed request spawns")
						// console.log(planId)
						currentMission.memory.ID = 0;
						currentMission.cleanMemory();
						return this.launchOMissionWithPriorities(missionPriorities);
					}

				}
				else {
					console.log(parentRoom.name, plannedMission.r, plannedMission.b, "Room assault failed no plan")
					// Deactive
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				console.log(parentRoom.name, plannedMission.r, plannedMission.b, "Room assault failed on launch")
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_ASSAULT_LARGE) {
			var newMemory = (!currentMission.memory);
			currentMission = new RoomAssaultMission3x3(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)

			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				let plan;

				let maxAccountedForEnemyAttack = (Memory.rooms[plannedMission.r].attackCreepsClose || 3);
				let maxAccountedForEnemyRanged = (Memory.rooms[plannedMission.r].rangedCreepsClose || 6);


				plan = formationCreator.getFormationAssaultSpawnPlan(parentRoom,
														currentMission.memory.targetRoomName,
														currentMission.memory.bestSetupRoom,
														currentMission.memory.e,
														currentMission.memory.closeCombat,
														currentMission.getMinHealPerTowerNeeded(true),
														currentMission.getMaxHealPerTowerNeeded(),
														maxAccountedForEnemyAttack,
														maxAccountedForEnemyRanged,
														false,
														true,
														9,
														false,
														false,
														4,
														true,
														false);

				if (plan) {
					console.log(parentRoom.name, "Launching large assault against", plannedMission.r, "mode", currentMission.closeCombat ? "w" : "r", "boosts", (!plannedMission.b || !hasBoosts) ? "n" : "y")

					currentMission.requestSpawns(!plannedMission.b || !hasBoosts, false);

					// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
					// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 5;
					// }
					if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);
					delete Memory.combatManager.requestedMissions[plannedMission.m][plannedMission.r];
					return currentMission;
				}
				else {
					// Deactive
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_ASSAULT_BLINKY) {
			var newMemory = (!currentMission.memory);
			currentMission = new RoomAssaultBlinky(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)

			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				if (currentMission.requestSpawns()) {
					// Game.notify(parentRoom.name + " Launching assault against " + plannedMission.r + " mode " + (currentMission.closeCombat ? "w" : "r") + " boosts " + ((!plannedMission.b || !hasBoosts) ? " n" : " y"))
					// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
					// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 5;
					// }
					if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);
					return currentMission;
				}
				else {
					console.log(parentRoom.name, plannedMission.r, plannedMission.b, "Room assault blinky, requestSpawns failed")
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				console.log(parentRoom.name, plannedMission.r, plannedMission.b, "Room assault blinky, failed on launch")
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_MEGA_ASSAULT) {
			var newMemory = (!currentMission.memory);
			currentMission = new MegaAssaultMission(currentMission.memory || {}, parentRoom.name, plannedMission.r, true, plannedMission.p)


			// If we've failed recently we don't want to launch straight back into it.
			if (currentMission.isActive()) {
				let maxAccountedForEnemyAttack = (Memory.rooms[plannedMission.r].attackCreepsClose || 3);
				let maxAccountedForEnemyRanged = (Memory.rooms[plannedMission.r].rangedCreepsClose || 6);

				let plan = currentMission.getActualAssaultSpawnPlan(currentMission.closeCombat, 1, currentMission.getMaxHealPerTowerNeeded(), maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, plannedMission.b, !plannedMission.b, false)

				if (plan) {
					let hasBoosts = false
					for (let boostObject of plan.boosts) {
						for (let boostType in boostObject) {
							if (boostObject[boostType]) {
								hasBoosts = true;
								break;
							}
						}
					}

					console.log(parentRoom.name, "Launching MEGA assault against", plannedMission.r, "mode", currentMission.closeCombat ? "w" : "r", "boosts", (!plannedMission.b || !hasBoosts) ? "n" : "y")

					Game.notify(parentRoom.name + " Launching MEGA assault against " + plannedMission.r)

					console.log("I lied, it's not actually launched")
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					return this.launchOMissionWithPriorities(missionPriorities);


					if (currentMission.requestSpawns(!plannedMission.b || !hasBoosts, false)) {
						// Game.notify(parentRoom.name + " Launching assault against " + plannedMission.r + " mode " + (currentMission.closeCombat ? "w" : "r") + " boosts " + ((!plannedMission.b || !hasBoosts) ? " n" : " y"))
						// if (Memory.rooms[plannedMission.r] && Memory.rooms[plannedMission.r].owner) {
						// 	Memory.attackFocus[Memory.rooms[plannedMission.r].owner] = (Memory.attackFocus[Memory.rooms[plannedMission.r].owner] || 0) + 25;
						// }
						Memory.remoteRefreshOffset = (Memory.remoteRefreshOffset || 0) - 500;
						if (newMemory) Memory.combatManager.currentMissions[plannedMission.m].push(currentMission.memory);
						return currentMission;
					}
					else {
						// console.log(planId)
						console.log(JSON.stringify(plan))
						currentMission.memory.ID = 0;
						currentMission.cleanMemory();
						return this.launchOMissionWithPriorities(missionPriorities);
					}

				}
				else {
					console.log(parentRoom.name, plannedMission.r, plannedMission.b, "Room MEGA assault failed no plan")
					// Deactive
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					return this.launchOMissionWithPriorities(missionPriorities);
				}
			}
			else {
				console.log(parentRoom.name, plannedMission.r, plannedMission.b, "Room MEGA assault failed on launch")
				// Constructing it didn't activate it. Next!
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}
		else if (plannedMission.m == MISSION_ROOM_EDGE_ASSAULT) {
			let exits = Game.map.describeExits(plannedMission.r);

			let candidateSetupRooms = [];
			for (let exitDir in exits) {
				if ((exitDir == LEFT && Memory.rooms[plannedMission.r].eWallsL) ||
					(exitDir == RIGHT && Memory.rooms[plannedMission.r].eWallsR) ||
					(exitDir == TOP && Memory.rooms[plannedMission.r].eWallsT) ||
					(exitDir == BOTTOM && Memory.rooms[plannedMission.r].eWallsB)) {

					let fail = false;
					for (let type of [MISSION_ROOM_ASSAULT, MISSION_ROOM_ASSAULT_LARGE, MISSION_ROOM_LOW_ENERGY_ASSAULT, MISSION_ROOM_LOW_ENERGY_ASSAULT_LARGE, MISSION_ROOM_EDGE_ASSAULT]) {
						for (let mission of Memory.combatManager.currentMissions[type]) {
							if (mission.ID) {
								if (mission.bestSetupRoom && mission.bestSetupRoom == exits[exitDir] && mission.targetRoomName && mission.targetRoomName == plannedMission.r) {
									fail = true;
									break
								}
							}
						}
						if (fail) {
							break;
						}
					}

					if (!fail) {
						candidateSetupRooms.push(exits[exitDir]);
					}
				}
			}

			let lowestScore = Infinity;
			let towerDamageAtExit;
			let bestExitRoomName;

			for (let exitDir in exits) {
				if (candidateSetupRooms.includes(exits[exitDir])) {
					if (Game.map.getRoomLinearDistance(parentRoom.name, exits[exitDir]) > 7) {
						continue;
					}

					let dist = safeRoute.getSafeRouteCost(parentRoom.name, exits[exitDir], false)
					if (dist >= 7) continue;

					let towerDamage = 0;

					if (exitDir == LEFT) {
						for (let towerX of Memory.rooms[plannedMission.r].twrX) {
							towerDamage += util.getTowerDamageForDist(towerX - 1)
						}
					}
					else if (exitDir == RIGHT) {
						for (let towerX of Memory.rooms[plannedMission.r].twrX) {
							towerDamage += util.getTowerDamageForDist(48 - towerX)
						}
					}
					else if (exitDir == TOP) {
						for (let towerY of Memory.rooms[plannedMission.r].twrY) {
							towerDamage += util.getTowerDamageForDist(towerY - 1)
						}
					}
					else if (exitDir == BOTTOM) {
						for (let towerY of Memory.rooms[plannedMission.r].twrY) {
							towerDamage += util.getTowerDamageForDist(48 - towerY)
						}
					}

					let score = dist + (towerDamage / Memory.rooms[plannedMission.r].twrX.length) / 100;

					score += parentRoom.memory.spawnUtilization * 10;

					if (score < lowestScore) {
						towerDamageAtExit = towerDamage;
						bestExitRoomName = exits[exitDir];
					}
				}
			}

			if (!bestExitRoomName) {
				return this.launchOMissionWithPriorities(missionPriorities);
			}

			if (this.launchEdgeBounceMission(plannedMission.r, towerDamageAtExit, bestExitRoomName, parentRoom.name)) {
				// Only by request
				delete Memory.combatManager.requestedMissions[plannedMission.m][plannedMission.r];
				return currentMission;
			}
			else {
				return this.launchOMissionWithPriorities(missionPriorities);
			}
		}

		return 0
	},

	requestConnectivityDecon : function(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			return 0
		}

		if (!Memory.rooms[targetRoomName]) {
			return 0;
		}

		if (Memory.rooms[targetRoomName].owner) {
			return 0;
		}

		if (Memory.rooms[targetRoomName].reservedBy) {
			return 0;
		}

		if (!Memory.rooms[targetRoomName].conX) {
			return 0;
		}

		if (scouting.isRoomWhiteListed(targetRoomName)) {
			return 0;
		}

		for (let mission of Memory.combatManager.currentMissions[MISSION_CONNECTIVITY_DECON]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (Game.map.getRoomLinearDistance(room.name, targetRoomName) > 12) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, false, false, false)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false)
			if (dist >= 12) continue;

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;
			if (dist * 50 < CREEP_CLAIM_LIFE_TIME * 0.8 && Game.myRooms.length < Game.gcl.level) {
				score -= 4;
			}

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_CONNECTIVITY_DECON]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new ConnectivityDecon(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					return 0;
				}

				console.log(bestSourceRoom.name + " Launching connectivityDecon against " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_CONNECTIVITY_DECON].push(currentMission.memory);
				return 1;
			}
			return 0;
		}
	},


	requestFormationRemoteDecon : function(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			return 0
		}

		if (Memory.rooms[targetRoomName].owner) {
			return 0;
		}

		// Need vision to select target.
		if (!Game.rooms[targetRoomName]) {
			return 0;
		}

		if (!roomIntel.isTerrainNavigableByMask(targetRoomName, [[0,0],[1,0],[0,1],[1,1]], true)) {
			return 0;
		}

		if (scouting.isRoomWhiteListed(targetRoomName)) {
			return 0;
		}


		for (let mission of Memory.combatManager.currentMissions[MISSION_FORMATION_REMOTE_DECON]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (Game.map.getRoomLinearDistance(room.name, targetRoomName) > 12) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, false, false, false)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false)
			if (dist >= 12) continue;

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_FORMATION_REMOTE_DECON]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new FormationRemoteDecon(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					return 0;
				}

				console.log(bestSourceRoom.name + " Launching formation remote decon against " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_FORMATION_REMOTE_DECON].push(currentMission.memory);
				return 1;
			}
			return 0;
		}
	},



	requestStrongholdAssault : function(targetRoomName, excludedRooms) {
		excludedRooms = excludedRooms || [];
		if (excludedRooms.length > 3) {
			return 0;
		}

		console.log("Stronghold assault", targetRoomName)
		if (Game.cpu.bucket < 2000) {
			if (Math.random() < 0.1) console.log("Stronghold assault BUK")
			return 0
		}

		if (Memory.rooms[targetRoomName].owner != "Invader") {
			if (Math.random() < 0.1) console.log("Stronghold assault OWN", targetRoomName)
			return 0;
		}

		if (!Memory.rooms[targetRoomName].invCH) {
			console.log("Stronghold assault invCH")
			return 0;
		}

		if (Memory.rooms[targetRoomName].invCTTL < Memory.rooms[targetRoomName].invCL * 6000 && !global.roomAssaultCounts[targetRoomName]) {
			if (Math.random() < 0.1) console.log("Stronghold assault decaying too soon")
			return 0;
		}
		if (Memory.rooms[targetRoomName].invCT) {
			if (Math.random() < 0.1) console.log("Stronghold assault still deploying")
			return 0;
		}


		if (scouting.isRoomWhiteListed(targetRoomName)) {
			if (Math.random() < 0.1) console.log("Stronghold assault white")
			return 0;
		}

		if (!missionInfo.canLaunchNewAssault(targetRoomName)) {
			console.log("Stronghold assault canLaunchNewAssault")
			return 0;
		}

		if (Memory.rooms[targetRoomName].noobieZone) {
			if (Math.random() < 0.1) console.log("Stronghold assault noobie 1")
			return 0;
		}

		if (!util.isRoomAccessible(targetRoomName)) {
			if (Math.random() < 0.1) console.log("Stronghold assault noobie 2")
			return 0;
		}

		// Hard stop for Xolym
		if (Memory.season4) {
			let roomCoords = util.getRoomCoords(targetRoomName)
			if (roomCoords.y >= 16) {
				console.log("Stronghold assault Xolym", targetRoomName)
				return 0
			}
		}
		// if (!Memory.botArena && !Memory.rooms[targetRoomName].creepVisited) {
		// 	if ((Memory.rooms[targetRoomName].firstObserveTime || 0) - Date.now() < constants.FIRST_OBSERVE_TO_OUT_OF_NEWBIE_TIME) {
		// 		console.log("Stronghold assault not confirmed not noobie")
		// 		return 0;
		// 	}
		// }
		if ((Memory.timedRound || Memory.season3) && Memory.rooms[targetRoomName].invCL > 3) {
			console.log("Stronghold assault SWC invCL limit")
			return 0; 
		}

		if (Memory.season2 && Memory.rooms[targetRoomName].invCL > 3) {
			console.log("Stronghold assault season2 invCL limit", Memory.rooms[targetRoomName].invCL)
			return 0; 
		}


		let allowFormation = true
		if (!roomIntel.isTerrainNavigableByMask(targetRoomName, [[0,0],[1,0],[0,1],[1,1]], true)) {
			allowFormation = false;
		}

		let missionInProgress = 0;
		let numSourceRooms = 0;

		// Don't allow multi-room attacks on tiny strongholds
		if (Memory.rooms[targetRoomName].invCL < 4) {			
			for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_ASSAULT]) {
				if (mission.targetRoomName == targetRoomName) {
					// Doing this already.
					if (mission.ID) {
						console.log("Stronghold assault ID")
						return 0;
					}
				}
			}
			for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_SNAKE_ASSAULT]) {
				if (mission.targetRoomName == targetRoomName) {
					// Doing this already.
					if (mission.ID) {
						console.log("Stronghold assault ID")
						return 0;
					}
				}
			}
			for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_SNIPE_ASSAULT]) {
				if (mission.targetRoomName == targetRoomName) {
					// Doing this already.
					if (mission.ID) {
						console.log("Stronghold assault ID")
						return 0;
					}
				}
			}
		}
		else {
			for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_MEGA_ASSAULT]) {
				if (mission.targetRoomName == targetRoomName) {
					// Doing this already.
					if (mission.ID) {
						missionInProgress++;
						excludedRooms.push(mission.sourceRoomName)
						numSourceRooms++
					}
				}
			}

			for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_ASSAULT]) {
				if (mission.targetRoomName == targetRoomName) {
					// Doing this already.
					if (mission.ID) {
						missionInProgress++;
						excludedRooms.push(mission.sourceRoomName)
						numSourceRooms++
					}
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;


		let maxRange = missionInProgress ? 8 : 5;

		let renewPriority = Memory.rooms[targetRoomName].invCL == 1
		let lowPriority = false
		let highPriority = Memory.rooms[targetRoomName].invCL <= (Memory.season4 ? 4 : 3)

		// Stack
		if (missionInProgress) {
			if (highPriority) {
				renewPriority = true
				highPriority = false
			}
			else {
				highPriority = true
			}
		}

		if (Memory.privateServer && !Memory.season) {		
			// If it's next to an enemy room, don't bother
			if (Memory.rooms[targetRoomName].closestRoomRange > 2) {				
				let exits = Game.map.describeExits(targetRoomName);
				for (let exitDir in exits) {
					let exitRoomName = exits[exitDir]
					if (Memory.rooms[exitRoomName] && Memory.rooms[exitRoomName].owner && Memory.rooms[exitRoomName].owner != Memory.rooms[targetRoomName].owner && Memory.rooms[exitRoomName].owner != util.getMyName()) {
						renewPriority = false;
						highPriority = false;
						lowPriority = true
					}
				}
			}
		}

		for (let room of Game.myRooms) {
			if (Game.map.getRoomLinearDistance(room.name, targetRoomName) > maxRange) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, renewPriority, lowPriority, highPriority)) {
				continue;
			}
			if (excludedRooms.includes(room.name)) {
				continue;
			}

			if (Memory.rooms[targetRoomName].invCL == 5) {
				// Must have T3 boosts
				if (!room.getAvailableBoost(util.isHealBoost, 3000, function(boost) { return boost == "XLHO2"})) {
					continue;
				}
				if (!room.getAvailableBoost(util.isMoveBoost, 3000, function(boost) { return boost == "XZHO2"})) {
					continue;
				}
				if (!room.getAvailableBoost(util.isRangedBoost, 3000, function(boost) { return boost == "XKHO2"})) {
					continue;
				}
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, false, maxRange, false, true)
			if (dist >= Math.min(10, maxRange * 2)) continue;

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			numSourceRooms++

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}


		if (Memory.disableStrongholds) {
			console.log("Stronghold assault would launch, but you've disabled it with Memory.disableStrongholds")
			return 0;
		}

		// if (Memory.rooms[targetRoomName].invCL == 5) {
		// 	console.log("Stronghold assault would launch, but you've disabled level 5s")
		// 	return 0;
		// }


		if (bestSourceRoom) {
			// Being a bit naughty as using STRONGHOLD_ASSAULT to mean both
			let allowSnipe = Memory.rooms[targetRoomName].invCL <= 3;
			if (Memory.rooms[targetRoomName].missionFailList && Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNIPE_ASSAULT] && Game.time - Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNIPE_ASSAULT] < 5000) {
				allowSnipe = false;
			}

			if (allowSnipe) {
				allowSnipe = allowSnipe && !(StrongholdSnipeAssaultMission.getSnipePoint(targetRoomName) === false)
			}


			if (allowSnipe && (!allowFormation || (Memory.rooms[targetRoomName].invCL >= 2 && Memory.rooms[targetRoomName].invCL <= 4))) {
				let currentMemory = {};
				for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_SNIPE_ASSAULT]) {
					if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
						currentMemory = mission;
						break;
					}
				}
				var newMemory = (!currentMemory.type);
				let currentMission = new StrongholdSnipeAssaultMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

				if (currentMission.isActive()) {
					let spawnSuccessful = currentMission.requestSpawns();

					if (!spawnSuccessful) {
						console.log("Stronghold snipe assault spawn failed")
						Memory.rooms[targetRoomName].missionFailList = Memory.rooms[targetRoomName].missionFailList || {};
						Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNIPE_ASSAULT] = Game.time;
						currentMission.memory.ID = 0;
						currentMission.cleanMemory();
						return 0;
					}

					console.log(bestSourceRoom.name + " Launching stronghold snipe assault against " + targetRoomName)

					if (newMemory) Memory.combatManager.currentMissions[MISSION_STRONGHOLD_SNIPE_ASSAULT].push(currentMission.memory);
					return 1;
				}
				else {
					console.log("Stronghold snipe assault activate failed. ")
					Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNIPE_ASSAULT] = Game.time;
				}
				return 0;

			}

			let allowSnake = Memory.rooms[targetRoomName].invCL <= 4;
			if (Memory.rooms[targetRoomName].missionFailList && Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNAKE_ASSAULT] && Game.time - Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNAKE_ASSAULT] < 5000) {
				allowSnake = false;
			}

			if (allowSnake) {
				allowSnake = allowSnake && !!StrongholdSnakeAssaultMission.getPokePoints(targetRoomName)
			}


			if (allowSnake && (!allowFormation || Memory.rooms[targetRoomName].invCL == 2 || Memory.rooms[targetRoomName].invCL == 3)) {
				let currentMemory = {};
				for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_SNAKE_ASSAULT]) {
					if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
						currentMemory = mission;
						break;
					}
				}
				var newMemory = (!currentMemory.type);
				let currentMission = new StrongholdSnakeAssaultMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

				if (currentMission.isActive()) {
					let spawnSuccessful = currentMission.requestSpawns();

					if (!spawnSuccessful) {
						console.log("Stronghold snake assault spawn failed")
						Memory.rooms[targetRoomName].missionFailList = Memory.rooms[targetRoomName].missionFailList || {};
						Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNAKE_ASSAULT] = Game.time;
						currentMission.memory.ID = 0;
						currentMission.cleanMemory();
						return 0;
					}

					console.log(bestSourceRoom.name + " Launching stronghold snake assault against " + targetRoomName)

					if (newMemory) Memory.combatManager.currentMissions[MISSION_STRONGHOLD_SNAKE_ASSAULT].push(currentMission.memory);
					return 1;
				}
				else {
					console.log("Stronghold snake assault activate failed. ")
					Memory.rooms[targetRoomName].missionFailList[MISSION_STRONGHOLD_SNAKE_ASSAULT] = Game.time;
				}
				return 0;

			}

			// Mega
			if (Memory.rooms[targetRoomName].invCL == 5) {
				// Need at least 3 rooms.
				if (!missionInProgress && numSourceRooms <= 2) {
					console.log("Stronghold assault not enough source rooms for lvl 5. Num:", numSourceRooms)
					return 0;
				}

				if (!Memory.rooms[targetRoomName].numMegaTargetTiles) {
					MegaAssaultMission.testRange3Positions(targetRoomName, [[0,0],[1,0],[0,1],[1,1]], -1, true)
				}


				// Ingoring pathing, so will be >= the real number
				if (!missionInProgress) {
					let requiredTargetTiles = StrongholdMegaAssaultMission.getRequiredNumTargetTiles(targetRoomName)

					if (!Memory.rooms[targetRoomName].numMegaTargetTiles || Memory.rooms[targetRoomName].numMegaTargetTiles < requiredTargetTiles) {
						console.log("Stronghold assault not enough target tiles for lvl 5")
						return 0;
					}
				}

				if (missionInProgress && missionInProgress > Memory.rooms[targetRoomName].numMegaTargetTiles / 5) {
					console.log("Too many ongoing stronghold mega missions", missionInProgress, Memory.rooms[targetRoomName].numMegaTargetTiles)
					return 0;
				}


				// if (Memory.rooms[targetRoomName].invCL == 5) {
				// 	console.log("Stronghold assault would launch, but you've disabled level 5s")
				// 	return 0
				// }


				let currentMemory = {};
				for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_MEGA_ASSAULT]) {
					if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
						currentMemory = mission;
						break;
					}
				}

				var newMemory = (!currentMemory.type);
				let currentMission = new StrongholdMegaAssaultMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

				if (currentMission.isActive()) {
					let spawnSuccessful = currentMission.requestSpawns(false, false);

					if (!spawnSuccessful) {
						console.log("Stronghold mega assault spawn failed from", bestSourceRoom.name)
						currentMission.memory.ID = 0;
						currentMission.cleanMemory();
						excludedRooms.push(bestSourceRoom.name)
						return this.requestStrongholdAssault(targetRoomName, excludedRooms);
					}

					console.log(bestSourceRoom.name + " Launching stronghold mega assault against " + targetRoomName)
					Memory.remoteRefreshOffset = (Memory.remoteRefreshOffset || 0) - 500;
					if (newMemory) Memory.combatManager.currentMissions[MISSION_STRONGHOLD_MEGA_ASSAULT].push(currentMission.memory);
					return 1;
				}
				else {
					console.log("Stronghold mega assault activate failed from", bestSourceRoom.name)
					excludedRooms.push(bestSourceRoom.name)
					return this.requestStrongholdAssault(targetRoomName, excludedRooms);
				}
				return 0;
			}


			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_STRONGHOLD_ASSAULT]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new StrongholdAssaultMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns(Memory.rooms[targetRoomName].invCL == 1 && bestSourceRoom.effectiveLevel == 8, false);

				if (!spawnSuccessful) {
					console.log("Stronghold assault spawn failed from", bestSourceRoom.name)
					currentMission.memory.ID = 0;
					currentMission.cleanMemory();
					excludedRooms.push(bestSourceRoom.name)
					return this.requestStrongholdAssault(targetRoomName, excludedRooms);
				}
				Memory.remoteRefreshOffset = (Memory.remoteRefreshOffset || 0) - 500;
				console.log(bestSourceRoom.name + " Launching stronghold assault against " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_STRONGHOLD_ASSAULT].push(currentMission.memory);
				return 1;
			}
			else {
				console.log("Stronghold assault activate failed from", bestSourceRoom.name)
				excludedRooms.push(bestSourceRoom.name)
				return this.requestStrongholdAssault(targetRoomName, excludedRooms);
			}
			return 0;
		}
		else {
			console.log("Stronghold assault no source room")
			return 0;
		}
	},



	requestRoomAntiCamp : function(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			if (Math.random() < 0.2) console.log("Anti-camp low bucket", targetRoomName)
			return 0
		}
		if (!Game.rooms[targetRoomName]) {
			if (Math.random() < 0.2) console.log("Anti-camp no vis", targetRoomName)
			return 0;
		}
		let mem = Memory.rooms[targetRoomName];

		if (!mem) {
			if (Math.random() < 0.2) console.log("Anti-camp no mem", targetRoomName)
			return 0
		}

		if (mem.owner && mem.twrX && mem.twrX.length) {
			if (Math.random() < 0.2) console.log("Anti-camp towers", targetRoomName)
			return 0;
		}

		if (scouting.isRoomWhiteListed(targetRoomName)) {
			if (Math.random() < 0.2) console.log("Anti-camp white", targetRoomName)
			return 0;
		}

		let currentSourceRooms = []
		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_ANTICAMP]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					currentSourceRooms.push(mission.sourceRoomName)
					if (currentSourceRooms.length >= Memory.empireStrength / 6) {
						if (Math.random() < 0.2) console.log("Anti-camp already", targetRoomName, currentSourceRooms, Memory.empireStrength / 6)
						return 0;
					}
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (Game.map.getRoomLinearDistance(room.name, targetRoomName) > 8) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, false, false, false)) {
				continue;
			}

			if (currentSourceRooms.includes(room.name)) {
				continue
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true)
			if (dist >= 8) continue;

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom && bestSourceRoom.spawns && mem.fullyConnected == 0) {
			let pos = new RoomPosition(Math.round(mem.campSiteX) || 25, Math.round(mem.campSiteY) || 25, targetRoomName)

			let opts = {"avoidEnemyRooms": 1}
			let path = pathCache.getPath(bestSourceRoom.spawns[0].pos, pos, 1, 1, false, true, opts);

			console.log("Path for anticamp", bestSourceRoom, targetRoomName, JSON.stringify(path))
			if (path.incomplete || path.usedFindRoute) {
				delete Memory.combatManager.requestedMissions["roomAntiCamp"][targetRoomName]
				if (Math.random() < 0.2) console.log("Anti-camp can't find path", targetRoomName)
				return false;
			}

			// return false;
		}



		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_ANTICAMP]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new RoomAntiCampMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					currentMission.cleanMemory();
					currentMission.memory.ID = 0;
					if (Math.random() < 0.2) console.log("Anti-camp spawn failed", targetRoomName)
					return false;
				}

				console.log(bestSourceRoom.name + " Launching anti camp against " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_ANTICAMP].push(currentMission.memory);
				return true;
			}
			if (Math.random() < 0.2) console.log("Anti-camp activate failed", targetRoomName)
			return false;
		}

		if (Math.random() < 0.2) console.log("Anti-camp no best source room", targetRoomName)
	},

	requestRoomEconSupportMission : function(targetRoomName) {
		if (Memory.swc && Memory.banzai) {
			if (Math.random() < 0.001) {
				console.log("Not allowing requestRoomEconSupportMission in Bazai mode")
			}
			return 0
		}

		if (Game.gcl <= 2) {
			return 0 
		}

		if (Game.cpu.bucket < 2000) {
			if (Math.random() < 0.2) console.log("Econ support low bucket", targetRoomName)
			return 0
		}
		if (!Game.rooms[targetRoomName] /*|| Game.rooms[targetRoomName].spawns.length == 0*/) {
			if (Math.random() < 0.2) console.log("Econ support no spawns in target room", targetRoomName)
			return 0;
		}

		// if (Game.rooms[targetRoomName].terminal) {
		// if (Game.rooms[targetRoomName].effectiveLevel >= 7 && Game.rooms[targetRoomName].terminal) {
		// 	if (Math.random() < 0.2) console.log("Econ support target room is fine?", targetRoomName)
		// 	return 0;
		// }

		// Boom mode tweaks the energy requirements in restrictOffensiveMissions. Counteract that a bit
		let highPriority = !Game.rooms[targetRoomName].storage || (Game.rooms[targetRoomName].storage.store[RESOURCE_ENERGY] < (Memory.boomMode ? 210000 : 200000) || (Memory.rooms[targetRoomName].spawnUtilization || 0) > 0.9);
		let midPriority = (Game.rooms[targetRoomName].storage && Game.rooms[targetRoomName].storage.store[RESOURCE_ENERGY] < (Memory.boomMode ? 320000 : 300000)) || (Memory.rooms[targetRoomName].spawnUtilization || 0) > 0.8;

		if (Memory.season2) {
			highPriority = 1
			midPriority = 0
		}
		if (Memory.season5 && Memory.rooms[targetRoomName].claimToUnclaimRoom) {
			highPriority = 1
			midPriority = 0
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		let maxRange = 17 - Game.rooms[targetRoomName].defcon;

		for (let room of Game.myRooms) {
			if (room.effectiveLevel < 7) {
				continue;
			}
			if (room.effectiveLevel <= Game.rooms[targetRoomName].effectiveLevel) {
				if (room.effectiveLevel < Game.rooms[targetRoomName].effectiveLevel) {
					continue;
				}
				else if (room.mem.spawnUtilization + 0.2 > Memory.rooms[targetRoomName].spawnUtilization) {
					continue
				}
			}

			let score = 0

			let refreshPriority = false
			if (Memory.rooms[targetRoomName].supportFrom == room.name) {
				refreshPriority = true
				score -= 3
			}

			// if (Game.map.getRoomLinearDistance(room.name, targetRoomName) > maxRange) {
			// 	continue;
			// }
			// targetRoomName, renew, lowPriority, highPriority, predictedEnergyCost
			if (room.restrictOffensiveMissions(targetRoomName, refreshPriority, !midPriority && !highPriority && !refreshPriority, highPriority && !refreshPriority)) {
				continue;
			}


			// if (Memory.season2 && util.getCentreRoomForRoomName(targetRoomName) != util.getCentreRoomForRoomName(room.name)) {
			// 	continue
			// }

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true)
			if (dist >= maxRange) continue;

			score += -room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				let already = false
				for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_ECON_SUPPORT]) {
					if (mission.ID && mission.targetRoomName == targetRoomName && mission.sourceRoomName == room.name) {
						already = true;
						mission.highPriority = highPriority
						mission.midPriority = midPriority
						break
					}
				}

				if (!already) {					
					lowestScore = score;
					bestSourceRoom = room;
				}
			}
		}

		if (Math.random() < 0.2) console.log("requestRoomEconSupportMission", targetRoomName, bestSourceRoom)


		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_ECON_SUPPORT]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new RoomEconSupportMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			// console.log("requestRoomEconSupportMission", JSON.stringify(currentMemory), bestSourceRoom.name, targetRoomName, currentMission.isActive())

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				currentMission.memory.highPriority = highPriority
				currentMission.memory.midPriority = midPriority


				// console.log("requestRoomEconSupportMission", targetRoomName, bestSourceRoom, spawnSuccessful)

				if (!spawnSuccessful) {
					currentMission.cleanMemory();
					currentMission.memory.ID = 0;
					return false;
				}

				console.log(bestSourceRoom.name + " Launching econ support to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_ECON_SUPPORT].push(currentMission.memory);
				return true;
			}
			return false;
		}
	},



	requestRoomChildHeavyMine : function(targetRoomName, sourceRoomName) {
		let bestSourceRoom = Game.rooms[sourceRoomName]
		if (bestSourceRoom.restrictOffensiveMissions(targetRoomName, false, false, true)) {
			return false;
		}

		let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_CHILD_HEAVY_MINE]) {
			if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
				currentMemory = mission;
				if (mission.ID) {
					return false
				}
				break;
			}
		}
		var newMemory = (!currentMemory.type);
		let currentMission = new ChildHeavyMine(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

		// console.log("requestRoomEconSupportMission", JSON.stringify(currentMemory), bestSourceRoom.name, targetRoomName, currentMission.isActive())

		if (currentMission.isActive()) {
			let spawnSuccessful = currentMission.requestSpawns();

			if (!spawnSuccessful) {
				currentMission.cleanMemory();
				currentMission.memory.ID = 0;
				return false;
			}

			console.log(bestSourceRoom.name + " Launching child heavy mine to to " + targetRoomName)

			if (newMemory) Memory.combatManager.currentMissions[MISSION_CHILD_HEAVY_MINE].push(currentMission.memory);
			return true;
		}
		return false;		
	},



	launchEdgeBounceMission(targetRoomName, towerDamageAtExit, bestExitRoomName, sourceRoomName) {
		let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_ROOM_EDGE_ASSAULT]) {
			if (mission.bestSetupRoom == bestExitRoomName && mission.targetRoomName == targetRoomName) {
				if (mission.sourceRoomName == sourceRoomName) {
					currentMemory = mission;
					break;
				}
				// Somebody else is doing it.
				else if (mission.ID) {
					return false;
				}
			}
		}

		var newMemory = (!currentMemory.type);
		let currentMission = new RoomEdgeAssaultMission(currentMemory || {}, sourceRoomName, targetRoomName, bestExitRoomName, true)

		if (currentMission.isActive()) {
			currentMission.setTowerDamage(towerDamageAtExit);

			let spawnSuccessful = currentMission.requestSpawns(1);

			if (!spawnSuccessful) {
				spawnSuccessful = currentMission.requestSpawns(2);
			}
			if (!spawnSuccessful) {
				spawnSuccessful = currentMission.requestSpawns(3);
			}
			if (!spawnSuccessful) {
				spawnSuccessful = currentMission.requestSpawns(4);
			}
			if (!spawnSuccessful) {
				currentMission.memory.ID = 0;
				currentMission.cleanMemory();
				return false;
			}

			console.log(sourceRoomName + " Launching edge attack against " + targetRoomName + " from "+ bestExitRoomName)

			if (Memory.rooms[targetRoomName] && Memory.rooms[targetRoomName].owner) {
				Memory.attackFocus[Memory.rooms[targetRoomName].owner] = (Memory.attackFocus[Memory.rooms[targetRoomName].owner] || 0) + 3;
			}

			if (newMemory) Memory.combatManager.currentMissions[MISSION_ROOM_EDGE_ASSAULT].push(currentMission.memory);
			return true;
		}
		return false;
	},



	requestHeavyCreepHold(targetRoomName) {
		RoomHeavyCreepHold.requestHeavyCreepHold(targetRoomName)
	},

	// Phat creeps go and run around a room defending it
	requestHeavyRoomHold(targetRoomName, alliesPriority, ally) {
		if (intelAI.getMaxHate() < 1000) {
			return
		}
		Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_CREEP_HOLD][targetRoomName] = Game.time;
		
		if (!ally) Memory.combatManager.requestedMissions[MISSION_ROOM_HEAVY_CREEP_RANGED_HOLD][targetRoomName] = Game.time;
		if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].controller && Game.rooms[targetRoomName].controller.my && Game.rooms[targetRoomName].effectiveLevel < 3) {
			Memory.combatManager.requestedMissions[MISSION_ROOM_ANTICAMP][targetRoomName] = Game.time;
		}

		if (!ally) this.requestRoomAntiCamp(targetRoomName)
		RoomHeavyCreepHold.requestHeavyCreepHold(targetRoomName, alliesPriority)
		if (!ally) RoomHeavyCreepRangedHold.requestHeavyCreepRangedHold(targetRoomName, alliesPriority)
	},


	requestPowerRaid(targetRoomName, amount) {
		console.log("Power raid disabled for now")
		return 0
		if (Game.cpu.bucket < 2000) {
			console.log("Power raid low bucket")
			return 0
		}
		if (!Game.rooms[targetRoomName]) {
			console.log("Power raid not vis")
			return 0;
		}

		// if (true) {
		// 	console.log("Power raid disabled manually")
		// 	return 0;
		// }

		for (let mission of Memory.combatManager.currentMissions[MISSION_POWER_RAID]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("Power raid already", targetRoomName)
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.effectiveLevel < (Memory.season3 ? 5 : 7)) {
				continue;
			}
			if (Game.map.getRoomLinearDistance(room.name, targetRoomName) > Math.ceil(amount / 1000)) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, false, false, false) && room.restrictPowerMissions(amount)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false)
			if (dist >= amount / 1000) continue;

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_POWER_RAID]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new PowerRaidMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Power raid failed spawn")
					currentMission.cleanMemory();
					currentMission.memory.ID = 0;
					return false;
				}

				console.log(bestSourceRoom.name + " Launching power raid to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_POWER_RAID].push(currentMission.memory);
				return true;
			}
			console.log("Power raid failed active")
			return false;
		}
		else {
			console.log("Power raid no source room")
		}
	},



	requestResourcesRaid(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			console.log("Resource raid low bucket", targetRoomName)
			return 0
		}
		// if (true) {
		// 	console.log("Power raid disabled manually")
		// 	return 0;
		// }

		for (let mission of Memory.combatManager.currentMissions[MISSION_POWER_RAID]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("Resource raid already with power raid", targetRoomName)
					return 0;
				}
			}
		}
		for (let mission of Memory.combatManager.currentMissions[MISSION_RESOURCE_RAID]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("Resource raid already with resource raid", targetRoomName)
					return 0;
				}
			}
		}

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.effectiveLevel < 7) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, false, false, false)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false, false, 7)
			if (dist > 7) continue
			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom) {
			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_RESOURCE_RAID]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new ResourceRaidMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Resource raid failed spawn", targetRoomName)
					currentMission.cleanMemory();
					currentMission.memory.ID = 0;
					return false;
				}

				console.log(bestSourceRoom.name + " Launching resource raid to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_RESOURCE_RAID].push(currentMission.memory);
				return true;
			}
			console.log("Resource raid failed active", targetRoomName)
			return false;
		}
		else {
			console.log("Resource raid no source room", targetRoomName)
		}
	},



	requestDepositFarmMission(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			if (Math.random() < 0.2) console.log("Deposit farm low bucket", targetRoomName)
			return 0
		}

		if (Memory.botArena && !Memory.season4) {
			console.log("Deposit farm disabled Memory.botArena")
			return 0
		}

		let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_DEPOSIT_FARM]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					if (Math.random() < 0.2) console.log("Deposit farm already", targetRoomName)
					return 0;
				}
				else {		
					if (Math.random() < 0.2) console.log("Deposit farm old memory", JSON.stringify(mission.memory))		
					currentMemory = mission;
					break;
				}
			}
		}

		var newMemory = (!currentMemory.type);
		let currentMission = new DepositFarmMission(currentMemory || {}, targetRoomName, true)

		if (currentMission.isActive()) {
			console.log("Launching deposit farm on sector " + targetRoomName + newMemory + JSON.stringify(currentMission.memory))

			if (newMemory) {
				Memory.combatManager.currentMissions[MISSION_DEPOSIT_FARM].push(currentMission.memory);
			}
			return true;
		}
		if (Math.random() < 0.2) console.log("Deposit farm failed active", targetRoomName)
		return false;
	},

	requestDepositHarvestMission(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			console.log("Deposit harvest low bucket", targetRoomName)
			return 0
		}

		if (Memory.season4) {
			let roomCoords = util.getRoomCoords(targetRoomName)
			if (roomCoords.y >= 16) {
				console.log("Depost harvest Xolym", targetRoomName)
				return 0
			}
		}

		// if (Memory.botArena) {
		// 	console.log("Deposit harvest disabled on botarena")
		// 	return 0 
		// }

		let depositInfo = Memory.commoditiesManager.extraDeposits[targetRoomName];

		if (!depositInfo) {
			console.log("Deposit harvest no info", targetRoomName)
			return 0
		}

		let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_DEPOSIT_HARVEST]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("Deposit harvest already", targetRoomName)
					return 0;
				}
				else {				
					currentMemory = mission;
					break;
				}
			}
		}

		var newMemory = (!currentMemory.type);
		let currentMission = new DepositHarvestMission(currentMemory || {}, targetRoomName, depositInfo, true)

		if (currentMission.isActive()) {
			console.log("Launching deposit harvest on room " + targetRoomName)
			let spawnSuccessful = currentMission.requestSpawns();

			if (!spawnSuccessful) {
				console.log("Deposit harvest failed spawn", targetRoomName)
				currentMission.cleanMemory();
				currentMission.memory.ID = 0;
				return false;
			}

			if (newMemory) {
				Memory.combatManager.currentMissions[MISSION_DEPOSIT_HARVEST].push(currentMission.memory);
			}
			return true;
		}
		console.log("Deposit harvest failed active", targetRoomName)
		return false;
	},

	requestSeasonalDropWallRemove(targetRoomName) {
		if (Game.cpu.bucket < 1000) {
			console.log("SDWR low bucket", targetRoomName)
			return 0
		}
		let mem = Memory.rooms[targetRoomName]

		if (!mem) {
			if (Math.random() < 0.01) console.log("SDWR failed (no mem)", targetRoomName)
			return 0
		}
		if (mem.seasonDropOffAvailable) {
			if (Math.random() < 0.01) console.log("SDWR failed (dropoff available)", targetRoomName)
			return 0
		}
		if (!mem.seasonWallsToRemove || !mem.seasonWallsToRemove.length || !mem.numSeasonDismantlePositions) {
			console.log("SDWR failed (seasonWallsToRemove bad)", targetRoomName)
			return 0
		}

		if (mem.DT > 1 && (!Memory.season2 || targetRoomName != "W9S10")) {
			console.log("SDWR failed (dangerous) 1", targetRoomName)
			return 0
		}
		if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].dangerous && (!Memory.season2 || targetRoomName != "W9S10")) {
			console.log("SDWR failed (dangerous) 2", targetRoomName)
			return 0
		}

		// Fuckit, manual hack
		// if (!Memory.anySeasonDropOffAvailable && targetRoomName != "E20S10") {
		// 	if (Math.random() < 0.01) console.log("SDWR failed not E20S10")
		// 	return 0
		// }

		// let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_WALL_REMOVE]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					if (Math.random() < 0.01) console.log("SDWR already", targetRoomName)
					return 0;
				}
				// else {				
				// 	currentMemory = mission;
				// 	break;
				// }
			}
			// else if (mission.ID && !Memory.anySeasonDropOffAvailable) {
			// 	if (Math.random() < 0.01) console.log("SDWR only one allowed")
			// 	return 0;
			// }
		}

		let maxRange = 6;
		// Need it long range right now
		if (Memory.season2) {
			maxRange = 14;
		}

		let minDist = Infinity
		let bestSourceRoom
		for (let room of Game.myRooms) {
			// if (!Memory.anySeasonDropOffAvailable && room.name != "E18S8") {
			// 	continue
			// }
			let renewPriority = Memory.season2 || (!room.upgradeFocus && room.mem.closestDropOff == targetRoomName) || Memory.rooms[targetRoomName].seasonWallsToRemove.length == 1

			// Only hit the closest while the closest is unopened
			if (Memory.season1 && room.mem.closestDropOff && targetRoomName != room.mem.closestDropOff && !Memory.rooms[room.mem.closestDropOff].seasonDropOffAvailable) continue

			if (room.defcon < 5) continue
			// No hurry 
			if (room.effectiveLevel < 7) continue

			if (!room.storage) continue
			if (room.restrictOffensiveMissions(undefined, renewPriority, false, !renewPriority)) continue
			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false, false, maxRange)
			// let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false, false, (Memory.season2 ? 5 : 6))
			if (dist < minDist) {
				minDist = dist;
				bestSourceRoom = room;
			}
		}

		if (minDist > maxRange || !bestSourceRoom) {
			if (Math.random() < 0.01) console.log("SDWR failed (not validDropPoint)", targetRoomName)
			return 0
		}

		// if (true) {
		// 	console.log("SDWR disabled but would launch", targetRoomName)
		// 	return 0
		// }

		let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_WALL_REMOVE]) {
			if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
				currentMemory = mission;
				break;
			}
		}


		var newMemory = (!currentMemory.type);
		let currentMission = new SeasonalDropWallRemove(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

		if (currentMission.isActive()) {
			console.log("Launching SDWR on room " + targetRoomName, "from", bestSourceRoom.name)
			let spawnSuccessful = currentMission.requestSpawns();

			if (!spawnSuccessful) {
				console.log("SDWR failed spawn")
				currentMission.cleanMemory();
				currentMission.memory.ID = 0;
				return false;
			}

			if (newMemory) {
				Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_WALL_REMOVE].push(currentMission.memory);
			}
			return true;
		}
		console.log("SDWR failed active")
		return false;
	},


	requestSeasonalDropWallRepair(targetRoomName) {
		if (Game.cpu.bucket < 1000) {
			console.log("SDWR low bucket", targetRoomName)
			return 0
		}
		let mem = Memory.rooms[targetRoomName]

		if (!mem) {
			if (Math.random() < 0.01) console.log("SDWR failed (no mem)", targetRoomName)
			return 0
		}
		if (mem.seasonDropOffAvailable) {
			if (Math.random() < 0.01) console.log("SDWR failed (dropoff available)", targetRoomName)
			return 0
		}
		if (!mem.seasonWallsToRemove || !mem.seasonWallsToRemove.length || !mem.numSeasonDismantlePositions) {
			console.log("SDWR failed (seasonWallsToRemove bad)", targetRoomName)
			return 0
		}

		if (mem.DT > 1) {
			console.log("SDWR failed (dangerous)", targetRoomName)
			return 0
		}
		if (Game.rooms[targetRoomName] && Game.rooms[targetRoomName].dangerous) {
			console.log("SDWR failed (dangerous)", targetRoomName)
			return 0
		}

		// Fuckit, manual hack
		// if (!Memory.anySeasonDropOffAvailable && targetRoomName != "E20S10") {
		// 	if (Math.random() < 0.01) console.log("SDWR failed not E20S10")
		// 	return 0
		// }

		// let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_WALL_REPAIR]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					if (Math.random() < 0.01) console.log("SDWR already", targetRoomName)
					return 0;
				}
				// else {				
				// 	currentMemory = mission;
				// 	break;
				// }
			}
			// else if (mission.ID && !Memory.anySeasonDropOffAvailable) {
			// 	if (Math.random() < 0.01) console.log("SDWR only one allowed")
			// 	return 0;
			// }
		}

		let maxRange = 6;
		// Need it long range right now
		if (Memory.season2) {
			maxRange = 14;
		}

		let minDist = Infinity
		let bestSourceRoom
		for (let room of Game.myRooms) {
			// if (!Memory.anySeasonDropOffAvailable && room.name != "E18S8") {
			// 	continue
			// }

			if (room.name != "W12N4" && room.name != "W8N7" && targetRoomName == "W6N0") {
				if (Math.random() < 0.001) console.log("Only launching drop repair from certain rooms")
				continue
			}

			let renewPriority = Memory.season2 || (!room.upgradeFocus && room.mem.closestDropOff == targetRoomName) || Memory.rooms[targetRoomName].seasonWallsToRemove.length == 1

			if (room.defcon < 5) continue
			// No hurry 
			if (room.effectiveLevel < 7) continue

			if (!room.storage) continue
			if (room.restrictOffensiveMissions(undefined, renewPriority, false, !renewPriority)) continue
			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false, false, maxRange)
			// let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false, false, (Memory.season2 ? 5 : 6))
			if (dist < minDist) {
				minDist = dist;
				bestSourceRoom = room;
			}
		}

		if (minDist > maxRange || !bestSourceRoom) {
			if (Math.random() < 0.01) console.log("SDWR failed (not validDropPoint)", targetRoomName)
			return 0
		}

		// if (true) {
		// 	console.log("SDWR disabled but would launch", targetRoomName)
		// 	return 0
		// }

		let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_WALL_REPAIR]) {
			if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
				currentMemory = mission;
				break;
			}
		}


		var newMemory = (!currentMemory.type);
		let currentMission = new SeasonalDropWallRepair(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

		if (currentMission.isActive()) {
			console.log("Launching SDWR on room " + targetRoomName, "from", bestSourceRoom.name)
			let spawnSuccessful = currentMission.requestSpawns();

			if (!spawnSuccessful) {
				console.log("SDWR failed spawn")
				currentMission.cleanMemory();
				currentMission.memory.ID = 0;
				return false;
			}

			if (newMemory) {
				Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_WALL_REPAIR].push(currentMission.memory);
			}
			return true;
		}
		console.log("SDWR failed active")
		return false;
	},


	requestSeasonGapRaid(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			console.log("Season gap raid low bucket", targetRoomName)
			return 0
		}

		let mem = Memory.rooms[targetRoomName]

		// if (!mem) {
		// 	if (Math.random() < 0.01) console.log("Season gap raid failed (no mem)", targetRoomName)
		// 	return 0
		// }

		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_GAP_RAID]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("Season gap raid already with raid", targetRoomName)
					return 0;
				}
			}
		}


		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			// if (room.name != "W19S8" && room.name != "W23S14" && room.name != "W12S3" && targetRoomName == "W6S20") {
			// 	if (Math.random() < 0.01) console.log("Gap raids must be from W19S8 or W23S14 or W12S3")
			// 	continue
			// }
			// if (room.name != "W19S8" && room.name != "W12S3" && targetRoomName == "W7S0") {
			// 	if (Math.random() < 0.01) console.log("Gap raids must be from W19S8 or W12S3")
			// 	continue
			// }

			// Season 3 hacks
			if (room.effectiveLevel < 6) {
				continue;
			}

			let refreshPriority = true
			let lowPriority = false
			let highPriority = false


			if (room.restrictOffensiveMissions(targetRoomName, refreshPriority, lowPriority, highPriority)) {
				continue;
			}

			let dist

			// if ((room.name == "W19S8" || room.name == "W23S14") && targetRoomName == "W6S20") {
			// 	dist = 0
			// }
			// else if ((room.name == "W19S8" || room.name == "W12S3") && targetRoomName == "W7S0") {
			// 	dist = 0
			// }
			// else {
				let maxDist = 15

				// if (targetRoomName == "W7S4") {
				// 	maxDist = 18
				// }
				// if (targetRoomName == "W6S20") {
				// 	maxDist = 22
				// }

				dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, false, maxDist)
				if (dist > maxDist) {
					continue
				}
			// }

			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom) {

			// console.log("Season gap raid wants to launch", bestSourceRoom.name, targetRoomName)
			// return;


			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_GAP_RAID]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new SeasonalGapRaid(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Season gap raid failed spawn", targetRoomName)
					currentMission.cleanMemory();
					currentMission.memory.ID = 0;
					return false;
				}

				console.log(bestSourceRoom.name + " Launching season gap raid to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_SEASONAL_GAP_RAID].push(currentMission.memory);
				return true;
			}
			console.log("Season gap raid failed active", targetRoomName)
			return false;
		}
		else {
			console.log("Season gap raid no source room", targetRoomName)
		}
	},

	requestSeasonDropRaid(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			console.log("Season drop raid low bucket", targetRoomName)
			return 0
		}

		let mem = Memory.rooms[targetRoomName]

		if (!mem) {
			if (Math.random() < 0.01) console.log("Season drop raid failed (no mem)", targetRoomName)
			return 0
		}
		// if (!mem.seasonDropOffAvailable) {
		// 	if (Math.random() < 0.01) console.log("Season drop raid failed (!dropoff available)", targetRoomName)
		// 	return 0
		// }
		if (mem.seasonDropOffAvailable && (!mem.hostileScoreOwners || !mem.hostileScoreOwners.length)) {
			if (Math.random() < 0.01) console.log("Season drop raid failed (!score owners)", targetRoomName)
			return 0
		}

		if (!mem.seasonDropOffAvailable && (!mem.hostileDiggerOwners || !mem.hostileDiggerOwners.length)) {
			if (Math.random() < 0.01) console.log("Season drop raid failed (!digger owners)", targetRoomName)
			return 0
		}
		else if (!mem.seasonDropOffAvailable) {
			for (let room of Game.myRooms) {
				if (room.mem.closestDropOff == targetRoomName) {
					if (Math.random() < 0.01) console.log("Season drop raid failed (helping me dig!)", targetRoomName)
					return 0
				}
			}
		}

		let enoughHate = false
		if (mem.seasonDropOffAvailable) {			
			for (let playerName of mem.hostileScoreOwners) {
				if (scouting.isPlayerSoftWhiteListed(playerName)) {
					continue
				}
				enoughHate = true
				// if (Memory.stats.hateCounter[playerName] > 100000) {
				// 	enoughHate = true;
				// 	break
				// }
			}
		}
		else {			
			for (let playerName of mem.hostileDiggerOwners) {
				if (scouting.isPlayerSoftWhiteListed(playerName)) {
					continue
				}
				if (Memory.stats.hateCounter[playerName] > 100000) {
					enoughHate = true;
					break
				}
			}
		}

		if (!enoughHate) {
			if (Math.random() < 0.01) console.log("Season drop raid failed (!enough hate)", targetRoomName)
			return 0
		}


		for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_RAID]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					console.log("Season drop raid already with raid", targetRoomName)
					return 0;
				}
			}
		}


		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.effectiveLevel < 7) {
				continue;
			}
			if (room.restrictOffensiveMissions(targetRoomName, false, false, false)) {
				continue;
			}

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, true, false, 20)
			if (dist > 20) continue
			let score = room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 10;

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		if (bestSourceRoom) {

			// console.log("Season drop raid wants to launch", bestSourceRoom.name, targetRoomName)
			// return;


			let currentMemory = {};
			for (let mission of Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_RAID]) {
				if (mission.targetRoomName == targetRoomName && mission.sourceRoomName == bestSourceRoom.name) {
					currentMemory = mission;
					break;
				}
			}
			var newMemory = (!currentMemory.type);
			let currentMission = new SeasonalDropRaid(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Season drop raid failed spawn", targetRoomName)
					currentMission.cleanMemory();
					currentMission.memory.ID = 0;
					return false;
				}

				console.log(bestSourceRoom.name + " Launching season drop raid to " + targetRoomName)

				if (newMemory) Memory.combatManager.currentMissions[MISSION_SEASONAL_DROP_RAID].push(currentMission.memory);
				return true;
			}
			console.log("Season drop raid failed active", targetRoomName)
			return false;
		}
		else {
			console.log("Season drop raid no source room", targetRoomName)
		}
	},

	requestPowerHarvestMission(targetRoomName) {
		if (Game.cpu.bucket < 2000) {
			if (Math.random() < 0.01) console.log("Power harvest low bucket")
			return 0
		}

		if (!Game.rooms[targetRoomName]) {
			console.log("Power harvest no vis")
			return 0
		}

		if (!Game.rooms[targetRoomName].powerBanks.length) {
			console.log("Power harvest no banks")
			return 0
		}

		let currentMemory = {};
		for (let mission of Memory.combatManager.currentMissions[MISSION_POWER_HARVEST]) {
			if (mission.targetRoomName == targetRoomName) {
				// Doing this already.
				if (mission.ID) {
					if (Math.random() < 0.01) console.log("Power harvest already", targetRoomName)
					return 0;
				}
			}
		}

		let amount = Game.rooms[targetRoomName].powerBanks[0].power

		let lowestScore = Infinity;
		let bestSourceRoom;

		for (let room of Game.myRooms) {
			if (room.effectiveLevel < (Memory.season3 ? 5 : 7)) {
				continue;
			}
			if (room.restrictPowerMissions(amount)) {
				continue;
			}

			if (Memory.season2) {
				if (util.getCentreRoomForRoomPos(Game.rooms[targetRoomName].powerBanks[0].pos) != util.getCentreRoomForRoomName(room.name)) {
					continue
				}
				global.inTickObject.ignoreSeason2Walls = 1
			}

			let maxRange = room.mem.maxPowerRange || constants.MAX_POWER_RANGE

			let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false, false, maxRange)
			delete global.inTickObject.ignoreSeason2Walls
			if (dist > maxRange) continue
			let score

			if (Memory.season3) {
				// Effective level is not meaningful in season 3, we just want to minimize distance
				score = dist + room.memory.spawnUtilization * 5;
			}
			else {
				score = -room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 5;
			}

			if (score < lowestScore) {
				lowestScore = score;
				bestSourceRoom = room;
			}
		}

		// This is a bit lazy? Someone wants it and can grab it, but want to favour the closest room, so try to reduce the restrict
		if (bestSourceRoom) {			
			for (let room of Game.myRooms) {
				if (room.effectiveLevel < (Memory.season3 ? 5 : 7)) {
					continue;
				}
				if (room.restrictPowerMissions(amount * 4)) {
					continue;
				}
				if (Memory.season2) {
					if (util.getCentreRoomForRoomPos(Game.rooms[targetRoomName].powerBanks[0].pos) != util.getCentreRoomForRoomName(room.name)) {
						continue
					}
					global.inTickObject.ignoreSeason2Walls = 1
				}

				let maxRange = room.mem.maxPowerRange || constants.MAX_POWER_RANGE

				let dist = safeRoute.getSafeRouteCost(room.name, targetRoomName, false, false, maxRange)
				delete global.inTickObject.ignoreSeason2Walls

				if (dist > maxRange) continue
				let score

				if (Memory.season3) {
					// Effective level is not meaningful in season 3, we just want to minimize distance
					score = dist + room.memory.spawnUtilization * 5;
				}
				else {
					score = -room.effectiveLevel * 2 + dist + room.memory.spawnUtilization * 5;
				}

				if (score < lowestScore) {
					lowestScore = score;
					bestSourceRoom = room;
				}
			}
		}

		if (bestSourceRoom) {
			var newMemory = (!currentMemory.type);
			let currentMission = new PowerHarvestMission(currentMemory || {}, bestSourceRoom.name, targetRoomName, true)

			if (currentMission.isActive()) {
				console.log("Launching power harvest on room ", targetRoomName)
				let spawnSuccessful = currentMission.requestSpawns();

				if (!spawnSuccessful) {
					console.log("Power harvest failed spawn", targetRoomName)
					currentMission.cleanMemory();
					currentMission.memory.ID = 0;
					return false;
				}

				if (newMemory) {
					Memory.combatManager.currentMissions[MISSION_POWER_HARVEST].push(currentMission.memory);
				}
				return true;
			}
			console.log("Power harvest failed active", targetRoomName)
			return false;
		}
		else {
			console.log("Power harvest no source room", targetRoomName)
			return false;
		}
	},

	requestNukeFollowMission(targetRoomName) {
		if (intelAI.getMaxHate() < 1000) {
			return
		}

		const mem = Memory.rooms[targetRoomName]

		if (mem && Game.shard.name == "shard2" && mem.rcl && mem.nukeLandTime - Game.time < 1300 && mem.nukeLandTime - Game.time > 300 && !mem.rampHP && !mem.wallHP) {
			Memory.combatManager.requestedMissions[MISSION_ROOM_ASSAULT_NUKE_FOLLOW][targetRoomName] = Game.time;
			RoomAssaultNukeFollow.requestNukeFollowAssault(targetRoomName)
		}



	},
};

module.exports = combatManager;