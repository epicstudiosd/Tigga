
/**
Module: prototype.Room.structures
Author: SemperRabbit
Date:   20180309
Usage:  require('prototype.Room.structures');

This module will provide structure caching and extends the Room
  class' prototype to provide `room.controller`-like properties
  for all structure types. It will cache the object IDs of a
  room.find() grouped by type as IDs in global. Once the property
  is requested, it will chech the cache (and refresh if required),
  then return the appropriate objects by maping the cache's IDs
  into game objects for that tick.
*/

var roomStructures           = {};
var roomStructuresExpiration = {};
var roomStructuresLastSet = {};

const CACHE_TIMEOUT = 50;
const CACHE_OFFSET  = 4;

const multipleList = [
    STRUCTURE_SPAWN,        STRUCTURE_EXTENSION,    STRUCTURE_ROAD,         STRUCTURE_WALL,
    STRUCTURE_RAMPART,      STRUCTURE_KEEPER_LAIR,  STRUCTURE_PORTAL,       STRUCTURE_LINK,
    STRUCTURE_TOWER,        STRUCTURE_LAB,          STRUCTURE_CONTAINER,    STRUCTURE_POWER_BANK
];

let singleList;

singleList = [
    STRUCTURE_OBSERVER,     STRUCTURE_POWER_SPAWN,  STRUCTURE_EXTRACTOR,
    STRUCTURE_NUKER,        STRUCTURE_FACTORY,      STRUCTURE_INVADER_CORE
];



function getCacheExpiration(){
    return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}


Room.prototype._checkRoomCache = function _checkRoomCache(){
    // if cache is expired or doesn't exist
    if(!roomStructuresExpiration[this.name] || !roomStructures[this.name] || roomStructuresExpiration[this.name] < Game.time || (this.dangerous === 2 && (roomStructuresLastSet[this.name] || 0) != Game.time)) {
        roomStructuresLastSet[this.name] = Game.time;
        roomStructuresExpiration[this.name] = Game.time + getCacheExpiration();
        roomStructures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), s=>s.structureType);
        var i;
        for(i in roomStructures[this.name]){
            roomStructures[this.name][i] = _.map(roomStructures[this.name][i], s=>s.id);
        }
    }
}

Room.prototype.clearStructuresCache = function _clearStructuresCache() {
    delete roomStructures[this.name]
}

multipleList.forEach(function(type){
    Object.defineProperty(Room.prototype, type+'s', {
        get: function(){
            if (this['_'+type+'s'] === undefined) {
                this._checkRoomCache();
                this['_'+type+'s'] = []
                if (roomStructures[this.name][type]) {
                    for (let i = 0; i < roomStructures[this.name][type].length; i++) {
                        let obj = Game.getObjectById(roomStructures[this.name][type][i]);
                        if (obj) {
                            this['_'+type+'s'].push(obj);
                        }
                    }
                }
            }
            // this[type] = this['_'+type+'s']
            return this['_'+type+'s'];
        },
        set: function(){},
        enumerable: false,
        configurable: true,
    });
});

singleList.forEach(function(type){
    Object.defineProperty(Room.prototype, type, {
        get: function(){
            if (this['_'+type] === undefined) {
                this._checkRoomCache();
                if(roomStructures[this.name][type]) {
                    this['_'+type] =  Game.getObjectById(roomStructures[this.name][type][0]);
                }
            }
            // this[type] = this['_'+type]
            return this['_'+type];
        },
        set: function(){},
        enumerable: false,
        configurable: true,
    });
});
