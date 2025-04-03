import*as Data from './data.js';

const ECONOMY = ['struggling', 'poor', 'comfortable', 'wealthy', 'booming']
const MILITARY = ['pathetic', 'weak', 'capable', 'strong', 'mighty']
const POPULACE = ['rebellious', 'restive', 'resigned', 'content', 'exuberant']

const HUMANOIDS = 'Humanoid,Orc|Hobgoblin|Gnoll,Goblin|Kobold,Halfling,Ogre|Troll,Anthro,Lizardfolk|Merfolk,Dwarf|Gnome,Elf,Chimera/30,8,8,7,2,3,2,2,4,3'

const VALUES = {
  Good : "empathy,generosity,valor,trust,cooperation,love,Lawful,Neutral",
  Lawful : "truth,justice,discipline,loyalty,order,honor,Good,Neutral",
  Neutral : "knowledge,balance,advancement,independence,investment,fate,Lawful,Chaotic",
  Chaotic : "satisfaction,impulse,conflict,celebration,disruption,passion,Evil,Neutral",
  Evil : "ignorance,control,subjugation,greed,power,hatred,Chaotic,Neutral"
}

const RandomPeople = (RNG=chance,_form = null)=>{
  let form = RNG.weighted(['humanoid', 'animal', 'robotic'], [4, 2, 1])
  form = _form ? _form : form 

  let Animal = () => {
    let a = RNG.pickone(Data.Animals[RNG.weighted(['air', 'earth', 'water'],[3,7,2])])
    return _.capitalize(RNG.pickone(a.split("/")))
  }

  let type = '', body='';
  if (form == 'animal') {
    let n = RNG.weighted([1,2],[6,4])
    type = _.fromN(n,()=> Animal()).join("/")    
  } else if (form == 'robotic') {
    body = RNG.pickone(['Humanoid','Animal','Blocky','Spherical','Geometric','Trilateral','Radial','Asymmetrical','Swarm'])
    body = body == 'Animal' ? Animal() : body
    type = `Robot [${body}]`
  } else {
    //"Fighter,Ranger,Barbarian,Monk/5,4,2,2"
    type = RNG.pickone(RNG.weightedString(HUMANOIDS).split("|"))
    type = type == 'Anthro' ? Animal()+"-folk" : type == 'Chimera' ? [Animal(),Animal()].join("/")+" folk"  : type
  }

  let size = RNG.weighted(["tiny","small","medium","large","huge"],[1,2,6,2,1])
  size = ['Gnome','Goblin','Kobold','Halfling'].includes(type) ? "small" : ['Ogre','Troll'].includes(type) ? "large" : HUMANOIDS.includes(type) ? "medium" : size

  let text = form == 'robotic' ? `Robot [${body}, ${size}]` : type+(size!='medium' ? ` [${size}]`: "")
  
  return {
    seed : RNG.seed,
    form,
    type,
    size,
    text
  }
}

export {RandomPeople}
