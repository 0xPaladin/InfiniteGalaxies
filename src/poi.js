/*
  Feature generation 
*/
/*
  POI Class
*/
class POI {
  constructor(s, RNG, _place) {
    this.parent = s
    this._seed = RNG.seed
    this.where = CreatePOI.Location(s, RNG, _place)
    this.radius = 0
  }
  get _orbitalRadius() {
    return this.where.where._orbitalRadius
  }
  get whereText() {
    let w = this.where.where
    return w.name || w.text
  }
  onClick() {
    let app = this.parent.app
    let html = app.html
    //provide details 
    //build html to show 
    let text = html`
    <div class="bg-white br2 pa2">
      <div class="flex items-center justify-between">
        <span class="f4">${this.text || this.short}</span> 
      </div>
    </div>`
    app.galaxy._option = [['poiData', this], text]
    app.updateState("show", "Galaxy")
    console.log(this)
  }
  svg(svg, pG) {
    if (this.where.place != "Space") {
      return;
    }

    let p = this
    //data for svg display 
    let pad = this.parent.svgPad.find(_pad=>_pad[0] == this._seed)[1]
    let cx = pad - 10

    let spoi = svg.rect(10, 10).attr({
      x: cx,
      y: -5
    }).addClass('poi').fill('gray').transform({
      rotate: 45
    }).click(()=>p.onClick())
    //add to group 
    pG.add(spoi)
  }
}

/*
  Individual POI Creators 
*/
const CreatePOI = {
  Location(s, RNG, _place) {
    let data = {}
    //Pick something in space and place it in the system 
    let placeSpace = ()=>{
      let what = RNG.pickone(["Ship", "Wreck", "Asteroid", "Station"])
      let p = RNG.randBetween(5, 250) / 10

      return {
        what,
        _orbitalRadius: p,
        classification: "space",
        text: `${what}, ${p} AU`,
        HI: 4
      }
    }

    let _places = ["Space"]
    s.planets.length > 0 ? _places.push("Planet") : null
    s.moons.length > 0 ? _places.push("Moon") : null

    let place = data.place = _place || RNG.pickone(_places)
    let where = data.where = place == "Planet" ? RNG.pickone(s.planets) : place == "Moon" ? RNG.pickone(s.moons.length > 0 ? s.moons : s.planets) : placeSpace()

    let types = where.HI == 1 ? ["Settlement"] : ["Underground", "Dome", "Orbiting Station"]
    data.type = where.classification == "gas giant" ? RNG.pickone(["Cloud Station", "Orbiting Station"]) : place != "Space" ? RNG.pickone(types) : null

    return data
  },
  Outpost(s, RNG) {
    let type = RNG.pickone(['common', 'criminal', 'revolutionary', 'recreation', 'military', 'mercenary', 'religious', 'craft', 'trade', 'industrial', 'infrastructure', 'foreign', 'academic'])
    let state = RNG.weighted(['failing', 'nascent', 'stable', 'expanding', 'dominating'], [3, 2, 4, 2, 1])
    return {
      type,
      state
    }
  },
  raiders(s, RNG) {
    let data = new POI(s,RNG)
    let where = data.where.where
    //get who 
    let who = RNG.bool() ? "Independents" : RNG.pickone(s.galaxy.factions.filter(f=>f._eraType == "t")).name
    let state = RNG.weighted(['failing', 'nascent', 'stable', 'expanding', 'dominating'], [3, 2, 4, 2, 1])

    let short = `Raiders [${who}, ${state}]`
    let text = `${short}; ${where.name || where.text}`

    return Object.assign(data, {
      who,
      what: "Raiders",
      short,
      state,
      text
    })
  },
  hazard(s, RNG=chance) {
    let type = RNG.pickone(['unseen danger', 'ensnaring', 'defensive', 'impairing', 'difficult'])
    let data = {
      what: "Hazard",
      type
    }

    if (type == 'defensive') {
      data.f = s.faction ? s.faction : s.parent.pastFactions.length > 0 ? RNG.pickone(s.parent.pastFactions) : s.parent.closestFaction
    } else if (RNG.bool()) {
      data.type = RNG.pickone(["Black Hole", "Pulsar"])
    }

    data.short = `Hazard [${data.type}${type == 'defensive' ? ": " + data.f.name : ""}]`

    return Object.assign(new POI(s,RNG), data)
  },
  obstacle(s, RNG=chance) {
    let type = RNG.pickone(['defensive', 'impeniterable', 'difficult', 'hazardous'])
    let data = {
      what: "Obstacle",
      type
    }
    if (type == 'defensive') {
      data.f = s.faction ? s.faction : s.parent.pastFactions.length > 0 ? RNG.pickone(s.parent.pastFactions) : s.parent.closestFaction
    }

    data.short = `Obstacle [${type}${type == 'defensive' ? ": " + data.f.name : ""}]`

    return Object.assign(new POI(s,RNG), data)
  },
  Resource(s, RNG) {
    return {
      type: RNG.weighted(['Uncommon', 'Rare', 'Very Rare'], [3, 1.5, 0.5])
    }
  },
  site(s, RNG=chance) {
    let data = new POI(s,RNG)
    let what = data.what = RNG.weighted(['Ruin', 'Outpost', 'Creature', 'Resource', 'Landmark'], [2, 2, 1, 1, 0.5])

    if (what == 'Ruin') {
      data.f = s.parent.pastFactions.length > 0 ? RNG.pickone(s.parent.pastFactions.length) : s.parent.closestFaction
      data.type = RNG.weighted(['necropolis', 'temple', 'mine', 'military', 'settlement'], [1, 2, 2, 1, 4])
    }
    if (what == 'Outpost') {
      Object.assign(data, this.Outpost(s, RNG))
    }
    if (what == 'Creature') {
      data.type = RNG.weighted(['animal', 'robot'], [2, 1])
    }
    if (what == 'Resource') {
      Object.assign(data, this.Resource(s, RNG))
    }
    if (what == 'Landmark') {
      data.type = RNG.pickone(['Black Hole', 'Pulsar', 'Nebula'])
      data.where = this.Location(s, RNG, "Space")
    }

    data.short = `${what} [${data.type}${data.f ? ", " + data.f.name : ""}]`

    return data
  },
  settlement(s, RNG=chance) {
    //faction presence, link to faction - don't care about distance 
    let f = RNG.bool() ? RNG.pickone(s.parent.factions.length > 0 ? s.parent.factions : [s.parent.closestFaction]) : null
    let who = f ? f.name : "Independent"
    let {type, state} = this.Outpost(s, RNG)

    //check for HI 
    let HI = s.habitible
    let _where = this.Location(s, RNG)
    let where = HI[0].length > 0 ? RNG.pickone(HI[0]) : HI[1].length > 0 ? RNG.pickone(HI[1]) : _where
    where = !where.where ? {
      place: where.what,
      where,
      type: "Settlement"
    } : where

    return Object.assign(new POI(s,RNG), {
      f,
      who,
      what: 'Settlement',
      type,
      state,
      short: `Settlement [${who}, ${type}, ${state}]`,
      where
    })
  },
  faction(s, fs, RNG) {
    let {type, f, creator, ei, _i} = fs
    let isRuin = f == null ? true : false
    //claim it 
    s.claim = isRuin ? -1 : f.id

    let data = {
      f,
      what: type,
      creator,
      ei,
      isRuin,
    }

    //Orbital,Planet,Moon,Asteroid
    //['Outpost', 'Resource', 'Gate', 'Infrastructure']
    if ('Planet,Moon,Space'.includes(type)) {
      data.type = "Settlement"
      data.where = this.Location(s, RNG, type)
      let HI = s.habitible
      if(HI[0].length > 0 && type != "Space"){
        data.where.where = RNG.pickone(HI[0])
      }
      else if(HI[1].length > 0 && type != "Space"){
        data.where.where = RNG.pickone(HI[1])
      }
      data.what = data.where.where.what
    }
    if (type == 'Orbital') {
      data.type = RNG.weighted(["Orbital", "Shell World", "Gas Field", "Water Field", "Niven Ring", "Dyson Sphere"], [4, 2, 1, 1, 0.1, 0.1])
      data.where = this.Location(s, RNG, "Space")
    }
    if (type == 'Outpost') {
      Object.assign(data, this.Outpost(s, RNG))
      data.where = this.Location(s, RNG)
    }
    if (type == 'Resource') {
      Object.assign(data, this.Resource(s, RNG))
    }
    if (type == 'Gate') {
      data.type = "Gate"
      let _g = creator.gates.filter(g=>g._i != _i)
      data.destination = _g.length > 0 ? RNG.bool() ? _g : [RNG.pickone(_g)] : null
      data.where = this.Location(s, RNG)
    }
    if (type == 'Infrastructure') {
      data.type = RNG.pickone(["Power", "Communication", "Transportation", "Hazardous"])
      data.where = this.Location(s, RNG)
    }

    data.short = `${data.what} [${data.type}, ${creator.name}, ${creator.era} Era]`

    return Object.assign(new POI(s,RNG), data)
  }
}

export {CreatePOI}
