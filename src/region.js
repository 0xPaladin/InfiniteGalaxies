import {Ancients, CreateAncient} from './ancients.js';
import {RandomPeople} from './people.js';
import {Elements,Magic} from './data.js';

/*
  Factions
*/
const ALIGNMENTS = ['Evil', 'Chaotic', 'Neutral', 'Lawful', 'Good']
const ECONOMY = ['struggling', 'poor', 'comfortable', 'wealthy', 'booming']
const MILITARY = ['pathetic', 'weak', 'capable', 'strong', 'mighty']
const POPULACE = ['rebellious', 'restless', 'stable', 'content', 'exuberant']
const FACTIONTYPES = ['common', 'criminal', 'revolutionary', 'military', 'religious', 'craft', 'trade', 'industrial', 'academic', 'arcane']
const VALUES = {
  Good : "empathy,generosity,valor,trust,cooperation,love,Lawful,Neutral",
  Lawful : "truth,justice,discipline,loyalty,order,honor,Good,Neutral",
  Neutral : "knowledge,balance,advancement,independence,investment,fate,Lawful,Chaotic",
  Chaotic : "satisfaction,impulse,conflict,celebration,disruption,passion,Evil,Neutral",
  Evil : "ignorance,control,subjugation,greed,power,hatred,Chaotic,Neutral"
}
class Faction {
  constructor(R, opts = {}) {
    this.region = R
    this.seed = R.seed
    this.i = R.factions.length 
    
    let RNG = new Chance([R.seed,"faction",this.i].join("."))
    
    //lifeform and people 
    let form = this.form = opts.form || "ancient"
    let people = form == 'ancient' ? RNG.pickone(Ancients) : RNG.pickone(["Peoples",...R.thralls])
    this.people = opts.people || people

    this.alignment = form == "ancient" ? RNG.pickone(['Evil', 'Chaotic']) : RNG.weighted(ALIGNMENTS, [0, 2, 7, 2, 1])

    this.economy = RNG.weighted(ECONOMY, [1, 2, 6, 2, 1])
    this.military = RNG.weighted(MILITARY, [1, 2, 6, 2, 1])
    this.populace = RNG.weighted(POPULACE, [1, 2, 6, 2, 1])

    this.values = BuildArray(2,()=>{
      let val = RNG.pickone(VALUES[this.alignment].split(","))
      return VALUES[val] ? VALUES[val].split(",")[RNG.d10()-1] : val 
    })

    let tech = RNG.shuffle(["Standard","Organic","Arcane"])
    this.tech = tech.slice(0,RNG.pickone([1,2])).join("/")
    this.style = RNG.pickone(["Fluid","Rough","Blocky","Gothic",""])

    this.type = RNG.pickone(FACTIONTYPES)

    //create the standard people of the region 
    this.thralls = form == 'ancient' ? BuildArray(3,()=> RandomPeople(RNG)) : []
  }
  get about() {
    return [this.alignment.toLowerCase(), "$ " + this.economy, "⚔ " + this.military, "☺ " + this.populace]
  }
  setGoals (RNG) {
    let R = this.region
    //current goals
    let _ancients = R.factions.filter(f=>f.form == 'ancient')
    let resources = R.features.filter(f=>f.type == 'resource').map(f=>f.resource).concat(R._resource)
    let _creatures = R.features.filter(f=>f.what == 'creature')
    let foes = this.form == 'people' ? _ancients : _ancients.filter(f=> f.people != this.people )
    const GOALS = ['Oppose','Hunt','Spy On/Sabotage','Hold Territory','Expand Territory','Establish Outpost','Exploit','Maintain Trade','Seek Knowledge']
    this.goals = RNG.shuffle(GOALS).slice(0,2).map(g=> {
      let what = null 
      
      if(['Oppose','Spy On/Sabotage'].includes(g)){
        g = RNG.pickone(g.split("/"))
        what = RNG.pickone(foes.map(f=>f.people))
      }
      else if (g=='Exploit'){
        what = RNG.pickone(resources)
      }
      else if (g=='Hunt'){
        what = R.ancient.people == this.people ? RNG.pickone(_creatures.filter(c=> ["wild","sport"].includes(c.purpose)).map(c=>c.data.type)) : RNG.pickone(_creatures.map(c=>c.data.type))
      }
      
      return {
        goal : g,
        clock : RNG.pickone([8,10,12]),
        what
      }
    })
  }
}

/*
  Regions 
*/
//"islands", "costal", "lake", "barren", "wetland", "woodland", "lowlands","highlands","standard"
const ByTerrain = {
  "island": ['Sea', 'Islands', 'Sound'],
  "coast": ['Sea', 'Bay', 'Downs', 'Reach', 'Slough', 'Sound'],
  "lake": ['Lake'],
  "barren": ['Bluffs', 'Desert', 'Dunes', 'Expanse', 'Flats', 'Foothills', 'Hills', 'Plains', 'Range', 'Sands', 'Savanna', 'Scarps', 'Steppe', 'Sweep', 'Upland', 'Waste', 'Wasteland'],
  "wetland": ['Bog', 'Fen', 'Heath', 'Lowland', 'Marsh', 'Moor', 'Morass', 'Quagmire', 'Slough', 'Swamp', 'Thicket', 'Waste', 'Wasteland', 'Woods'],
  "woodland": ['Expanse', 'Forest', 'Groves', 'Hollows', 'Jungle', 'March', 'Thicket', 'Woods'],
  "lowlands": ['Expanse', 'Fells', 'Flats', 'Heath', 'Lowland', 'March', 'Meadows', 'Moor', 'Plains', 'Prairie', 'Savanna', 'Steppe', 'Sweep'],
  "highlands": ['Cliffs', 'Expanse', 'Foothills', 'Heights', 'Mountains', 'Peaks', 'Range', 'Reach', 'Scarps', 'Steppe', 'Teeth', 'Upland', 'Wall'],
  "hills": ['Bluffs', 'Downs', 'Foothills', 'Hills', 'Mounds', 'Scarps', 'Steppe', 'Sweep'],
}
const RegionAdjective = {
  "base": ['Ageless', 'Ashen', 'Blue', 'Broken', 'Burning', 'Cold', 'Deadly', 'Deep', 'Desolate', 'Dim', 'Dun', 'Endless', 'Far', 'Flaming', 'Forgotten', 'Frozen', 'Green', 'Grim', 'Impassable', 'Jagged', 'Long', 'Misty', 'Perilous', 'Purple', 'Red', 'Shattered', 'Shifting', 'Yellow'],
  "good": ['Blessed', 'Diamond', 'Glittering', 'Golden', 'Holy', 'Light', 'Shining', 'Silver', 'White'],
  "evil": ['Black', 'Blighted', 'Cursed', 'Dark', 'Dead', 'Dismal', 'Eerie', 'Fallen', 'Fell', 'Forsaken', 'Savage', 'Shadowy', 'Wicked']
}
const RegionNoun = {
  "base": ['Ash', 'Dragon', 'Fate', 'Fire', 'Ghost', 'Giant', 'King', 'Lord', 'Mist', 'Peril', 'Queen', 'Rain', 'Sky', 'Smoke', 'Snake', 'Storm', 'Thorn', 'Thunder', 'Victory'],
  "good": ['Gold', 'Heaven', 'Honor', 'Hope', 'Life', 'Light', 'Refuge', 'Savior', 'Silver', 'Sun'],
  "evil": ['Bone', 'Darkness', 'Dead', 'Death', 'Desolation', 'Despair', 'Devil', 'Doom', 'Fear', 'Fury', 'Hell', 'Horror', 'Regret', 'Shadow', 'Skull', 'Sorrow', 'Traitor', 'Troll', 'Witch'],
}
const RegionForms = ["(The) .adj. .t", "t. of (the) .noun", "(The) .noun. .t", "(The) .noun.'s .adj. .t", "adj. .t. of (the) .noun"]

const RegionName = (R,RNG)=>{
  let terrain = R.terrain
  let water = R.water == 'archipelago' ? 'island' : ['bay', 'peninsula'].includes(R.water) ? 'coast' : R.water == 'land' ? "" : R.water
  let t = water.length > 0 ? ByTerrain[terrain].concat(ByTerrain[water]) : ByTerrain[terrain]

  //adjectives based on alignment 
  let adj = RegionAdjective.base.concat(RegionAdjective.evil)
  //nouns based on alignment
  let noun = RegionNoun.base.concat(RegionNoun.evil)

  let _name = {
    t: RNG.pickone(ByTerrain[terrain]),
    adj: RNG.pickone(adj),
    noun: RNG.pickone(noun)
  }

  let form = RNG.weighted(RegionForms, [4, 3, 2, 1, 1])
  return form.split(".").map(w=>_name[w] || w).join("")
}

const FEATURES = {
  'creature'(R) {
    let i = R.features.length
    let RNG = new Chance([R.seed,'feature',i].join("."))
    let animal = RandomPeople(RNG,'animal')
    let purpose = RNG.weighted(['wild','sport','livestock','military','industrial','labor'],[3,1,1,1,1,1])
    
    let data = {
      i,
      'what' : 'creature',
      purpose,
      data : animal,
      text : `${animal.type} [${animal.size}, ${purpose}]`
    }
    return data 
  },
  'hazard'(R) {
    let i = R.features.length
    let RNG = new Chance([R.seed,'feature',i].join("."))

    let mp = RNG.pickone(RNG.pickone([...Elements,...Magic]).split("/"))
    let type = RNG.weighted([`magical [${mp}]`,'techtonic','chasm,crevasse,abyss,rift','bog,mire,tarpit,quicksand','defensive trap','blizzard,thunderstorm,sandstorm','fire,flood,avalanche','mist,fog,murk,gloom,miasma'],[1,1,2,2,1,3,1,1])
    type = RNG.pickone(type.split(","))
    
    let data = {
      i,
      'what' : 'hazard',
      type,
      text: `Hazard: ${type}`
    }
    return data 
  },
  'obstacle'(R) {
    let i = R.features.length
    let RNG = new Chance([R.seed,'feature',i].join("."))

    let mp = RNG.pickone(RNG.pickone([...Elements,...Magic]).split("/"))
    let type = RNG.weighted([`magical [${mp}]`,'defensive barrier','cliff,escarpment,crag,bluff','dense forest,bog,swamp','river,ravine,crevasse,chasm,abyss'],[1,2,3,3,3])
    type = RNG.pickone(type.split(","))
    
    let data = {
      i,
      'what' : 'obstacle',
      type,
      text: `Obstacle: ${type}`
    }
    return data 
  },
  'area'(R) {
    let i = R.features.length
    let RNG = new Chance([R.seed,'feature',i].join("."))

    let mp = RNG.pickone(RNG.pickone([...Elements,...Magic]).split("/"))
    let h = this.hazard(R)
    let o = this.obstacle(R)
    let type = RNG.weighted([`magical [${mp}]`,h.type,o.type,'territory','icefield,rocky land,dense forest,bog,swamp'],[1,2,2,3,4])
    type = RNG.pickone(type.split(","))
    
    let data = {
      i,
      'what' : 'area',
      type,
      'territory' : RNG.random(),
      get text () {
        let ci = Math.floor(R._feature.Creatures.length*this.territory)
        return  this.type == 'territory' ? `Area: ${R._feature.Creatures[ci].data.type} territory` : `Area: ${type}`
      }
    }
    return data 
  },
  'ruin'(RNG) {
    
  },
  'site'(R) {
    let i = R.features.length
    let RNG = new Chance([R.seed,'feature',i].join("."))
    let type = RNG.weighted(['ruin','dwelling','outpost','landmark','resource'],[3,2,1,1,2])
    let data = {
      i,
      'what' : 'site',
      type,
      text : `${type.capitalize()}`
    }

    if(type == 'ruin'){
      data[type] = RNG.pickone(['Caverns','Ruined Settlement','Prison','Mine','Tomb','Hideout','Stronghold','Temple','Archive','Laboratory','Gate'])
      data.ancient = RNG.weighted([R.ancient.people,R.predecessor.people],[1,4])
      data.text += ` [${data.ancient}, ${data[type]}]`
    }
    else if(type == 'dwelling'){
      data[type] = RNG.pickone(FACTIONTYPES)
      data.who = RNG.pickone([...R.thralls.map(t=>t.type),R.ancient.people])
      data.text += ` [${data.who}, ${data[type]}]`
    }
    else if(type == 'outpost'){
      data[type] = RNG.pickone(RNG.pickone(['tollhouse/checkpoint','trading house','inn','tower/fort/base']).split("/"))
      data.text += ` [${data[type]}]`
    }
    else if(type == 'landmark'){
      let _faction = RNG.weighted([R.ancient.people,R.predecessor.people],[3,1])
      data[type] = RNG.weighted(['Plant/Tree','Rock/Earth','Water',_faction,'Statue'],[3,3,2,1,2])
      data.text += ` [${data[type]}]`
    }
    else if(type == 'resource'){
      data[type] = RNG.pickone(R._resource)
      data.text += ` [${data[type]}]`
    }
    
    return data 
  },
  'faction'(R) {
    let i = R.features.length
    let RNG = new Chance([R.seed,'feature',i].join("."))
    let data = {
      i,
      'what' : 'factionOutpost',
      text: `Faction Outpost`
    }
    return data 
  },
  'settlement'(R) {
    let i = R.features.length
    let RNG = new Chance([R.seed,'feature',i].join("."))
    let data = {
      i,
      'what' : 'settlement',
      text: `Settlement`
    }
    return data 
  },
}

class Region {
  constructor(G, opts = {}) {
    this.app = G.app
    this.galaxy = G 
    this._sector = opts.sector || G._sector
    this._seed = opts.seed || chance.natural() 
    
    this.seed = [G.seed,this._sector,this._seed].join(".")
    let RNG = new Chance(this.seed)

    this.factions = []
    
    //base on sector factions 
    let a = RNG.shuffle(this.sector._ancients)
    let atiers = RNG.shuffle([1,2,3,4,1,2,3]).slice(0,2)
    //create the controlling ancient 
    this.factions.push(new Faction(this,{people:a[0]})) //current
    this.ancient.tier = 4
    //predecessor
    this.factions.push(new Faction(this)) 
    this.predecessor.tier = atiers[0]
    //usurper
    this.factions.push(new Faction(this,{people:a[1]})) //usurper 
    this.usurper.tier = atiers[1]

    //handle remaining faction
    let fi = [['a','e','n','t'],['a','e','n','t'],['a','e','n','t'],['t','e']]
    //remove used tiers 
    atiers.forEach(ti => fi[ti-1].splice(1,1))
    //assign factions 
    let _ancients = this.factions.map(f=>f.people)
    fi.forEach((_fi,i) => _fi.forEach(w=> {
      w = w=='n' ? RNG.pickone(['t','e']) : w 
      
      let opts = {}
      opts.people = w == 'a' ? _ancients[0] : w=='e' ? RNG.pickone(_ancients) : null
      opts.form = ['a','e'].includes(w) ? 'ancient' : 'people'

      let nF = new Faction(this,opts)
      nF.tier = i+1
      this.factions.push(nF)
    }))

    let alignment = this.alignment 
    let sR = RNG.d12() + (alignment == "chaotic" ? 5 : 3)
    let safety = this.safety = sR < 10 ? "dangerous" : "perilous"
    let safe = safety == "perilous" ? 0 : 1

    this.climate = RNG.weighted(['frigid', 'temperate', 'torrid'], [2, 8, 2])
    this.terrain = RNG.weighted(['highlands', 'hills', 'woodland', 'wetland', 'lowlands', 'barren'], [2, 2, 3, 1, 3, 1])

    this.water = RNG.weighted(['land', 'lake', 'coast', 'bay', 'peninsula', 'island', 'archipelago'], [2, 3, 2, 1, 1, 0.5, 0.5])

    this.name = RegionName(this, RNG)

    //resources 
    this._resource = BuildArray(2,()=> RNG.weighted(['rare earth elements','quantum materials','hyper materials'],[6,3,1]))

    //size 
    const SIZE = ['large', 'expansive', 'vast']
    let size = 0 // RNG.weighted([0, 1, 2], [9, 2, 1])
    this.size = SIZE[size]
    this._travel = SumDice(['1d6+9', '4d6+10', '6d6+24'][size], RNG)
    let nF = SumDice(['2d8+9', '3d10+10', '4d12+12'][size], RNG)

    let fbc = this._features ={
      'Creatures' : [],
      'Areas' : [],
      'Sites' : []
    }
    let _feature = (r)=>r <= 3 ? 'creature' : r == 4 ? 'hazard' : r == 5 ? 'obstacle' : r == 6 ? 'area' : r <= 12 ? 'site' : 'settlement'
    BuildArray(nF, ()=> {
      //first is creature 
      let f = this.features.length == 0 ? _feature(1) : _feature(RNG.d12() + safe)
      let what = f=='creature' ? fbc.Creatures : ['hazard','obstacle','area'].includes(f) ? fbc.Areas : fbc.Sites
      what.push(FEATURES[f](this))
    })

    //set goals
    this.factions.forEach(f=>f.setGoals(RNG))

    //perilous shores data 
    this._perilous = {
      seed : RNG.natural(),
      tags : [this.alignment,this.safety,this.terrain,this.water]
    }

    console.log(this)
  }
  get perilousShores () {
    let p = this._perilous
    return `https://watabou.github.io/perilous-shores/?seed=${p.seed}&tags=${p.tags.join(",")}&w=1800&h=1800&hexes=1`
  }
  get alignment () {
    return this.ancient.alignment.toLowerCase()
  }
  get predecessor () {
    return this.factions[1]
  }
  get ancient () {
    return this.factions[0]
  }
  get usurper () {
    return this.factions[2]
  }
  get thralls () {
    return this.ancient.thralls
  }
  get sector () {
    return this.galaxy.sector
  }
  get features () {
    return Object.values(this._features).flat()
  }
}

export {Region}
