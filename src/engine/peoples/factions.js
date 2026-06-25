import *as Data from '../constants/data.js';

/*
  Factions
*/
const ALIGNMENTS = ['Evil', 'Chaotic', 'Neutral', 'Lawful', 'Good']
const ECONOMY = ['struggling', 'poor', 'comfortable', 'wealthy', 'booming']
const MILITARY = ['pathetic', 'weak', 'capable', 'strong', 'mighty']
const POPULACE = ['rebellious', 'restless', 'stable', 'content', 'exuberant']
const FACTIONTYPES = ['common', 'criminal', 'revolutionary', 'military', 'religious', 'craft', 'trade', 'industrial', 'academic', 'arcane']
const VALUES = {
  Good: "empathy,generosity,valor,trust,cooperation,love,Lawful,Neutral",
  Lawful: "truth,justice,discipline,loyalty,order,honor,Good,Neutral",
  Neutral: "knowledge,balance,advancement,independence,investment,fate,Lawful,Chaotic",
  Chaotic: "satisfaction,impulse,conflict,celebration,disruption,passion,Evil,Neutral",
  Evil: "ignorance,control,subjugation,greed,power,hatred,Chaotic,Neutral"
}

class Faction {
  constructor(parent, opts = {}) {
    this.what = "Faction";

    this.opts = opts;
    this.parent = parent;
    this._culture = opts.culture !== undefined ? opts.culture : -1;
    this.era = opts.era || 0;

    this.seed = opts.seed || chance.natural();
    let RNG = new Chance([parent.seed, "faction", this.seed].join(":"));

    this.people = RNG.pickone(["Humanoid", "Animal", "Artificial", "Alien"]);

    this.type = RNG.pickone(FACTIONTYPES);

    this.alignment = RNG.weighted(ALIGNMENTS, [2, 3, 6, 3, 2]);
    this.alignment = opts.alignment || this.alignment;

    let color = RNG.pickone(Data.GasGiantColors);
    this.color = opts.color ? opts.color : color;

    let t = this.tier = opts.tier || 1;

    //set stats and goals 
    this._stats = RNG.shuffle(t == 1 ? [1, 1, 0] : t == 2 ? [2, 1, 0] : [t, RNG.shuffle([t - 1, t - 2, t - 2, t - 3])].flat()).slice(0, 3);
    this.populace = RNG.weighted(POPULACE, [1, 2, 6, 2, 1])
    this.values = RNG.shuffle(VALUES[this.alignment].split(",")).slice(0, 2).map(v => {
      return VALUES[v] ? VALUES[v].split(",")[RNG.d6() - 1] : v
    }
    )

    let tech = RNG.shuffle(["Standard", "Organic", "Arcane"]);
    this.tech = tech.slice(0, RNG.pickone([1, 2])).join("/");
    this.style = RNG.pickone(["Fluid", "Rough", "Blocky", "Gothic", ""]);

    let techLevel = RNG.weighted([0, "1d6", "2d6", "3d6"], [5, 6, 2, 1]);
    techLevel = techLevel === 0 ? 0 : RNG.sumDice(techLevel);
    this.techLevel = 4 + techLevel / 10;

    this.FTL = RNG.pickone(["Terrestrial Gates", "Space Gates", "Jump Drive", "Warp", "Hyperspace"]);
  }
  get name() {
    return this.opts.name || this.type;
  }
  get about() {
    let s = this.stats
    return [this.alignment.toLowerCase(), "$ " + ECONOMY[s.Wealth], "⚔ " + MILITARY[s.Force], "☺ " + this.populace]
  }
  get stats() {
    return _.fromEntries(["Force", "Cunning", "Wealth"].map((s, i) => [s, this._stats[i]]))
  }
  get culture() {
    return this._culture !== -1 ? this.parent.cultures[this._culture] : null;
  }
  setGoals(RNG) {
    const GOALS = ['Oppose', 'Spy On/Sabotage/Infiltrate', 'Hold Territory', 'Expand Territory', 'Establish Outpost', 'Exploit Resources', 'Maintain Trade', 'Seek Knowledge']

    this.goals = RNG.shuffle(GOALS).slice(0, 2).map(g => {
      let hasT = ['Oppose', 'Spy On/Sabotage/Infiltrate'].includes(g)
      g = RNG.pickone(g.split("/"))

      return {
        goal: g,
        clock: 8
      }
    }
    )
  }
}

export { Faction }
